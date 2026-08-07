// GENERATED, SINGLE-FILE CLOUDFLARE WORKER — OWNER COPY/PASTE FILE
// Paste this entire file into the EXISTING "purge-lead-relay" Cloudflare Worker.
// It preserves the old widget at POST / while adding the v3 widget and webhook
// at separate routes. Do not replace the existing "purge-quote" Worker at launch.
//
// Routes:
//   GET  /                 v3 preview page
//   GET  /purge-quote.js   website widget script
//   GET  /reviews          live Google review count/rating
//   POST /                 existing widget -> existing GHL workflow
//   POST /submit           v3 widget -> new GHL v3 workflow
//
// Existing required secret: GHL_WEBHOOK_URL (leave its current value untouched)
// New required secret: GHL_WEBHOOK_URL_V3 (new v3 Inbound Webhook URL)
// Optional secrets: GOOGLE_PLACES_API_KEY, GOOGLE_PLACE_ID,
//                   META_PIXEL_ID, META_CAPI_TOKEN, META_TEST_EVENT_CODE
// Plain variable: ALLOWED_ORIGINS=https://itspurgepros.com,https://www.itspurgepros.com,https://purge-quote.purgepros.workers.dev
// Optional promotion variables: PROMO_ENABLED, PROMO_BADGE, PROMO_TITLE,
//                               PROMO_DETAIL, PROMO_ELIGIBILITY, and popup PROMO_* fields.
//
// Google Ads service-request conversion retained from the current production code.
// The former phone-unlock conversion is intentionally not fired by v3 because v3
// shows pricing before contact information and therefore has no "quote unlock."

const GOOGLE_ADS_SEND_TO = "AW-17767139897/g9smCM7pkL4cELmUhJhC";
const FIRE_META_PIXEL_EVENTS = true;

const WIDGET_JS = "/*!\n * Purge Pros — transparent-price quote and service-request widget.\n * Self-contained, dependency-free, and hosted by the existing Cloudflare Worker.\n *\n * Embed: <script src=\"https://YOUR-HOST/purge-quote.js\" defer></script>\n * Open:  links to #quote / #get-quote, [data-purge-quote], or PurgeProsQuote.open().\n */\n(function () {\n  \"use strict\";\n  if (window.PurgeProsQuote) return;\n\n  const CONFIG = {\n    leadEndpoint: \"\",\n    reviewsEndpoint: \"\",\n    tracking: {\n      googleAdsSendTo: \"\",\n      firePixelEvents: true\n    },\n    brand: {\n      name: \"Purge Pros\",\n      phoneDisplay: \"(317) 961-5865\",\n      phoneHref: \"tel:+13179615865\",\n      iconUrl: \"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/69ffe0d6a7b9e0385a45dea3.png\",\n      heroImageUrl: \"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/69ffd15e54bc6e60ff18533a.jpg\",\n      privacyUrl: \"https://itspurgepros.com/privacy-policy\",\n      termsUrl: \"https://itspurgepros.com/terms-conditions\",\n      reviewChipTemplate: \"{rating}★ Google · {count} reviews\"\n    },\n    consentVersion: \"service-sms-2026-08-v1\",\n    termsVersion: \"2025-12-27\",\n    pricingVersion: \"2026-08-cloudflare-v1\",\n    promotion: {\n      enabled: true,\n      badge: \"NEW CUSTOMER OFFER · AUTOMATICALLY APPLIED\",\n      title: \"Initial cleanup fee ($39.99+ value): WAIVED\",\n      detail: \"Start recurring service and pay only your regular per-visit rate on visit #1—no separate initial cleanup charge.\",\n      eligibility: \"Recurring service only — does not apply to one-time cleanups.\",\n      linkLabel: \"See how the offer works\",\n      modalTitle: \"Your initial cleanup fee is waived\",\n      modalIntro: \"A first visit can take extra time because we clear the full serviced yard before recurring maintenance begins. New recurring customers do not pay a separate fee for that initial cleanup.\",\n      firstThirtyLabel: \"First 30 minutes\",\n      firstThirtyValue: \"$39.99\",\n      additionalLabel: \"Additional cleanup time\",\n      additionalValue: \"$1 per minute\",\n      exampleLabel: \"60-minute cleanup example\",\n      exampleValue: \"$69.99\",\n      customerLabel: \"Your separate initial cleanup fee\",\n      customerValue: \"$0\",\n      disclaimer: \"For new recurring customers only. One-time cleanups use separate pricing. Actual savings depend on the time required.\"\n    },\n    serviceZips: [\n      \"46011\", \"46013\", \"46014\", \"46015\", \"46016\", \"46032\", \"46033\", \"46034\", \"46037\",\n      \"46038\", \"46040\", \"46048\", \"46051\", \"46055\", \"46056\", \"46060\", \"46061\", \"46062\",\n      \"46064\", \"46074\", \"46075\", \"46077\", \"46112\", \"46113\", \"46122\", \"46123\", \"46140\",\n      \"46142\", \"46143\", \"46158\", \"46163\", \"46167\", \"46168\", \"46214\", \"46216\", \"46217\",\n      \"46220\", \"46221\", \"46227\", \"46228\", \"46231\", \"46234\", \"46236\", \"46237\", \"46239\",\n      \"46240\", \"46250\", \"46256\", \"46259\", \"46260\", \"46268\", \"46278\", \"46280\"\n    ],\n    frequencies: {\n      twice: {\n        label: \"Twice weekly\",\n        sub: \"For busy yards and multiple dogs\",\n        maxDogs: 9,\n        prices: { 1: 1599, 2: 1749, 3: 1899, 4: 2049, 5: 2199, 6: 2349, 7: 2499, 8: 2649, 9: 2799 }\n      },\n      weekly: {\n        label: \"Weekly\",\n        sub: \"The most popular maintenance plan\",\n        popular: true,\n        maxDogs: 5,\n        prices: { 1: 1999, 2: 2249, 3: 2499, 4: 2749, 5: 2999 }\n      },\n      biweekly: {\n        label: \"Every other week\",\n        sub: \"For lighter-use yards\",\n        maxDogs: 4,\n        prices: { 1: 2999, 2: 3349, 3: 3699, 4: 4049 }\n      },\n      onetime: {\n        label: \"One-time cleanup\",\n        sub: \"A one-visit pet waste cleanup\",\n        anyDogs: true,\n        flatPrice: 8999\n      },\n      custom: {\n        label: \"Custom booking\",\n        sub: \"10+ dogs · over 1 acre · kennels & commercial\",\n        custom: true\n      }\n    },\n    areaLabels: { back: \"Back yard\", front: \"Front yard\", side: \"Side yard(s)\" },\n    areaAdders: { 1: 0, 2: 250, 3: 500 },\n    yardSizes: {\n      s: { label: \"Up to ⅛ acre\", add: 0 },\n      m: { label: \"Up to ¼ acre\", add: 400 },\n      l: { label: \"Up to ½ acre\", add: 800 },\n      xl: { label: \"Up to 1 acre\", add: 1200 },\n      over: { label: \"Over 1 acre\", custom: true }\n    }\n  };\n\n  const ATTRIBUTION_KEYS = [\"utm_source\", \"utm_medium\", \"utm_campaign\", \"utm_content\", \"utm_term\", \"gclid\", \"wbraid\", \"gbraid\", \"fbclid\"];\n  const PROGRESS_LABELS = [\"Area\", \"Plan\", \"Price\", \"Details\", \"Review\"];\n  const LOW_RISK_STORAGE_KEY = \"pp_quote_progress_v3\";\n  const ATTRIBUTION_STORAGE_KEY = \"pp_quote_attribution_v3\";\n\n  const CSS = `\n    :host { all: initial; position: fixed; inset: 0; z-index: 2147483000; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif; color: #0b2537; }\n    *, *::before, *::after { box-sizing: border-box; }\n    button, input, select, textarea { font: inherit; }\n    button, a { -webkit-tap-highlight-color: transparent; }\n    a { color: #0877b9; }\n    .backdrop { position: fixed; inset: 0; display: grid; place-items: center; padding: 24px; background: rgba(2, 20, 32, .78); backdrop-filter: blur(10px); }\n    .modal { position: relative; width: min(1180px, 100%); height: min(780px, calc(100vh - 48px)); min-height: 620px; overflow: hidden; display: grid; grid-template-columns: minmax(330px, .86fr) minmax(520px, 1.24fr); border: 1px solid rgba(255,255,255,.58); border-radius: 28px; background: #f6fbfe; box-shadow: 0 34px 100px rgba(0, 20, 35, .35); }\n    .close { position: absolute; z-index: 5; top: 16px; right: 18px; width: 42px; height: 42px; border: 1px solid #cfe0e9; border-radius: 50%; background: rgba(255,255,255,.94); color: #073652; font-size: 25px; line-height: 1; cursor: pointer; box-shadow: 0 8px 22px rgba(5, 52, 80, .12); }\n    .close:hover, .close:focus-visible { background: #e9f7ff; outline: 3px solid rgba(56,182,255,.28); }\n    .trust { position: relative; overflow: hidden; padding: 40px 34px 28px; color: #fff; background: linear-gradient(152deg, #073652 0%, #075883 58%, #0b83bd 100%); display: flex; flex-direction: column; }\n    .trust::before { content: \"\"; position: absolute; width: 360px; height: 360px; border-radius: 50%; right: -185px; top: -170px; background: rgba(56,182,255,.25); }\n    .brand { display: flex; align-items: center; gap: 12px; position: relative; z-index: 1; }\n    .brand-mark { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 14px; background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,.15); }\n    .brand-mark img { width: 34px; height: 34px; object-fit: contain; }\n    .brand strong { display: block; font-size: 18px; line-height: 1; letter-spacing: .07em; }\n    .brand small { display: block; margin-top: 6px; color: #bfeaff; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; }\n    .trust-copy { position: relative; z-index: 1; margin-top: 28px; }\n    .eyebrow { display: inline-flex; align-items: center; gap: 7px; margin-bottom: 9px; color: #0a75ad; font-size: 11px; line-height: 1; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; }\n    .eyebrow.light { color: #8cddff; }\n    .trust h1 { margin: 0; font-size: clamp(31px, 3.2vw, 47px); line-height: 1.02; letter-spacing: -.045em; }\n    .trust h1 em { color: #8cddff; font-style: normal; }\n    .trust-copy > p { margin: 15px 0 0; max-width: 390px; color: #d6f2ff; font-size: 15px; line-height: 1.55; }\n    .yard-art { display: block; width: 100%; height: 230px; margin: auto 0 18px; border: 1px solid rgba(255,255,255,.34); border-radius: 22px; object-fit: cover; object-position: center; box-shadow: 0 18px 34px rgba(0,0,0,.2); }\n    .trust-chips { position: relative; z-index: 1; display: flex; flex-wrap: wrap; gap: 7px; margin-top: 17px; }\n    .trust-chip { padding: 7px 9px; border: 1px solid rgba(255,255,255,.25); border-radius: 999px; background: rgba(3,37,56,.3); color: #e7f7ff; font-size: 10px; font-weight: 800; }\n    .trust-call { position: relative; z-index: 1; margin: 12px 0 0; color: #d6f2ff; font-size: 11px; }\n    .trust-call a { color: #8cddff; font-weight: 900; }\n    .proof-grid { position: relative; z-index: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }\n    .proof { display: flex; gap: 9px; min-width: 0; padding: 10px; border: 1px solid rgba(255,255,255,.14); border-radius: 13px; background: rgba(3,37,56,.3); }\n    .proof-icon { flex: 0 0 22px; width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%; background: #38b6ff; color: #06304a; font-weight: 950; }\n    .proof strong, .proof small { display: block; }\n    .proof strong { font-size: 12px; line-height: 1.2; }\n    .proof small { margin-top: 3px; color: #bfe5f7; font-size: 10px; line-height: 1.25; }\n    .quote-side { min-width: 0; overflow-y: auto; padding: 30px 38px 38px; background: linear-gradient(180deg, #fff 0%, #f6fbfe 100%); }\n    .mobile-brand { display: none; }\n    .progress { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 4px 46px 28px 0; }\n    .progress-step { position: relative; display: grid; justify-items: center; gap: 6px; color: #8699a6; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }\n    .progress-step::after { content: \"\"; position: absolute; top: 14px; left: calc(50% + 17px); width: calc(100% - 26px); height: 2px; background: #dce9ef; }\n    .progress-step:last-child::after { display: none; }\n    .progress-dot { position: relative; z-index: 1; width: 29px; height: 29px; display: grid; place-items: center; border: 2px solid #d4e3eb; border-radius: 50%; background: #fff; color: #6f8592; }\n    .progress-step.current, .progress-step.complete { color: #075f91; }\n    .progress-step.current .progress-dot, .progress-step.complete .progress-dot { border-color: #38b6ff; background: #38b6ff; color: #04304a; }\n    .progress-step.complete::after { background: #38b6ff; }\n    .stage { outline: none; }\n    .stage-header { margin-bottom: 23px; }\n    .stage-header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }\n    .stage-header h2 { margin: 0; color: #073652; font-size: clamp(26px, 3vw, 38px); line-height: 1.08; letter-spacing: -.035em; }\n    .stage-header > p { max-width: 680px; margin: 11px 0 0; color: #5a7180; font-size: 14px; line-height: 1.55; }\n    .badge { flex: 0 0 auto; padding: 7px 10px; border-radius: 999px; background: #e5f6ff; color: #086e9f; font-size: 10px; font-weight: 900; letter-spacing: .05em; text-transform: uppercase; }\n    .field, .field-row { margin-top: 18px; }\n    .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }\n    label, .field-label { display: block; margin-bottom: 7px; color: #17384b; font-size: 13px; font-weight: 800; }\n    .input, .select, .textarea { width: 100%; border: 1px solid #c9dbe5; border-radius: 13px; background: #fff; color: #102f41; outline: none; transition: border .18s, box-shadow .18s; }\n    .input, .select { height: 49px; padding: 0 13px; }\n    .textarea { min-height: 110px; padding: 12px 13px; resize: vertical; }\n    .input:focus, .select:focus, .textarea:focus { border-color: #38b6ff; box-shadow: 0 0 0 4px rgba(56,182,255,.16); }\n    .field small { display: block; margin-top: 6px; color: #758b98; font-size: 11px; line-height: 1.4; }\n    .zip-wrap { display: grid; grid-template-columns: 1fr auto; gap: 10px; }\n    .choice-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; }\n    .choice { position: relative; min-height: 76px; padding: 14px 42px 13px 14px; border: 1px solid #cfdee6; border-radius: 15px; background: #fff; color: #17384b; text-align: left; cursor: pointer; transition: border .16s, background .16s, transform .16s, box-shadow .16s; }\n    .choice:hover:not(:disabled) { transform: translateY(-1px); border-color: #8ccce9; box-shadow: 0 8px 24px rgba(8,76,112,.08); }\n    .choice[aria-pressed=\"true\"] { border-color: #1aa9ec; background: #eaf8ff; box-shadow: inset 0 0 0 1px #38b6ff; }\n    .choice:disabled { border-style: dashed; border-color: #cdd9df; background: #f2f6f8; color: #82949e; cursor: not-allowed; box-shadow: none; }\n    .choice:disabled small { color: #82949e; }\n    .choice:disabled .choice-check { border-color: #c7d3d9; background: #e7eef1; color: #82949e; }\n    .popular-choice:not(:disabled) { border: 2px solid #1aa9ec; background: linear-gradient(135deg, #e9f8ff, #f9fdff); box-shadow: 0 9px 24px rgba(8, 119, 174, .12); }\n    .popular-choice:not(:disabled):hover { border-color: #0788c3; box-shadow: 0 11px 28px rgba(8, 119, 174, .18); }\n    .custom-choice { grid-column: 1 / -1; min-height: 64px; }\n    .custom-choice:not([aria-pressed=\"true\"]) { border-style: dashed; border-color: #cbd7dd; background: #f7f9fa; color: #536b78; box-shadow: none; }\n    .choice strong, .choice small { display: block; }\n    .choice strong { font-size: 14px; }\n    .choice small { margin-top: 5px; color: #718692; font-size: 11px; line-height: 1.35; }\n    .choice-check { position: absolute; top: 14px; right: 13px; width: 23px; height: 23px; display: grid; place-items: center; border: 2px solid #b7ceda; border-radius: 50%; color: transparent; background: #fff; font-weight: 950; }\n    .choice[aria-pressed=\"true\"] .choice-check { border-color: #168fc7; background: #38b6ff; color: #05324b; }\n    .popular { display: inline-block; margin-bottom: 7px; padding: 4px 7px; border-radius: 999px; background: #0875ab; color: #fff; font-size: 9px; font-weight: 950; letter-spacing: .08em; }\n    .price-preview { display: flex; align-items: center; justify-content: space-between; gap: 15px; margin-top: 20px; padding: 14px 16px; border-radius: 14px; background: #073652; color: #d8f2ff; }\n    .price-preview span { font-size: 12px; font-weight: 800; }\n    .price-preview strong { color: #8bdcff; font-size: 17px; }\n    .price-hero { padding: 21px; border: 1px solid #c7e8f8; border-radius: 19px; background: linear-gradient(135deg, #e9f8ff, #f9fdff); }\n    .price-label { color: #4e6c7d; font-size: 12px; font-weight: 850; text-transform: uppercase; letter-spacing: .06em; }\n    .price { margin-top: 5px; color: #073652; font-size: clamp(38px, 5vw, 56px); font-weight: 950; line-height: 1; letter-spacing: -.055em; }\n    .price small { font-size: 14px; letter-spacing: 0; color: #4f6f80; }\n    .price-hero p { margin: 11px 0 0; color: #5c7583; font-size: 12px; line-height: 1.45; }\n    .line-items { margin-top: 12px; padding: 2px 15px; border: 1px solid #d9e7ee; border-radius: 14px; background: #fff; }\n    .line-item, .summary-row { display: flex; justify-content: space-between; gap: 14px; padding: 11px 0; border-bottom: 1px solid #edf3f6; font-size: 12px; }\n    .line-item:last-child, .summary-row:last-child { border-bottom: 0; }\n    .addon { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; margin-top: 14px; padding: 15px; border: 2px solid #bad9e8; border-radius: 16px; background: #fff; cursor: pointer; }\n    .addon:has(input:checked) { border-color: #38b6ff; background: #eaf8ff; }\n    .addon input, .check input { width: 21px; height: 21px; margin: 0; accent-color: #159edc; }\n    .addon strong, .addon small { display: block; }\n    .addon small { margin-top: 4px; color: #6e8491; font-size: 11px; line-height: 1.35; }\n    .addon-price { color: #0877ae; font-size: 12px; font-weight: 900; white-space: nowrap; }\n    .info-list { display: grid; gap: 8px; margin-top: 17px; }\n    .info-item { display: flex; align-items: flex-start; gap: 10px; color: #506c7b; font-size: 12px; line-height: 1.4; }\n    .info-icon { flex: 0 0 24px; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; background: #dff5ff; color: #0576ab; font-size: 12px; font-weight: 950; }\n    .notice { margin-top: 15px; padding: 13px 14px; border-left: 4px solid #38b6ff; border-radius: 10px; background: #eef9fe; color: #496875; font-size: 12px; line-height: 1.48; }\n    .notice.orange { border-left-color: #ed7d32; background: #fff5ed; }\n    .promotion { position: relative; margin: 0 0 20px; padding: 18px 17px 15px; border: 2px dashed #159447; border-radius: 15px; background: #effbf3; color: #26633d; }\n    .promotion-badge { display: inline-flex; margin: -31px 0 8px -7px; padding: 5px 9px; border-radius: 999px; background: #117b3b; color: #fff; font-size: 9px; font-weight: 950; letter-spacing: .05em; text-transform: uppercase; }\n    .promotion h3 { margin: 0; color: #126a35; font-size: 15px; line-height: 1.25; }\n    .promotion p { margin: 6px 0 0; color: #34734a; font-size: 11px; line-height: 1.45; }\n    .promotion-limit { display: flex; width: fit-content; max-width: 100%; margin-top: 10px; padding: 6px 9px; border: 1px solid #a9d8b9; border-radius: 999px; background: #fff; color: #0d612d; font-size: 10px; line-height: 1.3; font-weight: 950; }\n    .promotion-link { display: inline-flex; margin-top: 7px; padding: 0; border: 0; border-bottom: 1px solid currentColor; background: transparent; color: #086b9b; font-size: 11px; font-weight: 900; cursor: pointer; }\n    .offer-layer[hidden] { display: none; }\n    .offer-layer { position: absolute; z-index: 12; inset: 0; display: grid; place-items: center; padding: 24px; background: rgba(2,20,32,.72); backdrop-filter: blur(5px); }\n    .offer-dialog { width: min(520px, 100%); max-height: calc(100% - 20px); overflow-y: auto; padding: 24px; border: 2px solid #38b6ff; border-radius: 22px; background: #fff; box-shadow: 0 30px 80px rgba(0,20,35,.35); }\n    .offer-dialog-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 15px; }\n    .offer-dialog h2 { margin: 0; color: #073652; font-size: 24px; line-height: 1.12; }\n    .offer-dialog p { color: #4f6876; font-size: 13px; line-height: 1.55; }\n    .offer-close { flex: 0 0 auto; width: 34px; height: 34px; border: 1px solid #cbdde6; border-radius: 50%; background: #fff; color: #17384b; cursor: pointer; }\n    .offer-table { margin-top: 14px; padding: 4px 14px; border: 1px solid #d9e7ee; border-radius: 14px; background: #f8fbfd; }\n    .offer-row { display: flex; justify-content: space-between; gap: 16px; padding: 11px 0; border-bottom: 1px solid #e4edf2; color: #516c7a; font-size: 12px; }\n    .offer-row:last-child { border-bottom: 0; }\n    .offer-row strong { color: #17394b; text-align: right; }\n    .offer-row.savings { color: #126a35; font-weight: 900; }\n    .offer-row.savings strong { color: #159447; font-size: 20px; }\n    .offer-disclaimer { margin-bottom: 0 !important; color: #708691 !important; font-size: 10px !important; }\n    .radio-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }\n    .radio-card { margin: 0; }\n    .radio-card input { position: absolute; opacity: 0; pointer-events: none; }\n    .radio-card span { min-height: 46px; display: grid; place-items: center; padding: 8px; border: 1px solid #cbdde6; border-radius: 12px; background: #fff; color: #385767; cursor: pointer; }\n    .radio-card input:checked + span { border-color: #209fd7; background: #e8f7ff; color: #075c86; box-shadow: inset 0 0 0 1px #38b6ff; }\n    .radio-card input:focus-visible + span { outline: 3px solid rgba(56,182,255,.28); }\n    .check { display: grid; grid-template-columns: auto 1fr; align-items: flex-start; gap: 11px; margin-top: 17px; padding: 14px; border: 1px solid #cbdce5; border-radius: 14px; background: #fff; color: #496675; font-size: 12px; font-weight: 500; line-height: 1.5; }\n    .check strong { color: #173a4c; }\n    .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }\n    .summary-card { padding: 16px; border: 1px solid #d7e5ec; border-radius: 16px; background: #fff; }\n    .summary-card h3 { margin: 0 0 4px; color: #073652; font-size: 14px; }\n    .summary-row span { color: #667e8c; }\n    .summary-row strong { text-align: right; color: #17394b; }\n    .error { display: none; margin-top: 16px; padding: 12px 14px; border: 1px solid #f0afa7; border-radius: 12px; background: #fff1ef; color: #9c2f22; font-size: 12px; line-height: 1.45; }\n    .error.show { display: block; }\n    .error ul { margin: 6px 0 0 18px; padding: 0; }\n    .actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 9px; margin-top: 22px; }\n    .btn { min-height: 46px; display: inline-flex; align-items: center; justify-content: center; padding: 0 17px; border: 1px solid #bcd1dc; border-radius: 12px; background: #fff; color: #224b60; font-weight: 850; font-size: 12px; text-decoration: none; cursor: pointer; }\n    .btn:hover:not(:disabled) { transform: translateY(-1px); }\n    .btn.primary { border-color: #ed7d32; background: #ed7d32; color: #fff; box-shadow: 0 9px 24px rgba(237,125,50,.24); }\n    .btn.blue { border-color: #159edc; background: #159edc; color: #fff; }\n    .btn.link { margin-right: auto; border-color: transparent; background: transparent; color: #477084; }\n    .btn:disabled { opacity: .55; cursor: wait; }\n    .complete { text-align: center; padding-top: 20px; }\n    .success-mark { width: 68px; height: 68px; display: grid; place-items: center; margin: 0 auto 15px; border-radius: 50%; background: #38b6ff; color: #06344e; font-size: 32px; font-weight: 950; box-shadow: 0 14px 36px rgba(56,182,255,.28); }\n    .complete .stage-header > p { margin-left: auto; margin-right: auto; }\n    .complete .summary-card { max-width: 540px; margin: 17px auto 0; text-align: left; }\n    .request-id { margin: 13px 0 0; color: #77909e; font-size: 10px; text-align: center; overflow-wrap: anywhere; }\n    .help { color: #667f8d; font-size: 11px; line-height: 1.45; }\n    .spinner { width: 16px; height: 16px; margin-right: 8px; border: 2px solid rgba(255,255,255,.45); border-top-color: #fff; border-radius: 50%; animation: spin .8s linear infinite; }\n    @keyframes spin { to { transform: rotate(360deg); } }\n    @media (max-width: 900px) {\n      .backdrop { padding: 0; background: #f5fbfe; }\n      .modal { width: 100%; height: 100dvh; min-height: 0; grid-template-columns: 1fr; border: 0; border-radius: 0; }\n      .trust { display: none; }\n      .quote-side { padding: 20px 18px 38px; }\n      .mobile-brand { display: flex; align-items: center; gap: 10px; margin: 0 50px 19px 0; color: #073652; }\n      .mobile-brand .brand-mark { width: 40px; height: 40px; background: #e5f7ff; box-shadow: none; }\n      .mobile-brand strong, .mobile-brand small { display: block; }\n      .mobile-brand strong { font-size: 15px; letter-spacing: .06em; }\n      .mobile-brand small { margin-top: 3px; color: #6b8492; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; }\n      .progress { margin: 0 42px 24px 0; }\n      .progress-label { display: none; }\n      .close { top: 13px; right: 13px; }\n      .offer-layer { position: fixed; }\n    }\n    @media (max-width: 620px) {\n      .stage-header-row { display: block; }\n      .badge { display: inline-flex; margin-top: 10px; }\n      .field-row, .summary { grid-template-columns: 1fr; }\n      .choice-grid { grid-template-columns: 1fr; }\n      .radio-grid { grid-template-columns: 1fr; }\n      .zip-wrap { grid-template-columns: 1fr; }\n      .zip-wrap .btn { width: 100%; }\n      .addon { grid-template-columns: auto 1fr; }\n      .addon-price { grid-column: 2; }\n      .actions { align-items: stretch; }\n      .actions .btn:not(.link) { flex: 1 1 100%; }\n      .btn.link { order: 4; width: 100%; margin: 2px 0 0; }\n    }\n    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation-duration: .01ms !important; } }\n  `;\n\n  let host = null;\n  let shadow = null;\n  let stageElement = null;\n  let progressElement = null;\n  let previousFocus = null;\n  let offerPreviousFocus = null;\n  let previousOverflow = \"\";\n  let restored = false;\n\n  function freshState() {\n    return {\n      step: 1,\n      zip: \"\",\n      zipIneligible: false,\n      dogCount: \"\",\n      frequency: \"\",\n      areas: [],\n      yardSize: \"\",\n      lastCleaned: \"\",\n      intent: \"service_request\",\n      firstName: \"\",\n      lastName: \"\",\n      phone: \"\",\n      email: \"\",\n      address: \"\",\n      city: \"\",\n      startTiming: \"\",\n      preferredContact: \"text\",\n      smsConsent: false,\n      smsConsentCapturedAt: \"\",\n      question: \"\",\n      termsAccepted: false,\n      termsAcceptedAt: \"\",\n      submitting: false,\n      receipt: null,\n      attribution: captureAttribution()\n    };\n  }\n\n  let state = freshState();\n\n  function escapeHtml(value) {\n    return String(value == null ? \"\" : value)\n      .replaceAll(\"&\", \"&amp;\")\n      .replaceAll(\"<\", \"&lt;\")\n      .replaceAll(\">\", \"&gt;\")\n      .replaceAll('\"', \"&quot;\")\n      .replaceAll(\"'\", \"&#039;\");\n  }\n\n  function selected(condition) { return condition ? \" selected\" : \"\"; }\n  function checked(condition) { return condition ? \" checked\" : \"\"; }\n  function normalizeZip(value) { return String(value || \"\").replace(/\\D/g, \"\").slice(0, 5); }\n\n  function normalizePhone(value) {\n    let digits = String(value || \"\").replace(/\\D/g, \"\");\n    if (digits.length === 11 && digits.startsWith(\"1\")) digits = digits.slice(1);\n    if (!/^\\d{10}$/.test(digits)) return null;\n    return { digits: digits, e164: \"+1\" + digits };\n  }\n\n  function formatPhone(value) {\n    let digits = String(value || \"\").replace(/\\D/g, \"\");\n    if (digits.length > 10 && digits.startsWith(\"1\")) digits = digits.slice(1);\n    digits = digits.slice(0, 10);\n    if (digits.length <= 3) return digits;\n    if (digits.length <= 6) return \"(\" + digits.slice(0, 3) + \") \" + digits.slice(3);\n    return \"(\" + digits.slice(0, 3) + \") \" + digits.slice(3, 6) + \"-\" + digits.slice(6);\n  }\n\n  function money(cents) {\n    return new Intl.NumberFormat(\"en-US\", { style: \"currency\", currency: \"USD\" }).format(cents / 100);\n  }\n\n  function validEmail(value) { return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(String(value || \"\").trim()); }\n\n  function calculateQuote(input) {\n    const dogs = Number(input.dogCount);\n    const frequencyId = String(input.frequency || \"\");\n    const frequency = CONFIG.frequencies[frequencyId];\n    const yard = CONFIG.yardSizes[input.yardSize];\n    const areas = Array.from(new Set(Array.isArray(input.areas) ? input.areas : []))\n      .filter(function (area) { return Object.prototype.hasOwnProperty.call(CONFIG.areaLabels, area); });\n    const errors = [];\n    if (!Number.isInteger(dogs) || dogs < 1 || dogs > 10) errors.push(\"Choose the number of dogs.\");\n    if (!frequency) errors.push(\"Choose a service frequency.\");\n    if (!yard) errors.push(\"Choose the serviced yard size.\");\n    if (!areas.length) errors.push(\"Choose at least one service area.\");\n    if (!errors.length && yard.custom && !frequency.custom) errors.push(\"Choose Custom booking for yards over 1 acre.\");\n    if (!errors.length && !frequency.custom && frequencyId !== \"onetime\" && !frequency.prices[dogs]) errors.push(\"Choose an available service frequency for this dog count.\");\n    if (errors.length) return { ok: false, errors: errors };\n\n    const reasons = [];\n    if (frequency.custom) reasons.push(\"CUSTOM_BOOKING_SELECTED\");\n    if (dogs >= 10 && frequencyId !== \"onetime\") reasons.push(\"DOG_COUNT_10_PLUS\");\n    if (yard.custom) reasons.push(\"YARD_OVER_ONE_ACRE\");\n    if (reasons.length) return {\n      ok: true,\n      custom: true,\n      pricingVersion: CONFIG.pricingVersion,\n      reasons: reasons,\n      configuration: { dogCount: dogs, frequency: frequencyId, yardSize: input.yardSize, areas: areas }\n    };\n\n    if (frequencyId === \"onetime\") return {\n      ok: true,\n      custom: false,\n      pricingVersion: CONFIG.pricingVersion,\n      priceCents: frequency.flatPrice,\n      lineItems: [{ label: \"One-time cleanup · first 30 minutes\", cents: frequency.flatPrice }],\n      disclaimer: \"The first 30 minutes are included. Additional labor is $1 per minute.\",\n      configuration: { dogCount: dogs, frequency: frequencyId, yardSize: input.yardSize, areas: areas }\n    };\n\n    const base = frequency.prices[dogs];\n    const areaAdd = CONFIG.areaAdders[areas.length] || 0;\n    const yardAdd = yard.add || 0;\n    const lineItems = [{ label: frequency.label + \" · \" + dogs + \" \" + (dogs === 1 ? \"dog\" : \"dogs\"), cents: base }];\n    if (areaAdd) lineItems.push({ label: areas.map(function (id) { return CONFIG.areaLabels[id]; }).join(\" + \"), cents: areaAdd });\n    if (yardAdd) lineItems.push({ label: yard.label, cents: yardAdd });\n    return {\n      ok: true,\n      custom: false,\n      pricingVersion: CONFIG.pricingVersion,\n      priceCents: base + areaAdd + yardAdd,\n      lineItems: lineItems,\n      disclaimer: \"Your recurring maintenance price. Final service-day availability is confirmed before secure payment setup.\",\n      configuration: { dogCount: dogs, frequency: frequencyId, yardSize: input.yardSize, areas: areas }\n    };\n  }\n\n  function currentQuote() {\n    return calculateQuote({\n      dogCount: state.dogCount,\n      frequency: state.frequency,\n      areas: state.areas,\n      yardSize: state.yardSize\n    });\n  }\n\n  function priceUnit() { return state.frequency === \"onetime\" ? \"base price\" : \"per visit\"; }\n\n  function captureAttribution() {\n    const params = new URLSearchParams(location.search);\n    let saved = {};\n    try { saved = JSON.parse(sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY) || \"{}\"); } catch (_) {}\n    ATTRIBUTION_KEYS.forEach(function (key) {\n      if (params.has(key)) saved[key] = String(params.get(key)).slice(0, 250);\n    });\n    try { sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(saved)); } catch (_) {}\n    return saved;\n  }\n\n  function cookieValue(name) {\n    const match = document.cookie.match(new RegExp(\"(?:^|; )\" + name + \"=([^;]*)\"));\n    return match ? decodeURIComponent(match[1]) : \"\";\n  }\n\n  function saveLowRiskProgress() {\n    const safe = {\n      zip: state.zip,\n      dogCount: state.dogCount,\n      frequency: state.frequency,\n      areas: state.areas,\n      yardSize: state.yardSize,\n      lastCleaned: state.lastCleaned\n    };\n    try { sessionStorage.setItem(LOW_RISK_STORAGE_KEY, JSON.stringify(safe)); } catch (_) {}\n  }\n\n  function restoreLowRiskProgress() {\n    try {\n      const saved = JSON.parse(sessionStorage.getItem(LOW_RISK_STORAGE_KEY) || \"null\");\n      if (!saved) return;\n      [\"zip\", \"dogCount\", \"frequency\", \"areas\", \"yardSize\", \"lastCleaned\"].forEach(function (key) {\n        if (Object.prototype.hasOwnProperty.call(saved, key)) state[key] = saved[key];\n      });\n      reconcileFrequencySelection();\n    } catch (_) {}\n  }\n\n  function clearLowRiskProgress() {\n    try { sessionStorage.removeItem(LOW_RISK_STORAGE_KEY); } catch (_) {}\n  }\n\n  function track(name, params) {\n    const safe = params || {};\n    if (typeof window.gtag === \"function\") window.gtag(\"event\", name, safe);\n    else if (Array.isArray(window.dataLayer)) window.dataLayer.push(Object.assign({ event: name }, safe));\n    if (CONFIG.tracking.firePixelEvents && name === \"funnel_viewed\" && typeof window.fbq === \"function\") {\n      window.fbq(\"trackCustom\", \"QuoteFunnelViewed\", safe);\n    }\n  }\n\n  function trackSuccess(payload, requestId) {\n    const quote = currentQuote();\n    const params = {\n      event_id: requestId + \":\" + payload.stage,\n      transaction_id: requestId,\n      intent: state.intent,\n      frequency: state.frequency,\n      value: quote.custom ? undefined : quote.priceCents / 100,\n      currency: \"USD\"\n    };\n    track(payload.stage, params);\n    if (state.intent !== \"service_request\") return;\n    if (typeof window.gtag === \"function\") {\n      window.gtag(\"event\", \"generate_lead\", params);\n      if (CONFIG.tracking.googleAdsSendTo) {\n        window.gtag(\"event\", \"conversion\", Object.assign({}, params, { send_to: CONFIG.tracking.googleAdsSendTo, transport_type: \"beacon\" }));\n      }\n    } else if (Array.isArray(window.dataLayer)) window.dataLayer.push(Object.assign({ event: \"generate_lead\" }, params));\n    if (CONFIG.tracking.firePixelEvents && typeof window.fbq === \"function\") {\n      window.fbq(\"track\", \"Lead\", { value: params.value, currency: \"USD\" }, { eventID: params.event_id });\n    }\n  }\n\n  function shellHtml() {\n    return `<style>${CSS}</style>\n      <div class=\"backdrop\" data-backdrop>\n        <div class=\"modal\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"pp-stage-title\">\n          <button class=\"close\" type=\"button\" data-action=\"close\" aria-label=\"Close quote builder\">×</button>\n          <aside class=\"trust\" aria-label=\"Why homeowners choose Purge Pros\">\n            <div class=\"brand\">\n              <span class=\"brand-mark\"><img src=\"${escapeHtml(CONFIG.brand.iconUrl)}\" alt=\"Purge Pros icon\"></span>\n              <span><strong>PURGE PROS</strong><small>Pet Waste Removal</small></span>\n            </div>\n            <div class=\"trust-copy\"><span class=\"eyebrow light\">60-SECOND PRICE CHECK</span><h1>See your exact<br><em>per-visit price.</em></h1><p>A few quick questions about your dogs and your yard—that’s it. You pay per visit, never a monthly bill.</p></div>\n            <div class=\"trust-chips\"><span class=\"trust-chip\" data-review-chip>4.9★ Google · 40 reviews</span><span class=\"trust-chip\">Pay per visit</span><span class=\"trust-chip\">No contracts</span><span class=\"trust-chip\">Heads-up text before every visit</span></div>\n            <p class=\"trust-call\">Rather talk to a person? Call <a href=\"${CONFIG.brand.phoneHref}\">${CONFIG.brand.phoneDisplay}</a></p>\n            <img class=\"yard-art\" src=\"${escapeHtml(CONFIG.brand.heroImageUrl)}\" alt=\"Purge Pros professional pet waste removal service\" loading=\"eager\">\n            <div class=\"proof-grid\">\n              <div class=\"proof\"><span class=\"proof-icon\">✓</span><span><strong>Professional local team</strong><small>Clean, uniformed service</small></span></div>\n              <div class=\"proof\"><span class=\"proof-icon\">✓</span><span><strong>Gate photo proof</strong><small>After completed visits</small></span></div>\n              <div class=\"proof\"><span class=\"proof-icon\">✓</span><span><strong>Sanitized equipment</strong><small>Between properties</small></span></div>\n              <div class=\"proof\"><span class=\"proof-icon\">✓</span><span><strong>No contracts</strong><small>Pay per visit</small></span></div>\n            </div>\n          </aside>\n          <section class=\"quote-side\">\n            <div class=\"mobile-brand\"><span class=\"brand-mark\"><img src=\"${escapeHtml(CONFIG.brand.iconUrl)}\" alt=\"Purge Pros icon\"></span><span><strong>PURGE PROS</strong><small>Pet Waste Removal</small></span></div>\n            <nav class=\"progress\" aria-label=\"Quote progress\"></nav>\n            <div class=\"stage\" tabindex=\"-1\" aria-live=\"polite\"></div>\n          </section>\n          ${offerModalHtml()}\n        </div>\n      </div>`;\n  }\n\n  function promotionCardHtml() {\n    if (!CONFIG.promotion.enabled) return \"\";\n    return `<aside class=\"promotion\" aria-label=\"New recurring-customer offer\"><span class=\"promotion-badge\">${escapeHtml(CONFIG.promotion.badge)}</span><h3>🎁 ${escapeHtml(CONFIG.promotion.title)}</h3><p>${escapeHtml(CONFIG.promotion.detail)}</p><span class=\"promotion-limit\">${escapeHtml(CONFIG.promotion.eligibility)}</span><button class=\"promotion-link\" type=\"button\" data-action=\"show-offer\">${escapeHtml(CONFIG.promotion.linkLabel)}</button></aside>`;\n  }\n\n  function offerModalHtml() {\n    const offer = CONFIG.promotion;\n    return `<div class=\"offer-layer\" data-offer-layer hidden><section class=\"offer-dialog\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"pp-offer-title\"><div class=\"offer-dialog-head\"><h2 id=\"pp-offer-title\">${escapeHtml(offer.modalTitle)}</h2><button class=\"offer-close\" type=\"button\" data-action=\"close-offer\" aria-label=\"Close offer details\">×</button></div><p>${escapeHtml(offer.modalIntro)}</p><div class=\"offer-table\"><div class=\"offer-row\"><span>${escapeHtml(offer.firstThirtyLabel)}</span><strong>${escapeHtml(offer.firstThirtyValue)}</strong></div><div class=\"offer-row\"><span>${escapeHtml(offer.additionalLabel)}</span><strong>${escapeHtml(offer.additionalValue)}</strong></div><div class=\"offer-row\"><span>${escapeHtml(offer.exampleLabel)}</span><strong>${escapeHtml(offer.exampleValue)}</strong></div><div class=\"offer-row savings\"><span>${escapeHtml(offer.customerLabel)}</span><strong>${escapeHtml(offer.customerValue)}</strong></div></div><p class=\"offer-disclaimer\">${escapeHtml(offer.disclaimer)}</p></section></div>`;\n  }\n\n  function stageHeader(eyebrow, title, description, badge) {\n    return `<header class=\"stage-header\"><div class=\"stage-header-row\"><div><span class=\"eyebrow\">${escapeHtml(eyebrow)}</span><h2 id=\"pp-stage-title\">${escapeHtml(title)}</h2></div>${badge ? `<span class=\"badge\">${escapeHtml(badge)}</span>` : \"\"}</div><p>${escapeHtml(description)}</p></header>`;\n  }\n\n  function renderProgress() {\n    if (!progressElement) return;\n    progressElement.style.display = state.step > 5 ? \"none\" : \"grid\";\n    progressElement.innerHTML = PROGRESS_LABELS.map(function (label, index) {\n      const number = index + 1;\n      const complete = state.step > number;\n      const current = state.step === number;\n      return `<div class=\"progress-step${complete ? \" complete\" : \"\"}${current ? \" current\" : \"\"}\"${current ? ' aria-current=\"step\"' : \"\"}><span class=\"progress-dot\">${complete ? \"✓\" : number}</span><span class=\"progress-label\">${label}</span></div>`;\n    }).join(\"\");\n  }\n\n  function renderArea() {\n    stageElement.innerHTML = `${stageHeader(\"60-SECOND PRICE CHECK\", \"First, are we in your neighborhood?\", \"Enter your ZIP to check coverage. Then build your plan and see your exact per-visit price.\", \"Fast availability check\")}\n      <div class=\"field\"><label for=\"pp-zip\">Service ZIP code</label><div class=\"zip-wrap\"><input class=\"input\" id=\"pp-zip\" inputmode=\"numeric\" autocomplete=\"postal-code\" maxlength=\"5\" placeholder=\"e.g. 46032\" value=\"${escapeHtml(state.zip)}\"><button class=\"btn blue\" type=\"button\" data-action=\"check-zip\">Check availability →</button></div><small>Central Indiana service area. No geolocation or account required.</small></div>\n      ${state.zipIneligible ? `<div class=\"notice orange\"><strong>We are not in ZIP ${escapeHtml(state.zip)} yet.</strong><br>We will not collect your contact information. If the address is near the edge of our routes, call <a href=\"${CONFIG.brand.phoneHref}\">${CONFIG.brand.phoneDisplay}</a>.</div>` : \"\"}\n      <div class=\"error\" role=\"alert\" tabindex=\"-1\"></div>\n      <div class=\"info-list\"><div class=\"info-item\"><span class=\"info-icon\">$</span><span><strong>Clear per-visit pricing.</strong> Build the plan that fits your yard and see your exact price for each visit.</span></div><div class=\"info-item\"><span class=\"info-icon\">✓</span><span><strong>Nothing charged today.</strong> Secure payment setup comes only after you approve the proposed service day.</span></div><div class=\"info-item\"><span class=\"info-icon\">↗</span><span><strong>A dependable neighborhood service day.</strong> Our team confirms the recurring day instead of promising a slot that may not work.</span></div></div>`;\n  }\n\n  function frequencyEligibility(id, definition) {\n    const dogs = Number(state.dogCount);\n    if (definition.custom) return { allowed: true, note: definition.sub };\n    if (state.yardSize === \"over\") return { allowed: false, note: \"Choose Custom booking for yards over 1 acre\" };\n    if (definition.anyDogs || !dogs) return { allowed: true, note: definition.sub };\n    if (definition.prices && definition.prices[dogs]) return { allowed: true, note: definition.sub };\n    return { allowed: false, note: \"Available for up to \" + definition.maxDogs + \" dogs\" };\n  }\n\n  function reconcileFrequencySelection() {\n    const definition = CONFIG.frequencies[state.frequency];\n    if (!definition) {\n      if (Number(state.dogCount) >= 10 || state.yardSize === \"over\") state.frequency = \"custom\";\n      return;\n    }\n    if (frequencyEligibility(state.frequency, definition).allowed) return;\n    state.frequency = Number(state.dogCount) >= 10 || state.yardSize === \"over\" ? \"custom\" : \"\";\n  }\n\n  function frequencyChoice(id, definition) {\n    const active = state.frequency === id;\n    const eligibility = frequencyEligibility(id, definition);\n    return `<button class=\"choice${definition.popular ? \" popular-choice\" : \"\"}${definition.custom ? \" custom-choice\" : \"\"}\" type=\"button\" data-frequency=\"${id}\" aria-pressed=\"${active}\"${eligibility.allowed ? \"\" : ' disabled aria-disabled=\"true\"'}><span class=\"choice-check\" aria-hidden=\"true\">${eligibility.allowed ? \"✓\" : \"×\"}</span>${definition.popular ? '<span class=\"popular\">MOST POPULAR</span>' : \"\"}<strong>${escapeHtml(definition.label)}</strong><small>${escapeHtml(eligibility.note)}</small></button>`;\n  }\n\n  function areaChoice(id, label) {\n    const active = state.areas.indexOf(id) >= 0;\n    return `<button class=\"choice\" type=\"button\" data-area=\"${id}\" aria-pressed=\"${active}\"><span class=\"choice-check\" aria-hidden=\"true\">✓</span><strong>${escapeHtml(label)}</strong><small>${active ? \"Included in your plan\" : \"Select this area\"}</small></button>`;\n  }\n\n  function renderPlan() {\n    const quote = currentQuote();\n    const preview = quote.ok && !quote.custom ? money(quote.priceCents) + \" \" + priceUnit() : quote.ok && quote.custom ? \"Custom estimate\" : \"Complete the choices above\";\n    stageElement.innerHTML = `${stageHeader(\"BUILD YOUR PLAN\", \"Tell us about your yard.\", \"Every price-changing choice starts blank, so the estimate reflects what you actually select.\", \"ZIP \" + state.zip)}\n      ${state.frequency !== \"onetime\" ? promotionCardHtml() : \"\"}\n      <div class=\"field-row\"><div class=\"field\"><label for=\"pp-dogs\">How many dogs use the yard?</label><select class=\"select\" id=\"pp-dogs\" data-field=\"dogCount\"><option value=\"\">Choose dogs</option>${Array.from({ length: 9 }, function (_, index) { const dog = index + 1; return `<option value=\"${dog}\"${selected(String(dog) === String(state.dogCount))}>${dog} ${dog === 1 ? \"dog\" : \"dogs\"}</option>`; }).join(\"\")}<option value=\"10\"${selected(String(state.dogCount) === \"10\")}>10+ dogs · custom</option></select></div>\n      <div class=\"field\"><label for=\"pp-yard\">Total lawn area we will service</label><select class=\"select\" id=\"pp-yard\" data-field=\"yardSize\"><option value=\"\">Choose yard size</option>${Object.keys(CONFIG.yardSizes).map(function (id) { const yard = CONFIG.yardSizes[id]; return `<option value=\"${id}\"${selected(state.yardSize === id)}>${escapeHtml(yard.label)}${yard.custom ? \" · custom\" : \"\"}</option>`; }).join(\"\")}</select><small>Use serviced lawn area, not the full parcel size.</small></div></div>\n      <div class=\"field\"><span class=\"field-label\">How often should we scoop?</span><div class=\"choice-grid\">${Object.keys(CONFIG.frequencies).map(function (id) { return frequencyChoice(id, CONFIG.frequencies[id]); }).join(\"\")}</div></div>\n      <div class=\"field\"><span class=\"field-label\">Which areas should we cover?</span><div class=\"choice-grid\">${Object.keys(CONFIG.areaLabels).map(function (id) { return areaChoice(id, CONFIG.areaLabels[id]); }).join(\"\")}<button class=\"choice\" type=\"button\" data-area=\"all\" aria-pressed=\"${state.areas.length === 3}\"><span class=\"choice-check\" aria-hidden=\"true\">✓</span><strong>Yard+ · all areas</strong><small>Back, front and side yard(s)</small></button></div></div>\n      <div class=\"field\"><label for=\"pp-last-cleaned\">When was the last full cleanup?</label><select class=\"select\" id=\"pp-last-cleaned\" data-field=\"lastCleaned\"><option value=\"\">Choose an answer</option>${[\"Within 1 week\", \"2–3 weeks\", \"About 1 month\", \"2–4 months\", \"5–6 months\", \"More than 6 months\"].map(function (value) { return `<option value=\"${escapeHtml(value)}\"${selected(state.lastCleaned === value)}>${escapeHtml(value)}</option>`; }).join(\"\")}</select><small>This helps us plan the first visit. It does not change the recurring maintenance quote.</small></div>\n      <div class=\"price-preview\" aria-live=\"polite\"><span>Your estimate</span><strong>${escapeHtml(preview)}</strong></div><div class=\"error\" role=\"alert\" tabindex=\"-1\"></div><div class=\"actions\"><button class=\"btn link\" type=\"button\" data-action=\"back\">← Back</button><button class=\"btn primary\" type=\"button\" data-action=\"show-price\">See my price →</button></div>`;\n  }\n\n  function reasonText(code) {\n    return ({ CUSTOM_BOOKING_SELECTED: \"custom booking selected\", DOG_COUNT_10_PLUS: \"10+ dogs\", YARD_OVER_ONE_ACRE: \"over one acre\" })[code] || \"manual review required\";\n  }\n\n  function renderPrice() {\n    const quote = currentQuote();\n    if (!quote.ok) return goTo(2);\n    if (quote.custom) {\n      stageElement.innerHTML = `${stageHeader(\"PERSONALIZED REVIEW\", \"This yard needs a hand-built estimate.\", \"We will review the details and give you a specific price instead of inventing a rate that may be wrong.\", \"Personal follow-up\")}\n        <div class=\"notice orange\"><strong>Why:</strong> ${quote.reasons.map(reasonText).join(\" · \")}</div><div class=\"info-list\"><div class=\"info-item\"><span class=\"info-icon\">1</span><span><strong>Send the yard details.</strong> It takes about one more minute.</span></div><div class=\"info-item\"><span class=\"info-icon\">2</span><span><strong>We review the scope and availability.</strong> Our team prepares the estimate.</span></div><div class=\"info-item\"><span class=\"info-icon\">3</span><span><strong>You decide.</strong> Nothing is charged or scheduled by this form.</span></div></div><div class=\"actions\"><button class=\"btn link\" type=\"button\" data-action=\"back\">← Change plan</button><button class=\"btn primary\" type=\"button\" data-action=\"choose-intent\" data-intent=\"service_request\">Request my estimate →</button></div>`;\n      return;\n    }\n    stageElement.innerHTML = `${stageHeader(\"YOUR PURGE PROS PLAN\", \"Your yard, handled.\", \"Review your selected plan, then request service, save the quote or ask us a question.\", \"Upfront price\")}\n      <div class=\"price-hero\"><div class=\"price-label\">${state.frequency === \"onetime\" ? \"One-time cleanup\" : CONFIG.frequencies[state.frequency].label + \" scoop service\"}</div><div class=\"price\">${money(quote.priceCents)} <small>${priceUnit()}</small></div><p>${escapeHtml(quote.disclaimer)}</p></div>\n      <div class=\"line-items\">${quote.lineItems.map(function (item) { return `<div class=\"line-item\"><span>${escapeHtml(item.label)}</span><strong>${money(item.cents)}</strong></div>`; }).join(\"\")}</div>\n      ${state.frequency !== \"onetime\" ? promotionCardHtml() : \"\"}\n      <div class=\"info-list\"><div class=\"info-item\"><span class=\"info-icon\">✓</span><span>Waste hauled away and equipment sanitized</span></div><div class=\"info-item\"><span class=\"info-icon\">✓</span><span>No contract · pay per visit</span></div><div class=\"info-item\"><span class=\"info-icon\">✓</span><span>Regular service day confirmed before secure payment setup</span></div></div>\n      <div class=\"actions\"><button class=\"btn link\" type=\"button\" data-action=\"back\">← Change plan</button><button class=\"btn\" type=\"button\" data-action=\"choose-intent\" data-intent=\"question\">Ask a question</button><button class=\"btn\" type=\"button\" data-action=\"choose-intent\" data-intent=\"quote_delivery\">Send me this quote</button><button class=\"btn primary\" type=\"button\" data-action=\"choose-intent\" data-intent=\"service_request\">Request service →</button></div>`;\n  }\n\n  function intentCopy() {\n    if (state.intent === \"quote_delivery\") return { eyebrow: \"SAVE YOUR QUOTE\", title: \"Where should we send it?\", body: \"Choose how you would like us to send your plan and price.\", badge: \"Save your quote\" };\n    if (state.intent === \"question\") return { eyebrow: \"ASK PURGE PROS\", title: \"What can we help with?\", body: \"Your plan travels with the question, so you do not have to repeat the yard details.\", badge: \"Personal response\" };\n    if (state.frequency === \"onetime\") return { eyebrow: \"REQUEST CLEANUP\", title: \"Tell us where the yard is.\", body: \"We will review the cleanup details and follow up with availability. Nothing is charged today.\", badge: \"About 1 minute\" };\n    return { eyebrow: \"REQUEST SERVICE\", title: \"Tell us where the yard is.\", body: \"We will confirm the best recurring service day for your area. Nothing is charged today.\", badge: \"About 1 minute\" };\n  }\n\n  function renderDetails() {\n    const copy = intentCopy();\n    const service = state.intent === \"service_request\";\n    const question = state.intent === \"question\";\n    const allowCall = state.intent !== \"quote_delivery\";\n    stageElement.innerHTML = `${stageHeader(copy.eyebrow, copy.title, copy.body, copy.badge)}\n      <div class=\"field-row\"><div class=\"field\"><label for=\"pp-first\">First name</label><input class=\"input\" id=\"pp-first\" data-field=\"firstName\" autocomplete=\"given-name\" maxlength=\"80\" value=\"${escapeHtml(state.firstName)}\"></div>${service ? `<div class=\"field\"><label for=\"pp-last\">Last name</label><input class=\"input\" id=\"pp-last\" data-field=\"lastName\" autocomplete=\"family-name\" maxlength=\"80\" value=\"${escapeHtml(state.lastName)}\"></div>` : \"\"}</div>\n      <div class=\"field-row\"><div class=\"field\"><label for=\"pp-phone\">Mobile number${state.preferredContact === \"email\" ? \" (optional)\" : \"\"}</label><input class=\"input\" id=\"pp-phone\" data-field=\"phone\" type=\"tel\" autocomplete=\"tel\" inputmode=\"numeric\" maxlength=\"14\" pattern=\"[0-9() -]*\" placeholder=\"(317) 555-0123\" value=\"${escapeHtml(state.phone)}\"><small>10-digit U.S. number. Letters and extra digits are removed.</small></div><div class=\"field\"><label for=\"pp-email\">Email${state.preferredContact === \"email\" ? \"\" : \" (optional)\"}</label><input class=\"input\" id=\"pp-email\" data-field=\"email\" type=\"email\" autocomplete=\"email\" maxlength=\"254\" placeholder=\"you@example.com\" value=\"${escapeHtml(state.email)}\"></div></div>\n      <div class=\"field\"><span class=\"field-label\">Best way to reply</span><div class=\"radio-grid\"><label class=\"radio-card\"><input type=\"radio\" name=\"pp-preferred\" value=\"text\"${checked(state.preferredContact === \"text\")}><span>Text message</span></label><label class=\"radio-card\"><input type=\"radio\" name=\"pp-preferred\" value=\"email\"${checked(state.preferredContact === \"email\")}><span>Email</span></label>${allowCall ? `<label class=\"radio-card\"><input type=\"radio\" name=\"pp-preferred\" value=\"call\"${checked(state.preferredContact === \"call\")}><span>Phone call</span></label>` : \"\"}</div></div>\n      ${state.preferredContact === \"text\" ? `<label class=\"check\" for=\"pp-sms-consent\"><input id=\"pp-sms-consent\" type=\"checkbox\"${checked(state.smsConsent)}><span><strong>Text me about my quote and service.</strong> I consent to receive non-marketing text messages from Purge Pros about my quote, availability, scheduling, service and account at the number provided. Message frequency varies. Message and data rates may apply. Text HELP for assistance; reply STOP to opt out.</span></label>` : \"\"}\n      <p class=\"help\">You may choose Email${allowCall ? \" or Phone Call\" : \"\"} instead of consenting to SMS. Review our <a href=\"${CONFIG.brand.privacyUrl}\" target=\"_blank\" rel=\"noopener\">Privacy Policy</a> and <a href=\"${CONFIG.brand.termsUrl}\" target=\"_blank\" rel=\"noopener\">Terms &amp; Conditions</a>.</p>\n      ${service ? `<div class=\"field-row\"><div class=\"field\"><label for=\"pp-address\">Service street address</label><input class=\"input\" id=\"pp-address\" data-field=\"address\" autocomplete=\"address-line1\" maxlength=\"120\" value=\"${escapeHtml(state.address)}\"></div><div class=\"field\"><label for=\"pp-city\">City</label><input class=\"input\" id=\"pp-city\" data-field=\"city\" autocomplete=\"address-level2\" maxlength=\"80\" value=\"${escapeHtml(state.city)}\"></div></div><div class=\"field\"><label for=\"pp-start\">When would you like to start?</label><select class=\"select\" id=\"pp-start\" data-field=\"startTiming\"><option value=\"\">Choose timing</option>${[\"As soon as possible\", \"Within the next week\", \"In the next few weeks\", \"Just researching for now\"].map(function (value) { return `<option value=\"${escapeHtml(value)}\"${selected(state.startTiming === value)}>${escapeHtml(value)}</option>`; }).join(\"\")}</select></div>` : \"\"}\n      ${question ? `<div class=\"field\"><label for=\"pp-question\">Your question</label><textarea class=\"textarea\" id=\"pp-question\" data-field=\"question\" maxlength=\"1500\" placeholder=\"What would you like to know?\">${escapeHtml(state.question)}</textarea></div>` : \"\"}\n      <div class=\"error\" role=\"alert\" tabindex=\"-1\"></div><div class=\"actions\"><button class=\"btn link\" type=\"button\" data-action=\"back\">← Back</button><button class=\"btn primary\" type=\"button\" data-action=\"review\">Review request →</button></div>`;\n  }\n\n  function renderReview() {\n    const quote = currentQuote();\n    const service = state.intent === \"service_request\";\n    const oneTime = state.frequency === \"onetime\";\n    const title = service ? (quote.custom ? \"Review your estimate request.\" : \"Review your service request.\") : state.intent === \"quote_delivery\" ? \"Review your quote delivery.\" : \"Review your question.\";\n    stageElement.innerHTML = `${stageHeader(\"ONE LAST LOOK\", title, \"Confirm the details below. We will not schedule service or collect payment from this submission.\", \"Nothing charged\")}\n      <div class=\"summary\"><section class=\"summary-card\"><h3>Plan</h3><div class=\"summary-row\"><span>Frequency</span><strong>${escapeHtml(CONFIG.frequencies[state.frequency].label)}</strong></div><div class=\"summary-row\"><span>Dogs</span><strong>${Number(state.dogCount) >= 10 ? \"10+ dogs\" : escapeHtml(state.dogCount + (Number(state.dogCount) === 1 ? \" dog\" : \" dogs\"))}</strong></div><div class=\"summary-row\"><span>Service area</span><strong>${state.areas.map(function (id) { return escapeHtml(CONFIG.areaLabels[id]); }).join(\", \")}</strong></div><div class=\"summary-row\"><span>Yard size</span><strong>${escapeHtml(CONFIG.yardSizes[state.yardSize].label)}</strong></div><div class=\"summary-row\"><span>Scoop price</span><strong>${quote.custom ? \"Custom estimate\" : money(quote.priceCents) + \" \" + priceUnit()}</strong></div></section>\n      <section class=\"summary-card\"><h3>Contact</h3><div class=\"summary-row\"><span>Name</span><strong>${escapeHtml((state.firstName + \" \" + state.lastName).trim())}</strong></div><div class=\"summary-row\"><span>Reply by</span><strong>${escapeHtml(state.preferredContact === \"call\" ? \"Phone call\" : state.preferredContact)}</strong></div>${state.phone ? `<div class=\"summary-row\"><span>Phone</span><strong>${escapeHtml(state.phone)}</strong></div>` : \"\"}${state.email ? `<div class=\"summary-row\"><span>Email</span><strong>${escapeHtml(state.email)}</strong></div>` : \"\"}${service ? `<div class=\"summary-row\"><span>Service address</span><strong>${escapeHtml(state.address + \", \" + state.city + \", IN \" + state.zip)}</strong></div>` : \"\"}</section></div>\n      ${service ? `<label class=\"check\" for=\"pp-terms\"><input id=\"pp-terms\" type=\"checkbox\"${checked(state.termsAccepted)}><span>I agree to the <a href=\"${CONFIG.brand.termsUrl}\" target=\"_blank\" rel=\"noopener\">Terms of Service</a> and acknowledge the <a href=\"${CONFIG.brand.privacyUrl}\" target=\"_blank\" rel=\"noopener\">Privacy Policy</a>. I understand this is a request for ${oneTime ? \"cleanup availability\" : \"service-day review\"}, not a confirmed appointment.</span></label>` : `<p class=\"help\">By submitting, you acknowledge the <a href=\"${CONFIG.brand.privacyUrl}\" target=\"_blank\" rel=\"noopener\">Privacy Policy</a>.</p>`}\n      <div class=\"error\" role=\"alert\" tabindex=\"-1\"></div><div class=\"actions\"><button class=\"btn link\" type=\"button\" data-action=\"back\">← Edit details</button><button class=\"btn primary\" type=\"button\" data-action=\"submit\"${state.submitting ? \" disabled\" : \"\"}>${state.submitting ? '<span class=\"spinner\" aria-hidden=\"true\"></span>Sending…' : submitLabel(quote)}</button></div>`;\n  }\n\n  function submitLabel(quote) {\n    if (state.intent === \"quote_delivery\") return \"Send my quote →\";\n    if (state.intent === \"question\") return \"Send my question →\";\n    return quote.custom ? \"Request my estimate →\" : \"Request my service day →\";\n  }\n\n  function renderComplete() {\n    const service = state.intent === \"service_request\";\n    const quote = currentQuote();\n    const oneTime = state.frequency === \"onetime\";\n    const serviceBody = oneTime\n      ? \"Our team will review the cleanup details and reply with availability using your selected contact method. Nothing has been scheduled or charged.\"\n      : \"Our team will confirm the best recurring service day for your area and reply using your selected contact method. Your service is not scheduled until you approve the proposed day.\";\n    const nextSteps = oneTime\n      ? `<div class=\"info-list\"><div class=\"info-item\"><span class=\"info-icon\">1</span><span>We review the cleanup details and current availability.</span></div><div class=\"info-item\"><span class=\"info-icon\">2</span><span>We confirm the cleanup plan and timing with you.</span></div><div class=\"info-item\"><span class=\"info-icon\">3</span><span>Then we send the secure payment setup request.</span></div></div>`\n      : `<div class=\"info-list\"><div class=\"info-item\"><span class=\"info-icon\">1</span><span>We confirm the best recurring service day for your area.</span></div><div class=\"info-item\"><span class=\"info-icon\">2</span><span>You approve the proposed service day.</span></div><div class=\"info-item\"><span class=\"info-icon\">3</span><span>Then we send a secure payment setup request.</span></div></div>`;\n    stageElement.innerHTML = `<div class=\"complete\"><div class=\"success-mark\" aria-hidden=\"true\">✓</div>${stageHeader(\"RECEIVED\", service ? \"Your request is with Purge Pros.\" : state.intent === \"quote_delivery\" ? \"Your quote request is in.\" : \"Your question is in.\", service ? serviceBody : \"We will follow up using the reply method you selected.\", \"Successfully sent\")}\n      <div class=\"summary-card\"><h3>What happens next</h3>${service ? nextSteps : `<p class=\"help\">Keep an eye on ${state.preferredContact === \"email\" ? \"your inbox\" : state.preferredContact === \"call\" ? \"your phone\" : \"your text messages\"}. Questions? Call <a href=\"${CONFIG.brand.phoneHref}\">${CONFIG.brand.phoneDisplay}</a>.</p>`}<div class=\"summary-row\"><span>Your price</span><strong>${quote.custom ? \"Custom estimate\" : money(quote.priceCents) + \" \" + priceUnit()}</strong></div><p class=\"request-id\">Reference: ${escapeHtml(state.receipt && state.receipt.requestId || \"received\")}</p></div><div class=\"actions\"><button class=\"btn blue\" type=\"button\" data-action=\"close\">Done</button></div></div>`;\n  }\n\n  function render() {\n    if (!stageElement) return;\n    renderProgress();\n    if (state.step === 1) renderArea();\n    if (state.step === 2) renderPlan();\n    if (state.step === 3) renderPrice();\n    if (state.step === 4) renderDetails();\n    if (state.step === 5) renderReview();\n    if (state.step === 6) renderComplete();\n  }\n\n  function showOffer() {\n    const layer = shadow && shadow.querySelector(\"[data-offer-layer]\");\n    if (!layer) return;\n    offerPreviousFocus = shadow.activeElement;\n    layer.hidden = false;\n    const closeButton = layer.querySelector('[data-action=\"close-offer\"]');\n    if (closeButton) closeButton.focus();\n    track(\"promotion_details_viewed\", { promotion: CONFIG.promotion.title });\n  }\n\n  function closeOffer() {\n    const layer = shadow && shadow.querySelector(\"[data-offer-layer]\");\n    if (!layer || layer.hidden) return false;\n    layer.hidden = true;\n    if (offerPreviousFocus && typeof offerPreviousFocus.focus === \"function\") offerPreviousFocus.focus();\n    offerPreviousFocus = null;\n    return true;\n  }\n\n  function goTo(step) {\n    state.step = step;\n    render();\n    const quoteSide = shadow.querySelector(\".quote-side\");\n    if (quoteSide) quoteSide.scrollTop = 0;\n    queueMicrotask(function () { if (stageElement) stageElement.focus({ preventScroll: true }); });\n    track(\"funnel_step_viewed\", { step: step });\n  }\n\n  function showError(messages) {\n    const box = stageElement.querySelector(\".error\");\n    if (!box) return;\n    const list = Array.isArray(messages) ? messages : [messages];\n    box.innerHTML = list.length === 1 ? escapeHtml(list[0]) : `<strong>Please fix the following:</strong><ul>${list.map(function (message) { return `<li>${escapeHtml(message)}</li>`; }).join(\"\")}</ul>`;\n    box.classList.add(\"show\");\n    box.focus();\n  }\n\n  function validatePlan() {\n    const quote = currentQuote();\n    const errors = quote.errors ? quote.errors.slice() : [];\n    if (!state.lastCleaned) errors.push(\"Choose when the yard was last fully cleaned.\");\n    return errors;\n  }\n\n  function validateDetails() {\n    const errors = [];\n    const service = state.intent === \"service_request\";\n    if (!state.firstName.trim()) errors.push(\"Enter your first name.\");\n    if (service && !state.lastName.trim()) errors.push(\"Enter your last name.\");\n    if ((service || state.preferredContact !== \"email\") && !normalizePhone(state.phone)) errors.push(\"Enter a valid 10-digit phone number.\");\n    if (state.preferredContact === \"email\" && !validEmail(state.email)) errors.push(\"Enter a valid email address.\");\n    if (state.preferredContact === \"text\" && !state.smsConsent) errors.push(state.intent === \"quote_delivery\" ? \"To choose Text, select the service-text permission or choose Email.\" : \"To choose Text, select the service-text permission or choose Email/Phone call.\");\n    if (service && !state.address.trim()) errors.push(\"Enter the service street address.\");\n    if (service && !state.city.trim()) errors.push(\"Enter the service city.\");\n    if (service && !state.startTiming) errors.push(\"Choose when you would like to start.\");\n    if (state.intent === \"question\" && state.question.trim().length < 5) errors.push(\"Enter your question.\");\n    return errors;\n  }\n\n  function requestId() {\n    if (window.crypto && typeof window.crypto.randomUUID === \"function\") return window.crypto.randomUUID();\n    return \"pp-\" + Date.now() + \"-\" + Math.random().toString(36).slice(2, 10);\n  }\n\n  function buildPayload() {\n    const quote = currentQuote();\n    const phone = normalizePhone(state.phone);\n    const id = requestId();\n    let stage = \"service_requested\";\n    let question = state.question.trim();\n    if (state.intent === \"question\") stage = \"question_submitted\";\n    if (state.intent === \"quote_delivery\") {\n      stage = \"quote_requested\";\n      question = \"Quote delivery requested by \" + state.preferredContact + \".\";\n    }\n    if (state.intent === \"service_request\" && quote.custom) stage = \"estimate_requested\";\n    return {\n      schemaVersion: \"cloudflare-widget.v3\",\n      requestId: id,\n      eventId: id + \":\" + stage,\n      stage: stage,\n      intent: state.intent,\n      zip: state.zip,\n      dogs: String(state.dogCount),\n      frequency: CONFIG.frequencies[state.frequency].label,\n      frequencyId: state.frequency,\n      areas: state.areas.map(function (id) { return CONFIG.areaLabels[id]; }).join(\" & \"),\n      areaIds: state.areas,\n      yardSize: CONFIG.yardSizes[state.yardSize].label,\n      yardSizeId: state.yardSize,\n      lastCleaned: state.lastCleaned,\n      startTiming: state.startTiming,\n      perVisitPrice: quote.custom ? \"\" : (quote.priceCents / 100).toFixed(2),\n      clientPriceCents: quote.custom ? null : quote.priceCents,\n      pricingVersion: quote.pricingVersion,\n      customEstimate: Boolean(quote.custom),\n      customReasons: quote.reasons || [],\n      phone: phone ? phone.digits : \"\",\n      phoneE164: phone ? phone.e164 : \"\",\n      firstName: state.firstName.trim(),\n      lastName: state.lastName.trim(),\n      email: state.email.trim().toLowerCase(),\n      street: state.address.trim(),\n      city: state.city.trim(),\n      state: \"IN\",\n      preferredContact: state.preferredContact,\n      smsTransactionalConsent: state.smsConsent,\n      consent: state.smsConsent ? \"yes\" : \"no\",\n      consentVersion: state.smsConsent ? CONFIG.consentVersion : \"\",\n      smsConsentCapturedAt: state.smsConsent ? state.smsConsentCapturedAt || new Date().toISOString() : \"\",\n      termsAccepted: state.intent === \"service_request\" ? state.termsAccepted : false,\n      termsVersion: state.intent === \"service_request\" ? CONFIG.termsVersion : \"\",\n      termsAcceptedAt: state.intent === \"service_request\" && state.termsAccepted ? state.termsAcceptedAt || new Date().toISOString() : \"\",\n      question: question,\n      notes: state.intent === \"service_request\" ? \"Submitted through transparent-price Cloudflare widget.\" : \"\",\n      page: location.href.slice(0, 1000),\n      attribution: state.attribution,\n      gclid: state.attribution.gclid || \"\",\n      fbclid: state.attribution.fbclid || \"\",\n      fbp: cookieValue(\"_fbp\"),\n      fbc: cookieValue(\"_fbc\") || (state.attribution.fbclid ? \"fb.1.\" + Date.now() + \".\" + state.attribution.fbclid : \"\"),\n      submittedAt: new Date().toISOString(),\n      website: \"\"\n    };\n  }\n\n  async function submit() {\n    if (state.submitting) return;\n    if (state.intent === \"service_request\" && !state.termsAccepted) return showError(\"Agree to the Terms of Service and acknowledge the Privacy Policy before submitting.\");\n    const detailErrors = validateDetails();\n    if (detailErrors.length) return showError(detailErrors);\n    const payload = buildPayload();\n    state.submitting = true;\n    renderReview();\n    try {\n      let body = { accepted: true, requestId: payload.requestId };\n      if (CONFIG.leadEndpoint) {\n        const controller = new AbortController();\n        const timeout = window.setTimeout(function () { controller.abort(); }, 15000);\n        let response;\n        try {\n          response = await fetch(CONFIG.leadEndpoint, {\n            method: \"POST\",\n            headers: { \"Content-Type\": \"application/json\" },\n            body: JSON.stringify(payload),\n            credentials: \"omit\",\n            signal: controller.signal\n          });\n        } finally {\n          window.clearTimeout(timeout);\n        }\n        const text = await response.text();\n        if (text) {\n          try { body = JSON.parse(text); } catch (_) { body = { accepted: response.ok, requestId: payload.requestId }; }\n        }\n        if (!response.ok || body.accepted === false) throw new Error(body.message || \"We could not save your request. Please try again.\");\n      } else {\n        console.info(\"Purge Pros demo submission\", payload);\n      }\n      state.receipt = { requestId: body.requestId || payload.requestId };\n      trackSuccess(payload, state.receipt.requestId);\n      clearLowRiskProgress();\n      state.submitting = false;\n      goTo(6);\n    } catch (error) {\n      state.submitting = false;\n      renderReview();\n      const message = error && error.name === \"AbortError\"\n        ? \"This is taking longer than expected. Please try again or call \" + CONFIG.brand.phoneDisplay + \".\"\n        : error && error.message || \"We could not send this request. Please try again or call \" + CONFIG.brand.phoneDisplay + \".\";\n      showError(message);\n    }\n  }\n\n  function handleInput(event) {\n    const target = event.target;\n    if (target.id === \"pp-zip\") {\n      state.zip = normalizeZip(target.value);\n      target.value = state.zip;\n      state.zipIneligible = false;\n      return;\n    }\n    if (target.id === \"pp-phone\") {\n      const formatted = formatPhone(target.value);\n      target.value = formatted;\n      state.phone = formatted;\n      return;\n    }\n    const field = target.dataset && target.dataset.field;\n    if (field) state[field] = target.value;\n  }\n\n  function handleChange(event) {\n    const target = event.target;\n    const field = target.dataset && target.dataset.field;\n    if (field) state[field] = target.value;\n    if (target.name === \"pp-preferred\") {\n      state.preferredContact = target.value;\n      if (state.preferredContact !== \"text\") {\n        state.smsConsent = false;\n        state.smsConsentCapturedAt = \"\";\n      }\n      renderDetails();\n      return;\n    }\n    if (target.id === \"pp-sms-consent\") {\n      state.smsConsent = target.checked;\n      state.smsConsentCapturedAt = target.checked ? new Date().toISOString() : \"\";\n    }\n    if (target.id === \"pp-terms\") {\n      state.termsAccepted = target.checked;\n      state.termsAcceptedAt = target.checked ? new Date().toISOString() : \"\";\n    }\n    if (field && state.step === 2) {\n      if (field === \"dogCount\" || field === \"yardSize\") reconcileFrequencySelection();\n      saveLowRiskProgress();\n      renderPlan();\n    }\n  }\n\n  function handleClick(event) {\n    const frequencyButton = event.target.closest(\"[data-frequency]\");\n    if (frequencyButton) {\n      state.frequency = frequencyButton.dataset.frequency;\n      saveLowRiskProgress();\n      renderPlan();\n      return;\n    }\n    const areaButton = event.target.closest(\"[data-area]\");\n    if (areaButton) {\n      const id = areaButton.dataset.area;\n      if (id === \"all\") state.areas = state.areas.length === 3 ? [] : Object.keys(CONFIG.areaLabels);\n      else state.areas = state.areas.indexOf(id) >= 0 ? state.areas.filter(function (item) { return item !== id; }) : state.areas.concat(id);\n      saveLowRiskProgress();\n      renderPlan();\n      return;\n    }\n    const button = event.target.closest(\"[data-action]\");\n    if (!button) {\n      if (event.target.matches(\"[data-offer-layer]\")) return closeOffer();\n      if (event.target.matches(\"[data-backdrop]\")) close();\n      return;\n    }\n    const action = button.dataset.action;\n    if (action === \"show-offer\") return showOffer();\n    if (action === \"close-offer\") return closeOffer();\n    if (action === \"close\") return close();\n    if (action === \"check-zip\") {\n      state.zip = normalizeZip(stageElement.querySelector(\"#pp-zip\").value);\n      if (state.zip.length !== 5) return showError(\"Enter a valid 5-digit ZIP code.\");\n      if (CONFIG.serviceZips.indexOf(state.zip) < 0) {\n        state.zipIneligible = true;\n        track(\"service_area_ineligible\", { zip_prefix: state.zip.slice(0, 3) });\n        return renderArea();\n      }\n      state.zipIneligible = false;\n      saveLowRiskProgress();\n      track(\"service_area_eligible\", { zip_prefix: state.zip.slice(0, 3) });\n      return goTo(2);\n    }\n    if (action === \"show-price\") {\n      const errors = validatePlan();\n      if (errors.length) return showError(errors);\n      saveLowRiskProgress();\n      const quote = currentQuote();\n      track(\"price_viewed\", { frequency: state.frequency, custom: quote.custom, value: quote.custom ? undefined : quote.priceCents / 100 });\n      return goTo(3);\n    }\n    if (action === \"choose-intent\") {\n      state.intent = button.dataset.intent;\n      if (state.intent === \"quote_delivery\" && state.preferredContact === \"call\") state.preferredContact = \"text\";\n      state.termsAccepted = false;\n      state.termsAcceptedAt = \"\";\n      return goTo(4);\n    }\n    if (action === \"review\") {\n      const errors = validateDetails();\n      if (errors.length) return showError(errors);\n      return goTo(5);\n    }\n    if (action === \"submit\") return submit();\n    if (action === \"back\") return goTo(Math.max(1, state.step - 1));\n  }\n\n  function handleKeydown(event) {\n    if (event.key === \"Enter\" && event.target.id === \"pp-zip\") {\n      event.preventDefault();\n      const button = stageElement.querySelector('[data-action=\"check-zip\"]');\n      if (button) button.click();\n    }\n    if (event.key === \"Tab\" && shadow) {\n      const focusable = Array.from(shadow.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])'))\n        .filter(function (element) { return element.getClientRects().length > 0; });\n      if (focusable.length) {\n        const first = focusable[0];\n        const last = focusable[focusable.length - 1];\n        const active = shadow.activeElement;\n        if (event.shiftKey && (active === first || !active)) {\n          event.preventDefault();\n          last.focus();\n        } else if (!event.shiftKey && active === last) {\n          event.preventDefault();\n          first.focus();\n        }\n      }\n    }\n    if (event.key === \"Escape\") {\n      event.stopPropagation();\n      if (!closeOffer()) close();\n    }\n  }\n\n  function hydrateReviews() {\n    if (!CONFIG.reviewsEndpoint || !shadow) return;\n    fetch(CONFIG.reviewsEndpoint).then(function (response) {\n      if (!response.ok) throw new Error(\"reviews unavailable\");\n      return response.json();\n    }).then(function (data) {\n      const reviewChip = shadow.querySelector(\"[data-review-chip]\");\n      if (reviewChip && data.rating && data.count) reviewChip.textContent = CONFIG.brand.reviewChipTemplate.replace(\"{rating}\", data.rating).replace(\"{count}\", data.count);\n    }).catch(function () {});\n  }\n\n  function open() {\n    if (host) return;\n    previousFocus = document.activeElement;\n    previousOverflow = document.body.style.overflow;\n    if (!restored) { restoreLowRiskProgress(); restored = true; }\n    host = document.createElement(\"div\");\n    host.id = \"purge-pros-quote-widget\";\n    shadow = host.attachShadow({ mode: \"open\" });\n    shadow.innerHTML = shellHtml();\n    document.body.appendChild(host);\n    document.body.style.overflow = \"hidden\";\n    stageElement = shadow.querySelector(\".stage\");\n    progressElement = shadow.querySelector(\".progress\");\n    shadow.addEventListener(\"input\", handleInput);\n    shadow.addEventListener(\"change\", handleChange);\n    shadow.addEventListener(\"click\", handleClick);\n    shadow.addEventListener(\"keydown\", handleKeydown);\n    render();\n    hydrateReviews();\n    queueMicrotask(function () { if (stageElement) stageElement.focus(); });\n    track(\"funnel_viewed\", { presentation: \"cloudflare_widget\" });\n  }\n\n  function close() {\n    if (!host) return;\n    host.remove();\n    host = null;\n    shadow = null;\n    stageElement = null;\n    progressElement = null;\n    document.body.style.overflow = previousOverflow;\n    if (state.step === 6) {\n      state = freshState();\n      clearLowRiskProgress();\n    }\n    if (previousFocus && typeof previousFocus.focus === \"function\") previousFocus.focus();\n  }\n\n  document.addEventListener(\"click\", function (event) {\n    const trigger = event.target.closest && event.target.closest('[data-purge-quote], a[href=\"#quote\"], a[href=\"#get-quote\"]');\n    if (!trigger) return;\n    event.preventDefault();\n    open();\n  });\n  document.addEventListener(\"keydown\", function (event) { if (event.key === \"Escape\" && host) close(); });\n\n  window.PurgeProsQuote = { open: open, close: close, config: CONFIG };\n})();\n";
const DEMO_HTML = "<!doctype html>\r\n<html lang=\"en\">\r\n<head>\r\n  <meta charset=\"utf-8\">\r\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\r\n  <title>Purge Pros — Quote Widget Demo</title>\r\n  <style>\r\n    body { margin: 0; font-family: \"Segoe UI\", system-ui, sans-serif; background: #0d0f12; color: #fff;\r\n           min-height: 100vh; display: flex; align-items: center; justify-content: center; }\r\n    .hero { text-align: center; padding: 40px 20px; }\r\n    .hero h1 { font-size: 40px; margin: 0 0 8px; }\r\n    .hero h1 span { color: #38b6ff; }\r\n    .hero p { color: #b9c2cb; margin: 0 0 28px; }\r\n    .cta { display: inline-block; background: #38b6ff; color: #fff; font-weight: 800; font-size: 17px;\r\n           padding: 16px 34px; border-radius: 999px; text-decoration: none; }\r\n    .cta:hover { background: #1da4f5; }\r\n    .note { margin-top: 24px; font-size: 13px; color: #6c7680; }\r\n  </style>\r\n</head>\r\n<body>\r\n  <div class=\"hero\">\r\n    <h1>Purge <span>Pros</span></h1>\r\n    <p>Pet waste removal — pay per visit, no contracts, no monthly billing.</p>\r\n    <a class=\"cta\" href=\"#quote\">Get My Instant Quote</a>\r\n    <p class=\"note\">Leads log to the browser console until <code>leadEndpoint</code> is set in purge-quote.js.<br>\r\n       Try an in-area ZIP (46032) and an out-of-area one (85701).</p>\r\n  </div>\r\n  <script src=\"purge-quote.js\" defer></script>\r\n</body>\r\n</html>\r\n";

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
  Object.keys(fields).forEach(function (name) {
    if (env && typeof env[name] === "string" && env[name].trim()) override[fields[name]] = env[name].trim();
  });
  return override;
}

function widgetScript(request, env) {
  const origin = new URL(request.url).origin;
  const configured = WIDGET_JS
    .replace('leadEndpoint: ""', "leadEndpoint: " + JSON.stringify(origin + "/submit"))
    .replace('reviewsEndpoint: ""', "reviewsEndpoint: " + JSON.stringify(origin + "/reviews"))
    .replace('googleAdsSendTo: ""', "googleAdsSendTo: " + JSON.stringify(GOOGLE_ADS_SEND_TO))
    .replace('firePixelEvents: true', "firePixelEvents: " + JSON.stringify(FIRE_META_PIXEL_EVENTS));
  return configured + "\nObject.assign(window.PurgeProsQuote.config.promotion," + JSON.stringify(promotionOverride(env)) + ");";
}

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

async function handleLeadSubmission(request, env, ctx) {
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


export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
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
        ACCEPT_LEGACY_WIDGET: "false"
      }, ctx);
    }
    if (url.pathname === "/" && (request.method === "POST" || request.method === "OPTIONS")) {
      return handleLeadSubmission(request, { ...env, ACCEPT_LEGACY_WIDGET: "true" }, ctx);
    }
    return new Response("Not found", { status: 404 });
  }
};
