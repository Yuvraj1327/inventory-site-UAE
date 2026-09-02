from fastapi import APIRouter, Depends
from typing import Optional

from app.core.security import require_staff_or_admin
from app.core.supabase_client import get_service_client
from app.services.compat import clean_list

router = APIRouter(prefix="/api/traffic", tags=["traffic"])


@router.get("/summary")
async def traffic_summary(staff=Depends(require_staff_or_admin)):
    """
    Top-level counts by activity type, plus login/customer counts.
    Deliberately reads only `customer_activity_log` — never touches
    `orders`/`invoices` — so browsing signal can never leak into sales
    numbers.
    """
    sb = get_service_client()
    rows = sb.table("customer_activity_log").select("*").execute().data or []
    by_type: dict[str, int] = {}
    by_customer: dict[str, dict] = {}
    for r in rows:
        t = r.get("activity_type") or "unknown"
        by_type[t] = by_type.get(t, 0) + 1
        cid = r.get("customer_id")
        if cid:
            e = by_customer.setdefault(cid, {"customer_id": cid, "activity_count": 0, "last_activity": ""})
            e["activity_count"] += 1
            if (r.get("created_at") or "") > e["last_activity"]:
                e["last_activity"] = r.get("created_at")

    cust_ids = list(by_customer.keys())
    names = {c["id"]: c["name"] for c in (sb.table("customers").select("id,name").in_("id", cust_ids).execute().data if cust_ids else [])}
    for cid, e in by_customer.items():
        e["customer"] = names.get(cid, "")

    return {
        "total_events": len(rows),
        "by_activity_type": by_type,
        "active_customers": sorted(by_customer.values(), key=lambda x: -x["activity_count"]),
    }


@router.get("/customer/{customer_id}")
async def customer_traffic(customer_id: str, staff=Depends(require_staff_or_admin)):
    """Full activity feed for one customer — browsing/demand only, clearly separate from their purchase history."""
    sb = get_service_client()
    rows = sb.table("customer_activity_log").select("*").eq("customer_id", customer_id).order("created_at", desc=True).limit(500).execute().data or []
    logins = [r for r in rows if r["activity_type"] == "login"]
    return {
        "customer_id": customer_id,
        "login_count": len(logins),
        "last_login": logins[0]["created_at"] if logins else None,
        "events": clean_list(rows),
    }


@router.get("/top-parts")
async def top_parts_searched(limit: int = 15, staff=Depends(require_staff_or_admin)):
    """Most searched/viewed parts — DEMAND signal, not sales. See /dashboard or /accounting for actual sales figures."""
    sb = get_service_client()
    rows = sb.table("customer_activity_log").select("product_id, activity_type").in_("activity_type", ["part_search", "part_view", "stock_check", "price_check"]).execute().data or []
    counts: dict[str, int] = {}
    for r in rows:
        pid = r.get("product_id")
        if pid:
            counts[pid] = counts.get(pid, 0) + 1
    if not counts:
        return []
    top = sorted(counts.items(), key=lambda x: -x[1])[:limit]
    ids = [pid for pid, _ in top]
    products = {p["id"]: p for p in (sb.table("products").select("id, part_number, description, brand").in_("id", ids).execute().data or [])}
    return [{"product_id": pid, "part_number": products.get(pid, {}).get("part_number", ""), "description": products.get(pid, {}).get("description", ""), "brand": products.get(pid, {}).get("brand", ""), "views": c} for pid, c in top]


@router.get("/top-brands")
async def top_brands_viewed(limit: int = 10, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    rows = sb.table("customer_activity_log").select("brand").eq("activity_type", "brand_view").execute().data or []
    counts: dict[str, int] = {}
    for r in rows:
        b = r.get("brand")
        if b:
            counts[b] = counts.get(b, 0) + 1
    return [{"brand": b, "views": c} for b, c in sorted(counts.items(), key=lambda x: -x[1])[:limit]]


@router.get("/most-purchased-parts")
async def most_purchased_parts(limit: int = 15, staff=Depends(require_staff_or_admin)):
    """ACTUAL sales, from invoice_lines — intentionally separate from the demand endpoints above."""
    sb = get_service_client()
    rows = sb.table("invoice_lines").select("part_number, description, qty").execute().data or []
    agg: dict[str, dict] = {}
    for r in rows:
        pn = r.get("part_number") or "—"
        e = agg.setdefault(pn, {"part_number": pn, "description": r.get("description", ""), "qty_sold": 0})
        e["qty_sold"] += r.get("qty") or 0
    return sorted(agg.values(), key=lambda x: -x["qty_sold"])[:limit]


@router.get("/most-purchased-brands")
async def most_purchased_brands(limit: int = 10, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    lines = sb.table("invoice_lines").select("product_id, qty").execute().data or []
    pids = list({l["product_id"] for l in lines if l.get("product_id")})
    brands = {p["id"]: p.get("brand", "") for p in (sb.table("products").select("id, brand").in_("id", pids).execute().data if pids else [])}
    agg: dict[str, float] = {}
    for l in lines:
        b = brands.get(l.get("product_id"), "") or "Unbranded"
        agg[b] = agg.get(b, 0) + (l.get("qty") or 0)
    return [{"brand": b, "qty_sold": q} for b, q in sorted(agg.items(), key=lambda x: -x[1])[:limit]]
