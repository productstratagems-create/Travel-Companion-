import { haver } from '../geo.js';
import config from '../config.js';

const CAT_MODE = {
  metroStation: 'metro',
  busStation:   'bus',
  onstreetBus:  'bus',
  tramStation:  'tram',
};
const TRANSIT_CATS = Object.keys(CAT_MODE);

let _cache = null;

export function fetchNearbyStops(lat, lon) {
  const now = Date.now();
  if (_cache && now - _cache.ts < 120000 && haver(lat, lon, _cache.lat, _cache.lon) < 100)
    return Promise.resolve(_cache.stops);

  const url = config.api.geocoderReverse
    + '?point.lat=' + lat
    + '&point.lon=' + lon
    + '&boundary.circle.radius=0.8'
    + '&size=40'
    + '&layers=venue';

  return fetch(url)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(json => {
      const seen = new Set();
      const stops = ((json && json.features) || [])
        .filter(f => {
          const cats = f.properties.category || [];
          return cats.some(c => TRANSIT_CATS.includes(c));
        })
        .map(f => {
          const cats = f.properties.category || [];
          const modeCat = cats.find(c => CAT_MODE[c]);
          const fLat = f.geometry.coordinates[1];
          const fLon = f.geometry.coordinates[0];
          return {
            id:   f.properties.id || f.properties.gid || '',
            name: f.properties.name || f.properties.label || '',
            lat:  fLat,
            lon:  fLon,
            mode: CAT_MODE[modeCat] || 'bus',
            dist: Math.round(haver(lat, lon, fLat, fLon)),
          };
        })
        .filter(s => s.lat && s.name)
        .filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
      _cache = { ts: now, lat, lon, stops };
      return stops;
    });
}
