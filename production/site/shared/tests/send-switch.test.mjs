// The send switch (engine 1.5.0): window.PPSite -> siteOptions() -> create().
// live, staging and demo; what a page may and may not decide; staging calls no
// tag and never reaches a production address; saved links in each mode.
// Every request here goes to a stand-in fetch. Nothing leaves this process.
import test from "node:test";
import assert from "node:assert/strict";
import { core, makeStore, fillPlan, fillDetails } from "./helpers/make-store.mjs";
import { worker } from "./helpers/live-source.mjs";

// What the interface (js/builder.js) hands siteOptions: the production request addresses.
const PRODUCTION = "https://purge-lead-relay.purgepros.workers.dev/submit";
const TRUSTED = { liveEndpoints: [PRODUCTION, "https://quote.itspurgepros.com/submit"] };
// Made-up staging addresses (.invalid can never resolve).
const STAGING_ENDPOINT = "https://quote-staging.purgepros-test.invalid/submit";
const STAGING_PAGE = "https://staging-pages.purgepros-test.invalid/quote";
const STAGING_ORIGIN = "https://staging-pages.purgepros-test.invalid";
const TOKEN = "S".repeat(43);

const LIVE_PAYLOAD_KEYS = [
  "schemaVersion", "requestId", "eventId", "stage", "intent", "zip", "dogs", "frequency", "frequencyId", "areas", "areaIds",
  "yardSize", "yardSizeId", "lastCleaned", "customerStatus", "startTiming", "perVisitPrice", "clientPriceCents",
  "pricingVersion", "customEstimate", "customReasons", "phone", "phoneE164", "firstName", "lastName", "email", "street",
  "city", "state", "preferredContact", "smsTransactionalConsent", "consent", "consentVersion", "smsConsentCapturedAt",
  "termsAccepted", "termsVersion", "termsAcceptedAt", "question", "notes", "page", "attribution", "gclid", "fbclid",
  "fbp", "fbc", "submittedAt", "website"
];

function reply(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

// A store made the way builder.js makes one: its own options, then siteOptions(PPSite).
function siteStore(site, pageUrl, fetchImpl) {
  const calls = [];
  const tags = { gtag: [], dataLayer: [], fbq: [] };
  const options = Object.assign({ frequencyLabels: { twice: "Twice a week", custom: "Custom quote" }, presentation: "inline" }, core.siteOptions(site, TRUSTED), {
    sinks: { gtag: (...args) => tags.gtag.push(args), dataLayer: tags.dataLayer, fbq: (...args) => tags.fbq.push(args) },
    fetch: (url, init) => { calls.push({ url, init }); return (fetchImpl || (async () => reply(202, { accepted: true })))(url, init, calls.length); }
  });
  const made = makeStore({ url: pageUrl, options });
  made.calls = calls;
  made.tags = tags;
  return made;
}
function ready(made) {
  fillPlan(made.store);
  fillDetails(made.store, "service_request", "text");
  return made;
}
const tagCalls = (made) => made.tags.gtag.length + made.tags.dataLayer.length + made.tags.fbq.length;

test("the contract has 47 keys and none of them marks a test request", () => {
  assert.equal(LIVE_PAYLOAD_KEYS.length, 47);
  assert.equal(LIVE_PAYLOAD_KEYS.some((key) => /test|staging|sandbox|env|mode/i.test(key)), false, "no key is meant for marking a staging request");
});

test("siteOptions: no PPSite, demo, or anything unknown is demo, with nothing added", () => {
  for (const site of [undefined, null, {}, "live", 7, [], { mode: "demo" }, { mode: "LIVE" }, { mode: "production" }, { mode: "" }, { env: "production", endpoint: PRODUCTION }]) {
    assert.deepEqual(core.siteOptions(site, TRUSTED), {}, JSON.stringify(site));
  }
  // A store made from it is today's review build.
  const made = siteStore(undefined, "file:///G:/review/home.html");
  assert.equal(made.store.mode, "demo");
  assert.equal(made.store.isDemo, true);
  assert.equal(made.store.isStaging, false);
  assert.equal(made.store.endpoint, "");
});

test("siteOptions live: the address is a trusted one, whatever the page claims", () => {
  assert.deepEqual(core.siteOptions({ mode: "live" }, TRUSTED), { mode: "live", endpoint: PRODUCTION });
  assert.deepEqual(core.siteOptions({ mode: "live", endpoint: PRODUCTION }, TRUSTED), { mode: "live", endpoint: PRODUCTION });
  assert.deepEqual(core.siteOptions({ mode: "live", endpoint: "https://quote.itspurgepros.com/submit" }, TRUSTED), { mode: "live", endpoint: "https://quote.itspurgepros.com/submit" });
  // Another address, extra origins, a saved-link base, demo switches: all ignored.
  const claimed = core.siteOptions({
    mode: "live", endpoint: "https://collector.example.invalid/submit", allowedOrigins: ["https://collector.example.invalid"],
    savedLinkBase: "https://collector.example.invalid/q", allowDemoOnLiveOrigin: true, demo: { submit: "success" }, productionEndpoints: []
  }, TRUSTED);
  assert.deepEqual(claimed, { mode: "live", endpoint: PRODUCTION });
  // Without a trusted address there is no live mode at all.
  assert.deepEqual(core.siteOptions({ mode: "live", endpoint: PRODUCTION }), {});
  assert.deepEqual(core.siteOptions({ mode: "live", endpoint: PRODUCTION }, { liveEndpoints: ["http://x.invalid/submit", "nonsense"] }), {});
});

test("siteOptions: the conversion label and the pixel switch come from the page, well-formed or not at all", () => {
  assert.equal(core.LIVE_GOOGLE_ADS_SEND_TO, "AW-17767139897/g9smCM7pkL4cELmUhJhC");
  assert.equal("googleAdsSendTo" in core.siteOptions({ mode: "live" }, TRUSTED), false, "not given: the engine's default stands");
  assert.equal(core.siteOptions({ mode: "live", googleAdsSendTo: "AW-17767139897/g9smCM7pkL4cELmUhJhC" }, TRUSTED).googleAdsSendTo, "AW-17767139897/g9smCM7pkL4cELmUhJhC");
  assert.equal(core.siteOptions({ mode: "live", googleAdsSendTo: "AW-1234567890/AbC_dEf-123" }, TRUSTED).googleAdsSendTo, "AW-1234567890/AbC_dEf-123");
  assert.equal(core.siteOptions({ mode: "live", googleAdsSendTo: "" }, TRUSTED).googleAdsSendTo, "", "an empty label switches the conversion off");
  for (const bad of ["G-ABC123", "AW-1/x", "javascript:alert(1)", 5, null, { a: 1 }, "AW-17767139897/g9smCM7pkL4cELmUhJhC extra"]) {
    assert.equal("googleAdsSendTo" in core.siteOptions({ mode: "live", googleAdsSendTo: bad }, TRUSTED), false, String(bad));
  }
  assert.equal(core.siteOptions({ mode: "live", firePixelEvents: false }, TRUSTED).firePixelEvents, false);
  assert.equal("firePixelEvents" in core.siteOptions({ mode: "live", firePixelEvents: true }, TRUSTED), false);
  assert.equal("firePixelEvents" in core.siteOptions({ mode: "live", firePixelEvents: "false" }, TRUSTED), false);
});

test("siteOptions staging: the page's address, the live origins plus the page's own https origins, the link base", () => {
  const options = core.siteOptions({
    mode: "staging", endpoint: " " + STAGING_ENDPOINT + " ",
    allowedOrigins: [STAGING_ORIGIN + "/", "http://plain.invalid", "https://user@bad.invalid", "ftp://x.invalid", 5, STAGING_ORIGIN, "https://Other.Invalid"],
    savedLinkBase: STAGING_PAGE, firePixelEvents: false
  }, TRUSTED);
  assert.deepEqual(options, {
    mode: "staging", firePixelEvents: false, endpoint: STAGING_ENDPOINT, productionEndpoints: TRUSTED.liveEndpoints,
    allowedOrigins: core.LIVE_ALLOWED_ORIGINS.concat([STAGING_ORIGIN, "https://other.invalid"]), savedLinkBase: STAGING_PAGE
  });
  assert.equal(core.LIVE_ALLOWED_ORIGINS.length, 4, "the engine's own list was not touched");
});

test("live on a made-up page origin refuses: nothing is sent, no tag is called", async () => {
  for (const page of ["https://collector.example.invalid/quote", "https://itspurgepros.com.example.invalid/", "http://itspurgepros.com/", "file:///G:/review/quote.html", STAGING_PAGE]) {
    const made = ready(siteStore({ mode: "live", endpoint: PRODUCTION, allowedOrigins: [new URL(page).origin] }, page));
    assert.equal(made.store.mode, "live");
    assert.notEqual(made.store.sendingBlockedReason(), "", page);
    const result = await made.store.submit();
    assert.equal(result.ok, false, page);
    assert.equal(result.status, "blocked", page);
    assert.equal((await made.store.createSaveLink()).status, "blocked", page);
    assert.equal((await made.store.resume(TOKEN)).status, "blocked", page);
    assert.equal(made.calls.length, 0, "no request from " + page);
    assert.equal(made.store.networkLog.length, 0);
    assert.equal(tagCalls(made), 0, "no tag from " + page);
  }
});

test("live on the real origin posts once to the production address with exactly the 47 keys", async () => {
  for (const page of ["https://itspurgepros.com/carmel?utm_source=test", "https://www.itspurgepros.com/quote", "https://blog.itspurgepros.com/post/x"]) {
    const made = ready(siteStore({ mode: "live", endpoint: "https://collector.example.invalid/submit" }, page, async (url, init) => reply(202, { accepted: true, requestId: JSON.parse(init.body).requestId })));
    assert.equal(made.store.sendingBlockedReason(), "");
    assert.equal(made.store.endpoint, PRODUCTION);
    const [first, second] = await Promise.all([made.store.submit(), made.store.submit()]);   // a double press
    assert.equal(first.ok, true);
    assert.equal(second.status, "busy");
    assert.equal(made.calls.length, 1, "one request");
    assert.equal(made.calls[0].url, PRODUCTION);
    assert.equal(made.calls[0].init.method, "POST");
    assert.equal(made.calls[0].init.credentials, "omit");
    const body = JSON.parse(made.calls[0].init.body);
    assert.deepEqual(Object.keys(body), LIVE_PAYLOAD_KEYS);
    assert.equal(body.schemaVersion, "cloudflare-widget.v3");
    assert.equal(worker.validateV3(body).ok, true, "the Worker's own check accepts it");
    assert.equal((await made.store.submit()).status, "busy", "and nothing more after it is done");
    assert.equal(made.calls.length, 1);
    // Live calls the real tags: the conversion went out once, with the public label.
    const conversions = made.tags.gtag.filter((call) => call[1] === "conversion");
    assert.equal(conversions.length, 1);
    assert.equal(conversions[0][2].send_to, "AW-17767139897/g9smCM7pkL4cELmUhJhC");
    assert.equal(made.tags.fbq.filter((call) => call[1] === "Lead").length, 1);
  }
});

test("staging posts only to the staging address, only from an allowed origin, and calls no tag", async () => {
  const site = { mode: "staging", endpoint: STAGING_ENDPOINT, allowedOrigins: [STAGING_ORIGIN], firePixelEvents: true, googleAdsSendTo: "AW-17767139897/g9smCM7pkL4cELmUhJhC" };
  // From its own page and from the real site's addresses (a hidden test page there).
  for (const page of [STAGING_PAGE + "?utm_source=stage", "https://itspurgepros.com/staging-quote"]) {
    const made = ready(siteStore(site, page, async (url, init) => reply(202, { accepted: true, requestId: JSON.parse(init.body).requestId })));
    assert.equal(made.store.mode, "staging");
    assert.equal(made.store.isStaging, true);
    assert.equal(made.store.isDemo, false);
    assert.equal(made.store.sendingBlockedReason(), "");
    made.store.trackUi("contact_click", { method: "text", placement: "hero" });
    const [first, second] = await Promise.all([made.store.submit(), made.store.submit()]);
    assert.equal(first.ok, true, page);
    assert.equal(first.demo, false);
    assert.equal(second.status, "busy");
    assert.equal(made.calls.length, 1);
    assert.equal(made.calls[0].url, STAGING_ENDPOINT);
    const body = JSON.parse(made.calls[0].init.body);
    assert.deepEqual(Object.keys(body), LIVE_PAYLOAD_KEYS, "the same 47 keys, no marker key added");
    assert.equal(worker.validateV3(body).ok, true);
    assert.equal(body.page.indexOf(new URL(page).origin), 0, "the page address is the request's own record of where it came from");
    assert.equal(tagCalls(made), 0, "no gtag, no dataLayer push, no fbq");
    // What a live page would have sent is in the log, marked not sent.
    const names = made.store.trackLog.map((entry) => entry.event);
    for (const name of ["funnel_viewed", "generate_lead", "conversion", "Lead", "contact_click"]) assert.ok(names.includes(name), name + " is logged");
    assert.ok(made.store.trackLog.every((entry) => entry.sent === false));
    assert.deepEqual(made.store.submissionLog.map((entry) => entry.outcome), ["staging"]);
    assert.equal("payload" in made.store.submissionLog[0], false, "no second copy of contact details");
  }
  // Not from anywhere else.
  for (const page of ["https://collector.example.invalid/quote", "http://staging-pages.purgepros-test.invalid/quote", "file:///G:/review/quote.html"]) {
    const made = ready(siteStore(site, page));
    const result = await made.store.submit();
    assert.equal(result.status, "blocked", page);
    assert.equal(made.calls.length, 0);
    assert.equal(tagCalls(made), 0);
  }
});

test("staging refuses a production address, by host, however it is written", async () => {
  for (const endpoint of [PRODUCTION, "https://quote.itspurgepros.com/submit", "https://QUOTE.itspurgepros.com/submit", "https://itspurgepros.com/submit", "https://purge-quote.purgepros.workers.dev/submit"]) {
    const made = ready(siteStore({ mode: "staging", endpoint, allowedOrigins: [STAGING_ORIGIN] }, STAGING_PAGE));
    assert.match(made.store.sendingBlockedReason(), /production endpoint/, endpoint);
    assert.equal((await made.store.submit()).status, "blocked", endpoint);
    assert.equal((await made.store.createSaveLink()).status, "blocked", endpoint);
    assert.equal(made.calls.length, 0, endpoint);
  }
  // No address, or a malformed one: blocked as well.
  for (const endpoint of [undefined, "", "https://quote-staging.purgepros-test.invalid/", "http://quote-staging.purgepros-test.invalid/submit"]) {
    const made = ready(siteStore({ mode: "staging", endpoint, allowedOrigins: [STAGING_ORIGIN] }, STAGING_PAGE));
    assert.equal((await made.store.submit()).status, "blocked", String(endpoint));
    assert.equal(made.calls.length, 0);
  }
});

test("demo sends nothing, and a double press records one request", async () => {
  const made = ready(siteStore({ mode: "demo", endpoint: STAGING_ENDPOINT }, "file:///G:/review/home.html"));
  const [first, second] = await Promise.all([made.store.submit(), made.store.submit()]);
  assert.equal(first.ok, true);
  assert.equal(first.demo, true);
  assert.equal(second.status, "busy");
  assert.equal(made.calls.length, 0);
  assert.equal(made.store.networkLog.length, 0);
  assert.equal(made.store.submissionLog.length, 1);
  assert.equal(tagCalls(made), 0);
});

// The Worker's replies for a save and for an open, for a plan the store holds.
function linkWorker(linkFor) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    if (/\/quote-resume$/.test(url)) return reply(201, { ok: true, url: linkFor(TOKEN), expiresAt: Date.parse("2026-10-14T15:00:00.000Z") });
    if (/\/quote-resume\/open$/.test(url)) {
      assert.deepEqual(body, { token: TOKEN });
      const plan = { zip: "46032", dogs: 2, frequencyId: "weekly", yardSizeId: "m", areaIds: ["back", "front"], customerStatus: "not_sure" };
      return reply(200, { ok: true, plan, quote: { custom: false, priceCents: 2899, pricingVersion: core.VERSIONS.pricingVersion }, pricingChanged: false, expiresAt: Date.parse("2026-10-14T15:00:00.000Z") });
    }
    throw new Error("unexpected " + url);
  };
}

test("saved link in staging: made and opened against the staging address, on the staging page's own link", async () => {
  const site = { mode: "staging", endpoint: STAGING_ENDPOINT, allowedOrigins: [STAGING_ORIGIN], savedLinkBase: STAGING_PAGE };
  const made = siteStore(site, STAGING_PAGE, linkWorker((token) => STAGING_PAGE + "#resume=" + token));
  fillPlan(made.store);
  const saved = await made.store.createSaveLink();
  assert.equal(saved.ok, true);
  assert.equal(saved.url, STAGING_PAGE + "#resume=" + TOKEN);
  assert.equal(made.calls[0].url, STAGING_ENDPOINT.replace(/\/submit$/, "/quote-resume"));
  assert.deepEqual(Object.keys(JSON.parse(made.calls[0].init.body)), ["zip", "dogs", "frequencyId", "yardSizeId", "areaIds", "customerStatus"]);
  // Opening it on the staging page.
  const opener = siteStore(site, STAGING_PAGE, linkWorker((token) => STAGING_PAGE + "#resume=" + token));
  const opened = await opener.store.resume(TOKEN);
  assert.equal(opened.ok, true);
  assert.equal(opener.calls[0].url, STAGING_ENDPOINT.replace(/\/submit$/, "/quote-resume/open"));
  assert.equal(opener.store.getState().step, "price");
  assert.equal(opener.store.quote().priceCents, 2899);
  assert.equal(tagCalls(made) + tagCalls(opener), 0);
  // The production form is accepted in staging too (a staging Worker with no link base set answers it).
  const plain = siteStore(site, STAGING_PAGE, linkWorker((token) => "https://quote.itspurgepros.com/#resume=" + token));
  fillPlan(plain.store);
  assert.equal((await plain.store.createSaveLink()).ok, true);
  // Any other address is refused as a bad link, also in staging.
  for (const link of ["https://collector.example.invalid/quote#resume=" + TOKEN, STAGING_PAGE + "?x=1#resume=" + TOKEN, STAGING_PAGE + "#resume=short", STAGING_ORIGIN + "/other#resume=" + TOKEN, STAGING_PAGE + "#resume=" + TOKEN + "x"]) {
    const bad = siteStore(site, STAGING_PAGE, linkWorker(() => link));
    fillPlan(bad.store);
    assert.equal((await bad.store.createSaveLink()).status, "bad_link", link);
  }
  // A base on an origin the page may not send from is not honoured.
  const foreign = siteStore(Object.assign({}, site, { savedLinkBase: "https://collector.example.invalid/quote" }), STAGING_PAGE, linkWorker((token) => "https://collector.example.invalid/quote#resume=" + token));
  fillPlan(foreign.store);
  assert.equal((await foreign.store.createSaveLink()).status, "bad_link");
});

test("saved link in live: made and opened against the production address; the production form only", async () => {
  const page = "https://itspurgepros.com/quote";
  const made = siteStore({ mode: "live", savedLinkBase: page }, page, linkWorker((token) => "https://quote.itspurgepros.com/#resume=" + token));
  fillPlan(made.store);
  const saved = await made.store.createSaveLink();
  assert.equal(saved.ok, true);
  assert.equal(saved.url, "https://quote.itspurgepros.com/#resume=" + TOKEN);
  assert.match(saved.url, core.SAVE_LINK_PATTERN);
  assert.equal(made.calls[0].url, PRODUCTION.replace(/\/submit$/, "/quote-resume"));
  const opener = siteStore({ mode: "live" }, page, linkWorker((token) => "https://quote.itspurgepros.com/#resume=" + token));
  const opened = await opener.store.resume(TOKEN);
  assert.equal(opened.ok, true);
  assert.equal(opener.calls[0].url, PRODUCTION.replace(/\/submit$/, "/quote-resume/open"));
  assert.equal(opener.store.getState().step, "price");
  // Live never accepts a link on the page's own address, even when the page names it as a base
  // (directly in create() as well: savedLinkBase is a staging-only option).
  for (const options of [core.siteOptions({ mode: "live", savedLinkBase: page }, TRUSTED), { mode: "live", endpoint: PRODUCTION, savedLinkBase: page }]) {
    const calls = [];
    const direct = makeStore({ url: page, options: Object.assign({}, options, { fetch: (url, init) => { calls.push(url); return linkWorker((token) => page + "#resume=" + token)(url, init); } }) });
    fillPlan(direct.store);
    assert.equal((await direct.store.createSaveLink()).status, "bad_link");
    assert.equal(calls.length, 1);
  }
});

test("create() itself: staging calls no tag even when handed live tracking settings and working sinks", async () => {
  const tags = [];
  const { store } = makeStore({
    url: STAGING_PAGE,
    options: {
      mode: "staging", endpoint: STAGING_ENDPOINT, allowedOrigins: [STAGING_ORIGIN], firePixelEvents: true, googleAdsSendTo: "AW-17767139897/g9smCM7pkL4cELmUhJhC",
      sinks: { gtag: (...args) => tags.push(args), dataLayer: tags, fbq: (...args) => tags.push(args) },
      fetch: async () => reply(202, { accepted: true })
    }
  });
  fillPlan(store);
  fillDetails(store, "quote_delivery", "text");
  assert.equal((await store.submit()).ok, true);
  store.reset();
  fillPlan(store);
  fillDetails(store, "service_request", "text");
  assert.equal((await store.submit()).ok, true);
  assert.equal(tags.length, 0);
  assert.ok(store.trackLog.length > 5);
  assert.ok(store.trackLog.every((entry) => entry.sent === false && entry.demo === false));
});

// VERIFY-sending finding 1 (2026-10-10): two spellings of the production host
// got past the guard, because it compared host text: ":443" and a trailing dot.
// A browser resolves both to the production Worker. Since engine 1.5.2 staging
// refuses every address that is not a plain host name, and the production check
// itself ignores a port, a user name and trailing dots.
test("staging refuses every other spelling of a production host: a port, a trailing dot, a user name, an encoded dot, a backslash", async () => {
  const hosts = ["purge-lead-relay.purgepros.workers.dev", "quote.itspurgepros.com", "itspurgepros.com", "www.itspurgepros.com", "purge-quote.purgepros.workers.dev"];
  const spellings = (host) => [
    "https://" + host + ":443/submit", "https://" + host + "./submit", "https://" + host + ".:443/submit", "https://" + host + "../submit",
    "https://" + host.toUpperCase() + ":443/submit", "https://" + host.toUpperCase() + "./submit", "https://user@" + host + "/submit",
    "https://user:pass@" + host + ":443/submit", "https://" + host + "%2e/submit", "https://" + host + "%2E/submit", "https://" + host + ":/submit",
    "https://" + host + "\\/submit", "https://" + host + "\\x/submit", "https://" + host + "\t/submit", "https://" + host + " /submit", "https://" + host + ":0443/submit"
  ];
  for (const host of hosts) {
    for (const endpoint of spellings(host)) {
      // on the staging page, and on a real site origin (which a staging page may run on)
      for (const page of [STAGING_PAGE, "https://itspurgepros.com/quote"]) {
        const made = ready(siteStore({ mode: "staging", endpoint, allowedOrigins: [STAGING_ORIGIN] }, page));
        assert.notEqual(made.store.sendingBlockedReason(), "", JSON.stringify(endpoint) + " on " + page);
        assert.equal((await made.store.submit()).status, "blocked", JSON.stringify(endpoint));
        assert.equal((await made.store.createSaveLink()).status, "blocked", JSON.stringify(endpoint));
        assert.equal(made.calls.length, 0, JSON.stringify(endpoint));
        assert.equal(tagCalls(made), 0, JSON.stringify(endpoint));
      }
    }
  }
  // The same rule keeps a staging host with a port or a trailing dot out too: one plain spelling only.
  for (const endpoint of ["https://quote-staging.purgepros-test.invalid:8443/submit", "https://quote-staging.purgepros-test.invalid./submit", "https://.quote-staging.purgepros-test.invalid/submit"]) {
    const made = ready(siteStore({ mode: "staging", endpoint, allowedOrigins: [STAGING_ORIGIN] }, STAGING_PAGE));
    assert.equal((await made.store.submit()).status, "blocked", endpoint);
    assert.equal(made.calls.length, 0, endpoint);
  }
  // And the plain staging address still sends, once, to itself.
  const fine = ready(siteStore({ mode: "staging", endpoint: STAGING_ENDPOINT, allowedOrigins: [STAGING_ORIGIN] }, STAGING_PAGE));
  assert.equal(fine.store.sendingBlockedReason(), "");
  assert.equal((await fine.store.submit()).ok, true);
  assert.deepEqual(fine.calls.map((call) => call.url), [STAGING_ENDPOINT]);
});

test("create() itself: a production host with a port or a trailing dot is a production endpoint in staging", () => {
  for (const endpoint of ["https://quote.itspurgepros.com:443/submit", "https://quote.itspurgepros.com./submit", "https://ITSPURGEPROS.com.:443/submit", "https://x@blog.itspurgepros.com/submit"]) {
    const made = makeStore({ url: STAGING_PAGE, options: { mode: "staging", endpoint, allowedOrigins: [STAGING_ORIGIN], fetch: async () => { throw new Error("must not be called"); } } });
    assert.notEqual(made.store.sendingBlockedReason(), "", endpoint);
  }
});

test("live mode is unchanged by the staging rule: the trusted address only, whatever the page writes", async () => {
  for (const endpoint of [PRODUCTION + ":443", "https://purge-lead-relay.purgepros.workers.dev:443/submit", "https://purge-lead-relay.purgepros.workers.dev./submit", undefined]) {
    const made = ready(siteStore({ mode: "live", endpoint }, "https://itspurgepros.com/quote"));
    assert.equal((await made.store.submit()).ok, true, String(endpoint));
    assert.deepEqual(made.calls.map((call) => call.url), [PRODUCTION], String(endpoint));
  }
});
