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


@router.get("/extended")
async def dashboard_extended(staff=Depends(require_staff_or_admin)):
    """
    Phase 11 — operational metrics beyond the core financial summary
    above: demand/lost sales, supplier performance/price-change signal,
    AI-agent alerts, and customer traffic. Every figure is a live query
    against real tables — nothing here is hardcoded.
    """
    sb = get_service_client()

    inventory_rows = sb.table("inventory").select("product_id, available_qty").execute().data or []
    pids = [r["product_id"] for r in inventory_rows]
    costs = {p["id"]: p.get("unit_cost", 0) or 0 for p in (sb.table("products").select("id, unit_cost").in_("id", pids).execute().data if pids else [])}
    inventory_value = sum((r.get("available_qty") or 0) * costs.get(r["product_id"], 0) for r in inventory_rows)

    lost_sales = sb.table("lost_sales").select("lost_qty").execute().data or []
    lost_qty_total = sum(l.get("lost_qty", 0) or 0 for l in lost_sales)

    checks = sb.table("supplier_price_checks").select("supplier_id, part_number, price, checked_at").order("checked_at", desc=True).execute().data or []
    # crude price-change signal: parts with >1 distinct recorded price from the same supplier
    price_points: dict[tuple, set] = {}
    for c in checks:
        if c.get("price") is None:
            continue
        key = (c["supplier_id"], c["part_number"])
        price_points.setdefault(key, set()).add(c["price"])
    price_changes_detected = sum(1 for v in price_points.values() if len(v) > 1)

    opportunities = sb.table("supplier_opportunities").select("status").execute().data or []
    open_alerts = sum(1 for o in opportunities if o["status"] == "new")

    activity = sb.table("customer_activity_log").select("activity_type").execute().data or []
    demand_events = sum(1 for a in activity if a["activity_type"] in ("part_search", "part_view", "stock_check", "price_check"))

    active_customer_ids = {a["customer_id"] for a in (sb.table("customer_activity_log").select("customer_id").execute().data or []) if a.get("customer_id")}

    return {
        "inventory_value": round(inventory_value, 2),
        "lost_sales_count": len(lost_sales),
        "lost_qty_total": round(lost_qty_total, 2),
        "supplier_price_changes_detected": price_changes_detected,
        "ai_open_alerts": open_alerts,
        "customer_demand_events": demand_events,
        "customer_active_count": len(active_customer_ids),
    }
