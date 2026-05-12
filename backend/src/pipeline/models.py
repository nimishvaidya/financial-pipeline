"""Data models for the financial pipeline."""

from __future__ import annotations

from enum import Enum
from pydantic import BaseModel, Field


class Currency(str, Enum):
    USD = "USD"
    INR = "INR"


class PaySchedule(str, Enum):
    MONTHLY = "monthly"
    BIWEEKLY = "biweekly"


# --- Config Models ---


class IncomeSource(BaseModel):
    amount: float = Field(gt=0, description="Monthly take-home amount")
    currency: Currency = Currency.USD
    pay_schedule: PaySchedule = PaySchedule.MONTHLY


class Balance(BaseModel):
    amount: float = Field(ge=0, description="Current balance")
    currency: Currency = Currency.USD
    interest_rate: float = Field(default=0.0, ge=0, description="Annual interest rate %")
    lender: str = ""


class FixedExpense(BaseModel):
    name: str
    amount: float = Field(gt=0)
    currency: Currency = Currency.USD


class AllocationRule(BaseModel):
    when: str = Field(description="Condition expression, e.g. 'edu_loan.balance < 2000000'")
    percentage: float = Field(ge=0, le=100)


class FundTarget(BaseModel):
    type: str = Field(default="months_of_expenses", description="Target type")
    months: int = Field(default=2, ge=1, description="Number of months of expenses to save")


class Bucket(BaseModel):
    name: str
    percentage: float = Field(ge=0, le=100, description="Base allocation percentage")
    target_currency: Currency | None = None
    description: str = ""
    target: FundTarget | None = None
    rules: list[AllocationRule] = Field(default_factory=list)


class ForexConfig(BaseModel):
    mode: str = "manual"  # "manual" or "api"
    rate: float = Field(gt=0, description="Exchange rate (e.g., USD to INR)")


class DisplayConfig(BaseModel):
    base_currency: Currency = Currency.USD
    date_format: str = "YYYY-MM-DD"


class PipelineConfig(BaseModel):
    """Root configuration model — maps to the YAML config file."""

    income: dict[str, IncomeSource]
    balances: dict[str, Balance]
    fixed_expenses: list[FixedExpense]
    buckets: list[Bucket]
    forex: dict[str, ForexConfig] = Field(default_factory=dict)
    display: DisplayConfig = Field(default_factory=DisplayConfig)


# --- Output Models ---


class AllocationResult(BaseModel):
    """Result of running the pipeline for one pay period."""

    bucket_name: str
    amount: float
    currency: Currency
    converted_amount: float | None = None
    converted_currency: Currency | None = None
    percentage_used: float
    description: str = ""


class TransferInstruction(BaseModel):
    """Human-readable instruction for moving money."""

    step: int
    action: str  # e.g., "Transfer $1,200 to rent (checking → landlord)"
    amount: float
    currency: Currency
    destination: str
    notes: str = ""


class PipelineOutput(BaseModel):
    """Full output of a pipeline run."""

    run_date: str
    total_income: float
    total_fixed_expenses: float
    remainder_for_buckets: float
    allocations: list[AllocationResult]
    transfer_instructions: list[TransferInstruction]
    emergency_fund_status: str = ""  # e.g., "42% of target ($2,100 / $5,000)"
