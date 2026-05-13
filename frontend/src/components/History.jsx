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
        <div className="text-gray-500">Loading history...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Toast */}
      {message && (
        <div
          className={`fixed top-4 right-4 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 ${
            message.type === "success"
              ? "bg-green-100 text-green-800 border border-green-200"
              : "bg-red-100 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Save Snapshot Button */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Record Monthly Snapshot
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Save your current balances and allocation to track progress over
              time. Do this once a month after updating your balances.
            </p>
          </div>
          <button
            onClick={saveSnapshot}
            disabled={saving}
            className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0"
          >
            {saving ? "Saving..." : "Save Snapshot"}
          </button>
        </div>
        {runs.length > 0 && (
          <p className="text-xs text-gray-400 mt-3">
            Last snapshot: {runs[0].run_date} ({runs.length} total)
          </p>
        )}
      </div>

      {/* Net Worth Chart */}
      {netWorth.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Net Worth Over Time
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={netWorth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
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
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Balance Trends
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={balanceChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
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
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
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
          <div className="text-sm text-gray-500 mb-4">
            Total interest you'll pay: ₹
            {Math.round(loanProjection.total_interest_paid).toLocaleString()}
          </div>

          {/* Payoff curve */}
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart
              data={loanProjection.monthly_breakdown.filter(
                (_, i) => i % 3 === 0 || i === loanProjection.monthly_breakdown.length - 1
              )}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
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
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
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
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-green-500 h-4 rounded-full transition-all"
                style={{
                  width: `${Math.min(efProjection.percentage || 0, 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {netWorth.length === 0 && !loanProjection && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="text-4xl mb-4">📊</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No history yet
          </h3>
          <p className="text-gray-500 max-w-md mx-auto">
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
    <div className={`p-4 rounded-lg ${highlight ? "bg-blue-50" : "bg-gray-50"}`}>
      <div className="text-xs text-gray-500 uppercase tracking-wide">
        {label}
      </div>
      <div
        className={`text-lg font-bold mt-1 ${
          highlight ? "text-blue-700" : "text-gray-900"
        }`}
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
