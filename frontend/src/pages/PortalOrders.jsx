import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, money, fmtDate } from "@/lib/api";
import PortalLayout from "@/components/PortalLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Package, Eye, MagnifyingGlass } from "@phosphor-icons/react";

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

export default function PortalOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [viewOrder, setViewOrder] = useState(null);
  const [viewLines, setViewLines] = useState(null);
  const linesCache = useState({})[0];

  useEffect(() => {
    api.get("/portal/orders").then((r) => setOrders(r.data)).catch(() => setOrders([]));
  }, []);

  const openOrder = (o) => {
    setViewOrder(o);
    const id = o._id || o.id;
    if (linesCache[id]) { setViewLines(linesCache[id]); return; }
    setViewLines(null);
    api.get(`/portal/orders/${id}/lines`).then((r) => { linesCache[id] = r.data; setViewLines(r.data); }).catch(() => setViewLines([]));
  };

  const filtered = useMemo(() => {
    let rows = orders || [];
    if (statusFilter !== "all") rows = rows.filter((o) => o.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((o) => o.order_number?.toLowerCase().includes(q));
    return rows;
  }, [orders, statusFilter, search]);

  return (
    <PortalLayout active="/portal/orders">
      <div className="space-y-5" data-testid="portal-orders-page">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-muted-foreground">Orders</div>
          <h1 className="text-3xl font-bold tracking-tight mt-0.5" style={{ fontFamily: "Manrope" }}>Search Orders</h1>
        </div>

        <Card className="shadow-card overflow-hidden">
          <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="flex gap-1 bg-muted/60 rounded-lg p-0.5 overflow-x-auto">
              {STATUS_TABS.map((t) => (
                <button key={t.key} onClick={() => setStatusFilter(t.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${statusFilter === t.key ? "bg-background shadow-sm font-bold" : "text-muted-foreground hover:text-foreground"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-56">
              <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search order number…" value={search} onChange={(e) => setSearch(e.target.value)}
                data-testid="portal-order-search" className="h-9 pl-8 text-sm" />
            </div>
          </div>

          {orders === null ? (
            <p className="text-sm text-muted-foreground py-12 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
              <Package size={32} weight="duotone" />
              <p className="text-sm">No orders match.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Order No.</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {filtered.map((o) => (
                    <TableRow key={o._id || o.id} data-testid={`portal-order-${o._id || o.id}`}>
                      <TableCell className="font-mono font-bold">{o.order_number}</TableCell>
                      <TableCell className="text-muted-foreground">{fmtDate(o.order_date)}</TableCell>
                      <TableCell className="text-right font-mono tabular font-semibold">${money(o.selling_value)}</TableCell>
                      <TableCell><Badge variant="outline" className={`capitalize ${STATUS_BADGE[o.status] || ""}`}>{o.status === "shipped" ? "Completed" : (o.status || "open")}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => openOrder(o)} data-testid={`view-order-${o._id || o.id}`}>
                          <Eye size={13} /> View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={!!viewOrder} onOpenChange={(open) => !open && setViewOrder(null)}>
        <DialogContent className="max-w-2xl" data-testid="order-detail-dialog">
          <DialogHeader><DialogTitle className="font-mono">{viewOrder?.order_number}</DialogTitle></DialogHeader>
          {viewLines === null ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading items…</p>
          ) : viewLines.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No items on this order.</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Part Number</TableHead><TableHead>Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Price</TableHead><TableHead className="text-right">Total</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {viewLines.map((li) => (
                    <TableRow key={li.id}>
                      <TableCell className="font-mono text-xs">{li.part_number}</TableCell>
                      <TableCell className="text-xs">{li.description}</TableCell>
                      <TableCell className="text-right">{li.order_qty}</TableCell>
                      <TableCell className="text-right font-mono tabular text-xs">${money(li.unit_selling_price)}</TableCell>
                      <TableCell className="text-right font-mono tabular text-xs">${money(li.order_qty * li.unit_selling_price)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}
