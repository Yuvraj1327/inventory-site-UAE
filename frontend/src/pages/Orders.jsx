import { useEffect, useState } from "react";
import { api, money, fmtDate, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Package, Trash, PencilSimple, CheckCircle, Warning, DownloadSimple,
  ListNumbers, LockSimple, LockSimpleOpen, ArrowsClockwise,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const OVERDUE_DAYS = 7;
const CHECK_KEYS = ["pricing_status", "pi_status", "supplier_pkl", "customer_pkl", "delivery_status"];
const daysSince = (d) => { if (!d) return 0; return Math.floor((Date.now() - new Date(d).getTime()) / 86400000); };
const progressOf = (o) => CHECK_KEYS.filter((k) => o[k]).length;
const isOverdue = (o) => progressOf(o) < 5 && daysSince(o.order_date) > OVERDUE_DAYS;

function ProgressBadge({ done }) {
  const full = done === 5;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border font-mono ${full ? "bg-success/15 text-success border-success/30" : "bg-muted text-muted-foreground border-border"}`}>
      {done}/5
    </span>
  );
}

const empty = {
  order_number: "", customer: "", supplier: "", lpo_ref: "",
  pricing_status: false, pi_status: false,
  purchasing_value: "", vat_amount: "", selling_value: "", selling_vat: "",
  discount_additional_cost: "", received_amount: "", paid_to_supplier: "",
  payment_received_status: "No", payment_paid_status: "No",
  supplier_pkl: false, customer_pkl: false, delivery_status: false,
  delivery_note: "", order_date: "", notes: "",
};

const num = (v) => parseFloat(v || 0) || 0;

const STATUS_TONE = {
  Pending: "bg-warning/15 text-warning border-warning/30",
  "In Progress": "bg-warning/15 text-warning border-warning/30",
  Sent: "bg-warning/15 text-warning border-warning/30",
  Partial: "bg-warning/15 text-warning border-warning/30",
  Approved: "bg-success/15 text-success border-success/30",
  Confirmed: "bg-success/15 text-success border-success/30",
  Done: "bg-success/15 text-success border-success/30",
  Delivered: "bg-success/15 text-success border-success/30",
};

function StatusBadge({ value }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const tone = STATUS_TONE[value] || "bg-muted text-muted-foreground border-border";
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] border ${tone}`}>{value}</span>;
}

function EditableAmount({ value, onSave, testid }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  useEffect(() => setVal(value), [value]);
  if (editing) {
    return (
      <input
        autoFocus type="number" value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => { setEditing(false); const n = num(val); if (n !== value) onSave(n); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") { setVal(value); setEditing(false); } }}
        data-testid={testid}
        className="w-20 text-right font-mono tabular bg-accent border border-primary/40 rounded px-1.5 py-0.5 outline-none"
      />
    );
  }
  return (
    <button onClick={() => setEditing(true)} data-testid={testid}
      className="font-mono tabular hover:text-primary underline underline-offset-4 decoration-dashed decoration-border">
      {money(value)}
    </button>
  );
}

function Check({ value }) {
  return value
    ? <CheckCircle size={18} weight="fill" className="text-success mx-auto block" />
    : <span className="text-muted-foreground block text-center">—</span>;
}

const num_cols = "text-right font-mono tabular whitespace-nowrap";

export default function Orders() {
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [carrying, setCarrying] = useState(false);
  const [linesOpen, setLinesOpen] = useState(false);
  const [linesOrder, setLinesOrder] = useState(null);
  const [lines, setLines] = useState([]);
  const [lineForm, setLineForm] = useState({ part_number: "", order_qty: "" });
  const [addingLine, setAddingLine] = useState(false);

  const load = () => {
    const url = showClosed ? "/orders/closed" : "/orders";
    api.get(url).then((r) => setRows(r.data));
  };
  useEffect(() => {
    load();
    api.get("/parties?kind=customer").then((r) => setCustomers(r.data));
    api.get("/parties?kind=supplier").then((r) => setSuppliers(r.data));
  }, [showClosed]); // eslint-disable-line react-hooks/exhaustive-deps

  const overdue = rows.filter(isOverdue);

  const runCarryForward = async () => {
    setCarrying(true);
    try {
      const r = await api.post("/orders/carry-forward");
      toast.success(`Carried forward ${r.data.carried_forward} order(s) into this month`);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    setCarrying(false);
  };

  const closeOrder = async (o) => {
    try {
      await api.post(`/orders/${o._id}/close`);
      toast.success(`Order ${o.order_number} closed`);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const reopenOrder = async (o) => {
    try {
      await api.post(`/orders/${o._id}/reopen`);
      toast.success(`Order ${o.order_number} reopened`);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const openLines = async (o) => {
    setLinesOrder(o);
    setLineForm({ part_number: "", order_qty: "" });
    setLinesOpen(true);
    const r = await api.get(`/orders/${o._id}/lines`);
    setLines(r.data);
  };
  const addLine = async () => {
    if (!lineForm.part_number || !lineForm.order_qty) { toast.error("Part number and Order Qty are required"); return; }
    setAddingLine(true);
    try {
      await api.post(`/orders/${linesOrder._id}/lines`, { part_number: lineForm.part_number, order_qty: num(lineForm.order_qty) });
      setLineForm({ part_number: "", order_qty: "" });
      const r = await api.get(`/orders/${linesOrder._id}/lines`);
      setLines(r.data);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    setAddingLine(false);
  };
  const updateLine = async (line, patch) => {
    try {
      await api.put(`/orders/${linesOrder._id}/lines/${line._id}`, patch);
      const r = await api.get(`/orders/${linesOrder._id}/lines`);
      setLines(r.data);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const removeLine = async (line) => {
    await api.delete(`/orders/${linesOrder._id}/lines/${line._id}`);
    const r = await api.get(`/orders/${linesOrder._id}/lines`);
    setLines(r.data);
  };

  const payloadFrom = (f) => {
    const sale = num(f.selling_value) + num(f.selling_vat);
    const supp = num(f.purchasing_value) + num(f.vat_amount);
    const recv = f.payment_received_status === "Yes" ? sale : f.payment_received_status === "Partially" ? num(f.received_amount) : 0;
    const paid = f.payment_paid_status === "Yes" ? supp : f.payment_paid_status === "Partially" ? num(f.paid_to_supplier) : 0;
    return {
      order_number: f.order_number, customer: f.customer, supplier: f.supplier, lpo_ref: f.lpo_ref,
      pricing_status: f.pricing_status ? "Done" : "", pi_status: f.pi_status ? "Done" : "",
      purchasing_value: num(f.purchasing_value), vat_amount: num(f.vat_amount),
      selling_value: num(f.selling_value), selling_vat: num(f.selling_vat),
      discount_additional_cost: num(f.discount_additional_cost),
      received_amount: recv, paid_to_supplier: paid,
      payment_received_status: f.payment_received_status, payment_paid_status: f.payment_paid_status,
      supplier_pkl: f.supplier_pkl ? "Received" : "", customer_pkl: f.customer_pkl ? "Received" : "",
      delivery_status: f.delivery_status ? "Delivered" : "", delivery_note: f.delivery_note,
      order_date: f.order_date || null, notes: f.notes, status: "open",
    };
  };

  const openNew = () => { setForm(empty); setEditId(null); setOpen(true); };
  const openEdit = (o) => {
    setForm({
      ...empty, ...o,
      order_date: o.order_date ? o.order_date.slice(0, 10) : "",
      purchasing_value: o.purchasing_value ?? "", vat_amount: o.vat_amount ?? "",
      selling_value: o.selling_value ?? "", selling_vat: o.selling_vat ?? "",
      discount_additional_cost: o.discount_additional_cost ?? "",
      received_amount: o.received_amount ?? "", paid_to_supplier: o.paid_to_supplier ?? "",
      payment_received_status: o.payment_received_status || "No", payment_paid_status: o.payment_paid_status || "No",
      pricing_status: !!o.pricing_status, pi_status: !!o.pi_status,
      supplier_pkl: !!o.supplier_pkl, customer_pkl: !!o.customer_pkl,
      delivery_status: !!o.delivery_status,
    });
    setEditId(o._id);
    setOpen(true);
  };

  const save = async () => {
    if (!form.order_number) { toast.error("Order number is required"); return; }
    setSaving(true);
    try {
      if (editId) await api.put(`/orders/${editId}`, payloadFrom(form));
      else await api.post("/orders", payloadFrom(form));
      toast.success(editId ? "Order updated" : "Order saved");
      setOpen(false); setForm(empty); setEditId(null); load();
    } catch { toast.error("Save failed"); }
    setSaving(false);
  };

  const remove = async (id) => { await api.delete(`/orders/${id}`); load(); };

  const exportCsv = () => {
    const cols = [
      ["Order No.", (o) => o.order_number],
      ["Customer", (o) => o.customer],
      ["Supplier", (o) => o.supplier],
      ["LPO Ref", (o) => o.lpo_ref],
      ["Progress", (o) => `${progressOf(o)}/5`],
      ["Pricing", (o) => (o.pricing_status ? "Done" : "")],
      ["PI", (o) => (o.pi_status ? "Done" : "")],
      ["Purchasing Value", (o) => o.purchasing_value || 0],
      ["VAT Amount", (o) => o.vat_amount || 0],
      ["PV+VAT", (o) => (o.purchasing_value || 0) + (o.vat_amount || 0)],
      ["Selling Value", (o) => o.selling_value || 0],
      ["Selling VAT", (o) => o.selling_vat || 0],
      ["Sell+VAT", (o) => (o.selling_value || 0) + (o.selling_vat || 0)],
      ["Discount/Additional", (o) => o.discount_additional_cost || 0],
      ["VAT Variance", (o) => (o.selling_vat || 0) - (o.vat_amount || 0)],
      ["Profit %", (o) => (o.purchasing_value ? (((o.selling_value || 0) - (o.purchasing_value || 0) - (o.discount_additional_cost || 0)) / o.purchasing_value * 100).toFixed(1) : "0")],
      ["Payments", (o) => o.received_amount || 0],
      ["Paid to Supplier", (o) => o.paid_to_supplier || 0],
      ["Supplier PKL", (o) => (o.supplier_pkl ? "Yes" : "")],
      ["Customer PKL", (o) => (o.customer_pkl ? "Yes" : "")],
      ["Delivered", (o) => (o.delivery_status ? "Yes" : "")],
      ["Delivery Note", (o) => o.delivery_note],
      ["Order Date", (o) => (o.order_date ? o.order_date.slice(0, 10) : "")],
    ];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [cols.map((c) => esc(c[0])).join(",")];
    rows.forEach((o) => lines.push(cols.map((c) => esc(c[1](o))).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const savePayment = async (order, field, value) => {
    await api.put(`/orders/${order._id}`, { ...payloadFrom({ ...empty, ...order }), [field]: value });
    toast.success("Payment updated");
    load();
  };

  // live computed preview
  const c = {
    pvVat: num(form.purchasing_value) + num(form.vat_amount),
    sellVat: num(form.selling_value) + num(form.selling_vat),
    vatVar: num(form.selling_vat) - num(form.vat_amount),
    profit: num(form.selling_value) - num(form.purchasing_value) - num(form.discount_additional_cost),
  };
  c.profitPct = num(form.purchasing_value) ? (c.profit / num(form.purchasing_value)) * 100 : 0;

  const Num = (key, label) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input data-testid={`order-${key}-input`} type="number" value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="bg-white" />
    </div>
  );
  const Txt = (key, label) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input data-testid={`order-${key}-input`} value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="bg-white" />
    </div>
  );
  const Sel = (key, label, options) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={form[key]} onValueChange={(v) => setForm({ ...form, [key]: v })}>
        <SelectTrigger data-testid={`order-${key}-select`} className="bg-white"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
  const Chk = (key, label) => (
    <label className="flex items-center gap-2.5 py-2.5 px-3 rounded-md border border-border bg-white cursor-pointer hover:bg-accent/50 transition-colors">
      <Checkbox checked={form[key]} onCheckedChange={(v) => setForm({ ...form, [key]: !!v })} data-testid={`order-${key}-checkbox`} />
      <span className="text-sm">{label}</span>
    </label>
  );

  return (
    <div className="space-y-8" data-testid="orders-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">Order Tracking</div>
          <h1 className="text-4xl sm:text-5xl tracking-tight font-light mt-1" style={{ fontFamily: "Manrope" }}>Orders Follow-Up</h1>
          <p className="text-muted-foreground mt-2 text-sm">Full order follow-up. Scroll sideways to see every field. Click Payments to edit inline.</p>
        </div>
        <div className="flex items-center gap-2">
        <Button variant={showClosed ? "default" : "secondary"} onClick={() => setShowClosed((s) => !s)} data-testid="toggle-closed-btn" className="rounded-full gap-2">
          {showClosed ? <LockSimple size={16} weight="duotone" /> : <LockSimpleOpen size={16} weight="duotone" />} {showClosed ? "Closed Orders" : "Active Orders"}
        </Button>
        <Button variant="secondary" onClick={runCarryForward} disabled={carrying} data-testid="carry-forward-btn" className="rounded-full gap-2">
          <ArrowsClockwise size={16} weight="duotone" className={carrying ? "animate-spin" : ""} /> Carry Forward
        </Button>
        <Button variant="secondary" onClick={exportCsv} data-testid="export-csv-btn" className="rounded-full gap-2">
          <DownloadSimple size={18} weight="duotone" /> Export CSV
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="add-order-btn" onClick={openNew} className="rounded-full gap-2"><Plus size={18} weight="bold" /> New Order</Button>
          </DialogTrigger>
          <DialogContent className="bg-white max-w-2xl max-h-[88vh] overflow-y-auto">
            <DialogHeader><DialogTitle style={{ fontFamily: "Manrope" }}>{editId ? "Edit Order" : "New Order"}</DialogTitle></DialogHeader>

            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground pt-1">Details</div>
            <div className="grid grid-cols-2 gap-3">
              {Txt("order_number", "Order No.")}
              {Txt("lpo_ref", "LPO Ref (auto from customer)")}
              <div>
                <Label className="text-xs">Customer Name</Label>
                <Input list="order-customers" data-testid="order-customer-input" value={form.customer}
                  onChange={(e) => {
                    const name = e.target.value;
                    const cust = customers.find((x) => x.name === name);
                    setForm({ ...form, customer: name, lpo_ref: cust ? (cust.lpo || form.lpo_ref) : form.lpo_ref });
                  }} className="bg-white" placeholder="Search customer" />
                <datalist id="order-customers">{customers.map((c) => <option key={c._id} value={c.name} />)}</datalist>
              </div>
              <div>
                <Label className="text-xs">Supplier</Label>
                <Input list="order-suppliers" data-testid="order-supplier-input" value={form.supplier}
                  onChange={(e) => setForm({ ...form, supplier: e.target.value })} className="bg-white" placeholder="Search supplier" />
                <datalist id="order-suppliers">{suppliers.map((s) => <option key={s._id} value={s.name} />)}</datalist>
              </div>
              <div>
                <Label className="text-xs">Order Date</Label>
                <Input data-testid="order-order_date-input" type="date" value={form.order_date}
                  onChange={(e) => setForm({ ...form, order_date: e.target.value })} className="bg-white" />
              </div>
            </div>

            {editId && (
              <>
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground pt-2">Status Checklist</div>
                <div className="grid grid-cols-2 gap-3">
                  {Chk("pricing_status", "Pricing done")}
                  {Chk("pi_status", "PI done")}
                  {Chk("supplier_pkl", "Supplier PKL")}
                  {Chk("customer_pkl", "Customer PKL")}
                  {Chk("delivery_status", "Delivered")}
                  {Txt("delivery_note", "Delivery Note")}
                </div>
              </>
            )}

            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground pt-2">Financials (VAT auto 5%)</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Purchasing Value</Label>
                <Input data-testid="order-purchasing_value-input" type="number" value={form.purchasing_value}
                  onChange={(e) => { const v = e.target.value; setForm({ ...form, purchasing_value: v, vat_amount: v ? (num(v) * 0.05).toFixed(2) : "" }); }} className="bg-white" />
              </div>
              <div>
                <Label className="text-xs">VAT Amount (5%)</Label>
                <Input data-testid="order-vat_amount-input" type="number" value={form.vat_amount} disabled className="bg-muted/50 text-muted-foreground" />
              </div>
              <div>
                <Label className="text-xs">Selling Value</Label>
                <Input data-testid="order-selling_value-input" type="number" value={form.selling_value}
                  onChange={(e) => { const v = e.target.value; setForm({ ...form, selling_value: v, selling_vat: v ? (num(v) * 0.05).toFixed(2) : "" }); }} className="bg-white" />
              </div>
              <div>
                <Label className="text-xs">Selling VAT (5%)</Label>
                <Input data-testid="order-selling_vat-input" type="number" value={form.selling_vat} disabled className="bg-muted/50 text-muted-foreground" />
              </div>
              {Num("discount_additional_cost", "Discount / Additional Cost")}
              <div></div>
              {Sel("payment_received_status", "Payment Received", ["No", "Yes", "Partially"])}
              {form.payment_received_status === "Partially"
                ? Num("received_amount", "Amount Received")
                : <div></div>}
              {Sel("payment_paid_status", "Payment Paid", ["No", "Yes", "Partially"])}
              {form.payment_paid_status === "Partially"
                ? Num("paid_to_supplier", "Amount Paid")
                : <div></div>}
            </div>

            <div className="grid grid-cols-4 gap-2 mt-1 bg-muted/40 rounded-lg p-3 text-center">
              <Mini label="PV + VAT" value={money(c.pvVat)} />
              <Mini label="Sell + VAT" value={money(c.sellVat)} />
              <Mini label="VAT Var." value={money(c.vatVar)} />
              <Mini label="Profit %" value={`${c.profitPct.toFixed(1)}%`} tone={c.profit >= 0 ? "up" : "down"} />
            </div>

            <DialogFooter>
              <Button onClick={save} disabled={saving} data-testid="save-order-btn" className="rounded-full">
                {saving ? "Saving…" : editId ? "Update Order" : "Save Order"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {overdue.length > 0 && (
        <div data-testid="overdue-alert" className="flex items-center gap-3 px-5 py-4 rounded-xl border border-destructive/30 bg-destructive/5">
          <Warning size={22} weight="duotone" className="text-destructive shrink-0" />
          <p className="text-sm">
            <span className="font-medium text-destructive">{overdue.length} order{overdue.length > 1 ? "s" : ""}</span>
            <span className="text-muted-foreground"> incomplete for more than {OVERDUE_DAYS} days since the order date — needs attention.</span>
          </p>
        </div>
      )}

      <Card className="bg-white border-border/60 shadow-sm rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-20 flex flex-col items-center gap-3 text-muted-foreground">
            <Package size={40} weight="duotone" />
            <p className="text-sm">{showClosed ? "No closed orders yet." : "No active orders yet."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-white z-10">Order No.</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>LPO Ref</TableHead>
                  <TableHead>Pricing</TableHead>
                  <TableHead>PI</TableHead>
                  <TableHead className="text-right">Purch. Value</TableHead>
                  <TableHead className="text-right">VAT Amt</TableHead>
                  <TableHead className="text-right">PV + VAT</TableHead>
                  <TableHead className="text-right">Selling Value</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                  <TableHead className="text-right">Sell + VAT</TableHead>
                  <TableHead className="text-right">Disc./Add.</TableHead>
                  <TableHead className="text-right">VAT Var.</TableHead>
                  <TableHead className="text-right">Profit %</TableHead>
                  <TableHead className="text-right">Payments</TableHead>
                  <TableHead>Supp. PKL</TableHead>
                  <TableHead>Cust. PKL</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Del. Note</TableHead>
                  <TableHead className="text-center">Closed</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((o) => {
                  const pv = o.purchasing_value || 0, vat = o.vat_amount || 0;
                  const sv = o.selling_value || 0, svat = o.selling_vat || 0;
                  const disc = o.discount_additional_cost || 0;
                  const profit = sv - pv - disc;
                  const pct = pv ? (profit / pv) * 100 : 0;
                  const done = progressOf(o);
                  const over = isOverdue(o);
                  return (
                    <TableRow key={o._id} data-testid={`order-row-${o._id}`}
                      className={over ? "bg-destructive/5 hover:bg-destructive/10" : ""}>
                      <TableCell className={`sticky left-0 z-10 font-mono font-medium whitespace-nowrap ${over ? "bg-[#fbf0f0]" : "bg-white"}`}>
                        <span className="inline-flex items-center gap-1.5">
                          {over && <Warning size={14} weight="fill" className="text-destructive" />}
                          {o.order_number}
                        </span>
                      </TableCell>
                      <TableCell><ProgressBadge done={done} /></TableCell>
                      <TableCell className="whitespace-nowrap">{o.customer || "—"}</TableCell>
                      <TableCell className="font-mono whitespace-nowrap">{o.lpo_ref || "—"}</TableCell>
                      <TableCell><Check value={o.pricing_status} /></TableCell>
                      <TableCell><Check value={o.pi_status} /></TableCell>
                      <TableCell className={num_cols}>{money(pv)}</TableCell>
                      <TableCell className={num_cols}>{money(vat)}</TableCell>
                      <TableCell className={num_cols}>{money(pv + vat)}</TableCell>
                      <TableCell className={num_cols}>{money(sv)}</TableCell>
                      <TableCell className={num_cols}>{money(svat)}</TableCell>
                      <TableCell className={num_cols}>{money(sv + svat)}</TableCell>
                      <TableCell className={num_cols}>{money(disc)}</TableCell>
                      <TableCell className={num_cols}>{money(svat - vat)}</TableCell>
                      <TableCell className={`${num_cols} font-medium ${pct >= 0 ? "text-success" : "text-destructive"}`}>{pct.toFixed(1)}%</TableCell>
                      <TableCell className="text-right text-success whitespace-nowrap">
                        <EditableAmount value={o.received_amount || 0} testid={`edit-received-${o._id}`}
                          onSave={(v) => savePayment(o, "received_amount", v)} />
                      </TableCell>
                      <TableCell><Check value={o.supplier_pkl} /></TableCell>
                      <TableCell><Check value={o.customer_pkl} /></TableCell>
                      <TableCell><Check value={o.delivery_status} /></TableCell>
                      <TableCell className="whitespace-nowrap max-w-[140px] truncate" title={o.delivery_note}>{o.delivery_note || "—"}</TableCell>
                      <TableCell className="text-center">
                        {o.status === "closed" ? (
                          <button onClick={() => reopenOrder(o)} data-testid={`reopen-order-${o._id}`}
                            title="Reopen order" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                            <LockSimple size={16} weight="fill" /> Closed
                          </button>
                        ) : (
                          <button onClick={() => closeOrder(o)} data-testid={`close-order-${o._id}`}
                            title="Close order" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-success transition-colors">
                            <LockSimpleOpen size={16} /> Close
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openLines(o)} data-testid={`lines-order-${o._id}`}
                            title="Order lines" className="text-muted-foreground hover:text-primary transition-colors"><ListNumbers size={16} /></button>
                          <button onClick={() => openEdit(o)} data-testid={`edit-order-${o._id}`}
                            className="text-muted-foreground hover:text-primary transition-colors"><PencilSimple size={16} /></button>
                          <button onClick={() => remove(o._id)} data-testid={`del-order-${o._id}`}
                            className="text-muted-foreground hover:text-destructive transition-colors"><Trash size={16} /></button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog open={linesOpen} onOpenChange={setLinesOpen}>
        <DialogContent className="bg-white max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle style={{ fontFamily: "Manrope" }}>Order Lines — {linesOrder?.order_number}</DialogTitle></DialogHeader>

          <div className="flex items-end gap-3 bg-muted/40 rounded-lg p-3">
            <div className="flex-1">
              <Label className="text-xs">Part Number</Label>
              <Input value={lineForm.part_number} onChange={(e) => setLineForm({ ...lineForm, part_number: e.target.value })} className="bg-white" data-testid="line-part-input" />
            </div>
            <div className="w-32">
              <Label className="text-xs">Order Qty</Label>
              <Input type="number" value={lineForm.order_qty} onChange={(e) => setLineForm({ ...lineForm, order_qty: e.target.value })} className="bg-white" data-testid="line-qty-input" />
            </div>
            <Button onClick={addLine} disabled={addingLine} data-testid="add-line-btn">{addingLine ? "Adding…" : "Add Line"}</Button>
          </div>
          <p className="text-xs text-muted-foreground">Description, brand, availability and your customer's price are filled in automatically from the part number.</p>

          {lines.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No lines yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead><TableHead>Part Number</TableHead><TableHead>Description</TableHead>
                    <TableHead className="text-right">Order Qty</TableHead><TableHead className="text-right">Confirm Qty</TableHead>
                    <TableHead className="text-right">Cancelled Qty</TableHead><TableHead className="text-right">Shipped Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead><TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead><TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((li) => (
                    <TableRow key={li._id}>
                      <TableCell>{li.line_no}</TableCell>
                      <TableCell className="font-mono">{li.part_number}</TableCell>
                      <TableCell className="max-w-[160px] truncate" title={li.description}>{li.description || "—"}</TableCell>
                      <TableCell className="text-right">{li.order_qty}</TableCell>
                      <TableCell className="text-right">
                        <Input type="number" defaultValue={li.confirm_qty} className="w-16 h-7 text-right"
                          onBlur={(e) => num(e.target.value) !== li.confirm_qty && updateLine(li, { confirm_qty: num(e.target.value) })} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" defaultValue={li.cancelled_qty} className="w-16 h-7 text-right"
                          onBlur={(e) => num(e.target.value) !== li.cancelled_qty && updateLine(li, { cancelled_qty: num(e.target.value) })} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" defaultValue={li.shipped_qty} className="w-16 h-7 text-right"
                          onBlur={(e) => num(e.target.value) !== li.shipped_qty && updateLine(li, { shipped_qty: num(e.target.value) })} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" defaultValue={li.unit_selling_price} className="w-20 h-7 text-right"
                          onBlur={(e) => num(e.target.value) !== li.unit_selling_price && updateLine(li, { unit_selling_price: num(e.target.value) })} />
                      </TableCell>
                      <TableCell className="text-right font-mono tabular">{money(li.amount)}</TableCell>
                      <TableCell><Badge variant="outline">{li.status}</Badge></TableCell>
                      <TableCell>
                        <button onClick={() => removeLine(li)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash size={14} /></button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinesOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Mini = ({ label, value, tone }) => (
  <div>
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className={`text-sm font-mono tabular ${tone === "up" ? "text-success" : tone === "down" ? "text-destructive" : ""}`}>{value}</div>
  </div>
);
