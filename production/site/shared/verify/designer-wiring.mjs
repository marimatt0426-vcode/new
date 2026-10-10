// VERIFIER FILE. Written from CORE-API.md ALONE, before the engine source was opened.
// It is the wiring an interface designer would write, with a view-model in place of a DOM,
// then driven like a visitor. Every place the guide did not say enough is marked GUESS.
// Offline: demo mode, and global fetch is replaced with a function that throws.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
globalThis.fetch = () => { throw new Error("NETWORK ATTEMPT (verifier forbids it)"); };
const C = require("../pp-quote-core.js");

const mem = new Map();
const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const quiet = { log() {}, info() {}, warn() {}, error() {} };
const store = C.create({ storage, console: quiet, demo: { delayMs: 0 } });

// ---- the ~60 lines a designer writes ---------------------------------------------------------
let notices = [], problems = [];
const st = () => store.getState();
const change = (patch) => { problems = []; return store.set(patch); };
const tile = (label, pressed, press, disabled, reason) => ({ kind: "tile", label, pressed: !!pressed, press, disabled: !!disabled, reason: reason || "" });
const input = (key, extra) => Object.assign({ kind: "input", key, value: st()[key], type: (v) => change({ [key]: v }) }, extra || {});
const screens = {
  dogs: () => C.DOG_OPTIONS.map((o) => tile(o.label, st().dogCount === o.id, () => change({ dogCount: o.id }))),
  zip: () => { const z = store.checkZip(); return [input("zip"), { kind: "text", label: z.inArea ? "We serve " + z.community : z.message }]; },
  yard: () => C.YARD_SIZES.map((o) => tile(o.label, st().yardSize === o.id, () => change({ yardSize: o.id }))),
  areas: () => C.AREAS.map((a) => tile(a.label, st().areas.includes(a.id), () => store.toggleArea(a.id))),
  frequency: () => store.frequencyOptions().map((o) => tile(o.label + " " + (o.priceText || ""), o.selected, () => change({ frequency: o.id }), !o.available, o.reason)),
  price: () => [{ kind: "text", label: store.quote().priceText }, ...store.quote().lineItems.map((i) => ({ kind: "text", label: i.label + " " + i.amount })),
    { kind: "note", label: store.offerNote().kind /* GUESS: the guide never names the key that holds one_time/custom_review/restart/new_recurring */ },
    ...store.intentOptions().map((i) => tile(i.label, i.selected, () => change({ intent: i.id }), !i.available, i.reason))],
  request: () => store.fieldRules().filter((r) => r.shown && r.key !== "termsAccepted").map((r) => {
    if (r.control === "checkbox") return { kind: "check", key: r.key, label: r.lead + " " + r.body, checked: st()[r.key], required: r.required, toggle: (v) => change({ [r.key]: v }) };
    if (r.options) return { kind: "group", key: r.key, label: r.label, required: r.required,
      options: r.options.map((o) => tile(o.label || o, st()[r.key] === (o.id || o), () => change({ [r.key]: o.id || o }))) };  // GUESS: option shape is {id,label} or a bare string
    return input(r.key, { label: r.label, required: r.required, hint: r.hint, maxLength: r.maxLength });
  }),
  confirm: () => [...store.planSummary().map((row) => ({ kind: "row", label: row.label, value: row.value, edit: () => store.edit(row.step) })),
    { kind: "text", label: store.requestSummary().name + " / " + store.requestSummary().replyBy },
    st().intent === "service_request"
      ? { kind: "check", key: "termsAccepted", label: C.wording.termsParts(store.quote().oneTime !== null).map((p) => p.text).join(""), checked: st().termsAccepted, toggle: (v) => change({ termsAccepted: v }) }
      : { kind: "text", label: C.wording.otherIntentsParts().map((p) => p.text).join("") }],
  done: () => [{ kind: "text", label: "Reference " + st().receipt.requestId + " / " + st().receipt.replyWhere }]
};
function view() {
  const s = st(), flow = store.flow(), bar = store.priceBar();
  return { step: s.step, notices, problems, controls: screens[s.step](), back: flow.back,
    // GUESS: "is Next enabled". The guide's flow() sample shows canContinue:true AND disablePrimary:true together.
    primary: flow.primaryAction, primaryEnabled: !(flow.disablePrimary && !flow.canContinue), blockedReason: flow.blockedReason,
    bar: bar.visible ? { text: bar.headline, detail: bar.detail, to: bar.continueStep, enabled: bar.continueEnabled } : null, locked: s.locked };
}
store.subscribe((state, info) => { notices = info.notices || []; });
const pressNext = () => { const r = store.next(); problems = r.ok ? [] : r.errors; return r; };
// ---- end of the designer's wiring ------------------------------------------------------------

// ---- the visitor ----------------------------------------------------------------------------
const log = [];
const note = (what) => log.push(what);
const press = (label) => {
  const c = view().controls.find((x) => (x.kind === "tile" && x.label.startsWith(label)));
  if (!c) throw new Error("no tile '" + label + "' on step " + st().step + ": " + JSON.stringify(view().controls.map((x) => x.label)));
  if (c.disabled) throw new Error("tile '" + label + "' is disabled: " + c.reason);
  return c.press();
};
const expectStep = (id) => { if (st().step !== id) throw new Error("expected step " + id + " but on " + st().step); };

expectStep("dogs");
note("bar before first answer: " + JSON.stringify(view().bar));
note("dogs: Next enabled before answering? " + view().primaryEnabled + " (flow: " + JSON.stringify({ c: store.flow().canContinue, d: store.flow().disablePrimary, why: store.flow().blockedReason }) + ")");
press("2 dogs"); note("after dogs, bar: " + JSON.stringify(view().bar));
pressNext(); expectStep("zip");
view().controls[0].type("4603"); note("zip incomplete: " + JSON.stringify(store.checkZip()) + " nextEnabled=" + view().primaryEnabled);
view().controls[0].type("46032"); note("zip ok text: " + view().controls[1].label);
pressNext(); expectStep("yard"); press("Up to ¼ acre");
pressNext(); expectStep("areas"); note("areas: Next enabled with none? " + view().primaryEnabled);
press("Back yard"); press("Front yard");
pressNext(); expectStep("frequency");
note("frequency tiles: " + JSON.stringify(view().controls.map((c) => [c.label, c.disabled, c.reason])));
press("Weekly");
pressNext(); expectStep("price");
note("price screen: " + JSON.stringify(view().controls.map((c) => c.label)));
note("offerNote(): " + JSON.stringify(store.offerNote()));
press("Request"); // GUESS: the service-request intent label begins "Request"
pressNext(); expectStep("request");
const fields = () => Object.fromEntries(view().controls.map((c) => [c.key, c]));
note("request fields: " + JSON.stringify(view().controls.map((c) => [c.key, c.kind, c.required, c.label])));
let blocked = pressNext(); note("empty request Next -> " + JSON.stringify({ ok: blocked.ok, n: (blocked.errors || []).length, first: (blocked.errors || [])[0] }));
fields().customerStatus.options[0].press();
fields().firstName.type("Test"); fields().lastName.type("Reviewer"); fields().phone.type("3175550100");
note("phone shown after typing: " + st().phone);
fields().smsConsent.toggle(true);
fields().address.type("123 Example St");
note("city prefilled: " + st().city + " auto=" + st().cityAutoFilled);
fields().startTiming.options[0].press(); fields().lastCleaned.options[2].press();
pressNext(); expectStep("confirm");
note("confirm: " + JSON.stringify(view().controls.map((c) => [c.kind, c.label, c.value])));
note("confirm primary=" + view().primary + " enabled=" + view().primaryEnabled + " back=" + view().back);
let sent = await store.submit(); note("submit without terms -> " + JSON.stringify({ ok: sent.ok, status: sent.status, fe: sent.fieldErrors }));
view().controls.find((c) => c.key === "termsAccepted").toggle(true);
sent = await store.submit(); note("submit -> " + JSON.stringify({ ok: sent.ok, status: sent.status, ref: sent.reference, http: sent.httpStatus, demo: sent.demo }));
expectStep("done"); note("done: " + JSON.stringify(view().controls) + " bar=" + JSON.stringify(view().bar) + " back='" + view().back + "'");
note("storage at end: " + JSON.stringify([...mem]));

// shapes the guide names but never describes: what would a designer have to discover by console.log?
for (const name of ["OUT_OF_AREA_COPY", "PROMISES", "CONSENT", "TERMS", "MESSAGES", "SUBMIT_MESSAGES", "SAVE_LINK_MESSAGES", "RESUME_MESSAGES", "BRAND"])
  note(name + " keys: " + JSON.stringify(Object.keys(C[name] || {})));
console.log(log.join("\n"));
