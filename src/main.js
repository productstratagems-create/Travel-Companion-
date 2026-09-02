import 'leaflet/dist/leaflet.css';
import './style/fonts.css';
import './style/tokens.css';
import './style/base.css';
import './style/components.css';
import './style/board.css';
import './style/selected.css';
import './style/walk.css';
import './style/track.css';
import './style/debug.css';
import './style/settings.css';
import './style/favs.css';
import './style/leisure.css';
import './style/plan.css';
import './style/theme-light.css';

import { attachEventListeners, updateHeader, show, initHistory, toggleBoardMenu, maybeSwitchToReturn } from './ui/nav.js';
import { initTheme } from './theme.js';
import { registerServiceWorker, initOfflineBanner } from './pwa.js';
import './views/favs.js';
import './views/plan.js';
import { renderLeisure } from './views/leisure.js';
import { renderAuto, resetAuto } from './views/auto.js';
import { initDebugToggle, logMsg } from './ui/log.js';
import { exampleDir, isExample, upgradeToNearest } from './firstRun.js';
import { locateUser, updateWalkDbg, loadWeekendMode, loadAutoMode } from './geo.js';
import { startRenderLoop } from './scheduler.js';
import { loadJny, activateTracking } from './journey.js';
import { startBoard } from './views/board.js';
import config from './config.js';
import { initSettings, showSettings, showPrefs, applyRoute, applyRouteFromState, loadDest, loadDep, saveDep, saveDest, setActiveRoute, loadActiveRoute } from './views/settings.js';
import { getActiveProfile, storage } from './storage.js';
import { state } from './state.js';
import { predictDest } from './api/smart.js';

const prefilledRoute = (function applyPrefillFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const from = params.get('from');
  const to = params.get('to');
  const travelTime = params.get('travelTime');
  const fromStopId = params.get('fromStopId');
  const toStopId = params.get('toStopId');
  const fromLat = params.get('fromLat');
  const fromLon = params.get('fromLon');
  const toLat = params.get('toLat');
  const toLon = params.get('toLon');

  let applied = false;
  if (from) saveDep(from);
  if (to) saveDest(to);
  if (travelTime) {
    const mins = Number(travelTime);
    if (!isNaN(mins) && mins > 0) state.walkOvr = mins;
  }

  if (from && to) {
    setActiveRoute({
      key: 'custom-out',
      from,
      to,
      stopId: fromStopId || null,
      toStopId: toStopId || null,
      filter: null,
      geo: fromStopId ? null : from,
      toGeo: toStopId ? null : to,
      line: null,
      _fromLat: fromLat ? Number(fromLat) : null,
      _fromLon: fromLon ? Number(fromLon) : null,
      _toLat: toLat ? Number(toLat) : null,
      _toLon: toLon ? Number(toLon) : null,
    }, { chosen: true });
    applied = true;
  }

  if (from || to || travelTime) {
    history.replaceState(null, '', window.location.pathname);
  }
  return applied;
})();

window._logMsg = logMsg;
window._updateWalkDbg = updateWalkDbg;
window._showSettings = showSettings;
window._showPrefs = showPrefs;
window._applyRoute = applyRoute;
window._renderLeisure = renderLeisure;

function _applySmartRoute(ns, dest) {
  // Prefer a nearby station that matches the historically-used departure stop;
  // fall back to the GPS-nearest station, then to the saved departure name.
  const nearby = state.nearestStations || (ns ? [ns] : []);
  const preferred = dest.fromStopId
    ? nearby.find(s => s.id === dest.fromStopId) || ns
    : ns;
  const dep = preferred || ns;
  const from = (dep && dep.name) || dest.fromName || loadDep();
  if (!from) return false;
  setActiveRoute({
    key: 'custom-out',
    from,
    to: dest.toName,
    stopId: dep ? dep.id : (dest.fromStopId || null),
    toStopId: dest.toStopId || null,
    filter: null,
    geo: (dep || dest.fromStopId) ? null : from,
    toGeo: dest.toStopId ? null : dest.toName,
    line: null,
    _fromLat: dep ? dep.lat : null,
    _fromLon: dep ? dep.lon : null,
    // No `chosen`: the smart engine is applying its own guess, and counting
    // it would let the prediction reinforce itself.
  });
  updateHeader();
  state.deps = [];
  return true;
}

// Auto-reise is a mode now (see src/views/auto.js and the ⚡ item in nav.js).
// What used to live here guessed your destination from history and refused to
// do anything without it, so the feature was unusable on day one.
window._renderAuto = renderAuto;
window._resetAuto = resetAuto;

// The board's own poll asks this each time round, rather than a new timer —
// the same arrangement window._updatePlanCtx already uses.
window._maybeReturnSwitch = maybeSwitchToReturn;

const _vEl = document.getElementById('board-version');
if (_vEl) _vEl.textContent = 'v' + __APP_VERSION__;

initTheme();
registerServiceWorker();
initOfflineBanner();
attachEventListeners();
initDebugToggle();
initSettings();
updateHeader();
startRenderLoop();

const _profileChip = document.getElementById('header-profile-chip');
if (_profileChip) {
  const _prof = getActiveProfile();
  if (_prof !== 'default') {
    _profileChip.textContent = _prof;
    _profileChip.style.display = 'inline-block';
  }
  // Samme veksling som ⋯ — chipen må også kunne lukke menyen den åpnet.
  _profileChip.addEventListener('click', toggleBoardMenu);
}

const restored = loadJny();
if (restored) {
  state.jny = restored;
  activateTracking();
} else if (prefilledRoute) {
  updateHeader();
  startBoard();
} else if (loadAutoMode()) {
  resetAuto();
  renderAuto();
  show('v-auto');
} else if (loadWeekendMode()) {
  renderLeisure();
  show('v-leisure');
} else {
  // The whole route if we kept one, and only then the old path that rebuilds
  // it from two names — which drops ids and coordinates on the way.
  const stored = loadActiveRoute();
  const savedDest = loadDest();
  if (stored) {
    // No `chosen`: restoring, not choosing.
    setActiveRoute(stored);
    updateHeader();
    startBoard();
  } else if (savedDest && applyRouteFromState(savedDest)) {
    updateHeader();
    startBoard();
  } else {
    // Nothing stored: open a working board rather than an empty form.
    //
    // Assigned directly instead of through setActiveRoute, on purpose — the
    // example is not a choice the reader made, so it must not be saved as
    // their route, counted among their places, or fed to the smart engine.
    // The next visit is still a first visit until they pick something.
    const ex = exampleDir();
    if (ex) {
      config.dirs[2] = ex;
      state.dIdx = 2;
      updateHeader();
      startBoard();
    } else {
      showSettings();
      show('v-settings');
    }
  }
}

// Only now is the landing screen settled, so this is where the first history
// entry gets stamped. Any show() above it is startup, not navigation.
initHistory();

// GPS runs in the background and only feeds walk time. It must never gate
// which route is shown: a slow or blocked fix used to mean startBoard() was
// never reached, leaving the board empty on a stale default route.
// The example board opens instantly; this upgrades it to the reader's own
// nearest stop once a fix arrives. Only while it is still the example — the
// moment they choose something themselves, that choice stands.
locateUser(() => {
  // Auto-reise is a position-first screen, and a position that arrives after
  // the screen did is the ordinary case, not an edge one: GPS takes a second
  // or two and the app opens immediately. Without this the mode landed on
  // "Ingen avganger herfra nå" and stayed there — measured on the very first
  // end-to-end run.
  if (loadAutoMode()) { renderAuto(); return; }
  const cur = config.dirs[state.dIdx];
  if (!isExample(cur)) return;
  const up = upgradeToNearest(cur, state.nearestStation);
  if (!up) return;
  config.dirs[state.dIdx] = up;
  updateHeader();
  state.deps = [];
  startBoard();
}, () => {});
