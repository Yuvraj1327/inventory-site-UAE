from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from app.core.security import require_customer
from app.core.supabase_client import get_user_client, get_service_client
from app.services.compat import clean_list, with_legacy_id, now_iso, compute_order_line_totals
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
    rows = res.data or []
    totals = compute_order_line_totals(get_service_client(), [r["id"] for r in rows])
    for r in rows:
        if r["id"] in totals:
            r["selling_value"] = totals[r["id"]]
    return clean_list(rows)


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


@router.get("/trending-parts")
async def portal_trending_parts(user: dict = Depends(require_customer)):
    """Frequently ordered parts, derived from the customer's own order history."""
    sb = get_service_client()
    orders = sb.table("orders").select("id").eq("customer_id", user["customer_id"]).execute().data or []
    order_ids = [o["id"] for o in orders]
    if not order_ids:
        return []
    lines = sb.table("order_lines").select("order_id, part_number, description, order_qty").in_("order_id", order_ids).execute().data or []
    stats: dict[str, dict] = {}
    for li in lines:
        pn = li.get("part_number")
        if not pn:
            continue
        entry = stats.setdefault(pn, {"part_number": pn, "description": li.get("description") or "", "total_qty": 0.0, "order_ids": set()})
        entry["total_qty"] += li.get("order_qty") or 0
        entry["order_ids"].add(li["order_id"])
    out = [
        {"part_number": v["part_number"], "description": v["description"], "total_qty": v["total_qty"], "order_count": len(v["order_ids"])}
        for v in stats.values()
    ]
    out.sort(key=lambda x: (-x["order_count"], -x["total_qty"]))
    return out[:8]


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


PRODUCT_SELECT_COLUMNS = "id, part_number, description, brand, oem_reference, alternate_reference, model, unit_cost, default_selling_price"


def _customer_margin(sb, customer_id: str) -> float:
    customer = sb.table("customers").select("margin_percent").eq("id", customer_id).execute().data
    return (customer[0].get("margin_percent") if customer else 0) or 0


def _price_and_stock(sb, products: List[dict], margin: float) -> List[dict]:
    """Shared by /products and /products/bulk-match so both quote the exact same customer price and stock."""
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


def _escape_ilike(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("/products")
async def portal_products(q: Optional[str] = None, user: dict = Depends(require_customer)):
    """
    Customer-priced catalog: stock + the caller's own price only (never
    cost, never another customer's margin). Computed here rather than
    trusting a client-supplied price on order placement.
    """
    sb = get_service_client()
    margin = _customer_margin(sb, user["customer_id"])

    query = sb.table("products").select(PRODUCT_SELECT_COLUMNS)
    if q:
        query = query.or_(f"part_number.ilike.%{q}%,description.ilike.%{q}%,brand.ilike.%{q}%")
        sb.table("customer_activity_log").insert({
            "customer_id": user["customer_id"], "profile_id": user.get("id"), "activity_type": "part_search",
            "metadata": {"query": q}, "created_at": now_iso(),
        }).execute()
    products = query.limit(200).execute().data or []
    return _price_and_stock(sb, products, margin)


class BulkMatchRequest(BaseModel):
    part_numbers: List[str]


_BULK_MATCH_CHUNK_SIZE = 150


@router.post("/products/bulk-match")
async def portal_products_bulk_match(payload: BulkMatchRequest, user: dict = Depends(require_customer)):
    """
    Matches XLSX-uploaded part numbers against the catalog (case-insensitive,
    since imported part numbers aren't case-normalized) and prices them with
    the same customer margin/stock logic as GET /products. Chunked so 100+
    row uploads don't build a single oversized query.
    """
    seen_numbers = set()
    part_numbers = []
    for pn in payload.part_numbers:
        pn = (pn or "").strip()
        if pn and pn.lower() not in seen_numbers:
            seen_numbers.add(pn.lower())
            part_numbers.append(pn)
    if not part_numbers:
        return []

    sb = get_service_client()
    margin = _customer_margin(sb, user["customer_id"])

    # `,` and `"` break PostgREST's or_() filter DSL (comma separates
    # conditions, quotes delimit values) — those rare tokens are looked up
    # one at a time instead of joining the batched OR filter.
    batchable = [pn for pn in part_numbers if "," not in pn and '"' not in pn]
    singles = [pn for pn in part_numbers if "," in pn or '"' in pn]

    seen_ids = set()
    products: List[dict] = []

    def _collect(rows):
        for r in rows or []:
            if r["id"] not in seen_ids:
                seen_ids.add(r["id"])
                products.append(r)

    for i in range(0, len(batchable), _BULK_MATCH_CHUNK_SIZE):
        chunk = batchable[i:i + _BULK_MATCH_CHUNK_SIZE]
        or_filter = ",".join(f"part_number.ilike.{_escape_ilike(pn)}" for pn in chunk)
        _collect(sb.table("products").select(PRODUCT_SELECT_COLUMNS).or_(or_filter).execute().data)

    for pn in singles:
        _collect(sb.table("products").select(PRODUCT_SELECT_COLUMNS).ilike("part_number", pn).execute().data)

    return _price_and_stock(sb, products, margin)


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
