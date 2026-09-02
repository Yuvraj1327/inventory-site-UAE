from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.core.security import require_staff_or_admin
from app.core.supabase_client import get_service_client
from app.services.compat import with_legacy_id, clean_list, now_iso, find_party_id_by_name
from app.services.audit import log_action

router = APIRouter(prefix="/api/lost-sales", tags=["lost-sales"])


class LostSaleCreate(BaseModel):
    customer: str = ""
    part_number: str
    requested_qty: float
    supplied_qty: float = 0.0
    supplier: str = ""
    supplier_response: str = ""
    reason: str = ""
    date: Optional[str] = None


@router.get("")
async def list_lost_sales(
    customer_id: Optional[str] = None,
    supplier_id: Optional[str] = None,
    part_number: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    staff=Depends(require_staff_or_admin),
):
    sb = get_service_client()
    q = sb.table("lost_sales").select("*")
    if customer_id:
        q = q.eq("customer_id", customer_id)
    if supplier_id:
        q = q.eq("supplier_id", supplier_id)
    if part_number:
        q = q.ilike("part_number", f"%{part_number}%")
    if date_from:
        q = q.gte("occurred_on", date_from)
    if date_to:
        q = q.lte("occurred_on", date_to)
    res = q.order("occurred_on", desc=True).execute()
    rows = res.data or []

    # attach display names since the frontend/list works with names, not raw FK ids
    cust_ids = {r["customer_id"] for r in rows if r.get("customer_id")}
    sup_ids = {r["supplier_id"] for r in rows if r.get("supplier_id")}
    custs = {c["id"]: c["name"] for c in (sb.table("customers").select("id,name").in_("id", list(cust_ids)).execute().data if cust_ids else [])}
    sups = {s["id"]: s["name"] for s in (sb.table("suppliers").select("id,name").in_("id", list(sup_ids)).execute().data if sup_ids else [])}
    for r in rows:
        r["customer"] = custs.get(r.get("customer_id"), "")
        r["supplier"] = sups.get(r.get("supplier_id"), "")
    return clean_list(rows)


@router.post("")
async def create_lost_sale(payload: LostSaleCreate, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    if payload.requested_qty <= 0:
        raise HTTPException(status_code=400, detail="Requested quantity must be greater than 0")
    if payload.supplied_qty < 0 or payload.supplied_qty > payload.requested_qty:
        raise HTTPException(status_code=400, detail="Supplied quantity must be between 0 and the requested quantity")

    customer_id = await find_party_id_by_name(sb, "customers", payload.customer)
    supplier_id = await find_party_id_by_name(sb, "suppliers", payload.supplier)
    product = sb.table("products").select("id").eq("part_number", payload.part_number).limit(1).execute().data
    product_id = product[0]["id"] if product else None
    lost_qty = payload.requested_qty - payload.supplied_qty

    data = {
        "customer_id": customer_id, "product_id": product_id, "part_number": payload.part_number,
        "requested_qty": payload.requested_qty, "supplied_qty": payload.supplied_qty, "lost_qty": lost_qty,
        "supplier_id": supplier_id, "supplier_response": payload.supplier_response, "reason": payload.reason,
        "occurred_on": (payload.date or now_iso())[:10], "created_by": staff.get("id"), "created_at": now_iso(),
    }
    res = sb.table("lost_sales").insert(data).execute()
    row = res.data[0]
    row["customer"] = payload.customer
    row["supplier"] = payload.supplier
    log_action(sb, staff.get("id"), "lost_sale.create", "lost_sale", row["id"], {"part_number": payload.part_number, "lost_qty": lost_qty})
    return with_legacy_id(row)


@router.delete("/{lid}")
async def delete_lost_sale(lid: str, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    sb.table("lost_sales").delete().eq("id", lid).execute()
    return {"ok": True}


@router.get("/demand-summary")
async def demand_summary(staff=Depends(require_staff_or_admin)):
    """Aggregated demand by part — feeds future stock/purchase recommendations. Never mixes in actual sales."""
    sb = get_service_client()
    rows = sb.table("lost_sales").select("*").execute().data or []
    agg: dict[str, dict] = {}
    for r in rows:
        pn = r.get("part_number") or "unknown"
        e = agg.setdefault(pn, {"part_number": pn, "total_requested": 0.0, "total_lost": 0.0, "occurrences": 0})
        e["total_requested"] += r.get("requested_qty") or 0
        e["total_lost"] += r.get("lost_qty") or 0
        e["occurrences"] += 1
    result = sorted(agg.values(), key=lambda x: -x["total_lost"])
    return result
