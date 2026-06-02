import { haver } from '../geo.js';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const CACHE_MS = 10 * 60 * 1000;
const _cache = new Map();

const AMENITY_LABELS = {
  restaurant: 'restaurant', cafe: 'kafé', fast_food: 'hurtigmat',
  bar: 'bar', pub: 'pub', bakery: 'bakeri',
  museum: 'museum', theatre: 'teater', cinema: 'kino',
  arts_centre: 'kulturhus', library: 'bibliotek',
};

const AMENITY_EMOJI = {
  restaurant: '🍽', cafe: '☕', fast_food: '🍟', bakery: '🥐',
  bar: '🍺', pub: '🍺',
  museum: '🏛', theatre: '🎭', cinema: '🎬', arts_centre: '🎭', library: '📚',
};

// Shop types — queried via shop=* instead of amenity=*
const SHOP_TYPES = new Set(['clothes', 'shoes', 'sports', 'books', 'electronics', 'mall', 'department_store', 'gift', 'jewelry']);
const SHOP_LABELS = {
  clothes: 'klær', shoes: 'sko', sports: 'sport', books: 'bøker',
  electronics: 'elektronikk', mall: 'kjøpesenter', department_store: 'stormagasin',
  gift: 'gavebutikk', jewelry: 'smykker',
};
const SHOP_EMOJI = {
  clothes: '👗', shoes: '👟', sports: '⛹️', books: '📖',
  electronics: '📱', mall: '🏬', department_store: '🏬',
  gift: '🎁', jewelry: '💍',
};

export function placeEmoji(type) {
  return AMENITY_EMOJI[type] || SHOP_EMOJI[type] || '🛍';
}

// Minimal opening-hours parser — handles the most common OSM patterns
// Returns { isOpen: bool, label: string } or null if unparseable
function _timeToMins(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const _DAY_IDX = { Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6, Su: 0 };
const _DAY_NAMES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']; // Sun=0 → index 6

function _dayInRange(daySpec, jsDay) {
  // jsDay: 0=Sun..6=Sat
  // daySpec: "Mo-Fr" or "Mo,We,Fr" or "Mo" etc.
  const mapped = jsDay === 0 ? 6 : jsDay - 1; // convert to Mo=0..Su=6
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

  // Split into semicolon-separated rules
  const rules = s.split(';').map(r => r.trim()).filter(Boolean);

  for (const rule of rules) {
    // Pattern: [day-spec ]HH:MM-HH:MM
    const m = rule.match(/^((?:[A-Z][a-z][-,A-Za-z]*)\s+)?(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if (!m) continue;
    const [, dayPart, openStr, closeStr] = m;

    // If no day spec, applies every day
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
  return null; // couldn't parse
}

// All browseable categories — used for toggle pills
export const PLACE_CATS = [
  { label: 'frokost', emoji: '🥐', amenities: ['cafe', 'bakery'] },
  { label: 'lunsj',   emoji: '🍽', amenities: ['restaurant', 'cafe', 'fast_food'] },
  { label: 'kaffe',   emoji: '☕', amenities: ['cafe', 'bakery'] },
  { label: 'kultur',  emoji: '🏛', amenities: ['museum', 'cinema', 'theatre', 'arts_centre', 'library'] },
  { label: 'middag',  emoji: '🍴', amenities: ['restaurant', 'bar', 'pub'] },
];

export function timeCategory() {
  const h = new Date().getHours();
  if (h >= 7  && h < 10) return PLACE_CATS[0]; // frokost
  if (h >= 10 && h < 14) return PLACE_CATS[1]; // lunsj
  if (h >= 14 && h < 17) return PLACE_CATS[2]; // kaffe
  if (h >= 17 && h < 21) return PLACE_CATS[4]; // middag
  return PLACE_CATS[1]; // lunsj as default fallback
}

export function fetchNearbyPlaces(lat, lon, amenities, limit = 6, radius = 600) {
  const key = lat.toFixed(3) + ',' + lon.toFixed(3) + ',' + amenities.join(',') + ',' + radius;
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_MS) return Promise.resolve(hit.data);

  // Shops (ways/relations for malls etc) need nwr + out center; amenities are nodes only
  const tagParts = amenities
    .map(a => SHOP_TYPES.has(a)
      ? `nwr["shop"="${a}"](around:${radius},${lat.toFixed(5)},${lon.toFixed(5)});`
      : `node["amenity"="${a}"](around:${radius},${lat.toFixed(5)},${lon.toFixed(5)});`)
    .join('');
  const query = `[out:json][timeout:10];(${tagParts});out center ${limit * 4};`;

  return fetch(OVERPASS, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(j => {
      const data = (j.elements || [])
        .filter(e => e.tags && e.tags.name)
        .map(e => {
          const typeKey = e.tags.amenity || e.tags.shop;
          const label = AMENITY_LABELS[typeKey] || SHOP_LABELS[typeKey] || typeKey;
          // ways/relations return center coords; nodes have lat/lon directly
          const eLat = e.lat ?? (e.center && e.center.lat);
          const eLon = e.lon ?? (e.center && e.center.lon);
          if (!eLat || !eLon) return null;
          return {
            name: e.tags.name,
            amenity: typeKey,
            type: label,
            emoji: placeEmoji(typeKey),
            lat: eLat, lon: eLon,
            dist: Math.round(haver(lat, lon, eLat, eLon)),
            hours: parseOpeningHours(e.tags.opening_hours || null),
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, limit);
      _cache.set(key, { ts: Date.now(), data });
      return data;
    });
}
