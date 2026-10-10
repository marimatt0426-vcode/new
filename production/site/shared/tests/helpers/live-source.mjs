// Loads the LIVE quote tool's own code, read-only, so the engine can be
// compared with it instead of with a hand-written copy.
//
//   worker  - the Cloudflare Worker's pricing, validation, forwarding and
//             save-link functions, cut out of worker.template.mjs and
//             evaluated in a sandbox. Nothing is rewritten by hand.
//   widget  - the live front end's CONFIG, calculateQuote and constants, cut
//             out of widget.js the same way.
//
// Nothing here imports, runs or modifies the production files as programs,
// and no network request is made.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// The LIVE source the tests compare with: the pinned copy of the October 5, 2026 release (commit aa9f81d of the
// production repository), shared/tests/fixtures/live-2026-10-05/. PP_PRODUCTION_SRC=<folder> compares with another
// source instead (for example a checkout's production/quote/src). The production checkout is not the default any
// more: it moves between branches, and on the Worker candidate branch widget.js is no longer there.
export const PINNED_LIVE_SRC = path.resolve(here, "../fixtures/live-2026-10-05");
export const PRODUCTION_SRC = process.env.PP_PRODUCTION_SRC || PINNED_LIVE_SRC;

export const workerText = fs.readFileSync(path.join(PRODUCTION_SRC, "worker.template.mjs"), "utf8");
export const widgetText = fs.readFileSync(path.join(PRODUCTION_SRC, "widget.js"), "utf8");

// The text from `start` up to (not including) `end`. Throws if either marker
// has moved, so a change in the live source is noticed instead of ignored.
function between(source, start, end) {
  const from = source.indexOf(start);
  if (from < 0) throw new Error("Marker not found in live source: " + start);
  const to = source.indexOf(end, from + start.length);
  if (to < 0) throw new Error("End marker not found in live source: " + end);
  return source.slice(from, to);
}

// Values made inside the sandbox belong to another realm, so strict deep
// equality with ordinary objects fails on prototypes. Compare plain copies.
export function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

/* ---- the Worker ---------------------------------------------------------- */

function loadWorker() {
  const constants = between(workerText, "var SCHEMA_VERSION = ", "var VOICE_FREQUENCY_ALIASES");
  const pricing = between(workerText, "function cleanString(value, max = 500) {", "function normalizeVoiceText(");
  const validation = between(workerText, "function validateV3(lead) {", "async function handleReviews(");
  const resume = between(workerText, "var RESUME_TTL_MS", "async function resumePricingFingerprint(");
  const fingerprintBlock = between(workerText, "async function quoteRequestFingerprint(forward) {", "const material = fields.map");
  const fingerprintFields = fingerprintBlock.slice(fingerprintBlock.indexOf("const fields = ["));

  const sandbox = { console, URL, TextEncoder };
  vm.createContext(sandbox);
  vm.runInContext(
    [
      "var __name = function (target) { return target; };",
      constants,
      pricing,
      validation,
      resume,
      "var FINGERPRINT_FIELDS = (function () { " + fingerprintFields + " return fields; })();",
      "this.live = { SCHEMA_VERSION, PRICING_VERSION, MAX_BODY_BYTES, DEFAULT_ALLOWED_ORIGINS, SERVICE_ZIPS, FREQUENCIES,",
      "  AREA_LABELS, AREA_ADDERS, YARD_SIZES, LAST_CLEANED, START_TIMINGS, PREFERRED_CONTACTS,",
      "  cleanString, normalizePhone, validEmail, calculateQuote, validateV3, cleanAttribution, buildV3Forward,",
      "  RESUME_FIELDS, RESUME_TOKEN_RE, resumePlan, FINGERPRINT_FIELDS };"
    ].join("\n"),
    sandbox,
    { filename: "worker.template.mjs (extracted)" }
  );
  return sandbox.live;
}

export const worker = loadWorker();

// A stand-in for the Request the Worker reads the User-Agent from.
export const fakeRequest = { headers: { get: function () { return "node-test"; } } };

/* ---- the live widget ----------------------------------------------------- */

function loadWidget() {
  const configBlock = between(widgetText, "  const CONFIG = {", "\n\n  const ATTRIBUTION_KEYS");
  const configObject = configBlock.slice(configBlock.indexOf("{"), configBlock.lastIndexOf("};") + 1);
  const constants = between(widgetText, "  const ATTRIBUTION_KEYS", "\n\n  const ICON_ASSET_URLS");
  const calculate = between(widgetText, "  function calculateQuote(input) {", "\n\n  function currentQuote()");
  const fingerprintBlock = between(widgetText, "  function submissionFingerprint(payload) {", "    return JSON.stringify(materialFields.map");
  const materialFields = fingerprintBlock.slice(fingerprintBlock.indexOf("const materialFields = ["));

  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    [
      "const CONFIG = " + configObject + ";",
      constants,
      calculate,
      "const FINGERPRINT_FIELDS = (function () { " + materialFields + " return materialFields; })();",
      "this.live = { CONFIG, ATTRIBUTION_KEYS, LAST_CLEANED_CHOICES, LOW_RISK_STORAGE_KEY, ATTRIBUTION_STORAGE_KEY, calculateQuote, FINGERPRINT_FIELDS };"
    ].join("\n"),
    sandbox,
    { filename: "widget.js (extracted)" }
  );
  return sandbox.live;
}

export const widget = loadWidget();
