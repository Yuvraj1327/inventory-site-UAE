import jwt as pyjwt
from fastapi import Header, HTTPException, Depends
from typing import Optional

from app.core.config import settings
from app.core.supabase_client import get_service_client


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """
    Verifies a Supabase Auth access token (sent by the frontend after it
    signs in directly against Supabase Auth) and loads the matching
    `profiles` row (source of truth for role / customer_id).
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization[7:]

    if not settings.SUPABASE_JWT_SECRET:
        raise HTTPException(status_code=500, detail="Server auth is not configured (SUPABASE_JWT_SECRET missing)")

    try:
        payload = pyjwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    sb = get_service_client()
    res = sb.table("profiles").select("*").eq("id", user_id).limit(1).execute()
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=401, detail="Profile not found for this user")

    profile = rows[0]
    profile["access_token"] = token  # kept so downstream code can build a user-scoped client if needed
    return profile


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def require_staff_or_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in ("admin", "staff"):
        raise HTTPException(status_code=403, detail="Staff access required")
    return user


async def require_customer(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "customer":
        raise HTTPException(status_code=403, detail="Customer access required")
    return user
