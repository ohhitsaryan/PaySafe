import { useState, useEffect } from "react";

export default function App() {
  const [scan, setScan] = useState({
    risk_score: null,
    is_scam: false,
    reason: "",
    loading: true,
  });

  useEffect(() => {
    // Read state from Chrome storage
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get(
        ["risk_score", "is_scam", "reason"],
        (data) => {
          setScan({
            risk_score: data.risk_score ?? null,
            is_scam: Boolean(data.is_scam),
            reason: data.reason || "No scan analysis performed on this page yet.",
            loading: false,
          });
        }
      );

      // Listen for updates from background service worker
      const handleStorageChange = (changes) => {
        setScan((prev) => ({
          ...prev,
          risk_score: changes.risk_score ? changes.risk_score.newValue : prev.risk_score,
          is_scam: changes.is_scam ? changes.is_scam.newValue : prev.is_scam,
          reason: changes.reason ? changes.reason.newValue : prev.reason,
        }));
      };

      chrome.storage.onChanged.addListener(handleStorageChange);
      return () => chrome.storage.onChanged.removeListener(handleStorageChange);
    } else {
      // Development mock state when loaded in browser outside Chrome extension
      setScan({
        risk_score: 88,
        is_scam: true,
        reason: "Warning: Product pricing is 92% below verified retail. Terms embed an automatic monthly charge of $49.99.",
        loading: false,
      });
    }
  }, []);

  const score = scan.risk_score ?? 0;
  const isHigh = score > 70;
  const isMedium = score >= 40 && score <= 70;

  const colorConfig = isHigh
    ? {
        text: "text-rose-600",
        stroke: "#e11d48",
        bg: "bg-rose-50",
        border: "border-rose-200",
        badgeBg: "bg-rose-100",
        label: "High Threat Level",
      }
    : isMedium
    ? {
        text: "text-amber-500",
        stroke: "#f59e0b",
        bg: "bg-amber-50",
        border: "border-amber-200",
        badgeBg: "bg-amber-100",
        label: "Moderate Caution",
      }
    : {
        text: "text-emerald-500",
        stroke: "#10b981",
        bg: "bg-emerald-50",
        border: "border-emerald-200",
        badgeBg: "bg-emerald-100",
        label: "Safe Checkout",
      };

  // Circular gauge math (radius = 38)
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, score)) / 100) * circumference;

  return (
    <div className="w-[340px] bg-slate-50 text-slate-800 font-sans p-4 antialiased selection:bg-indigo-500 selection:text-white">
      {/* Header */}
      <header className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <img
            src="/icons/icon48.png"
            alt="PaySafe"
            className="w-7 h-7 rounded-lg shadow-sm object-contain"
            onError={(e) => {
              // Fallback to SVG if image not found
              e.currentTarget.style.display = "none";
              if (e.currentTarget.nextElementSibling) {
                e.currentTarget.nextElementSibling.style.display = "flex";
              }
            }}
          />
          <div className="hidden p-1.5 rounded-lg bg-indigo-600 text-white shadow-sm items-center justify-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-none">PaySafe</h1>
            <p className="text-[10px] text-slate-500 font-medium mt-0.5">Automated Consumer Protection</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Active
        </span>
      </header>

      {/* Main Content */}
      <div className="py-4 flex flex-col items-center">
        {scan.loading ? (
          <div className="h-44 flex flex-col items-center justify-center text-xs text-slate-400 gap-2">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span>Analyzing checkout page...</span>
          </div>
        ) : (
          <>
            {/* Circular Progress Gauge */}
            <div className="relative flex items-center justify-center my-1">
              <svg className="w-28 h-28 transform -rotate-90">
                <circle
                  cx="56"
                  cy="56"
                  r={radius}
                  stroke="#e2e8f0"
                  strokeWidth="7"
                  fill="transparent"
                />
                <circle
                  cx="56"
                  cy="56"
                  r={radius}
                  stroke={colorConfig.stroke}
                  strokeWidth="7"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-700 ease-out"
                />
              </svg>

              <div className="absolute flex flex-col items-center justify-center">
                <span className={`text-2xl font-black tracking-tight ${colorConfig.text}`}>
                  {scan.risk_score !== null ? scan.risk_score : "0"}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Risk Score
                </span>
              </div>
            </div>

            {/* Status Pills */}
            <div className="mt-2 flex items-center gap-1.5">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${colorConfig.badgeBg} ${colorConfig.text} border ${colorConfig.border}`}>
                {colorConfig.label}
              </span>
              {scan.is_scam && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-600 text-white animate-pulse">
                  Deception Detected
                </span>
              )}
            </div>

            {/* AI Analysis Reason Card */}
            <div className={`mt-4 w-full p-3 rounded-xl border text-left ${colorConfig.bg} ${colorConfig.border} shadow-sm`}>
              <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-bold text-slate-700">
                <span>🤖 PaySafe AI Assessment</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed break-words">
                {scan.reason}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="pt-2 border-t border-slate-200 text-center flex items-center justify-between text-[10px] text-slate-400">
        <span>PaySafe v1.1.0</span>
        <span>PayPal Sandbox Shield</span>
      </footer>
    </div>
  );
}
