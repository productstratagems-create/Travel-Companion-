import config from '../config.js';
import { state, intervals } from '../state.js';
import { findArr } from '../geo.js';
import { fetchTrack } from '../api/entur.js';
import { logMsg } from '../ui/log.js';
import { show } from '../ui/nav.js';
import { startBoard } from './board.js';

function pad(n) { return String(n).padStart(2, '0'); }
function clk(v) { const d = new Date(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

function pastTransfer() {
  const tr = state.jny && state.jny.transfer;
  if (!tr || !tr.arrivalAtTransfer) return false;
  return Date.now() > new Date(tr.arrivalAtTransfer.time).getTime() + 180000; // 3 min grace
}

export function renderTrack() {
  if (!state.jny) return;
  const now = Date.now();
  const tr = state.jny.transfer;
  const past = tr ? pastTransfer() : false;

  // What we're counting down to
  const countingTo = (tr && !past && tr.arrivalAtTransfer) ? tr.arrivalAtTransfer : state.jny.arrival;
  const destTs = countingTo ? new Date(countingTo.time).getTime() : null;
  const diffMs = destTs ? destTs - now : null;
  const mLeft = diffMs !== null ? Math.floor(diffMs / 60000) : null;
  const arrived = mLeft !== null && mLeft < 0;

  // Auto-exit 5 min after final arrival
  if (arrived && (!tr || past) && diffMs !== null && diffMs < -300000) {
    show('v-board'); startBoard(); return;
  }

  const nEl = document.getElementById('t-num');
  const lEl = document.getElementById('t-lbl');

  if (tr && !past) {
    if (arrived) {
      nEl.textContent = 'BYTT'; nEl.className = 'track-num transfer'; lEl.textContent = 'gå av nå!';
    } else if (mLeft !== null) {
      nEl.textContent = mLeft; nEl.className = 'track-num' + (mLeft <= 2 ? ' urgent' : ''); lEl.textContent = 'min til bytte';
    } else {
      nEl.textContent = '—'; nEl.className = 'track-num'; lEl.textContent = 'venter på data';
    }
  } else {
    if (arrived) {
      nEl.textContent = 'ANKOMMET'; nEl.className = 'track-num arrived'; lEl.textContent = state.jny.dest;
    } else if (mLeft !== null) {
      nEl.textContent = mLeft; nEl.className = 'track-num' + (mLeft <= 2 ? ' urgent' : ''); lEl.textContent = 'min til ankomst';
    } else {
      nEl.textContent = '—'; nEl.className = 'track-num'; lEl.textContent = 'venter på data';
    }
  }

  const cEl = document.getElementById('t-clock'), laEl = document.getElementById('t-label');
  if (tr && !past && tr.arrivalAtTransfer) {
    cEl.textContent = tr.arrivalAtTransfer.clk;
    laEl.textContent = 'bytt på ' + tr.at.toLowerCase();
  } else if (state.jny.arrival) {
    cEl.textContent = state.jny.arrival.clk;
    laEl.textContent = 'ankommer ' + state.jny.dest.toLowerCase();
  } else {
    cEl.textContent = ''; laEl.textContent = '';
  }

  // Stop list
  const stops = state.jny.stops || [];
  const dn = tr ? tr.at.toLowerCase() : state.jny.dest.toLowerCase();
  let first = false, html = '';

  if (tr && past) {
    const stops2 = state.jny.stops2 || [];
    const dn2 = state.jny.dest.toLowerCase();
    if (stops2.length) {
      stops2.forEach(s => {
        const nm = (s.quay && s.quay.stopPlace && s.quay.stopPlace.name) || '?';
        const isDest = nm.toLowerCase() === dn2;
        const depT = s.expectedDepartureTime || s.aimedDepartureTime;
        const passed = depT && new Date(depT).getTime() < now - 10000;
        if (passed && !isDest) return;
        const arrT = s.expectedArrivalTime || s.aimedArrivalTime || depT;
        const arrTs = arrT ? new Date(arrT).getTime() : null;
        const isNext = !first && !isDest;
        if (isNext) first = true;
        const ma = arrTs ? Math.round((arrTs - now) / 60000) : null;
        const relTxt = ma === null ? '—' : ma <= 0 ? 'nå' : ma === 1 ? '1 min' : 'om ' + ma + ' min';
        const tag = isDest ? '<span class="stop-tag">stå av</span>' : isNext ? '<span class="stop-tag">neste</span>' : '';
        html += '<div class="stop' + (isDest ? ' dest' : isNext ? ' next' : '') + '">'
          + '<div class="stop-dot"></div>'
          + '<div class="stop-name">' + tag + nm + '</div>'
          + '<div class="stop-clock">' + (arrT ? clk(arrT) : '—') + '</div>'
          + '<div class="stop-rel">' + relTxt + '</div>'
          + '</div>';
      });
    } else {
      const cd = tr.connectingDep;
      html = '<div class="transfer-boarded">'
        + (cd ? '<span class="line-badge" style="background:' + cd.lineBg + '">' + cd.lineCode + '</span> ' : '')
        + 'ombord · ank. ' + (state.jny.arrival ? state.jny.arrival.clk : '—')
        + '</div>';
    }
  } else {
    let pastTransferStop = false;
    stops.forEach(s => {
      if (pastTransferStop) return;
      const nm = (s.quay && s.quay.stopPlace && s.quay.stopPlace.name) || '?';
      const isTransfer = tr && nm.toLowerCase() === dn;
      const isDest = !tr && nm.toLowerCase() === dn;
      const depT = s.expectedDepartureTime || s.aimedDepartureTime;
      const passed = depT && new Date(depT).getTime() < now - 10000;
      if (passed && !isTransfer && !isDest) return;
      const arrT = s.expectedArrivalTime || s.aimedArrivalTime || depT;
      const arrTs = arrT ? new Date(arrT).getTime() : null;
      const isNext = !first && !isTransfer && !isDest;
      if (isNext) first = true;
      const ma = arrTs ? Math.round((arrTs - now) / 60000) : null;
      const relTxt = ma === null ? '—' : ma <= 0 ? 'nå' : ma === 1 ? '1 min' : 'om ' + ma + ' min';
      const tag = isTransfer ? '<span class="stop-tag bytt-tag">bytt</span>'
        : isDest ? '<span class="stop-tag">stå av</span>'
        : isNext ? '<span class="stop-tag">neste</span>'
        : '';
      html += '<div class="stop' + (isTransfer ? ' transfer' : isDest ? ' dest' : isNext ? ' next' : '') + '">'
        + '<div class="stop-dot"></div>'
        + '<div class="stop-name">' + tag + nm + '</div>'
        + '<div class="stop-clock">' + (arrT ? clk(arrT) : '—') + '</div>'
        + '<div class="stop-rel">' + relTxt + '</div>'
        + '</div>';
      if (isTransfer) pastTransferStop = true;
    });
  }

  document.getElementById('t-stops').innerHTML = html || '<div class="state-msg" style="padding:1rem;font-size:11px">laster…</div>';

  // Connecting train panel
  const tEl = document.getElementById('t-transfer');
  if (tEl) {
    if (tr && tr.connectingDep && !past) {
      const mToDep = Math.round((new Date(tr.connectingDep.time).getTime() - now) / 60000);
      const depStatus = mToDep > 0 ? 'om ' + mToDep + ' min' : mToDep === 0 ? 'nå' : 'avgått';
      tEl.style.display = 'block';
      tEl.innerHTML = '<div class="connecting-train">'
        + '<span class="ct-label">byttetog</span>'
        + '<div class="ct-detail">'
        + '<span class="line-badge" style="background:' + tr.connectingDep.lineBg + '">' + tr.connectingDep.lineCode + '</span>'
        + (tr.connectingDep.frontText ? '<span class="ct-dest">' + tr.connectingDep.frontText + '</span>' : '')
        + '</div>'
        + '<div class="ct-detail ct-detail-2">'
        + (tr.connectingDep.quay ? '<span class="ct-quay">spor ' + tr.connectingDep.quay + '</span>' : '')
        + '<span class="ct-time">avg <strong>' + tr.connectingDep.clk + '</strong> · ' + depStatus + '</span>'
        + (state.jny.arrival ? '<span class="ct-arr">→ ank. ' + state.jny.arrival.clk + '</span>' : '')
        + '</div>'
        + '</div>';
    } else {
      tEl.style.display = 'none';
    }
  }
}

export function buildTrackBar() {
  const tr = state.jny.transfer;
  let badges = '<span class="line-badge" style="background:' + state.jny.lineBg + '">' + state.jny.lineCode + '</span>';
  if (tr && tr.connectingDep) {
    badges += '<span class="transfer-arrow">→</span>'
      + '<span class="line-badge" style="background:' + tr.connectingDep.lineBg + '">' + tr.connectingDep.lineCode + '</span>';
  }
  document.getElementById('t-train-bar').innerHTML =
    badges
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
  if (!state.jny) return;
  const tr = state.jny.transfer;
  const past = tr ? pastTransfer() : false;
  const jid = (tr && past && tr.connectingDep && tr.connectingDep.journeyId)
    ? tr.connectingDep.journeyId
    : state.jny.journeyId;
  if (!jid) return;
  fetchTrack(jid)
    .then(calls => {
      if (!calls) return;
      if (tr && past) {
        state.jny.stops2 = calls;
        const d = findArr(calls, state.jny.dest);
        if (d) {
          const t = d.expectedArrivalTime || d.aimedArrivalTime;
          if (t) { state.jny.arrival = { time: t, clk: clk(t) }; logMsg('ank2 ' + state.jny.arrival.clk, 'ok'); }
        }
      } else {
        state.jny.stops = calls;
        if (tr && !past) {
          const d = findArr(calls, tr.at);
          if (d) {
            const t = d.expectedArrivalTime || d.aimedArrivalTime;
            if (t) {
              if (!tr.arrivalAtTransfer) tr.arrivalAtTransfer = {};
              tr.arrivalAtTransfer.time = t;
              tr.arrivalAtTransfer.clk = clk(t);
              logMsg('bytt ank ' + tr.arrivalAtTransfer.clk, 'ok');
            }
          }
        } else {
          const d = findArr(calls, state.jny.dest);
          if (d) {
            const t = d.expectedArrivalTime || d.aimedArrivalTime;
            if (t) { state.jny.arrival = { time: t, clk: clk(t) }; logMsg('ank ' + state.jny.arrival.clk, 'ok'); }
          }
        }
      }
    })
    .catch(err => logMsg('track ✗ ' + err.message, 'err'));
}

window._simBytt = function(minsFromNow) {
  if (!state.jny || !state.jny.transfer) return;
  const t = new Date(Date.now() + minsFromNow * 60000);
  state.jny.transfer.arrivalAtTransfer = {
    time: t.toISOString(),
    clk: pad(t.getHours()) + ':' + pad(t.getMinutes()),
  };
};
window._simEtterBytt = function() {
  if (!state.jny || !state.jny.transfer) return;
  const t = new Date(Date.now() - 200000);
  state.jny.transfer.arrivalAtTransfer = {
    time: t.toISOString(),
    clk: pad(t.getHours()) + ':' + pad(t.getMinutes()),
  };
};
