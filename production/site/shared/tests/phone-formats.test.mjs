// Audit finding B1 (XBROWSER-A11Y-FINDINGS.md, 2026-10-09): a phone number that
// arrives all at once (a paste, a keyboard suggestion, dictation) written with
// "+1" was cut to 14 characters by the input's maxlength before the engine saw
// it, and four formats became a valid-looking WRONG number: (131) 755-5010.
// Since engine 1.5.0 the phone rule carries no maxLength, formatPhone() removes
// the country code before it caps the digits, and normalizePhone() refuses a
// number whose area code or exchange starts with 0 or 1.
import test from "node:test";
import assert from "node:assert/strict";
import { core, makeStore, fillPlan, fillDetails, readyStore } from "./helpers/make-store.mjs";
import { worker } from "./helpers/live-source.mjs";

// The eleven formats of shots/xbrowser/phone-formats.mjs.
const FORMATS = [
  "3175550100", "(317) 555-0100", "317-555-0100", "+13175550100", "1 317 555 0100", "+1 (317) 555-0100",
  "1 (317) 555-0100", "+1 317-555-0100", "+1 317 555 0100", "+1-317-555-0100", "+1 317.555.0100"
];

test("the phone field rule has no maxLength; every other typed field keeps its own", () => {
  const { store } = makeStore();
  for (const intent of ["service_request", "quote_delivery", "question"]) {
    const rules = store.fieldRules(intent);
    const phone = rules.find((rule) => rule.key === "phone");
    assert.equal("maxLength" in phone, false, intent);
    assert.equal(phone.control, "tel");
    assert.equal(phone.autocomplete, "tel");
    assert.equal(phone.placeholder, "(317) 555-0123");
  }
  const byKey = Object.fromEntries(store.fieldRules("service_request").map((rule) => [rule.key, rule]));
  assert.equal(byKey.firstName.maxLength, core.FIELD_MAX_LENGTH.firstName);
  assert.equal(byKey.email.maxLength, core.FIELD_MAX_LENGTH.email);
  assert.equal(byKey.zip.maxLength, 5);
});

test("each of the eleven formats, arriving whole, is kept as (317) 555-0100 and sent as 3175550100", async () => {
  for (const typed of FORMATS) {
    assert.equal(core.formatPhone(typed), "(317) 555-0100", typed);
    assert.deepEqual(core.normalizePhone(typed), { digits: "3175550100", e164: "+13175550100" }, typed);
    const { store } = readyStore();
    assert.equal(store.set({ phone: typed }).ok, true, typed);
    assert.equal(store.getState().phone, "(317) 555-0100", typed);
    assert.equal(store.validateDetails().byField.phone, undefined, typed);
    const sent = await store.submit();
    assert.equal(sent.ok, true, typed);
    assert.equal(sent.payload.phone, "3175550100", typed);
    assert.equal(sent.payload.phoneE164, "+13175550100", typed);
    assert.equal(worker.validateV3(sent.payload).ok, true, typed);
  }
});

test("each of the eleven formats, typed one character at a time, ends as the same number", () => {
  for (const typed of FORMATS) {
    const { store } = makeStore();
    fillPlan(store);
    fillDetails(store, "service_request", "email", { phone: "" });
    let field = "";
    for (const character of typed) {
      field += character;                       // what the input holds after the key, before the engine tidies it
      store.set({ phone: field });
      field = store.getState().phone;           // builder.js writes the engine's value back
    }
    assert.equal(field, "(317) 555-0100", typed);
    assert.equal(store.validateDetails().byField.phone, undefined, typed);
  }
});

test("what the old 14-character cut produced is refused, with the usual message", () => {
  // The values the field showed in the audit (out/_evidence/phone-formats.txt).
  for (const cut of ["(131) 755-5010", "(131) 755-50", "(131) 755-501", "+1 317-555-010", "1317555010"]) {
    assert.equal(core.normalizePhone(cut), null, cut);
    const { store } = readyStore();
    store.set({ phone: cut });
    assert.equal(store.validateDetails().byField.phone, "Enter a valid 10-digit phone number.", cut);
    assert.equal(store.validateSubmit().ok, false, cut);
    assert.equal(store.buildPayload().ok, false, cut);
  }
});

test("an area code or an exchange that starts with 0 or 1 is refused; real numbers are not", () => {
  for (const bad of ["0175550100", "1175550100", "3170550100", "3171550100", "(017) 555-0100", "+1 117 555 0100", "0000000000", "1111111111"]) {
    assert.equal(core.normalizePhone(bad), null, bad);
  }
  // Every shape of a real US number: area code and exchange 2 to 9, any other digit anything.
  for (const good of ["2125550100", "3172000000", "9999999999", "4632019876", "8005551212", "3175550000", "13175550199", "+1 (765) 400-0000", "219.555.0100"]) {
    const digits = good.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
    assert.deepEqual(core.normalizePhone(good), { digits, e164: "+1" + digits }, good);
    assert.ok(worker.normalizePhone(good), "the Worker accepts it too: " + good);
  }
  // The rule is the front end's only: the engine never accepts a number the Worker refuses.
  for (const value of ["", "555", "317555010", "317555010012", "23175550100", "abc", "+44 20 7946 0958"]) {
    assert.equal(core.normalizePhone(value), null, value);
    assert.equal(Boolean(worker.normalizePhone(value)), false, value);
  }
  let seed = 20261009;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 20000; i += 1) {
    let digits = "";
    for (let d = 0; d < 10; d += 1) digits += String(Math.floor(random() * 10));
    const ours = core.normalizePhone(digits);
    const real = /^[2-9]\d{2}[2-9]/.test(digits);
    assert.equal(Boolean(ours), real, digits);
    if (ours) assert.ok(worker.normalizePhone(digits), digits);
  }
});

test("the country code goes before the cap: longer pastes keep the first ten digits of the number itself", () => {
  assert.equal(core.formatPhone("+1 317-555-0100 ext 22"), "(317) 555-0100");
  assert.equal(core.formatPhone("1 (317) 555-0100 x5"), "(317) 555-0100");
  assert.equal(core.formatPhone("317555010099"), "(317) 555-0100");
  assert.equal(core.formatPhone("+1"), "1");
  assert.equal(core.formatPhone("1317555010"), "(131) 755-5010", "ten digits are not yet known to carry a country code");
  assert.equal(core.formatPhone("13175550100"), "(317) 555-0100", "the eleventh digit settles it");
  assert.equal(core.formatPhone(""), "");
});

// VERIFY-xbrowser N3 (2026-10-10): a number pasted with a country code other
// than +1 was cut to its first ten digits, and two of three examples then
// passed as US numbers ("+52 55 1234 5678" became (525) 512-3456). Since engine
// 1.5.2 such a value is kept as written and refused.
test("a number with a country code other than +1 is kept as written and refused, never cut into a US number", () => {
  for (const [typed, shown] of [["+52 55 1234 5678", "+525512345678"], ["+61 2 9374 4000", "+61293744000"], ["+44 20 7946 0958", "+442079460958"], [" + 52 (55) 1234-5678", "+525512345678"], ["+523175550100", "+523175550100"], ["+0 317 555 0100", "+03175550100"]]) {
    assert.equal(core.formatPhone(typed), shown, typed);
    assert.equal(core.normalizePhone(typed), null, typed);
    assert.equal(core.normalizePhone(shown), null, shown);
    assert.equal(core.formatPhone(shown), shown, "writing the engine's value back changes nothing: " + shown);
    const { store } = readyStore();
    store.set({ phone: typed });
    assert.equal(store.getState().phone, shown, typed);
    assert.equal(store.validateDetails().byField.phone, "Enter a valid 10-digit phone number.", typed);
    assert.equal(store.validateSubmit().ok, false, typed);
    assert.equal(store.buildPayload().ok, false, typed);
    // corrected in place: the field takes a US number again
    store.set({ phone: "317 555 0100" });
    assert.equal(store.getState().phone, "(317) 555-0100");
    assert.equal(store.validateDetails().byField.phone, undefined);
  }
  // +1 in every spelling is still the US country code.
  for (const typed of [...FORMATS, "+ 1 317 555 0100", " +1(317)555-0100"]) {
    assert.equal(core.formatPhone(typed), "(317) 555-0100", typed);
    assert.deepEqual(core.normalizePhone(typed), { digits: "3175550100", e164: "+13175550100" }, typed);
  }
  // The engine still never accepts a number the Worker refuses.
  for (const typed of ["+52 55 1234 5678", "+61 2 9374 4000", "+525512345678"]) assert.equal(Boolean(core.normalizePhone(typed)) && !worker.normalizePhone(typed), false, typed);
});
