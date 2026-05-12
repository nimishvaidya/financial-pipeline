import { useState, useEffect } from "react";

function Settings({ onSaved }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    try {
      const res = await fetch("/api/config/full");
      const data = await res.json();
      setConfig(data);
    } catch {
      setMessage({ type: "error", text: "Failed to load config" });
    } finally {
      setLoading(false);
    }
  }

  function showMessage(type, text) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }

  // --- Income ---
  async function saveIncome() {
    setSaving(true);
    try {
      const res = await fetch("/api/income", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ income: config.income }),
      });
      if (res.ok) {
        showMessage("success", "Income updated");
        onSaved?.();
      }
    } catch {
      showMessage("error", "Failed to save income");
    } finally {
      setSaving(false);
    }
  }

  // --- Balances ---
  async function saveBalances() {
    setSaving(true);
    try {
      const res = await fetch("/api/balances", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balances: config.balances }),
      });
      if (res.ok) {
        showMessage("success", "Balances updated");
        onSaved?.();
      }
    } catch {
      showMessage("error", "Failed to save balances");
    } finally {
      setSaving(false);
    }
  }

  // --- Fixed Expenses ---
  function addExpense() {
    setConfig({
      ...config,
      fixed_expenses: [
        ...config.fixed_expenses,
        { name: "", amount: 0, currency: "USD" },
      ],
    });
  }

  function removeExpense(index) {
    const updated = config.fixed_expenses.filter((_, i) => i !== index);
    setConfig({ ...config, fixed_expenses: updated });
  }

  async function saveExpenses() {
    setSaving(true);
    try {
      const res = await fetch("/api/expenses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenses: config.fixed_expenses }),
      });
      if (res.ok) {
        showMessage("success", "Expenses updated");
        onSaved?.();
      }
    } catch {
      showMessage("error", "Failed to save expenses");
    } finally {
      setSaving(false);
    }
  }

  // --- Bucket Percentages ---
  async function saveBuckets() {
    setSaving(true);
    try {
      const bucketMap = {};
      config.buckets.forEach((b) => {
        bucketMap[b.name] = b.percentage;
      });
      const res = await fetch("/api/buckets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buckets: bucketMap }),
      });
      if (res.ok) {
        showMessage("success", "Bucket percentages updated");
        onSaved?.();
      }
    } catch {
      showMessage("error", "Failed to save buckets");
    } finally {
      setSaving(false);
    }
  }

  // --- Forex ---
  async function saveForex() {
    setSaving(true);
    try {
      const res = await fetch("/api/forex", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forex: config.forex }),
      });
      if (res.ok) {
        showMessage("success", "Exchange rates updated");
        onSaved?.();
      }
    } catch {
      showMessage("error", "Failed to save forex");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading settings...</div>
      </div>
    );
  }

  if (!config) return null;

  const totalPct = (config.buckets || []).reduce(
    (sum, b) => sum + (b.percentage || 0),
    0
  );

  return (
    <div className="space-y-8">
      {/* Toast message */}
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

      {/* Income */}
      <Section title="Income" onSave={saveIncome} saving={saving}>
        {Object.entries(config.income || {}).map(([name, data]) => (
          <div key={name} className="grid grid-cols-3 gap-4">
            <Field
              label="Source"
              value={name}
              disabled
            />
            <Field
              label="Amount (monthly)"
              type="number"
              value={data.amount}
              onChange={(val) =>
                setConfig({
                  ...config,
                  income: {
                    ...config.income,
                    [name]: { ...data, amount: Number(val) },
                  },
                })
              }
            />
            <Field
              label="Currency"
              value={data.currency}
              disabled
            />
          </div>
        ))}
      </Section>

      {/* Balances */}
      <Section title="Current Balances" subtitle="Update these monthly to keep your pipeline accurate" onSave={saveBalances} saving={saving}>
        {Object.entries(config.balances || {}).map(([name, data]) => (
          <div key={name} className="grid grid-cols-4 gap-4">
            <Field
              label="Account"
              value={name.replace(/_/g, " ")}
              disabled
            />
            <Field
              label="Balance"
              type="number"
              value={data.amount}
              onChange={(val) =>
                setConfig({
                  ...config,
                  balances: {
                    ...config.balances,
                    [name]: { ...data, amount: Number(val) },
                  },
                })
              }
            />
            <Field
              label="Interest %"
              type="number"
              step="0.1"
              value={data.interest_rate || 0}
              onChange={(val) =>
                setConfig({
                  ...config,
                  balances: {
                    ...config.balances,
                    [name]: { ...data, interest_rate: Number(val) },
                  },
                })
              }
            />
            <Field label="Currency" value={data.currency} disabled />
          </div>
        ))}
      </Section>

      {/* Fixed Expenses */}
      <Section title="Fixed Monthly Expenses" onSave={saveExpenses} saving={saving}>
        {(config.fixed_expenses || []).map((exp, i) => (
          <div key={i} className="grid grid-cols-4 gap-4 items-end">
            <Field
              label="Name"
              value={exp.name}
              onChange={(val) => {
                const updated = [...config.fixed_expenses];
                updated[i] = { ...exp, name: val };
                setConfig({ ...config, fixed_expenses: updated });
              }}
            />
            <Field
              label="Amount"
              type="number"
              value={exp.amount}
              onChange={(val) => {
                const updated = [...config.fixed_expenses];
                updated[i] = { ...exp, amount: Number(val) };
                setConfig({ ...config, fixed_expenses: updated });
              }}
            />
            <Field label="Currency" value={exp.currency} disabled />
            <button
              onClick={() => removeExpense(i)}
              className="text-red-500 hover:text-red-700 text-sm pb-1"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          onClick={addExpense}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium mt-2"
        >
          + Add expense
        </button>
      </Section>

      {/* Bucket Percentages */}
      <Section title="Allocation Buckets" onSave={saveBuckets} saving={saving}>
        {(config.buckets || []).map((bucket, i) => (
          <div key={bucket.name} className="grid grid-cols-3 gap-4">
            <Field
              label="Bucket"
              value={bucket.name.replace(/_/g, " ")}
              disabled
            />
            <Field
              label="Base %"
              type="number"
              value={bucket.percentage}
              onChange={(val) => {
                const updated = [...config.buckets];
                updated[i] = { ...bucket, percentage: Number(val) };
                setConfig({ ...config, buckets: updated });
              }}
            />
            <Field
              label="Description"
              value={bucket.description || ""}
              onChange={(val) => {
                const updated = [...config.buckets];
                updated[i] = { ...bucket, description: val };
                setConfig({ ...config, buckets: updated });
              }}
            />
          </div>
        ))}
        <div className={`text-sm mt-2 font-medium ${Math.abs(totalPct - 100) < 0.01 ? "text-green-600" : "text-red-600"}`}>
          Total: {totalPct}% {Math.abs(totalPct - 100) >= 0.01 && "(must equal 100%)"}
        </div>
      </Section>

      {/* Forex */}
      <Section title="Exchange Rates" onSave={saveForex} saving={saving}>
        {Object.entries(config.forex || {}).map(([pair, data]) => (
          <div key={pair} className="grid grid-cols-3 gap-4">
            <Field
              label="Pair"
              value={pair.toUpperCase().replace("_", " → ")}
              disabled
            />
            <Field
              label="Rate"
              type="number"
              step="0.01"
              value={data.rate}
              onChange={(val) =>
                setConfig({
                  ...config,
                  forex: {
                    ...config.forex,
                    [pair]: { ...data, rate: Number(val) },
                  },
                })
              }
            />
            <Field label="Mode" value={data.mode} disabled />
          </div>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, subtitle, children, onSave, saving }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", disabled = false, step }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1 capitalize">
        {label}
      </label>
      <input
        type={type}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm ${
          disabled
            ? "bg-gray-50 text-gray-500"
            : "bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        }`}
      />
    </div>
  );
}

export default Settings;
