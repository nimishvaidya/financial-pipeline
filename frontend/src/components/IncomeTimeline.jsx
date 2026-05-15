import { useState, useEffect, useCallback } from "react";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatCurrency(amount, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay(); // 0 = Sunday
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const CATEGORY_COLORS = {
  Salary:     { bg: "var(--color-success-light)",  text: "var(--color-success)"      },
  Bonus:      { bg: "var(--color-primary-light)",  text: "var(--color-primary-text)" },
  "Side Gig": { bg: "#ede9fe",                     text: "#7c3aed"                   },
  "Tax Refund":{ bg: "#fef9c3",                    text: "#a16207"                   },
  Freelance:  { bg: "#f3e8ff",                     text: "#9333ea"                   },
  Gift:       { bg: "#fce7f3",                     text: "#db2777"                   },
  Other:      { bg: "var(--color-bg-badge)",       text: "var(--color-text-secondary)"},
};

const EXTRA_CATEGORIES = ["Bonus", "Side Gig", "Tax Refund", "Freelance", "Gift", "Other"];

function CategoryTag({ category }) {
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {category}
    </span>
  );
}

// ─── sub-components ─────────────────────────────────────────────────────────

function MonthSummaryBar({ salaryAmount, extras, currency }) {
  const extrasTotal = extras.reduce((s, e) => s + Number(e.amount), 0);
  const total = salaryAmount + extrasTotal;
  return (
    <div
      className="flex flex-wrap gap-x-6 gap-y-1 px-4 py-2 rounded-xl text-sm"
      style={{
        backgroundColor: "var(--color-bg-badge)",
        color: "var(--color-text-secondary)",
      }}
    >
      <span>
        <span style={{ color: "var(--color-success)", fontWeight: 600 }}>Salary: </span>
        {formatCurrency(salaryAmount, currency)}
      </span>
      <span>·</span>
      <span>
        <span style={{ color: "var(--color-primary-text)", fontWeight: 600 }}>Extras: </span>
        {formatCurrency(extrasTotal, currency)}
      </span>
      <span>·</span>
      <span>
        <span style={{ color: "var(--color-text)", fontWeight: 600 }}>Total: </span>
        {formatCurrency(total, currency)}
      </span>
    </div>
  );
}

function CalendarGrid({ year, month, payday, salaryAmount, extras, currency }) {
  const today = new Date();
  const totalDays = daysInMonth(year, month);
  const startDay = firstDayOfMonth(year, month);

  // Build map: day → extra incomes
  const extrasByDay = {};
  for (const entry of extras) {
    const d = new Date(entry.income_date + "T00:00:00");
    const day = d.getDate();
    if (!extrasByDay[day]) extrasByDay[day] = [];
    extrasByDay[day].push(entry);
  }

  const cells = [];
  // Empty leading cells
  for (let i = 0; i < startDay; i++) {
    cells.push(<div key={`empty-${i}`} />);
  }

  for (let day = 1; day <= totalDays; day++) {
    const isToday =
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === day;
    const isSalaryDay = day === payday;
    const dayExtras = extrasByDay[day] || [];

    cells.push(
      <div
        key={day}
        className="relative flex flex-col items-center justify-start pt-1 pb-1 rounded-lg min-h-[44px] transition-colors"
        style={{
          border: isToday
            ? "2px solid var(--color-primary)"
            : "1px solid var(--color-border)",
          backgroundColor: isSalaryDay
            ? "var(--color-success-light)"
            : dayExtras.length > 0
            ? "var(--color-primary-light)"
            : "var(--color-bg-input)",
        }}
      >
        <span
          className="text-xs font-semibold leading-none mb-1"
          style={{
            color: isToday
              ? "var(--color-primary-text)"
              : isSalaryDay
              ? "var(--color-success)"
              : "var(--color-text-muted)",
          }}
        >
          {day}
        </span>

        {isSalaryDay && (
          <span
            className="text-[10px] font-bold leading-none text-center px-1"
            style={{ color: "var(--color-success)" }}
          >
            {formatCurrency(salaryAmount, currency)}
          </span>
        )}

        {dayExtras.map((e) => (
          <span
            key={e.id}
            className="text-[10px] font-semibold leading-none mt-0.5"
            style={{ color: "var(--color-primary-text)" }}
          >
            +{formatCurrency(e.amount, currency)}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="text-center text-xs font-medium py-1"
            style={{ color: "var(--color-text-muted)" }}
          >
            {d}
          </div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">{cells}</div>
    </div>
  );
}

function AddIncomeForm({ onAdd, currency }) {
  const today = new Date().toISOString().split("T")[0];
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Bonus");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError("Please enter a valid amount.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/extra-income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          income_date: date,
          amount: Number(amount),
          currency,
          category,
          note,
        }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setAmount("");
      setNote("");
      setDate(today);
      setCategory("Bonus");
      setOpen(false);
      onAdd();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    backgroundColor: "var(--color-bg-input)",
    border: "1px solid var(--color-border-input)",
    color: "var(--color-text)",
    borderRadius: "0.5rem",
    padding: "0.375rem 0.625rem",
    fontSize: "0.875rem",
    outline: "none",
    width: "100%",
  };

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <button
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-opacity hover:opacity-80"
        style={{ color: "var(--color-primary-text)" }}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span
          className="text-lg leading-none font-bold transition-transform duration-200"
          style={{ transform: open ? "rotate(45deg)" : "rotate(0deg)", display: "inline-block" }}
        >
          +
        </span>
        Add Extra Income
      </button>

      <div
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: open ? "400px" : "0px" }}
      >
        <form onSubmit={handleSubmit} className="px-4 pb-4 pt-1 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="block text-xs mb-1"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label
                className="block text-xs mb-1"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Amount
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
          </div>

          <div>
            <label
              className="block text-xs mb-1"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={inputStyle}
            >
              {EXTRA_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              className="block text-xs mb-1"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Note <span style={{ color: "var(--color-text-muted)" }}>(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g., Freelance project"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={inputStyle}
            />
          </div>

          {error && (
            <p className="text-xs" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{
              backgroundColor: loading
                ? "var(--color-primary-light)"
                : "var(--color-primary)",
              color: loading ? "var(--color-primary-text)" : "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              border: "none",
            }}
          >
            {loading ? "Adding…" : "Add Income"}
          </button>
        </form>
      </div>
    </div>
  );
}

function IncomeList({ year, month, salaryAmount, payday, extras, currency, onDelete }) {
  const salaryDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(payday).padStart(2, "0")}`;
  const extrasTotal = extras.reduce((s, e) => s + Number(e.amount), 0);
  const total = salaryAmount + extrasTotal;

  const sortedExtras = [...extras].sort(
    (a, b) => new Date(a.income_date) - new Date(b.income_date)
  );

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        backgroundColor: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <h3
        className="text-sm font-semibold mb-3"
        style={{ color: "var(--color-text)" }}
      >
        Income This Month
      </h3>

      <div className="space-y-2">
        {/* Salary row */}
        <div
          className="flex items-center justify-between py-2 px-3 rounded-xl"
          style={{ backgroundColor: "var(--color-success-light)" }}
        >
          <div className="flex items-center gap-3">
            <span
              className="text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              {salaryDate}
            </span>
            <CategoryTag category="Salary" />
          </div>
          <span className="font-semibold text-sm" style={{ color: "var(--color-success)" }}>
            {formatCurrency(salaryAmount, currency)}
          </span>
        </div>

        {/* Extra income rows */}
        {sortedExtras.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between py-2 px-3 rounded-xl transition-all duration-200 animate-in"
            style={{ backgroundColor: "var(--color-bg-input)" }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="text-xs shrink-0"
                style={{ color: "var(--color-text-muted)" }}
              >
                {entry.income_date}
              </span>
              <CategoryTag category={entry.category} />
              {entry.note && (
                <span
                  className="text-xs truncate"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {entry.note}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <span
                className="font-semibold text-sm"
                style={{ color: "var(--color-primary-text)" }}
              >
                {formatCurrency(entry.amount, currency)}
              </span>
              <button
                onClick={() => onDelete(entry.id)}
                className="text-xs w-5 h-5 flex items-center justify-center rounded-full transition-colors"
                style={{
                  color: "var(--color-text-muted)",
                  backgroundColor: "var(--color-bg-badge)",
                }}
                title="Remove entry"
                type="button"
              >
                ×
              </button>
            </div>
          </div>
        ))}

        {sortedExtras.length === 0 && (
          <p className="text-xs py-2 text-center" style={{ color: "var(--color-text-muted)" }}>
            No extra income this month.
          </p>
        )}
      </div>

      {/* Monthly total */}
      <div
        className="mt-3 pt-3 flex justify-between items-center"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <span className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
          Monthly Total
        </span>
        <span className="text-base font-bold" style={{ color: "var(--color-text)" }}>
          {formatCurrency(total, currency)}
        </span>
      </div>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function IncomeTimeline({
  salaryAmount,
  payday = 1,
  currency = "USD",
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [extras, setExtras] = useState([]);
  const [fetchError, setFetchError] = useState(null);

  const fetchExtras = useCallback(async () => {
    setFetchError(null);
    try {
      const res = await fetch(
        `/api/extra-income?year=${year}&month=${String(month + 1).padStart(2, "0")}`
      );
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setExtras(Array.isArray(data) ? data : data.items ?? []);
    } catch (err) {
      setFetchError(err.message);
      setExtras([]);
    }
  }, [year, month]);

  useEffect(() => {
    fetchExtras();
  }, [fetchExtras]);

  async function handleDelete(id) {
    try {
      const res = await fetch(`/api/extra-income/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      setExtras((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error(err);
    }
  }

  function prevMonth() {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth((m) => m + 1);
    }
  }

  return (
    <div className="space-y-4">
      {/* Card wrapper */}
      <div
        className="rounded-2xl p-5"
        style={{
          backgroundColor: "var(--color-bg-card)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        {/* Header row: title + month nav */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: "var(--color-text)" }}>
            Income Timeline
          </h2>

          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
              style={{
                backgroundColor: "var(--color-bg-badge)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border)",
              }}
              type="button"
              aria-label="Previous month"
            >
              ←
            </button>
            <span
              className="text-sm font-semibold min-w-[130px] text-center"
              style={{ color: "var(--color-text)" }}
            >
              {MONTH_NAMES[month]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
              style={{
                backgroundColor: "var(--color-bg-badge)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border)",
              }}
              type="button"
              aria-label="Next month"
            >
              →
            </button>
          </div>
        </div>

        {/* Summary bar */}
        <div className="mb-4">
          <MonthSummaryBar
            salaryAmount={salaryAmount}
            extras={extras}
            currency={currency}
          />
        </div>

        {/* Fetch error */}
        {fetchError && (
          <div
            className="text-xs px-3 py-2 rounded-lg mb-3"
            style={{
              backgroundColor: "var(--color-danger-light)",
              color: "var(--color-danger)",
            }}
          >
            Could not load extra income: {fetchError}
          </div>
        )}

        {/* Calendar */}
        <CalendarGrid
          year={year}
          month={month}
          payday={payday}
          salaryAmount={salaryAmount}
          extras={extras}
          currency={currency}
        />
      </div>

      {/* Add income form */}
      <AddIncomeForm onAdd={fetchExtras} currency={currency} />

      {/* Income list */}
      <IncomeList
        year={year}
        month={month}
        salaryAmount={salaryAmount}
        payday={payday}
        extras={extras}
        currency={currency}
        onDelete={handleDelete}
      />
    </div>
  );
}
