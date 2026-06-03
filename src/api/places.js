import { haver } from '../geo.js';
import config from '../config.js';

const CACHE_MS = 10 * 60 * 1000;
const _cache = new Map();

// Geoapify category → Norwegian label + emoji
const CAT_EMOJI = {
  'catering.restaurant': '🍽', 'catering.cafe': '☕', 'catering.fast_food': '🍟',
  'catering.bakery': '🥐', 'catering.bar': '🍺', 'catering.pub': '🍺',
  'catering.ice_cream': '🍦', 'catering.biergarten': '🍺',
  'entertainment.museum': '🏛', 'entertainment.cinema': '🎬',
  'entertainment.theatre': '🎭', 'entertainment.arts_centre': '🎭',
  'education.library': '📚',
  'commercial.clothing': '👗', 'commercial.shoes': '👟', 'commercial.sport': '⛹️',
  'commercial.books': '📖', 'commercial.electronics': '📱',
  'commercial.shopping_mall': '🏬', 'commercial.department_store': '🏬',
  'commercial.gift': '🎁', 'commercial.jewelry': '💍',
};
const CAT_LABEL = {
  'catering.restaurant': 'restaurant', 'catering.cafe': 'kafé',
  'catering.fast_food': 'hurtigmat', 'catering.bakery': 'bakeri',
  'catering.bar': 'bar', 'catering.pub': 'pub',
  'catering.ice_cream': 'is', 'catering.biergarten': 'ølhage',
  'entertainment.museum': 'museum', 'entertainment.cinema': 'kino',
  'entertainment.theatre': 'teater', 'entertainment.arts_centre': 'kulturhus',
  'education.library': 'bibliotek',
  'commercial.clothing': 'klær', 'commercial.shoes': 'sko',
  'commercial.sport': 'sport', 'commercial.books': 'bøker',
  'commercial.electronics': 'elektronikk', 'commercial.shopping_mall': 'kjøpesenter',
  'commercial.department_store': 'stormagasin', 'commercial.gift': 'gavebutikk',
  'commercial.jewelry': 'smykker',
};

export function placeEmoji(cat) {
  return CAT_EMOJI[cat] || '🛍';
}

// Opening-hours parser — handles common OSM patterns (same format Geoapify returns)
function _timeToMins(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
const _DAY_IDX = { Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6, Su: 0 };
const _DAY_NAMES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function _dayInRange(daySpec, jsDay) {
  const mapped = jsDay === 0 ? 6 : jsDay - 1;
  const parts = daySpec.split(',');
  for (const part of parts) {
    const range = part.trim().split('-');
    if (range.length === 2) {
      const a = _DAY_NAMES.indexOf(range[0].trim());
      const b = _DAY_NAMES.indexOf(range[1].trim());
      if (a !== -1 && b !== -1 && mapped >= a && mapped <= b) return true;
    } else {
      const a = _DAY_NAMES.indexOf(range[0].trim());
      if (a !== -1 && mapped === a) return true;
    }
  }
  return false;
}

export function parseOpeningHours(spec, now = new Date()) {
  if (!spec) return null;
  const s = spec.trim();
  if (s === '24/7') return { isOpen: true, label: 'åpent 24/7' };
  const jsDay = now.getDay();
  const hm = now.getHours() * 60 + now.getMinutes();
  const rules = s.split(';').map(r => r.trim()).filter(Boolean);
  for (const rule of rules) {
    const m = rule.match(/^((?:[A-Z][a-z][-,A-Za-z]*)\s+)?(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if (!m) continue;
    const [, dayPart, openStr, closeStr] = m;
    if (dayPart && !_dayInRange(dayPart.trim(), jsDay)) continue;
    const openMins  = _timeToMins(openStr);
    const closeMins = _timeToMins(closeStr);
    if (hm >= openMins && hm < closeMins) {
      const minsLeft = closeMins - hm;
      return { isOpen: true, label: minsLeft <= 60 ? 'stenger ' + closeStr : 'til ' + closeStr };
    } else if (hm < openMins) {
      return { isOpen: false, label: 'åpner ' + openStr };
    } else {
      return { isOpen: false, label: 'stengt' };
    }
  }
  return null;
}

// Category groups — amenities field holds Geoapify category path strings (comma-separated)
export const PLACE_CATS = [
  { label: 'frokost', emoji: '🥐', amenities: 'catering.cafe,catering.bakery' },
  { label: 'lunsj',   emoji: '🍽', amenities: 'catering.restaurant,catering.cafe,catering.fast_food' },
  { label: 'kaffe',   emoji: '☕', amenities: 'catering.cafe,catering.bakery' },
  { label: 'kultur',  emoji: '🏛', amenities: 'entertainment.museum,entertainment.cinema,entertainment.theatre,entertainment.arts_centre,education.library' },
  { label: 'middag',  emoji: '🍴', amenities: 'catering.restaurant,catering.bar,catering.pub' },
];

export function timeCategory() {
  const h = new Date().getHours();
  if (h >= 7  && h < 10) return PLACE_CATS[0]; // frokost
  if (h >= 10 && h < 14) return PLACE_CATS[1]; // lunsj
  if (h >= 14 && h < 17) return PLACE_CATS[2]; // kaffe
  if (h >= 17 && h < 21) return PLACE_CATS[4]; // middag
  return PLACE_CATS[1];
}

export function fetchNearbyPlaces(lat, lon, amenities, limit = 8, radius = 600) {
  // amenities is a Geoapify category string (comma-separated) or legacy array (ignored gracefully)
  const catStr = Array.isArray(amenities) ? amenities.join(',') : amenities;
  const key = lat.toFixed(3) + ',' + lon.toFixed(3) + ',' + catStr + ',' + radius;
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_MS) return Promise.resolve(hit.data);

  if (!config.api.geoapifyKey) return Promise.resolve([]);

  const url = 'https://api.geoapify.com/v2/places'
    + '?categories=' + encodeURIComponent(catStr)
    + '&filter=circle:' + lon.toFixed(6) + ',' + lat.toFixed(6) + ',' + radius
    + '&bias=proximity:' + lon.toFixed(6) + ',' + lat.toFixed(6)
    + '&limit=' + Math.min(limit * 4, 50)
    + '&apiKey=' + config.api.geoapifyKey;

  return fetch(url)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(json => {
      const seen = new Map();
      (json.features || [])
        .filter(f => f.properties && f.properties.name)
        .forEach(f => {
          const p = f.properties;
          const cats = (p.categories || []).slice().reverse();
          const knownCat = cats.find(c => CAT_EMOJI[c]) || cats[0] || '';
          const fLat = p.lat ?? (f.geometry && f.geometry.coordinates[1]);
          const fLon = p.lon ?? (f.geometry && f.geometry.coordinates[0]);
          if (!fLat || !fLon) return;
          const dist = Math.round(haver(lat, lon, fLat, fLon));
          const name = p.name;
          const existing = seen.get(name);
          if (!existing || dist < existing.dist) {
            const raw = p.datasource && p.datasource.raw;
            seen.set(name, {
              name,
              amenity: knownCat,
              type: CAT_LABEL[knownCat] || knownCat.split('.').pop() || '',
              emoji: placeEmoji(knownCat),
              lat: fLat, lon: fLon, dist,
              hours: parseOpeningHours(raw && raw.opening_hours || null),
            });
          }
        });
      const data = Array.from(seen.values())
        .sort((a, b) => a.dist - b.dist)
        .slice(0, limit);
      _cache.set(key, { ts: Date.now(), data });
      return data;
    });
}
