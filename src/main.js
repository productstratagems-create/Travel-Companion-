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
import { state } from './state.js';

// Expose helpers used via window bridges in nav.js and debug controls
window._logMsg = logMsg;
window._updateWalkDbg = updateWalkDbg;

attachEventListeners();
initDebugToggle();
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
