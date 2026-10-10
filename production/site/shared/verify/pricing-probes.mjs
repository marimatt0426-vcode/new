// Targeted scenario probes for the pricing / eligibility / reconciliation lens.
// These print what the engine actually does in a few specific situations so a
// reviewer can read the evidence. Offline, demo mode only.
//
// Run:  node shared/verify/pricing-probes.mjs
import fs from "node:fs";
import path from "node:path";
import { loadWorker, loadEngine, makeStore, memoryStorage, RELEASE_DIR, networkAttempts } from "./pricing-lib.mjs";

const W = loadWorker();
const PP = loadEngine();
const show = (label, value) => console.log("   " + label + ": " + JSON.stringify(value));
const plan = (s) => { const st = s.getState(); return { step: st.step, zip: st.zip, zipSource: st.zipSource, dogs: st.dogCount, yard: st.yardSize, areas: st.areas, frequency: st.frequency, editReturn: st.editReturn }; };
const walkToPrice = (s) => { for (let i = 0; i < 9 && s.getState().step !== "price"; i += 1) if (!s.next().ok) break; return s.getState().step; };

console.log("\nP1. A ZIP the visitor replaced with an out-of-area one, then a new page in the same tab");
{
  const storage = memoryStorage();
  const a = makeStore(PP, { storage }).store;
  a.set({ dogCount: "2" }); a.set({ zip: "46032" }); a.set({ yardSize: "m" }); a.toggleArea("back"); a.set({ frequency: "weekly" });
  show("page 1 after building a plan", plan(a));
  show("storage", JSON.parse(storage.getItem(PP.STORAGE_KEYS.progress)));
  const opened = a.open({ zip: "46201" }); // hero ZIP form, PurgeProsQuote.open({ zip }), or the same via ?zip=
  show("open({ zip: '46201' }) ->", opened);
  show("page 1 now", plan(a));
  show("storage after the out-of-area answer", JSON.parse(storage.getItem(PP.STORAGE_KEYS.progress)));
  const b = makeStore(PP, { storage }).store;
  show("page 2 (new store, same sessionStorage)", plan(b));
  show("page 2 validatePlan().ok", b.validatePlan().ok);
  show("page 2 priceBar", { kind: b.priceBar().kind, headline: b.priceBar().headline });
  // the same thing typed into the builder's own ZIP field IS forgotten:
  const storage2 = memoryStorage();
  const c = makeStore(PP, { storage: storage2 }).store;
  c.set({ dogCount: "2" }); c.set({ zip: "46032" }); c.set({ zip: "46201" });
  show("control: typed in the builder instead -> storage", JSON.parse(storage2.getItem(PP.STORAGE_KEYS.progress)).zip);
  show("control: page 2 ZIP", makeStore(PP, { storage: storage2 }).store.getState().zip);
  // and via ?zip= on page 2
  const storage3 = memoryStorage();
  const d = makeStore(PP, { storage: storage3 }).store;
  d.set({ dogCount: "2" }); d.set({ zip: "46032" });
  const e = makeStore(PP, { storage: storage3, search: "?zip=46201" }).store;
  show("?zip=46201 on page 2", plan(e));
  show("page 3 (no ?zip=)", plan(makeStore(PP, { storage: storage3 }).store));
}

console.log("\nP2. One-tap edit from the price step that moves the frequency to Custom booking");
{
  const s = makeStore(PP).store;
  s.set({ dogCount: "3" }); s.set({ zip: "46032" }); s.set({ yardSize: "s" }); s.toggleArea("back"); s.set({ frequency: "weekly" });
  show("reached", walkToPrice(s));
  show("edit('dogs')", s.edit("dogs"));
  const r = s.set({ dogCount: "10" });
  show("set({ dogCount: '10' }) notices", r.notices);
  show("movedTo", r.movedTo);
  show("flow().next", s.flow().next);
  show("next()", s.next());
  show("now", plan(s));
  show("one-time still available?", s.frequencyOptions().filter((o) => o.available).map((o) => o.id));
  // same thing done while standing on the price step (a design with inline editing)
  const t = makeStore(PP).store;
  t.set({ dogCount: "3" }); t.set({ zip: "46032" }); t.set({ yardSize: "s" }); t.toggleArea("back"); t.set({ frequency: "weekly" });
  walkToPrice(t);
  const r2 = t.set({ dogCount: "10" });
  show("inline edit on the price step: movedTo / step / frequency", { movedTo: r2.movedTo, step: t.getState().step, frequency: t.getState().frequency, notice: r2.notices.map((n) => n.code) });
  // contrast: a change that CLEARS the frequency does take the visitor back
  const u = makeStore(PP).store;
  u.set({ dogCount: "3" }); u.set({ zip: "46032" }); u.set({ yardSize: "s" }); u.toggleArea("back"); u.set({ frequency: "weekly" });
  walkToPrice(u);
  const r3 = u.set({ dogCount: "7" });
  show("contrast, 3 -> 7 dogs on the price step", { movedTo: r3.movedTo, step: u.getState().step, frequency: u.getState().frequency, notice: r3.notices.map((n) => n.code) });
}

console.log("\nP3. First run with 10+ dogs, and with over 1 acre: which steps are visited");
for (const [label, dogs, yard] of [["10+ dogs", "10", "s"], ["over 1 acre", "3", "over"]]) {
  const s = makeStore(PP).store;
  const visited = [s.getState().step];
  const r = s.set({ dogCount: dogs }); s.next(); visited.push(s.getState().step);
  s.set({ zip: "46032" }); s.next(); visited.push(s.getState().step);
  const r2 = s.set({ yardSize: yard }); s.next(); visited.push(s.getState().step);
  s.toggleArea("back"); s.next(); visited.push(s.getState().step);
  show(label + " steps", visited);
  show(label + " notices", r.notices.concat(r2.notices).map((n) => n.code + ": " + n.message));
  show(label + " options", s.frequencyOptions().map((o) => o.id + (o.available ? (o.selected ? " [selected]" : " open") : " disabled (" + o.reason + ")") + (o.priceText ? " " + o.priceText : "")));
}

console.log("\nP4. A subscriber that calls set() while being notified (re-entrancy)");
{
  const s = makeStore(PP).store;
  s.set({ zip: "46032", yardSize: "s", areas: ["back"] });
  let nested = null;
  const stop = s.subscribe((state, info) => {
    if (info.changed && info.changed.includes("dogCount") && state.frequency === "" && !nested) nested = s.set({ frequency: "weekly" });
  });
  const outer = s.set({ dogCount: "2" });
  stop();
  show("outer result.changed", outer.changed);
  show("nested result", nested && { ok: nested.ok, changed: nested.changed });
  show("final", plan(s));
  show("quote", s.quote().priceText);
  show("Worker agrees", W.quote({ dogs: "2", frequencyId: "weekly", yardSizeId: "s", areaIds: ["back"] }).priceCents === s.quote().priceCents);
}

console.log("\nP5. Custom chosen by hand, then needed, then not needed");
{
  const s = makeStore(PP).store;
  s.set({ zip: "46032", dogCount: "3", yardSize: "s", areas: ["back"] });
  show("hand pick custom", s.set({ frequency: "custom" }).ok);
  show("3 -> 4 dogs keeps it", { frequency: (s.set({ dogCount: "4" }), s.getState().frequency) });
  show("4 -> 10 dogs", { frequency: (s.set({ dogCount: "10" }), s.getState().frequency) });
  const r = s.set({ dogCount: "4" });
  show("10 -> 4 dogs", { frequency: s.getState().frequency, notices: r.notices.map((n) => n.code + ": " + n.message) });
}

console.log("\nP6. The guide's own examples (CORE-API.md 6.1 and 6.3), run literally");
{
  const s = makeStore(PP).store;
  s.set({ zip: "46032" });
  show("set({dogCount:'4'})", (({ ok, changed, notices, rejected, movedTo }) => ({ ok, changed, notices, rejected, movedTo }))(s.set({ dogCount: "4" })));
  s.set({ yardSize: "m", areas: ["back", "front"] });
  s.set({ frequency: "biweekly" });
  const cleared = s.set({ dogCount: "5" });
  show("set({dogCount:'5'}) with every-other-week chosen", { ok: cleared.ok, changed: cleared.changed, notices: cleared.notices });
  const refused = s.set({ frequency: "biweekly" });
  show("set({frequency:'biweekly'}) for 5 dogs", { ok: refused.ok, changed: refused.changed, rejected: refused.rejected });
  show("frequencyOptions()[1]", s.frequencyOptions()[1]);
  show("frequencyOptions()[2]", s.frequencyOptions()[2]);
  s.set({ dogCount: "2" }); s.set({ frequency: "weekly" });
  const q = s.quote();
  show("quote() 2 dogs weekly quarter-acre back+front", { priceText: q.priceText, lineItems: q.lineItems, totalCents: q.totalCents });
  show("priceBar()", s.priceBar());
}

console.log("\nP7. ZIP-to-community table against assets/map/communities.json (read-only)");
{
  const file = path.join(RELEASE_DIR, "assets/map/communities.json");
  if (!fs.existsSync(file)) show("skipped", "assets/map/communities.json not found");
  else {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const list = Array.isArray(data) ? data : data.communities || data.items || [];
    const fromMap = {};
    for (const c of list) for (const z of c.zips || c.zipCodes || []) fromMap[String(z)] = c.name || c.community;
    const diffs = [];
    for (const zip of PP.SERVICE_ZIPS) if (fromMap[zip] !== PP.ZIP_TO_COMMUNITY[zip].community) diffs.push({ zip, engine: PP.ZIP_TO_COMMUNITY[zip].community, map: fromMap[zip] });
    show("communities in map file", list.length);
    show("ZIPs in map file", Object.keys(fromMap).length);
    show("differences", diffs);
  }
}

console.log("\nP8. The live widget's own calculateQuote (cut from widget.js by indentation, evaluated in node:vm) against the engine");
{
  const vm = await import("node:vm");
  const { WIDGET_PATH } = await import("./pricing-lib.mjs");
  const source = fs.readFileSync(WIDGET_PATH, "utf8").replace(/\r\n/g, "\n");
  const cut = (startText, endText) => {
    const start = source.indexOf(startText);
    const end = source.indexOf(endText, start);
    if (start < 0 || end < 0) throw new Error("could not cut " + startText);
    return source.slice(start, end + endText.length);
  };
  const config = cut("  const CONFIG = {", "\n  };\n");
  const calc = cut("  function calculateQuote(input) {", "\n  }\n");
  const widget = vm.runInNewContext("(function () {\n" + config + "\n" + calc + "\nreturn { CONFIG, calculateQuote };\n})()", {});
  const DOGS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
  const orders = [["back"], ["front"], ["side"], ["back", "front"], ["front", "back"], ["back", "side"], ["side", "back"], ["front", "side"], ["side", "front"],
    ["back", "front", "side"], ["back", "side", "front"], ["front", "back", "side"], ["front", "side", "back"], ["side", "back", "front"], ["side", "front", "back"]];
  let compared = 0;
  const differences = [];
  for (const d of DOGS) for (const y of Object.keys(widget.CONFIG.yardSizes)) for (const f of Object.keys(widget.CONFIG.frequencies)) for (const areas of orders) {
    compared += 1;
    const w = widget.calculateQuote({ dogCount: d, frequency: f, yardSize: y, areas });
    const e = PP.calculateQuote({ dogs: d, frequencyId: f, yardSizeId: y, areaIds: areas });
    const wItems = w.ok && !w.custom ? JSON.stringify(Array.from(w.lineItems).map((i) => [i.label, i.cents])) : "";
    const eItems = e.ok && !e.custom ? JSON.stringify(e.lineItems.map((i) => [i.label, i.cents])) : "";
    const wErrors = w.ok ? "" : Array.from(w.errors).join("|");
    const eErrors = e.ok ? "" : e.errors.map((x) => x.message).join("|");
    if (w.ok !== e.ok || Boolean(w.custom) !== Boolean(e.custom) || (w.ok && !w.custom && w.priceCents !== e.priceCents) || wItems !== eItems || wErrors !== eErrors ||
        (w.ok && w.custom && JSON.stringify(Array.from(w.reasons)) !== JSON.stringify(e.reasons))) differences.push({ d, y, f, areas, widget: w.ok ? w.priceCents : wErrors, engine: e.ok ? e.priceCents : eErrors });
  }
  show("combinations compared (price, custom flag and reasons, line-item labels and amounts, error wording)", compared);
  show("differences", differences.slice(0, 5));
  show("widget ZIP list equals engine", JSON.stringify(Array.from(widget.CONFIG.serviceZips)) === JSON.stringify(PP.SERVICE_ZIPS));
  show("widget pricingVersion equals engine", widget.CONFIG.pricingVersion === PP.VERSIONS.pricingVersion);
}

console.log("\nP9. What the team would receive for a texted quote or a question when customer status was never asked");
{
  for (const intent of ["quote_delivery", "question"]) {
    const s = makeStore(PP).store;
    s.set({ dogCount: "2" }); s.set({ zip: "46032" }); s.set({ yardSize: "m" }); s.toggleArea("back"); s.toggleArea("front"); s.set({ frequency: "weekly" });
    s.set({ intent, firstName: "Test", phone: "3175550100", preferredContact: "text", smsConsent: true, lastCleaned: "About 1 month", question: "Is this a test question?" });
    const rule = s.fieldRules(intent).find((r) => r.key === "customerStatus");
    show(intent + ": customerStatus field", { shown: rule.shown, required: rule.required });
    show(intent + ": state.customerStatus", s.getState().customerStatus);
    show(intent + ": on-screen offerNote()", { kind: s.offerNote().kind, title: s.offerNote().title, customerStatusKnown: s.offerNote().facts && s.offerNote().facts.customerStatusKnown });
    const built = s.buildPayload(intent);
    show(intent + ": buildPayload ok / payload.customerStatus", { ok: built.ok, customerStatus: built.ok && built.payload.customerStatus });
    if (built.ok) {
      const lead = W.wire(built.payload);
      const validation = W.context.validateV3(lead);
      // buildV3Forward is the Worker's own function; the Request object is only read for its User-Agent header (nothing is sent)
      const forward = W.context.buildV3Forward(lead, validation.values, lead.requestId, new Request("https://stand-in.invalid/submit", { method: "POST", headers: { "User-Agent": "verify" } }));
      show(intent + ": Worker accepts", validation.ok);
      show(intent + ": forwarded customerStatus / offerEligibility", { customerStatus: forward.customerStatus, offerEligibility: forward.offerEligibility });
      show(intent + ": team summary line", String(forward.quoteSummary).split("\n").filter((line) => /Customer history|^Request:/.test(line)));
    }
    // what the live tool would have sent: status is required before the price, so a new customer is "new"
    const asNew = W.wire(Object.assign({}, built.payload, { customerStatus: "new" }));
    const forwardNew = W.context.buildV3Forward(asNew, W.context.validateV3(asNew).values, asNew.requestId, new Request("https://stand-in.invalid/submit", { method: "POST", headers: { "User-Agent": "verify" } }));
    show(intent + ": same request with the answer 'new' (what the live tool always has)", { customerStatus: forwardNew.customerStatus, offerEligibility: forwardNew.offerEligibility });
  }
}

console.log("\nnetwork attempts: " + networkAttempts.length);
