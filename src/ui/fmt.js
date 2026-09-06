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

const _pad = (n) => String(n).padStart(2, '0');

/** HH:MM, local. The one definition; board.js used to keep its own. */
export function clk(v) {
  const d = new Date(v);
  return _pad(d.getHours()) + ':' + _pad(d.getMinutes());
}

/** man tir ons tor fre lør søn — Sunday first, as getDay() counts. */
const _DAYS = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];

/**
 * Which day a time falls on, when that is not today.
 *
 * The app has never formatted a date. It never needed one: before v1.86.3 the
 * trip planner's search window was sized by local frequency and effectively
 * never reached past midnight, so every departure on screen was today's. With
 * a full day of window a rural stop routinely answers with tomorrow's 07:05 —
 * and "07:05" alone is then a time that has already passed.
 *
 * COMPARED BY DATE, NOT BY DIFFERENCE. 23:59 to 00:01 is two minutes and IS
 * tomorrow; 00:30 to 23:30 is twenty-three hours and is NOT. A duration
 * threshold gets both of those wrong, which is exactly the mistake worth
 * naming in a helper that exists to answer "which day".
 *
 * @returns {string} '' today · 'i morgen ' · 'lør ' further out
 */
export function dayPrefix(v, now) {
  const d = new Date(v);
  const n = new Date(now == null ? Date.now() : now);
  if (Number.isNaN(d.getTime())) return '';
  const day = (x) => Math.floor((x - x.getTimezoneOffset() * 60000) / 86400000);
  const diff = day(d) - day(n);
  if (diff <= 0) return '';
  if (diff === 1) return 'i morgen ';
  return _DAYS[d.getDay()] + ' ';
}

/** HH:MM, with the day in front when it is not today. */
export function clkDay(v, now) {
  return dayPrefix(v, now) + clk(v);
}

/**
 * Escape a string for safe interpolation into innerHTML.
 */
export function esc(s) {
  // null/undefined render as empty, not as the literal text "null". Numbers
  // and everything else still stringify normally.
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

// Norwegian labels for the OSM cuisine values that actually turn up in Oslo.
const CUISINE_NO = {
  italian: 'italiensk', pizza: 'pizza', sushi: 'sushi', japanese: 'japansk',
  chinese: 'kinesisk', thai: 'thai', indian: 'indisk', vietnamese: 'vietnamesisk',
  kebab: 'kebab', burger: 'burger', mexican: 'meksikansk', greek: 'gresk',
  french: 'fransk', spanish: 'spansk', american: 'amerikansk', asian: 'asiatisk',
  seafood: 'sjømat', vegetarian: 'vegetarisk', vegan: 'vegansk',
  coffee_shop: 'kaffebar', sandwich: 'smørbrød', bakery: 'bakeri',
  regional: 'lokal', international: 'internasjonal',
};

export function cuisineLabel(c) {
  if (!c) return null;
  const first = String(c).split(/[;,]/)[0].trim().toLowerCase();
  return CUISINE_NO[first] || first.replace(/_/g, ' ');
}

/**
 * Compact facts about a venue, from tags both place sources already return.
 * Deliberately terse: these sit under a name in a narrow list, so each is a
 * glyph or one word. Returns '' when there is nothing worth saying.
 */
export function venueDetailHtml(p) {
  if (!p) return '';
  const bits = [];
  const type = p.type ? esc(p.type) : null;
  const cuisine = cuisineLabel(p.cuisine);
  // Cuisine is more specific than the category, so it wins when both exist.
  if (cuisine) bits.push('<span class="vd-type">' + esc(cuisine) + '</span>');
  else if (type) bits.push('<span class="vd-type">' + type + '</span>');
  if (p.wheelchair && p.wheelchair !== 'no') bits.push('<span class="vd-chip" title="rullestolvennlig">♿</span>');
  if (p.toilets) bits.push('<span class="vd-chip" title="toalett">🚻</span>');
  if (p.outdoor) bits.push('<span class="vd-chip" title="uteservering">⛱</span>');
  if (!bits.length) return '';
  return '<div class="venue-detail">' + bits.join('') + '</div>';
}
