/**
 * Purge Pros lead relay — Cloudflare Worker.
 *
 * Routes:
 *   POST /        validated widget submission -> GoHighLevel inbound webhook
 *   GET /reviews  live Google rating + review count, edge-cached for six hours
 *
 * Required secret:
 *   GHL_WEBHOOK_URL
 *
 * Recommended variable:
 *   ALLOWED_ORIGINS="https://itspurgepros.com,https://www.itspurgepros.com"
 *
 * Optional review and Meta CAPI secrets:
 *   GOOGLE_PLACES_API_KEY, GOOGLE_PLACE_ID, META_PIXEL_ID, META_CAPI_TOKEN
 */

const SCHEMA_VERSION = "cloudflare-widget.v3";
const PRICING_VERSION = "2026-08-cloudflare-v1";
const MAX_BODY_BYTES = 30000;
const REVIEWS_TTL_SECONDS = 21600;
const DEFAULT_ALLOWED_ORIGINS = [
  "https://itspurgepros.com",
  "https://www.itspurgepros.com",
  "https://purge-quote.purgepros.workers.dev"
];

const SERVICE_ZIPS = new Set([
  "46011", "46013", "46014", "46015", "46016", "46032", "46033", "46034", "46037",
  "46038", "46040", "46048", "46051", "46055", "46056", "46060", "46061", "46062",
  "46064", "46074", "46075", "46077", "46112", "46113", "46122", "46123", "46140",
  "46142", "46143", "46158", "46163", "46167", "46168", "46214", "46216", "46217",
  "46220", "46221", "46227", "46228", "46231", "46234", "46236", "46237", "46239",
  "46240", "46250", "46256", "46259", "46260", "46268", "46278", "46280"
]);

const FREQUENCIES = {
  twice: { label: "Twice weekly", maxDogs: 9, prices: { 1: 1599, 2: 1749, 3: 1899, 4: 2049, 5: 2199, 6: 2349, 7: 2499, 8: 2649, 9: 2799 } },
  weekly: { label: "Weekly", maxDogs: 5, prices: { 1: 1999, 2: 2249, 3: 2499, 4: 2749, 5: 2999 } },
  biweekly: { label: "Every other week", maxDogs: 4, prices: { 1: 2999, 2: 3349, 3: 3699, 4: 4049 } },
  onetime: { label: "One-time cleanup", anyDogs: true, flatPrice: 8999 },
  custom: { label: "Custom booking", custom: true }
};

const AREA_LABELS = { back: "Back yard", front: "Front yard", side: "Side yard(s)" };
const AREA_ADDERS = { 1: 0, 2: 250, 3: 500 };
const YARD_SIZES = {
  s: { label: "Up to ⅛ acre", add: 0 },
  m: { label: "Up to ¼ acre", add: 400 },
  l: { label: "Up to ½ acre", add: 800 },
  xl: { label: "Up to 1 acre", add: 1200 },
  over: { label: "Over 1 acre", custom: true }
};
const LAST_CLEANED = new Set(["Within 1 week", "2–3 weeks", "About 1 month", "2–4 months", "5–6 months", "More than 6 months"]);
const START_TIMINGS = new Set(["As soon as possible", "Within the next week", "In the next few weeks", "Just researching for now"]);
const PREFERRED_CONTACTS = new Set(["text", "email", "call"]);
const LEGACY_STAGES = new Set(["phone_captured", "quote_updated", "question_submitted", "service_requested", "estimate_requested", "out_of_area"]);

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function jsonResponse(status, body, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function originAllowed(origin, env, requestUrl) {
  if (origin && requestUrl && origin === new URL(requestUrl).origin) return true;
  if (!origin) return false;
  const allowedOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(",").map(value => value.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;
  return allowedOrigins.includes(origin);
}

function cleanString(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return /^\d{10}$/.test(digits) ? digits : "";
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function calculateQuote(lead) {
  const dogs = Number(lead.dogs);
  const frequencyId = cleanString(lead.frequencyId, 20);
  const frequency = FREQUENCIES[frequencyId];
  const yardSizeId = cleanString(lead.yardSizeId, 20);
  const yard = YARD_SIZES[yardSizeId];
  const areaIds = Array.from(new Set(Array.isArray(lead.areaIds) ? lead.areaIds : []))
    .filter(id => Object.prototype.hasOwnProperty.call(AREA_LABELS, id));
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

  const priceCents = frequencyId === "onetime"
    ? frequency.flatPrice
    : frequency.prices[dogs] + AREA_ADDERS[areaIds.length] + yard.add;
  return { ok: true, custom: false, priceCents, dogs, frequencyId, frequency, yardSizeId, yard, areaIds };
}

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

  const expectedStage = intent === "question"
    ? "question_submitted"
    : intent === "quote_delivery"
      ? "quote_requested"
      : quote.ok && quote.custom
        ? "estimate_requested"
        : "service_requested";
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
    values: { intent, preferredContact, phone, email, zip, quote, firstName, lastName, street, city, startTiming, lastCleaned, question, expectedStage }
  };
}

function cleanAttribution(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "wbraid", "gbraid", "fbclid"];
  return Object.fromEntries(allowed.map(key => [key, cleanString(value[key], 500)]).filter(([, item]) => item));
}

function buildV3Forward(lead, values, requestId, request) {
  const quote = values.quote;
  const acceptedAt = new Date().toISOString();
  const attribution = cleanAttribution(lead.attribution);
  const serviceAddress = values.intent === "service_request"
    ? `${values.street}, ${values.city}, IN ${values.zip}`
    : "";
  const consentVersion = values.preferredContact === "text" ? cleanString(lead.consentVersion, 80) : "";
  const consentAt = values.preferredContact === "text" ? cleanString(lead.smsConsentCapturedAt, 40) || acceptedAt : "";
  const termsVersion = values.intent === "service_request" ? cleanString(lead.termsVersion, 80) : "";
  const termsAt = values.intent === "service_request" ? cleanString(lead.termsAcceptedAt, 40) || acceptedAt : "";
  const requestType = values.expectedStage === "service_requested"
    ? "Service requested"
    : values.expectedStage === "estimate_requested"
      ? "Custom estimate requested"
      : values.expectedStage === "quote_requested"
        ? "Quote copy requested"
        : "Customer question";
  const quoteSummary = [
    "Purge Pros website quote",
    `Request: ${requestType}`,
    `Service address: ${serviceAddress || "Not collected for this request type"}`,
    `Plan: ${quote.frequency.label}`,
    `Price: ${quote.custom ? "Custom estimate required" : `$${(quote.priceCents / 100).toFixed(2)} per visit`}`,
    `Dogs: ${quote.dogs >= 10 ? "10+" : quote.dogs}`,
    `Service areas: ${quote.areaIds.map(id => AREA_LABELS[id]).join(" & ")}`,
    `Yard size: ${quote.yard.label}`,
    `Last fully cleaned: ${values.lastCleaned}`,
    `Desired start: ${values.intent === "service_request" ? values.startTiming : "Not requested"}`,
    `Reply preference: ${values.preferredContact}`,
    `Service SMS permission: ${values.preferredContact === "text" ? `Yes — ${consentVersion} at ${consentAt}` : "No"}`,
    `Terms accepted: ${values.intent === "service_request" ? `Yes — ${termsVersion} at ${termsAt}` : "Not applicable"}`,
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
    areas: quote.areaIds.map(id => AREA_LABELS[id]).join(" & "),
    areaIds: quote.areaIds,
    yardSize: quote.yard.label,
    yardSizeId: quote.yardSizeId,
    lastCleaned: values.lastCleaned,
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
    page: cleanString(lead.page, 1000),
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

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function sendMetaCapi(lead, request, env) {
  if (!env.META_PIXEL_ID || !env.META_CAPI_TOKEN) return;
  if (lead.stage !== "service_requested" && lead.stage !== "estimate_requested") return;
  const requestOrigin = request.headers.get("Origin");
  if (requestOrigin && !env.META_TEST_EVENT_CODE) {
    try {
      if (new URL(requestOrigin).hostname.endsWith(".workers.dev")) return;
    } catch (_) {
      return;
    }
  }

  const userData = {
    client_ip_address: request.headers.get("CF-Connecting-IP") || undefined,
    client_user_agent: request.headers.get("User-Agent") || undefined
  };
  if (/^\d{10}$/.test(lead.phone || "")) userData.ph = [await sha256Hex("1" + lead.phone)];
  if (lead.email) userData.em = [await sha256Hex(lead.email.trim().toLowerCase())];
  if (lead.fbp) userData.fbp = lead.fbp;
  if (lead.fbc) userData.fbc = lead.fbc;
  else if (lead.fbclid) userData.fbc = "fb.1." + Date.now() + "." + lead.fbclid;

  const body = {
    data: [{
      event_name: "Lead",
      event_time: Math.floor(Date.now() / 1000),
      event_id: lead.eventId || undefined,
      action_source: "website",
      event_source_url: lead.page || undefined,
      user_data: userData,
      custom_data: {
        currency: "USD",
        value: typeof lead.serverPriceCents === "number" ? lead.serverPriceCents / 100 : 0
      }
    }]
  };
  if (env.META_TEST_EVENT_CODE) body.test_event_code = env.META_TEST_EVENT_CODE;
  try {
    await fetch(`https://graph.facebook.com/v21.0/${env.META_PIXEL_ID}/events?access_token=${env.META_CAPI_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (_) {
    // This is a conversion backup only. It must never make an accepted lead fail.
  }
}

async function postToGhl(forward, env) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
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

export default {
  async fetch(request, env, ctx) {
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
      forward = buildV3Forward(lead, validation.values, requestId, request);
    } else {
      if (env.ACCEPT_LEGACY_WIDGET === "false") {
        return jsonResponse(400, { accepted: false, message: "Unsupported widget version" }, cors);
      }
      // Temporary compatibility for already-open copies of the previous widget.
      // Remove after the host Worker cache has fully expired following launch.
      const phone = normalizePhone(lead.phone);
      const email = cleanString(lead.email, 254).toLowerCase();
      if (!LEGACY_STAGES.has(lead.stage) || (!phone && !validEmail(email))) {
        return jsonResponse(400, { accepted: false, message: "Invalid legacy lead" }, cors);
      }
      forward = {
        ...lead,
        phone,
        email,
        requestId,
        receivedAt: new Date().toISOString(),
        source: "purge-quote-widget-legacy"
      };
    }

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
};
