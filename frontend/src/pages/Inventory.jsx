import { useEffect, useState, useRef } from "react";
import { api, money } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Cube, Trash, PencilSimple, WarningCircle, ShoppingCart, UploadSimple } from "@phosphor-icons/react";
import { toast } from "sonner";

const empty = { name: "", sku: "", stock: "", unit_cost: "", unit_price: "", low_stock_threshold: "5" };
const num = (v) => parseFloat(v || 0) || 0;

export default function Inventory() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [reorderSupplier, setReorderSupplier] = useState("");
  const [reorderQty, setReorderQty] = useState({});

  const load = () => api.get("/products").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  const uploadRef = useRef();
  const [selected, setSelected] = useState(new Set());
  const [pageSize, setPageSize] = useState(30);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((p) => selected.has(p._id));

  const toggleOne = (id) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };
  const toggleAll = () => {
    const s = new Set(selected);
    if (allOnPageSelected) pageRows.forEach((p) => s.delete(p._id));
    else pageRows.forEach((p) => s.add(p._id));
    setSelected(s);
  };
  const bulkDelete = async () => {
    for (const id of selected) await api.delete(`/products/${id}`);
    toast.success(`Deleted ${selected.size} item(s)`);
    setSelected(new Set());
    load();
  };
  const doUpload = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api.post("/products/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Imported ${r.data.imported} products`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Upload failed"); }
  };

  const lowItems = rows.filter((p) => p.stock <= (p.low_stock_threshold || 0));

  const openReorder = () => {
    const q = {};
    lowItems.forEach((p) => { q[p._id] = Math.max((p.low_stock_threshold || 0) * 2 - p.stock, 1); });
    setReorderQty(q);
    setReorderSupplier("");
    setReorderOpen(true);
  };

  const submitReorder = async () => {
    const items = lowItems.map((p) => ({ product_id: p._id, qty: num(reorderQty[p._id]) })).filter((i) => i.qty > 0);
    if (items.length === 0) { toast.error("Set a quantity to reorder"); return; }
    try {
      await api.post("/purchases/reorder", { supplier: reorderSupplier, items });
      toast.success("Purchase created & stock replenished");
      setReorderOpen(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Reorder failed"); }
  };

  const openNew = () => { setForm(empty); setEditId(null); setOpen(true); };
  const openEdit = (p) => {
    setForm({ name: p.name, sku: p.sku, stock: p.stock, unit_cost: p.unit_cost, unit_price: p.unit_price, low_stock_threshold: p.low_stock_threshold });
    setEditId(p._id); setOpen(true);
  };

  const save = async () => {
    if (!form.name) { toast.error("Name is required"); return; }
    const payload = { name: form.name, sku: form.sku, stock: num(form.stock), unit_cost: num(form.unit_cost), unit_price: num(form.unit_price), low_stock_threshold: num(form.low_stock_threshold) };
    if (editId) await api.put(`/products/${editId}`, payload);
    else await api.post("/products", payload);
    toast.success(editId ? "Product updated" : "Product added");
    setOpen(false); load();
  };

  const remove = async (id) => { await api.delete(`/products/${id}`); load(); };

  const F = (key, label, type = "text") => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input data-testid={`product-${key}-input`} type={type} value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="bg-white" />
    </div>
  );

  return (
    <div className="space-y-8" data-testid="inventory-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">Stock</div>
          <h1 className="text-4xl sm:text-5xl tracking-tight font-light mt-1" style={{ fontFamily: "Manrope" }}>Inventory</h1>
        </div>
        <div className="flex items-center gap-2">
        <input ref={uploadRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" data-testid="product-upload-input" onChange={(e) => doUpload(e.target.files[0])} />
        <Button variant="secondary" onClick={() => uploadRef.current?.click()} data-testid="upload-products-btn" className="rounded-full gap-2">
          <UploadSimple size={18} weight="duotone" /> Upload CSV
        </Button>
        {lowItems.length > 0 && (
          <Button variant="secondary" onClick={openReorder} data-testid="reorder-btn" className="rounded-full gap-2">
            <ShoppingCart size={18} weight="duotone" /> Reorder ({lowItems.length})
          </Button>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="add-product-btn" onClick={openNew} className="rounded-full gap-2"><Plus size={18} weight="bold" /> Add Product</Button>
          </DialogTrigger>
          <DialogContent className="bg-white">
            <DialogHeader><DialogTitle style={{ fontFamily: "Manrope" }}>{editId ? "Edit Product" : "New Product"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">{F("name", "Product Name")}</div>
              {F("sku", "SKU")}
              {F("stock", "Stock Qty", "number")}
              {F("unit_cost", "Unit Cost", "number")}
              {F("unit_price", "Unit Price", "number")}
              <div className="col-span-2">{F("low_stock_threshold", "Low Stock Alert Below", "number")}</div>
            </div>
            <DialogFooter><Button onClick={save} data-testid="save-product-btn" className="rounded-full">Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={reorderOpen} onOpenChange={setReorderOpen}>
          <DialogContent className="bg-white max-w-lg" data-testid="reorder-dialog">
            <DialogHeader><DialogTitle style={{ fontFamily: "Manrope" }}>Reorder Low Stock</DialogTitle></DialogHeader>
            <div>
              <Label className="text-xs">Supplier</Label>
              <Input data-testid="reorder-supplier-input" value={reorderSupplier} onChange={(e) => setReorderSupplier(e.target.value)} className="bg-white" />
            </div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground pt-1">Items to reorder</div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {lowItems.map((p) => (
                <div key={p._id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">In stock: {money(p.stock)} · Alert below {money(p.low_stock_threshold)}</div>
                  </div>
                  <Input type="number" data-testid={`reorder-qty-${p._id}`} value={reorderQty[p._id] ?? ""} onChange={(e) => setReorderQty({ ...reorderQty, [p._id]: e.target.value })} className="w-24 bg-white text-right" />
                </div>
              ))}
            </div>
            <DialogFooter><Button onClick={submitReorder} data-testid="submit-reorder-btn" className="rounded-full">Create Purchase Order</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {lowItems.length > 0 && (
        <div data-testid="low-stock-alert" className="flex items-center gap-3 px-5 py-4 rounded-xl border border-warning/40 bg-warning/5">
          <WarningCircle size={22} weight="duotone" className="text-warning shrink-0" />
          <p className="text-sm">
            <span className="font-medium">{lowItems.length} product{lowItems.length > 1 ? "s" : ""}</span>
            <span className="text-muted-foreground"> at or below the low-stock threshold. Use Reorder to restock in one click.</span>
          </p>
        </div>
      )}

      <Card className="bg-white border-border/60 shadow-sm rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-20 flex flex-col items-center gap-3 text-muted-foreground">
            <Cube size={40} weight="duotone" /><p className="text-sm">No products yet.</p>
          </div>
        ) : (
          <>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border flex-wrap">
            <div className="text-sm text-muted-foreground">
              {selected.size > 0 ? (
                <span className="flex items-center gap-3">
                  <span>{selected.size} selected</span>
                  <button onClick={bulkDelete} data-testid="bulk-delete-btn" className="text-destructive hover:underline flex items-center gap-1.5"><Trash size={15} /> Delete selected</button>
                </span>
              ) : `${rows.length} items`}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Per page</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger data-testid="page-size-select" className="bg-white h-8 w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="prev-page">Prev</Button>
              <span className="text-xs tabular font-mono">{page}/{totalPages}</span>
              <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)} data-testid="next-page">Next</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"><Checkbox checked={allOnPageSelected} onCheckedChange={toggleAll} data-testid="select-all" /></TableHead>
                <TableHead>S.No</TableHead>
                <TableHead>Part Number</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Available Stock</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
                <TableHead className="text-right">Selling Price</TableHead>
                <TableHead className="text-right">GP</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((p, i) => {
                const low = p.stock <= (p.low_stock_threshold || 0);
                const gp = (p.unit_price || 0) - (p.unit_cost || 0);
                return (
                  <TableRow key={p._id} data-testid={`product-row-${p._id}`}>
                    <TableCell><Checkbox checked={selected.has(p._id)} onCheckedChange={() => toggleOne(p._id)} data-testid={`select-${p._id}`} /></TableCell>
                    <TableCell className="text-muted-foreground tabular">{(page - 1) * pageSize + i + 1}</TableCell>
                    <TableCell className="font-mono">{p.sku || "—"}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right">
                      <span className={`font-mono tabular inline-flex items-center gap-1.5 ${low ? "text-destructive" : ""}`}>
                        {low && <WarningCircle size={15} weight="fill" />}{money(p.stock)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular text-muted-foreground">${money(p.unit_cost)}</TableCell>
                    <TableCell className="text-right font-mono tabular">${money(p.unit_price)}</TableCell>
                    <TableCell className={`text-right font-mono tabular ${gp >= 0 ? "text-success" : "text-destructive"}`}>${money(gp)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(p)} data-testid={`edit-product-${p._id}`} className="text-muted-foreground hover:text-primary"><PencilSimple size={16} /></button>
                        <button onClick={() => remove(p._id)} data-testid={`del-product-${p._id}`} className="text-muted-foreground hover:text-destructive"><Trash size={16} /></button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
          </>
        )}
      </Card>
    </div>
  );
}
