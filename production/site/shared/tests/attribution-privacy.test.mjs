// Attribution privacy (project decision of 2026-10-09, after the ads verification): a campaign tag value that looks
// like an email address or a phone number is dropped before it is stored or sent. Nothing else about attribution
// changes: the same nine keys, first visit kept 30 days, the 250-character cut, the payload keys.
// Also here: the whole-payload console print on Send exists in demo mode only.
import test from "node:test";
import assert from "node:assert/strict";
import { core, makeStore, fakeStorage, fillPlan, fillDetails } from "./helpers/make-store.mjs";
import { worker } from "./helpers/live-source.mjs";

const SESSION_KEY = "pp_quote_attribution_v3";
const KEPT_KEY = "pp_quote_attribution_kept_v1";
const PAGE = "https://review.example/carmel";

function visit(query, persistent, session) {
  const kept = persistent || fakeStorage();
  const made = makeStore({ url: PAGE + "?" + query, storage: session || fakeStorage(), options: { persistentStorage: kept } });
  made.kept = kept;
  made.attribution = () => JSON.parse(JSON.stringify(made.store.getState().attribution));
  return made;
}
const everythingStored = (made) => JSON.stringify(made.storage.items) + JSON.stringify(made.kept.items);

test("an email address in a tag is dropped: not stored for the session, not kept 30 days, not sent", () => {
  const made = visit("utm_source=google&utm_medium=cpc&utm_campaign=pp_search_core&utm_term=" + encodeURIComponent("jane.doe@example.com") + "&gclid=G-CLICK-1");
  assert.deepEqual(made.attribution(), { utm_source: "google", utm_medium: "cpc", utm_campaign: "pp_search_core", gclid: "G-CLICK-1" });
  assert.equal(everythingStored(made).includes("jane.doe"), false);
  assert.equal(everythingStored(made).includes("example.com"), false);
  assert.deepEqual(JSON.parse(made.kept.items[KEPT_KEY]).values, made.attribution());
  fillPlan(made.store); made.store.goTo("request"); fillDetails(made.store, "service_request", "text", { email: "" });
  const built = made.store.buildPayload("service_request");
  assert.equal(built.ok, true);
  assert.equal(JSON.stringify(built.payload.attribution).includes("@"), false);
  assert.equal("utm_term" in built.payload.attribution, false);
  // and the Worker's own cleaner takes the result unchanged
  assert.deepEqual(JSON.parse(JSON.stringify(worker.cleanAttribution(built.payload.attribution))), built.payload.attribution);
});

test("a phone number in a tag is dropped, in every usual way of writing it", () => {
  for (const phone of ["3175550100", "317-555-0100", "(317) 555-0100", "+1 317 555 0100", "317.555.0100", "13175550100", "555-0100", "317_555_0100", "317/555/0100"]) {
    const made = visit("utm_source=google&utm_content=" + encodeURIComponent(phone));
    assert.deepEqual(made.attribution(), { utm_source: "google" }, phone);
    assert.equal(everythingStored(made).replace(/\D/g, "").includes(phone.replace(/\D/g, "")), false, phone);
  }
});

test("a click id slot is no way round it", () => {
  const made = visit("gclid=" + encodeURIComponent("someone@mail.example.org") + "&fbclid=3175550100&wbraid=W-1");
  assert.deepEqual(made.attribution(), { wbraid: "W-1" });
});

test("a link whose only tag is personal leaves nothing behind and does not count as an arrival", () => {
  const made = visit("utm_term=" + encodeURIComponent("jane@example.com"));
  assert.deepEqual(made.attribution(), {});
  assert.equal(KEPT_KEY in made.kept.items, false, "no 30-day copy is written");
  assert.deepEqual(JSON.parse(made.storage.items[SESSION_KEY]), {});
  assert.equal(made.store.attributionSource().source, "none");
});

test("a personal value does not replace or remove the good value already held for that tag", () => {
  const session = fakeStorage(), kept = fakeStorage();
  visit("utm_source=google&utm_term=pooper%20scooper%20carmel", kept, session);
  const second = visit("utm_term=" + encodeURIComponent("jane@example.com"), kept, session);
  assert.deepEqual(second.attribution(), { utm_source: "google", utm_term: "pooper scooper carmel" });
});

test("a personal value already sitting in storage from an older engine is not used and not passed on", () => {
  const session = fakeStorage({ [SESSION_KEY]: JSON.stringify({ utm_source: "google", utm_term: "jane@example.com" }) });
  const kept = fakeStorage({ [KEPT_KEY]: JSON.stringify({ capturedAt: Date.parse("2026-10-07T14:00:00.000Z"), values: { utm_source: "fb", utm_content: "(317) 555-0100" } }) });
  const made = makeStore({ url: PAGE, storage: session, options: { persistentStorage: kept } });
  assert.deepEqual(JSON.parse(JSON.stringify(made.store.getState().attribution)), { utm_source: "google" });
  assert.equal(JSON.stringify(session.items).includes("jane@"), false, "the session copy is rewritten without it");
});

test("everything the playbook's own tags can hold is kept exactly as before", () => {
  const values = {
    utm_source: "google", utm_medium: "paid_social",
    utm_campaign: "pp-leads-2026q4-120212345678901234",        // Meta: {{campaign.name}}-{{campaign.id}}
    utm_content: "adgroup_1234567890",                         // Google: adgroup_{adgroupid}
    utm_term: "pooper scooper carmel 46032",                   // a keyword with a ZIP in it
    gclid: "Cj0KCQjw1234567890abcDEF_wcB", fbclid: "IwAR0123456789abcdefghij-KLMNOP", wbraid: "CjkKCAjw99999999", gbraid: "0AAAAA1234567890"
  };
  const query = Object.entries(values).map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
  const made = visit(query);
  assert.deepEqual(made.attribution(), values);
  assert.deepEqual(JSON.parse(made.kept.items[KEPT_KEY]).values, values);
  for (const kept of ["h1-retire-cb01a-120298765432109876", "prospect-zips50-age25-120211112222333344", "pp_test_owner", "test keyword", "46032", "123456", "town_carmel", "gbp_listing", "a@b", "1234567890123456"]) {
    assert.deepEqual(visit("utm_content=" + encodeURIComponent(kept)).attribution(), { utm_content: kept }, kept);
  }
});

test("the 250-character cut and the nine keys are as they were", () => {
  const made = visit("utm_term=" + "x".repeat(300) + "&utm_id=77&name=Jane&phone=3175550100&email=" + encodeURIComponent("jane@example.com"));
  assert.deepEqual(made.attribution(), { utm_term: "x".repeat(250) });
  assert.equal(everythingStored(made).includes("Jane"), false);
  assert.deepEqual(core.ATTRIBUTION_KEYS, ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "wbraid", "gbraid", "fbclid"]);
});

test("the whole-payload console print on Send exists in demo only: live and staging never print a customer's details", async () => {
  const TRUSTED = { liveEndpoints: ["https://purge-lead-relay.purgepros.workers.dev/submit", "https://quote.itspurgepros.com/submit"] };
  const run = async (site, url) => {
    const printed = [];
    const con = { info: (...a) => printed.push(a), warn: (...a) => printed.push(a), log: (...a) => printed.push(a) };
    const options = Object.assign({}, core.siteOptions(site, TRUSTED), {
      console: con, sinks: { gtag() {}, dataLayer: [], fbq() {} },
      fetch: async (url,init) => ({ ok: true, status: 202, text: async () => JSON.stringify({ accepted: true, requestId:JSON.parse(init.body).requestId }) })
    });
    const made = makeStore({ url, options });
    fillPlan(made.store); made.store.goTo("request"); fillDetails(made.store, "service_request", "text");
    const result = await made.store.submit("service_request");
    return { result, text: JSON.stringify(printed), store: made.store };
  };
  const personal = ["3175550100", "test@example.com", "123 Example St", "Reviewer"];
  const live = await run({ mode: "live" }, "https://itspurgepros.com/quote");
  assert.equal(live.result.ok, true);
  for (const p of personal) assert.equal(live.text.includes(p), false, "live printed " + p);
  assert.equal(JSON.stringify(live.store.submissionLog).includes("3175550100"), false);
  const staging = await run({ mode: "staging", endpoint: "https://quote-staging.purgepros-test.invalid/submit", allowedOrigins: ["https://staging-pages.purgepros-test.invalid"] }, "https://staging-pages.purgepros-test.invalid/quote");
  assert.equal(staging.result.ok, true);
  for (const p of personal) assert.equal(staging.text.includes(p), false, "staging printed " + p);
  assert.equal(JSON.stringify(staging.store.submissionLog).includes("3175550100"), false);
  // demo on a production address refuses before anything is printed
  const demoOnLive = await run(undefined, "https://itspurgepros.com/quote");
  assert.equal(demoOnLive.result.ok, false);
  for (const p of personal) assert.equal(demoOnLive.text.includes(p), false, "demo on the live address printed " + p);
});
