import { useEffect, useState } from "react";
import { api, fmtDate, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash, TrendDown } from "@phosphor-icons/react";
import { toast } from "sonner";

const empty = { customer: "", part_number: "", requested_qty: "", supplied_qty: "0", supplier: "", supplier_response: "", reason: "", date: "" };
const num = (v) => parseFloat(v || 0) || 0;

export default function LostSales() {
  const [rows, setRows] = useState(null); // null = loading
  const [demand, setDemand] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = () => api.get("/lost-sales").then((r) => setRows(r.data)).catch((e) => {
    // eslint-disable-next-line no-console
    console.error("Failed to load lost sales:", e);
    setRows([]);
  });
  const loadDemand = () => api.get("/lost-sales/demand-summary").then((r) => setDemand(r.data)).catch((e) => {
    // eslint-disable-next-line no-console
    console.error("Failed to load demand summary:", e);
    setDemand([]);
  });
  useEffect(() => { load(); loadDemand(); }, []);

  const openNew = () => { setForm(empty); setOpen(true); };

  const save = async () => {
    if (!form.part_number) { toast.error("Part number is required"); return; }
    if (!form.requested_qty || num(form.requested_qty) <= 0) { toast.error("Requested quantity must be greater than 0"); return; }
    setSaving(true);
    try {
      await api.post("/lost-sales", {
        customer: form.customer, part_number: form.part_number,
        requested_qty: num(form.requested_qty), supplied_qty: num(form.supplied_qty),
        supplier: form.supplier, supplier_response: form.supplier_response,
        reason: form.reason, date: form.date || null,
      });
      toast.success("Lost sale recorded");
      setOpen(false); load(); loadDemand();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    setSaving(false);
  };

  const remove = async (id) => { await api.delete(`/lost-sales/${id}`); load(); };

  const filtered = (rows || []).filter((r) =>
    !search || r.part_number?.toLowerCase().includes(search.toLowerCase()) || r.customer?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8" data-testid="lost-sales-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-light tracking-tight" style={{ fontFamily: "Manrope" }}>Lost Sales &amp; Demand</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Requests you couldn't fully supply — tracked separately from completed sales, used for stock &amp; purchasing decisions.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="rounded-full gap-2" data-testid="lost-sale-new">
              <Plus size={16} weight="bold" /> Record Lost Sale
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Record a lost sale</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Customer</Label><Input value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} /></div>
                <div><Label className="text-xs">Part Number *</Label><Input value={form.part_number} onChange={(e) => setForm({ ...form, part_number: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Requested Qty *</Label><Input type="number" value={form.requested_qty} onChange={(e) => setForm({ ...form, requested_qty: e.target.value })} /></div>
                <div><Label className="text-xs">Supplied Qty</Label><Input type="number" value={form.supplied_qty} onChange={(e) => setForm({ ...form, supplied_qty: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Supplier Checked</Label><Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></div>
                <div><Label className="text-xs">Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              </div>
              <div><Label className="text-xs">Supplier Response</Label><Input value={form.supplier_response} onChange={(e) => setForm({ ...form, supplier_response: e.target.value })} placeholder="e.g. Out of stock, 2 week ETA" /></div>
              <div><Label className="text-xs">Reason</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
              <div className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
                Lost qty = Requested − Supplied = <span className="font-mono">{Math.max(num(form.requested_qty) - num(form.supplied_qty), 0)}</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-medium mb-3">Demand summary by part <span className="text-xs font-normal text-muted-foreground">— for stock/purchasing decisions</span></h2>
        {demand === null ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
        ) : demand.length === 0 ? (
          <p className="text-sm text-muted-foreground">No demand recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Part Number</TableHead><TableHead className="text-right">Total Requested</TableHead><TableHead className="text-right">Total Lost</TableHead><TableHead className="text-right">Occurrences</TableHead></TableRow></TableHeader>
              <TableBody>
                {demand.map((d) => (
                  <TableRow key={d.part_number} data-testid="demand-summary-row">
                    <TableCell className="font-mono text-xs">{d.part_number}</TableCell>
                    <TableCell className="text-right">{d.total_requested}</TableCell>
                    <TableCell className="text-right"><Badge className="bg-destructive/15 text-destructive border-destructive/30">{d.total_lost}</Badge></TableCell>
                    <TableCell className="text-right">{d.occurrences}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <Input placeholder="Search by part number or customer…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm mb-4" data-testid="lost-sales-search" />

        {rows === null ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <TrendDown size={32} className="text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No lost sales recorded yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Part Number</TableHead>
                  <TableHead className="text-right">Requested</TableHead>
                  <TableHead className="text-right">Supplied</TableHead>
                  <TableHead className="text-right">Lost</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r._id} data-testid="lost-sale-row">
                    <TableCell className="text-muted-foreground">{fmtDate(r.occurred_on)}</TableCell>
                    <TableCell>{r.customer || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.part_number}</TableCell>
                    <TableCell className="text-right">{r.requested_qty}</TableCell>
                    <TableCell className="text-right">{r.supplied_qty}</TableCell>
                    <TableCell className="text-right"><Badge className="bg-destructive/15 text-destructive border-destructive/30">{r.lost_qty}</Badge></TableCell>
                    <TableCell>{r.supplier || "—"}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[220px] truncate">{r.reason || r.supplier_response || "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => remove(r._id)} data-testid="lost-sale-delete">
                        <Trash size={16} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
