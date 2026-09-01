import { useEffect, useState } from "react";
import { api, money, fmtDate } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { printInvoice, printSoa } from "@/lib/pdf";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wallet, SignOut, FilePdf, Receipt, FileText, Package, CheckCircle } from "@phosphor-icons/react";

const CHECK_KEYS = ["pricing_status", "pi_status", "supplier_pkl", "customer_pkl", "delivery_status"];

export default function Portal() {
  const { user, logout } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [orders, setOrders] = useState([]);
  const [soa, setSoa] = useState(null);

  useEffect(() => {
    api.get("/portal/invoices").then((r) => setInvoices(r.data)).catch(() => {});
    api.get("/portal/orders").then((r) => setOrders(r.data)).catch(() => {});
    api.get("/portal/soa").then((r) => setSoa(r.data)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center"><Wallet size={20} weight="duotone" /></div>
            <div>
              <div className="font-semibold text-[15px]" style={{ fontFamily: "Manrope" }}>Ledgerly</div>
              <div className="text-xs text-muted-foreground">Customer Portal</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium">{user?.customer_name}</div>
              <div className="text-xs text-muted-foreground">{user?.email}</div>
            </div>
            <Button variant="secondary" size="sm" onClick={logout} data-testid="portal-logout" className="rounded-full gap-2"><SignOut size={16} /> Sign out</Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 sm:px-8 py-8 space-y-8" data-testid="portal-page">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">Welcome</div>
          <h1 className="text-4xl sm:text-5xl tracking-tight font-light mt-1" style={{ fontFamily: "Manrope" }}>{user?.customer_name}</h1>
        </div>

        {soa && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <Stat label="Total Billed" value={`$${money(soa.total_billed)}`} />
            <Stat label="Total Paid" value={`$${money(soa.total_paid)}`} tone="up" />
            <Stat label="Balance Due" value={`$${money(soa.balance)}`} tone={soa.balance > 0 ? "down" : "up"} />
          </div>
        )}

        <Tabs defaultValue="invoices">
          <TabsList data-testid="portal-tabs">
            <TabsTrigger value="invoices" data-testid="tab-invoices">Invoices</TabsTrigger>
            <TabsTrigger value="statement" data-testid="tab-statement">Statement</TabsTrigger>
            <TabsTrigger value="orders" data-testid="tab-orders">Order Status</TabsTrigger>
          </TabsList>

          <TabsContent value="invoices" className="mt-5">
            <Card className="bg-white border-border/60 shadow-sm rounded-xl overflow-hidden">
              {invoices.length === 0 ? (
                <Empty icon={Receipt} text="No invoices yet." />
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead><TableHead className="text-right">PDF</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv._id} data-testid={`portal-invoice-${inv._id}`}>
                        <TableCell className="font-mono font-medium">{inv.invoice_number}</TableCell>
                        <TableCell className="text-muted-foreground">{fmtDate(inv.date)}</TableCell>
                        <TableCell><Badge className={inv.status === "paid" ? "bg-success/15 text-success border-success/30" : "bg-warning/15 text-warning border-warning/30"} variant="outline">{inv.status}</Badge></TableCell>
                        <TableCell className="text-right font-mono tabular">${money(inv.total)}</TableCell>
                        <TableCell className="text-right">
                          <button onClick={() => printInvoice(inv)} data-testid={`portal-pdf-invoice-${inv._id}`} className="text-primary hover:underline flex items-center gap-1.5 text-sm ml-auto"><FilePdf size={16} weight="duotone" /> Download</button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="statement" className="mt-5">
            <Card className="bg-white border-border/60 shadow-sm rounded-xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xl font-medium" style={{ fontFamily: "Manrope" }}>Statement of Account</h3>
                {soa && <Button variant="secondary" onClick={() => printSoa(soa)} data-testid="portal-soa-pdf" className="rounded-full gap-2"><FilePdf size={16} weight="duotone" /> Download PDF</Button>}
              </div>
              {!soa || soa.rows.length === 0 ? (
                <Empty icon={FileText} text="No account activity yet." />
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Order</TableHead><TableHead>Date</TableHead>
                    <TableHead className="text-right">Billed</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Balance</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {soa.rows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono">{r.order_number}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{fmtDate(r.date)}</TableCell>
                        <TableCell className="text-right font-mono tabular">${money(r.billed)}</TableCell>
                        <TableCell className="text-right font-mono tabular text-success">${money(r.paid)}</TableCell>
                        <TableCell className="text-right font-mono tabular">${money(r.balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="orders" className="mt-5">
            <Card className="bg-white border-border/60 shadow-sm rounded-xl overflow-hidden">
              {orders.length === 0 ? (
                <Empty icon={Package} text="No orders yet." />
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Order No.</TableHead><TableHead>Date</TableHead>
                    <TableHead>Pricing</TableHead><TableHead>PI</TableHead><TableHead>Delivered</TableHead>
                    <TableHead className="text-right">Progress</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {orders.map((o) => {
                      const done = CHECK_KEYS.filter((k) => o[k]).length;
                      return (
                        <TableRow key={o._id} data-testid={`portal-order-${o._id}`}>
                          <TableCell className="font-mono font-medium">{o.order_number}</TableCell>
                          <TableCell className="text-muted-foreground">{fmtDate(o.order_date)}</TableCell>
                          <TableCell><Chk v={o.pricing_status} /></TableCell>
                          <TableCell><Chk v={o.pi_status} /></TableCell>
                          <TableCell><Chk v={o.delivery_status} /></TableCell>
                          <TableCell className="text-right"><Badge variant="secondary" className="font-mono">{done}/5</Badge></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

const Chk = ({ v }) => (v ? <CheckCircle size={18} weight="fill" className="text-success" /> : <span className="text-muted-foreground">—</span>);
const Stat = ({ label, value, tone }) => (
  <Card className="p-6 bg-white border-border/60 shadow-sm rounded-xl">
    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
    <div className={`mt-3 text-2xl font-mono tabular ${tone === "up" ? "text-success" : tone === "down" ? "text-destructive" : ""}`}>{value}</div>
  </Card>
);
const Empty = ({ icon: Icon, text }) => (
  <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground"><Icon size={38} weight="duotone" /><p className="text-sm">{text}</p></div>
);
