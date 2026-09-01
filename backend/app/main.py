import logging
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.core.config import settings
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


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    if not settings.is_supabase_configured():
        logger.warning(
            "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_JWT_SECRET are not fully set. "
            "The API will boot but every endpoint that touches the database will fail until "
            "backend/.env is configured — see backend/.env.example."
        )
    else:
        logger.info("Supabase configuration detected.")
