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

/**
 * Map a Pelias category array to a colored badge descriptor.
 * Used by all suggestion dropdowns to show transit-type icons.
 */
export function placeIcon(cats) {
  if (cats && cats.includes('metroStation'))                                 return { cls: 'si-metro', txt: 'T' };
  if (cats && cats.includes('tramStation'))                                  return { cls: 'si-tram',  txt: 'Tr' };
  if (cats && (cats.includes('busStation') || cats.includes('onstreetBus'))) return { cls: 'si-bus',   txt: 'B' };
  if (cats && cats.includes('ferryStop'))                                    return { cls: 'si-ferry', txt: 'F' };
  return { cls: 'si-addr', txt: '◉' };
}

/**
 * Build a suggestion-dropdown button with a place-type icon badge.
 * The mousedown preventDefault is always applied (prevents input blur before click fires).
 */
export function makeSuggBtn(label, cats, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  const pi = placeIcon(cats);
  const ic = document.createElement('span');
  ic.className = 'si ' + pi.cls;
  ic.textContent = pi.txt;
  const lb = document.createElement('span');
  lb.textContent = label;
  btn.appendChild(ic);
  btn.appendChild(lb);
  btn.addEventListener('mousedown', e => e.preventDefault());
  btn.addEventListener('click', onClick);
  return btn;
}
