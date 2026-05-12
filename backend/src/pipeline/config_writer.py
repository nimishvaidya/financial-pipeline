"""Write updated config values back to the YAML config file."""

from __future__ import annotations

from pathlib import Path

import yaml


def _load_raw(config_path: Path) -> dict:
    """Load raw YAML as dict."""
    with open(config_path) as f:
        return yaml.safe_load(f) or {}


def _save_raw(config_path: Path, data: dict) -> None:
    """Write dict back to YAML, preserving readability."""
    with open(config_path, "w") as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False, allow_unicode=True)


def update_balances(config_path: Path, balances: dict) -> dict:
    """Update balance amounts in config.

    Args:
        config_path: Path to config.yaml
        balances: Dict of {balance_name: {field: value}} to update.
                  e.g. {"edu_loan": {"amount": 2500000}, "emergency_fund": {"amount": 1000}}
    """
    raw = _load_raw(config_path)

    for name, updates in balances.items():
        if name in raw.get("balances", {}):
            for field, value in updates.items():
                raw["balances"][name][field] = value

    _save_raw(config_path, raw)
    return raw["balances"]


def update_income(config_path: Path, income: dict) -> dict:
    """Update income values.

    Args:
        income: e.g. {"salary": {"amount": 5500}}
    """
    raw = _load_raw(config_path)

    for name, updates in income.items():
        if name in raw.get("income", {}):
            for field, value in updates.items():
                raw["income"][name][field] = value

    _save_raw(config_path, raw)
    return raw["income"]


def update_fixed_expenses(config_path: Path, expenses: list[dict]) -> list:
    """Replace fixed expenses list entirely.

    Args:
        expenses: List of {"name": str, "amount": float, "currency": str}
    """
    raw = _load_raw(config_path)
    raw["fixed_expenses"] = expenses
    _save_raw(config_path, raw)
    return raw["fixed_expenses"]


def update_bucket_percentages(config_path: Path, buckets: dict) -> list:
    """Update bucket base percentages.

    Args:
        buckets: Dict of {bucket_name: percentage}
                 e.g. {"edu_loan": 40, "investing": 30}
    """
    raw = _load_raw(config_path)

    for bucket in raw.get("buckets", []):
        if bucket["name"] in buckets:
            bucket["percentage"] = buckets[bucket["name"]]

    _save_raw(config_path, raw)
    return raw["buckets"]


def update_forex(config_path: Path, forex: dict) -> dict:
    """Update forex rates.

    Args:
        forex: e.g. {"usd_inr": {"rate": 84.50}}
    """
    raw = _load_raw(config_path)

    for pair, updates in forex.items():
        if pair in raw.get("forex", {}):
            for field, value in updates.items():
                raw["forex"][pair][field] = value

    _save_raw(config_path, raw)
    return raw["forex"]


def get_full_config(config_path: Path) -> dict:
    """Return the full raw config for the settings UI."""
    return _load_raw(config_path)
