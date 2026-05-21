"""Telegram bot — conversational interface to the financial pipeline.

Uses python-telegram-bot v21+ (async, Application class).
Talks directly to pipeline modules — no HTTP API calls.
"""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path
from typing import Callable

import yaml
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from pipeline.config_loader import load_config
from pipeline.config_writer import get_full_config, update_balances
from pipeline.database import (
    get_balance_history,
    get_connection,
    get_net_worth_history,
    get_run_history,
    save_pipeline_run,
)
from pipeline.engine import PipelineEngine
from pipeline.forex_service import get_rate, get_rate_for_engine
from pipeline.projections import calculate_emergency_fund_projection, calculate_loan_payoff

# ---------------------------------------------------------------------------
# Config paths
# ---------------------------------------------------------------------------

CONFIG_PATH = Path(__file__).parent.parent.parent.parent / "config" / "config.yaml"


# ---------------------------------------------------------------------------
# Config loading
# ---------------------------------------------------------------------------


def load_bot_config() -> tuple[str, list[int]]:
    """Load bot token and allowed user IDs from config.yaml."""
    with open(CONFIG_PATH) as f:
        raw = yaml.safe_load(f)
    tg = raw.get("telegram", {})
    token = tg.get("bot_token", "")
    raw_ids = tg.get("allowed_user_ids", [])
    # Ensure IDs are ints
    allowed_ids = [int(uid) for uid in raw_ids] if raw_ids else []
    return token, allowed_ids


# ---------------------------------------------------------------------------
# Security
# ---------------------------------------------------------------------------


def _is_allowed(update: Update, allowed_user_ids: list[int]) -> bool:
    """Return True if the sender is in the allowed list (or list is empty)."""
    if not allowed_user_ids:
        return True
    user = update.effective_user
    if user is None:
        return False
    return user.id in allowed_user_ids


def _make_auth_check(allowed_user_ids: list[int]) -> Callable:
    """Return a decorator that gates handlers behind the allowed-user check."""
    def auth(handler: Callable) -> Callable:
        async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
            if not _is_allowed(update, allowed_user_ids):
                await update.message.reply_text("Sorry, this bot is private.")
                return
            await handler(update, context)
        wrapper.__name__ = handler.__name__
        return wrapper
    return auth


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

# Characters that must be escaped in MarkdownV2
_MD_SPECIAL = r"\_*[]()~`>#+-=|{}.!"


def escape_md(text: str) -> str:
    """Escape all MarkdownV2 special characters in *text*."""
    for ch in _MD_SPECIAL:
        text = text.replace(ch, f"\\{ch}")
    return text


def _progress_bar(current: float, target: float, blocks: int = 10) -> str:
    """Return a block-character progress bar (▰ filled, ▱ empty)."""
    if target <= 0:
        pct = 0.0
    else:
        pct = min(current / target, 1.0)
    filled = round(pct * blocks)
    return "▰" * filled + "▱" * (blocks - filled)


def _currency_symbol(currency: str) -> str:
    return "₹" if currency.upper() == "INR" else "$"


def _fmt_amount(amount: float, currency: str) -> str:
    sym = _currency_symbol(currency)
    return f"{sym}{amount:,.0f}"


# ---------------------------------------------------------------------------
# /start
# ---------------------------------------------------------------------------


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = (
        "👋 *Financial Pipeline Bot*\n"
        "━━━━━━━━━━━━━━━━━━━━━━━━\n"
        "Your personal finance assistant\\. Here's what I can do:\n\n"
        "📊 */summary* or */s* — Monthly allocation overview\n"
        "💳 */balances* or */b* — Current account balances\n"
        "📈 */networth* or */nw* — Net worth snapshot\n"
        "🎓 */loan* or */l* — Loan payoff projection\n"
        "🛡️ */emergency* or */ef* — Emergency fund status\n"
        "💱 */rate* or */r* — Live USD → INR rate\n"
        "🏠 */expenses* or */e* — Fixed monthly expenses\n"
        "💾 */save* — Save a pipeline snapshot\n"
        "🔄 */refresh* — Force\\-refresh forex rate\n"
        "✏️ */update* \\<name\\> \\<amount\\> — Update a balance\n"
        "❓ */help* or */h* — This list\n\n"
        "You can also just chat — I understand natural language\\!"
    )
    await update.message.reply_text(text, parse_mode="MarkdownV2")


# ---------------------------------------------------------------------------
# /help
# ---------------------------------------------------------------------------


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await cmd_start(update, context)


# ---------------------------------------------------------------------------
# /summary (/s)
# ---------------------------------------------------------------------------


async def cmd_summary(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        config = load_config(CONFIG_PATH)
    except Exception as e:
        await update.message.reply_text(f"Config error: {escape_md(str(e))}", parse_mode="MarkdownV2")
        return

    conn = get_connection()
    try:
        # Update forex rate in config before running
        rate = get_rate_for_engine(conn)
        if "usd_inr" in config.forex:
            config.forex["usd_inr"].rate = rate

        engine = PipelineEngine(config)
        output = engine.run()

        total_income = output.total_income
        total_fixed = output.total_fixed_expenses
        remainder = output.remainder_for_buckets
        alloc_pct = (remainder / total_income * 100) if total_income > 0 else 0.0

        lines = [
            "💰 *Monthly Summary*",
            "━━━━━━━━━━━━━━━━━",
            f"`Income:    ${total_income:>9,.0f}`",
            f"`Expenses:  ${total_fixed:>9,.0f}`",
            f"`Allocated: ${remainder:>9,.0f} ({alloc_pct:.1f}%)`",
            "",
            "📊 *Bucket Split:*",
        ]

        for alloc in output.allocations:
            pct_str = f"{alloc.percentage_used:.0f}%"
            usd_str = f"${alloc.amount:,.0f}"
            if alloc.converted_amount and alloc.converted_currency:
                sym = _currency_symbol(alloc.converted_currency.value)
                conv_str = f" ({sym}{alloc.converted_amount:,.0f})"
            else:
                conv_str = ""
            lines.append(
                f"`  {alloc.bucket_name:<12} {pct_str:>4}  {usd_str}{conv_str}`"
            )

        await update.message.reply_text(
            escape_md("\n".join(lines)).replace("\\`", "`"),
            parse_mode="MarkdownV2",
        )
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# /balances (/b)
# ---------------------------------------------------------------------------


async def cmd_balances(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        config = load_config(CONFIG_PATH)
    except Exception as e:
        await update.message.reply_text(f"Config error: {escape_md(str(e))}", parse_mode="MarkdownV2")
        return

    lines = ["💳 *Current Balances*", "━━━━━━━━━━━━━━━━━"]

    for name, bal in config.balances.items():
        sym = _currency_symbol(bal.currency.value)
        amount_str = f"{sym}{bal.amount:,.0f}"
        rate_str = f" ({bal.interest_rate}%)" if bal.interest_rate else ""
        lines.append(f"  `{name:<18}` {escape_md(amount_str + rate_str)}")

    await update.message.reply_text("\n".join(lines), parse_mode="MarkdownV2")


# ---------------------------------------------------------------------------
# /networth (/nw)
# ---------------------------------------------------------------------------


async def cmd_networth(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        config = load_config(CONFIG_PATH)
    except Exception as e:
        await update.message.reply_text(f"Config error: {escape_md(str(e))}", parse_mode="MarkdownV2")
        return

    conn = get_connection()
    try:
        rate = get_rate_for_engine(conn)
    finally:
        conn.close()

    assets = 0.0
    liabilities = 0.0

    for name, bal in config.balances.items():
        amount = bal.amount
        if bal.currency.value == "INR":
            amount = amount / rate
        if "loan" in name.lower():
            liabilities += amount
        else:
            assets += amount

    net_worth = assets - liabilities

    lines = [
        "📈 *Net Worth*",
        "━━━━━━━━━━━",
        f"  Assets:      {escape_md(f'${assets:,.0f}')}",
        f"  Liabilities: {escape_md(f'-${liabilities:,.0f}')}",
        f"  *Net Worth:* {escape_md(f'${net_worth:,.0f}')}",
    ]

    await update.message.reply_text("\n".join(lines), parse_mode="MarkdownV2")


# ---------------------------------------------------------------------------
# /loan (/l)
# ---------------------------------------------------------------------------


async def cmd_loan(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        config = load_config(CONFIG_PATH)
    except Exception as e:
        await update.message.reply_text(f"Config error: {escape_md(str(e))}", parse_mode="MarkdownV2")
        return

    # Find edu_loan balance and bucket
    edu_bal = config.balances.get("edu_loan")
    if not edu_bal:
        await update.message.reply_text("No `edu_loan` balance found in config\\.", parse_mode="MarkdownV2")
        return

    # Find the allocation for edu_loan to determine monthly payment
    conn = get_connection()
    try:
        rate = get_rate_for_engine(conn)
        if "usd_inr" in config.forex:
            config.forex["usd_inr"].rate = rate

        engine = PipelineEngine(config)
        output = engine.run()
    finally:
        conn.close()

    monthly_inr = 0.0
    for alloc in output.allocations:
        if alloc.bucket_name == "edu_loan":
            if alloc.converted_amount:
                monthly_inr = alloc.converted_amount
            else:
                monthly_inr = alloc.amount * rate
            break

    if monthly_inr <= 0:
        await update.message.reply_text(
            "Could not find monthly payment for edu\\_loan\\. Check bucket config\\.",
            parse_mode="MarkdownV2",
        )
        return

    projection = calculate_loan_payoff(
        loan_name="edu_loan",
        balance=edu_bal.amount,
        currency=edu_bal.currency.value,
        annual_interest_rate=edu_bal.interest_rate,
        monthly_payment=monthly_inr,
    )

    payoff_date = date.fromisoformat(projection.payoff_date)
    payoff_str = payoff_date.strftime("%b %Y")

    lines = [
        "🎓 *Education Loan Projection*",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━",
        f"  Balance:   {escape_md(_fmt_amount(edu_bal.amount, 'INR'))}",
        f"  Monthly:   {escape_md(_fmt_amount(monthly_inr, 'INR'))}",
        f"  Interest:  {escape_md(str(edu_bal.interest_rate))}%",
        f"  Payoff:    ~{projection.months_remaining} months \\({escape_md(payoff_str)}\\)",
        f"  Total int: {escape_md(_fmt_amount(projection.total_interest_paid, 'INR'))}",
    ]

    await update.message.reply_text("\n".join(lines), parse_mode="MarkdownV2")


# ---------------------------------------------------------------------------
# /emergency (/ef)
# ---------------------------------------------------------------------------


async def cmd_emergency(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        config = load_config(CONFIG_PATH)
    except Exception as e:
        await update.message.reply_text(f"Config error: {escape_md(str(e))}", parse_mode="MarkdownV2")
        return

    ef_bal = config.balances.get("emergency_fund")
    if not ef_bal:
        await update.message.reply_text("No `emergency_fund` balance found in config\\.", parse_mode="MarkdownV2")
        return

    # Find target from bucket config
    target = 0.0
    monthly_contribution = 0.0
    total_expenses = sum(exp.amount for exp in config.fixed_expenses)

    for bucket in config.buckets:
        if bucket.name == "emergency_fund":
            if bucket.target:
                target = total_expenses * bucket.target.months
            break

    # Find monthly contribution from engine
    conn = get_connection()
    try:
        rate = get_rate_for_engine(conn)
        if "usd_inr" in config.forex:
            config.forex["usd_inr"].rate = rate
        engine = PipelineEngine(config)
        output = engine.run()
        for alloc in output.allocations:
            if alloc.bucket_name == "emergency_fund":
                monthly_contribution = alloc.amount
                break
    finally:
        conn.close()

    current = ef_bal.amount
    projection = calculate_emergency_fund_projection(current, monthly_contribution, target)

    bar = _progress_bar(current, target)
    pct = projection.get("percentage", 0.0) if target > 0 else 0.0

    months_away = projection.get("months_remaining", 0)
    if projection["status"] == "complete":
        eta_str = "Fully funded! 🎉"
    elif projection["status"] == "no_contribution":
        eta_str = "No contribution set"
    else:
        eta_str = f"~{months_away} months away"

    lines = [
        "🛡️ *Emergency Fund*",
        "━━━━━━━━━━━━━━━━",
        f"  Current:  {escape_md(f'${current:,.0f} / ${target:,.0f}')}",
        f"  Progress: {bar} {escape_md(f'{pct:.0f}%')}",
        f"  Target:   {escape_md(eta_str)}",
    ]

    await update.message.reply_text("\n".join(lines), parse_mode="MarkdownV2")


# ---------------------------------------------------------------------------
# /rate (/r)
# ---------------------------------------------------------------------------


async def cmd_rate(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    conn = get_connection()
    try:
        info = get_rate(conn, "USD", "INR")
    finally:
        conn.close()

    rate_val = info.get("rate")
    if rate_val is None:
        await update.message.reply_text("Could not retrieve forex rate\\. Try /refresh\\.", parse_mode="MarkdownV2")
        return

    age_hours = info.get("cache_age_hours", 0) or 0
    is_stale = info.get("is_stale", False)
    status_icon = "⚠️ Stale" if is_stale else "✅ Fresh"
    if age_hours < 1:
        age_str = "just now"
    elif age_hours < 2:
        age_str = "1h ago"
    else:
        age_str = f"{int(age_hours)}h ago"

    source = info.get("source") or "unknown"

    lines = [
        "💱 *USD → INR*",
        "━━━━━━━━━━━",
        f"  Rate:    {escape_md(f'₹{rate_val:.2f}')}",
        f"  Status:  {escape_md(f'{status_icon} ({age_str})')}",
        f"  Source:  {escape_md(source)}",
    ]

    await update.message.reply_text("\n".join(lines), parse_mode="MarkdownV2")


# ---------------------------------------------------------------------------
# /save
# ---------------------------------------------------------------------------


async def cmd_save(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        config = load_config(CONFIG_PATH)
    except Exception as e:
        await update.message.reply_text(f"Config error: {escape_md(str(e))}", parse_mode="MarkdownV2")
        return

    conn = get_connection()
    try:
        rate = get_rate_for_engine(conn)
        if "usd_inr" in config.forex:
            config.forex["usd_inr"].rate = rate

        engine = PipelineEngine(config)
        output = engine.run()

        balances_dict = {
            name: {
                "amount": bal.amount,
                "currency": bal.currency.value,
                "interest_rate": bal.interest_rate,
            }
            for name, bal in config.balances.items()
        }

        allocations_list = [a.model_dump() for a in output.allocations]
        instructions_list = [i.model_dump() for i in output.transfer_instructions]

        run_id = save_pipeline_run(
            conn=conn,
            run_date=date.today(),
            total_income=output.total_income,
            total_fixed_expenses=output.total_fixed_expenses,
            remainder=output.remainder_for_buckets,
            allocations=allocations_list,
            instructions=instructions_list,
            emergency_fund_status=output.emergency_fund_status,
            balances=balances_dict,
            usd_inr_rate=rate,
        )

        today_str = date.today().strftime("%b %d, %Y")
        lines = [
            "✅ *Snapshot saved\\!*",
            f"  Run \\#{run_id} — {escape_md(today_str)}",
        ]
        await update.message.reply_text("\n".join(lines), parse_mode="MarkdownV2")
    except Exception as e:
        await update.message.reply_text(f"Error saving: {escape_md(str(e))}", parse_mode="MarkdownV2")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# /refresh
# ---------------------------------------------------------------------------


async def cmd_refresh(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    conn = get_connection()
    try:
        # Get old rate first
        old_info = get_rate(conn, "USD", "INR", force_refresh=False)
        old_rate = old_info.get("rate")

        # Force refresh
        new_info = get_rate(conn, "USD", "INR", force_refresh=True)
        new_rate = new_info.get("rate")
    finally:
        conn.close()

    if new_rate is None:
        await update.message.reply_text("Failed to refresh rate\\. Check your internet connection\\.", parse_mode="MarkdownV2")
        return

    if old_rate and old_rate != new_rate:
        change_str = f" \\(was ₹{old_rate:.2f}\\)"
    else:
        change_str = ""

    lines = [
        "💱 *Rate refreshed\\!*",
        f"  {escape_md(f'$1 = ₹{new_rate:.2f}')}{change_str}",
    ]
    await update.message.reply_text("\n".join(lines), parse_mode="MarkdownV2")


# ---------------------------------------------------------------------------
# /update <balance_name> <amount>
# ---------------------------------------------------------------------------


async def cmd_update(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    args = context.args
    if not args or len(args) < 2:
        await update.message.reply_text(
            "Usage: `/update <balance_name> <amount>`\nExample: `/update emergency_fund 3000`",
            parse_mode="MarkdownV2",
        )
        return

    balance_name = args[0].strip()
    try:
        amount = float(args[1].replace(",", ""))
    except ValueError:
        await update.message.reply_text(
            f"Invalid amount: {escape_md(args[1])}\\. Use a number like `3000` or `2500000`\\.",
            parse_mode="MarkdownV2",
        )
        return

    # Verify balance exists in config
    try:
        config = load_config(CONFIG_PATH)
    except Exception as e:
        await update.message.reply_text(f"Config error: {escape_md(str(e))}", parse_mode="MarkdownV2")
        return

    if balance_name not in config.balances:
        known = ", ".join(config.balances.keys())
        await update.message.reply_text(
            f"Balance `{escape_md(balance_name)}` not found\\.\nKnown: {escape_md(known)}",
            parse_mode="MarkdownV2",
        )
        return

    # Determine currency for display
    bal = config.balances[balance_name]
    currency = bal.currency.value

    try:
        update_balances(CONFIG_PATH, {balance_name: {"amount": amount}})
    except Exception as e:
        await update.message.reply_text(f"Failed to update: {escape_md(str(e))}", parse_mode="MarkdownV2")
        return

    sym = _currency_symbol(currency)
    lines = [
        f"✅ *Updated {escape_md(balance_name)}*",
        f"  New balance: {escape_md(f'{sym}{amount:,.0f}')}",
    ]
    await update.message.reply_text("\n".join(lines), parse_mode="MarkdownV2")


# ---------------------------------------------------------------------------
# /expenses (/e)
# ---------------------------------------------------------------------------


async def cmd_expenses(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        config = load_config(CONFIG_PATH)
    except Exception as e:
        await update.message.reply_text(f"Config error: {escape_md(str(e))}", parse_mode="MarkdownV2")
        return

    total = sum(exp.amount for exp in config.fixed_expenses)

    lines = ["🏠 *Fixed Monthly Expenses*", "━━━━━━━━━━━━━━━━━━━━━━━"]
    for exp in config.fixed_expenses:
        sym = _currency_symbol(exp.currency.value)
        lines.append(f"  `{exp.name:<18}` {escape_md(f'{sym}{exp.amount:,.0f}')}")

    lines.append(f"  `{'─' * 22}`")
    lines.append(f"  *Total:* {escape_md(f'${total:,.0f}')}")

    await update.message.reply_text("\n".join(lines), parse_mode="MarkdownV2")


# ---------------------------------------------------------------------------
# Natural language handler
# ---------------------------------------------------------------------------


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Keyword-based natural language dispatcher."""
    msg = (update.message.text or "").lower()

    if any(w in msg for w in ("net worth", "worth", "networth")):
        await cmd_networth(update, context)
    elif any(w in msg for w in ("loan", "payoff", "paid off", "pay off")):
        await cmd_loan(update, context)
    elif any(w in msg for w in ("balance", "balances")):
        await cmd_balances(update, context)
    elif any(w in msg for w in ("summary", "overview", "pipeline")):
        await cmd_summary(update, context)
    elif any(w in msg for w in ("expense", "bill", "spend", "spending")):
        await cmd_expenses(update, context)
    elif any(w in msg for w in ("emergency", "safety net", "emergency fund")):
        await cmd_emergency(update, context)
    elif any(w in msg for w in ("rate", "forex", "dollar", "rupee", "usd", "inr")):
        await cmd_rate(update, context)
    elif any(w in msg for w in ("save", "snapshot")):
        await cmd_save(update, context)
    else:
        await update.message.reply_text(
            "I'm not sure what you mean\\. Try /help to see what I can do\\!",
            parse_mode="MarkdownV2",
        )


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def main() -> None:
    token, allowed_ids = load_bot_config()

    if not token or token == "YOUR_BOT_TOKEN_HERE":
        print("No Telegram bot token configured.")
        print("   Add your token to config/config.yaml under telegram.bot_token")
        return

    # Build auth-guarded versions of every handler
    auth = _make_auth_check(allowed_ids)

    app = Application.builder().token(token).build()

    # Commands
    app.add_handler(CommandHandler("start",     auth(cmd_start)))
    app.add_handler(CommandHandler("help",      auth(cmd_help)))
    app.add_handler(CommandHandler("h",         auth(cmd_help)))
    app.add_handler(CommandHandler("summary",   auth(cmd_summary)))
    app.add_handler(CommandHandler("s",         auth(cmd_summary)))
    app.add_handler(CommandHandler("balances",  auth(cmd_balances)))
    app.add_handler(CommandHandler("b",         auth(cmd_balances)))
    app.add_handler(CommandHandler("networth",  auth(cmd_networth)))
    app.add_handler(CommandHandler("nw",        auth(cmd_networth)))
    app.add_handler(CommandHandler("loan",      auth(cmd_loan)))
    app.add_handler(CommandHandler("l",         auth(cmd_loan)))
    app.add_handler(CommandHandler("emergency", auth(cmd_emergency)))
    app.add_handler(CommandHandler("ef",        auth(cmd_emergency)))
    app.add_handler(CommandHandler("rate",      auth(cmd_rate)))
    app.add_handler(CommandHandler("r",         auth(cmd_rate)))
    app.add_handler(CommandHandler("save",      auth(cmd_save)))
    app.add_handler(CommandHandler("refresh",   auth(cmd_refresh)))
    app.add_handler(CommandHandler("update",    auth(cmd_update)))
    app.add_handler(CommandHandler("expenses",  auth(cmd_expenses)))
    app.add_handler(CommandHandler("e",         auth(cmd_expenses)))

    # Natural language fallback (non-command text messages)
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, auth(handle_text)))

    print(f"Telegram bot started! Allowed users: {allowed_ids or 'all'}")
    app.run_polling()


if __name__ == "__main__":
    main()
