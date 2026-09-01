import { useEffect, useState } from "react";
import { api, money, fmtDate } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BellRinging, Sparkle, Copy, CheckCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Reminders() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);
  const [draft, setDraft] = useState("");
  const [drafting, setDrafting] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/reminders").then((r) => setRows(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);

  const openDraft = async (row) => {
    setActive(row);
    setDraft("");
    setOpen(true);
    setDrafting(true);
    try {
      const r = await api.post("/reminders/draft", { customer: row.customer, outstanding: row.outstanding, tone: "friendly" });
      setDraft(r.data.message);
    } catch { toast.error("Failed to draft message"); }
    setDrafting(false);
  };

  const copy = () => {
    navigator.clipboard.writeText(draft);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="space-y-8" data-testid="reminders-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">Collections</div>
          <h1 className="text-4xl sm:text-5xl tracking-tight font-light mt-1" style={{ fontFamily: "Manrope" }}>Payment Reminders</h1>
          <p className="text-muted-foreground mt-2 text-sm">Customers with outstanding balances. Let AI draft a friendly follow-up.</p>
        </div>
        <Card className="px-6 py-4 bg-white border-border/60 shadow-sm rounded-xl">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Total Outstanding</div>
          <div className="text-2xl font-mono tabular text-destructive">${money(totalOutstanding)}</div>
        </Card>
      </div>

      <Card className="bg-white border-border/60 shadow-sm rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-muted-foreground text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-20 flex flex-col items-center gap-3 text-muted-foreground">
            <CheckCircle size={40} weight="duotone" className="text-success" />
            <p className="text-sm">All caught up — no customers owe you money.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Open Orders</TableHead>
                <TableHead>Last Order</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.customer} data-testid={`reminder-row-${r.customer}`}>
                  <TableCell className="font-medium">{r.customer}</TableCell>
                  <TableCell><Badge variant="secondary" className="font-normal">{r.orders}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(r.last_date)}</TableCell>
                  <TableCell className="text-right font-mono tabular text-destructive">${money(r.outstanding)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="secondary" onClick={() => openDraft(r)}
                      data-testid={`draft-btn-${r.customer}`} className="gap-1.5 rounded-full">
                      <Sparkle size={15} weight="duotone" /> Draft Reminder
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-white max-w-lg" data-testid="draft-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Manrope" }} className="flex items-center gap-2">
              <Sparkle size={20} weight="duotone" /> Reminder for {active?.customer}
            </DialogTitle>
          </DialogHeader>
          {drafting ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Drafting your message…</div>
          ) : (
            <Textarea data-testid="draft-textarea" value={draft} onChange={(e) => setDraft(e.target.value)}
              className="bg-white min-h-[240px] text-sm leading-relaxed" />
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={openDraft.bind(null, active)} disabled={drafting} className="rounded-full">Regenerate</Button>
            <Button onClick={copy} disabled={drafting || !draft} data-testid="copy-draft-btn" className="rounded-full gap-2">
              <Copy size={16} weight="duotone" /> Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
