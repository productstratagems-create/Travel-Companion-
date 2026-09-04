/**
 * What the reader actually uses.
 *
 * Its own module, and it imports only storage. Two consumers now need the
 * departure counts — the settings suggestions that have always had them, and
 * the "du er ved" ranking on auto-reise — and letting the second read
 * `t.freqDep` on its own would give one key TWO READERS IN TWO FILES. That is
 * the bug shape this codebase has found in v1.65.0, v1.68.0, v1.71.0,
 * v1.76.0 and v1.77.0, every time by writing the same idea down twice.
 *
 * A file with no imports of its own also cannot land in an import cycle —
 * the reason api/stopCats.js exists.
 */
import { storage } from '../storage.js';

const FREQ_DEP_KEY = 't.freqDep';
const FREQ_ARR_KEY = 't.freqArr';
const FREQ_MAX     = 10;

const _key = (role) => (role === 'dep' ? FREQ_DEP_KEY : FREQ_ARR_KEY);

/** @returns {Array<{name,count,lastUsed,lat,lon,stopId}>} most used first */
export function loadFreq(role) {
  try {
    const v = storage.get(_key(role));
    const list = v ? JSON.parse(v) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

export function saveFreq(role, list) {
  try { storage.set(_key(role), JSON.stringify(list)); } catch { /* quota */ }
}

/**
 * Count one use of a place.
 *
 * Identity is the trimmed, case-insensitive NAME. `stopId` rides along and is
 * the better key when both sides have it — but it is null whenever the route
 * came from a typed or geocoded place, so it can never be the identity.
 */
export function trackPlace(role, name, meta) {
  if (!name) return;
  const list = loadFreq(role);
  const norm = String(name).trim();
  const idx = list.findIndex(p => p && String(p.name).toLowerCase() === norm.toLowerCase());
  if (idx !== -1) {
    list[idx].count += 1;
    list[idx].lastUsed = Date.now();
    if (meta) Object.assign(list[idx], { lat: meta.lat, lon: meta.lon, stopId: meta.stopId || null });
  } else {
    list.push({
      name: norm, count: 1, lastUsed: Date.now(),
      lat: meta && meta.lat, lon: meta && meta.lon,
      stopId: (meta && meta.stopId) || null,
    });
  }
  list.sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed);
  saveFreq(role, list.slice(0, FREQ_MAX));
}

/**
 * How many times each departure stop has been used, ready to look up.
 *
 * Keyed both ways: by lowercased name, which always exists, and by stopId
 * where there is one. The caller prefers the id and falls back to the name.
 */
export function depUses() {
  const byName = new Map();
  const byId = new Map();
  loadFreq('dep').forEach(p => {
    if (!p || !p.name) return;
    const n = Number(p.count) || 0;
    byName.set(String(p.name).trim().toLowerCase(), n);
    if (p.stopId) byId.set(p.stopId, n);
  });
  return { byName, byId };
}

/** How many times this stop has been departed from. 0 when never. */
export function usesOf(stop, uses) {
  if (!stop || !uses) return 0;
  if (stop.id && uses.byId.has(stop.id)) return uses.byId.get(stop.id);
  const n = String(stop.name || '').trim().toLowerCase();
  return (n && uses.byName.get(n)) || 0;
}
