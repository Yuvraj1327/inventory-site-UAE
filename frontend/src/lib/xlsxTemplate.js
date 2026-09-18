import * as XLSX from "xlsx";

// Shared XLSX template generation — used by both "Download Template"
// buttons in the app (admin Import Products, Customer Portal New Order
// XLSX upload). Each page gets a template matching *its own* actual
// expected columns (they're genuinely different forms — one is an
// inventory update, the other is an order request), but both are built
// through this one shared function so the "make Part Number safe as
// text" behavior can't drift or be implemented twice.
//
// Reuses the same `xlsx` (SheetJS) library already used elsewhere in
// this app (PortalNewOrder's XLSX upload, the Order Lines export) —
// nothing new added to the project.

// How many rows to pre-format as TEXT in the Part Number column, so
// values a user types later (leading zeros, letters, hyphens) aren't
// silently reinterpreted as numbers by Excel.
const TEXT_FORMATTED_ROWS = 500;

/**
 * @param {string[]} headers - column headers, in order
 * @param {Array} exampleRow - one illustrative row matching `headers` (never real data)
 * @param {number} partNumberColIndex - 0-indexed column to force as TEXT format
 * @param {string} filename
 */
function buildAndDownload(headers, exampleRow, partNumberColIndex, filename) {
  const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);

  for (let r = 1; r <= TEXT_FORMATTED_ROWS; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: partNumberColIndex });
    const existing = ws[addr];
    if (existing) {
      existing.t = "s";
      existing.z = "@";
    } else {
      ws[addr] = { t: "s", v: "", z: "@" };
    }
  }
  const lastRow = Math.max(TEXT_FORMATTED_ROWS, 1);
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: headers.length - 1 } });
  ws["!cols"] = headers.map(() => ({ wch: 16 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.writeFile(wb, filename);
}

/**
 * Admin → Inventory → Import Products. Matches ImportProducts.jsx's own
 * "Expected columns" exactly: S.No, Part Number, Description,
 * Available Stock, Unit Cost, Weight.
 */
export function downloadPartsXlsxTemplate(filename = "product_import_template.xlsx") {
  const headers = ["S.No", "Part Number", "Description", "Available Stock", "Unit Cost", "Weight"];
  const example = [1, "SAMPLE-001", "Sample Part Description", 10, 25.00, 1.5];
  buildAndDownload(headers, example, 1, filename);
}

/**
 * Customer Portal → New Order → Upload XLSX. Matches
 * PortalNewOrder.jsx's XlsxUploadPanel own parser exactly: Sl No, Part
 * Number, Quantity, Requested Price — a customer is placing an order
 * (what and how many), not updating stock/cost, so this intentionally
 * does NOT reuse the admin template's columns.
 */
export function downloadOrderXlsxTemplate(filename = "order_template.xlsx") {
  const headers = ["Sl No", "Part Number", "Quantity", "Requested Price"];
  const example = [1, "SAMPLE-001", 5, ""];
  buildAndDownload(headers, example, 1, filename);
}
