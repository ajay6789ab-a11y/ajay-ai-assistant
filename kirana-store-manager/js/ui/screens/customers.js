/** Customers & udhaar ledger. */

import { t } from '../../i18n.js';
import { el, emptyState, modal, toast, field, textInput, numberInput, selectInput } from '../dom.js';
import { fmtPaise } from '../../core/money.js';
import { PAYMENT_MODES } from '../../core/store.js';
import { shareText } from '../../core/backup.js';

export async function render(root, ctx) {
  const money = (p) => fmtPaise(p, ctx.settings.currencySymbol);
  const redraw = async () => {
    const customers = await ctx.store.listCustomers();
    root.replaceChildren(
      el('div.stack', {}, [
        el('div.row', {}, [
          el('div.grow', {}, el('h1', { text: t('customer.title') })),
          el('button.btn.primary', { type: 'button', text: '+', 'aria-label': t('customer.addTitle'), onclick: () => openEditor(ctx, null, redraw) }),
        ]),
        el('div.card', {}, customers.length === 0
          ? emptyState(t('customer.empty'), el('button.btn.primary', { type: 'button', text: t('customer.addTitle'), onclick: () => openEditor(ctx, null, redraw) }))
          : el('div.list', {}, customers.map((c) =>
              el('div.list-item', {}, [
                el('div.main', { style: { cursor: 'pointer' }, onclick: () => openLedger(ctx, c, redraw) }, [
                  el('div.t.truncate', { text: c.name }),
                  el('div.d.truncate', { text: c.mobile || '—' }),
                ]),
                el('div.right', {}, [
                  el(`div.amt.${c.outstandingPaise > 0 ? 'neg' : 'pos'}`, { text: money(c.outstandingPaise) }),
                  el('div.small.muted', { text: c.outstandingPaise > 0 ? t('customer.outstanding') : t('customer.allSettled') }),
                ]),
                el('button.icon-btn', { type: 'button', 'aria-label': t('action.edit'), text: '✎', onclick: () => openEditor(ctx, c, redraw) }),
              ])))),
      ]),
    );
  };
  await redraw();
}

async function openEditor(ctx, customer, done) {
  const f = {
    name: textInput({ value: customer?.name || '' }),
    mobile: textInput({ value: customer?.mobile || '', inputmode: 'tel' }),
    address: textInput({ value: customer?.address || '' }),
    notes: el('textarea.input', { text: customer?.notes || '' }),
  };
  const err = el('p.error-text.hidden');
  modal({
    title: customer ? t('customer.editTitle') : t('customer.addTitle'),
    body: el('div.stack', {}, [
      err,
      field(t('customer.name'), f.name),
      field(t('customer.mobile'), f.mobile),
      field(t('customer.address'), f.address),
      field(t('customer.notes'), f.notes),
    ]),
    actions: [
      { label: t('action.cancel'), onClick: (c) => c() },
      {
        label: t('action.save'),
        kind: 'primary',
        onClick: async (c) => {
          try {
            await ctx.store.saveCustomer({ id: customer?.id, name: f.name.value, mobile: f.mobile.value, address: f.address.value, notes: f.notes.value });
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

async function openLedger(ctx, customer, done) {
  const money = (p) => fmtPaise(p, ctx.settings.currencySymbol);
  const [ledger, summary] = await Promise.all([
    ctx.store.customerLedger(customer.id),
    ctx.store.customerSummary(customer.id),
  ]);

  const body = el('div.stack', {}, [
    el('div.tiles', {}, [
      el('div.tile', {}, [el('div.k', { text: t('customer.billed') }), el('div.v', { text: money(summary.billedPaise) })]),
      el('div.tile.ok', {}, [el('div.k', { text: t('customer.paid') }), el('div.v', { text: money(summary.paidPaise) })]),
      el('div.tile.warn', {}, [el('div.k', { text: t('customer.outstanding') }), el('div.v', { text: money(summary.outstandingPaise) })]),
    ]),
    ledger.length === 0
      ? el('p.muted', { text: t('customer.noLedger') })
      : el('div.list', {}, ledger.map((e) =>
          el('div.list-item', {}, [
            el('div.main', {}, [
              el('div.t.truncate', { text: e.label }),
              el('div.d', { text: new Date(e.date).toLocaleString() }),
            ]),
            el('div.right', {}, [
              el(`div.amt.${e.creditPaise > 0 ? 'pos' : 'neg'}`, { text: e.creditPaise > 0 ? `− ${money(e.creditPaise)}` : money(e.debitPaise) }),
              el('div.small.muted', { text: money(e.balancePaise) }),
            ]),
          ]))),
  ]);

  modal({
    title: `${t('customer.ledger')} — ${customer.name}`,
    body,
    wide: true,
    actions: [
      { label: t('action.share'), onClick: async (c) => {
        const text = [
          `${ctx.settings.shopName} — ${t('customer.statement')}`,
          `${t('customer.name')}: ${customer.name}`,
          '',
          ...ledger.map((e) => `${new Date(e.date).toLocaleDateString()}  ${e.label}  ${e.debitPaise ? money(e.debitPaise) : ''}${e.creditPaise ? ` −${money(e.creditPaise)}` : ''}  = ${money(e.balancePaise)}`),
          '',
          `${t('customer.outstanding')}: ${money(summary.outstandingPaise)}`,
        ].join('\n');
        const result = await shareText(`${customer.name} — ${t('customer.statement')}`, text);
        toast(t(`toast.${result === 'unsupported' ? 'unsupported' : result === 'copied' ? 'copied' : 'shared'}`), result === 'unsupported' ? 'error' : 'ok');
      } },
      { label: t('action.addPayment'), kind: 'primary', onClick: (c) => { c(); openPayment(ctx, customer, done); } },
      { label: t('action.close'), onClick: (c) => c() },
    ],
  });
}

function openPayment(ctx, customer, done) {
  const amount = numberInput({ value: '' });
  const mode = selectInput(PAYMENT_MODES.filter((m) => m !== 'credit').map((m) => ({ value: m, label: t(`sale.${m}`) })));
  const date = el('input.input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
  const notes = textInput({});
  const err = el('p.error-text.hidden');

  modal({
    title: `${t('action.addPayment')} — ${customer.name}`,
    body: el('div.stack', {}, [
      err,
      field(t('expense.amount'), amount),
      el('div.grid-2', {}, [field(t('sale.paymentMode'), mode), field(t('sale.date'), date)]),
      field(t('expense.note'), notes),
    ]),
    actions: [
      { label: t('action.cancel'), onClick: (c) => c() },
      {
        label: t('action.save'),
        kind: 'primary',
        onClick: async (c) => {
          try {
            await ctx.store.recordPayment({
              partyType: 'customer', partyId: customer.id,
              amount: amount.value, mode: mode.value, date: date.value, notes: notes.value,
            });
            c();
            toast(t('toast.paymentDone'));
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
