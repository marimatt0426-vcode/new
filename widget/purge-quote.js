/*!
 * Purge Pros — Instant Online Quote widget
 * Self-contained popup quote funnel. No dependencies.
 *
 * Embed:  <script src="https://YOUR-HOST/purge-quote.js" defer></script>
 * Open:   any element with [data-purge-quote] or a link to "#quote",
 *         or call window.PurgeProsQuote.open()
 *
 * All pricing/copy lives in PQ_CONFIG below — edit there, nowhere else.
 */
(function () {
  "use strict";
  if (window.PurgeProsQuote) return; // don't double-init

  /* ============================================================
   * CONFIG — everything an owner should ever need to touch
   * ============================================================ */
  var PQ_CONFIG = {
    // Cloudflare Worker relay URL (see /worker in the repo).
    // Leave "" during development: payloads log to the console instead.
    leadEndpoint: "",

    brand: {
      name: "Purge Pros",
      // TODO: set the real business line customers should call
      phoneDisplay: "(317) 555-0123",
      phoneHref: "tel:+13175550123",
      chips: [
        "5.0 Google rating",
        "Pay per visit — no monthly billing",
        "No contracts",
        "Text alerts before arrival"
      ],
      testimonial: "" // optional: "“Quote here.” – Name"
    },

    serviceZips: [
      "46011","46013","46014","46015","46016","46032","46033","46034","46037",
      "46038","46040","46048","46051","46055","46056","46060","46061","46062",
      "46064","46074","46075","46077","46112","46113","46122","46123","46140",
      "46142","46143","46158","46163","46167","46168","46214","46216","46217",
      "46220","46221","46227","46228","46231","46234","46236","46237","46239",
      "46240","46250","46256","46259","46260","46268","46278","46280"
    ],

    frequencies: [
      { id: "twice", label: "Twice Weekly", sub: "For heavy-use yards", maxDogs: 9,
        prices: { 1: 15.99, 2: 17.49, 3: 18.99, 4: 20.49, 5: 21.99, 6: 23.49, 7: 24.99, 8: 26.49, 9: 27.99 } },
      { id: "weekly", label: "Weekly", sub: "Best fit for most yards", maxDogs: 5, popular: true,
        prices: { 1: 19.99, 2: 22.49, 3: 24.99, 4: 27.49, 5: 29.99 } },
      { id: "biweekly", label: "Every Other Week", sub: "Lower-maintenance option", maxDogs: 4,
        prices: { 1: 29.99, 2: 33.49, 3: 36.99, 4: 40.49 } },
      { id: "onetime", label: "One-Time Clean", sub: "Reset & catch-up clean", flat: 89.99, anyDogs: true,
        notes: [
          "30 minutes of labor included, then $1/min through completion",
          "Deposit of the base rate is due at scheduling — we’ll reach out",
          "Any additional fees billed after job completion"
        ] },
      { id: "custom", label: "Custom Booking", sub: "10+ dogs, 1+ acre, kennels & commercial", custom: true }
    ],

    // Per-visit surcharges. Waived for one-time cleans.
    areas: [
      { id: "back",       label: "Back Yard",          add: 0 },
      { id: "front",      label: "Front Yard",          add: 0 },
      { id: "side",       label: "Side Yard(s)",        add: 0 },
      { id: "front_back", label: "Front & Back",        add: 2.5 },
      { id: "front_side", label: "Front & Side(s)",     add: 2.5 },
      { id: "back_side",  label: "Back & Side(s)",      add: 2.5 },
      { id: "all",        label: "Yard+ (All Sides)",   add: 5 }
    ],
    yardSizes: [
      { id: "s",    label: "Small · ⅛ acre",   add: 0 },
      { id: "m",    label: "Medium · ¼ acre",  add: 4 },
      { id: "l",    label: "Large · ½ acre",   add: 8 },
      { id: "xl",   label: "X-Large · 1 acre",      add: 12 },
      { id: "over", label: "Over 1 acre", customOnly: true }
    ],
    customYardSizes: ["XX-Large · 1–2 acres", "2+ acres", "Kennel", "Other (specify in notes)"],

    lastCleaned: ["1 Week", "2 Weeks", "3 Weeks", "1 Month", "2 Months", "3–4 Months", "5–6 Months", "6+ Months"],

    addons: [
      { id: "wysiwash", label: "WYSIWash Treatment",
        desc: "Deodorizer & sanitizer — keeps the yard fresh between visits",
        prices: { twice: 19.99, weekly: 24.99, biweekly: 29.99, onetime: 29.99 } }
    ],

    // Coupon codes. Empty = the coupon row is hidden entirely.
    // Example: { SCOOP10: { type: "percent", value: 10, label: "10% off every visit" } }
    coupons: {},

    freebies: [
      "💩 Waste hauled away — FREE",
      "💬 Text alerts — FREE",
      "🦴 Dog treats — FREE"
    ],

    copy: {
      eyebrow: "INSTANT ONLINE QUOTE",
      title: "GET YOUR PRICE AND PICK YOUR PLAN.",
      subtitle: "Start with your ZIP code. Weekly is preselected because it fits most yards.",
      phoneHint: "We only use this for quote follow-up and service details.",
      consent: "I agree to receive service-related texts and emails from Purge Pros. Msg & data rates may apply. Reply STOP to opt out.",
      outOfArea: "We don’t service ZIP {zip} right now, but we’re growing fast. Drop your email and we’ll let you know when we launch in your area.",
      doneTitle: "You’re on the schedule! 🎉",
      doneBody: "We’ll text you shortly to confirm your first visit. You’ll get a text alert before every arrival and a gate photo when we leave.",
      doneCustomTitle: "Request received! ✅",
      doneCustomBody: "We’re reviewing your details and will text you a personalized estimate shortly — usually within business hours the same day."
    }
  };

  /* ============================================================
   * STATE
   * ============================================================ */
  var state = {
    step: "zip",          // zip | notify | plan | details | done
    zip: "",
    dogs: 1,              // 1..9 or "10+"
    freq: "weekly",
    area: "back",
    yardSize: "s",
    customYardSize: "",
    lastCleaned: PQ_CONFIG.lastCleaned[0],
    addons: [],
    coupon: null,         // applied coupon code
    phone: "",            // digits only
    priceUnlocked: false,
    notes: "",
    contact: { first: "", last: "", email: "", street: "", city: "", state: "IN", consent: true },
    questionOpen: false,
    doneCustom: false
  };

  function freqDef(id) {
    for (var i = 0; i < PQ_CONFIG.frequencies.length; i++)
      if (PQ_CONFIG.frequencies[i].id === (id || state.freq)) return PQ_CONFIG.frequencies[i];
    return null;
  }
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function isCustom() { return state.freq === "custom"; }
  function isOneTime() { return state.freq === "onetime"; }

  function freqAllowed(f) {
    if (f.custom || f.anyDogs) return true;
    if (state.dogs === "10+") return false;
    return state.dogs <= f.maxDogs;
  }

  // Per-visit price breakdown, or null when no instant price (custom booking)
  function quote() {
    if (isCustom()) return null;
    var f = freqDef(), rows = [], total = 0;
    if (f.flat != null) {
      rows.push({ label: "One-time clean (any # of dogs)", amt: f.flat });
      total = f.flat;
    } else {
      var base = f.prices[state.dogs];
      if (base == null) return null;
      rows.push({ label: state.dogs + (state.dogs === 1 ? " dog" : " dogs") + " · " + f.label, amt: base });
      total = base;
      var area = byId(PQ_CONFIG.areas, state.area);
      if (area && area.add) { rows.push({ label: area.label, amt: area.add }); total += area.add; }
      var size = byId(PQ_CONFIG.yardSizes, state.yardSize);
      if (size && size.add) { rows.push({ label: size.label, amt: size.add }); total += size.add; }
    }
    for (var i = 0; i < state.addons.length; i++) {
      var a = byId(PQ_CONFIG.addons, state.addons[i]);
      var p = a && a.prices[state.freq];
      if (p != null) { rows.push({ label: a.label, amt: p }); total += p; }
    }
    if (state.coupon && PQ_CONFIG.coupons[state.coupon]) {
      var c = PQ_CONFIG.coupons[state.coupon];
      var off = c.type === "percent" ? total * (c.value / 100) : c.value;
      off = Math.min(off, total);
      rows.push({ label: "Coupon " + state.coupon, amt: -off });
      total -= off;
    }
    return { rows: rows, total: Math.round(total * 100) / 100 };
  }

  function money(n) {
    var neg = n < 0;
    var s = "$" + Math.abs(n).toFixed(2);
    return neg ? "−" + s : s;
  }

  /* ============================================================
   * LEAD SENDER — state-transition based, deduped, debounced.
   * Nothing is sent per-keystroke; a finished lead costs 2–4 requests total.
   * ============================================================ */
  var sender = {
    timers: {},
    lastKey: {},
    queue: function (stage, delay) {
      var self = this;
      clearTimeout(this.timers[stage]);
      this.timers[stage] = setTimeout(function () { self.send(stage); }, delay == null ? 800 : delay);
    },
    send: function (stage) {
      var payload = buildPayload(stage);
      // Dedupe: identical content for a stage is never sent twice.
      var key = JSON.stringify([payload.phone, payload.email, payload.zip, payload.frequency,
        payload.dogs, payload.areas, payload.yardSize, payload.addons, payload.perVisitPrice,
        payload.question, payload.firstName, payload.street]);
      if (this.lastKey[stage] === key) return;
      this.lastKey[stage] = key;
      postLead(payload, 0);
    }
  };

  function buildPayload(stage) {
    var q = quote();
    return {
      stage: stage,
      ts: new Date().toISOString(),
      page: location.href,
      zip: state.zip,
      frequency: freqDef() ? freqDef().label : state.freq,
      dogs: String(state.dogs),
      areas: (byId(PQ_CONFIG.areas, state.area) || {}).label || "",
      yardSize: isCustom() ? state.customYardSize : ((byId(PQ_CONFIG.yardSizes, state.yardSize) || {}).label || ""),
      lastCleaned: state.lastCleaned,
      addons: state.addons.map(function (id) { return (byId(PQ_CONFIG.addons, id) || {}).label; }).join(", "),
      coupon: state.coupon || "",
      perVisitPrice: q ? q.total.toFixed(2) : "",
      phone: state.phone,
      firstName: state.contact.first,
      lastName: state.contact.last,
      email: state.contact.email,
      street: state.contact.street,
      city: state.contact.city,
      state: state.contact.state,
      notes: state.notes,
      question: state.question || "",
      consent: state.contact.consent ? "yes" : "no"
    };
  }

  function postLead(payload, attempt) {
    if (!PQ_CONFIG.leadEndpoint) {
      try { console.debug("[PurgeProsQuote] lead (dev mode, no endpoint set):", payload); } catch (e) {}
      return;
    }
    fetch(PQ_CONFIG.leadEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(function () {
      if (attempt < 1) setTimeout(function () { postLead(payload, attempt + 1); }, 2000);
    });
  }

  /* ============================================================
   * STYLES
   * ============================================================ */
  var CSS = "" +
    ".pq-overlay{position:fixed;inset:0;z-index:99999;background:rgba(10,12,16,.72);display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow-y:auto;-webkit-overflow-scrolling:touch;backdrop-filter:blur(3px)}" +
    ".pq-modal{position:relative;width:100%;max-width:760px;background:#0d0f12;border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.5);overflow:hidden;font-family:inherit;margin:auto 0;border:1px solid rgba(56,182,255,.25)}" +
    ".pq-modal *{box-sizing:border-box;margin:0;font-family:inherit}" +
    ".pq-close{position:absolute;top:14px;right:14px;width:38px;height:38px;border-radius:50%;border:0;background:#fff;color:#0d0f12;font-size:18px;line-height:1;cursor:pointer;z-index:3}" +
    ".pq-close:hover{background:#38b6ff;color:#fff}" +
    ".pq-head{padding:26px 28px 20px;color:#fff}" +
    ".pq-eyebrow{color:#38b6ff;font-weight:800;font-size:12px;letter-spacing:.12em}" +
    ".pq-title{font-size:26px;font-weight:900;line-height:1.1;margin:6px 0 8px;text-transform:uppercase}" +
    ".pq-sub{font-size:14px;color:#cfd6dd;max-width:520px}" +
    ".pq-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}" +
    ".pq-chip{font-size:12px;font-weight:600;color:#e8eef4;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:6px 12px}" +
    ".pq-quote-line{font-size:13px;color:#cfd6dd;font-style:italic;margin-top:12px}" +
    ".pq-call{font-size:13px;color:#cfd6dd;margin-top:8px}" +
    ".pq-call a{color:#38b6ff;font-weight:700;text-decoration:underline}" +
    ".pq-body{background:#fff;border-radius:16px 16px 0 0;padding:22px 26px 26px;color:#16191d}" +
    ".pq-dots{display:flex;gap:7px;justify-content:center;margin-bottom:16px}" +
    ".pq-dot{width:8px;height:8px;border-radius:50%;background:#c9d4dc}.pq-dot.on{background:#38b6ff}" +
    ".pq-h{font-size:21px;font-weight:800;margin-bottom:4px}" +
    ".pq-p{font-size:14px;color:#5b6770;margin-bottom:14px}" +
    ".pq-label{display:block;font-size:13px;font-weight:700;margin:16px 0 8px}" +
    ".pq-hintright{float:right;font-weight:600;font-size:12px;color:#38b6ff}" +
    ".pq-row{display:flex;gap:10px}" +
    ".pq-input,.pq-select,.pq-textarea{width:100%;padding:12px 14px;font-size:15px;border:1.5px solid #d6dee5;border-radius:10px;background:#fff;color:#16191d;outline:none}" +
    ".pq-input:focus,.pq-select:focus,.pq-textarea:focus{border-color:#38b6ff;box-shadow:0 0 0 3px rgba(56,182,255,.18)}" +
    ".pq-input.pq-bad{border-color:#e0564f}" +
    ".pq-btn{border:0;border-radius:999px;padding:13px 24px;font-size:15px;font-weight:800;cursor:pointer;background:#38b6ff;color:#fff;transition:transform .06s, background .15s}" +
    ".pq-btn:hover{background:#1da4f5}.pq-btn:active{transform:scale(.98)}" +
    ".pq-btn[disabled]{background:#a8d9f7;cursor:not-allowed}" +
    ".pq-btn-ghost{background:#fff;color:#16191d;border:1.5px solid #d6dee5}.pq-btn-ghost:hover{background:#f2f8fc;border-color:#38b6ff}" +
    ".pq-grid{display:grid;gap:10px}" +
    ".pq-grid-dogs{grid-template-columns:repeat(5,1fr)}" +
    ".pq-grid-2{grid-template-columns:1fr 1fr}" +
    "@media(max-width:560px){.pq-grid-dogs{grid-template-columns:repeat(3,1fr)}.pq-grid-2{grid-template-columns:1fr}.pq-row{flex-direction:column}.pq-title{font-size:22px}.pq-body,.pq-head{padding-left:18px;padding-right:18px}}" +
    ".pq-opt{position:relative;border:1.5px solid #d6dee5;border-radius:12px;background:#fff;padding:12px;text-align:left;cursor:pointer;font-size:14px;font-weight:700;color:#16191d}" +
    ".pq-opt small{display:block;font-weight:500;color:#5b6770;font-size:12px;margin-top:3px}" +
    ".pq-opt:hover{border-color:#9fd9ff}" +
    ".pq-opt.sel{border-color:#38b6ff;background:#eef8ff;box-shadow:0 0 0 1px #38b6ff inset}" +
    ".pq-opt.dis{opacity:.45;cursor:not-allowed}" +
    ".pq-opt .pq-pop{position:absolute;top:-9px;right:10px;background:#38b6ff;color:#fff;font-size:10px;font-weight:800;border-radius:999px;padding:2px 8px;letter-spacing:.04em}" +
    ".pq-center{text-align:center}" +
    ".pq-note{font-size:12px;color:#5b6770;margin-top:6px}" +
    ".pq-pricebox{border:1.5px solid #d6dee5;border-radius:12px;padding:14px 16px;margin-top:14px;background:#fafcfe}" +
    ".pq-pricebox.locked{background:#f2f6f9;color:#8a97a1;text-align:center;font-size:14px;padding:18px}" +
    ".pq-prow{display:flex;justify-content:space-between;font-size:14px;padding:4px 0;color:#3c4750}" +
    ".pq-prow.total{border-top:1.5px dashed #d6dee5;margin-top:6px;padding-top:10px;font-weight:900;font-size:17px;color:#16191d}" +
    ".pq-prow.total .amt{color:#1a9b4a;font-size:22px}" +
    ".pq-free{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}" +
    ".pq-free span{font-size:12px;background:#eef8ff;border:1px solid #bfe5ff;color:#1273ad;border-radius:999px;padding:4px 10px;font-weight:600}" +
    ".pq-waiver{margin-top:10px;font-size:13px;background:#effaf2;border:1px solid #bfe8cc;border-radius:10px;padding:10px 12px;color:#15703a;font-weight:600}" +
    ".pq-waiver button{background:none;border:0;color:#1273ad;font-weight:800;cursor:pointer;text-decoration:underline;font-size:13px;padding:0;margin-left:4px}" +
    ".pq-addon{display:flex;align-items:flex-start;gap:10px;border:1.5px solid #d6dee5;border-radius:12px;padding:12px;cursor:pointer;margin-top:8px}" +
    ".pq-addon.sel{border-color:#38b6ff;background:#eef8ff}" +
    ".pq-addon input{margin-top:3px;accent-color:#38b6ff;width:16px;height:16px}" +
    ".pq-addon .price{margin-left:auto;font-weight:800;color:#e8762d;white-space:nowrap}" +
    ".pq-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:20px;flex-wrap:wrap}" +
    ".pq-back{background:none;border:0;color:#5b6770;font-size:14px;cursor:pointer;padding:8px 4px}.pq-back:hover{color:#16191d}" +
    ".pq-err{color:#c4423b;font-size:13px;margin-top:8px;display:none}" +
    ".pq-summary{display:flex;justify-content:space-between;align-items:center;background:#f2f6f9;border-radius:10px;padding:12px 14px;font-size:14px;font-weight:700;margin-bottom:14px}" +
    ".pq-summary .amt{color:#16191d;font-size:16px}" +
    ".pq-consent{display:flex;gap:9px;align-items:flex-start;font-size:12.5px;color:#5b6770;margin-top:14px;cursor:pointer}" +
    ".pq-consent input{accent-color:#38b6ff;width:16px;height:16px;margin-top:1px;flex:none}" +
    ".pq-qpanel{border:1.5px solid #d6e7f2;background:#f4f9fd;border-radius:12px;padding:16px;margin-top:16px}" +
    ".pq-done{text-align:center;padding:26px 8px}" +
    ".pq-done .big{font-size:46px}" +
    ".pq-feewrap{position:fixed;inset:0;z-index:100000;background:rgba(10,12,16,.6);display:flex;align-items:center;justify-content:center;padding:18px}" +
    ".pq-fee{background:#fff;border:2px solid #38b6ff;border-radius:16px;max-width:430px;width:100%;padding:24px;position:relative;color:#16191d;max-height:90vh;overflow-y:auto}" +
    ".pq-fee h3{font-size:19px;font-weight:900;margin-bottom:12px}" +
    ".pq-fee p{font-size:14px;margin-bottom:10px;color:#3c4750}" +
    ".pq-feebox{background:#f6f8fa;border:1px solid #e1e8ee;border-radius:12px;padding:14px 16px;margin:12px 0}" +
    ".pq-feerow{display:flex;justify-content:space-between;font-size:14px;padding:7px 0;border-bottom:1px solid #e7edf2;color:#5b6770}" +
    ".pq-feerow:last-child{border-bottom:0}" +
    ".pq-feerow .strike{text-decoration:line-through}" +
    ".pq-feerow.red{font-weight:800;color:#3c4750}.pq-feerow.red .strike{color:#d6453c}" +
    ".pq-feerow.green{border-top:1.5px dashed #d6dee5;font-weight:900;color:#16191d}.pq-feerow.green .amt{color:#1a9b4a;font-size:20px}" +
    ".pq-fee .fine{font-size:11.5px;color:#8a97a1;text-align:center;margin-top:10px}" +
    ".pq-fee .mid{text-align:center;font-size:13px;font-weight:700;color:#15703a}";

  /* ============================================================
   * RENDERING
   * ============================================================ */
  var overlay = null, bodyEl = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function headHTML() {
    var b = PQ_CONFIG.brand, c = PQ_CONFIG.copy;
    var chips = b.chips.map(function (t) { return '<span class="pq-chip">' + esc(t) + "</span>"; }).join("");
    return '<div class="pq-head">' +
      '<div class="pq-eyebrow">' + esc(c.eyebrow) + "</div>" +
      '<h2 class="pq-title">' + esc(c.title) + "</h2>" +
      '<p class="pq-sub">' + esc(c.subtitle) + "</p>" +
      '<div class="pq-chips">' + chips + "</div>" +
      (b.testimonial ? '<div class="pq-quote-line">' + esc(b.testimonial) + "</div>" : "") +
      '<div class="pq-call">Need help instead? Call <a href="' + esc(b.phoneHref) + '">' + esc(b.phoneDisplay) + "</a></div>" +
      "</div>";
  }

  function dotsHTML() {
    var order = ["zip", "plan", "details", "done"];
    var cur = state.step === "notify" ? "zip" : state.step;
    return '<div class="pq-dots">' + order.map(function (s) {
      return '<span class="pq-dot' + (s === cur ? " on" : "") + '"></span>';
    }).join("") + "</div>";
  }

  function render() {
    if (!overlay) return;
    var html = dotsHTML();
    if (state.step === "zip") html += stepZip();
    else if (state.step === "notify") html += stepNotify();
    else if (state.step === "plan") html += stepPlan();
    else if (state.step === "details") html += stepDetails();
    else if (state.step === "done") html += stepDone();
    bodyEl.innerHTML = html;
    bindStep();
  }

  /* ---------- Step 1: ZIP ---------- */
  function stepZip() {
    return '<h3 class="pq-h">Check your area</h3>' +
      '<p class="pq-p">Enter your ZIP code to see if we service your neighborhood.</p>' +
      '<div class="pq-row">' +
      '<input class="pq-input" id="pq-zip" inputmode="numeric" autocomplete="postal-code" maxlength="5" placeholder="ZIP code" value="' + esc(state.zip) + '">' +
      '<button class="pq-btn" id="pq-zip-go" style="flex:none">Check My ZIP</button>' +
      "</div>" +
      '<div class="pq-err" id="pq-zip-err">Please enter a 5-digit ZIP code.</div>';
  }

  function stepNotify() {
    return '<h3 class="pq-h">We’re not there yet</h3>' +
      '<p class="pq-p">' + esc(PQ_CONFIG.copy.outOfArea.replace("{zip}", state.zip)) + "</p>" +
      '<div class="pq-row">' +
      '<input class="pq-input" id="pq-oo-email" type="email" autocomplete="email" placeholder="you@email.com">' +
      '<button class="pq-btn" id="pq-oo-go" style="flex:none">Notify Me</button>' +
      "</div>" +
      '<div class="pq-err" id="pq-oo-err">Please enter a valid email.</div>' +
      '<div class="pq-foot"><button class="pq-back" id="pq-oo-back">← Try a different ZIP</button></div>';
  }

  /* ---------- Step 2: Build your plan ---------- */
  function dogChips() {
    var out = "";
    for (var d = 1; d <= 9; d++) {
      out += '<button class="pq-opt pq-center' + (state.dogs === d ? " sel" : "") + '" data-dogs="' + d + '">' +
        d + (d === 1 ? " dog" : " dogs") + "</button>";
    }
    out += '<button class="pq-opt pq-center' + (state.dogs === "10+" ? " sel" : "") + '" data-dogs="10+">10+ dogs<small>Custom</small></button>';
    return out;
  }

  function freqCards() {
    return PQ_CONFIG.frequencies.map(function (f) {
      var allowed = freqAllowed(f);
      var cls = "pq-opt" + (state.freq === f.id ? " sel" : "") + (allowed ? "" : " dis");
      var hint = allowed ? f.sub : "Not available for " + state.dogs + " dogs";
      return '<button class="' + cls + '" data-freq="' + f.id + '"' + (allowed ? "" : " disabled") + ">" +
        (f.popular ? '<span class="pq-pop">MOST POPULAR</span>' : "") +
        esc(f.label) + "<small>" + esc(hint) + "</small></button>";
    }).join("");
  }

  function optionCards(list, key, attr) {
    return list.map(function (o) {
      return '<button class="pq-opt' + (state[key] === o.id ? " sel" : "") + '" data-' + attr + '="' + o.id + '">' +
        esc(o.label) +
        (o.customOnly ? "<small>Custom Booking</small>" : (o.add ? "<small>+" + money(o.add) + "/visit</small>" : "<small>Included</small>")) +
        "</button>";
    }).join("");
  }

  function addonRows() {
    if (isCustom()) return "";
    var rows = PQ_CONFIG.addons.map(function (a) {
      var p = a.prices[state.freq];
      if (p == null) return "";
      var on = state.addons.indexOf(a.id) >= 0;
      return '<label class="pq-addon' + (on ? " sel" : "") + '"><input type="checkbox" data-addon="' + a.id + '"' + (on ? " checked" : "") + ">" +
        "<span><strong>" + esc(a.label) + "</strong><small style='display:block;color:#5b6770'>" + esc(a.desc) + "</small></span>" +
        '<span class="price">+' + money(p) + "/visit</span></label>";
    }).join("");
    if (!rows) return "";
    return '<span class="pq-label">Optional add-ons <span class="pq-hintright">' + PQ_CONFIG.addons.length + " available</span></span>" + rows;
  }

  function couponRow() {
    if (isCustom() || !Object.keys(PQ_CONFIG.coupons).length) return "";
    return '<span class="pq-label">Add coupon <span class="pq-hintright">Optional</span></span>' +
      '<div class="pq-row"><input class="pq-input" id="pq-coupon" placeholder="Coupon code" value="' + esc(state.coupon || "") + '">' +
      '<button class="pq-btn pq-btn-ghost" id="pq-coupon-apply" style="flex:none">Apply</button></div>' +
      '<div class="pq-err" id="pq-coupon-err">That code isn’t valid.</div>';
  }

  function priceBoxHTML() {
    if (isCustom()) {
      return '<div class="pq-pricebox"><div class="pq-prow total"><span>Personalized estimate</span><span class="amt" style="font-size:15px;color:#1273ad">We’ll text it to you</span></div>' +
        '<div class="pq-note">Custom bookings (10+ dogs, 1+ acre, kennels & commercial) are priced after we review your details — no obligation.</div></div>';
    }
    if (!state.priceUnlocked) {
      return '<div class="pq-pricebox locked" id="pq-pricebox">Enter your phone number to view your quote.</div>';
    }
    var q = quote();
    if (!q) return "";
    var f = freqDef();
    var rows = q.rows.map(function (r) {
      return '<div class="pq-prow"><span>' + esc(r.label) + "</span><span>" + (r.amt >= 0 ? "" : "") + money(r.amt) + (f.flat == null ? "/visit" : "") + "</span></div>";
    }).join("");
    var notes = "";
    if (isOneTime() && f.notes) {
      notes = f.notes.map(function (n) { return '<div class="pq-note">• ' + esc(n) + "</div>"; }).join("");
    }
    var waiver = "";
    if (!isOneTime()) {
      waiver = '<div class="pq-waiver">💰 $99+ Initial Deep-Clean Fee: <s>$99.99+</s> WAIVED' +
        '<button type="button" id="pq-fee-info">What’s this?</button></div>';
    }
    var free = '<div class="pq-free">' + PQ_CONFIG.freebies.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div>";
    return '<div class="pq-pricebox" id="pq-pricebox">' + rows +
      '<div class="pq-prow total"><span>' + (f.flat != null ? "One-time total" : "Per visit") + '</span><span class="amt">' + money(q.total) + "</span></div>" +
      notes + waiver + free + "</div>";
  }

  function questionPanel() {
    if (!state.questionOpen) return "";
    return '<div class="pq-qpanel" id="pq-qpanel">' +
      '<h4 style="font-size:16px;font-weight:800;margin-bottom:4px">Ask before you commit</h4>' +
      '<p class="pq-p" style="margin-bottom:10px">Send your question and we’ll reply with real details — your quote info comes along with it.</p>' +
      '<div class="pq-grid pq-grid-2">' +
      '<input class="pq-input" id="pq-q-first" placeholder="First name" autocomplete="given-name" value="' + esc(state.contact.first) + '">' +
      '<input class="pq-input" id="pq-q-email" type="email" placeholder="you@email.com" autocomplete="email" value="' + esc(state.contact.email) + '">' +
      "</div>" +
      '<textarea class="pq-textarea" id="pq-q-text" rows="3" style="margin-top:10px" placeholder="Example: Is weekly enough for two dogs on a smaller gravel yard, and how soon could service start?"></textarea>' +
      '<div class="pq-err" id="pq-q-err">Add your question and a phone number above so we can reply.</div>' +
      '<div class="pq-foot"><span class="pq-note">We include your ZIP, dog count, frequency and price so the reply has full context.</span>' +
      '<button class="pq-btn" id="pq-q-send">Send My Question</button></div></div>';
  }

  function stepPlan() {
    var phoneFmt = formatPhone(state.phone);
    return '<h3 class="pq-h">Build your plan</h3>' +
      '<p class="pq-p">Tell us about your yard so we can give you an accurate price. Pay per visit — never billed monthly.</p>' +

      '<span class="pq-label">How many dogs?</span>' +
      '<div class="pq-grid pq-grid-dogs">' + dogChips() + "</div>" +

      '<span class="pq-label">How often? <span class="pq-hintright">Weekly is most popular</span></span>' +
      '<div class="pq-grid pq-grid-2">' + freqCards() + "</div>" +

      (isCustom() ? customFields() : standardFields()) +

      '<span class="pq-label">Enter phone number to view ' + (isCustom() ? "your estimate request" : "your quote") + "</span>" +
      '<input class="pq-input" id="pq-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(317) 555-1234" value="' + esc(phoneFmt) + '">' +
      '<div class="pq-note">' + esc(PQ_CONFIG.copy.phoneHint) + "</div>" +

      priceBoxHTML() +
      couponRow() +
      addonRows() +

      '<div class="pq-foot">' +
      '<button class="pq-btn pq-btn-ghost" id="pq-q-toggle">' + (state.questionOpen ? "Hide Question Form" : "Have Questions?") + "</button>" +
      '<button class="pq-btn" id="pq-continue"' + (canContinue() ? "" : " disabled") + ">" + (isCustom() ? "Request My Estimate" : "Get Started") + "</button>" +
      "</div>" +
      questionPanel() +
      '<div class="pq-foot"><button class="pq-back" id="pq-plan-back">← Change ZIP</button></div>';
  }

  function standardFields() {
    return '<span class="pq-label">Which areas do we clean?</span>' +
      '<div class="pq-grid pq-grid-2">' + optionCards(PQ_CONFIG.areas, "area", "area") + "</div>" +
      '<span class="pq-label">Yard size?</span>' +
      '<div class="pq-grid pq-grid-2">' + optionCards(PQ_CONFIG.yardSizes, "yardSize", "size") + "</div>" +
      '<span class="pq-label">When was the yard last thoroughly cleaned?</span>' +
      '<select class="pq-select" id="pq-lastclean">' +
      PQ_CONFIG.lastCleaned.map(function (o) {
        return '<option' + (o === state.lastCleaned ? " selected" : "") + ">" + esc(o) + "</option>";
      }).join("") + "</select>" +
      '<div class="pq-note">This does NOT affect pricing — it just tells us how much time to allot for your first visit.</div>';
  }

  function customFields() {
    return '<div class="pq-qpanel" style="margin-top:14px;background:#fbfdff">' +
      '<p class="pq-p" style="margin-bottom:10px"><strong>Custom Booking</strong> — for households, estates or kennels with 10+ dogs, yards over 1 acre, or commercial properties. We collect your info and follow up with a personalized estimate.</p>' +
      '<div class="pq-grid pq-grid-2">' +
      "<div><span class='pq-label' style='margin-top:0'>How many dogs?</span>" +
      '<input class="pq-input" id="pq-cdogs" inputmode="numeric" placeholder="e.g. 12" value="' + esc(state.dogs === "10+" ? "" : state.dogs) + '"></div>' +
      "<div><span class='pq-label' style='margin-top:0'>Property size</span>" +
      '<select class="pq-select" id="pq-csize">' +
      ["Select…"].concat(PQ_CONFIG.customYardSizes).map(function (o, i) {
        return '<option' + (o === state.customYardSize ? " selected" : "") + (i === 0 ? ' value=""' : "") + ">" + esc(o) + "</option>";
      }).join("") + "</select></div></div>" +
      "<span class='pq-label'>Anything we should know?</span>" +
      '<textarea class="pq-textarea" id="pq-cnotes" rows="3" placeholder="Kennel layout, gate codes, commercial property details…">' + esc(state.notes) + "</textarea></div>";
  }

  function canContinue() {
    return state.phone.length === 10;
  }

  /* ---------- Step 3: Details ---------- */
  function stepDetails() {
    var q = quote();
    var summary = isCustom()
      ? "Custom booking · personalized estimate"
      : (state.dogs + (state.dogs === 1 ? " dog" : " dogs") + ", " + freqDef().label);
    var amt = q ? (money(q.total) + (isOneTime() ? "" : "/visit")) : "TBD";
    var c = state.contact;
    return '<h3 class="pq-h">Almost there</h3>' +
      '<p class="pq-p">Fill in your details and we’ll get you on the schedule.</p>' +
      '<div class="pq-summary"><span>' + esc(summary) + '</span><span class="amt">' + esc(amt) + "</span></div>" +
      '<div class="pq-grid pq-grid-2">' +
      "<div><span class='pq-label' style='margin-top:0'>First name *</span><input class='pq-input' id='pq-first' autocomplete='given-name' value='" + esc(c.first) + "'></div>" +
      "<div><span class='pq-label' style='margin-top:0'>Last name *</span><input class='pq-input' id='pq-last' autocomplete='family-name' value='" + esc(c.last) + "'></div>" +
      "<div><span class='pq-label'>Email *</span><input class='pq-input' id='pq-email' type='email' autocomplete='email' value='" + esc(c.email) + "'></div>" +
      "<div><span class='pq-label'>Phone *</span><input class='pq-input' id='pq-dphone' type='tel' autocomplete='tel' value='" + esc(formatPhone(state.phone)) + "'></div>" +
      "</div>" +
      "<span class='pq-label'>Street address *</span><input class='pq-input' id='pq-street' autocomplete='street-address' value='" + esc(c.street) + "'>" +
      '<div class="pq-grid pq-grid-2" style="margin-top:10px">' +
      "<div><span class='pq-label' style='margin-top:0'>City</span><input class='pq-input' id='pq-city' autocomplete='address-level2' value='" + esc(c.city) + "'></div>" +
      "<div><span class='pq-label' style='margin-top:0'>State</span><input class='pq-input' id='pq-state' autocomplete='address-level1' value='" + esc(c.state) + "'></div>" +
      "</div>" +
      '<label class="pq-consent"><input type="checkbox" id="pq-consent"' + (c.consent ? " checked" : "") + ">" +
      "<span>" + esc(PQ_CONFIG.copy.consent) + "</span></label>" +
      '<div class="pq-err" id="pq-d-err">Please fill in the required fields.</div>' +
      '<div class="pq-foot">' +
      '<button class="pq-back" id="pq-d-back">← Back</button>' +
      '<button class="pq-btn" id="pq-d-go">' + (isCustom() ? "Send My Request" : "Start My Service") + "</button>" +
      "</div>";
  }

  /* ---------- Step 4: Done ---------- */
  function stepDone() {
    var c = PQ_CONFIG.copy;
    var title = state.doneCustom ? c.doneCustomTitle : c.doneTitle;
    var body = state.doneCustom ? c.doneCustomBody : c.doneBody;
    return '<div class="pq-done"><div class="big">✅</div>' +
      '<h3 class="pq-h">' + esc(title) + "</h3>" +
      '<p class="pq-p" style="max-width:440px;margin:0 auto 16px">' + esc(body) + "</p>" +
      '<div class="pq-free" style="justify-content:center">' + PQ_CONFIG.freebies.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div>" +
      '<div class="pq-foot" style="justify-content:center;margin-top:22px"><button class="pq-btn pq-btn-ghost" id="pq-done-close">Close</button></div></div>';
  }

  /* ---------- Start-up fee explainer ---------- */
  function openFeeModal() {
    var wrap = document.createElement("div");
    wrap.className = "pq-feewrap";
    wrap.innerHTML = '<div class="pq-fee">' +
      '<button class="pq-close" style="top:10px;right:10px" data-fee-close>×</button>' +
      "<h3>🤔 What is the “Start-Up Fee”?</h3>" +
      "<p>For new recurring customers, the first visit is a <strong>DEEP CLEAN</strong>. 💩 We hunt down <em>every single pile</em> to reset your yard to zero! 🐕✨</p>" +
      "<p>Normally, this takes us serious time &amp; labor… 🥵</p>" +
      '<div class="pq-feebox">' +
      '<div class="pq-feerow"><span>⏱️ Base Rate (30 mins):</span><span class="strike">$39.99</span></div>' +
      '<div class="pq-feerow"><span>👷 Extra Labor ($1/min):</span><span class="strike">~$60.00+</span></div>' +
      '<div class="pq-feerow red"><span>🏷️ TYPICAL TOTAL COST:</span><span class="strike">$99.99+</span></div>' +
      '<div class="pq-feerow green"><span>🎉 WITH THIS OFFER:</span><span class="amt">$0.00</span></div>' +
      "</div>" +
      '<p class="mid">✅ You pay your <strong>Per Visit Rate Only</strong>.<br>The “Deep Clean” labor is 100% on the house! 🏠💙</p>' +
      '<p class="fine">* Offer only valid for new recurring customers. Not valid for One-Time cleans. *</p>' +
      "</div>";
    wrap.addEventListener("click", function (e) {
      if (e.target === wrap || e.target.hasAttribute("data-fee-close")) wrap.remove();
    });
    document.body.appendChild(wrap);
  }

  /* ============================================================
   * EVENTS
   * ============================================================ */
  function formatPhone(digits) {
    if (!digits) return "";
    if (digits.length <= 3) return "(" + digits;
    if (digits.length <= 6) return "(" + digits.slice(0, 3) + ") " + digits.slice(3);
    return "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6, 10);
  }
  function digitsOf(s) { return String(s || "").replace(/\D/g, "").slice(0, 10); }
  function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || ""); }
  function $(id) { return bodyEl.querySelector("#" + id); }
  function show(el, on) { if (el) el.style.display = on ? "block" : "none"; }

  function ensureFreqValid() {
    var f = freqDef();
    if (f && freqAllowed(f)) return;
    if (state.dogs === "10+") { state.freq = "custom"; return; }
    var pick = null;
    for (var i = 0; i < PQ_CONFIG.frequencies.length; i++) {
      if (freqAllowed(PQ_CONFIG.frequencies[i]) && !PQ_CONFIG.frequencies[i].custom) { pick = PQ_CONFIG.frequencies[i].id; break; }
    }
    state.freq = pick || "custom";
  }

  function afterOptionChange() {
    ensureFreqValid();
    render();
    // Quote already unlocked → keep GHL's picture of this lead current,
    // but lazily (2.5s) and deduped, so option-fiddling stays cheap.
    if (state.priceUnlocked && state.phone.length === 10) sender.queue("quote_updated", 2500);
  }

  function bindStep() {
    // ZIP
    if (state.step === "zip") {
      var zipIn = $("pq-zip");
      zipIn.focus();
      var goZip = function () {
        var z = digitsOf(zipIn.value).slice(0, 5);
        if (z.length !== 5) { show($("pq-zip-err"), true); return; }
        state.zip = z;
        state.step = PQ_CONFIG.serviceZips.indexOf(z) >= 0 ? "plan" : "notify";
        render();
      };
      zipIn.addEventListener("keydown", function (e) { if (e.key === "Enter") goZip(); });
      $("pq-zip-go").addEventListener("click", goZip);
      return;
    }

    // Out-of-area notify
    if (state.step === "notify") {
      var em = $("pq-oo-email");
      em.focus();
      var goOO = function () {
        if (!validEmail(em.value)) { show($("pq-oo-err"), true); return; }
        state.contact.email = em.value.trim();
        sender.send("out_of_area");
        state.doneCustom = false;
        bodyEl.innerHTML = dotsHTML() + '<div class="pq-done"><div class="big">📨</div>' +
          '<h3 class="pq-h">You’re on the list!</h3>' +
          '<p class="pq-p">We’ll email you the moment we launch in ' + esc(state.zip) + ".</p>" +
          '<div class="pq-foot" style="justify-content:center"><button class="pq-btn pq-btn-ghost" id="pq-oo-done">Close</button></div></div>';
        bodyEl.querySelector("#pq-oo-done").addEventListener("click", close);
        return;
      };
      em.addEventListener("keydown", function (e) { if (e.key === "Enter") goOO(); });
      $("pq-oo-go").addEventListener("click", goOO);
      $("pq-oo-back").addEventListener("click", function () { state.step = "zip"; render(); });
      return;
    }

    // Plan
    if (state.step === "plan") {
      bodyEl.querySelectorAll("[data-dogs]").forEach(function (el) {
        el.addEventListener("click", function () {
          var v = el.getAttribute("data-dogs");
          state.dogs = v === "10+" ? "10+" : parseInt(v, 10);
          afterOptionChange();
        });
      });
      bodyEl.querySelectorAll("[data-freq]").forEach(function (el) {
        el.addEventListener("click", function () {
          if (el.disabled) return;
          state.freq = el.getAttribute("data-freq");
          afterOptionChange();
        });
      });
      bodyEl.querySelectorAll("[data-area]").forEach(function (el) {
        el.addEventListener("click", function () { state.area = el.getAttribute("data-area"); afterOptionChange(); });
      });
      bodyEl.querySelectorAll("[data-size]").forEach(function (el) {
        el.addEventListener("click", function () {
          var id = el.getAttribute("data-size");
          var def = byId(PQ_CONFIG.yardSizes, id);
          if (def && def.customOnly) { state.freq = "custom"; } else { state.yardSize = id; }
          afterOptionChange();
        });
      });
      var lc = $("pq-lastclean");
      if (lc) lc.addEventListener("change", function () { state.lastCleaned = lc.value; afterOptionChange(); });

      bodyEl.querySelectorAll("[data-addon]").forEach(function (el) {
        el.addEventListener("change", function () {
          var id = el.getAttribute("data-addon");
          var i = state.addons.indexOf(id);
          if (el.checked && i < 0) state.addons.push(id);
          if (!el.checked && i >= 0) state.addons.splice(i, 1);
          afterOptionChange();
        });
      });

      var couponBtn = $("pq-coupon-apply");
      if (couponBtn) couponBtn.addEventListener("click", function () {
        var code = ($("pq-coupon").value || "").trim().toUpperCase();
        if (PQ_CONFIG.coupons[code]) { state.coupon = code; afterOptionChange(); }
        else { show($("pq-coupon-err"), true); }
      });

      // Custom-booking fields
      var cd = $("pq-cdogs");
      if (cd) cd.addEventListener("input", function () {
        var n = parseInt(digitsOf(cd.value), 10);
        state.dogs = isNaN(n) ? "10+" : n;
      });
      var cs = $("pq-csize");
      if (cs) cs.addEventListener("change", function () { state.customYardSize = cs.value; });
      var cn = $("pq-cnotes");
      if (cn) cn.addEventListener("input", function () { state.notes = cn.value; });

      // THE GATE — phone unlocks the price and fires the lead, exactly once
      // per distinct valid number (debounced; never per keystroke).
      var ph = $("pq-phone");
      ph.addEventListener("input", function () {
        var d = digitsOf(ph.value);
        var caretAtEnd = ph.selectionStart === ph.value.length;
        state.phone = d;
        var fmt = formatPhone(d);
        if (ph.value !== fmt) { ph.value = fmt; if (caretAtEnd) ph.setSelectionRange(fmt.length, fmt.length); }
        var btn = $("pq-continue");
        if (d.length === 10) {
          if (!state.priceUnlocked) {
            state.priceUnlocked = true;
            var box = $("pq-pricebox");
            if (box) box.outerHTML = priceBoxHTML();
            var fee = $("pq-fee-info");
            if (fee) fee.addEventListener("click", openFeeModal);
          } else {
            var box2 = $("pq-pricebox");
            if (box2) { box2.outerHTML = priceBoxHTML(); var fee2 = $("pq-fee-info"); if (fee2) fee2.addEventListener("click", openFeeModal); }
          }
          if (btn) btn.disabled = false;
          sender.queue("phone_captured", 800);
        } else if (btn) {
          btn.disabled = true;
        }
      });
      ph.addEventListener("blur", function () {
        if (state.phone.length === 10) sender.queue("phone_captured", 0);
      });

      var feeBtn = $("pq-fee-info");
      if (feeBtn) feeBtn.addEventListener("click", openFeeModal);

      $("pq-q-toggle").addEventListener("click", function () {
        state.questionOpen = !state.questionOpen;
        render();
        if (state.questionOpen) {
          var p = bodyEl.querySelector("#pq-qpanel");
          if (p) p.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
      var qSend = $("pq-q-send");
      if (qSend) qSend.addEventListener("click", function () {
        var qt = ($("pq-q-text").value || "").trim();
        state.contact.first = ($("pq-q-first").value || "").trim() || state.contact.first;
        state.contact.email = ($("pq-q-email").value || "").trim() || state.contact.email;
        if (!qt || state.phone.length !== 10) { show($("pq-q-err"), true); return; }
        state.question = qt;
        sender.send("question_submitted");
        var panel = bodyEl.querySelector("#pq-qpanel");
        panel.innerHTML = '<p class="pq-p" style="margin:0"><strong>✅ Question sent!</strong> We’ll text you back shortly with real details.</p>';
      });

      $("pq-continue").addEventListener("click", function () {
        if (!canContinue()) return;
        if (isCustom() && state.dogs !== "10+" && !state.dogs) state.dogs = "10+";
        state.step = "details";
        render();
      });
      $("pq-plan-back").addEventListener("click", function () { state.step = "zip"; render(); });
      return;
    }

    // Details
    if (state.step === "details") {
      $("pq-d-back").addEventListener("click", function () { state.step = "plan"; render(); });
      $("pq-d-go").addEventListener("click", function () {
        var c = state.contact;
        c.first = $("pq-first").value.trim();
        c.last = $("pq-last").value.trim();
        c.email = $("pq-email").value.trim();
        c.street = $("pq-street").value.trim();
        c.city = $("pq-city").value.trim();
        c.state = $("pq-state").value.trim();
        c.consent = $("pq-consent").checked;
        state.phone = digitsOf($("pq-dphone").value) || state.phone;
        var ok = c.first && c.last && validEmail(c.email) && c.street && state.phone.length === 10;
        ["pq-first", "pq-last", "pq-email", "pq-street", "pq-dphone"].forEach(function (id) {
          var el = $(id);
          var bad = !el.value.trim() || (id === "pq-email" && !validEmail(el.value)) || (id === "pq-dphone" && digitsOf(el.value).length !== 10);
          el.classList.toggle("pq-bad", !!bad);
        });
        if (!ok) { show($("pq-d-err"), true); return; }
        state.doneCustom = isCustom();
        sender.send(isCustom() ? "estimate_requested" : "service_requested");
        state.step = "done";
        render();
      });
      return;
    }

    if (state.step === "done") {
      $("pq-done-close").addEventListener("click", close);
    }
  }

  /* ============================================================
   * OPEN / CLOSE / TRIGGERS
   * ============================================================ */
  function open() {
    if (overlay) return;
    var style = document.getElementById("pq-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "pq-style";
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    overlay = document.createElement("div");
    overlay.className = "pq-overlay";
    overlay.innerHTML = '<div class="pq-modal" role="dialog" aria-modal="true" aria-label="Instant online quote">' +
      '<button class="pq-close" aria-label="Close" data-pq-close>×</button>' +
      headHTML() + '<div class="pq-body"></div></div>';
    bodyEl = overlay.querySelector(".pq-body");
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay || e.target.hasAttribute("data-pq-close")) close();
    });
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";
    render();
  }

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    bodyEl = null;
    document.body.style.overflow = "";
  }

  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest('[data-purge-quote], a[href="#quote"], a[href="#get-quote"]');
    if (t) { e.preventDefault(); open(); }
  });

  window.PurgeProsQuote = { open: open, close: close, config: PQ_CONFIG };
})();
