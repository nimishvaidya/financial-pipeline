# Changelog

All notable changes to this project will be documented in this file.

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
