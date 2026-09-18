/** Dashboard — the one screen a shopkeeper looks at all day. */

import { t } from '../../i18n.js';
import { el, emptyState, modal } from '../dom.js';
import { fmtPaise, fmtQty } from '../../core/money.js';
import * as reports from '../../core/reports.js';

const RANGES = ['today', 'yesterday', 'week', 'month', 'custom'];

export async function render(root, ctx) {
  const money = (p) => fmtPaise(p, ctx.settings.currencySymbol);
  const data = await ctx.store._raw();
  const preset = ctx.state.range || 'today';
  const range = reports.dateRange(preset, ctx.state.customRange || {});
  const s = reports.summarise(data, range);

  const rangeChips = el(
    'div.chips',
    {},
    RANGES.map((r) =>
      el('button.chip', {
        type: 'button',
        text: t(`range.${r}`),
        'aria-pressed': String(preset === r),
        onclick: () => {
          ctx.state.range = r;
          if (r === 'custom') {
            promptCustomRange(ctx, () => render(root, ctx));
            return;
          }
          render(root, ctx);
        },
      }),
    ),
  );

  const tiles = el('div.tiles', {}, [
    tile(t('dashboard.todaySales'), money(s.revenuePaise), `${s.salesCount} ${t('dashboard.bills')}`, 'info'),
    tile(t('dashboard.grossProfit'), money(s.grossProfitPaise), `${t('reports.revenue')} ${money(s.revenuePaise)}`, s.grossProfitPaise >= 0 ? 'ok' : 'bad'),
    tile(t('dashboard.netProfit'), money(s.netProfitPaise), `${t('dashboard.expenses')} ${money(s.expenseTotalPaise)}`, s.netProfitPaise >= 0 ? 'ok' : 'bad'),
    tile(t('dashboard.purchases'), money(s.purchaseTotalPaise), `${s.purchaseCount} ${t('purchase.title').toLowerCase()}`, ''),
    tile(t('dashboard.cashSales'), money(s.cashPaise), '', ''),
    tile(t('dashboard.upiSales'), money(s.upiPaise), '', ''),
    tile(t('dashboard.creditSales'), money(s.creditPaise), '', 'warn'),
    tile(t('dashboard.collections'), money(s.collectionsPaise), '', 'ok'),
    tile(t('dashboard.customerDues'), money(s.totalCustomerDuesPaise), '', s.totalCustomerDuesPaise > 0 ? 'warn' : ''),
    tile(t('dashboard.supplierPayable'), money(s.totalSupplierPayablePaise), '', ''),
  ]);

  const alerts = reports.stockAlerts(data);
  const stockCard = el('div.card', {}, [
    el('div.card-head', {}, [el('h2', { text: `${t('dashboard.lowStock')} · ${t('dashboard.outOfStock')}` })]),
    alerts.out.length === 0 && alerts.low.length === 0
      ? el('p.muted', { text: t('dashboard.noStockAlerts') })
      : el(
          'div.list',
          {},
          [
            ...alerts.out.map((p) => stockRow(p, t('dashboard.outOfStock'), 'danger')),
            ...alerts.low.map((p) => stockRow(p, t('dashboard.lowStock'), 'warn')),
          ].slice(0, 12),
        ),
  ]);

  const top = reports.topProducts(data, range, 5);
  const topCard = el('div.card', {}, [
    el('div.card-head', {}, [el('h2', { text: t('dashboard.topProducts') })]),
    top.length === 0
      ? el('p.muted', { text: t('dashboard.noData') })
      : el(
          'div.list',
          {},
          top.map((p) =>
            el('div.list-item', {}, [
              el('div.main', {}, [
                el('div.t.truncate', { text: p.name }),
                el('div.d', { text: `${p.qtyLabel} ${p.unit} · ${t('reports.profitCol')} ${money(p.profitPaise)}` }),
              ]),
              el('div.amt', { text: money(p.revenuePaise) }),
            ]),
          ),
        ),
  ]);

  const recent = reports.recentTransactions(data, 8);
  const recentCard = el('div.card', {}, [
    el('div.card-head', {}, [el('h2', { text: t('dashboard.recent') })]),
    recent.length === 0
      ? el('p.muted', { text: t('dashboard.noData') })
      : el(
          'div.list',
          {},
          recent.map((r) =>
            el('div.list-item', { style: { cursor: 'pointer' }, onclick: () => openTransaction(ctx, r) }, [
              el('div.main', {}, [
                el('div.t.truncate', { text: r.label }),
                el('div.d.truncate', { text: `${r.party} · ${new Date(r.date).toLocaleString()}` }),
              ]),
              el(`div.amt.${r.amountPaise < 0 ? 'neg' : 'pos'}`, { text: money(r.amountPaise) }),
            ]),
          ),
        ),
  ]);

  root.replaceChildren(
    el('div.stack', {}, [
      el('div.row.between', {}, [el('span.small.muted', { text: t('dashboard.range') }), rangeChips]),
      ctx.state.range === 'custom' && ctx.state.customRange
        ? el('p.small.muted', { text: `${ctx.state.customRange.from} → ${ctx.state.customRange.to}` })
        : null,
      tiles,
      stockCard,
      topCard,
      recentCard,
    ]),
  );
}

function tile(key, value, sub = '', tone = '') {
  return el(`div.tile.${tone}`, {}, [
    el('div.k', { text: key }),
    el('div.v', { text: value }),
    sub ? el('div.s', { text: sub }) : null,
  ]);
}

function stockRow(p, label, tone) {
  return el('div.list-item', {}, [
    el('div.main', {}, [
      el('div.t.truncate', { text: p.name }),
      el('div.d', { text: `${t('product.minStock')}: ${fmtQty(p.minStockQtyMilli)} ${p.unit}` }),
    ]),
    el(`span.badge.${tone}`, { text: `${label} · ${fmtQty(p.stockQtyMilli)}` }),
  ]);
}

function promptCustomRange(ctx, done) {
  const from = el('input.input', { type: 'date', value: ctx.state.customRange?.from || '' });
  const to = el('input.input', { type: 'date', value: ctx.state.customRange?.to || '' });
  modal({
    title: t('range.custom'),
    body: el('div.stack', {}, [from, to]),
    actions: [
      { label: t('action.cancel'), onClick: (close) => { ctx.state.range = 'today'; close(); done(); } },
      {
        label: t('action.apply'),
        kind: 'primary',
        onClick: (close) => {
          if (!from.value || !to.value) return;
          ctx.state.customRange = { from: from.value, to: to.value };
          close();
          done();
        },
      },
    ],
  });
}

function openTransaction(ctx, row) {
  if (row.kind === 'sale') ctx.navigate(`#/sale/${row.id}`);
  else if (row.kind === 'purchase') ctx.navigate('#/purchases');
  else ctx.navigate('#/expenses');
}
