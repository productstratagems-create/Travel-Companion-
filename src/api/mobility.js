/**
 * Which shared-mobility systems exist near you.
 *
 * Both micromobility callers were pinned to Oslo: `scooters.js` asked three
 * operators named `boltoslo`/`voioslo`/`tieroslo`, and `bysykkel.js` fetched
 * Oslo Bysykkel's own host with `travel-companion-oslo` in the header. In
 * Bergen the scooter layer was empty and the city-bike layer was Oslo's
 * docks, hundreds of kilometres away.
 *
 * Entur aggregates every Norwegian system under one API, and its root lists
 * them. So: ask, and use what comes back.
 *
 * A LADDER, and the last rung is today's behaviour. The exact shape of the
 * discovery response cannot be checked from this sandbox — the proxy does not
 * reach api.entur.io — so the parser accepts the shapes the GBFS spec allows
 * and treats anything else as "no answer". Then the caller uses its own
 * hardcoded list, and the screen is exactly what it is today. A guess that
 * fails costs nothing; that is the only reason it is safe to make one.
 *
 * The result is logged, so the debug panel can say which systems were found.
 * An instrument that cannot be read is how three fixes in this project failed
 * to instrument anything.
 */
import { ET_CLIENT_NAME } from './http.js';

export const MOBILITY_BASE = 'https://api.entur.io/mobility/v2/gbfs';
const HDR = { headers: { 'ET-Client-Name': ET_CLIENT_NAME } };

let _systems = null;      // null = not asked yet, [] = asked and got nothing

/**
 * @returns {Promise<Array<{id: string}>>} possibly empty; never rejects
 */
export function discoverSystems() {
  if (_systems) return Promise.resolve(_systems);
  return fetch(MOBILITY_BASE, HDR)
    .then(r => (r.ok ? r.json() : null))
    .then(j => { _systems = parseSystems(j); return _systems; })
    .catch(() => { _systems = []; return _systems; });
}

/**
 * Pull system ids out of whatever the root returns.
 *
 * Written to accept the shapes GBFS discovery documents use — a bare array,
 * or an object with a `systems` / `datasets` list — and to ignore anything
 * else rather than throw. An id is the one field every shape agrees on.
 */
export function parseSystems(json) {
  const list = Array.isArray(json) ? json
    : (json && (json.systems || json.datasets)) || [];
  if (!Array.isArray(list)) return [];
  return list
    .map(s => (typeof s === 'string' ? { id: s } : (s && { id: s.id || s.system_id })))
    .filter(s => s && typeof s.id === 'string' && s.id);
}

/** Test seam: the discovery is asked once per session. */
export function _resetSystems() { _systems = null; }
