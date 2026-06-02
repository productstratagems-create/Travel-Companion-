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

export function timeCategory() {
  const h = new Date().getHours();
  if (h >= 7  && h < 10) return { label: 'frokost i nærheten', emoji: '☕', amenities: ['cafe', 'bakery'] };
  if (h >= 10 && h < 14) return { label: 'lunsj i nærheten',   emoji: '🍽', amenities: ['restaurant', 'cafe', 'fast_food'] };
  if (h >= 14 && h < 17) return { label: 'kaffe & kultur',     emoji: '☕', amenities: ['cafe', 'museum', 'cinema', 'arts_centre'] };
  if (h >= 17 && h < 21) return { label: 'middag i nærheten',  emoji: '🍴', amenities: ['restaurant', 'bar', 'pub'] };
  return { label: 'i nærheten', emoji: '📍', amenities: ['bar', 'cafe', 'fast_food'] };
}

export function fetchNearbyPlaces(lat, lon, amenities, limit = 5) {
  const key = lat.toFixed(3) + ',' + lon.toFixed(3) + ',' + amenities.join(',');
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_MS) return Promise.resolve(hit.data);

  const tagParts = amenities
    .map(a => `node["amenity"="${a}"](around:500,${lat.toFixed(5)},${lon.toFixed(5)});`)
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
          type: AMENITY_LABELS[e.tags.amenity] || e.tags.amenity,
          lat: e.lat, lon: e.lon,
          dist: Math.round(haver(lat, lon, e.lat, e.lon)),
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, limit);
      _cache.set(key, { ts: Date.now(), data });
      return data;
    });
}
