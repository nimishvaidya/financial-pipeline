import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

function History() {
  const [netWorth, setNetWorth] = useState([]);
  const [balanceHistory, setBalanceHistory] = useState([]);
  const [loanProjection, setLoanProjection] = useState(null);
  const [efProjection, setEfProjection] = useState(null);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const [nwRes, balRes, runsRes, loanRes, efRes] = await Promise.all([
        fetch("/api/history/net-worth"),
        fetch("/api/history/balances"),
        fetch("/api/history/runs"),
        fetch("/api/projections/loan/edu_loan").catch(() => null),
        fetch("/api/projections/emergency-fund").catch(() => null),
      ]);

      setNetWorth(await nwRes.json());
      setBalanceHistory(await balRes.json());
      setRuns(await runsRes.json());

      if (loanRes?.ok) setLoanProjection(await loanRes.json());
      if (efRes?.ok) setEfProjection(await efRes.json());
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setLoading(false);
    }
  }

  async function saveSnapshot() {
    setSaving(true);
    try {
      const res = await fetch("/api/run", { method: "POST" });
      if (res.ok) {
        setMessage({ type: "success", text: "Snapshot saved!" });
        setTimeout(() => setMessage(null), 3000);
        fetchAll(); // Refresh data
      }
    } catch {
      setMessage({ type: "error", text: "Failed to save snapshot" });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  }

  // Group balance history by date for the chart
  const balanceChartData = groupBalancesByDate(balanceHistory);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div style={{ color: "var(--color-text-secondary)" }}>Loading history...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Toast */}
      {message && (
        <div
          className="fixed top-4 right-4 px-4 py-3 rounded-lg text-sm font-medium z-50"
          style={{
            background:
              message.type === "success"
                ? "var(--color-success-light)"
                : "var(--color-danger-light)",
            color:
              message.type === "success"
                ? "var(--color-success)"
                : "var(--color-danger)",
            border: `1px solid ${
              message.type === "success"
                ? "var(--color-success)"
                : "var(--color-danger)"
            }`,
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {message.text}
        </div>
      )}

      {/* Save Snapshot Button */}
      <div
        className="rounded-2xl p-6"
        style={{
          background: "var(--color-bg-card)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--color-text)" }}
            >
              Record Monthly Snapshot
            </h2>
            <p
              className="text-sm mt-1"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Save your current balances and allocation to track progress over
              time. Do this once a month after updating your balances.
            </p>
          </div>
          <button
            onClick={saveSnapshot}
            disabled={saving}
            className="px-6 py-3 font-medium rounded-lg disabled:opacity-50 shrink-0"
            style={{
              background: "var(--color-primary)",
              color: "#fff",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--color-primary-hover)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "var(--color-primary)")
            }
          >
            {saving ? "Saving..." : "Save Snapshot"}
          </button>
        </div>
        {runs.length > 0 && (
          <p
            className="text-xs mt-3"
            style={{ color: "var(--color-text-muted)" }}
          >
            Last snapshot: {runs[0].run_date} ({runs.length} total)
          </p>
        )}
      </div>

      {/* Net Worth Chart */}
      {netWorth.length > 0 && (
        <div
          className="rounded-2xl p-6"
          style={{
            background: "var(--color-bg-card)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <h2
            className="text-lg font-semibold mb-4"
            style={{ color: "var(--color-text)" }}
          >
            Net Worth Over Time
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={netWorth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="run_date"
                tick={{ fontSize: 12 }}
                tickFormatter={(d) => formatDate(d)}
              />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={formatCurrency} />
              <Tooltip
                formatter={(v) => `$${Number(v).toLocaleString()}`}
                labelFormatter={(l) => `Date: ${l}`}
              />
              <Area
                type="monotone"
                dataKey="net_worth"
                stroke="#3b82f6"
                fill="#dbeafe"
                name="Net Worth"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Balance History Chart */}
      {balanceChartData.length > 0 && (
        <div
          className="rounded-2xl p-6"
          style={{
            background: "var(--color-bg-card)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <h2
            className="text-lg font-semibold mb-4"
            style={{ color: "var(--color-text)" }}
          >
            Balance Trends
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={balanceChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickFormatter={(d) => formatDate(d)}
              />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={formatCurrency} />
              <Tooltip
                formatter={(v) => `$${Number(v).toLocaleString()}`}
                labelFormatter={(l) => `Date: ${l}`}
              />
              <Legend />
              {getAccountNames(balanceHistory).map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name={name.replace(/_/g, " ")}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Loan Payoff Projection */}
      {loanProjection && (
        <div
          className="rounded-2xl p-6"
          style={{
            background: "var(--color-bg-card)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <h2
            className="text-lg font-semibold mb-2"
            style={{ color: "var(--color-text)" }}
          >
            Education Loan Payoff Projection
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="Current Balance"
              value={`₹${(loanProjection.current_balance / 100000).toFixed(1)}L`}
            />
            <StatCard
              label="Monthly Payment"
              value={`₹${Math.round(loanProjection.monthly_payment).toLocaleString()}`}
            />
            <StatCard
              label="Months Remaining"
              value={loanProjection.months_remaining}
            />
            <StatCard
              label="Payoff Date"
              value={formatDate(loanProjection.payoff_date)}
              highlight
            />
          </div>
          <div
            className="text-sm mb-4"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Total interest you'll pay: ₹
            {Math.round(loanProjection.total_interest_paid).toLocaleString()}
          </div>

          {/* Payoff curve */}
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart
              data={loanProjection.monthly_breakdown.filter(
                (_, i) =>
                  i % 3 === 0 ||
                  i === loanProjection.monthly_breakdown.length - 1
              )}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(d) => formatDate(d)}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`}
              />
              <Tooltip
                formatter={(v) => `₹${Number(v).toLocaleString()}`}
                labelFormatter={(l) => l}
              />
              <Area
                type="monotone"
                dataKey="balance"
                stroke="#ef4444"
                fill="#fee2e2"
                name="Remaining Balance"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Emergency Fund Projection */}
      {efProjection && (
        <div
          className="rounded-2xl p-6"
          style={{
            background: "var(--color-bg-card)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <h2
            className="text-lg font-semibold mb-4"
            style={{ color: "var(--color-text)" }}
          >
            Emergency Fund Projection
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Current"
              value={`$${efProjection.current.toLocaleString()}`}
            />
            <StatCard
              label="Target"
              value={`$${efProjection.target.toLocaleString()}`}
            />
            <StatCard
              label="Progress"
              value={
                efProjection.status === "complete"
                  ? "100%"
                  : `${efProjection.percentage || 0}%`
              }
            />
            <StatCard
              label="Target Date"
              value={
                efProjection.status === "complete"
                  ? "Done!"
                  : formatDate(efProjection.target_date)
              }
              highlight
            />
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div
              className="w-full rounded-full h-4"
              style={{ background: "var(--color-bg-badge)" }}
            >
              <div
                className="h-4 rounded-full transition-all"
                style={{
                  width: `${Math.min(efProjection.percentage || 0, 100)}%`,
                  background: "var(--color-success)",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {netWorth.length === 0 && !loanProjection && (
        <div
          className="rounded-2xl p-12 text-center"
          style={{
            background: "var(--color-bg-card)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <div className="text-4xl mb-4">📊</div>
          <h3
            className="text-lg font-semibold mb-2"
            style={{ color: "var(--color-text)" }}
          >
            No history yet
          </h3>
          <p
            className="max-w-md mx-auto"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Click "Save Snapshot" above to record your first data point. Come
            back each month to track your progress — you'll see your loan
            shrinking and savings growing over time.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight = false }) {
  return (
    <div
      className="p-4 rounded-xl"
      style={{
        background: highlight
          ? "var(--color-primary-light)"
          : "var(--color-bg-badge)",
      }}
    >
      <div
        className="text-xs uppercase tracking-wide"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {label}
      </div>
      <div
        className="text-lg font-bold mt-1"
        style={{
          color: highlight ? "var(--color-primary-text)" : "var(--color-text)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// --- Helpers ---

const CHART_COLORS = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"];

function formatDate(dateStr) {
  if (!dateStr || dateStr === "N/A") return dateStr;
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatCurrency(value) {
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(0)}k`;
  }
  return `$${value}`;
}

function getAccountNames(history) {
  return [...new Set(history.map((h) => h.account_name))];
}

function groupBalancesByDate(history) {
  const grouped = {};
  for (const item of history) {
    if (!grouped[item.run_date]) {
      grouped[item.run_date] = { date: item.run_date };
    }
    // Convert INR to USD for consistent charting
    let amount = item.amount;
    if (item.currency === "INR") {
      amount = amount / 83.5;
    }
    grouped[item.run_date][item.account_name] = Math.round(amount);
  }
  return Object.values(grouped);
}

export default History;
