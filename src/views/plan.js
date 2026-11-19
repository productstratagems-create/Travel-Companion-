import { linjemerke } from '../ui/linjemerke.js';
import { loadPlan, savePlan, clearPlan, removeLegFromPlan, legStatus, planStatus, legExtent, legFarge, etappeKjede, planBytter, avgangGyldig, loadPlanNå, settGjentak } from '../api/plan.js';
import { gjentakTekst, FORHÅNDSVALG, UKE, UKEDAG_BOKSTAV, UKEDAG_KORT, nesteGjentak } from '../api/gjentak.js';
import { LINJE_FARGE, LINJE_NØYTRAL } from '../ui/linjemerke.js';
import { shareLegCalendar } from '../api/calShare.js';
import { placeName, placeLL, samePlace } from '../api/place.js';
import { logMsg } from '../ui/log.js';
import { clk, clkDay } from '../ui/fmt.js';
import { state } from '../state.js';
import { show, updateHeader, navTo } from '../ui/nav.js';
import { confirmTap } from '../ui/confirm.js';
import config from '../config.js';
import L from 'leaflet';
import { tokens, alpha } from '../ui/themeTokens.js';
import { createMap, bindMapExpand, drawRoute } from '../ui/map.js';
import { loadReturn, returnWindow } from '../api/returnTrip.js';
import { esc } from '../ui/fmt.js';
import { geocodePlace, fetchJourneyMeta } from '../api/entur.js';

function pad(n) { return String(n).padStart(2, '0'); }
function fmtCountdown(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (m >= 60) return Math.floor(m / 60) + 't ' + pad(m % 60) + 'm';
  if (m >= 1) return m + ' min ' + pad(s) + 's';
  return s + 's';
}

let _planInterval = null;

// ── Plan map ────────────────────────

let _planMap = null;
let _planUserMoved = false;
let _planMapKey = '';
let _planMapLayer = null;

function _destroyPlanMap() {
  if (_planMap) { _planMap.remove(); _planMap = null; }
  _planMapKey = '';
  _planMapLayer = null;
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

  // Fetch precise stop data — use fetchJourneyMeta when serviceJourneyId available
  // (journeyGQL returns lat/lon per stop), fall back to geocoding otherwise
  const legData = await Promise.all(legs.map(async (leg) => {
    const color = legFarge(leg) ? '#' + String(legFarge(leg)).replace('#', '') : (LINJE_FARGE[leg.mode] || LINJE_NØYTRAL);

    // ETAPPEN BÆRER LISTA SI. Ingen henting, ingen gjetting, og kartet
    // tegnes selv uten nett. Den ble tatt vare på i det øyeblikket etappen
    // ble lagret — den samme lista `_renderSelMap` tegnet av på skjermen da.
    const egne = Array.isArray(leg.stops) ? leg.stops.filter(x => x && x.lat != null && x.lon != null) : [];
    if (egne.length >= 2) {
      const { fromIdx, toIdx } = legExtent(egne, leg);
      const slice = egne.slice(fromIdx, toIdx + 1);
      const pts = (slice.length >= 2 ? slice : egne).map(c => [c.lat, c.lon]);
      return { leg, color,
        fromCoord: { lat: pts[0][0], lon: pts[0][1] },
        toCoord: { lat: pts[pts.length - 1][0], lon: pts[pts.length - 1][1] },
        routePts: pts };
    }

    if (leg.serviceJourneyId) {
      try {
        const meta = await fetchJourneyMeta(leg.serviceJourneyId);
        if (meta && meta.calls && meta.calls.length) {
          // Regelen har ett navn nå, i api/plan.js, så den kan måles.
          const { fromIdx, toIdx } = legExtent(meta.calls, leg);

          // Route: all stops from fromIdx to toIdx (inclusive)
          const slice = meta.calls.slice(fromIdx, toIdx + 1);
          const routePts = slice
            .filter(c => c.lat && c.lon)
            .map(c => [c.lat, c.lon]);

          const fromCoord = routePts[0] ? { lat: routePts[0][0], lon: routePts[0][1] } : null;
          const toCoord   = routePts[routePts.length - 1]
            ? { lat: routePts[routePts.length - 1][0], lon: routePts[routePts.length - 1][1] }
            : null;

          return { leg, color, fromCoord, toCoord, routePts };
        }
      } catch {}
    }

    // Geocoding fallback
    const [fromR, toR] = await Promise.all([
      geocodePlace(placeName(leg.from)).catch(() => []),
      geocodePlace(placeName(leg.to)).catch(() => []),
    ]);
    const fromCoord = fromR[0] ? { lat: fromR[0].lat, lon: fromR[0].lon } : null;
    const toCoord   = toR[0]   ? { lat: toR[0].lat,   lon: toR[0].lon   } : null;
    return {
      leg, color, fromCoord, toCoord,
      routePts: (fromCoord && toCoord)
        ? [[fromCoord.lat, fromCoord.lon], [toCoord.lat, toCoord.lon]]
        : [],
    };
  }));

  // Bail if a newer render started while these awaits were in flight
  if (_planMapKey !== key) return;

  const el = document.getElementById('plan-map');
  if (!el) return;

  if (!_planMap) {
    _planUserMoved = false;
  _planMap = createMap(el, { expandable: true });

    // Bare dragstart (review 2026-11-10): appens egen fitBounds utløser
    // zoomstart, og da trodde kartet at du hadde flyttet det og sluttet å
    // ramme inn — en ny etappe havnet utenfor. Samme feil som auto.js rettet.
    _planMap.on('dragstart', () => { _planUserMoved = true; });
  bindMapExpand(_planMap, el, document.getElementById('plan-map-expand'));
  }

  if (_planMapLayer) { _planMapLayer.clearLayers(); }
  else { _planMapLayer = L.layerGroup().addTo(_planMap); }

  const allPts = [];

  legData.forEach((data, i) => {
    const { leg, color, fromCoord, toCoord, routePts } = data;

    // Draw route through intermediate stops (or straight line for geocoded fallback)
    if (routePts.length > 1) {
      drawRoute(_planMapLayer, routePts, { color, weight: 4, opacity: 0.85 });
      allPts.push(...routePts);
    }

    // Origin marker (gold circle, first leg only)
    if (i === 0 && fromCoord) {
      L.circleMarker([fromCoord.lat, fromCoord.lon], {
        radius: 7, color: '#fff', fillColor: tokens().accent, fillOpacity: 0.9, weight: 2,
      }).bindTooltip(placeName(leg.from).toLowerCase(), { className: 'map-label', direction: 'top' })
        .addTo(_planMapLayer);
    }

    // Destination / transfer stop: line-badge marker
    if (toCoord) {
      const badgeHtml = '<div style="text-align:center;transform:translate(-50%,-50%)">'
        + linjemerke({ kode: leg.line, farge: color, linjeId: leg.lineId, modus: leg.mode, stil: 'font-size:11px;padding:3px 7px' })
        + '</div>';
      const icon = L.divIcon({ className: '', html: badgeHtml, iconSize: [0, 0], iconAnchor: [0, 0] });
      L.marker([toCoord.lat, toCoord.lon], { icon })
        .bindTooltip(placeName(leg.to).toLowerCase(), { className: 'map-label', direction: 'top' })
        .addTo(_planMapLayer);
    }
  });

  // DRO DU KARTET, EIER DU DET.
  //
  // Denne rammet inn på nytt ved hver tegning. Dro du kartet til side for å se
  // hvor du skulle, hoppet det tilbake neste gang planen oppdaterte seg —
  // rettesnorens «ingenting skal hoppe», brutt under fingeren. `board.js` har
  // hatt vakten hele tiden (`_bUserMoved`, satt på `dragstart`); den er den
  // samme her.
  if (!_planUserMoved) {
    if (allPts.length > 1) {
      _planMap.fitBounds(allPts, { padding: [32, 32], maxZoom: 15 });
    } else if (allPts.length === 1) {
      _planMap.setView(allPts[0], 14);
    }
  }
}

// ── Context strip (shown on v-board) ────────────────────────

// Structural key: rebuild the full chip DOM only when legs/status/style change.
// When only the active countdown text changes, update the span in-place.
let _planCtxKey = '';

export function updatePlanCtx() {
  const el = document.getElementById('plan-ctx');
  if (!el) return;
  const legs = loadPlanNå();
  if (!legs.length) { el.style.display = 'none'; _planCtxKey = ''; return; }

  const last = legs[legs.length - 1];
  const now = Date.now();
  const st = legStatus(last, now);
  const arrTs = last.arrIso ? new Date(last.arrIso).getTime() : null;
  const depTs = new Date(last.depIso).getTime();
  const n = legs.length;

  // Status text (the only part that changes every second for active legs)
  let statusText = '';
  let statusClass = '';
  if (st === 'done') {
    statusText = 'ankom ' + (arrTs ? clkDay(arrTs) : '—');
    statusClass = 'pctx-done';
  } else if (st === 'active' && arrTs) {
    const rem = arrTs - now;
    statusText = rem > 0 ? fmtCountdown(rem) + ' igjen' : 'ankommer nå';
    statusClass = 'pctx-active';
  } else {
    // Dagen og klokka står alt på linje 1 (v1.218.159); her: hvor lenge til.
    statusText = 'om ' + fmtCountdown(depTs - now);
    statusClass = 'pctx-future';
  }

  // Key: everything that controls the chip's structure
  const structKey = n + '|' + last.id + '|' + st + '|' + last.lineColour + '|' + JSON.stringify(legs[0].gjentak || null) + '|' + legs[0].depIso;   // gjentakelsen tegner kortet på nytt (v1.218.167)

  if (structKey === _planCtxKey) {
    // Only update the status text in-place — no DOM rebuild
    const statusEl = document.getElementById('pctx-status');
    if (statusEl) statusEl.textContent = statusText;
    return;
  }
  _planCtxKey = structKey;

  el.style.display = 'flex';
  // ETT KORT, TO LINJER (v1.218.159). Bestilt: «Den planlagte reisen bør
  // kunne nås med et klikk. Kortet bør reflektere at det er et bytte underveis
  // istedet for å si "etappe 1".» Som en kommende reise i Google Maps,
  // Citymapper og Ruter: når og hvor øverst, linjekjeden og byttene under.
  const first = legs[0];
  const firstDep = new Date(first.depIso).getTime();
  const kjede = legs.flatMap(etappeKjede);
  const by = planBytter(legs);
  el.innerHTML =
    '<button class="pctx-main" aria-label="' + esc('Åpne planlagt reise: ' + placeName(first.from) + ' til ' + placeName(last.to)
      + (by.antall ? ', ' + by.antall + (by.antall === 1 ? ' bytte' : ' bytter') : '')) + '">'
    + '<span class="pctx-l1">' + (first.gjentak ? '<span class="pctx-gjentak" title="' + esc('gjentas ' + gjentakTekst(first.gjentak.dager)) + '">↻ </span>' : '') + esc(clkDay(firstDep) + ' ' + placeName(first.from) + ' → ' + (arrTs ? (new Date(arrTs).toDateString() === new Date(firstDep).toDateString() ? clk(arrTs) : clkDay(arrTs)) + ' ' : '') + placeName(last.to)) + '</span>'
    + '<span class="pctx-l2">' + kjede.map(k => linjemerke({ kode: k.line, farge: k.lineColour, tekst: k.lineFg, linjeId: k.lineId, modus: k.mode, klasse: 'pctx-badge' }))
      .join('<span class="pctx-pil" aria-hidden="true">›</span>')
    + '<span class="pctx-bytte">' + esc(by.antall ? by.antall + (by.antall === 1 ? ' bytte' : ' bytter') + (by.steder.length ? ' · ' + by.steder.join(', ') : '') : 'direkte') + '</span>'
    + '<span id="pctx-status" class="' + statusClass + '">' + statusText + '</span></span>'
    + '</button>'
    + '<button class="pctx-close" aria-label="Skjul kortet">×</button>';

  el.querySelector('.pctx-main').addEventListener('click', () => åpnePlan());
  el.querySelector('.pctx-close').addEventListener('click', () => {
    el.style.display = 'none';
  });
}

/**
 * ETT TRYKK TIL REISEN (v1.218.159). Følges den, Underveis; ellers planen
 * i Lagret. Før virket trykket bare når reisen alt ble fulgt.
 */
export function åpnePlan() {
  if (state.jny) { window.jnyGoTracking && window.jnyGoTracking(); return 'underveis'; }
  // AVGANGSDETALJENE (v1.218.160). Bestilt: «kortet som legges øverst på
  // Rute-siden ved trykk skal lede bruker til avgangsdetaljer.»
  const første = loadPlanNå()[0];
  if (første && window._tapPlanLeg) { window._tapPlanLeg(første.id); return 'detaljer'; }
  navTo('v-saved');
  window._renderSaved && window._renderSaved('plan');
  return 'plan';
}

// ── Plan screen ────────────────────────

// Structural key: legs IDs + their status. Full plan-content rebuild only when
// this changes — otherwise update countdowns in-place to prevent layout reflows
// that would cause the sibling plan map to flicker.
let _planStructKey = '';

function _planStructuralKey(legs, now) {
  return legs.map(l => l.id + ':' + legStatus(l, now)).join(',');
}

function _updatePlanCountdowns(legs, now) {
  legs.forEach(leg => {
    const cdEl = document.getElementById('pcd-' + leg.id);
    if (!cdEl) return;
    const depTs = new Date(leg.depIso).getTime();
    const arrTs = leg.arrIso ? new Date(leg.arrIso).getTime() : null;
    const st = legStatus(leg, now);
    if (st === 'done') {
      cdEl.textContent = '✓ ankomst ' + (arrTs ? clkDay(arrTs) : '—');
    } else if (st === 'active' && arrTs) {
      const remaining = arrTs - now;
      cdEl.textContent = remaining > 0 ? fmtCountdown(remaining) + ' igjen' : 'ankommer nå';
    } else if (st !== 'active') {
      cdEl.textContent = 'om ' + fmtCountdown(depTs - now);
    }
  });
}

/**
 * The trip home, on the screen that is already about "your journey later".
 *
 * It is not a plan leg — no service journey, no platform, just a route and a
 * time — so it sits above them as its own card rather than pretending to be
 * one.
 */
function _returnCardHtml() {
  const r = loadReturn();
  if (!r) return '';
  const w = returnWindow(r, Date.now());
  const when = w.active ? 'nå' : 'kl. ' + r.atHHMM;
  return '<div class="plan-return-card">'
    + '<span class="prc-label">hjemreise · ' + esc(when) + '</span>'
    + '<span class="prc-route">' + esc(r.from) + ' → ' + esc(r.to) + '</span>'
    + '</div>';
}

export function renderPlan() {
  const el = document.getElementById('plan-content');
  if (!el) return;

  const now = Date.now();
  const legs = loadPlanNå();

  if (!legs.length) {
    _planStructKey = '';
    el.innerHTML = _returnCardHtml()
      + '<div class="plan-empty">'
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
  _planStructKey = _planStructuralKey(legs, now);

  const status = planStatus(legs, now);
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

    // Countdown element gets stable ID so _updatePlanCountdowns can update in-place
    let bottomHtml = '';
    if (st === 'done') {
      bottomHtml = '<div class="plan-leg-check" id="pcd-' + leg.id + '">✓ ankomst ' + (arrTs ? clk(arrTs) : '—') + '</div>';
    } else if (st === 'active') {
      if (arrTs) {
        const remaining = arrTs - now;
        bottomHtml = '<div class="plan-leg-countdown" id="pcd-' + leg.id + '">'
          + (remaining > 0 ? fmtCountdown(remaining) + ' igjen' : 'ankommer nå') + '</div>';
      }
    } else {
      const wait = depTs - now;
      bottomHtml = '<div class="plan-leg-countdown" id="pcd-' + leg.id + '">om ' + fmtCountdown(wait) + '</div>';
    }

    timelineHtml +=
      '<div class="plan-leg-card ' + st + '" role="button" tabindex="0"'
      + ' onclick="window._tapPlanLeg(\'' + leg.id + '\')"'
      + ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();window._tapPlanLeg(\'' + leg.id + '\')}">'
      + '<div class="plan-leg-dot ' + st + '"></div>'
      + '<button class="plan-leg-del" onclick="event.stopPropagation();window._planDelLeg(\'' + leg.id + '\')" aria-label="Fjern etappe">×</button>'
      // VARSELET, og bare på en etappe som ikke har begynt: en alarm for en
      // reise du alt sitter på er støy. event.stopPropagation() av samme grunn
      // som slettknappen over — kortet under åpner etappen.
      // GJENTA (v1.218.167): ↻ åpner valget; teksten sier regelen og neste gang.
      + '<button class="plan-leg-gjenta' + (leg.gjentak ? ' aktiv' : '') + '" onclick="event.stopPropagation();window._planGjenta(\'' + leg.id + '\')"'
        + ' aria-label="' + (leg.gjentak ? 'Gjentas ' + esc(gjentakTekst(leg.gjentak.dager)) + ' — endre' : 'Gjenta reisen') + '">↻</button>'
      + (st === 'future'
        ? '<button class="plan-leg-cal" onclick="event.stopPropagation();window._planCalLeg(\'' + leg.id + '\')"'
          + ' aria-label="Legg etappen i kalenderen med alarm når du må gå">🔔</button>'
        : '')
      + '<div class="plan-leg-top">'
      // Hele kjeden, «72 › L2» (v1.218.160), ikke bare første linje.
      + etappeKjede(leg).map(k => linjemerke({ kode: k.line, farge: k.lineColour || legFarge(leg), tekst: k.lineFg, linjeId: k.lineId, modus: k.mode }))
        .join('<span class="pctx-pil" aria-hidden="true">›</span>')
      + '<div class="plan-leg-route">'
      + '<div class="plan-leg-from">' + placeName(leg.from).toLowerCase() + '</div>'
      + '<div class="plan-leg-to">' + placeName(leg.to).toLowerCase() + '</div>'
      + (leg.gjentak ? '<div class="plan-leg-gjentak">↻ ' + esc(gjentakTekst(leg.gjentak.dager)) + ' · neste ' + esc(clkDay(new Date(leg.depIso).getTime())) + '</div>' : '')
      + (planBytter([leg]).antall ? '<div class="plan-leg-bytte">' + esc(planBytter([leg]).antall + (planBytter([leg]).antall === 1 ? ' bytte' : ' bytter') + (planBytter([leg]).steder.length ? ' · ' + planBytter([leg]).steder.join(', ') : '')) + '</div>' : '')
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
    + (status === 'done' ? 'Ny reiseplan' : 'Slett reiseplan')
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
    clearBtn.addEventListener('click', (e) => {
      const run = () => {
        clearPlan();
        _destroyPlanMap();
        updatePlanCtx();
        renderPlan();
      };
      if (status === 'done') { run(); return; }
      confirmTap(e.currentTarget, 'sikker? trykk igjen for å slette', run);
    });
  }

  _startPlanInterval();
}

function _startPlanInterval() {
  if (_planInterval) return;
  _planInterval = setInterval(() => {
    const now = Date.now();
    const planView = document.getElementById('v-saved');
    const planPane = document.getElementById('saved-plan');
    if (planView && planView.style.display !== 'none' && planPane && planPane.style.display !== 'none') {
      const legs = loadPlanNå();
      if (legs.length) {
        const sk = _planStructuralKey(legs, now);
        if (sk !== _planStructKey) {
          renderPlan(); // structural change — full rebuild
        } else {
          _updatePlanCountdowns(legs, now); // only text updates, no DOM thrash
        }
      }
    }
    // Context strip on board
    const ctxEl = document.getElementById('plan-ctx');
    if (ctxEl && ctxEl.style.display !== 'none') updatePlanCtx();
  }, 1000);
}

function _stopPlanInterval() {
  if (_planInterval) { clearInterval(_planInterval); _planInterval = null; }
}

window._planDelLeg = (id) => {
  removeLegFromPlan(id);
  _planStructKey = ''; // force full rebuild on next tick
  updatePlanCtx();
  renderPlan();
};

/**
 * The leg into the reader's own calendar, with the alarm on «gå nå».
 *
 * A LADDER, like the rest of this app's outward edges: share sheet first
 * because that is the iOS path — a text/calendar File lands in Kalender from
 * there — then a download for desktop and Android, then a word rather than
 * nothing. `ui/nav.js` shares a link the same way, one rung shorter.
 *
 * Nothing leaves the phone that the reader did not send: the file is built
 * here and handed to the operating system, which asks them where it goes.
 */
window._planCalLeg = async (id) => {
  const leg = loadPlan().find(l => l.id === id);
  if (leg) await shareLegCalendar(leg);
};

window._tapPlanLeg = (id) => {
  const leg = loadPlan().find(l => l.id === id);
  if (!leg) return;
  // GJENTAKENDE (v1.218.167): neste forekomst er en ANNEN tur enn den lagrede.
  // Samme dør som tidfestede favoritter: tavla åpner avgangen nærmest
  // klokkeslettet den dagen (board.js `_åpneBestiltFav`).
  const n = nesteGjentak(leg, Date.now());
  if (n && new Date(n.dep).toISOString() !== leg.depIso && window._useRouteDir) {
    const d0 = new Date(leg.depIso), p2 = x => String(x).padStart(2, '0');
    window._åpneFavAvgang = { fav: { line: leg.line, departureHHMM: p2(d0.getHours()) + ':' + p2(d0.getMinutes()), from: placeName(leg.from), to: placeName(leg.to) }, målMs: n.dep };
    window._useRouteDir({ ...legDir(leg), atMs: n.dep - 2 * 60_000 });
    return;
  }

  // Capture the FROM station that state.deps was fetched for BEFORE updating dIdx.
  // After the update, state.deps is stale for the new direction.
  const prevDepsFrom = (config.dirs[state.dIdx] && config.dirs[state.dIdx].from || '').toLowerCase();

  // Set direction context to match the plan leg's route
  const dIdx = config.dirs.findIndex(d => samePlace(d && d.from, leg.from));
  if (dIdx >= 0 && dIdx !== state.dIdx) {
    state.dIdx = dIdx;
    updateHeader();
  }

  // Only use live board data if it was fetched from the same station as this leg's
  // departure — prevents a time-collision match from a different station's departures
  const legFrom = placeName(leg.from).toLowerCase();
  if (prevDepsFrom === legFrom && state.deps && state.deps.length) {
    const live = state.deps.find(d => d.expectedDepartureTime === leg.depIso);
    if (live) { window.tap(live); return; }
  }

  // ETAPPEN SOM ETAPPEN (review 2026-11-10). Her sto transportMode 'metro'
  // for alt, plattform '?', ingen stopp, og ruta var den som tilfeldigvis var
  // aktiv — avgangsdetaljene sa «Jernbanetorget → Nationaltheatret» og
  // «−1 min reise» om buss 74 fra Mortensrud. Nå bærer avgangen sin egen rute
  // (`_dir`, lest av `_selDir()` i selected.js), sine stopp og sitt spor.
  const d = legDir(leg);
  if (state.statLL && !state.statLL[d.key] && placeLL(leg.from)) state.statLL[d.key] = placeLL(leg.from);
  // HELE REISEN (v1.218.160): lagret med overgangen, åpnes den med overgangen.
  if (avgangGyldig(leg.avgang)) { window.tap({ ...leg.avgang, _dir: legDir(leg) }); return; }
  window.tap({
    serviceJourney: {
      id: leg.serviceJourneyId || null,
      line: {
        id: leg.lineId || null,
        publicCode: leg.line,
        presentation: { colour: legFarge(leg), textColour: leg.lineFg || null },
        transportMode: leg.mode || null,
      },
      estimatedCalls: legKall(leg),
    },
    destinationDisplay: { frontText: leg.frontText || placeName(leg.to) },
    quay: { publicCode: leg.quay || '?' },
    expectedDepartureTime: leg.depIso,
    aimedDepartureTime: leg.depIso,
    realtime: false,
    cancellation: false,
    _finalArrival: leg.arrIso || null,
    _isTransfer: false,
    _gåTil: leg.gåTil || null,
    _dir: legDir(leg),
  });
};

/** Etappens egen rute, i formen avgangsdetaljene leser. */
export function legDir(leg) {
  return { key: 'plan:' + leg.id, from: placeName(leg.from), to: placeName(leg.to),
    stopId: (leg.from && leg.from.id) || null, toStopId: (leg.to && leg.to.id) || null, filter: null, line: null };
}

/** Etappens stopp som kall, så ankomsten finnes ved navn (findArr). */
export function legKall(leg) {
  return (Array.isArray(leg.stops) ? leg.stops : []).map(s => ({
    quay: { publicCode: null, latitude: s.lat, longitude: s.lon, stopPlace: { id: s.id || null, name: s.name, latitude: s.lat, longitude: s.lon } },
    expectedArrivalTime: s.at || null, aimedArrivalTime: s.at || null,
    expectedDepartureTime: s.at || null, aimedDepartureTime: s.at || null,
  }));
}

window._renderPlan = renderPlan;
window._updatePlanCtx = updatePlanCtx;

/* ── GJENTA (v1.218.167): forhåndsvalg og ukedager, som Kalender og Påminnelser. */
window._planGjenta = (id) => {
  const leg = loadPlan().find(l => l.id === id);
  const kort = document.querySelector('.plan-leg-card [onclick*="_planGjenta(\'' + id + '\')"]');
  const host = kort && kort.closest('.plan-leg-card');
  if (!leg || !host) return;
  const åpen = host.querySelector('.plan-gjenta-panel');
  if (åpen) { åpen.remove(); return; }
  let valgt = new Set((leg.gjentak && leg.gjentak.dager) || []);
  const panel = document.createElement('div');
  panel.className = 'plan-gjenta-panel';
  panel.addEventListener('click', e => e.stopPropagation());
  const tegn = () => {
    panel.innerHTML = '<div class="pgp-rad">' + Object.keys(FORHÅNDSVALG).map(n =>
      '<button type="button" class="auto-fra-knapp' + (gjentakTekst([...valgt]) === n && valgt.size ? ' valgt' : '') + '" data-forh="' + n + '">' + n + '</button>').join('') + '</div>'
      + '<div class="pgp-rad pgp-dager">' + UKE.map(d => '<button type="button" class="pgp-dag' + (valgt.has(d) ? ' valgt' : '') + '" data-dag="' + d + '" aria-pressed="' + valgt.has(d) + '" aria-label="' + UKEDAG_KORT[d] + '">' + UKEDAG_BOKSTAV[d] + '</button>').join('') + '</div>'
      + '<div class="pgp-rad"><button type="button" class="auto-fra-knapp" data-av="1">ikke gjenta</button><button type="button" class="auto-fra-knapp pgp-ok" data-ok="1">ferdig</button></div>';
  };
  panel.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.forh) valgt = new Set(FORHÅNDSVALG[b.dataset.forh]);
    else if (b.dataset.dag) { const d = Number(b.dataset.dag); valgt.has(d) ? valgt.delete(d) : valgt.add(d); }
    else if (b.dataset.av) { valgt = new Set(); settGjentak(id, null); renderPlan(); return; }
    else if (b.dataset.ok) { settGjentak(id, [...valgt]); renderPlan(); updatePlanCtx(); return; }
    tegn();
  });
  tegn();
  host.appendChild(panel);
};
