/**
 * Shared time-duration formatters.
 * Convention: seconds < 1 min · minutes 1–59 · hours+minutes ≥ 1 h
 */

/**
 * Format an integer number of minutes as inline text.
 * e.g. fmtMins(0) → 'nå', fmtMins(5) → '5 min', fmtMins(75) → '1t 15m'
 */
export function fmtMins(m) {
  if (m <= 0) return 'nå';
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60), rm = m % 60;
  return h + 't' + (rm > 0 ? ' ' + rm + 'm' : '');
}
