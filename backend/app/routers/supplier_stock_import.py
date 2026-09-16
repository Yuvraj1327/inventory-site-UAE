from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
import io

from app.core.security import require_staff_or_admin
from app.core.supabase_client import get_service_client
from app.services import supplier_stock_import

router = APIRouter(prefix="/api/inventory/supplier-stock-import", tags=["supplier-stock-import"])


@router.post("/preview")
async def preview_supplier_stock(file: UploadFile = File(...), staff=Depends(require_staff_or_admin)):
    """
    Step 1 — upload + validate + match against the existing catalog.
    Writes nothing to the database. Returns matched/not-found/invalid
    counts and a bounded preview so the admin can review before applying.
    """
    sb = get_service_client()
    import_id = await supplier_stock_import.save_import_file(file)
    return supplier_stock_import.validate_import(sb, import_id)


@router.post("/{import_id}/confirm")
async def confirm_supplier_stock(import_id: str, staff=Depends(require_staff_or_admin)):
    """
    Step 2 — the admin has reviewed the preview and chosen to proceed.
    Updates Description/Weight/Available Stock/Cost Price only for
    products whose Part Number matched an ItemCode in the file. Never
    creates a new product.
    """
    sb = get_service_client()
    return supplier_stock_import.run_import(sb, import_id)


@router.get("/{import_id}/errors.csv")
async def download_error_report(import_id: str, staff=Depends(require_staff_or_admin)):
    content = supplier_stock_import.read_errors_csv(import_id)
    return StreamingResponse(
        io.BytesIO(content),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="supplier_stock_import_errors_{import_id[:8]}.csv"'},
    )
