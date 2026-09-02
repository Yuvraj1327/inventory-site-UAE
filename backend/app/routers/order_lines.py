from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.core.security import require_staff_or_admin
from app.core.supabase_client import get_service_client
from app.services.compat import with_legacy_id, clean_list, now_iso
from app.services.audit import log_action

router = APIRouter(prefix="/api/orders/{order_id}/lines", tags=["order-lines"])


class LineCreate(BaseModel):
    part_number: str
    order_qty: float


class LineUpdate(BaseModel):
    order_qty: Optional[float] = None
    confirm_qty: Optional[float] = None
    cancelled_qty: Optional[float] = None
    shipped_qty: Optional[float] = None
    unit_selling_price: Optional[float] = None
    status: Optional[str] = None


def _customer_price(sb, customer_id: Optional[str], unit_cost: float, default_price: float) -> float:
    if not customer_id:
        return default_price or unit_cost
    cust = sb.table("customers").select("margin_percent").eq("id", customer_id).execute().data
    if not cust:
        return default_price or unit_cost
    margin = cust[0].get("margin_percent") or 0
    if not margin:
        return default_price or unit_cost
    return round(unit_cost * (1 + margin / 100.0), 2)


def _validate_quantities(order_qty: float, confirm_qty: float, cancelled_qty: float, shipped_qty: float):
    for label, v in [("order_qty", order_qty), ("confirm_qty", confirm_qty), ("cancelled_qty", cancelled_qty), ("shipped_qty", shipped_qty)]:
        if v < 0:
            raise HTTPException(status_code=400, detail=f"{label} cannot be negative")
    if confirm_qty > order_qty:
        raise HTTPException(status_code=400, detail="Confirm Qty cannot exceed Order Qty")
    if cancelled_qty > order_qty:
        raise HTTPException(status_code=400, detail="Cancelled Qty cannot exceed Order Qty")
    if shipped_qty > confirm_qty:
        raise HTTPException(status_code=400, detail="Shipped Qty cannot exceed Confirm Qty")
    if confirm_qty + cancelled_qty > order_qty:
        raise HTTPException(status_code=400, detail="Confirm Qty + Cancelled Qty cannot exceed Order Qty")


@router.get("")
async def list_lines(order_id: str, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    res = sb.table("order_lines").select("*").eq("order_id", order_id).order("line_no").execute()
    rows = res.data or []
    for r in rows:
        r["amount"] = round((r.get("confirm_qty") or 0) * (r.get("unit_selling_price") or 0), 2)
    return clean_list(rows)


@router.post("")
async def add_line(order_id: str, payload: LineCreate, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    order = sb.table("orders").select("*").eq("id", order_id).execute().data
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order = order[0]
    if order["status"] == "closed":
        raise HTTPException(status_code=400, detail="Order is closed; reopen it to add lines")
    if payload.order_qty <= 0:
        raise HTTPException(status_code=400, detail="Order Qty must be greater than 0")

    product = sb.table("products").select("*").eq("part_number", payload.part_number).limit(1).execute().data
    inv_qty = 0.0
    if product:
        p = product[0]
        inv_row = sb.table("inventory").select("available_qty").eq("product_id", p["id"]).execute().data
        inv_qty = (inv_row[0]["available_qty"] if inv_row else 0) or 0
        description = p.get("description", "")
        brand = p.get("brand", "")
        oem = p.get("oem_reference", "")
        unit_cost = p.get("unit_cost", 0) or 0
        default_price = p.get("default_selling_price", 0) or 0
        product_id = p["id"]
        availability = "In Stock" if inv_qty >= payload.order_qty else ("Partial Stock" if inv_qty > 0 else "Out of Stock")
    else:
        description, brand, oem, unit_cost, default_price, product_id = "", "", "", 0.0, 0.0, None
        availability = "Not in catalog"

    price = _customer_price(sb, order.get("customer_id"), unit_cost, default_price)

    existing_lines = sb.table("order_lines").select("line_no").eq("order_id", order_id).execute().data or []
    next_line_no = (max((li["line_no"] for li in existing_lines), default=0)) + 1

    data = {
        "order_id": order_id, "line_no": next_line_no, "product_id": product_id,
        "part_number": payload.part_number, "description": description, "brand": brand,
        "oem_reference": oem, "availability": availability,
        "order_qty": payload.order_qty, "confirm_qty": 0, "cancelled_qty": 0, "shipped_qty": 0,
        "unit_selling_price": price, "status": "Pending" if product else "Needs review (unknown part)",
        "created_at": now_iso(),
    }
    res = sb.table("order_lines").insert(data).execute()
    line = res.data[0]
    log_action(sb, staff.get("id"), "order_line.add", "order_line", line["id"], {"order_id": order_id, "part_number": payload.part_number})
    line["amount"] = round((line.get("confirm_qty") or 0) * (line.get("unit_selling_price") or 0), 2)
    return with_legacy_id(line)


@router.put("/{line_id}")
async def update_line(order_id: str, line_id: str, payload: LineUpdate, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    existing = sb.table("order_lines").select("*").eq("id", line_id).eq("order_id", order_id).execute().data
    if not existing:
        raise HTTPException(status_code=404, detail="Order line not found")
    existing = existing[0]

    order_qty = payload.order_qty if payload.order_qty is not None else existing["order_qty"]
    confirm_qty = payload.confirm_qty if payload.confirm_qty is not None else existing["confirm_qty"]
    cancelled_qty = payload.cancelled_qty if payload.cancelled_qty is not None else existing["cancelled_qty"]
    shipped_qty = payload.shipped_qty if payload.shipped_qty is not None else existing["shipped_qty"]
    _validate_quantities(order_qty, confirm_qty, cancelled_qty, shipped_qty)

    unit_price = payload.unit_selling_price if payload.unit_selling_price is not None else existing["unit_selling_price"]
    status = payload.status
    if status is None:
        if cancelled_qty >= order_qty:
            status = "Cancelled"
        elif shipped_qty >= confirm_qty and confirm_qty > 0:
            status = "Shipped"
        elif confirm_qty > 0:
            status = "Confirmed"
        else:
            status = existing.get("status") or "Pending"

    data = {
        "order_qty": order_qty, "confirm_qty": confirm_qty, "cancelled_qty": cancelled_qty,
        "shipped_qty": shipped_qty, "unit_selling_price": unit_price, "status": status,
    }
    sb.table("order_lines").update(data).eq("id", line_id).execute()
    row = sb.table("order_lines").select("*").eq("id", line_id).execute().data[0]
    log_action(sb, staff.get("id"), "order_line.update", "order_line", line_id, data)
    row["amount"] = round((row.get("confirm_qty") or 0) * (row.get("unit_selling_price") or 0), 2)
    return with_legacy_id(row)


@router.delete("/{line_id}")
async def delete_line(order_id: str, line_id: str, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    sb.table("order_lines").delete().eq("id", line_id).eq("order_id", order_id).execute()
    return {"ok": True}
