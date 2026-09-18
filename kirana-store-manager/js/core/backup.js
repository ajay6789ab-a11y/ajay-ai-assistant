/**
 * Backup & restore — JSON for the whole database, CSV per collection.
 *
 * Everything runs locally in the browser. No cloud service, no API key,
 * no account. A backup is a plain file the shopkeeper owns.
 */

import { fmtQty, paiseToNumber } from './money.js';
import { outstandingFor, payableFor } from './reports.js';

/** Escape a value for a CSV cell (RFC 4180). */
function csvCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build CSV text from an array of {header, value} column definitions. */
export function toCSV(rows, columns) {
  const head = columns.map((c) => csvCell(c.header)).join(',');
  const body = rows.map((row) => columns.map((c) => csvCell(c.value(row))).join(','));
  return [head, ...body].join('\r\n');
}

export function productsCSV(products) {
  return toCSV(products, [
    { header: 'id', value: (r) => r.id },
    { header: 'name', value: (r) => r.name },
    { header: 'category', value: (r) => r.category },
    { header: 'brand', value: (r) => r.brand },
    { header: 'sku', value: (r) => r.sku },
    { header: 'unit', value: (r) => r.unit },
    { header: 'purchase_price', value: (r) => paiseToNumber(r.purchasePrice).toFixed(2) },
    { header: 'selling_price', value: (r) => paiseToNumber(r.sellingPrice).toFixed(2) },
    { header: 'mrp', value: (r) => paiseToNumber(r.mrp).toFixed(2) },
    { header: 'stock', value: (r) => fmtQty(r.stockQtyMilli) },
    { header: 'min_stock', value: (r) => fmtQty(r.minStockQtyMilli) },
    { header: 'supplier_id', value: (r) => r.supplierId || '' },
    { header: 'expiry_date', value: (r) => r.expiryDate || '' },
    { header: 'notes', value: (r) => r.notes },
  ]);
}

export function salesCSV(data) {
  const byId = new Map(data.sales.map((s) => [s.id, s]));
  const rows = [];
  for (const line of data.sale_items) {
    const sale = byId.get(line.saleId);
    if (!sale) continue;
    rows.push({
      date: sale.date, billNo: sale.billNo, customer: sale.customerName || 'Walk-in',
      product: line.productName, qty: fmtQty(line.qtyMilli), unit: line.unit,
      price: paiseToNumber(line.pricePaise).toFixed(2),
      discount: paiseToNumber(line.discountPaise).toFixed(2),
      total: paiseToNumber(line.totalPaise).toFixed(2),
      cost: paiseToNumber(line.costPaise).toFixed(2),
      returnedQty: fmtQty(line.returnedQtyMilli || 0),
      paymentMode: sale.paymentMode, status: sale.status,
    });
  }
  return toCSV(rows.sort((a, b) => b.date.localeCompare(a.date)), [
    { header: 'date', value: (r) => r.date },
    { header: 'bill_no', value: (r) => r.billNo },
    { header: 'customer', value: (r) => r.customer },
    { header: 'product', value: (r) => r.product },
    { header: 'qty', value: (r) => r.qty },
    { header: 'unit', value: (r) => r.unit },
    { header: 'price', value: (r) => r.price },
    { header: 'discount', value: (r) => r.discount },
    { header: 'line_total', value: (r) => r.total },
    { header: 'cost_price', value: (r) => r.cost },
    { header: 'returned_qty', value: (r) => r.returnedQty },
    { header: 'payment_mode', value: (r) => r.paymentMode },
    { header: 'status', value: (r) => r.status },
  ]);
}

export function purchasesCSV(data) {
  const byId = new Map(data.purchases.map((p) => [p.id, p]));
  const rows = [];
  for (const line of data.purchase_items) {
    const purchase = byId.get(line.purchaseId);
    if (!purchase) continue;
    rows.push({
      date: purchase.date, invoiceNo: purchase.invoiceNo, supplier: purchase.supplierName || '',
      product: line.productName, qty: fmtQty(line.qtyMilli), unit: line.unit,
      rate: paiseToNumber(line.ratePaise).toFixed(2),
      total: paiseToNumber(line.totalPaise).toFixed(2),
      paymentStatus: purchase.paymentStatus, status: purchase.status,
    });
  }
  return toCSV(rows.sort((a, b) => b.date.localeCompare(a.date)), [
    { header: 'date', value: (r) => r.date },
    { header: 'invoice_no', value: (r) => r.invoiceNo },
    { header: 'supplier', value: (r) => r.supplier },
    { header: 'product', value: (r) => r.product },
    { header: 'qty', value: (r) => r.qty },
    { header: 'unit', value: (r) => r.unit },
    { header: 'rate', value: (r) => r.rate },
    { header: 'line_total', value: (r) => r.total },
    { header: 'payment_status', value: (r) => r.paymentStatus },
    { header: 'status', value: (r) => r.status },
  ]);
}

export function customersCSV(data) {
  return toCSV(
    data.customers
      .map((c) => ({ ...c, outstanding: outstandingFor(data, c.id) }))
      .sort((a, b) => b.outstanding - a.outstanding),
    [
      { header: 'id', value: (r) => r.id },
      { header: 'name', value: (r) => r.name },
      { header: 'mobile', value: (r) => r.mobile },
      { header: 'address', value: (r) => r.address },
      { header: 'outstanding', value: (r) => paiseToNumber(r.outstanding).toFixed(2) },
      { header: 'notes', value: (r) => r.notes },
    ],
  );
}

export function expensesCSV(expenses) {
  return toCSV(
    expenses.slice().sort((a, b) => b.date.localeCompare(a.date)),
    [
      { header: 'date', value: (r) => r.date },
      { header: 'category', value: (r) => r.category },
      { header: 'amount', value: (r) => paiseToNumber(r.amountPaise).toFixed(2) },
      { header: 'note', value: (r) => r.note },
      { header: 'status', value: (r) => r.status },
    ],
  );
}

export function suppliersCSV(data) {
  return toCSV(
    data.suppliers
      .map((s) => ({ ...s, payable: payableFor(data, s.id) }))
      .sort((a, b) => b.payable - a.payable),
    [
      { header: 'id', value: (r) => r.id },
      { header: 'name', value: (r) => r.name },
      { header: 'mobile', value: (r) => r.mobile },
      { header: 'address', value: (r) => r.address },
      { header: 'payable', value: (r) => paiseToNumber(r.payable).toFixed(2) },
      { header: 'notes', value: (r) => r.notes },
    ],
  );
}

/** Every CSV this app can produce, keyed by button label. */
export async function allCSVs(store) {
  const data = await store._raw();
  return {
    products: productsCSV(data.products),
    sales: salesCSV(data),
    purchases: purchasesCSV(data),
    customers: customersCSV(data),
    suppliers: suppliersCSV(data),
    expenses: expensesCSV(await store.listExpenses()),
  };
}

/* ------------------------------------------------------- browser plumbing */

/** Trigger a file download. Works offline; no server involved. */
export function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Read a File/Blob picked by the user as text. */
export function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Could not read the file'));
    reader.readAsText(file);
  });
}

/** Share via the Web Share API, falling back to copy-to-clipboard. */
export async function shareText(title, text) {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      // fall through to the clipboard
    }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return 'copied';
  }
  return 'unsupported';
}

/** A dated filename like kirana-backup-2026-09-18.json */
export function backupFilename(ext = 'json') {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `kirana-backup-${stamp}.${ext}`;
}
