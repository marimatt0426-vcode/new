/**
 * Purge Pros lead relay — Cloudflare Worker.
 *
 * Sits between the public quote widget and GoHighLevel so the GHL webhook
 * URL never appears in your site's source, and so junk traffic can be
 * rejected in one place.
 *
 * Secrets / vars (set with `wrangler secret put` or in the dashboard):
 *   GHL_WEBHOOK_URL  - GHL workflow "Inbound Webhook" trigger URL (required)
 *   ALLOWED_ORIGINS  - comma-separated origins allowed to post, e.g.
 *                      "https://itspurgepros.com,https://www.itspurgepros.com"
 *                      (optional; if unset, any origin is accepted)
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(originAllowed(origin, env) ? origin : "null");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
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
