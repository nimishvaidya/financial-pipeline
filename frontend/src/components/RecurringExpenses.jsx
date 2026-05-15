import { useState } from "react";

// Brand/icon mapping for known expense types
const EXPENSE_BRANDS = {
  rent: { icon: "🏠", color: "#ef4444", label: "Rent", gradient: "from-red-500 to-rose-600" },
  car_payment: { icon: "🚗", color: "#f97316", label: "Car Payment", gradient: "from-orange-500 to-amber-600" },
  electricity: { icon: "⚡", color: "#eab308", label: "Electricity", gradient: "from-yellow-500 to-amber-500" },
  internet: { icon: "📶", color: "#3b82f6", label: "Internet", gradient: "from-blue-500 to-cyan-600" },
  groceries: { icon: "🛒", color: "#10b981", label: "Groceries", gradient: "from-emerald-500 to-green-600" },
  insurance: { icon: "🛡️", color: "#8b5cf6", label: "Insurance", gradient: "from-violet-500 to-purple-600" },
  phone: { icon: "📱", color: "#06b6d4", label: "Phone", gradient: "from-cyan-500 to-blue-500" },
  gym: { icon: "💪", color: "#f43f5e", label: "Gym", gradient: "from-rose-500 to-pink-600" },
  subscriptions: { icon: "📺", color: "#a855f7", label: "Subscriptions", gradient: "from-purple-500 to-violet-600" },
  amex: { icon: "💳", color: "#006FCF", label: "Amex Card", gradient: "from-blue-600 to-blue-800" },
  apple: { icon: "🍎", color: "#333333", label: "Apple Card", gradient: "from-gray-700 to-gray-900" },
};

const DEFAULT_BRAND = { icon: "💰", color: "#64748b", label: null, gradient: "from-slate-500 to-slate-700" };

function getBrand(name) {
  return EXPENSE_BRANDS[name] || DEFAULT_BRAND;
}

function getLabel(expense) {
  const brand = getBrand(expense.name);
  if (brand.label) return brand.label;
  return expense.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatAmount(amount) {
  return "$" + amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Gradient style helper — uses inline styles since we can't use arbitrary Tailwind gradients safely
function gradientStyle(name) {
  const brand = getBrand(name);
  // Map gradient class names to actual color stops
  const gradientMap = {
    "from-red-500 to-rose-600": ["#ef4444", "#e11d48"],
    "from-orange-500 to-amber-600": ["#f97316", "#d97706"],
    "from-yellow-500 to-amber-500": ["#eab308", "#f59e0b"],
    "from-blue-500 to-cyan-600": ["#3b82f6", "#0891b2"],
    "from-emerald-500 to-green-600": ["#10b981", "#16a34a"],
    "from-violet-500 to-purple-600": ["#8b5cf6", "#9333ea"],
    "from-cyan-500 to-blue-500": ["#06b6d4", "#3b82f6"],
    "from-rose-500 to-pink-600": ["#f43f5e", "#db2777"],
    "from-purple-500 to-violet-600": ["#a855f7", "#7c3aed"],
    "from-blue-600 to-blue-800": ["#2563eb", "#1e40af"],
    "from-gray-700 to-gray-900": ["#374151", "#111827"],
    "from-slate-500 to-slate-700": ["#64748b", "#334155"],
  };
  const stops = gradientMap[brand.gradient] || [brand.color, brand.color];
  return `linear-gradient(135deg, ${stops[0]}, ${stops[1]})`;
}

// ─── View 1: Card Tiles ───────────────────────────────────────────────────────

function CardTilesView({ expenses, total }) {
  return (
    <div style={{ animation: "fadeIn 0.25s ease" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: "16px",
        }}
      >
        {expenses.map((expense) => {
          const brand = getBrand(expense.name);
          return (
            <div
              key={expense.name}
              style={{
                background: gradientStyle(expense.name),
                borderRadius: "16px",
                padding: "16px",
                height: "100px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                boxShadow: "var(--shadow-md)",
                transition: "transform 0.18s ease, box-shadow 0.18s ease",
                cursor: "default",
                position: "relative",
                overflow: "hidden",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.03)";
                e.currentTarget.style.boxShadow = "0 8px 30px rgba(0,0,0,0.25)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = "var(--shadow-md)";
              }}
            >
              {/* Subtle shine overlay */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: "50%",
                  background: "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 100%)",
                  borderRadius: "16px 16px 0 0",
                  pointerEvents: "none",
                }}
              />
              {/* Top row: icon */}
              <div style={{ fontSize: "24px", lineHeight: 1 }}>{brand.icon}</div>
              {/* Bottom row: name + amount */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <span
                  style={{
                    color: "rgba(255,255,255,0.9)",
                    fontSize: "12px",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    maxWidth: "60%",
                    lineHeight: 1.2,
                  }}
                >
                  {getLabel(expense)}
                </span>
                <span
                  style={{
                    color: "#ffffff",
                    fontSize: "15px",
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {formatAmount(expense.amount)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total bar */}
      <div
        style={{
          marginTop: "20px",
          padding: "14px 20px",
          borderRadius: "14px",
          background: "var(--color-primary-light)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          border: "1px solid var(--color-border)",
        }}
      >
        <span style={{ color: "var(--color-text)", fontWeight: 600, fontSize: "14px" }}>
          Total Monthly
        </span>
        <span style={{ color: "var(--color-primary)", fontWeight: 700, fontSize: "18px" }}>
          {formatAmount(total)}
        </span>
      </div>
    </div>
  );
}

// ─── View 2: List View ────────────────────────────────────────────────────────

function ListView({ expenses, total }) {
  return (
    <div style={{ animation: "fadeIn 0.25s ease" }}>
      <div
        style={{
          borderRadius: "16px",
          overflow: "hidden",
          border: "1px solid var(--color-border)",
          background: "var(--color-bg-card)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {expenses.map((expense, i) => {
          const brand = getBrand(expense.name);
          return (
            <div
              key={expense.name}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "14px 20px",
                gap: "14px",
                borderBottom: i < expenses.length - 1 ? "1px solid var(--color-border)" : "none",
                transition: "background 0.15s ease",
                cursor: "default",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--color-bg-badge)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  background: gradientStyle(expense.name),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                  flexShrink: 0,
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                {brand.icon}
              </div>

              {/* Label + currency */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    color: "var(--color-text)",
                    fontWeight: 600,
                    fontSize: "14px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {getLabel(expense)}
                </div>
                <div style={{ color: "var(--color-text-muted)", fontSize: "12px", marginTop: "1px" }}>
                  {expense.currency}
                </div>
              </div>

              {/* Amount */}
              <div
                style={{
                  color: "var(--color-text)",
                  fontWeight: 700,
                  fontSize: "15px",
                  textAlign: "right",
                  flexShrink: 0,
                }}
              >
                {formatAmount(expense.amount)}
              </div>
            </div>
          );
        })}

        {/* Total row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "16px 20px",
            gap: "14px",
            background: "var(--color-primary-light)",
            borderTop: "2px solid var(--color-border)",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              background: "var(--color-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
              flexShrink: 0,
            }}
          >
            📊
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "var(--color-text)", fontWeight: 700, fontSize: "14px" }}>
              Total Monthly
            </div>
            <div style={{ color: "var(--color-text-muted)", fontSize: "12px", marginTop: "1px" }}>
              {expenses.length} expenses
            </div>
          </div>
          <div
            style={{
              color: "var(--color-primary)",
              fontWeight: 800,
              fontSize: "18px",
              textAlign: "right",
              flexShrink: 0,
            }}
          >
            {formatAmount(total)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── View 3: Bills Calendar ───────────────────────────────────────────────────

function CalendarView({ expenses, total }) {
  const [billsOpen, setBillsOpen] = useState(false);

  // Build a real calendar for the current month
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthName = now.toLocaleString("default", { month: "long", year: "numeric" });
  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();

  // Build the grid: pad start with nulls
  const cells = [];
  for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div style={{ animation: "fadeIn 0.25s ease" }}>
      {/* Month header */}
      <div style={{ marginBottom: "12px", textAlign: "center" }}>
        <span style={{ color: "var(--color-text)", fontWeight: 700, fontSize: "16px" }}>
          {monthName}
        </span>
      </div>

      {/* Calendar grid */}
      <div
        style={{
          background: "var(--color-bg-card)",
          borderRadius: "16px",
          border: "1px solid var(--color-border)",
          overflow: "hidden",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {/* Day headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {DAYS.map((d) => (
            <div
              key={d}
              style={{
                padding: "10px 4px",
                textAlign: "center",
                color: "var(--color-text-muted)",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Date cells */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {cells.map((day, idx) => {
            const isToday = day === today;
            const isBillDay = day === 1;
            const isLastRow = idx >= cells.length - 7;
            const isLastCol = (idx + 1) % 7 === 0;

            return (
              <div
                key={idx}
                onClick={isBillDay ? () => setBillsOpen((v) => !v) : undefined}
                style={{
                  minHeight: "64px",
                  padding: "6px",
                  borderBottom: !isLastRow ? "1px solid var(--color-border)" : "none",
                  borderRight: !isLastCol ? "1px solid var(--color-border)" : "none",
                  background: isToday
                    ? "var(--color-primary-light)"
                    : isBillDay
                    ? "var(--color-bg-badge)"
                    : "transparent",
                  cursor: isBillDay ? "pointer" : "default",
                  position: "relative",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (isBillDay) e.currentTarget.style.opacity = "0.85";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "1";
                }}
              >
                {day && (
                  <>
                    {/* Day number */}
                    <div
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        background: isToday ? "var(--color-primary)" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        fontWeight: isToday ? 700 : 400,
                        color: isToday ? "#fff" : "var(--color-text)",
                        marginBottom: "4px",
                      }}
                    >
                      {day}
                    </div>

                    {/* Bill dots on day 1 */}
                    {isBillDay && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "2px",
                          marginTop: "2px",
                        }}
                      >
                        {expenses.slice(0, 6).map((expense) => {
                          const brand = getBrand(expense.name);
                          return (
                            <div
                              key={expense.name}
                              title={getLabel(expense)}
                              style={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                backgroundColor: brand.color,
                                flexShrink: 0,
                              }}
                            />
                          );
                        })}
                        {expenses.length > 6 && (
                          <div
                            style={{
                              width: "8px",
                              height: "8px",
                              borderRadius: "50%",
                              backgroundColor: "var(--color-text-muted)",
                              flexShrink: 0,
                              fontSize: "6px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#fff",
                            }}
                          >
                            +
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bills due on the 1st — expandable panel */}
      <div
        style={{
          marginTop: "16px",
          borderRadius: "16px",
          overflow: "hidden",
          border: "1px solid var(--color-border)",
          background: "var(--color-bg-card)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <button
          onClick={() => setBillsOpen((v) => !v)}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 20px",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px" }}>📅</span>
            <span style={{ color: "var(--color-text)", fontWeight: 600, fontSize: "14px" }}>
              Bills due on the 1st
            </span>
            <span
              style={{
                background: "var(--color-primary)",
                color: "#fff",
                borderRadius: "999px",
                fontSize: "11px",
                fontWeight: 700,
                padding: "1px 7px",
              }}
            >
              {expenses.length}
            </span>
          </div>
          <span
            style={{
              color: "var(--color-text-muted)",
              fontSize: "18px",
              transform: billsOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
              lineHeight: 1,
            }}
          >
            ▾
          </span>
        </button>

        {billsOpen && (
          <div style={{ borderTop: "1px solid var(--color-border)" }}>
            {expenses.map((expense, i) => {
              const brand = getBrand(expense.name);
              return (
                <div
                  key={expense.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "12px 20px",
                    gap: "12px",
                    borderBottom: i < expenses.length - 1 ? "1px solid var(--color-border)" : "none",
                  }}
                >
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      background: gradientStyle(expense.name),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "15px",
                      flexShrink: 0,
                    }}
                  >
                    {brand.icon}
                  </div>
                  <span
                    style={{
                      flex: 1,
                      color: "var(--color-text)",
                      fontSize: "13px",
                      fontWeight: 500,
                    }}
                  >
                    {getLabel(expense)}
                  </span>
                  <span
                    style={{
                      color: "var(--color-danger)",
                      fontWeight: 700,
                      fontSize: "13px",
                    }}
                  >
                    {formatAmount(expense.amount)}
                  </span>
                </div>
              );
            })}

            {/* Total */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "14px 20px",
                background: "var(--color-primary-light)",
                borderTop: "2px solid var(--color-border)",
              }}
            >
              <span style={{ color: "var(--color-text)", fontWeight: 700, fontSize: "14px" }}>
                Total due on 1st
              </span>
              <span style={{ color: "var(--color-primary)", fontWeight: 800, fontSize: "16px" }}>
                {formatAmount(total)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const VIEWS = [
  { key: "cards", icon: "🃏", label: "Cards" },
  { key: "list", icon: "📋", label: "List" },
  { key: "calendar", icon: "📅", label: "Calendar" },
];

export default function RecurringExpenses({ expenses = [] }) {
  const [activeView, setActiveView] = useState("cards");

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div
      className="rounded-2xl"
      style={{
        backgroundColor: "var(--color-bg-card)",
        boxShadow: "var(--shadow-md)",
        padding: "24px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div>
          <h2
            style={{
              color: "var(--color-text)",
              fontSize: "18px",
              fontWeight: 700,
              margin: 0,
            }}
          >
            Recurring Expenses
          </h2>
          <p
            style={{
              color: "var(--color-text-secondary)",
              fontSize: "13px",
              margin: "2px 0 0",
            }}
          >
            Fixed monthly obligations
          </p>
        </div>

        {/* Segmented toggle */}
        <div
          style={{
            display: "flex",
            borderRadius: "10px",
            overflow: "hidden",
            border: "1px solid var(--color-border)",
            background: "var(--color-bg-badge)",
          }}
        >
          {VIEWS.map((view) => (
            <button
              key={view.key}
              onClick={() => setActiveView(view.key)}
              title={view.label}
              style={{
                padding: "7px 12px",
                border: "none",
                borderRadius: 0,
                cursor: "pointer",
                fontSize: "16px",
                lineHeight: 1,
                background:
                  activeView === view.key ? "var(--color-primary)" : "transparent",
                color: activeView === view.key ? "#ffffff" : "var(--color-text-secondary)",
                transition: "background 0.15s ease, color 0.15s ease",
                outline: "none",
              }}
            >
              {view.icon}
            </button>
          ))}
        </div>
      </div>

      {/* View content */}
      <div>
        {activeView === "cards" && (
          <CardTilesView expenses={expenses} total={total} />
        )}
        {activeView === "list" && (
          <ListView expenses={expenses} total={total} />
        )}
        {activeView === "calendar" && (
          <CalendarView expenses={expenses} total={total} />
        )}
      </div>

      {/* Fade-in keyframe — injected once via a style tag */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
