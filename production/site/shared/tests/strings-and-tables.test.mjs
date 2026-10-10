// Every exact string, id, table and version in the engine is compared with the
// live source it was copied from. If someone retypes a consent sentence, an
// en dash or a price, this file fails.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { core } from "./helpers/make-store.mjs";
import { worker, widget, widgetText, workerText, plain } from "./helpers/live-source.mjs";
import { TERMS_VERSION, SWITCH_DAY } from "./helpers/terms-version.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const releaseRoot = path.resolve(here, "../..");

// The widget keeps its wording inside HTML. Links become their text.
function withoutLinks(html) {
  return html.replace(/<a [^>]*>/g, "").replace(/<\/a>/g, "").replace(/&amp;/g, "&");
}
const widgetWords = withoutLinks(widgetText);

function inWidget(text, what) {
  assert.ok(widgetWords.includes(text) || widgetText.includes(text), (what || "string") + " not found verbatim in widget.js: " + JSON.stringify(text));
}
function inWorker(text, what) {
  assert.ok(workerText.includes(text), (what || "string") + " not found verbatim in worker.template.mjs: " + JSON.stringify(text));
}

// The first-cleanup wording (the offer notes and the customer-status hint) is no
// longer the live widget's: the owner decided it on 2026-10-08 and its single
// source is POLICY-WORDING.md in the release root. Markdown emphasis is dropped.
const policyWords = fs.readFileSync(path.join(releaseRoot, "POLICY-WORDING.md"), "utf8").replace(/\r\n/g, "\n").replace(/\*\*/g, "");
function inPolicy(text, what) {
  assert.ok(policyWords.includes(text), (what || "string") + " not found verbatim in POLICY-WORDING.md: " + JSON.stringify(text));
}
// Every dollar amount and every count of minutes in a piece of wording, sorted.
function figuresIn(text) {
  return (String(text).match(/\$\d[\d,]*(?:\.\d\d)?|\b\d+ minutes?\b/g) || []).sort();
}

test("version constants match the live widget and Worker", () => {
  assert.equal(core.VERSIONS.schemaVersion, worker.SCHEMA_VERSION);
  inWidget('schemaVersion: "' + core.VERSIONS.schemaVersion + '"', "schemaVersion");
  assert.equal(core.VERSIONS.pricingVersion, worker.PRICING_VERSION);
  assert.equal(core.VERSIONS.pricingVersion, widget.CONFIG.pricingVersion);
  assert.equal(core.VERSIONS.consentVersion, widget.CONFIG.consentVersion);
  // The Terms version label is pinned in shared/terms-version.json and the engine must say exactly that. Until the
  // switch day the pin is the live widget's own label. On the switch day set-switch-day.mjs sets a new one in both
  // places (YYYY-MM-DD-no-start-up-fee): the approved Terms are then published, and the label is meant to differ.
  assert.equal(core.VERSIONS.termsVersion, TERMS_VERSION, "the engine's Terms version label is the pinned one (shared/terms-version.json)");
  if (SWITCH_DAY === null) assert.equal(core.VERSIONS.termsVersion, widget.CONFIG.termsVersion, "before the switch day the label is the live widget's");
  else {
    assert.match(SWITCH_DAY, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(core.VERSIONS.termsVersion, SWITCH_DAY + "-no-start-up-fee", "from the switch day the label is <switch day>-no-start-up-fee");
    assert.notEqual(core.VERSIONS.termsVersion, widget.CONFIG.termsVersion, "and it is no longer the October 5 widget's label");
  }
  assert.ok(core.VERSIONS.termsVersion.length <= 80 && /^[A-Za-z0-9._-]+$/.test(core.VERSIONS.termsVersion), "a label the Worker records whole (80 characters, no blanks)");
  assert.equal(core.VERSIONS.liveUiVersion, widget.CONFIG.uiVersion);
  assert.notEqual(core.VERSIONS.uiVersion, core.VERSIONS.liveUiVersion, "the rebuild reports its own ui_version");
  assert.equal(core.CONSENT.version, core.VERSIONS.consentVersion);
  assert.equal(core.TERMS.version, core.VERSIONS.termsVersion);
});

test("brand details match the live widget", () => {
  for (const key of ["name", "phoneDisplay", "phoneHref", "privacyUrl", "termsUrl"]) {
    assert.equal(core.BRAND[key], widget.CONFIG.brand[key], key);
  }
  inWidget(core.BRAND.reviewsUrl, "reviews link");
});

test("the 53 accepted ZIPs are identical in the engine, the widget and the Worker", () => {
  assert.equal(core.SERVICE_ZIPS.length, 53);
  assert.deepEqual(plain(core.SERVICE_ZIPS), plain(widget.CONFIG.serviceZips));
  assert.deepEqual(plain(core.SERVICE_ZIPS).sort(), Array.from(worker.SERVICE_ZIPS).sort());
  assert.equal(new Set(core.SERVICE_ZIPS).size, 53, "no ZIP twice");
});

test("the ZIP-to-community table covers exactly the 53 ZIPs, once each", () => {
  const listed = core.COMMUNITIES.flatMap((community) => community.zips);
  assert.equal(listed.length, 53);
  assert.deepEqual(listed.slice().sort(), plain(core.SERVICE_ZIPS).sort());
  assert.equal(core.COMMUNITIES.length, 26, "26 communities");
  assert.deepEqual(Object.keys(core.ZIP_TO_COMMUNITY).sort(), plain(core.SERVICE_ZIPS).sort());
});

test("the ZIP-to-community table agrees with spec/cities.json and assets/map/communities.json", () => {
  const cities = JSON.parse(fs.readFileSync(path.join(releaseRoot, "spec/cities.json"), "utf8"));
  const lookup = cities.lookups.zipToCommunity;
  assert.deepEqual(Object.keys(lookup).sort(), plain(core.SERVICE_ZIPS).sort());
  for (const zip of core.SERVICE_ZIPS) {
    const mine = core.ZIP_TO_COMMUNITY[zip];
    assert.equal(mine.community, lookup[zip].community, zip + " community");
    assert.equal(mine.city, lookup[zip].mailingCity, zip + " city to pre-fill is the mailing city");
    assert.equal(mine.page, lookup[zip].page, zip + " page");
    assert.equal(mine.poBox, lookup[zip].poBox === true, zip + " PO Box flag");
    if (lookup[zip].mailingCity !== lookup[zip].community) assert.ok(mine.alternates.includes(lookup[zip].community), zip + " offers the community as an alternate");
  }
  const map = JSON.parse(fs.readFileSync(path.join(releaseRoot, "assets/map/communities.json"), "utf8"));
  for (const community of map.communities) {
    for (const zip of community.zips) assert.equal(core.ZIP_TO_COMMUNITY[zip].community, community.name, zip + " in the map data");
  }
  // The three overlaps stated in spec/CONTENT-CITIES.md section 5.
  assert.deepEqual(plain(core.cityForZip("46280").alternates), ["Carmel"]);
  assert.deepEqual(plain(core.cityForZip("46062").alternates), ["Westfield"]);
  assert.deepEqual(plain(core.cityForZip("46216")), { zip: "46216", community: "Lawrence", city: "Indianapolis", alternates: ["Lawrence"], page: "/lawrence", poBox: false });
  assert.equal(core.cityForZip("46201"), null);
});

test("frequency ids, labels, sub-lines and price tables match the widget and the Worker", () => {
  assert.deepEqual(core.FREQUENCIES.map((f) => f.id), Object.keys(widget.CONFIG.frequencies));
  assert.deepEqual(core.FREQUENCIES.map((f) => f.id), Object.keys(worker.FREQUENCIES));
  for (const frequency of core.FREQUENCIES) {
    const live = plain(widget.CONFIG.frequencies[frequency.id]);
    const server = plain(worker.FREQUENCIES[frequency.id]);
    assert.equal(frequency.label, live.label);
    assert.equal(frequency.label, server.label);
    assert.equal(frequency.sub, live.sub);
    assert.equal(frequency.popular, live.popular === true);
    assert.equal(frequency.custom, live.custom === true);
    assert.equal(frequency.custom, server.custom === true);
    if (live.prices) {
      assert.deepEqual(plain(frequency.prices), live.prices);
      assert.deepEqual(plain(frequency.prices), server.prices);
      assert.equal(frequency.maxDogs, live.maxDogs);
      assert.equal(frequency.maxDogs, server.maxDogs);
    }
    if (live.flatPrice) {
      assert.equal(frequency.flatPriceCents, live.flatPrice);
      assert.equal(frequency.flatPriceCents, server.flatPrice);
      assert.equal(core.ONE_TIME.baseCents, live.flatPrice);
    }
  }
  inWidget("MOST POPULAR");
});

test("yard sizes, areas and adders match the widget and the Worker", () => {
  assert.deepEqual(core.YARD_SIZES.map((y) => y.id), Object.keys(widget.CONFIG.yardSizes));
  for (const yard of core.YARD_SIZES) {
    const live = plain(widget.CONFIG.yardSizes[yard.id]);
    const server = plain(worker.YARD_SIZES[yard.id]);
    assert.equal(yard.label, live.label);
    assert.equal(yard.label, server.label);
    assert.equal(yard.custom, live.custom === true);
    if (!yard.custom) {
      assert.equal(yard.addCents, live.add);
      assert.equal(yard.addCents, server.add);
    }
  }
  assert.deepEqual(core.AREAS.map((a) => a.id), Object.keys(widget.CONFIG.areaLabels));
  for (const area of core.AREAS) {
    assert.equal(area.label, widget.CONFIG.areaLabels[area.id]);
    assert.equal(area.label, worker.AREA_LABELS[area.id]);
  }
  assert.deepEqual(plain(core.AREA_ADDERS_CENTS), plain(widget.CONFIG.areaAdders));
  assert.deepEqual(plain(core.AREA_ADDERS_CENTS), plain(worker.AREA_ADDERS));
  // The yard-guide table (spec section 7).
  for (const yard of core.YARD_SIZES.filter((y) => !y.custom)) {
    inWidget('["' + yard.id + '", "' + yard.label + '", "' + yard.maxSquareFeet.toLocaleString("en-US") + '"]', "yard-guide row");
  }
  assert.deepEqual(core.YARD_SIZES.map((y) => y.maxSquareFeet), [5445, 10890, 21780, 43560, null]);
});

test("dog options are 1 to 10 with the live labels", () => {
  assert.deepEqual(core.DOG_OPTIONS.map((d) => d.id), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
  assert.equal(core.DOG_OPTIONS[0].label, "1 dog");
  assert.equal(core.DOG_OPTIONS[1].label, "2 dogs");
  assert.equal(core.DOG_OPTIONS[9].label, "10+ dogs");
  inWidget('"10+ dogs"');
  assert.deepEqual(core.DOG_OPTIONS.filter((d) => d.group === "main").map((d) => d.count), [1, 2, 3, 4]);
});

test("last-cleanup and start-timing options are the exact live strings", () => {
  assert.deepEqual(plain(core.LAST_CLEANED_OPTIONS), plain(widget.LAST_CLEANED_CHOICES));
  assert.deepEqual(plain(core.LAST_CLEANED_OPTIONS), Array.from(worker.LAST_CLEANED));
  assert.ok(core.LAST_CLEANED_OPTIONS[1].includes("–"), "en dash, not a hyphen");
  assert.deepEqual(plain(core.START_TIMING_OPTIONS), Array.from(worker.START_TIMINGS));
  for (const option of core.START_TIMING_OPTIONS) inWidget('"' + option + '"', "start timing");
});

test("customer status, reply methods, intents and stages are the live values", () => {
  assert.deepEqual(core.CUSTOMER_STATUS_OPTIONS.map((o) => o.id), ["new", "returning", "not_sure"]);
  for (const option of core.CUSTOMER_STATUS_OPTIONS) inWidget('["' + option.id + '", "' + option.label + '"]', "customer status option");
  assert.deepEqual(core.CONTACT_METHODS.map((m) => m.id).sort(), Array.from(worker.PREFERRED_CONTACTS).sort());
  for (const method of core.CONTACT_METHODS) {
    inWidget('value="' + method.id + '"');
    inWidget("<span>" + method.label + "</span>", "reply method label");
    inWidget('"' + method.successWhere + '"', "success wording");
  }
  assert.deepEqual(core.INTENTS.map((i) => i.id), ["service_request", "quote_delivery", "question"]);
  for (const intent of core.INTENTS) inWidget('data-intent="' + intent.id + '">' + intent.label, "intent button");
  inWidget("Request my estimate");
  for (const stage of Object.values(core.STAGES)) {
    inWidget('"' + stage + '"', "stage");
    inWorker('"' + stage + '"', "stage");
  }
  for (const [code, label] of Object.entries(core.CUSTOM_REASON_LABELS)) inWidget(code + ': "' + label + '"', "custom reason");
});

test("the text-consent wording is the live wording, word for word", () => {
  inWidget("<strong>" + core.CONSENT.lead + "</strong> " + core.CONSENT.body, "consent wording");
  // The widget builds the alternative line from three pieces.
  inWidget('You may choose Email${allowCall ? " or Phone Call" : ""} instead of consenting to SMS. Review our Privacy Policy and Terms & Conditions.');
  const filled = (template) => template.replace("{privacy}", core.CONSENT.privacyLinkText).replace("{terms}", core.CONSENT.termsLinkText);
  assert.equal(filled(core.CONSENT.alternativeWithCall), "You may choose Email or Phone Call instead of consenting to SMS. Review our Privacy Policy and Terms & Conditions.");
  assert.equal(filled(core.CONSENT.alternativeWithoutCall), "You may choose Email instead of consenting to SMS. Review our Privacy Policy and Terms & Conditions.");
  inWidget(core.CONSENT.phoneHintService);
  inWidget(core.CONSENT.phoneHintOther);
  inWidget(core.CONSENT.errorWithCall);
  inWidget(core.CONSENT.errorWithoutCall);
  // Rendered parts: plain text and two links that go to the live policy pages.
  const parts = core.wording.consentAlternativeParts(true);
  assert.equal(parts.map((part) => part.text).join(""), filled(core.CONSENT.alternativeWithCall));
  assert.deepEqual(parts.filter((part) => part.href).map((part) => part.href), [core.BRAND.privacyUrl, core.BRAND.termsUrl]);
  assert.equal(core.wording.consentAlternativeParts(false).map((part) => part.text).join(""), filled(core.CONSENT.alternativeWithoutCall));
});

test("the terms wording is the live wording, word for word", () => {
  inWidget('I agree to the Terms of Service and acknowledge the Privacy Policy. I understand this is a request for ${oneTime ? "cleanup availability" : "service-day review"}, not a confirmed appointment.');
  const filled = (template) => template.replace("{terms}", core.TERMS.termsLinkText).replace("{privacy}", core.TERMS.privacyLinkText);
  assert.equal(filled(core.TERMS.recurring), "I agree to the Terms of Service and acknowledge the Privacy Policy. I understand this is a request for service-day review, not a confirmed appointment.");
  assert.equal(filled(core.TERMS.oneTime), "I agree to the Terms of Service and acknowledge the Privacy Policy. I understand this is a request for cleanup availability, not a confirmed appointment.");
  inWidget("By submitting, you acknowledge the Privacy Policy.");
  assert.equal(filled(core.TERMS.otherIntents), "By submitting, you acknowledge the Privacy Policy.");
  inWidget(core.TERMS.error);
  const parts = core.wording.termsParts(false);
  assert.equal(parts.map((part) => part.text).join(""), filled(core.TERMS.recurring));
  assert.deepEqual(parts.filter((part) => part.href).map((part) => part.href), [core.BRAND.termsUrl, core.BRAND.privacyUrl]);
  assert.equal(core.wording.termsParts(true).map((part) => part.text).join(""), filled(core.TERMS.oneTime));
  assert.equal(core.wording.otherIntentsParts().map((part) => part.text).join(""), filled(core.TERMS.otherIntents));
});

test("validation messages are the live messages", () => {
  for (const key of ["customerStatus", "firstName", "lastName", "phone", "email", "address", "city", "startTiming", "lastCleaned", "question"]) {
    inWidget(core.MESSAGES[key], "message " + key);
  }
  for (const message of ["Choose the number of dogs.", "Choose a service frequency.", "Choose the serviced yard size.", "Choose at least one service area.", "Choose Custom booking for yards over 1 acre.", "Choose an available service frequency for this dog count.", "Enter a valid 5-digit ZIP code."]) {
    inWidget(message);
  }
  inWidget("Choose Custom booking for yards over 1 acre");
  inWidget('"Available for up to " + definition.maxDogs + " dogs"');
});

test("out-of-area wording and the fixed promises are the live wording", () => {
  inWidget(core.OUT_OF_AREA_COPY.kicker);
  inWidget("We do not service ZIP ${escapeHtml(state.zip)} yet.");
  assert.equal(core.OUT_OF_AREA_COPY.heading, "We do not service ZIP {zip} yet.");
  inWidget(core.OUT_OF_AREA_COPY.help);
  inWidget(core.OUT_OF_AREA_COPY.edgeLead);
  inWidget("and we can check the address. We will not collect your contact details in this form for an unsupported ZIP.");
  assert.ok(core.OUT_OF_AREA_COPY.edgeBody.endsWith(core.PROMISES.outOfAreaNoContact));
  inWidget(core.PROMISES.outOfAreaNoContact);
  inWidget(core.PROMISES.nothingCharged);
  inWidget(core.PROMISES.requestNotBooking);
});

test("price wording and one-time facts are the live wording", () => {
  inWidget(core.ONE_TIME.lineItemLabel);
  inWidget(core.ONE_TIME.summary);
  inWidget(core.RECURRING_PRICE_NOTE);
  inWidget('"base price" : "per visit"');
  assert.equal(core.ONE_TIME.includedMinutes, 30);
  assert.equal(core.ONE_TIME.extraPerMinuteCents, 100);
  assert.equal(core.FROM_LINE.cents, core.FREQUENCIES.find((f) => f.id === "weekly").prices[1]);
  assert.equal(core.FROM_LINE.text, "Weekly visits from " + core.formatMoney(core.FROM_LINE.cents));
});

test("storage keys, attribution keys and the fingerprint fields match the live code", () => {
  assert.equal(core.STORAGE_KEYS.progress, widget.LOW_RISK_STORAGE_KEY);
  assert.equal(core.STORAGE_KEYS.attribution, widget.ATTRIBUTION_STORAGE_KEY);
  assert.deepEqual(plain(core.ATTRIBUTION_KEYS), plain(widget.ATTRIBUTION_KEYS));
  inWorker('const allowed = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "wbraid", "gbraid", "fbclid"];');
  inWidget('["zip", "dogCount", "frequency", "areas", "yardSize", "lastCleaned", "customerStatus"]', "the seven stored keys");
  assert.deepEqual(plain(core.PERSISTED_PLAN_KEYS), ["zip", "dogCount", "frequency", "areas", "yardSize", "lastCleaned", "customerStatus"]);
  assert.deepEqual(plain(core.FINGERPRINT_FIELDS), plain(widget.FINGERPRINT_FIELDS));
  // The Worker fingerprints its own price where the widget fingerprints the client price.
  assert.deepEqual(plain(core.FINGERPRINT_FIELDS).map((field) => (field === "clientPriceCents" ? "serverPriceCents" : field)).sort(), plain(worker.FINGERPRINT_FIELDS).sort());
});

test("save-link constants match the Worker and the widget", () => {
  assert.deepEqual(plain(core.SAVE_LINK_KEYS), plain(worker.RESUME_FIELDS));
  assert.equal(worker.RESUME_TOKEN_RE.source, "^[A-Za-z0-9_-]{43}$");
  inWidget(String(core.SAVE_LINK_PATTERN), "the accepted link form");
  inWorker('"https://quote.itspurgepros.com/#resume=" + token');
  assert.ok(core.SAVE_LINK_PATTERN.test("https://quote.itspurgepros.com/#resume=" + "A".repeat(43)));
  assert.ok(!core.SAVE_LINK_PATTERN.test("https://quote.itspurgepros.com/#resume=" + "A".repeat(42)));
  assert.ok(!core.SAVE_LINK_PATTERN.test("https://example.com/#resume=" + "A".repeat(43)));
  assert.equal(core.SAVE_LINK_TIMEOUT_MS, 12000);
  inWidget("controller.abort(); }, 12000)");
  assert.equal(core.SUBMIT_TIMEOUT_MS, 15000);
  inWidget("controller.abort(); }, 15000)");
});

test("server reply wording is the Worker's and the widget's own", () => {
  const [uncertainStart, uncertainEnd] = core.SUBMIT_MESSAGES.uncertain.split("{requestId}");
  inWorker(uncertainStart);
  inWorker(uncertainEnd);
  const [conflictStart] = core.SUBMIT_MESSAGES.conflict.split("{requestId}");
  inWorker(conflictStart);
  inWorker(core.SUBMIT_MESSAGES.unavailable);
  inWorker(core.SUBMIT_MESSAGES.invalid);
  inWidget(core.SUBMIT_MESSAGES.lockedFallback);
  inWidget(core.SUBMIT_MESSAGES.rejected);
  inWidget(core.SUBMIT_MESSAGES.sending);
  inWidget('"This is taking longer than expected. Please try again or call " + CONFIG.brand.phoneDisplay + "."');
  assert.equal(core.SUBMIT_MESSAGES.timeout, "This is taking longer than expected. Please try again or call " + core.BRAND.phoneDisplay + ".");
  inWidget('"We could not send this request. Please try again or call " + CONFIG.brand.phoneDisplay + "."');
  assert.equal(core.SUBMIT_MESSAGES.network, "We could not send this request. Please try again or call " + core.BRAND.phoneDisplay + ".");
});

test("save-link and resume messages are the live messages", () => {
  for (const key of ["idle", "working", "created", "copied", "copyManually", "timeout", "badLink", "fallback"]) inWidget(core.SAVE_LINK_MESSAGES[key], "save-link message " + key);
  for (const key of ["rateLimited", "unavailable", "rejected"]) inWorker(core.SAVE_LINK_MESSAGES[key], "save-link message " + key);
  for (const key of ["loadingTitle", "loadingDetail", "invalidToken", "localCheckFailed", "priceMismatch", "timeout", "fallback"]) inWidget(core.RESUME_MESSAGES[key], "resume message " + key);
  // "ready" and "pricingChanged" are the live sentences with one approved change (2026-10-09): "offer" became "first-cleanup terms",
  // because the policy wording keeps the word "offer" off everything a visitor reads. Everything else in them is the live text.
  for (const key of ["ready", "pricingChanged"]) {
    assert.ok(!/offer/i.test(core.RESUME_MESSAGES[key]), "resume message " + key + " must not say offer");
    inWidget(core.RESUME_MESSAGES[key].replace("first-cleanup terms", "offer"), "resume message " + key + " (live sentence apart from the approved word)");
  }
  for (const key of ["expired", "planUnavailable"]) inWorker(core.RESUME_MESSAGES[key], "resume message " + key);
});

test("the Google Ads label and allowed origins match the Worker source", () => {
  inWorker('var GOOGLE_ADS_SEND_TO = "' + core.LIVE_GOOGLE_ADS_SEND_TO + '";');
  for (const origin of plain(worker.DEFAULT_ALLOWED_ORIGINS)) assert.ok(core.LIVE_ALLOWED_ORIGINS.includes(origin), origin);
  assert.ok(core.LIVE_ALLOWED_ORIGINS.every((origin) => origin.startsWith("https://")));
});

test("request-form labels, hints and limits are the live ones", () => {
  const blank = { dogCount: "", frequency: "", yardSize: "", areas: [], preferredContact: "text" };
  const service = core.testing.fieldRules(blank, "service_request");
  const byKey = Object.fromEntries(service.map((rule) => [rule.key, rule]));
  for (const key of ["customerStatus", "firstName", "lastName", "address", "city", "startTiming", "lastCleaned", "preferredContact"]) {
    inWidget(">" + byKey[key].label + "<", "label " + key);
  }
  inWidget("Phone number");
  inWidget("Your question");
  // The customer-status hint is the 2026-10-08 wording, not the live widget's (see the offer-note test below).
  inPolicy(byKey.customerStatus.hint, "customer-status hint");
  inWidget(byKey.lastCleaned.hint);
  inWidget(">" + byKey.startTiming.emptyOptionLabel + "<");
  inWidget(">" + byKey.lastCleaned.emptyOptionLabel + "<");
  inWidget('placeholder="' + byKey.phone.placeholder + '"');
  inWidget('placeholder="' + byKey.email.placeholder + '"');
  inWidget('placeholder="' + byKey.zip.placeholder + '"');
  inWidget('autocomplete="given-name" maxlength="' + core.FIELD_MAX_LENGTH.firstName + '"');
  inWidget('autocomplete="family-name" maxlength="' + core.FIELD_MAX_LENGTH.lastName + '"');
  inWidget('autocomplete="address-line1" maxlength="' + core.FIELD_MAX_LENGTH.address + '"');
  inWidget('autocomplete="address-level2" maxlength="' + core.FIELD_MAX_LENGTH.city + '"');
  inWidget('autocomplete="email" maxlength="' + core.FIELD_MAX_LENGTH.email + '"');
  inWidget('maxlength="' + core.FIELD_MAX_LENGTH.question + '"');
});

test("the offer notes and the customer-status hint are the 2026-10-08 wording in POLICY-WORDING.md, with the live widget's numbers", () => {
  // What the live widget still says today. These sentences are no longer copied; their figures are.
  const live = {
    oneTime: "The new recurring-customer offer does not apply. The $89.99 base deposit is charged when we are on the way and your ETA text goes out. Additional time beyond 30 minutes is billed after cleanup at $1 per minute.",
    restartFirst: ". For your restart, that rate includes up to 30 minutes of cleanup. Only additional time beyond 30 minutes is billed afterward at $1 per minute.",
    restartSecond: "We confirm your account rate and these terms before you approve service. The base is charged when your on-the-way ETA text goes out. Following regular maintenance visits stay at the agreed rate regardless of time spent. Introductory offers do not repeat; uncertain history receives team review."
  };
  inWidget("for the first 30 minutes.</strong>");
  inWidget(live.oneTime);
  inWidget(live.restartFirst);
  inWidget(live.restartSecond);

  // A plan answered in the order the flow asks, then the one change that picks the note.
  const planned = (changes) => {
    const store = core.create();
    store.set({ dogCount: "2" });
    store.set({ zip: "46032" });
    store.set({ yardSize: "m" });
    store.set({ areas: ["back", "front"] });
    store.set({ frequency: "weekly" });
    store.set(changes);
    return store;
  };
  const note = (changes) => planned(changes).offerNote();
  const fresh = note({ customerStatus: "new" });
  const restart = note({ customerStatus: "returning" });
  const restartNoPrice = note({ customerStatus: "not_sure", frequency: "" });
  const oneTime = note({ frequency: "onetime" });
  const custom = note({ frequency: "custom" });
  assert.deepEqual([fresh.kind, restart.kind, restartNoPrice.kind, oneTime.kind, custom.kind], ["new_recurring", "restart", "restart", "one_time", "custom_review"]);

  // Every title and sentence the engine returns is in the single source, word for word.
  inPolicy('Title: "' + fresh.title + '"', "new-recurring title");
  assert.equal(fresh.paragraphs.length, 3);
  fresh.paragraphs.forEach((paragraph, index) => inPolicy("  " + (index + 1) + ". " + paragraph + "\n", "new-recurring paragraph " + (index + 1)));
  inPolicy('Title: "' + restart.title + '"', "restart title");
  const price = core.formatMoney(planned({ customerStatus: "returning" }).quote().priceCents);
  assert.equal(price, "$28.99");
  assert.ok(restart.paragraphs[0].startsWith("Your quoted maintenance rate is " + price + " per visit. "), "the restart note quotes the plan's own price");
  inPolicy("  1. " + restart.paragraphs[0].replace(price, "{price}") + " (When no price is known yet", "restart paragraph 1");
  inPolicy("  2. " + restart.paragraphs[1] + "\n", "restart paragraph 2");
  inPolicy('(When no price is known yet: "Your quoted maintenance rate comes next. …")', "restart paragraph 1 before the price exists");
  assert.ok(restartNoPrice.paragraphs[0].startsWith("Your quoted maintenance rate comes next. "), "before the price exists");
  assert.equal(restartNoPrice.paragraphs[0].replace("Your quoted maintenance rate comes next.", ""), restart.paragraphs[0].replace("Your quoted maintenance rate is " + price + " per visit.", ""), "the rest of the sentence is the same with or without a price");
  assert.equal(restartNoPrice.paragraphs[1], restart.paragraphs[1]);
  inPolicy('Title unchanged ("' + oneTime.title + '")', "one-time title, unchanged");
  inPolicy("Paragraph: " + oneTime.paragraphs[0] + "\n", "one-time paragraph");
  inPolicy('Title: "' + custom.title + '"', "custom-review title");
  inPolicy("Paragraph: " + custom.paragraphs[0] + "\n", "custom-review paragraph");

  // The numbers did not move: the same dollar amounts and minutes as the live sentences, and the same charging moment.
  assert.deepEqual(figuresIn(oneTime.paragraphs[0]), figuresIn(live.oneTime), "one-time figures");
  assert.deepEqual(figuresIn(oneTime.paragraphs[0]), ["$1", "$89.99", "30 minutes"]);
  assert.deepEqual(figuresIn(restart.paragraphs[0].replace(price, "")), figuresIn(live.restartFirst), "restart figures");
  assert.deepEqual(figuresIn(restart.paragraphs[0].replace(price, "")), ["$1", "30 minutes", "30 minutes"]);
  assert.deepEqual(figuresIn(restart.paragraphs[1]), figuresIn(live.restartSecond), "the second restart paragraph carries no figure");
  assert.match(live.oneTime, /charged when we are on the way and your ETA text goes out/);
  assert.match(oneTime.paragraphs[0], /charged when we text that we are on the way/);
  assert.match(live.restartSecond, /charged when your on-the-way ETA text goes out/);
  assert.match(restart.paragraphs[1], /charged when your on-the-way text goes out/);
  assert.equal(custom.paragraphs[0].endsWith("Nothing is charged by this form."), true);
  inWidget("Nothing is charged by this form.");
});

test("formatting helpers behave like the live ones", () => {
  assert.equal(core.formatMoney(2899), "$28.99");
  assert.equal(core.formatMoney(8999), "$89.99");
  assert.equal(core.formatMoney(0), "$0.00");
  assert.equal(core.formatMoney(250), "$2.50");
  assert.equal(core.formatMoney(123456), "$1,234.56");
  assert.equal(core.formatMoney(-500), "-$5.00");
  assert.equal(core.formatMoney("abc"), "");
  for (const cents of [0, 5, 1599, 2899, 8999, 100000, 123456789]) {
    assert.equal(core.formatMoney(cents), new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100), String(cents));
  }
  assert.equal(core.formatDollars(2899), "28.99");
  assert.equal(core.normalizeZip(" 46032-1234 "), "46032");
  assert.equal(core.normalizeZip(null), "");
  assert.deepEqual(core.normalizePhone("(317) 555-0100"), { digits: "3175550100", e164: "+13175550100" });
  assert.deepEqual(core.normalizePhone("1 317 555 0100"), { digits: "3175550100", e164: "+13175550100" });
  assert.equal(core.normalizePhone("555-0100"), null);
  assert.equal(core.normalizePhone("23175550100"), null);
  assert.equal(core.formatPhone("3175550100"), "(317) 555-0100");
  assert.equal(core.formatPhone("31755"), "(317) 55");
  assert.equal(core.formatPhone("317"), "317");
  assert.equal(core.formatPhone("13175550100"), "(317) 555-0100");
  assert.equal(core.isValidEmail("test@example.com"), true);
  assert.equal(core.isValidEmail(" test@example.com "), true);
  assert.equal(core.isValidEmail("test@example"), false);
  assert.equal(core.isValidEmail("a b@example.com"), false);
  assert.equal(core.isValidEmail("a".repeat(250) + "@example.com"), false, "longer than 254 characters");
  // The same phone and email decisions as the Worker.
  for (const phone of ["3175550100", "(317) 555-0100", "13175550100", "555", "", "317555010012"]) {
    assert.equal(Boolean(core.normalizePhone(phone)), Boolean(worker.normalizePhone(phone)), "phone " + phone);
  }
  for (const email of ["test@example.com", "bad", "a@b", "a@b.c", "two words@example.com", "x".repeat(250) + "@example.com"]) {
    assert.equal(core.isValidEmail(email), worker.validEmail(email), "email " + email);
  }
});

test("the public constants cannot be changed by page code", () => {
  assert.throws(() => { core.SERVICE_ZIPS.push("99999"); });
  assert.throws(() => { core.FREQUENCIES[1].prices[1] = 1; });
  assert.throws(() => { core.CONSENT.body = "something else"; });
  assert.throws(() => { core.VERSIONS.pricingVersion = "x"; });
});
