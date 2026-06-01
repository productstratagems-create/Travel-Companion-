import config from '../config.js';
import { state, intervals } from '../state.js';
import { walkInfo, mToLeave, reachCls, findArr, isWalkActive } from '../geo.js';
import { fetchSelJourney } from '../api/entur.js';
import { loadFavs, addTimedFav, removeFav } from '../ui/favs.js';
import { logMsg } from '../ui/log.js';
import { show } from '../ui/nav.js';
import { startBoard } from './board.js';
import { renderAlerts } from '../ui/alerts.js';
import { fmtMins } from '../ui/fmt.js';

function pad(n) { return String(n).padStart(2, '0'); }
function clk(v) { const d = new Date(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function cleanName(s) { return (s || '').replace(/,\s*\S.*$/, '').replace(/\s+T$/i, '').trim(); }

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
  const departed = depTs < now;
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
  else urgMsg = 'Gå om <span class="amber">' + fmtMins(mtl) + '</span>';

  const walkActive = isWalkActive(dir);
  const isTransfer = c._isTransfer && c._legs && c._legs.length >= 2;

  // Build line badge(s) for train chip
  const chipBadges = isTransfer
    ? c._legs.map(l => {
        const ll = l.serviceJourney && l.serviceJourney.line;
        const bg = ll && ll.presentation && ll.presentation.colour ? '#' + ll.presentation.colour : '#7c2d12';
        return '<span class="line-badge" style="background:' + bg + '">' + ((ll && ll.publicCode) || '?') + '</span>';
      }).join('<span class="transfer-arrow" aria-hidden="true" style="color:#8a837d;font-size:9px;margin:0 .1rem">→</span>')
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
        ? cleanName(dir.from).toLowerCase()
        : cleanName((leg.fromPlace && leg.fromPlace.name) || '?').toLowerCase() || '?';
      const toName = cleanName(
        (leg.toPlace && leg.toPlace.name) || (isLastLeg ? dir.to : '?')
      ).toLowerCase() || '?';
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
        + '<div class="ah-label">ankommer ' + cleanName(dir.to).toLowerCase() + '</div>'
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
    + (quay !== '?' ? '<span class="tc-meta">spor <span>' + quay + '</span>' + (delayed ? ' · <span style="color:#fcd34d">forsinket</span>' : '') + '</span>' : (delayed ? '<span class="tc-meta"><span style="color:#fcd34d">forsinket</span></span>' : ''))
    + '</div>'
    + '<div class="sel-route-ctx">' + dir.from.toLowerCase() + ' → ' + dir.to.toLowerCase() + '</div>'
    + (departed
      ? '<div class="departed-banner">avgikk ' + clk(depTs) + ' · reisen er i gang</div>'
      : walkActive
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
  if (departed) {
    primaryBtn.textContent = 'andre avganger';
    primaryBtn.onclick = () => {
      stopSelRefresh();
      state.sel = null;
      show('v-board');
      startBoard();
    };
  } else if (walkActive) {
    primaryBtn.textContent = 'gangtid →';
    primaryBtn.disabled = depTs < now - 120000;
    primaryBtn.onclick = () => {
      show('v-walk');
      window._buildWalkBar && window._buildWalkBar();
      window._renderWalk && window._renderWalk();
    };
  } else {
    primaryBtn.textContent = 'reis →';
    primaryBtn.disabled = depTs < now - 120000;
    primaryBtn.onclick = () => window.doBoard && window.doBoard();
  }
  ctaDiv.appendChild(primaryBtn);

  if (!departed) {
    const starBtn = document.createElement('button');
    const hhmm = clk(depTs);
    const isSaved = loadFavs().some(f =>
      f.type === 'timed' && f.from === dir.from && f.to === dir.to
      && f.line === lc && f.departureHHMM === hhmm);
    starBtn.className = 'cta-btn secondary';
    starBtn.textContent = isSaved ? '★ lagret' : '☆ lagre avgang';
    starBtn.onclick = () => {
      const favs = loadFavs();
      const existing = favs.find(f =>
        f.type === 'timed' && f.from === dir.from && f.to === dir.to
        && f.line === lc && f.departureHHMM === hhmm);
      if (existing) removeFav(existing.id);
      else addTimedFav(c, dir);
      renderSelected();
    };
    ctaDiv.appendChild(starBtn);
  }

  document.getElementById('v-selected').appendChild(ctaDiv);
  renderSelDeps();
}

function renderSelDeps() {
  const old = document.getElementById('s-dep-list');
  if (old) old.remove();
  if (!state.deps || !state.deps.length) return;
  const now = Date.now();
  const dir = config.dirs[state.dIdx];
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

  if (!rows.length) return;

  let html = '';
  rows.forEach(({ c, i }) => {
    const depTs = new Date(c.expectedDepartureTime).getTime();
    const depDiffSec = Math.floor((depTs - now) / 1000);
    const mins = Math.floor(Math.max(0, depDiffSec) / 60);
    const depSecs = Math.max(0, depDiffSec) % 60;
    const isSel = selTs !== null && Math.abs(depTs - selTs) < 30000;
    const ln = c.serviceJourney && c.serviceJourney.line;
    const bg = ln && ln.presentation && ln.presentation.colour ? '#' + ln.presentation.colour : '#7c2d12';
    const visLegs = c._legs ? c._legs.slice(0, 3) : null;
    const badges = visLegs
      ? visLegs.map(l => {
          const ll = l.serviceJourney && l.serviceJourney.line;
          const lbg = ll && ll.presentation && ll.presentation.colour ? '#' + ll.presentation.colour : '#7c2d12';
          return '<span class="line-badge" style="background:' + lbg + '">' + ((ll && ll.publicCode) || '?') + '</span>';
        }).join('<span class="transfer-arrow" aria-hidden="true">→</span>')
      : '<span class="line-badge" style="background:' + bg + '">' + ((ln && ln.publicCode) || '?') + '</span>';
    const dest = (c.destinationDisplay && c.destinationDisplay.frontText) || '';
    const sjc = c.serviceJourney && c.serviceJourney.estimatedCalls;
    const arrCall = findArr(sjc, dir.to);
    const arrT = (arrCall && (arrCall.expectedArrivalTime || arrCall.aimedArrivalTime)) || c._finalArrival || null;
    const sMinsLabel = depDiffSec <= 0 ? 'nå' : mins < 60 ? mins + ' min' : Math.floor(mins / 60) + ' t' + (mins % 60 > 0 ? ' ' + mins % 60 + ' m' : '');
    const sA11y = ((ln && ln.publicCode) ? ln.publicCode + ' ' : '') + dest + ', avgang om ' + sMinsLabel;
    html += '<div class="w-dep-row' + (isSel ? ' active' : '') + '"'
      + (isSel
        ? ''
        : ' onclick="window.tap(' + i + ')"'
          + ' role="button" tabindex="0"'
          + ' aria-label="' + sA11y.replace(/"/g, '&quot;') + '"'
          + ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();window.tap(' + i + ')}"'
      ) + '>'
      + '<div class="w-dep-mins' + (mins >= 60 ? ' clock' : '') + '">' + (() => {
          if (depDiffSec <= 0) return 'NÅ';
          if (depDiffSec < 60) return depSecs + '<span>sek</span>';
          if (mins < 60)       return mins + '<span>min</span>';
          return clk(depTs);
        })() + '</div>'
      + '<div class="w-dep-mid">' + badges + '<span class="w-dep-dest">' + dest + '</span>' + (arrT ? '<span class="w-dep-arr">ank.' + clk(arrT) + '</span>' : '') + '</div>'
      + '</div>';
  });

  const el = document.createElement('div');
  el.id = 's-dep-list';
  el.style.cssText = 'border-top:1px solid rgba(245,184,64,.08);margin-top:.75rem;padding-top:.25rem';
  el.innerHTML = html;
  document.getElementById('v-selected').appendChild(el);
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
