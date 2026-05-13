"""FastAPI routes for the financial pipeline."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
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
    get_balance_history,
    get_connection,
    get_net_worth_history,
    get_run_history,
    save_pipeline_run,
)
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
        # Convert monthly payment to INR
        forex_rate = 83.50
        if "usd_inr" in config.forex:
            forex_rate = config.forex["usd_inr"].rate
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
