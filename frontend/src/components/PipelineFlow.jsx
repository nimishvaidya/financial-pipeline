import { useState, useEffect, useRef } from "react";

/**
 * Sankey-style flow diagram showing money flowing from
 * Income → Categories (Fixed / Allocation) → Individual items
 *
 * Inspired by Monarch Money's cash flow visualization.
 */

const CATEGORY_COLORS = {
  income: "#3b82f6",
  fixed: "#f59e0b",
  allocation: "#10b981",
  // Individual items
  rent: "#ef4444",
  car_payment: "#f97316",
  electricity: "#eab308",
  internet: "#a3e635",
  groceries: "#fb923c",
  edu_loan: "#e11d48",
  car_loan: "#f59e0b",
  emergency_fund: "#06b6d4",
  investing: "#8b5cf6",
};

function getColor(name) {
  return CATEGORY_COLORS[name] || "#94a3b8";
}

function PipelineFlow({ data }) {
  const svgRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 900, height: 500 });
  const [animated, setAnimated] = useState(false);
  const [hoveredNode, setHoveredNode] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    function handleResize() {
      if (svgRef.current) {
        const w = svgRef.current.parentElement.clientWidth;
        setDimensions({ width: w, height: Math.max(450, w * 0.5) });
      }
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!data) return null;

  const {
    total_income,
    total_fixed_expenses,
    remainder_for_buckets,
    allocations,
    transfer_instructions,
    emergency_fund_status,
  } = data;

  const fixedExpenses = transfer_instructions.filter(
    (t) => t.notes === "Fixed monthly expense"
  );

  const savingsRate = ((remainder_for_buckets / total_income) * 100).toFixed(1);

  // Build Sankey data
  const { width, height } = dimensions;
  const padding = { top: 20, bottom: 20, left: 30, right: 30 };
  const colWidth = 140;
  const nodeHeight = 24;
  const cols = [
    padding.left,
    padding.left + (width - padding.left - padding.right - colWidth) * 0.33,
    padding.left + (width - padding.left - padding.right - colWidth) * 0.66,
    width - padding.right - colWidth,
  ];

  // Column 0: Income source
  const incomeNode = {
    id: "income",
    label: "Income",
    value: total_income,
    x: cols[0],
    color: getColor("income"),
  };

  // Column 1: Total income passes through
  const totalNode = {
    id: "total",
    label: "Total",
    value: total_income,
    x: cols[1],
    color: getColor("income"),
  };

  // Column 2: Categories
  const fixedNode = {
    id: "fixed_expenses",
    label: "Fixed Expenses",
    value: total_fixed_expenses,
    x: cols[2],
    color: getColor("fixed"),
  };
  const allocNode = {
    id: "allocations",
    label: "Allocations",
    value: remainder_for_buckets,
    x: cols[2],
    color: getColor("allocation"),
  };

  // Column 3: Individual items
  const fixedItems = fixedExpenses.map((e) => ({
    id: e.destination,
    label: e.destination.replace(/_/g, " "),
    value: e.amount,
    x: cols[3],
    color: getColor(e.destination),
  }));

  const allocItems = allocations.map((a) => ({
    id: a.bucket_name,
    label: a.bucket_name.replace(/_/g, " "),
    value: a.amount,
    x: cols[3],
    color: getColor(a.bucket_name),
    converted: a.converted_amount
      ? `₹${a.converted_amount.toLocaleString()}`
      : null,
    pct: `${a.percentage_used}%`,
  }));

  // Calculate Y positions
  const usableHeight = height - padding.top - padding.bottom;
  const scale = usableHeight / total_income;

  // Column 0 & 1: single nodes centered
  incomeNode.y = padding.top;
  incomeNode.h = total_income * scale;
  totalNode.y = padding.top;
  totalNode.h = total_income * scale;

  // Column 2: stacked
  fixedNode.y = padding.top;
  fixedNode.h = total_fixed_expenses * scale;
  allocNode.y = padding.top + fixedNode.h + 8;
  allocNode.h = remainder_for_buckets * scale;

  // Column 3: individual items stacked within their category
  let yFixed = fixedNode.y;
  fixedItems.forEach((item) => {
    item.y = yFixed;
    item.h = Math.max(item.value * scale, 18);
    yFixed += item.h + 3;
  });

  let yAlloc = allocNode.y;
  allocItems.forEach((item) => {
    item.y = yAlloc;
    item.h = Math.max(item.value * scale, 18);
    yAlloc += item.h + 3;
  });

  // Links
  const links = [];

  // Income → Total
  links.push({
    from: incomeNode,
    to: totalNode,
    value: total_income,
    color: incomeNode.color,
    fromY: incomeNode.y,
    toY: totalNode.y,
  });

  // Total → Fixed
  links.push({
    from: totalNode,
    to: fixedNode,
    value: total_fixed_expenses,
    color: fixedNode.color,
    fromY: totalNode.y,
    toY: fixedNode.y,
  });

  // Total → Allocation
  links.push({
    from: totalNode,
    to: allocNode,
    value: remainder_for_buckets,
    color: allocNode.color,
    fromY: totalNode.y + total_fixed_expenses * scale,
    toY: allocNode.y,
  });

  // Fixed → individual
  fixedItems.forEach((item) => {
    links.push({
      from: fixedNode,
      to: item,
      value: item.value,
      color: item.color,
      fromY: item.y,
      toY: item.y,
    });
  });

  // Allocation → individual
  allocItems.forEach((item) => {
    links.push({
      from: allocNode,
      to: item,
      value: item.value,
      color: item.color,
      fromY: item.y - allocNode.y + allocNode.y,
      toY: item.y,
    });
  });

  function makeLinkPath(link) {
    const x0 = link.from.x + colWidth;
    const x1 = link.to.x;
    const h = link.value * scale;
    const y0 = link.fromY;
    const y1 = link.toY;
    const mx = (x0 + x1) / 2;

    return `
      M ${x0} ${y0}
      C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}
      L ${x1} ${y1 + Math.max(h, 2)}
      C ${mx} ${y1 + Math.max(h, 2)}, ${mx} ${y0 + Math.max(h, 2)}, ${x0} ${y0 + Math.max(h, 2)}
      Z
    `;
  }

  const allNodes = [
    incomeNode,
    totalNode,
    fixedNode,
    allocNode,
    ...fixedItems,
    ...allocItems,
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="TOTAL INCOME"
          value={`$${total_income.toLocaleString()}`}
          color="var(--color-primary)"
        />
        <SummaryCard
          label="TOTAL EXPENSES"
          value={`$${total_fixed_expenses.toLocaleString()}`}
          color="var(--color-danger)"
        />
        <SummaryCard
          label="TOTAL ALLOCATED"
          value={`$${remainder_for_buckets.toLocaleString()}`}
          color="var(--color-success)"
        />
        <SummaryCard
          label="ALLOCATION RATE"
          value={`${savingsRate}%`}
          color="var(--color-chart-5)"
        />
      </div>

      {/* Sankey Diagram */}
      <div
        className="rounded-2xl p-6 overflow-hidden"
        style={{
          backgroundColor: "var(--color-bg-card)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-lg font-bold"
            style={{ color: "var(--color-text)" }}
          >
            Cash Flow
          </h2>
          <div
            className="text-xs font-medium px-3 py-1 rounded-full"
            style={{
              backgroundColor: "var(--color-bg-badge)",
              color: "var(--color-text-secondary)",
            }}
          >
            {data.run_date}
          </div>
        </div>

        <svg
          ref={svgRef}
          width="100%"
          viewBox={`0 0 ${width} ${height}`}
          style={{ overflow: "visible" }}
        >
          {/* Links */}
          {links.map((link, i) => (
            <path
              key={i}
              d={makeLinkPath(link)}
              fill={link.color}
              opacity={
                hoveredNode
                  ? hoveredNode === link.from.id || hoveredNode === link.to.id
                    ? 0.4
                    : 0.08
                  : 0.25
              }
              style={{
                transition: "opacity 0.3s, d 1s",
              }}
            />
          ))}

          {/* Nodes */}
          {allNodes.map((node) => (
            <g
              key={node.id}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: "pointer" }}
            >
              <rect
                x={node.x}
                y={node.y}
                width={colWidth}
                height={Math.max(node.h || 20, 20)}
                rx={6}
                fill={node.color}
                opacity={hoveredNode === node.id ? 1 : 0.85}
                style={{ transition: "opacity 0.2s" }}
              />
              {/* Label */}
              {(node.h || 20) >= 18 && (
                <>
                  <text
                    x={node.x + colWidth / 2}
                    y={node.y + Math.max(node.h || 20, 20) / 2 - 6}
                    textAnchor="middle"
                    fill="white"
                    fontSize="11"
                    fontWeight="600"
                    style={{ textTransform: "capitalize", pointerEvents: "none" }}
                  >
                    {node.label}
                  </text>
                  <text
                    x={node.x + colWidth / 2}
                    y={node.y + Math.max(node.h || 20, 20) / 2 + 8}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.85)"
                    fontSize="10"
                    fontWeight="500"
                    style={{ pointerEvents: "none" }}
                  >
                    ${node.value.toLocaleString()}
                    {node.pct ? ` (${node.pct})` : ""}
                  </text>
                </>
              )}
            </g>
          ))}
        </svg>
      </div>

      {/* Emergency Fund Status */}
      {emergency_fund_status && (
        <div
          className="rounded-2xl p-6"
          style={{
            backgroundColor: "var(--color-bg-card)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <h3
            className="text-sm font-bold uppercase tracking-wider mb-2"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Emergency Fund
          </h3>
          <p className="text-sm" style={{ color: "var(--color-text)" }}>
            {emergency_fund_status}
          </p>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        backgroundColor: "var(--color-bg-card)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        className="text-2xl font-bold mb-1"
        style={{ color }}
      >
        {value}
      </div>
      <div
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </div>
    </div>
  );
}

export default PipelineFlow;
