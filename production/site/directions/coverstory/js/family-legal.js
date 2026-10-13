/* family-legal.js : the legal pages (terms-conditions, privacy-policy).
   Five small things, and the pages work without any of them (the list is a plain card of links and the page
   prints from the browser menu):
     0. No line of a clause heading or of the list of sections starts with "&": the space before it becomes a
        no-break space in the page. The file keeps the live characters, so the text checks compare like with like.
     1. "Print this page" (the button is in the page with the hidden attribute until this script can run it).
     2. The link of the clause being read is marked in the "On this page" list (aria-current).
     3. Under 900px the list becomes a slim bar pinned under the header: it names the clause being read and
        opens the list; choosing a clause closes it again. The open list (and, on a desktop, the pinned card)
        ends on a whole row and stays clear of the pinned price bar.
     4. A page opened straight at a clause (#payments) is put back on that clause once the web fonts are in.
   No dependencies. Styles: css/family-legal.css (L2). */
(function () {
  "use strict";
  /* Where the pictures are: this script's own data-assets (the GoHighLevel loader sets it on every script), then
     window.PPSite.assets, then the review build's relative folder. Read once, while the script is running. */
  var me = document.currentScript, SITE = window.PPSite && typeof window.PPSite === "object" ? window.PPSite : null;
  var ASSETS = (me && me.getAttribute("data-assets")) || (SITE && typeof SITE.assets === "string" && SITE.assets) || "../../assets/";
  if (ASSETS.slice(-1) !== "/") ASSETS += "/";
  var doc = document.querySelector(".legal-doc");
  var toc = document.querySelector("[data-legal-toc]");
  var printBtn = document.querySelector("[data-legal-print]");

  // 0. spacing only, never wording: bind each "&" to the word before it
  Array.prototype.forEach.call(document.querySelectorAll(".legal-clause__title, .legal-toc__list a"), function (el) {
    Array.prototype.forEach.call(el.childNodes, function (n) {
      if (n.nodeType === 3 && n.nodeValue.indexOf(" &") >= 0) n.nodeValue = n.nodeValue.split(" &").join(String.fromCharCode(160) + "&");
    });
  });

  // 1. print
  if (printBtn && typeof window.print === "function") {
    printBtn.hidden = false;
    printBtn.addEventListener("click", function () { window.print(); });
  }
  if (!doc || !toc) return;

  var body = toc.querySelector(".legal-toc__body");
  var label = toc.querySelector(".legal-toc__label");
  var list = toc.querySelector(".legal-toc__list");
  var links = Array.prototype.slice.call(toc.querySelectorAll('.legal-toc__list a[href^="#"]'));
  var clauses = links.map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); });
  if (!body || !list || !links.length || clauses.some(function (c) { return !c; })) return;
  var rows = links.map(function (a) { return a.parentNode; });
  // the words of an element on one line; a no-break space (the one before "&" in a heading) is kept as it is
  function words(el) { return el.textContent.replace(/[ \t\r\n]+/g, " ").replace(/^ | $/g, ""); }

  // 3. the pinned bar (built here, so a page without the script has no dead button)
  var labelText = label ? words(label) : "On this page";
  var count = links.length + " sections";
  var bar = document.createElement("button");
  bar.type = "button";
  bar.className = "legal-toc__bar";
  bar.setAttribute("aria-expanded", "false");
  if (!body.id) body.id = "legal-toc-body";
  bar.setAttribute("aria-controls", body.id);
  var ico = label && label.querySelector("img");
  bar.innerHTML = '<img class="legal-toc__bar-ico stk stk--thin" width="34" height="34" alt="">' +
    '<span class="legal-toc__bar-text"><span class="legal-toc__bar-label"></span><span class="legal-toc__bar-now"></span></span>' +
    '<img class="legal-toc__bar-chev" width="22" height="22" alt="">';
  bar.querySelector(".legal-toc__bar-ico").setAttribute("src", ico ? ico.getAttribute("src") : ASSETS + "brand-icons/pp-search.webp");
  bar.querySelector(".legal-toc__bar-chev").setAttribute("src", ASSETS + "brand-icons/pp-chevron.webp");
  bar.querySelector(".legal-toc__bar-label").textContent = labelText;
  var barIco = bar.querySelector(".legal-toc__bar-ico"), restIco = barIco.getAttribute("src");
  var now = bar.querySelector(".legal-toc__bar-now");
  now.textContent = count;
  toc.insertBefore(bar, body);
  toc.classList.add("legal-toc--js");
  doc.classList.add("legal-doc--js");

  var phone = window.matchMedia("(max-width: 899.98px)");
  function isOpen() { return bar.getAttribute("aria-expanded") === "true"; }

  // How tall a scrolling list may be so that it ends on a whole row: the last row that fits in `room` (measured from
  // the top edge of `box`, the element that scrolls), plus `foot` px under it. The whole list if it all fits.
  function wholeRows(box, room, foot) {
    var top = box.getBoundingClientRect().top - box.scrollTop, best = 0, end = 0, i;
    for (i = 0; i < rows.length; i += 1) {
      end = rows[i].getBoundingClientRect().bottom - top + foot;
      if (end <= room + 0.5) best = end; else break;
    }
    return Math.ceil(best || Math.min(room, end));
  }

  // Phones. The open list never runs past the screen, nor under the pinned price bar once a price is in progress,
  // and it ends on a whole row; it scrolls inside. It is measured when it opens and again whenever the page moves.
  // If the bar is too low for the whole list when it opens, the page moves up by what is missing, as far as the
  // place where the bar pins; the list grows as the bar rises.
  function fit(nudge) {
    var top = bar.getBoundingClientRect().bottom + 8;                     // where the list starts (L2: top: 100% + 8px)
    var floor = window.innerHeight - 12;
    var price = document.querySelector(".ppb-bar.is-on");
    if (price) { var pr = price.getBoundingClientRect(); if (pr.height > 0 && pr.top > top && pr.top - 10 < floor) floor = pr.top - 10; }
    var room = floor - top;
    if (nudge) {
      var whole = rows[rows.length - 1].getBoundingClientRect().bottom - body.getBoundingClientRect().top + body.scrollTop + 8;
      var rise = bar.getBoundingClientRect().top - (parseFloat(window.getComputedStyle(toc).top) || 0);   // how far the bar is from its pinned place
      if (room < whole && rise > 1) window.scrollBy(0, Math.min(whole - room, rise));           // the scroll calls fit() again
    }
    room = Math.max(room, 180);
    body.style.maxHeight = wholeRows(body, room, 8) + "px";
  }
  // From 900px. In a window too short for the whole list (it scrolls inside the card), end it on a whole row. And
  // where the pinned price bar reaches under the card (a 1024px window with a price in progress), the card stops
  // 8px above it.
  var priceSeen = "";
  function priceBox() {
    var p = document.querySelector(".ppb-bar.is-on"), r = p ? p.getBoundingClientRect() : null;
    return r && r.height > 0 ? r : null;
  }
  function trim() {
    list.style.maxHeight = "";
    if (phone.matches) return;
    var room = list.clientHeight, card = toc.getBoundingClientRect(), price = priceBox();
    if (price && price.left < card.right && price.right > card.left) {
      var pinnedBottom = (parseFloat(window.getComputedStyle(toc).top) || 0) + card.height;
      if (pinnedBottom > price.top - 8) room -= pinnedBottom - (price.top - 8);
    }
    if (list.scrollHeight > room + 1) list.style.maxHeight = wholeRows(list, Math.max(room, 120), 0) + "px";
  }
  function setOpen(open) {
    bar.setAttribute("aria-expanded", open ? "true" : "false");
    body.hidden = phone.matches ? !open : false;
    if (open && phone.matches) fit(true); else body.style.maxHeight = "";
  }
  function sync() { setOpen(false); trim(); }
  bar.addEventListener("click", function () { setOpen(!isOpen()); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && phone.matches && isOpen()) { setOpen(false); bar.focus(); } });
  document.addEventListener("click", function (e) { if (phone.matches && isOpen() && !toc.contains(e.target)) setOpen(false); });
  if (phone.addEventListener) phone.addEventListener("change", sync); else if (phone.addListener) phone.addListener(sync);
  sync();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(trim);

  // 2. the clause being read
  // Phones: the clause under the pinned bar. Larger screens: the clause whose heading has reached the middle of the
  // window. A clause that was jumped to (from the list, a summary card or a #link) stays marked while the page
  // rests where the jump left it, even when it is so short that the next heading is already above the middle.
  var current = -1, ticking = false, held = -1, heldAt = null, rest = 0;
  function hold(i) { held = i; heldAt = null; window.clearTimeout(rest); rest = window.setTimeout(landed, 160); }
  function landed() { if (held >= 0 && heldAt === null) heldAt = window.pageYOffset; }
  function indexOfHash(hash) {
    var id = (hash || "").replace(/^#/, ""), i;
    if (id) for (i = 0; i < clauses.length; i += 1) if (clauses[i].id === id) return i;
    return -1;
  }
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var i = indexOfHash(a.getAttribute("href"));
    if (i < 0) return;
    hold(i);
    if (phone.matches && toc.contains(a)) setOpen(false);
  });
  window.addEventListener("hashchange", function () { var i = indexOfHash(window.location.hash); if (i >= 0) { hold(i); onScroll(); } });

  function mark() {
    ticking = false;
    var small = phone.matches;
    if (small && isOpen()) fit(false);
    if (!small) { var p = priceBox(), key = p ? Math.round(p.left) + " " + Math.round(p.top) + " " + Math.round(p.right) : ""; if (key !== priceSeen) { priceSeen = key; trim(); } }
    var line = small ? 200 : Math.max(220, window.innerHeight * 0.5);
    var found = -1;
    for (var i = 0; i < clauses.length; i += 1) { if (clauses[i].getBoundingClientRect().top <= line) found = i; else break; }
    if (held >= 0) {
      if (heldAt !== null && Math.abs(window.pageYOffset - heldAt) > 60) held = -1;       // the reader has moved on
      else found = held;
    }
    if (found >= 0 && doc.getBoundingClientRect().bottom < (small ? 200 : 220)) found = -1;   // the reader has left the document
    if (found === current) return;
    if (current >= 0) links[current].removeAttribute("aria-current");
    current = found;
    if (current >= 0) {
      links[current].setAttribute("aria-current", "true");
      var n = String(current + 1); if (n.length < 2) n = "0" + n;
      now.textContent = n + " " + words(links[current]);
      bar.classList.add("legal-toc__bar--reading");
      var own = clauses[current].querySelector(".legal-clause__ico img");      // the bar wears the icon of the clause being read
      barIco.setAttribute("src", own ? own.getAttribute("src") : restIco);
      if (!small && list.scrollHeight > list.clientHeight + 2) {                 // a short window: keep the marked link in view inside the list
        var ar = rows[current].getBoundingClientRect(), lr = list.getBoundingClientRect();
        if (ar.top < lr.top + 4) list.scrollTop += ar.top - lr.top - 4; else if (ar.bottom > lr.bottom) list.scrollTop += ar.bottom - lr.bottom;
      }
    } else { now.textContent = count; bar.classList.remove("legal-toc__bar--reading"); barIco.setAttribute("src", restIco); }
  }
  function onScroll() {
    if (held >= 0 && heldAt === null) { window.clearTimeout(rest); rest = window.setTimeout(landed, 160); }   // still travelling to the clause
    if (!ticking) { ticking = true; window.requestAnimationFrame(mark); }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", function () { trim(); onScroll(); });
  // A page opened straight at a clause (#payments from the price builder, say): the browser picks the place to
  // scroll to before the web fonts have set the text, and the lines above then reflow, which leaves the heading
  // 80 to 100px low. Once the fonts are in (and again when the page has loaded) the clause is put back in its place,
  // unless the reader has already taken hold of the page.
  var first = indexOfHash(window.location.hash), touched = false;
  function settle() {
    if (touched || first < 0 || held !== first) return;
    var c = clauses[first], want = parseFloat(window.getComputedStyle(c).scrollMarginTop) || 0;
    if (Math.abs(c.getBoundingClientRect().top - want) < 3) return;
    try { c.scrollIntoView({ block: "start", behavior: "instant" }); } catch (e) { c.scrollIntoView(true); }
    heldAt = null; window.clearTimeout(rest); rest = window.setTimeout(landed, 160);
  }
  if (first >= 0) {
    hold(first);
    ["wheel", "touchstart", "keydown", "mousedown"].forEach(function (type) { window.addEventListener(type, function () { touched = true; }, { passive: true, once: true }); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { window.requestAnimationFrame(settle); });
    var afterLoad = function () { window.setTimeout(settle, 60); };
    if (document.readyState === "complete") afterLoad(); else window.addEventListener("load", afterLoad);   /* this script may arrive after the page has loaded */
  }
  mark();
})();
