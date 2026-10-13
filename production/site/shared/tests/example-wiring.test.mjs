// Keeps the guide honest.
//  1. The "minimal wiring" example printed in CORE-API.md is the very script in
//     examples/minimal-wiring.html, and it really walks the whole flow:
//     dogs, ZIP, yard, areas, frequency, price, request, confirm, done.
//  2. Every store method and every export the guide names exists, and every
//     one that exists is named in the guide.
// The example runs here against a small stand-in DOM (it was also clicked
// through in headless Chrome when it was written).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { core, makeStore, fakeStorage, fakeLocation, fillDetails } from "./helpers/make-store.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const shared = path.resolve(here, "..");
const engineSource = fs.readFileSync(path.join(shared, "pp-quote-core.js"), "utf8");
const guide = fs.readFileSync(path.join(shared, "CORE-API.md"), "utf8");
const examplePage = fs.readFileSync(path.join(shared, "examples", "minimal-wiring.html"), "utf8");

function exampleScript() {
  const start = examplePage.indexOf('<script id="wiring">') + '<script id="wiring">'.length;
  return examplePage.slice(start, examplePage.indexOf("</script>", start)).trim();
}

/* ---- a stand-in DOM, just enough for the example --------------------------- */

class FakeNode {
  constructor(tagName, page) {
    this.tagName = tagName.toUpperCase();
    this.page = page;
    this.children = [];
    this.attributes = {};
    this.textContent = "";
  }
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  replaceChildren(...nodes) { this.children = nodes.slice(); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  focus() { this.page.activeElement = this; }
  setSelectionRange() {}
  scrollIntoView() {}
  all() { return this.children.reduce((found, child) => found.concat(child, child.all()), []); }
  querySelector(selector) {
    const byName = /^\[name="([^"]+)"\]$/.exec(selector);
    if (!byName) throw new Error("The stand-in DOM only understands [name=\"...\"] selectors, got " + selector);
    return this.all().find((node) => node.name === byName[1]) || null;
  }
  // All the words on screen under this node.
  get words() { return [this.textContent].concat(this.children.map((child) => child.words)).join(" ").replace(/\s+/g, " ").trim(); }
}

function openExample(address) {
  const page = { activeElement: null };
  const app = new FakeNode("main", page);
  const listeners = {};
  const sandbox = {
    document: {
      getElementById: (id) => (id === "app" ? app : null),
      createElement: (tag) => new FakeNode(tag, page),
      get activeElement() { return page.activeElement; },
      addEventListener: (type, handler) => { listeners[type] = handler; },
      removeEventListener: () => {},
      cookie: ""
    },
    location: fakeLocation(address),
    history: { state: null, replaceState() {} },
    sessionStorage: fakeStorage(),
    console: { info() {}, warn() {}, error(...args) { throw new Error("console.error: " + args.join(" ")); } },
    setTimeout, clearTimeout, URL, URLSearchParams, Promise, Date, Math, JSON, Object, Array, Number, String, Boolean, RegExp, Error
  };
  sandbox.window = sandbox; // in a browser, window IS the global object
  vm.createContext(sandbox);
  vm.runInContext(engineSource, sandbox, { filename: "pp-quote-core.js" });
  vm.runInContext(exampleScript(), sandbox, { filename: "minimal-wiring.html" });

  const buttons = () => app.all().filter((node) => node.tagName === "BUTTON");
  return {
    app,
    sandbox,
    listeners,
    heading: () => app.children[0].textContent,
    button: (label) => buttons().find((node) => node.textContent === label) || buttons().find((node) => node.textContent.startsWith(label + ":")) || null,
    press(label) {
      const node = this.button(label);
      assert.ok(node, "no button labelled " + JSON.stringify(label) + " on " + this.heading() + "; buttons: " + buttons().map((b) => b.textContent).join(" | "));
      assert.equal(node.disabled, false, JSON.stringify(label) + " is disabled on " + this.heading());
      return node.onclick({ target: node });
    },
    type(name, value) {
      const node = app.querySelector('[name="' + name + '"]');
      assert.ok(node, "no input named " + name + " on " + this.heading());
      node.focus();
      node.value = value;
      node.oninput({ target: node });
    },
    tick(name, checked) {
      const node = app.querySelector('[name="' + name + '"]');
      assert.ok(node, "no checkbox named " + name + " on " + this.heading());
      node.checked = checked !== false;
      node.onchange({ target: node });
    },
    value: (name) => app.querySelector('[name="' + name + '"]').value,
    settle: () => new Promise((resolve) => setTimeout(resolve, 20))
  };
}

test("the example in CORE-API.md is the script in examples/minimal-wiring.html, about 60 lines", () => {
  const script = exampleScript();
  assert.ok(guide.includes(script), "CORE-API.md section 3 must contain the example script exactly as it is in examples/minimal-wiring.html");
  const codeLines = script.split("\n").filter((line) => line.trim() !== "").length;
  assert.ok(codeLines >= 50 && codeLines <= 65, "example is " + codeLines + " lines of code");
  assert.ok(examplePage.includes('<script src="../pp-quote-core.js"></script>'));
  assert.equal(/mode:\s*"live"/.test(examplePage), false, "the example stays in demo mode");
  assert.equal(/https?:\/\/(?!itspurgepros\.com\/(privacy|terms))/.test(script), false, "the example calls no address");
});

test("the example walks the whole flow: dogs, ZIP, yard, areas, frequency, price, request, confirm, done", async () => {
  const page = openExample("file:///G:/review/minimal-wiring.html?pp_demo_delay=0");
  assert.equal(page.heading(), "Step: dogs");
  assert.equal(page.button("Continue").disabled, true, "Continue is disabled until a dog count is chosen");
  assert.equal(page.app.all().some((node) => node.tagName === "FOOTER"), false, "no price bar before the first answer");

  page.press("2 dogs");
  assert.equal(page.button("2 dogs").attributes["aria-pressed"], "true");
  assert.match(page.app.words, /Weekly visits from \$19\.99/, "the bar appears after the first answer");
  page.press("Continue");

  assert.equal(page.heading(), "Step: zip");
  page.type("zip", "46201");
  assert.match(page.app.words, /We do not service ZIP 46201 yet\./);
  assert.equal(page.button("Continue").disabled, true, "out of area stops here");
  page.type("zip", "46032");
  assert.match(page.app.words, /Good news: we serve Carmel\./);
  assert.equal(page.sandbox.document.activeElement.name, "zip", "focus stays in the field being typed in");
  page.press("Continue");

  assert.equal(page.heading(), "Step: yard");
  page.press("Up to ¼ acre");
  page.press("Continue");

  assert.equal(page.heading(), "Step: areas");
  assert.equal(page.button("Continue").disabled, true, "nothing is preselected");
  page.press("Back yard");
  page.press("Front yard");
  page.press("Continue");

  assert.equal(page.heading(), "Step: frequency");
  assert.equal(page.button("Weekly").textContent, "Weekly: $28.99 per visit", "one exact price on the option");
  assert.equal(page.button("One-time cleanup").textContent, "One-time cleanup: $89.99 base price");
  assert.equal(page.button("Custom booking").textContent, "Custom booking: custom quote");
  assert.equal(page.app.words.includes("+$"), false, "never an add-on amount");
  page.press("Weekly");
  page.press("Continue");

  assert.equal(page.heading(), "Step: price");
  assert.match(page.app.words, /\$28\.99 per visit Weekly · 2 dogs \$22\.49 Back yard \+ Front yard \$2\.50 Up to ¼ acre \$4\.00/);
  assert.ok(page.button("Request service") && page.button("Send me this quote") && page.button("Ask a question"), "all three intents are offered");
  page.press("Continue");

  assert.equal(page.heading(), "Step: request");
  assert.equal(page.value("city"), "Carmel", "the city is pre-filled from the ZIP");
  assert.equal(page.value("zip"), "46032");
  page.press("Continue");
  assert.match(page.app.words, /Enter your first name\./, "pressing Continue lists what is missing");
  assert.equal(page.heading(), "Step: request");
  page.press("No — I’m a new customer");
  page.type("firstName", "Test");
  page.type("lastName", "Reviewer");
  page.type("phone", "3175550100");
  assert.equal(page.value("phone"), "(317) 555-0100", "formatted as typed");
  assert.match(page.app.words, /Text me about my quote and service\. I consent to receive non-marketing text messages/);
  page.tick("smsConsent");
  page.type("address", "123 Example St");
  page.press("As soon as possible");
  page.press("About 1 month");
  page.press("Continue");

  assert.equal(page.heading(), "Step: confirm");
  assert.match(page.app.words, /I agree to the Terms of Service and acknowledge the Privacy Policy\. I understand this is a request for service-day review, not a confirmed appointment\./);
  await page.press("Send my request");
  assert.match(page.app.words, /Agree to the Terms of Service and acknowledge the Privacy Policy before submitting\./, "the terms box is required");
  assert.equal(page.heading(), "Step: confirm");
  page.tick("termsAccepted");
  await page.press("Send my request");
  await page.settle();

  assert.equal(page.heading(), "Step: done");
  assert.match(page.app.words, /Request received Reference: \S+/);
  // Nothing personal was stored, and nothing was sent.
  const stored = JSON.stringify(page.sandbox.sessionStorage.items);
  for (const personal of ["Test", "Reviewer", "3175550100", "123 Example St"]) assert.equal(stored.includes(personal), false, personal);
  page.press("Start a new quote");
  assert.equal(page.heading(), "Step: dogs");
});

test("the example shows engine notices, Back works, and a hero launcher brings the builder forward", () => {
  const page = openExample("file:///G:/review/minimal-wiring.html");
  page.press("10+ dogs");
  assert.match(page.app.words, /With 10 or more dogs we prepare a custom quote, so Custom booking is selected for you\./);
  page.press("Continue");
  assert.equal(page.heading(), "Step: zip");
  page.press("Back");
  assert.equal(page.heading(), "Step: dogs");
  page.press("3 dogs");
  assert.match(page.app.words, /You no longer need a custom quote\./);
  // The page hooks are installed: a launcher click is handled in place.
  assert.equal(typeof page.sandbox.PurgeProsQuote.open, "function");
  const event = { target: { closest: () => ({}) }, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  page.listeners.click(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(page.sandbox.document.activeElement, page.app, "focus moves to the builder");
});

test("the example shows a locked reply and a failed reply", async () => {
  const locked = openExample("file:///G:/review/minimal-wiring.html?pp_demo_delay=0&pp_demo=uncertain&zip=46032");
  const fill = (page) => {
    page.press("1 dog"); page.press("Continue");
    page.press("Up to ⅛ acre"); page.press("Continue");
    page.press("Back yard"); page.press("Continue");
    page.press("Weekly"); page.press("Continue"); page.press("Continue");
    page.press("No — I’m a new customer");
    page.type("firstName", "Test"); page.type("lastName", "Reviewer"); page.type("phone", "3175550100");
    page.tick("smsConsent"); page.type("address", "123 Example St");
    page.press("As soon as possible"); page.press("Within 1 week"); page.press("Continue");
    page.tick("termsAccepted");
  };
  fill(locked);
  assert.equal(locked.heading(), "Step: confirm", "the ZIP question was skipped because the address supplied one");
  await locked.press("Send my request");
  await locked.settle();
  assert.match(locked.app.words, /Your request may already be with our team\. Please call \(317\) 961-5865 to confirm before submitting again\./);
  assert.equal(locked.button("Send my request"), null, "no way to send again once locked");
  assert.equal(locked.button("Back"), null);

  const failing = openExample("file:///G:/review/minimal-wiring.html?pp_demo_delay=0&pp_demo=timeout&zip=46032");
  fill(failing);
  await failing.press("Send my request");
  await failing.settle();
  assert.match(failing.app.words, /We could not tell whether your request reached us/);
  assert.ok(failing.button("Send my request"), "a timeout can be retried");
});

/* ---- "Start here": the one section interface builders read ------------------ */

test("the guide opens with 'Start here for interface builders': at most 80 lines, complete on its own, and true", async () => {
  const start = guide.indexOf("## Start here for interface builders");
  const end = guide.indexOf("## 1. The rules");
  assert.ok(start > 0 && end > start, "the section sits before section 1");
  assert.ok(guide.slice(0, start).split("\n").length < 20, "near the top");
  const section = guide.slice(start, end).trimEnd();
  assert.ok(section.split("\n").length <= 80, "the section is " + section.split("\n").length + " lines");

  // One row for every step, and every topic the builders were promised.
  for (const step of core.STEPS) assert.ok(section.includes("| `" + step + "` |"), "no row for the " + step + " step");
  for (const needed of [
    "store.subscribe(", "info.changed", "info.notices", "store.priceBar()", "bar.headline", "bar.detail", "bar.visible", "bar.continueStep",
    "flow.back", "store.back()", "flow.primaryAction", "flow.disablePrimary", "flow.blockedReason", "flow.blockedErrors", "store.next()", "store.submit()",
    "C.installPageHooks(", "data-purge-quote", "data-pp-zip-form", "hooks.close()", "store.reset()", "store.edit(", "store.toggleArea(",
    "store.frequencyOptions()", "store.quote()", "store.offerNote()", "store.intentOptions()", "store.fieldRules()", "store.planSummary()", "store.requestSummary()",
    "C.wording.termsParts(", "C.wording.consentAlternativeParts(", "C.PROMISES.requestNotBooking", "state.receipt.requestId", "state.locked", "state.submitting",
    "pp_demo=slow", "pp_demo=invalid", "pp_demo=uncertain", "pp_demo_save=", "pp_demo_resume=", "pp_demo_delay=0", "?zip=46201"
  ]) assert.ok(section.includes(needed), "Start here does not mention " + needed);
  // Every demo value it names is a real one, and every submit status it lists is one the engine returns.
  for (const [param, allowed] of [["pp_demo", core.DEMO_SUBMIT_OUTCOMES], ["pp_demo_save", core.DEMO_SAVE_OUTCOMES], ["pp_demo_resume", core.DEMO_RESUME_OUTCOMES]]) {
    for (const match of section.matchAll(new RegExp("\\?" + param + "=([a-z_]+)", "g"))) assert.ok(allowed.includes(match[1]), param + "=" + match[1]);
  }

  // What it says about the store is what the store does.
  const { store } = makeStore({ options: { demo: { delayMs: 0 } } });
  const seen = [];
  store.subscribe((state, info) => seen.push(info));
  assert.deepEqual([store.flow().primaryAction, store.flow().disablePrimary, store.flow().blockedReason, store.flow().back], ["next", true, "Choose the number of dogs.", ""]);
  assert.equal(store.priceBar().visible, false);
  store.set({ dogCount: core.DOG_OPTIONS[1].id });
  assert.deepEqual([store.priceBar().visible, store.priceBar().headline, store.priceBar().detail], [true, "Weekly visits from $19.99", "2 dogs"]);
  assert.equal(store.flow().disablePrimary, false);
  store.next();
  assert.equal(store.flow().back, "dogs");
  store.set({ zip: "46032" });
  assert.deepEqual(Object.keys(store.checkZip()).filter((key) => ["status", "inArea", "community", "message"].includes(key)).length, 4);
  store.next();
  store.set({ yardSize: core.YARD_SIZES[1].id });
  store.next();
  store.toggleArea(core.AREAS[0].id);
  store.next();
  for (const key of ["id", "label", "sub", "popular", "selected", "available", "reason", "priceText"]) assert.ok(key in store.frequencyOptions()[0], key);
  store.set({ frequency: "weekly" });
  store.next();
  for (const key of ["priceText", "lineItems", "note", "custom", "oneTime"]) assert.ok(key in store.quote(), key);
  for (const key of ["kind", "title", "paragraphs"]) assert.ok(key in store.offerNote(), key);
  for (const key of ["id", "label", "selected", "available", "reason"]) assert.ok(key in store.intentOptions()[0], key);
  assert.deepEqual([store.priceBar().headline, store.priceBar().detail, store.priceBar().continueStep], ["$26.49 per visit", "2 dogs · Weekly · Up to ¼ acre", "price"]);
  store.next();
  const rules = store.fieldRules().filter((rule) => rule.shown && rule.key !== "termsAccepted");
  for (const rule of rules) {
    assert.ok("required" in rule && "control" in rule, rule.key);
    if (rule.control === "choice") assert.deepEqual(Object.keys(rule.choices[0]), ["value", "label", "selected"]);
  }
  const went = store.next();
  assert.equal(went.ok, false);
  assert.ok(went.errors.length > 0 && went.errors.every((error) => "field" in error && "step" in error && "message" in error));
  assert.equal(store.flow().disablePrimary, false, "enabled on the request step even with errors");
  fillDetails(store, "service_request", "text");
  store.next();
  assert.deepEqual([store.getState().step, store.flow().primaryAction], ["confirm", "submit"]);
  for (const key of ["label", "value", "step"]) assert.ok(key in store.planSummary()[0], key);
  for (const key of ["name", "replyBy", "phone", "email", "serviceAddress", "startTiming", "lastCleaned", "question"]) assert.ok(key in store.requestSummary(), key);
  const sent = await store.submit();
  assert.equal(sent.status, "success");
  assert.ok(store.getState().receipt.requestId && store.getState().receipt.replyWhere);
  assert.ok(seen.length > 10 && seen.every((info) => info.changed.length > 0 && Array.isArray(info.notices)), "called once for every change, never when nothing changed");
  const statuses = section.split("`sent.status` is ")[1].split(", and")[0];
  assert.deepEqual(Array.from(statuses.matchAll(/`([a-z_]+)`/g), (match) => match[1]), ["success", "invalid", "server_invalid", "locked", "unavailable", "timeout", "network", "rejected", "busy", "blocked"]);
});

test("the guide documents what the verifiers found missing: every reason, every state field, every wording key, every UI obligation", () => {
  // Subscriber reasons.
  const reasons = guide.split("- `reason` is one of ")[1].split(".")[0];
  assert.deepEqual(Array.from(reasons.matchAll(/`([a-z_A-Z]+)`/g), (match) => match[1]),
    ["set", "goTo", "edit", "next", "back", "open", "close", "reset", "submitting", "submitted", "submit_failed", "resume_loading", "resumed", "resume_failed"]);
  for (const reason of Array.from(engineSource.matchAll(/commit\("([a-z_A-Z]+)"/g), (match) => match[1]).concat(["set"])) assert.ok(reasons.includes("`" + reason + "`"), "reason " + reason + " is not documented");
  assert.equal(guide.includes('"*"'), false, "info.changed never holds a wildcard, and the guide never says it does");
  // Every state field has a row in section 5.
  const stateSection = guide.split("## 5. State")[1].split("## 6. Store methods")[0];
  for (const field of Object.keys(makeStore().store.getState())) assert.ok(stateSection.includes("`" + field + "`"), "state field " + field + " is not in section 5");
  // Every key of every wording constant is named.
  const wordingSection = guide.split("### Wording constants, key by key")[1].split("\n## ")[0];
  for (const name of ["BRAND", "OUT_OF_AREA_COPY", "PROMISES", "CONSENT", "TERMS", "MESSAGES", "SUBMIT_MESSAGES", "SAVE_LINK_MESSAGES", "RESUME_MESSAGES"]) {
    const row = wordingSection.split("\n").find((line) => line.startsWith("| `" + name + "` |"));
    assert.ok(row, "no row for " + name);
    for (const key of Object.keys(core[name])) assert.ok(row.includes("`" + key + "`"), name + "." + key + " is not named");
  }
  // The offer note's keys and kinds, the intent labels, and the choice shape.
  for (const kind of ["one_time", "custom_review", "restart", "new_recurring"]) assert.ok(guide.includes("| `" + kind + "` |"), kind);
  for (const intent of core.INTENTS) assert.ok(guide.includes('"' + intent.label + '"'), intent.label);
  assert.ok(guide.includes("`[{ value, label, selected }]`"));
  // Section 9 states every UI obligation of spec 17.2, including the four that were missing.
  const obligations = guide.split("## 9. What the interface must do")[1].split("## 10.")[0];
  for (const [what, pattern] of [
    ["keyboard", /Everything works by keyboard/], ["focus trap and return", /traps focus while it is open and returns focus/], ["once per household", /once per household and subject to the team's check/],
    ["on-the-way charge", /the base is charged when the on-the-way text goes out/], ["consent wording", /CONSENT\.lead/], ["never pre-tick", /Never pre-tick/], ["alternatives beside the box", /consentAlternativeParts/],
    ["phone hint", /phoneHintService/], ["terms box", /termsParts/], ["all visible before submit", /the plan, the price, the contact details and the terms box are all visible/], ["custom estimate", /Never show a price for a custom estimate/],
    ["out of area", /Collect nothing from an out-of-area visitor/], ["storage", /in storage, in a link, or in a bar/], ["analytics", /store\.track\(\)/], ["reviews", /review rating and count/],
    ["focus on step change", /Move focus to each new step/], ["error summary", /role="alert"/], ["required fields", /Mark every required field/], ["real controls", /aria-pressed/], ["reduced motion", /prefers-reduced-motion/],
    ["16px", /16px/], ["44px", /44px/], ["status regions", /role="status"/]
  ]) assert.match(obligations, pattern, "section 9 does not state: " + what);
});

/* ---- the guide names what exists, and only what exists ---------------------- */

test("every store member is documented, and every store method the guide names exists", () => {
  const { store } = makeStore();
  const members = Object.keys(store);
  for (const member of members) {
    assert.ok(guide.includes("store." + member), "CORE-API.md does not mention store." + member);
  }
  const named = new Set();
  for (const match of guide.matchAll(/\bstore\.([A-Za-z]+)/g)) named.add(match[1]);
  for (const name of named) {
    assert.ok(members.includes(name), "CORE-API.md names store." + name + ", which does not exist");
  }
  assert.ok(named.size >= 30);
});

test("every export is documented, and every PPQuoteCore name in the guide exists", () => {
  for (const name of Object.keys(core)) {
    assert.ok(new RegExp("\\b" + name + "\\b").test(guide), "CORE-API.md does not mention " + name);
  }
  for (const match of guide.matchAll(/\bPPQuoteCore\.([A-Za-z_]+)/g)) {
    assert.ok(Object.prototype.hasOwnProperty.call(core, match[1]), "CORE-API.md names PPQuoteCore." + match[1] + ", which does not exist");
  }
  for (const match of guide.matchAll(/\bC\.([A-Za-z_]+)/g)) {
    assert.ok(Object.prototype.hasOwnProperty.call(core, match[1]), "the example uses C." + match[1] + ", which does not exist");
  }
});

test("values the guide states are the engine's values", () => {
  // Notice codes: every one the engine can produce is in the guide's table.
  const produced = new Set();
  for (const match of engineSource.matchAll(/code: "([A-Z_]+)", field: "[a-zA-Z]+", goToStep/g)) produced.add(match[1]);
  for (const match of engineSource.matchAll(/notice\("([A-Z_]+)"/g)) produced.add(match[1]);
  assert.ok(produced.size >= 9, "found notice codes: " + Array.from(produced).join(", "));
  for (const code of produced) assert.ok(guide.includes("`" + code + "`"), "CORE-API.md does not list notice code " + code);
  // Demo switch values.
  for (const value of core.DEMO_SUBMIT_OUTCOMES.concat(core.DEMO_SAVE_OUTCOMES, core.DEMO_RESUME_OUTCOMES)) {
    assert.ok(guide.includes("`" + value + "`"), "CORE-API.md does not list demo value " + value);
  }
  // Steps, versions, storage keys, the from-line and the two tracking changes.
  for (const step of core.STEPS) assert.ok(guide.includes("`" + step + "`"), step);
  assert.ok(guide.includes(core.VERSIONS.uiVersion));
  assert.ok(guide.includes(core.STORAGE_KEYS.progress) && guide.includes(core.STORAGE_KEYS.attribution));
  assert.ok(guide.includes(core.FROM_LINE.text));
  // Tracking differences from the live tool: ONE heading in the guide, one
  // numbered row per difference, and the same numbers marked in the source.
  // The owner approved T1 to T15 on October 9, 2026 (T1 to T12 as a group,
  // and the three measurement events T13 to T15). T16 to T23 were added the
  // same day under his go-ahead, and say so in their own words, in the row
  // and in the source mark. Nothing still calls one of them unapproved.
  const approvalHeading = "### Tracking changes approved by the owner on October 9, 2026";
  assert.equal(guide.split("\n").filter((line) => line === approvalHeading).length, 1);
  assert.equal((guide.match(/^#+ Tracking changes /gm) || []).length, 1, "no second heading for the same thing");
  assert.equal(/awaiting owner approval/i.test(guide), false, "the guide still calls a tracking change unapproved");
  assert.equal(/awaiting owner approval/i.test(engineSource), false, "the source still calls a tracking change unapproved");
  const trackingSection = guide.split(approvalHeading)[1].split("\n## ")[0];
  const guideRows = Array.from(trackingSection.matchAll(/^\| (T\d+) \|/gm), (match) => match[1]);
  const marks = Array.from(engineSource.matchAll(/TRACKING CHANGE APPROVED BY THE OWNER('S GO-AHEAD)? 2026-10-09 \((T\d+)\)/g), (match) => ({ number: match[2], goAhead: Boolean(match[1]) }));
  const sourceMarks = marks.map((mark) => mark.number);
  const byNumber = (a, b) => Number(a.slice(1)) - Number(b.slice(1));
  assert.deepEqual(guideRows, Array.from({ length: 23 }, (unused, index) => "T" + (index + 1)), "rows T1 to T23, in order");
  assert.deepEqual(sourceMarks.slice().sort(byNumber), guideRows, "every row is marked once in the source, and every mark has a row");
  assert.equal((engineSource.match(/TRACKING CHANGE/g) || []).length, sourceMarks.length, "no unnumbered or differently worded mark");
  for (const mark of marks) assert.equal(mark.goAhead, Number(mark.number.slice(1)) >= 16, mark.number + " is marked with the approval it really has");
  // Every row says how it was approved: T1 to T15 by date, T16 onward under
  // the go-ahead. The guide names every measurement event, the allow-lists
  // they are held to, and the engine version that added them.
  const goAhead = "| Approved by the owner's go-ahead of October 9, 2026 (he asked for the measurement to be fully fleshed out) |";
  for (const row of trackingSection.split("\n").filter((line) => /^\| T\d+ \|/.test(line))) {
    const number = Number(/^\| T(\d+) \|/.exec(row)[1]);
    assert.ok(row.endsWith(number >= 16 ? goAhead : "| October 9, 2026 |"), "T" + number + " does not say how it was approved");
    assert.equal(row.endsWith(goAhead), number >= 16, "T" + number);
  }
  for (const name of Object.keys(core.EVENTS.measurementParams)) assert.ok(guide.includes("`" + name), "CORE-API.md does not name " + name);
  assert.ok(guide.includes("`PPQuoteCore.EVENTS.measurementParams`") && guide.includes("pixelCounts") && guide.includes("pixelStandard"));
  // The method an interface reports through: every name, parameter and fixed value is in the guide.
  assert.ok(guide.includes("`store.trackUi(name, params)`") && guide.includes("`PPQuoteCore.EVENTS.trackUi`") && guide.includes("`EVENTS.trackUiParams`") && guide.includes("`EVENTS.trackUiValues`"));
  for (const name of core.EVENTS.trackUi) assert.ok(guide.includes("store.trackUi(\"" + name + "\""), "the guide has no example call for " + name);
  for (const key of Object.keys(core.EVENTS.trackUiValues)) {
    assert.ok(guide.includes("`" + key + "`"), "CORE-API.md does not name the parameter " + key);
    if (key === "fields") continue; // the field keys are FIELD_STEP's, named as a list
    for (const value of core.EVENTS.trackUiValues[key]) assert.ok(guide.includes("`" + value + "`"), "CORE-API.md does not list " + key + " value " + value);
  }
  // The 30-day copy of the attribution: its key, its lifetime and its place among the open points.
  assert.ok(guide.includes("`" + core.STORAGE_KEYS.attributionKept + "`") && guide.includes("`PPQuoteCore.ATTRIBUTION_KEEP_DAYS`"));
  assert.equal(core.ATTRIBUTION_KEEP_DAYS, 30);
  const openPoints = guide.split("## 17. Open points for the owner")[1];
  assert.ok(/Attribution kept for 30 days \(T23\)/.test(openPoints) && /Privacy Policy/.test(openPoints), "the outcome of the Privacy Policy reading is recorded under the open points");
  assert.equal(/`QuoteTexted`/.test(guide.split("## 8. Tracking")[1].split("### Tracking changes approved")[0]), false, "the event table uses the new name only");
  assert.ok(guide.includes("engine " + core.engineVersion + ":"), "the change note at the top names engine " + core.engineVersion);
  // Submit statuses in the guide's table are the ones the engine returns.
  for (const status of ["success", "invalid", "server_invalid", "locked", "unavailable", "timeout", "network", "rejected", "busy", "blocked"]) {
    assert.ok(guide.includes("| `" + status + "` |"), "submit status " + status + " is not in the table");
    assert.ok(engineSource.includes('"' + status + '"'), status);
  }
});
