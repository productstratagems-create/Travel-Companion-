import config from '../config.js';
import { state } from '../state.js';
import { addFav } from './favs.js';
import { storage } from '../storage.js';
import { renderBoardProfileSwitcher, setActiveRoute, syncRouteFields } from '../views/settings.js';
import { saveWeekendMode } from '../geo.js';
import { loadReturn, returnDir, returnWindow, shouldSwitch, skipToday, loadSkip } from '../api/returnTrip.js';
import { shouldAsk } from './support.js';
import { confirmTap } from './confirm.js';
import { stopSelRefresh } from '../views/selected.js';
import { toggleSpectatePanel, closeSpectatePanel } from '../views/spectate.js';

export function closeBoardMenu() {
  const menu = document.getElementById('board-more-menu');
  const btn = document.getElementById('board-more-btn');
  if (menu) menu.style.display = 'none';
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

export function toggleBoardMenu() {
  const menu = document.getElementById('board-more-menu');
  const btn = document.getElementById('board-more-btn');
  if (!menu || !btn) return;
  const open = menu.style.display === 'none' || !menu.style.display;
  menu.style.display = open ? 'flex' : 'none';
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  // Chipen styrer samme meny, så den bærer samme tilstand.
  const chip = document.getElementById('header-profile-chip');
  if (chip) chip.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) renderBoardProfileSwitcher();
}

/**
 * Browser history.
 *
 * Every screen change pushes an entry, so a back-swipe moves between screens
 * instead of leaving the app — which is what it used to do, from every screen,
 * and is far more noticeable now the app installs standalone.
 *
 * The URL never changes: entries carry the view id in history.state only. The
 * `?from=&to=` deep link and the GitHub Pages subpath both keep working
 * untouched, and there is no route table to keep in sync.
 */
const HISTORY_FALLBACK = 'v-board';

// Suppressed during startup (before the landing view is stamped) and while a
// popstate is being applied — restoring a view must not push a new entry.
let _pushEnabled = false;

// How many entries we have pushed on top of our own landing entry. Lets
// goBack() tell "there is a screen behind this one" from "behind this is
// whatever the user was doing before they opened the app".
let _depth = 0;

/**
 * Some screens only exist while the state behind them does. Landing on
 * "underveis" with no journey, because the entry outlived a cleared journey,
 * would show an empty shell.
 */
function _reachable(id) {
  if (id === 'v-selected') return !!state.sel;
  if (id === 'v-track')    return !!state.jny;
  // Walk runs a loop that only selected.js can start, so it is deliberately
  // not re-enterable by going forward. Backing *out* of it works, which is
  // the direction that matters.
  if (id === 'v-walk')     return false;
  return true;
}

// What each screen needs in order to be live rather than merely visible.
// These mirror the in-page back buttons below.
const _enter = {
  'v-board':    () => window._startBoard && window._startBoard(),
  'v-selected': () => window._renderSelected && window._renderSelected(),
  'v-track':    () => {},
  'v-settings': () => window._showSettings && window._showSettings(),
  'v-prefs':    () => window._showPrefs && window._showPrefs(),
  'v-saved':    () => window._renderSaved && window._renderSaved(),
  'v-leisure':  () => window._renderLeisure && window._renderLeisure(),
};

function _restore(id) {
  // Leaving cleanup, same as the back buttons do.
  const from = 'v-' + state.view;
  if (from === 'v-selected') stopSelRefresh();
  if (from === 'v-walk') window._stopWalk && window._stopWalk();

  let target = _reachable(id) ? id : HISTORY_FALLBACK;
  if (id === 'v-walk' && state.sel) target = 'v-selected';
  if (target === 'v-board') { stopSelRefresh(); state.sel = null; }

  _pushEnabled = false;
  show(target);
  _pushEnabled = true;
  // Keep the entry honest about where we actually ended up, so pressing back
  // again doesn't bounce off the same unreachable screen.
  if (target !== id) { try { history.replaceState({ v: target }, ''); } catch {} }
  (_enter[target] || (() => {}))();
}

/**
 * The in-page back buttons. Popping the entry the user actually arrived from
 * is more accurate than any hardcoded destination, and it stops a session of
 * tapping in and out of departures from growing the stack without bound.
 *
 * `fallbackId` covers the case where there is nothing of ours to pop — a deep
 * link, or the very first screen — because going back past our own first entry
 * would leave the app, which is the behaviour this whole module exists to fix.
 */
export function goBack(fallbackId) {
  if (_depth > 0) { history.back(); return; }
  _restore(fallbackId);
}

/** Called once, after startup has settled on its landing screen. */
export function initHistory() {
  try { history.replaceState({ v: 'v-' + state.view }, ''); } catch {}
  _pushEnabled = true;
  window.addEventListener('popstate', e => {
    if (_depth > 0) _depth--;
    _restore((e.state && e.state.v) || HISTORY_FALLBACK);
  });
}

export function show(id) {
  closeSpectatePanel();
  closeBoardMenu();
  if (id !== 'v-selected') window._destroySelMap && window._destroySelMap();
  ['v-board', 'v-selected', 'v-walk', 'v-track', 'v-settings', 'v-prefs', 'v-saved', 'v-leisure'].forEach(v => {
    // Clear the inline style rather than stamping `block`. The board is a flex
    // column under `html.view-board`, and an inline `display:block` beats that
    // stylesheet rule on specificity — which collapsed the column, left the
    // departure list sized to its own content inside a viewport that cannot
    // scroll, and made the list unscrollable after any navigation back to the
    // board. Every view is a plain div, so the empty string is `block` for
    // the ones that want it.
    document.getElementById(v).style.display = (v === id ? '' : 'none');
  });
  state.view = id.replace('v-', '');
  // The board is a fixed screen: everything above the departure list stays
  // put and only the list scrolls. Scoped to a body class so every other
  // screen keeps scrolling as an ordinary page.
  document.documentElement.classList.toggle('view-board', id === 'v-board');
  window.scrollTo(0, 0);
  // Move focus to the new screen so screen-reader users land at its top
  document.getElementById(id).focus({ preventScroll: true });
  // Hide sticky chip when already on the tracking screen; it would be redundant there
  const chip = document.getElementById('onboard-chip');
  if (chip) chip.classList.toggle('chip-on-track', id === 'v-track');

  // Re-showing the screen you are already on — a tab switch inside "lagret",
  // re-applying the same route — is not a navigation and must not stack an
  // entry, or back would have to be pressed once per no-op.
  if (_pushEnabled && !(history.state && history.state.v === id)) {
    try { history.pushState({ v: id }, ''); _depth++; } catch {}
  }
}

export function updateHeader() {
  const dir = config.dirs[state.dIdx];
  document.getElementById('station-name').textContent = dir.from.toUpperCase();
  document.getElementById('dir-dest').textContent = dir.to;
  const viaLabel = document.getElementById('via-label');
  if (viaLabel) {
    viaLabel.textContent = 'via ' + (dir.via || '');
    viaLabel.style.display = dir.via ? 'block' : 'none';
  }
  // The button's aria-label replaces its contents, so spell the route out —
  // otherwise a screen reader gets "Endre rute" with no idea which route.
  const routeBtn = document.getElementById('station-name-btn');
  if (routeBtn) {
    routeBtn.setAttribute('aria-label',
      'Endre rute: ' + dir.from + (dir.via ? ' via ' + dir.via : '') + ' til ' + dir.to);
  }
  document.title = dir.from + (dir.via ? ' via ' + dir.via : '') + ' → ' + dir.to;
}

function toggleDir() {
  const dir = config.dirs[state.dIdx];
  if (dir.key === 'custom-out') {
    // Reversing a real route is a choice like any other: you are travelling
    // B→A now, so the form, the storage, the autocomplete and the prediction
    // engine all follow.
    setActiveRoute({
      key: 'custom-out',
      from: dir.to, to: dir.from,
      stopId: null, toStopId: null,
      filter: null,
      geo: dir.to, toGeo: dir.from,
      line: null,
      via: dir.via || null,
      viaStopId: dir.viaStopId || null,
      viaGeo: dir.viaGeo || null,
    }, { chosen: true });
  } else {
    // The neutral pair is a placeholder, only reachable before a route has
    // been set. It must not go through setActiveRoute: that would promote a
    // default nobody picked into the saved route, and count «Jernbanetorget
    // → Nationaltheatret» among the places this person uses.
    state.dIdx = state.dIdx === 0 ? 1 : 0;
    storage.set(config.storage.dir, String(state.dIdx));
    syncRouteFields(config.dirs[state.dIdx]);
  }
  updateHeader();
  state.deps = [];
  show('v-board');
  window._startBoard && window._startBoard();
}

// The route that was showing before the trip home took over, so «✕» has
// somewhere to put you back.
let _preReturnDir = null;

/**
 * Show the way home when the time comes.
 *
 * Called from the board's own poll rather than from a new timer — the same
 * arrangement `window._updatePlanCtx` already uses. Switching goes through
 * setActiveRoute WITHOUT `chosen`: the app is applying its own guess, and
 * counting it would let that guess reinforce itself, exactly as
 * `_applySmartRoute` notes.
 *
 * @returns {boolean} true when it changed the route.
 */
export function maybeSwitchToReturn() {
  const r = loadReturn();
  if (!r || !shouldSwitch(r, Date.now(), loadSkip())) {
    if (!r || !returnWindow(r, Date.now()).active) renderReturnToast(null);
    return false;
  }
  const dir = returnDir(r);
  const cur = config.dirs[state.dIdx];
  if (cur && cur.from === dir.from && cur.to === dir.to) {
    renderReturnToast(r);
    return false;
  }
  _preReturnDir = cur && cur.from && cur.to ? { ...cur } : null;
  setActiveRoute(dir);
  updateHeader();
  state.deps = [];
  renderReturnToast(r);
  window._startBoard && window._startBoard();
  return true;
}

/**
 * The «hjem 16:20 ✕» line above the board.
 *
 * Reuses #smart-toast, which has been sitting in the markup fully styled —
 * aria-live, a cancel button, a light-theme variant — with no JS referring to
 * it since it was added.
 */
export function renderReturnToast(r) {
  const el = document.getElementById('smart-toast');
  if (!el) return;
  if (!r) { el.style.display = 'none'; return; }
  const dest = el.querySelector('.smart-toast-dest');
  if (dest) dest.textContent = r.to + ' ' + r.atHHMM;
  const label = el.querySelector('span');
  if (label && !label.dataset.ret) {
    label.dataset.ret = '1';
    label.childNodes[0].nodeValue = '🏠 hjem → ';
  }
  if (!el._retBound) {
    el._retBound = true;
    const cancel = el.querySelector('.smart-toast-cancel');
    if (cancel) {
      cancel.addEventListener('click', () => {
        // Declined for today. The flag is a date, so it expires by itself.
        skipToday(Date.now());
        el.style.display = 'none';
        if (_preReturnDir) {
          setActiveRoute(_preReturnDir);
          _preReturnDir = null;
          updateHeader();
          state.deps = [];
          window._startBoard && window._startBoard();
        }
      });
    }
  }
  el.style.display = 'flex';
}

export function attachEventListeners() {
  document.getElementById('dir-btn').addEventListener('click', toggleDir);

  document.getElementById('station-name-btn').addEventListener('click', () => {
    window._showSettings && window._showSettings();
    show('v-settings');
  });

  document.getElementById('board-more-btn').addEventListener('click', toggleBoardMenu);

  const refreshBtn = document.getElementById('board-refresh-btn');
  if (refreshBtn) {
    // Full page reload, same as the browser's refresh button. Route, journey
    // and preferences all live in localStorage, so they survive the reload.
    refreshBtn.addEventListener('click', () => location.reload());
  }

  document.getElementById('smart-btn').addEventListener('click', () => {
    closeBoardMenu();
    window._smartMode && window._smartMode();
  });

  document.getElementById('prefs-btn').addEventListener('click', () => {
    window._showPrefs && window._showPrefs();
    show('v-prefs');
  });

  // Only offered when there is somewhere to send it, and never again once
  // followed — the item disappears rather than sitting there asking.
  const supBtn = document.getElementById('support-btn');
  if (supBtn) {
    supBtn.style.display = shouldAsk() ? 'flex' : 'none';
    supBtn.addEventListener('click', () => {
      window._showPrefs && window._showPrefs();
      show('v-prefs');
    });
  }

  document.getElementById('fav-btn').addEventListener('click', () => {
    show('v-saved');
    window._renderSaved && window._renderSaved('favs');
  });

  document.getElementById('plan-btn').addEventListener('click', () => {
    show('v-saved');
    window._renderSaved && window._renderSaved('plan');
  });

  ['s-plan-btn', 'w-plan-btn', 't-plan-btn', 'set-plan-btn'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => {
      show('v-saved');
      window._renderSaved && window._renderSaved('plan');
    });
  });

  document.querySelectorAll('.saved-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      window._renderSaved && window._renderSaved(btn.dataset.tab);
    });
  });

  document.getElementById('leisure-btn').addEventListener('click', () => {
    saveWeekendMode(true);
    show('v-leisure');
    window._renderLeisure && window._renderLeisure();
  });

  document.getElementById('spectate-btn').addEventListener('click', () => {
    show('v-saved');
    window._renderSaved && window._renderSaved('find');
  });
  document.getElementById('w-spec-btn').addEventListener('click', () => toggleSpectatePanel('follow-jny-panel-walk'));
  document.getElementById('t-spec-btn').addEventListener('click', () => toggleSpectatePanel('follow-jny-panel-track'));

  document.getElementById('saved-back').addEventListener('click', () => goBack('v-board'));

  document.getElementById('s-back').addEventListener('click', () => goBack('v-board'));

  document.getElementById('w-back').addEventListener('click', () =>
    goBack(state.sel ? 'v-selected' : 'v-board'));


  document.getElementById('alight-btn').addEventListener('click', (e) => {
    if (!confirmTap(e.currentTarget, 'sikker? trykk igjen', () => {
      window._clearJny && window._clearJny();
      show('v-board');
      window._startBoard && window._startBoard();
    })) return;
  });

  document.getElementById('route-btn').addEventListener('click', () => {
    window._showSettings && window._showSettings();
    show('v-settings');
  });

  document.getElementById('set-back').addEventListener('click', () => goBack('v-board'));

  document.getElementById('set-prefs-link').addEventListener('click', () => {
    window._showPrefs && window._showPrefs();
    show('v-prefs');
  });

  document.getElementById('prefs-back').addEventListener('click', () => goBack('v-board'));

  document.getElementById('set-apply').addEventListener('click', () => {
    if (window._applyRoute && window._applyRoute()) {
      updateHeader();
      state.deps = [];
      show('v-board');
      window._startBoard && window._startBoard();
    }
  });

  document.getElementById('set-save-fav').addEventListener('click', () => {
    const dir = config.dirs[state.dIdx];
    const added = addFav(dir);
    const msg = document.getElementById('set-fav-msg');
    msg.textContent = added ? '★ lagret' : 'allerede lagret';
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 2000);
  });

  document.getElementById('stop-set').addEventListener('click', () => {
    const v = document.getElementById('stop-input').value.trim();
    if (v) {
      config.dirs[state.dIdx].stopId = v;
      window._logMsg && window._logMsg('stop overstyrt: ' + v);
      window._fetchBoard && window._fetchBoard();
    }
  });

  document.getElementById('walk-set').addEventListener('click', () => {
    const v = parseInt(document.getElementById('walk-input').value, 10);
    state.walkOvr = (isNaN(v) || v <= 0) ? null : v;
    window._logMsg && window._logMsg('gangtid: ' + (state.walkOvr !== null ? state.walkOvr + ' min' : 'reset til beregnet'));
    window._updateWalkDbg && window._updateWalkDbg();
  });
}
