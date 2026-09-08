import { useState, useRef } from "react";
import { api, money, fmtDate } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Scan, UploadSimple, CheckCircle, Receipt, Warning } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Scanner() {
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef();

  const pick = (f) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    setPreview(URL.createObjectURL(f));
  };

  const scan = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api.post("/scan-receipt", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setResult(r.data);
      if (r.data.ok) {
        toast.success(r.data.needs_manual_review ? "Scanned — a few fields need a quick check" : "Receipt scanned");
      } else {
        // A readable HTTP response, but the AI couldn't extract usable data
        // (e.g. genuinely unreadable photo) — not a network/server error.
        toast.error(r.data.message || "Couldn't read this receipt. Try a clearer photo.");
      }
    } catch (e) {
      const detail = e.response?.data?.detail;
      toast.error(detail || "Scan failed. Try another image.");
    }
    setLoading(false);
  };

  const saveAsExpense = async () => {
    try {
      await api.post("/transactions", {
        type: "expense",
        amount: parseFloat(result.total || 0),
        category: "Other",
        description: result.supplier || "Scanned receipt",
        party: result.supplier || "",
        date: result.invoice_date || null,
      });
      toast.success("Saved to transactions");
    } catch { toast.error("Save failed"); }
  };

  return (
    <div className="space-y-8" data-testid="scanner-page">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">AI Extraction</div>
        <h1 className="text-5xl tracking-tight font-bold mt-1" style={{ fontFamily: "Manrope" }}>Receipt Scanner</h1>
        <p className="text-muted-foreground mt-2 text-sm max-w-lg">Upload a photo of a supplier receipt or invoice — Gemini reads it and extracts the supplier, totals, and line items.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
            onClick={() => inputRef.current?.click()}
            data-testid="dropzone"
            className={`cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition-colors ${drag ? "border-primary bg-accent" : "border-border hover:border-primary/50"}`}
          >
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              data-testid="file-input" onChange={(e) => pick(e.target.files[0])} />
            {preview ? (
              <img src={preview} alt="receipt" className="max-h-72 mx-auto rounded-md" />
            ) : (
              <div className="flex flex-col items-center gap-3 text-muted-foreground py-6">
                <UploadSimple size={38} weight="duotone" />
                <p className="text-sm">Click or drag a receipt image here</p>
                <p className="text-xs">PNG, JPEG or WEBP</p>
              </div>
            )}
          </div>
          <Button onClick={scan} disabled={!file || loading} data-testid="scan-btn"
            className="w-full mt-4 rounded-full gap-2">
            <Scan size={18} weight="duotone" /> {loading ? "Analyzing…" : "Scan Receipt"}
          </Button>
        </Card>

        <Card className="p-6" data-testid="scan-result">
          <h3 className="text-2xl font-bold mb-5" style={{ fontFamily: "Manrope" }}>Extracted Data</h3>
          {!result ? (
            <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
              <Receipt size={38} weight="duotone" />
              <p className="text-sm">Results will appear here after scanning.</p>
            </div>
          ) : !result.ok ? (
            <div className="py-10 flex flex-col items-center gap-3 text-center" data-testid="scan-unreadable">
              <Warning size={32} weight="duotone" className="text-warning" />
              <p className="text-sm text-muted-foreground max-w-xs">{result.message || "Couldn't extract data from this image."}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {result.needs_manual_review && (
                <Badge variant="outline" className="gap-1.5 border-warning/40 text-warning">
                  <Warning size={13} /> Review before saving
                </Badge>
              )}
              <Field label="Supplier" value={result.supplier || "—"} />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Invoice #" value={result.invoice_number || "—"} />
                <Field label="Invoice Date" value={result.invoice_date ? fmtDate(result.invoice_date) : "—"} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Subtotal" value={result.subtotal != null ? `$${money(result.subtotal)}` : "—"} mono />
                <Field label="Tax" value={result.tax != null ? `$${money(result.tax)}` : "—"} mono />
                <Field label="Total" value={result.total != null ? `$${money(result.total)}` : "—"} mono strong />
              </div>
              {result.currency && <Field label="Currency" value={result.currency} />}
              {Array.isArray(result.line_items) && result.line_items.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Line Items</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b border-border/60">
                          <th className="text-left font-normal pb-1.5">Part #</th>
                          <th className="text-left font-normal pb-1.5">Description</th>
                          <th className="text-right font-normal pb-1.5">Qty</th>
                          <th className="text-right font-normal pb-1.5">Unit Cost</th>
                          <th className="text-right font-normal pb-1.5">Line Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.line_items.map((li, i) => (
                          <tr key={i} className="border-b border-border/40 last:border-0">
                            <td className="py-1.5 font-mono text-xs">{li.part_number || "—"}</td>
                            <td className="py-1.5">{li.description || "—"}</td>
                            <td className="py-1.5 text-right font-mono tabular">{li.quantity || 0}</td>
                            <td className="py-1.5 text-right font-mono tabular">${money(li.unit_cost)}</td>
                            <td className="py-1.5 text-right font-mono tabular">${money(li.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <Button onClick={saveAsExpense} data-testid="save-expense-btn" className="w-full rounded-full gap-2 mt-2">
                <CheckCircle size={18} weight="duotone" /> Save as Expense
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

const Field = ({ label, value, mono, strong }) => (
  <div>
    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
    <div className={`mt-1 ${mono ? "font-mono tabular" : ""} ${strong ? "text-lg font-medium" : "text-sm"}`}>{value}</div>
  </div>
);
