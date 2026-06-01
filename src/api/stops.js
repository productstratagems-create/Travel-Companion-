import { haver } from '../geo.js';

const EP  = 'https://api.entur.io/journey-planner/v3/graphql';
const HDR = { 'Content-Type': 'application/json', 'ET-Client-Name': 'travel-companion-oslo' };

// Inline variables to avoid GraphQL variable type declarations
function _q(lat, lon) {
  return `{stopsByRadius(lat:${lat},lon:${lon},radius:800,`
    + `filterByTransportModes:[metro,bus,tram]){`
    + `edges{node{place{...on StopPlace{id name latitude longitude transportMode}}distance}}}}`;
}

let _cache = null;

export function fetchNearbyStops(lat, lon) {
  const now = Date.now();
  if (_cache && now - _cache.ts < 120000 && haver(lat, lon, _cache.lat, _cache.lon) < 100)
    return Promise.resolve(_cache.stops);

  return fetch(EP, { method: 'POST', headers: HDR, body: JSON.stringify({ query: _q(lat, lon) }) })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(j => {
      if (j.errors) console.warn('[stops]', j.errors[0].message);
      const seen = new Set();
      const stops = ((j.data && j.data.stopsByRadius && j.data.stopsByRadius.edges) || [])
        .map(e => e.node)
        .filter(n => n.place && n.place.latitude)
        .map(n => ({
          id:   n.place.id,
          name: n.place.name,
          lat:  n.place.latitude,
          lon:  n.place.longitude,
          mode: Array.isArray(n.place.transportMode)
            ? n.place.transportMode[0]
            : n.place.transportMode,
          dist: n.distance,
        }))
        .filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
      _cache = { ts: now, lat, lon, stops };
      return stops;
    });
}
