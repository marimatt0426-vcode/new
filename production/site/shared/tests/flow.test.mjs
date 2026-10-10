// The order of questions in this rebuild, Back, the primary action, skipping
// the ZIP question, one-tap editing, and what the pinned price bar shows.
import test from "node:test";
import assert from "node:assert/strict";
import { core, makeStore, fakeStorage, fillPlan, fillDetails, readyStore } from "./helpers/make-store.mjs";

test("the flow order is dogs, ZIP, yard, areas, frequency, price, request, confirm, done", () => {
  assert.deepEqual(core.STEPS, ["dogs", "zip", "yard", "areas", "frequency", "price", "request", "confirm", "done"]);
  assert.deepEqual(core.PLAN_STEPS, ["dogs", "zip", "yard", "areas", "frequency"]);
  const { store } = makeStore();
  const flow = store.flow();
  assert.equal(flow.current, "dogs");
  assert.deepEqual(flow.steps.map((step) => step.id), core.STEPS);
  assert.deepEqual(flow.order, core.STEPS);
  assert.equal(flow.steps.every((step) => step.complete === false), true);
  assert.deepEqual(flow.steps.filter((step) => step.reachable).map((step) => step.id), ["dogs"]);
  assert.equal(flow.back, "");
  assert.equal(flow.firstIncomplete, "dogs");
});

test("nothing is preselected", () => {
  const state = makeStore().store.getState();
  assert.equal(state.dogCount, "");
  assert.equal(state.zip, "");
  assert.equal(state.yardSize, "");
  assert.deepEqual(state.areas, []);
  assert.equal(state.frequency, "");
  assert.equal(state.customerStatus, "");
  assert.equal(state.smsConsent, false);
  assert.equal(state.termsAccepted, false);
  assert.equal(state.startTiming, "");
  assert.equal(state.lastCleaned, "");
});

test("each plan question blocks the primary action until it is answered, and says why", () => {
  const { store } = makeStore();
  const expectations = [
    ["dogs", "Choose the number of dogs.", { dogCount: "2" }],
    ["zip", "Enter a valid 5-digit ZIP code.", { zip: "46032" }],
    ["yard", "Choose the serviced yard size.", { yardSize: "m" }],
    ["areas", "Choose at least one service area.", { areas: ["back"] }],
    ["frequency", "Choose a service frequency.", { frequency: "weekly" }]
  ];
  for (const [step, reason, answer] of expectations) {
    const before = store.flow();
    assert.equal(before.current, step);
    assert.equal(before.primaryAction, "next");
    assert.equal(before.canContinue, false, step);
    assert.equal(before.blockedReason, reason, step);
    assert.equal(before.disablePrimary, true, "plan questions disable the button until answered");
    assert.equal(store.next().ok, false, step + " cannot be skipped");
    assert.equal(store.next().reason, reason);
    store.set(answer);
    const after = store.flow();
    assert.equal(after.canContinue, true, step);
    assert.equal(after.blockedReason, "");
    assert.equal(store.next().ok, true);
  }
  assert.equal(store.getState().step, "price");
});

test("walking forward to confirm and back again, one step at a time", () => {
  const { store } = makeStore();
  const visited = [store.getState().step];
  store.set({ dogCount: "2" }); visited.push(store.next().step);
  store.set({ zip: "46032" }); visited.push(store.next().step);
  store.set({ yardSize: "m" }); visited.push(store.next().step);
  store.toggleArea("back"); visited.push(store.next().step);
  store.set({ frequency: "weekly" }); visited.push(store.next().step);
  visited.push(store.next().step);
  fillDetails(store, "service_request", "text");
  visited.push(store.next().step);
  assert.deepEqual(visited, ["dogs", "zip", "yard", "areas", "frequency", "price", "request", "confirm"]);
  assert.equal(store.flow().primaryAction, "submit");
  assert.equal(store.flow().next, "done");
  assert.equal(store.next().ok, false, "the confirm step is finished by submit(), not next()");

  const backwards = [];
  for (let count = 0; count < 7; count += 1) {
    assert.ok(store.flow().back, "Back exists on " + store.getState().step);
    backwards.push(store.back().step);
  }
  assert.deepEqual(backwards, ["request", "price", "frequency", "areas", "yard", "zip", "dogs"]);
  assert.equal(store.flow().back, "");
  assert.equal(store.back().ok, false);
  // Going back kept every answer.
  assert.equal(store.validatePlan().ok, true);
  assert.equal(store.getState().firstName, "Test");
});

test("goTo refuses a step whose earlier questions are unanswered and names the one to finish", () => {
  const { store } = makeStore();
  assert.deepEqual(store.goTo("yard"), { ok: false, step: "dogs", reason: "Choose the number of dogs.", needs: "dogs" });
  store.set({ dogCount: "1" });
  assert.equal(store.goTo("zip").ok, true);
  assert.deepEqual(store.goTo("areas"), { ok: false, step: "zip", reason: "Enter a valid 5-digit ZIP code.", needs: "zip" });
  assert.equal(store.goTo("price").ok, false);
  assert.equal(store.goTo("done").ok, false);
  assert.equal(store.goTo("nowhere").ok, false);
  fillPlan(store);
  assert.equal(store.goTo("request").ok, true);
  const confirm = store.goTo("confirm");
  assert.equal(confirm.ok, false);
  assert.equal(confirm.needs, "request");
  fillDetails(store, "service_request", "text");
  assert.equal(store.goTo("confirm").ok, true);
  // Going back to any earlier step is always allowed.
  assert.equal(store.goTo("dogs").ok, true);
});

test("areas: each tile toggles on and off, and the shortcut selects or clears all three", () => {
  const { store } = makeStore();
  store.set({ dogCount: "2", zip: "46032", yardSize: "s" });
  store.goTo("areas");
  assert.equal(store.flow().canContinue, false);
  store.toggleArea("front");
  assert.deepEqual(store.getState().areas, ["front"]);
  assert.equal(store.flow().canContinue, true);
  store.toggleArea("back");
  assert.deepEqual(store.getState().areas, ["front", "back"], "in the order chosen");
  store.toggleArea("front");
  assert.deepEqual(store.getState().areas, ["back"], "tapping again removes it");
  store.toggleArea("back");
  assert.deepEqual(store.getState().areas, []);
  assert.equal(store.flow().canContinue, false, "Next is disabled again with none chosen");
  store.toggleAllAreas();
  assert.deepEqual(store.getState().areas, ["back", "front", "side"]);
  store.toggleAllAreas();
  assert.deepEqual(store.getState().areas, []);
  store.toggleArea("side");
  store.toggleAllAreas();
  assert.deepEqual(store.getState().areas, ["back", "front", "side"]);
  // Unknown areas are refused.
  assert.equal(store.toggleArea("garage").rejected.length, 1);
  assert.deepEqual(store.getState().areas, ["back", "front", "side"]);
});

test("a city page's ZIP is pre-filled, the ZIP question is skipped, and it can still be changed", () => {
  const { store } = makeStore({ options: { pageZip: "46074", pageCity: "Westfield" } });
  assert.equal(store.getState().zip, "46074");
  assert.equal(store.getState().zipSource, "page");
  const flow = store.flow();
  assert.equal(flow.zipSkipped, true);
  assert.deepEqual(flow.order, ["dogs", "yard", "areas", "frequency", "price", "request", "confirm", "done"]);
  assert.equal(flow.steps.find((step) => step.id === "zip").skipped, true);
  assert.equal(flow.steps.find((step) => step.id === "zip").complete, true);

  store.set({ dogCount: "2" });
  assert.equal(store.next().step, "yard", "straight from dogs to yard size");
  assert.equal(store.flow().back, "dogs", "and Back skips it too");

  // The pre-filled ZIP is an answer the visitor can change.
  store.set({ yardSize: "s" });
  const editing = store.edit("zip");
  assert.equal(editing.ok, true);
  assert.equal(store.getState().step, "zip");
  assert.equal(store.flow().back, "dogs");
  store.set({ zip: "46062" });
  assert.equal(store.getState().zipSource, "typed");
  assert.equal(store.flow().zipSkipped, false, "a typed ZIP is no longer a skipped question");
  assert.equal(store.next().step, "areas", "on to the first unanswered question");
});

test("a ZIP in the URL (?zip=) is honoured and the ZIP question is skipped", () => {
  const { store } = makeStore({ url: "https://itspurgepros.com/?zip=46032&utm_source=meta" });
  assert.equal(store.getState().zip, "46032");
  assert.equal(store.getState().zipSource, "url");
  assert.equal(store.getState().step, "dogs");
  assert.equal(store.flow().zipSkipped, true);
  assert.equal(store.getState().city, "Carmel");

  // Out of area: the out-of-area answer shows at once, with nothing else asked first.
  const outside = makeStore({ url: "https://itspurgepros.com/?zip=46201" }).store;
  assert.equal(outside.getState().step, "zip");
  assert.equal(outside.checkZip().status, "out_of_area");
  assert.equal(outside.flow().zipSkipped, false);
  assert.equal(outside.flow().canContinue, false);
  // Correcting it carries on with the first unanswered question.
  outside.set({ zip: "46032" });
  assert.equal(outside.next().step, "dogs");

  // Anything that is not five digits is ignored.
  for (const value of ["4603", "abcde", "", "460321"]) {
    const ignored = makeStore({ url: "https://itspurgepros.com/?zip=" + value }).store;
    assert.equal(ignored.getState().zip, "", value);
    assert.equal(ignored.getState().step, "dogs");
  }
});

test("which ZIP wins: the visitor's own saved ZIP, then a ?zip= in the address, then the page's", () => {
  const saved = () => fakeStorage({ pp_quote_progress_v3: JSON.stringify({ zip: "46032", dogCount: "2", frequency: "", areas: [], yardSize: "", lastCleaned: "", customerStatus: "" }) });
  const pageOnly = makeStore({ options: { pageZip: "46074" } }).store;
  assert.equal(pageOnly.getState().zip, "46074");

  const savedBeatsPage = makeStore({ storage: saved(), options: { pageZip: "46074" } }).store;
  assert.equal(savedBeatsPage.getState().zip, "46032");
  assert.equal(savedBeatsPage.getState().zipSource, "storage");
  assert.equal(savedBeatsPage.flow().zipSkipped, false, "a carried-over ZIP is an answered question, not a skipped one");

  // A ?zip= beats the page's own ZIP...
  const urlBeatsPage = makeStore({ url: "https://itspurgepros.com/westfield?zip=46123", options: { pageZip: "46074" } }).store;
  assert.equal(urlBeatsPage.getState().zip, "46123");
  assert.equal(urlBeatsPage.getState().zipSource, "url");
  // ...but not a ZIP the visitor already has, when nothing says this is a new
  // arrival: it may be the same address being read again by a refresh.
  const savedBeatsUrl = makeStore({ url: "https://itspurgepros.com/westfield?zip=46123", storage: saved(), options: { pageZip: "46074" } }).store;
  assert.equal(savedBeatsUrl.getState().zip, "46032");
  assert.equal(savedBeatsUrl.getState().zipSource, "storage");
  assert.deepEqual(savedBeatsUrl.trackLog, [], "and nothing is counted");
  // A new arrival is different: an open instruction beside the ZIP, or a
  // browser that reports a fresh navigation, means the visitor just typed it.
  for (const [label, url, navigationType] of [
    ["?open_quote=1 beside it", "https://itspurgepros.com/westfield?open_quote=1&zip=46123", undefined],
    ["#quote beside it", "https://itspurgepros.com/westfield?zip=46123#quote", undefined],
    ["a fresh navigation", "https://itspurgepros.com/westfield?zip=46123", () => "navigate"]
  ]) {
    const arrived = makeStore({ url, storage: saved(), options: Object.assign({ pageZip: "46074" }, navigationType ? { navigationType } : {}) }).store;
    assert.equal(arrived.getState().zip, "46123", label);
    assert.equal(arrived.getState().zipSource, "url", label);
  }

  // A page ZIP that is not accepted is ignored rather than trusted.
  const badPage = makeStore({ options: { pageZip: "46201" } }).store;
  assert.equal(badPage.getState().zip, "");
});

test("one-tap editing returns to where the visitor was once the plan is complete again", () => {
  const { store } = makeStore();
  fillPlan(store);
  store.goTo("price");
  const editing = store.edit("dogs");
  assert.deepEqual(editing, { ok: true, step: "dogs", reason: "", returnTo: "price" });
  assert.equal(store.flow().editReturn, "price");
  store.set({ dogCount: "3" });
  assert.equal(store.flow().next, "price");
  assert.equal(store.next().step, "price");
  assert.equal(store.getState().editReturn, "");
  assert.equal(store.quote().priceCents, 2499 + 250 + 400);

  // If the edit leaves a question unanswered, that question comes first.
  store.edit("yard");
  store.set({ yardSize: "over" });
  assert.equal(store.getState().frequency, "custom");
  assert.equal(store.next().step, "price", "custom was selected for them, so the plan is complete");
  store.edit("dogs");
  store.set({ dogCount: "6" });
  store.set({ yardSize: "s" });
  assert.equal(store.getState().frequency, "", "custom was released");
  assert.equal(store.flow().next, "frequency");
  assert.equal(store.next().step, "frequency");
  store.set({ frequency: "twice" });
  assert.equal(store.next().step, "price");
});

test("editing from confirm unticks the terms and returns to confirm, or to the request form if it is no longer valid", () => {
  const { store } = makeStore();
  fillPlan(store);
  store.goTo("request");
  fillDetails(store, "service_request", "text");
  store.next();
  assert.equal(store.getState().step, "confirm");
  assert.equal(store.getState().termsAccepted, true);

  store.edit("areas");
  assert.equal(store.getState().termsAccepted, false, "any edit unticks the terms box");
  store.toggleArea("side");
  assert.equal(store.next().step, "confirm");
  assert.equal(store.flow().canContinue, false);
  assert.equal(store.flow().blockedErrors[0].field, "termsAccepted");
  // Contact details and text consent stay as they were.
  assert.equal(store.getState().smsConsent, true);
  assert.equal(store.getState().phone, "(317) 555-0100");

  // An edit to the request form itself.
  store.edit("request");
  store.set({ firstName: "" });
  assert.equal(store.next().ok, false);
  store.set({ firstName: "Test" });
  assert.equal(store.next().step, "confirm");
});

test("the request step keeps its button enabled and lists every problem; confirm submits", () => {
  const { store } = makeStore();
  fillPlan(store);
  store.goTo("request");
  const flow = store.flow();
  assert.equal(flow.disablePrimary, false, "pressing it shows the error summary");
  assert.equal(flow.canContinue, false);
  assert.ok(flow.blockedErrors.length >= 6);
  assert.ok(flow.blockedErrors.every((error) => error.field && error.message && error.step === "request"));
  assert.equal(flow.blockedReason, flow.blockedErrors[0].message);
  const blocked = store.next();
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.errors.map((error) => error.field), flow.blockedErrors.map((error) => error.field));
});

test("with 10+ dogs the frequency step is still visited even though custom is already selected", () => {
  const { store } = makeStore();
  store.set({ dogCount: "10" });
  store.next();
  store.set({ zip: "46032" });
  store.next();
  store.set({ yardSize: "s" });
  store.next();
  store.toggleArea("back");
  assert.equal(store.flow().firstIncomplete, "");
  assert.equal(store.next().step, "frequency");
  assert.equal(store.flow().canContinue, true);
  assert.equal(store.next().step, "price");
  assert.equal(store.quote().custom, true);
});

test("progress carried from another page: every answered question is shown again, one step at a time", () => {
  const storage = fakeStorage({ pp_quote_progress_v3: JSON.stringify({ zip: "46032", dogCount: "2", frequency: "weekly", areas: ["back"], yardSize: "s", lastCleaned: "", customerStatus: "" }) });
  const { store } = makeStore({ storage });
  assert.equal(store.getState().step, "dogs");
  assert.equal(store.flow().resumeAt, "price");
  assert.equal(store.flow().firstIncomplete, "");
  const path = [];
  for (let count = 0; count < 5; count += 1) path.push(store.next().step);
  assert.deepEqual(path, ["zip", "yard", "areas", "frequency", "price"]);

  // With one answer missing, Continue goes straight to it.
  const partial = fakeStorage({ pp_quote_progress_v3: JSON.stringify({ zip: "46032", dogCount: "2", frequency: "", areas: [], yardSize: "", lastCleaned: "", customerStatus: "" }) });
  const second = makeStore({ storage: partial }).store;
  assert.equal(second.flow().resumeAt, "yard");
  assert.equal(second.next().step, "yard");
});

test("intents: all three for a priced plan, only a request for a custom estimate", () => {
  const { store } = makeStore();
  assert.equal(store.intentOptions().every((option) => !option.available), true, "none before the plan is complete");
  fillPlan(store);
  assert.deepEqual(store.intentOptions().map((option) => [option.id, option.label, option.available, option.stage]), [
    ["service_request", "Request service", true, "service_requested"],
    ["quote_delivery", "Send me this quote", true, "quote_requested"],
    ["question", "Ask a question", true, "question_submitted"]
  ]);
  store.set({ intent: "question" });
  assert.equal(store.intentOptions().find((option) => option.selected).id, "question");

  // The plan becomes a custom estimate: the intent falls back to a request, with a notice.
  const change = store.set({ frequency: "custom" });
  assert.equal(store.getState().intent, "service_request");
  assert.ok(change.notices.some((notice) => notice.code === "INTENT_RESET"));
  assert.deepEqual(store.intentOptions().map((option) => [option.id, option.label, option.available, option.stage]), [
    ["service_request", "Request my estimate", true, "estimate_requested"],
    ["quote_delivery", "Send me this quote", false, "quote_requested"],
    ["question", "Ask a question", false, "question_submitted"]
  ]);
  const refused = store.set({ intent: "quote_delivery" });
  assert.equal(refused.rejected[0].field, "intent");
  assert.equal(store.getState().intent, "service_request");
});

test("the 'Weekly visits from $19.99' line shows only while it is true and useful", () => {
  const { store } = makeStore();
  assert.deepEqual(store.fromLine(), { text: "Weekly visits from $19.99", cents: 1999, label: "$19.99" });
  for (const dogs of ["1", "2", "3", "4", "5"]) {
    store.set({ dogCount: dogs });
    assert.ok(store.fromLine(), dogs + " dogs");
  }
  for (const dogs of ["6", "7", "8", "9", "10"]) {
    store.set({ frequency: "" });
    store.set({ dogCount: dogs });
    assert.equal(store.fromLine(), null, dogs + " dogs: weekly is not offered above 5");
  }
  store.set({ frequency: "" });
  store.set({ dogCount: "2" });
  assert.ok(store.fromLine());
  store.set({ yardSize: "over" });
  assert.equal(store.fromLine(), null, "over 1 acre is custom only");
  store.set({ yardSize: "m" });
  store.set({ frequency: "" });
  assert.ok(store.fromLine());
  store.set({ frequency: "twice" });
  assert.equal(store.fromLine(), null, "a different frequency is already chosen");
  store.set({ frequency: "weekly" });
  assert.ok(store.fromLine(), "weekly chosen, areas still unanswered");
  store.set({ areas: ["back"] });
  assert.equal(store.fromLine(), null, "the exact price is known");
  assert.equal(store.quote().priceText, "$26.49 per visit");
});

test("the pinned bar: hidden before the first answer, then from-price, exact price or custom", () => {
  const { store } = makeStore();
  assert.equal(store.priceBar().visible, false);
  assert.equal(store.priceBar().kind, "from");

  store.set({ dogCount: "2" });
  let bar = store.priceBar();
  assert.equal(bar.visible, true);
  assert.equal(bar.kind, "from");
  assert.equal(bar.headline, "Weekly visits from $19.99");
  assert.equal(bar.continueStep, "zip");
  assert.equal(bar.continueEnabled, true);

  store.set({ zip: "46032", yardSize: "m", areas: ["back", "front"] });
  assert.equal(store.priceBar().kind, "from");
  assert.equal(store.priceBar().continueStep, "frequency");

  store.set({ frequency: "weekly" });
  bar = store.priceBar();
  assert.equal(bar.kind, "exact");
  assert.equal(bar.headline, "$28.99 per visit");
  assert.equal(bar.priceCents, 2899);
  assert.equal(bar.unit, "per visit");
  assert.equal(bar.continueStep, "price");
  assert.equal(bar.detail, "2 dogs · Weekly · Up to ¼ acre");

  store.set({ frequency: "onetime" });
  assert.equal(store.priceBar().headline, "$89.99 base price");

  store.set({ frequency: "custom" });
  bar = store.priceBar();
  assert.equal(bar.kind, "custom");
  assert.equal(bar.headline, "Custom estimate");
  assert.equal(bar.priceCents, null, "a custom estimate never shows a price");

  // 6 dogs, nothing else: no from-price to show.
  const six = makeStore().store;
  six.set({ dogCount: "6" });
  assert.equal(six.priceBar().kind, "building");
  assert.equal(six.priceBar().priceCents, null);

  // Past the plan, Continue stays where the visitor is.
  store.set({ frequency: "weekly" });
  store.goTo("request");
  assert.equal(store.priceBar().continueStep, "request");
});

test("a city page's own ZIP is not an answer: the bar stays hidden until the visitor answers", () => {
  const { store } = makeStore({ options: { pageZip: "46074" } });
  assert.equal(store.priceBar().visible, false);
  store.set({ dogCount: "1" });
  assert.equal(store.priceBar().visible, true);

  // Progress carried from another page IS the visitor's: the bar follows them.
  const storage = fakeStorage({ pp_quote_progress_v3: JSON.stringify({ zip: "", dogCount: "3", frequency: "", areas: [], yardSize: "", lastCleaned: "", customerStatus: "" }) });
  assert.equal(makeStore({ storage }).store.priceBar().visible, true);
});

test("plan summary rows name the step that edits each answer", () => {
  const { store } = makeStore();
  fillPlan(store);
  assert.deepEqual(store.planSummary(), [
    { key: "dogs", label: "Dogs", value: "2 dogs", step: "dogs" },
    { key: "zip", label: "ZIP", value: "46032 · Carmel", step: "zip" },
    { key: "yard", label: "Yard size", value: "Up to ¼ acre", step: "yard" },
    { key: "areas", label: "Service area", value: "Back yard, Front yard", step: "areas" },
    { key: "frequency", label: "Frequency", value: "Weekly", step: "frequency" },
    { key: "price", label: "Price", value: "$28.99 per visit", step: "price" }
  ]);
  for (const row of store.planSummary().slice(0, 5)) assert.equal(store.edit(row.step).ok, true, row.key);
});

test("reset starts again from the first question and forgets everything", () => {
  const { store, storage } = readyStore();
  store.goTo("confirm");
  assert.equal(store.reset(), true);
  const state = store.getState();
  assert.equal(state.step, "dogs");
  assert.equal(state.dogCount, "");
  assert.equal(state.zip, "");
  assert.equal(state.firstName, "");
  assert.equal(state.phone, "");
  assert.equal(state.smsConsent, false);
  assert.equal(state.termsAccepted, false);
  assert.equal(state.city, "");
  assert.equal(Object.prototype.hasOwnProperty.call(storage.items, "pp_quote_progress_v3"), false);
  assert.equal(store.priceBar().visible, false);

  // On a city page the page's ZIP comes back after a reset.
  const city = makeStore({ options: { pageZip: "46074" } }).store;
  city.set({ zip: "46032" });
  city.reset();
  assert.equal(city.getState().zip, "46074");
  assert.equal(city.getState().zipSource, "page");
});

test("snapshots are frozen, shared until something changes, and subscribers hear every change", () => {
  const { store } = makeStore();
  const first = store.getState();
  assert.equal(store.getState(), first, "the same object until a change");
  assert.throws(() => { first.dogCount = "9"; });
  assert.throws(() => { first.areas.push("back"); });
  const heard = [];
  const unsubscribe = store.subscribe((state, info) => heard.push([info.reason, info.changed.join(","), state.dogCount]));
  store.set({ dogCount: "2" });
  const second = store.getState();
  assert.notEqual(second, first);
  assert.equal(first.dogCount, "", "the old snapshot did not change");
  store.set({ dogCount: "2" });
  assert.equal(store.getState(), second, "setting the same value changes nothing");
  store.next();
  unsubscribe();
  store.set({ dogCount: "3" });
  assert.deepEqual(heard, [["set", "dogCount", "2"], ["next", "step", "2"]]);
});

test("set() refuses unknown fields and bad values without touching the state", () => {
  const { store } = makeStore();
  const result = store.set({ step: "price", receipt: { requestId: "x" }, dogCount: "2", nonsense: true });
  assert.equal(result.ok, false);
  assert.deepEqual(result.rejected.map((entry) => entry.field).sort(), ["nonsense", "receipt", "step"]);
  assert.deepEqual(result.changed, ["dogCount"]);
  assert.equal(store.getState().step, "dogs");
  assert.equal(store.getState().receipt, null);
  assert.equal(store.set(null).ok, true);
  assert.equal(store.set({ dogCount: 3 }).changed[0], "dogCount", "a number is accepted for dogs");
  assert.equal(store.getState().dogCount, "3");
});
