/**
 * Kirana Store Manager — business logic.
 *
 * Everything that touches money or stock lives here, and every write goes out
 * as ONE atomic batch. Nothing in this file touches the DOM, so it runs
 * unchanged in the browser (IndexedDB) and in the Node test-suite (memory).
 *
 * Consistency model
 * -----------------
 * - Money is integer paise, quantity is integer milli-units (see money.js).
 * - Customer outstanding / supplier payable are DERIVED from transactions,
 *   never stored as a balance that can drift.
 * - Deleting an accounting record is replaced by a reversal/void record.
 * - sale_items freeze the cost price at the moment of sale, so profit stays
 *   correct even after the purchase price changes.
 */

import { batch, ValidationError } from './db.js';
import { lineTotalPaise, toMilli, toPaise, MILLI } from './money.js';
import { nowISO, uid, localDateKey } from './ids.js';

export const APP_VERSION = '1.0.0';

export const PAYMENT_MODES = ['cash', 'upi', 'credit'];
export const EXPENSE_CATEGORIES = [
  'electricity', 'rent', 'transport', 'salary', 'packaging', 'maintenance', 'other',
];
export const UNITS = ['piece', 'kg', 'g', 'litre', 'ml', 'packet', 'box', 'dozen'];

const DEFAULT_CATEGORIES = [
  'Grocery', 'Dairy', 'Snacks', 'Beverages', 'Personal Care',
  'Household', 'Bakery', 'Frozen', 'Other',
];

export const DEFAULT_SETTINGS = Object.freeze({
  id: 'settings',
  shopName: 'My Kirana Store',
  ownerName: '',
  mobile: '',
  address: '',
  gstin: '',
  invoicePrefix: 'KSM',
  currencySymbol: '₹',
  language: 'en',
  allowNegativeStock: false,
  pinHash: null,
  pinSalt: null,
  billSeq: 0,
  purchaseSeq: 0,
  version: APP_VERSION,
});

export function createStore(db) {
  let cache = null;

  /* ------------------------------------------------------------ read cache */

  async function data() {
    if (cache) return cache;
    cache = {};
    for (const store of [
      'products', 'categories', 'customers', 'suppliers', 'sales', 'sale_items',
      'returns', 'purchases', 'purchase_items', 'payments', 'expenses',
      'stock_movements', 'settings', 'meta',
    ]) {
      cache[store] = await db.getAll(store);
    }
    return cache;
  }

  /** Mirror a committed batch into the cache so reads never go stale. */
  async function commit(b) {
    const ops = b.ops;
    await b.commit();
    if (!cache) return;
    for (const o of ops) {
      const rows = cache[o.store];
      if (!rows) continue;
      if (o.op === 'put') {
        const i = rows.findIndex((r) => r.id === o.value.id);
        if (i >= 0) rows[i] = o.value;
        else rows.push(o.value);
      } else {
        const i = rows.findIndex((r) => r.id === o.id);
        if (i >= 0) rows.splice(i, 1);
      }
    }
  }

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const need = (cond, message, field) => {
    if (!cond) throw new ValidationError(message, field);
  };

  /* ---------------------------------------------------------------- settings */

  async function getSettings() {
    const d = await data();
    const row = d.settings.find((s) => s.id === 'settings');
    return { ...DEFAULT_SETTINGS, ...(row || {}) };
  }

  async function saveSettings(patch) {
    const current = await getSettings();
    const next = { ...current, ...patch, id: 'settings' };
    if (next.invoicePrefix) {
      next.invoicePrefix = String(next.invoicePrefix).trim().toUpperCase().slice(0, 10);
    }
    if (!['en', 'hi'].includes(next.language)) next.language = 'en';
    next.allowNegativeStock = Boolean(next.allowNegativeStock);
    const b = batch(db);
    b.put('settings', next);
    await commit(b);
    return next;
  }

  async function ensureSeed() {
    const d = await data();
    const b = batch(db);
    if (!d.settings.some((s) => s.id === 'settings')) b.put('settings', { ...DEFAULT_SETTINGS });
    if (d.categories.length === 0) {
      for (const name of DEFAULT_CATEGORIES) {
        b.put('categories', { id: uid('cat'), name, createdAt: nowISO() });
      }
    }
    if (b.size) await commit(b);
    return getSettings();
  }

  /* --------------------------------------------------------------- products */

  function normaliseProduct(input, existing) {
    const name = String(input.name || '').trim();
    need(name, 'Product name is required', 'name');
    const sellingPrice = toPaise(input.sellingPrice ?? 0);
    need(sellingPrice > 0, 'Selling price must be greater than 0', 'sellingPrice');
    const purchasePrice = toPaise(input.purchasePrice ?? 0);
    need(purchasePrice >= 0, 'Purchase price cannot be negative', 'purchasePrice');
    const mrp = toPaise(input.mrp ?? 0);
    need(mrp >= 0, 'MRP cannot be negative', 'mrp');
    const minStock = toMilli(input.minStock ?? 0);
    need(minStock >= 0, 'Minimum stock cannot be negative', 'minStock');

    const unit = String(input.unit || 'piece');
    need(UNITS.includes(unit), `Unit must be one of: ${UNITS.join(', ')}`, 'unit');

    return {
      id: existing ? existing.id : uid('prd'),
      name,
      category: String(input.category || 'Other').trim() || 'Other',
      brand: String(input.brand || '').trim(),
      sku: String(input.sku || '').trim(),
      purchasePrice,
      sellingPrice,
      mrp,
      minStockQtyMilli: minStock,
      unit,
      supplierId: input.supplierId || null,
      expiryDate: input.expiryDate || null,
      notes: String(input.notes || '').trim(),
      stockQtyMilli: existing ? existing.stockQtyMilli : toMilli(input.stockQty ?? 0),
      createdAt: existing ? existing.createdAt : nowISO(),
      updatedAt: nowISO(),
    };
  }

  async function listProducts(filter = {}) {
    const d = await data();
    let rows = d.products.slice();
    if (filter.q) {
      const q = String(filter.q).toLowerCase();
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku || '').toLowerCase().includes(q) ||
          (p.brand || '').toLowerCase().includes(q) ||
          (p.category || '').toLowerCase().includes(q),
      );
    }
    if (filter.category) rows = rows.filter((p) => p.category === filter.category);
    if (filter.stockFilter === 'low') {
      rows = rows.filter((p) => p.stockQtyMilli > 0 && p.stockQtyMilli <= p.minStockQtyMilli);
    } else if (filter.stockFilter === 'out') {
      rows = rows.filter((p) => p.stockQtyMilli <= 0);
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  async function getProduct(id) {
    const d = await data();
    return d.products.find((p) => p.id === id);
  }

  /** Find a product by SKU/barcode — the fallback path when no camera is used. */
  async function findBySku(sku) {
    const d = await data();
    const key = String(sku || '').trim().toLowerCase();
    if (!key) return undefined;
    return d.products.find((p) => (p.sku || '').toLowerCase() === key);
  }

  async function saveProduct(input) {
    const d = await data();
    const existing = input.id ? d.products.find((p) => p.id === input.id) : undefined;
    if (input.id && !existing) throw new ValidationError('Product not found', 'id');

    const dup = d.products.find(
      (p) => p.id !== (existing?.id || '') && (p.sku || '').trim() &&
        (p.sku || '').trim().toLowerCase() === String(input.sku || '').trim().toLowerCase(),
    );
    need(!dup, `SKU/barcode already used by "${dup?.name}"`, 'sku');

    const next = normaliseProduct(input, existing);
    const b = batch(db);

    // Opening stock (new product) or a manual correction (edit) is recorded as
    // a stock movement so the history always explains the current quantity.
    if (!existing) {
      if (next.stockQtyMilli !== 0) {
        b.put('stock_movements', movement(next, next.stockQtyMilli, 'opening', next.id, 'Opening stock', next.purchasePrice));
      }
    } else if (existing.stockQtyMilli !== next.stockQtyMilli) {
      const delta = next.stockQtyMilli - existing.stockQtyMilli;
      b.put('stock_movements', movement(next, delta, 'adjustment', next.id, input.adjustNote || 'Manual adjustment', next.purchasePrice));
    }
    b.put('products', next);
    await commit(b);
    return next;
  }

  /**
   * Hard delete is only allowed while the product has no history at all.
   * Anything that has been bought or sold must stay, or the accounts stop
   * adding up — use "stock = 0" or stop selling it instead.
   */
  async function deleteProduct(id) {
    const d = await data();
    const product = d.products.find((p) => p.id === id);
    if (!product) throw new ValidationError('Product not found', 'id');
    const used =
      d.sale_items.some((i) => i.productId === id) ||
      d.purchase_items.some((i) => i.productId === id) ||
      d.stock_movements.some((m) => m.productId === id);
    need(!used, 'This product has purchase/sale history and cannot be deleted. Set its stock to 0 instead.', 'id');

    const b = batch(db);
    b.del('products', id);
    await commit(b);
  }

  function movement(product, deltaMilli, type, refId, note, unitCostPaise) {
    return {
      id: uid('mov'),
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      qtyMilli: deltaMilli,
      type,
      refId,
      note: note || '',
      unitCostPaise: Number.isFinite(unitCostPaise) ? unitCostPaise : product.purchasePrice,
      date: nowISO(),
      day: localDateKey(new Date()),
    };
  }

  /* ------------------------------------------------------------------ sales */

  function nextBillNo(settings, seq) {
    return `${settings.invoicePrefix || 'KSM'}-${String(seq).padStart(5, '0')}`;
  }

  /**
   * Create a completed sale. Reduces stock, freezes the cost price on each
   * line, and links credit sales to the customer's ledger.
   */
  async function createSale(input) {
    const d = await data();
    const settings = await getSettings();

    const items = Array.isArray(input.items) ? input.items : [];
    need(items.length > 0, 'Add at least one product to the bill', 'items');

    const mode = PAYMENT_MODES.includes(input.paymentMode) ? input.paymentMode : 'cash';
    const customerId = input.customerId || null;
    if (mode === 'credit') {
      need(Boolean(customerId), 'Select a customer for a credit (udhaar) sale', 'customerId');
    }
    if (customerId) {
      need(d.customers.some((c) => c.id === customerId), 'Customer not found', 'customerId');
    }

    const when = input.date ? new Date(input.date) : new Date();
    need(!Number.isNaN(when.getTime()), 'Invalid sale date', 'date');

    const saleId = uid('sal');           // needed now so each line can point back
    const lines = [];
    let subtotal = 0;
    let itemDiscount = 0;

    for (const raw of items) {
      const product = d.products.find((p) => p.id === raw.productId);
      need(Boolean(product), `Product not found: ${raw.productId}`, 'productId');

      const qty = toMilli(raw.qty);
      need(qty > 0, `Quantity for "${product.name}" must be greater than 0`, 'qty');

      const price = raw.price === undefined || raw.price === '' ? product.sellingPrice : toPaise(raw.price);
      need(price >= 0, 'Price cannot be negative', 'price');

      const gross = lineTotalPaise(qty, price);
      const disc = toPaise(raw.discount ?? 0);
      need(disc >= 0 && disc <= gross, `Discount on "${product.name}" cannot exceed the line total`, 'discount');

      if (!settings.allowNegativeStock) {
        const already = lines.reduce((n, l) => (l.productId === product.id ? n + l.qtyMilli : n), 0);
        const available = product.stockQtyMilli - already;
        need(qty <= available, `Only ${available / MILLI} ${product.unit} of "${product.name}" in stock`, 'qty');
      }

      subtotal += gross;
      itemDiscount += disc;
      lines.push({
        id: uid('si'),
        saleId,
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        qtyMilli: qty,
        pricePaise: price,
        discountPaise: disc,
        totalPaise: gross - disc,
        costPaise: product.purchasePrice,          // frozen for profit reports
        returnedQtyMilli: 0,
      });
    }

    const orderDiscount = toPaise(input.discount ?? 0);
    need(orderDiscount >= 0 && orderDiscount <= subtotal - itemDiscount, 'Discount cannot exceed the bill total', 'discount');
    const total = subtotal - itemDiscount - orderDiscount;

    let amountPaid = 0;
    if (mode !== 'credit') {
      amountPaid = input.amountPaid === undefined || input.amountPaid === '' ? total : toPaise(input.amountPaid);
      need(amountPaid === total, `${mode.toUpperCase()} sales must be paid in full — use Credit/Udhaar for partial payment`, 'amountPaid');
    } else {
      amountPaid = toPaise(input.advance ?? 0);
      need(amountPaid >= 0 && amountPaid < total, 'Advance on a credit sale must be less than the bill total', 'advance');
    }

    const seq = (settings.billSeq || 0) + 1;
    const sale = {
      id: saleId,
      billNo: nextBillNo(settings, seq),
      date: when.toISOString(),
      day: localDateKey(when),
      customerId,
      customerName: customerId ? d.customers.find((c) => c.id === customerId)?.name || '' : '',
      items: lines.map((l) => l.id),
      subtotalPaise: subtotal,
      itemDiscountPaise: itemDiscount,
      discountPaise: orderDiscount,
      totalPaise: total,
      paymentMode: mode,
      amountPaidPaise: amountPaid,
      status: 'completed',
      notes: String(input.notes || '').trim(),
      createdAt: nowISO(),
    };

    const b = batch(db);
    b.put('sales', sale);
    for (const line of lines) b.put('sale_items', line);

    for (const line of lines) {
      const product = d.products.find((p) => p.id === line.productId);
      const updated = { ...product, stockQtyMilli: product.stockQtyMilli - line.qtyMilli, updatedAt: nowISO() };
      b.put('products', updated);
      b.put('stock_movements', movement(updated, -line.qtyMilli, 'sale', sale.id, `Sale ${sale.billNo}`, line.costPaise));
    }

    if (amountPaid > 0) {
      b.put('payments', {
        id: uid('pay'),
        date: sale.date,
        day: sale.day,
        partyType: 'customer',
        partyId: customerId,
        amountPaise: amountPaid,
        mode,
        kind: 'received',
        saleId: sale.id,
        notes: 'Advance on sale',
        status: 'posted',
        createdAt: nowISO(),
      });
    }

    b.put('settings', { ...settings, billSeq: seq });
    await commit(b);
    return { sale, items: lines };
  }

  async function getSale(id) {
    const d = await data();
    const sale = d.sales.find((s) => s.id === id);
    if (!sale) return undefined;
    return { ...sale, lines: d.sale_items.filter((i) => i.saleId === sale.id || sale.items.includes(i.id)) };
  }

  async function listSales(filter = {}) {
    const d = await data();
    let rows = d.sales.slice();
    if (filter.from) rows = rows.filter((s) => s.date >= filter.from);
    if (filter.to) rows = rows.filter((s) => s.date < filter.to);
    if (filter.customerId) rows = rows.filter((s) => s.customerId === filter.customerId);
    if (filter.status) rows = rows.filter((s) => s.status === filter.status);
    if (filter.q) {
      const q = String(filter.q).toLowerCase();
      rows = rows.filter((s) => s.billNo.toLowerCase().includes(q) || (s.customerName || '').toLowerCase().includes(q));
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }

  /**
   * Return all or part of a sale. Restores stock with a reversal movement and
   * marks the returned quantity on the original line, so profit and the
   * customer's udhaar both drop automatically.
   */
  async function returnSale(saleId, input = {}) {
    const d = await data();
    const sale = d.sales.find((s) => s.id === saleId);
    need(Boolean(sale), 'Sale not found', 'saleId');
    need(sale.status === 'completed', `A ${sale.status} sale cannot be returned`, 'saleId');

    const allLines = d.sale_items.filter((i) => sale.items.includes(i.id));
    // Normalise BOTH paths to milli-units up front. Mixing "user quantity" and
    // "milli-units" in the same field silently multiplied full returns by 1000.
    const requested = Array.isArray(input.items) && input.items.length
      ? input.items.map((r) => ({ id: r.saleItemId, qtyMilli: toMilli(r.qty) }))
      : allLines.map((l) => ({ id: l.id, qtyMilli: l.qtyMilli - l.returnedQtyMilli }));

    const b = batch(db);
    const returned = [];
    let refund = 0;

    for (const req of requested) {
      const line = allLines.find((l) => l.id === req.id);
      need(Boolean(line), 'Bill line not found', 'items');
      const qty = req.qtyMilli;
      const returnable = line.qtyMilli - line.returnedQtyMilli;
      need(qty > 0, 'Return quantity must be greater than 0', 'qty');
      need(qty <= returnable, `Only ${returnable / MILLI} ${line.unit} of "${line.productName}" can still be returned`, 'qty');

      const unitNet = line.qtyMilli ? (line.totalPaise * MILLI) / line.qtyMilli : 0;
      const amount = Math.round((unitNet * qty) / MILLI);
      refund += amount;

      const updatedLine = { ...line, returnedQtyMilli: line.returnedQtyMilli + qty };
      b.put('sale_items', updatedLine);

      const product = d.products.find((p) => p.id === line.productId);
      if (product) {
        const updated = { ...product, stockQtyMilli: product.stockQtyMilli + qty, updatedAt: nowISO() };
        b.put('products', updated);
        b.put('stock_movements', movement(updated, qty, 'sale_return', sale.id, `Return against ${sale.billNo}`, line.costPaise));
      }
      returned.push({ saleItemId: line.id, productId: line.productId, productName: line.productName, qtyMilli: qty, refundPaise: amount });
    }

    need(returned.length > 0, 'Nothing to return', 'items');

    const alreadyReturned = d.returns
      .filter((r) => r.saleId === saleId)
      .reduce((n, r) => n + r.refundPaise, 0);
    const fullyReturned = alreadyReturned + refund >= sale.totalPaise;

    const record = {
      id: uid('ret'),
      kind: 'sale',
      saleId,
      billNo: sale.billNo,
      customerId: sale.customerId,
      date: nowISO(),
      day: localDateKey(new Date()),
      items: returned,
      refundPaise: refund,
      reason: String(input.reason || 'Customer return').trim(),
      createdAt: nowISO(),
    };
    b.put('returns', record);

    if (fullyReturned) b.put('sales', { ...sale, status: 'returned' });

    // A refund on a paid (cash/UPI) sale is cash going back out.
    if (sale.paymentMode !== 'credit' && refund > 0) {
      b.put('payments', {
        id: uid('pay'),
        date: record.date,
        day: record.day,
        partyType: 'customer',
        partyId: sale.customerId,
        amountPaise: -refund,
        mode: sale.paymentMode,
        kind: 'refund',
        saleId,
        notes: `Refund for return on ${sale.billNo}`,
        status: 'posted',
        createdAt: nowISO(),
      });
    }

    await commit(b);
    return record;
  }

  /**
   * Cancel a sale before it is settled. Reverses stock in full and flags the
   * record as void instead of erasing it, so the bill sequence stays honest.
   */
  async function voidSale(saleId, reason = '') {
    const d = await data();
    const sale = d.sales.find((s) => s.id === saleId);
    need(Boolean(sale), 'Sale not found', 'saleId');
    need(sale.status === 'completed', `A ${sale.status} sale cannot be cancelled`, 'saleId');

    const lines = d.sale_items.filter((i) => sale.items.includes(i.id));
    const b = batch(db);
    for (const line of lines) {
      const outstanding = line.qtyMilli - line.returnedQtyMilli;
      need(outstanding === line.qtyMilli, 'Return the partially-returned items first, then cancel', 'items');
      const product = d.products.find((p) => p.id === line.productId);
      if (product) {
        const updated = { ...product, stockQtyMilli: product.stockQtyMilli + line.qtyMilli, updatedAt: nowISO() };
        b.put('products', updated);
        b.put('stock_movements', movement(updated, line.qtyMilli, 'sale_void', sale.id, `Cancelled ${sale.billNo}`, line.costPaise));
      }
    }
    b.put('sales', { ...sale, status: 'void', voidReason: String(reason || 'Cancelled').trim(), voidedAt: nowISO() });
    await commit(b);
    return { ...sale, status: 'void' };
  }

  /* -------------------------------------------------------------- purchases */

  async function createPurchase(input) {
    const d = await data();
    const settings = await getSettings();
    const items = Array.isArray(input.items) ? input.items : [];
    need(items.length > 0, 'Add at least one product to the purchase', 'items');

    const supplierId = input.supplierId || null;
    if (supplierId) need(d.suppliers.some((s) => s.id === supplierId), 'Supplier not found', 'supplierId');

    const when = input.date ? new Date(input.date) : new Date();
    need(!Number.isNaN(when.getTime()), 'Invalid purchase date', 'date');

    const purchaseId = uid('pur');       // needed now so each line can point back
    const lines = [];
    let total = 0;
    for (const raw of items) {
      const product = d.products.find((p) => p.id === raw.productId);
      need(Boolean(product), `Product not found: ${raw.productId}`, 'productId');
      const qty = toMilli(raw.qty);
      need(qty > 0, `Quantity for "${product.name}" must be greater than 0`, 'qty');
      const rate = raw.rate === undefined || raw.rate === '' ? product.purchasePrice : toPaise(raw.rate);
      need(rate >= 0, 'Purchase rate cannot be negative', 'rate');
      const amount = lineTotalPaise(qty, rate);
      total += amount;
      lines.push({
        id: uid('pi'),
        purchaseId,
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        qtyMilli: qty,
        ratePaise: rate,
        totalPaise: amount,
        returnedQtyMilli: 0,
      });
    }

    const paid = toPaise(input.amountPaid ?? 0);
    need(paid >= 0 && paid <= total, 'Amount paid cannot exceed the purchase total', 'amountPaid');

    const seq = (settings.purchaseSeq || 0) + 1;
    const purchase = {
      id: purchaseId,
      invoiceNo: String(input.invoiceNo || `PUR-${String(seq).padStart(5, '0')}`).trim(),
      date: when.toISOString(),
      day: localDateKey(when),
      supplierId,
      supplierName: supplierId ? d.suppliers.find((s) => s.id === supplierId)?.name || '' : '',
      items: lines.map((l) => l.id),
      totalPaise: total,
      amountPaidPaise: paid,
      paymentStatus: paid >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
      status: 'completed',
      notes: String(input.notes || '').trim(),
      createdAt: nowISO(),
    };

    const b = batch(db);
    b.put('purchases', purchase);
    for (const line of lines) b.put('purchase_items', line);
    for (const line of lines) {
      const product = d.products.find((p) => p.id === line.productId);
      const updated = {
        ...product,
        stockQtyMilli: product.stockQtyMilli + line.qtyMilli,
        purchasePrice: line.ratePaise,             // moving cost for future sales
        updatedAt: nowISO(),
      };
      b.put('products', updated);
      b.put('stock_movements', movement(updated, line.qtyMilli, 'purchase', purchase.id, `Purchase ${purchase.invoiceNo}`, line.ratePaise));
    }
    if (paid > 0 && supplierId) {
      b.put('payments', {
        id: uid('pay'),
        date: purchase.date,
        day: purchase.day,
        partyType: 'supplier',
        partyId: supplierId,
        amountPaise: paid,
        mode: input.paymentMode || 'cash',
        kind: 'paid',
        purchaseId: purchase.id,
        notes: `Payment for ${purchase.invoiceNo}`,
        status: 'posted',
        createdAt: nowISO(),
      });
    }
    b.put('settings', { ...settings, purchaseSeq: seq });
    await commit(b);
    return { purchase, items: lines };
  }

  async function listPurchases(filter = {}) {
    const d = await data();
    let rows = d.purchases.slice();
    if (filter.from) rows = rows.filter((p) => p.date >= filter.from);
    if (filter.to) rows = rows.filter((p) => p.date < filter.to);
    if (filter.supplierId) rows = rows.filter((p) => p.supplierId === filter.supplierId);
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }

  async function returnPurchase(purchaseId, input = {}) {
    const d = await data();
    const purchase = d.purchases.find((p) => p.id === purchaseId);
    need(Boolean(purchase), 'Purchase not found', 'purchaseId');
    need(purchase.status === 'completed', `A ${purchase.status} purchase cannot be returned`, 'purchaseId');

    const allLines = d.purchase_items.filter((i) => purchase.items.includes(i.id));
    // Same normalisation as returnSale — see the note there.
    const requested = Array.isArray(input.items) && input.items.length
      ? input.items.map((r) => ({ id: r.purchaseItemId, qtyMilli: toMilli(r.qty) }))
      : allLines.map((l) => ({ id: l.id, qtyMilli: l.qtyMilli - l.returnedQtyMilli }));

    const b = batch(db);
    const returned = [];
    let credit = 0;

    for (const req of requested) {
      const line = allLines.find((l) => l.id === req.id);
      need(Boolean(line), 'Purchase line not found', 'items');
      const qty = req.qtyMilli;
      const returnable = line.qtyMilli - line.returnedQtyMilli;
      need(qty > 0 && qty <= returnable, `Only ${returnable / MILLI} ${line.unit} can be returned`, 'qty');

      const product = d.products.find((p) => p.id === line.productId);
      need(Boolean(product), 'Product no longer exists', 'productId');
      need(product.stockQtyMilli - qty >= 0 || (await getSettings()).allowNegativeStock,
        `Cannot return ${qty / MILLI} ${line.unit} of "${line.productName}" — only ${product.stockQtyMilli / MILLI} ${line.unit} left in stock`,
        'qty');

      const amount = Math.round(((line.totalPaise * MILLI) / line.qtyMilli) * qty / MILLI);
      credit += amount;

      b.put('purchase_items', { ...line, returnedQtyMilli: line.returnedQtyMilli + qty });
      const updated = { ...product, stockQtyMilli: product.stockQtyMilli - qty, updatedAt: nowISO() };
      b.put('products', updated);
      b.put('stock_movements', movement(updated, -qty, 'purchase_return', purchase.id, `Return to supplier (${purchase.invoiceNo})`, line.ratePaise));
      returned.push({ purchaseItemId: line.id, productId: line.productId, productName: line.productName, qtyMilli: qty, amountPaise: amount });
    }

    const record = {
      id: uid('ret'),
      kind: 'purchase',
      purchaseId,
      invoiceNo: purchase.invoiceNo,
      supplierId: purchase.supplierId,
      date: nowISO(),
      day: localDateKey(new Date()),
      items: returned,
      refundPaise: credit,
      reason: String(input.reason || 'Returned to supplier').trim(),
      createdAt: nowISO(),
    };
    b.put('returns', record);
    await commit(b);
    return record;
  }

  /* --------------------------------------------------------------- parties */

  async function saveCustomer(input) {
    const d = await data();
    const name = String(input.name || '').trim();
    need(name, 'Customer name is required', 'name');
    const mobile = String(input.mobile || '').trim();
    if (mobile) need(/^[0-9+\-\s]{6,15}$/.test(mobile), 'Enter a valid mobile number', 'mobile');

    const existing = input.id ? d.customers.find((c) => c.id === input.id) : undefined;
    if (input.id && !existing) throw new ValidationError('Customer not found', 'id');

    const next = {
      id: existing ? existing.id : uid('cus'),
      name,
      mobile,
      address: String(input.address || '').trim(),
      notes: String(input.notes || '').trim(),
      createdAt: existing ? existing.createdAt : nowISO(),
      updatedAt: nowISO(),
    };
    const b = batch(db);
    b.put('customers', next);
    // Keep the denormalised name on past bills in sync after a rename.
    for (const s of d.sales) {
      if (s.customerId === next.id && s.customerName !== next.name) {
        b.put('sales', { ...s, customerName: next.name });
      }
    }
    await commit(b);
    return next;
  }

  async function saveSupplier(input) {
    const d = await data();
    const name = String(input.name || '').trim();
    need(name, 'Supplier name is required', 'name');
    const existing = input.id ? d.suppliers.find((s) => s.id === input.id) : undefined;
    if (input.id && !existing) throw new ValidationError('Supplier not found', 'id');
    const next = {
      id: existing ? existing.id : uid('sup'),
      name,
      mobile: String(input.mobile || '').trim(),
      address: String(input.address || '').trim(),
      notes: String(input.notes || '').trim(),
      createdAt: existing ? existing.createdAt : nowISO(),
      updatedAt: nowISO(),
    };
    const b = batch(db);
    b.put('suppliers', next);
    await commit(b);
    return next;
  }

  /**
   * Customer ledger — derived, never a stored balance.
   * Credit sales add, payments subtract, returns give credit back.
   */
  async function customerLedger(customerId) {
    const d = await data();
    const entries = [];
    for (const s of d.sales) {
      if (s.customerId !== customerId) continue;
      if (s.status === 'void') continue;
      entries.push({
        id: s.id, date: s.date, day: s.day, type: 'sale',
        label: `Bill ${s.billNo}`, debitPaise: s.totalPaise, creditPaise: 0,
        status: s.status,
      });
    }
    for (const r of d.returns) {
      if (r.kind !== 'sale' || r.customerId !== customerId) continue;
      entries.push({
        id: r.id, date: r.date, day: r.day, type: 'return',
        label: `Return — ${r.billNo}`, debitPaise: 0, creditPaise: r.refundPaise,
        status: 'completed',
      });
    }
    for (const p of d.payments) {
      if (p.partyType !== 'customer' || p.partyId !== customerId || p.status !== 'posted') continue;
      entries.push({
        id: p.id, date: p.date, day: p.day, type: p.kind === 'refund' ? 'refund' : 'payment',
        label: p.kind === 'refund' ? 'Refund issued' : `Payment received (${p.mode})`,
        debitPaise: p.amountPaise < 0 ? -p.amountPaise : 0,
        creditPaise: p.amountPaise > 0 ? p.amountPaise : 0,
        status: 'completed', notes: p.notes,
      });
    }
    entries.sort((a, b) => a.date.localeCompare(b.date));
    let running = 0;
    for (const e of entries) {
      running += e.debitPaise - e.creditPaise;
      e.balancePaise = running;
    }
    return entries;
  }

  async function customerSummary(customerId) {
    const ledger = await customerLedger(customerId);
    let billed = 0;
    let paid = 0;
    for (const e of ledger) {
      if (e.type === 'sale') billed += e.debitPaise;
      else paid += e.creditPaise - e.debitPaise;
    }
    const outstanding = billed - paid;
    return { customerId, billedPaise: billed, paidPaise: paid, outstandingPaise: outstanding };
  }

  async function listCustomers() {
    const d = await data();
    const out = [];
    for (const c of d.customers) {
      const s = await customerSummary(c.id);
      out.push({ ...c, ...s });
    }
    return out.sort((a, b) => b.outstandingPaise - a.outstandingPaise || a.name.localeCompare(b.name));
  }

  async function supplierSummary(supplierId) {
    const d = await data();
    let billed = 0;
    for (const p of d.purchases) {
      if (p.supplierId === supplierId && p.status === 'completed') billed += p.totalPaise;
    }
    for (const r of d.returns) {
      if (r.kind === 'purchase' && r.supplierId === supplierId) billed -= r.refundPaise;
    }
    let paid = 0;
    for (const pay of d.payments) {
      if (pay.partyType === 'supplier' && pay.partyId === supplierId && pay.status === 'posted' && pay.amountPaise > 0) {
        paid += pay.amountPaise;
      }
    }
    return { supplierId, billedPaise: billed, paidPaise: paid, payablePaise: billed - paid };
  }

  async function listSuppliers() {
    const d = await data();
    const out = [];
    for (const s of d.suppliers) out.push({ ...s, ...(await supplierSummary(s.id)) });
    return out.sort((a, b) => b.payablePaise - a.payablePaise || a.name.localeCompare(b.name));
  }

  async function recordPayment(input) {
    const d = await data();
    const partyType = input.partyType === 'supplier' ? 'supplier' : 'customer';
    const partyId = input.partyId;
    need(Boolean(partyId), 'Select a customer or supplier', 'partyId');
    need(
      partyType === 'customer'
        ? d.customers.some((c) => c.id === partyId)
        : d.suppliers.some((s) => s.id === partyId),
      'Party not found', 'partyId',
    );
    const amount = toPaise(input.amount);
    need(amount > 0, 'Payment amount must be greater than 0', 'amount');
    const when = input.date ? new Date(input.date) : new Date();
    need(!Number.isNaN(when.getTime()), 'Invalid payment date', 'date');

    if (partyType === 'customer') {
      const s = await customerSummary(partyId);
      need(amount <= s.outstandingPaise, `Outstanding is only ${s.outstandingPaise / 100} — payment cannot exceed it`, 'amount');
    }

    const payment = {
      id: uid('pay'),
      date: when.toISOString(),
      day: localDateKey(when),
      partyType,
      partyId,
      amountPaise: amount,
      mode: PAYMENT_MODES.includes(input.mode) ? input.mode : 'cash',
      kind: partyType === 'customer' ? 'received' : 'paid',
      notes: String(input.notes || '').trim(),
      status: 'posted',
      createdAt: nowISO(),
    };
    const b = batch(db);
    b.put('payments', payment);
    await commit(b);
    return payment;
  }

  /** Reverse a wrongly-entered payment instead of deleting it. */
  async function voidPayment(paymentId, reason = '') {
    const d = await data();
    const p = d.payments.find((x) => x.id === paymentId);
    need(Boolean(p), 'Payment not found', 'paymentId');
    need(p.status === 'posted', 'Payment is already void', 'paymentId');
    const b = batch(db);
    b.put('payments', { ...p, status: 'void', voidReason: String(reason || 'Entry mistake').trim(), voidedAt: nowISO() });
    await commit(b);
    return { ...p, status: 'void' };
  }

  /* --------------------------------------------------------------- expenses */

  async function saveExpense(input) {
    const d = await data();
    const amount = toPaise(input.amount);
    need(amount > 0, 'Expense amount must be greater than 0', 'amount');
    const category = String(input.category || 'other');
    need(EXPENSE_CATEGORIES.includes(category), `Category must be one of: ${EXPENSE_CATEGORIES.join(', ')}`, 'category');
    const when = input.date ? new Date(input.date) : new Date();
    need(!Number.isNaN(when.getTime()), 'Invalid expense date', 'date');

    const existing = input.id ? d.expenses.find((e) => e.id === input.id) : undefined;
    if (input.id && !existing) throw new ValidationError('Expense not found', 'id');

    const next = {
      id: existing ? existing.id : uid('exp'),
      date: when.toISOString(),
      day: localDateKey(when),
      category,
      amountPaise: amount,
      note: String(input.note || '').trim(),
      status: 'posted',
      createdAt: existing ? existing.createdAt : nowISO(),
      updatedAt: nowISO(),
    };
    const b = batch(db);
    b.put('expenses', next);
    await commit(b);
    return next;
  }

  async function voidExpense(expenseId, reason = '') {
    const d = await data();
    const e = d.expenses.find((x) => x.id === expenseId);
    need(Boolean(e), 'Expense not found', 'expenseId');
    const b = batch(db);
    b.put('expenses', { ...e, status: 'void', voidReason: String(reason || 'Entry mistake').trim(), voidedAt: nowISO() });
    await commit(b);
    return { ...e, status: 'void' };
  }

  async function listExpenses(filter = {}) {
    const d = await data();
    let rows = d.expenses.filter((e) => e.status !== 'void');
    if (filter.from) rows = rows.filter((e) => e.date >= filter.from);
    if (filter.to) rows = rows.filter((e) => e.date < filter.to);
    if (filter.category) rows = rows.filter((e) => e.category === filter.category);
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }

  /* ------------------------------------------------------------------ stock */

  async function stockHistory(productId) {
    const d = await data();
    return d.stock_movements
      .filter((m) => m.productId === productId)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Independent re-derivation of stock from movements — the integrity check. */
  async function verifyStockIntegrity() {
    const d = await data();
    const derived = new Map();
    for (const m of d.stock_movements) {
      derived.set(m.productId, (derived.get(m.productId) || 0) + m.qtyMilli);
    }
    const problems = [];
    for (const p of d.products) {
      const expected = derived.get(p.id) || 0;
      if (expected !== p.stockQtyMilli) {
        problems.push({ productId: p.id, name: p.name, stored: p.stockQtyMilli, derived: expected });
      }
    }
    return problems;
  }

  /** Repair tool: rebuild every product's stock from its movement history. */
  async function recomputeStock() {
    const d = await data();
    const derived = new Map();
    for (const m of d.stock_movements) {
      derived.set(m.productId, (derived.get(m.productId) || 0) + m.qtyMilli);
    }
    const b = batch(db);
    let fixed = 0;
    for (const p of d.products) {
      const expected = derived.get(p.id) || 0;
      if (expected !== p.stockQtyMilli) {
        b.put('products', { ...p, stockQtyMilli: expected, updatedAt: nowISO() });
        fixed += 1;
      }
    }
    if (b.size) await commit(b);
    return fixed;
  }

  /* ----------------------------------------------------------------- backup */

  async function exportAll() {
    const d = await data();
    const payload = { app: 'kirana-store-manager', schemaVersion: 1, version: APP_VERSION, exportedAt: nowISO(), data: {} };
    for (const [key, rows] of Object.entries(d)) payload.data[key] = rows;
    return payload;
  }

  /**
   * Restore a JSON backup. `mode: 'replace'` wipes first (default), `mode:
   * 'merge'` upserts so two devices can be combined without losing records.
   */
  async function importAll(payload, mode = 'replace') {
    if (!payload || typeof payload !== 'object' || !payload.data) {
      throw new ValidationError('This file is not a Kirana Store Manager backup', 'file');
    }
    if (payload.app !== 'kirana-store-manager') {
      throw new ValidationError('Backup was created by a different app', 'file');
    }
    const b = batch(db);
    if (mode === 'replace') {
      await db.clearAll();
      cache = null;
    }
    const existing = await data();
    for (const [store, rows] of Object.entries(payload.data)) {
      if (!Array.isArray(rows)) continue;
      if (!Object.prototype.hasOwnProperty.call(existing, store)) continue;   // ignore unknown stores
      for (const row of rows) {
        if (row && typeof row.id === 'string') b.put(store, row);
      }
    }
    await commit(b);
    return { stores: Object.keys(payload.data).length };
  }

  async function resetAll() {
    await db.clearAll();
    cache = null;
    await ensureSeed();
  }

  return {
    APP_VERSION,
    ensureSeed,
    getSettings,
    saveSettings,
    // products
    listProducts,
    getProduct,
    findBySku,
    saveProduct,
    deleteProduct,
    stockHistory,
    verifyStockIntegrity,
    recomputeStock,
    // sales
    createSale,
    getSale,
    listSales,
    returnSale,
    voidSale,
    // purchases
    createPurchase,
    listPurchases,
    returnPurchase,
    // parties
    saveCustomer,
    saveSupplier,
    listCustomers,
    listSuppliers,
    customerLedger,
    customerSummary,
    supplierSummary,
    recordPayment,
    voidPayment,
    // expenses
    saveExpense,
    voidExpense,
    listExpenses,
    // backup
    exportAll,
    importAll,
    resetAll,
    // raw access for the report layer
    _raw: data,
  };
}
