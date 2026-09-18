/**
 * Money & quantity helpers.
 *
 * RULE: money is never stored or calculated as a floating point rupee value.
 * Every amount is an INTEGER number of PAISE (1 rupee = 100 paise). Quantities
 * are INTEGER milli-units (1 piece/kg/litre = 1000). That is what keeps
 * 0.1 + 0.2 === 0.30000000000000004 out of the ledger.
 */

/** Milli-units per unit — quantities are stored as integers of these. */
export const MILLI = 1000;

const MONEY_RE = /^-?\d*(\.\d+)?$/;
const QTY_RE = /^\d*(\.\d+)?$/;

/**
 * Parse user input into integer paise.
 * Accepts 1250, "1250", "12.5", "12.50", "₹12.50", "1,250.50", "-3.25".
 * @returns {number} integer paise
 */
export function toPaise(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Invalid amount');
    return Math.round(value * 100);
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[₹,\s]/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0;
    if (!MONEY_RE.test(cleaned)) throw new Error(`Invalid amount: "${value}"`);
    const paise = Math.round(parseFloat(cleaned) * 100);
    if (!Number.isSafeInteger(paise)) throw new Error(`Amount too large: "${value}"`);
    return paise;
  }
  throw new Error('Invalid amount');
}

/** Parse user input into integer milli-units. Negative is not a quantity. */
export function toMilli(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Invalid quantity');
    if (value < 0) throw new Error('Quantity cannot be negative');
    return Math.round(value * MILLI);
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[, ]/g, '');
    if (cleaned === '' || cleaned === '.') return 0;
    if (cleaned.startsWith('-')) throw new Error('Quantity cannot be negative');
    if (!QTY_RE.test(cleaned)) throw new Error(`Invalid quantity: "${value}"`);
    const milli = Math.round(parseFloat(cleaned) * MILLI);
    if (!Number.isSafeInteger(milli)) throw new Error(`Quantity too large: "${value}"`);
    return milli;
  }
  throw new Error('Invalid quantity');
}

/** Exact line total in paise: qty(milli) * price(paise) / 1000, rounded half-up. */
export function lineTotalPaise(qtyMilli, pricePaise) {
  const raw = (qtyMilli * pricePaise) / MILLI;
  return Math.round(raw);
}

/** Convert paise back to a plain number (display / CSV only, never for math). */
export function paiseToNumber(paise) {
  return paise / 100;
}

/** "1234567" -> "12,34,567" (Indian digit grouping). */
export function indianGroup(intStr) {
  const s = String(intStr);
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}

/** Format integer paise as currency, e.g. 125050 -> "₹1,250.50". */
export function fmtPaise(paise, symbol = '₹') {
  const n = Number.isFinite(paise) ? Math.round(paise) : 0;
  const neg = n < 0;
  const abs = Math.abs(n);
  const rupees = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${neg ? '-' : ''}${symbol}${indianGroup(rupees)}.${String(cents).padStart(2, '0')}`;
}

/** Format integer milli-units, trimming trailing zeros: 1500 -> "1.5", 2000 -> "2". */
export function fmtQty(milli) {
  const n = Number.isFinite(milli) ? Math.round(milli) : 0;
  const neg = n < 0;
  const abs = Math.abs(n);
  const whole = Math.floor(abs / MILLI);
  const frac = abs % MILLI;
  const body = frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(3, '0').replace(/0+$/, '')}`;
  return `${neg ? '-' : ''}${body}`;
}

/** Sum of integer amounts. */
export function sum(values) {
  let total = 0;
  for (const v of values) total += Number.isFinite(v) ? Math.round(v) : 0;
  return total;
}

/** Percentage discount applied to a paise amount, rounded half-up. */
export function discountPaiseFromPercent(amountPaise, percent) {
  const p = Number(percent) || 0;
  if (p < 0 || p > 100) throw new Error('Discount must be between 0 and 100');
  return Math.round((amountPaise * p) / 100);
}
