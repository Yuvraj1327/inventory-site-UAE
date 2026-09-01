import { useEffect, useRef, useState } from "react";
import { api, money, fmtDate } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Truck, Trash, UploadSimple, Scan, X } from "@phosphor-icons/react";
import { toast } from "sonner";

const emptyItem = { name: "", sku: "", qty: "", unit_cost: "" };
const num = (v) => parseFloat(v || 0) || 0;

export default function Purchases() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [ref, setRef] = useState("");
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const uploadRef = useRef();
  const scanRef = useRef();

  const load = () => api.get("/purchases").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  const openNew = () => { setSupplier(""); setRef(""); setItems([{ ...emptyItem }]); setOpen(true); };
  const setItem = (i, key, val) => setItems(items.map((it, idx) => (idx === i ? { ...it, [key]: val } : it)));
  const addItem = () => setItems([...items, { ...emptyItem }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));

  const total = items.reduce((s, it) => s + num(it.qty) * num(it.unit_cost), 0);

  const save = async () => {
    const valid = items.filter((it) => it.name);
    if (valid.length === 0) { toast.error("Add at least one item"); return; }
    setSaving(true);
    try {
      await api.post("/purchases", {
        supplier, ref,
        items: valid.map((it) => ({ name: it.name, sku: it.sku, qty: num(it.qty), unit_cost: num(it.unit_cost) })),
      });
      toast.success("Purchase recorded, stock updated");
      setOpen(false); load();
    } catch { toast.error("Save failed"); }
    setSaving(false);
  };

  const remove = async (id) => { await api.delete(`/purchases/${id}`); load(); };

  const doUpload = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("supplier", "");
    try {
      const r = await api.post("/purchases/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Imported ${r.data.items} items and updated stock`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Upload failed"); }
  };

  const doScan = async (file) => {
    if (!file) return;
    setScanning(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api.post("/purchases/scan", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setSupplier(r.data.supplier || "");
      setRef(r.data.ref || "");
      const its = (r.data.items || []).map((it) => ({ name: it.name || "", sku: it.sku || "", qty: it.qty || "", unit_cost: it.unit_cost || "" }));
      setItems(its.length ? its : [{ ...emptyItem }]);
      setOpen(true);
      toast.success("Invoice scanned — review and save");
    } catch { toast.error("Scan failed"); }
    setScanning(false);
  };

  return (
    <div className="space-y-8" data-testid="purchases-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">Procurement</div>
          <h1 className="text-4xl sm:text-5xl tracking-tight font-light mt-1" style={{ fontFamily: "Manrope" }}>Purchases</h1>
          <p className="text-muted-foreground mt-2 text-sm">Record supplier purchases — stock updates automatically. Upload Excel/CSV or scan an invoice.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input ref={uploadRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" data-testid="upload-input" onChange={(e) => doUpload(e.target.files[0])} />
          <input ref={scanRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" data-testid="scan-input" onChange={(e) => doScan(e.target.files[0])} />
          <Button variant="secondary" onClick={() => uploadRef.current?.click()} data-testid="upload-excel-btn" className="rounded-full gap-2"><UploadSimple size={18} weight="duotone" /> Upload Excel/CSV</Button>
          <Button variant="secondary" onClick={() => scanRef.current?.click()} disabled={scanning} data-testid="scan-invoice-btn" className="rounded-full gap-2"><Scan size={18} weight="duotone" /> {scanning ? "Scanning…" : "Scan Invoice"}</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="add-purchase-btn" onClick={openNew} className="rounded-full gap-2"><Plus size={18} weight="bold" /> New Purchase</Button>
            </DialogTrigger>
            <DialogContent className="bg-white max-w-2xl max-h-[88vh] overflow-y-auto">
              <DialogHeader><DialogTitle style={{ fontFamily: "Manrope" }}>New Purchase</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Supplier</Label><Input data-testid="purchase-supplier-input" value={supplier} onChange={(e) => setSupplier(e.target.value)} className="bg-white" /></div>
                <div><Label className="text-xs">Reference</Label><Input data-testid="purchase-ref-input" value={ref} onChange={(e) => setRef(e.target.value)} className="bg-white" /></div>
              </div>
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground pt-2">Items</div>
              <div className="space-y-2">
                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <Input placeholder="Product name" data-testid={`item-name-${i}`} value={it.name} onChange={(e) => setItem(i, "name", e.target.value)} className="col-span-4 bg-white" />
                    <Input placeholder="SKU" data-testid={`item-sku-${i}`} value={it.sku} onChange={(e) => setItem(i, "sku", e.target.value)} className="col-span-3 bg-white" />
                    <Input placeholder="Qty" type="number" data-testid={`item-qty-${i}`} value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} className="col-span-2 bg-white" />
                    <Input placeholder="Cost" type="number" data-testid={`item-cost-${i}`} value={it.unit_cost} onChange={(e) => setItem(i, "unit_cost", e.target.value)} className="col-span-2 bg-white" />
                    <button onClick={() => removeItem(i)} className="col-span-1 text-muted-foreground hover:text-destructive flex justify-center"><X size={16} /></button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={addItem} data-testid="add-item-btn" className="gap-1.5"><Plus size={14} /> Add item</Button>
              </div>
              <div className="flex justify-end text-sm"><span className="text-muted-foreground mr-3">Total</span><span className="font-mono tabular font-medium">${money(total)}</span></div>
              <DialogFooter><Button onClick={save} disabled={saving} data-testid="save-purchase-btn" className="rounded-full">{saving ? "Saving…" : "Save Purchase"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="bg-white border-border/60 shadow-sm rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-20 flex flex-col items-center gap-3 text-muted-foreground"><Truck size={40} weight="duotone" /><p className="text-sm">No purchases yet.</p></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p._id} data-testid={`purchase-row-${p._id}`}>
                  <TableCell className="text-muted-foreground">{fmtDate(p.date)}</TableCell>
                  <TableCell className="font-medium">{p.supplier || "—"}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{p.ref || "—"}</TableCell>
                  <TableCell className="text-right">{(p.items || []).length}</TableCell>
                  <TableCell className="text-right font-mono tabular">${money(p.total)}</TableCell>
                  <TableCell className="text-right">
                    <button onClick={() => remove(p._id)} data-testid={`del-purchase-${p._id}`} className="text-muted-foreground hover:text-destructive"><Trash size={16} /></button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
