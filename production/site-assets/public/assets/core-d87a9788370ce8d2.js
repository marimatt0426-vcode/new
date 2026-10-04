(function () {
  "use strict";

  function each(nodes, callback) {
    Array.prototype.forEach.call(nodes, callback);
  }

  function initFaqSearch(root) {
    var input = root.querySelector("#pp-faq-search");
    if (!input) return;
    var items = root.querySelectorAll(".pp-faq-item");
    var groups = root.querySelectorAll("[data-pp-group]");
    var clear = root.querySelector("[data-pp-clear]");
    var results = root.querySelector("[data-pp-results]");
    var empty = root.querySelector("[data-pp-empty]");

    function filter() {
      var query = input.value.trim().toLocaleLowerCase();
      var visible = 0;
      each(items, function (item) {
        var haystack = (item.getAttribute("data-search-text") || item.textContent || "").toLocaleLowerCase();
        var match = !query || haystack.indexOf(query) >= 0;
        item.hidden = !match;
        if (match) visible += 1;
      });
      each(groups, function (group) {
        group.hidden = !group.querySelector(".pp-faq-item:not([hidden])");
      });
      if (clear) clear.hidden = !query;
      if (empty) empty.hidden = visible !== 0;
      if (results) results.textContent = query ? visible + (visible === 1 ? " answer" : " answers") + " found" : "";
    }

    input.addEventListener("input", filter);
    if (clear) {
      clear.addEventListener("click", function () {
        input.value = "";
        filter();
        input.focus();
      });
    }
  }

  function init() {
    each(document.querySelectorAll(".pp-next.pp-core-page"), initFaqSearch);
    each(document.querySelectorAll(".pp-next [data-pp-print]"), function (button) {
      button.addEventListener("click", function () { window.print(); });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
