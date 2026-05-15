import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import IncomeTimeline from "./IncomeTimeline";
import RecurringExpenses from "./RecurringExpenses";

const COLORS = ["#ef4444", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899"];

function Dashboard({ data, onRefresh }) {
  const { allocations, transfer_instructions, emergency_fund_status } = data;

  // Extract fixed expenses for the RecurringExpenses component
  const fixedExpenses = transfer_instructions
    .filter((t) => t.notes === "Fixed monthly expense")
    .map((t) => ({
      name: t.destination,
      amount: t.amount,
      currency: "USD",
    }));

  // Prepare pie chart data
  const chartData = allocations.map((a) => ({
    name: a.bucket_name.replace(/_/g, " "),
    value: a.amount,
    percentage: a.percentage_used,
  }));

  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SummaryCard
          label="Total Income"
          value={`$${data.total_income.toLocaleString()}`}
          sub="Monthly take-home"
        />
        <SummaryCard
          label="Fixed Expenses"
          value={`$${data.total_fixed_expenses.toLocaleString()}`}
          sub={`${((data.total_fixed_expenses / data.total_income) * 100).toFixed(0)}% of income`}
        />
        <SummaryCard
          label="Available for Allocation"
          value={`$${data.remainder_for_buckets.toLocaleString()}`}
          sub="After fixed expenses"
          highlight
        />
      </div>

      {/* Allocation Chart + List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div
          className="rounded-2xl p-6"
          style={{
            backgroundColor: "var(--color-bg-card)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <h2
            className="text-lg font-semibold mb-4"
            style={{ color: "var(--color-text)" }}
          >
            Allocation Split
          </h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={110}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => `$${value.toLocaleString()}`}
                contentStyle={{
                  backgroundColor: "var(--color-bg-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "0.5rem",
                  color: "var(--color-text)",
                  boxShadow: "var(--shadow-sm)",
                }}
                labelStyle={{ color: "var(--color-text)" }}
                itemStyle={{ color: "var(--color-text-secondary)" }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-4 justify-center">
            {chartData.map((item, index) => (
              <div key={item.name} className="flex items-center gap-2 text-sm">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="capitalize" style={{ color: "var(--color-text-secondary)" }}>
                  {item.name}
                </span>
                <span style={{ color: "var(--color-text-muted)" }}>
                  ({item.percentage}%)
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Allocation Details */}
        <div
          className="rounded-2xl p-6"
          style={{
            backgroundColor: "var(--color-bg-card)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <h2
            className="text-lg font-semibold mb-4"
            style={{ color: "var(--color-text)" }}
          >
            Bucket Breakdown
          </h2>
          <div className="space-y-4">
            {allocations.map((alloc, i) => (
              <div key={alloc.bucket_name} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <div>
                    <div
                      className="text-sm font-medium capitalize"
                      style={{ color: "var(--color-text)" }}
                    >
                      {alloc.bucket_name.replace(/_/g, " ")}
                    </div>
                    <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                      {alloc.description}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className="text-sm font-semibold"
                    style={{ color: "var(--color-text)" }}
                  >
                    ${alloc.amount.toLocaleString()}
                  </div>
                  {alloc.converted_amount && (
                    <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                      ≈ ₹{alloc.converted_amount.toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Emergency Fund Status */}
          {emergency_fund_status && (
            <div
              className="mt-6 pt-4 border-t"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div
                className="text-xs uppercase tracking-wide mb-1"
                style={{ color: "var(--color-text-muted)" }}
              >
                Emergency Fund
              </div>
              <div className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                {emergency_fund_status}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Income Timeline */}
      <IncomeTimeline
        salaryAmount={data.total_income}
        payday={1}
        currency="USD"
      />

      {/* Recurring Expenses */}
      <RecurringExpenses expenses={fixedExpenses} />

      {/* Transfer Instructions */}
      <div
        className="rounded-2xl p-6"
        style={{
          backgroundColor: "var(--color-bg-card)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Transfer Instructions
          </h2>
          <button
            onClick={onRefresh}
            className="text-sm font-medium transition-colors"
            style={{ color: "var(--color-primary)" }}
            onMouseEnter={(e) => (e.target.style.color = "var(--color-primary-hover)")}
            onMouseLeave={(e) => (e.target.style.color = "var(--color-primary)")}
          >
            Recalculate
          </button>
        </div>
        <div className="space-y-3">
          {transfer_instructions.map((inst) => (
            <div
              key={inst.step}
              className="flex items-start gap-4 p-3 rounded-lg"
              style={{ backgroundColor: "var(--color-bg-badge)" }}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                style={{
                  backgroundColor: "var(--color-primary-light)",
                  color: "var(--color-primary-text)",
                }}
              >
                {inst.step}
              </div>
              <div>
                <div
                  className="text-sm font-medium"
                  style={{ color: "var(--color-text)" }}
                >
                  {inst.action}
                </div>
                {inst.notes && (
                  <div
                    className="text-xs mt-0.5"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {inst.notes}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, highlight = false }) {
  return (
    <div
      className="rounded-2xl p-6"
      style={{
        backgroundColor: highlight ? "var(--color-primary-light)" : "var(--color-bg-card)",
        boxShadow: "var(--shadow-md)",
        border: highlight ? "1px solid var(--color-primary-light)" : "none",
      }}
    >
      <div
        className="text-sm"
        style={{ color: highlight ? "var(--color-primary-text)" : "var(--color-text-secondary)" }}
      >
        {label}
      </div>
      <div
        className="text-2xl font-bold mt-1"
        style={{ color: highlight ? "var(--color-primary-text)" : "var(--color-text)" }}
      >
        {value}
      </div>
      <div
        className="text-xs mt-1"
        style={{ color: highlight ? "var(--color-primary-text)" : "var(--color-text-muted)" }}
      >
        {sub}
      </div>
    </div>
  );
}

export default Dashboard;
