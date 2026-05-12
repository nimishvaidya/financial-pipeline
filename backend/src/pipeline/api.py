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
from pipeline.engine import PipelineEngine
from pipeline.models import PipelineConfig, PipelineOutput

app = FastAPI(
    title="Financial Pipeline API",
    description="Config-driven salary splitting, loan tracking, and investment allocation",
    version="0.1.0",
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
    return {"status": "ok", "service": "financial-pipeline", "version": "0.1.0"}


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


# --- Update endpoints ---


class UpdateBalancesRequest(BaseModel):
    balances: dict  # {"edu_loan": {"amount": 2500000}, ...}


@app.put("/api/balances")
def put_balances(req: UpdateBalancesRequest):
    """Update balance amounts."""
    try:
        updated = update_balances(CONFIG_PATH, req.balances)
        return {"status": "ok", "balances": updated}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


class UpdateIncomeRequest(BaseModel):
    income: dict  # {"salary": {"amount": 5500}}


@app.put("/api/income")
def put_income(req: UpdateIncomeRequest):
    """Update income values."""
    try:
        updated = update_income(CONFIG_PATH, req.income)
        return {"status": "ok", "income": updated}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


class UpdateExpensesRequest(BaseModel):
    expenses: list[dict]  # [{"name": "rent", "amount": 1200, "currency": "USD"}, ...]


@app.put("/api/expenses")
def put_expenses(req: UpdateExpensesRequest):
    """Update fixed expenses."""
    try:
        updated = update_fixed_expenses(CONFIG_PATH, req.expenses)
        return {"status": "ok", "fixed_expenses": updated}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


class UpdateBucketsRequest(BaseModel):
    buckets: dict  # {"edu_loan": 40, "investing": 30}


@app.put("/api/buckets")
def put_buckets(req: UpdateBucketsRequest):
    """Update bucket percentages."""
    try:
        updated = update_bucket_percentages(CONFIG_PATH, req.buckets)
        return {"status": "ok", "buckets": updated}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


class UpdateForexRequest(BaseModel):
    forex: dict  # {"usd_inr": {"rate": 84.50}}


@app.put("/api/forex")
def put_forex(req: UpdateForexRequest):
    """Update forex rates."""
    try:
        updated = update_forex(CONFIG_PATH, req.forex)
        return {"status": "ok", "forex": updated}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
