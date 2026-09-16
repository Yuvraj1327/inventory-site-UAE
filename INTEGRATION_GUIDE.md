# Import Supplier Stock — integration guide

Same situation as last time: my working copy of your project reset, and
the only file I had access to was a very old pre-migration snapshot (not
your current live app), so these are clean, additive, standalone files
— not a direct edit of your current `Inventory.jsx`/`main.py`. They're
built against the same core `products`/`inventory` schema this whole
project has used since the Supabase migration, which I'm confident is
still accurate, but the two wiring steps below need to be applied to
your actual current files by hand (or send them to me and I'll do it
directly).

## What's genuinely new vs. reused

**New (additive only):**
- `backend/supabase/migrations/0009_product_weight.sql` — adds one
  column, `products.weight`. Nothing existing is touched.
- `backend/app/services/supplier_stock_import.py` — the actual logic.
- `backend/app/routers/supplier_stock_import.py` — 3 endpoints.
- `frontend/src/pages/ImportSupplierStock.jsx` — the UI.

**Reused, not duplicated:** the same `products` and `inventory` tables,
the same `get_service_client()` / `require_staff_or_admin` patterns every
other router in this project already uses, and the exact same streaming-
XLSX-plus-preview/confirm architecture as the existing bulk Product
Import feature (`app/services/product_import.py`) — so this isn't a new
pattern grafted on, it's the same one already proven in your app.

## Wiring steps (2 small edits to your current files)

**1. `backend/app/main.py`** — add the import and one `include_router` line, matching how every other router is registered:
```python
from app.routers import (
    ..., product_import, supplier_stock_import,   # add supplier_stock_import here
)
...
app.include_router(product_import.router)
app.include_router(supplier_stock_import.router)   # add this line
```

**2. `frontend/src/App.js`** — add the lazy route:
```js
const ImportSupplierStock = lazy(() => import("@/pages/ImportSupplierStock"));
...
<Route path="inventory/supplier-stock-import" element={<ImportSupplierStock />} />
```

**3. `frontend/src/pages/Inventory.jsx`** — add a button next to your existing "Import Products" button (built in an earlier round):
```jsx
<Button variant="secondary" onClick={() => navigate("/inventory/supplier-stock-import")} className="rounded-full gap-2">
  <FileXls size={18} weight="duotone" /> Import Supplier Stock
</Button>
```
(`FileXls` from `@phosphor-icons/react` — already used elsewhere in this project.)

## Run the migration
Apply `0009_product_weight.sql` in the Supabase SQL editor, same as every
previous migration in this project.

## What this does, precisely
- Matches each row's **ItemCode** against your existing **Part Number**.
- For a match: updates `description`, `weight`, `unit_cost` (= Item Price
  AED) on that product, and `available_qty` on its inventory row.
- A blank cell in the file for any of those fields **leaves the existing
  value alone** rather than wiping it to empty — so a supplier file that
  only has partial data never destroys data you already have.
- Every other field on that product (`brand`, `oem_reference`,
  `part_number` itself, etc.) is never touched.
- An ItemCode with no matching Part Number is reported in the
  preview/summary and **skipped** — never inserted as a new product.
- Two-phase preview → confirm, exactly like the existing bulk import:
  nothing is written to the database until you've reviewed the
  matched/not-found/invalid counts and explicitly confirmed.
- Streaming XLSX parsing (`openpyxl read_only`), so large files don't
  get loaded into memory as one big object graph.

## Verification performed
- Both new Python files: valid syntax (`py_compile` clean).
- **Full functional test** against a realistic mock dataset (shown
  above, not just described): confirmed matching, non-matching,
  invalid-row handling, duplicate-resolution (last occurrence wins),
  and — critically — confirmed unrelated existing fields (`brand`,
  `oem_reference`) came through completely unmodified after the update.
- Could not run this against your actual live database, your actual
  frontend build, or your actual current `Inventory.jsx`/`main.py`,
  since I don't have them. The two wiring edits above are untested
  against your real files by necessity — please verify those two
  specifically once applied.

## Still needed from you
If you'd rather I make the actual edits to `main.py`, `App.js`, and
`Inventory.jsx` myself instead of you applying the snippets above, upload
those three files (or the whole current project) and I'll do it directly
against your real code.
