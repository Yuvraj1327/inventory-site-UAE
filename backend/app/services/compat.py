"""
The existing frontend was written against the old Mongo-backed API
(Mongo `_id` strings, free-text customer/supplier names, `name`/`sku`
line-item fields). Per the "don't redesign the UI" instruction, these
helpers translate between that shape and the new relational schema so
the pages work unchanged in Phase 2. Phases 3+ will move the UI onto
the richer shape (order_lines, FK pickers, etc.) incrementally.
"""
from datetime import datetime, timezone
import re


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def with_legacy_id(row: dict | None) -> dict | None:
    """Add `_id` (alias of `id`) so existing pages that read `row._id` keep working."""
    if row is None:
        return None
    row = dict(row)
    if "id" in row:
        row["_id"] = row["id"]
    return row


def clean_list(rows: list[dict]) -> list[dict]:
    return [with_legacy_id(r) for r in rows]


async def find_party_id_by_name(sb, table: str, name: str) -> str | None:
    """
    Best-effort link from a free-text customer/supplier name (what the
    current Orders/Purchases/Invoices forms send) to a real row in
    `customers` / `suppliers`, so the FK columns get populated when
    possible without forcing the old UI to switch to a picker yet.
    Returns the row id, or None if name is blank.
    """
    name = (name or "").strip()
    if not name:
        return None
    existing = sb.table(table).select("id").ilike("name", name).limit(1).execute()
    if existing.data:
        return existing.data[0]["id"]
    return None


def make_lpo(name: str, phone: str) -> str:
    words = [w for w in re.split(r"\s+", (name or "").strip()) if w]
    abbr = "".join(w[0] for w in words[:4]).upper() if len(words) >= 2 else (name or "").strip()[:3].upper()
    digits = re.sub(r"\D", "", phone or "")
    last2 = digits[-2:] if len(digits) >= 2 else digits
    return f"{abbr}{last2}"


async def next_account_no(sb) -> str:
    """Sequential AC00001-style account numbers, derived from current row count (Postgres has no Mongo counters collection)."""
    res = sb.table("customers").select("id", count="exact").execute()
    seq = (res.count or 0) + 1
    return f"AC{seq:05d}"
