"""Loan payoff and financial projections."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta


@dataclass
class PayoffProjection:
    """Result of a loan payoff calculation."""

    loan_name: str
    current_balance: float
    currency: str
    monthly_payment: float
    interest_rate: float
    months_remaining: int
    payoff_date: str
    total_interest_paid: float
    monthly_breakdown: list[dict]  # [{month, balance, interest, principal}]


def calculate_loan_payoff(
    loan_name: str,
    balance: float,
    currency: str,
    annual_interest_rate: float,
    monthly_payment: float,
    start_date: date | None = None,
) -> PayoffProjection:
    """Calculate when a loan will be paid off and the monthly breakdown.

    Args:
        loan_name: Name of the loan (e.g., "edu_loan")
        balance: Current outstanding balance
        currency: Currency of the loan
        annual_interest_rate: Annual interest rate as percentage (e.g., 9.5)
        monthly_payment: How much is being paid per month
        start_date: Starting date for projection (defaults to today)
    """
    if start_date is None:
        start_date = date.today()

    monthly_rate = annual_interest_rate / 100 / 12
    remaining = balance
    total_interest = 0.0
    months = 0
    breakdown = []

    # Cap at 360 months (30 years) to avoid infinite loops
    while remaining > 0 and months < 360:
        interest = remaining * monthly_rate
        principal = min(monthly_payment - interest, remaining)

        if principal <= 0:
            # Payment doesn't even cover interest
            break

        remaining -= principal
        total_interest += interest
        months += 1

        current_date = _add_months(start_date, months)

        breakdown.append({
            "month": months,
            "date": current_date.isoformat(),
            "balance": round(max(remaining, 0), 2),
            "interest": round(interest, 2),
            "principal": round(principal, 2),
            "payment": round(interest + principal, 2),
        })

    payoff_date = _add_months(start_date, months)

    return PayoffProjection(
        loan_name=loan_name,
        current_balance=balance,
        currency=currency,
        monthly_payment=monthly_payment,
        interest_rate=annual_interest_rate,
        months_remaining=months,
        payoff_date=payoff_date.isoformat(),
        total_interest_paid=round(total_interest, 2),
        monthly_breakdown=breakdown,
    )


def _add_months(start: date, months: int) -> date:
    """Add months to a date."""
    month = start.month + months
    year = start.year + (month - 1) // 12
    month = (month - 1) % 12 + 1
    day = min(start.day, 28)  # Safe for all months
    return date(year, month, day)


def calculate_emergency_fund_projection(
    current_balance: float,
    monthly_contribution: float,
    target: float,
) -> dict:
    """Calculate when emergency fund target will be reached."""
    if current_balance >= target:
        return {
            "status": "complete",
            "current": current_balance,
            "target": target,
            "months_remaining": 0,
            "target_date": date.today().isoformat(),
        }

    if monthly_contribution <= 0:
        return {
            "status": "no_contribution",
            "current": current_balance,
            "target": target,
            "months_remaining": -1,
            "target_date": "N/A",
        }

    remaining = target - current_balance
    months = int(remaining / monthly_contribution) + 1
    target_date = _add_months(date.today(), months)

    return {
        "status": "in_progress",
        "current": round(current_balance, 2),
        "target": round(target, 2),
        "percentage": round((current_balance / target) * 100, 1),
        "months_remaining": months,
        "target_date": target_date.isoformat(),
    }
