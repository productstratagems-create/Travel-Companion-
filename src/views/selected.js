import config from '../config.js';
import { state, intervals } from '../state.js';
import { walkInfo, mToLeave, reachCls, findArr } from '../geo.js';
import { fetchSelJourney } from '../api/entur.js';
import { logMsg } from '../ui/log.js';
import { show } from '../ui/nav.js';
import { startBoard } from './board.js';

function pad(n) { return String(n).padStart(2, '0'); }
function clk(v) { const d = new Date(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

export function renderSelected() {
  const c = state.sel;
  if (!c) return;
  const dir = config.dirs[state.dIdx];
  const now = Date.now();
  const ln = c.serviceJourney && c.serviceJourney.line;
  const lc = (ln && ln.publicCode) || config.line;
  const lbg = ln && ln.presentation && ln.presentation.colour ? '#' + ln.presentation.colour : '#7c2d12';
  const dest = (c.destinationDisplay && c.destinationDisplay.frontText) || '';
  const quay = (c.quay && c.quay.publicCode) || '?';
  const depTs = new Date(c.expectedDepartureTime).getTime();
  const sjc = c.serviceJourney && c.serviceJourney.estimatedCalls;
  const arr = findArr(sjc, dir.to);
  const arrT = arr && (arr.expectedArrivalTime || arr.aimedArrivalTime);
  const tmin = arrT ? Math.round((new Date(arrT).getTime() - depTs) / 60000) : null;
  const delayed = c.realtime && depTs - new Date(c.aimedDepartureTime).getTime() > 60000;
  const wk = walkInfo();
  const leaveByTs = depTs - wk.mins * 60000;
  const mtl = mToLeave(depTs);
  const rcls = reachCls(mtl);
  const ltCls = rcls === 'r-ok' ? 'lt-ok' : rcls === 'r-soon' ? 'lt-soon' : rcls === 'r-now' ? 'lt-now' : 'lt-late';
  let urgMsg;
  if (rcls === 'missed') urgMsg = '<span style="color:#dc2626">Rakker ikke — velg neste avgang</span>';
  else if (rcls === 'r-now') urgMsg = '<span class="go">Gå nå!</span>';
  else if (mtl === 1) urgMsg = 'Gå om <span class="warn">1 min</span>';
  else urgMsg = 'Gå om <span class="amber">' + mtl + ' min</span>';

  const isOut = dir.key !== 'in';

  document.getElementById('s-content').innerHTML = ''
    + '<div class="train-chip">'
    + '<span class="line-badge" style="background:' + lbg + '">' + lc + '</span>'
    + '<span class="tc-dest">' + dest + '</span>'
    + '<span class="tc-meta">spor <span>' + quay + '</span>' + (delayed ? ' · <span style="color:#fcd34d">forsinket</span>' : '') + '</span>'
    + '</div>'
    + (isOut
      ? '<div class="leaveby-hero">'
        + '<div class="leaveby-label">gå senest</div>'
        + '<div class="leaveby-time ' + ltCls + '">' + clk(leaveByTs) + '</div>'
        + '<div class="leaveby-sub soft">' + urgMsg + '</div>'
        + '</div>'
      : '')
    + '<div class="journey-detail">'
    + '<div class="jd-cell">'
    + '<div class="jd-label">avgår fra ' + dir.from.toLowerCase() + '</div>'
    + '<div class="jd-val departure">' + clk(c.expectedDepartureTime) + '</div>'
    + (delayed ? '<div class="jd-sub">rute ' + clk(c.aimedDepartureTime) + '</div>' : '')
    + '</div>'
    + (arrT
      ? '<div class="jd-cell">'
        + '<div class="jd-label">ankommer ' + dir.to.toLowerCase() + '</div>'
        + '<div class="jd-val arrival">' + clk(arrT) + '</div>'
        + (tmin ? '<div class="jd-sub">' + tmin + ' min reise</div>' : '')
        + '</div>'
      : '')
    + '</div>';

  // Rebuild CTAs
  const existingCtas = document.getElementById('s-ctas');
  if (existingCtas) existingCtas.remove();
  const ctaDiv = document.createElement('div');
  ctaDiv.id = 's-ctas';

  const primaryBtn = document.createElement('button');
  primaryBtn.className = 'cta-btn';
  if (isOut) {
    primaryBtn.textContent = 'gange-modus →';
    primaryBtn.disabled = depTs < now - 120000;
    primaryBtn.onclick = () => {
      show('v-walk');
      window._buildWalkBar && window._buildWalkBar();
      window._renderWalk && window._renderWalk();
    };
  } else {
    primaryBtn.textContent = 'bord →';
    primaryBtn.disabled = depTs < now - 120000;
    primaryBtn.onclick = () => window.doBoard && window.doBoard();
  }
  ctaDiv.appendChild(primaryBtn);

  const backBtn = document.createElement('button');
  backBtn.className = 'cta-btn secondary';
  backBtn.textContent = 'andre avganger';
  backBtn.onclick = () => {
    stopSelRefresh();
    state.sel = null;
    show('v-board');
    startBoard();
  };
  ctaDiv.appendChild(backBtn);
  document.getElementById('v-selected').appendChild(ctaDiv);
}

export function startSelRefresh() {
  if (intervals.sel) clearInterval(intervals.sel);
  _fetchSel();
  intervals.sel = setInterval(_fetchSel, config.selRefreshMs);
}

export function stopSelRefresh() {
  if (intervals.sel) { clearInterval(intervals.sel); intervals.sel = null; }
}

function _fetchSel() {
  if (!state.sel || !state.sel.serviceJourney || !state.sel.serviceJourney.id) return;
  fetchSelJourney(state.sel.serviceJourney.id)
    .then(calls => {
      if (!calls || !state.sel) return;
      state.sel.serviceJourney.estimatedCalls = calls;
      logMsg('sel live: ' + calls.length + ' stopp', 'ok');
    })
    .catch(err => logMsg('sel ✗ ' + err.message, 'err'));
}

// Expose for nav bridges
window._renderSelected = renderSelected;
