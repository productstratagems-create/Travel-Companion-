import config from '../config.js';
import { state } from '../state.js';
import { walkInfo, findArr, isWalkActive } from '../geo.js';
import { show } from '../ui/nav.js';
import { startBoard } from './board.js';
import { fmtMins } from '../ui/fmt.js';

function pad(n) { return String(n).padStart(2, '0'); }
function clk(v) { const d = new Date(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

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
  // Use non-negative seconds for display; negative msLeft = late
  const isLate = msLeft < 0;
  const secsLeft = isLate ? 0 : Math.floor(msLeft / 1000);
  const mtl = Math.floor(secsLeft / 60);   // minutes component
  const stl = secsLeft % 60;               // seconds component (0–59)
  const dir = config.dirs[state.dIdx];
  const firstMode = c._legs && c._legs[0] && c._legs[0].mode;
  const vehicleWord = firstMode === 'bus' ? 'Bussen' : firstMode === 'tram' ? 'Trikken' : 'Toget';

  let phase;
  if (depMinLeft <= 2)          phase = 'here';
  else if (isLate)              phase = 'gonow';
  else if (mtl <= 2)            phase = 'urgent';  // 0–2 min (incl. sub-minute)
  else if (mtl <= 6)            phase = 'soon';
  else                          phase = 'calm';

  document.getElementById('w-board-btn-wrap').style.display = 'block';
  const bb = document.getElementById('w-board-btn-wrap').querySelector('button');
  if (bb) bb.className = 'cta-btn' + (phase === 'calm' || phase === 'soon' ? ' secondary' : '');

  const firstTransfer = c._transfers && c._transfers[0];
  const rawDepQuay = c._legs && c._legs[0] && c._legs[0].fromEstimatedCall
    && c._legs[0].fromEstimatedCall.quay && c._legs[0].fromEstimatedCall.quay.publicCode;
  const depQuay = rawDepQuay || (c.quay && c.quay.publicCode !== '?' && c.quay.publicCode) || null;

  let numEl, lblEl, ctxEl, secsEl;
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
    secsEl = '';
  } else if (phase === 'gonow') {
    const lateSec = Math.abs(Math.floor(msLeft / 1000));
    const lateMin = Math.floor(lateSec / 60);
    numEl = '<div class="walk-num gonow">GÅ<br>NÅ</div>';
    lblEl = '<div class="walk-label gonow">' + vehicleWord + ' avgår om ' + fmtMins(depMinLeft) + (lateMin > 0 ? ' · ' + lateMin + ' min sen' : '') + '</div>';
    ctxEl = depQuay
      ? '<div class="walk-context">spor <span class="wc-hl">' + depQuay + '</span></div>'
      : '';
    secsEl = '';
  } else {
    const arrCall = findArr(c.serviceJourney && c.serviceJourney.estimatedCalls, dir.to);
    const arrT = (arrCall && (arrCall.expectedArrivalTime || arrCall.aimedArrivalTime)) || c._finalArrival || null;
    const leg1Quay = firstTransfer && firstTransfer.platform;
    // Build countdown number: sek < 1 min · min 1–59 · t+m ≥ 1 h
    let cntNumHtml, cntUnit;
    if (mtl === 0) {
      cntNumHtml = stl; cntUnit = 'sek';
    } else if (mtl < 60) {
      cntNumHtml = mtl; cntUnit = 'min';
    } else {
      const h = Math.floor(mtl / 60), rm = mtl % 60;
      cntNumHtml = h + 't'; cntUnit = rm > 0 ? rm + 'm' : '';
    }
    numEl = '<div class="walk-num ' + phase + '">' + cntNumHtml
      + '<span class="cnt-unit">' + cntUnit + '</span></div>';
    lblEl = '<div class="walk-label ' + phase + '">til du bør gå</div>';
    ctxEl = '<div class="walk-context">'
      + 'Gå senest <span class="wc-hl">' + clk(leaveByTs) + '</span>'
      + (wk.dist ? ' · ~' + wk.dist + ' m' : '')
      + '<br>' + vehicleWord + ' avgår <span class="wc-hl">' + clk(c.expectedDepartureTime) + '</span>'
      + (depQuay ? ' · <span class="wc-hl">spor ' + depQuay + '</span>' : '')
      + (arrT ? ', ankommer <span class="wc-arr">' + clk(arrT) + '</span>' : '')
      + (leg1Quay && firstTransfer.at ? '<br>Bytt <span class="wc-hl">' + firstTransfer.at.toLowerCase() + '</span> → spor ' + leg1Quay : '')
      + '</div>';
    secsEl = '';  // unit is now embedded in the number
  }

  document.getElementById('w-center').innerHTML = numEl + lblEl + ctxEl + secsEl;
}

// Expose for nav bridges
window._buildWalkBar = buildWalkBar;
window._renderWalk = renderWalk;
