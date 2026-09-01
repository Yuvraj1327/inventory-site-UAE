import { useState, useRef } from "react";
import { api, money } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Scan, UploadSimple, CheckCircle, Receipt } from "@phosphor-icons/react";
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
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api.post("/scan-receipt", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setResult(r.data);
      toast.success("Receipt scanned");
    } catch { toast.error("Scan failed. Try another image."); }
    setLoading(false);
  };

  const saveAsExpense = async () => {
    try {
      await api.post("/transactions", {
        type: "expense",
        amount: parseFloat(result.total || 0),
        category: result.category || "Other",
        description: result.vendor || "Scanned receipt",
        party: result.vendor || "",
        date: result.date || null,
      });
      toast.success("Saved to transactions");
    } catch { toast.error("Save failed"); }
  };

  return (
    <div className="space-y-8" data-testid="scanner-page">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">AI Extraction</div>
        <h1 className="text-4xl sm:text-5xl tracking-tight font-light mt-1" style={{ fontFamily: "Manrope" }}>Receipt Scanner</h1>
        <p className="text-muted-foreground mt-2 text-sm max-w-lg">Upload a photo of a receipt or invoice — GPT-5.4 reads it and extracts the vendor, total, tax and line items.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 bg-white border-border/60 shadow-sm rounded-xl">
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

        <Card className="p-6 bg-white border-border/60 shadow-sm rounded-xl" data-testid="scan-result">
          <h3 className="text-xl font-medium mb-5" style={{ fontFamily: "Manrope" }}>Extracted Data</h3>
          {!result ? (
            <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
              <Receipt size={38} weight="duotone" />
              <p className="text-sm">Results will appear here after scanning.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <Field label="Vendor" value={result.vendor || "—"} />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Date" value={result.date || "—"} />
                <Field label="Category" value={result.category || "—"} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Tax" value={`$${money(result.tax)}`} mono />
                <Field label="Currency" value={result.currency || "USD"} />
                <Field label="Total" value={`$${money(result.total)}`} mono strong />
              </div>
              {Array.isArray(result.line_items) && result.line_items.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Line Items</div>
                  <div className="space-y-1.5">
                    {result.line_items.map((li, i) => (
                      <div key={i} className="flex justify-between text-sm border-b border-border/60 pb-1.5">
                        <span>{li.description}</span>
                        <span className="font-mono tabular">${money(li.amount)}</span>
                      </div>
                    ))}
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
