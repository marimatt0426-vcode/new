/* Purge Pros NEXT — shared progressive enhancement for GHL fragments. */
(function () {
  "use strict";

  var ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "gbraid", "wbraid", "fbclid"];

  function each(nodes, fn) {
    Array.prototype.forEach.call(nodes, fn);
  }

  function initHeader(header) {
    if (header.dataset.ppReady === "true") return;
    header.dataset.ppReady = "true";
    var menuButton = header.querySelector("[data-pp-menu-toggle]");
    var nav = header.querySelector("[data-pp-nav]");
    var dropdownButtons = header.querySelectorAll("[data-pp-dropdown-toggle]");

    function closeDropdown(button) {
      var menu = document.getElementById(button.getAttribute("aria-controls"));
      button.setAttribute("aria-expanded", "false");
      if (menu) menu.hidden = true;
    }

    function closeDropdowns(except) {
      each(dropdownButtons, function (button) {
        if (button !== except) closeDropdown(button);
      });
    }

    function closeMenu() {
      if (!menuButton || !nav) return;
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-label", "Open menu");
      nav.dataset.open = "false";
      closeDropdowns();
    }

    if (menuButton && nav) {
      menuButton.addEventListener("click", function () {
        var opening = menuButton.getAttribute("aria-expanded") !== "true";
        menuButton.setAttribute("aria-expanded", String(opening));
        menuButton.setAttribute("aria-label", opening ? "Close menu" : "Open menu");
        nav.dataset.open = String(opening);
        if (!opening) closeDropdowns();
      });
    }

    each(dropdownButtons, function (button) {
      button.addEventListener("click", function () {
        var opening = button.getAttribute("aria-expanded") !== "true";
        closeDropdowns(button);
        button.setAttribute("aria-expanded", String(opening));
        var menu = document.getElementById(button.getAttribute("aria-controls"));
        if (menu) menu.hidden = !opening;
      });
    });

    header.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      var openButton = header.querySelector('[data-pp-dropdown-toggle][aria-expanded="true"]');
      if (openButton) {
        closeDropdown(openButton);
        openButton.focus();
      } else if (menuButton && menuButton.getAttribute("aria-expanded") === "true") {
        closeMenu();
        menuButton.focus();
      }
    });

    document.addEventListener("click", function (event) {
      if (!header.contains(event.target)) closeDropdowns();
    });

    window.addEventListener("resize", function () {
      if (window.matchMedia("(min-width: 861px)").matches) closeMenu();
    });
  }

  function initOfferModal(modal) {
    if (modal.dataset.ppReady === "true") return;
    modal.dataset.ppReady = "true";
    var panel = modal.querySelector('[role="dialog"]');
    var closeButton = modal.querySelector("button[data-pp-offer-close]");
    var lastFocus = null;

    function focusable() {
      return panel ? panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') : [];
    }

    function openModal() {
      lastFocus = document.activeElement;
      modal.hidden = false;
      document.documentElement.classList.add("pp-next-lock");
      if (closeButton) closeButton.focus();
    }

    function closeModal() {
      modal.hidden = true;
      document.documentElement.classList.remove("pp-next-lock");
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    }

    each(document.querySelectorAll("[data-pp-offer-open]"), function (button) {
      button.addEventListener("click", openModal);
    });
    each(modal.querySelectorAll("[data-pp-offer-close]"), function (button) {
      button.addEventListener("click", closeModal);
    });

    modal.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== "Tab") return;
      var items = focusable();
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    modal.ppClose = closeModal;
  }

  function openExistingQuote(zip) {
    var quote = window.PurgeProsQuote;
    if (!quote || typeof quote.open !== "function") return false;
    if (zip) quote.open({ zip: zip });
    else quote.open();
    return true;
  }

  function isStaging() {
    return !!document.querySelector('meta[name="pp-environment"][content="staging"]');
  }

  function blockMissingStagingQuote(source) {
    if (!isStaging()) return false;
    document.dispatchEvent(new CustomEvent("pp:staging-quote-unavailable", { detail: { source: source } }));
    if (window.console && typeof window.console.warn === "function") {
      window.console.warn("Purge Pros staging quote launcher is unavailable; production fallback was blocked.");
    }
    return true;
  }

  function appendAttribution(form) {
    var params = new URLSearchParams(window.location.search);
    ATTRIBUTION_KEYS.forEach(function (key) {
      if (!params.has(key) || form.elements[key]) return;
      var field = document.createElement("input");
      field.type = "hidden";
      field.name = key;
      field.value = params.get(key);
      form.appendChild(field);
    });
  }

  function initQuoteLaunchers() {
    each(document.querySelectorAll("[data-purge-quote]"), function (link) {
      if (link.dataset.ppQuoteReady === "true") return;
      link.dataset.ppQuoteReady = "true";
      link.addEventListener("click", function (event) {
        if (openExistingQuote()) {
          event.preventDefault();
          var modal = link.closest("[data-pp-offer-modal]");
          if (modal && modal.ppClose) modal.ppClose();
          return;
        }
        if (blockMissingStagingQuote("link")) event.preventDefault();
      });
    });

    each(document.querySelectorAll("[data-pp-zip-form]"), function (form) {
      if (form.dataset.ppQuoteReady === "true") return;
      form.dataset.ppQuoteReady = "true";
      form.addEventListener("submit", function (event) {
        if (!form.checkValidity()) return;
        var zip = String(form.elements.zip.value || "").trim();
        if (openExistingQuote(zip)) {
          event.preventDefault();
          return;
        }
        if (blockMissingStagingQuote("zip-form")) {
          event.preventDefault();
          return;
        }
        appendAttribution(form);
      });
    });
  }

  function initFaqs() {
    each(document.querySelectorAll(".pp-next .pp-faq"), function (item) {
      if (item.dataset.ppReady === "true") return;
      item.dataset.ppReady = "true";
      item.addEventListener("toggle", function () {
        if (!item.open) return;
        var root = item.closest(".pp-next");
        each(root.querySelectorAll(".pp-faq[open]"), function (other) {
          if (other !== item) other.open = false;
        });
      });
    });
  }

  function init() {
    each(document.querySelectorAll("[data-pp-header]"), initHeader);
    each(document.querySelectorAll("[data-pp-offer-modal]"), initOfferModal);
    each(document.querySelectorAll("[data-pp-year]"), function (node) {
      node.textContent = String(new Date().getFullYear());
    });
    initQuoteLaunchers();
    initFaqs();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}());
