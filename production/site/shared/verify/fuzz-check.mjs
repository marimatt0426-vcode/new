// VERIFIER FILE. Random visitor sessions in live mode against stand-in tags and a stand-in Worker,
// with the privacy and tracking rules re-checked after every action.
//   node "production/site/shared/verify/fuzz-check.mjs" [walks] [seed]
// Offline: global fetch throws; the injected fetch never leaves this process; the endpoint is a .invalid name.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

globalThis.fetch = () => { throw new Error("NETWORK ATTEMPT (the verifier forbids it)"); };
const here = path.dirname(fileURLToPath(import.meta.url));
const C = createRequire(import.meta.url)(path.join(here, "..", "pp-quote-core.js"));

const WALKS = Number(process.argv[2] || 400), SEED = Number(process.argv[3] || 20261007), STEPS_PER_WALK = 140;
let seed = SEED;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = (list) => list[Math.floor(rand() * list.length)];

const PII = { firstName: "Test", lastName: "Verifier", phone: "3175550100", email: "test@example.com", address: "123 Example St", city: "Testville", question: "Do you also clean kennels on Sundays?" };
const NEEDLES = ["test", "verifier", "3175550100", "555-0100", "example.com", "123 example", "testville", "kennels"];
const ZIPS = ["46032", "46074", "46236", "46201", "90210", "4603", ""];
const SEVEN = ["zip", "dogCount", "frequency", "areas", "yardSize", "lastCleaned", "customerStatus"];
const hasNeedle = (text) => NEEDLES.some((needle) => String(text).toLowerCase().includes(needle));
const fakeLocation = (href) => { const u = new URL(href); return { href: u.href, search: u.search, hash: u.hash, pathname: u.pathname, protocol: u.protocol, origin: u.origin, hostname: u.hostname }; };

// The fixed lists the funnel and contact events are held to (engine 1.4.0, T16 to T22), read from the engine once
// and re-checked against every tag call below.
const LISTS = C.EVENTS.trackUiValues;
const FUNNEL = ["areas_selected", "frequency_selected", "request_step_viewed", "request_step_completed", "form_validation_failed", "builder_opened", "builder_closed", "contact_click"];
const VALUE_OK = {
  ui_version: (v) => v === C.VERSIONS.uiVersion,
  areas_count: (v) => [1, 2, 3].includes(v),
  frequency: (v) => LISTS.plan.includes(v), plan: (v) => LISTS.plan.includes(v),
  request_step: (v) => LISTS.request_step.includes(v),
  choice: (v) => ["service_request", "quote_delivery", "question"].includes(v),
  form_step: (v) => v === "request" || v === "confirm",
  fields: (v) => typeof v === "string" && v.length > 0 && v.length <= 100 && v.split(",").every((key) => LISTS.fields.includes(key)),
  error_count: (v) => Number.isInteger(v) && v >= 1 && v <= LISTS.fields.length,
  checked_by: (v) => v === "form" || v === "server",
  entry: (v) => LISTS.entry.includes(v),
  step: (v) => C.STEPS.includes(v),
  method: (v) => LISTS.method.includes(v),
  placement: (v) => LISTS.placement.includes(v)
};
// Anything a careless page might hand to trackUi(): right values, wrong values, and what a visitor typed.
const JUNK = [PII.firstName, PII.phone, PII.email, PII.address, "46032", "tel:+13179615865", "", "who ", "TEXT", 7, null, true, { a: 1 }];

const problems = new Map();
const flag = (what, detail) => { if (!problems.has(what)) problems.set(what, { count: 0, first: detail }); problems.get(what).count += 1; };
let accepted = 0, sentBodies = 0, actions = 0;

for (let walk = 0; walk < WALKS; walk += 1) {
  const items = {};
  const storage = {
    getItem: (k) => (k in items ? items[k] : null), removeItem: (k) => { delete items[k]; },
    setItem: (k, v) => {
      items[k] = String(v);
      if (k !== C.STORAGE_KEYS.progress && k !== C.STORAGE_KEYS.attribution) flag("storage key not permitted", k);
      if (hasNeedle(v)) flag("personal text written to storage", v);
      if (k === C.STORAGE_KEYS.progress) {
        const p = JSON.parse(v);
        if (Object.keys(p).join() !== SEVEN.join()) flag("progress keys differ", v);
        if (p.zip !== "" && !C.SERVICE_ZIPS.includes(p.zip)) flag("a ZIP outside the list was stored", v);
      }
    }
  };
  // The browser's longer-lived storage (T23): ONE key may be written, holding the capture moment and the nine parameters.
  const keptItems = {};
  const persistentStorage = {
    getItem: (k) => (k in keptItems ? keptItems[k] : null), removeItem: (k) => { delete keptItems[k]; },
    setItem: (k, v) => {
      keptItems[k] = String(v);
      if (k !== C.STORAGE_KEYS.attributionKept) flag("localStorage key not permitted", k);
      if (hasNeedle(v)) flag("personal text written to localStorage", v);
      const kept = JSON.parse(v);
      if (Object.keys(kept).join() !== "capturedAt,values" || typeof kept.capturedAt !== "number") flag("the kept attribution is not { capturedAt, values }", v);
      if (!Object.keys(kept.values || {}).every((key) => C.ATTRIBUTION_KEYS.includes(key) && typeof kept.values[key] === "string" && kept.values[key].length <= 250)) flag("the kept attribution holds something that is not one of the nine parameters", v);
    }
  };
  const calls = [];
  const sinks = { gtag: (...args) => calls.push({ sink: "gtag", args }), fbq: (...args) => calls.push({ sink: "fbq", args }) };
  const bodies = [];
  const acceptedIds = new Set();
  const worker = (url, init) => {
    const body = JSON.parse(init.body);
    const reply = (status, payload) => Promise.resolve({ status, ok: status >= 200 && status < 300, text: () => Promise.resolve(JSON.stringify(payload)) });
    if (url.endsWith("/quote-resume")) { if (Object.keys(body).join() !== C.SAVE_LINK_KEYS.join() || hasNeedle(init.body)) flag("save-link body wrong", init.body); if (!C.SERVICE_ZIPS.includes(body.zip)) flag("save link for a ZIP outside the list", init.body); return reply(201, { ok: true, url: "https://quote.itspurgepros.com/#resume=" + "A".repeat(43), expiresAt: 1 }); }
    if (url.endsWith("/quote-resume/open")) return reply(200, { ok: true, plan: { zip: "46032", dogs: 2, frequencyId: "weekly", yardSizeId: "m", areaIds: ["back", "front"], customerStatus: "not_sure" }, quote: { custom: false, priceCents: 2899, pricingVersion: C.VERSIONS.pricingVersion }, pricingChanged: false, expiresAt: 1 });
    bodies.push(body); sentBodies += 1;
    const roll = rand();
    if (roll < 0.15) return Promise.reject(new TypeError("Failed to fetch"));
    if (roll < 0.3) return reply(503, { accepted: false, code: "SUBMISSION_UNAVAILABLE" });
    if (roll < 0.4) return reply(400, { accepted: false, message: "Please check the highlighted form details.", fields: ["phone"] });
    if (roll < 0.45) return reply(409, { accepted: false, code: "SUBMISSION_UNCERTAIN", message: "call" });
    acceptedIds.add(body.requestId + ":" + body.stage + ":" + body.intent);
    return reply(202, { accepted: true, requestId: body.requestId });
  };
  let clock = 1791212400000, ids = 0;
  const pageZip = rand() < 0.25 ? "46074" : undefined;
  const query = rand() < 0.2 ? "?zip=" + pick(["46032", "46201"]) + "&utm_source=meta" : "?utm_source=meta&gclid=G-1";
  const store = C.create({ mode: "live", endpoint: "https://relay.offline.invalid/submit", allowedOrigins: ["https://pages.offline.invalid"], fetch: worker,
    storage, persistentStorage, sinks, location: fakeLocation("https://pages.offline.invalid/p" + query), history: { state: null, replaceState() {} }, console: null,
    now: () => (clock += 1000), uuid: () => "req-" + walk + "-" + (ids += 1), random: rand, readCookie: () => "", wait: () => Promise.resolve(), pageZip });

  const moves = [
    () => store.set({ dogCount: pick(["1", "2", "4", "5", "6", "9", "10", ""]) }),
    () => store.set({ zip: pick(ZIPS) }),
    () => store.set({ yardSize: pick(["s", "m", "l", "xl", "over"]) }),
    () => store.toggleArea(pick(["back", "front", "side"])),
    () => store.set({ frequency: pick(["twice", "weekly", "biweekly", "onetime", "custom"]) }),
    () => store.set({ intent: pick(["service_request", "quote_delivery", "question"]) }),
    () => store.set({ customerStatus: pick(["new", "returning", "not_sure"]) }),
    () => store.set({ firstName: PII.firstName, lastName: PII.lastName }),
    () => store.set({ phone: pick([PII.phone, "317555", ""]) }),
    () => store.set({ email: pick([PII.email, "test@", ""]) }),
    () => store.set({ preferredContact: pick(["text", "email", "call"]) }),
    () => store.set({ smsConsent: rand() < 0.8 }),
    () => store.set({ address: PII.address, city: pick([PII.city, ""]) }),
    () => store.set({ startTiming: pick(C.START_TIMING_OPTIONS), lastCleaned: pick(C.LAST_CLEANED_OPTIONS) }),
    () => store.set({ question: PII.question }),
    () => store.set({ termsAccepted: rand() < 0.85 }),
    () => store.next(), () => store.next(), () => store.next(), () => store.back(),
    () => store.goTo(pick(C.STEPS)), () => store.edit(pick(C.STEPS)),
    () => store.open({ zip: pick(ZIPS) }),
    () => store.track(pick(["yard_size_help_opened", "promotion_details_viewed", "generate_lead", "Lead"]), { promotion: "No start-up fee" }),
    () => store.reportStepShown(pick(["price", "request", "confirm"])),
    // The six moments an interface reports (T19 to T22): mostly right, sometimes with a wrong name, a value that is
    // not on its list, or something the visitor typed.
    () => store.trackUi(rand() < 0.9 ? pick(C.EVENTS.trackUi) : pick(["Lead", "generate_lead", "conversion", "QuoteSent", "QuoteTexted", "areas_selected", "made_up"]), {
      entry: rand() < 0.8 ? pick(LISTS.entry) : pick(JUNK), plan: rand() < 0.5 ? pick(LISTS.plan) : pick(JUNK),
      request_step: rand() < 0.8 ? pick(LISTS.request_step) : pick(JUNK),
      fields: rand() < 0.8 ? [pick(LISTS.fields), pick(LISTS.fields), pick(JUNK)] : pick(JUNK),
      method: rand() < 0.8 ? pick(LISTS.method) : pick(JUNK), placement: rand() < 0.8 ? pick(LISTS.placement) : pick(JUNK),
      phone: PII.phone, email: PII.email, href: "tel:+13179615865", value: 28.99
    }),
    () => store.trackUi("contact_click", { method: pick(LISTS.method), placement: pick(LISTS.placement) }),
    () => store.trackUi("builder_opened", { entry: pick(LISTS.entry), plan: pick(LISTS.plan) }),
    () => store.trackUi("request_step_viewed", { request_step: pick(LISTS.request_step) }),
    () => store.trackUi("request_step_completed", { request_step: pick(LISTS.request_step) }),
    () => store.close(),
    () => store.submit(rand() < 0.7 ? undefined : pick(["service_request", "quote_delivery", "question"])),
    () => store.submit(),
    () => store.createSaveLink(),
    () => (rand() < 0.15 ? store.resume("A".repeat(43)) : null),
    () => (rand() < 0.3 ? store.reset() : null)
  ];

  const VALID = { dogCount: () => pick(["1", "2", "3", "5", "9", "10"]), zip: () => pick(["46032", "46074", "46236"]), yardSize: () => pick(["s", "m", "xl", "over"]),
    customerStatus: () => pick(["new", "returning", "not_sure"]), firstName: () => PII.firstName, lastName: () => PII.lastName, phone: () => PII.phone, email: () => PII.email,
    address: () => PII.address, city: () => PII.city, startTiming: () => pick(C.START_TIMING_OPTIONS), lastCleaned: () => pick(C.LAST_CLEANED_OPTIONS), question: () => PII.question,
    smsConsent: () => true, termsAccepted: () => true, preferredContact: () => pick(["text", "email"]), intent: () => "service_request" };
  // What a visitor does when the form says something is missing: fix that field and press again.
  const repairAndSubmit = async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const state = store.getState();
      if (state.step === "done" || state.locked) return;
      const sent = await store.submit();
      if (sent.status !== "invalid") { if (sent.ok || sent.locked) return; continue; }
      for (const error of sent.fieldErrors) {
        if (error.field === "areas") store.toggleArea(pick(["back", "front", "side"]));
        else if (error.field === "frequency") { const open = store.frequencyOptions().filter((o) => o.available); store.set({ frequency: pick(open).id }); }
        else if (VALID[error.field]) store.set({ [error.field]: VALID[error.field]() });
      }
    }
  };
  for (let step = 0; step < STEPS_PER_WALK; step += 1) {
    if (step % 35 === 34) await repairAndSubmit(); else await pick(moves)();
    actions += 1;
    const state = store.getState();
    // storage, at every step
    for (const key of Object.keys(items)) if (hasNeedle(items[key])) flag("personal text in storage", items[key]);
    // consent and terms invariants
    if (state.smsConsent && state.preferredContact !== "text") flag("consent ticked while the reply method is not Text", state.preferredContact);
    if (state.smsConsent !== (state.smsConsentCapturedAt !== "")) flag("consent flag and its timestamp disagree", JSON.stringify([state.smsConsent, state.smsConsentCapturedAt]));
    if (state.termsAccepted && state.intent !== "service_request") flag("terms ticked for a non-service intent", state.intent);
    if (state.intent === "quote_delivery" && state.preferredContact === "call") flag("Phone call with a quote delivery", "");
    // never a price for a custom estimate, anywhere a UI reads one
    const quote = store.quote(), bar = store.priceBar();
    if (quote.custom && (quote.priceCents !== null || /\$/.test(quote.priceText) || bar.priceCents !== null || /\$/.test(bar.headline) || store.fromLine())) flag("a price shown for a custom estimate", JSON.stringify([quote.priceText, bar.headline]));
    if (hasNeedle(JSON.stringify(bar))) flag("personal text in priceBar()", JSON.stringify(bar));
    if (!bar.visible && state.step !== "done" && (state.dogCount || state.yardSize || state.areas.length || state.frequency)) flag("the bar is hidden after an answer", JSON.stringify(state));
    // tags
    for (const call of calls) {
      const text = JSON.stringify(call.args);
      if (hasNeedle(text)) flag("personal text sent to a tag", text);
      if (/4603[2]|46074|46236|46201|90210/.test(text)) flag("a full ZIP sent to a tag", text);
      if (call.sink === "fbq" && Object.entries(call.args[2] || {}).some(([key, value]) => /zip/i.test(key) || /^d{3}$|^d{5}$/.test(String(value)))) flag("ZIP detail in a pixel event's parameters", text);
    }
    for (const milestone of C.PIXEL_MILESTONES) if (calls.filter((c) => c.sink === "fbq" && c.args[1] === milestone).length > 1) flag("pixel milestone fired twice in one page load: " + milestone, "");
    if (calls.filter((c) => c.args[1] === "funnel_viewed").length > 1) flag("funnel_viewed fired twice in one page load", "");
    // the funnel and contact events (T16 to T22): fixed names, allow-listed parameters, values from the fixed lists
    for (const key of Object.keys(keptItems)) if (hasNeedle(keptItems[key]) || key !== C.STORAGE_KEYS.attributionKept) flag("localStorage holds something it may not", key + " = " + keptItems[key]);
    let open = 0;
    for (const call of calls) {
      const name = call.args[1];
      if (name === "QuoteTexted") flag("the old event name was sent", JSON.stringify(call.args));
      if (call.sink === "fbq") {
        if (call.args[0] === "track" && name !== "Lead" && name !== "Contact") flag("a standard pixel event other than Lead and Contact", name);
        if (name === "Contact" && (call.args[0] !== "track" || JSON.stringify(call.args[2]) !== "{}" || call.args.length !== 3)) flag("Contact was sent with something attached", JSON.stringify(call.args));
        if (FUNNEL.includes(name)) flag("a funnel event was sent to the pixel", name);
        if (name === "QuoteSent" && (call.args[0] !== "trackCustom" || !["text", "email"].includes(call.args[2].method) || Object.keys(call.args[2]).some((key) => key !== "ui_version" && !C.EVENTS.measurementParams.QuoteSent.includes(key)))) flag("QuoteSent is not a custom event with its listed parameters and a method of text or email", JSON.stringify(call.args));
        continue;
      }
      if (name === "quote_requested" && !["text", "email"].includes(call.args[2].method)) flag("quote_requested has no method of text or email", JSON.stringify(call.args[2]));
      if (["service_requested", "estimate_requested", "question_submitted", "generate_lead", "conversion"].includes(name) && "method" in call.args[2]) flag("a method on a request that is not a sent quote", name);
      if (!FUNNEL.includes(name)) continue;
      if (name === "builder_opened") { open += 1; if (open !== 1) flag("builder_opened counted twice without a closing", ""); }
      if (name === "builder_closed") { open -= 1; if (open !== 0) flag("builder_closed without a counted opening", ""); }
      for (const [key, value] of Object.entries(call.args[2])) {
        if (key !== "ui_version" && !C.EVENTS.measurementParams[name].includes(key)) flag("a parameter that is not on the event's list", name + "." + key);
        else if (!VALUE_OK[key] || !VALUE_OK[key](value)) flag("a value that is not on its fixed list", name + "." + key + " = " + JSON.stringify(value));
      }
    }
    if (calls.filter((c) => c.sink === "fbq" && c.args[1] === "Contact").length > 1) flag("Contact sent to the pixel twice in one page load", "");
  }

  // what was sent
  for (const body of bodies) {
    if (!C.SERVICE_ZIPS.includes(body.zip)) flag("a request was sent for a ZIP outside the list", body.zip);
    if (body.website !== "") flag("the trap field was filled", body.website);
    const text = body.preferredContact === "text";
    if (body.smsTransactionalConsent !== (text && body.consent === "yes") || (body.smsTransactionalConsent && (!text || body.consentVersion !== C.VERSIONS.consentVersion || !body.smsConsentCapturedAt)) || (!body.smsTransactionalConsent && (body.consentVersion !== "" || body.smsConsentCapturedAt !== "" || body.consent !== "no"))) flag("consent evidence inconsistent in a payload", JSON.stringify([body.preferredContact, body.smsTransactionalConsent, body.consent, body.consentVersion, body.smsConsentCapturedAt]));
    if (text && !body.smsTransactionalConsent) flag("a Text request was sent without consent", "");
    if (body.intent === "service_request" && !(body.termsAccepted === true && body.termsVersion === C.VERSIONS.termsVersion && body.termsAcceptedAt)) flag("a service request was sent without terms evidence", "");
    if (body.intent !== "service_request" && (body.termsAccepted || body.lastName || body.street || body.city || body.startTiming)) flag("a non-service request carried service-only fields", JSON.stringify(body));
    if (body.intent !== "question" && hasNeedle(body.question)) flag("the typed question travelled with another intent", body.question);
    if (body.customEstimate && (body.clientPriceCents !== null || body.perVisitPrice !== "")) flag("a custom estimate carried a price", "");
    if (body.intent === "quote_delivery" && body.preferredContact === "call") flag("quote delivery by phone call was sent", "");
  }
  // conversions: exactly one set per accepted SERVICE request, none otherwise
  const acceptedService = [...acceptedIds].filter((id) => id.endsWith(":service_request")).map((id) => id.split(":").slice(0, 2).join(":"));
  accepted += acceptedIds.size;
  const leadIds = calls.filter((c) => c.sink === "fbq" && c.args[1] === "Lead").map((c) => c.args[3].eventID);
  const generateIds = calls.filter((c) => c.sink === "gtag" && c.args[1] === "generate_lead").map((c) => c.args[2].event_id);
  const conversionIds = calls.filter((c) => c.sink === "gtag" && c.args[1] === "conversion").map((c) => c.args[2].event_id);
  for (const [name, list] of [["Lead", leadIds], ["generate_lead", generateIds], ["conversion", conversionIds]]) {
    if (list.slice().sort().join() !== acceptedService.slice().sort().join()) flag(name + " does not match the accepted service requests one for one", "fired " + JSON.stringify(list) + " accepted " + JSON.stringify(acceptedService));
  }
  // a quote sent to the visitor: one QuoteSent per accepted quote delivery, saying how that request was sent, and never a conversion
  const acceptedQuotes = [...acceptedIds].filter((id) => id.endsWith(":quote_delivery")).map((id) => id.split(":")[0]);
  const quoteSent = calls.filter((c) => c.sink === "fbq" && c.args[1] === "QuoteSent");
  if (quoteSent.length !== acceptedQuotes.length) flag("QuoteSent does not match the accepted quote deliveries one for one", "fired " + quoteSent.length + ", accepted " + acceptedQuotes.length);
  const quoteMethods = calls.filter((c) => c.sink === "gtag" && c.args[1] === "quote_requested").map((c) => [c.args[2].transaction_id, c.args[2].method]);
  for (const [id, method] of quoteMethods) {
    const body = bodies.filter((b) => b.requestId === id).pop();
    if (!body || body.preferredContact !== method) flag("the method on quote_requested is not the reply method that was sent", JSON.stringify([id, method, body && body.preferredContact]));
  }
  // the source kept for a return visit is the nine parameters of this arrival, under the one key
  const keptNow = keptItems[C.STORAGE_KEYS.attributionKept];
  if (!keptNow || JSON.stringify(JSON.parse(keptNow).values) !== JSON.stringify(query.includes("gclid") ? { utm_source: "meta", gclid: "G-1" } : { utm_source: "meta" })) flag("the kept attribution is not this arrival's parameters", String(keptNow));
}

console.log(WALKS + " walks, " + actions + " actions, " + sentBodies + " requests reached the stand-in Worker, " + accepted + " accepted. Seed " + SEED + ".");
if (problems.size === 0) console.log("No rule was broken.");
for (const [what, info] of problems) console.log("BROKEN (" + info.count + "x): " + what + (info.first ? "\n    first: " + String(info.first).slice(0, 400) : ""));
process.exitCode = problems.size ? 1 : 0;
