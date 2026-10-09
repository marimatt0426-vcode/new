var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// dist/worker.mjs
import { DurableObject } from "cloudflare:workers";
function replayReply(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
__name(replayReply, "replayReply");
function uncertainQuoteReply(requestId) {
  return replayReply(409, {
    accepted: false,
    code: "SUBMISSION_UNCERTAIN",
    requestId,
    message: "Your request may already be with our team. Please call (317) 961-5865 to confirm before submitting again. Your reference is " + requestId + ". Nothing has been scheduled or charged by this form."
  });
}
__name(uncertainQuoteReply, "uncertainQuoteReply");
function unavailableQuoteReply(requestId) {
  return replayReply(503, {
    accepted: false,
    code: "SUBMISSION_UNAVAILABLE",
    requestId,
    message: "We could not connect to save your request. Please try again or call (317) 961-5865."
  });
}
__name(unavailableQuoteReply, "unavailableQuoteReply");
async function quoteRequestFingerprint(forward) {
  const fields = [
    "schemaVersion",
    "stage",
    "intent",
    "zip",
    "dogs",
    "frequencyId",
    "areaIds",
    "yardSizeId",
    "lastCleaned",
    "customerStatus",
    "startTiming",
    "serverPriceCents",
    "pricingVersion",
    "customEstimate",
    "customReasons",
    "firstName",
    "lastName",
    "phone",
    "email",
    "street",
    "city",
    "state",
    "preferredContact",
    "smsTransactionalConsent",
    "consentVersion",
    "termsAccepted",
    "termsVersion",
    "question",
    "notes"
  ];
  const material = fields.map((field) => {
    const value = forward[field];
    return (field === "areaIds" || field === "customReasons") && Array.isArray(value) ? value.slice().sort() : value;
  });
  return sha256Hex(JSON.stringify(material));
}
__name(quoteRequestFingerprint, "quoteRequestFingerprint");
async function dispatchQuoteWithLedger(forward, request, env, cors) {
  let response;
  if (!env.QUOTE_REQUESTS || !env.GHL_WEBHOOK_URL) {
    response = unavailableQuoteReply(forward.requestId);
  } else {
    try {
      const key = await sha256Hex("purge-pros-quote-v3:" + forward.requestId);
      const stub = env.QUOTE_REQUESTS.get(env.QUOTE_REQUESTS.idFromName(key));
      const headers = { "Content-Type": "application/json" };
      for (const name of ["Origin", "User-Agent", "CF-Connecting-IP"]) {
        const value = request.headers.get(name);
        if (value) headers[name] = value;
      }
      response = await stub.fetch(new Request("https://quote-request.internal/submit", {
        method: "POST",
        headers,
        body: JSON.stringify(forward)
      }));
    } catch (_) {
      response = uncertainQuoteReply(forward.requestId);
    }
  }
  return new Response(response.body, {
    status: response.status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
__name(dispatchQuoteWithLedger, "dispatchQuoteWithLedger");
var QuoteRequestLedger = class extends DurableObject {
  static {
    __name(this, "QuoteRequestLedger");
  }
  async alarm() { return expireResumeStorage(this); }
  async fetch(request) {
    if (new URL(request.url).pathname.startsWith("/resume/")) return handleResumeStorage(this, request);
    if (request.method !== "POST") return replayReply(405, { accepted: false });
    let forward;
    try {
      forward = await request.json();
    } catch (_) {
      return replayReply(400, { accepted: false });
    }
    if (!forward || forward.schemaVersion !== "cloudflare-widget.v3" || typeof forward.requestId !== "string" || !forward.requestId) {
      return replayReply(400, { accepted: false });
    }
    return this.ctx.blockConcurrencyWhile(async () => {
      let mayHaveDispatched = false;
      try {
        const fingerprint = await quoteRequestFingerprint(forward);
        const existing = await this.ctx.storage.get("request");
        if (existing) {
          if (existing.fingerprint !== fingerprint) {
            return replayReply(409, {
              accepted: false,
              code: "REQUEST_ID_CONFLICT",
              requestId: forward.requestId,
              message: "We could not safely submit the changed details. Please call (317) 961-5865 and mention reference " + forward.requestId + "."
            });
          }
          if (existing.status === "accepted") return replayReply(202, existing.receipt);
          return uncertainQuoteReply(forward.requestId);
        }
        if (!this.env.GHL_WEBHOOK_URL_V3) return unavailableQuoteReply(forward.requestId);
        const record = { fingerprint, status: "dispatching", createdAt: (/* @__PURE__ */ new Date()).toISOString() };
        await this.ctx.storage.put("request", record);
        mayHaveDispatched = true;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1e4);
        let upstream;
        try {
          upstream = await fetch(this.env.GHL_WEBHOOK_URL_V3, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(forward),
            signal: controller.signal,
            redirect: "manual"
          });
        } catch (_) {
          record.status = "uncertain";
          await this.ctx.storage.put("request", record);
          return uncertainQuoteReply(forward.requestId);
        } finally {
          clearTimeout(timeout);
        }
        if (!upstream.ok) {
          record.status = "uncertain";
          record.upstreamStatus = upstream.status;
          await this.ctx.storage.put("request", record);
          return uncertainQuoteReply(forward.requestId);
        }
        const receipt = { accepted: true, requestId: forward.requestId };
        record.status = "accepted";
        record.acceptedAt = (/* @__PURE__ */ new Date()).toISOString();
        record.receipt = receipt;
        await this.ctx.storage.put("request", record);
        try {
          this.ctx.waitUntil(sendMetaCapi(forward, request, this.env));
        } catch (_) {
        }
        return replayReply(202, receipt);
      } catch (_) {
        return mayHaveDispatched ? uncertainQuoteReply(forward.requestId) : unavailableQuoteReply(forward.requestId);
      }
    });
  }
};
var LAUNCHER_JS = "/*! Purge Pros quote launcher. The quote builder lives on the quote page. This small\n *  script keeps older pages working: their quote buttons and links send the visitor there. */\n(function () {\n  \"use strict\";\n  if (window.PurgeProsQuote) return;\n  var QUOTE_PAGE = \"\";\n  var KEEP = /^(utm_|gclid$|gbraid$|wbraid$|fbclid$)/;\n  var STORE = \"pp_launcher_arrival_query\";\n  var target;\n  try { target = new URL(QUOTE_PAGE); } catch (_) { return; }\n  var here = new URL(location.href);\n  function path(url) { return url.origin + url.pathname.replace(/\\/+$/, \"\"); }\n  // On the quote page itself the page's own builder handles every launcher.\n  if (path(target) === path(here)) return;\n\n  function hasSource(params) {\n    var found = false;\n    params.forEach(function (_, key) { if (KEEP.test(key)) found = true; });\n    return found;\n  }\n  // Remember how the visitor arrived, for this tab only, so the ad or campaign\n  // source still reaches the quote page after they browse to another page.\n  try {\n    if (hasSource(here.searchParams)) sessionStorage.setItem(STORE, here.search);\n  } catch (_) {}\n\n  function quoteAddress(options) {\n    var next = new URL(target.href);\n    var current = new URL(location.href).searchParams;\n    var kept = \"\";\n    try { kept = sessionStorage.getItem(STORE) || \"\"; } catch (_) {}\n    var source = hasSource(current) || !kept ? current : new URLSearchParams(kept);\n    source.forEach(function (value, key) {\n      if (key !== \"open_quote\" && key !== \"zip\") next.searchParams.append(key, value);\n    });\n    var zip = String((options && options.zip) || current.get(\"zip\") || \"\");\n    if (/^\\d{5}$/.test(zip)) next.searchParams.set(\"zip\", zip);\n    next.searchParams.set(\"open_quote\", \"1\");\n    return next.href;\n  }\n  function open(options) { location.assign(quoteAddress(options)); }\n\n  document.addEventListener(\"click\", function (event) {\n    var trigger = event.target && event.target.closest &&\n      event.target.closest('[data-purge-quote], a[href=\"#quote\"], a[href=\"#get-quote\"]');\n    if (!trigger || event.defaultPrevented) return;\n    event.preventDefault();\n    open();\n  });\n  window.PurgeProsQuote = { open: open, close: function () {}, config: {} };\n\n  var asked = String(here.searchParams.get(\"open_quote\") || \"\").trim().toLowerCase();\n  var hash = String(here.hash || \"\").toLowerCase();\n  if (asked === \"1\" || asked === \"true\" || asked === \"yes\" || hash === \"#quote\" || hash === \"#get-quote\") {\n    location.replace(quoteAddress());\n  }\n})();\n";
var DEFAULT_QUOTE_PAGE_URL = "https://itspurgepros.com/quote";
var QUOTE_FORWARD_PATHS = /* @__PURE__ */ new Set(["/", "/quote", "/quote/", "/demo", "/demo.html"]);
function configuredHttpsUrl(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text) {
    try {
      const parsed = new URL(text);
      if (parsed.protocol === "https:" && !parsed.username && !parsed.password) {
        parsed.hash = "";
        return parsed;
      }
    } catch (_) {
    }
  }
  return new URL(DEFAULT_QUOTE_PAGE_URL);
}
__name(configuredHttpsUrl, "configuredHttpsUrl");
function quotePageUrl(env) {
  return configuredHttpsUrl(env && env.QUOTE_PAGE_URL);
}
__name(quotePageUrl, "quotePageUrl");
function savedLinkBase(env) {
  const base = configuredHttpsUrl(env && env.SAVED_LINK_BASE);
  base.search = "";
  return base.href;
}
__name(savedLinkBase, "savedLinkBase");
function quotePageRedirect(request, env) {
  const url = new URL(request.url);
  let target = quotePageUrl(env);
  // The target comes from configuration only. A target on this Worker's own host would loop.
  if (target.host === url.host) target = new URL(DEFAULT_QUOTE_PAGE_URL);
  if (target.host === url.host) return new Response("Not found", { status: 404 });
  if (url.search.length > 1) target.search = target.search ? target.search + "&" + url.search.slice(1) : url.search;
  return new Response(null, {
    status: 302,
    headers: { "Location": target.href, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}
__name(quotePageRedirect, "quotePageRedirect");
function launcherScript(env) {
  return LAUNCHER_JS.replace('var QUOTE_PAGE = "";', () => "var QUOTE_PAGE = " + JSON.stringify(quotePageUrl(env).href) + ";");
}
__name(launcherScript, "launcherScript");
function termsVersionCheck(env, intent, acceptedVersion) {
  const current = cleanString(env && env.CURRENT_TERMS_VERSION, 80);
  if (!current || intent !== "service_request" || acceptedVersion === current) return { outdated: false, refuse: false, current };
  return { outdated: true, refuse: cleanString(env.TERMS_VERSION_MODE, 20).toLowerCase() === "refuse", current };
}
__name(termsVersionCheck, "termsVersionCheck");
var SCHEMA_VERSION = "cloudflare-widget.v3";
var PRICING_VERSION = "2026-08-cloudflare-v1";
var MAX_BODY_BYTES = 3e4;
var MAX_VOICE_QUOTE_BODY_BYTES = 1e4;
var REVIEWS_TTL_SECONDS = 21600;
var DEFAULT_ALLOWED_ORIGINS = [
  "https://itspurgepros.com",
  "https://www.itspurgepros.com",
  "https://purge-quote.purgepros.workers.dev"
];
var SERVICE_ZIPS = /* @__PURE__ */ new Set([
  "46011",
  "46013",
  "46014",
  "46015",
  "46016",
  "46032",
  "46033",
  "46034",
  "46037",
  "46038",
  "46040",
  "46048",
  "46051",
  "46055",
  "46056",
  "46060",
  "46061",
  "46062",
  "46064",
  "46074",
  "46075",
  "46077",
  "46112",
  "46113",
  "46122",
  "46123",
  "46140",
  "46142",
  "46143",
  "46158",
  "46163",
  "46167",
  "46168",
  "46214",
  "46216",
  "46217",
  "46220",
  "46221",
  "46227",
  "46228",
  "46231",
  "46234",
  "46236",
  "46237",
  "46239",
  "46240",
  "46250",
  "46256",
  "46259",
  "46260",
  "46268",
  "46278",
  "46280"
]);
var FREQUENCIES = {
  twice: { label: "Twice weekly", maxDogs: 9, prices: { 1: 1599, 2: 1749, 3: 1899, 4: 2049, 5: 2199, 6: 2349, 7: 2499, 8: 2649, 9: 2799 } },
  weekly: { label: "Weekly", maxDogs: 5, prices: { 1: 1999, 2: 2249, 3: 2499, 4: 2749, 5: 2999 } },
  biweekly: { label: "Every other week", maxDogs: 4, prices: { 1: 2999, 2: 3349, 3: 3699, 4: 4049 } },
  onetime: { label: "One-time cleanup", anyDogs: true, flatPrice: 8999 },
  custom: { label: "Custom booking", custom: true }
};
var AREA_LABELS = { back: "Back yard", front: "Front yard", side: "Side yard(s)" };
var AREA_ADDERS = { 1: 0, 2: 250, 3: 500 };
var YARD_SIZES = {
  s: { label: "Up to \u215B acre", add: 0 },
  m: { label: "Up to \xBC acre", add: 400 },
  l: { label: "Up to \xBD acre", add: 800 },
  xl: { label: "Up to 1 acre", add: 1200 },
  over: { label: "Over 1 acre", custom: true }
};
var LAST_CLEANED = /* @__PURE__ */ new Set(["Within 1 week", "2\u20133 weeks", "About 1 month", "2\u20134 months", "5\u20136 months", "More than 6 months"]);
var START_TIMINGS = /* @__PURE__ */ new Set(["As soon as possible", "Within the next week", "In the next few weeks", "Just researching for now"]);
var PREFERRED_CONTACTS = /* @__PURE__ */ new Set(["text", "email", "call"]);
var LEGACY_STAGES = /* @__PURE__ */ new Set(["phone_captured", "quote_updated", "question_submitted", "service_requested", "estimate_requested", "out_of_area"]);
var VOICE_FREQUENCY_ALIASES = /* @__PURE__ */ new Map([
  ["twice", "twice"],
  ["twice_weekly", "twice"],
  ["twice weekly", "twice"],
  ["twice-weekly", "twice"],
  ["2x weekly", "twice"],
  ["twice a week", "twice"],
  ["two times a week", "twice"],
  ["weekly", "weekly"],
  ["once a week", "weekly"],
  ["every_other_week", "biweekly"],
  ["every other week", "biweekly"],
  ["every-other-week", "biweekly"],
  ["every two weeks", "biweekly"],
  ["once every two weeks", "biweekly"],
  ["one_time", "onetime"],
  ["one-time", "onetime"],
  ["one time", "onetime"],
  ["one-time cleanup", "onetime"],
  ["onetime", "onetime"],
  ["not_applicable", "not_applicable"],
  ["not applicable", "not_applicable"],
  ["n/a", "not_applicable"],
  ["custom", "custom"],
  ["custom booking", "custom"]
]);
var VOICE_AMBIGUOUS_FREQUENCIES = /* @__PURE__ */ new Set(["biweekly", "bi weekly", "bi-weekly"]);
var VOICE_SERVICE_TYPE_ALIASES = /* @__PURE__ */ new Map([
  ["recurring", "recurring"],
  ["recurring service", "recurring"],
  ["maintenance", "recurring"],
  ["ongoing", "recurring"],
  ["one_time", "one_time"],
  ["one-time", "one_time"],
  ["one time", "one_time"],
  ["one-time cleanup", "one_time"],
  ["single cleanup", "one_time"]
]);
var VOICE_DOG_WORDS = /* @__PURE__ */ new Map([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12],
  ["thirteen", 13],
  ["fourteen", 14],
  ["fifteen", 15],
  ["sixteen", 16],
  ["seventeen", 17],
  ["eighteen", 18],
  ["nineteen", 19],
  ["twenty", 20]
]);
var VOICE_AREA_ALIASES = /* @__PURE__ */ new Map([
  ["back", "back"],
  ["back yard", "back"],
  ["backyard", "back"],
  ["front", "front"],
  ["front yard", "front"],
  ["frontyard", "front"],
  ["side", "side"],
  ["side yard", "side"],
  ["side yard(s)", "side"],
  ["sideyards", "side"],
  ["side yards", "side"]
]);
var VOICE_YARD_ALIASES = /* @__PURE__ */ new Map([
  ["s", "s"],
  ["up_to_1_8", "s"],
  ["1/8 acre", "s"],
  ["up to 1/8 acre", "s"],
  ["up to one eighth acre", "s"],
  ["m", "m"],
  ["up_to_1_4", "m"],
  ["1/4 acre", "m"],
  ["quarter acre", "m"],
  ["up to 1/4 acre", "m"],
  ["up to one quarter acre", "m"],
  ["up to a quarter acre", "m"],
  ["l", "l"],
  ["up_to_1_2", "l"],
  ["1/2 acre", "l"],
  ["half acre", "l"],
  ["up to 1/2 acre", "l"],
  ["up to one half acre", "l"],
  ["up to a half acre", "l"],
  ["xl", "xl"],
  ["up_to_1_acre", "xl"],
  ["1 acre", "xl"],
  ["one acre", "xl"],
  ["up to 1 acre", "xl"],
  ["up to one acre", "xl"],
  ["over", "over"],
  ["over_1_acre", "over"],
  ["1+ acre", "over"],
  ["over 1 acre", "over"],
  ["over one acre", "over"],
  ["more than 1 acre", "over"],
  ["more than one acre", "over"]
]);
var VOICE_VAGUE_YARD_SIZES = /* @__PURE__ */ new Set([
  "small",
  "medium",
  "large",
  "extra large",
  "average",
  "normal",
  "standard",
  "about one acre",
  "around one acre",
  "approximately one acre"
]);
var VOICE_PROPERTY_TYPE_ALIASES = /* @__PURE__ */ new Map([
  ["residential", "residential"],
  ["residential home", "residential"],
  ["home", "residential"],
  ["house", "residential"],
  ["kennel", "kennel"],
  ["boarding kennel", "kennel"],
  ["dog daycare", "commercial"],
  ["commercial", "commercial"],
  ["business", "commercial"],
  ["other", "other"],
  ["nonstandard", "other"],
  ["non-standard", "other"]
]);
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
__name(corsHeaders, "corsHeaders");
function jsonResponse(status, body, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
__name(jsonResponse, "jsonResponse");
function originAllowed(origin, env, requestUrl) {
  if (origin && requestUrl && origin === new URL(requestUrl).origin) return true;
  if (!origin) return false;
  const allowedOrigins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean) : DEFAULT_ALLOWED_ORIGINS;
  return allowedOrigins.includes(origin);
}
__name(originAllowed, "originAllowed");
function cleanString(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
__name(cleanString, "cleanString");
function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return /^\d{10}$/.test(digits) ? digits : "";
}
__name(normalizePhone, "normalizePhone");
function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}
__name(validEmail, "validEmail");
function calculateQuote(lead) {
  const dogs = Number(lead.dogs);
  const frequencyId = cleanString(lead.frequencyId, 20);
  const frequency = FREQUENCIES[frequencyId];
  const yardSizeId = cleanString(lead.yardSizeId, 20);
  const yard = YARD_SIZES[yardSizeId];
  const areaIds = Array.from(new Set(Array.isArray(lead.areaIds) ? lead.areaIds : [])).filter((id) => Object.prototype.hasOwnProperty.call(AREA_LABELS, id));
  const errors = [];
  if (!Number.isInteger(dogs) || dogs < 1 || dogs > 10) errors.push("dogs");
  if (!frequency) errors.push("frequencyId");
  if (!yard) errors.push("yardSizeId");
  if (!areaIds.length || areaIds.length !== (Array.isArray(lead.areaIds) ? new Set(lead.areaIds).size : 0)) errors.push("areaIds");
  if (frequency && yard && yard.custom && !frequency.custom) errors.push("frequencyId");
  if (frequency && !frequency.custom && frequencyId !== "onetime" && !frequency.prices[dogs]) errors.push("frequencyId");
  if (errors.length) return { ok: false, errors };
  const reasons = [];
  if (frequency.custom) reasons.push("CUSTOM_BOOKING_SELECTED");
  if (dogs >= 10 && frequencyId !== "onetime") reasons.push("DOG_COUNT_10_PLUS");
  if (yard.custom) reasons.push("YARD_OVER_ONE_ACRE");
  if (reasons.length) {
    return { ok: true, custom: true, reasons, dogs, frequencyId, frequency, yardSizeId, yard, areaIds };
  }
  const priceCents = frequencyId === "onetime" ? frequency.flatPrice : frequency.prices[dogs] + AREA_ADDERS[areaIds.length] + yard.add;
  return { ok: true, custom: false, priceCents, dogs, frequencyId, frequency, yardSizeId, yard, areaIds };
}
__name(calculateQuote, "calculateQuote");
function normalizeVoiceText(value, max = 120) {
  return cleanString(value, max).toLowerCase().replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ");
}
__name(normalizeVoiceText, "normalizeVoiceText");
function firstVoiceValue(body, names) {
  for (const name of names) {
    if (!Object.prototype.hasOwnProperty.call(body, name)) continue;
    const value = body[name];
    if (value === null || value === void 0) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && !value.length) continue;
    return value;
  }
  return void 0;
}
__name(firstVoiceValue, "firstVoiceValue");
function parseVoiceDogs(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 1 && value <= 999 ? { ok: true, value, qualifier: value >= 10 ? "10_or_more" : "exact" } : { ok: false, issue: "invalid" };
  }
  let text = normalizeVoiceText(value, 60);
  if (!text) return { ok: false, issue: "missing" };
  text = text.replace(/^(?:i|we)\s+have\s+/, "").replace(/^there (?:is|are)\s+/, "").trim();
  if (/^(?:10|ten)\s*(?:\+|or more)(?:\s+dogs?)?$/.test(text)) {
    return { ok: true, value: 10, qualifier: "10_or_more" };
  }
  if (/\b(?:or|to|through|between|maybe|about|around|approximately|roughly)\b/.test(text) || /^\d+\s*-\s*\d+/.test(text)) {
    return { ok: false, issue: "ambiguous" };
  }
  const exact = text.match(/^(\d{1,3})\s*(?:dogs?)?$/);
  if (exact) {
    const count = Number(exact[1]);
    return count >= 1 ? { ok: true, value: count, qualifier: count >= 10 ? "10_or_more" : "exact" } : { ok: false, issue: "invalid" };
  }
  const word = text.replace(/\s+dogs?$/, "");
  if (VOICE_DOG_WORDS.has(word)) {
    const count = VOICE_DOG_WORDS.get(word);
    return { ok: true, value: count, qualifier: count >= 10 ? "10_or_more" : "exact" };
  }
  return { ok: false, issue: "invalid" };
}
__name(parseVoiceDogs, "parseVoiceDogs");
function parseVoiceFrequency(value) {
  const text = normalizeVoiceText(value, 80);
  if (!text) return { ok: false, issue: "missing" };
  if (VOICE_AMBIGUOUS_FREQUENCIES.has(text)) return { ok: false, issue: "ambiguous" };
  const frequencyId = VOICE_FREQUENCY_ALIASES.get(text);
  return frequencyId ? { ok: true, value: frequencyId } : { ok: false, issue: "invalid" };
}
__name(parseVoiceFrequency, "parseVoiceFrequency");
function parseVoiceServiceType(value) {
  const text = normalizeVoiceText(value, 80);
  if (!text) return { ok: false, issue: "missing" };
  const serviceType = VOICE_SERVICE_TYPE_ALIASES.get(text);
  return serviceType ? { ok: true, value: serviceType } : { ok: false, issue: "invalid" };
}
__name(parseVoiceServiceType, "parseVoiceServiceType");
function parseVoiceAreas(value) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.replace(/,\s*(?:and|&)\s+/gi, ",").split(/\s*(?:,|&|\band\b)\s*/i).filter(Boolean) : [];
  if (!values.length) return { ok: false, issue: "missing", areaIds: [], unknown: [] };
  const areaIds = [];
  const unknown = [];
  for (const item of values) {
    const normalized = normalizeVoiceText(item, 80).replace(/^(?:the|my)\s+/, "").replace(/\s+only$/, "").replace(/[.;]+$/, "").trim();
    if (["whole yard", "entire yard", "all yard", "all areas", "everything"].includes(normalized)) {
      return { ok: false, issue: "ambiguous", areaIds, unknown: [] };
    }
    const areaId = VOICE_AREA_ALIASES.get(normalized);
    if (!areaId) {
      unknown.push(cleanString(item, 80));
      continue;
    }
    if (areaIds.includes(areaId)) continue;
    areaIds.push(areaId);
  }
  if (unknown.length) return { ok: false, issue: "nonstandard", areaIds, unknown };
  return areaIds.length ? { ok: true, areaIds, unknown: [] } : { ok: false, issue: "invalid", areaIds: [], unknown: [] };
}
__name(parseVoiceAreas, "parseVoiceAreas");
function parseVoiceYardSize(value) {
  const text = normalizeVoiceText(value, 100).replace(/[\u215b]/g, "1/8").replace(/[\u2153]/g, "1/3").replace(/[\u00bc]/g, "1/4").replace(/[\u00bd]/g, "1/2");
  if (!text) return { ok: false, issue: "missing" };
  if (VOICE_VAGUE_YARD_SIZES.has(text) || /^(?:about|around|approximately|roughly)\b/.test(text)) {
    return { ok: false, issue: "ambiguous" };
  }
  const yardSizeId = VOICE_YARD_ALIASES.get(text);
  return yardSizeId ? { ok: true, value: yardSizeId } : { ok: false, issue: "invalid" };
}
__name(parseVoiceYardSize, "parseVoiceYardSize");
function parseVoiceZip(value) {
  const text = cleanString(value, 120);
  if (!text) return { ok: false, issue: "missing" };
  const matches = text.match(/\b\d{5}(?:-\d{4})?\b/g) || [];
  if (matches.length !== 1) return { ok: false, issue: "invalid" };
  return { ok: true, value: matches[0].slice(0, 5) };
}
__name(parseVoiceZip, "parseVoiceZip");
function parseVoicePropertyType(value) {
  const text = normalizeVoiceText(value, 80);
  if (!text) return { ok: false, issue: "missing" };
  const propertyType = VOICE_PROPERTY_TYPE_ALIASES.get(text);
  return propertyType ? { ok: true, value: propertyType } : { ok: false, issue: "invalid" };
}
__name(parseVoicePropertyType, "parseVoicePropertyType");
function availableVoiceFrequencies(dogs) {
  const ids = [];
  if (dogs <= FREQUENCIES.twice.maxDogs) ids.push("twice_weekly");
  if (dogs <= FREQUENCIES.weekly.maxDogs) ids.push("weekly");
  if (dogs <= FREQUENCIES.biweekly.maxDogs) ids.push("every_other_week");
  return ids;
}
__name(availableVoiceFrequencies, "availableVoiceFrequencies");
function voiceOutcome(result, message, nextStep, details = {}) {
  return {
    ok: true,
    result,
    message,
    nextStep,
    pricingVersion: PRICING_VERSION,
    ...details
  };
}
__name(voiceOutcome, "voiceOutcome");
function voiceClarification(message, fieldsNeeded) {
  return voiceOutcome(
    "needs_clarification",
    message,
    "Ask the caller the clarification question in the message, then run the pricing action again with explicit values.",
    { fieldsNeeded, routeApprovalRequired: true }
  );
}
__name(voiceClarification, "voiceClarification");
function voiceCustomEstimate(reasons, message, details = {}) {
  return voiceOutcome(
    "custom_estimate",
    message,
    "Do not quote a standard price. If the caller wants to proceed, collect the intake details and submit a Custom Estimate Request for team review.",
    {
      price: "",
      priceCents: null,
      reasons,
      routeApprovalRequired: true,
      ...details
    }
  );
}
__name(voiceCustomEstimate, "voiceCustomEstimate");
function evaluateVoiceQuote(body) {
  const zip = parseVoiceZip(firstVoiceValue(body, ["zip", "zipCode", "postalCode", "serviceZip"]));
  if (!zip.ok) {
    return voiceClarification(
      zip.issue === "missing" ? "What is the five-digit ZIP code for the service address?" : "I need one clear five-digit ZIP code for the service address. What is it?",
      ["zip"]
    );
  }
  if (!SERVICE_ZIPS.has(zip.value)) {
    return voiceOutcome(
      "out_of_area",
      `ZIP code ${zip.value} is outside the currently published standard service area. Do not provide a standard price or promise service.`,
      "If the caller wants a manual boundary review, collect a message for the team; otherwise end the call politely.",
      { zip: zip.value, zipEligible: false, routeApprovalRequired: true }
    );
  }
  const serviceType = parseVoiceServiceType(firstVoiceValue(body, ["serviceType", "service", "serviceKind"]));
  if (!serviceType.ok) {
    return voiceClarification(
      "Is this for recurring service or a one-time cleanup?",
      ["serviceType"]
    );
  }
  const propertyType = parseVoicePropertyType(firstVoiceValue(body, ["propertyType", "property", "customerType"]));
  if (!propertyType.ok) {
    return voiceClarification(
      "Is the property a residential home, a kennel, a commercial property, or something else?",
      ["propertyType"]
    );
  }
  if (propertyType.value !== "residential") {
    return voiceCustomEstimate(
      ["NONSTANDARD_PROPERTY"],
      "Kennels, commercial properties, and other nonstandard properties require a custom estimate.",
      { zip: zip.value, zipEligible: true, serviceType: serviceType.value, propertyType: propertyType.value }
    );
  }
  const dogs = parseVoiceDogs(firstVoiceValue(body, ["dogs", "dogCount", "numberOfDogs"]));
  if (!dogs.ok) {
    return voiceClarification(
      dogs.issue === "ambiguous" ? "To price this correctly, what is the exact number of dogs?" : "How many dogs use the serviced yard? Please give one exact number.",
      ["dogs"]
    );
  }
  const areas = parseVoiceAreas(firstVoiceValue(body, ["areas", "areaIds", "serviceAreas", "selectedAreas"]));
  if (!areas.ok && areas.issue === "nonstandard") {
    return voiceCustomEstimate(
      ["NONSTANDARD_SERVICE_AREA"],
      `This request includes a nonstandard service area (${areas.unknown.join(", ")}). Standard pricing covers only selected back yard, front yard, and side yard areas.`,
      {
        zip: zip.value,
        zipEligible: true,
        serviceType: serviceType.value,
        propertyType: propertyType.value,
        reportedDogs: dogs.value,
        nonstandardAreas: areas.unknown
      }
    );
  }
  if (!areas.ok) {
    return voiceClarification(
      areas.issue === "ambiguous" ? "Which areas need service: the back yard, front yard, side yard or yards, or a specific combination of those?" : "Which standard areas need service: back yard, front yard, side yard or yards, or a combination?",
      ["areas"]
    );
  }
  const yard = parseVoiceYardSize(firstVoiceValue(body, ["yardSize", "yardSizeId", "servicedYardSize"]));
  if (!yard.ok) {
    return voiceClarification(
      "Which serviced-yard range fits best: up to one-eighth acre, up to one-quarter acre, up to one-half acre, up to one acre, or over one acre?",
      ["yardSize"]
    );
  }
  const shared = {
    zip: zip.value,
    zipEligible: true,
    serviceType: serviceType.value,
    propertyType: propertyType.value,
    reportedDogs: dogs.value,
    dogPricingCategory: dogs.value >= 10 ? "10+" : String(dogs.value),
    areas: areas.areaIds.map((id) => AREA_LABELS[id]),
    areaIds: areas.areaIds,
    yardSize: YARD_SIZES[yard.value].label,
    yardSizeId: yard.value
  };
  if (yard.value === "over") {
    return voiceCustomEstimate(
      ["YARD_OVER_ONE_ACRE"],
      "A serviced yard over one acre requires a custom estimate.",
      shared
    );
  }
  const frequency = parseVoiceFrequency(firstVoiceValue(body, ["frequency", "frequencyId", "serviceFrequency"]));
  if (serviceType.value === "one_time") {
    if (frequency.ok && !["onetime", "not_applicable"].includes(frequency.value)) {
      return voiceClarification(
        "You mentioned a one-time cleanup but also gave a recurring frequency. Is this one-time or recurring service?",
        ["serviceType", "frequency"]
      );
    }
    if (!frequency.ok && frequency.issue !== "missing") {
      return voiceClarification(
        "For a one-time cleanup, confirm that recurring frequency is not applicable.",
        ["frequency"]
      );
    }
    const quote2 = calculateQuote({ dogs: Math.min(dogs.value, 10), frequencyId: "onetime", areaIds: areas.areaIds, yardSizeId: yard.value });
    return voiceQuoteResponse(quote2, { ...shared, frequencyInputId: "not_applicable" });
  }
  if (!frequency.ok) {
    return voiceClarification(
      frequency.issue === "ambiguous" ? "When you say biweekly, do you mean twice each week or every other week?" : "Would you like service twice weekly, weekly, or every other week?",
      ["frequency"]
    );
  }
  if (frequency.value === "onetime" || frequency.value === "not_applicable") {
    return voiceClarification(
      "You mentioned recurring service but gave a one-time or not-applicable frequency. Is this recurring service or a one-time cleanup?",
      ["serviceType", "frequency"]
    );
  }
  if (frequency.value === "custom" || dogs.value >= 10) {
    const reasons = [];
    if (frequency.value === "custom") reasons.push("CUSTOM_BOOKING_SELECTED");
    if (dogs.value >= 10) reasons.push("DOG_COUNT_10_PLUS");
    return voiceCustomEstimate(
      reasons,
      dogs.value >= 10 ? "Recurring service for 10 or more dogs requires a custom estimate." : "Custom booking requires a custom estimate.",
      { ...shared, frequencyId: frequency.value }
    );
  }
  const availableFrequencies = availableVoiceFrequencies(dogs.value);
  const publicFrequencyId = frequency.value === "twice" ? "twice_weekly" : frequency.value === "biweekly" ? "every_other_week" : frequency.value;
  if (!availableFrequencies.includes(publicFrequencyId)) {
    const labels = availableFrequencies.map((id) => id === "twice_weekly" ? "twice weekly" : id === "every_other_week" ? "every other week" : "weekly");
    return voiceOutcome(
      "unavailable_combination",
      `${dogs.value} dogs cannot be placed on ${FREQUENCIES[frequency.value].label.toLowerCase()} under standard maintenance pricing. The available standard ${labels.length === 1 ? "frequency is" : "frequencies are"} ${labels.join(" or ")}.`,
      "Offer only the available frequency choices. If the caller selects one, run the pricing action again. Otherwise submit a custom estimate request without promising availability or price.",
      {
        ...shared,
        requestedFrequency: FREQUENCIES[frequency.value].label,
        requestedFrequencyId: publicFrequencyId,
        availableFrequencies,
        routeApprovalRequired: true
      }
    );
  }
  const quote = calculateQuote({ dogs: dogs.value, frequencyId: frequency.value, areaIds: areas.areaIds, yardSizeId: yard.value });
  return voiceQuoteResponse(quote, shared);
}
__name(evaluateVoiceQuote, "evaluateVoiceQuote");
function voiceQuoteResponse(result, context) {
  if (!result.ok) {
    return voiceClarification(
      "I could not safely validate those selections. Please confirm the exact number of dogs, service frequency, selected service areas, and serviced-yard range.",
      result.errors
    );
  }
  const areas = result.areaIds.map((id) => AREA_LABELS[id]);
  if (result.custom) {
    const message = result.reasons.includes("DOG_COUNT_10_PLUS") ? "This recurring request needs a custom estimate because it involves 10 or more dogs." : result.reasons.includes("YARD_OVER_ONE_ACRE") ? "This request needs a custom estimate because the serviced yard is over one acre." : result.reasons.includes("CUSTOM_BOOKING_SELECTED") ? "This request needs a custom estimate because Custom booking was selected." : "This request needs a custom estimate because it falls outside standard recurring pricing.";
    return voiceCustomEstimate(result.reasons, message, {
      ...context,
      frequency: result.frequency.label,
      frequencyId: result.frequencyId,
      areas,
      areaIds: result.areaIds,
      yardSize: result.yard.label,
      yardSizeId: result.yardSizeId
    });
  }
  const price = `$${(result.priceCents / 100).toFixed(2)}`;
  const isOneTime = result.frequencyId === "onetime";
  return voiceOutcome(
    "standard_price",
    isOneTime ? `${price} covers the first 30 minutes of one-time cleanup labor. The base deposit is charged when the ETA text goes out. Additional labor after 30 minutes is billed after cleanup at $1 per minute. Service approval is still required.` : `The current recurring maintenance price is ${price} per visit. Route approval is still required before service is confirmed.`,
    isOneTime ? "Tell the caller the returned price and terms exactly. If they accept, collect the remaining intake details and submit the appropriate service-request workflow. Do not call the service scheduled or confirmed until the team approves it." : "This is a recurring maintenance quote, not an approved first-cleanup price. Ask whether the household has used Purge Pros before. Returning, uncertain-history and new-occupant requests require Submit Team Follow-Up Request for review. New-household status also requires team verification of service history, once per household. New recurring households: first cleanup at the quoted rate with up to 120 minutes included; time beyond 120 minutes is $1 per minute, agreed before work starts. Returning or unclear-history households: restart at the quoted rate for 30 minutes plus $1 per extra minute, billed after cleanup; base at ETA. Ordinary maintenance stays at the agreed rate regardless of time. Never add a second maintenance charge. Never promise a free or unlimited first cleanup. Do not call service scheduled or confirmed until the team approves it.",
    {
      ...context,
      price,
      priceCents: result.priceCents,
      pricingScope: isOneTime ? "one_time_cleanup" : "recurring_maintenance",
      automaticPromotionApproved: false,
      firstVisitApprovalRequired: true,
      priceDescription: isOneTime ? `${price} for the first 30 minutes` : `${price} per visit`,
      frequency: result.frequency.label,
      frequencyId: isOneTime ? "not_applicable" : result.frequencyId === "twice" ? "twice_weekly" : result.frequencyId === "biweekly" ? "every_other_week" : result.frequencyId,
      dogs: result.dogs,
      areas,
      areaIds: result.areaIds,
      yardSize: result.yard.label,
      yardSizeId: result.yardSizeId,
      routeApprovalRequired: true
    }
  );
}
__name(voiceQuoteResponse, "voiceQuoteResponse");
function privateJsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
__name(privateJsonResponse, "privateJsonResponse");
function constantTimeStringEqual(left, right) {
  const a = new TextEncoder().encode(String(left || ""));
  const b = new TextEncoder().encode(String(right || ""));
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}
__name(constantTimeStringEqual, "constantTimeStringEqual");
async function handleVoiceQuote(request, env) {
  const configuredToken = cleanString(env.VOICE_AI_QUOTE_TOKEN, 500);
  if (!configuredToken) return privateJsonResponse(503, { ok: false, result: "unavailable", message: "Voice pricing is not configured." });
  const authorization = request.headers.get("Authorization") || "";
  const suppliedToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!suppliedToken || !constantTimeStringEqual(suppliedToken, configuredToken)) {
    return privateJsonResponse(401, { ok: false, result: "unauthorized", message: "Unauthorized." });
  }
  if (request.method !== "POST") return privateJsonResponse(405, { ok: false, result: "method_not_allowed", message: "Method not allowed." });
  if (!String(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) {
    return privateJsonResponse(415, { ok: false, result: "invalid_content_type", message: "JSON required." });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_VOICE_QUOTE_BODY_BYTES) {
    return privateJsonResponse(413, { ok: false, result: "payload_too_large", message: "Payload too large." });
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch (_) {
    return privateJsonResponse(400, { ok: false, result: "invalid_json", message: "Valid JSON is required." });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return privateJsonResponse(400, { ok: false, result: "invalid_request", message: "A JSON object is required." });
  }
  return privateJsonResponse(200, evaluateVoiceQuote(body));
}
__name(handleVoiceQuote, "handleVoiceQuote");
function validateV3(lead) {
  const errors = [];
  const intent = cleanString(lead.intent, 40);
  const preferredContact = cleanString(lead.preferredContact, 20);
  const phone = normalizePhone(lead.phone);
  const email = cleanString(lead.email, 254).toLowerCase();
  const zip = cleanString(lead.zip, 5);
  const quote = calculateQuote(lead);
  if (!["service_request", "quote_delivery", "question"].includes(intent)) errors.push("intent");
  if (!PREFERRED_CONTACTS.has(preferredContact)) errors.push("preferredContact");
  if (!/^\d{5}$/.test(zip) || !SERVICE_ZIPS.has(zip)) errors.push("zip");
  if (!quote.ok) errors.push(...quote.errors);
  if (preferredContact === "text" || preferredContact === "call") {
    if (!phone) errors.push("phone");
  }
  if (preferredContact === "email" && !validEmail(email)) errors.push("email");
  if (lead.phone && !phone) errors.push("phone");
  if (lead.email && !validEmail(email)) errors.push("email");
  if (preferredContact === "text") {
    if (lead.smsTransactionalConsent !== true) errors.push("smsTransactionalConsent");
    if (!cleanString(lead.consentVersion, 80)) errors.push("consentVersion");
  }
  if (cleanString(lead.website, 100)) errors.push("website");
  const expectedStage = intent === "question" ? "question_submitted" : intent === "quote_delivery" ? "quote_requested" : quote.ok && quote.custom ? "estimate_requested" : "service_requested";
  if (cleanString(lead.stage, 40) !== expectedStage) errors.push("stage");
  if (quote.ok) {
    if (lead.pricingVersion !== PRICING_VERSION) errors.push("pricingVersion");
    if (Boolean(lead.customEstimate) !== quote.custom) errors.push("customEstimate");
    if (!quote.custom && Number(lead.clientPriceCents) !== quote.priceCents) errors.push("clientPriceCents");
  }
  const firstName = cleanString(lead.firstName, 80);
  const lastName = cleanString(lead.lastName, 80);
  const street = cleanString(lead.street, 120);
  const city = cleanString(lead.city, 80);
  const startTiming = cleanString(lead.startTiming, 80);
  const lastCleaned = cleanString(lead.lastCleaned, 80);
  const customerStatus = cleanString(lead.customerStatus, 20) || "not_sure";
  if (!["new", "returning", "not_sure"].includes(customerStatus)) errors.push("customerStatus");
  const question = cleanString(lead.question, 1500);
  if (!firstName) errors.push("firstName");
  if (!LAST_CLEANED.has(lastCleaned)) errors.push("lastCleaned");
  if (intent === "service_request") {
    if (!lastName) errors.push("lastName");
    if (!street) errors.push("street");
    if (!city) errors.push("city");
    if (!START_TIMINGS.has(startTiming)) errors.push("startTiming");
    if (lead.termsAccepted !== true || !cleanString(lead.termsVersion, 80)) errors.push("termsAccepted");
  }
  if (intent === "question" && question.length < 5) errors.push("question");
  return {
    ok: errors.length === 0,
    errors: Array.from(new Set(errors)),
    values: { intent, preferredContact, phone, email, zip, quote, firstName, lastName, street, city, startTiming, lastCleaned, customerStatus, question, expectedStage }
  };
}
__name(validateV3, "validateV3");
function cleanAttribution(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "wbraid", "gbraid", "fbclid"];
  return Object.fromEntries(allowed.map((key) => [key, cleanString(value[key], 500)]).filter(([, item]) => item));
}
__name(cleanAttribution, "cleanAttribution");
function buildV3Forward(lead, values, requestId, request, env) {
  const quote = values.quote;
  const acceptedAt = (/* @__PURE__ */ new Date()).toISOString();
  const attribution = cleanAttribution(lead.attribution);
  const serviceAddress = values.intent === "service_request" ? `${values.street}, ${values.city}, IN ${values.zip}` : "";
  const consentVersion = values.preferredContact === "text" ? cleanString(lead.consentVersion, 80) : "";
  const consentAt = values.preferredContact === "text" ? cleanString(lead.smsConsentCapturedAt, 40) || acceptedAt : "";
  const termsVersion = values.intent === "service_request" ? cleanString(lead.termsVersion, 80) : "";
  const termsAt = values.intent === "service_request" ? cleanString(lead.termsAcceptedAt, 40) || acceptedAt : "";
  const termsCheck = termsVersionCheck(env, values.intent, termsVersion);
  const requestType = values.expectedStage === "service_requested" ? "Service requested" : values.expectedStage === "estimate_requested" ? "Custom estimate requested" : values.expectedStage === "quote_requested" ? "Quote copy requested" : "Customer question";
  const quoteSummary = [
    "Purge Pros website quote",
    `Request: ${requestType}`,
    `Service address: ${serviceAddress || "Not collected for this request type"}`,
    `Plan: ${quote.frequency.label}`,
    `Price: ${quote.custom ? "Custom estimate required" : `$${(quote.priceCents / 100).toFixed(2)} per visit`}`,
    `Dogs: ${quote.dogs >= 10 ? "10+" : quote.dogs}`,
    `Service areas: ${quote.areaIds.map((id) => AREA_LABELS[id]).join(" & ")}`,
    `Yard size: ${quote.yard.label}`,
    `Last fully cleaned: ${values.lastCleaned}`,
    `Customer history (self-reported): ${values.customerStatus}`,
    `First visit: ${quote.frequencyId === "onetime" ? "One-time base price plus approved extra time" : "Team approval required; maintenance quote is not a confirmed restart charge"}`,
    "First cleanup: NEW recurring household = quoted visit rate, up to 120 minutes included; time beyond 120 minutes only at $1/min agreed with the customer BEFORE work starts. RETURNING or unclear history = restart: quoted rate includes 30 minutes, then $1/min, billed after. Base charged at ETA text. Ordinary visits are never billed by the minute. Verify household history and existing promises before approval; never add a second maintenance charge.",
    `Desired start: ${values.intent === "service_request" ? values.startTiming : "Not requested"}`,
    `Reply preference: ${values.preferredContact}`,
    `Service SMS permission: ${values.preferredContact === "text" ? `Yes \u2014 ${consentVersion} at ${consentAt}` : "No"}`,
    `Terms accepted: ${values.intent === "service_request" ? `Yes \u2014 ${termsVersion} at ${termsAt}` : "Not applicable"}`,
    termsCheck.outdated ? `Terms version check: the customer accepted Terms version ${termsVersion}; the current version is ${termsCheck.current}. Confirm the current Terms with the customer before approval.` : "",
    values.question ? `Customer message: ${values.question}` : "",
    attribution.utm_source ? `Attribution: ${[attribution.utm_source, attribution.utm_medium, attribution.utm_campaign].filter(Boolean).join(" / ")}` : "",
    `Request ID: ${requestId}`
  ].filter(Boolean).join("\n");
  return {
    schemaVersion: SCHEMA_VERSION,
    requestId,
    eventId: cleanString(lead.eventId, 120) || requestId + ":" + values.expectedStage,
    stage: values.expectedStage,
    intent: values.intent,
    zip: values.zip,
    dogs: String(quote.dogs),
    frequency: quote.frequency.label,
    frequencyId: quote.frequencyId,
    areas: quote.areaIds.map((id) => AREA_LABELS[id]).join(" & "),
    areaIds: quote.areaIds,
    yardSize: quote.yard.label,
    yardSizeId: quote.yardSizeId,
    lastCleaned: values.lastCleaned,
    customerStatus: values.customerStatus,
    offerVersion: "2026-10-08-no-start-up-fee-120",
    offerEligibility: quote.frequencyId === "onetime" ? "not_applicable" : quote.custom ? "custom_review" : values.customerStatus === "new" ? "new_customer_review" : "returning_customer_review",
    cleanupPolicyVersion: "2026-10-08-no-start-up-fee-120",
    proposedCleanupBaseCents: quote.custom ? null : quote.priceCents,
    standardCleanupIncludedMinutes: quote.custom ? null : 30,
    standardAdditionalMinuteCents: quote.custom ? null : 100,
    promotionalAdditionalMinuteCents: null,
    newCustomerCleanupIncludedMinutes: quote.custom || quote.frequencyId === "onetime" ? null : 120,
    newCustomerExtraTimeRequiresAgreement: quote.custom || quote.frequencyId === "onetime" ? null : true,
    cleanupBaseChargeTrigger: "eta_sent",
    cleanupBalanceChargeTrigger: "cleanup_completed",
    finalCleanupTotalCents: null,
    firstVisitPriceCents: null,
    firstVisitApprovalRequired: true,
    automaticPromotionApproved: false,
    startTiming: values.intent === "service_request" ? values.startTiming : "",
    perVisitPrice: quote.custom ? "" : (quote.priceCents / 100).toFixed(2),
    serverPriceCents: quote.custom ? null : quote.priceCents,
    pricingVersion: PRICING_VERSION,
    customEstimate: quote.custom,
    customReasons: quote.reasons || [],
    firstName: values.firstName,
    lastName: values.intent === "service_request" ? values.lastName : "",
    phone: values.phone,
    phoneE164: values.phone ? "+1" + values.phone : "",
    email: values.email,
    street: values.intent === "service_request" ? values.street : "",
    city: values.intent === "service_request" ? values.city : "",
    state: "IN",
    serviceAddress,
    preferredContact: values.preferredContact,
    smsTransactionalConsent: values.preferredContact === "text",
    consent: values.preferredContact === "text" ? "yes" : "no",
    consentVersion,
    smsConsentCapturedAt: consentAt,
    termsAccepted: values.intent === "service_request",
    termsVersion,
    termsAcceptedAt: termsAt,
    question: values.question,
    quoteSummary,
    notes: cleanString(lead.notes, 500),
    page: cleanString(lead.page, 1e3),
    attribution,
    utmSource: attribution.utm_source || "",
    utmMedium: attribution.utm_medium || "",
    utmCampaign: attribution.utm_campaign || "",
    gclid: cleanString(lead.gclid, 500),
    fbclid: cleanString(lead.fbclid, 500),
    fbp: cleanString(lead.fbp, 500),
    fbc: cleanString(lead.fbc, 500),
    submittedAt: cleanString(lead.submittedAt, 40),
    receivedAt: acceptedAt,
    consentUserAgent: cleanString(request.headers.get("User-Agent"), 500),
    source: "purge-pros-cloudflare-widget"
  };
}
__name(buildV3Forward, "buildV3Forward");
async function handleReviews(request, env) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": `public, max-age=${REVIEWS_TTL_SECONDS}`
  };
  if (!env.GOOGLE_PLACES_API_KEY || !env.GOOGLE_PLACE_ID) {
    return new Response(JSON.stringify({ error: "reviews not configured" }), { status: 500, headers });
  }
  const cache = caches.default;
  const cacheKey = new Request(new URL("/reviews", request.url));
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  const upstream = await fetch(`https://places.googleapis.com/v1/places/${env.GOOGLE_PLACE_ID}`, {
    headers: {
      "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": "rating,userRatingCount"
    }
  });
  if (!upstream.ok) return new Response(JSON.stringify({ error: "upstream" }), { status: 502, headers });
  const place = await upstream.json();
  const response = new Response(JSON.stringify({ rating: place.rating ?? null, count: place.userRatingCount ?? null }), { status: 200, headers });
  await cache.put(cacheKey, response.clone());
  return response;
}
__name(handleReviews, "handleReviews");
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
async function sendMetaCapi(lead, request, env) {
  if (!env.META_PIXEL_ID || !env.META_CAPI_TOKEN) return;
  if (lead.stage !== "service_requested" && lead.stage !== "estimate_requested") return;
  // A staging copy may only ever send a labelled test event.
  if (env.STAGING === "1" && !env.META_TEST_EVENT_CODE) return;
  const requestOrigin = request.headers.get("Origin");
  if (requestOrigin && !env.META_TEST_EVENT_CODE) {
    try {
      if (new URL(requestOrigin).hostname.endsWith(".workers.dev")) return;
    } catch (_) {
      return;
    }
  }
  const userData = {
    client_ip_address: request.headers.get("CF-Connecting-IP") || void 0,
    client_user_agent: request.headers.get("User-Agent") || void 0
  };
  if (/^\d{10}$/.test(lead.phone || "")) userData.ph = [await sha256Hex("1" + lead.phone)];
  if (lead.email) userData.em = [await sha256Hex(lead.email.trim().toLowerCase())];
  if (lead.fbp) userData.fbp = lead.fbp;
  if (lead.fbc) userData.fbc = lead.fbc;
  else if (lead.fbclid) userData.fbc = "fb.1." + Date.now() + "." + lead.fbclid;
  const body = {
    data: [{
      event_name: "Lead",
      event_time: Math.floor(Date.now() / 1e3),
      event_id: lead.eventId || void 0,
      action_source: "website",
      event_source_url: lead.page || void 0,
      user_data: userData,
      custom_data: {
        currency: "USD",
        value: typeof lead.serverPriceCents === "number" ? lead.serverPriceCents / 100 : 0
      }
    }]
  };
  if (env.META_TEST_EVENT_CODE) body.test_event_code = env.META_TEST_EVENT_CODE;
  // Keep Meta's answer: status, count received and trace id only. Never the event, never personal data.
  const outcome = { event: "meta_capi_result", requestId: lead.requestId || null, stage: lead.stage, testEvent: Boolean(env.META_TEST_EVENT_CODE), httpStatus: null, eventsReceived: null, fbtraceId: null, errorCode: null };
  try {
    const reply = await fetch(`https://graph.facebook.com/v21.0/${env.META_PIXEL_ID}/events?access_token=${env.META_CAPI_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    outcome.httpStatus = reply.status;
    try {
      const answer = JSON.parse((await reply.text()).slice(0, 4e3));
      if (answer && typeof answer === "object") {
        const failure = answer.error && typeof answer.error === "object" ? answer.error : {};
        if (Number.isFinite(answer.events_received)) outcome.eventsReceived = answer.events_received;
        const trace = typeof answer.fbtrace_id === "string" ? answer.fbtrace_id : typeof failure.fbtrace_id === "string" ? failure.fbtrace_id : "";
        if (trace) outcome.fbtraceId = trace.slice(0, 80);
        if (Number.isFinite(failure.code)) outcome.errorCode = failure.code;
      }
    } catch (_) {
    }
  } catch (_) {
    outcome.errorCode = "request_failed";
  }
  try {
    console.log(JSON.stringify(outcome));
  } catch (_) {
  }
}
__name(sendMetaCapi, "sendMetaCapi");
async function postToGhl(forward, env) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1e4);
  try {
    return await fetch(env.GHL_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(forward),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}
__name(postToGhl, "postToGhl");
async function handleLeadSubmission(request, env, ctx) {
  const path = new URL(request.url).pathname;
  if (path === "/voice-quote") return handleVoiceQuote(request, env);
  const origin = request.headers.get("Origin");
  const allowed = originAllowed(origin, env, request.url);
  const cors = corsHeaders(allowed ? origin : "null");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method === "GET" && new URL(request.url).pathname.endsWith("/reviews")) return handleReviews(request, env);
  if (request.method !== "POST") return jsonResponse(405, { accepted: false, message: "Method not allowed" }, cors);
  if (!allowed) return jsonResponse(403, { accepted: false, message: "Forbidden" }, cors);
  if (!String(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) {
    return jsonResponse(415, { accepted: false, message: "JSON required" }, cors);
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return jsonResponse(413, { accepted: false, message: "Payload too large" }, cors);
  }
  let lead;
  try {
    lead = JSON.parse(raw);
  } catch (_) {
    return jsonResponse(400, { accepted: false, message: "Bad JSON" }, cors);
  }
  if (!lead || typeof lead !== "object" || Array.isArray(lead)) {
    return jsonResponse(400, { accepted: false, message: "Invalid request" }, cors);
  }
  if (!env.GHL_WEBHOOK_URL) return jsonResponse(500, { accepted: false, message: "Relay not configured" }, cors);
  let requestId = cleanString(lead.requestId, 120) || crypto.randomUUID();
  let forward;
  if (lead.schemaVersion === SCHEMA_VERSION) {
    const validation = validateV3(lead);
    if (!validation.ok) {
      return jsonResponse(400, { accepted: false, message: "Please check the highlighted form details.", fields: validation.errors }, cors);
    }
    if (termsVersionCheck(env, validation.values.intent, cleanString(lead.termsVersion, 80)).refuse) {
      return jsonResponse(400, {
        accepted: false,
        code: "TERMS_VERSION_OUTDATED",
        message: "Our Terms & Conditions have been updated. Please reload this page, review the current terms and send your request again. Nothing has been scheduled or charged by this form.",
        fields: ["termsAccepted"]
      }, cors);
    }
    forward = buildV3Forward(lead, validation.values, requestId, request, env);
  } else {
    if (env.ACCEPT_LEGACY_WIDGET === "false") {
      return jsonResponse(400, { accepted: false, message: "Unsupported widget version" }, cors);
    }
    const phone = normalizePhone(lead.phone);
    const email = cleanString(lead.email, 254).toLowerCase();
    if (!LEGACY_STAGES.has(lead.stage) || !phone && !validEmail(email)) {
      return jsonResponse(400, { accepted: false, message: "Invalid legacy lead" }, cors);
    }
    forward = {
      ...lead,
      phone,
      email,
      requestId,
      receivedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: "purge-quote-widget-legacy"
    };
  }
  if (env.USE_QUOTE_REPLAY_LEDGER) return dispatchQuoteWithLedger(forward, request, env, cors);
  let upstream;
  try {
    upstream = await postToGhl(forward, env);
  } catch (_) {
    return jsonResponse(502, { accepted: false, message: "We could not save your request. Please try again." }, cors);
  }
  if (!upstream.ok) {
    return jsonResponse(502, { accepted: false, message: "We could not save your request. Please try again." }, cors);
  }
  ctx.waitUntil(sendMetaCapi(forward, request, env));
  return jsonResponse(202, { accepted: true, requestId }, cors);
}
__name(handleLeadSubmission, "handleLeadSubmission");
// Isolated plan-only save links. Shares the binding, never submission object names/keys.
var RESUME_TTL_MS = 7 * 24 * 60 * 60 * 1000;
var RESUME_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
var RESUME_MAX_BODY = 1024;
var RESUME_FIELDS = ["zip", "dogs", "frequencyId", "yardSizeId", "areaIds", "customerStatus"];
function resumeReply(status, body, cors = {}) {
  return new Response(JSON.stringify(body), { status, headers: {
    ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow"
  } });
}
function resumePlan(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const keys = Object.keys(input);
  if (keys.length !== RESUME_FIELDS.length || keys.some(key => !RESUME_FIELDS.includes(key))) return null;
  if (typeof input.zip !== "string" || !/^\d{5}$/.test(input.zip) || !SERVICE_ZIPS.has(input.zip)) return null;
  if (!Number.isInteger(input.dogs) || input.dogs < 1 || input.dogs > 10) return null;
  if (typeof input.frequencyId !== "string" || !Object.hasOwn(FREQUENCIES, input.frequencyId)) return null;
  if (typeof input.yardSizeId !== "string" || !Object.hasOwn(YARD_SIZES, input.yardSizeId)) return null;
  if (!Array.isArray(input.areaIds) || !input.areaIds.length || input.areaIds.length > 3 ||
      new Set(input.areaIds).size !== input.areaIds.length || input.areaIds.some(id => typeof id !== "string" || !Object.hasOwn(AREA_LABELS, id))) return null;
  if (!["new", "returning", "not_sure"].includes(input.customerStatus)) return null;
  const plan = { zip: input.zip, dogs: input.dogs, frequencyId: input.frequencyId,
    yardSizeId: input.yardSizeId, areaIds: input.areaIds.slice().sort(), customerStatus: input.customerStatus };
  return calculateQuote(plan).ok ? plan : null;
}
async function resumePricingFingerprint() {
  return sha256Hex(JSON.stringify([PRICING_VERSION, FREQUENCIES, YARD_SIZES, AREA_ADDERS]));
}
function resumeQuoteSummary(plan) {
  const quote = calculateQuote(plan);
  return { custom: quote.custom, priceCents: quote.custom ? null : quote.priceCents, pricingVersion: PRICING_VERSION };
}
async function resumeReadJson(request) {
  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) throw { status: 415 };
  const length = Number(request.headers.get("Content-Length"));
  if (length > RESUME_MAX_BODY) throw { status: 413 };
  if (!request.body) throw { status: 400 };
  const reader = request.body.getReader();
  let bytes = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > RESUME_MAX_BODY) { await reader.cancel(); throw { status: 413 }; }
    chunks.push(value);
  }
  const all = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(all)); } catch (_) { throw { status: 400 }; }
}
async function resumeStub(env, purpose, value) {
  const name = await sha256Hex("purge-pros-plan-resume-v1:" + purpose + ":" + value);
  return env.QUOTE_REQUESTS.get(env.QUOTE_REQUESTS.idFromName(name));
}
async function handleQuoteResume(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = originAllowed(origin, env, request.url);
  const cors = corsHeaders(allowed ? origin : "null");
  if (!allowed) return resumeReply(403, { ok: false, code: "FORBIDDEN" }, cors);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return resumeReply(405, { ok: false, code: "METHOD_NOT_ALLOWED" }, cors);
  if (!env.QUOTE_REQUESTS) return resumeReply(503, { ok: false, code: "UNAVAILABLE", message: "Save links are temporarily unavailable. You can continue with your quote." }, cors);
  const isOpen = new URL(request.url).pathname === "/quote-resume/open";
  let input;
  try { input = await resumeReadJson(request); } catch (error) {
    return resumeReply(error.status || 400, { ok: false, code: "INVALID_REQUEST" }, cors);
  }
  const plan = isOpen ? null : resumePlan(input);
  if (isOpen ? !input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 1 || typeof input.token !== "string" || !RESUME_TOKEN_RE.test(input.token) : !plan) {
    return resumeReply(400, { ok: false, code: "INVALID_REQUEST", message: "This saved plan could not be opened. Please build a new quote." }, cors);
  }
  try {
    // Cloudflare supplies this trusted edge header. No IP or attribution is stored in plan data.
    const ip = request.headers.get("CF-Connecting-IP");
    if (!ip) return resumeReply(503, { ok: false, code: "UNAVAILABLE" }, cors);
    const now = Date.now();
    const bucket = Math.floor(now / 3600000);
    const limiter = await resumeStub(env, "limit", (isOpen ? "open:" : "save:") + bucket + ":" + ip);
    const limitResult = await limiter.fetch(new Request("https://quote-resume.internal/resume/limit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ max: isOpen ? 120 : 10, expiresAt: (bucket + 1) * 3600000 })
    }));
    if (!limitResult.ok) return resumeReply(429, { ok: false, code: "RATE_LIMITED", message: "Too many save-link attempts. Please try again later; you can still build a quote." }, cors);
    if (isOpen) {
      const stub = await resumeStub(env, "token", input.token);
      const loaded = await stub.fetch(new Request("https://quote-resume.internal/resume/read", { method: "POST" }));
      if (!loaded.ok) return resumeReply(404, { ok: false, code: "LINK_UNAVAILABLE", message: "This save link has expired or is unavailable. Please build a new quote." }, cors);
      const record = await loaded.json();
      const valid = resumePlan(record.plan);
      if (!valid) return resumeReply(409, { ok: false, code: "PLAN_UNAVAILABLE", message: "Coverage or plan options have changed. Please build a new quote with the current options." }, cors);
      const quote = resumeQuoteSummary(valid);
      const changed = record.pricingFingerprint !== await resumePricingFingerprint() ||
        record.quote.pricingVersion !== PRICING_VERSION || record.quote.priceCents !== quote.priceCents || record.quote.custom !== quote.custom;
      return resumeReply(200, { ok: true, plan: valid, quote, pricingChanged: changed, expiresAt: record.expiresAt }, cors);
    }
    const random = crypto.getRandomValues(new Uint8Array(32));
    const token = btoa(String.fromCharCode(...random)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const record = { schema: "plan-resume.v1", plan, quote: resumeQuoteSummary(plan),
      pricingFingerprint: await resumePricingFingerprint(), createdAt: now, expiresAt: now + RESUME_TTL_MS };
    const stub = await resumeStub(env, "token", token);
    const saved = await stub.fetch(new Request("https://quote-resume.internal/resume/store", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record)
    }));
    if (!saved.ok) throw new Error("Save unavailable");
    return resumeReply(201, { ok: true, url: savedLinkBase(env) + "#resume=" + token, expiresAt: record.expiresAt }, cors);
  } catch (_) {
    return resumeReply(503, { ok: false, code: "UNAVAILABLE", message: "Save links are temporarily unavailable. You can continue with your quote." }, cors);
  }
}
async function handleResumeStorage(instance, request) {
  if (request.method !== "POST") return resumeReply(405, { ok: false });
  const path = new URL(request.url).pathname;
  return instance.ctx.blockConcurrencyWhile(async () => {
    const storage = instance.ctx.storage;
    const now = Date.now();
    if (path === "/resume/read") {
      const record = await storage.get("resumePlan");
      if (!record || record.schema !== "plan-resume.v1" || record.expiresAt <= now) {
        if (record) await storage.delete("resumePlan");
        return resumeReply(404, { ok: false });
      }
      return resumeReply(200, record);
    }
    let input;
    try { input = await request.json(); } catch (_) { return resumeReply(400, { ok: false }); }
    if (path === "/resume/limit") {
      if (!input || ![10, 120].includes(input.max) || !Number.isSafeInteger(input.expiresAt) || input.expiresAt <= now || input.expiresAt > now + 3600000) return resumeReply(400, { ok: false });
      let rate = await storage.get("resumeRate");
      if (!rate || rate.expiresAt <= now) rate = { count: 0, expiresAt: input.expiresAt };
      if (rate.count >= input.max) return resumeReply(429, { ok: false });
      rate.count++;
      await storage.setAlarm(rate.expiresAt);
      await storage.put("resumeRate", rate);
      return resumeReply(200, { ok: true });
    }
    if (path !== "/resume/store" || !input || input.schema !== "plan-resume.v1" || !resumePlan(input.plan) ||
        !Number.isSafeInteger(input.expiresAt) || input.expiresAt <= now || input.expiresAt > now + RESUME_TTL_MS ||
        typeof input.pricingFingerprint !== "string" || !input.quote) return resumeReply(400, { ok: false });
    if (await storage.get("resumePlan")) return resumeReply(409, { ok: false });
    // Explicit field copy keeps token, IP, PII and arbitrary keys out of storage.
    const record = { schema: "plan-resume.v1", plan: resumePlan(input.plan), quote: {
      custom: Boolean(input.quote.custom), priceCents: input.quote.priceCents, pricingVersion: input.quote.pricingVersion
    }, pricingFingerprint: input.pricingFingerprint, createdAt: now, expiresAt: input.expiresAt };
    await storage.setAlarm(record.expiresAt);
    await storage.put("resumePlan", record);
    return resumeReply(201, { ok: true });
  });
}
async function expireResumeStorage(instance) {
  return instance.ctx.blockConcurrencyWhile(async () => {
    const now = Date.now();
    let next = null;
    for (const key of ["resumePlan", "resumeRate"]) {
      const record = await instance.ctx.storage.get(key);
      if (!record) continue;
      if (record.expiresAt <= now) await instance.ctx.storage.delete(key);
      else next = next === null ? record.expiresAt : Math.min(next, record.expiresAt);
    }
    if (next !== null) await instance.ctx.storage.setAlarm(next);
    // Never deleteAll: existing submission ledger data is not owned by this feature.
  });
}

var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/quote-resume" || url.pathname === "/quote-resume/open") return handleQuoteResume(request, env);
    if (url.pathname === "/voice-quote") return handleVoiceQuote(request, env);
    if (request.method === "GET" && url.pathname === "/purge-quote.js") {
      return new Response(launcherScript(env), {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "public, max-age=300",
          "Access-Control-Allow-Origin": "*",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }
    if (request.method === "GET" && QUOTE_FORWARD_PATHS.has(url.pathname)) return quotePageRedirect(request, env);
    if (url.pathname === "/reviews" && request.method === "GET") return handleReviews(request, env);
    if (url.pathname === "/submit" && (request.method === "POST" || request.method === "OPTIONS")) {
      return handleLeadSubmission(request, {
        ...env,
        GHL_WEBHOOK_URL: env.GHL_WEBHOOK_URL_V3 || "",
        ACCEPT_LEGACY_WIDGET: "false",
        USE_QUOTE_REPLAY_LEDGER: true
      }, ctx);
    }
    if (url.pathname === "/" && (request.method === "POST" || request.method === "OPTIONS")) {
      return handleLeadSubmission(request, { ...env, ACCEPT_LEGACY_WIDGET: "true" }, ctx);
    }
    return new Response("Not found", { status: 404 });
  }
};
export {
  QuoteRequestLedger,
  worker_default as default
};
//# sourceMappingURL=worker.js.map
