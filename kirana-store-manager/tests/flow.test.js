/**
 * The mandatory end-to-end flow from the spec:
 *
 *   Product Add → Purchase → Stock Increase → Sale → Stock Decrease
 *   → Customer Credit → Payment Received → Ledger Update → Return
 *   → Stock Restore → Expense → Profit Report → Backup → Delete Test
 *   Data → Restore Backup
 *
 * Runs against the in-memory adapter, exercising the exact same business
 * logic the browser runs against IndexedDB.
 *
 *   node --test tests/
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryAdapter, ValidationError } from '../js/core/db.js';
import { createStore } from '../js/core/store.js';
import * as reports from '../js/core/reports.js';
import { allCSVs, productsCSV, salesCSV, expensesCSV } from '../js/core/backup.js';
import { fmtPaise, fmtQty, lineTotalPaise, toMilli, toPaise } from '../js/core/money.js';

/** Fresh store + the products the whole flow depends on. */
async function setup() {
  const store = createStore(createMemoryAdapter());
  await store.ensureSeed();

  const rice = await store.saveProduct({
    name: 'Basmati Rice', category: 'Grocery', brand: 'India Gate', sku: '8901234500011',
    purchasePrice: '80', sellingPrice: '100', mrp: '110', unit: 'kg', minStock: '5',
  });
  const oil = await store.saveProduct({
    name: 'Sunflower Oil 1L', category: 'Grocery', sku: '8901234500028',
    purchasePrice: '140', sellingPrice: '170', mrp: '180', unit: 'litre', minStock: '3',
  });
  const customer = await store.saveCustomer({ name: 'Ramesh Kumar', mobile: '9876543210', address: 'Shop No 4' });
  const supplier = await store.saveSupplier({ name: 'Sharma Wholesale', mobile: '9000000001' });
  return { store, rice, oil, customer, supplier };
}

/* ------------------------------------------------------------------- money */

test('money: paise arithmetic never drifts', () => {
  assert.equal(toPaise('0.1') + toPaise('0.2'), 30);          // the classic 0.30000000000000004
  assert.equal(toPaise('12.50'), 1250);
  assert.equal(toPaise('₹1,250.50'), 125050);
  assert.equal(toPaise('-3.25'), -325);
  assert.equal(toPaise(19.99), 1999);
  assert.equal(lineTotalPaise(toMilli('1.5'), toPaise('33.33')), 5000);  // 1.5 × 33.33 = 49.995 → 50.00
  assert.equal(lineTotalPaise(toMilli('0.25'), toPaise('9')), 225);
  assert.equal(fmtPaise(123456789), '₹12,34,567.89');        // Indian grouping
  assert.equal(fmtPaise(-5050), '-₹50.50');
  assert.equal(fmtQty(1500), '1.5');
  assert.equal(fmtQty(2000), '2');
  assert.equal(fmtQty(250), '0.25');
});

test('money: rejects nonsense input instead of storing NaN', () => {
  assert.throws(() => toPaise('abc'), /Invalid amount/);
  assert.throws(() => toPaise(Infinity), /Invalid amount/);
  assert.throws(() => toMilli('-2'), /negative/);
  assert.throws(() => toMilli('2kg'), /Invalid quantity/);
});

/* ------------------------------------------------------- products & stock */

test('product add: validates, dedupes SKU, records opening stock', async () => {
  const { store, rice } = await setup();

  assert.equal(rice.stockQtyMilli, 0);
  assert.equal((await store.stockHistory(rice.id)).length, 0);

  await assert.rejects(
    () => store.saveProduct({ name: '', sellingPrice: '10' }),
    (e) => e instanceof ValidationError && e.field === 'name',
  );
  await assert.rejects(
    () => store.saveProduct({ name: 'No Price' }),
    (e) => e.field === 'sellingPrice',
  );
  await assert.rejects(
    () => store.saveProduct({ name: 'Dup', sellingPrice: '10', sku: '8901234500011' }),
    (e) => e.field === 'sku',
  );
  await assert.rejects(
    () => store.saveProduct({ name: 'Bad Unit', sellingPrice: '10', unit: 'bottle' }),
    (e) => e.field === 'unit',
  );

  // Opening stock becomes a movement, so history explains the quantity.
  const withOpening = await store.saveProduct({ name: 'Sugar', sellingPrice: '45', unit: 'kg', stockQty: '10' });
  assert.equal(withOpening.stockQtyMilli, 10000);
  const history = await store.stockHistory(withOpening.id);
  assert.equal(history.length, 1);
  assert.equal(history[0].type, 'opening');
  assert.equal(history[0].qtyMilli, 10000);
});

test('purchase: increases stock and moves the cost price', async () => {
  const { store, rice, supplier } = await setup();

  const { purchase } = await store.createPurchase({
    supplierId: supplier.id,
    items: [{ productId: rice.id, qty: '20', rate: '82' }],
    amountPaid: '0',
  });

  const after = await store.getProduct(rice.id);
  assert.equal(after.stockQtyMilli, 20000, 'stock must go up by the purchased quantity');
  assert.equal(after.purchasePrice, 8200, 'cost price follows the latest purchase');
  assert.equal(purchase.totalPaise, 164000);
  assert.equal(purchase.paymentStatus, 'unpaid');

  const movements = await store.stockHistory(rice.id);
  assert.equal(movements.at(-1).type, 'purchase');
  assert.equal(movements.at(-1).qtyMilli, 20000);
});

/* ------------------------------------------------------------------- sales */

test('sale: reduces stock, freezes cost, writes a bill number', async () => {
  const { store, rice, supplier } = await setup();
  await store.createPurchase({ supplierId: supplier.id, items: [{ productId: rice.id, qty: '20', rate: '82' }] });

  const { sale } = await store.createSale({
    paymentMode: 'cash',
    items: [{ productId: rice.id, qty: '2.5' }],
  });

  assert.equal((await store.getProduct(rice.id)).stockQtyMilli, 17500, '20 - 2.5 = 17.5 kg');
  assert.equal(sale.totalPaise, 25000, '2.5 kg × ₹100');
  assert.equal(sale.billNo, 'KSM-00001');
  assert.equal(sale.status, 'completed');
  assert.equal(sale.items.length, 1);

  const detail = await store.getSale(sale.id);
  assert.equal(detail.lines[0].costPaise, 8200, 'cost is frozen at sale time');
  assert.deepEqual(await store.verifyStockIntegrity(), []);
});

test('sale: refuses to sell more than stock unless the owner allows it', async () => {
  const { store, rice, supplier } = await setup();
  await store.createPurchase({ supplierId: supplier.id, items: [{ productId: rice.id, qty: '3', rate: '80' }] });

  await assert.rejects(
    () => store.createSale({ paymentMode: 'cash', items: [{ productId: rice.id, qty: '5' }] }),
    (e) => e instanceof ValidationError && /Only 3 kg/.test(e.message),
  );
  // Two lines of the same product must be added together before the check.
  await assert.rejects(
    () => store.createSale({
      paymentMode: 'cash',
      items: [{ productId: rice.id, qty: '2' }, { productId: rice.id, qty: '2' }],
    }),
    /Only 1 kg/,
  );
  assert.equal((await store.getProduct(rice.id)).stockQtyMilli, 3000, 'a rejected sale must not touch stock');

  await store.saveSettings({ allowNegativeStock: true });
  const { sale } = await store.createSale({ paymentMode: 'cash', items: [{ productId: rice.id, qty: '5' }] });
  assert.equal(sale.totalPaise, 50000);
  assert.equal((await store.getProduct(rice.id)).stockQtyMilli, -2000);
});

test('sale: rejects invalid lines', async () => {
  const { store, rice, supplier, customer } = await setup();
  await store.createPurchase({ supplierId: supplier.id, items: [{ productId: rice.id, qty: '10', rate: '80' }] });

  await assert.rejects(() => store.createSale({ paymentMode: 'cash', items: [] }), /at least one product/);
  await assert.rejects(
    () => store.createSale({ paymentMode: 'cash', items: [{ productId: rice.id, qty: '0' }] }),
    /greater than 0/,
  );
  await assert.rejects(
    () => store.createSale({ paymentMode: 'credit', items: [{ productId: rice.id, qty: '1' }] }),
    /Select a customer/,
  );
  await assert.rejects(
    () => store.createSale({ paymentMode: 'cash', items: [{ productId: rice.id, qty: '1', discount: '500' }] }),
    /cannot exceed the line total/,
  );
  await assert.rejects(
    () => store.createSale({ paymentMode: 'cash', items: [{ productId: rice.id, qty: '1' }], amountPaid: '50' }),
    /paid in full/,
  );
});

/* ------------------------------------------------------- udhaar + ledger */

test('credit sale → payment received → ledger and outstanding update', async () => {
  const { store, rice, supplier, customer } = await setup();
  await store.createPurchase({ supplierId: supplier.id, items: [{ productId: rice.id, qty: '20', rate: '80' }] });

  const { sale } = await store.createSale({
    paymentMode: 'credit', customerId: customer.id,
    items: [{ productId: rice.id, qty: '4' }],
  });
  assert.equal(sale.amountPaidPaise, 0);

  let summary = await store.customerSummary(customer.id);
  assert.equal(summary.outstandingPaise, 40000, '₹400 on udhaar');

  await store.recordPayment({ partyType: 'customer', partyId: customer.id, amount: '150', mode: 'cash' });
  summary = await store.customerSummary(customer.id);
  assert.equal(summary.outstandingPaise, 25000);

  // Over-payment is refused — that is how ledgers get corrupted.
  await assert.rejects(
    () => store.recordPayment({ partyType: 'customer', partyId: customer.id, amount: '9999' }),
    /Outstanding is only/,
  );

  const ledger = await store.customerLedger(customer.id);
  assert.equal(ledger.length, 2);
  assert.equal(ledger[0].type, 'sale');
  assert.equal(ledger[0].balancePaise, 40000);
  assert.equal(ledger[1].type, 'payment');
  assert.equal(ledger[1].balancePaise, 25000, 'running balance');

  // A void payment must not silently change the balance.
  const pay = ledger[1];
  await store.voidPayment(pay.id, 'wrong entry');
  assert.equal((await store.customerSummary(customer.id)).outstandingPaise, 40000);
});

/* ---------------------------------------------------------------- returns */

test('return: restores stock, refunds, and shrinks the udhaar', async () => {
  const { store, rice, supplier, customer } = await setup();
  await store.createPurchase({ supplierId: supplier.id, items: [{ productId: rice.id, qty: '20', rate: '80' }] });
  const { sale } = await store.createSale({
    paymentMode: 'credit', customerId: customer.id, items: [{ productId: rice.id, qty: '4' }],
  });
  assert.equal((await store.getProduct(rice.id)).stockQtyMilli, 16000);
  assert.equal((await store.customerSummary(customer.id)).outstandingPaise, 40000);

  // Partial return of 1 kg.
  const line = (await store.getSale(sale.id)).lines[0];
  await store.returnSale(sale.id, { items: [{ saleItemId: line.id, qty: '1' }] });

  assert.equal((await store.getProduct(rice.id)).stockQtyMilli, 17000, '1 kg back on the shelf');
  assert.equal((await store.customerSummary(customer.id)).outstandingPaise, 30000, '₹100 credited back');
  assert.equal((await store.getSale(sale.id)).status, 'completed', 'still an open bill');

  // Cannot return more than what is left on the line.
  await assert.rejects(
    () => store.returnSale(sale.id, { items: [{ saleItemId: line.id, qty: '5' }] }),
    /can still be returned/,
  );

  // Return the rest → bill closes.
  await store.returnSale(sale.id, { items: [{ saleItemId: line.id, qty: '3' }] });
  assert.equal((await store.getProduct(rice.id)).stockQtyMilli, 20000, 'all 4 kg back');
  assert.equal((await store.customerSummary(customer.id)).outstandingPaise, 0);
  assert.equal((await store.getSale(sale.id)).status, 'returned');
  await assert.rejects(() => store.returnSale(sale.id), /cannot be returned/);
});

test('void sale: full stock reversal and excluded from every report', async () => {
  const { store, rice, supplier, customer } = await setup();
  await store.createPurchase({ supplierId: supplier.id, items: [{ productId: rice.id, qty: '10', rate: '80' }] });
  const { sale } = await store.createSale({
    paymentMode: 'credit', customerId: customer.id, items: [{ productId: rice.id, qty: '3' }],
  });

  await store.voidSale(sale.id, 'wrong bill');
  assert.equal((await store.getProduct(rice.id)).stockQtyMilli, 10000);
  assert.equal((await store.customerSummary(customer.id)).outstandingPaise, 0);

  const data = await store._raw();
  const today = reports.dateRange('today');
  const s = reports.summarise(data, today);
  assert.equal(s.revenuePaise, 0, 'a void sale earns nothing');
  assert.equal(s.salesCount, 0);
  assert.equal(s.voidCount, 1);

  // The record is kept, not erased, so the bill sequence stays honest.
  assert.ok(data.sales.find((x) => x.id === sale.id));
  assert.equal(data.sales.find((x) => x.id === sale.id).status, 'void');
  await assert.rejects(() => store.voidSale(sale.id), /cannot be cancelled/);
});

/* -------------------------------------------------------------- expenses */

test('expenses hit net profit but not gross profit', async () => {
  const { store, rice, supplier } = await setup();
  await store.createPurchase({ supplierId: supplier.id, items: [{ productId: rice.id, qty: '10', rate: '80' }] });
  await store.createSale({ paymentMode: 'cash', items: [{ productId: rice.id, qty: '5' }] });

  const data0 = await store._raw();
  const range = reports.dateRange('today');
  const before = reports.summarise(data0, range);
  assert.equal(before.revenuePaise, 50000);
  assert.equal(before.cogsPaise, 40000, '5 kg × ₹80 cost');
  assert.equal(before.grossProfitPaise, 10000);
  assert.equal(before.netProfitPaise, 10000);

  await store.saveExpense({ category: 'electricity', amount: '250', note: 'September bill' });
  await store.saveExpense({ category: 'rent', amount: '1000' });
  await assert.rejects(() => store.saveExpense({ category: 'electricity', amount: '0' }), /greater than 0/);
  await assert.rejects(() => store.saveExpense({ category: 'bribe', amount: '10' }), /Category must be/);

  const after = reports.summarise(await store._raw(), range);
  assert.equal(after.grossProfitPaise, 10000, 'gross profit is untouched by expenses');
  assert.equal(after.expenseTotalPaise, 125000);
  assert.equal(after.netProfitPaise, -115000, 'net = gross − expenses');
  assert.deepEqual(after.expensesByCategory, { electricity: 25000, rent: 100000 });

  // Voiding an expense puts the profit back.
  const exp = (await store.listExpenses()).find((e) => e.category === 'rent');
  await store.voidExpense(exp.id);
  const repaired = reports.summarise(await store._raw(), range);
  assert.equal(repaired.expenseTotalPaise, 25000);
  assert.equal(repaired.netProfitPaise, -15000);
  assert.equal((await store.listExpenses()).length, 1, 'void rows are hidden from the list');
});

/* ------------------------------------------------- purchases & suppliers */

test('purchase payment and supplier payable stay consistent', async () => {
  const { store, rice, supplier } = await setup();
  await store.createPurchase({
    supplierId: supplier.id, items: [{ productId: rice.id, qty: '10', rate: '80' }], amountPaid: '300',
  });
  let s = await store.supplierSummary(supplier.id);
  assert.equal(s.billedPaise, 80000);
  assert.equal(s.paidPaise, 30000);
  assert.equal(s.payablePaise, 50000);

  await store.recordPayment({ partyType: 'supplier', partyId: supplier.id, amount: '500' });
  s = await store.supplierSummary(supplier.id);
  assert.equal(s.payablePaise, 0);

  // Returning UNPAID stock simply cancels that debt — it does not create a credit.
  await store.createPurchase({ supplierId: supplier.id, items: [{ productId: rice.id, qty: '4', rate: '80' }] });
  const unpaid = (await store.listPurchases()).find((p) => p.totalPaise === 32000);
  await store.returnPurchase(unpaid.id, { reason: 'damaged packets' });
  assert.equal((await store.getProduct(rice.id)).stockQtyMilli, 10000, '10 + 4 − 4');
  s = await store.supplierSummary(supplier.id);
  assert.equal(s.payablePaise, 0, 'returned goods were never paid for, so nothing is owed either way');

  // Returning stock we ALREADY paid for puts us in credit with the supplier.
  const { purchase: paidPurchase } = await store.createPurchase({
    supplierId: supplier.id, items: [{ productId: rice.id, qty: '2', rate: '80' }], amountPaid: '160',
  });
  await store.returnPurchase(paidPurchase.id);
  s = await store.supplierSummary(supplier.id);
  assert.equal(s.payablePaise, -16000, '₹160 paid for goods we sent back');

  // Cannot return stock we have already sold.
  const { purchase: big } = await store.createPurchase({
    supplierId: supplier.id, items: [{ productId: rice.id, qty: '3', rate: '80' }],
  });
  await store.createSale({ paymentMode: 'cash', items: [{ productId: rice.id, qty: '12' }] });
  assert.equal((await store.getProduct(rice.id)).stockQtyMilli, 1000, '1 kg left on the shelf');
  await assert.rejects(() => store.returnPurchase(big.id), /only 1 kg left in stock/);
  assert.equal((await store.getProduct(rice.id)).stockQtyMilli, 1000, 'a rejected return must not touch stock');
});

/* ---------------------------------------------------------------- reports */

test('reports: top products, stock alerts, collections by mode', async () => {
  const { store, rice, oil, supplier, customer } = await setup();
  await store.createPurchase({
    supplierId: supplier.id,
    items: [{ productId: rice.id, qty: '20', rate: '80' }, { productId: oil.id, qty: '10', rate: '140' }],
  });
  await store.createSale({ paymentMode: 'cash', items: [{ productId: rice.id, qty: '5' }] });
  await store.createSale({ paymentMode: 'upi', items: [{ productId: oil.id, qty: '2' }] });
  await store.createSale({ paymentMode: 'credit', customerId: customer.id, items: [{ productId: rice.id, qty: '1' }] });

  const data = await store._raw();
  const range = reports.dateRange('today');
  const s = reports.summarise(data, range);

  assert.equal(s.salesCount, 3);
  assert.equal(s.revenuePaise, 50000 + 34000 + 10000);
  assert.equal(s.cogsPaise, 5 * 8000 + 2 * 14000 + 1 * 8000);
  assert.equal(s.grossProfitPaise, s.revenuePaise - s.cogsPaise);
  assert.equal(s.cashPaise, 50000);
  assert.equal(s.upiPaise, 34000);
  assert.equal(s.creditPaise, 10000);
  assert.equal(s.totalCustomerDuesPaise, 10000);

  const top = reports.topProducts(data, range);
  assert.equal(top[0].name, 'Basmati Rice');
  assert.equal(top[0].qtyLabel, '6');
  assert.equal(top[0].revenuePaise, 60000);

  const alerts = reports.stockAlerts(data);
  assert.deepEqual(alerts.low, [], 'rice 14/20 and oil 8/10 are both above their minimum');
  assert.deepEqual(alerts.out, [], 'nothing at zero yet');

  // Selling the rice down to exactly zero moves it into "out of stock".
  await store.createSale({ paymentMode: 'cash', items: [{ productId: rice.id, qty: '14' }] });
  const alerts2 = reports.stockAlerts(await store._raw());
  assert.deepEqual(alerts2.low, []);
  assert.deepEqual(alerts2.out.map((p) => p.name), ['Basmati Rice']);
});

test('reports: date ranges actually filter', async () => {
  const { store, rice, supplier } = await setup();
  await store.createPurchase({ supplierId: supplier.id, items: [{ productId: rice.id, qty: '20', rate: '80' }] });

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  await store.createSale({ paymentMode: 'cash', date: yesterday.toISOString(), items: [{ productId: rice.id, qty: '2' }] });
  await store.createSale({ paymentMode: 'cash', items: [{ productId: rice.id, qty: '3' }] });

  const data = await store._raw();
  assert.equal(reports.summarise(data, reports.dateRange('today')).revenuePaise, 30000);
  // 'yesterday' is already relative to today — no need to pass a reference date.
  assert.equal(reports.summarise(data, reports.dateRange('yesterday')).revenuePaise, 20000);
  assert.equal(reports.summarise(data, reports.dateRange('week')).revenuePaise, 50000);
  assert.throws(() => reports.dateRange('custom', { from: '2026-01-05', to: '2026-01-01' }), /after the to date/);
});

/* ------------------------------------------- backup, reset and restore */

test('backup → reset → restore round-trips every record', async () => {
  const { store, rice, supplier, customer } = await setup();
  await store.createPurchase({ supplierId: supplier.id, items: [{ productId: rice.id, qty: '20', rate: '80' }], amountPaid: '500' });
  const { sale } = await store.createSale({
    paymentMode: 'credit', customerId: customer.id, items: [{ productId: rice.id, qty: '4' }],
  });
  await store.recordPayment({ partyType: 'customer', partyId: customer.id, amount: '100' });
  await store.saveExpense({ category: 'rent', amount: '800' });
  await store.saveSettings({ shopName: 'Gupta Kirana Bhandar', invoicePrefix: 'GKB', currencySymbol: '₹' });

  const backup = await store.exportAll();
  const json = JSON.stringify(backup);
  assert.equal(backup.app, 'kirana-store-manager');
  assert.ok(backup.data.products.length >= 2);
  assert.ok(backup.data.stock_movements.length >= 2);

  const duesBefore = (await store.customerSummary(customer.id)).outstandingPaise;
  const stockBefore = (await store.getProduct(rice.id)).stockQtyMilli;
  const billNoBefore = sale.billNo;

  // Delete the test data.
  await store.resetAll();
  assert.equal((await store.listProducts()).length, 0);
  assert.equal((await store.listSales()).length, 0);
  assert.equal((await store.getSettings()).shopName, 'My Kirana Store', 'settings back to default');
  assert.ok((await store._raw()).categories.length > 0, 'seed categories come back');

  // Restore from the JSON string, as if read back off disk.
  await store.importAll(JSON.parse(json));
  assert.equal((await store.listProducts()).length >= 2, true);
  assert.equal((await store.getProduct(rice.id)).stockQtyMilli, stockBefore);
  assert.equal((await store.customerSummary(customer.id)).outstandingPaise, duesBefore);
  assert.equal((await store.listSales())[0].billNo, billNoBefore);
  assert.equal((await store.getSettings()).shopName, 'Gupta Kirana Bhandar');
  assert.equal((await store.getSettings()).invoicePrefix, 'GKB');
  assert.equal((await store.listExpenses()).length, 1);
  assert.deepEqual(await store.verifyStockIntegrity(), [], 'stock still reconciles after restore');

  // Bill numbering must continue where it stopped, not restart at 1.
  const { sale: next } = await store.createSale({ paymentMode: 'cash', items: [{ productId: rice.id, qty: '1' }] });
  assert.notEqual(next.billNo, billNoBefore);

  await assert.rejects(() => store.importAll({ nope: true }), /not a Kirana Store Manager backup/);
  await assert.rejects(() => store.importAll({ app: 'something-else', data: {} }), /different app/);
});

test('CSV exports contain the real rows', async () => {
  const { store, rice, supplier, customer } = await setup();
  await store.createPurchase({ supplierId: supplier.id, items: [{ productId: rice.id, qty: '10', rate: '80' }] });
  await store.createSale({ paymentMode: 'credit', customerId: customer.id, items: [{ productId: rice.id, qty: '2' }] });
  await store.saveExpense({ category: 'transport', amount: '60' });

  const csvs = await allCSVs(store);
  assert.match(csvs.products, /Basmati Rice/);
  assert.match(csvs.products, /^id,name,category/);
  assert.match(csvs.sales, /KSM-00001/);
  assert.match(csvs.purchases, /Sharma Wholesale/);
  assert.match(csvs.customers, /Ramesh Kumar/);
  assert.match(csvs.customers, /200\.00/, 'outstanding appears in the customer CSV');
  assert.match(csvs.expenses, /transport/);
  assert.match(csvs.suppliers, /Sharma Wholesale/);

  // Commas and quotes inside a note must not break the columns.
  const csv = productsCSV([{ id: 'x', name: 'A, "fancy" item', category: '', brand: '', sku: '', unit: 'piece', purchasePrice: 0, sellingPrice: 0, mrp: 0, stockQtyMilli: 0, minStockQtyMilli: 0, supplierId: null, expiryDate: null, notes: '' }]);
  assert.match(csv, /"A, ""fancy"" item"/);
});

test('sale history and stock reconcile after the whole flow', async () => {
  const { store, rice, oil, supplier, customer } = await setup();
  await store.createPurchase({
    supplierId: supplier.id,
    items: [{ productId: rice.id, qty: '20', rate: '80' }, { productId: oil.id, qty: '6', rate: '140' }],
  });
  const a = await store.createSale({ paymentMode: 'cash', items: [{ productId: rice.id, qty: '3' }] });
  await store.createSale({ paymentMode: 'upi', items: [{ productId: oil.id, qty: '2' }] });
  const c = await store.createSale({
    paymentMode: 'credit', customerId: customer.id,
    items: [{ productId: rice.id, qty: '2' }, { productId: oil.id, qty: '1' }],
  });
  await store.returnSale(c.sale.id, { items: [{ saleItemId: (await store.getSale(c.sale.id)).lines[1].id, qty: '1' }] });
  await store.voidSale(a.sale.id, 'test');
  await store.recordPayment({ partyType: 'customer', partyId: customer.id, amount: '50' });

  assert.equal((await store.getProduct(rice.id)).stockQtyMilli, 18000, '20 − 3 (voided, came back) − 2 = 18 kg');
  assert.equal((await store.getProduct(oil.id)).stockQtyMilli, 4000, '6 − 2 − 1 + 1 returned');
  assert.deepEqual(await store.verifyStockIntegrity(), [], 'stored stock === sum of movements');

  const summary = await store.customerSummary(customer.id);
  assert.equal(summary.outstandingPaise, 20000 + 17000 - 17000 - 5000);

  // A product with history cannot be deleted.
  await assert.rejects(() => store.deleteProduct(rice.id), /cannot be deleted/);
  const scratch = await store.saveProduct({ name: 'Scratch Item', sellingPrice: '10' });
  await store.deleteProduct(scratch.id);
  assert.equal(await store.getProduct(scratch.id), undefined);
});

test('barcode/SKU lookup works without a camera', async () => {
  const { store, rice } = await setup();
  assert.equal((await store.findBySku('8901234500011')).id, rice.id);
  assert.equal((await store.findBySku(' 8901234500011 ')).id, rice.id, 'scanners add whitespace');
  assert.equal(await store.findBySku('0000000000000'), undefined);
  assert.equal(await store.findBySku(''), undefined);
});

test('PIN lock settings never store the PIN itself', async () => {
  const { store } = await setup();
  await store.saveSettings({ pinHash: 'a1b2c3', pinSalt: 's4lt' });
  const s = await store.getSettings();
  assert.equal(s.pinHash, 'a1b2c3');
  assert.equal(s.pinSalt, 's4lt');
  assert.equal('pin' in s, false, 'no plaintext pin field exists on the settings record');
});

/* ---------------------------------------------------------- full returns */

test('regression: a FULL return (no item list) restores every unit', async () => {
  // The default path used to re-convert quantities that were already in
  // milli-units, so "return the whole bill" failed with a bogus stock error.
  const { store, rice, oil, supplier, customer } = await setup();
  await store.createPurchase({
    supplierId: supplier.id,
    items: [{ productId: rice.id, qty: '10', rate: '80' }, { productId: oil.id, qty: '5', rate: '140' }],
  });
  const { sale } = await store.createSale({
    paymentMode: 'credit', customerId: customer.id,
    items: [{ productId: rice.id, qty: '4' }, { productId: oil.id, qty: '2' }],
  });
  assert.equal((await store.getProduct(rice.id)).stockQtyMilli, 6000);
  assert.equal((await store.customerSummary(customer.id)).outstandingPaise, 74000);

  const record = await store.returnSale(sale.id);              // <-- no items passed

  assert.equal((await store.getProduct(rice.id)).stockQtyMilli, 10000, 'all rice back');
  assert.equal((await store.getProduct(oil.id)).stockQtyMilli, 5000, 'all oil back');
  assert.equal((await store.customerSummary(customer.id)).outstandingPaise, 0, 'udhaar cleared');
  assert.equal(record.refundPaise, 74000);
  assert.equal((await store.getSale(sale.id)).status, 'returned');
  assert.deepEqual(await store.verifyStockIntegrity(), []);
});

test('regression: a FULL purchase return (no item list) gives the stock back', async () => {
  const { store, rice, supplier } = await setup();
  const { purchase } = await store.createPurchase({
    supplierId: supplier.id, items: [{ productId: rice.id, qty: '4', rate: '80' }],
  });
  assert.equal((await store.getProduct(rice.id)).stockQtyMilli, 4000);

  const record = await store.returnPurchase(purchase.id);      // <-- no items passed

  assert.equal((await store.getProduct(rice.id)).stockQtyMilli, 0);
  assert.equal(record.refundPaise, 32000);
  assert.equal(
    (await store.supplierSummary(supplier.id)).payablePaise,
    0,
    'the purchase was unpaid, so returning it cancels the debt instead of creating a credit',
  );
  assert.deepEqual(await store.verifyStockIntegrity(), []);

  // Returning it a second time must be refused, not silently allowed.
  await assert.rejects(() => store.returnPurchase(purchase.id), /Only 0 kg can be returned/);

  // Same flow, but paid up front — now the return really is a supplier credit.
  const { purchase: paid } = await store.createPurchase({
    supplierId: supplier.id, items: [{ productId: rice.id, qty: '4', rate: '80' }], amountPaid: '320',
  });
  await store.returnPurchase(paid.id);
  assert.equal((await store.supplierSummary(supplier.id)).payablePaise, -32000, '₹320 paid for goods sent back');
});

/* ---------------------------------------------------------- sample data */

test('sample data loads through the public API and reconciles', async () => {
  const store = createStore(createMemoryAdapter());
  await store.ensureSeed();
  const { loadSampleData } = await import('../js/core/sample-data.js');

  const counts = await loadSampleData(store);
  assert.equal(counts.products, 8);
  assert.equal(counts.customers, 3);
  assert.equal(counts.suppliers, 2);

  assert.equal((await store.listProducts()).length, 8);
  assert.equal((await store.listSales()).length, 5);
  assert.equal((await store.listPurchases()).length, 2);
  assert.equal((await store.listExpenses()).length, 3);

  // Every product has stock, and stock still equals the sum of its movements.
  for (const p of await store.listProducts()) {
    assert.ok(p.stockQtyMilli > 0, `${p.name} should be in stock`);
  }
  assert.deepEqual(await store.verifyStockIntegrity(), []);

  // Udhaar and the profit report both produce sane, non-zero numbers.
  const dues = reports.customerDuesReport(await store._raw());
  assert.ok(dues.length >= 1, 'sample data leaves at least one customer with udhaar');
  const s = reports.summarise(await store._raw(), reports.dateRange('week'));
  assert.ok(s.revenuePaise > 0);
  assert.ok(s.grossProfitPaise > 0, 'selling prices are above cost in the sample data');
  assert.equal(s.expenseTotalPaise, 145000 + 1200000 + 60000);

  // Barcode lookup works on the seeded SKUs — the scanner path.
  assert.equal((await store.findBySku('8901234500011')).name, 'Basmati Rice');
});
