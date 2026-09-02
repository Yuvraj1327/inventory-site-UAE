import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartBar, MagnifyingGlass, ShoppingBagOpen } from "@phosphor-icons/react";

function Stat({ label, value }) {
  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-light mt-1" style={{ fontFamily: "Manrope" }}>{value}</div>
    </Card>
  );
}

export default function CustomerIntelligence() {
  const [summary, setSummary] = useState(null);
  const [topSearched, setTopSearched] = useState(null);
  const [topBrandsViewed, setTopBrandsViewed] = useState(null);
  const [topPurchasedParts, setTopPurchasedParts] = useState(null);
  const [topPurchasedBrands, setTopPurchasedBrands] = useState(null);

  useEffect(() => {
    api.get("/traffic/summary").then((r) => setSummary(r.data)).catch(() => setSummary({ total_events: 0, by_activity_type: {}, active_customers: [] }));
    api.get("/traffic/top-parts").then((r) => setTopSearched(r.data)).catch(() => setTopSearched([]));
    api.get("/traffic/top-brands").then((r) => setTopBrandsViewed(r.data)).catch(() => setTopBrandsViewed([]));
    api.get("/traffic/most-purchased-parts").then((r) => setTopPurchasedParts(r.data)).catch(() => setTopPurchasedParts([]));
    api.get("/traffic/most-purchased-brands").then((r) => setTopPurchasedBrands(r.data)).catch(() => setTopPurchasedBrands([]));
  }, []);

  return (
    <div className="space-y-8" data-testid="customer-intelligence-page">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">Phase 9</div>
        <h1 className="text-4xl sm:text-5xl tracking-tight font-light mt-1" style={{ fontFamily: "Manrope" }}>Customer Intelligence</h1>
        <p className="text-muted-foreground mt-2 text-sm">Browsing &amp; demand signal is shown separately from actual purchases below — the two are never mixed.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Total Activity Events" value={summary?.total_events ?? "…"} />
        <Stat label="Active Customers" value={summary?.active_customers?.length ?? "…"} />
        <Stat label="Searches Logged" value={summary?.by_activity_type?.part_search ?? 0} />
        <Stat label="Orders Placed (Portal)" value={summary?.by_activity_type?.order_placed ?? 0} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="text-sm font-medium mb-1 flex items-center gap-2"><MagnifyingGlass size={16} /> Most searched / viewed parts <span className="text-xs font-normal text-muted-foreground">— demand, not sales</span></h2>
          {topSearched === null ? <p className="text-sm text-muted-foreground mt-3">Loading…</p> : topSearched.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-3">No search activity logged yet.</p>
          ) : (
            <div className="overflow-x-auto"><Table className="mt-3">
              <TableHeader><TableRow><TableHead>Part</TableHead><TableHead>Brand</TableHead><TableHead className="text-right">Views</TableHead></TableRow></TableHeader>
              <TableBody>{topSearched.map((r) => (
                <TableRow key={r.product_id}><TableCell className="font-mono text-xs">{r.part_number}</TableCell><TableCell className="text-muted-foreground">{r.brand}</TableCell><TableCell className="text-right">{r.views}</TableCell></TableRow>
              ))}</TableBody>
            </Table></div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-medium mb-1 flex items-center gap-2"><ChartBar size={16} /> Most viewed brands <span className="text-xs font-normal text-muted-foreground">— demand, not sales</span></h2>
          {topBrandsViewed === null ? <p className="text-sm text-muted-foreground mt-3">Loading…</p> : topBrandsViewed.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-3">No brand-view activity logged yet.</p>
          ) : (
            <div className="overflow-x-auto"><Table className="mt-3">
              <TableHeader><TableRow><TableHead>Brand</TableHead><TableHead className="text-right">Views</TableHead></TableRow></TableHeader>
              <TableBody>{topBrandsViewed.map((r) => (
                <TableRow key={r.brand}><TableCell>{r.brand}</TableCell><TableCell className="text-right">{r.views}</TableCell></TableRow>
              ))}</TableBody>
            </Table></div>
          )}
        </Card>

        <Card className="p-5 border-success/30">
          <h2 className="text-sm font-medium mb-1 flex items-center gap-2 text-success"><ShoppingBagOpen size={16} /> Most purchased parts <span className="text-xs font-normal text-muted-foreground">— actual sales</span></h2>
          {topPurchasedParts === null ? <p className="text-sm text-muted-foreground mt-3">Loading…</p> : topPurchasedParts.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-3">No invoiced sales yet.</p>
          ) : (
            <div className="overflow-x-auto"><Table className="mt-3">
              <TableHeader><TableRow><TableHead>Part</TableHead><TableHead className="text-right">Qty Sold</TableHead></TableRow></TableHeader>
              <TableBody>{topPurchasedParts.map((r) => (
                <TableRow key={r.part_number}><TableCell className="font-mono text-xs">{r.part_number}</TableCell><TableCell className="text-right">{r.qty_sold}</TableCell></TableRow>
              ))}</TableBody>
            </Table></div>
          )}
        </Card>

        <Card className="p-5 border-success/30">
          <h2 className="text-sm font-medium mb-1 flex items-center gap-2 text-success"><ShoppingBagOpen size={16} /> Most purchased brands <span className="text-xs font-normal text-muted-foreground">— actual sales</span></h2>
          {topPurchasedBrands === null ? <p className="text-sm text-muted-foreground mt-3">Loading…</p> : topPurchasedBrands.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-3">No invoiced sales yet.</p>
          ) : (
            <div className="overflow-x-auto"><Table className="mt-3">
              <TableHeader><TableRow><TableHead>Brand</TableHead><TableHead className="text-right">Qty Sold</TableHead></TableRow></TableHeader>
              <TableBody>{topPurchasedBrands.map((r) => (
                <TableRow key={r.brand}><TableCell>{r.brand}</TableCell><TableCell className="text-right">{r.qty_sold}</TableCell></TableRow>
              ))}</TableBody>
            </Table></div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-medium mb-3">Most active customers</h2>
        {!summary || summary.active_customers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No customer activity logged yet.</p>
        ) : (
          <div className="overflow-x-auto"><Table>
            <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead className="text-right">Activity Events</TableHead><TableHead>Last Activity</TableHead></TableRow></TableHeader>
            <TableBody>
              {summary.active_customers.map((c) => (
                <TableRow key={c.customer_id}><TableCell>{c.customer}</TableCell><TableCell className="text-right">{c.activity_count}</TableCell><TableCell className="text-muted-foreground text-xs">{c.last_activity?.slice(0, 10) || "—"}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table></div>
        )}
      </Card>
    </div>
  );
}
