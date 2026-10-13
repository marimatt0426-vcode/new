// Save-and-resume (spec section 8): the seven-day plan link.
// The body is exactly six keys, nothing personal is restored, and customer
// status is never pre-selected from a saved plan (spec section 14 item 1).
import test from "node:test";
import assert from "node:assert/strict";
import { core, makeStore, fakeLocation, fillPlan, fillDetails, readyStore } from "./helpers/make-store.mjs";
import { worker, plain } from "./helpers/live-source.mjs";

const ENDPOINT = "https://purge-lead-relay.purgepros.workers.dev/submit";
const TOKEN = "A".repeat(43);

function reply(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) };
}

function liveStore(fetchImpl, url) {
  const calls = [];
  const made = makeStore({
    url: url || "https://quote.itspurgepros.com/",
    options: {
      mode: "live",
      // On the standalone quote host the Worker itself is the endpoint.
      endpoint: (url ? new URL(url).origin : "https://quote.itspurgepros.com") + "/submit",
      fetch: (target, init) => { calls.push({ url: target, init }); return fetchImpl(target, init, calls.length); }
    }
  });
  made.calls = calls;
  return made;
}

test("the save-link body is exactly the six keys the Worker accepts", () => {
  const { store } = makeStore();
  fillPlan(store, { areas: ["side", "back"] });
  const body = core.testing.saveLinkBody(store.getState());
  assert.deepEqual(Object.keys(body), ["zip", "dogs", "frequencyId", "yardSizeId", "areaIds", "customerStatus"]);
  assert.deepEqual(body, { zip: "46032", dogs: 2, frequencyId: "weekly", yardSizeId: "m", areaIds: ["back", "side"], customerStatus: "not_sure" });
  assert.equal(typeof body.dogs, "number", "dogs is a number here");
  assert.deepEqual(body.areaIds, ["back", "side"], "areas are sorted");
  // The Worker's own resumePlan accepts it as it stands.
  assert.deepEqual(plain(worker.resumePlan(body)), body);
});

test("customer status is asked after the price: unanswered goes as the placeholder not_sure", () => {
  const { store } = makeStore();
  fillPlan(store);
  assert.equal(store.getState().customerStatus, "");
  assert.equal(core.testing.saveLinkBody(store.getState()).customerStatus, "not_sure");
  // Without the placeholder the Worker rejects the save.
  assert.equal(worker.resumePlan(Object.assign({}, core.testing.saveLinkBody(store.getState()), { customerStatus: "" })), null);
  for (const status of ["new", "returning", "not_sure"]) {
    store.set({ customerStatus: status });
    const body = core.testing.saveLinkBody(store.getState());
    assert.equal(body.customerStatus, status);
    assert.notEqual(worker.resumePlan(body), null, status);
  }
});

test("every plan the engine allows produces a body the Worker's resumePlan accepts", () => {
  const { store } = makeStore();
  let checked = 0;
  for (let dogs = 1; dogs <= 10; dogs += 1) for (const yard of ["s", "m", "l", "xl", "over"]) for (const areas of [["back"], ["side", "front"], ["front", "side", "back"]]) for (const frequency of ["twice", "weekly", "biweekly", "onetime", "custom"]) {
    store.set({ frequency: "" });
    store.set({ zip: "46123", dogCount: String(dogs), yardSize: yard, areas });
    store.set({ frequency });
    if (!store.validatePlan().ok) continue;
    const body = core.testing.saveLinkBody(store.getState());
    assert.notEqual(worker.resumePlan(body), null, JSON.stringify(body));
    checked += 1;
  }
  assert.ok(checked > 200, "plans checked: " + checked);
});

test("demo: a link of the one fixed form comes back, nothing personal is in the request", async () => {
  const { store, fetchCalls } = readyStore();
  const result = await store.createSaveLink();
  assert.equal(result.ok, true);
  assert.equal(result.status, "created");
  assert.equal(result.demo, true);
  assert.match(result.url, /^https:\/\/quote\.itspurgepros\.com\/#resume=[A-Za-z0-9_-]{43}$/);
  assert.ok(core.SAVE_LINK_PATTERN.test(result.url));
  assert.equal(result.message, "Your link is ready.");
  assert.equal(result.expiresAt - Date.parse("2026-10-07T15:00:00.000Z"), 7 * 24 * 60 * 60 * 1000, "seven days");
  assert.deepEqual(Object.keys(result.body), plain(core.SAVE_LINK_KEYS));
  assert.equal(fetchCalls.length, 0);
  // Recorded for inspection; six keys only even though a full request form is filled in.
  const logged = store.submissionLog.filter((entry) => entry.kind === "save-link");
  assert.equal(logged.length, 1);
  const text = JSON.stringify(logged[0]);
  for (const personal of ["Test", "Reviewer", "3175550100", "test@example.com", "123 Example St", "Carmel"]) assert.equal(text.includes(personal), false, personal);
  // Creating a link sends nothing to the team and fires no request or
  // conversion event. (It is counted, with no parameters: T14, tracking.test.mjs.)
  assert.equal(store.trackLog.filter((entry) => /requested|lead|conversion/i.test(entry.event)).length, 0);
});

test("a link belongs to one exact plan: the same plan reuses it, a changed plan gets a new one", async () => {
  const { store } = makeStore();
  fillPlan(store);
  const first = await store.createSaveLink();
  const again = await store.createSaveLink();
  assert.equal(again.url, first.url);
  assert.equal(again.reused, true);
  assert.equal(store.submissionLog.length, 1, "no second request for the same plan");
  store.set({ dogCount: "3" });
  const changed = await store.createSaveLink();
  assert.notEqual(changed.url, first.url);
  assert.equal(changed.reused, false);
  assert.equal(changed.body.dogs, 3);
});

test("no save link for an unfinished plan or an out-of-area ZIP", async () => {
  const { store } = makeStore();
  store.set({ dogCount: "2", zip: "46032" });
  const early = await store.createSaveLink();
  assert.equal(early.ok, false);
  assert.equal(early.status, "not_ready");
  assert.equal(early.url, "");
  assert.ok(early.errors.length >= 3);
  fillPlan(store);
  store.set({ zip: "46201" });
  assert.equal((await store.createSaveLink()).status, "not_ready");
  assert.equal(store.submissionLog.length, 0);
});

test("a reply that arrives after the plan changed is discarded", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { store } = makeStore({ options: { wait: () => gate } });
  fillPlan(store);
  const pending = store.createSaveLink();
  // A second press while working does not start a second request.
  assert.equal((await store.createSaveLink()).status, "busy");
  store.set({ yardSize: "l" });
  release();
  const stale = await pending;
  assert.equal(stale.ok, false);
  assert.equal(stale.status, "stale");
  assert.equal(stale.url, "");
});

test("demo: every save-link failure the spec lists", async () => {
  assert.deepEqual(plain(core.DEMO_SAVE_OUTCOMES), ["success", "rate_limited", "unavailable", "invalid", "timeout", "bad_link"]);
  const expected = {
    rate_limited: ["rate_limited", "Too many save-link attempts. Please try again later; you can still build a quote."],
    unavailable: ["unavailable", "Save links are temporarily unavailable. You can continue with your quote."],
    invalid: ["rejected", "This saved plan could not be opened. Please build a new quote."],
    timeout: ["timeout", "Creating the link took too long. You can try again or continue with your quote."],
    bad_link: ["bad_link", "We could not create a valid save link."]
  };
  for (const [outcome, [status, message]] of Object.entries(expected)) {
    const { store } = makeStore({ options: { demo: { save: outcome } } });
    fillPlan(store);
    const result = await store.createSaveLink();
    assert.equal(result.ok, false, outcome);
    assert.equal(result.status, status, outcome);
    assert.equal(result.message, message, outcome);
    assert.equal(result.url, "");
    // The visitor can carry on with the quote and try again.
    store.demo.save = "success";
    assert.equal((await store.createSaveLink()).ok, true, outcome + " then retry");
    assert.equal(store.validatePlan().ok, true);
  }
});

test("demo resume: the plan opens on the price step with the notice; nothing personal and no customer status is restored", async () => {
  // Save on one "page"...
  const saver = readyStore();
  saver.store.set({ customerStatus: "returning" });
  const link = await saver.store.createSaveLink();
  const token = link.url.split("#resume=")[1];
  assert.equal(link.body.customerStatus, "returning");

  // ...and open it. (Demo links only open in the store that made them; an
  // unknown token opens a fixed sample plan.)
  const heard = [];
  saver.store.subscribe((state, info) => heard.push([info.reason, state.resumeLoading]));
  const pending = saver.store.resume(token);
  assert.equal(saver.store.getState().resumeLoading, true);
  assert.equal(saver.store.getState().firstName, "", "the form is cleared as soon as a saved link starts opening");
  const result = await pending;
  assert.deepEqual(heard, [["resume_loading", true], ["resumed", false]]);
  assert.equal(result.ok, true);
  assert.equal(result.status, "resumed");
  assert.equal(result.pricingChanged, false);
  assert.equal(result.notice, "Your saved plan is ready. Review today's price and first-cleanup terms before continuing. Contact details and permissions have not been restored.");

  const state = saver.store.getState();
  assert.equal(state.step, "price");
  assert.equal(state.resumeNotice, result.notice);
  assert.equal(state.zip, "46032");
  assert.equal(state.zipSource, "resume");
  assert.equal(state.dogCount, "2");
  assert.equal(state.frequency, "weekly");
  assert.equal(state.yardSize, "m");
  assert.deepEqual(state.areas, ["back", "front"]);
  assert.equal(saver.store.quote().priceCents, 2899);
  // NEVER pre-selected from a saved plan, whatever was saved.
  assert.equal(state.customerStatus, "");
  // Nothing personal, no consent, no terms, no intent choice, no request.
  for (const field of ["firstName", "lastName", "phone", "email", "address", "question", "startTiming", "lastCleaned"]) assert.equal(state[field], "", field);
  assert.equal(state.smsConsent, false);
  assert.equal(state.termsAccepted, false);
  assert.equal(state.intent, "service_request");
  assert.equal(state.receipt, null);
  assert.equal(saver.store.submissionLog.filter((entry) => entry.kind !== "save-link").length, 0, "nothing is submitted");
  // The plan is written to session progress so it survives moving between pages, without the status.
  assert.deepEqual(JSON.parse(saver.storage.items.pp_quote_progress_v3), { zip: "46032", dogCount: "2", frequency: "weekly", areas: ["back", "front"], yardSize: "m", lastCleaned: "", customerStatus: "" });
  // A request made after a resume gets its own fresh id.
  assert.equal(saver.store.buildPayload().ok, false, "the request form starts empty");
});

test("the saved-plan notice goes away once the visitor moves on or changes the plan", async () => {
  const moved = makeStore().store;
  await moved.resume(TOKEN);
  assert.ok(moved.getState().resumeNotice);
  moved.next();
  assert.equal(moved.getState().resumeNotice, "");
  moved.back();
  assert.equal(moved.getState().resumeNotice, "", "and it does not come back");

  const changed = makeStore().store;
  await changed.resume(TOKEN);
  changed.set({ dogCount: "3" });
  assert.equal(changed.getState().resumeNotice, "");
});

test("demo resume: prices changed since saving", async () => {
  const { store } = makeStore({ options: { demo: { resume: "changed" } } });
  const result = await store.resume(TOKEN);
  assert.equal(result.ok, true);
  assert.equal(result.pricingChanged, true);
  assert.equal(result.notice, "Pricing has changed since you saved this plan. We have recalculated it using today's prices. Review the current price and first-cleanup terms before continuing.");
  assert.equal(store.getState().step, "price");
});

test("demo resume: every failure the spec lists leaves a fresh builder with the right notice", async () => {
  assert.deepEqual(plain(core.DEMO_RESUME_OUTCOMES), ["success", "changed", "expired", "plan_unavailable", "mismatch", "timeout", "rate_limited", "unavailable"]);
  const expected = {
    expired: ["expired", "This save link has expired or is unavailable. Please build a new quote."],
    plan_unavailable: ["plan_unavailable", "Coverage or plan options have changed. Please build a new quote with the current options."],
    mismatch: ["mismatch", "The available prices or plan options changed. Reload this page to build a quote with the current options."],
    timeout: ["timeout", "The saved plan took too long to load. Reopen your saved link to try again, or build a new quote."],
    rate_limited: ["rate_limited", "Too many save-link attempts. Please try again later; you can still build a quote."],
    unavailable: ["unavailable", "Save links are temporarily unavailable. You can continue with your quote."]
  };
  for (const [outcome, [status, notice]] of Object.entries(expected)) {
    const { store } = readyStore({ options: { demo: { resume: outcome } } });
    const result = await store.resume(TOKEN);
    assert.equal(result.ok, false, outcome);
    assert.equal(result.status, status, outcome);
    assert.equal(result.notice, notice, outcome);
    const state = store.getState();
    assert.equal(state.resumeNotice, notice);
    assert.equal(state.resumeLoading, false);
    assert.equal(state.step, "dogs", outcome + ": back at the first question");
    assert.equal(state.dogCount, "");
    assert.equal(state.firstName, "");
    assert.deepEqual(store.trackLog.filter((entry) => entry.event === "price_viewed"), []);
  }
});

test("a malformed token is refused without asking anyone", async () => {
  for (const token of ["invalid", "", "short", "A".repeat(42), "A".repeat(44), "A".repeat(42) + "!", null, undefined, 12345]) {
    const { store, fetchCalls } = makeStore();
    const result = await store.resume(token);
    assert.equal(result.ok, false, String(token));
    assert.equal(result.status, "invalid_token");
    assert.equal(result.notice, "This save link is invalid. Please build a new quote.");
    assert.equal(store.getState().resumeNotice, result.notice);
    assert.equal(fetchCalls.length, 0);
  }
});

test("the saved plan is checked again locally before it is used (spec 8.2 step 4)", async () => {
  const good = { zip: "46032", dogs: 2, frequencyId: "weekly", yardSizeId: "m", areaIds: ["back", "front"], customerStatus: "new" };
  const quote = { custom: false, priceCents: 2899, pricingVersion: "2026-08-cloudflare-v1" };
  const open = async (plan, reported) => {
    const { store } = liveStore(async () => reply(200, { ok: true, plan, quote: reported, pricingChanged: false, expiresAt: 1 }));
    return [await store.resume(TOKEN), store];
  };
  const [fine, fineStore] = await open(good, quote);
  assert.equal(fine.ok, true);
  assert.equal(fineStore.getState().customerStatus, "", "even 'new' from the Worker is not pre-selected");

  const broken = [
    [Object.assign({}, good, { extra: "x" }), quote, "The saved plan is no longer available. Please build a new quote."],
    [(({ customerStatus, ...rest }) => rest)(good), quote, "The saved plan is no longer available. Please build a new quote."],
    [Object.assign({}, good, { zip: "46201" }), quote, "The saved plan is no longer available. Please build a new quote."],
    [Object.assign({}, good, { dogs: "2" }), quote, "The saved plan is no longer available. Please build a new quote."],
    [Object.assign({}, good, { areaIds: [] }), quote, "The saved plan is no longer available. Please build a new quote."],
    [Object.assign({}, good, { areaIds: ["back", "back"] }), quote, "The saved plan is no longer available. Please build a new quote."],
    [Object.assign({}, good, { areaIds: ["garage"] }), quote, "The saved plan is no longer available. Please build a new quote."],
    [Object.assign({}, good, { customerStatus: "vip" }), quote, "The saved plan is no longer available. Please build a new quote."],
    [good, Object.assign({}, quote, { priceCents: 2999 }), "The available prices or plan options changed. Reload this page to build a quote with the current options."],
    [good, Object.assign({}, quote, { pricingVersion: "2027-01" }), "The available prices or plan options changed. Reload this page to build a quote with the current options."],
    [good, Object.assign({}, quote, { custom: true, priceCents: null }), "The available prices or plan options changed. Reload this page to build a quote with the current options."],
    [Object.assign({}, good, { dogs: 6 }), quote, "The available prices or plan options changed. Reload this page to build a quote with the current options."],
    [good, null, "The available prices or plan options changed. Reload this page to build a quote with the current options."]
  ];
  for (const [plan, reported, notice] of broken) {
    const [result, store] = await open(plan, reported);
    assert.equal(result.ok, false, JSON.stringify(plan));
    assert.equal(result.notice, notice, JSON.stringify([plan, reported]));
    assert.equal(store.getState().dogCount, "", "nothing from a rejected plan is loaded");
    assert.equal(store.getState().step, "dogs");
  }
});

test("live: creating a link posts the six keys to /quote-resume without cookies or referrer", async () => {
  const { store, calls } = liveStore(async () => reply(201, { ok: true, url: "https://quote.itspurgepros.com/#resume=" + TOKEN, expiresAt: 1791990000000 }));
  fillPlan(store);
  fillDetails(store, "service_request", "text");
  const result = await store.createSaveLink();
  assert.equal(result.ok, true);
  assert.equal(result.url, "https://quote.itspurgepros.com/#resume=" + TOKEN);
  assert.equal(result.expiresAt, 1791990000000);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://quote.itspurgepros.com/quote-resume");
  const init = calls[0].init;
  assert.equal(init.method, "POST");
  assert.equal(init.credentials, "omit");
  assert.equal(init.cache, "no-store");
  assert.equal(init.referrerPolicy, "no-referrer");
  assert.equal(init.redirect, "error");
  assert.deepEqual(init.headers, { "Content-Type": "application/json" });
  assert.ok(init.signal);
  assert.deepEqual(Object.keys(JSON.parse(init.body)), ["zip", "dogs", "frequencyId", "yardSizeId", "areaIds", "customerStatus"]);
  assert.notEqual(worker.resumePlan(JSON.parse(init.body)), null);
  assert.ok(init.body.length < 1024, "inside the Worker's 1,024-byte limit");
});

test("live: only a link of the fixed form is accepted, and server failures use the server's words", async () => {
  for (const url of ["https://evil.example/#resume=" + TOKEN, "https://quote.itspurgepros.com/#resume=short", "http://quote.itspurgepros.com/#resume=" + TOKEN, "", undefined]) {
    const { store } = liveStore(async () => reply(201, { ok: true, url }));
    fillPlan(store);
    const result = await store.createSaveLink();
    assert.equal(result.ok, false, String(url));
    assert.equal(result.status, "bad_link");
    assert.equal(result.message, "We could not create a valid save link.");
  }
  const cases = [
    [429, { ok: false, code: "RATE_LIMITED", message: "Too many save-link attempts. Please try again later; you can still build a quote." }, "rate_limited", "Too many save-link attempts. Please try again later; you can still build a quote."],
    [503, { ok: false, code: "UNAVAILABLE", message: "Save links are temporarily unavailable. You can continue with your quote." }, "unavailable", "Save links are temporarily unavailable. You can continue with your quote."],
    [400, { ok: false, code: "INVALID_REQUEST", message: "This saved plan could not be opened. Please build a new quote." }, "rejected", "This saved plan could not be opened. Please build a new quote."],
    [403, { ok: false, code: "FORBIDDEN" }, "failed", "The save link is unavailable. Please try again later or build a new quote."],
    [500, "oops", "failed", "The save link is unavailable. Please try again later or build a new quote."]
  ];
  for (const [status, body, expectedStatus, message] of cases) {
    const { store } = liveStore(async () => reply(status, body));
    fillPlan(store);
    const result = await store.createSaveLink();
    assert.equal(result.status, expectedStatus, String(status));
    assert.equal(result.message, message, String(status));
  }
  const offline = liveStore(async () => { throw new TypeError("Failed to fetch"); });
  fillPlan(offline.store);
  const failed = await offline.store.createSaveLink();
  assert.equal(failed.status, "failed");
  assert.equal(failed.message, "The save link is unavailable. Please try again later or build a new quote.");
});

test("live: the 12-second limit for save links", async () => {
  const timers = [];
  const made = makeStore({
    url: "https://quote.itspurgepros.com/",
    options: { mode: "live", endpoint: "https://quote.itspurgepros.com/submit", fetch: () => new Promise(() => {}), setTimeout: (callback, ms) => { timers.push({ callback, ms }); return timers.length; }, clearTimeout: () => {} }
  });
  fillPlan(made.store);
  const pending = made.store.createSaveLink();
  assert.deepEqual(timers.map((timer) => timer.ms), [12000]);
  timers[0].callback();
  const result = await pending;
  assert.equal(result.status, "timeout");
  assert.equal(result.message, "Creating the link took too long. You can try again or continue with your quote.");
  const opening = made.store.resume(TOKEN);
  assert.equal(timers[1].ms, 12000);
  timers[1].callback();
  assert.equal((await opening).notice, "The saved plan took too long to load. Reopen your saved link to try again, or build a new quote.");
});

test("live: opening a link posts only the token to /quote-resume/open and handles each reply", async () => {
  const plan = { zip: "46123", dogs: 10, frequencyId: "custom", yardSizeId: "s", areaIds: ["back"], customerStatus: "not_sure" };
  const { store, calls } = liveStore(async () => reply(200, { ok: true, plan, quote: { custom: true, priceCents: null, pricingVersion: "2026-08-cloudflare-v1" }, pricingChanged: true, expiresAt: 1 }));
  const result = await store.resume(TOKEN);
  assert.equal(result.ok, true);
  assert.equal(result.pricingChanged, true);
  assert.equal(calls[0].url, "https://quote.itspurgepros.com/quote-resume/open");
  assert.deepEqual(JSON.parse(calls[0].init.body), { token: TOKEN });
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(calls[0].init.referrerPolicy, "no-referrer");
  assert.equal(store.getState().frequency, "custom");
  assert.equal(store.quote().custom, true);
  assert.equal(store.getState().city, "Avon");

  const cases = [
    [404, { ok: false, code: "LINK_UNAVAILABLE", message: "This save link has expired or is unavailable. Please build a new quote." }, "expired"],
    [409, { ok: false, code: "PLAN_UNAVAILABLE", message: "Coverage or plan options have changed. Please build a new quote with the current options." }, "plan_unavailable"],
    [429, { ok: false, code: "RATE_LIMITED", message: "Too many save-link attempts. Please try again later; you can still build a quote." }, "rate_limited"],
    [503, { ok: false, code: "UNAVAILABLE", message: "Save links are temporarily unavailable. You can continue with your quote." }, "unavailable"]
  ];
  for (const [status, body, expected] of cases) {
    const failing = liveStore(async () => reply(status, body));
    const failed = await failing.store.resume(TOKEN);
    assert.equal(failed.status, expected);
    assert.equal(failed.notice, body.message);
  }
  const silent = liveStore(async () => reply(403, { ok: false, code: "FORBIDDEN" }));
  assert.equal((await silent.store.resume(TOKEN)).notice, "This save link is unavailable. Please build a new quote.");
});

test("live save links are refused from a page that may not send", async () => {
  const made = makeStore({ url: "file:///G:/review/quote.html", options: { mode: "live", endpoint: ENDPOINT, fetch: () => { throw new Error("must not be called"); } } });
  fillPlan(made.store);
  assert.equal((await made.store.createSaveLink()).status, "blocked");
  assert.equal((await made.store.resume(TOKEN)).status, "blocked");
  assert.equal(made.store.networkLog.length, 0);
});

test("opening a second link while the first is loading keeps only the second", async () => {
  const releases = [];
  const { store } = makeStore({ options: { wait: () => new Promise((resolve) => releases.push(resolve)) } });
  const first = store.resume(TOKEN);
  const second = store.resume("B".repeat(43));
  releases[0]();
  assert.equal((await first).status, "stale");
  assert.equal(store.getState().resumeLoading, true, "still waiting for the second");
  releases[1]();
  assert.equal((await second).ok, true);
  assert.equal(store.getState().step, "price");
});

test("takeResumeToken removes the token from the address before anything else can read it", () => {
  const replaced = [];
  const page = (href) => {
    const location = fakeLocation(href);
    return { window: { location, history: { state: { kept: true }, replaceState: (state, title, url) => replaced.push([state, url]) } } };
  };
  assert.equal(core.takeResumeToken(page("https://quote.itspurgepros.com/?utm_source=meta#resume=" + TOKEN)), TOKEN);
  assert.deepEqual(replaced.pop(), [{ kept: true }, "/?utm_source=meta"], "the hash is gone, the rest of the address stays");
  assert.equal(core.takeResumeToken(page("https://quote.itspurgepros.com/#resume=tooshort")), "invalid");
  assert.equal(replaced.pop()[1], "/", "a malformed token is removed too");
  assert.equal(core.takeResumeToken(page("https://quote.itspurgepros.com/#resume=" + TOKEN + "&x=1")), "invalid");
  assert.equal(core.takeResumeToken(page("https://quote.itspurgepros.com/#quote")), "");
  assert.equal(core.takeResumeToken(page("https://quote.itspurgepros.com/")), "");
  assert.equal(replaced.length, 1, "nothing is touched when there is no token");
  // The standalone page takes the token in its <head> and hands it over once.
  let handed = 0;
  const viaHead = { window: { location: fakeLocation("https://quote.itspurgepros.com/"), history: {}, __ppTakePlanToken: () => { handed += 1; return handed === 1 ? TOKEN : ""; } } };
  assert.equal(core.takeResumeToken(viaHead), TOKEN);
  assert.equal(core.takeResumeToken(viaHead), "");
  // When the address cannot be cleaned, the token is not used at all.
  const stuck = { window: { location: fakeLocation("https://quote.itspurgepros.com/#resume=" + TOKEN), history: { replaceState: () => { throw new Error("blocked"); } } } };
  assert.equal(core.takeResumeToken(stuck), "invalid");
});
