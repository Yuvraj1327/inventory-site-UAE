import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, money, fmtDate } from "@/lib/api";
import PortalLayout from "@/components/PortalLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Package, MagnifyingGlass, TrendUp, Wallet, CreditCard,
  ChartLineUp, UploadSimple, Headset, CheckCircle, Clock, XCircle, Flame,
} from "@phosphor-icons/react";

const STATUS_BADGE = {
  open: "bg-warning/15 text-warning border-warning/30",
  confirmed: "bg-primary/10 text-primary border-primary/30",
  shipped: "bg-success/15 text-success border-success/30",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
  closed: "bg-muted text-muted-foreground border-border",
};

export default function Portal() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState(null);
  const [soa, setSoa] = useState(null);
  const [account, setAccount] = useState(null);
  const [trending, setTrending] = useState(null);

  useEffect(() => {
    api.get("/portal/orders").then((r) => setOrders(r.data)).catch(() => setOrders([]));
    api.get("/portal/soa").then((r) => setSoa(r.data)).catch(() => {});
    api.get("/portal/account").then((r) => setAccount(r.data)).catch(() => {});
    api.get("/portal/trending-parts").then((r) => setTrending(r.data)).catch(() => setTrending([]));
  }, []);

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
  const recentOrders = (orders || []).slice(0, 5);

  return (
    <PortalLayout active="/portal">
      <div className="space-y-6" data-testid="portal-page">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-muted-foreground">Welcome back</div>
          <h1 className="text-3xl font-bold tracking-tight mt-0.5" style={{ fontFamily: "Manrope" }}>{account?.name || "—"}</h1>
        </div>

        {/* Quick actions — the things a customer does most */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <QuickAction icon={Package} label="New Order" onClick={() => navigate("/portal/new-order")} testid="qa-new-order" />
          <QuickAction icon={MagnifyingGlass} label="Search Orders" onClick={() => navigate("/portal/orders")} testid="qa-search-orders" />
          <QuickAction icon={UploadSimple} label="Upload XLSX" onClick={() => navigate("/portal/new-order?tab=xlsx")} testid="qa-upload-xlsx" />
          <QuickAction icon={Wallet} label="View Account" onClick={() => navigate("/portal/account")} testid="qa-view-account" />
          <QuickAction icon={Headset} label="Contact Support" onClick={() => document.querySelector('[data-testid="portal-feedback-btn"]')?.click()} testid="qa-support" />
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <Kpi label="Book Orders" value={orders ? String(orders.length) : "—"} icon={Package} />
          <Kpi label="Order Value" value={soa ? `$${money(soa.total_billed)}` : "—"} icon={ChartLineUp} />
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

        {/* Trending / frequently ordered parts — real order history, not a mock */}
        <Card className="shadow-card p-4" data-testid="trending-parts">
          <div className="flex items-center gap-2 mb-3">
            <Flame size={15} className="text-primary" />
            <h3 className="text-base font-bold" style={{ fontFamily: "Manrope" }}>Frequently Ordered Parts</h3>
          </div>
          {trending === null ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
          ) : trending.length === 0 ? (
            <Empty text="No order history yet — your frequently ordered parts will show up here." compact />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
              {trending.map((t) => (
                <button
                  key={t.part_number}
                  data-testid={`trending-part-${t.part_number}`}
                  onClick={() => navigate(`/portal/new-order?part=${encodeURIComponent(t.part_number)}`)}
                  className="text-left p-2.5 rounded-lg border border-border hover:border-primary/50 hover:bg-accent transition-colors"
                >
                  <div className="font-mono text-xs font-bold truncate">{t.part_number}</div>
                  <div className="text-[11px] text-muted-foreground truncate mt-0.5">{t.description || "—"}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">{Math.round(t.total_qty)} units · {t.order_count} orders</div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Recent orders — compact, full search lives on its own page */}
        <Card className="shadow-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="text-base font-bold" style={{ fontFamily: "Manrope" }}>Recent Orders</h3>
            <button onClick={() => navigate("/portal/orders")} data-testid="view-all-orders" className="text-xs text-primary font-bold hover:underline">
              View all →
            </button>
          </div>
          {orders === null ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Loading…</p>
          ) : recentOrders.length === 0 ? (
            <Empty text="No orders yet." />
          ) : (
            <div className="divide-y divide-border">
              {recentOrders.map((o) => (
                <button key={o._id || o.id} onClick={() => navigate("/portal/orders")}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent transition-colors text-left">
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-sm truncate">{o.order_number}</div>
                    <div className="text-[11px] text-muted-foreground">{fmtDate(o.order_date)}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono tabular text-sm font-semibold">${money(o.selling_value)}</span>
                    <Badge variant="outline" className={`capitalize text-[10px] ${STATUS_BADGE[o.status] || ""}`}>{o.status === "shipped" ? "Completed" : (o.status || "open")}</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </PortalLayout>
  );
}

const TONE = { default: "text-foreground", up: "text-success", warn: "text-warning", down: "text-destructive" };
const CHIP_TONE = { default: "bg-muted text-muted-foreground", up: "bg-success/10 text-success", warn: "bg-warning/15 text-warning", down: "bg-destructive/10 text-destructive" };

const Kpi = ({ label, value, icon: Icon, tone = "default" }) => (
  <Card className="p-3.5 shadow-card">
    <div className="flex items-start justify-between gap-2">
      <span className="text-[10px] uppercase tracking-[0.1em] font-bold text-muted-foreground">{label}</span>
      <div className={`h-6 w-6 shrink-0 rounded-md flex items-center justify-center ${CHIP_TONE[tone]}`}><Icon size={13} weight="duotone" /></div>
    </div>
    <div className={`mt-1.5 text-lg font-mono tabular font-bold ${TONE[tone]}`}>{value}</div>
  </Card>
);

const StatusStat = ({ icon: Icon, label, value, tone }) => (
  <Card className="p-3.5 shadow-card">
    <div className="flex items-center gap-2 text-muted-foreground mb-1"><Icon size={14} /><span className="text-[10.5px] uppercase tracking-wide font-semibold">{label}</span></div>
    <div className={`text-xl font-mono tabular font-bold ${TONE[tone]}`}>{value}</div>
  </Card>
);

const QuickAction = ({ icon: Icon, label, onClick, testid }) => (
  <button onClick={onClick} data-testid={testid}
    className="flex flex-col items-center gap-2 p-3.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-accent transition-colors">
    <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Icon size={17} weight="duotone" /></div>
    <span className="text-xs font-semibold text-center leading-tight">{label}</span>
  </button>
);

const Empty = ({ text, compact }) => (
  <div className={`${compact ? "py-6" : "py-16"} flex flex-col items-center gap-2 text-muted-foreground`}>
    <p className="text-sm">{text}</p>
  </div>
);
