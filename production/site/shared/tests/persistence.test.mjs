// What the engine keeps in the browser (spec section 9 and 17.2 item 11):
// only the seven plan fields and the nine attribution parameters, under the
// live widget's keys. Never a name, phone, email, address, question, consent,
// terms acceptance or request id.
import test from "node:test";
import assert from "node:assert/strict";
import { core, makeStore, fakeStorage, fillPlan, fillDetails, readyStore } from "./helpers/make-store.mjs";

const PROGRESS_KEY = "pp_quote_progress_v3";
const ATTRIBUTION_KEY = "pp_quote_attribution_v3";
const SEVEN_KEYS = ["areas", "customerStatus", "dogCount", "frequency", "lastCleaned", "yardSize", "zip"];
const NINE_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "wbraid", "gbraid", "fbclid"];

// Everything personal a test visitor types, in every form it could be stored.
const PERSONAL = ["Test", "Reviewer", "3175550100", "(317) 555-0100", "555-0100", "test@example.com", "123 Example St", "Is this only a test question?", "test-id-", "2026-10-07T15", "smsConsent", "termsAccepted", "firstName", "phone", "email", "address", "question", "requestId"];

function assertNothingPersonal(storage, when) {
  const everything = JSON.stringify(storage.items) + JSON.stringify(storage.writes);
  for (const value of PERSONAL) assert.equal(everything.includes(value), false, when + ": storage contains " + JSON.stringify(value));
  assert.deepEqual(Object.keys(storage.items).filter((key) => key !== PROGRESS_KEY && key !== ATTRIBUTION_KEY), [], when + ": only the two permitted storage keys");
  for (const write of storage.writes) assert.ok(write.key === PROGRESS_KEY || write.key === ATTRIBUTION_KEY, when + ": wrote to " + write.key);
}

test("the stored progress is exactly the seven permitted keys, in the live widget's shape", () => {
  const { store, storage } = makeStore();
  fillPlan(store);
  store.set({ lastCleaned: "About 1 month", customerStatus: "new" });
  const stored = JSON.parse(storage.items[PROGRESS_KEY]);
  assert.deepEqual(Object.keys(stored).sort(), SEVEN_KEYS);
  assert.deepEqual(stored, { zip: "46032", dogCount: "2", frequency: "weekly", areas: ["back", "front"], yardSize: "m", lastCleaned: "About 1 month", customerStatus: "new" });
  assert.deepEqual(Object.keys(stored).sort(), core.PERSISTED_PLAN_KEYS.slice().sort());
});

test("nothing personal is ever written, at any point of a complete request", async () => {
  // A review host: demo mode refuses to send from a real Purge Pros origin.
  const { store, storage } = makeStore({ url: "https://review.example/?utm_source=meta&gclid=g-1" });
  assertNothingPersonal(storage, "at start");
  fillPlan(store);
  assertNothingPersonal(storage, "after the plan");
  store.goTo("request");
  fillDetails(store, "question", "email");
  assertNothingPersonal(storage, "after a question form");
  fillDetails(store, "service_request", "text");
  assertNothingPersonal(storage, "after the request form");
  store.next();
  // Every write so far is one of the two permitted shapes.
  for (const write of storage.writes) {
    const value = JSON.parse(write.value);
    if (write.key === PROGRESS_KEY) assert.deepEqual(Object.keys(value).sort(), SEVEN_KEYS);
    else assert.ok(Object.keys(value).every((key) => NINE_KEYS.includes(key)));
  }
  // A failed attempt keeps the pending request in memory only.
  store.demo.submit = "timeout";
  store.set({ termsAccepted: true });
  assert.equal((await store.submit()).status, "timeout");
  assertNothingPersonal(storage, "after a failed submit");
  store.demo.submit = "success";
  const sent = await store.submit();
  assert.equal(sent.ok, true);
  assertNothingPersonal(storage, "after a successful submit");
  assert.equal(Object.prototype.hasOwnProperty.call(storage.items, PROGRESS_KEY), false, "progress is cleared after success");
  store.reset();
  assertNothingPersonal(storage, "after reset");
});

test("progress follows the visitor to the next page; contact details do not", () => {
  const first = readyStore();
  first.store.goTo("confirm");
  // "Next page": a new store over the same session storage.
  const second = makeStore({ storage: first.storage }).store;
  const state = second.getState();
  assert.equal(state.zip, "46032");
  assert.equal(state.zipSource, "storage");
  assert.equal(state.dogCount, "2");
  assert.equal(state.yardSize, "m");
  assert.deepEqual(state.areas, ["back", "front"]);
  assert.equal(state.frequency, "weekly");
  assert.equal(state.lastCleaned, "About 1 month");
  assert.equal(state.customerStatus, "new");
  // Memory-only fields start empty.
  for (const field of ["firstName", "lastName", "phone", "email", "address", "question", "startTiming", "smsConsentCapturedAt", "termsAcceptedAt"]) assert.equal(state[field], "", field);
  assert.equal(state.smsConsent, false);
  assert.equal(state.termsAccepted, false);
  assert.equal(state.intent, "service_request");
  assert.equal(state.step, "dogs", "the step is not stored");
  assert.equal(state.city, "Carmel", "the city is suggested again from the ZIP, not stored");
  assert.equal(second.quote().priceCents, 2899);
});

test("stored values are checked again before they are used", () => {
  const cases = [
    [{ zip: "46201", dogCount: "2" }, { zip: "", dogCount: "2" }],
    [{ zip: "4603" }, { zip: "" }],
    [{ dogCount: "12" }, { dogCount: "" }],
    [{ dogCount: 4 }, { dogCount: "4" }],
    [{ yardSize: "xxl" }, { yardSize: "" }],
    [{ frequency: "monthly" }, { frequency: "" }],
    [{ areas: ["back", "garage", "back", "side"] }, { areas: ["back", "side"] }],
    [{ areas: "back" }, { areas: [] }],
    [{ lastCleaned: "2-3 weeks" }, { lastCleaned: "" }],
    [{ customerStatus: "vip" }, { customerStatus: "" }],
    [{ firstName: "Mallory", phone: "3175550100", step: "confirm", termsAccepted: true }, { firstName: "", phone: "", step: "dogs", termsAccepted: false }]
  ];
  for (const [saved, expected] of cases) {
    const storage = fakeStorage({ [PROGRESS_KEY]: JSON.stringify(saved) });
    const state = makeStore({ storage }).store.getState();
    for (const [field, value] of Object.entries(expected)) assert.deepEqual(state[field], value, JSON.stringify(saved) + " -> " + field);
  }
  // Broken JSON, or something that is not an object, is ignored.
  for (const raw of ["{not json", "null", "[]", "\"text\"", "42"]) {
    const state = makeStore({ storage: fakeStorage({ [PROGRESS_KEY]: raw }) }).store.getState();
    assert.equal(state.dogCount, "", raw);
    assert.equal(state.zip, "", raw);
  }
});

test("storage that is blocked or full never breaks the builder", () => {
  const broken = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("quota"); },
    removeItem() { throw new Error("blocked"); }
  };
  const { store } = makeStore({ storage: broken });
  fillPlan(store);
  assert.equal(store.quote().priceCents, 2899);
  assert.equal(store.reset(), true);
  // No storage at all: the engine falls back to memory for the page.
  const none = core.create({ storage: null, location: null, console: null });
  none.set({ dogCount: "2" });
  assert.equal(none.getState().dogCount, "2");
});

test("only the visitor's own accepted ZIP is stored", () => {
  // Typed and accepted: stored.
  const typed = makeStore();
  typed.store.set({ zip: "46032" });
  assert.equal(JSON.parse(typed.storage.items[PROGRESS_KEY]).zip, "46032");
  // Incomplete or out of area: not stored.
  typed.store.set({ zip: "4603" });
  assert.equal(JSON.parse(typed.storage.items[PROGRESS_KEY]).zip, "");
  typed.store.set({ zip: "46201" });
  assert.equal(JSON.parse(typed.storage.items[PROGRESS_KEY]).zip, "");

  // Supplied by a city page: not the visitor's answer, so it does not follow them.
  const page = makeStore({ options: { pageZip: "46074" } });
  assert.equal(page.storage.writes.filter((write) => write.key === PROGRESS_KEY).length, 0, "nothing is written just by loading a page");
  page.store.set({ dogCount: "2" });
  assert.deepEqual(JSON.parse(page.storage.items[PROGRESS_KEY]), { zip: "", dogCount: "2", frequency: "", areas: [], yardSize: "", lastCleaned: "", customerStatus: "" });
  // Once the visitor confirms it by choosing it themselves, it is theirs.
  page.store.set({ zip: "46074" });
  assert.equal(JSON.parse(page.storage.items[PROGRESS_KEY]).zip, "46074");

  // Arriving with ?zip= (typed into a hero form on the previous page): stored.
  const url = makeStore({ url: "https://itspurgepros.com/?zip=46123" });
  assert.equal(JSON.parse(url.storage.items[PROGRESS_KEY]).zip, "46123");
  // An out-of-area ?zip= is not.
  const outside = makeStore({ url: "https://itspurgepros.com/?zip=46201" });
  assert.equal(Object.prototype.hasOwnProperty.call(outside.storage.items, PROGRESS_KEY), false);
});

test("loading a page writes no plan progress", () => {
  const { storage } = makeStore();
  assert.equal(storage.writes.filter((write) => write.key === PROGRESS_KEY).length, 0);
  const carried = fakeStorage({ [PROGRESS_KEY]: JSON.stringify({ zip: "46032", dogCount: "2", frequency: "", areas: [], yardSize: "", lastCleaned: "", customerStatus: "" }) });
  makeStore({ storage: carried });
  assert.equal(carried.writes.filter((write) => write.key === PROGRESS_KEY).length, 0);
});

test("progress is cleared by a successful submit, by reset, and when a saved link starts opening", async () => {
  const sent = readyStore();
  assert.ok(sent.storage.items[PROGRESS_KEY]);
  await sent.store.submit();
  assert.equal(Object.prototype.hasOwnProperty.call(sent.storage.items, PROGRESS_KEY), false);

  const cleared = readyStore();
  cleared.store.reset();
  assert.equal(Object.prototype.hasOwnProperty.call(cleared.storage.items, PROGRESS_KEY), false);

  const resumed = readyStore();
  const pending = resumed.store.resume("x".repeat(43));
  assert.equal(Object.prototype.hasOwnProperty.call(resumed.storage.items, PROGRESS_KEY), false, "cleared before the saved plan arrives");
  await pending;
  // A failed submit keeps it.
  const failed = readyStore({ options: { demo: { submit: "unavailable" } } });
  await failed.store.submit();
  assert.ok(failed.storage.items[PROGRESS_KEY]);
});

test("attribution: the nine URL parameters, cut to 250 characters, kept for the session", () => {
  const long = "x".repeat(400);
  const { store, storage } = makeStore({
    url: "https://itspurgepros.com/carmel?utm_source=meta&utm_medium=paid&utm_campaign=fall&utm_content=" + long +
      "&utm_term=scoop&gclid=G1&wbraid=W1&gbraid=B1&fbclid=F1&zip=46032&open_quote=1&ref=someone&email=test@example.com"
  });
  const stored = JSON.parse(storage.items[ATTRIBUTION_KEY]);
  assert.deepEqual(Object.keys(stored).sort(), NINE_KEYS.slice().sort());
  assert.equal(stored.utm_content.length, 250);
  assert.equal(stored.utm_source, "meta");
  assert.equal(JSON.stringify(stored).includes("someone"), false, "other parameters are not kept");
  assert.equal(JSON.stringify(stored).includes("test@example.com"), false);
  assert.deepEqual(store.getState().attribution, stored);

  // Next page, no parameters: the earlier ones are kept.
  const second = makeStore({ url: "https://itspurgepros.com/reviews", storage });
  assert.deepEqual(second.store.getState().attribution, stored);
  // A later page with new values: new ones overwrite, missing ones stay.
  const third = makeStore({ url: "https://itspurgepros.com/?utm_source=google&gclid=G2", storage });
  assert.equal(third.store.getState().attribution.utm_source, "google");
  assert.equal(third.store.getState().attribution.gclid, "G2");
  assert.equal(third.store.getState().attribution.utm_campaign, "fall");
  assert.equal(third.store.getState().attribution.fbclid, "F1");
  // Captured again on reset.
  third.store.reset();
  assert.equal(third.store.getState().attribution.utm_source, "google");
});

test("attribution storage that has been tampered with is cleaned", () => {
  const storage = fakeStorage({ [ATTRIBUTION_KEY]: JSON.stringify({ utm_source: "meta", name: "Test", phone: "3175550100", gclid: 12345, fbclid: "ok" }) });
  const { store } = makeStore({ storage });
  assert.deepEqual(store.getState().attribution, { utm_source: "meta", fbclid: "ok" });
  assert.deepEqual(JSON.parse(storage.items[ATTRIBUTION_KEY]), { utm_source: "meta", fbclid: "ok" });
  const brokenJson = fakeStorage({ [ATTRIBUTION_KEY]: "{oops" });
  assert.deepEqual(makeStore({ storage: brokenJson }).store.getState().attribution, {});
});

test("attribution, the page and the Meta cookies travel with a request; cookies are only read", () => {
  const cookiesRead = [];
  const { store } = readyStore({
    url: "https://itspurgepros.com/fishers?utm_source=meta&gclid=G9",
    options: { readCookie: (name) => { cookiesRead.push(name); return name === "_fbp" ? "fb.1.111.222" : name === "_fbc" ? "fb.1.333.CLICK" : ""; } }
  });
  const payload = store.buildPayload().payload;
  assert.deepEqual(payload.attribution, { utm_source: "meta", gclid: "G9" });
  assert.equal(payload.gclid, "G9");
  assert.equal(payload.fbclid, "");
  assert.equal(payload.fbp, "fb.1.111.222");
  assert.equal(payload.fbc, "fb.1.333.CLICK");
  assert.equal(payload.page, "https://itspurgepros.com/fishers?utm_source=meta&gclid=G9");
  assert.deepEqual(Array.from(new Set(cookiesRead)).sort(), ["_fbc", "_fbp"], "only these two cookies are ever read");

  // No _fbc cookie but a fbclid: the live fallback form.
  const fallback = readyStore({ url: "https://itspurgepros.com/?fbclid=CLICK7" });
  assert.equal(fallback.store.buildPayload().payload.fbc, "fb.1." + fallback.clock.now + ".CLICK7");
  // A very long page address is cut to 1,000 characters.
  const longPage = readyStore({ url: "https://itspurgepros.com/?utm_term=" + "y".repeat(2000) });
  assert.equal(longPage.store.buildPayload().payload.page.length, 1000);
});

test("text consent and customer status are never restored from anywhere but the visitor", () => {
  // Consent is not one of the stored keys, so a reload always starts unticked.
  const first = readyStore();
  assert.equal(first.store.getState().smsConsent, true);
  const reloaded = makeStore({ storage: first.storage }).store;
  assert.equal(reloaded.getState().smsConsent, false);
  assert.equal(reloaded.getState().termsAccepted, false);
  // Even a forged storage entry cannot tick it.
  const forged = fakeStorage({ [PROGRESS_KEY]: JSON.stringify({ zip: "46032", smsConsent: true, smsConsentCapturedAt: "2020-01-01T00:00:00.000Z", preferredContact: "text", termsAccepted: true }) });
  const state = makeStore({ storage: forged }).store.getState();
  assert.equal(state.smsConsent, false);
  assert.equal(state.smsConsentCapturedAt, "");
  assert.equal(state.termsAccepted, false);
});
