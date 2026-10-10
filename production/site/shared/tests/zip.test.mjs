// Coverage check, the out-of-area stop, and the city pre-fill.
import test from "node:test";
import assert from "node:assert/strict";
import { core, makeStore, fillPlan, fillDetails, readyStore } from "./helpers/make-store.mjs";

test("checkZip: empty, incomplete, in area (with city), out of area", () => {
  assert.equal(core.checkZip("").status, "empty");
  assert.equal(core.checkZip(null).status, "empty");
  assert.equal(core.checkZip(undefined).status, "empty");
  assert.equal(core.checkZip("4603").status, "incomplete");
  assert.equal(core.checkZip("4603").message, "Enter a valid 5-digit ZIP code.");
  assert.equal(core.checkZip("4603").complete, false);

  const carmel = core.checkZip("46032");
  assert.deepEqual(carmel, { status: "in_area", zip: "46032", complete: true, inArea: true, contactAllowed: true, community: "Carmel", city: "Carmel", alternates: [], page: "/carmel", poBox: false, message: "" });

  const outside = core.checkZip("46201");
  assert.equal(outside.status, "out_of_area");
  assert.equal(outside.inArea, false);
  assert.equal(outside.contactAllowed, false, "out of area never allows contact capture");
  assert.equal(outside.message, "We do not service ZIP 46201 yet.");
  assert.equal(outside.city, "");

  // Only digits count, and only the first five.
  assert.equal(core.checkZip(" 46032 ").status, "in_area");
  assert.equal(core.checkZip("46032-1234").zip, "46032");
  assert.equal(core.checkZip("4a6b0c3d2").zip, "46032");
  assert.equal(core.checkZip(46032).status, "in_area");
});

test("all 53 accepted ZIPs are in area with a community and a city; everything else is not", () => {
  for (const zip of core.SERVICE_ZIPS) {
    const check = core.checkZip(zip);
    assert.equal(check.status, "in_area", zip);
    assert.ok(check.community, zip + " has a community");
    assert.ok(check.city, zip + " has a city to pre-fill");
  }
  let inArea = 0;
  for (let number = 46000; number <= 46299; number += 1) {
    if (core.checkZip(String(number)).inArea) inArea += 1;
  }
  assert.equal(inArea, 53);
  // ZIPs the city notes call out as NOT accepted.
  for (const zip of ["46012", "46017", "46226", "46235", "46201", "46204"]) assert.equal(core.checkZip(zip).status, "out_of_area", zip);
});

test("typing a ZIP: digits only, five at most, and the answer is immediate", () => {
  const { store } = makeStore();
  store.set({ zip: "46a03" });
  assert.equal(store.getState().zip, "4603");
  assert.equal(store.checkZip().status, "incomplete");
  store.set({ zip: "460329999" });
  assert.equal(store.getState().zip, "46032");
  assert.equal(store.checkZip().status, "in_area");
  assert.equal(store.getState().zipSource, "typed");
  store.set({ zip: "" });
  assert.equal(store.getState().zipSource, "");
});

test("an out-of-area ZIP stops everything and collects nothing", () => {
  const { store, storage } = readyStore();
  assert.equal(store.validateSubmit().ok, true);
  const result = store.set({ zip: "46201" });
  assert.ok(result.notices.some((notice) => notice.code === "ZIP_OUT_OF_AREA" && notice.message === "We do not service ZIP 46201 yet."));

  // The flow is stopped at the ZIP question.
  assert.equal(store.flow("zip").canContinue, false);
  assert.equal(store.flow("zip").blockedReason, "We do not service ZIP 46201 yet.");
  assert.equal(store.goTo("yard").ok, false);
  assert.equal(store.goTo("price").ok, false);
  assert.equal(store.goTo("request").ok, false);

  // Nothing can be validated, built, sent or saved.
  assert.equal(store.validatePlan().byField.zip, "We do not service ZIP 46201 yet.");
  assert.equal(store.buildPayload().ok, false);
  assert.equal(store.intentOptions().every((option) => option.available === false), true);

  // The pinned bar says so and shows no price.
  assert.equal(store.priceBar().kind, "out_of_area");
  assert.equal(store.priceBar().priceCents, null);
  assert.equal(store.priceBar().continueStep, "zip");
  assert.equal(store.fromLine(), null);

  // The out-of-area ZIP is not kept in storage.
  assert.equal(JSON.parse(storage.items.pp_quote_progress_v3).zip, "");
});

test("an out-of-area ZIP cannot be submitted or saved as a link", async () => {
  const { store, fetchCalls } = readyStore();
  store.set({ zip: "46201" });
  const sent = await store.submit();
  assert.equal(sent.ok, false);
  assert.equal(sent.status, "invalid");
  assert.equal(store.submissionLog.length, 0, "nothing was built or recorded");
  const link = await store.createSaveLink();
  assert.equal(link.ok, false);
  assert.equal(link.status, "not_ready");
  assert.equal(store.submissionLog.length, 0);
  assert.equal(fetchCalls.length, 0);
});

test("the city is pre-filled from the ZIP and stays editable", () => {
  const { store } = makeStore();
  assert.equal(store.getState().city, "");
  store.set({ zip: "46032" });
  assert.equal(store.getState().city, "Carmel");
  assert.equal(store.getState().cityAutoFilled, true);
  // A different ZIP updates a city the visitor has not touched.
  store.set({ zip: "46038" });
  assert.equal(store.getState().city, "Fishers");
  // Once the visitor types a city it is theirs.
  store.set({ city: "Home Place" });
  assert.equal(store.getState().cityAutoFilled, false);
  store.set({ zip: "46074" });
  assert.equal(store.getState().city, "Home Place");
  // Clearing it lets the suggestion come back with the next ZIP.
  store.set({ city: "" });
  store.set({ zip: "46123" });
  assert.equal(store.getState().city, "Avon");
  // An incomplete or out-of-area ZIP removes a suggested city.
  store.set({ zip: "4612" });
  assert.equal(store.getState().city, "");
  store.set({ zip: "46201" });
  assert.equal(store.getState().city, "");
});

test("where one ZIP covers more than one community, the alternates are offered", () => {
  const { store } = makeStore();
  store.set({ zip: "46280" });
  assert.equal(store.getState().city, "Indianapolis");
  assert.deepEqual(store.checkZip().alternates, ["Carmel"]);
  store.set({ zip: "46062" });
  assert.equal(store.getState().city, "Noblesville");
  assert.deepEqual(store.checkZip().alternates, ["Westfield"]);
  // Both Lawrence ZIPs carry the USPS city name Indianapolis.
  store.set({ zip: "46236" });
  assert.equal(store.checkZip().community, "Lawrence");
  assert.equal(store.getState().city, "Indianapolis");
  assert.deepEqual(store.checkZip().alternates, ["Lawrence"]);
});

test("a city page can name its own city, used when it is right for the ZIP", () => {
  const lawrence = makeStore({ options: { pageZip: "46216", pageCity: "Lawrence" } }).store;
  assert.equal(lawrence.getState().city, "Lawrence");
  lawrence.set({ zip: "46236" });
  assert.equal(lawrence.getState().city, "Lawrence");
  // Not used for a ZIP it does not belong to.
  lawrence.set({ zip: "46032" });
  assert.equal(lawrence.getState().city, "Carmel");

  const carmelEdge = makeStore({ options: { pageCity: "carmel" } }).store;
  carmelEdge.set({ zip: "46280" });
  assert.equal(carmelEdge.getState().city, "Carmel", "matched without regard to case, shown in its proper form");
});

test("the ZIP shown in the request step is the same ZIP: editing it re-checks coverage", () => {
  const { store } = makeStore();
  fillPlan(store);
  store.goTo("price");
  store.next();
  fillDetails(store, "service_request", "text");
  assert.equal(store.getState().step, "request");

  // Typing does not throw the visitor out mid-keystroke...
  const typing = store.set({ zip: "4603" });
  assert.equal(typing.movedTo, null);
  assert.equal(store.getState().step, "request");
  // ...but the request cannot go on with an unfinished ZIP.
  assert.equal(store.flow().canContinue, false);
  assert.equal(store.flow().blockedReason, "Enter a valid 5-digit ZIP code.");
  assert.equal(store.validateSubmit().byField.zip, "Enter a valid 5-digit ZIP code.");

  // A different accepted ZIP is fine and updates the suggested city.
  store.set({ zip: "46033" });
  assert.equal(store.getState().step, "request");
  assert.equal(store.getState().city, "Carmel");

  // A complete out-of-area ZIP stops the request and shows the out-of-area answer.
  const outside = store.set({ zip: "46201" });
  assert.equal(outside.movedTo, "zip");
  assert.equal(store.getState().step, "zip");
  assert.equal(store.getState().editReturn, "request");
  assert.equal(store.flow().canContinue, false);

  // Correcting it returns the visitor to the request.
  store.set({ zip: "46032" });
  assert.equal(store.flow().next, "request");
  assert.equal(store.next().step, "request");
});

test("PO Box ZIPs are accepted (the Worker accepts them) and flagged", () => {
  for (const zip of ["46014", "46015", "46061"]) {
    assert.equal(core.checkZip(zip).inArea, true);
    assert.equal(core.checkZip(zip).poBox, true);
  }
  assert.equal(core.SERVICE_ZIPS.filter((zip) => core.checkZip(zip).poBox).length, 3);
});
