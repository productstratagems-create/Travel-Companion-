import config from '../config.js';
import { state, intervals } from '../state.js';
import { findArr } from '../geo.js';
import { fetchTrack } from '../api/entur.js';
import { logMsg } from '../ui/log.js';
import { show } from '../ui/nav.js';
import { startBoard } from './board.js';

function pad(n) { return String(n).padStart(2, '0'); }
function clk(v) { const d = new Date(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

let stopsExpanded = false;

function renderStopRow(r, isNext) {
  const tag = r.isTransfer ? '<span class="stop-tag bytt-tag">bytt</span>'
    : r.isDest ? '<span class="stop-tag">stå av</span>'
    : isNext ? '<span class="stop-tag">neste</span>' : '';
  const cls = r.isTransfer ? ' transfer' : r.isDest ? ' dest' : isNext ? ' next' : '';
  return '<div class="stop' + cls + '">'
    + '<div class="stop-dot"></div>'
    + '<div class="stop-name">' + tag + r.nm + '</div>'
    + '<div class="stop-clock">' + (r.arrT ? clk(r.arrT) : '—') + '</div>'
    + '<div class="stop-rel">' + r.relTxt + '</div>'
    + '</div>';
}
function normStn(s) { return s.toLowerCase().replace(/\s+t$/i, '').trim(); }

function pastTransfer() {
  const tr = state.jny && state.jny.transfer;
  if (!tr || !tr.arrivalAtTransfer) return false;
  return Date.now() >= new Date(tr.arrivalAtTransfer.time).getTime();
}

export function renderTrack() {
  if (!state.jny) return;
  const now = Date.now();
  const tr = state.jny.transfer;
  const past = tr ? pastTransfer() : false;
  // pastDep: connecting train has departed → user is on the second leg
  const pastDep = past && tr && tr.connectingDep
    ? now >= new Date(tr.connectingDep.time).getTime()
    : past;

  // What we're counting down to (for auto-exit)
  const countingTo = (tr && !past && tr.arrivalAtTransfer) ? tr.arrivalAtTransfer : state.jny.arrival;
  const destTs = countingTo ? new Date(countingTo.time).getTime() : null;
  const diffMs = destTs ? destTs - now : null;
  const mLeft = diffMs !== null ? Math.floor(diffMs / 60000) : null;
  const arrived = mLeft !== null && mLeft < 0;

  // Auto-exit 5 min after final arrival
  if (arrived && (!tr || pastDep) && diffMs !== null && diffMs < -300000) {
    show('v-board'); startBoard(); return;
  }

  const nEl = document.getElementById('t-num');
  const lEl = document.getElementById('t-lbl');

  if (tr && !past) {
    // First leg: count down to transfer arrival
    if (mLeft !== null) {
      nEl.textContent = mLeft; nEl.className = 'track-num' + (mLeft <= 2 ? ' urgent' : ''); lEl.textContent = 'min til bytte';
    } else {
      nEl.textContent = '—'; nEl.className = 'track-num'; lEl.textContent = 'venter på data';
    }
  } else if (tr && past && !pastDep) {
    // Platform waiting: count down to connecting train departure
    const mToDep = tr.connectingDep
      ? Math.round((new Date(tr.connectingDep.time).getTime() - now) / 60000)
      : null;
    if (mToDep !== null) {
      nEl.textContent = Math.max(0, mToDep);
      nEl.className = 'track-num' + (mToDep <= 1 ? ' urgent' : '');
      lEl.textContent = 'min til avgang';
    } else {
      nEl.textContent = '—'; nEl.className = 'track-num'; lEl.textContent = 'venter på data';
    }
  } else {
    // Second leg or single-leg: count down to final arrival
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
  } else if (tr && past && !pastDep && tr.connectingDep) {
    cEl.textContent = tr.connectingDep.clk;
    laEl.textContent = 'avgang fra ' + tr.at.toLowerCase();
  } else if (state.jny.arrival) {
    cEl.textContent = state.jny.arrival.clk;
    laEl.textContent = 'ankommer ' + normStn(state.jny.dest);
  } else {
    cEl.textContent = ''; laEl.textContent = '';
  }

  // Stop list
  const stops = state.jny.stops || [];
  const dn = tr ? normStn(tr.at) : normStn(state.jny.dest);
  let html = '';

  function renderStopRows(rows) {
    const TAIL = 2;
    let out = '', firstRendered = false;
    if (!stopsExpanded && rows.length > TAIL + 1) {
      [rows[0], { isCollapse: true, count: rows.length - 1 - TAIL }, ...rows.slice(-TAIL)].forEach(r => {
        if (r.isCollapse) {
          out += '<div class="stop-collapse" onclick="window._expandStops&&window._expandStops()">· ' + r.count + ' stopp ·</div>';
          return;
        }
        const isNext = !firstRendered && !r.isTransfer && !r.isDest;
        if (isNext) firstRendered = true;
        out += renderStopRow(r, isNext);
      });
    } else {
      rows.forEach(r => {
        const isNext = !firstRendered && !r.isTransfer && !r.isDest;
        if (isNext) firstRendered = true;
        out += renderStopRow(r, isNext);
      });
      if (rows.length > TAIL + 1) {
        out += '<div class="stop-collapse" onclick="window._expandStops&&window._expandStops()">· vis færre ·</div>';
      }
    }
    return out;
  }

  if (tr && pastDep) {
    const stops2 = state.jny.stops2 || [];
    const dn2 = normStn(state.jny.dest);
    if (stops2.length) {
      const rows2 = [];
      let pastTransferStop2 = false, pastDestStop = false;
      stops2.forEach(s => {
        if (pastDestStop) return;
        const nm = (s.quay && s.quay.stopPlace && s.quay.stopPlace.name) || '?';
        if (!pastTransferStop2) {
          if (normStn(nm) === normStn(tr.at)) pastTransferStop2 = true;
          else return;
        }
        const isDest = normStn(nm) === dn2;
        const depT = s.expectedDepartureTime || s.aimedDepartureTime;
        const passed = depT && new Date(depT).getTime() < now - 10000;
        if (passed && !isDest) return;
        const arrT = s.expectedArrivalTime || s.aimedArrivalTime || depT;
        const arrTs = arrT ? new Date(arrT).getTime() : null;
        const ma = arrTs ? Math.round((arrTs - now) / 60000) : null;
        const relTxt = ma === null ? '—' : ma <= 0 ? 'nå' : ma === 1 ? '1 min' : 'om ' + ma + ' min';
        rows2.push({ nm, arrT, ma, relTxt, isTransfer: false, isDest });
        if (isDest) pastDestStop = true;
      });
      html = renderStopRows(rows2);
    } else {
      const cd = tr.connectingDep;
      html = '<div class="transfer-boarded">'
        + (cd ? '<span class="line-badge" style="background:' + cd.lineBg + '">' + cd.lineCode + '</span> ' : '')
        + 'ombord · ank. ' + (state.jny.arrival ? state.jny.arrival.clk : '—')
        + '</div>';
    }
  } else if (tr && past && !pastDep) {
    // Platform waiting: show a placeholder — byttetog panel carries the useful info
    html = '<div class="state-msg" style="padding:1rem;font-size:11px;color:#57534e">venter på perrongen · ' + tr.at.toLowerCase() + '</div>';
  } else {
    // Indicate current train position before the boarding station
    if (state.jny.from) {
      const boardingName = state.jny.from.toLowerCase();
      let nextPreStop = null, stopsAway = 0;
      for (const s of stops) {
        const nm = (s.quay && s.quay.stopPlace && s.quay.stopPlace.name) || '?';
        if (nm.toLowerCase() === boardingName) break;
        const depT = s.expectedDepartureTime || s.aimedDepartureTime;
        const isp = depT && new Date(depT).getTime() < now - 10000;
        if (!isp) {
          if (!nextPreStop) nextPreStop = { nm, arrT: s.expectedArrivalTime || s.aimedArrivalTime || depT };
          stopsAway++;
        }
      }
      if (nextPreStop) {
        const arrTs = nextPreStop.arrT ? new Date(nextPreStop.arrT).getTime() : null;
        const ma = arrTs ? Math.round((arrTs - now) / 60000) : null;
        const relTxt = ma !== null ? (ma <= 0 ? ' · nå' : ' · om ' + ma + ' min') : '';
        html += '<div class="pre-board-info">'
          + '<span class="pre-board-label">toget er nå ved</span> '
          + nextPreStop.nm.toLowerCase()
          + relTxt
          + ' · ' + stopsAway + ' stopp til avgang'
          + '</div>';
      }
    }

    const rows1 = [];
    let pastBoarding = !state.jny.from;
    let pastTransferStop = false;
    stops.forEach(s => {
      if (pastTransferStop) return;
      const nm = (s.quay && s.quay.stopPlace && s.quay.stopPlace.name) || '?';
      if (!pastBoarding) {
        if (normStn(nm) === normStn(state.jny.from)) pastBoarding = true;
        else return;
      }
      const isTransfer = tr && normStn(nm) === dn;
      const isDest = !tr && normStn(nm) === dn;
      const depT = s.expectedDepartureTime || s.aimedDepartureTime;
      const passed = depT && new Date(depT).getTime() < now - 10000;
      if (passed && !isTransfer && !isDest) return;
      const arrT = s.expectedArrivalTime || s.aimedArrivalTime || depT;
      const arrTs = arrT ? new Date(arrT).getTime() : null;
      const ma = arrTs ? Math.round((arrTs - now) / 60000) : null;
      const relTxt = ma === null ? '—' : ma <= 0 ? 'nå' : ma === 1 ? '1 min' : 'om ' + ma + ' min';
      rows1.push({ nm, arrT, ma, relTxt, isTransfer, isDest });
      if (isTransfer) pastTransferStop = true;
    });
    html += renderStopRows(rows1);
  }

  document.getElementById('t-stops').innerHTML = html || '<div class="state-msg" style="padding:1rem;font-size:11px">laster…</div>';

  // Connecting train panel
  const tEl = document.getElementById('t-transfer');
  if (tEl) {
    if (tr && tr.connectingDep && !pastDep) {
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
  stopsExpanded = false;
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
  if (minsFromNow <= 0) _fetchTrack();
  renderTrack();
};
window._simEtterBytt = function() {
  if (!state.jny || !state.jny.transfer) return;
  const t = new Date(Date.now() - 1000);
  const ts = { time: t.toISOString(), clk: pad(t.getHours()) + ':' + pad(t.getMinutes()) };
  state.jny.transfer.arrivalAtTransfer = ts;
  // Also set connectingDep to past so we skip platform-waiting and go straight to second leg
  if (state.jny.transfer.connectingDep) {
    state.jny.transfer.connectingDep.time = ts.time;
    state.jny.transfer.connectingDep.clk = ts.clk;
  }
  _fetchTrack();
  renderTrack();
};

window._expandStops = () => { stopsExpanded = !stopsExpanded; renderTrack(); };
