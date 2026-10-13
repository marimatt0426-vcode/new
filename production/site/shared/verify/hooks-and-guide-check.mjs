// VERIFIER FILE. Compatibility hooks (spec 17.1 item 18) and guide claims, checked by running.
//   node "production/site/shared/verify/hooks-and-guide-check.mjs"
// Offline: demo mode only; global fetch throws.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

globalThis.fetch = () => { throw new Error("NETWORK ATTEMPT (the verifier forbids it)"); };
const here = path.dirname(fileURLToPath(import.meta.url));
const C = createRequire(import.meta.url)(path.join(here, "..", "pp-quote-core.js"));
const GUIDE = readFileSync(path.join(here, "..", "CORE-API.md"), "utf8");

const lines = [];
const say = (ok, what, detail) => lines.push((ok ? "ok    " : "NOTE  ") + what + (detail ? "\n        " + detail : ""));

function fakeLocation(href) { const u = new URL(href); return { href: u.href, search: u.search, hash: u.hash, pathname: u.pathname, protocol: u.protocol, origin: u.origin, hostname: u.hostname }; }
function memory() { const items = {}; return { items, getItem: (k) => (k in items ? items[k] : null), setItem: (k, v) => { items[k] = String(v); }, removeItem: (k) => { delete items[k]; } }; }
function page(href, extra) {
  const replaced = [];
  const win = { location: fakeLocation(href), history: { state: null, replaceState: (s, t, url) => { replaced.push(url); win.location = fakeLocation(new URL(url, href).href); } } };
  const listeners = {};
  const doc = { addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener: (type) => { delete listeners[type]; } };
  const store = C.create(Object.assign({ storage: memory(), location: win.location, history: win.history, console: null, wait: () => Promise.resolve() }, extra || {}));
  const opened = [], closed = [];
  const hooks = C.installPageHooks(store, { open: (r) => opened.push(r), close: () => closed.push(1) }, { window: win, document: doc });
  const click = (matches, prevented) => { const el = { closest: (sel) => (matches ? el : null) }; const ev = { target: el, defaultPrevented: !!prevented, preventDefault() { ev.defaultPrevented = true; } }; listeners.click(ev); return ev; };
  const submit = (zip, valid) => { const form = { closest: () => form, checkValidity: () => valid !== false, elements: { zip: { value: zip } } }; const ev = { target: form, defaultPrevented: false, preventDefault() { ev.defaultPrevented = true; } }; listeners.submit(ev); return ev; };
  return { win, doc, store, hooks, opened, closed, replaced, click, submit, listeners };
}

/* ---- 17.1 item 18, hook by hook ---- */
{
  const p = page("https://pages.offline.invalid/");
  say(typeof p.win.PurgeProsQuote.open === "function" && typeof p.win.PurgeProsQuote.close === "function" && p.hooks.apiInstalled, "window.PurgeProsQuote.open / .close are defined");
  p.win.PurgeProsQuote.open({ zip: "46032" });
  say(p.store.getState().zip === "46032" && p.store.flow().zipSkipped && p.opened.length === 1, "PurgeProsQuote.open({ zip: in area }) accepts the ZIP and skips the ZIP question");
  p.win.PurgeProsQuote.open({ zip: "46201" });
  say(p.store.getState().step === "zip" && p.store.checkZip().status === "out_of_area", "PurgeProsQuote.open({ zip: out of area }) shows the out-of-area answer");
  p.win.PurgeProsQuote.open({ zip: "4603" }); p.win.PurgeProsQuote.open(); p.win.PurgeProsQuote.open({});
  say(p.store.getState().zip === "46201" && p.opened.length === 5, "open() with no ZIP or a malformed ZIP changes nothing and still calls the open handler");
  p.win.PurgeProsQuote.close();
  say(p.closed.length === 1, ".close() calls the close handler");
  const ev = p.click(true);
  say(ev.defaultPrevented && p.opened.length === 6 && p.opened[5].trigger, "a click on [data-purge-quote] / a[href='#quote'] / a[href='#get-quote'] opens in place and prevents navigation");
  const handled = p.click(true, true);
  say(p.opened.length === 6, "a click another handler already prevented (pp-next.js) is left alone");
  p.click(false);
  say(p.opened.length === 6, "a click elsewhere does nothing");
  const sub = p.submit("46074");
  say(sub.defaultPrevented && p.store.getState().zip === "46074" && p.opened.length === 7, "a [data-pp-zip-form] submit hands its ZIP to the builder instead of leaving the page");
  const bad = p.submit("46074", false);
  say(!bad.defaultPrevented, "an invalid hero form is left to the browser");
  // The exact selector string, compared with the live widget's.
  const widget = readFileSync((await import("./pinned-live-source.mjs")).WIDGET_PATH, "utf8");
  const engine = readFileSync(path.join(here, "..", "pp-quote-core.js"), "utf8");
  const sel = `'[data-purge-quote], a[href="#quote"], a[href="#get-quote"]'`;
  say(widget.includes("closest(" + sel + ")") && engine.includes(sel), "the launcher selector is the live widget's, character for character");
}
for (const [label, href, expectOpen, expectUrl] of [
  ["?open_quote=1 with attribution and ?zip=", "https://pages.offline.invalid/carmel?utm_source=meta&open_quote=1&zip=46032&gclid=G-1", true, "/carmel?utm_source=meta&zip=46032&gclid=G-1"],
  ["?open_quote=TRUE", "https://pages.offline.invalid/?open_quote=TRUE", true, "/"],
  ["?open_quote=yes", "https://pages.offline.invalid/?open_quote=yes", true, "/"],
  ["#quote", "https://pages.offline.invalid/x?utm_source=meta#quote", true, "/x?utm_source=meta"],
  ["#get-quote", "https://pages.offline.invalid/#get-quote", true, "/"],
  ["?open_quote=0", "https://pages.offline.invalid/?open_quote=0", false, null],
  ["nothing", "https://pages.offline.invalid/?utm_source=meta", false, null]
]) {
  const p = page(href);
  const ok = p.hooks.autoOpened === expectOpen && p.opened.length === (expectOpen ? 1 : 0) && (expectUrl === null ? p.replaced.length === 0 : p.replaced[0] === expectUrl);
  say(ok, "page load with " + label + (expectOpen ? " opens once and the instruction is removed" : " does not open"), ok ? "" : "autoOpened=" + p.hooks.autoOpened + " replaced=" + JSON.stringify(p.replaced));
  if (label.startsWith("?open_quote=1 with")) {
    const events = p.store.trackLog.map((e) => e.event);
    say(p.store.getState().zip === "46032" && events.filter((e) => e === "funnel_viewed").length === 1 && events.filter((e) => e === "service_area_eligible").length === 1, "?zip= beside it is applied once (one funnel_viewed, one service_area_eligible)", events.join(", "));
    say(p.store.getState().attribution.utm_source === "meta" && p.store.getState().attribution.gclid === "G-1", "attribution parameters are kept");
    say(!p.replaced[0].includes("zip=") , "?zip= is removed from the address after it is applied", "address after the open instruction is consumed: " + p.replaced[0] + "  (a refresh applies it again: see session-check P1)");
  }
}
{
  // If the live widget defined the global first, the engine leaves it alone. What then handles a click?
  const win = { PurgeProsQuote: { open() {}, close() {}, config: { promotion: {} } }, location: fakeLocation("https://pages.offline.invalid/"), history: { state: null, replaceState() {} } };
  const listeners = {};
  const store = C.create({ storage: memory(), location: win.location, console: null });
  const opened = [];
  const hooks = C.installPageHooks(store, { open: (r) => opened.push(r) }, { window: win, document: { addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener() {} } });
  const el = { closest: () => el }; const ev = { target: el, defaultPrevented: false, preventDefault() { ev.defaultPrevented = true; } };
  listeners.click(ev);
  say(hooks.apiInstalled === false, "live widget global already present: hooks.apiInstalled is false, as the guide says");
  say(false, "live widget global already present: the engine STILL listens for launcher clicks (opened=" + opened.length + "), while window.PurgeProsQuote.open stays the old widget's",
    "so a [data-purge-quote] click is taken by whichever script registered first, and pp-next.js / hero ZIP forms (which call PurgeProsQuote.open) open the OLD dialog. The guide gives the designer no instruction for this case.");
}

/* ---- guide claims about what subscribers are told ---- */
{
  const store = C.create({ storage: memory(), location: fakeLocation("file:///G:/review/home.html"), console: null, wait: () => Promise.resolve(), demo: { delayMs: 0 } });
  const seen = [];
  store.subscribe((state, info) => seen.push({ reason: info.reason, changed: info.changed, notice: state.resumeNotice }));
  store.set({ dogCount: "2" });
  store.reset();
  const reset = seen[seen.length - 1];
  say(!(reset.changed.length === 1 && reset.changed[0] === "*") || GUIDE.includes('"*"') || GUIDE.includes("`*`"), "reset(): info.changed is documented", "reset() notifies info.changed = " + JSON.stringify(reset.changed) + "; the guide (section 6.1, subscribe) says to 'use info.changed to update only what changed' and never mentions \"*\". A subscriber that tests info.changed.includes(\"dogCount\") keeps the old tile selected after 'Start a new quote'.");
  await store.resume("A".repeat(43));
  const withNotice = store.getState().resumeNotice;
  store.back();
  const moved = seen[seen.length - 1];
  say(moved.changed.includes("resumeNotice") || withNotice === "", "moving on after a saved plan: info.changed names resumeNotice", "resumeNotice went from '" + withNotice.slice(0, 28) + "...' to '" + store.getState().resumeNotice + "' but info.changed = " + JSON.stringify(moved.changed) + " (guide 9.20: 'Dismiss the saved-plan notice when state.resumeNotice becomes empty')");
}
{
  // A design that shows request and confirm on one screen (guide 6.2, reportStepShown).
  const store = C.create({ storage: memory(), location: fakeLocation("file:///G:/review/home.html"), console: null });
  store.set({ dogCount: "2", zip: "46032", yardSize: "m", areas: ["back"], frequency: "weekly" });
  store.goTo("price"); store.next();
  for (let render = 0; render < 3; render += 1) { store.reportStepShown("request"); store.reportStepShown("confirm"); }
  const steps = store.trackLog.filter((e) => e.event === "funnel_step_viewed").map((e) => e.params.step);
  say(steps.filter((s) => s === 5).length <= 1, "reportStepShown() called on each render of a merged request+confirm screen reports each step once", "funnel_step_viewed steps sent to Google: " + steps.join(", ") + " (pixel milestones stay at one each)");
}
{
  // Return shapes the guide states.
  const store = C.create({ storage: memory(), location: fakeLocation("file:///G:/review/home.html"), console: null });
  const keys = (o) => Object.keys(o).sort().join(",");
  say(keys(store.set({ dogCount: "2" })) === "changed,movedTo,notices,ok,rejected,state", "set() returns { ok, changed, notices, rejected, movedTo, state }");
  say(keys(store.next()) === "errors,ok,reason,step", "next() returns { ok, step, reason, errors }");
  say(keys(store.back()) === "ok,reason,step", "back() returns { ok, step, reason }");
  const went = store.goTo("zip"), refused = store.goTo("price");
  say(keys(went) === "needs,ok,reason,step" && keys(refused) === "needs,ok,reason,step", "goTo() returns { ok, step, reason, needs }", "success: {" + keys(went) + "}  refusal: {" + keys(refused) + "}");
  const edited = store.edit("dogs"), editRefused = store.edit("price");
  say(keys(edited) === "ok,reason,returnTo,step" && keys(editRefused) === "ok,reason,returnTo,step", "edit() returns { ok, step, reason, returnTo }", "success: {" + keys(edited) + "}  refusal: {" + keys(editRefused) + "}");
  const flowKeys = "back,blockedErrors,blockedReason,canContinue,current,disablePrimary,editReturn,firstIncomplete,next,order,primaryAction,resumeAt,steps,zipSkipped";
  say(keys(store.flow()) === flowKeys, "flow() has the documented keys");
  say(keys(store.priceBar()) === "continueEnabled,continueStep,detail,headline,kind,priceCents,priceLabel,unit,visible", "priceBar() has the documented keys");
  say(keys(store.open({ zip: "46032" })) === "ok,reason,step,zipStatus", "open() returns { ok, zipStatus, step, reason }");
}
{
  // Names of constants a designer must render but whose keys the guide never lists.
  const undocumented = [];
  for (const [name, keys] of [["OUT_OF_AREA_COPY", Object.keys(C.OUT_OF_AREA_COPY)], ["PROMISES", Object.keys(C.PROMISES)], ["SAVE_LINK_MESSAGES", Object.keys(C.SAVE_LINK_MESSAGES)], ["BRAND", Object.keys(C.BRAND)], ["RESUME_MESSAGES", Object.keys(C.RESUME_MESSAGES)]]) {
    const missing = keys.filter((key) => !new RegExp("\\b" + key + "\\b").test(GUIDE));
    if (missing.length) undocumented.push(name + ": " + missing.join(", "));
  }
  say(undocumented.length === 0, "every key of the wording constants a page must render is named in the guide", undocumented.join(" | "));
  const obligations = [["keyboard", /keyboard/i], ["pop-up focus trap and return (spec 17.2 item 14)", /trap|returns? focus/i], ["once per household / team checks history (17.2 item 8)", /household/i], ["one-time base charged when the on-the-way text goes out (17.2 item 8)", /on-the-way|on the way/i]];
  const absent = obligations.filter(([, pattern]) => !pattern.test(GUIDE.split("## 9. What the interface must do")[1].split("## 10.")[0])).map(([label]) => label);
  say(absent.length === 0, "guide section 9 states every UI obligation of spec 17.2", "not stated in section 9: " + absent.join("; "));
}
{
  // Guide section 13: live mode "refuses to run" on a page that may not send. What about its tracking?
  const tagCalls = [];
  const store = C.create({ mode: "live", endpoint: "https://relay.offline.invalid/submit", storage: memory(), console: null,
    location: fakeLocation("https://staging.offline.invalid/"), fetch: () => { throw new Error("must not be called"); },
    sinks: { gtag: (...args) => tagCalls.push(args[1]), fbq: (...args) => tagCalls.push(args[1]) } });
  store.set({ dogCount: "2" }); store.set({ zip: "46032" }); store.set({ yardSize: "m" }); store.toggleArea("back"); store.set({ frequency: "weekly" }); store.goTo("price");
  say(store.sendingBlockedReason() !== "" && tagCalls.length === 0, "live mode on an origin that may not send keeps quiet towards the tags too",
    "sendingBlockedReason(): '" + store.sendingBlockedReason() + "' yet the page's tags received: " + tagCalls.join(", "));
}
{
  // The example page's confirm step, against guide section 9 item 6 (plan, price and contact details all visible before submit).
  const example = readFileSync(path.join(here, "..", "examples", "minimal-wiring.html"), "utf8");
  const start = example.indexOf("confirm: (s) =>"), end = example.indexOf("done: (s) =>");
  const confirm = start >= 0 && end > start ? example.slice(start, end) : "";
  const uses = (name) => confirm.includes(name);
  say(uses("planSummary") && uses("serviceAddress") && uses("phone"), "the example's confirm step shows the plan and the contact details (guide 9.6, spec 17.2 item 7 and 18.2)",
    "found the confirm step: " + (confirm.length > 0) + ". It renders the price, requestSummary().name, requestSummary().replyBy, the promise and the terms box. planSummary(): " + uses("planSummary") + ", address: " + uses("serviceAddress") + ", phone: " + uses("phone"));
}
console.log(lines.join("\n"));
