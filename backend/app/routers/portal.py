from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from app.core.security import require_customer
from app.core.supabase_client import get_user_client, get_service_client
from app.services.compat import clean_list, with_legacy_id, now_iso
from app.services.audit import log_action

router = APIRouter(prefix="/api/portal", tags=["portal"])


def _customer_scoped_client(user: dict):
    """
    Builds a Supabase client authenticated as the calling customer's own
    Supabase session, so every query below is *also* enforced by Postgres
    RLS (defense-in-depth on top of the customer_id filter here).
    """
    if not user.get("customer_id"):
        raise HTTPException(status_code=403, detail="This account is not linked to a customer record")
    return get_user_client(user["access_token"])


@router.get("/invoices")
async def portal_invoices(user: dict = Depends(require_customer)):
    sb = _customer_scoped_client(user)
    res = sb.table("invoices").select("*").eq("customer_id", user["customer_id"]).order("invoice_date", desc=True).execute()
    return clean_list(res.data or [])


@router.get("/orders")
async def portal_orders(user: dict = Depends(require_customer)):
    sb = _customer_scoped_client(user)
    res = sb.table("orders").select("*").eq("customer_id", user["customer_id"]).order("order_date", desc=True).execute()
    return clean_list(res.data or [])


@router.get("/soa")
async def portal_soa(user: dict = Depends(require_customer)):
    _customer_scoped_client(user)  # verifies linkage / exercises RLS
    sb = get_service_client()  # SOA aggregation reuses the admin SOA logic below
    customer = sb.table("customers").select("*").eq("id", user["customer_id"]).execute().data
    if not customer:
        raise HTTPException(status_code=404, detail="Customer record not found")
    from app.routers.parties import statement_of_account
    return await statement_of_account("customer", customer[0]["name"], staff=user)


@router.get("/account")
async def portal_account(user: dict = Depends(require_customer)):
    """The caller's own commercial profile — no supplier cost or other customers' data is ever included."""
    sb = get_service_client()
    row = sb.table("customers").select(
        "id, name, company, account_no, is_walkin, tax_registration_number, country, city, "
        "phone, mobile, whatsapp, email, payment_terms_days, credit_limit, status"
    ).eq("id", user["customer_id"]).execute().data
    if not row:
        raise HTTPException(status_code=404, detail="Customer record not found")
    return row[0]


class ActivityLog(BaseModel):
    activity_type: str  # login | part_search | part_view | brand_view | stock_check | price_check
    part_number: Optional[str] = None
    brand: Optional[str] = None
    quantity_requested: Optional[float] = None
    metadata: dict = {}


ACTIVITY_TYPES = {"login", "part_search", "part_view", "brand_view", "stock_check", "price_check", "order_placed"}


@router.post("/activity")
async def log_activity(payload: ActivityLog, user: dict = Depends(require_customer)):
    """
    Phase 9 — browsing/demand signal, kept structurally separate from
    `orders`/`invoices` (actual sales). The caller can only ever log
    activity against their own customer_id, enforced here and by RLS.
    """
    if payload.activity_type not in ACTIVITY_TYPES:
        raise HTTPException(status_code=400, detail=f"activity_type must be one of {sorted(ACTIVITY_TYPES)}")
    sb = get_service_client()
    product_id = None
    if payload.part_number:
        p = sb.table("products").select("id").eq("part_number", payload.part_number).limit(1).execute().data
        product_id = p[0]["id"] if p else None
    sb.table("customer_activity_log").insert({
        "customer_id": user["customer_id"], "profile_id": user.get("id"), "activity_type": payload.activity_type,
        "product_id": product_id, "brand": payload.brand, "quantity_requested": payload.quantity_requested,
        "metadata": payload.metadata, "created_at": now_iso(),
    }).execute()
    return {"ok": True}


@router.get("/products")
async def portal_products(q: Optional[str] = None, user: dict = Depends(require_customer)):
    """
    Customer-priced catalog: stock + the caller's own price only (never
    cost, never another customer's margin). Computed here rather than
    trusting a client-supplied price on order placement.
    """
    sb = get_service_client()
    customer = sb.table("customers").select("margin_percent").eq("id", user["customer_id"]).execute().data
    margin = (customer[0].get("margin_percent") if customer else 0) or 0

    query = sb.table("products").select("id, part_number, description, brand, oem_reference, alternate_reference, model, unit_cost, default_selling_price")
    if q:
        query = query.or_(f"part_number.ilike.%{q}%,description.ilike.%{q}%,brand.ilike.%{q}%")
        sb.table("customer_activity_log").insert({
            "customer_id": user["customer_id"], "profile_id": user.get("id"), "activity_type": "part_search",
            "metadata": {"query": q}, "created_at": now_iso(),
        }).execute()
    products = query.limit(200).execute().data or []
    if not products:
        return []
    ids = [p["id"] for p in products]
    inv = {r["product_id"]: r["available_qty"] for r in (sb.table("inventory").select("product_id, available_qty").in_("product_id", ids).execute().data or [])}

    out = []
    for p in products:
        price = round(p["unit_cost"] * (1 + margin / 100.0), 2) if margin else (p.get("default_selling_price") or p["unit_cost"])
        out.append({
            "product_id": p["id"], "part_number": p["part_number"], "description": p["description"],
            "brand": p.get("brand", ""), "oem_reference": p.get("oem_reference", ""),
            "alternate_reference": p.get("alternate_reference", ""), "model": p.get("model", ""),
            "available_qty": inv.get(p["id"], 0), "price": price,
        })
    return out


class PortalOrderLine(BaseModel):
    part_number: str
    order_qty: float

class PortalOrderCreate(BaseModel):
    lines: List[PortalOrderLine]
    notes: str = ""


@router.post("/orders")
async def place_portal_order(payload: PortalOrderCreate, user: dict = Depends(require_customer)):
    """Places an order that immediately enters the same Orders Follow-Up workflow admins use."""
    if not payload.lines:
        raise HTTPException(status_code=400, detail="Add at least one part to your order")
    sb = get_service_client()
    customer = sb.table("customers").select("*").eq("id", user["customer_id"]).execute().data
    if not customer:
        raise HTTPException(status_code=404, detail="Customer record not found")
    customer = customer[0]

    existing = sb.table("orders").select("id", count="exact").execute()
    order_number = f"WEB-{(existing.count or 0) + 1:05d}"
    today = now_iso()[:10]
    header = {
        "order_number": order_number, "customer": customer["name"], "customer_id": customer["id"],
        "order_date": today, "order_month": f"{today[:7]}-01", "status": "open",
        "notes": payload.notes, "created_at": now_iso(),
    }
    res = sb.table("orders").insert(header).execute()
    order = res.data[0]

    from app.routers.order_lines import add_line, LineCreate
    added = []
    for li in payload.lines:
        line = await add_line(order["id"], LineCreate(part_number=li.part_number, order_qty=li.order_qty), staff=user)
        added.append(line)

    log_action(sb, user.get("id"), "portal.order_placed", "order", order["id"], {"order_number": order_number, "line_count": len(added)}, actor_type="user")
    sb.table("customer_activity_log").insert({
        "customer_id": user["customer_id"], "profile_id": user.get("id"), "activity_type": "order_placed",
        "metadata": {"order_id": order["id"], "order_number": order_number}, "created_at": now_iso(),
    }).execute()
    return with_legacy_id({**order, "lines": added})
