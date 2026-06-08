"""Portfolio chatbot powered by Ollama (local LLM).

Gathers financial context from the pipeline, builds a system prompt,
and streams responses from a locally running Ollama model.
"""

from __future__ import annotations

import json
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError

from pipeline.config_loader import load_config
from pipeline.database import (
    get_connection,
    get_latest_balances,
    get_net_worth_history,
)
from pipeline.portfolio import get_portfolio_summary, get_watchlist, get_pending_alerts

OLLAMA_URL = "http://localhost:11434"
DEFAULT_MODEL = "llama3.2"
CONFIG_PATH = Path(__file__).resolve().parents[3] / "config" / "config.yaml"
DATA_DIR = Path(__file__).resolve().parents[3] / "data"


def _gather_context() -> str:
    """Collect all financial data into a text summary for the LLM."""
    sections = []

    # 1. Pipeline config (income, buckets, expenses, loans)
    try:
        cfg = load_config(CONFIG_PATH)
        income = cfg.income
        sections.append(
            f"## Income\n"
            f"- Gross salary: ${income.gross_monthly:,.2f}/month\n"
            f"- Net salary: ${income.net_monthly:,.2f}/month\n"
            f"- Employer: {income.employer}\n"
            f"- Pay frequency: {income.pay_frequency}"
        )

        if cfg.buckets:
            bucket_lines = []
            for b in cfg.buckets:
                bucket_lines.append(f"- {b.name}: {b.pct}% (${income.net_monthly * b.pct / 100:,.2f}/mo)")
            sections.append("## Budget Buckets\n" + "\n".join(bucket_lines))

        if cfg.fixed_expenses:
            exp_lines = [f"- {e.name}: ${e.amount:,.2f}/mo" for e in cfg.fixed_expenses]
            total_exp = sum(e.amount for e in cfg.fixed_expenses)
            exp_lines.append(f"- **Total fixed expenses: ${total_exp:,.2f}/mo**")
            sections.append("## Fixed Expenses\n" + "\n".join(exp_lines))

        if cfg.loans:
            loan_lines = []
            for l in cfg.loans:
                loan_lines.append(
                    f"- {l.name}: ${l.balance:,.2f} remaining, "
                    f"${l.monthly_payment:,.2f}/mo, {l.interest_rate}% APR"
                )
            sections.append("## Loans\n" + "\n".join(loan_lines))

    except Exception:
        sections.append("## Income/Budget\n(Config not loaded)")

    # 2. Account balances
    try:
        conn = get_connection()
        balances = get_latest_balances(conn)
        if balances:
            bal_lines = []
            total = 0
            for name, info in balances.items():
                bal_lines.append(f"- {name}: ${info['balance']:,.2f}")
                total += info["balance"]
            bal_lines.append(f"- **Total across accounts: ${total:,.2f}**")
            sections.append("## Account Balances\n" + "\n".join(bal_lines))

        # Net worth trend
        nw = get_net_worth_history(conn)
        if nw and len(nw) >= 2:
            latest = nw[-1]
            prev = nw[-2]
            change = latest["total_net_worth"] - prev["total_net_worth"]
            sections.append(
                f"## Net Worth Trend\n"
                f"- Current: ${latest['total_net_worth']:,.2f}\n"
                f"- Previous snapshot: ${prev['total_net_worth']:,.2f}\n"
                f"- Change: ${change:+,.2f}"
            )
        conn.close()
    except Exception:
        pass

    # 3. Investment portfolio
    try:
        conn = get_connection()
        summary = get_portfolio_summary(conn)
        if summary and summary.get("holdings"):
            port_lines = [
                f"- Portfolio value: ${summary['total_value']:,.2f}",
                f"- Total cost basis: ${summary['total_cost']:,.2f}",
                f"- Total gain/loss: ${summary['total_gain']:+,.2f} ({summary['total_gain_pct']:+.1f}%)",
                f"- Number of holdings: {len(summary['holdings'])}",
            ]
            sections.append("## Investment Portfolio (Tracked)\n" + "\n".join(port_lines))

            # Individual holdings
            hold_lines = []
            for h in sorted(summary["holdings"], key=lambda x: x["market_value"], reverse=True):
                hold_lines.append(
                    f"  {h['ticker']}: {h['shares']:.2f} shares @ ${h['current_price']:.2f} "
                    f"= ${h['market_value']:,.2f} (cost ${h['avg_cost']:.2f}, "
                    f"{'gain' if h['gain'] >= 0 else 'loss'} ${abs(h['gain']):,.2f})"
                )
            sections.append("### Holdings Detail\n" + "\n".join(hold_lines))

        # Watchlist
        watchlist = get_watchlist(conn)
        if watchlist:
            wl_lines = [f"- {w['ticker']} (alert if drops {w['dip_threshold_pct']}% from 52w high)" for w in watchlist]
            sections.append("## Dip Watchlist\n" + "\n".join(wl_lines))

        # Pending alerts
        alerts = get_pending_alerts(conn)
        if alerts:
            al_lines = [f"- {a['ticker']}: down {a['drop_pct']}% from 52w high (${a['price_at_alert']:.2f})" for a in alerts]
            sections.append("## Active Dip Alerts\n" + "\n".join(al_lines))

        conn.close()
    except Exception:
        pass

    # 4. Robinhood statement (most recent)
    try:
        from pipeline.robinhood_parser import parse_robinhood_pdf
        pdfs = sorted(DATA_DIR.glob("robinhood_*.pdf")) if DATA_DIR.exists() else []
        if pdfs:
            stmt = parse_robinhood_pdf(pdfs[-1])
            d = stmt.to_dict()
            s = d["summary"]
            st = d["stats"]
            sections.append(
                f"## Robinhood Account ({s['period']})\n"
                f"- Portfolio value: ${s['portfolio_value']:,.2f}\n"
                f"- Securities: ${s['total_securities']:,.2f} ({s['equities_pct']}%)\n"
                f"- Cash: ${s['cash_balance']:,.2f} ({s['cash_pct']}%)\n"
                f"- Holdings: {len(d['holdings'])} ({st['stock_count']} stocks, {st['etf_count']} ETFs)\n"
                f"- Top 10 concentration: {st['top_10_concentration']}%\n"
                f"- Monthly dividends: ${s['dividends_period']:.2f} | YTD: ${s['dividends_ytd']:.2f}\n"
                f"- Est. annual dividend income: ${st['total_est_annual_dividend']:.2f}\n"
                f"- Portfolio yield: {st['portfolio_yield']}%\n"
                f"- This month: invested ${st['total_invested_this_period']:.2f}, "
                f"{st['num_buys']} buys ({st['num_drip']} DRIP), "
                f"deposits ${st['total_deposits']:.2f}, cashback ${st['total_cashback']:.2f}"
            )

            # Top holdings from Robinhood
            top_lines = []
            for h in st["top_10"]:
                top_lines.append(f"  {h['ticker']}: ${h['value']:.2f} ({h['pct']}%)")
            sections.append("### Robinhood Top 10 Holdings\n" + "\n".join(top_lines))
    except Exception:
        pass

    return "\n\n".join(sections) if sections else "No financial data available yet."


SYSTEM_PROMPT = """You are a helpful personal finance assistant embedded in a financial pipeline app. You have access to the user's complete financial data shown below.

Your role:
- Answer questions about their finances clearly and concisely
- Provide insights about spending, savings, investments, and debt
- Help them understand their portfolio allocation and performance
- Suggest actionable improvements when asked
- Do basic calculations (e.g., "how long until my loan is paid off?")

Rules:
- Be concise — short paragraphs, no unnecessary filler
- Use dollar amounts and percentages when discussing finances
- If you don't have enough data to answer, say so
- Never make up numbers — only use data provided below
- You are NOT a licensed financial advisor — mention this if giving investment advice

---

# USER'S FINANCIAL DATA

{context}
"""


def check_ollama() -> dict:
    """Check if Ollama is running and which models are available."""
    try:
        req = Request(f"{OLLAMA_URL}/api/tags")
        with urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode())
            models = [m["name"] for m in data.get("models", [])]
            return {"running": True, "models": models}
    except Exception:
        return {"running": False, "models": []}


def chat(messages: list[dict], model: str = DEFAULT_MODEL) -> str:
    """Send messages to Ollama and return the full response (non-streaming)."""
    context = _gather_context()
    system = SYSTEM_PROMPT.format(context=context)

    ollama_messages = [{"role": "system", "content": system}]
    ollama_messages.extend(messages)

    payload = json.dumps({
        "model": model,
        "messages": ollama_messages,
        "stream": False,
    }).encode()

    req = Request(
        f"{OLLAMA_URL}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode())
            return data.get("message", {}).get("content", "Sorry, I couldn't generate a response.")
    except URLError as e:
        return f"Cannot reach Ollama at {OLLAMA_URL}. Make sure Ollama is running (`ollama serve`).\n\nError: {e}"
    except Exception as e:
        return f"Chat error: {e}"


def chat_stream(messages: list[dict], model: str = DEFAULT_MODEL):
    """Send messages to Ollama and yield response chunks (streaming)."""
    context = _gather_context()
    system = SYSTEM_PROMPT.format(context=context)

    ollama_messages = [{"role": "system", "content": system}]
    ollama_messages.extend(messages)

    payload = json.dumps({
        "model": model,
        "messages": ollama_messages,
        "stream": True,
    }).encode()

    req = Request(
        f"{OLLAMA_URL}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(req, timeout=120) as resp:
            for line in resp:
                if line.strip():
                    data = json.loads(line.decode())
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content
                    if data.get("done"):
                        break
    except URLError:
        yield f"Cannot reach Ollama at {OLLAMA_URL}. Make sure Ollama is running (`ollama serve`)."
    except Exception as e:
        yield f"Chat error: {e}"
