/*!
 * Purge Pros — transparent-price quote and service-request widget.
 * Self-contained, dependency-free, and hosted by the existing Cloudflare Worker.
 *
 * Embed: <script src="https://YOUR-HOST/purge-quote.js" defer></script>
 * Open:  links to #quote / #get-quote, [data-purge-quote], or PurgeProsQuote.open().
 */
(function () {
  "use strict";
  if (window.PurgeProsQuote) return;

  const CONFIG = {
    leadEndpoint: "",
    reviewsEndpoint: "",
    tracking: {
      googleAdsSendTo: "",
      firePixelEvents: true
    },
    brand: {
      name: "Purge Pros",
      phoneDisplay: "(317) 961-5865",
      phoneHref: "tel:+13179615865",
      iconUrl: "https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/69ffe0d6a7b9e0385a45dea3.png",
      heroImageUrl: "https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/69ffd15e54bc6e60ff18533a.jpg",
      privacyUrl: "https://itspurgepros.com/privacy-policy",
      termsUrl: "https://itspurgepros.com/terms-conditions",
      reviewChipTemplate: "{rating}★ Google · {count} reviews"
    },
    consentVersion: "service-sms-2026-08-v1",
    termsVersion: "2025-12-27",
    pricingVersion: "2026-08-cloudflare-v1",
    promotion: {
      enabled: true,
      badge: "NEW CUSTOMER OFFER · AUTOMATICALLY APPLIED",
      title: "Initial cleanup fee ($39.99+ value): WAIVED",
      detail: "Start recurring service and pay only your regular per-visit rate on visit #1—no separate initial cleanup charge.",
      eligibility: "Recurring service only — does not apply to one-time cleanups.",
      linkLabel: "See how the offer works",
      modalTitle: "Your initial cleanup fee is waived",
      modalIntro: "A first visit can take extra time because we clear the full serviced yard before recurring maintenance begins. New recurring customers do not pay a separate fee for that initial cleanup.",
      firstThirtyLabel: "First 30 minutes",
      firstThirtyValue: "$39.99",
      additionalLabel: "Additional cleanup time",
      additionalValue: "$1 per minute",
      exampleLabel: "60-minute cleanup example",
      exampleValue: "$69.99",
      customerLabel: "Your separate initial cleanup fee",
      customerValue: "$0",
      disclaimer: "For new recurring customers only. One-time cleanups use separate pricing. Actual savings depend on the time required."
    },
    serviceZips: [
      "46011", "46013", "46014", "46015", "46016", "46032", "46033", "46034", "46037",
      "46038", "46040", "46048", "46051", "46055", "46056", "46060", "46061", "46062",
      "46064", "46074", "46075", "46077", "46112", "46113", "46122", "46123", "46140",
      "46142", "46143", "46158", "46163", "46167", "46168", "46214", "46216", "46217",
      "46220", "46221", "46227", "46228", "46231", "46234", "46236", "46237", "46239",
      "46240", "46250", "46256", "46259", "46260", "46268", "46278", "46280"
    ],
    frequencies: {
      twice: {
        label: "Twice weekly",
        sub: "For busy yards and multiple dogs",
        maxDogs: 9,
        prices: { 1: 1599, 2: 1749, 3: 1899, 4: 2049, 5: 2199, 6: 2349, 7: 2499, 8: 2649, 9: 2799 }
      },
      weekly: {
        label: "Weekly",
        sub: "The most popular maintenance plan",
        popular: true,
        maxDogs: 5,
        prices: { 1: 1999, 2: 2249, 3: 2499, 4: 2749, 5: 2999 }
      },
      biweekly: {
        label: "Every other week",
        sub: "For lighter-use yards",
        maxDogs: 4,
        prices: { 1: 2999, 2: 3349, 3: 3699, 4: 4049 }
      },
      onetime: {
        label: "One-time cleanup",
        sub: "A one-visit pet waste cleanup",
        anyDogs: true,
        flatPrice: 8999
      },
      custom: {
        label: "Custom booking",
        sub: "10+ dogs · over 1 acre · kennels & commercial",
        custom: true
      }
    },
    areaLabels: { back: "Back yard", front: "Front yard", side: "Side yard(s)" },
    areaAdders: { 1: 0, 2: 250, 3: 500 },
    yardSizes: {
      s: { label: "Up to ⅛ acre", add: 0 },
      m: { label: "Up to ¼ acre", add: 400 },
      l: { label: "Up to ½ acre", add: 800 },
      xl: { label: "Up to 1 acre", add: 1200 },
      over: { label: "Over 1 acre", custom: true }
    }
  };

  const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "wbraid", "gbraid", "fbclid"];
  const PROGRESS_LABELS = ["Area", "Plan", "Price", "Details", "Review"];
  const LOW_RISK_STORAGE_KEY = "pp_quote_progress_v3";
  const ATTRIBUTION_STORAGE_KEY = "pp_quote_attribution_v3";

  const CSS = `
    :host { all: initial; position: fixed; inset: 0; z-index: 2147483000; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0b2537; }
    *, *::before, *::after { box-sizing: border-box; }
    button, input, select, textarea { font: inherit; }
    button, a { -webkit-tap-highlight-color: transparent; }
    a { color: #0877b9; }
    .backdrop { position: fixed; inset: 0; display: grid; place-items: center; padding: 24px; background: rgba(2, 20, 32, .78); backdrop-filter: blur(10px); }
    .modal { position: relative; width: min(1180px, 100%); height: min(780px, calc(100vh - 48px)); min-height: 620px; overflow: hidden; display: grid; grid-template-columns: minmax(330px, .86fr) minmax(520px, 1.24fr); border: 1px solid rgba(255,255,255,.58); border-radius: 28px; background: #f6fbfe; box-shadow: 0 34px 100px rgba(0, 20, 35, .35); }
    .close { position: absolute; z-index: 5; top: 16px; right: 18px; width: 42px; height: 42px; border: 1px solid #cfe0e9; border-radius: 50%; background: rgba(255,255,255,.94); color: #073652; font-size: 25px; line-height: 1; cursor: pointer; box-shadow: 0 8px 22px rgba(5, 52, 80, .12); }
    .close:hover, .close:focus-visible { background: #e9f7ff; outline: 3px solid rgba(56,182,255,.28); }
    .trust { position: relative; overflow: hidden; padding: 40px 34px 28px; color: #fff; background: linear-gradient(152deg, #073652 0%, #075883 58%, #0b83bd 100%); display: flex; flex-direction: column; }
    .trust::before { content: ""; position: absolute; width: 360px; height: 360px; border-radius: 50%; right: -185px; top: -170px; background: rgba(56,182,255,.25); }
    .brand { display: flex; align-items: center; gap: 12px; position: relative; z-index: 1; }
    .brand-mark { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 14px; background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,.15); }
    .brand-mark img { width: 34px; height: 34px; object-fit: contain; }
    .brand strong { display: block; font-size: 18px; line-height: 1; letter-spacing: .07em; }
    .brand small { display: block; margin-top: 6px; color: #bfeaff; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; }
    .trust-copy { position: relative; z-index: 1; margin-top: 28px; }
    .eyebrow { display: inline-flex; align-items: center; gap: 7px; margin-bottom: 9px; color: #0a75ad; font-size: 11px; line-height: 1; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; }
    .eyebrow.light { color: #8cddff; }
    .trust h1 { margin: 0; font-size: clamp(31px, 3.2vw, 47px); line-height: 1.02; letter-spacing: -.045em; }
    .trust h1 em { color: #8cddff; font-style: normal; }
    .trust-copy > p { margin: 15px 0 0; max-width: 390px; color: #d6f2ff; font-size: 15px; line-height: 1.55; }
    .yard-art { display: block; width: 100%; height: 230px; margin: auto 0 18px; border: 1px solid rgba(255,255,255,.34); border-radius: 22px; object-fit: cover; object-position: center; box-shadow: 0 18px 34px rgba(0,0,0,.2); }
    .trust-chips { position: relative; z-index: 1; display: flex; flex-wrap: wrap; gap: 7px; margin-top: 17px; }
    .trust-chip { padding: 7px 9px; border: 1px solid rgba(255,255,255,.25); border-radius: 999px; background: rgba(3,37,56,.3); color: #e7f7ff; font-size: 10px; font-weight: 800; }
    .trust-call { position: relative; z-index: 1; margin: 12px 0 0; color: #d6f2ff; font-size: 11px; }
    .trust-call a { color: #8cddff; font-weight: 900; }
    .proof-grid { position: relative; z-index: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .proof { display: flex; gap: 9px; min-width: 0; padding: 10px; border: 1px solid rgba(255,255,255,.14); border-radius: 13px; background: rgba(3,37,56,.3); }
    .proof-icon { flex: 0 0 22px; width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%; background: #38b6ff; color: #06304a; font-weight: 950; }
    .proof strong, .proof small { display: block; }
    .proof strong { font-size: 12px; line-height: 1.2; }
    .proof small { margin-top: 3px; color: #bfe5f7; font-size: 10px; line-height: 1.25; }
    .quote-side { min-width: 0; overflow-y: auto; padding: 30px 38px 38px; background: linear-gradient(180deg, #fff 0%, #f6fbfe 100%); }
    .mobile-brand { display: none; }
    .progress { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 4px 46px 28px 0; }
    .progress-step { position: relative; display: grid; justify-items: center; gap: 6px; color: #8699a6; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
    .progress-step::after { content: ""; position: absolute; top: 14px; left: calc(50% + 17px); width: calc(100% - 26px); height: 2px; background: #dce9ef; }
    .progress-step:last-child::after { display: none; }
    .progress-dot { position: relative; z-index: 1; width: 29px; height: 29px; display: grid; place-items: center; border: 2px solid #d4e3eb; border-radius: 50%; background: #fff; color: #6f8592; }
    .progress-step.current, .progress-step.complete { color: #075f91; }
    .progress-step.current .progress-dot, .progress-step.complete .progress-dot { border-color: #38b6ff; background: #38b6ff; color: #04304a; }
    .progress-step.complete::after { background: #38b6ff; }
    .stage { outline: none; }
    .stage-header { margin-bottom: 23px; }
    .stage-header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
    .stage-header h2 { margin: 0; color: #073652; font-size: clamp(26px, 3vw, 38px); line-height: 1.08; letter-spacing: -.035em; }
    .stage-header > p { max-width: 680px; margin: 11px 0 0; color: #5a7180; font-size: 14px; line-height: 1.55; }
    .badge { flex: 0 0 auto; padding: 7px 10px; border-radius: 999px; background: #e5f6ff; color: #086e9f; font-size: 10px; font-weight: 900; letter-spacing: .05em; text-transform: uppercase; }
    .field, .field-row { margin-top: 18px; }
    .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    label, .field-label { display: block; margin-bottom: 7px; color: #17384b; font-size: 13px; font-weight: 800; }
    .input, .select, .textarea { width: 100%; border: 1px solid #c9dbe5; border-radius: 13px; background: #fff; color: #102f41; outline: none; transition: border .18s, box-shadow .18s; }
    .input, .select { height: 49px; padding: 0 13px; }
    .textarea { min-height: 110px; padding: 12px 13px; resize: vertical; }
    .input:focus, .select:focus, .textarea:focus { border-color: #38b6ff; box-shadow: 0 0 0 4px rgba(56,182,255,.16); }
    .field small { display: block; margin-top: 6px; color: #758b98; font-size: 11px; line-height: 1.4; }
    .zip-wrap { display: grid; grid-template-columns: 1fr auto; gap: 10px; }
    .choice-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; }
    .choice { position: relative; min-height: 76px; padding: 14px 96px 13px 14px; border: 1px solid #cfdee6; border-radius: 15px; background: #fff; color: #17384b; text-align: left; cursor: pointer; transition: border .16s, background .16s, transform .16s, box-shadow .16s; }
    .choice:hover:not(:disabled) { transform: translateY(-1px); border-color: #8ccce9; box-shadow: 0 8px 24px rgba(8,76,112,.08); }
    .choice[aria-pressed="true"] { border: 2px solid #087fb9; background: linear-gradient(135deg, #e7f7ff, #f8fdff); box-shadow: 0 0 0 3px rgba(56,182,255,.16), 0 10px 24px rgba(8,119,174,.12); }
    .choice[aria-pressed="true"]:hover:not(:disabled) { border-color: #087fb9; box-shadow: 0 0 0 3px rgba(56,182,255,.2), 0 12px 28px rgba(8,119,174,.16); }
    .choice:disabled { border-style: dashed; border-color: #cdd9df; background: #f2f6f8; color: #82949e; cursor: not-allowed; box-shadow: none; }
    .choice:disabled small { color: #82949e; }
    .choice:disabled .choice-check { border-color: #c7d3d9; background: #e7eef1; color: #82949e; }
    .custom-choice { grid-column: 1 / -1; min-height: 64px; }
    .custom-choice:not([aria-pressed="true"]) { border-style: dashed; border-color: #cbd7dd; background: #f7f9fa; color: #536b78; box-shadow: none; }
    .choice strong, .choice small { display: block; }
    .choice strong { font-size: 14px; }
    .choice small { margin-top: 5px; color: #718692; font-size: 11px; line-height: 1.35; }
    .choice-check { position: absolute; top: 12px; right: 12px; width: 24px; min-width: 24px; height: 24px; display: grid; place-items: center; padding: 0; border: 2px solid #b7ceda; border-radius: 50%; color: transparent; background: #fff; font-size: 10px; font-weight: 950; line-height: 1; white-space: nowrap; }
    .choice[aria-pressed="true"] .choice-check { width: auto; padding: 0 8px; border-color: #0873a8; border-radius: 999px; background: #087fb9; color: #fff; box-shadow: 0 4px 10px rgba(8,99,146,.22); font-size: 9px; letter-spacing: .05em; text-transform: uppercase; }
    .popular { display: inline-flex; align-items: center; margin-bottom: 7px; padding: 4px 8px; border: 1px solid #edc54a; border-radius: 999px; background: #fff3bd; color: #624800; font-size: 9px; font-weight: 950; letter-spacing: .07em; }
    .price-preview { display: flex; align-items: center; justify-content: space-between; gap: 15px; margin-top: 20px; padding: 14px 16px; border-radius: 14px; background: #073652; color: #d8f2ff; }
    .price-preview span { font-size: 12px; font-weight: 800; }
    .price-preview strong { color: #8bdcff; font-size: 17px; }
    .price-hero { padding: 21px; border: 1px solid #c7e8f8; border-radius: 19px; background: linear-gradient(135deg, #e9f8ff, #f9fdff); }
    .price-label { color: #4e6c7d; font-size: 12px; font-weight: 850; text-transform: uppercase; letter-spacing: .06em; }
    .price { margin-top: 5px; color: #073652; font-size: clamp(38px, 5vw, 56px); font-weight: 950; line-height: 1; letter-spacing: -.055em; }
    .price small { font-size: 14px; letter-spacing: 0; color: #4f6f80; }
    .price-hero p { margin: 11px 0 0; color: #5c7583; font-size: 12px; line-height: 1.45; }
    .line-items { margin-top: 12px; padding: 2px 15px; border: 1px solid #d9e7ee; border-radius: 14px; background: #fff; }
    .line-item, .summary-row { display: flex; justify-content: space-between; gap: 14px; padding: 11px 0; border-bottom: 1px solid #edf3f6; font-size: 12px; }
    .line-item:last-child, .summary-row:last-child { border-bottom: 0; }
    .addon { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; margin-top: 14px; padding: 15px; border: 2px solid #bad9e8; border-radius: 16px; background: #fff; cursor: pointer; }
    .addon:has(input:checked) { border-color: #38b6ff; background: #eaf8ff; }
    .addon input, .check input { width: 21px; height: 21px; margin: 0; accent-color: #159edc; }
    .addon strong, .addon small { display: block; }
    .addon small { margin-top: 4px; color: #6e8491; font-size: 11px; line-height: 1.35; }
    .addon-price { color: #0877ae; font-size: 12px; font-weight: 900; white-space: nowrap; }
    .info-list { display: grid; gap: 8px; margin-top: 17px; }
    .info-item { display: flex; align-items: flex-start; gap: 10px; color: #506c7b; font-size: 12px; line-height: 1.4; }
    .info-icon { flex: 0 0 24px; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; background: #dff5ff; color: #0576ab; font-size: 12px; font-weight: 950; }
    .notice { margin-top: 15px; padding: 13px 14px; border-left: 4px solid #38b6ff; border-radius: 10px; background: #eef9fe; color: #496875; font-size: 12px; line-height: 1.48; }
    .notice.orange { border-left-color: #ed7d32; background: #fff5ed; }
    .promotion { position: relative; margin: 0 0 20px; padding: 18px 17px 15px; border: 2px dashed #159447; border-radius: 15px; background: #effbf3; color: #26633d; }
    .promotion-badge { display: inline-flex; margin: -31px 0 8px -7px; padding: 5px 9px; border-radius: 999px; background: #117b3b; color: #fff; font-size: 9px; font-weight: 950; letter-spacing: .05em; text-transform: uppercase; }
    .promotion h3 { margin: 0; color: #126a35; font-size: 15px; line-height: 1.25; }
    .promotion p { margin: 6px 0 0; color: #34734a; font-size: 11px; line-height: 1.45; }
    .promotion-limit { display: flex; width: fit-content; max-width: 100%; margin-top: 10px; padding: 6px 9px; border: 1px solid #a9d8b9; border-radius: 999px; background: #fff; color: #0d612d; font-size: 10px; line-height: 1.3; font-weight: 950; }
    .promotion-link { display: inline-flex; margin-top: 7px; padding: 0; border: 0; border-bottom: 1px solid currentColor; background: transparent; color: #086b9b; font-size: 11px; font-weight: 900; cursor: pointer; }
    .offer-layer[hidden] { display: none; }
    .offer-layer { position: absolute; z-index: 12; inset: 0; display: grid; place-items: center; padding: 24px; background: rgba(2,20,32,.72); backdrop-filter: blur(5px); }
    .offer-dialog { width: min(520px, 100%); max-height: calc(100% - 20px); overflow-y: auto; padding: 24px; border: 2px solid #38b6ff; border-radius: 22px; background: #fff; box-shadow: 0 30px 80px rgba(0,20,35,.35); }
    .offer-dialog-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 15px; }
    .offer-dialog h2 { margin: 0; color: #073652; font-size: 24px; line-height: 1.12; }
    .offer-dialog p { color: #4f6876; font-size: 13px; line-height: 1.55; }
    .offer-close { flex: 0 0 auto; width: 34px; height: 34px; border: 1px solid #cbdde6; border-radius: 50%; background: #fff; color: #17384b; cursor: pointer; }
    .offer-table { margin-top: 14px; padding: 4px 14px; border: 1px solid #d9e7ee; border-radius: 14px; background: #f8fbfd; }
    .offer-row { display: flex; justify-content: space-between; gap: 16px; padding: 11px 0; border-bottom: 1px solid #e4edf2; color: #516c7a; font-size: 12px; }
    .offer-row:last-child { border-bottom: 0; }
    .offer-row strong { color: #17394b; text-align: right; }
    .offer-row.savings { color: #126a35; font-weight: 900; }
    .offer-row.savings strong { color: #159447; font-size: 20px; }
    .offer-disclaimer { margin-bottom: 0 !important; color: #708691 !important; font-size: 10px !important; }
    .radio-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
    .radio-card { margin: 0; }
    .radio-card input { position: absolute; opacity: 0; pointer-events: none; }
    .radio-card span { min-height: 46px; display: grid; place-items: center; padding: 8px; border: 1px solid #cbdde6; border-radius: 12px; background: #fff; color: #385767; cursor: pointer; }
    .radio-card input:checked + span { border-color: #209fd7; background: #e8f7ff; color: #075c86; box-shadow: inset 0 0 0 1px #38b6ff; }
    .radio-card input:focus-visible + span { outline: 3px solid rgba(56,182,255,.28); }
    .check { display: grid; grid-template-columns: auto 1fr; align-items: flex-start; gap: 11px; margin-top: 17px; padding: 14px; border: 1px solid #cbdce5; border-radius: 14px; background: #fff; color: #496675; font-size: 12px; font-weight: 500; line-height: 1.5; }
    .check strong { color: #173a4c; }
    .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .summary-card { padding: 16px; border: 1px solid #d7e5ec; border-radius: 16px; background: #fff; }
    .summary-card h3 { margin: 0 0 4px; color: #073652; font-size: 14px; }
    .summary-row span { color: #667e8c; }
    .summary-row strong { text-align: right; color: #17394b; }
    .error { display: none; margin-top: 16px; padding: 12px 14px; border: 1px solid #f0afa7; border-radius: 12px; background: #fff1ef; color: #9c2f22; font-size: 12px; line-height: 1.45; }
    .error.show { display: block; }
    .error ul { margin: 6px 0 0 18px; padding: 0; }
    .actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 9px; margin-top: 22px; }
    .btn { min-height: 46px; display: inline-flex; align-items: center; justify-content: center; padding: 0 17px; border: 1px solid #bcd1dc; border-radius: 12px; background: #fff; color: #224b60; font-weight: 850; font-size: 12px; text-decoration: none; cursor: pointer; }
    .btn:hover:not(:disabled) { transform: translateY(-1px); }
    .btn.primary { border-color: #ed7d32; background: #ed7d32; color: #fff; box-shadow: 0 9px 24px rgba(237,125,50,.24); }
    .btn.blue { border-color: #159edc; background: #159edc; color: #fff; }
    .btn.link { margin-right: auto; border-color: transparent; background: transparent; color: #477084; }
    .btn:disabled { opacity: .55; cursor: wait; }
    .complete { text-align: center; padding-top: 20px; }
    .success-mark { width: 68px; height: 68px; display: grid; place-items: center; margin: 0 auto 15px; border-radius: 50%; background: #38b6ff; color: #06344e; font-size: 32px; font-weight: 950; box-shadow: 0 14px 36px rgba(56,182,255,.28); }
    .complete .stage-header > p { margin-left: auto; margin-right: auto; }
    .complete .summary-card { max-width: 540px; margin: 17px auto 0; text-align: left; }
    .request-id { margin: 13px 0 0; color: #77909e; font-size: 10px; text-align: center; overflow-wrap: anywhere; }
    .help { color: #667f8d; font-size: 11px; line-height: 1.45; }
    .spinner { width: 16px; height: 16px; margin-right: 8px; border: 2px solid rgba(255,255,255,.45); border-top-color: #fff; border-radius: 50%; animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 900px) {
      .backdrop { padding: 0; background: #f5fbfe; }
      .modal { width: 100%; height: 100dvh; min-height: 0; grid-template-columns: 1fr; border: 0; border-radius: 0; }
      .trust { display: none; }
      .quote-side { padding: 20px 18px 38px; }
      .mobile-brand { display: flex; align-items: center; gap: 10px; margin: 0 50px 19px 0; color: #073652; }
      .mobile-brand .brand-mark { width: 40px; height: 40px; background: #e5f7ff; box-shadow: none; }
      .mobile-brand strong, .mobile-brand small { display: block; }
      .mobile-brand strong { font-size: 15px; letter-spacing: .06em; }
      .mobile-brand small { margin-top: 3px; color: #6b8492; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; }
      .progress { margin: 0 42px 24px 0; }
      .progress-label { display: none; }
      .close { top: 13px; right: 13px; }
      .offer-layer { position: fixed; }
    }
    @media (max-width: 620px) {
      .stage-header-row { display: block; }
      .badge { display: inline-flex; margin-top: 10px; }
      .field-row, .summary { grid-template-columns: 1fr; }
      .choice-grid { grid-template-columns: 1fr; }
      .radio-grid { grid-template-columns: 1fr; }
      .zip-wrap { grid-template-columns: 1fr; }
      .zip-wrap .btn { width: 100%; }
      .addon { grid-template-columns: auto 1fr; }
      .addon-price { grid-column: 2; }
      .actions { align-items: stretch; }
      .actions .btn:not(.link) { flex: 1 1 100%; }
      .btn.link { order: 4; width: 100%; margin: 2px 0 0; }
    }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation-duration: .01ms !important; } }
  `;

  let host = null;
  let shadow = null;
  let stageElement = null;
  let progressElement = null;
  let previousFocus = null;
  let offerPreviousFocus = null;
  let previousOverflow = "";
  let restored = false;

  function freshState() {
    return {
      step: 1,
      zip: "",
      zipIneligible: false,
      dogCount: "",
      frequency: "",
      areas: [],
      yardSize: "",
      lastCleaned: "",
      intent: "service_request",
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      address: "",
      city: "",
      startTiming: "",
      preferredContact: "text",
      smsConsent: false,
      smsConsentCapturedAt: "",
      question: "",
      termsAccepted: false,
      termsAcceptedAt: "",
      submitting: false,
      receipt: null,
      attribution: captureAttribution()
    };
  }

  let state = freshState();

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function selected(condition) { return condition ? " selected" : ""; }
  function checked(condition) { return condition ? " checked" : ""; }
  function normalizeZip(value) { return String(value || "").replace(/\D/g, "").slice(0, 5); }

  function normalizePhone(value) {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
    if (!/^\d{10}$/.test(digits)) return null;
    return { digits: digits, e164: "+1" + digits };
  }

  function formatPhone(value) {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.length > 10 && digits.startsWith("1")) digits = digits.slice(1);
    digits = digits.slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return "(" + digits.slice(0, 3) + ") " + digits.slice(3);
    return "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6);
  }

  function money(cents) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  }

  function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim()); }

  function calculateQuote(input) {
    const dogs = Number(input.dogCount);
    const frequencyId = String(input.frequency || "");
    const frequency = CONFIG.frequencies[frequencyId];
    const yard = CONFIG.yardSizes[input.yardSize];
    const areas = Array.from(new Set(Array.isArray(input.areas) ? input.areas : []))
      .filter(function (area) { return Object.prototype.hasOwnProperty.call(CONFIG.areaLabels, area); });
    const errors = [];
    if (!Number.isInteger(dogs) || dogs < 1 || dogs > 10) errors.push("Choose the number of dogs.");
    if (!frequency) errors.push("Choose a service frequency.");
    if (!yard) errors.push("Choose the serviced yard size.");
    if (!areas.length) errors.push("Choose at least one service area.");
    if (!errors.length && yard.custom && !frequency.custom) errors.push("Choose Custom booking for yards over 1 acre.");
    if (!errors.length && !frequency.custom && frequencyId !== "onetime" && !frequency.prices[dogs]) errors.push("Choose an available service frequency for this dog count.");
    if (errors.length) return { ok: false, errors: errors };

    const reasons = [];
    if (frequency.custom) reasons.push("CUSTOM_BOOKING_SELECTED");
    if (dogs >= 10 && frequencyId !== "onetime") reasons.push("DOG_COUNT_10_PLUS");
    if (yard.custom) reasons.push("YARD_OVER_ONE_ACRE");
    if (reasons.length) return {
      ok: true,
      custom: true,
      pricingVersion: CONFIG.pricingVersion,
      reasons: reasons,
      configuration: { dogCount: dogs, frequency: frequencyId, yardSize: input.yardSize, areas: areas }
    };

    if (frequencyId === "onetime") return {
      ok: true,
      custom: false,
      pricingVersion: CONFIG.pricingVersion,
      priceCents: frequency.flatPrice,
      lineItems: [{ label: "One-time cleanup · first 30 minutes", cents: frequency.flatPrice }],
      disclaimer: "The first 30 minutes are included. Additional labor is $1 per minute.",
      configuration: { dogCount: dogs, frequency: frequencyId, yardSize: input.yardSize, areas: areas }
    };

    const base = frequency.prices[dogs];
    const areaAdd = CONFIG.areaAdders[areas.length] || 0;
    const yardAdd = yard.add || 0;
    const lineItems = [{ label: frequency.label + " · " + dogs + " " + (dogs === 1 ? "dog" : "dogs"), cents: base }];
    if (areaAdd) lineItems.push({ label: areas.map(function (id) { return CONFIG.areaLabels[id]; }).join(" + "), cents: areaAdd });
    if (yardAdd) lineItems.push({ label: yard.label, cents: yardAdd });
    return {
      ok: true,
      custom: false,
      pricingVersion: CONFIG.pricingVersion,
      priceCents: base + areaAdd + yardAdd,
      lineItems: lineItems,
      disclaimer: "Your recurring maintenance price. Final service-day availability is confirmed before secure payment setup.",
      configuration: { dogCount: dogs, frequency: frequencyId, yardSize: input.yardSize, areas: areas }
    };
  }

  function currentQuote() {
    return calculateQuote({
      dogCount: state.dogCount,
      frequency: state.frequency,
      areas: state.areas,
      yardSize: state.yardSize
    });
  }

  function priceUnit() { return state.frequency === "onetime" ? "base price" : "per visit"; }

  function captureAttribution() {
    const params = new URLSearchParams(location.search);
    let saved = {};
    try { saved = JSON.parse(sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY) || "{}"); } catch (_) {}
    ATTRIBUTION_KEYS.forEach(function (key) {
      if (params.has(key)) saved[key] = String(params.get(key)).slice(0, 250);
    });
    try { sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(saved)); } catch (_) {}
    return saved;
  }

  function cookieValue(name) {
    const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : "";
  }

  function saveLowRiskProgress() {
    const safe = {
      zip: state.zip,
      dogCount: state.dogCount,
      frequency: state.frequency,
      areas: state.areas,
      yardSize: state.yardSize,
      lastCleaned: state.lastCleaned
    };
    try { sessionStorage.setItem(LOW_RISK_STORAGE_KEY, JSON.stringify(safe)); } catch (_) {}
  }

  function restoreLowRiskProgress() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(LOW_RISK_STORAGE_KEY) || "null");
      if (!saved) return;
      ["zip", "dogCount", "frequency", "areas", "yardSize", "lastCleaned"].forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(saved, key)) state[key] = saved[key];
      });
      reconcileFrequencySelection();
    } catch (_) {}
  }

  function clearLowRiskProgress() {
    try { sessionStorage.removeItem(LOW_RISK_STORAGE_KEY); } catch (_) {}
  }

  function track(name, params) {
    const safe = params || {};
    if (typeof window.gtag === "function") window.gtag("event", name, safe);
    else if (Array.isArray(window.dataLayer)) window.dataLayer.push(Object.assign({ event: name }, safe));
    if (CONFIG.tracking.firePixelEvents && name === "funnel_viewed" && typeof window.fbq === "function") {
      window.fbq("trackCustom", "QuoteFunnelViewed", safe);
    }
  }

  function trackSuccess(payload, requestId) {
    const quote = currentQuote();
    const params = {
      event_id: requestId + ":" + payload.stage,
      transaction_id: requestId,
      intent: state.intent,
      frequency: state.frequency,
      value: quote.custom ? undefined : quote.priceCents / 100,
      currency: "USD"
    };
    track(payload.stage, params);
    if (state.intent !== "service_request") return;
    if (typeof window.gtag === "function") {
      window.gtag("event", "generate_lead", params);
      if (CONFIG.tracking.googleAdsSendTo) {
        window.gtag("event", "conversion", Object.assign({}, params, { send_to: CONFIG.tracking.googleAdsSendTo, transport_type: "beacon" }));
      }
    } else if (Array.isArray(window.dataLayer)) window.dataLayer.push(Object.assign({ event: "generate_lead" }, params));
    if (CONFIG.tracking.firePixelEvents && typeof window.fbq === "function") {
      window.fbq("track", "Lead", { value: params.value, currency: "USD" }, { eventID: params.event_id });
    }
  }

  function shellHtml() {
    return `<style>${CSS}</style>
      <div class="backdrop" data-backdrop>
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="pp-stage-title">
          <button class="close" type="button" data-action="close" aria-label="Close quote builder">×</button>
          <aside class="trust" aria-label="Why homeowners choose Purge Pros">
            <div class="brand">
              <span class="brand-mark"><img src="${escapeHtml(CONFIG.brand.iconUrl)}" alt="Purge Pros icon"></span>
              <span><strong>PURGE PROS</strong><small>Pet Waste Removal</small></span>
            </div>
            <div class="trust-copy"><span class="eyebrow light">60-SECOND PRICE CHECK</span><h1>See your exact<br><em>per-visit price.</em></h1><p>A few quick questions about your dogs and your yard—that’s it. You pay per visit, never a monthly bill.</p></div>
            <div class="trust-chips"><span class="trust-chip" data-review-chip>4.9★ Google · 40 reviews</span><span class="trust-chip">Pay per visit</span><span class="trust-chip">No contracts</span><span class="trust-chip">Heads-up text before every visit</span></div>
            <p class="trust-call">Rather talk to a person? Call <a href="${CONFIG.brand.phoneHref}">${CONFIG.brand.phoneDisplay}</a></p>
            <img class="yard-art" src="${escapeHtml(CONFIG.brand.heroImageUrl)}" alt="Purge Pros professional pet waste removal service" loading="eager">
            <div class="proof-grid">
              <div class="proof"><span class="proof-icon">✓</span><span><strong>Professional local team</strong><small>Clean, uniformed service</small></span></div>
              <div class="proof"><span class="proof-icon">✓</span><span><strong>Gate photo proof</strong><small>After completed visits</small></span></div>
              <div class="proof"><span class="proof-icon">✓</span><span><strong>Sanitized equipment</strong><small>Between properties</small></span></div>
              <div class="proof"><span class="proof-icon">✓</span><span><strong>No contracts</strong><small>Pay per visit</small></span></div>
            </div>
          </aside>
          <section class="quote-side">
            <div class="mobile-brand"><span class="brand-mark"><img src="${escapeHtml(CONFIG.brand.iconUrl)}" alt="Purge Pros icon"></span><span><strong>PURGE PROS</strong><small>Pet Waste Removal</small></span></div>
            <nav class="progress" aria-label="Quote progress"></nav>
            <div class="stage" tabindex="-1" aria-live="polite"></div>
          </section>
          ${offerModalHtml()}
        </div>
      </div>`;
  }

  function promotionCardHtml() {
    if (!CONFIG.promotion.enabled) return "";
    return `<aside class="promotion" aria-label="New recurring-customer offer"><span class="promotion-badge">${escapeHtml(CONFIG.promotion.badge)}</span><h3>🎁 ${escapeHtml(CONFIG.promotion.title)}</h3><p>${escapeHtml(CONFIG.promotion.detail)}</p><span class="promotion-limit">${escapeHtml(CONFIG.promotion.eligibility)}</span><button class="promotion-link" type="button" data-action="show-offer">${escapeHtml(CONFIG.promotion.linkLabel)}</button></aside>`;
  }

  function offerModalHtml() {
    const offer = CONFIG.promotion;
    return `<div class="offer-layer" data-offer-layer hidden><section class="offer-dialog" role="dialog" aria-modal="true" aria-labelledby="pp-offer-title"><div class="offer-dialog-head"><h2 id="pp-offer-title">${escapeHtml(offer.modalTitle)}</h2><button class="offer-close" type="button" data-action="close-offer" aria-label="Close offer details">×</button></div><p>${escapeHtml(offer.modalIntro)}</p><div class="offer-table"><div class="offer-row"><span>${escapeHtml(offer.firstThirtyLabel)}</span><strong>${escapeHtml(offer.firstThirtyValue)}</strong></div><div class="offer-row"><span>${escapeHtml(offer.additionalLabel)}</span><strong>${escapeHtml(offer.additionalValue)}</strong></div><div class="offer-row"><span>${escapeHtml(offer.exampleLabel)}</span><strong>${escapeHtml(offer.exampleValue)}</strong></div><div class="offer-row savings"><span>${escapeHtml(offer.customerLabel)}</span><strong>${escapeHtml(offer.customerValue)}</strong></div></div><p class="offer-disclaimer">${escapeHtml(offer.disclaimer)}</p></section></div>`;
  }

  function stageHeader(eyebrow, title, description, badge) {
    return `<header class="stage-header"><div class="stage-header-row"><div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h2 id="pp-stage-title">${escapeHtml(title)}</h2></div>${badge ? `<span class="badge">${escapeHtml(badge)}</span>` : ""}</div><p>${escapeHtml(description)}</p></header>`;
  }

  function renderProgress() {
    if (!progressElement) return;
    progressElement.style.display = state.step > 5 ? "none" : "grid";
    progressElement.innerHTML = PROGRESS_LABELS.map(function (label, index) {
      const number = index + 1;
      const complete = state.step > number;
      const current = state.step === number;
      return `<div class="progress-step${complete ? " complete" : ""}${current ? " current" : ""}"${current ? ' aria-current="step"' : ""}><span class="progress-dot">${complete ? "✓" : number}</span><span class="progress-label">${label}</span></div>`;
    }).join("");
  }

  function renderArea() {
    stageElement.innerHTML = `${stageHeader("60-SECOND PRICE CHECK", "First, are we in your neighborhood?", "Enter your ZIP to check coverage. Then build your plan and see your exact per-visit price.", "Fast availability check")}
      <div class="field"><label for="pp-zip">Service ZIP code</label><div class="zip-wrap"><input class="input" id="pp-zip" inputmode="numeric" autocomplete="postal-code" maxlength="5" placeholder="e.g. 46032" value="${escapeHtml(state.zip)}"><button class="btn blue" type="button" data-action="check-zip">Check availability →</button></div><small>Central Indiana service area. No geolocation or account required.</small></div>
      ${state.zipIneligible ? `<div class="notice orange"><strong>We are not in ZIP ${escapeHtml(state.zip)} yet.</strong><br>We will not collect your contact information. If the address is near the edge of our routes, call <a href="${CONFIG.brand.phoneHref}">${CONFIG.brand.phoneDisplay}</a>.</div>` : ""}
      <div class="error" role="alert" tabindex="-1"></div>
      <div class="info-list"><div class="info-item"><span class="info-icon">$</span><span><strong>Clear per-visit pricing.</strong> Build the plan that fits your yard and see your exact price for each visit.</span></div><div class="info-item"><span class="info-icon">✓</span><span><strong>Nothing charged today.</strong> Secure payment setup comes only after you approve the proposed service day.</span></div><div class="info-item"><span class="info-icon">↗</span><span><strong>A dependable neighborhood service day.</strong> Our team confirms the recurring day instead of promising a slot that may not work.</span></div></div>`;
  }

  function frequencyEligibility(id, definition) {
    const dogs = Number(state.dogCount);
    if (definition.custom) return { allowed: true, note: definition.sub };
    if (state.yardSize === "over") return { allowed: false, note: "Choose Custom booking for yards over 1 acre" };
    if (definition.anyDogs || !dogs) return { allowed: true, note: definition.sub };
    if (definition.prices && definition.prices[dogs]) return { allowed: true, note: definition.sub };
    return { allowed: false, note: "Available for up to " + definition.maxDogs + " dogs" };
  }

  function reconcileFrequencySelection() {
    const definition = CONFIG.frequencies[state.frequency];
    if (!definition) {
      if (Number(state.dogCount) >= 10 || state.yardSize === "over") state.frequency = "custom";
      return;
    }
    if (frequencyEligibility(state.frequency, definition).allowed) return;
    state.frequency = Number(state.dogCount) >= 10 || state.yardSize === "over" ? "custom" : "";
  }

  function frequencyChoice(id, definition) {
    const active = state.frequency === id;
    const eligibility = frequencyEligibility(id, definition);
    const selectionStatus = eligibility.allowed ? (active ? "✓ Selected" : "") : "×";
    return `<button class="choice${definition.custom ? " custom-choice" : ""}" type="button" data-frequency="${id}" aria-pressed="${active}"${eligibility.allowed ? "" : ' disabled aria-disabled="true"'}><span class="choice-check" aria-hidden="true">${selectionStatus}</span>${definition.popular ? '<span class="popular">★ MOST POPULAR</span>' : ""}<strong>${escapeHtml(definition.label)}</strong><small>${escapeHtml(eligibility.note)}</small></button>`;
  }

  function areaChoice(id, label) {
    const active = state.areas.indexOf(id) >= 0;
    return `<button class="choice" type="button" data-area="${id}" aria-pressed="${active}"><span class="choice-check" aria-hidden="true">${active ? "✓ Selected" : ""}</span><strong>${escapeHtml(label)}</strong><small>${active ? "Included in your plan" : "Select this area"}</small></button>`;
  }

  function renderPlan() {
    const quote = currentQuote();
    const preview = quote.ok && !quote.custom ? money(quote.priceCents) + " " + priceUnit() : quote.ok && quote.custom ? "Custom estimate" : "Complete the choices above";
    stageElement.innerHTML = `${stageHeader("BUILD YOUR PLAN", "Tell us about your yard.", "Every price-changing choice starts blank, so the estimate reflects what you actually select.", "ZIP " + state.zip)}
      ${state.frequency !== "onetime" ? promotionCardHtml() : ""}
      <div class="field-row"><div class="field"><label for="pp-dogs">How many dogs use the yard?</label><select class="select" id="pp-dogs" data-field="dogCount"><option value="">Choose dogs</option>${Array.from({ length: 9 }, function (_, index) { const dog = index + 1; return `<option value="${dog}"${selected(String(dog) === String(state.dogCount))}>${dog} ${dog === 1 ? "dog" : "dogs"}</option>`; }).join("")}<option value="10"${selected(String(state.dogCount) === "10")}>10+ dogs · custom</option></select></div>
      <div class="field"><label for="pp-yard">Total lawn area we will service</label><select class="select" id="pp-yard" data-field="yardSize"><option value="">Choose yard size</option>${Object.keys(CONFIG.yardSizes).map(function (id) { const yard = CONFIG.yardSizes[id]; return `<option value="${id}"${selected(state.yardSize === id)}>${escapeHtml(yard.label)}${yard.custom ? " · custom" : ""}</option>`; }).join("")}</select><small>Use serviced lawn area, not the full parcel size.</small></div></div>
      <div class="field"><span class="field-label">How often should we scoop?</span><div class="choice-grid">${Object.keys(CONFIG.frequencies).map(function (id) { return frequencyChoice(id, CONFIG.frequencies[id]); }).join("")}</div></div>
      <div class="field"><span class="field-label">Which areas should we cover?</span><div class="choice-grid">${Object.keys(CONFIG.areaLabels).map(function (id) { return areaChoice(id, CONFIG.areaLabels[id]); }).join("")}<button class="choice" type="button" data-area="all" aria-pressed="${state.areas.length === 3}"><span class="choice-check" aria-hidden="true">${state.areas.length === 3 ? "✓ Selected" : ""}</span><strong>Yard+ · all areas</strong><small>Back, front and side yard(s)</small></button></div></div>
      <div class="field"><label for="pp-last-cleaned">When was the last full cleanup?</label><select class="select" id="pp-last-cleaned" data-field="lastCleaned"><option value="">Choose an answer</option>${["Within 1 week", "2–3 weeks", "About 1 month", "2–4 months", "5–6 months", "More than 6 months"].map(function (value) { return `<option value="${escapeHtml(value)}"${selected(state.lastCleaned === value)}>${escapeHtml(value)}</option>`; }).join("")}</select><small>This helps us plan the first visit. It does not change the recurring maintenance quote.</small></div>
      <div class="price-preview" aria-live="polite"><span>Your estimate</span><strong>${escapeHtml(preview)}</strong></div><div class="error" role="alert" tabindex="-1"></div><div class="actions"><button class="btn link" type="button" data-action="back">← Back</button><button class="btn primary" type="button" data-action="show-price">See my price →</button></div>`;
  }

  function reasonText(code) {
    return ({ CUSTOM_BOOKING_SELECTED: "custom booking selected", DOG_COUNT_10_PLUS: "10+ dogs", YARD_OVER_ONE_ACRE: "over one acre" })[code] || "manual review required";
  }

  function renderPrice() {
    const quote = currentQuote();
    if (!quote.ok) return goTo(2);
    if (quote.custom) {
      stageElement.innerHTML = `${stageHeader("PERSONALIZED REVIEW", "This yard needs a hand-built estimate.", "We will review the details and give you a specific price instead of inventing a rate that may be wrong.", "Personal follow-up")}
        <div class="notice orange"><strong>Why:</strong> ${quote.reasons.map(reasonText).join(" · ")}</div><div class="info-list"><div class="info-item"><span class="info-icon">1</span><span><strong>Send the yard details.</strong> It takes about one more minute.</span></div><div class="info-item"><span class="info-icon">2</span><span><strong>We review the scope and availability.</strong> Our team prepares the estimate.</span></div><div class="info-item"><span class="info-icon">3</span><span><strong>You decide.</strong> Nothing is charged or scheduled by this form.</span></div></div><div class="actions"><button class="btn link" type="button" data-action="back">← Change plan</button><button class="btn primary" type="button" data-action="choose-intent" data-intent="service_request">Request my estimate →</button></div>`;
      return;
    }
    stageElement.innerHTML = `${stageHeader("YOUR PURGE PROS PLAN", "Your yard, handled.", "Review your selected plan, then request service, save the quote or ask us a question.", "Upfront price")}
      <div class="price-hero"><div class="price-label">${state.frequency === "onetime" ? "One-time cleanup" : CONFIG.frequencies[state.frequency].label + " scoop service"}</div><div class="price">${money(quote.priceCents)} <small>${priceUnit()}</small></div><p>${escapeHtml(quote.disclaimer)}</p></div>
      <div class="line-items">${quote.lineItems.map(function (item) { return `<div class="line-item"><span>${escapeHtml(item.label)}</span><strong>${money(item.cents)}</strong></div>`; }).join("")}</div>
      ${state.frequency !== "onetime" ? promotionCardHtml() : ""}
      <div class="info-list"><div class="info-item"><span class="info-icon">✓</span><span>Waste hauled away and equipment sanitized</span></div><div class="info-item"><span class="info-icon">✓</span><span>No contract · pay per visit</span></div><div class="info-item"><span class="info-icon">✓</span><span>Regular service day confirmed before secure payment setup</span></div></div>
      <div class="actions"><button class="btn link" type="button" data-action="back">← Change plan</button><button class="btn" type="button" data-action="choose-intent" data-intent="question">Ask a question</button><button class="btn" type="button" data-action="choose-intent" data-intent="quote_delivery">Send me this quote</button><button class="btn primary" type="button" data-action="choose-intent" data-intent="service_request">Request service →</button></div>`;
  }

  function intentCopy() {
    if (state.intent === "quote_delivery") return { eyebrow: "SAVE YOUR QUOTE", title: "Where should we send it?", body: "Choose how you would like us to send your plan and price.", badge: "Save your quote" };
    if (state.intent === "question") return { eyebrow: "ASK PURGE PROS", title: "What can we help with?", body: "Your plan travels with the question, so you do not have to repeat the yard details.", badge: "Personal response" };
    if (state.frequency === "onetime") return { eyebrow: "REQUEST CLEANUP", title: "Tell us where the yard is.", body: "We will review the cleanup details and follow up with availability. Nothing is charged today.", badge: "About 1 minute" };
    return { eyebrow: "REQUEST SERVICE", title: "Tell us where the yard is.", body: "We will confirm the best recurring service day for your area. Nothing is charged today.", badge: "About 1 minute" };
  }

  function renderDetails() {
    const copy = intentCopy();
    const service = state.intent === "service_request";
    const question = state.intent === "question";
    const allowCall = state.intent !== "quote_delivery";
    stageElement.innerHTML = `${stageHeader(copy.eyebrow, copy.title, copy.body, copy.badge)}
      <div class="field-row"><div class="field"><label for="pp-first">First name</label><input class="input" id="pp-first" data-field="firstName" autocomplete="given-name" maxlength="80" value="${escapeHtml(state.firstName)}"></div>${service ? `<div class="field"><label for="pp-last">Last name</label><input class="input" id="pp-last" data-field="lastName" autocomplete="family-name" maxlength="80" value="${escapeHtml(state.lastName)}"></div>` : ""}</div>
      <div class="field-row"><div class="field"><label for="pp-phone">Mobile number${state.preferredContact === "email" ? " (optional)" : ""}</label><input class="input" id="pp-phone" data-field="phone" type="tel" autocomplete="tel" inputmode="numeric" maxlength="14" pattern="[0-9() -]*" placeholder="(317) 555-0123" value="${escapeHtml(state.phone)}"><small>10-digit U.S. number. Letters and extra digits are removed.</small></div><div class="field"><label for="pp-email">Email${state.preferredContact === "email" ? "" : " (optional)"}</label><input class="input" id="pp-email" data-field="email" type="email" autocomplete="email" maxlength="254" placeholder="you@example.com" value="${escapeHtml(state.email)}"></div></div>
      <div class="field"><span class="field-label">Best way to reply</span><div class="radio-grid"><label class="radio-card"><input type="radio" name="pp-preferred" value="text"${checked(state.preferredContact === "text")}><span>Text message</span></label><label class="radio-card"><input type="radio" name="pp-preferred" value="email"${checked(state.preferredContact === "email")}><span>Email</span></label>${allowCall ? `<label class="radio-card"><input type="radio" name="pp-preferred" value="call"${checked(state.preferredContact === "call")}><span>Phone call</span></label>` : ""}</div></div>
      ${state.preferredContact === "text" ? `<label class="check" for="pp-sms-consent"><input id="pp-sms-consent" type="checkbox"${checked(state.smsConsent)}><span><strong>Text me about my quote and service.</strong> I consent to receive non-marketing text messages from Purge Pros about my quote, availability, scheduling, service and account at the number provided. Message frequency varies. Message and data rates may apply. Text HELP for assistance; reply STOP to opt out.</span></label>` : ""}
      <p class="help">You may choose Email${allowCall ? " or Phone Call" : ""} instead of consenting to SMS. Review our <a href="${CONFIG.brand.privacyUrl}" target="_blank" rel="noopener">Privacy Policy</a> and <a href="${CONFIG.brand.termsUrl}" target="_blank" rel="noopener">Terms &amp; Conditions</a>.</p>
      ${service ? `<div class="field-row"><div class="field"><label for="pp-address">Service street address</label><input class="input" id="pp-address" data-field="address" autocomplete="address-line1" maxlength="120" value="${escapeHtml(state.address)}"></div><div class="field"><label for="pp-city">City</label><input class="input" id="pp-city" data-field="city" autocomplete="address-level2" maxlength="80" value="${escapeHtml(state.city)}"></div></div><div class="field"><label for="pp-start">When would you like to start?</label><select class="select" id="pp-start" data-field="startTiming"><option value="">Choose timing</option>${["As soon as possible", "Within the next week", "In the next few weeks", "Just researching for now"].map(function (value) { return `<option value="${escapeHtml(value)}"${selected(state.startTiming === value)}>${escapeHtml(value)}</option>`; }).join("")}</select></div>` : ""}
      ${question ? `<div class="field"><label for="pp-question">Your question</label><textarea class="textarea" id="pp-question" data-field="question" maxlength="1500" placeholder="What would you like to know?">${escapeHtml(state.question)}</textarea></div>` : ""}
      <div class="error" role="alert" tabindex="-1"></div><div class="actions"><button class="btn link" type="button" data-action="back">← Back</button><button class="btn primary" type="button" data-action="review">Review request →</button></div>`;
  }

  function renderReview() {
    const quote = currentQuote();
    const service = state.intent === "service_request";
    const oneTime = state.frequency === "onetime";
    const title = service ? (quote.custom ? "Review your estimate request." : "Review your service request.") : state.intent === "quote_delivery" ? "Review your quote delivery." : "Review your question.";
    stageElement.innerHTML = `${stageHeader("ONE LAST LOOK", title, "Confirm the details below. We will not schedule service or collect payment from this submission.", "Nothing charged")}
      <div class="summary"><section class="summary-card"><h3>Plan</h3><div class="summary-row"><span>Frequency</span><strong>${escapeHtml(CONFIG.frequencies[state.frequency].label)}</strong></div><div class="summary-row"><span>Dogs</span><strong>${Number(state.dogCount) >= 10 ? "10+ dogs" : escapeHtml(state.dogCount + (Number(state.dogCount) === 1 ? " dog" : " dogs"))}</strong></div><div class="summary-row"><span>Service area</span><strong>${state.areas.map(function (id) { return escapeHtml(CONFIG.areaLabels[id]); }).join(", ")}</strong></div><div class="summary-row"><span>Yard size</span><strong>${escapeHtml(CONFIG.yardSizes[state.yardSize].label)}</strong></div><div class="summary-row"><span>Scoop price</span><strong>${quote.custom ? "Custom estimate" : money(quote.priceCents) + " " + priceUnit()}</strong></div></section>
      <section class="summary-card"><h3>Contact</h3><div class="summary-row"><span>Name</span><strong>${escapeHtml((state.firstName + " " + state.lastName).trim())}</strong></div><div class="summary-row"><span>Reply by</span><strong>${escapeHtml(state.preferredContact === "call" ? "Phone call" : state.preferredContact)}</strong></div>${state.phone ? `<div class="summary-row"><span>Phone</span><strong>${escapeHtml(state.phone)}</strong></div>` : ""}${state.email ? `<div class="summary-row"><span>Email</span><strong>${escapeHtml(state.email)}</strong></div>` : ""}${service ? `<div class="summary-row"><span>Service address</span><strong>${escapeHtml(state.address + ", " + state.city + ", IN " + state.zip)}</strong></div>` : ""}</section></div>
      ${service ? `<label class="check" for="pp-terms"><input id="pp-terms" type="checkbox"${checked(state.termsAccepted)}><span>I agree to the <a href="${CONFIG.brand.termsUrl}" target="_blank" rel="noopener">Terms of Service</a> and acknowledge the <a href="${CONFIG.brand.privacyUrl}" target="_blank" rel="noopener">Privacy Policy</a>. I understand this is a request for ${oneTime ? "cleanup availability" : "service-day review"}, not a confirmed appointment.</span></label>` : `<p class="help">By submitting, you acknowledge the <a href="${CONFIG.brand.privacyUrl}" target="_blank" rel="noopener">Privacy Policy</a>.</p>`}
      <div class="error" role="alert" tabindex="-1"></div><div class="actions"><button class="btn link" type="button" data-action="back">← Edit details</button><button class="btn primary" type="button" data-action="submit"${state.submitting ? " disabled" : ""}>${state.submitting ? '<span class="spinner" aria-hidden="true"></span>Sending…' : submitLabel(quote)}</button></div>`;
  }

  function submitLabel(quote) {
    if (state.intent === "quote_delivery") return "Send my quote →";
    if (state.intent === "question") return "Send my question →";
    return quote.custom ? "Request my estimate →" : "Request my service day →";
  }

  function renderComplete() {
    const service = state.intent === "service_request";
    const quote = currentQuote();
    const oneTime = state.frequency === "onetime";
    const serviceBody = oneTime
      ? "Our team will review the cleanup details and reply with availability using your selected contact method. Nothing has been scheduled or charged."
      : "Our team will confirm the best recurring service day for your area and reply using your selected contact method. Your service is not scheduled until you approve the proposed day.";
    const nextSteps = oneTime
      ? `<div class="info-list"><div class="info-item"><span class="info-icon">1</span><span>We review the cleanup details and current availability.</span></div><div class="info-item"><span class="info-icon">2</span><span>We confirm the cleanup plan and timing with you.</span></div><div class="info-item"><span class="info-icon">3</span><span>Then we send the secure payment setup request.</span></div></div>`
      : `<div class="info-list"><div class="info-item"><span class="info-icon">1</span><span>We confirm the best recurring service day for your area.</span></div><div class="info-item"><span class="info-icon">2</span><span>You approve the proposed service day.</span></div><div class="info-item"><span class="info-icon">3</span><span>Then we send a secure payment setup request.</span></div></div>`;
    stageElement.innerHTML = `<div class="complete"><div class="success-mark" aria-hidden="true">✓</div>${stageHeader("RECEIVED", service ? "Your request is with Purge Pros." : state.intent === "quote_delivery" ? "Your quote request is in." : "Your question is in.", service ? serviceBody : "We will follow up using the reply method you selected.", "Successfully sent")}
      <div class="summary-card"><h3>What happens next</h3>${service ? nextSteps : `<p class="help">Keep an eye on ${state.preferredContact === "email" ? "your inbox" : state.preferredContact === "call" ? "your phone" : "your text messages"}. Questions? Call <a href="${CONFIG.brand.phoneHref}">${CONFIG.brand.phoneDisplay}</a>.</p>`}<div class="summary-row"><span>Your price</span><strong>${quote.custom ? "Custom estimate" : money(quote.priceCents) + " " + priceUnit()}</strong></div><p class="request-id">Reference: ${escapeHtml(state.receipt && state.receipt.requestId || "received")}</p></div><div class="actions"><button class="btn blue" type="button" data-action="close">Done</button></div></div>`;
  }

  function render() {
    if (!stageElement) return;
    renderProgress();
    if (state.step === 1) renderArea();
    if (state.step === 2) renderPlan();
    if (state.step === 3) renderPrice();
    if (state.step === 4) renderDetails();
    if (state.step === 5) renderReview();
    if (state.step === 6) renderComplete();
  }

  function showOffer() {
    const layer = shadow && shadow.querySelector("[data-offer-layer]");
    if (!layer) return;
    offerPreviousFocus = shadow.activeElement;
    layer.hidden = false;
    const closeButton = layer.querySelector('[data-action="close-offer"]');
    if (closeButton) closeButton.focus();
    track("promotion_details_viewed", { promotion: CONFIG.promotion.title });
  }

  function closeOffer() {
    const layer = shadow && shadow.querySelector("[data-offer-layer]");
    if (!layer || layer.hidden) return false;
    layer.hidden = true;
    if (offerPreviousFocus && typeof offerPreviousFocus.focus === "function") offerPreviousFocus.focus();
    offerPreviousFocus = null;
    return true;
  }

  function goTo(step) {
    state.step = step;
    render();
    const quoteSide = shadow.querySelector(".quote-side");
    if (quoteSide) quoteSide.scrollTop = 0;
    queueMicrotask(function () { if (stageElement) stageElement.focus({ preventScroll: true }); });
    track("funnel_step_viewed", { step: step });
  }

  function showError(messages) {
    const box = stageElement.querySelector(".error");
    if (!box) return;
    const list = Array.isArray(messages) ? messages : [messages];
    box.innerHTML = list.length === 1 ? escapeHtml(list[0]) : `<strong>Please fix the following:</strong><ul>${list.map(function (message) { return `<li>${escapeHtml(message)}</li>`; }).join("")}</ul>`;
    box.classList.add("show");
    box.focus();
  }

  function validatePlan() {
    const quote = currentQuote();
    const errors = quote.errors ? quote.errors.slice() : [];
    if (!state.lastCleaned) errors.push("Choose when the yard was last fully cleaned.");
    return errors;
  }

  function validateDetails() {
    const errors = [];
    const service = state.intent === "service_request";
    if (!state.firstName.trim()) errors.push("Enter your first name.");
    if (service && !state.lastName.trim()) errors.push("Enter your last name.");
    if ((service || state.preferredContact !== "email") && !normalizePhone(state.phone)) errors.push("Enter a valid 10-digit phone number.");
    if (state.preferredContact === "email" && !validEmail(state.email)) errors.push("Enter a valid email address.");
    if (state.preferredContact === "text" && !state.smsConsent) errors.push(state.intent === "quote_delivery" ? "To choose Text, select the service-text permission or choose Email." : "To choose Text, select the service-text permission or choose Email/Phone call.");
    if (service && !state.address.trim()) errors.push("Enter the service street address.");
    if (service && !state.city.trim()) errors.push("Enter the service city.");
    if (service && !state.startTiming) errors.push("Choose when you would like to start.");
    if (state.intent === "question" && state.question.trim().length < 5) errors.push("Enter your question.");
    return errors;
  }

  function requestId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "pp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
  }

  function buildPayload() {
    const quote = currentQuote();
    const phone = normalizePhone(state.phone);
    const id = requestId();
    let stage = "service_requested";
    let question = state.question.trim();
    if (state.intent === "question") stage = "question_submitted";
    if (state.intent === "quote_delivery") {
      stage = "quote_requested";
      question = "Quote delivery requested by " + state.preferredContact + ".";
    }
    if (state.intent === "service_request" && quote.custom) stage = "estimate_requested";
    return {
      schemaVersion: "cloudflare-widget.v3",
      requestId: id,
      eventId: id + ":" + stage,
      stage: stage,
      intent: state.intent,
      zip: state.zip,
      dogs: String(state.dogCount),
      frequency: CONFIG.frequencies[state.frequency].label,
      frequencyId: state.frequency,
      areas: state.areas.map(function (id) { return CONFIG.areaLabels[id]; }).join(" & "),
      areaIds: state.areas,
      yardSize: CONFIG.yardSizes[state.yardSize].label,
      yardSizeId: state.yardSize,
      lastCleaned: state.lastCleaned,
      startTiming: state.startTiming,
      perVisitPrice: quote.custom ? "" : (quote.priceCents / 100).toFixed(2),
      clientPriceCents: quote.custom ? null : quote.priceCents,
      pricingVersion: quote.pricingVersion,
      customEstimate: Boolean(quote.custom),
      customReasons: quote.reasons || [],
      phone: phone ? phone.digits : "",
      phoneE164: phone ? phone.e164 : "",
      firstName: state.firstName.trim(),
      lastName: state.lastName.trim(),
      email: state.email.trim().toLowerCase(),
      street: state.address.trim(),
      city: state.city.trim(),
      state: "IN",
      preferredContact: state.preferredContact,
      smsTransactionalConsent: state.smsConsent,
      consent: state.smsConsent ? "yes" : "no",
      consentVersion: state.smsConsent ? CONFIG.consentVersion : "",
      smsConsentCapturedAt: state.smsConsent ? state.smsConsentCapturedAt || new Date().toISOString() : "",
      termsAccepted: state.intent === "service_request" ? state.termsAccepted : false,
      termsVersion: state.intent === "service_request" ? CONFIG.termsVersion : "",
      termsAcceptedAt: state.intent === "service_request" && state.termsAccepted ? state.termsAcceptedAt || new Date().toISOString() : "",
      question: question,
      notes: state.intent === "service_request" ? "Submitted through transparent-price Cloudflare widget." : "",
      page: location.href.slice(0, 1000),
      attribution: state.attribution,
      gclid: state.attribution.gclid || "",
      fbclid: state.attribution.fbclid || "",
      fbp: cookieValue("_fbp"),
      fbc: cookieValue("_fbc") || (state.attribution.fbclid ? "fb.1." + Date.now() + "." + state.attribution.fbclid : ""),
      submittedAt: new Date().toISOString(),
      website: ""
    };
  }

  async function submit() {
    if (state.submitting) return;
    if (state.intent === "service_request" && !state.termsAccepted) return showError("Agree to the Terms of Service and acknowledge the Privacy Policy before submitting.");
    const detailErrors = validateDetails();
    if (detailErrors.length) return showError(detailErrors);
    const payload = buildPayload();
    state.submitting = true;
    renderReview();
    try {
      let body = { accepted: true, requestId: payload.requestId };
      if (CONFIG.leadEndpoint) {
        const controller = new AbortController();
        const timeout = window.setTimeout(function () { controller.abort(); }, 15000);
        let response;
        try {
          response = await fetch(CONFIG.leadEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            credentials: "omit",
            signal: controller.signal
          });
        } finally {
          window.clearTimeout(timeout);
        }
        const text = await response.text();
        if (text) {
          try { body = JSON.parse(text); } catch (_) { body = { accepted: response.ok, requestId: payload.requestId }; }
        }
        if (!response.ok || body.accepted === false) throw new Error(body.message || "We could not save your request. Please try again.");
      } else {
        console.info("Purge Pros demo submission", payload);
      }
      state.receipt = { requestId: body.requestId || payload.requestId };
      trackSuccess(payload, state.receipt.requestId);
      clearLowRiskProgress();
      state.submitting = false;
      goTo(6);
    } catch (error) {
      state.submitting = false;
      renderReview();
      const message = error && error.name === "AbortError"
        ? "This is taking longer than expected. Please try again or call " + CONFIG.brand.phoneDisplay + "."
        : error && error.message || "We could not send this request. Please try again or call " + CONFIG.brand.phoneDisplay + ".";
      showError(message);
    }
  }

  function handleInput(event) {
    const target = event.target;
    if (target.id === "pp-zip") {
      state.zip = normalizeZip(target.value);
      target.value = state.zip;
      state.zipIneligible = false;
      return;
    }
    if (target.id === "pp-phone") {
      const formatted = formatPhone(target.value);
      target.value = formatted;
      state.phone = formatted;
      return;
    }
    const field = target.dataset && target.dataset.field;
    if (field) state[field] = target.value;
  }

  function handleChange(event) {
    const target = event.target;
    const field = target.dataset && target.dataset.field;
    if (field) state[field] = target.value;
    if (target.name === "pp-preferred") {
      state.preferredContact = target.value;
      if (state.preferredContact !== "text") {
        state.smsConsent = false;
        state.smsConsentCapturedAt = "";
      }
      renderDetails();
      return;
    }
    if (target.id === "pp-sms-consent") {
      state.smsConsent = target.checked;
      state.smsConsentCapturedAt = target.checked ? new Date().toISOString() : "";
    }
    if (target.id === "pp-terms") {
      state.termsAccepted = target.checked;
      state.termsAcceptedAt = target.checked ? new Date().toISOString() : "";
    }
    if (field && state.step === 2) {
      if (field === "dogCount" || field === "yardSize") reconcileFrequencySelection();
      saveLowRiskProgress();
      renderPlan();
    }
  }

  function handleClick(event) {
    const frequencyButton = event.target.closest("[data-frequency]");
    if (frequencyButton) {
      state.frequency = frequencyButton.dataset.frequency;
      saveLowRiskProgress();
      renderPlan();
      return;
    }
    const areaButton = event.target.closest("[data-area]");
    if (areaButton) {
      const id = areaButton.dataset.area;
      if (id === "all") state.areas = state.areas.length === 3 ? [] : Object.keys(CONFIG.areaLabels);
      else state.areas = state.areas.indexOf(id) >= 0 ? state.areas.filter(function (item) { return item !== id; }) : state.areas.concat(id);
      saveLowRiskProgress();
      renderPlan();
      return;
    }
    const button = event.target.closest("[data-action]");
    if (!button) {
      if (event.target.matches("[data-offer-layer]")) return closeOffer();
      if (event.target.matches("[data-backdrop]")) close();
      return;
    }
    const action = button.dataset.action;
    if (action === "show-offer") return showOffer();
    if (action === "close-offer") return closeOffer();
    if (action === "close") return close();
    if (action === "check-zip") {
      state.zip = normalizeZip(stageElement.querySelector("#pp-zip").value);
      if (state.zip.length !== 5) return showError("Enter a valid 5-digit ZIP code.");
      if (CONFIG.serviceZips.indexOf(state.zip) < 0) {
        state.zipIneligible = true;
        track("service_area_ineligible", { zip_prefix: state.zip.slice(0, 3) });
        return renderArea();
      }
      state.zipIneligible = false;
      saveLowRiskProgress();
      track("service_area_eligible", { zip_prefix: state.zip.slice(0, 3) });
      return goTo(2);
    }
    if (action === "show-price") {
      const errors = validatePlan();
      if (errors.length) return showError(errors);
      saveLowRiskProgress();
      const quote = currentQuote();
      track("price_viewed", { frequency: state.frequency, custom: quote.custom, value: quote.custom ? undefined : quote.priceCents / 100 });
      return goTo(3);
    }
    if (action === "choose-intent") {
      state.intent = button.dataset.intent;
      if (state.intent === "quote_delivery" && state.preferredContact === "call") state.preferredContact = "text";
      state.termsAccepted = false;
      state.termsAcceptedAt = "";
      return goTo(4);
    }
    if (action === "review") {
      const errors = validateDetails();
      if (errors.length) return showError(errors);
      return goTo(5);
    }
    if (action === "submit") return submit();
    if (action === "back") return goTo(Math.max(1, state.step - 1));
  }

  function handleKeydown(event) {
    if (event.key === "Enter" && event.target.id === "pp-zip") {
      event.preventDefault();
      const button = stageElement.querySelector('[data-action="check-zip"]');
      if (button) button.click();
    }
    if (event.key === "Tab" && shadow) {
      const focusable = Array.from(shadow.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter(function (element) { return element.getClientRects().length > 0; });
      if (focusable.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = shadow.activeElement;
        if (event.shiftKey && (active === first || !active)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    if (event.key === "Escape") {
      event.stopPropagation();
      if (!closeOffer()) close();
    }
  }

  function hydrateReviews() {
    if (!CONFIG.reviewsEndpoint || !shadow) return;
    fetch(CONFIG.reviewsEndpoint).then(function (response) {
      if (!response.ok) throw new Error("reviews unavailable");
      return response.json();
    }).then(function (data) {
      const reviewChip = shadow.querySelector("[data-review-chip]");
      if (reviewChip && data.rating && data.count) reviewChip.textContent = CONFIG.brand.reviewChipTemplate.replace("{rating}", data.rating).replace("{count}", data.count);
    }).catch(function () {});
  }

  function open() {
    if (host) return;
    previousFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    if (!restored) { restoreLowRiskProgress(); restored = true; }
    host = document.createElement("div");
    host.id = "purge-pros-quote-widget";
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = shellHtml();
    document.body.appendChild(host);
    document.body.style.overflow = "hidden";
    stageElement = shadow.querySelector(".stage");
    progressElement = shadow.querySelector(".progress");
    shadow.addEventListener("input", handleInput);
    shadow.addEventListener("change", handleChange);
    shadow.addEventListener("click", handleClick);
    shadow.addEventListener("keydown", handleKeydown);
    render();
    hydrateReviews();
    queueMicrotask(function () { if (stageElement) stageElement.focus(); });
    track("funnel_viewed", { presentation: "cloudflare_widget" });
  }

  function close() {
    if (!host) return;
    host.remove();
    host = null;
    shadow = null;
    stageElement = null;
    progressElement = null;
    document.body.style.overflow = previousOverflow;
    if (state.step === 6) {
      state = freshState();
      clearLowRiskProgress();
    }
    if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
  }

  document.addEventListener("click", function (event) {
    const trigger = event.target.closest && event.target.closest('[data-purge-quote], a[href="#quote"], a[href="#get-quote"]');
    if (!trigger) return;
    event.preventDefault();
    open();
  });
  document.addEventListener("keydown", function (event) { if (event.key === "Escape" && host) close(); });

  window.PurgeProsQuote = { open: open, close: close, config: CONFIG };
})();
