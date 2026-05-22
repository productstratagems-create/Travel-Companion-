import './style/base.css';
import './style/components.css';
import './style/board.css';
import './style/selected.css';
import './style/walk.css';
import './style/track.css';
import './style/debug.css';

import { attachEventListeners, updateHeader } from './ui/nav.js';
import { initDebugToggle, logMsg } from './ui/log.js';
import { geocodeHome, updateWalkDbg } from './geo.js';
import { startRenderLoop } from './scheduler.js';
import { loadJny, activateTracking } from './journey.js';
import { startBoard } from './views/board.js';
import { initSettings, showSettings, applyRoute, loadCustomRoute } from './views/settings.js';
import { state } from './state.js';

// Expose helpers used via window bridges in nav.js and debug controls
window._logMsg = logMsg;
window._updateWalkDbg = updateWalkDbg;
window._showSettings = showSettings;
window._applyRoute = applyRoute;

attachEventListeners();
initDebugToggle();
initSettings();
loadCustomRoute();
updateHeader();
geocodeHome();
startRenderLoop();

const restored = loadJny();
if (restored) {
  state.jny = restored;
  state.jny.stops = [];
  startBoard();
  activateTracking();
} else {
  startBoard();
}
