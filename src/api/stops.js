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
      const stops = [];
      ((json && json.features) || []).forEach(f => {
        const cats = f.properties.category || [];
        const fLat = f.geometry.coordinates[1];
        const fLon = f.geometry.coordinates[0];
        const name = f.properties.name || f.properties.label || '';
        if (!fLat || !name) return;
        const baseId = f.properties.id || f.properties.gid || '';
        const dist = Math.round(haver(lat, lon, fLat, fLon));
        // Emit one entry per distinct transit mode served by this place
        const modesAdded = new Set();
        cats.forEach(cat => {
          const mode = CAT_MODE[cat];
          if (!mode || modesAdded.has(mode)) return;
          modesAdded.add(mode);
          const uid = baseId + '|' + mode;
          if (seen.has(uid)) return;
          seen.add(uid);
          stops.push({ id: uid, name, lat: fLat, lon: fLon, mode, dist });
        });
      });
      _cache = { ts: now, lat, lon, stops };
      return stops;
    });
}
