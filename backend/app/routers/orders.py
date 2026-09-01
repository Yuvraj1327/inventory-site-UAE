from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional

from app.core.security import require_staff_or_admin
from app.core.supabase_client import get_service_client
from app.services.compat import with_legacy_id, clean_list, now_iso, find_party_id_by_name

router = APIRouter(prefix="/api/orders", tags=["orders"])


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
async def list_orders(staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    res = sb.table("orders").select("*").eq("status", "open").order("order_date", desc=True).execute()
    # "open" here also covers "partial"; closed orders are excluded from the active list (Phase 3 finishes this)
    open_rows = res.data or []
    partial = sb.table("orders").select("*").eq("status", "partial").order("order_date", desc=True).execute().data or []
    return clean_list(open_rows + partial)


@router.post("")
async def create_order(payload: OrderCreate, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    data = payload.model_dump()
    if not data.get("order_date"):
        data["order_date"] = now_iso()[:10]
    data = _derive_totals(data)
    data["customer_id"] = await find_party_id_by_name(sb, "customers", data.get("customer"))
    data["supplier_id"] = await find_party_id_by_name(sb, "suppliers", data.get("supplier"))
    data["created_at"] = now_iso()
    res = sb.table("orders").insert(data).execute()
    return with_legacy_id(res.data[0])


@router.put("/{oid}")
async def update_order(oid: str, payload: OrderCreate, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    data = _derive_totals(payload.model_dump())
    data["customer_id"] = await find_party_id_by_name(sb, "customers", data.get("customer"))
    data["supplier_id"] = await find_party_id_by_name(sb, "suppliers", data.get("supplier"))
    sb.table("orders").update(data).eq("id", oid).execute()
    row = sb.table("orders").select("*").eq("id", oid).execute().data[0]
    return with_legacy_id(row)


@router.delete("/{oid}")
async def delete_order(oid: str, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    sb.table("orders").delete().eq("id", oid).execute()
    return {"ok": True}
