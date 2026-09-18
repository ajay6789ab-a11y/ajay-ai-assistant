/** "More" — suppliers, purchases, expenses, reports, backup and settings. */

import { t, setLanguage } from '../../i18n.js';
import { el, emptyState, modal, confirmDialog, toast, field, textInput, numberInput, selectInput } from '../dom.js';
import { fmtPaise, fmtQty, toMilli, toPaise } from '../../core/money.js';
import { EXPENSE_CATEGORIES, PAYMENT_MODES } from '../../core/store.js';
import * as reports from '../../core/reports.js';
import { allCSVs, backupFilename, downloadText, readTextFile } from '../../core/backup.js';

/* -------------------------------------------------------------------- menu */

export async function renderMore(root, ctx) {
  const items = [
    ['🧾', t('purchase.title'), '#/purchases'],
    ['🚚', t('supplier.title'), '#/suppliers'],
    ['💸', t('expense.title'), '#/expenses'],
    ['📊', t('reports.title'), '#/reports'],
    ['💾', t('backup.title'), '#/backup'],
    ['⚙️', t('settings.title'), '#/settings'],
  ];
  root.replaceChildren(
    el('div.card', {}, el('div.list', {}, items.map(([ico, label, href]) =>
      el('div.list-item', { style: { cursor: 'pointer' }, onclick: () => ctx.navigate(href) }, [
        el('div', { style: { fontSize: '18px' }, text: ico }),
        el('div.main', {}, el('div.t', { text: label })),
        el('div.muted', { text: '›' }),
      ])))),
  );
}

/* --------------------------------------------------------------- suppliers */

export async function renderSuppliers(root, ctx) {
  const money = (p) => fmtPaise(p, ctx.settings.currencySymbol);
  const redraw = async () => {
    const suppliers = await ctx.store.listSuppliers();
    root.replaceChildren(
      el('div.stack', {}, [
        el('div.row', {}, [
          el('div.grow', {}, el('h1', { text: t('supplier.title') })),
          el('button.btn.primary', { type: 'button', text: '+', onclick: () => openParty(ctx, 'supplier', null, redraw) }),
        ]),
        el('div.card', {}, suppliers.length === 0
          ? emptyState(t('supplier.empty'), el('button.btn.primary', { type: 'button', text: t('supplier.addTitle'), onclick: () => openParty(ctx, 'supplier', null, redraw) }))
          : el('div.list', {}, suppliers.map((s) =>
              el('div.list-item', {}, [
                el('div.main', {}, [
                  el('div.t.truncate', { text: s.name }),
                  el('div.d.truncate', { text: s.mobile || '—' }),
                ]),
                el('div.right', {}, [
                  el(`div.amt.${s.payablePaise > 0 ? 'neg' : 'pos'}`, { text: money(s.payablePaise) }),
                  el('div.small.muted', { text: t('supplier.payable') }),
                ]),
                el('button.icon-btn', { type: 'button', text: '✎', onclick: () => openParty(ctx, 'supplier', s, redraw) }),
              ])))),
      ]),
    );
  };
  await redraw();
}

function openParty(ctx, kind, party, done) {
  const f = {
    name: textInput({ value: party?.name || '' }),
    mobile: textInput({ value: party?.mobile || '', inputmode: 'tel' }),
    address: textInput({ value: party?.address || '' }),
    notes: el('textarea.input', { text: party?.notes || '' }),
  };
  const err = el('p.error-text.hidden');
  const isSupplier = kind === 'supplier';
  modal({
    title: party
      ? (isSupplier ? t('supplier.editTitle') : t('customer.editTitle'))
      : (isSupplier ? t('supplier.addTitle') : t('customer.addTitle')),
    body: el('div.stack', {}, [
      err,
      field(isSupplier ? t('supplier.name') : t('customer.name'), f.name),
      field(isSupplier ? t('supplier.mobile') : t('customer.mobile'), f.mobile),
      field(isSupplier ? t('supplier.address') : t('customer.address'), f.address),
      field(isSupplier ? t('supplier.notes') : t('customer.notes'), f.notes),
    ]),
    actions: [
      { label: t('action.cancel'), onClick: (c) => c() },
      {
        label: t('action.save'),
        kind: 'primary',
        onClick: async (c) => {
          try {
            const payload = { id: party?.id, name: f.name.value, mobile: f.mobile.value, address: f.address.value, notes: f.notes.value };
            if (isSupplier) await ctx.store.saveSupplier(payload);
            else await ctx.store.saveCustomer(payload);
            c();
            toast(t('toast.saved'));
            done();
          } catch (e) {
            err.textContent = e?.message || t('errors.invalid');
            err.classList.remove('hidden');
          }
        },
      },
    ],
  });
}

/* --------------------------------------------------------------- purchases */

export async function renderPurchases(root, ctx) {
  const money = (p) => fmtPaise(p, ctx.settings.currencySymbol);
  const redraw = async () => {
    const purchases = await ctx.store.listPurchases();
    root.replaceChildren(
      el('div.stack', {}, [
        el('div.row', {}, [
          el('div.grow', {}, el('h1', { text: t('purchase.title') })),
          el('button.btn.primary', { type: 'button', text: `+ ${t('purchase.add')}`, onclick: () => openPurchase(ctx, redraw) }),
        ]),
        el('div.card', {}, purchases.length === 0
          ? emptyState(t('purchase.empty'), el('button.btn.primary', { type: 'button', text: t('purchase.add'), onclick: () => openPurchase(ctx, redraw) }))
          : el('div.list', {}, purchases.map((p) =>
              el('div.list-item', {}, [
                el('div.main', {}, [
                  el('div.t.truncate', { text: `${p.invoiceNo} · ${p.supplierName || '—'}` }),
                  el('div.d.truncate', { text: new Date(p.date).toLocaleString() }),
                ]),
                el('div.right', {}, [
                  el('div.amt', { text: money(p.totalPaise) }),
                  el(`span.badge.${p.paymentStatus === 'paid' ? 'ok' : p.paymentStatus === 'partial' ? 'warn' : 'danger'}`, { text: t(`purchase.${p.paymentStatus}`) }),
                ]),
                p.status === 'completed'
                  ? el('button.icon-btn', { type: 'button', 'aria-label': t('purchase.returnTitle'), text: '↩', onclick: async () => {
                      const ok = await confirmDialog({ title: t('purchase.returnTitle'), message: p.invoiceNo, confirmLabel: t('action.confirm') });
                      if (!ok) return;
                      try {
                        await ctx.store.returnPurchase(p.id);
                        toast(t('toast.returnDone'));
                        redraw();
                      } catch (e) { toast(e?.message || t('errors.invalid'), 'error'); }
                    } })
                  : null,
              ])))),
      ]),
    );
  };
  await redraw();
}

async function openPurchase(ctx, done) {
  const money = (p) => fmtPaise(p, ctx.settings.currencySymbol);
  const [products, suppliers] = await Promise.all([ctx.store.listProducts(), ctx.store.listSuppliers()]);
  const lines = [];

  const supplier = selectInput([{ value: '', label: '—' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]);
  const invoiceNo = textInput({ value: '' });
  const date = el('input.input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
  const amountPaid = numberInput({ value: '0' });
  const notes = textInput({});
  const err = el('p.error-text.hidden');
  const linesBox = el('div.stack');
  const totalBox = el('div.totals');

  const search = textInput({ placeholder: t('sale.searchPlaceholder') });
  const results = el('div.stack');
  search.addEventListener('input', async () => {
    const matches = (await ctx.store.listProducts({ q: search.value })).slice(0, 6);
    results.replaceChildren(...matches.map((p) =>
      el('button.btn.soft.block', {
        type: 'button',
        style: { justifyContent: 'space-between', textAlign: 'left' },
        onclick: () => {
          lines.push({ productId: p.id, name: p.name, unit: p.unit, qtyMilli: 1000, ratePaise: p.purchasePrice });
          search.value = '';
          results.replaceChildren();
          renderLines();
        },
      }, [el('span.truncate', { text: p.name }), el('span.nowrap', { text: money(p.purchasePrice) })])));
  });

  function renderLines() {
    linesBox.replaceChildren(...lines.map((line, i) => {
      const qty = numberInput({ value: fmtQty(line.qtyMilli), oninput: (e) => { line.qtyMilli = safeMilli(e.target.value); renderTotal(); } });
      const rate = numberInput({ value: (line.ratePaise / 100).toFixed(2), oninput: (e) => { line.ratePaise = safePaise(e.target.value); renderTotal(); } });
      return el('div.cart-line', {}, [
        el('div', {}, el('div.nm.truncate', { text: line.name })),
        el('button.icon-btn', { type: 'button', text: '×', onclick: () => { lines.splice(i, 1); renderLines(); } }),
        el('div.inputs', {}, [field(t('reports.qty'), qty), field(t('purchase.rate'), rate)]),
      ]);
    }));
    renderTotal();
  }

  function safeMilli(v) { try { return toMilli(v); } catch { return 0; } }
  function safePaise(v) { try { return toPaise(v); } catch { return 0; } }

  function renderTotal() {
    const total = lines.reduce((n, l) => n + Math.round((l.qtyMilli * l.ratePaise) / 1000), 0);
    totalBox.replaceChildren(el('div.line.grand', {}, [el('span', { text: t('purchase.total') }), el('span', { text: money(total) })]));
  }

  modal({
    title: t('purchase.newTitle'),
    wide: true,
    body: el('div.stack', {}, [
      err,
      el('p.small.muted', { text: t('purchase.stockWillIncrease') }),
      el('div.grid-2', {}, [field(t('purchase.supplier'), supplier), field(t('purchase.invoiceNo'), invoiceNo)]),
      field(t('sale.date'), date),
      search,
      results,
      linesBox,
      totalBox,
      el('div.grid-2', {}, [field(t('purchase.amountPaid'), amountPaid), field(t('expense.note'), notes)]),
    ]),
    actions: [
      { label: t('action.cancel'), onClick: (c) => c() },
      {
        label: t('action.save'),
        kind: 'primary',
        onClick: async (c) => {
          try {
            await ctx.store.createPurchase({
              supplierId: supplier.value || null,
              invoiceNo: invoiceNo.value,
              date: date.value,
              amountPaid: amountPaid.value,
              notes: notes.value,
              items: lines.map((l) => ({ productId: l.productId, qty: fmtQty(l.qtyMilli), rate: l.ratePaise / 100 })),
            });
            c();
            toast(t('toast.purchaseDone'));
            done();
          } catch (e) {
            err.textContent = e?.message || t('errors.invalid');
            err.classList.remove('hidden');
          }
        },
      },
    ],
  });
}

/* ---------------------------------------------------------------- expenses */

export async function renderExpenses(root, ctx) {
  const money = (p) => fmtPaise(p, ctx.settings.currencySymbol);
  const redraw = async () => {
    const expenses = await ctx.store.listExpenses();
    const total = expenses.reduce((n, e) => n + e.amountPaise, 0);
    root.replaceChildren(
      el('div.stack', {}, [
        el('div.row', {}, [
          el('div.grow', {}, el('h1', { text: t('expense.title') })),
          el('button.btn.primary', { type: 'button', text: '+', onclick: () => openExpense(ctx, null, redraw) }),
        ]),
        el('div.tile', {}, [el('div.k', { text: t('dashboard.expenses') }), el('div.v', { text: money(total) })]),
        el('div.card', {}, expenses.length === 0
          ? emptyState(t('expense.empty'), el('button.btn.primary', { type: 'button', text: t('expense.addTitle'), onclick: () => openExpense(ctx, null, redraw) }))
          : el('div.list', {}, expenses.map((e) =>
              el('div.list-item', {}, [
                el('div.main', {}, [
                  el('div.t', { text: t(`expense.categories.${e.category}`) }),
                  el('div.d.truncate', { text: `${new Date(e.date).toLocaleDateString()}${e.note ? ` · ${e.note}` : ''}` }),
                ]),
                el('div.amt.neg', { text: money(e.amountPaise) }),
                el('button.icon-btn', { type: 'button', 'aria-label': t('action.edit'), text: '✎', onclick: () => openExpense(ctx, e, redraw) }),
                el('button.icon-btn', { type: 'button', 'aria-label': t('action.delete'), text: '×', onclick: async () => {
                  const ok = await confirmDialog({ title: t('action.delete'), message: t(`expense.categories.${e.category}`), confirmLabel: t('action.delete'), danger: true });
                  if (!ok) return;
                  await ctx.store.voidExpense(e.id);
                  toast(t('toast.deleted'));
                  redraw();
                } }),
              ])))),
      ]),
    );
  };
  await redraw();
}

function openExpense(ctx, expense, done) {
  const amount = numberInput({ value: expense ? (expense.amountPaise / 100).toFixed(2) : '' });
  const category = selectInput(EXPENSE_CATEGORIES.map((c) => ({ value: c, label: t(`expense.categories.${c}`) })), { value: expense?.category || 'other' });
  const date = el('input.input', { type: 'date', value: expense?.date ? expense.date.slice(0, 10) : new Date().toISOString().slice(0, 10) });
  const note = textInput({ value: expense?.note || '' });
  const err = el('p.error-text.hidden');

  modal({
    title: t('expense.addTitle'),
    body: el('div.stack', {}, [
      err,
      field(t('expense.amount'), amount),
      el('div.grid-2', {}, [field(t('expense.category'), category), field(t('expense.date'), date)]),
      field(t('expense.note'), note),
    ]),
    actions: [
      { label: t('action.cancel'), onClick: (c) => c() },
      {
        label: t('action.save'),
        kind: 'primary',
        onClick: async (c) => {
          try {
            await ctx.store.saveExpense({ id: expense?.id, amount: amount.value, category: category.value, date: date.value, note: note.value });
            c();
            toast(t('toast.saved'));
            done();
          } catch (e) {
            err.textContent = e?.message || t('errors.invalid');
            err.classList.remove('hidden');
          }
        },
      },
    ],
  });
}

/* ----------------------------------------------------------------- reports */

export async function renderReports(root, ctx) {
  const money = (p) => fmtPaise(p, ctx.settings.currencySymbol);
  const data = await ctx.store._raw();
  const preset = ctx.state.reportRange || 'month';
  const range = reports.dateRange(preset, ctx.state.customRange || {});
  const s = reports.summarise(data, range);

  const tabs = [
    ['profit', t('reports.profit')],
    ['sales', t('reports.sales')],
    ['stock', t('reports.stock')],
    ['dues', t('reports.dues')],
    ['payables', t('reports.payables')],
  ];
  const active = ctx.state.reportTab || 'profit';

  const body = el('div.card');
  if (active === 'profit') {
    body.replaceChildren(el('div.stack', {}, [
      el('div.tiles', {}, [
        el('div.tile.info', {}, [el('div.k', { text: t('reports.revenue') }), el('div.v', { text: money(s.revenuePaise) })]),
        el('div.tile', {}, [el('div.k', { text: t('reports.cogs') }), el('div.v', { text: money(s.cogsPaise) })]),
        el('div.tile.ok', {}, [el('div.k', { text: t('reports.gross') }), el('div.v', { text: money(s.grossProfitPaise) })]),
        el('div.tile.bad', {}, [el('div.k', { text: t('dashboard.expenses') }), el('div.v', { text: money(s.expenseTotalPaise) })]),
      ]),
      el('div.tile', {}, [el('div.k', { text: t('reports.net') }), el('div.v', { text: money(s.netProfitPaise) })]),
      el('div.card', {}, [
        el('h3', { text: t('dashboard.topProducts') }),
        el('div.table-wrap', {}, el('table.tbl', {}, [
          el('thead', {}, el('tr', {}, [
            el('th', { text: t('reports.product') }),
            el('th.num', { text: t('reports.qty') }),
            el('th.num', { text: t('reports.amount') }),
            el('th.num', { text: t('reports.profitCol') }),
          ])),
          el('tbody', {}, reports.topProducts(data, range, 10).map((p) =>
            el('tr', {}, [
              el('td', { text: p.name }),
              el('td.num', { text: `${p.qtyLabel} ${p.unit}` }),
              el('td.num', { text: money(p.revenuePaise) }),
              el('td.num', { text: money(p.profitPaise) }),
            ]))),
        ])),
      ]),
      el('div.card', {}, [
        el('h3', { text: t('dashboard.expenses') }),
        Object.keys(s.expensesByCategory).length === 0
          ? el('p.muted', { text: t('reports.nothing') })
          : el('div.list', {}, Object.entries(s.expensesByCategory).map(([cat, amt]) =>
              el('div.list-item', {}, [el('div.main', {}, el('div.t', { text: t(`expense.categories.${cat}`) })), el('div.amt.neg', { text: money(amt) })]))),
      ]),
    ]));
  } else if (active === 'sales') {
    const rows = reports.salesRegister(data, range);
    body.replaceChildren(rows.length === 0
      ? el('p.muted', { text: t('reports.nothing') })
      : el('div.table-wrap', {}, el('table.tbl', {}, [
          el('thead', {}, el('tr', {}, [
            el('th', { text: t('sale.date') }),
            el('th', { text: t('sale.billNo') }),
            el('th', { text: t('reports.product') }),
            el('th.num', { text: t('reports.qty') }),
            el('th.num', { text: t('reports.amount') }),
            el('th.num', { text: t('reports.profitCol') }),
          ])),
          el('tbody', {}, rows.map((r) =>
            el('tr', {}, [
              el('td', { text: new Date(r.date).toLocaleDateString() }),
              el('td', { text: r.billNo }),
              el('td', { text: r.product }),
              el('td.num', { text: `${r.qtyLabel} ${r.unit}` }),
              el('td.num', { text: money(r.revenuePaise) }),
              el('td.num', { text: money(r.profitPaise) }),
            ]))),
        ])));
  } else if (active === 'stock') {
    body.replaceChildren(el('div.table-wrap', {}, el('table.tbl', {}, [
      el('thead', {}, el('tr', {}, [
        el('th', { text: t('reports.product') }),
        el('th.num', { text: t('product.stock') }),
        el('th.num', { text: t('product.minStock') }),
        el('th.num', { text: t('reports.amount') }),
      ])),
      el('tbody', {}, data.products.slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) =>
        el('tr', {}, [
          el('td', { text: p.name }),
          el('td.num', { text: `${fmtQty(p.stockQtyMilli)} ${p.unit}` }),
          el('td.num', { text: fmtQty(p.minStockQtyMilli) }),
          el('td.num', { text: money(p.stockQtyMilli / 1000 * p.purchasePrice) }),
        ]))),
    ])));
  } else if (active === 'dues') {
    const rows = reports.customerDuesReport(data);
    body.replaceChildren(rows.length === 0
      ? el('p.muted', { text: t('customer.noDues') })
      : el('div.list', {}, rows.map((c) =>
          el('div.list-item', {}, [
            el('div.main', {}, [el('div.t.truncate', { text: c.name }), el('div.d', { text: c.mobile || '—' })]),
            el('div.amt.neg', { text: money(c.outstandingPaise) }),
          ]))));
  } else {
    const rows = reports.supplierPayableReport(data);
    body.replaceChildren(rows.length === 0
      ? el('p.muted', { text: t('reports.nothing') })
      : el('div.list', {}, rows.map((sp) =>
          el('div.list-item', {}, [
            el('div.main', {}, [el('div.t.truncate', { text: sp.name }), el('div.d', { text: sp.mobile || '—' })]),
            el('div.amt.neg', { text: money(sp.payablePaise) }),
          ]))));
  }

  root.replaceChildren(
    el('div.stack', {}, [
      el('div.chips', {}, ['today', 'yesterday', 'week', 'month'].map((r) =>
        el('button.chip', {
          type: 'button',
          text: t(`range.${r}`),
          'aria-pressed': String(preset === r),
          onclick: () => { ctx.state.reportRange = r; renderReports(root, ctx); },
        }))),
      el('div.chips', {}, tabs.map(([key, label]) =>
        el('button.chip', {
          type: 'button',
          text: label,
          'aria-pressed': String(active === key),
          onclick: () => { ctx.state.reportTab = key; renderReports(root, ctx); },
        }))),
      body,
      el('div.row.wrap', {}, [
        el('button.btn', { type: 'button', text: t('reports.exportCsv'), onclick: async () => {
          const csvs = await allCSVs(ctx.store);
          downloadText(`kirana-${active}-${new Date().toISOString().slice(0, 10)}.csv`, csvs[active === 'dues' ? 'customers' : active === 'payables' ? 'suppliers' : active === 'stock' || active === 'profit' ? 'products' : active], 'text/csv;charset=utf-8');
          toast(t('toast.saved'));
        } }),
        el('button.btn', { type: 'button', text: t('reports.exportJson'), onclick: async () => {
          downloadText(backupFilename(), JSON.stringify(await ctx.store.exportAll(), null, 2), 'application/json');
          toast(t('backup.exported'));
        } }),
      ]),
    ]),
  );
}

/* ------------------------------------------------------------------ backup */

export async function renderBackup(root, ctx) {
  const fileInput = el('input.input', { type: 'file', accept: 'application/json,.json' });
  let mode = 'merge';

  root.replaceChildren(
    el('div.stack', {}, [
      el('div.card', {}, [
        el('div.card-head', {}, [el('h2', { text: t('backup.exportAll') })]),
        el('p.small.muted', { text: t('errors.networkFree') }),
        el('button.btn.primary.block', { type: 'button', text: t('action.download'), onclick: async () => {
          downloadText(backupFilename(), JSON.stringify(await ctx.store.exportAll(), null, 2), 'application/json');
          toast(t('backup.exported'));
        } }),
        el('div.row.wrap', { style: { marginTop: '10px' } }, Object.entries(await allCSVs(ctx.store)).map(([key, csv]) =>
          el('button.btn.sm', { type: 'button', text: `${key}.csv`, onclick: () => {
            downloadText(`kirana-${key}-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
          } }))),
      ]),
      el('div.card', {}, [
        el('div.card-head', {}, [el('h2', { text: t('backup.importAll') })]),
        fileInput,
        el('div.chips', { style: { marginTop: '10px' } }, [
          el('button.chip', { type: 'button', text: t('backup.merge'), 'aria-pressed': 'true', onclick: (e) => { mode = 'merge'; e.target.parentElement.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false')); e.target.setAttribute('aria-pressed', 'true'); } }),
          el('button.chip', { type: 'button', text: t('backup.replace'), 'aria-pressed': 'false', onclick: (e) => { mode = 'replace'; e.target.parentElement.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false')); e.target.setAttribute('aria-pressed', 'true'); } }),
        ]),
        el('p.small.muted', { text: mode === 'merge' ? t('backup.mergeHint') : t('backup.replaceHint') }),
        el('button.btn.primary.block', { type: 'button', text: t('action.import'), onclick: async () => {
          const file = fileInput.files?.[0];
          if (!file) { toast(t('errors.required'), 'error'); return; }
          if (mode === 'replace') {
            const ok = await confirmDialog({ title: t('backup.replace'), message: t('backup.replaceHint'), confirmLabel: t('action.confirm'), danger: true });
            if (!ok) return;
          }
          try {
            await ctx.store.importAll(JSON.parse(await readTextFile(file)), mode);
            ctx.settings = await ctx.store.getSettings();
            toast(t('backup.restored'));
            ctx.navigate('#/dashboard');
          } catch (e) { toast(e?.message || t('errors.invalid'), 'error'); }
        } }),
      ]),
      el('div.card', {}, [
        el('div.card-head', {}, [el('h2', { text: t('backup.resetTitle') })]),
        el('p.small.muted', { text: t('backup.resetWarn') }),
        el('button.btn.danger.block', { type: 'button', text: t('action.reset'), onclick: async () => {
          const ok = await confirmDialog({ title: t('backup.resetTitle'), message: t('backup.resetWarn'), confirmLabel: t('action.reset'), danger: true, promptText: 'DELETE' });
          if (!ok) return;
          await ctx.store.resetAll();
          ctx.settings = await ctx.store.getSettings();
          toast(t('backup.resetDone'));
          ctx.navigate('#/dashboard');
        } }),
      ]),
    ]),
  );
}

/* ---------------------------------------------------------------- settings */

export async function renderSettings(root, ctx) {
  const s = ctx.settings;
  const f = {
    shopName: textInput({ value: s.shopName }),
    ownerName: textInput({ value: s.ownerName }),
    mobile: textInput({ value: s.mobile, inputmode: 'tel' }),
    address: textInput({ value: s.address }),
    gstin: textInput({ value: s.gstin }),
    invoicePrefix: textInput({ value: s.invoicePrefix }),
    currencySymbol: textInput({ value: s.currencySymbol }),
    language: selectInput([{ value: 'en', label: t('settings.english') }, { value: 'hi', label: t('settings.hindi') }], { value: s.language }),
  };
  const negative = el('input', { type: 'checkbox', checked: Boolean(s.allowNegativeStock) });

  root.replaceChildren(
    el('div.stack', {}, [
      el('div.card', {}, [
        el('div.card-head', {}, [el('h2', { text: t('settings.title') })]),
        el('div.grid-2', {}, [
          field(t('settings.shopName'), f.shopName),
          field(t('settings.ownerName'), f.ownerName),
        ]),
        el('div.grid-2', {}, [
          field(t('settings.mobile'), f.mobile),
          field(t('settings.gstin'), f.gstin),
        ]),
        field(t('settings.address'), f.address),
        el('div.grid-3', {}, [
          field(t('settings.invoicePrefix'), f.invoicePrefix),
          field(t('settings.currency'), f.currencySymbol),
          field(t('settings.language'), f.language),
        ]),
        el('label.switch', {}, [negative, el('span', { text: t('settings.negativeStock') })]),
        el('button.btn.primary.block', { type: 'button', text: t('action.save'), onclick: async () => {
          ctx.settings = await ctx.store.saveSettings({
            shopName: f.shopName.value,
            ownerName: f.ownerName.value,
            mobile: f.mobile.value,
            address: f.address.value,
            gstin: f.gstin.value,
            invoicePrefix: f.invoicePrefix.value,
            currencySymbol: f.currencySymbol.value || '₹',
            language: f.language.value,
            allowNegativeStock: negative.checked,
          });
          setLanguage(ctx.settings.language);
          toast(t('toast.saved'));
          ctx.refresh();
        } }),
      ]),
      el('div.card', {}, [
        el('div.card-head', {}, [el('h2', { text: t('settings.security') })]),
        el('p.small.muted', { text: s.pinHash ? t('action.changePin') : t('settings.pinPrompt') }),
        el('div.row.wrap', {}, [
          el('button.btn', { type: 'button', text: s.pinHash ? t('action.changePin') : t('action.setPin'), onclick: () => openPinSetup(ctx) }),
          s.pinHash ? el('button.btn.danger', { type: 'button', text: t('action.removePin'), onclick: async () => {
            const ok = await confirmDialog({ title: t('action.removePin'), message: t('settings.security'), confirmLabel: t('action.removePin'), danger: true });
            if (!ok) return;
            ctx.settings = await ctx.store.saveSettings({ pinHash: null, pinSalt: null });
            toast(t('settings.pinRemoved'));
            renderSettings(root, ctx);
          } }) : null,
        ]),
      ]),
      el('div.card', {}, [
        el('div.card-head', {}, [el('h2', { text: t('settings.dataTools') })]),
        el('button.btn.block', { type: 'button', text: t('settings.recalcStock'), onclick: async () => {
          const fixed = await ctx.store.recomputeStock();
          toast(fixed ? `${fixed} ${t('settings.integrityBad')}` : t('settings.integrityOk'));
        } }),
        el('button.btn.soft.block', { type: 'button', style: { marginTop: '8px' }, text: t('settings.loadSample'), onclick: async () => {
          const ok = await confirmDialog({ title: t('settings.loadSample'), message: t('settings.sampleWarn'), confirmLabel: t('action.confirm') });
          if (!ok) return;
          const { loadSampleData } = await import('../../core/sample-data.js');
          await loadSampleData(ctx.store);
          toast(t('toast.saved'));
          ctx.navigate('#/dashboard');
        } }),
      ]),
      el('div.card', {}, [
        el('div.card-head', {}, [el('h2', { text: t('settings.about') })]),
        el('p.small', { text: `${t('settings.version')}: ${s.version}` }),
        el('p.small.muted', { text: t('errors.networkFree') }),
      ]),
    ]),
  );
}

/** PIN is stored salted + SHA-256 hashed — never as plaintext. */
export async function openPinSetup(ctx) {
  const pin1 = el('input.input', { type: 'password', inputmode: 'numeric', autocomplete: 'new-password' });
  const pin2 = el('input.input', { type: 'password', inputmode: 'numeric', autocomplete: 'new-password' });
  const err = el('p.error-text.hidden');
  modal({
    title: ctx.settings.pinHash ? t('action.changePin') : t('action.setPin'),
    body: el('div.stack', {}, [err, field(t('settings.pinPrompt'), pin1), field(t('settings.pinRepeat'), pin2)]),
    actions: [
      { label: t('action.cancel'), onClick: (c) => c() },
      {
        label: t('action.save'),
        kind: 'primary',
        onClick: async (c) => {
          const value = pin1.value.trim();
          if (!/^\d{4,6}$/.test(value)) {
            err.textContent = t('settings.pinPrompt');
            err.classList.remove('hidden');
            return;
          }
          if (value !== pin2.value.trim()) {
            err.textContent = t('settings.pinMismatch');
            err.classList.remove('hidden');
            return;
          }
          const { hash, salt } = await hashPin(value);
          ctx.settings = await ctx.store.saveSettings({ pinHash: hash, pinSalt: salt });
          c();
          toast(t('settings.pinSet'));
        },
      },
    ],
  });
}

export async function hashPin(pin, salt = randomSalt()) {
  const enc = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return { hash: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''), salt };
}

function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
