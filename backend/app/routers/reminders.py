from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.security import require_staff_or_admin
from app.core.supabase_client import get_service_client

router = APIRouter(prefix="/api/reminders", tags=["reminders"])


@router.get("")
async def reminders(staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    orders = sb.table("orders").select("*").execute().data or []
    agg = {}
    for o in orders:
        cust = (o.get("customer") or "").strip()
        if not cust:
            continue
        bal = (o.get("sale_amount", 0) or 0) - (o.get("received_amount", 0) or 0)
        e = agg.setdefault(cust, {"customer": cust, "outstanding": 0.0, "orders": 0, "last_date": ""})
        e["outstanding"] += bal
        e["orders"] += 1
        d = o.get("order_date", "") or ""
        if d > e["last_date"]:
            e["last_date"] = d
    result = [v for v in agg.values() if v["outstanding"] > 0.009]
    result.sort(key=lambda x: -x["outstanding"])
    for r in result:
        r["outstanding"] = round(r["outstanding"], 2)
    return result


class DraftReq(BaseModel):
    customer: str
    outstanding: float
    tone: str = "friendly"


@router.post("/draft")
async def draft_reminder(payload: DraftReq, staff=Depends(require_staff_or_admin)):
    raise HTTPException(status_code=503, detail="AI reminder drafting is not configured in this environment.")
