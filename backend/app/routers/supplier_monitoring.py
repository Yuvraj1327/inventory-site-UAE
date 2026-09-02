from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.core.security import require_staff_or_admin
from app.core.supabase_client import get_service_client
from app.services.compat import with_legacy_id, clean_list, now_iso
from app.services.audit import log_action

router = APIRouter(prefix="/api/supplier-monitoring", tags=["supplier-monitoring"])

VALID_INTERVALS = ("15m", "30m", "1h", "4h", "daily")


# =====================================================================
# Price checks (manual entry today; `source` distinguishes how a check
# was recorded so an automated provider — Phase 8 — can slot in later
# without changing this table or these endpoints).
# =====================================================================

class PriceCheckCreate(BaseModel):
    supplier_id: str
    part_number: str
    available_qty: Optional[float] = None
    price: Optional[float] = None
    eta: str = ""
    source: str = "manual"


@router.post("/checks")
async def record_price_check(payload: PriceCheckCreate, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    supplier = sb.table("suppliers").select("id, name").eq("id", payload.supplier_id).execute().data
    if not supplier:
        raise HTTPException(status_code=400, detail="Unknown supplier")
    product = sb.table("products").select("id").eq("part_number", payload.part_number).limit(1).execute().data
    product_id = product[0]["id"] if product else None

    data = {
        "supplier_id": payload.supplier_id, "product_id": product_id, "part_number": payload.part_number,
        "available_qty": payload.available_qty, "price": payload.price, "eta": payload.eta,
        "source": payload.source, "checked_by": staff.get("id"), "checked_at": now_iso(),
    }
    res = sb.table("supplier_price_checks").insert(data).execute()
    row = res.data[0]
    row["supplier"] = supplier[0]["name"]
    log_action(sb, staff.get("id"), "supplier_check.record", "supplier_price_check", row["id"], {
        "supplier": supplier[0]["name"], "part_number": payload.part_number, "price": payload.price,
    })
    return with_legacy_id(row)


@router.get("/checks")
async def list_price_checks(part_number: Optional[str] = None, supplier_id: Optional[str] = None, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    q = sb.table("supplier_price_checks").select("*")
    if part_number:
        q = q.eq("part_number", part_number)
    if supplier_id:
        q = q.eq("supplier_id", supplier_id)
    rows = q.order("checked_at", desc=True).limit(500).execute().data or []
    sup_ids = {r["supplier_id"] for r in rows}
    sups = {s["id"]: s["name"] for s in (sb.table("suppliers").select("id,name").in_("id", list(sup_ids)).execute().data if sup_ids else [])}
    for r in rows:
        r["supplier"] = sups.get(r["supplier_id"], "")
    return clean_list(rows)


@router.get("/price-history/{part_number}")
async def price_history(part_number: str, staff=Depends(require_staff_or_admin)):
    """Full, never-overwritten history of every recorded check for a part, oldest first, per supplier."""
    sb = get_service_client()
    rows = sb.table("supplier_price_checks").select("*").eq("part_number", part_number).order("checked_at").execute().data or []
    sup_ids = {r["supplier_id"] for r in rows}
    sups = {s["id"]: s["name"] for s in (sb.table("suppliers").select("id,name").in_("id", list(sup_ids)).execute().data if sup_ids else [])}
    by_supplier: dict[str, list] = {}
    for r in rows:
        name = sups.get(r["supplier_id"], "Unknown")
        by_supplier.setdefault(name, []).append({
            "price": r.get("price"), "available_qty": r.get("available_qty"),
            "eta": r.get("eta"), "checked_at": r.get("checked_at"), "source": r.get("source"),
        })
    # flag increases/decreases within each supplier's own series
    for name, series in by_supplier.items():
        prev = None
        for point in series:
            if prev is not None and point["price"] is not None and prev is not None:
                point["change"] = round(point["price"] - prev, 2) if point["price"] is not None else None
            else:
                point["change"] = None
            if point["price"] is not None:
                prev = point["price"]
    return {"part_number": part_number, "by_supplier": by_supplier}


@router.get("/compare/{part_number}")
async def compare_suppliers(part_number: str, staff=Depends(require_staff_or_admin)):
    """Latest known check per supplier for a given part — side-by-side comparison."""
    sb = get_service_client()
    rows = sb.table("supplier_price_checks").select("*").eq("part_number", part_number).order("checked_at", desc=True).execute().data or []
    latest_by_supplier = {}
    for r in rows:
        if r["supplier_id"] not in latest_by_supplier:
            latest_by_supplier[r["supplier_id"]] = r
    sup_ids = list(latest_by_supplier.keys())
    sups = {s["id"]: s["name"] for s in (sb.table("suppliers").select("id,name").in_("id", sup_ids).execute().data if sup_ids else [])}
    out = []
    for sid, r in latest_by_supplier.items():
        out.append({
            "supplier_id": sid, "supplier": sups.get(sid, ""), "price": r.get("price"),
            "available_qty": r.get("available_qty"), "eta": r.get("eta"), "checked_at": r.get("checked_at"),
        })
    out.sort(key=lambda x: (x["price"] is None, x["price"]))
    return out


# =====================================================================
# Supplier performance — computed from real purchase/lost-sale data,
# never invented.
# =====================================================================

@router.get("/performance")
async def supplier_performance(staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    suppliers = sb.table("suppliers").select("id, name").execute().data or []
    purchases = sb.table("purchases").select("*").execute().data or []
    lost_sales = sb.table("lost_sales").select("*").execute().data or []

    out = []
    for s in suppliers:
        sid = s["id"]
        sup_purchases = [p for p in purchases if p.get("supplier_id") == sid]
        fulfilled = sum(1 for p in sup_purchases if p.get("status") == "received")
        lost_due_to = [l for l in lost_sales if l.get("supplier_id") == sid]
        out.append({
            "supplier_id": sid, "supplier": s["name"],
            "purchase_count": len(sup_purchases),
            "fulfilled_count": fulfilled,
            "fulfillment_rate": round(fulfilled / len(sup_purchases) * 100, 1) if sup_purchases else None,
            "lost_demand_count": len(lost_due_to),
            "lost_demand_qty": round(sum(l.get("lost_qty") or 0 for l in lost_due_to), 2),
        })
    out.sort(key=lambda x: -(x["fulfillment_rate"] or 0))
    return out


# =====================================================================
# Monitoring tasks — configuration only in this environment (no live
# automated checker is running; see Phase 8 for the actual agent). This
# keeps the schema/API stable for Phase 8 to build on.
# =====================================================================

class MonitoringTaskCreate(BaseModel):
    supplier_id: str
    part_number: str
    interval: str = "1h"
    active: bool = True


@router.get("/tasks")
async def list_tasks(staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    rows = sb.table("supplier_monitoring_tasks").select("*").order("created_at", desc=True).execute().data or []
    sup_ids = {r["supplier_id"] for r in rows}
    sups = {s["id"]: s["name"] for s in (sb.table("suppliers").select("id,name").in_("id", list(sup_ids)).execute().data if sup_ids else [])}
    for r in rows:
        r["supplier"] = sups.get(r["supplier_id"], "")
    return clean_list(rows)


@router.post("/tasks")
async def create_task(payload: MonitoringTaskCreate, staff=Depends(require_staff_or_admin)):
    if payload.interval not in VALID_INTERVALS:
        raise HTTPException(status_code=400, detail=f"interval must be one of {VALID_INTERVALS}")
    sb = get_service_client()
    supplier = sb.table("suppliers").select("id, name").eq("id", payload.supplier_id).execute().data
    if not supplier:
        raise HTTPException(status_code=400, detail="Unknown supplier")
    data = {
        "supplier_id": payload.supplier_id, "part_number": payload.part_number,
        "interval": payload.interval, "active": payload.active,
        "created_by": staff.get("id"), "created_at": now_iso(),
    }
    res = sb.table("supplier_monitoring_tasks").insert(data).execute()
    row = res.data[0]
    row["supplier"] = supplier[0]["name"]
    log_action(sb, staff.get("id"), "monitoring_task.create", "supplier_monitoring_task", row["id"], data)
    return with_legacy_id(row)


@router.put("/tasks/{tid}")
async def update_task(tid: str, active: bool, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    sb.table("supplier_monitoring_tasks").update({"active": active}).eq("id", tid).execute()
    row = sb.table("supplier_monitoring_tasks").select("*").eq("id", tid).execute().data
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    log_action(sb, staff.get("id"), "monitoring_task.toggle", "supplier_monitoring_task", tid, {"active": active})
    return with_legacy_id(row[0])


@router.delete("/tasks/{tid}")
async def delete_task(tid: str, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    sb.table("supplier_monitoring_tasks").delete().eq("id", tid).execute()
    return {"ok": True}
