import config from '../config.js';
import { state, intervals } from '../state.js';
import { findArr } from '../geo.js';
import { fetchTrack } from '../api/entur.js';
import { logMsg } from '../ui/log.js';
import { show } from '../ui/nav.js';
import { startBoard } from './board.js';

function pad(n) { return String(n).padStart(2, '0'); }
function clk(v) { const d = new Date(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

export function renderTrack() {
  if (!state.jny) return;
  const now = Date.now();
  const destTs = state.jny.arrival ? new Date(state.jny.arrival.time).getTime() : null;
  const diffMs = destTs ? destTs - now : null;
  const mLeft = diffMs !== null ? Math.floor(diffMs / 60000) : null;
  const arrived = mLeft !== null && mLeft < 0;
  if (arrived && diffMs !== null && diffMs < -300000) { show('v-board'); startBoard(); return; }

  const nEl = document.getElementById('t-num');
  const lEl = document.getElementById('t-lbl');
  if (arrived) {
    nEl.textContent = 'ANKOMMET'; nEl.className = 'track-num arrived'; lEl.textContent = state.jny.dest;
  } else if (mLeft !== null) {
    nEl.textContent = mLeft; nEl.className = 'track-num' + (mLeft <= 2 ? ' urgent' : ''); lEl.textContent = 'min til ankomst';
  } else {
    nEl.textContent = '—'; nEl.className = 'track-num'; lEl.textContent = 'venter på data';
  }

  const cEl = document.getElementById('t-clock'), laEl = document.getElementById('t-label');
  if (state.jny.arrival) {
    cEl.textContent = state.jny.arrival.clk;
    laEl.textContent = 'ankommer ' + state.jny.dest.toLowerCase();
  } else {
    cEl.textContent = ''; laEl.textContent = '';
  }

  const stops = state.jny.stops || [], dn = state.jny.dest.toLowerCase();
  let first = false, html = '';
  stops.forEach(s => {
    const nm = (s.quay && s.quay.stopPlace && s.quay.stopPlace.name) || '?';
    const isDest = nm.toLowerCase() === dn;
    const depT = s.expectedDepartureTime || s.aimedDepartureTime;
    const passed = depT && new Date(depT).getTime() < now - 10000;
    if (passed && !isDest) return;
    const arrT = s.expectedArrivalTime || s.aimedArrivalTime || depT;
    const arrTs = arrT ? new Date(arrT).getTime() : null;
    const isNext = !first && !isDest;
    if (isNext) first = true;
    const ma = arrTs ? Math.round((arrTs - now) / 60000) : null;
    const relTxt = ma === null ? '—' : ma <= 0 ? 'nå' : ma === 1 ? '1 min' : 'om ' + ma + ' min';
    html += '<div class="stop' + (isDest ? ' dest' : isNext ? ' next' : '') + '">'
      + '<div class="stop-dot"></div>'
      + '<div class="stop-name">'
      + (isDest ? '<span class="stop-tag">stå av</span>' : isNext ? '<span class="stop-tag">neste</span>' : '')
      + nm + '</div>'
      + '<div class="stop-clock">' + (arrT ? clk(arrT) : '—') + '</div>'
      + '<div class="stop-rel">' + relTxt + '</div>'
      + '</div>';
  });
  document.getElementById('t-stops').innerHTML = html || '<div class="state-msg" style="padding:1rem;font-size:11px">laster…</div>';
}

export function buildTrackBar() {
  document.getElementById('t-train-bar').innerHTML =
    '<span class="line-badge" style="background:' + state.jny.lineBg + '">' + state.jny.lineCode + '</span>'
    + '<span class="tb-dest">' + (state.jny.frontText || state.jny.dest) + '</span>'
    + (state.jny.arrival ? '<span class="tb-dep">ank <span>' + state.jny.arrival.clk + '</span></span>' : '');
}

export function startTracking() {
  if (intervals.track) clearInterval(intervals.track);
  _fetchTrack();
  intervals.track = setInterval(_fetchTrack, config.trackRefreshMs);
  if (intervals.board) { clearInterval(intervals.board); intervals.board = null; }
}

export function stopTracking() {
  if (intervals.track) { clearInterval(intervals.track); intervals.track = null; }
}

function _fetchTrack() {
  if (!state.jny || !state.jny.journeyId) return;
  fetchTrack(state.jny.journeyId)
    .then(calls => {
      if (!calls) return;
      state.jny.stops = calls;
      const d = findArr(calls, state.jny.dest);
      if (d) {
        const t = d.expectedArrivalTime || d.aimedArrivalTime;
        if (t) { state.jny.arrival = { time: t, clk: clk(t) }; logMsg('ank ' + state.jny.arrival.clk, 'ok'); }
      }
    })
    .catch(err => logMsg('track ✗ ' + err.message, 'err'));
}
