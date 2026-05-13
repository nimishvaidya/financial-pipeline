import { useState, useEffect } from "react";
import Dashboard from "./components/Dashboard";
import History from "./components/History";
import Settings from "./components/Settings";

function App() {
  const [page, setPage] = useState("dashboard");
  const [pipelineData, setPipelineData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPipelineData();
  }, []);

  async function fetchPipelineData() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/run");

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Failed to load pipeline data");
      }

      const data = await response.json();
      setPipelineData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSettingsSaved() {
    // Re-run pipeline after settings change
    fetchPipelineData();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 text-lg">Loading pipeline...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow p-8 max-w-md">
          <h2 className="text-red-600 text-xl font-semibold mb-2">
            Setup Required
          </h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <p className="text-sm text-gray-500">
            Copy{" "}
            <code className="bg-gray-100 px-1 rounded">
              config/example-config.yaml
            </code>{" "}
            to{" "}
            <code className="bg-gray-100 px-1 rounded">
              config/config.yaml
            </code>{" "}
            and fill in your values, or go to Settings to configure.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Financial Pipeline
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Run date: {pipelineData?.run_date}
            </p>
          </div>

          {/* Navigation */}
          <nav className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <NavButton
              active={page === "dashboard"}
              onClick={() => setPage("dashboard")}
            >
              Dashboard
            </NavButton>
            <NavButton
              active={page === "history"}
              onClick={() => setPage("history")}
            >
              History
            </NavButton>
            <NavButton
              active={page === "settings"}
              onClick={() => setPage("settings")}
            >
              Settings
            </NavButton>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {page === "dashboard" && (
          <Dashboard data={pipelineData} onRefresh={fetchPipelineData} />
        )}
        {page === "history" && <History />}
        {page === "settings" && (
          <Settings onSaved={handleSettingsSaved} />
        )}
      </main>
    </div>
  );
}

function NavButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
        active
          ? "bg-white text-gray-900 shadow-sm"
          : "text-gray-600 hover:text-gray-900"
      }`}
    >
      {children}
    </button>
  );
}

export default App;
