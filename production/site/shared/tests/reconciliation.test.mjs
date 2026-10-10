// Reconciliation (spec 4.2.2 and section 15): what happens to the chosen
// frequency when the dog count or yard size changes. The live tool changes it
// silently and leaves "Custom booking" stuck; the engine must explain every
// change and release custom when its reason has gone.
import test from "node:test";
import assert from "node:assert/strict";
import { core, makeStore, fakeStorage, fillPlan, fillDetails } from "./helpers/make-store.mjs";

function frequencyNotice(result) {
  return result.notices.find((notice) => notice.field === "frequency") || null;
}

test("choosing 10+ dogs first selects Custom booking and says why; one-time stays open", () => {
  const { store } = makeStore();
  const result = store.set({ dogCount: "10" });
  assert.equal(store.getState().frequency, "custom");
  const notice = frequencyNotice(result);
  assert.equal(notice.code, "CUSTOM_AUTO_SELECTED");
  assert.match(notice.message, /10 or more dogs/);
  assert.match(notice.message, /Custom booking/);
  assert.match(notice.message, /one-time cleanup is still available/);
  assert.equal(notice.goToStep, "frequency");
  // 10+ dogs: only one-time and custom are open (spec section 15).
  assert.deepEqual(store.frequencyOptions().filter((option) => option.available).map((option) => option.id), ["onetime", "custom"]);
  // One-time can be chosen by hand and is a standard $89.99.
  store.set({ yardSize: "s", areas: ["back"] });
  assert.deepEqual(store.set({ frequency: "onetime" }).rejected, []);
  assert.equal(store.quote().priceCents, 8999);
  assert.equal(store.quote().custom, false);
});

test("choosing over 1 acre first selects Custom booking and says why; nothing else is open", () => {
  const { store } = makeStore();
  store.set({ dogCount: "2" });
  const result = store.set({ yardSize: "over" });
  assert.equal(store.getState().frequency, "custom");
  const notice = frequencyNotice(result);
  assert.equal(notice.code, "CUSTOM_AUTO_SELECTED");
  assert.match(notice.message, /over 1 acre/);
  assert.doesNotMatch(notice.message, /one-time/, "one-time is not open over 1 acre");
  assert.deepEqual(store.frequencyOptions().filter((option) => option.available).map((option) => option.id), ["custom"]);
  for (const option of store.frequencyOptions().filter((entry) => !entry.available)) {
    assert.equal(option.reason, "Choose Custom booking for yards over 1 acre");
  }
});

test("a frequency that is still allowed is kept without a notice", () => {
  const { store } = makeStore();
  fillPlan(store, { dogCount: "3", frequency: "weekly" });
  const result = store.set({ dogCount: "4" });
  assert.equal(store.getState().frequency, "weekly");
  assert.deepEqual(result.notices, []);
  const yard = store.set({ yardSize: "xl" });
  assert.equal(store.getState().frequency, "weekly");
  assert.deepEqual(yard.notices, []);
});

test("a frequency that is no longer offered is cleared WITH an explanation (the live tool is silent)", () => {
  const { store } = makeStore();
  fillPlan(store, { dogCount: "4", frequency: "biweekly" });
  const result = store.set({ dogCount: "5" });
  assert.equal(store.getState().frequency, "");
  const notice = frequencyNotice(result);
  assert.equal(notice.code, "FREQUENCY_CLEARED");
  assert.equal(notice.previous, "biweekly");
  assert.equal(notice.current, "");
  assert.match(notice.message, /Every other week is available for up to 4 dogs/);
  assert.equal(notice.goToStep, "frequency");

  store.set({ frequency: "weekly" });
  const six = store.set({ dogCount: "6" });
  assert.equal(store.getState().frequency, "");
  assert.match(frequencyNotice(six).message, /Weekly is available for up to 5 dogs/);
});

test("when 10+ dogs or over 1 acre makes the choice invalid it moves to Custom booking, with an explanation", () => {
  const dogs = makeStore().store;
  fillPlan(dogs, { dogCount: "9", frequency: "twice" });
  const ten = dogs.set({ dogCount: "10" });
  assert.equal(dogs.getState().frequency, "custom");
  assert.equal(frequencyNotice(ten).code, "FREQUENCY_MOVED_TO_CUSTOM");
  assert.match(frequencyNotice(ten).message, /Twice weekly/);

  const yard = makeStore().store;
  fillPlan(yard, { frequency: "onetime" });
  const over = yard.set({ yardSize: "over" });
  assert.equal(yard.getState().frequency, "custom");
  assert.equal(frequencyNotice(over).code, "FREQUENCY_MOVED_TO_CUSTOM");
  assert.match(frequencyNotice(over).message, /over 1 acre/);
  assert.match(frequencyNotice(over).message, /One-time cleanup/);

  // One-time survives 10+ dogs: it is allowed for any dog count.
  const oneTime = makeStore().store;
  fillPlan(oneTime, { dogCount: "3", frequency: "onetime" });
  assert.deepEqual(oneTime.set({ dogCount: "10" }).notices, []);
  assert.equal(oneTime.getState().frequency, "onetime");
});

test("Custom booking is RELEASED when its reason goes away (the live tool leaves it stuck)", () => {
  // 10+ dogs -> custom, then fewer dogs.
  const dogs = makeStore().store;
  dogs.set({ dogCount: "10" });
  assert.equal(dogs.getState().frequency, "custom");
  const fewer = dogs.set({ dogCount: "3" });
  assert.equal(dogs.getState().frequency, "", "the visitor chooses again");
  assert.equal(frequencyNotice(fewer).code, "CUSTOM_RELEASED");
  assert.match(frequencyNotice(fewer).message, /no longer need a custom quote/);

  // Over 1 acre -> custom, then a smaller yard.
  const yard = makeStore().store;
  yard.set({ dogCount: "2", yardSize: "over" });
  assert.equal(yard.getState().frequency, "custom");
  const smaller = yard.set({ yardSize: "xl" });
  assert.equal(yard.getState().frequency, "");
  assert.equal(frequencyNotice(smaller).code, "CUSTOM_RELEASED");

  // Two reasons: removing one keeps custom, removing the second releases it.
  const both = makeStore().store;
  both.set({ dogCount: "10", yardSize: "over" });
  assert.deepEqual(both.set({ yardSize: "l" }).notices, [], "10+ dogs is still a reason");
  assert.equal(both.getState().frequency, "custom");
  assert.equal(frequencyNotice(both.set({ dogCount: "9" })).code, "CUSTOM_RELEASED");
  assert.equal(both.getState().frequency, "");
});

test("Custom booking chosen by hand for an ordinary yard is kept", () => {
  const { store } = makeStore();
  fillPlan(store, { dogCount: "3", yardSize: "s", frequency: "custom" });
  assert.deepEqual(store.set({ dogCount: "4" }).notices, []);
  assert.equal(store.getState().frequency, "custom");
  assert.deepEqual(store.set({ yardSize: "m" }).notices, []);
  assert.equal(store.getState().frequency, "custom");
});

test("an explicit frequency sent together with the dog count wins and needs no notice", () => {
  const { store } = makeStore();
  fillPlan(store, { dogCount: "3", frequency: "weekly" });
  const result = store.set({ dogCount: "6", frequency: "twice" });
  assert.equal(store.getState().frequency, "twice");
  assert.deepEqual(result.notices, []);
  assert.deepEqual(result.rejected, []);
});

test("a frequency that is not allowed cannot be set, and the refusal says why", () => {
  const { store } = makeStore();
  store.set({ dogCount: "6", yardSize: "s" });
  const weekly = store.set({ frequency: "weekly" });
  assert.equal(store.getState().frequency, "");
  assert.deepEqual(weekly.rejected, [{ field: "frequency", value: "weekly", reason: "Available for up to 5 dogs." }]);
  assert.equal(weekly.ok, false);
  const biweekly = store.set({ frequency: "biweekly" });
  assert.equal(biweekly.rejected[0].reason, "Available for up to 4 dogs.");
  store.set({ dogCount: "10" });
  store.set({ frequency: "" });
  assert.equal(store.set({ frequency: "twice" }).rejected[0].reason, "Available for up to 9 dogs.");
  store.set({ dogCount: "2", yardSize: "over" });
  assert.equal(store.set({ frequency: "onetime" }).rejected[0].reason, "Choose Custom booking for yards over 1 acre.");
});

test("eligibility table (spec 4.2.1)", () => {
  const open = (dogs, yard) => core.FREQUENCIES.map((f) => f.id).filter((id) => core.frequencyEligibility(id, dogs, yard).allowed);
  for (const dogs of ["1", "2", "3", "4"]) assert.deepEqual(open(dogs, "s"), ["twice", "weekly", "biweekly", "onetime", "custom"]);
  assert.deepEqual(open("5", "m"), ["twice", "weekly", "onetime", "custom"]);
  for (const dogs of ["6", "7", "8", "9"]) assert.deepEqual(open(dogs, "xl"), ["twice", "onetime", "custom"]);
  assert.deepEqual(open("10", "l"), ["onetime", "custom"]);
  for (const dogs of ["", "1", "5", "10"]) assert.deepEqual(open(dogs, "over"), ["custom"]);
  // Not chosen yet: only the yard rule applies.
  assert.deepEqual(open("", ""), ["twice", "weekly", "biweekly", "onetime", "custom"]);
  // The yard reason wins when both apply.
  assert.equal(core.frequencyEligibility("weekly", "9", "over").code, "YARD_OVER_ONE_ACRE");
  assert.equal(core.frequencyEligibility("weekly", "9", "s").code, "TOO_MANY_DOGS");
  assert.equal(core.frequencyEligibility("nonsense", "1", "s").allowed, false);
});

test("the engine never changes the frequency silently: every engine-made change carries a notice", () => {
  const dogValues = ["", "1", "4", "5", "6", "9", "10"];
  const yardValues = ["", "s", "xl", "over"];
  const frequencies = ["", "twice", "weekly", "biweekly", "onetime", "custom"];
  let transitions = 0;
  for (const startDogs of dogValues) for (const startYard of yardValues) for (const startFrequency of frequencies) {
    for (const nextDogs of dogValues) for (const nextYard of yardValues) {
      const { store } = makeStore();
      store.set({ dogCount: startDogs, yardSize: startYard });
      store.set({ frequency: startFrequency });
      const before = store.getState().frequency;
      const result = store.set({ dogCount: nextDogs, yardSize: nextYard });
      const after = store.getState().frequency;
      transitions += 1;
      const label = JSON.stringify({ startDogs, startYard, before, nextDogs, nextYard, after });
      if (after !== before) {
        const notice = frequencyNotice(result);
        assert.ok(notice, "frequency changed without a notice: " + label);
        assert.ok(notice.message.length > 20, label);
        assert.equal(notice.previous, before, label);
        assert.equal(notice.current, after, label);
      } else {
        assert.equal(frequencyNotice(result), null, "a notice without a change: " + label);
      }
      // Whatever happened, the result is allowed.
      if (after) assert.equal(core.frequencyEligibility(after, nextDogs, nextYard).allowed, true, label);
      // And custom never stays behind once neither reason applies, unless it was there for no reason before.
      const neededBefore = Number(startDogs) >= 10 || startYard === "over";
      const neededNow = Number(nextDogs) >= 10 || nextYard === "over";
      if (before === "custom" && neededBefore && !neededNow) assert.equal(after, "", "custom stuck: " + label);
    }
  }
  assert.equal(transitions, 7 * 4 * 6 * 7 * 4);
});

test("saved progress is reconciled when it is restored", () => {
  // A combination that is not allowed today is repaired, not trusted.
  const stale = fakeStorage({ pp_quote_progress_v3: JSON.stringify({ zip: "46032", dogCount: "6", frequency: "weekly", areas: ["back"], yardSize: "s", lastCleaned: "", customerStatus: "" }) });
  const repaired = makeStore({ storage: stale }).store;
  assert.equal(repaired.getState().frequency, "");
  assert.equal(repaired.initialNotices.length, 1);
  assert.equal(repaired.initialNotices[0].code, "FREQUENCY_CLEARED");

  // 10+ dogs with nothing chosen: custom is selected, as the live tool does.
  const tenDogs = fakeStorage({ pp_quote_progress_v3: JSON.stringify({ zip: "46032", dogCount: "10", frequency: "", areas: [], yardSize: "", lastCleaned: "", customerStatus: "" }) });
  const restored = makeStore({ storage: tenDogs }).store;
  assert.equal(restored.getState().frequency, "custom");
  // ...and it is still released when the dog count comes down.
  assert.equal(frequencyNotice(restored.set({ dogCount: "2" })).code, "CUSTOM_RELEASED");
});

test("past the plan questions, a cleared frequency takes the visitor back to choose, then returns them", () => {
  const { store } = makeStore();
  fillPlan(store, { dogCount: "4", frequency: "biweekly" });
  assert.equal(store.goTo("price").ok, true);
  assert.equal(store.next().step, "request");
  fillDetails(store, "service_request", "text");

  // One-tap change of the dog count while on the request step.
  const result = store.set({ dogCount: "5" });
  assert.equal(result.movedTo, "frequency");
  assert.equal(store.getState().step, "frequency");
  assert.equal(store.getState().editReturn, "request");
  assert.equal(frequencyNotice(result).code, "FREQUENCY_CLEARED");
  assert.equal(store.getState().termsAccepted, false, "the terms must be agreed again");
  assert.ok(result.notices.some((notice) => notice.code === "TERMS_CLEARED"));
  // Contact details are kept.
  assert.equal(store.getState().firstName, "Test");
  assert.equal(store.getState().smsConsent, true);

  // Cannot go on until a frequency is chosen.
  assert.equal(store.flow().canContinue, false);
  assert.equal(store.flow().blockedReason, "Choose a service frequency.");
  assert.equal(store.next().ok, false);
  store.set({ frequency: "weekly" });
  assert.equal(store.flow().next, "request");
  assert.equal(store.next().step, "request");
  assert.equal(store.getState().editReturn, "");
});

test("renamed frequencies are used in notices and reasons", () => {
  const { store } = makeStore({ options: { frequencyLabels: { custom: "Custom quote", biweekly: "Every 2 weeks" } } });
  fillPlan(store, { dogCount: "4", frequency: "biweekly" });
  assert.match(frequencyNotice(store.set({ dogCount: "5" })).message, /^Every 2 weeks is available for up to 4 dogs/);
  assert.match(frequencyNotice(store.set({ yardSize: "over" })).message, /Custom quote is selected/);
  assert.equal(store.frequencyOptions().find((option) => option.id === "weekly").reason, "Choose Custom quote for yards over 1 acre");
  assert.equal(store.frequencyOptions().find((option) => option.id === "custom").label, "Custom quote");
  // The payload still carries the Worker's own label.
  store.set({ areas: ["back"] });
  fillDetails(store, "service_request", "text");
  assert.equal(store.buildPayload().payload.frequency, "Custom booking");
});

test("reconcileFrequency as a pure function", () => {
  const none = core.reconcileFrequency({ dogCount: "", yardSize: "" }, { dogCount: "3", yardSize: "s", frequency: "" });
  assert.deepEqual(none, { frequency: "", notice: null });
  const kept = core.reconcileFrequency({ dogCount: "3", yardSize: "s" }, { dogCount: "5", yardSize: "s", frequency: "weekly" });
  assert.deepEqual(kept, { frequency: "weekly", notice: null });
  const cleared = core.reconcileFrequency({ dogCount: "5", yardSize: "s" }, { dogCount: "6", yardSize: "s", frequency: "weekly" });
  assert.equal(cleared.frequency, "");
  assert.equal(cleared.notice.code, "FREQUENCY_CLEARED");
  const unknown = core.reconcileFrequency({ dogCount: "", yardSize: "" }, { dogCount: "3", yardSize: "s", frequency: "monthly" });
  assert.equal(unknown.frequency, "", "an unknown stored value is dropped");
});
