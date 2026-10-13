/* Purge Pros — "Cover Story" direction. prices.js
   The price board's dog picker (dog-waste-removal.html, kit.html).
   Every price is real text in the page; this only chooses which row is lit (desktop)
   or shown (phone). Without it the board lists every row. Nothing here computes a price,
   and nothing here stores or sends anything. */
(function () {
  "use strict";
  var doc = document;
  var boards = Array.prototype.slice.call(doc.querySelectorAll("[data-pboard]"));
  if (!boards.length) return;

  /* The visitor's own dog count, if the price builder already has one. The engine keeps the plan answers
     under the key "dogCount": in the running builder (PPBuilder.store) and, between page loads, in this
     tab's sessionStorage. Read only; "10" (ten or more, a custom quote) is not a row on the board. */
  var fromBuilder = function () {
    var dogs = 0;
    try {
      var b = window.PPBuilder, state = b && b.store && typeof b.store.getState === "function" ? b.store.getState() : null;
      if (state && state.dogCount) dogs = Number(state.dogCount);
      if (!dogs) {
        var core = window.PPQuoteCore, key = (core && core.STORAGE_KEYS && core.STORAGE_KEYS.progress) || "pp_quote_progress_v3";
        var saved = JSON.parse(window.sessionStorage.getItem(key) || "null");
        if (saved && saved.dogCount) dogs = Number(saved.dogCount);
      }
    } catch (err) { dogs = 0; }
    return dogs >= 1 && dogs <= 9 ? dogs : 0;
  };

  boards.forEach(function (board) {
    var picks = Array.prototype.slice.call(board.querySelectorAll("[data-pick]"));
    var rows = Array.prototype.slice.call(board.querySelectorAll(".prow[data-min]"));
    if (!picks.length || !rows.length) return;
    var byHand = false;

    var pick = function (count, chosen) {
      board.setAttribute("data-picked", String(count));
      if (chosen) board.classList.add("is-chosen");
      picks.forEach(function (btn) {
        var on = Number(btn.getAttribute("data-pick")) === count;
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        if (btn.parentNode) btn.parentNode.classList.toggle("is-yours", on);
      });
      rows.forEach(function (row) {
        var min = Number(row.getAttribute("data-min")), max = Number(row.getAttribute("data-max"));
        row.classList.toggle("is-yours", count >= min && count <= max);
      });
    };

    picks.forEach(function (btn) {
      btn.addEventListener("click", function () { byHand = true; pick(Number(btn.getAttribute("data-pick")), true); });
    });

    /* Start on the visitor's own answer when the builder already has one, otherwise on one dog.
       The builder starts after this file, and the visitor may answer it before reaching the board, so the
       answer is read again when the page has loaded and each time the board comes into view. A pack picked
       by hand on the board is never overridden. */
    var follow = function () {
      if (byHand) return;
      var d = fromBuilder();
      if (d && String(d) !== board.getAttribute("data-picked")) pick(d, true);
    };
    var start = fromBuilder();
    pick(start || 1, Boolean(start));
    if (doc.readyState === "complete") follow(); else window.addEventListener("load", follow);   /* this script may arrive after the page has loaded */
    window.addEventListener("pageshow", follow);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) follow(); });
      }).observe(board);
    }
  });
})();
