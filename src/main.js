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
import { landingChoice, exampleDir, isExample, upgradeToNearest } from './firstRun.js';
import { locateUser, updateWalkDbg, loadWeekendMode, loadAutoMode, autoModePref, saveAutoMode } from './geo.js';
import { startRenderLoop } from './scheduler.js';
import { loadJny, activateTracking } from './journey.js';
import { startBoard, refreshBoard } from './views/board.js';
import config from './config.js';
import { initSettings, showSettings, showPrefs, applyRoute, applyRouteFromState, loadDest, saveDep, saveDest, setActiveRoute, loadActiveRoute } from './views/settings.js';
import { getActiveProfile, storage } from './storage.js';
import { state } from './state.js';

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

// Auto-reise is a mode now (see src/views/auto.js and the ⚡ item in nav.js).
// What used to live here guessed your destination from history and refused to
// do anything without it, so the feature was unusable on day one.
window._renderAuto = renderAuto;
window._refreshBoard = refreshBoard;
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

// One ladder, in firstRun.js, so this cannot drift from the pure function
// that tests it — it already did once: the auto-reise rung added here in
// v1.54.0 never reached landingChoice, and the tests went on pinning a
// ladder the app did not have. This branches on the decision; it does not
// re-make it.
const restored = loadJny();
const stored = loadActiveRoute();
const savedDest = loadDest();
const landing = landingChoice({
  hasJourney: !!restored,
  hasDeepLink: prefilledRoute,
  autoPref: autoModePref(),
  weekend: loadWeekendMode(),
  storedRoute: !!stored,
  savedDest,
});

// THE ROUTE IS APP STATE, NOT A LANDING DECISION — settled before the branch.
//
// It used to be applied only on the rung that opened the board, so a reader
// whose app opened on auto-reise or utforsk had a board still holding
// config.dirs[0]: Jernbanetorget → Nationaltheatret, a stranger's route. That
// was invisible while there was no way to the board except one that rebuilt
// it — and the fixed menu is exactly such a way, so "tavla" would have shown
// someone else's departures. Found by seeding a saved route in the
// end-to-end run and reading the header.
//
// The deep link has already set the route, with `chosen`, so it is left alone.
let hasRoute = prefilledRoute;
if (!hasRoute && stored) {
  setActiveRoute(stored);   // no `chosen`: restoring, not choosing
  hasRoute = true;
} else if (!hasRoute && savedDest) {
  // The old path that rebuilds a route from two names, dropping ids and
  // coordinates on the way. It can still fail, and then the example answers.
  hasRoute = applyRouteFromState(savedDest);
}
if (!hasRoute) {
  // Open a working board rather than an empty form.
  //
  // Assigned directly instead of through setActiveRoute, on purpose — the
  // example is not a choice the reader made, so it must not be saved as
  // their route, counted among their places, or fed to the smart engine.
  // The next visit is still a first visit until they pick something.
  const ex = exampleDir();
  if (ex) { config.dirs[2] = ex; state.dIdx = 2; hasRoute = true; }
}
updateHeader();

if (landing === 'journey') {
  state.jny = restored;
  activateTracking();
} else if (landing === 'auto') {
  // Landing here by DEFAULT makes it a choice, and writes it down.
  //
  // Not bookkeeping: everything downstream — the ⋯ menu's on/off state, the
  // GPS callbacks in this file that keep a position-first screen alive — asks
  // loadAutoMode(), which knows only an explicit '1'. Left unwritten, the
  // default would put a new reader on the screen and then let nothing feed
  // it: measured, the first end-to-end run landed on auto-reise and sat on
  // "finner ikke posisjonen din" with the fix already in hand.
  //
  // It is also what was asked for — the mode stays on until the reader turns
  // it off — and it makes the menu tell the truth about the screen they are
  // looking at.
  if (autoModePref() === null) saveAutoMode(true);
  resetAuto();
  renderAuto();
  show('v-auto');
} else if (landing === 'leisure') {
  renderLeisure();
  show('v-leisure');
} else if (hasRoute) {
  // deeplink, stored, legacy and example all open the same screen.
  startBoard();
} else {
  showSettings();
  show('v-settings');
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
}, () => {
  // A denial has to reach the screen too. Auto-reise is position-first, so
  // "no position" is not a silent non-event there — it is the whole content
  // of the screen, and it has to say so rather than sit on "finner ikke
  // posisjonen din ennå" forever, which reads as still-looking.
  if (loadAutoMode()) renderAuto();
});
