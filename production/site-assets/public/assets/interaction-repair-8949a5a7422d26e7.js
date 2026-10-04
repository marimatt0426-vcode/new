/* Purge Pros shared interaction repair, 2026-09-23.
   Scope single-open behavior to actual FAQ collections. */
(function () {
  "use strict";
  if (window.__ppNavigationRepair20260923) return;
  window.__ppNavigationRepair20260923 = true;

  var FAQ_SELECTOR = [
    ".pp-next details.pp-faq",
    ".pp-next details.ppw-faq",
    ".pp-next .pp-r2-city-faq details",
    ".pp-next .pp-yt-faq details.pp-r2-disclosure"
  ].join(",");
  var faqSetNumber = 0;

  function isFaq(item) {
    return item && item.nodeType === 1 && item.matches(FAQ_SELECTOR);
  }

  function faqRoot(item) {
    return item.closest(".pp-next") || item.closest(".pp-faq-list, .ppw-faq-wrap, .pp-r2-city-faq-list, .pp-r2-faq-stack");
  }

  function prepareFaq(item) {
    if (!isFaq(item)) return;
    var root = faqRoot(item);
    if (!root) return;
    if (!root.dataset.ppFaqSet) {
      faqSetNumber += 1;
      root.dataset.ppFaqSet = "purge-pros-faq-" + faqSetNumber;
    }
    if (item.name !== root.dataset.ppFaqSet) item.name = root.dataset.ppFaqSet;
  }

  function scanFaq(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.matches("details")) prepareFaq(node);
    var details = node.querySelectorAll("details");
    Array.prototype.forEach.call(details, prepareFaq);
  }

  function onFaqToggle(event) {
    var item = event.target;
    if (!isFaq(item) || !item.open) return;
    prepareFaq(item);
    var groupName = item.name;
    if (!groupName) return;
    Array.prototype.forEach.call(document.querySelectorAll("details[name]"), function (other) {
      if (other !== item && other.name === groupName && other.open) other.open = false;
    });
  }

  function measureHeader(header) {
    var height = Math.ceil(header.getBoundingClientRect().height);
    if (height > 0) document.documentElement.style.setProperty("--pp-fixed-header-height", height + "px");
  }

  function initHeaderMeasurements(node) {
    var headers = [];
    if (node.matches && node.matches("[data-pp-header]")) headers.push(node);
    Array.prototype.push.apply(headers, node.querySelectorAll ? node.querySelectorAll("[data-pp-header]") : []);
    headers.forEach(function (header) {
      if (header.dataset.ppHeaderMeasured === "true") return;
      header.dataset.ppHeaderMeasured = "true";
      measureHeader(header);
      if (typeof ResizeObserver === "function") {
        var observer = new ResizeObserver(function () { measureHeader(header); });
        observer.observe(header);
      } else {
        window.addEventListener("resize", function () { measureHeader(header); }, { passive: true });
        window.addEventListener("load", function () { measureHeader(header); }, { once: true });
      }
    });
  }

  function closeMobileMenuFromLink(event) {
    var link = event.target.closest && event.target.closest("[data-pp-nav] a");
    if (!link || !window.matchMedia || !window.matchMedia("(max-width: 860px)").matches) return;
    var header = link.closest("[data-pp-header]");
    if (!header) return;
    var toggle = header.querySelector("[data-pp-menu-toggle]");
    var nav = header.querySelector("[data-pp-nav]");
    if (!toggle || !nav || toggle.getAttribute("aria-expanded") !== "true") return;
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
    nav.dataset.open = "false";
    Array.prototype.forEach.call(header.querySelectorAll("[data-pp-dropdown-toggle]"), function (button) {
      button.setAttribute("aria-expanded", "false");
      var menu = document.getElementById(button.getAttribute("aria-controls"));
      if (menu) menu.hidden = true;
    });
  }

  function init() {
    document.addEventListener("toggle", onFaqToggle, true);
    document.addEventListener("click", closeMobileMenuFromLink, true);
    scanFaq(document.documentElement);
    initHeaderMeasurements(document.documentElement);

    if (typeof MutationObserver === "function") {
      var observer = new MutationObserver(function (records) {
        records.forEach(function (record) {
          Array.prototype.forEach.call(record.addedNodes, function (node) {
            scanFaq(node);
            initHeaderMeasurements(node);
          });
        });
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
}());
