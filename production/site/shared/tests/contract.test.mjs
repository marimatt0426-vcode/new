// Contract test.
// Engine-built payloads are pushed through the Worker's REAL validation code
// (validateV3, cut from the live source, not rewritten) for every intent and
// reply method, and must be accepted. Then fields are broken one at a time:
// the Worker must reject each, and the engine's own validation must have
// caught the same thing before anything was sent.
import test from "node:test";
import assert from "node:assert/strict";
import { core, makeStore, fillPlan, fillDetails, readyStore } from "./helpers/make-store.mjs";
import { worker, workerText, fakeRequest, plain } from "./helpers/live-source.mjs";
import { TERMS_VERSION } from "./helpers/terms-version.mjs";

const INTENTS = ["service_request", "quote_delivery", "question"];
const CONTACTS = ["text", "email", "call"];

// The exact keys of the live payload, in the live order (spec 12.2).
const LIVE_PAYLOAD_KEYS = [
  "schemaVersion", "requestId", "eventId", "stage", "intent", "zip", "dogs", "frequency", "frequencyId", "areas", "areaIds",
  "yardSize", "yardSizeId", "lastCleaned", "customerStatus", "startTiming", "perVisitPrice", "clientPriceCents", "pricingVersion",
  "customEstimate", "customReasons", "phone", "phoneE164", "firstName", "lastName", "email", "street", "city", "state",
  "preferredContact", "smsTransactionalConsent", "consent", "consentVersion", "smsConsentCapturedAt", "termsAccepted",
  "termsVersion", "termsAcceptedAt", "question", "notes", "page", "attribution", "gclid", "fbclid", "fbp", "fbc", "submittedAt", "website"
];

const PLANS = {
  "recurring, priced": { dogCount: "2", zip: "46032", yardSize: "m", areas: ["back", "front"], frequency: "weekly" },
  "recurring, largest": { dogCount: "9", zip: "46280", yardSize: "xl", areas: ["back", "front", "side"], frequency: "twice" },
  "one-time": { dogCount: "3", zip: "46140", yardSize: "l", areas: ["back"], frequency: "onetime" },
  "one-time, 10+ dogs": { dogCount: "10", zip: "46123", yardSize: "s", areas: ["side"], frequency: "onetime" },
  "custom, chosen by hand": { dogCount: "3", zip: "46074", yardSize: "s", areas: ["back"], frequency: "custom" },
  "custom, 10+ dogs": { dogCount: "10", zip: "46168", yardSize: "m", areas: ["back", "front"], frequency: "custom" },
  "custom, over 1 acre": { dogCount: "2", zip: "46077", yardSize: "over", areas: ["back", "side"], frequency: "custom" }
};

function expectedStage(intent, custom) {
  if (intent === "question") return "question_submitted";
  if (intent === "quote_delivery") return "quote_requested";
  return custom ? "estimate_requested" : "service_requested";
}

function built(store, intent) {
  const result = store.buildPayload(intent);
  assert.equal(result.ok, true, "engine refused to build: " + JSON.stringify(result.errors));
  return result.payload;
}

test("every intent x reply method x plan: the Worker's own validateV3 accepts the engine's payload", () => {
  let accepted = 0;
  for (const [planName, plan] of Object.entries(PLANS)) {
    const custom = plan.frequency === "custom";
    for (const intent of INTENTS) {
      for (const contact of CONTACTS) {
        const label = [planName, intent, contact].join(" / ");
        const { store } = makeStore({ url: "https://itspurgepros.com/carmel?utm_source=meta&utm_campaign=fall&fbclid=abc123" });
        fillPlan(store, plan);
        // The engine does not offer these two combinations at all (spec 4.3.2, 12.7).
        const notOffered = (custom && intent !== "service_request") || (intent === "quote_delivery" && contact === "call");
        fillDetails(store, intent, contact);
        if (notOffered) {
          const refused = store.buildPayload(intent);
          assert.equal(refused.ok, false, label + " must not be offered");
          continue;
        }
        const payload = built(store, intent);

        // 1. Accepted by the Worker's own code, with no error fields.
        const verdict = worker.validateV3(payload);
        assert.deepEqual(plain(verdict.errors), [], label + " rejected by the Worker");
        assert.equal(verdict.ok, true, label);

        // 2. Exactly the live payload's keys, in the live order. Nothing extra.
        assert.deepEqual(Object.keys(payload), LIVE_PAYLOAD_KEYS, label);

        // 3. Versions, stage and event id.
        assert.equal(payload.schemaVersion, worker.SCHEMA_VERSION);
        assert.equal(payload.pricingVersion, worker.PRICING_VERSION);
        assert.equal(payload.stage, expectedStage(intent, custom), label);
        assert.equal(payload.stage, verdict.values.expectedStage, label);
        assert.equal(payload.eventId, payload.requestId + ":" + payload.stage, label);
        assert.equal(payload.intent, intent);

        // 4. The price is the Worker's own calculation.
        const serverQuote = verdict.values.quote;
        assert.equal(payload.customEstimate, serverQuote.custom, label);
        if (serverQuote.custom) {
          assert.equal(payload.clientPriceCents, null, label);
          assert.equal(payload.perVisitPrice, "", label);
          assert.deepEqual(payload.customReasons, plain(serverQuote.reasons), label);
        } else {
          assert.equal(payload.clientPriceCents, serverQuote.priceCents, label);
          assert.equal(payload.perVisitPrice, (serverQuote.priceCents / 100).toFixed(2), label);
          assert.deepEqual(payload.customReasons, [], label);
        }

        // 5. Consent evidence only when Text is the chosen reply method.
        if (contact === "text") {
          assert.equal(payload.smsTransactionalConsent, true, label);
          assert.equal(payload.consent, "yes", label);
          assert.equal(payload.consentVersion, "service-sms-2026-08-v1", label);
          assert.match(payload.smsConsentCapturedAt, /^\d{4}-\d{2}-\d{2}T/, label);
        } else {
          assert.equal(payload.smsTransactionalConsent, false, label);
          assert.equal(payload.consent, "no", label);
          assert.equal(payload.consentVersion, "", label);
          assert.equal(payload.smsConsentCapturedAt, "", label);
        }

        // 6. Terms evidence only for a service request.
        if (intent === "service_request") {
          assert.equal(payload.termsAccepted, true, label);
          assert.equal(payload.termsVersion, TERMS_VERSION, label);   // the pinned label, shared/terms-version.json
          assert.match(payload.termsAcceptedAt, /^\d{4}-\d{2}-\d{2}T/, label);
          assert.equal(payload.notes, "Submitted through transparent-price Cloudflare widget.", label);
        } else {
          assert.equal(payload.termsAccepted, false, label);
          assert.equal(payload.termsVersion, "", label);
          assert.equal(payload.termsAcceptedAt, "", label);
          assert.equal(payload.notes, "", label);
        }

        // 7. The trap field is present and empty; state is always IN.
        assert.equal(payload.website, "", label);
        assert.equal(payload.state, "IN", label);

        // 8. Attribution travels with the request.
        assert.deepEqual(payload.attribution, { utm_source: "meta", utm_campaign: "fall", fbclid: "abc123" }, label);
        assert.equal(payload.fbclid, "abc123");
        assert.equal(payload.gclid, "");
        assert.match(payload.fbc, /^fb\.1\.\d+\.abc123$/);
        assert.equal(payload.page, "https://itspurgepros.com/carmel?utm_source=meta&utm_campaign=fall&fbclid=abc123");

        // 9. What the Worker would pass on to the team is what the engine sent:
        //    nothing is silently blanked, rebuilt differently or dropped.
        const forward = plain(worker.buildV3Forward(payload, verdict.values, payload.requestId, fakeRequest));
        for (const key of [
          "schemaVersion", "requestId", "eventId", "stage", "intent", "zip", "dogs", "frequency", "frequencyId", "areas", "areaIds",
          "yardSize", "yardSizeId", "lastCleaned", "customerStatus", "startTiming", "perVisitPrice", "pricingVersion", "customEstimate",
          "customReasons", "phone", "phoneE164", "firstName", "lastName", "email", "street", "city", "state", "preferredContact",
          "smsTransactionalConsent", "consent", "consentVersion", "smsConsentCapturedAt", "termsAccepted", "termsVersion", "termsAcceptedAt",
          "question", "notes", "page", "attribution", "gclid", "fbclid", "fbp", "fbc", "submittedAt"
        ]) {
          assert.deepEqual(forward[key], payload[key], label + " forwarded " + key);
        }
        assert.equal(forward.serverPriceCents, payload.clientPriceCents, label);

        // 10. Small enough for the Worker's 30,000-byte limit.
        assert.ok(new TextEncoder().encode(JSON.stringify(payload)).byteLength < worker.MAX_BODY_BYTES, label);
        accepted += 1;
      }
    }
  }
  // 4 priced plans x (3 + 2 + 3) + 3 custom plans x 3 service requests
  assert.equal(accepted, 4 * 8 + 3 * 3);
});

test("the smallest forms the Worker accepts: a texted quote and an emailed question", () => {
  // "Text me this quote": first name, mobile, the consent box, last full cleanup (spec section 14 item 3).
  const quote = makeStore().store;
  fillPlan(quote);
  quote.set({ intent: "quote_delivery" });
  quote.set({ firstName: "Test", phone: "3175550100", lastCleaned: "Within 1 week" });
  assert.equal(quote.buildPayload().ok, false, "not without the consent box");
  quote.set({ smsConsent: true });
  const quotePayload = built(quote, "quote_delivery");
  assert.equal(worker.validateV3(quotePayload).ok, true);
  assert.equal(quotePayload.question, "Quote delivery requested by text.");
  assert.equal(quotePayload.customerStatus, "not_sure", "unanswered status goes as the placeholder");
  assert.equal(quotePayload.lastName, "");
  assert.equal(quotePayload.street, "");
  assert.equal(quotePayload.city, "", "the pre-filled city is not sent for a quote delivery");
  assert.equal(quotePayload.startTiming, "");

  // A question answered by email needs no phone and no text consent.
  const question = makeStore().store;
  fillPlan(question);
  question.set({ intent: "question", preferredContact: "email" });
  question.set({ firstName: "Test", email: "Test@Example.com", lastCleaned: "More than 6 months", question: "Do you service corner lots?" });
  const questionPayload = built(question, "question");
  assert.equal(worker.validateV3(questionPayload).ok, true);
  assert.equal(questionPayload.email, "test@example.com", "trimmed and lower case");
  assert.equal(questionPayload.phone, "");
  assert.equal(questionPayload.phoneE164, "");
  assert.equal(questionPayload.smsTransactionalConsent, false);
  assert.equal(questionPayload.question, "Do you service corner lots?");
});

test("details typed under one intent do not leak into a different intent's payload", () => {
  const { store } = readyStore();
  store.set({ question: "A question typed earlier" });
  // Still a service request: the question is not part of it.
  store.set({ termsAccepted: true });
  assert.equal(built(store, "service_request").question, "");
  // Switch to a question: address, last name and timing stay out.
  store.set({ intent: "question" });
  const payload = built(store, "question");
  assert.equal(payload.street, "");
  assert.equal(payload.city, "");
  assert.equal(payload.lastName, "");
  assert.equal(payload.startTiming, "");
  assert.equal(payload.termsAccepted, false);
  assert.equal(worker.validateV3(payload).ok, true);
});

test("every field name the Worker can report maps to a field key or a form-level message", () => {
  const blocks = workerText.slice(workerText.indexOf("function calculateQuote(lead) {"), workerText.indexOf("function normalizeVoiceText(")) +
    workerText.slice(workerText.indexOf("function validateV3(lead) {"), workerText.indexOf("function cleanAttribution("));
  const names = new Set();
  for (const match of blocks.matchAll(/errors\.push\("([A-Za-z]+)"\)/g)) names.add(match[1]);
  assert.ok(names.size >= 20, "found the Worker's error names: " + Array.from(names).join(", "));
  for (const name of names) {
    assert.ok(Object.prototype.hasOwnProperty.call(core.SERVER_FIELD_MAP, name), "no mapping for Worker field " + name);
    const mapped = core.mapServerFields([name]);
    assert.equal(mapped.unknown.length, 0);
    assert.equal(mapped.fieldErrors.length + mapped.formErrors.length, 1, name);
    if (mapped.fieldErrors.length) {
      assert.ok(core.FIELD_STEP[mapped.fieldErrors[0].field], name + " maps to a known field key");
      assert.ok(mapped.fieldErrors[0].message.length > 5);
      assert.equal(mapped.fieldErrors[0].serverField, name);
    }
  }
  // Nothing in the table that the Worker never reports.
  for (const name of Object.keys(core.SERVER_FIELD_MAP)) assert.ok(names.has(name), name + " is not a Worker field name");
  // Several at once, with repeats and an unknown name.
  const many = core.mapServerFields(["phone", "street", "consentVersion", "smsTransactionalConsent", "clientPriceCents", "mystery"]);
  assert.deepEqual(many.fieldErrors.map((error) => error.field), ["phone", "address", "smsConsent"]);
  assert.equal(many.formErrors.length, 1);
  assert.deepEqual(many.unknown, ["mystery"]);
  assert.deepEqual(core.mapServerFields(null), { fieldErrors: [], formErrors: [], unknown: [] });
});

// One broken field at a time. For each:
//   breakPayload   the change made to a VALID engine payload
//   workerField    the name the Worker must report for it
//   breakStore     the same mistake made through the store (when a visitor can make it)
//   engineField    the field key the engine's validation must report
const MUTATIONS = [
  { name: "ZIP outside the service area", breakPayload: (p) => { p.zip = "46201"; }, workerField: "zip", breakStore: (s) => s.set({ zip: "46201" }), engineField: "zip" },
  { name: "ZIP incomplete", breakPayload: (p) => { p.zip = "4603"; }, workerField: "zip", breakStore: (s) => s.set({ zip: "4603" }), engineField: "zip" },
  { name: "no dog count", breakPayload: (p) => { p.dogs = ""; }, workerField: "dogs", breakStore: (s) => s.set({ dogCount: "" }), engineField: "dogCount" },
  { name: "eleven dogs", breakPayload: (p) => { p.dogs = "11"; }, workerField: "dogs", breakStore: (s) => s.set({ dogCount: "11" }), refusedBySet: "dogCount" },
  { name: "weekly with 6 dogs", breakPayload: (p) => { p.dogs = "6"; }, workerField: "frequencyId", breakStore: (s) => s.set({ dogCount: "6" }), engineField: "frequency" },
  { name: "unknown frequency", breakPayload: (p) => { p.frequencyId = "monthly"; }, workerField: "frequencyId", breakStore: (s) => s.set({ frequency: "monthly" }), refusedBySet: "frequency" },
  { name: "no frequency", breakPayload: (p) => { p.frequencyId = ""; }, workerField: "frequencyId", breakStore: (s) => s.set({ frequency: "" }), engineField: "frequency" },
  { name: "unknown yard size", breakPayload: (p) => { p.yardSizeId = "xxl"; }, workerField: "yardSizeId", breakStore: (s) => s.set({ yardSize: "xxl" }), refusedBySet: "yardSize" },
  { name: "no yard size", breakPayload: (p) => { p.yardSizeId = ""; }, workerField: "yardSizeId", breakStore: (s) => s.set({ yardSize: "" }), engineField: "yardSize" },
  { name: "over 1 acre with a weekly plan", breakPayload: (p) => { p.yardSizeId = "over"; }, workerField: "frequencyId", breakStore: (s) => s.set({ yardSize: "over" }), engineMovesToCustom: true },
  { name: "no areas", breakPayload: (p) => { p.areaIds = []; }, workerField: "areaIds", breakStore: (s) => s.set({ areas: [] }), engineField: "areas" },
  { name: "unknown area", breakPayload: (p) => { p.areaIds = ["back", "garage"]; }, workerField: "areaIds", breakStore: (s) => s.set({ areas: ["back", "garage"] }), refusedBySet: "areas" },
  { name: "Text without a phone", breakPayload: (p) => { p.phone = ""; }, workerField: "phone", breakStore: (s) => s.set({ phone: "" }), engineField: "phone" },
  { name: "malformed phone", breakPayload: (p) => { p.phone = "55501"; }, workerField: "phone", breakStore: (s) => s.set({ phone: "55501" }), engineField: "phone" },
  { name: "malformed optional email", breakPayload: (p) => { p.email = "not-an-email"; }, workerField: "email", breakStore: (s) => s.set({ email: "not-an-email" }), engineField: "email" },
  { name: "Text without the consent box", breakPayload: (p) => { p.smsTransactionalConsent = false; }, workerField: "smsTransactionalConsent", breakStore: (s) => s.set({ smsConsent: false }), engineField: "smsConsent" },
  { name: "Text without a consent version", breakPayload: (p) => { p.consentVersion = ""; }, workerField: "consentVersion", engineAlwaysSends: (p) => p.consentVersion === "service-sms-2026-08-v1" },
  { name: "no first name", breakPayload: (p) => { p.firstName = "  "; }, workerField: "firstName", breakStore: (s) => s.set({ firstName: "  " }), engineField: "firstName" },
  { name: "no last name", breakPayload: (p) => { p.lastName = ""; }, workerField: "lastName", breakStore: (s) => s.set({ lastName: "" }), engineField: "lastName" },
  { name: "no street", breakPayload: (p) => { p.street = ""; }, workerField: "street", breakStore: (s) => s.set({ address: " " }), engineField: "address" },
  { name: "no city", breakPayload: (p) => { p.city = ""; }, workerField: "city", breakStore: (s) => s.set({ city: "" }), engineField: "city" },
  { name: "start timing not one of the four", breakPayload: (p) => { p.startTiming = "Tomorrow"; }, workerField: "startTiming", breakStore: (s) => s.set({ startTiming: "Tomorrow" }), refusedBySet: "startTiming" },
  { name: "no start timing", breakPayload: (p) => { p.startTiming = ""; }, workerField: "startTiming", breakStore: (s) => s.set({ startTiming: "" }), engineField: "startTiming" },
  { name: "last cleanup with a hyphen instead of an en dash", breakPayload: (p) => { p.lastCleaned = "2-3 weeks"; }, workerField: "lastCleaned", breakStore: (s) => s.set({ lastCleaned: "2-3 weeks" }), refusedBySet: "lastCleaned" },
  { name: "no last cleanup", breakPayload: (p) => { p.lastCleaned = ""; }, workerField: "lastCleaned", breakStore: (s) => s.set({ lastCleaned: "" }), engineField: "lastCleaned" },
  { name: "unknown customer status", breakPayload: (p) => { p.customerStatus = "vip"; }, workerField: "customerStatus", breakStore: (s) => s.set({ customerStatus: "vip" }), refusedBySet: "customerStatus" },
  { name: "terms not accepted", breakPayload: (p) => { p.termsAccepted = false; }, workerField: "termsAccepted", breakStore: (s) => s.set({ termsAccepted: false }), engineField: "termsAccepted" },
  { name: "no terms version", breakPayload: (p) => { p.termsVersion = ""; }, workerField: "termsAccepted", engineAlwaysSends: (p) => p.termsVersion === TERMS_VERSION },
  { name: "unknown intent", breakPayload: (p) => { p.intent = "newsletter"; }, workerField: "intent", breakStore: (s) => s.set({ intent: "newsletter" }), refusedBySet: "intent" },
  { name: "unknown reply method", breakPayload: (p) => { p.preferredContact = "fax"; }, workerField: "preferredContact", breakStore: (s) => s.set({ preferredContact: "fax" }), refusedBySet: "preferredContact" },
  { name: "the trap field filled in", breakPayload: (p) => { p.website = "https://spam.example"; }, workerField: "website", engineAlwaysSends: (p) => p.website === "" },
  { name: "wrong stage", breakPayload: (p) => { p.stage = "estimate_requested"; }, workerField: "stage", engineAlwaysSends: (p) => p.stage === "service_requested" },
  { name: "wrong pricing version", breakPayload: (p) => { p.pricingVersion = "2025-01"; }, workerField: "pricingVersion", engineAlwaysSends: (p) => p.pricingVersion === "2026-08-cloudflare-v1" },
  { name: "price off by one cent", breakPayload: (p) => { p.clientPriceCents += 1; }, workerField: "clientPriceCents", engineAlwaysSends: (p) => p.clientPriceCents === 2899 },
  { name: "custom flag flipped", breakPayload: (p) => { p.customEstimate = true; }, workerField: "customEstimate", engineAlwaysSends: (p) => p.customEstimate === false }
];

test("broken one field at a time: the Worker rejects it and the engine had already caught it", () => {
  for (const mutation of MUTATIONS) {
    // A valid service request by text: 2 dogs, weekly, quarter acre, back + front = $28.99.
    const { store } = readyStore();
    const valid = built(store, "service_request");
    assert.equal(worker.validateV3(valid).ok, true, mutation.name + ": the starting payload is valid");

    // The Worker rejects the broken payload and names the field.
    const broken = JSON.parse(JSON.stringify(valid));
    mutation.breakPayload(broken);
    const verdict = worker.validateV3(broken);
    assert.equal(verdict.ok, false, mutation.name + ": the Worker should reject it");
    assert.ok(plain(verdict.errors).includes(mutation.workerField), mutation.name + ": Worker reported " + plain(verdict.errors).join(", "));

    // Every name it reports can be shown to the visitor.
    const mapped = core.mapServerFields(plain(verdict.errors));
    assert.deepEqual(mapped.unknown, [], mutation.name);

    if (mutation.engineAlwaysSends) {
      // Not something a visitor can get wrong: the engine sets it itself.
      assert.equal(mutation.engineAlwaysSends(valid), true, mutation.name + ": the engine always sends the right value");
      continue;
    }

    const outcome = mutation.breakStore(store);
    if (mutation.refusedBySet) {
      // The engine does not even let the bad value into the state.
      assert.ok(outcome.rejected.some((entry) => entry.field === mutation.refusedBySet), mutation.name + ": set() should refuse it");
      assert.equal(store.validateSubmit().ok, true, mutation.name + ": the state is unchanged and still valid");
      continue;
    }
    if (mutation.engineMovesToCustom) {
      // The engine reconciles instead: the plan becomes a custom estimate, which IS valid for the Worker.
      assert.equal(store.getState().frequency, "custom", mutation.name);
      assert.ok(outcome.notices.some((notice) => notice.code === "FREQUENCY_MOVED_TO_CUSTOM"), mutation.name + ": with a notice saying why");
      store.set({ termsAccepted: true });
      assert.equal(worker.validateV3(built(store, "service_request")).ok, true, mutation.name);
      continue;
    }
    const validation = store.validateSubmit();
    assert.equal(validation.ok, false, mutation.name + ": the engine should refuse");
    assert.ok(Object.prototype.hasOwnProperty.call(validation.byField, mutation.engineField), mutation.name + ": engine reported " + Object.keys(validation.byField).join(", "));
    assert.ok(validation.byField[mutation.engineField].length > 5, "a human-readable message");
    assert.equal(store.buildPayload().ok, false, mutation.name + ": no payload is built");
    // And the Worker's name for it points at the same field key.
    const serverSide = core.SERVER_FIELD_MAP[mutation.workerField];
    if (serverSide.field !== null) assert.equal(serverSide.field, mutation.engineField, mutation.name + ": server field maps to the same key");
  }
});

test("intent-specific required fields: the Worker and the engine agree", () => {
  // Email reply without a valid email.
  const email = makeStore().store;
  fillPlan(email);
  fillDetails(email, "question", "email");
  const good = built(email, "question");
  const broken = Object.assign({}, good, { email: "" });
  assert.ok(plain(worker.validateV3(broken).errors).includes("email"));
  email.set({ email: "" });
  assert.ok(email.validateSubmit("question").byField.email);

  // A question shorter than five characters.
  const question = makeStore().store;
  fillPlan(question);
  fillDetails(question, "question", "call", { question: "hey" });
  assert.ok(question.validateSubmit("question").byField.question);
  assert.ok(plain(worker.validateV3(Object.assign({}, good, { question: "hey" })).errors).includes("question"));

  // Phone call needs a phone.
  const call = makeStore().store;
  fillPlan(call);
  fillDetails(call, "question", "call", { phone: "" });
  assert.ok(call.validateSubmit("question").byField.phone);
  assert.ok(plain(worker.validateV3(Object.assign({}, good, { preferredContact: "call", phone: "" })).errors).includes("phone"));
});

test("the two rules the engine enforces beyond the Worker are marked as its own", () => {
  // A service request by email with no phone: the Worker would accept it, the engine does not (spec 12.2).
  const { store } = makeStore();
  fillPlan(store);
  fillDetails(store, "service_request", "email", { phone: "" });
  const phoneError = store.validateDetails("service_request").errors.find((error) => error.field === "phone");
  assert.ok(phoneError);
  assert.equal(phoneError.engineOnly, true);

  // Phone call for a quote delivery is not offered.
  const quote = makeStore().store;
  fillPlan(quote);
  quote.set({ intent: "service_request", preferredContact: "call" });
  const switched = quote.set({ intent: "quote_delivery" });
  assert.equal(quote.getState().preferredContact, "text", "moved to Text, as the live tool does");
  assert.ok(switched.notices.some((notice) => notice.code === "CONTACT_CHANGED"));
  const refused = quote.set({ preferredContact: "call" });
  assert.ok(refused.rejected.some((entry) => entry.field === "preferredContact"));
  assert.deepEqual(quote.contactOptions("quote_delivery").map((option) => [option.id, option.available]), [["text", true], ["email", true], ["call", false]]);
});

/* ---- randomised agreement ------------------------------------------------ */

// A small seeded generator, so a failure can be reproduced.
function generator(seed) {
  let value = seed >>> 0;
  return function next() {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

// Each field is usually valid and sometimes broken, so that complete valid
// requests, single mistakes and piles of mistakes all turn up often.
const FIELD_POOLS = {
  zip: { good: ["46032", "46280", "46011", "46216"], bad: ["46201", "4603", "", "90210"] },
  dogCount: { good: ["1", "2", "4", "5", "6", "9", "10"], bad: ["", "0", "11"] },
  yardSize: { good: ["s", "m", "l", "xl", "over"], bad: ["", "xxl"] },
  areas: { good: [["back"], ["front", "side"], ["back", "front", "side"], ["side", "back"]], bad: [[], ["garage"], ["back", "garage"]] },
  frequency: { good: ["twice", "weekly", "biweekly", "onetime", "custom"], bad: ["", "monthly"] },
  customerStatus: { good: ["new", "returning", "not_sure"], bad: ["", "vip"] },
  firstName: { good: ["Test"], bad: ["", "   "] },
  lastName: { good: ["Reviewer"], bad: ["", " "] },
  phone: { good: ["(317) 555-0100", "3175550100", "13175550100"], bad: ["", "555", "   "] },
  email: { good: ["test@example.com", "TEST@Example.com ", ""], bad: ["nope", "a@b"] },
  preferredContact: { good: ["text", "email", "call"], bad: ["fax"] },
  smsConsent: { good: [true], bad: [false] },
  address: { good: ["123 Example St"], bad: ["", "  "] },
  city: { good: ["Carmel"], bad: ["", " "] },
  startTiming: { good: ["As soon as possible", "Just researching for now"], bad: ["", "Tomorrow"] },
  lastCleaned: { good: ["Within 1 week", "2–3 weeks", "More than 6 months"], bad: ["", "2-3 weeks"] },
  question: { good: ["Is this a test question?"], bad: ["", "hey", "     "] },
  termsAccepted: { good: [true], bad: [false] }
};

function randomValue(random, field) {
  const pool = FIELD_POOLS[field];
  return pick(random, random() < 0.88 ? pool.good : pool.bad);
}

function randomState(random) {
  const state = { smsConsentCapturedAt: "2026-10-07T15:00:00.000Z", termsAcceptedAt: "2026-10-07T15:00:01.000Z" };
  for (const field of Object.keys(FIELD_POOLS)) state[field] = randomValue(random, field);
  return state;
}

test("randomised: whatever the engine calls valid, the Worker accepts; what only the engine refuses is one of its own stricter rules", () => {
  const random = generator(20261007);
  const context = { requestId: "fuzz-request", nowIso: "2026-10-07T15:00:02.000Z", nowMs: 1791385202000, page: "https://itspurgepros.com/", attribution: {}, fbp: "", fbc: "" };
  const tally = { both: 0, neither: 0, engineStricter: 0 };
  for (let round = 0; round < 60000; round += 1) {
    const state = randomState(random);
    const intent = random() < 0.03 ? "newsletter" : pick(random, ["service_request", "service_request", "quote_delivery", "question"]);
    const engineErrors = core.testing.planErrors(state)
      .concat(core.testing.detailsErrors(state, intent))
      .concat(core.testing.termsErrors(state, intent));
    const payload = core.testing.payloadFromState(state, intent, context);
    const verdict = worker.validateV3(payload);
    const describe = () => JSON.stringify({ intent, state, engine: engineErrors.map((error) => error.code), worker: plain(verdict.errors) });

    if (engineErrors.length === 0) {
      // SAFETY: the engine never lets through something the Worker rejects.
      assert.equal(verdict.ok, true, "engine valid but Worker rejects: " + describe());
      tally.both += 1;
    } else if (verdict.ok) {
      // The only reasons for the engine to refuse what the Worker would take.
      assert.ok(engineErrors.every((error) => error.engineOnly === true), "engine refuses for a reason not marked as its own: " + describe());
      tally.engineStricter += 1;
    } else {
      tally.neither += 1;
    }
  }
  // The run must have exercised all three situations meaningfully.
  assert.ok(tally.both > 2000, "valid cases seen: " + tally.both);
  assert.ok(tally.neither > 5000, "invalid cases seen: " + tally.neither);
  assert.ok(tally.engineStricter > 200, "engine-stricter cases seen: " + tally.engineStricter);
});

test("randomised through the store: any state reached by set() that validates also builds a payload the Worker accepts", () => {
  const random = generator(42);
  let builtCount = 0;
  for (let round = 0; round < 400; round += 1) {
    // Start from a complete valid request, then change things at random.
    const { store } = readyStore(undefined, undefined, pick(random, ["service_request", "quote_delivery", "question"]), pick(random, ["text", "email"]));
    const steps = 12 + Math.floor(random() * 30);
    for (let step = 0; step < steps; step += 1) {
      const field = pick(random, Object.keys(FIELD_POOLS));
      const patch = {};
      patch[field] = randomValue(random, field);
      if (random() < 0.15) patch.intent = pick(random, ["service_request", "quote_delivery", "question"]);
      store.set(patch);
      // Invariants that must hold after EVERY change:
      const state = store.getState();
      if (state.preferredContact !== "text") assert.equal(state.smsConsent, false, "consent exists only with Text");
      if (state.smsConsent) assert.ok(state.smsConsentCapturedAt, "consent has its moment recorded");
      if (state.intent === "quote_delivery") assert.notEqual(state.preferredContact, "call");
      if (state.frequency) assert.equal(core.frequencyEligibility(state.frequency, state.dogCount, state.yardSize).allowed, true, "the chosen frequency is always allowed");
      const attempt = store.buildPayload();
      if (attempt.ok) {
        builtCount += 1;
        const verdict = worker.validateV3(attempt.payload);
        assert.equal(verdict.ok, true, "Worker rejects a payload the engine built: " + JSON.stringify(plain(verdict.errors)) + " " + JSON.stringify(attempt.payload));
        assert.equal(store.checkZip().inArea, true, "never a payload for an out-of-area ZIP");
      }
    }
  }
  assert.ok(builtCount > 1000, "payloads built and checked: " + builtCount);
});

test("second line of defence: the payload builder itself never emits consent or terms evidence that does not apply", () => {
  // The store refuses these states; even so, a state object that somehow held
  // them must not turn into consent evidence in a payload.
  const context = { requestId: "raw-1", nowIso: "2026-10-07T15:00:02.000Z", nowMs: 1791385202000, page: "https://itspurgepros.com/", attribution: {}, fbp: "", fbc: "" };
  const base = {
    zip: "46032", dogCount: "2", yardSize: "m", areas: ["back", "front"], frequency: "weekly", customerStatus: "new",
    firstName: "Test", lastName: "Reviewer", phone: "3175550100", email: "test@example.com", address: "123 Example St", city: "Carmel",
    startTiming: "As soon as possible", lastCleaned: "About 1 month", question: "", termsAccepted: true, termsAcceptedAt: "2026-10-07T15:00:01.000Z",
    smsConsent: true, smsConsentCapturedAt: "2026-10-07T15:00:00.000Z"
  };
  for (const contact of ["email", "call"]) {
    const payload = core.testing.payloadFromState(Object.assign({}, base, { preferredContact: contact }), "service_request", context);
    assert.equal(payload.smsTransactionalConsent, false, contact);
    assert.equal(payload.consent, "no", contact);
    assert.equal(payload.consentVersion, "", contact);
    assert.equal(payload.smsConsentCapturedAt, "", contact);
  }
  for (const intent of ["quote_delivery", "question"]) {
    const payload = core.testing.payloadFromState(Object.assign({}, base, { preferredContact: "text" }), intent, context);
    assert.equal(payload.termsAccepted, false, intent);
    assert.equal(payload.termsVersion, "", intent);
    assert.equal(payload.termsAcceptedAt, "", intent);
    assert.equal(payload.smsTransactionalConsent, true, "Text with the box ticked still carries consent");
  }
  // Attribution is cut down to the nine known keys whatever the state holds.
  const noisy = Object.assign({}, context, { attribution: { utm_source: "meta", name: "Test", phone: "3175550100", gclid: 5 } });
  assert.deepEqual(core.testing.payloadFromState(Object.assign({}, base, { preferredContact: "text" }), "service_request", noisy).attribution, { utm_source: "meta" });
});
