from fastapi import APIRouter, Depends, HTTPException

from app.core.security import require_customer
from app.core.supabase_client import get_user_client, get_service_client
from app.services.compat import clean_list

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
