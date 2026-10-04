(function () {
  "use strict";
  var root = document.querySelector("[data-pbr2-library]");
  if (!root) return;
  var input = document.querySelector("[data-pbr2-search]");
  var buttons = Array.prototype.slice.call(root.querySelectorAll("[data-pbr2-filter]"));
  var cards = Array.prototype.slice.call(root.querySelectorAll("[data-pbr2-card]"));
  var empty = root.querySelector("[data-pbr2-empty]");
  var active = "all";
  function apply() {
    var query = input ? input.value.trim().toLowerCase() : "";
    var shown = 0;
    cards.forEach(function (card) {
      var categoryMatch = active === "all" || card.dataset.category === active;
      var textMatch = !query || (card.dataset.search || "").indexOf(query) !== -1;
      card.hidden = !(categoryMatch && textMatch);
      if (!card.hidden) shown += 1;
    });
    if (empty) empty.hidden = shown !== 0;
  }
  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      active = button.dataset.pbr2Filter;
      buttons.forEach(function (item) { item.setAttribute("aria-pressed", String(item === button)); });
      apply();
    });
  });
  if (input) input.addEventListener("input", apply);
})();
