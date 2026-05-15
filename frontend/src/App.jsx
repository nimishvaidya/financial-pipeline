import { useState, useEffect } from "react";
import Dashboard from "./components/Dashboard";
import History from "./components/History";
import PipelineFlow from "./components/PipelineFlow";
import Settings from "./components/Settings";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "pipeline", label: "Pipeline", icon: "🔀" },
  { id: "history", label: "History", icon: "📈" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

function App() {
  const [page, setPage] = useState("dashboard");
  const [pipelineData, setPipelineData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dark, setDark] = useState(() => {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

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

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--color-bg)" }}
      >
        <div className="text-center animate-fade-in">
          <div className="text-4xl mb-4" style={{ animation: "pulse 1.5s infinite" }}>💰</div>
          <div style={{ color: "var(--color-text-secondary)" }} className="text-lg">
            Loading pipeline...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: "var(--color-bg)" }}
      >
        <div
          className="rounded-2xl p-8 max-w-md w-full animate-fade-in"
          style={{
            backgroundColor: "var(--color-bg-card)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <div className="text-3xl mb-3">🔧</div>
          <h2 className="text-xl font-bold mb-2" style={{ color: "var(--color-danger)" }}>
            Setup Required
          </h2>
          <p className="mb-4" style={{ color: "var(--color-text-secondary)" }}>
            {error}
          </p>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Copy{" "}
            <code
              className="px-1.5 py-0.5 rounded text-xs"
              style={{ backgroundColor: "var(--color-bg-badge)" }}
            >
              config/example-config.yaml
            </code>{" "}
            to{" "}
            <code
              className="px-1.5 py-0.5 rounded text-xs"
              style={{ backgroundColor: "var(--color-bg-badge)" }}
            >
              config/config.yaml
            </code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "var(--color-bg)" }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen w-64 z-40 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ backgroundColor: "var(--color-bg-sidebar)" }}
      >
        {/* Logo */}
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-lg">
              💰
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Financial</h1>
              <h1 className="text-base font-bold text-blue-400 -mt-1">Pipeline</h1>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setPage(item.id);
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                page === item.id ? "text-white" : ""
              }`}
              style={{
                backgroundColor:
                  page === item.id
                    ? "var(--color-bg-sidebar-active)"
                    : "transparent",
                color:
                  page === item.id
                    ? "var(--color-text-sidebar-active)"
                    : "var(--color-text-sidebar)",
              }}
              onMouseEnter={(e) => {
                if (page !== item.id)
                  e.currentTarget.style.backgroundColor =
                    "var(--color-bg-sidebar-hover)";
              }}
              onMouseLeave={(e) => {
                if (page !== item.id)
                  e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
              {page === item.id && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />
              )}
            </button>
          ))}
        </nav>

        {/* Dark mode toggle */}
        <div className="p-4 border-t" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          <button
            onClick={() => setDark(!dark)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all"
            style={{ color: "var(--color-text-sidebar)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "var(--color-bg-sidebar-hover)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "transparent")
            }
          >
            <span className="text-lg">{dark ? "☀️" : "🌙"}</span>
            {dark ? "Light Mode" : "Dark Mode"}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Top bar */}
        <header
          className="sticky top-0 z-20 backdrop-blur-md border-b"
          style={{
            backgroundColor: dark ? "rgba(15,23,42,0.8)" : "rgba(248,250,252,0.8)",
            borderColor: "var(--color-border)",
          }}
        >
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              {/* Mobile hamburger */}
              <button
                className="lg:hidden p-2 rounded-lg"
                style={{ color: "var(--color-text)" }}
                onClick={() => setSidebarOpen(true)}
              >
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12h18M3 6h18M3 18h18" />
                </svg>
              </button>
              <div>
                <h2 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>
                  {NAV_ITEMS.find((n) => n.id === page)?.label}
                </h2>
                {pipelineData && (
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                    {pipelineData.run_date}
                  </p>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6 max-w-6xl mx-auto">
          <div className="animate-fade-in">
            {page === "dashboard" && (
              <Dashboard data={pipelineData} onRefresh={fetchPipelineData} dark={dark} />
            )}
            {page === "pipeline" && <PipelineFlow data={pipelineData} dark={dark} />}
            {page === "history" && <History dark={dark} />}
            {page === "settings" && (
              <Settings onSaved={fetchPipelineData} dark={dark} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
