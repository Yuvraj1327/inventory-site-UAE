"""
Interim secure file storage for uploaded purchase invoices/documents.

Supabase Storage is the right home for these long-term (a `purchase-invoices`
bucket, per the Phase 2 architecture doc), but no bucket has been
provisioned yet — no Storage credentials/bucket name exist in this
environment. Rather than fake that integration, files are stored on
local disk under a non-web-served directory, validated by type/size, and
only ever served back out through an authenticated FastAPI endpoint
(never a public static path). Swapping this for real Supabase Storage
later is a small, isolated change (this module's two functions).
"""
import os
import uuid
from pathlib import Path
from fastapi import HTTPException, UploadFile

STORAGE_ROOT = Path(__file__).resolve().parent.parent.parent / "secure_uploads" / "purchase_invoices"
STORAGE_ROOT.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".xlsx", ".xls", ".csv"}
MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10MB


async def save_purchase_invoice(file: UploadFile) -> tuple[str, str]:
    """Validates and stores an uploaded invoice file. Returns (storage_path, original_filename)."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}")

    content = await file.read()
    if len(content) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=400, detail=f"File too large ({len(content)} bytes). Max {MAX_SIZE_BYTES // (1024*1024)}MB.")
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    safe_name = f"{uuid.uuid4()}{ext}"
    path = STORAGE_ROOT / safe_name
    path.write_bytes(content)
    return str(path), file.filename or safe_name


def read_purchase_invoice(storage_path: str) -> bytes:
    path = Path(storage_path)
    if not path.exists() or STORAGE_ROOT not in path.resolve().parents:
        raise HTTPException(status_code=404, detail="File not found")
    return path.read_bytes()
