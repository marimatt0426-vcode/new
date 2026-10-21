/* Purge Pros — "Cover Story" direction. builder.js
   The price builder interface. ALL logic (prices, eligibility, ZIP checks, validation, storage, tracking,
   payloads) lives in shared/pp-quote-core.js (PPQuoteCore); this file only draws what the engine says
   and hands it what the visitor taps or types. Review builds run the engine in demo mode: nothing is sent.

   Map of this file
     1  setup            engine, assets, DOM helper
     2  words            every sentence written for this interface (COPY) and the mascot's lines (SAY)
     3  the stage        ONE card, built once: head, progress, question, options area, foot
     4  step registry    registerStep(id, definition): one definition per step, one panel per step
     5  frame            title, count, progress chips, hint, mascot line, heads-up note, foot, pinned price,
                         the part a screen pins above the foot, the move-on after a one-tap answer
     6  the steps        dogs, zip, yard, areas, frequency, price
     6b later screens    request (three short screens: who, how to reach you, where and when), confirm, done;
                         form controls (makeField), sending and every failure state, the progress band of the request
     7  pop-ups          yard guide, "How this works", the engine's terms for a request
     8  presentations    the hero card (first question, or the summary), the panel (sheet on a phone, dialog on larger
                         screens), plan buttons, the compact pinned bar, open-from-anywhere hooks, and what this
                         interface reports to the engine for its counts (the panel opened and by which way in, the
                         request screen on show)
     9  start            subscribe ONCE to the engine and update in place

   ONE rule for where the builder lives, on every device: the hero card asks the first question only; every later
   step runs in the panel, which opens in place over the page. With a price under way and the panel closed, the hero
   card shows the summary (answers, price so far, Continue, Start over). The panel has the same Start over at the end
   of its question row, on the plan questions and the price, once something is answered (2026-10-12).

   The stage holds still: the card is never rebuilt. A step's panel is built the first time it is shown and
   kept; a change only touches what the engine says changed. See BUILDER-NOTES.md for selectors and how to add a step. */
(function () {
  "use strict";

  /* ---------------------------------------------------------------- 1 setup */
  var C = window.PPQuoteCore;
  if (!C || window.PPBuilder) return;            // no engine: the page's static mock stays and its links still work

  var win = window, doc = document, root = doc.documentElement;
  var me = doc.currentScript;
  /* window.PPSite: the ONE settings object a page may set before these scripts load (CORE-API.md section 13).
     Absent in a review build. Nothing in it is trusted further than the engine's siteOptions() allows. */
  var SITE = win.PPSite && typeof win.PPSite === "object" ? win.PPSite : null;
  var ASSETS = (me && me.getAttribute("data-assets")) || (SITE && typeof SITE.assets === "string" && SITE.assets) || "../../assets/";
  var media = function (q) { return Boolean(win.matchMedia && win.matchMedia(q).matches); };
  var QUIET = media("(prefers-reduced-motion: reduce)");
  var GLOVED_PAGE = Boolean(doc.querySelector('[data-mascot="gloved"]'));   // set on <body> or on the mount by those pages
  var FINE_POINTER = media("(hover: hover) and (pointer: fine)");

  /* h("tag", { class, text, "data-x", onclick, hidden: true }, child, [children]) */
  function h(tag, attrs) {
    var node = doc.createElement(tag), key, i, kid;
    if (attrs) for (key in attrs) {
      var value = attrs[key];
      if (value == null || value === false) continue;
      if (key === "text") node.textContent = value;
      else if (key === "class") node.className = value;
      else if (key.slice(0, 2) === "on") node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : value);
    }
    for (i = 2; i < arguments.length; i++) {
      kid = arguments[i];
      if (Array.isArray(kid)) kid.forEach(function (k) { if (k != null && k !== false) node.append(k); });
      else if (kid != null && kid !== false) node.append(kid);
    }
    return node;
  }
  /* 2026-10-18: a picture drawn small everywhere it is used gets a copy about twice its largest drawn size, offered with the
     original (srcset); sharper screens still get the original. [copy, its width, the original's width, largest drawn width] */
  var SMALL = { "step-icons/mascot-head.webp": ["step-icons/mascot-head-132.webp", 132, 240, 65] };
  function pic(path, size, cls, height) {
    var attrs = { src: ASSETS + path, width: size, height: height || size, alt: "", class: cls || null, decoding: "async" }, small = SMALL[path];
    if (small) { attrs.srcset = ASSETS + small[0] + " " + small[1] + "w, " + ASSETS + path + " " + small[2] + "w"; attrs.sizes = small[3] + "px"; }
    return h("img", attrs);
  }
  /* 2026-10-18: the two large poses of later screens (the ZIP question's and the out-of-area answer's, about 95 KB each) are not
     fetched while the page loads. Each is made with an empty stand-in of the same size; warmPoses() gives it its file at the
     visitor's first touch of the price card, the first answer, the panel opening, or the ZIP question appearing. */
  var BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", latePics = [], posesWarm = false;
  function latePic(path, size, cls, height) {
    var node = pic(path, size, cls, height);
    if (!posesWarm) { node.setAttribute("data-ppb-late", path); node.src = BLANK; latePics.push(node); }
    return node;
  }
  function warmPoses() {
    if (posesWarm) return;
    posesWarm = true;
    latePics.forEach(function (node) { node.src = ASSETS + node.getAttribute("data-ppb-late"); node.removeAttribute("data-ppb-late"); });
    latePics = [];
  }
  function setText(node, text) { if (node.textContent !== text) node.textContent = text; }
  function lowerFirst(text) { return !text ? "" : /^[A-Z]{2}/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1); }   // an acronym keeps its capitals ("ZIP")
  function has(list, item) { return list.indexOf(item) > -1; }

  var ICON = {
    avatar: "step-icons/mascot-head.webp", arrow: "brand-icons/pp-next-arrow.webp", close: "brand-icons/pp-close.webp",
    alert: "brand-icons/pp-alert.webp", tag: "step-icons/price-tag.webp", pin: "step-icons/map-pin.webp", ok: "step-icons/check.webp",
    star: "brand-icons/pp-review-star.webp", zero: "step-icons/zero-fee.webp", chat: "step-icons/chat.webp", calendar: "step-icons/calendar.webp",
    call: "step-icons/call.webp", returning: "step-icons/customer-returning.webp", sorry: "brand/poses/sorry-map.webp", present: "brand/poses/present.webp",
    dog: function (id) { return "quote-icons/dog-" + (id === "10" ? "10plus" : id) + ".webp"; },
    yard: { s: "step-icons/yard-s.webp", m: "step-icons/yard-m.webp", l: "step-icons/yard-l.webp", xl: "step-icons/yard-xl.webp", over: "step-icons/yard-over.webp" },
    area: { back: "quote-icons/area-back.webp", front: "quote-icons/area-front.webp", side: "quote-icons/area-sides.webp" },
    freq: { twice: "quote-icons/frequency-twice-weekly.webp", weekly: "quote-icons/frequency-weekly.webp", biweekly: "quote-icons/frequency-every-other-week.webp",
      onetime: "quote-icons/frequency-one-time.webp", custom: "quote-icons/frequency-custom.webp" }
  };

  /* ---------------------------------------------------------------- 2 words */
  /* Free copy only. Prices, option names, reasons, notices, the out-of-area wording, the one-time and custom
     terms and every promise come from the engine at the moment they are shown. */
  var COPY = {
    title: "Build your price",
    next: "Next", back: "Back",
    progress: "Your progress",
    seg: { dogs: "Dogs", zip: "ZIP", yard: "Yard", areas: "Areas", frequency: "How often", price: "Price" },
    stepOf: function (i, n) { return "Step " + i + " of " + n; },
    editing: "Changing an answer",
    /* AUDIT FIX m10 (WCAG 2.5.3, label in name): a chip's name STARTS with the words on the chip, so someone using Voice Control can
       say what they see. named("2 areas", "Back yard, Front yard") is "2 areas: Back yard, Front yard"; when the full answer already
       starts with the chip's words ("46074", "46074 · Westfield") it is the full answer alone: "46074, Westfield". */
    named: function (shown, value) {
      var full = String(value == null ? "" : value).replace(/\s+·\s+/g, ", "), lead = String(shown == null ? "" : shown).trim();
      if (!lead || full.toLowerCase().indexOf(lead.toLowerCase()) === 0) return full || lead;
      return full ? lead + ": " + full : lead;
    },
    change: function (label, value, shown) { return COPY.named(shown, value) + ". Change " + lowerFirst(label) + "."; },   // read aloud: "46074, Westfield. Change ZIP."
    seePrice: function (value, shown) { return COPY.named(shown, value) + ". Go to your price."; },
    areasCount: function (n) { return n + " areas"; },
    yourPrice: "Your price",
    // 2026-10-21: the exact price's unit sits in the label above the number ("per visit" after the number was cut to "per" on a 375 px phone)
    unitLabel: function (unit) { return unit === "per visit" ? "Per visit" : unit === "base price" ? "Base price" : ""; },
    moreBelow: "More below",
    scrollLabel: "There is more on this step. Scroll to see it all.",
    gotIt: "Got it",
    closeBuilder: "Close price builder",
    away: "Your price builder is open in front of this page.",
    /* TEXT FIRST (owner decision, October 8): wherever the builder offers a phone call, a Text option comes before it and is
       the stronger of the two. The pair of buttons reads "Text (317) 961-5865" and "Call"; a sentence reads "text (317) 961-5865 or call". */
    reach: { text: function (phone) { return "Text " + phone; }, call: "Call", callLabel: function (phone) { return "Call " + phone; } },
    dogs: { q: "How many dogs?", need: "Tap a number to start.", ok: "Tap another to change it.", moreGroup: "Five or more dogs",
      more: function (first) { return first + " or more"; }, moreSub: function (first, last) { return "A full pack? Pick " + first + " to " + last; } },
    zip: { q: "Your ZIP code?", need: "Type all 5 digits.", ok: "You are covered.", out: "Outside our area.", placeholder: "e.g. 46032",
      waiting: "We check it the moment you finish typing.",
      served: function (community) { return community ? "We serve " + community + "." : "You are in our service area."; },
      servedSub: function (zip) { return "ZIP " + zip + " is on our routes."; },
      /* a city page whose community has several accepted ZIPs: its ZIPs as one-tap choices above the field (see CITY) */
      pick: function (n) { return n === 1 ? "Tap it, or type a different one." : "Tap yours, or type a different one."; }, other: "A different ZIP? Type it here",
      city: function (community, n) { return n === 1 ? "The " + community + " ZIP we cover" : community + " ZIPs we cover"; },
      /* after Start over: the ZIP that a link or a ZIP button of the page handed over is offered again as ONE one-tap choice (startOver) */
      again: "The ZIP you picked" },
    yard: { q: "How big is the yard?", need: "Pick the closest size.", ok: "Tap another to change it.",
      most: function (label) { return "Most customers pick " + lowerFirst(label); }, guide: "Not sure?", guideLabel: "Not sure? Open the yard size guide" },   // starts with the words on the link (m10)
    areas: { q: "Which areas?", need: "Tick at least one area.", ok: "Tap again to remove one.", note: "Tick every area the dogs use. Tap a ticked one again to remove it." },
    frequency: { q: "How often?", need: "Each shows one exact price.", ok: "Tap another to change it.", popular: "Popular", picked: "Chosen for you. Tap See my price, or change it.",
      next: "See my price" },   // 2026-10-18: the button of this question says where it goes (the price-skip fix, below)
    /* the pinned price before the exact price is known: the engine's "from" line, moved along by the engine's own calculator as answers arrive */
    line: {
      known: function (fromLabel) { return fromLabel.replace(/\s+from$/i, ""); },               // "Weekly visits from" -> "Weekly visits" once dogs, yard and areas are in
      from: function (label) { return label + " from"; },
      oneTime: function (minutes) { return "One-time, first " + minutes + " minutes"; },
      building: "Building your price",                // 2026-10-21: after the first answer, until the plans show their prices
      choose: "Pick a plan"                           // 2026-10-21: on the plan question, until one is picked (also shown on the page's card and the pinned bar, so no "above")
    },
    /* the hero card when a price is under way and the panel is closed */
    sum: {
      label: "Your price so far",
      title: { plan: "Your price so far", price: "Your price", custom: "Your custom quote", request: "Your request", out: "Your ZIP code" },
      answered: function (n, of) { return n + " of " + of + " answered"; },
      answers: "Your answers", change: "tap to change",
      left: function (n) { return n === 1 ? "One quick question left." : n + " quick questions left."; },
      ready: "Ready when you are.",                                                             // followed by the engine's "Nothing is charged…" promise
      request: "Your request is waiting here until you send it.",
      out: "Check another ZIP, or text us.",
      locked: "Open it to see how to reach us.",
      go: "Continue", over: "Start over", overLabel: "Start over with a new price",
      building: "A few more answers and your price is here."
    },
    price: { q: "Your price is ready", qOneTime: "Your cleanup price", qCustom: "This one gets a custom quote",
      how: "How this works", howKicker: "How this works", lines: "What makes up this price", totalRow: function (unit) { return "Your price " + unit; },
      nextTitle: "What happens next", save: "Save this quote for 7 days", copy: "Copy link", linkLabel: "Your saved quote link",
      ways: { quote_delivery: { lead: "Not ready?", label: "Text me this quote", icon: "chat" }, question: { lead: "Something unclear?", mark: "?" } },
      nexts: {
        recurring: [["chat", "Send your request.", ""], ["calendar", "We confirm a service day.", "The best recurring day for your area."], ["ok", "You approve the day.", "Then we send a secure payment setup request."]],
        onetime: [["chat", "Send your request.", ""], ["calendar", "We review the cleanup.", "The details and current availability."], ["ok", "We confirm the plan with you.", "Then we send the secure payment setup request."]],
        custom: [["chat", "Send your request.", ""], ["calendar", "We review your yard and reply.", "With your custom price and the best service day for your area."], ["ok", "You approve it.", "Then we send a secure payment setup request."]]
      } },
    /* "How this works" has NO sentence of its own. Since the owner's decision of 2026-10-08 the engine words the whole
       no-start-up-fee note (store.offerNote(): a title and three paragraphs; single source POLICY-WORDING.md in the release root)
       and openHow() prints it untouched. Do not add a sentence about the fee, the first cleanup or charges here. */
    guide: {
      kicker: "Yard size guide", title: "Your service area. Not your whole property.",
      lead: "Estimate the outdoor area you want scooped, including any patio or concrete areas where your dogs poop. Leave out the house and areas that do not need service.",
      figTitle: "Example: backyard service only", figKey: "Green + checkmark = area to count",
      svgTitle: "Which part of a property counts as yard size?",
      svgDesc: "An example viewed from above. The backyard lawn and patio count in this example because both need scooping. The house and unused driveway do not count. The front and side lawns count only if you request those areas too. This is not a measurement or a size-tier example.",
      notScale: "Illustration only. Not to scale and not a measurement of your property.",
      more: ["Need front or side areas scooped too?", "Add those service areas to your backyard total. Choose the total size here, then tick the areas on the next question."],
      caption: "Service area guide: choose the smallest size that fits", colSize: "Yard size", colFeet: "Square feet", upTo: function (n) { return "Up to " + n; }, selected: "selected",
      example: ["A quick size example:", "a 50 ft × 100 ft service area is 5,000 sq ft, so it fits the smallest size. For irregular areas, add the areas of smaller rectangles."],
      over: function (feet, label) { return "Over " + feet + " sq ft is “" + label + "” and needs a custom estimate."; },
      unsure: function (label) { return "Still unsure? Use “" + label + "” after viewing your price so we can help confirm the serviced area."; },
      done: "Got it"
    }
  };

  /* The mascot's lines: one per step and per notable answer. Light, warm, never about money or consent. */
  /* A tap on a dog count, a yard size or a frequency moves on by itself, so his reaction to that answer is the
     first thing he says on the NEXT question, joined to that question's own prompt. Every line fits two lines of the head. */
  var SAY = {
    dogs: function (state, flow) {
      var id = state.dogCount, option = dogOption(id);
      if (!id) {
        if (ui.moreOpen) return "A full pack? Pick your number.";
        if (ui.prefer) {                                // a plan button was pressed: say which plan is being priced
          if (ui.prefer === "onetime") return "A one-time cleanup? You got it. First, count the tails.";
          if (ui.prefer === "custom") return "A custom quote? Happy to. First, count the tails.";
          return preferLabel() + "? Good pick. First, count the tails.";
        }
        if (flow.zipSkipped) { var where = townOf(store.checkZip()); return (where ? where + ", got it." : "I have your ZIP.") + " Now count the tails."; }   // the page's city for one of its extra ZIPs (TOWN)
        return "Count the tails. I’ll do the math.";
      }
      if (id === "1") return "One dog. One very lucky yard.";
      if (id === "2") return "Two dogs. Double the zoomies.";
      if (id === "3") return "Three! That’s a proper pack.";
      if (id === "4") return "Four dogs. My kind of party.";
      if (id === "10") return "Ten or more? Now that’s a welcome committee.";
      return (option ? option.label : "A full pack") + "! I’m bringing the big scooper.";
    },
    zip: function (state) {
      var check = store.checkZip();
      if (check.status === "in_area") return (townOf(check) || "Good news") + "! I know those lawns.";
      if (check.status === "out_of_area") return "Shoot. That one’s off my map for now.";
      if (check.status === "incomplete") return "Keep going. Five digits does it.";
      var id = state.dogCount, option = dogOption(id);
      // on a city page that offers its ZIPs as one-tap choices he asks for the town by name: "Two dogs, double the zoomies. Which Carmel ZIP?"
      // (measured: two lines of the head at 360px and wider for the longest name there is, Indianapolis. Narrower than that, or for a longer name, he leaves the name out.)
      var town = CITY.zips.length > 1 ? (CITY.name.length <= 12 && media("(min-width: 360px)") ? "Which " + CITY.name + " ZIP?" : "Which ZIP?") : "";
      if (id === "1") return "One dog, one lucky yard. " + (town || "Where is it?");
      if (id === "2") return "Two dogs, double the zoomies. " + (town || "Where to?");
      if (id === "3") return "Three! A proper pack. " + (town || "Where do they roam?");
      if (id === "4") return "Four dogs, my kind of party. " + (town || "Where to?");
      if (id === "10") return "Ten or more? What a welcome committee. " + (town || "Where to?");
      if (option) return option.label + "! I’ll bring the big scooper. " + (town || "Where to?");
      if (town) return CITY.name + "! " + town;
      return "Where’s the yard? Just the ZIP.";
    },
    yard: function (state) {
      return ({ s: "Cozy. I like a tidy little lawn.", m: "A nice stretch of green.", l: "Room to run. Good for the zoomies.",
        xl: "That’s a lot of lawn. I’ll stretch first.", over: "Whoa, an estate! That one I measure myself." })[state.yardSize] || "How much lawn are we talking?";
    },
    areas: function (state) {
      var n = state.areas.length;
      if (!n) return ({ s: "A cozy little lawn. Where do the dogs go?", m: "A nice stretch of green. Where do they go?", l: "Room to run! Where do the dogs go?",
        xl: "That’s a lot of lawn. Where do the dogs go?", over: "An estate! Where do the dogs like to go?" })[state.yardSize] || "Where do the dogs like to go?";
      if (n === C.AREAS.length) return "The full lap! Front to back.";
      return n === 1 ? "Got it. One spot to keep spotless." : "Two spots. I’ll hit them both.";
    },
    frequency: function (state) {
      return ({ twice: "Twice a week. That lawn stays spotless.", weekly: "Weekly. The crowd favorite.", biweekly: "Every other week. Nice and easy.",
        onetime: "One big cleanup. I’ll bring extra bags.", custom: "A special one. I like a challenge." })[state.frequency] || "How often should I swing by?";
    },
    price: function (state) {
      var quote = store.quote();
      if (ui.kept) return quote.custom ? "Welcome back! Your custom quote is right here." : "Welcome back! I kept your price right here.";
      if (quote.custom) return "This one gets my personal attention.";
      if (quote.oneTime) return "One big reset, coming right up.";
      return ({ twice: "Twice a week! That lawn stays spotless.", weekly: "Weekly, the crowd favorite. Ta-da!", biweekly: "Every other week, nice and easy. Ta-da!" })[state.frequency] || "Ta-da! One happy lawn, coming up.";
    },
    /* the hero card while a price is under way and the panel is closed */
    sum: function (state, bar) {
      if (state.locked) return "Let’s sort this one out by text or phone.";
      if (bar.kind === "out_of_area") return "Shoot. That one’s off my map for now.";
      if (ui.carried) return bar.kind === "exact" || bar.kind === "custom" ? "Welcome back! I kept your price." : "Welcome back! I kept your answers.";
      if (isLater(state.step)) return "Your request is safe with me.";
      if (state.step === "price") return "Your price is ready when you are.";
      return "I’ll hold your spot. Jump back in anytime.";
    }
  };

  /* ---------------------------------------------------------------- 3 the stage */
  var mount = doc.querySelector("[data-pp-builder]");
  /* a page about something other than recurring scooping names what this card prices: data-title on the mount
     (hero.cardTitle in the page's JSON block; the sanitizing page says "Your scooping price"). 20 characters fit the
     card and the panel from 360px wide; under that the stage tightens the title's letter-spacing (data-ppb-titled). */
  var PAGE_TITLE = mount ? (mount.getAttribute("data-title") || "").trim() : "";
  if (PAGE_TITLE) COPY.title = PAGE_TITLE;
  var resumeToken = C.takeResumeToken();           // first thing, before any tag can read the address
  var options = { frequencyLabels: { twice: "Twice a week", custom: "Custom quote" }, presentation: mount ? "inline" : "modal" };
  var pageCity = mount ? (mount.getAttribute("data-city") || "").trim() : "";
  if (mount && (mount.getAttribute("data-zip") || "").trim()) options.pageZip = mount.getAttribute("data-zip").trim();
  if (pageCity) options.pageCity = pageCity;       // with or without a page ZIP: the engine pre-fills this city when it is a right name for the ZIP (Lawrence for 46216)

  /* THE SEND SWITCH. A page says how the builder runs in window.PPSite.mode; the engine decides what that may mean
     (C.siteOptions, pp-quote-core.js) and this file names the only thing the engine must not name: the production
     request address.
       "live"     real requests to the production quote Worker, and only from the real site's own addresses
                  (C.LIVE_ALLOWED_ORIGINS). The page cannot widen that list or point live mode at another address:
                  its endpoint is used only when it is one of LIVE_ENDPOINTS below, its allowedOrigins is ignored.
       "staging"  real requests to the STAGING address the page gives (a production address is refused), from the real
                  site's addresses plus the page's own allowedOrigins. No Google or Meta call of any kind is made;
                  the events are written to store.trackLog only. A saved-quote link on the staging page's own address
                  (PPSite.savedLinkBase) is accepted there and nowhere else.
       anything else, or no PPSite: demo, exactly as a review build. Nothing is sent.
     LIVE_ENDPOINTS: the production Worker (purge-lead-relay). The first is the address the live site uses today (its
     pages load the quote script from that host, and the Worker hands the script "<its own origin>/submit"); the second
     is the same Worker on its custom domain. */
  var LIVE_ENDPOINTS = ["https://purge-lead-relay.purgepros.workers.dev/submit", "https://quote.itspurgepros.com/submit"];
  var sendOptions = typeof C.siteOptions === "function" ? C.siteOptions(SITE, { liveEndpoints: LIVE_ENDPOINTS }) : {};
  Object.keys(sendOptions).forEach(function (key) { options[key] = sendOptions[key]; });
  var store = C.shared(options);                   // ONE store per page: inline builder, sheet and pinned bar share it

  /* A city page whose community has SEVERAL accepted ZIPs carries data-city and no data-zip (a pre-filled ZIP would be wrong for
     some of its visitors). The ZIP question then offers that community's ZIPs as one-tap choices above the field.
     The list is the engine's own: every accepted ZIP (C.SERVICE_ZIPS) that C.cityForZip() lists under this community, without the
     ones it flags as PO Box only; then the extra ZIPs the page names for its community (data-zips-also, below). No ZIP is written
     in this file. A community the engine does not know gives an empty list, and the step is exactly as it is on any other page.
     A usable data-zip wins: the question is skipped, nothing is offered. */
  function cityZips(name) {
    var want = name.toLowerCase(), found = { name: "", zips: [] };
    if (!want) return found;
    (C.SERVICE_ZIPS || []).forEach(function (zip) {
      var entry = C.cityForZip(zip);
      if (!entry || String(entry.community).toLowerCase() !== want) return;
      found.name = entry.community;                // the engine's spelling of the name
      if (!entry.poBox) found.zips.push(entry.zip);
    });
    found.zips.sort();
    return found;
  }
  /* A city page may also name EXTRA ZIPs of its community: data-zips-also="46280" on the mount ("alsoZips" in the hero of the
     page's JSON block; the site builder checks it and writes the attribute). They are accepted ZIPs that the engine lists under a
     neighbour although they reach this community too: 46280 is an Indianapolis ZIP that covers Carmel's south edge, and the Carmel
     page prints it as one of its three. Two things follow from the attribute, and nothing else:
       1. the one-tap choices of the ZIP question show the extra ZIPs after the community's own;
       2. where THIS interface names the place of the ZIP in hand (the mascot's "Carmel, got it." and "Carmel! I know those lawns.",
          and the line "We serve Carmel." under a ZIP), it says the page's city for an extra ZIP: townOf().
     The engine is told nothing new. The ZIP, the City it pre-fills in the request, the plan summary ("46280 · Indianapolis") and
     everything that is sent stay exactly what the engine says. A ZIP that is not five digits, is not accepted or is already the
     community's own is ignored here (the site builder refuses it). No ZIP is written in this file. */
  function alsoZips(text, own) {
    var found = [];
    String(text || "").split(/[^0-9]+/).forEach(function (zip) {
      var check = zip.length === 5 ? C.checkZip(zip) : null;
      if (!check || !check.inArea || found.indexOf(check.zip) !== -1) return;
      if (own.name && String(check.community).toLowerCase() === own.name.toLowerCase()) return;
      found.push(check.zip);
    });
    return found;
  }
  /* TOWN: the page's community, whatever the page does about its ZIP. { name, zips: its own (PO Box ZIPs left out), also: the page's extra ZIPs } */
  var TOWN = cityZips(pageCity);
  TOWN.also = alsoZips(mount ? mount.getAttribute("data-zips-also") : "", TOWN);
  if (!TOWN.name && TOWN.also.length) TOWN.name = pageCity;   // a place the engine keeps no list for: the page's own spelling of it
  /* CITY: what the ZIP question offers as one-tap choices. Nothing when the page supplies a usable ZIP. */
  var CITY = options.pageZip && C.checkZip(options.pageZip).inArea ? { name: "", zips: [] } : { name: TOWN.name, zips: TOWN.zips.concat(TOWN.also) };
  /* the name this interface says for a checked ZIP: the page's city for one of the page's extra ZIPs, otherwise the engine's community */
  function townOf(check) {
    if (!check) return "";
    return check.inArea && TOWN.name && TOWN.also.indexOf(check.zip) !== -1 ? TOWN.name : check.community || "";
  }

  /* hero: what the inline mount shows ("stage" = the first question, "summary" = the price so far, "away" = the builder is open in front).
     prefer: the plan of the button that opened the builder (memory only). carried: answers came from an earlier page or a reload and
     nothing has been touched here yet. kept: the price screen was reached by that route. auto: the pending move-on after a one-tap answer.
     again: the ZIP a page's link handed over before Start over was pressed; the ZIP question offers it as a one-tap choice (startOver). */
  var ui = { step: "", mode: "inline", moreOpen: false, blocked: false, flash: "", notice: null, noticeOff: "", said: "", priceKey: "", barKey: "",
    opener: null, sheetOpen: false, inView: false, atEnd: false, locks: 0, panels: {}, segs: [], rsegs: [], pops: {},
    hero: "", prefer: "", picked: "", carried: false, kept: false, auto: 0, way: null, owed: false, again: "" };
  var el = {};
  var steps = {};
  var noticeOwners = {};
  var hooks = null;

  function dogOption(id) { return C.DOG_OPTIONS.filter(function (o) { return o.id === id; })[0] || null; }
  function flowStep(flow, id) { return flow.steps.filter(function (s) { return s.id === id; })[0] || null; }
  function isFrozen(state) { return Boolean(state.submitting || state.locked || state.resumeLoading); }
  function frequencyOption(id) { return store.frequencyOptions().filter(function (o) { return o.id === id; })[0] || null; }
  function preferLabel() { var option = frequencyOption(ui.prefer); return option ? option.label : ""; }
  /* Has the visitor started a price? Then everything after the first question lives in the panel, and the hero card shows the summary.
     A ZIP handed over by a page or a link is not a start: the first question is still dogs. */
  function hasProgress(state) {
    return state.step !== "dogs" || state.dogCount !== "" || state.yardSize !== "" || state.areas.length > 0 || state.frequency !== "";
  }

  function buildStage() {
    el.avatar = h("span", { class: "ppb-avatar" }, pic(ICON.avatar, 240));
    el.title = h("span", { "data-ppb-title": true, text: COPY.title });
    el.count = h("span", { class: "ppb-count", "data-ppb-count": true });
    el.say = h("p", { class: "ppb-say", "data-ppb-say": true, "aria-live": "polite" });
    // the heads-up note covers the head and the progress band completely, and the whole of it is the "Got it" button
    el.noticeText = h("span", { "data-ppb-notice-text": true });
    el.noticeBtn = h("button", { class: "ppb-headsup__btn", type: "button", "data-ppb-notice-close": true, onclick: dismissNotice },
      pic(ICON.alert, 18, "ppb-headsup__ico"), h("span", { class: "ppb-headsup__txt" }, h("span", { class: "ppb-spin ppb-headsup__spin", "aria-hidden": "true" }), el.noticeText, " ", h("u", { text: COPY.gotIt })));
    el.notice = h("div", { class: "ppb-headsup", "data-ppb-notice": true, role: "status", hidden: true }, el.noticeBtn);
    el.head = h("div", { class: "ppb-head" }, el.avatar,
      h("div", { class: "ppb-headtxt" }, h("p", { class: "ppb-title" }, el.title, " ", el.count), el.say), el.notice);
    // a named group, so "Your progress, step 2 of 6" is announced; its items are bars and chips, not a list to count
    el.progress = h("ol", { class: "ppb-progress", role: "group", "aria-label": COPY.progress, "data-ppb-progress": true });
    el.q = h("h2", { class: "ppb-q", id: "ppb-q", tabindex: "-1", "data-ppb-q": true });
    el.hint = h("p", { class: "ppb-hint", id: "ppb-hint", "data-ppb-hint": true });
    el.opts = h("div", { class: "ppb-opts", "data-ppb-opts": true, onscroll: scheduleMore });
    el.optwrap = h("div", { class: "ppb-optwrap" }, el.opts, pic("brand-icons/pp-mascot-silhouette.webp", 192, "ppb-spare"));
    el.qico = h("img", { class: "ppb-qico", src: ASSETS + "step-icons/name.webp", alt: "", width: "256", height: "256", "data-ppb-qico": true, hidden: true });   // a later screen's own 3D icon
    // what a screen must keep in view with its button (the promise and the terms box on the confirm screen): it sits
    // directly above the foot, outside the part that scrolls, and takes its height from the options area
    el.pin = h("div", { class: "ppb-pin", "data-ppb-pin": true, hidden: true });
    /* START OVER IN THE PANEL (2026-10-12). The hero card's summary has had "Start over" since the fix pass; the panel had none, so a
       visitor who came in by a ZIP button, or by a launcher far from the card, found no way to begin again. The same quiet button
       stands at the end of the question row (where a later screen shows its icon), on the plan questions and the price, once
       something is answered: renderFrame() shows and hides it, placeOver() says on which line of the row it stands, and
       startOver() is the one function behind both buttons. */
    el.over = h("button", { class: "ppb-over ppb-over--panel", type: "button", "data-ppb-over": true, "aria-label": COPY.sum.overLabel, text: COPY.sum.over, hidden: true, onclick: startOver });
    el.body = h("div", { class: "ppb-body" }, h("div", { class: "ppb-qrow" }, el.q, el.hint, el.qico, el.over), el.optwrap, el.pin);
    el.back = h("button", { class: "ppb-back", type: "button", "data-ppb-back": true, text: COPY.back, onclick: pressBack });
    el.priceLabel = h("span", { class: "ppb-price__label" });
    el.priceAmt = h("strong", { class: "ppb-price__amt" });
    el.price = h("p", { class: "ppb-price", "data-ppb-price": true, "aria-live": "polite" }, pic(ICON.tag, 185, "ppb-price__ico", 256), el.priceLabel, el.priceAmt);
    el.nextLabel = h("span", { "data-ppb-next-label": true, text: COPY.next });
    el.next = h("button", { class: "ppb-next", type: "button", "data-ppb-next": true, "aria-describedby": "ppb-hint", onclick: pressNext }, el.nextLabel, pic(ICON.arrow, 22));
    el.foot = h("div", { class: "ppb-foot" }, el.back, el.price, el.next, h("span", { class: "ppb-morehint", "aria-hidden": "true", text: COPY.moreBelow,
      onclick: showMoreBelow, onmousedown: moreTabPress, onwheel: moreTabWheel, ontouchstart: moreTabTouch, ontouchmove: moreTabTouch, ontouchend: moreTabTouch }));
    el.stage = h("div", { class: "ppb-stage", role: "group", "aria-label": COPY.title, "data-ppb-stage": true, "data-ppb-mode": "inline", "data-ppb-titled": PAGE_TITLE ? true : null }, el.head, el.progress, el.body, el.foot);
    /* FIX 2026-10-10 (VERIFY-xbrowser N1). Firefox does not scroll a control into view when Tab lands on one that is
       partly showing, so in a short window a focused choice could sit mostly under the fade. A control reached BY TAB
       inside the part that scrolls is brought fully into view. Only by Tab: a pointer press must never move its target. */
    var tabbedAt = 0;
    el.stage.addEventListener("keydown", function (event) { if (event.key === "Tab") tabbedAt = Date.now(); }, true);
    el.opts.addEventListener("focusin", function (event) {
      var t = event.target;
      if (Date.now() - tabbedAt > 400 || !t || t === el.opts || !t.scrollIntoView) return;
      t.scrollIntoView({ block: "nearest", inline: "nearest" });
      scheduleMore();
    });

    store.flow().steps.forEach(function (s) {
      if (s.kind !== "plan" && s.kind !== "price") return;
      var pill = h("span", { class: "ppb-chip__pill" });
      var chip = h("button", { class: "ppb-chip", type: "button", "data-ppb-chip": s.id, hidden: true, onclick: function () { pressChip(s.id); } }, pill);
      var li = h("li", { role: "presentation", "data-ppb-seg": s.id }, h("span", { "aria-hidden": "true", text: COPY.seg[s.id] || s.id }), chip);
      el.progress.append(li);
      ui.segs.push({ id: s.id, li: li, chip: chip, pill: pill });
    });
    buildRequestSegs();
    if (win.ResizeObserver) new win.ResizeObserver(scheduleMore).observe(el.opts);
  }

  /* ---------------------------------------------------------------- 4 step registry */
  /* A step definition:
       q(state, flow)        the question (text)                       REQUIRED
       build(api)            returns the step's panel element, ONCE     REQUIRED
       update(state, changed, api)   sync the panel to the state. changed is the engine's list, or null for "everything"
       hint(state, flow)     the line beside the question
       say(state, flow)      the mascot's line
       count(state, flow)    the text where "Step 2 of 6" goes (plan steps get it automatically)
       nextLabel(state, flow) the primary button's words (default "Next")
       next(api)             what the primary button does (default store.next())
       blocked(errors, api)  the primary press was refused: show these [{ field, step, message }]
       showsOwnReason: true  the step prints the reason beside its own control, so the hint does not repeat it
       focus(api)            the element that takes focus when the step appears (default: the question)
       leave(api)            the step is about to be hidden
       owns: ["CODE"], onNotice(notice, api)   engine notices this step shows itself, beside its own control */
  function registerStep(id, definition) {
    steps[id] = definition;
    (definition.owns || []).forEach(function (code) { noticeOwners[code] = id; });
    if (ui.panels[id]) { ui.panels[id].remove(); delete ui.panels[id]; }
    if (el.stage && ui.step === id) { showStep(store.getState(), true); renderFrame(store.getState()); }
  }
  function stepDef(id) { return steps[id] || steps.dogs; }

  var api = {
    C: C, store: store, h: h, pic: pic, ICON: ICON, COPY: COPY, ui: ui, el: el,
    answer: answer, refresh: refresh, flashHint: flashHint, pressNext: pressNext, openPop: openPop, focusQuestion: focusQuestion
  };

  /* every answer goes through the engine; if it changed nothing, redraw anyway so local state (an opened row) shows */
  function answer(patch) { warmPoses(); var result = store.set(patch); if (!result.changed.length) refresh(); return result; }
  function took(result) { return Boolean(result) && result.ok !== false && !(result.rejected || []).length; }
  function refresh() {
    var state = store.getState(), def = stepDef(state.step);
    if (def.update && ui.panels[state.step]) def.update(state, null, api);
    renderFrame(state);
  }

  function showStep(state, quietly) {
    var id = state.step, def = stepDef(id), previous = ui.step;
    if (previous && previous !== id && steps[previous] && steps[previous].leave) steps[previous].leave(api);
    if (previous !== id) { cancelAuto(); ui.picked = ""; ui.floor = false; if (id !== "price") ui.kept = false; }
    ui.step = id; ui.blocked = false; ui.flash = "";
    if (id === "done" && previous !== id) ui.doneAt = Date.now();   // see pressNext (N4)
    if (id === "price" && previous !== id) ui.priceAt = Date.now();  // see pressNext (2026-10-18)
    if (id === "zip") warmPoses();                                   // its pose, if the visitor's first touch has not fetched it yet
    if (def.enter) def.enter(previous, api);
    if (!ui.panels[id]) {
      var panel = def.build(api, id);
      panel.classList.add("ppb-panel");
      panel.setAttribute("data-ppb-step", id);
      ui.panels[id] = panel;
      el.opts.append(panel);
    }
    Object.keys(ui.panels).forEach(function (key) { ui.panels[key].hidden = key !== id; });
    el.stage.setAttribute("data-ppb-current", id);
    setText(el.q, def.q(state, store.flow()));
    el.opts.scrollTop = 0;
    el.optwrap.scrollTop = 0; el.body.scrollTop = 0;   // boxes that only clip can still be scrolled by a script or by find-in-page: every screen starts at the top
    el.stage.scrollTop = 0;                            // in a very short window the whole stage scrolls (builder.css, M4)
    if (def.update) def.update(state, null, api);
    if (!quietly) focusStep();
  }

  /* What a screen keeps in view with its button sits directly above the foot, outside the part that scrolls.
     A step names it with pinned(state): an element made in its build(), or null (nothing pinned right now). */
  /* AUDIT FIX M4. In a short window (a phone on its side, a laptop at 200% zoom: 480px of height or less) there is no
     room to hold anything in view beside the button: the pinned block took the whole answers area and the summary was a
     16px slit. There the block goes back to the END of the screen's own panel, inside the part that scrolls; the button
     stays in the foot. SHORT follows the window as it is resized or turned. */
  var SHORT = "(max-height: 480px)", FLOOR = 96;   // FLOOR: the least height the answers area may be left with (updateMore measures it and sets ui.floor)
  function syncPin(state) {
    var def = stepDef(ui.step), panel = ui.panels[ui.step], pinned = def.pinned && panel ? def.pinned(state) : null;
    var inFlow = Boolean(pinned) && (media(SHORT) || ui.floor === true);
    // moving the block takes focus off whatever was focused inside it (the terms box after a refused Send): it is given back, in view
    var held = pinned && pinned.contains(doc.activeElement) ? doc.activeElement : null, moved = false;
    if (pinned && inFlow) { if (pinned.parentNode !== panel || panel.lastChild !== pinned) { panel.append(pinned); moved = true; } pinned = null; }
    else if (pinned && pinned.parentNode !== el.pin) moved = true;
    else if (!pinned && def.pinned && panel) {      // nothing to pin right now (a locked reply): take it out of the panel too
      each(panel, ":scope > [data-ppb-pinned]", function (node) { node.remove(); });
    }
    if (pinned) { if (el.pin.firstChild !== pinned || el.pin.childNodes.length > 1) el.pin.replaceChildren(pinned); }
    else if (el.pin.firstChild) el.pin.replaceChildren();
    el.pin.hidden = !pinned;
    el.stage.toggleAttribute("data-ppb-pinned", Boolean(pinned));
    el.stage.toggleAttribute("data-ppb-unpinned", inFlow);
    if (held && moved && doc.contains(held)) { held.focus({ preventScroll: true }); if (inFlow) { el.opts.scrollTop = el.opts.scrollHeight; held.scrollIntoView({ block: "nearest" }); } }
  }

  /* One tap is the answer on the single-choice questions (dogs, yard size): the tile shows its selected
     state for about a quarter of a second, then the builder moves on by itself, exactly as the Next button would.
     Next stays where it is for the keyboard and for going on from a question that is already answered.
     2026-10-18 (owner-approved price-skip fix): NOT on "How often?". There the moving-on put the price screen up under the
     visitor's finger, and the next tap, meant for Next, landed on "Request service" in the same place: the price, "Text me
     this quote", "Save this quote for 7 days" and the no-start-up-fee note were skipped. A tap there only chooses; the
     button, "See my price", moves on; and the price screen's own button rests for PRICE_REST_MS after it appears. */
  var AUTO_MS = 260;
  function cancelAuto() { if (ui.auto > 0) win.clearTimeout(ui.auto); ui.auto = 0; }
  function tapAnswer(stepId, patch) {
    cancelAuto();
    ui.auto = -1;                                  // set before the engine reports the change, so the hero card keeps the tapped tile on show
    var result = answer(patch);
    if (took(result)) autoNext(stepId); else { ui.auto = 0; syncHero(); }
    return result;
  }
  function autoNext(stepId) {
    cancelAuto();
    ui.auto = win.setTimeout(function () {
      ui.auto = 0;
      var state = store.getState(), flow = store.flow();
      if (state.step !== stepId || ui.step !== stepId || isFrozen(state)) return;
      if (flow.primaryAction !== "next" || flow.disablePrimary) { refresh(); syncHero(); return; }
      pressNext();
      if (store.getState().step === stepId) { refresh(); syncHero(); }   // the engine kept the visitor here: the card settles
    }, AUTO_MS);
  }
  function focusQuestion() { el.q.focus({ preventScroll: true }); }
  function focusStep() {
    var active = doc.activeElement;
    var mine = !active || active === doc.body || el.stage.contains(active) || (el.sheet && el.sheet.contains(active)) || (el.bar && el.bar.contains(active)) || (el.sum && el.sum.contains(active));
    if (!mine) return;                              // the visitor is busy elsewhere on the page: do not take the focus away
    if (!doc.contains(el.stage)) return;            // the hero card shows the summary and the panel is closed: nothing of the stage is on screen
    var def = stepDef(ui.step), target = def.focus ? def.focus(api) : null;
    (target || el.q).focus({ preventScroll: true });
  }

  /* ---------------------------------------------------------------- 5 frame */
  function renderFrame(state) {
    var flow = store.flow(), def = stepDef(state.step), frozen = isFrozen(state);
    setText(el.title, def.title ? def.title(state, flow) : COPY.title);
    setText(el.q, def.q(state, flow));
    var count = countText(state, flow, def);
    setText(el.count, count);
    el.progress.setAttribute("aria-label", COPY.progress + (count ? ": " + count : ""));
    var icon = def.icon ? def.icon(state, flow) : "";
    el.qico.hidden = !icon;
    if (icon && el.qico.getAttribute("src") !== ASSETS + icon) el.qico.setAttribute("src", ASSETS + icon);
    el.stage.setAttribute("data-ppb-phase", isLater(state.step) ? "later" : "plan");
    renderProgress(state, flow, frozen);
    renderHint(state, flow, def);
    renderSay(state, flow, def);
    renderNotice(state);
    // foot: Back is always there; it rests on the first question, while sending, after a locked reply and on the done screen
    el.back.disabled = !flow.back;
    // Next: a later screen says what its button reads and when it rests (def.foot); the plan questions follow the engine
    var foot = def.foot ? def.foot(state, flow) : null;
    setText(el.nextLabel, foot ? foot.label || COPY.next : def.nextLabel ? def.nextLabel(state, flow) : COPY.next);
    el.next.classList.toggle("is-off", foot ? Boolean(foot.hidden) : flow.primaryAction === "none");
    el.next.classList.toggle("is-busy", Boolean(foot && foot.busy));
    el.next.classList.toggle("is-plain", Boolean(foot && foot.arrow === false));
    el.next.setAttribute("aria-disabled", String(foot ? Boolean(foot.busy) : Boolean(flow.disablePrimary)));
    if (el.close) el.close.disabled = Boolean(state.submitting);       // a request being sent is never hidden
    // Start over, in the panel only: once something is answered, on the plan questions and the price (a later screen has its icon there, and Back to the price)
    var over = ui.mode === "dialog" && hasProgress(state) && !isLater(state.step) && !frozen;
    el.over.hidden = !over;
    if (!over) el.stage.removeAttribute("data-ppb-has-over");
    else if (!el.stage.hasAttribute("data-ppb-has-over")) el.stage.setAttribute("data-ppb-has-over", "");
    placeOver();
    var bar = store.priceBar();
    if (state.step === "done" && state.receipt && state.receipt.alreadyReached) {
      var receipt = state.receipt, frequency = frequencyOption(receipt.frequencyId);
      bar.kind = receipt.custom ? "custom" : "exact";
      bar.headline = receipt.priceText;
      bar.priceLabel = receipt.custom ? "" : C.formatMoney(receipt.priceCents);
      bar.unit = frequency ? frequency.unit || "" : "";
    }
    var parts = priceParts(bar);
    renderPrice(bar, parts);
    renderBar(bar, parts);
    syncPin(state);
    scheduleMore();
  }

  function countText(state, flow, def) {
    var here = flowStep(flow, state.step);
    if (!here || (here.kind !== "plan" && here.kind !== "price")) return def.count ? def.count(state, flow) : "";
    /* a question this page answered for the visitor (a one-ZIP city page) stays out of the count for the whole visit, even
       after it is opened from its chip: the price screen never turns from "Step 5 of 5" into "Step 6 of 6" */
    if (!ui.countSkip) ui.countSkip = flow.steps.filter(function (s) { return s.skipped; }).map(function (s) { return s.id; });
    var asked = flow.steps.filter(function (s) { return (s.kind === "plan" || s.kind === "price") && !s.skipped && !has(ui.countSkip, s.id); });
    var at = asked.map(function (s) { return s.id; }).indexOf(state.step);
    if (state.editReturn || at < 0) return COPY.editing;
    return COPY.stepOf(at + 1, asked.length);
  }

  /* progress: a bar for the question in hand and those ahead; a chip for every answer already given */
  function chipText(id, row, state, awayFromPrice) {
    if (!row || !row.value) return "";
    if (id === "price") return awayFromPrice ? (store.quote().priceLabel || row.value) : "";
    if (id === "zip") return state.zip;
    if (id === "areas") return state.areas.length > 1 ? COPY.areasCount(state.areas.length) : row.value;
    if (id === "yard") return row.value.replace(/^up to\s+/i, "");
    return row.value;
  }
  function renderProgress(state, flow, frozen) {
    var later = isLater(state.step);                 // request, confirm, done: the plan becomes one chip and the band counts the request screens
    ui.segs.forEach(function (seg) { seg.li.hidden = later; });
    if (later) { renderRequestProgress(state, frozen); return; }
    ui.rsegs.forEach(function (seg) { seg.li.hidden = true; });
    var rows = {}, order = flow.steps.map(function (s) { return s.id; });
    store.planSummary().forEach(function (row) { rows[row.step] = row; });
    var gap = order.indexOf("price") - order.indexOf(state.step);
    var awayFromPrice = gap < 0 || gap >= 2;
    ui.segs.forEach(function (seg) {
      var s = flowStep(flow, seg.id) || {}, row = rows[seg.id];
      var text = !s.current && s.complete ? chipText(seg.id, row, state, awayFromPrice) : "";
      seg.li.classList.toggle("is-chip", Boolean(text));
      seg.li.classList.toggle("is-current", Boolean(s.current));   // (no aria-current: the item is presentational, and the group's own name says "Step 2 of 6". Audit fix m11.)
      seg.chip.hidden = !text;
      if (text) {
        setText(seg.pill, text);
        seg.chip.setAttribute("aria-label", seg.id === "price" ? COPY.seePrice(row.value, text) : COPY.change(row.label, row.value, text));
        seg.chip.disabled = frozen;
      }
    });
  }
  function pressChip(id) {
    var result = id === "price" ? store.goTo("price") : store.edit(id);
    if (result && !result.ok && result.reason) flashHint(result.reason);
  }

  function renderHint(state, flow, def) {
    var alert = Boolean(ui.flash || (ui.blocked && flow.blockedReason));
    if (ui.auto && !alert && el.hint.textContent) return;   // a tile was just tapped and the builder is about to move on: the line beside the question holds still
    var own = def.hint ? def.hint(state, flow) : "";
    var text = ui.flash || (ui.blocked && !def.showsOwnReason && flow.blockedReason) || own || "";
    setText(el.hint, text);
    el.hint.classList.toggle("is-alert", alert);
  }
  function nudge(node) {
    if (QUIET) return;
    node.classList.remove("is-nudge"); void node.offsetWidth; node.classList.add("is-nudge");
  }
  /* say why a control did nothing (a resting Next, an unavailable option) in the hint's place */
  function flashHint(text) { ui.flash = text; renderHint(store.getState(), store.flow(), stepDef(ui.step)); nudge(el.hint); }

  function renderSay(state, flow, def) {
    var line = (def.say ? def.say(state, flow) : "") || "";
    if (line === ui.said) return;
    var first = ui.said === "";
    ui.said = line;
    el.say.textContent = line;
    if (!first && !QUIET) { el.avatar.classList.remove("is-bop"); void el.avatar.offsetWidth; el.avatar.classList.add("is-bop"); }
  }

  /* heads-up: something the engine changed by itself (a frequency that no longer fits, a saved plan notice).
     It lies over the mascot's words so that nothing below it moves. */
  function takeNotices(state, info) {
    var fresh = (info.notices || []).filter(function (notice) {
      var owner = noticeOwners[notice.code];
      if (!owner) return true;
      if (steps[owner] && steps[owner].onNotice) steps[owner].onNotice(notice, api);
      return false;
    });
    var stepChanged = has(info.changed, "step");
    if (fresh.length) {
      // rides: it came with a one-tap answer, which moves on by itself a moment later, so it is read on the screen that follows
      ui.notice = { text: fresh.map(function (n) { return n.message; }).join(" "), goTo: fresh[0].goToStep || "", carried: stepChanged, rides: ui.auto === -1 };
    } else if (ui.notice) {
      if (stepChanged) {
        // it travels once: with the tap that caused it, or to the question it is about, or to the price it changed
        if (ui.notice.rides) { ui.notice.rides = false; ui.notice.carried = true; }
        else if (!ui.notice.carried && (state.step === ui.notice.goTo || state.step === "price")) ui.notice.carried = true;
        else ui.notice = null;
      } else if (info.reason === "set") ui.notice = null;   // the visitor has answered something since
    }
  }
  function renderNotice(state) {
    var text = "";
    if (state.resumeLoading) text = C.RESUME_MESSAGES.loadingTitle + " " + C.RESUME_MESSAGES.loadingDetail;
    else if (state.resumeNotice && state.resumeNotice !== ui.noticeOff) text = state.resumeNotice;
    else if (ui.notice) text = ui.notice.text;
    var was = el.notice.hidden ? "" : el.noticeText.textContent, loading = Boolean(state.resumeLoading);
    el.notice.classList.toggle("is-loading", loading);                 // nothing to dismiss yet: a spinner instead of "Got it"
    el.noticeBtn.setAttribute("aria-disabled", String(loading));
    if (loading) el.stage.setAttribute("aria-busy", "true"); else el.stage.removeAttribute("aria-busy");
    el.notice.hidden = !text;
    if (text) setText(el.noticeText, text);
    if (text && text !== was && (state.resumeLoading || state.resumeNotice)) el.noticeBtn.focus({ preventScroll: true });
  }
  function dismissNotice() {
    var state = store.getState();
    if (state.resumeLoading) return;
    ui.notice = null; ui.noticeOff = state.resumeNotice || "";
    renderNotice(state);
    focusQuestion();
  }

  /* the pinned price in the foot: the engine's own line, in the same place on every step */
  /* Until the exact price is known the line is the FIXED starting price (owner decision, October 5): the engine's own
     calculator (C.calculateQuote) prices one dog, the smallest yard and one area. It does not move with the answers.
     With nothing answered it is the engine's own line, "Weekly visits from $19.99". A plan button (data-quote-plan) that
     opened the builder makes it that plan's line instead, until a frequency is chosen. Never a number for a custom estimate.
     2026-10-21 (owner, on his phone): the starting line stayed on screen while the plan question showed the visitor's exact
     prices (Weekly $28.99 above "Weekly visits from $19.99": "even I was taken aback"). So the starting line now shows only
     before the first answer. After it the line is words, no number: "Building your price", and on the plan question
     "Pick a plan". Once a plan is picked: "Per visit" over the number. Still never a figure that
     climbs with each answer. Claude and ChatGPT agreed on this separately (releases/2026-10-21-builder-price-bar-and-scroll). */
  function priceParts(bar) {
    var state = store.getState(), words = { label: "", amount: bar.headline, unit: "", words: true };
    if (bar.kind === "exact") {
      var unitLabel = COPY.unitLabel(bar.unit);
      return { label: unitLabel || COPY.yourPrice, amount: bar.priceLabel, unit: bar.unit, unitInLabel: Boolean(unitLabel), words: false };
    }
    if (bar.kind === "custom" || bar.kind === "out_of_area") return words;
    var prefer = !state.frequency && ui.prefer ? ui.prefer : "", option = prefer ? frequencyOption(prefer) : null;
    if (option && option.custom) return { label: "", amount: option.label, unit: "", words: true };
    if (prefer === "onetime") return { label: COPY.line.oneTime(C.ONE_TIME.includedMinutes), amount: C.formatMoney(C.ONE_TIME.baseCents), unit: "", words: false };
    if (bar.kind !== "from" && !option) return words;                    // still building (6 or more dogs): the engine's words, no number
    if (hasProgress(state)) return { label: "", amount: state.step === "frequency" ? COPY.line.choose : COPY.line.building, unit: "", words: true };   // 2026-10-21
    var fromLabel = bar.kind === "from" ? bar.headline.replace(bar.priceLabel, "").trim() : "";
    var open = true;   // OWNER DECISION (October 5): a FIXED starting line until the exact price is known. A figure that climbs with each answer would reveal the add-on amounts he ruled out before the summary.
    var quote = C.calculateQuote({ dogs: C.DOG_OPTIONS[0].id, frequencyId: prefer || "weekly", yardSizeId: C.YARD_SIZES[0].id, areaIds: [C.AREAS[0].id] });
    if (!quote.ok || quote.custom || quote.priceCents == null) return bar.kind === "from" ? { label: fromLabel, amount: bar.priceLabel, unit: "", words: false } : words;
    var label = option && prefer !== "weekly" ? (open ? COPY.line.from(option.label) : option.label) : fromLabel ? (open ? fromLabel : COPY.line.known(fromLabel)) : (open ? COPY.line.from(option.label) : option.label);
    var known = !open && (option || frequencyOption("weekly"));
    return { label: label, amount: C.formatMoney(quote.priceCents), unit: known ? known.unit || "" : "", words: false };
  }
  function fillPrice(labelNode, amountNode, parts) {
    if (labelNode) setText(labelNode, parts.label);
    amountNode.textContent = parts.amount;
    if (parts.unit && !(labelNode && parts.unitInLabel)) amountNode.append(h("small", { text: parts.unit }));   // the pinned bar has no label: it keeps the unit
  }
  function priceKey(bar, parts) { return [bar.kind, parts.label, parts.amount, parts.unit].join("|"); }
  function renderPrice(bar, parts) {
    var key = priceKey(bar, parts);
    if (key === ui.priceKey) return;
    ui.priceKey = key;
    el.price.classList.toggle("is-words", parts.words);
    el.price.setAttribute("data-ppb-price", bar.kind);
    fillPrice(el.priceLabel, el.priceAmt, parts);
  }

  var PRICE_REST_MS = 600;  // 2026-10-18: how long "Request service" rests after the price screen appears: a fast second tap meant for "See my price" does nothing
  var DONE_REST_MS = 700;   // how long the done screen's own button rests after the screen appears (N4): longer than any double tap, shorter than anyone can read the screen and mean Done
  function pressBack() { var def = stepDef(ui.step); if (def.back && def.back(api)) return; store.back(); }
  function pressNext() {
    var flow = store.flow(), def = stepDef(ui.step);
    if (def.foot) {                                 // a later screen: its own button and its own checks
      if (el.next.classList.contains("is-off") || el.next.classList.contains("is-busy")) return;
      // FIX 2026-10-10 (VERIFY-xbrowser N4): Send and Done are the same button in the same place. A second tap on Send
      // that arrives just as the done screen appears must not close it before "Your request is in!" has been seen.
      if (ui.step === "done" && Date.now() - (ui.doneAt || 0) < DONE_REST_MS) return;
      def.next(api);
      return;
    }
    if (ui.step === "price" && Date.now() - (ui.priceAt || 0) < PRICE_REST_MS) return;   // 2026-10-18: see PRICE_REST_MS
    if (flow.primaryAction === "none") return;
    if (flow.disablePrimary) {                      // resting: say why, in words, where the eye already is
      ui.blocked = true; ui.flash = "";
      if (def.blocked) def.blocked(flow.blockedErrors, api);
      renderHint(store.getState(), flow, def); nudge(el.hint);
      return;
    }
    if (def.next) { def.next(api); return; }
    var went = store.next();
    if (!went.ok && def.blocked) def.blocked(went.errors, api);
  }

  /* "there is more below": only while the options area really overflows */
  /* 2026-10-21 (owner, on his phone): the "More below" tab looks like a button and gets tapped, so a tap now scrolls the
     answers most of a screen down, or to the end when little would be left. Still not a keyboard stop or read aloud: the
     part that scrolls already is one. The tab sits outside that part, so a swipe or a wheel that starts on it is passed
     on (it used to fall through to whatever lay under it, the SMS consent text on "How do we reach you?"), and pressing
     it leaves the focus where it is (a field being typed in keeps its keyboard). */
  /* px still hidden below before the tab shows. 8: the box's own bottom padding (4px) and a tile's shadow are no reason to
     show it. Not more: with Chrome's strip on an Android phone the panel is shorter, and the owner saw "Custom quote" and the
     areas note cut by 12 to 22 px with no tab (24 was tried that morning). A tap on the tab then goes to the end. */
  var MORE_TAB_MIN = 8;
  function showMoreBelow() {
    var box = el.opts, left = box.scrollHeight - box.clientHeight - box.scrollTop, step = Math.max(80, Math.round(box.clientHeight * 0.7));
    box.scrollBy({ top: left - step < box.clientHeight * 0.25 ? left : step, behavior: QUIET ? "auto" : "smooth" });
  }
  function moreTabPress(event) { event.preventDefault(); }
  function moreTabWheel(event) { event.preventDefault(); el.opts.scrollBy(0, event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.opts.clientHeight : 1)); }
  var moreDragY = null;
  function moreTabTouch(event) {
    var touch = event.touches[0];
    if (!touch) { moreDragY = null; return; }
    if (event.type === "touchmove" && moreDragY != null) el.opts.scrollTop += moreDragY - touch.clientY;
    moreDragY = touch.clientY;
  }
  var moreQueued = false;
  function scheduleMore() { if (moreQueued) return; moreQueued = true; win.requestAnimationFrame(function () { moreQueued = false; updateMore(); }); }
  function updateMore() {
    var box = el.opts, more = [];
    if (box.scrollTop > 2) more.push("above");
    var below = box.scrollHeight - box.clientHeight - box.scrollTop;
    if (below > 2) more.push("below");
    el.optwrap.setAttribute("data-more", more.join(" "));   // the fade: from 2 px
    el.stage.setAttribute("data-ppb-more", more.filter(function (m) { return m !== "below" || below > MORE_TAB_MIN; }).join(" "));   // the tab
    // M4, the floor: a pinned block that leaves the answers less than FLOOR px goes back into the part that scrolls (until the window changes or the screen does)
    if (!el.pin.hidden && !ui.floor && box.clientHeight < FLOOR && doc.contains(el.stage)) { ui.floor = true; syncPin(store.getState()); }
    el.stage.style.setProperty("--ppb-pin-h", (el.pin.hidden ? 0 : el.pin.offsetHeight) + "px");   // the "More below" tab sits on the edge of the part that scrolls
    var panel = ui.panels[ui.step];
    el.optwrap.toggleAttribute("data-spare", Boolean(panel && box.clientHeight - panel.offsetHeight > 150));
    // a scrolling step with nothing to focus inside it gets a tab stop of its own; with controls inside, focus already scrolls it
    var needsStop = box.scrollHeight > box.clientHeight + 2 && !(panel && panel.querySelector("button:not([disabled]):not([hidden]), input:not([disabled]), textarea, a[href]"));
    if (needsStop) { box.tabIndex = 0; box.setAttribute("role", "group"); box.setAttribute("aria-label", COPY.scrollLabel); }
    else { box.removeAttribute("tabindex"); box.removeAttribute("role"); box.removeAttribute("aria-label"); }
    placeOver();                                    // the window was resized or turned, or the site's typeface has arrived
  }
  /* ON WHICH LINE the panel's Start over stands (2026-10-12). At the end of the question's own line. When the question's words
     reach that far (the one long question, "This one gets a custom quote", on a phone; any question while a wider stand-in
     typeface is on show because the site's own has not loaded), it stands one line lower, at the end of the hint's line, and the
     hint keeps clear of it (builder.css, data-ppb-has-over="low"). So the question never wraps or moves because of the button.
     Measured in the panel's own pixels: while the panel grows out of the card it is drawn smaller, and the words with it. */
  function placeOver() {
    if (el.over.hidden || !doc.contains(el.stage)) return;
    var drawn = el.stage.getBoundingClientRect().width, own = el.stage.offsetWidth;
    if (!drawn || !own) return;
    var words = doc.createRange(); words.selectNodeContents(el.q);
    var low = words.getBoundingClientRect().width * own / drawn > el.over.offsetLeft - 8 ? "low" : "";
    if (el.stage.getAttribute("data-ppb-has-over") !== low) el.stage.setAttribute("data-ppb-has-over", low);
  }

  /* ---------------------------------------------------------------- 6 the steps */
  function tile(attrs) {
    var all = { class: "ppb-tile", type: "button", "aria-pressed": "false" }, key;
    for (key in attrs) all[key] = attrs[key];
    var node = h("button", all);
    for (var i = 1; i < arguments.length; i++) if (arguments[i]) node.append(arguments[i]);
    return node;
  }
  function press(node, on) { node.setAttribute(node.getAttribute("role") === "checkbox" ? "aria-checked" : "aria-pressed", String(Boolean(on))); }
  function each(panel, selector, fn) { Array.prototype.forEach.call(panel.querySelectorAll(selector), fn); }

  /* ---- dogs: 1 to 4 as picture tiles; "5 or more" opens 5 to 10+ in its own slot ---- */
  registerStep("dogs", {
    q: function () { return COPY.dogs.q; },
    hint: function (state) { return state.dogCount ? COPY.dogs.ok : COPY.dogs.need; },
    say: SAY.dogs,
    build: function () {
      var self = this;
      var main = C.DOG_OPTIONS.filter(function (o) { return o.group === "main"; });
      var more = C.DOG_OPTIONS.filter(function (o) { return o.group !== "main"; });
      var word = function (label, n) { return label.split(" ")[n] || ""; };
      var first = more.length ? word(more[0].label, 0) : "", last = more.length ? word(more[more.length - 1].label, 0) : "";
      var choose = function (id, inMore) { if (!inMore) ui.moreOpen = false; tapAnswer("dogs", { dogCount: id }); };
      self.wide = h("button", { class: "ppb-tile ppb-tile--wide", type: "button", "aria-expanded": "false", "aria-controls": "ppb-more-row", "data-ppb-dogs-more": true,
        onclick: function () { ui.moreOpen = true; refresh(); var one = self.row.querySelector("button"); if (one) one.focus({ preventScroll: true }); } },
        pic(ICON.dog(more.length ? more[0].id : "5"), 192, "ppb-tile__pic"),
        h("span", null, h("span", { class: "ppb-tile__label", text: COPY.dogs.more(first) }), h("span", { class: "ppb-tile__sub", text: COPY.dogs.moreSub(first, last) })),
        h("span", { class: "ppb-tile__caret", "aria-hidden": "true" }));
      self.row = h("div", { class: "ppb-morerow", id: "ppb-more-row", role: "group", "aria-label": COPY.dogs.moreGroup, hidden: true,
        onkeydown: function (event) {               // Escape puts "5 or more" back, unless one of these is the answer
          if (event.key !== "Escape" || self.inMore(store.getState().dogCount)) return;
          event.stopPropagation(); event.preventDefault();
          ui.moreOpen = false; refresh(); self.wide.focus({ preventScroll: true });
        } },
        more.map(function (o) {
          return tile({ class: "ppb-tile ppb-tile--num", "data-ppb-dogs": o.id, "aria-label": o.label, onclick: function () { choose(o.id, true); } },
            h("b", { text: word(o.label, 0) }), h("span", { text: word(o.label, 1) }));
        }));
      return h("div", null, h("div", { class: "ppb-tiles ppb-tiles--4", role: "group", "aria-labelledby": "ppb-q" },
        main.map(function (o) {
          return tile({ "data-ppb-dogs": o.id, onclick: function () { choose(o.id, false); } }, pic(ICON.dog(o.id), 192, "ppb-tile__pic"), h("span", { class: "ppb-tile__label", text: o.label }));
        }),
        more.length ? h("div", { class: "ppb-more", "data-ppb-more": true }, self.wide, self.row) : null));
    },
    inMore: function (id) { var option = dogOption(id); return Boolean(option && option.group !== "main"); },
    update: function (state) {
      var panel = ui.panels.dogs, open = ui.moreOpen || this.inMore(state.dogCount);
      each(panel, "[data-ppb-dogs]", function (node) { press(node, node.getAttribute("data-ppb-dogs") === state.dogCount); });
      this.wide.hidden = open; this.row.hidden = !open;
      this.wide.setAttribute("aria-expanded", String(open));
    },
    leave: function () { ui.moreOpen = false; }
  });

  /* ---- ZIP: checked by the engine the moment it is complete ---- */
  registerStep("zip", {
    owns: ["ZIP_OUT_OF_AREA"],
    showsOwnReason: true,
    q: function () { return COPY.zip.q; },
    hint: function () {
      var status = store.checkZip().status;
      return status === "in_area" ? COPY.zip.ok : status === "out_of_area" ? COPY.zip.out : status === "empty" && (CITY.zips.length || this.againZip()) ? COPY.zip.pick(CITY.zips.length || 1) : COPY.zip.need;
    },
    say: SAY.zip,
    build: function () {
      var self = this, copy = C.OUT_OF_AREA_COPY, brand = C.BRAND, offered = CITY.zips.length > 0;
      self.tried = false; self.status = "";
      // A city page whose community has several accepted ZIPs (CITY): each one a one-tap choice above the field, which stays for a different ZIP.
      // A tap is the answer: the same store.set({ zip }) as the last digit typed, then on by itself the way Next goes (tapAnswer).
      self.chips = [];
      self.picks = offered ? h("div", { class: "ppb-zippick", role: "group", "aria-labelledby": "ppb-zippick-label", "data-ppb-zip-picks": CITY.name },
        h("p", { class: "ppb-zippick__label", id: "ppb-zippick-label", text: COPY.zip.city(CITY.name, CITY.zips.length) }),
        // up to three: one row of large chips. More: a compact grid, at most 6 across in the phone sheet and 9 across in the dialog (18 make 3 rows or 2)
        h("div", { class: "ppb-zippick__grid" + (CITY.zips.length > 3 ? " ppb-zippick__grid--many" : ""),
          style: "--ppb-zips:" + Math.max(2, Math.min(CITY.zips.length, 6)) + ";--ppb-zips-wide:" + Math.max(2, Math.min(CITY.zips.length, 9)) }, CITY.zips.map(function (zip) {
          var chip = h("button", { class: "ppb-zipchip", type: "button", "aria-pressed": "false", "data-ppb-zip-pick": zip, text: zip, onclick: function () { tapAnswer("zip", { zip: zip }); } });
          self.chips.push(chip);
          return chip;
        }))) : null;
      /* AFTER START OVER (2026-10-12): the ZIP that a link or a ZIP button of the page handed over is offered again here as ONE one-tap
         choice (ui.again, set by startOver), with the field under it for a different ZIP. It is never kept silently and never lost.
         Only on a page that offers no ZIPs of its own (there the page's ZIP buttons are these same choices). update() shows it. */
      self.againChip = offered ? null : h("button", { class: "ppb-zipchip", type: "button", "aria-pressed": "false", "data-ppb-zip-again": true,
        onclick: function () { if (self.againZip()) tapAnswer("zip", { zip: ui.again }); } });
      self.again = offered ? null : h("div", { class: "ppb-zippick", role: "group", "aria-labelledby": "ppb-zipagain-label", "data-ppb-zip-again-box": true, hidden: true },
        h("p", { class: "ppb-zippick__label", id: "ppb-zipagain-label", text: COPY.zip.again }),
        h("div", { class: "ppb-zippick__grid", style: "--ppb-zips:2;--ppb-zips-wide:2" }, self.againChip));
      self.input = h("input", { class: "field__input ppb-zip__input", id: "ppb-zip", name: "zip", type: "text", inputmode: "numeric", pattern: "[0-9]*", autocomplete: "postal-code",
        maxlength: "5", placeholder: offered ? COPY.zip.other : COPY.zip.placeholder, "aria-labelledby": "ppb-q", "aria-describedby": "ppb-zip-msg", "aria-required": "true", "data-ppb-zip": true,
        oninput: function () {
          var before = store.checkZip().status;
          var result = store.set({ zip: self.input.value }), kept = store.getState().zip;
          if (self.input.value !== kept) self.input.value = kept;       // the engine keeps digits only
          if (!result.changed.length) refresh();
          /* AUDIT FIX M1. A phone's digits-only pad has no Return key and covers Next, the answer and, for a ZIP
             outside the area, the Text and Call buttons. So on a touch screen the keyboard is put away the moment
             the fifth digit completes the ZIP (as the request screens already do, enterKey), and an accepted ZIP
             moves on by itself the way a tapped ZIP choice does (autoNext: the same press of Next, a quarter of a
             second later). With a mouse or trackpad nothing changes: the field keeps focus and Enter continues. */
          var after = store.checkZip().status;
          if (FINE_POINTER || after === before || (after !== "in_area" && after !== "out_of_area")) return;
          var hadFocus = doc.activeElement === self.input;
          if (hadFocus) self.input.blur();
          // FIX 2026-10-10 (VERIFY-xbrowser N2): with the field blurred nothing held focus, so a screen reader was left on
          // the page body behind the panel. The out-of-area answer takes it (it is focusable and is where focus() puts it too).
          if (hadFocus && after === "out_of_area" && !self.ooa.hidden) self.ooa.focus({ preventScroll: true });
          if (after === "in_area" && took(result) && store.getState().step === "zip") autoNext("zip");
        },
        onkeydown: function (event) { if (event.key === "Enter") { event.preventDefault(); pressNext(); } } });
      self.msg = h("p", { class: "ppb-zip__msg", id: "ppb-zip-msg", "data-ppb-zip-msg": true, "aria-live": "polite" });
      // out of area: the engine's own wording, the phone number as a link, and nothing collected
      self.ooaTitle = h("p", { class: "ppb-ooa__title" });
      var edgeText = h("p", { class: "ppb-ooa__text" }, h("b", { text: copy.edgeLead }), " ", withReachLinks(copy.edgeBody));
      // AUDIT FIX m2: the Text and Call buttons come directly under the answer, before the explanation, so they are in
      // the first view at a phone's real height (they sat last, under the fade). Same sentences, same parts, new order.
      self.ooa = h("div", { class: "ppb-ooa", role: "alert", tabindex: "-1", "data-ppb-ooa": true, hidden: true },
        h("div", { class: "ppb-ooa__copy ppb-ooa__lead" }, h("p", { class: "ppb-ooa__kicker", text: copy.kicker }), self.ooaTitle),
        reachButtons("btn--secondary", "ppb-ooa__reach"),
        h("div", { class: "ppb-ooa__copy ppb-ooa__help" }, h("p", { class: "ppb-ooa__text", text: String(copy.help).replace("correct it below.", "correct it above.") })),
        GLOVED_PAGE ? h("span", { class: "puck puck--sq puck--lg ppb-ooa__pin" }, pic(ICON.pin, 256, null, 239))
          : h("span", { class: "stand stand--mound ppb-ooa__pose" }, latePic(ICON.sorry, 597, null, 900)),
        h("div", { class: "ppb-ooa__copy ppb-ooa__edge" }, edgeText));
      // in the panel he stands on the ground line and presents the question (not on the gloved pages, and not where the ZIP choices need the room; the out-of-area answer has its own pose)
      self.scene = GLOVED_PAGE || offered ? null : h("div", { class: "ppb-zip__scene", "aria-hidden": "true" }, h("span", { class: "stand stand--mound ppb-zip__pose" }, latePic(ICON.present, 598, null, 900)));
      self.root = h("div", { class: "ppb-zip" + (offered ? " ppb-zip--picks" : "") }, self.picks, self.again,
        h("div", { class: "ppb-zip__field" }, pic(ICON.pin, 256, "ppb-zip__ico", 239), self.input), self.msg, self.ooa, self.scene);
      return self.root;
    },
    /* the ZIP to offer again after Start over, or "": only once the panel is built, only an accepted ZIP */
    againZip: function () { return this.again && ui.again && C.checkZip(ui.again).inArea ? ui.again : ""; },
    update: function (state) {
      var self = this, check = store.checkZip(), was = self.status;
      if (self.input.value !== state.zip) self.input.value = state.zip;
      self.chips.forEach(function (chip) { press(chip, chip.getAttribute("data-ppb-zip-pick") === state.zip); });   // the chip of the ZIP in hand, however it got there
      var again = self.againZip();                   // after Start over: the handed-over ZIP as one choice above the field
      if (self.again) {
        self.again.hidden = !again;
        if (again) { setText(self.againChip, again); press(self.againChip, again === state.zip); }
        self.root.classList.toggle("ppb-zip--picks", Boolean(again));
        var hold = again ? COPY.zip.other : COPY.zip.placeholder;
        if (self.input.getAttribute("placeholder") !== hold) self.input.setAttribute("placeholder", hold);
      }
      if (check.status === "in_area" || check.status === "empty") self.tried = false;
      self.status = check.status;
      var out = check.status === "out_of_area", bad = out || (self.tried && check.status === "incomplete");
      self.input.setAttribute("aria-invalid", String(bad));
      self.input.setAttribute("aria-describedby", out ? "ppb-zip-msg ppb-zip-ooa" : "ppb-zip-msg");
      self.ooa.id = "ppb-zip-ooa";
      self.ooa.hidden = !out;
      if (self.scene) self.scene.hidden = out || Boolean(again);   // the choice needs the room, as the city pages' choices do
      self.msg.hidden = out;
      self.msg.className = "ppb-zip__msg" + (check.status === "in_area" ? " is-ok" : bad ? " is-bad" : "");
      if (check.status === "in_area") {
        self.msg.replaceChildren(pic(ICON.ok, 256), h("span", null, h("b", { text: COPY.zip.served(townOf(check)) }), COPY.zip.servedSub(check.zip)));
      } else if (bad && !out) {
        self.msg.replaceChildren(pic(ICON.alert, 18), h("span", { text: check.message }));
      } else if (!out) setText(self.msg, COPY.zip.waiting);
      if (out) {
        setText(self.ooaTitle, check.message);
        if (was !== "out_of_area" && doc.activeElement === self.input) self.input.select();   // ready to be typed over
      }
    },
    focus: function () {
      if (store.checkZip().status === "out_of_area") return this.ooa;
      if (this.chips.length || this.againZip()) return null;   // the one-tap choices come first: the question takes focus and the first Tab stop is the first chip
      return FINE_POINTER ? this.input : null;     // never push a phone keyboard up over the card
    },
    blocked: function () {
      this.tried = true; this.update(store.getState());
      this.input.focus({ preventScroll: true });
      if (store.checkZip().status === "out_of_area") this.input.select();
    },
    onNotice: function () { /* the out-of-area answer is drawn by update(), beside the field */ },
    leave: function () { this.tried = false; }
  });

  /* ---- yard size: five pictures at stepped sizes ---- */
  registerStep("yard", {
    q: function () { return COPY.yard.q; },
    hint: function (state) { return state.yardSize ? COPY.yard.ok : COPY.yard.need; },
    say: SAY.yard,
    build: function () {
      var self = this, sizes = C.YARD_SIZES;
      self.guide = h("button", { class: "ppb-link", type: "button", "aria-haspopup": "dialog", "aria-label": COPY.yard.guideLabel, "data-ppb-yard-guide": true, text: COPY.yard.guide,
        onclick: function () { store.track("yard_size_help_opened"); openYardGuide(self.guide); } });
      return h("div", null,
        h("div", { class: "ppb-tiles ppb-tiles--yard", role: "group", "aria-labelledby": "ppb-q" }, sizes.map(function (size, index) {
          var parts = /^(up to|over)\s+(.+)$/i.exec(size.label);
          var label = parts ? h("span", { class: "ppb-tile__label" }, h("small", { text: parts[1] }), " ", parts[2])   /* the space: read as "Up to ¼ acre", the tile's name (m10) */ : h("span", { class: "ppb-tile__label", text: size.label });
          return tile({ class: "ppb-tile ppb-tile--yard", "data-ppb-yard": size.id, "aria-label": size.label, style: "--i:" + index, onclick: function () { tapAnswer("yard", { yardSize: size.id }); } },
            h("span", { class: "ppb-tile__plot" }, pic(ICON.yard[size.id] || ICON.yard.s, 256, "ppb-tile__pic")), label);
        })),
        h("div", { class: "ppb-yardrow" },
          sizes.length ? h("span", { class: "tag tag--gold ppb-most" }, pic(ICON.star, 18), COPY.yard.most(sizes[0].label)) : null, self.guide));
    },
    update: function (state) { each(ui.panels.yard, "[data-ppb-yard]", function (node) { press(node, node.getAttribute("data-ppb-yard") === state.yardSize); }); }
  });

  /* ---- areas: tick-box tiles, nothing preselected, tap again to remove ---- */
  registerStep("areas", {
    q: function () { return COPY.areas.q; },
    hint: function (state) { return state.areas.length ? COPY.areas.ok : COPY.areas.need; },
    say: SAY.areas,
    build: function () {
      return h("div", null,
        h("div", { class: "ppb-tiles ppb-tiles--3", role: "group", "aria-labelledby": "ppb-q" }, C.AREAS.map(function (area) {
          return tile({ role: "checkbox", "aria-pressed": null, "aria-checked": "false", "data-ppb-area": area.id, onclick: function () { store.toggleArea(area.id); } },
            pic(ICON.area[area.id] || ICON.area.back, 192, "ppb-tile__pic"), h("span", { class: "ppb-tile__label", text: area.label }));
        })),
        h("p", { class: "ppb-note", text: COPY.areas.note }));
    },
    update: function (state) { each(ui.panels.areas, "[data-ppb-area]", function (node) { press(node, has(state.areas, node.getAttribute("data-ppb-area"))); }); }
  });

  /* ---- how often: every option the engine lists, ONE exact price each, unavailable ones with the reason ---- */
  registerStep("frequency", {
    q: function () { return COPY.frequency.q; },
    hint: function (state) { return state.frequency ? (ui.picked === state.frequency ? COPY.frequency.picked : COPY.frequency.ok) : COPY.frequency.need; },
    say: SAY.frequency,
    nextLabel: function () { return COPY.frequency.next; },
    build: function () {
      var self = this;
      self.rows = {};
      return h("div", null, h("div", { class: "ppb-tiles ppb-freq", role: "group", "aria-labelledby": "ppb-q" }, store.frequencyOptions().map(function (option) {
        var row = { label: h("span", { class: "ppb-tile__label" }), sub: h("span", { class: "ppb-tile__sub" }), why: h("span", { class: "ppb-tile__why" }), price: h("span", { class: "ppb-tile__price" }) };
        row.flag = option.popular ? h("span", { class: "ppb-tile__flag", text: COPY.frequency.popular }) : null;
        row.node = tile({ class: "ppb-tile ppb-tile--row", "data-ppb-freq": option.id,
          onclick: function () {
            if (row.node.getAttribute("aria-disabled") === "true") { flashHint(row.why.textContent); return; }   // say why, do nothing else
            ui.prefer = ""; ui.picked = "";
            cancelAuto();
            answer({ frequency: option.id });   // 2026-10-18: chooses only; "See my price" moves on (see tapAnswer)
          } },
          pic(ICON.freq[option.id] || ICON.freq.custom, 192, "ppb-tile__pic"), row.label, row.flag, row.sub, row.why, row.price);
        self.rows[option.id] = row;
        return row.node;
      })));
    },
    update: function () {
      var rows = this.rows;
      store.frequencyOptions().forEach(function (option) {
        var row = rows[option.id];
        if (!row) return;
        setText(row.label, option.label); setText(row.sub, option.sub || ""); setText(row.why, option.reason || "");
        row.price.textContent = option.priceLabel || "";
        if (option.priceLabel && option.unit) row.price.append(h("small", { text: option.unit }));
        row.node.classList.toggle("ppb-tile--noprice", !option.priceLabel);
        row.node.setAttribute("aria-disabled", String(!option.available));
        press(row.node, option.selected);
      });
    }
  });

  /* ---- price: the number large and proud, line items ONLY here, and three ways forward ---- */
  registerStep("price", {
    q: function () { var quote = store.quote(); return quote.custom ? COPY.price.qCustom : quote.oneTime ? COPY.price.qOneTime : COPY.price.q; },
    say: SAY.price,
    nextLabel: function () { var first = store.intentOptions()[0]; return first ? first.label : COPY.next; },
    next: function () { this.go(store.intentOptions()[0].id); },
    go: function (intent) { store.set({ intent: intent }); store.next(); },
    build: function () {
      var self = this, copy = COPY.price;
      self.ribbon = h("span", { class: "ribbon ppb-total__ribbon" });
      self.amount = h("strong", { class: "ppb-total__amt", "data-ppb-total": true });
      // no start-up fee (new recurring customers): the whole strip opens the short explanation
      self.feeTitle = h("b", { class: "ppb-fee__title" });
      self.feeSub = h("span", { class: "ppb-fee__sub" });
      self.fee = h("button", { class: "ppb-fee", type: "button", "aria-haspopup": "dialog", "data-ppb-how": true,
        onclick: function () { var note = store.offerNote(); store.track("promotion_details_viewed", { promotion: note.title }); openHow(note, self.fee); } },
        pic(ICON.zero, 256), h("span", { class: "ppb-fee__txt" }, self.feeTitle, self.feeSub), h("span", { class: "ppb-fee__how", text: copy.how }));
      // one-time, custom and restart terms: the sentences come from the engine, numbers untouched
      self.terms = h("div", { class: "ppb-terms", "data-ppb-terms": true, hidden: true });
      self.ways = {};
      self.waysWhy = h("p", { class: "ppb-ways__why", id: "ppb-ways-why", hidden: true });
      self.waysBox = h("div", { class: "ppb-ways", "data-ppb-ways": true }, store.intentOptions().slice(1).map(function (option) {
        var words = copy.ways[option.id] || {};
        var way = { label: h("b"), node: null };
        way.node = h("button", { class: "ppb-way", type: "button", "data-ppb-intent": option.id,
          onclick: function () { if (way.node.getAttribute("aria-disabled") === "true") { flashHint(self.waysWhy.textContent); return; } self.go(option.id); } },
          words.icon ? pic(ICON[words.icon], 256, "ppb-way__ico") : words.mark ? h("span", { class: "ppb-way__ico ppb-way__mark", "aria-hidden": "true", text: words.mark }) : null,
          words.lead ? h("small", { text: words.lead }) : null, way.label);
        self.ways[option.id] = way;
        return way.node;
      }), self.waysWhy);
      self.lines = h("div", { class: "ppb-lines", "data-ppb-lines": true });
      // AUDIT FIX m11: a list holds list items only. The title sits beside the <ol> and names it.
      self.nextsTitle = h("p", { class: "ppb-nexts__title", id: "ppb-nexts-title", text: copy.nextTitle });
      self.nextsList = h("ol", { class: "ppb-nexts__list", "aria-labelledby": "ppb-nexts-title" });
      self.nexts = h("div", { class: "ppb-nexts", "data-ppb-nexts": true }, self.nextsTitle, self.nextsList);
      // save for 7 days: a link with nothing personal in it (the demo stub of the engine in review builds)
      self.saveKey = "";
      self.saveStatus = h("p", { class: "ppb-save__status", role: "status", "aria-live": "polite", tabindex: "-1", "data-ppb-save-status": true, hidden: true });
      self.saveUrl = h("input", { class: "field__input ppb-save__url", type: "text", readonly: true, "aria-label": copy.linkLabel, "data-ppb-save-url": true, onfocus: function () { self.saveUrl.select(); } });
      self.saveRow = h("div", { class: "ppb-save__row", hidden: true }, self.saveUrl,
        h("button", { class: "ppb-save__copy", type: "button", "data-ppb-save-copy": true, text: copy.copy, onclick: function () { self.copy(); } }));
      self.saveBtn = h("button", { class: "ppb-link", type: "button", "data-ppb-save": true, text: copy.save, onclick: function () { self.save(); } });
      return h("div", { class: "ppb-pricepanel" },
        self.total = h("div", { class: "ppb-total" }, self.ribbon, self.amount),
        h("div", { class: "ppb-pricepanel__a" }, self.fee, self.waysBox, h("div", { class: "ppb-save" }, self.saveBtn, self.saveStatus, self.saveRow)),
        h("div", { class: "ppb-pricepanel__b" }, self.lines, self.terms),
        self.nexts);
    },
    update: function (state) {
      var self = this, copy = COPY.price, quote = store.quote(), note = store.offerNote(), intents = store.intentOptions();
      if (!quote.ready) return;
      // the price. A custom estimate never shows a number.
      var priced = quote.priceCents != null;
      setText(self.ribbon, quote.frequencyLabel || "");
      self.total.hidden = !priced;                 // no number to be proud of: the custom-review note leads instead
      if (priced) self.amount.replaceChildren(h("span", { class: "spark", text: quote.priceLabel }), h("small", { text: quote.unit }));
      else self.amount.textContent = "";
      // the offer note that applies
      var fresh = note.kind === "new_recurring";
      self.fee.hidden = !fresh; self.terms.hidden = fresh;
      if (fresh) { setText(self.feeTitle, note.title); setText(self.feeSub, note.facts && note.facts.appliesTo ? "for " + note.facts.appliesTo : ""); }
      else self.terms.replaceChildren.apply(self.terms, [h("p", { class: "ppb-terms__title", text: note.title })].concat((note.paragraphs || []).map(function (text) { return h("p", { text: text }); })));
      // the other ways forward, disabled with the reason the engine gives when they do not apply
      var why = "";
      intents.slice(1).forEach(function (option) {
        var way = self.ways[option.id];
        if (!way) return;
        var words = copy.ways[option.id] || {};
        setText(way.label, words.label || option.label);
        way.node.setAttribute("aria-disabled", String(!option.available));
        if (option.available) way.node.removeAttribute("aria-describedby"); else { way.node.setAttribute("aria-describedby", "ppb-ways-why"); why = why || option.reason; }
      });
      self.waysWhy.hidden = !why; setText(self.waysWhy, why);
      // line items: here and nowhere else
      self.lines.hidden = !quote.lineItems.length;
      var rows = [h("p", { class: "ppb-lines__title", text: copy.lines })].concat(quote.lineItems.map(function (item) {
        return h("p", { class: "ppb-lines__row" }, h("span", { text: item.label }), h("b", { text: item.amount }));
      }));
      if (quote.lineItems.length > 1) rows.push(h("p", { class: "ppb-lines__row is-total" }, h("span", { text: copy.totalRow(quote.unit) }), h("b", { text: quote.priceLabel })));
      if (quote.note) rows.push(h("p", { class: "ppb-lines__note", text: quote.note }));
      self.lines.replaceChildren.apply(self.lines, rows);
      // what happens next
      var list = copy.nexts[quote.custom ? "custom" : quote.oneTime ? "onetime" : "recurring"];
      self.nextsList.replaceChildren.apply(self.nextsList, list.map(function (item, index) {
        return h("li", null, pic(ICON[item[0]], 256), h("span", null, h("b", { text: item[1] }), " ", index === 0 ? C.PROMISES.nothingCharged : item[2]));
      }));
      // a saved link belongs to one plan: a changed plan starts clean
      var key = [state.dogCount, state.zip, state.yardSize, state.areas.join("+"), state.frequency].join("|");
      if (key !== self.saveKey) { self.saveKey = key; self.saveRow.hidden = true; self.saveStatus.hidden = true; self.saveBusy = false; }
    },
    saveSays: function (text, bad) {
      this.saveStatus.hidden = false; this.saveStatus.classList.toggle("is-bad", Boolean(bad));
      setText(this.saveStatus, text); scheduleMore();
    },
    save: function () {
      var self = this, words = C.SAVE_LINK_MESSAGES, key = self.saveKey;
      if (self.saveBusy) return;
      self.saveBusy = true; self.saveSays(words.working);
      store.createSaveLink().then(function (result) {
        if (key !== self.saveKey) return;            // the plan changed while the link was being made
        self.saveBusy = false;
        if (result.ok && result.url) { self.saveUrl.value = result.url; self.saveRow.hidden = false; self.saveSays(words.created); }
        else { self.saveRow.hidden = true; self.saveSays(result.message || words.fallback, true); }
        self.saveStatus.focus({ preventScroll: true });
        var box = self.saveBtn.parentNode;
        el.opts.scrollTop = Math.max(el.opts.scrollTop, box.offsetTop + box.offsetHeight + 16 - el.opts.clientHeight);
      });
    },
    copy: function () {
      var self = this, words = C.SAVE_LINK_MESSAGES;
      var manual = function () { self.saveSays(words.copyManually); self.saveUrl.focus({ preventScroll: true }); self.saveUrl.select(); };
      if (!win.navigator.clipboard || !win.navigator.clipboard.writeText) { manual(); return; }
      win.navigator.clipboard.writeText(self.saveUrl.value).then(function () { self.saveSays(words.copied); self.saveStatus.focus({ preventScroll: true }); }, manual);
    }
  });

  /* ================================================================ 6b the request: who, how to reach you, where and when */
  /* Words written for the request, confirm and done screens. Everything the engine words itself (field labels, hints,
     option names, messages, the consent and terms wording, the promises) is read from the engine when it is drawn. */
  COPY.form = {
    legend: "* Required",
    q: {
      service_request: { who: "Who is this for?", reach: "How do we reach you?", where: "Where and when?" },
      quote_delivery: { who: "Who gets the quote?", reach: "Where do we send it?" },
      question: { who: "What’s your question?", reach: "Where do we reply?" }
    },
    seg: { plan: "Plan", who: "You", reach: "Reply", where: "Yard", confirm: "Check" },
    segChange: { who: "Go back to who this is for", reach: "Go back to how we reach you", where: "Go back to where and when" },
    review: "Review request", reviewChanges: "Review changes",
    errorsTitle: "Please check the following:"
  };
  COPY.confirm = {
    title: "One last look", q: "Everything right?",
    plan: "Your plan", planHint: "tap to change",
    rows: { who: "You", reach: "Reply", where: "Yard", question: "Question" },
    edit: "Edit",
    editLabel: { who: "Edit your details", reach: "Edit how we reach you", where: "Edit where and when", question: "Edit your question" },
    lastCleaned: function (value) { return "Last full cleanup: " + lowerFirst(value); },
    promiseLead: "A request, not a booking.", readTerms: "Read the terms", termsKicker: "The terms for this request",
    submit: { service_request: "Send my request", quote_delivery: "Send my quote", question: "Send my question" },
    sending: "Sending…", retry: "Try again",
    fail: {
      timeout: "We are not sure that went through.", network: "We are not sure that went through.", unavailable: "We are not sure that went through.",
      no_receipt: "We are not sure that went through.",
      rejected: "That did not go through.", blocked: "This page cannot send requests.",
      server_invalid: "A detail needs another look.", invalid: "A detail needs another look.",
      kept: "Everything you entered is still here."
    },
    locked: { kicker: "One more step", title: "Please text or call us to confirm.", ref: "Your reference", frozen: "Nothing on this screen can be changed or sent again." }
  };
  COPY.done = {
    title: "Received",
    q: { service_request: "Your request is in!", quote_delivery: "Your quote request is in.", question: "Your question is in." },
    watch: function (where) { return "Watch " + where + " for our reply."; },
    lead: {
      recurring: "Our team will confirm the best recurring service day for your area. Your service is not scheduled until you approve the proposed day.",
      onetime: "Our team will review the cleanup details and reply with availability.",
      custom: "Our team will review your yard and reply with your custom price and the best service day for your area.",
      other: function (phone) { return "Questions in the meantime? Text " + phone + " or call."; }
    },
    ref: "Reference", received: "Request received.", nextTitle: "What happens next",
    newQuote: "Start a new quote", close: "Done", demo: "Review build: nothing was sent.",
    staging: "Staging test: sent to the staging address only."            // never on the live site (store.mode is "staging" only on a test page)
  };

  ICON.name = "step-icons/name.webp"; ICON.house = "step-icons/house.webp"; ICON.email = "step-icons/email.webp";
  ICON.fresh = "step-icons/customer-new.webp"; ICON.celebrate = "brand/poses/celebrate.webp"; ICON.relax = "brand/poses/relax.webp";
  var CONTACT_ICON = { text: "chat", call: "call", email: "email" };
  var STATUS_ICON = { "new": "fresh", returning: "returning" };          // "not sure" gets a drawn question mark
  var PICK_ORDER = { preferredContact: ["text", "call", "email"] };      // the order in the brief; anything the engine adds later goes last
  var INPUT_NAME = { firstName: "fname", lastName: "lname", phone: "phone", email: "email", address: "address", city: "city", zip: "zip", question: "question" };
  var INPUT_CAPS = { firstName: "words", lastName: "words", address: "words", city: "words", email: "none" };

  /* the mascot on the later screens: light and warm, never about money or permission */
  SAY.request = function (state) {
    var screen = steps.request.screenId(state);
    if (screen === "who") {
      if (state.intent === "question") return "Ask away. I’m all ears.";
      if (state.intent === "quote_delivery") return "Good thinking. I’ll send it right over.";
      return ({ "new": "A new friend! Glad you’re here.", returning: "Welcome back! I missed that lawn.", not_sure: "No problem. We’ll check our notes." })[state.customerStatus] || "Almost there. Who should I say hello to?";
    }
    if (screen === "reach") {
      return ({ text: "Text works. I’m quick with my thumbs.", call: "A call it is. I’ll use my inside voice.", email: "Email it is. I’ll keep it short." })[state.preferredContact] || "How should I get back to you?";
    }
    var timing = C.START_TIMING_OPTIONS.indexOf(state.startTiming);
    return ["Soon it is. I’ll warm up the scooper.", "Next week sounds great to me.", "A few weeks out. No sweat.", "Just looking? Look all you like."][timing] || "Last one. Where’s this lucky lawn?";
  };
  SAY.confirm = function (state) {
    if (state.locked) return "Let’s sort this one out by text or phone.";
    if (state.submitting) return "Sending it over…";
    if (steps.confirm.failed) return ["timeout", "network", "unavailable", "no_receipt"].indexOf(steps.confirm.failed.status) >= 0 ? "Hmm. I did not hear back on that one." : "Hmm. That one didn’t go through.";
    return "One last look. Then it’s over to me.";
  };
  SAY.done = function (state) {
    return state.receipt && state.receipt.intent === "service_request" ? "It’s in! This calls for a happy dance." : "It’s in. Go put your feet up.";
  };

  function isLater(step) { return step === "request" || step === "confirm" || step === "done"; }
  function chosenIntent() { return store.intentOptions().filter(function (o) { return o.selected; })[0] || store.intentOptions()[0]; }
  function linkParts(parts) {
    return parts.map(function (part) { return part.href ? h("a", { class: "ppb-a", href: part.href, target: "_blank", rel: "noopener", text: part.text }) : part.text; });
  }
  /* TEXT FIRST (owner decision, October 8). One place for every offer of a text or a call inside the builder.
     The engine's sentences offer a call only ("Please try again or call (317) 961-5865."); its wording is not the builder's
     to change, so the offer is completed where it is shown: "… or text (317) 961-5865 or call." Text comes first and carries
     the number (it opens a text to that number); "call" is the second link. Nothing else in the sentence is touched. */
  var SMS_HREF = String(C.BRAND.phoneHref).replace(/^tel:/, "sms:");
  function reachWords(text) {
    var s = String(text || ""), phone = C.BRAND.phoneDisplay;
    if (/\btext\b[^.]*\bcall\b/i.test(s)) return s;                                       // already text first
    s = s.split("Call " + phone).join("Text " + phone + " or call").split("call " + phone).join("text " + phone + " or call");
    s = s.replace(/\b([Cc])all (Purge Pros|us)\b/g, function (m, c, who) { return (c === "C" ? "Text" : "text") + " or call " + who; });
    return s.replace(/(\w) or (text )/g, "$1, or $2");                                        // "try again, or text … or call"
  }
  function withReachLinks(text) {
    var brand = C.BRAND, s = reachWords(text), out = [], last = 0, at, lead;
    var offers = ["Text " + brand.phoneDisplay + " or call", "text " + brand.phoneDisplay + " or call"];
    for (;;) {
      at = -1; lead = "";
      offers.forEach(function (offer) { var i = s.indexOf(offer, last); if (i > -1 && (at < 0 || i < at)) { at = i; lead = offer; } });
      if (at < 0) break;
      if (at > last) out.push(s.slice(last, at));
      out.push(h("a", { class: "ppb-a", href: SMS_HREF, text: lead.slice(0, lead.length - 8) }), " or ", h("a", { class: "ppb-a", href: brand.phoneHref, text: "call" }));
      last = at + lead.length;
    }
    /* a number in wording this helper does not know stays a link, and it is the text link */
    s.slice(last).split(brand.phoneDisplay).forEach(function (bit, index) { if (index) out.push(h("a", { class: "ppb-a", href: SMS_HREF, text: brand.phoneDisplay })); if (bit) out.push(bit); });
    return out;
  }
  /* the pair of buttons: Text with the number first (the filled one), then Call */
  function reachButtons(textClass, extra) {
    var brand = C.BRAND, r = COPY.reach;
    return h("div", { class: "ppb-reach" + (extra ? " " + extra : ""), "data-ppb-reach": true },
      h("a", { class: "btn " + (textClass || "btn--secondary") + " btn--sm ppb-reach__text", href: SMS_HREF, "data-ppb-text": true }, pic("brand-icons/pp-visit-message.webp", 20), r.text(brand.phoneDisplay)),
      h("a", { class: "btn btn--outline btn--sm ppb-reach__call", href: brand.phoneHref, "data-ppb-call": true, "aria-label": r.callLabel(brand.phoneDisplay) }, pic("brand-icons/pp-phone.webp", 20), r.call));
  }
  /* "No — I’m a new customer" is shown as a short answer with its explanation under it; the words are the engine’s */
  function splitLabel(label) { var parts = /^(.+?)\s+[—\/]\s+(.+)$/.exec(label); return parts ? [parts[1], parts[2]] : [label, ""]; }
  /* bring a control inside the options area into view without moving the page */
  function reveal(node) {
    if (!el.opts.contains(node)) return;            // pinned above the foot: already in view
    var box = el.opts.getBoundingClientRect(), at = node.getBoundingClientRect();
    if (at.top < box.top + 8) el.opts.scrollTop += at.top - box.top - 12;
    else if (at.bottom > box.bottom - 8) el.opts.scrollTop += Math.min(at.top - box.top - 12, at.bottom - box.bottom + 14);
    scheduleMore();
  }

  /* progress on the later screens: the plan is one gold chip, then one segment per request screen, then the check */
  var RSEGS = ["plan", "who", "reach", "where", "confirm"];
  function buildRequestSegs() {
    ui.rsegs = RSEGS.map(function (id) {
      var pill = h("span", { class: "ppb-chip__pill" });
      var chip = h("button", { class: "ppb-chip", type: "button", "data-ppb-chip": "r-" + id, hidden: true, onclick: function () { pressRequestChip(id); } }, pill);
      var li = h("li", { role: "presentation", "data-ppb-seg": "r-" + id, hidden: true }, h("span", { "aria-hidden": "true", text: COPY.form.seg[id] }), chip);
      el.progress.append(li);
      return { id: id, li: li, chip: chip, pill: pill };
    });
  }
  function pressRequestChip(id) {
    var state = store.getState(), def = steps.request;
    if (id === "plan") { var went = store.goTo("price"); if (went && !went.ok && went.reason) flashHint(went.reason); return; }
    var at = def.screens(state).indexOf(id);
    if (at < 0) return;
    if (state.step === "request") def.go(at);
    else { def.target = at; def.reviewing = state.step === "confirm"; store.goTo("request"); }
  }
  function renderRequestProgress(state, frozen) {
    var def = steps.request, list = def.screens(state), quote = store.quote(), done = state.step === "done";
    var here = state.step === "request" ? def.screenId(state) : state.step;
    var order = ["plan"].concat(list, ["confirm"]), at = done ? order.length : order.indexOf(here);
    var priceRow = store.planSummary().filter(function (row) { return row.step === "price"; })[0];
    ui.rsegs.forEach(function (seg) {
      var index = order.indexOf(seg.id);
      seg.li.hidden = index < 0;
      if (index < 0) return;
      var passed = index < at, text = "";
      if (passed && !done) text = seg.id === "plan" ? (quote.priceLabel || COPY.form.seg.plan) : COPY.form.seg[seg.id];
      seg.li.classList.toggle("is-chip", Boolean(text));
      seg.li.classList.toggle("is-current", index === at);
      seg.li.classList.toggle("is-done", passed && done);
      seg.chip.hidden = !text;
      if (text) {
        setText(seg.pill, text);
        seg.chip.setAttribute("aria-label", seg.id === "plan" ? COPY.seePrice(priceRow ? priceRow.value : text, text) : text + ": " + lowerFirst(COPY.form.segChange[seg.id]));   // "You: go back to who this is for" (m10)
        seg.chip.disabled = frozen;
      }
    });
  }

  /* ---- form controls. One object per field: node, sync(state, rule), setError(message), target() ---- */
  function fieldError(id, key) {
    return h("p", { class: "field__error", id: id, "data-ppb-field-error": key, hidden: true }, pic(ICON.alert, 18), h("span"));
  }
  function makeField(form, screen, rule) {
    var key = rule.key, id = "ppb-f-" + screen + "-" + key;
    var f = { key: key, screen: screen, id: id, input: null, buttons: null };
    f.star = h("span", { class: "ppb-req", "aria-hidden": "true", text: " *" });
    f.labelText = h("span");
    f.help = h("p", { class: "field__help", id: id + "-help", hidden: true });
    f.err = fieldError(id + "-err", key);
    f.setError = function (message) {
      var on = Boolean(message);
      f.err.hidden = !on;
      if (on) setText(f.err.lastChild, message);
      f.node.classList.toggle("is-invalid", on);
      if (f.input) { if (on) f.input.setAttribute("aria-invalid", "true"); else f.input.removeAttribute("aria-invalid"); }
      else if (f.buttons) { if (on) f.node.setAttribute("aria-invalid", "true"); else f.node.removeAttribute("aria-invalid"); }   // a one-tap choice group: the group itself says it is missing
    };
    f.common = function (rule) {
      setText(f.labelText, rule.label || "");
      f.star.hidden = !rule.required;
      var hint = rule.hint || "";
      f.help.hidden = !hint;
      setText(f.help, hint);
    };

    if (rule.control === "checkbox") {
      /* the text-message permission: the engine’s wording, never pre-ticked, only ever ticked by the visitor’s own tap */
      f.input = h("input", { type: "checkbox", id: id, name: key, "aria-required": "true", "aria-describedby": id + "-alt " + id + "-err", "data-ppb-consent": true,
        onchange: function () { store.set({ smsConsent: f.input.checked }); var kept = store.getState().smsConsent; if (f.input.checked !== kept) f.input.checked = kept; } });
      f.alt = h("p", { class: "ppb-consent__alt", id: id + "-alt" });
      f.node = h("div", { class: "ppb-consent", "data-ppb-field": key },
        h("label", { class: "check ppb-check" }, f.input, h("span", { class: "check__box", "aria-hidden": "true" }),
          h("span", { class: "ppb-check__txt" }, h("span", { class: "ppb-req", "aria-hidden": "true", text: "* " }), h("strong", { text: rule.lead }), " " + rule.body)),
        f.err, f.alt);
      f.altFor = null;
      f.sync = function (state) {
        if (f.input.checked !== state.smsConsent) f.input.checked = state.smsConsent;
        var withCall = state.intent !== "quote_delivery";
        if (f.altFor !== withCall) { f.altFor = withCall; f.alt.replaceChildren.apply(f.alt, linkParts(C.wording.consentAlternativeParts(withCall))); }
      };
      f.target = function () { return f.input; };
      return f;
    }

    if (rule.control === "choice") {
      f.buttons = {};
      var order = PICK_ORDER[key] || [];
      var rank = function (value) { var at = order.indexOf(value); return at < 0 ? order.length : at; };
      var list = rule.choices.map(function (choice, index) { return { choice: choice, index: index }; }).sort(function (a, b) { return rank(a.choice.value) - rank(b.choice.value) || a.index - b.index; });
      f.box = h("div", { class: "choices ppb-picks ppb-picks--" + key });
      list.forEach(function (item) {
        var choice = item.choice, parts = key === "customerStatus" ? splitLabel(choice.label) : [choice.label, ""];
        var icon = key === "preferredContact" ? CONTACT_ICON[choice.value] : key === "customerStatus" ? STATUS_ICON[choice.value] : "";
        var art = icon ? pic(ICON[icon], 256, "ppb-pick__ico") : key === "customerStatus" ? h("span", { class: "ppb-pick__ico ppb-way__mark", "aria-hidden": "true", text: "?" }) : null;
        var button = h("button", { class: "choice ppb-pick", type: "button", "aria-pressed": "false", "aria-label": choice.label, "data-ppb-pick": key, "data-value": choice.value, "data-i": String(item.index),
          onclick: function () { form.pick(f, choice.value); } },
          art, h("span", { class: "ppb-pick__txt" }, h("b", { text: parts[0] }), parts[1] ? " " : null, parts[1] ? h("small", { text: parts[1] }) : null));   // the space keeps the two parts apart when read as one name (m10)
        f.buttons[choice.value] = button;
        f.box.append(button);
      });
      f.star = h("span", { class: "ppb-req" }, h("span", { "aria-hidden": "true", text: " *" }), h("span", { class: "vh", text: " (required)" }));
      f.note = h("p", { class: "ppb-fieldnote", role: "status", hidden: true });
      f.node = h("div", { class: "field ppb-field ppb-field--" + key, role: "group", "aria-labelledby": id + "-label", "aria-describedby": id + "-help " + id + "-err", "data-ppb-field": key },
        h("span", { class: "field__label", id: id + "-label" }, f.labelText, f.star), f.box, f.err, f.note, f.help);
      f.sync = function (state, rule) {
        f.common(rule);
        var live = {};
        rule.choices.forEach(function (choice) { live[choice.value] = choice; });
        Object.keys(f.buttons).forEach(function (value) {
          var button = f.buttons[value], choice = live[value];
          button.hidden = !choice;
          button.setAttribute("aria-pressed", String(Boolean(choice && choice.selected)));
          button.classList.toggle("is-selected", Boolean(choice && choice.selected));
        });
        f.box.setAttribute("data-count", String(rule.choices.length));
      };
      f.target = function () { return f.box.querySelector('[aria-pressed="true"]:not([hidden])') || f.box.querySelector("button:not([hidden])"); };
      return f;
    }

    /* a typed field: label always on show, 16px or larger, the right keyboard and autofill hint */
    var area = rule.control === "textarea";
    f.input = h(area ? "textarea" : "input", {
      class: "field__input" + (area ? " ppb-textarea" : ""), id: id, name: INPUT_NAME[key] || key,
      type: area ? null : rule.control === "tel" ? "tel" : rule.control === "email" ? "email" : "text",
      inputmode: rule.inputMode || (rule.control === "email" ? "email" : null), pattern: rule.control === "zip" ? "[0-9]*" : null,
      autocomplete: rule.autocomplete || "off", autocapitalize: INPUT_CAPS[key] || null, spellcheck: area ? null : "false",
      maxlength: rule.maxLength || null, placeholder: rule.placeholder || null, rows: area ? "3" : null, enterkeyhint: area ? null : "next",
      "aria-describedby": id + "-help " + id + "-err", "data-ppb-input": key,
      oninput: function () { form.typed(f); },
      onkeydown: area ? null : function (event) { if (event.key === "Enter") { event.preventDefault(); form.enterKey(f); } } });
    f.node = h("div", { class: "field ppb-field ppb-field--" + key, "data-ppb-field": key },
      h("label", { class: "field__label", for: id }, f.labelText, f.star), f.input, f.help, f.err);
    f.sync = function (state, rule) {
      f.common(rule);
      if (rule.required) f.input.setAttribute("aria-required", "true"); else f.input.removeAttribute("aria-required");
      var value = state[key] == null ? "" : String(state[key]);
      if (form.typing !== f && f.input.value !== value) f.input.value = value;
    };
    f.target = function () { return f.input; };
    return f;
  }

  registerStep("request", {
    owns: ["CONSENT_CLEARED", "CONTACT_CHANGED"],
    showsOwnReason: true,
    sub: 0, target: null, reviewing: false, typing: null, flagged: {}, server: {}, noteText: "", noteFresh: false, restartKey: "",
    /* one engine step, shown as short screens: who, how to reach you, where and when */
    screens: function (state) { return state.intent === "service_request" ? ["who", "reach", "where"] : ["who", "reach"]; },
    screenId: function (state) { var list = this.screens(state); return list[Math.max(0, Math.min(this.sub, list.length - 1))]; },
    isLast: function (state) { return this.sub >= this.screens(state).length - 1; },
    title: function () { return chosenIntent().label; },
    q: function (state) { var set = COPY.form.q[state.intent] || COPY.form.q.service_request; return set[this.screenId(state)] || set.who; },
    hint: function () { return COPY.form.legend; },
    say: SAY.request,
    count: function (state) { var n = this.screens(state).length + 1; return COPY.stepOf(Math.min(this.sub + 1, n - 1), n); },
    icon: function (state) { var id = this.screenId(state); return id === "reach" ? ICON[CONTACT_ICON[state.preferredContact] || "chat"] : id === "where" ? ICON.house : ICON.name; },
    foot: function (state) {
      var last = this.isLast(state);
      return { label: this.reviewing ? COPY.form.reviewChanges : last ? COPY.form.review : COPY.next, arrow: !this.reviewing && !last };
    },
    build: function () {
      var self = this, rules = {};
      store.fieldRules("service_request").forEach(function (rule) { rules[rule.key] = rule; });
      self.fields = [];
      var make = function (screen, key) { var f = makeField(self, screen, rules[key]); self.fields.push(f); return f; };
      var who = { question: make("who", "question"), firstName: make("who", "firstName"), lastName: make("who", "lastName"), customerStatus: make("who", "customerStatus"), referredBy: make("who", "referredBy"), lastCleaned: make("who", "lastCleaned") };
      var reach = { preferredContact: make("reach", "preferredContact"), phone: make("reach", "phone"), email: make("reach", "email"), smsConsent: make("reach", "smsConsent") };
      var where = { address: make("where", "address"), city: make("where", "city"), zip: make("where", "zip"), startTiming: make("where", "startTiming"), lastCleaned: make("where", "lastCleaned") };
      self.method = reach.preferredContact;
      self.status = who.customerStatus;
      // returning or not sure: the engine’s restart terms, numbers untouched
      self.restart = h("div", { class: "ppb-terms ppb-restart", "data-ppb-restart": true, role: "status", hidden: true });
      self.nameRow = h("div", { class: "ppb-row2 ppb-row2--name" }, who.firstName.node, who.lastName.node);
      // the phone hint and the coverage line run the full width under their rows
      self.reachRow = h("div", { class: "ppb-row2 ppb-row2--reach" }, reach.phone.node, reach.email.node, reach.phone.help);
      self.zipHelp = h("p", { class: "field__help ppb-zipok", id: "ppb-f-where-zip-ok", hidden: true }, pic(ICON.ok, 256), h("span"));
      where.zip.input.setAttribute("aria-describedby", where.zip.input.getAttribute("aria-describedby") + " ppb-f-where-zip-ok");
      self.zipRow = h("div", { class: "ppb-row2 ppb-row2--zip" }, where.city.node, where.zip.node, self.zipHelp);
      self.errorList = h("ul");
      self.errors = h("div", { class: "ppb-errors", role: "alert", tabindex: "-1", "data-ppb-errors": true, hidden: true },
        h("p", { class: "ppb-errors__title" }, pic(ICON.alert, 18), COPY.form.errorsTitle), self.errorList);
      self.box = {
        who: h("div", { class: "ppb-form", "data-ppb-screen": "who" }, who.question.node, self.nameRow, who.customerStatus.node, who.referredBy.node, self.restart, who.lastCleaned.node),
        reach: h("div", { class: "ppb-form", "data-ppb-screen": "reach" }, reach.preferredContact.node, self.reachRow, reach.smsConsent.node),
        where: h("div", { class: "ppb-form", "data-ppb-screen": "where" }, where.address.node, self.zipRow, where.startTiming.node, where.lastCleaned.node)
      };
      return h("form", { class: "ppb-request", novalidate: true, onsubmit: function (event) { event.preventDefault(); } }, self.errors, self.box.who, self.box.reach, self.box.where);
    },
    shown: function (f, rule, state) {
      if (!rule || !rule.shown) return false;
      return f.key !== "lastCleaned" || (f.screen === "who") !== (state.intent === "service_request");   // asked with the yard for a service request, with the name otherwise
    },
    enter: function (previous) {
      if (this.target != null) { this.sub = this.target; this.target = null; }     // sent here by an Edit link or an error link
      else if (previous === "price") { this.sub = 0; this.reviewing = false; }
      else if (previous === "confirm") { this.sub = this.screens(store.getState()).length - 1; this.reviewing = false; }
    },
    update: function (state, changed) {
      var self = this, rules = {}, list = self.screens(state);
      store.fieldRules().forEach(function (rule) { rules[rule.key] = rule; });
      self.sub = Math.max(0, Math.min(self.sub, list.length - 1));
      var screen = list[self.sub], live = store.validateDetails().byField;
      // messages: the server’s stay until that field is changed; ours are checked again on every change and go when the field is right
      (changed || []).forEach(function (key) { delete self.server[key]; });
      Object.keys(self.flagged).forEach(function (key) { if (live[key]) self.flagged[key] = live[key]; else delete self.flagged[key]; });
      self.fields.forEach(function (f) {
        var rule = rules[f.key], on = self.shown(f, rule, state);
        f.node.hidden = !on;
        if (!on) { f.setError(""); return; }
        f.sync(state, rule);
        f.setError(self.server[f.key] || self.flagged[f.key] || "");
      });
      self.nameRow.classList.toggle("is-single", !(rules.lastName && rules.lastName.shown));
      // a note from the engine about the reply method (permission cleared, method changed) sits under the choices until the next change
      if (self.noteFresh) self.noteFresh = false; else if (changed) self.noteText = "";
      self.method.note.hidden = !self.noteText;
      setText(self.method.note, self.noteText);
      // restart terms for returning and not-sure customers
      var note = store.offerNote(), restart = state.intent === "service_request" && note.kind === "restart";
      self.restart.hidden = !restart;
      // the engine’s hint under the choices gives way to the engine’s full restart note, which ends with the same rule
      // (the first cleanup with no start-up fee is for households new to Purge Pros; unclear history is checked first)
      if (restart) self.status.help.hidden = true;
      if (restart) {
        var key = note.title + "|" + (note.paragraphs || []).join("|");
        if (key !== self.restartKey) {
          self.restartKey = key;
          self.restart.replaceChildren.apply(self.restart, [h("p", { class: "ppb-terms__title", text: note.title })].concat((note.paragraphs || []).map(function (text) { return h("p", { text: text }); })));
        }
      }
      // the ONE ZIP: the coverage answer shows under it the moment it is complete
      var check = store.checkZip();
      self.zipHelp.hidden = check.status !== "in_area";
      if (check.status === "in_area") setText(self.zipHelp.lastChild, COPY.zip.served(townOf(check)));
      Object.keys(self.box).forEach(function (id) { self.box[id].hidden = id !== screen; });
      el.stage.setAttribute("data-ppb-sub", screen);
      self.drawErrors(state);
      seenScreen();                                  // the screen on show, for the engine's count (once per quote and way forward)
    },
    leave: function () { el.stage.removeAttribute("data-ppb-sub"); },
    /* arriving from an error link on the confirm screen: go straight to that field */
    focus: function () {
      var key = this.focusKey, f = key ? this.fieldFor(key, store.getState()) : null;
      this.focusKey = null;
      if (!f) return null;
      win.requestAnimationFrame(function () { reveal(f.node); });
      return f.target();
    },
    /* the summary: one box, each line a button that goes to its field */
    drawErrors: function (state) {
      var self = this, lines = [], seen = {};
      self.fields.forEach(function (f) {
        var message = self.server[f.key] || self.flagged[f.key];
        if (!message || seen[f.key] || f.node.hidden) return;
        seen[f.key] = true;
        lines.push(h("li", null, h("button", { class: "ppb-errors__link", type: "button", "data-ppb-error": f.key, text: message, onclick: function () { self.jump(f.key); } })));
      });
      var key = lines.map(function (line) { return line.textContent; }).join("|");
      self.errors.hidden = !lines.length;
      if (key !== self.errorsKey) { self.errorsKey = key; self.errorList.replaceChildren.apply(self.errorList, lines); }
      scheduleMore();
    },
    fieldFor: function (key, state) {
      var self = this, rules = {}, list = self.screens(state);
      store.fieldRules().forEach(function (rule) { rules[rule.key] = rule; });
      return self.fields.filter(function (f) { return f.key === key && list.indexOf(f.screen) > -1 && self.shown(f, rules[key], state); })[0] || null;
    },
    focusField: function (key) {
      var f = this.fieldFor(key, store.getState()), target = f && f.target();
      if (!target) { focusQuestion(); return; }
      target.focus({ preventScroll: true });
      reveal(f.node);
    },
    jump: function (key) {
      var state = store.getState(), f = this.fieldFor(key, state);
      if (!f) return;
      var at = this.screens(state).indexOf(f.screen);
      if (at !== this.sub) this.go(at, key); else this.focusField(key);
    },
    go: function (index, key) {
      var state = store.getState();
      this.sub = index;
      this.update(state, null);
      el.opts.scrollTop = 0;
      renderFrame(state);
      if (key) this.focusField(key); else focusQuestion();
    },
    /* typed text goes to the engine on every keystroke; what the engine keeps (digits only, a formatted phone) is written back */
    typed: function (f) {
      var input = f.input, before = input.value, caret = null, patch = {};
      try { caret = input.selectionStart; } catch (error) { caret = null; }
      patch[f.key] = before;
      this.typing = f;
      store.set(patch);
      this.typing = null;
      var kept = store.getState()[f.key];
      kept = kept == null ? "" : String(kept);
      if (kept === before) return;
      var at = kept.length;
      if (caret != null && caret < before.length) {         // typing in the middle: stay after the same number of digits
        var digits = before.slice(0, caret).replace(/\D/g, "").length, seen = 0;
        at = 0;
        while (at < kept.length && seen < digits) { if (/\d/.test(kept.charAt(at))) seen++; at++; }
      }
      input.value = kept;
      try { input.setSelectionRange(at, at); } catch (error) { /* email fields have no caret to set */ }
    },
    enterKey: function (f) {
      var typed = this.fields.filter(function (x) { return x.screen === f.screen && !x.node.hidden && x.input && x.input.tagName === "INPUT" && x.input.type !== "checkbox"; });
      var next = typed[typed.indexOf(f) + 1];
      if (next) { next.input.focus({ preventScroll: true }); reveal(next.node); return; }
      if (FINE_POINTER) pressNext(); else f.input.blur();     // a phone: put the keyboard away so the rest of the screen shows
    },
    pick: function (f, value) {
      var patch = {};
      patch[f.key] = value;
      store.set(patch);
      if (f.key === "customerStatus" && !this.restart.hidden) reveal(this.restart);
    },
    back: function () { if (this.sub > 0) { this.go(this.sub - 1); return true; } this.reviewing = false; return false; },
    /* Next checks this screen with the engine’s own rules; the last screen asks the engine to move on */
    attempt: function (screen) {
      var self = this, errors = store.validateDetails().errors, failed = [];
      self.fields.forEach(function (f) {
        if (f.screen !== screen || f.node.hidden) return;
        var hit = errors.filter(function (error) { return error.field === f.key; })[0];
        if (hit) { self.flagged[f.key] = hit.message; failed.push(f.key); }
      });
      if (!failed.length) return true;
      store.trackUi("form_validation_failed", { request_step: screen, fields: failed });   // this screen's own refusal: the KEYS of its fields, never what was typed
      self.showErrors();
      return false;
    },
    showErrors: function () {
      this.update(store.getState(), null);
      el.opts.scrollTop = 0;
      this.errors.focus({ preventScroll: true });
      scheduleMore();
    },
    /* the engine counts each screen the visitor gets past (once): told here, after this screen's own check and, on the
       last screen, after the engine has moved on. A press the ENGINE refuses (store.next) it counts itself. */
    next: function () {
      var self = this, state = store.getState(), list = self.screens(state), screen = list[self.sub];
      if (!self.attempt(screen)) return;
      if (!self.isLast(state) && !self.reviewing) { store.trackUi("request_step_completed", { request_step: screen }); self.go(self.sub + 1); return; }
      var went = store.next();
      if (went.ok) { store.trackUi("request_step_completed", { request_step: screen }); self.reviewing = false; return; }
      (went.errors || []).forEach(function (error) { if (error.field) self.flagged[error.field] = error.message; });
      self.showErrors();
    },
    onNotice: function (notice) { this.noteText = notice.message; this.noteFresh = true; }
  });

  /* ---- confirm: the plan, the price, who, how, where and when, the promise and the terms box, all before the button ---- */
  function fill(node, kids) { node.replaceChildren.apply(node, (kids || []).filter(function (kid) { return kid != null && kid !== false; })); }
  var ROW_OF = { question: "question", firstName: "who", lastName: "who", customerStatus: "who", preferredContact: "reach", phone: "reach", email: "reach", smsConsent: "reach",
    address: "where", city: "where", zip: "where", startTiming: "where", lastCleaned: "where" };

  registerStep("confirm", {
    owns: ["TERMS_CLEARED"],
    showsOwnReason: true,
    failed: null, last: null, termsNote: "", agreeError: "", termsFor: null, alertKey: "",
    title: function () { return COPY.confirm.title; },
    q: function () { return COPY.confirm.q; },
    say: SAY.confirm,
    count: function (state) { var n = steps.request.screens(state).length + 1; return COPY.stepOf(n, n); },
    icon: function () { return ICON.ok; },
    /* the promise and the terms box stay beside the Send button. After a locked reply there is nothing to send: the call note has the room. */
    pinned: function (state) { return state.locked ? null : this.pinBox; },
    submitLabel: function (state) { return store.quote().custom ? chosenIntent().label : (COPY.confirm.submit[state.intent] || chosenIntent().label); },
    foot: function (state) {
      if (state.locked) return { hidden: true };
      if (state.submitting) return { label: COPY.confirm.sending, busy: true, arrow: false };
      return { label: this.failed && this.failed.retry ? COPY.confirm.retry : this.submitLabel(state), arrow: false };
    },
    build: function () {
      var self = this, c = COPY.confirm;
      self.alert = h("div", { class: "ppb-alert", tabindex: "-1", "data-ppb-alert": "", hidden: true });
      // the plan: every answer is a chip that changes it in one tap; the engine brings the visitor back here afterwards
      self.chips = {};
      self.chipBox = h("div", { class: "ppb-sum__chips" }, store.flow().steps.filter(function (s) { return s.kind === "plan"; }).map(function (s) {
        var full = h("span", { class: "ppb-chip__full" }), brief = h("span", { class: "ppb-chip__brief" });
        var pill = h("span", { class: "ppb-chip__pill" }, full, brief);
        var chip = h("button", { class: "ppb-chip", type: "button", "data-ppb-confirm-chip": s.id,
          onclick: function () { var went = store.edit(s.id); if (went && !went.ok && went.reason) flashHint(went.reason); } }, pill);
        self.chips[s.id] = { chip: chip, full: full, brief: brief };
        return chip;
      }));
      self.price = h("span", { class: "ppb-sum__price", "data-ppb-confirm-price": true });
      self.feeTitle = h("b", { class: "ppb-fee__title" });
      self.feeSub = h("span", { class: "ppb-fee__sub" });
      // one line inside the plan card: "No start-up fee" (opens "How this works") for a new recurring customer; for a restart, a one-time
      // cleanup or a custom review, the title of the engine’s own terms, which open in full, numbers untouched, one tap away
      self.feeIcon = pic(ICON.zero, 256);
      self.feeHow = h("span", { class: "ppb-fee__how", text: COPY.price.how });
      self.fee = h("button", { class: "ppb-fee ppb-fee--line", type: "button", "aria-haspopup": "dialog", "data-ppb-confirm-how": true, hidden: true,
        onclick: function () {
          var note = store.offerNote();
          if (note.kind === "new_recurring") { store.track("promotion_details_viewed", { promotion: note.title }); openHow(note, self.fee); }
          else openTerms(note, self.fee);
        } },
        self.feeIcon, h("span", { class: "ppb-fee__txt" }, self.feeTitle, self.feeSub), self.feeHow);
      self.plan = h("div", { class: "ppb-sum ppb-sum--plan", "data-ppb-sum": "plan" },
        h("p", { class: "ppb-sum__head" }, h("b", { text: c.plan }), h("small", { text: c.planHint }), self.price), self.chipBox, self.fee);
      // who, how to reach them, where and when: one row each, each with its own Edit
      self.rows = {};
      var row = function (id) {
        var value = h("span", { class: "ppb-sum__v" });
        var edit = h("button", { class: "ppb-edit", type: "button", "data-ppb-edit": id, "aria-label": c.editLabel[id], text: c.edit, onclick: function () { self.edit(id); } });
        var node = h("div", { class: "ppb-sum__row", "data-ppb-sum": id }, h("span", { class: "ppb-sum__k", text: c.rows[id] }), value, edit);
        self.rows[id] = { node: node, value: value, edit: edit, key: null };
        return node;
      };
      self.details = h("div", { class: "ppb-sum ppb-sum--rows" }, row("question"), row("who"), row("reach"), row("where"));
      self.promise = h("p", { class: "ppb-promise", "data-ppb-promise": true }, pic(ICON.ok, 256),
        h("span", null, h("b", { text: c.promiseLead }), " " + C.PROMISES.requestNotBooking + " " + C.PROMISES.nothingCharged));
      // the terms box for a service request: the engine’s wording, unticked, asked again after any change
      self.agree = h("input", { type: "checkbox", id: "ppb-agree", name: "termsAccepted", "aria-required": "true", "aria-describedby": "ppb-agree-note ppb-agree-err", "data-ppb-agree": true,
        onchange: function () { self.agreeError = ""; store.set({ termsAccepted: self.agree.checked }); var kept = store.getState().termsAccepted; if (self.agree.checked !== kept) self.agree.checked = kept; self.drawAgree(store.getState()); } });
      self.agreeWords = h("span", { class: "ppb-check__txt" });
      self.agreeNote = h("p", { class: "ppb-fieldnote", id: "ppb-agree-note", role: "status", hidden: true });
      self.agreeErr = fieldError("ppb-agree-err", "termsAccepted");
      self.agreeErr.setAttribute("role", "alert");
      self.agreeBox = h("div", { class: "ppb-consent ppb-agree", "data-ppb-field": "termsAccepted" },
        h("label", { class: "check ppb-check" }, self.agree, h("span", { class: "check__box", "aria-hidden": "true" }), self.agreeWords), self.agreeNote, self.agreeErr);
      self.ack = h("p", { class: "ppb-ack", "data-ppb-ack": true }, linkParts(C.wording.otherIntentsParts()));
      // the promise and the terms box stay in view with the Send button: they are pinned directly above the foot (see pinned() and syncPin)
      self.pinBox = h("div", { class: "ppb-pinned", "data-ppb-pinned": "confirm" }, self.promise, self.agreeBox, self.ack);
      return h("div", { class: "ppb-confirm" }, self.alert, self.plan, self.details);
    },
    edit: function (id) {
      var state = store.getState(), req = steps.request, list = req.screens(state);
      var screen = id === "reach" || id === "where" ? id : "who";
      req.target = Math.max(0, list.indexOf(screen));
      req.reviewing = true;
      var went = store.goTo("request");
      if (went && !went.ok) { req.target = null; req.reviewing = false; if (went.reason) flashHint(went.reason); }
    },
    update: function (state, changed) {
      var self = this, c = COPY.confirm, frozen = isFrozen(state), quote = store.quote(), sum = store.requestSummary(), service = state.intent === "service_request";
      self.fieldLines(state);
      var plan = {};
      store.planSummary().forEach(function (row) { plan[row.step] = row; });
      Object.keys(self.chips).forEach(function (id) {
        var row = plan[id], one = self.chips[id], on = Boolean(row && row.value);
        one.chip.hidden = !on;
        if (!on) return;
        // On a city page, one of the page's extra ZIPs (data-zips-also) is named with the page's town, as the greeting and the address row are.
        var shown = id === "zip" && TOWN.name && TOWN.also.indexOf(state.zip) !== -1 ? state.zip + " · " + TOWN.name : row.value;
        var brief = chipText(id, row, state, false) || shown;
        setText(one.full, shown);
        setText(one.brief, brief);
        one.chip.setAttribute("aria-label", COPY.change(row.label, shown, brief));   // whichever of the two forms is on show, the name holds it (m10)
        one.chip.disabled = frozen;
      });
      // the price. A custom estimate never shows a number.
      var priceKey = quote.priceCents != null ? quote.priceLabel + "|" + quote.unit : "words|" + (plan.price ? plan.price.value : "");
      if (priceKey !== self.priceKey) {
        self.priceKey = priceKey;
        if (quote.priceCents != null) fill(self.price, [h("strong", { text: quote.priceLabel }), h("span", { text: quote.unit })]);
        else fill(self.price, [h("strong", { class: "is-words", text: plan.price ? plan.price.value : "" })]);
      }
      var cleaned = sum.lastCleaned ? c.lastCleaned(sum.lastCleaned) : "";       // asked with the yard for a service request, with the name otherwise
      var lines = {
        question: [sum.question],
        who: [sum.name, service ? sum.customerStatus : cleaned, sum.referredBy ? "Sent by: " + sum.referredBy : ""],
        reach: [sum.replyBy, sum.phone, sum.email],
        where: service ? [sum.serviceAddress, sum.startTiming, cleaned] : []
      };
      Object.keys(self.rows).forEach(function (id) {
        var one = self.rows[id], text = lines[id].filter(Boolean), key = text.join("\n");
        one.node.hidden = !text.length;
        if (one.key !== key) { one.key = key; fill(one.value, text.map(function (line, index) { return h("span", { text: line, "data-ppb-referral-text": id === "who" && index === 2 ? true : null }); })); }
        one.edit.disabled = frozen;
        one.node.classList.toggle("is-flagged", Boolean(self.failed && self.failed.rows[id]));
      });
      // the offer note that applies to this request
      var note = store.offerNote(), fresh = note.kind === "new_recurring";
      var showFee = service && fresh && state.customerStatus === "new", showOffer = service && !fresh;
      self.fee.hidden = !(showFee || showOffer);
      self.fee.disabled = frozen;
      self.fee.classList.toggle("ppb-fee--terms", showOffer);
      self.fee.toggleAttribute("data-ppb-confirm-offer", showOffer);
      if (showFee || showOffer) {
        setText(self.feeTitle, note.title);
        setText(self.feeSub, showFee && note.facts && note.facts.appliesTo ? "for " + note.facts.appliesTo : "");
        setText(self.feeHow, showFee ? COPY.price.how : c.readTerms);
        var art = ASSETS + (showFee ? ICON.zero : note.kind === "restart" ? ICON.returning : note.kind === "one_time" ? ICON.freq.onetime : ICON.freq.custom);
        if (self.feeIcon.getAttribute("src") !== art) self.feeIcon.setAttribute("src", art);
      }
      // the terms box (service request) or the short acknowledgement (the other two)
      self.agreeBox.hidden = !service;
      self.ack.hidden = service;
      if (service) {
        var oneTime = Boolean(quote.oneTime);
        if (self.termsFor !== oneTime) {
          self.termsFor = oneTime;
          fill(self.agreeWords, [h("span", { class: "ppb-req", "aria-hidden": "true", text: "* " })].concat(linkParts(C.wording.termsParts(oneTime))));
        }
        if (self.agree.checked !== state.termsAccepted) self.agree.checked = state.termsAccepted;
        self.agree.disabled = frozen;
      }
      self.drawAgree(state);
      self.drawAlert(state);
      if (changed && has(changed, "submitting") && state.submitting) { el.opts.scrollTop = 0; self.alert.focus({ preventScroll: true }); }
    },
    drawAgree: function (state) {
      if (state.termsAccepted) { this.termsNote = ""; this.agreeError = ""; }
      this.agreeNote.hidden = !this.termsNote || Boolean(this.agreeError);
      setText(this.agreeNote, this.termsNote);
      this.agreeErr.hidden = !this.agreeError;
      if (this.agreeError) setText(this.agreeErr.lastChild, this.agreeError);
      this.agreeBox.classList.toggle("is-invalid", Boolean(this.agreeError));
      if (this.agreeError) this.agree.setAttribute("aria-invalid", "true"); else this.agree.removeAttribute("aria-invalid");
    },
    /* one place for what is going on with the request: sending, a failure in plain words, or the locked "please call" state */
    drawAlert: function (state) {
      var self = this, c = COPY.confirm, brand = C.BRAND, failed = self.failed;
      var kind = state.locked ? "locked" : state.submitting ? "sending" : failed ? failed.status : "";
      var key = kind + "|" + (state.locked ? state.locked.message : failed ? failed.message + "|" + failed.lines.map(function (line) { return line.field + line.message; }).join("|") : "");
      self.alert.hidden = !kind;
      if (key === self.alertKey) return;
      self.alertKey = key;
      self.alert.setAttribute("data-ppb-alert", kind);
      self.alert.className = "ppb-alert" + (kind ? " is-" + (kind === "locked" || kind === "sending" ? kind : "failed") : "");
      self.alert.setAttribute("role", kind === "sending" ? "status" : "alert");
      if (kind === "sending") {
        fill(self.alert, [h("span", { class: "ppb-spin", "aria-hidden": "true" }), h("p", { class: "ppb-alert__text", "data-ppb-sending": true, text: C.SUBMIT_MESSAGES.sending })]);
      } else if (kind === "locked") {
        var lock = state.locked, said = Boolean(lock.requestId) && lock.message.indexOf(lock.requestId) > -1;
        fill(self.alert, [
          h("p", { class: "ppb-alert__kicker", text: c.locked.kicker }),
          h("p", { class: "ppb-alert__title", text: c.locked.title }),
          h("p", { class: "ppb-alert__text" }, withReachLinks(lock.message)),
          lock.requestId && !said ? h("p", { class: "ppb-ref" }, h("span", { text: c.locked.ref }), h("code", { text: lock.requestId })) : null,
          reachButtons("btn--primary", "ppb-alert__reach"),
          h("p", { class: "ppb-alert__small", text: c.locked.frozen })
        ]);
      } else if (kind) {
        fill(self.alert, [
          pic(ICON.alert, 18, "ppb-alert__ico"),
          h("div", { class: "ppb-alert__body" },
            h("p", { class: "ppb-alert__title", text: failed.title }),
            h("p", { class: "ppb-alert__text" }, withReachLinks(failed.message)),
            failed.lines.length ? h("ul", { class: "ppb-alert__list" }, failed.lines.map(function (line) {
              return h("li", null, line.go ? h("button", { class: "ppb-errors__link", type: "button", "data-ppb-error": line.field, text: line.message, onclick: line.go }) : h("span", { text: line.message }));
            })) : null,
            failed.retry ? h("p", { class: "ppb-alert__small", text: c.fail.kept }) : null)
        ]);
      }
    },
    /* the button: send. It cannot be pressed twice: the engine reports "busy", and the frame rests the button while sending */
    next: function () {
      var self = this;
      self.failed = null; self.agreeError = "";
      store.submit().then(function (sent) { self.settle(sent); });
    },
    settle: function (sent) {
      var self = this, c = COPY.confirm, state = store.getState(), req = steps.request;
      if (sent.status !== "busy") self.last = { ok: Boolean(sent.ok), status: sent.status, requestId: sent.requestId || "" };
      if (sent.ok || sent.status === "busy" || sent.status === "locked" || state.step !== "confirm") return;
      var errors = sent.fieldErrors || [], onlyTerms = errors.length && errors.every(function (error) { return error.field === "termsAccepted"; });
      if (onlyTerms) {                                // only the terms box is missing: say so beside it and put the visitor there
        self.agreeError = errors[0].message;
        self.update(state, null);
        self.agree.focus({ preventScroll: true });   // the box is pinned above the button, so it is already in view
        if (el.opts.contains(self.agreeBox)) { el.opts.scrollTop = el.opts.scrollHeight; self.agreeBox.scrollIntoView({ block: "nearest" }); }   // a short window: it is at the end of the part that scrolls (M4)
        scheduleMore();
        return;
      }
      var other = [];
      errors.forEach(function (error) {
        if (error.field === "termsAccepted") { self.agreeError = error.message; return; }
        if (error.step === "request" && req.fields && req.fieldFor(error.field, state)) req.server[error.field] = error.message;   // shown beside the field too, until it is changed
        else other.push({ field: error.field || "", message: error.message, go: error.step && steps[error.step] && error.step !== "confirm" ? function () { store.edit(error.step); } : null });
      });
      (sent.formErrors || []).forEach(function (message) { other.push({ field: "", message: message, go: null }); });
      // FIX 2026-10-10 (VERIFY-sending finding 5): the engine's message for a page that may not send opens with the very
      // sentence used as the heading here, so the box said it twice. The heading is not repeated under itself.
      var failTitle = c.fail[sent.status] || c.fail.rejected, failMessage = sent.message || "";
      if (failMessage.indexOf(failTitle) === 0) failMessage = failMessage.slice(failTitle.length).replace(/^\s+/, "");
      if (failMessage.indexOf(C.BRAND.phoneDisplay) < 0) failMessage += " Or text us at " + C.BRAND.phoneDisplay + ".";
      self.failed = { status: sent.status, title: failTitle, message: failMessage, retry: Boolean(sent.retryAllowed) && !errors.length, other: other, lines: other, rows: {}, fields: errors.length > 0 };
      self.update(state, null);
      renderFrame(state);
      el.opts.scrollTop = 0;
      self.alert.focus({ preventScroll: true });
    },
    /* fields the server refused: listed here, each a link to its field, until every one of them has been changed */
    fieldLines: function (state) {
      var self = this, req = steps.request, failed = self.failed, list = req.screens(state);
      if (!failed || !failed.fields) return;
      failed.lines = failed.other.slice(); failed.rows = {};
      Object.keys(req.server).forEach(function (key) {
        var f = req.fields ? req.fieldFor(key, state) : null;
        if (!f) return;
        failed.rows[f.screen === "who" && key !== "question" ? "who" : ROW_OF[key] || "who"] = true;
        failed.lines.push({ field: key, message: req.server[key], go: function () { req.target = Math.max(0, list.indexOf(f.screen)); req.reviewing = true; req.focusKey = key; store.goTo("request"); } });
      });
      if (!failed.lines.length) self.failed = null;
    },
    leave: function () { if (!(this.failed && this.failed.fields)) this.failed = null; this.agreeError = ""; },
    onNotice: function (notice) { this.termsNote = notice.message; }
  });

  /* ---- done: the reference, where the reply arrives, what happens next, the promise again ---- */
  registerStep("done", {
    title: function () { return COPY.done.title; },
    q: function (state) { var receipt = state.receipt; return (receipt && COPY.done.q[receipt.intent]) || COPY.done.q.service_request; },
    say: SAY.done,
    count: function () { return ""; },
    foot: function () { return { label: ui.sheetOpen ? COPY.done.close : COPY.done.newQuote, arrow: false }; },
    next: function () { if (ui.sheetOpen) hooks.close(); else store.reset(); },   // closing from here starts a new quote (engine)
    build: function () {
      var self = this, d = COPY.done;
      self.alreadyReached = h("p", { class: "ppb-done__referral", "data-ppb-already-reached": true, hidden: true }, withReachLinks("Your first request had already reached us, so nothing was sent twice. To change a detail, text us at (317) 961-5865."));
      self.referral = h("p", { class: "ppb-done__referral", "data-ppb-done-referral": true, hidden: true, text: "We will confirm who sent you when we reply." });
      self.watch = h("b");
      self.lead = h("span");
      self.ref = h("code", { "data-ppb-ref": true });
      self.nextsList = h("ol", { class: "ppb-nexts__list", "aria-labelledby": "ppb-done-nexts-title" });   // the title is outside the list (m11)
      self.nexts = h("div", { class: "ppb-nexts ppb-done__nexts", "data-ppb-done-nexts": true }, h("p", { class: "ppb-nexts__title", id: "ppb-done-nexts-title", text: d.nextTitle }), self.nextsList);
      // he stands on a rise of lawn at the card’s ground line (the gloved pages get the tick instead of the bare-handed pose)
      self.poseImg = GLOVED_PAGE ? null : pic(ICON.celebrate, 610, null, 900);
      self.scene = h("div", { class: "ppb-done__scene" }, GLOVED_PAGE ? h("span", { class: "puck puck--sq puck--lg ppb-done__puck" }, pic(ICON.ok, 256))
        : h("span", { class: "stand stand--mound ppb-done__pose" }, self.poseImg));
      return h("div", { class: "ppb-done" },
        h("div", { class: "ppb-done__main" },
          h("p", { class: "ppb-done__lead" }, self.watch, " ", self.lead),
          h("p", { class: "ppb-ref" }, h("span", { text: d.ref }), self.ref),
          h("p", { class: "ppb-promise" }, pic(ICON.ok, 256), h("span", null, h("b", { text: COPY.confirm.promiseLead }), " " + C.PROMISES.requestNotBooking + " " + C.PROMISES.nothingCharged)),
          self.alreadyReached, self.referral, self.nexts,
          // a review build and a staging test each say so; a live request shows neither line
          h("p", { class: "ppb-review", "data-ppb-demo": true, text: d.demo, hidden: store.mode !== "demo" }),
          store.mode === "staging" ? h("p", { class: "ppb-review", "data-ppb-staging": true, text: d.staging }) : null),
        self.scene);
    },
    update: function (state) {
      var self = this, d = COPY.done, receipt = state.receipt;
      if (!receipt) return;
      var service = receipt.intent === "service_request", kind = receipt.custom ? "custom" : receipt.oneTime ? "onetime" : "recurring";
      setText(self.watch, d.watch(receipt.replyWhere));
      var leadKey = service ? kind : "other";
      if (leadKey !== self.leadKey) { self.leadKey = leadKey; fill(self.lead, service ? [d.lead[kind]] : withReachLinks(d.lead.other(C.BRAND.phoneDisplay))); }
      setText(self.ref, receipt.requestId);
      self.referral.hidden = !(service && receipt.hasReferral);
      self.alreadyReached.hidden = !receipt.alreadyReached;
      self.nexts.hidden = !service;
      if (service && self.nextsKey !== kind) {
        self.nextsKey = kind;
        var list = COPY.price.nexts[kind];
        fill(self.nextsList, [h("li", { class: "is-done" }, pic(ICON[list[0][0]], 256), h("span", null, h("b", { text: d.received })))]
          .concat(list.slice(1).map(function (item) { return h("li", null, pic(ICON[item[0]], 256), h("span", null, h("b", { text: item[1] }), " ", item[2])); })));
      }
      var pose = service ? "celebrate" : "relax";
      if (self.poseImg && self.poseKey !== pose) {
        self.poseKey = pose;
        self.poseImg.src = ASSETS + ICON[pose];
        self.poseImg.width = pose === "relax" ? 900 : 610; self.poseImg.height = pose === "relax" ? 875 : 900;
        self.scene.setAttribute("data-pose", pose);
      }
    }
  });

  /* ---------------------------------------------------------------- 7 pop-ups */
  /* A small modal over the builder (yard guide, "How this works"). Native <dialog>: focus stays inside,
     Escape closes only the pop-up, and focus goes back to the control that opened it. */
  function openPop(id, parts, opener) {
    var pop = ui.pops[id];
    if (!pop) {
      pop = ui.pops[id] = {};
      pop.kicker = h("p", { class: "ppb-pop__kicker" });
      pop.title = h("h2", { class: "ppb-pop__title", id: "ppb-pop-" + id, tabindex: "-1" });
      pop.body = h("div", { class: "ppb-pop__body" });
      var shut = function () { closePop(id); };
      pop.node = h("dialog", { class: "ppb-pop", "data-ppb-pop": id, "aria-labelledby": "ppb-pop-" + id },
        h("div", { class: "ppb-pop__panel" },
          h("button", { class: "ppb-close", type: "button", "data-ppb-pop-close": true, "aria-label": "Close", onclick: shut }, pic(ICON.close, 18)),
          pop.kicker, pop.title, pop.body,
          h("div", { class: "ppb-pop__foot" }, h("button", { class: "btn btn--secondary btn--sm", type: "button", "data-ppb-pop-close": true, text: COPY.guide.done, onclick: shut }))));
      pop.node.addEventListener("cancel", function (event) { event.preventDefault(); shut(); });
      keepFocusIn(pop.node);
      watchFit();                                   // 2026-10-12: a pop-up follows what can be seen, as the panel does (fitSheet)
      pop.node.addEventListener("pointerdown", function (event) { pop.outside = event.target === pop.node; });
      pop.node.addEventListener("click", function (event) { if (event.target === pop.node && pop.outside) shut(); });
      doc.body.append(pop.node);
    }
    setText(pop.kicker, parts.kicker || ""); setText(pop.title, parts.title || "");
    pop.body.replaceChildren.apply(pop.body, parts.body || []);
    pop.opener = opener || null;
    if (!pop.node.open) { lockPage(true); pop.node.showModal(); }
    fitSheet();                                     // 2026-10-12: a strip that is already there when the pop-up opens
    pop.node.querySelector(".ppb-pop__panel").scrollTop = 0;
    pop.title.focus({ preventScroll: true });
  }
  function closePop(id) {
    var pop = ui.pops[id];
    if (!pop || !pop.node.open) return;
    pop.node.close(); lockPage(false);
    fitSheet();                                     // 2026-10-12: closed, so both properties go from it
    if (pop.opener && doc.contains(pop.opener)) pop.opener.focus({ preventScroll: true });
  }

  function openYardGuide(opener) {
    var g = COPY.guide, state = store.getState(), feet = function (n) { return n.toLocaleString("en-US"); };
    var measured = C.YARD_SIZES.filter(function (size) { return size.maxSquareFeet; });
    var beyond = C.YARD_SIZES.filter(function (size) { return !size.maxSquareFeet; })[0];
    var largest = measured[measured.length - 1];
    var figure = h("figure", { class: "ppb-guide__fig" });
    figure.insertAdjacentHTML("afterbegin",
      '<svg viewBox="0 0 340 252" role="img" aria-labelledby="ppb-yg-t ppb-yg-d" font-family="Figtree, Segoe UI, Arial, sans-serif" text-anchor="middle">' +
      '<title id="ppb-yg-t"></title><desc id="ppb-yg-d"></desc>' +
      '<rect width="340" height="252" fill="#eef3f7"/><rect y="218" width="340" height="34" fill="#8e9baa"/>' +
      '<path d="M0 235h340" stroke="#fff" stroke-width="2" stroke-dasharray="14 10"/>' +
      '<rect x="20" y="180" width="300" height="38" fill="#dcebd0"/><rect x="20" y="126" width="84" height="54" fill="#dcebd0"/><rect x="236" y="126" width="84" height="54" fill="#dcebd0"/>' +
      '<rect x="20" y="12" width="300" height="114" rx="8" fill="#74c043"/><rect x="20" y="12" width="300" height="114" rx="8" fill="none" stroke="#3d8f2c" stroke-width="3"/>' +
      '<rect x="118" y="96" width="104" height="30" fill="#f3dcae" stroke="#3d8f2c" stroke-width="3"/>' +
      '<rect x="104" y="126" width="132" height="54" fill="#b9c8d8" stroke="#7d93a6" stroke-width="2"/>' +
      '<rect x="252" y="180" width="48" height="38" fill="#cfd7df"/>' +
      '<circle cx="170" cy="40" r="15" fill="#062644"/><path d="M162.500 40.500l5.200 5.300 10-11" fill="none" stroke="#fff" stroke-width="3.400" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<text x="170" y="74" font-size="15" font-weight="800" fill="#062644" letter-spacing="1">BACKYARD</text><text x="170" y="89" font-size="11" font-weight="600" fill="#062644">Count this area</text>' +
      '<text x="170" y="115" font-size="10.500" font-weight="700" fill="#062644">Patio · include</text>' +
      '<text x="170" y="158" font-size="11" font-weight="700" fill="#28435e">House · exclude</text>' +
      '<text x="62" y="157" font-size="10" font-weight="600" fill="#4d657b">Side lawn</text><text x="278" y="157" font-size="10" font-weight="600" fill="#4d657b">Side lawn</text>' +
      '<text x="124" y="197" font-size="11" font-weight="800" fill="#4d657b" letter-spacing="1">FRONT LAWN</text><text x="124" y="210" font-size="9.500" font-weight="600" fill="#4d657b">Not in this example’s service</text>' +
      '<text x="276" y="197" font-size="9" font-weight="700" fill="#4d657b">Driveway</text><text x="276" y="208" font-size="8.500" font-weight="600" fill="#4d657b">if unused</text>' +
      '<text x="170" y="246" font-size="10" font-weight="800" fill="#fff" letter-spacing="2">STREET</text></svg>');
    figure.querySelector("title").textContent = g.svgTitle;
    figure.querySelector("desc").textContent = g.svgDesc;
    figure.append(h("figcaption", null, h("b", { text: g.figTitle }), h("br"), g.figKey), h("p", { class: "ppb-guide__small", text: g.notScale }));
    var table = h("table", { class: "ppb-guide__table" }, h("caption", { text: g.caption }),
      h("thead", null, h("tr", null, h("th", { scope: "col", text: g.colSize }), h("th", { scope: "col", text: g.colFeet }))),
      h("tbody", null, measured.map(function (size) {
        var on = size.id === state.yardSize;
        return h("tr", { class: on ? "is-selected" : null }, h("th", { scope: "row", text: size.label + (on ? " · " + g.selected : "") }), h("td", { text: g.upTo(feet(size.maxSquareFeet)) }));
      })));
    var ask = store.intentOptions().filter(function (o) { return o.id === "question"; })[0];
    openPop("yard-guide", { kicker: g.kicker, title: g.title, body: [
      h("p", { text: g.lead }), figure,
      h("p", null, h("b", { text: g.more[0] }), " ", g.more[1]),
      table,
      h("p", null, h("b", { text: g.example[0] }), " ", g.example[1], largest && beyond ? " " + g.over(feet(largest.maxSquareFeet), beyond.label) : ""),
      ask ? h("p", { text: g.unsure(ask.label) }) : null
    ] }, opener);
  }

  /* "How this works": the engine's no-start-up-fee note in full. The title, every paragraph and the closing promise are the
     engine's own sentences, printed as they are; this file adds one picture per paragraph and nothing else. */
  var HOW_ICONS = ["zero", "chat", "ok"];          // the first cleanup · "we tell you before we start" · the household rule and leaving
  function openHow(note, opener) {
    var facts = note.facts || {};
    var items = (note.paragraphs || []).map(function (text, index) {
      return h("li", null, pic(ICON[HOW_ICONS[index]] || ICON.ok, 256), h("span", { text: text }));
    });
    openPop("how", { kicker: COPY.price.howKicker, title: note.title + (facts.appliesTo ? " for " + facts.appliesTo : ""),
      body: [h("ul", { class: "ppb-pop__list ppb-pop__list--how", "data-ppb-how-list": true }, items),
        h("p", { class: "ppb-pop__promise", "data-ppb-how-promise": true, text: C.PROMISES.nothingCharged })] }, opener);
  }

  /* the engine’s own terms for this request (restart, one-time cleanup, custom review), in full and untouched */
  function openTerms(note, opener) {
    openPop("terms", { kicker: COPY.confirm.termsKicker, title: note.title, body: (note.paragraphs || []).map(function (text) { return h("p", { text: text }); }) }, opener);
  }

  /* ---------------------------------------------------------------- 8 presentations */
  /* ONE rule on every device: the hero card asks the FIRST question only. Every later step runs in the roomy panel
     (a full-height sheet on a phone, a dialog on a larger screen) which opens in place, over the page, where the visitor is.
     While a price is under way and the panel is closed, the hero card shows the summary instead of the first question:
     the answers so far, the price so far, Continue and Start over. The card's outer size is the same in all three states. */
  function keepFocusIn(dialog) {
    dialog.addEventListener("keydown", function (event) {
      if (event.key !== "Tab") return;
      var stops = Array.prototype.filter.call(dialog.querySelectorAll("button, a[href], input, select, textarea, [tabindex='0']"), function (node) {
        return !node.disabled && node.getClientRects().length && win.getComputedStyle(node).visibility !== "hidden";
      });
      if (!stops.length) return;
      var first = stops[0], last = stops[stops.length - 1], active = doc.activeElement;
      if (event.shiftKey && (active === first || active === dialog || !dialog.contains(active))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || active === dialog)) { event.preventDefault(); first.focus(); }
    });
  }
  function setMode(mode) { ui.mode = mode; el.stage.setAttribute("data-ppb-mode", mode); }
  function lockPage(on) {
    ui.locks += on ? 1 : -1;
    if (ui.locks < 0) ui.locks = 0;
    if (on && ui.locks === 1) {
      ui.lockY = win.scrollY;
      root.style.setProperty("--ppb-sbw", Math.max(0, win.innerWidth - root.clientWidth) + "px");   // keep the page from shifting when its scrollbar goes
      root.classList.add("ppb-lock");
    } else if (!ui.locks) {
      root.classList.remove("ppb-lock"); root.style.removeProperty("--ppb-sbw");
      // the page is exactly where the visitor left it, whatever a script or the browser did to it meanwhile
      if (ui.lockY != null && Math.abs(win.scrollY - ui.lockY) > 1) win.scrollTo({ top: ui.lockY, left: win.scrollX, behavior: "instant" });
      ui.lockY = null;
    }
  }

  /* ---- the hero card's other two faces: the summary, and a placeholder while the builder is open in front with nothing answered ---- */
  function buildHero() {
    var c = COPY.sum;
    el.sumTitle = h("span", { "data-ppb-sum-title": true });
    el.sumCount = h("span", { class: "ppb-count", "data-ppb-sum-count": true });
    el.sumSay = h("p", { class: "ppb-say", "data-ppb-sum-say": true });
    el.sumChips = h("div", { class: "ppb-hero__chips", "data-ppb-sum-chips": true });
    ui.sumChips = {};
    store.flow().steps.forEach(function (s) {
      if (s.kind !== "plan") return;
      var pill = h("span", { class: "ppb-chip__pill" });
      var chip = h("button", { class: "ppb-chip", type: "button", "data-ppb-sum-chip": s.id, hidden: true, onclick: function () { openAt(s.id, chip); } }, pill);
      ui.sumChips[s.id] = { chip: chip, pill: pill };
      el.sumChips.append(chip);
    });
    ui.sumSegs = [];
    el.sumProgress = h("ol", { class: "ppb-progress ppb-hero__progress", role: "presentation", "aria-hidden": "true" }, store.flow().steps.filter(function (s) { return s.kind === "plan" || s.kind === "price"; }).map(function (s) {
      var li = h("li", { role: "presentation" }, h("span", { text: COPY.seg[s.id] || s.id }));
      ui.sumSegs.push({ id: s.id, li: li });
      return li;
    }));
    el.sumLabel = h("span", { class: "ppb-hero__label" });
    el.sumAmt = h("strong", { class: "ppb-hero__amt", "data-ppb-sum-price": true });
    el.sumIcon = pic(ICON.tag, 185, "ppb-hero__ico", 256);
    el.sumPlate = h("div", { class: "ppb-hero__plate" }, el.sumIcon, h("p", { class: "ppb-hero__price" }, el.sumLabel, el.sumAmt));
    el.sumNote = h("p", { class: "ppb-hero__note", "data-ppb-sum-note": true });
    el.sumGo = h("button", { class: "ppb-next", type: "button", "data-ppb-continue": true, onclick: function () { resumeHere(el.sumGo); } }, h("span", { text: c.go }), pic(ICON.arrow, 22));
    el.sumOver = h("button", { class: "ppb-over", type: "button", "data-ppb-startover": true, "aria-label": c.overLabel, text: c.over, onclick: startOver });
    el.sum = h("div", { class: "ppb-stage ppb-hero", role: "group", "aria-label": c.label, "data-ppb-summary": true },
      h("div", { class: "ppb-head" }, h("span", { class: "ppb-avatar" }, pic(ICON.avatar, 240)),
        h("div", { class: "ppb-headtxt" }, h("p", { class: "ppb-title" }, el.sumTitle, " ", el.sumCount), el.sumSay)),
      el.sumProgress,
      h("div", { class: "ppb-hero__body" },
        h("p", { class: "ppb-hero__kicker" }, h("b", { text: c.answers }), h("small", { text: c.change })),
        el.sumChips, el.sumPlate, el.sumNote),
      h("div", { class: "ppb-foot" }, el.sumOver, h("span", { class: "ppb-foot__gap" }), el.sumGo));
    el.away = h("div", { class: "ppb-stage ppb-stage--away", "aria-hidden": "true" }, h("span", { class: "ppb-avatar" }, pic(ICON.avatar, 240)), h("p", { text: COPY.away }));
  }
  function renderSummary(state, bar, parts) {
    var c = COPY.sum, flow = store.flow(), quote = store.quote(), later = isLater(state.step), frozen = isFrozen(state);
    var asked = flow.steps.filter(function (s) { return s.kind === "plan" && !s.skipped; });
    var answered = asked.filter(function (s) { return s.complete; }).length, left = asked.length - answered;
    var kind = bar.kind === "out_of_area" ? "out" : later ? "request" : quote.ready ? (quote.custom ? "custom" : "price") : "plan";
    setText(el.sumTitle, c.title[kind]);
    setText(el.sumCount, kind === "plan" ? c.answered(answered, asked.length) : "");
    setText(el.sumSay, SAY.sum(state, bar));
    // the answers so far: each chip opens the panel on its own question
    var rows = {}, zipTyped = store.checkZip().complete, any = false;
    store.planSummary().forEach(function (row) { rows[row.step] = row; });
    Object.keys(ui.sumChips).forEach(function (id) {
      var one = ui.sumChips[id], row = rows[id], s = flowStep(flow, id) || {};
      var text = row && row.value && (s.complete || (id === "zip" && zipTyped)) ? chipText(id, row, state, false) : "";
      one.chip.hidden = !text;
      if (!text) return;
      any = true;
      setText(one.pill, text);
      one.chip.setAttribute("aria-label", COPY.change(row.label, row.value, text));
      one.chip.disabled = frozen;
    });
    el.sum.toggleAttribute("data-ppb-sum-empty", !any);
    ui.sumSegs.forEach(function (seg) {                  // how far along: a bar per question, as in the builder itself
      var s = flowStep(flow, seg.id) || {}, done = later || (seg.id !== "price" && Boolean(s.complete));
      seg.li.hidden = Boolean(s.skipped);
      seg.li.classList.toggle("is-done", done);
      seg.li.classList.toggle("is-current", !later && seg.id === (flow.firstIncomplete || "price"));
    });
    // the price so far: the same line as the foot of the builder and the pinned bar
    el.sum.setAttribute("data-ppb-sum-kind", bar.kind);
    el.sumPlate.classList.toggle("is-words", parts.words);
    var art = ASSETS + (bar.kind === "out_of_area" ? ICON.pin : ICON.tag);       // a map pin for a ZIP outside the area, the price tag otherwise
    if (el.sumIcon.getAttribute("src") !== art) el.sumIcon.setAttribute("src", art);
    fillPrice(el.sumLabel, el.sumAmt, parts);
    var note = state.locked ? c.locked : kind === "out" ? c.out : later ? c.request : quote.ready ? c.ready + " " + C.PROMISES.nothingCharged : left ? c.left(left) : c.building;
    setText(el.sumNote, note);
    el.sumOver.hidden = Boolean(state.locked || state.submitting);     // the engine refuses a new quote in those two states
  }
  /* which face the hero card shows. Called after every change, and whenever the panel opens or closes. */
  function syncHero() {
    if (!mount) return;
    var state = store.getState(), started = hasProgress(state), want;
    if (ui.sheetOpen) want = started ? "summary" : "away";
    else if (ui.auto && el.stage.parentNode === mount) want = "stage";       // the tapped tile is still showing its selected state
    else want = started ? "summary" : "stage";
    if (want === "summary") { var bar = store.priceBar(); renderSummary(state, bar, priceParts(bar)); }
    var node = want === "stage" ? el.stage : want === "summary" ? el.sum : el.away;
    if (mount.firstChild === node && mount.childNodes.length === 1) { ui.hero = want; return; }
    var had = mount.contains(doc.activeElement);
    mount.replaceChildren(node);                   // all three are the same outer size: the page does not move
    if (want === "stage") setMode("inline");
    ui.hero = want;
    if (had && !ui.sheetOpen) (want === "summary" ? el.sumGo : el.q).focus({ preventScroll: true });   // focus stays in the card whose face changed
  }
  /* Continue (the summary and the pinned bar): reopen the panel where the visitor left off. Answers that came from an
     earlier page or a reload lead straight to where they stop: the price when the plan is complete, otherwise the
     first unanswered question. Nobody is walked through questions they have already answered. */
  function leadOn() {
    var state = store.getState();
    if (!ui.carried) return;
    ui.carried = false;
    if (isFrozen(state) || state.step !== "dogs") return;
    var to = store.priceBar().continueStep;
    ui.kept = to === "price";
    if (to && to !== state.step && !store.goTo(to).ok) ui.kept = false;
  }
  function resumeHere(trigger) { ui.way = wayIn(trigger); leadOn(); hooks.open({}, trigger); ui.way = null; }
  /* a chip on the summary: open the panel on that question */
  function openAt(stepId, trigger) {
    ui.carried = false;
    ui.way = wayIn(trigger);
    var went = store.edit(stepId);
    hooks.open({}, trigger);
    ui.way = null;
    if (went && !went.ok && went.reason) flashHint(went.reason);
  }
  /* START OVER: the summary's button and the panel's (el.over, 2026-10-12). The engine clears every answer, everything typed for a
     request and the saved progress, and starts again at the first question (store.reset; it refuses while a request is being sent
     and after a locked reply). A ZIP that a link or a ZIP button of the page handed over goes with the rest, as any answer does, and
     is OFFERED again on the ZIP question as a one-tap choice (ui.again; the ZIP step draws it): neither kept silently nor lost. A
     ZIP the visitor has typed since then is their own answer and replaces it: nothing is offered. A city page's own ZIP (data-zip)
     is the engine's to put back, exactly as on arrival. With the panel open it stays open, on the first question, which takes focus. */
  function startOver() {
    var was = store.getState(), again = ui.again;
    if (was.zipSource === "open" || was.zipSource === "url") ui.again = C.checkZip(was.zip).inArea ? was.zip : "";
    else if (was.zip && was.zip !== ui.again) ui.again = "";
    if (store.reset() === false) { ui.again = again; return; }
    if (ui.again && store.getState().zip === ui.again) ui.again = "";   // the page's own ZIP: the engine has put it back and its question is skipped
    if (doc.contains(el.stage)) el.q.focus({ preventScroll: true });   // the first question is back: in the card, or in the open panel
  }

  /* ---- what only this interface can see is REPORTED to the engine: store.trackUi() (CORE-API.md section 6.6) ----
     The engine counts, builds and sends every event; this file never calls a tag. It is told five things, each from a
     fixed list of the engine's own, and nothing a visitor typed:
       builder_opened           the panel really opened (openSheet), with the way in. A launcher that only points at the
                                hero card opens nothing and reports nothing.
       builder_closed           the panel was put away (stowSheet). hooks.close() counts it in the engine too; the engine
                                counts one closing per opening.
       request_step_viewed      the request screen on show (who, reach, where), each time it is drawn while the panel is
                                open; the engine counts each once per quote and way forward.
       request_step_completed,  the visitor got past a request screen; a press that this screen's own check refused,
       form_validation_failed   with the KEYS of the fields that failed. Both in the request step's next() and attempt().
     Presses on a text, call or email link, the builder's own included, are counted by site.js (one listener for the
     whole page).

     The way in, from the control that asked for the panel:
       plan_button    a button that names a plan (data-quote-plan), wherever it is; the plan goes with it
       summary_card   the summary in the hero card: Continue, or one of its chips
       pinned_bar     the pinned price bar
       hero_card      the visitor's own answer in the hero card moved on to the next question
       menu_button, header_button   a launcher in the phone menu, in the site header
       page_button    any other launcher on the page, a ZIP form included
       link           no control at all: the address asked (?open_quote=1, #quote) or a script called PurgeProsQuote.open()
       saved_link     a saved quote opened */
  function wayIn(trigger) {
    var node = trigger && trigger.nodeType === 1 && trigger.closest ? trigger : null, plan = planOf(node);
    if (!node) return { entry: "link" };
    if (plan) return { entry: "plan_button", plan: plan };
    if (el.sum && el.sum.contains(node)) return { entry: "summary_card" };
    if (el.bar && el.bar.contains(node)) return { entry: "pinned_bar" };
    if ((mount && mount.contains(node)) || (el.stage && el.stage.contains(node))) return { entry: "hero_card" };
    if (node.closest("#mnav")) return { entry: "menu_button" };
    if (node.closest("[data-hdr]")) return { entry: "header_button" };
    return { entry: "page_button" };
  }
  /* the engine moved on while the panel was closed and no control had named the way in. What moved it says which way:
     an answer or Next in the hero card ("set", "next"); a saved quote that has opened ("resume…"); anything else is a
     script that called the engine itself, with no control at all. A launcher's own ZIP ("open") is left to onOpen, which
     is handed the launcher. */
  function wayFor(reason) {
    if (reason === "open") return null;
    if (/^resume/.test(reason)) return { entry: "saved_link" };
    return { entry: reason === "set" || reason === "next" ? "hero_card" : "link" };
  }
  function seenScreen() {
    var state = store.getState();
    if (state.step !== "request" || ui.step !== "request" || !doc.contains(el.stage)) return;   // only a screen that is really on show
    store.trackUi("request_step_viewed", { request_step: steps.request.screenId(state) });
  }

  /* ---- a plan button (data-quote-plan="onetime" and so on) opened the builder: honour it as a starting preference ----
     Kept in memory only. It names itself in the mascot's line, sets the pinned line to that plan's own, and is selected on
     "How often?" when the engine offers it for the dog count. A frequency the visitor has already chosen is never replaced:
     the builder opens on "How often?" and leaves the choice to them. */
  function planOf(trigger) {
    var node = trigger && trigger.closest ? trigger.closest("[data-quote-plan]") : null, id = node ? node.getAttribute("data-quote-plan") : "";
    return id && C.FREQUENCIES.some(function (f) { return f.id === id; }) ? id : "";
  }
  function takePlan(plan) {
    var state = store.getState();
    /* a button with no plan ("Get my price", "Check my ZIP") pressed while nothing has been answered: the plan another
       button named a moment ago is forgotten, so the card says what THIS button asked for ("Weekly visits from", not
       "A custom quote? Happy to."). Once a question is answered the preference stays: the visitor is part-way through it. */
    if (!plan) { if (ui.prefer && !hasProgress(state) && !isFrozen(state)) { ui.prefer = ""; ui.picked = ""; refresh(); } return; }
    if (isFrozen(state) || state.step === "done" || isLater(state.step)) return;
    if (state.frequency) { ui.carried = false; store.goTo("frequency"); return; }
    ui.prefer = plan;
  }
  function applyPrefer() {
    var state = store.getState(), id = ui.prefer;
    if (!id || state.frequency || state.step !== "frequency" || isFrozen(state)) return;
    var option = frequencyOption(id);
    ui.prefer = "";
    if (!option || !option.available) { refresh(); return; }
    ui.picked = id;
    if (!took(store.set({ frequency: id }))) { ui.picked = ""; refresh(); }
  }

  /* ---- the panel: the same builder, same state, as a sheet (phone) or a dialog (larger screens) ---- */
  /* FIX 2026-10-11 (the owner's phone, Chrome on Android). The keyboard went at the fifth ZIP digit, but Chrome's own strip
     (the grey bar for saved passwords that rides on the keyboard) stayed at the foot of the screen. The panel is as tall as
     the layout viewport and the strip shortens only what can be seen (visualViewport), so the foot, with the price and Next,
     lay under it. While the panel is open it follows what can be seen: --ppb-cut is the height hidden at the foot and
     --ppb-top where the seen part starts (builder.css reads both, 0px when unset). They are set only for a strip: 24px or
     more hidden, under 140px (never a keyboard) and at most 45% of the height; never while pinch-zoomed. In every other
     case both are removed, so the panel under a keyboard, and while a keyboard is on its way out, is exactly as it was tested.
     2026-10-12: THE POP-UPS TOO (yard guide, "How this works", the terms). Each is a dialog of its own in front of the panel, sized by
     the same lines of builder.css, so with the strip there its foot ("Got it") lay under the strip as the panel's foot had. The same
     rule now writes the same two properties on every pop-up that is open, and takes them off when it closes. The rule itself and
     what it does to the panel are unchanged. */
  var fitQueued = false, fitWatched = false;
  function fitSheet() {
    fitQueued = false;
    var pops = Object.keys(ui.pops).map(function (id) { return ui.pops[id].node; });
    var showing = ui.sheetOpen || pops.some(function (node) { return node.open; });
    var vv = win.visualViewport, cut = 0, top = 0;
    if (showing && vv && Math.abs(vv.scale - 1) <= .01) {
      var hidden = Math.round(win.innerHeight - vv.height);
      if (hidden >= 24 && hidden < 140 && hidden <= win.innerHeight * .45) { cut = hidden; top = Math.max(0, Math.min(hidden, Math.round(vv.offsetTop))); }
    }
    (el.sheet ? [el.sheet] : []).concat(pops).forEach(function (node) {
      var on = cut && (node === el.sheet ? ui.sheetOpen : node.open);
      setFit(node, "--ppb-cut", on ? cut + "px" : ""); setFit(node, "--ppb-top", on ? top + "px" : "");
    });
  }
  function setFit(node, name, value) {            // written only when it changes
    if (node.style.getPropertyValue(name) === value) return;
    if (value) node.style.setProperty(name, value); else node.style.removeProperty(name);
  }
  function queueFit() { if (fitQueued) return; fitQueued = true; win.requestAnimationFrame(fitSheet); }
  function watchFit() {                           // ONE resize and ONE scroll listener, whichever of the panel and a pop-up is built first
    if (fitWatched || !win.visualViewport) return;
    fitWatched = true;
    win.visualViewport.addEventListener("resize", queueFit); win.visualViewport.addEventListener("scroll", queueFit);
  }
  function buildSheet() {
    el.close = h("button", { class: "ppb-close", type: "button", "data-ppb-close": true, "aria-label": COPY.closeBuilder, onclick: function () { hooks.close(); } }, pic(ICON.close, 18));
    el.sheetRoot = h("div", { class: "ppb ppb--dialog" }, el.close);
    el.sheet = h("dialog", { class: "ppb-sheet", tabindex: "-1", "data-ppb-sheet": true, "aria-labelledby": "ppb-q" }, el.sheetRoot);
    el.sheet.addEventListener("cancel", function (event) { event.preventDefault(); hooks.close(); });   // Escape goes the engine's way (never while sending)
    var outside = false;
    el.sheet.addEventListener("pointerdown", function (event) { outside = event.target === el.sheet; });
    el.sheet.addEventListener("click", function (event) { if (event.target === el.sheet && outside) hooks.close(); });
    el.sheet.addEventListener("close", function () { if (ui.sheetOpen) stowSheet(); });
    keepFocusIn(el.sheet);
    watchFit();                                   // FIX 2026-10-11 (fitSheet)
    doc.body.append(el.sheet);
  }
  /* where the hero card is right now, if enough of it is on screen for the panel to grow out of it */
  function cardBox() {
    if (!mount || QUIET || inlineShare() < 0.2) return null;
    var box = mount.getBoundingClientRect();
    return box.width && box.height ? box : null;
  }
  /* the panel grows out of the hero card (one transform, no fade); from anywhere else on the page it rises as before */
  function growFrom(from) {
    var panel = el.sheetRoot;
    panel.classList.remove("is-from-card");       // (the class stays on until the next opening: taking it off mid-way would start the other animation)
    if (!from || QUIET || !panel.offsetWidth) return;
    var scale = Math.max(.6, Math.min(1, from.width / panel.offsetWidth));
    var dx = from.left + from.width / 2 - (panel.offsetLeft + panel.offsetWidth / 2), dy = from.top + from.height / 2 - (panel.offsetTop + panel.offsetHeight / 2);
    panel.style.setProperty("--ppb-from", "translate(" + dx.toFixed(1) + "px, " + dy.toFixed(1) + "px) scale(" + scale.toFixed(3) + ")");
    void panel.offsetWidth;
    panel.classList.add("is-from-card");
  }
  function openSheet(trigger, way) {
    if (!el.sheet) buildSheet();
    ui.opener = trigger || null;
    var from = cardBox();                         // measured before anything moves
    cancelAuto();
    el.sheetRoot.append(el.stage);                // the ONE stage: out of the hero card (if it was there), into the panel
    setMode("dialog");
    ui.sheetOpen = true;
    if (store.getState().step === "price") ui.priceAt = Date.now();   // opened on the price: its button rests too (PRICE_REST_MS)
    warmPoses();
    syncHero();                                   // the card behind shows the summary (or the placeholder): same outer size, the page does not move
    lockPage(true);
    el.sheet.showModal();
    fitSheet();                                   // FIX 2026-10-11: a strip that is already there when the panel opens
    ui.owed = !way;                               // no way in yet (a launcher's own ZIP moved the engine on): onOpen names it in a moment
    if (way) store.trackUi("builder_opened", way);
    growFrom(from);
    el.opts.scrollTop = 0;
    renderFrame(store.getState());
    seenScreen();                                 // reopened on the request: that screen is on show again
    updateMore();
  }
  function stowSheet() {
    store.trackUi("builder_closed");              // however it was put away; first, while the engine still has the step it was closed on
    ui.owed = false;
    cancelAuto();                                 // a tile tapped a moment before closing does not reopen the panel by moving on
    if (ui.prefer && !hasProgress(store.getState())) { ui.prefer = ""; ui.picked = ""; }   // closed with nothing answered: the plan button's preference goes with it
    ui.sheetOpen = false;
    fitSheet();                                   // FIX 2026-10-11: closed, so both properties go
    if (el.sheet.open) el.sheet.close();
    lockPage(false);
    el.stage.remove();
    setMode("inline");
    syncHero();                                   // the first question again if nothing was answered, otherwise the summary
    renderFrame(store.getState());
    syncView();                                   // the bar is back before focus returns to its button
    var opener = ui.opener; ui.opener = null;
    /* a ZIP form on the page hands over the form itself: focus goes back to its button */
    if (opener && opener.tagName === "FORM") opener = opener.querySelector('button[type="submit"], button:not([type]), input[type="submit"]') || opener.querySelector("input, button");
    var target = opener && doc.contains(opener) && opener.getClientRects().length ? opener : null;
    /* AUDIT FIX m16. The pinned bar's button is still in the page when the bar has stepped aside (a finished request has
       no price to pin), but it is out of sight and cannot take focus: focus fell to the top of the page. It counts as gone. */
    if (target && el.bar && el.bar.contains(target) && !el.bar.classList.contains("is-on")) target = null;
    if (!target && mount) target = ui.hero === "summary" ? el.sumGo : el.q;   // opened from the hero card itself, or the opener has gone: back to the card's main control
    if (!target) target = firstLauncher();                                     // no hero card on this page: the first way back in
    if (target) target.focus({ preventScroll: true });
    updateMore();
  }

  /* the first control in the page's main content that opens the builder (a page with no hero card) */
  function firstLauncher() {
    var scope = doc.querySelector("main") || doc.body, list = scope ? scope.querySelectorAll('[data-purge-quote], a[href="#quote"], a[href="#get-quote"]') : [];
    for (var i = 0; i < list.length; i++) if (list[i].getClientRects().length && win.getComputedStyle(list[i]).visibility !== "hidden") return list[i];
    return null;
  }

  /* is the hero card on screen? (under a sticky header counts as hidden) */
  function inlineShare() {
    if (!mount) return 0;
    var box = mount.getBoundingClientRect(), header = doc.querySelector("[data-hdr]"), top = 0;
    if (header) { var hb = header.getBoundingClientRect(); if (hb.top <= 0 && hb.bottom > 0 && hb.bottom < 200) top = hb.bottom; }
    if (!box.height) return 0;
    return Math.max(0, Math.min(box.bottom, win.innerHeight) - Math.max(box.top, top)) / box.height;
  }
  var viewQueued = false, pageFoot;
  function syncView() {
    ui.inView = inlineShare() >= 0.35;
    // the bar steps aside for the whole footer (its last links, and its own price button), not just the last few pixels of the page
    if (pageFoot === undefined) { var feet = doc.querySelectorAll("#site-footer, body > footer"); pageFoot = feet.length ? feet[feet.length - 1] : null; }
    if (pageFoot) ui.atEnd = pageFoot.getBoundingClientRect().top < win.innerHeight - 20;
    else ui.atEnd = win.innerHeight + win.scrollY >= root.scrollHeight - (el.bar ? el.bar.offsetHeight + 40 : 100);
    showBar();
  }
  function watchView() {
    if (viewQueued) return; viewQueued = true;
    win.requestAnimationFrame(function () { viewQueued = false; syncView(); });
  }

  /* open from anywhere. The first question, unanswered, with the hero card on screen: point at the card. Anything else: the panel, right here. */
  function focusOpened(byButton) {
    var state = store.getState(), alert = steps.confirm.alert;
    if ((state.submitting || state.locked) && state.step === "confirm" && alert && !alert.hidden) { alert.focus({ preventScroll: true }); return; }
    var def = stepDef(ui.step), target = def.focus ? def.focus(api) : null;
    if (!target && byButton && ui.sheetOpen) target = el.sheet;        // opened by a button: the panel itself takes focus, so the first Tab stop is its close button
    (target || el.q).focus({ preventScroll: true });
  }
  function onOpen(result) {
    var trigger = result && result.trigger;
    ui.way = wayIn(trigger);                      // the launcher names the way in, whichever line below opens the panel
    try { bringUp(trigger); } finally { ui.way = null; }
  }
  function bringUp(trigger) {
    if (ui.sheetOpen) {
      if (ui.owed) { ui.owed = false; store.trackUi("builder_opened", ui.way); }   // the launcher's ZIP opened it a moment ago
      if (!ui.opener && trigger) ui.opener = trigger; focusOpened(false); return;
    }
    takePlan(planOf(trigger));
    leadOn();
    var state = store.getState();
    if (ui.sheetOpen) { if (trigger) ui.opener = trigger; focusOpened(true); applyPrefer(); return; }     // one of the two calls above moved the step, which opened the panel
    ui.inView = inlineShare() >= 0.35;
    if (mount && !hasProgress(state) && ui.inView) {
      syncHero(); refresh();
      mount.scrollIntoView({ block: "center", behavior: QUIET ? "auto" : "smooth" });
      pointAtCard();
      focusOpened(false);
    } else { openSheet(trigger, ui.way); focusOpened(true); }
    applyPrefer();
  }
  /* 2026-10-16 (Matthew): a "Get my price" button pressed while the card is already on screen moved nothing, and the one
     faint ring (is-ping) was easy to miss. Now the card rises a little and glows twice, and the mascot nods. With reduced
     motion: a still glow that fades, nothing moves. The rules come with this script, so no page's own block has to change. */
  var cueTimer = 0;
  function cueRules() {
    var base = "0 0 0 1px rgba(6, 38, 68, .06), var(--sh-3)";
    return [
      "@keyframes ppb-cue-glow {",
      "  0% { box-shadow: BASE, 0 0 0 0 rgba(24, 174, 245, .9), 0 0 0 0 rgba(24, 174, 245, .5); }",
      "  12% { box-shadow: BASE, 0 0 0 4px rgba(24, 174, 245, .9), 0 0 0 4px rgba(24, 174, 245, .5); }",
      "  44% { box-shadow: BASE, 0 0 0 4px rgba(24, 174, 245, .9), 0 0 0 26px rgba(24, 174, 245, 0); }",
      "  50% { box-shadow: BASE, 0 0 0 4px rgba(24, 174, 245, .9), 0 0 0 4px rgba(24, 174, 245, .5); }",
      "  84% { box-shadow: BASE, 0 0 0 4px rgba(24, 174, 245, .9), 0 0 0 26px rgba(24, 174, 245, 0); }",
      "  100% { box-shadow: BASE, 0 0 0 0 rgba(24, 174, 245, 0), 0 0 0 0 rgba(24, 174, 245, 0); }",
      "}",
      "@keyframes ppb-cue-lift { 0% { transform: none; } 35% { transform: translateY(-6px); } 70% { transform: translateY(1px); } 100% { transform: none; } }",
      "@keyframes ppb-cue-still {",
      "  0%, 60% { box-shadow: BASE, 0 0 0 4px rgba(24, 174, 245, .9); }",
      "  100% { box-shadow: BASE, 0 0 0 4px rgba(24, 174, 245, 0); }",
      "}",
      ".ppb-stage.is-cue { animation: ppb-cue-glow 1.8s var(--ease), ppb-cue-lift .6s var(--ease); }",
      "@media (prefers-reduced-motion: reduce) { .ppb-stage.is-cue { animation: ppb-cue-still 1.8s linear; } }"
    ].join(" ").split("BASE").join(base);
  }
  function pointAtCard() {
    var stage = el.stage;
    if (!doc.querySelector("style[data-ppb-cue]")) {
      var style = doc.createElement("style");
      style.setAttribute("data-ppb-cue", "");
      style.textContent = cueRules();
      (doc.head || doc.body).append(style);
    }
    win.clearTimeout(cueTimer);
    stage.classList.remove("is-ping", "is-cue"); void stage.offsetWidth; stage.classList.add("is-cue");
    cueTimer = win.setTimeout(function () { stage.classList.remove("is-cue"); }, 2000);   // gone after the glow, so nothing lingers
    if (!QUIET) { el.avatar.classList.remove("is-bop"); void el.avatar.offsetWidth; el.avatar.classList.add("is-bop"); }
  }
  function onClose() { if (ui.sheetOpen) stowSheet(); }
  function onBusy() { focusOpened(false); }

  /* compact pinned bar: after the first answer, and only while the hero card is out of view */
  function buildBar() {
    if (!doc.body || doc.body.hasAttribute("data-no-price-bar")) return;
    el.barPlan = h("span", { class: "ppb-bar__plan" });
    el.barPrice = h("span", { class: "ppb-bar__price" });
    el.barGo = h("button", { class: "ppb-next", type: "button", "data-ppb-bar-continue": true,
      onclick: function () { if (store.priceBar().continueEnabled) resumeHere(el.barGo); } }, h("span", { text: COPY.sum.go }), pic(ICON.arrow, 22));
    el.bar = h("div", { class: "ppb-bar", "data-ppb-bar": true, role: "region", "aria-label": COPY.title },
      h("span", { class: "ppb-bar__avatar" }, pic(ICON.avatar, 240)), h("span", { class: "ppb-bar__txt" }, el.barPlan, el.barPrice), el.barGo);
    doc.body.append(el.bar);
  }
  /* its words: the dogs and the plan, then the price line. No yard size (it is on the chips), so the line stays short; it wraps, it is never cut. */
  function renderBar(bar, parts) {
    if (!el.bar) return;
    var quote = store.quote(), plan = [quote.dogsLabel, quote.frequencyLabel].filter(Boolean);
    if (!parts.words && bar.kind !== "exact" && parts.label) plan.push(parts.label);
    var text = plan.join(" · "), key = priceKey(bar, parts) + "|" + text + "|" + bar.continueEnabled;
    if (key !== ui.barKey) {
      ui.barKey = key;
      setText(el.barPlan, text);
      el.barPlan.hidden = !text;
      el.barPrice.classList.toggle("is-words", parts.words);
      fillPrice(null, el.barPrice, parts);
      el.barGo.setAttribute("aria-disabled", String(!bar.continueEnabled));
    }
    ui.barWanted = Boolean(bar.visible);
    showBar();
  }
  function showBar() {
    if (!el.bar) return;
    el.bar.classList.toggle("is-on", Boolean(ui.barWanted && !ui.sheetOpen && !ui.inView && !ui.atEnd));
  }

  /* ---------------------------------------------------------------- 9 start */
  function start() {
    buildStage();
    buildHero();
    var state = store.getState();
    ui.carried = hasProgress(state);              // answers from an earlier page or a reload: the hero card opens on the summary, not on question 1
    showStep(state, true);
    if (mount) { mount.classList.add("ppb"); mount.setAttribute("data-ppb-live", "1"); }
    syncHero();                                   // the static mock is replaced in one step by a card of the same size and look
    buildBar();
    ui.inView = inlineShare() >= 0.35;            // known before the first frame, so the bar cannot flash on a carried-over quote
    renderFrame(state);

    // THE one subscription. Called once for every change, whatever caused it; never when nothing changed.
    store.subscribe(function (now, info) {
      var moved = has(info.changed, "step"), pressed = doc.activeElement;
      ui.carried = false;
      if (info.reason === "reset") { ui.prefer = ""; ui.picked = ""; ui.kept = false; cancelAuto(); }
      if (!now.referredBy && (has(info.changed, "referredBy") || info.reason === "reset" || info.reason === "close")) {
        if (steps.request.fields) steps.request.fields.forEach(function (field) { if (field.key === "referredBy") field.input.value = ""; });
        each(el.stage, "[data-ppb-referral-text]", function (node) { node.remove(); });
        if (steps.confirm.rows && steps.confirm.rows.who) steps.confirm.rows.who.key = null;
        if (steps.done.referral) steps.done.referral.hidden = true;
      }
      /* 2026-10-12. A new quote counts its own questions. countText() remembers for the visit which question was answered for the
         visitor when the page loaded. A ZIP that came in the address (?zip=) is gone after Start over (and after a finished request):
         its question is asked again and must be counted ("Step 2 of 6"), where it read "Changing an answer". A city page's own ZIP
         comes back with the reset and stays out of the count. */
      if (info.reason === "reset" || info.reason === "close") ui.countSkip = null;
      if (now.zipSource === "open" || now.zipSource === "url") ui.again = "";   // a ZIP has been handed over anew: the engine holds it, nothing is offered beside it
      if (info.reason === "close" || (info.reason === "set" && has(info.changed, "zip") && now.zip !== ui.again)) ui.again = "";   // a finished request or the visitor's replacement (even empty) ends the offer
      if (now.frequency) ui.prefer = "";
      takeNotices(now, info);
      if (moved) showStep(now, false);
      else { ui.blocked = false; ui.flash = ""; var def = stepDef(now.step); if (def.update) def.update(now, info.changed, api); }
      renderFrame(now);
      if (moved && mount && !ui.sheetOpen && now.step !== "dogs") {   // everything after the first question runs in the panel
        openSheet(pressed && pressed !== doc.body && doc.contains(pressed) ? pressed : null, ui.way || wayFor(info.reason));
        focusOpened(false);
      } else syncHero();
      if (moved && now.step === "frequency" && ui.prefer) win.Promise.resolve().then(applyPrefer);
    });

    if (mount) { mount.addEventListener("pointerdown", warmPoses, { passive: true }); mount.addEventListener("keydown", warmPoses); }   // the first touch of the card (2026-10-18)
    win.addEventListener("scroll", watchView, { passive: true });
    win.addEventListener("resize", function () { watchView(); ui.floor = false; syncPin(store.getState()); scheduleMore(); });   // syncPin: a window that became short, or tall again (M4)
    if (doc.fonts && doc.fonts.addEventListener) doc.fonts.addEventListener("loadingdone", scheduleMore);   // 2026-10-12: words change width when the site's typeface arrives (placeOver)
    watchView();

    // [data-purge-quote], a[href="#quote"], a[href="#get-quote"], <form data-pp-zip-form>, ?open_quote=1, window.PurgeProsQuote.open({ zip })
    hooks = C.installPageHooks(store, { open: onOpen, close: onClose, busy: onBusy });
    api.hooks = hooks; win.PPBuilder.hooks = hooks;

    if (store.initialNotices && store.initialNotices.length) { takeNotices(store.getState(), { notices: store.initialNotices, changed: [], reason: "start" }); renderNotice(store.getState()); }
    if (resumeToken) store.resume(resumeToken);

    // the other questions' pictures are fetched now, so a step never arrives with holes in it
    win.setTimeout(function () {
      var now = store.getState();
      ["dogs", "zip", "yard", "areas", "frequency"].forEach(function (id) {
        if (ui.panels[id] || !steps[id]) return;
        var panel = steps[id].build(api, id);
        panel.classList.add("ppb-panel"); panel.setAttribute("data-ppb-step", id); panel.hidden = true;
        ui.panels[id] = panel; el.opts.append(panel);
        if (steps[id].update) steps[id].update(now, null, api);
      });
      [ICON.zero, ICON.chat, ICON.calendar, ICON.ok, ICON.returning, GLOVED_PAGE ? ICON.pin : null, ICON.close, ICON.alert, ICON.name, ICON.house, ICON.email, ICON.call, ICON.fresh].forEach(function (path) { if (path) new win.Image().src = ASSETS + path; });   // the two poses: warmPoses()
    }, 60);
  }

  /* for click tests */
  function round(n) { return Math.round(n * 10) / 10; }
  function measure() {
    if (!doc.contains(el.stage)) {                   // the panel is closed and the hero card shows the summary
      var card = (mount && mount.firstElementChild ? mount.firstElementChild : el.stage).getBoundingClientRect();
      return JSON.stringify({ step: "hero:" + ui.hero, mode: "hero", top: round(card.top), pageTop: round(card.top + win.scrollY), left: round(card.left), w: round(card.width), h: round(card.height), scrollY: Math.round(win.scrollY) });
    }
    var stage = el.stage.getBoundingClientRect();
    var at = function (node) { var b = node.getBoundingClientRect(); return [round(b.top - stage.top), round(b.height)]; };
    var active = doc.activeElement;
    return JSON.stringify({ step: ui.step + (ui.step === "request" ? ":" + steps.request.screenId(store.getState()) : ""), mode: ui.mode, top: round(stage.top), pageTop: round(stage.top + win.scrollY), left: round(stage.left), w: round(stage.width), h: round(stage.height),
      title: at(el.title)[0], progress: at(el.progress)[0], q: at(el.q)[0], opts: at(el.optwrap), foot: at(el.foot)[0], back: el.back.getClientRects().length ? at(el.back)[0] : "none", next: at(el.next),
      scrollY: Math.round(win.scrollY), inner: [el.opts.scrollHeight, el.opts.clientHeight],
      focus: active ? (active.getAttribute("data-ppb-q") != null ? "question" : active.id || active.className || active.tagName) : "" });
  }
  /* every control on show that is smaller than 44px in either direction (empty list = pass) */
  function smallTargets() {
    var scopes = [ui.sheetOpen ? el.sheet : mount, el.bar].filter(Boolean), found = [];
    scopes.forEach(function (scope) {
      each(scope, "button, a[href], input, textarea, [tabindex='0']", function (node) {
        if (!node.getClientRects().length || win.getComputedStyle(node).visibility === "hidden") return;
        var box = node.getBoundingClientRect();
        if (box.width < 43.5 || box.height < 43.5) found.push((node.className || node.tagName) + " " + round(box.width) + "x" + round(box.height));
      });
    });
    return JSON.stringify(found);
  }

  /* every piece of text on show that its own box cuts off (empty list = pass): nothing in the builder may end in an ellipsis */
  function cutText() {
    var scopes = [ui.sheetOpen ? el.sheet : mount, el.bar && el.bar.classList.contains("is-on") ? el.bar : null].filter(Boolean), found = [];
    scopes.forEach(function (scope) {
      each(scope, "*", function (node) {
        if (!node.getClientRects().length || node.classList.contains("vh")) return;
        var words = Array.prototype.some.call(node.childNodes, function (kid) { return kid.nodeType === 3 && kid.textContent.trim(); });
        if (!words) return;
        var style = win.getComputedStyle(node);
        if (style.visibility === "hidden" || style.overflowX === "visible") return;
        if (node.scrollWidth > node.clientWidth + 1) found.push((node.className || node.tagName) + ": " + node.textContent.trim().slice(0, 40));
      });
    });
    return found;
  }

  win.PPBuilder = {
    version: "2026-10-18a", store: store, hooks: null, ui: ui, el: el, api: api, COPY: COPY, SAY: SAY, steps: steps, city: CITY, town: TOWN,
    registerStep: registerStep, refresh: refresh, openPop: openPop, closePop: closePop,
    open: function (openOptions) { return hooks.open(openOptions || {}, null); },
    close: function () { return hooks.close(); },
    measure: measure, smallTargets: smallTargets, cut: cutText
  };

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start); else start();
})();
