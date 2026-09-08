import { useEffect, useState } from "react";
import { api, money, fmtDate } from "@/lib/api";
import { printInvoice, printSoa } from "@/lib/pdf";
import PortalLayout from "@/components/PortalLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Buildings, CreditCard, FilePdf, Receipt, MapPin, Phone, EnvelopeSimple } from "@phosphor-icons/react";

const TONE = { default: "text-foreground", up: "text-success", warn: "text-warning", down: "text-destructive" };

const Stat = ({ label, value, tone = "default" }) => (
  <Card className="p-4 shadow-card">
    <div className="text-[10.5px] uppercase tracking-[0.12em] font-bold text-muted-foreground">{label}</div>
    <div className={`mt-2 text-2xl font-mono tabular font-bold ${TONE[tone]}`}>${value}</div>
  </Card>
);

export default function PortalAccount() {
  const [account, setAccount] = useState(null);
  const [soa, setSoa] = useState(null);
  const [invoices, setInvoices] = useState(null);

  useEffect(() => {
    api.get("/portal/account").then((r) => setAccount(r.data)).catch(() => setAccount({}));
    api.get("/portal/soa").then((r) => setSoa(r.data)).catch(() => setSoa({}));
    api.get("/portal/invoices").then((r) => setInvoices(r.data)).catch(() => setInvoices([]));
  }, []);

  const balance = soa?.balance ?? 0;
  const creditLimit = account?.credit_limit ?? 0;
  const availableCredit = account ? Math.max(0, creditLimit - balance) : null;

  return (
    <PortalLayout active="/portal/account">
      <div className="space-y-6" data-testid="portal-account-page">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-muted-foreground">Account</div>
          <h1 className="text-3xl font-bold tracking-tight mt-0.5" style={{ fontFamily: "Manrope" }}>{account?.name || "—"}</h1>
        </div>

        {/* Credit & balance — the numbers that matter most, first and biggest */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Stat label="Outstanding Balance" value={money(balance)} tone={balance > 0 ? "warn" : "default"} />
          <Stat label="Credit Limit" value={money(creditLimit)} />
          <Stat label="Available Credit" value={availableCredit != null ? money(availableCredit) : "—"} tone="up" />
        </div>

        {/* Company profile */}
        <Card className="p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <Buildings size={16} className="text-muted-foreground" />
            <h3 className="text-base font-bold" style={{ fontFamily: "Manrope" }}>Company Information</h3>
          </div>
          {!account ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <Field label="Company Name" value={account.company || account.name} />
              <Field label="Account Number" value={account.account_no} mono />
              <Field label="Tax Registration Number" value={account.tax_registration_number} mono />
              <Field label="Payment Terms" value={account.payment_terms_days != null ? `${account.payment_terms_days} days` : null} />
              <Field label="Country" value={account.country} icon={MapPin} />
              <Field label="City" value={account.city} icon={MapPin} />
              <Field label="Phone" value={account.phone || account.mobile} icon={Phone} />
              <Field label="Email" value={account.email} icon={EnvelopeSimple} />
            </div>
          )}
        </Card>

        {/* Statement of account */}
        <Card className="p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CreditCard size={16} className="text-muted-foreground" />
              <h3 className="text-base font-bold" style={{ fontFamily: "Manrope" }}>Statement of Account</h3>
            </div>
            {soa && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => printSoa(soa)} data-testid="download-soa-btn">
                <FilePdf size={14} /> Download
              </Button>
            )}
          </div>
          {soa === null ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : !soa.rows || soa.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No transactions on record.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Reference</TableHead>
                  <TableHead className="text-right">Billed</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Balance</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {soa.rows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(r.date)}</TableCell>
                      <TableCell className="text-xs">{r.type}</TableCell>
                      <TableCell className="text-xs font-mono">{r.ref || r.order_number || "—"}</TableCell>
                      <TableCell className="text-right font-mono tabular text-xs">{r.billed ? `$${money(r.billed)}` : "—"}</TableCell>
                      <TableCell className="text-right font-mono tabular text-xs">{r.paid ? `$${money(r.paid)}` : "—"}</TableCell>
                      <TableCell className="text-right font-mono tabular text-xs font-semibold">${money(r.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        {/* Invoices */}
        <Card className="p-5 shadow-card overflow-hidden">
          <div className="flex items-center gap-2 mb-4">
            <Receipt size={16} className="text-muted-foreground" />
            <h3 className="text-base font-bold" style={{ fontFamily: "Manrope" }}>Invoices</h3>
          </div>
          {invoices === null ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No invoices yet.</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Invoice No.</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv._id || inv.id}>
                      <TableCell className="font-mono text-xs font-medium">{inv.invoice_number}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(inv.date)}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize text-[10px]">{inv.status}</Badge></TableCell>
                      <TableCell className="text-right font-mono tabular text-xs font-semibold">${money(inv.total)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => printInvoice(inv)}>
                          <FilePdf size={13} /> PDF
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
    </PortalLayout>
  );
}

const Field = ({ label, value, mono, icon: Icon }) => (
  <div>
    <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
    <div className={`flex items-center gap-1.5 ${mono ? "font-mono" : ""} ${value ? "" : "text-muted-foreground"}`}>
      {Icon && <Icon size={13} className="text-muted-foreground shrink-0" />}
      {value || "—"}
    </div>
  </div>
);
