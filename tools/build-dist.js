#!/usr/bin/env node
/**
 * Builds the distributable artifacts from widget/ sources:
 *
 *   widget/demo-standalone.html      single-file demo (widget inlined)
 *   dist/purge-quote-host.worker.js  paste-in Cloudflare Worker that hosts the
 *                                    widget at /purge-quote.js and a live demo at /
 *   dist/purge-pros-quote-v3.worker.js one paste-in Cloudflare Worker that hosts
 *                                    the widget and securely handles submissions
 *
 * Run after ANY edit to widget/purge-quote.js or widget/demo.html:
 *   node tools/build-dist.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const js = fs.readFileSync(path.join(root, "widget", "purge-quote.js"), "utf8");
const demo = fs.readFileSync(path.join(root, "widget", "demo.html"), "utf8");
const relay = fs.readFileSync(path.join(root, "worker", "worker.js"), "utf8");
const inlineJs = js.replace(/<\/script/gi, "<\\/script");

// --- standalone demo (widget inlined into one double-clickable file) ---
const standalone = demo
  .replace('<script src="purge-quote.js" defer></script>', "<script>\n" + inlineJs + "\n</script>")
  .replace(
    "Leads log to the browser console until <code>leadEndpoint</code> is set in purge-quote.js.",
    "Standalone demo &mdash; the widget is embedded in this one file. Leads log to the browser console (F12) until <code>leadEndpoint</code> is set."
  );
fs.writeFileSync(path.join(root, "widget", "demo-standalone.html"), standalone);

// --- paste-in hosting worker ---
const worker = `// GENERATED FILE — rebuild with: node tools/build-dist.js
// Paste the ENTIRE contents into a Cloudflare Worker (e.g. "purge-quote") via
// Edit code -> select all -> replace -> Deploy.
//
//   https://<worker-url>/purge-quote.js   the widget (use in your site's script tag)
//   https://<worker-url>/                 a live demo page

// ╔══════════════════════ EDIT THESE LINES ONLY ══════════════════════╗
// Everything below this block is generated — never edit it by hand.

// Your purge-lead-relay worker URL — pre-filled; verify it matches yours.
const LEAD_ENDPOINT = "https://purge-lead-relay.purgepros.workers.dev";

// Same relay URL + "/reviews" for the live Google review chip.
const REVIEWS_ENDPOINT = "https://purge-lead-relay.purgepros.workers.dev/reviews";

// Existing Google Ads service-request conversion label, if you use one.
// Example: "AW-123456789/AbC-dEfGhIjK". Leave blank when GTM/GA4 owns it.
const GOOGLE_ADS_SEND_TO = "AW-17767139897/g9smCM7pkL4cELmUhJhC";

// Keep true when this widget owns the browser Meta events. Set false only when
// an existing GTM/Meta setup already fires the same events from this data layer.
const FIRE_META_PIXEL_EVENTS = true;

// Optional Cloudflare plaintext variables can change the offer without editing
// this file: PROMO_ENABLED, PROMO_BADGE, PROMO_TITLE, PROMO_DETAIL, and the
// additional PROMO_* popup fields documented in the owner guide.

// ╚═══════════════════════════════════════════════════════════════════╝

const WIDGET_JS = ${JSON.stringify(js)};

const DEMO_HTML = ${JSON.stringify(demo)};

function promotionOverride(env) {
  const override = {};
  if (env && typeof env.PROMO_ENABLED === "string") override.enabled = env.PROMO_ENABLED.toLowerCase() !== "false";
  const fields = {
    PROMO_BADGE: "badge",
    PROMO_TITLE: "title",
    PROMO_DETAIL: "detail",
    PROMO_ELIGIBILITY: "eligibility",
    PROMO_LINK_LABEL: "linkLabel",
    PROMO_MODAL_TITLE: "modalTitle",
    PROMO_MODAL_INTRO: "modalIntro",
    PROMO_FIRST_LABEL: "firstThirtyLabel",
    PROMO_FIRST_VALUE: "firstThirtyValue",
    PROMO_ADDITIONAL_LABEL: "additionalLabel",
    PROMO_ADDITIONAL_VALUE: "additionalValue",
    PROMO_EXAMPLE_LABEL: "exampleLabel",
    PROMO_EXAMPLE_VALUE: "exampleValue",
    PROMO_CUSTOMER_LABEL: "customerLabel",
    PROMO_CUSTOMER_VALUE: "customerValue",
    PROMO_DISCLAIMER: "disclaimer"
  };
  Object.keys(fields).forEach(function (name) {
    if (env && typeof env[name] === "string" && env[name].trim()) override[fields[name]] = env[name].trim();
  });
  return override;
}

// Injects endpoint/tracking settings and optional promotion variables at serve time.
function widgetScript(env) {
  const configured = WIDGET_JS
    .replace('leadEndpoint: ""', "leadEndpoint: " + JSON.stringify(LEAD_ENDPOINT))
    .replace('reviewsEndpoint: ""', "reviewsEndpoint: " + JSON.stringify(REVIEWS_ENDPOINT))
    .replace('googleAdsSendTo: ""', "googleAdsSendTo: " + JSON.stringify(GOOGLE_ADS_SEND_TO))
    .replace('firePixelEvents: true', "firePixelEvents: " + JSON.stringify(FIRE_META_PIXEL_EVENTS));
  return configured + "\\nObject.assign(window.PurgeProsQuote.config.promotion," + JSON.stringify(promotionOverride(env)) + ");";
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === "/purge-quote.js") {
      return new Response(widgetScript(env), {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          // short cache so config edits go live within ~5 minutes
          "Cache-Control": "public, max-age=300",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
    if (path === "/" || path === "/demo" || path === "/demo.html") {
      return new Response(DEMO_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
      });
    }
    return new Response("Not found", { status: 404 });
  }
};
`;
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist", "purge-quote-host.worker.js"), worker);

// --- backward-compatible combined Worker: new host + v3 and legacy submission handlers ---
// Convert the relay's module handler to a named function so the same tested relay
// logic can be routed by this single-file Worker without a second deployment.
const relayCore = relay
  .replace(
    /export default \{\s*async fetch\(request, env, ctx\) \{/,
    "async function handleLeadSubmission(request, env, ctx) {"
  )
  .replace(/\n  \}\n\};\s*$/, "\n}\n");

if (!relayCore.includes("async function handleLeadSubmission")) {
  throw new Error("Could not convert relay handler for combined Worker");
}

const combinedWorker = `// GENERATED, SINGLE-FILE CLOUDFLARE WORKER — OWNER COPY/PASTE FILE
// Paste this entire file into the EXISTING "purge-lead-relay" Cloudflare Worker.
// It preserves the old widget at POST / while adding the v3 widget and webhook
// at separate routes. Do not replace the existing "purge-quote" Worker at launch.
//
// Routes:
//   GET  /                 v3 preview page
//   GET  /purge-quote.js   website widget script
//   GET  /reviews          live Google review count/rating
//   POST /                 existing widget -> existing GHL workflow
//   POST /submit           v3 widget -> new GHL v3 workflow
//
// Existing required secret: GHL_WEBHOOK_URL (leave its current value untouched)
// New required secret: GHL_WEBHOOK_URL_V3 (new v3 Inbound Webhook URL)
// Optional secrets: GOOGLE_PLACES_API_KEY, GOOGLE_PLACE_ID,
//                   META_PIXEL_ID, META_CAPI_TOKEN, META_TEST_EVENT_CODE
// Plain variable: ALLOWED_ORIGINS=https://itspurgepros.com,https://www.itspurgepros.com,https://purge-quote.purgepros.workers.dev
// Optional promotion variables: PROMO_ENABLED, PROMO_BADGE, PROMO_TITLE,
//                               PROMO_DETAIL, PROMO_ELIGIBILITY, and popup PROMO_* fields.
//
// Google Ads service-request conversion retained from the current production code.
// The former phone-unlock conversion is intentionally not fired by v3 because v3
// shows pricing before contact information and therefore has no "quote unlock."

const GOOGLE_ADS_SEND_TO = "AW-17767139897/g9smCM7pkL4cELmUhJhC";
const FIRE_META_PIXEL_EVENTS = true;

const WIDGET_JS = ${JSON.stringify(js)};
const DEMO_HTML = ${JSON.stringify(demo)};

function promotionOverride(env) {
  const override = {};
  if (env && typeof env.PROMO_ENABLED === "string") override.enabled = env.PROMO_ENABLED.toLowerCase() !== "false";
  const fields = {
    PROMO_BADGE: "badge",
    PROMO_TITLE: "title",
    PROMO_DETAIL: "detail",
    PROMO_ELIGIBILITY: "eligibility",
    PROMO_LINK_LABEL: "linkLabel",
    PROMO_MODAL_TITLE: "modalTitle",
    PROMO_MODAL_INTRO: "modalIntro",
    PROMO_FIRST_LABEL: "firstThirtyLabel",
    PROMO_FIRST_VALUE: "firstThirtyValue",
    PROMO_ADDITIONAL_LABEL: "additionalLabel",
    PROMO_ADDITIONAL_VALUE: "additionalValue",
    PROMO_EXAMPLE_LABEL: "exampleLabel",
    PROMO_EXAMPLE_VALUE: "exampleValue",
    PROMO_CUSTOMER_LABEL: "customerLabel",
    PROMO_CUSTOMER_VALUE: "customerValue",
    PROMO_DISCLAIMER: "disclaimer"
  };
  Object.keys(fields).forEach(function (name) {
    if (env && typeof env[name] === "string" && env[name].trim()) override[fields[name]] = env[name].trim();
  });
  return override;
}

function widgetScript(request, env) {
  const origin = new URL(request.url).origin;
  const configured = WIDGET_JS
    .replace('leadEndpoint: ""', "leadEndpoint: " + JSON.stringify(origin + "/submit"))
    .replace('reviewsEndpoint: ""', "reviewsEndpoint: " + JSON.stringify(origin + "/reviews"))
    .replace('googleAdsSendTo: ""', "googleAdsSendTo: " + JSON.stringify(GOOGLE_ADS_SEND_TO))
    .replace('firePixelEvents: true', "firePixelEvents: " + JSON.stringify(FIRE_META_PIXEL_EVENTS));
  return configured + "\\nObject.assign(window.PurgeProsQuote.config.promotion," + JSON.stringify(promotionOverride(env)) + ");";
}

${relayCore}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/purge-quote.js") {
      return new Response(widgetScript(request, env), {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "public, max-age=300",
          "Access-Control-Allow-Origin": "*",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/demo" || url.pathname === "/demo.html")) {
      return new Response(DEMO_HTML, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin"
        }
      });
    }
    if (url.pathname === "/reviews" && request.method === "GET") return handleReviews(request, env);
    if (url.pathname === "/submit" && (request.method === "POST" || request.method === "OPTIONS")) {
      return handleLeadSubmission(request, {
        ...env,
        GHL_WEBHOOK_URL: env.GHL_WEBHOOK_URL_V3 || "",
        ACCEPT_LEGACY_WIDGET: "false"
      }, ctx);
    }
    if (url.pathname === "/" && (request.method === "POST" || request.method === "OPTIONS")) {
      return handleLeadSubmission(request, { ...env, ACCEPT_LEGACY_WIDGET: "true" }, ctx);
    }
    return new Response("Not found", { status: 404 });
  }
};
`;

fs.writeFileSync(path.join(root, "dist", "purge-pros-quote-v3.worker.js"), combinedWorker);
fs.writeFileSync(path.join(root, "dist", "COPY-PASTE-INTO-purge-lead-relay.js"), combinedWorker);

console.log("built: widget/demo-standalone.html (%d KB)", Math.round(standalone.length / 1024));
console.log("built: dist/purge-quote-host.worker.js (%d KB)", Math.round(worker.length / 1024));
console.log("built: dist/purge-pros-quote-v3.worker.js (%d KB)", Math.round(combinedWorker.length / 1024));
console.log("built: dist/COPY-PASTE-INTO-purge-lead-relay.js (%d KB)", Math.round(combinedWorker.length / 1024));
