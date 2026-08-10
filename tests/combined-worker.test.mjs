import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../dist/purge-pros-quote-v3.worker.js", import.meta.url), "utf8");
const moduleUrl = "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const { default: worker } = await import(moduleUrl);

function validService() {
  return {
    schemaVersion: "cloudflare-widget.v3",
    requestId: "req-combined-1",
    eventId: "req-combined-1:service_requested",
    stage: "service_requested",
    intent: "service_request",
    zip: "46032",
    dogs: "2",
    frequencyId: "weekly",
    areaIds: ["back"],
    yardSizeId: "s",
    lastCleaned: "Within 1 week",
    startTiming: "As soon as possible",
    clientPriceCents: 2249,
    pricingVersion: "2026-08-cloudflare-v1",
    customEstimate: false,
    firstName: "Jamie",
    lastName: "Smith",
    phone: "3175550123",
    email: "",
    street: "123 Main St",
    city: "Carmel",
    preferredContact: "text",
    smsTransactionalConsent: true,
    consentVersion: "service-sms-2026-08-v1",
    smsConsentCapturedAt: "2026-08-01T12:00:00.000Z",
    termsAccepted: true,
    termsVersion: "2025-12-27",
    termsAcceptedAt: "2026-08-01T12:00:01.000Z",
    question: "",
    page: "https://itspurgepros.com/",
    submittedAt: "2026-08-01T12:00:02.000Z",
    website: ""
  };
}

async function post(path, payload, env = {}) {
  const previousFetch = globalThis.fetch;
  const forwarded = [];
  globalThis.fetch = async (url, options = {}) => {
    forwarded.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
    return new Response(null, { status: 204 });
  };
  try {
    const response = await worker.fetch(new Request("https://purge-lead-relay.purgepros.workers.dev" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Origin": "https://itspurgepros.com" },
      body: JSON.stringify(payload)
    }), {
      GHL_WEBHOOK_URL: "https://ghl.example/legacy",
      GHL_WEBHOOK_URL_V3: "https://ghl.example/v3",
      ...env
    }, { waitUntil() {} });
    return { response, body: await response.json(), forwarded };
  } finally {
    globalThis.fetch = previousFetch;
  }
}

test("combined Worker injects its own submission and review URLs", async () => {
  const response = await worker.fetch(
    new Request("https://purge-pros-quote-v3.example/purge-quote.js"),
    {},
    { waitUntil() {} }
  );
  const script = await response.text();
  assert.equal(response.status, 200);
  assert.match(script, /leadEndpoint: "https:\/\/purge-pros-quote-v3\.example\/submit"/);
  assert.match(script, /reviewsEndpoint: "https:\/\/purge-pros-quote-v3\.example\/reviews"/);
  assert.match(script, /googleAdsSendTo: "AW-17767139897\/g9smCM7pkL4cELmUhJhC"/);
  assert.doesNotMatch(script, /vX_bCO_4kL4cELmUhJhC/);
  assert.doesNotMatch(script, /purge-lead-relay/);
});

test("combined Worker can change or disable the promotion with dashboard variables", async () => {
  const response = await worker.fetch(
    new Request("https://purge-pros-quote-v3.example/purge-quote.js"),
    { PROMO_ENABLED: "false", PROMO_TITLE: "Summer yard offer" },
    { waitUntil() {} }
  );
  const script = await response.text();
  assert.match(script, /Object\.assign\(window\.PurgeProsQuote\.config\.promotion/);
  assert.match(script, /"enabled":false/);
  assert.match(script, /"title":"Summer yard offer"/);
});

test("combined Worker rejects old widget payloads", async () => {
  const result = await post("/submit", { stage: "phone_captured", phone: "3175550123" });
  assert.equal(result.response.status, 400);
  assert.equal(result.body.message, "Unsupported widget version");
  assert.equal(result.forwarded.length, 0);
});

test("combined Worker preserves the current widget at POST root and current webhook", async () => {
  const result = await post("/", { stage: "phone_captured", phone: "3175550123" });
  assert.equal(result.response.status, 202);
  assert.equal(result.forwarded[0].url, "https://ghl.example/legacy");
  assert.equal(result.forwarded[0].body.source, "purge-quote-widget-legacy");
});

test("combined Worker sends v3 submissions only to the new v3 webhook", async () => {
  const result = await post("/submit", validService());
  assert.equal(result.response.status, 202);
  assert.equal(result.forwarded[0].url, "https://ghl.example/v3");
  assert.equal(result.forwarded[0].body.source, "purge-pros-cloudflare-widget");
  assert.equal(result.forwarded[0].body.serverPriceCents, 2249);
});
