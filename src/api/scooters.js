import { haver } from '../geo.js';
import { ET_CLIENT_NAME } from './http.js';
import { discoverSystems, MOBILITY_BASE as BASE } from './mobility.js';
import { logMsg } from '../ui/log.js';

/**
 * The three operators Oslo had, kept as the LAST RUNG.
 *
 * These ids end in `oslo` — a reader in Bergen got an empty scooter layer,
 * not because there are no scooters there but because the app only ever asked
 * about three Oslo systems. Discovery replaces the list when it answers; when
 * it does not, this is what was there before, so nothing gets worse.
 */
const SYSTEMS = [
  { id: 'boltoslo',  name: 'Bolt' },
  { id: 'voioslo',   name: 'Voi'  },
  { id: 'tieroslo',  name: 'Tier' },
];

/**
 * A tidy name for a system id.
 *
 * `boltoslo` → Bolt, `voibergen` → Voi. The city is a suffix on the operator,
 * so the operator is the id with the known city off the end — and anything
 * unrecognised keeps its own id capitalised rather than being renamed to
 * something invented.
 */
export function operatorName(id) {
  const s = String(id || '');
  const known = ['bolt', 'voi', 'tier', 'ryde', 'dott'];
  const hit = known.find(k => s.startsWith(k));
  if (hit) return hit.charAt(0).toUpperCase() + hit.slice(1);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Sparkesykkel';
}
// One name for the whole app. These calls used to send a second, different
// one, so half the traffic could not be attributed to us — which matters
// exactly when Entur throttles or someone asks who is calling.
const HDR  = { headers: { 'ET-Client-Name': ET_CLIENT_NAME } };

let _cache = null;

export function fetchScooters(lat, lon) {
  const now = Date.now();
  if (_cache && now - _cache.ts < 30000) return Promise.resolve(_rank(_cache.data, lat, lon));

  return discoverSystems().then(found => {
    // A docked scheme is a city-bike system and belongs to bysykkel.js; this
    // file draws the free-floating vehicles.
    const list = found.length
      ? found.filter(f => !/bysykkel|citybike/i.test(f.id))
        .map(f => ({ id: f.id, name: operatorName(f.id) }))
      : SYSTEMS;
    logMsg('mobilitet: ' + list.length + ' systemer'
      + (found.length ? '' : ' (oppdagelse tom, bruker Oslo-lista)'),
    found.length ? 'ok' : null);

    return Promise.allSettled(
      list.map(sys =>
        fetch(`${BASE}/${sys.id}/free_bike_status`, HDR)
          .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then(j => ((j.data && j.data.bikes) || []).map(v => ({ ...v, _op: sys.name })))
      )
    );
  }).then(results => {
    const vehicles = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    _cache = { ts: Date.now(), data: vehicles };
    return _rank(vehicles, lat, lon);
  });
}

/**
 * How much is left in a scooter — and how much of that we actually know.
 *
 * Reported: «Batteriprosenten er feil, den viser alltid 100%». It did.
 * `current_range_meters / 250` assumed a 25 km maximum and clamped, so every
 * vehicle holding 25 km or more read exactly 100 — and most feeds report a
 * full-ish range. Worse, the range was then reconstructed FROM that clamped
 * percentage downstream (`battery * 0.25`), so «100 %» always became «ca 25
 * km» and the "can it get me there" check ran on a number the app had made up.
 *
 * A percentage is only reported when the feed gives one. GBFS carries
 * `current_fuel_percent` as a 0–1 fraction for exactly this, and it was sitting
 * in the payload unread. Without it there is no honest percentage to compute:
 * a range in metres says nothing about a percentage unless you know the
 * vehicle's maximum, and we do not.
 *
 * The RANGE is kept as it was given, because that is the real datum and the
 * one the reader can act on — «ca 24 km» answers "will it get me there" in a
 * way a percentage never does.
 *
 * Cannot be checked from this sandbox: whether Entur passes
 * `current_fuel_percent` through. If it does not, the app shows the range and
 * no percentage, which is what it knows. That is the honest failure mode, and
 * it is why the percentage is not derived from anything.
 */
export function vehicleCharge(v) {
  const f = v && v.current_fuel_percent;
  // GBFS says 0–1. Some feeds send 0–100 instead; a value above 1 can only be
  // the latter, since a fraction cannot exceed 1.
  const pct = typeof f === 'number' && f >= 0
    ? Math.round(f > 1 ? Math.min(100, f) : f * 100)
    : null;
  const rangeM = typeof (v && v.current_range_meters) === 'number' && v.current_range_meters >= 0
    ? Math.round(v.current_range_meters) : null;
  return { pct, rangeM };
}

export function _rank(vehicles, lat, lon) {
  return vehicles
    .filter(v => !v.is_reserved && !v.is_disabled && v.lat && v.lon
      && Math.round(haver(lat, lon, v.lat, v.lon)) <= 1000)
    .map(v => {
      const { pct, rangeM } = vehicleCharge(v);
      return {
        lat:      v.lat,
        lon:      v.lon,
        pct,
        rangeM,
        operator: v._op || 'Sparkesykkel',
        type:     'scooter',
        dist:     Math.round(haver(lat, lon, v.lat, v.lon)),
      };
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 8);
}
