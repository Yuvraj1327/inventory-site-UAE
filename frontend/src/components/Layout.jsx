import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  SquaresFour, Receipt, Package, UsersThree, Truck, Scan, Sparkle, Wallet,
  BellRinging, Cube, ShoppingCart, FileText, SignOut, TrendDown, ChartLineUp,
} from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";

const nav = [
  { to: "/", label: "Dashboard", icon: SquaresFour, end: true, id: "dashboard" },
  { to: "/transactions", label: "Transactions", icon: Receipt, id: "transactions" },
  { to: "/orders", label: "Orders Follow-Up", icon: Package, id: "orders" },
  { to: "/inventory", label: "Inventory", icon: Cube, id: "inventory" },
  { to: "/purchases", label: "Purchases", icon: ShoppingCart, id: "purchases" },
  { to: "/invoices", label: "Invoices", icon: FileText, id: "invoices" },
  { to: "/lost-sales", label: "Lost Sales", icon: TrendDown, id: "lost-sales" },
  { to: "/supplier-monitoring", label: "Supplier Monitoring", icon: ChartLineUp, id: "supplier-monitoring" },
  { to: "/customers", label: "Customers", icon: UsersThree, id: "customers" },
  { to: "/suppliers", label: "Suppliers", icon: Truck, id: "suppliers" },
  { to: "/reminders", label: "Payment Reminders", icon: BellRinging, id: "reminders" },
  { to: "/scanner", label: "Receipt Scanner", icon: Scan, id: "scanner" },
  { to: "/assistant", label: "AI Assistant", icon: Sparkle, id: "assistant" },
];

export default function Layout() {
  const loc = useLocation();
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-64 shrink-0 border-r border-border bg-muted/40 hidden md:flex flex-col fixed h-screen">
        <div className="px-6 py-6 flex items-center gap-3 border-b border-border">
          <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
            <Wallet size={22} weight="duotone" />
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-[15px]" style={{ fontFamily: "Manrope" }}>Ledgerly</div>
            <div className="text-xs text-muted-foreground">AI Accountant</div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.map((n) => {
            const Icon = n.icon;
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                data-testid={`nav-${n.id}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`
                }
              >
                <Icon size={19} weight="duotone" />
                {n.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="px-3 py-3 border-t border-border">
          <div className="px-3 py-2 text-xs text-muted-foreground truncate">{user?.email}</div>
          <button onClick={logout} data-testid="admin-logout"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
            <SignOut size={19} weight="duotone" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 md:ml-64 min-w-0">
        <div className="md:hidden sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3 flex gap-1 overflow-x-auto">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} data-testid={`mnav-${n.id}`}
              className={({ isActive }) => `px-3 py-1.5 rounded-md text-xs whitespace-nowrap ${isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {n.label}
            </NavLink>
          ))}
          <button onClick={logout} className="px-3 py-1.5 rounded-md text-xs whitespace-nowrap bg-muted text-muted-foreground">Sign out</button>
        </div>
        <motion.main
          key={loc.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="max-w-7xl mx-auto px-5 sm:px-8 py-8"
        >
          <Outlet />
        </motion.main>
      </div>
    </div>
  );
}
