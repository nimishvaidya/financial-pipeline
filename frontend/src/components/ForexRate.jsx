import { useState, useEffect } from "react";

/**
 * Live forex rate widget — shows USD→INR with cache age and refresh button.
 * Compact inline design for Dashboard header or standalone card.
 */

function ForexRate({ compact = false }) {
  const [rateData, setRateData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchRate();
  }, []);

  async function fetchRate() {
    try {
      setLoading(true);
      const res = await fetch("/api/forex/live");
      if (res.ok) {
        setRateData(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch forex rate:", err);
    } finally {
      setLoading(false);
    }
  }

  async function refreshRate() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/forex/refresh", { method: "POST" });
      if (res.ok) {
        setRateData(await res.json());
      }
    } catch (err) {
      console.error("Failed to refresh forex rate:", err);
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div
        className="flex items-center gap-2 text-xs"
        style={{ color: "var(--color-text-muted)" }}
      >
        <span className="inline-block w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: "var(--color-text-muted)" }} />
        Loading rate...
      </div>
    );
  }

  if (!rateData || !rateData.rate) {
    return (
      <div
        className="flex items-center gap-2 text-xs"
        style={{ color: "var(--color-danger)" }}
      >
        <span>⚠️ Rate unavailable</span>
        <button
          onClick={refreshRate}
          className="underline"
          style={{ color: "var(--color-primary)" }}
        >
          Retry
        </button>
      </div>
    );
  }

  const rate = rateData.rate;
  const ageHours = rateData.cache_age_hours;
  const isStale = rateData.is_stale;
  const fetchFailed = rateData.fetch_failed;

  // Format cache age nicely
  let ageText = "";
  if (ageHours !== null && ageHours !== undefined) {
    if (ageHours < 1) {
      ageText = `${Math.round(ageHours * 60)}m ago`;
    } else if (ageHours < 24) {
      ageText = `${Math.round(ageHours)}h ago`;
    } else {
      ageText = `${Math.round(ageHours / 24)}d ago`;
    }
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
          style={{
            backgroundColor: isStale
              ? "var(--color-warning-light)"
              : "var(--color-success-light)",
            color: isStale ? "var(--color-warning)" : "var(--color-success)",
          }}
        >
          <span>$1 = ₹{rate.toFixed(2)}</span>
          {ageText && (
            <span style={{ opacity: 0.7 }}>· {ageText}</span>
          )}
        </div>
        <button
          onClick={refreshRate}
          disabled={refreshing}
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs transition-transform"
          style={{
            backgroundColor: "var(--color-bg-badge)",
            color: "var(--color-text-secondary)",
            transform: refreshing ? "rotate(180deg)" : "none",
          }}
          title="Refresh rate"
        >
          ↻
        </button>
      </div>
    );
  }

  // Full card view
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        backgroundColor: "var(--color-bg-card)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3
          className="text-sm font-bold uppercase tracking-wider"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Live Exchange Rate
        </h3>
        <button
          onClick={refreshRate}
          disabled={refreshing}
          className="text-xs font-medium px-3 py-1 rounded-full transition-all"
          style={{
            backgroundColor: "var(--color-bg-badge)",
            color: "var(--color-primary)",
            opacity: refreshing ? 0.5 : 1,
          }}
        >
          {refreshing ? "Refreshing..." : "↻ Refresh"}
        </button>
      </div>

      <div className="flex items-baseline gap-2">
        <span
          className="text-2xl font-bold"
          style={{ color: "var(--color-text)" }}
        >
          ₹{rate.toFixed(2)}
        </span>
        <span
          className="text-sm"
          style={{ color: "var(--color-text-muted)" }}
        >
          per $1 USD
        </span>
      </div>

      <div className="flex items-center gap-3 mt-2">
        {/* Status dot */}
        <div className="flex items-center gap-1.5">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: isStale
                ? "var(--color-warning)"
                : "var(--color-success)",
            }}
          />
          <span
            className="text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            {isStale ? "Stale" : "Fresh"}
            {ageText && ` · Updated ${ageText}`}
          </span>
        </div>

        {fetchFailed && (
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: "var(--color-danger-light)",
              color: "var(--color-danger)",
            }}
          >
            API unreachable
          </span>
        )}
      </div>

      {/* Quick conversion helper */}
      <div
        className="mt-3 pt-3 flex items-center justify-between text-xs"
        style={{
          borderTop: "1px solid var(--color-border)",
          color: "var(--color-text-muted)",
        }}
      >
        <span>$100 = ₹{(100 * rate).toLocaleString()}</span>
        <span>$1,000 = ₹{(1000 * rate).toLocaleString()}</span>
        <span>Source: ExchangeRate-API</span>
      </div>
    </div>
  );
}

export default ForexRate;
