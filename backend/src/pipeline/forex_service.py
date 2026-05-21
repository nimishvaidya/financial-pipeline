"""Live forex rate service with daily caching."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError

# Free ExchangeRate-API endpoint (no key required)
EXCHANGE_RATE_API_URL = "https://open.er-api.com/v6/latest/USD"

# Cache duration
CACHE_DURATION_HOURS = 24


def _ensure_forex_table(conn: sqlite3.Connection) -> None:
    """Create forex_cache table if it doesn't exist."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS forex_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            base_currency TEXT NOT NULL,
            target_currency TEXT NOT NULL,
            rate REAL NOT NULL,
            fetched_at TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'exchangerate-api',
            UNIQUE(base_currency, target_currency)
        )
    """)
    conn.commit()


def get_cached_rate(conn: sqlite3.Connection, base: str = "USD", target: str = "INR") -> dict | None:
    """Get cached rate if it exists and is fresh (within CACHE_DURATION_HOURS).

    Returns dict with rate, fetched_at, is_stale fields, or None if no cache.
    """
    _ensure_forex_table(conn)
    row = conn.execute(
        "SELECT rate, fetched_at, source FROM forex_cache WHERE base_currency = ? AND target_currency = ?",
        (base, target)
    ).fetchone()

    if not row:
        return None

    fetched_at = datetime.fromisoformat(row["fetched_at"])
    is_stale = datetime.now() - fetched_at > timedelta(hours=CACHE_DURATION_HOURS)

    return {
        "base": base,
        "target": target,
        "rate": row["rate"],
        "fetched_at": row["fetched_at"],
        "source": row["source"],
        "is_stale": is_stale,
        "cache_age_hours": round((datetime.now() - fetched_at).total_seconds() / 3600, 1),
    }


def fetch_live_rate(base: str = "USD", target: str = "INR") -> float | None:
    """Fetch live exchange rate from ExchangeRate-API.

    Returns the rate as a float, or None if the request fails.
    """
    try:
        url = f"https://open.er-api.com/v6/latest/{base}"
        req = Request(url, headers={"User-Agent": "FinancialPipeline/1.0"})
        with urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode())
            if data.get("result") == "success" and target in data.get("rates", {}):
                return data["rates"][target]
    except (URLError, json.JSONDecodeError, KeyError, OSError):
        return None
    return None


def update_cached_rate(conn: sqlite3.Connection, base: str, target: str, rate: float, source: str = "exchangerate-api") -> None:
    """Insert or update the cached rate."""
    _ensure_forex_table(conn)
    now = datetime.now().isoformat()
    conn.execute(
        """
        INSERT INTO forex_cache (base_currency, target_currency, rate, fetched_at, source)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(base_currency, target_currency)
        DO UPDATE SET rate = excluded.rate, fetched_at = excluded.fetched_at, source = excluded.source
        """,
        (base, target, rate, now, source)
    )
    conn.commit()


def get_rate(conn: sqlite3.Connection, base: str = "USD", target: str = "INR", force_refresh: bool = False) -> dict:
    """Get the exchange rate, fetching from API if cache is stale or missing.

    Returns dict with rate, fetched_at, source, is_stale, was_refreshed fields.
    """
    cached = get_cached_rate(conn, base, target)

    if cached and not cached["is_stale"] and not force_refresh:
        return {**cached, "was_refreshed": False}

    # Try to fetch live rate
    live_rate = fetch_live_rate(base, target)

    if live_rate is not None:
        update_cached_rate(conn, base, target, live_rate)
        fresh = get_cached_rate(conn, base, target)
        return {**fresh, "was_refreshed": True}

    # If fetch failed but we have a stale cache, return it with a warning
    if cached:
        return {**cached, "was_refreshed": False, "fetch_failed": True}

    # No cache and fetch failed — return None rate with error
    return {
        "base": base,
        "target": target,
        "rate": None,
        "fetched_at": None,
        "source": None,
        "is_stale": True,
        "cache_age_hours": None,
        "was_refreshed": False,
        "fetch_failed": True,
    }


def get_rate_for_engine(conn: sqlite3.Connection, base: str = "USD", target: str = "INR", fallback: float = 83.50) -> float:
    """Convenience function for the pipeline engine — returns just the rate number.

    Falls back to the provided default if API and cache both fail.
    """
    result = get_rate(conn, base, target)
    return result["rate"] if result["rate"] is not None else fallback
