/** Sales — bill list, the fast New Sale screen, invoice, returns and voids. */

import { t } from '../../i18n.js';
import { el, emptyState, modal, confirmDialog, toast, field, textInput, numberInput, selectInput, replace } from '../dom.js';
import { fmtPaise, fmtQty, lineTotalPaise, toMilli, toPaise } from '../../core/money.js';
import { PAYMENT_MODES } from '../../core/store.js';
import { shareText } from '../../core/backup.js';

/* ---------------------------------------------------------------- bill list */

export async function render(root, ctx) {
  const money = (p) => fmtPaise(p, ctx.settings.currencySymbol);
  const state = ctx.state.sales || (ctx.state.sales = { q: '', status: '' });

  const redraw = async () => {
    const sales = await ctx.store.listSales({ q: state.q || undefined, status: state.status || undefined });
    const search = textInput({
      value: state.q,
      placeholder: `${t('sale.billNo')} / ${t('customer.title')}`,
      oninput: (e) => { state.q = e.target.value; redraw(); },
    });

    root.replaceChildren(
      el('div.stack', {}, [
        el('div.row', {}, [
          el('div.grow', {}, search),
          el('button.btn.primary', { type: 'button', text: `+ ${t('action.newSale')}`, onclick: () => ctx.navigate('#/sale/new') }),
        ]),
        el('div.chips', {}, [
          chip(t('product.filterAll'), state.status === '', () => { state.status = ''; redraw(); }),
          chip(t('sale.title'), state.status === 'completed', () => { state.status = 'completed'; redraw(); }),
          chip(t('sale.returned'), state.status === 'returned', () => { state.status = 'returned'; redraw(); }),
          chip(t('sale.voided'), state.status === 'void', () => { state.status = 'void'; redraw(); }),
        ]),
        el('div.card', {}, sales.length === 0
          ? emptyState(t('sale.noBills'), el('button.btn.primary', { type: 'button', text: `+ ${t('action.newSale')}`, onclick: () => ctx.navigate('#/sale/new') }))
          : el('div.list', {}, sales.map((s) =>
              el('div.list-item', { style: { cursor: 'pointer' }, onclick: () => ctx.navigate(`#/sale/${s.id}`) }, [
                el('div.main', {}, [
                  el('div.t.truncate', { text: `${s.billNo} · ${s.customerName || t('sale.walkIn')}` }),
                  el('div.d.truncate', { text: `${new Date(s.date).toLocaleString()} · ${t(`sale.${s.paymentMode}`)}` }),
                ]),
                el('div.right', {}, [
                  el('div.amt', { text: money(s.totalPaise) }),
                  s.status !== 'completed' ? el(`span.badge.${s.status === 'void' ? 'danger' : 'warn'}`, { text: t(`sale.${s.status}`) }) : null,
                ]),
              ])))),
      ]),
    );
  };

  await redraw();
}

function chip(label, active, onclick) {
  return el('button.chip', { type: 'button', text: label, 'aria-pressed': String(active), onclick });
}

/* --------------------------------------------------------------- new sale */

export async function renderNewSale(root, ctx) {
  const money = (p) => fmtPaise(p, ctx.settings.currencySymbol);
  const cart = [];
  let paymentMode = 'cash';
  let customerId = '';
  let orderDiscount = 0;

  const [products, customers] = await Promise.all([ctx.store.listProducts(), ctx.store.listCustomers()]);

  const cartBox = el('div.stack');
  const totalsBox = el('div.totals');
  const errBox = el('p.error-text.hidden');
  const searchInput = textInput({ placeholder: t('sale.searchPlaceholder') });
  const resultsBox = el('div.stack');

  const customerSelect = selectInput(
    [{ value: '', label: t('sale.walkIn') }, ...customers.map((c) => ({ value: c.id, label: `${c.name}${c.outstandingPaise > 0 ? ` (${fmtPaise(c.outstandingPaise)})` : ''}` }))],
    { value: '', onchange: (e) => { customerId = e.target.value; renderTotals(); } },
  );

  const payButtons = PAYMENT_MODES.map((m) =>
    el('button.pay-mode', {
      type: 'button',
      text: t(`sale.${m}`),
      'aria-pressed': String(m === paymentMode),
      onclick: () => {
        paymentMode = m;
        payButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === t(`sale.${m}`))));
        renderTotals();
      },
    }),
  );

  const advanceInput = numberInput({ value: '0' });
  const discountInput = numberInput({ value: '0', oninput: (e) => { orderDiscount = safePaise(e.target.value); renderTotals(); } });

  function safePaise(v) {
    try { return toPaise(v); } catch { return 0; }
  }

  async function addProduct(product, qty = '1') {
    const existing = cart.find((l) => l.productId === product.id);
    if (existing) {
      existing.qtyMilli += toMilli(qty);
    } else {
      cart.push({
        productId: product.id,
        name: product.name,
        unit: product.unit,
        stockQtyMilli: product.stockQtyMilli,
        qtyMilli: toMilli(qty),
        pricePaise: product.sellingPrice,
        discountPaise: 0,
      });
    }
    renderCart();
  }

  async function lookup(query) {
    const q = query.trim();
    if (!q) { resultsBox.replaceChildren(); return; }
    // Exact barcode/SKU wins outright — that is the scanning path.
    const bySku = await ctx.store.findBySku(q);
    if (bySku) {
      await addProduct(bySku);
      searchInput.value = '';
      resultsBox.replaceChildren();
      return;
    }
    const matches = (await ctx.store.listProducts({ q })).slice(0, 8);
    replace(
      resultsBox,
      matches.length === 0
        ? el('p.small.muted', { text: t('product.noResults') })
        : matches.map((p) =>
            el('button.btn.soft.block', {
              type: 'button',
              style: { justifyContent: 'space-between', textAlign: 'left' },
              onclick: async () => { await addProduct(p); searchInput.value = ''; resultsBox.replaceChildren(); },
            }, [
              el('span.truncate', { text: `${p.name} · ${fmtQty(p.stockQtyMilli)} ${p.unit} ${t('sale.stockLeft')}` }),
              el('span.nowrap', { text: money(p.sellingPrice) }),
            ]),
          ),
    );
  }

  searchInput.addEventListener('input', (e) => lookup(e.target.value));
  searchInput.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const matches = await ctx.store.listProducts({ q: searchInput.value.trim() });
    if (matches.length === 1) { await addProduct(matches[0]); searchInput.value = ''; resultsBox.replaceChildren(); }
    else lookup(searchInput.value);
  });

  function renderCart() {
    if (cart.length === 0) {
      cartBox.replaceChildren(el('p.muted', { text: t('sale.empty') }));
      renderTotals();
      return;
    }
    replace(
      cartBox,
      cart.map((line, index) => {
        const qtyInput = numberInput({ value: fmtQty(line.qtyMilli), oninput: (e) => { line.qtyMilli = safeMilli(e.target.value); renderTotals(); } });
        const priceInput = numberInput({ value: (line.pricePaise / 100).toFixed(2), oninput: (e) => { line.pricePaise = safePaise(e.target.value); renderTotals(); } });
        const discInput = numberInput({ value: (line.discountPaise / 100).toFixed(2), oninput: (e) => { line.discountPaise = safePaise(e.target.value); renderTotals(); } });
        return el('div.cart-line', {}, [
          el('div', {}, [
            el('div.nm.truncate', { text: line.name }),
            el('div.meta', { text: `${fmtQty(line.stockQtyMilli)} ${line.unit} ${t('sale.stockLeft')} · ${money(line.pricePaise)}/${line.unit}` }),
          ]),
          el('div.row', {}, [
            el('div.amt.nowrap', { text: money(lineTotal(line)) }),
            el('button.icon-btn', { type: 'button', 'aria-label': t('action.delete'), text: '×', onclick: () => { cart.splice(index, 1); renderCart(); } }),
          ]),
          el('div.inputs', {}, [
            field(t('sale.qty'), qtyInput),
            field(t('sale.price'), priceInput),
            field(t('sale.discount'), discInput),
          ]),
        ]);
      }),
    );
    renderTotals();
  }

  function safeMilli(v) {
    try { return toMilli(v); } catch { return 0; }
  }

  function lineTotal(line) {
    return Math.max(0, lineTotalPaise(line.qtyMilli, line.pricePaise) - line.discountPaise);
  }

  function totals() {
    const subtotal = cart.reduce((n, l) => n + lineTotalPaise(l.qtyMilli, l.pricePaise), 0);
    const itemDiscount = cart.reduce((n, l) => n + l.discountPaise, 0);
    const grand = Math.max(0, subtotal - itemDiscount - orderDiscount);
    return { subtotal, itemDiscount, grand };
  }

  function renderTotals() {
    const { subtotal, itemDiscount, grand } = totals();
    replace(
      totalsBox,
      el('div.line', {}, [el('span', { text: t('sale.subtotal') }), el('span', { text: money(subtotal) })]),
      itemDiscount > 0 ? el('div.line', {}, [el('span.muted', { text: t('sale.discount') }), el('span', { text: `− ${money(itemDiscount)}` })]) : null,
      orderDiscount > 0 ? el('div.line', {}, [el('span.muted', { text: `${t('sale.discount')} (${t('sale.title')})` }), el('span', { text: `− ${money(orderDiscount)}` })]) : null,
      el('div.line.grand', {}, [el('span', { text: t('sale.grandTotal') }), el('span', { text: money(grand) })]),
    );
    advanceInput.closest('.field')?.classList.toggle('hidden', paymentMode !== 'credit');
  }

  async function complete() {
    errBox.classList.add('hidden');
    try {
      const { sale } = await ctx.store.createSale({
        customerId: customerId || null,
        paymentMode,
        discount: orderDiscount / 100,
        advance: paymentMode === 'credit' ? advanceInput.value : 0,
        items: cart.map((l) => ({
          productId: l.productId,
          qty: fmtQty(l.qtyMilli),
          price: l.pricePaise / 100,
          discount: l.discountPaise / 100,
        })),
      });
      toast(t('toast.saleDone'));
      ctx.navigate(`#/sale/${sale.id}`);
    } catch (e) {
      errBox.textContent = e?.message || t('errors.invalid');
      errBox.classList.remove('hidden');
      errBox.scrollIntoView?.({ block: 'nearest' });
    }
  }

  root.replaceChildren(
    el('div.stack', {}, [
      errBox,
      el('div.card', {}, [
        el('div.card-head', {}, [el('h2', { text: t('sale.addItem') })]),
        el('div.row', {}, [
          el('div.grow', {}, searchInput),
          el('button.btn.soft', { type: 'button', text: t('action.scan'), onclick: () => scanBarcode(ctx, async (code) => { await lookup(code); }) }),
        ]),
        resultsBox,
      ]),
      el('div.card', {}, [
        el('div.card-head', {}, [el('h2', { text: t('sale.title') })]),
        cartBox,
        el('div.grid-2', {}, [field(t('sale.discount'), discountInput)]),
        totalsBox,
      ]),
      el('div.card', {}, [
        el('div.card-head', {}, [el('h2', { text: t('sale.paymentMode') })]),
        el('div.pay-modes', {}, payButtons),
        el('div.stack', { style: { marginTop: '12px' } }, [
          field(t('sale.customer'), customerSelect),
          el('button.btn.soft.sm', { type: 'button', text: `+ ${t('sale.newCustomer')}`, onclick: () => quickAddCustomer(ctx, async (id) => {
            const fresh = await ctx.store.listCustomers();
            customerSelect.replaceChildren(
              el('option', { value: '', text: t('sale.walkIn') }),
              ...fresh.map((c) => el('option', { value: c.id, text: c.name })),
            );
            customerSelect.value = id;
            customerId = id;
          }) }),
          field(t('sale.advance'), advanceInput),
        ]),
        el('button.btn.primary.block', { type: 'button', style: { marginTop: '12px' }, text: t('sale.complete'), onclick: complete }),
      ]),
    ]),
  );

  renderCart();
  renderTotals();
  searchInput.focus();
}

/**
 * Camera barcode scanning with the native BarcodeDetector. If the browser has
 * no detector (or no camera permission) we fall back to typing the code — the
 * app never depends on a paid scanning service.
 */
async function scanBarcode(ctx, onCode) {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
    manualBarcode(onCode);
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = el('video', { autoplay: '', playsinline: '', muted: '', style: { width: '100%', borderRadius: '12px', background: '#000' } });
    video.srcObject = stream;
    const status = el('p.small.muted', { text: t('action.scan') });
    const close = modal({
      title: t('action.scan'),
      body: el('div.stack', {}, [video, status]),
      actions: [
        { label: t('action.manualEntry'), onClick: (c) => { stop(); c(); manualBarcode(onCode); } },
        { label: t('action.cancel'), onClick: (c) => { stop(); c(); } },
      ],
    });
    const stop = () => stream.getTracks().forEach((tr) => tr.stop());
    await video.play();
    // eslint-disable-next-line no-undef
    const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'] });
    const tick = async () => {
      try {
        const codes = await detector.detect(video);
        if (codes.length) {
          stop();
          close();
          onCode(codes[0].rawValue);
          return;
        }
      } catch { /* keep trying */ }
      if (!stream.active) return;
      setTimeout(tick, 320);
    };
    tick();
  } catch {
    manualBarcode(onCode);
  }
}

function manualBarcode(onCode) {
  const input = textInput({ placeholder: t('product.sku'), inputmode: 'numeric' });
  modal({
    title: t('action.manualEntry'),
    body: field(t('product.sku'), input),
    actions: [
      { label: t('action.cancel'), onClick: (c) => c() },
      {
        label: t('action.apply'),
        kind: 'primary',
        onClick: (c) => {
          if (!input.value.trim()) return;
          const code = input.value.trim();
          c();
          onCode(code);
        },
      },
    ],
  });
}

async function quickAddCustomer(ctx, done) {
  const name = textInput({});
  const mobile = textInput({ inputmode: 'tel' });
  modal({
    title: t('sale.newCustomer'),
    body: el('div.stack', {}, [field(t('customer.name'), name), field(t('customer.mobile'), mobile)]),
    actions: [
      { label: t('action.cancel'), onClick: (c) => c() },
      {
        label: t('action.save'),
        kind: 'primary',
        onClick: async (c) => {
          try {
            const customer = await ctx.store.saveCustomer({ name: name.value, mobile: mobile.value });
            c();
            toast(t('toast.saved'));
            done(customer.id);
          } catch (e) { toast(e?.message || t('errors.invalid'), 'error'); }
        },
      },
    ],
  });
}

/* ---------------------------------------------------------------- invoice */

export async function renderSale(root, ctx, saleId) {
  const money = (p) => fmtPaise(p, ctx.settings.currencySymbol);
  const sale = await ctx.store.getSale(saleId);
  if (!sale) {
    root.replaceChildren(emptyState(t('sale.noBills'), el('button.btn.primary', { type: 'button', text: t('action.back'), onclick: () => ctx.navigate('#/sales') })));
    return;
  }

  const invoice = el('div.card.invoice', {}, [
    el('div.shop-head', {}, [
      el('h2', { text: ctx.settings.shopName }),
      ctx.settings.address ? el('p.small.muted', { text: ctx.settings.address }) : null,
      ctx.settings.mobile ? el('p.small.muted', { text: ctx.settings.mobile }) : null,
      ctx.settings.gstin ? el('p.small.muted', { text: `GSTIN: ${ctx.settings.gstin}` }) : null,
    ]),
    el('div.meta-grid', {}, [
      el('div', {}, [el('strong', { text: t('sale.billNo') }), el('div', { text: sale.billNo })]),
      el('div.right', {}, [el('strong', { text: t('sale.date') }), el('div', { text: new Date(sale.date).toLocaleString() })]),
      el('div', {}, [el('strong', { text: t('sale.customer') }), el('div', { text: sale.customerName || t('sale.walkIn') })]),
      el('div.right', {}, [el('strong', { text: t('sale.paymentMode') }), el('div', { text: t(`sale.${sale.paymentMode}`) })]),
    ]),
    el('div.table-wrap', {}, el('table.tbl', {}, [
      el('thead', {}, el('tr', {}, [
        el('th', { text: t('reports.product') }),
        el('th.num', { text: t('reports.qty') }),
        el('th.num', { text: t('sale.price') }),
        el('th.num', { text: t('sale.total') }),
      ])),
      el('tbody', {}, sale.lines.map((l) =>
        el('tr', {}, [
          el('td', { text: l.productName + ((l.returnedQtyMilli || 0) > 0 ? ` (${t('sale.returned')}: ${fmtQty(l.returnedQtyMilli)})` : '') }),
          el('td.num', { text: `${fmtQty(l.qtyMilli)} ${l.unit}` }),
          el('td.num', { text: money(l.pricePaise) }),
          el('td.num', { text: money(l.totalPaise) }),
        ]))),
      el('tfoot', {}, [
        sale.itemDiscountPaise ? el('tr', {}, [el('td', { text: t('sale.discount'), colspan: '3' }), el('td.num', { text: `− ${money(sale.itemDiscountPaise)}` })]) : null,
        sale.discountPaise ? el('tr', {}, [el('td', { text: `${t('sale.discount')} (${t('sale.title')})`, colspan: '3' }), el('td.num', { text: `− ${money(sale.discountPaise)}` })]) : null,
        el('tr', {}, [el('td', { text: t('sale.grandTotal'), colspan: '3' }), el('td.num', { text: money(sale.totalPaise) })]),
        sale.amountPaidPaise ? el('tr', {}, [el('td', { text: t('sale.advance'), colspan: '3' }), el('td.num', { text: money(sale.amountPaidPaise) })]) : null,
      ]),
    ])),
    sale.status !== 'completed'
      ? el('p', {}, el(`span.badge.${sale.status === 'void' ? 'danger' : 'warn'}`, { text: `${t(`sale.${sale.status}`)}${sale.voidReason ? ` — ${sale.voidReason}` : ''}` }))
      : null,
    sale.notes ? el('p.small.muted', { text: sale.notes }) : null,
  ]);

  const actions = el('div.row.wrap', {}, [
    el('button.btn', { type: 'button', text: t('action.print'), onclick: () => window.print() }),
    el('button.btn', { type: 'button', text: t('action.share'), onclick: async () => {
      const result = await shareText(`${ctx.settings.shopName} — ${sale.billNo}`, invoiceText(sale, ctx));
      toast(t(`toast.${result === 'shared' ? 'shared' : result === 'copied' ? 'copied' : 'unsupported'}`), result === 'unsupported' ? 'error' : 'ok');
    } }),
    sale.status === 'completed' ? el('button.btn', { type: 'button', text: t('action.return'), onclick: () => openReturn(ctx, sale, () => renderSale(root, ctx, saleId)) }) : null,
    sale.status === 'completed' ? el('button.btn.danger', { type: 'button', text: t('action.void'), onclick: async () => {
      const ok = await confirmDialog({ title: t('sale.confirmVoid'), message: sale.billNo, confirmLabel: t('action.void'), danger: true });
      if (!ok) return;
      await ctx.store.voidSale(sale.id, 'cancelled from bill screen');
      toast(t('toast.voidDone'));
      renderSale(root, ctx, saleId);
    } }) : null,
  ]);

  root.replaceChildren(el('div.stack', {}, [invoice, el('div.no-print', {}, actions)]));
}

function invoiceText(sale, ctx) {
  const money = (p) => fmtPaise(p, ctx.settings.currencySymbol);
  const lines = sale.lines.map((l) => `${l.productName} — ${fmtQty(l.qtyMilli)} ${l.unit} × ${money(l.pricePaise)} = ${money(l.totalPaise)}`);
  return [
    ctx.settings.shopName,
    ctx.settings.address,
    `${t('sale.billNo')}: ${sale.billNo}`,
    `${t('sale.date')}: ${new Date(sale.date).toLocaleString()}`,
    `${t('sale.customer')}: ${sale.customerName || t('sale.walkIn')}`,
    '',
    ...lines,
    '',
    `${t('sale.grandTotal')}: ${money(sale.totalPaise)}`,
    `${t('sale.paymentMode')}: ${t(`sale.${sale.paymentMode}`)}`,
  ].filter(Boolean).join('\n');
}

function openReturn(ctx, sale, done) {
  const returnable = sale.lines
    .map((l) => ({ line: l, left: l.qtyMilli - (l.returnedQtyMilli || 0) }))
    .filter((x) => x.left > 0);

  if (returnable.length === 0) {
    toast(t('sale.noBills'), 'error');
    return;
  }

  const inputs = returnable.map((x) => ({
    x,
    input: numberInput({ value: '0' }),
  }));
  const reason = textInput({ value: '' });

  modal({
    title: t('sale.returnTitle'),
    body: el('div.stack', {}, [
      ...inputs.map(({ x, input }) =>
        el('div.row.between', {}, [
          el('div.grow', {}, [
            el('div', { text: x.line.productName }),
            el('div.small.muted', { text: `${t('sale.returns')}: max ${fmtQty(x.left)} ${x.line.unit}` }),
          ]),
          el('div', { style: { width: '110px' } }, input),
        ])),
      field(t('sale.returnReason'), reason),
    ]),
    actions: [
      { label: t('action.cancel'), onClick: (c) => c() },
      {
        label: t('sale.confirmReturn'),
        kind: 'primary',
        onClick: async (c) => {
          const items = inputs
            .filter(({ input }) => parseFloat(input.value || '0') > 0)
            .map(({ x, input }) => ({ saleItemId: x.line.id, qty: input.value }));
          if (items.length === 0) { toast(t('sale.empty'), 'error'); return; }
          try {
            await ctx.store.returnSale(sale.id, { items, reason: reason.value });
            c();
            toast(t('toast.returnDone'));
            done();
          } catch (e) { toast(e?.message || t('errors.invalid'), 'error'); }
        },
      },
    ],
  });
}
