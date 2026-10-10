// packaged-send-check.mjs : the send switch proved on the PACKAGED form: the blocks of rollout/ghl-fragments/<profile>/
// put together as GoHighLevel will (site head code, header block, body block(s), footer block, and the site body code
// added AFTER the page has loaded), opened under the address each profile is meant for.
//
//   node _work/ghl/packaged-send-check.mjs              Chrome and WebKit
//   node _work/ghl/packaged-send-check.mjs chromium     one engine (chromium | webkit | firefox)
//
// NOTHING REAL IS CONTACTED. Every request of every page is answered or refused by this script:
//   - a page address (itspurgepros.com/..., sites.leadconnectorhq.com/...) gets the page assembled from the blocks;
//   - an address under the profile's assets base gets the file of the same path from this disk;
//   - a POST to a request address, and a GET of /reviews, is RECORDED and answered here (202 / a rating);
//   - the Google and Meta tag scripts named by the production head code are refused, so only the head code's own inline
//     stubs exist (gtag pushes to dataLayer, fbq queues): what the builder hands the tags is counted there;
//   - Google Fonts is refused quietly; anything else is recorded as unexpected and refused.
// What it proves:
//   production blocks on https://itspurgepros.com : live mode; one whole request posts ONCE to the production /submit
//     with exactly the 47 keys; the Google Ads conversion (with the label of window.PPSite) and the pixel's Lead once;
//     /reviews asked once on the production Worker; the welcome page (no builder) counts a Text press as sent;
//     a split page (home) has one <main> and a builder in live mode; nothing reaches the staging host.
//   production blocks on a foreign address : refuse to send, no request, no conversion.
//   staging blocks on https://sites.leadconnectorhq.com : staging mode; one request posts ONCE to the staging /submit;
//     no Google or Meta call of any kind exists or is made; nothing reaches the production host.
//   staging blocks on an address that is not allowed : refuse to send.
//   a saved-quote link (#resume=<token>) opened on either profile: the token is out of the address before any tag of the
//     head code runs, the builder is still handed it exactly once, and it reaches no tag, event or storage.
//   no block prints the "Review build" line; each page's footer says nothing about review.
//   GOHIGHLEVEL HOLDS THE SITE CODE (staging gate, October 9; scenarios 8 to 11): the site head AND body code are kept back
//     until the visitor's first touch after GoHighLevel's own script has finished (here 2 s after load), or 4 s after that,
//     and every script file takes 200 ms to arrive. With the settings and the loader in the footer block: a tap on the
//     "2 dogs" tile 700 ms after load opens the builder in place on both profiles (no navigation, nothing posted); what the
//     builder logs before the tags exist is listed; once the tags have arrived a whole request still posts once with the
//     conversion once; a saved-quote link's token is out of the address before the held head code's tags run; the welcome
//     page's phone menu opens and closes while the code is held.
// Writes rollout/integration/packaged-send-check.result.json. Exit code 1 on any failure.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { RELEASE, OUT, read, loadConfig } from "./lib.mjs";

const TOOLS = process.env.PP_PLAYWRIGHT_DIR || "tools/playwright";
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(TOOLS, "browsers");
const pw = createRequire(path.join(TOOLS, "package.json"))("playwright");
const cfg = loadConfig();
const KEYS = ["schemaVersion", "requestId", "eventId", "stage", "intent", "zip", "dogs", "frequency", "frequencyId", "areas", "areaIds", "yardSize", "yardSizeId", "lastCleaned", "customerStatus",
  "startTiming", "perVisitPrice", "clientPriceCents", "pricingVersion", "customEstimate", "customReasons", "phone", "phoneE164", "firstName", "lastName", "email", "street", "city", "state",
  "preferredContact", "smsTransactionalConsent", "consent", "consentVersion", "smsConsentCapturedAt", "termsAccepted", "termsVersion", "termsAcceptedAt", "question", "notes", "page",
  "attribution", "gclid", "fbclid", "fbp", "fbc", "submittedAt", "website"];
const TYPES = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon" };
const TERMS = JSON.parse(read(path.join(RELEASE, "shared/terms-version.json"))).termsVersion;
const P = cfg.profiles.production, S = cfg.profiles.staging;
const hostOf = (u) => new URL(u).origin;
const PROD_WORKER = hostOf(P.endpoint), STAGE_WORKER = hostOf(S.endpoint);
const STAGING_PAGES = S.allowedOrigins[0];

const results = []; let failures = 0;
function check(engine, scenario, what, ok, detail) {
  results.push({ engine, scenario, what, ok: Boolean(ok), detail: ok ? "" : detail });
  if (!ok) failures += 1;
  console.log((ok ? "  PASS  " : "  FAIL  ") + what + (ok || detail === undefined ? "" : "  -> " + JSON.stringify(detail).slice(0, 700)));
}

// ---- a page as GoHighLevel will hold it: head code, header, body block(s), footer; the site body code arrives late ----
const scriptSafe = (s) => JSON.stringify(s).replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
const HYDRATE_MS = 2000, HOLD_MS = 4000;
function assemble(profileName, slug, hold) {
  const dir = path.join(OUT, profileName), get = (rel) => read(path.join(dir, rel));
  const f = JSON.parse(get("fields.json")).pages.find((p) => p.slug === slug);
  if (!f) throw new Error("no page " + slug + " in " + profileName);
  const own = f.ownHeaderAndFooter ? [`shared/${slug}-header.html`, `shared/${slug}-footer.html`] : ["shared/header.html", "shared/footer.html"];
  const bodies = f.bodyBlocks.filter((b) => !/\.schema\.html$/.test(b));
  const wrap = (html) => `<div class="c-section"><div class="inner"><div class="c-row"><div class="inner"><div class="c-column"><div class="inner"><div class="c-custom-code"><div class="custom-code-container">\n${html}\n</div></div></div></div></div></div></div></div>`;
  // The site code is added to the page as markup, the way GoHighLevel adds it (its scripts are made again so that they
  // run). With the scripts started from the footer block the body code is comment lines and adding it does nothing.
  // hold = false : the head code stands in the head from the start; the body code is added 500 ms after load (as before).
  // hold = true  : GOHIGHLEVEL HOLDS BOTH: nothing of the head or body code exists until the first pointerdown, keydown,
  //                touchstart, scroll or mousemove that comes AFTER "hydration" (HYDRATE_MS after load), or HOLD_MS later.
  const AFTER_HEAD = `window.__hrefAfterHead=location.href;window.__headTagArgs=JSON.stringify([window.dataLayer?[].map.call(window.dataLayer,function(a){return [].slice.call(a)}):null,window.fbq&&window.fbq.queue?[].map.call(window.fbq.queue,function(a){return [].slice.call(a)}):null]);`;
  const PUT = `function put(html,parent){var t=document.createElement("template");t.innerHTML=html;[].slice.call(t.content.childNodes).forEach(function(n){if(n.nodeName==="SCRIPT"){var s=document.createElement("script");[].forEach.call(n.attributes,function(a){s.setAttribute(a.name,a.value)});s.text=n.textContent;parent.appendChild(s)}else parent.appendChild(n)})}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${f.title}</title>
<script>/* test harness only: the address as the FIRST script of the page sees it */window.__hrefAtStart=location.href</script>
${hold ? "<!-- test harness: the site head code is HELD, as GoHighLevel holds it -->" : get("shared/site-head.html")}
${hold ? "" : `<script>/* test harness only: the address once the head code has run, and what the head code's tags were handed */${AFTER_HEAD}</script>`}
</head><body>
${wrap(get(own[0]))}
${bodies.length > 1 ? `<div class="c-section"><div class="inner"><div class="c-row"><div class="inner"><div class="c-column"><div class="inner">${bodies.map((b) => `<div class="c-custom-code"><div class="custom-code-container">\n${get(b)}\n</div></div>`).join("\n")}</div></div></div></div></div></div>` : wrap(get(bodies[0]))}
${wrap(get(own[1]))}
<script id="sim-late">/* test harness only: the site code arrives late, as GoHighLevel adds it${hold ? " (HELD until the first touch after hydration, or " + HOLD_MS + " ms)" : " (the body code 500 ms after load)"} */
(function(){var root=document.documentElement,HEAD=${hold ? scriptSafe(get("shared/site-head.html")) : '""'},BODY=${scriptSafe(get("shared/site-body.html"))},loadAt=null;${PUT}
window.__sinceLoad=function(){return loadAt===null?null:Math.round(performance.now()-loadAt)};
function add(){if(root.getAttribute("data-late-code")==="added")return;if(HEAD){put(HEAD,document.head);${AFTER_HEAD}}var box=document.createElement("div");box.id="gb-track-hl-custom-code";document.body.appendChild(box);put(BODY,box);root.setAttribute("data-late-code","added");root.setAttribute("data-late-code-at",String(window.__sinceLoad()))}
window.addEventListener("load",function(){loadAt=performance.now();
${hold ? `root.setAttribute("data-late-code","held");setTimeout(function(){root.setAttribute("data-late-code","held-listening");var done=false,timer=setTimeout(go,${HOLD_MS});function go(){if(done)return;done=true;clearTimeout(timer);add()}["pointerdown","keydown","touchstart","scroll","mousemove"].forEach(function(e){window.addEventListener(e,go,{once:true,passive:true,capture:true})})},${HYDRATE_MS});` : `setTimeout(add,500);`}
});})();</script>
</body></html>`;
}

async function world(browser, profileName, pageOrigin, viewport, slowScriptsMs = 0) {
  const profile = cfg.profiles[profileName];
  const context = await browser.newContext({ viewport: viewport || { width: 390, height: 844 }, serviceWorkers: "block" });
  const log = { posts: [], reviews: [], tagScripts: [], fonts: 0, served: 0, pages: 0, unexpected: [], missingFiles: [] };
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST, OPTIONS", "cache-control": "no-store" };
    if (url.origin === PROD_WORKER || url.origin === STAGE_WORKER) {
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      if (url.pathname === "/reviews") { log.reviews.push({ url: url.href, method: request.method() }); return url.origin === PROD_WORKER ? route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ rating: 4.9, count: 43 }) }) : route.fulfill({ status: 500, headers: cors, contentType: "application/json", body: "{}" }); }
      let body = null; try { body = JSON.parse(request.postData() || "null"); } catch { body = null; }
      log.posts.push({ method: request.method(), url: url.href, body, from: request.headers().origin || "" });
      return route.fulfill({ status: 202, headers: cors, contentType: "application/json", body: JSON.stringify({ accepted: true, requestId: body && body.requestId }) });
    }
    if (url.href.startsWith(profile.assetsBase + "/")) {
      const file = path.join(RELEASE, decodeURIComponent(url.pathname.slice(new URL(profile.assetsBase).pathname.length + 1)));
      if (slowScriptsMs && /\.js$/.test(file)) await new Promise((r) => setTimeout(r, slowScriptsMs));     // a script file that takes time to arrive
      if (file.startsWith(RELEASE) && fs.existsSync(file) && fs.statSync(file).isFile()) { log.served += 1; return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", body: fs.readFileSync(file) }); }
      log.missingFiles.push(url.pathname); return route.fulfill({ status: 404, body: "" });
    }
    if (url.origin === pageOrigin && request.resourceType() === "document") {
      const slug = url.searchParams.get("pp-test-page");
      if (slug) { log.pages += 1; return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: assemble(profileName, slug, url.searchParams.get("pp-hold") === "ghl") }); }
    }
    if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) { log.fonts += 1; return route.abort("blockedbyclient"); }
    if (/googletagmanager\.com$|connect\.facebook\.net$|facebook\.com$|google-analytics\.com$|doubleclick\.net$|google\.com$/.test(url.hostname)) { log.tagScripts.push(url.hostname + url.pathname.slice(0, 40)); return route.abort("blockedbyclient"); }
    log.unexpected.push(request.method() + " " + url.href.slice(0, 160));
    return route.abort("blockedbyclient");
  });
  return { context, log };
}

async function toConfirm(page) {
  await page.waitForFunction(() => window.PPBuilder && window.PPBuilder.hooks, null, { timeout: 30000 });
  await page.evaluate(() => {
    const B = window.PPBuilder, s = B.store;
    s.set({ dogCount: "2" }); s.set({ zip: "46032" }); s.set({ yardSize: "m" }); s.set({ areas: ["back", "front"] }); s.set({ frequency: "weekly" });
    s.goTo("price"); if (!B.ui.sheetOpen) B.open();
    s.set({ intent: "service_request" }); s.next();
    s.set({ customerStatus: "new", firstName: "Test", lastName: "Reviewer", preferredContact: "email", email: "test@example.com", phone: "3175550100", address: "123 Example St", startTiming: "As soon as possible", lastCleaned: "About 1 month" });
    s.goTo("confirm");
  });
  await page.waitForSelector('[data-ppb-stage][data-ppb-current="confirm"]', { timeout: 8000 });
  await page.locator("#ppb-agree").click({ position: { x: 8, y: 8 } });
  await page.waitForFunction(() => window.PPBuilder.store.getState().termsAccepted === true, null, { timeout: 5000 });
}
async function sendTwice(page) {
  await page.evaluate(() => { const b = document.querySelector("[data-ppb-next]"); b.click(); b.click(); });
  await page.waitForFunction(() => !window.PPBuilder.store.getState().submitting, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const b = document.querySelector("[data-ppb-next]"); if (window.PPBuilder.store.getState().step !== "done" && b) b.click(); });
  await page.waitForTimeout(500);
}
const view = (page) => page.evaluate(() => {
  const B = window.PPBuilder, s = B && B.store, seen = (sel) => { const n = document.querySelector(sel); return Boolean(n && n.getClientRects().length); };
  const dl = Array.isArray(window.dataLayer) ? window.dataLayer.map((e) => (e && e.length !== undefined && typeof e !== "string" ? [].slice.call(e) : e)) : null;
  const gEvents = (dl || []).filter((e) => Array.isArray(e) && e[0] === "event").map((e) => ({ name: e[1], send_to: e[2] && e[2].send_to, value: e[2] && e[2].value }));
  const fq = window.fbq && window.fbq.queue ? [].map.call(window.fbq.queue, (a) => [].slice.call(a, 0, 2).join(":")) : null;
  const alert = document.querySelector("[data-ppb-alert]");
  return { site: window.PPSite ? { mode: window.PPSite.mode, endpoint: window.PPSite.endpoint } : null, mode: s && s.mode, endpoint: s && s.endpoint, step: s && s.getState().step, blocked: s && s.sendingBlockedReason(),
    hasGtag: typeof window.gtag === "function", hasFbq: typeof window.fbq === "function", hasDataLayer: Array.isArray(window.dataLayer), gEvents, fbq: fq,
    stagingLine: seen("[data-ppb-staging]"), demoLine: seen("[data-ppb-demo]"), alert: alert && !alert.hidden ? alert.textContent.trim().slice(0, 160) : "",
    network: s ? s.networkLog.map((n) => n.url) : [], logged: s ? s.trackLog.length : 0, loggedSent: s ? s.trackLog.filter((e) => e.sent).length : 0,
    mains: document.querySelectorAll("main").length, reviewLine: /Review build\./.test(document.body.innerText) || Boolean(document.querySelector(".foot__review")),
    footer: Boolean(document.querySelector("footer.foot")), reviewsState: document.documentElement.getAttribute("data-reviews"), standins: document.querySelectorAll('[data-standin="true"]').length,
    errors: window.__errors || [] };
});

async function run(engineName) {
  console.log("\n== " + engineName);
  const browser = await pw[engineName].launch(engineName === "chromium" ? { channel: "chrome" } : {});
  const C = (scenario, what, ok, detail) => check(engineName, scenario, what, ok, detail);
  const open = async (context, address) => {
    const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
    await page.goto(address, { waitUntil: "load" });
    await page.waitForFunction(() => document.documentElement.getAttribute("data-late-code") === "added", null, { timeout: 15000 });
    page.errorsSeen = errors;
    return page;
  };
  try {
    /* 1. PRODUCTION blocks on the real site's address: the quote page, one whole request */
    {
      const { context, log } = await world(browser, "production", "https://itspurgepros.com");
      const page = await open(context, "https://itspurgepros.com/quote?pp-test-page=quote");
      await toConfirm(page); await sendTwice(page);
      const v = await view(page), post = log.posts[0] || {}, body = post.body || {};
      C("production quote", "window.PPSite says live and the builder's store is in live mode, aimed at the production request address", v.site && v.site.mode === "live" && v.mode === "live" && v.endpoint === P.endpoint && !v.blocked, v);
      C("production quote", "one whole request, Send pressed twice and once more: exactly ONE POST, to " + P.endpoint, log.posts.length === 1 && post.method === "POST" && post.url === P.endpoint && post.from === "https://itspurgepros.com", log.posts.map((p) => p.method + " " + p.url + " from " + p.from));
      C("production quote", "its body has exactly the 47 contract keys, in order", JSON.stringify(Object.keys(body)) === JSON.stringify(KEYS), Object.keys(body));
      C("production quote", "it is a service request for the plan chosen, with the pinned versions and the page's own address", body.schemaVersion === "cloudflare-widget.v3" && body.intent === "service_request" && body.zip === "46032" && body.clientPriceCents === 2899 && body.pricingVersion === "2026-08-cloudflare-v1" && body.termsAccepted === true && body.termsVersion === TERMS && /^https:\/\/itspurgepros\.com\/quote/.test(body.page), { intent: body.intent, zip: body.zip, cents: body.clientPriceCents, terms: body.termsVersion, page: body.page });
      const conv = v.gEvents.filter((e) => e.name === "conversion"), lead = (v.fbq || []).filter((x) => x === "track:Lead");
      C("production quote", "the Google Ads conversion was handed to the tag once, with the label of window.PPSite (" + P.googleAdsSendTo + ")", conv.length === 1 && conv[0].send_to === P.googleAdsSendTo, v.gEvents);
      C("production quote", "generate_lead once and the pixel's Lead once", v.gEvents.filter((e) => e.name === "generate_lead").length === 1 && lead.length === 1, { g: v.gEvents.map((e) => e.name), fbq: v.fbq });
      C("production quote", "the done screen is shown, with no demo line and no staging line", v.step === "done" && !v.demoLine && !v.stagingLine, v);
      C("production quote", "/reviews was asked once, on the production Worker, and the figures were taken (no stand-in mark left)", log.reviews.length === 1 && log.reviews[0].url === P.reviewsEndpoint && v.reviewsState === "live" && v.standins === 0, { reviews: log.reviews, state: v.reviewsState, standins: v.standins });
      C("production quote", "no request to the staging Worker, no unexpected request, no file missing on disk, no script error", !log.posts.concat(log.reviews).some((p) => p.url.startsWith(STAGE_WORKER)) && !log.unexpected.length && !log.missingFiles.length && !page.errorsSeen.length, { unexpected: log.unexpected, missing: log.missingFiles, errors: page.errorsSeen });
      C("production quote", "the page prints no review-build line, and has one <main> and its footer", !v.reviewLine && v.mains === 1 && v.footer, v);
      await context.close();
    }
    /* 2. PRODUCTION, the home page: a split body (two blocks), builder in place */
    {
      const { context, log } = await world(browser, "production", "https://itspurgepros.com", { width: 1440, height: 900 });
      const page = await open(context, "https://itspurgepros.com/?pp-test-page=index");
      await page.waitForFunction(() => window.PPBuilder && window.PPBuilder.store, null, { timeout: 30000 });
      await page.waitForTimeout(600);
      const v = await view(page);
      const sections = await page.evaluate(() => ({ inMain: document.querySelectorAll("main > section, main > div, main > *").length, outside: document.querySelectorAll('[data-pp5="more"]').length, mount: Boolean(document.querySelector("#quote [data-pp-builder], [data-pp-builder]")), href: [].map.call(document.querySelectorAll(".hdr a[data-purge-quote]"), (a) => a.getAttribute("href")) }));
      C("production home", "the two body blocks became ONE <main> (nothing left in the second block's holder), and the builder is in live mode", v.mains === 1 && sections.outside === 0 && sections.mount && v.mode === "live" && !v.blocked, { v: { mains: v.mains, mode: v.mode, blocked: v.blocked }, sections });
      C("production home", "the header's price buttons point at the builder on the page (#quote)", sections.href.length > 0 && sections.href.every((h) => h === "#quote"), sections.href);
      C("production home", "nothing was posted by opening the page; no conversion; no unexpected request; no script error", log.posts.length === 0 && !v.gEvents.some((e) => e.name === "conversion") && !log.unexpected.length && !log.missingFiles.length && !page.errorsSeen.length, { posts: log.posts.length, unexpected: log.unexpected, missing: log.missingFiles, errors: page.errorsSeen });
      await context.close();
    }
    /* 3. PRODUCTION, the welcome page: no builder, its own header and footer; a Text press is counted as sent */
    {
      const { context, log } = await world(browser, "production", "https://itspurgepros.com");
      const page = await open(context, "https://itspurgepros.com/welcome?pp-test-page=welcome");
      await page.waitForFunction(() => window.PPQuoteCore && typeof window.PPQuoteCore.shared === "function", null, { timeout: 30000 });
      await page.waitForTimeout(500);
      await page.evaluate(() => { const a = document.querySelector("#site-footer a.foot__txt") || document.querySelector('a[href^="sms:"]'); a.addEventListener("click", (e) => e.preventDefault()); a.click(); });
      await page.waitForFunction(() => window.PPQuoteCore.shared().trackLog.length > 0, null, { timeout: 12000 }).catch(() => {});
      const got = await page.evaluate(() => ({ builder: Boolean(window.PPBuilder), mode: window.PPQuoteCore.shared().mode, log: window.PPQuoteCore.shared().trackLog.map((e) => ({ line: e.channel + " " + e.event + " " + JSON.stringify(e.params || {}), sent: e.sent, demo: e.demo })),
        g: Array.isArray(window.dataLayer) ? window.dataLayer.filter((e) => e && e[0] === "event").map((e) => e[1]) : null, fbq: window.fbq && window.fbq.queue ? [].map.call(window.fbq.queue, (a) => [].slice.call(a, 0, 2).join(":")) : null, review: /Review build\./.test(document.body.innerText) }));
      const hit = got.log.find((e) => /contact_click/.test(e.line));
      C("production welcome", "no builder on the page; site.js made the store itself, in LIVE mode", !got.builder && got.mode === "live", got);
      C("production welcome", "a Text press in the footer is counted and SENT to the tags (contact_click to Google, Contact to the pixel)", Boolean(hit) && hit.sent === true && (got.g || []).includes("contact_click") && (got.fbq || []).includes("track:Contact"), got);
      C("production welcome", "nothing was posted, no review-build line, no unexpected request, no script error", log.posts.length === 0 && !got.review && !log.unexpected.length && !log.missingFiles.length && !page.errorsSeen.length, { posts: log.posts.length, unexpected: log.unexpected, missing: log.missingFiles, errors: page.errorsSeen });
      await context.close();
    }
    /* 4. PRODUCTION blocks opened on a foreign address (a preview address): refuse */
    {
      const { context, log } = await world(browser, "production", STAGING_PAGES);
      const page = await open(context, STAGING_PAGES + "/preview/abc?pp-test-page=quote");
      await toConfirm(page); await sendTwice(page);
      const v = await view(page);
      C("production on a foreign address", "live mode refuses to send from " + STAGING_PAGES + ": no POST, no conversion, the visitor is told", v.mode === "live" && Boolean(v.blocked) && log.posts.length === 0 && !v.gEvents.some((e) => e.name === "conversion" || e.name === "generate_lead") && v.step === "confirm" && /cannot send requests/i.test(v.alert), { v, posts: log.posts.length });
      await context.close();
    }
    /* 5. STAGING blocks on the preview address they are meant for: one whole request */
    {
      const { context, log } = await world(browser, "staging", STAGING_PAGES);
      const page = await open(context, STAGING_PAGES + "/preview/abc123?pp-test-page=quote");
      await toConfirm(page); await sendTwice(page);
      const v = await view(page), post = log.posts[0] || {}, body = post.body || {};
      C("staging quote", "window.PPSite says staging and the store is in staging mode, aimed at the staging request address", v.site && v.site.mode === "staging" && v.mode === "staging" && v.endpoint === S.endpoint && !v.blocked, v);
      C("staging quote", "exactly ONE POST, to " + S.endpoint + ", with the 47 keys", log.posts.length === 1 && post.url === S.endpoint && post.from === STAGING_PAGES && JSON.stringify(Object.keys(body)) === JSON.stringify(KEYS), log.posts.map((p) => p.method + " " + p.url));
      C("staging quote", "the request's page value is the staging page's own address (how a staging request is told apart)", new RegExp("^" + STAGING_PAGES.replace(/[.]/g, "\\.") + "/preview/abc123").test(body.page || ""), body.page);
      C("staging quote", "no Google or Meta tag exists on the page and none was called; the events are only logged, none marked sent", !v.hasGtag && !v.hasFbq && !v.hasDataLayer && v.logged > 0 && v.loggedSent === 0 && log.tagScripts.length === 0, { hasGtag: v.hasGtag, hasFbq: v.hasFbq, dataLayer: v.hasDataLayer, logged: v.logged, sent: v.loggedSent, tagScripts: log.tagScripts });
      C("staging quote", "nothing reached the production Worker; /reviews was asked on the staging Worker only; its failure left the built-in figures", !log.posts.concat(log.reviews).some((p) => p.url.startsWith(PROD_WORKER)) && log.reviews.length === 1 && log.reviews[0].url === S.reviewsEndpoint && v.reviewsState === "built-in", { reviews: log.reviews, state: v.reviewsState });
      C("staging quote", "the done screen says it was a staging test; no review-build line; no unexpected request; no script error", v.step === "done" && v.stagingLine && !v.demoLine && !v.reviewLine && !log.unexpected.length && !log.missingFiles.length && !page.errorsSeen.length, { v: { step: v.step, stagingLine: v.stagingLine, reviewLine: v.reviewLine }, unexpected: log.unexpected, missing: log.missingFiles, errors: page.errorsSeen });
      await context.close();
    }
    /* 6. STAGING blocks on an address that is not allowed: refuse */
    {
      const { context, log } = await world(browser, "staging", "https://somewhere-else.example.invalid");
      const page = await open(context, "https://somewhere-else.example.invalid/x?pp-test-page=quote");
      await toConfirm(page); await sendTwice(page);
      const v = await view(page);
      C("staging on an address not allowed", "staging mode refuses to send: no POST anywhere", v.mode === "staging" && Boolean(v.blocked) && log.posts.length === 0 && v.step === "confirm", { v, posts: log.posts.length });
      await context.close();
    }
    /* 7. A SAVED-QUOTE LINK opened on the packaged page (VERIFY-sending finding 2): the token must be out of the address
          before any tag of the head code runs, and the builder must still be handed it, once */
    for (const [profileName, origin, address] of [["production", "https://itspurgepros.com", "https://itspurgepros.com/quote?pp-test-page=quote&utm_source=saved"], ["staging", STAGING_PAGES, STAGING_PAGES + "/preview/abc123?pp-test-page=quote"]]) {
      const token = "R".repeat(43), name = profileName + " saved link";
      const { context, log } = await world(browser, profileName, origin);
      const page = await open(context, address + "#resume=" + token);
      await page.waitForFunction(() => window.PPBuilder && window.PPBuilder.store, null, { timeout: 30000 });
      await page.waitForTimeout(1500);
      const got = await page.evaluate(() => ({ start: window.__hrefAtStart, afterHead: window.__hrefAfterHead, headTags: window.__headTagArgs, now: location.href, hook: typeof window.__ppTakePlanToken, again: window.__ppTakePlanToken ? window.__ppTakePlanToken() : null,
        tagsNow: JSON.stringify([window.dataLayer ? [].map.call(window.dataLayer, (a) => (a && a.length !== undefined && typeof a !== "string" ? [].slice.call(a) : a)) : null, window.fbq && window.fbq.queue ? [].map.call(window.fbq.queue, (a) => [].slice.call(a)) : null]),
        track: JSON.stringify(window.PPBuilder.store.trackLog.map((e) => e.params || {})), storage: JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]) }));
      const opens = log.posts.filter((p) => /\/quote-resume\/open$/.test(p.url));
      C(name, "the link arrived with its token (the harness really opened a saved link)", got.start.includes("#resume=" + token), got.start);
      C(name, "once the head code has run the address holds no token, and the page's own tags are still in it", !/resume|RRRRR/.test(got.afterHead) && got.afterHead === address, got.afterHead);
      C(name, "nothing the head code handed its tags holds the token" + (profileName === "staging" ? " (staging has no tag at all)" : ""), !got.headTags.includes(token) && !/resume=/.test(got.headTags) && (profileName === "staging" ? got.headTags === "[null,null]" : got.headTags.includes("PageView")), got.headTags);
      C(name, "the builder was handed the token: exactly ONE open request, to this profile's Worker, carrying the token and nothing else", opens.length === 1 && opens[0].url === cfg.profiles[profileName].endpoint.replace(/\/submit$/, "/quote-resume/open") && opens[0].body && opens[0].body.token === token && Object.keys(opens[0].body).join() === "token", opens);
      C(name, "the token is handed over once only (a second ask gets nothing) and is in the address no more", got.hook === "function" && got.again === "" && !/resume/.test(got.now), { again: got.again, now: got.now });
      C(name, "the token is in no tag call, no logged event and no browser storage afterwards", !got.tagsNow.includes(token) && !got.track.includes(token) && !got.storage.includes(token), { tags: got.tagsNow.slice(0, 300), storage: got.storage.slice(0, 300) });
      C(name, "nothing reached the other profile's Worker; no unexpected request; no script error", !log.posts.concat(log.reviews).some((x) => x.url.startsWith(profileName === "production" ? STAGE_WORKER : PROD_WORKER)) && !log.unexpected.length && !page.errorsSeen.length, { unexpected: log.unexpected, errors: page.errorsSeen });
      await context.close();
    }
    /* 8 to 11. GOHIGHLEVEL HOLDS THE SITE CODE (head and body) and the script files are slow: the loader stands in the footer block */
    const TILE = '[data-ppb-dogs="2"], #pp-builder .ppb-tiles > .ppb-tile:nth-child(2)';
    const openHeld = async (context, address) => {
      const page = await context.newPage();
      const errors = []; page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
      const navigations = []; page.on("framenavigated", (fr) => { if (fr === page.mainFrame()) navigations.push(fr.url()); });
      await page.goto(address, { waitUntil: "load" });
      page.errorsSeen = errors; page.navigations = navigations;
      return page;
    };
    const heldState = (page) => page.evaluate(() => ({ ms: window.__sinceLoad(), lateCode: document.documentElement.getAttribute("data-late-code"), hasGtag: typeof window.gtag === "function", hasFbq: typeof window.fbq === "function", site: window.PPSite ? window.PPSite.mode : null, loader: Boolean(window.PP5Loaded), builderReady: Boolean(window.PPBuilder && window.PPBuilder.store) }));
    const tapTile = async (page) => {
      await page.waitForFunction(() => window.__sinceLoad() !== null && window.__sinceLoad() >= 700, null, { timeout: 5000 });
      const before = await heldState(page);
      before.loggedUntouched = await page.evaluate(() => { const s = window.PPBuilder && window.PPBuilder.store; return s ? s.trackLog.map((e) => ({ line: e.channel + " " + e.event, sent: Boolean(e.sent) })) : []; });
      await page.locator(TILE).first().click({ timeout: 4000 });
      await page.waitForTimeout(700);
      const after = await page.evaluate(() => { const s = window.PPBuilder && window.PPBuilder.store; return { href: location.href, panelOpen: Boolean(document.querySelector("dialog.ppb-sheet[open]")), panels: document.querySelectorAll("dialog.ppb-sheet").length, step: s && s.getState().step, dogs: s && String(s.getState().dogCount), lateCode: document.documentElement.getAttribute("data-late-code"),
        logged: s ? s.trackLog.map((e) => ({ line: e.channel + " " + e.event, sent: Boolean(e.sent) })) : [] }; });
      return { before, after };
    };
    for (const [profileName, origin, address] of [["production", "https://itspurgepros.com", "https://itspurgepros.com/carmel?pp-test-page=carmel&pp-hold=ghl"], ["staging", STAGING_PAGES, STAGING_PAGES + "/preview/" + ((S.links.pageIds || {}).carmel || "abc123") + "?pp-test-page=carmel&pp-hold=ghl"]]) {
      const name = profileName + ", site code held, early tap", profile = cfg.profiles[profileName];
      const { context, log } = await world(browser, profileName, origin, undefined, 200);
      const page = await openHeld(context, address);
      const { before, after } = await tapTile(page);
      C(name, "at the tap (" + before.ms + " ms after load, inside the first second) GoHighLevel still held the site code: no head code, no tag, no body code", before.ms <= 1000 && before.lateCode === "held" && !before.hasGtag && !before.hasFbq, before);
      C(name, "and yet the footer block had already set window.PPSite (" + profile.mode + ") and started the scripts: the builder was ready", before.site === profile.mode && before.loader && before.builderReady, before);
      C(name, "the tap on \"2 dogs\" opened the builder IN PLACE: same address, one panel, ZIP step, 2 dogs; the page was not left", after.href === address && after.panelOpen && after.panels === 1 && after.step === "zip" && after.dogs === "2" && log.pages === 1, { after: { href: after.href, panelOpen: after.panelOpen, panels: after.panels, step: after.step, dogs: after.dogs }, documentsServed: log.pages });
      C(name, "nothing was posted and no unexpected address was asked for by that tap" + (profileName === "staging" ? " (the live site was not opened)" : ""), log.posts.length === 0 && !log.unexpected.length && !log.missingFiles.length, { posts: log.posts.length, unexpected: log.unexpected, missing: log.missingFiles });
      const early = after.logged;
      heldFindings.push({ engine: engineName, profile: profileName, tappedMsAfterLoad: before.ms, loggedWithNothingTouched: before.loggedUntouched, loggedBeforeTheTagsExisted: early });
      console.log(`  NOTE  ${name}: of those, logged with NOTHING touched (just by the builder starting): ${before.loggedUntouched.length ? before.loggedUntouched.map((e) => e.line + (e.sent ? " (sent)" : " (not sent)")).join("; ") : "none"}`);
      console.log(`  NOTE  ${name}: events the builder logged before the held head code existed: ${early.length ? early.map((e) => e.line + (e.sent ? " (sent)" : " (not sent)")).join("; ") : "none"}`);
      C(name, "what the builder logged while no tag existed was not handed to any tag (it cannot be: none exists yet)", early.every((e) => !e.sent), early);
      // the code arrives 4 s after hydration (the tap came before hydration, so it released nothing)
      await page.waitForFunction(() => document.documentElement.getAttribute("data-late-code") === "added", null, { timeout: 15000 });
      const arrived = await page.evaluate(() => ({ at: +document.documentElement.getAttribute("data-late-code-at"), hasGtag: typeof window.gtag === "function", hasFbq: typeof window.fbq === "function", panels: document.querySelectorAll("dialog.ppb-sheet").length, site: window.PPSite && window.PPSite.mode, bodyBox: document.querySelectorAll("#gb-track-hl-custom-code script").length }));
      C(name, "the held code arrived " + arrived.at + " ms after load and changed nothing of ours: still one panel, window.PPSite still " + profile.mode + ", no script in the body code" + (profileName === "production" ? "; the Google tag and the pixel now exist" : "; still no tag of any kind"), arrived.at >= HYDRATE_MS + HOLD_MS - 50 && arrived.panels === 1 && arrived.site === profile.mode && arrived.bodyBox === 0 && (profileName === "production" ? arrived.hasGtag && arrived.hasFbq : !arrived.hasGtag && !arrived.hasFbq), arrived);
      // and a whole request afterwards is the request it always was
      await toConfirm(page); await sendTwice(page);
      const v = await view(page), post = log.posts[0] || {}, body = post.body || {};
      C(name, "a whole request afterwards: exactly ONE POST, to " + profile.endpoint + ", with the 47 keys", log.posts.length === 1 && post.url === profile.endpoint && JSON.stringify(Object.keys(body)) === JSON.stringify(KEYS) && v.step === "done", { posts: log.posts.map((p) => p.url), step: v.step, alert: v.alert });
      if (profileName === "production") {
        const conv = v.gEvents.filter((e) => e.name === "conversion"), lead = (v.fbq || []).filter((x) => x === "track:Lead");
        C(name, "the Google Ads conversion once with the label of window.PPSite, generate_lead once, the pixel's Lead once", conv.length === 1 && conv[0].send_to === P.googleAdsSendTo && v.gEvents.filter((e) => e.name === "generate_lead").length === 1 && lead.length === 1, { g: v.gEvents, fbq: v.fbq });
      } else C(name, "no Google or Meta tag exists or was called; nothing reached the production Worker or the live site", !v.hasGtag && !v.hasFbq && !v.hasDataLayer && log.tagScripts.length === 0 && !log.posts.concat(log.reviews).some((p) => p.url.startsWith(PROD_WORKER)) && !log.unexpected.length, { hasGtag: v.hasGtag, tagScripts: log.tagScripts, unexpected: log.unexpected });
      C(name, "no script error", !page.errorsSeen.length, page.errorsSeen);
      await context.close();
    }
    /* 10. a saved-quote link while the head code is held: the builder now starts BEFORE the token guard and the tags */
    {
      const token = "H".repeat(43), name = "production saved link, site code held", address = "https://itspurgepros.com/quote?pp-test-page=quote&pp-hold=ghl&utm_source=saved";
      const { context, log } = await world(browser, "production", "https://itspurgepros.com", undefined, 200);
      const page = await openHeld(context, address + "#resume=" + token);
      await page.waitForFunction(() => document.documentElement.getAttribute("data-late-code") === "added", null, { timeout: 15000 });
      await page.waitForTimeout(800);
      const got = await page.evaluate(() => ({ start: window.__hrefAtStart, afterHead: window.__hrefAfterHead, headTags: window.__headTagArgs, now: location.href,
        tagsNow: JSON.stringify([window.dataLayer ? [].map.call(window.dataLayer, (a) => (a && a.length !== undefined && typeof a !== "string" ? [].slice.call(a) : a)) : null, window.fbq && window.fbq.queue ? [].map.call(window.fbq.queue, (a) => [].slice.call(a)) : null]),
        track: JSON.stringify(window.PPBuilder.store.trackLog.map((e) => e.params || {})), storage: JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]) }));
      const opens = log.posts.filter((p) => /\/quote-resume\/open$/.test(p.url));
      C(name, "the link arrived with its token, and when the held head code finally ran the address held none (the builder had taken it first)", got.start.includes("#resume=" + token) && got.afterHead === address && !/resume/.test(got.now), { afterHead: got.afterHead, now: got.now });
      C(name, "the head code's tags ran (PageView) and nothing they were handed, then or later, holds the token", got.headTags.includes("PageView") && !got.headTags.includes(token) && !got.tagsNow.includes(token) && !/resume=/.test(got.tagsNow), got.headTags.slice(0, 300));
      C(name, "the builder was handed the token: exactly ONE open request to the production Worker, carrying the token and nothing else; it is in no logged event and no storage", opens.length === 1 && opens[0].url === P.endpoint.replace(/\/submit$/, "/quote-resume/open") && opens[0].body && opens[0].body.token === token && Object.keys(opens[0].body).join() === "token" && !got.track.includes(token) && !got.storage.includes(token), opens);
      C(name, "no unexpected request; no script error", !log.unexpected.length && !page.errorsSeen.length, { unexpected: log.unexpected, errors: page.errorsSeen });
      await context.close();
    }
    /* 11. the welcome page (its own footer block, no builder) while the code is held: site.js runs, the phone menu opens and closes */
    {
      const name = "production welcome, site code held";
      const { context, log } = await world(browser, "production", "https://itspurgepros.com", undefined, 200);
      const page = await openHeld(context, "https://itspurgepros.com/welcome?pp-test-page=welcome&pp-hold=ghl");
      await page.waitForFunction(() => window.__sinceLoad() !== null && window.__sinceLoad() >= 700, null, { timeout: 5000 });
      const before = await heldState(page);
      const core = await page.evaluate(() => ({ js: document.documentElement.classList.contains("js"), mode: window.PPQuoteCore && typeof window.PPQuoteCore.shared === "function" ? window.PPQuoteCore.shared().mode : null, builder: Boolean(window.PPBuilder) }));
      C(name, "at " + before.ms + " ms the site code is held, yet welcome's own footer block has set window.PPSite (live) and site.js has run (no builder on this page)", before.ms <= 1000 && before.lateCode === "held" && before.site === "live" && before.loader && core.js && core.mode === "live" && !core.builder, { before, core });
      await page.locator("[data-burger]").first().click({ timeout: 4000 });
      await page.waitForTimeout(450);
      const opened = await page.evaluate(() => { const m = document.querySelector("#mnav"); return Boolean(m && m.classList.contains("is-open")); });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(450);
      const closed = await page.evaluate(() => { const m = document.querySelector("#mnav"); return Boolean(m && !m.classList.contains("is-open")); });
      const still = await heldState(page);
      C(name, "the phone menu opens and Escape closes it while the site code is still held", opened && closed && /^held/.test(String(still.lateCode)), { opened, closed, lateCode: still.lateCode });
      C(name, "nothing posted, no unexpected request, no script error", log.posts.length === 0 && !log.unexpected.length && !log.missingFiles.length && !page.errorsSeen.length, { unexpected: log.unexpected, errors: page.errorsSeen });
      await context.close();
    }
  } finally { await browser.close(); }
}
const heldFindings = [];

const engines = process.argv.slice(2).filter((a) => !a.startsWith("--"));
for (const e of engines.length ? engines : ["chromium", "webkit"]) await run(e);
const outFile = path.join(RELEASE, "rollout/integration/packaged-send-check.result.json");
fs.writeFileSync(outFile, JSON.stringify({ ran: new Date().toISOString(), scriptsStartFrom: cfg.scriptsPlacement, production: { endpoint: P.endpoint, reviewsEndpoint: P.reviewsEndpoint }, staging: { endpoint: S.endpoint, pages: STAGING_PAGES }, heldSiteCode: { hydrationStandInMs: HYDRATE_MS, holdMs: HOLD_MS, scriptFileDelayMs: 200, loggedBeforeTheTagsExisted: heldFindings }, checks: results.length, failed: failures, results }, null, 1) + "\n");
console.log(`\n${results.length} checks, ${results.length - failures} passed, ${failures} failed. Every request was answered or refused by this script; nothing real was contacted.`);
process.exit(failures ? 1 : 0);
