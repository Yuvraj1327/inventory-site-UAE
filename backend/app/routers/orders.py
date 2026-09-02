from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.core.security import require_staff_or_admin
from app.core.supabase_client import get_service_client
from app.services.compat import with_legacy_id, clean_list, now_iso, find_party_id_by_name
from app.services.audit import log_action

router = APIRouter(prefix="/api/orders", tags=["orders"])

ACTIVE_STATUSES = ("open", "confirmed", "partial", "shipped")


class OrderCreate(BaseModel):
    order_number: str
    customer: str = ""
    supplier: str = ""
    lpo_ref: str = ""
    pricing_status: str = ""
    pi_status: str = ""
    purchasing_value: float = 0.0
    vat_amount: float = 0.0
    selling_value: float = 0.0
    selling_vat: float = 0.0
    discount_additional_cost: float = 0.0
    supplier_pkl: str = ""
    customer_pkl: str = ""
    delivery_status: str = ""
    delivery_note: str = ""
    payment_received_status: str = "No"
    payment_paid_status: str = "No"
    sale_amount: float = 0.0
    received_amount: float = 0.0
    supplier_cost: float = 0.0
    paid_to_supplier: float = 0.0
    status: str = "open"
    order_date: Optional[str] = None
    notes: str = ""


def _derive_totals(data: dict) -> dict:
    sv, svat = data.get("selling_value") or 0, data.get("selling_vat") or 0
    if sv or svat:
        data["sale_amount"] = sv + svat
    pv, pvat = data.get("purchasing_value") or 0, data.get("vat_amount") or 0
    if pv or pvat:
        data["supplier_cost"] = pv + pvat
    return data


@router.get("")
async def list_orders(include_closed: bool = False, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    if include_closed:
        res = sb.table("orders").select("*").order("order_date", desc=True).execute()
        return clean_list(res.data or [])
    res = sb.table("orders").select("*").in_("status", list(ACTIVE_STATUSES)).order("order_date", desc=True).execute()
    return clean_list(res.data or [])


@router.get("/closed")
async def list_closed_orders(staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    res = sb.table("orders").select("*").eq("status", "closed").order("closed_at", desc=True).execute()
    return clean_list(res.data or [])


@router.post("")
async def create_order(payload: OrderCreate, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    data = payload.model_dump()
    if not data.get("order_date"):
        data["order_date"] = now_iso()[:10]
    data = _derive_totals(data)
    data["customer_id"] = await find_party_id_by_name(sb, "customers", data.get("customer"))
    data["supplier_id"] = await find_party_id_by_name(sb, "suppliers", data.get("supplier"))
    data["order_month"] = f"{data['order_date'][:7]}-01"
    data["created_at"] = now_iso()
    res = sb.table("orders").insert(data).execute()
    order = res.data[0]
    log_action(sb, staff.get("id"), "order.create", "order", order["id"], {"order_number": order.get("order_number")})
    return with_legacy_id(order)


@router.put("/{oid}")
async def update_order(oid: str, payload: OrderCreate, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    existing = sb.table("orders").select("status").eq("id", oid).execute().data
    if not existing:
        raise HTTPException(status_code=404, detail="Order not found")
    if existing[0]["status"] == "closed" and payload.status == "closed":
        raise HTTPException(status_code=400, detail="This order is closed and is read-only. Reopen it first if it needs changes.")
    data = _derive_totals(payload.model_dump())
    data["customer_id"] = await find_party_id_by_name(sb, "customers", data.get("customer"))
    data["supplier_id"] = await find_party_id_by_name(sb, "suppliers", data.get("supplier"))
    sb.table("orders").update(data).eq("id", oid).execute()
    row = sb.table("orders").select("*").eq("id", oid).execute().data[0]
    return with_legacy_id(row)


@router.delete("/{oid}")
async def delete_order(oid: str, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    sb.table("order_lines").delete().eq("order_id", oid).execute()
    sb.table("orders").delete().eq("id", oid).execute()
    log_action(sb, staff.get("id"), "order.delete", "order", oid)
    return {"ok": True}


@router.post("/{oid}/close")
async def close_order(oid: str, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    existing = sb.table("orders").select("*").eq("id", oid).execute().data
    if not existing:
        raise HTTPException(status_code=404, detail="Order not found")
    sb.table("orders").update({
        "status": "closed", "closed_at": now_iso(), "closed_by": staff.get("id"),
    }).eq("id", oid).execute()
    log_action(sb, staff.get("id"), "order.close", "order", oid, {"order_number": existing[0].get("order_number")})
    row = sb.table("orders").select("*").eq("id", oid).execute().data[0]
    return with_legacy_id(row)


@router.post("/{oid}/reopen")
async def reopen_order(oid: str, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    existing = sb.table("orders").select("*").eq("id", oid).execute().data
    if not existing:
        raise HTTPException(status_code=404, detail="Order not found")
    sb.table("orders").update({"status": "open", "closed_at": None, "closed_by": None}).eq("id", oid).execute()
    log_action(sb, staff.get("id"), "order.reopen", "order", oid)
    row = sb.table("orders").select("*").eq("id", oid).execute().data[0]
    return with_legacy_id(row)


@router.post("/carry-forward")
async def carry_forward(staff=Depends(require_staff_or_admin)):
    """
    Clones every non-Closed order into the current calendar month,
    preserving the original order_number and full history (the source
    row is untouched; a new row is inserted linked via
    carried_forward_from). Safe to run more than once in the same month
    — orders already carried forward into the current month are skipped.
    """
    sb = get_service_client()
    this_month = f"{now_iso()[:7]}-01"

    open_orders = sb.table("orders").select("*").in_("status", list(ACTIVE_STATUSES)).neq("order_month", this_month).execute().data or []
    already_here = {
        (o.get("order_number"), o.get("order_month"))
        for o in (sb.table("orders").select("order_number, order_month").eq("order_month", this_month).execute().data or [])
    }

    created = []
    for o in open_orders:
        if (o.get("order_number"), this_month) in already_here:
            continue
        clone = {k: v for k, v in o.items() if k not in ("id", "_id", "created_at", "updated_at")}
        clone["order_month"] = this_month
        clone["carried_forward_from"] = o["id"]
        clone["order_date"] = now_iso()[:10]
        clone["created_at"] = now_iso()
        res = sb.table("orders").insert(clone).execute()
        new_order = res.data[0]
        created.append(new_order["id"])

        old_lines = sb.table("order_lines").select("*").eq("order_id", o["id"]).execute().data or []
        for li in old_lines:
            line_clone = {k: v for k, v in li.items() if k not in ("id", "created_at", "updated_at")}
            line_clone["order_id"] = new_order["id"]
            sb.table("order_lines").insert(line_clone).execute()

        log_action(sb, staff.get("id"), "order.carry_forward", "order", new_order["id"], {"from_order_id": o["id"], "order_number": o.get("order_number")})

    return {"carried_forward": len(created), "order_ids": created, "month": this_month}
