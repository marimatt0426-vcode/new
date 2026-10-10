// Regression tests for the defects the independent verifiers reproduced on
// 2026-10-07 (verify/contract-check.mjs, verify/session-check.mjs probes P1
// to P9, and the usability findings). One group per finding. Each test fails
// against the engine as it was before the fix.
//
// Everything here is offline: demo mode, or live mode with a stand-in fetch,
// stand-in tags and an address under .invalid.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { core, makeStore, fakeStorage, fakeLocation, fillPlan, fillDetails, readyStore } from "./helpers/make-store.mjs";
import { widgetText } from "./helpers/live-source.mjs";

const LIVE_PAGE = "https://pages.offline.invalid/carmel";
const LIVE_ENDPOINT = "https://relay.offline.invalid/submit";
const names = (entries) => entries.map((entry) => entry.event);
const plain = (value) => JSON.parse(JSON.stringify(value));

// A live-mode store on an allowed origin, with tags that record what they get.
function livePage(setup) {
  const config = setup || {};
  const calls = [];
  const sinks = {
    gtag: (...args) => calls.push({ sink: "gtag", name: args[1], params: args[2] }),
    fbq: (...args) => calls.push({ sink: "fbq", name: args[1], params: args[2] })
  };
  const made = makeStore({
    url: config.url || LIVE_PAGE,
    storage: config.storage,
    options: Object.assign({
      mode: "live", endpoint: LIVE_ENDPOINT, allowedOrigins: [new URL(LIVE_PAGE).origin], sinks,
      fetch: async (url, init) => ({ ok: true, status: 202, text: async () => JSON.stringify({ accepted: true, requestId: JSON.parse(init.body).requestId }) })
    }, config.options || {})
  });
  made.calls = calls;
  return made;
}

// A complete service request, walked to the confirm step with the terms ticked.
function atConfirm(setup) {
  const made = makeStore(setup);
  const { store } = made;
  fillPlan(store);
  store.goTo("price");
  store.next();
  fillDetails(store, "service_request", "text");
  assert.equal(store.next().step, "confirm");
  assert.equal(store.getState().termsAccepted, true);
  return made;
}

// A stand-in page for installPageHooks.
function fakePage(href, extras) {
  const location = fakeLocation(href);
  const replaced = [];
  const listeners = { click: [], submit: [] };
  const window = Object.assign({
    location,
    history: { state: null, replaceState(state, title, url) { replaced.push(url); Object.assign(location, fakeLocation(new URL(url, location.href).href)); } }
  }, extras || {});
  const document = {
    addEventListener(type, handler) { (listeners[type] = listeners[type] || []).push(handler); },
    removeEventListener(type, handler) { listeners[type] = (listeners[type] || []).filter((entry) => entry !== handler); }
  };
  const fire = (type, event) => (listeners[type] || []).slice().forEach((handler) => handler(event));
  const launcherClick = () => { const event = { target: { closest: () => ({}) }, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; fire("click", event); return event; };
  const heroZip = (zip) => { const form = { closest: () => form, checkValidity: () => true, elements: { zip: { value: zip } } }; const event = { target: form, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; fire("submit", event); return event; };
  return { window, document, listeners, replaced, launcherClick, heroZip };
}

/* ======================================================================== */
/* contract-check 1 and 2, session-check P6: the terms box                   */
/* ======================================================================== */

test("terms: an intent change and a tick in ONE set() call never leaves the box ticked for a question or a quote delivery", () => {
  for (const intent of ["question", "quote_delivery"]) {
    const { store } = readyStore();
    assert.equal(store.getState().termsAccepted, true);
    const result = store.set({ intent, termsAccepted: true });
    const state = store.getState();
    assert.equal(state.intent, intent);
    assert.equal(state.termsAccepted, false, intent);
    assert.equal(state.termsAcceptedAt, "", intent);
    assert.deepEqual(result.rejected.map((entry) => entry.field), ["termsAccepted"], "the tick is refused, and said to be");
    assert.equal(result.ok, false);
    assert.ok(result.changed.includes("termsAccepted") && result.changed.includes("termsAcceptedAt"));
    const built = store.buildPayload();
    assert.equal(built.ok, true, intent);
    assert.equal(built.payload.termsAccepted, false);
    assert.equal(built.payload.termsAcceptedAt, "");
    assert.equal(built.payload.termsVersion, "");
  }
  // The order of the keys in the patch does not matter.
  const { store } = readyStore();
  store.set({ termsAccepted: true, intent: "question" });
  assert.equal(store.getState().termsAccepted, false);
});

test("terms: an edit and a tick in ONE set() call records the time of THIS call, never an earlier tick", () => {
  const { store, clock } = readyStore();
  const firstTick = store.getState().termsAcceptedAt;
  assert.equal(firstTick, new Date(clock.now).toISOString());

  clock.now += 60000;
  const result = store.set({ address: "456 Example Ave", termsAccepted: true });
  const state = store.getState();
  assert.equal(state.address, "456 Example Ave");
  assert.equal(state.termsAccepted, true);
  assert.equal(state.termsAcceptedAt, new Date(clock.now).toISOString());
  assert.notEqual(state.termsAcceptedAt, firstTick);
  assert.deepEqual(result.changed, ["address", "termsAcceptedAt"]);
  assert.deepEqual(result.notices, [], "the visitor ticked it in this very call: nothing was cleared");
  assert.equal(store.buildPayload().payload.termsAcceptedAt, state.termsAcceptedAt, "the evidence sent is the new time");

  // A tick on its own, with nothing else changed, keeps the time it has.
  clock.now += 5000;
  assert.deepEqual(store.set({ termsAccepted: true }).changed, []);
  assert.equal(store.getState().termsAcceptedAt, state.termsAcceptedAt);
  // A tick beside a value that is refused (so nothing it covers changed) keeps it too.
  store.set({ startTiming: "Whenever", termsAccepted: true });
  assert.equal(store.getState().termsAcceptedAt, state.termsAcceptedAt);

  // A change with no tick still unticks it, with the notice.
  const cleared = store.set({ firstName: "Tess" });
  assert.equal(store.getState().termsAccepted, false);
  assert.equal(store.getState().termsAcceptedAt, "");
  assert.deepEqual(cleared.notices.map((notice) => notice.code), ["TERMS_CLEARED"]);
  // Unticking it yourself is not something the engine did: no notice.
  store.set({ termsAccepted: true });
  assert.deepEqual(store.set({ firstName: "Tessa", termsAccepted: false }).notices, []);
  assert.equal(store.getState().termsAccepted, false);
});

test("terms: whatever mix of changes and ticks, the recorded time is never earlier than the last change it covers", () => {
  const { store, clock } = readyStore();
  let seed = 7;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const fields = { firstName: ["Test", "Tess"], address: ["123 Example St", "9 Sample Rd"], startTiming: core.START_TIMING_OPTIONS, lastCleaned: core.LAST_CLEANED_OPTIONS, yardSize: ["s", "m", "l"], intent: ["service_request", "question", "quote_delivery"] };
  let lastCoveredChange = clock.now;
  for (let step = 0; step < 600; step += 1) {
    clock.now += 1000;
    const patch = {};
    const key = Object.keys(fields)[Math.floor(random() * Object.keys(fields).length)];
    if (random() < 0.7) patch[key] = fields[key][Math.floor(random() * fields[key].length)];
    if (random() < 0.6) patch.termsAccepted = random() < 0.8;
    const before = plain(store.getState());
    store.set(patch);
    const state = store.getState();
    const coveredChanged = Object.keys(fields).some((field) => before[field] !== state[field]);
    if (coveredChanged) lastCoveredChange = clock.now;
    if (state.termsAccepted) {
      assert.equal(state.intent, "service_request", "ticked for " + state.intent);
      assert.ok(Date.parse(state.termsAcceptedAt) >= lastCoveredChange, "step " + step + ": accepted at " + state.termsAcceptedAt + " but something changed later; patch " + JSON.stringify(patch));
    } else {
      assert.equal(state.termsAcceptedAt, "");
    }
  }
});

/* ======================================================================== */
/* P1: a ?zip= in the address is a one-time instruction                      */
/* ======================================================================== */

test("P1: a ?zip= left in the address never overrides the visitor's own later ZIP, and a refresh counts nothing", () => {
  const storage = fakeStorage();
  const url = "https://itspurgepros.com/quote?zip=46032&utm_source=meta";
  const first = makeStore({ url, storage }).store;
  assert.equal(first.getState().zip, "46032");
  assert.equal(first.getState().zipSource, "url");
  assert.deepEqual(names(first.trackLog), ["service_area_eligible", "QuoteZipAccepted", "funnel_viewed", "QuoteFunnelViewed"], "the first arrival is counted once");
  first.set({ dogCount: "2" });
  first.edit("zip");
  first.set({ zip: "46074" });
  assert.equal(JSON.parse(storage.items.pp_quote_progress_v3).zip, "46074");

  // The same tab, the same address: a refresh.
  const again = makeStore({ url, storage }).store;
  assert.equal(again.getState().zip, "46074", "the visitor's own ZIP is kept");
  assert.equal(again.getState().zipSource, "storage");
  assert.equal(again.getState().city, "Westfield");
  assert.deepEqual(again.trackLog, [], "nothing fires without a visitor action");
  assert.equal(again.getState().attribution.utm_source, "meta");

  // The same when the visitor never changed it: it is their ZIP already, and it was counted already.
  const unchanged = fakeStorage();
  makeStore({ url, storage: unchanged });
  const reloaded = makeStore({ url, storage: unchanged }).store;
  assert.equal(reloaded.getState().zip, "46032");
  assert.deepEqual(reloaded.trackLog, []);
});

test("P1: the ?zip= is taken out of the address as soon as it is read; everything else stays", () => {
  const replaced = [];
  const location = fakeLocation("https://itspurgepros.com/quote?utm_source=meta&zip=46032&gclid=G1#top");
  const history = { state: { kept: true }, replaceState(state, title, url) { replaced.push([state, url]); } };
  const { store } = makeStore({ options: { location, history } });
  assert.equal(store.getState().zip, "46032");
  assert.deepEqual(replaced, [[{ kept: true }, "/quote?utm_source=meta&gclid=G1#top"]]);
  assert.deepEqual(plain(store.getState().attribution), { utm_source: "meta", gclid: "G1" });

  // It is taken out even when it is not applied (the visitor's own ZIP won), and when it is out of area.
  for (const [zip, saved] of [["46123", "46032"], ["46201", ""]]) {
    const calls = [];
    const storage = saved ? fakeStorage({ pp_quote_progress_v3: JSON.stringify({ zip: saved, dogCount: "", frequency: "", areas: [], yardSize: "", lastCleaned: "", customerStatus: "" }) }) : fakeStorage();
    makeStore({ storage, options: { location: fakeLocation("https://itspurgepros.com/?zip=" + zip), history: { state: null, replaceState(state, title, url) { calls.push(url); } } } });
    assert.deepEqual(calls, ["/"], zip);
  }
  // No ?zip=, or one that is not a ZIP: the address is left alone.
  for (const search of ["", "?utm_source=meta", "?zip=4603", "?zip=abcde"]) {
    const calls = [];
    makeStore({ options: { location: fakeLocation("https://itspurgepros.com/" + search), history: { state: null, replaceState(state, title, url) { calls.push(url); } } } });
    assert.deepEqual(calls, [], search);
  }
  // A page whose address cannot be rewritten still works.
  for (const history of [null, {}, { replaceState() { throw new Error("SecurityError"); } }]) {
    const { store: other } = makeStore({ options: { location: fakeLocation("https://itspurgepros.com/?zip=46074"), history } });
    assert.equal(other.getState().zip, "46074");
  }
});

test("P1: when the browser says the page was refreshed or reached by Back, a ?zip= still in the address is not applied at all", () => {
  for (const arrival of ["reload", "back_forward"]) {
    for (const zip of ["46032", "46201"]) {
      const { store } = makeStore({ url: "https://itspurgepros.com/quote?zip=" + zip, options: { navigationType: () => arrival } });
      assert.equal(store.getState().zip, "", arrival + " " + zip);
      assert.equal(store.getState().step, "dogs");
      assert.deepEqual(store.trackLog, [], "an out-of-area ZIP is never stored, so only this guard stops it being counted on every refresh");
    }
  }
  // A navigationType that throws, or is not a function, is treated as "the browser does not say".
  for (const navigationType of [() => { throw new Error("no"); }, "reload", null]) {
    const { store } = makeStore({ url: "https://itspurgepros.com/quote?zip=46032", options: { navigationType } });
    assert.equal(store.getState().zip, "46032");
  }
});

/* ======================================================================== */
/* P2 and finding (a): subscribers are told about EVERY change, exactly once */
/* ======================================================================== */

test("P2: edit() and open() tell the interface that the terms box was unticked", () => {
  const edited = atConfirm().store;
  const heard = [];
  edited.subscribe((state, info) => heard.push({ reason: info.reason, changed: info.changed, codes: info.notices.map((notice) => notice.code), terms: state.termsAccepted }));
  const result = edited.edit("dogs");
  assert.deepEqual(result, { ok: true, step: "dogs", reason: "", returnTo: "confirm" });
  assert.equal(heard.length, 1, "one call for the whole change");
  assert.deepEqual(heard[0], { reason: "edit", changed: ["termsAccepted", "step", "editReturn", "termsAcceptedAt"], codes: ["TERMS_CLEARED"], terms: false });

  const opened = atConfirm().store;
  assert.equal(opened.getState().city, "Carmel");
  assert.equal(opened.getState().cityAutoFilled, true);
  const told = [];
  opened.subscribe((state, info) => told.push({ reason: info.reason, changed: info.changed, codes: info.notices.map((notice) => notice.code), city: state.city }));
  opened.open({ zip: "46074" });
  assert.equal(told.length, 1);
  assert.deepEqual(told[0], { reason: "open", changed: ["zip", "city", "termsAccepted", "zipSource", "termsAcceptedAt"], codes: ["TERMS_CLEARED"], city: "Westfield" });
  // The same ZIP again changes nothing, so nobody is called.
  opened.open({ zip: "46074" });
  assert.equal(told.length, 1);
  // An out-of-area ZIP: the move to the ZIP step and its reason are both reported.
  opened.set({ termsAccepted: true });
  told.length = 0;
  opened.open({ zip: "46201" });
  assert.equal(told.length, 1);
  assert.deepEqual(told[0].codes, ["TERMS_CLEARED", "ZIP_OUT_OF_AREA"]);
  assert.ok(told[0].changed.includes("step") && told[0].changed.includes("termsAccepted") && told[0].changed.includes("city"));

  // With nothing ticked there is nothing to report about the terms.
  const plainEdit = atConfirm().store;
  plainEdit.set({ termsAccepted: false });
  const quiet = [];
  plainEdit.subscribe((state, info) => quiet.push([info.changed, info.notices]));
  plainEdit.edit("yard");
  assert.deepEqual(quiet, [[["step", "editReturn"], []]]);
});

// A subscriber that updates IN PLACE: it copies only the fields named in
// info.changed. If the engine ever changes a field without naming it, or
// changes the state without calling at all, this mirror goes stale.
function mirrorOf(store) {
  const mirror = { state: plain(store.getState()), calls: 0, log: [] };
  store.subscribe((state, info) => {
    mirror.calls += 1;
    mirror.log.push(info.reason);
    assert.ok(Array.isArray(info.changed) && info.changed.length > 0, info.reason + ": called with nothing changed");
    assert.equal(info.changed.includes("*"), false, "every changed field is named; there is no wildcard");
    assert.ok(Array.isArray(info.notices), info.reason + ": notices is always a list");
    for (const field of info.changed) {
      assert.ok(Object.prototype.hasOwnProperty.call(state, field), info.reason + ": " + field + " is not a state field");
      assert.notDeepEqual(plain(state[field]), mirror.state[field], info.reason + ": " + field + " is listed but did not change");
      mirror.state[field] = plain(state[field]);
    }
  });
  mirror.check = (label, before, callsBefore) => {
    const now = plain(store.getState());
    assert.deepEqual(mirror.state, now, label + ": an interface that updates in place is stale");
    const changed = JSON.stringify(before) !== JSON.stringify(now);
    assert.equal(mirror.calls - callsBefore, changed ? 1 : 0, label + ": " + (changed ? "exactly one call for one change" : "no call when nothing changed") + " (reasons " + mirror.log.slice(-3) + ")");
  };
  return mirror;
}

test("(a) every state change notifies exactly once and names every field that changed: a scripted session", async () => {
  const { store } = makeStore({ options: { demo: { delayMs: 0 } } });
  const mirror = mirrorOf(store);
  const step = (label, action) => {
    const before = plain(store.getState());
    const calls = mirror.calls;
    const result = action();
    mirror.check(label, before, calls);
    return result;
  };
  step("set dogs", () => store.set({ dogCount: "2" }));
  step("set dogs again", () => store.set({ dogCount: "2" }));
  step("next", () => store.next());
  step("typing a ZIP", () => store.set({ zip: "4603" }));
  step("ZIP done (city pre-filled)", () => store.set({ zip: "46032" }));
  step("next", () => store.next());
  step("yard", () => store.set({ yardSize: "m" }));
  step("goTo areas", () => store.goTo("areas"));
  step("goTo areas again", () => store.goTo("areas"));
  step("goTo refused", () => store.goTo("confirm"));
  step("toggle area", () => store.toggleArea("back"));
  step("all areas", () => store.toggleAllAreas());
  step("next", () => store.next());
  step("frequency refused", () => store.set({ frequency: "nonsense" }));
  step("frequency", () => store.set({ frequency: "biweekly" }));
  step("reconciled by a dog change", () => store.set({ dogCount: "5" }));
  step("frequency again", () => store.set({ frequency: "weekly" }));
  step("next to price", () => store.next());
  step("next to request", () => store.next());
  step("details", () => store.set({ customerStatus: "new", firstName: "Test", lastName: "Reviewer", phone: "3175550100", address: "123 Example St", startTiming: "As soon as possible", lastCleaned: "About 1 month" }));
  step("consent", () => store.set({ smsConsent: true }));
  step("reply by email clears consent", () => store.set({ preferredContact: "email", email: "test@example.com" }));
  step("back to text", () => store.set({ preferredContact: "text", smsConsent: true }));
  step("next to confirm", () => store.next());
  step("terms", () => store.set({ termsAccepted: true }));
  step("edit unticks the terms", () => store.edit("yard"));
  step("yard over an acre moves to custom", () => store.set({ yardSize: "over" }));
  step("yard back", () => store.set({ yardSize: "m" }));
  step("choose again", () => store.goTo("frequency"));
  step("weekly", () => store.set({ frequency: "weekly" }));
  step("to confirm", () => store.goTo("confirm"));
  step("open with a new ZIP", () => store.open({ zip: "46074" }));
  step("open with nothing", () => store.open({}));
  step("open out of area", () => store.open({ zip: "46201" }));
  step("ZIP corrected", () => store.set({ zip: "46032" }));
  step("back", () => store.back());
  step("back at the first step", () => { store.goTo("dogs"); return store.back(); });
  step("close keeps everything", () => store.close());
  step("to confirm again", () => store.goTo("confirm"));
  step("terms again", () => store.set({ termsAccepted: true }));
  step("unknown field", () => store.set({ nonsense: 1 }));

  // Sending: two changes (sending starts, the reply arrives), one call each.
  store.demo.submit = "timeout";
  let before = plain(store.getState());
  let calls = mirror.calls;
  let pending = store.submit();
  mirror.check("submitting", before, calls);
  before = plain(store.getState());
  calls = mirror.calls;
  assert.equal((await pending).status, "timeout");
  mirror.check("submit failed", before, calls);

  store.demo.submit = "success";
  before = plain(store.getState());
  calls = mirror.calls;
  pending = store.submit();
  mirror.check("submitting again", before, calls);
  before = plain(store.getState());
  calls = mirror.calls;
  assert.equal((await pending).ok, true);
  mirror.check("submitted", before, calls);
  assert.equal(store.getState().step, "done");

  step("set refused on done", () => store.set({ dogCount: "3" }));
  step("open refused on done", () => store.open({ zip: "46074" }));
  step("close from done starts over", () => store.close());
  assert.equal(store.getState().step, "dogs");
  step("reset with nothing to clear", () => store.reset());
  step("an answer", () => store.set({ dogCount: "3", zip: "46032" }));
  step("reset", () => store.reset());
  assert.equal(mirror.log[mirror.log.length - 1], "reset");

  // Opening a saved plan: clearing + loading is one change, the result is another.
  for (const [outcome, token] of [["success", "A".repeat(43)], ["expired", "B".repeat(43)], ["success", "not a token"]]) {
    step("an answer before resume", () => store.set({ dogCount: "4" }));
    store.demo.resume = outcome;
    before = plain(store.getState());
    calls = mirror.calls;
    pending = store.resume(token);
    mirror.check("resume starts (" + outcome + ", " + token.slice(0, 3) + ")", before, calls);
    before = plain(store.getState());
    calls = mirror.calls;
    await pending;
    mirror.check("resume ends (" + outcome + ", " + token.slice(0, 3) + ")", before, calls);
  }
  step("moving on dismisses the saved-plan notice", () => { store.demo.resume = "success"; return null; });
  await store.resume("C".repeat(43));
  assert.notEqual(store.getState().resumeNotice, "");
  const heard = [];
  store.subscribe((state, info) => heard.push(info.changed));
  store.back();
  assert.deepEqual(heard, [["step", "resumeNotice"]], "info.changed names resumeNotice when it is dismissed");

  // A locked reply.
  const locked = atConfirm({ options: { demo: { delayMs: 0, submit: "uncertain" } } }).store;
  const lockedMirror = mirrorOf(locked);
  before = plain(locked.getState());
  calls = lockedMirror.calls;
  pending = locked.submit();
  lockedMirror.check("submitting", before, calls);
  before = plain(locked.getState());
  calls = lockedMirror.calls;
  assert.equal((await pending).status, "locked");
  lockedMirror.check("locked", before, calls);
  assert.deepEqual(lockedMirror.log, ["submitting", "submit_failed"]);
  for (const refused of [() => locked.set({ dogCount: "1" }), () => locked.open({ zip: "46074" }), () => locked.reset(), () => locked.close(), () => locked.edit("dogs"), () => locked.goTo("price")]) {
    before = plain(locked.getState());
    calls = lockedMirror.calls;
    refused();
    lockedMirror.check("after a locked reply", before, calls);
  }
  assert.notEqual(locked.getState().locked, null, "only a reload clears a lock");
});

test("(a) the same, over 300 random walks: an interface that copies only info.changed never goes stale", async () => {
  let seed = 20261007;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = (list) => list[Math.floor(random() * list.length)];
  const reasons = new Set();
  for (let walk = 0; walk < 300; walk += 1) {
    const { store } = makeStore({
      url: pick(["file:///G:/review/home.html", "file:///G:/review/home.html?zip=46032", "file:///G:/review/home.html?zip=46201"]),
      options: Object.assign({ demo: { delayMs: 0, submit: pick(["success", "invalid", "uncertain", "unavailable", "timeout", "network", "forbidden"]), resume: pick(core.DEMO_RESUME_OUTCOMES) } }, random() < 0.3 ? { pageZip: "46074" } : {})
    });
    const mirror = mirrorOf(store);
    const actions = [
      () => store.set({ dogCount: pick(["", "1", "2", "5", "6", "10", "11"]) }),
      () => store.set({ zip: pick(["", "4603", "46032", "46074", "46201", "46236"]) }),
      () => store.set({ yardSize: pick(["", "s", "m", "xl", "over"]) }),
      () => store.toggleArea(pick(["back", "front", "side"])),
      () => store.toggleAllAreas(),
      () => store.set({ frequency: pick(["", "twice", "weekly", "biweekly", "onetime", "custom"]) }),
      () => store.set({ intent: pick(["service_request", "quote_delivery", "question"]) }),
      () => store.set({ preferredContact: pick(["text", "email", "call"]) }),
      () => store.set({ customerStatus: pick(["", "new", "returning", "not_sure"]), firstName: pick(["", "Test"]), lastName: pick(["", "Reviewer"]) }),
      () => store.set({ phone: pick(["", "317555", "3175550100"]), email: pick(["", "test@example.com"]), address: pick(["", "123 Example St"]), city: pick(["", "Testville"]) }),
      () => store.set({ startTiming: pick(core.START_TIMING_OPTIONS), lastCleaned: pick(core.LAST_CLEANED_OPTIONS), question: pick(["", "Is this a test?"]) }),
      () => store.set({ smsConsent: random() < 0.7 }),
      () => store.set({ termsAccepted: random() < 0.7 }),
      () => store.set({ firstName: pick(["Test", "Tess"]), termsAccepted: true }),
      () => store.next(),
      () => store.next(),
      () => store.back(),
      () => store.goTo(pick(core.STEPS)),
      () => store.edit(pick(core.STEPS)),
      () => store.open({ zip: pick(["46032", "46074", "46201", "4603", ""]) }),
      () => store.close(),
      () => store.reset(),
      () => store.reportStepShown(pick(["price", "request", "confirm"])),
      () => store.track("yard_size_help_opened")
    ];
    for (let turn = 0; turn < 60; turn += 1) {
      const roll = random();
      let before = plain(store.getState());
      let calls = mirror.calls;
      if (turn === 20 || turn === 45) {
        // Several changes in a row (a whole plan, a whole form): one call each,
        // which the single-action branch below proves; here only freshness.
        fillPlan(store);
        store.goTo("price");
        store.next();
        fillDetails(store, pick(["service_request", "service_request", "question"]), pick(["text", "email"]));
        store.next();
        assert.deepEqual(mirror.state, plain(store.getState()), "walk " + walk + ": stale after filling the plan and the form");
      } else if (roll < 0.06 || turn === 21 || turn === 46) {
        const pending = store.submit();
        mirror.check("submit starts", before, calls);
        before = plain(store.getState());
        calls = mirror.calls;
        await pending;
        mirror.check("submit ends", before, calls);
      } else if (roll < 0.09) {
        const pending = store.resume(pick(["A".repeat(43), "bad"]));
        mirror.check("resume starts", before, calls);
        before = plain(store.getState());
        calls = mirror.calls;
        await pending;
        mirror.check("resume ends", before, calls);
      } else {
        pick(actions)();
        mirror.check("walk " + walk + " turn " + turn, before, calls);
      }
    }
    mirror.log.forEach((reason) => reasons.add(reason));
  }
  // Every reason the guide lists was exercised, and no other exists.
  const documented = ["set", "goTo", "edit", "next", "back", "open", "close", "reset", "submitting", "submitted", "submit_failed", "resume_loading", "resumed", "resume_failed"];
  assert.deepEqual(Array.from(reasons).sort(), documented.slice().sort());
});

/* ======================================================================== */
/* P3: track() carries nothing a visitor typed, under any name               */
/* ======================================================================== */

test("P3: track() keeps only the allow-listed parameter names for each event", () => {
  assert.deepEqual(plain(core.EVENTS.uiParams), { yard_size_help_opened: [], promotion_details_viewed: ["promotion"] });
  assert.deepEqual(Object.keys(core.EVENTS.uiParams).sort(), core.EVENTS.ui.slice().sort(), "every interface event has its list");
  const page = livePage();
  const { store, calls } = page;
  fillPlan(store);
  fillDetails(store, "service_request", "text");
  calls.length = 0;

  assert.equal(store.track("promotion_details_viewed", { promotion: "No start-up fee", customer: "Test Reviewer", phone_number: "3175550100", email_address: "test@example.com", zip_code: "46032", address_line: "123 Example St" }), true);
  assert.equal(store.track("yard_size_help_opened", { note: "123 Example St", promotion: "No start-up fee" }), true);
  assert.deepEqual(calls.filter((call) => call.sink === "gtag"), [
    { sink: "gtag", name: "promotion_details_viewed", params: { ui_version: core.VERSIONS.uiVersion, promotion: "No start-up fee" } },
    { sink: "gtag", name: "yard_size_help_opened", params: { ui_version: core.VERSIONS.uiVersion } }
  ]);
  // What was dropped is counted, never written down.
  const refusals = store.trackLog.filter((entry) => entry.channel === "rejected");
  assert.deepEqual(refusals.map((entry) => [entry.event, entry.dropped]), [["promotion_details_viewed", 5], ["yard_size_help_opened", 2]]);
  const everything = JSON.stringify(store.trackLog) + JSON.stringify(calls);
  for (const personal of ["Test Reviewer", "3175550100", "test@example.com", "123 Example St", "46032"]) assert.equal(everything.includes(personal), false, personal);
});

test("P3: a visitor's details are refused by VALUE too, even under the allowed name", () => {
  const page = livePage();
  const { store, calls } = page;
  fillPlan(store);
  fillDetails(store, "question", "email");
  store.set({ city: "Testville" });
  const refused = [
    "Test", "Offer for Reviewer", "REVIEWER special", "3175550100", "(317) 555-0100", "317-555-0100", "call 317 555 0100",
    "test@example.com", "someone@else.example", "46032", "ZIP 46074", "Is this only a test question?", "near Testville",
    "x".repeat(101), "", "   ", { title: "No start-up fee" }, ["No start-up fee"], null, NaN, () => "No start-up fee"
  ];
  for (const value of refused) {
    calls.length = 0;
    assert.equal(store.track("promotion_details_viewed", { promotion: value }), true, "the event itself still counts");
    assert.deepEqual(calls.map((call) => call.params), [{ ui_version: core.VERSIONS.uiVersion }], "refused value: " + String(value));
  }
  for (const value of ["No start-up fee", "  No start-up fee  ", "New recurring customer offer", "Offer 2", 7, true]) {
    calls.length = 0;
    store.track("promotion_details_viewed", { promotion: value });
    assert.deepEqual(calls[0].params, { ui_version: core.VERSIONS.uiVersion, promotion: typeof value === "string" ? value.trim() : value }, "kept: " + value);
  }
  // An address typed on a service request is refused by value as well.
  const service = livePage();
  fillPlan(service.store);
  fillDetails(service.store, "service_request", "text");
  service.calls.length = 0;
  service.store.track("promotion_details_viewed", { promotion: "Offer at 123 Example St" });
  assert.deepEqual(service.calls[0].params, { ui_version: core.VERSIONS.uiVersion });
  // Engine event names are still refused outright, whatever they carry.
  assert.equal(store.track("generate_lead", { promotion: "No start-up fee" }), false);
  assert.equal(store.track({ toString: () => "yard_size_help_opened" }), false, "only a plain string is an event name");
});

/* ======================================================================== */
/* P4: living on the same page as the live widget script                     */
/* ======================================================================== */

// What the Worker serves at /purge-quote.js: the widget, then one appended line (worker.template.mjs).
const servedWidget = widgetText + "\nObject.assign(window.PurgeProsQuote.config.promotion," + JSON.stringify({ title: "Override from the Worker" }) + ");";

test("P4: the global has the live shape { open, close, config }, and the live widget script loaded AFTER the hooks neither throws nor takes over", () => {
  const { store } = makeStore();
  const page = fakePage("https://pages.offline.invalid/");
  const opened = [];
  const hooks = core.installPageHooks(store, { open: (result) => opened.push(result) }, { window: page.window, document: page.document });
  const api = page.window.PurgeProsQuote;
  assert.equal(hooks.apiInstalled, true);
  assert.equal(hooks.notInstalledReason, "");
  assert.equal(typeof api.open, "function");
  assert.equal(typeof api.close, "function");
  assert.equal(typeof api.config, "object");
  assert.deepEqual(api.config.promotion, {});
  assert.equal(api.core, store);

  const listenersBefore = page.listeners.click.length + page.listeners.submit.length;
  assert.doesNotThrow(() => vm.runInNewContext(servedWidget, { window: page.window, document: page.document, location: page.window.location }));
  assert.equal(page.window.PurgeProsQuote, api, "the live script saw the global and left it alone");
  assert.equal(page.listeners.click.length + page.listeners.submit.length, listenersBefore, "and added no listener of its own: one launcher click, one builder");
  assert.equal(api.config.promotion.title, "Override from the Worker", "the Worker's appended line has somewhere to write");
  // The engine does not read what was written there.
  assert.equal(store.offerNote().title, "No start-up fee");
  // The hooks still work.
  assert.equal(page.launcherClick().defaultPrevented, true);
  api.open({ zip: "46032" });
  assert.equal(opened.length, 2);
  assert.equal(store.getState().zip, "46032");
});

test("P4: when the live widget defined the global first, the hooks stand down completely and say so", () => {
  const { store } = makeStore();
  const warnings = [];
  const page = fakePage("https://pages.offline.invalid/?open_quote=1", { console: { warn: (text) => warnings.push(text) } });
  // A stand-in for the live widget, with the shape widget.js gives its global
  // ({ open, close, config }) and no `core`. The live script itself defines it
  // at the very end of the file and keeps its own document listeners.
  assert.ok(widgetText.includes("window.PurgeProsQuote = { open: open, close: close, config: CONFIG };"));
  let liveOpens = 0;
  const liveApi = { open() { liveOpens += 1; }, close() {}, config: { promotion: { title: "Initial scoop surcharge waived" } } };
  page.window.PurgeProsQuote = liveApi;

  const opened = [];
  const hooks = core.installPageHooks(store, { open: (result) => opened.push(result) }, { window: page.window, document: page.document });
  assert.equal(hooks.apiInstalled, false);
  assert.match(hooks.notInstalledReason, /defined window\.PurgeProsQuote first/);
  assert.equal(warnings.length, 1, "the page's console is told once");
  assert.equal(page.window.PurgeProsQuote, liveApi, "the live global is untouched");
  assert.deepEqual(Object.keys(liveApi), ["open", "close", "config"]);
  assert.equal(hooks.autoOpened, false, "the live widget acts on ?open_quote=1 itself");
  assert.deepEqual(page.replaced, [], "the address is left to the script that owns the hooks");
  // Launcher clicks and hero ZIP forms are left to the live widget: never two builders for one click.
  assert.equal(page.launcherClick().defaultPrevented, false);
  assert.equal(page.heroZip("46032").defaultPrevented, false);
  assert.equal(opened.length, 0);
  assert.equal(liveOpens, 0, "and the engine never calls the live widget");
  assert.equal(store.getState().zip, "");
  // The returned open() still works for a page that calls it itself.
  hooks.open({ zip: "46032" }, null);
  assert.equal(opened.length, 1);
  assert.equal(store.getState().zip, "46032");
  hooks.uninstall();
  assert.equal(page.window.PurgeProsQuote, liveApi);
  assert.equal(page.listeners.click.length + page.listeners.submit.length, 0);

  // A second installPageHooks on the same page stands down the same way.
  const second = fakePage("https://pages.offline.invalid/");
  const firstHooks = core.installPageHooks(store, {}, { window: second.window, document: second.document });
  const laterOpened = [];
  const laterHooks = core.installPageHooks(makeStore().store, { open: (result) => laterOpened.push(result) }, { window: second.window, document: second.document });
  assert.equal(firstHooks.apiInstalled, true);
  assert.equal(laterHooks.apiInstalled, false);
  assert.match(laterHooks.notInstalledReason, /earlier installPageHooks/);
  second.launcherClick();
  assert.equal(laterOpened.length, 0);
});

/* ======================================================================== */
/* P5: opening and closing never lose a request                              */
/* ======================================================================== */

test("P5: after a finished request, a ZIP typed into a hero form starts a new quote; a plain launcher shows the done screen", async () => {
  const { store, storage } = atConfirm({ options: { demo: { delayMs: 0 } } });
  const page = fakePage("https://pages.offline.invalid/");
  const opened = [];
  let closed = 0;
  const hooks = core.installPageHooks(store, { open: (result) => opened.push(result), close: () => { closed += 1; } }, { window: page.window, document: page.document });
  const sent = await store.submit();
  assert.equal(sent.ok, true);
  assert.equal(store.getState().step, "done");

  // The store itself changes nothing, and writes nothing, on the done step.
  const writes = storage.writes.length;
  assert.deepEqual(store.open({ zip: "46074" }), { ok: false, zipStatus: "in_area", step: "done", reason: "This request is complete. Call reset() to start a new one." });
  assert.equal(storage.writes.length, writes);
  // A launcher with no ZIP brings the done screen (and its reference) back into view.
  page.launcherClick();
  assert.equal(opened.length, 1);
  assert.equal(store.getState().step, "done");
  assert.equal(store.getState().receipt.requestId, sent.requestId);
  // A hero ZIP form: the visitor asked for a price for that ZIP, so a new quote starts with it.
  page.heroZip("46074");
  assert.equal(opened.length, 2);
  assert.equal(opened[1].ok, true);
  assert.equal(opened[1].zipStatus, "in_area");
  const state = store.getState();
  assert.equal(state.step, "dogs");
  assert.equal(state.zip, "46074");
  assert.equal(state.zipSource, "open");
  assert.equal(state.receipt, null);
  assert.equal(state.firstName, "", "nothing of the finished request is carried into the new one");
  assert.equal(state.termsAccepted, false);
  assert.equal(store.flow().zipSkipped, true);

  // Closing from the done step starts over too (spec 2.4); the builder is hidden first.
  fillPlan(store);
  fillDetails(store, "service_request", "text");
  assert.equal((await store.submit()).ok, true);
  assert.equal(hooks.close(), true);
  assert.equal(closed, 1);
  assert.equal(store.getState().step, "dogs");
  assert.equal(store.getState().dogCount, "");
  hooks.uninstall();
});

test("P5: closing and reopening keep a request that failed and can be retried, and never clear a lock", async () => {
  // A retryable failure: close, reopen, retry. Same request, same id.
  const retry = atConfirm({ options: { demo: { delayMs: 0, submit: "unavailable" } } });
  const first = await retry.store.submit();
  assert.equal(first.status, "unavailable");
  assert.deepEqual(retry.store.close(), { ok: true, reason: "", startedOver: false });
  assert.equal(retry.store.open({}).ok, true);
  assert.equal(retry.store.getState().step, "confirm");
  assert.equal(retry.store.getState().firstName, "Test", "closing keeps everything in memory");
  retry.store.demo.submit = "success";
  const second = await retry.store.submit();
  assert.equal(second.ok, true);
  assert.equal(second.requestId, first.requestId, "the retry is the same request");
  assert.equal(retry.ids.length, 1);

  // While sending: close is refused and open changes nothing.
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const sending = atConfirm({ options: { wait: () => gate } });
  const pending = sending.store.submit();
  assert.deepEqual(sending.store.close(), { ok: false, reason: core.SUBMIT_MESSAGES.sending, startedOver: false });
  assert.deepEqual(sending.store.open({ zip: "46074" }), { ok: false, zipStatus: "in_area", step: "confirm", reason: core.SUBMIT_MESSAGES.sending });
  assert.equal(sending.store.reset(), false);
  release();
  assert.equal((await pending).ok, true);

  // After a locked reply: nothing reopens, resets or replaces it.
  const locked = atConfirm({ options: { demo: { delayMs: 0, submit: "uncertain" } } });
  const page = fakePage("https://pages.offline.invalid/");
  const opened = [];
  const hooks = core.installPageHooks(locked.store, { open: (result) => opened.push(result) }, { window: page.window, document: page.document });
  assert.equal((await locked.store.submit()).status, "locked");
  const lock = plain(locked.store.getState().locked);
  page.heroZip("46074");
  assert.equal(opened[0].ok, false);
  assert.equal(opened[0].reason, lock.message, "the open handler is given the message to show");
  assert.equal(hooks.close(), true, "a locked builder may be hidden");
  page.launcherClick();
  assert.deepEqual(plain(locked.store.getState().locked), lock);
  assert.equal(locked.store.getState().zip, "46032");
  assert.equal(locked.store.getState().step, "confirm");
});

/* ======================================================================== */
/* P7: the ZIP field of the request form                                     */
/* ======================================================================== */

test("P7: an unfinished ZIP typed in the request form is a request-form error with a plain message, and coverage is re-checked when it is complete", () => {
  const { store } = atConfirm();
  store.back();
  assert.equal(store.getState().step, "request");
  assert.equal(store.fieldRules().find((rule) => rule.key === "zip").shown, true, "the ZIP field is on this form");

  for (const partial of ["4603", ""]) {
    const typing = store.set({ zip: partial });
    assert.equal(typing.movedTo, null, "never thrown out mid-keystroke");
    assert.equal(store.getState().step, "request");
    const pressed = store.next();
    assert.equal(pressed.ok, false);
    assert.deepEqual(pressed.errors.filter((error) => error.field === "zip"), [{ field: "zip", step: "request", code: "ZIP_REQUIRED", message: "Enter a valid 5-digit ZIP code.", engineOnly: false }], "listed once, as this form's field");
    assert.equal(pressed.reason, "Enter a valid 5-digit ZIP code.");
    assert.equal(store.validateDetails().byField.zip, "Enter a valid 5-digit ZIP code.", "the inline message comes from the form's own validation");
    assert.equal(store.validateDetails().errors.find((error) => error.field === "zip").step, "request");
    assert.equal(store.validateSubmit().errors.filter((error) => error.field === "zip").length, 1);
    assert.equal(store.validateSubmit().errors.find((error) => error.field === "zip").step, "request");
    assert.equal(store.flow().disablePrimary, false, "the button stays enabled on the request form");
    // Confirm cannot be reached, and the engine points back at this form, not at the ZIP question.
    assert.deepEqual(store.goTo("confirm"), { ok: false, step: "request", reason: "Enter a valid 5-digit ZIP code.", needs: "request" });
    // The plan-only view still says what it always said.
    assert.equal(store.validatePlan().errors.find((error) => error.field === "zip").step, "zip");
  }

  // Complete and in area: the coverage check ran again (city, event), and the error is gone.
  const eventsBefore = store.trackLog.length;
  store.set({ zip: "46074" });
  assert.equal(store.getState().step, "request");
  assert.equal(store.getState().city, "Westfield");
  assert.equal("zip" in store.validateDetails().byField, false);
  assert.deepEqual(names(store.trackLog.slice(eventsBefore)), ["service_area_eligible"]);
  assert.equal(store.next().step, "confirm");

  // Complete and out of area: not a form error. The visitor is taken to the ZIP step.
  store.back();
  const outside = store.set({ zip: "46201" });
  assert.equal(outside.movedTo, "zip");
  assert.deepEqual(outside.notices.map((notice) => notice.code), ["ZIP_OUT_OF_AREA"]);
  assert.equal("zip" in store.validateDetails().byField, false);
  assert.equal(store.validateSubmit().errors.find((error) => error.field === "zip").step, "zip");
});

test("P7: away from the request form, and for intents whose form has no ZIP field, an unanswered ZIP stays the ZIP question", () => {
  // Not on the request form: the store was filled without walking the steps.
  const elsewhere = readyStore().store;
  elsewhere.set({ zip: "" });
  elsewhere.set({ termsAccepted: true });
  assert.equal(elsewhere.getState().step, "dogs");
  assert.equal("zip" in elsewhere.validateDetails().byField, false);
  assert.deepEqual(elsewhere.validateSubmit().errors.filter((error) => error.field === "zip").map((error) => error.step), ["zip"]);

  // A question: its form shows no ZIP field, so the error cannot be "on the form".
  const { store } = makeStore();
  fillPlan(store);
  store.goTo("price");
  store.set({ intent: "question" });
  store.next();
  fillDetails(store, "question", "email");
  assert.equal(store.fieldRules().find((rule) => rule.key === "zip").shown, false);
  store.set({ zip: "4603" });
  assert.equal(store.getState().step, "request");
  assert.equal("zip" in store.validateDetails().byField, false);
  assert.deepEqual(store.next().errors.map((error) => [error.field, error.step]), [["zip", "zip"]]);
  // The pure function behind it is unchanged: it is compared with the Worker field by field.
  assert.equal(core.testing.detailsErrors(plain(store.getState()), "service_request").some((error) => error.field === "zip"), false);
});

/* ======================================================================== */
/* P8: one answer for "is the primary button disabled"                       */
/* ======================================================================== */

test("P8: flow().disablePrimary alone decides the button, and blockedReason says why", () => {
  const { store } = makeStore();
  const unanswered = { dogs: "Choose the number of dogs.", zip: "Enter a valid 5-digit ZIP code.", yard: "Choose the serviced yard size.", areas: "Choose at least one service area.", frequency: "Choose a service frequency." };
  const answers = { dogs: { dogCount: "2" }, zip: { zip: "46032" }, yard: { yardSize: "m" }, areas: { areas: ["back"] }, frequency: { frequency: "weekly" } };
  for (const step of core.PLAN_STEPS) {
    assert.equal(store.getState().step, step);
    let flow = store.flow();
    assert.deepEqual([flow.disablePrimary, flow.canContinue, flow.blockedReason], [true, false, unanswered[step]], step + " unanswered");
    store.set(answers[step]);
    flow = store.flow();
    assert.deepEqual([flow.disablePrimary, flow.canContinue, flow.blockedReason], [false, true, ""], step + " answered");
    store.next();
  }
  assert.equal(store.getState().step, "price");
  assert.deepEqual([store.flow().disablePrimary, store.flow().canContinue], [false, true]);
  store.next();
  // Request and confirm: enabled even with things missing; pressing shows the list.
  let flow = store.flow();
  assert.deepEqual([flow.current, flow.disablePrimary, flow.canContinue], ["request", false, false]);
  assert.ok(flow.blockedErrors.length > 3);
  fillDetails(store, "service_request", "text");
  store.set({ termsAccepted: false });
  store.next();
  flow = store.flow();
  assert.deepEqual([flow.current, flow.primaryAction, flow.disablePrimary, flow.canContinue, flow.blockedReason], ["confirm", "submit", false, false, core.TERMS.error]);
  // The price step with a plan that is no longer complete: nothing to continue to.
  const broken = makeStore().store;
  fillPlan(broken);
  broken.goTo("price");
  broken.next();
  broken.set({ zip: "4603" });
  broken.back();
  assert.deepEqual([broken.getState().step, broken.flow().disablePrimary, broken.flow().canContinue], ["price", true, false]);
});

test("P8: disablePrimary and canContinue never contradict each other, in any state a visitor can reach", async () => {
  let seed = 99;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = (list) => list[Math.floor(random() * list.length)];
  for (let walk = 0; walk < 150; walk += 1) {
    const { store } = makeStore({ options: { demo: { delayMs: 0, submit: pick(["success", "uncertain", "timeout"]) } } });
    const check = (label) => {
      for (const id of [undefined].concat(core.STEPS)) {
        const flow = store.flow(id);
        assert.equal(flow.disablePrimary && flow.canContinue, false, label + " " + id + ": disabled yet able to continue");
        if (flow.primaryAction === "none") assert.equal(flow.disablePrimary, true, label + ": nothing to press must read as disabled");
        if (!flow.disablePrimary && flow.primaryAction === "next" && core.PLAN_STEPS.includes(flow.current)) assert.equal(flow.canContinue, true, label + " " + flow.current + ": an enabled Next on a plan question must work");
        if (flow.disablePrimary && flow.primaryAction !== "none") assert.ok(flow.blockedReason.length > 5, label + ": disabled without a reason");
      }
      const state = store.getState();
      if (state.submitting || state.locked || state.step === "done" || state.resumeLoading) assert.equal(store.flow().disablePrimary, true, label + ": frozen");
    };
    for (let turn = 0; turn < 40; turn += 1) {
      const roll = random();
      if (roll < 0.25) fillPlan(store, { dogCount: pick(["1", "6", "10"]), zip: pick(["46032", "4603", "46201"]), yardSize: pick(["s", "over"]), areas: pick([[], ["back"]]), frequency: pick(["weekly", "custom", ""]) });
      else if (roll < 0.4) fillDetails(store, pick(["service_request", "question"]), pick(["text", "email"]));
      else if (roll < 0.6) store.next();
      else if (roll < 0.7) store.back();
      else if (roll < 0.8) store.goTo(pick(core.STEPS));
      else if (roll < 0.9) store.set({ zip: pick(["", "460", "46074"]) });
      else if (roll < 0.95) { const pending = store.submit(); check("while sending"); await pending; }
      else store.reset();
      check("walk " + walk + " turn " + turn);
    }
  }
});

/* ======================================================================== */
/* P9: funnel_viewed comes before every other funnel event                   */
/* ======================================================================== */

test("P9: a page that only continues progress carried from another page still reports funnel_viewed, once, before anything else", async () => {
  const storage = fakeStorage();
  const first = livePage({ storage });
  fillPlan(first.store);
  // The next page: the visitor answers nothing here. They press the pinned bar's Continue.
  const second = livePage({ storage, url: "https://pages.offline.invalid/dog-waste-removal" });
  assert.deepEqual(second.calls, [], "nothing on page load");
  second.store.priceBar();
  second.store.flow();
  assert.deepEqual(second.calls, [], "looking is not acting");
  second.store.goTo(second.store.priceBar().continueStep);
  assert.deepEqual(second.calls.map((call) => call.name), ["funnel_viewed", "QuoteFunnelViewed", "price_viewed", "QuotePriceViewed", "funnel_step_viewed"]);
  assert.deepEqual(second.calls[0].params, { ui_version: core.VERSIONS.uiVersion, presentation: "inline" });
  second.store.next();
  fillDetails(second.store, "service_request", "text");
  second.store.next();
  const sent = await second.store.submit();
  assert.equal(sent.ok, true);
  const fired = second.calls.map((call) => call.name);
  assert.equal(fired.filter((name) => name === "funnel_viewed").length, 1);
  assert.equal(fired.filter((name) => name === "QuoteFunnelViewed").length, 1);
  assert.equal(fired[0], "funnel_viewed");
  assert.ok(fired.indexOf("funnel_viewed") < fired.indexOf("conversion") && fired.indexOf("conversion") > 0);
});

test("P9: the same on a city page (its ZIP milestone first, as before), after a saved plan, and for the interface's own events", async () => {
  // A city page whose visitor carries a complete plan but no ZIP of their own.
  const storage = fakeStorage({ pp_quote_progress_v3: JSON.stringify({ zip: "", dogCount: "2", frequency: "weekly", areas: ["back"], yardSize: "m", lastCleaned: "", customerStatus: "" }) });
  const city = makeStore({ storage, options: { pageZip: "46074" } }).store;
  assert.deepEqual(city.trackLog, []);
  city.goTo("price");
  assert.deepEqual(names(city.trackLog), ["service_area_eligible", "QuoteZipAccepted", "funnel_viewed", "QuoteFunnelViewed", "price_viewed", "QuotePriceViewed", "funnel_step_viewed"]);
  assert.equal(city.trackLog[0].params.entry, "city_page");

  // A saved plan: opening it fires nothing; the visitor's first move fires funnel_viewed first.
  // (Since 2026-10-09 that move from the price also counts the way forward: T15, price_choice_selected.)
  const resumed = makeStore().store;
  await resumed.resume("A".repeat(43));
  assert.deepEqual(resumed.trackLog, []);
  resumed.next();
  assert.deepEqual(names(resumed.trackLog), ["funnel_viewed", "QuoteFunnelViewed", "price_choice_selected", "funnel_step_viewed", "QuoteDetailsViewed"]);

  // A ZIP that was handed over keeps the live order: its result, then funnel_viewed.
  const hero = makeStore().store;
  hero.open({ zip: "46032" });
  assert.deepEqual(names(hero.trackLog), ["service_area_eligible", "QuoteZipAccepted", "funnel_viewed", "QuoteFunnelViewed"]);
  // And a typed ZIP as the very first answer: funnel_viewed, then its result.
  const typed = makeStore().store;
  typed.set({ zip: "46032" });
  assert.deepEqual(names(typed.trackLog), ["funnel_viewed", "QuoteFunnelViewed", "service_area_eligible", "QuoteZipAccepted"]);
  // Never twice, whatever comes first and whatever follows.
  for (const store of [city, resumed, hero, typed]) {
    fillPlan(store, { dogCount: "3" });
    store.goTo("price");
    store.reset();
    store.set({ dogCount: "1" });
    store.track("yard_size_help_opened");
    assert.equal(names(store.trackLog).filter((name) => name === "funnel_viewed").length, 1);
  }
});

/* ======================================================================== */
/* Usability findings (c): places a designer was misled or had to guess      */
/* ======================================================================== */

test("(c) reportStepShown() can be called on every render: each step is reported once per visit to the screen", () => {
  const { store } = makeStore();
  fillPlan(store);
  store.goTo("price");
  store.next();
  for (let render = 0; render < 4; render += 1) {
    assert.equal(store.reportStepShown("request"), true);
    assert.equal(store.reportStepShown("confirm"), true);
  }
  const steps = () => store.trackLog.filter((entry) => entry.event === "funnel_step_viewed").map((entry) => entry.params.step);
  assert.deepEqual(steps(), [3, 4, 5]);
  // Leaving and coming back is a new visit to the screen: reported again, once.
  store.back();
  store.next();
  for (let render = 0; render < 3; render += 1) { store.reportStepShown("request"); store.reportStepShown("confirm"); }
  assert.deepEqual(steps(), [3, 4, 5, 3, 4, 5]);
  // The engine then moving to confirm itself does not report it a second time.
  fillDetails(store, "service_request", "text");
  store.next();
  assert.equal(store.getState().step, "confirm");
  assert.deepEqual(steps(), [3, 4, 5, 3, 4, 5]);
  assert.equal(store.trackLog.filter((entry) => entry.event === "QuoteReviewViewed").length, 1, "the pixel milestone stays at once per page load");
});

test("(c) goTo() and edit() return the same keys whether they succeed or are refused", () => {
  const { store } = makeStore();
  store.set({ dogCount: "2" });
  assert.deepEqual(store.goTo("zip"), { ok: true, step: "zip", reason: "", needs: "" });
  assert.deepEqual(store.goTo("price"), { ok: false, step: "zip", reason: "Enter a valid 5-digit ZIP code.", needs: "zip" });
  assert.deepEqual(store.edit("dogs"), { ok: true, step: "dogs", reason: "", returnTo: "zip" });
  assert.deepEqual(store.edit("price"), { ok: false, step: "dogs", reason: "Enter a valid 5-digit ZIP code.", returnTo: "" });
  assert.deepEqual(Object.keys(store.goTo("nowhere")).sort(), ["needs", "ok", "reason", "step"]);
  assert.deepEqual(Object.keys(store.edit("nowhere")).sort(), ["ok", "reason", "returnTo", "step"]);
});

test("(c) every choice field carries `choices` in one shape, whatever its raw options look like", () => {
  const { store } = makeStore();
  fillPlan(store);
  store.set({ customerStatus: "returning", startTiming: "Within the next week" });
  for (const intent of ["service_request", "quote_delivery", "question"]) {
    for (const rule of store.fieldRules(intent)) {
      assert.equal(Array.isArray(rule.choices), rule.control === "choice", rule.key + ": choices exactly on choice fields");
      if (!rule.choices) continue;
      assert.equal(rule.choices.length, rule.options.length);
      rule.choices.forEach((choice, index) => {
        assert.deepEqual(Object.keys(choice), ["value", "label", "selected"]);
        const option = rule.options[index];
        assert.equal(choice.value, typeof option === "string" ? option : option.id);
        assert.equal(choice.label, typeof option === "string" ? option : option.label);
        assert.equal(choice.selected, store.getState()[rule.key] === choice.value);
        // The value is exactly what set() accepts.
        const probe = makeStore().store;
        assert.equal(probe.set({ [rule.key]: choice.value }).rejected.length, 0, rule.key + " = " + choice.value);
      });
    }
  }
  const service = Object.fromEntries(store.fieldRules("service_request").map((rule) => [rule.key, rule]));
  assert.deepEqual(service.customerStatus.choices.filter((choice) => choice.selected).map((choice) => choice.value), ["returning"]);
  assert.deepEqual(service.startTiming.choices.filter((choice) => choice.selected).map((choice) => choice.label), ["Within the next week"]);
  assert.deepEqual(store.fieldRules("quote_delivery").find((rule) => rule.key === "preferredContact").choices.map((choice) => choice.value), ["text", "email"]);
});

test("(c) live mode on a page that may not send keeps quiet towards the tags as well", async () => {
  const calls = [];
  const sinks = { gtag: (...args) => calls.push(args[1]), dataLayer: [], fbq: (...args) => calls.push(args[1]) };
  const blockedPages = [
    { url: "https://staging.offline.invalid/", options: {} },
    { url: "file:///G:/review/home.html", options: {} },
    { url: "http://pages.offline.invalid/carmel", options: { allowedOrigins: ["http://pages.offline.invalid"] } },
    { url: LIVE_PAGE, options: { allowedOrigins: [new URL(LIVE_PAGE).origin], endpoint: "http://relay.offline.invalid/submit" } }
  ];
  for (const page of blockedPages) {
    const { store } = makeStore({ url: page.url, options: Object.assign({ mode: "live", endpoint: LIVE_ENDPOINT, sinks, fetch: () => { throw new Error("must not be called"); } }, page.options) });
    assert.notEqual(store.sendingBlockedReason(), "", page.url);
    fillPlan(store);
    store.goTo("price");
    store.next();
    fillDetails(store, "service_request", "text");
    store.next();
    store.track("yard_size_help_opened");
    assert.equal((await store.submit()).status, "blocked");
    assert.deepEqual(calls, [], page.url + ": a tag was called");
    assert.deepEqual(sinks.dataLayer, []);
    assert.ok(store.trackLog.length >= 8, "the events are still written to the log for inspection");
    assert.ok(store.trackLog.every((entry) => entry.sent === false));
  }
  // The same build on a page that may send does call them.
  const allowed = livePage();
  allowed.store.set({ dogCount: "2" });
  assert.deepEqual(allowed.calls.map((call) => call.name), ["funnel_viewed", "QuoteFunnelViewed", "dog_count_selected"]);
});

// Added after verification: an out-of-area ZIP handed over by open() must not leave an older accepted ZIP in storage,
// and must not create stored progress where none existed.
import { makeStore as makeStoreForStaleZip } from "./helpers/make-store.mjs";
test("open() with an out-of-area ZIP clears a stale stored ZIP and writes nothing on a fresh visit", () => {
  const first = makeStoreForStaleZip();
  first.store.set({ dogCount: "2" });
  first.store.set({ zip: "46032" });
  const key = Object.keys(first.storage.items).find((k) => /"zip"/.test(first.storage.items[k]));
  assert.equal(JSON.parse(first.storage.items[key]).zip, "46032");
  first.store.open({ zip: "46201" });
  assert.equal(JSON.parse(first.storage.items[key]).zip, "", "the stale accepted ZIP is gone");
  assert.equal(JSON.parse(first.storage.items[key]).dogCount, "2", "other progress is kept");
  const fresh = makeStoreForStaleZip();
  fresh.store.open({ zip: "46201" });
  assert.equal(Object.values(fresh.storage.items).some((v) => /"zip"/.test(v)), false, "nothing is stored for a fresh visitor");
});
