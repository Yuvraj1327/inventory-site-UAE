import { useEffect, useState } from "react";
import { api, money, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CheckCircle, Warning, Plus, WhatsappLogo } from "@phosphor-icons/react";
import { toast } from "sonner";

function Line({ label, value, bold, indent }) {
  return (
    <div className={`flex justify-between text-sm py-1.5 ${bold ? "font-semibold border-t border-border mt-1 pt-2" : ""} ${indent ? "pl-4 text-muted-foreground" : ""}`}>
      <span>{label}</span><span className="font-mono tabular">${money(value)}</span>
    </div>
  );
}

export default function Accounting() {
  const [period, setPeriod] = useState("monthly");
  const [pnl, setPnl] = useState(null);
  const [bs, setBs] = useState(null);

  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ party_type: "customer", party_name: "", amount: "", method: "bank_transfer", reference: "", notes: "", send_whatsapp: false });
  const [paying, setPaying] = useState(false);
  const [lastReceipt, setLastReceipt] = useState(null);

  const load = () => {
    api.get(`/accounting/pnl?period=${period}`).then((r) => setPnl(r.data)).catch(() => setPnl(null));
    api.get("/accounting/balance-sheet").then((r) => setBs(r.data)).catch(() => setBs(null));
  };
  useEffect(() => { load(); }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitPayment = async () => {
    if (!payForm.party_name || !payForm.amount) { toast.error("Party name and amount are required"); return; }
    setPaying(true);
    try {
      const r = await api.post("/payments", { ...payForm, amount: parseFloat(payForm.amount) });
      toast.success(`Payment recorded — receipt ${r.data.receipt.receipt_number}`);
      setLastReceipt(r.data);
      setPayForm({ party_type: "customer", party_name: "", amount: "", method: "bank_transfer", reference: "", notes: "", send_whatsapp: false });
      setPayOpen(false);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    setPaying(false);
  };

  return (
    <div className="space-y-8" data-testid="accounting-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">Phase 10</div>
          <h1 className="text-4xl sm:text-5xl tracking-tight font-light mt-1" style={{ fontFamily: "Manrope" }}>Accounting</h1>
        </div>
        <Dialog open={payOpen} onOpenChange={setPayOpen}>
          <DialogTrigger asChild><Button className="rounded-full gap-2" data-testid="record-payment-btn"><Plus size={16} weight="bold" /> Record Payment</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Record a payment</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Party Type</Label>
                <Select value={payForm.party_type} onValueChange={(v) => setPayForm({ ...payForm, party_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="customer">Customer (money in)</SelectItem><SelectItem value="supplier">Supplier (money out)</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Name</Label><Input value={payForm.party_name} onChange={(e) => setPayForm({ ...payForm, party_name: e.target.value })} data-testid="payment-party-input" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Amount</Label><Input type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} data-testid="payment-amount-input" /></div>
                <div>
                  <Label className="text-xs">Method</Label>
                  <Select value={payForm.method} onValueChange={(v) => setPayForm({ ...payForm, method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["cash", "bank_transfer", "cheque", "card", "other"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label className="text-xs">Reference</Label><Input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} /></div>
              {payForm.party_type === "customer" && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={payForm.send_whatsapp} onCheckedChange={(v) => setPayForm({ ...payForm, send_whatsapp: !!v })} />
                  Send receipt via WhatsApp
                </label>
              )}
            </div>
            <DialogFooter><Button onClick={submitPayment} disabled={paying} data-testid="submit-payment-btn">{paying ? "Recording…" : "Record Payment"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {lastReceipt && (
        <Card className="p-4 flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm"><span className="font-medium">Receipt {lastReceipt.receipt.receipt_number}</span> — ${money(lastReceipt.payment.amount)}</div>
          {lastReceipt.whatsapp && (
            <Badge variant="outline" className="gap-1.5"><WhatsappLogo size={14} /> {lastReceipt.whatsapp.status === "sent" ? "Sent" : lastReceipt.whatsapp.status === "not_applicable" ? "WhatsApp not configured" : "Failed"}</Badge>
          )}
        </Card>
      )}

      <Tabs defaultValue="pnl">
        <TabsList>
          <TabsTrigger value="pnl">P&amp;L / Income Statement</TabsTrigger>
          <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
        </TabsList>

        <TabsContent value="pnl" className="mt-5 space-y-4">
          <div className="flex gap-2">
            {["monthly", "quarterly", "yearly"].map((p) => (
              <Button key={p} size="sm" variant={period === p ? "default" : "secondary"} onClick={() => setPeriod(p)} className="rounded-full capitalize">{p}</Button>
            ))}
          </div>
          <Card className="p-6 max-w-xl">
            {!pnl ? <p className="text-sm text-muted-foreground">Loading…</p> : (
              <>
                <div className="text-xs text-muted-foreground mb-3">{pnl.period.from} → {pnl.period.to} · {pnl.invoice_count} invoice(s)</div>
                <Line label="Revenue" value={pnl.revenue} />
                <Line label="COGS" value={-pnl.cogs} indent />
                <Line label="Gross Profit" value={pnl.gross_profit} bold />
                <div className="text-xs text-muted-foreground pl-4 pb-1">Margin: {pnl.gross_margin_percent}%</div>
                <Line label="Expenses" value={-pnl.expenses} indent />
                <Line label="Net Income" value={pnl.net_income} bold />
              </>
            )}
          </Card>
          {pnl?.expense_breakdown?.length > 0 && (
            <Card className="p-5 max-w-xl">
              <h3 className="text-sm font-medium mb-2">Expense breakdown</h3>
              {pnl.expense_breakdown.map((e) => <Line key={e.category} label={e.category} value={e.amount} indent />)}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="balance-sheet" className="mt-5">
          {!bs ? <p className="text-sm text-muted-foreground">Loading…</p> : (
            <div className="grid md:grid-cols-2 gap-6 max-w-3xl">
              <Card className="p-6">
                <h3 className="text-sm font-medium mb-2">Assets</h3>
                <Line label="Cash" value={bs.assets.cash} indent />
                <Line label="Accounts Receivable" value={bs.assets.accounts_receivable} indent />
                <Line label="Inventory" value={bs.assets.inventory} indent />
                <Line label="Total Assets" value={bs.assets.total} bold />
              </Card>
              <Card className="p-6">
                <h3 className="text-sm font-medium mb-2">Liabilities &amp; Equity</h3>
                <Line label="Accounts Payable" value={bs.liabilities.accounts_payable} indent />
                <Line label="Total Liabilities" value={bs.liabilities.total} bold />
                <Line label="Capital" value={bs.equity.capital} indent />
                <Line label="Retained Earnings" value={bs.equity.retained_earnings} indent />
                <Line label="Total Equity" value={bs.equity.total} bold />
              </Card>
              <Card className={`p-4 md:col-span-2 flex items-center gap-3 ${bs.balanced ? "bg-success/5 border-success/30" : "bg-destructive/5 border-destructive/30"}`} data-testid="balance-check">
                {bs.balanced ? <CheckCircle size={20} className="text-success" /> : <Warning size={20} className="text-destructive" />}
                <div className="text-sm">
                  {bs.balanced ? "Assets = Liabilities + Equity ✓" : `Out of balance by $${money(Math.abs(bs.difference))}`}
                </div>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}