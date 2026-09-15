import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { api, money, fmtDate, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Truck, Trash, UploadSimple, Scan, X, FileText, CheckCircle, CaretUpDown, Check, FileXls } from "@phosphor-icons/react";
import { toast } from "sonner";

const emptyItem = { name: "", sku: "", qty: "", unit_cost: "" };
const emptyConfirmItem = { part_number: "", description: "", qty: "", unit_cost: "" };
const num = (v) => parseFloat(v || 0) || 0;

const STATUS_TONE = {
  pending: "bg-warning/15 text-warning border-warning/30",
  partial: "bg-warning/15 text-warning border-warning/30",
  received: "bg-success/15 text-success border-success/30",
};

export default function Purchases() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  // Quick-entry dialog (existing Phase 2 flow — goods go straight to stock)
  const [open, setOpen] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [ref, setRef] = useState("");
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [importingXlsx, setImportingXlsx] = useState(false);
  const uploadRef = useRef();
  const scanRef = useRef();
  const xlsxImportRef = useRef();

  // "Are these goods already sold?" — shown right after Save Purchase.
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [savedPurchase, setSavedPurchase] = useState(null);
  const [disposition, setDisposition] = useState("not_sold");
  const [disposeCustomer, setDisposeCustomer] = useState("");
  const [disposeQtys, setDisposeQtys] = useState({}); // part_number -> sold qty (partial only)
  const [disposing, setDisposing] = useState(false);

  // Purchase Confirmation dialog (Phase 4 — registered supplier + invoice + receiving)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmForm, setConfirmForm] = useState({ supplier_id: "", supplier_invoice_number: "", purchase_date: "", notes: "" });
  const [confirmItems, setConfirmItems] = useState([{ ...emptyConfirmItem }]);
  const [confirmFile, setConfirmFile] = useState(null);
  const [confirming, setConfirming] = useState(false);

  // Receive dialog
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receivePurchase, setReceivePurchase] = useState(null);
  const [receiveLines, setReceiveLines] = useState([]);
  const [receiveDecisions, setReceiveDecisions] = useState({}); // line_id -> {disposition, order_id, order_line_id, qty}
  const [openOrders, setOpenOrders] = useState([]);
  const [orderLinesByOrder, setOrderLinesByOrder] = useState({});
  const [receiving, setReceiving] = useState(false);

  const load = () => api.get("/purchases").then((r) => setRows(r.data)).catch(() => setRows([]));
  useEffect(() => {
    load();
    api.get("/parties?kind=supplier").then((r) => setSuppliers(r.data)).catch(() => {});
    api.get("/parties?kind=customer").then((r) => setCustomers(r.data)).catch(() => {});
    api.get("/products").then((r) => setProducts(r.data)).catch(() => {});
  }, []);

  // ---------- Quick entry (unchanged Phase 2 behavior) ----------
  const openNew = () => { setSupplier(""); setRef(""); setItems([{ ...emptyItem }]); setOpen(true); };

  // Sidebar's "New Order" (Inventory group) deep-links here with ?new=1 to
  // land straight in this same quick-entry flow instead of the plain list.
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      openNew();
      searchParams.delete("new");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const setItem = (i, key, val) => setItems(items.map((it, idx) => (idx === i ? { ...it, [key]: val } : it)));
  const addItem = () => setItems([...items, { ...emptyItem }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));
  const total = items.reduce((s, it) => s + num(it.qty) * num(it.unit_cost), 0);

  const save = async () => {
    const valid = items.filter((it) => it.name);
    if (valid.length === 0) { toast.error("Add at least one item"); return; }
    setSaving(true);
    try {
      const res = await api.post("/purchases", {
        supplier, ref,
        items: valid.map((it) => ({ name: it.name, sku: it.sku, qty: num(it.qty), unit_cost: num(it.unit_cost) })),
      });
      toast.success("Purchase recorded, stock updated");
      setOpen(false); load();
      // Ask what happened to the goods, using the purchase exactly as saved
      // (server-confirmed items, not the local draft) so quantities match.
      setSavedPurchase(res.data);
      setDisposition("not_sold");
      setDisposeCustomer("");
      setDisposeQtys({});
      setDisposeOpen(true);
    } catch { toast.error("Save failed"); }
    setSaving(false);
  };

  const remove = async (id) => { await api.delete(`/purchases/${id}`); load(); };

  // XLSX import for Quick Purchase items — Sl No, Part Number, Description, Qty, Cost.
  // Matched against the already-loaded product catalog; unmatched part
  // numbers are still added (Quick Purchase already auto-creates unknown
  // parts on save — same existing behavior, just flagged here for review).
  const importItemsXlsx = async (file) => {
    if (!file) return;
    setImportingXlsx(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      if (sheetRows.length === 0) { toast.error("The file has no rows."); setImportingXlsx(false); return; }

      const get = (row, ...keys) => {
        for (const k of keys) {
          const hit = Object.keys(row).find((rk) => rk.trim().toLowerCase() === k);
          if (hit) return row[hit];
        }
        return "";
      };
      const byPartNumber = new Map(products.map((p) => [String(p.part_number || "").toLowerCase(), p]));

      let matched = 0, unmatched = 0;
      const imported = [];
      for (const row of sheetRows) {
        const partNumber = String(get(row, "part number", "part no", "partno") ?? "").trim();
        if (!partNumber) continue;
        const qty = parseFloat(get(row, "qty", "quantity")) || 0;
        const cost = parseFloat(get(row, "cost", "unit cost")) || 0;
        let description = String(get(row, "description") ?? "").trim();
        const product = byPartNumber.get(partNumber.toLowerCase());
        if (product) { matched++; if (!description) description = product.description || ""; }
        else unmatched++;
        imported.push({ name: description || partNumber, sku: partNumber, qty: qty || "", unit_cost: cost || (product?.unit_cost ?? "") });
      }
      if (imported.length === 0) { toast.error("No valid rows found — check the Part Number column."); setImportingXlsx(false); return; }

      setItems((cur) => {
        const withoutBlank = cur.filter((it) => it.name || it.sku);
        return [...withoutBlank, ...imported];
      });
      toast.success(`Imported ${imported.length} item${imported.length === 1 ? "" : "s"} (${matched} matched to existing products${unmatched ? `, ${unmatched} new` : ""})`);
    } catch (e) {
      toast.error("Could not read that file — make sure it's a valid .xlsx.");
    }
    setImportingXlsx(false);
  };

  // ---------- "Are these goods already sold?" ----------
  const disposeItems = savedPurchase?.items || [];
  const disposeTotalQty = disposeItems.reduce((s, it) => s + (it.qty || 0), 0);

  const submitDisposition = async () => {
    if (disposition === "not_sold") { setDisposeOpen(false); return; }
    if (!disposeCustomer) { toast.error("Select a customer"); return; }
    const lines = disposeItems.map((it) => {
      const soldQty = disposition === "fully_sold" ? it.qty : num(disposeQtys[it.sku]);
      return { part_number: it.sku, description: it.name, unit_cost: it.unit_cost, qty_sold: soldQty };
    }).filter((l) => l.qty_sold > 0);
    if (lines.length === 0) { toast.error("Enter a sold quantity for at least one item"); return; }
    setDisposing(true);
    try {
      await api.post(`/purchases/${savedPurchase._id}/dispose`, { disposition, customer: disposeCustomer, lines });
      toast.success("Sale recorded — order and invoice created");
      setDisposeOpen(false);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    setDisposing(false);
  };

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
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Scan failed"); }
    setScanning(false);
  };

  // ---------- Purchase Confirmation (Phase 4) ----------
  const openConfirm = () => {
    setConfirmForm({ supplier_id: "", supplier_invoice_number: "", purchase_date: "", notes: "" });
    setConfirmItems([{ ...emptyConfirmItem }]);
    setConfirmFile(null);
    setConfirmOpen(true);
  };
  const setConfirmItem = (i, key, val) => setConfirmItems(confirmItems.map((it, idx) => (idx === i ? { ...it, [key]: val } : it)));
  const addConfirmItem = () => setConfirmItems([...confirmItems, { ...emptyConfirmItem }]);
  const removeConfirmItem = (i) => setConfirmItems(confirmItems.filter((_, idx) => idx !== i));
  const confirmTotal = confirmItems.reduce((s, it) => s + num(it.qty) * num(it.unit_cost), 0);

  const submitConfirm = async () => {
    if (!confirmForm.supplier_id) { toast.error("Select a registered supplier"); return; }
    if (!confirmForm.supplier_invoice_number.trim()) { toast.error("Supplier invoice number is required"); return; }
    const valid = confirmItems.filter((it) => it.part_number && num(it.qty) > 0);
    if (valid.length === 0) { toast.error("Add at least one line with a part number and quantity"); return; }
    setConfirming(true);
    try {
      const res = await api.post("/purchases/confirm", {
        supplier_id: confirmForm.supplier_id, supplier_invoice_number: confirmForm.supplier_invoice_number.trim(),
        purchase_date: confirmForm.purchase_date || null, notes: confirmForm.notes,
        items: valid.map((it) => ({ part_number: it.part_number, description: it.description, qty: num(it.qty), unit_cost: num(it.unit_cost) })),
      });
      if (confirmFile) {
        const fd = new FormData();
        fd.append("file", confirmFile);
        await api.post(`/purchases/${res.data._id}/upload-invoice`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      }
      toast.success("Purchase confirmed. Use \"Receive\" to record what happens to the goods.");
      setConfirmOpen(false); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    setConfirming(false);
  };

  // ---------- Receiving (No / Full / Partial) ----------
  const openReceive = async (purchase) => {
    setReceivePurchase(purchase);
    setReceiveDecisions({});
    setReceiveOpen(true);
    const pr = await api.get("/purchases");
    const full = pr.data.find((p) => p._id === purchase._id);
    setReceiveLines((full?.items || []).filter((it) => !it.disposition_decided_at));
    const ordersRes = await api.get("/orders");
    setOpenOrders(ordersRes.data);
  };

  const setDecision = (idx, patch) => setReceiveDecisions((d) => ({ ...d, [idx]: { ...d[idx], ...patch } }));

  const loadOrderLines = async (idx, orderId) => {
    setDecision(idx, { order_id: orderId, order_line_id: "" });
    if (!orderLinesByOrder[orderId]) {
      const r = await api.get(`/orders/${orderId}/lines`);
      setOrderLinesByOrder((m) => ({ ...m, [orderId]: r.data }));
    }
  };

  const submitReceive = async () => {
    const lines = receiveLines.map((li, i) => {
      const d = receiveDecisions[i] || { disposition: "none" };
      return { purchase_line_id: li.id, disposition: d.disposition || "none", order_line_id: d.order_line_id || null, qty: d.qty ? num(d.qty) : null };
    });
    setReceiving(true);
    try {
      await api.post(`/purchases/${receivePurchase._id}/receive`, { lines });
      toast.success("Goods received");
      setReceiveOpen(false); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    setReceiving(false);
  };

  return (
    <div className="space-y-8" data-testid="purchases-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">Procurement</div>
          <h1 className="text-5xl tracking-tight font-bold mt-1" style={{ fontFamily: "Manrope" }}>Purchases</h1>
          <p className="text-muted-foreground mt-2 text-sm">Quick-record a purchase, or run the full Purchase Confirmation flow with a registered supplier and invoice.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input ref={uploadRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" data-testid="upload-input" onChange={(e) => doUpload(e.target.files[0])} />
          <input ref={scanRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" data-testid="scan-input" onChange={(e) => doScan(e.target.files[0])} />
          <Button variant="secondary" onClick={() => uploadRef.current?.click()} data-testid="upload-excel-btn" className="rounded-full gap-2"><UploadSimple size={18} weight="duotone" /> Upload Excel/CSV</Button>
          <Button variant="secondary" onClick={() => scanRef.current?.click()} disabled={scanning} data-testid="scan-invoice-btn" className="rounded-full gap-2"><Scan size={18} weight="duotone" /> {scanning ? "Scanning…" : "Scan Invoice"}</Button>

          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" onClick={openConfirm} data-testid="confirm-purchase-btn" className="rounded-full gap-2"><FileText size={18} weight="duotone" /> Confirm Purchase</Button>
            </DialogTrigger>
            <DialogContent className="bg-white max-w-2xl max-h-[88vh] overflow-y-auto">
              <DialogHeader><DialogTitle style={{ fontFamily: "Manrope" }}>Confirm Purchase</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Supplier (registered) *</Label>
                  <Select value={confirmForm.supplier_id} onValueChange={(v) => setConfirmForm({ ...confirmForm, supplier_id: v })}>
                    <SelectTrigger data-testid="confirm-supplier-select" className="bg-white"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>{suppliers.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Supplier Invoice Number *</Label><Input data-testid="confirm-invoice-input" value={confirmForm.supplier_invoice_number} onChange={(e) => setConfirmForm({ ...confirmForm, supplier_invoice_number: e.target.value })} className="bg-white" /></div>
                <div><Label className="text-xs">Purchase Date</Label><Input type="date" value={confirmForm.purchase_date} onChange={(e) => setConfirmForm({ ...confirmForm, purchase_date: e.target.value })} className="bg-white" /></div>
                <div>
                  <Label className="text-xs">Invoice Document (PDF/Excel)</Label>
                  <Input type="file" accept=".pdf,.xlsx,.xls,.csv" onChange={(e) => setConfirmFile(e.target.files[0])} className="bg-white" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
                No AI extraction provider is configured in this environment, so invoice lines are entered manually below — the uploaded document is stored for reference and manual review.
              </p>
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground pt-2">Lines</div>
              <div className="space-y-2">
                {confirmItems.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <Input placeholder="Part Number" data-testid={`confirm-item-part-${i}`} value={it.part_number} onChange={(e) => setConfirmItem(i, "part_number", e.target.value)} className="col-span-3 bg-white" />
                    <Input placeholder="Description" value={it.description} onChange={(e) => setConfirmItem(i, "description", e.target.value)} className="col-span-4 bg-white" />
                    <Input placeholder="Qty" type="number" value={it.qty} onChange={(e) => setConfirmItem(i, "qty", e.target.value)} className="col-span-2 bg-white" />
                    <Input placeholder="Unit Cost" type="number" value={it.unit_cost} onChange={(e) => setConfirmItem(i, "unit_cost", e.target.value)} className="col-span-2 bg-white" />
                    <button onClick={() => removeConfirmItem(i)} className="col-span-1 text-muted-foreground hover:text-destructive flex justify-center"><X size={16} /></button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={addConfirmItem} className="gap-1.5"><Plus size={14} /> Add line</Button>
              </div>
              <div className="flex justify-end text-sm"><span className="text-muted-foreground mr-3">Total</span><span className="font-mono tabular font-medium">${money(confirmTotal)}</span></div>
              <DialogFooter><Button onClick={submitConfirm} disabled={confirming} data-testid="submit-confirm-btn" className="rounded-full">{confirming ? "Confirming…" : "Confirm Purchase"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="add-purchase-btn" onClick={openNew} className="rounded-full gap-2"><Plus size={18} weight="bold" /> Quick Purchase</Button>
            </DialogTrigger>
            <DialogContent className="bg-white max-w-2xl max-h-[88vh] overflow-y-auto">
              <DialogHeader><DialogTitle style={{ fontFamily: "Manrope" }}>Quick Purchase</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Supplier</Label>
                  <Popover open={supplierPickerOpen} onOpenChange={setSupplierPickerOpen}>
                    <PopoverTrigger asChild>
                      <button type="button" data-testid="purchase-supplier-input" role="combobox" aria-expanded={supplierPickerOpen}
                        className="w-full flex items-center justify-between h-9 px-3 rounded-md border border-input bg-white text-sm">
                        <span className={supplier ? "" : "text-muted-foreground"}>{supplier || "Search suppliers…"}</span>
                        <CaretUpDown size={14} className="shrink-0 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search suppliers…" />
                        <CommandList>
                          <CommandEmpty>No supplier found — you can still type a new name above.</CommandEmpty>
                          <CommandGroup>
                            {suppliers.map((s) => (
                              <CommandItem key={s._id} value={s.name} onSelect={() => { setSupplier(s.name); setSupplierPickerOpen(false); }}>
                                <Check size={14} className={`mr-2 ${supplier === s.name ? "opacity-100" : "opacity-0"}`} />
                                {s.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div><Label className="text-xs">Order No</Label><Input data-testid="purchase-ref-input" value={ref} onChange={(e) => setRef(e.target.value)} className="bg-white" /></div>
              </div>
              <p className="text-xs text-muted-foreground">Goods go straight into available stock. For the full confirmation + receiving workflow, use "Confirm Purchase" instead.</p>
              <div className="flex items-center justify-between pt-2">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Items</div>
                <input ref={xlsxImportRef} type="file" accept=".xlsx,.xls" className="hidden" data-testid="purchase-items-xlsx-input"
                  onChange={(e) => { importItemsXlsx(e.target.files[0]); e.target.value = ""; }} />
                <Button variant="outline" size="sm" onClick={() => xlsxImportRef.current?.click()} disabled={importingXlsx}
                  data-testid="import-items-xlsx-btn" className="gap-1.5 h-7 text-xs">
                  <FileXls size={14} /> {importingXlsx ? "Importing…" : "Import XLSX"}
                </Button>
              </div>
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
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Reference / Invoice #</TableHead>
                <TableHead>Status</TableHead>
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
                  <TableCell className="font-mono text-muted-foreground">{p.supplier_invoice_number || p.ref || "—"}</TableCell>
                  <TableCell>{p.status ? <Badge className={STATUS_TONE[p.status] || ""} variant="outline">{p.status}</Badge> : "—"}</TableCell>
                  <TableCell className="text-right">{(p.items || []).length}</TableCell>
                  <TableCell className="text-right font-mono tabular">${money(p.total)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-2 justify-end">
                      {(p.status === "pending" || p.status === "partial") && (
                        <button onClick={() => openReceive(p)} data-testid={`receive-purchase-${p._id}`}
                          title="Receive goods" className="text-muted-foreground hover:text-success transition-colors"><CheckCircle size={16} /></button>
                      )}
                      <button onClick={() => remove(p._id)} data-testid={`del-purchase-${p._id}`} className="text-muted-foreground hover:text-destructive"><Trash size={16} /></button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        )}
      </Card>

      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent className="bg-white max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle style={{ fontFamily: "Manrope" }}>Receive Goods — {receivePurchase?.supplier_invoice_number}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">For each line: were the goods sold already (Full/Partial — allocate to an order) or should they go into available stock (No)?</p>
          <div className="space-y-4">
            {receiveLines.map((li, idx) => {
              const d = receiveDecisions[idx] || { disposition: "none" };
              return (
                <div key={idx} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono">{li.sku}</span>
                    <span className="text-muted-foreground">{li.name} · Qty {li.qty}</span>
                  </div>
                  <Select value={d.disposition || "none"} onValueChange={(v) => setDecision(idx, { disposition: v })}>
                    <SelectTrigger className="bg-white w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No — to stock</SelectItem>
                      <SelectItem value="full">Full — allocate</SelectItem>
                      <SelectItem value="partial">Partial — allocate</SelectItem>
                    </SelectContent>
                  </Select>
                  {(d.disposition === "full" || d.disposition === "partial") && (
                    <div className="grid grid-cols-3 gap-2">
                      <Select value={d.order_id || ""} onValueChange={(v) => loadOrderLines(idx, v)}>
                        <SelectTrigger className="bg-white"><SelectValue placeholder="Order" /></SelectTrigger>
                        <SelectContent>{openOrders.map((o) => <SelectItem key={o._id} value={o._id}>{o.order_number} — {o.customer}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select value={d.order_line_id || ""} onValueChange={(v) => setDecision(idx, { order_line_id: v })} disabled={!d.order_id}>
                        <SelectTrigger className="bg-white"><SelectValue placeholder="Order line" /></SelectTrigger>
                        <SelectContent>{(orderLinesByOrder[d.order_id] || []).map((ol) => <SelectItem key={ol._id} value={ol._id}>{ol.part_number} (need {ol.order_qty})</SelectItem>)}</SelectContent>
                      </Select>
                      {d.disposition === "partial" && (
                        <Input type="number" placeholder="Qty to allocate" value={d.qty || ""} onChange={(e) => setDecision(idx, { qty: e.target.value })} className="bg-white" />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveOpen(false)}>Cancel</Button>
            <Button onClick={submitReceive} disabled={receiving} data-testid="submit-receive-btn">{receiving ? "Saving…" : "Confirm Receiving"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* "Are these goods already sold?" — shown right after Save Purchase */}
      <Dialog open={disposeOpen} onOpenChange={setDisposeOpen}>
        <DialogContent className="bg-white max-w-lg" data-testid="dispose-dialog">
          <DialogHeader><DialogTitle style={{ fontFamily: "Manrope" }}>Are these goods already sold?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Purchase saved — {disposeItems.length} item{disposeItems.length === 1 ? "" : "s"}, {disposeTotalQty} unit{disposeTotalQty === 1 ? "" : "s"} total.</p>

          <div className="grid grid-cols-3 gap-2">
            {[
              { key: "not_sold", label: "Not Sold" },
              { key: "partially_sold", label: "Partially Sold" },
              { key: "fully_sold", label: "Fully Sold" },
            ].map((opt) => (
              <button key={opt.key} data-testid={`dispose-option-${opt.key}`} onClick={() => setDisposition(opt.key)}
                className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${disposition === opt.key ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"}`}>
                {opt.label}
              </button>
            ))}
          </div>

          {disposition !== "not_sold" && (
            <div className="space-y-3 pt-1">
              <div>
                <Label className="text-xs">Customer *</Label>
                <Select value={disposeCustomer} onValueChange={setDisposeCustomer}>
                  <SelectTrigger data-testid="dispose-customer-select" className="bg-white"><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>{customers.map((c) => <SelectItem key={c._id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {disposition === "fully_sold" ? (
                <p className="text-xs text-muted-foreground">The full purchased quantity of every item will be sold to this customer.</p>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs">Quantity sold per item</Label>
                  {disposeItems.map((it) => (
                    <div key={it.sku || it.id} className="grid grid-cols-12 gap-2 items-center">
                      <span className="col-span-6 text-sm truncate">{it.name}</span>
                      <span className="col-span-2 text-xs text-muted-foreground text-right">of {it.qty}</span>
                      <Input type="number" min="0" max={it.qty} placeholder="0" data-testid={`dispose-qty-${it.sku}`}
                        value={disposeQtys[it.sku] || ""} onChange={(e) => setDisposeQtys((q) => ({ ...q, [it.sku]: e.target.value }))}
                        className="col-span-4 bg-white h-8" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDisposeOpen(false)}>Skip</Button>
            <Button onClick={submitDisposition} disabled={disposing} data-testid="submit-dispose-btn" className="rounded-full">
              {disposing ? "Saving…" : disposition === "not_sold" ? "Done" : "Create Sale & Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
