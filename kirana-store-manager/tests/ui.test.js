/**
 * UI smoke tests.
 *
 * These boot the REAL screen modules inside jsdom against the REAL store
 * (memory adapter) and drive them the way a finger would: type in the search
 * box, tap a product, tap "Complete sale", then check the database actually
 * changed. A green suite here means the buttons are wired, not just drawn.
 *
 *   node --test tests/
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Let queued microtasks/timers from async renderers settle. */
const flush = (times = 12) => new Promise((resolve) => {
  let n = 0;
  const step = () => {
    n += 1;
    if (n >= times) return resolve();
    return setTimeout(step, 0);
  };
  step();
});

async function setupDom() {
  const dom = new JSDOM(readFileSync(join(ROOT, 'index.html'), 'utf8'), {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  // jsdom does not implement these; the app only needs them to not explode.
  window.scrollTo = () => {};
  window.print = () => {};
  window.URL.createObjectURL = () => 'blob:mock';
  window.URL.revokeObjectURL = () => {};

  // Node 22 exposes some of these as getter-only globals (navigator, crypto),
  // so they have to be redefined rather than assigned.
  for (const key of ['window', 'document', 'Node', 'HTMLElement', 'CustomEvent', 'Event', 'Blob', 'FileReader', 'navigator', 'location', 'history', 'getComputedStyle', 'requestAnimationFrame', 'crypto']) {
    if (window[key] === undefined) continue;
    Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
  }
  return { window, document: window.document };
}

/** A store pre-loaded with the stock the UI tests sell from. */
async function seededStore() {
  const { createMemoryAdapter } = await import('../js/core/db.js');
  const { createStore } = await import('../js/core/store.js');
  const store = createStore(createMemoryAdapter());
  const settings = await store.ensureSeed();
  const supplier = await store.saveSupplier({ name: 'Sharma Wholesale' });
  const rice = await store.saveProduct({ name: 'Basmati Rice', category: 'Grocery', sku: '8901234500011', purchasePrice: '80', sellingPrice: '100', mrp: '110', unit: 'kg', minStock: '5' });
  const oil = await store.saveProduct({ name: 'Sunflower Oil 1L', category: 'Grocery', sku: '8901234500028', purchasePrice: '140', sellingPrice: '170', unit: 'litre', minStock: '3' });
  await store.createPurchase({ supplierId: supplier.id, items: [{ productId: rice.id, qty: '20', rate: '80' }, { productId: oil.id, qty: '8', rate: '140' }] });
  const customer = await store.saveCustomer({ name: 'Ramesh Kumar', mobile: '9876543210' });
  return { store, settings, rice, oil, customer, supplier };
}

function makeCtx(store, settings) {
  const visits = [];
  return {
    store,
    settings,
    state: {},
    navigate: (hash) => visits.push(hash),
    refresh: () => {},
    visits,
  };
}

const text = (node) => node.textContent;

/* ------------------------------------------------------------------- shell */

test('index.html declares the shell the router depends on', async () => {
  const { document } = await setupDom();
  for (const id of ['boot', 'shell', 'netbar', 'backBtn', 'langBtn', 'view', 'bottomnav', 'screenTitle', 'shopLine']) {
    assert.ok(document.getElementById(id), `missing #${id}`);
  }
  assert.ok(document.querySelector('#bottomnav a[href="#/sale/new"]'), 'the + Sale action must exist');
  assert.equal(document.querySelectorAll('#bottomnav a').length, 5, 'Dashboard · Sales · + · Products · More');
  assert.equal(document.querySelector('link[rel="manifest"]').getAttribute('href'), 'manifest.webmanifest');
  assert.match(document.querySelector('script[type="module"]').getAttribute('src'), /js\/ui\/app\.js/);
  // Light theme is the default: no dark-mode class or prefers-color-scheme override.
  const css = readFileSync(join(ROOT, 'assets/styles.css'), 'utf8');
  assert.doesNotMatch(css, /prefers-color-scheme:\s*dark/);
  assert.match(css, /--bg:\s*#f4f6fb/, 'default background is light');
});

/* -------------------------------------------------------------- dashboard */

test('dashboard renders totals, stock alerts and recent bills', async () => {
  const { document } = await setupDom();
  const { store, settings, rice } = await seededStore();
  const { render } = await import('../js/ui/screens/dashboard.js');
  const ctx = makeCtx(store, settings);
  const root = document.getElementById('view');

  await store.createSale({ paymentMode: 'cash', items: [{ productId: rice.id, qty: '3' }] });
  await render(root, ctx);
  await flush();

  const out = text(root);
  assert.match(out, /Today's sales|आज की बिक्री/);
  assert.match(out, /₹300\.00/, 'the ₹300 sale is on the dashboard');
  assert.match(out, /Gross profit/);
  assert.match(out, /Basmati Rice/, 'top product appears');
  assert.match(out, /Bill KSM-00001/, 'recent transaction appears');
  assert.ok(root.querySelectorAll('.tile').length >= 8, 'the stat tiles rendered');
});

test('dashboard range chips actually change the numbers', async () => {
  const { document } = await setupDom();
  const { store, settings, rice } = await seededStore();
  const { render } = await import('../js/ui/screens/dashboard.js');
  const ctx = makeCtx(store, settings);
  const root = document.getElementById('view');

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  await store.createSale({ paymentMode: 'cash', date: yesterday.toISOString(), items: [{ productId: rice.id, qty: '2' }] });
  await store.createSale({ paymentMode: 'cash', items: [{ productId: rice.id, qty: '5' }] });

  await render(root, ctx);
  await flush();
  assert.match(text(root), /₹500\.00/, 'today shows only today’s bill');

  const chips = [...root.querySelectorAll('.chip')];
  const yesterdayChip = chips.find((c) => /Yesterday|कल/.test(c.textContent));
  yesterdayChip.click();
  await flush();
  assert.match(text(root), /₹200\.00/, 'yesterday shows yesterday’s bill');
  assert.equal(ctx.state.range, 'yesterday');
});

/* ---------------------------------------------------------------- products */

test('products: search filters the list and the editor saves a new item', async () => {
  const { document } = await setupDom();
  const { store, settings } = await seededStore();
  const products = await import('../js/ui/screens/products.js');
  const ctx = makeCtx(store, settings);
  const root = document.getElementById('view');

  await products.render(root, ctx);
  await flush();
  assert.match(text(root), /Basmati Rice/);
  assert.match(text(root), /Sunflower Oil/);

  const search = root.querySelector('input.input');
  search.value = 'basmati';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await flush();
  assert.match(text(root), /Basmati Rice/);
  assert.doesNotMatch(text(root), /Sunflower Oil/, 'the oil is filtered out');

  // "Out of stock" filter on a fully stocked shop shows the empty state.
  const outChip = [...root.querySelectorAll('.chip')].find((c) => /Out of stock|स्टॉक ख़त्म/.test(c.textContent));
  outChip.click();
  await flush();
  assert.match(text(root), /Nothing matched|इस खोज से कुछ नहीं मिला/);
});

/* -------------------------------------------------------- new sale, driven */

test('new sale: type → tap product → complete → a real bill lands in the DB', async () => {
  const { document } = await setupDom();
  const { store, settings, rice, customer } = await seededStore();
  const { renderNewSale } = await import('../js/ui/screens/sales.js');
  const ctx = makeCtx(store, settings);
  const root = document.getElementById('view');

  const stockBefore = (await store.getProduct(rice.id)).stockQtyMilli;
  await renderNewSale(root, ctx);
  await flush();

  // 1. Barcode/SKU search — the exact path a scanner takes.
  const search = root.querySelector('input.input');
  search.value = '8901234500011';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await flush();

  assert.match(text(root), /Basmati Rice/, 'the scanned product is in the cart');
  assert.match(text(root), /Grand total|कुल बिल/);
  assert.match(text(root), /₹100\.00/, '1 kg × ₹100');

  // 2. Quantity 2.5 kg.
  const qtyInput = root.querySelector('.cart-line .inputs input');
  qtyInput.value = '2.5';
  qtyInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  await flush();
  assert.match(text(root), /₹250\.00/, '2.5 kg × ₹100');

  // 3. Credit sale for a customer.
  const creditBtn = [...root.querySelectorAll('.pay-mode')].find((b) => /Credit|उधार/.test(b.textContent));
  creditBtn.click();
  await flush();
  const customerSelect = root.querySelector('select.input');
  customerSelect.value = customer.id;
  customerSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
  await flush();

  // 4. Complete.
  const complete = [...root.querySelectorAll('button')].find((b) => /Complete sale|बिल पूरा करें/.test(b.textContent));
  complete.click();
  await flush(20);

  const sales = await store.listSales();
  assert.equal(sales.length, 1, 'exactly one bill was written');
  assert.equal(sales[0].totalPaise, 25000);
  assert.equal(sales[0].paymentMode, 'credit');
  assert.equal(sales[0].customerId, customer.id);
  assert.equal(sales[0].billNo, 'KSM-00001');
  assert.equal((await store.getProduct(rice.id)).stockQtyMilli, stockBefore - 2500, 'stock dropped by 2.5 kg');
  assert.equal((await store.customerSummary(customer.id)).outstandingPaise, 25000, 'udhaar recorded');
  assert.deepEqual(ctx.visits, [`#/sale/${sales[0].id}`], 'the UI navigated to the invoice');
});

test('new sale: overselling is blocked in the UI with the real error text', async () => {
  const { document } = await setupDom();
  const { store, settings, rice } = await seededStore();
  const { renderNewSale } = await import('../js/ui/screens/sales.js');
  const root = document.getElementById('view');
  const ctx = makeCtx(store, settings);

  await renderNewSale(root, ctx);
  await flush();

  const search = root.querySelector('input.input');
  search.value = '8901234500011';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await flush();

  const qtyInput = root.querySelector('.cart-line .inputs input');
  qtyInput.value = '999';
  qtyInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  await flush();

  const complete = [...root.querySelectorAll('button')].find((b) => /Complete sale|बिल पूरा करें/.test(b.textContent));
  complete.click();
  await flush(20);

  assert.equal((await store.listSales()).length, 0, 'no bill was created');
  assert.match(text(root), /Only 20 kg of "Basmati Rice" in stock/);
  assert.equal((await store.getProduct(rice.id)).stockQtyMilli, 20000, 'stock untouched');
});

/* ---------------------------------------------------------------- invoice */

test('invoice screen prints the bill and can return it', async () => {
  const { document } = await setupDom();
  const { store, settings, rice, customer } = await seededStore();
  const { renderSale } = await import('../js/ui/screens/sales.js');
  const root = document.getElementById('view');
  const ctx = makeCtx(store, settings);

  const { sale } = await store.createSale({
    paymentMode: 'credit', customerId: customer.id, items: [{ productId: rice.id, qty: '4' }],
  });
  await renderSale(root, ctx, sale.id);
  await flush();

  const out = text(root);
  assert.match(out, /KSM-00001/);
  assert.match(out, /Ramesh Kumar/);
  assert.match(out, /₹400\.00/);
  assert.match(out, /My Kirana Store/, 'shop header comes from settings');
  assert.ok([...root.querySelectorAll('button')].some((b) => /Print/.test(b.textContent)));
  assert.ok([...root.querySelectorAll('button')].some((b) => /Return/.test(b.textContent)));

  // Return the whole bill through the UI.
  const returnBtn = [...root.querySelectorAll('button')].find((b) => /^Return/.test(b.textContent));
  returnBtn.click();
  await flush();

  const sheet = document.querySelector('.sheet-backdrop');
  assert.ok(sheet, 'the return sheet opened');
  const qtyField = sheet.querySelector('input.input');
  qtyField.value = '4';
  qtyField.dispatchEvent(new window.Event('input', { bubbles: true }));
  await flush();

  const confirmBtn = [...sheet.querySelectorAll('button')].find((b) => /Confirm return/.test(b.textContent));
  confirmBtn.click();
  await flush(20);

  assert.equal((await store.getProduct(rice.id)).stockQtyMilli, 20000, 'all 4 kg back on the shelf');
  assert.equal((await store.customerSummary(customer.id)).outstandingPaise, 0, 'udhaar cleared');
  assert.equal((await store.getSale(sale.id)).status, 'returned');
});

/* --------------------------------------------------------------- customers */

test('customers: ledger shows the running balance and payments post', async () => {
  const { document } = await setupDom();
  const { store, settings, rice, customer } = await seededStore();
  const customers = await import('../js/ui/screens/customers.js');
  const root = document.getElementById('view');
  const ctx = makeCtx(store, settings);

  await store.createSale({ paymentMode: 'credit', customerId: customer.id, items: [{ productId: rice.id, qty: '2' }] });
  await customers.render(root, ctx);
  await flush();

  assert.match(text(root), /Ramesh Kumar/);
  assert.match(text(root), /₹200\.00/, 'outstanding shown in the list');

  root.querySelector('.list-item .main').click();     // open the ledger
  await flush(20);
  const sheet = document.querySelector('.sheet-backdrop');
  assert.ok(sheet, 'ledger sheet opened');
  assert.match(text(sheet), /Bill KSM-00001/);
  assert.match(text(sheet), /₹200\.00/);

  const payBtn = [...sheet.querySelectorAll('button')].find((b) => /Add payment/.test(b.textContent));
  payBtn.click();
  await flush();

  const paySheet = [...document.querySelectorAll('.sheet-backdrop')].at(-1);
  const amount = paySheet.querySelector('input.input');
  amount.value = '75';
  amount.dispatchEvent(new window.Event('input', { bubbles: true }));
  const save = [...paySheet.querySelectorAll('button')].find((b) => /^Save/.test(b.textContent));
  save.click();
  await flush(20);

  assert.equal((await store.customerSummary(customer.id)).outstandingPaise, 12500, '₹200 − ₹75');
});

/* -------------------------------------------------------------------- more */

test('more: menu, expenses, reports and settings all render', async () => {
  const { document } = await setupDom();
  const { store, settings, rice } = await seededStore();
  const more = await import('../js/ui/screens/more.js');
  const root = document.getElementById('view');
  const ctx = makeCtx(store, settings);

  await more.renderMore(root, ctx);
  await flush();
  assert.match(text(root), /Expenses|खर्च/);
  assert.match(text(root), /Backup/);

  await store.createSale({ paymentMode: 'upi', items: [{ productId: rice.id, qty: '2' }] });
  await store.saveExpense({ category: 'electricity', amount: '120' });

  await more.renderExpenses(root, ctx);
  await flush();
  assert.match(text(root), /₹120\.00/);
  assert.match(text(root), /Electricity|बिजली/);

  await more.renderReports(root, ctx);
  await flush();
  assert.match(text(root), /Sales revenue/);
  assert.match(text(root), /₹200\.00/, 'revenue in the profit summary');
  assert.match(text(root), /₹40\.00/, 'gross profit 200 − 160');

  await more.renderSettings(root, ctx);
  await flush();
  assert.match(text(root), /Invoice prefix/);
  // The shop name lives in an input's value, which is not part of textContent.
  assert.equal(root.querySelector('input.input').value, 'My Kirana Store');

  await more.renderBackup(root, ctx);
  await flush();
  assert.match(text(root), /Export all data/);
  assert.match(text(root), /Import/);
});

test('settings: saving the shop name is reflected on the next render', async () => {
  const { document } = await setupDom();
  const { store, settings } = await seededStore();
  const more = await import('../js/ui/screens/more.js');
  const root = document.getElementById('view');
  const ctx = makeCtx(store, settings);

  await more.renderSettings(root, ctx);
  await flush();

  const shopInput = root.querySelector('input.input');
  shopInput.value = 'Gupta Kirana Bhandar';
  shopInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  const save = [...root.querySelectorAll('button')].find((b) => /^Save/.test(b.textContent));
  save.click();
  await flush(20);

  assert.equal((await store.getSettings()).shopName, 'Gupta Kirana Bhandar');
  assert.equal(ctx.settings.shopName, 'Gupta Kirana Bhandar');
});

/* -------------------------------------------------------------------- i18n */

test('i18n: Hindi toggle swaps the strings the screens use', async () => {
  await setupDom();
  const i18n = await import('../js/i18n.js');
  i18n.setLanguage('en');
  assert.equal(i18n.t('sale.complete'), 'Complete sale');
  i18n.setLanguage('hi');
  assert.equal(i18n.t('sale.complete'), 'बिल पूरा करें');
  assert.equal(i18n.t('dashboard.customerDues'), 'ग्राहक उधारी');
  // Unknown keys fall back to the key, never "undefined".
  assert.equal(i18n.t('nope.missing'), 'nope.missing');
  i18n.setLanguage('en');
});

/* ------------------------------------------------------------------- PWA */

test('PWA: manifest and service worker reference files that exist', async () => {
  const { existsSync } = await import('node:fs');
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './index.html');
  assert.ok(manifest.icons.length >= 3);
  for (const icon of manifest.icons) {
    assert.ok(existsSync(join(ROOT, icon.src)), `missing icon ${icon.src}`);
  }
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'), 'a maskable icon is required for Android');

  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const listed = [...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]);
  assert.ok(listed.length > 10, 'the shell cache lists the app files');
  for (const file of listed) {
    assert.ok(existsSync(join(ROOT, file)), `sw.js precaches a missing file: ${file}`);
  }
});

/* ------------------------------------------------------- app boot/router */

test('app.js boots, unlocks and the router renders the dashboard', async () => {
  const { window, document } = await setupDom();
  // Importing app.js runs boot() for real: storage fallback, seed, i18n,
  // chrome wiring and the first route.
  await import('../js/ui/app.js');
  await flush(30);

  assert.equal(document.getElementById('boot'), null, 'the splash is removed once booted');
  assert.ok(!document.getElementById('shell').classList.contains('hidden'), 'the shell is visible');

  const view = document.getElementById('view');
  assert.ok(view.querySelector('.tile'), 'the dashboard rendered its stat tiles');
  assert.equal(document.getElementById('screenTitle').textContent, 'Dashboard');
  assert.match(document.getElementById('bottomnav').textContent, /Dashboard/);

  // The + Sale tab is marked current for the sale route.
  const saleTab = document.querySelector('#bottomnav a[href="#/sale/new"]');
  assert.ok(saleTab, 'the + Sale action exists in the nav');
});

test('router: navigating the hash swaps the screen and the active tab', async () => {
  const { window, document } = await setupDom();
  // ES modules are cached, so a bare re-import would not re-run boot() against
  // this fresh window. The query string forces a second evaluation.
  await import('../js/ui/app.js?router-test');
  await flush(30);

  window.location.hash = '#/products';
  window.dispatchEvent(new window.Event('hashchange'));
  await flush(30);

  assert.equal(document.getElementById('screenTitle').textContent, 'Products');
  assert.equal(document.querySelector('#bottomnav a[data-route="products"]').getAttribute('aria-current'), 'page');
  assert.match(document.getElementById('view').textContent, /No products yet/, 'empty state for a fresh shop');

  window.location.hash = '#/settings';
  window.dispatchEvent(new window.Event('hashchange'));
  await flush(30);
  assert.equal(document.getElementById('screenTitle').textContent, 'Settings');
  assert.equal(document.querySelector('#bottomnav a[data-route="more"]').getAttribute('aria-current'), 'page');

  // An unknown route falls back to the dashboard instead of showing nothing.
  window.location.hash = '#/nonsense/route';
  window.dispatchEvent(new window.Event('hashchange'));
  await flush(30);
  assert.equal(document.getElementById('screenTitle').textContent, 'Dashboard');
});
