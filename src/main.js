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

import { attachEventListeners, updateHeader, show, initHistory } from './ui/nav.js';
import { initTheme } from './theme.js';
import { registerServiceWorker, initOfflineBanner } from './pwa.js';
import './views/favs.js';
import './views/plan.js';
import { renderLeisure } from './views/leisure.js';
import { initDebugToggle, logMsg } from './ui/log.js';
import { locateUser, updateWalkDbg, loadWeekendMode } from './geo.js';
import { startRenderLoop } from './scheduler.js';
import { loadJny, activateTracking } from './journey.js';
import { startBoard } from './views/board.js';
import config from './config.js';
import { initSettings, showSettings, showPrefs, applyRoute, applyRouteFromState, loadDest, loadDep, saveDep, saveDest, renderBoardProfileSwitcher, trackPlace, setActiveRoute, loadActiveRoute } from './views/settings.js';
import { getActiveProfile, storage } from './storage.js';
import { state } from './state.js';
import { recordSmartTrip, predictDest } from './api/smart.js';

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
    });
    applied = true;
    trackPlace('dep', from, { lat: fromLat ? Number(fromLat) : null, lon: fromLon ? Number(fromLon) : null, stopId: fromStopId || null });
    trackPlace('arr', to,   { lat: toLat   ? Number(toLat)   : null, lon: toLon   ? Number(toLon)   : null, stopId: toStopId   || null });
    recordSmartTrip(from, to, toStopId || null, toLat ? Number(toLat) : null, toLon ? Number(toLon) : null, fromStopId || null);
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
  });
  updateHeader();
  state.deps = [];
  return true;
}

window._smartMode = function() {
  const ns = state.nearestStation;
  const dest = predictDest();
  if (!dest) {
    logMsg('Ikke nok reisehistorikk ennå — reis manuelt noen ganger først.', 'err');
    return;
  }
  if (!_applySmartRoute(ns, dest)) {
    logMsg('Finner ikke posisjon. Aktiver GPS og prøv igjen.', 'err');
    return;
  }
  show('v-board');
  const label = dest.source === 'smart' ? '⚡ auto' : '⚡ hyppigst';
  logMsg(label + ': ' + config.dirs[2].from + ' → ' + dest.toName);
  window._startBoard && window._startBoard();
};

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
  _profileChip.addEventListener('click', () => {
    renderBoardProfileSwitcher();
    const menu = document.getElementById('board-more-menu');
    const btn  = document.getElementById('board-more-btn');
    if (menu) { menu.style.display = 'flex'; if (btn) btn.setAttribute('aria-expanded', 'true'); }
  });
}

const restored = loadJny();
if (restored) {
  state.jny = restored;
  activateTracking();
} else if (prefilledRoute) {
  updateHeader();
  startBoard();
} else if (loadWeekendMode()) {
  renderLeisure();
  show('v-leisure');
} else {
  // The whole route if we kept one, and only then the old path that rebuilds
  // it from two names — which drops ids and coordinates on the way.
  const stored = loadActiveRoute();
  const savedDest = loadDest();
  if (stored) {
    setActiveRoute(stored);
    updateHeader();
    startBoard();
  } else if (savedDest && applyRouteFromState(savedDest)) {
    updateHeader();
    startBoard();
  } else {
    showSettings();
    show('v-settings');
  }
}

// Only now is the landing screen settled, so this is where the first history
// entry gets stamped. Any show() above it is startup, not navigation.
initHistory();

// GPS runs in the background and only feeds walk time. It must never gate
// which route is shown: a slow or blocked fix used to mean startBoard() was
// never reached, leaving the board empty on a stale default route.
locateUser(() => {}, () => {});
