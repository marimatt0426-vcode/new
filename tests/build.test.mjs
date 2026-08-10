import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("standalone demo contains one safe closing script tag", async () => {
  const html = await readFile(new URL("../widget/demo-standalone.html", import.meta.url), "utf8");
  const closingTags = html.match(/<\/script/gi) || [];
  assert.equal(closingTags.length, 1);
  assert.match(html, /PurgeProsQuote/);
});

test("generated host Worker has endpoints but no embedded secret", async () => {
  const worker = await readFile(new URL("../dist/purge-quote-host.worker.js", import.meta.url), "utf8");
  assert.match(worker, /purge-lead-relay\.purgepros\.workers\.dev/);
  assert.doesNotMatch(worker, /GHL_WEBHOOK_URL\s*=\s*["'][^"']+/);
  assert.doesNotMatch(worker, /META_CAPI_TOKEN\s*=\s*["'][^"']+/);
});

test("generated clean-replacement Worker combines hosting and secure submission", async () => {
  const worker = await readFile(new URL("../dist/purge-pros-quote-v3.worker.js", import.meta.url), "utf8");
  assert.match(worker, /url\.pathname === "\/purge-quote\.js"/);
  assert.match(worker, /url\.pathname === "\/submit"/);
  assert.match(worker, /async function handleLeadSubmission/);
  assert.match(worker, /ACCEPT_LEGACY_WIDGET: "false"/);
  assert.match(worker, /ACCEPT_LEGACY_WIDGET: "true"/);
  assert.match(worker, /GHL_WEBHOOK_URL_V3/);
  assert.match(worker, /AW-17767139897\/g9smCM7pkL4cELmUhJhC/);
  assert.doesNotMatch(worker, /vX_bCO_4kL4cELmUhJhC/);
  assert.match(worker, /quoteSummary/);
  assert.match(worker, /PROMO_ENABLED/);
  assert.doesNotMatch(worker, /marketingSmsConsent|marketingConsentVersion/);
  assert.doesNotMatch(worker, /WYSIWASH/i);
  assert.doesNotMatch(worker, /purge-lead-relay\.purgepros\.workers\.dev/);
  assert.doesNotMatch(worker, /GHL_WEBHOOK_URL\s*=\s*["'][^"']+/);
  assert.doesNotMatch(worker, /META_CAPI_TOKEN\s*=\s*["'][^"']+/);
});

test("owner copy/paste file is the exact tested combined Worker", async () => {
  const tested = await readFile(new URL("../dist/purge-pros-quote-v3.worker.js", import.meta.url), "utf8");
  const ownerCopy = await readFile(new URL("../dist/COPY-PASTE-INTO-purge-lead-relay.js", import.meta.url), "utf8");
  assert.equal(ownerCopy, tested);
});

test("owner GHL loader copy is exact and starts before the external widget", async () => {
  const source = await readFile(new URL("../widget/ghl-quote-loader.html", import.meta.url), "utf8");
  const ownerCopy = await readFile(new URL("../dist/PASTE-INTO-GHL-QUOTE-LOADER.html", import.meta.url), "utf8");
  assert.equal(ownerCopy, source);
  assert.match(ownerCopy, /searchParams\.get\("open_quote"\)/);
  assert.match(ownerCopy, /Opening your 60-second price check/);
  assert.match(ownerCopy, /pp-quote-auto-opening-style/);
  assert.match(ownerCopy, /<script async src="https:\/\/purge-lead-relay\.purgepros\.workers\.dev\/purge-quote\.js"><\/script>/);
  assert.ok(ownerCopy.indexOf("pp-quote-auto-opening-style") < ownerCopy.indexOf("<script async src="));
});

test("inline GHL starter displays before the external widget and safely times out", async () => {
  const source = await readFile(new URL("../widget/ghl-quote-loader.html", import.meta.url), "utf8");
  const inline = source.match(/<script>\s*([\s\S]*?)<\/script>/i);
  assert.ok(inline);

  const classes = new Set();
  const elements = new Map();
  let timeoutCallback = null;
  const root = {
    classList: {
      add(value) { classes.add(value); },
      remove(value) { classes.delete(value); }
    }
  };
  const document = {
    documentElement: root,
    head: { appendChild(element) { element.parentNode = this; elements.set(element.id, element); } },
    createElement() { return { id: "", textContent: "", parentNode: null }; },
    getElementById(id) { return elements.get(id) || null; }
  };
  document.head.removeChild = function (element) { elements.delete(element.id); element.parentNode = null; };
  const window = {
    location: { href: "https://itspurgepros.com/?open_quote=1&utm_source=test" },
    setTimeout(callback) { timeoutCallback = callback; return 1; },
    __ppQuoteInlineLoaderTimeout: null
  };

  new Function("window", "document", "URL", inline[1])(window, document, URL);
  assert.equal(classes.has("pp-quote-auto-opening"), true);
  assert.ok(elements.has("pp-quote-auto-opening-style"));
  assert.equal(typeof timeoutCallback, "function");

  timeoutCallback();
  assert.equal(classes.has("pp-quote-auto-opening"), false);
  assert.equal(elements.has("pp-quote-auto-opening-style"), false);
});
