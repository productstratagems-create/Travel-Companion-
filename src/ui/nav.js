import config from '../config.js';
import { state, intervals } from '../state.js';

export function show(id) {
  ['v-board', 'v-selected', 'v-walk', 'v-track', 'v-settings'].forEach(v => {
    document.getElementById(v).style.display = (v === id ? 'block' : 'none');
  });
  state.view = id.replace('v-', '');
}

export function updateHeader() {
  const dir = config.dirs[state.dIdx];
  document.getElementById('station-name').textContent = dir.from.toUpperCase();
  document.getElementById('dir-dest').textContent = dir.to;
  document.title = dir.from + ' → ' + dir.to;
}

export function attachEventListeners() {
  // Imported lazily to avoid circular deps
  document.getElementById('dir-btn').addEventListener('click', () => {
    const dir = config.dirs[state.dIdx];
    if (dir.key === 'custom-out') {
      // Reverse the custom route in place; null stopIds so they get re-geocoded
      config.dirs[state.dIdx] = {
        key: 'custom-out',
        from: dir.to,
        to: dir.from,
        stopId: null,
        toStopId: null,
        filter: null,
        geo: dir.to,
        toGeo: dir.from,
        line: null,
      };
    } else {
      // Hardcoded routes: toggle 0 ↔ 1 only
      state.dIdx = state.dIdx === 0 ? 1 : 0;
    }
    try { localStorage.setItem(config.storage.dir, String(state.dIdx)); } catch {}
    updateHeader();
    state.deps = [];
    show('v-board');
    window._startBoard && window._startBoard();
  });

  document.getElementById('s-back').addEventListener('click', () => {
    stopSelRefreshBridge();
    state.sel = null;
    show('v-board');
    window._startBoard && window._startBoard();
  });

  document.getElementById('w-back').addEventListener('click', () => {
    if (state.sel) {
      show('v-selected');
      window._renderSelected && window._renderSelected();
    } else {
      show('v-board');
      window._startBoard && window._startBoard();
    }
  });

  document.getElementById('alight-btn').addEventListener('click', () => {
    window._clearJny && window._clearJny();
    if (intervals.track) { clearInterval(intervals.track); intervals.track = null; }
    window._updateOnboardChip && window._updateOnboardChip();
    show('v-board');
    window._startBoard && window._startBoard();
  });

  document.getElementById('route-btn').addEventListener('click', () => {
    window._showSettings && window._showSettings();
    show('v-settings');
  });

  document.getElementById('set-back').addEventListener('click', () => {
    show('v-board');
  });

  document.getElementById('set-apply').addEventListener('click', () => {
    if (window._applyRoute && window._applyRoute()) {
      updateHeader();
      state.deps = [];
      show('v-board');
      window._startBoard && window._startBoard();
    }
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

function stopSelRefreshBridge() {
  if (intervals.sel) { clearInterval(intervals.sel); intervals.sel = null; }
}
