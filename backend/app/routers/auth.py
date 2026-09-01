from fastapi import APIRouter, Depends
from app.core.security import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

# NOTE: there is no /api/auth/login here on purpose. Per the approved
# architecture, the frontend authenticates directly against Supabase
# Auth (frontend -> Supabase Auth -> FastAPI authorization) using the
# Supabase JS client + anon key. FastAPI's job is to verify the
# resulting access token (see app/core/security.py) and resolve the
# caller's role/customer_id from `profiles`.


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user
