import { state } from './state.js';
import config from './config.js';
import { enturFetch } from './api/http.js';
import { logMsg } from './ui/log.js';
import { storage } from './storage.js';
import { getWalkDist } from './api/walkDist.js';

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

/**
 * Auto-reise: position first.
 *
 * Beside the weekend mode on purpose — these are the two flags that decide
 * which screen the app opens on, and one place to look for them is worth more
 * than a tidy file boundary.
 */
const AUTO_MODE_KEY = 't.autoMode';
export function loadAutoMode() {
  return storage.get(AUTO_MODE_KEY) === '1';
}

/**
 * THREE states, not two: on, off, and never asked.
 *
 * Off used to be stored by deleting the key, which made "I turned this off"
 * and "I have never seen this" the same value. That was harmless while the
 * default was off — and became the one thing standing between the app and a
 * default that is ON for a reader with no history (v1.61.0). Reading absence
 * as "on" would have turned the mode back on for someone who had just turned
 * it off: a screen that comes back after you dismissed it.
 *
 * @returns {'on'|'off'|null} null when the reader has never chosen.
 */
export function autoModePref() {
  const v = storage.get(AUTO_MODE_KEY);
  return v === '1' ? 'on' : v === '0' ? 'off' : null;
}

export function saveAutoMode(v) {
  storage.set(AUTO_MODE_KEY, v ? '1' : '0');
}

const WEEKEND_MODE_KEY = 't.weekendMode';
export function loadWeekendMode() {
  return storage.get(WEEKEND_MODE_KEY) === '1';
}
export function saveWeekendMode(v) {
  if (v) storage.set(WEEKEND_MODE_KEY, '1'); else storage.remove(WEEKEND_MODE_KEY);
}

/**
 * WHICH SCREEN THE APP OPENS ON — one choice, spanning two flags.
 *
 * It was never a setting anyone could see. Both flags were written as a side
 * effect of navigating: «utforsk» in the ⋯ menu turned weekend mode on in
 * order to show that screen, and the ⚡ on the auto-reise header turned
 * auto-reise off in order to reach the board. Reported, exactly right: "at
 * auto-reise slås av går unevnt for bruker".
 *
 * The two flags must AGREE, and that is the whole reason this is a function
 * rather than two calls at each site. landingChoice (firstRun.js) reads auto
 * BEFORE weekend, so choosing "utforsk" while auto is still on picks a screen
 * that can never appear — a setting that silently does nothing.
 *
 * @returns {'tavla'|'auto'|'utforsk'}
 */
export function landingPref() {
  if (autoModePref() === 'on') return 'auto';
  if (loadWeekendMode()) return 'utforsk';
  return 'tavla';
}

/** Set it, keeping both flags consistent with the answer. */
export function saveLandingPref(v) {
  saveAutoMode(v === 'auto');
  saveWeekendMode(v === 'utforsk');
}

export function haver(la1, lo1, la2, lo2) {
  const R = 6371000, r = Math.PI / 180;
  const dL = (la2 - la1) * r, dN = (lo2 - lo1) * r;
  const a = Math.sin(dL / 2) * Math.sin(dL / 2)
    + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dN / 2) * Math.sin(dN / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * How long it takes you to reach your stop.
 *
 * The `× 1.3` is a detour multiplier: streets are not straight lines, and you
 * cannot walk through buildings. It is a reasonable guess and it has been the
 * only number here since the beginning — but the app also draws the REAL
 * walking route on the walk map, and now keeps its length (api/walkDist.js).
 * When that length exists it is used, because a measured route beats a
 * multiplier, and `src` says which one you got.
 *
 * Note the estimate is not deleted. The measurement arrives only after a
 * route has been fetched and drawn once, and the sanity band in `walkDist`
 * rejects a nonsense one — so `× 1.3` remains the answer on a first run, on a
 * new pair of points, and whenever the router says something impossible.
 */
export function walkInfo() {
  if (state.walkOvr !== null) return { mins: state.walkOvr, src: 'manuelt' };
  const pos = state.walkFromLL || state.homeLL;
  const sc = state.statLL[config.dirs[state.dIdx].key];
  if (pos && sc) {
    const spd = SPEED_MPN[loadWalkSpeed()] || 83.33;
    const buf = loadWalkBuffer();
    const crow = haver(pos.lat, pos.lon, sc.lat, sc.lon);
    const measured = getWalkDist(pos, sc, crow);
    const d = measured != null ? measured : crow * 1.3;
    return {
      mins: Math.max(1, Math.ceil(d / spd)) + buf,
      dist: Math.round(d),
      src: measured != null ? 'gangrute' : (state.walkFromLL ? 'sted' : 'beregnet'),
    };
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

// Where findNearestStation was last called from — NOT the last fix.
//
// Drift used to be measured fix-to-fix, and fixes arrive about once a second
// a metre or two apart, so the 200 m threshold never tripped while walking:
// walk 800 m to a different station and the app still believed you were at
// the old one, which isWalkActive() and the whole walk-time feature hang off.
// It also fired mainly when accuracy was poor, since rejected fixes let the
// fix-to-fix delta accumulate — re-resolving exactly when the position was
// least trustworthy.
let _stationAnchor = null;
const STATION_REFRESH_M = 200;

// A synchronous localStorage write on every accepted fix is ~60 main-thread
// writes a minute while walking. The position is a convenience on next launch,
// not a ledger.
const SAVE_EVERY_MS = 10_000;
let _savedAt = 0;

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

  // Cached position: call onFound immediately so the UI doesn't wait for GPS
  // warm-up. GPS still runs in the background and re-resolves stations once
  // you have actually moved.
  if (state.homeLL) {
    _stationAnchor = { lat: state.homeLL.lat, lon: state.homeLL.lon };
    findNearestStation(state.homeLL.lat, state.homeLL.lon, onFound, onFail);
  }

  _onFound = onFound;
  _onFail = onFail;
  _startWatch();
  _bindVisibility();
}

let _onFound = null;
let _onFail = null;

function _handleFix(pos) {
  const { latitude, longitude, accuracy } = pos.coords;
  state.gpsError = null;

  if (!state.homeLL || accuracy <= ACC_GATE) {
    state.homeLL = _ema(state.homeLL, { lat: latitude, lon: longitude });
    // Kept so staleness can be told. ACC_GATE silently discards anything worse
    // than ±40m once a fix exists — routine indoors, in a tunnel or in an
    // urban canyon — and without a timestamp the dot simply froze and nothing
    // could say so.
    state.posAt = pos.timestamp || Date.now();
    const now = Date.now();
    if (now - _savedAt >= SAVE_EVERY_MS) {
      _savedAt = now;
      storage.set(HOME_LL_KEY, JSON.stringify({ lat: state.homeLL.lat, lon: state.homeLL.lon }));
    }
    updateWalkDbg();
  }

  // Measured from the anchor, so a walk accumulates towards the threshold
  // instead of resetting at every fix.
  const drift = _stationAnchor
    ? haver(_stationAnchor.lat, _stationAnchor.lon, latitude, longitude)
    : Infinity;
  if (drift <= STATION_REFRESH_M) return;

  const first = !_stationAnchor;
  _stationAnchor = { lat: latitude, lon: longitude };
  if (first) {
    logMsg('✓ posisjon ±' + Math.round(accuracy) + 'm', 'ok');
    findNearestStation(latitude, longitude, _onFound || (() => {}), _onFail || (() => {}));
  } else {
    logMsg('posisjon oppdatert ±' + Math.round(accuracy) + 'm (' + Math.round(drift) + 'm drift)', 'ok');
    findNearestStation(latitude, longitude, () => {}, () => {});
  }
}

function _startWatch() {
  if (_watchId !== null || !navigator.geolocation) return;
  _watchId = navigator.geolocation.watchPosition(
    _handleFix,
    err => {
      if (err.code === 1) state.gpsError = 'denied';
      logMsg('posisjon: ' + err.message, 'err');
      if (!state.homeLL && _onFail) _onFail(err.message);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
  );
}

/**
 * Release the watch while the page is hidden.
 *
 * High-accuracy GPS ran for the whole session, on every screen and while the
 * tab was in the background — by a wide margin the most power-hungry thing
 * this app does. Deliberately not per-screen: re-acquiring a fix takes
 * seconds and screen switching is frequent, so that churn would cost more
 * than it saves.
 */
let _visBound = false;
function _bindVisibility() {
  if (_visBound || typeof document === 'undefined') return;
  _visBound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (_watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(_watchId);
        _watchId = null;
      }
      // The position outlives the watch; only the sensor stops.
      _flushPosition();
    } else {
      _startWatch();
    }
  });
  window.addEventListener('pagehide', _flushPosition);
}

function _flushPosition() {
  if (!state.homeLL) return;
  _savedAt = Date.now();
  storage.set(HOME_LL_KEY, JSON.stringify({ lat: state.homeLL.lat, lon: state.homeLL.lon }));
}

/**
 * Is the position old enough that it should not be presented as where you are?
 *
 * Same 60 seconds the board uses for departures and api/vehicles.js uses for
 * vehicle positions, for the same reason: a reading that stopped arriving
 * drifts silently, which is worse than admitting it is old.
 */
export const POS_STALE_MS = 60_000;

export function posAgeMins(now) {
  if (!state.posAt) return null;
  const age = (now == null ? Date.now() : now) - state.posAt;
  return age < POS_STALE_MS ? null : Math.floor(age / 60000);
}

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
