import { useEffect, useState } from "react";
import { api, money } from "@/lib/api";
import { Card } from "@/components/ui/card";
import {
  TrendUp, TrendDown, ChartLineUp, Package, ArrowDownLeft, ArrowUpRight, Coins,
} from "@phosphor-icons/react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, CartesianGrid,
} from "recharts";

const CHART_COLORS = ["#6B7C54", "#D4A373", "#3d423a", "#b5763f", "#c9bfa3"];

const Kpi = ({ label, value, icon: Icon, tone = "default", testid }) => {
  const toneCls = {
    default: "text-foreground",
    up: "text-success",
    down: "text-destructive",
    warn: "text-warning",
  }[tone];
  return (
    <Card data-testid={testid} className="p-6 bg-white border-border/60 shadow-sm rounded-xl hover:-translate-y-px transition-transform">
      <div className="flex items-start justify-between">
        <span className="text-xs uppercase tracking-[0.18em] font-semibold text-muted-foreground">{label}</span>
        <Icon size={20} weight="duotone" className="text-muted-foreground" />
      </div>
      <div className={`mt-4 text-3xl font-mono tabular ${toneCls}`}>${value}</div>
    </Card>
  );
};

export default function Dashboard() {
  const [d, setD] = useState(null);

  useEffect(() => {
    api.get("/dashboard").then((r) => setD(r.data)).catch(() => {});
  }, []);

  if (!d) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">Overview</div>
        <h1 className="text-4xl sm:text-5xl tracking-tight font-light mt-1" style={{ fontFamily: "Manrope" }}>
          Financial Dashboard
        </h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Kpi label="Income" value={money(d.total_income)} icon={TrendUp} tone="up" testid="kpi-income" />
        <Kpi label="Expenses" value={money(d.total_expense)} icon={TrendDown} tone="down" testid="kpi-expense" />
        <Kpi label="Net Profit" value={money(d.net_profit)} icon={ChartLineUp} tone={d.net_profit >= 0 ? "up" : "down"} testid="kpi-profit" />
        <Kpi label="Order Profit" value={money(d.order_profit)} icon={Package} testid="kpi-order-profit" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Kpi label="Receivables" value={money(d.receivables)} icon={ArrowDownLeft} tone="warn" testid="kpi-receivables" />
        <Kpi label="Payables" value={money(d.payables)} icon={ArrowUpRight} tone="warn" testid="kpi-payables" />
        <Kpi label="Order Revenue" value={money(d.order_revenue)} icon={Coins} testid="kpi-order-revenue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3 p-6 bg-white border-border/60 shadow-sm rounded-xl">
          <h3 className="text-xl font-medium mb-6" style={{ fontFamily: "Manrope" }}>Income vs Expense</h3>
          {d.monthly_trend.length === 0 ? (
            <Empty text="No transactions yet" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={d.monthly_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E0D8" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#78766F" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#78766F" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E2E0D8", fontSize: 13 }} />
                <Bar dataKey="income" fill="#6B7C54" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="#D4A373" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="lg:col-span-2 p-6 bg-white border-border/60 shadow-sm rounded-xl">
          <h3 className="text-xl font-medium mb-6" style={{ fontFamily: "Manrope" }}>Spending by Category</h3>
          {d.category_breakdown.length === 0 ? (
            <Empty text="No expenses yet" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={d.category_breakdown} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                  {d.category_breakdown.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E2E0D8", fontSize: 13 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}

const Empty = ({ text }) => (
  <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
    {text}
  </div>
);
