import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, money, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  UploadSimple, FileXls, CheckCircle, Warning, XCircle, ArrowLeft, DownloadSimple, ArrowClockwise,
} from "@phosphor-icons/react";
import { toast } from "sonner";

// Admin bulk Product/Inventory import — Upload → Validate/Preview → Confirm → Summary.
// The file itself never gets parsed row-by-row in the browser: it's sent
// once to the backend, which streams and validates it (openpyxl read_only
// mode) and only ever returns a bounded preview, never the full 100k+ rows.
export default function ImportProducts() {
  const navigate = useNavigate();
  const [step, setStep] = useState("upload"); // upload | preview | importing | summary
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null); // response from /preview
  const [summary, setSummary] = useState(null); // response from /confirm
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
      const r = await api.post("/products/import/preview", form, { headers: { "Content-Type": "multipart/form-data" } });
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
      const r = await api.post(`/products/import/${preview.import_id}/confirm`);
      setSummary(r.data);
      setStep("summary");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Import failed.");
      setStep("preview");
    }
  };

  const downloadErrors = (importId) => {
    // Auth header is required, so this goes through the api client rather
    // than a plain <a href>, then triggers a browser download from the blob.
    api.get(`/products/import/${importId}/errors.csv`, { responseType: "blob" }).then((r) => {
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement("a");
      a.href = url; a.download = `import_errors_${importId.slice(0, 8)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    }).catch(() => toast.error("No error report available."));
  };

  const reset = () => { setStep("upload"); setFileName(""); setPreview(null); setSummary(null); };

  return (
    <div className="space-y-5" data-testid="import-products-page">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/inventory")} className="h-8 w-8 -ml-1.5">
          <ArrowLeft size={16} />
        </Button>
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight" style={{ fontFamily: "Manrope" }}>Import Products</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Bulk-load or update the product catalog from a master spreadsheet.</p>
        </div>
      </div>

      {step === "upload" && (
        <Card className="p-8 shadow-card">
          <div className="max-w-lg mx-auto text-center space-y-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <FileXls size={26} weight="duotone" />
            </div>
            <div>
              <h2 className="font-medium" style={{ fontFamily: "Manrope" }}>Upload a product spreadsheet</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Expected columns: <span className="font-mono text-xs">Part Number</span>, <span className="font-mono text-xs">Description</span>, <span className="font-mono text-xs">Required Qty</span>, <span className="font-mono text-xs">Available Qty</span>, <span className="font-mono text-xs">Net Price</span>. Handles 100,000+ rows.
              </p>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" data-testid="import-file-input"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="import-choose-file-btn" className="gap-2">
              <UploadSimple size={16} /> {uploading ? `Validating ${fileName}…` : "Choose file"}
            </Button>
            {uploading && <p className="text-xs text-muted-foreground">Large files may take a few seconds to validate — this runs entirely on the server.</p>}
          </div>
        </Card>
      )}

      {step === "preview" && preview && (
        <div className="space-y-4" data-testid="import-preview">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Rows" value={preview.total_data_rows} icon={FileXls} />
            <StatCard label="Valid" value={preview.valid_rows} icon={CheckCircle} tone="up" />
            <StatCard label="Invalid" value={preview.invalid_rows} icon={XCircle} tone={preview.invalid_rows > 0 ? "down" : "default"} />
            <StatCard label="Duplicate Part Numbers" value={preview.duplicate_part_numbers} icon={Warning} tone={preview.duplicate_part_numbers > 0 ? "warn" : "default"} />
          </div>

          {preview.duplicate_part_numbers > 0 && (
            <div className="flex items-start gap-2 text-sm bg-warning/10 border border-warning/30 text-warning-foreground rounded-lg px-3.5 py-2.5">
              <Warning size={16} className="shrink-0 mt-0.5 text-warning" />
              <span>{preview.duplicate_part_numbers} Part Number(s) appear more than once in this file — the last occurrence of each will be used.</span>
            </div>
          )}

          <Card className="shadow-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-medium" style={{ fontFamily: "Manrope" }}>Preview — first {preview.preview.length} valid rows</h3>
              <span className="text-xs text-muted-foreground">Detected columns: {preview.detected_headers.join(", ")}</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Row</TableHead><TableHead>Part Number</TableHead><TableHead>Description</TableHead>
                  <TableHead className="text-right">Required Qty</TableHead><TableHead className="text-right">Available Qty</TableHead><TableHead className="text-right">Net Price</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {preview.preview.map((r) => (
                    <TableRow key={r.row}>
                      <TableCell className="text-muted-foreground text-xs">{r.row}</TableCell>
                      <TableCell className="font-mono text-xs">{r.part_number}</TableCell>
                      <TableCell className="text-xs">{r.description || "—"}</TableCell>
                      <TableCell className="text-right text-xs">{r.required_qty ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs">{r.available_qty ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono tabular text-xs">{r.net_price != null ? `$${money(r.net_price)}` : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {preview.errors_sample.length > 0 && (
            <Card className="shadow-card overflow-hidden border-destructive/30" data-testid="import-error-preview">
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
                  <TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {preview.errors_sample.map((e, i) => (
                      <TableRow key={i}><TableCell className="text-xs">{e.row}</TableCell><TableCell className="text-xs text-destructive">{e.reason}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          <div className="flex justify-end gap-2.5">
            <Button variant="outline" onClick={reset} data-testid="import-cancel-btn">Cancel</Button>
            <Button onClick={confirmImport} disabled={preview.valid_rows === 0} data-testid="import-confirm-btn">
              Import {preview.valid_rows.toLocaleString()} Product{preview.valid_rows === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}

      {step === "importing" && (
        <Card className="p-10 shadow-card text-center">
          <div className="h-8 w-8 rounded-full border-2 border-border border-t-primary animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Importing — writing to the catalog in batches. This can take a little while for very large files.</p>
        </Card>
      )}

      {step === "summary" && summary && (
        <Card className="p-8 shadow-card text-center max-w-lg mx-auto" data-testid="import-summary">
          <div className="h-14 w-14 rounded-full bg-success/10 text-success flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={28} weight="fill" />
          </div>
          <h2 className="text-lg font-semibold" style={{ fontFamily: "Manrope" }}>Import complete</h2>
          <div className="grid grid-cols-2 gap-3 mt-5 text-left">
            <SummaryStat label="New Products" value={summary.inserted} tone="up" />
            <SummaryStat label="Updated Products" value={summary.updated} tone="default" />
            <SummaryStat label="Skipped (Invalid)" value={summary.skipped_invalid} tone={summary.skipped_invalid > 0 ? "warn" : "default"} />
            <SummaryStat label="Total Processed" value={summary.total_processed} tone="default" />
          </div>
          {summary.skipped_invalid > 0 && (
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
