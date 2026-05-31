import { haver } from '../geo.js';

const ENDPOINT = 'https://api.entur.io/mobility/v2/graphql';
const HDR = { 'Content-Type': 'application/json', 'ET-Client-Name': 'travel-companion-oslo' };

// Case-insensitive: Entur returns uppercase in some schema versions, lowercase in others
const SCOOTER_FACTORS = new Set(['scooter', 'scooter_standing', 'moped']);

let _cache = null;

// Inline lat/lon avoids GraphQL variable type-annotation issues with some server versions
function _q(lat, lon) {
  return `{vehicles(lat:${lat},lon:${lon},range:1000,count:100){`
    + `id lat lon currentFuelPercent`
    + ` vehicleType{formFactor propulsionType}`
    + ` system{operator{name}}`
    + ` rentalUris{web}}}`;
}

export function fetchScooters(lat, lon) {
  const now = Date.now();
  if (_cache && now - _cache.ts < 30000) return Promise.resolve(_rank(_cache.data, lat, lon));
  return fetch(ENDPOINT, {
    method: 'POST',
    headers: HDR,
    body: JSON.stringify({ query: _q(lat, lon) }),
    signal: AbortSignal.timeout(8000),
  })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(j => {
      if (j.errors) console.warn('[scooters]', j.errors[0].message);
      const vehicles = (j.data && j.data.vehicles) || [];
      _cache = { ts: Date.now(), data: vehicles };
      return _rank(vehicles, lat, lon);
    });
}

function _rank(vehicles, lat, lon) {
  return vehicles
    .filter(v => {
      if (!v.vehicleType) return false;
      const ff = (v.vehicleType.formFactor || '').toLowerCase();
      return SCOOTER_FACTORS.has(ff);
    })
    .map(v => ({
      lat:       v.lat,
      lon:       v.lon,
      battery:   v.currentFuelPercent != null ? Math.round(v.currentFuelPercent) : null,
      operator:  ((v.system && v.system.operator && v.system.operator.name) || 'Sparkesykkel')
                   .split(/\s+/)[0],
      rentalUrl: v.rentalUris && v.rentalUris.web,
      type:      'scooter',
      dist:      Math.round(haver(lat, lon, v.lat, v.lon)),
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 8);
}
