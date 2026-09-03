import logging
import os
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
_ENV_PATH = ROOT_DIR / ".env"
# override=True: an .env file at the project root is meant to be the
# authoritative source for these settings. Without this, python-dotenv
# silently skips any variable that already exists in the process
# environment (e.g. a stale empty value from a shell export, a process
# manager, or a container's base environment) — the .env file's real
# value would never be picked up even though the file is correct, which
# is exactly the shape of bug this caused for GEMINI_API_KEY.
_env_loaded = load_dotenv(_ENV_PATH, override=True)
if not _env_loaded:
    logger.warning(".env not found at %s — all settings will fall back to defaults/empty.", _ENV_PATH)


class Settings:
    SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
    SUPABASE_ANON_KEY: str = os.environ.get("SUPABASE_ANON_KEY", "")
    # Server-side only. Never send this to the frontend / never log it.
    SUPABASE_SERVICE_ROLE_KEY: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    # Used to verify Supabase-issued access tokens locally (HS256).
    SUPABASE_JWT_SECRET: str = os.environ.get("SUPABASE_JWT_SECRET", "")
    CORS_ORIGINS: str = os.environ.get("CORS_ORIGINS", "*")
    OPENAI_API_KEY: str = os.environ.get("OPENAI_API_KEY", "")  # optional, for later AI phases
    # Google Gemini — powers the Receipt Scanner (image extraction) and the
    # AI Assistant (chat). Server-side only; never sent to the frontend.
    GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "")

    # Phase 8 — Supplier AI Agent. Off by default; when off, automated
    # checks report "not configured" rather than inventing data.
    SUPPLIER_MOCK_PROVIDER: bool = os.environ.get("SUPPLIER_MOCK_PROVIDER", "false").lower() == "true"

    # Phase 11 — WhatsApp Business API/provider. Empty = not configured.
    WHATSAPP_PROVIDER_API_KEY: str = os.environ.get("WHATSAPP_PROVIDER_API_KEY", "")
    WHATSAPP_PROVIDER_URL: str = os.environ.get("WHATSAPP_PROVIDER_URL", "")
    WHATSAPP_PROVIDER_FROM: str = os.environ.get("WHATSAPP_PROVIDER_FROM", "")

    def is_supabase_configured(self) -> bool:
        # SUPABASE_JWT_SECRET is optional now — token verification calls
        # Supabase's own auth server (see app/core/security.py) rather than
        # decoding locally, so it works regardless of HS256 vs RS256/ECC
        # signing keys. Kept in settings for any future local-decode fast path.
        return bool(self.SUPABASE_URL and self.SUPABASE_ANON_KEY and self.SUPABASE_SERVICE_ROLE_KEY)


settings = Settings()
