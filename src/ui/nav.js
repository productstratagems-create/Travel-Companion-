import config from '../config.js';
import { state, intervals } from '../state.js';

export function show(id) {
  ['v-board', 'v-selected', 'v-walk', 'v-track'].forEach(v => {
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
    state.dIdx = (state.dIdx + 1) % config.dirs.length;
    try { localStorage.setItem(config.storage.dir, String(state.dIdx)); } catch {}
    updateHeader();
    state.deps = [];
    show('v-board');
    // start board is triggered from journey via window bridge
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
