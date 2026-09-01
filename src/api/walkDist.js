/**
 * How long the walk to your stop actually is.
 *
 * `walkInfo()` has always estimated it as crow-flight × 1.3 — a detour
 * multiplier standing in for streets, crossings and the fact that you cannot
 * walk through buildings. That number decides when the app tells you to leave
 * the house, so it is one of the few estimates in here that people plan by.
 *
 * Meanwhile the app already fetches the REAL walking route for the same two
 * points (walk.js draws it on the walk map) and throws the length away,
 * reading only the shape. This keeps the length.
 *
 * Measured from the line's own vertices with `measurePath`, not from the
 * router's summary field: the app has two routers, and "the length of the
 * line we drew" is one rule that holds for both — and is the same length the
 * reader can see on the map.
 *
 * The crow-flight distance is passed IN rather than computed here. `haver`
 * lives in geo.js, geo.js is what reads this module, and a cycle between the
 * two is not worth a one-line convenience.
 */
import { storage } from '../storage.js';
import { measurePath } from '../ui/path.js';

const KEY = 't.walkDist';
const MAX_ENTRIES = 24;

/**
 * A key that survives GPS jitter.
 *
 * Four decimals is about 11 m. Finer and a phone standing still would miss
 * its own cached entry every few seconds and re-fetch for ever; coarser and
 * two genuinely different doorways would share an answer.
 */
export function walkKey(from, to) {
  const r = (n) => Number(n).toFixed(4);
  return r(from.lat) + ',' + r(from.lon) + '>' + r(to.lat) + ',' + r(to.lon);
}

function load() {
  try {
    const raw = storage.get(KEY);
    const o = raw ? JSON.parse(raw) : null;
    return o && typeof o === 'object' ? o : {};
  } catch { return {}; }
}

/**
 * Is this length believable?
 *
 * A walking route cannot be shorter than the straight line between its ends,
 * and one more than three times that is a router that has snapped an end onto
 * the wrong side of a fjord or routed you round a closed park. Either way the
 * estimate is the better answer — and this is the guard that keeps a bad
 * route from quietly moving when the app says to leave.
 */
export function plausible(metres, crowMetres) {
  if (!(metres > 0) || !(crowMetres > 0)) return false;
  return metres >= crowMetres * 0.95 && metres <= crowMetres * 3;
}

/** The measured length for this pair, or null when there is none to trust. */
export function getWalkDist(from, to, crowMetres) {
  if (!from || !to) return null;
  const hit = load()[walkKey(from, to)];
  if (typeof hit !== 'number') return null;
  return plausible(hit, crowMetres) ? hit : null;
}

/**
 * Remember the length of a route someone just drew.
 *
 * Kept in storage rather than in memory so the honest number is there on the
 * first render of the next morning, not after the map has loaded again.
 */
export function saveWalkDist(from, to, latlngs, crowMetres) {
  if (!from || !to || !Array.isArray(latlngs) || latlngs.length < 2) return null;
  const m = measurePath(latlngs);
  const metres = m && m.total;
  if (!plausible(metres, crowMetres)) return null;
  const all = load();
  all[walkKey(from, to)] = Math.round(metres);
  // Oldest out first. A commuter has a handful of pairs; a wanderer should not
  // grow this without bound.
  const keys = Object.keys(all);
  if (keys.length > MAX_ENTRIES) keys.slice(0, keys.length - MAX_ENTRIES).forEach(k => delete all[k]);
  try { storage.set(KEY, JSON.stringify(all)); } catch { /* full or blocked */ }
  return Math.round(metres);
}
