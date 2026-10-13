/* Purge Pros — "Cover Story" direction. family-company.js
   Every company page with an accordion: about.html, faq.html and welcome.html. One answer is open at a time (on the
   FAQ page across all four groups: every details there shares one name). When the answer that closes is above the
   question just tapped, the page gets shorter above the reader's finger. Browsers with scroll anchoring hold the
   tapped question still; Safari does not, and the question jumps up, under the header or off the screen. This keeps
   it exactly where it was. A page with no accordion (reviews.html) does not load this file.
   It moves the scroll position only: it opens and closes nothing, and it stores and sends nothing. */
(function () {
  "use strict";
  var doc = document;
  if (!doc.querySelector(".faq__item")) return;

  doc.addEventListener("click", function (e) {
    var q = e.target && e.target.closest ? e.target.closest("summary.faq__q") : null;
    if (!q) return;
    var before = q.getBoundingClientRect().top;

    var settle = function () {
      var moved = q.getBoundingClientRect().top - before;
      if (Math.abs(moved) < 2) return;
      var root = doc.documentElement, was = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";          /* the page scrolls smoothly; this correction must not be seen */
      window.scrollBy(0, moved);
      root.style.scrollBehavior = was;
    };

    /* once after the browser has closed the other answer, and once more after the site script has had its turn */
    window.requestAnimationFrame(function () { settle(); window.setTimeout(settle, 80); });
  });
})();
