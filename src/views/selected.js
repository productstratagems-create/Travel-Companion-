import config from '../config.js';
import { normJid } from '../api/queries.js';
import { stopKey } from '../stopId.js';
import { clk, clkDay, dayPrefix, countdownText } from '../ui/fmt.js';
import { state, intervals } from '../state.js';
import { walkInfo, mToLeave, reachCls, findArr, isWalkActive, walkFocus, userLL } from '../geo.js';
import { fetchJourneyMeta } from '../api/entur.js';
import { quayLatLon, legShape, journeyPoints, _rowDest } from '../api/adapt.js';
import { fetchWeather, forecastAt, weatherAdvice } from '../api/weather.js';
import { loadFavs, addTimedFav, removeFav } from '../ui/favs.js';
import { addLegToPlan, isLegInPlan } from '../api/plan.js';
import { shareLegCalendar, canShareCal } from '../api/calShare.js';
import { updatePlanCtx } from './plan.js';
import { logMsg } from '../ui/log.js';
import { esc } from '../ui/fmt.js';
import { show } from '../ui/nav.js';
import { startBoard, boardRows } from './board.js';
import { renderAlertsInto } from '../ui/alerts.js';
import { fmtMins } from '../ui/fmt.js';
import L from 'leaflet';
import { createMap, bindMapExpand, drawRoute, drawWalk, userDot, drawLeg, drawJourneyPoints, fitPadding } from '../ui/map.js';
import { tokens } from '../ui/themeTokens.js';

function cleanName(s) { return (s || '').replace(/,\s*\S.*$/, '').replace(/\s+T$/i, '').trim(); }

// Walk-deadline sub-line. States the remaining margin as a fact and leaves the
// decision to the reader — colour carries the urgency, the words don't command.
function leaveByMsg(rcls, mtl, depTs, now) {
  if (rcls === 'missed') {
    return '<span style="color:#dc2626">passert for ' + fmtMins(Math.abs(mtl)) + ' siden</span>';
  }
  // «igjen» belongs to a duration. Past the horizon this is a clock face, and
  // the word is dropped with it — countdownText says which it handed back
  // rather than leaving the caller to test the threshold again.
  const cls = rcls === 'r-far' ? 'soft' : rcls === 'r-now' ? 'go' : 'amber';
  const ct = countdownText(rcls, mtl, depTs, now);
  return '<span class="' + cls + '">' + esc(ct.text) + '</span>' + (ct.counting ? ' igjen' : '');
}

/**
 * The whole sub-line, built ONCE.
 *
 * It was assembled twice — «gå senest HH:MM · » + leaveByMsg at the initial
 * render, and leaveByMsg alone in the refresher, so the «gå senest» half
 * vanished the moment journey metadata arrived. And past the horizon the two
 * halves said the same thing: the probe printed «gå senest 11:18 · i morgen
 * 11:25», a clock face twice on one line. Past the horizon the deadline alone
 * is the fact; the departure is already the hero above it.
 */
function _subLine(rcls, mtl, leaveByTs, depTs, now) {
  // clkDay, not clk: a departure tomorrow has a deadline tomorrow, and «gå
  // senest 11:19» beside a hero reading «i morgen» invited the reader to leave
  // today. The prefix is empty for today, so nothing changes in the ordinary
  // case.
  const deadline = 'gå senest ' + clkDay(leaveByTs, now);
  if (rcls === 'r-far') return deadline;
  return deadline + ' · ' + leaveByMsg(rcls, mtl, depTs, now);
}

/**
 * The hero's class, and the hero itself — each defined ONCE.
 *
 * Both were written twice: renderSelected built `ltCls` and the number at
 * :317/:332, and the post-fetch refresher built `ltCls` again at :755 and then
 * wrote a BARE CLOCK TIME into the same element. So the big number silently
 * changed form the moment journey metadata arrived — a countdown before the
 * fetch, a clock face after it, in the largest type on the screen. Nobody
 * decided that; the two copies simply disagreed.
 */
function _ltCls(rcls) {
  return rcls === 'r-far'  ? 'lt-far'
    : rcls === 'r-ok'   ? 'lt-ok'
    : rcls === 'r-soon' ? 'lt-soon'
    : rcls === 'r-now'  ? 'lt-now'
    : 'lt-late';
}

/** @returns {{num: string|number, unit: string, lbl: string}} */
function _hero(secsToLeave, depTs, now, rcls) {
  // Past the horizon the hero stops counting down and names the departure.
  // Derived from the bucket, like every other consequence of the horizon.
  if (rcls === 'r-far') {
    // The DAY goes in the label, the clock in the hero. «I MORGEN 11:26» as
    // one giant string is mostly letters, is 358px wide on a 390px screen, and
    // repeats the «avgår» card below it verbatim. Split, it reads as one fact
    // with its qualifier — and the hero stays a number, which is what the type
    // at 16vw was designed for.
    return { num: clk(depTs), unit: '', lbl: ('avgang ' + dayPrefix(depTs, now)).trim() };
  }
  if (secsToLeave < 0) {
    return { num: Math.max(0, Math.floor((depTs - now) / 60000)), unit: 'min', lbl: 'til avgang' };
  }
  if (secsToLeave < 60) return { num: secsToLeave, unit: 'sek', lbl: 'til du bør gå' };
  if (secsToLeave < 3600) {
    return { num: Math.floor(secsToLeave / 60), unit: 'min', lbl: 'til du bør gå' };
  }
  const h = Math.floor(secsToLeave / 3600), rm = Math.floor((secsToLeave % 3600) / 60);
  return { num: h + 't', unit: rm > 0 ? rm + 'm' : '', lbl: 'til du bør gå' };
}

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
    if (arrTs > Date.now() + config.arrivalForecastMinMs) {
      const fc = forecastAt(w.forecast, arrT);
      if (fc) {
        const fcAdv = weatherAdvice(fc.temp, fc.precip, fc.wind,
          { feels: fc.feels, precipProb: fc.precipProb });
        const fcParts = [fc.icon + ' ' + fc.temp + '°'];
        if (fc.feels != null && Math.abs(fc.feels - fc.temp) >= 2) fcParts.push('føles som ' + fc.feels + '°');
        if (fc.wind >= 12) fcParts.push(fc.wind + ' m/s');
        if (fc.precipProb != null && fc.precipProb >= 20) fcParts.push(fc.precipProb + '% regn');
        else if (fc.precip >= 0.3) fcParts.push(fc.precip.toFixed(1) + ' mm');
        html += '<span class="sel-wx-arr"> → ved ankomst ' + fcParts.join(' · ') + '</span>';
        if (fcAdv && fcAdv !== w.advice) {
          html += '<span class="sel-wx-adv">' + fcAdv + '</span>';
        }
      }
    }
  }

  if (w.advice && (!arrT || new Date(arrT).getTime() < Date.now() + config.arrivalForecastMinMs)) {
    html += '<span class="sel-wx-adv">' + w.advice + '</span>';
  }

  return html;
}

// ── Route map ────────────────────────────────────────────────
let _selMap = null, _selLayer = null;

/** A foot leg's two ends, for when the response carried no geometry for it. */
function _legEnds(leg) {
  const a = leg && leg.fromPlace, b = leg && leg.toPlace;
  if (!a || !b || a.latitude == null || b.latitude == null) return [];
  return [[a.latitude, a.longitude], [b.latitude, b.longitude]];
}

// Was a fourth hand-rolled copy of the stop normaliser. The substring
// matching below it is a looser rule with its own purpose and stays; only the
// normalisation is now the shared one.
const _ns = stopKey;

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
        const ll = quayLatLon(ca.quay);
        return sp && ll ? { name: cleanName(sp.name), lat: ll.lat, lon: ll.lon } : null;
      }).filter(Boolean);
      if (stops.length < 2) continue;
      const ll = leg.serviceJourney && leg.serviceJourney.line;
      // The MODE travels with the leg now. It was the one thing this
      // descriptor did not carry, which is why the map drew a bus and a metro
      // with the same stroke — corridorStyle could not be asked a question
      // with no answer in hand.
      legs.push({ stops, shape: legShape(leg), mode: leg.mode || null,
                  color: ll && ll.presentation && ll.presentation.colour ? '#' + ll.presentation.colour : null });
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
    const ll = quayLatLon(ca.quay);
    return sp && ll ? { name: cleanName(sp.name), lat: ll.lat, lon: ll.lon } : null;
  }).filter(Boolean);
  if (stops.length < 2) return null;
  const sj = dep.serviceJourney;
  const color = sj && sj.line && sj.line.presentation && sj.line.presentation.colour ? '#' + sj.line.presentation.colour : null;
  const only = dep._legs && dep._legs[0];
  return [{ stops, shape: legShape(only), mode: (only && only.mode) || null, color }];
}

let _selMapKey = '';

export function destroySelMap() {
  if (_selMap) { _selMap.remove(); _selMap = null; _selLayer = null; }
  _selMapKey = '';
}

function _selMapStructKey(dep, legs, dir) {
  const jid = (dep.serviceJourney && dep.serviceJourney.id) || '';
  const destSuffix = (dir._toLat && dir._toLon && !dir.toStopId)
    ? '|dest:' + dir._toLat + ',' + dir._toLon : '';
  return jid + '|' + legs.map(l => {
    const f = l.stops[0], t = l.stops[l.stops.length - 1];
    return l.stops.length + ':' + f.lat + ',' + f.lon + ':' + t.lat + ',' + t.lon;
  }).join('|') + destSuffix;
}

function _renderSelMap(dep, fromName, toName) {
  const wrap = document.getElementById('sel-map-wrap');
  const mapEl = document.getElementById('sel-map');
  if (!wrap || !mapEl) return;

  const dir = config.dirs[state.dIdx];
  const legs = _depToRouteLegs(dep, fromName, toName);
  if (!legs) { wrap.style.display = 'none'; destroySelMap(); return; }

  // Rebuild only when the route itself changes — renderSelected runs every
  // second and recreating the Leaflet map each tick flickers and resets pan/zoom
  const key = _selMapStructKey(dep, legs, dir);
  if (key === _selMapKey && _selMap) return;
  _selMapKey = key;

  wrap.style.display = 'block';
  destroySelMap();
  _selMapKey = key;
  _selMap = createMap(mapEl, { expandable: true });
  // PADDING IN PROPORTION TO THE BAND, not a number chosen for a bigger map.
  //
  // Both fits below asked for 40px. On a 130px map that is 62% of the height
  // spent on margin, and the measurement is blunt: the journey filled THREE
  // PER CENT of the band. A line you cannot see is not less crowded than a
  // line with beads on it — it is a different failure.
  //
  // Named in ui/map.js so the rule is one rule — see fitPadding.
  const pad = fitPadding(mapEl.clientHeight);

  _selLayer = L.layerGroup().addTo(_selMap);

  const destIsVenue = dir._toLat && dir._toLon && !dir.toStopId;
  const pts = [];

  // FRAME FIRST, THEN DRAW — and this is the third time that order has been
  // the answer.
  //
  // The beads are hidden when there is no room, and «room» is measured in
  // pixels against the projection. fitBounds ran at the BOTTOM of this
  // function, after the markers were placed, so drawing had no frame at all:
  // the first attempt threw «Set map center and zoom first» and the render
  // died with ten markers gone. A provisional setView fixed the throw and made
  // it worse — the gate then measured a frame the map was about to leave, and
  // the overlaps went from three to eight.
  //
  // v1.102.0 learned this on the board map: gather the points, fit with the
  // animation off, then draw. `animate:false` matters — an animated fit is a
  // frame in motion, which is no frame to measure against.
  const frame = [];
  legs.forEach(lg => (lg.stops || []).forEach(st => frame.push([st.lat, st.lon])));
  if (destIsVenue) frame.push([dir._toLat, dir._toLon]);
  if (frame.length) _selMap.fitBounds(frame, { padding: [pad, pad], maxZoom: 15, animate: false });

  legs.forEach(({ stops, shape, color, mode }, li) => {
    const lc = color || tokens().accent;
    // Real alignment where the leg carried one; the stop chain otherwise. The
    // markers below still come from stops either way.
    //
    // THE STOPS YOU PASS THROUGH, on the app's terms rather than this screen's.
    //
    // This map drew a THIRD and FOURTH marker style for them: a 4px circle for
    // the ones between, a 5px one for an alighting stop. Measured at 130px, ten
    // markers produced THREE overlapping pairs — the beads ran into each other
    // and into the endpoints, which is what made the band look busy.
    //
    // makeRouteStopIcon is the bead the board and underveis draw, and
    // stopsReadable is the gate that has decided «is there room» since v1.99.
    // Handing both to drawLeg does two things at once: the beads look like
    // beads everywhere, and on a band this short the gate simply removes them —
    // which is the right answer and the reason that gate exists.
    drawLeg(_selLayer, {
      mode, colour: lc,
      pts: shape || stops.map(s => [s.lat, s.lon]),
      stops,
    }, { project: ll => _selMap.latLngToContainerPoint(ll) });

    // The two ENDS keep their permanent names, and that is measured rather
    // than assumed: the two labels do not overlap each other and do not leave
    // the frame. This screen is about ONE departure from X to Y, so the names
    // are the fact — «PÅ» and «AV» would say what the heading above already
    // says and lose the only thing the map adds.
    stops.forEach((s, i) => {
      pts.push([s.lat, s.lon]);
      const isFirst = li === 0 && i === 0;
      // When destination is a venue, the last transit stop is the alighting stop —
      // render it as an intermediate stop, not the terminus, so the venue pin is distinct.
      const isLast  = !destIsVenue && li === legs.length - 1 && i === stops.length - 1;
      const isAlight = destIsVenue && li === legs.length - 1 && i === stops.length - 1;
      if (!isFirst && !isLast && !isAlight) return;
      const html = '<div style="background:' + (isLast ? tokens().accent : lc) + ';border:2px solid #fff;border-radius:50%;'
        + 'width:14px;height:14px;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>';
      L.marker([s.lat, s.lon], { icon: L.divIcon({ className: '', html, iconSize: [14, 14], iconAnchor: [7, 7] }) })
        .bindTooltip(s.name, { permanent: true, direction: isFirst ? 'bottom' : 'top', offset: [0, isFirst ? 8 : -10], className: 'sel-stop-label' })
        .addTo(_selLayer);
    });
  });

  // AND THE CHANGE, which this screen marked with nothing at all.
  //
  // The board says «BYTT» and underveis says «BYTT»; here a two-leg departure
  // simply changed colour mid-line and left the reader to infer where. The
  // same rule and the same marker, fed the leg ends this screen holds.
  drawJourneyPoints(_selLayer, journeyPoints(legs.map((lg, i) => ({
    mode: lg.mode,
    fromPlace: { name: lg.stops[0].name, latitude: lg.stops[0].lat, longitude: lg.stops[0].lon },
    toPlace: { name: lg.stops[lg.stops.length - 1].name,
      latitude: lg.stops[lg.stops.length - 1].lat, longitude: lg.stops[lg.stops.length - 1].lon },
  }))).filter(p => p.kind === 'change'),
  { colour: (legs[0] && legs[0].color) || tokens().accent,
    project: ll => _selMap.latLngToContainerPoint(ll), minPoints: 1 });

  // Walking extension to venue destination
  if (destIsVenue) {
    const lastLeg = legs[legs.length - 1];
    const alightStop = lastLeg && lastLeg.stops[lastLeg.stops.length - 1];
    const destLL = { lat: dir._toLat, lon: dir._toLon };
    pts.push([destLL.lat, destLL.lon]);

    // Venue pin
    const pinHtml = '<svg width="20" height="28" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="M11 0C5 0 0 5 0 11c0 8.3 11 19 11 19S22 19.3 22 11C22 5 17 0 11 0z" fill="' + tokens().accent + '"/>'
      + '<circle cx="11" cy="11" r="4.5" fill="#b8860b"/></svg>';
    L.marker([destLL.lat, destLL.lon], {
      icon: L.divIcon({ className: '', html: pinHtml, iconSize: [20, 28], iconAnchor: [10, 28] }),
    }).bindTooltip(dir.to || 'Destinasjon', { permanent: true, direction: 'top', offset: [0, -30], className: 'sel-stop-label' })
      .addTo(_selLayer);

    // The walk itself comes from the itinerary, not from a second query.
    //
    // What was here fetched `directMode:foot` for geometry the trip response
    // already carried on its foot leg, decoded it with a private copy of the
    // polyline decoder, and refitted the map inside the `.then` — racing the
    // synchronous `fitBounds` twenty lines below. Drawing what we already
    // have removes the query, the copy and the race together.
    const feet = (dep._allLegs || []).filter(l => l.mode === 'foot');
    let drew = false;
    feet.forEach(leg => {
      const wp = legShape(leg) || _legEnds(leg);
      if (wp.length < 2) return;
      drawWalk(_selLayer, wp);
      pts.push(...wp);
      drew = true;
    });
    // No foot leg in this response — an old cached board, or the minimal
    // retry that drops pointsOnLink from every leg. Say the walk exists
    // rather than leaving the pin unconnected.
    if (!drew && alightStop) {
      drawWalk(_selLayer, [[alightStop.lat, alightStop.lon], [destLL.lat, destLL.lon]]);
    }
  }

  // User position
  const userPos = userLL();
  if (userPos) {
    userDot(_selLayer, userPos, { radius: 6 });

    // The walk TO the stop — the half of the journey only the gangtid screen
    // used to draw, on a second map of its own. Without it this map showed
    // the ride and the walk at the far end, and left the reader to imagine
    // how they reached the platform.
    //
    // A straight dashed line, as gangtid drew it: the route from a position
    // to a platform is not in the trip response — we ask from a stop id on
    // purpose (v1.4.1) — so a drawn path here would be invented.
    const board = legs[0] && legs[0].stops && legs[0].stops[0];
    if (board && board.lat != null && board.lon != null) {
      drawWalk(_selLayer, [[userPos.lat, userPos.lon], [board.lat, board.lon]]);
      pts.push([userPos.lat, userPos.lon], [board.lat, board.lon]);
    }
  }

  // The final frame, which can be wider than the one measured against: the
  // walk from where you stand was not known when the beads were decided. The
  // beads stay as they were rather than being re-judged mid-render — a marker
  // that appears and disappears within one paint is worse than one drawn
  // against a frame a little tighter than the last.
  if (pts.length) _selMap.fitBounds(pts, { padding: [pad, pad], maxZoom: 15, animate: false });
  setTimeout(() => _selMap && _selMap.invalidateSize(), 100);

  bindMapExpand(_selMap, mapEl, document.getElementById('sel-map-expand'));
}

export function renderSelected() {
  const c = state.sel;
  if (!c) return;
  // This screen is about ONE departure, so the banner is too: its journey,
  // its line, and the stops it actually calls at. AFTER `c` is bound — put
  // above it, this read the departure from its temporal dead zone and threw
  // «Cannot access 'c' before initialization», which the render loop caught
  // and logged while the screen simply stayed blank.
  const dir = config.dirs[state.dIdx];
  const _meta = state.lockedJourneyMeta;
  renderAlertsInto(document.getElementById('s-alerts'), state.serviceAlerts, renderSelected, {
    journeyIds: [state.lockedJourneyId].filter(Boolean),
    lineIds: [c.serviceJourney && c.serviceJourney.line && c.serviceJourney.line.id].filter(Boolean),
    // The journey meta arrives 15 seconds later; the departure's own calls are
    // already in hand, so a stop-scoped message is placed correctly from the
    // first frame rather than folding away and then reappearing.
    stopIds: [
      ...((_meta && _meta.calls) || []).map(x => x && x.id),
      ...(((c.serviceJourney && c.serviceJourney.estimatedCalls) || [])
        .map(x => x && x.quay && x.quay.stopPlace && x.quay.stopPlace.id)),
      dir.stopId, dir.toStopId,
    ].filter(Boolean),
  });
  const now = Date.now();
  const ln = c.serviceJourney && c.serviceJourney.line;
  const lc = (ln && ln.publicCode) || config.line;
  const lbg = ln && ln.presentation && ln.presentation.colour ? '#' + ln.presentation.colour : '#7c2d12';
  // The same name the board row shows. This chip sits directly under the
  // line badge, so `frontText` put "3  Aker brygge" at the top of the detail
  // view too — the reported claim, one tap deeper.
  const dest = _rowDest(c).text;
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
  const ltCls = _ltCls(rcls);

  const walkActive = isWalkActive(dir);
  // Is it time to go? One question, three consequences — see walkFocus.
  const focus = walkActive && !departed && walkFocus(mtl);

  // The countdown the gangtid screen used to be.
  //
  // Seconds under a minute, because that is the stretch where a minute-
  // resolution number is a lie you act on. renderSelected already runs every
  // second (scheduler.js), so this needs no timer of its own — it needed a
  // screen, and that was the only reason gangtid was one.
  const secsToLeave = Math.floor((leaveByTs - now) / 1000);
  const hero = _hero(secsToLeave, depTs, now, rcls);
  const heroNum = hero.num, heroUnit = hero.unit, heroLbl = hero.lbl;
  // `_isTransfer` is already "there is more here than one train" — it is
  // `legs.length > 1 || lastAny.mode === 'foot'`. Requiring two TRANSIT legs
  // on top of that meant a single train plus a walk to your destination fell
  // through to the plain avgår/ankommer grid, which showed the post-walk
  // arrival time beside the alighting platform and never mentioned the walk.
  // So the one journey whose shape most needs explaining was the one journey
  // with no itinerary at all.
  const isTransfer = c._isTransfer && c._legs && c._legs.length >= 1;

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
        + '<div class="itin-row dep"><span>' + esc(fromName) + '</span><span class="itin-time dep">' + (depT ? clk(depT) : '—') + '</span></div>'
        + (platform ? '<div class="itin-meta">spor ' + esc(platform) + (frontText ? ' · retning ' + esc(frontText.toLowerCase()) : '') + '</div>' : '')
        + '<div class="itin-row' + (isLastLeg ? ' final' : '') + '"><span>' + esc(toName) + '</span><span class="itin-time' + (isLastLeg ? ' final' : '') + '">' + (arrT2 ? clk(arrT2) : '—') + '</span></div>'
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
    journeyDetail = '<div class="journey-detail">'
      + '<div class="jd-cell"' + (arrT ? '' : ' style="grid-column:1/-1"') + '>'
      + '<div class="jd-label">avgår ' + esc(cleanName(dir.from).toLowerCase()) + '</div>'
      + '<div class="jd-val departure">' + clkDay(c.expectedDepartureTime) + '</div>'
      + (delayed ? '<div class="jd-sub">rute ' + clk(c.aimedDepartureTime) + '</div>' : '')
      + '</div>'
      + (arrT
        ? '<div class="jd-cell">'
          + '<div class="jd-label">ankommer ' + esc(cleanName(dir.to).toLowerCase()) + '</div>'
          + '<div class="jd-val arrival">' + clkDay(arrT) + '</div>'
          + '<div class="jd-sub">'
          + (tmin ? tmin + ' min reise' : '')
          + (c._arrQuay ? (tmin ? ' · ' : '') + 'spor ' + esc(c._arrQuay) : '')
          + '</div>'
          + '</div>'
        : '')
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
    + '<span class="tc-dest">' + esc(dest) + '</span>'
    + (quay !== '?' ? '<span class="tc-meta">spor <span>' + quay + '</span>' + (delayed ? ' · <span style="color:#fcd34d">forsinket</span>' : '') + '</span>' : (delayed ? '<span class="tc-meta"><span style="color:#fcd34d">forsinket</span></span>' : ''))
    + '</div>'
    + '<div id="s-live-status"></div>'
    + '<div class="sel-route-ctx">' + esc(dir.from.toLowerCase()) + ' → ' + esc(dir.to.toLowerCase()) + '</div>'
    + '<div class="sel-weather" id="sel-weather-content">' + _selWeatherHtml(arrT) + '</div>'
    + (departed
      ? '<div class="departed-banner">avgikk ' + clk(depTs) + ' · reisen er i gang</div>'
      : walkActive
        ? '<div class="leaveby-hero' + (focus ? ' is-focus' : '') + '" aria-live="polite">'
          + '<div class="leaveby-label">' + heroLbl + '</div>'
          + '<div class="leaveby-time ' + ltCls + '">' + heroNum
          + '<span class="lt-unit">' + heroUnit + '</span></div>'
          + '<div class="leaveby-sub soft">' + _subLine(rcls, mtl, leaveByTs, depTs, now) + '</div>'
          + '</div>'
        : '')
    // Folded once it is time to go. The itinerary is what you read while
    // DECIDING; the countdown is what you read while walking, and on a phone
    // held at arm's length the two cannot both be first. <details> rather
    // than a toggle of our own: it opens on tap, it is reachable by keyboard,
    // and a screen reader announces it — none of which we would get for free.
    + (focus
      ? '<details class="itin-fold"><summary>reiseplan · ' + esc(dest) + '</summary>'
        + journeyDetail + '</details>'
      : journeyDetail);

  // Rebuild CTAs
  const existingCtas = document.getElementById('s-ctas');
  if (existingCtas) existingCtas.remove();
  const ctaDiv = document.createElement('div');
  ctaDiv.id = 's-ctas';

  // ── Forrige · reis · neste ────────────────────────────────────────────
  //
  // Asked for: «bruker burde kunne hoppe tilbake til forrige avgang eller
  // fremover til neste avgang», with «reis» at a third of its width and the
  // two steps on either side. Until now the only way was: back, find the row
  // again, tap it.
  //
  // The rows come from the board itself (boardRows), so a step lands on
  // exactly the row above or below the one you tapped — same mode filter, same
  // line filter, same order. The «neste» row this replaces read the raw
  // state.deps and could point at a departure the reader had filtered away.
  const rows = boardRows();
  const stepRow = document.createElement('div');
  stepRow.className = 'cta-row';

  const stepBtn = (dir, label) => {
    const b = document.createElement('button');
    const target = stepDep(rows, c, dir);
    b.className = 'cta-btn secondary cta-step';
    // The time, not just an arrow: you can see what you are stepping to and
    // whether it is worth it. At the end of the list the arrow stands alone —
    // an empty button would be impossible to read.
    b.textContent = target
      ? (dir < 0 ? '← ' + clk(new Date(target.expectedDepartureTime).getTime())
                 : clk(new Date(target.expectedDepartureTime).getTime()) + ' →')
      : (dir < 0 ? '←' : '→');
    b.disabled = !target;
    b.setAttribute('aria-label', target
      ? (dir < 0 ? 'Forrige avgang, ' : 'Neste avgang, ')
        + clk(new Date(target.expectedDepartureTime).getTime())
      : (dir < 0 ? 'Ingen tidligere avgang' : 'Ingen senere avgang'));
    if (target) b.onclick = () => window.tap(target);
    return b;
  };

  stepRow.appendChild(stepBtn(-1));

  const primaryBtn = document.createElement('button');
  primaryBtn.className = 'cta-btn cta-step';
  if (departed) {
    primaryBtn.textContent = 'andre avganger';
    primaryBtn.onclick = () => {
      stopSelRefresh();
      state.sel = null;
      show('v-board');
      startBoard();
    };
  } else {
    primaryBtn.textContent = 'reis →';
    primaryBtn.disabled = depTs < now - 120000;
    primaryBtn.onclick = () => window.doBoard && window.doBoard();
  }
  stepRow.appendChild(primaryBtn);
  // Both ways stay reachable even after the departure has gone: having just
  // missed one is exactly when the next one matters.
  stepRow.appendChild(stepBtn(1));
  ctaDiv.appendChild(stepRow);

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
    const alreadyInPlan = isLegInPlan(c.expectedDepartureTime, c.serviceJourney && c.serviceJourney.id);
    planBtn.className = 'cta-btn secondary';
    planBtn.textContent = alreadyInPlan ? '📋 i reiseplan' : '📋 legg til i reiseplan';
    if (!alreadyInPlan) {
      planBtn.onclick = () => {
        const leg = addLegToPlan(c, dir);
        updatePlanCtx();
        renderSelected();
        // THE SHEET OPENS HERE, while the tap is still fresh. `addLegToPlan`
        // and `renderSelected` are both synchronous — they write localStorage
        // and rebuild the DOM — so transient user activation survives them and
        // the browser still lets `navigator.share` open. An await in front of
        // this line would spend the activation and the sheet would be refused.
        //
        // `shareOnly` because this is offered UNASKED: on a desktop, where
        // there is no sheet, falling through to the download rung would drop a
        // file in Downloads every time a leg is added. The bell on the plan
        // card still offers that rung, because there the reader asked.
        if (leg && canShareCal()) shareLegCalendar(leg, { shareOnly: true });
      };
    } else {
      planBtn.style.opacity = '.6';
      planBtn.disabled = true;
    }
    ctaDiv.appendChild(planBtn);
  }

  document.getElementById('v-selected').appendChild(ctaDiv);
  _renderSelMap(state.sel, dir.from, dir.to);
}

/**
 * Is this a departure a tap could have opened?
 *
 * A cancelled row loses its onclick on the board (board.js), so it is not
 * something you can navigate to there — and the step buttons must not be able
 * to land on anything a tap on the list could not.
 */
function _navigable(c) {
  return !!c && !c.cancellation && !(c.serviceJourney && c.serviceJourney.cancellation);
}

/**
 * How a departure is recognised between two renders.
 *
 * `serviceJourney.id` first: it is stable across fetches and is already what
 * the detail screen locks onto (state.lockedJourneyId). NOT `_depKey`, which
 * embeds expectedDepartureTime and therefore moves the moment realtime does.
 *
 * The departure time is only a fallback, for the case the dedupe already
 * guards against — an answer with no service journey id.
 */
function _sameDep(a, b) {
  if (!a || !b) return false;
  // THROUGH normJid. The realtime stop board hands back a lowercase codespace
  // («rut:ServiceJourney:…») where the trip planner uses the NeTEx one
  // («RUT:…»), and stopBoardExtras (board.js:178) stores the RAW id on the
  // row — normJid is applied only to the dedupe set beside it. So the two
  // spellings of one departure really do reach this comparison, and it
  // answered no: both step buttons went dead on a row that came from the
  // other source.
  const ai = normJid((a.serviceJourney && a.serviceJourney.id) || '');
  const bi = normJid((b.serviceJourney && b.serviceJourney.id) || '');
  if (ai && bi) return ai === bi;
  return !!a.expectedDepartureTime && a.expectedDepartureTime === b.expectedDepartureTime;
}

/**
 * One step back or forward through the list the reader actually saw.
 *
 * Pure and exported, because «what is the next departure» had TWO answers on
 * this screen already and these buttons would have been the third. The board's
 * rows are now handed in; nothing here re-sorts, re-dedupes or re-filters.
 * Stepping forward lands on exactly the row under the one you tapped.
 *
 * Departures that have already gone are reachable going back — chosen: the
 * board keeps them, dimmed, and one that left two minutes ago may be delayed
 * and still at the platform, which is precisely when you want to look.
 *
 * Not finding `current` at all — you arrived from the saved plan, which builds
 * a synthetic departure — returns null both ways and the buttons are disabled.
 * The failure mode is today's screen, not a button that opens something you
 * never came from.
 *
 * @param {object[]} rows  the board's rows, in display order
 * @param {object} current the departure on screen
 * @param {number} dir     -1 back, +1 forward
 */
export function stepDep(rows, current, dir) {
  const list = rows || [];
  const at = list.findIndex(r => _sameDep(r, current));
  if (at < 0) return null;
  const step = dir < 0 ? -1 : 1;
  for (let i = at + step; i >= 0 && i < list.length; i += step) {
    if (_navigable(list[i])) return list[i];
  }
  return null;
}

/* renderSelDeps is gone.
   It was a one-way «neste» row at the foot of this screen, and it answered
   the same question the step buttons now answer — from a DIFFERENT list. It
   read `state.deps`, the raw answer, and re-sorted and re-deduped it by its
   own rule (one per departure minute, and a ninety-second gap). Measured:
   with buses switched off it pointed at a bus, and when the next departure
   was under ninety seconds away it showed nothing at all while the board had
   a row. Two «next»es that can disagree are worse than either alone.

   What is lost, and it is worth saying: the row carried a line badge, so you
   could see which line was next. A time on a third of a button cannot. The
   next row may well be another line. */

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
      if (normJid(curJid) !== normJid(jid)) return;

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
    const ltCls    = _ltCls(rcls);
    const now      = Date.now();
    const hero     = _hero(Math.floor((leaveByTs - now) / 1000), depTs, now, rcls);

    const lbEl = document.querySelector('.leaveby-time');
    if (lbEl) {
      lbEl.className = 'leaveby-time ' + ltCls;
      // Through _hero, not `clk(leaveByTs)`. This line used to replace the
      // countdown with a bare clock face the moment metadata arrived.
      lbEl.innerHTML = esc(String(hero.num))
        + '<span class="lt-unit">' + esc(hero.unit) + '</span>';
    }
    const lbSubEl = document.querySelector('.leaveby-sub');
    if (lbSubEl) {
      lbSubEl.innerHTML = _subLine(rcls, mtl, leaveByTs, depTs, now);
    }
  }
}

// Expose for nav bridges
window._renderSelected = renderSelected;
window._destroySelMap  = destroySelMap;
