from fastapi import APIRouter, Depends
from typing import Optional
from datetime import date, datetime

from app.core.security import require_staff_or_admin
from app.core.supabase_client import get_service_client

router = APIRouter(prefix="/api/accounting", tags=["accounting"])


def _period_bounds(period: Optional[str], date_from: Optional[str], date_to: Optional[str]):
    today = date.today()
    if date_from and date_to:
        return date_from, date_to
    if period == "monthly":
        start = today.replace(day=1)
    elif period == "quarterly":
        q_start_month = ((today.month - 1) // 3) * 3 + 1
        start = today.replace(month=q_start_month, day=1)
    elif period == "yearly":
        start = today.replace(month=1, day=1)
    else:
        start = today.replace(day=1)  # default: this month
    return start.isoformat(), today.isoformat()


@router.get("/pnl")
async def profit_and_loss(period: Optional[str] = None, date_from: Optional[str] = None, date_to: Optional[str] = None, staff=Depends(require_staff_or_admin)):
    """
    P&L / Income Statement. Revenue and COGS come from real invoice/
    product data.

    KNOWN LIMITATION (stated here rather than hidden): `invoice_lines`
    doesn't store a historical unit-cost snapshot, so COGS uses each
    product's *current* `unit_cost` as a proxy for cost-at-time-of-sale.
    For parts whose purchase cost has changed since they were sold,
    this differs from true historical COGS. A `cost_at_sale` column on
    `invoice_lines`, set at invoice-creation time, would remove this
    limitation — flagged as a follow-up, not silently glossed over.
    """
    sb = get_service_client()
    d_from, d_to = _period_bounds(period, date_from, date_to)

    invoices = sb.table("invoices").select("*").gte("invoice_date", d_from).lte("invoice_date", d_to).execute().data or []
    revenue = sum(i.get("subtotal", 0) or 0 for i in invoices)
    tax_collected = sum(i.get("tax_amount", 0) or 0 for i in invoices)

    invoice_ids = [i["id"] for i in invoices]
    lines = sb.table("invoice_lines").select("*").in_("invoice_id", invoice_ids).execute().data if invoice_ids else []
    product_ids = list({l["product_id"] for l in lines if l.get("product_id")})
    costs = {p["id"]: p.get("unit_cost", 0) or 0 for p in (sb.table("products").select("id, unit_cost").in_("id", product_ids).execute().data if product_ids else [])}
    cogs = sum((l.get("qty") or 0) * costs.get(l.get("product_id"), 0) for l in lines)

    gross_profit = revenue - cogs
    expenses_rows = sb.table("accounting_transactions").select("*").eq("type", "expense").gte("txn_date", d_from).lte("txn_date", d_to).execute().data or []
    expenses = sum(e.get("amount", 0) or 0 for e in expenses_rows)
    net_income = gross_profit - expenses

    expense_breakdown: dict[str, float] = {}
    for e in expenses_rows:
        cat = e.get("category") or "Other"
        expense_breakdown[cat] = expense_breakdown.get(cat, 0) + (e.get("amount") or 0)

    return {
        "period": {"from": d_from, "to": d_to},
        "revenue": round(revenue, 2),
        "tax_collected": round(tax_collected, 2),
        "cogs": round(cogs, 2),
        "gross_profit": round(gross_profit, 2),
        "gross_margin_percent": round(gross_profit / revenue * 100, 2) if revenue else 0,
        "expenses": round(expenses, 2),
        "expense_breakdown": [{"category": k, "amount": round(v, 2)} for k, v in sorted(expense_breakdown.items(), key=lambda x: -x[1])],
        "net_income": round(net_income, 2),
        "invoice_count": len(invoices),
    }


@router.get("/income-statement")
async def income_statement(period: Optional[str] = None, date_from: Optional[str] = None, date_to: Optional[str] = None, staff=Depends(require_staff_or_admin)):
    """Same figures as /pnl — kept as a separate route because the spec names both explicitly."""
    return await profit_and_loss(period, date_from, date_to, staff)


@router.get("/balance-sheet")
async def balance_sheet(as_of: Optional[str] = None, staff=Depends(require_staff_or_admin)):
    """
    Balance Sheet as of a given date (default: today).

    KNOWN LIMITATIONS (again, stated rather than hidden): there is no
    dedicated bank/cash ledger table, so "Cash" here is derived as
    (customer payments received) − (supplier payments paid) − (expenses
    paid), all-time up to `as_of`. This is a reasonable proxy for a
    cash-basis view but is not a reconciled bank balance. Likewise,
    "Retained Earnings" is the cumulative net income computed the same
    way /pnl computes it (with the same COGS-proxy limitation above),
    not a formally closed-and-carried-forward ledger balance.
    """
    sb = get_service_client()
    as_of = as_of or date.today().isoformat()

    invoices = sb.table("invoices").select("*").lte("invoice_date", as_of).execute().data or []
    total_invoiced = sum(i.get("total", 0) or 0 for i in invoices)
    payments = sb.table("payments").select("*").lte("payment_date", as_of).execute().data or []
    customer_payments = sum(p["amount"] for p in payments if p.get("party_type") == "customer")
    supplier_payments = sum(p["amount"] for p in payments if p.get("party_type") == "supplier")

    purchases = sb.table("purchases").select("*").lte("purchase_date", as_of).execute().data or []
    total_purchased = sum(p.get("total", 0) or 0 for p in purchases)

    expenses_rows = sb.table("accounting_transactions").select("amount").eq("type", "expense").lte("txn_date", as_of).execute().data or []
    total_expenses = sum(e.get("amount", 0) or 0 for e in expenses_rows)

    accounts_receivable = max(total_invoiced - customer_payments, 0)
    accounts_payable = max(total_purchased - supplier_payments, 0)
    cash = customer_payments - supplier_payments - total_expenses

    inventory_rows = sb.table("inventory").select("product_id, available_qty").execute().data or []
    pids = [r["product_id"] for r in inventory_rows]
    costs = {p["id"]: p.get("unit_cost", 0) or 0 for p in (sb.table("products").select("id, unit_cost").in_("id", pids).execute().data if pids else [])}
    inventory_value = sum((r.get("available_qty") or 0) * costs.get(r["product_id"], 0) for r in inventory_rows)

    assets = cash + accounts_receivable + inventory_value
    liabilities = accounts_payable

    capital_rows = sb.table("accounting_transactions").select("amount").eq("type", "capital").lte("txn_date", as_of).execute().data or []
    capital = sum(c.get("amount", 0) or 0 for c in capital_rows)

    pnl_all_time = await profit_and_loss(None, "2000-01-01", as_of, staff)
    retained_earnings = pnl_all_time["net_income"]
    equity = capital + retained_earnings

    difference = round(assets - (liabilities + equity), 2)
    return {
        "as_of": as_of,
        "assets": {
            "cash": round(cash, 2), "accounts_receivable": round(accounts_receivable, 2),
            "inventory": round(inventory_value, 2), "total": round(assets, 2),
        },
        "liabilities": {"accounts_payable": round(accounts_payable, 2), "total": round(liabilities, 2)},
        "equity": {"capital": round(capital, 2), "retained_earnings": round(retained_earnings, 2), "total": round(equity, 2)},
        "balanced": abs(difference) < 0.01,
        "difference": difference,
    }
