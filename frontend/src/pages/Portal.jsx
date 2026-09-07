import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, money, fmtDate, formatApiError } from "@/lib/api";
import { printInvoice, printSoa } from "@/lib/pdf";
import PortalLayout from "@/components/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Package, MagnifyingGlass, FilePdf, Receipt, FileText, TrendUp, Wallet, CreditCard,
  ChartLineUp, UploadSimple, Headset, CheckCircle, Clock, XCircle,
} from "@phosphor-icons/react";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "open", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "shipped", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

const STATUS_BADGE = {
  open: "bg-warning/15 text-warning border-warning/30",
  confirmed: "bg-primary/10 text-primary border-primary/30",
  shipped: "bg-success/15 text-success border-success/30",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
  closed: "bg-muted text-muted-foreground border-border",
};

export default function Portal() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [orders, setOrders] = useState(null);
  const [soa, setSoa] = useState(null);
  const [account, setAccount] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [orderSearch, setOrderSearch] = useState("");

  const loadAll = () => {
    api.get("/portal/invoices").then((r) => setInvoices(r.data)).catch(() => {});
    api.get("/portal/orders").then((r) => setOrders(r.data)).catch(() => setOrders([]));
    api.get("/portal/soa").then((r) => setSoa(r.data)).catch(() => {});
    api.get("/portal/account").then((r) => setAccount(r.data)).catch(() => {});
  };
  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    // Deep-link support for the nav bar's "Search Orders" / "Accounts" items.
    if (window.location.hash === "#orders") document.getElementById("orders-section")?.scrollIntoView({ behavior: "smooth" });
    if (window.location.hash === "#account") document.getElementById("account-section")?.scrollIntoView({ behavior: "smooth" });
  }, [orders, account]);

  const statusCounts = useMemo(() => {
    const c = { open: 0, confirmed: 0, shipped: 0, cancelled: 0 };
    (orders || []).forEach((o) => { if (c[o.status] !== undefined) c[o.status]++; });
    return c;
  }, [orders]);

  const conversionRate = useMemo(() => {
    if (!orders || orders.length === 0) return 0;
    const converted = orders.filter((o) => ["confirmed", "shipped", "closed"].includes(o.status)).length;
    return Math.round((converted / orders.length) * 100);
  }, [orders]);

  const availableCredit = account?.credit_limit != null && soa ? Math.max(0, account.credit_limit - (soa.balance || 0)) : null;

  const filteredOrders = useMemo(() => {
    let rows = orders || [];
    if (statusFilter !== "all") rows = rows.filter((o) => o.status === statusFilter);
    if (orderSearch.trim()) {
      const q = orderSearch.trim().toLowerCase();
      rows = rows.filter((o) => o.order_number?.toLowerCase().includes(q));
    }
    return rows;
  }, [orders, statusFilter, orderSearch]);

  return (
    <PortalLayout active="/portal">
      <div className="space-y-6" data-testid="portal-page">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-muted-foreground">Welcome back</div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mt-0.5" style={{ fontFamily: "Manrope" }}>{account?.name || "—"}</h1>
          {account?.tax_registration_number && <p className="text-xs text-muted-foreground mt-0.5">TRN: {account.tax_registration_number}</p>}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <QuickAction icon={Package} label="New Order" onClick={() => navigate("/portal/new-order")} testid="qa-new-order" />
          <QuickAction icon={MagnifyingGlass} label="Search Orders" onClick={() => document.getElementById("orders-section")?.scrollIntoView({ behavior: "smooth" })} testid="qa-search-orders" />
          <QuickAction icon={UploadSimple} label="Upload XLSX" onClick={() => navigate("/portal/new-order?tab=xlsx")} testid="qa-upload-xlsx" />
          <QuickAction icon={Wallet} label="View Account" onClick={() => document.getElementById("account-section")?.scrollIntoView({ behavior: "smooth" })} testid="qa-view-account" />
          <QuickAction icon={Headset} label="Contact Support" onClick={() => document.querySelector('[data-testid="portal-feedback-btn"]')?.click()} testid="qa-support" />
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <Kpi label="Book Orders" value={orders ? String(orders.length) : "—"} icon={Package} />
          <Kpi label="Order Value" value={soa ? `$${money(soa.total_billed)}` : "—"} icon={ChartLineUp} hint="Total invoiced" />
          <Kpi label="Conversion Rate" value={orders ? `${conversionRate}%` : "—"} icon={TrendUp} />
          <Kpi label="Outstanding Balance" value={soa ? `$${money(soa.balance)}` : "—"} icon={CreditCard} tone={soa?.balance > 0 ? "warn" : "up"} />
          <Kpi label="Credit Limit" value={account?.credit_limit != null ? `$${money(account.credit_limit)}` : "—"} icon={Wallet} />
          <Kpi label="Available Credit" value={availableCredit != null ? `$${money(availableCredit)}` : "—"} icon={CheckCircle} tone={availableCredit === 0 ? "warn" : "up"} />
        </div>

        {/* Order status breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatusStat icon={Clock} label="Pending" value={statusCounts.open} tone="warn" />
          <StatusStat icon={CheckCircle} label="Confirmed" value={statusCounts.confirmed} tone="default" />
          <StatusStat icon={CheckCircle} label="Completed" value={statusCounts.shipped} tone="up" />
          <StatusStat icon={XCircle} label="Cancelled" value={statusCounts.cancelled} tone="down" />
        </div>

        {/* Recent / searchable orders */}
        <Card id="orders-section" className="shadow-card overflow-hidden">
          <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <h3 className="text-sm font-medium" style={{ fontFamily: "Manrope" }}>Orders</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-1 bg-muted/60 rounded-lg p-0.5">
                {STATUS_TABS.map((t) => (
                  <button key={t.key} onClick={() => setStatusFilter(t.key)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${statusFilter === t.key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <Input placeholder="Search order #…" value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)}
                data-testid="portal-order-search" className="h-8 w-40 text-sm" />
            </div>
          </div>
          {orders === null ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Loading…</p>
          ) : filteredOrders.length === 0 ? (
            <Empty icon={Package} text="No orders match." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Order No.</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filteredOrders.slice(0, 25).map((o) => (
                    <TableRow key={o._id || o.id} data-testid={`portal-order-${o._id || o.id}`}>
                      <TableCell className="font-mono font-medium">{o.order_number}</TableCell>
                      <TableCell className="text-muted-foreground">{fmtDate(o.order_date)}</TableCell>
                      <TableCell><Badge variant="outline" className={`capitalize ${STATUS_BADGE[o.status] || ""}`}>{o.status === "shipped" ? "Completed" : (o.status || "open")}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        {/* Account: statement + invoices */}
        <div id="account-section" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="shadow-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium" style={{ fontFamily: "Manrope" }}>Statement of Account</h3>
              {soa && <Button variant="outline" size="sm" onClick={() => printSoa(soa)} data-testid="portal-soa-pdf" className="gap-1.5"><FilePdf size={14} /> PDF</Button>}
            </div>
            {!soa || soa.rows.length === 0 ? (
              <Empty icon={FileText} text="No account activity yet." compact />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Order</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {soa.rows.slice(0, 6).map((r, i) => (
                      <TableRow key={i}><TableCell className="font-mono text-xs">{r.order_number}</TableCell><TableCell className="text-right font-mono tabular text-xs">${money(r.balance)}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
          <Card className="shadow-card p-4">
            <h3 className="text-sm font-medium mb-3" style={{ fontFamily: "Manrope" }}>Recent Invoices</h3>
            {invoices.length === 0 ? (
              <Empty icon={Receipt} text="No invoices yet." compact />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead className="text-right">Total</TableHead><TableHead></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {invoices.slice(0, 6).map((inv) => (
                      <TableRow key={inv._id}>
                        <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                        <TableCell className="text-right font-mono tabular text-xs">${money(inv.total)}</TableCell>
                        <TableCell className="text-right"><button onClick={() => printInvoice(inv)} className="text-primary hover:underline text-xs">PDF</button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </PortalLayout>
  );
}

const TONE = { default: "text-foreground", up: "text-success", warn: "text-warning", down: "text-destructive" };

const Kpi = ({ label, value, icon: Icon, tone = "default", hint }) => (
  <Card className="p-3 shadow-card">
    <div className="flex items-start justify-between gap-1.5">
      <span className="text-[9.5px] uppercase tracking-[0.1em] font-semibold text-muted-foreground leading-tight">{label}</span>
      <Icon size={13} className="text-muted-foreground shrink-0" />
    </div>
    <div className={`mt-1 text-base font-mono tabular font-medium ${TONE[tone]}`}>{value}</div>
    {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
  </Card>
);

const StatusStat = ({ icon: Icon, label, value, tone }) => (
  <Card className="p-3 shadow-card flex items-center gap-2.5">
    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${tone === "up" ? "bg-success/10 text-success" : tone === "warn" ? "bg-warning/15 text-warning" : tone === "down" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
      <Icon size={15} weight="duotone" />
    </div>
    <div><div className="text-lg font-mono tabular font-medium leading-none">{value}</div><div className="text-[10px] text-muted-foreground mt-0.5">{label}</div></div>
  </Card>
);

const QuickAction = ({ icon: Icon, label, onClick, testid }) => (
  <button onClick={onClick} data-testid={testid} className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-accent transition-colors text-center">
    <Icon size={18} weight="duotone" className="text-primary" />
    <span className="text-[11px] font-medium leading-tight">{label}</span>
  </button>
);

const Empty = ({ icon: Icon, text, compact }) => (
  <div className={`${compact ? "py-8" : "py-16"} flex flex-col items-center gap-2 text-muted-foreground`}>
    <Icon size={compact ? 28 : 38} weight="duotone" /><p className="text-xs">{text}</p>
  </div>
);
