// GA4 copies of the Meta step events (engine 1.6.0, 2026-10-18; CORE-API.md section 8, "GA4 step events").
// Each Meta step event has a GA4 twin sent with gtag ONLY to G-VV0Q16TW3X (send_to), with five safe parameters. The
// change is additive: the last test runs the same sessions through the engine as it was before (1.5.2, the file live on
// 2026-10-18, kept in fixtures/engine-1.5.2) and requires every other tag call, request and log entry to be identical.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { core, makeStore, fillPlan, fillDetails, fakeStorage, fakeLocation } from "./helpers/make-store.mjs";

const require = createRequire(import.meta.url);
const engineBefore = require("./fixtures/engine-1.5.2/pp-quote-core.js");

const GA4 = "G-VV0Q16TW3X";
const LIVE_PAGE = "https://pages.offline.invalid/quote";
const LIVE_ENDPOINT = "https://relay.offline.invalid/submit";
const PERSONAL = ["Test", "Reviewer", "3175550100", "555-0100", "test@example.com", "123 Example St", "Carmel", "Is this only a test question?", "46032", "46201", "90210"];

// A live-mode store on a page that may send, with gtag and fbq that only record what they are given.
function livePage(setup) {
  const config = setup || {};
  const calls = [];
  const sinks = config.sinks || {
    gtag: (...args) => calls.push({ sink: "gtag", args }),
    fbq: (...args) => calls.push({ sink: "fbq", args })
  };
  const made = makeStore({
    url: config.url || LIVE_PAGE,
    options: Object.assign({
      mode: "live", endpoint: LIVE_ENDPOINT, allowedOrigins: [new URL(LIVE_PAGE).origin], sinks,
      fetch: async (url, init) => ({ ok: true, status: 202, text: async () => JSON.stringify({ accepted: true, requestId: JSON.parse(init.body).requestId }) })
    }, config.options || {})
  });
  made.calls = calls;
  made.ga4 = () => calls.filter((call) => call.sink === "gtag" && call.args[2] && call.args[2].send_to === GA4);
  return made;
}
const ga4Names = (page) => page.ga4().map((call) => call.args[1]);

function toConfirm(store, intent, contact) {
  fillPlan(store);
  store.goTo("price");
  store.set({ intent: intent || "service_request" });
  store.next();
  fillDetails(store, intent || "service_request", contact || "text");
  store.next();
  return store;
}

test("the GA4 names, the measurement id and the parameter list are the agreed ones", () => {
  assert.equal(core.GA4_MEASUREMENT_ID, GA4);
  assert.deepEqual(JSON.parse(JSON.stringify(core.GA4_EVENTS)), {
    QuoteFunnelViewed: { name: "quote_funnel_viewed", step: "start" },
    QuoteZipAccepted: { name: "quote_zip_accepted", step: "zip" },
    QuoteZipOutOfArea: { name: "quote_zip_out_of_area", step: "zip" },
    QuotePriceViewed: { name: "quote_price_viewed", step: "price" },
    QuoteDetailsViewed: { name: "quote_details_viewed", step: "request" },
    QuoteReviewViewed: { name: "quote_review_viewed", step: "confirm" },
    QuoteSent: { name: "quote_sent", step: "sent" }
  });
  assert.deepEqual([...core.GA4_PARAMS], ["send_to", "quote_step", "frequency", "dog_count", "yard_size", "in_service_area"]);
  // every Meta step event has a twin; Lead has none on purpose (the existing generate_lead already reaches GA4)
  for (const name of core.PIXEL_MILESTONES.concat(["QuoteFunnelViewed", "QuoteSent"])) assert.ok(core.GA4_EVENTS[name], name);
  assert.equal(core.GA4_EVENTS.Lead, undefined);
});

test("a service request in live mode: each twin once, in step order, only to GA4, with only the safe parameters", async () => {
  const page = livePage();
  toConfirm(page.store);
  const result = await page.store.submit();
  assert.equal(result.ok, true);
  assert.deepEqual(ga4Names(page), ["quote_funnel_viewed", "quote_zip_accepted", "quote_price_viewed", "quote_details_viewed", "quote_review_viewed"]);
  for (const call of page.ga4()) {
    assert.equal(call.args[0], "event");
    assert.equal(call.args.length, 3, "no fourth argument");
    for (const key of Object.keys(call.args[2])) assert.ok(core.GA4_PARAMS.includes(key), call.args[1] + " carries " + key);
  }
  assert.deepEqual(page.ga4()[2].args[2], { send_to: GA4, quote_step: "price", frequency: "weekly", dog_count: "2", yard_size: "m", in_service_area: true });
  assert.deepEqual(page.ga4()[1].args[2], { send_to: GA4, quote_step: "zip", dog_count: "2", in_service_area: true });
  // the twin comes straight after its Meta event, which comes straight after its Google event
  const order = page.calls.map((call) => call.args[1]);
  assert.deepEqual(order.slice(order.indexOf("price_viewed"), order.indexOf("price_viewed") + 3), ["price_viewed", "QuotePriceViewed", "quote_price_viewed"]);
  // no second generate_lead: the one that was always sent (no send_to, so the Google tag routes it to GA4 too)
  const leads = page.calls.filter((call) => call.args[1] === "generate_lead");
  assert.equal(leads.length, 1);
  assert.equal(leads[0].args[2].send_to, undefined);
  // nothing personal, no ZIP, no request id, no resume token in any twin
  const sent = JSON.stringify(page.ga4());
  for (const value of PERSONAL.concat([result.requestId, "resume", "zip_prefix", "transaction_id", "event_id", "value"])) assert.equal(sent.includes(value), false, "a GA4 twin carries " + value);
  assert.equal(/\d{5}/.test(sent), false, "no run of five digits");
  assert.ok(page.store.trackLog.filter((entry) => entry.channel === "ga4").every((entry) => entry.sent === true));
});

test("quote_sent once per accepted quote request, never a lead", async () => {
  const page = livePage();
  toConfirm(page.store, "quote_delivery", "text");
  assert.equal((await page.store.submit()).ok, true);
  assert.deepEqual(page.ga4().filter((call) => call.args[1] === "quote_sent").map((call) => call.args[2]),
    [{ send_to: GA4, quote_step: "sent", frequency: "weekly", dog_count: "2", yard_size: "m", in_service_area: true }]);
  const order = page.calls.map((call) => call.args[1]);
  assert.deepEqual(order.slice(order.indexOf("quote_requested"), order.indexOf("quote_requested") + 3), ["quote_requested", "QuoteSent", "quote_sent"]);
  for (const name of ["generate_lead", "conversion", "Lead"]) assert.equal(order.includes(name), false, name);
});

test("an out-of-area ZIP: quote_zip_out_of_area with in_service_area false, and never the ZIP", () => {
  const page = livePage();
  page.store.set({ dogCount: "7" });
  page.store.set({ zip: "90210" });
  const twin = page.ga4().find((call) => call.args[1] === "quote_zip_out_of_area");
  assert.deepEqual(twin.args[2], { send_to: GA4, quote_step: "zip", dog_count: "5+", in_service_area: false });
  assert.equal(JSON.stringify(page.ga4()).includes("902"), false);
});

test("the milestones go once per page load, as on Meta", () => {
  const page = livePage();
  fillPlan(page.store);
  page.store.goTo("price");
  page.store.set({ frequency: "biweekly" });
  page.store.goTo("frequency");
  page.store.goTo("price");
  page.store.set({ zip: "46033" });
  assert.equal(ga4Names(page).filter((name) => name === "quote_price_viewed").length, 1);
  assert.equal(ga4Names(page).filter((name) => name === "quote_zip_accepted").length, 1);
  assert.equal(ga4Names(page).filter((name) => name === "quote_funnel_viewed").length, 1);
});

test("a missing gtag sends nothing and throws nothing; a gtag that throws is caught and the request still succeeds", async () => {
  const fbqCalls = [];
  const noGtag = livePage({ sinks: { fbq: (...args) => fbqCalls.push(args) } });
  toConfirm(noGtag.store);
  assert.equal((await noGtag.store.submit()).ok, true);
  assert.equal(noGtag.store.trackLog.some((entry) => entry.channel === "ga4"), false, "nothing sent, nothing logged as sent");
  assert.ok(fbqCalls.length > 0, "the pixel is unaffected");
  const dataLayer = [];
  const layered = livePage({ sinks: { dataLayer } });
  toConfirm(layered.store);
  assert.equal((await layered.store.submit()).ok, true);
  assert.equal(dataLayer.some((entry) => entry.send_to === GA4 || /^quote_(funnel|zip|price|details|review|sent)/.test(entry.event)), false, "a twin never goes to the dataLayer");
  const throwing = livePage({ sinks: { gtag: (...args) => { if (args[2] && args[2].send_to === GA4) throw new Error("tag failure"); }, fbq: () => {} } });
  toConfirm(throwing.store);
  assert.equal((await throwing.store.submit()).ok, true);
  assert.ok(throwing.store.trackLog.filter((entry) => entry.channel === "ga4").every((entry) => entry.sent === false));
});

test("demo mode, staging and a page that may not send call no tag: the twins are only written to the log", async () => {
  const calls = [];
  const sinks = { gtag: (...args) => calls.push(args), fbq: (...args) => calls.push(args), dataLayer: [] };
  for (const setup of [{ options: { sinks } }, { url: "https://staging.offline.invalid/", options: { mode: "live", endpoint: LIVE_ENDPOINT, sinks } }, { url: "file:///G:/review/home.html", options: { mode: "live", endpoint: LIVE_ENDPOINT, sinks } }]) {
    const { store } = makeStore(setup);
    fillPlan(store);
    store.goTo("price");
    const twins = store.trackLog.filter((entry) => entry.channel === "ga4");
    assert.deepEqual(twins.map((entry) => entry.event), ["quote_funnel_viewed", "quote_zip_accepted", "quote_price_viewed"]);
    assert.ok(twins.every((entry) => entry.sent === false && entry.params.send_to === GA4));
  }
  assert.deepEqual(calls, []);
});

test("the twins do not depend on the pixel: no fbq on the page, or pixel events switched off", () => {
  const gtagOnly = [];
  const noPixel = livePage({ sinks: { gtag: (...args) => gtagOnly.push(args) } });
  fillPlan(noPixel.store);
  noPixel.store.goTo("price");
  assert.deepEqual(gtagOnly.filter((args) => args[2] && args[2].send_to === GA4).map((args) => args[1]), ["quote_funnel_viewed", "quote_zip_accepted", "quote_price_viewed"]);
  const off = livePage({ options: { firePixelEvents: false } });
  fillPlan(off.store);
  off.store.goTo("price");
  assert.deepEqual(ga4Names(off), ["quote_funnel_viewed", "quote_zip_accepted", "quote_price_viewed"]);
  assert.equal(off.calls.some((call) => call.sink === "fbq"), false, "the pixel stays off");
});

// The same scripted sessions through the engine before this change and after it.
function session(engine, script) {
  const storage = fakeStorage();
  const clock = { now: Date.parse("2026-10-07T15:00:00.000Z") };
  const ids = [];
  const calls = [];
  const bodies = [];
  let seed = 12345;
  const store = engine.create({
    storage,
    location: fakeLocation(script.url || LIVE_PAGE),
    history: { state: null, replaceState() {} },
    now: () => clock.now,
    uuid: () => { const id = "test-id-" + String(ids.length + 1).padStart(4, "0"); ids.push(id); return id; },
    random: () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; },
    readCookie: () => "",
    console: null,
    wait: () => Promise.resolve(),
    mode: "live", endpoint: LIVE_ENDPOINT, allowedOrigins: [new URL(LIVE_PAGE).origin],
    sinks: { gtag: (...args) => calls.push(["gtag"].concat(JSON.parse(JSON.stringify(args)))), fbq: (...args) => calls.push(["fbq"].concat(JSON.parse(JSON.stringify(args)))) },
    fetch: async (url, init) => { bodies.push([url, init && init.body]); return { ok: true, status: 202, text: async () => JSON.stringify({ accepted: true, requestId: JSON.parse(init.body).requestId }) }; }
  });
  return { store, calls, bodies, storage };
}
const SCRIPTS = [
  { name: "service request", sends: true, run: async (store) => { toConfirm(store); await store.submit(); } },
  { name: "quote by email", sends: true, run: async (store) => { toConfirm(store, "quote_delivery", "email"); await store.submit(); } },
  { name: "question", sends: true, run: async (store) => { toConfirm(store, "question", "text"); await store.submit(); } },
  { name: "out of area then back", run: async (store) => { store.set({ dogCount: "3" }); store.set({ zip: "90210" }); store.set({ zip: "46060" }); store.set({ yardSize: "l" }); store.set({ areas: ["back"] }); store.set({ frequency: "biweekly" }); store.goTo("price"); store.track("yard_size_help_opened"); } },
  { name: "city page with its ZIP", url: "https://pages.offline.invalid/carmel?zip=46032", run: async (store) => { store.set({ dogCount: "1" }); store.set({ yardSize: "s" }); store.set({ areas: ["back"] }); store.set({ frequency: "weekly" }); store.goTo("price"); store.goTo("frequency"); store.set({ frequency: "twice" }); store.goTo("price"); } }
];

test("additive only: every call, request, saved value and log entry of 1.5.2 is made exactly as before", async () => {
  assert.equal(engineBefore.engineVersion, "1.5.2");
  for (const script of SCRIPTS) {
    const before = session(engineBefore, script);
    const after = session(core, script);
    await script.run(before.store);
    await script.run(after.store);
    const isTwin = (call) => call[0] === "gtag" && call[3] && call[3].send_to === GA4;
    assert.ok(before.calls.length >= 8, script.name + ": the session made its calls");
    assert.equal(before.bodies.length, script.sends ? 1 : 0, script.name + ": the request was sent");
    assert.ok(after.calls.some(isTwin), script.name + ": the twins were sent");
    assert.equal(before.calls.some(isTwin), false);
    assert.deepEqual(after.calls.filter((call) => !isTwin(call)), before.calls, script.name + ": the other tag calls");
    assert.deepEqual(after.bodies, before.bodies, script.name + ": the requests");
    assert.deepEqual(after.storage.writes, before.storage.writes, script.name + ": what is saved, in order (the seven-day plan included)");
    assert.deepEqual(after.store.trackLog.filter((entry) => entry.channel !== "ga4"), before.store.trackLog, script.name + ": the log");
    assert.deepEqual(after.store.getState(), before.store.getState(), script.name + ": the state");
    assert.deepEqual(after.store.currentQuote ? after.store.currentQuote() : after.store.priceBar(), before.store.currentQuote ? before.store.currentQuote() : before.store.priceBar(), script.name + ": the price");
  }
});
