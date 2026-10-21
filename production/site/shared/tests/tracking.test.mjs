// Analytics and pixel events (spec section 10 and 17.2 item 12).
// In demo mode nothing reaches a real tag: every would-be call is written to
// store.trackLog, which is what these tests read.
import test from "node:test";
import assert from "node:assert/strict";
import { core, makeStore, fillPlan, fillDetails, readyStore } from "./helpers/make-store.mjs";

const google = (store) => store.trackLog.filter((entry) => entry.channel === "google");
const meta = (store) => store.trackLog.filter((entry) => entry.channel === "meta");
// The GA4 twins of 2026-10-18 (channel "ga4") are tested in ga4-events.test.mjs; these sequences are the events sent before them.
const names = (entries) => entries.filter((entry) => entry.channel !== "ga4").map((entry) => entry.event);
const count = (entries, name) => entries.filter((entry) => entry.event === name).length;
const last = (entries, name) => entries.filter((entry) => entry.event === name).pop();

// Walks a complete service request up to the confirm step.
function toConfirm(store, intent, contact) {
  fillPlan(store);
  store.goTo("price");
  store.set({ intent: intent || "service_request" });
  store.next();
  fillDetails(store, intent || "service_request", contact || "text");
  store.next();
  return store;
}

test("demo mode never calls a real tag, even when tags are present", () => {
  const calls = [];
  const { store } = makeStore({ options: { sinks: { gtag: (...args) => calls.push(["gtag", args]), dataLayer: [], fbq: (...args) => calls.push(["fbq", args]) } } });
  fillPlan(store);
  store.goTo("price");
  assert.deepEqual(calls, []);
  assert.ok(store.trackLog.length > 0);
  assert.ok(store.trackLog.every((entry) => entry.demo === true && entry.sent === false));
});

test("TRACKING CHANGE 1: funnel_viewed fires on the first answer, once per page load, never on page load", () => {
  const { store } = makeStore();
  assert.deepEqual(store.trackLog, [], "nothing when the page loads");
  store.flow();
  store.frequencyOptions();
  store.priceBar();
  store.goTo("dogs");
  assert.deepEqual(store.trackLog, [], "looking is not answering");

  store.set({ dogCount: "2" });
  assert.deepEqual(names(store.trackLog), ["funnel_viewed", "QuoteFunnelViewed", "dog_count_selected"]);
  assert.deepEqual(store.trackLog[0].params, { ui_version: "2026-10-07-site-rebuild-v5", presentation: "inline" });
  assert.deepEqual(store.trackLog[1].params, store.trackLog[0].params);
  assert.equal(store.trackLog[1].method, "trackCustom");

  fillPlan(store, { dogCount: "3" });
  store.reset();
  store.set({ dogCount: "1" });
  assert.equal(count(google(store), "funnel_viewed"), 1, "once per page load, even after reset");
  assert.equal(count(meta(store), "QuoteFunnelViewed"), 1);
});

test("presentation: inline by default, as told by the page, or dedicated on the quote host", () => {
  const modal = makeStore({ options: { presentation: "modal" } }).store;
  modal.set({ dogCount: "1" });
  assert.equal(last(google(modal), "funnel_viewed").params.presentation, "modal");
  const dedicated = makeStore({ url: "https://quote.itspurgepros.com/" }).store;
  dedicated.set({ dogCount: "1" });
  assert.equal(last(google(dedicated), "funnel_viewed").params.presentation, "dedicated");
});

test("TRACKING CHANGE 2: a city page's own ZIP is counted on the first answer, with entry city_page", () => {
  const { store } = makeStore({ options: { pageZip: "46074" } });
  assert.deepEqual(store.trackLog, [], "a pre-filled ZIP is not a milestone on page load");
  store.set({ dogCount: "2" });
  assert.deepEqual(names(store.trackLog), ["service_area_eligible", "QuoteZipAccepted", "funnel_viewed", "QuoteFunnelViewed", "dog_count_selected"]);
  assert.deepEqual(store.trackLog[0].params, { ui_version: "2026-10-07-site-rebuild-v5", zip_prefix: "460", entry: "city_page" });
  assert.deepEqual(store.trackLog[1].params, { ui_version: "2026-10-07-site-rebuild-v5" }, "no ZIP detail in the pixel event");
  // Never counted twice.
  store.set({ yardSize: "s" });
  store.set({ zip: "46074" });
  assert.equal(count(google(store), "service_area_eligible"), 1);
});

test("a city page visitor who types a different ZIP first is counted for the ZIP they typed", () => {
  const { store } = makeStore({ options: { pageZip: "46074" } });
  store.set({ zip: "46201" });
  assert.deepEqual(names(google(store)), ["funnel_viewed", "service_area_ineligible"]);
  assert.equal(last(google(store), "service_area_ineligible").params.entry, undefined);
  assert.equal(count(google(store), "service_area_eligible"), 0, "the page's ZIP was never the visitor's");
});

test("a ZIP handed over on purpose (?zip= or open({ zip })) is counted at once, as the live tool does", () => {
  const url = makeStore({ url: "https://review.example/?zip=46032" }).store;
  assert.deepEqual(names(url.trackLog), ["service_area_eligible", "QuoteZipAccepted", "funnel_viewed", "QuoteFunnelViewed"]);
  assert.deepEqual(url.trackLog[0].params, { ui_version: "2026-10-07-site-rebuild-v5", zip_prefix: "460", entry: "hero_zip" });
  assert.equal(url.trackLog.filter((entry) => entry.channel !== "ga4")[2].params.presentation, "hero_zip");   // funnel_viewed: the third event, the GA4 twins left out
  url.set({ dogCount: "2" });
  assert.equal(count(google(url), "funnel_viewed"), 1);
  assert.equal(count(google(url), "service_area_eligible"), 1);

  const opened = makeStore().store;
  opened.open({ zip: "46201" });
  assert.deepEqual(names(opened.trackLog), ["service_area_ineligible", "QuoteZipOutOfArea", "funnel_viewed", "QuoteFunnelViewed"]);
  assert.equal(opened.trackLog[0].params.entry, "hero_zip");
  // The same ZIP handed over again is not counted again.
  opened.open({ zip: "46201" });
  assert.equal(count(google(opened), "service_area_ineligible"), 1);
  // open() with no ZIP, or with something that is not a ZIP, counts nothing.
  const plain = makeStore().store;
  plain.open();
  plain.open({});
  plain.open({ zip: "abc" });
  assert.deepEqual(plain.trackLog, []);
});

test("typed ZIPs: the 3-digit prefix to Google only, nothing of the ZIP to the pixel, each milestone once", () => {
  const { store } = makeStore();
  store.set({ dogCount: "2" });
  store.set({ zip: "4603" });
  assert.equal(count(google(store), "service_area_eligible"), 0, "nothing until five digits");
  store.set({ zip: "46032" });
  assert.deepEqual(last(google(store), "service_area_eligible").params, { ui_version: "2026-10-07-site-rebuild-v5", zip_prefix: "460" });
  store.set({ zip: "46201" });
  assert.deepEqual(last(google(store), "service_area_ineligible").params, { ui_version: "2026-10-07-site-rebuild-v5", zip_prefix: "462" });
  store.set({ zip: "46123" });
  store.set({ zip: "46123" });
  assert.equal(count(google(store), "service_area_eligible"), 2, "each newly accepted ZIP is reported to Google once");
  assert.equal(count(google(store), "service_area_ineligible"), 1);
  assert.equal(count(meta(store), "QuoteZipAccepted"), 1, "the pixel milestone is once per page load");
  assert.equal(count(meta(store), "QuoteZipOutOfArea"), 1);
  for (const entry of meta(store)) {
    assert.equal(JSON.stringify(entry.params).includes("46"), false, "pixel payload carries no ZIP or prefix: " + JSON.stringify(entry));
    assert.equal(Object.prototype.hasOwnProperty.call(entry.params, "zip_prefix"), false);
  }
  for (const entry of store.trackLog) {
    assert.equal(/\b46\d{3}\b/.test(JSON.stringify(entry.params)), false, "no full ZIP anywhere: " + JSON.stringify(entry));
  }
});

test("dog count and yard size selections are reported", () => {
  const { store } = makeStore();
  store.set({ dogCount: "10" });
  assert.deepEqual(last(google(store), "dog_count_selected").params, { ui_version: "2026-10-07-site-rebuild-v5", dogs: 10 });
  store.set({ dogCount: "10" });
  assert.equal(count(google(store), "dog_count_selected"), 1, "not when nothing changed");
  store.set({ dogCount: "3" });
  assert.equal(count(google(store), "dog_count_selected"), 2);
  store.set({ yardSize: "m" });
  assert.deepEqual(last(google(store), "yard_size_selected").params, { ui_version: "2026-10-07-site-rebuild-v5", yard_size: "m" });
  // The live tool tracks neither areas nor frequency (spec 10.2). Since
  // 2026-10-09 the engine counts both (T17 and T18, funnel-events.test.mjs):
  // the areas once the visitor moves on with them, the frequency when chosen.
  const before = store.trackLog.length;
  store.set({ areas: ["back"] });
  assert.equal(store.trackLog.length, before, "a tile tap alone counts nothing");
  store.set({ frequency: "weekly" });
  assert.deepEqual(names(store.trackLog.slice(before)), ["areas_selected", "frequency_selected"]);
});

test("price_viewed: the first time the final price for a plan shows, with its value", () => {
  const { store } = makeStore();
  fillPlan(store);
  assert.equal(count(google(store), "price_viewed"), 0, "not while answering questions");
  store.goTo("price");
  assert.deepEqual(last(google(store), "price_viewed").params, { ui_version: "2026-10-07-site-rebuild-v5", frequency: "weekly", custom: false, value: 28.99 });
  assert.deepEqual(last(meta(store), "QuotePriceViewed").params, { ui_version: "2026-10-07-site-rebuild-v5", frequency: "weekly", value: 28.99, currency: "USD" });
  // price_viewed comes just before the step event, as it does live.
  const order = names(google(store));
  assert.equal(order.indexOf("price_viewed") + 1, order.lastIndexOf("funnel_step_viewed"));

  // Coming back to the same price does not count again.
  store.next();
  store.back();
  assert.equal(count(google(store), "price_viewed"), 1);
  // A changed plan is a new price.
  store.edit("dogs");
  store.set({ dogCount: "3" });
  store.next();
  assert.equal(count(google(store), "price_viewed"), 2);
  assert.equal(last(google(store), "price_viewed").params.value, 31.49);
  assert.equal(count(meta(store), "QuotePriceViewed"), 1, "the pixel milestone stays at once per page load");

  // A custom estimate has no value.
  const custom = makeStore().store;
  fillPlan(custom, { frequency: "custom" });
  custom.goTo("price");
  assert.deepEqual(last(google(custom), "price_viewed").params, { ui_version: "2026-10-07-site-rebuild-v5", frequency: "custom", custom: true });
  assert.deepEqual(last(meta(custom), "QuotePriceViewed").params, { ui_version: "2026-10-07-site-rebuild-v5", frequency: "custom" });
});

test("step events keep the live step numbers by meaning: 3 price, 4 request, 5 confirm, 6 done", async () => {
  const { store } = makeStore();
  toConfirm(store);
  const steps = () => google(store).filter((entry) => entry.event === "funnel_step_viewed").map((entry) => entry.params.step);
  assert.deepEqual(steps(), [3, 4, 5]);
  assert.deepEqual(core.LEGACY_STEP_NUMBER, { price: 3, request: 4, confirm: 5, done: 6 });
  // Going back and forward reports each move, as the live tool does...
  store.back();
  store.back();
  store.next();
  store.next();
  assert.deepEqual(steps(), [3, 4, 5, 4, 3, 4, 5]);
  // ...but each pixel milestone only once per page load.
  assert.equal(count(meta(store), "QuoteDetailsViewed"), 1);
  assert.equal(count(meta(store), "QuoteReviewViewed"), 1);
  assert.deepEqual(last(meta(store), "QuoteDetailsViewed").params, { ui_version: "2026-10-07-site-rebuild-v5" });
  // The plan questions have their own events and send no step numbers.
  assert.equal(steps().includes(1) || steps().includes(2), false);
  store.set({ termsAccepted: true });
  await store.submit();
  assert.deepEqual(steps().slice(-1), [6]);
});

test("the five pixel milestones fire at most once each per page load", async () => {
  const { store } = makeStore();
  store.set({ dogCount: "2" });
  store.set({ zip: "46201" });
  store.set({ zip: "46032" });
  store.set({ zip: "46033" });
  store.set({ yardSize: "m", areas: ["back"], frequency: "weekly" });
  for (let round = 0; round < 3; round += 1) {
    store.goTo("price");
    store.goTo("request");
    fillDetails(store, "service_request", "text");
    store.goTo("confirm");
    store.edit("dogs");
    store.set({ dogCount: String(2 + round) });
    store.goTo("frequency");
  }
  for (const milestone of core.PIXEL_MILESTONES) assert.equal(count(meta(store), milestone), 1, milestone);
  assert.deepEqual(core.PIXEL_MILESTONES, ["QuoteZipAccepted", "QuoteZipOutOfArea", "QuotePriceViewed", "QuoteDetailsViewed", "QuoteReviewViewed"]);
});

test("a design that shows request and confirm on one screen reports the steps itself", () => {
  const { store } = makeStore();
  assert.equal(store.reportStepShown("request"), false, "not before the plan is complete");
  fillPlan(store);
  assert.equal(store.reportStepShown("dogs"), false, "only price, request and confirm");
  assert.equal(store.reportStepShown("request"), true);
  assert.equal(store.reportStepShown("confirm"), true);
  assert.equal(store.reportStepShown("confirm"), true);
  assert.deepEqual(google(store).filter((entry) => entry.event === "funnel_step_viewed").map((entry) => entry.params.step), [4, 5]);
  assert.equal(count(meta(store), "QuoteDetailsViewed"), 1);
  assert.equal(count(meta(store), "QuoteReviewViewed"), 1);
});

test("a successful SERVICE request fires the stage event, generate_lead, conversion and Lead once, with the shared event id", async () => {
  const { store } = makeStore();
  toConfirm(store);
  const before = store.trackLog.length;
  const result = await store.submit();
  assert.equal(result.ok, true);
  const after = store.trackLog.slice(before);
  assert.deepEqual(names(after), ["service_requested", "generate_lead", "conversion", "Lead", "funnel_step_viewed"]);
  const eventId = result.requestId + ":service_requested";
  assert.equal(result.payload.eventId, eventId, "the same id the Worker uses for its server-side Lead");
  const expected = { event_id: eventId, transaction_id: result.requestId, intent: "service_request", frequency: "weekly", currency: "USD", value: 28.99 };
  assert.deepEqual(after[0].params, Object.assign({ ui_version: "2026-10-07-site-rebuild-v5" }, expected));
  assert.deepEqual(after[1].params, expected);
  assert.deepEqual(after[2].params, Object.assign({}, expected, { send_to: "AW-17767139897/g9smCM7pkL4cELmUhJhC", transport_type: "beacon" }));
  assert.equal(after[3].channel, "meta");
  assert.equal(after[3].method, "track");
  assert.deepEqual(after[3].params, { currency: "USD", value: 28.99 });
  assert.deepEqual(after[3].options, { eventID: eventId });
  assert.deepEqual(after[4].params, { ui_version: "2026-10-07-site-rebuild-v5", step: 6 });
  for (const name of ["generate_lead", "conversion", "Lead"]) assert.equal(count(store.trackLog, name), 1, name + " exactly once");
});

test("a custom estimate request is a lead without a value", async () => {
  const { store } = makeStore();
  fillPlan(store, { dogCount: "10", frequency: "custom" });
  store.goTo("request");
  fillDetails(store, "service_request", "call");
  const result = await store.submit();
  assert.equal(result.payload.stage, "estimate_requested");
  const stage = last(google(store), "estimate_requested");
  assert.equal(stage.params.event_id, result.requestId + ":estimate_requested");
  assert.equal(Object.prototype.hasOwnProperty.call(stage.params, "value"), false);
  assert.deepEqual(last(meta(store), "Lead").params, { currency: "USD" });
  assert.equal(count(google(store), "generate_lead"), 1);
  assert.equal(count(google(store), "conversion"), 1);
});

test("a quote delivery or a question fires its stage event and no conversion: no Lead, no generate_lead, no conversion", async () => {
  for (const [intent, stage] of [["quote_delivery", "quote_requested"], ["question", "question_submitted"]]) {
    const { store } = makeStore();
    fillPlan(store);
    store.goTo("request");
    fillDetails(store, intent, "email");
    const result = await store.submit(intent);
    assert.equal(result.ok, true, intent);
    assert.equal(count(google(store), stage), 1, intent);
    assert.equal(last(google(store), stage).params.intent, intent);
    for (const name of ["generate_lead", "conversion", "Lead"]) assert.equal(count(store.trackLog, name), 0, intent + " must not fire " + name);
  }
});

test("a failed or locked submit fires no conversion events at all", async () => {
  for (const outcome of ["invalid", "uncertain", "conflict", "unavailable", "timeout", "network", "forbidden"]) {
    const { store } = makeStore({ options: { demo: { submit: outcome } } });
    toConfirm(store);
    const before = store.trackLog.length;
    const result = await store.submit();
    assert.equal(result.ok, false, outcome);
    // A server reply that refuses fields is counted as a failed attempt (T20). Nothing else fires.
    assert.deepEqual(names(store.trackLog.slice(before)), outcome === "invalid" ? ["form_validation_failed"] : [], outcome + " fired events");
  }
});

test("no personal data and no full ZIP appears in any event of a complete request", async () => {
  const { store } = makeStore({ url: "https://review.example/?zip=46032&utm_source=meta" });
  toConfirm(store);
  store.track("yard_size_help_opened");
  store.track("promotion_details_viewed", { promotion: "No start-up fee", zip: "46032", email: "test@example.com", phone: "3175550100", firstName: "Test" });
  await store.submit();
  const everything = JSON.stringify(store.trackLog);
  for (const value of ["Test", "Reviewer", "3175550100", "555-0100", "test@example.com", "123 Example St", "Carmel", "46032"]) {
    assert.equal(everything.includes(value), false, "events contain " + value);
  }
  assert.deepEqual(last(google(store), "promotion_details_viewed").params, { ui_version: "2026-10-07-site-rebuild-v5", promotion: "No start-up fee" });
});

test("an interface may fire only the two events the engine cannot see", () => {
  const { store } = makeStore();
  assert.deepEqual(core.EVENTS.ui, ["yard_size_help_opened", "promotion_details_viewed"]);
  assert.equal(store.track("yard_size_help_opened"), true);
  assert.deepEqual(last(google(store), "yard_size_help_opened").params, { ui_version: "2026-10-07-site-rebuild-v5" });
  for (const name of ["generate_lead", "conversion", "Lead", "funnel_viewed", "price_viewed", "service_requested", "dog_count_selected", "made_up_event"]) {
    assert.equal(store.track(name, { value: 1 }), false, name);
  }
  // funnel_viewed came first: opening the yard guide was this visitor's first action.
  assert.deepEqual(names(google(store)), ["funnel_viewed", "yard_size_help_opened"], "nothing else reached the Google channel");
  assert.deepEqual(names(meta(store)), ["QuoteFunnelViewed"]);
  assert.equal(store.trackLog.filter((entry) => entry.channel === "rejected").length, 8);
});

test("live mode: gtag when present, dataLayer otherwise, fbq for the pixel", async () => {
  const gtagCalls = [];
  const fbqCalls = [];
  const live = makeStore({
    url: "https://itspurgepros.com/",
    options: {
      mode: "live", endpoint: "https://purge-lead-relay.purgepros.workers.dev/submit",
      sinks: { gtag: (...args) => gtagCalls.push(args), dataLayer: [], fbq: (...args) => fbqCalls.push(args) },
      fetch: async (url,init) => ({ ok: true, status: 202, text: async () => JSON.stringify({ accepted: true, requestId:JSON.parse(init.body).requestId }) })
    }
  }).store;
  toConfirm(live);
  assert.deepEqual(gtagCalls[0], ["event", "funnel_viewed", { ui_version: "2026-10-07-site-rebuild-v5", presentation: "inline" }]);
  assert.deepEqual(fbqCalls[0], ["trackCustom", "QuoteFunnelViewed", { ui_version: "2026-10-07-site-rebuild-v5", presentation: "inline" }]);
  assert.ok(live.trackLog.every((entry) => entry.sent === true && entry.demo === false));
  const result = await live.submit();
  assert.equal(result.ok, true);
  assert.equal(result.requestId, "test-id-0001");
  const sentNames = gtagCalls.map((call) => call[1]);
  assert.deepEqual(sentNames.slice(-4), ["service_requested", "generate_lead", "conversion", "funnel_step_viewed"]);
  assert.deepEqual(fbqCalls[fbqCalls.length - 1], ["track", "Lead", { currency: "USD", value: 28.99 }, { eventID: "test-id-0001:service_requested" }]);

  // No gtag: events go to dataLayer; "conversion" is gtag-only, as in the live tool.
  const dataLayer = [];
  const layered = makeStore({
    url: "https://itspurgepros.com/",
    options: {
      mode: "live", endpoint: "https://purge-lead-relay.purgepros.workers.dev/submit",
      sinks: { dataLayer },
      fetch: async (url,init) => ({ ok: true, status: 202, text: async () => JSON.stringify({accepted:true,requestId:JSON.parse(init.body).requestId}) })
    }
  }).store;
  toConfirm(layered);
  assert.deepEqual(dataLayer[0], { event: "funnel_viewed", ui_version: "2026-10-07-site-rebuild-v5", presentation: "inline" });
  await layered.submit();
  assert.ok(dataLayer.some((entry) => entry.event === "generate_lead"));
  assert.equal(dataLayer.some((entry) => entry.event === "conversion"), false);
  assert.equal(layered.trackLog.some((entry) => entry.channel === "meta"), false, "no fbq, so no pixel entries");
});

test("live mode: a pixel milestone waits for the pixel instead of being lost", () => {
  const sinks = {};
  const fbqCalls = [];
  const { store } = makeStore({ url: "https://itspurgepros.com/", options: { mode: "live", endpoint: "https://purge-lead-relay.purgepros.workers.dev/submit", sinks } });
  store.set({ dogCount: "2" });
  store.set({ zip: "46032" });
  assert.equal(fbqCalls.length, 0);
  // The pixel loads later; the next accepted ZIP can still mark the milestone.
  sinks.fbq = (...args) => fbqCalls.push(args);
  store.set({ zip: "46033" });
  assert.deepEqual(fbqCalls, [["trackCustom", "QuoteZipAccepted", { ui_version: "2026-10-07-site-rebuild-v5" }]]);
  store.set({ zip: "46037" });
  assert.equal(fbqCalls.length, 1);
});

test("pixel events can be switched off; the Google Ads label can be changed or removed", async () => {
  const off = makeStore({ options: { firePixelEvents: false } }).store;
  toConfirm(off);
  await off.submit();
  assert.equal(meta(off).length, 0);
  assert.equal(count(google(off), "generate_lead"), 1);

  const noAds = makeStore({ options: { googleAdsSendTo: "" } }).store;
  toConfirm(noAds);
  await noAds.submit();
  assert.equal(count(google(noAds), "conversion"), 0);
  assert.equal(count(google(noAds), "generate_lead"), 1);

  const custom = makeStore({ options: { uiVersion: "review-build-7" } }).store;
  custom.set({ dogCount: "1" });
  assert.ok(google(custom).every((entry) => entry.params.ui_version === "review-build-7"));
});

test("opening a saved plan fires no price_viewed and no conversion events", async () => {
  const { store } = makeStore();
  const result = await store.resume("r".repeat(43));
  assert.equal(result.ok, true);
  assert.equal(store.getState().step, "price");
  assert.deepEqual(store.trackLog, []);
  // Moving on from the resumed price behaves normally. It is this visitor's
  // first action on the page, so funnel_viewed comes first. Moving on with
  // "Request service" selected is also their choice of a way forward (T15),
  // counted before the request form's step event.
  store.next();
  assert.deepEqual(names(google(store)), ["funnel_viewed", "price_choice_selected", "funnel_step_viewed"]);
  store.back();
  assert.equal(count(google(store), "price_viewed"), 0, "the resumed price itself is never counted as viewed");
});

/* ==========================================================================
 * The three measurement events the owner approved on 2026-10-09
 * (CORE-API.md section 8, rows T13 to T15). None of them is a conversion.
 *   T13  QuoteSent              pixel custom event, an accepted quote delivery
 *                               (named QuoteTexted until engine 1.4.0; it also
 *                               fires for a quote sent by email)
 *   T14  quote_link_saved       Google, with the pixel custom event QuoteLinkSaved
 *   T15  price_choice_selected  Google only, the way forward chosen on the price step
 * Live-mode stores below use addresses under .invalid, stand-in tags and a
 * stand-in server: nothing here can reach a real address.
 * ======================================================================== */

const UI = "2026-10-07-site-rebuild-v5";
const OFFLINE_PAGE = "https://pages.offline.invalid/quote";
const OFFLINE_ENDPOINT = "https://relay.offline.invalid/submit";
const MEASUREMENT_NAMES = ["QuoteSent", "quote_link_saved", "QuoteLinkSaved", "price_choice_selected"];
const CONVERSION_NAMES = ["Lead", "generate_lead", "conversion"];
// Everything fillDetails() types into the form, and the ZIPs these tests use.
const PERSONAL = ["Test", "Reviewer", "3175550100", "555-0100", "test@example.com", "123 Example St", "Carmel", "Is this only a test question?", "46032", "46201"];
const plain = (value) => JSON.parse(JSON.stringify(value));
const choices = (store) => google(store).filter((entry) => entry.event === "price_choice_selected").map((entry) => entry.params.choice);

// A live-mode store on an origin that may send, with tags and a server that
// only record what they are given.
function offlineLivePage(setup) {
  const config = setup || {};
  const calls = [];
  const requests = [];
  const sinks = config.sinks || {
    gtag: (...args) => calls.push({ sink: "gtag", args }),
    fbq: (...args) => calls.push({ sink: "fbq", args })
  };
  const made = makeStore({
    url: config.url || OFFLINE_PAGE,
    options: Object.assign({
      mode: "live", endpoint: OFFLINE_ENDPOINT, allowedOrigins: [new URL(OFFLINE_PAGE).origin], sinks,
      fetch: async (url, init) => {
        requests.push(url);
        if (/\/quote-resume$/.test(url)) return { ok: true, status: 201, text: async () => JSON.stringify({ ok: true, url: "https://quote.itspurgepros.com/#resume=" + String(requests.length).padStart(43, "s"), expiresAt: 0 }) };
        return { ok: true, status: 202, text: async () => JSON.stringify({ accepted: true, requestId: JSON.parse(init.body).requestId }) };
      }
    }, config.options || {})
  });
  made.calls = calls;
  made.requests = requests;
  made.sent = (sink, name) => calls.filter((call) => call.sink === sink && call.args[1] === name);
  return made;
}

/* ---- T13: QuoteSent ------------------------------------------------------ */

test("T13: an accepted quote delivery is counted by the pixel as the custom event QuoteSent, once, right after its stage event", async () => {
  const { store } = makeStore();
  toConfirm(store, "quote_delivery", "text");
  const before = store.trackLog.length;
  const result = await store.submit();
  assert.equal(result.ok, true);
  assert.equal(result.payload.intent, "quote_delivery");
  const after = store.trackLog.slice(before);
  assert.deepEqual(names(after), ["quote_requested", "QuoteSent", "funnel_step_viewed"]);
  // The Google stage event is what it was, and now says how the quote was sent (T16).
  const eventId = result.requestId + ":quote_requested";
  assert.equal(after[0].channel, "google");
  assert.deepEqual(after[0].params, { ui_version: UI, event_id: eventId, transaction_id: result.requestId, intent: "quote_delivery", frequency: "weekly", currency: "USD", value: 28.99, method: "text" });
  // The pixel event: custom, with the allow-listed parameters and nothing else.
  assert.equal(after[1].channel, "meta");
  assert.equal(after[1].method, "trackCustom", "a custom event, never a standard one");
  assert.deepEqual(after[1].params, { ui_version: UI, frequency: "weekly", value: 28.99, currency: "USD", method: "text" });
  assert.equal(Object.prototype.hasOwnProperty.call(after[1], "options"), false, "no event id: there is no server copy to pair it with");
  assert.equal(after[1].demo, true);
  assert.equal(after[1].sent, false);
  assert.equal(count(store.trackLog, "QuoteSent"), 1);
  // It is never Lead, and it brings no conversion with it.
  for (const name of CONVERSION_NAMES) assert.equal(count(store.trackLog, name), 0, "a texted quote must not fire " + name);
  assert.equal(meta(store).some((entry) => entry.method === "track"), false, "no standard pixel event in a texted-quote session");
});

test("T13: by email too; never for a question, a service request or a custom estimate; never when the request is not accepted", async () => {
  const byEmail = makeStore().store;
  toConfirm(byEmail, "quote_delivery", "email");
  assert.equal((await byEmail.submit()).ok, true);
  assert.equal(count(meta(byEmail), "QuoteSent"), 1, "the intent decides, not the reply method");

  const question = makeStore().store;
  toConfirm(question, "question", "email");
  assert.equal((await question.submit()).ok, true);
  assert.equal(count(google(question), "question_submitted"), 1);
  assert.equal(count(question.trackLog, "QuoteSent"), 0);

  // A service request: the conversion events are exactly what they were, in the same order.
  const service = makeStore().store;
  toConfirm(service);
  const before = service.trackLog.length;
  const sent = await service.submit();
  assert.equal(sent.ok, true);
  const after = service.trackLog.slice(before);
  assert.deepEqual(names(after), ["service_requested", "generate_lead", "conversion", "Lead", "funnel_step_viewed"]);
  const eventId = sent.requestId + ":service_requested";
  const expected = { event_id: eventId, transaction_id: sent.requestId, intent: "service_request", frequency: "weekly", currency: "USD", value: 28.99 };
  assert.deepEqual(after[1].params, expected);
  assert.deepEqual(after[2].params, Object.assign({}, expected, { send_to: "AW-17767139897/g9smCM7pkL4cELmUhJhC", transport_type: "beacon" }));
  assert.equal(after[3].method, "track");
  assert.deepEqual(after[3].params, { currency: "USD", value: 28.99 });
  assert.deepEqual(after[3].options, { eventID: eventId });
  assert.equal(count(service.trackLog, "QuoteSent"), 0);

  const custom = makeStore().store;
  fillPlan(custom, { dogCount: "10", frequency: "custom" });
  custom.goTo("price");
  custom.next();
  fillDetails(custom, "service_request", "call");
  assert.equal((await custom.submit()).payload.stage, "estimate_requested");
  assert.equal(count(custom.trackLog, "QuoteSent"), 0);

  for (const outcome of ["invalid", "uncertain", "conflict", "unavailable", "timeout", "network", "forbidden"]) {
    const { store } = makeStore({ options: { demo: { submit: outcome } } });
    toConfirm(store, "quote_delivery", "text");
    const logged = store.trackLog.length;
    assert.equal((await store.submit()).ok, false, outcome);
    assert.deepEqual(names(store.trackLog.slice(logged)), outcome === "invalid" ? ["form_validation_failed"] : [], outcome + " fired events");
    assert.equal(count(store.trackLog, "QuoteSent"), 0, outcome);
  }
});

test("T13: once per accepted request: a retry that gets through counts once, a second request counts again", async () => {
  const { store } = makeStore({ options: { demo: { submit: "timeout" } } });
  toConfirm(store, "quote_delivery", "text");
  const failed = await store.submit();
  assert.equal(failed.ok, false);
  assert.equal(count(store.trackLog, "QuoteSent"), 0);
  store.demo.submit = "success";
  const retried = await store.submit();
  assert.equal(retried.ok, true);
  assert.equal(retried.requestId, failed.requestId, "the retry is the same request");
  assert.equal(count(store.trackLog, "QuoteSent"), 1);
  assert.equal((await store.submit()).ok, false, "a finished request cannot be sent again");
  assert.equal(count(store.trackLog, "QuoteSent"), 1);

  // A new quote on the same page load is a new request.
  assert.equal(store.reset(), true);
  toConfirm(store, "quote_delivery", "email");
  const second = await store.submit();
  assert.equal(second.ok, true);
  assert.notEqual(second.requestId, retried.requestId);
  assert.equal(count(store.trackLog, "QuoteSent"), 2);
  assert.equal(count(google(store), "quote_requested"), 2);
  for (const name of CONVERSION_NAMES) assert.equal(count(store.trackLog, name), 0, name);
});

test("T13 live: fbq gets trackCustom QuoteSent once, gtag gets the stage event, and neither gets a conversion", async () => {
  const page = offlineLivePage();
  toConfirm(page.store, "quote_delivery", "text");
  const result = await page.store.submit();
  assert.equal(result.ok, true);
  assert.deepEqual(page.sent("fbq", "QuoteSent").map((call) => call.args), [["trackCustom", "QuoteSent", { ui_version: UI, frequency: "weekly", value: 28.99, currency: "USD", method: "text" }]]);
  assert.equal(page.sent("gtag", "quote_requested").length, 1);
  assert.equal(page.calls.filter((call) => call.sink === "gtag" && call.args[1] === "QuoteSent").length, 0, "the pixel event is not sent to Google");
  for (const name of CONVERSION_NAMES) assert.equal(page.calls.filter((call) => call.args[1] === name).length, 0, name + " reached a tag");
  assert.ok(page.calls.filter((call) => call.sink === "fbq").every((call) => call.args[0] === "trackCustom"), "only custom pixel events in a texted-quote session");
  assert.equal(JSON.stringify(page.calls).includes("AW-"), false, "the Google Ads label is not used");
  assert.equal(last(meta(page.store), "QuoteSent").sent, true);
  const everything = JSON.stringify(page.calls) + JSON.stringify(page.store.trackLog);
  for (const value of PERSONAL) assert.equal(everything.includes(value), false, "an event carries " + value);
  assert.deepEqual(page.requests, [OFFLINE_ENDPOINT], "one request, to the stand-in server");

  // Pixel events switched off, or the pixel not on the page: the request still succeeds, quietly.
  const off = offlineLivePage({ options: { firePixelEvents: false } });
  toConfirm(off.store, "quote_delivery", "text");
  assert.equal((await off.store.submit()).ok, true);
  assert.equal(off.calls.filter((call) => call.sink === "fbq").length, 0);
  assert.equal(count(off.store.trackLog, "QuoteSent"), 0);
  assert.equal(off.sent("gtag", "quote_requested").length, 1);
  const gtagCalls = [];
  const noPixel = offlineLivePage({ sinks: { gtag: (...args) => gtagCalls.push(args) } });
  toConfirm(noPixel.store, "quote_delivery", "text");
  assert.equal((await noPixel.store.submit()).ok, true);
  assert.equal(count(noPixel.store.trackLog, "QuoteSent"), 0);
  assert.equal(gtagCalls.filter((args) => args[1] === "quote_requested").length, 1);
});

/* ---- T14: quote_link_saved and QuoteLinkSaved ------------------------------- */

test("T14: a created save link is counted once on each sink, with nothing but the version label", async () => {
  // The whole request form is filled in, to prove none of it rides along.
  const { store } = readyStore();
  const before = store.trackLog.length;
  const result = await store.createSaveLink();
  assert.equal(result.ok, true);
  const after = store.trackLog.slice(before);
  assert.deepEqual(names(after), ["quote_link_saved", "QuoteLinkSaved"]);
  assert.equal(after[0].channel, "google");
  assert.deepEqual(after[0].params, { ui_version: UI });
  assert.equal(after[1].channel, "meta");
  assert.equal(after[1].method, "trackCustom");
  assert.deepEqual(after[1].params, { ui_version: UI });
  assert.equal(Object.prototype.hasOwnProperty.call(after[1], "options"), false);
  assert.ok(after.every((entry) => entry.demo === true && entry.sent === false));
  // Nothing of the link, the plan or the visitor.
  const text = JSON.stringify(after.map((entry) => [entry.params, entry.options]));
  for (const value of PERSONAL.concat([result.url, result.url.split("#resume=")[1], "resume", "weekly"])) assert.equal(text.includes(value), false, "the count carries " + value);

  // The same plan again: the same link, and no second count.
  const again = await store.createSaveLink();
  assert.equal(again.reused, true);
  assert.equal(store.trackLog.length, before + 2);
  // A changed plan gets a new link, counted once more.
  store.set({ dogCount: "3" });
  const changed = await store.createSaveLink();
  assert.equal(changed.ok, true);
  assert.notEqual(changed.url, result.url);
  assert.equal(count(google(store), "quote_link_saved"), 2);
  assert.equal(count(meta(store), "QuoteLinkSaved"), 2);
  // Saving a link is not a request and not a conversion.
  for (const name of CONVERSION_NAMES.concat(["QuoteSent", "quote_requested", "service_requested", "question_submitted"])) assert.equal(count(store.trackLog, name), 0, name);
});

test("T14: nothing is counted for a link that was not created", async () => {
  const saved = (store) => count(store.trackLog, "quote_link_saved") + count(store.trackLog, "QuoteLinkSaved");
  for (const outcome of ["rate_limited", "unavailable", "invalid", "timeout", "bad_link"]) {
    const { store } = makeStore({ options: { demo: { save: outcome } } });
    fillPlan(store);
    const before = store.trackLog.length;
    assert.equal((await store.createSaveLink()).ok, false, outcome);
    assert.deepEqual(store.trackLog.slice(before), [], outcome + " fired events");
    // The retry that works is counted once.
    store.demo.save = "success";
    assert.equal((await store.createSaveLink()).ok, true, outcome + " then retry");
    assert.equal(saved(store), 2, outcome + " then retry");
  }
  // An unfinished plan.
  const early = makeStore().store;
  early.set({ dogCount: "2", zip: "46032" });
  assert.equal((await early.createSaveLink()).status, "not_ready");
  assert.equal(saved(early), 0);
  // A reply that arrives after the plan changed is discarded, and so is its count.
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { store } = makeStore({ options: { wait: () => gate } });
  fillPlan(store);
  const pending = store.createSaveLink();
  assert.equal((await store.createSaveLink()).status, "busy");
  store.set({ yardSize: "l" });
  release();
  assert.equal((await pending).status, "stale");
  assert.equal(saved(store), 0);
});

test("T14: saving the link of a reopened plan is that visitor's first action, so funnel_viewed still comes first", async () => {
  const { store } = makeStore();
  assert.equal((await store.resume("A".repeat(43))).ok, true);
  assert.deepEqual(store.trackLog, []);
  assert.equal((await store.createSaveLink()).ok, true);
  assert.deepEqual(names(store.trackLog), ["funnel_viewed", "QuoteFunnelViewed", "quote_link_saved", "QuoteLinkSaved"]);
});

test("T14 live: gtag gets quote_link_saved and fbq gets trackCustom QuoteLinkSaved, once per created link", async () => {
  const page = offlineLivePage();
  fillPlan(page.store);
  const first = await page.store.createSaveLink();
  assert.equal(first.ok, true);
  assert.deepEqual(page.sent("gtag", "quote_link_saved").map((call) => call.args), [["event", "quote_link_saved", { ui_version: UI }]]);
  assert.deepEqual(page.sent("fbq", "QuoteLinkSaved").map((call) => call.args), [["trackCustom", "QuoteLinkSaved", { ui_version: UI }]]);
  await page.store.createSaveLink();
  assert.equal(page.sent("gtag", "quote_link_saved").length, 1, "the same link is not counted twice");
  assert.equal(page.sent("fbq", "QuoteLinkSaved").length, 1);
  assert.deepEqual(page.requests, [OFFLINE_ENDPOINT.replace(/\/submit$/, "/quote-resume")]);
  for (const name of CONVERSION_NAMES) assert.equal(page.calls.filter((call) => call.args[1] === name).length, 0, name);
  const everything = JSON.stringify(page.calls);
  for (const value of ["46032", first.url, "resume"]) assert.equal(everything.includes(value), false, "a tag was given " + value);

  // No gtag: the Google event goes to dataLayer, as every other event does.
  const dataLayer = [];
  const layered = offlineLivePage({ sinks: { dataLayer } });
  fillPlan(layered.store);
  assert.equal((await layered.store.createSaveLink()).ok, true);
  assert.deepEqual(dataLayer.filter((entry) => entry.event === "quote_link_saved"), [{ event: "quote_link_saved", ui_version: UI }]);
  assert.equal(count(layered.store.trackLog, "QuoteLinkSaved"), 0, "no pixel on the page, so no pixel entry");
});

/* ---- T15: price_choice_selected --------------------------------------------- */

test("T15: the way forward already selected is counted once, when the visitor moves on with it", () => {
  const { store } = makeStore();
  fillPlan(store);
  store.goTo("price");
  store.intentOptions();
  store.flow();
  assert.deepEqual(choices(store), [], "looking at the price is not choosing");
  // "Request service" is selected from the start: pressing it changes nothing...
  assert.deepEqual(store.set({ intent: "service_request" }).changed, []);
  assert.deepEqual(choices(store), []);
  // ...so the choice is counted as the visitor moves on, before the form's step event.
  store.next();
  assert.deepEqual(choices(store), ["service_request"]);
  assert.deepEqual(last(google(store), "price_choice_selected").params, { ui_version: UI, choice: "service_request" });
  assert.deepEqual(names(google(store)).slice(-2), ["price_choice_selected", "funnel_step_viewed"]);
  assert.equal(last(google(store), "funnel_step_viewed").params.step, 4);
  // Google only: the pixel hears nothing of it.
  assert.equal(count(meta(store), "price_choice_selected"), 0);
  assert.deepEqual(names(meta(store)).slice(-2), ["QuotePriceViewed", "QuoteDetailsViewed"]);
  // Back and forward with the same choice is not a new choice.
  store.back();
  store.set({ intent: "service_request" });
  store.next();
  store.next();
  store.back();
  store.back();
  store.goTo("request");
  assert.deepEqual(choices(store), ["service_request"]);
});

test("T15: each of the other two ways is counted when it is pressed, once, with its own id", () => {
  for (const intent of ["quote_delivery", "question"]) {
    const { store } = makeStore();
    fillPlan(store);
    store.goTo("price");
    // What a "Text me this quote" or "Ask a question" button does: set the intent, then move on.
    store.set({ intent });
    assert.deepEqual(choices(store), [intent], "counted when it is chosen");
    assert.deepEqual(last(google(store), "price_choice_selected").params, { ui_version: UI, choice: intent });
    store.next();
    assert.equal(store.getState().step, "request");
    assert.deepEqual(choices(store), [intent], "and not again on moving on");
    assert.deepEqual(names(google(store)).slice(-2), ["price_choice_selected", "funnel_step_viewed"]);
  }
});

test("T15: changing one's mind is counted again only when the choice differs", () => {
  const { store } = makeStore();
  fillPlan(store);
  store.goTo("price");
  store.set({ intent: "question" });
  store.set({ intent: "question" });
  assert.deepEqual(choices(store), ["question"]);
  store.set({ intent: "quote_delivery" });
  store.next();
  store.back();
  store.set({ intent: "quote_delivery" });
  assert.deepEqual(choices(store), ["question", "quote_delivery"]);
  store.set({ intent: "service_request" });
  store.next();
  assert.deepEqual(choices(store), ["question", "quote_delivery", "service_request"]);
  // A selection made by tiles and a separate Continue button counts the same way.
  store.back();
  store.set({ intent: "question" });
  store.set({ intent: "service_request" });
  store.next();
  assert.deepEqual(choices(store), ["question", "quote_delivery", "service_request", "question", "service_request"]);
});

test("T15: only the visitor's own choice on the price step is counted", () => {
  // An intent set before the price is on screen is counted when the visitor moves on from the price with it.
  const early = makeStore().store;
  fillPlan(early);
  early.set({ intent: "question" });
  assert.deepEqual(choices(early), [], "not while the plan questions are on screen");
  early.goTo("price");
  assert.deepEqual(choices(early), [], "reaching the price is not choosing");
  early.next();
  assert.deepEqual(choices(early), ["question"]);

  // An intent the engine changes by itself is not a choice, and a refused one is not either.
  const { store } = makeStore();
  fillPlan(store);
  store.goTo("price");
  store.set({ intent: "question" });
  // The plan turns into a custom estimate while the price step is on screen:
  // the engine itself puts the intent back to a service request.
  const changed = store.set({ dogCount: "10" });
  assert.ok(changed.notices.some((notice) => notice.code === "INTENT_RESET"));
  assert.ok(changed.changed.includes("intent"));
  assert.equal(store.getState().intent, "service_request");
  assert.equal(store.getState().step, "price");
  assert.deepEqual(choices(store), ["question"], "the engine's own change is not counted");
  const refused = store.set({ intent: "quote_delivery" });
  assert.equal(refused.ok, false);
  assert.deepEqual(choices(store), ["question"], "a refused choice is not counted");
  // Moving on with the one way that is open is the visitor's choice.
  store.next();
  assert.deepEqual(choices(store), ["question", "service_request"]);

  // Unknown values never get as far as an event.
  const odd = makeStore().store;
  fillPlan(odd);
  odd.goTo("price");
  for (const value of ["purchase", "", null, 7, "test@example.com", { id: "question" }]) odd.set({ intent: value });
  assert.deepEqual(choices(odd), []);
});

test("T15: a new quote counts its own choice, and so does a reopened plan", async () => {
  const { store } = makeStore();
  toConfirm(store);
  assert.equal((await store.submit()).ok, true);
  assert.deepEqual(choices(store), ["service_request"]);
  assert.equal(store.reset(), true);
  toConfirm(store);
  assert.deepEqual(choices(store), ["service_request", "service_request"], "the second quote's choice is its own");

  const reopened = makeStore().store;
  reopened.set({ dogCount: "2" });
  fillPlan(reopened);
  reopened.goTo("price");
  reopened.next();
  assert.deepEqual(choices(reopened), ["service_request"]);
  assert.equal((await reopened.resume("A".repeat(43))).ok, true);
  reopened.next();
  assert.deepEqual(choices(reopened), ["service_request", "service_request"]);
});

test("T15 live: gtag gets price_choice_selected with the one parameter; the pixel gets nothing for it", () => {
  const page = offlineLivePage();
  fillPlan(page.store);
  page.store.goTo("price");
  page.store.set({ intent: "quote_delivery" });
  page.store.next();
  assert.deepEqual(page.sent("gtag", "price_choice_selected").map((call) => call.args), [["event", "price_choice_selected", { ui_version: UI, choice: "quote_delivery" }]]);
  assert.equal(page.sent("fbq", "price_choice_selected").length, 0);
  assert.equal(page.calls.filter((call) => call.sink === "fbq" && /choice/i.test(JSON.stringify(call.args))).length, 0);
  assert.equal(last(google(page.store), "price_choice_selected").sent, true);

  const dataLayer = [];
  const layered = offlineLivePage({ sinks: { dataLayer } });
  fillPlan(layered.store);
  layered.store.goTo("price");
  layered.store.next();
  assert.deepEqual(dataLayer.filter((entry) => entry.event === "price_choice_selected"), [{ event: "price_choice_selected", ui_version: UI, choice: "service_request" }]);
});

/* ---- rules for all three ------------------------------------------------------ */

test("T13 to T15: a page that may not send (the staging rule, T11) calls no tag for any of them", async () => {
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
    fillPlan(store);
    store.goTo("price");
    store.set({ intent: "quote_delivery" });
    store.next();
    fillDetails(store, "quote_delivery", "text");
    store.next();
    assert.equal((await store.createSaveLink()).status, "blocked", page.url);
    assert.equal((await store.submit()).status, "blocked", page.url);
    assert.deepEqual(calls, [], page.url + ": a tag was called");
    assert.deepEqual(sinks.dataLayer, [], page.url);
    assert.deepEqual(fetchCalls, [], page.url + ": a request was attempted");
    assert.deepEqual(store.networkLog, [], page.url);
    // The choice is written to the log for inspection, marked as not sent.
    assert.deepEqual(choices(store), ["quote_delivery"]);
    assert.equal(last(google(store), "price_choice_selected").sent, false);
    assert.ok(store.trackLog.every((entry) => entry.sent === false), page.url);
    // No link was created and no request was accepted, so neither is counted at all.
    for (const name of ["quote_link_saved", "QuoteLinkSaved", "QuoteSent", "quote_requested"].concat(CONVERSION_NAMES)) assert.equal(count(store.trackLog, name), 0, page.url + ": " + name);
  }
});

test("T13 to T15: only the allow-listed parameters, nothing personal, no ZIP, and an interface cannot fire them", async () => {
  // The allow-list itself: these four as they were (QuoteSent gained "method",
  // T16), and the later funnel and contact events (funnel-events.test.mjs).
  const lists = plain(core.EVENTS.measurementParams);
  assert.deepEqual(MEASUREMENT_NAMES.map((name) => [name, lists[name]]), [["QuoteSent", ["frequency", "value", "currency", "method"]], ["quote_link_saved", []], ["QuoteLinkSaved", []], ["price_choice_selected", ["choice"]]]);
  assert.deepEqual(plain(core.EVENTS.pixelCounts), ["QuoteSent", "QuoteLinkSaved"]);
  assert.equal(Object.prototype.hasOwnProperty.call(lists, "QuoteTexted"), false, "the old name is gone from the allow-list");
  for (const name of MEASUREMENT_NAMES) {
    assert.ok(core.EVENTS.engine.includes(name) !== core.EVENTS.pixelCounts.includes(name), name + " is a Google name or a pixel count, not both");
    assert.equal(core.PIXEL_MILESTONES.includes(name), false, name + " is not a once-per-page-load milestone");
    assert.equal(core.EVENTS.ui.includes(name), false, name + " is not an interface event");
    for (const key of core.EVENTS.measurementParams[name]) assert.equal(/zip|name|phone|email|address|street|city|question/i.test(key), false, name + "." + key);
  }
  assert.ok(Object.isFrozen(core.EVENTS.measurementParams) && Object.isFrozen(core.EVENTS.measurementParams.QuoteSent) && Object.isFrozen(core.EVENTS.pixelCounts));
  assert.deepEqual(plain(core.PIXEL_MILESTONES), ["QuoteZipAccepted", "QuoteZipOutOfArea", "QuotePriceViewed", "QuoteDetailsViewed", "QuoteReviewViewed"], "the five milestones are the same five");
  for (const name of CONVERSION_NAMES) assert.equal(Object.prototype.hasOwnProperty.call(core.EVENTS.measurementParams, name), false, name);

  // A whole texted-quote visit with every field filled in, a question typed, and a saved link.
  const { store } = makeStore({ url: "https://review.example/?zip=46032&utm_source=meta&fbclid=CLICK123" });
  toConfirm(store, "quote_delivery", "text");
  const link = await store.createSaveLink();
  assert.equal(link.ok, true);
  const sent = await store.submit();
  assert.equal(sent.ok, true);
  const entries = store.trackLog.filter((entry) => MEASUREMENT_NAMES.includes(entry.event));
  assert.deepEqual(names(entries), ["price_choice_selected", "quote_link_saved", "QuoteLinkSaved", "QuoteSent"]);
  for (const entry of entries) {
    const extra = Object.keys(entry.params).filter((key) => key !== "ui_version");
    assert.deepEqual(extra.filter((key) => !core.EVENTS.measurementParams[entry.event].includes(key)), [], entry.event + " carries a parameter that is not on its list");
    assert.equal(entry.params.ui_version, UI);
    // QuoteSent says how the quote was sent (T16): one of two fixed words,
    // checked on its own below. Nothing else in any of them names the reply method.
    const rest = Object.assign({}, entry.params);
    if (entry.event === "QuoteSent") delete rest.method;
    const text = JSON.stringify([rest, entry.options]);
    for (const value of PERSONAL.concat(["460", sent.requestId, link.url, "CLICK123", "meta", "text"])) assert.equal(text.includes(value), false, entry.event + " carries " + value);
    assert.equal(/zip/i.test(text), false, entry.event + " names a ZIP");
    assert.equal(entry.channel, core.EVENTS.pixelCounts.includes(entry.event) ? "meta" : "google");
  }
  const everything = JSON.stringify(store.trackLog);
  for (const value of PERSONAL) assert.equal(everything.includes(value), false, "events contain " + value);
  // The price is the per-visit price that was sent, and only QuoteSent has one.
  assert.equal(last(entries, "QuoteSent").params.value, sent.payload.clientPriceCents / 100);
  assert.equal(last(entries, "QuoteSent").params.method, "text");
  for (const name of ["price_choice_selected", "quote_link_saved", "QuoteLinkSaved"]) assert.equal(Object.prototype.hasOwnProperty.call(last(entries, name).params, "value"), false, name + " has no value");

  // An interface cannot fire any of them, with or without parameters.
  const page = makeStore().store;
  for (const name of MEASUREMENT_NAMES) {
    assert.equal(page.track(name), false, name);
    assert.equal(page.track(name, { choice: "question", value: 1, frequency: "weekly", firstName: "Test" }), false, name);
  }
  assert.deepEqual(page.trackLog.filter((entry) => entry.channel !== "rejected"), [], "a refused name reaches no channel");
  assert.equal(JSON.stringify(page.trackLog).includes("Test"), false);
});

test("T13 to T15 in one page load: the five milestones stay at once each, and Lead stays the service request's alone", async () => {
  const { store } = makeStore();
  store.set({ dogCount: "2" });
  store.set({ zip: "46201" });
  // First quote: saved, then texted.
  toConfirm(store, "quote_delivery", "text");
  assert.equal((await store.createSaveLink()).ok, true);
  assert.equal((await store.submit()).ok, true);
  for (const name of CONVERSION_NAMES) assert.equal(count(store.trackLog, name), 0, name + " after a texted quote");
  // Second quote on the same page load: saved, then a service request.
  assert.equal(store.reset(), true);
  toConfirm(store);
  assert.equal((await store.createSaveLink()).ok, true);
  const before = store.trackLog.length;
  const sent = await store.submit();
  assert.equal(sent.ok, true);
  assert.deepEqual(names(store.trackLog.slice(before)), ["service_requested", "generate_lead", "conversion", "Lead", "funnel_step_viewed"]);
  for (const milestone of core.PIXEL_MILESTONES) assert.equal(count(meta(store), milestone), 1, milestone);
  assert.equal(count(google(store), "funnel_viewed"), 1);
  assert.equal(count(meta(store), "QuoteSent"), 1);
  assert.equal(count(google(store), "quote_link_saved"), 2);
  assert.equal(count(meta(store), "QuoteLinkSaved"), 2);
  assert.deepEqual(choices(store), ["quote_delivery", "service_request"]);
  for (const name of CONVERSION_NAMES) assert.equal(count(store.trackLog, name), 1, name + " exactly once");
  const lead = last(meta(store), "Lead");
  assert.equal(lead.method, "track");
  assert.deepEqual(lead.params, { currency: "USD", value: 28.99 });
  assert.deepEqual(lead.options, { eventID: sent.requestId + ":service_requested" });
  assert.deepEqual(meta(store).filter((entry) => entry.method === "track").map((entry) => entry.event), ["Lead"], "Lead is the only standard pixel event");
});

test("T13 to T15 in demo mode: written to the in-page log and the console as every other event is, and to no tag", async () => {
  const calls = [];
  const lines = [];
  const { store } = makeStore({ options: {
    sinks: { gtag: (...args) => calls.push(args), dataLayer: [], fbq: (...args) => calls.push(args) },
    console: { info: (...args) => lines.push(args), warn: (...args) => lines.push(args) }
  } });
  toConfirm(store, "quote_delivery", "text");
  await store.createSaveLink();
  await store.submit();
  assert.deepEqual(calls, []);
  for (const [channel, name] of [["google", "price_choice_selected"], ["google", "quote_link_saved"], ["meta", "QuoteLinkSaved"], ["meta", "QuoteSent"]]) {
    const entry = last(store.trackLog, name);
    assert.ok(entry, name + " is in the log");
    assert.equal(entry.channel, channel);
    assert.equal(entry.demo, true);
    assert.equal(entry.sent, false);
    assert.equal(typeof entry.at, "string");
    const line = lines.filter((args) => args[0] === "[PPQuoteCore demo] " + channel + " " + name);
    assert.equal(line.length, 1, name + " is written to the console once, in the usual form");
    assert.deepEqual(line[0][1], entry.params);
  }
  // The same form as an event that was there before.
  assert.equal(lines.filter((args) => args[0] === "[PPQuoteCore demo] google price_viewed").length, 1);
});
