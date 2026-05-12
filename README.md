# Financial Pipeline

A config-driven personal finance pipeline that splits your income into buckets — loan repayment, expenses, emergency fund, and investing — with dynamic allocation rules that adjust automatically as your financial situation changes.

## Why?

Most budgeting tools are static. You set percentages and forget about them. But real financial planning is dynamic: as you pay off a loan, more money should flow to investing. Once your emergency fund is full, that allocation should redirect. This pipeline handles that logic for you.

## How it works

1. **Define your pipeline** in a YAML config: income, fixed expenses, and allocation buckets
2. **Set rules** for dynamic allocation (e.g., "when edu_loan balance < ₹10L, shift 25% to investing")
3. **Run the pipeline** — it calculates exactly how much goes where
4. **Follow the transfer instructions** — step-by-step, human-readable actions
5. **View the dashboard** — visual breakdown of your allocations, loan trajectory, and fund status

```
Salary ($5,000)
    │
    ├── Fixed Expenses ($2,110)
    │   ├── Rent: $1,200
    │   ├── Car: $350
    │   ├── Groceries: $400
    │   ├── Electricity: $100
    │   └── Internet: $60
    │
    └── Remainder ($2,890) — split by %
        ├── 50% → Edu Loan: $1,445 (≈ ₹1,20,658)
        ├── 20% → Emergency Fund: $578
        ├── 15% → Car Loan Extra: $433.50
        └── 15% → Investing: $433.50
```

## Quick start

### Prerequisites

- Python 3.12+ (via [pyenv](https://github.com/pyenv/pyenv))
- Node.js 20+ (via [fnm](https://github.com/Schniz/fnm))
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [pnpm](https://pnpm.io/) (Node package manager)

### Setup

```bash
# Clone
git clone git@github.com:nimishvaidya/financial-pipeline.git
cd financial-pipeline

# Create your config (private, gitignored)
cp config/example-config.yaml config/config.yaml
# Edit config/config.yaml with your real values

# Backend
cd backend
uv sync              # Creates .venv and installs dependencies
uv run pytest        # Run tests

# Frontend
cd ../frontend
pnpm install         # Install dependencies
```

### Run

Open two terminals:

```bash
# Terminal 1 — Backend API
cd backend
uv run uvicorn pipeline.api:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) to see your dashboard.

### API endpoints

| Endpoint | Description |
|---|---|
| `GET /` | Health check |
| `GET /api/run` | Run pipeline, get allocations + transfer instructions |
| `GET /api/config` | View current bucket config (no sensitive data) |
| `GET /api/balances` | View current balances |
| `GET /api/emergency-fund` | Emergency fund progress |

## Project structure

```
financial-pipeline/
├── backend/
│   ├── pyproject.toml          # Python dependencies (managed by uv)
│   ├── src/pipeline/
│   │   ├── api.py              # FastAPI routes
│   │   ├── engine.py           # Core allocation engine
│   │   ├── config_loader.py    # YAML config parser
│   │   └── models.py           # Pydantic data models
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Main app
│   │   └── components/
│   │       └── Dashboard.jsx   # Dashboard with charts
│   └── package.json
├── config/
│   └── example-config.yaml     # Template config (safe to commit)
├── .python-version             # pyenv auto-switches to this version
└── README.md
```

## Configuration

Copy `config/example-config.yaml` to `config/config.yaml` — your personal config is gitignored and never leaves your machine.

The config defines:

- **Income**: salary amount, currency, pay schedule
- **Balances**: current loan/fund balances (update monthly)
- **Fixed expenses**: rent, car payment, utilities — deducted first
- **Buckets**: where the remainder goes, with dynamic rules
- **Forex**: exchange rates for cross-currency transfers (USD → INR)

See the example config for full documentation of all options.

## Roadmap

- [x] Sprint 1: Core pipeline engine + basic React dashboard
- [ ] Sprint 2: Historical tracking (SQLite), loan payoff trajectory charts
- [ ] Sprint 3: Investment portfolio tracking, buy-the-dip logic
- [ ] Sprint 4: Telegram bot integration for on-the-go queries
- [ ] Sprint 5: Multi-currency optimization with live exchange rates

## License

MIT — see [LICENSE](LICENSE) for details.
