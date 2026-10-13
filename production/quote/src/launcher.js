/*! Purge Pros quote launcher. The quote builder lives on the quote page. This small
 *  script keeps older pages working: their quote buttons and links send the visitor there. */
(function () {
  "use strict";
  if (window.PurgeProsQuote) return;
  var QUOTE_PAGE = "";
  var KEEP = /^(utm_|gclid$|gbraid$|wbraid$|fbclid$)/;
  var STORE = "pp_launcher_arrival_query";
  var target;
  try { target = new URL(QUOTE_PAGE); } catch (_) { return; }
  var here = new URL(location.href);
  function path(url) { return url.origin + url.pathname.replace(/\/+$/, ""); }
  // On the quote page itself the page's own builder handles every launcher.
  if (path(target) === path(here)) return;

  // Only the campaign and click-id values of an address; nothing else is ever remembered.
  function sourceOnly(params) {
    var out = new URLSearchParams();
    params.forEach(function (value, key) { if (KEEP.test(key)) out.append(key, value); });
    return out;
  }
  function hasSource(params) { return sourceOnly(params).toString() !== ""; }
  // Remember how the visitor arrived, for this tab only, so the ad or campaign
  // source still reaches the quote page after they browse to another page.
  try {
    if (hasSource(here.searchParams)) sessionStorage.setItem(STORE, "?" + sourceOnly(here.searchParams));
  } catch (_) {}

  function quoteAddress(options) {
    var next = new URL(target.href);
    var current = new URL(location.href).searchParams;
    var kept = "";
    try { kept = sessionStorage.getItem(STORE) || ""; } catch (_) {}
    var source = hasSource(current) || !kept ? current : sourceOnly(new URLSearchParams(kept));
    source.forEach(function (value, key) {
      if (key !== "open_quote" && key !== "zip") next.searchParams.append(key, value);
    });
    var zip = String((options && options.zip) || current.get("zip") || "");
    if (/^\d{5}$/.test(zip)) next.searchParams.set("zip", zip);
    next.searchParams.set("open_quote", "1");
    return next.href;
  }
  function open(options) { location.assign(quoteAddress(options)); }

  document.addEventListener("click", function (event) {
    var trigger = event.target && event.target.closest &&
      event.target.closest('[data-purge-quote], a[href="#quote"], a[href="#get-quote"]');
    if (!trigger || event.defaultPrevented) return;
    event.preventDefault();
    open();
  });
  window.PurgeProsQuote = { open: open, close: function () {}, config: {} };

  var asked = String(here.searchParams.get("open_quote") || "").trim().toLowerCase();
  var hash = String(here.hash || "").toLowerCase();
  if (asked === "1" || asked === "true" || asked === "yes" || hash === "#quote" || hash === "#get-quote") {
    location.replace(quoteAddress());
  }
})();
