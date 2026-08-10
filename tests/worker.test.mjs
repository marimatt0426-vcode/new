import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../worker/worker.js", import.meta.url), "utf8");
const moduleUrl = "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const { default: worker } = await import(moduleUrl);

function validService(overrides = {}) {
  return {
    schemaVersion: "cloudflare-widget.v3",
    requestId: "req-test-1",
    eventId: "req-test-1:service_requested",
    stage: "service_requested",
    intent: "service_request",
    zip: "46032",
    dogs: "2",
    frequency: "Weekly",
    frequencyId: "weekly",
    areas: "Back yard",
    areaIds: ["back"],
    yardSize: "Up to ⅛ acre",
    yardSizeId: "s",
    lastCleaned: "Within 1 week",
    startTiming: "As soon as possible",
    perVisitPrice: "22.49",
    clientPriceCents: 2249,
    pricingVersion: "2026-08-cloudflare-v1",
    customEstimate: false,
    customReasons: [],
    phone: "3175550123",
    firstName: "Jamie",
    lastName: "Smith",
    email: "",
    street: "123 Main St",
    city: "Carmel",
    state: "IN",
    preferredContact: "text",
    smsTransactionalConsent: true,
    consentVersion: "service-sms-2026-08-v1",
    smsConsentCapturedAt: "2026-08-01T12:00:00.000Z",
    termsAccepted: true,
    termsVersion: "2025-12-27",
    termsAcceptedAt: "2026-08-01T12:00:01.000Z",
    question: "",
    notes: "Submitted through transparent-price Cloudflare widget.",
    page: "https://itspurgepros.com/",
    submittedAt: "2026-08-01T12:00:02.000Z",
    website: "",
    ...overrides
  };
}

async function submit(payload) {
  const previousFetch = globalThis.fetch;
  const forwarded = [];
  globalThis.fetch = async (url, options = {}) => {
    forwarded.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
    return new Response(null, { status: 204 });
  };
  try {
    const request = new Request("https://relay.example/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Origin": "https://itspurgepros.com" },
      body: JSON.stringify(payload)
    });
    const pending = [];
    const response = await worker.fetch(request, {
      GHL_WEBHOOK_URL: "https://ghl.example/inbound",
      ALLOWED_ORIGINS: "https://itspurgepros.com,https://www.itspurgepros.com"
    }, { waitUntil(promise) { pending.push(promise); } });
    await Promise.allSettled(pending);
    return { response, body: await response.json(), forwarded };
  } finally {
    globalThis.fetch = previousFetch;
  }
}

test("accepts a valid service request and recalculates price server-side", async () => {
  const result = await submit(validService());
  assert.equal(result.response.status, 202);
  assert.equal(result.body.accepted, true);
  assert.equal(result.forwarded.length, 1);
  assert.equal(result.forwarded[0].body.serverPriceCents, 2249);
  assert.equal(result.forwarded[0].body.smsTransactionalConsent, true);
  assert.equal(result.forwarded[0].body.source, "purge-pros-cloudflare-widget");
  assert.equal(result.forwarded[0].body.serviceAddress, "123 Main St, Carmel, IN 46032");
  assert.match(result.forwarded[0].body.quoteSummary, /Price: \$22\.49 per visit/);
  assert.match(result.forwarded[0].body.quoteSummary, /Service address: 123 Main St, Carmel, IN 46032/);
  assert.match(result.forwarded[0].body.quoteSummary, /Request ID: req-test-1/);
});

test("rejects a client-tampered price before GHL", async () => {
  const result = await submit(validService({ clientPriceCents: 99 }));
  assert.equal(result.response.status, 400);
  assert.equal(result.body.accepted, false);
  assert.ok(result.body.fields.includes("clientPriceCents"));
  assert.equal(result.forwarded.length, 0);
});

test("requires service-text consent when Text is selected", async () => {
  const result = await submit(validService({ smsTransactionalConsent: false, consentVersion: "" }));
  assert.equal(result.response.status, 400);
  assert.ok(result.body.fields.includes("smsTransactionalConsent"));
  assert.equal(result.forwarded.length, 0);
});

test("allows Email preference without collecting a phone number", async () => {
  const result = await submit(validService({
    preferredContact: "email",
    phone: "",
    email: "jamie@example.com",
    smsTransactionalConsent: false,
    consentVersion: "",
    smsConsentCapturedAt: ""
  }));
  assert.equal(result.response.status, 202);
  assert.equal(result.forwarded[0].body.phone, "");
  assert.equal(result.forwarded[0].body.email, "jamie@example.com");
  assert.equal(result.forwarded[0].body.smsTransactionalConsent, false);
});

test("rejects an out-of-area ZIP without forwarding contact data", async () => {
  const result = await submit(validService({ zip: "85701" }));
  assert.equal(result.response.status, 400);
  assert.ok(result.body.fields.includes("zip"));
  assert.equal(result.forwarded.length, 0);
});

test("accepts a price-copy request as quote_requested, not a service conversion", async () => {
  const result = await submit(validService({
    stage: "quote_requested",
    eventId: "req-test-1:quote_requested",
    intent: "quote_delivery",
    lastName: "",
    street: "",
    city: "",
    startTiming: "",
    termsAccepted: false,
    termsVersion: "",
    termsAcceptedAt: "",
    question: "Quote delivery requested by text."
  }));
  assert.equal(result.response.status, 202);
  assert.equal(result.forwarded[0].body.stage, "quote_requested");
  assert.equal(result.forwarded[0].body.intent, "quote_delivery");
});

test("rejects a recurring frequency that is disabled for the dog count", async () => {
  const result = await submit(validService({
    dogs: "6",
    clientPriceCents: 0
  }));
  assert.equal(result.response.status, 400);
  assert.equal(result.forwarded.length, 0);
});

test("accepts an intentional custom booking without inventing a price", async () => {
  const result = await submit(validService({
    stage: "estimate_requested",
    eventId: "req-test-1:estimate_requested",
    dogs: "10",
    frequencyId: "custom",
    clientPriceCents: null,
    perVisitPrice: "",
    customEstimate: true,
    customReasons: ["CUSTOM_BOOKING_SELECTED", "DOG_COUNT_10_PLUS"]
  }));
  assert.equal(result.response.status, 202);
  assert.equal(result.forwarded[0].body.stage, "estimate_requested");
  assert.equal(result.forwarded[0].body.customEstimate, true);
  assert.equal(result.forwarded[0].body.frequencyId, "custom");
  assert.deepEqual(result.forwarded[0].body.customReasons, ["CUSTOM_BOOKING_SELECTED", "DOG_COUNT_10_PLUS"]);
});

test("keeps one-time cleanup available for 10+ dogs on a published yard size", async () => {
  const result = await submit(validService({
    dogs: "10",
    frequencyId: "onetime",
    clientPriceCents: 8999
  }));
  assert.equal(result.response.status, 202);
  assert.equal(result.forwarded[0].body.customEstimate, false);
  assert.equal(result.forwarded[0].body.serverPriceCents, 8999);
});
