"""
Thin compatibility shim.

The real application now lives in `app/` (Supabase Postgres + Supabase
Auth, no MongoDB, no custom JWT — see Phase 2 report). This file exists
only so an existing `uvicorn server:app` command keeps working.

The previous MongoDB-based implementation has been moved to
`server_legacy_mongo.py.bak` for reference and is not imported or run
anywhere in the application.
"""
from app.main import app  # noqa: F401
