import csv
import io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import List, Optional
from openpyxl import load_workbook

from app.core.security import require_staff_or_admin
from app.core.supabase_client import get_service_client
from app.services.compat import with_legacy_id, clean_list, now_iso, find_party_id_by_name

router = APIRouter(prefix="/api/purchases", tags=["purchases"])


class PurchaseItem(BaseModel):
    name: str = ""
    sku: str = ""
    qty: float = 0.0
    unit_cost: float = 0.0


class PurchaseCreate(BaseModel):
    supplier: str = ""
    ref: str = ""
    date: Optional[str] = None
    items: List[PurchaseItem] = []
    notes: str = ""


def _to_legacy(purchase: dict, lines: list[dict]) -> dict:
    row = with_legacy_id(purchase)
    row["items"] = [
        {"name": li.get("description", ""), "sku": li.get("part_number", ""),
         "qty": li.get("qty", 0), "unit_cost": li.get("unit_cost", 0)}
        for li in lines
    ]
    return row


async def _adjust_stock(sb, name: str, sku: str, qty: float):
    """Mirrors the old Mongo `_adjust_stock`: find product by sku (else name), bump inventory, create if missing."""
    prod = None
    if sku:
        r = sb.table("products").select("id").eq("part_number", sku).limit(1).execute()
        prod = r.data[0] if r.data else None
    if not prod and name:
        r = sb.table("products").select("id").eq("description", name).limit(1).execute()
        prod = r.data[0] if r.data else None

    if prod:
        pid = prod["id"]
        inv = sb.table("inventory").select("*").eq("product_id", pid).execute().data
        if inv:
            new_qty = (inv[0].get("available_qty", 0) or 0) + qty
            sb.table("inventory").update({"available_qty": max(new_qty, 0), "updated_at": now_iso()}).eq("product_id", pid).execute()
        else:
            sb.table("inventory").insert({"product_id": pid, "available_qty": max(qty, 0)}).execute()
    else:
        ins = sb.table("products").insert({
            "description": name or sku, "part_number": sku, "unit_cost": 0.0,
            "default_selling_price": 0.0, "low_stock_threshold": 5.0, "created_at": now_iso(),
        }).execute()
        pid = ins.data[0]["id"]
        sb.table("inventory").insert({"product_id": pid, "available_qty": max(qty, 0)}).execute()
    return pid


@router.get("")
async def list_purchases(supplier: Optional[str] = None, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    q = sb.table("purchases").select("*")
    if supplier:
        q = q.eq("supplier", supplier)
    purchases = q.order("purchase_date", desc=True).execute().data or []
    if not purchases:
        return []
    ids = [p["id"] for p in purchases]
    lines = sb.table("purchase_lines").select("*").in_("purchase_id", ids).execute().data or []
    lines_by_pid = {}
    for li in lines:
        lines_by_pid.setdefault(li["purchase_id"], []).append(li)
    return [_to_legacy(p, lines_by_pid.get(p["id"], [])) for p in purchases]


@router.post("")
async def create_purchase(payload: PurchaseCreate, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    supplier_id = await find_party_id_by_name(sb, "suppliers", payload.supplier)
    total = sum(i.qty * i.unit_cost for i in payload.items)
    header = {
        "supplier": payload.supplier, "supplier_id": supplier_id,
        "purchase_ref": payload.ref, "purchase_date": (payload.date or now_iso())[:10],
        "total": total, "notes": payload.notes, "status": "received",
        "created_at": now_iso(),
    }
    res = sb.table("purchases").insert(header).execute()
    purchase = res.data[0]

    line_rows = []
    for it in payload.items:
        pid = await _adjust_stock(sb, it.name, it.sku, it.qty)
        if it.unit_cost:
            sb.table("products").update({"unit_cost": it.unit_cost}).eq("id", pid).execute()
        line_rows.append({
            "purchase_id": purchase["id"], "product_id": pid,
            "part_number": it.sku, "description": it.name,
            "qty": it.qty, "unit_cost": it.unit_cost,
        })
        sb.table("inventory_movements").insert({
            "product_id": pid, "movement_type": "purchase_in", "quantity": it.qty,
            "unit_cost": it.unit_cost, "reference_type": "purchase", "reference_id": purchase["id"],
        }).execute()
    if line_rows:
        sb.table("purchase_lines").insert(line_rows).execute()

    lines = sb.table("purchase_lines").select("*").eq("purchase_id", purchase["id"]).execute().data or []
    return _to_legacy(purchase, lines)


@router.delete("/{pid}")
async def delete_purchase(pid: str, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    lines = sb.table("purchase_lines").select("*").eq("purchase_id", pid).execute().data or []
    for li in lines:
        if li.get("product_id"):
            await _adjust_stock(sb, li.get("description", ""), li.get("part_number", ""), -(li.get("qty", 0) or 0))
    sb.table("purchase_lines").delete().eq("purchase_id", pid).execute()
    sb.table("purchases").delete().eq("id", pid).execute()
    return {"ok": True}


@router.post("/upload")
async def upload_purchases(file: UploadFile = File(...), supplier: str = Form(""), staff=Depends(require_staff_or_admin)):
    content = await file.read()
    fname = (file.filename or "").lower()
    rows = []
    if fname.endswith(".csv"):
        reader = csv.DictReader(io.StringIO(content.decode("utf-8", errors="ignore")))
        for r in reader:
            rows.append({(k or "").strip().lower(): v for k, v in r.items()})
    else:
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        data = list(ws.iter_rows(values_only=True))
        headers = [str(h).strip().lower() if h else "" for h in data[0]]
        for r in data[1:]:
            if not any(r):
                continue
            rows.append({headers[i]: r[i] for i in range(len(headers)) if headers[i]})

    def g(row, *keys):
        for k in keys:
            if k in row and row[k] not in (None, ""):
                return row[k]
        return ""

    def fnum(v):
        try:
            return float(str(v).replace(",", "").strip() or 0)
        except Exception:
            return 0.0

    items = []
    for r in rows:
        name = str(g(r, "description", "name", "product", "item") or "").strip()
        sku = str(g(r, "part number", "part no", "part no.", "sku", "code") or "").strip()
        if not name and not sku:
            continue
        items.append(PurchaseItem(
            name=name or sku, sku=sku,
            qty=fnum(g(r, "confirmed qty", "confirmed quantity", "qty", "quantity")),
            unit_cost=fnum(g(r, "price", "unit_cost", "cost")),
        ))
    if not items:
        raise HTTPException(status_code=400, detail="No valid rows found. Expected columns: Part Number, Description, Confirmed Qty, Price, Total")
    result = await create_purchase(
        PurchaseCreate(supplier=supplier, ref=f"UPLOAD-{file.filename}", items=items), staff
    )
    return {"created": True, "items": len(items), "purchase": result}


class ReorderItem(BaseModel):
    product_id: str
    qty: float = 0.0


class ReorderReq(BaseModel):
    supplier: str = ""
    items: List[ReorderItem] = []


@router.post("/reorder")
async def reorder(payload: ReorderReq, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    items = []
    for r in payload.items:
        if r.qty <= 0:
            continue
        prod = sb.table("products").select("*").eq("id", r.product_id).execute().data
        if not prod:
            continue
        p = prod[0]
        items.append(PurchaseItem(name=p.get("description", ""), sku=p.get("part_number", ""), qty=r.qty, unit_cost=p.get("unit_cost", 0)))
    if not items:
        raise HTTPException(status_code=400, detail="No items to reorder")
    return await create_purchase(PurchaseCreate(supplier=payload.supplier, ref="REORDER", items=items), staff)


@router.post("/scan")
async def scan_purchase(file: UploadFile = File(...), staff=Depends(require_staff_or_admin)):
    # AI invoice extraction is implemented in Phase 4. The old Emergent LLM
    # integration was removed in Phase 1 and not yet replaced.
    raise HTTPException(status_code=503, detail="AI purchase-invoice scanning lands in Phase 4.")
