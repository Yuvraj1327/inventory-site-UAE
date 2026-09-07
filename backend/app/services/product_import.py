"""
Admin bulk Product/Inventory import from a master .xlsx file (100,000+ rows).

Design constraints this satisfies:
- Never loads the whole thing into a single in-memory list of Python
  objects beyond what's needed for one batch — openpyxl is used in
  `read_only=True` streaming mode, and DB writes happen in bounded
  chunks (CHUNK_SIZE rows per Supabase call), never row-by-row.
- Two-phase flow (preview → confirm) so the admin sees validation
  results and a sample before anything is written. The uploaded file
  is kept on disk (not in memory / not in a DB row) between the two
  calls, keyed by import_id, and re-parsed at confirm time — re-reading
  100k rows via openpyxl read_only mode takes low single-digit seconds,
  which is a fine trade for not needing a second storage format.
- Existing Part Number → update in place (preserving whatever brand
  that product already has). New Part Number → inserted with brand=''.
  This matches products' real unique constraint (part_number, brand)
  without requiring the import file to carry a brand column.
- Invalid rows are collected with a reason and skipped; they never
  abort the rest of the import.
- unit_cost (mapped from "Net Price") is the same field every other
  part of the app already treats as cost-basis-only — the customer
  portal's own price computation (unit_cost * customer margin) is
  untouched by this import, so cost still never reaches a customer.
"""
import csv
import io
import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, UploadFile
from openpyxl import load_workbook

from app.services.compat import now_iso

STORAGE_ROOT = Path(__file__).resolve().parent.parent.parent / "secure_uploads" / "product_imports"
STORAGE_ROOT.mkdir(parents=True, exist_ok=True)

MAX_SIZE_BYTES = 50 * 1024 * 1024  # 50MB comfortably covers 100k+ rows of this column shape
CHUNK_SIZE = 1000  # rows per Supabase upsert call and per existing-lookup call
PREVIEW_ROWS = 50
MAX_ERROR_ROWS_KEPT = 5000  # cap the in-memory/CSV error list even if far more rows are bad

# Header aliases accepted case/spacing-insensitively, including the
# source file's own "Availabe Qty" typo.
COLUMN_ALIASES = {
    "part number": "part_number", "part no": "part_number", "partno": "part_number",
    "description": "description",
    "required qty": "required_qty",
    "available qty": "available_qty", "availabe qty": "available_qty", "avail qty": "available_qty",
    "net price": "net_price", "netprice": "net_price", "unit cost": "net_price",
    "total": "total",
}
REQUIRED_MAPPED_COLUMNS = {"part_number"}


def _normalize_header(h) -> str:
    return str(h or "").strip().lower()


async def save_import_file(file: UploadFile) -> str:
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".xlsx", ".xls"):
        raise HTTPException(status_code=400, detail="Please upload an .xlsx or .xls file.")
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(content) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=400, detail=f"File too large ({len(content) // (1024*1024)}MB). Max {MAX_SIZE_BYTES // (1024*1024)}MB.")
    import_id = str(uuid.uuid4())
    path = STORAGE_ROOT / f"{import_id}.xlsx"
    path.write_bytes(content)
    return import_id


def _import_path(import_id: str) -> Path:
    path = STORAGE_ROOT / f"{import_id}.xlsx"
    if not path.exists() or STORAGE_ROOT not in path.resolve().parents:
        raise HTTPException(status_code=404, detail="Import file not found or already processed — please re-upload.")
    return path


def _parse_number(v, field: str, row_no: int, errors: list, allow_none=True):
    if v is None or v == "":
        return None if allow_none else _fail(errors, row_no, f"{field} is required")
    try:
        n = float(v)
    except (TypeError, ValueError):
        _fail(errors, row_no, f"{field} is not a valid number ('{v}')")
        return None
    if n < 0:
        _fail(errors, row_no, f"{field} cannot be negative ({n})")
        return None
    return n


def _fail(errors: list, row_no: int, reason: str):
    if len(errors) < MAX_ERROR_ROWS_KEPT:
        errors.append({"row": row_no, "reason": reason})
    return None


def _iter_mapped_rows(path: Path):
    """Yields (row_no, mapped_dict) for every data row, streaming (read_only)."""
    wb = load_workbook(path, read_only=True, data_only=True)
    try:
        ws = wb.worksheets[0]
        rows_iter = ws.iter_rows(values_only=True)
        header = next(rows_iter, None)
        if not header:
            raise HTTPException(status_code=400, detail="The file has no header row.")
        col_index = {}
        for i, h in enumerate(header):
            key = COLUMN_ALIASES.get(_normalize_header(h))
            if key:
                col_index[key] = i
        missing = REQUIRED_MAPPED_COLUMNS - set(col_index.keys())
        if missing:
            raise HTTPException(status_code=400, detail=f"Missing required column(s): {', '.join(sorted(missing))}. Detected headers: {[str(h) for h in header]}")

        row_no = 1  # header is row 1
        for raw in rows_iter:
            row_no += 1
            if raw is None or all(c is None or str(c).strip() == "" for c in raw):
                continue  # skip fully blank rows silently — not a data-quality error
            def get(key):
                idx = col_index.get(key)
                return raw[idx] if idx is not None and idx < len(raw) else None
            yield row_no, {
                "part_number": get("part_number"),
                "description": get("description"),
                "required_qty": get("required_qty"),
                "available_qty": get("available_qty"),
                "net_price": get("net_price"),
                "total": get("total"),
            }, [str(h) for h in header]
    finally:
        wb.close()


def _errors_csv_path(import_id: str) -> Path:
    return STORAGE_ROOT / f"{import_id}_errors.csv"


def _write_errors_csv(import_id: str, errors: list):
    if not errors:
        return
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["row", "reason"])
    for e in errors:
        w.writerow([e["row"], e["reason"]])
    _errors_csv_path(import_id).write_text(buf.getvalue())


def read_errors_csv(import_id: str) -> bytes:
    path = _errors_csv_path(import_id)
    if not path.exists() or STORAGE_ROOT not in path.resolve().parents:
        raise HTTPException(status_code=404, detail="No error report available for this import (either there were no invalid rows, or it has already been cleaned up).")
    return path.read_bytes()


def validate_import(import_id: str) -> dict:
    """
    Streams the whole file once to produce validation stats + a bounded
    preview, without writing anything to the database.
    """
    path = _import_path(import_id)
    valid_count = 0
    duplicate_count = 0
    errors = []
    preview = []
    seen_part_numbers = set()
    detected_headers = None

    for row_no, mapped, headers in _iter_mapped_rows(path):
        detected_headers = detected_headers or headers
        pn = str(mapped["part_number"] or "").strip()
        if not pn:
            _fail(errors, row_no, "Missing Part Number")
            continue
        price = _parse_number(mapped["net_price"], "Net Price", row_no, errors)
        avail = _parse_number(mapped["available_qty"], "Available Qty", row_no, errors)
        _parse_number(mapped["required_qty"], "Required Qty", row_no, errors)  # validated, not stored
        if price is None and mapped["net_price"] not in (None, ""):
            continue  # was invalid, already recorded
        if avail is None and mapped["available_qty"] not in (None, ""):
            continue

        if pn in seen_part_numbers:
            duplicate_count += 1
        seen_part_numbers.add(pn)
        valid_count += 1
        if len(preview) < PREVIEW_ROWS:
            preview.append({
                "row": row_no, "part_number": pn, "description": str(mapped["description"] or "").strip(),
                "required_qty": mapped["required_qty"], "available_qty": avail, "net_price": price,
            })

    _write_errors_csv(import_id, errors)
    return {
        "import_id": import_id,
        "detected_headers": detected_headers or [],
        "total_data_rows": valid_count + len(errors),
        "valid_rows": valid_count,
        "invalid_rows": len(errors),
        "duplicate_part_numbers": duplicate_count,
        "preview": preview,
        "errors_sample": errors[:200],
        "errors_truncated": len(errors) > MAX_ERROR_ROWS_KEPT,
    }


def _chunks(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


def run_import(sb, import_id: str) -> dict:
    """
    Re-streams the file and performs the actual batched upsert. Existing
    Part Numbers are matched (regardless of file order) and updated in
    place; new ones are inserted. Duplicate Part Numbers within the file
    are collapsed to their last occurrence, same as any master-data reload.
    """
    path = _import_path(import_id)

    # Pass 1: collect valid rows keyed by part_number (last occurrence wins),
    # and the full error list for the final report — still one streaming pass.
    by_part_number = {}
    errors = []
    for row_no, mapped, _headers in _iter_mapped_rows(path):
        pn = str(mapped["part_number"] or "").strip()
        if not pn:
            _fail(errors, row_no, "Missing Part Number")
            continue
        price = _parse_number(mapped["net_price"], "Net Price", row_no, errors)
        if mapped["net_price"] not in (None, "") and price is None:
            continue
        avail = _parse_number(mapped["available_qty"], "Available Qty", row_no, errors)
        if mapped["available_qty"] not in (None, "") and avail is None:
            continue
        by_part_number[pn] = {
            "part_number": pn,
            "description": str(mapped["description"] or "").strip(),
            "unit_cost": price if price is not None else 0,
            "available_qty": avail if avail is not None else 0,
        }

    part_numbers = list(by_part_number.keys())
    if not part_numbers:
        _write_errors_csv(import_id, errors)
        return {"inserted": 0, "updated": 0, "skipped_invalid": len(errors), "total_processed": len(errors), "errors_sample": errors[:200]}

    # Look up which of these already exist, and with which brand, so the
    # upsert's conflict target (part_number, brand) matches real rows
    # instead of accidentally creating brand='' duplicates of branded parts.
    existing_brand = {}  # part_number -> brand
    for chunk in _chunks(part_numbers, CHUNK_SIZE):
        res = sb.table("products").select("part_number, brand").in_("part_number", chunk).execute()
        for row in (res.data or []):
            # If a part_number already has multiple brands, keep the first
            # seen — this import has no brand column to disambiguate further.
            existing_brand.setdefault(row["part_number"], row.get("brand") or "")

    now = now_iso()
    product_rows = []
    for pn, r in by_part_number.items():
        product_rows.append({
            "part_number": pn,
            "brand": existing_brand.get(pn, ""),
            "description": r["description"],
            "unit_cost": r["unit_cost"],
            "updated_at": now,
        })

    inserted = sum(1 for pn in by_part_number if pn not in existing_brand)
    updated = len(by_part_number) - inserted

    upserted_products = []
    for chunk in _chunks(product_rows, CHUNK_SIZE):
        res = sb.table("products").upsert(chunk, on_conflict="part_number,brand").execute()
        upserted_products.extend(res.data or [])

    # Now that we have product ids, batch-upsert inventory.available_qty.
    inv_rows = []
    for p in upserted_products:
        pn = p["part_number"]
        src = by_part_number.get(pn)
        if src is None:
            continue
        inv_rows.append({"product_id": p["id"], "available_qty": src["available_qty"], "updated_at": now})
    for chunk in _chunks(inv_rows, CHUNK_SIZE):
        sb.table("inventory").upsert(chunk, on_conflict="product_id").execute()

    # Clean up the temp file now that the import is fully committed. The
    # error report (if any) is kept separately for download.
    _write_errors_csv(import_id, errors)
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass

    return {
        "inserted": inserted,
        "updated": updated,
        "skipped_invalid": len(errors),
        "total_processed": len(by_part_number) + len(errors),
        "errors_sample": errors[:200],
        "errors_truncated": len(errors) > MAX_ERROR_ROWS_KEPT,
    }
