import config from './config.js';
import { state, intervals } from './state.js';
import { findArr } from './geo.js';
import { logMsg } from './ui/log.js';
import { updateOnboardChip } from './ui/chip.js';
import { show } from './ui/nav.js';
import { startBoard, stopBoard } from './views/board.js';
import { renderSelected, startSelRefresh, stopSelRefresh } from './views/selected.js';
import { buildTrackBar, startTracking } from './views/track.js';

function pad(n) { return String(n).padStart(2, '0'); }
function clk(v) { const d = new Date(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

export function tap(i) {
  state.sel = state.deps[i];
  if (!state.sel) return;
  stopBoard();
  show('v-selected');
  const old = document.getElementById('s-ctas');
  if (old) old.remove();
  startSelRefresh();
  renderSelected();
}

export function doBoard() {
  const c = state.sel;
  if (!c) return;
  const dir = config.dirs[state.dIdx];
  const sj = c.serviceJourney;
  const sjc = sj && sj.estimatedCalls;
  const arr = findArr(sjc, dir.to);
  const lbg = sj && sj.line && sj.line.presentation && sj.line.presentation.colour;
  state.jny = {
    journeyId: (sj && sj.id) || null,
    dest: dir.to,
    lineCode: (sj && sj.line && sj.line.publicCode) || config.line,
    lineBg: lbg ? '#' + lbg : '#7c2d12',
    frontText: (c.destinationDisplay && c.destinationDisplay.frontText) || dir.to,
    stops: sjc || [],
    boardedAt: Date.now(),
    arrival: arr && (arr.expectedArrivalTime || arr.aimedArrivalTime)
      ? { time: arr.expectedArrivalTime || arr.aimedArrivalTime, clk: clk(arr.expectedArrivalTime || arr.aimedArrivalTime) }
      : null,
  };
  saveJny();
  activateTracking();
}

export function activateTracking() {
  stopSelRefresh();
  buildTrackBar();
  logMsg('ombord L' + state.jny.lineCode + ' → ' + state.jny.dest + (state.jny.arrival ? ' (' + state.jny.arrival.clk + ')' : ''));
  state.sel = null;
  show('v-track');
  startTracking();
  updateOnboardChip();
}

export function saveJny() {
  try {
    localStorage.setItem(config.storage.journey, JSON.stringify({
      journeyId: state.jny.journeyId,
      dest: state.jny.dest,
      lineCode: state.jny.lineCode,
      lineBg: state.jny.lineBg,
      frontText: state.jny.frontText,
      boardedAt: state.jny.boardedAt,
      arrival: state.jny.arrival,
    }));
  } catch {}
}

export function loadJny() {
  try {
    const raw = localStorage.getItem(config.storage.journey);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!j.boardedAt || Date.now() - j.boardedAt > config.journeyMaxAgeMs) {
      localStorage.removeItem(config.storage.journey);
      return null;
    }
    return j;
  } catch { return null; }
}

export function clearJny() {
  state.jny = null;
  try { localStorage.removeItem(config.storage.journey); } catch {}
}

// Window bridges used by HTML inline handlers and nav.js
window.tap = tap;
window.doBoard = doBoard;
window._clearJny = clearJny;
window._updateOnboardChip = updateOnboardChip;
window.jnyGoTracking = activateTracking;
