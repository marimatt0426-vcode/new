/* Purge Pros, Cover Story: Yard Guide (family "guide"). Two parts.

   A. THE NATIVE POST'S STYLESHEET (review page only). A Yard Guide article is a native GoHighLevel post, dressed by
      css/blog-native.css and by nothing else. On the blog that stylesheet is a <link> in the header code of the
      blog-post template. The review builder puts only family stylesheets in a page's head, so here this file adds
      the same <link>: each .guide-native frame names its stylesheet in data-guide-css. When the stylesheet has
      arrived (or cannot be had) the frame gets .guide-native--styled, which is when family-guide.css shows it.
      This part is NOT needed on the blog.

   B. THE LIBRARY. The topic filter is CSS (radio buttons read with :has()); it works with this file switched off, and so does a
   link to a topic (yard-guide.html#service-guides), which the stylesheet reads with :target while no radio is
   checked. This file adds three things to each .guide-lib on a page:
   1. Search. The search box is written hidden; here it is shown and wired. While a search is on, the library
      carries .guide-lib--search, cards that do not match (title, description, category; within the chosen
      topic) get the hidden attribute, and the mascot-free count line gives the number of matches.
      The last row follows the same rule as the topic views: the closing card is one column beside a row of
      cards, or a band under full rows, never a wide slab beside one or two cards. So where the matches would
      leave one card over (or two at four columns), that many matches are drawn large at the top instead:
      the first on its side across the row (data-lead="q1"), or two side by side (q1, q2). data-q3 and data-q4
      on the library say how many are large at three and at four columns; --guide-v2/3/4 are the closing card's span.
   2. The address. yard-guide.html#service-guides opens with that topic chosen (the category link on an
      article), and the address follows the chip a visitor picks.
   3. A checked radio. The page is written with none checked so that the stylesheet can read the address;
      once the address has been read here, "All articles" is checked if nothing else is. */
(function () {
  "use strict";
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };

  // ---- A. the native post's stylesheet ---------------------------------------------------------------------
  (function () {
    var frames = document.querySelectorAll(".guide-native[data-guide-css]");
    var wanted = {};
    var done = function (href) { each(frames, function (frame) { if (frame.getAttribute("data-guide-css") === href) frame.classList.add("guide-native--styled"); }); };
    each(frames, function (frame) { wanted[frame.getAttribute("data-guide-css")] = true; });
    Object.keys(wanted).forEach(function (href) {
      if (!/^css\/[a-z0-9-]+\.css$/.test(href)) { done(href); return; }
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.setAttribute("data-guide-native", "");
      link.onload = function () { done(href); };
      link.onerror = function () { done(href); };
      document.head.appendChild(link);
    });
  })();

  // ---- B. the library ------------------------------------------------------------------------------------------
  each(document.querySelectorAll(".guide-lib"), function (lib) {
    var cards = Array.prototype.slice.call(lib.querySelectorAll(".guide-card"));
    var chips = Array.prototype.slice.call(lib.querySelectorAll(".guide-chip"));
    var box = lib.querySelector(".guide-search");
    var input = box ? box.querySelector("input") : null;
    var says = lib.querySelector(".guide-says > span");
    var apply = null;

    // ---- 1. search ----------------------------------------------------------------------------------------
    if (input && says && cards.length) {
      var line = document.createElement("span");
      line.className = "guide-says__line guide-says__line--q";
      line.setAttribute("aria-live", "polite");
      says.appendChild(line);
      each(cards, function (card) {   // what a search reads: the title, the description and the category (not "Read the guide")
        var text = "";
        each(card.querySelectorAll(".guide-card__title, .guide-card__text, .guide-ribbon"), function (part) { text += " " + part.textContent; });
        card.guideText = text.replace(/\s+/g, " ").toLowerCase();
      });

      var topic = function () {
        var on = lib.querySelector(".guide-filter input:checked");
        if (!on || on.value === "all") return null;
        var name = on.parentNode.querySelector("span");
        return { value: on.value, name: name ? name.textContent : "" };
      };
      // how many matches are large at this many columns, so the last row holds 0 or (columns - 1) cards
      var large = function (n, cols) { var r = n % cols; return cols === 2 || r === 0 || r === cols - 1 ? 0 : r; };
      var leave = function () {
        if (!lib.classList.contains("guide-lib--search")) return;
        each(cards, function (card) {
          card.hidden = false;
          card.removeAttribute("data-lead");
          if (card.hasAttribute("data-lead-was")) { card.setAttribute("data-lead", card.getAttribute("data-lead-was")); card.removeAttribute("data-lead-was"); }
        });
        lib.classList.remove("guide-lib--search");
        lib.removeAttribute("data-q3");
        lib.removeAttribute("data-q4");
        [2, 3, 4].forEach(function (cols) { lib.style.removeProperty("--guide-v" + cols); });
        line.textContent = "";
      };
      apply = function () {
        var typed = input.value.replace(/\s+/g, " ").trim(), q = typed.toLowerCase();
        if (!q) { leave(); return; }
        var t = topic(), n = 0;
        var first = !lib.classList.contains("guide-lib--search");
        each(cards, function (card) {
          if (first && card.hasAttribute("data-lead")) card.setAttribute("data-lead-was", card.getAttribute("data-lead"));
          card.removeAttribute("data-lead");
          var ok = card.guideText.indexOf(q) >= 0 && (!t || card.getAttribute("data-topic") === t.value);
          card.hidden = !ok;
          if (ok) { n += 1; if (n <= 2) card.setAttribute("data-lead", "q" + n); }
        });
        lib.classList.add("guide-lib--search");
        lib.setAttribute("data-q3", String(large(n, 3)));
        lib.setAttribute("data-q4", String(large(n, 4)));
        [2, 3, 4].forEach(function (cols) { var r = (n - large(n, cols)) % cols; lib.style.setProperty("--guide-v" + cols, String(r === 0 ? cols : cols - r)); });
        line.textContent = "";
        if (!n) { line.textContent = "No guides match that search yet. Try a shorter phrase or choose all articles."; return; }
        var b = document.createElement("b");
        b.textContent = n + (n === 1 ? " guide" : " guides");
        line.appendChild(b);
        line.appendChild(document.createTextNode(" for “" + typed + "”" + (t ? " in " + t.name : "") + "."));
      };
      input.addEventListener("input", apply);
      input.addEventListener("search", apply);
      lib.addEventListener("change", function (e) { if (e.target && e.target.type === "radio") apply(); });
      box.hidden = false;
    }

    // ---- 2. the address ----------------------------------------------------------------------------------
    var named = chips.filter(function (chip) { return chip.id; });
    var fromAddress = function () {
      var id = "";
      try { id = decodeURIComponent((location.hash || "").slice(1)); } catch (_) { return; }
      if (!id) return;
      named.forEach(function (chip) {
        if (chip.id !== id) return;
        var radio = chip.querySelector("input");
        if (radio && !radio.checked) { radio.checked = true; radio.dispatchEvent(new Event("change", { bubbles: true })); }
      });
    };
    if (named.length) {
      lib.addEventListener("change", function (e) {
        var chip = e.target && e.target.closest ? e.target.closest(".guide-chip[id]") : null;
        if (!chip || !window.history || !history.replaceState) return;
        try { history.replaceState(null, "", chip === named[0] ? location.pathname + location.search : "#" + chip.id); } catch (_) { /* file pages in some browsers */ }
      });
      fromAddress();
      window.addEventListener("hashchange", fromAddress);
    }

    // ---- 3. a checked radio ------------------------------------------------------------------------------
    var radios = lib.querySelectorAll(".guide-filter input[type=radio]");
    if (radios.length && !lib.querySelector(".guide-filter input:checked")) radios[0].checked = true;

    if (apply && input.value) apply();   // a value the browser kept across a reload
  });
})();
