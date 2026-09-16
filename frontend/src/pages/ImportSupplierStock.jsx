import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, money, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  UploadSimple, FileXls, CheckCircle, Warning, XCircle, ArrowLeft, DownloadSimple, ArrowClockwise,
} from "@phosphor-icons/react";
import { toast } from "sonner";

// Admin "Import Supplier Stock" — Upload -> Validate/Preview -> Confirm -> Summary.
// UPDATE-ONLY: matches ItemCode against existing Part Numbers and updates
// Description/Weight/Available Stock/Cost Price on those rows. Never
// creates a new product — ItemCodes with no match are reported, not
// inserted, so this can never create duplicates.
export default function ImportSupplierStock() {
  const navigate = useNavigate();
  const [step, setStep] = useState("upload"); // upload | preview | importing | summary
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [summary, setSummary] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const handleFile = async (file) => {
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      toast.error("Please choose a .xlsx or .xls file.");
      return;
    }
    setFileName(file.name);
    setUploading(true);
    setPreview(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await api.post("/inventory/supplier-stock-import/preview", form, { headers: { "Content-Type": "multipart/form-data" } });
      setPreview(r.data);
      setStep("preview");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Could not read that file.");
    }
    setUploading(false);
  };

  const confirmImport = async () => {
    if (!preview) return;
    setStep("importing");
    try {
      const r = await api.post(`/inventory/supplier-stock-import/${preview.import_id}/confirm`);
      setSummary(r.data);
      setStep("summary");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Import failed.");
      setStep("preview");
    }
  };

  const downloadErrors = (importId) => {
    api.get(`/inventory/supplier-stock-import/${importId}/errors.csv`, { responseType: "blob" }).then((r) => {
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement("a");
      a.href = url; a.download = `supplier_stock_import_errors_${importId.slice(0, 8)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    }).catch(() => toast.error("No error report available."));
  };

  const reset = () => { setStep("upload"); setFileName(""); setPreview(null); setSummary(null); };

  return (
    <div className="space-y-5" data-testid="import-supplier-stock-page">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/inventory")} className="h-8 w-8 -ml-1.5">
          <ArrowLeft size={16} />
        </Button>
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight" style={{ fontFamily: "Manrope" }}>Import Supplier Stock</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Update existing products' description, weight, stock and cost from a supplier stock sheet.</p>
        </div>
      </div>

      {step === "upload" && (
        <Card className="p-8 shadow-card">
          <div className="max-w-lg mx-auto text-center space-y-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <FileXls size={26} weight="duotone" />
            </div>
            <div>
              <h2 className="font-medium" style={{ fontFamily: "Manrope" }}>Upload a supplier stock spreadsheet</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Expected columns: <span className="font-mono text-xs">ItemCode</span>, <span className="font-mono text-xs">ItemDescription</span>, <span className="font-mono text-xs">Weight</span>, <span className="font-mono text-xs">AvailableQty</span>, <span className="font-mono text-xs">Item Price AED</span>.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                This <strong>updates existing products only</strong> — ItemCode is matched against your Part Number. Items not already in your catalog are reported, never created.
              </p>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" data-testid="supplier-stock-file-input"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="supplier-stock-choose-file-btn" className="gap-2">
              <UploadSimple size={16} /> {uploading ? `Validating ${fileName}…` : "Choose file"}
            </Button>
            {uploading && <p className="text-xs text-muted-foreground">Large files may take a few seconds to validate — this runs entirely on the server.</p>}
          </div>
        </Card>
      )}

      {step === "preview" && preview && (
        <div className="space-y-4" data-testid="supplier-stock-preview">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Rows" value={preview.total_data_rows} icon={FileXls} />
            <StatCard label="Matched" value={preview.matched_count} icon={CheckCircle} tone="up" />
            <StatCard label="Not Found" value={preview.not_found_count} icon={Warning} tone={preview.not_found_count > 0 ? "warn" : "default"} />
            <StatCard label="Invalid" value={preview.invalid_rows} icon={XCircle} tone={preview.invalid_rows > 0 ? "down" : "default"} />
          </div>

          {preview.not_found_count > 0 && (
            <div className="flex items-start gap-2 text-sm bg-warning/10 border border-warning/30 text-warning-foreground rounded-lg px-3.5 py-2.5">
              <Warning size={16} className="shrink-0 mt-0.5 text-warning" />
              <span>{preview.not_found_count} ItemCode(s) don't match any existing Part Number and will be skipped — nothing is created. First few: {preview.not_found_sample.slice(0, 8).join(", ")}{preview.not_found_count > 8 ? "…" : ""}</span>
            </div>
          )}
          {preview.duplicate_item_codes > 0 && (
            <div className="flex items-start gap-2 text-sm bg-warning/10 border border-warning/30 text-warning-foreground rounded-lg px-3.5 py-2.5">
              <Warning size={16} className="shrink-0 mt-0.5 text-warning" />
              <span>{preview.duplicate_item_codes} ItemCode(s) appear more than once in this file — the last occurrence of each will be used.</span>
            </div>
          )}

          <Card className="shadow-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-medium" style={{ fontFamily: "Manrope" }}>Preview — first {preview.preview.length} rows</h3>
              <span className="text-xs text-muted-foreground">Detected columns: {preview.detected_headers.join(", ")}</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Row</TableHead><TableHead>ItemCode</TableHead><TableHead>Description</TableHead>
                  <TableHead className="text-right">Weight</TableHead><TableHead className="text-right">Available Qty</TableHead>
                  <TableHead className="text-right">Price (AED)</TableHead><TableHead>Match</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {preview.preview.map((r) => (
                    <TableRow key={r.row}>
                      <TableCell className="text-muted-foreground text-xs">{r.row}</TableCell>
                      <TableCell className="font-mono text-xs">{r.item_code}</TableCell>
                      <TableCell className="text-xs">{r.description || "—"}</TableCell>
                      <TableCell className="text-right text-xs">{r.weight ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs">{r.available_qty ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono tabular text-xs">{r.unit_cost != null ? `$${money(r.unit_cost)}` : "—"}</TableCell>
                      <TableCell>
                        {r.matched ? (
                          <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle size={13} weight="fill" /> Matched</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-warning"><Warning size={13} /> Not found</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {preview.errors_sample.length > 0 && (
            <Card className="shadow-card overflow-hidden border-destructive/30" data-testid="supplier-stock-error-preview">
              <div className="p-3.5 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-medium text-destructive" style={{ fontFamily: "Manrope" }}>
                  Invalid rows (will be skipped) — showing {preview.errors_sample.length} of {preview.invalid_rows}
                </h3>
                <Button variant="outline" size="sm" onClick={() => downloadErrors(preview.import_id)} className="gap-1.5">
                  <DownloadSimple size={14} /> Download report
                </Button>
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Row</TableHead><TableHead>ItemCode</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {preview.errors_sample.map((e, i) => (
                      <TableRow key={i}><TableCell className="text-xs">{e.row}</TableCell><TableCell className="font-mono text-xs">{e.item_code}</TableCell><TableCell className="text-xs text-destructive">{e.reason}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          <div className="flex justify-end gap-2.5">
            <Button variant="outline" onClick={reset} data-testid="supplier-stock-cancel-btn">Cancel</Button>
            <Button onClick={confirmImport} disabled={preview.matched_count === 0} data-testid="supplier-stock-confirm-btn">
              Update {preview.matched_count.toLocaleString()} Product{preview.matched_count === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}

      {step === "importing" && (
        <Card className="p-10 shadow-card text-center">
          <div className="h-8 w-8 rounded-full border-2 border-border border-t-primary animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Updating stock — this can take a little while for very large files.</p>
        </Card>
      )}

      {step === "summary" && summary && (
        <Card className="p-8 shadow-card text-center max-w-lg mx-auto" data-testid="supplier-stock-summary">
          <div className="h-14 w-14 rounded-full bg-success/10 text-success flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={28} weight="fill" />
          </div>
          <h2 className="text-lg font-semibold" style={{ fontFamily: "Manrope" }}>Stock update complete</h2>
          <div className="grid grid-cols-3 gap-3 mt-5 text-left">
            <SummaryStat label="Updated" value={summary.updated} tone="up" />
            <SummaryStat label="Not Found" value={summary.not_found} tone={summary.not_found > 0 ? "warn" : "default"} />
            <SummaryStat label="Skipped (Invalid)" value={summary.skipped_invalid} tone={summary.skipped_invalid > 0 ? "warn" : "default"} />
          </div>
          {(summary.skipped_invalid > 0 || summary.not_found > 0) && (
            <Button variant="outline" className="mt-4 gap-1.5" onClick={() => downloadErrors(preview.import_id)}>
              <DownloadSimple size={14} /> Download error report
            </Button>
          )}
          <div className="flex justify-center gap-2.5 mt-6">
            <Button variant="outline" onClick={reset} className="gap-1.5"><ArrowClockwise size={14} /> Import Another File</Button>
            <Button onClick={() => navigate("/inventory")}>Back to Inventory</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

const TONE = { default: "text-foreground", up: "text-success", warn: "text-warning", down: "text-destructive" };

const StatCard = ({ label, value, icon: Icon, tone = "default" }) => (
  <Card className="p-3.5 shadow-card">
    <div className="flex items-start justify-between gap-2">
      <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">{label}</span>
      <Icon size={14} className={TONE[tone]} />
    </div>
    <div className={`mt-1.5 text-xl font-mono tabular font-medium ${TONE[tone]}`}>{Number(value).toLocaleString()}</div>
  </Card>
);

const SummaryStat = ({ label, value, tone }) => (
  <div className="p-3 rounded-lg bg-muted/50">
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className={`text-lg font-mono tabular font-medium ${TONE[tone]}`}>{Number(value).toLocaleString()}</div>
  </div>
);
