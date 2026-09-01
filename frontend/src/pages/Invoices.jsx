import { useEffect, useState } from "react";
import { api, money, fmtDate } from "@/lib/api";
import { printInvoice } from "@/lib/pdf";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Receipt, Trash, FilePdf, X, PencilSimple, CheckCircle, ArrowUUpLeft, FileXls } from "@phosphor-icons/react";
import { toast } from "sonner";

const num = (v) => parseFloat(v || 0) || 0;

export default function Invoices() {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ invoice_number: "", customer: "", tax_percent: "0", status: "unpaid" });
  const [items, setItems] = useState([{ product_id: "", name: "", sku: "", qty: "1", unit_price: "" }]);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);

  const load = () => api.get("/invoices").then((r) => setRows(r.data));
  useEffect(() => {
    load();
    api.get("/products").then((r) => setProducts(r.data));
    api.get("/parties?kind=customer").then((r) => setCustomers(r.data));
  }, []);

  const openNew = () => {
    const n = `INV-${String(rows.length + 1).padStart(4, "0")}`;
    setForm({ invoice_number: n, customer: "", tax_percent: "0", status: "unpaid" });
    setItems([{ product_id: "", name: "", sku: "", qty: "1", unit_price: "" }]);
    setEditId(null);
    setOpen(true);
  };

  const openEdit = (inv) => {
    setForm({ invoice_number: inv.invoice_number, customer: inv.customer, tax_percent: String(inv.tax_percent || 0), status: inv.status });
    setItems((inv.items || []).map((it) => ({ product_id: it.product_id || "", name: it.name, sku: it.sku, qty: String(it.qty), unit_price: String(it.unit_price) })));
    setEditId(inv._id);
    setOpen(true);
  };

  const toggleStatus = async (inv) => {
    const next = inv.status === "paid" ? "unpaid" : "paid";
    await api.patch(`/invoices/${inv._id}/status`, { status: next });
    toast.success(`Marked ${next}`);
    load();
  };

  const setItem = (i, patch) => setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const pickProduct = (i, pid) => {
    const p = products.find((x) => x._id === pid);
    if (p) setItem(i, { product_id: pid, name: p.name, sku: p.sku, unit_price: p.unit_price });
  };
  const addItem = () => setItems([...items, { product_id: "", name: "", sku: "", qty: "1", unit_price: "" }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));

  const subtotal = items.reduce((s, it) => s + num(it.qty) * num(it.unit_price), 0);
  const tax = subtotal * (num(form.tax_percent) / 100);
  const total = subtotal + tax;

  const save = async () => {
    if (!form.invoice_number) { toast.error("Invoice number required"); return; }
    if (!form.customer) { toast.error("Select a customer"); return; }
    const valid = items.filter((it) => it.name && num(it.qty) > 0);
    if (valid.length === 0) { toast.error("Add at least one item"); return; }
    setSaving(true);
    try {
      const payload = {
        invoice_number: form.invoice_number, customer: form.customer,
        tax_percent: num(form.tax_percent), status: form.status,
        items: valid.map((it) => ({ product_id: it.product_id, name: it.name, sku: it.sku, qty: num(it.qty), unit_price: num(it.unit_price) })),
      };
      if (editId) await api.put(`/invoices/${editId}`, payload);
      else await api.post("/invoices", payload);
      toast.success(editId ? "Invoice updated, stock adjusted" : "Invoice created, stock adjusted");
      setOpen(false); load();
      api.get("/products").then((r) => setProducts(r.data));
    } catch (e) { toast.error(e.response?.data?.detail || "Save failed"); }
    setSaving(false);
  };

  const remove = async (id) => { await api.delete(`/invoices/${id}`); load(); };

  const downloadExcel = async (inv) => {
    try {
      const res = await api.get(`/invoices/${inv._id}/excel`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = `invoice-${inv.invoice_number}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Excel export failed"); }
  };

  return (
    <div className="space-y-8" data-testid="invoices-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">Billing</div>
          <h1 className="text-4xl sm:text-5xl tracking-tight font-light mt-1" style={{ fontFamily: "Manrope" }}>Invoices</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="add-invoice-btn" onClick={openNew} className="rounded-full gap-2"><Plus size={18} weight="bold" /> New Invoice</Button>
          </DialogTrigger>
          <DialogContent className="bg-white max-w-2xl max-h-[88vh] overflow-y-auto">
            <DialogHeader><DialogTitle style={{ fontFamily: "Manrope" }}>{editId ? "Edit Invoice" : "New Invoice"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Invoice No.</Label><Input data-testid="invoice-number-input" value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} className="bg-white" /></div>
              <div>
                <Label className="text-xs">Customer</Label>
                <Select value={form.customer} onValueChange={(v) => setForm({ ...form, customer: v })}>
                  <SelectTrigger data-testid="invoice-customer-select" className="bg-white"><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.length === 0 && <SelectItem value="none" disabled>Add customers first</SelectItem>}
                    {customers.map((c) => <SelectItem key={c._id} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground pt-2">Line Items</div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <Select value={it.product_id} onValueChange={(v) => pickProduct(i, v)}>
                      <SelectTrigger data-testid={`inv-item-product-${i}`} className="bg-white"><SelectValue placeholder="Select product" /></SelectTrigger>
                      <SelectContent>
                        {products.map((p) => <SelectItem key={p._id} value={p._id}>{p.name} ({money(p.stock)} in stock)</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input placeholder="Qty" type="number" data-testid={`inv-item-qty-${i}`} value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} className="col-span-3 bg-white" />
                  <Input placeholder="Price" type="number" data-testid={`inv-item-price-${i}`} value={it.unit_price} onChange={(e) => setItem(i, { unit_price: e.target.value })} className="col-span-3 bg-white" />
                  <button onClick={() => removeItem(i)} className="col-span-1 text-muted-foreground hover:text-destructive flex justify-center"><X size={16} /></button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={addItem} data-testid="add-inv-item-btn" className="gap-1.5"><Plus size={14} /> Add item</Button>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div><Label className="text-xs">Tax %</Label><Input data-testid="invoice-tax-input" type="number" value={form.tax_percent} onChange={(e) => setForm({ ...form, tax_percent: e.target.value })} className="bg-white" /></div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger data-testid="invoice-status-select" className="bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="unpaid">Unpaid</SelectItem><SelectItem value="paid">Paid</SelectItem></SelectContent>
                </Select>
              </div>
            </div>

            <div className="bg-muted/40 rounded-lg p-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono tabular">${money(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="font-mono tabular">${money(tax)}</span></div>
              <div className="flex justify-between font-medium pt-1 border-t border-border"><span>Total</span><span className="font-mono tabular">${money(total)}</span></div>
            </div>

            <DialogFooter><Button onClick={save} disabled={saving} data-testid="save-invoice-btn" className="rounded-full">{saving ? "Saving…" : editId ? "Update Invoice" : "Create Invoice"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-white border-border/60 shadow-sm rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-20 flex flex-col items-center gap-3 text-muted-foreground"><Receipt size={40} weight="duotone" /><p className="text-sm">No invoices yet.</p></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((inv) => (
                <TableRow key={inv._id} data-testid={`invoice-row-${inv._id}`}>
                  <TableCell className="font-mono font-medium">{inv.invoice_number}</TableCell>
                  <TableCell>{inv.customer}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(inv.date)}</TableCell>
                  <TableCell><Badge className={inv.status === "paid" ? "bg-success/15 text-success border-success/30" : "bg-warning/15 text-warning border-warning/30"} variant="outline">{inv.status}</Badge></TableCell>
                  <TableCell className="text-right font-mono tabular">${money(inv.total)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => toggleStatus(inv)} data-testid={`toggle-status-${inv._id}`}
                        className={`flex items-center gap-1.5 text-sm ${inv.status === "paid" ? "text-muted-foreground hover:text-warning" : "text-success hover:underline"}`}>
                        {inv.status === "paid" ? <><ArrowUUpLeft size={16} /> Unpay</> : <><CheckCircle size={16} weight="duotone" /> Mark Paid</>}
                      </button>
                      <button onClick={() => openEdit(inv)} data-testid={`edit-invoice-${inv._id}`} className="text-muted-foreground hover:text-primary"><PencilSimple size={16} /></button>
                      <button onClick={() => printInvoice(inv)} data-testid={`pdf-invoice-${inv._id}`} className="text-primary hover:underline flex items-center gap-1.5 text-sm"><FilePdf size={16} weight="duotone" /> PDF</button>
                      <button onClick={() => downloadExcel(inv)} data-testid={`excel-invoice-${inv._id}`} className="text-success hover:underline flex items-center gap-1.5 text-sm"><FileXls size={16} weight="duotone" /> Excel</button>
                      <button onClick={() => remove(inv._id)} title="Void (restores stock)" data-testid={`del-invoice-${inv._id}`} className="text-muted-foreground hover:text-destructive"><Trash size={16} /></button>
                    </div>
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
