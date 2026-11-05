// ===========================================================================
// background.js – PaySafe Background Service Worker (Manifest V3)
// Fully aligned with FastAPI backend endpoints:
//   - POST http://localhost:8000/api/analyze
//   - POST http://localhost:8000/api/dispute
// ===========================================================================

const PRIMARY_API = "http://localhost:8000/api";
const FALLBACK_API = "http://127.0.0.1:8000/api";

chrome.runtime.onInstalled.addListener(() => {
  console.log("[PaySafe] Service worker initialized.");
  chrome.storage.local.set({
    agentActive: true,
    risk_score: null,
    is_scam: false,
    reason: "",
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SCAN_PAGE" || message.type === "PAGE_TEXT_EXTRACTED") {
    const payload = message.payload || {};
    const pageText = typeof payload === "string" ? payload : payload.page_text || "";
    const cartTotal = typeof payload === "object" ? payload.cart_total || 0.0 : 0.0;
    const tabId = sender.tab?.id;

    handleAnalyzeRequest(pageText, cartTotal, tabId)
      .then((data) => sendResponse(data))
      .catch((err) => sendResponse({ error: err.message, intercept_required: false }));

    return true; // Keep channel open for async response
  }

  if (message.type === "FILE_DISPUTE") {
    const { transaction_id, page_text, reason_code } = message.payload || {};
    handleDisputeRequest(transaction_id, page_text, reason_code)
      .then((data) => sendResponse(data))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "GET_SCAN_STATUS") {
    chrome.storage.local.get(["risk_score", "is_scam", "reason", "agentActive"], (data) => {
      sendResponse(data);
    });
    return true;
  }
});

async function postWithFallback(endpoint, body) {
  try {
    const res = await fetch(`${PRIMARY_API}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn(`[PaySafe] Primary API failed (${PRIMARY_API}${endpoint}):`, err.message);
  }

  // Fallback to 127.0.0.1
  const res = await fetch(`${FALLBACK_API}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Backend returned HTTP ${res.status}`);
  }
  return await res.json();
}

async function handleAnalyzeRequest(pageText, cartTotal, tabId) {
  try {
    const data = await postWithFallback("/analyze", {
      page_text: pageText,
      cart_total: cartTotal,
    });

    await chrome.storage.local.set({
      risk_score: data.risk_score ?? 0,
      is_scam: Boolean(data.is_scam),
      reason: data.reason || "",
      last_updated: Date.now(),
    });

    updateBadge(data.risk_score, tabId);
    return data;
  } catch (error) {
    console.error("[PaySafe] Failed to analyze page:", error);
    return {
      risk_score: 0,
      is_scam: false,
      reason: "Could not reach PaySafe backend.",
      intercept_required: false,
    };
  }
}

async function handleDisputeRequest(transactionId, pageText, reasonCode) {
  return await postWithFallback("/dispute", {
    transaction_id: transactionId,
    page_text: pageText,
    reason_code: reasonCode || "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
  });
}

function updateBadge(riskScore, tabId) {
  if (!tabId) return;

  const score = Number(riskScore) || 0;

  if (score > 70) {
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444", tabId }); // Red
    chrome.action.setBadgeText({ text: String(score), tabId });
  } else if (score > 40) {
    chrome.action.setBadgeBackgroundColor({ color: "#f59e0b", tabId }); // Yellow / Amber
    chrome.action.setBadgeText({ text: "!", tabId });
  } else {
    chrome.action.setBadgeText({ text: "", tabId }); // Clear
  }
}
