import config from '../config.js';
import { state, intervals } from '../state.js';
import { walkInfo, mToLeave, reachCls, findArr } from '../geo.js';
import { fetchSelJourney } from '../api/entur.js';
import { logMsg } from '../ui/log.js';
import { show } from '../ui/nav.js';
import { startBoard } from './board.js';
import { renderAlerts } from '../ui/alerts.js';

function pad(n) { return String(n).padStart(2, '0'); }
function clk(v) { const d = new Date(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

export function renderSelected() {
  renderAlerts();
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
  const arrT = (arr && (arr.expectedArrivalTime || arr.aimedArrivalTime)) || c._finalArrival || null;
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
  const ns = state.nearestStation;
  const walkActive = isOut && ns !== null && dir.stopId === ns.id;
  const isTransfer = c._isTransfer && c._legs && c._legs.length >= 2;

  // Build line badge(s) for train chip
  const chipBadges = isTransfer
    ? c._legs.map(l => {
        const ll = l.serviceJourney && l.serviceJourney.line;
        const bg = ll && ll.presentation && ll.presentation.colour ? '#' + ll.presentation.colour : '#7c2d12';
        return '<span class="line-badge" style="background:' + bg + '">' + ((ll && ll.publicCode) || '?') + '</span>';
      }).join('<span class="transfer-arrow" style="color:#57534e;font-size:9px;margin:0 .1rem">→</span>')
    : '<span class="line-badge" style="background:' + lbg + '">' + lc + '</span>';

  // Build journey detail — full itinerary for transfers, 2-cell grid for single-line
  let journeyDetail;
  if (isTransfer) {
    let itinHtml = '<div class="itinerary">';
    const allLegs = c._allLegs || c._legs;
    allLegs.forEach((leg, i) => {
      const isFoot = leg.mode === 'foot';
      const ll = leg.serviceJourney && leg.serviceJourney.line;
      const bg = ll && ll.presentation && ll.presentation.colour ? '#' + ll.presentation.colour : '#7c2d12';
      const badge = isFoot
        ? '<span class="foot-badge">gå</span>'
        : '<span class="line-badge" style="background:' + bg + '">' + ((ll && ll.publicCode) || '?') + '</span>';
      const depT = (leg.fromEstimatedCall && leg.fromEstimatedCall.expectedDepartureTime)
        || leg.expectedStartTime || leg.aimedStartTime || null;
      const arrT2 = (leg.toEstimatedCall && (leg.toEstimatedCall.expectedArrivalTime || leg.toEstimatedCall.aimedArrivalTime))
        || leg.expectedEndTime || leg.aimedEndTime || null;
      const isLastLeg = (i === allLegs.length - 1);
      const fromName = i === 0
        ? dir.from.toLowerCase()
        : ((leg.fromPlace && leg.fromPlace.name) ? leg.fromPlace.name.toLowerCase() : '?');
      const toName = (leg.toPlace && leg.toPlace.name)
        ? leg.toPlace.name.toLowerCase()
        : (isLastLeg ? dir.to.toLowerCase() : '?');
      const platform  = !isFoot && i > 0 && leg.fromEstimatedCall && leg.fromEstimatedCall.quay
        ? leg.fromEstimatedCall.quay.publicCode : null;
      const frontText = !isFoot && i > 0 && leg.fromEstimatedCall && leg.fromEstimatedCall.destinationDisplay
        ? leg.fromEstimatedCall.destinationDisplay.frontText : null;

      itinHtml += '<div class="itin-leg">'
        + badge
        + '<div class="itin-stops">'
        + '<div class="itin-row dep"><span>' + fromName + '</span><span class="itin-time dep">' + (depT ? clk(depT) : '—') + '</span></div>'
        + (platform ? '<div class="itin-meta">spor ' + platform + (frontText ? ' · retning ' + frontText.toLowerCase() : '') + '</div>' : '')
        + '<div class="itin-row' + (isLastLeg ? ' final' : '') + '"><span>' + toName + '</span><span class="itin-time' + (isLastLeg ? ' final' : '') + '">' + (arrT2 ? clk(arrT2) : '—') + '</span></div>'
        + '</div></div>';

      if (!isLastLeg) {
        const nextLeg = allLegs[i + 1];
        if (isFoot) {
          // foot row is itself the connector — no divider
        } else if (nextLeg.mode === 'foot') {
          const wDep = nextLeg.expectedStartTime || nextLeg.aimedStartTime;
          const wArr = nextLeg.expectedEndTime   || nextLeg.aimedEndTime;
          const wMin = wDep && wArr ? Math.round((new Date(wArr).getTime() - new Date(wDep).getTime()) / 60000) : null;
          itinHtml += '<div class="itin-xfer">gå' + (wMin !== null ? ' · ' + wMin + ' min' : '') + '</div>';
        } else {
          const nextDepT = (nextLeg.fromEstimatedCall && (nextLeg.fromEstimatedCall.expectedDepartureTime || nextLeg.fromEstimatedCall.aimedDepartureTime))
            || nextLeg.expectedStartTime || nextLeg.aimedStartTime;
          const waitMins = arrT2 && nextDepT
            ? Math.round((new Date(nextDepT).getTime() - new Date(arrT2).getTime()) / 60000) : null;
          itinHtml += '<div class="itin-xfer">bytt' + (waitMins !== null ? ' · ' + waitMins + ' min' : '') + '</div>';
        }
      }
    });
    itinHtml += (tmin ? '<div class="itin-total">' + tmin + ' min reise</div>' : '') + '</div>';
    journeyDetail = itinHtml;
  } else {
    const arrHero = arrT
      ? '<div class="arrival-hero">'
        + '<div class="ah-label">ankommer ' + dir.to.toLowerCase() + '</div>'
        + '<div class="ah-time">' + clk(arrT) + '</div>'
        + (tmin ? '<div class="ah-sub">' + tmin + ' min reise</div>' : '')
        + '</div>'
      : '';
    journeyDetail = arrHero
      + '<div class="journey-detail">'
      + '<div class="jd-cell" style="grid-column:1/-1">'
      + '<div class="jd-label">avgår fra ' + dir.from.toLowerCase() + '</div>'
      + '<div class="jd-val departure">' + clk(c.expectedDepartureTime) + '</div>'
      + (delayed ? '<div class="jd-sub">rute ' + clk(c.aimedDepartureTime) + '</div>' : '')
      + '</div>'
      + '</div>';
  }

  document.getElementById('s-content').innerHTML = ''
    + '<div class="train-chip">'
    + chipBadges
    + '<span class="tc-dest">' + dest + '</span>'
    + '<span class="tc-meta">spor <span>' + quay + '</span>' + (delayed ? ' · <span style="color:#fcd34d">forsinket</span>' : '') + '</span>'
    + '</div>'
    + (walkActive
      ? '<div class="leaveby-hero">'
        + '<div class="leaveby-label">gå senest</div>'
        + '<div class="leaveby-time ' + ltCls + '">' + clk(leaveByTs) + '</div>'
        + '<div class="leaveby-sub soft">' + urgMsg + '</div>'
        + '</div>'
      : '')
    + journeyDetail;

  // Rebuild CTAs
  const existingCtas = document.getElementById('s-ctas');
  if (existingCtas) existingCtas.remove();
  const ctaDiv = document.createElement('div');
  ctaDiv.id = 's-ctas';

  const primaryBtn = document.createElement('button');
  primaryBtn.className = 'cta-btn';
  if (walkActive) {
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
