from __future__ import annotations
import json
from datetime import datetime, timedelta
from urllib.request import urlopen, Request
from urllib.error import URLError
import sqlite3


YAHOO_QUOTE_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1d"
PRICE_CACHE_MINUTES = 15


def _ensure_tables(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS holdings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL UNIQUE,
            shares REAL NOT NULL,
            avg_cost REAL NOT NULL,
            added_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS price_cache (
            ticker TEXT PRIMARY KEY,
            price REAL NOT NULL,
            previous_close REAL,
            day_change_pct REAL,
            high_52w REAL,
            low_52w REAL,
            fetched_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS dip_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            alert_type TEXT NOT NULL,
            drop_pct REAL NOT NULL,
            price_at_alert REAL NOT NULL,
            recent_high REAL NOT NULL,
            created_at TEXT NOT NULL,
            acknowledged INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS watchlist (
            ticker TEXT PRIMARY KEY,
            dip_threshold_pct REAL NOT NULL DEFAULT 5.0,
            added_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_dip_alerts_ticker ON dip_alerts(ticker);
    """)


def fetch_stock_price(ticker: str) -> dict | None:
    """Fetch current stock price from Yahoo Finance.
    Returns dict with: price, previous_close, day_change_pct, high_52w, low_52w
    or None on failure.
    """
    try:
        url = YAHOO_QUOTE_URL.format(ticker=ticker.upper())
        req = Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
        })
        with urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode())
            result = data["chart"]["result"][0]
            meta = result["meta"]
            price = meta["regularMarketPrice"]
            prev_close = meta.get("chartPreviousClose", meta.get("previousClose", price))
            day_change = ((price - prev_close) / prev_close * 100) if prev_close else 0

            return {
                "price": price,
                "previous_close": prev_close,
                "day_change_pct": round(day_change, 2),
                "high_52w": meta.get("fiftyTwoWeekHigh"),
                "low_52w": meta.get("fiftyTwoWeekLow"),
            }
    except Exception:
        return None


def get_stock_price(conn, ticker: str, force_refresh=False) -> dict | None:
    """Get stock price, using cache if fresh."""
    _ensure_tables(conn)
    ticker = ticker.upper()

    if not force_refresh:
        row = conn.execute("SELECT * FROM price_cache WHERE ticker = ?", (ticker,)).fetchone()
        if row:
            fetched = datetime.fromisoformat(row["fetched_at"])
            if datetime.now() - fetched < timedelta(minutes=PRICE_CACHE_MINUTES):
                return dict(row)

    live = fetch_stock_price(ticker)
    if live:
        now = datetime.now().isoformat()
        conn.execute("""
            INSERT INTO price_cache (ticker, price, previous_close, day_change_pct, high_52w, low_52w, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(ticker) DO UPDATE SET
                price=excluded.price, previous_close=excluded.previous_close,
                day_change_pct=excluded.day_change_pct, high_52w=excluded.high_52w,
                low_52w=excluded.low_52w, fetched_at=excluded.fetched_at
        """, (ticker, live["price"], live["previous_close"], live["day_change_pct"], live["high_52w"], live["low_52w"], now))
        conn.commit()
        return {**live, "ticker": ticker, "fetched_at": now}

    # Fall back to stale cache
    row = conn.execute("SELECT * FROM price_cache WHERE ticker = ?", (ticker,)).fetchone()
    return dict(row) if row else None


def add_holding(conn, ticker, shares, avg_cost):
    _ensure_tables(conn)
    ticker = ticker.upper()
    now = datetime.now().isoformat()
    # Upsert — if already exists, update shares and recalculate avg cost
    existing = conn.execute("SELECT shares, avg_cost FROM holdings WHERE ticker = ?", (ticker,)).fetchone()
    if existing:
        total_shares = existing["shares"] + shares
        # Weighted average cost
        total_cost = (existing["shares"] * existing["avg_cost"]) + (shares * avg_cost)
        new_avg = total_cost / total_shares
        conn.execute("UPDATE holdings SET shares = ?, avg_cost = ? WHERE ticker = ?",
                     (total_shares, round(new_avg, 4), ticker))
    else:
        conn.execute("INSERT INTO holdings (ticker, shares, avg_cost, added_at) VALUES (?, ?, ?, ?)",
                     (ticker, shares, avg_cost, now))
    conn.commit()


def remove_holding(conn, ticker):
    _ensure_tables(conn)
    conn.execute("DELETE FROM holdings WHERE ticker = ?", (ticker.upper(),))
    conn.commit()


def get_holdings(conn):
    _ensure_tables(conn)
    rows = conn.execute("SELECT * FROM holdings ORDER BY ticker").fetchall()
    return [dict(r) for r in rows]


def get_portfolio_summary(conn):
    """Get full portfolio summary with live prices."""
    holdings = get_holdings(conn)
    if not holdings:
        return {"holdings": [], "total_value": 0, "total_cost": 0, "total_gain": 0, "total_gain_pct": 0}

    enriched = []
    total_value = 0
    total_cost = 0

    for h in holdings:
        price_data = get_stock_price(conn, h["ticker"])
        current_price = price_data["price"] if price_data else h["avg_cost"]
        market_value = h["shares"] * current_price
        cost_basis = h["shares"] * h["avg_cost"]
        gain = market_value - cost_basis
        gain_pct = (gain / cost_basis * 100) if cost_basis > 0 else 0

        enriched.append({
            "ticker": h["ticker"],
            "shares": h["shares"],
            "avg_cost": h["avg_cost"],
            "current_price": current_price,
            "market_value": round(market_value, 2),
            "cost_basis": round(cost_basis, 2),
            "gain": round(gain, 2),
            "gain_pct": round(gain_pct, 2),
            "day_change_pct": price_data.get("day_change_pct", 0) if price_data else 0,
        })
        total_value += market_value
        total_cost += cost_basis

    total_gain = total_value - total_cost
    total_gain_pct = (total_gain / total_cost * 100) if total_cost > 0 else 0

    return {
        "holdings": enriched,
        "total_value": round(total_value, 2),
        "total_cost": round(total_cost, 2),
        "total_gain": round(total_gain, 2),
        "total_gain_pct": round(total_gain_pct, 2),
    }


def add_to_watchlist(conn, ticker, threshold_pct=5.0):
    _ensure_tables(conn)
    ticker = ticker.upper()
    now = datetime.now().isoformat()
    conn.execute("""
        INSERT INTO watchlist (ticker, dip_threshold_pct, added_at)
        VALUES (?, ?, ?)
        ON CONFLICT(ticker) DO UPDATE SET dip_threshold_pct = excluded.dip_threshold_pct
    """, (ticker, threshold_pct, now))
    conn.commit()


def remove_from_watchlist(conn, ticker):
    _ensure_tables(conn)
    conn.execute("DELETE FROM watchlist WHERE ticker = ?", (ticker.upper(),))
    conn.commit()


def get_watchlist(conn):
    _ensure_tables(conn)
    rows = conn.execute("SELECT * FROM watchlist ORDER BY ticker").fetchall()
    return [dict(r) for r in rows]


def check_dips(conn):
    """Check all watchlist tickers for dips from 52-week high.
    Returns list of new dip alerts.
    """
    _ensure_tables(conn)
    watchlist = get_watchlist(conn)
    new_alerts = []

    for item in watchlist:
        ticker = item["ticker"]
        threshold = item["dip_threshold_pct"]

        price_data = get_stock_price(conn, ticker)
        if not price_data or not price_data.get("high_52w"):
            continue

        current = price_data["price"]
        high = price_data["high_52w"]
        drop_pct = ((high - current) / high * 100)

        if drop_pct >= threshold:
            # Check if we already alerted for this level
            existing = conn.execute(
                "SELECT id FROM dip_alerts WHERE ticker = ? AND acknowledged = 0 AND drop_pct >= ?",
                (ticker, drop_pct - 1)  # within 1% of same alert
            ).fetchone()

            if not existing:
                now = datetime.now().isoformat()
                conn.execute(
                    "INSERT INTO dip_alerts (ticker, alert_type, drop_pct, price_at_alert, recent_high, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (ticker, "dip_from_52w_high", round(drop_pct, 1), current, high, now)
                )
                conn.commit()
                new_alerts.append({
                    "ticker": ticker,
                    "drop_pct": round(drop_pct, 1),
                    "current_price": current,
                    "high_52w": high,
                    "threshold": threshold,
                })

    return new_alerts


def get_pending_alerts(conn):
    _ensure_tables(conn)
    rows = conn.execute(
        "SELECT * FROM dip_alerts WHERE acknowledged = 0 ORDER BY created_at DESC"
    ).fetchall()
    return [dict(r) for r in rows]


def acknowledge_alert(conn, alert_id):
    _ensure_tables(conn)
    conn.execute("UPDATE dip_alerts SET acknowledged = 1 WHERE id = ?", (alert_id,))
    conn.commit()
