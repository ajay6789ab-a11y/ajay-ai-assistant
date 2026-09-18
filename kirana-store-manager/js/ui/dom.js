/** Tiny DOM helpers — no framework, no build step. */

/**
 * el('div.card', { onclick }, [children])
 *   tag   — 'tag', 'tag.class', 'tag.class.other' or '#id'
 *   attrs — plain properties/attributes; `html` sets innerHTML
 *   kids  — a node, an array, a string, or null
 */
export function el(spec, attrs = {}, kids = []) {
  const [tagPart, ...classParts] = String(spec).split('.');
  let tag = tagPart;
  let id = null;
  if (tagPart.startsWith('#')) {
    id = tagPart.slice(1);
    tag = 'div';
  }
  const node = document.createElement(tag || 'div');
  if (id) node.id = id;
  if (classParts.length) node.className = classParts.join(' ');

  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = `${node.className} ${value}`.trim();
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key in node && key !== 'list') node[key] = value;
    else node.setAttribute(key, value);
  }

  append(node, kids);
  return node;
}

export function append(parent, kids) {
  const list = Array.isArray(kids) ? kids : [kids];
  for (const kid of list) {
    if (kid === null || kid === undefined || kid === false) continue;
    parent.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return parent;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/**
 * Safe replacement for the native `replaceChildren`.
 *
 * The DOM version stringifies anything that is not a Node, which silently
 * produces "[object HTMLDivElement]" for an array and the literal text "null"
 * for a conditional child. This flattens arrays and drops nullish entries.
 */
export function replace(parent, ...kids) {
  clear(parent);
  return append(parent, kids.flat(Infinity));
}

/* ------------------------------------------------------------------ toast */

let toastTimer = null;

export function toast(message, kind = 'ok') {
  let host = document.getElementById('toast');
  if (!host) {
    host = el('#toast.toast');
    document.body.append(host);
  }
  host.textContent = message;
  host.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => host.classList.remove('show'), 2600);
}

/* ------------------------------------------------------------------ modal */

/**
 * Open a sheet/modal. Returns a close() function.
 * `onClose` runs when the user dismisses it without submitting.
 */
export function modal({ title, body, actions = [], wide = false, onClose }) {
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      close();
      onClose?.();
    }
  };

  const actionNodes = actions.map((a) =>
    el(`button.btn.${a.kind || 'ghost'}`, {
      type: 'button',
      text: a.label,
      onclick: () => a.onClick?.(close),
    }),
  );

  const card = el('div.sheet-card', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
    el('div.sheet-head', {}, [el('h3', { text: title }), el('button.icon-btn', { type: 'button', 'aria-label': 'Close', text: '×',
      onclick: () => { close(); onClose?.(); } })]),
    el('div.sheet-body', {}, body),
    actionNodes.length ? el('div.sheet-actions', {}, actionNodes) : null,
  ]);

  const backdrop = el('div.sheet-backdrop', { onclick: (e) => { if (e.target === backdrop) { close(); onClose?.(); } } }, [
    el(wide ? 'div.sheet.wide' : 'div.sheet', {}, card),
  ]);

  document.body.append(backdrop);
  document.addEventListener('keydown', onKey);
  const focusable = card.querySelector('input, select, textarea, button');
  focusable?.focus();
  return close;
}

/** Yes/No prompt that resolves with a boolean. */
export function confirmDialog({ title, message, confirmLabel = 'OK', danger = false, promptText = null }) {
  return new Promise((resolve) => {
    let input = null;
    const body = el('div.stack', {}, [
      el('p.muted', { text: message }),
      promptText ? (input = el('input.input', { type: 'text', placeholder: promptText, autocomplete: 'off' })) : null,
    ]);
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    modal({
      title,
      body,
      onClose: () => finish(promptText ? null : false),
      actions: [
        { label: 'Cancel', onClick: (close) => { close(); finish(promptText ? null : false); } },
        {
          label: confirmLabel,
          kind: danger ? 'danger' : 'primary',
          onClick: (close) => {
            if (promptText && input.value.trim() !== promptText) {
              input.classList.add('error');
              input.focus();
              return;
            }
            close();
            finish(promptText ? true : true);
          },
        },
      ],
    });
  });
}

/* ------------------------------------------------------------------- forms */

export function field(label, control, { hint = null, error = null } = {}) {
  return el('label.field', {}, [
    el('span.field-label', { text: label }),
    control,
    hint ? el('small.hint', { text: hint }) : null,
    error ? el('small.error-text', { text: error }) : null,
  ]);
}

export function textInput(attrs = {}) {
  return el('input.input', { type: 'text', inputmode: 'text', autocomplete: 'off', ...attrs });
}

export function numberInput(attrs = {}) {
  return el('input.input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', ...attrs });
}

export function selectInput(options, attrs = {}) {
  const node = el('select.input', attrs);
  for (const opt of options) {
    node.append(el('option', { value: opt.value ?? '', text: opt.label }));
  }
  if (attrs.value !== undefined) node.value = String(attrs.value ?? '');
  return node;
}

export function emptyState(message, actionNode = null) {
  return el('div.empty', {}, [el('div.empty-icon', { text: '○' }), el('p', { text: message }), actionNode]);
}

// Money formatting lives in core/money.js (fmtPaise) — there is deliberately no
// second implementation here, so a screen can never disagree with a report.
