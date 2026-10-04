#!/usr/bin/env node
/**
 * Builds the distributable artifacts from widget/ sources:
 *
 *   widget/demo-standalone.html      single-file demo (widget inlined)
 *   dist/purge-quote-host.worker.js  paste-in Cloudflare Worker that hosts the
 *                                    widget at /purge-quote.js and a live demo at /
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

// --- standalone demo (widget inlined into one double-clickable file) ---
const standalone = demo
  .replace('<script src="purge-quote.js" defer></script>', "<script>\n" + js + "\n</script>")
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

// Google Ads conversion labels, e.g. "AW-123456789/AbC-dEfGhIjK". "" = off.
const GOOGLE_ADS_SEND_TO = "";        // fires at booking
const GOOGLE_ADS_SEND_TO_UNLOCK = ""; // fires at phone capture

// ╚═══════════════════════════════════════════════════════════════════╝

const WIDGET_JS = ${JSON.stringify(js)};

const DEMO_HTML = ${JSON.stringify(demo)};

// Injects the settings above into the widget at serve time.
const WIDGET_JS_FINAL = WIDGET_JS
  .replace('leadEndpoint: ""', "leadEndpoint: " + JSON.stringify(LEAD_ENDPOINT))
  .replace('reviewsEndpoint: ""', "reviewsEndpoint: " + JSON.stringify(REVIEWS_ENDPOINT))
  .replace('googleAdsSendTo: ""', "googleAdsSendTo: " + JSON.stringify(GOOGLE_ADS_SEND_TO))
  .replace('googleAdsSendToUnlock: ""', "googleAdsSendToUnlock: " + JSON.stringify(GOOGLE_ADS_SEND_TO_UNLOCK));

export default {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/purge-quote.js") {
      return new Response(WIDGET_JS_FINAL, {
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

console.log("built: widget/demo-standalone.html (%d KB)", Math.round(standalone.length / 1024));
console.log("built: dist/purge-quote-host.worker.js (%d KB)", Math.round(worker.length / 1024));
