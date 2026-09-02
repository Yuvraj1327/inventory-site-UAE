"""
Lightweight in-memory rate limiting for sensitive endpoint prefixes
(auth/profile lookups, admin user provisioning, the customer portal).

Honest limitation: this is per-process, in-memory state — fine for a
single backend instance, but it resets on restart and does not
coordinate across multiple instances/workers. For a multi-instance
production deployment, put a real rate limiter in front (e.g. at the
reverse proxy / API gateway, or a shared Redis-backed limiter). This is
still meaningfully better than no rate limiting at all for a
single-instance deployment.
"""
import time
from collections import defaultdict
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

LIMITED_PREFIXES = ("/api/auth/", "/api/admin/", "/api/portal/")
WINDOW_SECONDS = 60
MAX_REQUESTS_PER_WINDOW = 120  # generous — this guards against abuse, not normal use


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._hits: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request, call_next):
        path = request.url.path
        if any(path.startswith(p) for p in LIMITED_PREFIXES):
            key = f"{request.client.host if request.client else 'unknown'}:{path.split('/')[2] if len(path.split('/')) > 2 else ''}"
            now = time.time()
            hits = self._hits[key]
            hits[:] = [t for t in hits if now - t < WINDOW_SECONDS]
            if len(hits) >= MAX_REQUESTS_PER_WINDOW:
                return JSONResponse(status_code=429, content={"detail": "Too many requests. Please slow down and try again shortly."})
            hits.append(now)
        return await call_next(request)
