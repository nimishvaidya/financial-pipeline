"""Tests for the pipeline engine."""

from pipeline.config_loader import load_config
from pipeline.engine import PipelineEngine


def test_engine_with_example_config(tmp_path):
    """Test that the engine runs correctly with the example config."""
    # Create a minimal test config
    config_yaml = tmp_path / "config.yaml"
    config_yaml.write_text("""
income:
  salary:
    amount: 5000
    currency: USD
    pay_schedule: monthly

balances:
  edu_loan:
    amount: 2700000
    currency: INR
    interest_rate: 9.5
  emergency_fund:
    amount: 0
    currency: USD

fixed_expenses:
  - name: rent
    amount: 1200
    currency: USD
  - name: groceries
    amount: 400
    currency: USD

buckets:
  - name: edu_loan
    percentage: 60
    target_currency: INR
    description: "Education loan"
  - name: emergency_fund
    percentage: 20
    description: "Emergency savings"
    target:
      type: months_of_expenses
      months: 2
  - name: investing
    percentage: 20
    description: "Investments"

forex:
  usd_inr:
    mode: manual
    rate: 83.50
""")

    config = load_config(config_yaml)
    engine = PipelineEngine(config)
    result = engine.run()

    # Income is $5000
    assert result.total_income == 5000.0

    # Fixed expenses = rent $1200 + groceries $400 = $1600
    assert result.total_fixed_expenses == 1600.0

    # Remainder = $5000 - $1600 = $3400
    assert result.remainder_for_buckets == 3400.0

    # Should have 3 allocations
    assert len(result.allocations) == 3

    # Edu loan gets 60% of $3400 = $2040
    edu_alloc = next(a for a in result.allocations if a.bucket_name == "edu_loan")
    assert edu_alloc.amount == 2040.0
    assert edu_alloc.converted_amount is not None  # Should convert to INR

    # Should have transfer instructions for fixed + bucket items
    assert len(result.transfer_instructions) == 5  # 2 fixed + 3 buckets


def test_emergency_fund_status_empty():
    """Test emergency fund status when balance is zero."""
    config_yaml_content = """
income:
  salary:
    amount: 5000
    currency: USD

balances:
  emergency_fund:
    amount: 0
    currency: USD

fixed_expenses:
  - name: rent
    amount: 1200
    currency: USD

buckets:
  - name: emergency_fund
    percentage: 100
    target:
      type: months_of_expenses
      months: 2
"""
    import yaml
    from pipeline.config_loader import _parse_config

    raw = yaml.safe_load(config_yaml_content)
    config = _parse_config(raw)
    engine = PipelineEngine(config)

    status = engine._emergency_fund_status()
    assert "0%" in status
    assert "$2,400.00" in status  # 2 * $1200 rent


def test_bucket_redistribution():
    """Test that zeroed-out buckets redistribute correctly."""
    config_yaml_content = """
income:
  salary:
    amount: 3000
    currency: USD

balances:
  edu_loan:
    amount: 0
    currency: INR

fixed_expenses:
  - name: rent
    amount: 1000
    currency: USD

buckets:
  - name: edu_loan
    percentage: 50
    rules:
      - when: "edu_loan.balance == 0"
        percentage: 0
  - name: investing
    percentage: 50
"""
    import yaml
    from pipeline.config_loader import _parse_config

    raw = yaml.safe_load(config_yaml_content)
    config = _parse_config(raw)
    engine = PipelineEngine(config)
    result = engine.run()

    # Edu loan is paid off, investing should get 100% of remainder
    assert len(result.allocations) == 1
    assert result.allocations[0].bucket_name == "investing"
    assert result.allocations[0].amount == 2000.0  # All $2000 remainder
