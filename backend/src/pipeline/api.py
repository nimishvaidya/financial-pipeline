"""FastAPI routes for the financial pipeline."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from pipeline.config_loader import load_config
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
