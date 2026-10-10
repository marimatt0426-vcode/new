/*!
 * Purge Pros price-builder core (site rebuild v5).
 *
 * One dependency-free file with ALL of the price-builder logic and NONE of the
 * presentation. Every page design in this release writes its own interface on
 * top of this file. It never reads or writes the DOM.
 *
 *   Browser:  <script src="pp-quote-core.js"></script>   ->  window.PPQuoteCore
 *   Node:     const PPQuoteCore = require("./pp-quote-core.js")
 *
 * The guide an interface designer codes against is CORE-API.md (same folder).
 * "Spec" in the comments means spec/BUILDER-SPEC.md, the functional
 * specification of the live quote tool. Exact strings were copied from the live
 * source (purge-pros-production/production/quote/src/widget.js); the test
 * suite in ./tests checks them against that file and checks pricing and
 * payloads against the live Worker's own code.
 *
 * DEMO mode is the default: nothing is ever sent anywhere. LIVE and STAGING
 * must be asked for (create({ mode }), or the page's window.PPSite through
 * siteOptions()); each passes its own guard before a request is made.
 */
(function (globalScope, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module !== null && typeof module.exports === "object") {
    module.exports = api; // Node (tests)
  } else if (globalScope) {
    globalScope.PPQuoteCore = api; // classic <script> tag
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ======================================================================
   * 1. VERSIONS AND BRAND
   *    Spec 2.2. The Worker rejects any other schemaVersion or pricingVersion.
   *    consentVersion and termsVersion are tied to the exact wording in
   *    section 3 below; if the wording ever changes, the versions must too.
   * ==================================================================== */

  const VERSIONS = {
    schemaVersion: "cloudflare-widget.v3",
    pricingVersion: "2026-08-cloudflare-v1",
    consentVersion: "service-sms-2026-08-v1",
    termsVersion: "2026-10-11-no-start-up-fee",
    // TRACKING CHANGE APPROVED BY THE OWNER 2026-10-09 (T4): ui_version is sent with
    // every analytics event. The live widget sends liveUiVersion; this rebuild
    // sends its own value so reports can tell the two front ends apart.
    liveUiVersion: "2026-09-12-website-improvements-v1",
    uiVersion: "2026-10-07-site-rebuild-v5"
  };

  const BRAND = {
    name: "Purge Pros",
    phoneDisplay: "(317) 961-5865",
    phoneHref: "tel:+13179615865",
    privacyUrl: "https://itspurgepros.com/privacy-policy",
    termsUrl: "https://itspurgepros.com/terms-conditions",
    reviewsUrl: "https://itspurgepros.com/reviews"
  };

  // Storage keys and lifetimes are the live widget's (spec section 9), so a
  // visitor's progress carries between old and new pages in the same tab.
  const STORAGE_KEYS = {
    progress: "pp_quote_progress_v3", // sessionStorage, plan answers only
    attribution: "pp_quote_attribution_v3", // sessionStorage, the nine URL parameters
    // The ONE key kept beyond the browser session (the browser's local
    // storage): the last non-empty set of the same nine URL parameters and
    // the moment it was captured, for ATTRIBUTION_KEEP_DAYS (T23). Never a
    // plan answer, a contact detail, a consent or a request id.
    attributionKept: "pp_quote_attribution_kept_v1"
  };

  // The only plan fields that may ever be written to browser storage
  // (spec 9.1 and 17.2 item 11). Nothing personal is ever stored.
  const PERSISTED_PLAN_KEYS = ["zip", "dogCount", "frequency", "areas", "yardSize", "lastCleaned", "customerStatus"];

  // Spec 9.2. Captured from the page URL, kept for the session, sent with a request.
  const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "wbraid", "gbraid", "fbclid"];
  const ATTRIBUTION_VALUE_MAX = 250;
  // How long the last non-empty set of those nine parameters is remembered
  // in this browser (T23), so a visitor who clicked an ad and comes back on
  // another day still arrives with a source. A copy dated more than a day
  // ahead of the clock is not trusted and is removed.
  const ATTRIBUTION_KEEP_DAYS = 30;
  const ATTRIBUTION_KEEP_MS = ATTRIBUTION_KEEP_DAYS * 24 * 60 * 60 * 1000;
  const ATTRIBUTION_CLOCK_SLACK_MS = 24 * 60 * 60 * 1000;

  // Spec 12.2 "notes": the fixed text the live widget sends with a service request.
  const SERVICE_REQUEST_NOTES = "Submitted through transparent-price Cloudflare widget.";

  // Spec 2.1 and 10.2. A public Google Ads conversion label (it is printed in
  // the public repository). Used only by the "conversion" event.
  // TRACKING CHANGE APPROVED BY THE OWNER 2026-10-09 (T12): the live widget is handed
  // this label by the Worker when the script is served; the engine carries it
  // as its default (create({ googleAdsSendTo }) replaces or removes it).
  const LIVE_GOOGLE_ADS_SEND_TO = "AW-17767139897/g9smCM7pkL4cELmUhJhC";

  // Spec 12.1. Origins the Worker accepts requests from (checked-in config).
  // Live mode refuses to run anywhere else, and never from file://.
  const LIVE_ALLOWED_ORIGINS = [
    "https://itspurgepros.com",
    "https://www.itspurgepros.com",
    "https://blog.itspurgepros.com",
    "https://purge-quote.purgepros.workers.dev"
  ];

  const SUBMIT_TIMEOUT_MS = 15000; // spec 4.5.2 step 6
  const SAVE_LINK_TIMEOUT_MS = 12000; // spec 8.1

  // Save links always have this exact form (spec 8.1 step 2).
  const SAVE_LINK_PATTERN = /^https:\/\/quote\.itspurgepros\.com\/#resume=[A-Za-z0-9_-]{43}$/;
  const SAVE_LINK_PREFIX = "https://quote.itspurgepros.com/#resume=";
  const RESUME_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
  // The exact six keys of a save-link body, in the order the live widget sends them.
  const SAVE_LINK_KEYS = ["zip", "dogs", "frequencyId", "yardSizeId", "areaIds", "customerStatus"];

  /* ======================================================================
   * 2. OPTION LISTS
   *    Ids are the Worker contract (spec 17.1 item 3) and must not change.
   *    Labels are the live labels. A design may show different words for the
   *    frequencies by passing `labels` to create(); the ids stay.
   * ==================================================================== */

  // Dogs are stored as the strings "1" to "10". "10" means 10 or more (spec 4.2 Q1).
  const DOG_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (count) {
    return {
      id: String(count),
      count: count,
      label: count === 10 ? "10+ dogs" : count + (count === 1 ? " dog" : " dogs"),
      // The brief shows 1 to 4 as large tiles; "5 or more" reveals the rest.
      group: count <= 4 ? "main" : "more"
    };
  });

  // Yard sizes (spec 4.2 Q3 and 5.3). addCents applies to recurring plans only.
  // maxSquareFeet is the yard-guide table (spec section 7).
  const YARD_SIZES = [
    { id: "s", label: "Up to ⅛ acre", addCents: 0, custom: false, maxSquareFeet: 5445 },
    { id: "m", label: "Up to ¼ acre", addCents: 400, custom: false, maxSquareFeet: 10890 },
    { id: "l", label: "Up to ½ acre", addCents: 800, custom: false, maxSquareFeet: 21780 },
    { id: "xl", label: "Up to 1 acre", addCents: 1200, custom: false, maxSquareFeet: 43560 },
    { id: "over", label: "Over 1 acre", addCents: null, custom: true, maxSquareFeet: null }
  ];

  // Areas (spec 4.2 Q4). Nothing is ever preselected.
  const AREAS = [
    { id: "back", label: "Back yard" },
    { id: "front", label: "Front yard" },
    { id: "side", label: "Side yard(s)" }
  ];

  // The area adder depends only on HOW MANY areas are selected (spec 5.3).
  const AREA_ADDERS_CENTS = { 1: 0, 2: 250, 3: 500 };

  // Frequencies (spec 4.2 Q2 and 5.2). `prices` is the base price per visit in
  // cents by dog count. A dog count missing from `prices` is not offered.
  const FREQUENCIES = [
    {
      id: "twice",
      label: "Twice weekly",
      sub: "For busy yards and multiple dogs",
      popular: false,
      custom: false,
      anyDogs: false,
      maxDogs: 9,
      prices: { 1: 1599, 2: 1749, 3: 1899, 4: 2049, 5: 2199, 6: 2349, 7: 2499, 8: 2649, 9: 2799 }
    },
    {
      id: "weekly",
      label: "Weekly",
      sub: "The most popular maintenance plan",
      popular: true,
      custom: false,
      anyDogs: false,
      maxDogs: 5,
      prices: { 1: 1999, 2: 2249, 3: 2499, 4: 2749, 5: 2999 }
    },
    {
      id: "biweekly",
      label: "Every other week",
      sub: "For lighter-use yards",
      popular: false,
      custom: false,
      anyDogs: false,
      maxDogs: 4,
      prices: { 1: 2999, 2: 3349, 3: 3699, 4: 4049 }
    },
    {
      id: "onetime",
      label: "One-time cleanup",
      sub: "A one-visit pet waste cleanup",
      popular: false,
      custom: false,
      anyDogs: true,
      flatPriceCents: 8999
    },
    {
      id: "custom",
      label: "Custom booking",
      sub: "10+ dogs · over 1 acre · kennels & commercial",
      popular: false,
      custom: true,
      anyDogs: true
    }
  ];

  // One-time cleanup facts (spec 4.3.3 and 6.3). The numbers must not change.
  const ONE_TIME = {
    baseCents: 8999,
    includedMinutes: 30,
    extraPerMinuteCents: 100,
    lineItemLabel: "One-time cleanup · first 30 minutes",
    summary: "The first 30 minutes are included. Additional labor is $1 per minute."
  };

  // Shown under a recurring price on the final summary (spec 4.3.1).
  const RECURRING_PRICE_NOTE = "Your recurring maintenance price. Final service-day availability is confirmed before secure payment setup.";

  // The fixed teaser shown until the exact price is known (brief section 6).
  // Display only. 1999 is the weekly price for one dog, smallest yard, one area.
  const FROM_LINE = { cents: 1999, text: "Weekly visits from $19.99" };

  // "Last full cleanup" (spec 5.6). The value sent IS the label. En dashes.
  const LAST_CLEANED_OPTIONS = ["Within 1 week", "2–3 weeks", "About 1 month", "2–4 months", "5–6 months", "More than 6 months"];

  // "When would you like to start?" (spec 5.7). The value sent IS the label.
  const START_TIMING_OPTIONS = ["As soon as possible", "Within the next week", "In the next few weeks", "Just researching for now"];

  // Customer status (spec 4.2 Q5). Three values, not two (spec section 14 item 6).
  const CUSTOMER_STATUS_OPTIONS = [
    { id: "new", label: "No — I’m a new customer" },
    { id: "returning", label: "Yes — I’m returning or already a customer" },
    { id: "not_sure", label: "I’m not sure / new occupant" }
  ];

  // Reply methods (spec 12.7). "call" is never offered for a quote delivery.
  // successWhere completes "Keep an eye on ..." on the success screen (spec 4.6).
  const CONTACT_METHODS = [
    { id: "text", label: "Text message", successWhere: "your text messages" },
    { id: "email", label: "Email", successWhere: "your inbox" },
    { id: "call", label: "Phone call", successWhere: "your phone" }
  ];

  // Intents (spec 12.3). The labels are the live button labels.
  const INTENTS = [
    { id: "service_request", label: "Request service" },
    { id: "quote_delivery", label: "Send me this quote" },
    { id: "question", label: "Ask a question" }
  ];

  // The stage the Worker derives for each intent (spec 12.3). A service
  // request for a custom estimate has its own stage.
  const STAGES = {
    service_request: "service_requested",
    service_request_custom: "estimate_requested",
    quote_delivery: "quote_requested",
    question: "question_submitted"
  };

  // Custom-estimate reason codes sent in the payload, with the live wording (spec 4.3.2).
  const CUSTOM_REASON_LABELS = {
    CUSTOM_BOOKING_SELECTED: "custom booking selected",
    DOG_COUNT_10_PLUS: "10+ dogs",
    YARD_OVER_ONE_ACRE: "over one acre"
  };

  // The order of questions in THIS rebuild (brief section 6).
  const STEPS = ["dogs", "zip", "yard", "areas", "frequency", "price", "request", "confirm", "done"];
  const PLAN_STEPS = ["dogs", "zip", "yard", "areas", "frequency"];

  /* ======================================================================
   * 3. EXACT COMPLIANCE WORDING (render these; never retype them)
   *    Spec 4.4.1, 4.5 and 17.2. The consent wording is tied to
   *    consentVersion and the terms wording to termsVersion.
   *    "{privacy}" and "{terms}" mark where the two policy links go.
   * ==================================================================== */

  const CONSENT = {
    version: VERSIONS.consentVersion,
    // Render as: <strong>{lead}</strong> {body}
    lead: "Text me about my quote and service.",
    body: "I consent to receive non-marketing text messages from Purge Pros about my quote, availability, scheduling, service and account at the number provided. Message frequency varies. Message and data rates may apply. Text HELP for assistance; reply STOP to opt out.",
    // Always shown next to the box, with both policy names as links (new tab).
    alternativeWithCall: "You may choose Email or Phone Call instead of consenting to SMS. Review our {privacy} and {terms}.",
    alternativeWithoutCall: "You may choose Email instead of consenting to SMS. Review our {privacy} and {terms}.",
    privacyLinkText: "Privacy Policy",
    termsLinkText: "Terms & Conditions",
    // Phone-field hints (spec 4.4). The service one must stay (spec 17.2 item 3).
    phoneHintService: "Required for your service record. Providing a number does not opt you into texts.",
    phoneHintOther: "10-digit U.S. number. Optional when receiving a quote or answer by email.",
    // Validation messages when Text is chosen without the box ticked.
    errorWithCall: "To choose Text, select the service-text permission or choose Email/Phone call.",
    errorWithoutCall: "To choose Text, select the service-text permission or choose Email."
  };

  const TERMS = {
    version: VERSIONS.termsVersion,
    // Service requests only: an unticked checkbox with this wording.
    recurring: "I agree to the {terms} and acknowledge the {privacy}. I understand this is a request for service-day review, not a confirmed appointment.",
    oneTime: "I agree to the {terms} and acknowledge the {privacy}. I understand this is a request for cleanup availability, not a confirmed appointment.",
    termsLinkText: "Terms of Service",
    privacyLinkText: "Privacy Policy",
    // Quote delivery and question: no checkbox, this line instead.
    otherIntents: "By submitting, you acknowledge the {privacy}.",
    error: "Agree to the Terms of Service and acknowledge the Privacy Policy before submitting."
  };

  // Promises that are not free to reword (spec 18.3, "Not free").
  const PROMISES = {
    outOfAreaNoContact: "We will not collect your contact details in this form for an unsupported ZIP.",
    nothingCharged: "Nothing is charged or scheduled by this form.",
    requestNotBooking: "We will not schedule service or collect payment from this submission."
  };

  /* ======================================================================
   * 4. SERVICE AREA
   *    The 53 accepted ZIPs (spec 5.1). This list must stay identical to
   *    CONFIG.serviceZips in the live widget and SERVICE_ZIPS in the Worker;
   *    the tests compare all three. No request and no save link is ever made
   *    for a ZIP outside it (spec 17.1 item 6).
   * ==================================================================== */

  const SERVICE_ZIPS = [
    "46011", "46013", "46014", "46015", "46016", "46032", "46033", "46034", "46037",
    "46038", "46040", "46048", "46051", "46055", "46056", "46060", "46061", "46062",
    "46064", "46074", "46075", "46077", "46112", "46113", "46122", "46123", "46140",
    "46142", "46143", "46158", "46163", "46167", "46168", "46214", "46216", "46217",
    "46220", "46221", "46227", "46228", "46231", "46234", "46236", "46237", "46239",
    "46240", "46250", "46256", "46259", "46260", "46268", "46278", "46280"
  ];

  // ZIP to community. Neither the live widget nor the Worker has such a table.
  // Source: spec/cities.json lookups.zipToCommunity (same grouping as
  // spec/CONTENT-CITIES.md section 5 and assets/map/communities.json). That
  // file says where the grouping comes from: USPS city names from general
  // knowledge for the 17 cities with pages, operations/DECISIONS.md item 15 for
  // the nine communities without pages, and the vault coverage audit for the
  // PO Box flags. No ZIP is printed on any live page, so the owner has not
  // confirmed this table. It is used ONLY to pre-fill an editable City field
  // and to name the community in the coverage answer. It never decides coverage.
  // `page` is the live city page path, or null where there is no page yet.
  const COMMUNITIES = [
    { name: "Anderson", page: "/anderson", zips: ["46011", "46013", "46014", "46015", "46016"] },
    { name: "Avon", page: "/avon", zips: ["46123"] },
    { name: "Brownsburg", page: "/brownsburg", zips: ["46112"] },
    { name: "Camby", page: null, zips: ["46113"] },
    { name: "Carmel", page: "/carmel", zips: ["46032", "46033"] },
    { name: "Cicero", page: null, zips: ["46034"] },
    { name: "Danville", page: "/danville", zips: ["46122"] },
    { name: "Fishers", page: "/fishers", zips: ["46037", "46038"] },
    { name: "Fortville", page: "/fortville", zips: ["46040"] },
    { name: "Greenfield", page: "/greenfield", zips: ["46140"] },
    { name: "Greenwood", page: "/greenwood", zips: ["46142", "46143"] },
    { name: "Indianapolis", page: "/indianapolis", zips: ["46214", "46217", "46220", "46221", "46227", "46228", "46231", "46234", "46237", "46239", "46240", "46250", "46256", "46259", "46260", "46268", "46278", "46280"] },
    { name: "Ingalls", page: "/ingalls", zips: ["46048"] },
    { name: "Lapel", page: null, zips: ["46051"] },
    { name: "Lawrence", page: "/lawrence", zips: ["46216", "46236"] },
    { name: "Markleville", page: null, zips: ["46056"] },
    { name: "McCordsville", page: "/mccordsville", zips: ["46055"] },
    { name: "Mooresville", page: null, zips: ["46158"] },
    { name: "New Palestine", page: "/new-palestine", zips: ["46163"] },
    { name: "Noblesville", page: "/noblesville", zips: ["46060", "46061", "46062"] },
    { name: "Pendleton", page: null, zips: ["46064"] },
    { name: "Pittsboro", page: null, zips: ["46167"] },
    { name: "Plainfield", page: "/plainfield", zips: ["46168"] },
    { name: "Westfield", page: "/westfield", zips: ["46074"] },
    { name: "Whitestown", page: null, zips: ["46075"] },
    { name: "Zionsville", page: null, zips: ["46077"] }
  ];

  // Per-ZIP exceptions, each one stated in spec/CONTENT-CITIES.md section 5:
  //  - poBox: a PO Box ZIP according to the vault coverage audit. Still accepted
  //    by the Worker, so still accepted here; a design may choose not to offer
  //    it as a one-tap choice.
  //  - mailingCity: the USPS city name differs from the community (both
  //    Lawrence ZIPs carry the USPS name Indianapolis).
  //  - alsoCovers: the ZIP also reaches another community.
  const ZIP_EXCEPTIONS = {
    "46014": { poBox: true },
    "46015": { poBox: true },
    "46061": { poBox: true },
    "46062": { alsoCovers: ["Westfield"] },
    "46216": { mailingCity: "Indianapolis" },
    "46236": { mailingCity: "Indianapolis" },
    "46280": { alsoCovers: ["Carmel"] }
  };

  // Built once from the two tables above: ZIP -> { zip, community, city, alternates, page, poBox }.
  //   community  = the Purge Pros community this ZIP is listed under.
  //   city       = the value to pre-fill in the City field (the USPS mailing name).
  //   alternates = other city names that are also right for this ZIP.
  const ZIP_TO_COMMUNITY = (function buildZipTable() {
    const table = {};
    COMMUNITIES.forEach(function (community) {
      community.zips.forEach(function (zip) {
        const exception = ZIP_EXCEPTIONS[zip] || {};
        const city = exception.mailingCity || community.name;
        const alternates = [];
        if (city !== community.name) alternates.push(community.name);
        (exception.alsoCovers || []).forEach(function (name) { alternates.push(name); });
        table[zip] = {
          zip: zip,
          community: community.name,
          city: city,
          alternates: alternates,
          page: community.page,
          poBox: exception.poBox === true
        };
      });
    });
    return table;
  })();

  // Live wording of the out-of-area answer (spec 4.1). The tone may change
  // (spec 18.3); the promise in `edgeBody` may not.
  const OUT_OF_AREA_COPY = {
    kicker: "Outside our service area",
    heading: "We do not service ZIP {zip} yet.",
    help: "Purge Pros serves Indianapolis and nearby Central Indiana communities. If you entered the wrong ZIP, correct it below.",
    edgeLead: "Near the edge of our routes?",
    edgeBody: "Call (317) 961-5865 and we can check the address. We will not collect your contact details in this form for an unsupported ZIP."
  };

  const ZIP_INCOMPLETE_MESSAGE = "Enter a valid 5-digit ZIP code.";

  /* ======================================================================
   * 5. SMALL PURE HELPERS (no state, no browser)
   * ==================================================================== */

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function findById(list, id) {
    for (let index = 0; index < list.length; index += 1) {
      if (list[index].id === id) return list[index];
    }
    return null;
  }

  function deepFreeze(value) {
    if (value && typeof value === "object" && !(value instanceof RegExp) && !Object.isFrozen(value)) {
      Object.freeze(value);
      Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
    }
    return value;
  }

  // "$28.99", "$1,234.50". Same output as the live widget's Intl formatting
  // for US dollars, written out so it cannot vary between browsers.
  function formatMoney(cents) {
    const number = Number(cents);
    if (!Number.isFinite(number)) return "";
    const negative = number < 0;
    const fixed = (Math.abs(Math.round(number)) / 100).toFixed(2);
    const parts = fixed.split(".");
    const whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (negative ? "-" : "") + "$" + whole + "." + parts[1];
  }

  // "28.99" (no symbol). This is the payload's perVisitPrice format.
  function formatDollars(cents) {
    return (Number(cents) / 100).toFixed(2);
  }

  // Keeps digits only, at most five (spec 4.1).
  function normalizeZip(value) {
    return String(value == null ? "" : value).replace(/\D/g, "").slice(0, 5);
  }

  // A US number is valid with 10 digits, or 11 starting with 1 (spec 4.4).
  // Returns { digits, e164 } or null.
  // AUDIT FIX B1 (2026-10-09, owner's standing approval for audit findings):
  // a number whose area code or exchange starts with 0 or 1 is refused. No
  // US number has one, so every real number the Worker accepts is still
  // accepted here; what is refused is the wrong number left when "+1" was
  // read as part of the area code ("(131) 755-5010"). A front-end rule only:
  // the Worker's own check and the payload are unchanged.
  // FIX 2026-10-10 (VERIFY-xbrowser N3): a number written with a country code
  // other than +1 ("+52 55 1234 5678") is not a US number and is refused; it
  // used to be cut to its first ten digits and could pass as a US number.
  function hasForeignCountryCode(value) {
    return /^\s*\+\s*[02-9]/.test(String(value == null ? "" : value));
  }
  function normalizePhone(value) {
    if (hasForeignCountryCode(value)) return null;
    let digits = String(value == null ? "" : value).replace(/\D/g, "");
    if (digits.length === 11 && digits.charAt(0) === "1") digits = digits.slice(1);
    if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
    return { digits: digits, e164: "+1" + digits };
  }

  // "(317) 555-0100" while typing (spec 4.4).
  // The country code goes first ("+1" or a leading 1 on a number that is
  // longer than ten digits), THEN the digits are capped at ten. The phone
  // input itself carries no maxlength (B1): a browser applies that before
  // this function runs and would cut "+1 317-555-0100" to a wrong number.
  function formatPhone(value) {
    let digits = String(value == null ? "" : value).replace(/\D/g, "");
    // A country code other than +1 is kept as written (digits only, at most 15),
    // so the field shows what arrived and the check refuses it (N3).
    if (hasForeignCountryCode(value)) return "+" + digits.slice(0, 15);
    if (digits.length > 10 && digits.charAt(0) === "1") digits = digits.slice(1);
    digits = digits.slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return "(" + digits.slice(0, 3) + ") " + digits.slice(3);
    return "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6);
  }

  // Must look like a@b.c and be at most 254 characters (the Worker's rule).
  function isValidEmail(value) {
    const email = String(value == null ? "" : value).trim();
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function isTenPlusDogs(dogCount) {
    return Number(dogCount) >= 10;
  }

  // "1 dog", "2 dogs", "10+ dogs".
  function dogsLabel(dogCount) {
    const option = findById(DOG_OPTIONS, String(dogCount));
    return option ? option.label : "";
  }

  /* ======================================================================
   * 6. COVERAGE CHECK
   *    Spec 4.1 and 17.2 item 10. An out-of-area ZIP never allows contact
   *    capture: contactAllowed is false and every send path refuses.
   * ==================================================================== */

  // checkZip("46032") -> { status: "in_area", city: "Carmel", ... }
  // status is one of: "empty", "incomplete", "in_area", "out_of_area".
  function checkZip(value) {
    const zip = normalizeZip(value);
    const result = {
      status: "empty",
      zip: zip,
      complete: zip.length === 5,
      inArea: false,
      contactAllowed: false,
      community: "",
      city: "",
      alternates: [],
      page: null,
      poBox: false,
      message: ZIP_INCOMPLETE_MESSAGE
    };
    if (zip.length === 0) return result;
    if (zip.length < 5) {
      result.status = "incomplete";
      return result;
    }
    if (SERVICE_ZIPS.indexOf(zip) < 0) {
      result.status = "out_of_area";
      result.message = OUT_OF_AREA_COPY.heading.replace("{zip}", zip);
      return result;
    }
    const entry = ZIP_TO_COMMUNITY[zip];
    result.status = "in_area";
    result.inArea = true;
    result.contactAllowed = true;
    result.message = "";
    if (entry) {
      result.community = entry.community;
      result.city = entry.city;
      result.alternates = entry.alternates.slice();
      result.page = entry.page;
      result.poBox = entry.poBox;
    }
    return result;
  }

  // cityForZip("46216") -> { zip, community: "Lawrence", city: "Indianapolis", alternates: ["Lawrence"], page, poBox }
  // Returns null for a ZIP that is not accepted.
  function cityForZip(value) {
    const entry = ZIP_TO_COMMUNITY[normalizeZip(value)];
    if (!entry) return null;
    return { zip: entry.zip, community: entry.community, city: entry.city, alternates: entry.alternates.slice(), page: entry.page, poBox: entry.poBox };
  }

  /* ======================================================================
   * 7. PRICING AND ELIGIBILITY
   *    Spec 4.2.1 and section 5. The Worker recomputes the price and rejects
   *    any mismatch, so this must stay equal to the Worker's calculateQuote.
   *    tests/pricing-differential.test.mjs compares every combination.
   * ==================================================================== */

  // Display labels for the five frequencies. A design may rename them on
  // screen (spec 5.8: the Worker rebuilds its own labels from the ids).
  function defaultFrequencyLabels() {
    const labels = {};
    FREQUENCIES.forEach(function (frequency) { labels[frequency.id] = frequency.label; });
    return labels;
  }

  // Is this frequency allowed for this dog count and yard size? (spec 4.2.1)
  // dogCount may be "" (not chosen yet): then only the yard rule applies.
  // The yard reason wins when both apply.
  function frequencyEligibility(frequencyId, dogCount, yardSizeId, frequencyLabels) {
    const labels = frequencyLabels || defaultFrequencyLabels();
    const definition = findById(FREQUENCIES, frequencyId);
    if (!definition) return { allowed: false, code: "UNKNOWN_FREQUENCY", reason: "Choose a service frequency." };
    if (definition.custom) return { allowed: true, code: "", reason: "" };
    if (yardSizeId === "over") {
      return { allowed: false, code: "YARD_OVER_ONE_ACRE", reason: "Choose " + labels.custom + " for yards over 1 acre" };
    }
    const dogs = Number(dogCount);
    if (definition.anyDogs || !dogs) return { allowed: true, code: "", reason: "" };
    if (definition.prices[dogs]) return { allowed: true, code: "", reason: "" };
    return { allowed: false, code: "TOO_MANY_DOGS", reason: "Available for up to " + definition.maxDogs + " dogs" };
  }

  // The one price calculation (spec 5.4).
  //   plan = { dogs, frequencyId, yardSizeId, areaIds }   (dogs may be "2" or 2)
  // Returns one of:
  //   { ok: false, errors: [{ field, code, message }] }
  //   { ok: true, custom: true,  reasons: [...], ... }                 no price
  //   { ok: true, custom: false, priceCents, baseCents, yardAddCents, areaAddCents, lineItems, ... }
  // lineItems are for the final price summary only (spec 5.5).
  function calculateQuote(plan, frequencyLabels) {
    const labels = frequencyLabels || defaultFrequencyLabels();
    const input = plan || {};
    const dogs = Number(input.dogs);
    const frequencyId = String(input.frequencyId == null ? "" : input.frequencyId);
    const frequency = findById(FREQUENCIES, frequencyId);
    const yardSizeId = String(input.yardSizeId == null ? "" : input.yardSizeId);
    const yard = findById(YARD_SIZES, yardSizeId);
    const givenAreas = Array.isArray(input.areaIds) ? input.areaIds : [];
    const areaIds = [];
    let unknownArea = false;
    givenAreas.forEach(function (id) {
      if (!findById(AREAS, id)) unknownArea = true;
      else if (areaIds.indexOf(id) < 0) areaIds.push(id);
    });

    const errors = [];
    if (!Number.isInteger(dogs) || dogs < 1 || dogs > 10) errors.push({ field: "dogCount", code: "DOGS_REQUIRED", message: "Choose the number of dogs." });
    if (!frequency) errors.push({ field: "frequency", code: "FREQUENCY_REQUIRED", message: "Choose a service frequency." });
    if (!yard) errors.push({ field: "yardSize", code: "YARD_REQUIRED", message: "Choose the serviced yard size." });
    if (!areaIds.length || unknownArea) errors.push({ field: "areas", code: "AREAS_REQUIRED", message: "Choose at least one service area." });
    // The two "wrong combination" messages only show when nothing is missing (spec 4.2.3).
    if (!errors.length && yard.custom && !frequency.custom) {
      errors.push({ field: "frequency", code: "YARD_OVER_ONE_ACRE", message: "Choose " + labels.custom + " for yards over 1 acre." });
    }
    if (!errors.length && !frequency.custom && frequencyId !== "onetime" && !frequency.prices[dogs]) {
      errors.push({ field: "frequency", code: "FREQUENCY_NOT_OFFERED", message: "Choose an available service frequency for this dog count." });
    }
    if (errors.length) return { ok: false, errors: errors };

    const common = { ok: true, pricingVersion: VERSIONS.pricingVersion, dogs: dogs, frequencyId: frequencyId, yardSizeId: yardSizeId, areaIds: areaIds };

    // Custom estimate: no price is ever shown (spec 17.2 item 9).
    const reasons = [];
    if (frequency.custom) reasons.push("CUSTOM_BOOKING_SELECTED");
    if (dogs >= 10 && frequencyId !== "onetime") reasons.push("DOG_COUNT_10_PLUS");
    if (yard.custom) reasons.push("YARD_OVER_ONE_ACRE");
    if (reasons.length) {
      return Object.assign(common, { custom: true, reasons: reasons, priceCents: null, lineItems: [] });
    }

    // One-time cleanup: flat price. Yard and areas are required but add nothing (spec 4.3.3).
    if (frequencyId === "onetime") {
      return Object.assign(common, {
        custom: false,
        reasons: [],
        oneTime: true,
        priceCents: frequency.flatPriceCents,
        baseCents: frequency.flatPriceCents,
        yardAddCents: 0,
        areaAddCents: 0,
        lineItems: [{ label: ONE_TIME.lineItemLabel, cents: frequency.flatPriceCents, amount: formatMoney(frequency.flatPriceCents) }]
      });
    }

    // Recurring: base for the dog count + yard adder + area adder.
    const baseCents = frequency.prices[dogs];
    const areaAddCents = AREA_ADDERS_CENTS[areaIds.length] || 0;
    const yardAddCents = yard.addCents || 0;
    const lineItems = [{ label: labels[frequencyId] + " · " + dogs + " " + (dogs === 1 ? "dog" : "dogs"), cents: baseCents, amount: formatMoney(baseCents) }];
    if (areaAddCents) {
      const areaText = areaIds.map(function (id) { return findById(AREAS, id).label; }).join(" + ");
      lineItems.push({ label: areaText, cents: areaAddCents, amount: formatMoney(areaAddCents) });
    }
    if (yardAddCents) lineItems.push({ label: yard.label, cents: yardAddCents, amount: formatMoney(yardAddCents) });
    return Object.assign(common, {
      custom: false,
      reasons: [],
      oneTime: false,
      priceCents: baseCents + areaAddCents + yardAddCents,
      baseCents: baseCents,
      yardAddCents: yardAddCents,
      areaAddCents: areaAddCents,
      lineItems: lineItems
    });
  }

  // The plan fields of a state object, in the names calculateQuote expects.
  function planOf(state) {
    return { dogs: state.dogCount, frequencyId: state.frequency, yardSizeId: state.yardSize, areaIds: state.areas };
  }

  /* ----------------------------------------------------------------------
   * Reconciliation (spec 4.2.2 and section 15).
   * Runs after every dog-count or yard-size change and when saved progress is
   * restored. `previous` holds dogCount and yardSize BEFORE the change.
   * Returns { frequency, notice }. notice is null when nothing changed;
   * otherwise it explains the change in plain words so the interface can say
   * why (the live tool changes the selection silently: spec 13 items 6 and 7).
   *
   *   1. Nothing chosen: choose custom when dogs is 10+ or the yard is over
   *      1 acre; otherwise leave it empty.
   *   2. Custom chosen: keep it, EXCEPT when it was needed before this change
   *      (10+ dogs or over 1 acre) and is not needed any more. Then clear it so
   *      the visitor chooses again. The live tool leaves it stuck.
   *   3. Another frequency chosen and still allowed: keep it.
   *   4. No longer allowed: move to custom when dogs is 10+ or the yard is
   *      over 1 acre; otherwise clear it.
   * -------------------------------------------------------------------- */
  function reconcileFrequency(previous, current, frequencyLabels) {
    const labels = frequencyLabels || defaultFrequencyLabels();
    const frequency = current.frequency;
    const customNeededNow = isTenPlusDogs(current.dogCount) || current.yardSize === "over";
    const customNeededBefore = isTenPlusDogs(previous.dogCount) || previous.yardSize === "over";
    const becauseYard = current.yardSize === "over";
    const why = becauseYard ? "Yards over 1 acre need a custom quote" : "With 10 or more dogs we prepare a custom quote";
    // With 10+ dogs on a yard up to 1 acre a one-time cleanup is still open (spec 4.2.2).
    const oneTimeStillOpen = !becauseYard ? " A " + labels.onetime.toLowerCase() + " is still available." : "";

    function notice(code, message, next) {
      return { frequency: next, notice: { code: code, field: "frequency", goToStep: "frequency", previous: frequency, current: next, message: message } };
    }

    if (!findById(FREQUENCIES, frequency)) {
      if (customNeededNow) return notice("CUSTOM_AUTO_SELECTED", why + ", so " + labels.custom + " is selected for you." + oneTimeStillOpen, "custom");
      return { frequency: "", notice: null };
    }
    if (frequency === "custom") {
      if (customNeededBefore && !customNeededNow) {
        return notice("CUSTOM_RELEASED", "You no longer need a custom quote. Choose how often you would like service.", "");
      }
      return { frequency: "custom", notice: null };
    }
    const eligibility = frequencyEligibility(frequency, current.dogCount, current.yardSize, labels);
    if (eligibility.allowed) return { frequency: frequency, notice: null };
    if (customNeededNow) {
      return notice("FREQUENCY_MOVED_TO_CUSTOM", why + ", so we switched " + labels[frequency] + " to " + labels.custom + "." + oneTimeStillOpen, "custom");
    }
    const definition = findById(FREQUENCIES, frequency);
    return notice("FREQUENCY_CLEARED", labels[frequency] + " is available for up to " + definition.maxDogs + " dogs, so it was cleared. Choose how often you would like service.", "");
  }

  /* ======================================================================
   * 8. THE REQUEST FORM: FIELDS AND VALIDATION
   *    Spec 4.4, 12.2 and 12.3. These functions are pure: they take a state
   *    object and return plain data, so they can be tested against the
   *    Worker's own validation code.
   *
   *    Field keys used everywhere (errors, rules, server-error mapping):
   *      plan     dogCount, zip, yardSize, areas, frequency
   *      request  customerStatus, firstName, lastName, preferredContact, phone,
   *               email, smsConsent, address, city, startTiming, lastCleaned,
   *               question, termsAccepted, intent
   * ==================================================================== */

  // Which step of the flow owns each field. Lets an interface jump to the
  // right step when an error names a field.
  const FIELD_STEP = {
    dogCount: "dogs",
    zip: "zip",
    yardSize: "yard",
    areas: "areas",
    frequency: "frequency",
    intent: "price",
    customerStatus: "request",
    firstName: "request",
    lastName: "request",
    preferredContact: "request",
    phone: "request",
    email: "request",
    smsConsent: "request",
    address: "request",
    city: "request",
    startTiming: "request",
    lastCleaned: "request",
    question: "request",
    termsAccepted: "confirm"
  };

  // Input limits (spec 4.4). The Worker cuts longer values; the engine never lets them in.
  const FIELD_MAX_LENGTH = { firstName: 80, lastName: 80, email: 254, address: 120, city: 80, question: 1500 };

  // Messages are the live wording (spec 4.2.3 and 4.4).
  const MESSAGES = {
    customerStatus: "Choose whether you have used Purge Pros before.",
    firstName: "Enter your first name.",
    lastName: "Enter your last name.",
    preferredContact: "Choose how you would like us to reply.",
    callNotOffered: "Choose Text message or Email to receive your quote.",
    phone: "Enter a valid 10-digit phone number.",
    email: "Enter a valid email address.",
    address: "Enter the service street address.",
    city: "Enter the service city.",
    startTiming: "Choose when you would like to start.",
    lastCleaned: "Choose when the yard was last fully cleaned.",
    question: "Enter your question.",
    intent: "Choose what you would like to do next.",
    customNeedsServiceRequest: "A custom estimate starts with a request, so we can review the yard first.",
    // Shown when the server rejects something the visitor cannot fix in a field.
    stale: "Our prices or options changed while this page was open. Please reload the page and build your price again, or call (317) 961-5865."
  };

  function isValidIntent(intent) {
    return findById(INTENTS, intent) !== null;
  }

  // The stage the Worker expects for this intent and plan (spec 12.3).
  function stageFor(intent, quote) {
    if (intent === "question") return STAGES.question;
    if (intent === "quote_delivery") return STAGES.quote_delivery;
    return quote && quote.ok && quote.custom ? STAGES.service_request_custom : STAGES.service_request;
  }

  // Plan errors in the order the questions are asked: dogs, ZIP, yard, areas, frequency.
  // Each error is { field, step, code, message }.
  function planErrors(state, frequencyLabels) {
    const quote = calculateQuote(planOf(state), frequencyLabels);
    const quoteErrors = quote.ok ? [] : quote.errors;
    const errors = [];
    function take(field) {
      quoteErrors.forEach(function (error) {
        if (error.field === field) errors.push({ field: field, step: FIELD_STEP[field], code: error.code, message: error.message });
      });
    }
    take("dogCount");
    const zip = checkZip(state.zip);
    if (!zip.inArea) {
      errors.push({ field: "zip", step: "zip", code: zip.status === "out_of_area" ? "ZIP_OUT_OF_AREA" : "ZIP_REQUIRED", message: zip.message });
    }
    take("yardSize");
    take("areas");
    take("frequency");
    return errors;
  }

  // Request-form errors for one intent (spec 4.4). Each error is
  // { field, step, code, message, engineOnly }.
  // engineOnly marks the rules that are stricter than the Worker's:
  //   - a phone number for every service request, whatever the reply method
  //   - no Phone call for a quote delivery
  //   - customer status must be answered for a service request (asked after
  //     the price in this rebuild; the Worker would treat blank as not_sure)
  //   - a custom estimate can only be sent as a service request
  function detailsErrors(state, intent) {
    const errors = [];
    function add(field, code, message, engineOnly) {
      errors.push({ field: field, step: FIELD_STEP[field], code: code, message: message, engineOnly: engineOnly === true });
    }
    if (!isValidIntent(intent)) {
      add("intent", "INTENT_REQUIRED", MESSAGES.intent, false);
      return errors;
    }
    const service = intent === "service_request";
    const contact = state.preferredContact;
    const quote = calculateQuote(planOf(state));

    if (quote.ok && quote.custom && !service) add("intent", "CUSTOM_NEEDS_SERVICE_REQUEST", MESSAGES.customNeedsServiceRequest, true);

    if (state.customerStatus !== "" && !findById(CUSTOMER_STATUS_OPTIONS, state.customerStatus)) {
      add("customerStatus", "CUSTOMER_STATUS_INVALID", MESSAGES.customerStatus, false);
    } else if (service && state.customerStatus === "") {
      add("customerStatus", "CUSTOMER_STATUS_REQUIRED", MESSAGES.customerStatus, true);
    }

    if (!String(state.firstName).trim()) add("firstName", "FIRST_NAME_REQUIRED", MESSAGES.firstName, false);
    if (service && !String(state.lastName).trim()) add("lastName", "LAST_NAME_REQUIRED", MESSAGES.lastName, false);

    if (!findById(CONTACT_METHODS, contact)) add("preferredContact", "CONTACT_REQUIRED", MESSAGES.preferredContact, false);
    else if (intent === "quote_delivery" && contact === "call") add("preferredContact", "CALL_NOT_OFFERED", MESSAGES.callNotOffered, true);

    // Phone: required for a service request, for Text or Call, or when anything was typed.
    const phoneTyped = String(state.phone).trim() !== "";
    const phoneNeeded = service || contact === "text" || contact === "call" || phoneTyped;
    if (phoneNeeded && !normalizePhone(state.phone)) {
      // The Worker needs a phone only for Text or Call, and never sees a
      // number that failed this check, so with Email this rule is the engine's own.
      add("phone", "PHONE_INVALID", MESSAGES.phone, contact === "email");
    }

    // Email: required for Email, or when anything was typed.
    const emailTyped = String(state.email).trim() !== "";
    if ((contact === "email" || emailTyped) && !isValidEmail(state.email)) add("email", "EMAIL_INVALID", MESSAGES.email, false);

    // Text needs the consent box (spec 4.4.1). Never implied, never pre-ticked.
    if (contact === "text" && state.smsConsent !== true) {
      add("smsConsent", "CONSENT_REQUIRED", intent === "quote_delivery" ? CONSENT.errorWithoutCall : CONSENT.errorWithCall, false);
    }

    if (service && !String(state.address).trim()) add("address", "ADDRESS_REQUIRED", MESSAGES.address, false);
    if (service && !String(state.city).trim()) add("city", "CITY_REQUIRED", MESSAGES.city, false);
    if (service && START_TIMING_OPTIONS.indexOf(state.startTiming) < 0) add("startTiming", "START_TIMING_REQUIRED", MESSAGES.startTiming, false);

    // Last full cleanup is required for EVERY intent (spec 17.1 item 8).
    if (LAST_CLEANED_OPTIONS.indexOf(state.lastCleaned) < 0) add("lastCleaned", "LAST_CLEANED_REQUIRED", MESSAGES.lastCleaned, false);

    if (intent === "question" && String(state.question).trim().length < 5) add("question", "QUESTION_REQUIRED", MESSAGES.question, false);
    return errors;
  }

  // The terms box is required for a service request only (spec 4.5).
  function termsErrors(state, intent) {
    if (intent === "service_request" && state.termsAccepted !== true) {
      return [{ field: "termsAccepted", step: "confirm", code: "TERMS_REQUIRED", message: TERMS.error, engineOnly: false }];
    }
    return [];
  }

  function errorResult(errors) {
    const byField = {};
    errors.forEach(function (error) { if (!hasOwn(byField, error.field)) byField[error.field] = error.message; });
    return { ok: errors.length === 0, errors: errors, byField: byField };
  }

  /* ----------------------------------------------------------------------
   * Server-side validation errors (spec 4.5.2).
   * The Worker answers 400 with `fields`: its own names for what failed. The
   * live tool ignores that list, so nothing is highlighted (spec 13 item 12).
   * This table turns each Worker name into a field key and a message.
   * field: null means the visitor cannot fix it in a field (something is out
   * of date); it becomes a form-level message.
   * -------------------------------------------------------------------- */
  const SERVER_FIELD_MAP = {
    intent: { field: null, message: MESSAGES.stale },
    stage: { field: null, message: MESSAGES.stale },
    pricingVersion: { field: null, message: MESSAGES.stale },
    customEstimate: { field: null, message: MESSAGES.stale },
    clientPriceCents: { field: null, message: MESSAGES.stale },
    website: { field: null, message: MESSAGES.stale },
    zip: { field: "zip", message: "Check the service ZIP code." },
    dogs: { field: "dogCount", message: "Choose the number of dogs." },
    frequencyId: { field: "frequency", message: "Choose an available service frequency for this dog count." },
    yardSizeId: { field: "yardSize", message: "Choose the serviced yard size." },
    areaIds: { field: "areas", message: "Choose at least one service area." },
    preferredContact: { field: "preferredContact", message: MESSAGES.preferredContact },
    phone: { field: "phone", message: MESSAGES.phone },
    email: { field: "email", message: MESSAGES.email },
    smsTransactionalConsent: { field: "smsConsent", message: CONSENT.errorWithCall },
    consentVersion: { field: "smsConsent", message: CONSENT.errorWithCall },
    customerStatus: { field: "customerStatus", message: MESSAGES.customerStatus },
    firstName: { field: "firstName", message: MESSAGES.firstName },
    lastName: { field: "lastName", message: MESSAGES.lastName },
    street: { field: "address", message: MESSAGES.address },
    city: { field: "city", message: MESSAGES.city },
    startTiming: { field: "startTiming", message: MESSAGES.startTiming },
    lastCleaned: { field: "lastCleaned", message: MESSAGES.lastCleaned },
    question: { field: "question", message: MESSAGES.question },
    termsAccepted: { field: "termsAccepted", message: TERMS.error }
  };

  // mapServerFields(["phone", "street"]) ->
  //   { fieldErrors: [{ field: "phone", step: "request", message, serverField: "phone" }, ...],
  //     formErrors: [], unknown: [] }
  function mapServerFields(serverFields) {
    const fieldErrors = [];
    const formErrors = [];
    const unknown = [];
    const seenFields = {};
    (Array.isArray(serverFields) ? serverFields : []).forEach(function (name) {
      const entry = hasOwn(SERVER_FIELD_MAP, name) ? SERVER_FIELD_MAP[name] : null;
      if (!entry) {
        unknown.push(String(name));
        return;
      }
      if (entry.field === null) {
        if (formErrors.indexOf(entry.message) < 0) formErrors.push(entry.message);
        return;
      }
      if (seenFields[entry.field]) return;
      seenFields[entry.field] = true;
      fieldErrors.push({ field: entry.field, step: FIELD_STEP[entry.field], code: "SERVER_REJECTED", message: entry.message, serverField: name });
    });
    return { fieldErrors: fieldErrors, formErrors: formErrors, unknown: unknown };
  }

  /* ----------------------------------------------------------------------
   * Field rules: which request fields to show for an intent, which are
   * required, and their exact labels, hints and input attributes (spec 4.4).
   * The live tool marks almost nothing as required (spec 13 item 18); an
   * interface should mark every field where `required` is true.
   * The list is in a sensible form order; a design may order them differently.
   * -------------------------------------------------------------------- */
  function fieldRules(state, intent) {
    const service = intent === "service_request";
    const question = intent === "question";
    const contact = state.preferredContact;
    const quote = calculateQuote(planOf(state));
    const oneTime = quote.ok && !quote.custom && quote.oneTime === true;
    const allowCall = intent !== "quote_delivery";
    const rules = [
      {
        key: "customerStatus", shown: service, required: service, control: "choice",
        label: "Have you used Purge Pros before?",
        // Owner decision 2026-10-08 (POLICY-WORDING.md). Not the live widget's sentence any more.
        hint: "No start-up fee is for households new to Purge Pros, once per household. If you have had service before or are not sure, we check and confirm your first-visit price before anything is scheduled.",
        options: CUSTOMER_STATUS_OPTIONS
      },
      { key: "firstName", shown: true, required: true, control: "text", label: "First name", autocomplete: "given-name", maxLength: FIELD_MAX_LENGTH.firstName },
      { key: "lastName", shown: service, required: service, control: "text", label: "Last name", autocomplete: "family-name", maxLength: FIELD_MAX_LENGTH.lastName },
      {
        key: "preferredContact", shown: true, required: true, control: "choice", label: "Best way to reply",
        options: CONTACT_METHODS.filter(function (method) { return allowCall || method.id !== "call"; })
      },
      {
        key: "phone", shown: true, required: service || contact !== "email", control: "tel",
        label: "Phone number" + (!service && contact === "email" ? " (optional)" : ""),
        hint: service ? CONSENT.phoneHintService : CONSENT.phoneHintOther,
        // No maxLength (audit fix B1): formatPhone() caps the digits after the country code has gone.
        autocomplete: "tel", inputMode: "numeric", placeholder: "(317) 555-0123"
      },
      {
        key: "email", shown: true, required: contact === "email", control: "email",
        label: "Email" + (contact === "email" ? "" : " (optional)"),
        autocomplete: "email", maxLength: FIELD_MAX_LENGTH.email, placeholder: "you@example.com"
      },
      {
        // Shown ONLY while Text is the reply method. Never pre-ticked.
        key: "smsConsent", shown: contact === "text", required: contact === "text", control: "checkbox",
        lead: CONSENT.lead, body: CONSENT.body,
        alternative: allowCall ? CONSENT.alternativeWithCall : CONSENT.alternativeWithoutCall
      },
      { key: "address", shown: service, required: service, control: "text", label: "Service street address", autocomplete: "address-line1", maxLength: FIELD_MAX_LENGTH.address },
      { key: "city", shown: service, required: service, control: "text", label: "City", autocomplete: "address-level2", maxLength: FIELD_MAX_LENGTH.city },
      {
        // The ONE ZIP: coverage ZIP and service-address ZIP are the same value (spec section 14 item 7).
        key: "zip", shown: service, required: true, control: "zip", label: "Service ZIP code",
        autocomplete: "postal-code", inputMode: "numeric", maxLength: 5, placeholder: "e.g. 46032"
      },
      {
        key: "startTiming", shown: service, required: service, control: "choice", label: "When would you like to start?",
        emptyOptionLabel: "Choose timing", options: START_TIMING_OPTIONS
      },
      {
        key: "lastCleaned", shown: true, required: true, control: "choice", label: "When was the last full cleanup?",
        hint: "This helps us plan the first visit. It does not change the recurring maintenance quote.",
        emptyOptionLabel: "Choose an answer", options: LAST_CLEANED_OPTIONS
      },
      { key: "question", shown: question, required: question, control: "textarea", label: "Your question", maxLength: FIELD_MAX_LENGTH.question, placeholder: "What would you like to know?" },
      {
        // Service requests only. Unticked by default, cleared after any edit.
        key: "termsAccepted", shown: service, required: service, control: "checkbox",
        text: oneTime ? TERMS.oneTime : TERMS.recurring,
        otherwiseShow: service ? "" : TERMS.otherIntents
      }
    ];
    // Every choice field also carries `choices`: ONE shape whatever the raw
    // `options` look like ({ id, label } objects for customer status and the
    // reply method, plain strings for the two timing questions).
    //   { value, label, selected }   value is what to pass to set()
    rules.forEach(function (rule) {
      if (!rule.options) return;
      rule.choices = rule.options.map(function (option) {
        const value = typeof option === "string" ? option : option.id;
        return { value: value, label: typeof option === "string" ? option : option.label, selected: state[rule.key] === value };
      });
    });
    return rules;
  }

  /* ======================================================================
   * 9. THE PAYLOAD
   *    Spec 12.2. This is exactly what the Worker's validateV3 accepts.
   *    tests/contract.test.mjs pushes these payloads through the Worker's own
   *    validation code for every intent and reply method.
   * ==================================================================== */

  // PRIVACY (project decision of 2026-10-09 after the ads verification): a tag value that looks like somebody's
  // email address or phone number is DROPPED, as if the link had not carried that tag. It is never stored (session
  // or 30-day copy) and never sent. A bad link (a mail-merge mistake, a pasted address) is the only way one arrives.
  //   - email: an "@" with a dot somewhere after it;
  //   - phone: once spaces and the usual separators ( ) - . + _ / are removed, the WHOLE value is 7 to 15 digits.
  // The phone rule looks at the whole value on purpose: the tags the playbook uses carry long ids inside names
  // ("pp-leads-2026q4-1202...", "adgroup_1234567890"), and those must be kept.
  function looksPersonal(value) {
    const text = String(value);
    if (/@[^@]*\./.test(text)) return true;
    return /^\d{7,15}$/.test(text.replace(/[\s()\-.+_\/]/g, ""));
  }

  // Only the nine known keys, each a non-empty string of at most 250 characters,
  // and never a value that looks like an email address or a phone number.
  function cleanAttribution(value) {
    const clean = {};
    if (!value || typeof value !== "object") return clean;
    ATTRIBUTION_KEYS.forEach(function (key) {
      if (typeof value[key] === "string" && value[key] !== "" && !looksPersonal(value[key])) clean[key] = value[key].slice(0, ATTRIBUTION_VALUE_MAX);
    });
    return clean;
  }

  // Builds the payload from a state object. It does not validate; callers
  // validate first (store.buildPayload does). `context` carries everything
  // that is not plan or form state:
  //   { requestId, nowIso, nowMs, page, attribution, fbp, fbc, clickSeenMs }
  // clickSeenMs is set only when the attribution came from the 30-day copy
  // (T23): the moment that click was first seen in this browser.
  function payloadFromState(state, intent, context) {
    const quote = calculateQuote(planOf(state)); // live labels: the Worker rebuilds them anyway
    const priced = quote.ok && !quote.custom;
    const service = intent === "service_request";
    const stage = stageFor(intent, quote);
    const phone = normalizePhone(state.phone);
    const frequency = findById(FREQUENCIES, state.frequency);
    const yard = findById(YARD_SIZES, state.yardSize);
    const areas = Array.isArray(state.areas) ? state.areas : [];
    const attribution = cleanAttribution(context.attribution);

    // Consent evidence exists only when Text is the chosen reply method AND
    // the box is ticked (spec 4.4.1 and 17.2 item 4).
    const consentGiven = state.preferredContact === "text" && state.smsConsent === true;
    // Terms evidence exists only for a service request (spec 4.5).
    const termsGiven = service && state.termsAccepted === true;

    // The question travels only with the "question" intent. A quote delivery
    // carries the live widget's fixed sentence instead.
    let question = "";
    if (intent === "question") question = String(state.question).trim();
    if (intent === "quote_delivery") question = "Quote delivery requested by " + state.preferredContact + ".";

    return {
      schemaVersion: VERSIONS.schemaVersion,
      requestId: context.requestId,
      eventId: context.requestId + ":" + stage,
      stage: stage,
      intent: intent,
      zip: normalizeZip(state.zip),
      dogs: String(state.dogCount),
      frequency: frequency ? frequency.label : "",
      frequencyId: state.frequency,
      areas: areas.map(function (id) { const area = findById(AREAS, id); return area ? area.label : ""; }).join(" & "),
      areaIds: areas.slice(),
      yardSize: yard ? yard.label : "",
      yardSizeId: state.yardSize,
      lastCleaned: state.lastCleaned,
      // Asked after the price in this rebuild. Unanswered goes as the
      // placeholder "not_sure", which is what the Worker would assume anyway.
      customerStatus: state.customerStatus || "not_sure",
      // Fields a non-service intent does not collect are sent blank, which is
      // also what the Worker forwards for them.
      startTiming: service ? state.startTiming : "",
      perVisitPrice: priced ? formatDollars(quote.priceCents) : "",
      clientPriceCents: priced ? quote.priceCents : null,
      pricingVersion: VERSIONS.pricingVersion,
      customEstimate: quote.ok && quote.custom === true,
      customReasons: quote.ok && quote.custom ? quote.reasons.slice() : [],
      phone: phone ? phone.digits : "",
      phoneE164: phone ? phone.e164 : "",
      firstName: String(state.firstName).trim(),
      lastName: service ? String(state.lastName).trim() : "",
      email: String(state.email).trim().toLowerCase(),
      street: service ? String(state.address).trim() : "",
      city: service ? String(state.city).trim() : "",
      state: "IN",
      preferredContact: state.preferredContact,
      smsTransactionalConsent: consentGiven,
      consent: consentGiven ? "yes" : "no",
      consentVersion: consentGiven ? VERSIONS.consentVersion : "",
      smsConsentCapturedAt: consentGiven ? state.smsConsentCapturedAt || context.nowIso : "",
      termsAccepted: termsGiven,
      termsVersion: service ? VERSIONS.termsVersion : "",
      termsAcceptedAt: termsGiven ? state.termsAcceptedAt || context.nowIso : "",
      question: question,
      notes: service ? SERVICE_REQUEST_NOTES : "",
      page: String(context.page || "").slice(0, 1000),
      attribution: attribution,
      gclid: attribution.gclid || "",
      fbclid: attribution.fbclid || "",
      fbp: context.fbp || "",
      // Built from the click id only when the pixel's own _fbc cookie is
      // missing. Its time is when the click id was first seen: now for a
      // click of this session (as in the live tool), the capture moment for
      // one brought back from the 30-day copy, so an old click is never
      // dressed up as a new one.
      fbc: context.fbc || (attribution.fbclid ? "fb.1." + (context.clickSeenMs || context.nowMs) + "." + attribution.fbclid : ""),
      submittedAt: context.nowIso,
      // A trap for bots. Never shown to people, always empty (spec 17.1 item 12).
      website: ""
    };
  }

  // The fields that make two attempts "the same request" (spec 12.4). Not
  // timestamps, cookies or attribution. Same list as the live widget.
  const FINGERPRINT_FIELDS = [
    "schemaVersion", "stage", "intent", "zip", "dogs", "frequencyId",
    "areaIds", "yardSizeId", "lastCleaned", "customerStatus", "startTiming",
    "clientPriceCents", "pricingVersion", "customEstimate", "customReasons",
    "phone", "firstName", "lastName", "email", "street", "city", "state",
    "preferredContact", "smsTransactionalConsent", "consentVersion",
    "termsAccepted", "termsVersion", "question", "notes"
  ];

  function submissionFingerprint(payload) {
    return JSON.stringify(FINGERPRINT_FIELDS.map(function (field) {
      const value = payload[field];
      return (field === "areaIds" || field === "customReasons") && Array.isArray(value) ? value.slice().sort() : value;
    }));
  }

  // The save-link body: exactly six keys, nothing personal (spec 8.1).
  // customerStatus is asked after the price in this rebuild, so when it is
  // unanswered the placeholder "not_sure" is sent (spec section 14 item 1).
  function saveLinkBody(state) {
    return {
      zip: state.zip,
      dogs: Number(state.dogCount),
      frequencyId: state.frequency,
      yardSizeId: state.yardSize,
      areaIds: state.areas.slice().sort(),
      customerStatus: state.customerStatus || "not_sure"
    };
  }

  /* ======================================================================
   * 10. ENVIRONMENT
   *     The ONLY place this file touches the browser. Storage, network,
   *     clock, ids, cookies and tracking tags are all injectable through
   *     create(options); the tests replace every one of them.
   * ==================================================================== */

  // Used when sessionStorage is missing or blocked. Lives for the page only.
  function memoryStorage() {
    const items = {};
    return {
      getItem: function (key) { return hasOwn(items, key) ? items[key] : null; },
      setItem: function (key, value) { items[key] = String(value); },
      removeItem: function (key) { delete items[key]; }
    };
  }

  function browserEnvironment() {
    const win = typeof window !== "undefined" ? window : null;
    const doc = typeof document !== "undefined" ? document : null;
    const webCrypto = typeof crypto !== "undefined" ? crypto : null;

    let storage = null;
    try { storage = win && win.sessionStorage ? win.sessionStorage : null; } catch (_) { storage = null; }
    // The browser's longer-lived storage, used for ONE key only: the 30-day
    // copy of the attribution parameters (T23). Missing or blocked: that copy
    // is simply not kept, and nothing else changes.
    let keptStorage = null;
    try { keptStorage = win && win.localStorage ? win.localStorage : null; } catch (_) { keptStorage = null; }

    return {
      location: win ? win.location : null,
      history: win ? win.history : null,
      // How this page load began: "navigate", "reload", "back_forward", or ""
      // when the browser does not say. Used for one thing only: a ?zip= left
      // in the address must not be applied again by a refresh.
      navigationType: function () {
        try {
          const timing = win && win.performance && typeof win.performance.getEntriesByType === "function" ? win.performance.getEntriesByType("navigation") : null;
          return timing && timing[0] && typeof timing[0].type === "string" ? timing[0].type : "";
        } catch (_) { return ""; }
      },
      storage: storage || memoryStorage(),
      persistentStorage: keptStorage,
      fetch: win && typeof win.fetch === "function" ? function (url, init) { return win.fetch(url, init); } : null,
      now: function () { return Date.now(); },
      random: Math.random,
      // Request ids (spec 12.2): a UUID, with the live widget's fallback.
      uuid: function () {
        if (webCrypto && typeof webCrypto.randomUUID === "function") return webCrypto.randomUUID();
        return "pp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
      },
      // Cookies are only READ (_fbp and _fbc at submit time). None are written.
      readCookie: function (name) {
        if (!doc) return "";
        let match = null;
        try { match = String(doc.cookie || "").match(new RegExp("(?:^|; )" + name + "=([^;]*)")); } catch (_) { match = null; }
        if (!match) return "";
        try { return decodeURIComponent(match[1]); } catch (_) { return match[1]; }
      },
      // Tags are looked up at the moment of each event, because they may load
      // after this file does.
      getGtag: function () { return win && typeof win.gtag === "function" ? win.gtag : null; },
      getDataLayer: function () { return win && Array.isArray(win.dataLayer) ? win.dataLayer : null; },
      getFbq: function () { return win && typeof win.fbq === "function" ? win.fbq : null; },
      // In a browser, demo activity is written to the console. In Node (tests) it is silent.
      console: win && typeof console !== "undefined" ? console : null,
      wait: function (milliseconds) { return new Promise(function (resolve) { setTimeout(resolve, milliseconds); }); },
      setTimeout: function (callback, milliseconds) { return setTimeout(callback, milliseconds); },
      clearTimeout: function (handle) { clearTimeout(handle); },
      AbortController: typeof AbortController !== "undefined" ? AbortController : null
    };
  }

  // options may replace: storage, persistentStorage, fetch, now, uuid, random,
  // readCookie, location, history, navigationType, console, wait, and
  // sinks { gtag, dataLayer, fbq }.
  function resolveEnvironment(options) {
    const env = browserEnvironment();
    ["storage", "persistentStorage", "fetch", "now", "uuid", "random", "readCookie", "location", "history", "navigationType", "console", "wait", "setTimeout", "clearTimeout", "AbortController"].forEach(function (key) {
      if (hasOwn(options, key)) env[key] = options[key];
    });
    if (options.sinks) {
      const sinks = options.sinks;
      env.getGtag = function () { return typeof sinks.gtag === "function" ? sinks.gtag : null; };
      env.getDataLayer = function () { return Array.isArray(sinks.dataLayer) ? sinks.dataLayer : null; };
      env.getFbq = function () { return typeof sinks.fbq === "function" ? sinks.fbq : null; };
    }
    if (!env.storage) env.storage = memoryStorage();
    // No stand-in for the longer-lived storage: without it nothing is kept.
    const kept = env.persistentStorage;
    if (!kept || typeof kept.getItem !== "function" || typeof kept.setItem !== "function" || typeof kept.removeItem !== "function") env.persistentStorage = null;
    return env;
  }

  // Reads a property of the injected location without ever throwing.
  function locationPart(env, key) {
    try { return env.location && typeof env.location[key] === "string" ? env.location[key] : ""; } catch (_) { return ""; }
  }

  function queryParam(env, name) {
    const search = locationPart(env, "search");
    if (!search) return null;
    try { return new URLSearchParams(search).get(name); } catch (_) { return null; }
  }

  // Does this address ask for the builder to open (spec 2.3)?
  // ?open_quote=1 (also true, yes), or the hash #quote or #get-quote.
  function addressAsksToOpen(search, hash) {
    let queryValue = "";
    try { queryValue = String(new URLSearchParams(search || "").get("open_quote") || "").trim().toLowerCase(); } catch (_) { queryValue = ""; }
    const hashValue = String(hash || "").toLowerCase();
    return {
      query: queryValue === "1" || queryValue === "true" || queryValue === "yes",
      hash: hashValue === "#quote" || hashValue === "#get-quote"
    };
  }

  /* ======================================================================
   * 11. DEMO SWITCHES AND FIXED REPLIES
   *     Demo mode never touches the network. It can play back every reply
   *     the spec lists so each interface state can be built and tested.
   *     The wording of the server replies is the Worker's (spec 4.5.2, 8.1).
   * ==================================================================== */

  const DEMO_SUBMIT_OUTCOMES = ["success", "slow", "invalid", "uncertain", "conflict", "unavailable", "timeout", "network", "forbidden"];
  const DEMO_SAVE_OUTCOMES = ["success", "rate_limited", "unavailable", "invalid", "timeout", "bad_link"];
  const DEMO_RESUME_OUTCOMES = ["success", "changed", "expired", "plan_unavailable", "mismatch", "timeout", "rate_limited", "unavailable"];

  const SUBMIT_MESSAGES = {
    uncertain: "Your request may already be with our team. Please call (317) 961-5865 to confirm before submitting again. Your reference is {requestId}. Nothing has been scheduled or charged by this form.",
    conflict: "We could not safely submit the changed details. Please call (317) 961-5865 and mention reference {requestId}.",
    lockedFallback: "Please call Purge Pros to confirm your request before submitting again.",
    unavailable: "We could not connect to save your request. Please try again or call (317) 961-5865.",
    invalid: "Please check the highlighted form details.",
    timeout: "This is taking longer than expected. Please try again or call (317) 961-5865.",
    network: "We could not send this request. Please try again or call (317) 961-5865.",
    rejected: "We could not save your request. Please try again.",
    blockedLive: "This page cannot send requests. Please call (317) 961-5865.",
    blockedDemo: "This is a preview. Nothing can be sent from here. Please call (317) 961-5865.",
    sending: "Sending your request. Please wait a moment before closing."
  };

  const SAVE_LINK_MESSAGES = {
    idle: "No contact details needed. Nothing is sent to our team.",
    working: "Creating your plan link…",
    created: "Your link is ready.",
    copied: "Link copied. Save it somewhere you can find it; it expires after 7 days.",
    copyManually: "Your link is ready. Select and copy the link above to save it for 7 days.",
    timeout: "Creating the link took too long. You can try again or continue with your quote.",
    rateLimited: "Too many save-link attempts. Please try again later; you can still build a quote.",
    unavailable: "Save links are temporarily unavailable. You can continue with your quote.",
    rejected: "This saved plan could not be opened. Please build a new quote.",
    badLink: "We could not create a valid save link.",
    fallback: "The save link is unavailable. Please try again later or build a new quote.",
    notReady: "Finish your plan to create a save link.",
    blocked: "Save links are unavailable on this page."
  };

  const RESUME_MESSAGES = {
    loadingTitle: "Opening your saved plan…",
    loadingDetail: "Checking today’s coverage and prices.",
    ready: "Your saved plan is ready. Review today's price and first-cleanup terms before continuing. Contact details and permissions have not been restored.",
    pricingChanged: "Pricing has changed since you saved this plan. We have recalculated it using today's prices. Review the current price and first-cleanup terms before continuing.",
    invalidToken: "This save link is invalid. Please build a new quote.",
    expired: "This save link has expired or is unavailable. Please build a new quote.",
    planUnavailable: "Coverage or plan options have changed. Please build a new quote with the current options.",
    localCheckFailed: "The saved plan is no longer available. Please build a new quote.",
    priceMismatch: "The available prices or plan options changed. Reload this page to build a quote with the current options.",
    timeout: "The saved plan took too long to load. Reopen your saved link to try again, or build a new quote.",
    fallback: "This save link is unavailable. Please build a new quote."
  };

  // The plan a demo resume returns for a link this page did not create itself.
  const DEMO_RESUME_PLAN = { zip: "46032", dogs: 2, frequencyId: "weekly", yardSizeId: "m", areaIds: ["back", "front"], customerStatus: "not_sure" };

  /* ======================================================================
   * 12. TRACKING NAMES
   *     Spec section 10. The engine builds and sends every event itself, at
   *     the right moment and at most as often as the rules allow. An
   *     interface may fire the two pop-up events the engine cannot see
   *     (store.track), and may REPORT six moments only a page can see
   *     (store.trackUi): the engine then builds the event from fixed lists.
   *
   *     The ONLY conversion is a completed service request (Lead,
   *     generate_lead and the Google Ads conversion). Everything else here
   *     is measurement.
   * ==================================================================== */

  // The fixed lists the funnel and contact events are held to (T16 to T22).
  // Every value an event of this section carries comes from one of these, from
  // an option list of section 2, or is a count the engine made. Nothing a
  // visitor typed can be one of them.
  const FIELD_KEYS = Object.keys(FIELD_STEP); // the request's field KEYS, in form order (never a value)
  const REQUEST_SUB_STEPS = ["who", "reach", "where"]; // the screens an interface may split the request step into
  const BUILDER_ENTRIES = ["hero_card", "header_button", "menu_button", "page_button", "plan_button", "pinned_bar", "summary_card", "link", "saved_link"];
  const CONTACT_CLICK_METHODS = ["text", "call", "email"]; // text first, everywhere
  const CONTACT_PLACEMENTS = ["header", "menu", "hero", "section", "closing", "footer", "builder"];
  const QUOTE_SEND_METHODS = ["text", "email"]; // the two ways a quote can be sent to the visitor
  // The longest "fields" value sent (whole keys only; error_count has the full number).
  const FIELD_LIST_MAX = 100;
  // The same contact link pressed again within this time is one press.
  const CONTACT_CLICK_REPEAT_MS = 1000;

  const EVENTS = {
    // Built and sent by the engine (the names sent to Google). store.track()
    // refuses every one of them. Six wait for the interface to report the
    // moment through store.trackUi(): see trackUi below.
    engine: [
      "funnel_viewed", "service_area_eligible", "service_area_ineligible", "funnel_step_viewed",
      "dog_count_selected", "yard_size_selected", "areas_selected", "frequency_selected", "price_viewed",
      "price_choice_selected", "quote_link_saved",
      "request_step_viewed", "request_step_completed", "form_validation_failed",
      "builder_opened", "builder_closed", "contact_click",
      "service_requested", "estimate_requested", "quote_requested", "question_submitted",
      "generate_lead", "conversion"
    ],
    // Fired by the interface through store.track(name, params).
    ui: ["yard_size_help_opened", "promotion_details_viewed"],
    // The ONLY parameter names an interface may send with each of its events.
    // Anything else passed to store.track() is dropped before it reaches a tag.
    uiParams: { yard_size_help_opened: [], promotion_details_viewed: ["promotion"] },
    // The moments an interface REPORTS through store.trackUi(name, params).
    // The engine decides whether each counts, builds the event and adds what
    // it knows itself (the step, the way forward).
    trackUi: ["builder_opened", "builder_closed", "request_step_viewed", "request_step_completed", "form_validation_failed", "contact_click"],
    // The ONLY parameter names an interface may pass with each of them, and
    // the fixed list each value must come from. Anything else is dropped,
    // and only the number dropped is logged.
    trackUiParams: {
      builder_opened: ["entry", "plan"],
      builder_closed: [],
      request_step_viewed: ["request_step"],
      request_step_completed: ["request_step"],
      form_validation_failed: ["request_step", "fields"],
      contact_click: ["method", "placement"]
    },
    trackUiValues: {
      entry: BUILDER_ENTRIES,
      plan: FREQUENCIES.map(function (frequency) { return frequency.id; }), // with entry "plan_button" only
      request_step: REQUEST_SUB_STEPS,
      fields: FIELD_KEYS, // one or more of these KEYS; never what was typed
      method: CONTACT_CLICK_METHODS,
      placement: CONTACT_PLACEMENTS
    },
    // Meta pixel CUSTOM events that are plain counts, fired by the engine each
    // time the thing happens. They are not among the five once-per-page-load
    // milestones and they are never a conversion (T13 and T14 below).
    pixelCounts: ["QuoteSent", "QuoteLinkSaved"],
    // The one Meta STANDARD event besides Lead: "Contact", sent with no
    // parameter at all the first time a contact link is pressed on a page
    // load (T22). It is not a conversion and must not be optimised for.
    pixelStandard: ["Contact"],
    // Every measurement event added since 2026-10-09 (T13 to T22 in
    // CORE-API.md) and the ONLY parameter names each may carry.
    // ui_version is added to every one except Contact, which carries nothing.
    // Anything else is dropped before it reaches a tag or the log, and so is
    // any value that is not of the one fixed kind isAllowedMeasurementValue
    // accepts for its parameter.
    measurementParams: {
      price_choice_selected: ["choice"],
      quote_link_saved: [],
      QuoteLinkSaved: [],
      QuoteSent: ["frequency", "value", "currency", "method"],
      areas_selected: ["areas_count"],
      frequency_selected: ["frequency"],
      request_step_viewed: ["request_step", "choice"],
      request_step_completed: ["request_step", "choice"],
      form_validation_failed: ["form_step", "request_step", "fields", "error_count", "checked_by"],
      builder_opened: ["entry", "plan", "step"],
      builder_closed: ["step", "request_step"],
      contact_click: ["method", "placement"],
      Contact: []
    }
  };

  // Turns field keys into the value sent as "fields": the known KEYS only, in
  // form order, each once, joined by commas. Anything that is not exactly a
  // field key (so anything a visitor typed) is left out.
  // -> { text, count, keys }: keys is every known key and count their number;
  // text holds whole keys up to FIELD_LIST_MAX characters.
  function fieldKeyList(value) {
    const given = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
    const known = FIELD_KEYS.filter(function (key) {
      return given.some(function (entry) { return typeof entry === "string" && entry.trim() === key; });
    });
    let text = "";
    let full = false;
    known.forEach(function (key) {
      const longer = text ? text + "," + key : key;
      if (!full && longer.length <= FIELD_LIST_MAX) text = longer;
      else full = true;
    });
    return { text: text, count: known.length, keys: known };
  }

  // What a parameter of a measurement event may hold: an option id from a
  // fixed list, a field KEY, a count, the per-visit price that was sent with
  // the request, or "USD". Nothing a visitor typed can pass, whatever the
  // parameter is called.
  function isAllowedMeasurementValue(name, key, value) {
    if (key === "choice") return isValidIntent(value);
    if (key === "frequency" || key === "plan") return findById(FREQUENCIES, value) !== null;
    if (key === "value") return typeof value === "number" && Number.isFinite(value) && value >= 0;
    if (key === "currency") return value === "USD";
    if (key === "method") return (name === "contact_click" ? CONTACT_CLICK_METHODS : QUOTE_SEND_METHODS).indexOf(value) >= 0;
    if (key === "placement") return CONTACT_PLACEMENTS.indexOf(value) >= 0;
    if (key === "entry") return BUILDER_ENTRIES.indexOf(value) >= 0;
    if (key === "step") return STEPS.indexOf(value) >= 0;
    if (key === "form_step") return value === "request" || value === "confirm";
    if (key === "request_step") return REQUEST_SUB_STEPS.indexOf(value) >= 0;
    if (key === "areas_count") return Number.isInteger(value) && value >= 1 && value <= AREAS.length;
    if (key === "error_count") return Number.isInteger(value) && value >= 1 && value <= FIELD_KEYS.length;
    if (key === "checked_by") return value === "form" || value === "server";
    if (key === "fields") return typeof value === "string" && value !== "" && value.length <= FIELD_LIST_MAX && fieldKeyList(value).text === value;
    return false;
  }

  // The longest value an interface may send in one of its own event parameters.
  const UI_EVENT_VALUE_MAX = 100;

  // The five Meta pixel milestones, each at most once per page load (spec 10.2).
  const PIXEL_MILESTONES = ["QuoteZipAccepted", "QuoteZipOutOfArea", "QuotePriceViewed", "QuoteDetailsViewed", "QuoteReviewViewed"];

  // TRACKING CHANGE APPROVED BY THE OWNER 2026-10-09 (T7): funnel_step_viewed keeps
  // the LIVE step numbers by meaning, so existing reports and the pixel
  // milestones stay continuous (spec section 14 item 10):
  // 3 = price, 4 = request form (live "Details"), 5 = confirm (live "Review"), 6 = done.
  // The live steps 1 (Area) and 2 (Plan) have no single counterpart: the five
  // plan questions send no step number.
  const LEGACY_STEP_NUMBER = { price: 3, request: 4, confirm: 5, done: 6 };

  // Never allowed into any analytics event (spec 17.2 item 12).
  const FORBIDDEN_EVENT_PARAMS = ["zip", "firstName", "lastName", "name", "phone", "email", "address", "street", "city", "question"];

  /* ======================================================================
   * 13. THE STORE
   *     create(options) returns one store: the state, the rules that keep it
   *     valid, and every question an interface needs answered. Create ONE
   *     store per page and share it between the hero builder, the pinned bar
   *     and any other piece (or use PPQuoteCore.shared()).
   * ==================================================================== */

  function create(options) {
    const settings = options || {};
    const env = resolveEnvironment(settings);

    /* ---- configuration ------------------------------------------------ */

    // DEMO is the default. LIVE and STAGING must be asked for and pass a guard below.
    //   live     real requests to the production Worker; real tags.
    //   staging  real requests to a STAGING Worker only (never a production
    //            address); no Google or Meta call of any kind, whatever the
    //            other options say: the events are written to the log only.
    const mode = settings.mode === "live" ? "live" : settings.mode === "staging" ? "staging" : "demo";
    const sends = mode !== "demo"; // live and staging make requests; demo never does
    const endpoint = typeof settings.endpoint === "string" ? settings.endpoint : "";
    const uiVersion = typeof settings.uiVersion === "string" && settings.uiVersion ? settings.uiVersion : VERSIONS.uiVersion;
    const googleAdsSendTo = hasOwn(settings, "googleAdsSendTo") ? String(settings.googleAdsSendTo || "") : LIVE_GOOGLE_ADS_SEND_TO;
    const firePixelEvents = settings.firePixelEvents !== false;
    const allowedOrigins = Array.isArray(settings.allowedOrigins) ? settings.allowedOrigins.slice() : LIVE_ALLOWED_ORIGINS.slice();

    // Words shown for the five frequencies. Ids never change.
    const labels = defaultFrequencyLabels();
    if (settings.frequencyLabels && typeof settings.frequencyLabels === "object") {
      Object.keys(labels).forEach(function (id) {
        if (typeof settings.frequencyLabels[id] === "string" && settings.frequencyLabels[id]) labels[id] = settings.frequencyLabels[id];
      });
    }

    // A ZIP supplied by the page itself (a city page with one accepted ZIP).
    const pageZip = normalizeZip(settings.pageZip);
    // The city a city page is about; preferred when it is right for the ZIP.
    const pageCity = typeof settings.pageCity === "string" ? settings.pageCity.trim() : "";

    // Demo switches: options first, then the query string (demo mode only).
    const demo = { submit: "success", save: "success", resume: "success", delayMs: 900, invalidFields: ["phone"] };
    function applyDemoSwitches(source) {
      if (!source || typeof source !== "object") return;
      if (DEMO_SUBMIT_OUTCOMES.indexOf(source.submit) >= 0) demo.submit = source.submit;
      if (DEMO_SAVE_OUTCOMES.indexOf(source.save) >= 0) demo.save = source.save;
      if (DEMO_RESUME_OUTCOMES.indexOf(source.resume) >= 0) demo.resume = source.resume;
      const delayGiven = typeof source.delayMs === "number" || (typeof source.delayMs === "string" && source.delayMs !== "");
      if (delayGiven && Number.isFinite(Number(source.delayMs)) && Number(source.delayMs) >= 0) demo.delayMs = Number(source.delayMs);
      if (Array.isArray(source.invalidFields) && source.invalidFields.length) demo.invalidFields = source.invalidFields.map(String);
    }
    applyDemoSwitches(settings.demo);
    if (mode === "demo") {
      const fieldsParam = queryParam(env, "pp_demo_fields");
      applyDemoSwitches({
        submit: queryParam(env, "pp_demo") || queryParam(env, "pp_demo_submit"),
        save: queryParam(env, "pp_demo_save"),
        resume: queryParam(env, "pp_demo_resume"),
        delayMs: queryParam(env, "pp_demo_delay"),
        invalidFields: fieldsParam ? fieldsParam.split(",").map(function (name) { return name.trim(); }).filter(Boolean) : null
      });
    }

    /* ---- safety guards for sending ------------------------------------ */

    // LIVE mode refuses to run from file://, from any non-https page, and
    // from any origin the Worker would reject (spec 12.1 and section 1 item 10).
    // STAGING mode has the same guard, and one more: it refuses a production
    // request address, so a test can never reach the production intake.
    // Returns "" when sending is allowed, otherwise the reason.
    function liveBlockedReason() {
      if (!sends) return "Not in live mode.";
      const label = mode === "staging" ? "Staging mode" : "Live mode";
      if (!/^https:\/\/[^/]+\/submit$/.test(endpoint)) return label + " needs an https endpoint ending in /submit.";
      // FIX 2026-10-10 (VERIFY-sending finding 1): a staging address must be a plain
      // host name and nothing else. A port, a user name, a trailing dot, an encoded
      // character or a backslash is another spelling a browser may resolve to a
      // production host ("host:443", "host."), so each is refused outright.
      if (mode === "staging" && !/^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?\/submit$/i.test(endpoint)) return "Staging mode needs a plain https host name (no port, user name or trailing dot) ending in /submit.";
      if (mode === "staging" && isProductionEndpoint(endpoint)) return "Staging mode refuses a production endpoint.";
      if (!env.fetch) return "No fetch function is available.";
      const protocol = locationPart(env, "protocol");
      const origin = locationPart(env, "origin");
      if (protocol !== "https:") return label + " refuses to run from " + (protocol || "an unknown page") + ".";
      const endpointOrigin = endpoint.replace(/\/submit$/, "");
      if (origin !== endpointOrigin && allowedOrigins.indexOf(origin) < 0) return label + " refuses to run from " + origin + ".";
      return "";
    }

    // Is this request address a production one? By host: the addresses the
    // interface names (productionEndpoints, through siteOptions) and the
    // production hosts this file already knows (the quote host and the
    // accepted page origins).
    // The host alone, the way a browser would resolve it: lower case, without a
    // user name, a port or trailing dots (so "host:443" and "host." are "host").
    function hostOf(address) {
      return String(address || "").trim().toLowerCase().replace(/^https:\/\//, "").replace(/[\/\\?#].*$/, "").replace(/^.*@/, "").replace(/:\d*$/, "").replace(/\.+$/, "");
    }
    function isProductionEndpoint(address) {
      const known = (Array.isArray(settings.productionEndpoints) ? settings.productionEndpoints : []).concat(LIVE_ALLOWED_ORIGINS, ["https://quote.itspurgepros.com"]);
      const host = hostOf(address);
      return known.some(function (entry) { return hostOf(entry) === host; });
    }

    // The guard of the mode in hand: live and staging above, demo below.
    function sendBlockedReason() {
      return sends ? liveBlockedReason() : demoBlockedReason();
    }

    // STAGING ONLY: the staging page's own address may be the base of a saved
    // link ("<base>#resume=<token>", what a staging Worker answers when its
    // SAVED_LINK_BASE is set), so making and opening a link can be tested
    // there. The base must be a plain https address on an origin this page
    // may send from. Live and demo accept the one production form only.
    const stagingLinkPrefix = (function () {
      if (mode !== "staging" || typeof settings.savedLinkBase !== "string" || !settings.savedLinkBase.trim() || typeof URL !== "function") return "";
      let base = null;
      try { base = new URL(settings.savedLinkBase.trim()); } catch (_) { return ""; }
      if (base.protocol !== "https:" || base.username || base.password || allowedOrigins.indexOf(base.origin) < 0) return "";
      base.hash = "";
      base.search = "";
      return base.href + "#resume=";
    })();
    function isSaveLink(url) {
      if (SAVE_LINK_PATTERN.test(url)) return true;
      return stagingLinkPrefix !== "" && url.slice(0, stagingLinkPrefix.length) === stagingLinkPrefix && RESUME_TOKEN_PATTERN.test(url.slice(stagingLinkPrefix.length));
    }

    // A demo build must never show a pretend success to a real customer. If a
    // page in demo mode is opened on a real Purge Pros origin, submit refuses.
    function demoBlockedReason() {
      if (mode !== "demo" || settings.allowDemoOnLiveOrigin === true) return "";
      const origin = locationPart(env, "origin");
      const hostname = locationPart(env, "hostname");
      if (LIVE_ALLOWED_ORIGINS.indexOf(origin) >= 0 || hostname === "quote.itspurgepros.com") return "Demo mode refuses to run on " + origin + ".";
      return "";
    }

    /* ---- state --------------------------------------------------------- */

    function freshState() {
      return {
        // where the visitor is in the flow
        step: "dogs",
        editReturn: "", // the step to return to after a one-tap edit
        // the plan
        zip: "",
        zipSource: "", // "", "typed", "open", "url", "page", "storage", "resume"
        dogCount: "",
        yardSize: "",
        areas: [],
        frequency: "",
        // the request (memory only; never stored)
        intent: "service_request",
        customerStatus: "",
        firstName: "",
        lastName: "",
        phone: "",
        email: "",
        preferredContact: "text",
        smsConsent: false,
        smsConsentCapturedAt: "",
        address: "",
        city: "",
        cityAutoFilled: false, // true while the city is the engine's suggestion for the ZIP
        startTiming: "",
        lastCleaned: "",
        question: "",
        termsAccepted: false,
        termsAcceptedAt: "",
        // status
        submitting: false,
        locked: null, // { code, message, requestId } after an "uncertain" or "conflict" reply
        receipt: null, // set after a successful submit
        resumeLoading: false,
        resumeNotice: "",
        attribution: {}
      };
    }

    let state = freshState();
    let cachedSnapshot = null;
    const listeners = [];

    // Memory only. A reload starts a new request (spec 9.3).
    let pendingSubmission = null; // { fingerprint, payload }
    let savedLink = null; // { fingerprint, url, expiresAt }
    const demoSavedPlans = {}; // token -> plan, for links this page created in demo mode
    let resumeSequence = 0;

    // Inspectable logs (never stored anywhere else).
    const trackLog = [];
    const submissionLog = [];
    const networkLog = [];
    const initialNotices = [];

    function nowIso() {
      return new Date(env.now()).toISOString();
    }

    function log(kind, text, detail) {
      if (!env.console) return;
      try {
        if (kind === "warn" && typeof env.console.warn === "function") env.console.warn(text, detail === undefined ? "" : detail);
        else if (typeof env.console.info === "function") env.console.info(text, detail === undefined ? "" : detail);
      } catch (_) { /* a console must never break the form */ }
    }

    // A frozen copy. The same object is returned until something changes, so
    // an interface can compare snapshots cheaply.
    function getState() {
      if (!cachedSnapshot) {
        const copy = Object.assign({}, state);
        copy.areas = state.areas.slice();
        copy.attribution = Object.assign({}, state.attribution);
        copy.locked = state.locked ? Object.assign({}, state.locked) : null;
        copy.receipt = state.receipt ? Object.assign({}, state.receipt) : null;
        cachedSnapshot = deepFreeze(copy);
      }
      return cachedSnapshot;
    }

    function subscribe(listener) {
      if (typeof listener !== "function") return function () {};
      listeners.push(listener);
      return function unsubscribe() {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    }

    // Drops the cached snapshot and tells the listeners.
    // info = { reason, changed, notices, movedTo }
    function notify(info) {
      cachedSnapshot = null;
      const snapshot = getState();
      listeners.slice().forEach(function (listener) {
        try { listener(snapshot, info || {}); } catch (error) { log("warn", "[PPQuoteCore] a subscriber threw", error); }
      });
    }

    // A copy of the state to compare against after a change.
    function stateBefore() {
      return Object.assign({}, state, { areas: state.areas.slice() });
    }

    function sameField(a, b) {
      if (Array.isArray(a) && Array.isArray(b)) return a.join("|") === b.join("|");
      if (a && b && typeof a === "object" && typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
      return a === b;
    }

    // The names of EVERY state field whose value differs from `before`: the
    // answers first, in the order set() accepts them, then the rest.
    function changedSince(before) {
      const names = CHANGE_ORDER.concat(Object.keys(state).filter(function (field) { return CHANGE_ORDER.indexOf(field) < 0; }));
      return names.filter(function (field) { return hasOwn(state, field) && !sameField(before[field], state[field]); });
    }

    // EVERY change to the state ends here, whatever caused it: one call to the
    // subscribers per change, naming exactly the fields that are different and
    // carrying every notice. When nothing is different nobody is called.
    // Returns the list of changed fields.
    function commit(reason, before, notices, movedTo) {
      const changed = changedSince(before);
      // Something is different, so the next refused press is a new attempt (T20).
      if (changed.length) lastValidationReported = "";
      if (changed.length) notify({ reason: reason, changed: changed, notices: notices || [], movedTo: movedTo || null });
      return changed;
    }

    /* ---- storage: plan progress (spec 9.1) ---------------------------- */

    // The ZIP is stored only when it is accepted AND it is the visitor's own
    // answer. A ZIP that a city page supplied is not the visitor's answer, so
    // it does not follow them to other pages.
    function zipToStore() {
      return checkZip(state.zip).inArea && state.zipSource !== "page" ? state.zip : "";
    }

    // Writes EXACTLY the seven permitted keys. Never name, phone, email,
    // address, question, consent, terms acceptance or request ids.
    function saveProgress() {
      const safe = {
        zip: zipToStore(),
        dogCount: state.dogCount,
        frequency: state.frequency,
        areas: state.areas.slice(),
        yardSize: state.yardSize,
        lastCleaned: state.lastCleaned,
        customerStatus: state.customerStatus
      };
      try { env.storage.setItem(STORAGE_KEYS.progress, JSON.stringify(safe)); } catch (_) { /* storage may be full or blocked */ }
    }

    function clearProgress() {
      try { env.storage.removeItem(STORAGE_KEYS.progress); } catch (_) { /* ignore */ }
    }

    // Reads saved progress and keeps only values that are still valid today.
    function readProgress() {
      let saved = null;
      try { saved = JSON.parse(env.storage.getItem(STORAGE_KEYS.progress) || "null"); } catch (_) { saved = null; }
      if (!saved || typeof saved !== "object") return null;
      const zip = normalizeZip(saved.zip);
      return {
        zip: SERVICE_ZIPS.indexOf(zip) >= 0 ? zip : "",
        dogCount: findById(DOG_OPTIONS, String(saved.dogCount)) ? String(saved.dogCount) : "",
        frequency: findById(FREQUENCIES, saved.frequency) ? saved.frequency : "",
        areas: cleanAreas(saved.areas),
        yardSize: findById(YARD_SIZES, saved.yardSize) ? saved.yardSize : "",
        lastCleaned: LAST_CLEANED_OPTIONS.indexOf(saved.lastCleaned) >= 0 ? saved.lastCleaned : "",
        customerStatus: findById(CUSTOMER_STATUS_OPTIONS, saved.customerStatus) ? saved.customerStatus : ""
      };
    }

    // Known ids only, no duplicates, in the order chosen.
    function cleanAreas(value) {
      const clean = [];
      (Array.isArray(value) ? value : []).forEach(function (id) {
        if (findById(AREAS, id) && clean.indexOf(id) < 0) clean.push(id);
      });
      return clean;
    }

    /* ---- storage: attribution (spec 9.2) ------------------------------ */

    // Where the attribution in use came from: "session" (this visit's own
    // parameters), "kept" (the 30-day copy) or "none"; and, for "kept", when
    // that set was captured (milliseconds), otherwise 0.
    let attributionFrom = "none";
    let attributionKeptAt = 0;

    // Reads the 30-day copy: { values, capturedAt } or null. A copy that is
    // 30 days old or older, unreadable, empty, or dated more than a day ahead
    // of the clock is removed here and never used.
    function readKeptAttribution() {
      if (!env.persistentStorage) return null;
      let raw = null;
      try { raw = env.persistentStorage.getItem(STORAGE_KEYS.attributionKept); } catch (_) { return null; }
      if (raw === null || raw === undefined) return null;
      let saved = null;
      try { saved = JSON.parse(raw); } catch (_) { saved = null; }
      const readable = saved !== null && typeof saved === "object";
      const capturedAt = readable && typeof saved.capturedAt === "number" && Number.isFinite(saved.capturedAt) ? saved.capturedAt : NaN;
      const values = readable ? cleanAttribution(saved.values) : {};
      const age = env.now() - capturedAt;
      if (Object.keys(values).length > 0 && age >= -ATTRIBUTION_CLOCK_SLACK_MS && age < ATTRIBUTION_KEEP_MS) return { values: values, capturedAt: capturedAt };
      try { env.persistentStorage.removeItem(STORAGE_KEYS.attributionKept); } catch (_) { /* ignore */ }
      return null;
    }

    // Writes EXACTLY two things: the capture moment (a number) and the cleaned
    // set of the nine parameters. Nothing else is ever kept under this key.
    function writeKeptAttribution(values) {
      if (!env.persistentStorage) return;
      try { env.persistentStorage.setItem(STORAGE_KEYS.attributionKept, JSON.stringify({ capturedAt: env.now(), values: values })); } catch (_) { /* storage may be full or blocked */ }
    }

    function sameAttribution(a, b) {
      return ATTRIBUTION_KEYS.every(function (key) { return (a[key] || "") === (b[key] || ""); });
    }

    // The nine URL parameters. New values overwrite old ones; missing ones are
    // kept. Captured when the store is created and again on reset.
    //
    // TRACKING CHANGE APPROVED BY THE OWNER'S GO-AHEAD 2026-10-09 (T23): the live
    // tool keeps these for the browser session only, so a visitor who clicks
    // an ad, leaves, and comes back on another day arrives with no source.
    // The last non-empty set is now ALSO kept in this browser for 30 days,
    // with the moment it was captured:
    //   - same nine keys, cleaned and cut to 250 characters exactly as before;
    //   - written only when this page load itself arrived with a parameter,
    //     so a visit with none never overwrites it, and a newer click
    //     replaces the whole set (the session's set, as the payload has it);
    //   - the same set seen again (a reload of the landing page) keeps its
    //     first capture moment: reading it does not extend the 30 days;
    //   - removed once it is 30 days old;
    //   - the session copy always wins: the kept set is used only when this
    //     session has no parameter of its own, and is never copied into the
    //     session, so it cannot mix with a later click.
    // The payload is unchanged: same keys, no new field.
    function captureAttribution() {
      let saved = {};
      try { saved = JSON.parse(env.storage.getItem(STORAGE_KEYS.attribution) || "{}") || {}; } catch (_) { saved = {}; }
      const kept = cleanAttribution(saved);
      let arrivedWithOne = false;
      ATTRIBUTION_KEYS.forEach(function (key) {
        let value = queryParam(env, key);
        if (value !== null && looksPersonal(value)) value = null; // dropped: treated as if the link had no such tag
        if (value !== null) kept[key] = String(value).slice(0, ATTRIBUTION_VALUE_MAX);
        if (value !== null && String(value) !== "") arrivedWithOne = true;
      });
      try { env.storage.setItem(STORAGE_KEYS.attribution, JSON.stringify(kept)); } catch (_) { /* ignore */ }

      const ofThisSession = cleanAttribution(kept);
      const remembered = readKeptAttribution();
      attributionKeptAt = 0;
      if (Object.keys(ofThisSession).length > 0) {
        attributionFrom = "session";
        if (arrivedWithOne && !(remembered && sameAttribution(remembered.values, ofThisSession))) writeKeptAttribution(ofThisSession);
        return kept;
      }
      if (remembered) {
        attributionFrom = "kept";
        attributionKeptAt = remembered.capturedAt;
        return remembered.values;
      }
      attributionFrom = "none";
      return kept;
    }

    // For a test page or a debugger: where the attribution in use came from.
    // -> { source: "session" | "kept" | "none", capturedAt (ms, or 0), keepDays }
    function attributionSource() {
      return { source: attributionFrom, capturedAt: attributionKeptAt, keepDays: ATTRIBUTION_KEEP_DAYS };
    }

    /* ---- tracking (spec section 10) ----------------------------------- */

    const pixelMilestonesSent = {}; // milestone name -> true, for this page load
    const leadEventsSent = {}; // event id -> true
    let funnelViewedSent = false;
    let firstAnswerSeen = false;
    let lastZipReported = "";
    let lastPriceViewedKey = "";
    let lastStepReported = "";
    let stepsReportedOnThisScreen = {}; // step id -> true, since the engine last moved the visitor
    let lastChoiceReported = ""; // the way forward last counted for this quote (T15)
    const quoteSentCounted = {}; // event id -> true (T13)
    let areasAnswerPending = false; // the visitor changed the areas and has not moved on yet (T17)
    let lastAreasCountReported = 0; // the areas count last counted, or carried in, for this quote (T17)
    let requestStepNow = ""; // the request sub-step the interface last reported on screen (T19)
    let requestStepsViewed = {}; // "intent|sub-step" -> true, for this quote (T19)
    let requestStepsCompleted = {}; // the same, for a finished sub-step (T19)
    let lastValidationReported = ""; // the refused attempt last counted; cleared by any change (T20)
    let builderOpen = false; // a builder_opened was counted and has not been closed yet (T21)
    let contactPixelSent = false; // the pixel's Contact event went out on this page load (T22)
    let lastContactClick = { key: "", at: 0 }; // to count a double press once (T22)

    // TRACKING CHANGE APPROVED BY THE OWNER 2026-10-09 (T11): a real tag is called
    // only in live mode AND only from a page that may send (the same guard as
    // submit). A live build opened on a staging or preview origin must not
    // count in the owner's reports; its events are written to the log only,
    // as in demo mode. (The live widget calls the tags wherever it runs.)
    // STAGING calls no tag at all: every call below is inside "mode === live".
    // Its events are written to the log (sent: false), as in demo mode, so a
    // tester can read what a live page would have sent.
    function liveTagsBlocked() {
      return liveBlockedReason() !== "";
    }

    function recordEvent(entry) {
      entry.at = nowIso();
      entry.demo = mode === "demo";
      trackLog.push(entry);
      if (trackLog.length > 500) trackLog.shift();
      if (mode === "demo") log("info", "[PPQuoteCore demo] " + entry.channel + " " + entry.event, entry.params);
    }

    // A tag that throws must never break the form. Returns true when the call
    // went through.
    function callTag(send) {
      try {
        send();
        return true;
      } catch (error) {
        log("warn", "[PPQuoteCore] a tracking tag threw", error);
        return false;
      }
    }

    // Google: gtag if it exists, otherwise dataLayer (spec 10.1).
    // In demo mode nothing is sent; the call is only written to the log.
    function sendToGoogle(name, params) {
      let sent = false;
      if (mode === "live") {
        const gtag = env.getGtag();
        const dataLayer = env.getDataLayer();
        if (liveTagsBlocked()) sent = false; // this page may not send: log only
        else if (gtag) sent = callTag(function () { gtag("event", name, params); });
        else if (dataLayer) sent = callTag(function () { dataLayer.push(Object.assign({ event: name }, params)); });
      }
      recordEvent({ channel: "google", event: name, params: params, sent: sent });
    }

    // Google events that the live widget sends through gtag ONLY (conversion).
    function sendToGtagOnly(name, params) {
      let sent = false;
      if (mode === "live") {
        const gtag = env.getGtag();
        if (!liveTagsBlocked()) {
          if (!gtag) return;
          sent = callTag(function () { gtag("event", name, params); });
        }
      }
      recordEvent({ channel: "google", event: name, params: params, sent: sent });
    }

    // Meta pixel. Returns true when the call was made (or logged in demo mode).
    // When the pixel has not loaded yet it returns false and logs nothing, so a
    // once-per-page milestone can still be marked later.
    function sendToMeta(method, name, params, eventOptions) {
      if (!firePixelEvents) return false;
      let sent = false;
      if (mode === "live") {
        const fbq = env.getFbq();
        if (!liveTagsBlocked()) {
          if (!fbq) return false;
          sent = callTag(function () {
            if (eventOptions) fbq(method, name, params, eventOptions);
            else fbq(method, name, params);
          });
        }
      }
      const entry = { channel: "meta", event: name, method: method, params: params, sent: sent };
      if (eventOptions) entry.options = eventOptions;
      recordEvent(entry);
      return true;
    }

    function withoutForbiddenParams(params) {
      const clean = {};
      Object.keys(params || {}).forEach(function (key) {
        if (FORBIDDEN_EVENT_PARAMS.indexOf(key) < 0 && params[key] !== undefined) clean[key] = params[key];
      });
      return clean;
    }

    // Which pixel milestone, if any, goes with this event (by MEANING, not by
    // position in the flow: spec section 14 item 10).
    function pixelMilestoneFor(name, params) {
      if (name === "service_area_eligible") return "QuoteZipAccepted";
      if (name === "service_area_ineligible") return "QuoteZipOutOfArea";
      if (name === "price_viewed") return "QuotePriceViewed";
      if (name === "funnel_step_viewed" && params.step === 4) return "QuoteDetailsViewed";
      if (name === "funnel_step_viewed" && params.step === 5) return "QuoteReviewViewed";
      return "";
    }

    // The one function every event goes through.
    // `pageLevel` is true for the three events that are not an action in the
    // builder's questions (the builder opened, the builder closed, a contact
    // link pressed): they never count as the visitor's first answer, so they
    // never fire funnel_viewed or a city page's ZIP count (T1 and T2 stand).
    function emitEvent(name, params, pageLevel) {
      // funnel_viewed comes before every other funnel event of a page load,
      // whatever the visitor does first: an answer, or simply carrying on with
      // progress brought from another page (which answers nothing here). The
      // two ZIP-result events are the exception: for a ZIP that was handed
      // over they come just before funnel_viewed, as in the live tool.
      if (!pageLevel && !firstAnswerSeen && name !== "funnel_viewed" && name !== "service_area_eligible" && name !== "service_area_ineligible") noteFirstAnswer();
      const safe = Object.assign({ ui_version: uiVersion }, withoutForbiddenParams(params));
      sendToGoogle(name, safe);
      if (name === "funnel_viewed") sendToMeta("trackCustom", "QuoteFunnelViewed", safe);
      const milestone = pixelMilestoneFor(name, safe);
      if (milestone && !pixelMilestonesSent[milestone]) {
        // ZIP details stay out of the pixel payload: ui_version only, plus the
        // frequency and value for the price milestone.
        const pixelParams = { ui_version: safe.ui_version };
        if (name === "price_viewed" && safe.frequency) pixelParams.frequency = safe.frequency;
        if (name === "price_viewed" && typeof safe.value === "number") { pixelParams.value = safe.value; pixelParams.currency = "USD"; }
        if (sendToMeta("trackCustom", milestone, pixelParams)) pixelMilestonesSent[milestone] = true;
      }
    }

    // The measurement events added since 2026-10-09 (T13 to T22). Each is
    // built by the engine, never by an interface, and carries only what
    // EVENTS.measurementParams lists for it: every other name, and every
    // value that is not of the fixed kind, is dropped here.
    function measurementParams(name, params) {
      const given = params && typeof params === "object" ? params : {};
      const clean = {};
      (hasOwn(EVENTS.measurementParams, name) ? EVENTS.measurementParams[name] : []).forEach(function (key) {
        if (hasOwn(given, key) && isAllowedMeasurementValue(name, key, given[key])) clean[key] = given[key];
      });
      return clean;
    }

    // The Google side. It goes through emitEvent like every other event, so
    // funnel_viewed still comes first (except before a page-level event),
    // ui_version is added, demo mode only logs, and a page that may not send
    // (T11) calls no tag.
    function emitMeasurement(name, params, pageLevel) {
      if (!hasOwn(EVENTS.measurementParams, name) || EVENTS.engine.indexOf(name) < 0) return;
      emitEvent(name, measurementParams(name, params), pageLevel === true);
    }

    // The Meta side: a CUSTOM event (trackCustom), sent each time the thing
    // happens. Never "track", so it can never be a standard event such as
    // Lead; and not a milestone, so the once-per-page-load list is untouched.
    function sendPixelCount(name, params) {
      if (EVENTS.pixelCounts.indexOf(name) < 0) return false;
      return sendToMeta("trackCustom", name, Object.assign({ ui_version: uiVersion }, measurementParams(name, params)));
    }

    // May this value travel in an interface's own event? Only a short plain
    // word or number that holds nothing a visitor typed: no email address, no
    // run of digits long enough to be a ZIP or a phone number, and none of
    // the visitor's own details, whatever the parameter is called.
    function isSafeUiEventValue(value) {
      if (typeof value === "boolean") return true;
      if (typeof value !== "string" && !(typeof value === "number" && Number.isFinite(value))) return false;
      const text = String(value).trim();
      if (!text || text.length > UI_EVENT_VALUE_MAX) return false;
      if (text.indexOf("@") >= 0 || /\d{5}/.test(text) || text.replace(/\D/g, "").length >= 7) return false;
      const lower = text.toLowerCase();
      const words = lower.split(/[^a-z0-9]+/).filter(Boolean);
      const names = [state.firstName, state.lastName].map(function (name) { return String(name).trim().toLowerCase(); });
      if (names.some(function (name) { return name.length >= 2 && (words.indexOf(name) >= 0 || (/[^a-z0-9]/.test(name) && lower.indexOf(name) >= 0)); })) return false;
      const typed = [state.email, state.address, state.question, state.cityAutoFilled ? "" : state.city].map(function (detail) { return String(detail).trim().toLowerCase(); });
      return !typed.some(function (detail) { return detail.length >= 4 && lower.indexOf(detail) >= 0; });
    }

    // For the interface: only the events the engine cannot see for itself.
    //   store.track("yard_size_help_opened")
    //   store.track("promotion_details_viewed", { promotion: "No start-up fee" })
    // TRACKING CHANGE APPROVED BY THE OWNER 2026-10-09 (T10): these two events are
    // fired by the page, not by the engine, and their parameters are an
    // allow-list per event (EVENTS.uiParams): any other name is dropped, and
    // so is any value isSafeUiEventValue refuses. The event itself still
    // fires. Returns false only for an event name an interface may not fire.
    function track(name, params) {
      if (typeof name !== "string" || EVENTS.ui.indexOf(name) < 0) {
        recordEvent({ channel: "rejected", event: typeof name === "string" ? name.slice(0, 60) : "", params: {}, sent: false, reason: "Only " + EVENTS.ui.join(" and ") + " may be fired through track(). The moments a page reports go through trackUi(); the engine fires the rest itself." });
        return false;
      }
      const allowed = EVENTS.uiParams[name];
      const given = params && typeof params === "object" ? params : {};
      const clean = {};
      let dropped = 0;
      Object.keys(given).forEach(function (key) {
        if (given[key] === undefined) return;
        if (allowed.indexOf(key) >= 0 && isSafeUiEventValue(given[key])) clean[key] = typeof given[key] === "string" ? given[key].trim() : given[key];
        else dropped += 1;
      });
      // Only the count is kept: a dropped name or value is never written anywhere.
      if (dropped) recordEvent({ channel: "rejected", event: name, params: {}, sent: false, dropped: dropped, reason: name + " may carry only: " + (allowed.length ? allowed.join(", ") : "no parameters") + ". " + dropped + " parameter(s) were dropped." });
      emitEvent(name, clean);
      return true;
    }

    /* ---- the funnel and contact events of 2026-10-09 (T17 to T22) -------- */

    // TRACKING CHANGE APPROVED BY THE OWNER'S GO-AHEAD 2026-10-09 (T17): how many
    // areas the visitor chose, counted once they move on with the answer (not
    // on every tile tap): when they leave the areas question for a later
    // step, choose how often, reach a later screen, or send the request.
    // Counted again only when the number differs from the one counted last
    // for this quote. Answers carried in from another page or a saved plan
    // were not chosen here and are not counted. Google only; one parameter,
    // the count.
    function reportAreasChoice() {
      if (!areasAnswerPending || !state.areas.length) return;
      areasAnswerPending = false;
      if (state.areas.length === lastAreasCountReported) return;
      lastAreasCountReported = state.areas.length;
      emitMeasurement("areas_selected", { areas_count: state.areas.length });
    }

    // TRACKING CHANGE APPROVED BY THE OWNER'S GO-AHEAD 2026-10-09 (T19): the
    // request step may be shown as up to three short screens (who, reach,
    // where). Only the interface knows which one is on screen, so it reports
    // it through trackUi; the engine counts each screen ONCE per quote and
    // way forward, as reached and as completed, and adds the way forward
    // itself. A completed screen that was never reported as reached is
    // counted as reached first, so no report shows more people finishing a
    // screen than seeing it. Google only.
    function reportRequestStep(completed, subStep) {
      const key = state.intent + "|" + subStep;
      if (!completed) requestStepNow = subStep;
      if (!requestStepsViewed[key]) {
        requestStepsViewed[key] = true;
        emitMeasurement("request_step_viewed", { request_step: subStep, choice: state.intent });
      }
      if (completed && !requestStepsCompleted[key]) {
        requestStepsCompleted[key] = true;
        emitMeasurement("request_step_completed", { request_step: subStep, choice: state.intent });
      }
    }

    // TRACKING CHANGE APPROVED BY THE OWNER'S GO-AHEAD 2026-10-09 (T20): a press of
    // Next or Send that was refused, on the request or the confirm step.
    // What is sent is the KEYS of the fields that failed (for example
    // "phone,smsConsent"), how many there were, the step, and whether the
    // form or the server refused them. Never a value, a message or anything
    // typed. The same refusal is counted once: pressing again with nothing
    // changed is not a new attempt. The engine counts the refusals it makes
    // itself (next() on the request step, submit(), a server reply naming
    // fields); an interface reports the ones it decides alone (a sub-screen
    // checked with validateDetails()) through trackUi. Google only.
    function reportValidationFailed(fieldKeys, checkedBy, subStep) {
      if (state.step !== "request" && state.step !== "confirm") return false;
      const list = fieldKeyList(fieldKeys);
      if (!list.text) return false;
      const signature = state.step + "|" + checkedBy + "|" + list.text;
      if (signature === lastValidationReported) return true;
      lastValidationReported = signature;
      const params = { form_step: state.step, fields: list.text, error_count: list.count, checked_by: checkedBy };
      const onScreen = subStep || (state.step === "request" ? requestStepNow : "");
      if (onScreen) params.request_step = onScreen;
      emitMeasurement("form_validation_failed", params);
      return true;
    }

    function errorFields(errors) {
      return (Array.isArray(errors) ? errors : []).map(function (error) { return error && typeof error.field === "string" ? error.field : ""; });
    }

    // TRACKING CHANGE APPROVED BY THE OWNER'S GO-AHEAD 2026-10-09 (T21): the builder
    // was opened as a panel or dialog, and closed again. Only the interface
    // knows how it was opened, so it reports the opening with one of the
    // fixed entry points (a plan button also names its plan, a frequency
    // id); the engine adds the step it opened on. An opening is counted once
    // until the builder is closed. The closing is counted by the engine
    // itself in close() (or when the interface reports it), once per counted
    // opening, with the step it was closed on and, on the request step, the
    // screen. Both are page-level events: they are not an answer. Google only.
    function reportBuilderOpened(entry, plan) {
      if (builderOpen) return true;
      builderOpen = true;
      const params = { entry: entry, step: state.step };
      if (entry === "plan_button" && plan) params.plan = plan;
      emitMeasurement("builder_opened", params, true);
      return true;
    }

    function reportBuilderClosed() {
      if (!builderOpen) return true;
      builderOpen = false;
      const params = { step: state.step };
      if (state.step === "request" && requestStepNow) params.request_step = requestStepNow;
      emitMeasurement("builder_closed", params, true);
      return true;
    }

    // TRACKING CHANGE APPROVED BY THE OWNER'S GO-AHEAD 2026-10-09 (T22): a press on a
    // "text us", "call us" or "email us" link anywhere on the page. Google
    // gets contact_click with the method and where the link sits, both from
    // fixed lists: never the number, the address or the link itself. The
    // pixel gets its STANDARD event "Contact" with no parameter at all, at
    // most once per page load. Neither is a conversion. The same link
    // pressed twice within a second is one press. Page-level: not an answer.
    function reportContactClick(method, placement) {
      const key = method + "|" + placement;
      const now = env.now();
      const sincePrevious = now - lastContactClick.at;
      if (key === lastContactClick.key && sincePrevious >= 0 && sincePrevious < CONTACT_CLICK_REPEAT_MS) return true;
      lastContactClick = { key: key, at: now };
      emitMeasurement("contact_click", { method: method, placement: placement }, true);
      if (!contactPixelSent && sendToMeta("track", EVENTS.pixelStandard[0], {})) contactPixelSent = true;
      return true;
    }

    // store.trackUi(name, params) -> true or false. For the interface: the
    // SIX moments only a page can see. It reports the moment; the engine
    // decides whether it counts, builds the event and sends it.
    //   store.trackUi("builder_opened", { entry: "header_button" })
    //   store.trackUi("builder_opened", { entry: "plan_button", plan: "weekly" })
    //   store.trackUi("builder_closed")
    //   store.trackUi("request_step_viewed", { request_step: "who" })
    //   store.trackUi("request_step_completed", { request_step: "who" })
    //   store.trackUi("form_validation_failed", { request_step: "reach", fields: ["phone", "smsConsent"] })
    //   store.trackUi("contact_click", { method: "text", placement: "header" })
    // Names: EVENTS.trackUi. Parameters: EVENTS.trackUiParams, each value
    // from its fixed list in EVENTS.trackUiValues. Any other name is refused.
    // Any other parameter, and any value that is not on its list, is dropped:
    // only how many were dropped is logged, never a name or a value. Returns
    // false when the call was refused (an unknown name, a required parameter
    // missing or not on its list, or the wrong moment), true otherwise, also
    // when the moment was already counted.
    function trackUi(name, params) {
      function refuse(reason) {
        recordEvent({ channel: "rejected", event: typeof name === "string" && EVENTS.trackUi.indexOf(name) >= 0 ? name : "", params: {}, sent: false, reason: reason });
        return false;
      }
      if (typeof name !== "string" || EVENTS.trackUi.indexOf(name) < 0) return refuse("trackUi() takes only: " + EVENTS.trackUi.join(", ") + ".");
      const allowed = EVENTS.trackUiParams[name];
      const given = params && typeof params === "object" ? params : {};
      const clean = {};
      let dropped = 0;
      let fieldKeys = [];
      Object.keys(given).forEach(function (key) {
        if (given[key] === undefined) return;
        if (allowed.indexOf(key) < 0) { dropped += 1; return; }
        // "fields" arrives as a list of keys; only the known keys are kept.
        let value = given[key];
        if (key === "fields") {
          const list = fieldKeyList(value);
          fieldKeys = list.keys;
          value = list.text;
        }
        if (isAllowedMeasurementValue(name, key, value)) clean[key] = value;
        else dropped += 1;
      });
      if (hasOwn(clean, "plan") && clean.entry !== "plan_button") { delete clean.plan; dropped += 1; }
      // Only the count is kept: a dropped name or value is never written anywhere.
      if (dropped) recordEvent({ channel: "rejected", event: name, params: {}, sent: false, dropped: dropped, reason: name + " may carry only: " + (allowed.length ? allowed.join(", ") : "no parameters") + ", each from its fixed list. " + dropped + " parameter(s) were dropped." });

      if (name === "contact_click") {
        if (!clean.method || !clean.placement) return refuse("contact_click needs method (" + CONTACT_CLICK_METHODS.join(", ") + ") and placement (" + CONTACT_PLACEMENTS.join(", ") + ").");
        return reportContactClick(clean.method, clean.placement);
      }
      if (name === "builder_opened") {
        if (!clean.entry) return refuse("builder_opened needs entry (" + BUILDER_ENTRIES.join(", ") + ").");
        return reportBuilderOpened(clean.entry, clean.plan);
      }
      if (name === "builder_closed") return reportBuilderClosed();
      if (name === "form_validation_failed") {
        if (!clean.fields) return refuse("form_validation_failed needs fields: one or more field keys (" + FIELD_KEYS.join(", ") + ").");
        if (state.step !== "request" && state.step !== "confirm") return refuse("form_validation_failed is counted on the request and confirm steps only.");
        return reportValidationFailed(fieldKeys, "form", clean.request_step || "");
      }
      // request_step_viewed and request_step_completed
      const completed = name === "request_step_completed";
      if (!clean.request_step) return refuse(name + " needs request_step (" + REQUEST_SUB_STEPS.join(", ") + ").");
      if (state.step !== "request" && !(completed && state.step === "confirm")) return refuse(name + " is counted only while the request step is on screen" + (completed ? ", or on the confirm step it led to." : "."));
      reportRequestStep(completed, clean.request_step);
      return true;
    }

    // TRACKING CHANGE APPROVED BY THE OWNER 2026-10-09 (T3): "inline" (a new value) for
    // a builder that sits in the page, "modal" only if the page says its
    // builder opens as a dialog, "dedicated" on the standalone quote host,
    // "hero_zip" when the visitor arrived by typing a ZIP into a hero form.
    function presentation() {
      if (state.zipSource === "open" || state.zipSource === "url") return "hero_zip";
      if (typeof settings.presentation === "string" && settings.presentation) return settings.presentation;
      return locationPart(env, "hostname") === "quote.itspurgepros.com" ? "dedicated" : "inline";
    }

    // TRACKING CHANGE APPROVED BY THE OWNER 2026-10-09 (T1) (spec sections 14 item 10 and 15):
    // the builder is always visible in the hero, so funnel_viewed fires on the
    // visitor's FIRST ACTION in the builder, once per page load, not when the
    // page loads. The first action is the first answer, or the first later
    // event of a visitor who only continues progress carried from another
    // page (see emitEvent).
    function fireFunnelViewed() {
      if (funnelViewedSent) return;
      funnelViewedSent = true;
      emitEvent("funnel_viewed", { presentation: presentation() });
    }

    function reportZip(zip, entry) {
      const check = checkZip(zip);
      if (!check.complete) return;
      lastZipReported = check.zip;
      // Only the 3-digit prefix ever goes to Google; nothing of the ZIP goes to Meta.
      const params = { zip_prefix: check.zip.slice(0, 3) };
      if (entry) params.entry = entry;
      emitEvent(check.inArea ? "service_area_eligible" : "service_area_ineligible", params);
    }

    // Called on the visitor's first action of this page load (see emitEvent).
    function noteFirstAnswer() {
      if (firstAnswerSeen) return;
      firstAnswerSeen = true;
      // TRACKING CHANGE APPROVED BY THE OWNER 2026-10-09 (T2) (spec section 15): on a city
      // page the ZIP is supplied by the page, not typed. Counting it on page
      // load would inflate the ZIP milestone, so it is counted on the first
      // answer, with its own entry value.
      if (state.zipSource === "page" && checkZip(state.zip).inArea) reportZip(state.zip, "city_page");
      fireFunnelViewed();
    }

    // TRACKING CHANGE APPROVED BY THE OWNER 2026-10-09 (T8): price_viewed fires the
    // first time the final price for THIS plan is shown, and not again for
    // the same plan. (The live tool fires it on every press of "Review price".)
    function planKey() {
      return JSON.stringify([state.dogCount, state.frequency, state.yardSize, state.areas.slice().sort()]);
    }

    function firePriceViewed() {
      const quote = calculateQuote(planOf(state));
      if (!quote.ok) return;
      const key = planKey();
      if (key === lastPriceViewedKey) return;
      lastPriceViewedKey = key;
      const params = { frequency: state.frequency, custom: quote.custom };
      if (!quote.custom) params.value = quote.priceCents / 100;
      emitEvent("price_viewed", params);
    }

    // TRACKING CHANGE APPROVED BY THE OWNER 2026-10-09 (T15): which way forward
    // the visitor chose on the price step (request service, send me this
    // quote, ask a question) is counted when the choice is first made. The
    // engine learns of it at one of two moments, whichever comes first:
    //   - an interface sets a DIFFERENT intent while the price step is on
    //     screen (see set()), or
    //   - the visitor moves on from the price step to the request form with
    //     the intent that is already selected (see moveTo()); "Request
    //     service" is selected before anything is pressed, so pressing it
    //     changes nothing and only this second moment can see it.
    // It is counted again only when the choice differs from the one counted
    // last for this quote; reset() and opening a saved plan start a new
    // quote. Google only, like the other selection events (dog count, yard
    // size): one parameter, the intent id. No price, nothing personal.
    function reportPriceChoice() {
      if (!isValidIntent(state.intent) || state.intent === lastChoiceReported) return;
      lastChoiceReported = state.intent;
      emitMeasurement("price_choice_selected", { choice: state.intent });
    }

    // Step events, fired when the engine moves the visitor to a step. (An
    // interface that shows several steps on one screen reports the others
    // with store.reportStepShown().)
    function stepShown(step) {
      if (step !== "request") requestStepNow = ""; // no request screen is showing any more (T19)
      stepsReportedOnThisScreen = {};
      stepsReportedOnThisScreen[step] = true;
      if (step === lastStepReported) return;
      lastStepReported = step;
      if (step === "price") firePriceViewed();
      if (hasOwn(LEGACY_STEP_NUMBER, step)) emitEvent("funnel_step_viewed", { step: LEGACY_STEP_NUMBER[step] });
    }

    // Success events (spec 10.2). Lead, generate_lead and conversion fire only
    // for a successful SERVICE request, once, with the shared event id.
    function trackSuccess(payload, requestId) {
      const eventId = requestId + ":" + payload.stage;
      const params = { event_id: eventId, transaction_id: requestId, intent: payload.intent, frequency: payload.frequencyId, currency: "USD" };
      // The value is the price that was sent, in dollars. A custom estimate has none.
      if (typeof payload.clientPriceCents === "number") params.value = payload.clientPriceCents / 100;
      // TRACKING CHANGE APPROVED BY THE OWNER'S GO-AHEAD 2026-10-09 (T16): a quote sent
      // to the visitor says HOW it was sent, "text" or "email" (the reply
      // method chosen, never anything else), on the Google stage event
      // quote_requested and on the pixel count QuoteSent below.
      const sendMethod = payload.intent === "quote_delivery" && QUOTE_SEND_METHODS.indexOf(payload.preferredContact) >= 0 ? payload.preferredContact : "";
      if (sendMethod) params.method = sendMethod;
      emitEvent(payload.stage, params);
      // TRACKING CHANGE APPROVED BY THE OWNER 2026-10-09 (T13): an accepted
      // "Send me this quote" request (intent quote_delivery, whichever reply
      // method was chosen) is also counted by the Meta pixel, as the CUSTOM
      // event QuoteSent, once per accepted request, straight after its
      // Google stage event (quote_requested). It is a measurement and never
      // Lead: the conversion below stays a completed service request and
      // nothing else. The value is the per-visit price that was sent, the
      // same figure the stage event and the price milestone already carry.
      // (The event was first named QuoteTexted; it also fires for a quote
      // sent by email, so it was renamed before anything was installed.)
      if (payload.intent === "quote_delivery" && !quoteSentCounted[eventId]) {
        quoteSentCounted[eventId] = true;
        const quoteSentParams = { frequency: payload.frequencyId };
        if (typeof params.value === "number") { quoteSentParams.value = params.value; quoteSentParams.currency = "USD"; }
        if (sendMethod) quoteSentParams.method = sendMethod;
        sendPixelCount("QuoteSent", quoteSentParams);
      }
      if (payload.intent !== "service_request") return;
      if (leadEventsSent[eventId]) return;
      leadEventsSent[eventId] = true;
      sendToGoogle("generate_lead", params);
      if (googleAdsSendTo) sendToGtagOnly("conversion", Object.assign({}, params, { send_to: googleAdsSendTo, transport_type: "beacon" }));
      const leadParams = { currency: "USD" };
      if (typeof params.value === "number") leadParams.value = params.value;
      sendToMeta("track", "Lead", leadParams, { eventID: eventId });
    }

    /* ---- small readers of the current state ---------------------------- */

    function currentQuote() {
      return calculateQuote(planOf(state), labels);
    }

    // Which of the five plan questions are answered validly right now.
    function planStatus() {
      return {
        dogs: findById(DOG_OPTIONS, state.dogCount) !== null,
        zip: checkZip(state.zip).inArea,
        yard: findById(YARD_SIZES, state.yardSize) !== null,
        areas: state.areas.length > 0,
        frequency: findById(FREQUENCIES, state.frequency) !== null && frequencyEligibility(state.frequency, state.dogCount, state.yardSize, labels).allowed
      };
    }

    // The ZIP question can be skipped when a valid in-area ZIP was supplied by
    // the page (a city page), by the URL (?zip=) or by a hero ZIP form
    // (PurgeProsQuote.open({ zip })). It is still shown as an answer the
    // visitor can change: store.edit("zip").
    function isZipSkipped() {
      return checkZip(state.zip).inArea && (state.zipSource === "page" || state.zipSource === "url" || state.zipSource === "open");
    }

    // The city suggested for a ZIP: the page's own city when it is right for
    // that ZIP, otherwise the ZIP's mailing city.
    function suggestedCity(check) {
      if (pageCity) {
        const names = [check.city, check.community].concat(check.alternates);
        for (let index = 0; index < names.length; index += 1) {
          if (names[index].toLowerCase() === pageCity.toLowerCase()) return names[index];
        }
      }
      return check.city;
    }

    // City pre-fill (spec section 14 item 8). The field stays editable; once
    // the visitor types a city the engine never overwrites it.
    function syncCityWithZip() {
      const check = checkZip(state.zip);
      if (check.inArea) {
        if (state.city === "" || state.cityAutoFilled) {
          state.city = suggestedCity(check);
          state.cityAutoFilled = true;
        }
      } else if (state.cityAutoFilled) {
        state.city = "";
        state.cityAutoFilled = false;
      }
    }

    // Why nothing may be changed right now ("" when changes are allowed).
    function changeBlockedReason() {
      if (state.submitting) return SUBMIT_MESSAGES.sending;
      if (state.locked) return state.locked.message;
      if (state.step === "done") return "This request is complete. Call reset() to start a new one.";
      if (state.resumeLoading) return RESUME_MESSAGES.loadingTitle;
      return "";
    }

    /* ---- set(patch): the one way answers change ------------------------- */

    const SETTABLE_FIELDS = [
      "zip", "dogCount", "yardSize", "areas", "frequency", "intent", "customerStatus",
      "firstName", "lastName", "phone", "email", "preferredContact", "smsConsent",
      "address", "city", "startTiming", "lastCleaned", "question", "termsAccepted"
    ];

    // Changing any of these after the terms box was ticked unticks it, so the
    // visitor agrees again to what is now on screen (spec 4.5.1, 17.2 item 6).
    const TERMS_COVERED_FIELDS = SETTABLE_FIELDS.filter(function (field) { return field !== "termsAccepted"; });

    // The order in which changed fields are listed (result.changed, info.changed).
    const CHANGE_ORDER = SETTABLE_FIELDS.concat([
      "zipSource", "cityAutoFilled", "step", "editReturn", "smsConsentCapturedAt", "termsAcceptedAt",
      "submitting", "locked", "receipt", "resumeLoading", "resumeNotice", "attribution"
    ]);

    function sameValue(a, b) {
      return Array.isArray(a) && Array.isArray(b) ? a.join("|") === b.join("|") : a === b;
    }

    // Unticks the terms box and says why. Used by every path that changes what
    // the box covers: set(), edit(), open({ zip }) and a ?zip= in the address.
    function clearTerms(notices) {
      if (!state.termsAccepted) return;
      state.termsAccepted = false;
      state.termsAcceptedAt = "";
      notices.push({ code: "TERMS_CLEARED", field: "termsAccepted", goToStep: "", message: "Your details changed, so please confirm the terms again." });
    }

    // set({ dogCount: "2" }) applies a change, re-runs the rules, saves the
    // permitted fields, fires the right events and tells the subscribers.
    // Returns { ok, changed, notices, rejected, movedTo, state }.
    //   changed   the names of ALL state fields whose value is now different
    //             (the same list the subscribers get as info.changed)
    //   notices   [{ code, field, message, goToStep }] - things the engine
    //             changed on its own, with the reason in plain words. SHOW THEM.
    //   rejected  [{ field, value, reason }] - values the engine refused
    //   movedTo   a step id when the change forced the visitor back to a question
    function set(patch) {
      const input = patch && typeof patch === "object" ? patch : {};
      const result = { ok: true, changed: [], notices: [], rejected: [], movedTo: null, state: null };
      function reject(field, reason) {
        result.rejected.push({ field: field, value: input[field], reason: reason });
      }

      const blocked = changeBlockedReason();
      if (blocked) {
        Object.keys(input).forEach(function (field) { reject(field, blocked); });
        result.ok = false;
        result.state = getState();
        return result;
      }

      const before = Object.assign({}, state, { areas: state.areas.slice() });
      Object.keys(input).forEach(function (field) {
        if (SETTABLE_FIELDS.indexOf(field) < 0) reject(field, "Unknown or read-only field.");
      });

      // 1. ZIP. Digits only, at most five. Any ZIP set here is the visitor's own answer.
      if (hasOwn(input, "zip")) {
        state.zip = normalizeZip(input.zip);
        state.zipSource = state.zip ? "typed" : "";
      }

      // 2. Dogs: "1" to "10" (a number is accepted), or "" to clear.
      if (hasOwn(input, "dogCount")) {
        const dogCount = input.dogCount === "" || input.dogCount === null ? "" : String(input.dogCount);
        if (dogCount === "" || findById(DOG_OPTIONS, dogCount)) state.dogCount = dogCount;
        else reject("dogCount", "Dogs must be 1 to 10 (10 means 10 or more).");
      }

      // 3. Yard size.
      if (hasOwn(input, "yardSize")) {
        if (input.yardSize === "" || findById(YARD_SIZES, input.yardSize)) state.yardSize = input.yardSize;
        else reject("yardSize", "Unknown yard size.");
      }

      // 4. Areas: the full list of selected ids. Unknown ids are refused.
      if (hasOwn(input, "areas")) {
        const given = Array.isArray(input.areas) ? input.areas : null;
        if (given && given.every(function (id) { return findById(AREAS, id) !== null; })) state.areas = cleanAreas(given);
        else reject("areas", "Areas must be a list of: back, front, side.");
      }

      // 5. Frequency. An explicit choice must be allowed for the dogs and yard
      //    (spec 4.2.1). Otherwise, after a dog or yard change, reconcile the
      //    existing choice and explain any change (spec 4.2.2).
      let explicitFrequencyApplied = false;
      if (hasOwn(input, "frequency")) {
        if (input.frequency === "") {
          state.frequency = "";
          explicitFrequencyApplied = true;
        } else if (!findById(FREQUENCIES, input.frequency)) {
          reject("frequency", "Unknown frequency.");
        } else {
          const eligibility = frequencyEligibility(input.frequency, state.dogCount, state.yardSize, labels);
          if (eligibility.allowed) {
            state.frequency = input.frequency;
            explicitFrequencyApplied = true;
          } else {
            reject("frequency", eligibility.reason + ".");
          }
        }
      }
      const dogsOrYardChanged = state.dogCount !== before.dogCount || state.yardSize !== before.yardSize;
      if (dogsOrYardChanged && !explicitFrequencyApplied) {
        const reconciled = reconcileFrequency(before, state, labels);
        state.frequency = reconciled.frequency;
        if (reconciled.notice) result.notices.push(reconciled.notice);
      }

      // 6. Intent. A custom estimate can only be sent as a service request (spec 4.3.2).
      if (hasOwn(input, "intent")) {
        if (!isValidIntent(input.intent)) reject("intent", "Unknown intent.");
        else state.intent = input.intent;
      }
      const quoteNow = currentQuote();
      if (quoteNow.ok && quoteNow.custom && state.intent !== "service_request") {
        if (hasOwn(input, "intent") && input.intent === state.intent) reject("intent", MESSAGES.customNeedsServiceRequest);
        else result.notices.push({ code: "INTENT_RESET", field: "intent", goToStep: "", message: MESSAGES.customNeedsServiceRequest });
        state.intent = "service_request";
      }

      // 7. Customer status.
      if (hasOwn(input, "customerStatus")) {
        if (input.customerStatus === "" || findById(CUSTOMER_STATUS_OPTIONS, input.customerStatus)) state.customerStatus = input.customerStatus;
        else reject("customerStatus", "Customer status must be new, returning or not_sure.");
      }

      // 8. Reply method. Phone call is not offered for a quote delivery (spec 12.7).
      if (hasOwn(input, "preferredContact")) {
        if (!findById(CONTACT_METHODS, input.preferredContact)) reject("preferredContact", "Reply method must be text, email or call.");
        else if (input.preferredContact === "call" && state.intent === "quote_delivery") reject("preferredContact", MESSAGES.callNotOffered);
        else state.preferredContact = input.preferredContact;
      }
      if (state.intent === "quote_delivery" && state.preferredContact === "call") {
        state.preferredContact = "text";
        result.notices.push({ code: "CONTACT_CHANGED", field: "preferredContact", goToStep: "", message: "A quote can be sent by text or email, so the reply method was changed to Text message." });
      }

      // 9. Plain text fields. Cut to the live limits; trimmed when sent.
      ["firstName", "lastName", "email", "address", "question"].forEach(function (field) {
        if (hasOwn(input, field)) state[field] = String(input[field] == null ? "" : input[field]).slice(0, FIELD_MAX_LENGTH[field]);
      });
      if (hasOwn(input, "phone")) state.phone = formatPhone(input.phone);

      // 10. City: pre-filled from the ZIP until the visitor types one.
      if (hasOwn(input, "zip")) syncCityWithZip();
      if (hasOwn(input, "city")) {
        state.city = String(input.city == null ? "" : input.city).slice(0, FIELD_MAX_LENGTH.city);
        state.cityAutoFilled = false;
      }

      // 11. The two drop-down answers: exact strings only (spec 5.6 and 5.7).
      if (hasOwn(input, "startTiming")) {
        if (input.startTiming === "" || START_TIMING_OPTIONS.indexOf(input.startTiming) >= 0) state.startTiming = input.startTiming;
        else reject("startTiming", "Start timing must be one of the four exact options.");
      }
      if (hasOwn(input, "lastCleaned")) {
        if (input.lastCleaned === "" || LAST_CLEANED_OPTIONS.indexOf(input.lastCleaned) >= 0) state.lastCleaned = input.lastCleaned;
        else reject("lastCleaned", "Last full cleanup must be one of the six exact options.");
      }

      // 12. Text consent (spec 4.4.1). Only while Text is the reply method.
      //     Ticking records the moment; unticking clears it. Leaving Text
      //     unticks the box, and coming back needs a fresh tick.
      if (hasOwn(input, "smsConsent")) {
        if (input.smsConsent === true) {
          if (state.preferredContact !== "text") reject("smsConsent", "Text consent can only be given while Text message is the reply method.");
          else if (!state.smsConsent) { state.smsConsent = true; state.smsConsentCapturedAt = nowIso(); }
        } else {
          state.smsConsent = false;
          state.smsConsentCapturedAt = "";
        }
      }
      if (state.preferredContact !== "text" && state.smsConsent) {
        state.smsConsent = false;
        state.smsConsentCapturedAt = "";
        result.notices.push({ code: "CONSENT_CLEARED", field: "smsConsent", goToStep: "", message: "Text permission was cleared because the reply method is no longer Text message." });
      }

      // 13. Terms (spec 4.5 and 17.2 item 6). Service requests only. The box
      //     covers what is on screen at the moment it is ticked, so:
      //       - any other change after it was ticked unticks it;
      //       - a tick that arrives in the same call as another change counts
      //         from NOW, never from an earlier tick (the recorded time is
      //         never earlier than the last change it covers);
      //       - it can never end up ticked for a quote delivery or a question,
      //         whatever else the same call asks for.
      const coveredFieldChanged = TERMS_COVERED_FIELDS.some(function (field) { return !sameValue(before[field], state[field]); });
      const tickAsked = hasOwn(input, "termsAccepted") && input.termsAccepted === true;
      const untickAsked = hasOwn(input, "termsAccepted") && input.termsAccepted !== true;
      if (tickAsked && state.intent !== "service_request") reject("termsAccepted", "The terms box applies to a service request only.");
      if (untickAsked) {
        state.termsAccepted = false;
        state.termsAcceptedAt = "";
      } else if (state.intent !== "service_request") {
        clearTerms(result.notices);
      } else if (tickAsked) {
        if (!state.termsAccepted || coveredFieldChanged) { state.termsAccepted = true; state.termsAcceptedAt = nowIso(); }
      } else if (coveredFieldChanged) {
        clearTerms(result.notices);
      }

      // 14. If the visitor is past the plan questions and the plan is no
      //     longer complete, take them back to the question that needs an
      //     answer (spec section 15). Typing a ZIP in the request step does
      //     not move them mid-keystroke: only a complete out-of-area ZIP does.
      if (state.step === "price" || state.step === "request" || state.step === "confirm") {
        const zipCheck = checkZip(state.zip);
        const problems = planErrors(state, labels).filter(function (error) {
          return !(error.field === "zip" && zipCheck.status !== "out_of_area");
        });
        if (problems.length) {
          state.editReturn = state.step;
          state.step = problems[0].step;
          result.movedTo = state.step;
        }
      }
      if (checkZip(state.zip).status === "out_of_area" && state.zip !== before.zip) {
        result.notices.push({ code: "ZIP_OUT_OF_AREA", field: "zip", goToStep: "zip", message: checkZip(state.zip).message });
      }

      // ---- a changed plan dismisses the saved-plan notice (spec 13 item 14) ----
      const planChanged = ["zip", "dogCount", "yardSize", "areas", "frequency"].some(function (field) { return !sameValue(before[field], state[field]); });
      if (planChanged) state.resumeNotice = "";

      // ---- what actually changed: every state field, not only the answers ----
      result.changed = changedSince(before);
      result.ok = result.rejected.length === 0;
      if (!result.changed.length) {
        // Nothing is different: no save, no events, no call to the subscribers.
        result.state = getState();
        return result;
      }

      // ---- save the permitted fields ----
      const storedFieldChanged = PERSISTED_PLAN_KEYS.concat(["zipSource"]).some(function (field) { return result.changed.indexOf(field) >= 0; });
      if (storedFieldChanged) saveProgress();

      // ---- events ----
      // TRACKING CHANGE APPROVED BY THE OWNER 2026-10-09 (T5): there is no "Check ZIP"
      // button. A typed ZIP is counted when it reaches five digits, wherever
      // it is typed (the ZIP question or the request form's ZIP field), and
      // not again while it stays the same ZIP.
      // TRACKING CHANGE APPROVED BY THE OWNER 2026-10-09 (T9): dog_count_selected and
      // yard_size_selected fire when the answer CHANGES, not on every tap.
      const zipAnswered = hasOwn(input, "zip") && checkZip(state.zip).complete && (state.zip !== before.zip || before.zipSource !== "typed");
      const planAnswered = ["dogCount", "yardSize", "areas", "frequency"].some(function (field) { return hasOwn(input, field) && result.changed.indexOf(field) >= 0; });
      if (zipAnswered || planAnswered) noteFirstAnswer();
      if (zipAnswered && state.zip !== lastZipReported) reportZip(state.zip, "");
      if (result.changed.indexOf("dogCount") >= 0 && state.dogCount) emitEvent("dog_count_selected", { dogs: Number(state.dogCount) });
      if (result.changed.indexOf("yardSize") >= 0 && state.yardSize) emitEvent("yard_size_selected", { yard_size: state.yardSize });
      // The areas answer changed (T17): counted when the visitor moves on.
      if (hasOwn(input, "areas") && result.changed.indexOf("areas") >= 0) areasAnswerPending = true;
      // TRACKING CHANGE APPROVED BY THE OWNER'S GO-AHEAD 2026-10-09 (T18): how often,
      // counted when the visitor's own choice changes the answer (as for the
      // dog count and the yard size), with the frequency id and nothing else.
      // A frequency the engine changed by itself after a dog or yard change
      // is not the visitor's choice and is not counted. Google only.
      if (hasOwn(input, "frequency") && result.changed.indexOf("frequency") >= 0 && state.frequency !== "" && state.frequency === input.frequency) {
        reportAreasChoice();
        emitMeasurement("frequency_selected", { frequency: state.frequency });
      }
      // The way forward (T15): only a choice the interface asked for and the
      // engine accepted, made on the price step. An intent the engine changed
      // by itself (a custom estimate) is not the visitor's choice.
      const choiceMade = hasOwn(input, "intent") && result.changed.indexOf("intent") >= 0 && state.intent === input.intent;
      if (choiceMade && before.step === "price" && state.step === "price") reportPriceChoice();
      if (result.movedTo) stepShown(result.movedTo);

      commit("set", before, result.notices, result.movedTo);
      result.state = getState();
      return result;
    }

    // Tap an area tile: on if it was off, off if it was on (brief section 6).
    function toggleArea(areaId) {
      const areas = state.areas.slice();
      const index = areas.indexOf(areaId);
      if (index >= 0) areas.splice(index, 1);
      else areas.push(areaId);
      return set({ areas: areas });
    }

    // The optional "all areas" shortcut: all three on, or all three off when
    // they are already all on (spec 4.2 Q4).
    function toggleAllAreas() {
      return set({ areas: state.areas.length === AREAS.length ? [] : AREAS.map(function (area) { return area.id; }) });
    }

    /* ---- a ZIP supplied from outside the builder ------------------------ */

    // open({ zip }) is what window.PurgeProsQuote.open({ zip }) calls: a hero
    // ZIP form, or ?open_quote=1&zip= (spec 2.3). The visitor typed this ZIP
    // somewhere else on purpose, so it counts as an answer.
    //   - 5 digits, in area:      ZIP accepted, the ZIP question is skipped
    //   - 5 digits, out of area:  the ZIP step shows the out-of-area answer
    //   - anything else, or none: nothing changes; the ZIP is asked in its turn
    // Nothing changes, and ok is false with the reason, while a request is
    // being sent, after a locked reply, while a saved plan is loading, and on
    // the done step: a request is never lost or overwritten by a reopen. (The
    // page hooks start a new quote first when a ZIP is typed after a finished
    // request: see installPageHooks.)
    // Returns { ok, zipStatus, step, reason }. The interface then brings the
    // builder into view and moves focus to it. A different ZIP unticks the
    // terms box; the subscribers are told with a TERMS_CLEARED notice.
    function open(openOptions) {
      const blocked = changeBlockedReason();
      const unchanged = { ok: !blocked, zipStatus: checkZip(state.zip).status, step: state.step, reason: blocked };
      if (blocked) return unchanged;
      const raw = openOptions && typeof openOptions.zip === "string" ? openOptions.zip.trim() : "";
      if (!/^\d{5}$/.test(raw)) return unchanged;
      // The same ZIP handed over twice (for example ?zip= read at start-up and
      // then an automatic open) is applied, and counted, only once.
      if (raw === state.zip && (state.zipSource === "open" || state.zipSource === "url")) return unchanged;
      const before = stateBefore();
      const notices = [];
      applySuppliedZip(raw, "open", notices);
      commit("open", before, notices, null);
      return { ok: true, zipStatus: checkZip(state.zip).status, step: state.step, reason: "" };
    }

    // close() is for a builder shown as a dialog. Nothing may hide a request
    // that is being sent, so it is refused then. Closing from the done step
    // starts a new quote, as the live tool does (spec 2.4); otherwise every
    // answer stays in memory, so reopening returns to the same step.
    // Returns { ok, reason, startedOver }.
    function close() {
      if (state.submitting) return { ok: false, reason: SUBMIT_MESSAGES.sending, startedOver: false };
      // Counted here, before anything is cleared, with the step it was closed
      // on; only when an opening was counted (T21).
      reportBuilderClosed();
      if (state.step !== "done") return { ok: true, reason: "", startedOver: false };
      const before = stateBefore();
      startOver();
      commit("close", before, [], "dogs");
      return { ok: true, reason: "", startedOver: true };
    }

    // Shared by open() and by a ?zip= in the page URL.
    function applySuppliedZip(zip, source, notices) {
      // A different ZIP is an edit like any other: the terms must be agreed again.
      if (zip !== state.zip) clearTerms(notices);
      state.zip = zip;
      state.zipSource = source;
      state.resumeNotice = "";
      syncCityWithZip();
      const check = checkZip(zip);
      if (!check.inArea) {
        // Out of area: stop here, on the ZIP step, with nothing else asked.
        state.step = "zip";
        state.editReturn = "";
        notices.push({ code: "ZIP_OUT_OF_AREA", field: "zip", goToStep: "zip", message: check.message });
      } else if (state.step === "zip") {
        // The ZIP question is answered: move on to the next unanswered one.
        state.step = firstIncompletePlanStep() || "frequency";
      }
      // In area: store it. Out of area: store nothing new, but if progress already exists, rewrite it so a stale
      // accepted ZIP from earlier does not survive (zipToStore() returns "" for an out-of-area ZIP).
      if (check.inArea || readProgress()) saveProgress();
      // The same events the live tool sends for a ZIP passed in (spec 10.2):
      // the ZIP result with entry "hero_zip", then funnel_viewed.
      firstAnswerSeen = true;
      reportZip(zip, "hero_zip");
      fireFunnelViewed();
    }

    /* ---- the flow -------------------------------------------------------- */

    function stepMessage(step) {
      if (step === "dogs") return "Choose the number of dogs.";
      if (step === "zip") return checkZip(state.zip).message;
      if (step === "yard") return "Choose the serviced yard size.";
      if (step === "areas") return "Choose at least one service area.";
      if (step === "frequency") {
        const quote = currentQuote();
        const frequencyError = quote.ok ? null : quote.errors.filter(function (error) { return error.field === "frequency"; })[0];
        return frequencyError ? frequencyError.message : "Choose a service frequency.";
      }
      return "";
    }

    // Can the visitor be on this step right now? { ok, reason, step }
    // `step` names the step that must be finished first, when there is one.
    function reachability(target) {
      if (STEPS.indexOf(target) < 0) return { ok: false, reason: "Unknown step.", step: "" };
      const blocked = changeBlockedReason();
      if (blocked) return { ok: target === state.step, reason: blocked, step: "" };
      if (target === "done") return { ok: false, reason: "The done step is reached by a successful submit.", step: "" };
      const status = planStatus();
      const planIndex = PLAN_STEPS.indexOf(target);
      if (planIndex >= 0) {
        for (let index = 0; index < planIndex; index += 1) {
          if (!status[PLAN_STEPS[index]]) return { ok: false, reason: stepMessage(PLAN_STEPS[index]), step: PLAN_STEPS[index] };
        }
        return { ok: true, reason: "", step: "" };
      }
      const problems = planErrors(state, labels);
      if (problems.length) {
        // An unfinished ZIP typed into the request form is finished there.
        const fixedOnForm = target === "confirm" && formZipError(state.intent) !== null && problems.every(function (error) { return error.field === "zip"; });
        return { ok: false, reason: problems[0].message, step: fixedOnForm ? "request" : problems[0].step };
      }
      if (target === "confirm") {
        const details = detailsErrors(state, state.intent);
        if (details.length) return { ok: false, reason: details[0].message, step: "request" };
      }
      return { ok: true, reason: "", step: "" };
    }

    // The ZIP field of the service-request form is the ONE ZIP (spec section
    // 14 item 7). While the visitor is on that form (or on confirm) and the
    // ZIP is unfinished, that is a plain message beside that field, with step
    // "request" - not the ZIP question. Anywhere else an unanswered ZIP stays
    // a plan error with step "zip". A COMPLETE ZIP outside the area is never
    // a form error: set() takes the visitor to the ZIP step, where the
    // out-of-area answer is shown and nothing else is asked.
    function formZipError(intent) {
      if (intent !== "service_request" || (state.step !== "request" && state.step !== "confirm")) return null;
      const zip = checkZip(state.zip);
      if (zip.complete) return null;
      return { field: "zip", step: "request", code: "ZIP_REQUIRED", message: zip.message, engineOnly: false };
    }

    // The request-form errors as the visitor sees the form: detailsErrors,
    // plus the unfinished ZIP in its place in the form (after the city).
    function formErrors(intent) {
      const details = detailsErrors(state, intent);
      const zipError = formZipError(intent);
      if (!zipError) return details;
      const after = ["startTiming", "lastCleaned", "question"];
      let at = details.length;
      for (let index = 0; index < details.length; index += 1) {
        if (after.indexOf(details[index].field) >= 0) { at = index; break; }
      }
      return details.slice(0, at).concat([zipError], details.slice(at));
    }

    // Everything that must be right before a request can go on to confirm:
    // the plan, then the request form, each field ONCE. An unfinished ZIP on
    // the request form is listed once, as the form's field (see formZipError).
    // It keeps its place at the head of the list, because the city pre-fill
    // waits on it.
    function requestErrors(intent) {
      const zipOnForm = formZipError(intent);
      const plan = planErrors(state, labels).map(function (error) { return zipOnForm && error.field === "zip" ? zipOnForm : error; });
      return plan.concat(detailsErrors(state, intent));
    }

    // The first plan question that still needs an answer, or "".
    function firstIncompletePlanStep() {
      const status = planStatus();
      for (let index = 0; index < PLAN_STEPS.length; index += 1) {
        if (!status[PLAN_STEPS[index]]) return PLAN_STEPS[index];
      }
      return "";
    }

    // Where a one-tap edit returns to once the plan is complete again.
    function resolveEditReturn() {
      if (state.editReturn === "confirm") return detailsErrors(state, state.intent).length ? "request" : "confirm";
      return state.editReturn;
    }

    // flow() answers, for the current step (or the step given):
    //   steps            all nine steps with { id, kind, complete, skipped, reachable, current }
    //   current          the step id
    //   zipSkipped       true when the ZIP question is skipped (see isZipSkipped)
    //   firstIncomplete  the first plan question still unanswered, or ""
    //   resumeAt         where "Continue" should take a returning visitor
    //   back             the step Back goes to, or "" when there is none
    //   primaryAction    "next", "submit" or "none"
    //   next             the step the primary action leads to, or ""
    //   disablePrimary   THE answer to "is the primary button disabled?".
    //                    Bind button.disabled to this one field. True while a
    //                    plan question (or the price step) is unanswered, and
    //                    whenever there is no primary action (sending, locked,
    //                    loading a saved plan, done). False on the request and
    //                    confirm steps even when something is missing: there
    //                    the button stays enabled and pressing it shows the
    //                    error summary (spec 11.4).
    //   canContinue      whether pressing the primary action would succeed
    //                    right now. Never true while disablePrimary is true.
    //   blockedReason    why it would not, in plain words ("" when it would)
    //   blockedErrors    the full error list behind blockedReason
    function flow(stepId) {
      const current = STEPS.indexOf(stepId) >= 0 ? stepId : state.step;
      const status = planStatus();
      const zipSkipped = isZipSkipped();
      const planProblems = planErrors(state, labels);
      const planComplete = planProblems.length === 0;
      const details = detailsErrors(state, state.intent);
      const terms = termsErrors(state, state.intent);
      const firstIncomplete = firstIncompletePlanStep();
      const order = STEPS.filter(function (id) { return !(id === "zip" && zipSkipped); });
      const position = order.indexOf(current);
      const frozen = state.submitting || state.locked !== null || state.step === "done" || state.resumeLoading;

      const steps = STEPS.map(function (id) {
        let complete = false;
        if (hasOwn(status, id)) complete = status[id];
        else if (id === "price") complete = planComplete;
        else if (id === "request") complete = planComplete && details.length === 0;
        else if (id === "confirm") complete = planComplete && details.length === 0 && terms.length === 0;
        else if (id === "done") complete = state.receipt !== null;
        return {
          id: id,
          kind: PLAN_STEPS.indexOf(id) >= 0 ? "plan" : id,
          complete: complete,
          skipped: id === "zip" && zipSkipped,
          reachable: reachability(id).ok,
          current: id === current
        };
      });

      // Back: the previous step in the order. None on the first step, and
      // none while sending, after a locked reply, or on the done step.
      let back = "";
      if (!frozen && current !== "done") {
        if (position > 0) back = order[position - 1];
        else if (position < 0 && current === "zip") back = "dogs"; // editing a skipped ZIP
      }

      let primaryAction = "next";
      let next = "";
      let blockedErrors = [];
      let disablePrimary = false;

      if (frozen) {
        primaryAction = "none";
        blockedErrors = [{ field: "", step: current, code: "FROZEN", message: changeBlockedReason() }];
      } else if (PLAN_STEPS.indexOf(current) >= 0) {
        if (!status[current]) {
          blockedErrors = [{ field: "", step: current, code: "STEP_INCOMPLETE", message: stepMessage(current) }];
        } else if (firstIncomplete) {
          // Always go to the first question that still needs an answer.
          next = firstIncomplete;
        } else if (state.editReturn) {
          // One-tap edit with the plan complete again: back to where the edit started.
          next = resolveEditReturn();
        } else {
          // Every question is answered (for example progress carried over from
          // another page): walk forward one step at a time.
          next = current === "zip" && position < 0 ? "yard" : order[position + 1];
        }
      } else if (current === "price") {
        if (planComplete) next = "request";
        else blockedErrors = planProblems;
      } else if (current === "request") {
        blockedErrors = requestErrors(state.intent);
        if (!blockedErrors.length) next = "confirm";
      } else if (current === "confirm") {
        primaryAction = "submit";
        blockedErrors = requestErrors(state.intent).concat(terms);
        if (!blockedErrors.length) next = "done";
      } else {
        primaryAction = "none";
      }
      // One answer for the button: disabled when there is nothing to press, or
      // when a plan question (or the price step) is still unanswered.
      disablePrimary = primaryAction === "none" || (blockedErrors.length > 0 && current !== "request" && current !== "confirm");

      return {
        steps: steps,
        order: order,
        current: current,
        zipSkipped: zipSkipped,
        firstIncomplete: firstIncomplete,
        resumeAt: firstIncomplete || "price",
        editReturn: state.editReturn,
        back: back,
        primaryAction: primaryAction,
        next: next,
        canContinue: primaryAction !== "none" && blockedErrors.length === 0,
        blockedReason: blockedErrors.length ? blockedErrors[0].message : "",
        blockedErrors: blockedErrors,
        disablePrimary: disablePrimary
      };
    }

    // Moves to a step and does what arriving there requires. The caller
    // commits the change (one call to the subscribers).
    function moveTo(target) {
      const from = state.step;
      state.step = target;
      // An edit is over once the visitor is back at, or past, where it started.
      if (state.editReturn && STEPS.indexOf(target) >= STEPS.indexOf(state.editReturn)) state.editReturn = "";
      if (target === from) return;
      // The saved-plan notice goes away once the visitor moves on (spec 13 item 14).
      state.resumeNotice = "";
      // Moving on past the areas question settles that answer (T17).
      if (STEPS.indexOf(target) > STEPS.indexOf("areas")) reportAreasChoice();
      // Moving on from the price to the request is the choice of a way
      // forward (T15). It is counted before the step event of the form.
      if (from === "price" && (target === "request" || target === "confirm")) reportPriceChoice();
      stepShown(target);
    }

    // goTo("yard") -> { ok, step, reason, needs }. Refuses a step whose
    // earlier questions are unanswered; `needs` then names the step to finish
    // first ("" when the move was made, or when nothing may change right now).
    function goTo(target) {
      const blocked = changeBlockedReason();
      if (blocked) return { ok: false, step: state.step, reason: blocked, needs: "" };
      const check = reachability(target);
      if (!check.ok) return { ok: false, step: state.step, reason: check.reason, needs: check.step };
      const before = stateBefore();
      state.editReturn = "";
      moveTo(target);
      commit("goTo", before, [], null);
      return { ok: true, step: state.step, reason: "", needs: "" };
    }

    // edit("dogs") is one-tap editing of an earlier answer: it remembers where
    // the visitor was, so next() returns there when the plan is complete again.
    // Any edit unticks the terms box (spec 4.5.1); the subscribers are told
    // with a TERMS_CLEARED notice and "termsAccepted" in info.changed.
    // -> { ok, step, reason, returnTo }. returnTo is "" when the edit was
    // refused (reason says why) or when there is nowhere later to return to.
    function edit(target) {
      const blocked = changeBlockedReason();
      if (blocked) return { ok: false, step: state.step, reason: blocked, returnTo: "" };
      const check = reachability(target);
      if (!check.ok) return { ok: false, step: state.step, reason: check.reason, returnTo: "" };
      const before = stateBefore();
      const notices = [];
      const from = state.step;
      const returnTo = state.editReturn && STEPS.indexOf(state.editReturn) > STEPS.indexOf(from) ? state.editReturn : from;
      clearTerms(notices);
      state.editReturn = STEPS.indexOf(target) < STEPS.indexOf(returnTo) ? returnTo : "";
      moveTo(target);
      commit("edit", before, notices, null);
      return { ok: true, step: state.step, reason: "", returnTo: state.editReturn };
    }

    // next() takes the primary action of the current step when it is "next".
    // -> { ok, step, reason, errors }. On the confirm step use submit().
    function next() {
      const current = flow();
      if (current.primaryAction !== "next" || !current.canContinue || !current.next) {
        // A refused press on the request form is a failed attempt (T20).
        if (state.step === "request" && current.primaryAction === "next") reportValidationFailed(errorFields(current.blockedErrors), "form", "");
        return { ok: false, step: state.step, reason: current.blockedReason || "Use submit() on the confirm step.", errors: current.blockedErrors };
      }
      const before = stateBefore();
      moveTo(current.next);
      commit("next", before, [], null);
      return { ok: true, step: state.step, reason: "", errors: [] };
    }

    // back() -> { ok, step, reason }.
    function back() {
      const current = flow();
      if (!current.back) return { ok: false, step: state.step, reason: "There is no earlier step." };
      const before = stateBefore();
      moveTo(current.back);
      commit("back", before, [], null);
      return { ok: true, step: state.step, reason: "" };
    }

    // For a design that shows the request form and the confirmation on one
    // screen: report the step the visitor can now see, so its event fires
    // (spec section 15). Only price, request and confirm, and only once the
    // plan is complete. Safe to call on every render: each step is reported
    // once per visit to the screen (until the engine next moves the visitor).
    function reportStepShown(step) {
      if (["price", "request", "confirm"].indexOf(step) < 0) return false;
      if (planErrors(state, labels).length) return false;
      if (stepsReportedOnThisScreen[step]) return true;
      stepsReportedOnThisScreen[step] = true;
      reportAreasChoice(); // a later screen is showing: the areas answer is settled (T17)
      if (step === lastStepReported) return true;
      lastStepReported = step;
      if (step === "price") firePriceViewed();
      emitEvent("funnel_step_viewed", { step: LEGACY_STEP_NUMBER[step] });
      return true;
    }

    /* ---- what to show: options, price, summaries ------------------------- */

    function unitFor(frequencyId) {
      return frequencyId === "onetime" ? "base price" : "per visit";
    }

    // Every frequency for the current dogs, yard and areas (spec 4.2.1, 15).
    // Each option carries ONE exact price. There are no "+$x.xx" adders to
    // show: the yard and area amounts are already inside priceCents.
    //   { id, label, sub, popular, custom, selected, available, reason,
    //     priceCents, priceLabel, unit, priceText, note }
    // priceCents is null for custom, for an unavailable option, and for a
    // recurring option while dogs, yard or areas are still unanswered.
    function frequencyOptions() {
      const yard = findById(YARD_SIZES, state.yardSize);
      const dogs = Number(state.dogCount);
      const areaCount = state.areas.length;
      return FREQUENCIES.map(function (definition) {
        const eligibility = frequencyEligibility(definition.id, state.dogCount, state.yardSize, labels);
        let priceCents = null;
        if (eligibility.allowed && !definition.custom) {
          if (definition.id === "onetime") {
            priceCents = definition.flatPriceCents;
          } else if (dogs && definition.prices[dogs] && yard && !yard.custom && areaCount > 0) {
            priceCents = definition.prices[dogs] + yard.addCents + (AREA_ADDERS_CENTS[areaCount] || 0);
          }
        }
        const unit = definition.custom ? "" : unitFor(definition.id);
        return {
          id: definition.id,
          label: labels[definition.id],
          sub: definition.sub,
          popular: definition.popular,
          custom: definition.custom,
          selected: state.frequency === definition.id,
          available: eligibility.allowed,
          reason: eligibility.reason,
          reasonCode: eligibility.code,
          priceCents: priceCents,
          priceLabel: priceCents === null ? "" : formatMoney(priceCents),
          unit: unit,
          priceText: priceCents === null ? "" : formatMoney(priceCents) + " " + unit,
          note: definition.id === "onetime" ? ONE_TIME.summary : ""
        };
      });
    }

    // The final price object.
    //   ready         true when dogs, yard, areas and frequency give a result
    //   custom        true for a custom estimate: NEVER show a price for it
    //   priceCents / priceLabel / unit / priceText   the one per-visit price
    //   lineItems     for the final price summary ONLY (spec 5.5)
    //   oneTime       the one-time facts (first 30 minutes, then $1 per minute), or null
    //   note          the sentence shown under the price
    //   errors        what is missing when ready is false
    function quote() {
      const result = currentQuote();
      const frequency = findById(FREQUENCIES, state.frequency);
      const yard = findById(YARD_SIZES, state.yardSize);
      const summary = {
        ready: result.ok,
        custom: result.ok && result.custom === true,
        customReasons: [],
        customReasonLabels: [],
        priceCents: null,
        priceLabel: "",
        unit: "",
        priceText: "",
        lineItems: [],
        totalCents: null,
        oneTime: null,
        note: "",
        errors: result.ok ? [] : result.errors,
        frequencyId: state.frequency,
        frequencyLabel: frequency ? labels[frequency.id] : "",
        dogsLabel: dogsLabel(state.dogCount),
        yardLabel: yard ? yard.label : "",
        areaLabels: state.areas.map(function (id) { return findById(AREAS, id).label; }),
        zip: state.zip,
        zipInArea: checkZip(state.zip).inArea,
        pricingVersion: VERSIONS.pricingVersion
      };
      if (!result.ok) return summary;
      if (result.custom) {
        summary.customReasons = result.reasons.slice();
        summary.customReasonLabels = result.reasons.map(function (code) { return CUSTOM_REASON_LABELS[code]; });
        summary.priceText = "Custom estimate";
        return summary;
      }
      summary.priceCents = result.priceCents;
      summary.totalCents = result.priceCents;
      summary.priceLabel = formatMoney(result.priceCents);
      summary.unit = unitFor(result.frequencyId);
      summary.priceText = summary.priceLabel + " " + summary.unit;
      summary.lineItems = result.lineItems.map(function (item) { return { label: item.label, cents: item.cents, amount: item.amount }; });
      if (result.oneTime) {
        summary.oneTime = { baseCents: ONE_TIME.baseCents, includedMinutes: ONE_TIME.includedMinutes, extraPerMinuteCents: ONE_TIME.extraPerMinuteCents, summary: ONE_TIME.summary };
        summary.note = ONE_TIME.summary;
      } else {
        summary.note = RECURRING_PRICE_NOTE;
      }
      return summary;
    }

    // The fixed "Weekly visits from $19.99" teaser, or null when it must not
    // show: 6 or more dogs (weekly stops at 5), a yard over 1 acre, an
    // out-of-area ZIP, a frequency other than weekly already chosen, or once
    // the exact price (or a custom estimate) is known.
    function fromLine() {
      if (Number(state.dogCount) >= 6) return null;
      if (state.yardSize === "over") return null;
      if (checkZip(state.zip).status === "out_of_area") return null;
      if (state.frequency !== "" && state.frequency !== "weekly") return null;
      if (currentQuote().ok) return null;
      return { text: FROM_LINE.text, cents: FROM_LINE.cents, label: formatMoney(FROM_LINE.cents) };
    }

    // Has the visitor answered anything yet? A ZIP supplied by a city page is
    // not an answer; progress carried over from another page is.
    function hasAnswered() {
      return state.dogCount !== "" || state.yardSize !== "" || state.areas.length > 0 || state.frequency !== "" ||
        (checkZip(state.zip).complete && state.zipSource !== "page");
    }

    // What a pinned price bar should display right now.
    //   visible   false until the first answer (brief section 6), and on the done step
    //   kind      "from" | "exact" | "custom" | "building" | "out_of_area"
    //   headline  default words for that kind (free to restyle)
    //   continueStep / continueEnabled   where its Continue button goes
    function priceBar() {
      const current = quote();
      const teaser = fromLine();
      const zipCheck = checkZip(state.zip);
      const firstIncomplete = firstIncompletePlanStep();
      const pastPlan = PLAN_STEPS.indexOf(state.step) < 0;
      const bar = {
        visible: hasAnswered() && state.step !== "done",
        kind: "building",
        headline: "Finish your plan to see your price",
        priceCents: null,
        priceLabel: "",
        unit: "",
        detail: [current.dogsLabel, current.frequencyLabel, current.yardLabel].filter(Boolean).join(" · "),
        continueStep: firstIncomplete || (pastPlan ? state.step : "price"),
        continueEnabled: !state.submitting && state.locked === null && state.step !== "done"
      };
      if (zipCheck.status === "out_of_area") {
        bar.kind = "out_of_area";
        bar.headline = OUT_OF_AREA_COPY.kicker;
        bar.continueStep = "zip";
      } else if (current.ready && current.custom) {
        bar.kind = "custom";
        bar.headline = "Custom estimate";
      } else if (current.ready) {
        bar.kind = "exact";
        bar.headline = current.priceText;
        bar.priceCents = current.priceCents;
        bar.priceLabel = current.priceLabel;
        bar.unit = current.unit;
      } else if (teaser) {
        bar.kind = "from";
        bar.headline = teaser.text;
        bar.priceCents = teaser.cents;
        bar.priceLabel = teaser.label;
      }
      return bar;
    }

    // The three things a visitor can send (spec 12.3), with whether each is
    // offered right now and why not.
    function intentOptions() {
      const current = currentQuote();
      const planProblems = planErrors(state, labels);
      return INTENTS.map(function (intent) {
        let available = planProblems.length === 0;
        let reason = available ? "" : planProblems[0].message;
        if (available && current.custom && intent.id !== "service_request") {
          available = false;
          reason = MESSAGES.customNeedsServiceRequest;
        }
        return {
          id: intent.id,
          label: intent.id === "service_request" && current.ok && current.custom ? "Request my estimate" : intent.label,
          stage: stageFor(intent.id, current),
          selected: state.intent === intent.id,
          available: available,
          reason: reason
        };
      });
    }

    // Reply methods for an intent. Phone call is not offered for a quote delivery.
    function contactOptions(intent) {
      const forIntent = isValidIntent(intent) ? intent : state.intent;
      return CONTACT_METHODS.map(function (method) {
        const available = !(forIntent === "quote_delivery" && method.id === "call");
        return { id: method.id, label: method.label, selected: state.preferredContact === method.id, available: available, reason: available ? "" : MESSAGES.callNotOffered, needsConsent: method.id === "text" };
      });
    }

    // Rows for "your plan" summaries, each with the step that edits it.
    function planSummary() {
      const current = quote();
      const zipCheck = checkZip(state.zip);
      return [
        { key: "dogs", label: "Dogs", value: current.dogsLabel, step: "dogs" },
        { key: "zip", label: "ZIP", value: zipCheck.inArea ? state.zip + (zipCheck.community ? " · " + zipCheck.community : "") : state.zip, step: "zip" },
        { key: "yard", label: "Yard size", value: current.yardLabel, step: "yard" },
        { key: "areas", label: "Service area", value: current.areaLabels.join(", "), step: "areas" },
        { key: "frequency", label: "Frequency", value: current.frequencyLabel, step: "frequency" },
        { key: "price", label: "Price", value: current.priceText, step: "price" }
      ];
    }

    // Display values for the confirm step. The reply method is shown in words,
    // and the question is included (the live review shows neither properly:
    // spec 13 item 13).
    function requestSummary(intent) {
      const forIntent = isValidIntent(intent) ? intent : state.intent;
      const service = forIntent === "service_request";
      const contact = findById(CONTACT_METHODS, state.preferredContact);
      const status = findById(CUSTOMER_STATUS_OPTIONS, state.customerStatus);
      return {
        intent: forIntent,
        name: (state.firstName.trim() + " " + (service ? state.lastName.trim() : "")).trim(),
        replyBy: contact ? contact.label : "",
        phone: state.phone,
        email: state.email.trim(),
        serviceAddress: service ? state.address.trim() + ", " + state.city.trim() + ", IN " + state.zip : "",
        startTiming: service ? state.startTiming : "",
        lastCleaned: state.lastCleaned,
        customerStatus: status ? status.label : "",
        question: forIntent === "question" ? state.question.trim() : "",
        textConsentGiven: state.preferredContact === "text" && state.smsConsent === true
      };
    }

    // Which offer note applies, in the live order (spec 6.1 and 6.3):
    //   "one_time"       one-time cleanup terms
    //   "custom_review"  custom booking or a yard over 1 acre
    //   "restart"        returning or not-sure customers
    //   "new_recurring"  everyone else: "No start-up fee" for NEW recurring
    //                    customers.
    // WORDING: owner decision of 2026-10-08. The single source for every
    // sentence below is POLICY-WORDING.md in the release root; copy from it,
    // never retype. The kinds and their order are still the live widget's.
    // The sentences are no longer the live widget's, but every number and
    // timing in the restart and one-time notes is: 30 minutes, $1 per minute,
    // $89.99, charged when the on-the-way text goes out
    // (tests/request-form.test.mjs pins both the sentences and the numbers).
    // A new recurring customer's first cleanup includes up to 120 minutes
    // (facts.firstCleanupMinutesAllowance). The $1 per minute for time agreed
    // beyond that is the standing extra-time rate and is the owner's to
    // confirm (CORE-API.md, "Open points for the owner").
    // Rules for anyone editing these sentences: the numbers and timings may
    // not change; nothing may promise a free or unlimited first cleanup; and
    // "offer", "promotion", "waived" and "surcharge" are not used.
    // NOTHING HERE IS SENT ANYWHERE. The payload, its version constants and
    // the consent and terms wording are untouched, and the live Worker, GHL,
    // Terms page and termsVersion still describe the earlier rule: they must
    // change, with the owner's approval, before this wording goes live.
    function offerNote() {
      const current = currentQuote();
      const priced = current.ok && !current.custom;
      if (state.frequency === "onetime") {
        return {
          kind: "one_time",
          title: "One-time cleanup: " + formatMoney(ONE_TIME.baseCents) + " for the first 30 minutes.",
          paragraphs: ["One-time cleanups are priced on their own, separately from recurring service. The $89.99 base is charged when we text that we are on the way. Time beyond 30 minutes is billed after the cleanup at $1 per minute."],
          draftWording: false
        };
      }
      if (state.frequency === "custom" || state.yardSize === "over") {
        return {
          kind: "custom_review",
          title: "Your price needs a custom review.",
          paragraphs: ["We confirm your price and first-cleanup terms before you approve service. Nothing is charged by this form."],
          draftWording: false
        };
      }
      if (state.customerStatus === "returning" || state.customerStatus === "not_sure") {
        return {
          kind: "restart",
          title: "Restarting service: clear cleanup pricing.",
          paragraphs: [
            "Your quoted maintenance rate" + (priced ? " is " + formatMoney(current.priceCents) + " per visit" : " comes next") + ". For your restart cleanup, that rate includes up to 30 minutes. Only time beyond 30 minutes is billed afterward, at $1 per minute.",
            "We confirm your account rate and these terms before you approve service. The base is charged when your on-the-way text goes out. Regular maintenance visits after that stay at the agreed rate however long they take. The no-start-up-fee first cleanup is for households new to Purge Pros; if your history is unclear, we check and tell you which applies before you approve anything."
          ],
          draftWording: false
        };
      }
      return {
        kind: "new_recurring",
        title: "No start-up fee",
        paragraphs: [
          "Your first cleanup is billed at your regular per-visit price, with up to two hours (120 minutes) of cleanup included, even when the yard has built up.",
          "If a yard looks like it needs longer, we tell you before we start and agree the extra time with you first, at $1 per minute.",
          "For households new to Purge Pros, once per household. No minimum number of visits and no cancellation fee."
        ],
        draftWording: false,
        // What the wording above states, for an interface that needs the
        // facts rather than the sentences (spec 6.3; owner decision 2026-10-08).
        facts: {
          appliesTo: "new recurring customers",
          customerStatusKnown: state.customerStatus === "new",
          oncePerHousehold: true,
          teamChecksHistoryFirst: true,
          noMinimumVisits: true,
          noCancellationFee: true,
          regularVisitsStayAtQuotedRate: true,
          firstCleanupMinutesAllowance: 120 // decided by the owner on 2026-10-08
        }
      };
    }

    /* ---- validation, as the interface calls it -------------------------- */

    function chosenIntent(intent) {
      return intent === undefined || intent === null ? state.intent : intent;
    }

    // validatePlan() -> { ok, errors: [{ field, step, code, message }], byField }
    function validatePlan() {
      return errorResult(planErrors(state, labels));
    }

    // validateDetails(intent) -> the request-form errors for that intent,
    // including the form's own ZIP field while it is unfinished (formZipError).
    // The terms box is not part of this; see validateSubmit.
    function validateDetails(intent) {
      return errorResult(formErrors(chosenIntent(intent)));
    }

    // validateSubmit(intent) -> everything that must be right before sending:
    // the plan, the request form and, for a service request, the terms box.
    function validateSubmit(intent) {
      const sending = chosenIntent(intent);
      return errorResult(requestErrors(sending).concat(termsErrors(state, sending)));
    }

    /* ---- the payload and the request id rules --------------------------- */

    function payloadContext(requestId) {
      return {
        requestId: requestId,
        nowIso: nowIso(),
        nowMs: env.now(),
        page: locationPart(env, "href"),
        attribution: state.attribution,
        fbp: env.readCookie("_fbp"),
        fbc: env.readCookie("_fbc"),
        clickSeenMs: attributionFrom === "kept" ? attributionKeptAt : 0
      };
    }

    // buildPayload(intent) -> { ok: true, payload, reused } or { ok: false, errors }.
    // One requestId is reused for retries of an unchanged request; any
    // material change makes a new one (spec 12.4, 17.1 item 13). "Unchanged"
    // is judged by submissionFingerprint, exactly as the live widget does.
    function buildPayload(intent) {
      const sending = chosenIntent(intent);
      const validation = validateSubmit(sending);
      if (!validation.ok) return { ok: false, errors: validation.errors, byField: validation.byField };
      // The fingerprint does not include the id, so it can be taken before one is made.
      const fingerprint = submissionFingerprint(payloadFromState(state, sending, payloadContext("")));
      if (pendingSubmission && pendingSubmission.fingerprint === fingerprint) {
        // Same request as the last attempt: same id, same timestamps, same consent evidence.
        return { ok: true, payload: JSON.parse(JSON.stringify(pendingSubmission.payload)), reused: true };
      }
      // A new request: a new id.
      return { ok: true, payload: payloadFromState(state, sending, payloadContext(env.uuid())), reused: false };
    }

    /* ---- submit ----------------------------------------------------------- */

    function failure(status, message, extra) {
      return Object.assign({
        ok: false,
        status: status,
        message: message,
        retryAllowed: false,
        locked: false,
        fieldErrors: [],
        formErrors: [],
        requestId: "",
        httpStatus: 0,
        demo: mode === "demo"
      }, extra || {});
    }

    // Turns a server reply into a result (spec 4.5.2). `reply` is
    // { httpStatus, body } where body is the parsed JSON (or {}).
    function interpretSubmitReply(reply, payload) {
      const body = reply.body && typeof reply.body === "object" ? reply.body : {};
      const requestId = typeof body.requestId === "string" && body.requestId ? body.requestId : payload.requestId;
      const serverMessage = typeof body.message === "string" ? body.message : "";

      // Uncertain, or the same id with different details: lock. No further
      // editing or resubmitting; the visitor is asked to call (spec 17.1 item 14).
      if (body.code === "SUBMISSION_UNCERTAIN" || body.code === "REQUEST_ID_CONFLICT" || reply.httpStatus === 409) {
        const code = body.code === "REQUEST_ID_CONFLICT" ? "REQUEST_ID_CONFLICT" : "SUBMISSION_UNCERTAIN";
        return failure("locked", serverMessage || SUBMIT_MESSAGES.lockedFallback, { locked: true, code: code, requestId: requestId, httpStatus: reply.httpStatus });
      }
      const accepted = reply.httpStatus >= 200 && reply.httpStatus < 300 && body.accepted !== false;
      if (accepted) return { ok: true, status: "success", requestId: requestId, reference: requestId, httpStatus: reply.httpStatus, demo: mode === "demo" };

      // Server-side validation: highlight the fields it names (the live tool does not).
      if (reply.httpStatus === 400 && Array.isArray(body.fields)) {
        const mapped = mapServerFields(body.fields);
        return failure("server_invalid", serverMessage || SUBMIT_MESSAGES.invalid, { retryAllowed: true, fieldErrors: mapped.fieldErrors, formErrors: mapped.formErrors, serverFields: body.fields.slice(), requestId: requestId, httpStatus: 400 });
      }
      if (body.code === "SUBMISSION_UNAVAILABLE" || reply.httpStatus === 503) {
        return failure("unavailable", serverMessage || SUBMIT_MESSAGES.unavailable, { retryAllowed: true, code: "SUBMISSION_UNAVAILABLE", requestId: requestId, httpStatus: reply.httpStatus });
      }
      // Anything else (403 Forbidden, 413, 415, 500...): a plain message for the
      // visitor. The server's own text is kept for debugging, not for display
      // (the live tool shows raw text such as "Forbidden": spec 13 item 11).
      return failure("rejected", SUBMIT_MESSAGES.rejected, { retryAllowed: true, serverMessage: serverMessage, requestId: requestId, httpStatus: reply.httpStatus });
    }

    // The canned replies demo mode plays back. Wording is the Worker's.
    function demoSubmitReply(outcome, payload) {
      const id = payload.requestId;
      if (outcome === "invalid") return { httpStatus: 400, body: { accepted: false, message: SUBMIT_MESSAGES.invalid, fields: demo.invalidFields.slice() } };
      if (outcome === "uncertain") return { httpStatus: 409, body: { accepted: false, code: "SUBMISSION_UNCERTAIN", requestId: id, message: SUBMIT_MESSAGES.uncertain.replace("{requestId}", id) } };
      if (outcome === "conflict") return { httpStatus: 409, body: { accepted: false, code: "REQUEST_ID_CONFLICT", requestId: id, message: SUBMIT_MESSAGES.conflict.replace("{requestId}", id) } };
      if (outcome === "unavailable") return { httpStatus: 503, body: { accepted: false, code: "SUBMISSION_UNAVAILABLE", requestId: id, message: SUBMIT_MESSAGES.unavailable } };
      if (outcome === "forbidden") return { httpStatus: 403, body: { accepted: false, message: "Forbidden" } };
      return { httpStatus: 202, body: { accepted: true, requestId: id } };
    }

    // Demo: no network at all. Waits briefly, then plays the chosen outcome.
    function sendDemo(payload) {
      const outcome = demo.submit;
      log("info", "Purge Pros demo submission", payload);
      const delay = outcome === "slow" ? Math.max(demo.delayMs, 4000) : demo.delayMs;
      return env.wait(delay).then(function () {
        if (outcome === "timeout") return failure("timeout", SUBMIT_MESSAGES.timeout, { retryAllowed: true, requestId: payload.requestId });
        if (outcome === "network") return failure("network", SUBMIT_MESSAGES.network, { retryAllowed: true, requestId: payload.requestId });
        return interpretSubmitReply(demoSubmitReply(outcome, payload), payload);
      });
    }

    // The one place a network request is made (live and staging modes only).
    // POSTs JSON without cookies and ALWAYS settles: with the reply, with a
    // failure, or with a timeout after `timeoutMs` even if the request itself
    // never answers. It never rejects. Resolves to one of:
    //   { httpStatus, ok, text }       the server answered
    //   { timedOut: true }             no answer in time (the request is aborted)
    //   { failed: true, errorText }    the request could not be made
    function postJson(url, body, timeoutMs, extraInit, kind) {
      networkLog.push({ at: nowIso(), url: url, kind: kind });
      return new Promise(function (resolve) {
        const controller = env.AbortController ? new env.AbortController() : null;
        const request = Object.assign({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "omit" }, extraInit || {});
        if (controller) request.signal = controller.signal;
        let settled = false;
        let timer = null;
        function settle(outcome) {
          if (settled) return;
          settled = true;
          if (timer !== null) env.clearTimeout(timer);
          resolve(outcome);
        }
        timer = env.setTimeout(function () {
          if (settled) return;
          if (controller) controller.abort();
          settle({ timedOut: true });
        }, timeoutMs);
        // Inside a promise chain, so a fetch that throws at once is handled
        // like any other network failure.
        Promise.resolve().then(function () {
          return env.fetch(url, request);
        }).then(function (response) {
          return response.text().then(function (text) {
            settle({ httpStatus: response.status, ok: response.ok === true, text: text });
          });
        }).catch(function (error) {
          if (error && error.name === "AbortError") settle({ timedOut: true });
          else settle({ failed: true, errorText: error && error.message ? String(error.message) : "" });
        });
      });
    }

    // Live: POST JSON, no cookies, aborted after 15 seconds (spec 12.1).
    function sendLive(payload) {
      return postJson(endpoint, payload, SUBMIT_TIMEOUT_MS, null, "submit").then(function (answer) {
        if (answer.timedOut) return failure("timeout", SUBMIT_MESSAGES.timeout, { retryAllowed: true, requestId: payload.requestId });
        // Never show the browser's own text ("Failed to fetch") to a visitor.
        if (answer.failed) return failure("network", SUBMIT_MESSAGES.network, { retryAllowed: true, requestId: payload.requestId, serverMessage: answer.errorText });
        // An empty or unreadable body counts as the HTTP status says (as the live tool does).
        let body = { accepted: answer.ok, requestId: payload.requestId };
        if (answer.text) {
          try { body = JSON.parse(answer.text); } catch (_) { body = { accepted: answer.ok, requestId: payload.requestId }; }
        }
        return interpretSubmitReply({ httpStatus: answer.httpStatus, body: body }, payload);
      });
    }

    // submit(intent) -> a promise of ONE result object. It never rejects.
    //   { ok: true,  status: "success", requestId, reference, payload, demo }
    //   { ok: false, status, message, retryAllowed, locked, fieldErrors, formErrors, ... }
    // status is one of: "busy", "locked", "invalid", "blocked", "server_invalid",
    // "unavailable", "rejected", "timeout", "network".
    // While sending, state.submitting is true: disable every control and the
    // close button, and show and announce SUBMIT_MESSAGES.sending (spec 4.5.2 step 5).
    function submit(intent) {
      // 1. One request at a time.
      if (state.submitting) return Promise.resolve(failure("busy", SUBMIT_MESSAGES.sending));
      // 2. After an uncertain reply the form stays locked until the page reloads.
      if (state.locked) return Promise.resolve(failure("locked", state.locked.message, { locked: true, code: state.locked.code, requestId: state.locked.requestId }));
      if (state.step === "done") return Promise.resolve(failure("busy", "This request is complete. Call reset() to start a new one."));

      // 3. Make the intent current, then check everything again.
      const sending = chosenIntent(intent);
      if (sending !== state.intent) set({ intent: sending });
      // An out-of-area ZIP, an incomplete plan or form, or an unticked terms
      // box all stop here: nothing is built and nothing is sent.
      const built = buildPayload(sending);
      if (!built.ok) {
        reportValidationFailed(errorFields(built.errors), "form", ""); // a refused Send (T20)
        return Promise.resolve(failure("invalid", built.errors[0].message, { fieldErrors: built.errors }));
      }
      // The request is complete and on its way: an areas answer changed on
      // this very screen, and not counted yet, is settled now (T17).
      reportAreasChoice();

      // 4. Refuse to pretend. Live mode only from an allowed https origin;
      //    demo mode never on a real Purge Pros origin.
      const blockedReason = sendBlockedReason();
      if (blockedReason) {
        log("warn", "[PPQuoteCore] submit refused: " + blockedReason);
        return Promise.resolve(failure("blocked", sends ? SUBMIT_MESSAGES.blockedLive : SUBMIT_MESSAGES.blockedDemo, { reason: blockedReason }));
      }

      // 5. Remember this attempt (memory only) so a retry reuses the same id.
      const payload = built.payload;
      pendingSubmission = { fingerprint: submissionFingerprint(payload), payload: JSON.parse(JSON.stringify(payload)) };
      // The inspectable log keeps the whole payload in demo mode only. In live
      // mode it keeps just the request id: no second copy of contact details.
      if (mode === "demo") submissionLog.push({ at: nowIso(), demo: true, outcome: demo.submit, payload: JSON.parse(JSON.stringify(payload)) });
      else submissionLog.push({ at: nowIso(), demo: false, outcome: mode, requestId: payload.requestId });

      const beforeSending = stateBefore();
      state.submitting = true;
      commit("submitting", beforeSending, [], null);

      const sent = sends ? sendLive(payload) : sendDemo(payload);
      return sent.then(function (result) {
        const beforeReply = stateBefore();
        state.submitting = false;
        result.payload = payload;
        if (result.ok) {
          const current = quote();
          state.receipt = {
            requestId: result.requestId,
            intent: payload.intent,
            stage: payload.stage,
            custom: current.custom,
            oneTime: current.oneTime !== null,
            priceCents: current.priceCents,
            priceText: current.priceText,
            frequencyId: payload.frequencyId,
            preferredContact: payload.preferredContact,
            replyWhere: findById(CONTACT_METHODS, payload.preferredContact).successWhere
          };
          trackSuccess(payload, result.requestId);
          clearProgress();
          pendingSubmission = null;
          savedLink = null;
          state.editReturn = "";
          state.resumeNotice = "";
          state.step = "done";
          stepShown("done");
          commit("submitted", beforeReply, [], "done");
          return result;
        }
        if (result.locked) state.locked = { code: result.code, message: result.message, requestId: result.requestId };
        commit("submit_failed", beforeReply, [], null);
        // The server refused fields the form had accepted (T20).
        if (result.status === "server_invalid") reportValidationFailed(errorFields(result.fieldErrors), "server", "");
        return result;
      }).catch(function (error) {
        // Should be unreachable. If anything above throws, the form must not
        // be left stuck in its sending state.
        log("warn", "[PPQuoteCore] submit failed unexpectedly", error);
        const beforeRecovery = stateBefore();
        state.submitting = false;
        commit("submit_failed", beforeRecovery, [], null);
        return failure("rejected", SUBMIT_MESSAGES.rejected, { retryAllowed: true, requestId: payload.requestId, payload: payload });
      });
    }

    /* ---- save and resume (spec section 8) -------------------------------- */

    let saveLinkBusy = false;

    function resumeEndpoint(opening) {
      return endpoint.replace(/\/submit$/, opening ? "/quote-resume/open" : "/quote-resume");
    }

    // One POST to a save-link endpoint: JSON, no cookies, no referrer, aborted
    // after 12 seconds. Resolves to { httpStatus, body } or { timedOut: true }
    // or { failed: true }.
    function resumeFetch(body, opening) {
      const extraInit = { cache: "no-store", referrerPolicy: "no-referrer", redirect: "error" };
      return postJson(resumeEndpoint(opening), body, SAVE_LINK_TIMEOUT_MS, extraInit, opening ? "resume" : "save-link").then(function (answer) {
        if (answer.timedOut || answer.failed) return answer;
        let parsed = {};
        try { parsed = JSON.parse(answer.text); } catch (_) { parsed = {}; }
        return { httpStatus: answer.httpStatus, body: parsed };
      });
    }

    // A 43-character token for demo links. Not a real token; it opens nothing.
    function demoToken() {
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      let token = "DEMO_";
      while (token.length < 43) token += alphabet.charAt(Math.floor(env.random() * alphabet.length));
      return token;
    }

    function demoSaveReply(body) {
      const outcome = demo.save;
      if (outcome === "timeout") return { timedOut: true };
      if (outcome === "rate_limited") return { httpStatus: 429, body: { ok: false, code: "RATE_LIMITED", message: SAVE_LINK_MESSAGES.rateLimited } };
      if (outcome === "unavailable") return { httpStatus: 503, body: { ok: false, code: "UNAVAILABLE", message: SAVE_LINK_MESSAGES.unavailable } };
      if (outcome === "invalid") return { httpStatus: 400, body: { ok: false, code: "INVALID_REQUEST", message: SAVE_LINK_MESSAGES.rejected } };
      if (outcome === "bad_link") return { httpStatus: 201, body: { ok: true, url: "https://example.invalid/not-a-plan-link", expiresAt: env.now() } };
      const token = demoToken();
      demoSavedPlans[token] = JSON.parse(JSON.stringify(body));
      return { httpStatus: 201, body: { ok: true, url: SAVE_LINK_PREFIX + token, expiresAt: env.now() + 7 * 24 * 60 * 60 * 1000 } };
    }

    function saveFailure(status, message, body) {
      return { ok: false, status: status, url: "", expiresAt: null, message: message, body: body, demo: mode === "demo" };
    }

    function interpretSaveReply(reply, body) {
      if (reply.timedOut) return saveFailure("timeout", SAVE_LINK_MESSAGES.timeout, body);
      if (reply.failed) return saveFailure("failed", SAVE_LINK_MESSAGES.fallback, body);
      const answer = reply.body && typeof reply.body === "object" ? reply.body : {};
      const okStatus = reply.httpStatus >= 200 && reply.httpStatus < 300;
      if (!okStatus || answer.ok !== true) {
        const message = typeof answer.message === "string" && answer.message ? answer.message : SAVE_LINK_MESSAGES.fallback;
        const status = reply.httpStatus === 429 ? "rate_limited" : reply.httpStatus === 503 ? "unavailable" : reply.httpStatus === 400 ? "rejected" : "failed";
        return saveFailure(status, message, body);
      }
      // Only a link of the one fixed form is accepted (spec 8.1 step 2).
      // (Staging also accepts a link on the staging page's own address: isSaveLink.)
      if (typeof answer.url !== "string" || !isSaveLink(answer.url)) return saveFailure("bad_link", SAVE_LINK_MESSAGES.badLink, body);
      return { ok: true, status: "created", url: answer.url, expiresAt: answer.expiresAt || null, message: SAVE_LINK_MESSAGES.created, body: body, reused: false, demo: mode === "demo" };
    }

    // createSaveLink() -> a promise of { ok, status, url, expiresAt, message, body, demo }.
    // The body sent is exactly six keys (see saveLinkBody). No contact details,
    // nothing is sent to the team. A link belongs to one exact plan: asking
    // again for the same plan returns the same link; a reply that arrives
    // after the plan changed is discarded (status "stale").
    // Copying to the clipboard is the interface's job; the status lines are
    // in SAVE_LINK_MESSAGES.
    function createSaveLink() {
      const body = saveLinkBody(state);
      if (state.submitting || state.locked || state.step === "done") return Promise.resolve(saveFailure("busy", SAVE_LINK_MESSAGES.fallback, body));
      const problems = planErrors(state, labels);
      if (problems.length) {
        // Never a save link for an incomplete plan or an out-of-area ZIP.
        const notReady = saveFailure("not_ready", SAVE_LINK_MESSAGES.notReady, body);
        notReady.errors = problems;
        return Promise.resolve(notReady);
      }
      const fingerprint = JSON.stringify(body);
      if (savedLink && savedLink.fingerprint === fingerprint) {
        return Promise.resolve({ ok: true, status: "created", url: savedLink.url, expiresAt: savedLink.expiresAt, message: SAVE_LINK_MESSAGES.created, body: body, reused: true, demo: mode === "demo" });
      }
      if (saveLinkBusy) return Promise.resolve(saveFailure("busy", SAVE_LINK_MESSAGES.working, body));
      const blockedReason = sendBlockedReason();
      if (blockedReason) return Promise.resolve(saveFailure("blocked", SAVE_LINK_MESSAGES.blocked, body));

      saveLinkBusy = true;
      submissionLog.push({ at: nowIso(), demo: mode === "demo", kind: "save-link", outcome: mode === "demo" ? demo.save : mode, body: JSON.parse(JSON.stringify(body)) });
      const attempt = sends ? resumeFetch(body, false) : env.wait(demo.delayMs).then(function () { return demoSaveReply(body); });
      return attempt.then(function (reply) {
        saveLinkBusy = false;
        if (JSON.stringify(saveLinkBody(state)) !== fingerprint) return saveFailure("stale", SAVE_LINK_MESSAGES.idle, body);
        const result = interpretSaveReply(reply, body);
        if (result.ok) {
          savedLink = { fingerprint: fingerprint, url: result.url, expiresAt: result.expiresAt };
          // TRACKING CHANGE APPROVED BY THE OWNER 2026-10-09 (T14): a save link
          // that was created is counted once, on both sinks, with no
          // parameter beyond ui_version: nothing of the plan, the ZIP or the
          // link itself. Asking again for the same plan hands back the same
          // link and counts nothing; a failed, refused or discarded attempt
          // counts nothing; a changed plan gets a new link and one new count.
          emitMeasurement("quote_link_saved", {});
          sendPixelCount("QuoteLinkSaved", {});
        }
        return result;
      });
    }

    function demoResumeReply(token) {
      const outcome = demo.resume;
      if (outcome === "timeout") return { timedOut: true };
      if (outcome === "expired") return { httpStatus: 404, body: { ok: false, code: "LINK_UNAVAILABLE", message: RESUME_MESSAGES.expired } };
      if (outcome === "plan_unavailable") return { httpStatus: 409, body: { ok: false, code: "PLAN_UNAVAILABLE", message: RESUME_MESSAGES.planUnavailable } };
      if (outcome === "rate_limited") return { httpStatus: 429, body: { ok: false, code: "RATE_LIMITED", message: SAVE_LINK_MESSAGES.rateLimited } };
      if (outcome === "unavailable") return { httpStatus: 503, body: { ok: false, code: "UNAVAILABLE", message: SAVE_LINK_MESSAGES.unavailable } };
      const plan = JSON.parse(JSON.stringify(hasOwn(demoSavedPlans, token) ? demoSavedPlans[token] : DEMO_RESUME_PLAN));
      const priced = calculateQuote(plan);
      const summary = { custom: priced.ok && priced.custom === true, priceCents: priced.ok && !priced.custom ? priced.priceCents : null, pricingVersion: VERSIONS.pricingVersion };
      // "mismatch" plays a reply whose price differs from the local calculation.
      if (outcome === "mismatch" && summary.priceCents !== null) summary.priceCents += 100;
      if (outcome === "mismatch" && summary.priceCents === null) summary.pricingVersion = "changed";
      return { httpStatus: 200, body: { ok: true, plan: plan, quote: summary, pricingChanged: outcome === "changed", expiresAt: env.now() + 24 * 60 * 60 * 1000 } };
    }

    // The saved plan is checked again locally before it is used (spec 8.2
    // step 4): exactly the six keys, a ZIP still accepted, valid dogs, status
    // and areas, and a local price equal to the one the Worker reports.
    // Returns "" when the plan is good, otherwise the notice to show.
    function resumedPlanProblem(answer) {
      const plan = answer.plan;
      const keysRight = plan && typeof plan === "object" && Object.keys(plan).length === SAVE_LINK_KEYS.length &&
        Object.keys(plan).every(function (key) { return SAVE_LINK_KEYS.indexOf(key) >= 0; });
      if (!keysRight) return RESUME_MESSAGES.localCheckFailed;
      const areasRight = Array.isArray(plan.areaIds) && plan.areaIds.length > 0 && cleanAreas(plan.areaIds).length === plan.areaIds.length;
      if (typeof plan.zip !== "string" || SERVICE_ZIPS.indexOf(plan.zip) < 0 || !Number.isInteger(plan.dogs) ||
          !findById(CUSTOMER_STATUS_OPTIONS, plan.customerStatus) || !areasRight) return RESUME_MESSAGES.localCheckFailed;
      const local = calculateQuote(plan);
      const reported = answer.quote;
      if (!local.ok || !reported || reported.pricingVersion !== VERSIONS.pricingVersion || local.custom !== reported.custom ||
          (!local.custom && local.priceCents !== reported.priceCents)) return RESUME_MESSAGES.priceMismatch;
      return "";
    }

    // resume(token) opens a saved plan. -> a promise of { ok, status, notice, pricingChanged }.
    // Whatever happens: nothing is submitted, no intent is chosen, no
    // price_viewed or conversion event fires, and no contact detail, consent,
    // terms acceptance or request id is restored (spec 8.2).
    // Customer status is NEVER pre-selected from a saved plan; it is asked
    // fresh in the request step (spec section 14 item 1).
    // While loading, state.resumeLoading is true: show RESUME_MESSAGES.loadingTitle.
    // Afterwards state.resumeNotice holds the notice to show and focus; it
    // clears itself when the visitor moves on or changes the plan.
    function resume(token) {
      if (state.submitting || state.locked) return Promise.resolve({ ok: false, status: "busy", notice: "", pricingChanged: false });
      resumeSequence += 1;
      const sequence = resumeSequence;
      // Everything from here to the first call to the subscribers is ONE
      // change: the answers are cleared and the loading state (or the failure
      // notice) is set.
      const beforeOpening = stateBefore();

      // Opening a saved link starts clean (spec 8.2 step 2).
      clearProgress();
      pendingSubmission = null;
      savedLink = null;
      startFresh("resume");
      newQuoteCounts();

      function fail(status, notice, before) {
        state.resumeLoading = false;
        state.resumeNotice = notice;
        commit("resume_failed", before, [], null);
        return { ok: false, status: status, notice: notice, pricingChanged: false };
      }

      if (typeof token !== "string" || !RESUME_TOKEN_PATTERN.test(token)) return Promise.resolve(fail("invalid_token", RESUME_MESSAGES.invalidToken, beforeOpening));
      const blockedReason = sendBlockedReason();
      if (blockedReason) return Promise.resolve(fail("blocked", RESUME_MESSAGES.fallback, beforeOpening));

      state.resumeLoading = true;
      commit("resume_loading", beforeOpening, [], null);

      const attempt = sends ? resumeFetch({ token: token }, true) : env.wait(demo.delayMs).then(function () { return demoResumeReply(token); });
      return attempt.then(function (reply) {
        if (sequence !== resumeSequence) return { ok: false, status: "stale", notice: "", pricingChanged: false };
        const beforeReply = stateBefore();
        if (reply.timedOut) return fail("timeout", RESUME_MESSAGES.timeout, beforeReply);
        if (reply.failed) return fail("failed", RESUME_MESSAGES.fallback, beforeReply);
        const answer = reply.body && typeof reply.body === "object" ? reply.body : {};
        if (reply.httpStatus !== 200 || answer.ok !== true) {
          const status = reply.httpStatus === 404 ? "expired" : reply.httpStatus === 409 ? "plan_unavailable" : reply.httpStatus === 429 ? "rate_limited" : reply.httpStatus === 503 ? "unavailable" : "failed";
          return fail(status, typeof answer.message === "string" && answer.message ? answer.message : RESUME_MESSAGES.fallback, beforeReply);
        }
        const problem = resumedPlanProblem(answer);
        if (problem) return fail(problem === RESUME_MESSAGES.priceMismatch ? "mismatch" : "plan_invalid", problem, beforeReply);

        // Load the plan and show the price step with the notice.
        const plan = answer.plan;
        state.zip = plan.zip;
        state.zipSource = "resume";
        state.dogCount = String(plan.dogs);
        state.frequency = plan.frequencyId;
        state.yardSize = plan.yardSizeId;
        state.areas = cleanAreas(plan.areaIds);
        state.customerStatus = ""; // never pre-selected from a saved plan
        syncCityWithZip();
        state.step = "price";
        state.resumeLoading = false;
        state.resumeNotice = answer.pricingChanged === true ? RESUME_MESSAGES.pricingChanged : RESUME_MESSAGES.ready;
        // No price_viewed and no step event for a resumed plan; its areas
        // were not chosen here either (T17).
        lastAreasCountReported = state.areas.length;
        lastPriceViewedKey = planKey();
        lastStepReported = "price";
        stepsReportedOnThisScreen = { price: true };
        saveProgress();
        commit("resumed", beforeReply, [], "price");
        return { ok: true, status: "resumed", notice: state.resumeNotice, pricingChanged: answer.pricingChanged === true };
      });
    }

    /* ---- starting and starting again ------------------------------------- */

    // Builds a fresh state. kind is "create", "reset" or "resume".
    // Saved progress is read only when the store is created (spec 9.1: read
    // once per page load).
    function startFresh(kind) {
      state = freshState();
      state.attribution = captureAttribution();
      if (kind === "create") {
        const saved = readProgress();
        if (saved) {
          PERSISTED_PLAN_KEYS.forEach(function (key) { state[key] = saved[key]; });
          if (state.zip) state.zipSource = "storage";
        }
      }
      // A city page's own ZIP fills in only when the visitor has not given one.
      if (!state.zip && checkZip(pageZip).inArea) {
        state.zip = pageZip;
        state.zipSource = "page";
      }
      syncCityWithZip();
      // Reconcile restored answers (spec 4.2.2).
      const reconciled = reconcileFrequency({ dogCount: "", yardSize: "" }, state, labels);
      state.frequency = reconciled.frequency;
      if (reconciled.notice && kind === "create") initialNotices.push(reconciled.notice);
      // Areas carried in from another page were counted there (T17).
      lastAreasCountReported = state.areas.length;
      cachedSnapshot = null;
    }

    // A new quote starts: what was counted once per quote may be counted again.
    function newQuoteCounts() {
      lastChoiceReported = "";
      areasAnswerPending = false;
      lastAreasCountReported = state.areas.length;
      requestStepNow = "";
      requestStepsViewed = {};
      requestStepsCompleted = {};
      lastValidationReported = "";
    }

    // Clears every answer, the saved progress and anything remembered about a
    // request, and starts again at the first question. The caller commits.
    function startOver() {
      resumeSequence += 1;
      pendingSubmission = null;
      savedLink = null;
      clearProgress();
      startFresh("reset");
      lastStepReported = "";
      lastPriceViewedKey = "";
      newQuoteCounts();
      stepsReportedOnThisScreen = {};
    }

    // reset() clears every answer and the saved progress and starts again.
    // Call it when the visitor leaves the done step. Returns false (and does
    // nothing) while a request is being sent or after a locked reply: only a
    // page reload clears a lock (spec 4.5.2). The subscribers are told once,
    // with info.changed naming every field that is now different.
    function reset() {
      if (state.submitting || state.locked) return false;
      const before = stateBefore();
      startOver();
      commit("reset", before, [], "dogs");
      return true;
    }

    // Takes one parameter out of the page address (history.replaceState), so
    // a one-time instruction is not read again by a refresh. Everything else
    // in the address, attribution included, stays.
    function removeFromAddress(name) {
      const search = locationPart(env, "search");
      if (!search || !env.history || typeof env.history.replaceState !== "function") return;
      try {
        const params = new URLSearchParams(search);
        if (!params.has(name)) return;
        params.delete(name);
        const rest = params.toString();
        env.history.replaceState(env.history.state, "", locationPart(env, "pathname") + (rest ? "?" + rest : "") + locationPart(env, "hash"));
      } catch (_) { /* the address stays as it is; the rule below still protects the visitor's own ZIP */ }
    }

    // ---- first run ----
    startFresh("create");
    if (pageZip && !checkZip(pageZip).inArea) log("warn", "[PPQuoteCore] pageZip " + pageZip + " is not an accepted ZIP and was ignored.");
    // TRACKING CHANGE APPROVED BY THE OWNER 2026-10-09 (T6): a ZIP that is handed over
    // is counted once per ZIP, and a ?zip= in the page URL is honoured on its
    // own. (The live tool counts every open({ zip }) call, and on a site page
    // reads ?zip= only beside an open instruction.)
    // A ZIP in the page URL (?zip=46032) comes from a hero ZIP form or a link
    // built for it, so it is treated like PurgeProsQuote.open({ zip }): once.
    //   - It is a ONE-TIME instruction: it is taken out of the address as soon
    //     as it is read, so a refresh cannot apply it or count it again.
    //   - Where the address cannot be rewritten, a ZIP the visitor already has
    //     from saved progress is their own later answer and wins, unless this
    //     page load is clearly a new arrival: an open instruction beside it
    //     (?open_quote=1, #quote) or a browser that reports a fresh navigation.
    const urlZip = String(queryParam(env, "zip") || "").trim();
    if (/^\d{5}$/.test(urlZip)) {
      const asked = addressAsksToOpen(locationPart(env, "search"), locationPart(env, "hash"));
      let arrival = "";
      try { arrival = typeof env.navigationType === "function" ? String(env.navigationType() || "") : ""; } catch (_) { arrival = ""; }
      const refreshed = arrival === "reload" || arrival === "back_forward";
      const hasOwnZip = state.zipSource === "storage";
      if (!refreshed && (!hasOwnZip || asked.query || asked.hash || arrival === "navigate")) applySuppliedZip(urlZip, "url", []);
      removeFromAddress("zip");
    }
    cachedSnapshot = null;
    if (mode === "demo") log("info", "[PPQuoteCore] DEMO mode: nothing is sent anywhere. Demo switches:", demo);

    return {
      mode: mode,
      isDemo: mode === "demo",
      isStaging: mode === "staging",
      // The request address in use ("" in demo mode). Nothing secret.
      endpoint: sends ? endpoint : "",
      // Demo switches. Change them at any time: store.demo.submit = "timeout".
      demo: demo,
      setDemo: function (switches) { applyDemoSwitches(switches); return demo; },
      frequencyLabels: Object.assign({}, labels),

      // state
      getState: getState,
      set: set,
      subscribe: subscribe,
      reset: reset,
      toggleArea: toggleArea,
      toggleAllAreas: toggleAllAreas,
      open: open,
      close: close,

      // flow
      flow: flow,
      goTo: goTo,
      edit: edit,
      next: next,
      back: back,
      reportStepShown: reportStepShown,

      // what to show
      checkZip: function (zip) { return checkZip(zip === undefined ? state.zip : zip); },
      frequencyOptions: frequencyOptions,
      quote: quote,
      fromLine: fromLine,
      priceBar: priceBar,
      intentOptions: intentOptions,
      contactOptions: contactOptions,
      fieldRules: function (intent) { return fieldRules(state, chosenIntent(intent)); },
      planSummary: planSummary,
      requestSummary: requestSummary,
      offerNote: offerNote,

      // validation
      validatePlan: validatePlan,
      validateDetails: validateDetails,
      validateSubmit: validateSubmit,
      mapServerFields: mapServerFields,

      // sending
      buildPayload: buildPayload,
      submit: submit,
      createSaveLink: createSaveLink,
      resume: resume,
      // "" when sending is allowed from this page, otherwise why not.
      sendingBlockedReason: sendBlockedReason,

      // tracking and logs
      track: track,
      trackUi: trackUi,
      attributionSource: attributionSource,
      trackLog: trackLog,
      submissionLog: submissionLog,
      networkLog: networkLog,
      initialNotices: initialNotices
    };
  }

  // One store for the whole page. The first call creates it (with these
  // options); every later call returns the same store.
  let sharedStore = null;
  function shared(options) {
    if (!sharedStore) sharedStore = create(options);
    return sharedStore;
  }

  /* ---- the page's send switch: window.PPSite -> create() options ----------
   * A page that may send says so in ONE object, set before the scripts load
   * (CORE-API.md section 13 lists every key):
   *   window.PPSite = { mode: "live" | "staging" | "demo", endpoint, allowedOrigins,
   *                     savedLinkBase, googleAdsSendTo, firePixelEvents, ... }
   * siteOptions(site, trusted) turns it into the options create() understands
   * and decides everything a page must not be able to decide for itself.
   * "trusted" comes from the INTERFACE's own code, never from the page:
   *   trusted.liveEndpoints  the production request addresses, the first one
   *                          being the default. (This file names no endpoint.)
   *   live     the request address is one of trusted.liveEndpoints (the
   *            page's own "endpoint" is used only when it IS one of them),
   *            and the page's "allowedOrigins" is ignored: live runs only on
   *            the engine's own LIVE_ALLOWED_ORIGINS (or the Worker's own
   *            host). With no trusted address there is no live mode: {}.
   *   staging  the page's endpoint (a production address is refused by the
   *            store), from LIVE_ALLOWED_ORIGINS plus the page's https
   *            origins; no tag is ever called; savedLinkBase is honoured.
   *   else     {} : demo, exactly as with no PPSite at all.
   * Never throws. An interface merges the result into its own options:
   *   C.shared(Object.assign({ presentation: "inline" }, C.siteOptions(window.PPSite, { liveEndpoints: [...] })))
   */
  function isSubmitAddress(value) {
    return typeof value === "string" && /^https:\/\/[^\/\s?#@]+\/submit$/.test(value);
  }
  function httpsOrigin(value) {
    const match = /^https:\/\/[^\/\s?#@]+$/.exec(typeof value === "string" ? value.trim().replace(/\/$/, "") : "");
    return match ? match[0].toLowerCase() : "";
  }
  function isGoogleAdsSendTo(value) {
    return typeof value === "string" && /^AW-\d{6,}\/[A-Za-z0-9_-]{6,}$/.test(value);
  }
  function siteOptions(site, trusted) {
    const given = site && typeof site === "object" ? site : {};
    const liveEndpoints = (trusted && Array.isArray(trusted.liveEndpoints) ? trusted.liveEndpoints : []).filter(isSubmitAddress);
    const mode = given.mode === "live" ? "live" : given.mode === "staging" ? "staging" : "demo";
    if (mode === "demo" || (mode === "live" && !liveEndpoints.length)) return {};
    const options = { mode: mode };
    // The label is public and has one known value (the engine's default). A
    // page may hand over another well-formed one, or "" to switch it off.
    if (hasOwn(given, "googleAdsSendTo") && (given.googleAdsSendTo === "" || isGoogleAdsSendTo(given.googleAdsSendTo))) options.googleAdsSendTo = given.googleAdsSendTo;
    if (given.firePixelEvents === false) options.firePixelEvents = false;
    if (mode === "live") {
      options.endpoint = liveEndpoints.indexOf(given.endpoint) >= 0 ? given.endpoint : liveEndpoints[0];
      return options;
    }
    // Staging. (Tags are logged only, never called, whatever the two settings above say.)
    options.endpoint = typeof given.endpoint === "string" ? given.endpoint.trim() : "";
    options.productionEndpoints = liveEndpoints.slice();
    const origins = LIVE_ALLOWED_ORIGINS.slice();
    (Array.isArray(given.allowedOrigins) ? given.allowedOrigins : []).forEach(function (value) {
      const origin = httpsOrigin(value);
      if (origin && origins.indexOf(origin) < 0) origins.push(origin);
    });
    options.allowedOrigins = origins;
    if (typeof given.savedLinkBase === "string" && given.savedLinkBase.trim()) options.savedLinkBase = given.savedLinkBase.trim();
    return options;
  }

  /* ======================================================================
   * 14. EXACT WORDING WITH LINKS
   *     Turns a CONSENT or TERMS sentence into parts an interface can render
   *     without retyping a word: [{ text }, { text, href }, ...]. Links open
   *     in a new tab (spec 4.4.1 and 4.5).
   * ==================================================================== */

  function linkParts(template, linkText) {
    const parts = [];
    template.split(/(\{privacy\}|\{terms\})/).forEach(function (piece) {
      if (piece === "{privacy}") parts.push({ text: linkText.privacy, href: BRAND.privacyUrl });
      else if (piece === "{terms}") parts.push({ text: linkText.terms, href: BRAND.termsUrl });
      else if (piece) parts.push({ text: piece });
    });
    return parts;
  }

  const wording = {
    // The line that always sits next to the consent box.
    consentAlternativeParts: function (callIsOffered) {
      return linkParts(callIsOffered === false ? CONSENT.alternativeWithoutCall : CONSENT.alternativeWithCall, { privacy: CONSENT.privacyLinkText, terms: CONSENT.termsLinkText });
    },
    // The terms checkbox label for a service request.
    termsParts: function (isOneTime) {
      return linkParts(isOneTime === true ? TERMS.oneTime : TERMS.recurring, { privacy: TERMS.privacyLinkText, terms: TERMS.termsLinkText });
    },
    // The line shown instead of the terms box for a quote delivery or a question.
    otherIntentsParts: function () {
      return linkParts(TERMS.otherIntents, { privacy: TERMS.privacyLinkText, terms: TERMS.termsLinkText });
    }
  };

  /* ======================================================================
   * 15. PAGE HOOKS (spec 2.3 and 17.1 item 18)
   *     Other pages rely on these ways of opening the quote tool. This is the
   *     one part of the file that listens to the page, and only through the
   *     window and document it is given.
   *
   *       window.PurgeProsQuote.open({ zip }) and .close()
   *       clicks on [data-purge-quote], a[href="#quote"], a[href="#get-quote"]
   *       hero ZIP forms: <form data-pp-zip-form> with an input named "zip"
   *       ?open_quote=1 (also true, yes), #quote, #get-quote on page load
   *       ?zip=  is read ONCE by create() itself, then taken out of the address
   * ==================================================================== */

  // Removes the one-time "open" instruction from the URL so a refresh does not
  // open the builder again. Attribution parameters are kept. Returns true when
  // the page asked for the builder to open.
  function consumeAutoOpenRequest(win) {
    if (!win || !win.location) return false;
    let url = null;
    try { url = new URL(win.location.href); } catch (_) { return false; }
    const asked = addressAsksToOpen(url.search, url.hash);
    if (!asked.query && !asked.hash) return false;
    url.searchParams.delete("open_quote");
    if (asked.hash) url.hash = "";
    try { win.history.replaceState(win.history.state, "", url.pathname + url.search + url.hash); } catch (_) { /* ignore */ }
    return true;
  }

  // Takes a save-link token out of the URL (#resume=...) BEFORE any analytics
  // tag can see it (spec 8.2 step 1). Returns the token, "invalid" for a
  // malformed one, or "" when there is none. Pass the result to store.resume().
  function takeResumeToken(pageEnvironment) {
    const win = pageEnvironment && pageEnvironment.window ? pageEnvironment.window : typeof window !== "undefined" ? window : null;
    if (!win || !win.location) return "";
    // The standalone quote page takes the token in its <head> and hands it over once.
    if (typeof win.__ppTakePlanToken === "function") return win.__ppTakePlanToken();
    const hash = String(win.location.hash || "");
    if (!/^#resume=/.test(hash)) return "";
    const match = /^#resume=([A-Za-z0-9_-]{43})$/.exec(hash);
    try { win.history.replaceState(win.history.state, "", win.location.pathname + win.location.search); } catch (_) { return "invalid"; }
    return match ? match[1] : "invalid";
  }

  // installPageHooks(store, { open, close, busy }) wires the hooks listed above.
  //   handlers.open(result)  bring the builder into view (show your dialog,
  //                          if it is one) and move focus to it.
  //                          result = { ok, zipStatus, step, reason, trigger }
  //   handlers.close()       hide the builder, for a design that can close it
  //   handlers.busy(result)  optional. Called INSTEAD of open or close while a
  //                          request is being sent: move focus to your
  //                          "Sending" status (spec 2.3). result as for open.
  // Returns { open, close, autoOpened, apiInstalled, notInstalledReason, uninstall }.
  function installPageHooks(store, handlers, pageEnvironment) {
    const win = pageEnvironment && pageEnvironment.window ? pageEnvironment.window : typeof window !== "undefined" ? window : null;
    const doc = pageEnvironment && pageEnvironment.document ? pageEnvironment.document : typeof document !== "undefined" ? document : null;
    const onOpen = handlers && typeof handlers.open === "function" ? handlers.open : function () {};
    const onClose = handlers && typeof handlers.close === "function" ? handlers.close : function () {};
    const onBusy = handlers && typeof handlers.busy === "function" ? handlers.busy : function () {};

    // While a request is being sent, open and close are IGNORED (spec 2.3):
    // nothing changes, neither handler runs, and the pending request cannot be
    // hidden or replaced. Only the optional busy handler is told.
    // After a FINISHED request (the done step), a ZIP typed into a hero form
    // starts a new quote with that ZIP, as the live tool does; a launcher with
    // no ZIP just brings the done screen back into view.
    function openBuilder(openOptions, trigger) {
      const options = openOptions || {};
      const before = store.getState();
      if (before.step === "done" && typeof options.zip === "string" && /^\d{5}$/.test(options.zip.trim())) store.reset();
      const result = store.open(options);
      result.trigger = trigger || null;
      if (before.submitting) onBusy(result);
      else onOpen(result);
      return result;
    }

    // Closing from the done step also starts a new quote (store.close()), as
    // the live tool does. The builder is hidden first, then cleared.
    function closeBuilder() {
      const state = store.getState();
      if (state.submitting) {
        onBusy({ ok: false, zipStatus: store.checkZip().status, step: state.step, reason: SUBMIT_MESSAGES.sending, trigger: null });
        return false;
      }
      onClose();
      store.close();
      return true;
    }

    // The same global the live widget defines: { open, close, config }, plus
    // the store at .core. `config.promotion` is there because the Worker adds
    // one line after the live widget script that writes its promotion
    // settings into it; without it that line throws when the live script is
    // loaded after these hooks. The engine does not read what is written.
    //
    // Whichever script defines the global FIRST owns every hook on the page:
    //   - these hooks first: the live widget script, loaded later, sees the
    //     global, does nothing, and adds none of its listeners;
    //   - the live widget (or an earlier installPageHooks) first: its own
    //     listeners cannot be removed, so these hooks STAND DOWN. The global
    //     is left alone, launcher clicks and hero ZIP forms are left to the
    //     script that owns them, and nothing opens automatically. The
    //     returned open() and close() still work when the page calls them.
    let apiInstalled = false;
    let notInstalledReason = "";
    if (win && !win.PurgeProsQuote) {
      win.PurgeProsQuote = {
        open: function (openOptions) { openBuilder(openOptions, null); },
        close: function () { closeBuilder(); },
        config: { engine: "PPQuoteCore", uiVersion: VERSIONS.uiVersion, promotion: {} },
        core: store
      };
      apiInstalled = true;
    } else if (win) {
      notInstalledReason = win.PurgeProsQuote.core
        ? "window.PurgeProsQuote was already installed by an earlier installPageHooks call, which keeps the page hooks."
        : "Another script (the live quote widget) defined window.PurgeProsQuote first and owns every launcher on this page. Load the engine and call installPageHooks before it, or remove that script from this page.";
      try { if (win.console && typeof win.console.warn === "function") win.console.warn("[PPQuoteCore] page hooks not installed: " + notInstalledReason); } catch (_) { /* ignore */ }
    } else {
      notInstalledReason = "There is no window to install window.PurgeProsQuote on.";
    }
    const standingDown = Boolean(win && !apiInstalled);

    function closestMatch(node, selector) {
      return node && typeof node.closest === "function" ? node.closest(selector) : null;
    }

    // A click on a launcher opens the builder in place, unless another handler
    // already dealt with the click.
    function onClick(event) {
      if (standingDown) return;
      const trigger = closestMatch(event.target, '[data-purge-quote], a[href="#quote"], a[href="#get-quote"]');
      if (!trigger || event.defaultPrevented) return;
      event.preventDefault();
      openBuilder({}, trigger);
    }

    // A hero ZIP form hands its ZIP to the builder instead of leaving the page.
    function onSubmit(event) {
      if (standingDown) return;
      const form = closestMatch(event.target, "[data-pp-zip-form]");
      if (!form || event.defaultPrevented) return;
      if (typeof form.checkValidity === "function" && !form.checkValidity()) return;
      const field = form.elements && form.elements.zip ? form.elements.zip : null;
      event.preventDefault();
      openBuilder({ zip: String(field && field.value ? field.value : "").trim() }, form);
    }

    const listening = Boolean(doc && typeof doc.addEventListener === "function");
    if (listening) {
      doc.addEventListener("click", onClick);
      doc.addEventListener("submit", onSubmit);
    }

    // ?open_quote=1 or #quote on page load. A ?zip= beside it was already
    // applied, and taken out of the address, when the store was created.
    const autoOpened = standingDown ? false : consumeAutoOpenRequest(win);
    if (autoOpened) openBuilder({}, null);

    return {
      open: openBuilder,
      close: closeBuilder,
      autoOpened: autoOpened,
      apiInstalled: apiInstalled,
      notInstalledReason: notInstalledReason,
      uninstall: function () {
        if (listening) {
          doc.removeEventListener("click", onClick);
          doc.removeEventListener("submit", onSubmit);
        }
        if (apiInstalled && win && win.PurgeProsQuote && win.PurgeProsQuote.core === store) delete win.PurgeProsQuote;
      }
    };
  }

  /* ======================================================================
   * 16. PUBLIC SURFACE
   * ==================================================================== */

  return deepFreeze({
    engineVersion: "1.5.2", // 1.5.2: the two verifier fixes of 2026-10-10 (staging refuses any spelling of a production host: a port, a user name, a trailing dot; a phone number with a country code other than +1 is refused instead of cut to ten digits). Nothing sent changed. 1.5.1: attribution privacy (a tag value that looks like an email address or a phone number is dropped before it is stored or sent; nothing else about attribution changed). 1.5.0: the send switch (staging mode, siteOptions for window.PPSite, a staging-only saved-link base) and audit fix B1 (no maxLength on the phone rule; area code and exchange start with 2 to 9). 1.4.0: 1.4.0: measurement fleshed out on the owner's go-ahead of 2026-10-09 (T13 renamed QuoteSent; T16 method; T17 to T22 the funnel and contact events, six of them reported through store.trackUi(); T23 attribution kept 30 days in the browser). Lead, generate_lead and conversion unchanged; no payload key, price or wording change. 1.3.0: the 2026-10-09 owner decisions on tracking (T1 to T12 approved; T13 to T15 added). 1.2.0: the 2026-10-08 first-cleanup wording (offerNote() and the customer-status hint; nothing sent changed). 1.1.0: the 2026-10-07 verifier fixes (see CORE-API.md and tests/verifier-findings.test.mjs)

    // create a store
    create: create,
    shared: shared,

    // versions, brand, storage
    VERSIONS: VERSIONS,
    BRAND: BRAND,
    STORAGE_KEYS: STORAGE_KEYS,
    PERSISTED_PLAN_KEYS: PERSISTED_PLAN_KEYS,
    ATTRIBUTION_KEYS: ATTRIBUTION_KEYS,
    ATTRIBUTION_KEEP_DAYS: ATTRIBUTION_KEEP_DAYS,

    // option lists
    STEPS: STEPS,
    PLAN_STEPS: PLAN_STEPS,
    DOG_OPTIONS: DOG_OPTIONS,
    YARD_SIZES: YARD_SIZES,
    AREAS: AREAS,
    AREA_ADDERS_CENTS: AREA_ADDERS_CENTS,
    FREQUENCIES: FREQUENCIES,
    ONE_TIME: ONE_TIME,
    FROM_LINE: FROM_LINE,
    RECURRING_PRICE_NOTE: RECURRING_PRICE_NOTE,
    LAST_CLEANED_OPTIONS: LAST_CLEANED_OPTIONS,
    START_TIMING_OPTIONS: START_TIMING_OPTIONS,
    CUSTOMER_STATUS_OPTIONS: CUSTOMER_STATUS_OPTIONS,
    CONTACT_METHODS: CONTACT_METHODS,
    INTENTS: INTENTS,
    STAGES: STAGES,
    CUSTOM_REASON_LABELS: CUSTOM_REASON_LABELS,

    // exact wording and messages
    CONSENT: CONSENT,
    TERMS: TERMS,
    PROMISES: PROMISES,
    OUT_OF_AREA_COPY: OUT_OF_AREA_COPY,
    MESSAGES: MESSAGES,
    SUBMIT_MESSAGES: SUBMIT_MESSAGES,
    SAVE_LINK_MESSAGES: SAVE_LINK_MESSAGES,
    RESUME_MESSAGES: RESUME_MESSAGES,
    wording: wording,

    // service area
    SERVICE_ZIPS: SERVICE_ZIPS,
    COMMUNITIES: COMMUNITIES,
    ZIP_TO_COMMUNITY: ZIP_TO_COMMUNITY,
    checkZip: checkZip,
    cityForZip: cityForZip,

    // pricing and rules (no store needed)
    calculateQuote: calculateQuote,
    frequencyEligibility: frequencyEligibility,
    reconcileFrequency: reconcileFrequency,

    // formatting
    formatMoney: formatMoney,
    formatDollars: formatDollars,
    normalizeZip: normalizeZip,
    normalizePhone: normalizePhone,
    formatPhone: formatPhone,
    isValidEmail: isValidEmail,
    dogsLabel: dogsLabel,

    // contract details
    FIELD_STEP: FIELD_STEP,
    FIELD_MAX_LENGTH: FIELD_MAX_LENGTH,
    SERVER_FIELD_MAP: SERVER_FIELD_MAP,
    mapServerFields: mapServerFields,
    FINGERPRINT_FIELDS: FINGERPRINT_FIELDS,
    submissionFingerprint: submissionFingerprint,
    SAVE_LINK_KEYS: SAVE_LINK_KEYS,
    SAVE_LINK_PATTERN: SAVE_LINK_PATTERN,
    LIVE_ALLOWED_ORIGINS: LIVE_ALLOWED_ORIGINS,
    siteOptions: siteOptions,
    LIVE_GOOGLE_ADS_SEND_TO: LIVE_GOOGLE_ADS_SEND_TO,
    SUBMIT_TIMEOUT_MS: SUBMIT_TIMEOUT_MS,
    SAVE_LINK_TIMEOUT_MS: SAVE_LINK_TIMEOUT_MS,

    // tracking names
    EVENTS: EVENTS,
    PIXEL_MILESTONES: PIXEL_MILESTONES,
    LEGACY_STEP_NUMBER: LEGACY_STEP_NUMBER,

    // demo switches
    DEMO_SUBMIT_OUTCOMES: DEMO_SUBMIT_OUTCOMES,
    DEMO_SAVE_OUTCOMES: DEMO_SAVE_OUTCOMES,
    DEMO_RESUME_OUTCOMES: DEMO_RESUME_OUTCOMES,

    // page hooks
    installPageHooks: installPageHooks,
    takeResumeToken: takeResumeToken,

    // pure functions behind the store, exposed for the tests
    testing: {
      planErrors: planErrors,
      detailsErrors: detailsErrors,
      termsErrors: termsErrors,
      payloadFromState: payloadFromState,
      saveLinkBody: saveLinkBody,
      stageFor: stageFor,
      fieldRules: fieldRules,
      cleanAttribution: cleanAttribution,
      isAllowedMeasurementValue: isAllowedMeasurementValue,
      fieldKeyList: fieldKeyList
    }
  });
});
