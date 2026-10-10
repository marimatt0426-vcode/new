// T23: attribution that survives a return visit (CORE-API.md sections 8 and 14).
// The nine URL parameters are kept for the browser session, as in the live
// tool, and the last non-empty set is ALSO kept in the browser for 30 days,
// with the moment it was captured. These tests use a stand-in for the
// browser's longer-lived storage and a clock they move by hand.
import test from "node:test";
import assert from "node:assert/strict";
import { core, makeStore, fakeStorage, fillPlan, fillDetails } from "./helpers/make-store.mjs";
import { worker } from "./helpers/live-source.mjs";

const SESSION_KEY = "pp_quote_attribution_v3";
const PROGRESS_KEY = "pp_quote_progress_v3";
const KEPT_KEY = "pp_quote_attribution_kept_v1";
const NINE_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "wbraid", "gbraid", "fbclid"];
const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-10-09T14:00:00.000Z");
const PAYLOAD_KEYS = ["schemaVersion", "requestId", "eventId", "stage", "intent", "zip", "dogs", "frequency", "frequencyId", "areas", "areaIds", "yardSize", "yardSizeId", "lastCleaned", "customerStatus", "startTiming", "perVisitPrice", "clientPriceCents", "pricingVersion", "customEstimate", "customReasons", "phone", "phoneE164", "firstName", "lastName", "email", "street", "city", "state", "preferredContact", "smsTransactionalConsent", "consent", "consentVersion", "smsConsentCapturedAt", "termsAccepted", "termsVersion", "termsAcceptedAt", "question", "notes", "page", "attribution", "gclid", "fbclid", "fbp", "fbc", "submittedAt", "website"];
// Everything fillDetails() types, in every form it could be stored.
const PERSONAL = ["Test", "Reviewer", "3175550100", "(317) 555-0100", "555-0100", "test@example.com", "123 Example St", "Is this only a test question?", "test-id-", "46032", "smsConsent", "termsAccepted", "firstName", "phone", "email", "address", "question", "requestId", "weekly", "dogCount"];
const AD_CLICK = "https://review.example/westfield?utm_source=google&utm_medium=cpc&utm_campaign=westfield_search&gclid=G-CLICK-1";
const AD_VALUES = { utm_source: "google", utm_medium: "cpc", utm_campaign: "westfield_search", gclid: "G-CLICK-1" };

const plain = (value) => JSON.parse(JSON.stringify(value));
const kept = (browser) => (KEPT_KEY in browser.kept.items ? JSON.parse(browser.kept.items[KEPT_KEY]) : null);

// One browser: its longer-lived storage and its clock.
function browser(initial) {
  const storage = fakeStorage(initial);
  storage.removed = [];
  const remove = storage.removeItem;
  storage.removeItem = function (key) { storage.removed.push(key); remove.call(storage, key); };
  return { kept: storage, clock: { now: T0 } };
}

// One page load in that browser. A new session (a new tab, or another day)
// starts with empty session storage; pass the same one to stay in a session.
function load(inBrowser, url, session, extra) {
  const made = makeStore({ url, storage: session || fakeStorage(), options: Object.assign({ persistentStorage: inBrowser.kept, now: () => inBrowser.clock.now }, extra || {}) });
  made.attribution = () => plain(made.store.getState().attribution);
  return made;
}

// A complete service request, as a payload.
function payloadOf(store, intent) {
  fillPlan(store);
  store.goTo("request");
  fillDetails(store, intent || "service_request", "text");
  const built = store.buildPayload(intent || "service_request");
  assert.equal(built.ok, true);
  return built.payload;
}

test("T23: an arrival with parameters is kept as exactly two things, the capture moment and the cleaned set", () => {
  const one = browser();
  const landing = load(one, AD_CLICK + "&other=1&zip=46032&email=test@example.com&utm_term=" + "x".repeat(300));
  assert.deepEqual(Object.keys(one.kept.items), [KEPT_KEY], "one key, and no other");
  assert.equal(core.STORAGE_KEYS.attributionKept, KEPT_KEY);
  assert.equal(core.ATTRIBUTION_KEEP_DAYS, 30);
  const stored = kept(one);
  assert.deepEqual(Object.keys(stored), ["capturedAt", "values"]);
  assert.equal(stored.capturedAt, T0, "the capture moment, as a number");
  assert.deepEqual(stored.values, Object.assign({ utm_term: "x".repeat(250) }, AD_VALUES), "the nine known keys only, cut to 250 characters as before");
  assert.ok(Object.keys(stored.values).every((key) => NINE_KEYS.includes(key)));
  assert.deepEqual(landing.store.attributionSource(), { source: "session", capturedAt: 0, keepDays: 30 });
  // The session copy is exactly what it was before this change.
  assert.deepEqual(JSON.parse(landing.storage.items[SESSION_KEY]), stored.values);
  assert.deepEqual(landing.attribution(), stored.values);
  assert.equal(one.kept.writes.length, 1);
});

test("T23: a return visit on a later day, with no parameter of its own, arrives with the source, in the same payload keys", () => {
  const one = browser();
  load(one, AD_CLICK);
  const before = one.kept.items[KEPT_KEY];
  // Next day, a new tab, a plain address (a saved link, a bookmark, a typed address).
  one.clock.now = T0 + DAY + 3600000;
  const back = load(one, "https://review.example/quote");
  assert.deepEqual(back.attribution(), AD_VALUES);
  assert.deepEqual(back.store.attributionSource(), { source: "kept", capturedAt: T0, keepDays: 30 });
  const payload = payloadOf(back.store);
  assert.deepEqual(Object.keys(payload), PAYLOAD_KEYS, "no new payload field");
  assert.deepEqual(payload.attribution, AD_VALUES);
  assert.equal(payload.gclid, "G-CLICK-1");
  assert.equal(payload.fbclid, "");
  assert.equal(payload.page, "https://review.example/quote", "the page sent is the page the request was made on");
  assert.equal(worker.validateV3(payload).ok, true, "the Worker's own validation accepts it");
  // The empty visit changed nothing that is kept, and nothing was copied into the session.
  assert.equal(one.kept.items[KEPT_KEY], before);
  assert.equal(one.kept.writes.length, 1);
  assert.deepEqual(JSON.parse(back.storage.items[SESSION_KEY]), {});
  // The same visit without the kept copy (another browser) has no source, as before.
  const other = load(browser(), "https://review.example/quote");
  assert.deepEqual(other.attribution(), {});
  assert.deepEqual(other.store.attributionSource(), { source: "none", capturedAt: 0, keepDays: 30 });
  assert.deepEqual(payloadOf(other.store).attribution, {});
});

test("T23: an empty visit never overwrites it, and a parameter that is present but empty is an empty visit", () => {
  const one = browser();
  load(one, AD_CLICK);
  const before = one.kept.items[KEPT_KEY];
  for (const url of ["https://review.example/", "https://review.example/?utm_source=&gclid=&fbclid=", "https://review.example/?open_quote=1&zip=46032", "https://review.example/?ref=newsletter#quote"]) {
    one.clock.now += DAY;
    const page = load(one, url);
    assert.deepEqual(page.attribution(), AD_VALUES, url);
    assert.equal(page.store.attributionSource().source, "kept", url);
    assert.equal(one.kept.items[KEPT_KEY], before, url + " changed the kept copy");
  }
  assert.equal(one.kept.writes.length, 1);
  assert.deepEqual(one.kept.removed, []);
});

test("T23: a newer click replaces the whole set, and the session's own parameters always win", () => {
  const one = browser();
  load(one, AD_CLICK);
  // Four days later, a Meta ad: its parameters are this session's, and nothing of the Google click is mixed in.
  one.clock.now = T0 + 4 * DAY;
  const session = fakeStorage();
  const second = load(one, "https://review.example/?utm_source=meta&utm_medium=paid_social&fbclid=F-CLICK-2", session);
  const metaValues = { utm_source: "meta", utm_medium: "paid_social", fbclid: "F-CLICK-2" };
  assert.deepEqual(second.attribution(), metaValues);
  assert.equal(second.store.attributionSource().source, "session");
  assert.deepEqual(kept(one), { capturedAt: T0 + 4 * DAY, values: metaValues }, "replaced, not merged: no gclid, no campaign of the older click");
  const payload = payloadOf(second.store);
  assert.deepEqual(payload.attribution, metaValues);
  assert.equal(payload.gclid, "");
  assert.equal(payload.fbclid, "F-CLICK-2");
  // Another page of the same session, later, with no parameter: the session copy is used and nothing is rewritten.
  one.clock.now += 2 * 3600000;
  const writes = one.kept.writes.length;
  const nextPage = load(one, "https://review.example/quote", session);
  assert.deepEqual(nextPage.attribution(), metaValues);
  assert.equal(nextPage.store.attributionSource().source, "session");
  assert.equal(one.kept.writes.length, writes);
  assert.equal(kept(one).capturedAt, T0 + 4 * DAY);
});

test("T23: the kept set is never copied into the session, so a later click in that session cannot mix with it", () => {
  const one = browser();
  load(one, AD_CLICK);
  one.clock.now = T0 + 2 * DAY;
  const session = fakeStorage();
  const back = load(one, "https://review.example/", session);
  assert.equal(back.store.attributionSource().source, "kept");
  assert.deepEqual(JSON.parse(session.items[SESSION_KEY]), {});
  // Later in the same session the visitor comes in through a Meta link.
  one.clock.now += 600000;
  const click = load(one, "https://review.example/?fbclid=F-9", session);
  assert.deepEqual(click.attribution(), { fbclid: "F-9" });
  const payload = payloadOf(click.store);
  assert.deepEqual(payload.attribution, { fbclid: "F-9" });
  assert.equal(payload.gclid, "", "the older Google click is not attached to the newer Meta click");
  assert.deepEqual(kept(one), { capturedAt: T0 + 2 * DAY + 600000, values: { fbclid: "F-9" } });
  // Within one session the parameters of a second tagged page are added to the first, exactly as before,
  // and the kept copy is that same set.
  one.clock.now += 600000;
  const more = load(one, "https://review.example/services?utm_content=banner", session);
  assert.deepEqual(more.attribution(), { utm_content: "banner", fbclid: "F-9" });
  assert.deepEqual(kept(one).values, { utm_content: "banner", fbclid: "F-9" });
});

test("T23: the same set seen again keeps its first capture moment; reading it does not extend the 30 days", () => {
  const one = browser();
  const session = fakeStorage();
  load(one, AD_CLICK, session);
  // A reload in the same session, and the same tagged address opened again on later days.
  one.clock.now = T0 + 60000;
  load(one, AD_CLICK, session);
  for (const days of [1, 9, 29]) {
    one.clock.now = T0 + days * DAY;
    const again = load(one, AD_CLICK);
    assert.deepEqual(again.attribution(), AD_VALUES);
    assert.equal(kept(one).capturedAt, T0, "day " + days + ": the first capture moment stands");
  }
  assert.equal(one.kept.writes.length, 1, "written once");
  // So it still ends 30 days after the click was first seen.
  one.clock.now = T0 + 30 * DAY;
  const late = load(one, "https://review.example/");
  assert.deepEqual(late.attribution(), {});
  assert.equal(kept(one), null);
});

test("T23: it is used up to the last millisecond of day 30, then removed and never used again", () => {
  const one = browser();
  load(one, AD_CLICK);
  one.clock.now = T0 + 30 * DAY - 1;
  const lastMoment = load(one, "https://review.example/");
  assert.deepEqual(lastMoment.attribution(), AD_VALUES);
  assert.deepEqual(one.kept.removed, []);
  one.clock.now = T0 + 30 * DAY;
  const expired = load(one, "https://review.example/");
  assert.deepEqual(expired.attribution(), {});
  assert.deepEqual(expired.store.attributionSource(), { source: "none", capturedAt: 0, keepDays: 30 });
  assert.deepEqual(one.kept.removed, [KEPT_KEY]);
  assert.deepEqual(Object.keys(one.kept.items), [], "nothing is left in the browser");
  assert.deepEqual(payloadOf(expired.store).attribution, {});
  // Turning the clock back does not bring it back.
  one.clock.now = T0 + DAY;
  assert.deepEqual(load(one, "https://review.example/").attribution(), {});
  // An old copy is also removed when the visitor arrives with a new click, which then takes its place.
  const two = browser();
  load(two, AD_CLICK);
  two.clock.now = T0 + 45 * DAY;
  const fresh = load(two, "https://review.example/?utm_source=meta&fbclid=F-3");
  assert.deepEqual(fresh.attribution(), { utm_source: "meta", fbclid: "F-3" });
  assert.deepEqual(kept(two), { capturedAt: T0 + 45 * DAY, values: { utm_source: "meta", fbclid: "F-3" } });
});

test("T23: a tab left open past the 30 days keeps its own session copy, and does not start the 30 days again", () => {
  const one = browser();
  const session = fakeStorage();
  load(one, AD_CLICK, session);
  // Day 31, the same tab, another page of the site with no parameter of its own.
  one.clock.now = T0 + 31 * DAY;
  const still = load(one, "https://review.example/quote", session);
  assert.deepEqual(still.attribution(), AD_VALUES, "the session copy is the live tool's rule and is untouched");
  assert.equal(still.store.attributionSource().source, "session");
  assert.equal(kept(one), null, "the expired copy was removed and not written again");
  assert.equal(one.kept.writes.length, 1);
  // Once that tab is closed, the source is gone.
  assert.deepEqual(load(one, "https://review.example/").attribution(), {});
  // The same holds when the visitor clears the site's stored data in the middle of a session.
  const two = browser();
  const sessionTwo = fakeStorage();
  load(two, AD_CLICK, sessionTwo);
  delete two.kept.items[KEPT_KEY];
  two.clock.now = T0 + DAY;
  load(two, "https://review.example/quote", sessionTwo);
  assert.equal(kept(two), null, "a page with no parameter of its own writes nothing");
});

test("T23: the fallback fbc takes the capture moment only when the caller says the click was brought back", () => {
  const state = { zip: "46032", dogCount: "2", yardSize: "m", areas: ["back"], frequency: "weekly", phone: "", firstName: "", lastName: "", email: "", address: "", city: "", preferredContact: "email", smsConsent: false, termsAccepted: false, question: "", startTiming: "", lastCleaned: "", customerStatus: "" };
  const context = { requestId: "r-1", nowIso: "2026-10-09T14:00:00.000Z", nowMs: T0, page: "https://review.example/", attribution: { fbclid: "F-1" }, fbp: "", fbc: "" };
  const build = (extra) => core.testing.payloadFromState(state, "question", Object.assign({}, context, extra));
  assert.equal(build({}).fbc, "fb.1." + T0 + ".F-1", "no capture moment given: now, as before");
  assert.equal(build({ clickSeenMs: 0 }).fbc, "fb.1." + T0 + ".F-1");
  assert.equal(build({ clickSeenMs: T0 - 5 * DAY }).fbc, "fb.1." + (T0 - 5 * DAY) + ".F-1");
  assert.equal(build({ clickSeenMs: T0 - 5 * DAY, fbc: "fb.1.3.COOKIE" }).fbc, "fb.1.3.COOKIE", "the cookie always wins");
  assert.equal(build({ clickSeenMs: T0 - 5 * DAY, attribution: { gclid: "G-1" } }).fbc, "", "no fbclid, no fbc");
  assert.deepEqual(Object.keys(build({ clickSeenMs: T0 - 5 * DAY })), PAYLOAD_KEYS, "the capture moment is not a payload field");
});

test("T23: a copy that is unreadable, empty, foreign or dated in the future is removed and never used", () => {
  const good = { utm_source: "google", gclid: "G-1" };
  const bad = [
    "not json", "null", "[]", "42", "\"text\"", "{}",
    JSON.stringify({ values: good }),
    JSON.stringify({ capturedAt: "2026-10-09T14:00:00.000Z", values: good }),
    JSON.stringify({ capturedAt: null, values: good }),
    JSON.stringify({ capturedAt: T0, values: {} }),
    JSON.stringify({ capturedAt: T0 }),
    JSON.stringify({ capturedAt: T0, values: "utm_source=google" }),
    JSON.stringify({ capturedAt: T0, values: { email: "test@example.com", phone: "3175550100", zip: "46032" } }),
    JSON.stringify({ capturedAt: T0, values: { utm_source: "", gclid: 12345 } }),
    JSON.stringify({ capturedAt: T0 + 2 * DAY, values: good }),
    JSON.stringify({ capturedAt: T0 - 31 * DAY, values: good })
  ];
  for (const raw of bad) {
    const one = browser({ [KEPT_KEY]: raw });
    const page = load(one, "https://review.example/");
    assert.deepEqual(page.attribution(), {}, raw);
    assert.equal(page.store.attributionSource().source, "none", raw);
    assert.deepEqual(Object.keys(one.kept.items), [], raw + " was left in the browser");
  }
  // A clock that is a little behind (under a day) is tolerated.
  const ahead = browser({ [KEPT_KEY]: JSON.stringify({ capturedAt: T0 + 3600000, values: good }) });
  assert.deepEqual(load(ahead, "https://review.example/").attribution(), good);
  // Anything that is not one of the nine parameters is left behind when the copy is read,
  // and long values are cut again.
  const mixed = browser({ [KEPT_KEY]: JSON.stringify({ capturedAt: T0 - DAY, extra: "x", values: { utm_source: "google", email: "test@example.com", firstName: "Test", zip: "46032", fbclid: "F".repeat(400) } }) });
  const page = load(mixed, "https://review.example/");
  assert.deepEqual(page.attribution(), { utm_source: "google", fbclid: "F".repeat(250) });
  const payload = payloadOf(page.store);
  assert.deepEqual(Object.keys(payload.attribution).sort(), ["fbclid", "utm_source"]);
  assert.equal(JSON.stringify(payload.attribution).includes("test@example.com"), false);
});

test("T23: with no _fbc cookie, a click id brought back from the kept copy is dated when it was first seen, not now", () => {
  const one = browser();
  load(one, "https://review.example/?utm_source=meta&fbclid=F-CLICK-7");
  one.clock.now = T0 + 3 * DAY;
  const back = load(one, "https://review.example/quote");
  const restored = payloadOf(back.store);
  assert.equal(restored.fbclid, "F-CLICK-7");
  assert.equal(restored.fbc, "fb.1." + T0 + ".F-CLICK-7", "the capture moment: an old click is not dressed up as a new one");
  assert.equal(restored.submittedAt, new Date(T0 + 3 * DAY).toISOString());
  // A click of this session is dated now, as in the live tool.
  const fresh = load(one, "https://review.example/?fbclid=F-CLICK-8");
  assert.equal(payloadOf(fresh.store).fbc, "fb.1." + (T0 + 3 * DAY) + ".F-CLICK-8");
  // The pixel's own cookie, when it exists, is sent untouched in both cases.
  const cookies = { _fbp: "fb.1.1.2", _fbc: "fb.1.3.COOKIE" };
  const two = browser();
  load(two, "https://review.example/?fbclid=F-CLICK-7");
  two.clock.now = T0 + 3 * DAY;
  const withCookie = load(two, "https://review.example/quote", null, { readCookie: (name) => cookies[name] || "" });
  const payload = payloadOf(withCookie.store);
  assert.equal(payload.fbc, "fb.1.3.COOKIE");
  assert.equal(payload.fbp, "fb.1.1.2");
  assert.equal(payload.fbclid, "F-CLICK-7");
});

test("T23: where the browser offers no longer-lived storage, or it throws, nothing is kept and nothing breaks", () => {
  const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  const fullUp = { items: {}, getItem() { return null; }, setItem() { throw new Error("quota"); }, removeItem() {} };
  const unreadable = { getItem() { return "{{{"; }, setItem() {}, removeItem() { throw new Error("blocked"); } };
  for (const persistentStorage of [null, undefined, throwing, fullUp, unreadable, {}, { getItem: () => null }, "localStorage", 7]) {
    const session = fakeStorage();
    const landing = makeStore({ url: AD_CLICK, storage: session, options: { persistentStorage } });
    assert.deepEqual(plain(landing.store.getState().attribution), AD_VALUES);
    assert.deepEqual(landing.store.attributionSource(), { source: "session", capturedAt: 0, keepDays: 30 });
    assert.deepEqual(JSON.parse(session.items[SESSION_KEY]), AD_VALUES, "the session copy works as before");
    assert.deepEqual(payloadOf(landing.store).attribution, AD_VALUES);
    const later = makeStore({ url: "https://review.example/", options: { persistentStorage } });
    assert.deepEqual(plain(later.store.getState().attribution), {});
    assert.equal(later.store.reset(), true);
  }
  // The default in Node, and in every other test of this suite: no longer-lived storage at all.
  assert.deepEqual(makeStore({ url: AD_CLICK }).store.attributionSource(), { source: "session", capturedAt: 0, keepDays: 30 });
});

test("T23: nothing personal, no plan answer and no request id is ever kept, at any point of a complete request", async () => {
  const one = browser();
  const session = fakeStorage();
  const { store } = load(one, "https://review.example/?utm_source=meta&utm_campaign=fall_yard&fbclid=F-1", session);
  const audit = (when) => {
    const everything = JSON.stringify(one.kept.items) + JSON.stringify(one.kept.writes);
    for (const value of PERSONAL) assert.equal(everything.includes(value), false, when + ": the kept copy contains " + JSON.stringify(value));
    assert.deepEqual(Object.keys(one.kept.items).filter((key) => key !== KEPT_KEY), [], when + ": one key only");
    for (const write of one.kept.writes) {
      assert.equal(write.key, KEPT_KEY, when);
      const value = JSON.parse(write.value);
      assert.deepEqual(Object.keys(value), ["capturedAt", "values"], when);
      assert.equal(typeof value.capturedAt, "number");
      assert.ok(Object.keys(value.values).every((key) => NINE_KEYS.includes(key) && typeof value.values[key] === "string" && value.values[key].length <= 250), when);
    }
    // The session storage holds what it always held, under its two keys.
    assert.deepEqual(Object.keys(session.items).filter((key) => key !== SESSION_KEY && key !== PROGRESS_KEY), [], when);
    assert.equal(session.writes.some((write) => write.key === KEPT_KEY), false, when);
  };
  audit("at start");
  fillPlan(store);
  audit("after the plan");
  store.goTo("request");
  fillDetails(store, "question", "email");
  fillDetails(store, "service_request", "text");
  audit("after the request form");
  store.trackUi("contact_click", { method: "text", placement: "builder" });
  store.next();
  await store.createSaveLink();
  const sent = await store.submit();
  assert.equal(sent.ok, true);
  audit("after a successful request");
  assert.equal(JSON.stringify(one.kept.items).includes(sent.requestId), false);
  assert.equal(store.reset(), true);
  audit("after reset");
  assert.equal(one.kept.writes.length, 1, "written once, on arrival");
  assert.deepEqual(plain(store.getState().attribution), { utm_source: "meta", utm_campaign: "fall_yard", fbclid: "F-1" }, "a new quote keeps its source");
  // The source is never put into an event: T23 changes what a request carries, not what a tag is told.
  const events = JSON.stringify(store.trackLog.map((entry) => [entry.params, entry.options]));
  for (const value of ["fall_yard", "F-1", "meta"]) assert.equal(events.includes(value), false, "an event carries " + value);
});

test("T23: a new quote and a reopened saved plan keep the source they arrived with", async () => {
  const one = browser();
  load(one, AD_CLICK);
  one.clock.now = T0 + 6 * DAY;
  const back = load(one, "https://review.example/");
  assert.equal(back.store.reset(), true);
  assert.deepEqual(back.attribution(), AD_VALUES);
  assert.deepEqual(back.store.attributionSource(), { source: "kept", capturedAt: T0, keepDays: 30 });
  assert.equal((await back.store.resume("A".repeat(43))).ok, true);
  assert.deepEqual(back.attribution(), AD_VALUES);
  back.store.next();
  fillDetails(back.store, "quote_delivery", "text");
  const sent = await back.store.submit();
  assert.equal(sent.ok, true);
  assert.deepEqual(sent.payload.attribution, AD_VALUES);
  assert.equal(sent.payload.gclid, "G-CLICK-1");
  assert.deepEqual(Object.keys(sent.payload), PAYLOAD_KEYS);
  assert.equal(worker.validateV3(sent.payload).ok, true);
  assert.equal(kept(one).capturedAt, T0, "sending a request does not touch the kept copy");
});
