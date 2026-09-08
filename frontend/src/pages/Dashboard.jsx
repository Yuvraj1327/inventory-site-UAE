import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, money, fmtDate } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendUp, TrendDown, ChartLineUp, Package, ArrowDownLeft, ArrowUpRight, Cube,
  WarningCircle, Clock, Truck, Receipt, ArrowRight,
} from "@phosphor-icons/react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

const TONE_STYLES = {
  default: { text: "text-foreground", chip: "bg-muted text-muted-foreground" },
  up: { text: "text-success", chip: "bg-success/10 text-success" },
  down: { text: "text-destructive", chip: "bg-destructive/10 text-destructive" },
  warn: { text: "text-warning", chip: "bg-warning/15 text-warning" },
};

// Primary KPI — the numbers a business owner checks first. Bigger and
// bolder than everything else on the page, deliberately.
const Kpi = ({ label, value, icon: Icon, tone = "default", testid, onClick }) => {
  const t = TONE_STYLES[tone];
  return (
    <Card data-testid={testid} onClick={onClick}
      className={`p-4 shadow-card transition-colors duration-150 ${onClick ? "cursor-pointer hover:border-primary/40" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10.5px] uppercase tracking-[0.12em] font-bold text-muted-foreground">{label}</span>
        <div className={`h-7 w-7 shrink-0 rounded-md flex items-center justify-center ${t.chip}`}>
          <Icon size={14} weight="duotone" />
        </div>
      </div>
      <div className={`mt-2 text-2xl font-mono tabular font-bold ${t.text}`}>${value}</div>
    </Card>
  );
};

const KpiSkeleton = () => (
  <Card className="p-4 animate-pulse">
    <div className="flex items-start justify-between gap-2">
      <div className="h-2.5 w-16 bg-muted rounded" />
      <div className="h-7 w-7 rounded-md bg-muted" />
    </div>
    <div className="mt-3 h-6 w-24 bg-muted rounded" />
  </Card>
);

// Secondary "needs attention" tile — count-led, click-through to the
// relevant page. Deliberately smaller than the primary KPIs above.
const AttentionTile = ({ label, value, icon: Icon, tone = "default", onClick, testid }) => {
  const t = TONE_STYLES[tone];
  return (
    <button onClick={onClick} data-testid={testid}
      className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors text-left w-full">
      <div className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${t.chip}`}><Icon size={16} weight="duotone" /></div>
      <div className="min-w-0 flex-1">
        <div className="text-lg font-bold font-mono tabular leading-none">{value}</div>
        <div className="text-[11px] text-muted-foreground mt-1 truncate">{label}</div>
      </div>
      <ArrowRight size={14} className="text-muted-foreground shrink-0" />
    </button>
  );
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [ext, setExt] = useState(null);
  const [lowStock, setLowStock] = useState(null);
  const [recentOrders, setRecentOrders] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get("/dashboard").then((r) => setD(r.data)).catch(() => setError(true));
    api.get("/dashboard/extended").then((r) => setExt(r.data)).catch(() => {});
    api.get("/products/low-stock").then((r) => setLowStock(r.data)).catch(() => setLowStock([]));
    api.get("/orders").then((r) => setRecentOrders(r.data)).catch(() => setRecentOrders([]));
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-2">
        <p className="text-sm text-muted-foreground">Couldn't load dashboard data. Please refresh, or check your connection.</p>
      </div>
    );
  }

  if (!d) {
    return (
      <div className="space-y-6" data-testid="dashboard-page">
        <div className="h-7 w-56 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <KpiSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  const pendingCount = (recentOrders || []).filter((o) => o.status === "open").length;
  const supplierAlerts = (ext?.ai_open_alerts || 0) + (ext?.supplier_price_changes_detected || 0);
  const latestOrders = (recentOrders || []).slice(0, 6);

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div>
        <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-muted-foreground">Overview</div>
        <h1 className="text-3xl font-bold tracking-tight mt-0.5" style={{ fontFamily: "Manrope" }}>Business Dashboard</h1>
      </div>

      {/* Primary KPIs — the business at a glance */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Kpi label="Sales" value={money(d.order_revenue)} icon={TrendUp} tone="up" testid="kpi-sales" onClick={() => navigate("/orders")} />
        <Kpi label="Orders" value={d.order_count} icon={Package} testid="kpi-orders" onClick={() => navigate("/orders")} />
        <Kpi label="Gross Profit" value={money(d.order_profit)} icon={ChartLineUp} tone={d.order_profit >= 0 ? "up" : "down"} testid="kpi-gross-profit" />
        <Kpi label="Receivables" value={money(d.receivables)} icon={ArrowDownLeft} tone="warn" testid="kpi-receivables" onClick={() => navigate("/invoices")} />
        <Kpi label="Payables" value={money(d.payables)} icon={ArrowUpRight} tone="warn" testid="kpi-payables" onClick={() => navigate("/purchases")} />
        <Kpi label="Inventory Value" value={money(ext?.inventory_value ?? 0)} icon={Cube} testid="kpi-inventory-value" onClick={() => navigate("/inventory")} />
      </div>

      {/* Needs attention — the things that change day to day */}
      <div>
        <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-muted-foreground mb-2">Needs Attention</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <AttentionTile label="Low Stock Items" value={lowStock === null ? "…" : lowStock.length} icon={WarningCircle}
            tone={lowStock?.length > 0 ? "warn" : "default"} onClick={() => navigate("/inventory")} testid="tile-low-stock" />
          <AttentionTile label="Pending Orders" value={recentOrders === null ? "…" : pendingCount} icon={Clock}
            tone={pendingCount > 0 ? "warn" : "default"} onClick={() => navigate("/orders")} testid="tile-pending-orders" />
          <AttentionTile label="Lost Sales (Qty)" value={ext ? Math.round(ext.lost_qty_total) : "…"} icon={TrendDown}
            tone={ext?.lost_qty_total > 0 ? "down" : "default"} onClick={() => navigate("/lost-sales")} testid="tile-lost-sales" />
          <AttentionTile label="Supplier Alerts" value={ext ? supplierAlerts : "…"} icon={Truck}
            tone={supplierAlerts > 0 ? "warn" : "default"} onClick={() => navigate("/supplier-monitoring")} testid="tile-supplier-alerts" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        {/* One chart, not two — the trend that actually matters day to day */}
        <Card className="lg:col-span-3 p-4 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <ChartLineUp size={15} className="text-muted-foreground" />
            <h3 className="text-base font-bold" style={{ fontFamily: "Manrope" }}>Income vs Expense</h3>
          </div>
          {d.monthly_trend.length === 0 ? (
            <Empty text="No transactions yet" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={d.monthly_trend} margin={{ left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E0D8" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#78766F" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#78766F" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E2E0D8", fontSize: 13 }} cursor={{ fill: "hsl(var(--muted))" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                <Bar dataKey="income" name="Income" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar dataKey="expense" name="Expense" fill="#D4A373" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Recent activity — the newest orders, at a glance */}
        <Card className="lg:col-span-2 p-4 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Receipt size={15} className="text-muted-foreground" />
              <h3 className="text-base font-bold" style={{ fontFamily: "Manrope" }}>Recent Activity</h3>
            </div>
            <button onClick={() => navigate("/orders")} className="text-xs text-primary font-medium hover:underline">View all</button>
          </div>
          {recentOrders === null ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
          ) : latestOrders.length === 0 ? (
            <Empty text="No recent orders" compact />
          ) : (
            <div className="space-y-1">
              {latestOrders.map((o) => (
                <button key={o._id || o.id} onClick={() => navigate("/orders")}
                  className="w-full flex items-center justify-between gap-2 py-2 px-2 -mx-2 rounded-lg hover:bg-accent transition-colors text-left">
                  <div className="min-w-0">
                    <div className="text-sm font-mono font-medium truncate">{o.order_number}</div>
                    <div className="text-[11px] text-muted-foreground">{fmtDate(o.order_date)}</div>
                  </div>
                  <Badge variant="outline" className="capitalize shrink-0 text-[10px]">{o.status || "open"}</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

const Empty = ({ text, compact }) => (
  <div className={`${compact ? "h-32" : "h-[220px]"} flex items-center justify-center text-sm text-muted-foreground border border-dashed border-border rounded-lg`}>
    {text}
  </div>
);
