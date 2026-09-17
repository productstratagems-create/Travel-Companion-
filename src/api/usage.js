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
import { stopKey } from '../stopId.js';

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
 * Keyed both ways: by stopKey, which always exists, and by stopId where there
 * is one. The caller prefers the id and falls back to the name.
 *
 * The name key is `stopKey` from v1.107.0, not this file's own lowercase-only
 * normalisation. That one kept the comma and the trailing T, so a stop saved
 * as «Ryen T» and offered back as «Ryen» — or saved as «Skullerud» and offered
 * as «Skullerud, Oslo» — counted as never visited, and the ranking put a stop
 * you use daily below one you have never used. The index is rebuilt from the
 * history on every call, so changing the key orphans nothing on disk.
 */
export function depUses() {
  const byName = new Map();
  const byId = new Map();
  loadFreq('dep').forEach(p => {
    if (!p || !p.name) return;
    const n = Number(p.count) || 0;
    const k = stopKey(p.name);
    // Two history entries can now reduce to one key — «Ryen» and «Ryen T» are
    // one stop. Their counts add up rather than the last one winning.
    if (k) byName.set(k, (byName.get(k) || 0) + n);
    if (p.stopId) byId.set(p.stopId, n);
  });
  return { byName, byId };
}

/**
 * How many times this stop has been departed from. 0 when never.
 *
 * Id first, name second — the same order, and now the same name rule, as
 * `sameStop`. The id is read from `id` or `stopId` because the live responses
 * and the saved records disagree about which field it lives in.
 */
export function usesOf(stop, uses) {
  if (!stop || !uses) return 0;
  const id = stop.id || stop.stopId || null;
  if (id && uses.byId.has(id)) return uses.byId.get(id);
  const n = stopKey(stop.name);
  return (n && uses.byName.get(n)) || 0;
}
