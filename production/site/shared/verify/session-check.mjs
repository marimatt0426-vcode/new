// VERIFIER FILE (independent check; not part of the author's suite).
//
// Drives whole visitor sessions through the PUBLIC API of pp-quote-core.js, as an
// interface would, with a fake sessionStorage and fake tag sinks, and checks the
// privacy, storage, tracking and compliance rules of spec sections 9, 10 and 17.2.
//
//   node "production/site/shared/verify/session-check.mjs"
//
// Offline by construction: global fetch throws; "live mode" sessions use an injected
// stand-in fetch and a .invalid endpoint, so no request can leave this process.
// Exit code 1 when any REQUIRED check fails. PROBE lines are reproductions of
// suspected defects: "DEFECT REPRODUCED" means the suspicion is real.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

globalThis.fetch = () => { throw new Error("NETWORK ATTEMPT (the verifier forbids it)"); };

const here = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = path.join(here, "..", "pp-quote-core.js");
const { WIDGET_PATH } = await import("./pinned-live-source.mjs"); // the pinned October 5 live source, or PP_PRODUCTION_SRC
const ENGINE_SOURCE = readFileSync(ENGINE_PATH, "utf8");
const WIDGET_SOURCE = readFileSync(WIDGET_PATH, "utf8"); // read-only reference
const C = createRequire(import.meta.url)(ENGINE_PATH);

/* ------------------------------------------------------------------ results */
const results = [];
function record(kind, id, title, ok, detail) { results.push({ kind, id, title, ok, detail: detail || "" }); }
async function required(id, title, fn) {
  try { await fn(); record("REQUIRED", id, title, true); } catch (error) { record("REQUIRED", id, title, false, String(error && error.message ? error.message : error)); }
}
// A probe returns "" when the engine behaves as expected, or a description of the defect.
async function probe(id, title, fn) {
  try { const defect = await fn(); record("PROBE", id, title, !defect, defect || ""); } catch (error) { record("PROBE", id, title, false, "probe threw: " + (error && error.stack ? error.stack : error)); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

/* -------------------------------------------------------------- test contact */
// Obviously fake. None of these may ever reach storage or an analytics tag.
const PII = { firstName: "Test", lastName: "Verifier", phone: "3175550100", email: "test@example.com", street: "123 Example St", city: "Testville", question: "Do you also clean kennels on Sundays?" };
const NEEDLES = ["test", "verifier", "3175550100", "(317) 555-0100", "555-0100", "5550100", "example.com", "123 example", "testville", "kennels", "sundays"];
const ZIPS_USED = ["46032", "46201", "46074", "46236", "46123"];
const ATTRIBUTION_QUERY = "?utm_source=meta&utm_medium=paid&utm_campaign=fall_yard&gclid=G-abc123&fbclid=FB-xyz789";

function findNeedles(text) {
  const lower = String(text).toLowerCase();
  return NEEDLES.filter((needle) => lower.includes(needle));
}

/* ------------------------------------------------------------- fake browser */
const ALLOWED_STORAGE_KEYS = [C.STORAGE_KEYS.progress, C.STORAGE_KEYS.attribution];
const SEVEN = ["zip", "dogCount", "frequency", "areas", "yardSize", "lastCleaned", "customerStatus"];
const NINE = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "wbraid", "gbraid", "fbclid"];

// Every write is audited at the moment it happens (a bad value that is later
// overwritten would still be caught). Violations are collected, not thrown,
// because the engine swallows storage exceptions.
function auditValue(key, value, violations, where) {
  const say = (problem) => violations.push(where + ": " + problem + " [" + key + " = " + value + "]");
  if (!ALLOWED_STORAGE_KEYS.includes(key)) { say("storage key not permitted"); return; }
  const found = findNeedles(key + " " + value);
  if (found.length) say("personal text in storage: " + found.join(", "));
  if (/\d{4}-\d\d-\d\dT\d\d:\d\d/.test(value)) say("a timestamp in storage (consent or terms evidence?)");
  if (/req-\d{4}|[0-9a-f]{8}-[0-9a-f]{4}-/.test(value)) say("a request id in storage");
  for (const option of C.START_TIMING_OPTIONS) if (value.includes(option)) say("start timing in storage");
  let parsed = null;
  try { parsed = JSON.parse(value); } catch (_) { say("not JSON"); return; }
  if (key === C.STORAGE_KEYS.progress) {
    if (!same(Object.keys(parsed), SEVEN)) say("progress keys are not exactly the seven permitted, in the live order: " + Object.keys(parsed).join(","));
    if (!(parsed.zip === "" || C.SERVICE_ZIPS.includes(parsed.zip))) say("stored ZIP is not an accepted ZIP");
    if (!(parsed.dogCount === "" || /^([1-9]|10)$/.test(parsed.dogCount))) say("stored dogCount out of range");
    if (!["", "twice", "weekly", "biweekly", "onetime", "custom"].includes(parsed.frequency)) say("stored frequency unknown");
    if (!Array.isArray(parsed.areas) || parsed.areas.some((id) => !["back", "front", "side"].includes(id))) say("stored areas unknown");
    if (!["", "s", "m", "l", "xl", "over"].includes(parsed.yardSize)) say("stored yardSize unknown");
    if (!(parsed.lastCleaned === "" || C.LAST_CLEANED_OPTIONS.includes(parsed.lastCleaned))) say("stored lastCleaned unknown");
    if (!["", "new", "returning", "not_sure"].includes(parsed.customerStatus)) say("stored customerStatus unknown");
  } else {
    for (const name of Object.keys(parsed)) {
      if (!NINE.includes(name)) say("attribution key not one of the nine: " + name);
      else if (typeof parsed[name] !== "string" || parsed[name].length > 250) say("attribution value not a string of at most 250 characters: " + name);
    }
  }
}

function fakeStorage(initial) {
  const items = Object.assign({}, initial || {});
  const storage = {
    items, writes: [], removals: [], violations: [],
    getItem(key) { return Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null; },
    setItem(key, value) { items[key] = String(value); storage.writes.push({ key, value: String(value) }); auditValue(key, String(value), storage.violations, "write #" + storage.writes.length); },
    removeItem(key) { delete items[key]; storage.removals.push(key); },
    audit(where) { for (const key of Object.keys(items)) auditValue(key, items[key], storage.violations, where); }
  };
  return storage;
}

function fakeLocation(href) {
  const url = new URL(href);
  return { href: url.href, search: url.search, hash: url.hash, pathname: url.pathname, protocol: url.protocol, origin: url.origin, hostname: url.hostname };
}

function fakeSinks(options) {
  const config = options || {};
  const calls = []; // { sink: "gtag" | "fbq" | "dataLayer", args, at: sequence number }
  let sequence = 0;
  const sinks = { calls };
  if (config.gtag !== false) sinks.gtag = function () { calls.push({ sink: "gtag", args: Array.from(arguments), n: (sequence += 1) }); };
  if (config.dataLayer) {
    sinks.dataLayer = [];
    sinks.dataLayer.push = function (entry) { calls.push({ sink: "dataLayer", args: [entry], n: (sequence += 1) }); return Array.prototype.push.call(this, entry); };
  }
  if (config.fbq !== false) sinks.fbq = function () { calls.push({ sink: "fbq", args: Array.from(arguments), n: (sequence += 1) }); };
  return sinks;
}

// A stand-in for the Worker. `script` is a list of behaviours for /submit, used in order.
function fakeWorker(script) {
  const queue = (script || []).slice();
  const calls = [];
  const fetch = (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    const reply = (status, payload) => Promise.resolve({ status, ok: status >= 200 && status < 300, text: () => Promise.resolve(JSON.stringify(payload)) });
    if (url.endsWith("/quote-resume")) return reply(201, { ok: true, url: "https://quote.itspurgepros.com/#resume=" + "A".repeat(43), expiresAt: 1 });
    if (url.endsWith("/quote-resume/open")) {
      const plan = { zip: "46032", dogs: 2, frequencyId: "weekly", yardSizeId: "m", areaIds: ["back", "front"], customerStatus: "not_sure" };
      return reply(200, { ok: true, plan, quote: { custom: false, priceCents: 2899, pricingVersion: C.VERSIONS.pricingVersion }, pricingChanged: false, expiresAt: 1 });
    }
    const step = queue.length ? queue.shift() : { status: 202 };
    if (step.hang) return new Promise(() => {});
    if (step.fail) return Promise.reject(new TypeError("Failed to fetch"));
    if (step.status === 202) return reply(202, { accepted: true, requestId: body.requestId });
    return reply(step.status, Object.assign({ accepted: false, requestId: body.requestId }, step.body || {}));
  };
  return { fetch, calls };
}

const LIVE_PAGE = "https://pages.offline.invalid/carmel";
const LIVE_ENDPOINT = "https://relay.offline.invalid/submit";

// Builds a store the way a page would, with every outside thing replaced.
function makePage(setup) {
  const config = setup || {};
  const storage = config.storage || fakeStorage();
  const sinks = config.sinks || fakeSinks();
  const worker = config.worker || fakeWorker();
  const consoleLines = [];
  const capture = (level) => function () { consoleLines.push({ level, text: Array.from(arguments).map((part) => (typeof part === "string" ? part : JSON.stringify(part))).join(" ") }); };
  const timers = [];
  let clock = Date.parse("2026-10-07T15:00:00.000Z");
  let idCount = 0;
  const live = config.live === true;
  const url = config.url || (live ? LIVE_PAGE + ATTRIBUTION_QUERY : "file:///G:/review/home.html" + ATTRIBUTION_QUERY);
  const options = Object.assign({
    storage,
    location: fakeLocation(url),
    history: { state: null, replaceState() {} },
    now: () => (clock += 1000),
    uuid: () => "req-" + String((idCount += 1)).padStart(4, "0"),
    random: () => 0.5,
    readCookie: (name) => (name === "_fbp" ? "fb.1.1700000000000.1234567890" : ""),
    console: { info: capture("info"), warn: capture("warn"), log: capture("log"), error: capture("error") },
    wait: () => Promise.resolve(),
    sinks,
    setTimeout: (callback, milliseconds) => { const handle = { callback, milliseconds, cleared: false }; timers.push(handle); return handle; },
    clearTimeout: (handle) => { if (handle) handle.cleared = true; }
  }, live ? { mode: "live", endpoint: LIVE_ENDPOINT, allowedOrigins: [new URL(LIVE_PAGE).origin], fetch: worker.fetch } : {}, config.options || {});
  const store = C.create(options);
  return { store, storage, sinks, worker, consoleLines, timers, fireTimeouts: () => timers.filter((t) => !t.cleared).forEach((t) => { t.cleared = true; t.callback(); }) };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

/* --------------------------------------------------------- the "interface" */
// Everything below uses only documented store methods, as page code would.
// `after(label)` runs after EVERY action so storage and logs are audited at every step.
function makeVisitor(page, after) {
  const { store } = page;
  const trackCalls = []; // what this interface passed to store.track()
  const act = (label, action) => { const result = action(); after(label); return result; };
  const typeInto = (field, text) => { for (let length = 1; length <= text.length; length += 1) act("type " + field + " (" + length + ")", () => store.set({ [field]: text.slice(0, length) })); };
  const next = (label) => act("next: " + label, () => { const result = store.next(); assert(result.ok, "next() refused at " + label + ": " + result.reason); return result; });
  const track = (name, params) => { trackCalls.push({ name, params: params || null }); return act("track " + name, () => store.track(name, params)); };
  return {
    trackCalls, act, typeInto, next, track,
    // dogs -> ZIP (a wrong one first) -> yard -> areas -> frequency -> price
    buildPlan(plan) {
      const p = Object.assign({ dogs: "2", zip: "46032", wrongZipFirst: true, yard: "m", areas: ["back", "front"], frequency: "weekly" }, plan || {});
      act("choose dogs", () => store.set({ dogCount: p.dogs }));
      if (!store.flow().zipSkipped) {
        next("dogs");
        if (p.wrongZipFirst) { typeInto("zip", "46201"); assert(store.checkZip().status === "out_of_area", "46201 should be out of area"); assert(!store.next().ok, "an out-of-area ZIP must not continue"); }
        typeInto("zip", p.zip);
      }
      next("to yard");
      track("yard_size_help_opened");
      act("choose yard", () => store.set({ yardSize: p.yard }));
      next("yard");
      p.areas.forEach((id) => act("toggle area " + id, () => store.toggleArea(id)));
      act("toggle side on", () => store.toggleArea("side"));
      act("toggle side off", () => store.toggleArea("side"));
      if (store.getState().step === "areas") next("areas");
      if (store.getState().step === "frequency") {
        if (store.getState().frequency !== p.frequency) act("choose frequency", () => store.set({ frequency: p.frequency }));
        next("frequency");
      }
      assert(store.getState().step === "price", "expected the price step, on " + store.getState().step);
      track("promotion_details_viewed", { promotion: "No start-up fee" });
    },
    fillRequest(intent, contact) {
      act("choose intent " + intent, () => store.set({ intent }));
      next("price");
      assert(store.getState().step === "request", "expected the request step");
      const shown = store.fieldRules().filter((rule) => rule.shown).map((rule) => rule.key);
      if (shown.includes("customerStatus")) act("status", () => store.set({ customerStatus: "new" }));
      typeInto("firstName", PII.firstName);
      if (shown.includes("lastName")) typeInto("lastName", PII.lastName);
      act("reply method", () => store.set({ preferredContact: contact }));
      typeInto("phone", PII.phone);
      typeInto("email", PII.email);
      if (contact === "text") act("tick consent", () => store.set({ smsConsent: true }));
      if (shown.includes("address")) typeInto("address", PII.street);
      if (shown.includes("city")) typeInto("city", PII.city);
      if (shown.includes("startTiming")) act("start timing", () => store.set({ startTiming: C.START_TIMING_OPTIONS[0] }));
      act("last cleaned", () => store.set({ lastCleaned: C.LAST_CLEANED_OPTIONS[2] }));
      // The question is typed whatever the intent, to prove it never leaks.
      typeInto("question", PII.question);
      next("request");
      assert(store.getState().step === "confirm", "expected the confirm step, on " + store.getState().step);
    },
    wander() {
      // Back and forth, an edit, and a second look at every late step: the kind
      // of movement that would double-fire a once-only pixel milestone.
      act("back to request", () => store.back());
      act("back to price", () => store.back());
      next("price again");
      next("request again");
      act("edit yard", () => store.edit("yard"));
      act("change yard", () => store.set({ yardSize: "l" }));
      act("change yard back", () => store.set({ yardSize: "m" }));
      act("return from edit", () => store.next());
      if (store.getState().step !== "confirm") act("go to confirm", () => store.goTo("confirm"));
      assert(store.getState().step === "confirm", "expected to be back on confirm, on " + store.getState().step);
    }
  };
}

/* ---------------------------------------------------- scanning what was sent */
function metaCalls(sinks) { return sinks.calls.filter((call) => call.sink === "fbq"); }
function googleCalls(sinks) { return sinks.calls.filter((call) => call.sink === "gtag" || call.sink === "dataLayer"); }
function googleEventName(call) { return call.sink === "gtag" ? call.args[1] : call.args[0].event; }
function googleParams(call) { return call.sink === "gtag" ? call.args[2] : call.args[0]; }
function countGoogle(sinks, name) { return googleCalls(sinks).filter((call) => googleEventName(call) === name).length; }
function countMeta(sinks, name) { return metaCalls(sinks).filter((call) => call.args[1] === name).length; }

// The rules of spec 10.2 and 17.2 item 12, applied to everything a tag received.
function auditSinks(sinks, where) {
  const problems = [];
  for (const call of sinks.calls) {
    const text = JSON.stringify(call.args);
    const found = findNeedles(text);
    if (found.length) problems.push(where + ": personal text sent to " + call.sink + ": " + found.join(", ") + " in " + text);
    for (const zip of ZIPS_USED) if (text.includes(zip)) problems.push(where + ": full ZIP " + zip + " sent to " + call.sink + ": " + text);
    if (call.sink === "fbq") {
      const params = call.args[2] || {};
      for (const key of Object.keys(params)) if (/zip/i.test(key)) problems.push(where + ": a ZIP parameter in a pixel event: " + text);
      if (/"46\d"/.test(text)) problems.push(where + ": a ZIP prefix in a pixel event: " + text);
    } else {
      const params = googleParams(call) || {};
      for (const key of Object.keys(params)) {
        if (/zip/i.test(key) && key !== "zip_prefix") problems.push(where + ": unexpected ZIP parameter to Google: " + key);
        if (key === "zip_prefix" && !/^\d{3}$/.test(String(params[key]))) problems.push(where + ": zip_prefix is not three digits: " + params[key]);
      }
    }
  }
  for (const milestone of C.PIXEL_MILESTONES) {
    const count = countMeta(sinks, milestone);
    if (count > 1) problems.push(where + ": pixel milestone " + milestone + " fired " + count + " times in one page load");
  }
  return problems;
}

// The same rules applied to the engine's own log (demo mode writes only there).
function auditTrackLog(store, where) {
  const problems = [];
  for (const entry of store.trackLog) {
    const text = JSON.stringify(entry.params || {}) + JSON.stringify(entry.options || {});
    const found = findNeedles(text);
    if (found.length) problems.push(where + ": personal text in event " + entry.event + ": " + found.join(", "));
    for (const zip of ZIPS_USED) if (text.includes(zip)) problems.push(where + ": full ZIP in event " + entry.event + ": " + text);
    if (entry.channel === "meta" && /zip/i.test(text)) problems.push(where + ": ZIP detail in pixel event " + entry.event + ": " + text);
  }
  for (const milestone of C.PIXEL_MILESTONES) {
    const count = store.trackLog.filter((entry) => entry.channel === "meta" && entry.event === milestone).length;
    if (count > 1) problems.push(where + ": pixel milestone " + milestone + " logged " + count + " times in one page load");
  }
  return problems;
}

function conversionCounts(sinks) {
  return { generate_lead: countGoogle(sinks, "generate_lead"), conversion: countGoogle(sinks, "conversion"), Lead: countMeta(sinks, "Lead") };
}
function logCounts(store) {
  const count = (channel, name) => store.trackLog.filter((entry) => entry.channel === channel && entry.event === name).length;
  return { generate_lead: count("google", "generate_lead"), conversion: count("google", "conversion"), Lead: count("meta", "Lead") };
}

// One auditor per page: called after every action.
function makeAuditor(page, name) {
  const problems = [];
  let actions = 0;
  let conversionsSeenBeforeSuccess = false;
  const after = (label) => {
    actions += 1;
    page.storage.audit(name + " after '" + label + "'");
    auditSinks(page.sinks, name + " after '" + label + "'").forEach((problem) => { if (!problems.includes(problem)) problems.push(problem); });
    auditTrackLog(page.store, name + " after '" + label + "'").forEach((problem) => { if (!problems.includes(problem)) problems.push(problem); });
    const state = page.store.getState();
    if (!state.receipt) {
      const sent = conversionCounts(page.sinks), logged = logCounts(page.store);
      if (sent.generate_lead + sent.conversion + sent.Lead + logged.generate_lead + logged.conversion + logged.Lead > 0) conversionsSeenBeforeSuccess = true;
    }
    // A bar that follows the visitor may never carry anything personal (spec 17.2 item 11).
    const barText = JSON.stringify(page.store.priceBar());
    if (findNeedles(barText).length) problems.push(name + " after '" + label + "': personal text in priceBar(): " + barText);
  };
  return { after, problems, actions: () => actions, conversionsBeforeSuccess: () => conversionsSeenBeforeSuccess };
}

/* ======================================================================== */
/* 1. PARITY WITH THE LIVE WIDGET'S STORAGE (spec section 9)                */
/* ======================================================================== */

// Cuts one top-level function out of widget.js by matching braces.
function cutFunction(source, name) {
  const start = source.indexOf("function " + name + "(");
  assert(start >= 0, "live widget has no function " + name);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") { depth -= 1; if (depth === 0) return source.slice(start, index + 1); }
  }
  throw new Error("could not cut " + name);
}

await required("S1", "the session storage keys are the live widget's two keys; the engine adds ONE localStorage key (the 30-day attribution copy, T23) and neither file writes anything else", () => {
  const liveProgress = /LOW_RISK_STORAGE_KEY = "([^"]+)"/.exec(WIDGET_SOURCE)[1];
  const liveAttribution = /ATTRIBUTION_STORAGE_KEY = "([^"]+)"/.exec(WIDGET_SOURCE)[1];
  assert(C.STORAGE_KEYS.progress === liveProgress, "progress key differs: " + C.STORAGE_KEYS.progress + " vs " + liveProgress);
  assert(C.STORAGE_KEYS.attribution === liveAttribution, "attribution key differs");
  assert(!/localStorage/.test(WIDGET_SOURCE), "the live widget uses localStorage");
  // Since engine 1.4.0 the engine keeps one more thing, in localStorage: the last non-empty set of the nine
  // attribution parameters and its capture moment, for 30 days. One guarded lookup, one write, one key.
  const engineCode = ENGINE_SOURCE.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert((engineCode.match(/localStorage/g) || []).length === 2 && engineCode.includes("keptStorage = win && win.localStorage ? win.localStorage : null"), "localStorage is named outside the one guarded lookup");
  assert(same(Object.keys(C.STORAGE_KEYS), ["progress", "attribution", "attributionKept"]) && C.STORAGE_KEYS.attributionKept === "pp_quote_attribution_kept_v1", "storage keys: " + JSON.stringify(C.STORAGE_KEYS));
  assert(C.ATTRIBUTION_KEEP_DAYS === 30, "the kept copy's lifetime is " + C.ATTRIBUTION_KEEP_DAYS + " days");
  const keptSetItems = ENGINE_SOURCE.match(/persistentStorage\.setItem\(([^,]+),/g) || [];
  assert(keptSetItems.length === 1 && /STORAGE_KEYS\.attributionKept/.test(keptSetItems[0]), "the engine writes localStorage somewhere unexpected: " + keptSetItems.join(" | "));
  assert(!/\.cookie\s*=[^=]/.test(ENGINE_SOURCE), "the engine assigns document.cookie");
  const engineSetItems = ENGINE_SOURCE.match(/env\.storage\.setItem\(([^,]+),/g) || [];
  assert(engineSetItems.length === 2 && engineSetItems.every((line) => /STORAGE_KEYS\.(progress|attribution)/.test(line)), "the engine writes storage somewhere unexpected: " + engineSetItems.join(" | "));
});

await required("S2", "stored progress JSON is byte-identical to what the live widget's own saveLowRiskProgress writes", () => {
  const liveStore = {};
  const context = { state: { zip: "46032", dogCount: "2", frequency: "weekly", areas: ["back", "front"], yardSize: "m", lastCleaned: "About 1 month", customerStatus: "new", firstName: "Test", phone: "(317) 555-0100" },
    sessionStorage: { setItem: (key, value) => { liveStore[key] = value; } }, LOW_RISK_STORAGE_KEY: "pp_quote_progress_v3" };
  vm.runInNewContext(cutFunction(WIDGET_SOURCE, "saveLowRiskProgress") + "\nsaveLowRiskProgress();", context);
  const page = makePage({ url: "file:///G:/review/home.html" });
  page.store.set({ dogCount: "2" }); page.store.set({ zip: "46032" }); page.store.set({ yardSize: "m" });
  page.store.toggleArea("back"); page.store.toggleArea("front"); page.store.set({ frequency: "weekly" });
  page.store.set({ lastCleaned: "About 1 month", customerStatus: "new", firstName: "Test", phone: "3175550100" });
  assert(page.storage.items.pp_quote_progress_v3 === liveStore.pp_quote_progress_v3, "engine wrote " + page.storage.items.pp_quote_progress_v3 + " but the live widget writes " + liveStore.pp_quote_progress_v3);
});

await required("S3", "attribution is captured and stored exactly as the live widget's captureAttribution does", () => {
  const long = "x".repeat(300);
  const search = "?utm_source=meta&utm_term=" + long + "&gclid=G-abc123&unknown=1&utm_medium=";
  const before = JSON.stringify({ utm_campaign: "kept_from_earlier_page", gclid: "old" });
  const liveStore = { pp_quote_attribution_v3: before };
  const context = { location: { search }, URLSearchParams, String, JSON,
    sessionStorage: { getItem: (key) => liveStore[key] || null, setItem: (key, value) => { liveStore[key] = value; } },
    ATTRIBUTION_STORAGE_KEY: "pp_quote_attribution_v3", ATTRIBUTION_KEYS: JSON.parse(/const ATTRIBUTION_KEYS = (\[[^\]]+\]);/.exec(WIDGET_SOURCE)[1]) };
  vm.runInNewContext(cutFunction(WIDGET_SOURCE, "captureAttribution") + "\ncaptureAttribution();", context);
  const page = makePage({ url: "file:///G:/review/home.html" + search, storage: fakeStorage({ pp_quote_attribution_v3: before }) });
  const live = JSON.parse(liveStore.pp_quote_attribution_v3), engine = JSON.parse(page.storage.items.pp_quote_attribution_v3);
  const sortKeys = (object) => Object.fromEntries(Object.keys(object).sort().map((key) => [key, object[key]]));
  assert(same(sortKeys(live), sortKeys(engine)), "live stored " + JSON.stringify(sortKeys(live)).slice(0, 200) + " but the engine stored " + JSON.stringify(sortKeys(engine)).slice(0, 200));
  assert(engine.utm_term.length === 250 && engine.utm_campaign === "kept_from_earlier_page" && engine.gclid === "G-abc123", "cut to 250, keep missing, overwrite present");
  assert(same(Object.keys(sortKeys(page.store.getState().attribution)).filter((key) => !NINE.includes(key)), []), "state.attribution has a key outside the nine");
});

await required("S4", "as a browser script the engine uses sessionStorage, and localStorage for the one attribution key only (the nine parameters and a date); no cookie write", async () => {
  const session = fakeStorage();
  const touched = [];
  // A recording stand-in for window.localStorage: every call, with what was written.
  const local = {
    items: {}, calls: [],
    getItem(key) { local.calls.push(["get", key]); return Object.prototype.hasOwnProperty.call(local.items, key) ? local.items[key] : null; },
    setItem(key, value) { local.calls.push(["set", key, String(value)]); local.items[key] = String(value); },
    removeItem(key) { local.calls.push(["remove", key]); delete local.items[key]; }
  };
  const windowObject = {
    sessionStorage: session,
    localStorage: local,
    location: fakeLocation("file:///G:/review/home.html" + ATTRIBUTION_QUERY),
    history: { state: null, replaceState() {} }
  };
  const documentObject = {};
  Object.defineProperty(documentObject, "cookie", { get() { return "_fbp=fb.1.1.1"; }, set(value) { touched.push("cookie write: " + value); } });
  const lines = [];
  const context = vm.createContext({ window: windowObject, document: documentObject, console: { info: (...a) => lines.push(a), warn: (...a) => lines.push(a), log: (...a) => lines.push(a) }, setTimeout, clearTimeout, URL, URLSearchParams, crypto: globalThis.crypto });
  vm.runInContext(ENGINE_SOURCE, context);
  const core = windowObject.PPQuoteCore;
  assert(core && typeof core.create === "function", "window.PPQuoteCore was not defined by the script tag");
  assert(Object.keys(windowObject).filter((key) => !["sessionStorage", "localStorage", "location", "history", "PPQuoteCore"].includes(key)).length === 0, "the script defined another global");
  const store = core.create({ demo: { delayMs: 0 } });
  store.set({ dogCount: "2" }); store.next(); store.set({ zip: "46032" }); store.next(); store.set({ yardSize: "m" }); store.next();
  store.toggleArea("back"); store.next(); store.set({ frequency: "weekly" }); store.next(); store.next();
  store.set({ customerStatus: "new", firstName: PII.firstName, lastName: PII.lastName, phone: PII.phone, email: PII.email, address: PII.street, city: PII.city, startTiming: core.START_TIMING_OPTIONS[0], lastCleaned: core.LAST_CLEANED_OPTIONS[0] });
  store.set({ smsConsent: true }); store.next(); store.set({ termsAccepted: true });
  session.audit("vm session before submit");
  assert(session.items.pp_quote_progress_v3, "progress was not written to window.sessionStorage");
  const sent = await store.submit();
  assert(sent.ok, "vm demo submit failed: " + sent.status + " " + sent.message);
  session.audit("vm session after submit");
  assert(touched.length === 0, "touched: " + touched.join("; "));
  assert(session.violations.length === 0, session.violations.join(" || "));
  assert(!("pp_quote_progress_v3" in session.items), "progress should be removed after success");
  // localStorage: one key, written once on arrival, holding the capture moment and the five parameters of the address. Nothing else, ever.
  assert(local.calls.length > 0 && local.calls.every((call) => call[1] === "pp_quote_attribution_kept_v1"), "localStorage was touched under another key: " + JSON.stringify(local.calls.map((call) => call.slice(0, 2))));
  assert(same(Object.keys(local.items), ["pp_quote_attribution_kept_v1"]), "localStorage holds: " + Object.keys(local.items));
  const keptWrites = local.calls.filter((call) => call[0] === "set");
  assert(keptWrites.length === 1, "the 30-day copy was written " + keptWrites.length + " times in one page load");
  const keptCopy = JSON.parse(keptWrites[0][2]);
  assert(same(Object.keys(keptCopy), ["capturedAt", "values"]) && typeof keptCopy.capturedAt === "number", "the kept copy is not { capturedAt, values }: " + keptWrites[0][2]);
  assert(same(keptCopy.values, { utm_source: "meta", utm_medium: "paid", utm_campaign: "fall_yard", gclid: "G-abc123", fbclid: "FB-xyz789" }), "kept values: " + JSON.stringify(keptCopy.values));
  assert(Object.keys(keptCopy.values).every((key) => NINE.includes(key)), "a key outside the nine was kept");
  assert(findNeedles(JSON.stringify(local.calls)).length === 0, "personal text reached localStorage: " + findNeedles(JSON.stringify(local.calls)).join(", "));
  for (const zip of ZIPS_USED) assert(!JSON.stringify(local.calls).includes(zip), "a ZIP reached localStorage");
  assert(!JSON.stringify(local.calls).includes(sent.requestId), "a request id reached localStorage");
  assert(!session.writes.some((write) => write.key === "pp_quote_attribution_kept_v1"), "the kept copy was written to sessionStorage");
});

await required("S5", "the 30-day attribution copy, through window.localStorage: a return visit with no parameters carries the source in the same payload keys; after 30 days it is removed", async () => {
  const local = {
    items: {},
    getItem(key) { return Object.prototype.hasOwnProperty.call(local.items, key) ? local.items[key] : null; },
    setItem(key, value) { local.items[key] = String(value); },
    removeItem(key) { delete local.items[key]; }
  };
  const DAY = 24 * 60 * 60 * 1000;
  let clock = Date.parse("2026-10-09T14:00:00.000Z");
  // One page load: the engine as a script tag in a fresh window that shares only the browser's localStorage.
  function pageLoad(search) {
    const session = fakeStorage();
    const windowObject = { sessionStorage: session, localStorage: local, location: fakeLocation("https://review.example/quote" + search), history: { state: null, replaceState() {} } };
    const context = vm.createContext({ window: windowObject, document: { cookie: "" }, console: { info() {}, warn() {}, log() {} }, setTimeout, clearTimeout, URL, URLSearchParams, crypto: globalThis.crypto });
    vm.runInContext(ENGINE_SOURCE, context);
    const core = windowObject.PPQuoteCore;
    const store = core.create({ demo: { delayMs: 0 }, now: () => clock });
    return { core, store, session };
  }
  async function request(page) {
    const { core, store } = page;
    store.set({ dogCount: "2" }); store.set({ zip: "46032" }); store.set({ yardSize: "m" }); store.toggleArea("back"); store.set({ frequency: "weekly" });
    store.goTo("request");
    store.set({ customerStatus: "new", firstName: PII.firstName, lastName: PII.lastName, phone: PII.phone, email: PII.email, address: PII.street, city: PII.city, startTiming: core.START_TIMING_OPTIONS[0], lastCleaned: core.LAST_CLEANED_OPTIONS[0] });
    store.set({ smsConsent: true }); store.next(); store.set({ termsAccepted: true });
    const sent = await store.submit();
    assert(sent.ok, "demo submit failed: " + sent.status + " " + sent.message);
    return sent.payload;
  }
  const expected = { utm_source: "meta", utm_medium: "paid", utm_campaign: "fall_yard", gclid: "G-abc123", fbclid: "FB-xyz789" };
  const landing = pageLoad(ATTRIBUTION_QUERY);
  const first = await request(landing);
  const keys = Object.keys(first);
  assert(same(first.attribution, expected), "the landing visit's own attribution: " + JSON.stringify(first.attribution));
  // Twelve days later, a new tab, a plain address.
  clock += 12 * DAY;
  const back = pageLoad("");
  assert(same(JSON.parse(JSON.stringify(back.store.attributionSource())), { source: "kept", capturedAt: clock - 12 * DAY, keepDays: 30 }), "source: " + JSON.stringify(back.store.attributionSource()));
  const second = await request(back);
  assert(same(Object.keys(second), keys), "the payload keys changed on a return visit");
  assert(same(second.attribution, expected) && second.gclid === "G-abc123" && second.fbclid === "FB-xyz789", "the return visit lost its source: " + JSON.stringify(second.attribution));
  assert(second.fbc === "fb.1." + (clock - 12 * DAY) + ".FB-xyz789", "the fallback fbc is not dated at the capture moment: " + second.fbc);
  assert(same(JSON.parse(back.session.items.pp_quote_attribution_v3), {}), "the kept set was copied into sessionStorage");
  assert(findNeedles(JSON.stringify(local.items)).length === 0, "personal text in localStorage after two requests");
  // On day 30 it is gone, from the request and from the browser.
  clock += 18 * DAY;
  const late = pageLoad("");
  const third = await request(late);
  assert(same(third.attribution, {}) && third.gclid === "" && third.fbclid === "", "attribution outlived 30 days: " + JSON.stringify(third.attribution));
  assert(same(Object.keys(local.items), []), "the expired copy was left in localStorage");
  assert(same(Object.keys(third), keys), "the payload keys changed");
});

/* ======================================================================== */
/* 2. WHOLE SESSIONS                                                        */
/* ======================================================================== */

// Session A: demo mode (what every review build runs). Service request by text.
let sessionA = null;
await required("A1", "demo session: service request end to end through the public API", async () => {
  const page = makePage({ options: { demo: { delayMs: 0 } } });
  const auditor = makeAuditor(page, "A");
  const visitor = makeVisitor(page, auditor.after);
  auditor.after("page load");
  assert(page.store.trackLog.length === 0, "an event fired on page load before any answer: " + JSON.stringify(page.store.trackLog.map((e) => e.event)));
  assert(page.store.priceBar().visible === false, "the bar must not show before the first answer");
  visitor.buildPlan();
  const link = await page.store.createSaveLink(); auditor.after("create save link");
  assert(link.ok && same(Object.keys(link.body), C.SAVE_LINK_KEYS), "save-link body keys: " + Object.keys(link.body));
  assert(findNeedles(JSON.stringify(link)).length === 0, "personal text in a save link");
  visitor.fillRequest("service_request", "text");
  visitor.wander();
  const early = await page.store.submit(); auditor.after("submit without terms");
  assert(!early.ok && early.status === "invalid" && early.fieldErrors[0].field === "termsAccepted", "submit without the terms box must be refused");
  visitor.act("tick terms", () => page.store.set({ termsAccepted: true }));
  const sent = await page.store.submit(); auditor.after("submit");
  assert(sent.ok && page.store.getState().step === "done", "submit failed: " + sent.status + " " + sent.message);
  sessionA = { page, auditor, visitor, sent };
});

await required("A2", "demo session: storage held only permitted keys and values after each of its actions and writes", () => {
  assert(sessionA, "session A did not run");
  const { page, auditor } = sessionA;
  assert(auditor.actions() > 120, "expected well over 120 audited actions, got " + auditor.actions());
  assert(page.storage.writes.length > 10, "expected many storage writes, got " + page.storage.writes.length);
  assert(page.storage.violations.length === 0, page.storage.violations.slice(0, 5).join(" || "));
});

await required("A3", "demo session: lifetimes match the live widget (progress removed on success, attribution kept, nothing rewritten on done)", async () => {
  const { page } = sessionA;
  assert(!(C.STORAGE_KEYS.progress in page.storage.items), "progress still stored after a successful submit: " + page.storage.items[C.STORAGE_KEYS.progress]);
  assert(C.STORAGE_KEYS.attribution in page.storage.items, "attribution should stay for the session");
  const writesBefore = page.storage.writes.length;
  page.store.set({ dogCount: "3" }); page.store.open({ zip: "46074" }); page.store.toggleArea("side");
  assert(page.storage.writes.length === writesBefore, "something was written to storage on the done step");
  assert(page.store.reset() === true, "reset() refused");
  assert(!(C.STORAGE_KEYS.progress in page.storage.items), "progress present right after reset()");
  const state = page.store.getState();
  assert(state.firstName === "" && state.phone === "" && state.email === "" && state.address === "" && state.question === "" && state.smsConsent === false && state.termsAccepted === false && state.receipt === null, "reset() left request details in memory");
  page.storage.audit("after reset");
  assert(page.storage.violations.length === 0, page.storage.violations.join(" || "));
});

await required("A4", "demo session: milestones at most once, no ZIP in pixel events, 3-digit prefix only, nothing personal in any event", () => {
  const { page, auditor } = sessionA;
  assert(auditor.problems.length === 0, auditor.problems.slice(0, 5).join(" || "));
  const log = page.store.trackLog;
  const prefixes = log.filter((entry) => entry.event.startsWith("service_area_")).map((entry) => entry.params.zip_prefix);
  assert(prefixes.length >= 2 && prefixes.every((prefix) => /^\d{3}$/.test(prefix)), "zip_prefix values: " + prefixes);
  for (const milestone of C.PIXEL_MILESTONES) assert(log.filter((e) => e.channel === "meta" && e.event === milestone).length === 1, milestone + " should have fired exactly once in this session");
  assert(log.every((entry) => entry.sent === false && entry.demo === true), "demo mode reported an event as sent");
  assert(page.sinks.calls.length === 0, "demo mode called a real tag: " + JSON.stringify(page.sinks.calls[0]));
  assert(page.worker.calls.length === 0 && page.store.networkLog.length === 0, "demo mode made a network request");
});

await required("A5", "demo session: Lead, generate_lead and conversion logged exactly once, only after success, sharing one event id", () => {
  const { page, auditor, sent } = sessionA;
  assert(!auditor.conversionsBeforeSuccess(), "a conversion event was logged before the request succeeded");
  assert(same(logCounts(page.store), { generate_lead: 1, conversion: 1, Lead: 1 }), "counts: " + JSON.stringify(logCounts(page.store)));
  const expectedId = sent.requestId + ":service_requested";
  const lead = page.store.trackLog.find((entry) => entry.event === "Lead");
  const generate = page.store.trackLog.find((entry) => entry.event === "generate_lead");
  const conversion = page.store.trackLog.find((entry) => entry.event === "conversion");
  assert(lead.options.eventID === expectedId && generate.params.event_id === expectedId && conversion.params.event_id === expectedId, "event ids differ");
  assert(sent.payload.eventId === expectedId, "payload eventId differs from the browser event id (server de-duplication would fail)");
  assert(lead.params.value === 28.99 && lead.params.currency === "USD", "Lead value: " + JSON.stringify(lead.params));
});

await required("A6", "nothing personal was passed to track(), and track() refuses every engine event name", () => {
  const { page, visitor } = sessionA;
  assert(same(visitor.trackCalls, [{ name: "yard_size_help_opened", params: null }, { name: "promotion_details_viewed", params: { promotion: "No start-up fee" } }]), "track calls: " + JSON.stringify(visitor.trackCalls));
  const fresh = makePage({ live: true });
  for (const name of C.EVENTS.engine.concat(["Lead", "QuotePriceViewed", "purchase"])) assert(fresh.store.track(name, { value: 1 }) === false, "track() accepted " + name);
  assert(fresh.sinks.calls.length === 0, "a refused track() call still reached a tag");
  assert(page.store.trackLog.filter((e) => e.event === "yard_size_help_opened").length === 1, "yard_size_help_opened not logged once");
});

// Session B: live mode with stand-in tags and a stand-in Worker. The first
// attempt times out, the retry is accepted.
let sessionB = null;
await required("B1", "live-mode session (stand-in Worker and tags): timeout, retry with the same request id, success", async () => {
  const page = makePage({ live: true, worker: fakeWorker([{ hang: true }, { status: 202 }]) });
  const auditor = makeAuditor(page, "B");
  const visitor = makeVisitor(page, auditor.after);
  auditor.after("page load");
  assert(page.sinks.calls.length === 0, "a tag was called on page load before any answer: " + JSON.stringify(page.sinks.calls[0]));
  assert(page.store.sendingBlockedReason() === "", "live guard: " + page.store.sendingBlockedReason());
  visitor.buildPlan();
  const link = await page.store.createSaveLink(); auditor.after("create save link");
  assert(link.ok, "save link: " + link.status);
  visitor.fillRequest("service_request", "text");
  visitor.wander();
  visitor.act("tick terms", () => page.store.set({ termsAccepted: true }));
  const firstTry = page.store.submit(); auditor.after("submit started");
  await tick();
  assert(page.store.getState().submitting === true, "not in the sending state");
  const second = await page.store.submit();
  assert(second.status === "busy", "a second submit while sending was not refused: " + second.status);
  assert(page.timers.some((timer) => timer.milliseconds === 15000), "no 15-second timeout was armed");
  page.fireTimeouts();
  const timedOut = await firstTry; auditor.after("timeout");
  assert(timedOut.status === "timeout" && timedOut.retryAllowed, "expected a timeout, got " + timedOut.status);
  const sent = await page.store.submit(); auditor.after("retry accepted");
  assert(sent.ok, "retry failed: " + sent.status + " " + sent.message);
  const submits = page.worker.calls.filter((call) => call.url.endsWith("/submit"));
  assert(submits.length === 2 && submits[0].body.requestId === submits[1].body.requestId, "the retry did not reuse the request id");
  assert(submits.every((call) => call.url === LIVE_ENDPOINT && call.init.credentials === "omit"), "submit request shape");
  sessionB = { page, auditor, visitor, sent, submits };
});

await required("B2", "live-mode session: storage clean at every step; tags never received anything personal or a full ZIP; milestones once", () => {
  assert(sessionB, "session B did not run");
  const { page, auditor } = sessionB;
  assert(page.storage.violations.length === 0, page.storage.violations.slice(0, 5).join(" || "));
  assert(auditor.problems.length === 0, auditor.problems.slice(0, 5).join(" || "));
  for (const milestone of C.PIXEL_MILESTONES) assert(countMeta(page.sinks, milestone) === 1, milestone + " reached fbq " + countMeta(page.sinks, milestone) + " times");
  const pixelZip = metaCalls(page.sinks).filter((call) => /QuoteZip/.test(call.args[1]));
  assert(pixelZip.every((call) => same(Object.keys(call.args[2]), ["ui_version"])), "ZIP milestones carry more than ui_version: " + JSON.stringify(pixelZip.map((c) => c.args[2])));
  const eligible = googleCalls(page.sinks).filter((call) => googleEventName(call) === "service_area_eligible");
  assert(eligible.length === 1 && eligible[0].args[2].zip_prefix === "460", "service_area_eligible to Google: " + JSON.stringify(eligible.map((c) => c.args[2])));
  assert(!(C.STORAGE_KEYS.progress in page.storage.items), "progress still stored after success");
});

await required("B3", "live-mode session: Lead, generate_lead and conversion reached the tags exactly once, only after the 202, with the shared event id", () => {
  const { page, auditor, sent } = sessionB;
  assert(!auditor.conversionsBeforeSuccess(), "a conversion event fired before the request succeeded (during the timeout?)");
  assert(same(conversionCounts(page.sinks), { generate_lead: 1, conversion: 1, Lead: 1 }), "counts: " + JSON.stringify(conversionCounts(page.sinks)));
  const eventId = sent.requestId + ":service_requested";
  const lead = metaCalls(page.sinks).find((call) => call.args[1] === "Lead");
  assert(lead.args[0] === "track" && same(lead.args[2], { currency: "USD", value: 28.99 }) && same(lead.args[3], { eventID: eventId }), "Lead call: " + JSON.stringify(lead.args));
  const conversion = googleCalls(page.sinks).find((call) => googleEventName(call) === "conversion");
  assert(conversion.args[2].send_to === "AW-17767139897/g9smCM7pkL4cELmUhJhC" && conversion.args[2].transport_type === "beacon" && conversion.args[2].event_id === eventId, "conversion: " + JSON.stringify(conversion.args[2]));
  assert(sessionB.submits[1].body.eventId === eventId, "payload eventId differs from the browser Lead eventID");
  assert(countGoogle(page.sinks, "service_requested") === 1, "stage event count");
});

await required("B4", "live-mode session: the console and the logs hold no contact details", () => {
  const { page } = sessionB;
  const consoleText = page.consoleLines.map((line) => line.text).join("\n");
  assert(findNeedles(consoleText).length === 0, "personal text written to the console in live mode: " + findNeedles(consoleText));
  assert(findNeedles(JSON.stringify(page.store.submissionLog)).length === 0, "submissionLog keeps contact details in live mode");
  assert(findNeedles(JSON.stringify(page.store.networkLog)).length === 0 && findNeedles(JSON.stringify(page.store.trackLog)).length === 0, "a log keeps contact details");
  const saveCall = page.worker.calls.find((call) => call.url.endsWith("/quote-resume"));
  assert(same(Object.keys(saveCall.body), C.SAVE_LINK_KEYS) && findNeedles(JSON.stringify(saveCall.body)).length === 0, "save-link body: " + JSON.stringify(saveCall.body));
});

// Other intents and outcomes: none of them may fire a conversion.
async function quickSession(setup) {
  const page = makePage(Object.assign({ live: true }, setup.page || {}));
  const auditor = makeAuditor(page, setup.name);
  const visitor = makeVisitor(page, auditor.after);
  visitor.buildPlan(Object.assign({ wrongZipFirst: false }, setup.plan || {}));
  visitor.fillRequest(setup.intent || "service_request", setup.contact || "text");
  if ((setup.intent || "service_request") === "service_request") visitor.act("tick terms", () => page.store.set({ termsAccepted: true }));
  const sent = await page.store.submit(); auditor.after("submit");
  return { page, auditor, visitor, sent };
}

await required("C1", "quote delivery and question: accepted, their stage event fires, and no Lead, generate_lead or conversion", async () => {
  for (const [intent, contact, stage] of [["quote_delivery", "text", "quote_requested"], ["quote_delivery", "email", "quote_requested"], ["question", "call", "question_submitted"]]) {
    const run = await quickSession({ name: intent + "/" + contact, intent, contact });
    assert(run.sent.ok, intent + " by " + contact + " failed: " + run.sent.status + " " + run.sent.message);
    assert(countGoogle(run.page.sinks, stage) === 1, stage + " did not fire once");
    assert(same(conversionCounts(run.page.sinks), { generate_lead: 0, conversion: 0, Lead: 0 }), intent + " fired a conversion: " + JSON.stringify(conversionCounts(run.page.sinks)));
    assert(run.page.storage.violations.length === 0 && run.auditor.problems.length === 0, (run.page.storage.violations.concat(run.auditor.problems)).slice(0, 3).join(" || "));
    const body = run.page.worker.calls.find((call) => call.url.endsWith("/submit")).body;
    assert(body.lastName === "" && body.street === "" && body.city === "" && body.termsAccepted === false, intent + " sent service-only fields");
    if (contact !== "text") assert(body.smsTransactionalConsent === false && body.consent === "no" && body.consentVersion === "" && body.smsConsentCapturedAt === "", "consent recorded without Text");
    if (intent === "quote_delivery") assert(!findNeedles(body.question).length, "the typed question travelled with a quote delivery");
    // A quote sent to the visitor is counted by the pixel under its own name, once, as a CUSTOM event that says how
    // it was sent (engine 1.4.0: QuoteSent, with method). A question is not. The old name is never sent.
    const quoteSent = metaCalls(run.page.sinks).filter((call) => call.args[1] === "QuoteSent");
    assert(quoteSent.length === (intent === "quote_delivery" ? 1 : 0), intent + ": QuoteSent fired " + quoteSent.length + " times");
    assert(run.page.sinks.calls.every((call) => call.args[1] !== "QuoteTexted"), "the old event name QuoteTexted was sent");
    assert(metaCalls(run.page.sinks).every((call) => call.args[0] === "trackCustom"), intent + ": a standard pixel event fired");
    if (intent === "quote_delivery") {
      assert(same(quoteSent[0].args, ["trackCustom", "QuoteSent", { ui_version: C.VERSIONS.uiVersion, frequency: "weekly", value: 28.99, currency: "USD", method: contact }]), "QuoteSent call: " + JSON.stringify(quoteSent[0].args));
      const stageCall = googleCalls(run.page.sinks).find((call) => googleEventName(call) === stage);
      assert(googleParams(stageCall).method === contact && body.preferredContact === contact, "quote_requested does not say how the quote was sent");
    } else {
      assert(googleCalls(run.page.sinks).every((call) => !("method" in googleParams(call))), "a method on a request that is not a sent quote");
    }
  }
});

await required("C2", "custom estimate: estimate_requested, one Lead with no value, and no price anywhere in the events", async () => {
  const run = await quickSession({ name: "custom", plan: { dogs: "10", frequency: "custom" } });
  assert(run.sent.ok, "custom estimate failed: " + run.sent.status + " " + run.sent.message);
  assert(countGoogle(run.page.sinks, "estimate_requested") === 1, "estimate_requested count");
  assert(same(conversionCounts(run.page.sinks), { generate_lead: 1, conversion: 1, Lead: 1 }), JSON.stringify(conversionCounts(run.page.sinks)));
  const lead = metaCalls(run.page.sinks).find((call) => call.args[1] === "Lead");
  assert(same(lead.args[2], { currency: "USD" }), "a custom-estimate Lead carried a value: " + JSON.stringify(lead.args[2]));
  assert(run.page.sinks.calls.every((call) => !/"value":/.test(JSON.stringify(call.args))), "an event for a custom estimate carried a value");
  assert(run.page.store.quote().priceCents === null && run.page.store.priceBar().priceCents === null, "a price for a custom estimate");
});

await required("C3", "failed outcomes never fire a conversion: 400, 503, network failure, 409 uncertain (which also locks)", async () => {
  for (const [label, step, status] of [["400", { status: 400, body: { message: "Please check the highlighted form details.", fields: ["phone"] } }, "server_invalid"], ["503", { status: 503, body: { code: "SUBMISSION_UNAVAILABLE" } }, "unavailable"], ["network", { fail: true }, "network"], ["409", { status: 409, body: { code: "SUBMISSION_UNCERTAIN", message: "call us" } }, "locked"]]) {
    const run = await quickSession({ name: "fail-" + label, page: { worker: fakeWorker([step]) } });
    assert(run.sent.status === status, label + ": expected " + status + ", got " + run.sent.status);
    assert(same(conversionCounts(run.page.sinks), { generate_lead: 0, conversion: 0, Lead: 0 }) && countGoogle(run.page.sinks, "service_requested") === 0, label + " fired a success event");
    assert(findNeedles(run.sent.message).length === 0 && !/Failed to fetch/.test(run.sent.message), label + ": raw text shown to the visitor: " + run.sent.message);
    if (status === "locked") {
      const again = await run.page.store.submit();
      assert(again.status === "locked" && run.page.worker.calls.filter((c) => c.url.endsWith("/submit")).length === 1, "a locked form sent again");
      assert(run.page.store.set({ firstName: "Other" }).ok === false && run.page.store.reset() === false && run.page.store.flow().back === "", "a locked form could still be edited");
    }
    assert(C.STORAGE_KEYS.progress in run.page.storage.items, label + ": progress should survive a failed submit");
    assert(run.page.storage.violations.length === 0, run.page.storage.violations.join(" || "));
  }
});

await required("C4", "a second request after reset() gets its own Lead (one per accepted request, never two for one)", async () => {
  const run = await quickSession({ name: "twice" });
  assert(run.sent.ok, "first request failed");
  const repeat = await run.page.store.submit();
  assert(repeat.status === "busy", "submitting again on the done step: " + repeat.status);
  assert(same(conversionCounts(run.page.sinks), { generate_lead: 1, conversion: 1, Lead: 1 }), "after a repeat press: " + JSON.stringify(conversionCounts(run.page.sinks)));
  run.page.store.reset();
  const visitor = makeVisitor(run.page, run.auditor.after);
  visitor.buildPlan({ wrongZipFirst: false }); visitor.fillRequest("service_request", "email");
  run.page.store.set({ termsAccepted: true });
  const second = await run.page.store.submit();
  assert(second.ok && second.requestId !== run.sent.requestId, "second request");
  const ids = metaCalls(run.page.sinks).filter((call) => call.args[1] === "Lead").map((call) => call.args[3].eventID);
  assert(ids.length === 2 && ids[0] !== ids[1], "Lead event ids: " + ids);
  for (const milestone of C.PIXEL_MILESTONES) assert(countMeta(run.page.sinks, milestone) <= 1, milestone + " fired twice in one page load across two requests");
  const body = run.page.worker.calls.filter((call) => call.url.endsWith("/submit"))[1].body;
  assert(body.preferredContact === "email" && body.smsTransactionalConsent === false && body.consentVersion === "", "the second request (by email) carried text consent");
});

await required("C5", "tags that load late, are missing, or are dataLayer-only", async () => {
  // dataLayer only: generate_lead is pushed, conversion needs gtag (as the live widget).
  const layered = await quickSession({ name: "dataLayer", page: { sinks: fakeSinks({ gtag: false, fbq: false, dataLayer: true }) } });
  assert(layered.sent.ok && countGoogle(layered.page.sinks, "generate_lead") === 1 && countGoogle(layered.page.sinks, "conversion") === 0 && countMeta(layered.page.sinks, "Lead") === 0, "dataLayer-only: " + JSON.stringify(conversionCounts(layered.page.sinks)));
  assert(layered.auditor.problems.length === 0, layered.auditor.problems.join(" || "));
  // The pixel arrives after the ZIP was accepted: the milestone must not be lost or doubled.
  const sinks = fakeSinks({ fbq: false });
  const page = makePage({ live: true, sinks });
  page.store.set({ dogCount: "2" }); page.store.next(); page.store.set({ zip: "46032" });
  assert(metaCalls(sinks).length === 0, "fbq called before it existed");
  sinks.fbq = function () { sinks.calls.push({ sink: "fbq", args: Array.from(arguments) }); };
  page.store.set({ zip: "46201" }); page.store.set({ zip: "46074" }); page.store.set({ zip: "46201" }); page.store.set({ zip: "46032" });
  assert(countMeta(sinks, "QuoteZipAccepted") === 1 && countMeta(sinks, "QuoteZipOutOfArea") === 1, "late pixel: accepted " + countMeta(sinks, "QuoteZipAccepted") + ", out of area " + countMeta(sinks, "QuoteZipOutOfArea"));
  assert(auditSinks(sinks, "late pixel").length === 0, auditSinks(sinks, "late pixel").join(" || "));
});

await required("C6", "the moments a page reports through trackUi(), in a live session against stand-in tags: only fixed words reach Google, the pixel hears Contact once with nothing attached, nothing typed travels, and Lead, generate_lead and conversion are untouched", async () => {
  const UI = C.VERSIONS.uiVersion;
  const sinks = fakeSinks();
  const page = makePage({ live: true, sinks });
  const { store } = page;
  const auditor = makeAuditor(page, "trackUi");
  // A careless page hands over the number and what was typed with every report. None of it may arrive.
  const extra = { href: "tel:+13179615865", phone: PII.phone, email: PII.email, name: PII.firstName + " " + PII.lastName, zip: "46032", value: 28.99 };
  assert(store.trackUi("contact_click", Object.assign({ method: "call", placement: "header" }, extra)) === true, "contact_click was refused");
  assert(store.trackUi("contact_click", { method: "text", placement: "footer" }) === true, "the second contact press was refused");
  assert(same(sinks.calls.map((call) => [call.sink].concat(call.args)), [
    ["gtag", "event", "contact_click", { ui_version: UI, method: "call", placement: "header" }],
    ["fbq", "track", "Contact", {}],
    ["gtag", "event", "contact_click", { ui_version: UI, method: "text", placement: "footer" }]
  ]), "contact presses sent: " + JSON.stringify(sinks.calls.map((call) => call.args)));
  assert(store.trackUi("builder_opened", Object.assign({ entry: "plan_button", plan: "weekly" }, extra)) === true, "builder_opened was refused");
  assert(countGoogle(sinks, "funnel_viewed") === 0 && countGoogle(sinks, "service_area_eligible") === 0, "a page-level event counted as an answer");
  for (const [name, params] of [["Lead", {}], ["generate_lead", {}], ["conversion", {}], ["QuoteSent", { method: "text" }], ["contact_click", { method: "fax", placement: "header" }], ["contact_click", { method: "call", placement: PII.street }], ["builder_opened", { entry: PII.firstName }], ["request_step_viewed", { request_step: "who" }], ["form_validation_failed", { fields: ["phone"] }]]) {
    const before = sinks.calls.length;
    assert(store.trackUi(name, params) === false && sinks.calls.length === before, "trackUi accepted " + name + " " + JSON.stringify(params));
  }
  const visitor = makeVisitor(page, auditor.after);
  visitor.buildPlan({ wrongZipFirst: false });
  visitor.act("choose intent", () => store.set({ intent: "service_request" }));
  visitor.next("price");
  // Three request screens, each reported; a refused press on the second, reported with what was typed mixed in.
  assert(store.trackUi("request_step_viewed", Object.assign({ request_step: "who" }, extra)) === true, "request_step_viewed was refused");
  visitor.act("status", () => store.set({ customerStatus: "new" }));
  visitor.typeInto("firstName", PII.firstName); visitor.typeInto("lastName", PII.lastName);
  assert(store.trackUi("request_step_completed", { request_step: "who" }) === true && store.trackUi("request_step_viewed", { request_step: "reach" }) === true, "screen two");
  visitor.typeInto("phone", "317555");
  assert(store.trackUi("form_validation_failed", { request_step: "reach", fields: ["phone", "smsConsent", "317555", PII.email, PII.firstName] }) === true, "the interface's refused press was not accepted");
  const refused = googleCalls(sinks).filter((call) => googleEventName(call) === "form_validation_failed").pop();
  assert(same(googleParams(refused), { ui_version: UI, form_step: "request", request_step: "reach", fields: "phone,smsConsent", error_count: 2, checked_by: "form" }), "form_validation_failed: " + JSON.stringify(googleParams(refused)));
  visitor.typeInto("phone", PII.phone); visitor.act("tick consent", () => store.set({ smsConsent: true }));
  assert(store.trackUi("request_step_completed", { request_step: "reach" }) === true && store.trackUi("request_step_viewed", { request_step: "where" }) === true, "screen three");
  // The engine's own refusal: Next with the address still missing.
  const refusedNext = store.next();
  assert(!refusedNext.ok, "next() should refuse with the address missing");
  const byEngine = googleCalls(sinks).filter((call) => googleEventName(call) === "form_validation_failed").pop();
  assert(googleParams(byEngine).checked_by === "form" && googleParams(byEngine).request_step === "where" && googleParams(byEngine).fields.split(",").every((key) => C.EVENTS.trackUiValues.fields.includes(key)) && googleParams(byEngine).fields.split(",").includes("address"), "the engine's refusal: " + JSON.stringify(googleParams(byEngine)));
  visitor.typeInto("address", PII.street); visitor.typeInto("city", PII.city);
  visitor.act("timing", () => store.set({ startTiming: C.START_TIMING_OPTIONS[0], lastCleaned: C.LAST_CLEANED_OPTIONS[2] }));
  visitor.next("request");
  assert(store.trackUi("request_step_completed", { request_step: "where" }) === true, "the last screen was not accepted as completed on the confirm step");
  visitor.act("tick terms", () => store.set({ termsAccepted: true }));
  const sent = await store.submit(); auditor.after("submit");
  assert(sent.ok, "the request failed: " + sent.status + " " + sent.message);
  assert(store.close().startedOver === true, "closing from the done step");
  // Every added event: its listed parameters only, each value from a fixed list.
  const funnel = ["areas_selected", "frequency_selected", "request_step_viewed", "request_step_completed", "form_validation_failed", "builder_opened", "builder_closed", "contact_click"];
  for (const name of funnel) assert(countGoogle(sinks, name) >= 1, name + " never reached Google");
  assert(same([countGoogle(sinks, "request_step_viewed"), countGoogle(sinks, "request_step_completed"), countGoogle(sinks, "builder_opened"), countGoogle(sinks, "builder_closed"), countGoogle(sinks, "areas_selected"), countGoogle(sinks, "frequency_selected")], [3, 3, 1, 1, 1, 1]), "once-only counts: " + JSON.stringify(funnel.map((name) => [name, countGoogle(sinks, name)])));
  for (const call of googleCalls(sinks).filter((item) => funnel.includes(googleEventName(item)))) {
    const name = googleEventName(call), params = googleParams(call);
    for (const key of Object.keys(params)) assert(key === "ui_version" || key === "event" || C.EVENTS.measurementParams[name].includes(key), name + " carries " + key);
    assert(!("event_id" in params) && !("transaction_id" in params) && !JSON.stringify(params).includes(sent.requestId), name + " carries a request id");
  }
  const closed = googleCalls(sinks).filter((call) => googleEventName(call) === "builder_closed").pop();
  assert(same(googleParams(closed), { ui_version: UI, step: "done" }), "builder_closed: " + JSON.stringify(googleParams(closed)));
  assert(metaCalls(sinks).every((call) => !funnel.includes(call.args[1])), "a funnel event reached the pixel");
  assert(same(metaCalls(sinks).filter((call) => call.args[0] === "track").map((call) => call.args[1]), ["Contact", "Lead"]), "standard pixel events: " + JSON.stringify(metaCalls(sinks).filter((call) => call.args[0] === "track").map((call) => call.args[1])));
  // The conversion is what it always was.
  assert(same(conversionCounts(sinks), { generate_lead: 1, conversion: 1, Lead: 1 }), JSON.stringify(conversionCounts(sinks)));
  const lead = metaCalls(sinks).find((call) => call.args[1] === "Lead");
  assert(same(lead.args, ["track", "Lead", { currency: "USD", value: 28.99 }, { eventID: sent.requestId + ":service_requested" }]), "Lead call: " + JSON.stringify(lead.args));
  // Nothing typed, no full ZIP and no link reached a tag, the log or storage.
  assert(auditSinks(sinks, "trackUi").length === 0, auditSinks(sinks, "trackUi").join(" || "));
  assert(auditTrackLog(store, "trackUi").length === 0, auditTrackLog(store, "trackUi").join(" || "));
  assert(page.storage.violations.length === 0 && auditor.problems.length === 0, page.storage.violations.concat(auditor.problems).slice(0, 3).join(" || "));
  const everything = JSON.stringify(sinks.calls.map((call) => call.args)) + JSON.stringify(store.trackLog);
  for (const banned of ["3179615865", "tel:", "317555", "fax"]) assert(!everything.includes(banned), "a tag or the log holds " + banned);
  // The Worker received the same keys as a session that reported nothing.
  const quiet = await quickSession({ name: "quiet" });
  const body = page.worker.calls.find((call) => call.url.endsWith("/submit")).body;
  const quietBody = quiet.page.worker.calls.find((call) => call.url.endsWith("/submit")).body;
  assert(same(Object.keys(body), Object.keys(quietBody)), "reporting moments changed the payload keys");
});

await required("D1", "out-of-area ZIP: nothing stored of it, nothing can be sent or saved, no contact rule satisfied", async () => {
  const page = makePage({ live: true });
  page.store.set({ dogCount: "2" }); page.store.next(); page.store.set({ zip: "46201" });
  page.storage.audit("out of area");
  assert(JSON.parse(page.storage.items[C.STORAGE_KEYS.progress]).zip === "", "an out-of-area ZIP was stored");
  page.store.set({ firstName: PII.firstName, phone: PII.phone, email: PII.email, lastCleaned: C.LAST_CLEANED_OPTIONS[0], smsConsent: true });
  for (const intent of ["service_request", "quote_delivery", "question"]) { const sent = await page.store.submit(intent); assert(sent.status === "invalid", intent + " for an out-of-area ZIP: " + sent.status); }
  const link = await page.store.createSaveLink();
  assert(link.status === "not_ready" && page.worker.calls.length === 0 && page.store.networkLog.length === 0, "an out-of-area ZIP reached the network");
  assert(page.store.checkZip().contactAllowed === false && page.store.goTo("request").ok === false && page.store.priceBar().kind === "out_of_area", "out-of-area flow");
  assert(page.storage.violations.length === 0, page.storage.violations.join(" || "));
  assert(countMeta(page.sinks, "QuoteZipOutOfArea") === 1 && same(Object.keys(metaCalls(page.sinks).find((c) => c.args[1] === "QuoteZipOutOfArea").args[2]), ["ui_version"]), "out-of-area pixel payload");
});

await required("D2", "moving between pages: plan answers follow, contact details and consent never do; a city page's own ZIP is not stored", () => {
  const storage = fakeStorage();
  const first = makePage({ storage });
  const visitor = makeVisitor(first, () => storage.audit("page one"));
  visitor.buildPlan({ wrongZipFirst: false }); visitor.fillRequest("service_request", "text");
  first.store.set({ termsAccepted: true });
  const second = makePage({ storage, url: "file:///G:/review/dog-waste-removal.html" });
  const state = second.store.getState();
  assert(state.dogCount === "2" && state.zip === "46032" && state.yardSize === "m" && same(state.areas, ["back", "front"]) && state.frequency === "weekly", "the plan did not follow: " + JSON.stringify(state));
  assert(state.step === "dogs" && state.firstName === "" && state.lastName === "" && state.phone === "" && state.email === "" && state.address === "" && state.question === "" && state.startTiming === "", "contact details followed the visitor");
  assert(state.smsConsent === false && state.smsConsentCapturedAt === "" && state.termsAccepted === false && state.termsAcceptedAt === "", "consent or terms followed the visitor");
  assert(same(Object.keys(state.attribution).sort(), ["fbclid", "gclid", "utm_campaign", "utm_medium", "utm_source"]), "attribution did not follow: " + JSON.stringify(state.attribution));
  assert(second.store.trackLog.length === 0, "events fired on the second page load with no action: " + JSON.stringify(second.store.trackLog.map((e) => e.event)));
  assert(storage.violations.length === 0, storage.violations.join(" || "));
  const cityStorage = fakeStorage();
  const city = makePage({ storage: cityStorage, options: { pageZip: "46074", pageCity: "Westfield" } });
  assert(city.store.trackLog.length === 0 && city.store.priceBar().visible === false, "a city page's own ZIP counted as an answer on load");
  city.store.set({ dogCount: "1" });
  assert(JSON.parse(cityStorage.items[C.STORAGE_KEYS.progress]).zip === "", "a page-supplied ZIP was stored");
  const eligible = city.store.trackLog.filter((entry) => entry.event === "service_area_eligible");
  assert(eligible.length === 1 && eligible[0].params.entry === "city_page" && eligible[0].params.zip_prefix === "460", "city page ZIP event: " + JSON.stringify(eligible));
});

await required("D3", "saved link: storage cleared the moment it starts opening; nothing personal restored; no price_viewed or conversion", async () => {
  const run = await quickSession({ name: "resume-setup", page: { worker: fakeWorker([{ status: 503, body: {} }]) } });
  assert(run.sent.status === "unavailable", "setup");
  const { page } = run;
  assert(C.STORAGE_KEYS.progress in page.storage.items, "setup: progress should be stored");
  const before = { price: countGoogle(page.sinks, "price_viewed"), pixel: countMeta(page.sinks, "QuotePriceViewed") };
  const opening = page.store.resume("B".repeat(43));
  assert(!(C.STORAGE_KEYS.progress in page.storage.items), "progress not cleared when the saved link started opening");
  assert(page.store.getState().resumeLoading === true && page.store.getState().firstName === "" && page.store.getState().phone === "", "contact details kept while a saved plan loads");
  const opened = await opening;
  assert(opened.ok, "resume failed: " + opened.status + " " + opened.notice);
  const state = page.store.getState();
  assert(state.step === "price" && state.customerStatus === "" && state.smsConsent === false && state.termsAccepted === false && state.firstName === "" && state.email === "" && state.address === "", "something personal was restored: " + JSON.stringify(state));
  assert(state.resumeNotice === C.RESUME_MESSAGES.ready, "resume notice: " + state.resumeNotice);
  assert(countGoogle(page.sinks, "price_viewed") === before.price && countMeta(page.sinks, "QuotePriceViewed") === before.pixel, "price_viewed fired on resume");
  assert(same(conversionCounts(page.sinks), { generate_lead: 0, conversion: 0, Lead: 0 }), "a conversion fired on resume");
  const openCall = page.worker.calls.find((call) => call.url.endsWith("/quote-resume/open"));
  assert(same(Object.keys(openCall.body), ["token"]) && openCall.init.referrerPolicy === "no-referrer" && openCall.init.credentials === "omit", "resume request: " + JSON.stringify(openCall.body));
  page.storage.audit("after resume");
  assert(page.storage.violations.length === 0, page.storage.violations.join(" || "));
  assert(JSON.parse(page.storage.items[C.STORAGE_KEYS.progress]).customerStatus === "", "customer status was stored from a saved plan");
});

await required("D4", "takeResumeToken removes the token from the address before returning it", () => {
  const replaced = [];
  const win = { location: { hash: "#resume=" + "C".repeat(43), pathname: "/quote", search: "?utm_source=meta" }, history: { state: null, replaceState: (state, title, url) => replaced.push(url) } };
  assert(C.takeResumeToken({ window: win }) === "C".repeat(43) && same(replaced, ["/quote?utm_source=meta"]), "token handling: " + JSON.stringify(replaced));
  const bad = { location: { hash: "#resume=short", pathname: "/", search: "" }, history: { state: null, replaceState: (s, t, url) => replaced.push(url) } };
  assert(C.takeResumeToken({ window: bad }) === "invalid", "a malformed token should be 'invalid'");
});

await required("E1", "consent and terms rules a UI relies on (spec 17.2 items 2, 4 and 6)", () => {
  const page = makePage();
  const { store } = page;
  assert(store.getState().smsConsent === false && store.getState().termsAccepted === false, "pre-ticked");
  assert(store.fieldRules().find((rule) => rule.key === "smsConsent").shown === true, "consent box should show for Text");
  assert(store.set({ preferredContact: "email" }).ok && store.fieldRules().find((rule) => rule.key === "smsConsent").shown === false, "consent box should hide for Email");
  assert(store.set({ smsConsent: true }).ok === false && store.getState().smsConsent === false, "consent accepted without Text");
  store.set({ preferredContact: "text" }); store.set({ smsConsent: true });
  const captured = store.getState().smsConsentCapturedAt;
  assert(/^\d{4}-\d\d-\d\dT/.test(captured), "no consent timestamp");
  const left = store.set({ preferredContact: "call" });
  assert(store.getState().smsConsent === false && store.getState().smsConsentCapturedAt === "" && left.notices.some((notice) => notice.code === "CONSENT_CLEARED"), "leaving Text did not clear consent with a notice");
  store.set({ preferredContact: "text" });
  assert(store.getState().smsConsent === false, "consent came back without a fresh tick");
  assert(C.CONSENT.lead + " " + C.CONSENT.body === "Text me about my quote and service. I consent to receive non-marketing text messages from Purge Pros about my quote, availability, scheduling, service and account at the number provided. Message frequency varies. Message and data rates may apply. Text HELP for assistance; reply STOP to opt out.", "consent wording");
  const widgetHasConsent = WIDGET_SOURCE.includes(C.CONSENT.body) && WIDGET_SOURCE.includes(C.CONSENT.lead);
  assert(widgetHasConsent, "the consent wording is not found verbatim in the live widget source");
  const terms = C.wording.termsParts(false).map((part) => part.text).join("");
  assert(terms === "I agree to the Terms of Service and acknowledge the Privacy Policy. I understand this is a request for service-day review, not a confirmed appointment.", "terms wording: " + terms);
  assert(C.wording.termsParts(true).map((part) => part.text).join("").includes("request for cleanup availability, not a confirmed appointment"), "one-time terms wording");
  assert(C.wording.consentAlternativeParts(true).filter((part) => part.href).map((part) => part.href).join() === "https://itspurgepros.com/privacy-policy,https://itspurgepros.com/terms-conditions", "consent links");
  assert(C.wording.consentAlternativeParts(false).map((part) => part.text).join("") === "You may choose Email instead of consenting to SMS. Review our Privacy Policy and Terms & Conditions.", "alternative without call");
  assert(C.CONSENT.phoneHintService.includes("Providing a number does not opt you into texts."), "phone hint");
  assert(store.fieldRules("service_request").find((rule) => rule.key === "phone").hint === C.CONSENT.phoneHintService, "phone hint on the service form");
});

/* ======================================================================== */
/* 3. PROBES: suspected defects, reproduced through the public API          */
/* ======================================================================== */

await probe("P1", "?zip= in the address must not override the visitor's own later ZIP, or re-fire events, on reload", () => {
  const storage = fakeStorage();
  const url = "https://pages.offline.invalid/quote?zip=46032";       // what is left after ?open_quote=1&zip=46032 is consumed
  const first = makePage({ live: true, storage, url });
  first.store.set({ dogCount: "2" });
  first.store.edit("zip"); first.store.set({ zip: "46074" });          // the visitor corrects the ZIP to Westfield
  const storedZip = JSON.parse(storage.items[C.STORAGE_KEYS.progress]).zip;
  const reloaded = makePage({ live: true, storage, url });             // same tab, same address: a refresh
  const state = reloaded.store.getState();
  const fired = reloaded.sinks.calls.map((call) => (call.sink === "fbq" ? "fbq:" + call.args[1] : "gtag:" + call.args[1]));
  const defects = [];
  if (state.zip !== "46074") defects.push("after a refresh the ZIP is " + state.zip + " (city " + state.city + "), not the visitor's own 46074 that storage holds (" + storedZip + ")");
  if (fired.length) defects.push("the refresh fired, with no visitor action: " + fired.join(", "));
  return defects.join("; ");
});

await probe("P2", "edit() and open() must tell the interface that the terms box was unticked (info.changed / a TERMS_CLEARED notice)", () => {
  const defects = [];
  for (const how of ["edit", "open"]) {
    const page = makePage({ options: { demo: { delayMs: 0 } } });
    const visitor = makeVisitor(page, () => {});
    visitor.buildPlan({ wrongZipFirst: false }); visitor.fillRequest("service_request", "text");
    page.store.set({ termsAccepted: true });
    const seen = [];
    page.store.subscribe((state, info) => seen.push({ changed: info.changed, notices: (info.notices || []).map((notice) => notice.code), terms: state.termsAccepted, city: state.city }));
    const cityBefore = page.store.getState().city;
    if (how === "edit") page.store.edit("dogs"); else page.store.open({ zip: "46074" });
    const last = seen[seen.length - 1];
    if (last.terms !== false) defects.push(how + "() left the terms box ticked");
    else if (!last.changed.includes("termsAccepted") && !last.notices.includes("TERMS_CLEARED")) defects.push(how + "() unticked the terms box but reported info.changed=" + JSON.stringify(last.changed) + " and notices=" + JSON.stringify(last.notices));
    if (how === "open" && last.city === cityBefore && page.store.getState().cityAutoFilled) defects.push("open() did not update an auto-filled city");
  }
  return defects.join("; ");
});

await probe("P3", "track() must not carry a visitor's details to Google under some other parameter name", () => {
  const page = makePage({ live: true });
  page.store.track("promotion_details_viewed", { promotion: "No start-up fee", customer: PII.firstName + " " + PII.lastName, phone_number: PII.phone, email_address: PII.email, zip_code: "46032" });
  page.store.track("yard_size_help_opened", { note: PII.street });
  const leaked = page.sinks.calls.filter((call) => findNeedles(JSON.stringify(call.args)).length || JSON.stringify(call.args).includes("46032"));
  return leaked.length ? "gtag received: " + leaked.map((call) => JSON.stringify(call.args.slice(1))).join(" and ") : "";
});

await probe("P4", "the global the engine installs must be compatible with the live widget script being on the same page", () => {
  const listeners = {};
  const win = { location: fakeLocation("https://pages.offline.invalid/"), history: { state: null, replaceState() {} } };
  const doc = { addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener() {} };
  const page = makePage();
  C.installPageHooks(page.store, {}, { window: win, document: doc });
  const defects = [];
  if (!win.PurgeProsQuote || typeof win.PurgeProsQuote.open !== "function" || typeof win.PurgeProsQuote.close !== "function") defects.push("open/close missing");
  if (!win.PurgeProsQuote.config) defects.push("window.PurgeProsQuote.config is " + typeof win.PurgeProsQuote.config + " (the live global has .config)");
  // What the Worker serves at /purge-quote.js: the widget, then one appended line (worker.template.mjs line 212).
  const served = WIDGET_SOURCE + "\nObject.assign(window.PurgeProsQuote.config.promotion," + JSON.stringify({}) + ");";
  try { vm.runInNewContext(served, { window: win, document: doc, location: win.location }); } catch (error) { defects.push("loading the live widget script after the engine's hooks throws " + error.name + ": " + error.message); }
  return defects.join("; ");
});

await probe("P5", "installPageHooks: open is 'ignored' while a request is being sent (guide section 11)", async () => {
  const win = { location: fakeLocation("https://pages.offline.invalid/"), history: { state: null, replaceState() {} } };
  const doc = { addEventListener() {}, removeEventListener() {} };
  let hang = null;
  const page = makePage({ options: { demo: { delayMs: 0 }, wait: () => new Promise((resolve) => { hang = resolve; }) } });
  const visitor = makeVisitor(page, () => {});
  visitor.buildPlan({ wrongZipFirst: false }); visitor.fillRequest("service_request", "text"); page.store.set({ termsAccepted: true });
  const opened = [];
  C.installPageHooks(page.store, { open: (result) => opened.push(result) }, { window: win, document: doc });
  const sending = page.store.submit();
  await tick();
  win.PurgeProsQuote.open({ zip: "46074" });
  const duringSend = opened.length;
  hang(); await sending;
  win.PurgeProsQuote.open({ zip: "46074" });
  const defects = [];
  if (duringSend) defects.push("the open handler ran while sending (result.ok=" + opened[0].ok + ")");
  if (opened.length > duringSend && page.store.getState().step === "done") defects.push("on the done step a launcher or hero ZIP form calls the open handler with ok=" + opened[opened.length - 1].ok + " and the typed ZIP is dropped (the live tool starts a fresh quote)");
  return defects.join("; ");
});

await probe("P6", "terms evidence: the recorded time must not be earlier than the last change it covers", () => {
  const page = makePage();
  const visitor = makeVisitor(page, () => {});
  visitor.buildPlan({ wrongZipFirst: false }); visitor.fillRequest("service_request", "text");
  page.store.set({ termsAccepted: true });
  const first = page.store.getState().termsAcceptedAt;
  page.store.set({ address: "456 Example Ave", termsAccepted: true }); // one patch: a new address and the box
  const state = page.store.getState();
  return state.termsAccepted && state.termsAcceptedAt === first ? "the address changed after " + first + " but termsAccepted is still true with termsAcceptedAt " + state.termsAcceptedAt : "";
});

await probe("P7", "an incomplete ZIP typed in the request form is reported as a request-form error", () => {
  const page = makePage();
  const visitor = makeVisitor(page, () => {});
  visitor.buildPlan({ wrongZipFirst: false }); visitor.fillRequest("service_request", "text");
  page.store.back();
  page.store.set({ zip: "4603" });
  const pressed = page.store.next();
  const error = (pressed.errors || []).find((item) => item.field === "zip");
  const inDetails = "zip" in page.store.validateDetails().byField;
  const defects = [];
  if (page.store.getState().step !== "request") defects.push("the visitor was moved to " + page.store.getState().step);
  if (error && error.step !== "request") defects.push("the ZIP field is on the request form (fieldRules lists it there) but its error says step '" + error.step + "'");
  if (!inDetails) defects.push("validateDetails().byField has no zip entry, so the inline message must come from somewhere else");
  return defects.join("; ");
});

await probe("P8", "flow(): a designer can bind the Next button's disabled state to one field", () => {
  const page = makePage();
  page.store.set({ dogCount: "2" });
  const flow = page.store.flow();
  return flow.disablePrimary === true && flow.canContinue === true ? "after answering, flow() returns canContinue:true AND disablePrimary:true; button.disabled = flow.disablePrimary leaves Next dead on all five plan questions" : "";
});

await probe("P9", "a page that only continues carried-over progress still reports funnel_viewed before its conversion", async () => {
  const storage = fakeStorage();
  const first = makePage({ live: true, storage });
  makeVisitor(first, () => {}).buildPlan({ wrongZipFirst: false });
  const second = makePage({ live: true, storage, url: LIVE_PAGE.replace("carmel", "dog-waste-removal") });
  const visitor = makeVisitor(second, () => {});
  second.store.goTo(second.store.priceBar().continueStep);       // the pinned bar's Continue
  visitor.fillRequest("service_request", "text"); second.store.set({ termsAccepted: true });
  const sent = await second.store.submit();
  if (!sent.ok) return "setup failed: " + sent.status;
  const names = second.sinks.calls.map((call) => (call.sink === "fbq" ? call.args[1] : call.args[1]));
  return names.includes("funnel_viewed") ? "" : "second page load fired " + names.filter((name, index) => names.indexOf(name) === index).join(", ") + " and never funnel_viewed / QuoteFunnelViewed";
});

/* ------------------------------------------------------------------ report */
let failedRequired = 0;
for (const result of results) {
  const verdict = result.kind === "REQUIRED" ? (result.ok ? "PASS" : "FAIL") : (result.ok ? "ok (no defect)" : "DEFECT REPRODUCED");
  if (result.kind === "REQUIRED" && !result.ok) failedRequired += 1;
  console.log("[" + result.kind + " " + result.id + "] " + verdict + " - " + result.title + (result.detail ? "\n      " + result.detail : ""));
}
const requiredResults = results.filter((result) => result.kind === "REQUIRED");
const probes = results.filter((result) => result.kind === "PROBE");
console.log("\nREQUIRED: " + (requiredResults.length - failedRequired) + " of " + requiredResults.length + " passed.  PROBES: " + probes.filter((p) => !p.ok).length + " of " + probes.length + " reproduced a defect.");
process.exitCode = failedRequired ? 1 : 0;
