import { loadPlan, savePlan, clearPlan, removeLegFromPlan, legStatus, planStatus } from '../api/plan.js';
import { state } from '../state.js';
import { show } from '../ui/nav.js';
import config from '../config.js';
import L from 'leaflet';
import { geocodePlace } from '../api/entur.js';

function pad(n) { return String(n).padStart(2, '0'); }
function clk(v) { const d = new Date(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function fmtCountdown(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (m >= 60) return Math.floor(m / 60) + 't ' + pad(m % 60) + 'm';
  if (m >= 1) return m + ' min ' + pad(s) + 's';
  return s + 's';
}

let _planInterval = null;

// ── Plan map ────────────────────────
const _TILE = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

let _planMap = null;
let _planMapKey = '';
let _planMapLayer = null;
let _planMapExpanded = false;

function _destroyPlanMap() {
  if (_planMap) { _planMap.remove(); _planMap = null; }
  _planMapKey = '';
  _planMapLayer = null;
  _planMapExpanded = false;
}

async function _renderPlanMap(legs) {
  const wrap = document.getElementById('plan-map-wrap');
  if (!legs.length) {
    if (wrap) wrap.style.display = 'none';
    _destroyPlanMap();
    return;
  }

  const key = legs.map(l => l.id).join(',');
  if (key === _planMapKey) return;
  _planMapKey = key;

  if (wrap) wrap.style.display = 'block';

  // Geocode unique station names
  const names = [legs[0].from, ...legs.map(l => l.to)];
  const unique = [...new Set(names)];
  const coords = {};
  await Promise.all(unique.map(async name => {
    try {
      const r = await geocodePlace(name);
      if (r[0]) coords[name] = { lat: r[0].lat, lon: r[0].lon };
    } catch {}
  }));

  const el = document.getElementById('plan-map');
  if (!el) return;

  if (!_planMap) {
    _planMap = L.map(el, { zoomControl: true, attributionControl: false, zoomControlOptions: { position: 'topleft' } });
    L.tileLayer(_TILE, { subdomains: 'abcd', attribution: '© CartoDB' }).addTo(_planMap);
    L.control.scale({ imperial: false, maxWidth: 100, position: 'bottomleft' }).addTo(_planMap);

    const expandBtn = document.getElementById('plan-map-expand');
    if (expandBtn) {
      expandBtn.onclick = () => {
        _planMapExpanded = !_planMapExpanded;
        el.classList.toggle('expanded', _planMapExpanded);
        expandBtn.textContent = _planMapExpanded ? '✕' : '⤢';
        expandBtn.setAttribute('aria-label', _planMapExpanded ? 'Minimer kart' : 'Utvid kart');
        setTimeout(() => _planMap && _planMap.invalidateSize(), 320);
      };
    }
  }

  if (_planMapLayer) { _planMapLayer.clearLayers(); }
  else { _planMapLayer = L.layerGroup().addTo(_planMap); }

  const allPts = [];

  legs.forEach((leg, i) => {
    const fromC = coords[leg.from];
    const toC = coords[leg.to];
    if (fromC && toC) {
      const color = '#' + (leg.lineColour || '7c2d12');
      L.polyline([[fromC.lat, fromC.lon], [toC.lat, toC.lon]], {
        color, weight: 4, opacity: 0.85,
      }).addTo(_planMapLayer);
      allPts.push([fromC.lat, fromC.lon], [toC.lat, toC.lon]);
    }

    if (i === 0 && fromC) {
      L.circleMarker([fromC.lat, fromC.lon], {
        radius: 7, color: '#fff', fillColor: '#f5b840', fillOpacity: 0.9, weight: 2,
      }).bindTooltip(leg.from.toLowerCase(), { className: 'map-label', direction: 'top' })
        .addTo(_planMapLayer);
    }

    if (toC) {
      const bg = '#' + (leg.lineColour || '7c2d12');
      const badgeHtml = '<div style="text-align:center;transform:translate(-50%,-50%)">'
        + '<span class="line-badge" style="background:' + bg + ';font-size:11px;padding:3px 7px">' + leg.line + '</span>'
        + '</div>';
      const icon = L.divIcon({ className: '', html: badgeHtml, iconSize: [0, 0], iconAnchor: [0, 0] });
      L.marker([toC.lat, toC.lon], { icon })
        .bindTooltip(leg.to.toLowerCase(), { className: 'map-label', direction: 'top' })
        .addTo(_planMapLayer);
    }
  });

  if (allPts.length > 1) {
    _planMap.fitBounds(allPts, { padding: [32, 32], maxZoom: 15 });
  } else if (allPts.length === 1) {
    _planMap.setView(allPts[0], 14);
  }
}

// ── Context strip (shown on v-board) ────────────────────────

export function updatePlanCtx() {
  const el = document.getElementById('plan-ctx');
  if (!el) return;
  const legs = loadPlan();
  if (!legs.length) { el.style.display = 'none'; return; }

  // Show the last leg as a reference for the next connection
  const last = legs[legs.length - 1];
  const now = Date.now();
  const st = legStatus(last, now);
  const arrTs = last.arrIso ? new Date(last.arrIso).getTime() : null;
  const depTs = new Date(last.depIso).getTime();
  const n = legs.length;

  let statusLine = '';
  if (st === 'done') {
    statusLine = '<span class="pctx-done">ankom ' + (arrTs ? clk(arrTs) : '—') + '</span>';
  } else if (st === 'active' && arrTs) {
    const rem = arrTs - now;
    statusLine = '<span class="pctx-active">'
      + (rem > 0 ? fmtCountdown(rem) + ' igjen' : 'ankommer nå') + '</span>';
  } else {
    statusLine = '<span class="pctx-future">avgang ' + clk(depTs) + '</span>';
  }

  el.style.display = 'flex';
  el.innerHTML =
    '<button class="pctx-main" aria-label="Se reise underveis">'
    + '<span class="pctx-label">etappe ' + n + '</span>'
    + '<span class="line-badge pctx-badge" style="background:#' + last.lineColour + '">' + last.line + '</span>'
    + '<span class="pctx-dest">' + last.to.toLowerCase() + '</span>'
    + (arrTs ? '<span class="pctx-arr">ank. ' + clk(arrTs) + '</span>' : '')
    + statusLine
    + '</button>'
    + '<button class="pctx-close" aria-label="Lukk kontekst">×</button>';

  el.querySelector('.pctx-main').addEventListener('click', () => {
    if (state.jny) window.jnyGoTracking && window.jnyGoTracking();
  });
  el.querySelector('.pctx-close').addEventListener('click', () => {
    el.style.display = 'none';
  });
}

// ── Plan screen ────────────────────────

export function renderPlan() {
  const el = document.getElementById('plan-content');
  if (!el) return;

  const now = Date.now();
  const legs = loadPlan();
  const status = planStatus(legs, now);

  if (!legs.length) {
    el.innerHTML =
      '<div class="plan-empty">'
      + 'Ingen etapper planlagt ennå.<br>'
      + 'Velg en avgang og trykk<br>'
      + '«legg til i reiseplan» for å starte.'
      + '</div>';
    _stopPlanInterval();
    updatePlanCtx();
    _renderPlanMap([]);
    return;
  }

  _renderPlanMap(legs);

  const firstDep = new Date(legs[0].depIso).getTime();
  const lastArr = legs[legs.length - 1].arrIso
    ? new Date(legs[legs.length - 1].arrIso).getTime()
    : null;

  let metaHtml = '';
  if (status === 'done') {
    metaHtml = '<div class="plan-journey-done">Reisen er fullført ✓</div>';
  } else if (status === 'active') {
    metaHtml = '<div class="plan-journey-meta">Reise startet ' + clk(firstDep)
      + (lastArr ? ' · planlagt ankomst ' + clk(lastArr) : '') + '</div>';
  } else {
    metaHtml = '<div class="plan-journey-meta">Avreise ' + clk(firstDep) + '</div>';
  }

  let timelineHtml = '<div class="plan-timeline">';
  legs.forEach(leg => {
    const st = legStatus(leg, now);
    const depTs = new Date(leg.depIso).getTime();
    const arrTs = leg.arrIso ? new Date(leg.arrIso).getTime() : null;

    let bottomHtml = '';
    if (st === 'done') {
      bottomHtml = '<div class="plan-leg-check">✓ ankomst ' + (arrTs ? clk(arrTs) : '—') + '</div>';
    } else if (st === 'active') {
      if (arrTs) {
        const remaining = arrTs - now;
        bottomHtml = '<div class="plan-leg-countdown">'
          + (remaining > 0 ? fmtCountdown(remaining) + ' igjen' : 'ankommer nå') + '</div>';
      }
    } else {
      const wait = depTs - now;
      bottomHtml = '<div class="plan-leg-countdown">om ' + fmtCountdown(wait) + '</div>';
    }

    timelineHtml +=
      '<div class="plan-leg-card ' + st + '" role="button" tabindex="0"'
      + ' onclick="window._tapPlanLeg(\'' + leg.id + '\')"'
      + ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();window._tapPlanLeg(\'' + leg.id + '\')}">'
      + '<div class="plan-leg-dot ' + st + '"></div>'
      + '<button class="plan-leg-del" onclick="event.stopPropagation();window._planDelLeg(\'' + leg.id + '\')" aria-label="Fjern etappe">×</button>'
      + '<div class="plan-leg-top">'
      + '<span class="line-badge" style="background:#' + leg.lineColour + '">' + leg.line + '</span>'
      + '<div class="plan-leg-route">'
      + '<div class="plan-leg-from">' + leg.from.toLowerCase() + '</div>'
      + '<div class="plan-leg-to">' + leg.to.toLowerCase() + '</div>'
      + '</div>'
      + '</div>'
      + '<div class="plan-leg-times">'
      + '<span>' + clk(leg.depIso) + '</span>'
      + (arrTs ? '<span class="plan-leg-arr">→ ' + clk(arrTs) + '</span>' : '')
      + '</div>'
      + bottomHtml
      + '</div>';
  });
  timelineHtml += '</div>';

  let actionsHtml = '<div class="plan-actions">';
  if (status !== 'done') {
    actionsHtml +=
      '<button class="plan-add-btn" id="plan-add-leg-btn">+ legg til neste etappe →</button>';
  }
  actionsHtml +=
    '<button class="plan-clear-btn" id="plan-clear-btn">'
    + (status === 'done' ? 'Ny reiseplan' : 'Avslutt reiseplan')
    + '</button>';
  actionsHtml += '</div>';

  el.innerHTML = metaHtml + timelineHtml + actionsHtml;

  const addBtn = document.getElementById('plan-add-leg-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      updatePlanCtx();
      show('v-board');
      window._startBoard && window._startBoard();
    });
  }

  const clearBtn = document.getElementById('plan-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearPlan();
      _destroyPlanMap();
      updatePlanCtx();
      renderPlan();
    });
  }

  _startPlanInterval();
}

function _startPlanInterval() {
  if (_planInterval) return;
  _planInterval = setInterval(() => {
    const planView = document.getElementById('v-plan');
    if (planView && planView.style.display !== 'none') renderPlan();
    // Also refresh context strip on board if it is visible
    const ctxEl = document.getElementById('plan-ctx');
    if (ctxEl && ctxEl.style.display !== 'none') updatePlanCtx();
  }, 1000);
}

function _stopPlanInterval() {
  if (_planInterval) { clearInterval(_planInterval); _planInterval = null; }
}

window._planDelLeg = (id) => {
  removeLegFromPlan(id);
  updatePlanCtx();
  renderPlan();
};

window._tapPlanLeg = (id) => {
  const leg = loadPlan().find(l => l.id === id);
  if (!leg) return;

  // Set direction context to match the plan leg's route
  const dIdx = config.dirs.findIndex(d => d.from.toLowerCase() === leg.from.toLowerCase());
  if (dIdx >= 0) state.dIdx = dIdx;

  // If the departure is still in the live board data, use the full object
  if (state.deps && state.deps.length) {
    const live = state.deps.find(d => d.expectedDepartureTime === leg.depIso);
    if (live) { window.tap(live); return; }
  }

  // Synthesise a departure object from the stored plan data
  window.tap({
    serviceJourney: {
      id: leg.serviceJourneyId || null,
      line: {
        publicCode: leg.line,
        presentation: { colour: leg.lineColour },
        transportMode: 'metro',
      },
      estimatedCalls: [],
    },
    destinationDisplay: { frontText: leg.to },
    quay: { publicCode: '?' },
    expectedDepartureTime: leg.depIso,
    aimedDepartureTime: leg.depIso,
    realtime: false,
    cancellation: false,
    _finalArrival: leg.arrIso || null,
    _isTransfer: false,
  });
};

window._renderPlan = renderPlan;
window._updatePlanCtx = updatePlanCtx;
