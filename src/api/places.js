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

// ── Complementary OpenStreetMap source (Overpass) ────────────────────────────
// Geoapify is a curated *subset* of OSM, so it silently drops POIs whose tags
// fall outside its category tree. Querying Overpass (raw OSM) recovers those,
// and because it needs no API key it also acts as a resilience fallback when
// the Geoapify key is missing or its request fails. Both sources are
// OSM-derived, so results are merged on the shared OSM id (deterministic),
// backed by a normalised-name + proximity check as a safety net.
const _OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Geoapify category → equivalent OSM tag(s)
const _OSM_TAGS = {
  'catering.restaurant': [['amenity', 'restaurant']],
  'catering.cafe':       [['amenity', 'cafe']],
  'catering.fast_food':  [['amenity', 'fast_food']],
  'catering.bakery':     [['shop', 'bakery']],
  'catering.bar':        [['amenity', 'bar']],
  'catering.pub':        [['amenity', 'pub']],
  'catering.ice_cream':  [['amenity', 'ice_cream']],
  'catering.biergarten': [['amenity', 'biergarten']],
  'entertainment.museum':      [['tourism', 'museum']],
  'entertainment.cinema':      [['amenity', 'cinema']],
  'entertainment.theatre':     [['amenity', 'theatre']],
  'entertainment.arts_centre': [['amenity', 'arts_centre']],
  'education.library':         [['amenity', 'library']],
  'commercial.clothing':         [['shop', 'clothes']],
  'commercial.shoes':            [['shop', 'shoes']],
  'commercial.sport':            [['shop', 'sports']],
  'commercial.books':            [['shop', 'books']],
  'commercial.electronics':      [['shop', 'electronics']],
  'commercial.shopping_mall':    [['shop', 'mall']],
  'commercial.department_store': [['shop', 'department_store']],
  'commercial.gift':             [['shop', 'gift']],
  'commercial.jewelry':          [['shop', 'jewelry']],
};
const _OSM_TO_CAT = {};
Object.entries(_OSM_TAGS).forEach(([cat, pairs]) => {
  pairs.forEach(([k, v]) => { _OSM_TO_CAT[k + '=' + v] = cat; });
});

// Two records within this distance (m) with the same normalised name are
// treated as the same physical place.
const DEDUP_DIST = 60;

// Normalise a venue name for cross-source matching: lowercase, fold Norwegian
// letters, strip diacritics, drop trailing legal suffixes and all punctuation.
export function _normName(s) {
  return (s || '').toLowerCase()
    .replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(as|asa)\b/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function _geoapifyOsmId(raw) {
  if (!raw) return null;
  const id = raw.osm_id ?? raw['@id'] ?? null;
  if (id == null) return null;
  const t = raw.osm_type || raw['@type'] || '';
  const letter = typeof t === 'string' && t ? t[0].toLowerCase() : '';
  return (letter ? letter + '/' : '') + id;
}

function _isSamePlace(a, b) {
  if (a.osmId && b.osmId && a.osmId === b.osmId) return true;
  return !!a._norm && a._norm === b._norm
    && haver(a.lat, a.lon, b.lat, b.lon) <= DEDUP_DIST;
}

// Fold one or more source lists into a single deduplicated list. Earlier lists
// win as the base record (Geoapify first → richer categories); later sources
// fill gaps, nudge the kept record to the nearest known coordinates, and bump
// a `sources` count usable as a quality/confidence signal.
export function mergePlaces(lists) {
  const out = [];
  lists.forEach(list => {
    (list || []).forEach(rec => {
      const dup = out.find(o => _isSamePlace(o, rec));
      if (dup) {
        dup.sources = (dup.sources || 1) + 1;
        if (!dup.hours && rec.hours) dup.hours = rec.hours;
        if (!dup.amenity && rec.amenity) { dup.amenity = rec.amenity; dup.type = rec.type; dup.emoji = rec.emoji; }
        if (rec.dist < dup.dist) { dup.dist = rec.dist; dup.lat = rec.lat; dup.lon = rec.lon; }
        return;
      }
      out.push({ ...rec, sources: 1 });
    });
  });
  return out;
}

function _fetchGeoapify(lat, lon, catStr, limit, radius) {
  const url = 'https://api.geoapify.com/v2/places'
    + '?categories=' + encodeURIComponent(catStr)
    + '&filter=circle:' + lon.toFixed(6) + ',' + lat.toFixed(6) + ',' + radius
    + '&bias=proximity:' + lon.toFixed(6) + ',' + lat.toFixed(6)
    + '&limit=' + Math.min(limit * 4, 50)
    + '&apiKey=' + config.api.geoapifyKey;

  return fetch(url)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(json => (json.features || [])
      .filter(f => f.properties && f.properties.name)
      .map(f => {
        const p = f.properties;
        const cats = (p.categories || []).slice().reverse();
        const knownCat = cats.find(c => CAT_EMOJI[c]) || cats[0] || '';
        const fLat = p.lat ?? (f.geometry && f.geometry.coordinates[1]);
        const fLon = p.lon ?? (f.geometry && f.geometry.coordinates[0]);
        if (!fLat || !fLon) return null;
        const raw = p.datasource && p.datasource.raw;
        return {
          name: p.name,
          amenity: knownCat,
          type: CAT_LABEL[knownCat] || knownCat.split('.').pop() || '',
          emoji: placeEmoji(knownCat),
          lat: fLat, lon: fLon,
          dist: Math.round(haver(lat, lon, fLat, fLon)),
          hours: parseOpeningHours(raw && raw.opening_hours || null),
          osmId: _geoapifyOsmId(raw),
          _norm: _normName(p.name),
        };
      })
      .filter(Boolean));
}

// Parse Overpass JSON elements into the shared venue shape.
export function parseOverpassElements(elements, lat, lon) {
  return (elements || [])
    .map(el => {
      const tags = el.tags || {};
      if (!tags.name) return null;
      const elLat = el.lat ?? (el.center && el.center.lat);
      const elLon = el.lon ?? (el.center && el.center.lon);
      if (elLat == null || elLon == null) return null;
      let cat = '';
      for (const [k, v] of Object.entries(tags)) {
        if (_OSM_TO_CAT[k + '=' + v]) { cat = _OSM_TO_CAT[k + '=' + v]; break; }
      }
      return {
        name: tags.name,
        amenity: cat,
        type: CAT_LABEL[cat] || cat.split('.').pop() || '',
        emoji: placeEmoji(cat),
        lat: elLat, lon: elLon,
        dist: Math.round(haver(lat, lon, elLat, elLon)),
        hours: parseOpeningHours(tags.opening_hours || null),
        osmId: (el.type ? el.type[0] : '') + '/' + el.id,
        _norm: _normName(tags.name),
      };
    })
    .filter(Boolean);
}

function _fetchOverpass(lat, lon, catStr, radius) {
  const cats = catStr.split(',').map(s => s.trim()).filter(Boolean);
  const clauses = [];
  cats.forEach(cat => {
    (_OSM_TAGS[cat] || []).forEach(([k, v]) => {
      clauses.push('nwr["' + k + '"="' + v + '"](around:' + radius + ',' + lat.toFixed(6) + ',' + lon.toFixed(6) + ');');
    });
  });
  if (!clauses.length) return Promise.resolve([]);
  const ql = '[out:json][timeout:20];(' + clauses.join('') + ');out center tags 60;';

  return fetch(_OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(ql),
  })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(json => parseOverpassElements(json.elements, lat, lon));
}

export function fetchNearbyPlaces(lat, lon, amenities, limit = 8, radius = 600) {
  // amenities is a Geoapify category string (comma-separated) or legacy array (ignored gracefully)
  const catStr = Array.isArray(amenities) ? amenities.join(',') : amenities;
  const key = lat.toFixed(3) + ',' + lon.toFixed(3) + ',' + catStr + ',' + radius;
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_MS) return Promise.resolve(hit.data);

  // Query both sources in parallel. Geoapify is skipped when no key is set;
  // either source may fail independently (→ null) without sinking the other.
  const geoP = config.api.geoapifyKey
    ? _fetchGeoapify(lat, lon, catStr, limit, radius).catch(() => null)
    : Promise.resolve(null);
  const ovpP = _fetchOverpass(lat, lon, catStr, radius).catch(() => null);

  return Promise.all([geoP, ovpP]).then(([geo, ovp]) => {
    // Both sources errored (vs. legitimately empty) — surface as a load error.
    if (geo === null && ovp === null) throw new Error('all place sources failed');
    const data = mergePlaces([geo || [], ovp || []])
      .sort((a, b) => a.dist - b.dist)
      .slice(0, limit);
    _cache.set(key, { ts: Date.now(), data });
    return data;
  });
}
