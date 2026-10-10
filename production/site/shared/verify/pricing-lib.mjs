// Shared loader for the independent verification scripts in this folder.
// Everything here is OFFLINE: the Worker source is read from disk and evaluated
// in a node:vm context that has no fetch; the engine is loaded with require().
// Nothing in purge-pros-production is modified (read-only).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import nodeCrypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENGINE_PATH = path.resolve(HERE, "../pp-quote-core.js");
export const RELEASE_DIR = path.resolve(HERE, "../..");
export const SCOOP_DIR = path.resolve(HERE, "../../../..");
import { WORKER_PATH as PINNED_WORKER, WIDGET_PATH as PINNED_WIDGET } from "./pinned-live-source.mjs";
export const WORKER_PATH = PINNED_WORKER; // the pinned October 5 live source, or PP_PRODUCTION_SRC
export const WIDGET_PATH = PINNED_WIDGET;
export const BRIEF_PATH = path.join(RELEASE_DIR, "BRIEF.md");

// ---- network guard: any attempt to use the network from these scripts throws.
export const networkAttempts = [];
globalThis.fetch = function forbiddenFetch(url) {
  networkAttempts.push(String(url));
  throw new Error("NETWORK FORBIDDEN in verification scripts: " + String(url));
};

export function sha256(file) {
  return nodeCrypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// ---- the Worker's REAL code, evaluated whole (not rewritten, not excerpted).
// Only three textual changes, none of them inside pricing or validation:
//   1. the Cloudflare-only import becomes a stub base class
//   2. the two build-time bundle placeholders become empty strings
//   3. the ES-module export block at the very end is removed
export function loadWorker() {
  let source = fs.readFileSync(WORKER_PATH, "utf8");
  const importLine = /^import\s*\{\s*DurableObject\s*\}\s*from\s*"cloudflare:workers";\s*$/m;
  if (!importLine.test(source)) throw new Error("Worker import line not found; loader needs review");
  source = source.replace(importLine, "class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }");
  for (const placeholder of ["__PP_BUNDLE_WIDGET_JS__", "__PP_BUNDLE_QUOTE_LANDING_HTML__"]) {
    if (!source.includes(placeholder)) throw new Error("Worker placeholder " + placeholder + " not found");
    source = source.replace(placeholder, '""');
  }
  const exportBlock = /export\s*\{[^}]*\};?\s*(\/\/# sourceMappingURL=.*)?\s*$/;
  if (!exportBlock.test(source)) throw new Error("Worker export block not found; loader needs review");
  source = source.replace(exportBlock, "");

  const context = vm.createContext({
    URL, URLSearchParams, Response, Request, Headers, TextEncoder, TextDecoder,
    crypto: nodeCrypto.webcrypto, btoa, atob, console,
    setTimeout, clearTimeout
    // deliberately NO fetch
  });
  vm.runInContext(source, context, { filename: "worker.template.mjs" });
  const names = ["calculateQuote", "validateV3", "resumePlan", "resumeQuoteSummary", "cleanString"];
  for (const name of names) if (typeof context[name] !== "function") throw new Error("Worker function missing: " + name);
  const tables = ["SERVICE_ZIPS", "FREQUENCIES", "YARD_SIZES", "AREA_ADDERS", "AREA_LABELS", "LAST_CLEANED", "START_TIMINGS", "RESUME_FIELDS"];
  for (const name of tables) if (!context[name]) throw new Error("Worker table missing: " + name);
  const parseInRealm = vm.runInContext("(text) => JSON.parse(text)", context);
  // Values cross the wire as JSON, so that is how they are handed to the Worker code.
  const wire = (value) => parseInRealm(JSON.stringify(value));
  return {
    context,
    wire,
    SERVICE_ZIPS: context.SERVICE_ZIPS,
    FREQUENCIES: context.FREQUENCIES,
    YARD_SIZES: context.YARD_SIZES,
    AREA_ADDERS: context.AREA_ADDERS,
    AREA_LABELS: context.AREA_LABELS,
    LAST_CLEANED: context.LAST_CLEANED,
    START_TIMINGS: context.START_TIMINGS,
    RESUME_FIELDS: context.RESUME_FIELDS,
    PRICING_VERSION: context.PRICING_VERSION,
    SCHEMA_VERSION: context.SCHEMA_VERSION,
    MAX_BODY_BYTES: context.MAX_BODY_BYTES,
    // calculateQuote exactly as /submit and /quote-resume call it. A throw counts as "not accepted".
    quote(plan) {
      try { return context.calculateQuote(wire(plan)); } catch (error) { return { ok: false, threw: String(error && error.message) }; }
    },
    // The /submit acceptance test: schemaVersion gate, then validateV3 (handleLeadSubmission).
    acceptsSubmit(payload) {
      const text = JSON.stringify(payload);
      if (Buffer.byteLength(text, "utf8") > context.MAX_BODY_BYTES) return { ok: false, errors: ["TOO_LARGE"] };
      const lead = parseInRealm(text);
      if (!lead || typeof lead !== "object" || Array.isArray(lead)) return { ok: false, errors: ["INVALID_REQUEST"] };
      if (lead.schemaVersion !== context.SCHEMA_VERSION) return { ok: false, errors: ["schemaVersion"] };
      try {
        const result = context.validateV3(lead);
        return { ok: result.ok, errors: Array.from(result.errors), values: result.values };
      } catch (error) { return { ok: false, errors: ["THREW:" + String(error && error.message)] }; }
    },
    // The /quote-resume acceptance test (handleQuoteResume -> resumePlan).
    acceptsSaveLink(body) {
      try {
        const plan = context.resumePlan(wire(body));
        if (!plan) return { ok: false };
        return { ok: true, plan: JSON.parse(JSON.stringify(plan)), quote: JSON.parse(JSON.stringify(context.resumeQuoteSummary(plan))) };
      } catch (error) { return { ok: false, threw: String(error && error.message) }; }
    }
  };
}

// ---- the engine under test. `transform` lets the mutation sanity script
// evaluate an altered copy IN MEMORY (no file is written).
export function loadEngine(transform) {
  if (!transform) return createRequire(import.meta.url)(ENGINE_PATH);
  const original = fs.readFileSync(ENGINE_PATH, "utf8");
  const mutated = transform(original);
  if (mutated === original) throw new Error("mutation did not change the engine source");
  const module = { exports: {} };
  const run = new Function("module", "exports", mutated);
  run.call(globalThis, module, module.exports);
  return module.exports;
}

// ---- the live widget's ZIP list, read as text (the widget is not executed).
export function widgetZips() {
  const source = fs.readFileSync(WIDGET_PATH, "utf8");
  const match = source.match(/serviceZips:\s*\[([\s\S]*?)\]/);
  if (!match) throw new Error("widget serviceZips not found");
  return match[1].match(/\d{5}/g);
}

export function briefZips() {
  const source = fs.readFileSync(BRIEF_PATH, "utf8");
  const match = source.match(/Accepted ZIPs:([^\n]*)/);
  if (!match) throw new Error("brief ZIP list not found");
  return match[1].match(/\d{5}/g);
}

// ---- deterministic PRNG (mulberry32)
export function prng(seed) {
  let a = seed >>> 0;
  const next = function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (n) => Math.floor(next() * n);
  next.pick = (list) => list[Math.floor(next() * list.length)];
  next.chance = (p) => next() < p;
  return next;
}

export function memoryStorage(seed) {
  const items = Object.assign({}, seed || {});
  return {
    items,
    getItem: (key) => (Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null),
    setItem: (key, value) => { items[key] = String(value); },
    removeItem: (key) => { delete items[key]; }
  };
}

// A store with every outside dependency replaced. Demo mode unless options say otherwise.
export function makeStore(PP, options) {
  const settings = options || {};
  let clock = 1760000000000;
  let ids = 0;
  const storage = settings.storage || memoryStorage();
  const fetchCalls = [];
  const random = settings.random || prng(12345);
  const location = settings.location || {
    href: "https://review.invalid/page" + (settings.search || ""), origin: "https://review.invalid", protocol: "https:",
    hostname: "review.invalid", host: "review.invalid", pathname: "/page", search: settings.search || "", hash: ""
  };
  const fetchImpl = settings.fetch
    ? function (url, init) { fetchCalls.push({ url: String(url), init }); return settings.fetch(String(url), init); }
    : function (url, init) { fetchCalls.push({ url: String(url), init }); throw new Error("network forbidden in tests"); };
  const store = PP.create(Object.assign({
    mode: "demo",
    storage,
    now: () => (clock += 1000),
    uuid: () => "00000000-0000-4000-8000-" + String(++ids).padStart(12, "0"),
    random,
    readCookie: () => "",
    location,
    history: null,
    console: null,
    wait: () => Promise.resolve(),
    fetch: fetchImpl
  }, settings.create || {}));
  return { store, storage, fetchCalls };
}

// ---- tiny reporting helper
export function reporter() {
  const counts = {};
  const failures = new Map();
  const notes = [];
  return {
    counts, failures, notes,
    check(area, condition, title, detail) {
      counts[area] = (counts[area] || 0) + 1;
      if (condition) return true;
      const key = area + " :: " + title;
      const entry = failures.get(key) || { area, title, count: 0, examples: [] };
      entry.count += 1;
      if (entry.examples.length < 4) entry.examples.push(typeof detail === "function" ? detail() : detail);
      failures.set(key, entry);
      return false;
    },
    note(text) { notes.push(text); },
    print(heading) {
      console.log("\n==== " + heading + " ====");
      for (const area of Object.keys(counts)) console.log("  checks  " + String(counts[area]).padStart(9) + "  " + area);
      if (notes.length) { console.log("  notes:"); for (const text of notes) console.log("    - " + text); }
      if (!failures.size) { console.log("  RESULT: no failures"); return 0; }
      console.log("  RESULT: " + failures.size + " distinct failure(s)");
      for (const entry of failures.values()) {
        console.log("  FAIL [" + entry.area + "] " + entry.title + "  (x" + entry.count + ")");
        for (const example of entry.examples) console.log("       " + JSON.stringify(example));
      }
      return failures.size;
    }
  };
}

export const money = (cents) => "$" + (cents / 100).toFixed(2);
