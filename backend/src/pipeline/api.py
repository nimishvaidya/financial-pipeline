"""FastAPI routes for the financial pipeline."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from pipeline.config_loader import load_config
from pipeline.config_writer import (
    get_full_config,
    update_balances,
    update_bucket_percentages,
    update_fixed_expenses,
    update_forex,
    update_income,
)
from pipeline.database import (
    add_extra_income,
    delete_extra_income,
    get_balance_history,
    get_connection,
    get_extra_income,
    get_net_worth_history,
    get_run_history,
    save_pipeline_run,
)
from pipeline.forex_service import get_rate, get_rate_for_engine
from pipeline.portfolio import (
    add_holding,
    remove_holding,
    get_portfolio_summary,
    add_to_watchlist,
    remove_from_watchlist,
    get_watchlist,
    check_dips,
    get_pending_alerts,
    acknowledge_alert,
    get_stock_price,
)
from pipeline.chat import check_ollama, chat, chat_stream
from pipeline.robinhood_parser import parse_robinhood_pdf
from pipeline.engine import PipelineEngine
from pipeline.models import PipelineConfig, PipelineOutput
from pipeline.projections import calculate_emergency_fund_projection, calculate_loan_payoff

app = FastAPI(
    title="Financial Pipeline API",
    description="Config-driven salary splitting, loan tracking, and investment allocation",
    version="0.2.0",
)

# Allow React frontend to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Default config path — can be overridden via env var
CONFIG_PATH = Path(__file__).parent.parent.parent.parent / "config" / "config.yaml"


def _get_config() -> PipelineConfig:
    """Load config, raising HTTP 404 if not found."""
    try:
        return load_config(CONFIG_PATH)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


# --- Read endpoints ---


@app.get("/")
def root():
    """Health check."""
    return {"status": "ok", "service": "financial-pipeline", "version": "0.2.0"}


@app.get("/api/config")
def get_config():
    """Return the current pipeline config (excluding sensitive data)."""
    config = _get_config()
    return {
        "buckets": [
            {"name": b.name, "percentage": b.percentage, "description": b.description}
            for b in config.buckets
        ],
        "fixed_expenses": [
            {"name": e.name, "amount": e.amount, "currency": e.currency}
            for e in config.fixed_expenses
        ],
        "display": config.display.model_dump(),
    }


@app.get("/api/config/full")
def get_config_full():
    """Return the full raw config for the settings UI."""
    try:
        return get_full_config(CONFIG_PATH)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@app.get("/api/run", response_model=PipelineOutput)
def run_pipeline():
    """Run the pipeline and return allocations + transfer instructions."""
    config = _get_config()
    engine = PipelineEngine(config)
    return engine.run()


@app.post("/api/run")
def run_and_save_pipeline():
    """Run the pipeline AND save a snapshot to history."""
    config = _get_config()
    engine = PipelineEngine(config)
    result = engine.run()

    # Save to database
    conn = get_connection()
    try:
        balances = {
            name: {
                "amount": bal.amount,
                "currency": bal.currency.value,
                "interest_rate": bal.interest_rate,
            }
            for name, bal in config.balances.items()
        }

        # Get live forex rate for net worth calculation
        live_rate = get_rate_for_engine(conn, "USD", "INR",
            fallback=config.forex.get("usd_inr", type("", (), {"rate": 83.50})).rate)

        run_id = save_pipeline_run(
            conn=conn,
            run_date=result.run_date,
            total_income=result.total_income,
            total_fixed_expenses=result.total_fixed_expenses,
            remainder=result.remainder_for_buckets,
            allocations=[a.model_dump() for a in result.allocations],
            instructions=[i.model_dump() for i in result.transfer_instructions],
            emergency_fund_status=result.emergency_fund_status,
            balances=balances,
            usd_inr_rate=live_rate,
        )
        return {"status": "ok", "run_id": run_id, "result": result}
    finally:
        conn.close()


@app.get("/api/balances")
def get_balances():
    """Return current balances for all tracked accounts."""
    config = _get_config()
    return {
        name: {
            "amount": bal.amount,
            "currency": bal.currency,
            "interest_rate": bal.interest_rate,
            "lender": bal.lender,
        }
        for name, bal in config.balances.items()
    }


@app.get("/api/emergency-fund")
def get_emergency_fund_status():
    """Return emergency fund progress."""
    config = _get_config()
    engine = PipelineEngine(config)
    return {"status": engine._emergency_fund_status()}


# --- History endpoints ---


@app.get("/api/history/runs")
def get_history():
    """Get recent pipeline run history."""
    conn = get_connection()
    try:
        return get_run_history(conn)
    finally:
        conn.close()


@app.get("/api/history/balances")
def get_history_balances(account: str | None = None):
    """Get balance history over time, optionally filtered by account."""
    conn = get_connection()
    try:
        return get_balance_history(conn, account)
    finally:
        conn.close()


@app.get("/api/history/net-worth")
def get_history_net_worth():
    """Get net worth history over time."""
    conn = get_connection()
    try:
        return get_net_worth_history(conn)
    finally:
        conn.close()


# --- Projection endpoints ---


@app.get("/api/projections/loan/{loan_name}")
def get_loan_projection(loan_name: str):
    """Get loan payoff projection for a specific loan."""
    config = _get_config()

    # Find the loan balance
    if loan_name not in config.balances:
        raise HTTPException(status_code=404, detail=f"Loan '{loan_name}' not found")

    balance = config.balances[loan_name]

    # Find how much is allocated to this loan
    engine = PipelineEngine(config)
    result = engine.run()
    monthly_payment = 0.0
    for alloc in result.allocations:
        if alloc.bucket_name == loan_name:
            monthly_payment = alloc.amount
            break

    # For loans with INR currency, use the converted amount
    loan_balance = balance.amount
    if balance.currency.value == "INR" and monthly_payment > 0:
        # Convert monthly payment to INR — use live rate, fall back to config
        conn_fx = get_connection()
        try:
            forex_rate = get_rate_for_engine(conn_fx, "USD", "INR",
                fallback=config.forex.get("usd_inr", type("", (), {"rate": 83.50})).rate)
        finally:
            conn_fx.close()
        monthly_payment_inr = monthly_payment * forex_rate
        projection = calculate_loan_payoff(
            loan_name=loan_name,
            balance=loan_balance,
            currency="INR",
            annual_interest_rate=balance.interest_rate,
            monthly_payment=monthly_payment_inr,
        )
    else:
        projection = calculate_loan_payoff(
            loan_name=loan_name,
            balance=loan_balance,
            currency=balance.currency.value,
            annual_interest_rate=balance.interest_rate,
            monthly_payment=monthly_payment,
        )

    return {
        "loan_name": projection.loan_name,
        "current_balance": projection.current_balance,
        "currency": projection.currency,
        "monthly_payment": projection.monthly_payment,
        "interest_rate": projection.interest_rate,
        "months_remaining": projection.months_remaining,
        "payoff_date": projection.payoff_date,
        "total_interest_paid": projection.total_interest_paid,
        "monthly_breakdown": projection.monthly_breakdown,
    }


@app.get("/api/projections/emergency-fund")
def get_emergency_fund_projection():
    """Get emergency fund projection."""
    config = _get_config()
    engine = PipelineEngine(config)
    result = engine.run()

    # Find emergency fund allocation
    monthly_contribution = 0.0
    for alloc in result.allocations:
        if alloc.bucket_name == "emergency_fund":
            monthly_contribution = alloc.amount
            break

    current_balance = config.balances.get("emergency_fund")
    if not current_balance:
        raise HTTPException(status_code=404, detail="No emergency fund configured")

    target = engine._calculate_target("emergency_fund")

    return calculate_emergency_fund_projection(
        current_balance=current_balance.amount,
        monthly_contribution=monthly_contribution,
        target=target,
    )


# --- Live Forex endpoints ---


@app.get("/api/forex/live")
def get_live_forex(base: str = "USD", target: str = "INR"):
    """Get current exchange rate with cache info."""
    conn = get_connection()
    try:
        result = get_rate(conn, base, target)
        return result
    finally:
        conn.close()


@app.post("/api/forex/refresh")
def refresh_forex(base: str = "USD", target: str = "INR"):
    """Force refresh the exchange rate from API."""
    conn = get_connection()
    try:
        result = get_rate(conn, base, target, force_refresh=True)
        return result
    finally:
        conn.close()


# --- Extra Income endpoints ---

class AddExtraIncomeRequest(BaseModel):
    income_date: str
    amount: float
    currency: str = "USD"
    category: str = "bonus"
    note: str | None = None

@app.get("/api/extra-income")
def list_extra_income(year: int | None = None, month: int | None = None):
    """List extra income entries, optionally filtered by year/month."""
    conn = get_connection()
    try:
        return get_extra_income(conn, year, month)
    finally:
        conn.close()

@app.post("/api/extra-income")
def create_extra_income(req: AddExtraIncomeRequest):
    """Add a one-time extra income entry."""
    conn = get_connection()
    try:
        income_id = add_extra_income(
            conn, req.income_date, req.amount, req.currency, req.category, req.note
        )
        return {"status": "ok", "id": income_id}
    finally:
        conn.close()

@app.delete("/api/extra-income/{income_id}")
def remove_extra_income(income_id: int):
    """Delete an extra income entry."""
    conn = get_connection()
    try:
        delete_extra_income(conn, income_id)
        return {"status": "ok"}
    finally:
        conn.close()


# --- Portfolio/Investment endpoints ---


class AddHoldingRequest(BaseModel):
    ticker: str
    shares: float
    avg_cost: float


class WatchlistRequest(BaseModel):
    ticker: str
    threshold_pct: float = 5.0


@app.get("/api/portfolio/summary")
def portfolio_summary():
    """Get portfolio summary with live prices."""
    conn = get_connection()
    try:
        return get_portfolio_summary(conn)
    finally:
        conn.close()


@app.post("/api/portfolio/holdings")
def add_portfolio_holding(req: AddHoldingRequest):
    """Add or update a holding."""
    conn = get_connection()
    try:
        add_holding(conn, req.ticker, req.shares, req.avg_cost)
        return {"status": "ok", "ticker": req.ticker.upper()}
    finally:
        conn.close()


@app.delete("/api/portfolio/holdings/{ticker}")
def delete_portfolio_holding(ticker: str):
    """Remove a holding."""
    conn = get_connection()
    try:
        remove_holding(conn, ticker)
        return {"status": "ok"}
    finally:
        conn.close()


@app.get("/api/portfolio/price/{ticker}")
def get_price(ticker: str):
    """Get current stock price."""
    conn = get_connection()
    try:
        result = get_stock_price(conn, ticker)
        if not result:
            raise HTTPException(status_code=404, detail=f"Could not fetch price for {ticker}")
        return result
    finally:
        conn.close()


@app.get("/api/portfolio/watchlist")
def list_watchlist():
    """Get the dip watchlist."""
    conn = get_connection()
    try:
        return get_watchlist(conn)
    finally:
        conn.close()


@app.post("/api/portfolio/watchlist")
def add_watchlist_item(req: WatchlistRequest):
    """Add a ticker to the dip watchlist."""
    conn = get_connection()
    try:
        add_to_watchlist(conn, req.ticker, req.threshold_pct)
        return {"status": "ok", "ticker": req.ticker.upper()}
    finally:
        conn.close()


@app.delete("/api/portfolio/watchlist/{ticker}")
def remove_watchlist_item(ticker: str):
    """Remove a ticker from the dip watchlist."""
    conn = get_connection()
    try:
        remove_from_watchlist(conn, ticker)
        return {"status": "ok"}
    finally:
        conn.close()


@app.get("/api/portfolio/dip-check")
def run_dip_check():
    """Check watchlist for dips and return any new alerts."""
    conn = get_connection()
    try:
        return check_dips(conn)
    finally:
        conn.close()


@app.get("/api/portfolio/alerts")
def list_alerts():
    """Get pending dip alerts."""
    conn = get_connection()
    try:
        return get_pending_alerts(conn)
    finally:
        conn.close()


@app.post("/api/portfolio/alerts/{alert_id}/acknowledge")
def ack_alert(alert_id: int):
    """Acknowledge a dip alert."""
    conn = get_connection()
    try:
        acknowledge_alert(conn, alert_id)
        return {"status": "ok"}
    finally:
        conn.close()


# --- Robinhood Statement endpoints ---

# Store parsed statements in memory (keyed by filename)
_parsed_statements: dict[str, dict] = {}

DATA_DIR = Path(__file__).parent.parent.parent.parent / "data"


@app.post("/api/robinhood/upload")
async def upload_robinhood_statement(file: UploadFile = File(...)):
    """Upload and parse a Robinhood monthly statement PDF."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    # Save to data directory
    DATA_DIR.mkdir(exist_ok=True)
    save_path = DATA_DIR / f"robinhood_{file.filename}"
    content = await file.read()
    save_path.write_bytes(content)

    try:
        stmt = parse_robinhood_pdf(save_path)
        parsed = stmt.to_dict()
        _parsed_statements[file.filename] = parsed
        return {"status": "ok", "filename": file.filename, "data": parsed}
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse PDF: {e}") from e


@app.get("/api/robinhood/statements")
def list_robinhood_statements():
    """List available parsed statements."""
    return {"statements": list(_parsed_statements.keys())}


@app.get("/api/robinhood/statement/{filename}")
def get_robinhood_statement(filename: str):
    """Get a previously parsed statement."""
    if filename not in _parsed_statements:
        # Try to parse from disk
        save_path = DATA_DIR / f"robinhood_{filename}"
        if save_path.exists():
            try:
                stmt = parse_robinhood_pdf(save_path)
                _parsed_statements[filename] = stmt.to_dict()
            except Exception as e:
                raise HTTPException(status_code=422, detail=str(e)) from e
        else:
            raise HTTPException(status_code=404, detail="Statement not found")
    return _parsed_statements[filename]


@app.post("/api/robinhood/parse-local")
def parse_local_robinhood(path: str = ""):
    """Parse a Robinhood PDF from the data directory."""
    if not path:
        # Find the most recent PDF in data/
        pdfs = sorted(DATA_DIR.glob("robinhood_*.pdf")) if DATA_DIR.exists() else []
        if not pdfs:
            raise HTTPException(status_code=404, detail="No Robinhood PDFs found in data/")
        pdf_path = pdfs[-1]
    else:
        pdf_path = Path(path)

    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {pdf_path}")

    try:
        stmt = parse_robinhood_pdf(pdf_path)
        parsed = stmt.to_dict()
        _parsed_statements[pdf_path.name] = parsed
        return {"status": "ok", "filename": pdf_path.name, "data": parsed}
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


# --- Chat endpoints ---


class ChatRequest(BaseModel):
    messages: list[dict]
    model: str = "llama3.2"


@app.get("/api/chat/status")
def chat_status():
    """Check if Ollama is running and list available models."""
    return check_ollama()


@app.post("/api/chat")
def chat_endpoint(req: ChatRequest):
    """Send a message to the portfolio chatbot."""
    response = chat(req.messages, model=req.model)
    return {"response": response}


@app.post("/api/chat/stream")
def chat_stream_endpoint(req: ChatRequest):
    """Stream a response from the portfolio chatbot."""
    from fastapi.responses import StreamingResponse

    def generate():
        for chunk in chat_stream(req.messages, model=req.model):
            yield f"data: {json.dumps({'content': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# --- Update endpoints ---


class UpdateBalancesRequest(BaseModel):
    balances: dict


@app.put("/api/balances")
def put_balances(req: UpdateBalancesRequest):
    """Update balance amounts."""
    try:
        updated = update_balances(CONFIG_PATH, req.balances)
        return {"status": "ok", "balances": updated}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


class UpdateIncomeRequest(BaseModel):
    income: dict


@app.put("/api/income")
def put_income(req: UpdateIncomeRequest):
    """Update income values."""
    try:
        updated = update_income(CONFIG_PATH, req.income)
        return {"status": "ok", "income": updated}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


class UpdateExpensesRequest(BaseModel):
    expenses: list[dict]


@app.put("/api/expenses")
def put_expenses(req: UpdateExpensesRequest):
    """Update fixed expenses."""
    try:
        updated = update_fixed_expenses(CONFIG_PATH, req.expenses)
        return {"status": "ok", "fixed_expenses": updated}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


class UpdateBucketsRequest(BaseModel):
    buckets: dict


@app.put("/api/buckets")
def put_buckets(req: UpdateBucketsRequest):
    """Update bucket percentages."""
    try:
        updated = update_bucket_percentages(CONFIG_PATH, req.buckets)
        return {"status": "ok", "buckets": updated}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


class UpdateForexRequest(BaseModel):
    forex: dict


@app.put("/api/forex")
def put_forex(req: UpdateForexRequest):
    """Update forex rates."""
    try:
        updated = update_forex(CONFIG_PATH, req.forex)
        return {"status": "ok", "forex": updated}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
