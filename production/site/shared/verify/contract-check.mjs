// Independent contract checker for shared/pp-quote-core.js (verifier lens: the
// request contract). Written from scratch; imports nothing from ../tests.
//
//   node "production/site/shared/verify/contract-check.mjs"
//
// Everything runs offline. The live Worker source is evaluated WHOLE in
// process (see contract-lib-offline-worker.mjs), so the engine's requests go through
// the Worker's real origin check, JSON checks, validateV3, buildV3Forward,
// the replay ledger and the save-link handlers. The only stand-ins are the
// Durable Object storage (an in-memory map) and the team's webhook.
// Node-level network tripwires are armed for the whole run.
//
// Test contacts are obviously fake: Test Reviewer, 3175550100, test@example.com.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { makeWorker, networkAttempts, WORKER_ORIGIN, UPSTREAM_URL, SITE_ORIGIN, workerSource, widgetSource } from "./contract-lib-offline-worker.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const enginePath = process.env.PP_ENGINE_PATH ? path.resolve(process.env.PP_ENGINE_PATH) : path.resolve(here, "../pp-quote-core.js");
const engineSource = fs.readFileSync(enginePath, "utf8");
const C = require(enginePath);
const T = C.testing;
// the pinned Terms version label (shared/terms-version.json); set-switch-day.mjs changes it with the engine
const TERMS_VERSION = JSON.parse(fs.readFileSync(path.resolve(here, "../terms-version.json"), "utf8")).termsVersion;

/* ======================================================================
 * harness
 * ==================================================================== */

const results = [];
let currentGroup = "";
function group(name) { currentGroup = name; }
async function check(title, fn) {
  const entry = { group: currentGroup, title, ok: true, note: "" };
  try {
    const note = await fn();
    if (typeof note === "string") entry.note = note;
  } catch (error) {
    entry.ok = false;
    entry.error = error && error.message ? error.message : String(error);
  }
  results.push(entry);
}
function problems() {
  const list = [];
  return {
    add(message) { list.push(message); },
    get count() { return list.length; },
    done(context) {
      if (list.length) throw new Error((context ? context + ": " : "") + list.length + " problem(s). First: " + list.slice(0, 6).join("  ||  "));
    }
  };
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function until(condition, label) {
  for (let i = 0; i < 2000; i += 1) {
    if (condition()) return;
    await tick();
  }
  throw new Error("timed out waiting for: " + label);
}

/* ======================================================================
 * test doubles for the engine
 * ==================================================================== */

function fakeStorage(initial) {
  const items = Object.assign({}, initial || {});
  return {
    items,
    writes: [],
    getItem(key) { return Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null; },
    setItem(key, value) { items[key] = String(value); this.writes.push({ key, value: String(value) }); },
    removeItem(key) { delete items[key]; }
  };
}
function fakeLocation(href) {
  const url = new URL(href);
  return { href: url.href, search: url.search, hash: url.hash, pathname: url.pathname, protocol: url.protocol, origin: url.origin, hostname: url.hostname };
}

let idCounter = 0;
const T0 = Date.parse("2026-10-07T15:00:00.000Z");

// makeStore({ worker }) -> a LIVE-mode engine whose fetch is a bridge into the
// in-process Worker. makeStore({}) -> a DEMO-mode engine whose fetch throws.
function makeStore(config) {
  const cfg = config || {};
  const worker = cfg.worker || null;
  const live = Boolean(worker);
  const storage = cfg.storage || fakeStorage();
  const clock = cfg.clock || { t: T0 };
  const ids = [];
  const timers = [];
  const cookies = cfg.cookies || {};
  const pageUrl = cfg.url || (live ? SITE_ORIGIN + "/" : "file:///G:/review/home.html");
  const pageOrigin = new URL(pageUrl).origin;
  const bridge = { mode: "normal", calls: [], lostReplies: 0, tamper: null, replies: [] };
  const strayFetches = [];

  async function bridgeFetch(url, init) {
    const target = String(url);
    bridge.calls.push({ url: target, init });
    if (!target.startsWith(WORKER_ORIGIN + "/")) {
      networkAttempts.push({ via: "engine fetch (bridge)", target });
      throw new TypeError("blocked: " + target);
    }
    if (bridge.mode === "network-fail") throw new TypeError("Failed to fetch");
    let body = init.body;
    if (bridge.tamper) body = JSON.stringify(bridge.tamper(JSON.parse(body)));
    const reply = await worker.call(target.slice(WORKER_ORIGIN.length), {
      body,
      origin: pageOrigin,
      contentType: init.headers && init.headers["Content-Type"]
    });
    bridge.replies.push(reply);
    if (bridge.mode === "lose-reply") {
      bridge.lostReplies += 1;
      return new Promise(function (_, reject) {
        const fail = function () { const error = new Error("The operation was aborted."); error.name = "AbortError"; reject(error); };
        if (init.signal && init.signal.aborted) fail();
        else if (init.signal) init.signal.addEventListener("abort", fail);
      });
    }
    return { status: reply.status, ok: reply.status >= 200 && reply.status < 300, text: async function () { return reply.text; } };
  }

  const options = Object.assign({
    storage,
    location: fakeLocation(pageUrl),
    history: { state: null, replaceState() {} },
    now: () => clock.t,
    uuid: () => { idCounter += 1; const id = "chk-" + String(idCounter).padStart(6, "0"); ids.push(id); return id; },
    random: Math.random,
    readCookie: (name) => cookies[name] || "",
    console: null,
    wait: () => Promise.resolve(),
    setTimeout: (callback, ms) => { const timer = { callback, ms, cleared: false, fired: false }; timers.push(timer); return timer; },
    clearTimeout: (timer) => { if (timer) timer.cleared = true; },
    fetch: live ? bridgeFetch : (url) => { strayFetches.push(String(url)); throw new Error("unexpected fetch in demo mode: " + url); }
  }, live ? { mode: "live", endpoint: WORKER_ORIGIN + "/submit" } : {}, cfg.options || {});

  const store = C.create(options);
  function fireTimers() {
    timers.filter((timer) => !timer.cleared && !timer.fired).forEach((timer) => { timer.fired = true; timer.callback(); });
  }
  return { store, storage, clock, ids, timers, bridge, strayFetches, fireTimers, cookies, pageUrl };
}

const FAKE = { firstName: "Test", lastName: "Reviewer", phone: "3175550100", email: "test@example.com", address: "123 Example St", question: "Is this only a test question?" };

const PLANS = {
  weekly: { dogCount: "2", zip: "46032", yardSize: "m", areas: ["back", "front"], frequency: "weekly" },
  twice: { dogCount: "9", zip: "46280", yardSize: "xl", areas: ["back", "front", "side"], frequency: "twice" },
  biweekly: { dogCount: "1", zip: "46011", yardSize: "s", areas: ["side"], frequency: "biweekly" },
  onetime: { dogCount: "3", zip: "46143", yardSize: "l", areas: ["front", "side"], frequency: "onetime" },
  onetime10: { dogCount: "10", zip: "46077", yardSize: "s", areas: ["back"], frequency: "onetime" },
  customPick: { dogCount: "2", zip: "46074", yardSize: "m", areas: ["back"], frequency: "custom" },
  custom10: { dogCount: "10", zip: "46060", yardSize: "m", areas: ["back", "side"], frequency: "custom" },
  customOver: { dogCount: "4", zip: "46168", yardSize: "over", areas: ["back", "front", "side"], frequency: "custom" }
};
const PLAN_TYPE = { weekly: "recurring", twice: "recurring", biweekly: "recurring", onetime: "onetime", onetime10: "onetime", customPick: "custom", custom10: "custom", customOver: "custom" };

function mustSet(store, patch) {
  const result = store.set(patch);
  if (!result.ok) throw new Error("set(" + JSON.stringify(patch) + ") was refused: " + JSON.stringify(result.rejected));
  return result;
}
function fillPlan(store, plan) {
  mustSet(store, { dogCount: plan.dogCount });
  mustSet(store, { zip: plan.zip });
  mustSet(store, { yardSize: plan.yardSize });
  mustSet(store, { areas: plan.areas });
  mustSet(store, { frequency: plan.frequency });
}
// Fills the request form the way a visitor would. Returns the clock times at
// which the consent box and the terms box were ticked.
function fillRequest(made, o) {
  const store = made.store;
  const service = o.intent === "service_request";
  mustSet(store, { intent: o.intent });
  mustSet(store, { preferredContact: o.contact });
  if (o.status) mustSet(store, { customerStatus: o.status });
  mustSet(store, { firstName: FAKE.firstName, lastCleaned: o.lastCleaned || "2\u20133 weeks" });
  if (service) mustSet(store, { lastName: FAKE.lastName, address: FAKE.address, startTiming: o.startTiming || "As soon as possible" });
  if (service || o.contact !== "email" || o.optional) mustSet(store, { phone: FAKE.phone });
  if (o.contact === "email" || o.optional) mustSet(store, { email: FAKE.email });
  if (o.intent === "question") mustSet(store, { question: FAKE.question });
  const times = { consentAt: "", termsAt: "" };
  if (o.contact === "text") {
    made.clock.t += 1111;
    times.consentAt = new Date(made.clock.t).toISOString();
    mustSet(store, { smsConsent: true });
  }
  if (service) {
    made.clock.t += 2222;
    times.termsAt = new Date(made.clock.t).toISOString();
    mustSet(store, { termsAccepted: true });
  }
  made.clock.t += 3333; // the submit happens later than both ticks
  return times;
}
function ready(config, planKey, intent, contact, extra) {
  const made = makeStore(config);
  fillPlan(made.store, PLANS[planKey || "weekly"]);
  const times = fillRequest(made, Object.assign({ intent: intent || "service_request", contact: contact || "text", status: "new" }, extra || {}));
  made.times = times;
  return made;
}

/* ======================================================================
 * reference data cut from the live sources (not retyped)
 * ==================================================================== */

const refWorker = makeWorker();
const W = refWorker.W;

function sliceBetween(source, start, end) {
  const from = source.indexOf(start);
  if (from < 0) throw new Error("marker not found: " + start);
  const to = source.indexOf(end, from + start.length);
  if (to < 0) throw new Error("end marker not found: " + end);
  return source.slice(from, to);
}
const widgetBuildPayload = sliceBetween(widgetSource, "function buildPayload() {", "function submissionFingerprint(payload)");
const WIDGET_PAYLOAD_KEYS = [...widgetBuildPayload.slice(widgetBuildPayload.indexOf("return {")).matchAll(/^\s{6}([A-Za-z0-9_]+):/gm)].map((m) => m[1]);
const WIDGET_FINGERPRINT = [...sliceBetween(widgetSource, "const materialFields = [", "];").matchAll(/"([A-Za-z0-9]+)"/g)].map((m) => m[1]);
const WORKER_FINGERPRINT = [...sliceBetween(sliceBetween(workerSource, "async function quoteRequestFingerprint(forward) {", "const material ="), "const fields = [", "];").matchAll(/"([A-Za-z0-9]+)"/g)].map((m) => m[1]);
const fakeRequest = { headers: { get: () => "contract-check/1.0 (offline)" } };
async function workerFingerprintOf(payload) {
  const validation = W.validateV3(payload);
  if (!validation.ok) return "INVALID:" + validation.errors.join(",");
  const forward = W.buildV3Forward(payload, validation.values, payload.requestId, fakeRequest);
  return W.quoteRequestFingerprint(forward);
}

/* ======================================================================
 * A. constants and exact strings
 * ==================================================================== */

group("A. Constants the Worker checks");

await check("schema, pricing versions and the 53 ZIPs equal the Worker's own values", () => {
  assert.equal(C.VERSIONS.schemaVersion, W.SCHEMA_VERSION);
  assert.equal(C.VERSIONS.pricingVersion, W.PRICING_VERSION);
  assert.deepEqual(C.SERVICE_ZIPS.slice().sort(), [...W.SERVICE_ZIPS].sort());
  assert.equal(C.SERVICE_ZIPS.length, 53);
});

await check("last-cleanup and start-timing strings equal the Worker's sets, character for character (en dashes)", () => {
  assert.deepEqual(C.LAST_CLEANED_OPTIONS.slice(), [...W.LAST_CLEANED]);
  assert.deepEqual(C.START_TIMING_OPTIONS.slice(), [...W.START_TIMINGS]);
  const withDash = C.LAST_CLEANED_OPTIONS.filter((option) => option.includes("\u2013"));
  assert.deepEqual(withDash, ["2\u20133 weeks", "2\u20134 months", "5\u20136 months"]);
  assert.ok(C.LAST_CLEANED_OPTIONS.every((option) => !/\d-\d/.test(option)), "no ASCII hyphen between digits");
  // The hyphen look-alikes are refused by the engine and by the Worker.
  const made = makeStore();
  for (const wrong of ["2-3 weeks", "2\u20143 weeks", "2\u20123 weeks", "2\u22123 weeks", "2\u20133 Weeks", " 2\u20133 weeks"]) {
    const result = made.store.set({ lastCleaned: wrong });
    assert.equal(result.ok, false, "engine accepted look-alike " + JSON.stringify(wrong));
    assert.equal(made.store.getState().lastCleaned, "");
  }
});

await check("reply methods, customer statuses, intents and stages equal the Worker's", () => {
  assert.deepEqual(C.CONTACT_METHODS.map((m) => m.id).sort(), [...W.PREFERRED_CONTACTS].sort());
  assert.deepEqual(C.CUSTOMER_STATUS_OPTIONS.map((o) => o.id), ["new", "returning", "not_sure"]);
  assert.deepEqual(C.INTENTS.map((i) => i.id), ["service_request", "quote_delivery", "question"]);
  assert.deepEqual(plain(C.STAGES), { service_request: "service_requested", service_request_custom: "estimate_requested", quote_delivery: "quote_requested", question: "question_submitted" });
});

await check("the fingerprint field list equals the live widget's and covers every field of the Worker's ledger fingerprint", () => {
  assert.deepEqual(C.FINGERPRINT_FIELDS.slice(), WIDGET_FINGERPRINT);
  const engineAsWorker = C.FINGERPRINT_FIELDS.map((field) => (field === "clientPriceCents" ? "serverPriceCents" : field)).sort();
  assert.deepEqual(engineAsWorker, WORKER_FINGERPRINT.slice().sort());
});

await check("save-link keys, token pattern and link pattern equal the Worker's", () => {
  assert.deepEqual(C.SAVE_LINK_KEYS.slice(), W.RESUME_FIELDS.slice());
  assert.equal(W.RESUME_TOKEN_RE.source, "^[A-Za-z0-9_-]{43}$");
  assert.ok(C.SAVE_LINK_PATTERN.test("https://quote.itspurgepros.com/#resume=" + "A".repeat(43)));
  assert.ok(!C.SAVE_LINK_PATTERN.test("https://quote.itspurgepros.com/#resume=" + "A".repeat(42)));
  assert.ok(!C.SAVE_LINK_PATTERN.test("https://quote.itspurgepros.com.evil.test/#resume=" + "A".repeat(43)));
  assert.ok(!C.SAVE_LINK_PATTERN.test("http://quote.itspurgepros.com/#resume=" + "A".repeat(43)));
});

await check("canned demo replies use the Worker's real wording (409 uncertain, 409 conflict, 503, 400; save and resume messages)", async () => {
  const worker = makeWorker();
  const made = ready({ worker });
  const payload = made.store.buildPayload().payload;
  // 503: ledger binding missing
  const full = worker.holder.env;
  worker.holder.env = { GHL_WEBHOOK_URL_V3: UPSTREAM_URL };
  let reply = await worker.call("/submit", { body: payload });
  worker.holder.env = full;
  assert.equal(reply.status, 503);
  assert.equal(reply.json.message, C.SUBMIT_MESSAGES.unavailable);
  // 409 uncertain: the team's system fails after dispatch
  worker.upstream.mode = "throw";
  reply = await worker.call("/submit", { body: payload });
  worker.upstream.mode = "ok";
  assert.equal(reply.status, 409);
  assert.equal(reply.json.code, "SUBMISSION_UNCERTAIN");
  assert.equal(reply.json.message, C.SUBMIT_MESSAGES.uncertain.replace("{requestId}", payload.requestId));
  // 409 conflict: same id, different details
  reply = await worker.call("/submit", { body: Object.assign({}, payload, { firstName: "Other" }) });
  assert.equal(reply.json.code, "REQUEST_ID_CONFLICT");
  assert.equal(reply.json.message, C.SUBMIT_MESSAGES.conflict.replace("{requestId}", payload.requestId));
  // 400
  reply = await worker.call("/submit", { body: Object.assign({}, payload, { requestId: "other-id", firstName: "" }) });
  assert.equal(reply.status, 400);
  assert.equal(reply.json.message, C.SUBMIT_MESSAGES.invalid);
  assert.deepEqual(reply.json.fields, ["firstName"]);
  // save-link messages
  reply = await worker.call("/quote-resume", { body: { zip: "46032" } });
  assert.equal(reply.json.message, C.SAVE_LINK_MESSAGES.rejected);
  reply = await worker.call("/quote-resume/open", { body: { token: "B".repeat(43) } });
  assert.equal(reply.status, 404);
  assert.equal(reply.json.message, C.RESUME_MESSAGES.expired);
  const noDo = { GHL_WEBHOOK_URL_V3: UPSTREAM_URL };
  reply = await worker.call("/quote-resume", { body: T.saveLinkBody(made.store.getState()), env: noDo });
  assert.equal(reply.status, 503);
  assert.equal(reply.json.message, C.SAVE_LINK_MESSAGES.unavailable);
});

/* ======================================================================
 * B. the full matrix, end to end through the real Worker
 * ==================================================================== */

group("B. Matrix: intent x reply method x customer status x plan type x optional fields");

const matrixWorker = makeWorker();
const WORKER_LAST_CLEANED = [...W.LAST_CLEANED];
const WORKER_START_TIMINGS = [...W.START_TIMINGS];
const matrixStringsSeen = { lastCleaned: new Set(), startTiming: new Set() };
const matrixStats = { accepted: 0, engineRefused: 0, notRepresentable: 0, total: 0 };
const acceptedSamples = [];

await check("every payload the engine calls valid is accepted by validateV3 AND by the whole Worker (202, forwarded once, forward agrees with what was entered)", async () => {
  const bad = problems();
  for (const planKey of Object.keys(PLANS)) {
    for (const intent of ["service_request", "quote_delivery", "question"]) {
      for (const contact of ["text", "email", "call"]) {
        for (const status of ["", "new", "returning", "not_sure"]) {
          for (const optional of [false, true]) {
            matrixStats.total += 1;
            const label = [planKey, intent, contact, status || "(unanswered)", optional ? "optional" : "minimal"].join("/");
            const custom = PLAN_TYPE[planKey] === "custom";
            const made = makeStore({ worker: matrixWorker, cookies: optional ? { _fbp: "fb.1.1700000000000.1234567890", _fbc: "fb.1.1700000000001.testclid" } : {}, url: optional ? SITE_ORIGIN + "/carmel?utm_source=meta&utm_medium=paid&utm_campaign=fall&utm_content=ad1&utm_term=scoop&gclid=G1&wbraid=W1&gbraid=B1&fbclid=F1" : SITE_ORIGIN + "/" });
            const store = made.store;
            try {
              fillPlan(store, PLANS[planKey]);
            } catch (error) { bad.add(label + ": plan could not be set: " + error.message); continue; }

            // Combinations the engine must refuse to represent at all.
            if (intent === "quote_delivery" && contact === "call" && !custom) {
              mustSet(store, { intent });
              const refused = store.set({ preferredContact: "call" });
              if (refused.ok || store.getState().preferredContact === "call") bad.add(label + ": Phone call was accepted for a quote delivery");
              if (store.contactOptions("quote_delivery").find((o) => o.id === "call").available) bad.add(label + ": contactOptions offers Phone call for a quote delivery");
              matrixStats.notRepresentable += 1;
              continue;
            }
            if (custom && intent !== "service_request") {
              const refused = store.set({ intent });
              if (refused.ok || store.getState().intent !== "service_request") bad.add(label + ": a custom estimate accepted intent " + intent);
              const before = made.bridge.calls.length;
              const result = await store.submit(intent);
              if (result.status !== "invalid" || !result.fieldErrors.some((e) => e.field === "intent")) bad.add(label + ": submit(" + intent + ") for a custom estimate was not refused on field intent: " + result.status);
              if (made.bridge.calls.length !== before) bad.add(label + ": a refused submit reached the network");
              matrixStats.notRepresentable += 1;
              continue;
            }

            let times;
            try {
              // the option strings are taken from the Worker's own sets, cycling through all of them
              times = fillRequest(made, { intent, contact, status, optional, lastCleaned: WORKER_LAST_CLEANED[matrixStats.total % WORKER_LAST_CLEANED.length], startTiming: WORKER_START_TIMINGS[matrixStats.total % WORKER_START_TIMINGS.length] });
            } catch (error) { bad.add(label + ": request could not be filled: " + error.message); continue; }

            const validation = store.validateSubmit();
            const state = store.getState();

            // The one engine-only refusal in the matrix: a service request with
            // customer status unanswered.
            if (intent === "service_request" && status === "") {
              const only = validation.errors.map((e) => e.field + ":" + e.code).join(",");
              if (validation.ok || only !== "customerStatus:CUSTOMER_STATUS_REQUIRED") bad.add(label + ": expected only customerStatus required, got [" + only + "]");
              const wouldSend = T.payloadFromState(plain(state), intent, { requestId: "would-send", nowIso: new Date(made.clock.t).toISOString(), nowMs: made.clock.t, page: made.pageUrl, attribution: state.attribution, fbp: "", fbc: "" });
              if (wouldSend.customerStatus !== "not_sure") bad.add(label + ": placeholder for unanswered status is " + JSON.stringify(wouldSend.customerStatus));
              if (!W.validateV3(wouldSend).ok) bad.add(label + ": Worker would also reject: " + W.validateV3(wouldSend).errors);
              const before = made.bridge.calls.length;
              const result = await store.submit();
              if (result.status !== "invalid" || made.bridge.calls.length !== before) bad.add(label + ": submit without customer status was not stopped before the network");
              matrixStats.engineRefused += 1;
              continue;
            }

            if (!validation.ok) { bad.add(label + ": engine refuses a complete request: " + JSON.stringify(validation.errors.map((e) => e.field + ":" + e.code))); continue; }

            const upstreamBefore = matrixWorker.upstream.received.length;
            const result = await store.submit();
            if (!result.ok) { bad.add(label + ": Worker did not accept: " + result.status + " " + JSON.stringify(result.serverFields || result.message)); continue; }
            const payload = result.payload;
            const verdict = W.validateV3(payload);
            if (!verdict.ok) bad.add(label + ": validateV3 rejects " + verdict.errors);
            if (matrixWorker.upstream.received.length !== upstreamBefore + 1) { bad.add(label + ": forwarded " + (matrixWorker.upstream.received.length - upstreamBefore) + " times"); continue; }
            const forward = matrixWorker.upstream.received[matrixWorker.upstream.received.length - 1];
            matrixStats.accepted += 1;
            if (acceptedSamples.length < 400) acceptedSamples.push({ label, payload, forward, times, made });

            const say = (message) => bad.add(label + ": " + message);
            const service = intent === "service_request";
            const quote = W.calculateQuote(payload);

            // shape: exactly the live widget's keys, in its order
            if (JSON.stringify(Object.keys(payload)) !== JSON.stringify(WIDGET_PAYLOAD_KEYS)) say("payload keys differ from the live widget's: " + Object.keys(payload).filter((k) => !WIDGET_PAYLOAD_KEYS.includes(k)) + " / missing " + WIDGET_PAYLOAD_KEYS.filter((k) => !(k in payload)));
            // ids and stage
            const expectedStage = intent === "question" ? "question_submitted" : intent === "quote_delivery" ? "quote_requested" : custom ? "estimate_requested" : "service_requested";
            if (payload.stage !== expectedStage) say("stage " + payload.stage + " expected " + expectedStage);
            if (payload.eventId !== payload.requestId + ":" + expectedStage) say("eventId " + payload.eventId);
            if (forward.eventId !== payload.eventId || forward.requestId !== payload.requestId) say("forward ids differ");
            if (result.requestId !== payload.requestId || store.getState().receipt.requestId !== payload.requestId) say("receipt id differs");
            if (payload.schemaVersion !== "cloudflare-widget.v3" || payload.pricingVersion !== "2026-08-cloudflare-v1") say("versions");
            // plan
            if (payload.zip !== PLANS[planKey].zip || typeof payload.dogs !== "string" || payload.dogs !== PLANS[planKey].dogCount) say("zip/dogs");
            if (payload.frequencyId !== PLANS[planKey].frequency || payload.yardSizeId !== PLANS[planKey].yardSize) say("frequency/yard ids");
            if (JSON.stringify(payload.areaIds) !== JSON.stringify(PLANS[planKey].areas)) say("areaIds");
            if (payload.frequency !== W.FREQUENCIES[payload.frequencyId].label || payload.yardSize !== W.YARD_SIZES[payload.yardSizeId].label) say("labels differ from the Worker's");
            if (payload.areas !== payload.areaIds.map((id) => W.AREA_LABELS[id]).join(" & ")) say("areas label");
            // price
            if (custom) {
              if (payload.clientPriceCents !== null || payload.perVisitPrice !== "" || payload.customEstimate !== true) say("custom estimate carries a price: " + payload.clientPriceCents);
              if (JSON.stringify(payload.customReasons) !== JSON.stringify(quote.reasons)) say("customReasons " + payload.customReasons + " vs " + quote.reasons);
              if (forward.serverPriceCents !== null) say("forward price for custom");
            } else {
              if (typeof payload.clientPriceCents !== "number" || payload.clientPriceCents !== quote.priceCents) say("clientPriceCents " + payload.clientPriceCents + " vs Worker " + quote.priceCents);
              if (payload.perVisitPrice !== (quote.priceCents / 100).toFixed(2)) say("perVisitPrice " + payload.perVisitPrice);
              if (payload.customEstimate !== false || payload.customReasons.length) say("customEstimate flag on a priced plan");
              if (forward.serverPriceCents !== payload.clientPriceCents) say("forward price differs");
              if (PLAN_TYPE[planKey] === "onetime" && payload.clientPriceCents !== 8999) say("one-time is not 8999");
            }
            // status
            if (payload.customerStatus !== (status || "not_sure")) say("customerStatus " + payload.customerStatus);
            if (forward.customerStatus !== (status || "not_sure")) say("forward customerStatus");
            // strings
            if (!W.LAST_CLEANED.has(payload.lastCleaned)) say("lastCleaned");
            if (payload.lastCleaned !== WORKER_LAST_CLEANED[(matrixStats.total) % WORKER_LAST_CLEANED.length] || forward.lastCleaned !== payload.lastCleaned) say("lastCleaned is not the option chosen");
            matrixStringsSeen.lastCleaned.add(payload.lastCleaned);
            if (service) matrixStringsSeen.startTiming.add(payload.startTiming);
            if (service ? !W.START_TIMINGS.has(payload.startTiming) : payload.startTiming !== "") say("startTiming " + JSON.stringify(payload.startTiming));
            // contact
            if (payload.preferredContact !== contact || forward.preferredContact !== contact) say("preferredContact");
            const expectPhone = service || contact !== "email" || optional;
            if (payload.phone !== (expectPhone ? "3175550100" : "") || payload.phoneE164 !== (expectPhone ? "+13175550100" : "")) say("phone " + payload.phone);
            if (payload.email !== (contact === "email" || optional ? "test@example.com" : "")) say("email " + payload.email);
            if (payload.firstName !== "Test" || payload.lastName !== (service ? "Reviewer" : "")) say("names");
            if (payload.street !== (service ? "123 Example St" : "") || (service ? !payload.city : payload.city !== "") || payload.state !== "IN") say("address");
            if (service && forward.serviceAddress !== payload.street + ", " + payload.city + ", IN " + payload.zip) say("serviceAddress");
            // consent evidence: only for Text
            if (contact === "text") {
              if (payload.smsTransactionalConsent !== true || payload.consent !== "yes" || payload.consentVersion !== "service-sms-2026-08-v1") say("text consent evidence missing");
              if (payload.smsConsentCapturedAt !== times.consentAt) say("consent time " + payload.smsConsentCapturedAt + " is not the tick time " + times.consentAt);
              if (forward.smsTransactionalConsent !== true || forward.consentVersion !== "service-sms-2026-08-v1" || forward.smsConsentCapturedAt !== times.consentAt) say("forward consent evidence");
              if (!forward.quoteSummary.includes("Service SMS permission: Yes \u2014 service-sms-2026-08-v1 at " + times.consentAt)) say("summary consent line");
            } else {
              if (payload.smsTransactionalConsent !== false || payload.consent !== "no" || payload.consentVersion !== "" || payload.smsConsentCapturedAt !== "") say("consent evidence present for " + contact);
              if (forward.smsTransactionalConsent !== false || forward.consent !== "no" || forward.consentVersion !== "" || forward.smsConsentCapturedAt !== "") say("forward consent evidence present for " + contact);
              if (!forward.quoteSummary.includes("Service SMS permission: No")) say("summary consent line");
            }
            // terms evidence: only for a service request
            if (service) {
              if (payload.termsAccepted !== true || payload.termsVersion !== TERMS_VERSION || payload.termsAcceptedAt !== times.termsAt) say("terms evidence " + payload.termsAcceptedAt + " vs " + times.termsAt);
              if (forward.termsAccepted !== true || forward.termsVersion !== payload.termsVersion || forward.termsAcceptedAt !== times.termsAt) say("forward terms evidence");
              if (payload.notes !== "Submitted through transparent-price Cloudflare widget.") say("notes");
            } else {
              if (payload.termsAccepted !== false || payload.termsVersion !== "" || payload.termsAcceptedAt !== "" || payload.notes !== "") say("terms evidence on a non-service intent");
              if (forward.termsAccepted !== false || forward.termsVersion !== "" || forward.termsAcceptedAt !== "") say("forward terms evidence on a non-service intent");
            }
            // question
            const expectedQuestion = intent === "question" ? FAKE.question : intent === "quote_delivery" ? "Quote delivery requested by " + contact + "." : "";
            if (payload.question !== expectedQuestion) say("question " + JSON.stringify(payload.question));
            // honeypot
            if (payload.website !== "") say("website trap is not empty");
            // attribution, page, cookies
            if (optional) {
              const expectedAttribution = { utm_source: "meta", utm_medium: "paid", utm_campaign: "fall", utm_content: "ad1", utm_term: "scoop", gclid: "G1", wbraid: "W1", gbraid: "B1", fbclid: "F1" };
              if (JSON.stringify(payload.attribution) !== JSON.stringify(expectedAttribution)) say("attribution " + JSON.stringify(payload.attribution));
              if (JSON.stringify(forward.attribution) !== JSON.stringify(expectedAttribution)) say("forward attribution lost keys");
              if (payload.gclid !== "G1" || payload.fbclid !== "F1" || payload.fbp !== "fb.1.1700000000000.1234567890" || payload.fbc !== "fb.1.1700000000001.testclid") say("gclid/fbclid/fbp/fbc");
              if (forward.utmSource !== "meta" || forward.utmMedium !== "paid" || forward.utmCampaign !== "fall" || forward.gclid !== "G1" || forward.fbclid !== "F1" || forward.fbp !== payload.fbp || forward.fbc !== payload.fbc) say("forward attribution fields");
            } else {
              if (JSON.stringify(payload.attribution) !== "{}" || payload.gclid || payload.fbclid || payload.fbp || payload.fbc) say("attribution without parameters");
            }
            if (payload.page !== made.pageUrl || forward.page !== made.pageUrl) say("page " + payload.page);
            if (typeof payload.submittedAt !== "string" || Number.isNaN(Date.parse(payload.submittedAt))) say("submittedAt");
            // types
            const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
            const types = { dogs: "string", areaIds: "array", customReasons: "array", customEstimate: "boolean", smsTransactionalConsent: "boolean", termsAccepted: "boolean", attribution: "object", clientPriceCents: custom ? "null" : "number" };
            for (const key of Object.keys(payload)) {
              const want = types[key] || "string";
              if (typeOf(payload[key]) !== want) say("type of " + key + " is " + typeOf(payload[key]) + ", expected " + want);
            }
            // nothing stored that should not be
            const stored = JSON.stringify(made.storage.items) + JSON.stringify(made.storage.writes);
            for (const secret of ["Test", "Reviewer", "3175550100", "555-0100", "test@example.com", "123 Example St", "only a test question", payload.requestId]) {
              if (stored.includes(secret)) say("storage contains " + JSON.stringify(secret));
            }
            if (made.storage.items[C.STORAGE_KEYS.progress] !== undefined) say("progress not cleared after success");
          }
        }
      }
    }
  }
  bad.done("matrix");
  return matrixStats.accepted + " requests accepted by the whole Worker; " + matrixStats.engineRefused + " refused by the engine's own customer-status rule; " + matrixStats.notRepresentable + " combinations the engine does not offer (call for a quote, question/quote for a custom estimate); " + matrixStats.total + " combinations in all";
});

await check("the matrix covered all four stages and every reply method", () => {
  const stages = new Set(acceptedSamples.map((s) => s.payload.stage));
  assert.deepEqual([...stages].sort(), ["estimate_requested", "question_submitted", "quote_requested", "service_requested"]);
  assert.ok(matrixStats.accepted >= 150, "only " + matrixStats.accepted + " accepted");
  assert.equal(matrixStringsSeen.lastCleaned.size, 6, "last-cleanup options sent: " + [...matrixStringsSeen.lastCleaned]);
  assert.equal(matrixStringsSeen.startTiming.size, 4, "start-timing options sent: " + [...matrixStringsSeen.startTiming]);
});

/* ======================================================================
 * C. all 1,750 plans: price and acceptance
 * ==================================================================== */

group("C. clientPriceCents for every plan");

const AREA_SUBSETS = [["back"], ["front"], ["side"], ["back", "front"], ["back", "side"], ["front", "side"], ["back", "front", "side"]];
const FREQ_IDS = ["twice", "weekly", "biweekly", "onetime", "custom"];
const YARD_IDS = ["s", "m", "l", "xl", "over"];

function pureContext(requestId) {
  return { requestId: requestId || "pure-1", nowIso: "2026-10-07T15:00:00.000Z", nowMs: T0, page: SITE_ORIGIN + "/", attribution: {}, fbp: "", fbc: "" };
}
const baseStates = {};
function baseState(intent, contact, planKey) {
  const key = intent + "/" + contact + "/" + (planKey || "weekly");
  if (!baseStates[key]) baseStates[key] = plain(ready({}, planKey || "weekly", intent, contact).store.getState());
  return plain(baseStates[key]);
}
function engineErrors(state, intent) {
  return T.planErrors(state).concat(T.detailsErrors(state, intent)).concat(T.termsErrors(state, intent));
}

await check("10 dog counts x 5 frequencies x 5 yards x 7 area sets: engine-valid plans are accepted with the Worker's price; engine-invalid plans are rejected by the Worker on the same field", () => {
  const bad = problems();
  let valid = 0;
  let invalid = 0;
  for (let dogs = 1; dogs <= 10; dogs += 1) {
    for (const frequency of FREQ_IDS) {
      for (const yardSize of YARD_IDS) {
        for (const areas of AREA_SUBSETS) {
          const state = baseState("service_request", "text");
          Object.assign(state, { dogCount: String(dogs), frequency, yardSize, areas });
          const label = [dogs, frequency, yardSize, areas.join("+")].join("/");
          const errors = engineErrors(state, "service_request");
          const payload = T.payloadFromState(state, "service_request", pureContext());
          const verdict = W.validateV3(payload);
          const reference = W.calculateQuote({ dogs: String(dogs), frequencyId: frequency, yardSizeId: yardSize, areaIds: areas });
          if (errors.length === 0) {
            valid += 1;
            if (!verdict.ok) bad.add(label + ": engine valid, Worker rejects " + verdict.errors);
            if (reference.custom ? payload.clientPriceCents !== null : payload.clientPriceCents !== reference.priceCents) bad.add(label + ": clientPriceCents " + payload.clientPriceCents + " vs " + reference.priceCents);
            if (payload.customEstimate !== reference.custom) bad.add(label + ": customEstimate");
            if (payload.customEstimate !== (frequency === "custom")) bad.add(label + ": customEstimate is not exactly 'frequency is custom' (spec 17.1 item 4)");
          } else {
            invalid += 1;
            if (verdict.ok) bad.add(label + ": engine invalid (" + errors.map((e) => e.field) + ") but Worker accepts");
            if (errors.some((e) => e.field !== "frequency")) bad.add(label + ": unexpected engine field " + errors.map((e) => e.field));
            if (!verdict.errors.includes("frequencyId")) bad.add(label + ": Worker field is " + verdict.errors);
          }
        }
      }
    }
  }
  bad.done();
  assert.equal(valid + invalid, 1750);
  return valid + " valid plans priced identically; " + invalid + " invalid plans refused by both";
});

await check("through the store: a plan the Worker would reject cannot be selected (frequency refused or reconciled), for every dog count and yard", () => {
  const bad = problems();
  for (let dogs = 1; dogs <= 10; dogs += 1) {
    for (const yardSize of YARD_IDS) {
      for (const frequency of FREQ_IDS) {
        // order 1: dogs, yard, then frequency
        let made = makeStore();
        made.store.set({ dogCount: String(dogs) });
        made.store.set({ zip: "46032" });
        made.store.set({ yardSize });
        made.store.set({ areas: ["back"] });
        made.store.set({ frequency });
        let state = made.store.getState();
        let reference = W.calculateQuote({ dogs: state.dogCount, frequencyId: state.frequency, yardSizeId: state.yardSize, areaIds: state.areas });
        if (state.frequency && !reference.ok) bad.add("after dogs/yard/frequency " + [dogs, yardSize, frequency] + " the store holds " + state.frequency + " which the Worker rejects");
        // order 2: frequency chosen first (1 dog, small yard), then dogs and yard change under it
        made = makeStore();
        made.store.set({ dogCount: "1" });
        made.store.set({ zip: "46032" });
        made.store.set({ yardSize: "s" });
        made.store.set({ areas: ["back"] });
        made.store.set({ frequency });
        made.store.set({ dogCount: String(dogs) });
        made.store.set({ yardSize });
        state = made.store.getState();
        reference = W.calculateQuote({ dogs: state.dogCount, frequencyId: state.frequency, yardSizeId: state.yardSize, areaIds: state.areas });
        if (state.frequency && !reference.ok) bad.add("after later change to " + [dogs, yardSize] + " the store still holds " + state.frequency);
        if (made.store.validatePlan().ok !== (state.frequency !== "" && reference.ok)) bad.add("validatePlan disagrees with the Worker for " + [dogs, yardSize, frequency]);
      }
    }
  }
  bad.done();
});

/* ======================================================================
 * D. every Worker rejection is caught first, on the right field
 * ==================================================================== */

group("D. Worker rejections are caught first by the engine, keyed to the right field");

// Which of the Worker's reported field names did the engine NOT flag?
// Two follow-on reports are not counted, because the engine already flagged
// their cause and reports only the cause:
//   - an invalid intent: the engine stops at "intent" (it cannot know which
//     form applies), while the Worker goes on to list the service fields;
//   - "frequencyId" while another plan answer (dogs, yard size, areas) is
//     missing or unknown: the Worker reports the frequency/dogs or
//     frequency/yard combination at the same time; the engine, like the live
//     widget, reports the missing answer first and the combination only once
//     nothing is missing (spec 4.2.3). A separate check below proves the
//     frequency error does appear as soon as the missing answer is given.
const cascadeCounts = { invalidIntent: 0, frequencyBesideDogs: 0 };
function uncoveredWorkerFields(workerErrors, engineErrorList, intent) {
  const flagged = new Set(engineErrorList.map((e) => e.field));
  if (!["service_request", "quote_delivery", "question"].includes(intent)) {
    cascadeCounts.invalidIntent += 1;
    return flagged.has("intent") ? [] : ["intent"];
  }
  const missing = [];
  for (const serverField of workerErrors) {
    const mapped = C.SERVER_FIELD_MAP[serverField];
    if (!mapped) { missing.push("(unmapped) " + serverField); continue; }
    if (mapped.field === null) { missing.push("(form-level) " + serverField); continue; }
    if (flagged.has(mapped.field)) continue;
    if (serverField === "frequencyId" && (flagged.has("dogCount") || flagged.has("yardSize") || flagged.has("areas"))) { cascadeCounts.frequencyBesideDogs += 1; continue; }
    missing.push(serverField + " -> " + mapped.field);
  }
  return missing;
}

// Each case breaks ONE thing in an otherwise valid request.
//   field   the engine field key that must carry the error
//   server  the Worker field name(s) that must be reported
//   patch   how a visitor could get there through store.set (null = cannot be typed)
const BREAKS = [
  { name: "first name empty", intent: "service_request", contact: "text", mutate: (s) => { s.firstName = ""; }, field: "firstName", server: ["firstName"], patch: { firstName: "" } },
  { name: "first name only spaces", intent: "quote_delivery", contact: "text", mutate: (s) => { s.firstName = "   "; }, field: "firstName", server: ["firstName"], patch: { firstName: "   " } },
  { name: "last name empty (service)", intent: "service_request", contact: "text", mutate: (s) => { s.lastName = ""; }, field: "lastName", server: ["lastName"], patch: { lastName: "" } },
  { name: "street empty (service)", intent: "service_request", contact: "email", mutate: (s) => { s.address = " "; }, field: "address", server: ["street"], patch: { address: " " } },
  { name: "city empty (service)", intent: "service_request", contact: "call", mutate: (s) => { s.city = ""; }, field: "city", server: ["city"], patch: { city: "" } },
  { name: "start timing empty (service)", intent: "service_request", contact: "text", mutate: (s) => { s.startTiming = ""; }, field: "startTiming", server: ["startTiming"], patch: { startTiming: "" } },
  { name: "start timing not an exact option", intent: "service_request", contact: "text", mutate: (s) => { s.startTiming = "as soon as possible"; }, field: "startTiming", server: ["startTiming"], patch: null },
  { name: "terms not accepted (service)", intent: "service_request", contact: "text", mutate: (s) => { s.termsAccepted = false; s.termsAcceptedAt = ""; }, field: "termsAccepted", server: ["termsAccepted"], patch: { termsAccepted: false } },
  { name: "last cleanup empty (service)", intent: "service_request", contact: "text", mutate: (s) => { s.lastCleaned = ""; }, field: "lastCleaned", server: ["lastCleaned"], patch: { lastCleaned: "" } },
  { name: "last cleanup empty (quote)", intent: "quote_delivery", contact: "email", mutate: (s) => { s.lastCleaned = ""; }, field: "lastCleaned", server: ["lastCleaned"], patch: { lastCleaned: "" } },
  { name: "last cleanup empty (question)", intent: "question", contact: "call", mutate: (s) => { s.lastCleaned = ""; }, field: "lastCleaned", server: ["lastCleaned"], patch: { lastCleaned: "" } },
  { name: "last cleanup with a hyphen instead of an en dash", intent: "service_request", contact: "text", mutate: (s) => { s.lastCleaned = "2-3 weeks"; }, field: "lastCleaned", server: ["lastCleaned"], patch: null },
  { name: "phone missing for Text", intent: "quote_delivery", contact: "text", mutate: (s) => { s.phone = ""; }, field: "phone", server: ["phone"], patch: { phone: "" } },
  { name: "phone missing for Phone call", intent: "question", contact: "call", mutate: (s) => { s.phone = ""; }, field: "phone", server: ["phone"], patch: { phone: "" } },
  { name: "phone one digit short for Text", intent: "service_request", contact: "text", mutate: (s) => { s.phone = "(317) 555-010"; }, field: "phone", server: ["phone"], patch: { phone: "317555010" } },
  { name: "email missing for Email", intent: "question", contact: "email", mutate: (s) => { s.email = ""; }, field: "email", server: ["email"], patch: { email: "" } },
  { name: "email malformed for Email", intent: "service_request", contact: "email", mutate: (s) => { s.email = "test@example"; }, field: "email", server: ["email"], patch: { email: "test@example" } },
  { name: "optional email malformed while replying by Text", intent: "service_request", contact: "text", mutate: (s) => { s.email = "not an email"; }, field: "email", server: ["email"], patch: { email: "not an email" } },
  { name: "Text without the consent box", intent: "service_request", contact: "text", mutate: (s) => { s.smsConsent = false; s.smsConsentCapturedAt = ""; }, field: "smsConsent", server: ["smsTransactionalConsent", "consentVersion"], patch: { smsConsent: false } },
  { name: "Text without the consent box (quote)", intent: "quote_delivery", contact: "text", mutate: (s) => { s.smsConsent = false; s.smsConsentCapturedAt = ""; }, field: "smsConsent", server: ["smsTransactionalConsent", "consentVersion"], patch: { smsConsent: false } },
  { name: "question shorter than 5 characters", intent: "question", contact: "email", mutate: (s) => { s.question = "abcd"; }, field: "question", server: ["question"], patch: { question: "abcd" } },
  { name: "question only spaces", intent: "question", contact: "text", mutate: (s) => { s.question = "        "; }, field: "question", server: ["question"], patch: { question: "        " } },
  { name: "ZIP empty", intent: "service_request", contact: "text", mutate: (s) => { s.zip = ""; }, field: "zip", server: ["zip"], patch: { zip: "" } },
  { name: "ZIP four digits", intent: "quote_delivery", contact: "email", mutate: (s) => { s.zip = "4603"; }, field: "zip", server: ["zip"], patch: { zip: "4603" } },
  { name: "ZIP outside the service area", intent: "service_request", contact: "text", mutate: (s) => { s.zip = "46201"; }, field: "zip", server: ["zip"], patch: { zip: "46201" } },
  { name: "ZIP outside the service area (question)", intent: "question", contact: "email", mutate: (s) => { s.zip = "85701"; }, field: "zip", server: ["zip"], patch: { zip: "85701" } },
  { name: "dog count missing", intent: "service_request", contact: "text", mutate: (s) => { s.dogCount = ""; }, field: "dogCount", server: ["dogs"], patch: { dogCount: "" } },
  { name: "dog count 11", intent: "service_request", contact: "text", mutate: (s) => { s.dogCount = "11"; }, field: "dogCount", server: ["dogs"], patch: null },
  { name: "dog count 0", intent: "service_request", contact: "text", mutate: (s) => { s.dogCount = "0"; }, field: "dogCount", server: ["dogs"], patch: null },
  { name: "frequency missing", intent: "service_request", contact: "text", mutate: (s) => { s.frequency = ""; }, field: "frequency", server: ["frequencyId"], patch: { frequency: "" } },
  { name: "frequency unknown", intent: "service_request", contact: "text", mutate: (s) => { s.frequency = "monthly"; }, field: "frequency", server: ["frequencyId"], patch: null },
  { name: "weekly with 6 dogs", intent: "service_request", contact: "text", mutate: (s) => { s.dogCount = "6"; }, field: "frequency", server: ["frequencyId"], patch: null },
  { name: "one-time over 1 acre", intent: "service_request", contact: "text", mutate: (s) => { s.frequency = "onetime"; s.yardSize = "over"; }, field: "frequency", server: ["frequencyId"], patch: null },
  { name: "yard size missing", intent: "service_request", contact: "text", mutate: (s) => { s.yardSize = ""; }, field: "yardSize", server: ["yardSizeId"], patch: { yardSize: "" } },
  { name: "yard size unknown", intent: "service_request", contact: "text", mutate: (s) => { s.yardSize = "xxl"; }, field: "yardSize", server: ["yardSizeId"], patch: null },
  { name: "no areas", intent: "service_request", contact: "text", mutate: (s) => { s.areas = []; }, field: "areas", server: ["areaIds"], patch: { areas: [] } },
  { name: "unknown area", intent: "service_request", contact: "text", mutate: (s) => { s.areas = ["back", "roof"]; }, field: "areas", server: ["areaIds"], patch: null },
  { name: "customer status not one of the three", intent: "service_request", contact: "text", mutate: (s) => { s.customerStatus = "vip"; }, field: "customerStatus", server: ["customerStatus"], patch: null },
  { name: "reply method unknown", intent: "question", contact: "email", mutate: (s) => { s.preferredContact = "fax"; }, field: "preferredContact", server: ["preferredContact"], patch: null },
  { name: "intent unknown", intent: "service_request", contact: "text", mutate: (s) => { s.intent = "newsletter"; }, field: "intent", server: ["intent"], patch: null }
];

await check("40 single breakages: the Worker rejects each, the engine had already flagged the matching field, and SERVER_FIELD_MAP points back to it", () => {
  const bad = problems();
  for (const item of BREAKS) {
    const state = baseState(item.intent, item.contact);
    item.mutate(state);
    const intent = state.intent;
    const errors = engineErrors(state, intent);
    const payload = T.payloadFromState(state, intent, pureContext());
    const verdict = W.validateV3(payload);
    if (verdict.ok) { bad.add(item.name + ": the Worker accepts this payload"); continue; }
    for (const serverField of item.server) if (!verdict.errors.includes(serverField)) bad.add(item.name + ": Worker reported " + verdict.errors + ", expected " + serverField);
    const engineError = errors.find((e) => e.field === item.field);
    if (!engineError) { bad.add(item.name + ": engine errors are [" + errors.map((e) => e.field) + "], expected " + item.field); continue; }
    if (engineError.step !== C.FIELD_STEP[item.field] || !engineError.message) bad.add(item.name + ": error has step " + engineError.step + " / message " + JSON.stringify(engineError.message));
    const uncovered = uncoveredWorkerFields(verdict.errors, errors, intent);
    if (uncovered.length) bad.add(item.name + ": Worker also names " + uncovered + " which the engine did not flag (engine: " + errors.map((e) => e.field) + ")");
  }
  bad.done();
});

await check("a frequency/dogs or frequency/yard conflict hidden behind a missing answer is reported as soon as that answer is given", () => {
  const cases = [
    [{ dogCount: "10", frequency: "twice", areas: [] }, "areas", { areas: ["back"] }],
    [{ dogCount: "9", frequency: "weekly", yardSize: "" }, "yardSize", { yardSize: "m" }],
    [{ frequency: "onetime", yardSize: "over", areas: [] }, "areas", { areas: ["side"] }],
    [{ dogCount: "", frequency: "biweekly" }, "dogCount", { dogCount: "5" }]
  ];
  for (const [broken, firstField, repair] of cases) {
    const state = Object.assign(baseState("service_request", "text"), broken);
    let errors = T.planErrors(state);
    assert.ok(errors.some((e) => e.field === firstField), JSON.stringify(broken));
    assert.ok(!W.validateV3(T.payloadFromState(state, "service_request", pureContext())).ok);
    Object.assign(state, repair);
    errors = T.planErrors(state);
    assert.deepEqual(errors.map((e) => e.field), ["frequency"], JSON.stringify(broken) + " then " + JSON.stringify(repair));
    assert.deepEqual(W.validateV3(T.payloadFromState(state, "service_request", pureContext())).errors, ["frequencyId"]);
  }
});

await check("the same breakages typed through the store: submit() stops with status 'invalid' on that field and nothing reaches the network", async () => {
  const bad = problems();
  const worker = makeWorker();
  let typed = 0;
  let untypable = 0;
  for (const item of BREAKS) {
    const made = ready({ worker }, "weekly", item.intent, item.contact);
    const store = made.store;
    if (item.patch === null) {
      // The store must refuse to hold the value at all.
      const probe = baseState(item.intent, item.contact);
      const before = plain(probe);
      item.mutate(probe);
      const changedKeys = Object.keys(probe).filter((key) => JSON.stringify(probe[key]) !== JSON.stringify(before[key]));
      const beforeState = plain(store.getState());
      for (const key of changedKeys) {
        if (["zip", "dogCount", "yardSize", "areas", "frequency", "intent", "customerStatus", "preferredContact", "startTiming", "lastCleaned"].includes(key)) store.set({ [key]: probe[key] });
      }
      const after = store.getState();
      const reference = W.calculateQuote({ dogs: after.dogCount, frequencyId: after.frequency, yardSizeId: after.yardSize, areaIds: after.areas });
      const held = changedKeys.every((key) => JSON.stringify(after[key]) === JSON.stringify(probe[key]));
      if (held && !(after.frequency !== "" && reference.ok) && item.field !== "frequency") bad.add(item.name + ": the store accepted the bad value " + JSON.stringify(changedKeys.map((k) => after[k])));
      if (held && ["startTiming", "lastCleaned", "customerStatus", "preferredContact", "intent"].includes(item.field)) bad.add(item.name + ": the store holds the bad value");
      // Whatever the store did with it, a submit may only succeed with a payload the Worker accepts.
      if (store.getState().intent === "service_request" && !store.getState().termsAccepted) store.set({ termsAccepted: true });
      const result = await store.submit();
      if (result.ok && !W.validateV3(result.payload).ok) bad.add(item.name + ": submit succeeded with a payload the Worker rejects");
      if (!result.ok && result.status !== "invalid") bad.add(item.name + ": status " + result.status);
      untypable += 1;
      void beforeState;
      continue;
    }
    store.set(item.patch);
    // Re-tick the terms box (any edit clears it) unless the terms are the thing under test.
    if (item.intent === "service_request" && item.field !== "termsAccepted") store.set({ termsAccepted: true });
    const logBefore = store.submissionLog.length;
    const result = await store.submit();
    typed += 1;
    if (result.ok) { bad.add(item.name + ": submit succeeded"); continue; }
    if (result.status !== "invalid") bad.add(item.name + ": status " + result.status + ", expected invalid");
    const hit = (result.fieldErrors || []).find((e) => e.field === item.field);
    if (!hit) bad.add(item.name + ": fieldErrors are [" + (result.fieldErrors || []).map((e) => e.field) + "], expected " + item.field);
    else if (hit.step !== C.FIELD_STEP[item.field]) bad.add(item.name + ": step " + hit.step);
    if (made.bridge.calls.length !== 0) bad.add(item.name + ": " + made.bridge.calls.length + " network call(s) were made");
    if (store.submissionLog.length !== logBefore) bad.add(item.name + ": a payload was logged for an invalid request");
    if (store.getState().submitting || store.getState().locked) bad.add(item.name + ": left submitting or locked");
  }
  assert.equal(worker.upstream.calls, worker.upstream.received.length);
  bad.done();
  return typed + " typed through store.set; " + untypable + " cannot be typed (the store refuses the value)";
});

await check("fieldRules() agrees with validation and with the Worker: every field marked required really is, every optional or hidden field can stay empty, for each intent x reply method", () => {
  const bad = problems();
  const empty = { customerStatus: "", firstName: "", lastName: "", phone: "", email: "", address: "", city: "", zip: "", startTiming: "", lastCleaned: "", question: "", smsConsent: false, termsAccepted: false };
  for (const intent of ["service_request", "quote_delivery", "question"]) {
    for (const contact of intent === "quote_delivery" ? ["text", "email"] : ["text", "email", "call"]) {
      const full = baseState(intent, contact);
      // fill every optional field too, so that blanking one is the only change
      Object.assign(full, { email: FAKE.email, phone: "(317) 555-0100" });
      const rules = T.fieldRules(full, intent);
      const label = intent + "/" + contact;
      if (engineErrors(full, intent).length) { bad.add(label + ": the filled base is not valid: " + engineErrors(full, intent).map((e) => e.field)); continue; }
      const offered = rules.find((rule) => rule.key === "preferredContact").options.map((option) => option.id);
      if (offered.includes("call") !== (intent !== "quote_delivery")) bad.add(label + ": reply methods offered are " + offered);
      for (const rule of rules) {
        if (rule.key === "preferredContact") continue;
        const state = plain(full);
        state[rule.key] = empty[rule.key];
        const errors = engineErrors(state, intent);
        const flagged = errors.some((e) => e.field === rule.key);
        const verdict = W.validateV3(T.payloadFromState(state, intent, pureContext()));
        if (rule.shown && rule.required && !flagged) bad.add(label + ": " + rule.key + " is marked required but may be left empty");
        if (rule.shown && !rule.required && flagged) bad.add(label + ": " + rule.key + " is marked optional but is demanded: " + errors.find((e) => e.field === rule.key).message);
        if (!rule.shown && flagged && rule.key !== "zip") bad.add(label + ": hidden field " + rule.key + " is demanded");
        if (!flagged && !verdict.ok) bad.add(label + ": " + rule.key + " empty passes the engine but the Worker rejects " + verdict.errors);
      }
      // the stage each intent button promises is the stage the payload carries
      const made = ready({}, "weekly", intent, contact);
      const option = made.store.intentOptions().find((item) => item.id === intent);
      const payload = made.store.buildPayload().payload;
      if (!option.available || option.stage !== payload.stage) bad.add(label + ": intentOptions stage " + option.stage + " vs payload " + payload.stage);
    }
  }
  bad.done();
});

await check("200,000 random states (valid and broken values mixed): engine-valid => Worker accepts; Worker rejects => engine already flagged every field the Worker names", () => {
  const pick = (list) => list[Math.floor(rand() * list.length)];
  let seed = 20261007;
  function rand() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
  const pools = {
    intent: ["service_request", "service_request", "quote_delivery", "question", "newsletter", ""],
    preferredContact: ["text", "text", "email", "call", "fax", ""],
    zip: ["46032", "46280", "46011", "46077", "46201", "4603", "", "abcde", "00000"],
    dogCount: ["1", "2", "3", "4", "5", "6", "9", "10", "", "0", "11", "2.5", "abc"],
    frequency: ["twice", "weekly", "biweekly", "onetime", "custom", "", "monthly"],
    yardSize: ["s", "m", "l", "xl", "over", "", "xxl"],
    areas: [["back"], ["front", "side"], ["back", "front", "side"], [], ["roof"], ["back", "roof"]],
    customerStatus: ["", "new", "returning", "not_sure", "vip"],
    firstName: ["Test", " Test ", "", "   "],
    lastName: ["Reviewer", "", " "],
    phone: ["", "(317) 555-0100", "3175550100", "(317) 555-010", "13175550100", "abc", "(1"],
    email: ["", "test@example.com", " Test@Example.COM ", "bad", "a@b", "a b@c.d", "x".repeat(244) + "@e.example"],
    smsConsent: [true, true, false],
    address: ["123 Example St", "", "  "],
    city: ["Carmel", "", " "],
    startTiming: ["As soon as possible", "Within the next week", "In the next few weeks", "Just researching for now", "", "Tomorrow"],
    lastCleaned: ["Within 1 week", "2\u20133 weeks", "About 1 month", "2\u20134 months", "5\u20136 months", "More than 6 months", "", "2-3 weeks"],
    question: ["", "abcd", "abcde", "    ab   ", "Is this only a test question?"],
    termsAccepted: [true, true, false]
  };
  const bad = problems();
  let engineValid = 0;
  let workerRejects = 0;
  let engineOnly = 0;
  // Start from sound values, then replace 0 to 3 fields with anything from the
  // mixed pools, so that valid and broken requests both come up often.
  const sound = {
    intent: ["service_request", "quote_delivery", "question"], preferredContact: ["text", "email", "call"], zip: ["46032", "46280", "46011", "46077"],
    dogCount: ["1", "2", "3", "4", "5", "6", "9", "10"], frequency: ["twice", "weekly", "biweekly", "onetime", "custom"], yardSize: ["s", "m", "l", "xl", "over"],
    areas: [["back"], ["front", "side"], ["back", "front", "side"]], customerStatus: ["", "new", "returning", "not_sure"], firstName: ["Test", " Test "], lastName: ["Reviewer"],
    phone: ["(317) 555-0100", "3175550100", "13175550100"], email: ["test@example.com", " Test@Example.COM ", ""], smsConsent: [true], address: ["123 Example St"], city: ["Carmel"],
    startTiming: ["As soon as possible", "Within the next week", "In the next few weeks", "Just researching for now"],
    lastCleaned: ["Within 1 week", "2–3 weeks", "About 1 month", "2–4 months", "5–6 months", "More than 6 months"], question: ["abcde", "Is this only a test question?"], termsAccepted: [true]
  };
  const keys = Object.keys(pools);
  for (let i = 0; i < 200000; i += 1) {
    const state = { smsConsentCapturedAt: "", termsAcceptedAt: "" };
    for (const key of keys) state[key] = pick(sound[key]);
    const breaks = Math.floor(rand() * 4);
    for (let b = 0; b < breaks; b += 1) { const key = pick(keys); state[key] = pick(pools[key]); }
    const intent = state.intent;
    const errors = engineErrors(state, intent);
    const payload = T.payloadFromState(state, intent, pureContext());
    const verdict = W.validateV3(payload);
    if (errors.length === 0) {
      engineValid += 1;
      if (!verdict.ok && bad.count < 20) bad.add("engine valid but Worker rejects " + verdict.errors + " for " + JSON.stringify(state));
    }
    if (!verdict.ok) {
      workerRejects += 1;
      if (errors.length === 0 && bad.count < 20) bad.add("Worker rejects " + verdict.errors + " but the engine has no error for " + JSON.stringify(state));
      const uncovered = uncoveredWorkerFields(verdict.errors, errors, intent);
      if (uncovered.length && bad.count < 20) bad.add("Worker names " + uncovered + ", engine flagged [" + errors.map((e) => e.field) + "] for " + JSON.stringify(state));
    } else if (errors.length) {
      engineOnly += 1;
      // Stricter-than-Worker refusals must all be marked as the engine's own rules.
      const unmarked = errors.filter((e) => e.engineOnly !== true);
      if (unmarked.length && bad.count < 20) bad.add("engine refuses on " + unmarked.map((e) => e.field + ":" + e.code) + " (not marked engineOnly) but the Worker accepts: " + JSON.stringify(state));
    }
  }
  bad.done();
  return engineValid + " engine-valid states all accepted; " + workerRejects + " Worker rejections all pre-flagged on the right field (" + cascadeCounts.invalidIntent + " with an invalid intent, where the engine reports only the intent; " + cascadeCounts.frequencyBesideDogs + " where the Worker also names the frequency while another plan answer is missing and the engine reports that answer first); " + engineOnly + " refused only by the engine's own stricter rules";
});

/* ======================================================================
 * E. request ids and event ids
 * ==================================================================== */

group("E. requestId and eventId");

function withoutLedger(worker, fn) {
  const full = worker.holder.env;
  worker.holder.env = { GHL_WEBHOOK_URL_V3: UPSTREAM_URL };
  return Promise.resolve(fn()).finally(() => { worker.holder.env = full; });
}

await check("503 then retry: same requestId, same eventId, byte-identical payload (timestamps and consent evidence kept), forwarded exactly once", async () => {
  const worker = makeWorker();
  const made = ready({ worker });
  const first = await withoutLedger(worker, () => made.store.submit());
  assert.equal(first.status, "unavailable");
  assert.equal(first.httpStatus, 503);
  assert.equal(first.retryAllowed, true);
  assert.equal(first.locked, false);
  assert.equal(first.message, "We could not connect to save your request. Please try again or call (317) 961-5865.");
  assert.equal(made.store.getState().locked, null);
  assert.equal(made.store.getState().submitting, false);
  assert.equal(worker.upstream.received.length, 0);
  made.clock.t += 60000; // a minute later
  made.cookies._fbp = "fb.1.later.cookie"; // retry-time cookies must not change the request
  const second = await made.store.submit();
  assert.equal(second.ok, true);
  assert.equal(second.requestId, first.requestId);
  assert.deepEqual(second.payload, first.payload);
  assert.equal(second.payload.eventId, first.requestId + ":service_requested");
  assert.equal(worker.upstream.received.length, 1);
  assert.equal(made.ids.length, 1, "exactly one id was generated");
});

await check("reply lost after the Worker accepted (15 s timeout): the exact timeout message, retry reuses the id, the Worker replays its stored receipt, the lead is forwarded once", async () => {
  const worker = makeWorker();
  const gtag = [];
  const fbq = [];
  const made = ready({ worker, options: { sinks: { gtag: (...a) => gtag.push(a), fbq: (...a) => fbq.push(a) } } });
  made.bridge.mode = "lose-reply";
  const pending = made.store.submit();
  assert.equal(made.store.getState().submitting, true);
  // while sending: no second submit, no edits, no reset
  assert.equal((await made.store.submit()).status, "busy");
  assert.equal(made.store.set({ firstName: "Changed" }).ok, false);
  assert.equal(made.store.reset(), false);
  assert.equal(made.store.flow().primaryAction, "none");
  await until(() => made.bridge.lostReplies === 1, "the Worker to process the first attempt");
  assert.equal(worker.upstream.received.length, 1);
  const submitTimer = made.timers.find((timer) => timer.ms === 15000);
  assert.ok(submitTimer, "a 15000 ms abort timer was set");
  made.fireTimers();
  const first = await pending;
  assert.equal(first.status, "timeout");
  assert.equal(first.message, "This is taking longer than expected. Please try again or call (317) 961-5865.");
  assert.equal(first.retryAllowed, true);
  assert.equal(made.store.getState().locked, null);
  assert.equal(made.store.getState().step !== "done", true);
  assert.equal(gtag.filter((call) => call[1] === "generate_lead").length, 0, "no conversion before success");
  made.bridge.mode = "normal";
  made.clock.t += 20000;
  const second = await made.store.submit();
  assert.equal(second.ok, true);
  assert.equal(second.requestId, first.requestId);
  assert.deepEqual(second.payload, first.payload);
  assert.equal(worker.upstream.received.length, 1, "the lead was forwarded twice");
  // conversions: once, with the id the Worker would use for its server-side Lead
  const forward = worker.upstream.received[0];
  assert.equal(gtag.filter((call) => call[1] === "generate_lead").length, 1);
  assert.equal(gtag.filter((call) => call[1] === "conversion").length, 1);
  const lead = fbq.filter((call) => call[0] === "track" && call[1] === "Lead");
  assert.equal(lead.length, 1);
  assert.equal(lead[0][3].eventID, forward.eventId);
  assert.equal(lead[0][2].value, forward.serverPriceCents / 100);
  assert.equal(gtag.find((call) => call[1] === "generate_lead")[2].event_id, forward.eventId);
  assert.equal(gtag.find((call) => call[1] === "generate_lead")[2].transaction_id, forward.requestId);
});

await check("network failure before the Worker is reached: plain message (never the browser's text), retry reuses the id", async () => {
  const worker = makeWorker();
  const made = ready({ worker }, "onetime", "question", "email");
  made.bridge.mode = "network-fail";
  const first = await made.store.submit();
  assert.equal(first.status, "network");
  assert.equal(first.message, "We could not send this request. Please try again or call (317) 961-5865.");
  assert.ok(!/Failed to fetch/.test(first.message));
  assert.equal(first.retryAllowed, true);
  assert.equal(worker.upstream.received.length, 0);
  made.bridge.mode = "normal";
  const second = await made.store.submit();
  assert.equal(second.ok, true);
  assert.equal(second.requestId, first.requestId);
  assert.equal(second.payload.eventId, first.requestId + ":question_submitted");
});

const MATERIAL_CHANGES = [
  ["first name", (s) => s.set({ firstName: "Tess" })],
  ["last name", (s) => s.set({ lastName: "Checker" })],
  ["phone", (s) => s.set({ phone: "3175550101" })],
  ["email added", (s) => s.set({ email: "test@example.com" })],
  ["street", (s) => s.set({ address: "456 Sample Ave" })],
  ["city", (s) => s.set({ city: "Westfield" })],
  ["ZIP", (s) => s.set({ zip: "46033" })],
  ["dogs", (s) => s.set({ dogCount: "3" })],
  ["yard size", (s) => s.set({ yardSize: "l" })],
  ["areas", (s) => s.set({ areas: ["back", "front", "side"] })],
  ["frequency", (s) => s.set({ frequency: "twice" })],
  ["last cleanup", (s) => s.set({ lastCleaned: "5\u20136 months" })],
  ["start timing", (s) => s.set({ startTiming: "Just researching for now" })],
  ["customer status", (s) => s.set({ customerStatus: "returning" })],
  ["reply method to call", (s) => s.set({ preferredContact: "call" })],
  ["reply method to email", (s) => s.set({ preferredContact: "email" })],
  ["reply method back to text", (s) => { s.set({ preferredContact: "text" }); s.set({ smsConsent: true }); }],
  ["frequency to custom (stage changes)", (s) => s.set({ frequency: "custom" })],
  ["frequency to one-time", (s) => s.set({ frequency: "onetime" })],
  ["intent to question", (s) => { s.set({ intent: "question" }); s.set({ question: FAKE.question }); }],
  ["question text", (s) => s.set({ question: "A different test question?" })],
  ["intent to quote delivery", (s) => s.set({ intent: "quote_delivery" })],
  ["intent back to service request", (s) => s.set({ intent: "service_request" })]
];

await check("after a failed attempt, each of 23 material changes makes a NEW requestId and eventId (and the Worker's own fingerprint changed too)", async () => {
  const worker = makeWorker();
  const made = ready({ worker });
  const bad = problems();
  await withoutLedger(worker, async () => {
    let previous = await made.store.submit();
    assert.equal(previous.status, "unavailable");
    let previousFp = await workerFingerprintOf(previous.payload);
    const seen = new Set([previous.requestId]);
    for (const [name, change] of MATERIAL_CHANGES) {
      change(made.store);
      if (made.store.getState().intent === "service_request") made.store.set({ termsAccepted: true });
      const next = await made.store.submit();
      if (next.status !== "unavailable") { bad.add(name + ": status " + next.status + " " + JSON.stringify((next.fieldErrors || []).map((e) => e.field))); continue; }
      const fp = await workerFingerprintOf(next.payload);
      if (fp === previousFp) bad.add(name + ": the Worker's fingerprint did not change (test is not material)");
      if (seen.has(next.requestId)) bad.add(name + ": requestId " + next.requestId + " was reused after a material change");
      if (next.payload.eventId !== next.requestId + ":" + next.payload.stage) bad.add(name + ": eventId " + next.payload.eventId);
      seen.add(next.requestId);
      previous = next;
      previousFp = fp;
    }
  });
  bad.done();
});

await check("non-material changes keep the SAME requestId and resend the identical payload: time passing, cookies, consent and terms re-ticked, spacing, phone formatting, email case, area order", async () => {
  const worker = makeWorker();
  const made = ready({ worker }, "weekly", "service_request", "text", { optional: true });
  const bad = problems();
  await withoutLedger(worker, async () => {
    const first = await made.store.submit();
    assert.equal(first.status, "unavailable");
    const firstFp = await workerFingerprintOf(first.payload);
    const steps = [
      ["time passes", () => { made.clock.t += 600000; }],
      ["cookies change", () => { made.cookies._fbp = "fb.1.2.3"; made.cookies._fbc = "fb.1.2.clid"; }],
      ["consent unticked and ticked again", (s) => { s.set({ smsConsent: false }); made.clock.t += 5; s.set({ smsConsent: true }); }],
      ["terms unticked and ticked again", (s) => { s.set({ termsAccepted: false }); made.clock.t += 5; s.set({ termsAccepted: true }); }],
      ["first name retyped with spaces", (s) => { s.set({ firstName: "  Test " }); }],
      ["phone retyped with country code", (s) => { s.set({ phone: "+1 317-555-0100" }); }],
      ["email retyped in capitals", (s) => { s.set({ email: "TEST@Example.com " }); }],
      ["areas chosen in the other order", (s) => { s.set({ areas: ["front", "back"] }); }],
      ["reply method changed and changed back", (s) => { s.set({ preferredContact: "email" }); s.set({ preferredContact: "text" }); s.set({ smsConsent: true }); }],
      ["intent changed and changed back", (s) => { s.set({ intent: "question" }); s.set({ intent: "service_request" }); }]
    ];
    for (const [name, change] of steps) {
      change(made.store);
      if (!made.store.getState().termsAccepted) made.store.set({ termsAccepted: true });
      const next = await made.store.submit();
      if (next.status !== "unavailable") { bad.add(name + ": status " + next.status + " " + JSON.stringify((next.fieldErrors || []).map((e) => e.field))); continue; }
      const candidateFp = await workerFingerprintOf(T.payloadFromState(plain(made.store.getState()), "service_request", { requestId: first.requestId, nowIso: "x", nowMs: 1, page: "", attribution: {}, fbp: "", fbc: "" }));
      if (candidateFp !== firstFp) bad.add(name + ": the Worker's fingerprint changed (test is material)");
      if (next.requestId !== first.requestId) bad.add(name + ": a new requestId was made for an unchanged request (the Worker would forward a duplicate lead)");
      if (JSON.stringify(next.payload) !== JSON.stringify(first.payload)) bad.add(name + ": the resent payload differs from the first attempt");
    }
  });
  assert.equal(made.ids.length, 1, "ids generated: " + made.ids.length);
  bad.done();
});

await check("for a quote delivery or question, unanswered customer status and 'not sure' are the same request (same id)", async () => {
  const worker = makeWorker();
  const made = ready({ worker }, "weekly", "quote_delivery", "email", { status: "" });
  await withoutLedger(worker, async () => {
    const first = await made.store.submit();
    assert.equal(first.status, "unavailable");
    assert.equal(first.payload.customerStatus, "not_sure");
    made.store.set({ customerStatus: "not_sure" });
    const second = await made.store.submit();
    assert.equal(second.requestId, first.requestId);
    made.store.set({ customerStatus: "new" });
    const third = await made.store.submit();
    assert.notEqual(third.requestId, first.requestId);
  });
});

await check("a second request after success, and the same details after reset, each get a new requestId (two leads, two ids)", async () => {
  const worker = makeWorker();
  const made = ready({ worker });
  const first = await made.store.submit();
  assert.equal(first.ok, true);
  assert.equal(made.store.getState().step, "done");
  assert.equal((await made.store.submit()).status, "busy");
  assert.equal(made.store.set({ firstName: "Again" }).ok, false);
  assert.equal(made.store.reset(), true);
  fillPlan(made.store, PLANS.weekly);
  fillRequest(made, { intent: "service_request", contact: "text", status: "new" });
  const second = await made.store.submit();
  assert.equal(second.ok, true);
  assert.notEqual(second.requestId, first.requestId);
  assert.equal(worker.upstream.received.length, 2);
});

await check("nothing pending survives a reload: a new store on the same storage starts a new request; storage never holds an id or a contact detail", async () => {
  const worker = makeWorker();
  const storage = fakeStorage();
  const made = ready({ worker, storage });
  const first = await withoutLedger(worker, () => made.store.submit());
  assert.equal(first.status, "unavailable");
  const stored = JSON.stringify(storage.items) + JSON.stringify(storage.writes);
  for (const secret of [first.requestId, "Test", "Reviewer", "3175550100", "555-0100", "test@example.com", "123 Example St", "service-sms", TERMS_VERSION, TERMS_VERSION.replace(/^\d{4}-\d{2}-\d{2}-/, ""), "termsAccepted", "smsConsent"]) {
    assert.ok(!stored.includes(secret), "storage holds " + secret);
  }
  assert.deepEqual(Object.keys(storage.items).sort(), ["pp_quote_attribution_v3", "pp_quote_progress_v3"]);
  assert.deepEqual(Object.keys(JSON.parse(storage.items.pp_quote_progress_v3)).sort(), ["areas", "customerStatus", "dogCount", "frequency", "lastCleaned", "yardSize", "zip"]);
  // "reload"
  const reloaded = makeStore({ worker, storage });
  const state = reloaded.store.getState();
  assert.equal(state.firstName + state.lastName + state.phone + state.email + state.address + state.question, "");
  assert.equal(state.smsConsent, false);
  assert.equal(state.termsAccepted, false);
  assert.equal(state.locked, null);
  fillRequest(reloaded, { intent: "service_request", contact: "text", status: "new" });
  const again = await reloaded.store.submit();
  assert.equal(again.ok, true);
  assert.notEqual(again.requestId, first.requestId);
  // live mode keeps request ids only in its inspectable log, never a second copy of contact details
  assert.ok(!JSON.stringify(made.store.submissionLog).includes("3175550100"));
  assert.ok(!JSON.stringify(reloaded.store.submissionLog).includes("Reviewer"));
});

await check("requestId format: a version-4 UUID from crypto.randomUUID by default; id and eventId fit the Worker's 120-character limit", () => {
  const made = makeStore({ options: { uuid: undefined } });
  void made;
  const viaDefault = C.create({ storage: fakeStorage(), location: fakeLocation("file:///G:/review/home.html"), history: { replaceState() {} }, console: null, wait: () => Promise.resolve() });
  fillPlan(viaDefault, PLANS.weekly);
  viaDefault.set({ intent: "quote_delivery" });
  viaDefault.set({ preferredContact: "email" });
  viaDefault.set({ firstName: "Test", email: "test@example.com", lastCleaned: "Within 1 week" });
  const built = viaDefault.buildPayload();
  assert.equal(built.ok, true);
  assert.match(built.payload.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(built.payload.requestId.length <= 120 && built.payload.eventId.length <= 120);
  assert.equal(W.cleanString(built.payload.eventId, 120), built.payload.eventId);
});

await check("400 from the real Worker (payload altered in transit): 'server_invalid', retry allowed, not locked; a field name highlights the field, a version/price name becomes a form-level message", async () => {
  const worker = makeWorker();
  const made = ready({ worker });
  made.bridge.tamper = (body) => Object.assign(body, { clientPriceCents: body.clientPriceCents + 1, phone: "123" });
  const result = await made.store.submit();
  assert.equal(result.status, "server_invalid");
  assert.equal(result.httpStatus, 400);
  assert.equal(result.message, "Please check the highlighted form details.");
  assert.equal(result.retryAllowed, true);
  assert.equal(result.locked, false);
  assert.deepEqual(result.fieldErrors.map((e) => e.field), ["phone"]);
  assert.equal(result.fieldErrors[0].step, "request");
  assert.equal(result.formErrors.length, 1);
  assert.equal(made.store.getState().locked, null);
  assert.equal(worker.upstream.received.length, 0);
  made.bridge.tamper = null;
  const retry = await made.store.submit();
  assert.equal(retry.ok, true);
  assert.equal(retry.requestId, result.requestId);
});

await check("honeypot: 'website' is always empty, cannot be set, is not a form field, and the Worker rejects a filled one", async () => {
  const worker = makeWorker();
  const made = ready({ worker });
  const refused = made.store.set({ website: "https://spam.test" });
  assert.equal(refused.ok, false);
  assert.ok(!("website" in made.store.getState()));
  for (const intent of ["service_request", "quote_delivery", "question"]) {
    assert.ok(!made.store.fieldRules(intent).some((rule) => /website|url|homepage/i.test(rule.key)), "a website field is offered");
  }
  made.store.set({ termsAccepted: true });
  const built = made.store.buildPayload();
  assert.equal(built.payload.website, "");
  assert.deepEqual(W.validateV3(Object.assign({}, built.payload, { website: "x" })).errors, ["website"]);
  made.bridge.tamper = (body) => Object.assign(body, { website: "filled by a bot" });
  const result = await made.store.submit();
  assert.equal(result.status, "server_invalid");
  assert.deepEqual(result.serverFields, ["website"]);
  assert.equal(worker.upstream.received.length, 0);
});

await check("details typed for one intent do not travel with another: no name, address, timing, terms or question leaks into the payload or the team's summary", async () => {
  const worker = makeWorker();
  const made = ready({ worker }, "weekly", "service_request", "text", { optional: true });
  made.store.set({ question: "This question was typed earlier and must not be sent with a service request." });
  made.store.set({ termsAccepted: true });
  // service request: the stray question is not sent
  let built = made.store.buildPayload();
  assert.equal(built.payload.question, "");
  // switch to a quote delivery: service-only details stay behind
  made.store.set({ intent: "quote_delivery" });
  let result = await made.store.submit();
  assert.equal(result.ok, true, result.status);
  let forward = worker.upstream.received[0];
  for (const subject of [result.payload, forward]) {
    assert.equal(subject.lastName + subject.street + subject.city + subject.startTiming + subject.termsVersion + subject.termsAcceptedAt, "");
    assert.equal(subject.termsAccepted, false);
    assert.equal(subject.question, "Quote delivery requested by text.");
  }
  assert.equal(forward.serviceAddress, "");
  for (const secret of ["Reviewer", "123 Example St", "typed earlier"]) assert.ok(!JSON.stringify(forward).includes(secret), "the forward holds " + secret);
  assert.ok(forward.quoteSummary.includes("Service address: Not collected for this request type"));
  assert.ok(forward.quoteSummary.includes("Terms accepted: Not applicable"));
});

await check("the request itself: POST, JSON, no cookies, an abort signal, only the Content-Type header (the Worker's CORS allows no other), body equal to the payload", async () => {
  const worker = makeWorker();
  const made = ready({ worker }, "weekly", "service_request", "text", { optional: true });
  const result = await made.store.submit();
  assert.equal(result.ok, true);
  assert.equal(made.bridge.calls.length, 1);
  const call = made.bridge.calls[0];
  assert.equal(call.url, WORKER_ORIGIN + "/submit");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.credentials, "omit");
  assert.deepEqual(Object.keys(call.init.headers), ["Content-Type"]);
  assert.equal(call.init.headers["Content-Type"], "application/json");
  assert.ok(call.init.signal && typeof call.init.signal.aborted === "boolean");
  assert.deepEqual(JSON.parse(call.init.body), result.payload);
  assert.equal(made.timers.filter((timer) => timer.ms === 15000).length, 1);
  assert.equal(made.timers.find((timer) => timer.ms === 15000).cleared, true, "the abort timer is cleared once the reply arrives");
  assert.deepEqual(made.store.networkLog.map((entry) => entry.url), [WORKER_ORIGIN + "/submit"]);
});

await check("junk typed into set() by a careless interface (numbers, null, objects, wrong-case strings, 60,000 calls): whenever the engine then calls the request valid, the Worker accepts it, with consent only for Text and terms only for service", () => {
  let seed = 424242;
  const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const junk = [null, undefined, 0, 1, 46032, 3175550100, true, false, "", " ", "x", "TEXT", "Weekly", "2-3 weeks", {}, [], ["back"], "back", NaN, "46032", "10", 10, "010", "new ", "Email"];
  const good = {
    zip: ["46032", "46280", "46201", "4603"], dogCount: ["1", "4", "5", "6", "9", "10", 2], yardSize: ["s", "m", "l", "xl", "over"], areas: [["back"], ["back", "front"], ["side", "front", "back"], []],
    frequency: ["twice", "weekly", "biweekly", "onetime", "custom", ""], intent: ["service_request", "quote_delivery", "question"], customerStatus: ["new", "returning", "not_sure", ""],
    firstName: ["Test", " Test ", ""], lastName: ["Reviewer", ""], phone: ["3175550100", "(317) 555-0100", "13175550100", "317555", ""], email: ["test@example.com", "Test@Example.com ", "bad", ""],
    preferredContact: ["text", "email", "call"], smsConsent: [true, false], address: ["123 Example St", ""], city: ["Carmel", ""],
    startTiming: C.START_TIMING_OPTIONS.concat([""]), lastCleaned: C.LAST_CLEANED_OPTIONS.concat([""]), question: [FAKE.question, "abcd", ""], termsAccepted: [true, false]
  };
  const fields = Object.keys(good);
  const bad = problems();
  let valid = 0;
  let termsOnOtherIntent = 0;
  for (let walk = 0; walk < 300; walk += 1) {
    const made = makeStore();
    for (let step = 0; step < 200; step += 1) {
      const patch = {};
      const count = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < count; i += 1) {
        const field = pick(fields);
        patch[field] = rand() < 0.2 ? pick(junk) : pick(good[field]);
      }
      try {
        made.store.set(patch);
        // Now and then the "visitor" finishes the form properly, so that valid
        // states are reached often and then disturbed again by the next junk.
        if (rand() < 0.08) {
          const s = made.store;
          const intent = pick(good.intent);
          if (!s.validatePlan().ok) { s.set({ dogCount: pick(["1", "2", "3"]) }); s.set({ zip: "46032" }); s.set({ yardSize: pick(["s", "m"]) }); s.set({ areas: ["back"] }); s.set({ frequency: pick(["twice", "weekly", "onetime"]) }); }
          s.set({ intent });
          s.set({ preferredContact: pick(intent === "quote_delivery" ? ["text", "email"] : ["text", "email", "call"]) });
          s.set({ customerStatus: "new", firstName: "Test", lastName: "Reviewer", phone: "3175550100", email: "test@example.com", address: "123 Example St", city: "Carmel", startTiming: "As soon as possible", lastCleaned: pick(C.LAST_CLEANED_OPTIONS), question: FAKE.question });
          if (s.getState().preferredContact === "text") s.set({ smsConsent: true });
          if (s.getState().intent === "service_request") s.set({ termsAccepted: true });
        }
      } catch (error) { bad.add("set(" + JSON.stringify(patch) + ") threw " + error.message); continue; }
      const state = made.store.getState();
      if (state.smsConsent && state.preferredContact !== "text") bad.add("consent ticked while replying by " + state.preferredContact);
      if (state.smsConsent !== Boolean(state.smsConsentCapturedAt)) bad.add("consent flag and timestamp disagree");
      if (state.termsAccepted && state.intent !== "service_request") termsOnOtherIntent += 1;
      if (state.termsAccepted !== Boolean(state.termsAcceptedAt)) bad.add("terms flag and timestamp disagree");
      if (state.intent === "quote_delivery" && state.preferredContact === "call") bad.add("Phone call held for a quote delivery");
      if (made.store.validateSubmit().ok) {
        valid += 1;
        const built = made.store.buildPayload();
        const verdict = W.validateV3(built.payload);
        if (!verdict.ok) bad.add("engine valid, Worker rejects " + verdict.errors + " after " + JSON.stringify(patch) + " -> " + JSON.stringify(built.payload));
        if (built.payload.smsTransactionalConsent !== (built.payload.preferredContact === "text")) bad.add("consent flag for " + built.payload.preferredContact);
        if (built.payload.termsAccepted !== (built.payload.intent === "service_request")) bad.add("terms flag for " + built.payload.intent);
        if (built.payload.website !== "") bad.add("website");
      }
      if (bad.count > 10) break;
    }
    if (bad.count > 10) break;
  }
  bad.done();
  assert.ok(valid > 500, "only " + valid + " valid states were reached");
  return valid + " valid states reached, all accepted by validateV3" + (termsOnOtherIntent ? "; NOTE " + termsOnOtherIntent + " states had the terms box ticked while the intent was not a service request (reported in group G)" : "");
});

await check("email length boundary: 254 characters is accepted by engine and Worker; the store never holds more than 254", () => {
  const edge = "x".repeat(244) + "@e.example";
  assert.equal(edge.length, 254);
  const made = ready({}, "weekly", "question", "email");
  made.store.set({ email: edge });
  assert.equal(made.store.validateSubmit().ok, true);
  assert.equal(W.validateV3(made.store.buildPayload().payload).ok, true);
  made.store.set({ email: "y" + edge });
  assert.equal(made.store.getState().email.length, 254);
});

await check("without crypto.randomUUID the id is the live fallback pp-{time}-{random}, unique per request", () => {
  const sandbox = { console: { info() {}, warn() {} }, setTimeout, clearTimeout, URL, URLSearchParams, location: { href: "file:///G:/review/home.html", search: "", hash: "", pathname: "/G:/review/home.html", protocol: "file:", origin: "null", hostname: "" }, history: { replaceState() {} } };
  sandbox.window = sandbox;
  sandbox.document = { cookie: "" };
  vm.createContext(sandbox);
  vm.runInContext(engineSource, sandbox);
  const store = sandbox.PPQuoteCore.create();
  demoFillFor(store);
  const first = store.buildPayload().payload.requestId;
  const second = store.buildPayload().payload.requestId;
  assert.match(first, /^pp-\d{13}-[a-z0-9]{1,8}$/);
  assert.notEqual(first, second);
});
function demoFillFor(store) {
  store.set({ dogCount: "2" });
  store.set({ zip: "46032" });
  store.set({ yardSize: "m" });
  store.set({ areas: ["back"] });
  store.set({ frequency: "weekly" });
  store.set({ intent: "quote_delivery" });
  store.set({ preferredContact: "email" });
  store.set({ firstName: "Test", email: "test@example.com", lastCleaned: "About 1 month" });
}

/* ======================================================================
 * F. locked states (spec 4.5.2, 17.1 item 14)
 * ==================================================================== */

group("F. Locked state for 'uncertain' and 'conflict'");

async function expectLocked(made, result, code, worker) {
  const store = made.store;
  assert.equal(result.ok, false);
  assert.equal(result.status, "locked");
  assert.equal(result.locked, true);
  assert.equal(result.code, code);
  assert.equal(result.httpStatus, 409);
  assert.equal(result.retryAllowed, false);
  const locked = store.getState().locked;
  assert.ok(locked, "state.locked is not set");
  assert.equal(locked.code, code);
  assert.equal(locked.requestId, result.payload.requestId);
  assert.ok(locked.message.includes(result.payload.requestId), "the message does not carry the reference");
  assert.ok(locked.message.includes("(317) 961-5865"));
  assert.equal(store.getState().submitting, false);
  assert.notEqual(store.getState().step, "done");
  assert.equal(store.getState().receipt, null);
  const callsBefore = made.bridge.calls.length;
  const upstreamBefore = worker.upstream.calls;
  // 1. submitting again shows the same message and sends nothing
  const again = await store.submit();
  assert.equal(again.status, "locked");
  assert.equal(again.message, locked.message);
  const otherIntent = await store.submit("question");
  assert.equal(otherIntent.status, "locked");
  // 2. no editing of any field
  for (const patch of [{ firstName: "Changed" }, { phone: "3175550199" }, { dogCount: "3" }, { zip: "46033" }, { frequency: "twice" }, { preferredContact: "email" }, { intent: "question" }, { termsAccepted: false }, { smsConsent: false }, { customerStatus: "returning" }, { lastCleaned: "Within 1 week" }]) {
    const before = store.getState();
    const outcome = store.set(patch);
    assert.equal(outcome.ok, false, "edit allowed while locked: " + JSON.stringify(patch));
    assert.equal(store.getState(), before, "state changed while locked");
  }
  assert.equal(store.toggleArea("side").ok, false);
  assert.equal(store.toggleAllAreas().ok, false);
  // 3. no navigation, no reset, no resume, no save link, no reopening with a ZIP
  for (const step of C.STEPS) {
    if (step !== store.getState().step) assert.equal(store.goTo(step).ok, false, "goTo " + step);
    assert.equal(store.edit(step).ok, false, "edit " + step);
  }
  assert.equal(store.next().ok, false);
  assert.equal(store.back().ok, false);
  assert.equal(store.reset(), false);
  assert.equal(store.open({ zip: "46033" }).ok, false);
  assert.equal((await store.resume("A".repeat(43))).ok, false);
  assert.equal((await store.createSaveLink()).ok, false);
  const flow = store.flow();
  assert.equal(flow.primaryAction, "none");
  assert.equal(flow.back, "");
  assert.equal(flow.canContinue, false);
  assert.ok(store.getState().locked, "the lock was cleared");
  assert.equal(made.bridge.calls.length, callsBefore, "a locked store reached the network");
  assert.equal(worker.upstream.calls, upstreamBefore);
}

await check("real Worker 409 SUBMISSION_UNCERTAIN (the team's system fails after dispatch): locked with the Worker's message; no resubmit, edit, navigation, reset, resume or save link", async () => {
  const worker = makeWorker();
  const made = ready({ worker });
  worker.upstream.mode = "throw";
  const result = await made.store.submit();
  worker.upstream.mode = "ok";
  assert.equal(result.message, "Your request may already be with our team. Please call (317) 961-5865 to confirm before submitting again. Your reference is " + result.payload.requestId + ". Nothing has been scheduled or charged by this form.");
  await expectLocked(made, result, "SUBMISSION_UNCERTAIN", worker);
  assert.equal(worker.upstream.received.length, 0);
});

await check("real Worker 409 when the team's system answers HTTP 500 (custom estimate, reply by phone call): locked the same way", async () => {
  const worker = makeWorker();
  const made = ready({ worker }, "customOver", "service_request", "call");
  worker.upstream.mode = "http500";
  const result = await made.store.submit();
  worker.upstream.mode = "ok";
  await expectLocked(made, result, "SUBMISSION_UNCERTAIN", worker);
});

await check("real Worker 409 when the same request is still in flight (ledger record 'dispatching'): locked, and nothing is forwarded a second time", async () => {
  const { createHash } = await import("node:crypto");
  const worker = makeWorker();
  const sameId = "inflight-" + Date.now();
  const made = ready({ worker, options: { uuid: () => sameId } });
  const payload = made.store.buildPayload().payload;
  assert.equal(payload.requestId, sameId);
  // Put the ledger in the state it is in while an earlier attempt is still being passed on.
  const key = createHash("sha256").update("purge-pros-quote-v3:" + sameId).digest("hex");
  await worker.holder.env.QUOTE_REQUESTS.get(key).fetch(new Request("https://quote-request.internal/noop")); // creates the object (answers 405)
  worker.instances.get(key).data.set("request", { fingerprint: await workerFingerprintOf(payload), status: "dispatching", createdAt: new Date().toISOString() });
  const result = await made.store.submit();
  assert.equal(result.payload.requestId, sameId);
  await expectLocked(made, result, "SUBMISSION_UNCERTAIN", worker);
  assert.equal(worker.upstream.calls, 0);
});

await check("real Worker 409 REQUEST_ID_CONFLICT (same id, different details): locked with the conflict message", async () => {
  const worker = makeWorker();
  const sameId = "dup-" + Date.now();
  const first = ready({ worker, options: { uuid: () => sameId } });
  assert.equal((await first.store.submit()).ok, true);
  const second = ready({ worker, options: { uuid: () => sameId } });
  second.store.set({ firstName: "Different" });
  second.store.set({ termsAccepted: true });
  const result = await second.store.submit();
  assert.equal(result.message, "We could not safely submit the changed details. Please call (317) 961-5865 and mention reference " + sameId + ".");
  await expectLocked(second, result, "REQUEST_ID_CONFLICT", worker);
  assert.equal(worker.upstream.received.length, 1);
});

await check("a 409 with no message uses the fallback wording and still locks", async () => {
  const made = makeStore({ worker: makeWorker() });
  fillPlan(made.store, PLANS.weekly);
  fillRequest(made, { intent: "service_request", contact: "text", status: "new" });
  const stub = C.create({
    mode: "live", endpoint: WORKER_ORIGIN + "/submit", storage: fakeStorage(), location: fakeLocation(SITE_ORIGIN + "/"), history: { replaceState() {} }, console: null,
    fetch: async () => ({ status: 409, ok: false, text: async () => "" })
  });
  fillPlan(stub, PLANS.weekly);
  fillRequest({ store: stub, clock: { t: T0 } }, { intent: "service_request", contact: "text", status: "new" });
  const result = await stub.submit();
  assert.equal(result.status, "locked");
  assert.equal(result.message, "Please call Purge Pros to confirm your request before submitting again.");
  assert.ok(stub.getState().locked);
  assert.equal((await stub.submit()).status, "locked");
});

await check("only a reload clears the lock: a new store on the same storage is not locked and gets a new id", async () => {
  const worker = makeWorker();
  const storage = fakeStorage();
  const made = ready({ worker, storage });
  worker.upstream.mode = "throw";
  const result = await made.store.submit();
  worker.upstream.mode = "ok";
  assert.equal(result.status, "locked");
  assert.ok(!JSON.stringify(storage.items).includes(result.payload.requestId));
  const reloaded = makeStore({ worker, storage });
  assert.equal(reloaded.store.getState().locked, null);
  fillRequest(reloaded, { intent: "service_request", contact: "text", status: "new" });
  const again = await reloaded.store.submit();
  assert.notEqual(again.payload.requestId, result.payload.requestId);
});

await check("other refusals from the real Worker allow a retry and never lock: 403 (page origin not on the Worker's list) and 500 (relay not configured); the retry reuses the id", async () => {
  const worker = makeWorker();
  // 403: a page origin the Worker does not allow (the engine is told it may send from there)
  let made = ready({ worker, url: "https://staging.contract-check.test/", options: { allowedOrigins: ["https://staging.contract-check.test"] } });
  let result = await made.store.submit();
  assert.equal(result.status, "rejected");
  assert.equal(result.httpStatus, 403);
  assert.equal(result.serverMessage, "Forbidden");
  assert.equal(result.message, "We could not save your request. Please try again.");
  assert.equal(result.retryAllowed, true);
  assert.equal(made.store.getState().locked, null);
  // 500: relay not configured
  made = ready({ worker });
  const full = worker.holder.env;
  worker.holder.env = { QUOTE_REQUESTS: full.QUOTE_REQUESTS };
  result = await made.store.submit();
  worker.holder.env = full;
  assert.equal(result.status, "rejected");
  assert.equal(result.httpStatus, 500);
  assert.equal(result.retryAllowed, true);
  assert.equal(made.store.getState().locked, null);
  const retry = await made.store.submit();
  assert.equal(retry.ok, true);
  assert.equal(retry.requestId, result.requestId);
});

await check("the largest request a visitor can type stays under the Worker's 30,000-byte limit", async () => {
  const worker = makeWorker();
  const long = (n, ch) => (ch || "\u00e9").repeat(n);
  const params = C.ATTRIBUTION_KEYS.map((key) => key + "=" + encodeURIComponent(long(300))).join("&");
  const made = makeStore({ worker, url: SITE_ORIGIN + "/indianapolis?" + params, cookies: { _fbp: long(300, "p"), _fbc: long(300, "c") } });
  fillPlan(made.store, PLANS.twice);
  made.store.set({ intent: "question" });
  made.store.set({ preferredContact: "text" });
  made.store.set({ firstName: long(200), lastName: long(200), phone: FAKE.phone, email: long(240, "a") + "@example.com", question: long(5000, "\u6f22"), lastCleaned: "More than 6 months" });
  made.store.set({ smsConsent: true });
  const result = await made.store.submit();
  assert.equal(result.ok, true, result.status + " " + result.httpStatus);
  const bytes = Buffer.byteLength(JSON.stringify(result.payload));
  assert.ok(bytes < W.MAX_BODY_BYTES, bytes + " bytes");
  assert.equal(result.payload.question.length, 1500);
  assert.ok(Object.values(result.payload.attribution).every((value) => value.length === 250));
  assert.ok(result.payload.page.length <= 1000);
  return bytes + " bytes for the largest request";
});

/* ======================================================================
 * G. consent and terms evidence rules through the store
 * ==================================================================== */

group("G. Consent and terms evidence");

await check("consent: never pre-ticked; only while Text is chosen; the timestamp is the tick time; leaving Text clears it and coming back needs a fresh tick", () => {
  const made = makeStore();
  const store = made.store;
  fillPlan(store, PLANS.weekly);
  assert.equal(store.getState().preferredContact, "text");
  assert.equal(store.getState().smsConsent, false);
  assert.equal(store.getState().smsConsentCapturedAt, "");
  made.clock.t = T0 + 1000;
  store.set({ smsConsent: true });
  assert.equal(store.getState().smsConsentCapturedAt, new Date(T0 + 1000).toISOString());
  made.clock.t = T0 + 2000;
  store.set({ smsConsent: true }); // a second "true" must not move the timestamp
  assert.equal(store.getState().smsConsentCapturedAt, new Date(T0 + 1000).toISOString());
  for (const other of ["email", "call"]) {
    store.set({ preferredContact: "text" });
    store.set({ smsConsent: true });
    const left = store.set({ preferredContact: other });
    assert.equal(store.getState().smsConsent, false);
    assert.equal(store.getState().smsConsentCapturedAt, "");
    assert.ok(left.notices.some((n) => n.code === "CONSENT_CLEARED"));
    const refused = store.set({ smsConsent: true });
    assert.equal(refused.ok, false, "consent was accepted while replying by " + other);
    assert.equal(store.getState().smsConsent, false);
    store.set({ preferredContact: "text" });
    assert.equal(store.getState().smsConsent, false, "consent came back by itself");
  }
  made.clock.t = T0 + 9000;
  store.set({ smsConsent: true });
  assert.equal(store.getState().smsConsentCapturedAt, new Date(T0 + 9000).toISOString());
  store.set({ smsConsent: false });
  assert.equal(store.getState().smsConsentCapturedAt, "");
  // truthy values that are not `true` do not count as consent
  for (const sneaky of ["yes", 1, "true", {}]) {
    store.set({ smsConsent: sneaky });
    assert.equal(store.getState().smsConsent, false, "consent given by " + JSON.stringify(sneaky));
  }
});

await check("consent is never restored: not from storage, not from a saved plan, not after reset", async () => {
  const storage = fakeStorage();
  const made = ready({ storage }, "weekly", "quote_delivery", "text");
  assert.equal(made.store.getState().smsConsent, true);
  const reloaded = makeStore({ storage });
  assert.equal(reloaded.store.getState().smsConsent, false);
  assert.equal(reloaded.store.getState().smsConsentCapturedAt, "");
  // even if someone plants extra keys in the stored progress
  const planted = fakeStorage({ pp_quote_progress_v3: JSON.stringify({ zip: "46032", dogCount: "2", frequency: "weekly", areas: ["back"], yardSize: "m", lastCleaned: "", customerStatus: "new", smsConsent: true, smsConsentCapturedAt: "2026-01-01T00:00:00.000Z", termsAccepted: true, firstName: "Planted", phone: "3175550100", preferredContact: "call" }) });
  const fromPlanted = makeStore({ storage: planted }).store.getState();
  assert.equal(fromPlanted.smsConsent, false);
  assert.equal(fromPlanted.termsAccepted, false);
  assert.equal(fromPlanted.firstName, "");
  assert.equal(fromPlanted.phone, "");
  assert.equal(fromPlanted.preferredContact, "text");
  made.store.reset();
  assert.equal(made.store.getState().smsConsent, false);
  await made.store.resume("A".repeat(43));
  assert.equal(made.store.getState().smsConsent, false);
  assert.equal(made.store.getState().termsAccepted, false);
});

await check("no consent evidence can be produced for Email or Phone call, whatever is passed in", () => {
  for (const contact of ["email", "call"]) {
    const made = ready({}, "weekly", "service_request", contact);
    made.store.set({ smsConsent: true });
    made.store.set({ termsAccepted: true });
    const built = made.store.buildPayload();
    assert.equal(built.ok, true);
    assert.equal(built.payload.smsTransactionalConsent, false);
    assert.equal(built.payload.consent, "no");
    assert.equal(built.payload.consentVersion, "");
    assert.equal(built.payload.smsConsentCapturedAt, "");
    // second line of defence: the pure payload builder with a forged state
    const forged = plain(made.store.getState());
    forged.smsConsent = true;
    forged.smsConsentCapturedAt = "2026-01-01T00:00:00.000Z";
    const payload = T.payloadFromState(forged, "service_request", pureContext());
    assert.equal(payload.smsTransactionalConsent, false);
    assert.equal(payload.consentVersion + payload.smsConsentCapturedAt, "");
  }
});

await check("terms: service requests only; unticked by default; timestamp is the tick time; EVERY settable field, every navigation edit and a supplied ZIP untick it", () => {
  const bad = problems();
  const edits = [
    { zip: "46033" }, { dogCount: "3" }, { yardSize: "l" }, { areas: ["back"] }, { frequency: "twice" }, { customerStatus: "returning" },
    { firstName: "Tess" }, { lastName: "Checker" }, { phone: "3175550101" }, { email: "test2@example.com" }, { preferredContact: "call" },
    { smsConsent: false }, { address: "456 Sample Ave" }, { city: "Westfield" }, { startTiming: "Within the next week" }, { lastCleaned: "Within 1 week" },
    { intent: "question" }, { question: "A test question for the terms box?" }
  ];
  for (const patch of edits) {
    const made = ready({});
    const store = made.store;
    const tickedAt = store.getState().termsAcceptedAt;
    if (tickedAt !== made.times.termsAt) bad.add("termsAcceptedAt " + tickedAt + " is not the tick time");
    const outcome = store.set(patch);
    const state = store.getState();
    if (!outcome.changed.length) { bad.add(JSON.stringify(patch) + ": nothing changed (test is void)"); continue; }
    if (state.termsAccepted || state.termsAcceptedAt) bad.add(JSON.stringify(patch) + " left the terms box ticked");
    if (!outcome.notices.some((n) => n.code === "TERMS_CLEARED")) bad.add(JSON.stringify(patch) + ": no TERMS_CLEARED notice");
    if (store.validateSubmit("service_request").byField.termsAccepted !== C.TERMS.error && state.intent === "service_request") bad.add(JSON.stringify(patch) + ": submit is not blocked on the terms box");
  }
  // toggles, one-tap edits and a ZIP handed in from outside
  let made = ready({});
  made.store.toggleArea("side");
  if (made.store.getState().termsAccepted) bad.add("toggleArea left the terms ticked");
  made = ready({});
  made.store.edit("dogs");
  if (made.store.getState().termsAccepted) bad.add("edit('dogs') left the terms ticked");
  made = ready({});
  made.store.open({ zip: "46033" });
  if (made.store.getState().termsAccepted) bad.add("open({ zip }) with a different ZIP left the terms ticked");
  // not for other intents
  for (const intent of ["quote_delivery", "question"]) {
    made = ready({}, "weekly", intent, "email");
    const refused = made.store.set({ termsAccepted: true });
    if (refused.ok || made.store.getState().termsAccepted) bad.add("terms box accepted for " + intent);
    const payload = made.store.buildPayload().payload;
    if (payload.termsAccepted !== false || payload.termsVersion !== "" || payload.termsAcceptedAt !== "") bad.add("terms evidence in a " + intent + " payload");
  }
  // default
  const fresh = makeStore().store.getState();
  if (fresh.termsAccepted || fresh.termsAcceptedAt) bad.add("terms pre-ticked");
  bad.done();
});

await check("terms: an intent change and a tick in ONE set() call must not leave the box ticked for a question or quote delivery", () => {
  for (const intent of ["question", "quote_delivery"]) {
    const made = ready({});
    const store = made.store;
    assert.equal(store.getState().termsAccepted, true);
    store.set({ intent, termsAccepted: true });
    const state = store.getState();
    assert.equal(state.intent, intent);
    assert.equal(state.termsAccepted, false, "termsAccepted is still true (since " + state.termsAcceptedAt + ") with intent " + intent);
  }
});

await check("terms: an edit and a tick in ONE set() call must not keep the old acceptance time", () => {
  const made = ready({});
  const store = made.store;
  const firstTick = store.getState().termsAcceptedAt;
  made.clock.t += 60000;
  const now = new Date(made.clock.t).toISOString();
  store.set({ firstName: "Tess", termsAccepted: true });
  const state = store.getState();
  assert.equal(state.termsAccepted, true);
  assert.equal(state.termsAcceptedAt, now, "termsAcceptedAt is still " + state.termsAcceptedAt + " (ticked at " + firstTick + ") although the details changed at " + now);
});

await check("OBSERVATION (same as the live widget, not a contract breach): consent ticked for one number stays recorded when the number is then changed", () => {
  const made = ready({});
  const store = made.store;
  const firstTick = store.getState().smsConsentCapturedAt;
  made.clock.t += 60000;
  store.set({ phone: "3175550177" });
  const state = store.getState();
  // widget.js handleInput() for #pp-phone does not touch smsConsent either; spec 4.4.1 lists
  // only unticking and leaving Text as the things that clear it.
  const widgetPhoneHandler = sliceBetween(widgetSource, 'if (target.id === "pp-phone") {', "return;");
  assert.ok(!/smsConsent/.test(widgetPhoneHandler), "the live widget clears consent on a phone edit; the engine should too");
  return state.smsConsent && state.smsConsentCapturedAt === firstTick
    ? "engine keeps consent (ticked " + firstTick + ") after the number changes to " + state.phone + "; the live widget does the same"
    : "engine clears or re-stamps consent when the number changes (stricter than live)";
});

/* ======================================================================
 * H. attribution
 * ==================================================================== */

group("H. Attribution, page and cookies");

await check("the nine parameters only, each cut to 250; kept for the session; new values overwrite, missing ones are kept; the Worker keeps every key", async () => {
  const worker = makeWorker();
  const storage = fakeStorage();
  const longValue = "v".repeat(400);
  const first = makeStore({ worker, storage, url: SITE_ORIGIN + "/?utm_source=meta&utm_medium=paid&utm_campaign=" + longValue + "&utm_id=IGNORED&msclkid=IGNORED&gclid=G1&fbclid=F1&zipcode=IGNORED" });
  assert.deepEqual(Object.keys(first.store.getState().attribution).sort(), ["fbclid", "gclid", "utm_campaign", "utm_medium", "utm_source"]);
  assert.equal(first.store.getState().attribution.utm_campaign.length, 250);
  // next page in the same tab: one parameter replaced, one new, the rest absent
  const second = makeStore({ worker, storage, url: SITE_ORIGIN + "/carmel?utm_source=google&wbraid=W2", cookies: { _fbp: "fb.1.111.222" } });
  assert.deepEqual(plain(second.store.getState().attribution), { utm_source: "google", utm_medium: "paid", utm_campaign: "v".repeat(250), gclid: "G1", wbraid: "W2", fbclid: "F1" });
  fillPlan(second.store, PLANS.weekly);
  fillRequest(second, { intent: "service_request", contact: "email", status: "returning" });
  const result = await second.store.submit();
  assert.equal(result.ok, true);
  const payload = result.payload;
  const forward = worker.upstream.received[0];
  assert.deepEqual(payload.attribution, { utm_source: "google", utm_medium: "paid", utm_campaign: "v".repeat(250), gclid: "G1", wbraid: "W2", fbclid: "F1" });
  assert.deepEqual(forward.attribution, payload.attribution);
  assert.deepEqual(W.cleanAttribution(payload.attribution), payload.attribution);
  assert.equal(payload.gclid, "G1");
  assert.equal(payload.fbclid, "F1");
  assert.equal(payload.fbp, "fb.1.111.222");
  assert.equal(payload.fbc, "fb.1." + second.clock.t + ".F1", "fbc fallback is fb.1.{time}.{fbclid}");
  assert.equal(payload.page, SITE_ORIGIN + "/carmel?utm_source=google&wbraid=W2");
  assert.equal(forward.utmSource, "google");
  assert.ok(forward.quoteSummary.includes("Attribution: google / paid / " + "v".repeat(250)));
  // attribution is not part of what makes a request "the same"
  assert.ok(!C.FINGERPRINT_FIELDS.includes("attribution") && !C.FINGERPRINT_FIELDS.includes("page") && !C.FINGERPRINT_FIELDS.includes("fbp"));
});

await check("keys planted in the stored attribution (anything but the nine) never reach the state, the payload or the Worker", async () => {
  const worker = makeWorker();
  const storage = fakeStorage({ pp_quote_attribution_v3: JSON.stringify({ utm_source: "kept", email: "test@example.com", phone: "3175550100", zip: "46032", evil: "x", gclid: 12345, utm_medium: "", fbclid: "F".repeat(400) }) });
  const made = makeStore({ worker, storage });
  assert.deepEqual(plain(made.store.getState().attribution), { utm_source: "kept", fbclid: "F".repeat(250) });
  fillPlan(made.store, PLANS.weekly);
  fillRequest(made, { intent: "question", contact: "email", status: "" });
  const result = await made.store.submit();
  assert.equal(result.ok, true);
  assert.deepEqual(result.payload.attribution, { utm_source: "kept", fbclid: "F".repeat(250) });
  assert.deepEqual(worker.upstream.received[0].attribution, result.payload.attribution);
  assert.equal(result.payload.gclid, "");
  assert.deepEqual(Object.keys(JSON.parse(storage.items.pp_quote_attribution_v3)).sort(), ["fbclid", "utm_source"]);
});

await check("attribution is captured on every page, including one where the visitor never touches the builder, and survives reset", () => {
  const storage = fakeStorage();
  makeStore({ storage, url: "https://www.itspurgepros.com/yard-guide?gclid=ONLY-HERE&gbraid=GB" });
  const later = makeStore({ storage, url: "https://www.itspurgepros.com/" });
  assert.deepEqual(plain(later.store.getState().attribution), { gclid: "ONLY-HERE", gbraid: "GB" });
  later.store.reset();
  assert.deepEqual(plain(later.store.getState().attribution), { gclid: "ONLY-HERE", gbraid: "GB" });
  assert.ok(!JSON.stringify(storage.items.pp_quote_attribution_v3).includes("zip"));
});

/* ======================================================================
 * I. save and resume against the real Worker
 * ==================================================================== */

group("I. Save links and resume");

await check("every plan x status: an engine-valid plan gives exactly the six keys in the Worker's order and the Worker's resumePlan accepts it; unanswered status goes as 'not_sure'", () => {
  const bad = problems();
  let accepted = 0;
  for (let dogs = 1; dogs <= 10; dogs += 1) {
    for (const frequency of FREQ_IDS) {
      for (const yardSize of YARD_IDS) {
        for (const areas of [["side", "back"], ["front"], ["side", "front", "back"]]) {
          for (const status of ["", "new", "returning", "not_sure"]) {
            const state = baseState("service_request", "text");
            Object.assign(state, { dogCount: String(dogs), frequency, yardSize, areas, customerStatus: status });
            const body = T.saveLinkBody(state);
            const planOk = T.planErrors(state).length === 0;
            const worker = W.resumePlan(plain(body));
            if (planOk !== Boolean(worker)) bad.add([dogs, frequency, yardSize, areas, status] + ": engine plan " + (planOk ? "valid" : "invalid") + " but resumePlan " + (worker ? "accepts" : "rejects"));
            if (!planOk) continue;
            accepted += 1;
            if (JSON.stringify(Object.keys(body)) !== JSON.stringify(W.RESUME_FIELDS)) bad.add("keys " + Object.keys(body));
            if (typeof body.dogs !== "number" || body.dogs !== dogs) bad.add("dogs is " + JSON.stringify(body.dogs));
            if (JSON.stringify(body.areaIds) !== JSON.stringify(areas.slice().sort())) bad.add("areaIds not sorted: " + body.areaIds);
            if (body.customerStatus !== (status || "not_sure")) bad.add("customerStatus " + body.customerStatus);
            if (JSON.stringify(body).length > 1024) bad.add("body over the Worker's 1024-byte limit");
          }
        }
      }
    }
  }
  bad.done();
  return accepted + " save bodies accepted by the Worker's resumePlan";
});

await check("end to end: create a link on the real Worker (201), only plan fields are stored, then open it in a new page: price step, notice, nothing personal, status not pre-selected", async () => {
  const worker = makeWorker();
  const made = ready({ worker }, "twice", "service_request", "text", { status: "returning" });
  const saved = await made.store.createSaveLink();
  assert.equal(saved.ok, true, saved.status + " " + saved.message);
  assert.equal(saved.status, "created");
  assert.match(saved.url, /^https:\/\/quote\.itspurgepros\.com\/#resume=[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(Object.keys(saved.body), ["zip", "dogs", "frequencyId", "yardSizeId", "areaIds", "customerStatus"]);
  const call = made.bridge.calls[0];
  assert.equal(call.url, WORKER_ORIGIN + "/quote-resume");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.credentials, "omit");
  assert.equal(call.init.referrerPolicy, "no-referrer");
  assert.equal(call.init.cache, "no-store");
  assert.equal(call.init.redirect, "error");
  assert.deepEqual(Object.keys(JSON.parse(call.init.body)), ["zip", "dogs", "frequencyId", "yardSizeId", "areaIds", "customerStatus"]);
  assert.equal(made.timers.find((timer) => timer.ms === 12000) !== undefined, true, "a 12000 ms limit was set");
  // what the Worker stored
  const records = [...worker.instances.values()].map((instance) => instance.data.get("resumePlan")).filter(Boolean);
  assert.equal(records.length, 1);
  const storedText = JSON.stringify(records[0]);
  for (const secret of ["Test", "Reviewer", "3175550100", "test@example.com", "123 Example St", "utm_", "203.0.113.7"]) assert.ok(!storedText.includes(secret), "the saved plan holds " + secret);
  assert.deepEqual(Object.keys(records[0].plan).sort(), ["areaIds", "customerStatus", "dogs", "frequencyId", "yardSizeId", "zip"]);
  // same plan again: same link, no second request
  const again = await made.store.createSaveLink();
  assert.equal(again.url, saved.url);
  assert.equal(made.bridge.calls.length, 1);
  assert.equal(worker.upstream.calls, 0, "a save link reached the team's system");

  // open in a "new page"
  const token = saved.url.split("#resume=")[1];
  const gtag = [];
  const fbq = [];
  const opened = makeStore({ worker, options: { sinks: { gtag: (...a) => gtag.push(a), fbq: (...a) => fbq.push(a) } } });
  const pending = opened.store.resume(token);
  assert.equal(opened.store.getState().resumeLoading, true);
  const result = await pending;
  assert.equal(result.ok, true, result.status + " " + result.notice);
  const openCall = opened.bridge.calls[0];
  assert.equal(openCall.url, WORKER_ORIGIN + "/quote-resume/open");
  assert.deepEqual(JSON.parse(openCall.init.body), { token });
  const state = opened.store.getState();
  assert.equal(state.step, "price");
  assert.equal(state.resumeNotice, "Your saved plan is ready. Review today's price and first-cleanup terms before continuing. Contact details and permissions have not been restored.");
  assert.deepEqual([state.zip, state.dogCount, state.frequency, state.yardSize, state.areas.slice().sort().join()], ["46280", "9", "twice", "xl", "back,front,side"]);
  assert.equal(state.customerStatus, "", "customer status was pre-selected from the saved plan");
  assert.equal(state.firstName + state.lastName + state.phone + state.email + state.address + state.question + state.startTiming + state.lastCleaned, "");
  assert.equal(state.smsConsent || state.termsAccepted, false);
  assert.equal(state.intent, "service_request");
  assert.equal(opened.store.quote().priceCents, 4499);
  assert.equal(gtag.filter((c) => c[1] === "price_viewed").length + fbq.length, 0, "an event fired on resume: " + JSON.stringify(gtag.map((c) => c[1])));
  assert.equal(worker.upstream.calls, 0);
  // the resumed visitor can go on to a request the Worker accepts, with a NEW id
  fillRequest(opened, { intent: "service_request", contact: "call", status: "new" });
  const sent = await opened.store.submit();
  assert.equal(sent.ok, true);
});

await check("real Worker replies when opening: unknown token 404, plan no longer valid 409, prices changed since saving, malformed token (no request at all)", async () => {
  const worker = makeWorker();
  // unknown but well-formed token
  let made = makeStore({ worker });
  let result = await made.store.resume("Z".repeat(43));
  assert.equal(result.ok, false);
  assert.equal(result.status, "expired");
  assert.equal(made.store.getState().resumeNotice, "This save link has expired or is unavailable. Please build a new quote.");
  assert.equal(made.store.getState().step, "dogs");
  // malformed: nothing is asked of anyone
  made = makeStore({ worker });
  for (const token of ["", "short", "A".repeat(44), "A".repeat(42) + "!", "invalid", null, undefined]) {
    result = await made.store.resume(token);
    assert.equal(result.status, "invalid_token");
    assert.equal(made.store.getState().resumeNotice, "This save link is invalid. Please build a new quote.");
  }
  assert.equal(made.bridge.calls.length, 0);
  // a stored plan whose ZIP is no longer served -> 409 PLAN_UNAVAILABLE
  const saver = ready({ worker }, "weekly");
  const saved = await saver.store.createSaveLink();
  const token = saved.url.split("#resume=")[1];
  const instance = [...worker.instances.values()].find((item) => item.data.has("resumePlan"));
  const record = instance.data.get("resumePlan");
  instance.data.set("resumePlan", Object.assign({}, record, { plan: Object.assign({}, record.plan, { zip: "46201" }) }));
  made = makeStore({ worker });
  result = await made.store.resume(token);
  assert.equal(result.status, "plan_unavailable");
  assert.equal(made.store.getState().resumeNotice, "Coverage or plan options have changed. Please build a new quote with the current options.");
  assert.equal(made.store.getState().zip, "");
  // prices changed since saving -> the second notice
  instance.data.set("resumePlan", Object.assign({}, record, { pricingFingerprint: "older-tables" }));
  made = makeStore({ worker });
  result = await made.store.resume(token);
  assert.equal(result.ok, true);
  assert.equal(result.pricingChanged, true);
  assert.equal(made.store.getState().resumeNotice, "Pricing has changed since you saved this plan. We have recalculated it using today's prices. Review the current price and first-cleanup terms before continuing.");
});

await check("the reply to an open is re-checked locally (spec 8.2 step 4): extra key, bad ZIP, bad areas, bad status, wrong price, wrong pricing version, wrong custom flag", async () => {
  const good = { ok: true, plan: { zip: "46032", dogs: 2, frequencyId: "weekly", yardSizeId: "m", areaIds: ["back", "front"], customerStatus: "new" }, quote: { custom: false, priceCents: 2899, pricingVersion: "2026-08-cloudflare-v1" }, pricingChanged: false, expiresAt: T0 + 1000 };
  const bad = problems();
  const cases = [
    ["as sent by the Worker", (r) => r, true, ""],
    ["extra key in the plan", (r) => { r.plan.firstName = "Planted"; }, false, C.RESUME_MESSAGES.localCheckFailed],
    ["missing key", (r) => { delete r.plan.customerStatus; }, false, C.RESUME_MESSAGES.localCheckFailed],
    ["ZIP not served", (r) => { r.plan.zip = "46201"; }, false, C.RESUME_MESSAGES.localCheckFailed],
    ["dogs as a string", (r) => { r.plan.dogs = "2"; }, false, C.RESUME_MESSAGES.localCheckFailed],
    ["duplicate areas", (r) => { r.plan.areaIds = ["back", "back"]; }, false, C.RESUME_MESSAGES.localCheckFailed],
    ["unknown area", (r) => { r.plan.areaIds = ["roof"]; }, false, C.RESUME_MESSAGES.localCheckFailed],
    ["status not one of three", (r) => { r.plan.customerStatus = ""; }, false, C.RESUME_MESSAGES.localCheckFailed],
    ["price differs", (r) => { r.quote.priceCents = 2999; }, false, C.RESUME_MESSAGES.priceMismatch],
    ["pricing version differs", (r) => { r.quote.pricingVersion = "2027-01"; }, false, C.RESUME_MESSAGES.priceMismatch],
    ["custom flag differs", (r) => { r.quote.custom = true; r.quote.priceCents = null; }, false, C.RESUME_MESSAGES.priceMismatch],
    ["frequency not offered for the dogs", (r) => { r.plan.dogs = 6; }, false, C.RESUME_MESSAGES.priceMismatch],
    ["one-time over 1 acre", (r) => { r.plan.frequencyId = "onetime"; r.plan.yardSizeId = "over"; }, false, C.RESUME_MESSAGES.priceMismatch]
  ];
  for (const [name, mutate, expectOk, expectNotice] of cases) {
    const reply = plain(good);
    mutate(reply);
    const store = C.create({
      mode: "live", endpoint: WORKER_ORIGIN + "/submit", storage: fakeStorage(), location: fakeLocation(SITE_ORIGIN + "/"), history: { replaceState() {} }, console: null,
      fetch: async () => ({ status: 200, ok: true, text: async () => JSON.stringify(reply) })
    });
    const result = await store.resume("A".repeat(43));
    if (result.ok !== expectOk) { bad.add(name + ": ok is " + result.ok); continue; }
    if (!expectOk) {
      if (store.getState().resumeNotice !== expectNotice) bad.add(name + ": notice " + JSON.stringify(store.getState().resumeNotice));
      const state = store.getState();
      if (state.step !== "dogs" || state.zip || state.dogCount || state.frequency || state.firstName) bad.add(name + ": a rejected plan was partly loaded");
    }
  }
  bad.done();
});

await check("no save link without a complete, in-area plan: nothing is sent", async () => {
  const worker = makeWorker();
  const made = makeStore({ worker });
  assert.equal((await made.store.createSaveLink()).status, "not_ready");
  fillPlan(made.store, PLANS.weekly);
  made.store.set({ zip: "46201" });
  const outside = await made.store.createSaveLink();
  assert.equal(outside.status, "not_ready");
  made.store.set({ zip: "4603" });
  assert.equal((await made.store.createSaveLink()).status, "not_ready");
  made.store.set({ zip: "46032" });
  made.store.set({ areas: [] });
  assert.equal((await made.store.createSaveLink()).status, "not_ready");
  assert.equal(made.bridge.calls.length, 0);
});

await check("the real Worker's limit of 10 saves an hour: the 11th gets the rate-limit message and the visitor can carry on", async () => {
  const worker = makeWorker();
  const made = makeStore({ worker });
  fillPlan(made.store, PLANS.weekly);
  const zips = C.SERVICE_ZIPS.slice(0, 11);
  let last = null;
  for (const zip of zips) {
    made.store.set({ zip });
    last = await made.store.createSaveLink();
  }
  assert.equal(last.ok, false);
  assert.equal(last.status, "rate_limited");
  assert.equal(last.message, "Too many save-link attempts. Please try again later; you can still build a quote.");
  assert.equal(made.store.getState().locked, null);
  assert.equal(made.store.validatePlan().ok, true);
});

/* ======================================================================
 * J. random walks against the real replay ledger
 * ==================================================================== */

group("J. Random retries and edits against the real replay ledger");

await check("300 random sessions of edits, retries, lost replies, outages and network failures: one id never carries two different requests, an unchanged request never gets a second id, no lead is forwarded twice, no conflict ever occurs", async () => {
  let seed = 987654321;
  const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const worker = makeWorker();
  const bad = problems();
  let submits = 0;
  let successes = 0;
  const fingerprintById = new Map();
  const forwardedIds = new Map();

  const materialEdits = [
    (s) => s.set({ firstName: pick(["Test", "Tess", "Tester"]) }),
    (s) => s.set({ phone: pick(["3175550100", "3175550101"]) }),
    (s) => s.set({ email: pick(["test@example.com", "test2@example.com"]) }),
    (s) => s.set({ dogCount: pick(["1", "2", "3", "4"]) }),
    (s) => s.set({ yardSize: pick(["s", "m", "l", "xl"]) }),
    (s) => s.set({ areas: pick([["back"], ["back", "front"], ["front", "back"], ["side", "front", "back"]]) }),
    (s) => s.set({ frequency: pick(["twice", "weekly", "biweekly", "onetime"]) }),
    (s) => s.set({ zip: pick(["46032", "46033", "46074"]) }),
    (s) => s.set({ lastCleaned: pick(C.LAST_CLEANED_OPTIONS) }),
    (s) => s.set({ customerStatus: pick(["new", "returning", "not_sure"]) }),
    (s) => s.set({ preferredContact: pick(["text", "email", "call"]) }),
    (s) => s.set({ intent: pick(["service_request", "quote_delivery", "question"]) }),
    (s) => s.set({ question: pick([FAKE.question, "Another test question?"]) })
  ];
  const cosmeticEdits = [
    (s) => s.set({ firstName: " " + s.getState().firstName.trim() + "  " }),
    (s) => { if (s.getState().phone) s.set({ phone: "1" + s.getState().phone.replace(/\D/g, "") }); },
    (s) => s.set({ email: s.getState().email.toUpperCase() }),
    (s) => { s.set({ smsConsent: false }); },
    (s) => { s.set({ termsAccepted: false }); },
    (s) => s.set({ areas: s.getState().areas.slice().reverse() })
  ];
  // Brings the form back to a sendable state the way a visitor would.
  function complete(made) {
    const s = made.store;
    const state = s.getState();
    if (state.intent === "question" && state.question.trim().length < 5) s.set({ question: FAKE.question });
    if (state.intent === "service_request") {
      if (!state.lastName) s.set({ lastName: FAKE.lastName });
      if (!state.address) s.set({ address: FAKE.address });
      if (!state.startTiming) s.set({ startTiming: "As soon as possible" });
      if (!state.customerStatus) s.set({ customerStatus: "new" });
    }
    if (!s.getState().frequency) s.set({ frequency: "weekly" });
    if (s.getState().preferredContact === "email" && !s.getState().email) s.set({ email: FAKE.email });
    if (!C.normalizePhone(s.getState().phone)) s.set({ phone: FAKE.phone });
    if (s.getState().email && !C.isValidEmail(s.getState().email)) s.set({ email: FAKE.email });
    if (!s.getState().firstName.trim()) s.set({ firstName: FAKE.firstName });
    if (s.getState().preferredContact === "text" && !s.getState().smsConsent) { made.clock.t += 7; s.set({ smsConsent: true }); }
    if (s.getState().intent === "service_request" && !s.getState().termsAccepted) { made.clock.t += 7; s.set({ termsAccepted: true }); }
  }

  for (let session = 0; session < 300; session += 1) {
    const made = ready({ worker }, pick(["weekly", "twice", "biweekly", "onetime"]), pick(["service_request", "quote_delivery", "question"]), pick(["text", "email"]));
    made.store.set({ email: FAKE.email });
    let chain = null; // { requestId, fingerprint } of the last attempt that did not end in success
    for (let step = 0; step < 14; step += 1) {
      const roll = rand();
      if (roll < 0.3) pick(materialEdits)(made.store);
      else if (roll < 0.5) pick(cosmeticEdits)(made.store);
      else {
        complete(made);
        if (!made.store.validateSubmit().ok) { bad.add("session " + session + ": could not complete the form: " + JSON.stringify(made.store.validateSubmit().errors.map((e) => e.field))); break; }
        const condition = pick(["ok", "ok", "lost", "outage", "netfail"]);
        made.clock.t += 1000;
        let result;
        if (condition === "ok") result = await made.store.submit();
        else if (condition === "outage") result = await withoutLedger(worker, () => made.store.submit());
        else if (condition === "netfail") { made.bridge.mode = "network-fail"; result = await made.store.submit(); made.bridge.mode = "normal"; }
        else {
          made.bridge.mode = "lose-reply";
          const before = made.bridge.lostReplies;
          const pending = made.store.submit();
          await until(() => made.bridge.lostReplies === before + 1, "lost reply");
          made.fireTimers();
          result = await pending;
          made.bridge.mode = "normal";
        }
        submits += 1;
        const payload = result.payload;
        if (!payload) { bad.add("session " + session + ": no payload, status " + result.status); break; }
        const fingerprint = await workerFingerprintOf(payload);
        if (fingerprint.startsWith("INVALID")) { bad.add("session " + session + ": payload the Worker rejects: " + fingerprint); break; }
        if (result.status === "locked") { bad.add("session " + session + " step " + step + " (" + condition + "): locked with " + result.code); break; }
        if (fingerprintById.has(payload.requestId) && fingerprintById.get(payload.requestId) !== fingerprint) bad.add("session " + session + ": id " + payload.requestId + " was reused for different details");
        fingerprintById.set(payload.requestId, fingerprint);
        if (chain && chain.fingerprint === fingerprint && chain.requestId !== payload.requestId) bad.add("session " + session + " step " + step + ": an unchanged request got a new id (" + chain.requestId + " -> " + payload.requestId + ")");
        if (chain && chain.fingerprint !== fingerprint && chain.requestId === payload.requestId) bad.add("session " + session + ": a changed request kept its id");
        const expected = { ok: "success", lost: "timeout", outage: "unavailable", netfail: "network" }[condition];
        // A lost reply that is retried against a healthy Worker replays the receipt, so "ok" covers it.
        if (result.status !== expected) bad.add("session " + session + " (" + condition + "): status " + result.status);
        if (result.ok) { successes += 1; chain = null; break; }
        chain = { requestId: payload.requestId, fingerprint };
      }
    }
  }
  for (const forward of worker.upstream.received) forwardedIds.set(forward.requestId, (forwardedIds.get(forward.requestId) || 0) + 1);
  for (const [id, count] of forwardedIds) if (count !== 1) bad.add("request " + id + " was forwarded " + count + " times");
  bad.done();
  return submits + " submits in 300 sessions; " + successes + " ended in success; " + worker.upstream.received.length + " leads forwarded, each once";
});

/* ======================================================================
 * K. demo mode: no network, every path, every simulated reply
 * ==================================================================== */

group("K. Demo mode (the default) makes no network call on any path");

function browserSandbox(href) {
  const url = new URL(href);
  const calls = { fetch: [], xhr: [], beacon: [], image: [], socket: [], element: [], gtag: [], fbq: [], dataLayer: [], cookieWrites: [], localStorage: [], console: [], timerMs: [] };
  const storage = fakeStorage();
  const sandbox = {
    console: { info: (...a) => calls.console.push(["info", ...a]), warn: (...a) => calls.console.push(["warn", ...a]), log: (...a) => calls.console.push(["log", ...a]), error: (...a) => calls.console.push(["error", ...a]) },
    // Every wait collapses to "next turn"; the requested length is recorded.
    setTimeout: (fn, ms) => { calls.timerMs.push(ms); return setTimeout(fn, 0); },
    clearTimeout: (handle) => clearTimeout(handle),
    URL, URLSearchParams, AbortController,
    crypto: { randomUUID: () => globalThis.crypto.randomUUID() },
    location: { href: url.href, search: url.search, hash: url.hash, pathname: url.pathname, protocol: url.protocol, origin: url.origin, hostname: url.hostname },
    history: { state: null, replaceState() {} },
    sessionStorage: storage,
    // Every touch is recorded, with what was written. (Since engine 1.4.0 the engine may use ONE key here:
    // the 30-day copy of the attribution parameters, T23. The proof below checks that it is the only one.)
    localStorage: { getItem: (k) => { calls.localStorage.push(["get", k]); return null; }, setItem: (k, v) => { calls.localStorage.push(["set", k, String(v)]); }, removeItem: (k) => { calls.localStorage.push(["remove", k]); } },
    navigator: { sendBeacon: (...a) => { calls.beacon.push(String(a[0])); return true; }, userAgent: "contract-check" },
    fetch: (...a) => { calls.fetch.push(String(a[0])); throw new Error("fetch is not allowed in demo mode"); },
    XMLHttpRequest: class { open(...a) { calls.xhr.push(a.join(" ")); } send() { calls.xhr.push("send"); } setRequestHeader() {} },
    Image: class { set src(value) { calls.image.push(String(value)); } },
    WebSocket: class { constructor(target) { calls.socket.push(String(target)); } },
    EventSource: class { constructor(target) { calls.socket.push(String(target)); } },
    gtag: (...a) => { calls.gtag.push(a); },
    fbq: (...a) => { calls.fbq.push(a); },
    dataLayer: []
  };
  sandbox.dataLayer.push = (...a) => { calls.dataLayer.push(a); return 0; };
  let cookie = "_fbp=fb.1.1700000000000.999; _fbc=fb.1.1700000000000.demo";
  sandbox.document = {
    get cookie() { return cookie; },
    set cookie(value) { calls.cookieWrites.push(String(value)); },
    addEventListener() {}, removeEventListener() {},
    createElement: (tag) => { calls.element.push(String(tag)); return {}; },
    querySelector: () => null
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(engineSource, sandbox, { filename: "pp-quote-core.js (as a script tag)" });
  return { sandbox, calls, storage, P: sandbox.PPQuoteCore };
}
function networkTouches(calls) {
  return calls.fetch.length + calls.xhr.length + calls.beacon.length + calls.image.length + calls.socket.length + calls.element.length + calls.gtag.length + calls.fbq.length + calls.dataLayer.length;
}
function demoFill(store, planKey, intent, contact) {
  const plan = PLANS[planKey];
  store.set({ dogCount: plan.dogCount });
  store.set({ zip: plan.zip });
  store.set({ yardSize: plan.yardSize });
  store.set({ areas: plan.areas });
  store.set({ frequency: plan.frequency });
  store.set({ intent });
  store.set({ preferredContact: contact });
  store.set({ customerStatus: "new", firstName: "Test", lastName: "Reviewer", phone: "3175550100", email: "test@example.com", address: "123 Example St", startTiming: "As soon as possible", lastCleaned: "About 1 month", question: "Is this only a test question?" });
  if (contact === "text") store.set({ smsConsent: true });
  if (intent === "service_request") store.set({ termsAccepted: true });
}

const demoRun = browserSandbox("file:///G:/review/home.html?utm_source=review");

await check("as a script tag in a page with fetch, XHR, beacon, Image, sockets, gtag, fbq and dataLayer present: defaults to demo; a stray endpoint option does not switch it to live", () => {
  const { P } = demoRun;
  assert.ok(P, "window.PPQuoteCore is not defined");
  const store = P.create();
  assert.equal(store.mode, "demo");
  assert.equal(store.isDemo, true);
  for (const options of [{ endpoint: WORKER_ORIGIN + "/submit" }, { mode: "LIVE", endpoint: WORKER_ORIGIN + "/submit" }, { mode: true, endpoint: WORKER_ORIGIN + "/submit" }, { live: true }, { mode: "production" }]) {
    assert.equal(P.create(options).mode, "demo", JSON.stringify(options));
  }
});

await check("every simulated submit reply x intent x reply method in demo: result and state match spec 4.5.2; a retry after a retryable failure reuses the id", async () => {
  const { P, calls } = demoRun;
  const bad = problems();
  const combos = [
    ["weekly", "service_request", "text"], ["onetime", "service_request", "email"], ["custom10", "service_request", "call"],
    ["twice", "quote_delivery", "text"], ["biweekly", "quote_delivery", "email"],
    ["weekly", "question", "text"], ["onetime10", "question", "email"], ["twice", "question", "call"]
  ];
  assert.deepEqual(plain(P.DEMO_SUBMIT_OUTCOMES), ["success", "slow", "invalid", "uncertain", "conflict", "unavailable", "timeout", "network", "forbidden"]);
  for (const outcome of P.DEMO_SUBMIT_OUTCOMES) {
    for (const [planKey, intent, contact] of combos) {
      const label = outcome + "/" + planKey + "/" + intent + "/" + contact;
      const store = P.create({ demo: { submit: outcome, delayMs: 0, invalidFields: ["phone", "street", "clientPriceCents"] } });
      demoFill(store, planKey, intent, contact);
      if (!store.validateSubmit().ok) { bad.add(label + ": could not fill: " + JSON.stringify(plain(store.validateSubmit().errors).map((e) => e.field))); continue; }
      calls.timerMs.length = 0;
      const pending = store.submit();
      if (store.getState().submitting !== true) bad.add(label + ": not in the sending state while waiting");
      if ((await store.submit()).status !== "busy") bad.add(label + ": a second submit was not refused while sending");
      const result = await pending;
      const state = store.getState();
      const id = result.payload && result.payload.requestId;
      if (state.submitting) bad.add(label + ": still submitting afterwards");
      if (store.networkLog.length) bad.add(label + ": networkLog has " + store.networkLog.length + " entries");
      if (result.demo !== true) bad.add(label + ": result is not marked demo");
      if (store.submissionLog.length !== 1 || plain(store.submissionLog[0].payload).requestId !== id) bad.add(label + ": submissionLog");

      if (outcome === "success" || outcome === "slow") {
        if (!result.ok || result.status !== "success" || state.step !== "done" || !state.receipt || state.receipt.requestId !== id || result.reference !== id) bad.add(label + ": not a success");
        if (outcome === "slow" && !calls.timerMs.some((ms) => ms >= 4000)) bad.add(label + ": slow did not ask for a 4 second wait");
        if (demoRun.storage.items.pp_quote_progress_v3 !== undefined) bad.add(label + ": progress not cleared");
        if (state.locked) bad.add(label + ": locked after success");
        const stageEvents = plain(store.trackLog).filter((e) => e.event === result.payload.stage);
        if (stageEvents.length !== 1 || stageEvents[0].params.event_id !== id + ":" + result.payload.stage) bad.add(label + ": stage event");
        const leads = plain(store.trackLog).filter((e) => e.event === "Lead" || e.event === "generate_lead" || e.event === "conversion");
        if (intent === "service_request" ? leads.length !== 3 : leads.length !== 0) bad.add(label + ": lead events " + leads.map((e) => e.event));
        if (plain(store.trackLog).some((e) => e.sent !== false)) bad.add(label + ": an event is marked sent in demo mode");
        continue;
      }
      // every failure: not done, nothing received, no conversion event
      if (result.ok || state.step === "done" || state.receipt) bad.add(label + ": a failure ended as success");
      if (plain(store.trackLog).some((e) => ["Lead", "generate_lead", "conversion", "service_requested", "estimate_requested", "quote_requested", "question_submitted"].includes(e.event))) bad.add(label + ": a conversion event fired for a failure");

      if (outcome === "uncertain" || outcome === "conflict") {
        const code = outcome === "uncertain" ? "SUBMISSION_UNCERTAIN" : "REQUEST_ID_CONFLICT";
        const text = (outcome === "uncertain"
          ? "Your request may already be with our team. Please call (317) 961-5865 to confirm before submitting again. Your reference is {id}. Nothing has been scheduled or charged by this form."
          : "We could not safely submit the changed details. Please call (317) 961-5865 and mention reference {id}.").replace("{id}", id);
        if (result.status !== "locked" || result.locked !== true || result.code !== code || result.message !== text || result.retryAllowed !== false) bad.add(label + ": result " + result.status + " / " + result.code + " / " + result.message);
        if (!state.locked || state.locked.code !== code || state.locked.message !== text || state.locked.requestId !== id) bad.add(label + ": state.locked " + JSON.stringify(plain(state.locked)));
        store.demo.submit = "success"; // even if the "server" recovers, the form stays locked
        const again = await store.submit();
        if (again.status !== "locked" || again.message !== text || store.submissionLog.length !== 1) bad.add(label + ": a locked form was resubmitted");
        if (store.set({ firstName: "Changed" }).ok || store.edit("dogs").ok || store.goTo("price").ok || store.back().ok || store.reset() !== false) bad.add(label + ": a locked form could be edited, navigated or reset");
        if (store.flow().primaryAction !== "none") bad.add(label + ": primary action still offered while locked");
        continue;
      }

      // the retryable failures
      const expected = {
        invalid: ["server_invalid", "Please check the highlighted form details."],
        unavailable: ["unavailable", "We could not connect to save your request. Please try again or call (317) 961-5865."],
        timeout: ["timeout", "This is taking longer than expected. Please try again or call (317) 961-5865."],
        network: ["network", "We could not send this request. Please try again or call (317) 961-5865."],
        forbidden: ["rejected", "We could not save your request. Please try again."]
      }[outcome];
      if (result.status !== expected[0] || result.message !== expected[1]) bad.add(label + ": " + result.status + " / " + JSON.stringify(result.message));
      if (result.retryAllowed !== true || result.locked !== false || state.locked !== null) bad.add(label + ": retry not allowed or locked");
      if (outcome === "invalid") {
        const fields = plain(result.fieldErrors).map((e) => e.field + "@" + e.step);
        const service = intent === "service_request";
        if (JSON.stringify(fields) !== JSON.stringify(["phone@request", "address@request"])) bad.add(label + ": fieldErrors " + fields);
        if (plain(result.formErrors).length !== 1) bad.add(label + ": formErrors " + JSON.stringify(plain(result.formErrors)));
        void service;
      }
      if (outcome === "forbidden" && result.serverMessage !== "Forbidden") bad.add(label + ": raw server text not kept for debugging");
      // the visitor can still edit after a retryable failure, and a plain retry reuses the id
      store.demo.submit = "success";
      const retry = await store.submit();
      if (!retry.ok || retry.payload.requestId !== id) bad.add(label + ": retry id " + (retry.payload && retry.payload.requestId) + " vs " + id + " (" + retry.status + ")");
      if (JSON.stringify(plain(retry.payload)) !== JSON.stringify(plain(result.payload))) bad.add(label + ": retried payload differs");
    }
  }
  bad.done();
  return (demoRun.P.DEMO_SUBMIT_OUTCOMES.length * combos.length) + " submit paths";
});

await check("after a retryable demo failure the visitor can change a detail, and the changed request gets a new id", async () => {
  const { P } = demoRun;
  for (const outcome of ["invalid", "unavailable", "timeout", "network", "forbidden"]) {
    const store = P.create({ demo: { submit: outcome, delayMs: 0 } });
    demoFill(store, "weekly", "service_request", "text");
    const first = await store.submit();
    assert.equal(store.set({ phone: "3175550111" }).ok, true, outcome + ": edit refused");
    store.set({ termsAccepted: true });
    store.demo.submit = "success";
    const second = await store.submit();
    assert.equal(second.ok, true, outcome);
    assert.notEqual(second.payload.requestId, first.payload.requestId, outcome);
    assert.equal(second.payload.phone, "3175550111");
  }
});

await check("every simulated save-link and resume reply in demo, the page hooks, tracking and out-of-area paths", async () => {
  const { P, sandbox } = demoRun;
  const bad = problems();
  const saveExpect = {
    success: ["created", true, "Your link is ready."],
    rate_limited: ["rate_limited", false, "Too many save-link attempts. Please try again later; you can still build a quote."],
    unavailable: ["unavailable", false, "Save links are temporarily unavailable. You can continue with your quote."],
    invalid: ["rejected", false, "This saved plan could not be opened. Please build a new quote."],
    timeout: ["timeout", false, "Creating the link took too long. You can try again or continue with your quote."],
    bad_link: ["bad_link", false, "We could not create a valid save link."]
  };
  assert.deepEqual(plain(P.DEMO_SAVE_OUTCOMES).sort(), Object.keys(saveExpect).sort());
  let ownLinkToken = "";
  for (const outcome of P.DEMO_SAVE_OUTCOMES) {
    const store = P.create({ demo: { save: outcome, delayMs: 0 } });
    demoFill(store, "weekly", "service_request", "text");
    const result = await store.createSaveLink();
    const [status, ok, message] = saveExpect[outcome];
    if (result.status !== status || result.ok !== ok || result.message !== message) bad.add("save " + outcome + ": " + result.status + " / " + result.message);
    if (JSON.stringify(Object.keys(plain(result.body))) !== JSON.stringify(["zip", "dogs", "frequencyId", "yardSizeId", "areaIds", "customerStatus"])) bad.add("save " + outcome + ": body keys");
    if (ok && !/^https:\/\/quote\.itspurgepros\.com\/#resume=[A-Za-z0-9_-]{43}$/.test(result.url)) bad.add("save " + outcome + ": url " + result.url);
    if (store.networkLog.length) bad.add("save " + outcome + ": networkLog");
    if (ok) {
      ownLinkToken = result.url.split("#resume=")[1];
      const opened = await store.resume(ownLinkToken);
      if (!opened.ok || store.getState().step !== "price" || store.getState().customerStatus !== "" || store.getState().firstName !== "") bad.add("demo resume of own link");
    }
  }
  const resumeExpect = {
    success: [true, "Your saved plan is ready. Review today's price and first-cleanup terms before continuing. Contact details and permissions have not been restored."],
    changed: [true, "Pricing has changed since you saved this plan. We have recalculated it using today's prices. Review the current price and first-cleanup terms before continuing."],
    expired: [false, "This save link has expired or is unavailable. Please build a new quote."],
    plan_unavailable: [false, "Coverage or plan options have changed. Please build a new quote with the current options."],
    mismatch: [false, "The available prices or plan options changed. Reload this page to build a quote with the current options."],
    timeout: [false, "The saved plan took too long to load. Reopen your saved link to try again, or build a new quote."],
    rate_limited: [false, "Too many save-link attempts. Please try again later; you can still build a quote."],
    unavailable: [false, "Save links are temporarily unavailable. You can continue with your quote."]
  };
  assert.deepEqual(plain(P.DEMO_RESUME_OUTCOMES).sort(), Object.keys(resumeExpect).sort());
  for (const outcome of P.DEMO_RESUME_OUTCOMES) {
    const store = P.create({ demo: { resume: outcome, delayMs: 0 } });
    demoFill(store, "twice", "service_request", "text"); // must all be wiped by the resume
    const result = await store.resume("A".repeat(43));
    const [ok, notice] = resumeExpect[outcome];
    const state = store.getState();
    if (result.ok !== ok || state.resumeNotice !== notice) bad.add("resume " + outcome + ": ok " + result.ok + " / " + state.resumeNotice);
    if (state.firstName || state.phone || state.email || state.address || state.smsConsent || state.termsAccepted || state.customerStatus) bad.add("resume " + outcome + ": personal details or consent survived");
    if (ok ? state.step !== "price" : state.step !== "dogs" || state.dogCount !== "") bad.add("resume " + outcome + ": step " + state.step);
    if (store.networkLog.length) bad.add("resume " + outcome + ": networkLog");
    if (plain(store.trackLog).some((e) => e.event === "price_viewed" || e.event === "Lead")) bad.add("resume " + outcome + ": an event fired");
  }
  // hooks, tracking, out-of-area
  const store = P.create({ demo: { delayMs: 0 } });
  const hooks = P.installPageHooks(store, { open() {}, close() {} });
  sandbox.PurgeProsQuote.open({ zip: "46201" });
  if (store.getState().step !== "zip" || store.checkZip().status !== "out_of_area") bad.add("open with an out-of-area ZIP");
  demoFillContactOnly(store);
  const refused = await store.submit();
  if (refused.status !== "invalid" || !plain(refused.fieldErrors).some((e) => e.field === "zip") || store.submissionLog.length) bad.add("out-of-area submit was not stopped: " + refused.status);
  const noLink = await store.createSaveLink();
  if (noLink.ok || store.submissionLog.length) bad.add("out-of-area save link");
  sandbox.PurgeProsQuote.open({ zip: "46032" });
  store.track("yard_size_help_opened");
  store.track("promotion_details_viewed", { promotion: "No start-up fee" });
  hooks.uninstall();
  bad.done();
});
function demoFillContactOnly(store) {
  store.set({ firstName: "Test", lastName: "Reviewer", phone: "3175550100", lastCleaned: "About 1 month" });
}

await check("the proof: across every demo path above, zero fetch / XHR / beacon / Image / socket / script-element calls, zero gtag / fbq / dataLayer calls, no cookie written, localStorage touched for the one attribution key only (the nine parameters and a date), only the two sessionStorage keys", () => {
  const { calls, storage } = demoRun;
  assert.equal(calls.fetch.length, 0, "fetch: " + calls.fetch.slice(0, 3));
  assert.equal(calls.xhr.length, 0, "XMLHttpRequest");
  assert.equal(calls.beacon.length, 0, "sendBeacon");
  assert.equal(calls.image.length, 0, "Image");
  assert.equal(calls.socket.length, 0, "WebSocket/EventSource");
  assert.equal(calls.element.length, 0, "document.createElement");
  assert.equal(calls.gtag.length, 0, "gtag was called in demo mode");
  assert.equal(calls.fbq.length, 0, "fbq was called in demo mode");
  assert.equal(calls.dataLayer.length, 0, "dataLayer.push was called in demo mode");
  assert.equal(calls.cookieWrites.length, 0, "a cookie was written");
  // localStorage: ONE key (T23), and what is written there is the capture moment and the nine attribution parameters, nothing else.
  assert.ok(calls.localStorage.length > 0, "the demo page arrived with ?utm_source=, so the 30-day copy should have been written");
  assert.deepEqual([...new Set(calls.localStorage.map((call) => call[1]))], ["pp_quote_attribution_kept_v1"], "localStorage was touched under another key");
  assert.equal(demoRun.P.STORAGE_KEYS.attributionKept, "pp_quote_attribution_kept_v1");
  const keptWrites = calls.localStorage.filter((call) => call[0] === "set");
  assert.ok(keptWrites.length > 0);
  for (const write of keptWrites) {
    const value = JSON.parse(write[2]);
    assert.deepEqual(Object.keys(value), ["capturedAt", "values"]);
    assert.equal(typeof value.capturedAt, "number");
    assert.deepEqual(value.values, { utm_source: "review" });
    assert.ok(Object.keys(value.values).every((key) => demoRun.P.ATTRIBUTION_KEYS.includes(key)));
  }
  for (const secret of ["Test", "Reviewer", "3175550100", "555-0100", "test@example.com", "123 Example St", "test question", "46032", "weekly"]) assert.ok(!JSON.stringify(calls.localStorage).includes(secret), "localStorage was given " + secret);
  const keys = new Set(storage.writes.map((write) => write.key));
  assert.deepEqual([...keys].sort(), ["pp_quote_attribution_v3", "pp_quote_progress_v3"]);
  const everything = storage.writes.map((write) => write.value).join("\n");
  for (const secret of ["Test", "Reviewer", "3175550100", "555-0100", "test@example.com", "123 Example St", "test question"]) assert.ok(!everything.includes(secret), "sessionStorage was given " + secret);
  assert.ok(calls.console.some((entry) => entry[1] === "Purge Pros demo submission"), "the demo payload is logged to the console as the live demo does");
  return networkTouches(calls) + " network or tag calls; " + storage.writes.length + " sessionStorage writes, all plan or attribution";
});

await check("static scan of the engine source: one network call site (env.fetch inside postJson), reachable only through sendLive and resumeFetch, each behind `sends` (live or staging mode, never demo); a tag is called only in live mode; no XHR, beacon, sockets, script or image creation, dynamic import or cookie writing; localStorage is looked up in one place and used under one key", () => {
  const code = engineSource.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((line) => line.replace(/^\s*\/\/.*$/, "")).join("\n");
  const count = (pattern) => (code.match(pattern) || []).length;
  assert.equal(count(/\bfetch\s*\(/g), 2, "fetch( call sites"); // the window.fetch wrapper and env.fetch in postJson
  assert.equal(count(/env\.fetch\s*\(/g), 1);
  assert.equal(count(/\bpostJson\s*\(/g), 3); // definition, sendLive, resumeFetch
  assert.equal(count(/\bsendLive\s*\(/g), 2); // definition and the guarded call
  // Since engine 1.5.0 (the send switch) the guard is `sends`: true in live and staging mode, false in demo, and set in
  // exactly one place. Demo is whatever is not asked for by name. Each sending call is behind it, and behind the page
  // guard (sendBlockedReason) checked just before.
  assert.ok(code.includes('const mode = settings.mode === "live" ? "live" : settings.mode === "staging" ? "staging" : "demo";'));
  assert.ok(code.includes('const sends = mode !== "demo";'));
  assert.equal(count(/\bsends\s*=[^=]/g), 1, "sends is assigned once");
  assert.ok(code.includes('const sent = sends ? sendLive(payload) : sendDemo(payload);'));
  assert.equal(count(/\bresumeFetch\s*\(/g), 3); // definition and two guarded calls
  assert.equal(count(/sends \? resumeFetch\(/g), 2);
  // A tag is called only in live mode: every gtag, dataLayer and fbq call sits inside `if (mode === "live")`.
  assert.equal(count(/if \(mode === "live"\) \{/g), 4, "the three tag senders, and the live branch of siteOptions (which calls nothing)");
  assert.equal(count(/\b(gtag|fbq)\(/g), 4, "gtag( twice and fbq( twice, all inside the three senders");
  assert.equal(count(/dataLayer\.push\(/g), 1);
  for (const banned of [/XMLHttpRequest/, /sendBeacon/, /WebSocket/, /EventSource/, /createElement/, /importScripts/, /\bimport\s*\(/, /new\s+Image/, /new\s+Worker/, /\.cookie\s*=[^=]/, /\beval\s*\(/, /new\s+Function/]) {
    assert.ok(!banned.test(code), "engine source uses " + banned);
  }
  // localStorage (T23, engine 1.4.0): one guarded lookup in the environment, then exactly one read, one write and
  // one removal, each under STORAGE_KEYS.attributionKept. Nothing else can reach it.
  assert.equal(count(/localStorage/g), 2, "localStorage is named outside the one lookup");
  assert.ok(code.includes("try { keptStorage = win && win.localStorage ? win.localStorage : null; } catch (_) { keptStorage = null; }"));
  assert.equal(count(/persistentStorage\.(getItem|setItem|removeItem)\(/g), 3);
  assert.equal(count(/env\.persistentStorage\.getItem\(STORAGE_KEYS\.attributionKept\)/g), 1);
  assert.equal(count(/env\.persistentStorage\.setItem\(STORAGE_KEYS\.attributionKept, JSON\.stringify\(\{ capturedAt: env\.now\(\), values: values \}\)\)/g), 1);
  assert.equal(count(/env\.persistentStorage\.removeItem\(STORAGE_KEYS\.attributionKept\)/g), 1);
  // tags are only called in live mode
  assert.equal(count(/if \(mode === "live"\) \{\s*\n\s*const gtag = env\.getGtag\(\);/g), 2);
  assert.equal(count(/if \(mode === "live"\) \{\s*\n\s*const fbq = env\.getFbq\(\);/g), 1);
  assert.equal(count(/env\.getGtag\(\)/g), 2);
  assert.equal(count(/env\.getFbq\(\)/g), 1);
  assert.equal(count(/env\.getDataLayer\(\)/g), 1);
  // no live endpoint is written into the engine
  assert.ok(!/purge-lead-relay/.test(engineSource), "the live Worker host is hard-coded");
});

await check("demo mode in Node with every store built by this checker: the injected fetch was never called", () => {
  // every demo store made by makeStore() has a fetch that records and throws
  const made = ready({});
  return made.store.submit().then((result) => {
    assert.equal(result.ok, true);
    assert.equal(made.strayFetches.length, 0);
    assert.equal(made.store.networkLog.length, 0);
  });
});

await check("a demo build opened on a real Purge Pros origin refuses to pretend (submit, save link, resume): status 'blocked', nothing logged as sent", async () => {
  for (const url of ["https://itspurgepros.com/", "https://www.itspurgepros.com/carmel", "https://blog.itspurgepros.com/post", "https://quote.itspurgepros.com/"]) {
    const made = ready({ url });
    const result = await made.store.submit();
    assert.equal(result.status, "blocked", url);
    assert.equal(made.store.getState().step !== "done", true);
    assert.equal(made.store.submissionLog.length, 0);
    assert.equal((await made.store.createSaveLink()).status, "blocked");
    assert.equal((await made.store.resume("A".repeat(43))).status, "blocked");
    assert.equal(made.strayFetches.length, 0);
  }
});

/* ======================================================================
 * L. the tripwires
 * ==================================================================== */

group("L. Offline guarantee for this whole run");

await check("no real network attempt was made by the engine, the Worker or this checker", () => {
  assert.deepEqual(networkAttempts, []);
  assert.equal(matrixWorker.upstream.calls, matrixWorker.upstream.received.length);
});

/* ======================================================================
 * report
 * ==================================================================== */

let lastGroup = "";
let failed = 0;
for (const entry of results) {
  if (entry.group !== lastGroup) { console.log("\n" + entry.group); lastGroup = entry.group; }
  if (entry.ok) console.log("  PASS  " + entry.title + (entry.note ? "\n          -> " + entry.note : ""));
  else { failed += 1; console.log("  FAIL  " + entry.title + "\n          !! " + entry.error); }
}
console.log("\n" + results.length + " checks, " + (results.length - failed) + " passed, " + failed + " failed. Real network attempts: " + networkAttempts.length + ".");
process.exitCode = failed ? 1 : 0;
