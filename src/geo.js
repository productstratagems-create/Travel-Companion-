import { state } from './state.js';
import config from './config.js';
import { enturFetch } from './api/http.js';
import { logMsg } from './ui/log.js';
import { storage } from './storage.js';

const WALK_SPEED_KEY  = 't.walkSpeed';
const WALK_BUF_KEY    = 't.walkBuf';
const WALK_FROM_KEY   = 't.walkFrom';
const HOME_LL_KEY     = 't.homeLL';
export const SPEED_MPN = { rolig: 41.67, middels: 83.33, rask: 116.67 };

// Loose station-name match: lowercase, drop trailing ", area/city" qualifiers.
export function normStopName(s) {
  return String(s || '').toLowerCase().replace(/,.*$/, '').trim();
}

export function loadWalkSpeed() {
  return storage.get(WALK_SPEED_KEY) || 'middels';
}
export function saveWalkSpeed(v) {
  storage.set(WALK_SPEED_KEY, v);
}
export function loadWalkBuffer() {
  return parseInt(storage.get(WALK_BUF_KEY) || '2', 10);
}
export function saveWalkBuffer(v) {
  storage.set(WALK_BUF_KEY, String(v));
}

export function loadWalkFrom() {
  try { const v = storage.get(WALK_FROM_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}
export function saveWalkFrom(v) {
  if (v) storage.set(WALK_FROM_KEY, JSON.stringify(v)); else storage.remove(WALK_FROM_KEY);
}
export function clearWalkFrom() {
  state.walkFromLL = null;
  storage.remove(WALK_FROM_KEY);
}

const WEEKEND_MODE_KEY = 't.weekendMode';
export function loadWeekendMode() {
  return storage.get(WEEKEND_MODE_KEY) === '1';
}
export function saveWeekendMode(v) {
  if (v) storage.set(WEEKEND_MODE_KEY, '1'); else storage.remove(WEEKEND_MODE_KEY);
}

export function haver(la1, lo1, la2, lo2) {
  const R = 6371000, r = Math.PI / 180;
  const dL = (la2 - la1) * r, dN = (lo2 - lo1) * r;
  const a = Math.sin(dL / 2) * Math.sin(dL / 2)
    + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dN / 2) * Math.sin(dN / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function walkInfo() {
  if (state.walkOvr !== null) return { mins: state.walkOvr, src: 'manuelt' };
  const pos = state.walkFromLL || state.homeLL;
  const sc = state.statLL[config.dirs[state.dIdx].key];
  if (pos && sc) {
    const d = haver(pos.lat, pos.lon, sc.lat, sc.lon);
    const spd = SPEED_MPN[loadWalkSpeed()] || 83.33;
    const buf = loadWalkBuffer();
    return { mins: Math.max(1, Math.ceil(d * 1.3 / spd)) + buf, dist: Math.round(d), src: state.walkFromLL ? 'sted' : 'beregnet' };
  }
  return { mins: config.defaultWalkMinutes, src: 'standard' };
}

export function isWalkActive(dir) {
  if (dir.key === 'in') return false;
  if (state.walkFromLL !== null) return true;
  const ns = state.nearestStation;
  return ns !== null && dir.stopId === ns.id;
}

export function mToLeave(depTs) {
  const w = walkInfo();
  return Math.floor((depTs - w.mins * 60000 - Date.now()) / 60000);
}

export function reachCls(mtl) {
  if (mtl > 5)  return 'r-ok';
  if (mtl > 1)  return 'r-soon';
  if (mtl >= 0) return 'r-now';
  return 'missed';
}

export function findArr(calls, name) {
  if (!calls || !name) return null;
  const norm = s => s.toLowerCase().replace(/\s+t$/i, '').trim();
  const n = norm(name);
  for (let i = 0; i < calls.length; i++) {
    const nm = (calls[i].quay && calls[i].quay.stopPlace && calls[i].quay.stopPlace.name) || '';
    if (norm(nm) === n) return calls[i];
  }
  return null;
}

const TRANSIT_STOP_CATS = new Set(['metroStation', 'railStation', 'tramStop', 'busStation']);

export function findNearestStation(lat, lon, onFound, onFail) {
  enturFetch(config.api.geocoderReverse
    + '?point.lat=' + lat + '&point.lon=' + lon
    + '&boundary.circle.radius=5000&size=20&layers=venue')
    .then(r => r.json())
    .then(j => {
      const stops = ((j && j.features) || [])
        .filter(f => (f.properties.category || []).some(c => TRANSIT_STOP_CATS.has(c)))
        .map(f => ({
          name: f.properties.name || f.properties.label,
          id: f.properties.id,
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
          distM: Math.round(haver(lat, lon, f.geometry.coordinates[1], f.geometry.coordinates[0])),
          type: (f.properties.category || []).find(c => TRANSIT_STOP_CATS.has(c)) || 'unknown',
        }))
        .sort((a, b) => a.distM - b.distM)
        .slice(0, 8);
      if (!stops.length) { if (onFail) onFail('ingen stasjon i nærheten'); return; }
      state.nearestStations = stops;
      state.nearestStation = stops[0];
      state.statLL['custom-out'] = { lat: stops[0].lat, lon: stops[0].lon };
      logMsg('nærmeste: ' + stops[0].name + ' (' + stops[0].type + ')', 'ok');
      updateWalkDbg();
      if (onFound) onFound(stops[0]);
    })
    .catch(err => { if (onFail) onFail(err.message); });
}

// ── GPS: watchPosition with high-accuracy + EMA smoothing ────────────────────

const EMA_α   = 0.3;  // weight for incoming reading (0 = frozen, 1 = raw)
const ACC_GATE = 40;  // metres — skip updates noisier than this once we have a fix

let _watchId = null;

function _ema(prev, next) {
  if (!prev) return { lat: next.lat, lon: next.lon };
  return {
    lat: EMA_α * next.lat + (1 - EMA_α) * prev.lat,
    lon: EMA_α * next.lon + (1 - EMA_α) * prev.lon,
  };
}

export function locateUser(onFound, onFail) {
  if (!navigator.geolocation) {
    logMsg('geolokasjon ikke tilgjengelig', 'err');
    if (onFail) onFail('geolokasjon ikke tilgjengelig');
    return;
  }
  if (_watchId !== null) return; // single watch for the session lifetime

  // Cached position: call onFound immediately so the UI doesn't wait for GPS warm-up.
  // GPS will still run in background; significant drift (>200m) silently re-fetches stations.
  const hasCachedPos = !!state.homeLL;
  if (hasCachedPos) {
    findNearestStation(state.homeLL.lat, state.homeLL.lon, onFound, onFail);
  }

  _watchId = navigator.geolocation.watchPosition(
    pos => {
      const { latitude, longitude, accuracy } = pos.coords;
      state.gpsError = null;
      const prevLL = state.homeLL;
      if (!prevLL || accuracy <= ACC_GATE) {
        state.homeLL = _ema(state.homeLL, { lat: latitude, lon: longitude });
        storage.set(HOME_LL_KEY, JSON.stringify({ lat: state.homeLL.lat, lon: state.homeLL.lon }));
        updateWalkDbg();
      }
      const drift = prevLL ? haver(prevLL.lat, prevLL.lon, latitude, longitude) : Infinity;
      if (!hasCachedPos) {
        // First-ever fix: notify and find station
        logMsg('✓ posisjon ±' + Math.round(accuracy) + 'm', 'ok');
        findNearestStation(latitude, longitude, onFound, onFail);
      } else if (drift > 200) {
        // User is at a meaningfully different location — refresh stations silently
        logMsg('posisjon oppdatert ±' + Math.round(accuracy) + 'm (' + Math.round(drift) + 'm drift)', 'ok');
        findNearestStation(latitude, longitude, () => {}, () => {});
      }
    },
    err => {
      if (err.code === 1) state.gpsError = 'denied';
      logMsg('posisjon: ' + err.message, 'err');
      if (!state.homeLL && onFail) onFail(err.message);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
  );
}

// watchPosition keeps homeLL current — no periodic poll needed
export function refreshPosition() {}

export function updateWalkDbg() {
  const el = document.getElementById('walk-dbg');
  if (!el) return;
  const w = walkInfo();
  el.textContent = w.src + ': ~' + w.mins + ' min' + (w.dist ? ' (' + w.dist + ' m)' : '');
}

// Restore persisted positions on module load
const _wfSaved = loadWalkFrom();
if (_wfSaved && _wfSaved.lat && _wfSaved.lon) {
  state.walkFromLL = { lat: _wfSaved.lat, lon: _wfSaved.lon };
}
try {
  const _hlSaved = storage.get(HOME_LL_KEY);
  if (_hlSaved) { const p = JSON.parse(_hlSaved); if (p && p.lat) state.homeLL = p; }
} catch { /* ignore */ }
