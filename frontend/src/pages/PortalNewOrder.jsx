import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { api, money, formatApiError } from "@/lib/api";
import PortalLayout from "@/components/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  MagnifyingGlass, Package, Trash, UploadSimple, CheckCircle, Warning, ArrowLeft, XCircle,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const VAT_RATE = 5; // UAE standard rate — display estimate only; the real invoice is the source of truth.

export default function PortalNewOrder() {
  const navigate = useNavigate();
  const [step, setStep] = useState("build"); // build | confirm | success
  const [cart, setCart] = useState({}); // part_number -> {part_number, description, brand, price, available_qty, qty, requested_price}
  const [rejected, setRejected] = useState([]); // { part_number, reason }
  const [placedOrder, setPlacedOrder] = useState(null);

  const cartItems = Object.values(cart);
  const subtotal = cartItems.reduce((s, i) => s + i.qty * i.price, 0);
  const vat = subtotal * (VAT_RATE / 100);
  const grandTotal = subtotal + vat;

  const addToCart = (p, qty, requestedPrice) => {
    setCart((c) => ({ ...c, [p.part_number]: { ...p, qty: (c[p.part_number]?.qty || 0) + qty, requested_price: requestedPrice || null } }));
  };
  const setQty = (partNumber, qty) => setCart((c) => (qty <= 0
    ? Object.fromEntries(Object.entries(c).filter(([k]) => k !== partNumber))
    : { ...c, [partNumber]: { ...c[partNumber], qty } }));
  const removeItem = (partNumber) => setQty(partNumber, 0);

  return (
    <PortalLayout active="/portal/new-order">
      <div className="space-y-5" data-testid="new-order-page">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => (step === "build" ? navigate("/portal") : setStep("build"))} className="h-8 w-8 -ml-1.5">
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: "Manrope" }}>
              {step === "success" ? "Order Placed" : step === "confirm" ? "Confirm Order" : "New Order"}
            </h1>
            <p className="text-xs text-muted-foreground">Al Rigga Auto — Automotive Spare Parts</p>
          </div>
        </div>

        {step === "build" && (
          <BuildStep cart={cart} cartItems={cartItems} addToCart={addToCart} setQty={setQty} removeItem={removeItem}
            rejected={rejected} setRejected={setRejected} onContinue={() => setStep("confirm")} />
        )}        {step === "confirm" && (
          <ConfirmStep cartItems={cartItems} rejected={rejected} subtotal={subtotal} vat={vat} grandTotal={grandTotal}
            onBack={() => setStep("build")} onPlaced={(order) => { setPlacedOrder(order); setStep("success"); }} />
        )}
        {step === "success" && placedOrder && <SuccessStep order={placedOrder} onNewOrder={() => { setCart({}); setRejected([]); setPlacedOrder(null); setStep("build"); }} />}
      </div>
    </PortalLayout>
  );
}

// ---------------------------------------------------------------- BUILD STEP

function BuildStep({ cart, cartItems, addToCart, setQty, removeItem, rejected, setRejected, onContinue }) {
  const [searchParams] = useSearchParams();
  const prefill = searchParams.get("part") || "";
  const [partNumber, setPartNumber] = useState(prefill);
  const [qty, setQtyInput] = useState(1);
  const [requestedPrice, setRequestedPrice] = useState("");
  const [results, setResults] = useState(null); // null=not searched, []=no match, [..]=matches
  const [searching, setSearching] = useState(false);
  const autoSearched = useRef(false);

  const search = async () => {
    if (!partNumber.trim()) return;
    setSearching(true);
    setResults(null);
    try {
      const r = await api.get(`/portal/products?q=${encodeURIComponent(partNumber.trim())}`);
      setResults(r.data || []);
    } catch {
      toast.error("Could not search the catalog right now.");
      setResults([]);
    }
    setSearching(false);
  };

  const handleAdd = (p) => {
    addToCart(p, Math.max(1, qty || 1), requestedPrice ? parseFloat(requestedPrice) : null);
    toast.success(`Added ${p.part_number}`);
    setPartNumber(""); setQtyInput(1); setRequestedPrice(""); setResults(null);
  };

  // Deep-link support: the Dashboard's "Trending Parts" cards link here
  // with ?part=XXX, so it's already searched by the time the page opens.
  useEffect(() => {
    if (prefill && !autoSearched.current) { autoSearched.current = true; search(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  return (
    <div className="space-y-4">
      <Tabs defaultValue="search">
        <TabsList data-testid="new-order-tabs">
          <TabsTrigger value="search" data-testid="tab-search">Part Number Search</TabsTrigger>
          <TabsTrigger value="xlsx" data-testid="tab-xlsx">Upload XLSX</TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="mt-4">
          <Card className="p-4 shadow-card">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr,110px,140px,auto] gap-2.5 items-end">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Part Number</Label>
                <Input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()}
                  placeholder="e.g. BP-1042" data-testid="new-order-part-number" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Quantity</Label>
                <Input type="number" min="1" value={qty} onChange={(e) => setQtyInput(parseInt(e.target.value || 1, 10))} data-testid="new-order-qty" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Requested Price <span className="opacity-60">(optional)</span></Label>
                <Input type="number" step="0.01" value={requestedPrice} onChange={(e) => setRequestedPrice(e.target.value)} placeholder="AED" />
              </div>
              <Button onClick={search} disabled={searching} data-testid="new-order-search-btn" className="gap-1.5">
                <MagnifyingGlass size={15} /> {searching ? "Searching…" : "Search"}
              </Button>
            </div>

            {results !== null && (
              <div className="mt-4 border-t border-border pt-4">
                {results.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3.5 py-2.5" data-testid="part-not-found">
                    <Warning size={16} /> Part Number not found. Please check the number and try again.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Part Number</TableHead><TableHead>Description</TableHead><TableHead>Brand / OEM</TableHead>
                        <TableHead className="text-right">Availability</TableHead><TableHead className="text-right">Your Price</TableHead><TableHead />
                      </TableRow></TableHeader>
                      <TableBody>
                        {results.map((p) => (
                          <TableRow key={p.product_id} data-testid="new-order-result-row">
                            <TableCell className="font-mono text-xs">{p.part_number}</TableCell>
                            <TableCell>{p.description}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">{p.brand}{p.oem_reference ? ` / ${p.oem_reference}` : ""}</TableCell>
                            <TableCell className="text-right">
                              {p.available_qty > 0 ? <Badge className="bg-success/15 text-success border-success/30">{p.available_qty} in stock</Badge> : <Badge variant="outline">Out of stock</Badge>}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular">${money(p.price)}</TableCell>
                            <TableCell className="text-right"><Button size="sm" onClick={() => handleAdd(p)} data-testid="new-order-add-btn">Add</Button></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="xlsx" className="mt-4">
          <XlsxUploadPanel onMatched={(matches) => { matches.forEach((m) => addToCart(m, m.qty, m.requested_price)); }} onRejected={setRejected} />
        </TabsContent>
      </Tabs>

      <Card className="p-4 shadow-card" data-testid="new-order-cart">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold flex items-center gap-2" style={{ fontFamily: "Manrope" }}><Package size={16} /> Order Items ({cartItems.length})</h3>
        </div>
        {cartItems.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No items added yet. Search a part number above to get started.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Part Number</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead><TableHead className="text-right">Total</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {cartItems.map((i) => (
                  <TableRow key={i.part_number}>
                    <TableCell className="font-mono text-xs">{i.part_number}</TableCell>
                    <TableCell className="text-xs">{i.description}</TableCell>
                    <TableCell className="text-right">
                      <Input type="number" min="0" value={i.qty} onChange={(e) => setQty(i.part_number, parseInt(e.target.value || 0, 10))} className="w-16 h-7 text-right ml-auto" />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular text-xs">${money(i.price)}</TableCell>
                    <TableCell className="text-right font-mono tabular text-xs">${money(i.qty * i.price)}</TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(i.part_number)}><Trash size={14} /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="flex justify-end mt-4">
          <Button onClick={onContinue} disabled={cartItems.length === 0} data-testid="new-order-continue-btn">Review Order →</Button>
        </div>
      </Card>
    </div>
  );
}

// -------------------------------------------------------------- XLSX UPLOAD

function XlsxUploadPanel({ onMatched, onRejected }) {
  const fileRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | parsing | validating | done
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [preview, setPreview] = useState(null); // { matched, rejected }

  const handleFile = async (file) => {
    setStatus("parsing");
    setPreview(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      if (rows.length === 0) { toast.error("The file has no rows."); setStatus("idle"); return; }

      const norm = (row) => {
        const get = (...keys) => { for (const k of keys) { const hit = Object.keys(row).find((rk) => rk.trim().toLowerCase() === k); if (hit) return row[hit]; } return undefined; };
        return {
          part_number: String(get("part number", "part no", "partno") ?? "").trim(),
          qty: parseFloat(get("quantity", "qty") ?? 0) || 0,
          requested_price: parseFloat(get("requested price", "price") ?? "") || null,
        };
      };
      const parsed = rows.map(norm).filter((r) => r.part_number);
      if (parsed.length === 0) { toast.error("No valid rows found — check the Part Number column header."); setStatus("idle"); return; }

      setStatus("validating");
      setProgress({ done: 0, total: parsed.length });
      const matched = [];
      const rejectedRows = [];
      const CONCURRENCY = 6;
      let idx = 0;
      const worker = async () => {
        while (idx < parsed.length) {
          const i = idx++;
          const row = parsed[i];
          try {
            if (row.qty <= 0) { rejectedRows.push({ part_number: row.part_number, reason: "Quantity must be greater than 0" }); }
            else {
              const r = await api.get(`/portal/products?q=${encodeURIComponent(row.part_number)}`);
              const exact = (r.data || []).find((p) => p.part_number.toLowerCase() === row.part_number.toLowerCase());
              if (exact) matched.push({ ...exact, qty: row.qty, requested_price: row.requested_price });
              else rejectedRows.push({ part_number: row.part_number, reason: "Part Number not found" });
            }
          } catch {
            rejectedRows.push({ part_number: row.part_number, reason: "Lookup failed — try again" });
          }
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, parsed.length) }, worker));

      setPreview({ matched, rejected: rejectedRows });
      onRejected(rejectedRows);
      setStatus("done");
    } catch (e) {
      toast.error("Could not read that file — make sure it's a valid .xlsx.");
      setStatus("idle");
    }
  };

  return (
    <Card className="p-4 shadow-card">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-base font-bold" style={{ fontFamily: "Manrope" }}>Bulk order from spreadsheet</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Columns: Sl No, Part Number, Quantity, Requested Price (optional)</p>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" data-testid="xlsx-file-input"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={status === "parsing" || status === "validating"} className="gap-1.5 shrink-0">
          <UploadSimple size={15} /> Choose file
        </Button>
      </div>

      {status === "validating" && (
        <p className="text-sm text-muted-foreground" data-testid="xlsx-validating">Validating {progress.done} of {progress.total} rows…</p>
      )}

      {preview && (
        <div className="space-y-3 mt-2">
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-success"><CheckCircle size={14} weight="fill" /> {preview.matched.length} matched and added</span>
            {preview.rejected.length > 0 && <span className="flex items-center gap-1.5 text-destructive"><XCircle size={14} weight="fill" /> {preview.rejected.length} rejected</span>}
          </div>
          {preview.rejected.length > 0 && (
            <div className="overflow-x-auto border border-destructive/20 rounded-lg" data-testid="xlsx-rejected-table">
              <Table>
                <TableHeader><TableRow><TableHead>Part Number</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
                <TableBody>
                  {preview.rejected.map((r, i) => (
                    <TableRow key={i}><TableCell className="font-mono text-xs">{r.part_number}</TableCell><TableCell className="text-xs text-destructive">{r.reason}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// -------------------------------------------------------------- CONFIRM STEP

function ConfirmStep({ cartItems, rejected, subtotal, vat, grandTotal, onBack, onPlaced }) {
  const [remark, setRemark] = useState("");
  const [shipping, setShipping] = useState("");
  const [lpo, setLpo] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    const notesParts = [];
    if (remark) notesParts.push(`Remark: ${remark}`);
    if (shipping) notesParts.push(`Shipping instructions: ${shipping}`);
    if (lpo) notesParts.push(`LPO reference: ${lpo}`);
    if (deliveryDate) notesParts.push(`Requested delivery date: ${deliveryDate}`);
    try {
      const r = await api.post("/portal/orders", {
        lines: cartItems.map((i) => ({ part_number: i.part_number, order_qty: i.qty })),
        notes: notesParts.join(" | "),
      });
      onPlaced(r.data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
    setSubmitting(false);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 shadow-card grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Remark</Label>
          <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={2} data-testid="confirm-remark" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Shipping Instructions</Label>
          <Textarea value={shipping} onChange={(e) => setShipping(e.target.value)} rows={2} data-testid="confirm-shipping" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">LPO Reference</Label>
          <Input value={lpo} onChange={(e) => setLpo(e.target.value)} data-testid="confirm-lpo" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Delivery Request Date</Label>
          <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} data-testid="confirm-delivery-date" />
        </div>
      </Card>

      <Card className="shadow-card overflow-hidden" data-testid="confirm-available-items">
        <div className="p-3.5 border-b border-border text-base font-bold" style={{ fontFamily: "Manrope" }}>Available Items</div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Part Number</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Requested Qty</TableHead>
              <TableHead className="text-right">Net Price</TableHead><TableHead className="text-right">Total</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {cartItems.map((i) => (
                <TableRow key={i.part_number}>
                  <TableCell className="font-mono text-xs">{i.part_number}</TableCell>
                  <TableCell className="text-xs">{i.description}</TableCell>
                  <TableCell className="text-right">{i.qty}</TableCell>
                  <TableCell className="text-right font-mono tabular text-xs">${money(i.price)}</TableCell>
                  <TableCell className="text-right font-mono tabular text-xs">${money(i.qty * i.price)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {rejected.length > 0 && (
        <Card className="shadow-card overflow-hidden border-destructive/30" data-testid="confirm-rejected-items">
          <div className="p-3.5 border-b border-border text-base font-bold text-destructive" style={{ fontFamily: "Manrope" }}>Rejected Items</div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Part Number</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
              <TableBody>
                {rejected.map((r, i) => (
                  <TableRow key={i}><TableCell className="font-mono text-xs">{r.part_number}</TableCell><TableCell className="text-xs text-destructive">{r.reason}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Card className="p-4 shadow-card max-w-sm ml-auto">
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono tabular">${money(subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">VAT ({VAT_RATE}%) <span className="text-[10px]">est.</span></span><span className="font-mono tabular">${money(vat)}</span></div>
          <div className="flex justify-between text-base font-medium border-t border-border pt-1.5 mt-1.5"><span>Grand Total</span><span className="font-mono tabular">${money(grandTotal)}</span></div>
        </div>
      </Card>

      <div className="flex justify-end gap-2.5">
        <Button variant="outline" onClick={onBack} data-testid="confirm-cancel-btn">Cancel</Button>
        <Button onClick={submit} disabled={submitting} data-testid="confirm-order-btn">{submitting ? "Placing order…" : "Confirm Order"}</Button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- SUCCESS STEP

function SuccessStep({ order, onNewOrder }) {
  const navigate = useNavigate();
  return (
    <Card className="p-8 shadow-card text-center max-w-md mx-auto" data-testid="order-success">
      <div className="h-14 w-14 rounded-full bg-success/10 text-success flex items-center justify-center mx-auto mb-4"><CheckCircle size={28} weight="fill" /></div>
      <h2 className="text-xl font-bold" style={{ fontFamily: "Manrope" }}>Order placed successfully</h2>
      <p className="text-sm text-muted-foreground mt-1">Your order is now in our fulfilment queue.</p>
      <div className="mt-4 p-3 rounded-lg bg-muted/50 inline-block">
        <div className="text-xs text-muted-foreground">Order Number</div>
        <div className="font-mono font-medium text-lg">{order.order_number}</div>
        <Badge variant="outline" className="mt-1 capitalize">{order.status || "open"}</Badge>
      </div>
      <div className="flex justify-center gap-2.5 mt-6">
        <Button variant="outline" onClick={onNewOrder}>Place Another Order</Button>
        <Button onClick={() => navigate("/portal")}>Back to Dashboard</Button>
      </div>
    </Card>
  );
}
