import config from '../config.js';
import { state, intervals } from '../state.js';
import { walkInfo, mToLeave, reachCls, findArr, isWalkActive } from '../geo.js';
import { fetchJourneyMeta } from '../api/entur.js';
import { fetchWeather, forecastAt, weatherAdvice } from '../api/weather.js';
import { loadFavs, addTimedFav, removeFav } from '../ui/favs.js';
import { addLegToPlan, isLegInPlan } from '../api/plan.js';
import { updatePlanCtx } from './plan.js';
import { logMsg } from '../ui/log.js';
import { show } from '../ui/nav.js';
import { startBoard } from './board.js';
import { renderAlerts } from '../ui/alerts.js';
import { fmtMins } from '../ui/fmt.js';
import L from 'leaflet';

function pad(n) { return String(n).padStart(2, '0'); }
function clk(v) { const d = new Date(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function cleanName(s) { return (s || '').replace(/,\s*\S.*$/, '').replace(/\s+T$/i, '').trim(); }

let _selWeather = null;

function _selWeatherHtml(arrT) {
  if (!_selWeather) return '<span class="sel-wx-loading">laster vær…</span>';
  if (_selWeather._err) return '';
  const w = _selWeather;
  const nowParts = [w.icon + ' ' + w.temp + '°'];
  if (w.wind >= 12) nowParts.push(w.wind + ' m/s');
  if (w.precip >= 0.3) nowParts.push(w.precip.toFixed(1) + ' mm');
  let html = '<span class="sel-wx-now">' + nowParts.join(' · ') + '</span>';

  if (arrT && w.forecast) {
    const arrTs = new Date(arrT).getTime();
    if (arrTs > Date.now() + 20 * 60000) {
      const fc = forecastAt(w.forecast, arrT);
      if (fc) {
        const fcAdv = weatherAdvice(fc.temp, fc.precip, fc.wind);
        const fcParts = [fc.icon + ' ' + fc.temp + '°'];
        if (fc.wind >= 12) fcParts.push(fc.wind + ' m/s');
        if (fc.precip >= 0.3) fcParts.push(fc.precip.toFixed(1) + ' mm');
        html += '<span class="sel-wx-arr"> → ved ankomst ' + fcParts.join(' · ') + '</span>';
        if (fcAdv && fcAdv !== w.advice) {
          html += '<span class="sel-wx-adv">' + fcAdv + '</span>';
        }
      }
    }
  }

  if (w.advice && (!arrT || new Date(arrT).getTime() < Date.now() + 20 * 60000)) {
    html += '<span class="sel-wx-adv">' + w.advice + '</span>';
  }

  return html;
}

// ── Route map ────────────────────────────────────────────────
const _TILE = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
let _selMap = null, _selLayer = null;

function _ns(s) { return (s || '').toLowerCase().replace(/,.*$/, '').replace(/\s+t$/i, '').trim(); }

function _depToRouteLegs(dep, fromName, toName) {
  if (!dep) return null;
  if (dep._legs && dep._legs.length) {
    const legs = [];
    for (const leg of dep._legs) {
      const calls = (leg.serviceJourney && leg.serviceJourney.estimatedCalls) || [];
      if (!calls.length) continue;
      const fLow = _ns((leg.fromPlace && leg.fromPlace.name) || fromName);
      const tLow = _ns((leg.toPlace   && leg.toPlace.name)   || toName);
      let fi = 0, ti = calls.length - 1;
      calls.forEach((ca, i) => {
        const nm = _ns(ca.quay && ca.quay.stopPlace && ca.quay.stopPlace.name);
        if (nm && (nm.includes(fLow) || fLow.includes(nm))) fi = i;
        if (nm && (nm.includes(tLow) || tLow.includes(nm)) && i >= fi) ti = i;
      });
      const stops = calls.slice(fi, ti + 1).map(ca => {
        const sp = ca.quay && ca.quay.stopPlace;
        return sp && sp.latitude ? { name: cleanName(sp.name), lat: sp.latitude, lon: sp.longitude } : null;
      }).filter(Boolean);
      if (stops.length < 2) continue;
      const ll = leg.serviceJourney && leg.serviceJourney.line;
      legs.push({ stops, color: ll && ll.presentation && ll.presentation.colour ? '#' + ll.presentation.colour : null });
    }
    return legs.length ? legs : null;
  }
  const calls = dep.serviceJourney && dep.serviceJourney.estimatedCalls;
  if (!calls || !calls.length) return null;
  const fLow = _ns(fromName), tLow = _ns(toName);
  let fi = 0, ti = calls.length - 1;
  calls.forEach((ca, i) => {
    const nm = _ns(ca.quay && ca.quay.stopPlace && ca.quay.stopPlace.name);
    if (nm && (nm.includes(fLow) || fLow.includes(nm))) fi = i;
    if (nm && (nm.includes(tLow) || tLow.includes(nm)) && i >= fi) ti = i;
  });
  const stops = calls.slice(fi, ti + 1).map(ca => {
    const sp = ca.quay && ca.quay.stopPlace;
    return sp && sp.latitude ? { name: cleanName(sp.name), lat: sp.latitude, lon: sp.longitude } : null;
  }).filter(Boolean);
  if (stops.length < 2) return null;
  const sj = dep.serviceJourney;
  const color = sj && sj.line && sj.line.presentation && sj.line.presentation.colour ? '#' + sj.line.presentation.colour : null;
  return [{ stops, color }];
}

let _selMapKey = '';

export function destroySelMap() {
  if (_selMap) { _selMap.remove(); _selMap = null; _selLayer = null; }
  _selMapKey = '';
}

function _selMapStructKey(dep, legs) {
  const jid = (dep.serviceJourney && dep.serviceJourney.id) || '';
  return jid + '|' + legs.map(l => {
    const f = l.stops[0], t = l.stops[l.stops.length - 1];
    return l.stops.length + ':' + f.lat + ',' + f.lon + ':' + t.lat + ',' + t.lon;
  }).join('|');
}

function _renderSelMap(dep, fromName, toName) {
  const wrap = document.getElementById('sel-map-wrap');
  const mapEl = document.getElementById('sel-map');
  if (!wrap || !mapEl) return;

  const legs = _depToRouteLegs(dep, fromName, toName);
  if (!legs) { wrap.style.display = 'none'; destroySelMap(); return; }

  // Rebuild only when the route itself changes — renderSelected runs every
  // second and recreating the Leaflet map each tick flickers and resets pan/zoom
  const key = _selMapStructKey(dep, legs);
  if (key === _selMapKey && _selMap) return;
  _selMapKey = key;

  wrap.style.display = 'block';
  destroySelMap();
  _selMapKey = key;
  _selMap = L.map(mapEl, { zoomControl: true, attributionControl: false, zoomControlOptions: { position: 'topleft' } });
  L.tileLayer(_TILE, { subdomains: 'abcd' }).addTo(_selMap);
  _selLayer = L.layerGroup().addTo(_selMap);

  const pts = [];
  legs.forEach(({ stops, color }, li) => {
    const lc = color || '#f5b840';
    L.polyline(stops.map(s => [s.lat, s.lon]), { color: lc, weight: 4, opacity: 0.8 }).addTo(_selLayer);
    stops.forEach((s, i) => {
      pts.push([s.lat, s.lon]);
      const isFirst = li === 0 && i === 0;
      const isLast  = li === legs.length - 1 && i === stops.length - 1;
      if (isFirst || isLast) {
        const html = '<div style="background:' + (isLast ? '#f5b840' : lc) + ';border:2px solid #fff;border-radius:50%;'
          + 'width:14px;height:14px;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>';
        L.marker([s.lat, s.lon], { icon: L.divIcon({ className: '', html, iconSize: [14, 14], iconAnchor: [7, 7] }) })
          .bindTooltip(s.name, { permanent: true, direction: isFirst ? 'bottom' : 'top', offset: [0, isFirst ? 8 : -10], className: 'sel-stop-label' })
          .addTo(_selLayer);
      } else {
        L.circleMarker([s.lat, s.lon], { radius: 4, color: '#fff', fillColor: lc, fillOpacity: 0.9, weight: 1.5 })
          .bindTooltip(s.name, { className: 'sel-stop-label', direction: 'top' })
          .addTo(_selLayer);
      }
    });
  });

  // User position
  const userPos = state.walkFromLL || state.homeLL;
  if (userPos) {
    L.circleMarker([userPos.lat, userPos.lon], { radius: 6, color: '#60a5fa', fillColor: '#60a5fa', fillOpacity: 0.9, weight: 2 })
      .bindTooltip('Din posisjon', { className: 'sel-stop-label' })
      .addTo(_selLayer);
  }

  if (pts.length) _selMap.fitBounds(pts, { padding: [32, 32], maxZoom: 15 });
  setTimeout(() => _selMap && _selMap.invalidateSize(), 100);

  const expandBtn = document.getElementById('sel-map-expand');
  if (expandBtn) {
    expandBtn.onclick = () => {
      const exp = mapEl.classList.toggle('expanded');
      expandBtn.textContent = exp ? '✕' : '⤢';
      expandBtn.setAttribute('aria-label', exp ? 'Minimer kart' : 'Utvid kart');
      setTimeout(() => _selMap && _selMap.invalidateSize(), 320);
    };
  }
}

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
  if (rcls === 'missed') urgMsg = '<span style="color:#dc2626">Rekker ikke — velg neste avgang</span>';
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

  // Fetch weather at user's position if not already available
  const _wxPos = state.walkFromLL || state.homeLL;
  if (!_selWeather && _wxPos) {
    fetchWeather(_wxPos.lat, _wxPos.lon)
      .then(w => {
        _selWeather = w;
        const el = document.getElementById('sel-weather-content');
        if (el) el.innerHTML = _selWeatherHtml(arrT);
      })
      .catch(() => { _selWeather = { _err: true }; });
  }

  // Remember the original departure platform so we can detect changes later
  if (!c._origQuay && quay !== '?') c._origQuay = quay;

  document.getElementById('s-content').innerHTML = ''
    + '<div class="train-chip">'
    + chipBadges
    + '<span class="tc-dest">' + dest + '</span>'
    + (quay !== '?' ? '<span class="tc-meta">spor <span>' + quay + '</span>' + (delayed ? ' · <span style="color:#fcd34d">forsinket</span>' : '') + '</span>' : (delayed ? '<span class="tc-meta"><span style="color:#fcd34d">forsinket</span></span>' : ''))
    + '</div>'
    + '<div id="s-live-status"></div>'
    + '<div class="sel-route-ctx">' + dir.from.toLowerCase() + ' → ' + dir.to.toLowerCase() + '</div>'
    + '<div class="sel-weather" id="sel-weather-content">' + _selWeatherHtml(arrT) + '</div>'
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

    const planBtn = document.createElement('button');
    const alreadyInPlan = isLegInPlan(c.expectedDepartureTime);
    planBtn.className = 'cta-btn secondary';
    planBtn.textContent = alreadyInPlan ? '📋 i reiseplan' : '📋 legg til i reiseplan';
    if (!alreadyInPlan) {
      planBtn.onclick = () => {
        addLegToPlan(c, dir);
        updatePlanCtx();
        renderSelected();
      };
    } else {
      planBtn.style.opacity = '.6';
      planBtn.disabled = true;
    }
    ctaDiv.appendChild(planBtn);
  }

  document.getElementById('v-selected').appendChild(ctaDiv);
  renderSelDeps();
  _renderSelMap(state.sel, dir.from, dir.to);
}

function renderSelDeps() {
  const old = document.getElementById('s-dep-list');
  if (old) old.remove();
  if (!state.deps || !state.deps.length) return;
  const now = Date.now();
  const selTs = state.sel ? new Date(state.sel.expectedDepartureTime).getTime() : null;

  // Deduplicate by departure minute, then find the first upcoming departure
  // that is clearly after the selected one (> 90 s gap)
  const indexed = state.deps.map((c, i) => ({ c, i }));
  indexed.sort((a, b) => new Date(a.c.expectedDepartureTime) - new Date(b.c.expectedDepartureTime));
  const byMin = new Map();
  indexed.forEach(({ c, i }) => {
    const min = Math.floor(new Date(c.expectedDepartureTime) / 60000);
    const arr = c._finalArrival ? new Date(c._finalArrival).getTime() : Infinity;
    const cur = byMin.get(min);
    if (!cur || arr < cur.arr) byMin.set(min, { c, i, arr });
  });

  const upcoming = Array.from(byMin.values())
    .filter(({ c }) => new Date(c.expectedDepartureTime).getTime() > now - 30000);

  // Pick the first departure that isn't the selected one
  const next = upcoming.find(({ c }) => {
    const ts = new Date(c.expectedDepartureTime).getTime();
    return !selTs || ts > selTs + 90000;
  });
  if (!next) return;

  const { c, i } = next;
  const depTs = new Date(c.expectedDepartureTime).getTime();
  const mins = Math.max(0, Math.floor((depTs - now) / 60000));
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
  const minsLabel = mins <= 0 ? 'nå' : mins < 60 ? mins + ' min' : clk(depTs);
  const a11y = 'Neste avgang: ' + ((ln && ln.publicCode) || '') + ' om ' + minsLabel;

  const el = document.createElement('div');
  el.id = 's-dep-list';
  el.innerHTML = '<div class="s-next-dep">'
    + '<span class="s-next-label">neste</span>'
    + badges
    + '<span class="s-next-mins">' + minsLabel + '</span>'
    + '</div>';
  el.querySelector('.s-next-dep').setAttribute('role', 'button');
  el.querySelector('.s-next-dep').setAttribute('tabindex', '0');
  el.querySelector('.s-next-dep').setAttribute('aria-label', a11y);
  el.querySelector('.s-next-dep').addEventListener('click', () => window.tap(c));
  el.querySelector('.s-next-dep').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.tap(c); }
  });
  document.getElementById('v-selected').appendChild(el);
}

export function startSelRefresh() {
  if (intervals.sel) clearInterval(intervals.sel);
  _fetchSel();
  intervals.sel = setInterval(_fetchSel, config.selRefreshMs);
}

export function stopSelRefresh() {
  if (intervals.sel) { clearInterval(intervals.sel); intervals.sel = null; }
  _selWeather = null;
}

function _fetchSel() {
  const jid = state.lockedJourneyId
    || (state.sel && state.sel.serviceJourney && state.sel.serviceJourney.id);
  if (!jid) return;
  fetchJourneyMeta(jid)
    .then(meta => {
      if (!meta || !state.sel) return;
      // Drop stale responses: the user may have selected a different departure
      // while this fetch was in flight
      const curJid = state.lockedJourneyId
        || (state.sel.serviceJourney && state.sel.serviceJourney.id);
      if (curJid !== jid) return;

      // The journey query returns the line's FULL run — calls[0] is the line's
      // origin terminal, not the user's boarding stop. All live values (departure
      // time, delay, platform) must come from the boarding stop's call.
      const dir = config.dirs[state.dIdx];
      const norm = s => (s || '').toLowerCase().replace(/\s+t$/i, '').trim();
      const fromN = norm(dir.from);
      const boarding = meta.calls.find(c => norm(c.name) === fromN) || null;
      if (boarding) {
        const dMs = boarding.aimed && boarding.expected
          ? new Date(boarding.expected).getTime() - new Date(boarding.aimed).getTime()
          : 0;
        meta.delayMins = Math.round(dMs / 60000);
        meta.quay = boarding.quay;
        meta.realtime = boarding.realtime;
      }
      state.lockedJourneyMeta = meta;
      // Advance the departure time so leaveby stays accurate
      if (boarding && boarding.realtime && boarding.expected) {
        state.sel.expectedDepartureTime = boarding.expected;
      }
      // Keep estimated calls in sync for the route map
      state.sel.serviceJourney.estimatedCalls = meta.calls.map(c => ({
        quay: { publicCode: c.quay, stopPlace: { name: c.name, latitude: c.lat, longitude: c.lon } },
        aimedArrivalTime:      c.aimed,
        expectedArrivalTime:   c.expected,
        aimedDepartureTime:    c.aimed,
        expectedDepartureTime: c.expected,
        realtime:              c.realtime,
      }));
      _refreshSelDisplay();
      logMsg('sel live: ' + meta.calls.length + ' stopp'
        + (meta.cancelled ? ' · INNSTILT' : meta.delayMins >= 2 ? ' · +' + meta.delayMins + 'min' : ''), 'ok');
    })
    .catch(err => logMsg('sel ✗ ' + err.message, 'err'));
}

function _refreshSelDisplay() {
  const meta = state.lockedJourneyMeta;
  const c    = state.sel;
  if (!c || !meta) return;

  // ── Live status banner (cancellation / delay / platform change) ──
  const statusEl = document.getElementById('s-live-status');
  if (statusEl) {
    const origQuay = c._origQuay || null;
    let html = '';
    if (meta.cancelled) {
      html = '<div class="jny-status-bar jny-status-cancelled">Avgangen er innstilt</div>';
    } else {
      if (meta.delayMins >= 2) {
        html += '<div class="jny-status-bar jny-status-delay">+' + meta.delayMins + ' min forsinkelse</div>';
      }
      if (meta.quay && origQuay && meta.quay !== origQuay) {
        html += '<div class="jny-status-bar jny-status-quay">Spor endret til ' + meta.quay + '</div>';
      }
    }
    statusEl.innerHTML = html;
  }

  // ── Disable boarding CTA when cancelled ──
  if (meta.cancelled) {
    const primaryBtn = document.querySelector('#s-ctas .cta-btn:first-child');
    if (primaryBtn && !primaryBtn.disabled) primaryBtn.disabled = true;
  }

  // ── Update leaveby countdown with corrected departure time ──
  if (!meta.cancelled) {
    const depTs    = new Date(c.expectedDepartureTime).getTime();
    const wk       = walkInfo();
    const leaveByTs = depTs - wk.mins * 60000;
    const mtl      = mToLeave(depTs);
    const rcls     = reachCls(mtl);
    const ltCls    = rcls === 'r-ok' ? 'lt-ok' : rcls === 'r-soon' ? 'lt-soon'
      : rcls === 'r-now' ? 'lt-now' : 'lt-late';

    const lbEl = document.querySelector('.leaveby-time');
    if (lbEl) {
      lbEl.className = 'leaveby-time ' + ltCls;
      lbEl.textContent = clk(leaveByTs);
    }
    const lbSubEl = document.querySelector('.leaveby-sub');
    if (lbSubEl) {
      let urgMsg;
      if (rcls === 'missed') urgMsg = '<span style="color:#dc2626">Rekker ikke — velg neste avgang</span>';
      else if (rcls === 'r-now') urgMsg = '<span class="go">Gå nå!</span>';
      else urgMsg = 'Gå om <span class="amber">' + fmtMins(mtl) + '</span>';
      lbSubEl.innerHTML = urgMsg;
    }
  }
}

// Expose for nav bridges
window._renderSelected = renderSelected;
window._destroySelMap  = destroySelMap;
