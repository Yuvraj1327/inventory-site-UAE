from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.core.security import require_staff_or_admin

router = APIRouter(prefix="/api", tags=["ai-stub"])

_MSG = (
    "AI features are disabled in this environment. The previous implementation depended on "
    "Emergent's proprietary `emergentintegrations` package and hosted LLM key, which were removed "
    "in Phase 1 (see recovery report) and are not part of the approved Supabase architecture. "
    "Wire a real provider (OpenAI/Anthropic/etc, key stored server-side only) to re-enable this."
)


@router.post("/scan-receipt")
async def scan_receipt(file: UploadFile = File(...), staff=Depends(require_staff_or_admin)):
    raise HTTPException(status_code=503, detail=_MSG)


@router.get("/chat/{session_id}")
async def chat_history(session_id: str, staff=Depends(require_staff_or_admin)):
    return []


@router.post("/chat")
async def chat(payload: dict, staff=Depends(require_staff_or_admin)):
    raise HTTPException(status_code=503, detail=_MSG)
