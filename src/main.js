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

import { attachEventListeners, updateHeader, show } from './ui/nav.js';
import './views/favs.js';
import { renderLeisure } from './views/leisure.js';
import { initDebugToggle, logMsg } from './ui/log.js';
import { locateUser, updateWalkDbg, loadWeekendMode } from './geo.js';
import { startRenderLoop } from './scheduler.js';
import { loadJny, activateTracking } from './journey.js';
import { startBoard } from './views/board.js';
import { initSettings, showSettings, applyRoute, applyRouteFromState, loadDest } from './views/settings.js';
import { state } from './state.js';

// Expose helpers used via window bridges in nav.js and debug controls
window._logMsg = logMsg;
window._updateWalkDbg = updateWalkDbg;
window._showSettings = showSettings;
window._applyRoute = applyRoute;
window._renderLeisure = renderLeisure;

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
