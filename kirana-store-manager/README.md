# Kirana Store Manager

A **free, offline-first** store management app for small and medium Indian grocery
(kirana) shops. Billing, stock, udhaar ledger, purchases, expenses, reports and
backup — all of it works with **no internet, no account, no paid service**.

Built with plain **HTML5 + CSS3 + Vanilla JavaScript** and **IndexedDB**. No build
step, no framework, no bundler. Open `index.html` and it runs.

---

## Quick start

```bash
cd kirana-store-manager
python3 -m http.server 8080 --bind 0.0.0.0
# open http://localhost:8080
```

> Serve over HTTP rather than opening the file directly — service workers and
> IndexedDB need an `http(s)` origin. `file://` works for the UI but will not
> cache offline.

**Run the tests** (Node 18+, no other dependency needed for the core suite):

```bash
npm install            # only needed for the jsdom-based UI tests
npm test
```

**Install on Android:** open the site in Chrome → menu → **Add to Home screen**.
It launches full-screen and works with the network off.

First launch is empty on purpose. To see a populated app:
**More → Settings → Data tools → Load sample data.**

---

## What is inside

| Area | What it does |
|---|---|
| **Dashboard** | Today's sales, purchases, gross & net profit, cash/UPI/credit split, collections, customer dues, supplier payable, low-stock and out-of-stock, top sellers, recent transactions. Filters: Today / Yesterday / This week / This month / Custom. |
| **Products & stock** | Name, category, brand, SKU/barcode, purchase price, selling price, MRP, stock, minimum stock, unit (piece/kg/g/litre/ml/packet/box/dozen), supplier, expiry, notes. Search + category + low-stock + out-of-stock filters. Full movement history (opening, purchase, sale, sale return, cancel, supplier return, manual adjustment). |
| **Billing / sales** | Fast New Sale screen with product/barcode search, per-line qty/price/discount, order discount, grand total. Payment: Cash / UPI / Credit (udhaar). Auto bill numbers, printable invoice, Web Share API with clipboard fallback, partial and full returns, bill cancellation. |
| **Customers & udhaar** | Name, mobile, address, notes. Total billed, paid, outstanding. Full ledger with running balance, payments received with date/mode/note, shareable statement. No hidden interest or fees, ever. |
| **Suppliers & purchases** | Supplier records, purchase entry with items/rate/total/payment status, stock increases on save, payable vs paid balance, returns to supplier. |
| **Expenses** | Electricity, rent, transport, salary, packaging, maintenance, other. Date, category, amount, note. Feeds net profit and its own report. |
| **Reports** | Sales, purchase, expense, stock, customer dues, supplier payable, profit summary. Daily/weekly/monthly/custom. Top products, low stock. CSV and JSON export. |
| **Barcode** | Manual SKU/barcode entry always works. Camera scanning uses the browser's native `BarcodeDetector` when present, and falls back to manual entry when it is not. No paid barcode API. |
| **Backup & restore** | Export all data → JSON. Import as **merge** (adds/updates) or **replace**. Per-collection CSV export. Safe reset with a typed `DELETE` confirmation. No cloud service involved. |
| **Settings** | Shop name, owner, mobile, address, GSTIN, invoice prefix, currency symbol, Hindi/English toggle, negative-stock switch, PIN lock, stock recalculation, version/about. |
| **Security** | Optional local PIN lock. The PIN is stored **salted + SHA-256 hashed** — never as plaintext, and there is no plaintext field on the record at all. |

---

## How the money stays correct

These rules are enforced in code and covered by tests, not just documented:

- **Integer paise.** Every amount is an integer number of paise; quantities are
  integer milli-units. `0.1 + 0.2` never becomes `0.30000000000000004` in a ledger.
- **Atomic writes.** A sale writes the bill, its lines, the stock movements, the
  updated products and the bill counter in **one** IndexedDB transaction. A
  failure leaves nothing half-applied.
- **Balances are derived.** Customer outstanding and supplier payable are computed
  from sales, returns and payments — never stored as a number that can drift.
- **Cost is frozen at sale time.** Each sale line records the purchase price in
  force when it was sold, so later price changes do not rewrite history.
- **Reversals, not deletions.** Cancelling a bill or voiding a payment writes a
  reversal record. Bill numbering stays honest and the audit trail survives.
- **No overselling** unless the owner explicitly enables negative stock in Settings.
- **Void and returned bills are excluded** from revenue, profit and dues; returned
  quantities are excluded from both revenue and cost, so a returned bill earns zero.

Gross Profit = Sales Revenue − Purchase Cost of Sold Items
Net Profit = Gross Profit − Recorded Expenses

---

## Project layout

```
kirana-store-manager/
├── index.html                  app shell (topbar, view, bottom nav, + Sale)
├── manifest.webmanifest        PWA manifest (standalone, maskable icon)
├── sw.js                       service worker — offline app shell
├── assets/
│   ├── styles.css              light theme, mobile-first, print styles
│   └── icons/                  192 / 512 / maskable-512 PNGs
├── js/
│   ├── i18n.js                 English + Hindi strings, t(), applyI18n()
│   ├── core/
│   │   ├── money.js            paise & milli-unit parsing/formatting
│   │   ├── ids.js              ids, timestamps, local date keys
│   │   ├── db.js               storage adapters (IndexedDB + memory), atomic batch
│   │   ├── store.js            ALL business logic — no DOM anywhere in here
│   │   ├── reports.js          pure report/profit functions
│   │   ├── backup.js           JSON + CSV export, share, download
│   │   └── sample-data.js      optional demo data
│   └── ui/
│       ├── app.js              boot, PIN lock, hash router, SW registration
│       ├── dom.js              tiny DOM helpers (el, modal, toast, replace)
│       └── screens/            dashboard, sales, products, customers, more
├── tools/make-icons.mjs        regenerates the PNG icons (no dependencies)
└── tests/
    ├── flow.test.js            the mandatory end-to-end business flow
    └── ui.test.js              jsdom smoke tests that drive the real screens
```

`js/core/` never touches the DOM. That is what lets the exact same business logic
run against IndexedDB in the browser and against the memory adapter under
`node --test`.

---

## Testing

```bash
npm test
```

36 tests, two layers:

- **`tests/flow.test.js`** — the mandatory flow from the spec, end to end:
  product add → purchase → stock up → sale → stock down → customer credit →
  payment received → ledger update → return → stock restore → expense → profit
  report → backup → delete data → restore backup. Plus overselling, invalid
  inputs, void/return exclusions, supplier payables, CSV output and PIN storage.
- **`tests/ui.test.js`** — boots the real screen modules in jsdom against the real
  store and drives them like a finger would: type a barcode, tap the product,
  change the quantity, switch to credit, pick a customer, tap **Complete sale**,
  then assert the bill, the stock and the udhaar actually changed in the database.
  It also boots `app.js` itself, so the storage fallback, the hash router and the
  active-tab switching are covered too — not just the individual screens.

See **[TEST-CHECKLIST.md](TEST-CHECKLIST.md)** for the manual checklist
(refresh, offline, mobile layout, camera scanning).

---

## Completely free — what that means here

No paid API key. No paid database. No paid hosting. No paid barcode service. No
paid WhatsApp API — sharing uses the browser's Web Share API with a clipboard
fallback. No subscription. No mandatory account. The core app works offline.

There are **no third-party runtime dependencies at all** — nothing to license and
nothing to audit. The only dev dependency is `jsdom`, used solely by the UI tests
and never shipped to the browser.

---

## Optional future phase

Multi-device or cloud sync can be layered on later as an *optional* feature. The
offline core stays free and keeps working when sync is absent, disabled or
unreachable.

---

## License

MIT.
