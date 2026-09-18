# Test Checklist

Two parts: what the automated suite already proves, and what a human should
verify on a real phone. Tick the manual boxes after each release.

---

## 1. Automated — `npm test`

Run these first. Nothing below should be checked manually if these fail.

### The mandatory end-to-end flow

- [x] Product Add — validates name/price/unit, rejects duplicate SKU
- [x] Purchase — stock increases, cost price follows the latest rate
- [x] Stock Increase — a `purchase` movement is written
- [x] Sale — stock decreases, cost is frozen on the line, bill number issued
- [x] Stock Decrease — a `sale` movement is written
- [x] Customer Credit — credit sale raises outstanding by the bill total
- [x] Payment Received — outstanding drops; over-payment is refused
- [x] Ledger Update — running balance is correct on every entry
- [x] Return — stock restored, refund credited, udhaar shrinks
- [x] Stock Restore — a `sale_return` movement is written
- [x] Expense — hits net profit, never gross profit
- [x] Profit Report — gross = revenue − cost of sold; net = gross − expenses
- [x] Backup — full JSON export of every store
- [x] Delete Test Data — reset clears everything, seed categories return
- [x] Restore Backup — records, stock, dues, bill sequence all come back intact

### Business rules

- [x] Cannot sell more than stock unless negative stock is enabled
- [x] Two lines of the same product are summed before the stock check
- [x] A rejected sale leaves stock untouched
- [x] Full return with no item list restores every unit (regression)
- [x] Full purchase return with no item list restores every unit (regression)
- [x] Cannot return more than was sold / bought
- [x] Cannot return stock that has already been sold on
- [x] Void bill reverses stock in full and is excluded from every report
- [x] Void bill is kept as a record, not deleted
- [x] Void payment restores the previous balance
- [x] Returned quantities are excluded from revenue **and** cost
- [x] A product with history cannot be deleted; one without can
- [x] Stored stock equals the sum of its movements (`verifyStockIntegrity`)

### Money

- [x] `0.1 + 0.2` is exactly 30 paise
- [x] `1.5 × ₹33.33` rounds to ₹50.00
- [x] Indian digit grouping (`₹12,34,567.89`)
- [x] Negative quantity and non-numeric input are rejected

### Backup / export

- [x] JSON round-trip restores products, bills, customers, expenses, settings
- [x] Bill numbering continues after a restore (does not restart at 1)
- [x] CSVs for products, sales, purchases, customers, suppliers, expenses
- [x] Commas and quotes inside text do not break CSV columns
- [x] A file from another app is rejected

### UI (jsdom, driving the real screens)

- [x] App shell declares every element the router needs
- [x] Dashboard shows totals, stock alerts, top sellers, recent bills
- [x] Dashboard range chips change the numbers
- [x] Product search filters the list; filters show the empty state
- [x] Barcode search → cart → quantity edit → credit + customer → Complete sale
      writes a real bill, drops stock and records udhaar
- [x] Overselling is blocked in the UI with the real error text
- [x] Invoice shows bill no, customer, totals and shop header
- [x] Return flow from the invoice restores stock and clears udhaar
- [x] Customer ledger shows the running balance; posting a payment updates it
- [x] More menu, expenses, reports and settings all render
- [x] Saving the shop name persists
- [x] Hindi toggle swaps every string; unknown keys fall back to the key
- [x] PWA manifest icons and service-worker precache list all exist on disk
- [x] `app.js` boots for real: storage fallback, seed, i18n, splash removed
- [x] Router renders the dashboard on launch and marks the right tab active
- [x] Hash navigation swaps screen + tab; an unknown route falls back to Dashboard

---

## 2. Manual — on a real phone

### Install and launch

- [ ] Chrome → menu → **Add to Home screen** installs it
- [ ] Launches full-screen from the home-screen icon (no browser chrome)
- [ ] Icon looks right on the home screen (maskable icon is not cropped)
- [ ] First launch shows the empty states, not a blank screen
- [ ] **More → Settings → Load sample data** populates the app

### Offline

- [ ] Turn on airplane mode **after** the first load
- [ ] App still opens from the home-screen icon
- [ ] A bill can be completed with the network off
- [ ] Products, ledger and reports all still render offline
- [ ] The offline banner appears and the app keeps working
- [ ] Reconnect → nothing is lost, no duplicate records

### Refresh and persistence

- [ ] Add a product → refresh → it is still there
- [ ] Complete a sale → refresh → bill and stock are still correct
- [ ] Record a payment → refresh → outstanding is still correct
- [ ] Kill the app from recent apps → reopen → data intact
- [ ] Bill numbers did not repeat or skip across a refresh

### Billing on a real device

- [ ] Barcode scan with the camera finds a product (if the browser supports
      `BarcodeDetector`; Chrome on Android does)
- [ ] Without camera permission, manual barcode entry still works
- [ ] Quantity with a decimal (e.g. `1.5` kg) is accepted and priced correctly
- [ ] Discount per line and on the whole bill both apply
- [ ] Cash / UPI / Credit switch changes what is asked for
- [ ] Credit sale requires a customer and records udhaar
- [ ] **Print** produces a clean invoice (no nav bar, no buttons)
- [ ] **Share** sends the bill text via WhatsApp or copies it to the clipboard
- [ ] Return of part of a bill restores only that quantity
- [ ] Cancelling a bill restores all stock

### Udhaar ledger

- [ ] Ledger running balance matches a hand calculation
- [ ] Payment received reduces outstanding immediately
- [ ] Over-payment is refused with a clear message
- [ ] Statement share/print includes every entry and the closing balance
- [ ] No interest or fee is ever added

### Reports

- [ ] Today / Yesterday / This week / This month / Custom all filter correctly
- [ ] Custom range rejects a from-date after the to-date
- [ ] Gross and net profit match the dashboard for the same period
- [ ] Top products, low stock, customer dues and supplier payables are right
- [ ] CSV export opens correctly in a spreadsheet app
- [ ] JSON export can be imported back (both merge and replace)

### Layout and usability

- [ ] Usable one-handed on a 5-inch screen
- [ ] Every tap target is comfortably large (≥ 44 px)
- [ ] Bottom nav is reachable with the thumb; **+ Sale** is obvious
- [ ] Nothing is cut off by the notch or the gesture bar
- [ ] Text is readable in bright sunlight (light theme, high contrast)
- [ ] Hindi toggle re-renders every screen without a reload
- [ ] Numbers still line up in Hindi mode (Devanagari does not break layout)
- [ ] Landscape on a tablet uses the wider grid
- [ ] Keyboard/desktop: Tab reaches every control, Escape closes sheets

### Security

- [ ] PIN lock can be set (4–6 digits)
- [ ] Wrong PIN is rejected and the app stays locked
- [ ] Correct PIN opens the app
- [ ] PIN lock survives a refresh
- [ ] Removing the PIN asks for confirmation
- [ ] Inspecting storage shows a hash and salt, never the PIN

### Stress / edge cases

- [ ] A product with 0 stock shows in "Out of stock" and cannot be sold
- [ ] A product at or below minimum shows in "Low stock"
- [ ] Very long product and customer names truncate instead of breaking layout
- [ ] 200+ products still scroll smoothly on a low-end phone
- [ ] Recalculate stock reports "history matches" on a healthy database
