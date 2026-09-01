from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.core.security import require_staff_or_admin
from app.core.supabase_client import get_service_client
from app.services.compat import with_legacy_id, clean_list, now_iso

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


class TransactionCreate(BaseModel):
    type: Optional[str] = None
    kind: str = "cash_expense"
    amount: float
    category: str = "Uncategorized"
    description: str = ""
    party: str = ""
    account_no: str = ""
    date: Optional[str] = None


def _derive_type_and_category(payload: "TransactionCreate") -> tuple[str, str]:
    """Mirrors the original Mongo logic: payment_in -> income, payment_out/cash_expense -> expense,
    with sensible default categories when none was supplied."""
    kind = payload.kind or "cash_expense"
    category = payload.category
    if kind == "payment_in":
        t = "income"
        if not category or category == "Uncategorized":
            category = "Payment from Customer"
    elif kind == "payment_out":
        t = "expense"
        if not category or category == "Uncategorized":
            category = "Payment to Supplier"
    elif kind == "cash_expense":
        t = "expense"
    else:
        t = payload.type or "expense"
    return t, category or "Uncategorized"


async def _next_receipt_no(sb) -> str:
    res = sb.table("accounting_transactions").select("id", count="exact").eq("kind", "payment_in").execute()
    seq = (res.count or 0) + 1
    return f"RCPT{seq:05d}"


@router.get("")
async def list_transactions(staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    res = sb.table("accounting_transactions").select("*").order("txn_date", desc=True).execute()
    return clean_list(res.data or [])


@router.post("")
async def create_transaction(payload: TransactionCreate, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    t, category = _derive_type_and_category(payload)
    data = {
        "type": t,
        "kind": payload.kind,
        "amount": payload.amount,
        "category": category,
        "description": payload.description,
        "party": payload.party,
        "account_no": payload.account_no,
        "txn_date": (payload.date or now_iso())[:10],
        "created_at": now_iso(),
    }
    if payload.kind == "payment_in":
        data["receipt_no"] = await _next_receipt_no(sb)
    res = sb.table("accounting_transactions").insert(data).execute()
    return with_legacy_id(res.data[0])


@router.put("/{tid}")
async def update_transaction(tid: str, payload: TransactionCreate, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    t, category = _derive_type_and_category(payload)
    data = {
        "type": t, "kind": payload.kind, "amount": payload.amount,
        "category": category, "description": payload.description, "party": payload.party,
        "account_no": payload.account_no,
    }
    sb.table("accounting_transactions").update(data).eq("id", tid).execute()
    row = sb.table("accounting_transactions").select("*").eq("id", tid).execute().data
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return with_legacy_id(row[0])


@router.delete("/{tid}")
async def delete_transaction(tid: str, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    sb.table("accounting_transactions").delete().eq("id", tid).execute()
    return {"ok": True}


@router.post("/categorize")
async def categorize_transaction(payload: dict, staff=Depends(require_staff_or_admin)):
    raise HTTPException(status_code=503, detail="AI categorization is not configured in this environment.")
