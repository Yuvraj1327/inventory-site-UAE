from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.core.config import settings
from app.core.security import require_staff_or_admin
from app.core.supabase_client import get_service_client
from app.services.compat import with_legacy_id, clean_list, now_iso
from app.services.audit import log_action
from app.services.supplier_provider import get_supplier_check_provider

router = APIRouter(prefix="/api/ai-agent", tags=["ai-agent"])


@router.get("/status")
async def status(staff=Depends(require_staff_or_admin)):
    """Plain, honest configuration status — never implies a real integration is live when it isn't."""
    configured = settings.SUPPLIER_MOCK_PROVIDER
    return {
        "provider_configured": configured,
        "provider_kind": "mock_test" if configured else "not_configured",
        "message": (
            "SUPPLIER_MOCK_PROVIDER is enabled — automated checks return clearly-labeled test data only."
            if configured else
            "No automated supplier-check provider is configured. Record checks manually, or set up a real, "
            "authorized provider in app/services/supplier_provider.py."
        ),
    }


def _estimate_pricing(sb, lost_sale_id: Optional[str], supplier_price: Optional[float]):
    """Selling price / margin estimate — only computed when a customer context (via the linked lost sale) exists."""
    if not lost_sale_id or supplier_price is None:
        return None, None, None
    ls = sb.table("lost_sales").select("customer_id").eq("id", lost_sale_id).execute().data
    if not ls or not ls[0].get("customer_id"):
        return None, None, None
    cust = sb.table("customers").select("margin_percent").eq("id", ls[0]["customer_id"]).execute().data
    margin = (cust[0].get("margin_percent") if cust else 0) or 0
    if not margin:
        return None, None, None
    selling_price = round(supplier_price * (1 + margin / 100.0), 2)
    gross_profit_per_unit = round(selling_price - supplier_price, 2)
    return selling_price, margin, gross_profit_per_unit


class OpportunityCreate(BaseModel):
    supplier_id: str
    part_number: str
    price_check_id: Optional[str] = None
    lost_sale_id: Optional[str] = None
    requested_qty: Optional[float] = None
    available_qty: Optional[float] = None
    supplier_price: Optional[float] = None
    eta: str = ""
    source: str = "manual"


@router.get("/opportunities")
async def list_opportunities(status_filter: Optional[str] = None, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    q = sb.table("supplier_opportunities").select("*")
    if status_filter:
        q = q.eq("status", status_filter)
    rows = q.order("created_at", desc=True).execute().data or []
    sup_ids = {r["supplier_id"] for r in rows}
    sups = {s["id"]: s["name"] for s in (sb.table("suppliers").select("id,name").in_("id", list(sup_ids)).execute().data if sup_ids else [])}
    for r in rows:
        r["supplier"] = sups.get(r["supplier_id"], "")
    return clean_list(rows)


@router.post("/opportunities")
async def create_opportunity(payload: OpportunityCreate, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    supplier = sb.table("suppliers").select("id, name").eq("id", payload.supplier_id).execute().data
    if not supplier:
        raise HTTPException(status_code=400, detail="Unknown supplier")

    selling_price, margin, gp_per_unit = _estimate_pricing(sb, payload.lost_sale_id, payload.supplier_price)
    est_gp_total = round(gp_per_unit * (payload.requested_qty or payload.available_qty or 0), 2) if gp_per_unit is not None else None

    data = {
        "supplier_id": payload.supplier_id, "part_number": payload.part_number,
        "price_check_id": payload.price_check_id, "lost_sale_id": payload.lost_sale_id,
        "requested_qty": payload.requested_qty, "available_qty": payload.available_qty,
        "supplier_price": payload.supplier_price, "eta": payload.eta,
        "estimated_selling_price": selling_price, "estimated_margin_percent": margin,
        "estimated_gross_profit": est_gp_total, "status": "new", "source": payload.source,
        "created_at": now_iso(),
    }
    res = sb.table("supplier_opportunities").insert(data).execute()
    row = res.data[0]
    row["supplier"] = supplier[0]["name"]
    log_action(sb, staff.get("id"), "ai_agent.opportunity_created", "supplier_opportunity", row["id"], {
        "supplier": supplier[0]["name"], "part_number": payload.part_number, "source": payload.source,
    })
    return with_legacy_id(row)


@router.post("/tasks/{task_id}/run-check")
async def run_check(task_id: str, staff=Depends(require_staff_or_admin)):
    """
    Runs one check for a configured monitoring task through the current
    provider. With no provider configured (the default), this is a
    no-op that reports why — it never fabricates a result.
    """
    sb = get_service_client()
    task = sb.table("supplier_monitoring_tasks").select("*").eq("id", task_id).execute().data
    if not task:
        raise HTTPException(status_code=404, detail="Monitoring task not found")
    task = task[0]
    supplier = sb.table("suppliers").select("id, name").eq("id", task["supplier_id"]).execute().data
    if not supplier:
        raise HTTPException(status_code=400, detail="Unknown supplier")

    provider = get_supplier_check_provider()
    result = await provider.check(supplier[0]["name"], task["part_number"])

    sb.table("supplier_monitoring_tasks").update({"last_run_at": now_iso()}).eq("id", task_id).execute()
    log_action(sb, staff.get("id"), "ai_agent.check_run", "supplier_monitoring_task", task_id, {
        "ok": result.ok, "source": result.source,
    }, actor_type="ai_agent" if result.ok else "user")

    if not result.ok:
        return {"ok": False, "message": result.message, "source": result.source}

    product = sb.table("products").select("id").eq("part_number", task["part_number"]).limit(1).execute().data
    check_row = sb.table("supplier_price_checks").insert({
        "supplier_id": task["supplier_id"], "product_id": product[0]["id"] if product else None,
        "part_number": task["part_number"], "available_qty": result.available_qty, "price": result.price,
        "eta": result.eta, "source": result.source, "checked_by": staff.get("id"), "checked_at": now_iso(),
    }).execute().data[0]

    # If this part has open, unresolved demand, surface it as an alert —
    # the "immediately alert admin when a requested part becomes
    # available" behavior from the spec.
    open_demand = (
        sb.table("lost_sales").select("*").eq("part_number", task["part_number"])
        .order("created_at", desc=True).limit(1).execute().data
    )
    opportunity = None
    if open_demand and result.available_qty and result.available_qty > 0:
        ls = open_demand[0]
        selling_price, margin, gp_per_unit = _estimate_pricing(sb, ls["id"], result.price)
        est_gp_total = round(gp_per_unit * min(ls.get("lost_qty", 0) or 0, result.available_qty), 2) if gp_per_unit is not None else None
        opp = sb.table("supplier_opportunities").insert({
            "supplier_id": task["supplier_id"], "product_id": product[0]["id"] if product else None,
            "part_number": task["part_number"], "price_check_id": check_row["id"], "lost_sale_id": ls["id"],
            "requested_qty": ls.get("lost_qty"), "available_qty": result.available_qty, "supplier_price": result.price,
            "eta": result.eta, "estimated_selling_price": selling_price, "estimated_margin_percent": margin,
            "estimated_gross_profit": est_gp_total, "status": "new", "source": result.source, "created_at": now_iso(),
        }).execute().data[0]
        opportunity = with_legacy_id(opp)
        log_action(sb, staff.get("id"), "ai_agent.opportunity_alert", "supplier_opportunity", opp["id"], {
            "part_number": task["part_number"], "matched_lost_sale": ls["id"],
        }, actor_type="ai_agent")

    return {"ok": True, "source": result.source, "check": with_legacy_id(check_row), "opportunity": opportunity}


class ApproveReq(BaseModel):
    supplier_invoice_number: str
    purchase_date: Optional[str] = None
    unit_cost: Optional[float] = None  # defaults to the opportunity's recorded supplier_price
    qty: Optional[float] = None        # defaults to available_qty (capped) or requested_qty


@router.post("/opportunities/{oid}/approve")
async def approve_opportunity(oid: str, payload: ApproveReq, staff=Depends(require_staff_or_admin)):
    """
    The ONLY path from an opportunity to an actual purchase. Requires an
    admin to explicitly supply a real supplier invoice number — the
    agent never creates a purchase on its own.
    """
    sb = get_service_client()
    opp = sb.table("supplier_opportunities").select("*").eq("id", oid).execute().data
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    opp = opp[0]
    if opp["status"] != "new":
        raise HTTPException(status_code=400, detail=f"This opportunity is already {opp['status']}")

    qty = payload.qty or min(opp.get("requested_qty") or 0, opp.get("available_qty") or 0) or opp.get("available_qty") or 0
    unit_cost = payload.unit_cost if payload.unit_cost is not None else (opp.get("supplier_price") or 0)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be greater than 0")

    from app.routers.purchases import confirm_purchase, PurchaseConfirmReq, ConfirmItem
    purchase = await confirm_purchase(
        PurchaseConfirmReq(
            supplier_id=opp["supplier_id"], supplier_invoice_number=payload.supplier_invoice_number,
            purchase_date=payload.purchase_date, notes=f"Approved from AI opportunity {oid}",
            items=[ConfirmItem(part_number=opp["part_number"], qty=qty, unit_cost=unit_cost)],
        ),
        staff=staff,
    )

    sb.table("supplier_opportunities").update({
        "status": "approved", "decided_by": staff.get("id"), "decided_at": now_iso(),
        "resulting_purchase_id": purchase["_id"],
    }).eq("id", oid).execute()
    log_action(sb, staff.get("id"), "ai_agent.opportunity_approved", "supplier_opportunity", oid, {
        "resulting_purchase_id": purchase["_id"], "qty": qty, "unit_cost": unit_cost,
    })
    return {"opportunity_id": oid, "purchase": purchase}


class DecisionReq(BaseModel):
    note: str = ""


@router.post("/opportunities/{oid}/ignore")
async def ignore_opportunity(oid: str, payload: DecisionReq, staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    existing = sb.table("supplier_opportunities").select("id, status").eq("id", oid).execute().data
    if not existing:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    sb.table("supplier_opportunities").update({"status": "ignored", "decided_by": staff.get("id"), "decided_at": now_iso()}).eq("id", oid).execute()
    log_action(sb, staff.get("id"), "ai_agent.opportunity_ignored", "supplier_opportunity", oid, {"note": payload.note})
    return {"ok": True}


@router.post("/opportunities/{oid}/contact")
async def contact_for_opportunity(oid: str, payload: DecisionReq, staff=Depends(require_staff_or_admin)):
    """Marks that the customer was contacted about this opportunity. No outbound messaging is sent from here."""
    sb = get_service_client()
    existing = sb.table("supplier_opportunities").select("id, status").eq("id", oid).execute().data
    if not existing:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    sb.table("supplier_opportunities").update({"status": "contacted", "decided_by": staff.get("id"), "decided_at": now_iso()}).eq("id", oid).execute()
    log_action(sb, staff.get("id"), "ai_agent.opportunity_contacted", "supplier_opportunity", oid, {"note": payload.note})
    return {"ok": True}


@router.get("/audit")
async def agent_audit_log(staff=Depends(require_staff_or_admin)):
    sb = get_service_client()
    rows = sb.table("audit_logs").select("*").like("action", "ai_agent.%").order("created_at", desc=True).limit(200).execute().data or []
    return clean_list(rows)
