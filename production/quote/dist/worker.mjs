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
var GOOGLE_ADS_SEND_TO = "AW-17767139897/g9smCM7pkL4cELmUhJhC";
var FIRE_META_PIXEL_EVENTS = true;
var WIDGET_JS = "/*!\n * Purge Pros — transparent-price quote and service-request widget.\n * Self-contained, dependency-free, and hosted by the existing Cloudflare Worker.\n *\n * Embed: <script src=\"https://YOUR-HOST/purge-quote.js\" defer></script>\n * Open:  links to #quote / #get-quote, [data-purge-quote], PurgeProsQuote.open(),\n *        or a landing URL containing ?open_quote=1.\n */\n(function () {\n  \"use strict\";\n  if (window.PurgeProsQuote) return;\n\n  const CONFIG = {\n    uiVersion: \"2026-09-12-website-improvements-v1\",\n    uiBuildVersion: \"2026-09-13-selected-improvements-v1\",\n    leadEndpoint: \"\",\n    reviewsEndpoint: \"\",\n    tracking: {\n      googleAdsSendTo: \"\",\n      firePixelEvents: true\n    },\n    brand: {\n      name: \"Purge Pros\",\n      phoneDisplay: \"(317) 961-5865\",\n      phoneHref: \"tel:+13179615865\",\n      iconUrl: \"https://images.leadconnectorhq.com/image/f_webp/q_80/r_96/u_https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/69ffe0d6a7b9e0385a45dea3.png\",\n      heroImageUrl: \"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa7bf6d49f830e49b15f5f7.webp\",\n      privacyUrl: \"https://itspurgepros.com/privacy-policy\",\n      termsUrl: \"https://itspurgepros.com/terms-conditions\",\n      reviewChipTemplate: \"{rating}/5 on Google · {count} reviews\"\n    },\n    consentVersion: \"service-sms-2026-08-v1\",\n    termsVersion: \"2026-09-08-checkout-clarity\",\n    pricingVersion: \"2026-08-cloudflare-v1\",\n    promotion: {\n      \"enabled\": true,\n      \"badge\": \"NEW RECURRING CUSTOMER OFFER\",\n      \"title\": \"Initial scoop surcharge waived\",\n      \"detail\": \"Start with a clean yard at your regular visit price—even if there is built-up poop.\",\n      \"eligibility\": \"One offer per customer/household for new recurring service. We check service history before confirming your booking. One-time cleanups excluded.\",\n      \"linkLabel\": \"See how the offer works\",\n      \"modalTitle\": \"Your new-customer offer\",\n      \"modalIntro\": \"Your initial scoop clears accumulated dog poop so regular service can begin. With the new-customer offer, you pay your regular visit price for the entire first cleanup. The initial scoop surcharge is waived, with no additional-time charge. Scheduled recurring visits also stay at your quoted rate, regardless of time spent.\",\n      \"firstThirtyLabel\": \"Standard initial/restart · first 30 minutes\",\n      \"firstThirtyValue\": \"Your quoted visit rate\",\n      \"additionalLabel\": \"Standard initial cleanup · after 30 minutes\",\n      \"additionalValue\": \"$1 per additional minute\",\n      \"exampleLabel\": \"Standard 60-minute cleanup · example\",\n      \"exampleValue\": \"Your visit rate + $30\",\n      \"customerLabel\": \"Promotional first cleanup · all cleanup time\",\n      \"customerValue\": \"Your visit rate · no time surcharge\",\n      \"disclaimer\": \"Without this offer, initial or restart service includes 30 minutes at your quoted visit rate, then $1 per additional minute. No second maintenance charge is added. The base is charged with your on-the-way ETA text; applicable extra time is billed after completion. No minimum visits, no cancellation fee and no discount repayment. Savings depend on the extra cleanup time needed; no fixed saving is promised.\"\n},\n    serviceZips: [\n      \"46011\", \"46013\", \"46014\", \"46015\", \"46016\", \"46032\", \"46033\", \"46034\", \"46037\",\n      \"46038\", \"46040\", \"46048\", \"46051\", \"46055\", \"46056\", \"46060\", \"46061\", \"46062\",\n      \"46064\", \"46074\", \"46075\", \"46077\", \"46112\", \"46113\", \"46122\", \"46123\", \"46140\",\n      \"46142\", \"46143\", \"46158\", \"46163\", \"46167\", \"46168\", \"46214\", \"46216\", \"46217\",\n      \"46220\", \"46221\", \"46227\", \"46228\", \"46231\", \"46234\", \"46236\", \"46237\", \"46239\",\n      \"46240\", \"46250\", \"46256\", \"46259\", \"46260\", \"46268\", \"46278\", \"46280\"\n    ],\n    frequencies: {\n      twice: {\n        label: \"Twice weekly\",\n        sub: \"For busy yards and multiple dogs\",\n        maxDogs: 9,\n        prices: { 1: 1599, 2: 1749, 3: 1899, 4: 2049, 5: 2199, 6: 2349, 7: 2499, 8: 2649, 9: 2799 }\n      },\n      weekly: {\n        label: \"Weekly\",\n        sub: \"The most popular maintenance plan\",\n        popular: true,\n        maxDogs: 5,\n        prices: { 1: 1999, 2: 2249, 3: 2499, 4: 2749, 5: 2999 }\n      },\n      biweekly: {\n        label: \"Every other week\",\n        sub: \"For lighter-use yards\",\n        maxDogs: 4,\n        prices: { 1: 2999, 2: 3349, 3: 3699, 4: 4049 }\n      },\n      onetime: {\n        label: \"One-time cleanup\",\n        sub: \"A one-visit pet waste cleanup\",\n        anyDogs: true,\n        flatPrice: 8999\n      },\n      custom: {\n        label: \"Custom booking\",\n        sub: \"10+ dogs · over 1 acre · kennels & commercial\",\n        custom: true\n      }\n    },\n    areaLabels: { back: \"Back yard\", front: \"Front yard\", side: \"Side yard(s)\" },\n    areaAdders: { 1: 0, 2: 250, 3: 500 },\n    yardSizes: {\n      s: { label: \"Up to ⅛ acre\", add: 0 },\n      m: { label: \"Up to ¼ acre\", add: 400 },\n      l: { label: \"Up to ½ acre\", add: 800 },\n      xl: { label: \"Up to 1 acre\", add: 1200 },\n      over: { label: \"Over 1 acre\", custom: true }\n    }\n  };\n\n  const ATTRIBUTION_KEYS = [\"utm_source\", \"utm_medium\", \"utm_campaign\", \"utm_content\", \"utm_term\", \"gclid\", \"wbraid\", \"gbraid\", \"fbclid\"];\n  const PROGRESS_LABELS = [\"Area\", \"Plan\", \"Price\", \"Details\", \"Review\"];\n  const LAST_CLEANED_CHOICES = [\"Within 1 week\", \"2–3 weeks\", \"About 1 month\", \"2–4 months\", \"5–6 months\", \"More than 6 months\"];\n  const LOW_RISK_STORAGE_KEY = \"pp_quote_progress_v3\";\n  const ATTRIBUTION_STORAGE_KEY = \"pp_quote_attribution_v3\";\n\n  const ICON_ASSET_URLS = {\"waste-bag\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a216bc55ee8d569af108.webp\",\"property-notes\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a2162e74dc36120b0302.webp\",\"chevron\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a21698106dcc4e208c10.webp\",\"next-arrow\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a216c73b042e1413e0f1.webp\",\"alert\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a216cb032a1c8e04fb24.webp\",\"phone\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a215cb032a1c8e04fb0c.webp\",\"close\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a216a19db9abccb86b39.webp\",\"search\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a21598106dcc4e208c05.webp\",\"deodorize\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a21590b7ca67e9c39b75.webp\",\"yard\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a21598106dcc4e208bcc.webp\",\"yard-guide\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a2152e74dc36120b02b2.webp\",\"local-area\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a21590b7ca67e9c39b6a.webp\",\"secure-payment\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a2159f8b31b6ab2dc63c.webp\",\"scoop\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a215bc55ee8d569af0b0.webp\",\"dog\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a214c73b042e1413e09f.webp\",\"service-calendar\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a2142e74dc36120b0277.webp\",\"professional-team\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a214bc55ee8d569af05c.webp\",\"sanitized-tools\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a214196984c40805b168.webp\",\"per-visit-price\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a2149f8b31b6ab2dc606.webp\",\"no-contract\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a2142e74dc36120b0281.webp\",\"gate-photo\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a213c73b042e1413e061.webp\",\"service-check\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a21347854373d7b0926a.webp\",\"offer-cursor\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a213a19db9abccb86ad1.webp\",\"visit-message\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a21398106dcc4e208b25.webp\",\"mascot-silhouette\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a213196984c40805b128.webp\",\"review-star\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a213cb032a1c8e04fa97.webp\",\"number-badge\":\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9ab16c73b042e1414df4e.webp\"};\n  const QUOTE_ICON_ASSET_URLS = {\"dog-1\":\"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/dog-1-60f0fbcba79e6a9c.webp\",\"dog-2\":\"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/dog-2-e0e397af347ee3f9.webp\",\"dog-3\":\"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/dog-3-822b6e9094776e97.webp\",\"dog-4\":\"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/dog-4-5fdebb0b04647f45.webp\",\"dog-5\":\"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/dog-5-23834884974cc56f.webp\",\"dog-6\":\"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/dog-6-227e16dc7c2b79e2.webp\",\"dog-7\":\"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/dog-7-8c7caea43d40fddb.webp\",\"dog-8\":\"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/dog-8-db0553778399db0b.webp\",\"dog-9\":\"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/dog-9-1ccbf539edbd1dd3.webp\",\"dog-10plus\":\"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/dog-10plus-8ba06412d09ba969.webp\",\"frequency-twice-weekly\":\"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/frequency-twice-weekly-78c69397d2394de7.webp\",\"frequency-weekly\":\"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/frequency-weekly-65b4093d534a415b.webp\",\"frequency-every-other-week\":\"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/frequency-every-other-week-3422d28d15710e49.webp\",\"frequency-one-time\":\"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/frequency-one-time-b38038be6d617033.webp\",\"frequency-custom\":\"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/frequency-custom-dda9b32a1c5aa361.webp\",\"area-back\":\"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/area-back-bbe3069b44528c92.webp\",\"area-front\":\"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/area-front-14e3b8436febc23b.webp\",\"area-sides\":\"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/area-sides-e5e09e238daebab7.webp\",\"area-all\":\"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/area-all-1dd76e604febce38.webp\"};\n  const QUOTE_ICON_KEYS = new Set(Object.keys(QUOTE_ICON_ASSET_URLS));\n  const ICON_KEYS = new Set([...[\"review-star\",\"offer-cursor\",\"mascot-silhouette\",\"gate-photo\",\"sanitized-tools\",\"professional-team\",\"no-contract\",\"per-visit-price\",\"service-calendar\",\"visit-message\",\"service-check\",\"local-area\",\"dog\",\"yard\",\"secure-payment\",\"scoop\",\"deodorize\",\"yard-guide\",\"phone\",\"next-arrow\",\"search\",\"chevron\",\"close\",\"alert\",\"waste-bag\",\"property-notes\",\"number-badge\"], ...QUOTE_ICON_KEYS]);\n  function iconHtml(key, className = \"icon\") {\n    if (!ICON_KEYS.has(key)) throw new Error(\"Unknown icon asset: \" + key);\n    const source = QUOTE_ICON_ASSET_URLS[key] || ICON_ASSET_URLS[key];\n    return \"<img class=\\\"\" + className + \"\\\" src=\\\"\" + source + \"\\\" alt=\\\"\\\" aria-hidden=\\\"true\\\" decoding=\\\"async\\\">\";\n  }  const CSS = `\n    .yard-guide{margin-top:12px;border:1px solid #b5d6bf;border-radius:12px;background:#f6fbf7;overflow:hidden}\n    .yard-guide summary{padding:12px;cursor:pointer;font-weight:700;color:#184d2c}\n    .yard-guide summary:focus-visible{outline:3px solid #f59b32;outline-offset:-3px}\n    .yard-guide-body{padding:0 12px 12px;font-size:13px;line-height:1.5}\n    .yard-guide-body p{margin:10px 0}.yard-guide svg{display:block;width:100%;max-width:400px;height:auto;margin:auto;font-family:inherit}\n    .yard-guide-lead{font-size:18px;font-weight:800;line-height:1.3;color:#153d2a}\n    .yard-property{margin:16px 0;background:#fff;border:1px solid #d3e2d7;border-radius:16px;padding:12px}\n    .yard-property figcaption{display:grid;gap:3px;margin-bottom:10px;color:#244a34;font-size:14px}.yard-property figcaption span{font-size:12px;color:#496452}\n    .yard-property .yard-example-note{font-size:12px;color:#52625a;margin:10px 0 0}\n    .yard-scope-note{padding:12px;border-left:3px solid #267547;background:#e7f2e8;border-radius:0 8px 8px 0}\n    .yard-guide table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}\n    .yard-guide caption{text-align:left;font-weight:700;margin-bottom:6px}\n    .yard-guide th,.yard-guide td{text-align:left;padding:7px 4px;border-bottom:1px solid #d7e5da}\n    .yard-guide .yard-selected{background:#d9f4d7;color:#165327}\n\n    :host { all: initial; position: fixed; inset: 0; z-index: 2147483000; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif; color: #0b2537; }\n    *, *::before, *::after { box-sizing: border-box; }\n    button, input, select, textarea { font: inherit; }\n    button, a { -webkit-tap-highlight-color: transparent; }\n    a { color: #0877b9; }\n    .icon { display: block; flex: 0 0 auto; width: 24px; height: 24px; object-fit: contain; }\n    .field-label-with-icon { display: inline-flex; align-items: center; gap: 7px; }\n    .field-label-icon { width: 20px; height: 20px; }\n    .field label > .field-label-icon { vertical-align: middle; margin-right: 6px; }\n    .action-icon, .action-arrow-icon { width: 24px; height: 24px; object-fit: contain; }\n    .action-chevron { width: 22px; height: 22px; object-fit: contain; }\n    .action-chevron-back { transform: rotate(90deg); }\n    .close, .offer-close { display: grid; place-items: center; }\n    .close-icon, .offer-close-icon { width: 20px; height: 20px; object-fit: contain; }\n    .info-icon { flex: 0 0 26px; width: 26px; height: 26px; object-fit: contain; }\n    .yard-guide-summary { display: inline-flex; align-items: center; gap: 7px; }\n    .yard-guide summary { list-style: none; }\n    .yard-guide summary::-webkit-details-marker { display: none; }\n    .yard-guide-icon, .yard-guide-chevron { width: 20px; height: 20px; }\n    .yard-guide-chevron { transition: transform .16s ease; }\n    .yard-guide[open] .yard-guide-chevron { transform: rotate(180deg); }\n    .trust-mascot { position: absolute; z-index: 0; top: -68px; right: -76px; width: 220px; height: 220px; object-fit: contain; opacity: .14; pointer-events: none; }\n    .backdrop { position: fixed; inset: 0; display: grid; place-items: center; padding: 24px; background: rgba(2, 20, 32, .78); backdrop-filter: blur(10px); }\n    .modal { position: relative; width: min(1180px, 100%); height: min(780px, calc(100vh - 48px)); min-height: 620px; overflow: hidden; display: grid; grid-template-columns: minmax(330px, .86fr) minmax(520px, 1.24fr); border: 1px solid rgba(255,255,255,.58); border-radius: 28px; background: #f6fbfe; box-shadow: 0 34px 100px rgba(0, 20, 35, .35); }\n    .close { position: absolute; z-index: 5; top: 16px; right: 18px; width: 42px; height: 42px; border: 1px solid #cfe0e9; border-radius: 50%; background: rgba(255,255,255,.94); color: #073652; font-size: 25px; line-height: 1; cursor: pointer; box-shadow: 0 8px 22px rgba(5, 52, 80, .12); }\n    .close:hover, .close:focus-visible { background: #e9f7ff; outline: 3px solid rgba(56,182,255,.28); }\n    .trust { position: relative; min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scroll-padding-block: 18px; padding: 28px 30px 22px; color: #fff; background: linear-gradient(152deg, #073652 0%, #075883 58%, #0b83bd 100%); display: flex; flex-direction: column; }\n    @media (min-width: 901px) and (max-width: 1100px) {\n      .trust { padding: 24px 24px 20px; }\n      .trust .yard-art { height: clamp(150px, 22vh, 170px); }\n    }\n    .trust::before { content: none; }\n    .brand { display: flex; align-items: center; gap: 12px; position: relative; z-index: 1; }\n    .brand-mark { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 14px; background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,.15); }\n    .brand-mark img { width: 34px; height: 34px; object-fit: contain; }\n    .brand strong { display: block; font-size: 18px; line-height: 1; letter-spacing: .07em; }\n    .brand small { display: block; margin-top: 6px; color: #bfeaff; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; }\n    .trust-copy { position: relative; z-index: 1; margin-top: 18px; }\n    .eyebrow { display: inline-flex; align-items: center; gap: 7px; margin-bottom: 9px; color: #0a75ad; font-size: 11px; line-height: 1; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; }\n    .eyebrow.light { color: #8cddff; }\n    .trust h1 { margin: 0; font-size: clamp(31px, 3.2vw, 47px); line-height: 1.02; letter-spacing: -.045em; }\n    .trust h1 em { color: #8cddff; font-style: normal; }\n    .trust-copy > p { margin: 11px 0 0; max-width: 390px; color: #d6f2ff; font-size: 14px; line-height: 1.45; }\n    .yard-art { display: block; width: 100%; height: clamp(184px, 24vh, 230px); margin: auto 0 12px; border: 1px solid rgba(255,255,255,.34); border-radius: 22px; object-fit: cover; object-position: center; box-shadow: 0 18px 34px rgba(0,0,0,.2); }\n    .trust-chips { position: relative; z-index: 1; display: grid; gap: 10px; margin-top: 12px; }\n    .review-chip { display: inline-flex; align-items: center; gap: 7px; width: max-content; max-width: 100%; min-height: 40px; padding: 8px 11px; border: 1px solid rgba(255,220,100,.68); border-radius: 14px; background: rgba(3,37,56,.3); color: #fff; text-decoration: none; }\n    .review-chip:hover { border-color: #f6d45a; background: rgba(3,37,56,.5); }\n    .review-chip:focus-visible { outline: 3px solid #f6d45a; outline-offset: 3px; }\n    .review-star-icon { width: 18px; height: 18px; }\n    .review-chip-copy { color: #fff; font-size: 11px; font-weight: 900; white-space: nowrap; }\n     .trust-benefits { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 14px; }\n     .trust-chip { min-width: 0; min-height: 22px; height: 22px; display: flex; align-items: center; gap: 7px; padding: 0; border: 0; border-radius: 0; background: transparent; color: #e7f7ff; font-size: 11px; font-weight: 800; line-height: 22px; }\n     .trust-benefits .trust-chip:last-child { grid-column: 1 / -1; }\n     .trust-benefit-icon { width: 22px; height: 22px; }\n    .trust-call { position: relative; z-index: 1; display: flex; align-items: center; gap: 6px; margin: 8px 0 0; color: #d6f2ff; font-size: 11px; }\n    .trust-call-icon { width: 16px; height: 16px; }\n    .trust-call a { color: #8cddff; font-weight: 900; }\n    .proof-grid { position: relative; z-index: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }\n    .proof { display: flex; gap: 8px; min-width: 0; padding: 8px; border: 1px solid rgba(255,255,255,.14); border-radius: 13px; background: rgba(3,37,56,.3); }\n    .proof-icon { flex: 0 0 26px; width: 26px; height: 26px; display: grid; place-items: center; border-radius: 9px; background: rgba(56,182,255,.22); }\n    .proof-icon-image { width: 21px; height: 21px; }\n    .proof strong, .proof small { display: block; }\n    .proof strong { font-size: 12px; line-height: 1.2; }\n    .proof small { margin-top: 3px; color: #bfe5f7; font-size: 10px; line-height: 1.25; }\n    .quote-side { min-width: 0; overflow-y: auto; padding: 30px 38px 38px; background: linear-gradient(180deg, #fff 0%, #f6fbfe 100%); }\n    .mobile-brand { display: none; }\n    .progress { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 4px 46px 28px 0; }\n    .progress-step { position: relative; display: grid; justify-items: center; gap: 6px; color: #8699a6; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }\n    .progress-step::after { content: \"\"; position: absolute; top: 14px; left: calc(50% + 17px); width: calc(100% - 26px); height: 2px; background: #dce9ef; }\n    .progress-step:last-child::after { display: none; }\n    .progress-dot { position: relative; z-index: 1; width: 29px; height: 29px; display: grid; place-items: center; border: 2px solid #d4e3eb; border-radius: 50%; background: #fff url(\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9ab16c73b042e1414df4e.webp\") center / cover no-repeat; color: #6f8592; opacity: .45; }\n    .progress-check-icon { width: 16px; height: 16px; }\n    .progress-step.current .progress-dot, .progress-step.complete .progress-dot { opacity: 1; }\n    .info-icon-number { flex: 0 0 28px; width: 28px; height: 28px; display: grid; place-items: center; padding: 0; border-radius: 10px; background: #0d617f url(\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9ab16c73b042e1414df4e.webp\") center / cover no-repeat; color: #fff; font-size: 13px; font-weight: 950; line-height: 1; }\n    .progress-step.current, .progress-step.complete { color: #075f91; }\n    .progress-step.current .progress-dot, .progress-step.complete .progress-dot { border-color: #38b6ff; background: #38b6ff; color: #04304a; }\n    .progress-step.complete::after { background: #38b6ff; }\n    .stage { outline: none; }\n    .stage-header { margin-bottom: 23px; }\n    .stage-header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }\n    .stage-header h2 { margin: 0; color: #073652; font-size: clamp(26px, 3vw, 38px); line-height: 1.08; letter-spacing: -.035em; }\n    .stage-header > p { max-width: 680px; margin: 11px 0 0; color: #5a7180; font-size: 14px; line-height: 1.55; }\n    .badge { flex: 0 0 auto; padding: 7px 10px; border-radius: 999px; background: #e5f6ff; color: #086e9f; font-size: 10px; font-weight: 900; letter-spacing: .05em; text-transform: uppercase; }\n    .field, .field-row { margin-top: 18px; }\n    .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }\n    label, .field-label { display: block; margin-bottom: 7px; color: #17384b; font-size: 13px; font-weight: 800; }\n    .input, .select, .textarea { width: 100%; border: 1px solid #c9dbe5; border-radius: 13px; background: #fff; color: #102f41; outline: none; transition: border .18s, box-shadow .18s; }\n    .input, .select { height: 49px; padding: 0 13px; }\n    .textarea { min-height: 110px; padding: 12px 13px; resize: vertical; }\n    .input:focus, .select:focus, .textarea:focus { border-color: #38b6ff; box-shadow: 0 0 0 4px rgba(56,182,255,.16); }\n    .field small { display: block; margin-top: 6px; color: #758b98; font-size: 11px; line-height: 1.4; }\n    .zip-wrap { display: grid; grid-template-columns: 1fr auto; gap: 10px; }\n    .choice-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; }\n    .choice { position: relative; min-height: 76px; padding: 14px 96px 13px 14px; border: 1px solid #cfdee6; border-radius: 15px; background: #fff; color: #17384b; text-align: left; cursor: pointer; transition: border .16s, background .16s, transform .16s, box-shadow .16s; }\n    .choice:hover:not(:disabled) { transform: none; border-color: #8ccce9; box-shadow: 0 8px 24px rgba(8,76,112,.08); }\n    .choice[aria-pressed=\"true\"] { border: 2px solid #087fb9; background: linear-gradient(135deg, #e7f7ff, #f8fdff); box-shadow: 0 0 0 3px rgba(56,182,255,.16), 0 10px 24px rgba(8,119,174,.12); }\n    .choice[aria-pressed=\"true\"]:hover:not(:disabled) { border-color: #087fb9; box-shadow: 0 0 0 3px rgba(56,182,255,.2), 0 12px 28px rgba(8,119,174,.16); }\n    .choice:disabled { border-style: dashed; border-color: #cdd9df; background: #f2f6f8; color: #82949e; cursor: not-allowed; box-shadow: none; }\n    .choice:disabled small { color: #82949e; }\n    .choice:disabled .choice-check { border-color: #c7d3d9; background: #e7eef1; color: #82949e; }\n    .custom-choice { grid-column: 1 / -1; min-height: 64px; }\n    .custom-choice:not([aria-pressed=\"true\"]) { border-style: dashed; border-color: #cbd7dd; background: #f7f9fa; color: #536b78; box-shadow: none; }\n    .choice strong, .choice small { display: block; }\n    .choice strong { font-size: 14px; }\n    .choice small { margin-top: 5px; color: #718692; font-size: 11px; line-height: 1.35; }\n    .choice-check { position: absolute; top: 12px; right: 12px; width: 24px; min-width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 0; border: 2px solid #b7ceda; border-radius: 50%; color: transparent; background: #fff; font-size: 9px; font-weight: 950; line-height: 1; white-space: nowrap; }\n    .choice-check-icon { width: 14px; height: 14px; }\n    .choice[aria-pressed=\"true\"] .choice-check { width: auto; padding: 0 8px; border-color: #0873a8; border-radius: 999px; background: #087fb9; color: #fff; box-shadow: 0 4px 10px rgba(8,99,146,.22); letter-spacing: .02em; text-transform: uppercase; }\n    .popular { display: inline-flex; align-items: center; gap: 5px; margin-bottom: 7px; padding: 4px 8px; border: 1px solid #edc54a; border-radius: 999px; background: #fff3bd; color: #624800; font-size: 9px; font-weight: 950; letter-spacing: .07em; }\n    .popular-star-icon { width: 13px; height: 13px; }\n    .price-preview { display: flex; align-items: center; justify-content: space-between; gap: 15px; margin-top: 20px; padding: 14px 16px; border-radius: 14px; background: #073652; color: #d8f2ff; }\n    .price-preview span { font-size: 12px; font-weight: 800; }\n    .price-preview strong { color: #8bdcff; font-size: 17px; }\n    .price-hero { padding: 21px; border: 1px solid #c7e8f8; border-radius: 19px; background: linear-gradient(135deg, #e9f8ff, #f9fdff); }\n    .price-label { color: #4e6c7d; font-size: 12px; font-weight: 850; text-transform: uppercase; letter-spacing: .06em; }\n    .price { margin-top: 5px; color: #073652; font-size: clamp(38px, 5vw, 56px); font-weight: 950; line-height: 1; letter-spacing: -.055em; }\n    .price small { font-size: 14px; letter-spacing: 0; color: #4f6f80; }\n    .price-hero p { margin: 11px 0 0; color: #5c7583; font-size: 12px; line-height: 1.45; }\n    .line-items { margin-top: 12px; padding: 2px 15px; border: 1px solid #d9e7ee; border-radius: 14px; background: #fff; }\n    .line-item, .summary-row { display: flex; justify-content: space-between; gap: 14px; padding: 11px 0; border-bottom: 1px solid #edf3f6; font-size: 12px; }\n    .line-item:last-child, .summary-row:last-child { border-bottom: 0; }\n    .addon { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; margin-top: 14px; padding: 15px; border: 2px solid #bad9e8; border-radius: 16px; background: #fff; cursor: pointer; }\n    .addon:has(input:checked) { border-color: #38b6ff; background: #eaf8ff; }\n    .addon input, .check input { width: 21px; height: 21px; margin: 0; accent-color: #159edc; }\n    .addon strong, .addon small { display: block; }\n    .addon small { margin-top: 4px; color: #6e8491; font-size: 11px; line-height: 1.35; }\n    .addon-price { color: #0877ae; font-size: 12px; font-weight: 900; white-space: nowrap; }\n    .info-list { display: grid; gap: 8px; margin-top: 17px; }\n    .info-item { display: flex; align-items: flex-start; gap: 10px; color: #506c7b; font-size: 12px; line-height: 1.4; }\n    .info-icon { flex: 0 0 26px; width: 26px; height: 26px; padding: 4px; border-radius: 9px; background: #dff5ff; }\n    .notice { margin-top: 15px; padding: 13px 14px; border-left: 4px solid #38b6ff; border-radius: 10px; background: #eef9fe; color: #496875; font-size: 12px; line-height: 1.48; }\n\n    .coverage-result { display:flex; gap:16px; align-items:flex-start; margin:0 0 24px; padding:23px; border:2px solid #bd591c; border-radius:16px; background:#fff4e9; color:#6f2b0d; }\n    .coverage-result:focus { outline:3px solid #bd591c; outline-offset:4px; }\n    .coverage-mark { display:grid; place-items:center; flex:0 0 38px; width:38px; height:38px; padding:7px; border-radius:12px; background:#a94713; }\n    .coverage-mark-icon { width:24px; height:24px; }\n    .coverage-kicker { margin:0 0 8px; font-size:11px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }\n    .coverage-result h2 { margin:0 0 12px; color:#702909; font-size:clamp(27px,3vw,36px); line-height:1.12; letter-spacing:-.035em; }\n    .coverage-result p:last-child { margin:0; font-size:15px; line-height:1.6; color:#763f22; }\n    .input.coverage-input[aria-invalid=\"true\"] { border:2px solid #bd591c; background:#fffcf8; }\n    .coverage-contact { padding:18px 0 0; border-top:1px solid #d8e6ed; color:#496677; font-size:14px; line-height:1.6; }\n    .coverage-contact strong { color:#173e54; }\n    .coverage-contact p { margin:5px 0 0; }\n    @media(max-width:600px){ .coverage-result{padding:18px 15px;gap:11px;margin-bottom:20px}.coverage-mark{flex-basis:28px;height:28px;font-size:21px}.coverage-result h2{font-size:27px}.coverage-result p:last-child{font-size:14px} }\n\n    .notice.orange { border-left-color: #ed7d32; background: #fff5ed; }\n    .offer-summary{margin:16px 0;padding:13px 15px;border:1px solid #b7d6c3;border-left:3px solid #267547;border-radius:10px;background:#f2faf5;color:#215e3b;font-size:13px;line-height:1.5;text-align:left}\n    .offer-summary strong{font-size:14px}.offer-summary p{margin:5px 0}.offer-scope{font-size:12px;color:#415f4d}\n    .offer-costs{margin:12px 0}.offer-costs div{display:flex;justify-content:space-between;gap:14px;padding:7px 0;border-bottom:1px solid #d3e5d9}.offer-costs dd{margin:0;font-weight:800;text-align:right}\n    .offer-summary .offer-savings{font-weight:750;color:#215e3b}.offer-costs .first-visit{align-items:center;color:#073652;font-weight:800}.offer-costs .first-visit dd{font-size:24px;white-space:nowrap}\n    .offer-summary .promotion-link{min-height:44px;font-size:12px}\n    .field-error{color:#a62828;font-size:13px;margin:6px 0 12px}[aria-invalid=\"true\"]{border:2px solid #b52e2e!important}\n    .error-jump{background:transparent;border:0;color:inherit;text-decoration:underline;text-align:left;padding:6px 0;cursor:pointer}\n    .field small,.help{color:#526b79}.choice small{color:#526b79}\n    button:focus-visible,summary:focus-visible,a:focus-visible{outline:3px solid #096b9d;outline-offset:3px}\n    .input,.select,.textarea{scroll-margin-top:60px;scroll-margin-bottom:24px}\n    .plan-footer{background:#fff;padding-top:1px}.plan-footer .error:not(.show){display:none}\n    @media(max-width:620px){\n      .input,.select,.textarea{font-size:16px}.promotion-link,.error-jump{min-height:44px}\n      .plan-footer{position:sticky;bottom:-38px;z-index:2;margin:16px -18px -38px;padding:10px 18px calc(12px + env(safe-area-inset-bottom));border-top:1px solid #c9dbe5;box-shadow:0 -5px 15px rgba(7,54,82,.06)}\n      .plan-footer .price-preview{margin:0;padding:5px 0;background:#fff;color:#17384b}.plan-footer .price-preview strong{color:#075f91}\n      .plan-footer .actions{margin:5px 0 0;flex-wrap:nowrap}.plan-footer .actions .btn.link{order:0;flex:0 0 auto;width:auto;font-size:13px;padding:10px}.plan-footer .actions .btn.primary{flex:1;font-size:15px}\n      .plan-footer:has(.error.show){position:static;margin-bottom:0}.plan-footer .error{max-height:none}\n      .choice{min-height:72px}.offer-summary{padding:11px 12px}.stage-header{margin-bottom:18px}\n    }\n    .promotion { position: relative; margin: 0 0 20px; padding: 18px 17px 15px; border: 2px dashed #159447; border-radius: 15px; background: #effbf3; color: #26633d; }\n    .promotion-badge { display: inline-flex; margin: -31px 0 8px -7px; padding: 5px 9px; border-radius: 999px; background: #117b3b; color: #fff; font-size: 9px; font-weight: 950; letter-spacing: .05em; text-transform: uppercase; }\n    .promotion h3 { margin: 0; color: #126a35; font-size: 15px; line-height: 1.25; }\n    .promotion p { margin: 6px 0 0; color: #34734a; font-size: 11px; line-height: 1.45; }\n    .promotion-limit { display: flex; width: fit-content; max-width: 100%; margin-top: 10px; padding: 6px 9px; border: 1px solid #a9d8b9; border-radius: 999px; background: #fff; color: #0d612d; font-size: 10px; line-height: 1.3; font-weight: 950; }\n    .promotion-link { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 44px; margin-top: 10px; padding: 9px 13px; border: 1px solid #84c9e8; border-radius: 10px; background: #f2fbff; color: #075f91; font-size: 12px; font-weight: 900; line-height: 1.2; cursor: pointer; text-decoration: none; transition: background .16s, border-color .16s, box-shadow .16s, transform .16s; }\n    .promotion-link-icon { width: 26px; height: 26px; }\n    .promotion-link:hover { border-color: #0877b9; background: #e2f5ff; box-shadow: 0 4px 12px rgba(8,119,185,.16); transform: translateY(-1px); }\n    .promotion-link:focus-visible { outline: 3px solid #38b6ff; outline-offset: 3px; }\n    .offer-layer[hidden] { display: none; }\n    .offer-layer { position: absolute; z-index: 12; inset: 0; display: grid; place-items: center; padding: 24px; background: rgba(2,20,32,.72); backdrop-filter: blur(5px); }\n    .offer-dialog { width: min(520px, 100%); max-height: calc(100% - 20px); overflow-y: auto; padding: 24px; border: 2px solid #38b6ff; border-radius: 22px; background: #fff; box-shadow: 0 30px 80px rgba(0,20,35,.35); }\n    .offer-dialog-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 15px; }\n    .offer-dialog h2 { margin: 0; color: #073652; font-size: 24px; line-height: 1.12; }\n    .offer-dialog p { color: #4f6876; font-size: 13px; line-height: 1.55; }\n    .offer-close { flex: 0 0 auto; width: 34px; height: 34px; border: 1px solid #cbdde6; border-radius: 50%; background: #fff; color: #17384b; cursor: pointer; }\n    .offer-table { margin-top: 14px; padding: 4px 14px; border: 1px solid #d9e7ee; border-radius: 14px; background: #f8fbfd; }\n    .offer-row { display: flex; justify-content: space-between; gap: 16px; padding: 11px 0; border-bottom: 1px solid #e4edf2; color: #516c7a; font-size: 12px; }\n    .offer-row:last-child { border-bottom: 0; }\n    .offer-row strong { color: #17394b; text-align: right; }\n    .offer-row.savings { color: #126a35; font-weight: 900; }\n    .offer-row.savings strong { color: #159447; font-size: 20px; }\n    .offer-disclaimer { margin-bottom: 0 !important; color: #708691 !important; font-size: 10px !important; }\n    .radio-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }\n    .radio-card { margin: 0; }\n    .radio-card input { position: absolute; opacity: 0; pointer-events: none; }\n    .radio-card span { min-height: 46px; display: grid; place-items: center; padding: 8px; border: 1px solid #cbdde6; border-radius: 12px; background: #fff; color: #385767; cursor: pointer; }\n    .radio-card input:checked + span { border-color: #209fd7; background: #e8f7ff; color: #075c86; box-shadow: inset 0 0 0 1px #38b6ff; }\n    .radio-card input:focus-visible + span { outline: 3px solid #096b9d; outline-offset: 3px; }\n    .check { display: grid; grid-template-columns: auto 1fr; align-items: flex-start; gap: 11px; margin-top: 17px; padding: 14px; border: 1px solid #cbdce5; border-radius: 14px; background: #fff; color: #496675; font-size: 12px; font-weight: 500; line-height: 1.5; }\n    .check strong { color: #173a4c; }\n    .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }\n    .summary-card { padding: 16px; border: 1px solid #d7e5ec; border-radius: 16px; background: #fff; }\n    .summary-card h3 { margin: 0 0 4px; color: #073652; font-size: 14px; }\n    .price-plan { margin: 16px 0; }\n    .price-plan-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 12px; align-items: stretch; }\n    .price-plan-grid > * { min-width: 0; }\n    .price-plan-grid .price-hero { padding: 18px; }\n    .price-plan-grid .price { font-size: clamp(36px, 4vw, 48px); }\n    .price-plan-grid .price small { display: block; margin-top: 8px; }\n    .price-plan-grid .price-plan { margin: 0; padding: 14px; }\n    .price-plan-grid .summary-row { padding: 9px 0; gap: 8px; }\n    .price-plan-grid .summary-row > span { flex: 0 0 62px; font-size: 11px; }\n    @media (max-width: 620px) { .price-plan-grid { grid-template-columns: 1fr; } }\n    .summary-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }\n    .summary-heading h3 { margin: 0; }\n    .summary-edit { min-height: 44px; padding: 7px 10px; border: 1px solid #c9e0ed; border-radius: 9px; background: #f3faff; color: #075f91; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; flex-shrink: 0; }\n    .summary-edit:hover { background: #e5f4fc; }\n    .summary-edit:focus-visible { outline: 3px solid #0877b9; outline-offset: 2px; }\n    .summary-edit:disabled { opacity: .55; cursor: default; }\n    .summary-row strong { min-width: 0; overflow-wrap: anywhere; }\n    .summary-row span { color: #667e8c; }\n    .summary-row strong { text-align: right; color: #17394b; }\n    .error { display: none; margin-top: 16px; padding: 12px 14px; border: 1px solid #f0afa7; border-radius: 12px; background: #fff1ef; color: #9c2f22; font-size: 12px; line-height: 1.45; }\n    .error.show { display: block; }\n    .error ul { margin: 6px 0 0 18px; padding: 0; }\n    .actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 9px; margin-top: 22px; }\n    .btn { min-height: 46px; display: inline-flex; align-items: center; justify-content: center; padding: 0 17px; border: 1px solid #bcd1dc; border-radius: 12px; background: #fff; color: #224b60; font-weight: 850; font-size: 12px; text-decoration: none; cursor: pointer; }\n    .btn:hover:not(:disabled) { transform: none; }\n    .btn.primary { border-color: #ed7d32; background: #ed7d32; color: #fff; box-shadow: 0 9px 24px rgba(237,125,50,.24); }\n    .btn.blue { border-color: #159edc; background: #159edc; color: #fff; }\n    .btn.link { margin-right: auto; border-color: transparent; background: transparent; color: #477084; }\n    .btn:disabled { opacity: .55; cursor: wait; }\n    .stage > .complete { text-align: center; padding-top: 20px; }\n    .success-mark { width: 68px; height: 68px; display: grid; place-items: center; margin: 0 auto 15px; border-radius: 50%; background: #38b6ff; box-shadow: 0 14px 36px rgba(56,182,255,.28); }\n    .success-mark-icon { width: 34px; height: 34px; }\n    .complete .stage-header > p { margin-left: auto; margin-right: auto; }\n    .complete .summary-card { max-width: 540px; margin: 17px auto 0; text-align: left; }\n    .request-id { margin: 13px 0 0; color: #77909e; font-size: 10px; text-align: center; overflow-wrap: anywhere; }\n    .help { color: #526b79; font-size: 11px; line-height: 1.45; }\n    .check .field-error { grid-column: 2; margin: 0; }\n    .spinner { width: 16px; height: 16px; margin-right: 8px; border: 2px solid rgba(255,255,255,.45); border-top-color: #fff; border-radius: 50%; animation: spin .8s linear infinite; }\n    @keyframes spin { to { transform: rotate(360deg); } }\n    /* Keep the Plan estimate and next action in the desktop form pane. */\n    @media (min-width: 901px) {\n      .plan-footer { position: sticky; bottom: -38px; z-index: 2; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; margin: 18px -38px -38px; padding: 12px 20px; border-top: 1px solid #c9dbe5; background: #fff; box-shadow: 0 -5px 15px rgba(7,54,82,.06); }\n      .plan-footer .price-preview { display: grid; gap: 3px; margin: 0; padding: 0; background: #fff; color: #17384b; }\n      .plan-footer .price-preview strong { color: #075f91; font-size: 17px; }\n      .plan-footer .actions { margin: 0; gap: 8px; flex-wrap: nowrap; }\n      .plan-footer .actions .btn { min-height: 44px; padding: 10px 13px; font-size: 14px; }\n      .plan-footer .error { grid-column: 1 / -1; }\n      .plan-footer:has(.error.show) { position: static; margin-bottom: 0; }\n    }\n    @media (max-width: 900px) {\n      .backdrop { padding: 0; background: #f5fbfe; }\n      .modal { width: 100%; height: 100dvh; min-height: 0; grid-template-columns: 1fr; border: 0; border-radius: 0; }\n      .trust { display: none; }\n      .quote-side { padding: 20px 18px 38px; }\n      .mobile-brand { display: flex; align-items: center; gap: 10px; margin: 0 50px 19px 0; color: #073652; }\n      .mobile-brand .brand-mark { width: 40px; height: 40px; background: #e5f7ff; box-shadow: none; }\n      .mobile-brand strong, .mobile-brand small { display: block; }\n      .mobile-brand strong { font-size: 15px; letter-spacing: .06em; }\n      .mobile-brand small { margin-top: 3px; color: #6b8492; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; }\n      .progress { margin: 0 42px 24px 0; }\n      .progress-label { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }\n      .close { top: 13px; right: 13px; }\n      .offer-layer { position: fixed; }\n    }\n    @media (max-width: 620px) {\n      .stage-header-row { display: block; }\n      .badge { display: inline-flex; margin-top: 10px; }\n      .field-row, .summary { grid-template-columns: 1fr; }\n      .choice-grid { grid-template-columns: 1fr; }\n      .radio-grid { grid-template-columns: 1fr; }\n      .zip-wrap { grid-template-columns: 1fr; }\n      .zip-wrap .btn { width: 100%; }\n      .addon { grid-template-columns: auto 1fr; }\n      .addon-price { grid-column: 2; }\n      .actions { align-items: stretch; }\n      .actions .btn:not(.link) { flex: 1 1 100%; }\n      .actions .btn.primary { order: -1; }\n      .btn.link { order: 4; width: 100%; margin: 2px 0 0; }\n    }\n    /* SEL-08: retain reachable content on short desktop viewports and clear focus. */\n    .close, .offer-close { min-width: 44px; min-height: 44px; }\n    .close:focus-visible, .offer-close:focus-visible { outline: 3px solid #096b9d; outline-offset: 3px; }\n    .quote-side, .offer-dialog { overscroll-behavior: contain; scroll-padding-block: 18px 100px; }\n    [data-resume-notice]:focus-visible, #pp-save-plan-status:focus-visible { outline: 3px solid #096b9d; outline-offset: 3px; }\n    @media (min-width: 901px) and (max-height: 700px) {\n      .modal { min-height: 0; height: calc(100vh - 48px); height: calc(100dvh - 48px); }\n      .trust { overflow-y: auto; scroll-padding-block: 18px; }\n    }\n    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation-duration: .01ms !important; } }\n\n\n    /* 2026-09-20 isolated rebuild: focused quote workspace. */\n    .backdrop { padding: 18px; background: rgba(2, 28, 44, .72); }\n    .modal { width: min(1380px, 100%); height: min(900px, calc(100dvh - 36px)); min-height: 640px; display: block; border-radius: 24px; background: #f8fcff; }\n    .trust { display: none !important; }\n    .quote-side { height: 100%; overflow-y: auto; scroll-padding-top: 176px; padding: 0 42px 42px; background: linear-gradient(180deg, #fff 0, #f8fcff 100%); }\n    .quote-topbar { position: sticky; top: 0; z-index: 4; min-height: 82px; display: grid; grid-template-columns: minmax(220px, 1fr) auto minmax(300px, 1fr); align-items: center; gap: 22px; margin: 0 -42px 24px; padding: 12px 78px 12px 42px; border-bottom: 1px solid #d8e7ef; background: rgba(255,255,255,.97); box-shadow: 0 8px 22px rgba(7,54,82,.04); }\n    .quote-topbar .mobile-brand { display: flex; align-items: center; gap: 10px; margin: 0; color: #062644; }\n    .quote-topbar .mobile-brand .brand-mark { width: 46px; height: 46px; background: #e8f8ff; box-shadow: none; }\n    .quote-topbar .mobile-brand strong, .quote-topbar .mobile-brand small { display: block; }\n    .quote-topbar .mobile-brand strong { font-size: 17px; letter-spacing: .07em; }\n    .quote-topbar .mobile-brand small { margin-top: 4px; color: #6b8492; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; }\n    .quote-topbar-title { margin: 0; color: #425f75; font-size: 16px; font-weight: 850; text-align: center; }\n    .quote-topbar-actions { display: flex; align-items: center; justify-content: flex-end; gap: 16px; min-width: 0; }\n    .top-review, .top-help { display: inline-flex; align-items: center; gap: 7px; color: #075f91; font-size: 12px; font-weight: 800; text-decoration: none; }\n    .top-review:hover, .top-help:hover { text-decoration: underline; }\n    .top-review:focus-visible, .top-help:focus-visible { outline: 3px solid #18aef5; outline-offset: 4px; border-radius: 5px; }\n    .top-review img, .top-help img { width: 22px; height: 22px; }\n    .progress { width: min(690px, calc(100% - 80px)); margin: 0 auto 24px; }\n    .progress-label { font-size: 11px; }\n    .stage { width: min(1120px, 100%); margin: 0 auto; scroll-margin-top: 176px; }\n    .stage-header { position: relative; min-height: 104px; margin-bottom: 20px; padding-right: 118px; }\n    .stage-header h2 { font-size: clamp(32px, 4vw, 50px); }\n    .stage-illustration { position: absolute; top: 0; right: 0; width: 94px; height: 94px; display: grid; place-items: center; border: 1px solid #bfe4f5; border-radius: 26px; background: linear-gradient(145deg, #e7f8ff, #fff); box-shadow: 0 14px 30px rgba(7,54,82,.1); }\n    .stage-illustration img { width: 72px; height: 72px; object-fit: contain; }\n    .stage-illustration .badge { position: absolute; right: 0; bottom: -9px; max-width: 148px; white-space: nowrap; box-shadow: 0 5px 14px rgba(7,54,82,.08); }\n    .plan-layout { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(330px, .85fr); gap: 28px; align-items: start; }\n    .plan-builder { min-width: 0; padding: 24px; border: 1px solid #d7e6ee; border-radius: 20px; background: #fff; box-shadow: 0 16px 36px rgba(7,54,82,.06); }\n    .plan-builder .field:first-child { margin-top: 0; }\n    .plan-builder .choice { min-height: 104px; }\n    .dog-choice-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }\n    .dog-choice { position: relative; min-height: 106px; display: grid; place-items: center; align-content: center; gap: 4px; padding: 10px 8px; border: 1px solid #c9dce7; border-radius: 15px; background: #fff; color: #17384b; cursor: pointer; }\n    .dog-choice:hover { border-color: #7fc8e8; box-shadow: 0 8px 22px rgba(8,76,112,.08); }\n    .dog-choice[aria-pressed=\"true\"] { border: 2px solid #087fb9; background: linear-gradient(145deg, #dff5ff, #fff); box-shadow: 0 0 0 3px rgba(56,182,255,.16); }\n    .dog-choice-art { width: 56px; height: 56px; object-fit: contain; }\n    .dog-choice strong { font-size: 13px; }\n    .dog-selected-marker { position: absolute; top: 7px; right: 7px; width: 25px; height: 25px; display: none; place-items: center; border-radius: 50%; background: #18aef5; box-shadow: 0 4px 10px rgba(6,38,68,.2); }\n    .dog-choice[aria-pressed=\"true\"] .dog-selected-marker { display: grid; }\n    .dog-selected-marker img { width: 16px; height: 16px; object-fit: contain; }\n    .more-dogs { margin-top: 10px; }\n    .more-dogs summary { width: fit-content; min-height: 44px; display: flex; align-items: center; gap: 8px; padding: 0 14px; border: 1px solid #9dcfe7; border-radius: 14px; background: #fff; color: #062644; font-size: 13px; font-weight: 850; cursor: pointer; }\n    .more-dogs summary::marker { color: #18aef5; }\n    .more-dogs[open] summary { margin-bottom: 10px; background: #eaf8ff; border-color: #18aef5; }\n    .dog-choice-grid-more { grid-template-columns: repeat(3, minmax(0, 1fr)); }\n    .choice { padding-left: 84px; }\n    .choice-art { position: absolute; top: 50%; left: 15px; width: 52px; height: 52px; object-fit: contain; transform: translateY(-50%); }\n    .custom-choice .choice-art { width: 48px; height: 48px; }\n    .dog-choice .dog-choice-art, .choice[data-frequency] .choice-art, .choice[data-area] .choice-art { mix-blend-mode: multiply; }\n    .plan-rail { position: sticky; top: 106px; min-width: 0; overflow: hidden; border: 1px solid #cfe1eb; border-radius: 22px; background: #fff; box-shadow: 0 20px 48px rgba(7,54,82,.12); }\n    .plan-rail-head { padding: 20px 22px; background: linear-gradient(135deg, #062644, #075f91); color: #fff; }\n    .plan-rail-head span { display: block; color: #bfeaff; font-size: 11px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }\n    .plan-rail-head strong { display: block; margin-top: 6px; font-size: 28px; line-height: 1.05; }\n    .plan-rail-body { padding: 22px; }\n    .plan-rail-price { padding-bottom: 18px; border-bottom: 1px solid #d9e7ee; }\n    .plan-rail-price strong { display: block; color: #062644; font-size: clamp(38px, 4.5vw, 58px); line-height: 1; letter-spacing: -.045em; }\n    .plan-rail-price strong small { color: #587487; font-size: 17px; letter-spacing: 0; }\n    .plan-rail-price span { display: block; margin-top: 7px; color: #5c7483; font-size: 12px; }\n    .plan-rail-list { display: grid; gap: 9px; padding: 18px 0; }\n    .plan-rail-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; color: #617987; font-size: 12px; }\n    .plan-rail-row strong { max-width: 62%; color: #17394b; text-align: right; }\n    .plan-rail .offer-summary { margin: 0; padding: 16px; border-radius: 15px; }\n    .plan-rail .offer-summary p { margin: 6px 0 0; font-size: 11px; }\n    .plan-rail .offer-scope { display: none; }\n    .plan-rail .promotion-link { margin-top: 10px; }\n    .plan-rail-benefits { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 16px 0; }\n    .plan-rail-benefit { display: flex; align-items: center; gap: 7px; color: #31566b; font-size: 11px; font-weight: 800; }\n    .plan-rail-benefit img { width: 24px; height: 24px; }\n    .btn { border-radius: 14px; }\n    .btn.primary, .btn.blue { border-color: #18aef5; background: #18aef5; color: #062644; box-shadow: 0 9px 24px rgba(24,174,245,.24); }\n    .btn:not(.primary):not(.blue):not(.link), .promotion-link, .summary-edit { border-color: #9dcfe7; border-radius: 14px; background: #fff; color: #062644; }\n    .btn.link { color: #075f91; }\n    .plan-rail .btn.primary { width: 100%; min-height: 54px; background: #18aef5; border-color: #18aef5; font-size: 15px; }\n    .offer-summary { position: relative; min-height: 102px; padding-left: 92px !important; overflow: hidden; }\n    .offer-summary::before { content: \"\"; position: absolute; left: 16px; top: 17px; width: 62px; height: 62px; background: url(\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a215bc55ee8d569af0b0.webp\") center / contain no-repeat; }\n    .plan-rail .offer-summary { padding-left: 76px !important; }\n    .plan-rail .offer-summary::before { left: 12px; width: 52px; height: 52px; }\n    .plan-error { width: min(720px, 100%); }\n    .plan-footer { display: none; }\n    .price-plan-grid { grid-template-columns: minmax(0, 1.35fr) minmax(300px, .65fr); gap: 18px; }\n    .price-plan-grid .price-hero { display: flex; flex-direction: column; justify-content: center; min-height: 250px; padding: 28px; border-radius: 20px; }\n    .price-plan-grid .price { font-size: clamp(54px, 7vw, 78px); }\n    .price-hero-top { display: flex; align-items: center; gap: 16px; }\n    .price-hero-art { width: 72px; height: 72px; flex: 0 0 72px; object-fit: contain; }\n    .coverage-result { margin: 34px auto 26px; padding: 30px; border-width: 3px; box-shadow: 0 18px 40px rgba(169,71,19,.12); }\n    .coverage-mark { flex: 0 0 92px; width: 92px; height: 92px; border: 1px solid #e2a47d; border-radius: 28px; background: #fff; }\n    .coverage-mark-icon { width: 68px; height: 68px; }\n    .coverage-result h2 { font-size: clamp(34px, 5vw, 52px); }\n    .stage:has(.coverage-result) { max-width: 780px; }\n    @media (max-width: 1100px) {\n      .quote-topbar { grid-template-columns: 1fr auto; }\n      .quote-topbar-title { display: none; }\n      .top-review { display: none; }\n      .plan-layout { grid-template-columns: minmax(0, 1.35fr) minmax(300px, .65fr); gap: 20px; }\n    }\n    @media (min-width: 901px) and (max-height: 700px) {\n      .plan-footer { position: sticky; bottom: 0; z-index: 5; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; margin: 18px -42px 0; padding: 11px 42px 12px; border-top: 1px solid #c9dbe5; background: rgba(255,255,255,.98); box-shadow: 0 -8px 24px rgba(7,54,82,.11); }\n      .plan-footer .price-preview { display: grid; gap: 2px; margin: 0; padding: 0; background: transparent; color: #17384b; }\n      .plan-footer .price-preview strong { color: #075f91; }\n      .plan-footer .actions { margin: 0; flex-wrap: nowrap; }\n      .plan-footer .actions .btn { min-height: 46px; }\n    }\n    @media (max-width: 900px) {\n      .backdrop { padding: 0; }\n      .modal { width: 100%; height: 100dvh; min-height: 0; border-radius: 0; }\n      .quote-side { scroll-padding-top: 148px; padding: 0 18px 38px; }\n      .quote-topbar { min-height: 70px; grid-template-columns: 1fr; margin: 0 -18px 18px; padding: 10px 64px 10px 18px; }\n      .quote-topbar .mobile-brand { margin: 0; }\n      .quote-topbar-actions { display: none; }\n      .close { top: 12px; right: 12px; }\n      .progress { width: 100%; margin: 0 0 22px; }\n      .stage { scroll-margin-top: 148px; }\n      .progress-label { position: static; width: auto; height: auto; margin: 0; overflow: visible; clip-path: none; white-space: normal; font-size: 9px; }\n      .stage-header h2 { font-size: clamp(31px, 9vw, 44px); }\n      .stage-header { min-height: 82px; padding-right: 88px; }\n      .stage-illustration { width: 72px; height: 72px; border-radius: 20px; }\n      .stage-illustration img { width: 54px; height: 54px; }\n      .stage-illustration .badge { display: none; }\n      .plan-layout { display: block; }\n      .plan-builder { padding: 0; border: 0; background: transparent; box-shadow: none; }\n      .plan-rail { display: none; }\n      .plan-error { width: 100%; }\n      .plan-footer { position: sticky; bottom: -38px; z-index: 3; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 9px; margin: 18px -18px -38px; padding: 10px 18px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid #c9dbe5; background: #fff; box-shadow: 0 -8px 24px rgba(7,54,82,.11); }\n      .plan-footer .price-preview { margin: 0; padding: 0; background: #fff; }\n      .plan-footer .price-preview strong { font-size: 17px; }\n      .plan-footer .actions { margin: 0; flex-wrap: nowrap; }\n      .plan-footer .actions .btn.link { display: none; }\n      .plan-footer .actions .btn.primary { min-height: 48px; padding-inline: 16px; }\n      .price-plan-grid { grid-template-columns: 1fr; }\n      .price-plan-grid .price-hero { min-height: 0; }\n      .stage:has(.price-plan) { padding-bottom: 86px; }\n      .stage:has(.price-plan) > .actions { position: fixed; z-index: 4; right: 0; bottom: 0; left: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; margin: 0; padding: 10px 18px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid #c9dbe5; background: #fff; box-shadow: 0 -8px 24px rgba(7,54,82,.11); }\n      .stage:has(.price-plan) > .actions .btn:not(.primary):not(.link) { display: none; }\n      .stage:has(.price-plan) > .actions .btn.link { order: 0; width: auto; margin: 0; padding-inline: 8px; }\n      .stage:has(.price-plan) > .actions .btn.primary { order: 1; width: 100%; min-height: 48px; }\n    }\n    @media (max-width: 620px) {\n      .dog-choice-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }\n      .dog-choice-grid-more { grid-template-columns: repeat(3, minmax(0, 1fr)); }\n      .dog-choice { min-height: 90px; padding: 8px 4px; }\n      .dog-choice-art { width: 48px; height: 48px; }\n      .plan-builder .choice-grid { grid-template-columns: 1fr 1fr; }\n      .plan-builder .choice { min-height: 106px; padding: 38px 10px 12px 66px; }\n      .choice-art { left: 10px; width: 44px; height: 44px; }\n      .plan-builder .choice small { font-size: 9px; }\n      .plan-builder .choice .popular { position: absolute; top: 6px; left: 10px; max-width: calc(100% - 44px); margin: 0; padding: 3px 5px; gap: 4px; font-size: 8px; letter-spacing: .04em; white-space: nowrap; }\n      .plan-builder .choice .popular-star-icon { width: 12px; height: 12px; }\n      .plan-builder .choice .choice-check { top: 8px; right: 8px; }\n      @media (max-width: 360px) {\n        .plan-builder .field:has(> .choice-grid > [data-frequency]) .choice-grid { grid-template-columns: 1fr; }\n      }\n      .plan-builder .choice[aria-pressed=\"true\"] .choice-check { width: 26px; min-width: 26px; padding: 0; }\n      .plan-builder .choice-check span { display: none; }\n      .coverage-result { padding: 22px 17px; }\n      .coverage-mark { flex-basis: 72px; width: 72px; height: 72px; }\n      .coverage-mark-icon { width: 52px; height: 52px; }\n      .coverage-result h2 { font-size: 32px; }\n    }\n  `;\n\n\n  // SEL-08: isolate active dialogs, preserve original page state, and contain focus.\n  let quoteInertRecords = new Map();\n  let offerInertRecords = new Map();\n  let quoteBodyObserver = null;\n  let redirectingQuoteFocus = false;\n\n  function inertQuoteElement(element, records) {\n    if (!element || records.has(element)) return;\n    records.set(element, element.getAttribute(\"inert\"));\n    element.setAttribute(\"inert\", \"\");\n  }\n  function restoreQuoteInert(records) {\n    records.forEach(function (value, element) {\n      if (value === null) element.removeAttribute(\"inert\");\n      else element.setAttribute(\"inert\", value);\n    });\n    records.clear();\n  }\n  function quoteTabStops(root) {\n    const candidates = Array.from(root.querySelectorAll('a[href], summary, button, input, select, textarea, [tabindex]'))\n      .filter(function (element) {\n        return element.tabIndex >= 0 && !element.disabled && !element.closest('[inert], [hidden]') &&\n          element.getClientRects().length > 0 && getComputedStyle(element).visibility !== \"hidden\";\n      });\n    // Native radio groups contribute only the selected radio (or the first one).\n    return candidates.filter(function (element) {\n      if (element.type !== \"radio\" || !element.name) return true;\n      const group = candidates.filter(function (other) { return other.type === \"radio\" && other.name === element.name && other.form === element.form; });\n      return element === (group.find(function (other) { return other.checked; }) || group[0]);\n    });\n  }\n  function quoteFocusRoot() {\n    return shadow && (shadow.querySelector('[data-offer-layer]:not([hidden])') || shadow);\n  }\n  function focusQuoteStage() {\n    if (!stageElement) return;\n    const target = stageElement.querySelector(\"#pp-coverage-result\") || stageElement;\n    target.focus({ preventScroll: true });\n  }\n  function containQuoteFocus(event) {\n    if (!host || !shadow || redirectingQuoteFocus) return;\n    const root = quoteFocusRoot();\n    const active = shadow.activeElement;\n    const path = event.composedPath ? event.composedPath() : [];\n    if ((event.target === host || path.indexOf(host) >= 0) && active && root.contains(active)) return;\n    redirectingQuoteFocus = true;\n    try {\n      const target = root === shadow ? stageElement : quoteTabStops(root)[0];\n      if (target) target.focus({ preventScroll: true });\n    } finally { redirectingQuoteFocus = false; }\n  }\n  function isolateQuotePage() {\n    Array.from(document.body.children).forEach(function (element) {\n      if (element !== host) inertQuoteElement(element, quoteInertRecords);\n    });\n    if (typeof MutationObserver === \"function\") {\n      quoteBodyObserver = new MutationObserver(function () {\n        if (!host) return;\n        Array.from(document.body.children).forEach(function (element) {\n          if (element !== host) inertQuoteElement(element, quoteInertRecords);\n        });\n      });\n      quoteBodyObserver.observe(document.body, { childList: true });\n    }\n    document.addEventListener(\"focusin\", containQuoteFocus, true);\n  }\n  function releaseQuotePage() {\n    if (quoteBodyObserver) quoteBodyObserver.disconnect();\n    quoteBodyObserver = null;\n    document.removeEventListener(\"focusin\", containQuoteFocus, true);\n    restoreQuoteInert(offerInertRecords);\n    restoreQuoteInert(quoteInertRecords);\n    offerPreviousFocus = null;\n  }\n  function isolateQuoteOffer(layer) {\n    const modal = shadow && shadow.querySelector(\".modal\");\n    if (!modal) return;\n    Array.from(modal.children).forEach(function (element) {\n      if (element !== layer) inertQuoteElement(element, offerInertRecords);\n    });\n  }\n  function returnQuoteFocus() {\n    let target = previousFocus;\n    previousFocus = null;\n    if (!target || !target.isConnected || target === document.body || target.disabled || target.closest('[inert], [hidden]') || !target.getClientRects().length) {\n      target = Array.from(document.querySelectorAll('[data-purge-quote], a[href=\"#quote\"], a[href=\"#get-quote\"]'))\n        .find(function (element) { return !element.disabled && !element.closest('[inert], [hidden]') && element.getClientRects().length; });\n    }\n    if (target && typeof target.focus === \"function\") { target.focus({ preventScroll: true }); return; }\n    // Auto-open can have no trigger. Restore a neutral page focus without adding a tab stop.\n    const bodyTabIndex = document.body.getAttribute(\"tabindex\");\n    document.body.setAttribute(\"tabindex\", \"-1\");\n    document.body.focus({ preventScroll: true });\n    if (bodyTabIndex === null) document.body.removeAttribute(\"tabindex\");\n    else document.body.setAttribute(\"tabindex\", bodyTabIndex);\n  }\n  function trapQuoteTab(event) {\n    const root = quoteFocusRoot();\n    if (!root) return;\n    const stops = quoteTabStops(root);\n    if (!stops.length) { event.preventDefault(); focusQuoteStage(); return; }\n    const active = shadow.activeElement;\n    const first = stops[0], last = stops[stops.length - 1];\n    if (stops.indexOf(active) < 0) {\n      // Step/status containers are focusable but deliberately not tab stops.\n      // Continue in DOM order rather than dropping focus onto the page behind us.\n      const ordered = event.shiftKey ? stops.slice().reverse() : stops;\n      const direction = event.shiftKey ? 2 : 4; // PRECEDING / FOLLOWING\n      const next = active && root.contains(active) && ordered.find(function (element) {\n        return Boolean(active.compareDocumentPosition(element) & direction);\n      });\n      event.preventDefault();\n      (next || (event.shiftKey ? last : first)).focus();\n    } else if (event.shiftKey && active === first) {\n      event.preventDefault(); last.focus();\n    } else if (!event.shiftKey && active === last) {\n      event.preventDefault(); first.focus();\n    }\n  }\n\n\n  function syncSubmittingUi() {\n    if (!shadow || !stageElement) return;\n    const closeButton = shadow.querySelector('.close');\n    if (closeButton) closeButton.disabled = state.submitting;\n    if (!state.submitting) return;\n    stageElement.querySelectorAll('button, input, select, textarea').forEach(function (control) { control.disabled = true; });\n    if (!stageElement.querySelector('#pp-sending-status')) {\n      stageElement.insertAdjacentHTML('beforeend', '<p class=\"notice\" id=\"pp-sending-status\" role=\"status\" tabindex=\"-1\">Sending your request. Please wait a moment before closing.</p>');\n    }\n  }\n  function focusSendingStatus() {\n    const status = stageElement && stageElement.querySelector('#pp-sending-status');\n    if (status) status.focus({ preventScroll: true });\n    else focusQuoteStage();\n  }\n\n  let host = null;\n  let shadow = null;\n  let stageElement = null;\n  let progressElement = null;\n  let previousFocus = null;\n  let offerPreviousFocus = null;\n  let previousOverflow = \"\";\n  let restored = false;\n  function freshState() {\n    return {\n      step: 1,\n      zip: \"\",\n      zipIneligible: false,\n      dogCount: \"\",\n      frequency: \"\",\n      areas: [],\n      yardSize: \"\",\n      yardHelpOpen: false,\n      lastCleaned: \"\",\n      customerStatus: \"\",\n      intent: \"service_request\",\n      reviewEdit: null,\n      firstName: \"\",\n      lastName: \"\",\n      phone: \"\",\n      email: \"\",\n      address: \"\",\n      city: \"\",\n      startTiming: \"\",\n      preferredContact: \"text\",\n      smsConsent: false,\n      smsConsentCapturedAt: \"\",\n      question: \"\",\n      termsAccepted: false,\n      termsAcceptedAt: \"\",\n      submitting: false,\n      receipt: null,\n      pendingSubmission: null,\n      submissionReviewMessage: \"\",\n      attribution: captureAttribution()\n    };\n  }\n\n  // No identity, contact fields, consent, request IDs or attribution travel in save links.\n  let pendingPlanToken = takePlanResumeToken();\n  let resumeLoading = false;\n  let resumeNotice = \"\";\n  let resumeSave = { fingerprint: \"\", url: \"\", busy: false, message: \"\" };\n\n  function resetPlanResumeUiOnClose() {\n    resumeLoading = false;\n    // A closed host will ignore its pending response. Let a reopened plan save again.\n    // Completed links remain usable; closing never silently starts another save.\n    if (resumeSave.busy) resumeSave = { fingerprint: resumeSave.fingerprint, url: resumeSave.url,\n      busy: false, message: resumeSave.url ? resumeSave.message : \"\" };\n  }\n  function activePlanSave(attempt, activeHost) {\n    if (activeHost !== host || resumeSave !== attempt) return false;\n    if (attempt.fingerprint !== JSON.stringify(planResumePayload())) {\n      // The selections changed while the request was pending, even if Price has\n      // not rendered yet. Do not strand a completed attempt in the busy state.\n      resumeSave = { fingerprint: \"\", url: \"\", busy: false, message: \"\" };\n      return false;\n    }\n    return true;\n  }\n\n  function takePlanResumeToken() {\n    if (typeof window.__ppTakePlanToken === \"function\") return window.__ppTakePlanToken();\n    if (!/^#resume=/.test(location.hash || \"\")) return \"\";\n    const match = /^#resume=([A-Za-z0-9_-]{43})$/.exec(location.hash);\n    try { history.replaceState(history.state, \"\", location.pathname + location.search); } catch (_) { return \"invalid\"; }\n    return match ? match[1] : \"invalid\";\n  }\n  function planResumeEndpoint(opening) {\n    if (!CONFIG.leadEndpoint) throw new Error(\"Save links are unavailable in this preview.\");\n    return new URL(opening ? \"/quote-resume/open\" : \"/quote-resume\", CONFIG.leadEndpoint).href;\n  }\n  function planResumePayload() {\n    return { zip: state.zip, dogs: Number(state.dogCount), frequencyId: state.frequency,\n      yardSizeId: state.yardSize, areaIds: state.areas.slice().sort(), customerStatus: state.customerStatus };\n  }\n  async function planResumeFetch(body, opening) {\n    const controller = new AbortController();\n    const timer = window.setTimeout(function () { controller.abort(); }, 12000);\n    try {\n      const response = await fetch(planResumeEndpoint(opening), { method: \"POST\", credentials: \"omit\",\n        headers: { \"Content-Type\": \"application/json\" }, body: JSON.stringify(body), signal: controller.signal,\n        cache: \"no-store\", referrerPolicy: \"no-referrer\", redirect: \"error\" });\n      const result = await response.json();\n      if (!response.ok || result.ok !== true) throw new Error(result.message || \"The save link is unavailable. Please try again later or build a new quote.\");\n      return result;\n    } finally { window.clearTimeout(timer); }\n  }\n  function renderPlanResumeControls() {\n    if (!stageElement || state.step !== 3) return;\n    const fingerprint = JSON.stringify(planResumePayload());\n    if (resumeSave.fingerprint !== fingerprint) resumeSave = { fingerprint: fingerprint, url: \"\", busy: false, message: \"\" };\n    const saved = Boolean(resumeSave.url);\n    stageElement.insertAdjacentHTML(\"beforeend\", `<div class=\"summary-card\" data-resume-save>\n      <h3>Keep this plan for later</h3>\n      <p class=\"help\">Open your plan on another device for 7 days. The link saves your plan selections only. Prices and offers may change.</p>\n      ${saved ? `<div class=\"field\"><label for=\"pp-saved-plan-link\">Your plan link</label><input class=\"input\" id=\"pp-saved-plan-link\" type=\"text\" readonly value=\"${escapeHtml(resumeSave.url)}\" aria-describedby=\"pp-save-plan-status\" style=\"width:100%;min-width:0\"></div>` : \"\"}\n      <button class=\"btn\" type=\"button\" data-action=\"save-plan-link\" ${resumeSave.busy ? \"disabled\" : \"\"}>${resumeSave.busy ? \"Creating link…\" : saved ? \"Copy plan link\" : \"Create a save link\"}</button>\n      <p class=\"help\" id=\"pp-save-plan-status\" tabindex=\"-1\" role=\"status\" aria-live=\"polite\">${escapeHtml(resumeSave.message || \"No contact details needed. Nothing is sent to our team.\")}</p>\n    </div>`);\n  }\n  async function copySavedPlanLink() {\n    const activeHost = host;\n    const saved = resumeSave;\n    let message;\n    try {\n      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error(\"Clipboard unavailable\");\n      await navigator.clipboard.writeText(saved.url);\n      message = \"Link copied. Save it somewhere you can find it; it expires after 7 days.\";\n    } catch (_) {\n      message = \"Your link is ready. Select and copy the link above to save it for 7 days.\";\n    }\n    if (activeHost !== host || resumeSave !== saved || saved.fingerprint !== JSON.stringify(planResumePayload())) return;\n    saved.message = message;\n    if (stageElement && state.step === 3) {\n      renderPrice();\n      const field = stageElement.querySelector(\"#pp-saved-plan-link\");\n      if (field) { field.focus(); field.select(); }\n    }\n  }\n  async function savePlanResumeLink() {\n    if (resumeSave.busy || state.step !== 3) return;\n    if (resumeSave.url && resumeSave.fingerprint === JSON.stringify(planResumePayload())) return copySavedPlanLink();\n    const payload = planResumePayload();\n    const fingerprint = JSON.stringify(payload);\n    const activeHost = host;\n    const pendingSave = { fingerprint: fingerprint, url: \"\", busy: true, message: \"\" };\n    resumeSave = pendingSave;\n    resumeSave.message = \"Creating your plan link…\";\n    renderPrice();\n    const pendingStatus = stageElement && stageElement.querySelector(\"#pp-save-plan-status\");\n    if (pendingStatus) pendingStatus.focus({ preventScroll: true });\n    try {\n      const result = await planResumeFetch(payload, false);\n      if (!/^https:\\/\\/quote\\.itspurgepros\\.com\\/#resume=[A-Za-z0-9_-]{43}$/.test(result.url || \"\")) throw new Error(\"We could not create a valid save link.\");\n      if (!activePlanSave(pendingSave, activeHost)) return;\n      resumeSave = { fingerprint: fingerprint, url: result.url, busy: false, message: \"Your link is ready.\" };\n      if (state.step === 3) await copySavedPlanLink();\n    } catch (error) {\n      if (!activePlanSave(pendingSave, activeHost)) return;\n      resumeSave = { fingerprint: fingerprint, url: \"\", busy: false,\n        message: error && error.name === \"AbortError\" ? \"Creating the link took too long. You can try again or continue with your quote.\" : error.message || \"Save link unavailable; you can continue with your quote.\" };\n      if (state.step === 3) {\n        renderPrice();\n        const failedStatus = stageElement && stageElement.querySelector(\"#pp-save-plan-status\");\n        if (failedStatus) failedStatus.focus({ preventScroll: true });\n      }\n    }\n  }\n  function resumePlanIntoFreshState(result) {\n    const plan = result.plan;\n    const keys = [\"zip\", \"dogs\", \"frequencyId\", \"yardSizeId\", \"areaIds\", \"customerStatus\"];\n    if (!plan || Object.keys(plan).length !== keys.length || Object.keys(plan).some(function (key) { return keys.indexOf(key) < 0; }) ||\n        typeof plan.zip !== \"string\" || CONFIG.serviceZips.indexOf(plan.zip) < 0 || !Number.isInteger(plan.dogs) ||\n        [\"new\", \"returning\", \"not_sure\"].indexOf(plan.customerStatus) < 0 || !Array.isArray(plan.areaIds) ||\n        !plan.areaIds.length || new Set(plan.areaIds).size !== plan.areaIds.length ||\n        plan.areaIds.some(function (id) { return !Object.prototype.hasOwnProperty.call(CONFIG.areaLabels, id); })) throw new Error(\"The saved plan is no longer available. Please build a new quote.\");\n    const fresh = freshState();\n    fresh.zip = plan.zip;\n    fresh.dogCount = String(plan.dogs);\n    fresh.frequency = plan.frequencyId;\n    fresh.yardSize = plan.yardSizeId;\n    fresh.areas = plan.areaIds.slice();\n    fresh.customerStatus = plan.customerStatus;\n    const quote = calculateQuote(fresh);\n    if (!quote.ok || !result.quote || result.quote.pricingVersion !== CONFIG.pricingVersion ||\n        quote.custom !== result.quote.custom || (!quote.custom && quote.priceCents !== result.quote.priceCents)) {\n      throw new Error(\"The available prices or plan options changed. Reload this page to build a quote with the current options.\");\n    }\n    fresh.step = 3;\n    state = fresh;\n    resumeSave = { fingerprint: \"\", url: \"\", busy: false, message: \"\" };\n    // Do not call submit, trackSuccess, choose-intent or restore any prior request/consent.\n    saveLowRiskProgress();\n  }\n  function beginPlanResume() {\n    if (!pendingPlanToken) return;\n    const token = pendingPlanToken;\n    pendingPlanToken = \"\";\n    const activeHost = host;\n    clearLowRiskProgress();\n    state = freshState();\n    resumeLoading = true;\n    resumeNotice = \"\";\n    const promise = token === \"invalid\" ? Promise.reject(new Error(\"This save link is invalid. Please build a new quote.\")) : planResumeFetch({ token: token }, true);\n    promise.then(function (result) {\n      if (activeHost !== host) return;\n      resumePlanIntoFreshState(result);\n      resumeNotice = result.pricingChanged\n        ? \"Pricing has changed since you saved this plan. We have recalculated it using today's prices. Review the current price and offer before continuing.\"\n        : \"Your saved plan is ready. Review today's price and offer before continuing. Contact details and permissions have not been restored.\";\n    }).catch(function (error) {\n      if (activeHost !== host) return;\n      state = freshState();\n      resumeNotice = error && error.name === \"AbortError\" ? \"The saved plan took too long to load. Reopen your saved link to try again, or build a new quote.\" : error.message || \"This save link is unavailable. Please build a new quote.\";\n    }).finally(function () {\n      if (activeHost !== host) return;\n      resumeLoading = false;\n      render();\n      queueMicrotask(function () { const note = stageElement && stageElement.querySelector(\"[data-resume-notice]\"); if (note) note.focus(); });\n    });\n  }\n  function renderPlanResumeNotice() {\n    if (!stageElement || !resumeNotice || state.step === 6) return;\n    if (stageElement.querySelector(\"[data-resume-notice]\")) return;\n    stageElement.insertAdjacentHTML(\"afterbegin\", `<div class=\"notice\" role=\"status\" tabindex=\"-1\" data-resume-notice>${escapeHtml(resumeNotice)}</div>`);\n  }\n  function renderPrice() {\n    renderPriceWithoutResume();\n    renderPlanResumeControls();\n    renderPlanResumeNotice();\n  }\n\n  let state = freshState();\n\n  function escapeHtml(value) {\n    return String(value == null ? \"\" : value)\n      .replaceAll(\"&\", \"&amp;\")\n      .replaceAll(\"<\", \"&lt;\")\n      .replaceAll(\">\", \"&gt;\")\n      .replaceAll('\"', \"&quot;\")\n      .replaceAll(\"'\", \"&#039;\");\n  }\n\n  function selected(condition) { return condition ? \" selected\" : \"\"; }\n  function selectedStatusHtml(active) { return active ? iconHtml(\"service-check\", \"choice-check-icon\") + \"<span>Selected</span>\" : \"\"; }\n  function checked(condition) { return condition ? \" checked\" : \"\"; }\n  function normalizeZip(value) { return String(value || \"\").replace(/\\D/g, \"\").slice(0, 5); }\n\n  function normalizePhone(value) {\n    let digits = String(value || \"\").replace(/\\D/g, \"\");\n    if (digits.length === 11 && digits.startsWith(\"1\")) digits = digits.slice(1);\n    if (!/^\\d{10}$/.test(digits)) return null;\n    return { digits: digits, e164: \"+1\" + digits };\n  }\n\n  function formatPhone(value) {\n    let digits = String(value || \"\").replace(/\\D/g, \"\");\n    if (digits.length > 10 && digits.startsWith(\"1\")) digits = digits.slice(1);\n    digits = digits.slice(0, 10);\n    if (digits.length <= 3) return digits;\n    if (digits.length <= 6) return \"(\" + digits.slice(0, 3) + \") \" + digits.slice(3);\n    return \"(\" + digits.slice(0, 3) + \") \" + digits.slice(3, 6) + \"-\" + digits.slice(6);\n  }\n\n  function money(cents) {\n    return new Intl.NumberFormat(\"en-US\", { style: \"currency\", currency: \"USD\" }).format(cents / 100);\n  }\n\n  function validEmail(value) { return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(String(value || \"\").trim()); }\n\n  function calculateQuote(input) {\n    const dogs = Number(input.dogCount);\n    const frequencyId = String(input.frequency || \"\");\n    const frequency = CONFIG.frequencies[frequencyId];\n    const yard = CONFIG.yardSizes[input.yardSize];\n    const areas = Array.from(new Set(Array.isArray(input.areas) ? input.areas : []))\n      .filter(function (area) { return Object.prototype.hasOwnProperty.call(CONFIG.areaLabels, area); });\n    const errors = [];\n    if (!Number.isInteger(dogs) || dogs < 1 || dogs > 10) errors.push(\"Choose the number of dogs.\");\n    if (!frequency) errors.push(\"Choose a service frequency.\");\n    if (!yard) errors.push(\"Choose the serviced yard size.\");\n    if (!areas.length) errors.push(\"Choose at least one service area.\");\n    if (!errors.length && yard.custom && !frequency.custom) errors.push(\"Choose Custom booking for yards over 1 acre.\");\n    if (!errors.length && !frequency.custom && frequencyId !== \"onetime\" && !frequency.prices[dogs]) errors.push(\"Choose an available service frequency for this dog count.\");\n    if (errors.length) return { ok: false, errors: errors };\n\n    const reasons = [];\n    if (frequency.custom) reasons.push(\"CUSTOM_BOOKING_SELECTED\");\n    if (dogs >= 10 && frequencyId !== \"onetime\") reasons.push(\"DOG_COUNT_10_PLUS\");\n    if (yard.custom) reasons.push(\"YARD_OVER_ONE_ACRE\");\n    if (reasons.length) return {\n      ok: true,\n      custom: true,\n      pricingVersion: CONFIG.pricingVersion,\n      reasons: reasons,\n      configuration: { dogCount: dogs, frequency: frequencyId, yardSize: input.yardSize, areas: areas }\n    };\n\n    if (frequencyId === \"onetime\") return {\n      ok: true,\n      custom: false,\n      pricingVersion: CONFIG.pricingVersion,\n      priceCents: frequency.flatPrice,\n      lineItems: [{ label: \"One-time cleanup · first 30 minutes\", cents: frequency.flatPrice }],\n      disclaimer: \"The first 30 minutes are included. Additional labor is $1 per minute.\",\n      configuration: { dogCount: dogs, frequency: frequencyId, yardSize: input.yardSize, areas: areas }\n    };\n\n    const base = frequency.prices[dogs];\n    const areaAdd = CONFIG.areaAdders[areas.length] || 0;\n    const yardAdd = yard.add || 0;\n    const lineItems = [{ label: frequency.label + \" · \" + dogs + \" \" + (dogs === 1 ? \"dog\" : \"dogs\"), cents: base }];\n    if (areaAdd) lineItems.push({ label: areas.map(function (id) { return CONFIG.areaLabels[id]; }).join(\" + \"), cents: areaAdd });\n    if (yardAdd) lineItems.push({ label: yard.label, cents: yardAdd });\n    return {\n      ok: true,\n      custom: false,\n      pricingVersion: CONFIG.pricingVersion,\n      priceCents: base + areaAdd + yardAdd,\n      lineItems: lineItems,\n      disclaimer: \"Your recurring maintenance price. Final service-day availability is confirmed before secure payment setup.\",\n      configuration: { dogCount: dogs, frequency: frequencyId, yardSize: input.yardSize, areas: areas }\n    };\n  }\n\n  function currentQuote() {\n    return calculateQuote({\n      dogCount: state.dogCount,\n      frequency: state.frequency,\n      areas: state.areas,\n      yardSize: state.yardSize\n    });\n  }\n\n  function priceUnit() { return state.frequency === \"onetime\" ? \"base price\" : \"per visit\"; }\n\n  function captureAttribution() {\n    const params = new URLSearchParams(location.search);\n    let saved = {};\n    try { saved = JSON.parse(sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY) || \"{}\"); } catch (_) {}\n    ATTRIBUTION_KEYS.forEach(function (key) {\n      if (params.has(key)) saved[key] = String(params.get(key)).slice(0, 250);\n    });\n    try { sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(saved)); } catch (_) {}\n    return saved;\n  }\n\n  function consumeAutoOpenRequest() {\n    const url = new URL(location.href);\n    const queryValue = String(url.searchParams.get(\"open_quote\") || \"\").trim().toLowerCase();\n    const queryRequested = queryValue === \"1\" || queryValue === \"true\" || queryValue === \"yes\";\n    const hashValue = String(url.hash || \"\").toLowerCase();\n    const hashRequested = hashValue === \"#quote\" || hashValue === \"#get-quote\";\n    if (!queryRequested && !hashRequested) return false;\n\n    // Attribution was captured before this runs. Remove only the one-time open\n    // instruction so closing and refreshing the page does not reopen the widget.\n    url.searchParams.delete(\"open_quote\");\n    if (hashRequested) url.hash = \"\";\n    try {\n      history.replaceState(history.state, \"\", url.pathname + url.search + url.hash);\n    } catch (_) {}\n    return true;\n  }\n\n  function openWhenBodyReady() {\n    if (document.body) {\n      queueMicrotask(function () { open({ zip: new URL(location.href).searchParams.get(\"zip\") }); });\n      return;\n    }\n\n    // The global GHL embed uses defer, but retain a small guard for legacy links\n    // if another host loads the script before its body exists.\n    const observer = new MutationObserver(function () {\n      if (!document.body) return;\n      observer.disconnect();\n      queueMicrotask(function () { open({ zip: new URL(location.href).searchParams.get(\"zip\") }); });\n    });\n    observer.observe(document.documentElement, { childList: true, subtree: true });\n  }\n\n  function cookieValue(name) {\n    const match = document.cookie.match(new RegExp(\"(?:^|; )\" + name + \"=([^;]*)\"));\n    return match ? decodeURIComponent(match[1]) : \"\";\n  }\n\n  function saveLowRiskProgress() {\n    const safe = {\n      zip: state.zip,\n      dogCount: state.dogCount,\n      frequency: state.frequency,\n      areas: state.areas,\n      yardSize: state.yardSize,\n      lastCleaned: state.lastCleaned,\n      customerStatus: state.customerStatus\n    };\n    try { sessionStorage.setItem(LOW_RISK_STORAGE_KEY, JSON.stringify(safe)); } catch (_) {}\n  }\n\n  function restoreLowRiskProgress() {\n    try {\n      const saved = JSON.parse(sessionStorage.getItem(LOW_RISK_STORAGE_KEY) || \"null\");\n      if (!saved) return;\n      [\"zip\", \"dogCount\", \"frequency\", \"areas\", \"yardSize\", \"lastCleaned\", \"customerStatus\"].forEach(function (key) {\n        if (Object.prototype.hasOwnProperty.call(saved, key)) state[key] = saved[key];\n      });\n      reconcileFrequencySelection();\n    } catch (_) {}\n  }\n\n  function clearLowRiskProgress() {\n    try { sessionStorage.removeItem(LOW_RISK_STORAGE_KEY); } catch (_) {}\n  }\n\n  function track(name, params) {\n    const safe = Object.assign({ ui_version: CONFIG.uiVersion }, params || {});\n    if (typeof window.gtag === \"function\") window.gtag(\"event\", name, safe);\n    else if (Array.isArray(window.dataLayer)) window.dataLayer.push(Object.assign({ event: name }, safe));\n    if (CONFIG.tracking.firePixelEvents && name === \"funnel_viewed\" && typeof window.fbq === \"function\") {\n      window.fbq(\"trackCustom\", \"QuoteFunnelViewed\", safe);\n    }\n  }\n\n  function trackSuccess(payload, requestId) {\n    const quote = currentQuote();\n    const params = {\n      event_id: requestId + \":\" + payload.stage,\n      transaction_id: requestId,\n      intent: state.intent,\n      frequency: state.frequency,\n      value: quote.custom ? undefined : quote.priceCents / 100,\n      currency: \"USD\"\n    };\n    track(payload.stage, params);\n    if (state.intent !== \"service_request\") return;\n    if (typeof window.gtag === \"function\") {\n      window.gtag(\"event\", \"generate_lead\", params);\n      if (CONFIG.tracking.googleAdsSendTo) {\n        window.gtag(\"event\", \"conversion\", Object.assign({}, params, { send_to: CONFIG.tracking.googleAdsSendTo, transport_type: \"beacon\" }));\n      }\n    } else if (Array.isArray(window.dataLayer)) window.dataLayer.push(Object.assign({ event: \"generate_lead\" }, params));\n    if (CONFIG.tracking.firePixelEvents && typeof window.fbq === \"function\") {\n      window.fbq(\"track\", \"Lead\", { value: params.value, currency: \"USD\" }, { eventID: params.event_id });\n    }\n  }\n\n  function shellHtml() {\n    return `<style>${CSS}</style>\n      <div class=\"backdrop\" data-backdrop>\n        <div class=\"modal\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"pp-stage-title\">\n          <button class=\"close\" type=\"button\" data-action=\"close\" aria-label=\"Close quote builder\">${iconHtml(\"close\", \"close-icon\")}</button>\n          <section class=\"quote-side\">\n            <header class=\"quote-topbar\">\n              <div class=\"mobile-brand\"><span class=\"brand-mark\"><img src=\"${escapeHtml(CONFIG.brand.iconUrl)}\" alt=\"Purge Pros icon\"></span><span><strong>PURGE PROS</strong><small>Pet Waste Removal</small></span></div>\n              <p class=\"quote-topbar-title\">Your clean-yard plan</p>\n              <div class=\"quote-topbar-actions\"><a class=\"top-review\" href=\"https://itspurgepros.com/reviews\" target=\"_blank\" rel=\"noopener\">${iconHtml(\"review-star\")}<span data-review-chip>Read our Google reviews</span></a><a class=\"top-help\" href=\"${CONFIG.brand.phoneHref}\">${iconHtml(\"phone\")}<span>Need help? ${CONFIG.brand.phoneDisplay}</span></a></div>\n            </header>\n            <nav class=\"progress\" aria-label=\"Quote progress\"></nav>\n            <div class=\"stage\" tabindex=\"-1\" aria-labelledby=\"pp-stage-title\" aria-live=\"polite\"></div>\n          </section>\n          ${offerModalHtml()}\n        </div>\n      </div>`;\n  }\n\n  function promotionCardHtml() { return offerSummaryHtml(false); }\n\n  function offerSummaryHtml(detailed) {\n    if (state.frequency === \"onetime\") return `<aside class=\"offer-summary\"><strong>One-time cleanup: ${money(CONFIG.frequencies.onetime.flatPrice)} for the first 30 minutes.</strong><p>The new recurring-customer offer does not apply. The $89.99 base deposit is charged when we are on the way and your ETA text goes out. Additional time beyond 30 minutes is billed after cleanup at $1 per minute.</p></aside>`;\n    if (state.frequency === \"custom\" || state.yardSize === \"over\") return `<aside class=\"offer-summary\"><strong>Your price and any offer eligibility need a custom review.</strong><p>We will confirm both before you approve service. Nothing is charged by this form.</p></aside>`;\n    const quote = currentQuote();\n    const priced = quote.ok && !quote.custom && state.frequency;\n    if (state.customerStatus === \"returning\" || state.customerStatus === \"not_sure\") return `<aside class=\"offer-summary\"><strong>Restart with clear cleanup pricing.</strong><p>Your quoted maintenance rate${priced ? \" is \" + money(quote.priceCents) + \" per visit\" : \" comes next\"}. For your restart, that rate includes up to 30 minutes of cleanup. Only additional time beyond 30 minutes is billed afterward at $1 per minute.</p><p>We confirm your account rate and these terms before you approve service. The base is charged when your on-the-way ETA text goes out. Following regular maintenance visits stay at the agreed rate regardless of time spent. Introductory offers do not repeat; uncertain history receives team review.</p></aside>`;\n    if (!CONFIG.promotion.enabled) return \"\";\n    if (!detailed) return `<aside class=\"offer-summary\" aria-label=\"New recurring-customer offer\"><strong>Built-up poop? Start at your regular visit price.</strong><p>New recurring customers pay $0 initial scoop surcharge. Your regular visit price still applies.</p><p class=\"offer-scope\">No minimum visits · No cancellation fee</p><button class=\"promotion-link\" type=\"button\" data-action=\"show-offer\">See your savings &amp; full offer details ${iconHtml(\"offer-cursor\", \"promotion-link-icon\")}</button></aside>`;\n    return `<aside class=\"offer-summary\" aria-label=\"New recurring-customer offer\"><strong>${escapeHtml(CONFIG.promotion.title)}</strong><p class=\"offer-savings\">${escapeHtml(CONFIG.promotion.detail)}</p>${detailed && priced && state.customerStatus === \"new\" ? `<dl class=\"offer-costs\"><div class=\"first-visit\"><dt>Your first cleanup</dt><dd>${money(quote.priceCents)}</dd></div><div><dt>Initial scoop surcharge</dt><dd>$0 — waived</dd></div><div><dt>Following scheduled visits</dt><dd>${money(quote.priceCents)} per visit</dd></div></dl>` : \"\"}<p>No time surcharges on scheduled recurring visits.</p><p class=\"offer-scope\">New recurring customers · No minimum visits · No cancellation fee</p><button class=\"promotion-link\" type=\"button\" data-action=\"show-offer\">${escapeHtml(CONFIG.promotion.linkLabel)} ${iconHtml(\"offer-cursor\", \"promotion-link-icon\")}</button></aside>`;\n  }\n\n  function focusKey() {\n    const el = shadow && shadow.activeElement;\n    if (!el) return null;\n    for (const key of [\"dog\", \"frequency\", \"area\"]) if (el.dataset && el.dataset[key]) return { key: key, value: el.dataset[key] };\n    if (el.id) return { id: el.id };\n    if (el.name === \"pp-preferred\") return { reply: el.value };\n    return null;\n  }\n\n  function restoreControlFocus(key) {\n    if (!key) return;\n    const el = key.id ? shadow.getElementById(key.id) : key.reply ? Array.from(stageElement.querySelectorAll('[name=\"pp-preferred\"]')).find(el => el.value === key.reply) : Array.from(stageElement.querySelectorAll('[data-' + key.key + ']')).find(el => el.dataset[key.key] === key.value);\n    if (el && !el.disabled) el.focus({ preventScroll: true });\n  }\n\n  function offerModalHtml() {\n    const offer = CONFIG.promotion;\n    return `<div class=\"offer-layer\" data-offer-layer hidden><section class=\"offer-dialog\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"pp-offer-title\"><div class=\"offer-dialog-head\"><h2 id=\"pp-offer-title\">${escapeHtml(offer.modalTitle)}</h2><button class=\"offer-close\" type=\"button\" data-action=\"close-offer\" aria-label=\"Close offer details\">${iconHtml(\"close\", \"offer-close-icon\")}</button></div><p>${escapeHtml(offer.modalIntro)}</p><div class=\"offer-table\"><div class=\"offer-row\"><span>${escapeHtml(offer.firstThirtyLabel)}</span><strong>${escapeHtml(offer.firstThirtyValue)}</strong></div><div class=\"offer-row\"><span>${escapeHtml(offer.additionalLabel)}</span><strong>${escapeHtml(offer.additionalValue)}</strong></div><div class=\"offer-row\"><span>${escapeHtml(offer.exampleLabel)}</span><strong>${escapeHtml(offer.exampleValue)}</strong></div><div class=\"offer-row savings\"><span>${escapeHtml(offer.customerLabel)}</span><strong>${escapeHtml(offer.customerValue)}</strong></div></div><p class=\"offer-disclaimer\">${escapeHtml(offer.disclaimer)}</p></section></div>`;\n  }\n\n  function stageHeader(eyebrow, title, description, badge) {\n    const stageIcon = ({ 1: \"local-area\", 2: \"dog\", 3: \"per-visit-price\", 4: \"property-notes\", 5: \"service-check\" })[state.step] || \"service-check\";\n    return `<header class=\"stage-header\"><div class=\"stage-header-row\"><div><span class=\"eyebrow\">${escapeHtml(eyebrow)}</span><h2 id=\"pp-stage-title\">${escapeHtml(title)}</h2></div></div><p>${escapeHtml(description)}</p><span class=\"stage-illustration\" aria-hidden=\"true\">${iconHtml(stageIcon, \"stage-illustration-icon\")}${badge ? `<span class=\"badge\">${escapeHtml(badge)}</span>` : \"\"}</span></header>`;\n  }\n\n  function renderProgress() {\n    if (!progressElement) return;\n    progressElement.style.display = state.step > 5 ? \"none\" : \"grid\";\n    progressElement.innerHTML = PROGRESS_LABELS.map(function (label, index) {\n      const number = index + 1;\n      const complete = state.step > number;\n      const current = state.step === number;\n      return `<div class=\"progress-step${complete ? \" complete\" : \"\"}${current ? \" current\" : \"\"}\"${current ? ' aria-current=\"step\"' : \"\"}><span class=\"progress-dot\">${complete ? iconHtml(\"service-check\", \"progress-check-icon\") : number}</span><span class=\"progress-label\">${label}</span></div>`;\n    }).join(\"\");\n  }\n\n  function focusCoverageResult() {\n    queueMicrotask(function () {\n      const result = stageElement && stageElement.querySelector(\"#pp-coverage-result\");\n      if (!result) return;\n      result.focus();\n      if (result.scrollIntoView) result.scrollIntoView({ block: \"nearest\" });\n    });\n  }\n\n  function renderArea() {\n    if (state.zipIneligible) {\n      stageElement.innerHTML = `<div class=\"coverage-result\" id=\"pp-coverage-result\" role=\"alert\" tabindex=\"-1\" aria-labelledby=\"pp-stage-title\" aria-describedby=\"pp-coverage-help\"><span class=\"coverage-mark\" aria-hidden=\"true\">${iconHtml(\"alert\", \"coverage-mark-icon\")}</span><div><p class=\"coverage-kicker\">Outside our service area</p><h2 id=\"pp-stage-title\">We do not service ZIP ${escapeHtml(state.zip)} yet.</h2><p id=\"pp-coverage-help\">Purge Pros serves Indianapolis and nearby Central Indiana communities. If you entered the wrong ZIP, correct it below.</p></div></div>\n        <div class=\"field\"><label for=\"pp-zip\">Try a different service ZIP</label><div class=\"zip-wrap\"><input class=\"input coverage-input\" id=\"pp-zip\" inputmode=\"numeric\" autocomplete=\"postal-code\" maxlength=\"5\" placeholder=\"e.g. 46032\" value=\"${escapeHtml(state.zip)}\" aria-invalid=\"true\" aria-describedby=\"pp-coverage-help\"><button class=\"btn blue\" type=\"button\" data-action=\"check-zip\">Check this ZIP ${iconHtml(\"search\", \"action-icon\")} </button></div></div>\n        <div class=\"coverage-contact\"><strong>Near the edge of our routes?</strong><p>Call <a href=\"${CONFIG.brand.phoneHref}\">${CONFIG.brand.phoneDisplay}</a> and we can check the address. We will not collect your contact details in this form for an unsupported ZIP.</p></div>\n        <div class=\"error\" role=\"alert\" tabindex=\"-1\"></div>`;\n      focusCoverageResult();\n      return;\n    }\n\n    stageElement.innerHTML = `${stageHeader(\"60-SECOND PRICE CHECK\", \"First, are we in your neighborhood?\", \"Enter your ZIP to check coverage. Then build your plan and see your exact per-visit price.\", \"Fast availability check\")}\n      <div class=\"field\"><label for=\"pp-zip\">Service ZIP code</label><div class=\"zip-wrap\"><input class=\"input\" id=\"pp-zip\" inputmode=\"numeric\" autocomplete=\"postal-code\" maxlength=\"5\" placeholder=\"e.g. 46032\" value=\"${escapeHtml(state.zip)}\"><button class=\"btn blue\" type=\"button\" data-action=\"check-zip\">Check availability ${iconHtml(\"search\", \"action-icon\")} </button></div><small>Central Indiana service area. No geolocation or account required.</small></div>\n      ${offerSummaryHtml(false)}\n      <div class=\"error\" role=\"alert\" tabindex=\"-1\"></div>\n      <div class=\"info-list\"><div class=\"info-item\">${iconHtml(\"per-visit-price\", \"info-icon\")}<span><strong>Clear per-visit pricing.</strong> Build the plan that fits your yard and see your exact price for each visit.</span></div><div class=\"info-item\">${iconHtml(\"secure-payment\", \"info-icon\")}<span><strong>Nothing charged today.</strong> Secure payment setup comes only after you approve the proposed service day.</span></div><div class=\"info-item\">${iconHtml(\"service-calendar\", \"info-icon\")}<span><strong>A dependable neighborhood service day.</strong> Our team confirms the recurring day instead of promising a slot that may not work.</span></div></div>`;\n  }\n\n  function frequencyEligibility(id, definition) {\n    const dogs = Number(state.dogCount);\n    if (definition.custom) return { allowed: true, note: definition.sub };\n    if (state.yardSize === \"over\") return { allowed: false, note: \"Choose Custom booking for yards over 1 acre\" };\n    if (definition.anyDogs || !dogs) return { allowed: true, note: definition.sub };\n    if (definition.prices && definition.prices[dogs]) return { allowed: true, note: definition.sub };\n    return { allowed: false, note: \"Available for up to \" + definition.maxDogs + \" dogs\" };\n  }\n\n  function reconcileFrequencySelection() {\n    const definition = CONFIG.frequencies[state.frequency];\n    if (!definition) {\n      if (Number(state.dogCount) >= 10 || state.yardSize === \"over\") state.frequency = \"custom\";\n      return;\n    }\n    if (frequencyEligibility(state.frequency, definition).allowed) return;\n    state.frequency = Number(state.dogCount) >= 10 || state.yardSize === \"over\" ? \"custom\" : \"\";\n  }\n\n  function frequencyChoice(id, definition) {\n    const active = state.frequency === id;\n    const eligibility = frequencyEligibility(id, definition);\n    const selectionStatus = eligibility.allowed ? selectedStatusHtml(active) : \"\";\n    const art = ({ twice: \"frequency-twice-weekly\", weekly: \"frequency-weekly\", biweekly: \"frequency-every-other-week\", onetime: \"frequency-one-time\", custom: \"frequency-custom\" })[id];\n    return `<button class=\"choice${definition.custom ? \" custom-choice\" : \"\"}\" type=\"button\" data-frequency=\"${id}\" aria-pressed=\"${active}\"${eligibility.allowed ? \"\" : ' disabled aria-disabled=\"true\"'}>${iconHtml(art, \"choice-art\")}<span class=\"choice-check\">${selectionStatus}</span>${definition.popular ? '<span class=\"popular\">' + iconHtml(\"review-star\", \"popular-star-icon\") + '<span>MOST POPULAR</span></span>' : \"\"}<strong>${escapeHtml(definition.label)}</strong><small>${escapeHtml(eligibility.note)}</small></button>`;\n  }\n\n  function areaChoice(id, label) {\n    const active = state.areas.indexOf(id) >= 0;\n    return `<button class=\"choice\" type=\"button\" data-area=\"${id}\" aria-pressed=\"${active}\">${iconHtml(({ back: \"area-back\", front: \"area-front\", side: \"area-sides\" })[id], \"choice-art\")}<span class=\"choice-check\">${selectedStatusHtml(active)}</span><strong>${escapeHtml(label)}</strong><small>${active ? \"Included in your plan\" : \"Select this area\"}</small></button>`;\n  }\n\n  function yardGuideHtml() {\n    const rows = [[\"s\", \"Up to ⅛ acre\", \"5,445\"], [\"m\", \"Up to ¼ acre\", \"10,890\"], [\"l\", \"Up to ½ acre\", \"21,780\"], [\"xl\", \"Up to 1 acre\", \"43,560\"]];\n    return `<details class=\"yard-guide\" id=\"pp-yard-guide\"${state.yardHelpOpen ? \" open\" : \"\"}><summary><span class=\"yard-guide-summary\">${iconHtml(\"yard-guide\", \"yard-guide-icon\")}<span>Not sure about yard size?</span>${iconHtml(\"chevron\", \"yard-guide-chevron\")}</span></summary><div class=\"yard-guide-body\">\n      <p class=\"yard-guide-lead\">Your service area. Not your whole property.</p>\n      <p>Estimate the outdoor area you want scooped, including any patio or concrete areas where your dogs poop. Leave out the house and areas that do not need service.</p>\n      <figure class=\"yard-property\"><figcaption>${iconHtml(\"property-notes\", \"field-label-icon\")}<strong>Example: backyard service only</strong><span>Green + checkmark = area to count</span></figcaption>\n      <svg viewBox=\"0 0 400 392\" role=\"img\" aria-labelledby=\"pp-yard-title pp-yard-desc\" xmlns=\"http://www.w3.org/2000/svg\">\n        <title id=\"pp-yard-title\">Which part of a property counts as yard size?</title>\n        <desc id=\"pp-yard-desc\">An example viewed from above. The backyard lawn and patio count in this example because both need scooping. The house and unused driveway do not count. The front and side lawns count only if you request those areas too. This is not a measurement or a size-tier example.</desc>\n        <defs><pattern id=\"pp-yard-paving\" width=\"12\" height=\"12\" patternUnits=\"userSpaceOnUse\"><path d=\"M0 0H12V12\" fill=\"none\" stroke=\"#c8d2d6\" stroke-width=\"1\"/></pattern></defs>\n        <rect width=\"400\" height=\"392\" rx=\"16\" fill=\"#f3f7f5\"/>\n        <rect x=\"25\" y=\"16\" width=\"350\" height=\"327\" rx=\"10\" fill=\"#e8eee9\" stroke=\"#9aada2\" stroke-width=\"2\" stroke-dasharray=\"6 5\"/>\n        <path d=\"M36 27H364V154H256V126H144V154H36Z\" fill=\"#c2ebbd\" stroke=\"#267547\" stroke-width=\"2\"/>\n        <path d=\"M48 42H352M48 57H352M48 72H352M48 87H352M48 102H352M48 117H352M48 132H130M270 132H352\" stroke=\"#94cf94\" stroke-width=\"1\" opacity=\".55\"/>\n        <rect x=\"91\" y=\"50\" width=\"218\" height=\"61\" rx=\"14\" fill=\"#185c38\"/>\n        <circle cx=\"116\" cy=\"80\" r=\"12\" fill=\"#effbef\"/><path d=\"m110 80 4 4 8-9\" stroke=\"#185c38\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\"/>\n        <text x=\"141\" y=\"76\" fill=\"#fff\" font-size=\"18\" font-weight=\"700\">BACKYARD</text>\n        <text x=\"141\" y=\"96\" fill=\"#e3f5e5\" font-size=\"14\">Count this area</text>\n        <rect x=\"145\" y=\"128\" width=\"110\" height=\"40\" rx=\"3\" fill=\"#c2ebbd\"/><rect x=\"145\" y=\"128\" width=\"110\" height=\"40\" rx=\"3\" fill=\"url(#pp-yard-paving)\"/>\n        <text x=\"200\" y=\"152\" text-anchor=\"middle\" font-size=\"13\" fill=\"#455963\">Patio · include</text>\n        <rect x=\"86\" y=\"174\" width=\"209\" height=\"83\" rx=\"5\" fill=\"#becbd1\"/>\n        <path d=\"m90 178 30 32v40m0-40h145l26-32m-26 32v40\" fill=\"none\" stroke=\"#8a9fa9\" stroke-width=\"2\"/>\n        <rect x=\"140\" y=\"201\" width=\"119\" height=\"35\" rx=\"7\" fill=\"#f5f8f9\"/>\n        <text x=\"199\" y=\"224\" text-anchor=\"middle\" fill=\"#3d525f\" font-size=\"16\" font-weight=\"700\">House · exclude</text>\n        <rect x=\"253\" y=\"258\" width=\"78\" height=\"75\" rx=\"3\" fill=\"#d5dee2\"/>\n        <path d=\"M257 295H327\" stroke=\"#bdcbd1\"/>\n        <text x=\"292\" y=\"288\" text-anchor=\"middle\" font-size=\"12\" fill=\"#455963\">Driveway</text><text x=\"292\" y=\"307\" text-anchor=\"middle\" font-size=\"12\" fill=\"#455963\">if unused</text>\n        <text x=\"57\" y=\"197\" text-anchor=\"middle\" fill=\"#52685a\" font-size=\"12\">Side</text><text x=\"57\" y=\"214\" text-anchor=\"middle\" fill=\"#52685a\" font-size=\"12\">lawn</text>\n        <text x=\"340\" y=\"197\" text-anchor=\"middle\" fill=\"#52685a\" font-size=\"12\">Side</text><text x=\"340\" y=\"214\" text-anchor=\"middle\" fill=\"#52685a\" font-size=\"12\">lawn</text>\n        <text x=\"138\" y=\"286\" text-anchor=\"middle\" fill=\"#455e4e\" font-size=\"16\" font-weight=\"700\">FRONT LAWN</text>\n        <text x=\"138\" y=\"307\" text-anchor=\"middle\" fill=\"#52685a\" font-size=\"12\">Not in this example's service</text>\n        <path d=\"M26 353H374\" stroke=\"#c6d1d5\" stroke-width=\"8\"/><rect x=\"0\" y=\"368\" width=\"400\" height=\"24\" fill=\"#dce4e7\"/>\n        <text x=\"200\" y=\"384\" text-anchor=\"middle\" fill=\"#566c77\" font-size=\"12\" letter-spacing=\"3\">STREET</text>\n      </svg><p class=\"yard-example-note\">Illustration only—not to scale and not a measurement of your property.</p></figure>\n      <div class=\"yard-scope-note\"><strong>Need front or side areas scooped too?</strong><br>Add those service areas to your backyard total. Choose the total size, then select the areas below.</div>\n      <table><caption>Service area guide — choose the smallest size that fits</caption><thead><tr><th scope=\"col\">Yard size</th><th scope=\"col\">Square feet</th></tr></thead><tbody>${rows.map(function(row) { return `<tr${state.yardSize === row[0] ? ' class=\"yard-selected\"' : ''}><th scope=\"row\">${row[1]}${state.yardSize === row[0] ? ' · selected' : ''}</th><td>Up to ${row[2]}</td></tr>`; }).join(\"\")}</tbody></table>\n      <p><strong>A quick size example:</strong> a 50 ft × 100 ft service area is 5,000 sq ft, so it fits “Up to ⅛ acre.” For irregular areas, add the areas of smaller rectangles. Over 43,560 sq ft needs a custom estimate.</p>\n      <p>Still unsure? Use “Ask a question” after viewing your price so we can help confirm the serviced area.</p>\n    </div></details>`;\n  }\n\n  function cleanupHistoryField() {\n    return `<div class=\"field\"><label for=\"pp-last-cleaned\">When was the last full cleanup?</label><select class=\"select\" id=\"pp-last-cleaned\" data-field=\"lastCleaned\" aria-required=\"true\" aria-describedby=\"pp-last-cleaned-hint\"><option value=\"\">Choose an answer</option>${LAST_CLEANED_CHOICES.map(function (value) { return `<option value=\"${escapeHtml(value)}\"${selected(state.lastCleaned === value)}>${escapeHtml(value)}</option>`; }).join(\"\")}</select><small id=\"pp-last-cleaned-hint\">This helps us plan the first visit. It does not change the recurring maintenance quote.</small></div>`;\n  }\n\n  function dogChoiceHtml(dog) {\n    const active = String(state.dogCount) === String(dog);\n    const label = dog === 10 ? \"10+ dogs\" : dog + (dog === 1 ? \" dog\" : \" dogs\");\n    return `<button class=\"dog-choice\" type=\"button\" data-dog=\"${dog}\" aria-pressed=\"${active}\" aria-label=\"${active ? \"Selected \" : \"\"}${label}\">${iconHtml(dog === 10 ? \"dog-10plus\" : \"dog-\" + dog, \"dog-choice-art\")}<span class=\"dog-selected-marker\" aria-hidden=\"true\">${active ? iconHtml(\"service-check\", \"dog-selected-marker-icon\") : \"\"}</span><strong>${label}</strong></button>`;\n  }\n\n  function planRailHtml(preview, quote) {\n    const frequency = state.frequency && CONFIG.frequencies[state.frequency];\n    const yard = state.yardSize && CONFIG.yardSizes[state.yardSize];\n    const dogs = state.dogCount ? (Number(state.dogCount) >= 10 ? \"10+ dogs\" : state.dogCount + (Number(state.dogCount) === 1 ? \" dog\" : \" dogs\")) : \"Choose dog count\";\n    const areas = state.areas.length ? state.areas.map(function (id) { return CONFIG.areaLabels[id]; }).join(\", \") : \"Choose service area\";\n    return `<aside class=\"plan-rail\" aria-label=\"Live plan estimate\"><div class=\"plan-rail-head\"><span>Your plan</span><strong>Clear pricing as you build</strong></div><div class=\"plan-rail-body\"><div class=\"plan-rail-price\" aria-live=\"polite\"><strong>${quote.ok && !quote.custom ? money(quote.priceCents) + ' <small>' + priceUnit() + '</small>' : quote.ok && quote.custom ? \"Custom estimate\" : \"—\"}</strong><span>${escapeHtml(preview)}</span></div><div class=\"plan-rail-list\"><div class=\"plan-rail-row\"><span>Dogs</span><strong>${escapeHtml(dogs)}</strong></div><div class=\"plan-rail-row\"><span>Frequency</span><strong>${escapeHtml(frequency ? frequency.label : \"Choose frequency\")}</strong></div><div class=\"plan-rail-row\"><span>Yard</span><strong>${escapeHtml(yard ? yard.label : \"Choose yard size\")}</strong></div><div class=\"plan-rail-row\"><span>Areas</span><strong>${escapeHtml(areas)}</strong></div></div>${offerSummaryHtml(false)}<div class=\"plan-rail-benefits\"><div class=\"plan-rail-benefit\">${iconHtml(\"per-visit-price\")}<span>Pay per visit</span></div><div class=\"plan-rail-benefit\">${iconHtml(\"no-contract\")}<span>No contract</span></div></div><button class=\"btn primary\" type=\"button\" data-action=\"show-price\">${state.reviewEdit === \"plan\" ? \"Review updated plan\" : \"Review my price\"} ${iconHtml(\"next-arrow\", \"action-arrow-icon\")}</button></div></aside>`;\n  }\n\n  function renderPlan() {\n    const retainedFocus = focusKey();\n    const quote = currentQuote();\n    const preview = quote.ok && !quote.custom ? money(quote.priceCents) + \" \" + priceUnit() : quote.ok && quote.custom ? \"Custom estimate\" : \"Complete the choices above\";\n    stageElement.innerHTML = `${stageHeader(\"BUILD YOUR PLAN\", \"Make it your kind of clean.\", \"Choose your dogs, yard size and service schedule. Your estimate updates as you go.\", \"ZIP \" + state.zip)}\n      <div class=\"plan-layout\"><div class=\"plan-builder\">\n      <div class=\"field\"><span class=\"field-label\">How many dogs use the yard?</span><div class=\"dog-choice-grid\" id=\"pp-dogs\" role=\"group\" aria-label=\"How many dogs use the yard?\">${Array.from({ length: 4 }, function (_, index) { return dogChoiceHtml(index + 1); }).join(\"\")}</div><details class=\"more-dogs\"${Number(state.dogCount) > 4 ? \" open\" : \"\"}><summary>More dogs</summary><div class=\"dog-choice-grid dog-choice-grid-more\" role=\"group\" aria-label=\"Five or more dogs\">${Array.from({ length: 6 }, function (_, index) { return dogChoiceHtml(index + 5); }).join(\"\")}</div></details></div>\n      <div class=\"field\"><span class=\"field-label\">How often should we scoop?</span><div class=\"choice-grid\">${Object.keys(CONFIG.frequencies).map(function (id) { return frequencyChoice(id, CONFIG.frequencies[id]); }).join(\"\")}</div></div>\n      <div class=\"field\"><label for=\"pp-yard\">Serviced lawn size</label><select class=\"select\" id=\"pp-yard\" data-field=\"yardSize\" aria-describedby=\"pp-yard-hint\"><option value=\"\">Choose yard size</option>${Object.keys(CONFIG.yardSizes).map(function (id) { const yard = CONFIG.yardSizes[id]; return `<option value=\"${id}\"${selected(state.yardSize === id)}>${escapeHtml(yard.label)}${yard.custom ? \" · custom\" : \"\"}</option>`; }).join(\"\")}</select><small id=\"pp-yard-hint\">Count the outdoor area we will scoop, including any patio or concrete that needs service.</small></div>${yardGuideHtml()}\n      <div class=\"field\"><span class=\"field-label\">Which areas should we cover?</span><div class=\"choice-grid\">${Object.keys(CONFIG.areaLabels).map(function (id) { return areaChoice(id, CONFIG.areaLabels[id]); }).join(\"\")}<button class=\"choice\" type=\"button\" data-area=\"all\" aria-pressed=\"${state.areas.length === 3}\">${iconHtml(\"area-all\", \"choice-art\")}<span class=\"choice-check\">${state.areas.length === 3 ? selectedStatusHtml(true) : \"\"}</span><strong>Yard+ · all areas</strong><small>Back, front and side yard(s)</small></button></div></div>\n      <div class=\"field\"><label for=\"pp-customer-status\">Have you used Purge Pros before?</label><select class=\"select\" id=\"pp-customer-status\" data-field=\"customerStatus\"><option value=\"\">Choose an answer</option>${[[\"new\", \"No — I’m a new customer\"], [\"returning\", \"Yes — I’m returning or already a customer\"], [\"not_sure\", \"I’m not sure / new occupant\"]].map(function (item) { return `<option value=\"${item[0]}\"${selected(state.customerStatus === item[0])}>${item[1]}</option>`; }).join(\"\")}</select><small>Introductory offers are once per customer/household. Returning customers and new-occupant questions get a team review.</small></div>\n      </div>${planRailHtml(preview, quote)}</div>\n      <div class=\"error plan-error\" role=\"alert\" tabindex=\"-1\"></div>\n      <div class=\"plan-footer\"><div class=\"price-preview\" aria-live=\"polite\"><span>Your estimate</span><strong>${escapeHtml(preview)}</strong></div><div class=\"actions\"><button class=\"btn link\" type=\"button\" data-action=\"back\">${iconHtml(\"chevron\", \"action-chevron action-chevron-back\")} Back</button><button class=\"btn primary\" type=\"button\" data-action=\"show-price\">${state.reviewEdit === \"plan\" ? \"Review updated plan \" + iconHtml(\"next-arrow\", \"action-arrow-icon\") + \" \" : \"Review price \" + iconHtml(\"next-arrow\", \"action-arrow-icon\") + \" \"}</button></div></div>`;\n    restoreControlFocus(retainedFocus);\n  }\n\n  function reasonText(code) {\n    return ({ CUSTOM_BOOKING_SELECTED: \"custom booking selected\", DOG_COUNT_10_PLUS: \"10+ dogs\", YARD_OVER_ONE_ACRE: \"over one acre\" })[code] || \"manual review required\";\n  }\n\n  function planSummaryRows(includePrice) {\n    const quote = currentQuote();\n    const rows = [\n      [\"Frequency\", CONFIG.frequencies[state.frequency].label],\n      [\"Dogs\", Number(state.dogCount) >= 10 ? \"10+ dogs\" : state.dogCount + (Number(state.dogCount) === 1 ? \" dog\" : \" dogs\")],\n      [\"Service area\", state.areas.map(function (id) { return CONFIG.areaLabels[id]; }).join(\", \")],\n      [\"Yard size\", CONFIG.yardSizes[state.yardSize].label]\n    ];\n    if (includePrice) rows.push([\"Scoop price\", quote.custom ? \"Custom estimate\" : money(quote.priceCents) + \" \" + priceUnit()]);\n    return rows.map(function (row) { return `<div class=\"summary-row\"><span>${escapeHtml(row[0])}</span><strong>${escapeHtml(row[1])}</strong></div>`; }).join(\"\");\n  }\n\n  function pricePlanSummaryHtml() {\n    return `<section class=\"summary-card price-plan\" aria-label=\"Your selected plan\"><h3>Your selected plan</h3>${planSummaryRows(false)}</section>`;\n  }\n\n  function renderPriceWithoutResume() {\n    const quote = currentQuote();\n    if (!quote.ok) return goTo(2);\n    if (quote.custom) {\n      stageElement.innerHTML = `${stageHeader(\"PERSONALIZED REVIEW\", \"Get a custom estimate.\", \"Tell us about the yard. Our local team will confirm the scope, availability and price before you approve service.\", \"Personal follow-up\")}\n        ${pricePlanSummaryHtml()}${offerSummaryHtml(false)}<div class=\"notice orange\"><strong>Why:</strong> ${quote.reasons.map(reasonText).join(\" · \")}</div><div class=\"info-list\"><div class=\"info-item\"><span class=\"info-icon info-icon-number\">1</span><span><strong>Send the yard details.</strong> It takes about one more minute.</span></div><div class=\"info-item\"><span class=\"info-icon info-icon-number\">2</span><span><strong>We review the scope and availability.</strong> Our team prepares the estimate.</span></div><div class=\"info-item\"><span class=\"info-icon info-icon-number\">3</span><span><strong>You decide.</strong> Nothing is charged or scheduled by this form.</span></div></div><div class=\"actions\"><button class=\"btn link\" type=\"button\" data-action=\"back\">${iconHtml(\"chevron\", \"action-chevron action-chevron-back\")} Change plan</button><button class=\"btn primary\" type=\"button\" data-action=\"choose-intent\" data-intent=\"service_request\">Request my estimate ${iconHtml(\"next-arrow\", \"action-arrow-icon\")} </button></div>`;\n      return;\n    }\n    stageElement.innerHTML = `${stageHeader(\"REVIEW YOUR PRICE\", \"Here’s your per-visit price.\", \"Review your selected plan, then request service, save the quote or ask us a question.\", \"Upfront price\")}\n      <div class=\"price-plan-grid\"><div class=\"price-hero\"><div class=\"price-hero-top\">${iconHtml(\"per-visit-price\", \"price-hero-art\")}<div><div class=\"price-label\">${state.frequency === \"onetime\" ? \"One-time cleanup\" : CONFIG.frequencies[state.frequency].label + \" scoop service\"}</div><div class=\"price\">${money(quote.priceCents)} <small>${priceUnit()}</small></div></div></div><p>${escapeHtml(quote.disclaimer)}</p></div>\n      ${pricePlanSummaryHtml()}</div>\n      <div class=\"line-items\">${quote.lineItems.map(function (item) { return `<div class=\"line-item\"><span>${escapeHtml(item.label)}</span><strong>${money(item.cents)}</strong></div>`; }).join(\"\")}</div>\n      ${offerSummaryHtml(true)}\n      <div class=\"info-list\"><div class=\"info-item\">${iconHtml(\"waste-bag\", \"info-icon\")}<span>Waste hauled away and equipment sanitized</span></div><div class=\"info-item\">${iconHtml(\"deodorize\", \"info-icon\")}<span>No long-term contract · pay per visit</span></div><div class=\"info-item\">${iconHtml(\"service-calendar\", \"info-icon\")}<span>${state.frequency === \"onetime\" ? \"Cleanup date\" : \"Regular service day\"} confirmed before secure payment setup</span></div></div>\n      <div class=\"actions\"><button class=\"btn link\" type=\"button\" data-action=\"back\">${iconHtml(\"chevron\", \"action-chevron action-chevron-back\")} Change plan</button><button class=\"btn\" type=\"button\" data-action=\"choose-intent\" data-intent=\"question\">Ask a question</button><button class=\"btn\" type=\"button\" data-action=\"choose-intent\" data-intent=\"quote_delivery\">Send me this quote</button><button class=\"btn primary\" type=\"button\" data-action=\"choose-intent\" data-intent=\"service_request\">Request service ${iconHtml(\"next-arrow\", \"action-arrow-icon\")} </button></div>`;\n  }\n\n  function intentCopy() {\n    if (state.intent === \"quote_delivery\") return { eyebrow: \"SAVE YOUR QUOTE\", title: \"Where should we send it?\", body: \"Choose how you would like us to send your plan and price.\", badge: \"Save your quote\" };\n    if (state.intent === \"question\") return { eyebrow: \"ASK PURGE PROS\", title: \"What can we help with?\", body: \"Your plan travels with the question, so you do not have to repeat the yard details.\", badge: \"Personal response\" };\n    if (state.frequency === \"onetime\") return { eyebrow: \"REQUEST CLEANUP\", title: \"Tell us where the yard is.\", body: \"We will review the cleanup details and follow up with availability. Nothing is charged today.\", badge: \"About 1 minute\" };\n    return { eyebrow: \"REQUEST SERVICE\", title: \"Tell us where the yard is.\", body: \"We will confirm the best recurring service day for your area. Nothing is charged today.\", badge: \"About 1 minute\" };\n  }\n\n  function renderDetails() {\n    const retainedFocus = focusKey();\n    const copy = intentCopy();\n    const service = state.intent === \"service_request\";\n    const question = state.intent === \"question\";\n    const allowCall = state.intent !== \"quote_delivery\";\n    stageElement.innerHTML = `${stageHeader(copy.eyebrow, copy.title, copy.body, copy.badge)}\n      ${offerSummaryHtml(false)}\n      <div class=\"field-row\"><div class=\"field\"><label for=\"pp-first\">First name</label><input class=\"input\" id=\"pp-first\" data-field=\"firstName\" autocomplete=\"given-name\" maxlength=\"80\" value=\"${escapeHtml(state.firstName)}\"></div>${service ? `<div class=\"field\"><label for=\"pp-last\">Last name</label><input class=\"input\" id=\"pp-last\" data-field=\"lastName\" autocomplete=\"family-name\" maxlength=\"80\" value=\"${escapeHtml(state.lastName)}\"></div>` : \"\"}</div>\n      <div class=\"field-row\"><div class=\"field\"><label for=\"pp-phone\">Phone number${!service && state.preferredContact === \"email\" ? \" (optional)\" : \"\"}</label><input class=\"input\" id=\"pp-phone\" aria-required=\"${service || state.preferredContact !== \"email\"}\" data-field=\"phone\" type=\"tel\" autocomplete=\"tel\" inputmode=\"numeric\" maxlength=\"14\" pattern=\"[0-9() -]*\" placeholder=\"(317) 555-0123\" value=\"${escapeHtml(state.phone)}\"><small>${service ? \"Required for your service record. Providing a number does not opt you into texts.\" : \"10-digit U.S. number. Optional when receiving a quote or answer by email.\"}</small></div><div class=\"field\"><label for=\"pp-email\">Email${state.preferredContact === \"email\" ? \"\" : \" (optional)\"}</label><input class=\"input\" id=\"pp-email\" data-field=\"email\" type=\"email\" autocomplete=\"email\" maxlength=\"254\" placeholder=\"you@example.com\" value=\"${escapeHtml(state.email)}\"></div></div>\n      <div class=\"field\"><span class=\"field-label\">Best way to reply</span><div class=\"radio-grid\"><label class=\"radio-card\"><input type=\"radio\" name=\"pp-preferred\" value=\"text\"${checked(state.preferredContact === \"text\")}><span>Text message</span></label><label class=\"radio-card\"><input type=\"radio\" name=\"pp-preferred\" value=\"email\"${checked(state.preferredContact === \"email\")}><span>Email</span></label>${allowCall ? `<label class=\"radio-card\"><input type=\"radio\" name=\"pp-preferred\" value=\"call\"${checked(state.preferredContact === \"call\")}><span>Phone call</span></label>` : \"\"}</div></div>\n      ${state.preferredContact === \"text\" ? `<label class=\"check\" for=\"pp-sms-consent\"><input id=\"pp-sms-consent\" type=\"checkbox\"${checked(state.smsConsent)}><span><strong>Text me about my quote and service.</strong> I consent to receive non-marketing text messages from Purge Pros about my quote, availability, scheduling, service and account at the number provided. Message frequency varies. Message and data rates may apply. Text HELP for assistance; reply STOP to opt out.</span></label>` : \"\"}\n      <p class=\"help\">You may choose Email${allowCall ? \" or Phone Call\" : \"\"} instead of consenting to SMS. Review our <a href=\"${CONFIG.brand.privacyUrl}\" target=\"_blank\" rel=\"noopener\">Privacy Policy</a> and <a href=\"${CONFIG.brand.termsUrl}\" target=\"_blank\" rel=\"noopener\">Terms &amp; Conditions</a>.</p>\n      ${service ? `<div class=\"field-row\"><div class=\"field\"><label for=\"pp-address\">Service street address</label><input class=\"input\" id=\"pp-address\" data-field=\"address\" autocomplete=\"address-line1\" maxlength=\"120\" value=\"${escapeHtml(state.address)}\"></div><div class=\"field\"><label for=\"pp-city\">City</label><input class=\"input\" id=\"pp-city\" data-field=\"city\" autocomplete=\"address-level2\" maxlength=\"80\" value=\"${escapeHtml(state.city)}\"></div></div><div class=\"field\"><label for=\"pp-start\">When would you like to start?</label><select class=\"select\" id=\"pp-start\" data-field=\"startTiming\"><option value=\"\">Choose timing</option>${[\"As soon as possible\", \"Within the next week\", \"In the next few weeks\", \"Just researching for now\"].map(function (value) { return `<option value=\"${escapeHtml(value)}\"${selected(state.startTiming === value)}>${escapeHtml(value)}</option>`; }).join(\"\")}</select></div>` : \"\"}\n      ${cleanupHistoryField()}\n      ${question ? `<div class=\"field\"><label for=\"pp-question\">Your question</label><textarea class=\"textarea\" id=\"pp-question\" data-field=\"question\" maxlength=\"1500\" placeholder=\"What would you like to know?\">${escapeHtml(state.question)}</textarea></div>` : \"\"}\n      <div class=\"error\" role=\"alert\" tabindex=\"-1\"></div><div class=\"actions\"><button class=\"btn link\" type=\"button\" data-action=\"back\">${iconHtml(\"chevron\", \"action-chevron action-chevron-back\")} Back</button><button class=\"btn primary\" type=\"button\" data-action=\"review\">${state.reviewEdit ? \"Review changes \" + iconHtml(\"next-arrow\", \"action-arrow-icon\") + \" \" : \"Review request \" + iconHtml(\"next-arrow\", \"action-arrow-icon\") + \" \"}</button></div>`;\n    restoreControlFocus(retainedFocus);\n  }\n\n  function renderReview() {\n    const quote = currentQuote();\n    const service = state.intent === \"service_request\";\n    const oneTime = state.frequency === \"onetime\";\n    const title = service ? (quote.custom ? \"Review your estimate request.\" : \"Review your service request.\") : state.intent === \"quote_delivery\" ? \"Review your quote delivery.\" : \"Review your question.\";\n    stageElement.innerHTML = `${stageHeader(\"ONE LAST LOOK\", title, \"Confirm the details below. We will not schedule service or collect payment from this submission.\", \"Nothing charged\")}\n      <div class=\"summary\"><section class=\"summary-card\"><div class=\"summary-heading\"><h3>Plan</h3><button class=\"summary-edit\" type=\"button\" data-action=\"edit-plan\"${state.submitting || state.submissionReviewMessage ? \" disabled\" : \"\"}>Edit plan</button></div>${planSummaryRows(true)}</section>\n      <section class=\"summary-card\"><div class=\"summary-heading\"><h3>Contact &amp; details</h3><button class=\"summary-edit\" type=\"button\" data-action=\"edit-contact\"${state.submitting || state.submissionReviewMessage ? \" disabled\" : \"\"}>Edit contact</button></div><div class=\"summary-row\"><span>Name</span><strong>${escapeHtml((state.firstName + \" \" + state.lastName).trim())}</strong></div><div class=\"summary-row\"><span>Reply by</span><strong>${escapeHtml(state.preferredContact === \"call\" ? \"Phone call\" : state.preferredContact)}</strong></div>${state.phone ? `<div class=\"summary-row\"><span>Phone</span><strong>${escapeHtml(state.phone)}</strong></div>` : \"\"}${state.email ? `<div class=\"summary-row\"><span>Email</span><strong>${escapeHtml(state.email)}</strong></div>` : \"\"}${service ? `<div class=\"summary-row\"><span>Service address</span><strong>${escapeHtml(state.address + \", \" + state.city + \", IN \" + state.zip)}</strong></div>` : \"\"}<div class=\"summary-row\"><span>Last full cleanup</span><strong>${escapeHtml(state.lastCleaned)}</strong></div></section></div>\n      ${offerSummaryHtml(true)}\n      ${service ? `<label class=\"check\" for=\"pp-terms\"><input id=\"pp-terms\" type=\"checkbox\"${checked(state.termsAccepted)}><span>I agree to the <a href=\"${CONFIG.brand.termsUrl}\" target=\"_blank\" rel=\"noopener\">Terms of Service</a> and acknowledge the <a href=\"${CONFIG.brand.privacyUrl}\" target=\"_blank\" rel=\"noopener\">Privacy Policy</a>. I understand this is a request for ${oneTime ? \"cleanup availability\" : \"service-day review\"}, not a confirmed appointment.</span></label>` : `<p class=\"help\">By submitting, you acknowledge the <a href=\"${CONFIG.brand.privacyUrl}\" target=\"_blank\" rel=\"noopener\">Privacy Policy</a>.</p>`}\n      ${state.submissionReviewMessage ? `<div class=\"notice orange\" role=\"alert\">${escapeHtml(state.submissionReviewMessage)} <a href=\"${CONFIG.brand.phoneHref}\">Call Purge Pros</a></div>` : \"\"}\n      <div class=\"error\" role=\"alert\" tabindex=\"-1\"></div><div class=\"actions\"><button class=\"btn primary\" type=\"button\" data-action=\"submit\"${state.submitting || state.submissionReviewMessage ? \" disabled\" : \"\"}>${state.submitting ? '<span class=\"spinner\" aria-hidden=\"true\"></span>Sending…' : state.submissionReviewMessage ? \"Please call to confirm\" : submitLabel(quote)}</button></div>`;\n    syncSubmittingUi();\n  }\n\n  function submitLabel(quote) {\n    if (state.intent === \"quote_delivery\") return \"Send my quote \" + iconHtml(\"next-arrow\", \"action-arrow-icon\") + \" \";\n    if (state.intent === \"question\") return \"Send my question \" + iconHtml(\"next-arrow\", \"action-arrow-icon\") + \" \";\n    return (quote.custom ? \"Request my estimate \" : \"Request my service day \") + iconHtml(\"next-arrow\", \"action-arrow-icon\") + \" \";\n  }\n\n  function renderComplete() {\n    const service = state.intent === \"service_request\";\n    const quote = currentQuote();\n    const oneTime = state.frequency === \"onetime\";\n    const serviceBody = oneTime\n      ? \"Our team will review the cleanup details and reply with availability using your selected contact method. Nothing has been scheduled or charged.\"\n      : \"Our team will confirm the best recurring service day for your area and reply using your selected contact method. Your service is not scheduled until you approve the proposed day.\";\n    const nextSteps = oneTime\n      ? `<div class=\"info-list\"><div class=\"info-item\">${iconHtml(\"scoop\", \"info-icon\")}<span>We review the cleanup details and current availability.</span></div><div class=\"info-item\">${iconHtml(\"visit-message\", \"info-icon\")}<span>We confirm the cleanup plan and timing with you.</span></div><div class=\"info-item\">${iconHtml(\"secure-payment\", \"info-icon\")}<span>Then we send the secure payment setup request.</span></div></div>`\n      : `<div class=\"info-list\"><div class=\"info-item\">${iconHtml(\"service-calendar\", \"info-icon\")}<span>We confirm the best recurring service day for your area.</span></div><div class=\"info-item\">${iconHtml(\"visit-message\", \"info-icon\")}<span>You approve the proposed service day.</span></div><div class=\"info-item\">${iconHtml(\"secure-payment\", \"info-icon\")}<span>Then we send a secure payment setup request.</span></div></div>`;\n    stageElement.innerHTML = `<div class=\"complete\"><div class=\"success-mark\" aria-hidden=\"true\">${iconHtml(\"service-check\", \"success-mark-icon\")}</div>${stageHeader(\"RECEIVED\", service ? \"Your request is with Purge Pros.\" : state.intent === \"quote_delivery\" ? \"Your quote request is in.\" : \"Your question is in.\", service ? serviceBody : \"We will follow up using the reply method you selected.\", \"Successfully sent\")}\n      ${offerSummaryHtml(true)}\n      <div class=\"summary-card\"><h3>What happens next</h3>${service ? nextSteps : `<p class=\"help\">Keep an eye on ${state.preferredContact === \"email\" ? \"your inbox\" : state.preferredContact === \"call\" ? \"your phone\" : \"your text messages\"}. Questions? Call <a href=\"${CONFIG.brand.phoneHref}\">${CONFIG.brand.phoneDisplay}</a>.</p>`}<div class=\"summary-row\"><span>Your price</span><strong>${quote.custom ? \"Custom estimate\" : money(quote.priceCents) + \" \" + priceUnit()}</strong></div><p class=\"request-id\">Reference: ${escapeHtml(state.receipt && state.receipt.requestId || \"received\")}</p></div><div class=\"actions\"><button class=\"btn blue\" type=\"button\" data-action=\"close\">Done</button></div></div>`;\n  }\n\n  function render() {\n    if (!stageElement) return;\n    if (resumeLoading) { stageElement.innerHTML = `<div role=\"status\" aria-live=\"polite\"><h2 id=\"pp-stage-title\">Opening your saved plan…</h2><p>Checking today’s coverage and prices.</p></div>`; return; }\n    renderProgress();\n    if (state.step === 1) renderArea();\n    if (state.step === 2) renderPlan();\n    if (state.step === 3) renderPrice();\n    if (state.step === 4) renderDetails();\n    if (state.step === 5) renderReview();\n    if (state.step === 6) renderComplete();\n    renderPlanResumeNotice();\n    syncSubmittingUi();\n  }\n\n  function showOffer() {\n    const layer = shadow && shadow.querySelector(\"[data-offer-layer]\");\n    if (!layer) return;\n    offerPreviousFocus = shadow.activeElement;\n    layer.hidden = false;\n    const closeButton = layer.querySelector('[data-action=\"close-offer\"]');\n    if (closeButton) closeButton.focus();\n    isolateQuoteOffer(layer);\n    track(\"promotion_details_viewed\", { promotion: CONFIG.promotion.title });\n  }\n\n  function closeOffer() {\n    const layer = shadow && shadow.querySelector(\"[data-offer-layer]\");\n    if (!layer || layer.hidden) return false;\n    layer.hidden = true;\n    restoreQuoteInert(offerInertRecords);\n    if (offerPreviousFocus && offerPreviousFocus.isConnected && !offerPreviousFocus.disabled && !offerPreviousFocus.closest(\"[inert], [hidden]\")) offerPreviousFocus.focus();\n    else focusQuoteStage();\n    offerPreviousFocus = null;\n    return true;\n  }\n\n  function goTo(step) {\n    state.step = step;\n    render();\n    const quoteSide = shadow.querySelector(\".quote-side\");\n    if (quoteSide) quoteSide.scrollTop = 0;\n    queueMicrotask(function () { if (stageElement) stageElement.focus({ preventScroll: true }); });\n    track(\"funnel_step_viewed\", { step: step });\n  }\n\n  function showError(messages) {\n    const box = stageElement.querySelector(\".error\");\n    if (!box) return;\n    stageElement.querySelectorAll(\".field-error\").forEach(el => el.remove());\n    stageElement.querySelectorAll('[aria-invalid=\"true\"]').forEach(el => { el.removeAttribute(\"aria-invalid\"); el.removeAttribute(\"aria-errormessage\"); });\n    const list = Array.isArray(messages) ? messages : [messages];\n    const fields = [[/used Purge Pros before/, \"#pp-customer-status\"], [/ZIP code/, \"#pp-zip\"], [/^Choose the number of dogs/i, \"#pp-dogs\"], [/yard size|yard-size/i, \"#pp-yard\"], [/service frequency|Custom booking|available service frequency/i, \"[data-frequency]\"], [/service area/i, \"[data-area]\"], [/last fully cleaned/, \"#pp-last-cleaned\"], [/first name/, \"#pp-first\"], [/last name/, \"#pp-last\"], [/phone number/, \"#pp-phone\"], [/email address/, \"#pp-email\"], [/service-text permission/, \"#pp-sms-consent\"], [/street address/, \"#pp-address\"], [/service city/, \"#pp-city\"], [/like to start/, \"#pp-start\"], [/your question/, \"#pp-question\"], [/Terms|terms/, \"#pp-terms\"]];\n    box.innerHTML = `<strong>Please check the following:</strong><ul>${list.map(function(message, index) {\n      const match = fields.find(row => row[0].test(message));\n      const el = match && stageElement.querySelector(match[1]);\n      if (!el) return `<li>${escapeHtml(message)}</li>`;\n      const id = \"pp-field-error-\" + index;\n      el.setAttribute(\"aria-invalid\", \"true\"); el.setAttribute(\"aria-errormessage\", id);\n      if (!el.id) el.id = \"pp-invalid-control-\" + index;\n      const note = document.createElement(\"p\"); note.className = \"field-error\"; note.id = id; note.textContent = message;\n      const group = el.closest(\".field\") || el.closest(\".check\") || el;\n      if (group === el && !el.closest(\".field, .check\")) group.insertAdjacentElement(\"afterend\", note); else group.appendChild(note);\n      return `<li><button type=\"button\" class=\"error-jump\" data-error-target=\"${escapeHtml(el.id)}\">${escapeHtml(message)}</button></li>`;\n    }).join(\"\")}</ul>`;\n    box.classList.add(\"show\"); box.focus();\n  }\n\n  function validatePlan() {\n    const quote = currentQuote();\n    const errors = quote.errors ? quote.errors.slice() : [];\n    if (![\"new\", \"returning\", \"not_sure\"].includes(state.customerStatus)) errors.push(\"Choose whether you have used Purge Pros before.\");\n    return errors;\n  }\n\n  function validateDetails() {\n    const errors = [];\n    const service = state.intent === \"service_request\";\n    if (!LAST_CLEANED_CHOICES.includes(state.lastCleaned)) errors.push(\"Choose when the yard was last fully cleaned.\");\n    if (!state.firstName.trim()) errors.push(\"Enter your first name.\");\n    if (service && !state.lastName.trim()) errors.push(\"Enter your last name.\");\n    if ((service || state.preferredContact !== \"email\" || state.phone.trim()) && !normalizePhone(state.phone)) errors.push(\"Enter a valid 10-digit phone number.\");\n    if ((state.preferredContact === \"email\" || state.email.trim()) && !validEmail(state.email)) errors.push(\"Enter a valid email address.\");\n    if (state.preferredContact === \"text\" && !state.smsConsent) errors.push(state.intent === \"quote_delivery\" ? \"To choose Text, select the service-text permission or choose Email.\" : \"To choose Text, select the service-text permission or choose Email/Phone call.\");\n    if (service && !state.address.trim()) errors.push(\"Enter the service street address.\");\n    if (service && !state.city.trim()) errors.push(\"Enter the service city.\");\n    if (service && !state.startTiming) errors.push(\"Choose when you would like to start.\");\n    if (state.intent === \"question\" && state.question.trim().length < 5) errors.push(\"Enter your question.\");\n    return errors;\n  }\n\n  function requestId() {\n    if (window.crypto && typeof window.crypto.randomUUID === \"function\") return window.crypto.randomUUID();\n    return \"pp-\" + Date.now() + \"-\" + Math.random().toString(36).slice(2, 10);\n  }\n\n  function buildPayload() {\n    const quote = currentQuote();\n    const phone = normalizePhone(state.phone);\n    const id = requestId();\n    let stage = \"service_requested\";\n    let question = state.question.trim();\n    if (state.intent === \"question\") stage = \"question_submitted\";\n    if (state.intent === \"quote_delivery\") {\n      stage = \"quote_requested\";\n      question = \"Quote delivery requested by \" + state.preferredContact + \".\";\n    }\n    if (state.intent === \"service_request\" && quote.custom) stage = \"estimate_requested\";\n    return {\n      schemaVersion: \"cloudflare-widget.v3\",\n      requestId: id,\n      eventId: id + \":\" + stage,\n      stage: stage,\n      intent: state.intent,\n      zip: state.zip,\n      dogs: String(state.dogCount),\n      frequency: CONFIG.frequencies[state.frequency].label,\n      frequencyId: state.frequency,\n      areas: state.areas.map(function (id) { return CONFIG.areaLabels[id]; }).join(\" & \"),\n      areaIds: state.areas,\n      yardSize: CONFIG.yardSizes[state.yardSize].label,\n      yardSizeId: state.yardSize,\n      lastCleaned: state.lastCleaned,\n      customerStatus: state.customerStatus,\n      startTiming: state.startTiming,\n      perVisitPrice: quote.custom ? \"\" : (quote.priceCents / 100).toFixed(2),\n      clientPriceCents: quote.custom ? null : quote.priceCents,\n      pricingVersion: quote.pricingVersion,\n      customEstimate: Boolean(quote.custom),\n      customReasons: quote.reasons || [],\n      phone: phone ? phone.digits : \"\",\n      phoneE164: phone ? phone.e164 : \"\",\n      firstName: state.firstName.trim(),\n      lastName: state.lastName.trim(),\n      email: state.email.trim().toLowerCase(),\n      street: state.address.trim(),\n      city: state.city.trim(),\n      state: \"IN\",\n      preferredContact: state.preferredContact,\n      smsTransactionalConsent: state.smsConsent,\n      consent: state.smsConsent ? \"yes\" : \"no\",\n      consentVersion: state.smsConsent ? CONFIG.consentVersion : \"\",\n      smsConsentCapturedAt: state.smsConsent ? state.smsConsentCapturedAt || new Date().toISOString() : \"\",\n      termsAccepted: state.intent === \"service_request\" ? state.termsAccepted : false,\n      termsVersion: state.intent === \"service_request\" ? CONFIG.termsVersion : \"\",\n      termsAcceptedAt: state.intent === \"service_request\" && state.termsAccepted ? state.termsAcceptedAt || new Date().toISOString() : \"\",\n      question: question,\n      notes: state.intent === \"service_request\" ? \"Submitted through transparent-price Cloudflare widget.\" : \"\",\n      page: location.href.slice(0, 1000),\n      attribution: state.attribution,\n      gclid: state.attribution.gclid || \"\",\n      fbclid: state.attribution.fbclid || \"\",\n      fbp: cookieValue(\"_fbp\"),\n      fbc: cookieValue(\"_fbc\") || (state.attribution.fbclid ? \"fb.1.\" + Date.now() + \".\" + state.attribution.fbclid : \"\"),\n      submittedAt: new Date().toISOString(),\n      website: \"\"\n    };\n  }\n\n  function submissionFingerprint(payload) {\n    // Compare the normalized request, not retry-time cookies or timestamps.\n    // Attribution and consent evidence remain exactly as first submitted.\n    const materialFields = [\n      \"schemaVersion\", \"stage\", \"intent\", \"zip\", \"dogs\", \"frequencyId\",\n      \"areaIds\", \"yardSizeId\", \"lastCleaned\", \"customerStatus\", \"startTiming\",\n      \"clientPriceCents\", \"pricingVersion\", \"customEstimate\", \"customReasons\",\n      \"phone\", \"firstName\", \"lastName\", \"email\", \"street\", \"city\", \"state\",\n      \"preferredContact\", \"smsTransactionalConsent\", \"consentVersion\",\n      \"termsAccepted\", \"termsVersion\", \"question\", \"notes\"\n    ];\n    return JSON.stringify(materialFields.map(function (field) {\n      const value = payload[field];\n      return (field === \"areaIds\" || field === \"customReasons\") && Array.isArray(value)\n        ? value.slice().sort() : value;\n    }));\n  }\n\n  function payloadForSubmission() {\n    const candidate = buildPayload();\n    const fingerprint = submissionFingerprint(candidate);\n    if (state.pendingSubmission && state.pendingSubmission.fingerprint === fingerprint) {\n      return state.pendingSubmission.payload;\n    }\n    // Memory only: a reload starts a new request. Never persist contact details.\n    state.pendingSubmission = { fingerprint: fingerprint, payload: JSON.parse(JSON.stringify(candidate)) };\n    return state.pendingSubmission.payload;\n  }\n\n  async function submit() {\n    if (state.submitting) return;\n    if (state.submissionReviewMessage) return showError(state.submissionReviewMessage);\n    if (state.intent === \"service_request\" && !state.termsAccepted) return showError(\"Agree to the Terms of Service and acknowledge the Privacy Policy before submitting.\");\n    const detailErrors = validateDetails();\n    if (detailErrors.length) return showError(detailErrors);\n    const payload = payloadForSubmission();\n    state.submitting = true;\n    renderReview();\n    focusSendingStatus();\n    try {\n      let body = { accepted: true, requestId: payload.requestId };\n      if (CONFIG.leadEndpoint) {\n        const controller = new AbortController();\n        const timeout = window.setTimeout(function () { controller.abort(); }, 15000);\n        let response, text;\n        try {\n          response = await fetch(CONFIG.leadEndpoint, {\n            method: \"POST\",\n            headers: { \"Content-Type\": \"application/json\" },\n            body: JSON.stringify(payload),\n            credentials: \"omit\",\n            signal: controller.signal\n          });\n          text = await response.text();\n        } finally {\n          window.clearTimeout(timeout);\n        }\n        if (text) {\n          try { body = JSON.parse(text); } catch (_) { body = { accepted: response.ok, requestId: payload.requestId }; }\n        }\n        if (body.code === \"SUBMISSION_UNCERTAIN\" || body.code === \"REQUEST_ID_CONFLICT\") {\n          state.submissionReviewMessage = body.message || \"Please call Purge Pros to confirm your request before submitting again.\";\n          throw new Error(state.submissionReviewMessage);\n        }\n        if (!response.ok || body.accepted === false) throw new Error(body.message || \"We could not save your request. Please try again.\");\n      } else {\n        console.info(\"Purge Pros demo submission\", payload);\n      }\n      state.receipt = { requestId: body.requestId || payload.requestId };\n      trackSuccess(payload, state.receipt.requestId);\n      clearLowRiskProgress();\n      state.submitting = false;\n      goTo(6);\n      state.pendingSubmission = null;\n    } catch (error) {\n      state.submitting = false;\n      renderReview();\n      const message = error && error.name === \"AbortError\"\n        ? \"This is taking longer than expected. Please try again or call \" + CONFIG.brand.phoneDisplay + \".\"\n        : error && error.message || \"We could not send this request. Please try again or call \" + CONFIG.brand.phoneDisplay + \".\";\n      if (!state.submissionReviewMessage) showError(message);\n      else focusQuoteStage();\n    }\n  }\n\n  function handleInput(event) {\n    if (state.submitting) return;\n    const target = event.target;\n    if (target.id === \"pp-zip\") {\n      state.zip = normalizeZip(target.value);\n      target.value = state.zip;\n      state.zipIneligible = false;\n      target.removeAttribute(\"aria-invalid\");\n      return;\n    }\n    if (target.id === \"pp-phone\") {\n      const formatted = formatPhone(target.value);\n      target.value = formatted;\n      state.phone = formatted;\n      return;\n    }\n    const field = target.dataset && target.dataset.field;\n    if (field) state[field] = target.value;\n  }\n\n  function handleChange(event) {\n    if (state.submitting) return;\n    const target = event.target;\n    const field = target.dataset && target.dataset.field;\n    if (field) state[field] = target.value;\n    if (target.name === \"pp-preferred\") {\n      state.preferredContact = target.value;\n      if (state.preferredContact !== \"text\") {\n        state.smsConsent = false;\n        state.smsConsentCapturedAt = \"\";\n      }\n      renderDetails();\n      return;\n    }\n    if (target.id === \"pp-sms-consent\") {\n      state.smsConsent = target.checked;\n      state.smsConsentCapturedAt = target.checked ? new Date().toISOString() : \"\";\n    }\n    if (target.id === \"pp-terms\") {\n      state.termsAccepted = target.checked;\n      state.termsAcceptedAt = target.checked ? new Date().toISOString() : \"\";\n    }\n    if (field === \"lastCleaned\") saveLowRiskProgress();\n    if (field && state.step === 2) {\n      if (field === \"yardSize\") track(\"yard_size_selected\", { yard_size: state.yardSize });\n      if (field === \"dogCount\" || field === \"yardSize\") reconcileFrequencySelection();\n      saveLowRiskProgress();\n      renderPlan();\n    }\n  }\n\n  function handleClick(event) {\n    if (state.submitting) return;\n    const errorLink = event.target.closest(\"[data-error-target]\");\n    if (errorLink) { const target = shadow.getElementById(errorLink.dataset.errorTarget); if (target) target.focus(); return; }\n    const dogButton = event.target.closest(\"[data-dog]\");\n    if (dogButton) {\n      state.dogCount = dogButton.dataset.dog;\n      track(\"dog_count_selected\", { dogs: Number(state.dogCount) });\n      reconcileFrequencySelection();\n      saveLowRiskProgress();\n      renderPlan();\n      return;\n    }\n    const frequencyButton = event.target.closest(\"[data-frequency]\");\n    if (frequencyButton) {\n      state.frequency = frequencyButton.dataset.frequency;\n      saveLowRiskProgress();\n      renderPlan();\n      return;\n    }\n    const areaButton = event.target.closest(\"[data-area]\");\n    if (areaButton) {\n      const id = areaButton.dataset.area;\n      if (id === \"all\") state.areas = state.areas.length === 3 ? [] : Object.keys(CONFIG.areaLabels);\n      else state.areas = state.areas.indexOf(id) >= 0 ? state.areas.filter(function (item) { return item !== id; }) : state.areas.concat(id);\n      saveLowRiskProgress();\n      renderPlan();\n      return;\n    }\n    const button = event.target.closest(\"[data-action]\");\n    if (!button) {\n      if (event.target.matches(\"[data-offer-layer]\")) return closeOffer();\n      if (event.target.matches(\"[data-backdrop]\")) close();\n      return;\n    }\n    const action = button.dataset.action;\n    if (action === \"save-plan-link\") return savePlanResumeLink();\n    if (action === \"show-offer\") return showOffer();\n    if (action === \"close-offer\") return closeOffer();\n    if (action === \"close\") return close();\n    if (action === \"edit-plan\" || action === \"edit-contact\") {\n      if (state.step !== 5 || state.submitting || state.submissionReviewMessage) return;\n      state.reviewEdit = action === \"edit-plan\" ? \"plan\" : \"contact\";\n      // The final review must acknowledge the current request after any edit.\n      // Contact fields and SMS permission remain in memory as before.\n      state.termsAccepted = false;\n      state.termsAcceptedAt = \"\";\n      return goTo(state.reviewEdit === \"plan\" ? 2 : 4);\n    }\n    if (action === \"check-zip\") {\n      state.zip = normalizeZip(stageElement.querySelector(\"#pp-zip\").value);\n      if (state.zip.length !== 5) return showError(\"Enter a valid 5-digit ZIP code.\");\n      if (CONFIG.serviceZips.indexOf(state.zip) < 0) {\n        state.zipIneligible = true;\n        track(\"service_area_ineligible\", { zip_prefix: state.zip.slice(0, 3) });\n        return renderArea();\n      }\n      state.zipIneligible = false;\n      saveLowRiskProgress();\n      track(\"service_area_eligible\", { zip_prefix: state.zip.slice(0, 3) });\n      return goTo(2);\n    }\n    if (action === \"show-price\") {\n      const errors = validatePlan();\n      if (errors.length) return showError(errors);\n      saveLowRiskProgress();\n      const quote = currentQuote();\n      if (state.reviewEdit === \"plan\") {\n        const detailErrors = validateDetails();\n        if (detailErrors.length) {\n          state.reviewEdit = \"contact\";\n          goTo(4);\n          return showError(detailErrors);\n        }\n        state.reviewEdit = null;\n        return goTo(5);\n      }\n      track(\"price_viewed\", { frequency: state.frequency, custom: quote.custom, value: quote.custom ? undefined : quote.priceCents / 100 });\n      return goTo(3);\n    }\n    if (action === \"choose-intent\") {\n      state.reviewEdit = null;\n      state.intent = button.dataset.intent;\n      if (state.intent === \"quote_delivery\" && state.preferredContact === \"call\") state.preferredContact = \"text\";\n      state.termsAccepted = false;\n      state.termsAcceptedAt = \"\";\n      return goTo(4);\n    }\n    if (action === \"review\") {\n      const planErrors = validatePlan();\n      if (planErrors.length) {\n        if (state.reviewEdit) state.reviewEdit = \"plan\";\n        goTo(2);\n        return showError(planErrors);\n      }\n      const errors = validateDetails();\n      if (errors.length) return showError(errors);\n      state.reviewEdit = null;\n      return goTo(5);\n    }\n    if (action === \"submit\") return submit();\n    if (action === \"back\") return goTo(Math.max(1, state.step - 1));\n  }\n\n  function handleKeydown(event) {\n    if (event.key === \"Enter\" && event.target.id === \"pp-zip\") {\n      event.preventDefault();\n      const button = stageElement.querySelector('[data-action=\"check-zip\"]');\n      if (button) button.click();\n    }\n    if (event.key === \"Tab\" && shadow) trapQuoteTab(event);\n    if (event.key === \"Escape\") {\n      event.stopPropagation();\n      if (!closeOffer()) close();\n    }\n  }\n\n  function hydrateReviews() {\n    if (!CONFIG.reviewsEndpoint || !shadow) return;\n    fetch(CONFIG.reviewsEndpoint).then(function (response) {\n      if (!response.ok) throw new Error(\"reviews unavailable\");\n      return response.json();\n    }).then(function (data) {\n      const reviewChip = shadow.querySelector(\"[data-review-chip]\");\n      const rating = Number(data.rating);\n      const count = Number(data.count);\n      if (reviewChip && Number.isFinite(rating) && rating > 0 && rating <= 5 && Number.isInteger(count) && count > 0) {\n        reviewChip.textContent = CONFIG.brand.reviewChipTemplate\n          .replace(\"{rating}\", rating.toFixed(1))\n          .replace(\"{count}\", count.toLocaleString(\"en-US\"));\n      }\n    }).catch(function () {});\n  }\n\n  function applyEntry(options) {\n    if (!options || typeof options.zip !== \"string\") return;\n    const zip = options.zip.trim();\n    if (!/^\\d{5}$/.test(zip)) { state.step = 1; return; }\n    state.zip = zip;\n    state.zipIneligible = CONFIG.serviceZips.indexOf(zip) < 0;\n    state.step = state.zipIneligible ? 1 : 2;\n    track(state.zipIneligible ? \"service_area_ineligible\" : \"service_area_eligible\", { zip_prefix: zip.slice(0, 3), entry: \"hero_zip\" });\n    saveLowRiskProgress();\n  }\n\n  function open(options) {\n    if (host && state.submitting) { focusSendingStatus(); return; }\n    if (host) { closeOffer(); applyEntry(options); render(); queueMicrotask(focusQuoteStage); return; }\n    previousFocus = document.activeElement;\n    previousOverflow = document.body.style.overflow;\n    if (!restored) { restoreLowRiskProgress(); restored = true; }\n    applyEntry(options);\n    host = document.createElement(\"div\");\n    host.id = \"purge-pros-quote-widget\";\n    shadow = host.attachShadow({ mode: \"open\" });\n    shadow.innerHTML = shellHtml();\n    document.body.appendChild(host);\n    document.body.style.overflow = \"hidden\";\n    isolateQuotePage();\n    stageElement = shadow.querySelector(\".stage\");\n    progressElement = shadow.querySelector(\".progress\");\n    shadow.addEventListener(\"input\", handleInput);\n    shadow.addEventListener(\"change\", handleChange);\n    shadow.addEventListener(\"click\", handleClick);\n    shadow.addEventListener(\"keydown\", handleKeydown);\n    shadow.addEventListener(\"click\", function (event) {\n      const summary = event.target.closest && event.target.closest(\"#pp-yard-guide > summary\");\n      if (!summary) return;\n      state.yardHelpOpen = !summary.parentElement.open;\n      if (state.yardHelpOpen) track(\"yard_size_help_opened\", {});\n    });\n    shadow.addEventListener(\"toggle\", function (event) {\n      if (event.target.id !== \"pp-yard-guide\") return;\n      if (event.target.open && !state.yardHelpOpen) track(\"yard_size_help_opened\", {});\n      state.yardHelpOpen = event.target.open;\n    }, true);\n    beginPlanResume();\n    render();\n    hydrateReviews();\n    queueMicrotask(function () { if (stageElement) (stageElement.querySelector(\"#pp-coverage-result\") || stageElement).focus(); });\n    track(\"funnel_viewed\", { presentation: options && options.zip ? \"hero_zip\" : location.hostname === \"quote.itspurgepros.com\" ? \"dedicated\" : \"modal\" });\n  }\n\n  function close() {\n    if (!host) return;\n    if (state.submitting) { focusSendingStatus(); return; }\n    resetPlanResumeUiOnClose();\n    releaseQuotePage();\n    host.remove();\n    host = null;\n    shadow = null;\n    stageElement = null;\n    progressElement = null;\n    document.body.style.overflow = previousOverflow;\n    if (state.step === 6) {\n      state = freshState();\n      clearLowRiskProgress();\n    }\n    returnQuoteFocus();\n  }\n\n  document.addEventListener(\"click\", function (event) {\n    const trigger = event.target.closest && event.target.closest('[data-purge-quote], a[href=\"#quote\"], a[href=\"#get-quote\"]');\n    // Shared pp-next launchers handle their own click first. Respect that handled event so one\n    // customer action invokes open() once while this delegated fallback still works on pages\n    // without pp-next.js.\n    if (!trigger || event.defaultPrevented) return;\n    event.preventDefault();\n    open();\n  });\n  document.addEventListener(\"keydown\", function (event) { if (event.key === \"Escape\" && host) close(); });\n\n  window.PurgeProsQuote = { open: open, close: close, config: CONFIG };\n\n  if (consumeAutoOpenRequest()) {\n    openWhenBodyReady();\n  }\n})();\n";
var DEMO_HTML = '<!doctype html>\r\n<html lang="en">\r\n<head>\r\n  <meta charset="utf-8">\r\n  <meta name="viewport" content="width=device-width, initial-scale=1">\r\n  <title>Purge Pros \u2014 Quote Widget Demo</title>\r\n  <style>\r\n    body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: #0d0f12; color: #fff;\r\n           min-height: 100vh; display: flex; align-items: center; justify-content: center; }\r\n    .hero { text-align: center; padding: 40px 20px; }\r\n    .hero h1 { font-size: 40px; margin: 0 0 8px; }\r\n    .hero h1 span { color: #38b6ff; }\r\n    .hero p { color: #b9c2cb; margin: 0 0 28px; }\r\n    .cta { display: inline-block; background: #38b6ff; color: #fff; font-weight: 800; font-size: 17px;\r\n           padding: 16px 34px; border-radius: 999px; text-decoration: none; }\r\n    .cta:hover { background: #1da4f5; }\r\n    .note { margin-top: 24px; font-size: 13px; color: #6c7680; }\r\n  </style>\r\n</head>\r\n<body>\r\n  <div class="hero">\r\n    <h1>Purge <span>Pros</span></h1>\r\n    <p>Pet waste removal \u2014 pay per visit, no contracts, no monthly billing.</p>\r\n    <a class="cta" href="#quote">Get My Instant Quote</a>\r\n    <p class="note">Leads log to the browser console until <code>leadEndpoint</code> is set in purge-quote.js.<br>\r\n       Try an in-area ZIP (46032) and an out-of-area one (85701).</p>\r\n  </div>\r\n  <script src="purge-quote.js" defer><\/script>\r\n</body>\r\n</html>\r\n';
var QUOTE_LANDING_HTML = "<!doctype html>\r\n<html lang=\"en\">\r\n<head>\n  <script>(function () {\n  if (!/^#resume=/.test(location.hash || \"\")) return;\n  var match = /^#resume=([A-Za-z0-9_-]{43})$/.exec(location.hash);\n  var token = match ? match[1] : \"invalid\";\n  try { history.replaceState(history.state, \"\", location.pathname + location.search); }\n  catch (_) { token = \"invalid\"; location.replace(location.pathname + location.search); }\n  window.__ppTakePlanToken = function () {\n    var result = token; token = \"\"; delete window.__ppTakePlanToken; return result;\n  };\n}());</script>\r\n  <meta charset=\"utf-8\">\r\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\r\n  <meta name=\"robots\" content=\"noindex, nofollow\">\r\n  <meta name=\"theme-color\" content=\"#f7fcff\">\r\n  <title>Build Your Purge Pros Price</title>\r\n  <style>\r\n    :root {\n      color-scheme: light;\n      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif;\n      background: #f7fcff;\n      color: #062644;\n      --pp-navy: #062644;\n      --pp-blue: #18aef5;\n      --pp-sky: #e7f8ff;\n      --pp-line: #cfe7f2;\n      --pp-muted: #526f80;\n    }\n    *, *::before, *::after { box-sizing: border-box; }\n    html, body { min-height: 100%; margin: 0; }\n    body {\n      min-height: 100vh;\n      min-height: 100dvh;\n      overflow-x: hidden;\n      background:\n        radial-gradient(circle at 92% 8%, rgba(24,174,245,.18), transparent 29rem),\n        radial-gradient(circle at 4% 92%, rgba(24,174,245,.10), transparent 30rem),\n        linear-gradient(145deg, #ffffff 0%, #f5fcff 46%, #e9f8ff 100%);\n    }\n    button, a { -webkit-tap-highlight-color: transparent; }\n    .pp-direct-page {\n      position: relative;\n      isolation: isolate;\n      min-height: 100vh;\n      min-height: 100dvh;\n      display: flex;\n      flex-direction: column;\n    }\n    .pp-direct-page::before,\n    .pp-direct-page::after {\n      content: \"\";\n      position: fixed;\n      z-index: -1;\n      border-radius: 999px;\n      pointer-events: none;\n    }\n    .pp-direct-page::before {\n      width: 290px;\n      height: 290px;\n      right: -110px;\n      top: 15%;\n      border: 42px solid rgba(24,174,245,.08);\n    }\n    .pp-direct-page::after {\n      width: 170px;\n      height: 170px;\n      left: -74px;\n      bottom: 8%;\n      background: rgba(24,174,245,.07);\n    }\n    .pp-direct-header {\n      width: min(1240px, calc(100% - 48px));\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      gap: 24px;\n      margin: 0 auto;\n      padding: 22px 0;\n      border-bottom: 1px solid rgba(118,181,211,.35);\n    }\n    .pp-direct-brand {\n      display: inline-flex;\n      align-items: center;\n      text-decoration: none;\n    }\n    .pp-direct-brand img {\n      display: block;\n      width: min(238px, 52vw);\n      height: auto;\n      object-fit: contain;\n    }\n    .pp-direct-home {\n      display: inline-flex;\n      align-items: center;\n      min-height: 44px;\n      padding: 10px 14px;\n      border: 1px solid #9fcfe6;\n      border-radius: 14px;\n      background: rgba(255,255,255,.76);\n      color: #075f91;\n      font-size: 13px;\n      font-weight: 850;\n      text-decoration: none;\n    }\n    .pp-direct-home:hover,\n    .pp-direct-home:focus-visible { border-color: #18aef5; background: #fff; outline: 3px solid rgba(24,174,245,.18); outline-offset: 3px; }\n    .pp-direct-hero {\n      width: min(1240px, calc(100% - 48px));\n      flex: 1;\n      display: grid;\n      grid-template-columns: minmax(0, .93fr) minmax(440px, 1.07fr);\n      align-items: center;\n      gap: clamp(42px, 6vw, 84px);\n      margin: 0 auto;\n      padding: clamp(34px, 6vh, 72px) 0 clamp(38px, 6vh, 70px);\n    }\n    .pp-direct-copy { min-width: 0; }\n    .pp-direct-eyebrow {\n      display: inline-flex;\n      align-items: center;\n      gap: 10px;\n      margin: 0 0 17px;\n      color: #075f91;\n      font-size: 12px;\n      font-weight: 900;\n      letter-spacing: .12em;\n      text-transform: uppercase;\n    }\n    .pp-direct-eyebrow img { width: 34px; height: 34px; object-fit: contain; }\n    .pp-direct-page h1 {\n      margin: 0;\n      max-width: 650px;\n      color: #062644;\n      font-size: clamp(46px, 5.7vw, 78px);\n      font-weight: 900;\n      line-height: .98;\n      letter-spacing: -.052em;\n    }\n    .pp-direct-page h1 span { color: #0a86c0; }\n    .pp-direct-lede {\n      margin: 22px 0 0;\n      max-width: 610px;\n      color: #3f6275;\n      font-size: clamp(17px, 1.7vw, 21px);\n      line-height: 1.55;\n    }\n    .pp-direct-actions {\n      display: flex;\n      align-items: center;\n      flex-wrap: wrap;\n      gap: 14px 18px;\n      margin-top: 28px;\n    }\n    .pp-direct-button {\n      display: inline-flex;\n      align-items: center;\n      justify-content: center;\n      gap: 10px;\n      min-height: 56px;\n      padding: 14px 24px;\n      border: 1px solid #18aef5;\n      border-radius: 14px;\n      background: #18aef5;\n      color: #062644;\n      box-shadow: 0 14px 32px rgba(24,174,245,.24);\n      font-family: inherit;\n      font-size: 16px;\n      font-weight: 900;\n      line-height: 1.2;\n      cursor: pointer;\n    }\n    .pp-direct-button:hover,\n    .pp-direct-button:focus-visible { background: #4bc1f8; border-color: #4bc1f8; outline: 3px solid rgba(24,174,245,.23); outline-offset: 4px; }\n    .pp-direct-button img { width: 24px; height: 24px; object-fit: contain; }\n    .pp-direct-assurance {\n      margin: 0;\n      max-width: 310px;\n      color: #526f80;\n      font-size: 12px;\n      font-weight: 700;\n      line-height: 1.5;\n    }\n    .pp-direct-points {\n      display: grid;\n      grid-template-columns: repeat(3, minmax(0, 1fr));\n      gap: 10px;\n      margin-top: 30px;\n    }\n    .pp-direct-point {\n      min-height: 96px;\n      display: grid;\n      grid-template-columns: 42px minmax(0, 1fr);\n      align-items: center;\n      gap: 10px;\n      padding: 14px;\n      border: 1px solid var(--pp-line);\n      border-radius: 18px;\n      background: rgba(255,255,255,.78);\n      box-shadow: 0 10px 28px rgba(6,38,68,.05);\n      color: #264b60;\n      font-size: 12px;\n      font-weight: 800;\n      line-height: 1.35;\n    }\n    .pp-direct-point img { width: 42px; height: 42px; object-fit: contain; }\n    .pp-direct-visual {\n      position: relative;\n      min-width: 0;\n    }\n    .pp-direct-art {\n      display: block;\n      width: 100%;\n      aspect-ratio: 4 / 3;\n      border-radius: 28px;\n      object-fit: contain;\n      background: rgba(255,255,255,.52);\n      filter: drop-shadow(0 24px 42px rgba(6,38,68,.15));\n    }\n    .pp-direct-price-tag {\n      position: absolute;\n      left: -24px;\n      bottom: 30px;\n      display: flex;\n      align-items: center;\n      gap: 11px;\n      max-width: 260px;\n      padding: 13px 16px;\n      border: 1px solid #b9e1f3;\n      border-radius: 18px;\n      background: rgba(255,255,255,.94);\n      box-shadow: 0 16px 34px rgba(6,38,68,.13);\n      color: #173e54;\n      font-size: 12px;\n      font-weight: 850;\n      line-height: 1.4;\n    }\n    .pp-direct-price-tag img { width: 48px; height: 48px; object-fit: contain; }\n    @media (max-width: 900px) {\n      .pp-direct-header { width: min(100% - 32px, 720px); padding: 16px 0; }\n      .pp-direct-brand img { width: min(194px, 52vw); }\n      .pp-direct-home { min-height: 40px; padding: 8px 11px; font-size: 12px; }\n      .pp-direct-hero { width: min(100% - 32px, 720px); grid-template-columns: 1fr; gap: 32px; padding: 34px 0 46px; }\n      .pp-direct-page h1 { font-size: clamp(44px, 10vw, 66px); }\n      .pp-direct-lede { font-size: 17px; }\n      .pp-direct-visual { width: min(600px, 100%); margin: 0 auto; }\n      .pp-direct-price-tag { left: 14px; bottom: 14px; }\n    }\n    @media (max-width: 620px) {\n      .pp-direct-header { align-items: flex-start; }\n      .pp-direct-brand img { width: min(168px, 47vw); }\n      .pp-direct-home { max-width: 128px; text-align: center; }\n      .pp-direct-hero { gap: 26px; padding-top: 27px; }\n      .pp-direct-eyebrow { margin-bottom: 13px; font-size: 10px; }\n      .pp-direct-eyebrow img { width: 30px; height: 30px; }\n      .pp-direct-page h1 { font-size: clamp(42px, 13vw, 58px); }\n      .pp-direct-lede { margin-top: 17px; font-size: 16px; }\n      .pp-direct-actions { align-items: stretch; margin-top: 23px; }\n      .pp-direct-button { width: 100%; }\n      .pp-direct-assurance { max-width: none; text-align: center; }\n      .pp-direct-points { grid-template-columns: 1fr; gap: 8px; margin-top: 22px; }\n      .pp-direct-point { min-height: 72px; grid-template-columns: 38px 1fr; padding: 11px 13px; }\n      .pp-direct-point img { width: 38px; height: 38px; }\n      .pp-direct-art { border-radius: 22px; }\n      .pp-direct-price-tag { position: relative; left: auto; bottom: auto; max-width: none; margin-top: 10px; }\n    }\n    @media (max-height: 700px) and (min-width: 901px) {\n      .pp-direct-header { padding-block: 14px; }\n      .pp-direct-brand img { width: 190px; }\n      .pp-direct-hero { gap: 42px; padding-block: 22px 28px; }\n      .pp-direct-page h1 { font-size: clamp(43px, 5vw, 62px); }\n      .pp-direct-lede { margin-top: 14px; font-size: 16px; }\n      .pp-direct-actions { margin-top: 18px; }\n      .pp-direct-points { margin-top: 18px; }\n      .pp-direct-point { min-height: 78px; padding: 10px; }\n      .pp-direct-art { max-height: 490px; }\n    }\n    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; } }\n    .pp-direct-loader {\r\n      position: fixed;\r\n      inset: 0;\r\n      z-index: 2147482990;\r\n      display: grid;\r\n      place-items: center;\r\n      padding: 24px;\r\n      background: #f6fbfe;\r\n      color: #08283a;\r\n    }\r\n    .pp-direct-loader-card {\r\n      width: min(390px, 100%);\r\n      padding: 30px 26px;\r\n      border: 1px solid #cfe0e9;\r\n      border-radius: 22px;\r\n      background: #fff;\r\n      box-shadow: 0 24px 70px rgba(5,52,80,.16);\r\n      text-align: center;\r\n    }\r\n    .pp-direct-loader-logo {\r\n      width: 58px;\r\n      height: 58px;\r\n      padding: 6px;\r\n      border-radius: 16px;\r\n      background: #eef9ff;\r\n      object-fit: contain;\r\n    }\r\n    .pp-direct-spinner {\r\n      width: 34px;\r\n      height: 34px;\r\n      margin: 21px auto 17px;\r\n      border: 4px solid #d9edf8;\r\n      border-top-color: #0a8fd0;\r\n      border-radius: 50%;\r\n      animation: ppDirectSpin .72s linear infinite;\r\n    }\r\n    .pp-direct-loader strong {\r\n      display: block;\r\n      font-size: 17px;\r\n      line-height: 1.35;\r\n    }\r\n    .pp-direct-loader small {\r\n      display: block;\r\n      margin-top: 7px;\r\n      color: #587080;\r\n      font-size: 13px;\r\n      line-height: 1.45;\r\n    }\r\n    .pp-direct-loader-actions { display: none; margin-top: 18px; }\r\n    .pp-direct-loader.is-slow .pp-direct-spinner { animation-duration: 1.15s; }\r\n    .pp-direct-loader.is-slow .pp-direct-loader-actions { display: block; }\r\n    .pp-direct-loader-actions button,\r\n    .pp-direct-loader-actions a {\r\n      display: inline-flex;\r\n      margin: 4px;\r\n      padding: 10px 14px;\r\n      border: 1px solid #b8d2e0;\r\n      border-radius: 10px;\r\n      background: #fff;\r\n      color: #075883;\r\n      font-family: inherit;\r\n      font-size: 13px;\r\n      font-weight: 850;\r\n      line-height: 1.2;\r\n      text-decoration: none;\r\n      cursor: pointer;\r\n    }\r\n    @keyframes ppDirectSpin { to { transform: rotate(360deg); } }\r\n    @media (prefers-reduced-motion: reduce) { .pp-direct-spinner { animation: none; border-top-color: #d9edf8; } }\r\n  </style>\r\n  <script async src=\"https://www.googletagmanager.com/gtag/js?id=AW-17767139897\"></script>\r\n  <script>\r\n    window.dataLayer = window.dataLayer || [];\r\n    function gtag(){dataLayer.push(arguments);}\r\n    gtag(\"js\", new Date());\r\n    gtag(\"config\", \"AW-17767139897\");\r\n  </script>\r\n  <script>\r\n__PP_META_PIXEL_BOOTSTRAP__\r\n  </script>\r\n</head>\r\n<body>\r\n  <main class=\"pp-direct-page\">\n    <header class=\"pp-direct-header\">\n      <a class=\"pp-direct-brand\" href=\"https://itspurgepros.com/\" aria-label=\"Purge Pros home\">\n        <img src=\"https://images.leadconnectorhq.com/image/f_webp/q_80/r_480/u_https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6a7787889a9c7792ea955c4b.webp\" alt=\"Purge Pros\">\n      </a>\n      <a class=\"pp-direct-home\" href=\"https://itspurgepros.com/\">Return to Purge Pros</a>\n    </header>\n    <section class=\"pp-direct-hero\" aria-labelledby=\"pp-direct-title\">\n      <div class=\"pp-direct-copy\">\n        <p class=\"pp-direct-eyebrow\"><img src=\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a2149f8b31b6ab2dc606.webp\" alt=\"\" aria-hidden=\"true\">Transparent price check</p>\n        <h1 id=\"pp-direct-title\">Your yard. Your plan. <span>Your price.</span></h1>\n        <p class=\"pp-direct-lede\">Choose your service plan, see the per-visit price, and send Purge Pros the details needed to review your route.</p>\n        <div class=\"pp-direct-actions\">\n          <button class=\"pp-direct-button\" type=\"button\" onclick=\"window.PurgeProsQuote && window.PurgeProsQuote.open()\"><img src=\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a216c73b042e1413e0f1.webp\" alt=\"\" aria-hidden=\"true\">See my price</button>\n          <p class=\"pp-direct-assurance\">Nothing is charged today. Service starts only after route review and your approval.</p>\n        </div>\n        <div class=\"pp-direct-points\" aria-label=\"Service highlights\">\n          <div class=\"pp-direct-point\"><img src=\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a2149f8b31b6ab2dc606.webp\" alt=\"\" aria-hidden=\"true\"><span>Clear per-visit pricing</span></div>\n          <div class=\"pp-direct-point\"><img src=\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a2142e74dc36120b0281.webp\" alt=\"\" aria-hidden=\"true\"><span>No long-term contract</span></div>\n          <div class=\"pp-direct-point\"><img src=\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a21590b7ca67e9c39b6a.webp\" alt=\"\" aria-hidden=\"true\"><span>Local route review</span></div>\n        </div>\n      </div>\n      <div class=\"pp-direct-visual\">\n        <img class=\"pp-direct-art\" src=\"https://images.leadconnectorhq.com/image/f_webp/q_82/r_1200/u_https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6ab09083bdaa5e26a95fdf6a.png\" alt=\"Purge Pros team member with a golden retriever in a clean yard\">\n        <div class=\"pp-direct-price-tag\"><img src=\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a214c73b042e1413e09f.webp\" alt=\"\" aria-hidden=\"true\"><span>Built around your dogs, yard, and schedule.</span></div>\n      </div>\n    </section>\n  </main>\r\n\r\n  <div class=\"pp-direct-loader\" id=\"pp-direct-loader\" role=\"status\" aria-live=\"polite\" aria-label=\"Loading pricing tool\">\r\n    <div class=\"pp-direct-loader-card\">\r\n      <img class=\"pp-direct-loader-logo\" src=\"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/69ffe0d6a7b9e0385a45dea3.png\" alt=\"Purge Pros\">\r\n      <div class=\"pp-direct-spinner\" aria-hidden=\"true\"></div>\r\n      <strong>Loading your pricing tool...</strong>\r\n      <small>This should only take a moment.</small>\r\n      <div class=\"pp-direct-loader-actions\">\r\n        <button type=\"button\" onclick=\"location.reload()\">Try again</button>\r\n        <a href=\"https://itspurgepros.com/\">Visit our website</a>\r\n      </div>\r\n    </div>\r\n  </div>\r\n\r\n  <script>\r\n    window.__ppDirectQuoteSlowTimer = window.setTimeout(function () {\r\n      var loader = document.getElementById(\"pp-direct-loader\");\r\n      if (loader) loader.classList.add(\"is-slow\");\r\n    }, 8000);\r\n  </script>\r\n  <script>\r\n__PP_WIDGET_SCRIPT__\r\n  </script>\r\n  <script>\r\n    (function () {\r\n      window.clearTimeout(window.__ppDirectQuoteSlowTimer);\r\n      var loader = document.getElementById(\"pp-direct-loader\");\r\n      if (loader) loader.remove();\r\n      if (window.PurgeProsQuote && !document.getElementById(\"purge-pros-quote-widget\")) window.PurgeProsQuote.open({ zip: new URL(location.href).searchParams.get(\"zip\") });\r\n    }());\r\n  </script>\r\n</body>\r\n</html>\r\n";
var META_PIXEL_BOOTSTRAP = "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',__PP_META_PIXEL_ID__);fbq('track','PageView');";
function promotionOverride(env) {
  const override = {};
  if (env && typeof env.PROMO_ENABLED === "string") override.enabled = env.PROMO_ENABLED.toLowerCase() !== "false";
  const fields = {
    PROMO_BADGE: "badge",
    PROMO_TITLE: "title",
    PROMO_DETAIL: "detail",
    PROMO_ELIGIBILITY: "eligibility",
    PROMO_LINK_LABEL: "linkLabel",
    PROMO_MODAL_TITLE: "modalTitle",
    PROMO_MODAL_INTRO: "modalIntro",
    PROMO_FIRST_LABEL: "firstThirtyLabel",
    PROMO_FIRST_VALUE: "firstThirtyValue",
    PROMO_ADDITIONAL_LABEL: "additionalLabel",
    PROMO_ADDITIONAL_VALUE: "additionalValue",
    PROMO_EXAMPLE_LABEL: "exampleLabel",
    PROMO_EXAMPLE_VALUE: "exampleValue",
    PROMO_CUSTOMER_LABEL: "customerLabel",
    PROMO_CUSTOMER_VALUE: "customerValue",
    PROMO_DISCLAIMER: "disclaimer"
  };
  Object.keys(fields).forEach(function(name) {
    if (env && typeof env[name] === "string" && env[name].trim()) override[fields[name]] = env[name].trim();
  });
  return override;
}
__name(promotionOverride, "promotionOverride");
function widgetScript(request, env) {
  const origin = new URL(request.url).origin;
  const configured = WIDGET_JS.replace('leadEndpoint: ""', "leadEndpoint: " + JSON.stringify(origin + "/submit")).replace('reviewsEndpoint: ""', "reviewsEndpoint: " + JSON.stringify(origin + "/reviews")).replace('googleAdsSendTo: ""', "googleAdsSendTo: " + JSON.stringify(GOOGLE_ADS_SEND_TO)).replace("firePixelEvents: true", "firePixelEvents: " + JSON.stringify(FIRE_META_PIXEL_EVENTS));
  return configured + "\nObject.assign(window.PurgeProsQuote.config.promotion," + JSON.stringify(promotionOverride(env)) + ");";
}
__name(widgetScript, "widgetScript");
function quoteLandingHtml(request, env) {
  const pixelId = env && typeof env.META_PIXEL_ID === "string" ? env.META_PIXEL_ID.trim() : "";
  const pixelBootstrap = pixelId ? META_PIXEL_BOOTSTRAP.replace("__PP_META_PIXEL_ID__", JSON.stringify(pixelId)) : "";
  const inlineWidget = widgetScript(request, env).replace(/^\/\*![\s\S]*?\*\/\s*/, "");
  return QUOTE_LANDING_HTML.replace("__PP_META_PIXEL_BOOTSTRAP__", pixelBootstrap).replace("__PP_WIDGET_SCRIPT__", inlineWidget.replace(/<\/script/gi, "<\\/script"));
}
__name(quoteLandingHtml, "quoteLandingHtml");
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
    isOneTime ? "Tell the caller the returned price and terms exactly. If they accept, collect the remaining intake details and submit the appropriate service-request workflow. Do not call the service scheduled or confirmed until the team approves it." : "This is a recurring maintenance quote, not an approved first-cleanup price. Ask whether the household has used Purge Pros before. Returning, uncertain-history and new-occupant requests require Submit Team Follow-Up Request for review. New-customer promotion eligibility also requires team verification: approved promotional first cleanups have NO additional-time charge. Standard initial/restart cleanup uses the quoted recurring rate for 30 minutes plus $1 per extra minute, billed after cleanup; base at ETA. Ordinary maintenance stays at the agreed rate regardless of time. Never add a second maintenance charge. Do not call service scheduled or confirmed until the team approves it.",
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
function buildV3Forward(lead, values, requestId, request) {
  const quote = values.quote;
  const acceptedAt = (/* @__PURE__ */ new Date()).toISOString();
  const attribution = cleanAttribution(lead.attribution);
  const serviceAddress = values.intent === "service_request" ? `${values.street}, ${values.city}, IN ${values.zip}` : "";
  const consentVersion = values.preferredContact === "text" ? cleanString(lead.consentVersion, 80) : "";
  const consentAt = values.preferredContact === "text" ? cleanString(lead.smsConsentCapturedAt, 40) || acceptedAt : "";
  const termsVersion = values.intent === "service_request" ? cleanString(lead.termsVersion, 80) : "";
  const termsAt = values.intent === "service_request" ? cleanString(lead.termsAcceptedAt, 40) || acceptedAt : "";
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
    "Initial/restart: quoted recurring rate includes 30 minutes; extra time $1/min afterward; base at ETA. Approved new-customer promotion waives ALL additional-time charges. Ordinary maintenance has no time surcharge. Verify account/household and existing promises before approval; never add a second maintenance charge.",
    `Desired start: ${values.intent === "service_request" ? values.startTiming : "Not requested"}`,
    `Reply preference: ${values.preferredContact}`,
    `Service SMS permission: ${values.preferredContact === "text" ? `Yes \u2014 ${consentVersion} at ${consentAt}` : "No"}`,
    `Terms accepted: ${values.intent === "service_request" ? `Yes \u2014 ${termsVersion} at ${termsAt}` : "Not applicable"}`,
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
    offerVersion: "2026-09-08-checkout-clarity",
    offerEligibility: quote.frequencyId === "onetime" ? "not_applicable" : quote.custom ? "custom_review" : values.customerStatus === "new" ? "new_customer_review" : "returning_customer_review",
    cleanupPolicyVersion: "2026-09-08-checkout-clarity",
    proposedCleanupBaseCents: quote.custom ? null : quote.priceCents,
    standardCleanupIncludedMinutes: quote.custom ? null : 30,
    standardAdditionalMinuteCents: quote.custom ? null : 100,
    promotionalAdditionalMinuteCents: quote.custom || quote.frequencyId === "onetime" ? null : 0,
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
  try {
    await fetch(`https://graph.facebook.com/v21.0/${env.META_PIXEL_ID}/events?access_token=${env.META_CAPI_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
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
    forward = buildV3Forward(lead, validation.values, requestId, request);
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
    return resumeReply(201, { ok: true, url: "https://quote.itspurgepros.com/#resume=" + token, expiresAt: record.expiresAt }, cors);
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
      return new Response(widgetScript(request, env), {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "public, max-age=300",
          "Access-Control-Allow-Origin": "*",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }
    const directQuoteHost = url.hostname.toLowerCase() === "quote.itspurgepros.com";
    if (request.method === "GET" && (url.pathname === "/quote" || url.pathname === "/quote/" || directQuoteHost && url.pathname === "/")) {
      return new Response(quoteLandingHtml(request, env), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin",
          "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
        }
      });
    }
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/demo" || url.pathname === "/demo.html")) {
      return new Response(DEMO_HTML, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin"
        }
      });
    }
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
