/** Products & stock — list, filters, editor, movement history. */

import { t } from '../../i18n.js';
import { el, emptyState, modal, confirmDialog, toast, field, textInput, numberInput, selectInput } from '../dom.js';
import { fmtPaise, fmtQty } from '../../core/money.js';
import { UNITS } from '../../core/store.js';

export async function render(root, ctx) {
  const state = ctx.state.products || (ctx.state.products = { q: '', category: '', stock: '' });
  const money = (p) => fmtPaise(p, ctx.settings.currencySymbol);

  const redraw = async () => {
    const products = await ctx.store.listProducts({
      q: state.q,
      category: state.category || undefined,
      stockFilter: state.stock || undefined,
    });
    const data = await ctx.store._raw();
    const cats = [...new Set(data.categories.map((c) => c.name))].sort();

    const search = textInput({
      value: state.q,
      placeholder: t('sale.searchPlaceholder'),
      oninput: (e) => { state.q = e.target.value; redraw(); },
    });

    const listBody = products.length === 0
      ? emptyState(state.q || state.category || state.stock ? t('product.noResults') : t('product.empty'),
          el('button.btn.primary', { type: 'button', text: t('product.addTitle'), onclick: () => openEditor(ctx, null, redraw) }))
      : el('div.list', {}, products.map((p) => row(p)));

    root.replaceChildren(
      el('div.stack', {}, [
        el('div.row', {}, [
          el('div.grow', {}, search),
          el('button.btn.primary', { type: 'button', text: '+', 'aria-label': t('product.addTitle'), onclick: () => openEditor(ctx, null, redraw) }),
        ]),
        el('div.chips', {}, [
          chip(t('product.filterAll'), state.stock === '', () => { state.stock = ''; redraw(); }),
          chip(t('product.filterLow'), state.stock === 'low', () => { state.stock = 'low'; redraw(); }),
          chip(t('product.filterOut'), state.stock === 'out', () => { state.stock = 'out'; redraw(); }),
        ]),
        el('div.chips', {}, [
          chip(t('product.filterAll'), state.category === '', () => { state.category = ''; redraw(); }),
          ...cats.map((c) => chip(c, state.category === c, () => { state.category = c; redraw(); })),
        ]),
        el('div.card', {}, listBody),
      ]),
    );
    search.focus?.();
  };

  function row(p) {
    const out = p.stockQtyMilli <= 0;
    const low = !out && p.minStockQtyMilli > 0 && p.stockQtyMilli <= p.minStockQtyMilli;
    return el('div.list-item', {}, [
      el('div.main', { style: { cursor: 'pointer' }, onclick: () => openEditor(ctx, p, redraw) }, [
        el('div.t.truncate', { text: p.name }),
        el('div.d.truncate', {
          text: `${p.category}${p.sku ? ` · ${p.sku}` : ''} · ${money(p.sellingPrice)}/${p.unit}`,
        }),
      ]),
      el('div.right', {}, [
        el(`span.badge.${out ? 'danger' : low ? 'warn' : 'ok'}`, { text: `${fmtQty(p.stockQtyMilli)} ${p.unit}` }),
      ]),
      el('button.icon-btn', { type: 'button', 'aria-label': t('action.history'), text: '≡', onclick: () => openHistory(ctx, p) }),
    ]);
  }

  await redraw();
}

function chip(label, active, onclick) {
  return el('button.chip', { type: 'button', text: label, 'aria-pressed': String(active), onclick });
}

/* ------------------------------------------------------------------ editor */

async function openEditor(ctx, product, done) {
  const money = (p) => fmtPaise(p, ctx.settings.currencySymbol);
  const data = await ctx.store._raw();
  const cats = [...new Set(data.categories.map((c) => c.name))].sort();
  const suppliers = data.suppliers.slice().sort((a, b) => a.name.localeCompare(b.name));
  const isEdit = Boolean(product);

  const f = {
    name: textInput({ value: product?.name || '' }),
    category: selectInput([{ value: '', label: '—' }, ...cats.map((c) => ({ value: c, label: c }))], { value: product?.category || '' }),
    brand: textInput({ value: product?.brand || '' }),
    sku: textInput({ value: product?.sku || '', inputmode: 'numeric' }),
    purchasePrice: numberInput({ value: product ? (product.purchasePrice / 100).toFixed(2) : '' }),
    sellingPrice: numberInput({ value: product ? (product.sellingPrice / 100).toFixed(2) : '' }),
    mrp: numberInput({ value: product ? (product.mrp / 100).toFixed(2) : '' }),
    unit: selectInput(UNITS.map((u) => ({ value: u, label: u })), { value: product?.unit || 'piece' }),
    minStock: numberInput({ value: product ? fmtQty(product.minStockQtyMilli) : '0' }),
    supplierId: selectInput([{ value: '', label: '—' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))], { value: product?.supplierId || '' }),
    expiryDate: el('input.input', { type: 'date', value: product?.expiryDate || '' }),
    notes: el('textarea.input', { text: product?.notes || '' }),
  };
  // Opening stock only makes sense on a new product; later changes go through
  // an adjustment so the movement history always explains the quantity.
  const stockQty = numberInput({ value: product ? fmtQty(product.stockQtyMilli) : '0' });
  const adjustNote = textInput({ value: '', placeholder: t('product.adjustNote') });

  const errBox = el('p.error-text.hidden');

  const body = el('div.stack', {}, [
    errBox,
    field(t('product.name'), f.name),
    el('div.grid-2', {}, [field(t('product.category'), f.category), field(t('product.brand'), f.brand)]),
    el('div.grid-2', {}, [field(t('product.sku'), f.sku), field(t('product.unit'), f.unit)]),
    el('div.grid-3', {}, [
      field(t('product.purchasePrice'), f.purchasePrice),
      field(t('product.sellingPrice'), f.sellingPrice),
      field(t('product.mrp'), f.mrp),
    ]),
    el('div.grid-2', {}, [
      field(t('product.stock'), stockQty, { hint: isEdit ? `${t('action.history')}: ≡` : t('product.openingStock') }),
      field(t('product.minStock'), f.minStock),
    ]),
    isEdit ? field(t('product.adjustNote'), adjustNote) : null,
    el('div.grid-2', {}, [field(t('product.supplier'), f.supplierId), field(t('product.expiry'), f.expiryDate)]),
    field(t('product.notes'), f.notes),
  ]);

  const close = modal({
    title: isEdit ? t('product.editTitle') : t('product.addTitle'),
    body,
    actions: [
      isEdit
        ? {
            label: t('action.delete'),
            kind: 'danger',
            onClick: async (closeFn) => {
              const ok = await confirmDialog({ title: t('product.deleteConfirm'), message: product.name, confirmLabel: t('action.delete'), danger: true });
              if (!ok) return;
              try {
                await ctx.store.deleteProduct(product.id);
                closeFn();
                toast(t('toast.deleted'));
                done();
              } catch (e) {
                showError(e);
              }
            },
          }
        : null,
      { label: t('action.cancel'), onClick: (c) => c() },
      {
        label: t('action.save'),
        kind: 'primary',
        onClick: async (closeFn) => {
          try {
            await ctx.store.saveProduct({
              id: product?.id,
              name: f.name.value,
              category: f.category.value,
              brand: f.brand.value,
              sku: f.sku.value,
              purchasePrice: f.purchasePrice.value,
              sellingPrice: f.sellingPrice.value,
              mrp: f.mrp.value,
              unit: f.unit.value,
              minStock: f.minStock.value,
              stockQty: stockQty.value,
              adjustNote: adjustNote.value,
              supplierId: f.supplierId.value || null,
              expiryDate: f.expiryDate.value || null,
              notes: f.notes.value,
            });
            closeFn();
            toast(t('toast.saved'));
            done();
          } catch (e) {
            showError(e);
          }
        },
      },
    ].filter(Boolean),
  });

  function showError(e) {
    errBox.textContent = e?.message || t('errors.invalid');
    errBox.classList.remove('hidden');
    errBox.scrollIntoView?.({ block: 'nearest' });
  }
}

/* ----------------------------------------------------------------- history */

async function openHistory(ctx, product) {
  const movements = await ctx.store.stockHistory(product.id);
  const body = movements.length === 0
    ? el('p.muted', { text: t('customer.noLedger') })
    : el('div.table-wrap', {}, el('table.tbl', {}, [
        el('thead', {}, el('tr', {}, [
          el('th', { text: t('sale.date') }),
          el('th', { text: t('reports.product') }),
          el('th.num', { text: t('reports.qty') }),
        ])),
        el('tbody', {}, movements.slice().reverse().map((m) =>
          el('tr', {}, [
            el('td', { text: new Date(m.date).toLocaleString() }),
            el('td', { text: `${t(`product.movement.${m.type}`) || m.type}${m.note ? ` · ${m.note}` : ''}` }),
            el('td.num', { text: `${m.qtyMilli > 0 ? '+' : ''}${fmtQty(m.qtyMilli)}` }),
          ]))),
      ]));

  modal({ title: `${t('action.history')} — ${product.name}`, body, wide: true, actions: [{ label: t('action.close'), onClick: (c) => c() }] });
}
