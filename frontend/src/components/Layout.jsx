import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  SquaresFour, Receipt, Package, UsersThree, Truck, Scan, Sparkle, Wallet,
  BellRinging, Cube, ShoppingCart, FileText, SignOut, TrendDown, ChartLineUp,
  Robot, ChartBar, Calculator, List,
} from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import ErrorBoundary from "@/components/ErrorBoundary";

const nav = [
  { to: "/", label: "Dashboard", icon: SquaresFour, end: true, id: "dashboard" },
  { to: "/transactions", label: "Transactions", icon: Receipt, id: "transactions" },
  { to: "/orders", label: "Orders Follow-Up", icon: Package, id: "orders" },
  { to: "/inventory", label: "Inventory", icon: Cube, id: "inventory" },
  { to: "/purchases", label: "Purchases", icon: ShoppingCart, id: "purchases" },
  { to: "/invoices", label: "Invoices", icon: FileText, id: "invoices" },
  { to: "/accounting", label: "Accounting", icon: Calculator, id: "accounting" },
  { to: "/lost-sales", label: "Lost Sales", icon: TrendDown, id: "lost-sales" },
  { to: "/supplier-monitoring", label: "Supplier Monitoring", icon: ChartLineUp, id: "supplier-monitoring" },
  { to: "/ai-agent", label: "AI Control Center", icon: Robot, id: "ai-agent" },
  { to: "/customer-intelligence", label: "Customer Intelligence", icon: ChartBar, id: "customer-intelligence" },
  { to: "/customers", label: "Customers", icon: UsersThree, id: "customers" },
  { to: "/suppliers", label: "Suppliers", icon: Truck, id: "suppliers" },
  { to: "/reminders", label: "Payment Reminders", icon: BellRinging, id: "reminders" },
  { to: "/scanner", label: "Receipt Scanner", icon: Scan, id: "scanner" },
  { to: "/assistant", label: "AI Assistant", icon: Sparkle, id: "assistant" },
];

function Brand() {
  return (
    <div className="px-5 py-5 flex items-center gap-3 border-b border-border">
      <div className="h-10 w-10 shrink-0 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
        <Wallet size={22} weight="duotone" />
      </div>
      <div className="leading-tight min-w-0">
        <div className="font-semibold text-[15px] truncate" style={{ fontFamily: "Manrope" }}>Ledgerly</div>
        <div className="text-xs text-muted-foreground truncate">AI Accountant</div>
      </div>
    </div>
  );
}

function NavList({ onNavigate }) {
  return (
    <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
      {nav.map((n) => {
        const Icon = n.icon;
        return (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={onNavigate}
            data-testid={`nav-${n.id}`}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`
            }
          >
            <Icon size={18} weight="duotone" className="shrink-0" />
            <span className="truncate">{n.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

function AccountFooter({ email, onLogout }) {
  return (
    <div className="px-3 py-3 border-t border-border">
      <div className="px-3 py-1.5 text-xs text-muted-foreground truncate">{email}</div>
      <button onClick={onLogout} data-testid="admin-logout"
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
        <SignOut size={18} weight="duotone" /> Sign out
      </button>
    </div>
  );
}

export default function Layout() {
  const loc = useLocation();
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile drawer automatically whenever the route changes.
  useEffect(() => { setDrawerOpen(false); }, [loc.pathname]);

  const activeLabel = nav.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))?.label || "Ledgerly";

  return (
    <div className="min-h-screen flex bg-background text-foreground overflow-x-hidden">
      {/* Desktop sidebar — hidden below lg, where the drawer takes over */}
      <aside className="w-64 shrink-0 border-r border-border bg-muted/40 hidden lg:flex flex-col fixed h-screen">
        <Brand />
        <NavList />
        <AccountFooter email={user?.email} onLogout={logout} />
      </aside>

      {/* Mobile / tablet slide-out drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="p-0 w-72 flex flex-col bg-background" data-testid="mobile-nav-drawer">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Ledgerly ERP navigation menu</SheetDescription>
          <Brand />
          <NavList onNavigate={() => setDrawerOpen(false)} />
          <AccountFooter email={user?.email} onLogout={logout} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 lg:ml-64 min-w-0 flex flex-col">
        <header className="lg:hidden sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border px-4 h-14 flex items-center gap-3">
          <Button
            variant="ghost" size="icon" data-testid="mobile-menu-btn"
            onClick={() => setDrawerOpen(true)} className="shrink-0 -ml-2 h-9 w-9"
            aria-label="Open navigation menu"
          >
            <List size={22} />
          </Button>
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <span className="font-medium text-sm truncate" style={{ fontFamily: "Manrope" }}>{activeLabel}</span>
          </div>
        </header>

        <motion.main
          key={loc.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 min-w-0"
        >
          <ErrorBoundary resetKey={loc.pathname}>
            <Outlet />
          </ErrorBoundary>
        </motion.main>
      </div>
    </div>
  );
}
