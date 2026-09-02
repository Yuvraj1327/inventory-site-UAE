from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.core.security import require_staff_or_admin
from app.core.supabase_client import get_service_client
from app.services.compat import with_legacy_id, clean_list, now_iso
from app.services.audit import log_action
from app.services.whatsapp_provider import get_whatsapp_provider

router = APIRouter(prefix="/api/payments", tags=["payments"])


class PaymentCreate(BaseModel):
    party_type: str  # "customer" | "supplier"
    party_name: str
    invoice_id: Optional[str] = None
    purchase_id: Optional[str] = None
    amount: float
    method: str = "bank_transfer"
    reference: str = ""
    payment_date: Optional[str] = None
    notes: str = ""
    send_whatsapp: bool = False


async def _next_receipt_number(sb) -> str:
    res = sb.table("receipts").select("id", count="exact").execute()
    return f"RCPT-{(res.count or 0) + 1:05d}"


@router.get("")
async def list_payments(party_type: Optional[str] = None, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    q = sb.table("payments").select("*")
    if party_type:
        q = q.eq("party_type", party_type)
    rows = q.order("payment_date", desc=True).execute().data or []
    return clean_list(rows)


@router.post("")
async def record_payment(payload: PaymentCreate, staff=Depends(require_staff_or_admin)):
    """
    Records a payment, immediately reflected in the customer's SOA
    (which reads `accounting_transactions`) and outstanding balance,
    generates a receipt, and — if requested and a WhatsApp provider is
    configured — sends it to the customer.
    """
    if payload.party_type not in ("customer", "supplier"):
        raise HTTPException(status_code=400, detail="party_type must be 'customer' or 'supplier'")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be greater than 0")

    sb = get_service_client()
    table = "customers" if payload.party_type == "customer" else "suppliers"
    party = sb.table(table).select("id, name, email, whatsapp, phone").ilike("name", payload.party_name.strip()).limit(1).execute().data
    if not party:
        raise HTTPException(status_code=400, detail=f"No {payload.party_type} named '{payload.party_name}' found")
    party = party[0]
    date = (payload.payment_date or now_iso())[:10]

    payment_row = {
        "party_type": payload.party_type,
        "customer_id": party["id"] if payload.party_type == "customer" else None,
        "supplier_id": party["id"] if payload.party_type == "supplier" else None,
        "invoice_id": payload.invoice_id, "purchase_id": payload.purchase_id,
        "amount": payload.amount, "method": payload.method, "reference": payload.reference,
        "payment_date": date, "notes": payload.notes, "created_by": staff.get("id"), "created_at": now_iso(),
    }
    payment = sb.table("payments").insert(payment_row).execute().data[0]

    # Mirror into accounting_transactions so the existing SOA view
    # (app/routers/parties.py:statement_of_account, already used by both
    # admin and the customer portal) picks this up without changes.
    kind = "payment_in" if payload.party_type == "customer" else "payment_out"
    sb.table("accounting_transactions").insert({
        "type": "income" if kind == "payment_in" else "expense", "kind": kind,
        "category": f"Payment {'from' if kind == 'payment_in' else 'to'} {payload.party_type}",
        "amount": payload.amount, "party": party["name"],
        "customer_id": payment_row["customer_id"], "supplier_id": payment_row["supplier_id"],
        "reference_type": "payment", "reference_id": payment["id"], "description": payload.notes,
        "txn_date": date, "created_by": staff.get("id"), "created_at": now_iso(),
    }).execute()

    if payload.invoice_id:
        invoice = sb.table("invoices").select("*").eq("id", payload.invoice_id).execute().data
        if invoice:
            paid_total = sum(p["amount"] for p in sb.table("payments").select("amount").eq("invoice_id", payload.invoice_id).execute().data or [])
            new_status = "paid" if paid_total >= (invoice[0].get("total") or 0) - 0.01 else "partial"
            sb.table("invoices").update({"status": new_status}).eq("id", payload.invoice_id).execute()

    receipt_number = await _next_receipt_number(sb)
    receipt = sb.table("receipts").insert({
        "payment_id": payment["id"], "receipt_number": receipt_number,
        "whatsapp_status": "not_applicable", "created_at": now_iso(),
    }).execute().data[0]

    whatsapp_result = None
    if payload.send_whatsapp and payload.party_type == "customer":
        provider = get_whatsapp_provider()
        to_number = party.get("whatsapp") or party.get("phone") or ""
        result = await provider.send_receipt(to_number=to_number, customer_name=party["name"], receipt_number=receipt_number, amount=payload.amount)
        sb.table("receipts").update({
            "whatsapp_status": result.status, "whatsapp_message_id": result.message_id,
            "whatsapp_error": result.error, "whatsapp_sent_at": now_iso() if result.status == "sent" else None,
        }).eq("id", receipt["id"]).execute()
        receipt = sb.table("receipts").select("*").eq("id", receipt["id"]).execute().data[0]
        whatsapp_result = result.to_dict()

    log_action(sb, staff.get("id"), "payment.record", "payment", payment["id"], {
        "party_type": payload.party_type, "party": party["name"], "amount": payload.amount, "receipt_number": receipt_number,
    })

    return {"payment": with_legacy_id(payment), "receipt": with_legacy_id(receipt), "whatsapp": whatsapp_result}


@router.get("/receipts")
async def list_receipts(staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    rows = sb.table("receipts").select("*").order("created_at", desc=True).execute().data or []
    return clean_list(rows)


@router.post("/receipts/{receipt_id}/resend-whatsapp")
async def resend_whatsapp_receipt(receipt_id: str, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    receipt = sb.table("receipts").select("*").eq("id", receipt_id).execute().data
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    receipt = receipt[0]
    payment = sb.table("payments").select("*").eq("id", receipt["payment_id"]).execute().data
    if not payment or payment[0]["party_type"] != "customer":
        raise HTTPException(status_code=400, detail="This receipt is not linked to a customer payment")
    payment = payment[0]
    customer = sb.table("customers").select("name, whatsapp, phone").eq("id", payment["customer_id"]).execute().data
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    customer = customer[0]

    provider = get_whatsapp_provider()
    result = await provider.send_receipt(
        to_number=customer.get("whatsapp") or customer.get("phone") or "", customer_name=customer["name"],
        receipt_number=receipt["receipt_number"], amount=payment["amount"],
    )
    sb.table("receipts").update({
        "whatsapp_status": result.status, "whatsapp_message_id": result.message_id,
        "whatsapp_error": result.error, "whatsapp_sent_at": now_iso() if result.status == "sent" else None,
    }).eq("id", receipt_id).execute()
    log_action(sb, staff.get("id"), "payment.whatsapp_resend", "receipt", receipt_id, {"status": result.status})
    return result.to_dict()
