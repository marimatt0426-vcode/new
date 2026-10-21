// The measurement added on the owner's go-ahead of 2026-10-09 (CORE-API.md
// section 8, rows T16 to T22). None of it is a conversion.
//   T16  method                   "text" or "email" on QuoteSent and quote_requested
//   T17  areas_selected           Google, the number of areas, once the visitor moves on
//   T18  frequency_selected       Google, the frequency id, when the visitor chooses it
//   T19  request_step_viewed / request_step_completed   Google, reported through trackUi
//   T20  form_validation_failed   Google, the KEYS of the fields that failed, never a value
//   T21  builder_opened / builder_closed                Google, page-level
//   T22  contact_click            Google, with the pixel's standard event Contact
// Every store here is offline. Live-mode stores use addresses under .invalid,
// stand-in tags and a stand-in server: nothing can reach a real address.
import test from "node:test";
import assert from "node:assert/strict";
import { core, makeStore, fakeStorage, fakeLocation, fillPlan, fillDetails } from "./helpers/make-store.mjs";
import { worker } from "./helpers/live-source.mjs";
import { TERMS_VERSION } from "./helpers/terms-version.mjs";

const UI = "2026-10-07-site-rebuild-v5";
const OFFLINE_PAGE = "https://pages.offline.invalid/quote";
const OFFLINE_ENDPOINT = "https://relay.offline.invalid/submit";
const CONVERSION_NAMES = ["Lead", "generate_lead", "conversion"];
const FUNNEL_NAMES = ["areas_selected", "frequency_selected", "request_step_viewed", "request_step_completed", "form_validation_failed", "builder_opened", "builder_closed", "contact_click"];
// Everything fillDetails() types into the form, and the ZIPs these tests use.
const PERSONAL = ["Test", "Reviewer", "3175550100", "555-0100", "(317)", "test@example.com", "example.com", "123 Example St", "Carmel", "Is this only a test question?", "46032", "46074"];

const google = (store) => store.trackLog.filter((entry) => entry.channel === "google");
const meta = (store) => store.trackLog.filter((entry) => entry.channel === "meta");
const rejected = (store) => store.trackLog.filter((entry) => entry.channel === "rejected");
// The GA4 twins of 2026-10-18 (channel "ga4") are tested in ga4-events.test.mjs; these sequences are the events sent before them.
const names = (entries) => entries.filter((entry) => entry.channel !== "ga4").map((entry) => entry.event);
const count = (entries, name) => entries.filter((entry) => entry.event === name && entry.channel !== "rejected").length;
const last = (entries, name) => entries.filter((entry) => entry.event === name && entry.channel !== "rejected").pop();
const paramsOf = (store, name) => store.trackLog.filter((entry) => entry.event === name && entry.channel !== "rejected").map((entry) => entry.params);
const lastRejected = (store) => rejected(store).pop();
const plain = (value) => JSON.parse(JSON.stringify(value));
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// The plan answered and the visitor on the request form (a service request unless told otherwise).
function toRequest(store, intent) {
  fillPlan(store);
  store.goTo("price");
  if (intent) store.set({ intent });
  store.next();
  assert.equal(store.getState().step, "request");
  return store;
}

// A complete request, up to the confirm step.
function toConfirm(store, intent, contact) {
  toRequest(store, intent || "service_request");
  fillDetails(store, intent || "service_request", contact || "text");
  store.next();
  assert.equal(store.getState().step, "confirm");
  return store;
}

// A live-mode store on an origin that may send, with tags and a server that
// only record what they are given.
function offlineLivePage(setup) {
  const config = setup || {};
  const calls = [];
  const sinks = config.sinks || {
    gtag: (...args) => calls.push({ sink: "gtag", args }),
    fbq: (...args) => calls.push({ sink: "fbq", args })
  };
  const made = makeStore({
    url: config.url || OFFLINE_PAGE,
    options: Object.assign({
      mode: "live", endpoint: OFFLINE_ENDPOINT, allowedOrigins: [new URL(OFFLINE_PAGE).origin], sinks,
      fetch: async (url, init) => ({ ok: true, status: 202, text: async () => JSON.stringify({ accepted: true, requestId: JSON.parse(init.body).requestId }) })
    }, config.options || {})
  });
  made.calls = calls;
  made.sent = (sink, name) => calls.filter((call) => call.sink === sink && call.args[1] === name);
  return made;
}

// Every moment an interface can report, once each, in a believable order.
// Returns the result of each call.
function reportEverything(store) {
  const results = [];
  results.push(store.trackUi("contact_click", { method: "text", placement: "header" }));
  results.push(store.trackUi("builder_opened", { entry: "plan_button", plan: "weekly" }));
  toRequest(store);
  results.push(store.trackUi("request_step_viewed", { request_step: "who" }));
  results.push(store.trackUi("form_validation_failed", { request_step: "who", fields: ["firstName", "lastName"] }));
  results.push(store.trackUi("request_step_completed", { request_step: "who" }));
  results.push(store.trackUi("builder_closed"));
  return results;
}

/* ---- the fixed lists --------------------------------------------------------- */

test("the fixed lists: names, parameters and values an interface may report, and what each event may carry", () => {
  assert.deepEqual(plain(core.EVENTS.trackUi), ["builder_opened", "builder_closed", "request_step_viewed", "request_step_completed", "form_validation_failed", "contact_click"]);
  assert.deepEqual(plain(core.EVENTS.trackUiParams), {
    builder_opened: ["entry", "plan"],
    builder_closed: [],
    request_step_viewed: ["request_step"],
    request_step_completed: ["request_step"],
    form_validation_failed: ["request_step", "fields"],
    contact_click: ["method", "placement"]
  });
  assert.deepEqual(plain(core.EVENTS.trackUiValues), {
    entry: ["hero_card", "header_button", "menu_button", "page_button", "plan_button", "pinned_bar", "summary_card", "link", "saved_link"],
    plan: ["twice", "weekly", "biweekly", "onetime", "custom"],
    request_step: ["who", "reach", "where"],
    fields: ["dogCount", "zip", "yardSize", "areas", "frequency", "intent", "customerStatus", "firstName", "lastName", "preferredContact", "phone", "email", "smsConsent", "address", "city", "startTiming", "lastCleaned", "question", "termsAccepted"],
    method: ["text", "call", "email"],
    placement: ["header", "menu", "hero", "section", "closing", "footer", "builder"]
  });
  assert.equal(core.EVENTS.trackUiValues.method[0], "text", "text is offered before call");
  assert.deepEqual(plain(core.EVENTS.trackUiValues.plan), core.FREQUENCIES.map((frequency) => frequency.id));
  assert.deepEqual(plain(core.EVENTS.trackUiValues.fields), Object.keys(core.FIELD_STEP), "the field keys are the engine's own");
  assert.deepEqual(Object.keys(core.EVENTS.trackUiParams).sort(), core.EVENTS.trackUi.slice().sort(), "every reported moment has its list");
  // What each event may carry in the end, the engine's own additions included.
  assert.deepEqual(plain(core.EVENTS.measurementParams), {
    price_choice_selected: ["choice"],
    quote_link_saved: [],
    QuoteLinkSaved: [],
    QuoteSent: ["frequency", "value", "currency", "method"],
    areas_selected: ["areas_count"],
    frequency_selected: ["frequency"],
    request_step_viewed: ["request_step", "choice"],
    request_step_completed: ["request_step", "choice"],
    form_validation_failed: ["form_step", "request_step", "fields", "error_count", "checked_by"],
    builder_opened: ["entry", "plan", "step"],
    builder_closed: ["step", "request_step"],
    contact_click: ["method", "placement"],
    Contact: []
  });
  assert.deepEqual(plain(core.EVENTS.pixelCounts), ["QuoteSent", "QuoteLinkSaved"]);
  assert.deepEqual(plain(core.EVENTS.pixelStandard), ["Contact"]);
  for (const name of Object.keys(core.EVENTS.measurementParams)) {
    const homes = [core.EVENTS.engine, core.EVENTS.pixelCounts, core.EVENTS.pixelStandard].filter((list) => list.includes(name));
    assert.equal(homes.length, 1, name + " is a Google name, a pixel count or the pixel's Contact, exactly one of them");
    assert.equal(core.PIXEL_MILESTONES.includes(name), false, name + " is not a once-per-page-load milestone");
    assert.equal(core.EVENTS.ui.includes(name), false, name + " is not a track() event");
    for (const key of core.EVENTS.measurementParams[name]) assert.equal(/zip|name|phone|email|address|street|city|question|consent|id$/i.test(key), false, name + "." + key);
  }
  // No new Meta event except the standard Contact: every funnel name is a Google name.
  for (const name of FUNNEL_NAMES) assert.ok(core.EVENTS.engine.includes(name), name);
  for (const name of CONVERSION_NAMES) {
    assert.equal(has(core.EVENTS.measurementParams, name), false, name);
    assert.equal(core.EVENTS.trackUi.includes(name), false, name);
  }
  for (const list of [core.EVENTS.trackUi, core.EVENTS.trackUiParams, core.EVENTS.trackUiParams.builder_opened, core.EVENTS.trackUiValues, core.EVENTS.trackUiValues.entry, core.EVENTS.trackUiValues.fields, core.EVENTS.pixelStandard, core.EVENTS.measurementParams.contact_click]) {
    assert.ok(Object.isFrozen(list), "the lists cannot be changed by a page");
  }
  assert.equal(typeof makeStore().store.trackUi, "function");
});

/* ---- T16: how the quote was sent --------------------------------------------- */

test("T16: a quote sent to the visitor says how, text or email, on QuoteSent and on quote_requested, and nothing else says it", async () => {
  for (const method of ["text", "email"]) {
    const { store } = makeStore();
    toConfirm(store, "quote_delivery", method);
    const sent = await store.submit();
    assert.equal(sent.ok, true, method);
    assert.equal(sent.payload.preferredContact, method);
    assert.equal(count(meta(store), "QuoteSent"), 1, method);
    assert.deepEqual(last(meta(store), "QuoteSent").params, { ui_version: UI, frequency: "weekly", value: 28.99, currency: "USD", method });
    assert.equal(last(meta(store), "QuoteSent").method, "trackCustom");
    assert.equal(last(google(store), "quote_requested").params.method, method);
    for (const entry of store.trackLog.filter((item) => item.event !== "QuoteSent" && item.event !== "quote_requested")) assert.equal(has(entry.params, "method"), false, entry.event + " has no method");
    for (const name of CONVERSION_NAMES) assert.equal(count(store.trackLog, name), 0, "a sent quote must not fire " + name);
    assert.equal(count(store.trackLog, "QuoteTexted"), 0, "the old name is never sent");
  }
  // A phone call is not a way to send a quote, so "call" can never be the value.
  const refused = makeStore().store;
  toRequest(refused, "quote_delivery");
  assert.equal(refused.set({ preferredContact: "call" }).ok, false);
  assert.equal(refused.getState().preferredContact, "text");
});

test("T16: no other request carries a method, and the service request's conversion events are what they were", async () => {
  for (const [intent, contact, stage] of [["service_request", "text", "service_requested"], ["service_request", "call", "service_requested"], ["service_request", "email", "service_requested"], ["question", "email", "question_submitted"]]) {
    const { store } = makeStore();
    toConfirm(store, intent, contact);
    const before = store.trackLog.length;
    const sent = await store.submit();
    assert.equal(sent.ok, true, intent + " by " + contact);
    assert.equal(count(google(store), stage), 1);
    for (const entry of store.trackLog) assert.equal(has(entry.params, "method"), false, entry.event + " of a " + intent);
    assert.equal(count(store.trackLog, "QuoteSent"), 0);
    if (intent !== "service_request") continue;
    const after = store.trackLog.slice(before);
    assert.deepEqual(names(after), ["service_requested", "generate_lead", "conversion", "Lead", "funnel_step_viewed"]);
    const eventId = sent.requestId + ":service_requested";
    const lead = { event_id: eventId, transaction_id: sent.requestId, intent: "service_request", frequency: "weekly", currency: "USD", value: 28.99 };
    assert.deepEqual(after[0].params, Object.assign({ ui_version: UI }, lead));
    assert.deepEqual(after[1].params, lead);
    assert.deepEqual(after[2].params, Object.assign({}, lead, { send_to: "AW-17767139897/g9smCM7pkL4cELmUhJhC", transport_type: "beacon" }));
    assert.equal(after[3].method, "track");
    assert.deepEqual(after[3].params, { currency: "USD", value: 28.99 });
    assert.deepEqual(after[3].options, { eventID: eventId });
  }
});

/* ---- T17: areas_selected ------------------------------------------------------ */

test("T17: the number of areas is counted once the visitor moves on, not on every tile tap, and again only when it differs", () => {
  const { store } = makeStore();
  store.set({ dogCount: "2" }); store.next();
  store.set({ zip: "46032" }); store.next();
  store.set({ yardSize: "m" }); store.next();
  assert.equal(store.getState().step, "areas");
  store.toggleArea("back"); store.toggleArea("front"); store.toggleArea("side"); store.toggleArea("side");
  assert.equal(count(store.trackLog, "areas_selected"), 0, "tile taps count nothing");
  store.next();
  assert.equal(store.getState().step, "frequency");
  assert.deepEqual(paramsOf(store, "areas_selected"), [{ ui_version: UI, areas_count: 2 }]);
  assert.equal(last(store.trackLog, "areas_selected").channel, "google");
  assert.equal(count(meta(store), "areas_selected"), 0, "no pixel event");

  // Looking again without changing anything counts nothing.
  store.back(); store.next();
  assert.equal(count(store.trackLog, "areas_selected"), 1);
  // Different tiles, the same number: not a new count.
  store.back(); store.toggleArea("front"); store.toggleArea("side"); store.next();
  assert.deepEqual(plain(store.getState().areas), ["back", "side"]);
  assert.equal(count(store.trackLog, "areas_selected"), 1);
  // A different number is.
  store.back(); store.toggleAllAreas(); store.next();
  assert.deepEqual(paramsOf(store, "areas_selected"), [{ ui_version: UI, areas_count: 2 }, { ui_version: UI, areas_count: 3 }]);

  // A new quote on the same page load counts its own answer, the same number included.
  store.set({ frequency: "weekly" });
  assert.equal(store.reset(), true);
  store.set({ dogCount: "1" }); store.set({ zip: "46032" }); store.set({ yardSize: "s" });
  store.set({ areas: ["back", "front", "side"] });
  store.goTo("frequency");
  assert.equal(count(store.trackLog, "areas_selected"), 3);
  assert.equal(last(store.trackLog, "areas_selected").params.areas_count, 3);
});

test("T17: a design with every question on one screen is counted too, before the frequency or the price it leads to", () => {
  // The frequency tile is pressed after the areas, with no move between them.
  const oneScreen = makeStore().store;
  oneScreen.set({ dogCount: "2", zip: "46032", yardSize: "m" });
  oneScreen.toggleArea("back");
  assert.equal(count(oneScreen.trackLog, "areas_selected"), 0);
  oneScreen.set({ frequency: "weekly" });
  assert.deepEqual(names(google(oneScreen)).slice(-2), ["areas_selected", "frequency_selected"]);
  // The areas are the last answer: the price screen reporting itself settles them.
  const areasLast = makeStore().store;
  areasLast.set({ dogCount: "2", zip: "46032", yardSize: "m", frequency: "weekly" });
  areasLast.set({ areas: ["back", "side"] });
  assert.equal(count(areasLast.trackLog, "areas_selected"), 0);
  assert.equal(areasLast.reportStepShown("price"), true);
  const after = names(google(areasLast));
  assert.ok(after.indexOf("areas_selected") >= 0 && after.indexOf("areas_selected") < after.indexOf("price_viewed"), after.join(", "));
  assert.equal(last(areasLast.trackLog, "areas_selected").params.areas_count, 2);
  areasLast.reportStepShown("price");
  assert.equal(count(areasLast.trackLog, "areas_selected"), 1);
});

test("T17: areas changed on the very screen the request is sent from are counted as the request goes out", async () => {
  const { store } = makeStore();
  toConfirm(store);
  assert.deepEqual(paramsOf(store, "areas_selected"), [{ ui_version: UI, areas_count: 2 }]);
  // A merged screen: the visitor adds the side yard beside the Send button, with no move between.
  store.set({ areas: ["back", "front", "side"] });
  assert.equal(store.getState().step, "confirm");
  assert.equal(count(store.trackLog, "areas_selected"), 1, "not on the tap");
  // The terms box was unticked by the edit: a refused Send settles nothing.
  assert.equal((await store.submit()).status, "invalid");
  assert.equal(count(store.trackLog, "areas_selected"), 1);
  store.set({ termsAccepted: true });
  const before = store.trackLog.length;
  assert.equal((await store.submit()).ok, true);
  assert.deepEqual(names(store.trackLog.slice(before)), ["areas_selected", "service_requested", "generate_lead", "conversion", "Lead", "funnel_step_viewed"]);
  assert.deepEqual(last(store.trackLog, "areas_selected").params, { ui_version: UI, areas_count: 3 });
});

test("T17: areas carried in from another page or a saved plan were not chosen here and are not counted", async () => {
  const storage = fakeStorage({ pp_quote_progress_v3: JSON.stringify({ zip: "46032", dogCount: "2", frequency: "weekly", areas: ["back", "front"], yardSize: "m", lastCleaned: "", customerStatus: "" }) });
  const carried = makeStore({ storage }).store;
  assert.equal(carried.goTo("price").ok, true);
  assert.equal(count(carried.trackLog, "areas_selected"), 0);
  // Editing them here to the same number counts nothing; to another number, once.
  carried.edit("areas"); carried.toggleArea("front"); carried.toggleArea("side"); carried.next();
  assert.equal(carried.getState().step, "price");
  assert.equal(count(carried.trackLog, "areas_selected"), 0);
  carried.edit("areas"); carried.toggleArea("front"); carried.next();
  assert.deepEqual(paramsOf(carried, "areas_selected"), [{ ui_version: UI, areas_count: 3 }]);

  const reopened = makeStore().store;
  assert.equal((await reopened.resume("A".repeat(43))).ok, true);
  assert.equal(reopened.getState().areas.length, 2);
  assert.equal(reopened.next().ok, true);
  assert.equal(count(reopened.trackLog, "areas_selected"), 0);
});

/* ---- T18: frequency_selected --------------------------------------------------- */

test("T18: how often is counted when the visitor's own choice changes the answer, with the frequency id and nothing else", () => {
  const { store } = makeStore();
  store.set({ dogCount: "2" }); store.set({ zip: "46032" }); store.set({ yardSize: "m" }); store.set({ areas: ["back"] });
  assert.equal(count(store.trackLog, "frequency_selected"), 0);
  store.set({ frequency: "weekly" });
  assert.deepEqual(paramsOf(store, "frequency_selected"), [{ ui_version: UI, frequency: "weekly" }]);
  assert.equal(last(store.trackLog, "frequency_selected").channel, "google");
  store.set({ frequency: "weekly" });
  assert.equal(count(store.trackLog, "frequency_selected"), 1, "a tap on the tile already chosen is not a new answer");
  store.set({ frequency: "biweekly" });
  store.set({ frequency: "onetime" });
  assert.deepEqual(paramsOf(store, "frequency_selected").map((params) => params.frequency), ["weekly", "biweekly", "onetime"]);
  // Clearing it, an unknown id, or a frequency the engine does not offer: nothing.
  store.set({ frequency: "" });
  store.set({ frequency: "monthly" });
  assert.equal(count(store.trackLog, "frequency_selected"), 3);
  const six = makeStore().store;
  six.set({ dogCount: "6" }); six.set({ zip: "46032" }); six.set({ yardSize: "m" }); six.set({ areas: ["back"] });
  assert.equal(six.set({ frequency: "weekly" }).ok, false, "weekly is not offered for six dogs");
  assert.equal(count(six.trackLog, "frequency_selected"), 0);
  assert.equal(count(meta(store), "frequency_selected") + count(meta(six), "frequency_selected"), 0, "no pixel event");
});

test("T18: a frequency the engine changes by itself is not the visitor's choice", () => {
  const { store } = makeStore();
  fillPlan(store);
  assert.equal(count(store.trackLog, "frequency_selected"), 1);
  const result = store.set({ dogCount: "10" });
  assert.equal(store.getState().frequency, "custom", "ten or more dogs is a custom booking");
  assert.ok(result.notices.length > 0);
  assert.equal(count(store.trackLog, "frequency_selected"), 1, "the engine's own change is not counted");
  // Carried-over progress is not a choice made on this page either.
  const storage = fakeStorage({ pp_quote_progress_v3: JSON.stringify({ zip: "46032", dogCount: "2", frequency: "weekly", areas: ["back"], yardSize: "m", lastCleaned: "", customerStatus: "" }) });
  const carried = makeStore({ storage }).store;
  carried.goTo("price");
  assert.equal(count(carried.trackLog, "frequency_selected"), 0);
  // One call that asks for a frequency the new dog count rules out: the engine's custom booking is not the visitor's pick.
  const both = makeStore().store;
  fillPlan(both);
  const refused = both.set({ dogCount: "10", frequency: "weekly" });
  assert.deepEqual([refused.ok, both.getState().frequency], [false, "custom"]);
  assert.deepEqual(paramsOf(both, "frequency_selected"), [{ ui_version: UI, frequency: "weekly" }], "only the first, real choice");
  // One call that repeats the frequency already chosen beside another answer: the frequency did not change.
  const repeat = makeStore().store;
  fillPlan(repeat);
  repeat.set({ frequency: "weekly", yardSize: "l" });
  assert.equal(repeat.getState().yardSize, "l");
  assert.equal(count(repeat.trackLog, "frequency_selected"), 1);
});

/* ---- T19: the request screens --------------------------------------------------- */

test("T19: each request screen is counted once as reached and once as completed, with the way forward added by the engine", () => {
  const { store } = makeStore();
  toRequest(store);
  const before = store.trackLog.length;
  assert.equal(store.trackUi("request_step_viewed", { request_step: "who" }), true);
  assert.equal(store.trackUi("request_step_viewed", { request_step: "who" }), true, "a second report is accepted and not counted again");
  assert.deepEqual(store.trackLog.slice(before).map((entry) => [entry.channel, entry.event, entry.params]), [["google", "request_step_viewed", { ui_version: UI, request_step: "who", choice: "service_request" }]]);
  assert.equal(store.trackUi("request_step_completed", { request_step: "who" }), true);
  assert.equal(store.trackUi("request_step_completed", { request_step: "who" }), true);
  assert.equal(store.trackUi("request_step_viewed", { request_step: "reach" }), true);
  assert.equal(store.trackUi("request_step_viewed", { request_step: "who" }), true, "going back to a screen is not a new count");
  assert.equal(store.trackUi("request_step_completed", { request_step: "reach" }), true);
  assert.equal(store.trackUi("request_step_viewed", { request_step: "where" }), true);
  assert.deepEqual(names(store.trackLog.slice(before)), ["request_step_viewed", "request_step_completed", "request_step_viewed", "request_step_completed", "request_step_viewed"]);
  // The last screen is completed by moving on to the confirm step.
  fillDetails(store, "service_request", "text");
  assert.equal(store.next().ok, true);
  assert.equal(store.getState().step, "confirm");
  assert.equal(store.trackUi("request_step_completed", { request_step: "where" }), true);
  assert.deepEqual(paramsOf(store, "request_step_completed").map((params) => params.request_step), ["who", "reach", "where"]);
  assert.deepEqual(paramsOf(store, "request_step_viewed").map((params) => params.request_step), ["who", "reach", "where"]);
  for (const entry of store.trackLog.filter((item) => /^request_step_/.test(item.event))) {
    assert.deepEqual(Object.keys(entry.params).sort(), ["choice", "request_step", "ui_version"]);
    assert.equal(entry.channel, "google");
  }
  assert.equal(meta(store).some((entry) => /request_step/.test(entry.event)), false, "no pixel event");
});

test("T19: counted per quote and per way forward; a completed screen never outnumbers a reached one", async () => {
  const { store } = makeStore();
  toRequest(store, "quote_delivery");
  // Completed without having been reported as reached: it is counted as reached first.
  assert.equal(store.trackUi("request_step_completed", { request_step: "who" }), true);
  assert.deepEqual(store.trackLog.slice(-2).map((entry) => [entry.event, entry.params.request_step, entry.params.choice]), [["request_step_viewed", "who", "quote_delivery"], ["request_step_completed", "who", "quote_delivery"]]);
  // Back on the price the visitor asks a question instead: its screens are counted on their own.
  store.back();
  store.set({ intent: "question" });
  store.next();
  assert.equal(store.trackUi("request_step_viewed", { request_step: "who" }), true);
  assert.deepEqual(paramsOf(store, "request_step_viewed").map((params) => params.choice + ":" + params.request_step), ["quote_delivery:who", "question:who"]);
  // A new quote counts again.
  assert.equal(store.reset(), true);
  toRequest(store, "question");
  store.trackUi("request_step_viewed", { request_step: "who" });
  assert.equal(count(store.trackLog, "request_step_viewed"), 3);
  // And so does a saved plan that is opened.
  assert.equal((await store.resume("A".repeat(43))).ok, true);
  store.next();
  store.trackUi("request_step_viewed", { request_step: "who" });
  assert.equal(count(store.trackLog, "request_step_viewed"), 4);
});

test("T19: refused at the wrong moment or with anything but one of the three screens", () => {
  const { store } = makeStore();
  assert.equal(store.trackUi("request_step_viewed", { request_step: "who" }), false, "not on the first question");
  fillPlan(store);
  store.goTo("price");
  assert.equal(store.trackUi("request_step_viewed", { request_step: "who" }), false, "not on the price step");
  assert.equal(store.trackUi("request_step_completed", { request_step: "who" }), false);
  store.next();
  for (const bad of [undefined, {}, { request_step: "" }, { request_step: "address" }, { request_step: "Test Reviewer" }, { request_step: 2 }, { request_step: ["who"] }, { step: "who" }]) {
    assert.equal(store.trackUi("request_step_viewed", bad), false, JSON.stringify(bad));
  }
  assert.equal(count(store.trackLog, "request_step_viewed") + count(store.trackLog, "request_step_completed"), 0);
  assert.equal(JSON.stringify(store.trackLog).includes("Test Reviewer"), false, "a refused value is never written to the log");
  // After the request was sent there is no request screen to count.
  fillDetails(store, "service_request", "text");
  store.next();
  assert.equal(store.trackUi("request_step_viewed", { request_step: "where" }), false, "the confirm step is not a request screen");
});

/* ---- T20: form_validation_failed ---------------------------------------------- */

test("T20: a refused Next on the request form sends the KEYS of the fields that failed, never what was typed", () => {
  const { store } = makeStore();
  toRequest(store);
  store.set({ firstName: "Test", phone: "31755", email: "test@", address: "123 Example St" });
  const before = store.trackLog.length;
  const went = store.next();
  assert.equal(went.ok, false);
  assert.deepEqual(store.trackLog.slice(before).map((entry) => [entry.channel, entry.event, entry.params]), [["google", "form_validation_failed", {
    ui_version: UI, form_step: "request", fields: "customerStatus,lastName,phone,email,smsConsent,startTiming,lastCleaned", error_count: 7, checked_by: "form"
  }]]);
  assert.deepEqual(last(store.trackLog, "form_validation_failed").params.fields.split(","), core.EVENTS.trackUiValues.fields.filter((key) => went.errors.some((error) => error.field === key)), "exactly the fields the engine refused, in its own order");
  const everything = JSON.stringify(store.trackLog);
  for (const value of ["Test", "31755", "test@", "123 Example St", "Enter", "Choose", "Please"]) assert.equal(everything.includes(value), false, "the event log holds " + value);

  // Pressing again with nothing changed is not a new attempt.
  store.next(); store.next();
  assert.equal(count(store.trackLog, "form_validation_failed"), 1);
  // One thing fixed: the next refused press is counted, with what is still wrong.
  store.set({ lastName: "Reviewer", customerStatus: "new" });
  store.next();
  assert.equal(count(store.trackLog, "form_validation_failed"), 2);
  assert.deepEqual(last(store.trackLog, "form_validation_failed").params, { ui_version: UI, form_step: "request", fields: "phone,email,smsConsent,startTiming,lastCleaned", error_count: 5, checked_by: "form" });
  // The same fields failing again after an edit that fixed nothing: a new attempt.
  store.set({ phone: "317555" });
  store.next();
  assert.equal(count(store.trackLog, "form_validation_failed"), 3);
  assert.equal(count(meta(store), "form_validation_failed"), 0, "no pixel event");
});

test("T20: a refused Send on the confirm step, and fields the server refuses, are counted the same way", async () => {
  const { store } = makeStore();
  toConfirm(store);
  store.set({ termsAccepted: false });
  const refused = await store.submit();
  assert.equal(refused.status, "invalid");
  assert.deepEqual(last(store.trackLog, "form_validation_failed").params, { ui_version: UI, form_step: "confirm", fields: "termsAccepted", error_count: 1, checked_by: "form" });
  await store.submit();
  assert.equal(count(store.trackLog, "form_validation_failed"), 1, "the same refusal twice is one attempt");
  // The server names two fields (demo switch): its own names are mapped to the engine's keys.
  store.setDemo({ submit: "invalid", invalidFields: ["phone", "street"] });
  store.set({ termsAccepted: true });
  const server = await store.submit();
  assert.equal(server.status, "server_invalid");
  assert.deepEqual(last(store.trackLog, "form_validation_failed").params, { ui_version: UI, form_step: "confirm", fields: "phone,address", error_count: 2, checked_by: "server" });
  // Every reply from the server is its own attempt.
  await store.submit();
  assert.equal(count(store.trackLog, "form_validation_failed"), 3);
  for (const name of CONVERSION_NAMES.concat(["service_requested"])) assert.equal(count(store.trackLog, name), 0, name);
  const everything = JSON.stringify(store.trackLog);
  for (const value of PERSONAL) assert.equal(everything.includes(value), false, "the event log holds " + value);
});

test("T20: an interface reports the refusals it decides alone, with the screen; anything but a field key is left out", () => {
  const { store } = makeStore();
  toRequest(store);
  store.trackUi("request_step_viewed", { request_step: "who" });
  store.set({ firstName: "Test", phone: "3175550100", email: "test@example.com" });
  const before = store.trackLog.length;
  // A page that wrongly hands over what was typed: none of it gets anywhere.
  assert.equal(store.trackUi("form_validation_failed", { request_step: "reach", fields: ["phone", "smsConsent", "3175550100", "test@example.com", "Test", "phone", { key: "email" }, 7] }), true);
  assert.deepEqual(store.trackLog.slice(before).map((entry) => [entry.channel, entry.event, entry.params]), [["google", "form_validation_failed", { ui_version: UI, form_step: "request", fields: "phone,smsConsent", error_count: 2, checked_by: "form", request_step: "reach" }]]);
  // The same keys as one string, in any order: the same refusal, not counted again.
  assert.equal(store.trackUi("form_validation_failed", { request_step: "reach", fields: "smsConsent, phone" }), true);
  assert.equal(count(store.trackLog, "form_validation_failed"), 1);
  // Without a screen the engine adds the one last reported as on screen.
  store.set({ smsConsent: true });
  assert.equal(store.trackUi("form_validation_failed", { fields: ["firstName"] }), true);
  assert.deepEqual(last(store.trackLog, "form_validation_failed").params, { ui_version: UI, form_step: "request", fields: "firstName", error_count: 1, checked_by: "form", request_step: "who" });
  // Refused: no field key at all, a wrong moment, or a made-up origin.
  for (const bad of [undefined, {}, { fields: [] }, { fields: ["3175550100", "test@example.com"] }, { fields: "Test Reviewer" }, { request_step: "who" }, { fields: 5 }]) {
    assert.equal(store.trackUi("form_validation_failed", bad), false, JSON.stringify(bad));
  }
  assert.equal(count(store.trackLog, "form_validation_failed"), 2);
  store.set({ lastName: "Reviewer" });
  store.trackUi("form_validation_failed", { fields: ["address"], checked_by: "server", form_step: "confirm", error_count: 99, message: "Enter the service address for Test Reviewer" });
  assert.deepEqual(last(store.trackLog, "form_validation_failed").params, { ui_version: UI, form_step: "request", fields: "address", error_count: 1, checked_by: "form", request_step: "who" }, "the engine's own parameters cannot be supplied by a page");
  assert.equal(lastRejected(store).dropped, 4);
  const planStep = makeStore().store;
  assert.equal(planStep.trackUi("form_validation_failed", { fields: ["phone"] }), false, "only on the request and confirm steps");
  assert.equal(count(planStep.trackLog, "form_validation_failed"), 0);
  const everything = JSON.stringify(store.trackLog) + JSON.stringify(planStep.trackLog);
  for (const value of PERSONAL.concat(["Enter the service"])) assert.equal(everything.includes(value), false, "the event log holds " + value);
});

test("T20: the list of keys is cut at whole keys, and the count stays true", () => {
  const { store } = makeStore();
  toRequest(store);
  const all = core.EVENTS.trackUiValues.fields;
  assert.equal(store.trackUi("form_validation_failed", { fields: all.slice().reverse() }), true);
  const params = last(store.trackLog, "form_validation_failed").params;
  assert.equal(params.error_count, all.length);
  assert.ok(params.fields.length <= 100);
  const sent = params.fields.split(",");
  assert.deepEqual(sent, all.slice(0, sent.length), "whole keys, in the engine's order, from the start");
  assert.ok(sent.length >= 8 && sent.length < all.length);
});

test("T20: only the request and confirm steps count; a refused press on a plan question is not a form failure", async () => {
  const { store } = makeStore();
  assert.equal((await store.submit()).status, "invalid");
  assert.equal(store.next().ok, false);
  store.set({ dogCount: "2" });
  store.next();
  assert.equal(store.getState().step, "zip");
  assert.equal(store.next().ok, false);
  assert.equal((await store.submit()).status, "invalid");
  fillPlan(store);
  store.goTo("price");
  assert.equal((await store.submit()).status, "invalid", "on the price step nothing of the request is filled in yet");
  assert.equal(count(store.trackLog, "form_validation_failed"), 0);
  assert.deepEqual(rejected(store), []);
});

test("T16 to T22: the value filter itself: each parameter takes its fixed kind of value and nothing else", () => {
  const allowed = core.testing.isAllowedMeasurementValue;
  const typed = ["Test", "Reviewer", "3175550100", "test@example.com", "123 Example St", "46032", "tel:+13179615865", "", " ", null, undefined, true, {}, [], ["text"], NaN];
  const cases = [
    ["QuoteSent", "method", ["text", "email"], ["call", "sms", "Text"]],
    ["quote_requested", "method", ["text", "email"], ["call"]],
    ["contact_click", "method", ["text", "call", "email"], ["sms", "fax", "phone"]],
    ["contact_click", "placement", ["header", "menu", "hero", "section", "closing", "footer", "builder"], ["sidebar", "Header", "top"]],
    ["builder_opened", "entry", ["hero_card", "header_button", "menu_button", "page_button", "plan_button", "pinned_bar", "summary_card", "link", "saved_link"], ["hero", "button", "plan"]],
    ["builder_opened", "plan", ["twice", "weekly", "biweekly", "onetime", "custom"], ["monthly", "Weekly", 2]],
    ["builder_opened", "step", core.STEPS, ["who", "start", 3]],
    ["builder_closed", "request_step", ["who", "reach", "where"], ["request", "confirm", "address"]],
    ["request_step_viewed", "choice", ["service_request", "quote_delivery", "question"], ["text_quote", "lead"]],
    ["frequency_selected", "frequency", ["twice", "weekly", "biweekly", "onetime", "custom"], ["monthly"]],
    ["areas_selected", "areas_count", [1, 2, 3], [0, 4, 1.5, "2", -1]],
    ["form_validation_failed", "form_step", ["request", "confirm"], ["price", "dogs", "done"]],
    ["form_validation_failed", "checked_by", ["form", "server"], ["page", "worker"]],
    ["form_validation_failed", "error_count", [1, 2, 19], [0, 20, 1.5, "3"]],
    ["form_validation_failed", "fields", ["phone", "phone,smsConsent", "zip,firstName,lastName", "termsAccepted"], ["smsConsent,phone", "phone,phone", "phone, email", "phone,3175550100", "Phone", "phone,", "x".repeat(101), core.EVENTS.trackUiValues.fields.join(",")]],
    ["QuoteSent", "value", [0, 28.99, 89.99], [-1, "28.99", Infinity]],
    ["QuoteSent", "currency", ["USD"], ["usd", "EUR", 840]]
  ];
  for (const [name, key, good, bad] of cases) {
    for (const value of good) assert.equal(allowed(name, key, value), true, name + "." + key + " should take " + JSON.stringify(value));
    for (const value of bad.concat(typed)) assert.equal(allowed(name, key, value), false, name + "." + key + " took " + JSON.stringify(value));
  }
  // A parameter nobody listed takes nothing at all.
  for (const key of ["phone", "email", "zip", "name", "label", "href", "event_id", "transaction_id"]) assert.equal(allowed("contact_click", key, "text"), false, key);
  // The key list: known keys only, in the engine's order, each once; the count is of every known key.
  const list = core.testing.fieldKeyList;
  assert.deepEqual(plain(list(["smsConsent", "phone", "phone", "3175550100", " email ", 7, null, "Phone"])), { text: "phone,email,smsConsent", count: 3, keys: ["phone", "email", "smsConsent"] });
  assert.deepEqual(plain(list("lastName, firstName")), { text: "firstName,lastName", count: 2, keys: ["firstName", "lastName"] });
  for (const nothing of [undefined, null, "", [], {}, 5, "Test Reviewer", ["3175550100"]]) assert.deepEqual(plain(list(nothing)), { text: "", count: 0, keys: [] });
});

/* ---- T21: builder_opened and builder_closed ------------------------------------ */

test("T21: the builder opening is counted once, with its entry point and the step it opened on; it is not an answer", () => {
  const { store } = makeStore();
  assert.equal(store.trackUi("builder_opened", { entry: "header_button" }), true);
  assert.deepEqual(store.trackLog.map((entry) => [entry.channel, entry.event, entry.params]), [["google", "builder_opened", { ui_version: UI, entry: "header_button", step: "dogs" }]], "no funnel_viewed: opening is not answering (T1 stands)");
  assert.equal(store.trackUi("builder_opened", { entry: "page_button" }), true, "already open: accepted and not counted again");
  assert.equal(count(store.trackLog, "builder_opened"), 1);
  // The first answer still fires funnel_viewed, exactly as before.
  store.set({ dogCount: "2" });
  assert.deepEqual(names(store.trackLog), ["builder_opened", "funnel_viewed", "QuoteFunnelViewed", "dog_count_selected"]);

  // Every entry point on the list, and nothing else.
  for (const entry of core.EVENTS.trackUiValues.entry) {
    const page = makeStore().store;
    assert.equal(page.trackUi("builder_opened", { entry }), true, entry);
    assert.deepEqual(paramsOf(page, "builder_opened"), [{ ui_version: UI, entry, step: "dogs" }]);
  }
  for (const bad of [undefined, {}, { entry: "" }, { entry: "hero" }, { entry: "Header Button" }, { entry: 1 }, { plan: "weekly" }, { entry: "tel:+13179615865" }]) {
    const page = makeStore().store;
    assert.equal(page.trackUi("builder_opened", bad), false, JSON.stringify(bad));
    assert.equal(count(page.trackLog, "builder_opened"), 0);
    assert.equal(JSON.stringify(page.trackLog).includes("3179615865"), false);
  }
});

test("T21: a plan button names its plan, a frequency id; no other entry point may", () => {
  for (const plan of core.EVENTS.trackUiValues.plan) {
    const page = makeStore().store;
    assert.equal(page.trackUi("builder_opened", { entry: "plan_button", plan }), true, plan);
    assert.deepEqual(paramsOf(page, "builder_opened"), [{ ui_version: UI, entry: "plan_button", step: "dogs", plan }]);
  }
  const unknown = makeStore().store;
  assert.equal(unknown.trackUi("builder_opened", { entry: "plan_button", plan: "monthly" }), true, "the opening still counts");
  assert.deepEqual(paramsOf(unknown, "builder_opened"), [{ ui_version: UI, entry: "plan_button", step: "dogs" }]);
  assert.equal(lastRejected(unknown).dropped, 1);
  const other = makeStore().store;
  assert.equal(other.trackUi("builder_opened", { entry: "pinned_bar", plan: "weekly", label: "Get my price", price: "$19.99" }), true);
  assert.deepEqual(paramsOf(other, "builder_opened"), [{ ui_version: UI, entry: "pinned_bar", step: "dogs" }]);
  assert.equal(lastRejected(other).dropped, 3);
  assert.equal(JSON.stringify(other.trackLog).includes("Get my price") || JSON.stringify(other.trackLog).includes("19.99"), false, "a dropped parameter leaves no trace but the count");
});

test("T21: the closing is counted by the engine in close(), once per counted opening, with the step it was closed on", async () => {
  const { store } = makeStore();
  // Nothing was reported as opened: closing counts nothing (an inline builder never opens or closes).
  assert.deepEqual(store.close(), { ok: true, reason: "", startedOver: false });
  assert.equal(store.trackUi("builder_closed"), true);
  assert.equal(count(store.trackLog, "builder_closed"), 0);

  store.set({ dogCount: "2" });
  store.next();
  store.trackUi("builder_opened", { entry: "hero_card" });
  assert.deepEqual(last(store.trackLog, "builder_opened").params, { ui_version: UI, entry: "hero_card", step: "zip" });
  assert.deepEqual(store.close(), { ok: true, reason: "", startedOver: false });
  assert.deepEqual(paramsOf(store, "builder_closed"), [{ ui_version: UI, step: "zip" }]);
  store.close();
  store.trackUi("builder_closed");
  assert.equal(count(store.trackLog, "builder_closed"), 1, "closed once");

  // Reopened from the pinned bar, closed on a request screen: the screen is named.
  store.trackUi("builder_opened", { entry: "pinned_bar" });
  toRequest(store);
  store.trackUi("request_step_viewed", { request_step: "who" });
  store.trackUi("request_step_completed", { request_step: "who" });
  store.trackUi("request_step_viewed", { request_step: "reach" });
  assert.equal(store.trackUi("builder_closed"), true, "an interface may report the closing itself");
  assert.deepEqual(last(store.trackLog, "builder_closed").params, { ui_version: UI, step: "request", request_step: "reach" });
  store.close();
  assert.equal(count(store.trackLog, "builder_closed"), 2, "reported and then closed through the engine: one closing");

  // Never while a request is being sent; from the done step it is counted before the new quote starts.
  store.trackUi("builder_opened", { entry: "summary_card" });
  fillDetails(store, "service_request", "text");
  store.next();
  const sending = store.submit();
  assert.equal(store.close().ok, false);
  assert.equal(count(store.trackLog, "builder_closed"), 2);
  assert.equal((await sending).ok, true);
  assert.deepEqual(store.close(), { ok: true, reason: "", startedOver: true });
  assert.deepEqual(last(store.trackLog, "builder_closed").params, { ui_version: UI, step: "done" });
  assert.equal(store.getState().step, "dogs");
  for (const entry of store.trackLog.filter((item) => /^builder_/.test(item.event))) assert.equal(entry.channel, "google");
  assert.equal(meta(store).some((entry) => /builder/.test(entry.event)), false, "no pixel event");
});

test("T21: closing through the page hooks is counted the same way", () => {
  const { store } = makeStore();
  const listeners = {};
  const page = {
    window: { location: fakeLocation("file:///G:/review/home.html"), history: { state: null, replaceState() {} } },
    document: { addEventListener(type, handler) { listeners[type] = handler; }, removeEventListener() {} }
  };
  let closed = 0;
  const hooks = core.installPageHooks(store, { open() { store.trackUi("builder_opened", { entry: "link" }); }, close() { closed += 1; } }, page);
  page.window.PurgeProsQuote.open({});
  assert.deepEqual(paramsOf(store, "builder_opened"), [{ ui_version: UI, entry: "link", step: "dogs" }]);
  assert.equal(hooks.close(), true);
  assert.equal(closed, 1);
  assert.deepEqual(paramsOf(store, "builder_closed"), [{ ui_version: UI, step: "dogs" }]);
  page.window.PurgeProsQuote.close();
  assert.equal(count(store.trackLog, "builder_closed"), 1);
  assert.deepEqual(names(store.trackLog), ["builder_opened", "builder_closed"], "neither is an answer: no funnel_viewed");
  hooks.uninstall();
});

/* ---- T22: contact_click and the pixel's Contact --------------------------------- */

test("T22: a contact link press sends contact_click to Google and the standard event Contact, with no parameter, to the pixel", () => {
  const { store } = makeStore();
  assert.equal(store.trackUi("contact_click", { method: "text", placement: "header" }), true);
  assert.deepEqual(store.trackLog.map((entry) => [entry.channel, entry.event, entry.params]), [
    ["google", "contact_click", { ui_version: UI, method: "text", placement: "header" }],
    ["meta", "Contact", {}]
  ]);
  assert.equal(store.trackLog[1].method, "track", "a standard pixel event");
  assert.equal(has(store.trackLog[1], "options"), false, "no event id");
  // Every method and placement on the lists.
  for (const method of core.EVENTS.trackUiValues.method) {
    for (const placement of core.EVENTS.trackUiValues.placement) {
      const page = makeStore().store;
      assert.equal(page.trackUi("contact_click", { method, placement }), true, method + " " + placement);
      assert.deepEqual(paramsOf(page, "contact_click"), [{ ui_version: UI, method, placement }]);
      assert.deepEqual(paramsOf(page, "Contact"), [{}]);
    }
  }
});

test("T22: Contact goes to the pixel at most once per page load; the same link pressed twice within a second is one press", () => {
  const { store, clock } = makeStore();
  store.trackUi("contact_click", { method: "call", placement: "footer" });
  store.trackUi("contact_click", { method: "call", placement: "footer" });
  clock.now += 999;
  store.trackUi("contact_click", { method: "call", placement: "footer" });
  assert.equal(count(google(store), "contact_click"), 1, "a double press");
  clock.now += 1;
  store.trackUi("contact_click", { method: "call", placement: "footer" });
  assert.equal(count(google(store), "contact_click"), 2, "a second later it is a new press");
  // A different link at once is its own press.
  store.trackUi("contact_click", { method: "text", placement: "footer" });
  store.trackUi("contact_click", { method: "email", placement: "closing" });
  assert.deepEqual(paramsOf(store, "contact_click").map((params) => params.method + "/" + params.placement), ["call/footer", "call/footer", "text/footer", "email/closing"]);
  assert.equal(count(meta(store), "Contact"), 1, "once per page load, whatever is pressed");
  assert.equal(store.reset(), true);
  clock.now += 5000;
  store.trackUi("contact_click", { method: "text", placement: "hero" });
  assert.equal(count(meta(store), "Contact"), 1, "a new quote is not a new page load");
});

test("T22: only the two fixed words travel: never the number, the address, the link or anything else", () => {
  const { store } = makeStore();
  assert.equal(store.trackUi("contact_click", { method: "call", placement: "hero", href: "tel:+13179615865", number: "(317) 961-5865", label: "Call Test Reviewer", email: "test@example.com", zip: "46032", value: 28.99 }), true);
  assert.deepEqual(paramsOf(store, "contact_click"), [{ ui_version: UI, method: "call", placement: "hero" }]);
  assert.deepEqual(paramsOf(store, "Contact"), [{}]);
  assert.equal(lastRejected(store).dropped, 6);
  const refused = makeStore().store;
  for (const bad of [undefined, {}, { method: "text" }, { placement: "header" }, { method: "sms", placement: "header" }, { method: "text", placement: "sidebar" }, { method: "tel:+13179615865", placement: "header" }, { method: "text", placement: "Test Reviewer" }, { method: ["text"], placement: "header" }]) {
    assert.equal(refused.trackUi("contact_click", bad), false, JSON.stringify(bad));
  }
  assert.deepEqual(refused.trackLog.filter((entry) => entry.channel !== "rejected"), [], "a refused press reaches no channel");
  const everything = JSON.stringify(store.trackLog) + JSON.stringify(refused.trackLog);
  for (const value of ["3179615865", "961-5865", "tel:", "Test", "Reviewer", "test@example.com", "46032", "28.99", "sidebar", "sms"]) assert.equal(everything.includes(value), false, "the event log holds " + value);
});

test("T22: a contact press is not an answer: no funnel_viewed, and a city page's ZIP is still counted on the first answer", () => {
  const { store } = makeStore({ options: { pageZip: "46074", pageCity: "Westfield" } });
  store.trackUi("contact_click", { method: "text", placement: "hero" });
  store.trackUi("builder_opened", { entry: "page_button" });
  store.trackUi("builder_closed");
  assert.deepEqual(names(store.trackLog), ["contact_click", "Contact", "builder_opened", "builder_closed"]);
  store.set({ dogCount: "2" });
  assert.deepEqual(names(store.trackLog).slice(4), ["service_area_eligible", "QuoteZipAccepted", "funnel_viewed", "QuoteFunnelViewed", "dog_count_selected"]);
  assert.equal(last(google(store), "service_area_eligible").params.entry, "city_page");
  assert.equal(count(google(store), "funnel_viewed"), 1);
});

test("T22 live: gtag gets contact_click, fbq gets track Contact with an empty object; the pixel can be off or late", () => {
  const page = offlineLivePage();
  assert.equal(page.store.trackUi("contact_click", { method: "text", placement: "menu" }), true);
  assert.deepEqual(page.calls.map((call) => [call.sink].concat(call.args)), [
    ["gtag", "event", "contact_click", { ui_version: UI, method: "text", placement: "menu" }],
    ["fbq", "track", "Contact", {}]
  ]);
  assert.ok(page.store.trackLog.every((entry) => entry.sent === true && entry.demo === false));
  assert.equal(JSON.stringify(page.calls).includes("AW-"), false, "the Google Ads label is not used");

  const off = offlineLivePage({ options: { firePixelEvents: false } });
  off.store.trackUi("contact_click", { method: "call", placement: "builder" });
  assert.deepEqual(off.calls.map((call) => call.sink), ["gtag"]);
  assert.equal(count(off.store.trackLog, "Contact"), 0);

  // The pixel loads after the first press: the next press still sends Contact, once.
  const late = [];
  const sinks = { gtag: (...args) => late.push(["gtag", args[1]]) };
  const waiting = offlineLivePage({ sinks });
  waiting.store.trackUi("contact_click", { method: "text", placement: "header" });
  assert.deepEqual(late, [["gtag", "contact_click"]]);
  sinks.fbq = (...args) => late.push(["fbq"].concat(args));
  waiting.store.trackUi("contact_click", { method: "email", placement: "footer" });
  waiting.store.trackUi("contact_click", { method: "call", placement: "footer" });
  assert.deepEqual(late.filter((call) => call[0] === "fbq"), [["fbq", "track", "Contact", {}]]);

  // No gtag on the page: the dataLayer gets it, as with every other event.
  const dataLayer = [];
  const layered = offlineLivePage({ sinks: { dataLayer } });
  layered.store.trackUi("contact_click", { method: "text", placement: "section" });
  assert.deepEqual(dataLayer, [{ event: "contact_click", ui_version: UI, method: "text", placement: "section" }]);
});

/* ---- every addition together ---------------------------------------------------- */

test("T16 to T22: trackUi takes the six names and nothing else, and track() takes none of them", () => {
  const { store } = makeStore();
  for (const name of core.EVENTS.engine.filter((item) => !core.EVENTS.trackUi.includes(item)).concat(core.EVENTS.ui, core.PIXEL_MILESTONES, core.EVENTS.pixelCounts, core.EVENTS.pixelStandard, ["Lead", "QuoteTexted", "Purchase", "made_up_event", "", "areas_selected", "frequency_selected"])) {
    assert.equal(store.trackUi(name, { method: "text", placement: "header", entry: "link", request_step: "who", fields: ["phone"], value: 1 }), false, "trackUi accepted " + name);
  }
  for (const bad of [undefined, null, 5, {}, ["contact_click"]]) assert.equal(store.trackUi(bad, { method: "text", placement: "header" }), false);
  for (const name of core.EVENTS.trackUi.concat(FUNNEL_NAMES, ["Contact"])) {
    assert.equal(store.track(name), false, "track() accepted " + name);
    assert.equal(store.track(name, { method: "text", placement: "header", entry: "link" }), false, name);
  }
  assert.deepEqual(store.trackLog.filter((entry) => entry.channel !== "rejected"), [], "a refused name reaches no channel");
  assert.ok(rejected(store).every((entry) => JSON.stringify(entry.params) === "{}" && entry.sent === false));
});

test("T16 to T22: a page that may not send (the staging rule, T11) calls no tag for any of them", async () => {
  const calls = [];
  const sinks = { gtag: (...args) => calls.push(args[1]), dataLayer: [], fbq: (...args) => calls.push(args[1]) };
  const blockedPages = [
    { url: "https://staging.offline.invalid/quote", options: {} },
    { url: "file:///G:/review/quote.html", options: {} },
    { url: "http://pages.offline.invalid/quote", options: { allowedOrigins: ["http://pages.offline.invalid"] } },
    { url: OFFLINE_PAGE, options: { endpoint: "http://relay.offline.invalid/submit" } }
  ];
  for (const page of blockedPages) {
    const { store, fetchCalls } = makeStore({ url: page.url, options: Object.assign({ mode: "live", endpoint: OFFLINE_ENDPOINT, allowedOrigins: [new URL(OFFLINE_PAGE).origin], sinks }, page.options) });
    assert.notEqual(store.sendingBlockedReason(), "", page.url);
    assert.deepEqual(reportEverything(store), [true, true, true, true, true, true], page.url);
    store.next();
    assert.deepEqual(calls, [], page.url + ": a tag was called");
    assert.deepEqual(sinks.dataLayer, [], page.url);
    assert.deepEqual(fetchCalls, [], page.url);
    // Each is written to the log for inspection, marked as not sent.
    for (const name of FUNNEL_NAMES.concat(["Contact"])) assert.ok(count(store.trackLog, name) >= 1, page.url + ": " + name + " is in the log");
    assert.ok(store.trackLog.every((entry) => entry.sent === false), page.url);
  }
});

test("T16 to T22 live, on a page that may send: each reaches gtag once, and the pixel hears only Contact from them", () => {
  const page = offlineLivePage();
  assert.deepEqual(reportEverything(page.store), [true, true, true, true, true, true]);
  page.store.next();
  for (const name of FUNNEL_NAMES) {
    const sent = page.sent("gtag", name);
    assert.ok(sent.length >= 1, name + " reached gtag");
    for (const call of sent) {
      assert.equal(call.args[0], "event");
      assert.deepEqual(Object.keys(call.args[2]).filter((key) => key !== "ui_version" && !core.EVENTS.measurementParams[name].includes(key)), [], name + " carries only its listed parameters");
    }
    assert.equal(page.sent("fbq", name).length, 0, name + " is not a pixel event");
  }
  assert.deepEqual(page.calls.filter((call) => call.sink === "fbq" && call.args[0] === "track").map((call) => call.args), [["track", "Contact", {}]]);
  for (const name of CONVERSION_NAMES) assert.equal(page.calls.filter((call) => call.args[1] === name).length, 0, name);
  assert.equal(JSON.stringify(page.calls).includes("AW-"), false);
});

test("T16 to T22 in demo mode: written to the in-page log and the console as every other event is, and to no tag", () => {
  const calls = [];
  const lines = [];
  const { store } = makeStore({ options: {
    sinks: { gtag: (...args) => calls.push(args), dataLayer: [], fbq: (...args) => calls.push(args) },
    console: { info: (...args) => lines.push(args), warn: (...args) => lines.push(args) }
  } });
  reportEverything(store);
  store.next();
  assert.deepEqual(calls, []);
  for (const name of FUNNEL_NAMES.concat(["Contact"])) {
    const channel = name === "Contact" ? "meta" : "google";
    const entries = store.trackLog.filter((entry) => entry.event === name);
    assert.ok(entries.length >= 1, name + " is in the log");
    for (const entry of entries) {
      assert.equal(entry.channel, channel);
      assert.equal(entry.demo, true);
      assert.equal(entry.sent, false);
      assert.equal(typeof entry.at, "string");
    }
    const written = lines.filter((args) => args[0] === "[PPQuoteCore demo] " + channel + " " + name);
    assert.equal(written.length, entries.length, name + " is written to the console once per event, in the usual form");
    assert.deepEqual(written[0][1], entries[0].params);
  }
});

test("T16 to T22: a whole visit with every moment reported changes nothing about Lead, generate_lead and conversion", async () => {
  const quiet = makeStore().store;
  toConfirm(quiet);
  const quietSent = await quiet.submit();

  const { store } = makeStore({ url: "https://review.example/westfield?utm_source=meta&utm_campaign=fall&fbclid=CLICK123" });
  store.trackUi("contact_click", { method: "text", placement: "header" });
  store.trackUi("builder_opened", { entry: "hero_card" });
  toRequest(store);
  for (const screen of ["who", "reach", "where"]) {
    store.trackUi("request_step_viewed", { request_step: screen });
    store.trackUi("form_validation_failed", { request_step: screen, fields: ["firstName", "phone", "address"] });
    store.next();
    store.trackUi("request_step_completed", { request_step: screen });
  }
  fillDetails(store, "service_request", "text");
  store.set({ termsAccepted: false });
  store.next();
  assert.equal((await store.submit()).status, "invalid");
  store.set({ termsAccepted: true });
  const before = store.trackLog.length;
  const sent = await store.submit();
  assert.equal(sent.ok, true);
  store.close();

  // The success events: the same names, in the same order, with the same parameters.
  const after = store.trackLog.slice(before);
  assert.deepEqual(names(after), ["service_requested", "generate_lead", "conversion", "Lead", "funnel_step_viewed", "builder_closed"]);
  const conversions = (log, id) => log.filter((entry) => CONVERSION_NAMES.includes(entry.event)).map((entry) => JSON.parse(JSON.stringify([entry.channel, entry.event, entry.method || "", entry.params, entry.options || null]).split(id).join("ID")));
  assert.deepEqual(conversions(store.trackLog, sent.requestId), conversions(quiet.trackLog, quietSent.requestId), "identical to a visit that reported nothing");
  for (const name of CONVERSION_NAMES) assert.equal(count(store.trackLog, name), 1, name + " exactly once");
  assert.deepEqual(last(meta(store), "Lead").params, { currency: "USD", value: 28.99 });
  assert.deepEqual(last(meta(store), "Lead").options, { eventID: sent.requestId + ":service_requested" });
  assert.deepEqual(meta(store).filter((entry) => entry.method === "track").map((entry) => entry.event), ["Contact", "Lead"], "the two standard pixel events, and Lead only for the service request");
  for (const milestone of core.PIXEL_MILESTONES.filter((name) => name !== "QuoteZipOutOfArea")) assert.equal(count(meta(store), milestone), 1, milestone);
  assert.equal(count(google(store), "funnel_viewed"), 1);

  // Nothing personal, no ZIP, no request id and no attribution in any of the additions.
  const additions = store.trackLog.filter((entry) => FUNNEL_NAMES.concat(["Contact"]).includes(entry.event));
  assert.ok(additions.length >= 14);
  const text = JSON.stringify(additions.map((entry) => [entry.params, entry.options]));
  for (const value of PERSONAL.concat(["460", sent.requestId, "CLICK123", "meta", "fall", "westfield"])) assert.equal(text.includes(value), false, "an added event carries " + value);
  for (const entry of additions) {
    assert.deepEqual(Object.keys(entry.params).filter((key) => key !== "ui_version" && !core.EVENTS.measurementParams[entry.event].includes(key)), [], entry.event);
    assert.equal(has(entry, "options"), false, entry.event + " has no event id");
  }
  assert.equal(JSON.stringify(meta(store).map((entry) => entry.params)).includes("460"), false, "no ZIP in a pixel event");
});

test("T16 to T22: the request sent to the Worker has exactly the keys and versions it had, and the Worker accepts it", async () => {
  const PAYLOAD_KEYS = ["schemaVersion", "requestId", "eventId", "stage", "intent", "zip", "dogs", "frequency", "frequencyId", "areas", "areaIds", "yardSize", "yardSizeId", "lastCleaned", "customerStatus", "startTiming", "perVisitPrice", "clientPriceCents", "pricingVersion", "customEstimate", "customReasons", "phone", "phoneE164", "firstName", "lastName", "email", "street", "city", "state", "preferredContact", "smsTransactionalConsent", "consent", "consentVersion", "smsConsentCapturedAt", "termsAccepted", "termsVersion", "termsAcceptedAt", "question", "notes", "page", "attribution", "gclid", "fbclid", "fbp", "fbc", "submittedAt", "website"];
  assert.deepEqual(plain(core.VERSIONS), {
    schemaVersion: "cloudflare-widget.v3", pricingVersion: "2026-08-cloudflare-v1", consentVersion: "service-sms-2026-08-v1", termsVersion: TERMS_VERSION,
    liveUiVersion: "2026-09-12-website-improvements-v1", uiVersion: "2026-10-07-site-rebuild-v5"
  });
  for (const [intent, contact] of [["service_request", "text"], ["quote_delivery", "email"], ["question", "email"]]) {
    const reported = makeStore().store;
    reported.trackUi("contact_click", { method: "call", placement: "hero" });
    reported.trackUi("builder_opened", { entry: "plan_button", plan: "weekly" });
    toRequest(reported, intent);
    reported.trackUi("request_step_viewed", { request_step: "who" });
    reported.trackUi("form_validation_failed", { request_step: "who", fields: ["firstName"] });
    fillDetails(reported, intent, contact);
    reported.next();
    reported.trackUi("request_step_completed", { request_step: "who" });
    const silent = makeStore().store;
    toConfirm(silent, intent, contact);
    const a = (await reported.submit()).payload;
    const b = (await silent.submit()).payload;
    assert.deepEqual(Object.keys(a), PAYLOAD_KEYS, intent);
    assert.deepEqual(a, b, intent + ": reporting moments changes nothing that is sent");
    assert.equal(worker.validateV3(a).ok, true, intent + " is accepted by the Worker's own validation");
    for (const key of PAYLOAD_KEYS) assert.equal(/method|entry|placement|request_step|areas_count/.test(key), false);
  }
});

test("T16 to T22: random calls with anything a page could pass never put a value outside the fixed lists into an event", () => {
  let seed = 20261009;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = (list) => list[Math.floor(random() * list.length)];
  const junk = ["Test", "Reviewer", "3175550100", "test@example.com", "123 Example St", "46032", "tel:+13179615865", "", " ", "who ", "TEXT", "header;footer", 7, null, true, ["phone"], { a: 1 }, "x".repeat(300)];
  const lists = core.EVENTS.trackUiValues;
  const anything = () => (random() < 0.55 ? pick([].concat(lists.entry, lists.plan, lists.request_step, lists.fields, lists.method, lists.placement)) : pick(junk));
  const allowedValues = new Set([].concat(lists.entry, lists.plan, lists.request_step, lists.method, lists.placement, core.STEPS, ["service_request", "quote_delivery", "question", "form", "server", UI]));
  for (let walk = 0; walk < 60; walk += 1) {
    const { store, clock } = makeStore();
    for (let turn = 0; turn < 80; turn += 1) {
      const roll = random();
      if (roll < 0.08) fillPlan(store);
      else if (roll < 0.14) store.goTo(pick(core.STEPS));
      else if (roll < 0.2) store.next();
      else if (roll < 0.24) store.close();
      else if (roll < 0.27) store.reset();
      else {
        const params = {};
        for (const key of ["entry", "plan", "request_step", "fields", "method", "placement", "step", "choice", "value", "phone", "form_step", "checked_by", "error_count"]) {
          if (random() < 0.45) params[key] = key === "fields" && random() < 0.6 ? [anything(), anything(), anything()] : anything();
        }
        store.trackUi(random() < 0.9 ? pick(core.EVENTS.trackUi) : anything(), params);
      }
      clock.now += Math.floor(random() * 1500);
    }
    let open = 0;
    for (const entry of store.trackLog) {
      if (entry.channel === "rejected") { assert.deepEqual(entry.params, {}); continue; }
      if (entry.event === "builder_opened") { open += 1; assert.equal(open, 1, "an opening is counted once until it is closed"); }
      if (entry.event === "builder_closed") { open -= 1; assert.equal(open, 0, "a closing only after a counted opening"); }
      if (!FUNNEL_NAMES.concat(["Contact"]).includes(entry.event)) continue;
      if (entry.event === "Contact") { assert.deepEqual(entry.params, {}); continue; }
      for (const key of Object.keys(entry.params)) {
        assert.ok(key === "ui_version" || core.EVENTS.measurementParams[entry.event].includes(key), entry.event + "." + key);
        const value = entry.params[key];
        if (key === "fields") assert.ok(value.split(",").every((item) => lists.fields.includes(item)), "fields: " + value);
        else if (key === "areas_count" || key === "error_count") assert.ok(Number.isInteger(value) && value >= 1 && value <= 19, key + ": " + value);
        else assert.ok(allowedValues.has(value), entry.event + "." + key + " = " + JSON.stringify(value));
      }
    }
    assert.ok(count(meta(store), "Contact") <= 1, "Contact at most once per page load");
    const everything = JSON.stringify(store.trackLog.filter((entry) => FUNNEL_NAMES.includes(entry.event) || entry.channel === "rejected"));
    for (const value of ["Reviewer", "3175550100", "test@example.com", "123 Example St", "13179615865", "xxxxxxxx"]) assert.equal(everything.includes(value), false, "walk " + walk + ": the log holds " + value);
  }
});
