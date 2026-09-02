import { useEffect, useState } from "react";
import { api, money, fmtDate, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Plus, ChartLineUp, MagnifyingGlass, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";

const INTERVALS = ["15m", "30m", "1h", "4h", "daily"];
const emptyCheck = { supplier_id: "", part_number: "", available_qty: "", price: "", eta: "" };
const emptyTask = { supplier_id: "", part_number: "", interval: "1h" };
const num = (v) => (v === "" || v == null ? null : parseFloat(v) || 0);

export default function SupplierMonitoring() {
  const [suppliers, setSuppliers] = useState([]);
  const [checks, setChecks] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [performance, setPerformance] = useState(null);

  const [checkOpen, setCheckOpen] = useState(false);
  const [checkForm, setCheckForm] = useState(emptyCheck);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskForm, setTaskForm] = useState(emptyTask);
  const [saving, setSaving] = useState(false);

  const [comparePart, setComparePart] = useState("");
  const [compareRows, setCompareRows] = useState(null);

  const load = () => {
    api.get("/supplier-monitoring/checks").then((r) => setChecks(r.data)).catch((e) => { console.error("Failed to load price checks:", e); setChecks([]); });
    api.get("/supplier-monitoring/tasks").then((r) => setTasks(r.data)).catch((e) => { console.error("Failed to load monitoring tasks:", e); setTasks([]); });
    api.get("/supplier-monitoring/performance").then((r) => setPerformance(r.data)).catch((e) => { console.error("Failed to load supplier performance:", e); setPerformance([]); });
  };
  useEffect(() => {
    load();
    api.get("/parties?kind=supplier").then((r) => setSuppliers(r.data)).catch((e) => console.error("Failed to load suppliers:", e));
  }, []);

  const saveCheck = async () => {
    if (!checkForm.supplier_id || !checkForm.part_number) { toast.error("Supplier and part number are required"); return; }
    setSaving(true);
    try {
      await api.post("/supplier-monitoring/checks", {
        supplier_id: checkForm.supplier_id, part_number: checkForm.part_number,
        available_qty: num(checkForm.available_qty), price: num(checkForm.price), eta: checkForm.eta, source: "manual",
      });
      toast.success("Price check recorded");
      setCheckOpen(false); setCheckForm(emptyCheck); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    setSaving(false);
  };

  const saveTask = async () => {
    if (!taskForm.supplier_id || !taskForm.part_number) { toast.error("Supplier and part number are required"); return; }
    setSaving(true);
    try {
      await api.post("/supplier-monitoring/tasks", { ...taskForm, active: true });
      toast.success("Monitoring task created");
      setTaskOpen(false); setTaskForm(emptyTask); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    setSaving(false);
  };

  const toggleTask = async (task) => {
    await api.put(`/supplier-monitoring/tasks/${task._id}?active=${!task.active}`);
    load();
  };
  const removeTask = async (id) => { await api.delete(`/supplier-monitoring/tasks/${id}`); load(); };

  const runCompare = async () => {
    if (!comparePart) return;
    const r = await api.get(`/supplier-monitoring/compare/${encodeURIComponent(comparePart)}`);
    setCompareRows(r.data);
  };

  return (
    <div className="space-y-8" data-testid="supplier-monitoring-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-light tracking-tight" style={{ fontFamily: "Manrope" }}>Supplier Price Monitoring</h1>
          <p className="text-sm text-muted-foreground mt-1">Availability, price history and comparison across suppliers.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
            <DialogTrigger asChild><Button variant="outline" className="rounded-full gap-2"><Plus size={16} weight="bold" /> Monitoring Task</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New monitoring task</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Supplier</Label>
                  <Select value={taskForm.supplier_id} onValueChange={(v) => setTaskForm({ ...taskForm, supplier_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>{suppliers.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Part Number</Label><Input value={taskForm.part_number} onChange={(e) => setTaskForm({ ...taskForm, part_number: e.target.value })} /></div>
                <div>
                  <Label className="text-xs">Check interval</Label>
                  <Select value={taskForm.interval} onValueChange={(v) => setTaskForm({ ...taskForm, interval: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{INTERVALS.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
                  This schedules a check — an automated checker isn't running in this environment yet (that's the Supplier AI Agent, a later phase). Use "Record Price Check" to log results manually in the meantime.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTaskOpen(false)}>Cancel</Button>
                <Button onClick={saveTask} disabled={saving}>{saving ? "Saving…" : "Create"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={checkOpen} onOpenChange={setCheckOpen}>
            <DialogTrigger asChild><Button className="rounded-full gap-2"><Plus size={16} weight="bold" /> Record Price Check</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record a supplier price check</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Supplier</Label>
                  <Select value={checkForm.supplier_id} onValueChange={(v) => setCheckForm({ ...checkForm, supplier_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>{suppliers.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Part Number</Label><Input value={checkForm.part_number} onChange={(e) => setCheckForm({ ...checkForm, part_number: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Available Qty</Label><Input type="number" value={checkForm.available_qty} onChange={(e) => setCheckForm({ ...checkForm, available_qty: e.target.value })} /></div>
                  <div><Label className="text-xs">Price</Label><Input type="number" value={checkForm.price} onChange={(e) => setCheckForm({ ...checkForm, price: e.target.value })} /></div>
                </div>
                <div><Label className="text-xs">ETA</Label><Input value={checkForm.eta} onChange={(e) => setCheckForm({ ...checkForm, eta: e.target.value })} placeholder="e.g. Tomorrow, 3 days" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCheckOpen(false)}>Cancel</Button>
                <Button onClick={saveCheck} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-medium mb-3">Compare suppliers for a part</h2>
        <div className="flex gap-2 mb-4 max-w-md">
          <Input placeholder="Part number…" value={comparePart} onChange={(e) => setComparePart(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runCompare()} />
          <Button variant="outline" onClick={runCompare}><MagnifyingGlass size={16} /></Button>
        </div>
        {compareRows && (
          compareRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No price checks recorded for that part yet.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Supplier</TableHead><TableHead className="text-right">Price</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>ETA</TableHead><TableHead>Last Checked</TableHead></TableRow></TableHeader>
              <TableBody>
                {compareRows.map((r, i) => (
                  <TableRow key={r.supplier_id}>
                    <TableCell className="flex items-center gap-2">{r.supplier}{i === 0 && <Badge className="bg-success/15 text-success border-success/30">Best price</Badge>}</TableCell>
                    <TableCell className="text-right">{r.price != null ? money(r.price) : "—"}</TableCell>
                    <TableCell className="text-right">{r.available_qty ?? "—"}</TableCell>
                    <TableCell>{r.eta || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{fmtDate(r.checked_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="text-sm font-medium mb-3">Monitoring tasks</h2>
          {tasks === null ? <p className="text-sm text-muted-foreground">Loading…</p> : tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No monitoring tasks yet.</p>
          ) : (
            <div className="space-y-2">
              {tasks.map((t) => (
                <div key={t._id} className="flex items-center justify-between px-3 py-2 rounded-md border border-border" data-testid="monitoring-task-row">
                  <div>
                    <div className="text-sm font-medium">{t.part_number} <span className="text-muted-foreground font-normal">· {t.supplier}</span></div>
                    <div className="text-xs text-muted-foreground">Every {t.interval}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={t.active} onCheckedChange={() => toggleTask(t)} />
                    <Button variant="ghost" size="icon" onClick={() => removeTask(t._id)}><Trash size={16} /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-medium mb-3">Supplier performance</h2>
          {performance === null ? <p className="text-sm text-muted-foreground">Loading…</p> : performance.length === 0 ? (
            <p className="text-sm text-muted-foreground">No purchase history yet to compute performance from.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Supplier</TableHead><TableHead className="text-right">Fulfillment</TableHead><TableHead className="text-right">Lost Demand</TableHead></TableRow></TableHeader>
              <TableBody>
                {performance.map((p) => (
                  <TableRow key={p.supplier_id}>
                    <TableCell>{p.supplier}</TableCell>
                    <TableCell className="text-right">{p.fulfillment_rate != null ? `${p.fulfillment_rate}%` : "—"}</TableCell>
                    <TableCell className="text-right">{p.lost_demand_qty}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-medium mb-3">Recent price checks</h2>
        {checks === null ? <p className="text-sm text-muted-foreground">Loading…</p> : checks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ChartLineUp size={28} className="text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No price checks recorded yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Part Number</TableHead><TableHead>Supplier</TableHead><TableHead className="text-right">Price</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>ETA</TableHead><TableHead>Source</TableHead><TableHead>Checked</TableHead></TableRow></TableHeader>
              <TableBody>
                {checks.map((c) => (
                  <TableRow key={c._id}>
                    <TableCell className="font-mono text-xs">{c.part_number}</TableCell>
                    <TableCell>{c.supplier}</TableCell>
                    <TableCell className="text-right">{c.price != null ? money(c.price) : "—"}</TableCell>
                    <TableCell className="text-right">{c.available_qty ?? "—"}</TableCell>
                    <TableCell>{c.eta || "—"}</TableCell>
                    <TableCell><Badge variant="outline">{c.source}</Badge></TableCell>
                    <TableCell className="text-muted-foreground text-xs">{fmtDate(c.checked_at)}</TableCell>
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
