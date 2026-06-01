import { haver } from '../geo.js';

// Per-operator GBFS free_bike_status endpoints (GET, more browser-friendly than GraphQL POST)
const SYSTEMS = [
  { id: 'boltoslo',  name: 'Bolt' },
  { id: 'voioslo',   name: 'Voi'  },
  { id: 'tieroslo',  name: 'Tier' },
];
const BASE = 'https://api.entur.io/mobility/v2/gbfs';
const HDR  = { headers: { 'ET-Client-Name': 'travel-companion-oslo' } };

let _cache = null;

export function fetchScooters(lat, lon) {
  const now = Date.now();
  if (_cache && now - _cache.ts < 30000) return Promise.resolve(_rank(_cache.data, lat, lon));

  return Promise.allSettled(
    SYSTEMS.map(s =>
      fetch(`${BASE}/${s.id}/free_bike_status`, HDR)
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(j => ((j.data && j.data.bikes) || []).map(v => ({ ...v, _op: s.name })))
    )
  ).then(results => {
    const vehicles = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    _cache = { ts: Date.now(), data: vehicles };
    return _rank(vehicles, lat, lon);
  });
}

function _rank(vehicles, lat, lon) {
  return vehicles
    .filter(v => !v.is_reserved && !v.is_disabled && v.lat && v.lon
      && Math.round(haver(lat, lon, v.lat, v.lon)) <= 1000)
    .map(v => ({
      lat:      v.lat,
      lon:      v.lon,
      battery:  v.current_range_meters != null
        ? Math.min(100, Math.round(v.current_range_meters / 250))  // ~25 km max range
        : null,
      operator: v._op || 'Sparkesykkel',
      type:     'scooter',
      dist:     Math.round(haver(lat, lon, v.lat, v.lon)),
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 8);
}
