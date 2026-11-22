import 'leaflet/dist/leaflet.css';
import './style/fonts.css';
import './style/tokens.css';
import './style/base.css';
import './style/components.css';
import './style/board.css';
import './style/selected.css';
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
import { renderExplore } from './views/explore.js';
import { renderAuto, resetAuto, armAutoJump } from './views/auto.js';
import { initDebugToggle, logMsg } from './ui/log.js';
import { trengerPosForklaring } from './fasteStopp.js';
const POS_FORKLART_KEY = 't.posForklart';
import { landingChoice } from './firstRun.js';
import { nærmesteDir, erNærmeste, erEgenRute } from './dinRute.js';
import { locateUser, updateWalkDbg, loadWeekendMode, loadAutoMode, autoModePref, saveAutoMode } from './geo.js';
import { startRenderLoop } from './scheduler.js';
import { loadJny, activateTracking } from './journey.js';
import { renderTrack } from './views/track.js';
import { startBoard, refreshBoard } from './views/board.js';
import config from './config.js';
import { initSettings, showSettings, showPrefs, applyRoute, applyRouteFromState, loadDest, saveDep, saveDest, setActiveRoute, loadActiveRoute } from './views/settings.js';
import { getActiveProfile, storage } from './storage.js';
import { state } from './state.js';
import { nullstillVaneTelling } from './api/smart.js';
import { tellTrykk } from './api/knappebruk.js';
import { oppdaterTestStripe } from './ui/testStripe.js';

/* KNAPPEBRUK. Ett trykk telles der det skjer, med capture så en knapp som
 * stopper hendelsen selv også telles. Uten samtykke skriver tellTrykk
 * ingenting. */
if (typeof document !== 'undefined') {
  document.addEventListener('click', e => tellTrykk(e.target), true);
}

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
// «Utforsk» means journey search now; the places browser is a section of
// it, reached through renderPlaces. Both globals stay: the ⋯-menu door and
// the saved landing preference both name this screen.
window._renderLeisure = renderExplore;
void renderLeisure;

// Auto-reise is a mode now (see src/views/auto.js and the ⚡ item in nav.js).
// What used to live here guessed your destination from history and refused to
// do anything without it, so the feature was unusable on day one.
window._renderAuto = renderAuto;
window._renderTrack = renderTrack;   // menypunktet «underveis» (v1.218.118)
window._refreshBoard = refreshBoard;
window._resetAuto = resetAuto;

// The board's own poll asks this each time round, rather than a new timer —
// the same arrangement window._updatePlanCtx already uses.
window._maybeReturnSwitch = maybeSwitchToReturn;

const _vEl = document.getElementById('board-version');
if (_vEl) _vEl.textContent = 'v' + __APP_VERSION__;

// Først av alt, før noe leser vanene: tellingen byttet betydning i v1.202.0
// (trykk → reiser), og de gamle tallene nullstilles én gang per profil. Et
// profilbytte laster siden på nytt, så hver profil får sin egen.
nullstillVaneTelling();

initTheme();
registerServiceWorker();
initOfflineBanner();
attachEventListeners();
initDebugToggle();
initSettings();
// Testposisjon (v1.218.46): stripen fra første tegning.
oppdaterTestStripe();
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
  // Med seg selv som knapp, ikke klikket: `addEventListener('click',
  // toggleBoardMenu)` ga funksjonen hendelsen som argument.
  _profileChip.addEventListener('click', () => toggleBoardMenu(_profileChip));
}

// One ladder, in firstRun.js, so this cannot drift from the pure function
// that tests it — it already did once: the auto-reise rung added here in
// v1.54.0 never reached landingChoice, and the tests went on pinning a
// ladder the app did not have. This branches on the decision; it does not
// re-make it.
const restored = loadJny();
// Et gammelt lagret Oslo-eksempel er ingen rute (v1.218.261).
const _lagret = loadActiveRoute();
const stored = erEgenRute(_lagret) ? _lagret : null;
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
  // coordinates on the way. It can still fail, and then «din rute» answers.
  hasRoute = applyRouteFromState(savedDest);
}
if (!hasRoute) {
  // «Din rute» (v1.218.261), ikke et Oslo-eksempel: fra stoppet der du står,
  // til et søk. Satt direkte, ikke via setActiveRoute — plassholderen er ikke
  // et valg, og skal ikke lagres eller telles.
  config.dirs[2] = nærmesteDir(state.nearestStation); state.dIdx = 2; hasRoute = true;
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
  // Only here. Opening the app may go straight to the trip you always take;
  // tapping ⚡ in the nav bar must not, or the direction list becomes a place
  // you can only reach by going back.
  armAutoJump();
  renderAuto();
  show('v-auto');

} else if (landing === 'leisure') {
  renderExplore();
  show('v-leisure');
} else if (hasRoute) {
  // deeplink, stored, legacy and «din rute» all open the same screen.
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
// «Din rute» får «fra» fra nærmeste stopp når en posisjon kommer. Bare så
// lenge det fortsatt er plassholderen — et eget valg står.
// moment they choose something themselves, that choice stands.
/* POSISJONEN FORKLARES FØRST (v1.218.251, onboarding steg 1). Første gang —
   nettleseren har ikke spurt («prompt») — sier Auto-tavle hvorfor før
   nettleserens spørsmål kommer: «Appen viser avgangene der du står ·
   [Bruk posisjonen min] · velg sted i stedet». Uten Permissions-API: som før. */
const _startPos = () => locateUser(() => {
  // Auto-reise is a position-first screen, and a position that arrives after
  // the screen did is the ordinary case, not an edge one: GPS takes a second
  // or two and the app opens immediately. Without this the mode landed on
  // "Ingen avganger herfra nå" and stayed there — measured on the very first
  // end-to-end run.
  if (loadAutoMode()) { renderAuto(); return; }
  const cur = config.dirs[state.dIdx];
  // «Din rute» får «fra» når posisjonen kommer — med mindre brukeren alt
  // har valgt et annet fra-sted selv.
  if (!erNærmeste(cur) || cur._fraValgt || !state.nearestStation) return;
  const up = nærmesteDir(state.nearestStation);
  if (up.from === cur.from) return;
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
window.__startPos = () => { try { storage.set(POS_FORKLART_KEY, '1'); } catch { /* */ } state.posVenter = false; _startPos(); };
(navigator.permissions && navigator.permissions.query
  ? navigator.permissions.query({ name: 'geolocation' }).then(r => r.state, () => undefined)
  : Promise.resolve(undefined))
  .then(t => {
    let forklart = false; try { forklart = storage.get(POS_FORKLART_KEY) === '1'; } catch { /* */ }
    if (trengerPosForklaring(t, forklart) && loadAutoMode()) { state.posVenter = true; renderAuto(); }
    else _startPos();
  });
