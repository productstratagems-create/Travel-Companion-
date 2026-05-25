import config from '../config.js';
import { state, intervals } from '../state.js';
import { findArr } from '../geo.js';
import { fetchTrack } from '../api/entur.js';
import { logMsg } from '../ui/log.js';
import { show } from '../ui/nav.js';
import { startBoard } from './board.js';
import { renderAlerts } from '../ui/alerts.js';

function pad(n) { return String(n).padStart(2, '0'); }
function clk(v) { const d = new Date(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

let expanded = [];

function normStn(s) { return s.toLowerCase().replace(/\s+t$/i, '').trim(); }

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

// Returns { phase: 'riding'|'platform'|'arrived', i, next? }
function computeState(now) {
  const legs = state.jny && state.jny.legs;
  if (!legs || !legs.length) return { phase: 'arrived', i: 0 };
  for (let i = 0; i < legs.length; i++) {
    const arrTs = legs[i].arrTime ? new Date(legs[i].arrTime.time).getTime() : null;
    if (arrTs === null || now < arrTs) return { phase: 'riding', i };
    if (i === legs.length - 1) return { phase: 'arrived', i };
    const nextDepTs = legs[i + 1] && legs[i + 1].depTime
      ? new Date(legs[i + 1].depTime.time).getTime() : null;
    if (nextDepTs === null || now < nextDepTs) return { phase: 'platform', i, next: i + 1 };
  }
  return { phase: 'arrived', i: legs.length - 1 };
}

export function renderTrack() {
  renderAlerts();
  if (!state.jny || !state.jny.legs || !state.jny.legs.length) return;
  const now = Date.now();
  const legs = state.jny.legs;
  const cs = computeState(now);
  const { phase, i } = cs;

  // Auto-exit 5 min after final arrival
  if (phase === 'arrived') {
    const lastLeg = legs[legs.length - 1];
    if (lastLeg.arrTime && now - new Date(lastLeg.arrTime.time).getTime() > 300000) {
      show('v-board'); startBoard(); return;
    }
  }

  const nEl = document.getElementById('t-num');
  const lEl = document.getElementById('t-lbl');
  const cEl = document.getElementById('t-clock');
  const laEl = document.getElementById('t-label');

  if (phase === 'arrived') {
    nEl.textContent = 'ANKOMMET'; nEl.className = 'track-num arrived';
    lEl.textContent = state.jny.dest;
    cEl.textContent = ''; laEl.textContent = '';
  } else if (phase === 'riding') {
    const leg = legs[i];
    const isLastLeg = (i === legs.length - 1);
    const arrTs = leg.arrTime ? new Date(leg.arrTime.time).getTime() : null;
    const mLeft = arrTs !== null ? Math.floor((arrTs - now) / 60000) : null;
    if (mLeft !== null) {
      nEl.textContent = Math.max(0, mLeft);
      nEl.className = 'track-num' + (mLeft <= 2 ? ' urgent' : '');
      lEl.textContent = isLastLeg ? 'min til ankomst' : (mLeft <= 0 ? 'gå av nå' : 'min til bytte');
    } else {
      nEl.textContent = '—'; nEl.className = 'track-num'; lEl.textContent = 'venter på data';
    }
    if (leg.arrTime) {
      cEl.textContent = leg.arrTime.clk;
      laEl.textContent = isLastLeg
        ? 'ankommer ' + normStn(state.jny.dest)
        : 'bytt på ' + normStn(leg.toStation);
    } else { cEl.textContent = ''; laEl.textContent = ''; }
  } else { // platform
    const nextLeg = legs[cs.next];
    const depTs = nextLeg && nextLeg.depTime ? new Date(nextLeg.depTime.time).getTime() : null;
    const mToDep = depTs !== null ? Math.round((depTs - now) / 60000) : null;
    if (mToDep !== null) {
      nEl.textContent = Math.max(0, mToDep);
      nEl.className = 'track-num' + (mToDep <= 1 ? ' urgent' : '');
      lEl.textContent = 'min til avgang';
    } else {
      nEl.textContent = '—'; nEl.className = 'track-num'; lEl.textContent = 'venter på data';
    }
    if (nextLeg && nextLeg.depTime) {
      cEl.textContent = nextLeg.depTime.clk;
      laEl.textContent = 'avgang fra ' + normStn(nextLeg.fromStation) + (nextLeg.quay ? ' · spor ' + nextLeg.quay : '');
    } else { cEl.textContent = ''; laEl.textContent = ''; }
  }

  // ── Inner helpers (close over now / legs) ────────────────────────────────

  function renderStopRows(rows, cardIdx) {
    const TAIL = 2;
    let out = '', firstRendered = false;
    const exp = expanded[cardIdx];
    if (!exp && rows.length > TAIL + 1) {
      [rows[0], { isCollapse: true, count: rows.length - 1 - TAIL }, ...rows.slice(-TAIL)].forEach(r => {
        if (r.isCollapse) {
          out += '<div class="stop-collapse" onclick="window._expandStops&&window._expandStops(' + cardIdx + ')">· ' + r.count + ' stopp ·</div>';
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
      if (rows.length > TAIL + 1)
        out += '<div class="stop-collapse" onclick="window._expandStops&&window._expandStops(' + cardIdx + ')">· vis færre ·</div>';
    }
    return out;
  }

  function buildCard(label, headerHtml, stopsHtml) {
    return '<div class="tog-card">'
      + '<div class="tc-head">'
      + (label ? '<span class="tc-label">' + label + '</span>' : '')
      + headerHtml
      + '</div>'
      + (stopsHtml ? '<div class="tc-stops">' + stopsHtml + '</div>' : '')
      + '</div>';
  }

  function collectLegStopRows(legIdx) {
    const leg = legs[legIdx];
    if (!leg || !leg.stops || !leg.stops.length) return [];
    const isLastLeg = legIdx === legs.length - 1;
    const from = normStn(leg.fromStation || '');
    const to = normStn(leg.toStation || '');
    const rows = [];
    let pastFrom = !leg.fromStation, pastTo = false;
    leg.stops.forEach(s => {
      if (pastTo) return;
      const nm = (s.quay && s.quay.stopPlace && s.quay.stopPlace.name) || '?';
      if (!pastFrom) {
        if (normStn(nm) === from) { pastFrom = true; return; }
        else return;
      }
      const isEnd = to && normStn(nm) === to;
      const depT = s.expectedDepartureTime || s.aimedDepartureTime;
      const passed = depT && new Date(depT).getTime() < now - 10000;
      if (passed && !isEnd) return;
      const arrT = s.expectedArrivalTime || s.aimedArrivalTime || depT;
      const arrTs = arrT ? new Date(arrT).getTime() : null;
      const ma = arrTs ? Math.round((arrTs - now) / 60000) : null;
      const relTxt = ma === null ? '—' : ma <= 0 ? 'nå' : ma === 1 ? '1 min' : 'om ' + ma + ' min';
      rows.push({ nm, arrT, ma, relTxt, isTransfer: !isLastLeg && isEnd, isDest: isLastLeg && isEnd });
      if (isEnd) pastTo = true;
    });
    return rows;
  }

  function buildPreBoardHtml(legIdx) {
    const leg = legs[legIdx];
    if (!leg || !leg.fromStation || !leg.stops || !leg.stops.length) return '';
    const fromNorm = normStn(leg.fromStation);
    let nextPreStop = null, stopsAway = 0;
    for (const s of leg.stops) {
      const nm = (s.quay && s.quay.stopPlace && s.quay.stopPlace.name) || '?';
      if (normStn(nm) === fromNorm) break;
      const depT = s.expectedDepartureTime || s.aimedDepartureTime;
      if (depT && new Date(depT).getTime() < now - 10000) continue;
      if (!nextPreStop) nextPreStop = { nm, arrT: s.expectedArrivalTime || s.aimedArrivalTime || depT };
      stopsAway++;
    }
    if (!nextPreStop) return '';
    const arrTs = nextPreStop.arrT ? new Date(nextPreStop.arrT).getTime() : null;
    const ma = arrTs ? Math.round((arrTs - now) / 60000) : null;
    const relTxt = ma !== null ? (ma <= 0 ? ' · nå' : ' · om ' + ma + ' min') : '';
    const vehicleLabel = legs[legIdx] && legs[legIdx].mode === 'bus' ? 'bussen er nå ved'
      : legs[legIdx] && legs[legIdx].mode === 'tram' ? 'trikken er nå ved'
      : 'toget er nå ved';
    return '<div class="pre-board-info"><span class="pre-board-label">' + vehicleLabel + '</span> '
      + nextPreStop.nm.toLowerCase() + relTxt + ' · ' + stopsAway + ' stopp til avgang</div>';
  }

  function buildLegCard(legIdx, label, rideMode) {
    const leg = legs[legIdx];
    if (!leg) return '';
    const isLastLeg = legIdx === legs.length - 1;

    let headerHtml;
    if (rideMode) {
      const arrT = leg.arrTime;
      const mToAction = arrT ? (() => {
        const m = Math.floor((new Date(arrT.time).getTime() - now) / 60000);
        return m <= 0 ? 'nå' : 'om ' + m + ' min';
      })() : null;
      headerHtml = '<div class="ct-detail">'
        + '<span class="line-badge" style="background:' + leg.lineBg + '">' + leg.lineCode + '</span>'
        + '<span class="ct-dest">' + leg.frontText + '</span>'
        + '</div>'
        + '<div class="ct-detail ct-detail-2">'
        + (arrT
          ? '<span class="ct-time">' + (isLastLeg ? 'ank. ' : 'bytt ') + '<strong>' + normStn(leg.toStation) + '</strong> ' + arrT.clk + (mToAction ? ' · ' + mToAction : '') + '</span>'
          : '<span class="ct-time" style="color:#57534e">laster…</span>')
        + '</div>';
    } else {
      const mToDep = leg.depTime
        ? Math.round((new Date(leg.depTime.time).getTime() - now) / 60000)
        : null;
      const depStatus = mToDep === null ? ''
        : mToDep > 0 ? 'om ' + mToDep + ' min'
        : mToDep === 0 ? 'nå' : 'avgått';
      headerHtml = '<div class="ct-detail">'
        + '<span class="line-badge" style="background:' + leg.lineBg + '">' + leg.lineCode + '</span>'
        + (leg.frontText ? '<span class="ct-dest">' + leg.frontText + '</span>' : '')
        + '</div>'
        + '<div class="ct-detail ct-detail-2">'
        + (leg.quay ? '<span class="ct-quay">spor ' + leg.quay + '</span>' : '')
        + (leg.depTime ? '<span class="ct-time">avg <strong>' + leg.depTime.clk + '</strong>' + (depStatus ? ' · ' + depStatus : '') + '</span>' : '')
        + (leg.arrTime ? '<span class="ct-arr">→ ank. ' + leg.arrTime.clk + '</span>' : '')
        + '</div>';
    }

    const rows = collectLegStopRows(legIdx);
    let stopsContent;
    if (rideMode) {
      const preBoardHtml = buildPreBoardHtml(legIdx);
      const rowsHtml = rows.length
        ? renderStopRows(rows, legIdx)
        : (!preBoardHtml ? '<div class="state-msg" style="padding:.75rem;font-size:11px">laster…</div>' : '');
      stopsContent = preBoardHtml + rowsHtml;
    } else {
      stopsContent = rows.length ? renderStopRows(rows, legIdx) : '';
    }

    return buildCard(label, headerHtml, stopsContent);
  }

  // ── Build cards ───────────────────────────────────────────────────────────

  function cardLabel(mode, isFirst) {
    if (mode === 'bus')  return isFirst ? 'byttebuss' : 'neste buss';
    if (mode === 'tram') return isFirst ? 'byttetrikk' : 'neste trikk';
    return isFirst ? 'byttetog' : 'neste tog';
  }

  let cards = '';
  if (phase === 'arrived') {
    cards = '<div class="state-msg" style="padding:1rem;font-size:11px;color:#57534e">ankommet · ' + state.jny.dest.toLowerCase() + '</div>';
  } else if (phase === 'riding') {
    cards += buildLegCard(i, 'ombord', true);
    for (let j = i + 1; j < legs.length; j++) {
      cards += buildLegCard(j, cardLabel(legs[j].mode, j === i + 1), false);
    }
  } else { // platform
    const nextIdx = cs.next;
    for (let j = nextIdx; j < legs.length; j++) {
      cards += buildLegCard(j, cardLabel(legs[j].mode, j === nextIdx), false);
    }
  }

  document.getElementById('t-cards').innerHTML = cards;
}

export function buildTrackBar() {
  const legs = (state.jny && state.jny.legs) || [];
  const badges = legs.map(leg =>
    '<span class="line-badge" style="background:' + leg.lineBg + '">' + leg.lineCode + '</span>'
  ).join('<span class="transfer-arrow">→</span>');
  document.getElementById('t-train-bar').innerHTML =
    badges
    + '<span class="tb-dest">' + (state.jny.frontText || state.jny.dest) + '</span>'
    + (state.jny.arrival ? '<span class="tb-dep">ank <span>' + state.jny.arrival.clk + '</span></span>' : '');
}

export function startTracking() {
  expanded = state.jny && state.jny.legs ? state.jny.legs.map(() => false) : [];
  if (intervals.track) clearInterval(intervals.track);
  renderTrack();
  _fetchTrack();
  intervals.track = setInterval(_fetchTrack, config.trackRefreshMs);
  if (intervals.board) { clearInterval(intervals.board); intervals.board = null; }
}

export function stopTracking() {
  if (intervals.track) { clearInterval(intervals.track); intervals.track = null; }
}

function _fetchTrack() {
  if (!state.jny || !state.jny.legs || !state.jny.legs.length) return;
  const now = Date.now();
  const cs = computeState(now);
  if (cs.phase === 'arrived') return;

  // During platform phase fetch the next leg; while riding fetch current leg
  const activeIdx = cs.phase === 'platform' ? cs.next : cs.i;
  const leg = state.jny.legs[activeIdx];
  if (!leg || !leg.journeyId) return;

  fetchTrack(leg.journeyId)
    .then(calls => {
      if (!calls) return;
      leg.stops = calls;
      // Update arrival time for this leg
      const d = findArr(calls, leg.toStation);
      if (d) {
        const t = d.expectedArrivalTime || d.aimedArrivalTime;
        if (t) {
          leg.arrTime = { time: t, clk: clk(t) };
          if (activeIdx === state.jny.legs.length - 1)
            state.jny.arrival = { time: t, clk: clk(t) };
          logMsg('leg' + activeIdx + ' ank ' + clk(t), 'ok');
        }
      }
      // During platform phase, refresh depTime from live calls
      if (cs.phase === 'platform' && leg.fromStation) {
        const depStop = findArr(calls, leg.fromStation);
        if (depStop) {
          const dt = depStop.expectedDepartureTime || depStop.aimedDepartureTime;
          if (dt) leg.depTime = { time: dt, clk: clk(dt) };
        }
      }
      renderTrack();
    })
    .catch(err => logMsg('track ✗ ' + err.message, 'err'));

  // Pre-fetch all remaining legs while riding so cards show stops immediately
  if (cs.phase === 'riding') {
    for (let j = cs.i + 1; j < state.jny.legs.length; j++) {
      const nxt = state.jny.legs[j];
      if (nxt && nxt.journeyId && !nxt.stops.length) {
        fetchTrack(nxt.journeyId)
          .then(calls => { if (calls) { nxt.stops = calls; renderTrack(); } })
          .catch(() => {});
      }
    }
  }
}

window._simBytt = function(minsFromNow) {
  if (!state.jny || !state.jny.legs || !state.jny.legs.length) return;
  const t = new Date(Date.now() + minsFromNow * 60000);
  const ts = { time: t.toISOString(), clk: pad(t.getHours()) + ':' + pad(t.getMinutes()) };
  state.jny.legs[0].arrTime = ts;
  if (minsFromNow <= 0) _fetchTrack();
  renderTrack();
};

window._simEtterBytt = function() {
  if (!state.jny || !state.jny.legs || state.jny.legs.length < 2) return;
  const t = new Date(Date.now() - 1000);
  const ts = { time: t.toISOString(), clk: pad(t.getHours()) + ':' + pad(t.getMinutes()) };
  state.jny.legs[0].arrTime = ts;
  // Also set leg 1 depTime to past so we skip platform-waiting
  state.jny.legs[1].depTime = ts;
  _fetchTrack();
  renderTrack();
};

window._expandStops = (idx) => { expanded[idx] = !expanded[idx]; renderTrack(); };
