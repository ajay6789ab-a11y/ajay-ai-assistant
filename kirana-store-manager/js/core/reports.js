/**
 * Reports & profit.
 *
 * These are pure functions over the raw record sets — no DOM, no storage —
 * so the numbers in the dashboard, the report screens and the Node tests all
 * come from exactly one implementation.
 *
 * Gross Profit = Sales Revenue − Purchase Cost of Sold Items
 * Net Profit   = Gross Profit − Recorded Expenses
 *
 * Void sales are excluded entirely. Returned quantities are excluded from both
 * revenue and cost, so a returned bill contributes zero profit.
 */

import { fmtQty, MILLI } from './money.js';
import { endOfDay, startOfDay } from './ids.js';

const isLiveSale = (s) => s.status === 'completed' || s.status === 'returned';

/** Net (un-returned) quantity of a sale line, in milli-units. */
function netQtyMilli(line) {
  return Math.max(0, line.qtyMilli - (line.returnedQtyMilli || 0));
}

/** Revenue of a sale line after its share of returns. */
function netRevenuePaise(line) {
  if (!line.qtyMilli) return 0;
  return Math.round((line.totalPaise * netQtyMilli(line)) / line.qtyMilli);
}

/** Cost of the units actually sold on a line, at the frozen purchase price. */
function netCostPaise(line) {
  return Math.round((line.costPaise * netQtyMilli(line)) / MILLI);
}

export function dateRange(preset, custom = {}, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  switch (preset) {
    case 'yesterday': {
      const from = new Date(y, m, d - 1);
      return { from: startOfDay(from), to: endOfDay(from) };
    }
    case 'week': {
      const from = new Date(y, m, d - 6);
      return { from: startOfDay(from), to: endOfDay(now) };
    }
    case 'month':
      return { from: startOfDay(new Date(y, m, 1)), to: endOfDay(now) };
    case 'custom': {
      if (!custom.from || !custom.to) throw new Error('Custom range needs both dates');
      const from = new Date(custom.from);
      const to = new Date(custom.to);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new Error('Invalid custom range');
      if (from > to) throw new Error('From date cannot be after the to date');
      return { from: startOfDay(from), to: endOfDay(to) };
    }
    case 'today':
    default:
      return { from: startOfDay(now), to: endOfDay(now) };
  }
}

const inRange = (iso, range) => iso >= range.from && iso < range.to;

/**
 * The full picture for a period: sales, collections by mode, profit, dues.
 */
export function summarise(data, range) {
  const sales = data.sales.filter((s) => inRange(s.date, range));
  const liveSales = sales.filter(isLiveSale);
  const voidSales = sales.filter((s) => s.status === 'void');

  // A line counts towards the period its BILL falls in, and only while that
  // bill is live (completed, or partially/fully returned).
  const liveIds = new Set(liveSales.map((s) => s.id));
  const relevantLines = data.sale_items.filter((i) => liveIds.has(i.saleId));

  const revenue = relevantLines.reduce((n, l) => n + netRevenuePaise(l), 0);
  const cogs = relevantLines.reduce((n, l) => n + netCostPaise(l), 0);
  const grossProfit = revenue - cogs;

  const returns = data.returns.filter((r) => r.kind === 'sale' && inRange(r.date, range));
  const returnAmount = returns.reduce((n, r) => n + r.refundPaise, 0);

  // Collections in the period: cash/UPI taken at the counter, plus payments
  // received against earlier udhaar.
  let cash = 0;
  let upi = 0;
  let credit = 0;
  for (const s of liveSales) {
    if (s.paymentMode === 'cash') cash += s.amountPaidPaise || 0;
    else if (s.paymentMode === 'upi') upi += s.amountPaidPaise || 0;
    else credit += s.totalPaise - (s.amountPaidPaise || 0);
  }
  let collections = 0;
  for (const p of data.payments) {
    if (p.partyType !== 'customer' || p.status !== 'posted' || !inRange(p.date, range)) continue;
    if (p.kind === 'received') collections += p.amountPaise;
    else if (p.kind === 'refund') collections -= Math.abs(p.amountPaise);
  }

  const expenses = data.expenses.filter((e) => e.status !== 'void' && inRange(e.date, range));
  const expenseTotal = expenses.reduce((n, e) => n + e.amountPaise, 0);

  const purchases = data.purchases.filter((p) => p.status === 'completed' && inRange(p.date, range));
  const purchaseTotal = purchases.reduce((n, p) => n + p.totalPaise, 0);

  // Dues / payables are point-in-time totals, not period totals.
  let totalCustomerDues = 0;
  for (const c of data.customers) totalCustomerDues += outstandingFor(data, c.id);
  let totalSupplierPayable = 0;
  for (const s of data.suppliers) totalSupplierPayable += payableFor(data, s.id);

  const byCategory = new Map();
  for (const e of expenses) {
    byCategory.set(e.category, (byCategory.get(e.category) || 0) + e.amountPaise);
  }

  return {
    range,
    salesCount: liveSales.length,
    voidCount: voidSales.length,
    revenuePaise: revenue,
    cogsPaise: cogs,
    grossProfitPaise: grossProfit,
    returnCount: returns.length,
    returnAmountPaise: returnAmount,
    expenseTotalPaise: expenseTotal,
    expensesByCategory: Object.fromEntries(byCategory),
    netProfitPaise: grossProfit - expenseTotal,
    purchaseTotalPaise: purchaseTotal,
    purchaseCount: purchases.length,
    cashPaise: cash,
    upiPaise: upi,
    creditPaise: credit,
    collectionsPaise: collections,
    totalCustomerDuesPaise: totalCustomerDues,
    totalSupplierPayablePaise: totalSupplierPayable,
  };
}

/** Outstanding udhaar for one customer, derived from live transactions. */
export function outstandingFor(data, customerId) {
  let billed = 0;
  for (const s of data.sales) {
    if (s.customerId !== customerId || !isLiveSale(s)) continue;
    billed += s.totalPaise;
  }
  for (const r of data.returns) {
    if (r.kind === 'sale' && r.customerId === customerId) billed -= r.refundPaise;
  }
  let paid = 0;
  for (const p of data.payments) {
    if (p.partyType !== 'customer' || p.partyId !== customerId || p.status !== 'posted') continue;
    paid += p.amountPaise;              // refunds are stored negative
  }
  return billed - paid;
}

/** Amount still owed to one supplier, derived the same way. */
export function payableFor(data, supplierId) {
  let billed = 0;
  for (const p of data.purchases) {
    if (p.supplierId === supplierId && p.status === 'completed') billed += p.totalPaise;
  }
  for (const r of data.returns) {
    if (r.kind === 'purchase' && r.supplierId === supplierId) billed -= r.refundPaise;
  }
  let paid = 0;
  for (const p of data.payments) {
    if (p.partyType !== 'supplier' || p.partyId !== supplierId || p.status !== 'posted' || p.amountPaise <= 0) continue;
    paid += p.amountPaise;
  }
  return billed - paid;
}

/** Best sellers in a period, by revenue, with units sold. */
export function topProducts(data, range, limit = 10) {
  const liveIds = new Set(data.sales.filter((s) => isLiveSale(s) && inRange(s.date, range)).map((s) => s.id));
  const agg = new Map();
  for (const line of data.sale_items) {
    if (!liveIds.has(line.saleId)) continue;
    const qty = netQtyMilli(line);
    if (qty <= 0) continue;
    const row = agg.get(line.productId) || {
      productId: line.productId, name: line.productName, unit: line.unit,
      qtyMilli: 0, revenuePaise: 0, costPaise: 0,
    };
    row.qtyMilli += qty;
    row.revenuePaise += netRevenuePaise(line);
    row.costPaise += netCostPaise(line);
    agg.set(line.productId, row);
  }
  return [...agg.values()]
    .map((r) => ({ ...r, profitPaise: r.revenuePaise - r.costPaise, qtyLabel: fmtQty(r.qtyMilli) }))
    .sort((a, b) => b.revenuePaise - a.revenuePaise)
    .slice(0, limit);
}

/** Products at or below their minimum level, and products at zero. */
export function stockAlerts(data) {
  const low = [];
  const out = [];
  for (const p of data.products) {
    if (p.stockQtyMilli <= 0) out.push(p);
    else if (p.minStockQtyMilli > 0 && p.stockQtyMilli <= p.minStockQtyMilli) low.push(p);
  }
  const byQty = (a, b) => a.stockQtyMilli - b.stockQtyMilli;
  return { low: low.sort(byQty), out: out.sort((a, b) => a.name.localeCompare(b.name)) };
}

/** Most recent live transactions, newest first. */
export function recentTransactions(data, limit = 10) {
  const rows = [
    ...data.sales.filter((s) => s.status !== 'void').map((s) => ({
      id: s.id, kind: 'sale', date: s.date, label: `Bill ${s.billNo}`,
      party: s.customerName || 'Walk-in', amountPaise: s.totalPaise, mode: s.paymentMode, status: s.status,
    })),
    ...data.purchases.filter((p) => p.status === 'completed').map((p) => ({
      id: p.id, kind: 'purchase', date: p.date, label: `Purchase ${p.invoiceNo}`,
      party: p.supplierName || '—', amountPaise: -p.totalPaise, mode: p.paymentStatus, status: p.status,
    })),
    ...data.expenses.filter((e) => e.status !== 'void').map((e) => ({
      id: e.id, kind: 'expense', date: e.date, label: `Expense · ${e.category}`,
      party: e.note || '', amountPaise: -e.amountPaise, mode: '—', status: e.status,
    })),
  ];
  return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

/** Customers who owe money, largest first. */
export function customerDuesReport(data) {
  return data.customers
    .map((c) => ({ ...c, outstandingPaise: outstandingFor(data, c.id) }))
    .filter((c) => c.outstandingPaise !== 0)
    .sort((a, b) => b.outstandingPaise - a.outstandingPaise);
}

/** Suppliers we still owe, largest first. */
export function supplierPayableReport(data) {
  return data.suppliers
    .map((s) => ({ ...s, payablePaise: payableFor(data, s.id) }))
    .filter((s) => s.payablePaise !== 0)
    .sort((a, b) => b.payablePaise - a.payablePaise);
}

/** Sale lines in a period, joined with their bill — the sales register. */
export function salesRegister(data, range) {
  const byId = new Map(data.sales.map((s) => [s.id, s]));
  const rows = [];
  for (const line of data.sale_items) {
    const sale = byId.get(line.saleId);
    if (!sale || !isLiveSale(sale) || !inRange(sale.date, range)) continue;
    rows.push({
      date: sale.date, billNo: sale.billNo, customer: sale.customerName || 'Walk-in',
      product: line.productName, qtyLabel: fmtQty(netQtyMilli(line)), unit: line.unit,
      pricePaise: line.pricePaise, revenuePaise: netRevenuePaise(line), costPaise: netCostPaise(line),
      profitPaise: netRevenuePaise(line) - netCostPaise(line), mode: sale.paymentMode, status: sale.status,
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
