from fastapi import APIRouter, Depends
from app.core.security import require_staff_or_admin
from app.core.supabase_client import get_service_client

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
async def dashboard(staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    txns = sb.table("accounting_transactions").select("*").execute().data or []
    orders = sb.table("orders").select("*").execute().data or []

    total_income = sum(t["amount"] for t in txns if t.get("type") == "income")
    total_expense = sum(t["amount"] for t in txns if t.get("type") == "expense")

    cats = {}
    for t in txns:
        if t.get("type") == "expense":
            cats[t.get("category") or "Other"] = cats.get(t.get("category") or "Other", 0) + t["amount"]
    category_breakdown = [{"name": k, "value": round(v, 2)} for k, v in sorted(cats.items(), key=lambda x: -x[1])]

    monthly = {}
    for t in txns:
        month = (t.get("txn_date") or "")[:7]
        if not month:
            continue
        entry = monthly.setdefault(month, {"month": month, "income": 0, "expense": 0})
        if t.get("type") == "income":
            entry["income"] += t["amount"]
        elif t.get("type") == "expense":
            entry["expense"] += t["amount"]
    monthly_trend = sorted(monthly.values(), key=lambda x: x["month"])[-6:]

    order_revenue = sum(o.get("sale_amount", 0) or 0 for o in orders)
    order_cost = sum(o.get("supplier_cost", 0) or 0 for o in orders)
    order_profit = order_revenue - order_cost
    receivables = sum((o.get("sale_amount", 0) or 0) - (o.get("received_amount", 0) or 0) for o in orders)
    payables = sum((o.get("supplier_cost", 0) or 0) - (o.get("paid_to_supplier", 0) or 0) for o in orders)

    return {
        "total_income": round(total_income, 2),
        "total_expense": round(total_expense, 2),
        "net_profit": round(total_income - total_expense, 2),
        "transaction_count": len(txns),
        "order_count": len(orders),
        "order_revenue": round(order_revenue, 2),
        "order_profit": round(order_profit, 2),
        "receivables": round(receivables, 2),
        "payables": round(payables, 2),
        "category_breakdown": category_breakdown,
        "monthly_trend": monthly_trend,
    }
