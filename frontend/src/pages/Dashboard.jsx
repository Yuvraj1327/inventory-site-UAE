import { useEffect, useState } from "react";
import { api, money } from "@/lib/api";
import { Card } from "@/components/ui/card";
import {
  TrendUp, TrendDown, ChartLineUp, Package, ArrowDownLeft, ArrowUpRight, Coins,
  Cube, Robot, MagnifyingGlass, UsersThree, ChartPieSlice,
} from "@phosphor-icons/react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, CartesianGrid, Legend,
} from "recharts";

const CHART_COLORS = ["#6B7C54", "#D4A373", "#3d423a", "#b5763f", "#c9bfa3"];

const TONE_STYLES = {
  default: { text: "text-foreground", chip: "bg-muted text-muted-foreground" },
  up: { text: "text-success", chip: "bg-success/10 text-success" },
  down: { text: "text-destructive", chip: "bg-destructive/10 text-destructive" },
  warn: { text: "text-warning", chip: "bg-warning/15 text-warning" },
};

const Kpi = ({ label, value, icon: Icon, tone = "default", testid }) => {
  const t = TONE_STYLES[tone];
  return (
    <Card data-testid={testid} className="p-3.5 shadow-card hover:border-foreground/15 transition-colors duration-150">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">{label}</span>
        <div className={`h-6 w-6 shrink-0 rounded-md flex items-center justify-center ${t.chip}`}>
          <Icon size={13} weight="duotone" />
        </div>
      </div>
      <div className={`mt-1.5 text-lg sm:text-xl font-mono tabular font-medium ${t.text}`}>${value}</div>
    </Card>
  );
};

const KpiSkeleton = () => (
  <Card className="p-3.5 animate-pulse">
    <div className="flex items-start justify-between gap-2">
      <div className="h-2.5 w-16 bg-muted rounded" />
      <div className="h-6 w-6 rounded-md bg-muted" />
    </div>
    <div className="mt-4 h-7 w-28 bg-muted rounded" />
  </Card>
);

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [ext, setExt] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get("/dashboard").then((r) => setD(r.data)).catch(() => setError(true));
    api.get("/dashboard/extended").then((r) => setExt(r.data)).catch(() => {});
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
        <div>
          <div className="h-3 w-20 bg-muted rounded animate-pulse mb-2" />
          <div className="h-8 w-64 bg-muted rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div>
        <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-muted-foreground">Overview</div>
        <h1 className="text-xl sm:text-2xl tracking-tight font-semibold mt-0.5" style={{ fontFamily: "Manrope" }}>
          Financial Dashboard
        </h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Income" value={money(d.total_income)} icon={TrendUp} tone="up" testid="kpi-income" />
        <Kpi label="Expenses" value={money(d.total_expense)} icon={TrendDown} tone="down" testid="kpi-expense" />
        <Kpi label="Net Profit" value={money(d.net_profit)} icon={ChartLineUp} tone={d.net_profit >= 0 ? "up" : "down"} testid="kpi-profit" />
        <Kpi label="Order Profit" value={money(d.order_profit)} icon={Package} testid="kpi-order-profit" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi label="Receivables" value={money(d.receivables)} icon={ArrowDownLeft} tone="warn" testid="kpi-receivables" />
        <Kpi label="Payables" value={money(d.payables)} icon={ArrowUpRight} tone="warn" testid="kpi-payables" />
        <Kpi label="Order Revenue" value={money(d.order_revenue)} icon={Coins} testid="kpi-order-revenue" />
      </div>

      {ext && (
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-muted-foreground mb-2">Operational — Demand, Supplier &amp; Customer Signal</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MiniStat icon={Cube} label="Inventory Value" value={`$${money(ext.inventory_value)}`} />
            <MiniStat icon={TrendDown} label="Lost Qty (Demand)" value={ext.lost_qty_total} />
            <MiniStat icon={ChartLineUp} label="Supplier Price Changes" value={ext.supplier_price_changes_detected} />
            <MiniStat icon={Robot} label="AI Open Alerts" value={ext.ai_open_alerts} />
            <MiniStat icon={MagnifyingGlass} label="Demand Events" value={ext.customer_demand_events} />
            <MiniStat icon={UsersThree} label="Active Customers" value={ext.customer_active_count} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <Card className="lg:col-span-3 p-4 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <ChartLineUp size={15} className="text-muted-foreground" />
            <h3 className="text-sm font-medium" style={{ fontFamily: "Manrope" }}>Income vs Expense</h3>
          </div>
          {d.monthly_trend.length === 0 ? (
            <Empty text="No transactions yet" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={d.monthly_trend} margin={{ left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E0D8" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#78766F" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#78766F" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E2E0D8", fontSize: 13 }} cursor={{ fill: "hsl(var(--muted))" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                <Bar dataKey="income" name="Income" fill="#6B7C54" radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar dataKey="expense" name="Expense" fill="#D4A373" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="lg:col-span-2 p-4 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <ChartPieSlice size={15} className="text-muted-foreground" />
            <h3 className="text-sm font-medium" style={{ fontFamily: "Manrope" }}>Spending by Category</h3>
          </div>
          {d.category_breakdown.length === 0 ? (
            <Empty text="No expenses yet" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={d.category_breakdown} dataKey="value" nameKey="name" innerRadius={55} outerRadius={92} paddingAngle={2}>
                  {d.category_breakdown.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E2E0D8", fontSize: 13 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} layout="horizontal" />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}

const Empty = ({ text }) => (
  <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
    {text}
  </div>
);

const MiniStat = ({ icon: Icon, label, value }) => (
  <Card className="p-3.5 sm:p-4 shadow-card">
    <div className="flex items-center gap-2 text-muted-foreground mb-1"><Icon size={15} /><span className="text-[10.5px] sm:text-[11px] uppercase tracking-wide truncate">{label}</span></div>
    <div className="text-base sm:text-lg font-mono tabular font-medium">{value}</div>
  </Card>
);
