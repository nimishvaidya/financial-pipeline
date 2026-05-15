import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Sankey-style flow diagram showing money flowing from
 * Income → Categories (Fixed / Allocation) → Individual items
 *
 * Features: zoom (wheel/pinch), pan (drag), zoom controls (+/−/reset)
 * Inspired by Monarch Money's cash flow visualization.
 */

const CATEGORY_COLORS = {
  income: "#3b82f6",
  fixed: "#f59e0b",
  allocation: "#10b981",
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
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 600 });
  const [hoveredNode, setHoveredNode] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  // Zoom & pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const MIN_ZOOM = 0.4;
  const MAX_ZOOM = 3;

  useEffect(() => {
    function handleResize() {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        setDimensions({ width: Math.max(w, 800), height: Math.max(500, w * 0.5) });
      }
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Wheel zoom — zooms toward cursor position
  const handleWheel = useCallback(
    (e) => {
      e.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * delta));
      const scale = newZoom / zoom;

      setPan((prev) => ({
        x: mouseX - scale * (mouseX - prev.x),
        y: mouseY - scale * (mouseY - prev.y),
      }));
      setZoom(newZoom);
    },
    [zoom]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // Pan handlers
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const handleMouseMove = (e) => {
    if (!isPanning) return;
    setPan({
      x: panStart.current.panX + (e.clientX - panStart.current.x),
      y: panStart.current.panY + (e.clientY - panStart.current.y),
    });
  };

  const handleMouseUp = () => setIsPanning(false);

  useEffect(() => {
    if (isPanning) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isPanning]);

  // Touch support for mobile pinch-zoom and pan
  const lastTouchDist = useRef(null);
  const lastTouchCenter = useRef(null);

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist.current = Math.sqrt(dx * dx + dy * dy);
      lastTouchCenter.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    } else if (e.touches.length === 1) {
      setIsPanning(true);
      panStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        panX: pan.x,
        panY: pan.y,
      };
    }
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
    if (e.touches.length === 2 && lastTouchDist.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist / lastTouchDist.current;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * scale));

      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = cx - rect.left;
      const mouseY = cy - rect.top;
      const s = newZoom / zoom;

      setPan((prev) => ({
        x: mouseX - s * (mouseX - prev.x),
        y: mouseY - s * (mouseY - prev.y),
      }));
      setZoom(newZoom);
      lastTouchDist.current = dist;
    } else if (e.touches.length === 1 && isPanning) {
      setPan({
        x: panStart.current.panX + (e.touches[0].clientX - panStart.current.x),
        y: panStart.current.panY + (e.touches[0].clientY - panStart.current.y),
      });
    }
  };

  const handleTouchEnd = () => {
    lastTouchDist.current = null;
    lastTouchCenter.current = null;
    setIsPanning(false);
  };

  // Zoom controls
  const zoomIn = () => {
    const newZoom = Math.min(MAX_ZOOM, zoom * 1.25);
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const s = newZoom / zoom;
    setPan((prev) => ({
      x: cx - s * (cx - prev.x),
      y: cy - s * (cy - prev.y),
    }));
    setZoom(newZoom);
  };

  const zoomOut = () => {
    const newZoom = Math.max(MIN_ZOOM, zoom / 1.25);
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const s = newZoom / zoom;
    setPan((prev) => ({
      x: cx - s * (cx - prev.x),
      y: cy - s * (cy - prev.y),
    }));
    setZoom(newZoom);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

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

  // --- Build Sankey layout ---
  // Use a fixed internal canvas size for the diagram (independent of container)
  const canvasW = 1100;
  const canvasH = 580;
  const padding = { top: 30, bottom: 30, left: 40, right: 40 };
  const colWidth = 150;
  const gap = 6;

  const cols = [
    padding.left,
    padding.left + (canvasW - padding.left - padding.right - colWidth) * 0.35,
    padding.left + (canvasW - padding.left - padding.right - colWidth) * 0.65,
    canvasW - padding.right - colWidth,
  ];

  // Column 0: Income
  const incomeNode = {
    id: "income",
    label: "Income",
    value: total_income,
    x: cols[0],
    color: getColor("income"),
  };

  // Column 1: Total
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

  // Y positions
  const usableHeight = canvasH - padding.top - padding.bottom;
  const scale = usableHeight / total_income;

  incomeNode.y = padding.top;
  incomeNode.h = total_income * scale;
  totalNode.y = padding.top;
  totalNode.h = total_income * scale;

  fixedNode.y = padding.top;
  fixedNode.h = total_fixed_expenses * scale;
  allocNode.y = padding.top + fixedNode.h + 10;
  allocNode.h = remainder_for_buckets * scale;

  let yFixed = fixedNode.y;
  fixedItems.forEach((item) => {
    item.y = yFixed;
    item.h = Math.max(item.value * scale, 24);
    yFixed += item.h + gap;
  });

  let yAlloc = allocNode.y;
  allocItems.forEach((item) => {
    item.y = yAlloc;
    item.h = Math.max(item.value * scale, 24);
    yAlloc += item.h + gap;
  });

  // Links
  const links = [];
  links.push({
    from: incomeNode,
    to: totalNode,
    value: total_income,
    color: incomeNode.color,
    fromY: incomeNode.y,
    toY: totalNode.y,
  });
  links.push({
    from: totalNode,
    to: fixedNode,
    value: total_fixed_expenses,
    color: fixedNode.color,
    fromY: totalNode.y,
    toY: fixedNode.y,
  });
  links.push({
    from: totalNode,
    to: allocNode,
    value: remainder_for_buckets,
    color: allocNode.color,
    fromY: totalNode.y + total_fixed_expenses * scale,
    toY: allocNode.y,
  });

  let fromYFixed = fixedNode.y;
  fixedItems.forEach((item) => {
    links.push({
      from: fixedNode,
      to: item,
      value: item.value,
      color: item.color,
      fromY: fromYFixed,
      toY: item.y,
    });
    fromYFixed += item.value * scale;
  });

  let fromYAlloc = allocNode.y;
  allocItems.forEach((item) => {
    links.push({
      from: allocNode,
      to: item,
      value: item.value,
      color: item.color,
      fromY: fromYAlloc,
      toY: item.y,
    });
    fromYAlloc += item.value * scale;
  });

  function makeLinkPath(link) {
    const x0 = link.from.x + colWidth;
    const x1 = link.to.x;
    const h = Math.max(link.value * scale, 2);
    const y0 = link.fromY;
    const y1 = link.toY;
    const mx = (x0 + x1) / 2;

    return `
      M ${x0} ${y0}
      C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}
      L ${x1} ${y1 + h}
      C ${mx} ${y1 + h}, ${mx} ${y0 + h}, ${x0} ${y0 + h}
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

  // Node hover tooltip
  function handleNodeEnter(node, e) {
    setHoveredNode(node.id);
    const rect = containerRef.current.getBoundingClientRect();
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 10,
      label: node.label,
      value: node.value,
      pct: node.pct,
      converted: node.converted,
    });
  }

  function handleNodeMove(e) {
    if (!tooltip) return;
    const rect = containerRef.current.getBoundingClientRect();
    setTooltip((prev) => ({
      ...prev,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 10,
    }));
  }

  function handleNodeLeave() {
    setHoveredNode(null);
    setTooltip(null);
  }

  const zoomPct = Math.round(zoom * 100);

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
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--color-bg-card)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2
            className="text-lg font-bold"
            style={{ color: "var(--color-text)" }}
          >
            Cash Flow
          </h2>
          <div className="flex items-center gap-3">
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
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-2 px-6 pb-3">
          <button
            onClick={zoomOut}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-colors"
            style={{
              backgroundColor: "var(--color-bg-badge)",
              color: "var(--color-text-secondary)",
            }}
            title="Zoom out"
          >
            −
          </button>
          <div
            className="text-xs font-medium px-2 min-w-[48px] text-center"
            style={{ color: "var(--color-text-muted)" }}
          >
            {zoomPct}%
          </div>
          <button
            onClick={zoomIn}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-colors"
            style={{
              backgroundColor: "var(--color-bg-badge)",
              color: "var(--color-text-secondary)",
            }}
            title="Zoom in"
          >
            +
          </button>
          <button
            onClick={resetView}
            className="h-8 px-3 rounded-lg flex items-center justify-center text-xs font-medium transition-colors"
            style={{
              backgroundColor: "var(--color-bg-badge)",
              color: "var(--color-text-secondary)",
            }}
            title="Reset zoom"
          >
            Reset
          </button>
          <div
            className="text-xs ml-auto"
            style={{ color: "var(--color-text-muted)" }}
          >
            Scroll to zoom · Drag to pan
          </div>
        </div>

        {/* Zoomable/pannable SVG container */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            position: "relative",
            overflow: "hidden",
            cursor: isPanning ? "grabbing" : "grab",
            height: `${Math.min(dimensions.height, 560)}px`,
            touchAction: "none",
            userSelect: "none",
          }}
        >
          <svg
            ref={svgRef}
            width={canvasW}
            height={canvasH}
            viewBox={`0 0 ${canvasW} ${canvasH}`}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              transition: isPanning ? "none" : "transform 0.1s ease-out",
            }}
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
                      ? 0.45
                      : 0.06
                    : 0.22
                }
                style={{
                  transition: "opacity 0.3s",
                }}
              />
            ))}

            {/* Nodes */}
            {allNodes.map((node) => {
              const nh = Math.max(node.h || 24, 24);
              return (
                <g
                  key={node.id}
                  onMouseEnter={(e) => handleNodeEnter(node, e.nativeEvent)}
                  onMouseMove={(e) => handleNodeMove(e.nativeEvent)}
                  onMouseLeave={handleNodeLeave}
                  style={{ cursor: "pointer" }}
                >
                  <rect
                    x={node.x}
                    y={node.y}
                    width={colWidth}
                    height={nh}
                    rx={8}
                    fill={node.color}
                    opacity={hoveredNode === node.id ? 1 : 0.85}
                    style={{ transition: "opacity 0.2s" }}
                  />
                  {/* Label */}
                  {nh >= 22 && (
                    <>
                      <text
                        x={node.x + colWidth / 2}
                        y={node.y + nh / 2 - (nh > 36 ? 6 : 0)}
                        textAnchor="middle"
                        fill="white"
                        fontSize="12"
                        fontWeight="600"
                        style={{
                          textTransform: "capitalize",
                          pointerEvents: "none",
                        }}
                      >
                        {node.label}
                      </text>
                      {nh > 36 && (
                        <text
                          x={node.x + colWidth / 2}
                          y={node.y + nh / 2 + 10}
                          textAnchor="middle"
                          fill="rgba(255,255,255,0.85)"
                          fontSize="11"
                          fontWeight="500"
                          style={{ pointerEvents: "none" }}
                        >
                          ${node.value.toLocaleString()}
                          {node.pct ? ` (${node.pct})` : ""}
                        </text>
                      )}
                    </>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Tooltip */}
          {tooltip && (
            <div
              style={{
                position: "absolute",
                left: tooltip.x,
                top: tooltip.y,
                transform: "translate(-50%, -100%)",
                backgroundColor: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
                boxShadow: "var(--shadow-lg)",
                borderRadius: "10px",
                padding: "8px 14px",
                pointerEvents: "none",
                zIndex: 10,
                whiteSpace: "nowrap",
              }}
            >
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--color-text)",
                  textTransform: "capitalize",
                }}
              >
                {tooltip.label}
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--color-text-secondary)",
                  marginTop: "2px",
                }}
              >
                ${tooltip.value.toLocaleString()}
                {tooltip.pct ? ` · ${tooltip.pct}` : ""}
                {tooltip.converted ? ` · ${tooltip.converted}` : ""}
              </div>
            </div>
          )}
        </div>
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
      <div className="text-2xl font-bold mb-1" style={{ color }}>
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
