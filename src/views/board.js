import config from '../config.js';
import { state, intervals } from '../state.js';
import { walkInfo, mToLeave, reachCls, findArr } from '../geo.js';
import { fetchBoard, fetchTrip } from '../api/entur.js';
import { setDot, logMsg } from '../ui/log.js';

function pad(n) { return String(n).padStart(2, '0'); }
function clk(v) { const d = new Date(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

function adaptTripPattern(tp) {
  const legs = tp.legs.filter(l => l.mode !== 'foot');
  if (!legs.length) return null;
  const first = legs[0], last = legs[legs.length - 1];
  return {
    expectedDepartureTime: first.fromEstimatedCall.expectedDepartureTime,
    aimedDepartureTime:    first.fromEstimatedCall.aimedDepartureTime,
    realtime:              first.fromEstimatedCall.realtime,
    cancellation:          false,
    destinationDisplay:    { frontText: last.toPlace.name },
    quay:                  { publicCode: first.fromEstimatedCall.quay && first.fromEstimatedCall.quay.publicCode || '?' },
    serviceJourney: {
      id:   first.serviceJourney && first.serviceJourney.id,
      line: first.serviceJourney && first.serviceJourney.line,
      estimatedCalls: [],
    },
    _legs:             legs,
    _isTransfer:       legs.length > 1,
    _transferAt:       legs.length > 1 ? legs[0].toPlace.name : null,
    _finalArrival:     last.toEstimatedCall.expectedArrivalTime || last.toEstimatedCall.aimedArrivalTime,
    _durationMins:     Math.round(tp.duration / 60),
    _transferPlatform: legs.length > 1 ? (legs[1].fromEstimatedCall && legs[1].fromEstimatedCall.quay && legs[1].fromEstimatedCall.quay.publicCode) || null : null,
    _transferFrontText: legs.length > 1 ? (legs[1].fromEstimatedCall && legs[1].fromEstimatedCall.destinationDisplay && legs[1].fromEstimatedCall.destinationDisplay.frontText) || null : null,
  };
}

function renderWalkSummary() {
  const el = document.getElementById('walk-summary');
  if (!el) return;
  const ns = state.nearestStation;
  const wk = walkInfo();
  if (ns) {
    el.textContent = ns.name + ' · ' + wk.mins + ' min gange';
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

export function renderBoard() {
  renderWalkSummary();
  const list = document.getElementById('dep-list');
  const dir = config.dirs[state.dIdx];
  if (!state.deps.length) {
    list.innerHTML = '<div class="state-msg">' + (state.view === 'board' ? 'kobler til…' : 'ingen avganger') + '</div>';
    return;
  }
  const now = Date.now();
  const isOut = dir.key !== 'in';
  let html = '';
  state.deps.forEach((c, i) => {
    const depTs = new Date(c.expectedDepartureTime).getTime();
    const diffSec = Math.floor((depTs - now) / 1000);
    const mins = Math.floor(diffSec / 60), secs = diffSec % 60;
    const isNow = mins <= 0, urgent = mins <= 2;
    const ln = c.serviceJourney && c.serviceJourney.line;
    const lc = (ln && ln.publicCode) || '?';
    const lbg = ln && ln.presentation && ln.presentation.colour ? '#' + ln.presentation.colour : '#7c2d12';
    const dest = (c.destinationDisplay && c.destinationDisplay.frontText) || '';
    const quay = (c.quay && c.quay.publicCode) || (c.quay && c.quay.name ? c.quay.name.replace(/^.*?\s/, '') : '?');
    const delayed = c.realtime && depTs - new Date(c.aimedDepartureTime).getTime() > 60000;
    const sjc = c.serviceJourney && c.serviceJourney.estimatedCalls;
    const arr = findArr(sjc, dir.to);
    const arrT = (arr && (arr.expectedArrivalTime || arr.aimedArrivalTime)) || c._finalArrival || null;
    const mtl = isOut ? mToLeave(depTs) : null;
    const rcls = isOut ? reachCls(mtl) : null;
    const isCancelled = c.cancellation;
    const missed = rcls === 'missed';
    const rowCls = 'dep-row' + (isCancelled ? ' cancelled' : missed ? ' missed' : rcls ? ' ' + rcls : '');

    const lineBadges = c._legs
      ? c._legs.map(l => {
          const ll = l.serviceJourney && l.serviceJourney.line;
          const bg = ll && ll.presentation && ll.presentation.colour ? '#' + ll.presentation.colour : '#7c2d12';
          const lcode = (ll && ll.publicCode) || '?';
          return '<span class="line-badge" style="background:' + bg + '">' + lcode + '</span>';
        }).join('<span class="transfer-arrow">→</span>')
      : '<span class="line-badge" style="background:' + lbg + '">' + lc + '</span>';

    const viaRow = c._transferAt
      ? '<div class="dep-via">bytt ' + c._transferAt.toLowerCase() + '</div>'
      : '';

    html += '<div class="' + rowCls + '"' + (isCancelled ? '' : ' onclick="window.tap(' + i + ')"') + '>'
      + '<div class="dep-mins' + (urgent ? ' urgent' : '') + (isNow ? ' now' : '') + '">'
      + (isNow ? 'NÅ' : String(mins))
      + (isNow && secs > 0 ? '<span class="unit">' + secs + 's</span>' : '')
      + (!isNow ? '<span class="unit">min</span>' : '')
      + '</div>'
      + '<div class="dep-mid">'
      + '<div class="dep-top">'
      + lineBadges
      + '<span class="dep-dest">' + dest + '</span>'
      + (arrT ? '<span class="dep-arr">ank.' + clk(arrT) + '</span>' : '')
      + (delayed ? '<span class="dep-tag">+forsinkelse</span>' : '')
      + (c.cancellation ? '<span class="dep-cancelled">innstilt</span>' : '')
      + '</div>'
      + viaRow
      + (isOut && rcls && !missed
        ? '<div class="dep-reach ' + rcls + '">'
          + (rcls === 'r-ok' ? 'gå om ' + mtl + ' min'
            : rcls === 'r-soon' ? 'gå om ' + mtl + ' min!'
            : 'gå nå!')
          + '</div>'
        : '')
      + '</div>'
      + '<div class="dep-spor"><div class="sl">spor</div><div class="sn">' + quay + '</div></div>'
      + '</div>';
  });
  list.innerHTML = html;
}

export function startBoard() {
  state.deps = [];
  if (intervals.board) clearInterval(intervals.board);
  _fetchBoard();
  intervals.board = setInterval(_fetchBoard, config.boardRefreshMs);
}

export function stopBoard() {
  if (intervals.board) { clearInterval(intervals.board); intervals.board = null; }
}

function _fetchBoard() {
  const dir = config.dirs[state.dIdx];
  if (dir.toGeo) {
    fetchTrip(dir, (patterns) => {
      const adapted = patterns.map(adaptTripPattern).filter(Boolean);
      logMsg('✓ ' + adapted.length + ' trip patterns', 'ok');
      state.deps = adapted;
      state.lastFetch = Date.now();
      document.getElementById('board-error').style.display = 'none';
    }, (msg) => {
      const be = document.getElementById('board-error');
      be.style.display = 'block';
      be.textContent = msg;
    });
    return;
  }
  fetchBoard(dir, (stop) => {
    if (stop.latitude && stop.longitude) {
      state.statLL[dir.key] = { lat: stop.latitude, lon: stop.longitude };
      window._updateWalkDbg && window._updateWalkDbg();
    }
    const raw = stop.estimatedCalls || [];
    const byL = dir.line
      ? raw.filter(c => { const l = c.serviceJourney && c.serviceJourney.line; return l && l.publicCode === dir.line; })
      : raw;
    const byD = dir.filter ? byL.filter(c => dir.filter.test((c.destinationDisplay && c.destinationDisplay.frontText) || '')) : byL;
    logMsg('✓ ' + byD.length + '/' + raw.length + (dir.line ? ' L' + dir.line : ' alle linjer'), 'ok');
    state.deps = byD;
    state.lastFetch = Date.now();
    document.getElementById('board-error').style.display = 'none';
    setDot('ok');
  }, (msg) => {
    const be = document.getElementById('board-error');
    be.style.display = 'block';
    be.textContent = msg;
  });
}

// Expose for nav.js window bridges
window._startBoard = startBoard;
window._fetchBoard = _fetchBoard;
