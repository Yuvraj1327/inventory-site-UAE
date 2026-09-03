"""
AI endpoints: Chat Assistant and Receipt Scanner.

Both routes are powered by Gemini when GEMINI_API_KEY is set in backend/.env.
When the key is absent, a safe "not configured" response is returned — no 503,
no fabricated data.

Routes
------
GET  /api/chat/diagnostics        — Provider configuration info (no key values exposed)
GET  /api/chat/{session_id}       — Chat history for a session
POST /api/chat                    — Send a message; returns SSE stream
POST /api/scan-receipt            — Upload image; returns structured extraction JSON
"""
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import require_staff_or_admin
from app.services.ai_provider import get_extraction_provider
from app.services.chat_provider import get_chat_provider, GEMINI_CHAT_MODEL
from app.services.ai_provider import GEMINI_EXTRACTION_MODEL

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["ai"])

# ---------------------------------------------------------------------------
# In-memory chat history store (per session_id).
# Format: {session_id: [{"role": "user"|"model", "parts": ["text"]}]}
# This is process-local; restarting the server clears history.
# ---------------------------------------------------------------------------
_chat_history: dict[str, list[dict]] = {}

# Max turns to keep in context (each turn = 1 user + 1 model message)
_MAX_HISTORY_TURNS = 20


# ---------------------------------------------------------------------------
# Diagnostics — no key values ever returned
# ---------------------------------------------------------------------------
@router.get("/chat/diagnostics")
async def chat_diagnostics(staff=Depends(require_staff_or_admin)):
    """
    Returns Gemini configuration status. Never exposes the actual API key value.
    Useful for confirming the provider is wired correctly after deployment.
    """
    gemini_configured = bool(settings.GEMINI_API_KEY)
    chat_provider = get_chat_provider()
    extraction_provider = get_extraction_provider()
    return {
        "gemini_configured": gemini_configured,
        "chat_provider_class": chat_provider.name(),
        "extraction_provider_class": extraction_provider.name(),
        "gemini_chat_model": GEMINI_CHAT_MODEL if gemini_configured else None,
        "gemini_extraction_model": GEMINI_EXTRACTION_MODEL if gemini_configured else None,
        "openai_configured": bool(settings.OPENAI_API_KEY),
    }


# ---------------------------------------------------------------------------
# Chat history
# ---------------------------------------------------------------------------
@router.get("/chat/{session_id}")
async def chat_history(session_id: str, staff=Depends(require_staff_or_admin)):
    """
    Returns the in-memory conversation history for a session.
    Returns an empty list if Gemini is not configured or session is new.
    """
    history = _chat_history.get(session_id, [])
    # Convert internal format to API format for the frontend
    result = []
    for turn in history:
        role = turn.get("role", "user")
        parts = turn.get("parts", [""])
        api_role = "assistant" if role == "model" else "user"
        result.append({"role": api_role, "content": parts[0] if parts else ""})
    return result


# ---------------------------------------------------------------------------
# Chat — POST (streaming SSE)
# ---------------------------------------------------------------------------
class ChatRequest(BaseModel):
    session_id: str
    message: str
    context: Optional[str] = None  # optional additional context from caller


@router.post("/chat")
async def chat(payload: ChatRequest, staff=Depends(require_staff_or_admin)):
    """
    Sends a message to the AI Assistant and streams the response as SSE.

    When GEMINI_API_KEY is set, uses GeminiChatProvider (gemini-1.5-flash).
    When not set, returns a single-chunk NotConfigured message with 200.

    SSE format: data: {"delta": "text chunk"}\n\n
    Final event: data: {"done": true}\n\n
    """
    if not payload.message.strip():
        raise HTTPException(status_code=400, detail="message must not be empty")

    provider = get_chat_provider()
    gemini_configured = bool(settings.GEMINI_API_KEY)

    logger.info(
        "[/api/chat] provider=%s gemini_configured=%s session=%s",
        provider.name(),
        gemini_configured,
        payload.session_id,
    )

    # Load existing history for this session
    session_history = _chat_history.get(payload.session_id, [])

    async def event_stream():
        full_response = []

        try:
            stream = await provider.chat(
                session_id=payload.session_id,
                message=payload.message,
                history=session_history,
            )

            async for chunk in stream:
                if chunk:
                    full_response.append(chunk)
                    yield f"data: {json.dumps({'delta': chunk})}\n\n"

        except Exception as exc:
            logger.error("[/api/chat] Streaming error: %s: %s", type(exc).__name__, exc)
            err_msg = f"[Error: {type(exc).__name__}] Something went wrong. Please try again."
            full_response.append(err_msg)
            yield f"data: {json.dumps({'delta': err_msg})}\n\n"

        finally:
            # Persist this exchange to in-memory history
            assembled_reply = "".join(full_response)
            if assembled_reply:
                session_history.append({"role": "user", "parts": [payload.message]})
                session_history.append({"role": "model", "parts": [assembled_reply]})
                # Trim to max turns (each turn = 2 entries: user + model)
                max_entries = _MAX_HISTORY_TURNS * 2
                if len(session_history) > max_entries:
                    session_history[:] = session_history[-max_entries:]
                _chat_history[payload.session_id] = session_history

            yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-AI-Provider": provider.name(),
            "X-Gemini-Configured": str(gemini_configured).lower(),
        },
    )


# ---------------------------------------------------------------------------
# Receipt / Invoice Scanner
# ---------------------------------------------------------------------------
_ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
_MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/scan-receipt")
async def scan_receipt(file: UploadFile = File(...), staff=Depends(require_staff_or_admin)):
    """
    Accepts a receipt or invoice image and returns structured extraction data.

    When GEMINI_API_KEY is set, uses GeminiExtractionProvider (gemini-1.5-flash, multimodal).
    When not set, returns {ok: false, needs_manual_review: true, message: "..."}.

    Returns: ExtractionResult.to_dict() — never raises 503 when key is configured.
    """
    # Validate file type
    content_type = file.content_type or ""
    if content_type not in _ALLOWED_MIME:
        # Also accept by extension as a fallback
        fname = (file.filename or "").lower()
        if not any(fname.endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".webp")):
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type '{content_type}'. Upload a JPEG, PNG, or WEBP image.",
            )

    file_bytes = await file.read()

    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(file_bytes) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10 MB.")

    provider = get_extraction_provider()
    gemini_configured = bool(settings.GEMINI_API_KEY)

    logger.info(
        "[/api/scan-receipt] provider=%s gemini_configured=%s filename=%s size=%d",
        provider.name(),
        gemini_configured,
        file.filename,
        len(file_bytes),
    )

    result = await provider.extract(file_bytes, file.filename or "receipt.jpg")

    logger.info(
        "[/api/scan-receipt] extraction ok=%s needs_review=%s vendor=%r",
        result.ok,
        result.needs_manual_review,
        result.vendor,
    )

    return result.to_dict()
