import { useEffect, useState } from "react";
import { api, money, fmtDate } from "@/lib/api";
import { printReceipt } from "@/lib/pdf";
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
import { Plus, Receipt, Trash, ArrowDownLeft, ArrowUpRight, Money } from "@phosphor-icons/react";
import { toast } from "sonner";

const EXPENSE_CATS = [
  "Office Supplies", "Rent", "Utilities", "Salaries & Wages", "Marketing", "Travel",
  "Meals & Entertainment", "Software & Subscriptions", "Inventory / COGS", "Professional Fees",
  "Taxes", "Bank Charges", "Insurance", "Fuel", "Maintenance", "Other",
];

const MODES = [
  { id: "payment_in", label: "Payment from Customer", icon: ArrowDownLeft },
  { id: "payment_out", label: "Payment to Supplier", icon: ArrowUpRight },
  { id: "cash_expense", label: "Cash Expense", icon: Money },
];

export default function Transactions() {
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("payment_in");
  const [form, setForm] = useState({ party: "", account_no: "", amount: "", category: "Rent", description: "", date: "" });
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/transactions").then((r) => setRows(r.data));
  useEffect(() => {
    load();
    api.get("/parties?kind=customer").then((r) => setCustomers(r.data));
    api.get("/parties?kind=supplier").then((r) => setSuppliers(r.data));
  }, []);

  const openNew = () => {
    setMode("payment_in");
    setForm({ party: "", account_no: "", amount: "", category: "Rent", description: "", date: "" });
    setOpen(true);
  };

  const pickCustomer = (name) => {
    const c = customers.find((x) => x.name === name);
    setForm({ ...form, party: name, account_no: c?.account_no || "" });
  };

  const save = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error("Enter a valid amount"); return; }
    if (mode !== "cash_expense" && !form.party) { toast.error("Select a party"); return; }
    setSaving(true);
    try {
      await api.post("/transactions", {
        kind: mode,
        amount: parseFloat(form.amount),
        party: mode === "cash_expense" ? "" : form.party,
        account_no: form.account_no,
        category: mode === "cash_expense" ? form.category : "",
        description: form.description,
        date: form.date || null,
      });
      toast.success(mode === "payment_in" ? "Receipt recorded" : "Transaction saved");
      setOpen(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Save failed"); }
    setSaving(false);
  };

  const remove = async (id) => { await api.delete(`/transactions/${id}`); load(); };

  const kindLabel = (t) => ({
    payment_in: "Payment In", payment_out: "Payment Out", cash_expense: "Cash Expense",
  }[t.kind] || (t.type === "income" ? "Income" : "Expense"));

  return (
    <div className="space-y-8" data-testid="transactions-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">Bookkeeping</div>
          <h1 className="text-4xl sm:text-5xl tracking-tight font-light mt-1" style={{ fontFamily: "Manrope" }}>Transactions</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="add-transaction-btn" onClick={openNew} className="rounded-full gap-2"><Plus size={18} weight="bold" /> New Transaction</Button>
          </DialogTrigger>
          <DialogContent className="bg-white">
            <DialogHeader><DialogTitle style={{ fontFamily: "Manrope" }}>New Transaction</DialogTitle></DialogHeader>

            <div className="grid grid-cols-3 gap-2">
              {MODES.map((m) => {
                const Icon = m.icon;
                const active = mode === m.id;
                return (
                  <button key={m.id} onClick={() => setMode(m.id)} data-testid={`mode-${m.id}`}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs text-center transition-colors ${active ? "border-primary bg-accent text-foreground" : "border-border text-muted-foreground hover:bg-accent/50"}`}>
                    <Icon size={20} weight="duotone" /> {m.label}
                  </button>
                );
              })}
            </div>

            <div className="space-y-4 pt-1">
              {mode === "payment_in" && (
                <div>
                  <Label className="text-xs">Customer (by account)</Label>
                  <Select value={form.party} onValueChange={pickCustomer}>
                    <SelectTrigger data-testid="txn-customer-select" className="bg-white"><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => <SelectItem key={c._id} value={c.name}>{c.account_no ? `${c.account_no} · ` : ""}{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {form.account_no && <p className="text-xs text-muted-foreground mt-1">Account No: <span className="font-mono">{form.account_no}</span></p>}
                </div>
              )}
              {mode === "payment_out" && (
                <div>
                  <Label className="text-xs">Supplier</Label>
                  <Select value={form.party} onValueChange={(v) => setForm({ ...form, party: v })}>
                    <SelectTrigger data-testid="txn-supplier-select" className="bg-white"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => <SelectItem key={s._id} value={s.name}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {mode === "cash_expense" && (
                <div>
                  <Label className="text-xs">Expense Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger data-testid="txn-category-select" className="bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      {EXPENSE_CATS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Amount</Label>
                  <Input data-testid="txn-amount-input" type="number" value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" className="bg-white" />
                </div>
                <div>
                  <Label className="text-xs">Date</Label>
                  <Input data-testid="txn-date-input" type="date" value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })} className="bg-white" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Description (optional)</Label>
                <Input data-testid="txn-desc-input" value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-white" />
              </div>
            </div>

            <DialogFooter>
              <Button onClick={save} disabled={saving} data-testid="save-transaction-btn" className="rounded-full">
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-white border-border/60 shadow-sm rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-20 flex flex-col items-center gap-3 text-muted-foreground">
            <Receipt size={40} weight="duotone" />
            <p className="text-sm">No transactions yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Party / Category</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t._id} data-testid={`txn-row-${t._id}`}>
                  <TableCell className="text-muted-foreground">{fmtDate(t.date)}</TableCell>
                  <TableCell><Badge variant="secondary" className="font-normal">{kindLabel(t)}</Badge></TableCell>
                  <TableCell className="font-medium">{t.party || t.category || "—"}</TableCell>
                  <TableCell>
                    {t.receipt_no ? (
                      <button onClick={() => printReceipt(t)} data-testid={`receipt-${t._id}`} className="text-primary hover:underline flex items-center gap-1.5 text-sm font-mono">
                        <Receipt size={15} weight="duotone" /> {t.receipt_no}
                      </button>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className={`text-right font-mono tabular ${t.type === "income" ? "text-success" : "text-destructive"}`}>
                    {t.type === "income" ? "+" : "−"}${money(t.amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <button onClick={() => remove(t._id)} data-testid={`del-txn-${t._id}`}
                      className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash size={17} />
                    </button>
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
