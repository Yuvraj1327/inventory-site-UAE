import { useEffect, useState, useMemo } from "react";
import { api, money, fmtDate } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash, FileText, UsersThree, Truck, FilePdf, Key } from "@phosphor-icons/react";
import { toast } from "sonner";

const BRANDS = [
  "Toyota", "Lexus", "Honda", "Nissan", "Mitsubishi", "Mazda", "Suzuki", "Isuzu", "Subaru",
  "Ford", "Chevrolet", "GMC", "Cadillac", "Dodge", "Jeep", "Chrysler", "RAM", "Tesla",
  "BMW", "Mercedes-Benz", "Audi", "Volkswagen", "Porsche", "Volvo", "Opel", "MINI",
  "Land Rover", "Range Rover", "Jaguar", "Bentley", "Rolls-Royce", "Aston Martin",
  "Ferrari", "Lamborghini", "Maserati", "Peugeot", "Renault", "Citroen", "Fiat", "Skoda", "SEAT",
  "Hyundai", "Kia", "Genesis", "Infiniti", "Acura", "MG", "BYD", "Chery", "Geely", "Great Wall",
  "Changan", "GAC", "Haval", "Other",
];

const makeLpo = (name, phone) => {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  const abbr = words.length >= 2
    ? words.slice(0, 4).map((w) => w[0]).join("").toUpperCase()
    : (name || "").trim().slice(0, 3).toUpperCase();
  const digits = (phone || "").replace(/\D/g, "");
  return abbr + digits.slice(-2);
};

const emptyForm = {
  name: "", company: "", email: "", mobile: "", whatsapp: "", phone: "",
  office_address: "", country: "", city: "", brand_focus: "", special_note: "",
};

export default function Parties({ kind }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [countryCode, setCountryCode] = useState("");
  // country-state-city ships ~17MB of worldwide location data — load it
  // as its own chunk in the background instead of bundling it into this
  // page's initial JS, so the page itself opens fast. The dropdowns are
  // simply empty for the brief moment before it resolves.
  const [geo, setGeo] = useState(null);
  useEffect(() => { import("country-state-city").then((m) => setGeo(m)); }, []);
  const [soa, setSoa] = useState(null);
  const [soaOpen, setSoaOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginFor, setLoginFor] = useState(null);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [purOpen, setPurOpen] = useState(false);
  const [supPur, setSupPur] = useState([]);
  const [purFor, setPurFor] = useState("");

  const viewPurchases = async (name) => {
    const r = await api.get(`/purchases?supplier=${encodeURIComponent(name)}`);
    setSupPur(r.data); setPurFor(name); setPurOpen(true);
  };

  const countries = useMemo(() => (geo ? geo.Country.getAllCountries() : []), [geo]);
  const cities = useMemo(() => (geo && countryCode ? geo.City.getCitiesOfCountry(countryCode) : []).slice(0, 1000), [geo, countryCode]);
  const lpoPreview = useMemo(() => makeLpo(form.name, form.mobile || form.phone), [form.name, form.mobile, form.phone]);

  const onCountry = (code) => {
    const c = countries.find((x) => x.isoCode === code);
    setCountryCode(code);
    setForm((f) => ({ ...f, country: c ? c.name : "", city: "" }));
  };

  const openLogin = (p) => { setLoginFor(p); setLoginForm({ email: "", password: "" }); setLoginOpen(true); };
  const createLogin = async () => {
    if (!loginForm.email || !loginForm.password) { toast.error("Email and password required"); return; }
    try {
      await api.post("/auth/customers", { email: loginForm.email, password: loginForm.password, customer_name: loginFor.name, name: loginFor.name });
      toast.success(`Portal login created for ${loginFor.name}`);
      setLoginOpen(false);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to create login"); }
  };

  const title = kind === "customer" ? "Customers" : "Suppliers";
  const Icon = kind === "customer" ? UsersThree : Truck;

  const load = () => api.get(`/parties?kind=${kind}`).then((r) => setRows(r.data));
  useEffect(() => { setRows([]); load(); }, [kind]);

  const save = async () => {
    if (!form.name) { toast.error("Name is required"); return; }
    await api.post("/parties", { ...form, kind });
    toast.success(`${title.slice(0, -1)} added`);
    setOpen(false); setForm(emptyForm); setCountryCode(""); load();
  };

  const remove = async (id) => { await api.delete(`/parties/${id}`); load(); };

  const viewSoa = async (name) => {
    const r = await api.get(`/soa/${kind}/${encodeURIComponent(name)}`);
    setSoa(r.data); setSoaOpen(true);
  };

  const printSoa = () => {
    if (!soa) return;
    const rowsHtml = soa.rows.map((r) => `
      <tr>
        <td>${r.order_number}</td>
        <td>${fmtDate(r.date)}</td>
        <td class="num">$${money(r.billed)}</td>
        <td class="num">$${money(r.paid)}</td>
        <td class="num">$${money(r.balance)}</td>
      </tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Statement - ${soa.name}</title>
      <style>
        * { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1C1C18; }
        body { margin: 48px; }
        .top { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #2C302B; padding-bottom:20px; }
        h1 { font-size:26px; font-weight:300; margin:0; }
        .brand { font-size:13px; letter-spacing:2px; text-transform:uppercase; color:#78766F; }
        .label { font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#78766F; }
        .big { font-size:24px; font-family:'Courier New',monospace; margin-top:4px; }
        .name { font-size:22px; font-weight:400; margin-top:24px; }
        table { width:100%; border-collapse:collapse; margin-top:24px; font-size:13px; }
        th { text-align:left; border-bottom:1px solid #E2E0D8; padding:10px 8px; font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#78766F; }
        td { padding:10px 8px; border-bottom:1px solid #F0EFEA; font-family:'Courier New',monospace; }
        td:first-child, th:first-child, td:nth-child(2), th:nth-child(2) { font-family:'Helvetica Neue',Arial,sans-serif; }
        .num { text-align:right; }
        .totals { margin-top:24px; display:flex; justify-content:flex-end; gap:48px; }
        .foot { margin-top:48px; font-size:11px; color:#78766F; }
      </style></head><body>
      <div class="top">
        <div><div class="brand">Al Rigga Auto · Automotive ERP</div><h1>Statement of Account</h1></div>
        <div style="text-align:right"><div class="label">Balance Due</div><div class="big">$${money(soa.balance)}</div></div>
      </div>
      <div class="name">${soa.name} <span class="label">(${soa.kind})</span></div>
      <table>
        <thead><tr><th>Order</th><th>Date</th><th class="num">Billed</th><th class="num">Paid</th><th class="num">Balance</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="5" style="text-align:center;color:#78766F">No orders recorded.</td></tr>'}</tbody>
      </table>
      <div class="totals">
        <div><div class="label">Total Billed</div><div class="big">$${money(soa.total_billed)}</div></div>
        <div><div class="label">Total Paid</div><div class="big">$${money(soa.total_paid)}</div></div>
      </div>
      <div class="foot">Generated on ${fmtDate(new Date().toISOString())} · Use your browser's "Save as PDF" option to export.</div>
      </body></html>`;
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  return (
    <div className="space-y-8" data-testid={`${kind}-page`}>
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">Directory</div>
          <h1 className="text-4xl sm:text-5xl tracking-tight font-light mt-1" style={{ fontFamily: "Manrope" }}>{title}</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid={`add-${kind}-btn`} className="rounded-full gap-2"><Plus size={18} weight="bold" /> Add {kind}</Button>
          </DialogTrigger>
          <DialogContent className="bg-white max-w-2xl max-h-[88vh] overflow-y-auto">
            <DialogHeader><DialogTitle style={{ fontFamily: "Manrope" }} className="capitalize">New {kind}</DialogTitle></DialogHeader>
            {kind === "supplier" ? (
              <div className="space-y-4">
                <div><Label className="text-xs">Name</Label>
                  <Input data-testid="supplier-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-white" /></div>
                <div><Label className="text-xs">Email</Label>
                  <Input data-testid="supplier-email-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-white" /></div>
                <div><Label className="text-xs">Phone</Label>
                  <Input data-testid="supplier-phone-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="bg-white" /></div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Account No</Label>
                    <Input value="Auto-generated on save" disabled data-testid="customer-account-input" className="bg-muted/50 text-muted-foreground" />
                  </div>
                  <div>
                    <Label className="text-xs">LPO (auto)</Label>
                    <Input value={lpoPreview} disabled data-testid="customer-lpo-input" className="bg-muted/50 text-muted-foreground font-mono" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Customer Name</Label>
                    <Input data-testid="customer-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-white" /></div>
                  <div><Label className="text-xs">Company</Label>
                    <Input data-testid="customer-company-input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="bg-white" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Country</Label>
                    <Select value={countryCode} onValueChange={onCountry}>
                      <SelectTrigger data-testid="customer-country-select" className="bg-white"><SelectValue placeholder="Select country" /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {countries.map((c) => <SelectItem key={c.isoCode} value={c.isoCode}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">City / State</Label>
                    <Input list="city-options" data-testid="customer-city-input" value={form.city} disabled={!countryCode}
                      onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder={countryCode ? "Select or type city" : "Select country first"} className="bg-white" />
                    <datalist id="city-options">
                      {cities.map((c, i) => <option key={i} value={c.name} />)}
                    </datalist>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Brand Focus</Label>
                    <Select value={form.brand_focus} onValueChange={(v) => setForm({ ...form, brand_focus: v })}>
                      <SelectTrigger data-testid="customer-brand-select" className="bg-white"><SelectValue placeholder="Select brand" /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {BRANDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Email</Label>
                    <Input data-testid="customer-email-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-white" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Mobile No</Label>
                    <Input data-testid="customer-mobile-input" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="bg-white" /></div>
                  <div><Label className="text-xs">WhatsApp</Label>
                    <Input data-testid="customer-whatsapp-input" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} className="bg-white" /></div>
                </div>
                <div><Label className="text-xs">Office Address</Label>
                  <Input data-testid="customer-address-input" value={form.office_address} onChange={(e) => setForm({ ...form, office_address: e.target.value })} className="bg-white" /></div>
                <div><Label className="text-xs">Special Note</Label>
                  <Textarea data-testid="customer-note-input" value={form.special_note} onChange={(e) => setForm({ ...form, special_note: e.target.value })} className="bg-white" /></div>
              </div>
            )}
            <DialogFooter><Button onClick={save} data-testid={`save-${kind}-btn`} className="rounded-full">Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-white border-border/60 shadow-sm rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-20 flex flex-col items-center gap-3 text-muted-foreground">
            <Icon size={40} weight="duotone" />
            <p className="text-sm">No {title.toLowerCase()} yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {kind === "customer" ? (
                    <>
                      <TableHead>Account No</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>LPO</TableHead>
                      <TableHead>Country / City</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Mobile</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p._id} data-testid={`${kind}-row-${p._id}`}>
                    {kind === "customer" ? (
                      <>
                        <TableCell className="font-mono text-xs">{p.account_no || "—"}</TableCell>
                        <TableCell className="font-medium whitespace-nowrap">{p.name}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">{p.company || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{p.lpo || "—"}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">{[p.city, p.country].filter(Boolean).join(", ") || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">{p.brand_focus || "—"}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">{p.mobile || p.phone || "—"}</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-muted-foreground">{p.email || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{p.phone || "—"}</TableCell>
                      </>
                    )}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-3">
                        {kind === "customer" && (
                          <button onClick={() => openLogin(p)} data-testid={`login-${p._id}`}
                            className="text-sm text-primary hover:underline flex items-center gap-1.5">
                            <Key size={16} weight="duotone" /> Login
                          </button>
                        )}
                        {kind === "supplier" && (
                          <button onClick={() => viewPurchases(p.name)} data-testid={`purchases-${p._id}`}
                            className="text-sm text-primary hover:underline flex items-center gap-1.5">
                            <Truck size={16} weight="duotone" /> Purchases
                          </button>
                        )}
                        <button onClick={() => viewSoa(p.name)} data-testid={`soa-${p._id}`}
                          className="text-sm text-primary hover:underline flex items-center gap-1.5">
                          <FileText size={16} weight="duotone" /> Statement
                        </button>
                        <button onClick={() => remove(p._id)} data-testid={`del-${kind}-${p._id}`}
                          className="text-muted-foreground hover:text-destructive transition-colors"><Trash size={17} /></button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Sheet open={soaOpen} onOpenChange={setSoaOpen}>
        <SheetContent className="bg-white w-full sm:max-w-xl overflow-y-auto" data-testid="soa-panel">
          <SheetHeader>
            <SheetTitle style={{ fontFamily: "Manrope" }}>Statement of Account</SheetTitle>
          </SheetHeader>
          {soa && (
            <div className="mt-6 space-y-6">
              <Button onClick={printSoa} data-testid="export-pdf-btn" variant="secondary" className="rounded-full gap-2 w-full">
                <FilePdf size={18} weight="duotone" /> Export / Print PDF
              </Button>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-light" style={{ fontFamily: "Manrope" }}>{soa.name}</div>
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground capitalize">{soa.kind} statement</div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Balance Due</div>
                  <div className={`text-2xl font-mono tabular ${soa.balance > 0 ? "text-destructive" : "text-success"}`}>${money(soa.balance)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Card className="p-4 bg-muted/40 border-border/60">
                  <div className="text-xs text-muted-foreground">Total Billed</div>
                  <div className="text-lg font-mono tabular">${money(soa.total_billed)}</div>
                </Card>
                <Card className="p-4 bg-muted/40 border-border/60">
                  <div className="text-xs text-muted-foreground">Total Paid</div>
                  <div className="text-lg font-mono tabular text-success">${money(soa.total_paid)}</div>
                </Card>
              </div>

              {soa.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-lg">
                  No orders recorded for this {soa.kind}.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Billed</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
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
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={purOpen} onOpenChange={setPurOpen}>
        <SheetContent className="bg-white w-full sm:max-w-xl overflow-y-auto" data-testid="supplier-purchases-panel">
          <SheetHeader><SheetTitle style={{ fontFamily: "Manrope" }}>Purchases — {purFor}</SheetTitle></SheetHeader>
          <div className="mt-6">
            {supPur.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-lg">No purchases recorded for this supplier.</p>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Ref</TableHead>
                  <TableHead className="text-right">Items</TableHead><TableHead className="text-right">Total</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {supPur.map((p) => (
                    <TableRow key={p._id}>
                      <TableCell className="text-muted-foreground text-xs">{fmtDate(p.date)}</TableCell>
                      <TableCell className="font-mono text-xs">{p.ref || "—"}</TableCell>
                      <TableCell className="text-right">{(p.items || []).length}</TableCell>
                      <TableCell className="text-right font-mono tabular">${money(p.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent className="bg-white" data-testid="login-dialog">
          <DialogHeader><DialogTitle style={{ fontFamily: "Manrope" }}>Create Portal Login</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">For <span className="font-medium text-foreground">{loginFor?.name}</span>. They'll use these to view their own invoices, statement and order status.</p>
          <div className="space-y-4">
            <div><Label className="text-xs">Email</Label>
              <Input data-testid="login-email-input" type="email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} className="bg-white" /></div>
            <div><Label className="text-xs">Password</Label>
              <Input data-testid="login-password-input" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} className="bg-white" /></div>
          </div>
          <DialogFooter><Button onClick={createLogin} data-testid="create-login-btn" className="rounded-full">Create Login</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
