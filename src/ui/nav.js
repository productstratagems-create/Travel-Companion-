import config from '../config.js';
import { state, intervals } from '../state.js';
import { addFav } from './favs.js';

export function show(id) {
  ['v-board', 'v-selected', 'v-walk', 'v-track', 'v-settings', 'v-favs'].forEach(v => {
    document.getElementById(v).style.display = (v === id ? 'block' : 'none');
  });
  state.view = id.replace('v-', '');
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
  document.title = dir.from + (dir.via ? ' via ' + dir.via : '') + ' → ' + dir.to;
}

function toggleDir() {
  const dir = config.dirs[state.dIdx];
  if (dir.key === 'custom-out') {
    config.dirs[state.dIdx] = {
      key: 'custom-out',
      from: dir.to, to: dir.from,
      stopId: null, toStopId: null,
      filter: null,
      geo: dir.to, toGeo: dir.from,
      line: null,
    };
  } else {
    state.dIdx = state.dIdx === 0 ? 1 : 0;
  }
  try { localStorage.setItem(config.storage.dir, String(state.dIdx)); } catch {}
  updateHeader();
  state.deps = [];
  show('v-board');
  window._startBoard && window._startBoard();
}

export function attachEventListeners() {
  document.getElementById('dir-btn').addEventListener('click', toggleDir);

  document.getElementById('fav-btn').addEventListener('click', () => {
    show('v-favs');
    window._renderFavs && window._renderFavs();
  });

  document.getElementById('fav-back').addEventListener('click', () => {
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

function stopSelRefreshBridge() {
  if (intervals.sel) { clearInterval(intervals.sel); intervals.sel = null; }
}
