# Changelog

All notable changes to this project will be documented in this file.

## [0.7.0] - 2026-06-07

### Added
- Portfolio chatbot powered by Ollama (fully local LLM, no API keys)
- Chat backend gathers all financial context: income, budget, balances, investments, Robinhood data
- Streaming SSE endpoint for real-time response display
- Ollama status check endpoint with model auto-detection
- Sliding chat drawer accessible from any page via floating button
- Suggestion chips for common financial questions
- Chat message history with user/assistant bubbles
- Auto-detects available Ollama models (prefers llama3.2)
- Graceful offline handling when Ollama isn't running

## [0.6.0] - 2026-06-07

### Added
- Robinhood monthly statement PDF parser (pdfplumber)
- Extracts holdings (61), transactions (92), pending trades from statement
- Computes derived stats: ETF/stock split, top 10 concentration, dividend analysis
- API endpoints: upload, list, retrieve, parse-local for Robinhood statements
- Robinhood dashboard page with 4 tabs: Overview, Holdings, Transactions, Dividends
- Interactive treemap for top 10 holdings visualization
- Stocks vs ETFs pie chart with value breakdown
- Sortable holdings table with weight bars and yield display
- Daily investment bar chart on transactions tab
- Dividend income by ticker chart and top yielders table
- Drag-and-drop PDF upload with parsing feedback
- Monthly activity summary: invested, dividends, deposits, cashback

### Dependencies
- Added pdfplumber>=0.11.0 for PDF text/table extraction
- Added python-multipart>=0.0.9 for file upload handling

## [0.5.0] - 2026-06-05

### Added
- Investment portfolio tracking — add/remove holdings with weighted avg cost
- Live stock prices from Yahoo Finance with 15-minute caching
- Portfolio dashboard page — summary cards, holdings table, gain/loss per ticker
- Dip watchlist — monitor stocks for drops from 52-week high
- Dip alert system with configurable thresholds per ticker
- Quick price lookup widget in portfolio page
- Three-tab UI: Holdings | Watchlist | Dip Alerts
- Telegram commands: /portfolio, /buy, /sell, /price, /watch, /unwatch, /dips
- Natural language support for portfolio queries ("my stocks", "watchlist", "dips")

## [0.3.0] - 2026-05-14

### Added
- Complete CSS variable design system with light/dark mode support
- Sidebar navigation with Dashboard, Pipeline, History, Settings pages
- Sankey flow diagram (Monarch Money style) — income → categories → individual items
- Dark mode toggle with system preference detection
- Mobile responsive layout with hamburger menu
- Animated page transitions and hover effects

### Changed
- All components migrated from hardcoded Tailwind colors to CSS variables
- Dashboard, History, and Settings cards upgraded to rounded-2xl design
- Recharts tooltips styled for dark mode compatibility
- Form inputs use design system tokens for consistent theming

## [0.2.0] - 2026-05-12

### Added
- SQLite database for storing pipeline run snapshots
- Balance and net worth tracking over time
- Loan payoff projection with amortization curve
- Emergency fund projection with progress bar
- History page with trend charts (Recharts)
- Save Snapshot button to record monthly data points

## [0.1.0] - 2026-05-12

### Added
- Core pipeline engine — reads YAML config, calculates allocations
- Dynamic allocation rules (percentages shift as loan balance decreases)
- Emergency fund bucket with cap (stops filling at 2x monthly expenses)
- USD → INR conversion for education loan payments
- FastAPI backend with REST API
- React dashboard with pie chart, allocation breakdown, transfer instructions
- Settings page — edit income, balances, expenses, bucket %, and forex from UI
- Config system: private `config.yaml` (gitignored) + public `example-config.yaml`
- One-command startup via `start.sh`
- Python tests for engine logic
- Proper dev setup: pyenv, fnm, uv, pnpm
