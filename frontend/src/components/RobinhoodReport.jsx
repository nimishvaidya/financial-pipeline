import { useState, useCallback } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Treemap,
} from "recharts";

const API = "";

const COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#ef4444", "#f59e0b",
  "#10b981", "#06b6d4", "#6366f1", "#d946ef", "#14b8a6",
  "#f97316", "#84cc16", "#0ea5e9", "#a855f7", "#e11d48",
];

function RobinhoodReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("overview");
  const [dragOver, setDragOver] = useState(false);

  const handleUpload = useCallback(async (file) => {
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please upload a PDF file");
      return;
    }
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API}/api/robinhood/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Upload failed");
      }
      const result = await res.json();
      setData(result.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const handleFileInput = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  // Upload screen
  if (!data) {
    return (
      <div className="space-y-6">
        <div
          className="rounded-2xl p-12 text-center transition-all cursor-pointer"
          style={{
            backgroundColor: dragOver ? "var(--color-primary-light)" : "var(--color-bg-card)",
            boxShadow: "var(--shadow-md)",
            border: `2px dashed ${dragOver ? "var(--color-primary)" : "var(--color-border)"}`,
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById("pdf-input")?.click()}
        >
          <div className="text-5xl mb-4">{loading ? "⏳" : "📄"}</div>
          <h2 className="text-xl font-bold mb-2" style={{ color: "var(--color-text)" }}>
            {loading ? "Parsing statement..." : "Upload Robinhood Statement"}
          </h2>
          <p className="text-sm mb-4" style={{ color: "var(--color-text-muted)" }}>
            Drop your monthly statement PDF here or click to browse
          </p>
          <input
            id="pdf-input"
            type="file"
            accept=".pdf"
            onChange={handleFileInput}
            className="hidden"
          />
          {!loading && (
            <button
              className="px-6 py-3 rounded-xl text-sm font-medium text-white"
              style={{ backgroundColor: "var(--color-primary, #3b82f6)" }}
            >
              Choose PDF
            </button>
          )}
          {error && (
            <div className="mt-4 text-sm" style={{ color: "var(--color-danger, #ef4444)" }}>
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  const { summary, holdings, transactions, stats } = data;

  return (
    <div className="space-y-6">
      {/* Period Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--color-text)" }}>
            Robinhood Statement
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            {summary.period}
          </p>
        </div>
        <button
          onClick={() => { setData(null); setError(null); }}
          className="px-4 py-2 rounded-xl text-sm font-medium"
          style={{ border: "1px solid var(--color-border)", color: "var(--color-text)" }}
        >
          Upload New
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard icon="💼" label="Portfolio" value={`$${summary.portfolio_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
        <StatCard icon="📈" label="Securities" value={`$${summary.total_securities.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} sub={`${summary.equities_pct}%`} />
        <StatCard icon="💵" label="Cash" value={`$${summary.cash_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} sub={`${summary.cash_pct}%`} />
        <StatCard icon="💰" label="Dividends (Mo)" value={`$${summary.dividends_period.toFixed(2)}`} sub={`YTD: $${summary.dividends_ytd.toFixed(2)}`} />
        <StatCard icon="📊" label="Holdings" value={holdings.length.toString()} sub={`${stats.stock_count} stocks · ${stats.etf_count} ETFs`} />
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: "var(--color-bg-badge)" }}>
        {["overview", "holdings", "transactions", "dividends"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2.5 px-4 rounded-lg text-sm font-medium capitalize transition-all"
            style={{
              backgroundColor: tab === t ? "var(--color-bg-card)" : "transparent",
              color: tab === t ? "var(--color-text)" : "var(--color-text-muted)",
              boxShadow: tab === t ? "var(--shadow-sm)" : "none",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "overview" && <OverviewTab holdings={holdings} stats={stats} summary={summary} />}
      {tab === "holdings" && <HoldingsTab holdings={holdings} />}
      {tab === "transactions" && <TransactionsTab transactions={transactions} stats={stats} />}
      {tab === "dividends" && <DividendsTab transactions={transactions} holdings={holdings} stats={stats} />}
    </div>
  );
}

/* ==================== OVERVIEW TAB ==================== */

function OverviewTab({ holdings, stats, summary }) {
  // Top 10 for treemap
  const treemapData = stats.top_10.map((h, i) => ({
    name: h.ticker,
    size: h.value,
    pct: h.pct,
    fill: COLORS[i % COLORS.length],
  }));

  // Stocks vs ETFs pie
  const typeData = [
    { name: "Stocks", value: stats.stock_value },
    { name: "ETFs", value: stats.etf_value },
  ];

  // Dividend pie
  const divData = [
    { name: "Dividend Payers", value: stats.dividend_payers },
    { name: "Non-Dividend", value: stats.non_dividend },
  ];

  return (
    <div className="space-y-6">
      {/* Top 10 Holdings Treemap */}
      <Card title="Top 10 Holdings" sub={`${stats.top_10_concentration}% of portfolio`}>
        <ResponsiveContainer width="100%" height={280}>
          <Treemap
            data={treemapData}
            dataKey="size"
            nameKey="name"
            content={<CustomTreemapContent />}
          />
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Stocks vs ETFs */}
        <Card title="Asset Type Split">
          <div className="flex items-center gap-6">
            <ResponsiveContainer width="50%" height={180}>
              <PieChart>
                <Pie data={typeData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={3}>
                  <Cell fill="#3b82f6" />
                  <Cell fill="#8b5cf6" />
                </Pie>
                <Tooltip formatter={(v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} contentStyle={tooltipStyle()} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#3b82f6" }} />
                  <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Stocks ({stats.stock_count})</span>
                </div>
                <div className="text-lg font-bold ml-5" style={{ color: "var(--color-text)" }}>${stats.stock_value.toLocaleString()}</div>
                <div className="text-xs ml-5" style={{ color: "var(--color-text-muted)" }}>{stats.stock_pct}%</div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#8b5cf6" }} />
                  <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>ETFs ({stats.etf_count})</span>
                </div>
                <div className="text-lg font-bold ml-5" style={{ color: "var(--color-text)" }}>${stats.etf_value.toLocaleString()}</div>
                <div className="text-xs ml-5" style={{ color: "var(--color-text-muted)" }}>{stats.etf_pct}%</div>
              </div>
            </div>
          </div>
        </Card>

        {/* Activity Summary */}
        <Card title="May Activity">
          <div className="space-y-4">
            <ActivityRow icon="🛒" label="Total Invested" value={`$${stats.total_invested_this_period.toFixed(2)}`} sub={`${stats.num_buys} buys across ${stats.unique_tickers_bought} tickers`} />
            <ActivityRow icon="💰" label="Dividends Earned" value={`$${stats.total_dividends_this_period.toFixed(2)}`} sub={`${stats.dividend_payers} stocks paying dividends`} />
            <ActivityRow icon="🏦" label="Deposits" value={`$${stats.total_deposits.toFixed(2)}`} sub="Bank + debit card transfers" />
            <ActivityRow icon="💳" label="CC Cashback" value={`$${stats.total_cashback.toFixed(2)}`} sub="Robinhood Credit Card rewards" />
          </div>
        </Card>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MiniCard label="Est. Annual Dividends" value={`$${stats.total_est_annual_dividend.toFixed(2)}`} />
        <MiniCard label="Portfolio Yield" value={`${stats.portfolio_yield}%`} />
        <MiniCard label="DRIP Reinvestments" value={stats.num_drip.toString()} />
        <MiniCard label="Top 10 Concentration" value={`${stats.top_10_concentration}%`} />
      </div>
    </div>
  );
}

/* ==================== HOLDINGS TAB ==================== */

function HoldingsTab({ holdings }) {
  const [sortBy, setSortBy] = useState("market_value");
  const [sortDir, setSortDir] = useState(-1);

  const sorted = [...holdings].sort((a, b) => (a[sortBy] - b[sortBy]) * sortDir);

  const handleSort = (field) => {
    if (sortBy === field) setSortDir(-sortDir);
    else { setSortBy(field); setSortDir(-1); }
  };

  const SortHeader = ({ field, label, align = "right" }) => (
    <th
      className={`pb-3 font-medium cursor-pointer select-none text-${align}`}
      style={{ color: "var(--color-text-muted)" }}
      onClick={() => handleSort(field)}
    >
      {label} {sortBy === field ? (sortDir === -1 ? "↓" : "↑") : ""}
    </th>
  );

  return (
    <Card title={`All Holdings (${holdings.length})`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left pb-3 font-medium" style={{ color: "var(--color-text-muted)" }}>Ticker</th>
              <th className="text-left pb-3 font-medium" style={{ color: "var(--color-text-muted)" }}>Name</th>
              <SortHeader field="qty" label="Shares" />
              <SortHeader field="price" label="Price" />
              <SortHeader field="market_value" label="Value" />
              <SortHeader field="yield_pct" label="Yield" />
              <SortHeader field="pct_of_portfolio" label="Weight" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((h) => (
              <tr key={h.ticker} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ backgroundColor: tickerColor(h.ticker) }}
                    >
                      {h.ticker.slice(0, 2)}
                    </div>
                    <span className="font-semibold" style={{ color: "var(--color-text)" }}>{h.ticker}</span>
                  </div>
                </td>
                <td className="py-2.5 text-xs max-w-[180px] truncate" style={{ color: "var(--color-text-secondary)" }}>
                  {h.name}
                </td>
                <td className="py-2.5 text-right" style={{ color: "var(--color-text)" }}>
                  {h.qty < 1 ? h.qty.toFixed(6) : h.qty.toFixed(2)}
                </td>
                <td className="py-2.5 text-right" style={{ color: "var(--color-text-secondary)" }}>
                  ${h.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="py-2.5 text-right font-medium" style={{ color: "var(--color-text)" }}>
                  ${h.market_value.toFixed(2)}
                </td>
                <td className="py-2.5 text-right" style={{ color: h.yield_pct > 0 ? "var(--color-success, #10b981)" : "var(--color-text-muted)" }}>
                  {h.yield_pct > 0 ? `${h.yield_pct.toFixed(2)}%` : "—"}
                </td>
                <td className="py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-bg-badge)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(h.pct_of_portfolio * 10, 100)}%`, backgroundColor: "var(--color-primary, #3b82f6)" }}
                      />
                    </div>
                    <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{h.pct_of_portfolio}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ==================== TRANSACTIONS TAB ==================== */

function TransactionsTab({ transactions, stats }) {
  const [filter, setFilter] = useState("all");

  const filtered = filter === "all"
    ? transactions
    : transactions.filter((t) => {
        if (filter === "buys") return t.tx_type === "Buy";
        if (filter === "dividends") return t.tx_type === "CDIV";
        if (filter === "deposits") return ["DCF", "RTP"].includes(t.tx_type);
        if (filter === "cashback") return t.tx_type === "XENT_CC";
        return true;
      });

  // Daily investment bar chart
  const dailyInvested = {};
  transactions.filter((t) => t.tx_type === "Buy").forEach((t) => {
    const day = t.date.slice(3, 5); // DD from MM/DD/YYYY
    dailyInvested[day] = (dailyInvested[day] || 0) + (t.debit || 0);
  });
  const barData = Object.entries(dailyInvested)
    .map(([day, amount]) => ({ day: `May ${day}`, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => parseInt(a.day.split(" ")[1]) - parseInt(b.day.split(" ")[1]));

  return (
    <div className="space-y-6">
      {/* Daily Investment Chart */}
      {barData.length > 0 && (
        <Card title="Daily Investment Activity">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="day" tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} />
              <YAxis tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                formatter={(v) => [`$${v.toFixed(2)}`, "Invested"]}
                contentStyle={tooltipStyle()}
              />
              <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Filter Chips */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: "all", label: `All (${transactions.length})` },
          { id: "buys", label: `Buys (${stats.num_buys})` },
          { id: "dividends", label: "Dividends" },
          { id: "deposits", label: "Deposits" },
          { id: "cashback", label: "Cashback" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              backgroundColor: filter === f.id ? "var(--color-primary, #3b82f6)" : "var(--color-bg-badge)",
              color: filter === f.id ? "#fff" : "var(--color-text-secondary)",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Transaction List */}
      <Card>
        <div className="space-y-1">
          {filtered.map((t, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2.5 px-3 rounded-lg"
              style={{ backgroundColor: i % 2 === 0 ? "transparent" : "var(--color-bg-badge)" }}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{txIcon(t.tx_type)}</span>
                <div>
                  <div className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                    {t.description}
                  </div>
                  <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {t.date}
                    {t.qty ? ` · ${t.qty < 1 ? t.qty.toFixed(6) : t.qty.toFixed(2)} shares` : ""}
                    {t.price ? ` @ $${t.price.toFixed(2)}` : ""}
                  </div>
                </div>
              </div>
              <div className="text-right">
                {t.debit > 0 && (
                  <span className="text-sm font-medium" style={{ color: "var(--color-danger, #ef4444)" }}>
                    -${t.debit.toFixed(2)}
                  </span>
                )}
                {t.credit > 0 && (
                  <span className="text-sm font-medium" style={{ color: "var(--color-success, #10b981)" }}>
                    +${t.credit.toFixed(2)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ==================== DIVIDENDS TAB ==================== */

function DividendsTab({ transactions, holdings, stats }) {
  const dividends = transactions.filter((t) => t.tx_type === "CDIV");

  // Group by ticker
  const byTicker = {};
  dividends.forEach((d) => {
    if (!byTicker[d.symbol]) byTicker[d.symbol] = { total: 0, count: 0 };
    byTicker[d.symbol].total += d.credit || 0;
    byTicker[d.symbol].count++;
  });

  const divBarData = Object.entries(byTicker)
    .map(([ticker, info]) => ({ ticker, amount: Math.round(info.total * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);

  // Top dividend yielders from holdings
  const topYielders = [...holdings]
    .filter((h) => h.yield_pct > 0)
    .sort((a, b) => b.yield_pct - a.yield_pct)
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MiniCard label="Dividends This Month" value={`$${stats.total_dividends_this_period.toFixed(2)}`} />
        <MiniCard label="Est. Annual Income" value={`$${stats.total_est_annual_dividend.toFixed(2)}`} />
        <MiniCard label="Portfolio Yield" value={`${stats.portfolio_yield}%`} />
      </div>

      {/* Dividend by Ticker Chart */}
      {divBarData.length > 0 && (
        <Card title="Dividends by Ticker">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={divBarData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis type="number" tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
              <YAxis type="category" dataKey="ticker" tick={{ fill: "var(--color-text)", fontSize: 11 }} width={60} />
              <Tooltip formatter={(v) => [`$${v.toFixed(2)}`, "Dividend"]} contentStyle={tooltipStyle()} />
              <Bar dataKey="amount" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Top Yielders Table */}
      <Card title="Top Dividend Yielders in Portfolio">
        <div className="space-y-2">
          {topYielders.map((h) => (
            <div key={h.ticker} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ backgroundColor: "var(--color-bg-badge)" }}>
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: tickerColor(h.ticker) }}>
                  {h.ticker.slice(0, 2)}
                </div>
                <div>
                  <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{h.ticker}</span>
                  <span className="text-xs ml-2" style={{ color: "var(--color-text-muted)" }}>{h.name}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold" style={{ color: "var(--color-success, #10b981)" }}>{h.yield_pct.toFixed(2)}%</span>
                <span className="text-xs ml-2" style={{ color: "var(--color-text-muted)" }}>${h.est_dividend.toFixed(2)}/yr</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ==================== SHARED COMPONENTS ==================== */

function Card({ title, sub, children }) {
  return (
    <div className="rounded-2xl p-6" style={{ backgroundColor: "var(--color-bg-card)", boxShadow: "var(--shadow-md)" }}>
      {title && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>{title}</h3>
          {sub && <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{sub}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

function StatCard({ icon, label, value, sub }) {
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: "var(--color-bg-card)", boxShadow: "var(--shadow-md)" }}>
      <div className="flex items-center gap-2 mb-1">
        <span>{icon}</span>
        <span className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>{label}</span>
      </div>
      <div className="text-lg font-bold" style={{ color: "var(--color-text)" }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{sub}</div>}
    </div>
  );
}

function MiniCard({ label, value }) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: "var(--color-bg-card)", boxShadow: "var(--shadow-sm)" }}>
      <div className="text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>{label}</div>
      <div className="text-lg font-bold" style={{ color: "var(--color-text)" }}>{value}</div>
    </div>
  );
}

function ActivityRow({ icon, label, value, sub }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-lg">{icon}</span>
        <div>
          <div className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{label}</div>
          <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{sub}</div>
        </div>
      </div>
      <div className="text-sm font-bold" style={{ color: "var(--color-text)" }}>{value}</div>
    </div>
  );
}

function CustomTreemapContent({ x, y, width, height, name, size, fill, pct }) {
  if (width < 30 || height < 25) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={6} fill={fill || "#3b82f6"} stroke="var(--color-bg-card)" strokeWidth={2} />
      {width > 45 && height > 35 && (
        <>
          <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="#fff" fontSize={12} fontWeight="bold">
            {name}
          </text>
          <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={10}>
            ${size?.toFixed(0)}
          </text>
        </>
      )}
    </g>
  );
}

/* ---- Helpers ---- */

function tooltipStyle() {
  return {
    backgroundColor: "var(--color-bg-card)",
    border: "1px solid var(--color-border)",
    borderRadius: "0.5rem",
    color: "var(--color-text)",
    boxShadow: "var(--shadow-sm)",
  };
}

function txIcon(type) {
  const icons = { Buy: "🛒", CDIV: "💰", DCF: "🏦", RTP: "🏦", XENT_CC: "💳", COIN: "🪙", ITRF: "🔄" };
  return icons[type] || "📝";
}

function tickerColor(ticker) {
  const colors = ["#3b82f6", "#8b5cf6", "#ec4899", "#ef4444", "#f59e0b", "#10b981", "#06b6d4", "#6366f1", "#d946ef", "#14b8a6"];
  let hash = 0;
  for (let i = 0; i < ticker.length; i++) hash = ticker.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default RobinhoodReport;
