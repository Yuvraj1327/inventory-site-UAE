from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.core.security import require_staff_or_admin
from app.core.supabase_client import get_service_client
from app.services.compat import with_legacy_id, clean_list, make_lpo, next_account_no, now_iso

router = APIRouter(prefix="/api", tags=["parties"])


class PartyCreate(BaseModel):
    name: str
    kind: str  # "customer" | "supplier"
    email: str = ""
    phone: str = ""
    country: str = ""
    city: str = ""
    company: str = ""
    brand_focus: str = ""
    office_address: str = ""
    mobile: str = ""
    whatsapp: str = ""
    special_note: str = ""
    # ERP-spec additions, all optional so the existing Parties.jsx form
    # (which doesn't send these yet) keeps working; the form will be
    # extended to collect them in a later UI pass.
    is_walkin: bool = True
    tax_registration_number: Optional[str] = None
    margin_percent: float = 0.0
    payment_terms_days: int = 0


def _table_for(kind: str) -> str:
    if kind == "customer":
        return "customers"
    if kind == "supplier":
        return "suppliers"
    raise HTTPException(status_code=400, detail="kind must be 'customer' or 'supplier'")


@router.get("/parties")
async def list_parties(kind: Optional[str] = None, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    if kind:
        res = sb.table(_table_for(kind)).select("*").order("name").execute()
        return clean_list(res.data or [])
    customers = sb.table("customers").select("*").order("name").execute().data or []
    suppliers = sb.table("suppliers").select("*").order("name").execute().data or []
    return clean_list(customers + suppliers)


@router.post("/parties")
async def create_party(payload: PartyCreate, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    table = _table_for(payload.kind)
    data = payload.model_dump(exclude={"kind"})

    if payload.kind == "customer":
        if not data.get("is_walkin") and not data.get("tax_registration_number"):
            raise HTTPException(
                status_code=400,
                detail="A registered customer needs a Tax Registration Number, or mark them as Walk-in.",
            )
        data["account_no"] = await next_account_no(sb)
    else:
        # suppliers table has no lpo/is_walkin/tax_registration_number/margin_percent columns
        for k in ("is_walkin", "tax_registration_number", "margin_percent"):
            data.pop(k, None)

    data["created_at"] = now_iso()
    res = sb.table(table).insert(data).execute()
    row = res.data[0] if res.data else None

    if payload.kind == "customer" and row:
        row["lpo"] = make_lpo(payload.name, payload.mobile or payload.phone)  # cosmetic, matches old response shape; no lpo column on customers yet

    return with_legacy_id(row)


@router.delete("/parties/{pid}")
async def delete_party(pid: str, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    # try both tables; harmless no-op on whichever it isn't
    sb.table("customers").delete().eq("id", pid).execute()
    sb.table("suppliers").delete().eq("id", pid).execute()
    return {"ok": True}


@router.get("/soa/{kind}/{name}")
async def statement_of_account(kind: str, name: str, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    field = "customer" if kind == "customer" else "supplier"
    rows = []

    orders = sb.table("orders").select("*").eq(field, name).execute().data or []
    for o in orders:
        if kind == "customer":
            billed, paid = o.get("sale_amount", 0.0) or 0.0, o.get("received_amount", 0.0) or 0.0
        else:
            billed, paid = o.get("supplier_cost", 0.0) or 0.0, o.get("paid_to_supplier", 0.0) or 0.0
        rows.append({
            "ref": o.get("order_number", ""), "order_number": o.get("order_number", ""),
            "type": "Order", "date": o.get("order_date", ""), "billed": billed, "paid": paid,
            "balance": 0, "status": o.get("status", ""),
        })

    if kind == "customer":
        invoices = sb.table("invoices").select("*").eq("customer", name).execute().data or []
        for inv in invoices:
            total = inv.get("total", 0) or 0
            rows.append({
                "ref": inv.get("invoice_number", ""), "order_number": inv.get("invoice_number", ""),
                "type": "Invoice", "date": inv.get("invoice_date", ""), "billed": total,
                "paid": total if inv.get("status") == "paid" else 0, "balance": 0,
                "status": inv.get("status", ""),
            })

    pay_kind = "payment_in" if kind == "customer" else "payment_out"
    payments = (
        sb.table("accounting_transactions").select("*")
        .eq("kind", pay_kind).eq("party", name)
        .execute().data or []
    )
    for p in payments:
        rows.append({
            "ref": "Payment", "order_number": "Payment", "type": "Payment",
            "date": p.get("txn_date", ""), "billed": 0, "paid": p.get("amount", 0),
            "balance": 0, "status": "paid",
        })

    rows.sort(key=lambda r: r.get("date") or "")
    running = total_billed = total_paid = 0.0
    for r in rows:
        total_billed += r["billed"]
        total_paid += r["paid"]
        running += r["billed"] - r["paid"]
        r["balance"] = round(running, 2)

    return {
        "name": name, "kind": kind, "rows": rows,
        "total_billed": round(total_billed, 2), "total_paid": round(total_paid, 2),
        "balance": round(total_billed - total_paid, 2),
    }
