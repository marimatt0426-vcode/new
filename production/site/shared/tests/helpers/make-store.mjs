// Test doubles for everything the engine can reach outside itself: storage,
// clock, ids, location, cookies, network and tracking tags. Every test store
// is offline by construction; a fetch that is not expected throws.
//
// Test contacts are obviously fake: first name "Test", phone 3175550100,
// email test@example.com.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const core = require("../../pp-quote-core.js");

// An inspectable stand-in for sessionStorage.
export function fakeStorage(initial) {
  const items = Object.assign({}, initial || {});
  return {
    items,
    writes: [],
    getItem(key) { return Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null; },
    setItem(key, value) { items[key] = String(value); this.writes.push({ key, value: String(value) }); },
    removeItem(key) { delete items[key]; }
  };
}

// A stand-in for window.location built from a URL string.
export function fakeLocation(href) {
  const url = new URL(href);
  return { href: url.href, search: url.search, hash: url.hash, pathname: url.pathname, protocol: url.protocol, origin: url.origin, hostname: url.hostname };
}

// The page a review build is opened from: a local file.
export const REVIEW_PAGE = "file:///G:/review/home.html";

// makeStore({ url, storage, options }) -> { store, storage, clock, ids, fetchCalls }
export function makeStore(setup) {
  const config = setup || {};
  const storage = config.storage || fakeStorage();
  const clock = { now: Date.parse("2026-10-07T15:00:00.000Z") };
  const ids = [];
  const fetchCalls = [];
  // A repeatable sequence that still differs from call to call.
  let seed = 12345;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const options = Object.assign({
    storage,
    location: fakeLocation(config.url || REVIEW_PAGE),
    history: { state: null, replaceState() {} },
    now: () => clock.now,
    uuid: () => { const id = "test-id-" + String(ids.length + 1).padStart(4, "0"); ids.push(id); return id; },
    random,
    readCookie: () => "",
    console: null,
    wait: () => Promise.resolve(),
    // Any network use that a test did not arrange is a failure.
    fetch: (url) => { fetchCalls.push(url); throw new Error("Unexpected network call to " + url); }
  }, config.options || {});
  const store = core.create(options);
  return { store, storage, clock, ids, fetchCalls };
}

// Answers the five plan questions. Defaults: 2 dogs, 46032, quarter acre,
// back + front, weekly -> $28.99 per visit.
export function fillPlan(store, overrides) {
  const plan = Object.assign({ dogCount: "2", zip: "46032", yardSize: "m", areas: ["back", "front"], frequency: "weekly" }, overrides || {});
  // In the order the flow asks them, so reconciliation runs as it would live.
  store.set({ dogCount: plan.dogCount });
  store.set({ zip: plan.zip });
  store.set({ yardSize: plan.yardSize });
  store.set({ areas: plan.areas });
  if (plan.frequency !== undefined) store.set({ frequency: plan.frequency });
  return store;
}

// Fills the request form for an intent and reply method with fake details.
export function fillDetails(store, intent, contact, overrides) {
  const method = contact || "text";
  store.set({ intent: intent || "service_request" });
  store.set({ preferredContact: method });
  const details = Object.assign({
    customerStatus: "new",
    firstName: "Test",
    lastName: "Reviewer",
    phone: "3175550100",
    email: "test@example.com",
    address: "123 Example St",
    startTiming: "As soon as possible",
    lastCleaned: "About 1 month",
    question: "Is this only a test question?"
  }, overrides || {});
  store.set(details);
  if (method === "text") store.set({ smsConsent: true });
  if ((intent || "service_request") === "service_request") store.set({ termsAccepted: true });
  return store;
}

// A complete, valid service request ready to submit.
export function readyStore(setup, planOverrides, intent, contact) {
  const made = makeStore(setup);
  fillPlan(made.store, planOverrides);
  fillDetails(made.store, intent || "service_request", contact || "text");
  return made;
}

export const AREA_SUBSETS = [
  ["back"], ["front"], ["side"],
  ["back", "front"], ["back", "side"], ["front", "side"],
  ["back", "front", "side"]
];
export const FREQUENCY_IDS = ["twice", "weekly", "biweekly", "onetime", "custom"];
export const YARD_IDS = ["s", "m", "l", "xl", "over"];
