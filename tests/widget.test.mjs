import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../widget/purge-quote.js", import.meta.url), "utf8");

test("current widget has no submit-true or partial phone-capture path", () => {
  assert.doesNotMatch(source, /submit-true/i);
  assert.doesNotMatch(source, /phone_captured/);
  assert.doesNotMatch(source, /quote_updated/);
});

test("recurring offer uses the defensible minimum value and explains the calculation", () => {
  assert.match(source, /Initial cleanup fee \(\$39\.99\+ value\): WAIVED/);
  assert.match(source, /Recurring service only — does not apply to one-time cleanups/);
  assert.match(source, /state\.frequency !== "onetime" \? promotionCardHtml\(\) : ""/);
  assert.match(source, /60-minute cleanup example/);
  assert.match(source, /Actual savings depend on the time required/);
  assert.doesNotMatch(source, /\$99/);
});

test("separates the Weekly recommendation from the customer's selected state", () => {
  assert.doesNotMatch(source, /popular-choice/);
  assert.match(source, /★ MOST POPULAR/);
  assert.match(source, /✓ Selected/);
  assert.match(source, /choice\[aria-pressed="true"\] \.choice-check/);
  assert.match(source, /custom-choice:not\(\[aria-pressed="true"\]\)/);
});

test("uses the supplied Purge Pros imagery and contains no WYSIWASH option", () => {
  assert.match(source, /69ffe0d6a7b9e0385a45dea3\.png/);
  assert.match(source, /69ffd15e54bc6e60ff18533a\.jpg/);
  assert.doesNotMatch(source, /WYSIWASH/i);
});

test("names selected charged areas instead of showing only an area count", () => {
  assert.match(source, /areas\.map\(function \(id\) \{ return CONFIG\.areaLabels\[id\]; \}\)\.join\(" \+ "\)/);
  assert.doesNotMatch(source, /areas\.length \+ " service areas"/);
});

test("estimate prompt points to the choices above it", () => {
  assert.match(source, /Complete the choices above/);
  assert.doesNotMatch(source, /Complete the choices below/);
});

test("describes billing as pay per visit without implying post-completion charging", () => {
  assert.match(source, /You pay per visit, never a monthly bill/);
  assert.match(source, /Pay per visit/);
  assert.doesNotMatch(source, /per completed visit/i);
});

test("disables unpublished dog-count frequencies and offers intentional custom booking", () => {
  assert.match(source, /maxDogs: 9/);
  assert.match(source, /maxDogs: 5/);
  assert.match(source, /maxDogs: 4/);
  assert.match(source, /Custom booking/);
  assert.match(source, /10\+ dogs · over 1 acre · kennels & commercial/);
  assert.match(source, /disabled aria-disabled="true"/);
  assert.match(source, /reconcileFrequencySelection/);
});

test("keeps existing GHL website trigger contract", () => {
  assert.match(source, /a\[href="#quote"\]/);
  assert.match(source, /a\[href="#get-quote"\]/);
  assert.match(source, /data-purge-quote/);
  assert.match(source, /window\.PurgeProsQuote/);
});

test("auto-opens from an ad landing URL without discarding attribution", () => {
  assert.match(source, /consumeAutoOpenRequest/);
  assert.match(source, /searchParams\.get\("open_quote"\)/);
  assert.match(source, /queryValue === "1"/);
  assert.match(source, /hashValue === "#quote"/);
  assert.match(source, /url\.searchParams\.delete\("open_quote"\)/);
  assert.match(source, /history\.replaceState/);
  assert.match(source, /utm_source/);
  assert.match(source, /utm_campaign/);
  assert.match(source, /utm_content/);
  assert.match(source, /utm_term/);
  assert.match(source, /openWhenBodyReady/);
  assert.match(source, /Opening your 60-second price check/);
  assert.match(source, /new MutationObserver/);
  assert.match(source, /if \(document\.body\)/);
  assert.match(source, /autoOpenObserver\.observe\(document\.documentElement/);
  assert.doesNotMatch(source, /addEventListener\("DOMContentLoaded", open/);
});

test("ad auto-open shows feedback and opens as soon as body is inserted", () => {
  const blockStart = source.indexOf("function showAutoOpenFeedback()");
  const blockEnd = source.indexOf("function cookieValue", blockStart);
  assert.ok(blockStart > 0 && blockEnd > blockStart);
  const autoOpenBlock = source.slice(blockStart, blockEnd);

  const classes = new Set();
  const elements = new Map();
  const documentElement = {
    classList: {
      add(value) { classes.add(value); },
      remove(value) { classes.delete(value); }
    }
  };
  const fakeDocument = {
    body: null,
    documentElement,
    head: {
      appendChild(element) { elements.set(element.id, element); }
    },
    createElement() {
      return {
        id: "",
        textContent: "",
        remove() { elements.delete(this.id); }
      };
    },
    getElementById(id) { return elements.get(id) || null; }
  };

  let observer = null;
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; observer = this; }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.disconnected = true; }
  }

  const run = new Function("document", "window", "MutationObserver", "queueMicrotask", `
    let autoOpenObserver = null;
    let autoOpenTimeout = null;
    const AUTO_OPEN_CLASS = "pp-quote-auto-opening";
    const AUTO_OPEN_STYLE_ID = "pp-quote-auto-opening-style";
    let opens = 0;
    function open() { hideAutoOpenFeedback(); opens += 1; }
    ${autoOpenBlock}
    openWhenBodyReady();
    return { get opens() { return opens; } };
  `);

  const result = run(
    fakeDocument,
    { setTimeout() { return 1; }, clearTimeout() {} },
    FakeMutationObserver,
    (callback) => callback()
  );

  assert.equal(result.opens, 0);
  assert.equal(classes.has("pp-quote-auto-opening"), true);
  assert.ok(observer);
  assert.equal(observer.target, documentElement);
  assert.deepEqual(observer.options, { childList: true, subtree: true });

  fakeDocument.body = { style: {} };
  observer.callback();
  assert.equal(result.opens, 1);
  assert.equal(classes.has("pp-quote-auto-opening"), false);
});

test("uses one unchecked service-text permission and no marketing checkbox", () => {
  assert.match(source, /preferredContact: "text"/);
  assert.match(source, /smsConsent: false/);
  assert.match(source, /To choose Text, select the service-text permission/);
  assert.match(source, /non-marketing text messages/);
  assert.match(source, /Text me about my quote and service/);
  assert.doesNotMatch(source, /pp-marketing-consent|marketingSmsConsent|marketingConsent/);
});

test("removes customer-facing phone-gate language", () => {
  assert.doesNotMatch(source, /no phone gate/i);
  assert.doesNotMatch(source, /phone gate/i);
});

test("waits for a successful endpoint response before tracking success", () => {
  const responseCheck = source.indexOf("!response.ok");
  const successTracking = source.indexOf("trackSuccess(payload, state.receipt");
  assert.ok(responseCheck > 0);
  assert.ok(successTracking > responseCheck);
});

test("stores low-risk plan progress but not contact PII", () => {
  assert.doesNotMatch(source, /localStorage/);
  const safeStart = source.indexOf("const safe = {");
  const safeEnd = source.indexOf("};", safeStart);
  const safeBlock = source.slice(safeStart, safeEnd);
  assert.doesNotMatch(safeBlock, /firstName|lastName|phone|email|address|city/);
});

test("includes keyboard and modal accessibility behavior", () => {
  assert.match(source, /event\.key === "Enter" && event\.target\.id === "pp-zip"/);
  assert.match(source, /event\.key === "Tab"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /previousFocus\.focus/);
});
