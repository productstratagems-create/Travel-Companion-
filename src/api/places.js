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

export function placeEmoji(amenity) {
  return AMENITY_EMOJI[amenity] || '📍';
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

export function fetchNearbyPlaces(lat, lon, amenities, limit = 6) {
  const key = lat.toFixed(3) + ',' + lon.toFixed(3) + ',' + amenities.join(',');
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_MS) return Promise.resolve(hit.data);

  const tagParts = amenities
    .map(a => `node["amenity"="${a}"](around:600,${lat.toFixed(5)},${lon.toFixed(5)});`)
    .join('');
  const query = `[out:json][timeout:8];(${tagParts});out ${limit * 4};`;

  return fetch(OVERPASS, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(j => {
      const data = (j.elements || [])
        .filter(e => e.tags && e.tags.name)
        .map(e => ({
          name: e.tags.name,
          amenity: e.tags.amenity,
          type: AMENITY_LABELS[e.tags.amenity] || e.tags.amenity,
          emoji: placeEmoji(e.tags.amenity),
          lat: e.lat, lon: e.lon,
          dist: Math.round(haver(lat, lon, e.lat, e.lon)),
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, limit);
      _cache.set(key, { ts: Date.now(), data });
      return data;
    });
}
