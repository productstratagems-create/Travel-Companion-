import config from '../config.js';
import { state } from '../state.js';
import { walkInfo, findArr, isWalkActive } from '../geo.js';
import { show } from '../ui/nav.js';
import { startBoard } from './board.js';
import { fmtMins } from '../ui/fmt.js';
import L from 'leaflet';
import { fetchWalkRoute } from '../api/route.js';

function pad(n) { return String(n).padStart(2, '0'); }
function clk(v) { const d = new Date(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

function _makeTransitStopIcon(code, bg, mode) {
  const modeLabel = mode === 'bus' ? 'BUS' : mode === 'tram' ? 'TRIKK' : 'T-BANE';
  const html = '<div style="text-align:center;line-height:1;white-space:nowrap;transform:translate(-50%,-50%)">'
    + '<span class="line-badge" style="background:' + bg + ';font-size:13px;padding:4px 9px">' + code + '</span>'
    + '<div style="font-size:8px;color:#444;font-family:JetBrains Mono,monospace;letter-spacing:.08em;margin-top:3px">' + modeLabel + '</div>'
    + '</div>';
  return L.divIcon({ className: '', html, iconSize: [0, 0], iconAnchor: [0, 0] });
}

const TILE = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '© CartoDB';

let _wMap = null;
let _wFromMarker = null;
let _wUserMoved = false;

function _destroyWalkMap() {
  if (_wMap) { _wMap.remove(); _wMap = null; _wFromMarker = null; }
  _wUserMoved = false;
}

function _initWalkMap(fromLL, toLL) {
  const el = document.getElementById('w-map');
  if (!el || !fromLL || !toLL) return;
  _destroyWalkMap();
  _wUserMoved = false;
  _wMap = L.map(el, { zoomControl: true, attributionControl: false, zoomControlOptions: { position: 'topleft' } });
  _wMap.on('dragstart', () => { _wUserMoved = true; });
  L.tileLayer(TILE, { subdomains: 'abcd', attribution: TILE_ATTR }).addTo(_wMap);
  L.control.scale({ imperial: false, maxWidth: 100, position: 'bottomleft' }).addTo(_wMap);
  // Station marker — transit line badge
  const sel = state.sel;
  const leg0 = sel && sel._legs && sel._legs[0];
  const ln0 = (leg0 && leg0.serviceJourney && leg0.serviceJourney.line) || (sel && sel.serviceJourney && sel.serviceJourney.line);
  const stopCode = (ln0 && ln0.publicCode) || '?';
  const stopBg = (ln0 && ln0.presentation && ln0.presentation.colour) ? '#' + ln0.presentation.colour : '#7c2d12';
  const stopMode = (leg0 && leg0.mode) || 'metro';
  L.marker([toLL.lat, toLL.lon], { icon: _makeTransitStopIcon(stopCode, stopBg, stopMode) }).addTo(_wMap);
  // User position marker (blue) — stored so GPS updates can move it
  _wFromMarker = L.circleMarker([fromLL.lat, fromLL.lon], { radius: 6, color: '#60a5fa', fillColor: '#60a5fa', fillOpacity: 0.85, weight: 2 }).addTo(_wMap);
  // Straight placeholder line shown immediately; replaced by routed path when OSRM responds
  let _routeLine = L.polyline([[fromLL.lat, fromLL.lon], [toLL.lat, toLL.lon]],
    { color: '#f5b840', weight: 2, dashArray: '5 5', opacity: 0.4 }).addTo(_wMap);
  _wMap.fitBounds([[fromLL.lat, fromLL.lon], [toLL.lat, toLL.lon]], { padding: [30, 30] });

  fetchWalkRoute(fromLL, toLL).then(pts => {
    if (!_wMap || !pts) return;
    _routeLine.remove();
    _routeLine = L.polyline(pts, { color: '#f5b840', weight: 3, opacity: 0.8 }).addTo(_wMap);
    if (!_wUserMoved) _wMap.fitBounds(pts, { padding: [30, 30] });
  }).catch(() => {});

  // Expand toggle
  const expandBtn = document.getElementById('w-map-expand');
  if (expandBtn) {
    expandBtn.onclick = () => {
      const expanded = el.classList.toggle('expanded');
      expandBtn.textContent = expanded ? '✕' : '⤢';
      expandBtn.setAttribute('aria-label', expanded ? 'Minimer kart' : 'Utvid kart');
      expandBtn.title = expanded ? 'Minimer kart' : 'Utvid kart';
      setTimeout(() => _wMap && _wMap.invalidateSize(), 320);
    };
  }
}

function _updateWalkMapOrigin(fromLL) {
  if (!_wMap || !_wFromMarker || !fromLL) return;
  _wFromMarker.setLatLng([fromLL.lat, fromLL.lon]);
}

export function buildWalkBar() {
  const c = state.sel;
  if (!c) return;
  const dir = config.dirs[state.dIdx];
  const ln = c.serviceJourney && c.serviceJourney.line;
  const lc = (ln && ln.publicCode) || config.line;
  const lbg = ln && ln.presentation && ln.presentation.colour ? '#' + ln.presentation.colour : '#7c2d12';
  const dest = (c.destinationDisplay && c.destinationDisplay.frontText) || '';
  const sjc = c.serviceJourney && c.serviceJourney.estimatedCalls;
  const arr = findArr(sjc, dir.to);
  const arrT = (arr && (arr.expectedArrivalTime || arr.aimedArrivalTime)) || c._finalArrival || null;
  const badges = c._isTransfer && c._legs
    ? c._legs.map(l => {
        const ll = l.serviceJourney && l.serviceJourney.line;
        const bg = ll && ll.presentation && ll.presentation.colour ? '#' + ll.presentation.colour : '#7c2d12';
        return '<span class="line-badge" style="background:' + bg + '">' + ((ll && ll.publicCode) || '?') + '</span>';
      }).join('<span class="transfer-arrow" aria-hidden="true">→</span>')
    : '<span class="line-badge" style="background:' + lbg + '">' + lc + '</span>';
  document.getElementById('w-train-bar').innerHTML =
    badges
    + '<span class="tb-dest">' + dest + '</span>'
    + '<span class="tb-dep">avg <span>' + clk(c.expectedDepartureTime) + '</span>'
    + (arrT ? ' · ank <span>' + clk(arrT) + '</span>' : '') + '</span>';
}

export function renderWalk() {
  const c = state.sel;
  if (!c) return;
  const depTs = new Date(c.expectedDepartureTime).getTime();
  const now = Date.now();
  const depMinLeft = Math.floor((depTs - now) / 60000);
  if (depMinLeft < -3) { show('v-board'); startBoard(); return; }
  const wk = walkInfo();
  const leaveByTs = depTs - wk.mins * 60000;
  const msLeft = leaveByTs - now;
  const isLate = msLeft < 0;
  const secsLeft = isLate ? 0 : Math.floor(msLeft / 1000);
  const mtl = Math.floor(secsLeft / 60);
  const stl = secsLeft % 60;
  const dir = config.dirs[state.dIdx];
  const firstMode = c._legs && c._legs[0] && c._legs[0].mode;
  const vehicleWord = firstMode === 'bus' ? 'Bussen' : firstMode === 'tram' ? 'Trikken' : 'Toget';

  // 3 advisory phases — no urgency commands
  const phase = depMinLeft <= 2 ? 'here' : isLate ? 'behind' : 'info';

  document.getElementById('w-board-btn-wrap').style.display = 'block';
  const bb = document.getElementById('w-board-btn-wrap').querySelector('button');
  if (bb) bb.className = 'cta-btn secondary';

  const firstTransfer = c._transfers && c._transfers[0];
  const rawDepQuay = c._legs && c._legs[0] && c._legs[0].fromEstimatedCall
    && c._legs[0].fromEstimatedCall.quay && c._legs[0].fromEstimatedCall.quay.publicCode;
  const depQuay = rawDepQuay || (c.quay && c.quay.publicCode !== '?' && c.quay.publicCode) || null;

  // Walk time source label for display
  const wkSrcLabel = { gps: 'GPS', sted: 'sted', manuelt: 'manuelt' }[wk.src] || null;

  let numEl, lblEl, ctxEl;

  if (phase === 'here') {
    numEl = '<div class="walk-num here">FREMME</div>';
    lblEl = '<div class="walk-label here">' + vehicleWord + ' avgår ' + (depMinLeft <= 0 ? 'nå' : 'om ' + fmtMins(depMinLeft)) + '</div>';
    ctxEl = (depQuay || (firstTransfer && firstTransfer.platform))
      ? '<div class="walk-context">'
        + (depQuay ? 'spor <span class="wc-hl">' + depQuay + '</span>' : '')
        + (firstTransfer && firstTransfer.platform && firstTransfer.at
          ? (depQuay ? '<br>' : '') + 'bytt <span class="wc-hl">' + firstTransfer.at.toLowerCase() + '</span> → spor ' + firstTransfer.platform
          : '')
        + '</div>'
      : '';
  } else {
    const arrCall = findArr(c.serviceJourney && c.serviceJourney.estimatedCalls, dir.to);
    const arrT = (arrCall && (arrCall.expectedArrivalTime || arrCall.aimedArrivalTime)) || c._finalArrival || null;
    const leg1Quay = firstTransfer && firstTransfer.platform;

    // Advisory context: walk time + source, departure, leave-by, arrival
    const ctxLines = [
      'Gangtid: <span class="wc-hl">' + wk.mins + ' min</span>'
        + (wkSrcLabel ? ' <span class="wc-src">(' + wkSrcLabel + ')</span>' : '')
        + (wk.dist ? ' · ~' + wk.dist + ' m' : ''),
      vehicleWord + ' avgår <span class="wc-hl">' + clk(c.expectedDepartureTime) + '</span>'
        + (depQuay ? ' · spor <span class="wc-hl">' + depQuay + '</span>' : ''),
    ];
    if (phase === 'info') {
      ctxLines.push('Gå senest: <span class="wc-hl">' + clk(leaveByTs) + '</span>');
    }
    if (arrT) ctxLines.push('Ankommer: <span class="wc-arr">' + clk(arrT) + '</span>');
    if (leg1Quay && firstTransfer.at) {
      ctxLines.push('Bytt <span class="wc-hl">' + firstTransfer.at.toLowerCase() + '</span> → spor ' + leg1Quay);
    }
    ctxEl = '<div class="walk-context">' + ctxLines.join('<br>') + '</div>';

    if (phase === 'behind') {
      // Past leave-by: show minutes until actual departure
      const minsLeft = Math.max(0, depMinLeft);
      numEl = '<div class="walk-num behind">' + minsLeft + '<span class="cnt-unit">min</span></div>';
      lblEl = '<div class="walk-label behind">til avgang</div>';
    } else {
      // Countdown to leave-by time
      let cntNumHtml, cntUnit;
      if (mtl === 0) {
        cntNumHtml = stl; cntUnit = 'sek';
      } else if (mtl < 60) {
        cntNumHtml = mtl; cntUnit = 'min';
      } else {
        const h = Math.floor(mtl / 60), rm = mtl % 60;
        cntNumHtml = h + 't'; cntUnit = rm > 0 ? rm + 'm' : '';
      }
      numEl = '<div class="walk-num info">' + cntNumHtml + '<span class="cnt-unit">' + cntUnit + '</span></div>';
      lblEl = '<div class="walk-label info">til du bør gå</div>';
    }
  }

  document.getElementById('w-center').innerHTML = numEl + lblEl + ctxEl;

  // Map: init once per walk session, then only update origin marker as GPS refreshes
  const fromLL = state.walkFromLL || state.homeLL;
  const toLL = dir && state.statLL && state.statLL[dir.key];
  if (fromLL && toLL) {
    if (!_wMap) {
      _initWalkMap(fromLL, toLL);
    } else {
      _updateWalkMapOrigin(fromLL);
    }
  }
}

export function stopWalk() {
  _destroyWalkMap();
}

// Expose for nav bridges
window._buildWalkBar = buildWalkBar;
window._renderWalk = renderWalk;
window._stopWalk = stopWalk;
