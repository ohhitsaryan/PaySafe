// ===========================================================================
// content_script.js – PaySafe
// Scrapes page innerText & cart total, communicates with background service worker,
// and replaces unsafe checkout buttons with a PaySafe protected checkout button.
// ===========================================================================

(function () {
  "use strict";

  if (window.__paySafeInjected) return;
  window.__paySafeInjected = true;

  function extractPageText() {
    return (document.body?.innerText ?? "")
      .replace(/\s{3,}/g, "\n\n")
      .trim();
  }

  function scrapeCartTotal() {
    // 1. Check common cart total selectors
    const selectors = [
      "[data-cart-total]",
      ".cart-total",
      ".order-total",
      "#cart-total",
      ".summary-total",
      "[class*='total'] [class*='price']",
      "[class*='price'][class*='total']",
      ".grand-total",
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const match = el.innerText.match(/[\d,]+\.?\d*/);
        if (match) {
          const val = parseFloat(match[0].replace(/,/g, ""));
          if (!isNaN(val) && val > 0) return val;
        }
      }
    }

    // 2. Fallback: scan all text nodes for $ price patterns and take the max
    const textMatches = document.body.innerText.match(/\$\s*([\d,]+\.?\d*)/g);
    if (textMatches && textMatches.length > 0) {
      const values = textMatches
        .map((m) => parseFloat(m.replace(/[$,\s]/g, "")))
        .filter((v) => !isNaN(v) && v > 0);
      if (values.length > 0) {
        return Math.max(...values);
      }
    }

    return 0.0;
  }

  function findCheckoutButton() {
    const selectors = [
      "button[type='submit']",
      ".checkout-btn",
      ".checkout-button",
      "#checkout",
      "#checkout-button",
      "[data-testid='checkout-button']",
      "button[name='checkout']",
      "input[type='submit']",
      "a.checkout",
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }

    // Keyword heuristic search
    const keywords = /checkout|place order|pay now|buy now|complete order|subscribe/i;
    for (const btn of document.querySelectorAll("button, a[role='button'], input[type='button']")) {
      const text = btn.innerText || btn.value || "";
      if (keywords.test(text) && btn.offsetParent !== null) {
        return btn;
      }
    }

    return null;
  }

  function injectProtectedButton(originalBtn, paypalUrl) {
    if (document.getElementById("paysafe-protected-btn")) return;

    // Build the Amber Warning Banner
    const banner = document.createElement("div");
    banner.id = "paysafe-warning-banner";
    Object.assign(banner.style, {
      display: "flex",
      alignItems: "flex-start",
      gap: "10px",
      margin: "12px 0",
      padding: "12px 16px",
      backgroundColor: "#fef3c7",
      border: "1px solid #f59e0b",
      borderRadius: "8px",
      color: "#92400e",
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize: "13px",
      lineHeight: "1.45",
      boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
      zIndex: "99999",
    });
    banner.innerHTML = `
      <span style="font-size:18px;line-height:1;">⚠️</span>
      <div>
        <strong style="font-weight:700;display:block;margin-bottom:2px;">PaySafe Warning: Deceptive Terms Detected</strong>
        This checkout page exhibits hidden recurring subscription clauses or suspicious pricing.
        We have substituted the checkout button with a protected PaySafe PayPal flow.
      </div>
    `;

    // Build the Custom Inline-Styled Protected Button
    const btn = document.createElement("button");
    btn.id = "paysafe-protected-btn";
    btn.type = "button";
    Object.assign(btn.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
      width: "100%",
      padding: "14px 24px",
      backgroundColor: "#16a34a",
      color: "#ffffff",
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize: "15px",
      fontWeight: "700",
      borderRadius: "8px",
      border: "none",
      cursor: "pointer",
      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
      transition: "background-color 0.2s ease, transform 0.1s ease",
      zIndex: "99999",
    });

    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <span>Protected Checkout by PaySafe</span>
    `;

    btn.addEventListener("mouseenter", () => {
      btn.style.backgroundColor = "#15803d";
      btn.style.transform = "translateY(-1px)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.backgroundColor = "#16a34a";
      btn.style.transform = "translateY(0)";
    });

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = paypalUrl;
    });

    // Hide original and inject protected elements
    originalBtn.style.display = "none";
    originalBtn.insertAdjacentElement("beforebegin", banner);
    originalBtn.insertAdjacentElement("afterend", btn);

    console.log("[PaySafe] Replaced checkout button with Protected PaySafe Checkout.");
  }

  function runAgent() {
    const pageText = extractPageText();
    if (!pageText) return;

    const cartTotal = scrapeCartTotal();

    chrome.runtime.sendMessage(
      {
        type: "SCAN_PAGE",
        payload: {
          page_text: pageText,
          cart_total: cartTotal,
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn("[PaySafe] Background communication error:", chrome.runtime.lastError.message);
          return;
        }

        if (response?.intercept_required && response?.paypal_url) {
          const originalCheckout = findCheckoutButton();
          if (originalCheckout) {
            injectProtectedButton(originalCheckout, response.paypal_url);
          } else {
            console.warn("[PaySafe] Intercept required, but primary checkout button could not be located.");
          }
        }
      }
    );
  }

  if (document.readyState === "complete") {
    runAgent();
  } else {
    window.addEventListener("load", runAgent);
  }
})();
