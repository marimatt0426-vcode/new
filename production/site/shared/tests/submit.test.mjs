// Submitting: demo mode (the default) with every reply the spec lists, the
// request-id rules, and live mode with its guards (spec 4.5.2, 12.1, 12.4).
// Live mode is exercised with a stand-in fetch; no request leaves this process.
import test from "node:test";
import assert from "node:assert/strict";
import { core, makeStore, fakeLocation, fillPlan, fillDetails, readyStore } from "./helpers/make-store.mjs";
import { worker, plain } from "./helpers/live-source.mjs";

const ENDPOINT = "https://purge-lead-relay.purgepros.workers.dev/submit";

// A stand-in for the Worker's HTTP reply.
function reply(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) };
}

// A live-mode store on an allowed origin with a scripted fetch.
function liveStore(fetchImpl, extra) {
  const calls = [];
  const made = readyStore({
    url: (extra && extra.url) || "https://itspurgepros.com/carmel",
    options: Object.assign({
      mode: "live",
      endpoint: ENDPOINT,
      fetch: (url, init) => { calls.push({ url, init }); return fetchImpl(url, init, calls.length); }
    }, (extra && extra.options) || {})
  });
  made.calls = calls;
  return made;
}

test("demo mode is the default and never touches the network", async () => {
  const { store, fetchCalls } = readyStore();
  assert.equal(store.mode, "demo");
  assert.equal(store.isDemo, true);
  const result = await store.submit();
  assert.equal(fetchCalls.length, 0);
  assert.equal(store.networkLog.length, 0);
  assert.equal(result.ok, true);
  assert.equal(result.status, "success");
  assert.equal(result.httpStatus, 202);
  assert.equal(result.demo, true);
  assert.equal(result.requestId, "test-id-0001");
  assert.equal(result.reference, result.requestId, "a reference to show the visitor");
  // The payload is returned and recorded for inspection.
  assert.equal(result.payload.requestId, result.requestId);
  assert.equal(store.submissionLog.length, 1);
  assert.deepEqual(store.submissionLog[0].payload, result.payload);
  assert.equal(store.submissionLog[0].demo, true);
  assert.equal(worker.validateV3(result.payload).ok, true, "what demo mode records is what the Worker would accept");
});

test("after success: the done step, a receipt, and no more changes until reset", async () => {
  const { store } = readyStore();
  const heard = [];
  store.subscribe((state, info) => heard.push([info.reason, state.submitting, state.step]));
  const result = await store.submit();
  assert.deepEqual(heard, [["submitting", true, "dogs"], ["submitted", false, "done"]]);
  const state = store.getState();
  assert.equal(state.step, "done");
  assert.deepEqual(state.receipt, {
    requestId: result.requestId, intent: "service_request", stage: "service_requested", custom: false, oneTime: false,
    priceCents: 2899, priceText: "$28.99 per visit", frequencyId: "weekly", preferredContact: "text", replyWhere: "your text messages"
  });
  assert.equal(store.flow().primaryAction, "none");
  assert.equal(store.flow().back, "");
  assert.equal(store.priceBar().visible, false);
  // Frozen until reset.
  assert.equal(store.set({ dogCount: "5" }).ok, false);
  assert.equal(store.getState().dogCount, "2");
  assert.equal((await store.submit()).status, "busy");
  assert.equal(store.submissionLog.length, 1, "no second request");
  assert.equal(store.goTo("price").ok, false);
  assert.equal(store.reset(), true);
  assert.equal(store.getState().step, "dogs");
  assert.equal(store.getState().receipt, null);
  assert.equal(store.getState().firstName, "");
});

test("submit validates first: nothing is built or recorded for an invalid request", async () => {
  const { store } = makeStore();
  fillPlan(store);
  const empty = await store.submit();
  assert.equal(empty.ok, false);
  assert.equal(empty.status, "invalid");
  assert.ok(empty.fieldErrors.length >= 6);
  assert.ok(empty.fieldErrors.every((error) => error.field && error.message));
  assert.equal(empty.message, empty.fieldErrors[0].message);
  assert.equal(store.submissionLog.length, 0);
  assert.equal(store.getState().submitting, false);

  // Everything right except the terms box.
  fillDetails(store, "service_request", "text");
  store.set({ termsAccepted: false });
  const noTerms = await store.submit();
  assert.equal(noTerms.status, "invalid");
  assert.deepEqual(noTerms.fieldErrors.map((error) => error.field), ["termsAccepted"]);
  assert.equal(noTerms.message, "Agree to the Terms of Service and acknowledge the Privacy Policy before submitting.");
  assert.equal(store.submissionLog.length, 0);
});

test("only one request at a time: a second submit while sending is refused", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { store } = readyStore({ options: { wait: () => gate } });
  const first = store.submit();
  assert.equal(store.getState().submitting, true);
  const second = await store.submit();
  assert.equal(second.status, "busy");
  assert.equal(second.message, "Sending your request. Please wait a moment before closing.");
  // While sending nothing can be edited, moved or reset.
  assert.equal(store.set({ firstName: "Changed" }).ok, false);
  assert.equal(store.goTo("dogs").ok, false);
  assert.equal(store.reset(), false);
  assert.equal(store.flow().primaryAction, "none");
  assert.equal(store.flow().back, "");
  assert.equal(store.open({ zip: "46033" }).ok, false, "open() is ignored while sending");
  assert.equal(store.priceBar().continueEnabled, false);
  release();
  assert.equal((await first).ok, true);
  assert.equal(store.submissionLog.length, 1);
});

test("demo: server-side validation error, with the Worker's field list turned into highlighted fields", async () => {
  const { store } = readyStore({ options: { demo: { submit: "invalid", invalidFields: ["phone", "street", "clientPriceCents"] } } });
  const result = await store.submit();
  assert.equal(result.ok, false);
  assert.equal(result.status, "server_invalid");
  assert.equal(result.httpStatus, 400);
  assert.equal(result.message, "Please check the highlighted form details.");
  assert.equal(result.retryAllowed, true);
  assert.equal(result.locked, false);
  assert.deepEqual(result.serverFields, ["phone", "street", "clientPriceCents"]);
  assert.deepEqual(result.fieldErrors.map((error) => [error.field, error.step, error.message]), [
    ["phone", "request", "Enter a valid 10-digit phone number."],
    ["address", "request", "Enter the service street address."]
  ]);
  assert.equal(result.formErrors.length, 1);
  assert.match(result.formErrors[0], /reload the page/);
  // The visitor can correct and try again.
  assert.equal(store.getState().submitting, false);
  assert.equal(store.getState().step, "dogs");
  assert.equal(store.set({ phone: "3175550101" }).ok, true);
});

for (const [outcome, code, pattern] of [
  ["uncertain", "SUBMISSION_UNCERTAIN", /^Your request may already be with our team\. Please call \(317\) 961-5865 to confirm before submitting again\. Your reference is test-id-0001\. Nothing has been scheduled or charged by this form\.$/],
  ["conflict", "REQUEST_ID_CONFLICT", /^We could not safely submit the changed details\. Please call \(317\) 961-5865 and mention reference test-id-0001\.$/]
]) {
  test("demo: '" + outcome + "' locks the form: no editing, no resubmitting, call to confirm", async () => {
    const { store } = readyStore({ options: { demo: { submit: outcome } } });
    const result = await store.submit();
    assert.equal(result.ok, false);
    assert.equal(result.status, "locked");
    assert.equal(result.locked, true);
    assert.equal(result.retryAllowed, false);
    assert.equal(result.code, code);
    assert.equal(result.httpStatus, 409);
    assert.match(result.message, pattern);
    assert.deepEqual(store.getState().locked, { code, message: result.message, requestId: "test-id-0001" });

    // Locked: submitting again only repeats the message.
    store.demo.submit = "success";
    const again = await store.submit();
    assert.equal(again.status, "locked");
    assert.equal(again.message, result.message);
    assert.equal(store.submissionLog.length, 1, "nothing was sent a second time");
    // No editing, no moving, no reset: only a page reload clears it (spec 4.5.2).
    assert.equal(store.set({ firstName: "Other" }).ok, false);
    assert.equal(store.getState().firstName, "Test");
    assert.equal(store.goTo("request").ok, false);
    assert.equal(store.edit("dogs").ok, false);
    assert.equal(store.reset(), false);
    assert.equal(store.flow().primaryAction, "none");
    assert.equal(store.flow().canContinue, false);
    assert.equal(store.flow().blockedReason, result.message);
    assert.equal(store.priceBar().continueEnabled, false);
    assert.equal((await store.createSaveLink()).ok, false);
    assert.equal(store.getState().step, "dogs", "not the done step");
    assert.equal(store.getState().receipt, null);
  });
}

test("demo: 'unavailable' can be retried", async () => {
  const { store } = readyStore({ options: { demo: { submit: "unavailable" } } });
  const result = await store.submit();
  assert.equal(result.status, "unavailable");
  assert.equal(result.httpStatus, 503);
  assert.equal(result.message, "We could not tell whether your request reached us. Send it again to check; it will not be counted twice. Or text us at (317) 961-5865.");
  assert.equal(result.retryAllowed, true);
  assert.equal(store.getState().locked, null);
  store.demo.submit = "success";
  assert.equal((await store.submit()).ok, true);
});

test("demo: 'timeout' and 'network' give plain messages, never the browser's own text", async () => {
  const timeout = readyStore({ options: { demo: { submit: "timeout" } } }).store;
  const timedOut = await timeout.submit();
  assert.equal(timedOut.status, "timeout");
  assert.equal(timedOut.message, "We could not tell whether your request reached us. Send it again to check; it will not be counted twice. Or text us at (317) 961-5865.");
  assert.equal(timedOut.retryAllowed, true);

  const network = readyStore({ options: { demo: { submit: "network" } } }).store;
  const failed = await network.submit();
  assert.equal(failed.status, "network");
  assert.equal(failed.message, "We could not tell whether your request reached us. Send it again to check; it will not be counted twice. Or text us at (317) 961-5865.");
  assert.equal(failed.retryAllowed, true);
  assert.equal(network.getState().submitting, false);
});

test("demo: 'forbidden' (or any other rejection) shows a plain message and keeps the raw text for debugging only", async () => {
  const { store } = readyStore({ options: { demo: { submit: "forbidden" } } });
  const result = await store.submit();
  assert.equal(result.status, "rejected");
  assert.equal(result.httpStatus, 403);
  assert.equal(result.message, "We could not save your request. Please try again. Or text us at (317) 961-5865.");
  assert.equal(result.serverMessage, "Forbidden");
  assert.equal(result.retryAllowed, true);
});

test("demo: 'slow' succeeds after a long wait, to build the sending state", async () => {
  const waits = [];
  const { store } = readyStore({ options: { demo: { submit: "slow" }, wait: (ms) => { waits.push(ms); return Promise.resolve(); } } });
  assert.equal((await store.submit()).ok, true);
  assert.deepEqual(waits, [4000]);
  const quick = readyStore({ options: { demo: { delayMs: 250 }, wait: (ms) => { waits.push(ms); return Promise.resolve(); } } }).store;
  await quick.submit();
  assert.deepEqual(waits, [4000, 250]);
});

test("demo switches can be set by options, by query string, or changed while the page is open", async () => {
  assert.deepEqual(plain(core.DEMO_SUBMIT_OUTCOMES), ["success", "slow", "invalid", "uncertain", "conflict", "unavailable", "timeout", "network", "forbidden"]);
  // Every outcome is reachable from the query string.
  const expected = { success: "success", slow: "success", invalid: "server_invalid", uncertain: "locked", conflict: "locked", unavailable: "unavailable", timeout: "timeout", network: "network", forbidden: "rejected" };
  for (const outcome of core.DEMO_SUBMIT_OUTCOMES) {
    const { store } = readyStore({ url: "file:///G:/review/home.html?pp_demo=" + outcome });
    assert.equal(store.demo.submit, outcome);
    assert.equal((await store.submit()).status, expected[outcome], outcome);
  }
  const query = makeStore({ url: "file:///G:/review/home.html?pp_demo_submit=invalid&pp_demo_fields=email,city&pp_demo_save=rate_limited&pp_demo_resume=expired&pp_demo_delay=5" }).store;
  assert.deepEqual(plain(query.demo), { submit: "invalid", save: "rate_limited", resume: "expired", delayMs: 5, invalidFields: ["email", "city"] });
  // Unknown values are ignored.
  const unknown = makeStore({ url: "file:///G:/review/home.html?pp_demo=explode&pp_demo_delay=-4", options: { demo: { submit: "timeout" } } }).store;
  assert.equal(unknown.demo.submit, "timeout");
  assert.equal(unknown.demo.delayMs, 900);
  // While the page is open.
  unknown.setDemo({ submit: "network", nonsense: true });
  assert.equal(unknown.demo.submit, "network");
  unknown.demo.submit = "success";
  assert.equal(unknown.demo.submit, "success");
});

test("one requestId is reused for retries of an unchanged request", async () => {
  const { store, clock } = readyStore({ options: { demo: { submit: "timeout" } } });
  const first = await store.submit();
  clock.now += 60000;
  const second = await store.submit();
  store.demo.submit = "unavailable";
  clock.now += 60000;
  const third = await store.submit();
  store.demo.submit = "success";
  clock.now += 60000;
  const fourth = await store.submit();
  assert.equal(first.payload.requestId, "test-id-0001");
  for (const attempt of [second, third, fourth]) {
    assert.equal(attempt.payload.requestId, first.payload.requestId);
    assert.equal(attempt.payload.eventId, first.payload.eventId);
    // Same timestamps and consent evidence as first submitted (spec 12.4).
    assert.equal(attempt.payload.submittedAt, first.payload.submittedAt);
    assert.equal(attempt.payload.smsConsentCapturedAt, first.payload.smsConsentCapturedAt);
    assert.equal(attempt.payload.termsAcceptedAt, first.payload.termsAcceptedAt);
    assert.deepEqual(attempt.payload, first.payload);
  }
  assert.equal(fourth.ok, true);
  assert.equal(fourth.requestId, first.payload.requestId);
  assert.equal(store.submissionLog.length, 4);
  assert.equal(new Set(store.submissionLog.map((entry) => entry.payload.requestId)).size, 1);
});

test("any material change makes a new requestId", async () => {
  const changes = [
    ["phone", (store) => store.set({ phone: "3175550199" })],
    ["first name", (store) => store.set({ firstName: "Tester" })],
    ["street", (store) => store.set({ address: "456 Sample Ave" })],
    ["city", (store) => store.set({ city: "Westfield" })],
    ["start timing", (store) => store.set({ startTiming: "Within the next week" })],
    ["last cleanup", (store) => store.set({ lastCleaned: "2–4 months" })],
    ["customer status", (store) => store.set({ customerStatus: "returning" })],
    ["email added", (store) => store.set({ email: "second@example.com" })],
    ["dogs", (store) => store.set({ dogCount: "3" })],
    ["areas", (store) => store.set({ areas: ["back"] })],
    ["yard", (store) => store.set({ yardSize: "l" })],
    ["frequency", (store) => store.set({ frequency: "twice" })],
    ["ZIP", (store) => store.set({ zip: "46033" })],
    ["reply method", (store) => store.set({ preferredContact: "call" })]
  ];
  for (const [name, change] of changes) {
    const { store } = readyStore({ options: { demo: { submit: "unavailable" } } });
    const first = await store.submit();
    change(store);
    store.set({ termsAccepted: true });
    const second = await store.submit();
    assert.equal(second.status, "unavailable", name + ": still a valid request");
    assert.notEqual(second.payload.requestId, first.payload.requestId, name + " should start a new request");
    assert.equal(second.payload.eventId, second.payload.requestId + ":service_requested");
  }
});

test("changes that are not material keep the same requestId", async () => {
  const { store, clock } = readyStore({ options: { demo: { submit: "unavailable" } } });
  const first = await store.submit();
  clock.now += 5000;
  // The same areas chosen in a different order, the same phone typed differently.
  store.set({ areas: ["front", "back"] });
  store.set({ phone: "317-555-0100" });
  store.set({ firstName: "  Test  " });
  store.set({ termsAccepted: true });
  const second = await store.submit();
  assert.equal(second.payload.requestId, first.payload.requestId);
  // buildPayload on its own shows whether an attempt would be reused.
  assert.equal(store.buildPayload().reused, true);
  store.set({ lastName: "Other" });
  store.set({ termsAccepted: true });
  assert.equal(store.buildPayload().reused, false);
});

test("a new request after success or reset gets a new requestId", async () => {
  const { store } = readyStore();
  const first = await store.submit();
  store.reset();
  fillPlan(store);
  fillDetails(store, "service_request", "text");
  const second = await store.submit();
  assert.equal(second.ok, true);
  assert.notEqual(second.requestId, first.requestId);
});

test("the intent passed to submit is the one sent", async () => {
  const { store } = readyStore();
  store.set({ question: "Do you bring your own bags?" });
  const result = await store.submit("question");
  assert.equal(result.ok, true);
  assert.equal(result.payload.intent, "question");
  assert.equal(result.payload.stage, "question_submitted");
  assert.equal(result.payload.termsAccepted, false);
  assert.equal(store.getState().receipt.intent, "question");
  // A custom estimate cannot be sent as a question.
  const custom = readyStore(undefined, { frequency: "custom" }).store;
  const refused = await custom.submit("question");
  assert.equal(refused.status, "invalid");
  assert.equal(refused.fieldErrors[0].field, "intent");
  assert.equal(custom.submissionLog.length, 0);
});

test("a demo build refuses to pretend on a real Purge Pros origin", async () => {
  for (const url of ["https://itspurgepros.com/", "https://www.itspurgepros.com/carmel", "https://blog.itspurgepros.com/x", "https://quote.itspurgepros.com/"]) {
    const { store } = readyStore({ url });
    assert.notEqual(store.sendingBlockedReason(), "", url);
    const result = await store.submit();
    assert.equal(result.ok, false, url);
    assert.equal(result.status, "blocked", url);
    assert.equal(result.message, "This is a preview. Nothing can be sent from here. Please call (317) 961-5865.");
    assert.equal(store.getState().step, "dogs", "no pretend success screen");
    assert.equal(store.submissionLog.length, 0);
    assert.equal((await store.createSaveLink()).status, "blocked");
  }
  // Review builds (file://, localhost, any other host) run normally.
  for (const url of ["file:///G:/review/home.html", "http://localhost:8080/home.html", "https://review.example/home"]) {
    assert.equal((await readyStore({ url }).store.submit()).ok, true, url);
  }
  // Deliberate override for a controlled check on the real site.
  const allowed = readyStore({ url: "https://itspurgepros.com/", options: { allowDemoOnLiveOrigin: true } }).store;
  assert.equal((await allowed.submit()).ok, true);
});

/* ---- live mode ----------------------------------------------------------- */

test("live mode is off unless asked for, and refuses file://, http:// and origins the Worker does not allow", async () => {
  const blockedPages = [
    "file:///G:/review/home.html",
    "http://itspurgepros.com/",
    "http://localhost:8080/",
    "https://review.example/",
    "https://purge-pros-site-assets.purgepros.workers.dev/"
  ];
  for (const url of blockedPages) {
    const { store, calls } = liveStore(() => { throw new Error("must not be called"); }, { url });
    assert.equal(store.mode, "live");
    assert.notEqual(store.sendingBlockedReason(), "", url);
    const result = await store.submit();
    assert.equal(result.status, "blocked", url);
    assert.equal(result.ok, false);
    assert.equal(result.message, "This page cannot send requests. Please call (317) 961-5865.");
    assert.equal(calls.length, 0, url + " must not reach the network");
    assert.equal(store.getState().step, "dogs");
    assert.equal((await store.createSaveLink()).status, "blocked");
    assert.equal(calls.length, 0);
  }
  // A missing or malformed endpoint also blocks.
  for (const endpoint of ["", "http://purge-lead-relay.purgepros.workers.dev/submit", "https://purge-lead-relay.purgepros.workers.dev/", "not a url"]) {
    const { store, calls } = liveStore(() => { throw new Error("must not be called"); }, { options: { endpoint } });
    assert.equal((await store.submit()).status, "blocked", endpoint);
    assert.equal(calls.length, 0);
  }
  // Allowed: the Worker's listed origins, and the Worker's own origin.
  for (const url of ["https://itspurgepros.com/", "https://www.itspurgepros.com/fishers", "https://blog.itspurgepros.com/post", "https://purge-quote.purgepros.workers.dev/", "https://purge-lead-relay.purgepros.workers.dev/quote"]) {
    const { store } = liveStore(async () => reply(202, { accepted: true, requestId: "x" }), { url });
    assert.equal(store.sendingBlockedReason(), "", url);
  }
});

test("live: the request is a JSON POST without cookies, with an abort signal, carrying exactly the payload", async () => {
  const { store, calls } = liveStore(async (url, init) => reply(202, { accepted: true, requestId: JSON.parse(init.body).requestId }));
  const result = await store.submit();
  assert.equal(result.ok, true);
  assert.equal(result.demo, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, ENDPOINT);
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(calls[0].init.headers, { "Content-Type": "application/json" });
  assert.equal(calls[0].init.credentials, "omit");
  assert.ok(calls[0].init.signal, "an abort signal for the 15-second limit");
  assert.deepEqual(JSON.parse(calls[0].init.body), result.payload);
  assert.equal(worker.validateV3(JSON.parse(calls[0].init.body)).ok, true);
  assert.equal(store.getState().step, "done");
  assert.deepEqual(store.networkLog.map((entry) => entry.kind), ["submit"]);
  // In live mode the inspectable log keeps the request id only, not a second copy of contact details.
  assert.equal(store.submissionLog.length, 1);
  assert.deepEqual(Object.keys(store.submissionLog[0]).sort(), ["at", "demo", "outcome", "requestId"]);
  assert.equal(JSON.stringify(store.submissionLog).includes("3175550100"), false);
});

test("live: a duplicate of an accepted request shows success again", async () => {
  const { store } = liveStore(async (url, init) => reply(202, { accepted: true, requestId: JSON.parse(init.body).requestId }));
  assert.equal((await store.submit()).ok, true);
});

test("live: 409 replies lock the form with the server's message, or the fallback when there is none", async () => {
  const uncertain = liveStore(async (url, init) => reply(409, { accepted: false, code: "SUBMISSION_UNCERTAIN", requestId: JSON.parse(init.body).requestId, message: "Your request may already be with our team. Please call (317) 961-5865 to confirm before submitting again. Your reference is " + JSON.parse(init.body).requestId + ". Nothing has been scheduled or charged by this form." }));
  const first = await uncertain.store.submit();
  assert.equal(first.status, "locked");
  assert.equal(first.code, "SUBMISSION_UNCERTAIN");
  assert.match(first.message, /Your reference is test-id-0001\./);
  assert.equal((await uncertain.store.submit()).status, "locked");
  assert.equal(uncertain.calls.length, 1, "no second request after an uncertain reply");

  const conflict = liveStore(async () => reply(409, { accepted: false, code: "REQUEST_ID_CONFLICT", requestId: "abc", message: "We could not safely submit the changed details. Please call (317) 961-5865 and mention reference abc." }));
  const second = await conflict.store.submit();
  assert.equal(second.code, "REQUEST_ID_CONFLICT");
  assert.equal(second.requestId, "abc");
  assert.equal(conflict.store.getState().locked.requestId, "abc");

  const silent = liveStore(async () => reply(409, { accepted: false, code: "SUBMISSION_UNCERTAIN" }));
  assert.equal((await silent.store.submit()).message, "Please call Purge Pros to confirm your request before submitting again.");
  const bare = liveStore(async () => reply(409, ""));
  const bareResult = await bare.store.submit();
  assert.equal(bareResult.status, "no_receipt");
  assert.equal(bareResult.message, core.SUBMIT_MESSAGES.noReceipt);
  assert.equal(bare.store.getState().locked, null);
});

test("live: 503 can be retried and the retry reuses the same requestId", async () => {
  const { store, calls } = liveStore(async (url, init, attempt) => attempt === 1
    ? reply(503, { accepted: false, code: "SUBMISSION_UNAVAILABLE", requestId: "x", message: "We could not tell whether your request reached us. Send it again to check; it will not be counted twice. Or text us at (317) 961-5865." })
    : reply(202, { accepted: true, requestId: JSON.parse(init.body).requestId }));
  const first = await store.submit();
  assert.equal(first.status, "unavailable");
  assert.equal(first.retryAllowed, true);
  const second = await store.submit();
  assert.equal(second.ok, true);
  assert.equal(calls[1].init.body, calls[0].init.body, "byte-for-byte the same request");
});

test("live: a 400 with fields highlights those fields; other rejections get a plain message", async () => {
  const invalid = liveStore(async () => reply(400, { accepted: false, message: "Please check the highlighted form details.", fields: ["email", "lastCleaned", "stage"] }));
  const first = await invalid.store.submit();
  assert.equal(first.status, "server_invalid");
  assert.deepEqual(first.fieldErrors.map((error) => error.field), ["email", "lastCleaned"]);
  assert.equal(first.formErrors.length, 1);
  assert.equal(first.retryAllowed, true);

  const cases = [
    [403, { accepted: false, message: "Forbidden" }, "Forbidden"],
    [413, { accepted: false, message: "Payload too large" }, "Payload too large"],
    [415, { accepted: false, message: "JSON required" }, "JSON required"],
    [400, { accepted: false, message: "Bad JSON" }, "Bad JSON"],
    [400, { accepted: false, message: "Unsupported widget version" }, "Unsupported widget version"],
    [500, { accepted: false, message: "Relay not configured" }, "Relay not configured"],
    [502, { accepted: false, message: "We could not save your request. Please try again." }, "We could not save your request. Please try again."],
    [500, "<html>Server error</html>", ""],
    [200, { accepted: false }, ""]
  ];
  for (const [status, body, raw] of cases) {
    const { store } = liveStore(async () => reply(status, body));
    const result = await store.submit();
    assert.equal(result.ok, false, String(status));
    assert.equal(result.status, status >= 500 || status === 200 ? "no_receipt" : "rejected", status + " " + JSON.stringify(body));
    assert.equal(result.message, status >= 500 || status === 200 ? core.SUBMIT_MESSAGES.noReceipt : core.SUBMIT_MESSAGES.rejected, "definite refusal or neutral uncertainty");
    assert.equal(result.serverMessage, raw);
    assert.equal(result.httpStatus, status);
    assert.equal(result.retryAllowed, true);
    assert.equal(store.getState().locked, null);
  }
});

test("live: empty or unreadable bodies never prove acceptance", async () => {
  for (const body of ["", "not json"]) {
    const { store } = liveStore(async () => reply(202, body));
    const result = await store.submit();
    assert.equal(result.ok, false, JSON.stringify(body));
    assert.notEqual(store.getState().step, "done");
    assert.equal(result.status, "no_receipt");
    assert.equal(result.requestId, "test-id-0001");
  }
});

test("live: the request is aborted after 15 seconds and can be retried with the same id", async () => {
  const timers = [];
  let aborted = false;
  const { store, calls } = liveStore((url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener("abort", () => { aborted = true; const error = new Error("The operation was aborted."); error.name = "AbortError"; reject(error); });
  }), { options: { setTimeout: (callback, ms) => { timers.push({ callback, ms }); return timers.length; }, clearTimeout: () => {} } });
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  const pending = store.submit();
  await tick(); // let the request start
  assert.deepEqual(timers.map((timer) => timer.ms), [15000]);
  assert.equal(calls.length, 1);
  assert.equal(store.getState().submitting, true);
  timers[0].callback();
  const result = await pending;
  assert.equal(aborted, true, "the request itself is aborted");
  assert.equal(result.status, "timeout");
  assert.equal(result.message, "We could not tell whether your request reached us. Send it again to check; it will not be counted twice. Or text us at (317) 961-5865.");
  assert.equal(result.retryAllowed, true);
  assert.equal(store.getState().submitting, false);
  // The retry is recognisable by the server as the same request.
  const retry = store.submit();
  await tick();
  timers[1].callback();
  await retry;
  assert.equal(JSON.parse(calls[1].init.body).requestId, JSON.parse(calls[0].init.body).requestId);
});

test("live: the 15-second limit holds even if the request never answers and cannot be aborted", async () => {
  const timers = [];
  const { store } = liveStore(() => new Promise(() => {}), { options: { AbortController: null, setTimeout: (callback, ms) => { timers.push({ callback, ms }); return timers.length; }, clearTimeout: () => {} } });
  const pending = store.submit();
  timers[0].callback();
  const result = await pending;
  assert.equal(result.status, "timeout");
  assert.equal(store.getState().submitting, false, "the form is never left stuck on Sending");
});

test("live: a network failure never shows the browser's own text", async () => {
  const { store } = liveStore(async () => { throw new TypeError("Failed to fetch"); });
  const result = await store.submit();
  assert.equal(result.status, "network");
  assert.equal(result.message, "We could not tell whether your request reached us. Send it again to check; it will not be counted twice. Or text us at (317) 961-5865.");
  assert.equal(result.serverMessage, "Failed to fetch");
  assert.equal(result.retryAllowed, true);
});

test("live mode ignores the demo query switches", async () => {
  const { store, calls } = liveStore(async (url, init) => reply(202, { accepted: true, requestId: JSON.parse(init.body).requestId }), { url: "https://itspurgepros.com/?pp_demo=timeout&pp_demo_save=rate_limited" });
  assert.equal(store.demo.submit, "success");
  assert.equal(store.demo.save, "success");
  assert.equal((await store.submit()).ok, true);
  assert.equal(calls.length, 1);
});

test("submit never rejects: every outcome is a result object with a status and a message", async () => {
  const outcomes = [];
  for (const outcome of core.DEMO_SUBMIT_OUTCOMES) outcomes.push(await readyStore({ options: { demo: { submit: outcome } } }).store.submit());
  outcomes.push(await makeStore().store.submit());
  outcomes.push(await liveStore(async () => { throw new Error("boom"); }).store.submit());
  outcomes.push(await liveStore(() => { throw new Error("thrown before any promise"); }).store.submit().catch((error) => ({ ok: false, status: "REJECTED: " + error.message, message: "" })));
  for (const result of outcomes) {
    assert.equal(typeof result.ok, "boolean");
    assert.equal(typeof result.status, "string");
    assert.equal(result.status.startsWith("REJECTED"), false, result.status);
    if (!result.ok) assert.ok(result.message.length > 10, result.status);
  }
});

test("live mode refuses file:// and http:// even if someone adds them to the allowed list", async () => {
  for (const [url, extraOrigins] of [
    ["file:///G:/review/home.html", ["null"]],
    ["http://localhost:8080/", ["http://localhost:8080"]],
    ["http://itspurgepros.com/", ["http://itspurgepros.com"]]
  ]) {
    const { store, calls } = liveStore(() => { throw new Error("must not be called"); }, { url, options: { allowedOrigins: core.LIVE_ALLOWED_ORIGINS.concat(extraOrigins) } });
    assert.match(store.sendingBlockedReason(), /refuses to run from/, url);
    assert.equal((await store.submit()).status, "blocked", url);
    assert.equal(calls.length, 0, url);
  }
  // An extra https origin (a staging host the Worker has been told about) can be allowed on purpose.
  const staging = liveStore(async (target, init) => reply(202, { accepted: true, requestId: JSON.parse(init.body).requestId }), { url: "https://staging.example/", options: { allowedOrigins: ["https://staging.example"] } });
  assert.equal(staging.store.sendingBlockedReason(), "");
  assert.equal((await staging.store.submit()).ok, true);
});
