import config from '../config.js';
import { state } from '../state.js';
import { walkInfo, mToLeave, findArr } from '../geo.js';
import { show } from '../ui/nav.js';
import { startBoard } from './board.js';

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
      }).join('<span class="transfer-arrow">→</span>')
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
  const mtl = Math.floor(msLeft / 60000);
  const stl = Math.floor((msLeft % 60000) / 1000);
  const dir = config.dirs[state.dIdx];

  let phase;
  if (depMinLeft <= 2)     phase = 'here';
  else if (mtl <= 0)       phase = 'gonow';
  else if (mtl <= 2)       phase = 'urgent';
  else if (mtl <= 6)       phase = 'soon';
  else                     phase = 'calm';

  document.getElementById('w-board-btn-wrap').style.display = 'block';
  const bb = document.getElementById('w-board-btn-wrap').querySelector('button');
  if (bb) bb.className = 'cta-btn' + (phase === 'calm' || phase === 'soon' ? ' secondary' : '');

  let numEl, lblEl, ctxEl, secsEl;
  if (phase === 'here') {
    numEl = '<div class="walk-num here">FREMME</div>';
    lblEl = '<div class="walk-label here">Toget avgår ' + (depMinLeft <= 0 ? 'nå' : 'om ' + depMinLeft + ' min') + '</div>';
    ctxEl = ''; secsEl = '';
  } else if (phase === 'gonow') {
    const lateMin = Math.abs(mtl);
    numEl = '<div class="walk-num gonow">GÅ<br>NÅ</div>';
    lblEl = '<div class="walk-label gonow">Toget avgår om ' + depMinLeft + ' min' + (lateMin > 0 ? ' · ' + lateMin + ' min sen' : '') + '</div>';
    ctxEl = ''; secsEl = '';
  } else {
    const arrCall = findArr(c.serviceJourney && c.serviceJourney.estimatedCalls, dir.to);
    const arrT = (arrCall && (arrCall.expectedArrivalTime || arrCall.aimedArrivalTime)) || c._finalArrival || null;
    numEl = '<div class="walk-num ' + phase + '">' + mtl + '</div>';
    lblEl = '<div class="walk-label ' + phase + '">min til du bør gå</div>';
    const leg1Quay = c._isTransfer && c._legs && c._legs.length > 1
      && c._legs[1].fromEstimatedCall && c._legs[1].fromEstimatedCall.quay
      && c._legs[1].fromEstimatedCall.quay.publicCode;
    const depQuay = c.quay && c.quay.publicCode;
    ctxEl = '<div class="walk-context">'
      + 'Gå senest <span class="wc-hl">' + clk(leaveByTs) + '</span>'
      + (wk.dist ? ' · ~' + wk.dist + ' m' : '')
      + '<br>Toget avgår <span class="wc-hl">' + clk(c.expectedDepartureTime) + '</span>'
      + (depQuay ? ' · <span class="wc-hl">spor ' + depQuay + '</span>' : '')
      + (arrT ? ', ankommer <span class="wc-arr">' + clk(arrT) + '</span>' : '')
      + (leg1Quay ? '<br>Bytt <span class="wc-hl">' + c._transferAt.toLowerCase() + '</span> → spor ' + leg1Quay : '')
      + '</div>';
    secsEl = (phase === 'urgent' && stl > 0)
      ? '<div class="secs-bar">' + stl + ' sek igjen til du bør gå</div>'
      : '';
  }

  document.getElementById('w-center').innerHTML = numEl + lblEl + ctxEl + secsEl;
}

// Expose for nav bridges
window._buildWalkBar = buildWalkBar;
window._renderWalk = renderWalk;
