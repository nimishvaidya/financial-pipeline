# Development Log

Personal dev diary for the Financial Pipeline project.

---

## Session 4 — June 7, 2026

### What we did

**Sprint 8: Portfolio Chatbot**
- Built chat.py module — gathers all financial context (config, balances, portfolio, Robinhood) into a system prompt
- Ollama integration: non-streaming + SSE streaming endpoints via localhost:11434
- ChatDrawer.jsx — sliding sidebar drawer with streaming response, suggestion chips, Ollama status indicator
- Floating chat button (💬) accessible from every page
- Auto-detects installed Ollama models, prefers llama3.2
- Graceful offline mode with install instructions when Ollama isn't running

**Sprint 7: Robinhood Statement Visualization**
- Built PDF parser (`robinhood_parser.py`) using pdfplumber to extract data from Robinhood monthly statements
- Parses: account summary, 61 holdings, 92 transactions, 19 pending trades
- Computes derived stats: ETF vs stock split, top 10 concentration, dividend payers, DRIP detection
- Added 4 API endpoints for PDF upload/retrieval/parsing
- Built full React dashboard (`RobinhoodReport.jsx`, 629 lines) with recharts visualizations
- 4 tabs: Overview (treemap + pie charts + activity), Holdings (sortable table), Transactions (bar chart + filters), Dividends (by-ticker chart + top yielders)
- Drag-and-drop PDF upload with error handling
- Added to sidebar nav as "Robinhood" page

### Bugs squashed
- Equities/cash percentage swap in parser — regex picked up cash % instead of equities; fixed by computing from actual values
- DRIP detection proximity check — changed to forward-only search (Reinvestment text appears after buy line)

### Tech notes
- pdfplumber for PDF text extraction (regex-based parsing matching Robinhood's specific format)
- python-multipart for FastAPI file upload support
- In-memory parsed statement cache keyed by filename
- Recharts Treemap, PieChart, BarChart for visualizations
- CSS variables throughout for dark/light mode consistency

---

## Session 1 — May 12, 2026

### What we did

**Mac Setup (from scratch)**
- Installed Homebrew, Git, pyenv (Python 3.13.13), fnm (Node 24), uv, pnpm, VS Code
- Set up GitHub SSH key and connected to repo
- Created repo: github.com/nimishvaidya/financial-pipeline

**Sprint 1: Core Pipeline + Dashboard**
- Designed the pipeline architecture: salary → fixed expenses → remainder split by % into buckets
- Built Python backend with FastAPI:
  - `models.py` — Pydantic models for config and output
  - `config_loader.py` — YAML config parser with validation
  - `engine.py` — Core allocation engine with dynamic rules and redistribution
  - `config_writer.py` — Write config changes back to YAML from UI
  - `api.py` — REST API endpoints
- Built React frontend with Vite + Tailwind:
  - Dashboard — pie chart, bucket breakdown, transfer instructions
  - Settings — edit all config values from the browser
  - Navigation between Dashboard and Settings
- Created `start.sh` — one command to boot both servers
- Config system: `example-config.yaml` (public) + `config.yaml` (private, gitignored)

**Sprint 2: Historical Tracking**
- Added SQLite database (`database.py`) — stores snapshots of pipeline runs
- Built loan payoff projection calculator (`projections.py`) — calculates payoff date and amortization
- Emergency fund projection — progress bar and target date
- History page with:
  - Save Snapshot button (click monthly to record state)
  - Net worth over time chart
  - Balance trends chart
  - Loan payoff curve
  - Emergency fund progress

### Decisions made
- **Python + React** over Streamlit — better for GitHub showcase and future Telegram bot
- **pyenv + fnm + uv** — proper version management from day one
- **YAML config** — human-readable, config-driven so others can fork and use
- **SQLite** — no separate database server, just a file
- **Manual transfers** — the app is a decision engine, not an execution engine (security)
- **Agile sprints** — iterative, one usable increment at a time

### Issues encountered
- `hatchling.backends` → should be `hatchling.build` in pyproject.toml
- Hatchling couldn't find package → needed `[tool.hatch.build.targets.wheel] packages = ["src/pipeline"]`
- `README.md` not found → needed a README inside backend/
- pnpm blocked esbuild → needed `pnpm approve-builds`
- `config.yaml` not visible in VS Code/Finder — works fine, just a display quirk
- `git push` needed explicit `git push origin main` after merge

---

## Session 2 — May 14, 2026

### What we did

**Sprint 4: UI Overhaul (Monarch Money style)**
- Created full CSS variable design system (`index.css`) for light/dark mode
- Redesigned App.jsx with sidebar navigation (Dashboard, Pipeline, History, Settings)
- Added dark mode toggle (detects system preference)
- Mobile responsive: hamburger menu + overlay on small screens
- Sticky header with backdrop blur effect
- Built Sankey flow diagram (`PipelineFlow.jsx`) — Monarch Money inspired:
  - 4-column layout: Income → Total → Categories (Fixed/Allocation) → Individual items
  - SVG Bezier curve paths connecting nodes
  - Hover highlighting (dims unrelated flows)
  - Summary cards: Total Income, Expenses, Allocated, Allocation Rate
- Polished all pages (Dashboard, History, Settings):
  - Migrated from hardcoded Tailwind colors to CSS variables
  - All cards upgraded to rounded-2xl with shadow tokens
  - Form inputs use design system tokens
  - Recharts tooltips styled for dark mode
  - Toast notifications use themed colors

### Decisions made
- **CSS variables over Tailwind dark:** classes — more flexible, works with any theming approach
- **Custom SVG Sankey** — no external library dependency, full control over styling
- **Monarch Money** as UI reference — clean, professional, data-focused

### What's next (Sprint 5+)
- Telegram chatbot — natural language queries about finances
- Investment portfolio tracking + buy-the-dip logic
- Multi-currency with live exchange rates
- Section 80E tax tracker for education loan interest

---

## Session 3 — June 5, 2026

### What we did

**Sprint 5: Live Forex + Telegram + Income Timeline + Recurring Expenses**
- Added ExchangeRate-API integration with daily SQLite caching
- Built Telegram bot with full pipeline control (15+ commands)
- Income timeline with calendar view and extra income entries
- Recurring expenses display (3 views: cards, list, calendar)

**Sprint 6: Investment Layer**
- Built `portfolio.py` — holdings CRUD, live prices from Yahoo Finance, portfolio summary
- Stock price caching (15-minute window) with graceful fallback
- Buy-the-dip engine — watchlist with configurable drop thresholds, dip detection from 52-week high
- Dip alert system with deduplication and acknowledgment
- 11 new API endpoints for portfolio, watchlist, and alerts
- Portfolio dashboard page — summary cards, holdings table with real-time P/L, price lookup
- Three-tab UI: Holdings, Watchlist, Dip Alerts
- 8 new Telegram commands: /portfolio, /buy, /sell, /price, /watch, /unwatch, /dips
- Natural language support: "my stocks", "watchlist", "dips"

### Decisions made
- **Yahoo Finance free endpoint** — no API key needed, good enough for personal use
- **15-min price cache** — balance between freshness and not hammering the API
- **Dip from 52-week high** — simpler than rolling window, catches meaningful drops
- **Weighted avg cost on add** — if you add more shares, avg cost recalculates automatically
- **Manual tracking** — no brokerage API integration yet (Robinhood API is unofficial)

### What's next (Sprint 7+)
- Section 80E tax tracker for education loan interest
- Historical portfolio value chart
- Auto dip-check on a schedule (cron or bot polling)
