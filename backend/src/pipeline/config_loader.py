"""Load and validate pipeline configuration from YAML files."""

from __future__ import annotations

from pathlib import Path

import yaml

from pipeline.models import (
    Balance,
    Bucket,
    DisplayConfig,
    FixedExpense,
    ForexConfig,
    FundTarget,
    IncomeSource,
    PipelineConfig,
)


def load_config(config_path: str | Path) -> PipelineConfig:
    """Load pipeline config from a YAML file.

    Args:
        config_path: Path to the YAML config file.

    Returns:
        Validated PipelineConfig object.

    Raises:
        FileNotFoundError: If config file doesn't exist.
        ValueError: If config is invalid.
    """
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(
            f"Config file not found: {path}\n"
            "Copy config/example-config.yaml to config/config.yaml and fill in your values."
        )

    with open(path) as f:
        raw = yaml.safe_load(f)

    if not raw:
        raise ValueError("Config file is empty")

    return _parse_config(raw)


def _parse_config(raw: dict) -> PipelineConfig:
    """Parse raw YAML dict into a validated PipelineConfig."""

    # Parse income sources
    income = {}
    for name, data in raw.get("income", {}).items():
        income[name] = IncomeSource(**data)

    # Parse balances
    balances = {}
    for name, data in raw.get("balances", {}).items():
        balances[name] = Balance(**data)

    # Parse fixed expenses
    fixed_expenses = [FixedExpense(**exp) for exp in raw.get("fixed_expenses", [])]

    # Parse buckets
    buckets = []
    for b in raw.get("buckets", []):
        # Handle nested target object
        if "target" in b and b["target"] is not None:
            b["target"] = FundTarget(**b["target"])
        buckets.append(Bucket(**b))

    # Validate bucket percentages add to 100
    total_pct = sum(b.percentage for b in buckets)
    if abs(total_pct - 100) > 0.01:
        raise ValueError(
            f"Bucket percentages must add up to 100, got {total_pct}. "
            f"Buckets: {[(b.name, b.percentage) for b in buckets]}"
        )

    # Parse forex
    forex = {}
    for pair, data in raw.get("forex", {}).items():
        forex[pair] = ForexConfig(**data)

    # Parse display settings
    display_raw = raw.get("display", {})
    display = DisplayConfig(**display_raw) if display_raw else DisplayConfig()

    return PipelineConfig(
        income=income,
        balances=balances,
        fixed_expenses=fixed_expenses,
        buckets=buckets,
        forex=forex,
        display=display,
    )
