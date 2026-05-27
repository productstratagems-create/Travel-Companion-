import config from '../config.js';
import { state } from '../state.js';
import { walkInfo, mToLeave, reachCls, findArr, isWalkActive } from '../geo.js';
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
  renderWalkDeps();
}

function renderWalkDeps() {
  const el = document.getElementById('w-dep-list');
  if (!el || !state.deps || !state.deps.length) { if (el) el.style.display = 'none'; return; }
  const now = Date.now();
  const dir = config.dirs[state.dIdx];
  const walkActive = isWalkActive(dir);
  const selTs = state.sel ? new Date(state.sel.expectedDepartureTime).getTime() : null;

  const indexed = state.deps.map((c, i) => ({ c, i }));
  indexed.sort((a, b) => new Date(a.c.expectedDepartureTime) - new Date(b.c.expectedDepartureTime));
  const byMin = new Map();
  indexed.forEach(({ c, i }) => {
    const min = Math.floor(new Date(c.expectedDepartureTime) / 60000);
    const arr = c._finalArrival ? new Date(c._finalArrival).getTime() : Infinity;
    const cur = byMin.get(min);
    if (!cur || arr < cur.arr) byMin.set(min, { c, i, arr });
  });

  const rows = Array.from(byMin.values())
    .filter(({ c }) => new Date(c.expectedDepartureTime).getTime() > now - 30000)
    .slice(0, 4);

  if (!rows.length) { el.style.display = 'none'; return; }

  let html = '';
  rows.forEach(({ c, i }) => {
    const depTs = new Date(c.expectedDepartureTime).getTime();
    const depDiffSec = Math.floor((depTs - now) / 1000);
    const mins = Math.floor(Math.max(0, depDiffSec) / 60);
    const depSecs = Math.max(0, depDiffSec) % 60;
    const isSel = selTs !== null && Math.abs(depTs - selTs) < 30000;
    const mtl = walkActive ? mToLeave(depTs) : null;
    const missed = walkActive && mtl !== null && reachCls(mtl) === 'missed';
    const ln = c.serviceJourney && c.serviceJourney.line;
    const bg = ln && ln.presentation && ln.presentation.colour ? '#' + ln.presentation.colour : '#7c2d12';
    const badges = c._legs
      ? c._legs.map(l => {
          const ll = l.serviceJourney && l.serviceJourney.line;
          const lbg = ll && ll.presentation && ll.presentation.colour ? '#' + ll.presentation.colour : '#7c2d12';
          return '<span class="line-badge" style="background:' + lbg + '">' + ((ll && ll.publicCode) || '?') + '</span>';
        }).join('<span class="transfer-arrow" aria-hidden="true">→</span>')
      : '<span class="line-badge" style="background:' + bg + '">' + ((ln && ln.publicCode) || '?') + '</span>';
    const dest = (c.destinationDisplay && c.destinationDisplay.frontText) || '';
    const sjc = c.serviceJourney && c.serviceJourney.estimatedCalls;
    const arrCall = findArr(sjc, dir.to);
    const arrT = (arrCall && (arrCall.expectedArrivalTime || arrCall.aimedArrivalTime)) || c._finalArrival || null;
    const wMinsLabel = depDiffSec <= 0 ? 'nå' : mins < 60 ? mins + ' min' : Math.floor(mins / 60) + ' t' + (mins % 60 > 0 ? ' ' + mins % 60 + ' m' : '');
    const wA11y = ((ln && ln.publicCode) ? ln.publicCode + ' ' : '') + dest + ', avgang om ' + wMinsLabel;
    html += '<div class="w-dep-row' + (isSel ? ' active' : '') + (missed ? ' missed' : '') + '"'
      + (isSel
        ? ''
        : ' onclick="window.tap(' + i + ')"'
          + ' role="button" tabindex="0"'
          + ' aria-label="' + wA11y.replace(/"/g, '&quot;') + '"'
          + ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();window.tap(' + i + ')}"'
      ) + '>'
      + '<div class="w-dep-mins">' + (() => {
          if (depDiffSec <= 0) return 'NÅ';
          if (depDiffSec < 60) return depSecs + '<span>sek</span>';
          if (mins < 60)       return mins + '<span>min</span>';
          const h = Math.floor(mins / 60), rm = mins % 60;
          return h + '<span>t</span>' + (rm > 0 ? rm + '<span>m</span>' : '');
        })() + '</div>'
      + '<div class="w-dep-mid">' + badges + '<span class="w-dep-dest">' + dest + '</span>' + (arrT ? '<span class="w-dep-arr">ank.' + clk(arrT) + '</span>' : '') + '</div>'
      + '</div>';
  });

  el.innerHTML = html;
  el.style.display = 'block';
}

// Expose for nav bridges
window._buildWalkBar = buildWalkBar;
window._renderWalk = renderWalk;
