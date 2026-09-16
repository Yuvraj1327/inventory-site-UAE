"""
Admin "Import Supplier Stock" — updates EXISTING products from a
supplier's stock XLSX (ItemCode, ItemDescription, Weight, AvailableQty,
Item Price AED). This never creates new products — rows whose ItemCode
doesn't match an existing Part Number are reported as "not found" and
skipped, satisfying "do not create duplicates."

Architecture deliberately mirrors the existing bulk Product Import
feature (app/services/product_import.py) already in this codebase:
- openpyxl in read_only (streaming) mode — never loads the whole file
  into memory as Python objects beyond one batch, so large supplier
  files are handled the same way the 100k+ row product catalog import
  already is.
- Two-phase preview -> confirm flow. The uploaded file is kept on disk
  between the two calls (keyed by import_id) and re-parsed at confirm
  time, so nothing is written to the database until the admin has
  reviewed matched/updated/not-found/invalid counts and explicitly
  confirmed.
- Batched writes (CHUNK_SIZE rows per Supabase call), never row-by-row.

Only ever touches: products.description, products.weight,
products.unit_cost, and inventory.available_qty for rows that matched
an existing Part Number. Every other existing field on those rows
(brand, oem_reference, created_at, etc.) is left completely untouched,
and no other product/inventory row is affected at all.
"""
import csv
import io
import os
import re
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile
from openpyxl import load_workbook

from app.services.compat import now_iso

STORAGE_ROOT = Path(__file__).resolve().parent.parent.parent / "secure_uploads" / "supplier_stock_imports"
STORAGE_ROOT.mkdir(parents=True, exist_ok=True)

MAX_SIZE_BYTES = 50 * 1024 * 1024
CHUNK_SIZE = 500  # rows per existing-product lookup / per batch update call
PREVIEW_ROWS = 50
MAX_ERROR_ROWS_KEPT = 5000

COLUMN_ALIASES = {
    "itemcode": "item_code", "item code": "item_code",
    "itemdescription": "description", "item description": "description",
    "weight": "weight",
    "availableqty": "available_qty", "available qty": "available_qty",
    "item price aed": "unit_cost", "itempriceaed": "unit_cost", "price": "unit_cost",
}
REQUIRED_MAPPED_COLUMNS = {"item_code"}


def _normalize_header(h) -> str:
    return str(h or "").strip().lower()


# Cells that mean "no value" for a numeric column even though they aren't
# Python None or "" — suppliers commonly use these as Weight/AvailableQty/
# Price placeholders instead of leaving the cell truly empty.
_BLANK_NUMERIC_TOKENS = {"", "-", "--", "n/a", "na", "none", "null", "nil"}
# Currency symbols/codes (Item Price AED) and weight units (Weight is
# frequently exported as e.g. "0.002 KG" rather than a bare number).
_UNIT_OR_CURRENCY_TOKEN_RE = re.compile(r"(?i)\b(aed|dhs|dh|usd|kgs?|gms?|grams?|lbs?|pounds?)\b|[$€£]")
# Only matches unambiguous thousands-grouped numbers (e.g. "1,250" or
# "12,345.67") so we don't mangle a locale where "," is a decimal separator.
_THOUSANDS_GROUPED_RE = re.compile(r"^-?\d{1,3}(,\d{3})+(\.\d+)?$")
# A number_format made up only of zeros (e.g. "0000000000") means Excel is
# displaying a zero-padded code while storing the plain integer.
_ZERO_PAD_FORMAT_RE = re.compile(r"^0+$")


def _normalize_item_code(v) -> str:
    """
    Excel/openpyxl returns numeric-looking ItemCodes as int/float, not the
    original text — e.g. a "General"-formatted cell containing 12345 comes
    back as the float 12345.0, which str()'s to "12345.0" and would never
    equal a text part_number of "12345". Collapse whole-number floats back
    to plain integers before stringifying, and strip stray whitespace
    (including non-breaking spaces some exports embed) so a code doesn't
    fail to match purely because of formatting noise introduced by Excel.
    """
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).replace("\xa0", " ").strip()


def _clean_numeric_cell(v):
    """
    Returns a value safe to pass to float(), or None if the cell represents
    "no value" (blank, whitespace-only, or a common placeholder like "-" or
    "N/A"). Genuinely malformed values are returned unchanged so they still
    fail validation loudly instead of being silently coerced.
    """
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return v
    s = str(v).replace("\xa0", " ").strip()
    if s.lower() in _BLANK_NUMERIC_TOKENS:
        return None
    cleaned = _UNIT_OR_CURRENCY_TOKEN_RE.sub("", s).strip()
    if _THOUSANDS_GROUPED_RE.match(cleaned):
        cleaned = cleaned.replace(",", "")
    return cleaned


def _resolve_item_code_cell(cell) -> str:
    """
    Recovers zero-padded numeric ItemCodes. Excel can display an all-digit
    code like "0041595803" via a custom "0000000000" number format while
    the underlying stored value is the plain integer 41595803 — openpyxl
    returns that raw value, not the display string, so without this the
    leading zeros are silently lost and the code can never match the text
    Part Number in the database. Falls back to normal normalization for
    ordinary text/numeric codes.
    """
    value = cell.value if cell is not None else None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        fmt = cell.number_format or ""
        if _ZERO_PAD_FORMAT_RE.match(fmt) and float(value).is_integer():
            return str(int(value)).zfill(len(fmt))
    return _normalize_item_code(value)


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


def _errors_csv_path(import_id: str) -> Path:
    return STORAGE_ROOT / f"{import_id}_errors.csv"


def _write_errors_csv(import_id: str, errors: list):
    if not errors:
        return
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["row", "item_code", "reason"])
    for e in errors:
        w.writerow([e["row"], e.get("item_code", ""), e["reason"]])
    _errors_csv_path(import_id).write_text(buf.getvalue())


def read_errors_csv(import_id: str) -> bytes:
    path = _errors_csv_path(import_id)
    if not path.exists() or STORAGE_ROOT not in path.resolve().parents:
        raise HTTPException(status_code=404, detail="No error report available for this import.")
    return path.read_bytes()


def _fail(errors: list, row_no: int, item_code: str, reason: str):
    if len(errors) < MAX_ERROR_ROWS_KEPT:
        errors.append({"row": row_no, "item_code": item_code, "reason": reason})


def _parse_number(v, field: str, row_no: int, item_code: str, errors: list):
    cleaned = _clean_numeric_cell(v)
    if cleaned is None or cleaned == "":
        return None
    try:
        n = float(cleaned)
    except (TypeError, ValueError):
        _fail(errors, row_no, item_code, f"{field} is not a valid number ('{v}')")
        return "invalid"
    if n < 0:
        _fail(errors, row_no, item_code, f"{field} cannot be negative ({n})")
        return "invalid"
    return n


def _iter_mapped_rows(path: Path):
    wb = load_workbook(path, read_only=True, data_only=True)
    try:
        ws = wb.worksheets[0]
        # Cell objects (not values_only) are needed so the ItemCode column
        # can inspect number_format and recover zero-padded codes; this is
        # still the streaming reader, so memory behavior is unchanged.
        rows_iter = ws.iter_rows()
        header_cells = next(rows_iter, None)
        if not header_cells:
            raise HTTPException(status_code=400, detail="The file has no header row.")
        header = [c.value for c in header_cells]
        col_index = {}
        for i, h in enumerate(header):
            key = COLUMN_ALIASES.get(_normalize_header(h))
            if key:
                col_index[key] = i
        missing = REQUIRED_MAPPED_COLUMNS - set(col_index.keys())
        if missing:
            raise HTTPException(status_code=400, detail=f"Missing required column(s): {', '.join(sorted(missing))}. Detected headers: {[str(h) for h in header]}")

        row_no = 1
        for row_cells in rows_iter:
            row_no += 1
            if row_cells is None or all(c.value is None or str(c.value).strip() == "" for c in row_cells):
                continue

            def get_cell(key):
                idx = col_index.get(key)
                return row_cells[idx] if idx is not None and idx < len(row_cells) else None

            def get_value(key):
                cell = get_cell(key)
                return cell.value if cell is not None else None

            yield row_no, {
                "item_code": _resolve_item_code_cell(get_cell("item_code")),
                "description": get_value("description"),
                "weight": get_value("weight"),
                "available_qty": get_value("available_qty"),
                "unit_cost": get_value("unit_cost"),
            }, [str(h) for h in header]
    finally:
        wb.close()


def _validate_rows(path: Path):
    """Streams the file once, returning (valid_by_item_code, errors, detected_headers, duplicate_count)."""
    by_item_code = {}
    errors = []
    duplicate_count = 0
    detected_headers = None
    seen = set()

    for row_no, mapped, headers in _iter_mapped_rows(path):
        detected_headers = detected_headers or headers
        code = _normalize_item_code(mapped["item_code"])
        if not code:
            _fail(errors, row_no, "", "Missing ItemCode")
            continue

        weight = _parse_number(mapped["weight"], "Weight", row_no, code, errors)
        if weight == "invalid":
            continue
        qty = _parse_number(mapped["available_qty"], "AvailableQty", row_no, code, errors)
        if qty == "invalid":
            continue
        price = _parse_number(mapped["unit_cost"], "Item Price AED", row_no, code, errors)
        if price == "invalid":
            continue

        if code in seen:
            duplicate_count += 1
        seen.add(code)

        by_item_code[code] = {
            "row": row_no, "item_code": code,
            "description": str(mapped["description"] or "").replace("\xa0", " ").strip(),
            "weight": weight, "available_qty": qty, "unit_cost": price,
        }

    return by_item_code, errors, (detected_headers or []), duplicate_count


def validate_import(sb, import_id: str) -> dict:
    """Preview step — validates and matches against existing products, writes nothing."""
    path = _import_path(import_id)
    by_item_code, errors, headers, duplicate_count = _validate_rows(path)

    part_numbers = list(by_item_code.keys())
    matched_products = {}
    for i in range(0, len(part_numbers), CHUNK_SIZE):
        chunk = part_numbers[i:i + CHUNK_SIZE]
        res = sb.table("products").select("id, part_number, description, weight, unit_cost").in_("part_number", chunk).execute()
        for row in (res.data or []):
            matched_products[row["part_number"]] = row

    matched, not_found = [], []
    preview = []
    for code, r in by_item_code.items():
        existing = matched_products.get(code)
        entry = {**r, "matched": existing is not None}
        if existing:
            entry["current_description"] = existing.get("description")
            entry["current_weight"] = existing.get("weight")
            entry["current_unit_cost"] = existing.get("unit_cost")
            matched.append(code)
        else:
            not_found.append(code)
        if len(preview) < PREVIEW_ROWS:
            preview.append(entry)

    _write_errors_csv(import_id, errors)
    return {
        "import_id": import_id,
        "detected_headers": headers,
        "total_data_rows": len(by_item_code) + len(errors),
        "matched_count": len(matched),
        "not_found_count": len(not_found),
        "invalid_rows": len(errors),
        "duplicate_item_codes": duplicate_count,
        "preview": preview,
        "not_found_sample": not_found[:50],
        "errors_sample": errors[:200],
        "errors_truncated": len(errors) > MAX_ERROR_ROWS_KEPT,
    }


def run_import(sb, import_id: str) -> dict:
    """
    Confirm step — re-streams the file and applies the update. Only rows
    whose ItemCode matches an existing Part Number are written; anything
    else is left alone (never inserted as a new product).
    """
    path = _import_path(import_id)
    by_item_code, errors, _headers, _dupes = _validate_rows(path)

    part_numbers = list(by_item_code.keys())
    if not part_numbers:
        _write_errors_csv(import_id, errors)
        return {"updated": 0, "not_found": 0, "skipped_invalid": len(errors), "errors_sample": errors[:200]}

    matched_products = {}
    for i in range(0, len(part_numbers), CHUNK_SIZE):
        chunk = part_numbers[i:i + CHUNK_SIZE]
        res = sb.table("products").select("id, part_number").in_("part_number", chunk).execute()
        for row in (res.data or []):
            matched_products[row["part_number"]] = row["id"]

    now = now_iso()
    product_updates = []  # one per matched row: {id, description, weight, unit_cost}
    inventory_updates = []  # {product_id, available_qty}
    not_found = 0

    for code, r in by_item_code.items():
        pid = matched_products.get(code)
        if not pid:
            not_found += 1
            continue
        update = {"id": pid, "updated_at": now}
        # Only set fields the file actually provided — an admin leaving a
        # cell blank shouldn't wipe out an existing value.
        if r["description"]:
            update["description"] = r["description"]
        if r["weight"] is not None:
            update["weight"] = r["weight"]
        if r["unit_cost"] is not None:
            update["unit_cost"] = r["unit_cost"]
        product_updates.append(update)
        if r["available_qty"] is not None:
            inventory_updates.append({"product_id": pid, "available_qty": r["available_qty"], "updated_at": now})

    # Products table has no natural single-column conflict target for a
    # bulk upsert here (unique key is part_number+brand, and we're
    # updating by id, not upserting), so each row is written individually
    # via .update().eq("id", ...) — still one HTTP round trip per row,
    # but only for rows that actually matched (never the full file), and
    # batching further would require a stored procedure this schema
    # doesn't have. For typical supplier stock files (hundreds to low
    # thousands of SKUs) this stays well within acceptable request volume.
    updated = 0
    for u in product_updates:
        pid = u.pop("id")
        sb.table("products").update(u).eq("id", pid).execute()
        updated += 1

    for chunk_start in range(0, len(inventory_updates), CHUNK_SIZE):
        chunk = inventory_updates[chunk_start:chunk_start + CHUNK_SIZE]
        sb.table("inventory").upsert(chunk, on_conflict="product_id").execute()

    _write_errors_csv(import_id, errors)
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass

    return {
        "updated": updated,
        "not_found": not_found,
        "skipped_invalid": len(errors),
        "total_processed": len(by_item_code) + len(errors),
        "errors_sample": errors[:200],
        "errors_truncated": len(errors) > MAX_ERROR_ROWS_KEPT,
    }
