/**
 * Purge Pros lead relay — Cloudflare Worker.
 *
 * Sits between the public quote widget and GoHighLevel so the GHL webhook
 * URL never appears in your site's source, and so junk traffic can be
 * rejected in one place.
 *
 * Routes:
 *   POST /            lead relay -> GHL inbound webhook
 *   GET  /reviews     live Google rating + review count, edge-cached 6h
 *
 * Secrets / vars (set with `wrangler secret put` or in the dashboard):
 *   GHL_WEBHOOK_URL        - GHL workflow "Inbound Webhook" trigger URL (required)
 *   ALLOWED_ORIGINS        - comma-separated origins allowed to post, e.g.
 *                            "https://itspurgepros.com,https://www.itspurgepros.com"
 *                            (optional; if unset, any origin is accepted)
 *   GOOGLE_PLACES_API_KEY  - Google Cloud API key with Places API (New) enabled
 *                            (only needed for /reviews)
 *   GOOGLE_PLACE_ID        - your Google Business Profile Place ID
 */

const VALID_STAGES = [
  "phone_captured",
  "quote_updated",
  "question_submitted",
  "service_requested",
  "estimate_requested",
  "out_of_area"
];

const MAX_BODY_BYTES = 8192;

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function originAllowed(origin, env) {
  if (!env.ALLOWED_ORIGINS) return true;
  if (!origin) return false;
  return env.ALLOWED_ORIGINS.split(",").map(s => s.trim()).includes(origin);
}

// Rating + review count are public data, so /reviews is served with open CORS
// and cached at the edge: Google gets a handful of calls per day regardless of
// site traffic.
const REVIEWS_TTL_SECONDS = 21600; // 6h

async function handleReviews(request, env) {
  const jsonHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": `public, max-age=${REVIEWS_TTL_SECONDS}`
  };
  if (!env.GOOGLE_PLACES_API_KEY || !env.GOOGLE_PLACE_ID) {
    return new Response(JSON.stringify({ error: "reviews not configured" }), { status: 500, headers: jsonHeaders });
  }

  const cache = caches.default;
  const cacheKey = new Request(new URL("/reviews", request.url));
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const upstream = await fetch(
    `https://places.googleapis.com/v1/places/${env.GOOGLE_PLACE_ID}`,
    { headers: {
        "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": "rating,userRatingCount"
    } }
  );
  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: "upstream" }), { status: 502, headers: jsonHeaders });
  }
  const place = await upstream.json();
  const body = JSON.stringify({
    rating: place.rating ?? null,
    count: place.userRatingCount ?? null
  });
  const response = new Response(body, { status: 200, headers: jsonHeaders });
  await cache.put(cacheKey, response.clone());
  return response;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(originAllowed(origin, env) ? origin : "null");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method === "GET" && new URL(request.url).pathname.endsWith("/reviews")) {
      return handleReviews(request, env);
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: cors });
    }
    if (!originAllowed(origin, env)) {
      return new Response("Forbidden", { status: 403, headers: cors });
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return new Response("Payload too large", { status: 413, headers: cors });
    }

    let lead;
    try {
      lead = JSON.parse(raw);
    } catch {
      return new Response("Bad JSON", { status: 400, headers: cors });
    }

    // Minimum viable lead: a known stage, plus a 10-digit phone or an email.
    const phoneOk = /^\d{10}$/.test(lead.phone || "");
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email || "");
    if (!VALID_STAGES.includes(lead.stage) || (!phoneOk && !emailOk)) {
      return new Response("Invalid lead", { status: 400, headers: cors });
    }

    if (!env.GHL_WEBHOOK_URL) {
      return new Response("Relay not configured", { status: 500, headers: cors });
    }

    const forward = {
      ...lead,
      receivedAt: new Date().toISOString(),
      sourceIp: request.headers.get("CF-Connecting-IP") || "",
      source: "purge-quote-widget"
    };

    const resp = await fetch(env.GHL_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(forward)
    });

    if (!resp.ok) {
      return new Response("Upstream error", { status: 502, headers: cors });
    }
    return new Response(null, { status: 204, headers: cors });
  }
};
