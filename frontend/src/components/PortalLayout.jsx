import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  SquaresFour, Package, MagnifyingGlass, Wallet as WalletIcon, ChatCircleText,
  BellRinging, SignOut, CaretDown, List, EnvelopeSimple, Phone,
} from "@phosphor-icons/react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import alRiggaLogo from "@/assets/al-rigga-icon.png";

const NAV = [
  { to: "/portal", label: "Dashboard", icon: SquaresFour },
  { to: "/portal/new-order", label: "New Order", icon: Package },
  { to: "/portal/orders", label: "Search Orders", icon: MagnifyingGlass },
  { to: "/portal/account", label: "Accounts", icon: WalletIcon },
];

export default function PortalLayout({ children, active }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [recentOrders, setRecentOrders] = useState([]);

  useEffect(() => {
    // Notifications reuse the customer's own order data (real, no fabricated
    // alerts) — just surfaced as a quick "what's changed lately" list.
    api.get("/portal/orders").then((r) => setRecentOrders((r.data || []).slice(0, 5))).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="portal-root">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <button className="lg:hidden -ml-1 h-9 w-9 flex items-center justify-center" onClick={() => setDrawerOpen(true)} aria-label="Menu">
            <List size={20} />
          </button>

          <button onClick={() => navigate("/portal")} className="flex items-center gap-2.5 shrink-0" data-testid="portal-brand">
            <div className="h-9 w-9 shrink-0 flex items-center justify-center"><img src={alRiggaLogo} alt="Al Rigga Auto" className="h-8 w-auto object-contain" /></div>
            <div className="leading-tight text-left hidden sm:block">
              <div className="font-bold text-sm tracking-tight" style={{ fontFamily: "Manrope" }}>Al Rigga Auto</div>
              <div className="text-[10px] text-muted-foreground">Automotive Spare Parts</div>
            </div>
          </button>

          <nav className="hidden lg:flex items-center gap-1 ml-4">
            {NAV.map((n) => (
              <button key={n.to} onClick={() => navigate(n.to)} data-testid={`portal-nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors flex items-center gap-1.5 ${active === n.to ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-accent"}`}>
                <n.icon size={14} weight="duotone" /> {n.label}
              </button>
            ))}
          </nav>

          <div className="flex-1" />

          <button onClick={() => setFeedbackOpen(true)} data-testid="portal-feedback-btn"
            className="hidden sm:flex h-9 items-center gap-1.5 px-2.5 rounded-md text-xs text-muted-foreground hover:bg-accent transition-colors">
            <ChatCircleText size={16} /> Feedback
          </button>

          <Popover>
            <PopoverTrigger asChild>
              <button className="h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent transition-colors relative" data-testid="portal-notifications-btn">
                <BellRinging size={17} />
                {recentOrders.length > 0 && <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-primary" />}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0">
              <div className="px-3.5 py-2.5 border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent order activity</div>
              {recentOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground px-3.5 py-4">No orders yet.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  {recentOrders.map((o) => (
                    <button key={o._id || o.id} onClick={() => navigate("/portal#orders")} className="w-full text-left px-3.5 py-2.5 hover:bg-accent transition-colors border-b border-border/60 last:border-0">
                      <div className="text-sm font-medium font-mono">{o.order_number}</div>
                      <div className="text-xs text-muted-foreground capitalize">{o.status || "open"}</div>
                    </button>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 pl-1.5 pr-2 h-9 rounded-md hover:bg-accent transition-colors ml-1" data-testid="portal-profile-btn">
                <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium shrink-0">
                  {(user?.email || "?").slice(0, 1).toUpperCase()}
                </div>
                <CaretDown size={12} className="hidden sm:block text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="text-sm font-medium truncate">{user?.email}</div>
                <div className="text-xs text-muted-foreground">Customer account</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setFeedbackOpen(true)} className="sm:hidden gap-2"><ChatCircleText size={15} /> Feedback</DropdownMenuItem>
              <DropdownMenuItem onClick={logout} data-testid="portal-logout" className="text-destructive focus:text-destructive gap-2">
                <SignOut size={15} /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="p-0 w-64">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Al Rigga Auto customer portal navigation</SheetDescription>
          <div className="h-14 flex items-center gap-2.5 px-4 border-b border-border" style={{ fontFamily: "Manrope" }}>
            <img src={alRiggaLogo} alt="Al Rigga Auto" className="h-7 w-auto object-contain" />
            <span className="font-semibold text-sm">Al Rigga Auto</span>
          </div>
          <nav className="p-2 space-y-0.5">
            {NAV.map((n) => (
              <button key={n.to} onClick={() => { navigate(n.to); setDrawerOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium ${active === n.to ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                <n.icon size={16} weight="duotone" /> {n.label}
              </button>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Contact support</DialogTitle>
            <DialogDescription>We don't have an in-app feedback inbox yet — reach us directly and we'll follow up.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <a href="mailto:support@alriggaauto.com" className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border hover:bg-accent transition-colors">
              <EnvelopeSimple size={18} className="text-primary" /> support@alriggaauto.com
            </a>
            <a href="tel:+97140000000" className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border hover:bg-accent transition-colors">
              <Phone size={18} className="text-primary" /> +971 4 000 0000
            </a>
          </div>
        </DialogContent>
      </Dialog>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6" data-testid="portal-layout-main">
        {children}
      </main>
    </div>
  );
}
