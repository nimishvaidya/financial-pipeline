import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:8000";

function Portfolio() {
  const [portfolio, setPortfolio] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddHolding, setShowAddHolding] = useState(false);
  const [showAddWatch, setShowAddWatch] = useState(false);
  const [holdingForm, setHoldingForm] = useState({ ticker: "", shares: "", avg_cost: "" });
  const [watchForm, setWatchForm] = useState({ ticker: "", threshold_pct: "5" });
  const [priceSearch, setPriceSearch] = useState("");
  const [priceResult, setPriceResult] = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [tab, setTab] = useState("holdings"); // holdings | watchlist | alerts

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [pRes, wRes, aRes] = await Promise.all([
        fetch(`${API}/api/portfolio/summary`),
        fetch(`${API}/api/portfolio/watchlist`),
        fetch(`${API}/api/portfolio/alerts`),
      ]);
      setPortfolio(await pRes.json());
      setWatchlist(await wRes.json());
      setAlerts(await aRes.json());
    } catch (e) {
      console.error("Failed to fetch portfolio data", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function addHolding(e) {
    e.preventDefault();
    await fetch(`${API}/api/portfolio/holdings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: holdingForm.ticker,
        shares: parseFloat(holdingForm.shares),
        avg_cost: parseFloat(holdingForm.avg_cost),
      }),
    });
    setHoldingForm({ ticker: "", shares: "", avg_cost: "" });
    setShowAddHolding(false);
    fetchAll();
  }

  async function removeHolding(ticker) {
    await fetch(`${API}/api/portfolio/holdings/${ticker}`, { method: "DELETE" });
    fetchAll();
  }

  async function addWatchItem(e) {
    e.preventDefault();
    await fetch(`${API}/api/portfolio/watchlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: watchForm.ticker,
        threshold_pct: parseFloat(watchForm.threshold_pct),
      }),
    });
    setWatchForm({ ticker: "", threshold_pct: "5" });
    setShowAddWatch(false);
    fetchAll();
  }

  async function removeWatch(ticker) {
    await fetch(`${API}/api/portfolio/watchlist/${ticker}`, { method: "DELETE" });
    fetchAll();
  }

  async function runDipCheck() {
    await fetch(`${API}/api/portfolio/dip-check`);
    fetchAll();
  }

  async function ackAlert(id) {
    await fetch(`${API}/api/portfolio/alerts/${id}/acknowledge`, { method: "POST" });
    fetchAll();
  }

  async function searchPrice() {
    if (!priceSearch.trim()) return;
    setPriceLoading(true);
    try {
      const res = await fetch(`${API}/api/portfolio/price/${priceSearch.trim()}`);
      if (res.ok) {
        setPriceResult(await res.json());
      } else {
        setPriceResult({ error: true });
      }
    } catch {
      setPriceResult({ error: true });
    } finally {
      setPriceLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="text-4xl mb-3" style={{ animation: "pulse 1.5s infinite" }}>📈</div>
          <div style={{ color: "var(--color-text-secondary)" }}>Loading portfolio...</div>
        </div>
      </div>
    );
  }

  const hasHoldings = portfolio?.holdings?.length > 0;

  return (
    <div className="space-y-6">
      {/* Portfolio Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard
          icon="💼"
          label="Portfolio Value"
          value={`$${(portfolio?.total_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
        />
        <SummaryCard
          icon="💰"
          label="Total Cost"
          value={`$${(portfolio?.total_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
        />
        <SummaryCard
          icon={portfolio?.total_gain >= 0 ? "📈" : "📉"}
          label="Total Gain/Loss"
          value={`${portfolio?.total_gain >= 0 ? "+" : ""}$${(portfolio?.total_gain || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          valueColor={portfolio?.total_gain >= 0 ? "var(--color-success, #10b981)" : "var(--color-danger, #ef4444)"}
        />
        <SummaryCard
          icon="📊"
          label="Return"
          value={`${portfolio?.total_gain_pct >= 0 ? "+" : ""}${(portfolio?.total_gain_pct || 0).toFixed(2)}%`}
          valueColor={portfolio?.total_gain_pct >= 0 ? "var(--color-success, #10b981)" : "var(--color-danger, #ef4444)"}
        />
      </div>

      {/* Quick Price Lookup */}
      <div
        className="rounded-2xl p-5"
        style={{ backgroundColor: "var(--color-bg-card)", boxShadow: "var(--shadow-md)" }}
      >
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text-secondary)" }}>
          Quick Price Lookup
        </h3>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Enter ticker (e.g. AAPL)"
            value={priceSearch}
            onChange={(e) => setPriceSearch(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && searchPrice()}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{
              backgroundColor: "var(--color-bg-input, var(--color-bg-badge))",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
            }}
          />
          <button
            onClick={searchPrice}
            disabled={priceLoading}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-white"
            style={{ backgroundColor: "var(--color-primary, #3b82f6)" }}
          >
            {priceLoading ? "..." : "Search"}
          </button>
        </div>
        {priceResult && !priceResult.error && (
          <div className="mt-3 flex items-center gap-6 text-sm" style={{ color: "var(--color-text)" }}>
            <span className="font-semibold">{priceResult.ticker || priceSearch}</span>
            <span className="text-lg font-bold">${priceResult.price?.toFixed(2)}</span>
            <span style={{ color: priceResult.day_change_pct >= 0 ? "var(--color-success, #10b981)" : "var(--color-danger, #ef4444)" }}>
              {priceResult.day_change_pct >= 0 ? "▲" : "▼"} {Math.abs(priceResult.day_change_pct || 0).toFixed(2)}%
            </span>
            {priceResult.high_52w && (
              <span style={{ color: "var(--color-text-muted)" }}>
                52W: ${priceResult.low_52w?.toFixed(2)} – ${priceResult.high_52w?.toFixed(2)}
              </span>
            )}
          </div>
        )}
        {priceResult?.error && (
          <div className="mt-3 text-sm" style={{ color: "var(--color-danger, #ef4444)" }}>
            Could not fetch price for "{priceSearch}". Check the ticker symbol.
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: "var(--color-bg-badge)" }}>
        {[
          { id: "holdings", label: "Holdings", count: portfolio?.holdings?.length || 0 },
          { id: "watchlist", label: "Watchlist", count: watchlist.length },
          { id: "alerts", label: "Dip Alerts", count: alerts.length },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: tab === t.id ? "var(--color-bg-card)" : "transparent",
              color: tab === t.id ? "var(--color-text)" : "var(--color-text-muted)",
              boxShadow: tab === t.id ? "var(--shadow-sm)" : "none",
            }}
          >
            {t.label}
            {t.count > 0 && (
              <span
                className="ml-2 px-2 py-0.5 rounded-full text-xs"
                style={{
                  backgroundColor: t.id === "alerts" && t.count > 0
                    ? "var(--color-danger, #ef4444)"
                    : "var(--color-primary-light, rgba(59,130,246,0.1))",
                  color: t.id === "alerts" && t.count > 0
                    ? "#fff"
                    : "var(--color-primary, #3b82f6)",
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Holdings Tab */}
      {tab === "holdings" && (
        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: "var(--color-bg-card)", boxShadow: "var(--shadow-md)" }}
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
              Holdings
            </h2>
            <button
              onClick={() => setShowAddHolding(!showAddHolding)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-all"
              style={{ backgroundColor: "var(--color-primary, #3b82f6)" }}
            >
              {showAddHolding ? "Cancel" : "+ Add Holding"}
            </button>
          </div>

          {/* Add Holding Form */}
          {showAddHolding && (
            <form onSubmit={addHolding} className="mb-6 p-4 rounded-xl space-y-3" style={{ backgroundColor: "var(--color-bg-badge)" }}>
              <div className="grid grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Ticker (AAPL)"
                  value={holdingForm.ticker}
                  onChange={(e) => setHoldingForm({ ...holdingForm, ticker: e.target.value.toUpperCase() })}
                  required
                  className="px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Shares"
                  value={holdingForm.shares}
                  onChange={(e) => setHoldingForm({ ...holdingForm, shares: e.target.value })}
                  required
                  className="px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Avg Cost ($)"
                  value={holdingForm.avg_cost}
                  onChange={(e) => setHoldingForm({ ...holdingForm, avg_cost: e.target.value })}
                  required
                  className="px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-white"
                style={{ backgroundColor: "var(--color-success, #10b981)" }}
              >
                Add Holding
              </button>
            </form>
          )}

          {/* Holdings Table */}
          {hasHoldings ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: "var(--color-text-muted)" }}>
                    <th className="text-left pb-3 font-medium">Ticker</th>
                    <th className="text-right pb-3 font-medium">Shares</th>
                    <th className="text-right pb-3 font-medium">Avg Cost</th>
                    <th className="text-right pb-3 font-medium">Price</th>
                    <th className="text-right pb-3 font-medium">Day</th>
                    <th className="text-right pb-3 font-medium">Value</th>
                    <th className="text-right pb-3 font-medium">Gain/Loss</th>
                    <th className="text-right pb-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.holdings.map((h) => (
                    <tr
                      key={h.ticker}
                      className="border-t"
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      <td className="py-3 font-semibold" style={{ color: "var(--color-text)" }}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                            style={{ backgroundColor: tickerColor(h.ticker) }}
                          >
                            {h.ticker.slice(0, 2)}
                          </div>
                          {h.ticker}
                        </div>
                      </td>
                      <td className="py-3 text-right" style={{ color: "var(--color-text)" }}>
                        {h.shares.toFixed(h.shares % 1 === 0 ? 0 : 4)}
                      </td>
                      <td className="py-3 text-right" style={{ color: "var(--color-text-secondary)" }}>
                        ${h.avg_cost.toFixed(2)}
                      </td>
                      <td className="py-3 text-right font-medium" style={{ color: "var(--color-text)" }}>
                        ${h.current_price.toFixed(2)}
                      </td>
                      <td
                        className="py-3 text-right text-xs font-medium"
                        style={{ color: h.day_change_pct >= 0 ? "var(--color-success, #10b981)" : "var(--color-danger, #ef4444)" }}
                      >
                        {h.day_change_pct >= 0 ? "▲" : "▼"} {Math.abs(h.day_change_pct).toFixed(2)}%
                      </td>
                      <td className="py-3 text-right font-medium" style={{ color: "var(--color-text)" }}>
                        ${h.market_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 text-right">
                        <div
                          className="text-sm font-medium"
                          style={{ color: h.gain >= 0 ? "var(--color-success, #10b981)" : "var(--color-danger, #ef4444)" }}
                        >
                          {h.gain >= 0 ? "+" : ""}${h.gain.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                        <div
                          className="text-xs"
                          style={{ color: h.gain_pct >= 0 ? "var(--color-success, #10b981)" : "var(--color-danger, #ef4444)" }}
                        >
                          ({h.gain_pct >= 0 ? "+" : ""}{h.gain_pct.toFixed(2)}%)
                        </div>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => removeHolding(h.ticker)}
                          className="p-1.5 rounded-lg text-xs transition-colors"
                          style={{ color: "var(--color-text-muted)" }}
                          title="Remove holding"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">📊</div>
              <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                No holdings yet. Add your first stock or ETF above.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Watchlist Tab */}
      {tab === "watchlist" && (
        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: "var(--color-bg-card)", boxShadow: "var(--shadow-md)" }}
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                Dip Watchlist
              </h2>
              <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                Get alerted when stocks drop from their 52-week high
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={runDipCheck}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                style={{ border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              >
                🔍 Check Now
              </button>
              <button
                onClick={() => setShowAddWatch(!showAddWatch)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-all"
                style={{ backgroundColor: "var(--color-primary, #3b82f6)" }}
              >
                {showAddWatch ? "Cancel" : "+ Add Ticker"}
              </button>
            </div>
          </div>

          {showAddWatch && (
            <form onSubmit={addWatchItem} className="mb-6 p-4 rounded-xl space-y-3" style={{ backgroundColor: "var(--color-bg-badge)" }}>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Ticker (e.g. VOO)"
                  value={watchForm.ticker}
                  onChange={(e) => setWatchForm({ ...watchForm, ticker: e.target.value.toUpperCase() })}
                  required
                  className="px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    placeholder="Drop %"
                    value={watchForm.threshold_pct}
                    onChange={(e) => setWatchForm({ ...watchForm, threshold_pct: e.target.value })}
                    required
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                  />
                  <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>% from 52W high</span>
                </div>
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-white"
                style={{ backgroundColor: "var(--color-success, #10b981)" }}
              >
                Add to Watchlist
              </button>
            </form>
          )}

          {watchlist.length > 0 ? (
            <div className="space-y-3">
              {watchlist.map((w) => (
                <WatchlistCard key={w.ticker} item={w} onRemove={removeWatch} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">👀</div>
              <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                No tickers on your watchlist. Add stocks to monitor for dips.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Alerts Tab */}
      {tab === "alerts" && (
        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: "var(--color-bg-card)", boxShadow: "var(--shadow-md)" }}
        >
          <h2 className="text-lg font-semibold mb-5" style={{ color: "var(--color-text)" }}>
            Dip Alerts
          </h2>
          {alerts.length > 0 ? (
            <div className="space-y-3">
              {alerts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-4 rounded-xl"
                  style={{
                    backgroundColor: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                  }}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold" style={{ color: "var(--color-text)" }}>
                        📉 {a.ticker}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: "rgba(239, 68, 68, 0.15)", color: "var(--color-danger, #ef4444)" }}
                      >
                        -{a.drop_pct}% from high
                      </span>
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                      Price: ${a.price_at_alert.toFixed(2)} · 52W High: ${a.recent_high.toFixed(2)} · {new Date(a.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => ackAlert(a.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
                  >
                    Dismiss
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">✅</div>
              <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                No pending dip alerts. Add tickers to your watchlist and run a check.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- Helper Components ---- */

function SummaryCard({ icon, label, value, valueColor }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: "var(--color-bg-card)", boxShadow: "var(--shadow-md)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
          {label}
        </span>
      </div>
      <div
        className="text-xl font-bold"
        style={{ color: valueColor || "var(--color-text)" }}
      >
        {value}
      </div>
    </div>
  );
}

function WatchlistCard({ item, onRemove }) {
  const [price, setPrice] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/portfolio/price/${item.ticker}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setPrice)
      .catch(() => {});
  }, [item.ticker]);

  const dropFromHigh = price?.high_52w
    ? (((price.high_52w - price.price) / price.high_52w) * 100).toFixed(1)
    : null;

  return (
    <div
      className="flex items-center justify-between p-4 rounded-xl"
      style={{ backgroundColor: "var(--color-bg-badge)" }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold text-white"
          style={{ backgroundColor: tickerColor(item.ticker) }}
        >
          {item.ticker.slice(0, 2)}
        </div>
        <div>
          <div className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>
            {item.ticker}
          </div>
          <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Alert at ≥{item.dip_threshold_pct}% drop from 52W high
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        {price && (
          <div className="text-right">
            <div className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
              ${price.price?.toFixed(2)}
            </div>
            {dropFromHigh !== null && (
              <div
                className="text-xs"
                style={{
                  color: parseFloat(dropFromHigh) >= item.dip_threshold_pct
                    ? "var(--color-danger, #ef4444)"
                    : "var(--color-text-muted)",
                }}
              >
                {dropFromHigh}% from high
              </div>
            )}
          </div>
        )}
        <button
          onClick={() => onRemove(item.ticker)}
          className="p-1.5 rounded-lg text-xs"
          style={{ color: "var(--color-text-muted)" }}
          title="Remove from watchlist"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/* Generate consistent color from ticker string */
function tickerColor(ticker) {
  const colors = [
    "#3b82f6", "#8b5cf6", "#ec4899", "#ef4444", "#f59e0b",
    "#10b981", "#06b6d4", "#6366f1", "#d946ef", "#14b8a6",
  ];
  let hash = 0;
  for (let i = 0; i < ticker.length; i++) {
    hash = ticker.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default Portfolio;
