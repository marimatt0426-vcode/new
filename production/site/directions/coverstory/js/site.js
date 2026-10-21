/* Purge Pros — "Cover Story" direction. site.js
   Header (sticky state, dropdowns, phone menu), FAQ (one open at a time), motion, and the count of presses on a
   text, call or email link (reported to the price engine; nothing here calls a tag).
   Every listener matches a real control. Nothing here reveals content: pages read fully without it. */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement;
  var me = doc.currentScript;                     /* this script's own tag: read once, while it is running */
  root.classList.add("js");

  var $ = function (sel, ctx) { return (ctx || doc).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); };

  /* ---- header: add a shadow and the masthead rule once the page has moved ---- */
  var hdr = $("[data-hdr]");
  if (hdr) {
    var ticking = false;
    var setStuck = function () { hdr.classList.toggle("is-stuck", window.scrollY > 24); ticking = false; };
    window.addEventListener("scroll", function () { if (!ticking) { ticking = true; window.requestAnimationFrame(setStuck); } }, { passive: true });
    setStuck();
  }

  /* ---- dropdowns: hover (CSS), click, keyboard. One open at a time. ----
     Services, Areas, and the bar's contact control ("Text or call" with the number: it opens the choice of two, Text first). */
  var menus = $$("[data-menu]"), MENU_BTN = ".nav__link, [data-menu-btn]";
  var closeMenu = function (item, opts) {
    if (!item) return;
    var btn = $(MENU_BTN, item);
    item.classList.remove("is-open");
    if (btn) btn.setAttribute("aria-expanded", "false");
    if (opts && opts.force) item.classList.add("is-closed");
  };
  var openMenu = function (item) {
    menus.forEach(function (m) { if (m !== item) closeMenu(m); });
    item.classList.remove("is-closed");
    item.classList.add("is-open");
    var btn = $(MENU_BTN, item);
    if (btn) btn.setAttribute("aria-expanded", "true");
  };
  menus.forEach(function (item) {
    var btn = $(MENU_BTN, item);
    var links = function () { return $$(".nav__drop a", item); };
    if (!btn) return;
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      if (item.classList.contains("is-open")) closeMenu(item, { force: true }); else openMenu(item);
    });
    item.addEventListener("mouseenter", function () { if (!item.classList.contains("is-closed")) btn.setAttribute("aria-expanded", "true"); });
    item.addEventListener("mouseleave", function () {
      item.classList.remove("is-closed");
      if (!item.classList.contains("is-open")) btn.setAttribute("aria-expanded", "false");
    });
    item.addEventListener("keydown", function (e) {
      var list = links(), i = list.indexOf(doc.activeElement);
      /* Escape dismisses the menu. With the pointer still resting on the item, hover alone would open it again, so the
         mark stays until the pointer leaves, the button is clicked or the arrow keys open it. */
      if (e.key === "Escape") { closeMenu(item, { force: true }); btn.focus(); window.setTimeout(function () { if (!item.matches(":hover")) item.classList.remove("is-closed"); }, 250); }
      else if (e.key === "ArrowDown") { e.preventDefault(); openMenu(item); (list[i + 1] || list[0]).focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (i <= 0) btn.focus(); else list[i - 1].focus(); }
      else if (e.key === "Home" && i > -1) { e.preventDefault(); list[0].focus(); }
      else if (e.key === "End" && i > -1) { e.preventDefault(); list[list.length - 1].focus(); }
    });
    item.addEventListener("focusout", function (e) { if (!item.contains(e.relatedTarget)) closeMenu(item); });
  });
  doc.addEventListener("click", function (e) {
    menus.forEach(function (m) { if (!m.contains(e.target)) closeMenu(m); });
  });
  /* a panel opened before this script arrived (the header's own few lines do that while the site code is on its way) */
  menus.forEach(function (m) { var b = $(MENU_BTN, m); if (b && m.classList.contains("is-open")) b.setAttribute("aria-expanded", "true"); });
  /* Escape from anywhere closes a menu that is open only because the pointer is over it */
  doc.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    menus.forEach(function (m) { if (m.classList.contains("is-open") || m.matches(":hover")) closeMenu(m, { force: true }); });
  });

  /* ---- phone menu: fixed panel, locks the page, closes by button, link, Escape ----
     The burger and the close control are real buttons (Space and Enter both work, and Safari's Tab stops at them).
     While the menu is open everything outside it is inert: Tab cannot leave it, a screen reader cannot wander out,
     and the page behind cannot be scrolled by focus. Inert is set on the siblings of the menu and of each element
     that holds it, up to the body, so it works wherever the menu sits (GoHighLevel wraps it in several boxes).
     Opening puts focus on the menu itself (no ring; the first Tab lands on its first control). Closing puts the page
     back where it was (older iPhones let the page behind scroll) and, when closed by its button or Escape, puts
     focus back on the burger. Browsers without inert (before Safari 15.5) keep the Tab wrap below.
     ONE thing holds the menu open while scripts run: the class is-open. The address (#mnav, :target) opens it only
     with scripts switched off, by a rule inside the header's own <noscript> (not in site.css), so a menu opened in
     any way before this script arrived is closed by removing the class and can never be left stuck on the screen. */
  var mnav = $("#mnav"), burger = $("[data-burger]");
  if (mnav && burger) {
    var closers = $$("[data-mnav-close]", mnav);
    var focusables = function () { return $$("a[href], button:not([disabled])", mnav); };
    var isOpen = function () { return mnav.classList.contains("is-open"); };
    var hushed = [], pageAt = 0;
    var hush = function (on) {
      hushed.splice(0).forEach(function (el) { el.inert = false; });
      if (!on || !("inert" in mnav)) return;
      for (var node = mnav; node && node !== doc.body && node.parentNode; node = node.parentNode) {
        Array.prototype.forEach.call(node.parentNode.children, function (el) {
          if (el === node || el.inert || /^(SCRIPT|STYLE|LINK|NOSCRIPT|TEMPLATE)$/.test(el.tagName)) return;
          el.inert = true; hushed.push(el);
        });
      }
    };
    var putBack = function () {
      if (Math.abs(window.scrollY - pageAt) < 2) return;
      var was = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";             /* at once: this is a correction, not a journey */
      window.scrollTo(0, pageAt);
      root.style.scrollBehavior = was;
    };
    var setOpen = function (open, returnFocus) {
      var was = isOpen();
      if (open && !was) pageAt = window.scrollY;
      mnav.classList.toggle("is-open", open);
      root.classList.toggle("is-locked", open);
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      hush(open);
      if (open) {
        var first = mnav.hasAttribute("tabindex") ? mnav : closers[0] || focusables()[0];
        if (first && !(was && mnav.contains(doc.activeElement))) { try { first.focus({ preventScroll: true }); } catch (error) { first.focus(); } }   /* taken over while open: the reader's focus stays where it is */
      } else {
        if (was) putBack();
        if (returnFocus) { try { burger.focus({ preventScroll: true }); } catch (error) { burger.focus(); } }
      }
    };
    /* An address that ends in #mnav asks for the menu. The header's own lines (they leave window.PPEarly) have opened
       it already, and the reader may have closed it again: the menu is taken over as it stands. Without those lines
       it is opened here. Either way the address is tidied, so Back does not have to be pressed twice. */
    var asked = window.location.hash === "#mnav";
    if (asked) history.replaceState(null, "", window.location.pathname + window.location.search);
    if (isOpen()) { pageAt = window.scrollY; setOpen(true); }   /* opened before this script arrived: take it over as it is */
    else if (asked && !window.PPEarly) setOpen(true);
    burger.addEventListener("click", function (e) { e.preventDefault(); setOpen(!isOpen(), true); });
    closers.forEach(function (c) { c.addEventListener("click", function (e) { e.preventDefault(); setOpen(false, true); }); });
    mnav.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest("a[href]") : null;
      if (a && !a.hasAttribute("data-mnav-close")) setOpen(false, false);
    });
    doc.addEventListener("keydown", function (e) {
      if (!isOpen()) return;
      if (e.key === "Escape") { setOpen(false, true); return; }
      if (e.key !== "Tab") return;
      var f = focusables(); if (!f.length) return;
      var first = f[0], last = f[f.length - 1], at = doc.activeElement;
      if (!mnav.contains(at)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (e.shiftKey && (at === first || at === mnav)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
      /* Safari's Tab stops at buttons only, so "first" and "last" above are not its first and last stops: from its last
         stop Tab leaves for the browser's own bar and focus rests on the page body. Bring it back to the panel. */
      else window.setTimeout(function () { if (isOpen() && !mnav.contains(doc.activeElement)) { try { mnav.focus({ preventScroll: true }); } catch (error) { mnav.focus(); } } }, 0);
    });
    var wide = window.matchMedia("(min-width: 1180px)");
    var onWide = function () { if (wide.matches && isOpen()) setOpen(false, false); };
    if (wide.addEventListener) wide.addEventListener("change", onWide); else if (wide.addListener) wide.addListener(onWide);
  }

  /* ---- FAQ: one open at a time inside each .faq, and across groups whose questions share a name ---- */
  $$(".faq").forEach(function (group) {
    var items = $$("details", group);
    items.forEach(function (d) {
      d.addEventListener("toggle", function () {
        if (!d.open) return;
        items.forEach(function (o) { if (o !== d && o.open) o.open = false; });
        var name = d.getAttribute("name");            /* browsers that know details[name] have already done this */
        if (name) $$("details.faq__item").forEach(function (o) { if (o !== d && o.open && o.getAttribute("name") === name) o.open = false; });
      });
    });
  });
  /* When the answer that closes is above the question just tapped, the page gets shorter above the reader's finger.
     Browsers with scroll anchoring hold the tapped question still; Safari does not, and the question jumps up, under
     the header or off the screen. This keeps it exactly where it was. It moves the scroll position only. */
  if ($(".faq__item")) doc.addEventListener("click", function (e) {
    var q = e.target && e.target.closest ? e.target.closest("summary.faq__q") : null;
    if (!q) return;
    var before = q.getBoundingClientRect().top;
    var settle = function () {
      var moved = q.getBoundingClientRect().top - before;
      if (Math.abs(moved) < 2) return;
      var was = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";             /* the page scrolls smoothly; this correction must not be seen */
      window.scrollBy(0, moved);
      root.style.scrollBehavior = was;
    };
    window.requestAnimationFrame(function () { settle(); window.setTimeout(settle, 80); });
  });

  /* ---- Google rating: ONE switch for every figure on the page ----
     No rating is typed into a page. The builder writes each figure from _work/partials/reviews.json: while that file
     holds a stand-in, the badges and the facts strip show it and are marked data-standin="true"; with no stand-in they
     are built with the neutral line ("Read our Google reviews") and no figure.
     On the live site the review feed's installer calls   PurgeProsReviews.set({ rating: 4.9, count: 43 })   once it
     knows the real figures: every element with data-pp-reviews (a line of text holding {rating} and {count}) and every
     data-pp-reviews-label (the same for an aria-label) is rewritten and the stand-in mark comes off. If the feed
     cannot supply them it calls   PurgeProsReviews.clear()   and every one of those lines becomes its neutral line
     (data-pp-neutral, data-pp-neutral-label); a line with no neutral wording is hidden.
     THE LIVE FIGURES (below the two functions). A page that may send (window.PPSite.mode "live" or "staging") and
     names a reviews address (window.PPSite.reviewsEndpoint: the quote Worker's /reviews, the same address the live
     site reads today; it answers { rating, count } from Google) asks it ONCE per page load. A good answer goes
     through set(). On ANY failure (no address, a refusal, a timeout, an answer without figures) the figures the page
     was built with stay exactly as they are, so nothing moves, and only the stand-in mark comes off: the built-in
     figures are the real ones of the date in _work/partials/reviews.json. In a review build or demo (no PPSite, or
     mode "demo") nothing is asked and nothing changes. */
  window.PurgeProsReviews = {
    set: function (stats) {
      var rating = stats ? Number(stats.rating) : NaN, count = stats ? Math.round(Number(stats.count)) : NaN;
      if (!(rating >= 1 && rating <= 5) || !(count >= 1)) return false;
      var fill = function (text) { return text.replace(/\{rating\}/g, rating.toFixed(1)).replace(/\{count\}/g, String(count)); };
      $$("[data-pp-reviews]").forEach(function (el) { var line = fill(el.getAttribute("data-pp-reviews")); if (el.textContent !== line) el.textContent = line; if (el.hidden) el.hidden = false; });
      $$("[data-pp-reviews-label]").forEach(function (el) { var name = fill(el.getAttribute("data-pp-reviews-label")); if (el.getAttribute("aria-label") !== name) el.setAttribute("aria-label", name); });
      $$("[data-standin]").forEach(function (el) { el.removeAttribute("data-standin"); });
      root.setAttribute("data-reviews", "live");
      return true;
    },
    clear: function () {
      $$("[data-pp-reviews]").forEach(function (el) { var line = el.getAttribute("data-pp-neutral") || ""; el.textContent = line; el.hidden = !line; });
      $$("[data-pp-neutral-label]").forEach(function (el) { el.setAttribute("aria-label", el.getAttribute("data-pp-neutral-label")); });
      $$("[data-standin]").forEach(function (el) { el.removeAttribute("data-standin"); });
      root.setAttribute("data-reviews", "neutral");
      return true;
    }
  };
  (function () {
    var site = window.PPSite && typeof window.PPSite === "object" ? window.PPSite : null;
    if (!site || (site.mode !== "live" && site.mode !== "staging")) return;          /* review build, demo: nothing changes */
    var settled = false;
    var keepBuiltIn = function () {
      if (settled) return; settled = true;
      $$("[data-standin]").forEach(function (el) { el.removeAttribute("data-standin"); });
      root.setAttribute("data-reviews", "built-in");
    };
    var address = typeof site.reviewsEndpoint === "string" ? site.reviewsEndpoint.trim() : "";
    if (!/^https:\/\/[^\/\s?#@]+\/reviews$/.test(address) || typeof window.fetch !== "function" || !$("[data-pp-reviews], [data-pp-reviews-label]")) { keepBuiltIn(); return; }
    var stop = typeof window.AbortController === "function" ? new window.AbortController() : null;
    var timer = window.setTimeout(function () { if (stop) stop.abort(); keepBuiltIn(); }, 8000);
    try {
      window.fetch(address, { method: "GET", mode: "cors", credentials: "omit", signal: stop ? stop.signal : undefined })
        .then(function (answer) { if (!answer.ok) throw new Error("reviews " + answer.status); return answer.json(); })
        .then(function (data) {
          window.clearTimeout(timer);
          if (settled) return;                                                        /* too late: the built-in figures stay */
          if (data && window.PurgeProsReviews.set({ rating: data.rating, count: data.count })) settled = true; else keepBuiltIn();
        })
        .catch(function () { window.clearTimeout(timer); keepBuiltIn(); });
    } catch (error) { window.clearTimeout(timer); keepBuiltIn(); }
  })();

  /* ---- motion: the swash draws itself the first time a heading comes into view ---- */
  var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var swashes = $$(".swash");
  if (!calm && "IntersectionObserver" in window && swashes.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add("is-drawn");
        io.unobserve(en.target);
      });
    }, { threshold: 0.6 });
    swashes.forEach(function (s) { io.observe(s); });
  }

  /* ---- the footer's grass strip: its picture is asked for when the footer comes within about two screens (2026-10-18) ---- */
  $$(".foot__grass").forEach(function (grass) {
    if (!("IntersectionObserver" in window)) { grass.classList.add("is-near"); return; }
    var near = new IntersectionObserver(function (entries) {
      if (!entries.some(function (en) { return en.isIntersecting; })) return;
      grass.classList.add("is-near"); near.disconnect();
    }, { rootMargin: "1600px 0px" });
    near.observe(grass);
  });

  /* ---- in-page links: the page ends where the link points, whatever else moves it on the way ----
     The browser makes its own jump (address, focus, :target). Three things were found to spoil where it ends:
     1. Below 900px a split stacks with its picture first, so a jump to that section landed on the picture and left
        the heading under the fold on a short phone. Such a section is entered at its heading, 16px under the header.
     2. Inside GoHighLevel the site's own code calls window.scrollTo a few milliseconds after ours and sent the page
        back to the picture (staging gate, October 9). So the move is made on the next frame, again 50 ms later, and
        the landing is looked at once more when the page has come to rest.
     3. The page scrolls smoothly, so a jump is a journey of up to a second and a half, aimed at where the target was
        when it began. A script that changes the page's height on the way (js/prices.js folds the phone price board to
        one pack: about 860px) left every target below it that far off the screen: the header's "One-time cleanups"
        link, #one-time, ended about 820px low on a phone. So a page opened at a hash is watched for four seconds:
        when the layout changes the journey is aimed again, and at rest the landing is checked.
     Nothing is watched once the reader moves the page (wheel, touch, a key, a press), and a reload or the Back button,
     where the browser puts the page back where it was, is left alone unless the page stands at the target.
     The header's own few lines note in window.PPEarly whether the reader moved the page before this script arrived
     (GoHighLevel can hold it back for seconds); when they did, nothing here moves it. */
  var jump = { el: null, dest: -1, until: 0, timer: 0, seenY: -1, rest: 0, tries: 0, landed: false, once: false, sizes: null };
  var jumpTarget = function (id) {
    var el = null;
    try { el = id ? doc.getElementById(decodeURIComponent(id)) : null; } catch (error) { el = null; }
    return el && el.closest && el.closest("main") && el.getClientRects().length ? el : null;       /* a part of the page itself, and shown */
  };
  var headingOf = function (el) {                   /* the heading of a section that opens with its picture on this screen, or null */
    if (window.innerWidth >= 900 || el.tagName !== "SECTION") return null;
    var split = $(".split", el), art = split && $(".split__art", split), head = split && $(".split__text .sh", split);
    return art && head && art.getBoundingClientRect().top < head.getBoundingClientRect().top ? head : null;
  };
  var browserDest = function (el) {                 /* where the browser's own jump puts it: the scroll margin under the header (site.css, [id]) */
    return el.getBoundingClientRect().top + window.scrollY - (parseFloat(window.getComputedStyle(el).scrollMarginTop) || 0);
  };
  var jumpDest = function (el) {
    var head = headingOf(el);
    var top = head ? head.getBoundingClientRect().top + window.scrollY - (hdr ? hdr.offsetHeight : 0) - 16 : browserDest(el);
    return Math.max(0, Math.min(top, root.scrollHeight - root.clientHeight));
  };
  var jumpStop = function () {
    jump.el = null;
    if (jump.timer) { window.clearInterval(jump.timer); jump.timer = 0; }
    if (jump.sizes) { jump.sizes.disconnect(); jump.sizes = null; }
  };
  var jumpAim = function (always) {                 /* always: move even when this is where the page was last sent */
    if (!jump.el) return;
    var dest = jumpDest(jump.el), there = Math.abs(window.scrollY - dest) <= 3;
    if (there || (!always && Math.abs(dest - jump.dest) < 1)) { jump.dest = dest; return; }
    jump.dest = dest; jump.landed = false;          /* a new journey */
    window.scrollTo(0, dest);
  };
  var jumpLook = function () {
    if (!jump.el || Date.now() > jump.until) { jumpStop(); return; }
    var y = window.scrollY, still = Math.abs(y - jump.seenY) < 0.5;
    jump.seenY = y;
    jump.rest = still ? jump.rest + 1 : 0;
    if (jump.rest < 2) return;                      /* still travelling */
    if (Math.abs(y - jumpDest(jump.el)) <= 3) { if (jump.once) jumpStop(); else jump.landed = true; return; }   /* at rest in the right place */
    /* at rest somewhere else. After it had landed, that is the reader's doing (a scroll bar gives no event) or another
       script's: it is left alone. A change of layout is not seen here but by the size watch below. */
    if (jump.landed || jump.tries >= 4) { jumpStop(); return; }
    jump.tries += 1; jump.rest = 0;
    jumpAim(true);
  };
  var jumpWatch = function (el, ms, once) {         /* once: stop at the first landing (a pressed link); otherwise keep watching the layout */
    jumpStop();
    jump.el = el; jump.until = Date.now() + ms; jump.seenY = -1; jump.rest = 0; jump.tries = 0; jump.landed = false; jump.once = Boolean(once);
    jump.dest = browserDest(el);                    /* where the browser is taking the page; a change of layout moves it */
    jump.timer = window.setInterval(jumpLook, 100);
    if ("ResizeObserver" in window) { jump.sizes = new window.ResizeObserver(function () { jumpAim(false); }); jump.sizes.observe(doc.body); }
  };
  ["wheel", "touchmove", "keydown", "pointerdown", "mousedown"].forEach(function (name) {
    window.addEventListener(name, function () { if (jump.el) jumpStop(); }, { passive: true, capture: true });
  });
  doc.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null, here = window.location, hash = "";
    /* "#faq", and also "dog-waste-removal.html#one-time" pressed on that page (the header's link): same page, a hash */
    try { if (a && a.hash && a.hash.length > 1 && a.protocol === here.protocol && a.host === here.host && a.pathname === here.pathname && a.search === here.search && !a.target) hash = a.hash; } catch (error) { hash = ""; }
    if (!hash || hash === "#mnav") return;
    window.requestAnimationFrame(function () {
      var el = e.defaultPrevented ? null : jumpTarget(hash.slice(1));      /* a link another script answers (the price builder's) is not a jump */
      if (!el) return;
      jumpWatch(el, 2500, true);
      if (!headingOf(el)) return;                   /* the browser's own jump is the right one: it is only checked at rest */
      jumpAim(true);
      window.setTimeout(function () { if (jump.el === el) jumpAim(true); }, 50);
    });
  });
  if (window.location.hash.length > 1) {
    var early = window.PPEarly, cameLate = doc.readyState === "complete";   /* GoHighLevel adds this script after the page has loaded */
    var nav = window.performance && performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;
    var restored = nav ? nav.type === "reload" || nav.type === "back_forward" : Boolean(window.performance && performance.navigation && performance.navigation.type);
    var movedEarly = function () { return Boolean(early && early.moved); };
    var stands = function (el) { return Math.abs(window.scrollY - browserDest(el)) <= 4 || Math.abs(window.scrollY - jumpDest(el)) <= 4; };
    var sure = !restored && (Boolean(early) || !cameLate);                  /* a fresh arrival, and the reader has not moved the page */
    var arrive = function () {
      var el = jumpTarget(window.location.hash.slice(1));
      if (!el || movedEarly() || (!sure && !stands(el))) return;
      if (jump.el !== el) jumpWatch(el, 4000); else jump.until = Date.now() + 4000;
      jumpAim(true);
    };
    if (cameLate) arrive();
    else {
      var first = sure && !movedEarly() ? jumpTarget(window.location.hash.slice(1)) : null;
      if (first) jumpWatch(first, 15000);           /* from now: a script that runs before the page has loaded changes the layout too */
      window.addEventListener("load", function () { if (first && jump.el !== first) return; arrive(); });   /* the reader moved the page meanwhile: leave it */
    }
  }

  /* ---- text, call and email links: every press is reported to the price engine ----
     This business would rather be texted, so a visitor who presses "Text" or "Call" instead of using the price
     builder has to be counted as well. ONE listener on the document sees every sms:, tel: and mailto: link of the
     page, wherever it is: the header's choice of two, the phone menu, a hero, a section, the closing scene, the
     footer, and the links the price builder itself shows (out of area, "please call", a request that failed).
     It hands the engine two words and nothing else (store.trackUi("contact_click"), CORE-API.md section 6.6):
       method     text, call or email: the link's scheme and nothing after it
       placement  header, menu, hero, section, closing, footer or builder: where the link sits, worked out from the
                  page's own landmarks. A data-placement attribute on the link or around it wins when it holds one of
                  those seven words.
     The number, the address and the link itself are never read, kept or passed on. The engine builds the event,
     counts the same link pressed twice within a second once, and decides what is sent and whether this page may
     send at all; in a review build it only writes to its own log (store.trackLog). Nothing here calls a tag.
     The press is never touched: no preventDefault, nothing awaited, and an error in here cannot reach the link.

     Where the engine comes from. On a page with the price builder it is the builder's own store (PPBuilder.store),
     so the page keeps ONE store with the page's own options: this script never creates the store while builder.js
     is still to start. On a page that loads the engine without the builder it is PPQuoteCore.shared(), created with
     the page's send switch (window.PPSite, read through the engine's siteOptions: live, staging or demo). A page that
     loads neither (the welcome page for existing customers) gets the engine from here, after the page has loaded and
     without holding anything back: the address is data-core on this script's tag when the page gives one, otherwise
     shared/pp-quote-core.js beside the assets folder (data-assets on this tag, as builder.js reads it; "../../assets/"
     in a review build). A press made before the engine is there waits in memory for a few seconds and is reported
     the moment it arrives; if it never arrives the press is simply not counted. */
  var CONTACT_METHODS = { "sms:": "text", "tel:": "call", "mailto:": "email" };
  var CONTACT_PLACES = ["header", "menu", "hero", "section", "closing", "footer", "builder"];
  /* the production Worker's two addresses: the same list as LIVE_ENDPOINTS in js/builder.js, and it must stay the same */
  var CONTACT_LIVE_ENDPOINTS = ["https://purge-lead-relay.purgepros.workers.dev/submit", "https://quote.itspurgepros.com/submit"];
  var contactPlace = function (link) {
    var named = link.closest("[data-placement]"), place = named ? named.getAttribute("data-placement") : "";
    if (CONTACT_PLACES.indexOf(place) > -1) return place;
    if (link.closest("[data-pp-builder], .ppb, .ppb-sheet, .ppb-pop, .ppb-bar")) return "builder";
    if (link.closest("#mnav")) return "menu";
    if (link.closest("[data-hdr]")) return "header";
    if (link.closest(".foot__scene")) return "closing";      /* the closing scene opens the footer: it is counted on its own */
    if (link.closest("#site-footer, body > footer")) return "footer";
    if (link.closest(".cover")) return "hero";
    return "section";
  };
  var builderToCome = function () { return !window.PPBuilder && Boolean(doc.querySelector('script[src*="builder."]')); };
  var contactStore = function (waited) {
    var builder = window.PPBuilder, core = window.PPQuoteCore;
    if (builder && builder.store && typeof builder.store.trackUi === "function") return builder.store;
    if (!core || typeof core.shared !== "function") return null;
    if (!waited && builderToCome()) return null;             /* builder.js creates the page's store, with the page's options */
    /* This page has no builder (the welcome page), or its builder never came: the store is created here, with the
       same send switch the builder uses (window.PPSite through the engine's own siteOptions), so a press on the live
       site is counted and not only logged. With no PPSite, or mode "demo", this is shared() exactly as before. A store
       made here never sends a request: it only decides whether the tags may be called. */
    var store = core.shared(typeof core.siteOptions === "function" ? core.siteOptions(window.PPSite, { liveEndpoints: CONTACT_LIVE_ENDPOINTS }) : undefined);
    return store && typeof store.trackUi === "function" ? store : null;
  };
  var contactWaiting = [], contactTimer = 0, contactTicks = 0;
  var contactFlush = function (waited) {
    var store = null;
    try { store = contactStore(waited); } catch (error) { store = null; }
    if (!store) return false;
    contactWaiting.splice(0).forEach(function (press) { try { store.trackUi("contact_click", press); } catch (error) { /* a count never gets in the way */ } });
    return true;
  };
  var contactWait = function () {
    if (contactTimer) return;
    contactTicks = 0;
    contactTimer = window.setInterval(function () {
      contactTicks += 1;
      var last = contactTicks >= 24;                         /* about six seconds, counted in ticks: a phone that left for its Messages app picks up where it was */
      if (!contactFlush(last) && !last) return;
      window.clearInterval(contactTimer); contactTimer = 0;
      contactWaiting.length = 0;                             /* the engine never came: these presses are not counted */
    }, 250);
  };
  doc.addEventListener("click", function (e) {
    try {
      var link = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      var method = link ? CONTACT_METHODS[String(link.protocol || "").toLowerCase()] : "";
      if (!method) return;
      contactWaiting.push({ method: method, placement: contactPlace(link) });
      if (!contactFlush(false)) contactWait();
    } catch (error) { /* the link opens whatever happens here */ }
  }, true);
  /* a page that loaded no engine (see above): fetch it once the page itself is done */
  if (!window.PPQuoteCore) {
    var fetchCore = function () {
      if (window.PPQuoteCore || doc.querySelector("script[data-pp-core]")) return;
      var base = (me && me.getAttribute("data-assets")) || "../../assets/";
      var tag = doc.createElement("script");
      tag.src = (me && me.getAttribute("data-core")) || base + "../shared/pp-quote-core.js";
      tag.async = true;
      tag.setAttribute("data-pp-core", "");
      tag.onload = function () { contactFlush(false); };
      doc.body.appendChild(tag);
    };
    var whenIdle = function () { if (window.requestIdleCallback) window.requestIdleCallback(fetchCore, { timeout: 2000 }); else window.setTimeout(fetchCore, 200); };
    if (doc.readyState === "complete") whenIdle(); else window.addEventListener("load", whenIdle);
  }

  /* ---- small things ---- */
  $$("[data-year]").forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
})();
