// Random walks through the whole store: answers, navigation, edits, hero ZIP
// hand-overs, saving, resuming, submitting with every demo outcome, resetting.
// After EVERY action the rules that must always hold are checked. This is the
// net under "every state of the builder is reachable, reversible and tested".
import test from "node:test";
import assert from "node:assert/strict";
import { core, makeStore } from "./helpers/make-store.mjs";
import { worker, plain } from "./helpers/live-source.mjs";

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

const VALUES = {
  zip: ["46032", "46280", "46074", "46201", "4603", "", "46216"],
  dogCount: ["1", "2", "4", "5", "6", "9", "10", ""],
  yardSize: ["s", "m", "l", "xl", "over", ""],
  areas: [[], ["back"], ["front", "side"], ["back", "front", "side"]],
  frequency: ["twice", "weekly", "biweekly", "onetime", "custom", ""],
  intent: ["service_request", "quote_delivery", "question"],
  customerStatus: ["new", "returning", "not_sure", ""],
  firstName: ["Test", ""],
  lastName: ["Reviewer", ""],
  phone: ["3175550100", "555", ""],
  email: ["test@example.com", "nope", ""],
  preferredContact: ["text", "email", "call"],
  smsConsent: [true, false],
  address: ["123 Example St", ""],
  city: ["Carmel", ""],
  startTiming: ["As soon as possible", ""],
  lastCleaned: ["About 1 month", ""],
  question: ["Is this a test question?", ""],
  termsAccepted: [true, false]
};
// Mostly-valid values first in each list, so walks get deep into the flow.
const pickValue = (random, list) => list[random() < 0.7 ? 0 : Math.floor(random() * list.length)];

function checkInvariants(made, label) {
  const { store, storage } = made;
  const state = store.getState();
  const flow = store.flow();

  // The snapshot is frozen and complete.
  assert.ok(Object.isFrozen(state) && Object.isFrozen(state.areas), label);
  assert.ok(core.STEPS.includes(state.step), label + " step " + state.step);

  // The chosen frequency is always one the Worker allows for the dogs and yard.
  if (state.frequency) assert.equal(core.frequencyEligibility(state.frequency, state.dogCount, state.yardSize).allowed, true, label + " frequency");
  // Consent exists only with Text and always has its moment; terms only for a service request.
  if (state.smsConsent) { assert.equal(state.preferredContact, "text", label); assert.ok(state.smsConsentCapturedAt, label); }
  else assert.equal(state.smsConsentCapturedAt, "", label);
  if (state.termsAccepted) { assert.equal(state.intent, "service_request", label); assert.ok(state.termsAcceptedAt, label); }
  // A quote is never delivered by phone call; a custom estimate is always a service request.
  if (state.intent === "quote_delivery") assert.notEqual(state.preferredContact, "call", label);
  if (store.quote().custom) assert.equal(state.intent, "service_request", label);
  // A custom estimate never shows a price anywhere.
  if (store.quote().custom) {
    assert.equal(store.quote().priceCents, null, label);
    assert.equal(store.priceBar().priceCents, null, label);
    assert.equal(/\$\d/.test(store.quote().priceText + store.priceBar().headline), false, label);
  }

  // Past the plan questions the plan is complete (an unfinished ZIP being typed is the one exception).
  if (["price", "request", "confirm"].includes(state.step)) {
    const problems = store.validatePlan().errors.filter((error) => !(error.field === "zip" && store.checkZip().status !== "out_of_area"));
    assert.deepEqual(problems, [], label + " is on " + state.step + " with an incomplete plan");
  }
  // The done step exists only with a receipt, and the other way round.
  assert.equal(state.step === "done", state.receipt !== null, label);

  // Flow answers are consistent.
  assert.equal(flow.current, state.step, label);
  if (flow.back) assert.ok(core.STEPS.includes(flow.back) && core.STEPS.indexOf(flow.back) < core.STEPS.indexOf(state.step), label + " back=" + flow.back);
  if (flow.canContinue && flow.primaryAction === "next") assert.ok(core.STEPS.includes(flow.next), label + " next=" + flow.next);
  assert.equal(flow.canContinue, flow.primaryAction !== "none" && flow.blockedErrors.length === 0, label);
  if (!flow.canContinue && flow.primaryAction !== "none") assert.ok(flow.blockedReason.length > 5, label + " blocked without a reason");
  if (state.locked || state.submitting) { assert.equal(flow.primaryAction, "none", label); assert.equal(flow.back, "", label); }
  // The from-line never shows where weekly is not on offer.
  if (store.fromLine()) { assert.ok(Number(state.dogCount) < 6, label); assert.notEqual(state.yardSize, "over", label); assert.equal(store.quote().ready, false, label); }

  // Storage: the two permitted keys, the permitted fields, never an out-of-area ZIP.
  for (const key of Object.keys(storage.items)) assert.ok(key === "pp_quote_progress_v3" || key === "pp_quote_attribution_v3", label + " storage key " + key);
  if (storage.items.pp_quote_progress_v3) {
    const saved = JSON.parse(storage.items.pp_quote_progress_v3);
    assert.deepEqual(Object.keys(saved).sort(), ["areas", "customerStatus", "dogCount", "frequency", "lastCleaned", "yardSize", "zip"], label);
    if (saved.zip) assert.ok(core.SERVICE_ZIPS.includes(saved.zip), label + " stored ZIP " + saved.zip);
  }
  const everythingStored = JSON.stringify(storage.items);
  for (const personal of ["Test", "Reviewer", "3175550100", "test@example.com", "123 Example St"]) assert.equal(everythingStored.includes(personal), false, label + " stored " + personal);

  // Tracking: once-only rules, nothing personal, no ZIP.
  for (const milestone of core.PIXEL_MILESTONES) {
    assert.ok(store.trackLog.filter((entry) => entry.event === milestone).length <= 1, label + " " + milestone + " more than once");
  }
  assert.ok(store.trackLog.filter((entry) => entry.event === "funnel_viewed").length <= 1, label + " funnel_viewed more than once");
}

async function walk(seed, steps, setup) {
  const random = generator(seed);
  const made = makeStore(setup);
  const { store } = made;
  const pick = (list) => list[Math.floor(random() * list.length)];
  let successfulServiceRequests = 0;

  for (let step = 0; step < steps; step += 1) {
    const roll = random();
    let label = "seed " + seed + " action " + step + ": ";
    if (roll < 0.05) {
      // A careful visitor: every answer valid, in order, with the boxes ticked.
      label += "fill everything in properly";
      for (const field of Object.keys(VALUES)) {
        if (field === "smsConsent" || field === "termsAccepted" || field === "intent") continue;
        const patch = {};
        patch[field] = VALUES[field][0];
        store.set(patch);
      }
      store.set({ areas: ["back"] });
      store.set({ frequency: pick(["weekly", "onetime", "custom", "twice"]) });
      store.set({ smsConsent: true });
      store.set({ termsAccepted: true });
    } else if (roll < 0.42) {
      const field = pick(Object.keys(VALUES));
      const patch = {};
      patch[field] = pickValue(random, VALUES[field]);
      label += "set " + JSON.stringify(patch);
      store.set(patch);
    } else if (roll < 0.62) {
      label += "next";
      store.next();
    } else if (roll < 0.68) {
      label += "back";
      store.back();
    } else if (roll < 0.74) {
      const target = pick(core.STEPS);
      label += "goTo " + target;
      store.goTo(target);
    } else if (roll < 0.79) {
      const target = pick(core.STEPS);
      label += "edit " + target;
      store.edit(target);
    } else if (roll < 0.83) {
      const area = pick(["back", "front", "side"]);
      label += "toggle " + area;
      store.toggleArea(area);
    } else if (roll < 0.86) {
      const zip = pick(["46032", "46123", "46201", "abc", ""]);
      label += "open " + zip;
      store.open({ zip });
    } else if (roll < 0.93) {
      store.demo.submit = random() < 0.6 ? "success" : pick(core.DEMO_SUBMIT_OUTCOMES);
      label += "submit (" + store.demo.submit + ")";
      const before = store.getState();
      const result = await store.submit();
      assert.equal(typeof result.ok, "boolean", label);
      if (result.ok) {
        // Whatever path led here, the Worker's own validation accepts what was sent.
        assert.equal(worker.validateV3(result.payload).ok, true, label + " " + JSON.stringify(plain(worker.validateV3(result.payload).errors)));
        assert.equal(before.locked, null, label);
        if (result.payload.intent === "service_request") successfulServiceRequests += 1;
      }
    } else if (roll < 0.96) {
      store.demo.save = random() < 0.7 ? "success" : pick(core.DEMO_SAVE_OUTCOMES);
      label += "save link (" + store.demo.save + ")";
      const link = await store.createSaveLink();
      if (link.ok) assert.notEqual(worker.resumePlan(link.body), null, label);
    } else if (roll < 0.98) {
      store.demo.resume = random() < 0.7 ? "success" : pick(core.DEMO_RESUME_OUTCOMES);
      label += "resume (" + store.demo.resume + ")";
      await store.resume("R".repeat(43));
      if (!store.getState().locked) assert.equal(store.getState().customerStatus, "", label + ": customer status is never pre-selected");
    } else {
      label += "reset";
      store.reset();
    }
    checkInvariants(made, label);
    // Conversion events: at most one set per successful service request.
    assert.equal(store.trackLog.filter((entry) => entry.event === "Lead").length, successfulServiceRequests, label + " Lead count");
    assert.equal(store.trackLog.filter((entry) => entry.event === "generate_lead").length, successfulServiceRequests, label + " generate_lead count");
    assert.equal(store.trackLog.filter((entry) => entry.event === "conversion").length, successfulServiceRequests, label + " conversion count");
  }
  return { made, successfulServiceRequests };
}

test("300 random walks of 120 actions each keep every rule, on an ordinary page", async () => {
  let reachedDone = 0;
  let locked = 0;
  for (let seed = 1; seed <= 300; seed += 1) {
    const { made, successfulServiceRequests } = await walk(seed, 120);
    reachedDone += successfulServiceRequests;
    if (made.store.getState().locked) locked += 1;
  }
  assert.ok(reachedDone > 30, "walks that completed a service request: " + reachedDone);
  assert.ok(locked > 5, "walks that ended locked: " + locked);
});

test("random walks on a city page, with a ZIP in the address, and with progress carried over", async () => {
  for (let seed = 1000; seed < 1080; seed += 1) await walk(seed, 100, { options: { pageZip: "46074", pageCity: "Westfield" } });
  for (let seed = 2000; seed < 2080; seed += 1) await walk(seed, 100, { url: "https://review.example/quote?zip=46032&utm_source=meta&open_quote=1" });
  for (let seed = 3000; seed < 3040; seed += 1) await walk(seed, 100, { url: "https://review.example/quote?zip=46201" });
  for (let seed = 4000; seed < 4040; seed += 1) {
    const first = await walk(seed, 60);
    // "Next page": a new store over the same session storage.
    await walk(seed + 1, 60, { storage: first.made.storage });
  }
});
