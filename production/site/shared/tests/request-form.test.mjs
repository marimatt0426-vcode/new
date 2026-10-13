// The request form: which fields each intent shows and requires, the text
// consent rules, the terms rules, and the validation messages (spec 4.4, 4.5,
// 12.7 and 17.2).
import test from "node:test";
import assert from "node:assert/strict";
import { core, makeStore, fillPlan, fillDetails, readyStore } from "./helpers/make-store.mjs";

function rulesByKey(store, intent) {
  return Object.fromEntries(store.fieldRules(intent).map((rule) => [rule.key, rule]));
}

test("which fields each intent shows and requires", () => {
  const { store } = makeStore();
  fillPlan(store);
  const shown = (intent) => store.fieldRules(intent).filter((rule) => rule.shown).map((rule) => rule.key);
  const required = (intent) => store.fieldRules(intent).filter((rule) => rule.shown && rule.required).map((rule) => rule.key);

  // Service request by Text (the default reply method): every current field.
  assert.deepEqual(shown("service_request"), ["customerStatus", "firstName", "lastName", "preferredContact", "phone", "email", "smsConsent", "address", "city", "zip", "startTiming", "lastCleaned", "termsAccepted"]);
  assert.deepEqual(required("service_request"), ["customerStatus", "firstName", "lastName", "preferredContact", "phone", "smsConsent", "address", "city", "zip", "startTiming", "lastCleaned", "termsAccepted"]);

  // Quote delivery: the smallest form (spec section 14 item 3).
  assert.deepEqual(shown("quote_delivery"), ["firstName", "preferredContact", "phone", "email", "smsConsent", "lastCleaned"]);
  assert.deepEqual(required("quote_delivery"), ["firstName", "preferredContact", "phone", "smsConsent", "lastCleaned"]);

  // Question.
  assert.deepEqual(shown("question"), ["firstName", "preferredContact", "phone", "email", "smsConsent", "lastCleaned", "question"]);
  assert.deepEqual(required("question"), ["firstName", "preferredContact", "phone", "smsConsent", "lastCleaned", "question"]);

  // Last full cleanup is required for every intent.
  for (const intent of ["service_request", "quote_delivery", "question"]) assert.equal(rulesByKey(store, intent).lastCleaned.required, true);
});

test("the reply method changes what is required, and the labels say so", () => {
  const { store } = makeStore();
  fillPlan(store);

  store.set({ intent: "question", preferredContact: "email" });
  let rules = rulesByKey(store, "question");
  assert.equal(rules.phone.required, false);
  assert.equal(rules.phone.label, "Phone number (optional)");
  assert.equal(rules.email.required, true);
  assert.equal(rules.email.label, "Email");
  assert.equal(rules.smsConsent.shown, false, "the consent box is hidden unless Text is chosen");
  assert.equal(rules.phone.hint, "10-digit U.S. number. Optional when receiving a quote or answer by email.");

  store.set({ preferredContact: "call" });
  rules = rulesByKey(store, "question");
  assert.equal(rules.phone.required, true);
  assert.equal(rules.phone.label, "Phone number");
  assert.equal(rules.email.label, "Email (optional)");
  assert.equal(rules.smsConsent.shown, false);

  store.set({ preferredContact: "text" });
  rules = rulesByKey(store, "question");
  assert.equal(rules.smsConsent.shown, true);
  assert.equal(rules.smsConsent.required, true);

  // A service request always needs a phone, and says it is not an opt-in.
  store.set({ intent: "service_request", preferredContact: "email" });
  rules = rulesByKey(store, "service_request");
  assert.equal(rules.phone.required, true);
  assert.equal(rules.phone.label, "Phone number");
  assert.equal(rules.phone.hint, "Required for your service record. Providing a number does not opt you into texts.");
  assert.equal(rules.email.required, true);

  // Phone call is not offered for a quote delivery.
  assert.deepEqual(rulesByKey(store, "quote_delivery").preferredContact.options.map((option) => option.id), ["text", "email"]);
  assert.deepEqual(rulesByKey(store, "question").preferredContact.options.map((option) => option.id), ["text", "email", "call"]);
});

test("field rules carry the exact wording to render for consent and terms", () => {
  const { store } = makeStore();
  fillPlan(store);
  const service = rulesByKey(store, "service_request");
  assert.equal(service.smsConsent.lead, core.CONSENT.lead);
  assert.equal(service.smsConsent.body, core.CONSENT.body);
  assert.equal(service.smsConsent.alternative, core.CONSENT.alternativeWithCall);
  assert.equal(rulesByKey(store, "quote_delivery").smsConsent.alternative, core.CONSENT.alternativeWithoutCall);
  assert.equal(service.termsAccepted.text, core.TERMS.recurring);
  assert.equal(rulesByKey(store, "question").termsAccepted.shown, false);
  assert.equal(rulesByKey(store, "question").termsAccepted.otherwiseShow, core.TERMS.otherIntents);
  // One-time cleanup: "cleanup availability" instead of "service-day review".
  store.set({ frequency: "onetime" });
  assert.equal(rulesByKey(store, "service_request").termsAccepted.text, core.TERMS.oneTime);
  // The option lists are the exact strings.
  assert.deepEqual(service.startTiming.options, core.START_TIMING_OPTIONS);
  assert.deepEqual(service.lastCleaned.options, core.LAST_CLEANED_OPTIONS);
  assert.deepEqual(service.customerStatus.options.map((option) => option.id), ["new", "returning", "not_sure"]);
});

test("validateDetails: one keyed, readable message per problem, for each intent", () => {
  const { store } = makeStore();
  fillPlan(store);
  const service = store.validateDetails("service_request");
  assert.equal(service.ok, false);
  assert.deepEqual(service.byField, {
    customerStatus: "Choose whether you have used Purge Pros before.",
    firstName: "Enter your first name.",
    lastName: "Enter your last name.",
    phone: "Enter a valid 10-digit phone number.",
    smsConsent: "To choose Text, select the service-text permission or choose Email/Phone call.",
    address: "Enter the service street address.",
    startTiming: "Choose when you would like to start.",
    lastCleaned: "Choose when the yard was last fully cleaned."
  });
  assert.ok(service.errors.every((error) => error.step === "request" && error.code && error.message));
  // The city is already suggested from the ZIP, so it is not an error here.
  assert.equal(store.getState().city, "Carmel");
  store.set({ city: "" });
  assert.equal(store.validateDetails("service_request").byField.city, "Enter the service city.");
  store.set({ city: "Carmel" });

  assert.deepEqual(store.validateDetails("quote_delivery").byField, {
    firstName: "Enter your first name.",
    phone: "Enter a valid 10-digit phone number.",
    smsConsent: "To choose Text, select the service-text permission or choose Email.",
    lastCleaned: "Choose when the yard was last fully cleaned."
  });
  assert.deepEqual(store.validateDetails("question").byField, {
    firstName: "Enter your first name.",
    phone: "Enter a valid 10-digit phone number.",
    smsConsent: "To choose Text, select the service-text permission or choose Email/Phone call.",
    lastCleaned: "Choose when the yard was last fully cleaned.",
    question: "Enter your question."
  });
  assert.deepEqual(store.validateDetails("newsletter").byField, { intent: "Choose what you would like to do next." });
  // With no argument it uses the current intent.
  assert.deepEqual(store.validateDetails().byField, store.validateDetails("service_request").byField);

  fillDetails(store, "service_request", "text");
  assert.deepEqual(store.validateDetails(), { ok: true, errors: [], byField: {} });
});

test("an optional phone or email that is typed must still be valid", () => {
  const { store } = makeStore();
  fillPlan(store);
  fillDetails(store, "question", "email", { phone: "" });
  assert.equal(store.validateDetails("question").ok, true, "no phone needed for an emailed answer");
  store.set({ phone: "5550" });
  assert.equal(store.validateDetails("question").byField.phone, "Enter a valid 10-digit phone number.");
  store.set({ phone: "" });
  fillDetails(store, "question", "call", { email: "" });
  assert.equal(store.validateDetails("question").ok, true, "no email needed for a call");
  store.set({ email: "nope" });
  assert.equal(store.validateDetails("question").byField.email, "Enter a valid email address.");
});

test("the phone is formatted as it is typed and text fields are held to the live limits", () => {
  const { store } = makeStore();
  const typed = ["3", "31", "317", "3175", "31755", "317555", "3175550", "31755501", "317555010", "3175550100", "31755501009"];
  const shown = typed.map((value) => { store.set({ phone: value }); return store.getState().phone; });
  assert.deepEqual(shown, ["3", "31", "317", "(317) 5", "(317) 55", "(317) 555", "(317) 555-0", "(317) 555-01", "(317) 555-010", "(317) 555-0100", "(317) 555-0100"]);
  store.set({ firstName: "x".repeat(200), lastName: "y".repeat(200), email: "z".repeat(400), address: "a".repeat(300), city: "c".repeat(300), question: "q".repeat(3000) });
  const state = store.getState();
  assert.equal(state.firstName.length, 80);
  assert.equal(state.lastName.length, 80);
  assert.equal(state.email.length, 254);
  assert.equal(state.address.length, 120);
  assert.equal(state.city.length, 80);
  assert.equal(state.question.length, 1500);
  store.set({ firstName: null, question: undefined });
  assert.equal(store.getState().firstName, "");
  assert.equal(store.getState().question, "");
});

/* ---- text consent (spec 4.4.1, 17.2 items 1 to 4) -------------------------- */

test("text consent: never pre-ticked, only while Text is chosen, and the moment is recorded", () => {
  const { store, clock } = makeStore();
  fillPlan(store);
  assert.equal(store.getState().preferredContact, "text");
  assert.equal(store.getState().smsConsent, false, "unticked by default");
  assert.equal(store.getState().smsConsentCapturedAt, "");

  clock.now = Date.parse("2026-10-07T16:30:00.000Z");
  store.set({ smsConsent: true });
  assert.equal(store.getState().smsConsent, true);
  assert.equal(store.getState().smsConsentCapturedAt, "2026-10-07T16:30:00.000Z");
  // Ticking again later does not move the recorded moment.
  clock.now += 60000;
  store.set({ smsConsent: true });
  assert.equal(store.getState().smsConsentCapturedAt, "2026-10-07T16:30:00.000Z");
  // Unticking clears it.
  store.set({ smsConsent: false });
  assert.equal(store.getState().smsConsentCapturedAt, "");
  // Only a real true ticks it.
  for (const value of ["yes", 1, "true", {}, null]) {
    store.set({ smsConsent: value });
    assert.equal(store.getState().smsConsent, false, JSON.stringify(value));
  }
});

test("text consent is cleared when the reply method changes, and coming back needs a fresh tick", () => {
  for (const other of ["email", "call"]) {
    const { store, clock } = makeStore();
    fillPlan(store);
    store.set({ smsConsent: true });
    const first = store.getState().smsConsentCapturedAt;
    const change = store.set({ preferredContact: other });
    assert.equal(store.getState().smsConsent, false, other);
    assert.equal(store.getState().smsConsentCapturedAt, "");
    assert.ok(change.notices.some((notice) => notice.code === "CONSENT_CLEARED" && notice.field === "smsConsent"), "the interface is told to untick the box");
    // Consent cannot be given while Text is not the reply method.
    const refused = store.set({ smsConsent: true });
    assert.equal(refused.rejected[0].field, "smsConsent");
    assert.equal(store.getState().smsConsent, false);
    // Back to Text: still unticked, and Text cannot be used without it.
    store.set({ preferredContact: "text" });
    assert.equal(store.getState().smsConsent, false);
    assert.ok(store.validateDetails().byField.smsConsent);
    clock.now += 120000;
    store.set({ smsConsent: true });
    assert.notEqual(store.getState().smsConsentCapturedAt, first, "a new moment for the new tick");
    // Setting the method and the tick together works only for Text.
    assert.equal(store.set({ preferredContact: other, smsConsent: true }).rejected[0].field, "smsConsent");
    assert.equal(store.getState().smsConsent, false);
  }
});

test("choosing Email or Phone call records no text consent, even though a phone number is collected", () => {
  for (const contact of ["email", "call"]) {
    const { store } = makeStore();
    fillPlan(store);
    fillDetails(store, "service_request", contact);
    const payload = store.buildPayload().payload;
    assert.equal(payload.phone, "3175550100");
    assert.equal(payload.smsTransactionalConsent, false);
    assert.equal(payload.consent, "no");
    assert.equal(payload.consentVersion, "");
    assert.equal(payload.smsConsentCapturedAt, "");
    assert.equal(store.requestSummary().textConsentGiven, false);
  }
});

/* ---- terms (spec 4.5, 17.2 item 6) ---------------------------------------- */

test("terms: unticked by default, service requests only, and the moment is recorded", () => {
  const { store, clock } = makeStore();
  fillPlan(store);
  fillDetails(store, "service_request", "text");
  store.set({ termsAccepted: false });
  assert.deepEqual(store.validateSubmit().errors.map((error) => error.field), ["termsAccepted"]);
  assert.equal(store.validateDetails().ok, true, "the terms box is checked at submit, not with the form");
  clock.now = Date.parse("2026-10-07T17:00:00.000Z");
  store.set({ termsAccepted: true });
  assert.equal(store.getState().termsAcceptedAt, "2026-10-07T17:00:00.000Z");
  assert.equal(store.validateSubmit().ok, true);
  store.set({ termsAccepted: false });
  assert.equal(store.getState().termsAcceptedAt, "");

  // Other intents have no terms box; submitting acknowledges the Privacy Policy instead.
  for (const intent of ["quote_delivery", "question"]) {
    const other = makeStore().store;
    fillPlan(other);
    fillDetails(other, intent, "email");
    assert.equal(other.set({ termsAccepted: true }).rejected[0].field, "termsAccepted");
    assert.equal(other.getState().termsAccepted, false);
    assert.equal(other.validateSubmit(intent).ok, true);
  }
});

test("terms are re-required after ANY edit to the plan or the form", () => {
  const edits = {
    zip: "46033", dogCount: "3", yardSize: "l", areas: ["back"], frequency: "twice",
    customerStatus: "returning", firstName: "Tester", lastName: "Other", phone: "3175550111", email: "other@example.com",
    address: "9 Sample Ct", city: "Fishers", startTiming: "Within the next week", lastCleaned: "2–4 months", question: "A note"
  };
  for (const [field, value] of Object.entries(edits)) {
    const { store } = readyStore();
    assert.equal(store.getState().termsAccepted, true);
    const patch = {};
    patch[field] = value;
    const result = store.set(patch);
    assert.equal(store.getState().termsAccepted, false, field + " should untick the terms box");
    assert.equal(store.getState().termsAcceptedAt, "");
    assert.ok(result.notices.some((notice) => notice.code === "TERMS_CLEARED"), field + ": the interface is told");
    assert.equal(store.buildPayload().ok, false, field + ": cannot send until agreed again");
    // Setting the same value again changes nothing and keeps a fresh tick.
    store.set({ termsAccepted: true });
    store.set(patch);
    assert.equal(store.getState().termsAccepted, true, field + " unchanged keeps the tick");
  }
  // Reply method, text consent and the intent count too.
  const contact = readyStore().store;
  contact.set({ preferredContact: "call" });
  assert.equal(contact.getState().termsAccepted, false);
  const consent = readyStore().store;
  consent.set({ smsConsent: false });
  assert.equal(consent.getState().termsAccepted, false);
  const intent = readyStore().store;
  intent.set({ intent: "question" });
  assert.equal(intent.getState().termsAccepted, false);
  intent.set({ intent: "service_request" });
  assert.equal(intent.getState().termsAccepted, false, "choosing an intent again does not bring the tick back");
});

/* ---- customer status and the offer note ----------------------------------- */

test("customer status is asked in the request step, required only for a service request", () => {
  const { store } = makeStore();
  fillPlan(store);
  assert.equal(store.validatePlan().ok, true, "the price does not wait for it");
  assert.equal(store.goTo("price").ok, true);
  fillDetails(store, "service_request", "text", { customerStatus: "" });
  assert.equal(store.validateDetails().byField.customerStatus, "Choose whether you have used Purge Pros before.");
  for (const status of ["new", "returning", "not_sure"]) {
    store.set({ customerStatus: status, termsAccepted: true });
    assert.equal(store.buildPayload().payload.customerStatus, status);
  }
  const quote = makeStore().store;
  fillPlan(quote);
  fillDetails(quote, "quote_delivery", "text", { customerStatus: "" });
  assert.equal(quote.validateDetails("quote_delivery").ok, true);
});

// The wording below is the owner's decision of 2026-10-08 (POLICY-WORDING.md in
// the release root). The ORDER of the kinds is still the live widget's.
const NEW_RECURRING_PARAGRAPHS = [
  "Your first cleanup is billed at your regular per-visit price, with up to two hours (120 minutes) of cleanup included, even when the yard has built up.",
  "If a yard looks like it needs longer, we tell you before we start and agree the extra time with you first, at $1 per minute.",
  "For households new to Purge Pros, once per household. No minimum number of visits and no cancellation fee."
];
const RESTART_SECOND_PARAGRAPH = "We confirm your account rate and these terms before you approve service. The base is charged when your on-the-way text goes out. Regular maintenance visits after that stay at the agreed rate however long they take. The no-start-up-fee first cleanup is for households new to Purge Pros; if your history is unclear, we check and tell you which applies before you approve anything.";
const ONE_TIME_PARAGRAPH = "One-time cleanups are priced on their own, separately from recurring service. The $89.99 base is charged when we text that we are on the way. Time beyond 30 minutes is billed after the cleanup at $1 per minute.";
const CUSTOMER_STATUS_HINT = "No start-up fee is for households new to Purge Pros, once per household. If you have had service before or are not sure, we check and confirm your first-visit price before anything is scheduled.";

// Every dollar amount, every count of minutes and every other number in a piece of wording, in order.
function numbersIn(text) {
  return String(text).match(/\$\d[\d,]*(?:\.\d\d)?|\b\d+ minutes?\b|\b\d+\b/g) || [];
}

// One note of each kind, on the standard test plan ($28.99 per visit).
function everyOfferNote() {
  const notes = {};
  const { store } = makeStore();
  notes.new_recurring_before_any_answer = store.offerNote();
  fillPlan(store);
  store.set({ customerStatus: "new" });
  notes.new_recurring = store.offerNote();
  store.set({ customerStatus: "returning" });
  notes.restart_returning = store.offerNote();
  store.set({ customerStatus: "not_sure" });
  notes.restart_not_sure = store.offerNote();
  store.set({ frequency: "" });
  notes.restart_before_the_price = store.offerNote();
  store.set({ frequency: "onetime" });
  notes.one_time = store.offerNote();
  store.set({ frequency: "custom" });
  notes.custom_review = store.offerNote();
  store.set({ frequency: "weekly", yardSize: "over" });
  notes.custom_review_over_an_acre = store.offerNote();
  return notes;
}

test("the offer note follows the live order: one-time, custom, returning, then new recurring", () => {
  const { store } = makeStore();
  assert.equal(store.offerNote().kind, "new_recurring");
  assert.equal(store.offerNote().draftWording, false, "the no-start-up-fee wording was decided on 2026-10-08");
  assert.equal(store.offerNote().facts.firstCleanupMinutesAllowance, 120, "the first-cleanup allowance the owner decided");
  assert.equal(store.offerNote().facts.customerStatusKnown, false);
  fillPlan(store);
  store.set({ customerStatus: "new" });
  assert.equal(store.offerNote().kind, "new_recurring");
  assert.equal(store.offerNote().facts.customerStatusKnown, true);
  assert.equal(store.offerNote().title, "No start-up fee");
  assert.deepEqual(Array.from(store.offerNote().paragraphs), NEW_RECURRING_PARAGRAPHS);

  for (const status of ["returning", "not_sure"]) {
    store.set({ customerStatus: status });
    const note = store.offerNote();
    assert.equal(note.kind, "restart");
    assert.equal(note.draftWording, false);
    assert.equal(note.title, "Restarting service: clear cleanup pricing.");
    assert.deepEqual(Array.from(note.paragraphs), [
      "Your quoted maintenance rate is $28.99 per visit. For your restart cleanup, that rate includes up to 30 minutes. Only time beyond 30 minutes is billed afterward, at $1 per minute.",
      RESTART_SECOND_PARAGRAPH
    ]);
  }
  // Before the price exists.
  store.set({ frequency: "" });
  assert.deepEqual(Array.from(store.offerNote().paragraphs), [
    "Your quoted maintenance rate comes next. For your restart cleanup, that rate includes up to 30 minutes. Only time beyond 30 minutes is billed afterward, at $1 per minute.",
    RESTART_SECOND_PARAGRAPH
  ]);

  // One-time wins over customer status.
  store.set({ frequency: "onetime" });
  const oneTime = store.offerNote();
  assert.equal(oneTime.kind, "one_time");
  assert.equal(oneTime.draftWording, false);
  assert.equal(oneTime.title, "One-time cleanup: $89.99 for the first 30 minutes.");
  assert.deepEqual(Array.from(oneTime.paragraphs), [ONE_TIME_PARAGRAPH]);
  // Custom.
  store.set({ frequency: "custom" });
  assert.equal(store.offerNote().kind, "custom_review");
  assert.equal(store.offerNote().draftWording, false);
  assert.equal(store.offerNote().title, "Your price needs a custom review.");
  assert.deepEqual(Array.from(store.offerNote().paragraphs), ["We confirm your price and first-cleanup terms before you approve service. Nothing is charged by this form."]);
  store.set({ yardSize: "over" });
  assert.equal(store.offerNote().kind, "custom_review");
});

test("the hint under \"Have you used Purge Pros before?\" is the 2026-10-08 wording", () => {
  const { store } = makeStore();
  fillPlan(store);
  const rule = rulesByKey(store, "service_request").customerStatus;
  assert.equal(rule.label, "Have you used Purge Pros before?");
  assert.equal(rule.hint, CUSTOMER_STATUS_HINT);
});

test("(a) the numbers and timings in the restart and one-time notes are unchanged", () => {
  const notes = everyOfferNote();
  const perMinute = "$" + String(core.ONE_TIME.extraPerMinuteCents / 100);
  const base = core.formatMoney(core.ONE_TIME.baseCents);
  assert.equal(core.ONE_TIME.includedMinutes, 30);
  assert.equal(perMinute, "$1");
  assert.equal(base, "$89.99");

  // Restart: the quoted rate, 30 minutes twice, $1 per minute, and nothing else with a digit in it.
  for (const key of ["restart_returning", "restart_not_sure"]) {
    const text = notes[key].title + " " + notes[key].paragraphs.join(" ");
    assert.deepEqual(numbersIn(text), ["$28.99", "30 minutes", "30 minutes", "$1"], key);
    assert.match(notes[key].paragraphs[0], /that rate includes up to 30 minutes\./, key);
    assert.match(notes[key].paragraphs[0], /time beyond 30 minutes is billed afterward, at \$1 per minute\.$/, key);
    assert.match(notes[key].paragraphs[1], /The base is charged when your on-the-way text goes out\./, key);
    assert.match(notes[key].paragraphs[1], /We confirm your account rate and these terms before you approve service\./, key);
  }
  assert.deepEqual(numbersIn(notes.restart_before_the_price.paragraphs.join(" ")), ["30 minutes", "30 minutes", "$1"], "no price is invented before one exists");

  // One-time: $89.99 for the first 30 minutes, then $1 per minute, charged when the on-the-way text goes out.
  const oneTime = notes.one_time.title + " " + notes.one_time.paragraphs.join(" ");
  assert.deepEqual(numbersIn(oneTime), ["$89.99", "30 minutes", "$89.99", "30 minutes", "$1"]);
  assert.match(notes.one_time.title, /\$89\.99 for the first 30 minutes\.$/);
  assert.match(notes.one_time.paragraphs[0], /The \$89\.99 base is charged when we text that we are on the way\./);
  assert.match(notes.one_time.paragraphs[0], /Time beyond 30 minutes is billed after the cleanup at \$1 per minute\.$/);

  // The same figures as the engine's own one-time table, which other tests compare with the live Worker.
  assert.equal(core.ONE_TIME.summary, "The first 30 minutes are included. Additional labor is $1 per minute.");

  // A custom review quotes no figure at all.
  for (const key of ["custom_review", "custom_review_over_an_acre"]) {
    assert.deepEqual(numbersIn(notes[key].title + " " + notes[key].paragraphs.join(" ")), [], key);
  }
});

test("(b) no offer note or hint says offer, promotion, waived or surcharge", () => {
  const banned = /offer|promotion|waive|surcharge/i;   // "waive" also catches waived, waives and waiver
  const notes = everyOfferNote();
  for (const key of Object.keys(notes)) {
    const note = notes[key];
    assert.doesNotMatch(note.title, banned, key + " title");
    for (const paragraph of note.paragraphs) assert.doesNotMatch(paragraph, banned, key + ": " + paragraph);
    // Nothing promises a free or an unlimited first cleanup either.
    for (const paragraph of note.paragraphs) assert.doesNotMatch(paragraph, /\bfree\b|unlimited|no matter how long/i, key + ": " + paragraph);
  }
  // Every hint on the form, for every intent, reply method and kind of plan the form can be drawn for.
  let hints = 0;
  for (const frequency of ["weekly", "onetime", "custom"]) {
    for (const intent of ["service_request", "quote_delivery", "question"]) {
      for (const contact of ["text", "call", "email"]) {
        const { store } = makeStore();
        fillPlan(store);
        store.set({ frequency: frequency, intent: intent, preferredContact: contact });
        for (const rule of store.fieldRules(intent)) {
          if (!rule.hint) continue;
          hints += 1;
          assert.doesNotMatch(String(rule.hint), banned, rule.key + " hint (" + [frequency, intent, contact].join(", ") + "): " + rule.hint);
        }
      }
    }
  }
  assert.ok(hints > 0, "the form has hints to check");
});

test("(c) the new-recurring note states 120 minutes, and only the figures the owner decided", () => {
  const notes = everyOfferNote();
  for (const key of ["new_recurring_before_any_answer", "new_recurring"]) {
    const note = notes[key];
    assert.equal(note.kind, "new_recurring", key);
    assert.equal(note.paragraphs.length, 3, key);
    assert.equal(note.facts.firstCleanupMinutesAllowance, 120, key);
    assert.ok(note.paragraphs[0].includes(String(note.facts.firstCleanupMinutesAllowance) + " minutes"), key + ": the sentence states the allowance in the facts");
    assert.match(note.paragraphs[0], /up to two hours \(120 minutes\) of cleanup included/, key);
    assert.match(note.paragraphs[0], /billed at your regular per-visit price/, key);
    // 120 minutes and $1 per minute are the only figures: no price, and no other number of minutes (never 30 or 90).
    assert.deepEqual(numbersIn(note.title + " " + note.paragraphs.join(" ")), ["120 minutes", "$1"], key);
    // Extra time is agreed before work starts, never billed unannounced.
    assert.match(note.paragraphs[1], /we tell you before we start and agree the extra time with you first/, key);
    assert.match(note.paragraphs[2], /once per household/, key);
  }
});

test("the confirm summary shows the reply method in words, the question, and one service address", () => {
  const { store } = readyStore();
  assert.deepEqual(store.requestSummary(), {
    intent: "service_request", name: "Test Reviewer", replyBy: "Text message", phone: "(317) 555-0100", email: "test@example.com",
    serviceAddress: "123 Example St, Carmel, IN 46032", startTiming: "As soon as possible", lastCleaned: "About 1 month",
    customerStatus: "No — I’m a new customer", question: "", textConsentGiven: true
  });
  const question = store.requestSummary("question");
  assert.equal(question.question, "Is this only a test question?");
  assert.equal(question.name, "Test", "no last name for a question");
  assert.equal(question.serviceAddress, "");
  store.set({ preferredContact: "call" });
  assert.equal(store.requestSummary().replyBy, "Phone call");
});

test("the payload trims names and lower-cases the email, and sends the phone as digits and E.164", () => {
  const { store } = readyStore();
  store.set({ firstName: "  Test ", lastName: " Reviewer  ", email: "  Test@Example.COM ", address: " 123 Example St ", city: " Carmel " });
  store.set({ termsAccepted: true });
  const payload = store.buildPayload().payload;
  assert.equal(payload.firstName, "Test");
  assert.equal(payload.lastName, "Reviewer");
  assert.equal(payload.email, "test@example.com");
  assert.equal(payload.street, "123 Example St");
  assert.equal(payload.city, "Carmel");
  assert.equal(payload.phone, "3175550100");
  assert.equal(payload.phoneE164, "+13175550100");
  assert.equal(payload.dogs, "2");
  assert.equal(typeof payload.dogs, "string");
  assert.equal(payload.areas, "Back yard & Front yard");
  assert.equal(payload.yardSize, "Up to ¼ acre");
  assert.equal(payload.frequency, "Weekly");
  assert.equal(payload.perVisitPrice, "28.99");
});

test("a different ZIP handed over by a hero form is an edit too: the terms box is unticked", () => {
  const { store } = readyStore();
  store.goTo("confirm");
  assert.equal(store.getState().termsAccepted, true);
  // The same ZIP again changes nothing.
  store.open({ zip: "46032" });
  store.open({ zip: "46032" });
  assert.equal(store.getState().termsAccepted, true);
  // A different accepted ZIP: still on confirm, but the terms must be agreed again.
  store.open({ zip: "46038" });
  assert.equal(store.getState().zip, "46038");
  assert.equal(store.getState().step, "confirm");
  assert.equal(store.getState().termsAccepted, false);
  assert.equal(store.getState().termsAcceptedAt, "");
  assert.equal(store.buildPayload().ok, false);
  // An out-of-area ZIP stops the request altogether.
  store.set({ termsAccepted: true });
  store.open({ zip: "46201" });
  assert.equal(store.getState().step, "zip");
  assert.equal(store.getState().termsAccepted, false);
  assert.equal(store.buildPayload().ok, false);
});
