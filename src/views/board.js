import config from '../config.js';
import { state, intervals } from '../state.js';
import { walkInfo, mToLeave, reachCls, findArr, isWalkActive, loadWalkFrom } from '../geo.js';
import { fetchBoard, fetchTrip } from '../api/entur.js';
import { setDot, logMsg } from '../ui/log.js';
import { adaptTripPattern } from '../api/adapt.js';
import { renderAlerts } from '../ui/alerts.js';
import { loadFavs, addTimedFav, removeFav } from '../ui/favs.js';
import { fmtMins } from '../ui/fmt.js';

function pad(n) { return String(n).padStart(2, '0'); }
function clk(v) { const d = new Date(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

function renderWalkSummary() {
  const el = document.getElementById('walk-summary');
  if (!el) return;
  const dir = config.dirs[state.dIdx];
  if (isWalkActive(dir)) {
    const wk = walkInfo();
    const wf = state.walkFromLL ? loadWalkFrom() : null;
    const ns = state.nearestStation;
    const fromLabel = wf ? wf.label : (ns ? ns.name : null);
    el.textContent = (fromLabel ? fromLabel + ' · ' : '') + wk.mins + ' min gange';
    el.style.display = 'block';
  } else if (state.gpsError === 'denied' && dir.key === 'out') {
    el.textContent = 'posisjon: ikke tilgjengelig';
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

export function renderBoard() {
  renderAlerts();
  renderWalkSummary();
  const list = document.getElementById('dep-list');
  const dir = config.dirs[state.dIdx];
  if (!state.deps.length) {
    list.innerHTML = '<div class="state-msg">' + (state.view === 'board' ? 'kobler til…' : 'ingen avganger') + '</div>';
    return;
  }
  const now = Date.now();
  const walkActive = isWalkActive(dir);
  const savedFavs = loadFavs();

  // For each departure minute keep only the route with the earliest arrival.
  const indexed = state.deps.map((c, i) => ({ c, origIdx: i }));
  indexed.sort((a, b) =>
    new Date(a.c.expectedDepartureTime).getTime() - new Date(b.c.expectedDepartureTime).getTime()
  );
  const depMinMap = new Map();
  indexed.forEach(({ c, origIdx }) => {
    const depMin = Math.floor(new Date(c.expectedDepartureTime).getTime() / 60000);
    const arrMs  = c._finalArrival ? new Date(c._finalArrival).getTime() : Infinity;
    const cur    = depMinMap.get(depMin);
    if (!cur || arrMs < cur.arrMs) depMinMap.set(depMin, { c, origIdx, arrMs });
  });
  const visibleDeps = Array.from(depMinMap.values());

  let html = '';
  let urgentShown = false;
  visibleDeps.forEach(({ c, origIdx }) => {
    const depTs = new Date(c.expectedDepartureTime).getTime();
    const diffSec = Math.floor((depTs - now) / 1000);
    const mins = Math.floor(Math.max(0, diffSec) / 60);
    const secs = Math.max(0, diffSec) % 60;
    const isNow = diffSec <= 0, urgent = diffSec > 0 && mins <= 2;
    const ln = c.serviceJourney && c.serviceJourney.line;
    const lc = (ln && ln.publicCode) || '?';
    const lbg = ln && ln.presentation && ln.presentation.colour ? '#' + ln.presentation.colour : '#7c2d12';
    const dest = (c.destinationDisplay && c.destinationDisplay.frontText) || '';
    const quay = (c.quay && c.quay.publicCode) || (c.quay && c.quay.name ? c.quay.name.replace(/^.*?\s/, '') : '?');
    const delayed = c.realtime && depTs - new Date(c.aimedDepartureTime).getTime() > 60000;
    const sjc = c.serviceJourney && c.serviceJourney.estimatedCalls;
    const arr = findArr(sjc, dir.to);
    const arrT = (arr && (arr.expectedArrivalTime || arr.aimedArrivalTime)) || c._finalArrival || null;
    const mtl = walkActive ? mToLeave(depTs) : null;
    const rcls = walkActive ? reachCls(mtl) : null;
    const isCancelled = c.cancellation;
    const missed = rcls === 'missed';
    const rowCls = 'dep-row' + (isCancelled ? ' cancelled' : missed ? ' missed' : rcls ? ' ' + rcls : '');
    const showReach = walkActive && rcls && !missed && (rcls !== 'r-now' || !urgentShown);
    if (rcls === 'r-now') urgentShown = true;

    const hhmm = clk(depTs);
    const isSaved = savedFavs.some(f =>
      f.type === 'timed' && f.from === dir.from && f.to === dir.to
      && f.line === lc && f.departureHHMM === hhmm);

    const lineBadges = c._legs
      ? c._legs.map(l => {
          const ll = l.serviceJourney && l.serviceJourney.line;
          const bg = ll && ll.presentation && ll.presentation.colour ? '#' + ll.presentation.colour : '#7c2d12';
          const lcode = (ll && ll.publicCode) || '?';
          return '<span class="line-badge" style="background:' + bg + '">' + lcode + '</span>';
        }).join('<span class="transfer-arrow">→</span>')
      : '<span class="line-badge" style="background:' + lbg + '">' + lc + '</span>';

    const viaRow = c._transfers && c._transfers.length
      ? '<div class="dep-via">' + c._transfers.map(t => 'bytt ' + (t.at ? t.at.toLowerCase() : '?')).join(' → ') + '</div>'
      : '';

    html += '<div class="' + rowCls + '"' + (isCancelled ? '' : ' onclick="window.tap(' + origIdx + ')"') + '>'
      + '<div class="dep-mins' + (urgent ? ' urgent' : '') + (isNow ? ' now' : '') + '">'
      + (() => {
          if (isNow) return 'NÅ';
          if (diffSec < 60) return secs + '<span class="unit">sek</span>';
          if (mins < 60)    return mins + '<span class="unit">min</span>';
          const h = Math.floor(mins / 60), rm = mins % 60;
          return h + '<span class="unit">t</span>' + (rm > 0 ? rm + '<span class="unit">m</span>' : '');
        })()
      + '</div>'
      + '<div class="dep-mid">'
      + '<div class="dep-top">'
      + lineBadges
      + (arrT ? '<span class="dep-arr">ank.' + clk(arrT) + '</span>' : '')
      + '</div>'
      + '<div class="dep-info">'
      + '<span class="dep-dest">' + dest + '</span>'
      + (delayed ? '<span class="dep-tag">+for</span>' : '')
      + (c.cancellation ? '<span class="dep-cancelled">innstilt</span>' : '')
      + '</div>'
      + viaRow
      + (showReach
        ? '<div class="dep-reach ' + rcls + '">'
          + (rcls === 'r-ok' || rcls === 'r-soon' ? 'gå om ' + fmtMins(mtl) : 'gå nå')
          + '</div>'
        : '')
      + '</div>'
      + '<div class="dep-spor"><div class="sl">spor</div><div class="sn">' + quay + '</div></div>'
      + '<button class="dep-star' + (isSaved ? ' saved' : '') + '"'
      + ' onclick="event.stopPropagation();window._toggleTimedFav(' + origIdx + ')" aria-label="lagre avgang">★</button>'
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
  if (dir.toGeo || dir.toStopId) {
    fetchTrip(dir, (patterns, situations) => {
      // Populate statLL from geocoded departure coords (covers GPS-unavailable + walkFromLL path)
      if (dir._fromLat && dir._fromLon) {
        state.statLL[dir.key] = { lat: dir._fromLat, lon: dir._fromLon };
        window._updateWalkDbg && window._updateWalkDbg();
      }
      state.serviceAlerts = situations || [];
      logMsg('situations: ' + state.serviceAlerts.length, state.serviceAlerts.length ? 'ok' : null);
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
    const sitMap = new Map();
    const addSits = (arr) => (arr || []).forEach(s => s && s.id && sitMap.set(s.id, s));
    addSits(stop.situations);
    (stop.estimatedCalls || []).forEach(call => {
      addSits(call.situations);
      if (call.serviceJourney) addSits(call.serviceJourney.situations);
    });
    state.serviceAlerts = Array.from(sitMap.values());
    logMsg('situations: ' + state.serviceAlerts.length, state.serviceAlerts.length ? 'ok' : null);
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

window._startBoard = startBoard;
window._fetchBoard = _fetchBoard;

window._toggleTimedFav = (origIdx) => {
  const dep = state.deps[origIdx];
  const dir = config.dirs[state.dIdx];
  if (!dep || !dir) return;
  const ln = dep.serviceJourney && dep.serviceJourney.line;
  const line = (ln && ln.publicCode) || null;
  const d = new Date(dep.expectedDepartureTime);
  const hhmm = pad(d.getHours()) + ':' + pad(d.getMinutes());
  const favs = loadFavs();
  const existing = favs.find(f =>
    f.type === 'timed' && f.from === dir.from && f.to === dir.to
    && f.line === line && f.departureHHMM === hhmm);
  if (existing) removeFav(existing.id);
  else addTimedFav(dep, dir);
  renderBoard();
};
