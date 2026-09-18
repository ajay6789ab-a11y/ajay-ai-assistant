/**
 * App bootstrap: storage, PIN lock, hash router and the service worker.
 *
 * Everything is local — no server call happens anywhere in this app.
 */

import { createIDBAdapter, createMemoryAdapter } from '../core/db.js';
import { createStore } from '../core/store.js';
import { applyI18n, setLanguage, t } from '../i18n.js';
import { el, toast } from './dom.js';
import * as dashboard from './screens/dashboard.js';
import * as sales from './screens/sales.js';
import * as products from './screens/products.js';
import * as customers from './screens/customers.js';
import * as more from './screens/more.js';

const ROUTES = {
  dashboard: { title: 'dashboard.title', nav: 'dashboard', render: (root, ctx) => dashboard.render(root, ctx) },
  sales: { title: 'sale.title', nav: 'sales', render: (root, ctx) => sales.render(root, ctx) },
  'sale/new': { title: 'sale.title', nav: 'sale', render: (root, ctx) => sales.renderNewSale(root, ctx) },
  'sale/:id': { title: 'sale.invoice', nav: 'sales', render: (root, ctx, params) => sales.renderSale(root, ctx, params.id) },
  products: { title: 'product.title', nav: 'products', render: (root, ctx) => products.render(root, ctx) },
  customers: { title: 'customer.title', nav: 'customers', render: (root, ctx) => customers.render(root, ctx) },
  more: { title: 'nav.more', nav: 'more', render: (root, ctx) => more.renderMore(root, ctx) },
  purchases: { title: 'purchase.title', nav: 'more', render: (root, ctx) => more.renderPurchases(root, ctx) },
  suppliers: { title: 'supplier.title', nav: 'more', render: (root, ctx) => more.renderSuppliers(root, ctx) },
  expenses: { title: 'expense.title', nav: 'more', render: (root, ctx) => more.renderExpenses(root, ctx) },
  reports: { title: 'reports.title', nav: 'more', render: (root, ctx) => more.renderReports(root, ctx) },
  backup: { title: 'backup.title', nav: 'more', render: (root, ctx) => more.renderBackup(root, ctx) },
  settings: { title: 'settings.title', nav: 'more', render: (root, ctx) => more.renderSettings(root, ctx) },
};

const ctx = { store: null, settings: null, state: {}, navigate, refresh: () => route() };

async function boot() {
  const adapter = await openStorage();
  ctx.store = createStore(adapter);
  ctx.settings = await ctx.store.ensureSeed();
  setLanguage(ctx.settings.language || 'en');

  wireChrome();
  registerServiceWorker();

  if (ctx.settings.pinHash) {
    const unlocked = await lockScreen(ctx.settings);
    if (!unlocked) return;            // stays locked; user can reload
  }

  document.getElementById('boot')?.remove();
  document.getElementById('shell').classList.remove('hidden');
  applyI18n();
  route();
}

/**
 * IndexedDB when available; a memory adapter otherwise so the app still opens
 * (private-mode browsers sometimes block IndexedDB). Data in that case does not
 * survive a reload, and we say so on screen instead of failing silently.
 */
async function openStorage() {
  try {
    const adapter = createIDBAdapter();
    await adapter.getAll('meta');
    return adapter;
  } catch {
    queueMicrotask(() => {
      const bar = document.getElementById('netbar');
      if (bar) {
        bar.textContent = 'Storage unavailable — data will not be saved after a reload. Export a backup often.';
        bar.classList.remove('hidden');
      }
    });
    return createMemoryAdapter();
  }
}

function wireChrome() {
  document.getElementById('backBtn').addEventListener('click', () => history.back());
  document.getElementById('langBtn').addEventListener('click', async () => {
    const next = ctx.settings.language === 'hi' ? 'en' : 'hi';
    ctx.settings = await ctx.store.saveSettings({ language: next });
    setLanguage(next);
    applyI18n();
    route();
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('online', updateNetBar);
  window.addEventListener('offline', updateNetBar);
  updateNetBar();
}

function updateNetBar() {
  const bar = document.getElementById('netbar');
  if (!bar || bar.dataset.storage === 'warn') return;
  if (navigator.onLine) bar.classList.add('hidden');
  else {
    bar.textContent = t('errors.networkFree');
    bar.classList.remove('hidden');
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Registering over file:// throws in some browsers; the app works either way.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline caching is a bonus */ });
  });
}

/* ------------------------------------------------------------------ router */

function matchRoute(hash) {
  const path = (hash || '#/dashboard').replace(/^#\/?/, '') || 'dashboard';
  if (ROUTES[path]) return { key: path, params: {} };
  const parts = path.split('/');
  for (const key of Object.keys(ROUTES)) {
    const keyParts = key.split('/');
    if (keyParts.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < keyParts.length; i += 1) {
      if (keyParts[i].startsWith(':')) params[keyParts[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (keyParts[i] !== parts[i]) { ok = false; break; }
    }
    if (ok) return { key, params };
  }
  return { key: 'dashboard', params: {} };
}

async function route() {
  const { key, params } = matchRoute(location.hash);
  const def = ROUTES[key];
  const root = document.getElementById('view');

  document.getElementById('screenTitle').textContent = t(def.title);
  document.getElementById('shopLine').textContent = ctx.settings.shopName || '';
  document.getElementById('backBtn').classList.toggle('hidden', key === 'dashboard');

  for (const link of document.querySelectorAll('#bottomnav a')) {
    const active = link.dataset.route === def.nav;
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  root.replaceChildren(el('p.muted', { text: '…' }));
  try {
    await def.render(root, ctx, params);
  } catch (e) {
    root.replaceChildren(el('div.card', {}, [
      el('h2', { text: t('errors.invalid') }),
      el('p.error-text', { text: e?.message || String(e) }),
    ]));
    console.error(e);
  }
  window.scrollTo({ top: 0 });
}

function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

/* -------------------------------------------------------------- PIN unlock */

function lockScreen(settings) {
  return new Promise((resolve) => {
    const input = el('input.input', { type: 'password', inputmode: 'numeric', autocomplete: 'off', style: { textAlign: 'center', fontSize: '22px', letterSpacing: '8px' } });
    const err = el('p.error-text.hidden', { text: t('lock.wrong') });

    const submit = async () => {
      const value = input.value.trim();
      if (!value) return;
      const { hashPin } = await import('./screens/more.js');
      const { hash } = await hashPin(value, settings.pinSalt);
      if (hash === settings.pinHash) {
        screen.remove();
        resolve(true);
        return;
      }
      err.classList.remove('hidden');
      input.value = '';
      input.focus();
    };

    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

    const screen = el('div.lockscreen', {}, [
      el('div.lock-card', {}, [
        el('div.lock-logo', { text: 'K' }),
        el('h1', { text: t('lock.title') }),
        el('p.muted.small', { text: t('lock.subtitle') }),
        el('div.stack', { style: { marginTop: '16px' } }, [
          input,
          err,
          el('button.btn.primary.block', { type: 'button', text: t('action.unlock'), onclick: submit }),
        ]),
      ]),
    ]);

    document.getElementById('boot')?.remove();
    document.body.append(screen);
    input.focus();
  });
}

boot().catch((e) => {
  console.error(e);
  const bootEl = document.getElementById('boot');
  if (bootEl) {
    bootEl.replaceChildren(el('div.lock-card', {}, [
      el('h1', { text: 'Could not start' }),
      el('p.error-text', { text: e?.message || String(e) }),
    ]));
  }
});
