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
const worker = `// GENERATED FILE — do not edit by hand. Rebuild with: node tools/build-dist.js
// Paste the ENTIRE contents of this file into a Cloudflare Worker (e.g. the
// "purge-quote" worker) via Edit code -> select all -> replace -> Deploy.
//
//   https://<worker-url>/purge-quote.js   the widget (use in your site's script tag)
//   https://<worker-url>/                 a live demo page

const WIDGET_JS = ${JSON.stringify(js)};

const DEMO_HTML = ${JSON.stringify(demo)};

export default {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/purge-quote.js") {
      return new Response(WIDGET_JS, {
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
