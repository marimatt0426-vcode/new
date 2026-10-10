// Independent verifier support (contract lens). Written from scratch; it does
// not import anything from ../tests.
//
// What this file does:
//   1. Arms hard network tripwires at the Node level (fetch, sockets, DNS,
//      http, https). Any real network attempt is recorded and throws.
//   2. Evaluates the WHOLE live Worker source
//      (purge-pros-production/production/quote/src/worker.template.mjs) in
//      process, unchanged except for: the `cloudflare:workers` import line
//      (replaced by a stub base class), the two build placeholders (replaced
//      by empty strings) and the trailing `export {}` block (replaced by a
//      `return` of the same bindings plus the internals we inspect).
//      No validation, pricing, forwarding, ledger or save-link code is rewritten.
//   3. Gives the Worker in-memory Durable Object storage and a stand-in for
//      the team's upstream webhook, so /submit, /quote-resume and
//      /quote-resume/open run end to end with the real replay ledger.
//
// The production files are only READ. Nothing is sent anywhere: every host
// name used here is under the reserved .test TLD and never leaves the process.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import net from "node:net";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/* ---- 1. network tripwires ------------------------------------------------ */

export const networkAttempts = [];
function trip(via) {
  return function (...args) {
    let target = "";
    try { target = typeof args[0] === "string" ? args[0] : args[0] && args[0].url ? String(args[0].url) : JSON.stringify(args[0]); } catch (_) { target = "?"; }
    networkAttempts.push({ via, target });
    throw new Error("NETWORK BLOCKED by contract-check (" + via + " -> " + target + ")");
  };
}
globalThis.fetch = trip("globalThis.fetch");
net.Socket.prototype.connect = trip("net.Socket.connect");
net.connect = trip("net.connect");
net.createConnection = trip("net.createConnection");
dns.lookup = trip("dns.lookup");
dns.resolve = trip("dns.resolve");
http.request = trip("http.request");
http.get = trip("http.get");
https.request = trip("https.request");
https.get = trip("https.get");
if (typeof globalThis.WebSocket === "function") globalThis.WebSocket = function (...args) { return trip("WebSocket")(...args); };
if (typeof globalThis.EventSource === "function") globalThis.EventSource = function (...args) { return trip("EventSource")(...args); };

/* ---- 2. the live Worker, evaluated whole ---------------------------------- */

import { PRODUCTION_SRC as PINNED_OR_GIVEN } from "./pinned-live-source.mjs";
export const PRODUCTION_SRC = PINNED_OR_GIVEN; // the pinned October 5 live source, or PP_PRODUCTION_SRC
export const workerSourcePath = path.join(PRODUCTION_SRC, "worker.template.mjs");
export const widgetSourcePath = path.join(PRODUCTION_SRC, "widget.js");
export const workerSource = fs.readFileSync(workerSourcePath, "utf8");
export const widgetSource = fs.readFileSync(widgetSourcePath, "utf8");

const IMPORT_LINE = 'import { DurableObject } from "cloudflare:workers";';
function loadWorker(upstreamFetch) {
  let text = workerSource;
  if (!text.includes(IMPORT_LINE)) throw new Error("Worker source changed: import line not found");
  text = text.replace(IMPORT_LINE, "");
  // The build placeholders (the October 5 release has __PP_BUNDLE_WIDGET_JS__ and __PP_BUNDLE_QUOTE_LANDING_HTML__; the
  // v5 candidate has __PP_BUNDLE_LAUNCHER_JS__). Each stands for a file's text and becomes an empty string here.
  const placeholders = [...new Set(text.match(/__PP_BUNDLE_[A-Z0-9_]+__/g) || [])];
  if (!placeholders.length) throw new Error("Worker source changed: no __PP_BUNDLE_...__ build placeholder found");
  for (const placeholder of placeholders) text = text.split(placeholder).join('""');
  const exportAt = text.lastIndexOf("\nexport {");
  if (exportAt < 0) throw new Error("Worker source changed: export block not found");
  text = text.slice(0, exportAt);
  const names = [
    "worker_default", "QuoteRequestLedger",
    "validateV3", "calculateQuote", "buildV3Forward", "quoteRequestFingerprint", "cleanAttribution",
    "cleanString", "normalizePhone", "validEmail", "originAllowed",
    "resumePlan", "resumeQuoteSummary", "handleQuoteResume",
    "SCHEMA_VERSION", "PRICING_VERSION", "MAX_BODY_BYTES", "DEFAULT_ALLOWED_ORIGINS", "SERVICE_ZIPS",
    "FREQUENCIES", "AREA_LABELS", "AREA_ADDERS", "YARD_SIZES", "LAST_CLEANED", "START_TIMINGS", "PREFERRED_CONTACTS",
    "RESUME_FIELDS", "RESUME_TOKEN_RE", "RESUME_TTL_MS"
  ];
  const wrapped = '(function (DurableObject, fetch, caches) {\n"use strict";\n' + text + "\nreturn { " + names.join(", ") + " };\n})";
  const factory = vm.runInThisContext(wrapped, { filename: "worker.template.mjs (live source, evaluated whole)" });
  class DurableObjectStub { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }
  return factory(DurableObjectStub, upstreamFetch, undefined);
}

/* ---- 3. an offline Worker instance ---------------------------------------- */

export const WORKER_ORIGIN = "https://relay.contract-check.test"; // never resolved; in-process only
export const UPSTREAM_URL = "https://team-webhook.contract-check.test/hook"; // stand-in for the team's system
export const SITE_ORIGIN = "https://itspurgepros.com"; // only ever used as an Origin header VALUE in process

// makeWorker() -> a fresh Worker with empty storage.
//   upstream.mode: "ok" | "throw" | "http500"     how the team's system answers
//   upstream.received: every forward the Worker handed to the team's system
export function makeWorker() {
  const upstream = { mode: "ok", received: [], calls: 0 };
  async function upstreamFetch(url, init) {
    const target = String(url && url.url ? url.url : url);
    if (target !== UPSTREAM_URL) {
      networkAttempts.push({ via: "worker-side fetch", target });
      throw new Error("NETWORK BLOCKED by contract-check (worker fetch -> " + target + ")");
    }
    upstream.calls += 1;
    if (upstream.mode === "throw") throw new Error("upstream unreachable (simulated)");
    if (upstream.mode === "http500") return new Response("no", { status: 500 });
    upstream.received.push(JSON.parse(init.body));
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }
  const W = loadWorker(upstreamFetch);
  const instances = new Map();
  const holder = { env: null };
  const namespace = {
    idFromName(name) { return String(name); },
    get(id) {
      return {
        fetch: async function (request) {
          let instance = instances.get(id);
          if (!instance) {
            const data = new Map();
            let chain = Promise.resolve();
            const ctx = {
              storage: {
                async get(key) { return data.has(key) ? structuredClone(data.get(key)) : undefined; },
                async put(key, value) { data.set(key, structuredClone(value)); },
                async delete(key) { return data.delete(key); },
                async setAlarm() {}
              },
              blockConcurrencyWhile(fn) { const run = chain.then(function () { return fn(); }); chain = run.catch(function () {}); return run; },
              waitUntil(promise) { Promise.resolve(promise).catch(function () {}); }
            };
            instance = { object: new W.QuoteRequestLedger(ctx, holder.env), data };
            instances.set(id, instance);
          }
          return instance.object.fetch(request);
        }
      };
    }
  };
  holder.env = { QUOTE_REQUESTS: namespace, GHL_WEBHOOK_URL_V3: UPSTREAM_URL };

  // call("/submit", { body, origin, contentType, ip }) -> { status, json, text }
  async function call(pathname, options) {
    const o = options || {};
    const headers = { "User-Agent": "contract-check/1.0 (offline)" };
    if (o.contentType !== null) headers["Content-Type"] = o.contentType || "application/json";
    if (o.origin !== null) headers.Origin = o.origin || SITE_ORIGIN;
    if (o.ip !== null) headers["CF-Connecting-IP"] = o.ip || "203.0.113.7";
    const method = o.method || "POST";
    const body = typeof o.body === "string" ? o.body : JSON.stringify(o.body);
    const request = new Request(WORKER_ORIGIN + pathname, { method, headers, body: method === "POST" ? body : undefined });
    const response = await W.worker_default.fetch(request, o.env || holder.env, { waitUntil() {} });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) { json = null; }
    return { status: response.status, json, text };
  }

  return { W, upstream, instances, holder, call };
}
