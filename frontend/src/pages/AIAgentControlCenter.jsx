import { useEffect, useState } from "react";
import { api, money, fmtDate, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Robot, CheckCircle, XCircle, ChatCircleDots, Info, Warning } from "@phosphor-icons/react";
import { toast } from "sonner";

const STATUS_TONE = {
  new: "bg-warning/15 text-warning border-warning/30",
  approved: "bg-success/15 text-success border-success/30",
  contacted: "bg-primary/10 text-primary border-primary/30",
  ignored: "bg-muted text-muted-foreground border-border",
};

export default function AIAgentControlCenter() {
  const [status, setStatus] = useState(null);
  const [opportunities, setOpportunities] = useState(null);
  const [filter, setFilter] = useState("new");
  const [audit, setAudit] = useState([]);

  const [approveTarget, setApproveTarget] = useState(null);
  const [approveForm, setApproveForm] = useState({ supplier_invoice_number: "", qty: "", unit_cost: "" });
  const [approving, setApproving] = useState(false);

  const load = () => {
    api.get("/ai-agent/status").then((r) => setStatus(r.data));
    api.get(`/ai-agent/opportunities${filter ? `?status_filter=${filter}` : ""}`).then((r) => setOpportunities(r.data)).catch(() => setOpportunities([]));
    api.get("/ai-agent/audit").then((r) => setAudit(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const openApprove = (opp) => {
    setApproveTarget(opp);
    setApproveForm({ supplier_invoice_number: "", qty: String(Math.min(opp.requested_qty || opp.available_qty || 0, opp.available_qty || 0)), unit_cost: String(opp.supplier_price || "") });
  };

  const submitApprove = async () => {
    if (!approveForm.supplier_invoice_number.trim()) { toast.error("A real supplier invoice number is required to approve a purchase"); return; }
    setApproving(true);
    try {
      await api.post(`/ai-agent/opportunities/${approveTarget._id}/approve`, {
        supplier_invoice_number: approveForm.supplier_invoice_number,
        qty: parseFloat(approveForm.qty || 0), unit_cost: parseFloat(approveForm.unit_cost || 0),
      });
      toast.success("Approved — purchase created");
      setApproveTarget(null);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    setApproving(false);
  };

  const ignore = async (opp) => { await api.post(`/ai-agent/opportunities/${opp._id}/ignore`, { note: "" }); load(); };
  const contact = async (opp) => { await api.post(`/ai-agent/opportunities/${opp._id}/contact`, { note: "" }); toast.success("Marked as contacted"); load(); };

  return (
    <div className="space-y-8" data-testid="ai-agent-page">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">Phase 8</div>
        <h1 className="text-4xl sm:text-5xl tracking-tight font-light mt-1" style={{ fontFamily: "Manrope" }}>Supplier AI Control Center</h1>
        <p className="text-muted-foreground mt-2 text-sm max-w-2xl">
          Every opportunity here needs an explicit admin decision. The agent never purchases, reserves, or spends anything on its own.
        </p>
      </div>

      {status && (
        <Card className={`p-4 flex items-start gap-3 ${status.provider_configured ? "bg-warning/5 border-warning/30" : "bg-muted/50"}`}>
          {status.provider_configured ? <Warning size={20} className="text-warning shrink-0 mt-0.5" /> : <Info size={20} className="text-muted-foreground shrink-0 mt-0.5" />}
          <div className="text-sm">
            <span className="font-medium">{status.provider_configured ? "Test mode active" : "No live provider configured"}</span>
            <p className="text-muted-foreground mt-0.5">{status.message}</p>
          </div>
        </Card>
      )}

      <div className="flex items-center gap-2">
        {["new", "approved", "contacted", "ignored"].map((s) => (
          <Button key={s} size="sm" variant={filter === s ? "default" : "secondary"} onClick={() => setFilter(s)} className="rounded-full capitalize">{s}</Button>
        ))}
      </div>

      <Card className="p-5">
        {opportunities === null ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : opportunities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Robot size={32} className="text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No {filter} opportunities.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {opportunities.map((o) => (
              <div key={o._id} className="border border-border rounded-lg p-4" data-testid="opportunity-card">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-medium">{o.part_number}</span>
                      <Badge className={STATUS_TONE[o.status]} variant="outline">{o.status}</Badge>
                      <Badge variant="outline" className="text-[10px]">{o.source}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">{o.supplier} · {fmtDate(o.created_at)}</div>
                  </div>
                  {o.status === "new" && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => openApprove(o)} className="gap-1.5"><CheckCircle size={14} /> Purchase</Button>
                      <Button size="sm" variant="secondary" onClick={() => contact(o)} className="gap-1.5"><ChatCircleDots size={14} /> Contact Customer</Button>
                      <Button size="sm" variant="ghost" onClick={() => ignore(o)} className="gap-1.5"><XCircle size={14} /> Ignore</Button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-3 text-sm">
                  <div><div className="text-xs text-muted-foreground">Requested</div>{o.requested_qty ?? "—"}</div>
                  <div><div className="text-xs text-muted-foreground">Available</div>{o.available_qty ?? "—"}</div>
                  <div><div className="text-xs text-muted-foreground">Supplier Price</div>{o.supplier_price != null ? `$${money(o.supplier_price)}` : "—"}</div>
                  <div><div className="text-xs text-muted-foreground">ETA</div>{o.eta || "—"}</div>
                  <div>
                    <div className="text-xs text-muted-foreground">Est. Margin</div>
                    {o.estimated_margin_percent != null ? (
                      <span className="text-success font-medium">{o.estimated_margin_percent}% (${money(o.estimated_gross_profit)})</span>
                    ) : "—"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-medium mb-3">Agent audit history</h2>
        {audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agent actions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto"><Table>
            <TableHeader><TableRow><TableHead>Action</TableHead><TableHead>Actor</TableHead><TableHead>When</TableHead></TableRow></TableHeader>
            <TableBody>
              {audit.map((a) => (
                <TableRow key={a._id}>
                  <TableCell className="font-mono text-xs">{a.action}</TableCell>
                  <TableCell><Badge variant="outline">{a.actor_type}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-xs">{fmtDate(a.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table></div>
        )}
      </Card>

      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Approve purchase — {approveTarget?.part_number}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
            This creates a real purchase from {approveTarget?.supplier}. A supplier invoice number is required — nothing is purchased without it.
          </p>
          <div className="space-y-3">
            <div><Label className="text-xs">Supplier Invoice Number *</Label><Input value={approveForm.supplier_invoice_number} onChange={(e) => setApproveForm({ ...approveForm, supplier_invoice_number: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Qty</Label><Input type="number" value={approveForm.qty} onChange={(e) => setApproveForm({ ...approveForm, qty: e.target.value })} /></div>
              <div><Label className="text-xs">Unit Cost</Label><Input type="number" value={approveForm.unit_cost} onChange={(e) => setApproveForm({ ...approveForm, unit_cost: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>Cancel</Button>
            <Button onClick={submitApprove} disabled={approving}>{approving ? "Approving…" : "Approve & Purchase"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
