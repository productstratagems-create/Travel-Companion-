import 'leaflet/dist/leaflet.css';
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

import { attachEventListeners, updateHeader, show } from './ui/nav.js';
import { initTheme } from './theme.js';
import './views/favs.js';
import './views/plan.js';
import { renderLeisure } from './views/leisure.js';
import { initDebugToggle, logMsg } from './ui/log.js';
import { locateUser, updateWalkDbg, loadWeekendMode } from './geo.js';
import { startRenderLoop } from './scheduler.js';
import { loadJny, activateTracking } from './journey.js';
import { startBoard } from './views/board.js';
import config from './config.js';
import { initSettings, showSettings, showPrefs, applyRoute, applyRouteFromState, loadDest, saveDep, saveDest } from './views/settings.js';
import { state } from './state.js';

// Prefill from/to/travelTime (and optionally stop IDs / coords) via deep
// link query params (e.g. from Wakety). When stop IDs or coordinates are
// given, build the route directly so it doesn't depend on name-matching
// via the geocoder or GPS.
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
    config.dirs[2] = {
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
    };
    state.dIdx = 2;
    applied = true;
  }

  if (from || to || travelTime) {
    history.replaceState(null, '', window.location.pathname);
  }
  return applied;
})();

// Expose helpers used via window bridges in nav.js and debug controls
window._logMsg = logMsg;
window._updateWalkDbg = updateWalkDbg;
window._showSettings = showSettings;
window._showPrefs = showPrefs;
window._applyRoute = applyRoute;
window._renderLeisure = renderLeisure;

initTheme();
attachEventListeners();
initDebugToggle();
initSettings();
updateHeader();
startRenderLoop();

// Journey restore: activate immediately if a journey is in progress
const restored = loadJny();
if (restored) {
  state.jny = restored;
  activateTracking();
  // GPS runs in background to refresh walk time for next trip
  locateUser(() => {}, () => {});
} else if (prefilledRoute) {
  updateHeader();
  startBoard();
  // GPS runs in background to refresh walk time for next trip
  locateUser(() => {}, () => {});
} else {
  // GPS-first: detect nearest station, then decide what to show
  locateUser(
    (station) => {
      if (loadWeekendMode()) {
        renderLeisure();
        show('v-leisure');
      } else {
        const dest = loadDest();
        if (dest) {
          applyRouteFromState(dest);
          updateHeader();
          startBoard();
        } else {
          showSettings();
          show('v-settings');
        }
      }
    },
    () => {
      // GPS denied or failed
      if (loadWeekendMode()) {
        renderLeisure();
        show('v-leisure');
      } else {
        const dest = loadDest();
        if (dest) { applyRouteFromState(dest); updateHeader(); startBoard(); }
        else { showSettings(); show('v-settings'); }
      }
    }
  );
}
