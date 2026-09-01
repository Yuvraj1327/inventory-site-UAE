"""
Two kinds of Supabase Postgrest clients:

- service client: uses the SERVICE_ROLE key, bypasses RLS entirely.
  Used for staff/admin operations after FastAPI has already checked the
  caller's role. NEVER exposed to the frontend.

- user client: uses the ANON key + the caller's own Supabase access
  token, so Postgres RLS applies exactly as it would for a direct
  client call. Used for customer-portal reads, as defense-in-depth on
  top of the FastAPI-side customer_id filtering.
"""
from functools import lru_cache
from supabase import create_client, Client
from app.core.config import settings


@lru_cache
def get_service_client() -> Client:
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured. "
            "Set them in backend/.env (see .env.example)."
        )
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


def get_user_client(access_token: str) -> Client:
    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        raise RuntimeError("SUPABASE_URL / SUPABASE_ANON_KEY are not configured.")
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    client.postgrest.auth(access_token)
    return client
