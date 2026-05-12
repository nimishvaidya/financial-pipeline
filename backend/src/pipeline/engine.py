"""Core allocation engine — the brain of the pipeline."""

from __future__ import annotations

from datetime import date

from pipeline.models import (
    AllocationResult,
    Bucket,
    Currency,
    PipelineConfig,
    PipelineOutput,
    TransferInstruction,
)


class PipelineEngine:
    """Runs the financial pipeline: takes income, deducts fixed expenses,
    splits remainder into buckets based on config rules."""

    def __init__(self, config: PipelineConfig):
        self.config = config

    def run(self, run_date: date | None = None) -> PipelineOutput:
        """Execute the pipeline for one pay period.

        Returns a PipelineOutput with allocations and transfer instructions.
        """
        if run_date is None:
            run_date = date.today()

        # Step 1: Calculate total income
        total_income = sum(src.amount for src in self.config.income.values())

        # Step 2: Calculate total fixed expenses
        total_fixed = sum(exp.amount for exp in self.config.fixed_expenses)

        # Step 3: Calculate remainder for bucket allocation
        remainder = total_income - total_fixed
        if remainder < 0:
            raise ValueError(
                f"Fixed expenses (${total_fixed:,.2f}) exceed income (${total_income:,.2f}). "
                "Review your config."
            )

        # Step 4: Resolve dynamic bucket percentages
        resolved_buckets = self._resolve_bucket_percentages()

        # Step 5: Calculate allocations
        allocations = self._calculate_allocations(resolved_buckets, remainder)

        # Step 6: Generate transfer instructions
        instructions = self._generate_instructions(allocations, total_fixed)

        # Step 7: Emergency fund status
        ef_status = self._emergency_fund_status()

        return PipelineOutput(
            run_date=run_date.isoformat(),
            total_income=total_income,
            total_fixed_expenses=total_fixed,
            remainder_for_buckets=remainder,
            allocations=allocations,
            transfer_instructions=instructions,
            emergency_fund_status=ef_status,
        )

    def _resolve_bucket_percentages(self) -> list[tuple[Bucket, float]]:
        """Evaluate dynamic rules to determine actual percentages.

        Returns list of (bucket, resolved_percentage) tuples.
        """
        resolved = []

        for bucket in self.config.buckets:
            pct = bucket.percentage  # Start with base percentage

            # Check rules in order — last matching rule wins
            for rule in bucket.rules:
                if self._evaluate_condition(rule.when):
                    pct = rule.percentage

            resolved.append((bucket, pct))

        # Redistribute from zeroed-out buckets
        resolved = self._redistribute(resolved)

        return resolved

    def _evaluate_condition(self, condition: str) -> bool:
        """Safely evaluate a condition string against current balances.

        Supports: <, >, <=, >=, ==, !=, and, or
        Variables: {balance_name}.balance, {balance_name}.target
        """
        # Build evaluation context from current balances
        context: dict[str, object] = {}

        for name, balance in self.config.balances.items():
            context[f"{name}"] = type("Obj", (), {
                "balance": balance.amount,
                "target": self._calculate_target(name),
            })()

        try:
            # Only allow safe operations
            allowed_names = {
                "__builtins__": {},
                "True": True,
                "False": False,
            }
            allowed_names.update(context)
            return bool(eval(condition, allowed_names))  # noqa: S307
        except Exception:
            # If condition can't be evaluated, skip the rule
            return False

    def _calculate_target(self, bucket_name: str) -> float:
        """Calculate the target amount for a bucket (e.g., emergency fund)."""
        for bucket in self.config.buckets:
            if bucket.name == bucket_name and bucket.target:
                if bucket.target.type == "months_of_expenses":
                    monthly_expenses = sum(
                        exp.amount for exp in self.config.fixed_expenses
                    )
                    return monthly_expenses * bucket.target.months
        return 0.0

    def _redistribute(
        self, resolved: list[tuple[Bucket, float]]
    ) -> list[tuple[Bucket, float]]:
        """Redistribute percentages from zeroed-out buckets proportionally."""
        total_pct = sum(pct for _, pct in resolved)
        if total_pct == 0 or abs(total_pct - 100) < 0.01:
            return resolved

        # Scale remaining buckets to fill 100%
        scale = 100.0 / total_pct
        return [(bucket, pct * scale) for bucket, pct in resolved]

    def _calculate_allocations(
        self, resolved_buckets: list[tuple[Bucket, float]], remainder: float
    ) -> list[AllocationResult]:
        """Calculate dollar amounts for each bucket."""
        allocations = []

        for bucket, pct in resolved_buckets:
            if pct == 0:
                continue

            amount = remainder * (pct / 100)
            target_currency = bucket.target_currency or Currency.USD

            # Handle currency conversion
            converted_amount = None
            converted_currency = None
            if target_currency != Currency.USD:
                forex_key = f"usd_{target_currency.value.lower()}"
                if forex_key in self.config.forex:
                    rate = self.config.forex[forex_key].rate
                    converted_amount = amount * rate
                    converted_currency = target_currency

            allocations.append(
                AllocationResult(
                    bucket_name=bucket.name,
                    amount=round(amount, 2),
                    currency=Currency.USD,
                    converted_amount=round(converted_amount, 2) if converted_amount else None,
                    converted_currency=converted_currency,
                    percentage_used=round(pct, 1),
                    description=bucket.description,
                )
            )

        return allocations

    def _generate_instructions(
        self, allocations: list[AllocationResult], total_fixed: float
    ) -> list[TransferInstruction]:
        """Generate step-by-step transfer instructions."""
        instructions = []
        step = 1

        # First: fixed expenses
        for expense in self.config.fixed_expenses:
            instructions.append(
                TransferInstruction(
                    step=step,
                    action=f"Pay {expense.name}: ${expense.amount:,.2f}",
                    amount=expense.amount,
                    currency=expense.currency,
                    destination=expense.name,
                    notes="Fixed monthly expense",
                )
            )
            step += 1

        # Then: bucket allocations
        for alloc in allocations:
            action = f"Transfer ${alloc.amount:,.2f} to {alloc.bucket_name}"
            notes = ""

            if alloc.converted_amount and alloc.converted_currency:
                symbol = "₹" if alloc.converted_currency == Currency.INR else "$"
                action += f" ({symbol}{alloc.converted_amount:,.2f} {alloc.converted_currency.value})"
                notes = f"Convert USD → {alloc.converted_currency.value} at current rate"

            instructions.append(
                TransferInstruction(
                    step=step,
                    action=action,
                    amount=alloc.amount,
                    currency=alloc.currency,
                    destination=alloc.bucket_name,
                    notes=notes,
                )
            )
            step += 1

        return instructions

    def _emergency_fund_status(self) -> str:
        """Generate a human-readable emergency fund status."""
        ef_balance = self.config.balances.get("emergency_fund")
        if not ef_balance:
            return "No emergency fund configured"

        target = self._calculate_target("emergency_fund")
        if target == 0:
            return "No target set for emergency fund"

        current = ef_balance.amount
        pct = (current / target) * 100

        if current >= target:
            return f"Fully funded! ${current:,.2f} / ${target:,.2f}"

        return f"{pct:.0f}% funded — ${current:,.2f} / ${target:,.2f} (need ${target - current:,.2f} more)"
