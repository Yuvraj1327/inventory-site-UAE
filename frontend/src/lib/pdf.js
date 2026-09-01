import { money, fmtDate } from "@/lib/api";

const shell = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  * { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1C1C18; }
  body { margin: 48px; }
  .top { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #2C302B; padding-bottom:20px; }
  h1 { font-size:26px; font-weight:300; margin:0; }
  .brand { font-size:13px; letter-spacing:2px; text-transform:uppercase; color:#78766F; }
  .label { font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#78766F; }
  .big { font-size:24px; font-family:'Courier New',monospace; margin-top:4px; }
  .name { font-size:20px; font-weight:400; margin-top:24px; }
  table { width:100%; border-collapse:collapse; margin-top:24px; font-size:13px; }
  th { text-align:left; border-bottom:1px solid #E2E0D8; padding:10px 8px; font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#78766F; }
  td { padding:10px 8px; border-bottom:1px solid #F0EFEA; }
  .num { text-align:right; font-family:'Courier New',monospace; }
  .totals { margin-top:24px; display:flex; justify-content:flex-end; }
  .totbox { min-width:240px; }
  .totrow { display:flex; justify-content:space-between; padding:6px 0; font-size:14px; }
  .grand { border-top:2px solid #2C302B; margin-top:6px; padding-top:10px; font-size:18px; font-weight:600; }
  .foot { margin-top:48px; font-size:11px; color:#78766F; }
</style></head><body>${body}</body></html>`;

const openPrint = (html) => {
  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
};

export function printReceipt(txn) {
  const body = `
    <div class="top">
      <div><div class="brand">Ledgerly · AI Accountant</div><h1>Receipt ${txn.receipt_no || ""}</h1></div>
      <div style="text-align:right"><div class="label">Amount</div><div class="big">$${money(txn.amount)}</div></div>
    </div>
    <div class="name">Received from: ${txn.party || "—"}</div>
    <div class="label">Account No: ${txn.account_no || "—"}</div>
    <table>
      <thead><tr><th>Date</th><th>Description</th><th class="num">Amount</th></tr></thead>
      <tbody><tr><td>${fmtDate(txn.date)}</td><td>${txn.description || "Payment received"}</td><td class="num">$${money(txn.amount)}</td></tr></tbody>
    </table>
    <div class="foot">This is a computer-generated payment receipt. Generated on ${fmtDate(new Date().toISOString())}.</div>`;
  openPrint(shell(`Receipt ${txn.receipt_no || ""}`, body));
}

export function printInvoice(inv) {
  const rate = inv.tax_percent || 0;
  const rows = (inv.items || []).map((i, idx) => {
    const taxable = (i.qty || 0) * (i.unit_price || 0);
    const vat = taxable * rate / 100;
    return `<tr>
      <td class="num">${idx + 1}</td><td>${i.sku || ""}</td><td>${i.name || ""}</td>
      <td class="num">${money(i.qty)}</td><td class="num">${money(i.unit_price)}</td>
      <td class="num">${money(taxable)}</td><td class="num">${rate}%</td>
      <td class="num">${money(vat)}</td><td class="num">${money(taxable + vat)}</td></tr>`;
  }).join("");
  const body = `
    <div class="top">
      <div><div class="brand">Ledgerly · AI Accountant</div><h1>Tax Invoice / فاتورة ضريبية</h1></div>
      <div style="text-align:right"><div class="label">Status</div><div class="big" style="text-transform:capitalize">${inv.status || ""}</div></div>
    </div>
    <div class="name">Billed to / العميل: ${inv.customer || "—"}</div>
    <div class="label">Invoice No / رقم الفاتورة: ${inv.invoice_number || ""} · Date / التاريخ: ${fmtDate(inv.date)}</div>
    <table>
      <thead><tr>
        <th class="num">S.NO<br/>رقم</th><th>Part No.<br/>رقم القطع</th><th>Description<br/>التفاصيل</th>
        <th class="num">QTY<br/>العدد</th><th class="num">AED/Pc<br/>سعر الوحدة</th>
        <th class="num">Taxable<br/>المبلغ</th><th class="num">VAT%<br/>الضريبة</th>
        <th class="num">VAT AED<br/>مبلغ الضريبة</th><th class="num">Total<br/>الإجمالي</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="9" style="text-align:center;color:#78766F">No items</td></tr>'}</tbody>
    </table>
    <div class="totals"><div class="totbox">
      <div class="totrow"><span>Subtotal / المجموع</span><span>$${money(inv.subtotal)}</span></div>
      <div class="totrow"><span>VAT / الضريبة</span><span>$${money(inv.tax)}</span></div>
      <div class="totrow grand"><span>Total / الإجمالي</span><span>$${money(inv.total)}</span></div>
    </div></div>
    <div class="foot">Generated on ${fmtDate(new Date().toISOString())} · Use your browser's "Save as PDF" to export.</div>`;
  openPrint(shell(`Invoice ${inv.invoice_number || ""}`, body));
}

export function _printInvoiceOld(inv) {
  const rows = (inv.items || []).map((i) => `
    <tr><td>${i.name || ""}</td><td>${i.sku || ""}</td>
    <td class="num">${money(i.qty)}</td><td class="num">$${money(i.unit_price)}</td>
    <td class="num">$${money((i.qty || 0) * (i.unit_price || 0))}</td></tr>`).join("");
  const body = `
    <div class="top">
      <div><div class="brand">Ledgerly · AI Accountant</div><h1>Invoice ${inv.invoice_number || ""}</h1></div>
      <div style="text-align:right"><div class="label">Status</div><div class="big" style="text-transform:capitalize">${inv.status || ""}</div></div>
    </div>
    <div class="name">Billed to: ${inv.customer || "—"}</div>
    <div class="label">Date: ${fmtDate(inv.date)}</div>
    <table>
      <thead><tr><th>Item</th><th>SKU</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#78766F">No items</td></tr>'}</tbody>
    </table>
    <div class="totals"><div class="totbox">
      <div class="totrow"><span>Subtotal</span><span>$${money(inv.subtotal)}</span></div>
      <div class="totrow"><span>Tax</span><span>$${money(inv.tax)}</span></div>
      <div class="totrow grand"><span>Total</span><span>$${money(inv.total)}</span></div>
    </div></div>
    <div class="foot">Generated on ${fmtDate(new Date().toISOString())} · Use your browser's "Save as PDF" to export.</div>`;
  openPrint(shell(`Invoice ${inv.invoice_number || ""}`, body));
}

export function printSoa(soa) {
  const rows = (soa.rows || []).map((r) => `
    <tr><td>${r.order_number}</td><td>${fmtDate(r.date)}</td>
    <td class="num">$${money(r.billed)}</td><td class="num">$${money(r.paid)}</td><td class="num">$${money(r.balance)}</td></tr>`).join("");
  const body = `
    <div class="top">
      <div><div class="brand">Ledgerly · AI Accountant</div><h1>Statement of Account</h1></div>
      <div style="text-align:right"><div class="label">Balance Due</div><div class="big">$${money(soa.balance)}</div></div>
    </div>
    <div class="name">${soa.name} <span class="label">(${soa.kind})</span></div>
    <table>
      <thead><tr><th>Order</th><th>Date</th><th class="num">Billed</th><th class="num">Paid</th><th class="num">Balance</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#78766F">No orders recorded.</td></tr>'}</tbody>
    </table>
    <div class="totals"><div class="totbox">
      <div class="totrow"><span>Total Billed</span><span>$${money(soa.total_billed)}</span></div>
      <div class="totrow"><span>Total Paid</span><span>$${money(soa.total_paid)}</span></div>
      <div class="totrow grand"><span>Balance</span><span>$${money(soa.balance)}</span></div>
    </div></div>
    <div class="foot">Generated on ${fmtDate(new Date().toISOString())} · Use your browser's "Save as PDF" to export.</div>`;
  openPrint(shell(`Statement - ${soa.name}`, body));
}
