from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
import io

from app.core.security import require_staff_or_admin
from app.core.supabase_client import get_service_client
from app.services import product_import

router = APIRouter(prefix="/api/products/import", tags=["product-import"])


@router.post("/preview")
async def preview_import(file: UploadFile = File(...), staff=Depends(require_staff_or_admin)):
    """
    Step 1 — upload + validate. Streams the file once, never writes to the
    database, and returns a bounded preview plus validation counts so the
    admin can review before anything is committed.
    """
    import_id = await product_import.save_import_file(file)
    return product_import.validate_import(import_id)


@router.post("/{import_id}/confirm")
async def confirm_import(import_id: str, staff=Depends(require_staff_or_admin)):
    """
    Step 2 — the admin has reviewed the preview and chosen to proceed.
    Re-streams the same uploaded file and performs the actual batched
    upsert into products + inventory. Invalid rows are skipped, not
    fatal to the rest of the import.
    """
    sb = get_service_client()
    return product_import.run_import(sb, import_id)


@router.get("/{import_id}/errors.csv")
async def download_error_report(import_id: str, staff=Depends(require_staff_or_admin)):
    content = product_import.read_errors_csv(import_id)
    return StreamingResponse(
        io.BytesIO(content),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="import_errors_{import_id[:8]}.csv"'},
    )
