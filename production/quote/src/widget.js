/*!
 * Purge Pros — transparent-price quote and service-request widget.
 * Self-contained, dependency-free, and hosted by the existing Cloudflare Worker.
 *
 * Embed: <script src="https://YOUR-HOST/purge-quote.js" defer></script>
 * Open:  links to #quote / #get-quote, [data-purge-quote], PurgeProsQuote.open(),
 *        or a landing URL containing ?open_quote=1.
 */
(function () {
  "use strict";
  if (window.PurgeProsQuote) return;

  const CONFIG = {
    uiVersion: "2026-09-12-website-improvements-v1",
    uiBuildVersion: "2026-09-13-selected-improvements-v1",
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
      iconUrl: "https://images.leadconnectorhq.com/image/f_webp/q_80/r_96/u_https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/69ffe0d6a7b9e0385a45dea3.png",
      heroImageUrl: "https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa7bf6d49f830e49b15f5f7.webp",
      privacyUrl: "https://itspurgepros.com/privacy-policy",
      termsUrl: "https://itspurgepros.com/terms-conditions",
      reviewChipTemplate: "{rating}/5 on Google · {count} reviews"
    },
    consentVersion: "service-sms-2026-08-v1",
    termsVersion: "2026-09-08-checkout-clarity",
    pricingVersion: "2026-08-cloudflare-v1",
    promotion: {
      "enabled": true,
      "badge": "NEW RECURRING CUSTOMER OFFER",
      "title": "Initial scoop surcharge waived",
      "detail": "Start with a clean yard at your regular visit price—even if there is built-up poop.",
      "eligibility": "One offer per customer/household for new recurring service. We check service history before confirming your booking. One-time cleanups excluded.",
      "linkLabel": "See how the offer works",
      "modalTitle": "Your new-customer offer",
      "modalIntro": "Your initial scoop clears accumulated dog poop so regular service can begin. With the new-customer offer, you pay your regular visit price for the entire first cleanup. The initial scoop surcharge is waived, with no additional-time charge. Scheduled recurring visits also stay at your quoted rate, regardless of time spent.",
      "firstThirtyLabel": "Standard initial/restart · first 30 minutes",
      "firstThirtyValue": "Your quoted visit rate",
      "additionalLabel": "Standard initial cleanup · after 30 minutes",
      "additionalValue": "$1 per additional minute",
      "exampleLabel": "Standard 60-minute cleanup · example",
      "exampleValue": "Your visit rate + $30",
      "customerLabel": "Promotional first cleanup · all cleanup time",
      "customerValue": "Your visit rate · no time surcharge",
      "disclaimer": "Without this offer, initial or restart service includes 30 minutes at your quoted visit rate, then $1 per additional minute. No second maintenance charge is added. The base is charged with your on-the-way ETA text; applicable extra time is billed after completion. No minimum visits, no cancellation fee and no discount repayment. Savings depend on the extra cleanup time needed; no fixed saving is promised."
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
  const LAST_CLEANED_CHOICES = ["Within 1 week", "2–3 weeks", "About 1 month", "2–4 months", "5–6 months", "More than 6 months"];
  const LOW_RISK_STORAGE_KEY = "pp_quote_progress_v3";
  const ATTRIBUTION_STORAGE_KEY = "pp_quote_attribution_v3";

  const ICON_ASSET_URLS = {"waste-bag":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a216bc55ee8d569af108.webp","property-notes":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a2162e74dc36120b0302.webp","chevron":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a21698106dcc4e208c10.webp","next-arrow":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a216c73b042e1413e0f1.webp","alert":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a216cb032a1c8e04fb24.webp","phone":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a215cb032a1c8e04fb0c.webp","close":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a216a19db9abccb86b39.webp","search":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a21598106dcc4e208c05.webp","deodorize":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a21590b7ca67e9c39b75.webp","yard":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a21598106dcc4e208bcc.webp","yard-guide":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a2152e74dc36120b02b2.webp","local-area":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a21590b7ca67e9c39b6a.webp","secure-payment":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a2159f8b31b6ab2dc63c.webp","scoop":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a215bc55ee8d569af0b0.webp","dog":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a214c73b042e1413e09f.webp","service-calendar":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a2142e74dc36120b0277.webp","professional-team":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a214bc55ee8d569af05c.webp","sanitized-tools":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a214196984c40805b168.webp","per-visit-price":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a2149f8b31b6ab2dc606.webp","no-contract":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a2142e74dc36120b0281.webp","gate-photo":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a213c73b042e1413e061.webp","service-check":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a21347854373d7b0926a.webp","offer-cursor":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a213a19db9abccb86ad1.webp","visit-message":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a21398106dcc4e208b25.webp","mascot-silhouette":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a213196984c40805b128.webp","review-star":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a213cb032a1c8e04fa97.webp","number-badge":"https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9ab16c73b042e1414df4e.webp"};
  const QUOTE_ICON_ASSET_URLS = {"dog-1":"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/dog-1-60f0fbcba79e6a9c.webp","dog-2":"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/dog-2-e0e397af347ee3f9.webp","dog-3":"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/dog-3-822b6e9094776e97.webp","dog-4":"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/dog-4-5fdebb0b04647f45.webp","dog-5":"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/dog-5-23834884974cc56f.webp","dog-6":"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/dog-6-227e16dc7c2b79e2.webp","dog-7":"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/dog-7-8c7caea43d40fddb.webp","dog-8":"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/dog-8-db0553778399db0b.webp","dog-9":"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/dog-9-1ccbf539edbd1dd3.webp","dog-10plus":"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/dog-10plus-8ba06412d09ba969.webp","frequency-twice-weekly":"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/frequency-twice-weekly-78c69397d2394de7.webp","frequency-weekly":"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/frequency-weekly-65b4093d534a415b.webp","frequency-every-other-week":"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/frequency-every-other-week-3422d28d15710e49.webp","frequency-one-time":"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/frequency-one-time-b38038be6d617033.webp","frequency-custom":"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/frequency-custom-dda9b32a1c5aa361.webp","area-back":"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/area-back-bbe3069b44528c92.webp","area-front":"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/area-front-14e3b8436febc23b.webp","area-sides":"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/area-sides-e5e09e238daebab7.webp","area-all":"https://purge-pros-site-assets.purgepros.workers.dev/assets/quote-icons/area-all-1dd76e604febce38.webp"};
  const QUOTE_ICON_KEYS = new Set(Object.keys(QUOTE_ICON_ASSET_URLS));
  const ICON_KEYS = new Set([...["review-star","offer-cursor","mascot-silhouette","gate-photo","sanitized-tools","professional-team","no-contract","per-visit-price","service-calendar","visit-message","service-check","local-area","dog","yard","secure-payment","scoop","deodorize","yard-guide","phone","next-arrow","search","chevron","close","alert","waste-bag","property-notes","number-badge"], ...QUOTE_ICON_KEYS]);
  function iconHtml(key, className = "icon") {
    if (!ICON_KEYS.has(key)) throw new Error("Unknown icon asset: " + key);
    const source = QUOTE_ICON_ASSET_URLS[key] || ICON_ASSET_URLS[key];
    return "<img class=\"" + className + "\" src=\"" + source + "\" alt=\"\" aria-hidden=\"true\" decoding=\"async\">";
  }  const CSS = `
    .yard-guide{margin-top:12px;border:1px solid #b5d6bf;border-radius:12px;background:#f6fbf7;overflow:hidden}
    .yard-guide summary{padding:12px;cursor:pointer;font-weight:700;color:#184d2c}
    .yard-guide summary:focus-visible{outline:3px solid #f59b32;outline-offset:-3px}
    .yard-guide-body{padding:0 12px 12px;font-size:13px;line-height:1.5}
    .yard-guide-body p{margin:10px 0}.yard-guide svg{display:block;width:100%;max-width:400px;height:auto;margin:auto;font-family:inherit}
    .yard-guide-lead{font-size:18px;font-weight:800;line-height:1.3;color:#153d2a}
    .yard-property{margin:16px 0;background:#fff;border:1px solid #d3e2d7;border-radius:16px;padding:12px}
    .yard-property figcaption{display:grid;gap:3px;margin-bottom:10px;color:#244a34;font-size:14px}.yard-property figcaption span{font-size:12px;color:#496452}
    .yard-property .yard-example-note{font-size:12px;color:#52625a;margin:10px 0 0}
    .yard-scope-note{padding:12px;border-left:3px solid #267547;background:#e7f2e8;border-radius:0 8px 8px 0}
    .yard-guide table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}
    .yard-guide caption{text-align:left;font-weight:700;margin-bottom:6px}
    .yard-guide th,.yard-guide td{text-align:left;padding:7px 4px;border-bottom:1px solid #d7e5da}
    .yard-guide .yard-selected{background:#d9f4d7;color:#165327}

    :host { all: initial; position: fixed; inset: 0; z-index: 2147483000; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0b2537; }
    *, *::before, *::after { box-sizing: border-box; }
    button, input, select, textarea { font: inherit; }
    button, a { -webkit-tap-highlight-color: transparent; }
    a { color: #0877b9; }
    .icon { display: block; flex: 0 0 auto; width: 24px; height: 24px; object-fit: contain; }
    .field-label-with-icon { display: inline-flex; align-items: center; gap: 7px; }
    .field-label-icon { width: 20px; height: 20px; }
    .field label > .field-label-icon { vertical-align: middle; margin-right: 6px; }
    .action-icon, .action-arrow-icon { width: 24px; height: 24px; object-fit: contain; }
    .action-chevron { width: 22px; height: 22px; object-fit: contain; }
    .action-chevron-back { transform: rotate(90deg); }
    .close, .offer-close { display: grid; place-items: center; }
    .close-icon, .offer-close-icon { width: 20px; height: 20px; object-fit: contain; }
    .info-icon { flex: 0 0 26px; width: 26px; height: 26px; object-fit: contain; }
    .yard-guide-summary { display: inline-flex; align-items: center; gap: 7px; }
    .yard-guide summary { list-style: none; }
    .yard-guide summary::-webkit-details-marker { display: none; }
    .yard-guide-icon, .yard-guide-chevron { width: 20px; height: 20px; }
    .yard-guide-chevron { transition: transform .16s ease; }
    .yard-guide[open] .yard-guide-chevron { transform: rotate(180deg); }
    .trust-mascot { position: absolute; z-index: 0; top: -68px; right: -76px; width: 220px; height: 220px; object-fit: contain; opacity: .14; pointer-events: none; }
    .backdrop { position: fixed; inset: 0; display: grid; place-items: center; padding: 24px; background: rgba(2, 20, 32, .78); backdrop-filter: blur(10px); }
    .modal { position: relative; width: min(1180px, 100%); height: min(780px, calc(100vh - 48px)); min-height: 620px; overflow: hidden; display: grid; grid-template-columns: minmax(330px, .86fr) minmax(520px, 1.24fr); border: 1px solid rgba(255,255,255,.58); border-radius: 28px; background: #f6fbfe; box-shadow: 0 34px 100px rgba(0, 20, 35, .35); }
    .close { position: absolute; z-index: 5; top: 16px; right: 18px; width: 42px; height: 42px; border: 1px solid #cfe0e9; border-radius: 50%; background: rgba(255,255,255,.94); color: #073652; font-size: 25px; line-height: 1; cursor: pointer; box-shadow: 0 8px 22px rgba(5, 52, 80, .12); }
    .close:hover, .close:focus-visible { background: #e9f7ff; outline: 3px solid rgba(56,182,255,.28); }
    .trust { position: relative; min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scroll-padding-block: 18px; padding: 28px 30px 22px; color: #fff; background: linear-gradient(152deg, #073652 0%, #075883 58%, #0b83bd 100%); display: flex; flex-direction: column; }
    @media (min-width: 901px) and (max-width: 1100px) {
      .trust { padding: 24px 24px 20px; }
      .trust .yard-art { height: clamp(150px, 22vh, 170px); }
    }
    .trust::before { content: none; }
    .brand { display: flex; align-items: center; gap: 12px; position: relative; z-index: 1; }
    .brand-mark { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 14px; background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,.15); }
    .brand-mark img { width: 34px; height: 34px; object-fit: contain; }
    .brand strong { display: block; font-size: 18px; line-height: 1; letter-spacing: .07em; }
    .brand small { display: block; margin-top: 6px; color: #bfeaff; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; }
    .trust-copy { position: relative; z-index: 1; margin-top: 18px; }
    .eyebrow { display: inline-flex; align-items: center; gap: 7px; margin-bottom: 9px; color: #0a75ad; font-size: 11px; line-height: 1; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; }
    .eyebrow.light { color: #8cddff; }
    .trust h1 { margin: 0; font-size: clamp(31px, 3.2vw, 47px); line-height: 1.02; letter-spacing: -.045em; }
    .trust h1 em { color: #8cddff; font-style: normal; }
    .trust-copy > p { margin: 11px 0 0; max-width: 390px; color: #d6f2ff; font-size: 14px; line-height: 1.45; }
    .yard-art { display: block; width: 100%; height: clamp(184px, 24vh, 230px); margin: auto 0 12px; border: 1px solid rgba(255,255,255,.34); border-radius: 22px; object-fit: cover; object-position: center; box-shadow: 0 18px 34px rgba(0,0,0,.2); }
    .trust-chips { position: relative; z-index: 1; display: grid; gap: 10px; margin-top: 12px; }
    .review-chip { display: inline-flex; align-items: center; gap: 7px; width: max-content; max-width: 100%; min-height: 40px; padding: 8px 11px; border: 1px solid rgba(255,220,100,.68); border-radius: 14px; background: rgba(3,37,56,.3); color: #fff; text-decoration: none; }
    .review-chip:hover { border-color: #f6d45a; background: rgba(3,37,56,.5); }
    .review-chip:focus-visible { outline: 3px solid #f6d45a; outline-offset: 3px; }
    .review-star-icon { width: 18px; height: 18px; }
    .review-chip-copy { color: #fff; font-size: 11px; font-weight: 900; white-space: nowrap; }
     .trust-benefits { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 14px; }
     .trust-chip { min-width: 0; min-height: 22px; height: 22px; display: flex; align-items: center; gap: 7px; padding: 0; border: 0; border-radius: 0; background: transparent; color: #e7f7ff; font-size: 11px; font-weight: 800; line-height: 22px; }
     .trust-benefits .trust-chip:last-child { grid-column: 1 / -1; }
     .trust-benefit-icon { width: 22px; height: 22px; }
    .trust-call { position: relative; z-index: 1; display: flex; align-items: center; gap: 6px; margin: 8px 0 0; color: #d6f2ff; font-size: 11px; }
    .trust-call-icon { width: 16px; height: 16px; }
    .trust-call a { color: #8cddff; font-weight: 900; }
    .proof-grid { position: relative; z-index: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .proof { display: flex; gap: 8px; min-width: 0; padding: 8px; border: 1px solid rgba(255,255,255,.14); border-radius: 13px; background: rgba(3,37,56,.3); }
    .proof-icon { flex: 0 0 26px; width: 26px; height: 26px; display: grid; place-items: center; border-radius: 9px; background: rgba(56,182,255,.22); }
    .proof-icon-image { width: 21px; height: 21px; }
    .proof strong, .proof small { display: block; }
    .proof strong { font-size: 12px; line-height: 1.2; }
    .proof small { margin-top: 3px; color: #bfe5f7; font-size: 10px; line-height: 1.25; }
    .quote-side { min-width: 0; overflow-y: auto; padding: 30px 38px 38px; background: linear-gradient(180deg, #fff 0%, #f6fbfe 100%); }
    .mobile-brand { display: none; }
    .progress { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 4px 46px 28px 0; }
    .progress-step { position: relative; display: grid; justify-items: center; gap: 6px; color: #8699a6; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
    .progress-step::after { content: ""; position: absolute; top: 14px; left: calc(50% + 17px); width: calc(100% - 26px); height: 2px; background: #dce9ef; }
    .progress-step:last-child::after { display: none; }
    .progress-dot { position: relative; z-index: 1; width: 29px; height: 29px; display: grid; place-items: center; border: 2px solid #d4e3eb; border-radius: 50%; background: #fff url("https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9ab16c73b042e1414df4e.webp") center / cover no-repeat; color: #6f8592; opacity: .45; }
    .progress-check-icon { width: 16px; height: 16px; }
    .progress-step.current .progress-dot, .progress-step.complete .progress-dot { opacity: 1; }
    .info-icon-number { flex: 0 0 28px; width: 28px; height: 28px; display: grid; place-items: center; padding: 0; border-radius: 10px; background: #0d617f url("https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9ab16c73b042e1414df4e.webp") center / cover no-repeat; color: #fff; font-size: 13px; font-weight: 950; line-height: 1; }
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
    .choice:hover:not(:disabled) { transform: none; border-color: #8ccce9; box-shadow: 0 8px 24px rgba(8,76,112,.08); }
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
    .choice-check { position: absolute; top: 12px; right: 12px; width: 24px; min-width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 0; border: 2px solid #b7ceda; border-radius: 50%; color: transparent; background: #fff; font-size: 9px; font-weight: 950; line-height: 1; white-space: nowrap; }
    .choice-check-icon { width: 14px; height: 14px; }
    .choice[aria-pressed="true"] .choice-check { width: auto; padding: 0 8px; border-color: #0873a8; border-radius: 999px; background: #087fb9; color: #fff; box-shadow: 0 4px 10px rgba(8,99,146,.22); letter-spacing: .02em; text-transform: uppercase; }
    .popular { display: inline-flex; align-items: center; gap: 5px; margin-bottom: 7px; padding: 4px 8px; border: 1px solid #edc54a; border-radius: 999px; background: #fff3bd; color: #624800; font-size: 9px; font-weight: 950; letter-spacing: .07em; }
    .popular-star-icon { width: 13px; height: 13px; }
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
    .info-icon { flex: 0 0 26px; width: 26px; height: 26px; padding: 4px; border-radius: 9px; background: #dff5ff; }
    .notice { margin-top: 15px; padding: 13px 14px; border-left: 4px solid #38b6ff; border-radius: 10px; background: #eef9fe; color: #496875; font-size: 12px; line-height: 1.48; }

    .coverage-result { display:flex; gap:16px; align-items:flex-start; margin:0 0 24px; padding:23px; border:2px solid #bd591c; border-radius:16px; background:#fff4e9; color:#6f2b0d; }
    .coverage-result:focus { outline:3px solid #bd591c; outline-offset:4px; }
    .coverage-mark { display:grid; place-items:center; flex:0 0 38px; width:38px; height:38px; padding:7px; border-radius:12px; background:#a94713; }
    .coverage-mark-icon { width:24px; height:24px; }
    .coverage-kicker { margin:0 0 8px; font-size:11px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }
    .coverage-result h2 { margin:0 0 12px; color:#702909; font-size:clamp(27px,3vw,36px); line-height:1.12; letter-spacing:-.035em; }
    .coverage-result p:last-child { margin:0; font-size:15px; line-height:1.6; color:#763f22; }
    .input.coverage-input[aria-invalid="true"] { border:2px solid #bd591c; background:#fffcf8; }
    .coverage-contact { padding:18px 0 0; border-top:1px solid #d8e6ed; color:#496677; font-size:14px; line-height:1.6; }
    .coverage-contact strong { color:#173e54; }
    .coverage-contact p { margin:5px 0 0; }
    @media(max-width:600px){ .coverage-result{padding:18px 15px;gap:11px;margin-bottom:20px}.coverage-mark{flex-basis:28px;height:28px;font-size:21px}.coverage-result h2{font-size:27px}.coverage-result p:last-child{font-size:14px} }

    .notice.orange { border-left-color: #ed7d32; background: #fff5ed; }
    .offer-summary{margin:16px 0;padding:13px 15px;border:1px solid #b7d6c3;border-left:3px solid #267547;border-radius:10px;background:#f2faf5;color:#215e3b;font-size:13px;line-height:1.5;text-align:left}
    .offer-summary strong{font-size:14px}.offer-summary p{margin:5px 0}.offer-scope{font-size:12px;color:#415f4d}
    .offer-costs{margin:12px 0}.offer-costs div{display:flex;justify-content:space-between;gap:14px;padding:7px 0;border-bottom:1px solid #d3e5d9}.offer-costs dd{margin:0;font-weight:800;text-align:right}
    .offer-summary .offer-savings{font-weight:750;color:#215e3b}.offer-costs .first-visit{align-items:center;color:#073652;font-weight:800}.offer-costs .first-visit dd{font-size:24px;white-space:nowrap}
    .offer-summary .promotion-link{min-height:44px;font-size:12px}
    .field-error{color:#a62828;font-size:13px;margin:6px 0 12px}[aria-invalid="true"]{border:2px solid #b52e2e!important}
    .error-jump{background:transparent;border:0;color:inherit;text-decoration:underline;text-align:left;padding:6px 0;cursor:pointer}
    .field small,.help{color:#526b79}.choice small{color:#526b79}
    button:focus-visible,summary:focus-visible,a:focus-visible{outline:3px solid #096b9d;outline-offset:3px}
    .input,.select,.textarea{scroll-margin-top:60px;scroll-margin-bottom:24px}
    .plan-footer{background:#fff;padding-top:1px}.plan-footer .error:not(.show){display:none}
    @media(max-width:620px){
      .input,.select,.textarea{font-size:16px}.promotion-link,.error-jump{min-height:44px}
      .plan-footer{position:sticky;bottom:-38px;z-index:2;margin:16px -18px -38px;padding:10px 18px calc(12px + env(safe-area-inset-bottom));border-top:1px solid #c9dbe5;box-shadow:0 -5px 15px rgba(7,54,82,.06)}
      .plan-footer .price-preview{margin:0;padding:5px 0;background:#fff;color:#17384b}.plan-footer .price-preview strong{color:#075f91}
      .plan-footer .actions{margin:5px 0 0;flex-wrap:nowrap}.plan-footer .actions .btn.link{order:0;flex:0 0 auto;width:auto;font-size:13px;padding:10px}.plan-footer .actions .btn.primary{flex:1;font-size:15px}
      .plan-footer:has(.error.show){position:static;margin-bottom:0}.plan-footer .error{max-height:none}
      .choice{min-height:72px}.offer-summary{padding:11px 12px}.stage-header{margin-bottom:18px}
    }
    .promotion { position: relative; margin: 0 0 20px; padding: 18px 17px 15px; border: 2px dashed #159447; border-radius: 15px; background: #effbf3; color: #26633d; }
    .promotion-badge { display: inline-flex; margin: -31px 0 8px -7px; padding: 5px 9px; border-radius: 999px; background: #117b3b; color: #fff; font-size: 9px; font-weight: 950; letter-spacing: .05em; text-transform: uppercase; }
    .promotion h3 { margin: 0; color: #126a35; font-size: 15px; line-height: 1.25; }
    .promotion p { margin: 6px 0 0; color: #34734a; font-size: 11px; line-height: 1.45; }
    .promotion-limit { display: flex; width: fit-content; max-width: 100%; margin-top: 10px; padding: 6px 9px; border: 1px solid #a9d8b9; border-radius: 999px; background: #fff; color: #0d612d; font-size: 10px; line-height: 1.3; font-weight: 950; }
    .promotion-link { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 44px; margin-top: 10px; padding: 9px 13px; border: 1px solid #84c9e8; border-radius: 10px; background: #f2fbff; color: #075f91; font-size: 12px; font-weight: 900; line-height: 1.2; cursor: pointer; text-decoration: none; transition: background .16s, border-color .16s, box-shadow .16s, transform .16s; }
    .promotion-link-icon { width: 26px; height: 26px; }
    .promotion-link:hover { border-color: #0877b9; background: #e2f5ff; box-shadow: 0 4px 12px rgba(8,119,185,.16); transform: translateY(-1px); }
    .promotion-link:focus-visible { outline: 3px solid #38b6ff; outline-offset: 3px; }
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
    .radio-card input:focus-visible + span { outline: 3px solid #096b9d; outline-offset: 3px; }
    .check { display: grid; grid-template-columns: auto 1fr; align-items: flex-start; gap: 11px; margin-top: 17px; padding: 14px; border: 1px solid #cbdce5; border-radius: 14px; background: #fff; color: #496675; font-size: 12px; font-weight: 500; line-height: 1.5; }
    .check strong { color: #173a4c; }
    .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .summary-card { padding: 16px; border: 1px solid #d7e5ec; border-radius: 16px; background: #fff; }
    .summary-card h3 { margin: 0 0 4px; color: #073652; font-size: 14px; }
    .price-plan { margin: 16px 0; }
    .price-plan-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 12px; align-items: stretch; }
    .price-plan-grid > * { min-width: 0; }
    .price-plan-grid .price-hero { padding: 18px; }
    .price-plan-grid .price { font-size: clamp(36px, 4vw, 48px); }
    .price-plan-grid .price small { display: block; margin-top: 8px; }
    .price-plan-grid .price-plan { margin: 0; padding: 14px; }
    .price-plan-grid .summary-row { padding: 9px 0; gap: 8px; }
    .price-plan-grid .summary-row > span { flex: 0 0 62px; font-size: 11px; }
    @media (max-width: 620px) { .price-plan-grid { grid-template-columns: 1fr; } }
    .summary-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
    .summary-heading h3 { margin: 0; }
    .summary-edit { min-height: 44px; padding: 7px 10px; border: 1px solid #c9e0ed; border-radius: 9px; background: #f3faff; color: #075f91; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; flex-shrink: 0; }
    .summary-edit:hover { background: #e5f4fc; }
    .summary-edit:focus-visible { outline: 3px solid #0877b9; outline-offset: 2px; }
    .summary-edit:disabled { opacity: .55; cursor: default; }
    .summary-row strong { min-width: 0; overflow-wrap: anywhere; }
    .summary-row span { color: #667e8c; }
    .summary-row strong { text-align: right; color: #17394b; }
    .error { display: none; margin-top: 16px; padding: 12px 14px; border: 1px solid #f0afa7; border-radius: 12px; background: #fff1ef; color: #9c2f22; font-size: 12px; line-height: 1.45; }
    .error.show { display: block; }
    .error ul { margin: 6px 0 0 18px; padding: 0; }
    .actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 9px; margin-top: 22px; }
    .btn { min-height: 46px; display: inline-flex; align-items: center; justify-content: center; padding: 0 17px; border: 1px solid #bcd1dc; border-radius: 12px; background: #fff; color: #224b60; font-weight: 850; font-size: 12px; text-decoration: none; cursor: pointer; }
    .btn:hover:not(:disabled) { transform: none; }
    .btn.primary { border-color: #ed7d32; background: #ed7d32; color: #fff; box-shadow: 0 9px 24px rgba(237,125,50,.24); }
    .btn.blue { border-color: #159edc; background: #159edc; color: #fff; }
    .btn.link { margin-right: auto; border-color: transparent; background: transparent; color: #477084; }
    .btn:disabled { opacity: .55; cursor: wait; }
    .stage > .complete { text-align: center; padding-top: 20px; }
    .success-mark { width: 68px; height: 68px; display: grid; place-items: center; margin: 0 auto 15px; border-radius: 50%; background: #38b6ff; box-shadow: 0 14px 36px rgba(56,182,255,.28); }
    .success-mark-icon { width: 34px; height: 34px; }
    .complete .stage-header > p { margin-left: auto; margin-right: auto; }
    .complete .summary-card { max-width: 540px; margin: 17px auto 0; text-align: left; }
    .request-id { margin: 13px 0 0; color: #77909e; font-size: 10px; text-align: center; overflow-wrap: anywhere; }
    .help { color: #526b79; font-size: 11px; line-height: 1.45; }
    .check .field-error { grid-column: 2; margin: 0; }
    .spinner { width: 16px; height: 16px; margin-right: 8px; border: 2px solid rgba(255,255,255,.45); border-top-color: #fff; border-radius: 50%; animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    /* Keep the Plan estimate and next action in the desktop form pane. */
    @media (min-width: 901px) {
      .plan-footer { position: sticky; bottom: -38px; z-index: 2; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; margin: 18px -38px -38px; padding: 12px 20px; border-top: 1px solid #c9dbe5; background: #fff; box-shadow: 0 -5px 15px rgba(7,54,82,.06); }
      .plan-footer .price-preview { display: grid; gap: 3px; margin: 0; padding: 0; background: #fff; color: #17384b; }
      .plan-footer .price-preview strong { color: #075f91; font-size: 17px; }
      .plan-footer .actions { margin: 0; gap: 8px; flex-wrap: nowrap; }
      .plan-footer .actions .btn { min-height: 44px; padding: 10px 13px; font-size: 14px; }
      .plan-footer .error { grid-column: 1 / -1; }
      .plan-footer:has(.error.show) { position: static; margin-bottom: 0; }
    }
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
      .progress-label { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
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
      .actions .btn.primary { order: -1; }
      .btn.link { order: 4; width: 100%; margin: 2px 0 0; }
    }
    /* SEL-08: retain reachable content on short desktop viewports and clear focus. */
    .close, .offer-close { min-width: 44px; min-height: 44px; }
    .close:focus-visible, .offer-close:focus-visible { outline: 3px solid #096b9d; outline-offset: 3px; }
    .quote-side, .offer-dialog { overscroll-behavior: contain; scroll-padding-block: 18px 100px; }
    [data-resume-notice]:focus-visible, #pp-save-plan-status:focus-visible { outline: 3px solid #096b9d; outline-offset: 3px; }
    @media (min-width: 901px) and (max-height: 700px) {
      .modal { min-height: 0; height: calc(100vh - 48px); height: calc(100dvh - 48px); }
      .trust { overflow-y: auto; scroll-padding-block: 18px; }
    }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation-duration: .01ms !important; } }


    /* 2026-09-20 isolated rebuild: focused quote workspace. */
    .backdrop { padding: 18px; background: rgba(2, 28, 44, .72); }
    .modal { width: min(1380px, 100%); height: min(900px, calc(100dvh - 36px)); min-height: 640px; display: block; border-radius: 24px; background: #f8fcff; }
    .trust { display: none !important; }
    .quote-side { height: 100%; overflow-y: auto; scroll-padding-top: 176px; padding: 0 42px 42px; background: linear-gradient(180deg, #fff 0, #f8fcff 100%); }
    .quote-topbar { position: sticky; top: 0; z-index: 4; min-height: 82px; display: grid; grid-template-columns: minmax(220px, 1fr) auto minmax(300px, 1fr); align-items: center; gap: 22px; margin: 0 -42px 24px; padding: 12px 78px 12px 42px; border-bottom: 1px solid #d8e7ef; background: rgba(255,255,255,.97); box-shadow: 0 8px 22px rgba(7,54,82,.04); }
    .quote-topbar .mobile-brand { display: flex; align-items: center; gap: 10px; margin: 0; color: #062644; }
    .quote-topbar .mobile-brand .brand-mark { width: 46px; height: 46px; background: #e8f8ff; box-shadow: none; }
    .quote-topbar .mobile-brand strong, .quote-topbar .mobile-brand small { display: block; }
    .quote-topbar .mobile-brand strong { font-size: 17px; letter-spacing: .07em; }
    .quote-topbar .mobile-brand small { margin-top: 4px; color: #6b8492; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; }
    .quote-topbar-title { margin: 0; color: #425f75; font-size: 16px; font-weight: 850; text-align: center; }
    .quote-topbar-actions { display: flex; align-items: center; justify-content: flex-end; gap: 16px; min-width: 0; }
    .top-review, .top-help { display: inline-flex; align-items: center; gap: 7px; color: #075f91; font-size: 12px; font-weight: 800; text-decoration: none; }
    .top-review:hover, .top-help:hover { text-decoration: underline; }
    .top-review:focus-visible, .top-help:focus-visible { outline: 3px solid #18aef5; outline-offset: 4px; border-radius: 5px; }
    .top-review img, .top-help img { width: 22px; height: 22px; }
    .progress { width: min(690px, calc(100% - 80px)); margin: 0 auto 24px; }
    .progress-label { font-size: 11px; }
    .stage { width: min(1120px, 100%); margin: 0 auto; scroll-margin-top: 176px; }
    .stage-header { position: relative; min-height: 104px; margin-bottom: 20px; padding-right: 118px; }
    .stage-header h2 { font-size: clamp(32px, 4vw, 50px); }
    .stage-illustration { position: absolute; top: 0; right: 0; width: 94px; height: 94px; display: grid; place-items: center; border: 1px solid #bfe4f5; border-radius: 26px; background: linear-gradient(145deg, #e7f8ff, #fff); box-shadow: 0 14px 30px rgba(7,54,82,.1); }
    .stage-illustration img { width: 72px; height: 72px; object-fit: contain; }
    .stage-illustration .badge { position: absolute; right: 0; bottom: -9px; max-width: 148px; white-space: nowrap; box-shadow: 0 5px 14px rgba(7,54,82,.08); }
    .plan-layout { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(330px, .85fr); gap: 28px; align-items: start; }
    .plan-builder { min-width: 0; padding: 24px; border: 1px solid #d7e6ee; border-radius: 20px; background: #fff; box-shadow: 0 16px 36px rgba(7,54,82,.06); }
    .plan-builder .field:first-child { margin-top: 0; }
    .plan-builder .choice { min-height: 104px; }
    .dog-choice-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
    .dog-choice { position: relative; min-height: 106px; display: grid; place-items: center; align-content: center; gap: 4px; padding: 10px 8px; border: 1px solid #c9dce7; border-radius: 15px; background: #fff; color: #17384b; cursor: pointer; }
    .dog-choice:hover { border-color: #7fc8e8; box-shadow: 0 8px 22px rgba(8,76,112,.08); }
    .dog-choice[aria-pressed="true"] { border: 2px solid #087fb9; background: linear-gradient(145deg, #dff5ff, #fff); box-shadow: 0 0 0 3px rgba(56,182,255,.16); }
    .dog-choice-art { width: 56px; height: 56px; object-fit: contain; }
    .dog-choice strong { font-size: 13px; }
    .dog-selected-marker { position: absolute; top: 7px; right: 7px; width: 25px; height: 25px; display: none; place-items: center; border-radius: 50%; background: #18aef5; box-shadow: 0 4px 10px rgba(6,38,68,.2); }
    .dog-choice[aria-pressed="true"] .dog-selected-marker { display: grid; }
    .dog-selected-marker img { width: 16px; height: 16px; object-fit: contain; }
    .more-dogs { margin-top: 10px; }
    .more-dogs summary { width: fit-content; min-height: 44px; display: flex; align-items: center; gap: 8px; padding: 0 14px; border: 1px solid #9dcfe7; border-radius: 14px; background: #fff; color: #062644; font-size: 13px; font-weight: 850; cursor: pointer; }
    .more-dogs summary::marker { color: #18aef5; }
    .more-dogs[open] summary { margin-bottom: 10px; background: #eaf8ff; border-color: #18aef5; }
    .dog-choice-grid-more { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .choice { padding-left: 84px; }
    .choice-art { position: absolute; top: 50%; left: 15px; width: 52px; height: 52px; object-fit: contain; transform: translateY(-50%); }
    .custom-choice .choice-art { width: 48px; height: 48px; }
    .dog-choice .dog-choice-art, .choice[data-frequency] .choice-art, .choice[data-area] .choice-art { mix-blend-mode: multiply; }
    .plan-rail { position: sticky; top: 106px; min-width: 0; overflow: hidden; border: 1px solid #cfe1eb; border-radius: 22px; background: #fff; box-shadow: 0 20px 48px rgba(7,54,82,.12); }
    .plan-rail-head { padding: 20px 22px; background: linear-gradient(135deg, #062644, #075f91); color: #fff; }
    .plan-rail-head span { display: block; color: #bfeaff; font-size: 11px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
    .plan-rail-head strong { display: block; margin-top: 6px; font-size: 28px; line-height: 1.05; }
    .plan-rail-body { padding: 22px; }
    .plan-rail-price { padding-bottom: 18px; border-bottom: 1px solid #d9e7ee; }
    .plan-rail-price strong { display: block; color: #062644; font-size: clamp(38px, 4.5vw, 58px); line-height: 1; letter-spacing: -.045em; }
    .plan-rail-price strong small { color: #587487; font-size: 17px; letter-spacing: 0; }
    .plan-rail-price span { display: block; margin-top: 7px; color: #5c7483; font-size: 12px; }
    .plan-rail-list { display: grid; gap: 9px; padding: 18px 0; }
    .plan-rail-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; color: #617987; font-size: 12px; }
    .plan-rail-row strong { max-width: 62%; color: #17394b; text-align: right; }
    .plan-rail .offer-summary { margin: 0; padding: 16px; border-radius: 15px; }
    .plan-rail .offer-summary p { margin: 6px 0 0; font-size: 11px; }
    .plan-rail .offer-scope { display: none; }
    .plan-rail .promotion-link { margin-top: 10px; }
    .plan-rail-benefits { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 16px 0; }
    .plan-rail-benefit { display: flex; align-items: center; gap: 7px; color: #31566b; font-size: 11px; font-weight: 800; }
    .plan-rail-benefit img { width: 24px; height: 24px; }
    .btn { border-radius: 14px; }
    .btn.primary, .btn.blue { border-color: #18aef5; background: #18aef5; color: #062644; box-shadow: 0 9px 24px rgba(24,174,245,.24); }
    .btn:not(.primary):not(.blue):not(.link), .promotion-link, .summary-edit { border-color: #9dcfe7; border-radius: 14px; background: #fff; color: #062644; }
    .btn.link { color: #075f91; }
    .plan-rail .btn.primary { width: 100%; min-height: 54px; background: #18aef5; border-color: #18aef5; font-size: 15px; }
    .offer-summary { position: relative; min-height: 102px; padding-left: 92px !important; overflow: hidden; }
    .offer-summary::before { content: ""; position: absolute; left: 16px; top: 17px; width: 62px; height: 62px; background: url("https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a215bc55ee8d569af0b0.webp") center / contain no-repeat; }
    .plan-rail .offer-summary { padding-left: 76px !important; }
    .plan-rail .offer-summary::before { left: 12px; width: 52px; height: 52px; }
    .plan-error { width: min(720px, 100%); }
    .plan-footer { display: none; }
    .price-plan-grid { grid-template-columns: minmax(0, 1.35fr) minmax(300px, .65fr); gap: 18px; }
    .price-plan-grid .price-hero { display: flex; flex-direction: column; justify-content: center; min-height: 250px; padding: 28px; border-radius: 20px; }
    .price-plan-grid .price { font-size: clamp(54px, 7vw, 78px); }
    .price-hero-top { display: flex; align-items: center; gap: 16px; }
    .price-hero-art { width: 72px; height: 72px; flex: 0 0 72px; object-fit: contain; }
    .coverage-result { margin: 34px auto 26px; padding: 30px; border-width: 3px; box-shadow: 0 18px 40px rgba(169,71,19,.12); }
    .coverage-mark { flex: 0 0 92px; width: 92px; height: 92px; border: 1px solid #e2a47d; border-radius: 28px; background: #fff; }
    .coverage-mark-icon { width: 68px; height: 68px; }
    .coverage-result h2 { font-size: clamp(34px, 5vw, 52px); }
    .stage:has(.coverage-result) { max-width: 780px; }
    @media (max-width: 1100px) {
      .quote-topbar { grid-template-columns: 1fr auto; }
      .quote-topbar-title { display: none; }
      .top-review { display: none; }
      .plan-layout { grid-template-columns: minmax(0, 1.35fr) minmax(300px, .65fr); gap: 20px; }
    }
    @media (min-width: 901px) and (max-height: 700px) {
      .plan-footer { position: sticky; bottom: 0; z-index: 5; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; margin: 18px -42px 0; padding: 11px 42px 12px; border-top: 1px solid #c9dbe5; background: rgba(255,255,255,.98); box-shadow: 0 -8px 24px rgba(7,54,82,.11); }
      .plan-footer .price-preview { display: grid; gap: 2px; margin: 0; padding: 0; background: transparent; color: #17384b; }
      .plan-footer .price-preview strong { color: #075f91; }
      .plan-footer .actions { margin: 0; flex-wrap: nowrap; }
      .plan-footer .actions .btn { min-height: 46px; }
    }
    @media (max-width: 900px) {
      .backdrop { padding: 0; }
      .modal { width: 100%; height: 100dvh; min-height: 0; border-radius: 0; }
      .quote-side { scroll-padding-top: 148px; padding: 0 18px 38px; }
      .quote-topbar { min-height: 70px; grid-template-columns: 1fr; margin: 0 -18px 18px; padding: 10px 64px 10px 18px; }
      .quote-topbar .mobile-brand { margin: 0; }
      .quote-topbar-actions { display: none; }
      .close { top: 12px; right: 12px; }
      .progress { width: 100%; margin: 0 0 22px; }
      .stage { scroll-margin-top: 148px; }
      .progress-label { position: static; width: auto; height: auto; margin: 0; overflow: visible; clip-path: none; white-space: normal; font-size: 9px; }
      .stage-header h2 { font-size: clamp(31px, 9vw, 44px); }
      .stage-header { min-height: 82px; padding-right: 88px; }
      .stage-illustration { width: 72px; height: 72px; border-radius: 20px; }
      .stage-illustration img { width: 54px; height: 54px; }
      .stage-illustration .badge { display: none; }
      .plan-layout { display: block; }
      .plan-builder { padding: 0; border: 0; background: transparent; box-shadow: none; }
      .plan-rail { display: none; }
      .plan-error { width: 100%; }
      .plan-footer { position: sticky; bottom: -38px; z-index: 3; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 9px; margin: 18px -18px -38px; padding: 10px 18px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid #c9dbe5; background: #fff; box-shadow: 0 -8px 24px rgba(7,54,82,.11); }
      .plan-footer .price-preview { margin: 0; padding: 0; background: #fff; }
      .plan-footer .price-preview strong { font-size: 17px; }
      .plan-footer .actions { margin: 0; flex-wrap: nowrap; }
      .plan-footer .actions .btn.link { display: none; }
      .plan-footer .actions .btn.primary { min-height: 48px; padding-inline: 16px; }
      .price-plan-grid { grid-template-columns: 1fr; }
      .price-plan-grid .price-hero { min-height: 0; }
      .stage:has(.price-plan) { padding-bottom: 86px; }
      .stage:has(.price-plan) > .actions { position: fixed; z-index: 4; right: 0; bottom: 0; left: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; margin: 0; padding: 10px 18px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid #c9dbe5; background: #fff; box-shadow: 0 -8px 24px rgba(7,54,82,.11); }
      .stage:has(.price-plan) > .actions .btn:not(.primary):not(.link) { display: none; }
      .stage:has(.price-plan) > .actions .btn.link { order: 0; width: auto; margin: 0; padding-inline: 8px; }
      .stage:has(.price-plan) > .actions .btn.primary { order: 1; width: 100%; min-height: 48px; }
    }
    @media (max-width: 620px) {
      .dog-choice-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
      .dog-choice-grid-more { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .dog-choice { min-height: 90px; padding: 8px 4px; }
      .dog-choice-art { width: 48px; height: 48px; }
      .plan-builder .choice-grid { grid-template-columns: 1fr 1fr; }
      .plan-builder .choice { min-height: 106px; padding: 38px 10px 12px 66px; }
      .choice-art { left: 10px; width: 44px; height: 44px; }
      .plan-builder .choice small { font-size: 9px; }
      .plan-builder .choice .popular { position: absolute; top: 6px; left: 10px; max-width: calc(100% - 44px); margin: 0; padding: 3px 5px; gap: 4px; font-size: 8px; letter-spacing: .04em; white-space: nowrap; }
      .plan-builder .choice .popular-star-icon { width: 12px; height: 12px; }
      .plan-builder .choice .choice-check { top: 8px; right: 8px; }
      @media (max-width: 360px) {
        .plan-builder .field:has(> .choice-grid > [data-frequency]) .choice-grid { grid-template-columns: 1fr; }
      }
      .plan-builder .choice[aria-pressed="true"] .choice-check { width: 26px; min-width: 26px; padding: 0; }
      .plan-builder .choice-check span { display: none; }
      .coverage-result { padding: 22px 17px; }
      .coverage-mark { flex-basis: 72px; width: 72px; height: 72px; }
      .coverage-mark-icon { width: 52px; height: 52px; }
      .coverage-result h2 { font-size: 32px; }
    }
  `;


  // SEL-08: isolate active dialogs, preserve original page state, and contain focus.
  let quoteInertRecords = new Map();
  let offerInertRecords = new Map();
  let quoteBodyObserver = null;
  let redirectingQuoteFocus = false;

  function inertQuoteElement(element, records) {
    if (!element || records.has(element)) return;
    records.set(element, element.getAttribute("inert"));
    element.setAttribute("inert", "");
  }
  function restoreQuoteInert(records) {
    records.forEach(function (value, element) {
      if (value === null) element.removeAttribute("inert");
      else element.setAttribute("inert", value);
    });
    records.clear();
  }
  function quoteTabStops(root) {
    const candidates = Array.from(root.querySelectorAll('a[href], summary, button, input, select, textarea, [tabindex]'))
      .filter(function (element) {
        return element.tabIndex >= 0 && !element.disabled && !element.closest('[inert], [hidden]') &&
          element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
      });
    // Native radio groups contribute only the selected radio (or the first one).
    return candidates.filter(function (element) {
      if (element.type !== "radio" || !element.name) return true;
      const group = candidates.filter(function (other) { return other.type === "radio" && other.name === element.name && other.form === element.form; });
      return element === (group.find(function (other) { return other.checked; }) || group[0]);
    });
  }
  function quoteFocusRoot() {
    return shadow && (shadow.querySelector('[data-offer-layer]:not([hidden])') || shadow);
  }
  function focusQuoteStage() {
    if (!stageElement) return;
    const target = stageElement.querySelector("#pp-coverage-result") || stageElement;
    target.focus({ preventScroll: true });
  }
  function containQuoteFocus(event) {
    if (!host || !shadow || redirectingQuoteFocus) return;
    const root = quoteFocusRoot();
    const active = shadow.activeElement;
    const path = event.composedPath ? event.composedPath() : [];
    if ((event.target === host || path.indexOf(host) >= 0) && active && root.contains(active)) return;
    redirectingQuoteFocus = true;
    try {
      const target = root === shadow ? stageElement : quoteTabStops(root)[0];
      if (target) target.focus({ preventScroll: true });
    } finally { redirectingQuoteFocus = false; }
  }
  function isolateQuotePage() {
    Array.from(document.body.children).forEach(function (element) {
      if (element !== host) inertQuoteElement(element, quoteInertRecords);
    });
    if (typeof MutationObserver === "function") {
      quoteBodyObserver = new MutationObserver(function () {
        if (!host) return;
        Array.from(document.body.children).forEach(function (element) {
          if (element !== host) inertQuoteElement(element, quoteInertRecords);
        });
      });
      quoteBodyObserver.observe(document.body, { childList: true });
    }
    document.addEventListener("focusin", containQuoteFocus, true);
  }
  function releaseQuotePage() {
    if (quoteBodyObserver) quoteBodyObserver.disconnect();
    quoteBodyObserver = null;
    document.removeEventListener("focusin", containQuoteFocus, true);
    restoreQuoteInert(offerInertRecords);
    restoreQuoteInert(quoteInertRecords);
    offerPreviousFocus = null;
  }
  function isolateQuoteOffer(layer) {
    const modal = shadow && shadow.querySelector(".modal");
    if (!modal) return;
    Array.from(modal.children).forEach(function (element) {
      if (element !== layer) inertQuoteElement(element, offerInertRecords);
    });
  }
  function returnQuoteFocus() {
    let target = previousFocus;
    previousFocus = null;
    if (!target || !target.isConnected || target === document.body || target.disabled || target.closest('[inert], [hidden]') || !target.getClientRects().length) {
      target = Array.from(document.querySelectorAll('[data-purge-quote], a[href="#quote"], a[href="#get-quote"]'))
        .find(function (element) { return !element.disabled && !element.closest('[inert], [hidden]') && element.getClientRects().length; });
    }
    if (target && typeof target.focus === "function") { target.focus({ preventScroll: true }); return; }
    // Auto-open can have no trigger. Restore a neutral page focus without adding a tab stop.
    const bodyTabIndex = document.body.getAttribute("tabindex");
    document.body.setAttribute("tabindex", "-1");
    document.body.focus({ preventScroll: true });
    if (bodyTabIndex === null) document.body.removeAttribute("tabindex");
    else document.body.setAttribute("tabindex", bodyTabIndex);
  }
  function trapQuoteTab(event) {
    const root = quoteFocusRoot();
    if (!root) return;
    const stops = quoteTabStops(root);
    if (!stops.length) { event.preventDefault(); focusQuoteStage(); return; }
    const active = shadow.activeElement;
    const first = stops[0], last = stops[stops.length - 1];
    if (stops.indexOf(active) < 0) {
      // Step/status containers are focusable but deliberately not tab stops.
      // Continue in DOM order rather than dropping focus onto the page behind us.
      const ordered = event.shiftKey ? stops.slice().reverse() : stops;
      const direction = event.shiftKey ? 2 : 4; // PRECEDING / FOLLOWING
      const next = active && root.contains(active) && ordered.find(function (element) {
        return Boolean(active.compareDocumentPosition(element) & direction);
      });
      event.preventDefault();
      (next || (event.shiftKey ? last : first)).focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault(); first.focus();
    }
  }


  function syncSubmittingUi() {
    if (!shadow || !stageElement) return;
    const closeButton = shadow.querySelector('.close');
    if (closeButton) closeButton.disabled = state.submitting;
    if (!state.submitting) return;
    stageElement.querySelectorAll('button, input, select, textarea').forEach(function (control) { control.disabled = true; });
    if (!stageElement.querySelector('#pp-sending-status')) {
      stageElement.insertAdjacentHTML('beforeend', '<p class="notice" id="pp-sending-status" role="status" tabindex="-1">Sending your request. Please wait a moment before closing.</p>');
    }
  }
  function focusSendingStatus() {
    const status = stageElement && stageElement.querySelector('#pp-sending-status');
    if (status) status.focus({ preventScroll: true });
    else focusQuoteStage();
  }

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
      yardHelpOpen: false,
      lastCleaned: "",
      customerStatus: "",
      intent: "service_request",
      reviewEdit: null,
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
      pendingSubmission: null,
      submissionReviewMessage: "",
      attribution: captureAttribution()
    };
  }

  // No identity, contact fields, consent, request IDs or attribution travel in save links.
  let pendingPlanToken = takePlanResumeToken();
  let resumeLoading = false;
  let resumeNotice = "";
  let resumeSave = { fingerprint: "", url: "", busy: false, message: "" };

  function resetPlanResumeUiOnClose() {
    resumeLoading = false;
    // A closed host will ignore its pending response. Let a reopened plan save again.
    // Completed links remain usable; closing never silently starts another save.
    if (resumeSave.busy) resumeSave = { fingerprint: resumeSave.fingerprint, url: resumeSave.url,
      busy: false, message: resumeSave.url ? resumeSave.message : "" };
  }
  function activePlanSave(attempt, activeHost) {
    if (activeHost !== host || resumeSave !== attempt) return false;
    if (attempt.fingerprint !== JSON.stringify(planResumePayload())) {
      // The selections changed while the request was pending, even if Price has
      // not rendered yet. Do not strand a completed attempt in the busy state.
      resumeSave = { fingerprint: "", url: "", busy: false, message: "" };
      return false;
    }
    return true;
  }

  function takePlanResumeToken() {
    if (typeof window.__ppTakePlanToken === "function") return window.__ppTakePlanToken();
    if (!/^#resume=/.test(location.hash || "")) return "";
    const match = /^#resume=([A-Za-z0-9_-]{43})$/.exec(location.hash);
    try { history.replaceState(history.state, "", location.pathname + location.search); } catch (_) { return "invalid"; }
    return match ? match[1] : "invalid";
  }
  function planResumeEndpoint(opening) {
    if (!CONFIG.leadEndpoint) throw new Error("Save links are unavailable in this preview.");
    return new URL(opening ? "/quote-resume/open" : "/quote-resume", CONFIG.leadEndpoint).href;
  }
  function planResumePayload() {
    return { zip: state.zip, dogs: Number(state.dogCount), frequencyId: state.frequency,
      yardSizeId: state.yardSize, areaIds: state.areas.slice().sort(), customerStatus: state.customerStatus };
  }
  async function planResumeFetch(body, opening) {
    const controller = new AbortController();
    const timer = window.setTimeout(function () { controller.abort(); }, 12000);
    try {
      const response = await fetch(planResumeEndpoint(opening), { method: "POST", credentials: "omit",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal,
        cache: "no-store", referrerPolicy: "no-referrer", redirect: "error" });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error(result.message || "The save link is unavailable. Please try again later or build a new quote.");
      return result;
    } finally { window.clearTimeout(timer); }
  }
  function renderPlanResumeControls() {
    if (!stageElement || state.step !== 3) return;
    const fingerprint = JSON.stringify(planResumePayload());
    if (resumeSave.fingerprint !== fingerprint) resumeSave = { fingerprint: fingerprint, url: "", busy: false, message: "" };
    const saved = Boolean(resumeSave.url);
    stageElement.insertAdjacentHTML("beforeend", `<div class="summary-card" data-resume-save>
      <h3>Keep this plan for later</h3>
      <p class="help">Open your plan on another device for 7 days. The link saves your plan selections only. Prices and offers may change.</p>
      ${saved ? `<div class="field"><label for="pp-saved-plan-link">Your plan link</label><input class="input" id="pp-saved-plan-link" type="text" readonly value="${escapeHtml(resumeSave.url)}" aria-describedby="pp-save-plan-status" style="width:100%;min-width:0"></div>` : ""}
      <button class="btn" type="button" data-action="save-plan-link" ${resumeSave.busy ? "disabled" : ""}>${resumeSave.busy ? "Creating link…" : saved ? "Copy plan link" : "Create a save link"}</button>
      <p class="help" id="pp-save-plan-status" tabindex="-1" role="status" aria-live="polite">${escapeHtml(resumeSave.message || "No contact details needed. Nothing is sent to our team.")}</p>
    </div>`);
  }
  async function copySavedPlanLink() {
    const activeHost = host;
    const saved = resumeSave;
    let message;
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(saved.url);
      message = "Link copied. Save it somewhere you can find it; it expires after 7 days.";
    } catch (_) {
      message = "Your link is ready. Select and copy the link above to save it for 7 days.";
    }
    if (activeHost !== host || resumeSave !== saved || saved.fingerprint !== JSON.stringify(planResumePayload())) return;
    saved.message = message;
    if (stageElement && state.step === 3) {
      renderPrice();
      const field = stageElement.querySelector("#pp-saved-plan-link");
      if (field) { field.focus(); field.select(); }
    }
  }
  async function savePlanResumeLink() {
    if (resumeSave.busy || state.step !== 3) return;
    if (resumeSave.url && resumeSave.fingerprint === JSON.stringify(planResumePayload())) return copySavedPlanLink();
    const payload = planResumePayload();
    const fingerprint = JSON.stringify(payload);
    const activeHost = host;
    const pendingSave = { fingerprint: fingerprint, url: "", busy: true, message: "" };
    resumeSave = pendingSave;
    resumeSave.message = "Creating your plan link…";
    renderPrice();
    const pendingStatus = stageElement && stageElement.querySelector("#pp-save-plan-status");
    if (pendingStatus) pendingStatus.focus({ preventScroll: true });
    try {
      const result = await planResumeFetch(payload, false);
      if (!/^https:\/\/quote\.itspurgepros\.com\/#resume=[A-Za-z0-9_-]{43}$/.test(result.url || "")) throw new Error("We could not create a valid save link.");
      if (!activePlanSave(pendingSave, activeHost)) return;
      resumeSave = { fingerprint: fingerprint, url: result.url, busy: false, message: "Your link is ready." };
      if (state.step === 3) await copySavedPlanLink();
    } catch (error) {
      if (!activePlanSave(pendingSave, activeHost)) return;
      resumeSave = { fingerprint: fingerprint, url: "", busy: false,
        message: error && error.name === "AbortError" ? "Creating the link took too long. You can try again or continue with your quote." : error.message || "Save link unavailable; you can continue with your quote." };
      if (state.step === 3) {
        renderPrice();
        const failedStatus = stageElement && stageElement.querySelector("#pp-save-plan-status");
        if (failedStatus) failedStatus.focus({ preventScroll: true });
      }
    }
  }
  function resumePlanIntoFreshState(result) {
    const plan = result.plan;
    const keys = ["zip", "dogs", "frequencyId", "yardSizeId", "areaIds", "customerStatus"];
    if (!plan || Object.keys(plan).length !== keys.length || Object.keys(plan).some(function (key) { return keys.indexOf(key) < 0; }) ||
        typeof plan.zip !== "string" || CONFIG.serviceZips.indexOf(plan.zip) < 0 || !Number.isInteger(plan.dogs) ||
        ["new", "returning", "not_sure"].indexOf(plan.customerStatus) < 0 || !Array.isArray(plan.areaIds) ||
        !plan.areaIds.length || new Set(plan.areaIds).size !== plan.areaIds.length ||
        plan.areaIds.some(function (id) { return !Object.prototype.hasOwnProperty.call(CONFIG.areaLabels, id); })) throw new Error("The saved plan is no longer available. Please build a new quote.");
    const fresh = freshState();
    fresh.zip = plan.zip;
    fresh.dogCount = String(plan.dogs);
    fresh.frequency = plan.frequencyId;
    fresh.yardSize = plan.yardSizeId;
    fresh.areas = plan.areaIds.slice();
    fresh.customerStatus = plan.customerStatus;
    const quote = calculateQuote(fresh);
    if (!quote.ok || !result.quote || result.quote.pricingVersion !== CONFIG.pricingVersion ||
        quote.custom !== result.quote.custom || (!quote.custom && quote.priceCents !== result.quote.priceCents)) {
      throw new Error("The available prices or plan options changed. Reload this page to build a quote with the current options.");
    }
    fresh.step = 3;
    state = fresh;
    resumeSave = { fingerprint: "", url: "", busy: false, message: "" };
    // Do not call submit, trackSuccess, choose-intent or restore any prior request/consent.
    saveLowRiskProgress();
  }
  function beginPlanResume() {
    if (!pendingPlanToken) return;
    const token = pendingPlanToken;
    pendingPlanToken = "";
    const activeHost = host;
    clearLowRiskProgress();
    state = freshState();
    resumeLoading = true;
    resumeNotice = "";
    const promise = token === "invalid" ? Promise.reject(new Error("This save link is invalid. Please build a new quote.")) : planResumeFetch({ token: token }, true);
    promise.then(function (result) {
      if (activeHost !== host) return;
      resumePlanIntoFreshState(result);
      resumeNotice = result.pricingChanged
        ? "Pricing has changed since you saved this plan. We have recalculated it using today's prices. Review the current price and offer before continuing."
        : "Your saved plan is ready. Review today's price and offer before continuing. Contact details and permissions have not been restored.";
    }).catch(function (error) {
      if (activeHost !== host) return;
      state = freshState();
      resumeNotice = error && error.name === "AbortError" ? "The saved plan took too long to load. Reopen your saved link to try again, or build a new quote." : error.message || "This save link is unavailable. Please build a new quote.";
    }).finally(function () {
      if (activeHost !== host) return;
      resumeLoading = false;
      render();
      queueMicrotask(function () { const note = stageElement && stageElement.querySelector("[data-resume-notice]"); if (note) note.focus(); });
    });
  }
  function renderPlanResumeNotice() {
    if (!stageElement || !resumeNotice || state.step === 6) return;
    if (stageElement.querySelector("[data-resume-notice]")) return;
    stageElement.insertAdjacentHTML("afterbegin", `<div class="notice" role="status" tabindex="-1" data-resume-notice>${escapeHtml(resumeNotice)}</div>`);
  }
  function renderPrice() {
    renderPriceWithoutResume();
    renderPlanResumeControls();
    renderPlanResumeNotice();
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
  function selectedStatusHtml(active) { return active ? iconHtml("service-check", "choice-check-icon") + "<span>Selected</span>" : ""; }
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

  function consumeAutoOpenRequest() {
    const url = new URL(location.href);
    const queryValue = String(url.searchParams.get("open_quote") || "").trim().toLowerCase();
    const queryRequested = queryValue === "1" || queryValue === "true" || queryValue === "yes";
    const hashValue = String(url.hash || "").toLowerCase();
    const hashRequested = hashValue === "#quote" || hashValue === "#get-quote";
    if (!queryRequested && !hashRequested) return false;

    // Attribution was captured before this runs. Remove only the one-time open
    // instruction so closing and refreshing the page does not reopen the widget.
    url.searchParams.delete("open_quote");
    if (hashRequested) url.hash = "";
    try {
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    } catch (_) {}
    return true;
  }

  function openWhenBodyReady() {
    if (document.body) {
      queueMicrotask(function () { open({ zip: new URL(location.href).searchParams.get("zip") }); });
      return;
    }

    // The global GHL embed uses defer, but retain a small guard for legacy links
    // if another host loads the script before its body exists.
    const observer = new MutationObserver(function () {
      if (!document.body) return;
      observer.disconnect();
      queueMicrotask(function () { open({ zip: new URL(location.href).searchParams.get("zip") }); });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
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
      lastCleaned: state.lastCleaned,
      customerStatus: state.customerStatus
    };
    try { sessionStorage.setItem(LOW_RISK_STORAGE_KEY, JSON.stringify(safe)); } catch (_) {}
  }

  function restoreLowRiskProgress() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(LOW_RISK_STORAGE_KEY) || "null");
      if (!saved) return;
      ["zip", "dogCount", "frequency", "areas", "yardSize", "lastCleaned", "customerStatus"].forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(saved, key)) state[key] = saved[key];
      });
      reconcileFrequencySelection();
    } catch (_) {}
  }

  function clearLowRiskProgress() {
    try { sessionStorage.removeItem(LOW_RISK_STORAGE_KEY); } catch (_) {}
  }

  function track(name, params) {
    const safe = Object.assign({ ui_version: CONFIG.uiVersion }, params || {});
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
          <button class="close" type="button" data-action="close" aria-label="Close quote builder">${iconHtml("close", "close-icon")}</button>
          <section class="quote-side">
            <header class="quote-topbar">
              <div class="mobile-brand"><span class="brand-mark"><img src="${escapeHtml(CONFIG.brand.iconUrl)}" alt="Purge Pros icon"></span><span><strong>PURGE PROS</strong><small>Pet Waste Removal</small></span></div>
              <p class="quote-topbar-title">Your clean-yard plan</p>
              <div class="quote-topbar-actions"><a class="top-review" href="https://itspurgepros.com/reviews" target="_blank" rel="noopener">${iconHtml("review-star")}<span data-review-chip>Read our Google reviews</span></a><a class="top-help" href="${CONFIG.brand.phoneHref}">${iconHtml("phone")}<span>Need help? ${CONFIG.brand.phoneDisplay}</span></a></div>
            </header>
            <nav class="progress" aria-label="Quote progress"></nav>
            <div class="stage" tabindex="-1" aria-labelledby="pp-stage-title" aria-live="polite"></div>
          </section>
          ${offerModalHtml()}
        </div>
      </div>`;
  }

  function promotionCardHtml() { return offerSummaryHtml(false); }

  function offerSummaryHtml(detailed) {
    if (state.frequency === "onetime") return `<aside class="offer-summary"><strong>One-time cleanup: ${money(CONFIG.frequencies.onetime.flatPrice)} for the first 30 minutes.</strong><p>The new recurring-customer offer does not apply. The $89.99 base deposit is charged when we are on the way and your ETA text goes out. Additional time beyond 30 minutes is billed after cleanup at $1 per minute.</p></aside>`;
    if (state.frequency === "custom" || state.yardSize === "over") return `<aside class="offer-summary"><strong>Your price and any offer eligibility need a custom review.</strong><p>We will confirm both before you approve service. Nothing is charged by this form.</p></aside>`;
    const quote = currentQuote();
    const priced = quote.ok && !quote.custom && state.frequency;
    if (state.customerStatus === "returning" || state.customerStatus === "not_sure") return `<aside class="offer-summary"><strong>Restart with clear cleanup pricing.</strong><p>Your quoted maintenance rate${priced ? " is " + money(quote.priceCents) + " per visit" : " comes next"}. For your restart, that rate includes up to 30 minutes of cleanup. Only additional time beyond 30 minutes is billed afterward at $1 per minute.</p><p>We confirm your account rate and these terms before you approve service. The base is charged when your on-the-way ETA text goes out. Following regular maintenance visits stay at the agreed rate regardless of time spent. Introductory offers do not repeat; uncertain history receives team review.</p></aside>`;
    if (!CONFIG.promotion.enabled) return "";
    if (!detailed) return `<aside class="offer-summary" aria-label="New recurring-customer offer"><strong>Built-up poop? Start at your regular visit price.</strong><p>New recurring customers pay $0 initial scoop surcharge. Your regular visit price still applies.</p><p class="offer-scope">No minimum visits · No cancellation fee</p><button class="promotion-link" type="button" data-action="show-offer">See your savings &amp; full offer details ${iconHtml("offer-cursor", "promotion-link-icon")}</button></aside>`;
    return `<aside class="offer-summary" aria-label="New recurring-customer offer"><strong>${escapeHtml(CONFIG.promotion.title)}</strong><p class="offer-savings">${escapeHtml(CONFIG.promotion.detail)}</p>${detailed && priced && state.customerStatus === "new" ? `<dl class="offer-costs"><div class="first-visit"><dt>Your first cleanup</dt><dd>${money(quote.priceCents)}</dd></div><div><dt>Initial scoop surcharge</dt><dd>$0 — waived</dd></div><div><dt>Following scheduled visits</dt><dd>${money(quote.priceCents)} per visit</dd></div></dl>` : ""}<p>No time surcharges on scheduled recurring visits.</p><p class="offer-scope">New recurring customers · No minimum visits · No cancellation fee</p><button class="promotion-link" type="button" data-action="show-offer">${escapeHtml(CONFIG.promotion.linkLabel)} ${iconHtml("offer-cursor", "promotion-link-icon")}</button></aside>`;
  }

  function focusKey() {
    const el = shadow && shadow.activeElement;
    if (!el) return null;
    for (const key of ["dog", "frequency", "area"]) if (el.dataset && el.dataset[key]) return { key: key, value: el.dataset[key] };
    if (el.id) return { id: el.id };
    if (el.name === "pp-preferred") return { reply: el.value };
    return null;
  }

  function restoreControlFocus(key) {
    if (!key) return;
    const el = key.id ? shadow.getElementById(key.id) : key.reply ? Array.from(stageElement.querySelectorAll('[name="pp-preferred"]')).find(el => el.value === key.reply) : Array.from(stageElement.querySelectorAll('[data-' + key.key + ']')).find(el => el.dataset[key.key] === key.value);
    if (el && !el.disabled) el.focus({ preventScroll: true });
  }

  function offerModalHtml() {
    const offer = CONFIG.promotion;
    return `<div class="offer-layer" data-offer-layer hidden><section class="offer-dialog" role="dialog" aria-modal="true" aria-labelledby="pp-offer-title"><div class="offer-dialog-head"><h2 id="pp-offer-title">${escapeHtml(offer.modalTitle)}</h2><button class="offer-close" type="button" data-action="close-offer" aria-label="Close offer details">${iconHtml("close", "offer-close-icon")}</button></div><p>${escapeHtml(offer.modalIntro)}</p><div class="offer-table"><div class="offer-row"><span>${escapeHtml(offer.firstThirtyLabel)}</span><strong>${escapeHtml(offer.firstThirtyValue)}</strong></div><div class="offer-row"><span>${escapeHtml(offer.additionalLabel)}</span><strong>${escapeHtml(offer.additionalValue)}</strong></div><div class="offer-row"><span>${escapeHtml(offer.exampleLabel)}</span><strong>${escapeHtml(offer.exampleValue)}</strong></div><div class="offer-row savings"><span>${escapeHtml(offer.customerLabel)}</span><strong>${escapeHtml(offer.customerValue)}</strong></div></div><p class="offer-disclaimer">${escapeHtml(offer.disclaimer)}</p></section></div>`;
  }

  function stageHeader(eyebrow, title, description, badge) {
    const stageIcon = ({ 1: "local-area", 2: "dog", 3: "per-visit-price", 4: "property-notes", 5: "service-check" })[state.step] || "service-check";
    return `<header class="stage-header"><div class="stage-header-row"><div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h2 id="pp-stage-title">${escapeHtml(title)}</h2></div></div><p>${escapeHtml(description)}</p><span class="stage-illustration" aria-hidden="true">${iconHtml(stageIcon, "stage-illustration-icon")}${badge ? `<span class="badge">${escapeHtml(badge)}</span>` : ""}</span></header>`;
  }

  function renderProgress() {
    if (!progressElement) return;
    progressElement.style.display = state.step > 5 ? "none" : "grid";
    progressElement.innerHTML = PROGRESS_LABELS.map(function (label, index) {
      const number = index + 1;
      const complete = state.step > number;
      const current = state.step === number;
      return `<div class="progress-step${complete ? " complete" : ""}${current ? " current" : ""}"${current ? ' aria-current="step"' : ""}><span class="progress-dot">${complete ? iconHtml("service-check", "progress-check-icon") : number}</span><span class="progress-label">${label}</span></div>`;
    }).join("");
  }

  function focusCoverageResult() {
    queueMicrotask(function () {
      const result = stageElement && stageElement.querySelector("#pp-coverage-result");
      if (!result) return;
      result.focus();
      if (result.scrollIntoView) result.scrollIntoView({ block: "nearest" });
    });
  }

  function renderArea() {
    if (state.zipIneligible) {
      stageElement.innerHTML = `<div class="coverage-result" id="pp-coverage-result" role="alert" tabindex="-1" aria-labelledby="pp-stage-title" aria-describedby="pp-coverage-help"><span class="coverage-mark" aria-hidden="true">${iconHtml("alert", "coverage-mark-icon")}</span><div><p class="coverage-kicker">Outside our service area</p><h2 id="pp-stage-title">We do not service ZIP ${escapeHtml(state.zip)} yet.</h2><p id="pp-coverage-help">Purge Pros serves Indianapolis and nearby Central Indiana communities. If you entered the wrong ZIP, correct it below.</p></div></div>
        <div class="field"><label for="pp-zip">Try a different service ZIP</label><div class="zip-wrap"><input class="input coverage-input" id="pp-zip" inputmode="numeric" autocomplete="postal-code" maxlength="5" placeholder="e.g. 46032" value="${escapeHtml(state.zip)}" aria-invalid="true" aria-describedby="pp-coverage-help"><button class="btn blue" type="button" data-action="check-zip">Check this ZIP ${iconHtml("search", "action-icon")} </button></div></div>
        <div class="coverage-contact"><strong>Near the edge of our routes?</strong><p>Call <a href="${CONFIG.brand.phoneHref}">${CONFIG.brand.phoneDisplay}</a> and we can check the address. We will not collect your contact details in this form for an unsupported ZIP.</p></div>
        <div class="error" role="alert" tabindex="-1"></div>`;
      focusCoverageResult();
      return;
    }

    stageElement.innerHTML = `${stageHeader("60-SECOND PRICE CHECK", "First, are we in your neighborhood?", "Enter your ZIP to check coverage. Then build your plan and see your exact per-visit price.", "Fast availability check")}
      <div class="field"><label for="pp-zip">Service ZIP code</label><div class="zip-wrap"><input class="input" id="pp-zip" inputmode="numeric" autocomplete="postal-code" maxlength="5" placeholder="e.g. 46032" value="${escapeHtml(state.zip)}"><button class="btn blue" type="button" data-action="check-zip">Check availability ${iconHtml("search", "action-icon")} </button></div><small>Central Indiana service area. No geolocation or account required.</small></div>
      ${offerSummaryHtml(false)}
      <div class="error" role="alert" tabindex="-1"></div>
      <div class="info-list"><div class="info-item">${iconHtml("per-visit-price", "info-icon")}<span><strong>Clear per-visit pricing.</strong> Build the plan that fits your yard and see your exact price for each visit.</span></div><div class="info-item">${iconHtml("secure-payment", "info-icon")}<span><strong>Nothing charged today.</strong> Secure payment setup comes only after you approve the proposed service day.</span></div><div class="info-item">${iconHtml("service-calendar", "info-icon")}<span><strong>A dependable neighborhood service day.</strong> Our team confirms the recurring day instead of promising a slot that may not work.</span></div></div>`;
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
    const selectionStatus = eligibility.allowed ? selectedStatusHtml(active) : "";
    const art = ({ twice: "frequency-twice-weekly", weekly: "frequency-weekly", biweekly: "frequency-every-other-week", onetime: "frequency-one-time", custom: "frequency-custom" })[id];
    return `<button class="choice${definition.custom ? " custom-choice" : ""}" type="button" data-frequency="${id}" aria-pressed="${active}"${eligibility.allowed ? "" : ' disabled aria-disabled="true"'}>${iconHtml(art, "choice-art")}<span class="choice-check">${selectionStatus}</span>${definition.popular ? '<span class="popular">' + iconHtml("review-star", "popular-star-icon") + '<span>MOST POPULAR</span></span>' : ""}<strong>${escapeHtml(definition.label)}</strong><small>${escapeHtml(eligibility.note)}</small></button>`;
  }

  function areaChoice(id, label) {
    const active = state.areas.indexOf(id) >= 0;
    return `<button class="choice" type="button" data-area="${id}" aria-pressed="${active}">${iconHtml(({ back: "area-back", front: "area-front", side: "area-sides" })[id], "choice-art")}<span class="choice-check">${selectedStatusHtml(active)}</span><strong>${escapeHtml(label)}</strong><small>${active ? "Included in your plan" : "Select this area"}</small></button>`;
  }

  function yardGuideHtml() {
    const rows = [["s", "Up to ⅛ acre", "5,445"], ["m", "Up to ¼ acre", "10,890"], ["l", "Up to ½ acre", "21,780"], ["xl", "Up to 1 acre", "43,560"]];
    return `<details class="yard-guide" id="pp-yard-guide"${state.yardHelpOpen ? " open" : ""}><summary><span class="yard-guide-summary">${iconHtml("yard-guide", "yard-guide-icon")}<span>Not sure about yard size?</span>${iconHtml("chevron", "yard-guide-chevron")}</span></summary><div class="yard-guide-body">
      <p class="yard-guide-lead">Your service area. Not your whole property.</p>
      <p>Estimate the outdoor area you want scooped, including any patio or concrete areas where your dogs poop. Leave out the house and areas that do not need service.</p>
      <figure class="yard-property"><figcaption>${iconHtml("property-notes", "field-label-icon")}<strong>Example: backyard service only</strong><span>Green + checkmark = area to count</span></figcaption>
      <svg viewBox="0 0 400 392" role="img" aria-labelledby="pp-yard-title pp-yard-desc" xmlns="http://www.w3.org/2000/svg">
        <title id="pp-yard-title">Which part of a property counts as yard size?</title>
        <desc id="pp-yard-desc">An example viewed from above. The backyard lawn and patio count in this example because both need scooping. The house and unused driveway do not count. The front and side lawns count only if you request those areas too. This is not a measurement or a size-tier example.</desc>
        <defs><pattern id="pp-yard-paving" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 0H12V12" fill="none" stroke="#c8d2d6" stroke-width="1"/></pattern></defs>
        <rect width="400" height="392" rx="16" fill="#f3f7f5"/>
        <rect x="25" y="16" width="350" height="327" rx="10" fill="#e8eee9" stroke="#9aada2" stroke-width="2" stroke-dasharray="6 5"/>
        <path d="M36 27H364V154H256V126H144V154H36Z" fill="#c2ebbd" stroke="#267547" stroke-width="2"/>
        <path d="M48 42H352M48 57H352M48 72H352M48 87H352M48 102H352M48 117H352M48 132H130M270 132H352" stroke="#94cf94" stroke-width="1" opacity=".55"/>
        <rect x="91" y="50" width="218" height="61" rx="14" fill="#185c38"/>
        <circle cx="116" cy="80" r="12" fill="#effbef"/><path d="m110 80 4 4 8-9" stroke="#185c38" stroke-width="3" fill="none" stroke-linecap="round"/>
        <text x="141" y="76" fill="#fff" font-size="18" font-weight="700">BACKYARD</text>
        <text x="141" y="96" fill="#e3f5e5" font-size="14">Count this area</text>
        <rect x="145" y="128" width="110" height="40" rx="3" fill="#c2ebbd"/><rect x="145" y="128" width="110" height="40" rx="3" fill="url(#pp-yard-paving)"/>
        <text x="200" y="152" text-anchor="middle" font-size="13" fill="#455963">Patio · include</text>
        <rect x="86" y="174" width="209" height="83" rx="5" fill="#becbd1"/>
        <path d="m90 178 30 32v40m0-40h145l26-32m-26 32v40" fill="none" stroke="#8a9fa9" stroke-width="2"/>
        <rect x="140" y="201" width="119" height="35" rx="7" fill="#f5f8f9"/>
        <text x="199" y="224" text-anchor="middle" fill="#3d525f" font-size="16" font-weight="700">House · exclude</text>
        <rect x="253" y="258" width="78" height="75" rx="3" fill="#d5dee2"/>
        <path d="M257 295H327" stroke="#bdcbd1"/>
        <text x="292" y="288" text-anchor="middle" font-size="12" fill="#455963">Driveway</text><text x="292" y="307" text-anchor="middle" font-size="12" fill="#455963">if unused</text>
        <text x="57" y="197" text-anchor="middle" fill="#52685a" font-size="12">Side</text><text x="57" y="214" text-anchor="middle" fill="#52685a" font-size="12">lawn</text>
        <text x="340" y="197" text-anchor="middle" fill="#52685a" font-size="12">Side</text><text x="340" y="214" text-anchor="middle" fill="#52685a" font-size="12">lawn</text>
        <text x="138" y="286" text-anchor="middle" fill="#455e4e" font-size="16" font-weight="700">FRONT LAWN</text>
        <text x="138" y="307" text-anchor="middle" fill="#52685a" font-size="12">Not in this example's service</text>
        <path d="M26 353H374" stroke="#c6d1d5" stroke-width="8"/><rect x="0" y="368" width="400" height="24" fill="#dce4e7"/>
        <text x="200" y="384" text-anchor="middle" fill="#566c77" font-size="12" letter-spacing="3">STREET</text>
      </svg><p class="yard-example-note">Illustration only—not to scale and not a measurement of your property.</p></figure>
      <div class="yard-scope-note"><strong>Need front or side areas scooped too?</strong><br>Add those service areas to your backyard total. Choose the total size, then select the areas below.</div>
      <table><caption>Service area guide — choose the smallest size that fits</caption><thead><tr><th scope="col">Yard size</th><th scope="col">Square feet</th></tr></thead><tbody>${rows.map(function(row) { return `<tr${state.yardSize === row[0] ? ' class="yard-selected"' : ''}><th scope="row">${row[1]}${state.yardSize === row[0] ? ' · selected' : ''}</th><td>Up to ${row[2]}</td></tr>`; }).join("")}</tbody></table>
      <p><strong>A quick size example:</strong> a 50 ft × 100 ft service area is 5,000 sq ft, so it fits “Up to ⅛ acre.” For irregular areas, add the areas of smaller rectangles. Over 43,560 sq ft needs a custom estimate.</p>
      <p>Still unsure? Use “Ask a question” after viewing your price so we can help confirm the serviced area.</p>
    </div></details>`;
  }

  function cleanupHistoryField() {
    return `<div class="field"><label for="pp-last-cleaned">When was the last full cleanup?</label><select class="select" id="pp-last-cleaned" data-field="lastCleaned" aria-required="true" aria-describedby="pp-last-cleaned-hint"><option value="">Choose an answer</option>${LAST_CLEANED_CHOICES.map(function (value) { return `<option value="${escapeHtml(value)}"${selected(state.lastCleaned === value)}>${escapeHtml(value)}</option>`; }).join("")}</select><small id="pp-last-cleaned-hint">This helps us plan the first visit. It does not change the recurring maintenance quote.</small></div>`;
  }

  function dogChoiceHtml(dog) {
    const active = String(state.dogCount) === String(dog);
    const label = dog === 10 ? "10+ dogs" : dog + (dog === 1 ? " dog" : " dogs");
    return `<button class="dog-choice" type="button" data-dog="${dog}" aria-pressed="${active}" aria-label="${active ? "Selected " : ""}${label}">${iconHtml(dog === 10 ? "dog-10plus" : "dog-" + dog, "dog-choice-art")}<span class="dog-selected-marker" aria-hidden="true">${active ? iconHtml("service-check", "dog-selected-marker-icon") : ""}</span><strong>${label}</strong></button>`;
  }

  function planRailHtml(preview, quote) {
    const frequency = state.frequency && CONFIG.frequencies[state.frequency];
    const yard = state.yardSize && CONFIG.yardSizes[state.yardSize];
    const dogs = state.dogCount ? (Number(state.dogCount) >= 10 ? "10+ dogs" : state.dogCount + (Number(state.dogCount) === 1 ? " dog" : " dogs")) : "Choose dog count";
    const areas = state.areas.length ? state.areas.map(function (id) { return CONFIG.areaLabels[id]; }).join(", ") : "Choose service area";
    return `<aside class="plan-rail" aria-label="Live plan estimate"><div class="plan-rail-head"><span>Your plan</span><strong>Clear pricing as you build</strong></div><div class="plan-rail-body"><div class="plan-rail-price" aria-live="polite"><strong>${quote.ok && !quote.custom ? money(quote.priceCents) + ' <small>' + priceUnit() + '</small>' : quote.ok && quote.custom ? "Custom estimate" : "—"}</strong><span>${escapeHtml(preview)}</span></div><div class="plan-rail-list"><div class="plan-rail-row"><span>Dogs</span><strong>${escapeHtml(dogs)}</strong></div><div class="plan-rail-row"><span>Frequency</span><strong>${escapeHtml(frequency ? frequency.label : "Choose frequency")}</strong></div><div class="plan-rail-row"><span>Yard</span><strong>${escapeHtml(yard ? yard.label : "Choose yard size")}</strong></div><div class="plan-rail-row"><span>Areas</span><strong>${escapeHtml(areas)}</strong></div></div>${offerSummaryHtml(false)}<div class="plan-rail-benefits"><div class="plan-rail-benefit">${iconHtml("per-visit-price")}<span>Pay per visit</span></div><div class="plan-rail-benefit">${iconHtml("no-contract")}<span>No contract</span></div></div><button class="btn primary" type="button" data-action="show-price">${state.reviewEdit === "plan" ? "Review updated plan" : "Review my price"} ${iconHtml("next-arrow", "action-arrow-icon")}</button></div></aside>`;
  }

  function renderPlan() {
    const retainedFocus = focusKey();
    const quote = currentQuote();
    const preview = quote.ok && !quote.custom ? money(quote.priceCents) + " " + priceUnit() : quote.ok && quote.custom ? "Custom estimate" : "Complete the choices above";
    stageElement.innerHTML = `${stageHeader("BUILD YOUR PLAN", "Make it your kind of clean.", "Choose your dogs, yard size and service schedule. Your estimate updates as you go.", "ZIP " + state.zip)}
      <div class="plan-layout"><div class="plan-builder">
      <div class="field"><span class="field-label">How many dogs use the yard?</span><div class="dog-choice-grid" id="pp-dogs" role="group" aria-label="How many dogs use the yard?">${Array.from({ length: 4 }, function (_, index) { return dogChoiceHtml(index + 1); }).join("")}</div><details class="more-dogs"${Number(state.dogCount) > 4 ? " open" : ""}><summary>More dogs</summary><div class="dog-choice-grid dog-choice-grid-more" role="group" aria-label="Five or more dogs">${Array.from({ length: 6 }, function (_, index) { return dogChoiceHtml(index + 5); }).join("")}</div></details></div>
      <div class="field"><span class="field-label">How often should we scoop?</span><div class="choice-grid">${Object.keys(CONFIG.frequencies).map(function (id) { return frequencyChoice(id, CONFIG.frequencies[id]); }).join("")}</div></div>
      <div class="field"><label for="pp-yard">Serviced lawn size</label><select class="select" id="pp-yard" data-field="yardSize" aria-describedby="pp-yard-hint"><option value="">Choose yard size</option>${Object.keys(CONFIG.yardSizes).map(function (id) { const yard = CONFIG.yardSizes[id]; return `<option value="${id}"${selected(state.yardSize === id)}>${escapeHtml(yard.label)}${yard.custom ? " · custom" : ""}</option>`; }).join("")}</select><small id="pp-yard-hint">Count the outdoor area we will scoop, including any patio or concrete that needs service.</small></div>${yardGuideHtml()}
      <div class="field"><span class="field-label">Which areas should we cover?</span><div class="choice-grid">${Object.keys(CONFIG.areaLabels).map(function (id) { return areaChoice(id, CONFIG.areaLabels[id]); }).join("")}<button class="choice" type="button" data-area="all" aria-pressed="${state.areas.length === 3}">${iconHtml("area-all", "choice-art")}<span class="choice-check">${state.areas.length === 3 ? selectedStatusHtml(true) : ""}</span><strong>Yard+ · all areas</strong><small>Back, front and side yard(s)</small></button></div></div>
      <div class="field"><label for="pp-customer-status">Have you used Purge Pros before?</label><select class="select" id="pp-customer-status" data-field="customerStatus"><option value="">Choose an answer</option>${[["new", "No — I’m a new customer"], ["returning", "Yes — I’m returning or already a customer"], ["not_sure", "I’m not sure / new occupant"]].map(function (item) { return `<option value="${item[0]}"${selected(state.customerStatus === item[0])}>${item[1]}</option>`; }).join("")}</select><small>Introductory offers are once per customer/household. Returning customers and new-occupant questions get a team review.</small></div>
      </div>${planRailHtml(preview, quote)}</div>
      <div class="error plan-error" role="alert" tabindex="-1"></div>
      <div class="plan-footer"><div class="price-preview" aria-live="polite"><span>Your estimate</span><strong>${escapeHtml(preview)}</strong></div><div class="actions"><button class="btn link" type="button" data-action="back">${iconHtml("chevron", "action-chevron action-chevron-back")} Back</button><button class="btn primary" type="button" data-action="show-price">${state.reviewEdit === "plan" ? "Review updated plan " + iconHtml("next-arrow", "action-arrow-icon") + " " : "Review price " + iconHtml("next-arrow", "action-arrow-icon") + " "}</button></div></div>`;
    restoreControlFocus(retainedFocus);
  }

  function reasonText(code) {
    return ({ CUSTOM_BOOKING_SELECTED: "custom booking selected", DOG_COUNT_10_PLUS: "10+ dogs", YARD_OVER_ONE_ACRE: "over one acre" })[code] || "manual review required";
  }

  function planSummaryRows(includePrice) {
    const quote = currentQuote();
    const rows = [
      ["Frequency", CONFIG.frequencies[state.frequency].label],
      ["Dogs", Number(state.dogCount) >= 10 ? "10+ dogs" : state.dogCount + (Number(state.dogCount) === 1 ? " dog" : " dogs")],
      ["Service area", state.areas.map(function (id) { return CONFIG.areaLabels[id]; }).join(", ")],
      ["Yard size", CONFIG.yardSizes[state.yardSize].label]
    ];
    if (includePrice) rows.push(["Scoop price", quote.custom ? "Custom estimate" : money(quote.priceCents) + " " + priceUnit()]);
    return rows.map(function (row) { return `<div class="summary-row"><span>${escapeHtml(row[0])}</span><strong>${escapeHtml(row[1])}</strong></div>`; }).join("");
  }

  function pricePlanSummaryHtml() {
    return `<section class="summary-card price-plan" aria-label="Your selected plan"><h3>Your selected plan</h3>${planSummaryRows(false)}</section>`;
  }

  function renderPriceWithoutResume() {
    const quote = currentQuote();
    if (!quote.ok) return goTo(2);
    if (quote.custom) {
      stageElement.innerHTML = `${stageHeader("PERSONALIZED REVIEW", "Get a custom estimate.", "Tell us about the yard. Our local team will confirm the scope, availability and price before you approve service.", "Personal follow-up")}
        ${pricePlanSummaryHtml()}${offerSummaryHtml(false)}<div class="notice orange"><strong>Why:</strong> ${quote.reasons.map(reasonText).join(" · ")}</div><div class="info-list"><div class="info-item"><span class="info-icon info-icon-number">1</span><span><strong>Send the yard details.</strong> It takes about one more minute.</span></div><div class="info-item"><span class="info-icon info-icon-number">2</span><span><strong>We review the scope and availability.</strong> Our team prepares the estimate.</span></div><div class="info-item"><span class="info-icon info-icon-number">3</span><span><strong>You decide.</strong> Nothing is charged or scheduled by this form.</span></div></div><div class="actions"><button class="btn link" type="button" data-action="back">${iconHtml("chevron", "action-chevron action-chevron-back")} Change plan</button><button class="btn primary" type="button" data-action="choose-intent" data-intent="service_request">Request my estimate ${iconHtml("next-arrow", "action-arrow-icon")} </button></div>`;
      return;
    }
    stageElement.innerHTML = `${stageHeader("REVIEW YOUR PRICE", "Here’s your per-visit price.", "Review your selected plan, then request service, save the quote or ask us a question.", "Upfront price")}
      <div class="price-plan-grid"><div class="price-hero"><div class="price-hero-top">${iconHtml("per-visit-price", "price-hero-art")}<div><div class="price-label">${state.frequency === "onetime" ? "One-time cleanup" : CONFIG.frequencies[state.frequency].label + " scoop service"}</div><div class="price">${money(quote.priceCents)} <small>${priceUnit()}</small></div></div></div><p>${escapeHtml(quote.disclaimer)}</p></div>
      ${pricePlanSummaryHtml()}</div>
      <div class="line-items">${quote.lineItems.map(function (item) { return `<div class="line-item"><span>${escapeHtml(item.label)}</span><strong>${money(item.cents)}</strong></div>`; }).join("")}</div>
      ${offerSummaryHtml(true)}
      <div class="info-list"><div class="info-item">${iconHtml("waste-bag", "info-icon")}<span>Waste hauled away and equipment sanitized</span></div><div class="info-item">${iconHtml("deodorize", "info-icon")}<span>No long-term contract · pay per visit</span></div><div class="info-item">${iconHtml("service-calendar", "info-icon")}<span>${state.frequency === "onetime" ? "Cleanup date" : "Regular service day"} confirmed before secure payment setup</span></div></div>
      <div class="actions"><button class="btn link" type="button" data-action="back">${iconHtml("chevron", "action-chevron action-chevron-back")} Change plan</button><button class="btn" type="button" data-action="choose-intent" data-intent="question">Ask a question</button><button class="btn" type="button" data-action="choose-intent" data-intent="quote_delivery">Send me this quote</button><button class="btn primary" type="button" data-action="choose-intent" data-intent="service_request">Request service ${iconHtml("next-arrow", "action-arrow-icon")} </button></div>`;
  }

  function intentCopy() {
    if (state.intent === "quote_delivery") return { eyebrow: "SAVE YOUR QUOTE", title: "Where should we send it?", body: "Choose how you would like us to send your plan and price.", badge: "Save your quote" };
    if (state.intent === "question") return { eyebrow: "ASK PURGE PROS", title: "What can we help with?", body: "Your plan travels with the question, so you do not have to repeat the yard details.", badge: "Personal response" };
    if (state.frequency === "onetime") return { eyebrow: "REQUEST CLEANUP", title: "Tell us where the yard is.", body: "We will review the cleanup details and follow up with availability. Nothing is charged today.", badge: "About 1 minute" };
    return { eyebrow: "REQUEST SERVICE", title: "Tell us where the yard is.", body: "We will confirm the best recurring service day for your area. Nothing is charged today.", badge: "About 1 minute" };
  }

  function renderDetails() {
    const retainedFocus = focusKey();
    const copy = intentCopy();
    const service = state.intent === "service_request";
    const question = state.intent === "question";
    const allowCall = state.intent !== "quote_delivery";
    stageElement.innerHTML = `${stageHeader(copy.eyebrow, copy.title, copy.body, copy.badge)}
      ${offerSummaryHtml(false)}
      <div class="field-row"><div class="field"><label for="pp-first">First name</label><input class="input" id="pp-first" data-field="firstName" autocomplete="given-name" maxlength="80" value="${escapeHtml(state.firstName)}"></div>${service ? `<div class="field"><label for="pp-last">Last name</label><input class="input" id="pp-last" data-field="lastName" autocomplete="family-name" maxlength="80" value="${escapeHtml(state.lastName)}"></div>` : ""}</div>
      <div class="field-row"><div class="field"><label for="pp-phone">Phone number${!service && state.preferredContact === "email" ? " (optional)" : ""}</label><input class="input" id="pp-phone" aria-required="${service || state.preferredContact !== "email"}" data-field="phone" type="tel" autocomplete="tel" inputmode="numeric" maxlength="14" pattern="[0-9() -]*" placeholder="(317) 555-0123" value="${escapeHtml(state.phone)}"><small>${service ? "Required for your service record. Providing a number does not opt you into texts." : "10-digit U.S. number. Optional when receiving a quote or answer by email."}</small></div><div class="field"><label for="pp-email">Email${state.preferredContact === "email" ? "" : " (optional)"}</label><input class="input" id="pp-email" data-field="email" type="email" autocomplete="email" maxlength="254" placeholder="you@example.com" value="${escapeHtml(state.email)}"></div></div>
      <div class="field"><span class="field-label">Best way to reply</span><div class="radio-grid"><label class="radio-card"><input type="radio" name="pp-preferred" value="text"${checked(state.preferredContact === "text")}><span>Text message</span></label><label class="radio-card"><input type="radio" name="pp-preferred" value="email"${checked(state.preferredContact === "email")}><span>Email</span></label>${allowCall ? `<label class="radio-card"><input type="radio" name="pp-preferred" value="call"${checked(state.preferredContact === "call")}><span>Phone call</span></label>` : ""}</div></div>
      ${state.preferredContact === "text" ? `<label class="check" for="pp-sms-consent"><input id="pp-sms-consent" type="checkbox"${checked(state.smsConsent)}><span><strong>Text me about my quote and service.</strong> I consent to receive non-marketing text messages from Purge Pros about my quote, availability, scheduling, service and account at the number provided. Message frequency varies. Message and data rates may apply. Text HELP for assistance; reply STOP to opt out.</span></label>` : ""}
      <p class="help">You may choose Email${allowCall ? " or Phone Call" : ""} instead of consenting to SMS. Review our <a href="${CONFIG.brand.privacyUrl}" target="_blank" rel="noopener">Privacy Policy</a> and <a href="${CONFIG.brand.termsUrl}" target="_blank" rel="noopener">Terms &amp; Conditions</a>.</p>
      ${service ? `<div class="field-row"><div class="field"><label for="pp-address">Service street address</label><input class="input" id="pp-address" data-field="address" autocomplete="address-line1" maxlength="120" value="${escapeHtml(state.address)}"></div><div class="field"><label for="pp-city">City</label><input class="input" id="pp-city" data-field="city" autocomplete="address-level2" maxlength="80" value="${escapeHtml(state.city)}"></div></div><div class="field"><label for="pp-start">When would you like to start?</label><select class="select" id="pp-start" data-field="startTiming"><option value="">Choose timing</option>${["As soon as possible", "Within the next week", "In the next few weeks", "Just researching for now"].map(function (value) { return `<option value="${escapeHtml(value)}"${selected(state.startTiming === value)}>${escapeHtml(value)}</option>`; }).join("")}</select></div>` : ""}
      ${cleanupHistoryField()}
      ${question ? `<div class="field"><label for="pp-question">Your question</label><textarea class="textarea" id="pp-question" data-field="question" maxlength="1500" placeholder="What would you like to know?">${escapeHtml(state.question)}</textarea></div>` : ""}
      <div class="error" role="alert" tabindex="-1"></div><div class="actions"><button class="btn link" type="button" data-action="back">${iconHtml("chevron", "action-chevron action-chevron-back")} Back</button><button class="btn primary" type="button" data-action="review">${state.reviewEdit ? "Review changes " + iconHtml("next-arrow", "action-arrow-icon") + " " : "Review request " + iconHtml("next-arrow", "action-arrow-icon") + " "}</button></div>`;
    restoreControlFocus(retainedFocus);
  }

  function renderReview() {
    const quote = currentQuote();
    const service = state.intent === "service_request";
    const oneTime = state.frequency === "onetime";
    const title = service ? (quote.custom ? "Review your estimate request." : "Review your service request.") : state.intent === "quote_delivery" ? "Review your quote delivery." : "Review your question.";
    stageElement.innerHTML = `${stageHeader("ONE LAST LOOK", title, "Confirm the details below. We will not schedule service or collect payment from this submission.", "Nothing charged")}
      <div class="summary"><section class="summary-card"><div class="summary-heading"><h3>Plan</h3><button class="summary-edit" type="button" data-action="edit-plan"${state.submitting || state.submissionReviewMessage ? " disabled" : ""}>Edit plan</button></div>${planSummaryRows(true)}</section>
      <section class="summary-card"><div class="summary-heading"><h3>Contact &amp; details</h3><button class="summary-edit" type="button" data-action="edit-contact"${state.submitting || state.submissionReviewMessage ? " disabled" : ""}>Edit contact</button></div><div class="summary-row"><span>Name</span><strong>${escapeHtml((state.firstName + " " + state.lastName).trim())}</strong></div><div class="summary-row"><span>Reply by</span><strong>${escapeHtml(state.preferredContact === "call" ? "Phone call" : state.preferredContact)}</strong></div>${state.phone ? `<div class="summary-row"><span>Phone</span><strong>${escapeHtml(state.phone)}</strong></div>` : ""}${state.email ? `<div class="summary-row"><span>Email</span><strong>${escapeHtml(state.email)}</strong></div>` : ""}${service ? `<div class="summary-row"><span>Service address</span><strong>${escapeHtml(state.address + ", " + state.city + ", IN " + state.zip)}</strong></div>` : ""}<div class="summary-row"><span>Last full cleanup</span><strong>${escapeHtml(state.lastCleaned)}</strong></div></section></div>
      ${offerSummaryHtml(true)}
      ${service ? `<label class="check" for="pp-terms"><input id="pp-terms" type="checkbox"${checked(state.termsAccepted)}><span>I agree to the <a href="${CONFIG.brand.termsUrl}" target="_blank" rel="noopener">Terms of Service</a> and acknowledge the <a href="${CONFIG.brand.privacyUrl}" target="_blank" rel="noopener">Privacy Policy</a>. I understand this is a request for ${oneTime ? "cleanup availability" : "service-day review"}, not a confirmed appointment.</span></label>` : `<p class="help">By submitting, you acknowledge the <a href="${CONFIG.brand.privacyUrl}" target="_blank" rel="noopener">Privacy Policy</a>.</p>`}
      ${state.submissionReviewMessage ? `<div class="notice orange" role="alert">${escapeHtml(state.submissionReviewMessage)} <a href="${CONFIG.brand.phoneHref}">Call Purge Pros</a></div>` : ""}
      <div class="error" role="alert" tabindex="-1"></div><div class="actions"><button class="btn primary" type="button" data-action="submit"${state.submitting || state.submissionReviewMessage ? " disabled" : ""}>${state.submitting ? '<span class="spinner" aria-hidden="true"></span>Sending…' : state.submissionReviewMessage ? "Please call to confirm" : submitLabel(quote)}</button></div>`;
    syncSubmittingUi();
  }

  function submitLabel(quote) {
    if (state.intent === "quote_delivery") return "Send my quote " + iconHtml("next-arrow", "action-arrow-icon") + " ";
    if (state.intent === "question") return "Send my question " + iconHtml("next-arrow", "action-arrow-icon") + " ";
    return (quote.custom ? "Request my estimate " : "Request my service day ") + iconHtml("next-arrow", "action-arrow-icon") + " ";
  }

  function renderComplete() {
    const service = state.intent === "service_request";
    const quote = currentQuote();
    const oneTime = state.frequency === "onetime";
    const serviceBody = oneTime
      ? "Our team will review the cleanup details and reply with availability using your selected contact method. Nothing has been scheduled or charged."
      : "Our team will confirm the best recurring service day for your area and reply using your selected contact method. Your service is not scheduled until you approve the proposed day.";
    const nextSteps = oneTime
      ? `<div class="info-list"><div class="info-item">${iconHtml("scoop", "info-icon")}<span>We review the cleanup details and current availability.</span></div><div class="info-item">${iconHtml("visit-message", "info-icon")}<span>We confirm the cleanup plan and timing with you.</span></div><div class="info-item">${iconHtml("secure-payment", "info-icon")}<span>Then we send the secure payment setup request.</span></div></div>`
      : `<div class="info-list"><div class="info-item">${iconHtml("service-calendar", "info-icon")}<span>We confirm the best recurring service day for your area.</span></div><div class="info-item">${iconHtml("visit-message", "info-icon")}<span>You approve the proposed service day.</span></div><div class="info-item">${iconHtml("secure-payment", "info-icon")}<span>Then we send a secure payment setup request.</span></div></div>`;
    stageElement.innerHTML = `<div class="complete"><div class="success-mark" aria-hidden="true">${iconHtml("service-check", "success-mark-icon")}</div>${stageHeader("RECEIVED", service ? "Your request is with Purge Pros." : state.intent === "quote_delivery" ? "Your quote request is in." : "Your question is in.", service ? serviceBody : "We will follow up using the reply method you selected.", "Successfully sent")}
      ${offerSummaryHtml(true)}
      <div class="summary-card"><h3>What happens next</h3>${service ? nextSteps : `<p class="help">Keep an eye on ${state.preferredContact === "email" ? "your inbox" : state.preferredContact === "call" ? "your phone" : "your text messages"}. Questions? Call <a href="${CONFIG.brand.phoneHref}">${CONFIG.brand.phoneDisplay}</a>.</p>`}<div class="summary-row"><span>Your price</span><strong>${quote.custom ? "Custom estimate" : money(quote.priceCents) + " " + priceUnit()}</strong></div><p class="request-id">Reference: ${escapeHtml(state.receipt && state.receipt.requestId || "received")}</p></div><div class="actions"><button class="btn blue" type="button" data-action="close">Done</button></div></div>`;
  }

  function render() {
    if (!stageElement) return;
    if (resumeLoading) { stageElement.innerHTML = `<div role="status" aria-live="polite"><h2 id="pp-stage-title">Opening your saved plan…</h2><p>Checking today’s coverage and prices.</p></div>`; return; }
    renderProgress();
    if (state.step === 1) renderArea();
    if (state.step === 2) renderPlan();
    if (state.step === 3) renderPrice();
    if (state.step === 4) renderDetails();
    if (state.step === 5) renderReview();
    if (state.step === 6) renderComplete();
    renderPlanResumeNotice();
    syncSubmittingUi();
  }

  function showOffer() {
    const layer = shadow && shadow.querySelector("[data-offer-layer]");
    if (!layer) return;
    offerPreviousFocus = shadow.activeElement;
    layer.hidden = false;
    const closeButton = layer.querySelector('[data-action="close-offer"]');
    if (closeButton) closeButton.focus();
    isolateQuoteOffer(layer);
    track("promotion_details_viewed", { promotion: CONFIG.promotion.title });
  }

  function closeOffer() {
    const layer = shadow && shadow.querySelector("[data-offer-layer]");
    if (!layer || layer.hidden) return false;
    layer.hidden = true;
    restoreQuoteInert(offerInertRecords);
    if (offerPreviousFocus && offerPreviousFocus.isConnected && !offerPreviousFocus.disabled && !offerPreviousFocus.closest("[inert], [hidden]")) offerPreviousFocus.focus();
    else focusQuoteStage();
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
    stageElement.querySelectorAll(".field-error").forEach(el => el.remove());
    stageElement.querySelectorAll('[aria-invalid="true"]').forEach(el => { el.removeAttribute("aria-invalid"); el.removeAttribute("aria-errormessage"); });
    const list = Array.isArray(messages) ? messages : [messages];
    const fields = [[/used Purge Pros before/, "#pp-customer-status"], [/ZIP code/, "#pp-zip"], [/^Choose the number of dogs/i, "#pp-dogs"], [/yard size|yard-size/i, "#pp-yard"], [/service frequency|Custom booking|available service frequency/i, "[data-frequency]"], [/service area/i, "[data-area]"], [/last fully cleaned/, "#pp-last-cleaned"], [/first name/, "#pp-first"], [/last name/, "#pp-last"], [/phone number/, "#pp-phone"], [/email address/, "#pp-email"], [/service-text permission/, "#pp-sms-consent"], [/street address/, "#pp-address"], [/service city/, "#pp-city"], [/like to start/, "#pp-start"], [/your question/, "#pp-question"], [/Terms|terms/, "#pp-terms"]];
    box.innerHTML = `<strong>Please check the following:</strong><ul>${list.map(function(message, index) {
      const match = fields.find(row => row[0].test(message));
      const el = match && stageElement.querySelector(match[1]);
      if (!el) return `<li>${escapeHtml(message)}</li>`;
      const id = "pp-field-error-" + index;
      el.setAttribute("aria-invalid", "true"); el.setAttribute("aria-errormessage", id);
      if (!el.id) el.id = "pp-invalid-control-" + index;
      const note = document.createElement("p"); note.className = "field-error"; note.id = id; note.textContent = message;
      const group = el.closest(".field") || el.closest(".check") || el;
      if (group === el && !el.closest(".field, .check")) group.insertAdjacentElement("afterend", note); else group.appendChild(note);
      return `<li><button type="button" class="error-jump" data-error-target="${escapeHtml(el.id)}">${escapeHtml(message)}</button></li>`;
    }).join("")}</ul>`;
    box.classList.add("show"); box.focus();
  }

  function validatePlan() {
    const quote = currentQuote();
    const errors = quote.errors ? quote.errors.slice() : [];
    if (!["new", "returning", "not_sure"].includes(state.customerStatus)) errors.push("Choose whether you have used Purge Pros before.");
    return errors;
  }

  function validateDetails() {
    const errors = [];
    const service = state.intent === "service_request";
    if (!LAST_CLEANED_CHOICES.includes(state.lastCleaned)) errors.push("Choose when the yard was last fully cleaned.");
    if (!state.firstName.trim()) errors.push("Enter your first name.");
    if (service && !state.lastName.trim()) errors.push("Enter your last name.");
    if ((service || state.preferredContact !== "email" || state.phone.trim()) && !normalizePhone(state.phone)) errors.push("Enter a valid 10-digit phone number.");
    if ((state.preferredContact === "email" || state.email.trim()) && !validEmail(state.email)) errors.push("Enter a valid email address.");
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
      customerStatus: state.customerStatus,
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

  function submissionFingerprint(payload) {
    // Compare the normalized request, not retry-time cookies or timestamps.
    // Attribution and consent evidence remain exactly as first submitted.
    const materialFields = [
      "schemaVersion", "stage", "intent", "zip", "dogs", "frequencyId",
      "areaIds", "yardSizeId", "lastCleaned", "customerStatus", "startTiming",
      "clientPriceCents", "pricingVersion", "customEstimate", "customReasons",
      "phone", "firstName", "lastName", "email", "street", "city", "state",
      "preferredContact", "smsTransactionalConsent", "consentVersion",
      "termsAccepted", "termsVersion", "question", "notes"
    ];
    return JSON.stringify(materialFields.map(function (field) {
      const value = payload[field];
      return (field === "areaIds" || field === "customReasons") && Array.isArray(value)
        ? value.slice().sort() : value;
    }));
  }

  function payloadForSubmission() {
    const candidate = buildPayload();
    const fingerprint = submissionFingerprint(candidate);
    if (state.pendingSubmission && state.pendingSubmission.fingerprint === fingerprint) {
      return state.pendingSubmission.payload;
    }
    // Memory only: a reload starts a new request. Never persist contact details.
    state.pendingSubmission = { fingerprint: fingerprint, payload: JSON.parse(JSON.stringify(candidate)) };
    return state.pendingSubmission.payload;
  }

  async function submit() {
    if (state.submitting) return;
    if (state.submissionReviewMessage) return showError(state.submissionReviewMessage);
    if (state.intent === "service_request" && !state.termsAccepted) return showError("Agree to the Terms of Service and acknowledge the Privacy Policy before submitting.");
    const detailErrors = validateDetails();
    if (detailErrors.length) return showError(detailErrors);
    const payload = payloadForSubmission();
    state.submitting = true;
    renderReview();
    focusSendingStatus();
    try {
      let body = { accepted: true, requestId: payload.requestId };
      if (CONFIG.leadEndpoint) {
        const controller = new AbortController();
        const timeout = window.setTimeout(function () { controller.abort(); }, 15000);
        let response, text;
        try {
          response = await fetch(CONFIG.leadEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            credentials: "omit",
            signal: controller.signal
          });
          text = await response.text();
        } finally {
          window.clearTimeout(timeout);
        }
        if (text) {
          try { body = JSON.parse(text); } catch (_) { body = { accepted: response.ok, requestId: payload.requestId }; }
        }
        if (body.code === "SUBMISSION_UNCERTAIN" || body.code === "REQUEST_ID_CONFLICT") {
          state.submissionReviewMessage = body.message || "Please call Purge Pros to confirm your request before submitting again.";
          throw new Error(state.submissionReviewMessage);
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
      state.pendingSubmission = null;
    } catch (error) {
      state.submitting = false;
      renderReview();
      const message = error && error.name === "AbortError"
        ? "This is taking longer than expected. Please try again or call " + CONFIG.brand.phoneDisplay + "."
        : error && error.message || "We could not send this request. Please try again or call " + CONFIG.brand.phoneDisplay + ".";
      if (!state.submissionReviewMessage) showError(message);
      else focusQuoteStage();
    }
  }

  function handleInput(event) {
    if (state.submitting) return;
    const target = event.target;
    if (target.id === "pp-zip") {
      state.zip = normalizeZip(target.value);
      target.value = state.zip;
      state.zipIneligible = false;
      target.removeAttribute("aria-invalid");
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
    if (state.submitting) return;
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
    if (field === "lastCleaned") saveLowRiskProgress();
    if (field && state.step === 2) {
      if (field === "yardSize") track("yard_size_selected", { yard_size: state.yardSize });
      if (field === "dogCount" || field === "yardSize") reconcileFrequencySelection();
      saveLowRiskProgress();
      renderPlan();
    }
  }

  function handleClick(event) {
    if (state.submitting) return;
    const errorLink = event.target.closest("[data-error-target]");
    if (errorLink) { const target = shadow.getElementById(errorLink.dataset.errorTarget); if (target) target.focus(); return; }
    const dogButton = event.target.closest("[data-dog]");
    if (dogButton) {
      state.dogCount = dogButton.dataset.dog;
      track("dog_count_selected", { dogs: Number(state.dogCount) });
      reconcileFrequencySelection();
      saveLowRiskProgress();
      renderPlan();
      return;
    }
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
    if (action === "save-plan-link") return savePlanResumeLink();
    if (action === "show-offer") return showOffer();
    if (action === "close-offer") return closeOffer();
    if (action === "close") return close();
    if (action === "edit-plan" || action === "edit-contact") {
      if (state.step !== 5 || state.submitting || state.submissionReviewMessage) return;
      state.reviewEdit = action === "edit-plan" ? "plan" : "contact";
      // The final review must acknowledge the current request after any edit.
      // Contact fields and SMS permission remain in memory as before.
      state.termsAccepted = false;
      state.termsAcceptedAt = "";
      return goTo(state.reviewEdit === "plan" ? 2 : 4);
    }
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
      if (state.reviewEdit === "plan") {
        const detailErrors = validateDetails();
        if (detailErrors.length) {
          state.reviewEdit = "contact";
          goTo(4);
          return showError(detailErrors);
        }
        state.reviewEdit = null;
        return goTo(5);
      }
      track("price_viewed", { frequency: state.frequency, custom: quote.custom, value: quote.custom ? undefined : quote.priceCents / 100 });
      return goTo(3);
    }
    if (action === "choose-intent") {
      state.reviewEdit = null;
      state.intent = button.dataset.intent;
      if (state.intent === "quote_delivery" && state.preferredContact === "call") state.preferredContact = "text";
      state.termsAccepted = false;
      state.termsAcceptedAt = "";
      return goTo(4);
    }
    if (action === "review") {
      const planErrors = validatePlan();
      if (planErrors.length) {
        if (state.reviewEdit) state.reviewEdit = "plan";
        goTo(2);
        return showError(planErrors);
      }
      const errors = validateDetails();
      if (errors.length) return showError(errors);
      state.reviewEdit = null;
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
    if (event.key === "Tab" && shadow) trapQuoteTab(event);
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
      const rating = Number(data.rating);
      const count = Number(data.count);
      if (reviewChip && Number.isFinite(rating) && rating > 0 && rating <= 5 && Number.isInteger(count) && count > 0) {
        reviewChip.textContent = CONFIG.brand.reviewChipTemplate
          .replace("{rating}", rating.toFixed(1))
          .replace("{count}", count.toLocaleString("en-US"));
      }
    }).catch(function () {});
  }

  function applyEntry(options) {
    if (!options || typeof options.zip !== "string") return;
    const zip = options.zip.trim();
    if (!/^\d{5}$/.test(zip)) { state.step = 1; return; }
    state.zip = zip;
    state.zipIneligible = CONFIG.serviceZips.indexOf(zip) < 0;
    state.step = state.zipIneligible ? 1 : 2;
    track(state.zipIneligible ? "service_area_ineligible" : "service_area_eligible", { zip_prefix: zip.slice(0, 3), entry: "hero_zip" });
    saveLowRiskProgress();
  }

  function open(options) {
    if (host && state.submitting) { focusSendingStatus(); return; }
    if (host) { closeOffer(); applyEntry(options); render(); queueMicrotask(focusQuoteStage); return; }
    previousFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    if (!restored) { restoreLowRiskProgress(); restored = true; }
    applyEntry(options);
    host = document.createElement("div");
    host.id = "purge-pros-quote-widget";
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = shellHtml();
    document.body.appendChild(host);
    document.body.style.overflow = "hidden";
    isolateQuotePage();
    stageElement = shadow.querySelector(".stage");
    progressElement = shadow.querySelector(".progress");
    shadow.addEventListener("input", handleInput);
    shadow.addEventListener("change", handleChange);
    shadow.addEventListener("click", handleClick);
    shadow.addEventListener("keydown", handleKeydown);
    shadow.addEventListener("click", function (event) {
      const summary = event.target.closest && event.target.closest("#pp-yard-guide > summary");
      if (!summary) return;
      state.yardHelpOpen = !summary.parentElement.open;
      if (state.yardHelpOpen) track("yard_size_help_opened", {});
    });
    shadow.addEventListener("toggle", function (event) {
      if (event.target.id !== "pp-yard-guide") return;
      if (event.target.open && !state.yardHelpOpen) track("yard_size_help_opened", {});
      state.yardHelpOpen = event.target.open;
    }, true);
    beginPlanResume();
    render();
    hydrateReviews();
    queueMicrotask(function () { if (stageElement) (stageElement.querySelector("#pp-coverage-result") || stageElement).focus(); });
    track("funnel_viewed", { presentation: options && options.zip ? "hero_zip" : location.hostname === "quote.itspurgepros.com" ? "dedicated" : "modal" });
  }

  function close() {
    if (!host) return;
    if (state.submitting) { focusSendingStatus(); return; }
    resetPlanResumeUiOnClose();
    releaseQuotePage();
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
    returnQuoteFocus();
  }

  document.addEventListener("click", function (event) {
    const trigger = event.target.closest && event.target.closest('[data-purge-quote], a[href="#quote"], a[href="#get-quote"]');
    // Shared pp-next launchers handle their own click first. Respect that handled event so one
    // customer action invokes open() once while this delegated fallback still works on pages
    // without pp-next.js.
    if (!trigger || event.defaultPrevented) return;
    event.preventDefault();
    open();
  });
  document.addEventListener("keydown", function (event) { if (event.key === "Escape" && host) close(); });

  window.PurgeProsQuote = { open: open, close: close, config: CONFIG };

  if (consumeAutoOpenRequest()) {
    openWhenBodyReady();
  }
})();
