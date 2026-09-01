import logging
from fastapi import Header, HTTPException, Depends
from typing import Optional

from app.core.config import settings
from app.core.supabase_client import get_service_client, get_user_client

logger = logging.getLogger(__name__)


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """
    Verifies a Supabase Auth access token (sent by the frontend after it
    signs in directly against Supabase Auth) and loads the matching
    `profiles` row (source of truth for role / customer_id).

    Verification is delegated to Supabase itself (`auth.get_user`) rather
    than decoded locally. This is deliberate: Supabase projects created
    from mid-2024 onward can use asymmetric (RS256/ECC) JWT signing keys
    instead of the legacy shared HS256 secret, so a local `jwt.decode()`
    against SUPABASE_JWT_SECRET silently fails on those projects even
    though the token is perfectly valid — which is exactly the
    "login succeeds, /api/auth/me still 401s" symptom. Asking Supabase's
    own auth server to validate the token works for both project types
    and needs no local secret/algorithm guessing.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        raise HTTPException(status_code=500, detail="Server auth is not configured (SUPABASE_URL/SUPABASE_ANON_KEY missing)")

    try:
        anon_client = get_user_client(token)  # anon key + caller's token
        user_res = anon_client.auth.get_user(token)
    except Exception as e:
        logger.warning("Supabase token verification failed: %s", e)
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    supa_user = getattr(user_res, "user", None)
    if not supa_user or not getattr(supa_user, "id", None):
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    user_id = supa_user.id

    try:
        sb = get_service_client()
        res = sb.table("profiles").select("*").eq("id", user_id).limit(1).execute()
        rows = res.data or []
    except Exception as e:
        # A Postgrest/service-role failure here (bad SUPABASE_SERVICE_ROLE_KEY,
        # migrations not applied yet so `profiles` doesn't exist, network
        # issue reaching the DB, etc.) used to propagate as an unhandled
        # exception -> FastAPI's default 500 handler -> a plain-text body
        # with no `detail` field -> the frontend showing a generic
        # "Something went wrong" with no way to tell why. Surface the real
        # reason server-side and return clean JSON instead.
        logger.error("Profile lookup failed for user %s: %s", user_id, e)
        raise HTTPException(
            status_code=500,
            detail=f"Could not read public.profiles ({e.__class__.__name__}). "
                    "Check SUPABASE_SERVICE_ROLE_KEY and that migrations 0001-0003 have been applied.",
        )

    if not rows:
        # The auth.users -> profiles trigger (see 0001_init_schema.sql) should
        # have created this row automatically on signup. If it's missing,
        # that trigger didn't run (e.g. the user was created before the
        # migration was applied) — surface a clear error instead of
        # silently granting/denying access.
        logger.error("No profiles row for authenticated Supabase user %s (%s)", user_id, supa_user.email)
        raise HTTPException(
            status_code=401,
            detail="No profile record for this account. Ask an admin to check public.profiles / the on-signup trigger.",
        )

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
