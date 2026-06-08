"""Parse Robinhood monthly statement PDFs into structured data.

Extracts:
  - Account summary (opening/closing balance, portfolio value, dividends)
  - Holdings (ticker, name, qty, price, market value, dividend yield, allocation %)
  - Transactions (buys, sells, dividends, transfers, cash back)
  - Pending settlements
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from pathlib import Path


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class Holding:
    name: str
    ticker: str
    qty: float
    price: float
    market_value: float
    est_dividend: float
    yield_pct: float
    pct_of_portfolio: float


@dataclass
class Transaction:
    date: str
    description: str
    symbol: str
    tx_type: str  # Buy, CDIV, DCF, RTP, ITRF, XENT_CC, COIN, etc.
    qty: float | None
    price: float | None
    debit: float | None
    credit: float | None


@dataclass
class PendingTrade:
    description: str
    trade_date: str
    settle_date: str
    qty: float
    price: float
    debit: float


@dataclass
class AccountSummary:
    period: str
    opening_balance: float
    closing_balance: float
    portfolio_value: float
    cash_balance: float
    total_securities: float
    dividends_period: float
    dividends_ytd: float
    equities_pct: float
    cash_pct: float


@dataclass
class RobinhoodStatement:
    summary: AccountSummary
    holdings: list[Holding] = field(default_factory=list)
    transactions: list[Transaction] = field(default_factory=list)
    pending_trades: list[PendingTrade] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "summary": asdict(self.summary),
            "holdings": [asdict(h) for h in self.holdings],
            "transactions": [asdict(t) for t in self.transactions],
            "pending_trades": [asdict(p) for p in self.pending_trades],
            "stats": self._compute_stats(),
        }

    def _compute_stats(self) -> dict:
        """Compute derived statistics for the dashboard."""
        # Sector-like grouping by category
        etfs = [h for h in self.holdings if _is_etf(h.ticker)]
        stocks = [h for h in self.holdings if not _is_etf(h.ticker)]

        etf_value = sum(h.market_value for h in etfs)
        stock_value = sum(h.market_value for h in stocks)
        total = etf_value + stock_value

        # Top holdings
        sorted_holdings = sorted(self.holdings, key=lambda h: h.market_value, reverse=True)
        top_10 = sorted_holdings[:10]
        top_10_value = sum(h.market_value for h in top_10)

        # Dividend payers vs non
        div_payers = [h for h in self.holdings if h.est_dividend > 0]
        non_div = [h for h in self.holdings if h.est_dividend <= 0]

        # Transaction breakdown
        buys = [t for t in self.transactions if t.tx_type == "Buy"]
        dividends = [t for t in self.transactions if t.tx_type == "CDIV"]
        deposits = [t for t in self.transactions if t.tx_type in ("DCF", "RTP")]
        cashback = [t for t in self.transactions if t.tx_type == "XENT_CC"]

        total_invested = sum(t.debit or 0 for t in buys)
        total_dividends = sum(t.credit or 0 for t in dividends)
        total_deposits = sum(t.credit or 0 for t in deposits)
        total_cashback = sum(t.credit or 0 for t in cashback)

        # Dividend reinvestments vs manual buys
        drip_buys = [t for t in buys if "Dividend Reinvestment" in t.description or "Reinvestment" in t.description]
        manual_buys = [t for t in buys if t not in drip_buys]

        return {
            "etf_count": len(etfs),
            "stock_count": len(stocks),
            "etf_value": round(etf_value, 2),
            "stock_value": round(stock_value, 2),
            "etf_pct": round(etf_value / total * 100, 1) if total > 0 else 0,
            "stock_pct": round(stock_value / total * 100, 1) if total > 0 else 0,
            "top_10": [{"ticker": h.ticker, "name": h.name, "value": h.market_value, "pct": h.pct_of_portfolio} for h in top_10],
            "top_10_concentration": round(top_10_value / total * 100, 1) if total > 0 else 0,
            "dividend_payers": len(div_payers),
            "non_dividend": len(non_div),
            "total_est_annual_dividend": round(sum(h.est_dividend for h in self.holdings), 2),
            "portfolio_yield": round(sum(h.est_dividend for h in self.holdings) / total * 100, 2) if total > 0 else 0,
            "total_invested_this_period": round(total_invested, 2),
            "total_dividends_this_period": round(total_dividends, 2),
            "total_deposits": round(total_deposits, 2),
            "total_cashback": round(total_cashback, 2),
            "num_buys": len(buys),
            "num_drip": len(drip_buys),
            "num_manual_buys": len(manual_buys),
            "unique_tickers_bought": len(set(t.symbol for t in buys if t.symbol)),
        }


# ---------------------------------------------------------------------------
# Known ETF tickers
# ---------------------------------------------------------------------------

_ETF_TICKERS = {
    "VOO", "VGT", "VXUS", "QQQ", "QQQM", "SCHD", "SMH", "SPHQ", "SPMO",
    "XLK", "INDA", "DRAM", "CONY", "TSLY",
}


def _is_etf(ticker: str) -> bool:
    return ticker.upper() in _ETF_TICKERS


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------

def parse_robinhood_pdf(pdf_path: str | Path) -> RobinhoodStatement:
    """Parse a Robinhood monthly statement PDF and return structured data."""
    try:
        import pdfplumber
    except ImportError:
        raise ImportError("pdfplumber is required: pip install pdfplumber")

    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    with pdfplumber.open(pdf_path) as pdf:
        all_text = []
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                all_text.append(text)

    full_text = "\n".join(all_text)

    summary = _parse_summary(full_text)
    holdings = _parse_holdings(full_text)
    transactions = _parse_transactions(full_text)
    pending = _parse_pending(full_text)

    return RobinhoodStatement(
        summary=summary,
        holdings=holdings,
        transactions=transactions,
        pending_trades=pending,
    )


def _parse_summary(text: str) -> AccountSummary:
    """Extract account summary from page 1."""
    # Period
    period_match = re.search(r"(\d{2}/\d{2}/\d{4})\s+to\s+(\d{2}/\d{2}/\d{4})", text)
    period = f"{period_match.group(1)} to {period_match.group(2)}" if period_match else ""

    # Opening/closing balance — look for "Net Account Balance" line
    opening = _find_amount(text, r"Net Account Balance\s+\$?([\d,]+\.?\d*)")
    closing_match = re.search(r"Net Account Balance\s+\$?[\d,]+\.?\d*\s+\$?([\d,]+\.?\d*)", text)
    closing = _parse_num(closing_match.group(1)) if closing_match else 0

    # Portfolio value
    portfolio_match = re.search(r"Portfolio Value\s+\$?([\d,]+\.?\d*)\s+\$?([\d,]+\.?\d*)", text)
    if portfolio_match:
        portfolio_value = _parse_num(portfolio_match.group(2))
    else:
        portfolio_match = re.search(r"Total Priced Portfolio\s+\$?([\d,]+\.?\d*)", text)
        portfolio_value = _parse_num(portfolio_match.group(1)) if portfolio_match else 0

    # Total securities
    sec_match = re.search(r"Total Securities\s+\$?([\d,]+\.?\d*)\s+\$?([\d,]+\.?\d*)", text)
    total_securities = _parse_num(sec_match.group(2)) if sec_match else 0

    # Cash balance
    cash_match = re.search(r"Brokerage Cash Balance\s+\$?([\d,]+\.?\d*)", text)
    cash_balance = _parse_num(cash_match.group(1)) if cash_match else 0

    # Dividends
    div_match = re.search(r"Dividends\s+\$?([\d,]+\.?\d*)\s+\$?([\d,]+\.?\d*)", text)
    div_period = _parse_num(div_match.group(1)) if div_match else 0
    div_ytd = _parse_num(div_match.group(2)) if div_match else 0

    # Compute percentages from actual values
    if portfolio_value > 0:
        equities_pct = round(total_securities / portfolio_value * 100, 2)
    else:
        equities_pct = 0

    return AccountSummary(
        period=period,
        opening_balance=opening,
        closing_balance=closing,
        portfolio_value=portfolio_value,
        cash_balance=cash_balance,
        total_securities=total_securities,
        dividends_period=div_period,
        dividends_ytd=div_ytd,
        equities_pct=equities_pct,
        cash_pct=round(100 - equities_pct, 2),
    )


def _parse_holdings(text: str) -> list[Holding]:
    """Extract holdings from Portfolio Summary pages."""
    holdings = []

    # Pattern: Company Name\nTICKER Cash qty price mkt_value est_div yield% pct%
    # The PDF has: name on one line, then ticker + data on next line
    # But pdfplumber extracts them together sometimes

    # Split into portfolio summary section
    portfolio_start = text.find("Portfolio Summary")
    portfolio_end = text.find("Account Activity")
    if portfolio_start == -1 or portfolio_end == -1:
        return holdings

    portfolio_text = text[portfolio_start:portfolio_end]

    # Match lines like: AAPL Cash 0.063358 $312.06000 $19.77 $0.07 1.23%
    pattern = re.compile(
        r"^(.+?)\n"  # Company name
        r"(\w+(?:\.\w+)?)\s+Cash\s+"  # Ticker
        r"([\d.]+)\s+"  # Qty
        r"\$([\d,]+\.?\d*)\s+"  # Price
        r"\$([\d,]+\.?\d*)\s+"  # Market value
        r"\$([\d,]+\.?\d*)\s+"  # Est dividend
        r"([\d.]+)%",  # % of portfolio
        re.MULTILINE,
    )

    # Simpler approach: find all ticker lines
    ticker_pattern = re.compile(
        r"(\w+(?:\.\w+)?)\s+Cash\s+"
        r"([\d.]+)\s+"
        r"\$([\d,]+\.?\d*)\s+"
        r"\$([\d,]+\.?\d*)\s+"
        r"\$([\d,]+\.?\d*)\s+"
        r"([\d.]+)%"
    )

    # Find company names — they appear right before ticker lines
    lines = portfolio_text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        match = ticker_pattern.search(line)
        if match:
            ticker = match.group(1)
            qty = float(match.group(2))
            price = _parse_num(match.group(3))
            mkt_val = _parse_num(match.group(4))
            est_div = _parse_num(match.group(5))
            pct = float(match.group(6))

            # Company name is the previous non-empty line that's not a header
            name = ticker  # fallback
            for j in range(i - 1, max(i - 3, -1), -1):
                prev = lines[j].strip()
                if prev and not prev.startswith("Securities") and not prev.startswith("Estimated") and prev != "Portfolio Summary":
                    name = prev
                    break

            # Get yield from the "Estimated Yield" line that follows
            yield_pct = 0.0
            if i + 1 < len(lines):
                yield_match = re.search(r"Estimated Yield:\s*([\d.]+)%", lines[i + 1])
                if yield_match:
                    yield_pct = float(yield_match.group(1))

            holdings.append(Holding(
                name=name,
                ticker=ticker,
                qty=qty,
                price=price,
                market_value=mkt_val,
                est_dividend=est_div,
                yield_pct=yield_pct,
                pct_of_portfolio=pct,
            ))
        i += 1

    return holdings


def _parse_transactions(text: str) -> list[Transaction]:
    """Extract transactions from Account Activity pages."""
    transactions = []

    activity_start = text.find("Account Activity")
    pending_start = text.find("Executed Trades Pending Settlement")
    if activity_start == -1:
        return transactions

    activity_text = text[activity_start:pending_start] if pending_start != -1 else text[activity_start:]

    # Cash dividends: "Cash Div: R/D ... TICKER Cash CDIV MM/DD/YYYY $X.XX"
    cdiv_pattern = re.compile(
        r"Cash Div:.*?(\w+(?:\.\w+)?)\s+Cash\s+CDIV\s+(\d{2}/\d{2}/\d{4})\s+\$([\d,]+\.?\d*)"
    )
    for m in cdiv_pattern.finditer(activity_text):
        transactions.append(Transaction(
            date=m.group(2),
            description=f"Dividend from {m.group(1)}",
            symbol=m.group(1),
            tx_type="CDIV",
            qty=None,
            price=None,
            debit=None,
            credit=_parse_num(m.group(3)),
        ))

    # Buy transactions: "TICKER Cash Buy MM/DD/YYYY qty $price $debit"
    buy_pattern = re.compile(
        r"(\w+(?:\.\w+)?)\s+Cash\s+Buy\s+(\d{2}/\d{2}/\d{4})\s+([\d.]+)\s+\$([\d,]+\.?\d*)\s+\$([\d,]+\.?\d*)"
    )

    # Track which buys are dividend reinvestments
    # "Dividend Reinvestment" appears on the line after the buy
    drip_positions = set()
    for m in re.finditer(r"Dividend Reinvestment", activity_text):
        drip_positions.add(m.start())

    for m in buy_pattern.finditer(activity_text):
        # Check if "Dividend Reinvestment" appears within 50 chars after this buy line
        is_drip = any(0 < (pos - m.end()) < 50 for pos in drip_positions)
        desc = f"{'DRIP ' if is_drip else ''}Buy {m.group(1)}"

        transactions.append(Transaction(
            date=m.group(2),
            description=desc,
            symbol=m.group(1),
            tx_type="Buy",
            qty=float(m.group(3)),
            price=_parse_num(m.group(4)),
            debit=_parse_num(m.group(5)),
            credit=None,
        ))

    # External debit card transfers
    dcf_pattern = re.compile(
        r"External debit card transfer.*?Cash\s+DCF\s+(\d{2}/\d{2}/\d{4})\s+\$([\d,]+\.?\d*)"
    )
    for m in dcf_pattern.finditer(activity_text):
        transactions.append(Transaction(
            date=m.group(1),
            description="Debit card deposit",
            symbol="",
            tx_type="DCF",
            qty=None,
            price=None,
            debit=None,
            credit=_parse_num(m.group(2)),
        ))

    # Instant bank transfers
    rtp_pattern = re.compile(
        r"Instant bank transfer.*?Cash\s+RTP\s+(\d{2}/\d{2}/\d{4})\s+\$([\d,]+\.?\d*)"
    )
    for m in rtp_pattern.finditer(activity_text):
        transactions.append(Transaction(
            date=m.group(1),
            description="Bank transfer",
            symbol="",
            tx_type="RTP",
            qty=None,
            price=None,
            debit=None,
            credit=_parse_num(m.group(2)),
        ))

    # Cash back from Robinhood Credit Card
    cc_pattern = re.compile(
        r"Cash back from Robinhood Credit Card\s+Cash\s+XENT_CC\s+(\d{2}/\d{2}/\d{4})\s+\$([\d,]+\.?\d*)"
    )
    for m in cc_pattern.finditer(activity_text):
        transactions.append(Transaction(
            date=m.group(1),
            description="Robinhood CC cashback",
            symbol="",
            tx_type="XENT_CC",
            qty=None,
            price=None,
            debit=None,
            credit=_parse_num(m.group(2)),
        ))

    # Crypto money movement
    crypto_pattern = re.compile(
        r"Crypto Money Movement\s+Cash\s+COIN\s+(\d{2}/\d{2}/\d{4})\s+\$([\d,]+\.?\d*)"
    )
    for m in crypto_pattern.finditer(activity_text):
        transactions.append(Transaction(
            date=m.group(1),
            description="Crypto withdrawal",
            symbol="",
            tx_type="COIN",
            qty=None,
            price=None,
            debit=_parse_num(m.group(2)),
            credit=None,
        ))

    # Sort by date
    transactions.sort(key=lambda t: t.date)
    return transactions


def _parse_pending(text: str) -> list[PendingTrade]:
    """Extract pending settlement trades."""
    pending = []
    pending_start = text.find("Executed Trades Pending Settlement")
    if pending_start == -1:
        return pending

    pending_text = text[pending_start:]

    # Pattern: Cash Buy MM/DD/YYYY MM/DD/YYYY qty $price $debit
    pattern = re.compile(
        r"Cash\s+Buy\s+(\d{2}/\d{2}/\d{4})\s+(\d{2}/\d{2}/\d{4})\s+([\d.]+)\s+\$([\d,]+\.?\d*)\s+\$([\d,]+\.?\d*)"
    )

    lines = pending_text.split("\n")
    for m in pattern.finditer(pending_text):
        # Find description (company name) above
        pos = m.start()
        desc_text = pending_text[:pos].rstrip()
        last_newline = desc_text.rfind("\n")
        desc = desc_text[last_newline + 1:].strip() if last_newline != -1 else ""

        # Clean up description — remove CUSIP lines
        if "CUSIP" in desc:
            desc = ""

        pending.append(PendingTrade(
            description=desc,
            trade_date=m.group(1),
            settle_date=m.group(2),
            qty=float(m.group(3)),
            price=_parse_num(m.group(4)),
            debit=_parse_num(m.group(5)),
        ))

    return pending


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_num(s: str) -> float:
    """Parse a number string like '1,234.56' into float."""
    return float(s.replace(",", ""))


def _find_amount(text: str, pattern: str) -> float:
    """Find a dollar amount using regex pattern."""
    match = re.search(pattern, text)
    return _parse_num(match.group(1)) if match else 0.0
