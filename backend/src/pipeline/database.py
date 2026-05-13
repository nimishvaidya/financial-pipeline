"""SQLite database for storing pipeline run history."""

from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime
from pathlib import Path

# Default database path — next to the config folder
DEFAULT_DB_PATH = Path(__file__).parent.parent.parent.parent / "data" / "pipeline.db"


def get_connection(db_path: Path | None = None) -> sqlite3.Connection:
    """Get a database connection, creating the DB and tables if needed."""
    path = db_path or DEFAULT_DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")

    _create_tables(conn)
    return conn


def _create_tables(conn: sqlite3.Connection) -> None:
    """Create tables if they don't exist."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS pipeline_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_date TEXT NOT NULL,
            created_at TEXT NOT NULL,
            total_income REAL NOT NULL,
            total_fixed_expenses REAL NOT NULL,
            remainder REAL NOT NULL,
            allocations_json TEXT NOT NULL,
            instructions_json TEXT NOT NULL,
            emergency_fund_status TEXT
        );

        CREATE TABLE IF NOT EXISTS balance_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL,
            account_name TEXT NOT NULL,
            amount REAL NOT NULL,
            currency TEXT NOT NULL,
            interest_rate REAL DEFAULT 0,
            FOREIGN KEY (run_id) REFERENCES pipeline_runs(id)
        );

        CREATE TABLE IF NOT EXISTS net_worth_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL,
            run_date TEXT NOT NULL,
            total_assets REAL NOT NULL,
            total_liabilities REAL NOT NULL,
            net_worth REAL NOT NULL,
            FOREIGN KEY (run_id) REFERENCES pipeline_runs(id)
        );

        CREATE INDEX IF NOT EXISTS idx_runs_date ON pipeline_runs(run_date);
        CREATE INDEX IF NOT EXISTS idx_snapshots_run ON balance_snapshots(run_id);
        CREATE INDEX IF NOT EXISTS idx_networth_date ON net_worth_history(run_date);
    """)


def save_pipeline_run(
    conn: sqlite3.Connection,
    run_date: date,
    total_income: float,
    total_fixed_expenses: float,
    remainder: float,
    allocations: list[dict],
    instructions: list[dict],
    emergency_fund_status: str,
    balances: dict[str, dict],
) -> int:
    """Save a pipeline run and its balance snapshot.

    Returns the run ID.
    """
    now = datetime.now().isoformat()

    cursor = conn.execute(
        """
        INSERT INTO pipeline_runs
        (run_date, created_at, total_income, total_fixed_expenses, remainder,
         allocations_json, instructions_json, emergency_fund_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            run_date.isoformat() if isinstance(run_date, date) else run_date,
            now,
            total_income,
            total_fixed_expenses,
            remainder,
            json.dumps(allocations),
            json.dumps(instructions),
            emergency_fund_status,
        ),
    )
    run_id = cursor.lastrowid

    # Save balance snapshots
    for name, bal in balances.items():
        conn.execute(
            """
            INSERT INTO balance_snapshots (run_id, account_name, amount, currency, interest_rate)
            VALUES (?, ?, ?, ?, ?)
            """,
            (run_id, name, bal["amount"], bal["currency"], bal.get("interest_rate", 0)),
        )

    # Calculate and save net worth
    assets = 0.0
    liabilities = 0.0
    for name, bal in balances.items():
        amount = bal["amount"]
        # Loans are liabilities, funds are assets
        if "loan" in name.lower():
            # Convert INR liabilities to USD for consistent tracking
            if bal["currency"] == "INR":
                amount = amount / 83.50  # TODO: use actual forex rate
            liabilities += amount
        else:
            assets += amount

    net_worth = assets - liabilities

    conn.execute(
        """
        INSERT INTO net_worth_history (run_id, run_date, total_assets, total_liabilities, net_worth)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            run_id,
            run_date.isoformat() if isinstance(run_date, date) else run_date,
            round(assets, 2),
            round(liabilities, 2),
            round(net_worth, 2),
        ),
    )

    conn.commit()
    return run_id


def get_run_history(conn: sqlite3.Connection, limit: int = 50) -> list[dict]:
    """Get recent pipeline runs."""
    rows = conn.execute(
        """
        SELECT id, run_date, created_at, total_income, total_fixed_expenses,
               remainder, emergency_fund_status
        FROM pipeline_runs
        ORDER BY created_at DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()

    return [dict(row) for row in rows]


def get_balance_history(conn: sqlite3.Connection, account_name: str | None = None) -> list[dict]:
    """Get balance snapshots over time, optionally filtered by account."""
    if account_name:
        rows = conn.execute(
            """
            SELECT bs.account_name, bs.amount, bs.currency, pr.run_date
            FROM balance_snapshots bs
            JOIN pipeline_runs pr ON bs.run_id = pr.id
            WHERE bs.account_name = ?
            ORDER BY pr.run_date ASC
            """,
            (account_name,),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT bs.account_name, bs.amount, bs.currency, pr.run_date
            FROM balance_snapshots bs
            JOIN pipeline_runs pr ON bs.run_id = pr.id
            ORDER BY pr.run_date ASC
            """,
        ).fetchall()

    return [dict(row) for row in rows]


def get_net_worth_history(conn: sqlite3.Connection) -> list[dict]:
    """Get net worth over time."""
    rows = conn.execute(
        """
        SELECT run_date, total_assets, total_liabilities, net_worth
        FROM net_worth_history
        ORDER BY run_date ASC
        """,
    ).fetchall()

    return [dict(row) for row in rows]


def get_latest_balances(conn: sqlite3.Connection) -> dict[str, dict]:
    """Get the most recent balance snapshot for each account."""
    rows = conn.execute(
        """
        SELECT bs.account_name, bs.amount, bs.currency, bs.interest_rate, pr.run_date
        FROM balance_snapshots bs
        JOIN pipeline_runs pr ON bs.run_id = pr.id
        WHERE pr.id = (SELECT MAX(id) FROM pipeline_runs)
        """,
    ).fetchall()

    return {row["account_name"]: dict(row) for row in rows}
