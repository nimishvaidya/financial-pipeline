import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["#ef4444", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899"];

function Dashboard({ data, onRefresh }) {
  const { allocations, transfer_instructions, emergency_fund_status } = data;

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
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
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
                <span className="text-gray-600 capitalize">{item.name}</span>
                <span className="text-gray-400">({item.percentage}%)</span>
              </div>
            ))}
          </div>
        </div>

        {/* Allocation Details */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
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
                    <div className="text-sm font-medium text-gray-900 capitalize">
                      {alloc.bucket_name.replace(/_/g, " ")}
                    </div>
                    <div className="text-xs text-gray-500">{alloc.description}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-900">
                    ${alloc.amount.toLocaleString()}
                  </div>
                  {alloc.converted_amount && (
                    <div className="text-xs text-gray-500">
                      ≈ ₹{alloc.converted_amount.toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Emergency Fund Status */}
          {emergency_fund_status && (
            <div className="mt-6 pt-4 border-t border-gray-100">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                Emergency Fund
              </div>
              <div className="text-sm text-gray-700">{emergency_fund_status}</div>
            </div>
          )}
        </div>
      </div>

      {/* Transfer Instructions */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Transfer Instructions
          </h2>
          <button
            onClick={onRefresh}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Recalculate
          </button>
        </div>
        <div className="space-y-3">
          {transfer_instructions.map((inst) => (
            <div
              key={inst.step}
              className="flex items-start gap-4 p-3 rounded-lg bg-gray-50"
            >
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold shrink-0">
                {inst.step}
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {inst.action}
                </div>
                {inst.notes && (
                  <div className="text-xs text-gray-500 mt-0.5">
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
      className={`rounded-lg shadow p-6 ${
        highlight ? "bg-blue-50 border border-blue-200" : "bg-white"
      }`}
    >
      <div className="text-sm text-gray-500">{label}</div>
      <div
        className={`text-2xl font-bold mt-1 ${
          highlight ? "text-blue-700" : "text-gray-900"
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-gray-400 mt-1">{sub}</div>
    </div>
  );
}

export default Dashboard;
