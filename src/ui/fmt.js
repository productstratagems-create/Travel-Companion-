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
