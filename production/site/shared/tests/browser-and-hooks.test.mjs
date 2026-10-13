// The file as a classic <script> tag (window.PPQuoteCore, browser defaults),
// and the opening hooks other pages rely on (spec 2.3 and 17.1 item 18).
// No real browser is used: a small stand-in window and document are enough,
// because the engine only touches the few things listed here.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { core, makeStore, fakeStorage, fakeLocation, fillPlan, fillDetails } from "./helpers/make-store.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const engineSource = fs.readFileSync(path.resolve(here, "../pp-quote-core.js"), "utf8");

// A stand-in browser window, as much of it as the engine uses.
function fakeWindow(href, extras) {
  const location = fakeLocation(href);
  const replaced = [];
  const history = {
    state: null,
    replaceState(state, title, url) {
      replaced.push(url);
      const next = new URL(url, location.href);
      Object.assign(location, fakeLocation(next.href));
    }
  };
  const windowObject = Object.assign({ location, history, sessionStorage: fakeStorage() }, extras || {});
  return { window: windowObject, replaced };
}

// A stand-in document that records listeners so a test can fire events.
function fakeDocument() {
  const listeners = { click: [], submit: [] };
  return {
    listeners,
    addEventListener(type, handler) { (listeners[type] = listeners[type] || []).push(handler); },
    removeEventListener(type, handler) { listeners[type] = (listeners[type] || []).filter((entry) => entry !== handler); },
    fire(type, event) { (listeners[type] || []).slice().forEach((handler) => handler(event)); }
  };
}

// An element that matches one selector group, the way closest() would report it.
function element(matches, extra) {
  return Object.assign({ closest(selector) { return selector.split(",").map((part) => part.trim()).some((part) => matches.includes(part)) ? this : null; } }, extra || {});
}

function clickEvent(target) {
  return { target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
}

test("as a classic script tag the file defines window.PPQuoteCore and nothing else", () => {
  const logged = [];
  const { window } = fakeWindow("file:///G:/review/home.html?utm_source=meta&zip=46032", { localStorage: fakeStorage() });
  const sandbox = {
    window,
    document: { cookie: "theme=dark; _fbp=fb.1.1.2; _fbc=fb.1.3.CLICK" },
    console: { info: (...args) => logged.push(args), warn: (...args) => logged.push(args) },
    setTimeout, clearTimeout, URL, URLSearchParams, Date, Math, JSON, Promise, Object, Array, Number, String, RegExp, Error
  };
  vm.createContext(sandbox);
  vm.runInContext(engineSource, sandbox, { filename: "pp-quote-core.js" });
  const api = sandbox.window.PPQuoteCore;
  assert.equal(typeof api, "object");
  assert.equal(typeof api.create, "function");
  assert.equal(api.engineVersion, core.engineVersion);
  assert.deepEqual(Object.keys(sandbox.window).sort(), ["PPQuoteCore", "history", "localStorage", "location", "sessionStorage"], "no other global is added");

  // Browser defaults: sessionStorage, the page address, cookies, and demo logging to the console.
  const store = api.create();
  assert.equal(store.mode, "demo");
  assert.equal(store.getState().zip, "46032");
  assert.equal(store.getState().zipSource, "url");
  assert.deepEqual(JSON.parse(JSON.stringify(store.getState().attribution)), { utm_source: "meta" });
  assert.equal(JSON.parse(window.sessionStorage.items.pp_quote_attribution_v3).utm_source, "meta");
  // Arriving with a parameter also writes the 30-day copy, to the browser's
  // localStorage, under its one key: the parameters and the capture moment.
  assert.deepEqual(Object.keys(window.localStorage.items), ["pp_quote_attribution_kept_v1"]);
  const keptCopy = JSON.parse(window.localStorage.items.pp_quote_attribution_kept_v1);
  assert.deepEqual(Object.keys(keptCopy), ["capturedAt", "values"]);
  assert.deepEqual(keptCopy.values, { utm_source: "meta" });
  assert.equal(typeof keptCopy.capturedAt, "number");
  assert.deepEqual(JSON.parse(JSON.stringify(store.attributionSource())), { source: "session", capturedAt: 0, keepDays: 30 });
  assert.ok(logged.some((entry) => String(entry[0]).includes("DEMO mode")), "says clearly that it is in demo mode");
  store.set({ dogCount: "2", yardSize: "m", areas: ["back", "front"], frequency: "weekly" });
  assert.equal(store.quote().priceCents, 2899);
  assert.deepEqual(Object.keys(JSON.parse(window.sessionStorage.items.pp_quote_progress_v3)).sort(), ["areas", "customerStatus", "dogCount", "frequency", "lastCleaned", "yardSize", "zip"]);
  store.set({ intent: "question", preferredContact: "email" });
  store.set({ firstName: "Test", email: "test@example.com", lastCleaned: "Within 1 week", question: "Is this a test?" });
  const payload = store.buildPayload().payload;
  assert.equal(payload.fbp, "fb.1.1.2");
  assert.equal(payload.fbc, "fb.1.3.CLICK");
  // The ?zip= was a one-time instruction: it was taken out of the address as
  // soon as it was read (attribution stays), so the page sent with a request
  // no longer carries it.
  assert.equal(window.location.search, "?utm_source=meta");
  assert.equal(payload.page, "file:///G:/review/home.html?utm_source=meta");
  assert.match(payload.requestId, /^pp-\d+-[a-z0-9]+$/, "the live fallback id where crypto.randomUUID is missing");
});

test("the engine source never touches the DOM", () => {
  // Everything the file may reach in a browser, by name.
  const code = engineSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const forbidden of ["querySelector", "getElementById", "innerHTML", "createElement", "appendChild", "classList", "navigator.", "alert(", "XMLHttpRequest", "sendBeacon", "eval(", "new Function"]) {
    assert.equal(code.includes(forbidden), false, "found " + forbidden);
  }
  // The browser's longer-lived storage is looked up in ONE place (the
  // environment), and written and removed under ONE key: the 30-day copy of
  // the attribution parameters (T23, attribution-kept.test.mjs).
  assert.deepEqual(code.match(/localStorage/g), ["localStorage", "localStorage"], "win.localStorage is read once, guarded, in browserEnvironment");
  assert.ok(code.includes("try { keptStorage = win && win.localStorage ? win.localStorage : null; } catch (_) { keptStorage = null; }"));
  const keptCalls = code.match(/env\.persistentStorage\.(getItem|setItem|removeItem)\(([^,)]+)/g) || [];
  assert.equal(keptCalls.length, 3, "one read, one write, one removal");
  assert.ok(keptCalls.every((call) => call.endsWith("(STORAGE_KEYS.attributionKept")), keptCalls.join(" | "));
  assert.equal((code.match(/persistentStorage\.setItem\(/g) || []).length, 1);
  assert.equal((code.match(/document\b/g) || []).length <= 6, true, "document is used only for reading a cookie and for the page hooks");
  assert.equal(/document\.cookie\s*=/.test(code), false, "no cookie is ever written");
  // The only network call is the injected fetch, in one place.
  assert.equal((code.match(/env\.fetch\(/g) || []).length, 1);
  assert.equal(/[^.\w]fetch\(/.test(code.replace(/win\.fetch\(/g, "")), false, "no bare fetch call");
  // Nothing hard-codes a live endpoint.
  assert.equal(/purge-lead-relay/.test(code), false);
  assert.equal(/workers\.dev\/submit/.test(code), false);
});

test("installPageHooks defines window.PurgeProsQuote.open({ zip }) and .close()", () => {
  const { store } = makeStore();
  const { window } = fakeWindow("https://review.example/home");
  const document = fakeDocument();
  const opened = [];
  let closed = 0;
  const hooks = core.installPageHooks(store, { open: (result) => opened.push(result), close: () => { closed += 1; } }, { window, document });
  assert.equal(hooks.apiInstalled, true);
  assert.equal(hooks.autoOpened, false);
  assert.equal(typeof window.PurgeProsQuote.open, "function");
  assert.equal(typeof window.PurgeProsQuote.close, "function");

  // In area: accepted, the ZIP question is skipped.
  window.PurgeProsQuote.open({ zip: "46032" });
  assert.equal(store.getState().zip, "46032");
  assert.equal(store.getState().zipSource, "open");
  assert.equal(store.flow().zipSkipped, true);
  assert.deepEqual(opened[0], { ok: true, zipStatus: "in_area", step: "dogs", reason: "", trigger: null });

  // Out of area: the ZIP step with the out-of-area answer.
  window.PurgeProsQuote.open({ zip: " 46201 " });
  assert.equal(store.getState().step, "zip");
  assert.equal(opened[1].zipStatus, "out_of_area");
  // No ZIP, or not a ZIP: nothing changes, the builder is still brought forward.
  window.PurgeProsQuote.open();
  window.PurgeProsQuote.open({ zip: "abc" });
  assert.equal(opened.length, 4);
  assert.equal(store.getState().zip, "46201");

  window.PurgeProsQuote.close();
  assert.equal(closed, 1);
  hooks.uninstall();
  assert.equal(window.PurgeProsQuote, undefined);
  assert.equal(document.listeners.click.length, 0);
  assert.equal(document.listeners.submit.length, 0);
});

test("an existing window.PurgeProsQuote (the live widget) is left alone", () => {
  const { store } = makeStore();
  const existing = { open() {}, close() {} };
  const { window } = fakeWindow("https://review.example/home", { PurgeProsQuote: existing });
  const hooks = core.installPageHooks(store, {}, { window, document: fakeDocument() });
  assert.equal(hooks.apiInstalled, false);
  assert.equal(window.PurgeProsQuote, existing);
  hooks.uninstall();
  assert.equal(window.PurgeProsQuote, existing);
});

test("clicks on [data-purge-quote], a[href=\"#quote\"] and a[href=\"#get-quote\"] open the builder in place", () => {
  const { store } = makeStore();
  const { window } = fakeWindow("https://review.example/home");
  const document = fakeDocument();
  const opened = [];
  core.installPageHooks(store, { open: (result) => opened.push(result) }, { window, document });

  for (const selector of ["[data-purge-quote]", 'a[href="#quote"]', 'a[href="#get-quote"]']) {
    const launcher = element([selector]);
    const event = clickEvent(launcher);
    document.fire("click", event);
    assert.equal(event.defaultPrevented, true, selector + " does not navigate away");
    assert.equal(opened[opened.length - 1].trigger, launcher, "the handler is told what was pressed, to return focus to it");
  }
  assert.equal(opened.length, 3);
  // A click elsewhere is ignored.
  const other = clickEvent(element(["button.other"]));
  document.fire("click", other);
  assert.equal(other.defaultPrevented, false);
  // A click another script already handled is respected (one action, one open).
  const handled = clickEvent(element(["[data-purge-quote]"]));
  handled.defaultPrevented = true;
  document.fire("click", handled);
  assert.equal(opened.length, 3);
  // A target without closest() (a text node) does not throw.
  document.fire("click", clickEvent({}));
  assert.equal(opened.length, 3);
});

test("a hero ZIP form hands its ZIP to the builder instead of leaving the page", () => {
  const { store } = makeStore();
  const { window } = fakeWindow("https://review.example/home");
  const document = fakeDocument();
  const opened = [];
  core.installPageHooks(store, { open: (result) => opened.push(result) }, { window, document });

  const form = element(["[data-pp-zip-form]"], { checkValidity: () => true, elements: { zip: { value: " 46074 " } } });
  const event = clickEvent(form);
  document.fire("submit", event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(store.getState().zip, "46074");
  assert.equal(store.getState().city, "Westfield");
  assert.equal(opened[0].zipStatus, "in_area");
  assert.equal(opened[0].trigger, form);

  // A form the browser considers invalid is left to the browser.
  const invalid = element(["[data-pp-zip-form]"], { checkValidity: () => false, elements: { zip: { value: "12" } } });
  const invalidEvent = clickEvent(invalid);
  document.fire("submit", invalidEvent);
  assert.equal(invalidEvent.defaultPrevented, false);
  assert.equal(opened.length, 1);
  // Other forms are not touched.
  const otherForm = clickEvent(element(["form.newsletter"]));
  document.fire("submit", otherForm);
  assert.equal(otherForm.defaultPrevented, false);
});

test("?open_quote=1 (also true, yes) and #quote / #get-quote open on page load, once", () => {
  for (const address of [
    "https://review.example/home?open_quote=1&utm_source=meta",
    "https://review.example/home?utm_source=meta&open_quote=TRUE",
    "https://review.example/home?open_quote=yes&utm_source=meta",
    "https://review.example/home?utm_source=meta#quote",
    "https://review.example/home?utm_source=meta#get-quote"
  ]) {
    const { window, replaced } = fakeWindow(address);
    const { store } = makeStore({ options: { location: window.location, history: window.history } });
    const opened = [];
    const hooks = core.installPageHooks(store, { open: (result) => opened.push(result) }, { window, document: fakeDocument() });
    assert.equal(hooks.autoOpened, true, address);
    assert.equal(opened.length, 1, address);
    // The open instruction is removed so a refresh does not reopen; attribution stays.
    assert.deepEqual(replaced, ["/home?utm_source=meta"], address);
    assert.equal(store.getState().attribution.utm_source, "meta");
  }
  for (const address of ["https://review.example/home", "https://review.example/home?open_quote=0", "https://review.example/home?open_quote=no#faq", "https://review.example/home#resume=" + "A".repeat(43)]) {
    const { window, replaced } = fakeWindow(address);
    const { store } = makeStore({ options: { location: window.location, history: window.history } });
    const opened = [];
    const hooks = core.installPageHooks(store, { open: (result) => opened.push(result) }, { window, document: fakeDocument() });
    assert.equal(hooks.autoOpened, false, address);
    assert.equal(opened.length, 0);
    assert.deepEqual(replaced, []);
  }
});

test("?open_quote=1&zip=46032 applies the ZIP once and counts it once", () => {
  const { window, replaced } = fakeWindow("https://review.example/quote?open_quote=1&zip=46032&gclid=G1");
  const { store } = makeStore({ options: { location: window.location, history: window.history } });
  const opened = [];
  core.installPageHooks(store, { open: (result) => opened.push(result) }, { window, document: fakeDocument() });
  assert.equal(store.getState().zip, "46032");
  assert.equal(store.flow().zipSkipped, true);
  assert.equal(opened[0].zipStatus, "in_area");
  // Both one-time instructions leave the address: the ZIP when the store read
  // it, the open instruction when the hooks acted on it. Attribution stays.
  assert.deepEqual(replaced, ["/quote?open_quote=1&gclid=G1", "/quote?gclid=G1"]);
  assert.equal(store.trackLog.filter((entry) => entry.event === "service_area_eligible").length, 1);
  assert.equal(store.trackLog.filter((entry) => entry.event === "funnel_viewed").length, 1);
  // A hero form sending the same ZIP again later does not count it again.
  window.PurgeProsQuote.open({ zip: "46032" });
  assert.equal(store.trackLog.filter((entry) => entry.event === "service_area_eligible").length, 1);
});

test("open and close are ignored while a request is being sent", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { store } = makeStore({ options: { wait: () => gate } });
  const { window } = fakeWindow("https://review.example/home");
  const document = fakeDocument();
  const opened = [];
  const busy = [];
  let closed = 0;
  const hooks = core.installPageHooks(store, { open: (result) => opened.push(result), close: () => { closed += 1; }, busy: (result) => busy.push(result) }, { window, document });
  fillPlan(store);
  fillDetails(store, "service_request", "text");
  const sending = store.submit();
  const during = JSON.stringify(store.getState());
  assert.equal(hooks.close(), false);
  window.PurgeProsQuote.close();
  assert.equal(closed, 0, "closing is refused while sending: the close handler never runs");
  window.PurgeProsQuote.open({ zip: "46033" });
  document.fire("click", clickEvent(element(["[data-purge-quote]"])));
  document.fire("submit", clickEvent(element(["[data-pp-zip-form]"], { checkValidity: () => true, elements: { zip: { value: "46074" } } })));
  assert.equal(opened.length, 0, "the open handler never runs while sending (spec 2.3: ignored)");
  assert.equal(JSON.stringify(store.getState()), during, "nothing about the request in flight changed");
  assert.equal(store.getState().zip, "46032", "the ZIP is not changed under a request in flight");
  // The optional busy handler is told each time, so the page can move focus to its Sending status.
  assert.equal(busy.length, 5);
  assert.ok(busy.every((result) => result.ok === false && result.reason === core.SUBMIT_MESSAGES.sending));
  release();
  const sent = await sending;
  assert.equal(sent.ok, true, "the pending request was not lost");
  assert.equal(hooks.close(), true);
  assert.equal(closed, 1);
});

test("shared() returns one store for the whole page", () => {
  // Evaluated on its own so the shared store of this test does not leak into others.
  const sandbox = { module: { exports: {} }, URL, URLSearchParams, Date, Math, JSON, Promise, Object, Array, Number, String, RegExp, Error, setTimeout, clearTimeout };
  vm.createContext(sandbox);
  vm.runInContext(engineSource, sandbox);
  const api = sandbox.module.exports;
  const first = api.shared({ pageZip: "46074", console: null });
  const second = api.shared({ pageZip: "46032", console: null });
  assert.equal(first, second);
  assert.equal(first.getState().zip, "46074", "the first call's options are the ones used");
  first.set({ dogCount: "3" });
  assert.equal(second.getState().dogCount, "3");
  assert.notEqual(api.create({ console: null }), first, "create() always makes a separate store");
});
