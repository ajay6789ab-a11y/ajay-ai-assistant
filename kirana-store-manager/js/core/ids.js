/** Unique, sortable-enough record ids (no external dependency, no network). */
export function uid(prefix = 'id') {
  const rand =
    typeof crypto !== 'undefined' && crypto.getRandomValues
      ? Array.from(crypto.getRandomValues(new Uint8Array(8)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      : Math.random().toString(16).slice(2, 18);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

/** ISO-8601 UTC timestamp for createdAt fields. */
export function nowISO() {
  return new Date().toISOString();
}

/**
 * Local date (YYYY-MM-DD) for a Date or ISO string, in the device timezone.
 * Reports group by shop-local day, not UTC day.
 */
export function localDateKey(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Start of the local day as an ISO string. */
export function startOfDay(input) {
  const [y, m, d] = localDateKey(input).split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

/** End of the local day (exclusive) as an ISO string. */
export function endOfDay(input) {
  const [y, m, d] = localDateKey(input).split('-').map(Number);
  return new Date(y, m - 1, d + 1, 0, 0, 0, 0).toISOString();
}
