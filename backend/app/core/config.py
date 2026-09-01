import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(ROOT_DIR / ".env")


class Settings:
    SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
    SUPABASE_ANON_KEY: str = os.environ.get("SUPABASE_ANON_KEY", "")
    # Server-side only. Never send this to the frontend / never log it.
    SUPABASE_SERVICE_ROLE_KEY: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    # Used to verify Supabase-issued access tokens locally (HS256).
    SUPABASE_JWT_SECRET: str = os.environ.get("SUPABASE_JWT_SECRET", "")
    CORS_ORIGINS: str = os.environ.get("CORS_ORIGINS", "*")
    OPENAI_API_KEY: str = os.environ.get("OPENAI_API_KEY", "")  # optional, for later AI phases

    def is_supabase_configured(self) -> bool:
        return bool(self.SUPABASE_URL and self.SUPABASE_SERVICE_ROLE_KEY and self.SUPABASE_JWT_SECRET)


settings = Settings()
