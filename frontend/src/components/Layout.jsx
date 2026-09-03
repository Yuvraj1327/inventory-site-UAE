import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  SquaresFour, Receipt, Package, UsersThree, Truck, Scan, Sparkle, Wallet,
  BellRinging, Cube, ShoppingCart, FileText, SignOut, TrendDown, ChartLineUp,
  Robot, ChartBar, Calculator, List, CaretLeft, MagnifyingGlass, CaretDown,
} from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ErrorBoundary from "@/components/ErrorBoundary";

// Grouped per the ERP's actual modules — collapsed to icon-only on desktop,
// full labels in the mobile drawer where width isn't at a premium.
const NAV_GROUPS = [
  { title: "Main", items: [
    { to: "/", label: "Dashboard", icon: SquaresFour, end: true, id: "dashboard" },
    { to: "/transactions", label: "Transactions", icon: Receipt, id: "transactions" },
    { to: "/orders", label: "Orders Follow-Up", icon: Package, id: "orders" },
  ]},
  { title: "Inventory", items: [
    { to: "/inventory", label: "Inventory", icon: Cube, id: "inventory" },
    { to: "/purchases", label: "Purchases", icon: ShoppingCart, id: "purchases" },
    { to: "/suppliers", label: "Suppliers", icon: Truck, id: "suppliers" },
    { to: "/lost-sales", label: "Lost Sales", icon: TrendDown, id: "lost-sales" },
    { to: "/supplier-monitoring", label: "Supplier Monitoring", icon: ChartLineUp, id: "supplier-monitoring" },
  ]},
  { title: "Sales", items: [
    { to: "/invoices", label: "Invoices", icon: FileText, id: "invoices" },
    { to: "/customers", label: "Customers", icon: UsersThree, id: "customers" },
    { to: "/customer-intelligence", label: "Customer Intelligence", icon: ChartBar, id: "customer-intelligence" },
  ]},
  { title: "Finance", items: [
    { to: "/accounting", label: "Accounting", icon: Calculator, id: "accounting" },
    { to: "/reminders", label: "Payment Reminders", icon: BellRinging, id: "reminders" },
  ]},
  { title: "AI", items: [
    { to: "/scanner", label: "Receipt Scanner", icon: Scan, id: "scanner" },
    { to: "/ai-agent", label: "AI Control Center", icon: Robot, id: "ai-agent" },
    { to: "/assistant", label: "AI Assistant", icon: Sparkle, id: "assistant" },
  ]},
];
const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

function Brand({ collapsed }) {
  return (
    <div className={`flex items-center gap-2.5 shrink-0 ${collapsed ? "justify-center" : ""}`}>
      <div className="h-9 w-9 shrink-0 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
        <Wallet size={18} weight="duotone" />
      </div>
      {!collapsed && (
        <div className="leading-tight min-w-0">
          <div className="font-semibold text-[14px] truncate tracking-tight" style={{ fontFamily: "Manrope" }}>Al Rigga Auto</div>
          <div className="text-[11px] text-muted-foreground truncate">Automotive ERP</div>
        </div>
      )}
    </div>
  );
}

function NavList({ collapsed, onNavigate }) {
  return (
    <nav className="flex-1 px-2.5 py-3 space-y-4 overflow-y-auto overflow-x-hidden">
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          {!collapsed && (
            <div className="px-2.5 mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">{group.title}</div>
          )}
          <div className="space-y-0.5">
            {group.items.map((n) => {
              const Icon = n.icon;
              return (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  onClick={onNavigate}
                  data-testid={`nav-${n.id}`}
                  title={collapsed ? n.label : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-md text-[13px] font-medium transition-colors ${collapsed ? "justify-center px-2 py-2" : "px-2.5 py-1.5"} ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground/70 hover:bg-accent hover:text-foreground"
                    }`
                  }
                >
                  <Icon size={16} weight="duotone" className="shrink-0" />
                  {!collapsed && <span className="truncate">{n.label}</span>}
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export default function Layout() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "1"; } catch { return false; }
  });
  const [search, setSearch] = useState("");

  useEffect(() => { setDrawerOpen(false); }, [loc.pathname]);
  useEffect(() => {
    try { localStorage.setItem("sidebar-collapsed", collapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [collapsed]);

  const activeItem = ALL_ITEMS.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)));

  // Lightweight client-side jump to a matching module by name — avoids
  // promising a full cross-entity search the backend doesn't provide.
  const runSearch = (e) => {
    e.preventDefault();
    const q = search.trim().toLowerCase();
    if (!q) return;
    const match = ALL_ITEMS.find((n) => n.label.toLowerCase().includes(q));
    if (match) { navigate(match.to); setSearch(""); }
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground overflow-x-hidden">
      {/* Desktop sidebar */}
      <aside className={`shrink-0 border-r border-border bg-card hidden lg:flex flex-col fixed h-screen z-30 transition-all duration-200 ${collapsed ? "w-[68px]" : "w-60"}`}>
        <div className="h-14 flex items-center px-3 border-b border-border shrink-0">
          <Brand collapsed={collapsed} />
        </div>
        <NavList collapsed={collapsed} />
        <div className="p-2.5 border-t border-border shrink-0">
          <button
            onClick={() => setCollapsed((c) => !c)}
            data-testid="sidebar-collapse-btn"
            className="w-full flex items-center justify-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <CaretLeft size={14} className={`transition-transform ${collapsed ? "rotate-180" : ""}`} />
            {!collapsed && "Collapse"}
          </button>
        </div>
      </aside>

      {/* Mobile / tablet slide-out drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="p-0 w-72 flex flex-col bg-background" data-testid="mobile-nav-drawer">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Al Rigga Auto navigation menu</SheetDescription>
          <div className="h-14 flex items-center px-4 border-b border-border shrink-0"><Brand collapsed={false} /></div>
          <NavList collapsed={false} onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className={`flex-1 min-w-0 flex flex-col transition-all duration-200 ${collapsed ? "lg:ml-[68px]" : "lg:ml-60"}`}>
        {/* Top navbar */}
        <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border h-14 flex items-center gap-3 px-4 sm:px-6">
          <Button variant="ghost" size="icon" data-testid="mobile-menu-btn" onClick={() => setDrawerOpen(true)}
            className="lg:hidden shrink-0 -ml-2 h-9 w-9" aria-label="Open navigation menu">
            <List size={20} />
          </Button>

          <div className="lg:hidden font-medium text-sm truncate" style={{ fontFamily: "Manrope" }}>{activeItem?.label || "Al Rigga Auto"}</div>

          <form onSubmit={runSearch} className="hidden md:flex flex-1 max-w-md relative">
            <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search modules…" data-testid="global-search"
              className="h-9 pl-9 bg-muted/50 border-transparent focus-visible:bg-background text-sm"
            />
          </form>

          <div className="flex-1 md:hidden" />

          <div className="flex items-center gap-1.5 shrink-0">
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" data-testid="notifications-btn"
              onClick={() => navigate("/reminders")} aria-label="Payment reminders" title="Payment reminders">
              <BellRinging size={18} />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button data-testid="profile-menu-btn" className="flex items-center gap-2 pl-1.5 pr-2 h-9 rounded-md hover:bg-accent transition-colors">
                  <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium shrink-0">
                    {(user?.email || "?").slice(0, 1).toUpperCase()}
                  </div>
                  <span className="hidden sm:block text-xs text-muted-foreground max-w-[140px] truncate">{user?.email}</span>
                  <CaretDown size={12} className="hidden sm:block text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="text-sm font-medium truncate">{user?.email}</div>
                  <div className="text-xs text-muted-foreground capitalize">{user?.role}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} data-testid="admin-logout" className="text-destructive focus:text-destructive gap-2">
                  <SignOut size={15} /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <motion.main
          key={loc.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 min-w-0"
        >
          <ErrorBoundary resetKey={loc.pathname}>
            <Outlet />
          </ErrorBoundary>
        </motion.main>
      </div>
    </div>
  );
}
