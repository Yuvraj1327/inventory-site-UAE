import logging
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.supabase_client import get_service_client
from app.routers import (
    auth, admin_users, parties, products, orders, purchases,
    invoices, transactions, dashboard, reminders, portal, ai_stub,
)

app = FastAPI(title="Ledgerly ERP API")

app.include_router(auth.router)
app.include_router(admin_users.router)
app.include_router(admin_users.staff_router)
app.include_router(parties.router)
app.include_router(products.router)
app.include_router(orders.router)
app.include_router(purchases.router)
app.include_router(invoices.router)
app.include_router(transactions.router)
app.include_router(dashboard.router)
app.include_router(reminders.router)
app.include_router(portal.router)
app.include_router(ai_stub.router)


@app.get("/api/")
async def root():
    return {"message": "Ledgerly ERP API", "database": "supabase-postgres"}


@app.get("/api/health/supabase")
async def health_supabase():
    """
    Unauthenticated, secret-free diagnostic: checks each piece of the
    Supabase connection independently so a config problem can be
    pinpointed without digging through terminal logs. Safe to leave
    enabled — it never returns keys, tokens, or row data.
    """
    out = {
        "supabase_url_set": bool(settings.SUPABASE_URL),
        "anon_key_set": bool(settings.SUPABASE_ANON_KEY),
        "service_role_key_set": bool(settings.SUPABASE_SERVICE_ROLE_KEY),
        "service_role_can_read_profiles": False,
        "profiles_table_exists": False,
        "admin_profile_found": False,
        "error": None,
    }
    try:
        sb = get_service_client()
        res = sb.table("profiles").select("id, email, role, customer_id", count="exact").limit(5).execute()
        out["profiles_table_exists"] = True
        out["service_role_can_read_profiles"] = True
        out["profiles_row_count"] = res.count
        admin_row = sb.table("profiles").select("id, email, role, customer_id").eq("email", "admin@ledgerly.com").execute()
        out["admin_profile_found"] = bool(admin_row.data)
        if admin_row.data:
            out["admin_profile_role"] = admin_row.data[0].get("role")
            out["admin_profile_customer_id"] = admin_row.data[0].get("customer_id")
    except Exception as e:
        out["error"] = f"{e.__class__.__name__}: {e}"
    return out


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    Safety net: without this, any exception that isn't an HTTPException
    (a bad Supabase key, a missing table, a network blip, etc.) falls
    through to Starlette's default handler, which returns a *plain-text*
    500 body. axios then has no `response.data.detail` to read, and the
    frontend shows a generic "Something went wrong" with zero clue why.
    This guarantees every error response is JSON with a `detail` field,
    while the real exception is still logged here for the terminal.
    """
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": f"{exc.__class__.__name__}: {exc}"})


@app.on_event("startup")
async def startup():
    if not settings.is_supabase_configured():
        logger.warning(
            "SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are not fully set. "
            "The API will boot but every endpoint that touches the database will fail until "
            "backend/.env is configured — see backend/.env.example. "
            "Visit /api/health/supabase once running to check each piece independently."
        )
    else:
        logger.info("Supabase configuration detected.")
