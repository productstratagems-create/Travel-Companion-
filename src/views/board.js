import config from '../config.js';
import { enturFetch } from '../api/http.js';
import { saveBoardSnapshot, loadBoardSnapshot } from '../boardCache.js';
import { state, intervals } from '../state.js';
import { storage } from '../storage.js';
import { walkInfo, mToLeave, reachCls, findArr, isWalkActive, loadWalkFrom, haver, SPEED_MPN, loadWalkSpeed, loadWalkBuffer, normStopName, posAgeMins } from '../geo.js';
import { fetchBoard, fetchTrip, fetchTripPage, fetchBoardPage, stopBoardSummary, geocodePlace, _resetStopBoardCache } from '../api/entur.js';
import { setDot, logMsg } from '../ui/log.js';
import { adaptTripPattern, quayLatLon, legShape, _rowDest } from '../api/adapt.js';
import { loadPlan, legStatus } from '../api/plan.js';
import { renderAlerts, pruneHidden } from '../ui/alerts.js';
import { loadFavs } from '../ui/favs.js';
import { fmtMins, esc } from '../ui/fmt.js';
import L from 'leaflet';
import { fetchBysykkel } from '../api/bysykkel.js';
import { fetchScooters }    from '../api/scooters.js';
import { fetchNearbyStops, _resetNearbyCache } from '../api/stops.js';
import { makeStopIcon, makeVehicleIcon, makeRouteStopIcon, mapHalo, sideVehicleSvg, SIDE_VEHICLE_MAX_PX } from '../ui/mapIcons.js';
import { fetchVehiclePositions, livePosition, _resetVehicleCache } from '../api/vehicles.js';
import { fetchInflight } from '../api/entur.js';
import { createMap, drawRoute, drawWalk } from '../ui/map.js';
import { snapToCorridor } from '../ui/corridor.js';
import { _headingDeg, anchorDistances, pointAtDistance, projectOnPath } from '../ui/path.js';
import { decodePolyline } from '../ui/polyline.js';
import { tokens, alpha } from '../ui/themeTokens.js';
import { closeSpectatePanel } from './spectate.js';
import { isExample } from '../firstRun.js';
import { newRecord, stage, showRecord, takeLookbackLost } from '../api/diagnose.js';
import { BOARD_MODES, LOOKBACK_MINS, normJid } from '../api/queries.js';
import { takeDropReasons } from '../api/adapt.js';
import { loadReturn, returnWindow, loadSkip, dayKey } from '../api/returnTrip.js';

function pad(n) { return String(n).padStart(2, '0'); }
function clk(v) { const d = new Date(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

// Keyed by _depKey — stable across re-renders so a click fired on a DOM element
// from a previous render still resolves the correct departure.
const _depMap = new Map();

// ── Mode filter ──────────────────────────────────────────────────────────────
const MODES_KEY = 't.modes';
const DEFAULT_MODES = { metro: true, tram: true, bus: true, rail: true, sykkel: false };
function loadModes() {
  try { const v = storage.get(MODES_KEY); return v ? { ...DEFAULT_MODES, ...JSON.parse(v) } : { ...DEFAULT_MODES }; }
  catch { return { ...DEFAULT_MODES }; }
}
function saveModes(m) { storage.set(MODES_KEY, JSON.stringify(m)); }
/**
 * Departures the stop has and the trip planner did not offer.
 *
 * Reported four times, in different words, ending with: "slutt å filtrere
 * bort avganger fra et spor". The honest reading of the panel is that we were
 * never filtering — we were ASKING THE WRONG QUESTION. `numTripPatterns:12`
 * came back with 10, so OTP was not truncated by us; it simply does not offer
 * every departure as a journey. A train it judges dominated — one that leaves
 * sooner and arrives no earlier — is omitted, entirely legitimately, and no
 * amount of looking at our own filters was ever going to find it.
 *
 * The stop board is the other question: everything that leaves, full stop. We
 * already fetch it for the platform cross-check, so the departures are in
 * hand. This puts back the ones the journey search left out.
 *
 * Two guards, because adding rows is riskier than dropping them:
 *
 * - Only lines already in the results, and only running OUR WAY. Without the
 *   second we would add the same line going the OTHER way — the one mistake
 *   on this screen that actively sends someone backwards.
 * - No arrival time, and marked. We know when it leaves; we do NOT know when
 *   it reaches your destination, and inventing that number would be worse
 *   than the omission it fixes.
 *
 * WHICH WAY is asked structurally, of the journey's own onward calls, and not
 * of its front text. Reported: the departures go missing at Mortensrud — a
 * TERMINUS with two platforms serving the same direction — and are all there
 * one stop later. A front-text match is a fine proxy where a direction has
 * one platform, but a terminus is exactly where it stops being one: put a
 * short-turn on the second platform and every train on it carries a
 * destination that appears nowhere in the results, so a guard meant only to
 * exclude the opposite direction excluded a whole platform. Two vehicles
 * leaving the same stop and calling at any of the same stops afterwards are
 * going the same way; that is true of a short-turn and false of the return
 * working, which is the whole distinction the guard is for.
 */
/**
 * The stops a vehicle reaches AFTER it leaves here.
 *
 * Split on time rather than on the stop's name: the name would have to match
 * across two different API responses, and the departure time is already the
 * thing that says "this is the moment it leaves". Returns an empty set when
 * the journey carries no calls, so callers can fall back rather than treat
 * "we cannot tell" as "not our direction".
 */
export function _onwardStops(sj, fromMs) {
  const out = new Set();
  const calls = (sj && sj.estimatedCalls) || [];
  calls.forEach(c => {
    const t = new Date(c.expectedArrivalTime || c.aimedArrivalTime
      || c.expectedDepartureTime || c.aimedDepartureTime || NaN).getTime();
    const nm = c.quay && c.quay.stopPlace && c.quay.stopPlace.name;
    // Strictly after: the origin's own call is not somewhere it is going.
    if (nm && Number.isFinite(t) && Number.isFinite(fromMs) && t > fromMs) out.add(nm);
  });
  return out;
}

export function stopBoardExtras(adapted, calls, now) {
  const t0 = now == null ? Date.now() : now;
  const dirs = new Set();
  const lines = new Set();
  const ahead = new Set();
  const have = new Set();
  (adapted || []).forEach(c => {
    const leg = c._legs && c._legs[0];
    const fec = leg && leg.fromEstimatedCall;
    const ft = fec && fec.destinationDisplay && fec.destinationDisplay.frontText;
    const code = leg && leg.line && leg.line.publicCode;
    if (code) lines.add(code);
    if (ft && code) dirs.add(code + '|' + String(ft).trim().toLowerCase());
    const startMs = new Date((fec && (fec.expectedDepartureTime || fec.aimedDepartureTime))
      || (leg && (leg.expectedStartTime || leg.aimedStartTime)) || NaN).getTime();
    _onwardStops(leg && leg.serviceJourney, startMs).forEach(n => ahead.add(n));
    const id = c.serviceJourney && c.serviceJourney.id;
    if (id) have.add(normJid(id));
  });
  if (!dirs.size) return [];
  const out = [];
  (calls || []).forEach(c => {
    const sj = c.serviceJourney;
    const ln = sj && sj.line;
    const code = ln && ln.publicCode;
    const ft = c.destinationDisplay && c.destinationDisplay.frontText;
    if (!sj || !sj.id || !code || !ft) return;
    const depMs = new Date(c.expectedDepartureTime || c.aimedDepartureTime || NaN).getTime();
    // Same line, and demonstrably going our way. The front-text match stays
    // as one way of showing that — it is what every departure a terminus does
    // NOT complicate will match on — with the onward calls as the other.
    const sameFront = dirs.has(code + '|' + String(ft).trim().toLowerCase());
    const onward = _onwardStops(sj, depMs);
    const goesOurWay = sameFront
      || (lines.has(code) && [...onward].some(n => ahead.has(n)));
    if (!goesOurWay) return;
    if (have.has(normJid(sj.id))) return;
    const dep = c.expectedDepartureTime || c.aimedDepartureTime;
    const ms = depMs;
    // The board looks two minutes back on purpose; anything older than that
    // has gone, and putting it back is not a fix.
    if (!Number.isFinite(ms) || ms < t0 - 2 * 60000) return;
    out.push({
      expectedDepartureTime: dep,
      aimedDepartureTime: c.aimedDepartureTime || dep,
      realtime: !!c.realtime,
      cancellation: !!c.cancellation,
      destinationDisplay: { frontText: ft },
      quay: { publicCode: (c.quay && c.quay.publicCode) || '?' },
      serviceJourney: { id: sj.id, line: ln, estimatedCalls: sj.estimatedCalls || [] },
      _finalArrival: null,
      _fromStopBoard: true,
    });
  });
  return out;
}

/**
 * Which platform to put on the row.
 *
 * Reported: "du viser kun avganger fra ett av sporene (spor 2)". The board's
 * platform comes from the TRIP PLANNER's `fromEstimatedCall.quay`, which is
 * the planned platform. The stop's own board carries the one the stop is
 * actually announcing, and the realtime feed updates that one — so at a
 * terminus, where trains alternate between platforms, the two can disagree
 * and we were showing the wrong half of the answer.
 *
 * Matched per JOURNEY, not per tally: "we do not show platform 1" was a claim
 * about counts, and counts at a multimodal stop are mostly buses. "This train
 * leaves from 1, not 2" is a claim about a departure the reader can act on.
 *
 * The stop wins when the two differ, and the row says so — a platform that
 * changed silently is exactly how someone ends up on the wrong side of the
 * tracks. When the stop has nothing to say about this journey, nothing
 * changes.
 */
export function _rowQuay(c, byJourney) {
  const planned = (c && c.quay && c.quay.publicCode)
    || (c && c.quay && c.quay.name ? c.quay.name.replace(/^.*?\s/, '') : '?');
  const sjId = c && c.serviceJourney && c.serviceJourney.id;
  if (!sjId || !byJourney) return { quay: planned, changed: false };
  const actual = byJourney[normJid(sjId)];
  if (!actual || actual === '?' || actual === planned) return { quay: planned, changed: false };
  return { quay: actual, changed: planned !== '?' };
}

/**
 * What you board. Used for the icon, the row and the corridor's style — all
 * of which are about the vehicle you step onto, so the first leg is right.
 */
function _depMode(dep) {
  if (dep._legs && dep._legs[0]) return dep._legs[0].mode;
  const ln = dep.serviceJourney && dep.serviceJourney.line;
  return (ln && ln.transportMode) || 'metro';
}

/**
 * Every mode the journey uses.
 *
 * The mode pills filtered on _depMode — the FIRST leg — so a journey that is
 * metro then bus counted as metro and nothing else: switching Buss off left
 * all sixteen rows standing, and switching T-bane off removed every one of
 * them. The pills promised to filter by transport mode and actually filtered
 * by which mode you start with. On single-leg routes the two are the same,
 * which is why it went unnoticed.
 */
function _depModes(dep) {
  if (!dep) return [];
  if (Array.isArray(dep._legs) && dep._legs.length) {
    return [...new Set(dep._legs.map(l => l && l.mode).filter(Boolean))];
  }
  const m = _depMode(dep);
  return m ? [m] : [];
}

/**
 * Is this journey one you are willing to take?
 *
 * Every leg has to be a mode you left on — the pills mean "which transport am
 * I willing to use", the reading Ruter, Entur and Google Maps all share. The
 * alternative, "at least one leg", would leave the filter doing almost
 * nothing on exactly the journeys it matters for.
 */
export function _journeyModesAllowed(modes, activeModes) {
  const list = modes || [];
  if (!list.length) return true;
  return list.every(m => (activeModes || []).includes(m));
}

// ── Board map (single universal map for all modes) ──────────────────────────
let _bMap = null;
let _bLayer = null;
let _bUserMoved = false;
let _bFitted = false;
let _bDestLL = null;
let _bDestKey = null;
let _bMapKey = null;
let _bVehicleLayer = null;
let _bRouteLayer = null;
let _bFitRouteRequested = false;
// Identity of the journey currently drawn. The initial fit frames nearby
// stops, and a route fit was only ever requested when a line pill was tapped
// — so the route itself never framed the map. On a journey with a change that
// left the second leg drawn outside the viewport and clipped to nothing.
let _routeFitKey = null;
/**
 * Which lines are on. Empty means all of them.
 *
 * This was a single string, so the strip showed one line while the departure
 * list beneath it — which is filtered only by mode — showed every line that
 * takes you there. On a route served by four lines you saw a quarter of your
 * options, with nothing saying so. The strip contradicted the list it is a
 * picture of, which is the one thing the strip must never do.
 */
let _selectedLines = new Set();

/** Is this line drawn right now? An empty selection means all of them. */
function _lineOn(code) {
  return !_selectedLines.size || _selectedLines.has(code);
}

/**
 * Show one line, or show them all again.
 *
 * This was a switch-off model: everything on, tap to remove. On a route with
 * one or two lines that is the same thing as isolating. On the shared metro
 * trunk it is not — getting down to line 3 alone took four taps, and every
 * pill rendered as "on" at rest, so nothing suggested tapping did anything at
 * all.
 *
 * Tapping a line now shows only that line; tapping it again brings them all
 * back. Removing one line from a group of five is the rarer want, and it is
 * still reachable — isolate, then the strip and the list say what you have.
 *
 * An empty set keeps meaning ALL, which is what every reader of the filter
 * already assumes (`_lineOn`), so "none of them" stays unrepresentable
 * rather than being guarded against.
 */
export function _isolateLine(selected, code, allCodes) {
  const all = (allCodes || []).slice();
  if (!all.includes(code)) return new Set(selected);
  const cur = selected || new Set();
  // Already alone: the second tap is the way back.
  if (cur.size === 1 && cur.has(code)) return new Set();
  // One line on a one-line route is every line on it.
  return all.length === 1 ? new Set() : new Set([code]);
}
/**
 * The stop's own platform answers for the departures we are showing, keyed by
 * normalised journey id. Refreshed at most once a minute (see entur.js), and
 * read by `_rowQuay`.
 */
let _stopQuays = null;
/** The stop's own departures, and the trip planner's, kept apart so either
 *  arriving can rebuild the list without waiting for the other. */
let _stopCalls = null;
let _tripDeps = null;

/**
 * The list the board shows: what the journey search found, plus what the stop
 * has that it did not offer. Called from both sides, because the two answers
 * arrive independently and whichever is second must not be the only one used.
 */
function _applyDeps() {
  if (!_tripDeps) return;
  const extra = stopBoardExtras(_tripDeps, _stopCalls, Date.now());
  if (extra.length) logMsg('stopptavla hadde ' + extra.length + ' avgang(er) reisesøket ikke ga', 'ok');
  state.deps = extra.length ? _tripDeps.concat(extra) : _tripDeps;
}

let _bRoutePts = null;
let _bRouteSnapDist = null;
let _shapeLogKey = null;
let _bRoutePtsKey = null;
// Same identity trick as the primary corridor, for every other line drawn:
// an array rebuilt each tick would defeat the measurement cache behind it.
const _legPaths = new Map();
function _legPath(pts, key) {
  const k = key || JSON.stringify(pts);
  const hit = _legPaths.get(k);
  if (hit && hit.length === pts.length) return hit;
  if (_legPaths.size > 24) _legPaths.clear();
  _legPaths.set(k, pts);
  return pts;
}

function _destroyBoardMap() {
  if (_bMap) { _bMap.remove(); _bMap = null; _bLayer = null; }
  _bUserMoved = false;
  _bFitted = false;
  _bMapKey = null;
  _walkRouteKey = null;
  _bVehicleLayer = null;
  _bRouteLayer = null;
  _bFitRouteRequested = false;
  _bRoutePts = null;
  _bRouteSnapDist = null;
}

// Project p onto the segment a→b (equirectangular approximation, fine for
// the short stop-to-stop segments of a route corridor).
// Snap a position onto the selected line's route corridor when close enough
// to plausibly be on that road/track — gives the "Din posisjon" dot a
// realistic position on the line the user is looking for, instead of the
// raw (sometimes noisy) GPS fix sitting just off it.
function _snapToCorridor(pos) {
  return snapToCorridor(pos, _bRoutePts, _bRouteSnapDist);
}

function _makeBikeIcon(bikes, ebikes) {
  const color = bikes === 0 ? '#f87171' : bikes <= 2 ? '#fbbf24' : '#4ade80';
  const label = bikes + (ebikes ? '+' : '');
  // A real iconSize/iconAnchor: with [0,0] the marker had essentially no hit
  // area, so these were close to untappable on a phone.
  const html = '<div style="background:' + color + ';color:#111;border-radius:50%;width:28px;height:28px;'
    + 'display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;'
    + 'border:2px solid ' + tokens().mapInk + ';box-shadow:0 1px 4px rgba(0,0,0,.3)">' + label + '</div>';
  return L.divIcon({ className: '', html, iconSize: [28, 28], iconAnchor: [14, 14] });
}

function _makeStopIcon(mode, count, primary) { return makeStopIcon(mode, count, { primary }); }

function _makeDestIcon() {
  // Same treatment as every other marker: accent fill, the halo outline that
  // separates it from the basemap, and the eye punched in the halo colour
  // rather than the hardcoded goldenrod it used to carry. Trimmed from 22x30,
  // where it outweighed the vehicle it was meant to sit beside.
  const halo = mapHalo();
  const html = '<svg width="18" height="24" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M11 1.2C5.4 1.2 1.2 5.4 1.2 11c0 7.8 9.8 17.8 9.8 17.8S20.8 18.8 20.8 11C20.8 5.4 16.6 1.2 11 1.2z"'
    + ' fill="' + tokens().accent + '" stroke="' + halo + '" stroke-width="2"/>'
    + '<circle cx="11" cy="11" r="4" fill="' + halo + '"/>'
    + '</svg>';
  return L.divIcon({ className: '', html, iconSize: [18, 24], iconAnchor: [9, 24] });
}

const VENDOR_COLORS = { Bolt: '#22c55e', Voi: '#f87171', Tier: '#60a5fa' };
function _makeScooterIcon(operator, battery) {
  const vc = VENDOR_COLORS[operator] || '#94a3b8';
  const label = battery != null ? battery + '%' : '?';
  const html = '<div style="background:' + alpha('bgRgb', .9) + ';border:2px solid ' + vc + ';border-radius:4px;'
    + 'width:44px;height:20px;display:flex;align-items:center;justify-content:center;'
    + 'font-size:10px;font-weight:700;white-space:nowrap;'
    + 'box-shadow:0 1px 4px rgba(0,0,0,.4);color:' + vc + '">⚡' + label + '</div>';
  return L.divIcon({ className: '', html, iconSize: [44, 20], iconAnchor: [22, 10] });
}

function _ensureMap(pos) {
  const mapEl = document.getElementById('board-map');
  if (!mapEl || _bMap) return _bMap;

  _bMap = createMap(mapEl, { scale: true });
  _bMap.on('dragstart', () => { _bUserMoved = true; });
  _bLayer = L.layerGroup().addTo(_bMap);
  const c = pos || { lat: 59.9139, lon: 10.7522 };
  _bMap.setView([c.lat, c.lon], 14);
  setTimeout(() => _bMap && _bMap.invalidateSize(), 100);
  const expandBtn = document.getElementById('board-map-expand');
  if (expandBtn) {
    expandBtn.onclick = () => {
      const exp = mapEl.classList.toggle('expanded');
      // An expanded map does not fit a fixed screen, and reshaping it to fit
      // would change the map. The board yields instead: while it is open the
      // page scrolls exactly as it did before the fixed layout existed.
      document.documentElement.classList.toggle('map-open', exp);
      expandBtn.textContent = exp ? '✕' : '⤢';
      expandBtn.setAttribute('aria-label', exp ? 'Minimer kart' : 'Utvid kart');
      expandBtn.title = exp ? 'Minimer kart' : 'Utvid kart';
      setTimeout(() => _bMap && _bMap.invalidateSize(), 320);
    };
  }
  return _bMap;
}

function renderBoardMap(pos, modes) {
  if (!_ensureMap(pos)) return;

  // Only re-fetch and redraw when something meaningful changes.
  // The 2-minute time bucket ensures bikes/scooters still refresh periodically.
  const dir = config.dirs[state.dIdx];
  const destName = dir.to || '';
  const mapKey = [
    pos ? pos.lat.toFixed(3) + ',' + pos.lon.toFixed(3) : '',
    Object.keys(modes).filter(k => modes[k]).sort().join(','),
    destName,
    Math.floor(Date.now() / 120000),
  ].join('|');
  if (mapKey === _bMapKey) return;
  _bMapKey = mapKey;

  const fetchPos = pos || { lat: 59.9139, lon: 10.7522 };
  const transitModes = ['metro', 'tram', 'bus'].filter(m => modes[m]);
  // Only fetch stops near the user — destination-side stops add clutter without
  // helping the user decide which departure to board.
  const p1 = transitModes.length ? fetchNearbyStops(fetchPos.lat, fetchPos.lon) : Promise.resolve([]);
  const p2 = modes.sykkel ? fetchBysykkel(fetchPos.lat, fetchPos.lon) : Promise.resolve([]);
  const p3 = modes.sykkel ? fetchScooters(fetchPos.lat, fetchPos.lon) : Promise.resolve([]);

  // Destination coords — reset cache on direction change
  if (destName !== _bDestKey) {
    _bDestLL = null; _bDestKey = destName; _bFitted = false; _bUserMoved = false;
    _walkRouteKey = null;
  }
  let p4;
  if (dir._toLat && dir._toLon) {
    p4 = Promise.resolve({ lat: dir._toLat, lon: dir._toLon });
  } else if (_bDestLL) {
    p4 = Promise.resolve(_bDestLL);
  } else if (destName) {
    p4 = geocodePlace(destName).then(r => {
      if (!r.length) return null;
      _bDestLL = { lat: r[0].lat, lon: r[0].lon };
      return _bDestLL;
    }).catch(() => null);
  } else {
    p4 = Promise.resolve(null);
  }

  Promise.allSettled([p1, p2, p3, p4]).then(([r1, r2, r3, r4]) => {
    if (!_bLayer) return;
    _bLayer.clearLayers();
    const pts = [];

    // User position — anchor for the whole map
    if (pos) {
      const snapped = _snapToCorridor(pos) || pos;
      L.circleMarker([snapped.lat, snapped.lon], {
        radius: 7, color: tokens().mapInk, fillColor: tokens().mapYou,
        fillOpacity: 1, weight: 2.5,
      })
        .bindTooltip('Din posisjon', { className: 'map-label', direction: 'bottom', offset: [0, 6] })
        .addTo(_bLayer);
      pts.push([snapped.lat, snapped.lon]);
    }

    // Nearby stops: cluster tightly, show only the closest stop per mode,
    // label on tap (not permanent) to keep the map readable.
    if (r1.status === 'fulfilled' && r1.value.length) {
      const modeSet = new Set(transitModes);
      const stops = r1.value.filter(s => modeSet.has(s.mode));

      // Cluster stops within 80 m
      const used = new Set();
      const clusters = [];
      stops.forEach((s, i) => {
        if (used.has(i)) return;
        used.add(i);
        const cluster = [s];
        stops.forEach((t, j) => {
          if (used.has(j) || t.mode !== s.mode) return;
          if (haver(s.lat, s.lon, t.lat, t.lon) < 80) { cluster.push(t); used.add(j); }
        });
        clusters.push(cluster);
      });

      // Keep only the 2 nearest clusters per mode to limit marker density
      const perMode = {};
      clusters.forEach(cl => {
        const mode = cl[0].mode;
        if (!perMode[mode]) perMode[mode] = [];
        if (perMode[mode].length < 2) perMode[mode].push(cl);
      });

      Object.values(perMode).flat().forEach(cluster => {
        const lat = cluster.reduce((a, c) => a + c.lat, 0) / cluster.length;
        const lon = cluster.reduce((a, c) => a + c.lon, 0) / cluster.length;
        const name = cluster.slice().sort((a, b) => a.name.length - b.name.length)[0].name;
        const mode = cluster[0].mode;
        pts.push([lat, lon]);
        // Permanent label only for the single closest stop of the primary mode;
        // everything else reveals its name on tap.
        const isPrimary = transitModes[0] === mode && clusters.indexOf(cluster) === 0;
        L.marker([lat, lon], { icon: _makeStopIcon(mode, cluster.length, isPrimary) })
          .bindTooltip(name, {
            permanent: false,
            direction: 'top',
            offset: [0, -15],
            className: 'map-label',
          })
          .addTo(_bLayer);
      });
    }

    // Bikes: label on tap only — count in icon is enough at a glance
    if (r2.status === 'fulfilled') {
      r2.value.forEach(s => {
        pts.push([s.lat, s.lon]);
        L.marker([s.lat, s.lon], { icon: _makeBikeIcon(s.bikes, s.ebikes) })
          .bindTooltip(s.name, { className: 'map-label', direction: 'top', offset: [0, -18] })
          .addTo(_bLayer);
      });
    }

    // Scooters: minimal marker only, battery on tap
    if (r3.status === 'fulfilled') {
      r3.value.forEach(v => {
        pts.push([v.lat, v.lon]);
        L.marker([v.lat, v.lon], { icon: _makeScooterIcon(v.operator, v.battery) })
          .bindTooltip((v.operator || '') + (v.battery != null ? ' · ' + v.battery + '%' : ''), { className: 'map-label' })
          .addTo(_bLayer);
      });
    }

    // Destination pin — subtle, no permanent label (destination is shown in header)
    if (r4.status === 'fulfilled' && r4.value) {
      const { lat, lon } = r4.value;
      pts.push([lat, lon]);
      L.marker([lat, lon], { icon: _makeDestIcon() })
        .bindTooltip(destName, { className: 'map-label', direction: 'top', offset: [0, -32] })
        .addTo(_bLayer);
    }

    if (pts.length > 0 && !_bFitted && !_bUserMoved) {
      if (pts.length === 1) _bMap.setView(pts[0], 15);
      else _bMap.fitBounds(pts, { padding: [36, 36], maxZoom: 16 });
      _bFitted = true;
    }
    setTimeout(() => _bMap && _bMap.invalidateSize(), 60);
  });
}

let _walkRouteKey = null;

// Google polyline decoder — OTP3 returns pointsOnLink.points in this format

function _drawWalkRoute(fromLL, toLL, destName) {
  if (!_ensureMap(fromLL)) return;
  const key = fromLL.lat + ',' + fromLL.lon + '→' + toLL.lat + ',' + toLL.lon;
  if (_walkRouteKey === key) return;
  _walkRouteKey = key;

  if (_bLayer) _bLayer.clearLayers();

  L.circleMarker([fromLL.lat, fromLL.lon], {
    radius: 8, color: tokens().accent, fillColor: tokens().accent, fillOpacity: 0.9, weight: 2,
  }).bindTooltip('Avreisested', { className: 'map-label' }).addTo(_bLayer);

  L.marker([toLL.lat, toLL.lon], { icon: _makeDestIcon() })
    .bindTooltip(destName, { permanent: false, direction: 'top', offset: [0, -32], className: 'map-label' })
    .addTo(_bLayer);

  if (!_bUserMoved) {
    _bMap.fitBounds([[fromLL.lat, fromLL.lon], [toLL.lat, toLL.lon]], { padding: [44, 44], maxZoom: 17 });
    _bFitted = true;
  }

  // Foot route from Entur OTP3 — uses Norwegian OSM pedestrian data, same API already in use
  const q = '{trip(from:{coordinates:{latitude:' + fromLL.lat + ',longitude:' + fromLL.lon + '}}'
    + 'to:{coordinates:{latitude:' + toLL.lat + ',longitude:' + toLL.lon + '}}'
    + 'modes:{directMode:foot}numTripPatterns:1){tripPatterns{legs{pointsOnLink{points}}}}}';
  enturFetch(config.api.journeyPlanner, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(data => {
      if (!_bLayer) return;
      const pats = data.data && data.data.trip && data.data.trip.tripPatterns;
      const pts = pats && pats[0] && pats[0].legs && pats[0].legs[0] &&
                  pats[0].legs[0].pointsOnLink && pats[0].legs[0].pointsOnLink.points;
      if (!pts) throw new Error('no points');
      const latlngs = decodePolyline(pts);
      drawWalk(_bLayer, latlngs);
      if (!_bUserMoved) _bMap.fitBounds(latlngs, { padding: [44, 44], maxZoom: 17 });
    })
    .catch(() => {
      if (!_bLayer) return;
      drawWalk(_bLayer, [[fromLL.lat, fromLL.lon], [toLL.lat, toLL.lon]]);
    });
}

let _modeFilterKey = '';

function renderModeFilter() {
  const el = document.getElementById('mode-filter');
  if (!el) return;
  const modes = loadModes();
  const pills = [
    { key: 'metro', label: 'T-bane' },
    { key: 'tram',  label: 'Trikk' },
    { key: 'bus',   label: 'Buss' },
    { key: 'rail',  label: 'Tog' },
    { key: 'sykkel', label: 'Sykkel' },
  ];
  // Rebuilding via innerHTML every render tick can detach a pill mid-tap and
  // swallow the click — only rebuild when the active set actually changes
  const key = pills.map(p => p.key + ':' + (modes[p.key] ? 1 : 0)).join(',');
  if (key === _modeFilterKey) return;
  _modeFilterKey = key;

  el.innerHTML = pills.map(p => '<button class="mode-pill' + (modes[p.key] ? ' active' : '') + '" data-mode="' + p.key + '">'
    + p.label + '</button>').join('');
  el.querySelectorAll('.mode-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = loadModes();
      m[btn.dataset.mode] = !m[btn.dataset.mode];
      saveModes(m);
      _modeFilterKey = '';
      renderBoard();
    });
  });
}

// ── Line filter (vehicle position markers) ──────────────────────────────────
let _lineFilterKey = '';

function renderLineFilter(visibleDeps) {
  const el = document.getElementById('line-filter');
  if (!el) return;

  // Deduped {code, color} list, in departure order — first occurrence wins for color
  const lines = [];
  const seen = new Set();
  visibleDeps.forEach(({ c }) => {
    const ln = c.serviceJourney && c.serviceJourney.line;
    const code = (ln && ln.publicCode) || null;
    if (!code || seen.has(code)) return;
    seen.add(code);
    const color = ln.presentation && ln.presentation.colour ? '#' + ln.presentation.colour : '#7c2d12';
    lines.push({ code, color });
  });

  if (!lines.length) {
    el.innerHTML = '';
    _lineFilterKey = '';
    _selectedLines = new Set();
    return;
  }

  // Drop selections that no longer exist on this route — otherwise switching
  // route leaves a filter referring to lines that are not there, and the
  // strip goes quietly empty.
  const codes = lines.map(l => l.code);
  const stale = [..._selectedLines].filter(c => !codes.includes(c));
  if (stale.length) stale.forEach(c => _selectedLines.delete(c));

  const key = lines.map(l => l.code + ':' + l.color).join(',')
    + '|' + [..._selectedLines].sort().join(',');
  if (key === _lineFilterKey) return;
  _lineFilterKey = key;

  // Three states, not two. Drawing "all on" as every pill active left no
  // difference between "no filter" and "everything picked", and nothing to
  // suggest a pill was worth tapping. At rest they are simply themselves;
  // once one is isolated it is marked and the others recede.
  const filtered = _selectedLines.size > 0;
  el.innerHTML = lines.map(l =>
    '<button class="line-pill'
    + (filtered ? (_lineOn(l.code) ? ' active' : ' muted') : '')
    + '" data-line="' + esc(l.code) + '"'
    + ' aria-pressed="' + (filtered && _lineOn(l.code) ? 'true' : 'false') + '"'
    + ' aria-label="' + (filtered && _lineOn(l.code)
      ? 'Vis alle linjer igjen' : 'Vis bare linje ' + esc(l.code)) + '">'
    + '<span class="line-badge" style="background:' + l.color + '">' + esc(l.code) + '</span>'
    + '</button>'
  ).join('');
  el.querySelectorAll('.line-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      _selectedLines = _isolateLine(_selectedLines, btn.dataset.line, lines.map(l => l.code));
      _lineFilterKey = '';
      _bFitRouteRequested = true;
      renderBoard();
    });
  });
}

// Heading lives in ui/path.js now, beside the tangent maths that needs it.
// Re-exported so the callers here — and the tests — keep one import.
export { _headingDeg };

// ── Vehicle position interpolation ──────────────────────────────────────────
function _callTime(call, arrival) {
  if (arrival) return call.expectedArrivalTime || call.aimedArrivalTime || call.expectedDepartureTime || call.aimedDepartureTime;
  return call.expectedDepartureTime || call.aimedDepartureTime || call.expectedArrivalTime || call.aimedArrivalTime;
}

/**
 * Where the vehicle is, in stops.
 *
 * The reason this exists: at the board map's scale a vehicle marker moves
 * about a third of a pixel per second, and Leaflet rounds transforms to whole
 * pixels — so a correct, updating position still reads as frozen. Stops are a
 * unit that changes visibly, and they mean the same thing whether the
 * underlying position was measured or estimated.
 *
 * @returns {{idx:number, label:string}|null}
 */
export function _stopsAway(calls, now) {
  if (!calls || calls.length < 2) return null;
  const named = calls.map(call => ({
    name: (call.quay && call.quay.stopPlace && call.quay.stopPlace.name) || null,
    arr: _callTime(call, true),
    dep: _callTime(call, false),
  })).filter(c => c.arr && c.dep);
  if (named.length < 2) return null;

  const t = (v) => new Date(v).getTime();
  if (now <= t(named[0].dep)) {
    return { idx: 0, label: named[0].name ? 'står på ' + named[0].name : 'ikke avgått' };
  }
  for (let i = 0; i < named.length; i++) {
    // Standing at a stop.
    if (now >= t(named[i].arr) && now <= t(named[i].dep) && named[i].name) {
      return { idx: i, label: 'ved ' + named[i].name };
    }
    // Between this stop and the next.
    if (i < named.length - 1 && now > t(named[i].dep) && now < t(named[i + 1].arr)) {
      return { idx: i, label: named[i + 1].name ? 'neste stopp ' + named[i + 1].name : 'underveis' };
    }
  }
  return null;
}

function _callPoints(calls) {
  if (!calls || !calls.length) return null;
  const pts = calls.map(call => {
    const ll = quayLatLon(call.quay);
    if (!ll) return null;
    const arr = _callTime(call, true);
    const dep = _callTime(call, false);
    if (!arr || !dep) return null;
    return { lat: ll.lat, lon: ll.lon, arr: new Date(arr).getTime(), dep: new Date(dep).getTime() };
  }).filter(Boolean);
  return pts.length >= 2 ? pts : null;
}

export function _interpolateVehiclePos(calls, now) {
  const pts = _callPoints(calls);
  if (!pts) return null;
  if (now <= pts[0].dep) {            // parked at origin terminus
    return { lat: pts[0].lat, lon: pts[0].lon,
             heading: _headingDeg(pts[0].lat, pts[0].lon, pts[1].lat, pts[1].lon) };
  }
  if (now > pts[pts.length - 1].arr) return null;   // run finished
  for (let i = 0; i < pts.length - 1; i++) {
    const cur = pts[i], next = pts[i + 1];
    if (now >= cur.dep && now <= next.arr) {
      const span = next.arr - cur.dep;
      const frac = span > 0 ? Math.min(1, Math.max(0, (now - cur.dep) / span)) : 0;
      return { lat: cur.lat + (next.lat - cur.lat) * frac,
               lon: cur.lon + (next.lon - cur.lon) * frac,
               heading: _headingDeg(cur.lat, cur.lon, next.lat, next.lon) };
    }
    if (now >= next.arr && now <= next.dep) {   // standing at a stop
      const after = pts[i + 2];
      return { lat: next.lat, lon: next.lon,
               heading: after ? _headingDeg(next.lat, next.lon, after.lat, after.lon)
                              : _headingDeg(cur.lat, cur.lon, next.lat, next.lon) };
    }
  }
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  return { lat: last.lat, lon: last.lon,
           heading: _headingDeg(prev.lat, prev.lon, last.lat, last.lon) };
}

/**
 * The same position, but measured along the line that is actually drawn.
 *
 * `_interpolateVehiclePos` slides between platform COORDINATES, so on a curve
 * the marker cuts the corner and floats beside its own track — by the arc's
 * sagitta, which on a metro alignment is hundreds of metres. Here each stop is
 * placed once along the drawn path, the DISTANCE between two stops is
 * interpolated with exactly the same time fractions, and the coordinate is
 * read back off the path. Timing semantics are untouched; only the mapping
 * from time to point changes.
 *
 * Distance rather than a perpendicular snap of the chord point, deliberately:
 * a snap cuts corners too, and on a hairpin it lands on the returning limb and
 * runs the train backwards.
 *
 * Falls back to `_interpolateVehiclePos` — identically, not approximately —
 * whenever the path cannot carry the answer: no path, an uncovered stop, or
 * anchors that do not advance. That fallback is what makes this safe for a
 * board with no geometry at all.
 */
export function _interpolateOnPath(calls, now, path) {
  const pts = _callPoints(calls);
  if (!pts || !path || path.length < 2) return _interpolateVehiclePos(calls, now);
  const d = anchorDistances(path, pts);
  if (!d) return _interpolateVehiclePos(calls, now);
  const at = (metres, fallbackFn) => {
    const p = pointAtDistance(path, metres);
    return p ? { lat: p.lat, lon: p.lon, heading: p.heading } : fallbackFn();
  };
  const bail = () => _interpolateVehiclePos(calls, now);

  if (now <= pts[0].dep) return d[0] == null ? bail() : at(d[0], bail);
  if (now > pts[pts.length - 1].arr) return null;
  for (let i = 0; i < pts.length - 1; i++) {
    const cur = pts[i], next = pts[i + 1];
    if (now >= cur.dep && now <= next.arr) {
      if (d[i] == null || d[i + 1] == null) return bail();
      const span = next.arr - cur.dep;
      const frac = span > 0 ? Math.min(1, Math.max(0, (now - cur.dep) / span)) : 0;
      return at(d[i] + (d[i + 1] - d[i]) * frac, bail);
    }
    if (now >= next.arr && now <= next.dep) {
      return d[i + 1] == null ? bail() : at(d[i + 1], bail);
    }
  }
  const lastD = d[d.length - 1];
  return lastD == null ? bail() : at(lastD, bail);
}

// ── Line route corridor ──────────────────────────────────────────────────────
// Trains and trams run on dedicated tracks the basemap doesn't draw, so for
// the selected line we sketch its stop-to-stop corridor. Buses already follow
// visible roads, so their corridor is drawn lighter — a subtle "which road"
// hint rather than the primary cue.

// How long a tapped stop's name tooltip stays visible — long enough to read
// on a phone, short enough not to clutter a corridor with many stops.
const _ROUTE_STOP_TOOLTIP_MS = 3000;


/**
 * Is there room to draw a marker at every stop?
 *
 * The gate is the median gap rather than the smallest: one pair of unusually
 * close stops should not blank a corridor that is otherwise perfectly
 * legible. ROUTE_STOP_MIN_GAP_PX is three times the 7px marker, so beads
 * never touch.
 */
export const ROUTE_STOP_MIN_GAP_PX = 21;

export function _stopsReadable(points, minGap) {
  const pts = points || [];
  if (pts.length < 3) return true;      // ends only; nothing to crowd
  const gaps = [];
  for (let i = 1; i < pts.length; i++) {
    gaps.push(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return median >= (minGap == null ? ROUTE_STOP_MIN_GAP_PX : minGap);
}

/**
 * What makes two drawn corridors the same corridor.
 *
 * The stops you ride between, in order — by id where the response carries
 * one, by name otherwise, by coordinate as a last resort. Not the geometry:
 * five metro lines through one tunnel return five encoded polylines that
 * decode to five nearly-identical point arrays, and comparing those found no
 * duplicates at all.
 */
export function _corridorKey(stops) {
  return (stops || [])
    .map(st => st.id || st.name || (st.lat + ',' + st.lon))
    .join('>');
}

/**
 * The stop chain of ONE transit leg, clipped to that leg's own ends.
 *
 * The board map used to build its whole corridor from the departure's
 * serviceJourney — which adaptTripPattern sets to the FIRST leg. On a journey
 * with a change that meant the corridor stopped at the interchange, and
 * findStopIdx then failed to find the real destination among leg one's stops
 * and fell back to the nearest point, landing there too. Mortensrud →
 * Frognerseteren drew as far as the change and no further.
 *
 * Clipping per leg on its own fromPlace/toPlace is the rule selected.js has
 * always used for the same job.
 */
/** A foot leg's two ends, for when the response carried no geometry for it. */
function _legEnds(leg) {
  const a = leg && leg.fromPlace, b = leg && leg.toPlace;
  if (!a || !b || a.latitude == null || b.latitude == null) return [];
  return [[a.latitude, a.longitude], [b.latitude, b.longitude]];
}

export function _legCorridorStops(leg, dirFallback) {
  const sjc = leg && leg.serviceJourney && leg.serviceJourney.estimatedCalls;
  if (!Array.isArray(sjc) || sjc.length < 2) return [];
  const stops = [];
  sjc.forEach(call => {
    const sp = call.quay && call.quay.stopPlace;
    const ll = quayLatLon(call.quay);
    if (!ll) return;
    const last = stops[stops.length - 1];
    if (last && last.lat === ll.lat && last.lon === ll.lon) return;
    stops.push({ lat: ll.lat, lon: ll.lon, name: (sp && sp.name) || '',
      id: (sp && sp.id) || '' });
  });
  if (stops.length < 2) return [];
  const norm = (x) => String(x || '').toLowerCase().replace(/\s+t$/i, '').trim();
  const idxOf = (name, lat, lon) => {
    if (name) {
      const n = norm(name);
      const i = stops.findIndex(st => norm(st.name) === n
        || norm(st.name).includes(n) || n.includes(norm(st.name)));
      if (i !== -1) return i;
    }
    if (lat != null && lon != null) {
      let best = -1, bestD = Infinity;
      stops.forEach((st, i) => {
        const d = haver(st.lat, st.lon, lat, lon);
        if (d < bestD) { bestD = d; best = i; }
      });
      return best;
    }
    return -1;
  };
  const d = dirFallback || {};
  const fp = leg.fromPlace || {}, tp = leg.toPlace || {};
  let a = idxOf(fp.name || d.from, fp.latitude != null ? fp.latitude : d._fromLat,
                fp.longitude != null ? fp.longitude : d._fromLon);
  let b = idxOf(tp.name || d.to, tp.latitude != null ? tp.latitude : d._toLat,
                tp.longitude != null ? tp.longitude : d._toLon);
  if (a === -1) a = 0;
  if (b === -1) b = stops.length - 1;
  return stops.slice(Math.min(a, b), Math.max(a, b) + 1);
}

/**
 * Draws the corridors, and reports the line each vehicle should ride.
 *
 * @returns {Map<string, {path: Array, snapDist: number}>} keyed by line code.
 *   Vehicles are placed on THEIR OWN line's path — with several lines
 *   selected (v1.29.0), snapping everything to the primary would move line
 *   2's trains onto line 3's track, which is a worse error than the one being
 *   fixed here.
 */
function renderLineRoute(visibleDeps, vehicles) {
  const paths = new Map();
  if (!_bMap) return paths;
  // One usable departure per selected line, soonest first. The first is the
  // primary: it owns the snap corridor, the walk extension and the fit, all
  // of which are one-per-board by nature. The rest are drawn as corridors
  // only, so where lines share track they lie on top of each other and where
  // they part you can see it.
  const perLine = new Map();
  visibleDeps.forEach(({ c }) => {
    const ln = c.serviceJourney && c.serviceJourney.line;
    const sjc = c.serviceJourney && c.serviceJourney.estimatedCalls;
    if (!ln || !sjc || sjc.length < 2) return;
    if (!_lineOn(ln.publicCode) || perLine.has(ln.publicCode)) return;
    perLine.set(ln.publicCode, { c });
  });
  const match = perLine.values().next().value || null;

  if (!_bRouteLayer) _bRouteLayer = L.layerGroup().addTo(_bMap);

  if (!match) {
    _bRouteLayer.clearLayers();
    _bRoutePts = null;
    return paths;
  }

  const { c } = match;
  const dir = config.dirs[state.dIdx];
  const allPts = [];
  const allStops = [];
  c.serviceJourney.estimatedCalls.forEach(call => {
    const sp = call.quay && call.quay.stopPlace;
    const ll = quayLatLon(call.quay);
    if (!ll) return;
    const last = allPts[allPts.length - 1];
    if (last && last[0] === ll.lat && last[1] === ll.lon) return;
    allPts.push([ll.lat, ll.lon]);
    allStops.push({ lat: ll.lat, lon: ll.lon, name: (sp && sp.name) || '',
      id: (sp && sp.id) || '' });
  });
  if (allPts.length < 2) {
    _bRouteLayer.clearLayers();
    _bRoutePts = null;
    return paths;
  }

  // Clip corridor to boarding→alighting segment only.
  // Board: stop whose name matches dir.from, or closest stop to departure coords.
  // Alight: stop whose name matches dir.to, or closest stop to destination coords.
  function findStopIdx(name, fallbackLat, fallbackLon) {
    if (name) {
      const norm = s => s.toLowerCase().replace(/\s+t$/i, '').trim();
      const n = norm(name);
      const idx = allStops.findIndex(s => norm(s.name) === n || norm(s.name).includes(n) || n.includes(norm(s.name)));
      if (idx !== -1) return idx;
    }
    if (fallbackLat != null && fallbackLon != null) {
      let best = -1, bestDist = Infinity;
      allStops.forEach((s, i) => {
        const d = haver(s.lat, s.lon, fallbackLat, fallbackLon);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      return best;
    }
    return -1;
  }

  let boardIdx = findStopIdx(dir.from, dir._fromLat, dir._fromLon);
  // Ask for the stop OTP says you alight at, not for the place you are
  // heading to. With a venue destination those are different, and matching on
  // "Aker brygge, Oslo" against the stop names of a metro line is a loose
  // substring search for a name that is not among them — it can land on a
  // stop nobody meant before the coordinate fallback below ever runs.
  let alightIdx = findStopIdx(c._alightName || dir.to, dir._toLat, dir._toLon);

  // If destination is a venue (not a stop), find the stop nearest to it for alighting.
  const destIsVenue = dir._toLat && dir._toLon && !dir.toStopId;
  if (destIsVenue && alightIdx === -1) {
    let best = -1, bestDist = Infinity;
    allStops.forEach((s, i) => {
      const d = haver(s.lat, s.lon, dir._toLat, dir._toLon);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    alightIdx = best;
  }

  // Fall back to full corridor if we can't locate either end.
  if (boardIdx === -1) boardIdx = 0;
  if (alightIdx === -1) alightIdx = allPts.length - 1;
  let lo = Math.min(boardIdx, alightIdx);
  const hi = Math.max(boardIdx, alightIdx);

  lo = _widenLo(allStops, lo, vehicles);

  const stops = allStops.slice(lo, hi + 1);
  // The corridor is already clipped to boarding→alighting, which is exactly
  // the span a leg's own geometry covers — so the real alignment drops
  // straight in. No geometry (an old cached board, the no-destination path,
  // or an API that does not return it) falls back to the stop chain.
  const shape = legShape(c._legs && c._legs[0]);
  // pointsOnLink covers the ridden leg only, so where the corridor has been
  // widened behind your stop there is no alignment to follow. Straight behind
  // you, true ahead of you — the honest split, rather than pretending either
  // half is the other.
  const behind = lo < boardIdx ? allPts.slice(lo, boardIdx) : [];
  const ahead = shape || allPts.slice(Math.min(boardIdx, lo), hi + 1);
  const pts = behind.length ? behind.concat(ahead) : ahead;
  // Whether Entur actually returns pointsOnLink cannot be checked from the
  // sandbox this was written in, so one real trip settles it — same trick as
  // the live-vehicle coverage line in v1.11.0.
  if (shape && _shapeLogKey !== c.expectedDepartureTime) {
    _shapeLogKey = c.expectedDepartureTime;
    logMsg('sportrasé: ' + shape.length + ' punkter (' + (hi - lo + 1) + ' stopp)', 'ok');
  }

  if (pts.length < 1) {
    _bRouteLayer.clearLayers();
    _bRoutePts = null;
    return paths;
  }

  const ln = c.serviceJourney.line;
  const color = ln.presentation && ln.presentation.colour ? '#' + ln.presentation.colour : '#7c2d12';
  const isBus = _depMode(c) === 'bus';
  const style = _corridorStyle(_depMode(c), color);

  // The array's identity has to survive a tick, or the path measurement
  // memoised in ui/path.js misses every second and we pay a full sweep of a
  // few thousand points per line per second. Rebuild only when the corridor
  // actually changed.
  const ptsKey = lo + '|' + hi + '|' + (shape ? shape.length : 0) + '|'
    + (c.serviceJourney.id || '') + '|' + pts.length;
  if (ptsKey !== _bRoutePtsKey) { _bRoutePtsKey = ptsKey; _bRoutePts = pts; }

  _bRouteSnapDist = isBus ? 25 : 50;
  paths.set(ln.publicCode, { path: _bRoutePts, snapDist: _bRouteSnapDist });

  _bRouteLayer.clearLayers();

  // The corridor is drawn straight from `pts`.
  //
  // Buses used to stitch together CAR routes between each pair of stops to
  // guess the road the bus takes — a guess, and fetched on every render tick
  // with no guard, so the layer was cleared at the top of each tick and
  // redrawn whenever the response landed. Measured on a bus route with
  // realistic latency: the corridor was in the DOM for 3 of 15 samples, and
  // it cost one POST per tick with a sub-query per stop pair.
  //
  // The leg's own pointsOnLink is the bus's actual service path, it is
  // already in `pts` via legShape, and it arrives with the board query we
  // make anyway. The guess is replaced by the answer, and the storm goes
  // with it.
  if (_bRoutePts.length >= 2) L.polyline(_bRoutePts, style).addTo(_bRouteLayer);

  // Every other leg of the journey — changes and walks alike.
  //
  // The corridor above is built from the departure's serviceJourney, which
  // adaptTripPattern sets to leg one, so leg one keeps everything that is
  // one-per-board: the snap corridor, the widening, the fit. Only the drawing
  // goes multi-leg.
  //
  // It iterates `_allLegs`, not `_legs`. `_legs` has had the foot legs
  // filtered out (adapt.js:94) and every map in the app read it, so a
  // bus → 3 min on foot → tram journey drew as two disconnected corridors
  // with a hole in the middle, and the walk to your actual destination was
  // drawn by a SEPARATE query that then got wiped (see below). `legShape`
  // never looked at `leg.mode` — the geometry was always usable.
  const restPts = [];
  const primary = (c._legs || [])[0];
  ((c._allLegs || c._legs || [])).forEach(leg => {
    // Leg one owns the corridor drawn above, with all its clipping and
    // widening; drawing it twice would double its weight.
    if (leg === primary) return;
    if (leg.mode === 'foot') {
      // Its own alignment when the response carried one, the chord between
      // its ends otherwise — the retry path asks with `minimal:true`, which
      // drops pointsOnLink from every leg, so this is a real branch.
      const wp = legShape(leg) || _legEnds(leg);
      if (wp.length < 2) return;
      drawWalk(_bRouteLayer, wp);
      restPts.push(...wp);
      return;
    }
    const legStops = _legCorridorStops(leg, dir);
    const legShapePts = legShape(leg);
    const lp = legShapePts || legStops.map(st => [st.lat, st.lon]);
    if (lp.length < 2) return;
    const ll = leg.serviceJourney && leg.serviceJourney.line;
    const lc = ll && ll.presentation && ll.presentation.colour
      ? '#' + ll.presentation.colour : color;
    L.polyline(lp, _corridorStyle(leg.mode, lc)).addTo(_bRouteLayer);
    // First one wins, so a later leg on the same line never displaces the
    // primary corridor the board is actually about.
    if (ll && ll.publicCode && !paths.has(ll.publicCode)) {
      paths.set(ll.publicCode, { path: _legPath(lp, 'leg|' + (leg.serviceJourney && leg.serviceJourney.id)),
        snapDist: leg.mode === 'bus' ? 25 : 50 });
    }
    restPts.push(...lp);
  });

  // Every other selected line, as a corridor only — each piece of track drawn
  // ONCE.
  //
  // The dedupe used to compare `JSON.stringify` of the point arrays, and
  // could never match: the primary's array has the widened prefix glued on
  // and the others' does not, and each line's own `pointsOnLink` decodes to
  // its own rounding anyway. So on the shared tunnel five lines stacked five
  // identical orange strokes into one fat band — the reported symptom.
  //
  // Compare the STOPS instead. Two lines calling at the same stops in the
  // same order between your boarding and your alighting are on the same
  // track; that is what "same corridor" means, and stop ids are the most
  // stable part of the response. Where a line genuinely diverges the
  // sequence differs and it still gets its own stroke.
  //
  // The failure mode is the safe one: if the sequences disagree when they
  // should not, we draw two strokes — today's behaviour, nothing worse.
  const ridden = allStops.slice(Math.min(boardIdx, hi), hi + 1);
  const primaryEntry = paths.get(ln.publicCode);
  const drawn = new Map([[_corridorKey(ridden), primaryEntry]]);
  [...perLine.values()].slice(1).forEach(({ c: oc }) => {
    const ocLeg = (oc._legs && oc._legs[0]) || null;
    const ocStops = _legCorridorStops(ocLeg, dir);
    // Their own alignment too, where it exists. These were drawn from stop
    // chords alone, so a secondary line's corridor cut every curve the
    // primary one follows — and its trains had nothing true to sit on.
    const ocPts = legShape(ocLeg) || ocStops.map(st => [st.lat, st.lon]);
    if (ocPts.length < 2) return;
    const ol = oc.serviceJourney.line;
    const key = _corridorKey(ocStops);
    const shared = drawn.get(key);
    if (shared) {
      // Same track: nothing new to draw, and its trains ride the stroke that
      // is already there. That is a correction in itself — they used to ride
      // their own slightly differently decoded copy of the same rail, so two
      // trains on one track could drift apart on screen.
      if (ol && ol.publicCode && !paths.has(ol.publicCode)) paths.set(ol.publicCode, shared);
      return;
    }
    const ocColor = ol.presentation && ol.presentation.colour ? '#' + ol.presentation.colour : color;
    // Its own mode, not the primary line's. Spreading `style` here meant the
    // bus corridor was drawn solid and 4px whenever a metro line happened to
    // have the soonest departure — the same bus, two thicknesses, depending
    // on what else was selected.
    L.polyline(ocPts, _corridorStyle(_depMode(oc), ocColor)).addTo(_bRouteLayer);
    const entry = { path: _legPath(ocPts, key),
      snapDist: _depMode(oc) === 'bus' ? 25 : 50 };
    drawn.set(key, entry);
    if (ol && ol.publicCode && !paths.has(ol.publicCode)) paths.set(ol.publicCode, entry);
  });

  // Intermediate stops are hidden until there is room to read them.
  //
  // Deliberately measured rather than keyed to a zoom number: the default
  // zoom comes from fitBounds, so a three-stop route fits at high zoom and a
  // fixed threshold would show its beads immediately — defeating the point.
  // Same reasoning as the strip's clustering: separation in pixels, on the
  // screen the reader actually has.
  const showIntermediate = _stopsReadable(stops.map(st => _bMap.latLngToContainerPoint([st.lat, st.lon])));
  stops.forEach((s, i) => {
    if (!s.name) return;
    // Start and stop are never hidden — they are what the corridor is for.
    const isEnd = i === 0 || i === stops.length - 1;
    if (!isEnd && !showIntermediate) return;
    const marker = L.marker([s.lat, s.lon], { icon: makeRouteStopIcon(color) }).addTo(_bRouteLayer);
    // Every stop names itself on tap, endpoints included. The endpoints used
    // to be shown with _bMap.addLayer(tooltip), which displays a tooltip
    // whatever its permanent flag says — and it attached them to the map
    // rather than to the layer that is cleared each render, so they piled up:
    // eight labels for two stop names, in twelve overlapping pairs.
    const tooltip = L.tooltip({
      className: 'map-label',
      permanent: false,
      direction: 'top',
      offset: [0, -8],
    }).setLatLng([s.lat, s.lon]).setContent(esc(s.name));
    let hideTimer = null;
    marker.on('click', () => {
      if (hideTimer) clearTimeout(hideTimer);
      _bMap.openTooltip(tooltip);
      hideTimer = setTimeout(() => _bMap.closeTooltip(tooltip), _ROUTE_STOP_TOOLTIP_MS);
    });
  });

  // The destination pin.
  //
  // What used to be here: a `directMode:foot` query for a walking route we
  // already had, drawn on the `.then`. It was never visible. `renderLineRoute`
  // clears its layer on every render — once a second — while a cache key
  // stopped the block re-running, so the line and this pin were wiped on the
  // next tick and never redrawn. Measured on a fixture: zero walk lines on
  // screen at 1.2 s and at 6.2 s, with the query fired and answered.
  //
  // Drawing from the itinerary's own foot leg fixes that by construction: it
  // is synchronous, so it survives the clear like everything else, and its
  // points can go into the fit below instead of arriving after the map has
  // already been framed.
  if (destIsVenue && dir._toLat && dir._toLon) {
    L.marker([dir._toLat, dir._toLon], { icon: _makeDestIcon() })
      .bindTooltip(dir.to || 'Destinasjon', { permanent: false, direction: 'top', offset: [0, -32], className: 'map-label' })
      .addTo(_bRouteLayer);
    // No foot leg in this response — an old cached board, or the minimal
    // retry. Say the walk exists rather than leaving the pin unconnected.
    const walked = (c._allLegs || []).some(l => l.mode === 'foot');
    if (!walked && alightIdx !== -1) {
      drawWalk(_bRouteLayer, [allPts[alightIdx], [dir._toLat, dir._toLon]]);
    }
  }

  // The whole journey, changes included — not just the leg you board.
  const fitPts = [...pts, ...restPts];
  // Frame it when the journey itself changes, not only when a pill is tapped.
  const fitKey = fitPts.length
    ? fitPts.length + ':' + fitPts[0].join(',') + ':' + fitPts[fitPts.length - 1].join(',')
    : null;
  if (fitKey && fitKey !== _routeFitKey) {
    _routeFitKey = fitKey;
    _bFitRouteRequested = true;
  }
  if (destIsVenue && dir._toLat && dir._toLon) fitPts.push([dir._toLat, dir._toLon]);

  if (_bFitRouteRequested && !_bUserMoved) {
    _bMap.fitBounds(fitPts.length >= 2 ? fitPts : pts, { padding: [40, 40], maxZoom: 15 });
  }
  _bFitRouteRequested = false;
  return paths;
}

// Live positions for the selected line, refreshed on their own cadence. The
// render loop runs at 1 Hz; fetching from inside it would turn every second
// into a request against a shared public API.
let _livePos = new Map();
let _liveLine = null;
let _liveReqAt = 0;
const _LIVE_POLL_MS = 10_000;

function _refreshLivePositions(lineRef) {
  if (!lineRef) return;
  const now = Date.now();
  if (lineRef === _liveLine && now - _liveReqAt < _LIVE_POLL_MS) return;
  if (lineRef !== _liveLine) _livePos = new Map();   // never show one line's trains on another
  _liveLine = lineRef;
  _liveReqAt = now;
  fetchVehiclePositions(lineRef).then(m => {
    if (_liveLine !== lineRef) return;               // line changed while in flight
    _livePos = m;
    // Coverage varies by operator and cannot be checked from a dev machine,
    // so let one real trip answer it.
    logMsg('sanntidsposisjoner: ' + m.size + ' for ' + lineRef, m.size ? 'ok' : null);
  });
}

// ── Corridor strip ──────────────────────────────────────────────────────────
// A schematic of your stretch, under the map. Position on the board map is
// measured to move about a third of a pixel per second, which no one can read
// — so the question "which departure should I take" gets answered here
// instead, in stops rather than metres.
//
// Trains approaching carry the same countdown as their row in the list, so the
// strip and the list are visibly the same objects. Trains already ahead of you
// are context: they say whether the next one runs into a gap or into the back
// of another.

// How much room the approaching trains get, in stop-widths, behind the origin.
const _STRIP_LOOKBACK = 4;

// Widest a train glyph gets, plus breathing room. Two glyphs closer than this
// would touch, so they collapse into one.
// The widest silhouette, plus room for a "+N" when a cluster is stacked.
// This feeds the clustering threshold, so it has to track the glyph: too
// small and they overlap instead of stacking.
const _STRIP_GLYPH_PX = SIDE_VEHICLE_MAX_PX + 16;

// Where your stop sits across the rail, and where a departed train settles in
// the room kept to its right.
const _STRIP_ORIGIN = 0.86;
const _STRIP_INSET = 0.045;   // so the furthest glyph does not poke off the left
const _STRIP_GONE_AT = 0.5;

// The countdown a train shows on the strip must be the one its row shows in
// the list, or the two pictures disagree and the strip is worse than nothing.
// Same source and same rounding as the row render below.
function _rowMins(c, fallbackIso, now) {
  const iso = c.expectedDepartureTime || c.aimedDepartureTime || fallbackIso;
  if (!iso) return null;
  const diffSec = Math.floor((new Date(iso).getTime() - now) / 1000);
  return Math.floor(Math.max(0, diffSec) / 60);
}

/**
 * How long ago a departure went, in whole minutes — null if it has not.
 *
 * The board now asks for a two-minute lookback, so a train whose time has
 * passed stays on screen instead of vanishing at the next poll. _rowMins
 * clamps at zero, which read as "NÅ" — fine when such a row lasted seconds,
 * and a plain lie once it persists for two minutes.
 *
 * Kept separate from _rowMins rather than folded in as a sign: zero would
 * then mean both "due now" and "gone thirty seconds ago", which are the two
 * things a person on a platform most needs told apart.
 */
function _agoMins(c, fallbackIso, now) {
  const iso = c.expectedDepartureTime || c.aimedDepartureTime || fallbackIso;
  if (!iso) return null;
  const agoSec = Math.floor((now - new Date(iso).getTime()) / 1000);
  return agoSec < 0 ? null : Math.floor(agoSec / 60);
}

// Which cluster is currently opened up, by its lead train. Held across
// renders, because the strip redraws every second and a tap must survive that.
let _expandedCluster = null;
let _stripTouched = false;
// Journeys whose departure slide has already played.
const _departedSeen = new Set();
let _flashJid = null;
let _flashUntil = 0;
let _stripBound = false;

/**
 * Where the list has to scroll to centre one row.
 *
 * Measured against the list itself rather than via row.offsetTop, which is
 * relative to the nearest POSITIONED ancestor. #dep-list is position:static,
 * so offsetParent was BODY and every target was off by the distance from the
 * top of the page down to the list — 418px on a phone, measured.
 *
 * Deliberately geometric rather than adding #dep-list{position:relative}:
 * that would work, but it would leave correctness depending on a CSS rule
 * nothing points at, which is the coupling that caused this.
 *
 * Pure, so the arithmetic is testable without standing up a strip.
 */
export function _scrollRowIntoList(listRect, rowRect, scrollTop, clientH, scrollH) {
  const offsetInList = rowRect.top - listRect.top + scrollTop;
  const target = offsetInList - (clientH - rowRect.height) / 2;
  const max = Math.max(0, (scrollH || 0) - (clientH || 0));
  return Math.max(0, Math.min(max, target));
}

/**
 * Clusters are controls, not decoration.
 *
 * Coming towards you, a cluster's trains all have rows below with platform,
 * arrival and occupancy — so tapping jumps to the first of them rather than
 * repeating a worse copy in a bubble. Ahead of you those trains appear
 * nowhere else, so tapping opens the cluster in place.
 */
function _bindStrip(el) {
  if (_stripBound) return;
  _stripBound = true;
  const act = (target) => {
    const g = target.closest && target.closest('.ls-train');
    if (!g || !g.dataset.jid) return;

    // A cluster opens, whichever half it is in. Jumping to the lead train's
    // row instead — which this used to do on the approaching side — surfaced
    // the one departure that was already visible and left the ones the
    // cluster was hiding exactly as hidden.
    if (g.dataset.count && Number(g.dataset.count) > 1) {
      _stripTouched = true;
      _expandedCluster = _expandedCluster === g.dataset.jid ? null : g.dataset.jid;
      renderBoard();
      return;
    }
    // No glyph closes its group. Every single train is a departure, and
    // tapping a departure jumps to its row — without exception.
    //
    // This branch first closed the group for ANY member, so no member ever
    // scrolled. v1.34.0 narrowed it to the lead, which was still wrong in the
    // way that mattered most: the lead of the open cluster is the NEXT
    // departure, so the one glyph a reader reaches for first was the one that
    // refused to move the list.
    //
    // Nothing anyone needs is lost. Tapping a different collapsed cluster
    // still moves the focus there, and one group open is the resting state
    // the strip was designed around — "none open" was never worth a tap.

    // A single train stands for one departure, so its row is unambiguous.
    const jid = g.dataset.jid;
    const sel = '#dep-list .dep-row[data-jid="'
      + (window.CSS && CSS.escape ? CSS.escape(jid) : jid) + '"]';
    if (!document.querySelector(sel)) return;

    // The list is rebuilt every second, so a class set on the node here is
    // gone on the next tick and the timeout ends up clearing a detached
    // element. Hold it in state and let the row render re-apply it instead.
    _flashJid = jid;
    _flashUntil = Date.now() + 1600;
    renderBoard();

    // Scroll the list itself, never scrollIntoView. That scrolls every
    // scrollable ancestor, and on a fixed board the ancestors are only hidden,
    // not unscrollable — so it slid the header off a screen the reader had no
    // way to scroll back. It also ran before the rebuild below, which then
    // restored the old position, so the jump did nothing at all here.
    const list = document.getElementById('dep-list');
    const row = list && list.querySelector('.dep-row[data-jid="'
      + (window.CSS && CSS.escape ? CSS.escape(jid) : jid) + '"]');
    if (!list || !row) return;
    list.scrollTop = _scrollRowIntoList(list.getBoundingClientRect(), row.getBoundingClientRect(),
      list.scrollTop, list.clientHeight, list.scrollHeight);
  };
  el.addEventListener('click', e => act(e.target));
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e.target); }
  });
}

let _inflight = [];
let _atStop = new Map();
let _inflightAt = 0;
let _inflightKey = null;
const _INFLIGHT_POLL_MS = 30_000;

function _refreshInflight(dir) {
  const stopId = dir && dir.stopId;
  if (!stopId) return;
  const key = stopId + '|' + (dir.to || '');
  const now = Date.now();
  if (key === _inflightKey && now - _inflightAt < _INFLIGHT_POLL_MS) return;
  if (key !== _inflightKey) { _inflight = []; _atStop = new Map(); }
  _inflightKey = key;
  _inflightAt = now;
  fetchInflight(stopId).then(calls => {
    if (_inflightKey !== key) return;
    _inflight = calls;
    // Same payload, second use: these calls are the ones at YOUR stop, so
    // they carry whether each train has actually arrived and actually left.
    _atStop = new Map();
    calls.forEach(c => {
      const jid = c.serviceJourney && c.serviceJourney.id;
      if (jid) _atStop.set(jid, c);
    });
  });
}

/**
 * Everything to draw on the strip, as fractional stop indices on a shared
 * scale where the origin is 0 and the destination is legIndices.to - from.
 */
export function _buildStrip(candidates, dir, lineOn, now, livePos) {
  // Accepts a predicate, a Set, or a single code — several lines can be on at
  // once now, and the strip must show every line the list shows.
  const on = typeof lineOn === 'function' ? lineOn
    : lineOn && typeof lineOn.has === 'function' ? (c) => !lineOn.size || lineOn.has(c)
    : (c) => c === lineOn;
  const out = { trains: [], from: dir && dir.from };
  const seen = new Set();

  candidates.forEach(c => {
    const sj = c.serviceJourney;
    const ln = sj && sj.line;
    if (!ln || !on(ln.publicCode)) return;
    const jid = sj.id;
    if (jid && seen.has(jid)) return;
    if (jid) seen.add(jid);

    // Same source and rounding as the row beneath, or the strip contradicts
    // the list it sits on top of.
    const calls = sj.estimatedCalls;
    const mins = _rowMins(c, Array.isArray(calls) && calls.length ? _callTime(calls[0], false) : null, now);
    if (mins == null) return;

    const iso = c.expectedDepartureTime || c.aimedDepartureTime;
    const ago = _agoMins(c, Array.isArray(calls) && calls.length ? _callTime(calls[0], false) : null, now);
    out.trains.push({
      id: jid || 'a' + out.trains.length,
      mins,
      ago,
      departed: ago !== null,
      live: !!livePosition(livePos, jid, now),
      line: ln.publicCode,
      // With several lines interleaved on one time axis a glyph has to say
      // which line it is. Same source as the badge in the list and the pill
      // above, so the three never disagree.
      colour: (ln.presentation && ln.presentation.colour) ? '#' + ln.presentation.colour : null,
      // Which silhouette the strip draws. The line's own mode, not the
      // board's filter: a tram and a metro on one axis should not be the
      // same shape just because both are switched on.
      mode: ln.transportMode || 'metro',
      label: (c.destinationDisplay && c.destinationDisplay.frontText) || '',
    });
  });

  // One axis, running from the furthest departure at -1 to your stop at 0.
  const maxMins = Math.max(1, ...out.trains.map(t => t.mins));
  // Past its time, a train sits beyond your stop rather than crushed against
  // it. Before this, a "nå" glyph landed at the very edge of the rail and hung
  // 8px over it.
  //
  // The board now keeps departures for a couple of minutes rather than
  // dropping them at the next poll, so there can be more than one of these at
  // once. They still share one position, and cluster into a single glyph with
  // a +N badge — because there is no room to do otherwise. The axis is not
  // linear across the rail: the half left of your stop maps ~0.82 of the
  // width onto one axis unit, the strip right of it ~0.19 onto the same unit,
  // so a separation that looks generous in axis units is about 6px there
  // against a glyph that was 46px wide then and is 38px now. Spreading them produced overlapping glyphs, and an
  // overlapping glyph swallows the taps of the one beneath it.
  out.trains.forEach(t => { t.pos = t.departed ? _STRIP_GONE_AT : -(t.mins / maxMins); });
  // Most recently gone first, so it leads its cluster: of the trains that have
  // left, the one that just left is the only one still worth a second look.
  out.trains.sort((a, b) => a.pos - b.pos || (a.ago - b.ago));
  return out;
}

/**
 * What the strip says, in words.
 *
 * The container is role="img" with a fixed label, which told a screen-reader
 * user that a picture of trains existed and nothing else. Kept pure so the
 * Norwegian agreement is tested rather than buried in markup.
 */
/**
 * Is this train standing at your platform right now?
 *
 * Three-valued on purpose. `null` means nobody knows, and the caller must say
 * nothing — the board already prints "NÅ" at zero minutes, which means *due
 * now*, not *here now*. Turning that into "står på perrongen" without evidence
 * would be exactly the false confidence this app keeps removing.
 *
 * @param {object} call   the call at YOUR stop, from the isolated query
 * @param {object|null} live  a measured position for this journey, if any
 * @param {{lat:number,lon:number}|null} stopLL  your stop's coordinates
 * @returns {'at'|'gone'|null}
 */
export const _PLATFORM_RADIUS_M = 60;

export function _platformState(call, live, stopLL) {
  if (!call) return null;

  // Authoritative: the operator says it arrived, and has not said it left.
  if (call.actualDepartureTime) return 'gone';
  if (call.actualArrivalTime) return 'at';

  // Measured position, second best. A stop coordinate is a centroid and a
  // metro platform is long, so this is deliberately generous — and it can
  // only ever say "at", never "gone", because a vehicle far from the stop
  // might not have reached it yet.
  if (live && stopLL && live.lat != null && stopLL.lat != null) {
    if (haver(live.lat, live.lon, stopLL.lat, stopLL.lon) <= _PLATFORM_RADIUS_M) return 'at';
  }

  return null;
}

/**
 * Collapse trains that would otherwise be drawn on top of each other.
 *
 * Greedy in the order given, anchored on the first member of each cluster —
 * so the caller decides which end is the one worth keeping legible. For
 * approaching trains that is the soonest, because its countdown is the useful
 * one; the rest become "and this many behind it".
 *
 * @param {Array<{pos:number}>} trains  in the caller's preferred order
 * @param {number} minSep  closest two anchors may sit, in strip units
 * @returns {Array<{pos:number, items:Array}>}
 */
/**
 * How much of the strip's width the approaching half gets.
 *
 * The strip used to run one linear scale across [lookback, lastStop], so space
 * was handed out by *stop count* — which has nothing to do with where the
 * trains are. On a fifteen-stop stretch that gave the approaching half 23% of
 * the width to hold nine trains, while the half ahead took 77% to hold one.
 *
 * Each half now asks for what it needs: room for its trains, and in the half
 * ahead, enough that its stop ticks stay apart. Bounded at both ends so one
 * empty half can never collapse the other.
 *
 * @returns {number} 0..1
 */
export const _STRIP_MIN_SHARE = 0.28;
export const _STRIP_MAX_SHARE = 0.58;
const _STRIP_TICK_PX = 9;

/**
 * Lay an opened cluster's members out so they can be told apart.
 *
 * Members are within one glyph of each other by definition — that is why they
 * were clustered — so drawing them at their true positions would just stack
 * them again. They are spread to a full separation apart, centred on where
 * the cluster sat, so the group stays where the eye last saw it.
 *
 * @returns {Array<{pos:number, item:object}>} in the order given
 */
export function _spreadCluster(items, minSep) {
  const n = items.length;
  if (!n) return [];
  if (n === 1) return [{ pos: items[0].pos, item: items[0] }];
  // Laid out in axis order, not the order the caller happened to pass. The
  // clustering above is anchored soonest-first on purpose; spreading with that
  // same order put the soonest departure to the LEFT of a later one, which is
  // backwards on an axis where time decreases towards your stop.
  const byPos = items.slice().sort((a, b) => a.pos - b.pos);
  const mid = byPos.reduce((a, t) => a + t.pos, 0) / n;
  const start = mid - (minSep * (n - 1)) / 2;
  return byPos.map((item, i) => ({ pos: start + i * minSep, item }));
}

/**
 * Push apart anything still too close after a cluster has been opened.
 *
 * Opening a cluster widens it, which shoves it into its neighbours. That is
 * not only untidy: an overlapping glyph sits on top of the one beneath and
 * swallows its taps, so a train next to an opened cluster becomes unclickable.
 *
 * Sweeps left to right enforcing the separation, then slides the whole run
 * back if it has spilled past the end of the half.
 *
 * @returns {Array} the same objects, repositioned, sorted by position
 */
export function _relaxPositions(groups, minSep, min, max) {
  const s = groups.slice().sort((a, b) => a.pos - b.pos);
  for (let i = 1; i < s.length; i++) {
    if (s[i].pos - s[i - 1].pos < minSep) s[i].pos = s[i - 1].pos + minSep;
  }
  const over = s.length ? s[s.length - 1].pos - max : 0;
  if (over > 0) {
    // Only as far as the start of the half allows; a squeeze beats a spill.
    const room = Math.min(over, s[0].pos - min);
    if (room > 0) s.forEach(g => { g.pos -= room; });
  }
  return s;
}

export function _clusterTrains(trains, minSep) {
  const out = [];
  (trains || []).forEach(t => {
    const last = out[out.length - 1];
    if (last && Math.abs(t.pos - last.pos) < minSep) { last.items.push(t); return; }
    out.push({ pos: t.pos, items: [t] });
  });
  return out;
}

export function _stripSummary(data) {
  if (!data || !data.trains || !data.trains.length) return 'Ingen avganger på linja nå';
  // 'tog' is invariant in Norwegian — no plural branch to get wrong.
  const soonest = Math.min(...data.trains.map(t => t.mins));
  return data.trains.length + ' tog på vei til ' + (data.from || 'stoppet ditt')
    + ', neste om ' + soonest + ' min';
}

function renderLineStrip(visibleDeps) {
  const el = document.getElementById('line-strip');
  if (!el) return;
  const dir = config.dirs[state.dIdx];
  // Hidden is not empty: leaving the old glyphs in the DOM means they are one
  // style change away from reappearing, and anything inspecting the strip
  // still finds departures that are no longer on the board.
  const blank = () => { el.style.display = 'none'; el.innerHTML = ''; };
  if (!dir) { blank(); return; }
  _refreshInflight(dir);

  const data = _buildStrip(visibleDeps.map(d => d.c), dir, _lineOn, Date.now(), _livePos);
  if (!data.trains.length) { blank(); return; }

  // Displayed before measuring: a hidden element has no width, and the
  // clustering threshold is derived from it.
  el.style.display = 'block';
  const width = el.clientWidth || 360;

  // One axis: -1 is the furthest departure, 0 is your stop. Your stop sits at
  // 86% rather than the right edge, leaving room to its right for a train
  // whose time has come — and an inset on the left so the furthest glyph is
  // not half off the rail either.
  const pct = (p) => 100 * (p <= 0
    ? _STRIP_INSET + (1 + p) * (_STRIP_ORIGIN - _STRIP_INSET)
    : _STRIP_ORIGIN + p * (1 - _STRIP_ORIGIN - _STRIP_INSET));
  const sep = _STRIP_GLYPH_PX / width;

  // Same tiebreak as _buildStrip: departed trains all share mins 0, and the
  // one that just left must lead its cluster rather than whichever happened
  // to be first in the response.
  const sorted = data.trains.slice().sort((a, b) => a.mins - b.mins || (a.ago - b.ago));
  const clusters = _clusterTrains(sorted, sep);

  // The soonest group is open unless the reader has chosen otherwise. Its lead
  // changes as departures go, so this is recomputed rather than latched.
  //
  // Skip the departed: they carry mins 0, so once the board started keeping a
  // couple of minutes of them they sorted to the front and became the default
  // focus — the strip opened up, by itself, on the trains you have already
  // missed. They also have the least room on the rail, so spreading them
  // overlapped the glyphs by 19px and swallowed each other's taps.
  const openId = _stripTouched
    ? _expandedCluster
    : (clusters.find(cl => cl.items.length > 1 && !cl.items[0].departed) || {}).items?.[0]?.id || null;

  // Relax in percent, not in axis units. The axis is not linear across your
  // stop — the half left of it maps ~0.82 of the width onto one axis unit,
  // the strip right of it ~0.19 onto the same unit — so one separation
  // expressed in axis units is four times tighter on the right than on the
  // left, and glyphs there still touched after relaxing. Percent is the space
  // the overlap actually happens in.
  const sepPct = 100 * _STRIP_GLYPH_PX / width;
  const groups = _relaxPositions(
    clusters
      .flatMap(cl => (cl.items.length > 1 && cl.items[0].id === openId)
        ? _spreadCluster(cl.items, sep).map(t => ({ pos: t.pos, items: [t.item], group: openId }))
        : [cl])
      .map(g => ({ ...g, pos: pct(g.pos) })),
    sepPct, pct(-1), pct(_STRIP_GONE_AT));

  // Relaxing can only slide the run back if the left end has slack, and on a
  // full strip it has none — so the rightmost glyph ends up hanging over the
  // rail. Keep every glyph's box inside the container as a last step; a
  // slightly tighter gap at the right end beats one that pokes out.
  const half = sepPct / 2;
  groups.forEach(g => { g.pos = Math.max(half, Math.min(100 - half, g.pos)); });

  const trains = groups.map(cl => {
    const n = cl.items.length;
    const lead = cl.items[0];
    // How deep the stack looks: the peripheral cue that more lie behind.
    const depth = n > 2 ? ' ls-stack2' : n > 1 ? ' ls-stack1' : '';
    // The slide plays once, the first time we draw a train past its time. The
    // strip is rebuilt every second, so without remembering it the animation
    // would restart on every tick and never finish.
    let gone = '';
    if (lead.departed) {
      gone = ' ls-gone';
      if (!_departedSeen.has(lead.id)) { _departedSeen.add(lead.id); gone += ' ls-departing'; }
    }
    const cls = 'ls-train ls-appr' + (lead.live ? ' ls-live' : '')
      + (n > 1 ? ' ls-cluster' : '') + depth + gone;
    // The strip must read the same as the row beneath it. Both call it "nå"
    // for the first minute past the scheduled time, and only then start
    // counting how long ago it went.
    // The minutes ride on the vehicle's flank. Same silhouettes and the same
    // colour rule as the map — see sideVehicleSvg — so the strip and the map
    // read as one thing rather than two languages for the same train.
    const mins = lead.ago >= 1 ? '-' + lead.ago
      : (lead.ago !== null || lead.mins <= 0) ? 'nå' : String(lead.mins);
    const body = sideVehicleSvg(lead.mode, lead.colour, mins, !!lead.departed)
      + (n > 1 ? '<i>+' + (n - 1) + '</i>' : '');
    const title = lead.departed
      ? (n > 1 ? n + ' tog har gått, siste ' : '')
        + (lead.ago < 1 ? (n > 1 ? 'nå' : 'går nå') : 'for ' + lead.ago + ' min siden')
      : n > 1
      ? (() => {
          const codes = [...new Set(cl.items.map(t => t.line).filter(Boolean))];
          const which = codes.length > 1 ? ' (linje ' + codes.join(', ') + ')' : '';
          return n + ' tog' + which + ', neste om ' + lead.mins + ' min · trykk for å se dem';
        })()
      : cl.group
        ? 'om ' + lead.mins + ' min · trykk for å lukke gruppen'
        : esc(lead.label) + ' · trykk for å se raden';
    // The line colour is on the vehicle itself now, so the glyph carries no
    // background of its own — a coloured pill behind a coloured train would
    // say the same thing twice, in two shades.
    return '<span class="' + cls + '" style="left:' + cl.pos.toFixed(2) + '%"'
      + ' role="button" tabindex="0" data-count="' + n + '"'
      + (cl.group ? ' data-group="' + esc(cl.group) + '"' : '')
      + ' data-jid="' + esc(lead.id) + '"'
      + ' title="' + esc(title) + '" aria-label="' + esc(title) + '">' + body + '</span>';
  }).join('');

  el.innerHTML =
    '<div class="ls-caps"><span class="ls-cap ls-cap-wide">neste avganger</span></div>'
    + '<div class="ls-rail">'
    + '<span class="ls-zone ls-zone-appr" style="width:' + pct(0).toFixed(2) + '%"></span>'
    + trains
    + '<span class="ls-you" style="left:' + pct(0).toFixed(2) + '%"></span>'
    + '</div>'
    + '<div class="ls-ends"><span class="ls-end-from" style="left:' + pct(0).toFixed(2) + '%">'
    + esc(data.from || '') + '</span></div>';

  el.querySelectorAll('.ls-cap').forEach(cap => {
    if (cap.scrollWidth > cap.clientWidth + 1) cap.style.visibility = 'hidden';
  });

  _bindStrip(el);
  el.setAttribute('aria-label', _stripSummary(data));
}

/**
 * How far ahead a train is still worth drawing on the map.
 *
 * The board lists departures about 45 minutes out and a metro run takes about
 * 40, so most of that list is trains that have not left their terminus yet.
 * They were all drawn there, stacked on one point at the far end of the line
 * — measured at 281px from a corridor on a 382px-wide map. "Parked somewhere
 * else" is not information; these are the ones being chosen between.
 */
export const APPROACH_WINDOW_MS = 15 * 60_000;

/**
 * How far off the drawn corridor a vehicle may be and still be drawn on it.
 *
 * Generous on purpose, and doing a different job from `snapDist` (25 m / 50 m)
 * — that one asks "is this fix precise enough to put on the rail", this one
 * asks "is this train on the stretch I have drawn at all". A train one stop
 * beyond the corridor's end is a kilometre away on a metro, so anything in
 * the low hundreds separates the two cleanly; 300 m also leaves room for the
 * gap between a timetable position interpolated along stop chords and the
 * real alignment those chords cut the corners of.
 */
export const CORRIDOR_MAX_M = 300;

/** Close enough to a platform to count as standing at it. */
const AT_STOP_M = 30;

/**
 * The trains worth drawing, decided once and used by both the corridor and
 * the markers — so the drawn line and the things on it cannot disagree, which
 * is the fault this replaces.
 */
/**
 * How far back the drawn corridor reaches: to the NEXT train, and no further.
 *
 * The corridor is clipped to boarding→alighting; the train coming to get you
 * is behind that, so without widening it sits off the drawn line — which is
 * what was reported, and why this exists.
 *
 * It used to reach back for the FURTHEST train in the fifteen-minute window.
 * That is fine on a bus every half hour and absurd on a shared metro trunk:
 * Nationaltheatret → Majorstuen is a two-minute ride west, and five lines at
 * one-minute headways put thirteen trains in the window, so the drawn line
 * ran east past Ryen — right off the map, in the wrong direction, for a
 * journey that goes the other way.
 *
 * Reaching for the soonest one instead needs no threshold and no constant: it
 * scales itself with the frequency. A bus twelve minutes out still pulls the
 * corridor twelve minutes back. A train one stop away pulls it one stop.
 *
 * The stop BEHIND the train, not the nearest one. Nearest rounds inward half
 * the time, which would leave the very train the corridor was widened for
 * hanging off its end — and `renderVehicleMarkers` now declines to draw
 * anything that far off, so rounding the wrong way would empty the map.
 * `projectOnPath` already answers "which segment is this on"; asking it is
 * both shorter and the same arithmetic the markers are judged by.
 */
export function _widenLo(allStops, boardIdx, vehicles) {
  const first = (vehicles || []).find(v => v && v.pos);
  if (!first) return boardIdx;
  const chain = (allStops || []).map(st => [st.lat, st.lon]);
  if (chain.length < 2) return boardIdx;
  const p = projectOnPath(first.pos, chain);
  if (!p) return boardIdx;
  // A train standing at a platform is AT that stop, not on the segment
  // leading into it — but a projection lands an endpoint on the segment that
  // ends there, which would draw one stop more than anyone needs. Dwelling
  // at a stop is the ordinary case on a metro, not an edge one.
  const next = chain[p.segIdx + 1];
  const dwelling = next && haver(first.pos.lat, first.pos.lon, next[0], next[1]) <= AT_STOP_M;
  return Math.min(boardIdx, p.segIdx + (dwelling ? 1 : 0));
}

export function _approachingVehicles(visibleDeps, lineOn, now, livePos) {
  const on = typeof lineOn === 'function' ? lineOn
    : lineOn && typeof lineOn.has === 'function' ? (c) => !lineOn.size || lineOn.has(c)
    : (c) => c === lineOn;
  const out = [];
  const seen = new Set();
  (visibleDeps || []).forEach(({ c }) => {
    const sj = c.serviceJourney;
    const ln = sj && sj.line;
    if (!ln || !on(ln.publicCode)) return;
    const jid = sj.id;
    if (jid) { if (seen.has(jid)) return; seen.add(jid); }

    const sjc = sj.estimatedCalls;
    if (!Array.isArray(sjc) || sjc.length < 2) return;

    // When it leaves YOUR stop — the thing the reader is choosing between.
    const depIso = c.expectedDepartureTime || c.aimedDepartureTime;
    if (!depIso) return;
    if (new Date(depIso).getTime() - now > APPROACH_WINDOW_MS) return;

    // No separate "has it started yet" guard. It looks necessary — trains
    // parked at a far terminus were the reported symptom — but the window
    // already covers it: a train reaching you within fifteen minutes is at
    // most fifteen minutes of line behind you, terminus included, and the
    // corridor is widened to hold it. Adding the guard emptied the map
    // wherever the boarding stop is itself a terminus, which is where a
    // waiting train is genuinely parked at your platform.

    // Where the vehicle actually is, if anyone knows. Otherwise where the
    // timetable says it should be — drawn differently, so the map never
    // passes off an estimate as a measurement.
    const live = livePosition(livePos, jid, now);
    const pos = live || _interpolateVehiclePos(sjc, now);
    if (!pos) return;
    out.push({ c, jid, sjc, live, pos });
  });
  return out;
}

/**
 * Everything on screen that stands for a departure, cleared at once.
 *
 * There are two ways the board can end up with nothing to show — every mode
 * switched off, or every line — and each used to clear by hand. They drifted:
 * the mode branch never called renderLineStrip, so switching all four
 * transport modes off emptied the list and the map and left the strip
 * standing with its old glyphs. One place to forget is better than two, and
 * a third branch cannot now forget at all.
 */
/**
 * How a corridor is drawn, by the mode that runs on it.
 *
 * Buses get a thin dashed line because they share the road and their
 * alignment is the least exact thing on the map; rail modes get a solid
 * stroke. Three places built these two objects by hand, and one of them
 * spread the primary line's style over every other line — so a bus drawn
 * beside a metro borrowed the metro's weight.
 */
export function _corridorStyle(mode, color) {
  return mode === 'bus'
    ? { color, weight: 2, opacity: 0.55, dashArray: '1 7', interactive: false }
    : { color, weight: 4, opacity: 0.7, lineCap: 'round', interactive: false };
}

function _clearDepartureGraphics() {
  renderLineRoute([]);
  if (_bVehicleLayer) _bVehicleLayer.clearLayers();
  renderLineStrip([]);
}

/**
 * Puts each vehicle on the line drawn under it.
 *
 * The positions handed in by `_approachingVehicles` are coarse on purpose:
 * they are computed before the corridor exists, because the corridor's extent
 * depends on them (`_widenLo`). That circle is cut here — `_widenLo` only
 * picks a whole stop index, which a few hundred metres cannot change, and by
 * the time this runs the line has been drawn and can be ridden exactly.
 */
function renderVehicleMarkers(vehicles, paths) {
  if (!_bMap) return;
  if (!_bVehicleLayer) _bVehicleLayer = L.layerGroup().addTo(_bMap);
  _bVehicleLayer.clearLayers();

  const now = Date.now();
  vehicles.forEach(({ c, sjc, live, pos: coarse }) => {
    const ln = c.serviceJourney.line;
    const entry = paths && paths.get(ln.publicCode);
    const path = entry && entry.path;

    // Is this vehicle on the drawn stretch at all?
    //
    // Judged on where it actually is — the measured fix, or the timetable's
    // answer — before any of the drawing maths gets a chance to move it onto
    // the line. `projectOnPath` clamps a point beyond the corridor's end to
    // that end, so a train four stops behind it answers in kilometres.
    //
    // Without this the map drew every train in the fifteen-minute window
    // wherever it happened to be, which on a shared trunk is a dozen capsules
    // strung across the city. The corridor and the things on it now agree by
    // construction, which is what this code has claimed since v1.12.0.
    const ref = live || coarse;
    if (path && ref) {
      const on = projectOnPath(ref, path);
      if (on && on.dist > CORRIDOR_MAX_M) return;
    }

    // A measured fix near the rail goes onto it: the train is on the track,
    // and this line is our drawing of that track. Further off than the
    // snapping tolerance and it is drawn where it actually is — `snapDist`
    // has been computed in three places and read in none since it was
    // introduced, so until now every fix was snapped however far it was,
    // which is how a marker ends up on a rail it is not on.
    const projected = live && path ? projectOnPath(live, path) : null;
    const snapped = projected && projected.dist <= (entry.snapDist || 0) ? projected : null;
    const pos = live
      ? (snapped ? { lat: snapped.lat, lon: snapped.lon } : live)
      : (path ? _interpolateOnPath(sjc, now, path) : coarse) || coarse;
    // Heading from the line the marker now sits on. A feed bearing that
    // points away from the track it is drawn on reads as wrong even when the
    // degrees are right.
    const tangent = snapped ? (pointAtDistance(path, snapped.along) || {}).heading : null;
    const bearing = live
      ? (tangent != null ? tangent : live.bearing)
      : (pos.heading != null ? pos.heading : coarse.heading);
    const color = ln.presentation && ln.presentation.colour ? '#' + ln.presentation.colour : '#7c2d12';
    const mode = _depMode(c);
    // The same name the row uses. "Linje 3 → Aker brygge" was the reported
    // claim in tooltip form: line 3 does not go there. The stop you alight at
    // is both true and the direction you are actually travelling.
    const dest = _rowDest(c).text;
    const lastCall = sjc[sjc.length - 1];
    const finalArr = lastCall && _callTime(lastCall, true);
    const mins = finalArr ? Math.max(0, Math.round((new Date(finalArr).getTime() - now) / 60000)) : null;
    const eta = mins != null ? ' · ankomst om ' + fmtMins(mins) : '';
    const away = _stopsAway(sjc, now);
    const where = live
      ? 'sanntid'
      : (away ? away.label : 'beregnet fra rutetabellen');
    L.marker([pos.lat, pos.lon], { icon: makeVehicleIcon(mode, color, {
      bearing,
      estimated: !live,
    }) })
      // The train's own line, not the global selection. With one line
      // selected the two happened to agree; with several, every marker would
      // have claimed to be the same line.
      .bindTooltip('Linje ' + esc(ln.publicCode || '?') + ' → ' + esc(dest) + eta + ' · ' + esc(where),
        { className: 'map-label' })
      .addTo(_bVehicleLayer);
  });
}

const OCC_LABELS = ['', 'svært lite folk', 'lite folk', 'noen seter', 'travelt', 'fullt'];
const _PIP = '<svg class="pp" viewBox="0 0 7 10" aria-hidden="true"><circle cx="3.5" cy="2.5" r="1.75"/><path d="M0.5 10v-1C0.5 7 1.8 6 3.5 6S6.5 7 6.5 9V10z"/></svg>';
function occPip(level) {
  return '<span class="occ-pip' + (level ? ' pc' + level : ' pnd') + '" aria-label="'
    + (level ? OCC_LABELS[level] : 'ingen data') + '">' + _PIP + '</span>';
}
function legOccLevel(l) {
  const o = l.fromEstimatedCall && l.fromEstimatedCall.occupancyStatus;
  if (o === 'empty')                                     return 1;
  if (o === 'manySeatsAvailable')                        return 2;
  if (o === 'fewSeatsAvailable')                         return 3;
  if (o === 'standingRoomOnly')                          return 4;
  if (o === 'full' || o === 'crushedStandingRoomOnly')   return 5;
  const fe = l.fromEstimatedCall;
  if (fe && fe.expectedDepartureTime && fe.aimedDepartureTime &&
      new Date(fe.expectedDepartureTime) - new Date(fe.aimedDepartureTime) > 90000) return 4;
  return null;
}

function renderWalkSummary() {
  const el = document.getElementById('walk-summary');
  if (!el) return;
  const dir = config.dirs[state.dIdx];
  if (isWalkActive(dir)) {
    const wk = walkInfo();
    const wf = state.walkFromLL ? loadWalkFrom() : null;
    const ns = state.nearestStation;
    const fromLabel = wf ? wf.label : (ns ? ns.name : null);
    // Say when the position behind this number has gone old, the same way the
    // board says it for departures. ACC_GATE discards any fix worse than
    // ±40m once one exists, which is routine indoors and in a tunnel — so the
    // walk time could quietly be computed from where you were ten minutes ago.
    const stale = state.walkFromLL ? null : posAgeMins();
    el.textContent = (fromLabel ? fromLabel + ' · ' : '') + wk.mins + ' min gange'
      + (stale !== null ? ' · posisjon ' + stale + ' min gammel' : '');
    el.className = stale !== null ? 'stale' : '';
    el.style.display = 'block';
  } else if (state.gpsError === 'denied' && dir.key === 'out') {
    el.textContent = 'posisjon: ikke tilgjengelig';
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

// Data older than this can no longer be trusted for a countdown — underground
// the connection drops silently and the board would otherwise look live.
const STALE_AFTER_MS = 60_000;

function renderUpdatedStamp() {
  const el = document.getElementById('board-updated');
  if (!el) return false;
  if (state.lastFetch === null) { el.style.display = 'none'; return false; }
  const age = Date.now() - state.lastFetch;
  const stale = age > STALE_AFTER_MS;
  el.textContent = stale
    ? 'sist oppdatert ' + clk(state.lastFetch) + ' · ikke sanntid nå'
    : 'sist oppdatert ' + clk(state.lastFetch);
  el.className = stale ? 'stale' : '';
  el.style.display = 'block';
  return stale;
}

// Stable per-row identity, shared by the tap map and the rendered handlers.
function _depKey(c, origIdx) {
  return c.expectedDepartureTime + '|' + ((c.serviceJourney && c.serviceJourney.id) || origIdx);
}

// Collapse the departure list for display, sorted ascending by departure time.
//
// The trip planner returns several patterns for the SAME boarding — they
// differ only in how you walk away at the far end — and the board must show
// one row per departure, not one per variation. So the identity that decides
// a duplicate is the journey you board: the first leg's serviceJourney id.
//
// It used to be the departure MINUTE, which is not an identity at all. On a
// shared metro trunk two different lines leave within the same minute several
// times an hour, and the later-by-seconds one was deleted outright — so the
// reader lost a real, boardable departure, often the very next one. That is
// the same symptom as the arrival-ranking bug this dedupe was extracted to
// fix, from a second cause sitting one line above it.
//
// The minute bucket remains only where there is no id to key on, so a
// response missing serviceJourney ids is no noisier than before.
//
// Within a key the EARLIEST DEPARTURE still wins — arrival time is only a
// tiebreak between patterns leaving at the same instant. Ranking by arrival
// let a service leaving at 10:05:55 evict one leaving at 10:05:05.
//
// Board results (no _legs) are distinct services; only exact duplicates merge.
// ── Infinite scroll ─────────────────────────────────────────────────────────
//
// Departures loaded beyond the near window. They live here rather than in the
// DOM because the list is rebuilt with innerHTML every second — anything
// appended to the element would be gone on the next tick.
let _pages = [];
let _pagesAt = null;      // when they were fetched, for the honest divider
let _pageBusy = false;    // one request at a time, or a nudge at the bottom
let _pageDone = false;    // a page that adds nothing means there is no more
let _pageCapped = false;  // we stopped, which is not the same as no more
let _pageErr = false;

/** How many rows to stop at. Set from measurement, not from a guess. */
export const MAX_ROWS = 60;
const PAGE_SIZE = 12;

export function resetPages() {
  _pages = [];
  _pagesAt = null;
  _pageBusy = false;
  _pageDone = false;
  _pageCapped = false;
  _pageErr = false;
}

/**
 * The instant the next page should plan from.
 *
 * OTP has no page cursor — `dateTime` is the only handle — so the horizon is
 * one minute past the last departure already loaded. A minute rather than a
 * second because the trip planner buckets on minutes; asking from the same
 * instant returns the same page forever.
 */
export function _nextPageAt(deps) {
  let last = null;
  (deps || []).forEach(c => {
    const t = new Date((c && c.expectedDepartureTime) || NaN).getTime();
    if (!isNaN(t) && (last == null || t > last)) last = t;
  });
  return last == null ? null : last + 60000;
}

/**
 * Merge a freshly loaded page into what is already held.
 *
 * Returns the new page array and whether anything was actually added — a
 * page that only repeats what we have is how the end of the line announces
 * itself, and without noticing that the list would ask forever.
 */
export function _mergePage(existing, near, incoming) {
  const seen = new Set();
  const key = c => {
    const sj = c && c.serviceJourney && c.serviceJourney.id;
    return sj || (c && c.expectedDepartureTime) || '';
  };
  near.concat(existing).forEach(c => seen.add(key(c)));
  // Added to `seen` as we go, not just seeded from it: a page that repeats a
  // journey within itself would otherwise be let through twice.
  const added = (incoming || []).filter(c => {
    if (!c) return false;
    const k = key(c);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { pages: existing.concat(added), added: added.length };
}

export function dedupeDepartures(deps) {
  const indexed = (deps || []).map((c, i) => ({ c, origIdx: i }));
  indexed.sort((a, b) =>
    new Date(a.c.expectedDepartureTime).getTime() - new Date(b.c.expectedDepartureTime).getTime()
  );
  const byKey = new Map();
  indexed.forEach(({ c, origIdx }) => {
    const depMs = new Date(c.expectedDepartureTime).getTime();
    const arrMs = c._finalArrival ? new Date(c._finalArrival).getTime() : Infinity;
    const sjId = c.serviceJourney && c.serviceJourney.id;
    const key = c._legs
      ? (sjId ? 'sj|' + sjId : 'min|' + Math.floor(depMs / 60000))
      : _depKey(c, origIdx);
    const cur = byKey.get(key);
    if (!cur || depMs < cur.depMs || (depMs === cur.depMs && arrMs < cur.arrMs)) {
      byKey.set(key, { c, origIdx, arrMs, depMs });
    }
  });
  return Array.from(byKey.values());
}

/**
 * The line that admits the board is an example.
 *
 * Without it the first screen would quietly claim to be about the reader —
 * showing real departures for a route they never chose. One tap goes to the
 * form, which is where they were being dumped before.
 */
function renderDemoNote() {
  const el = document.getElementById('demo-note');
  if (!el) return;
  const dir = config.dirs[state.dIdx];
  if (!isExample(dir)) { el.style.display = 'none'; return; }
  // Once GPS has moved the origin, half of this board is genuinely about the
  // reader — say which half rather than calling the whole thing an example.
  el.innerHTML = dir._fromGps
    ? '<strong>fra ditt nærmeste stopp</strong> · ' + esc(dir.to)
      + ' er et eksempel — trykk for å velge hvor du skal'
    : '<strong>eksempel</strong> · ' + esc(dir.from) + ' → ' + esc(dir.to)
      + ' — trykk for å sette din egen rute';
  el.style.display = 'block';
  // The tap is bound in ui/nav.js beside every other navigation button —
  // board.js is the lower layer and importing nav here would make a cycle.
}

export function renderBoard() {
  renderDemoNote();
  renderAlerts();
  renderWalkSummary();
  renderModeFilter();
  const isStale = renderUpdatedStamp();
  const modes = loadModes();
  const dir = config.dirs[state.dIdx];
  const pos = state.walkFromLL || state.homeLL || (state.statLL && state.statLL[dir.key]);
  const walkFrom = (state.statLL && state.statLL[dir.key]) || pos;

  // Walk-only check before map render to avoid async race with transit map
  const walkOnlyDist = (state.lastFetch !== null && !state.deps.length && dir._toLat && dir._toLon && walkFrom)
    ? haver(walkFrom.lat, walkFrom.lon, dir._toLat, dir._toLon)
    : null;
  const isWalkOnly = walkOnlyDist !== null && walkOnlyDist <= 3000;

  if (isWalkOnly) {
    _drawWalkRoute(walkFrom, { lat: dir._toLat, lon: dir._toLon }, dir.to);
  } else {
    _walkRouteKey = null;
    renderBoardMap(pos, modes);
  }

  const activeModes = ['metro', 'tram', 'bus', 'rail'].filter(m => modes[m]);
  const list = document.getElementById('dep-list');
  list.className = isStale ? 'stale' : '';
  if (!activeModes.length) {
    list.innerHTML = '<div class="state-msg">Ingen transportmidler er valgt. '
      + 'Slå på minst ett filter over kartet for å se avganger.</div>';
    return;
  }
  if (!state.deps.length) {
    if (isWalkOnly) {
      const spd  = SPEED_MPN[loadWalkSpeed()] || SPEED_MPN.middels;
      const mins = Math.max(1, Math.ceil(walkOnlyDist * 1.3 / spd)) + loadWalkBuffer();
      const distLbl = walkOnlyDist < 1000 ? Math.round(walkOnlyDist) + ' m' : (walkOnlyDist / 1000).toFixed(1) + ' km';
      list.innerHTML =
        '<div class="walk-only-card">'
        + '<div class="woc-mins">' + mins + '<span>min</span></div>'
        + '<div class="woc-info">'
        + '<span class="woc-label">til fots fra stasjonen</span>'
        + '<span class="woc-dist">' + distLbl + ' · ' + dir.to + '</span>'
        + '</div>'
        + '<span class="woc-icon">🚶</span>'
        + '</div>';
      return;
    }
    if (state.lastFetch === null) {
      // Skeleton rather than a bare line — the board renders before the first
      // response lands, and an empty screen reads as "no departures".
      list.innerHTML = '<div class="dep-skeleton" aria-label="laster avganger">'
        + '<div class="sk-row"></div><div class="sk-row"></div><div class="sk-row"></div></div>';
      return;
    }
    list.innerHTML = '<div class="state-msg">Ingen avganger funnet for denne ruta akkurat nå.</div>';
    return;
  }
  const now = Date.now();
  const walkActive = isWalkActive(dir);

  // Two lists, one board.
  //
  // `state.deps` is the near window, refetched every 20 s. `_pages` holds
  // what infinite scrolling has loaded beyond it. Only the ROWS get both:
  // the strip normalises its axis to the furthest departure, so feeding it
  // three hours would squeeze the next few trains — the ones the reader is
  // actually choosing between — into nothing. The map, the vehicles and the
  // line pills stay near-window for the same reason.
  const applyModes = list_ => (activeModes.length < 4
    ? list_.filter(({ c }) => _journeyModesAllowed(_depModes(c), activeModes))
    : list_);
  if (_diag) stage(_diag, 'dedup', dedupeDepartures(state.deps).map(d => d.c));
  const modeDeps = applyModes(dedupeDepartures(state.deps));
  if (_diag) stage(_diag, 'modus', modeDeps.map(d => d.c));
  const modeAll = _pages.length
    ? applyModes(dedupeDepartures(state.deps.concat(_pages)))
    : modeDeps;
  if (!modeDeps.length) {
    list.innerHTML = '<div class="state-msg">Ingen avganger matcher filtrene. '
      + 'Det går avganger herfra, men de bruker transportmidler du har slått av '
      + '\u2014 en reise kan kreve et bytte til noe som ikke er valgt.</div>';
    // No departures at all, so the line pills have nothing to offer either.
    renderLineFilter([]);
    _clearDepartureGraphics();
    return;
  }
  // The pill row is built from the mode-filtered list, BEFORE the line filter
  // is applied. Build it from the filtered list instead and a switched-off
  // line loses its pill — and can then never be switched back on.
  renderLineFilter(modeDeps);

  // The line filter now reaches the departure list too, not just the strip
  // and the map. A filter that visibly applies to half the screen is worse
  // than no filter.
  const onSelectedLine = ({ c }) => {
    const ln = c.serviceJourney && c.serviceJourney.line;
    return !ln || _lineOn(ln.publicCode);
  };
  const visibleDeps = modeDeps.filter(onSelectedLine);
  // The rows, and only the rows, see the loaded pages.
  const rowDeps = _pages.length ? modeAll.filter(onSelectedLine) : visibleDeps;
  if (_diag) {
    stage(_diag, 'linje', visibleDeps.map(d => d.c));
    stage(_diag, 'rader', rowDeps.map(d => d.c));
    // Which platforms our own rows board at, compared against the stop
    // board's tally below — so "are we only showing one of the platforms" is
    // answered rather than guessed at.
    //
    // What the rows SHOW, not what the trip planner planned: otherwise the
    // diagnosis contradicts the screen it is diagnosing, and reports
    // platforms as missing that the rows are already displaying.
    _diag.ourQuays = {};
    rowDeps.forEach(({ c }) => {
      const q = _rowQuay(c, _stopQuays).quay || '?';
      _diag.ourQuays[q] = (_diag.ourQuays[q] || 0) + 1;
    });
    showRecord(_diag);
  }
  if (!visibleDeps.length) {
    list.innerHTML = '<div class="state-msg">Ingen avganger på de valgte linjene. '
      + 'Slå på flere linjer over for å se resten.</div>';
    // The pills stay: switching a line back on has to remain possible.
    _clearDepartureGraphics();
    return;
  }
  // Decided once and used by both, so the drawn line and the things on it
  // cannot disagree — which is exactly how trains ended up off the corridor.
  const lineRef = (() => {
    const m = visibleDeps.find(({ c }) => {
      const ln = c.serviceJourney && c.serviceJourney.line;
      return ln && _lineOn(ln.publicCode);
    });
    return m && m.c.serviceJourney.line && m.c.serviceJourney.line.id;
  })();
  _refreshLivePositions(lineRef);
  const vehicles = _approachingVehicles(visibleDeps, _lineOn, now, _livePos);
  const linePaths = renderLineRoute(visibleDeps, vehicles);
  renderVehicleMarkers(vehicles, linePaths);
  renderLineStrip(visibleDeps);

  // If this route continues from an unfinished plan leg's destination, flag
  // departures that leave before that leg is due to arrive — they're unlikely
  // to be catchable, but boarding is the user's call, so don't hide them.
  let planMinDepTs = null;
  const planLegs = loadPlan();
  if (planLegs.length) {
    const lastLeg = planLegs[planLegs.length - 1];
    if (lastLeg.arrIso && legStatus(lastLeg, now) !== 'done') {
      const fromNorm = normStopName(dir.from);
      const toNorm = normStopName(lastLeg.to);
      if (fromNorm && toNorm && (fromNorm.includes(toNorm) || toNorm.includes(fromNorm))) {
        planMinDepTs = new Date(lastLeg.arrIso).getTime();
      }
    }
  }

  // Headway computation for occupancy heuristic
  const _lineLastMs = new Map();
  const _lineGaps   = new Map();
  visibleDeps.forEach(({ c }) => {
    const lcode = (c.serviceJourney && c.serviceJourney.line && c.serviceJourney.line.publicCode) || '?';
    const ms = new Date(c.expectedDepartureTime).getTime();
    if (_lineLastMs.has(lcode)) {
      if (!_lineGaps.has(lcode)) _lineGaps.set(lcode, []);
      _lineGaps.get(lcode).push(ms - _lineLastMs.get(lcode));
    }
    _lineLastMs.set(lcode, ms);
  });
  const _median = arr => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const _lineMedian = new Map();
  _lineGaps.forEach((gaps, lcode) => { if (gaps.length >= 2) _lineMedian.set(lcode, _median(gaps)); });
  const _linePrev = new Map();

  // Key must be unique per rendered row: two board-path services can share an
  // ISO departure time, and keying on that alone made a tap open the wrong one.
  _depMap.clear();
  rowDeps.forEach(v => _depMap.set(_depKey(v.c, v.origIdx), v.c));

  // Where the loaded pages begin. One honest line: they are not refreshed by
  // the 20-second poll, so the board says when they were fetched rather than
  // letting them look as live as the three at the top.
  const nearCount = visibleDeps.length;
  let html = '';
  let urgentShown = false;
  rowDeps.forEach(({ c, origIdx }, rowIdx) => {
    if (_pages.length && rowIdx === nearCount) {
      html += '<div class="dep-more-sep">senere avganger'
        + (_pagesAt ? ' · hentet ' + clk(_pagesAt) : '') + '</div>';
    }
    const depId = _depKey(c, origIdx);
    const depTs = new Date(c.expectedDepartureTime).getTime();
    const diffSec = Math.floor((depTs - now) / 1000);
    const mins = Math.floor(Math.max(0, diffSec) / 60);
    const secs = Math.max(0, diffSec) % 60;
    // Already gone, but still inside the lookback window — a train running a
    // minute late is standing at the platform, and this is the row you run for.
    const agoMins = _agoMins(c, null, now);
    // "NÅ" keeps its old meaning and its old window — the first minute after
    // the scheduled time, when the train is plausibly still at the platform.
    // Only past that does the row start saying it has gone, which is the one
    // state the lookback window actually adds.
    const departed = agoMins !== null && agoMins >= 1;
    const isNow = agoMins !== null && agoMins < 1;
    const urgent = diffSec > 0 && mins <= 2;
    const ln = c.serviceJourney && c.serviceJourney.line;
    const lc = (ln && ln.publicCode) || '?';
    const lbg = ln && ln.presentation && ln.presentation.colour ? '#' + ln.presentation.colour : '#7c2d12';
    const rowDest = _rowDest(c);
    const dest = rowDest.text;
    const walkMins = rowDest.walkMins;
    const rq = _rowQuay(c, _stopQuays);
    const quay = rq.quay;
    const delayMins = c.realtime ? Math.round((depTs - new Date(c.aimedDepartureTime).getTime()) / 60000) : 0;
    const delayed = delayMins > 1;
    const sjc = c.serviceJourney && c.serviceJourney.estimatedCalls;
    const arr = findArr(sjc, dir.to);
    const arrT = (arr && (arr.expectedArrivalTime || arr.aimedArrivalTime)) || c._finalArrival || null;
    const mtl = walkActive ? mToLeave(depTs) : null;
    const rcls = walkActive ? reachCls(mtl) : null;
    const isRail = _depMode(c) === 'rail';
    const isCancelled = c.cancellation;
    // .missed already carries "you cannot make this one" (opacity .4, red
    // edge) but was reachable only through reachCls, which needs walk data.
    const missed = departed || rcls === 'missed';
    const tooEarlyForPlan = planMinDepTs !== null && depTs < planMinDepTs;
    const _jid = (c.serviceJourney && c.serviceJourney.id) || '';
    const flashing = _flashJid && _jid === _flashJid && Date.now() < _flashUntil;
    const rowCls = 'dep-row' + (isCancelled ? ' cancelled' : missed ? ' missed' : rcls ? ' ' + rcls : '') + (tooEarlyForPlan ? ' plan-early' : '') + (flashing ? ' dep-flash' : '');
    const showReach = walkActive && rcls && !missed && (rcls !== 'r-now' || !urgentShown);
    if (rcls === 'r-now') urgentShown = true;

    // Occupancy: API primary, multi-signal heuristic fallback
    const occ = c.occupancyStatus;
    const _prev = _linePrev.get(lc);
    _linePrev.set(lc, c);
    let occLevel = null;
    if      (occ === 'empty')                                          occLevel = 1;
    else if (occ === 'manySeatsAvailable')                             occLevel = 2;
    else if (occ === 'fewSeatsAvailable')                              occLevel = 3;
    else if (occ === 'standingRoomOnly')                               occLevel = 4;
    else if (occ === 'full' || occ === 'crushedStandingRoomOnly')      occLevel = 5;
    else {
      let score = 0;

      // Signal: stop sequence + prior-stop delay accumulation
      if (sjc && sjc.length >= 2) {
        const fromLow = dir.from.toLowerCase();
        const idx = sjc.findIndex(ca =>
          ca.quay && ca.quay.stopPlace &&
          ca.quay.stopPlace.name.toLowerCase().includes(fromLow)
        );
        if (idx === 0) {
          score -= 2;                           // first stop on route → empty
        } else if (idx > 0) {
          if (idx / (sjc.length - 1) > 0.75) score += 1;  // late in route
          if (c.realtime) {
            const maxDelMs = sjc.slice(0, idx).reduce((mx, ca) => {
              if (!ca.aimedDepartureTime || !ca.expectedDepartureTime) return mx;
              return Math.max(mx, new Date(ca.expectedDepartureTime) - new Date(ca.aimedDepartureTime));
            }, 0);
            if (maxDelMs > 90000) score += 2;              // >90s delay → heavy boarding upstream
            else if (maxDelMs < 20000 && idx >= 3) score -= 1; // on-time through 3+ stops → lighter
          }
        }
      }

      // Signal: time-of-day + direction
      const _d = new Date(c.expectedDepartureTime);
      const _h = _d.getHours(), _dow = _d.getDay();
      const _center = ['jernbanetorget', 'nationaltheatret', 'stortinget'];
      const _toCity = _center.some(s => dir.to.toLowerCase().includes(s));
      const _fromCity = _center.some(s => dir.from.toLowerCase().includes(s));
      if (_dow >= 1 && _dow <= 5) {
        if (_h >= 7 && _h <= 9) {
          if (_toCity)   score += 2;   // AM peak toward city → packed
          if (_fromCity) score -= 1;   // AM away from city → light
        } else if (_h >= 15 && _h <= 17) {
          if (!_toCity && !_fromCity) score += 1;  // PM outbound
          if (_toCity)                score -= 1;  // PM toward city → light
        }
      } else {
        score -= 1; // weekend: generally lighter
      }

      // Signal: headway / cancellation
      if (_prev) {
        if (_prev.cancellation) score += 2;
        else {
          const _gap = new Date(c.expectedDepartureTime) - new Date(_prev.expectedDepartureTime);
          const _med = _lineMedian.get(lc);
          if (_med && _gap < _med * 0.45) score -= 1;
        }
      }

      if      (score >= 4)  occLevel = 5;
      else if (score >= 1)  occLevel = 4;
      else if (score <= -3) occLevel = 1;
      else if (score <= -1) occLevel = 2;
    }

    // Skip local heuristic occupancy for trains — patterns don't apply
    if (isRail) occLevel = null;

    // Journey duration for trains (dep→arr)
    const railDuration = (isRail && arrT)
      ? (() => {
          const dm = Math.round((new Date(arrT).getTime() - depTs) / 60000);
          return dm >= 60 ? Math.floor(dm / 60) + 't' + (dm % 60 > 0 ? ' ' + (dm % 60) + 'm' : '') : dm + ' min';
        })()
      : null;

    const visLegs = c._legs ? c._legs.slice(0, 3) : null;
    const lineBadges = visLegs
      ? visLegs.map(l => {
          const ll = l.serviceJourney && l.serviceJourney.line;
          const bg = ll && ll.presentation && ll.presentation.colour ? '#' + ll.presentation.colour : '#7c2d12';
          const lcode = (ll && ll.publicCode) || '?';
          return '<span class="line-badge" style="background:' + bg + '">' + lcode + '</span>'
            + occPip(legOccLevel(l));
        }).join('<span class="transfer-arrow" aria-hidden="true">→</span>')
      : '<span class="line-badge" style="background:' + lbg + '">' + lc + '</span>'
        + occPip(occLevel);

    const xferCount = c._transfers && c._transfers.length;

    const minsLabel = isNow ? 'nå' : mins < 60 ? mins + ' min' : Math.floor(mins / 60) + ' t' + (mins % 60 > 0 ? ' ' + mins % 60 + ' m' : '');
    // "av på X" rather than "mot X" when the row names the alighting stop —
    // otherwise a screen reader is told the line goes somewhere it does not,
    // which is the whole bug, said out loud.
    const destPhrase = walkMins
      ? ' av på ' + dest + ' og ' + walkMins + ' min gange'
      : ' mot ' + dest;
    const a11yLabel = departed
      ? lc + destPhrase + ', gikk ' + agoMins + ' min siden'
        + (quay !== '?' ? ', spor ' + quay : '')
      : lc + destPhrase + ', avgang om ' + minsLabel + (quay !== '?' ? ', spor ' + quay : '');

    const isClock = mins >= 60;
    html += '<div class="' + rowCls + '"'
      // Lets the strip find this row: tapping a cluster jumps to the first
      // departure inside it.
      + ' data-jid="' + esc(_jid) + '"'
      + (isCancelled
        ? ''
        : ' onclick="window.tapDepId(\'' + depId + '\')"'
          + ' role="button" tabindex="0"'
          + ' aria-label="' + esc(a11yLabel) + '"'
          + ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();window.tapDepId(\'' + depId + '\')}"'
      ) + '>'
      + '<div class="dep-mins' + (urgent ? ' urgent' : '') + (isNow ? ' now' : '')
        + (departed ? ' gone' : '') + (isClock ? ' clock' : '') + '">'
      + (() => {
          if (departed) return '-' + agoMins + '<span class="unit">min</span>';
          if (isNow) return 'NÅ';
          if (diffSec < 60) return secs + '<span class="unit">sek</span>';
          if (mins < 60)    return mins + '<span class="unit">min</span>';
          return clk(depTs);
        })()
      + '</div>'
      + '<div class="dep-mid">'
      + '<div class="dep-top">'
      + lineBadges
      + '<div class="dep-times">'
      + '<span class="dep-dep">' + clk(depTs) + '</span>'
      + (arrT ? '<span class="dep-arr">ank. ' + clk(arrT) + '</span>'
        // Recovered from the stop board, which the journey search did not
        // offer. We know when it leaves; we do not know when it arrives, and
        // the honest place to say so is exactly where that number would be.
        : (c._fromStopBoard ? '<span class="dep-arr dep-tag-soft">ank. ukjent</span>' : ''))
      + (railDuration ? '<span class="dep-arr dep-rail-dur">' + railDuration + '</span>' : '')
      + '</div>'
      + '</div>'
      + '<div class="dep-info">'
      + '<span class="dep-dest">' + esc(dest) + '</span>'
      // Plain `.dep-tag`, the same treatment "1 bytte" gets — it is the same
      // kind of statement: a fact about the shape of this journey, not a
      // warning. The two modifier classes that exist (-soft, -at) each carry
      // a rule; a third with no rule would be a dead hook.
      + (rq.changed ? '<span class="dep-tag">spor endret</span>' : '')
      + (walkMins ? '<span class="dep-tag">+ ' + walkMins + ' min gange</span>' : '')
      + (xferCount ? '<span class="dep-tag">' + xferCount + (xferCount === 1 ? ' bytte' : ' bytter') + '</span>' : '')
      + (delayed ? '<span class="dep-tag">+' + delayMins + ' min</span>' : '')
      + (_atPlatform(c) ? '<span class="dep-tag dep-tag-at">står på perrongen</span>' : '')
      + (c.realtime === false ? '<span class="dep-tag dep-tag-soft">kun rutetid</span>' : '')
      + (c.cancellation ? '<span class="dep-cancelled">innstilt</span>' : '')
      + (tooEarlyForPlan ? '<span class="dep-cancelled">før forrige etappe</span>' : '')
      + '</div>'
      + (showReach
        ? '<div class="dep-reach ' + rcls + '">'
          + (mtl > 0 ? fmtMins(mtl) : '0 min') + ' igjen'
          + '</div>'
        : '')
      + '</div>'
      + '<div class="dep-spor' + (isRail ? ' dep-spor-rail' : '') + '"><div class="sl">spor</div><div class="sn">' + quay + '</div></div>'
      + '</div>';
  });
  // The list is its own scroller now, and this rebuild happens every second.
  // Page scroll survived that because it belongs to the document; an
  // element's own scrollTop does not, so without this the list would jump to
  // the top once a second and be impossible to scroll.
  // The foot of the list says what it is doing, so scrolling into nothing
  // never looks like a dead end.
  if (_pageBusy) html += '<div class="dep-more-msg">henter flere avganger …</div>';
  else if (_pageErr) html += '<div class="dep-more-msg">fikk ikke hentet flere. rull litt opp og ned for å prøve igjen.</div>';
  // Two different endings, and saying the wrong one would be a small lie:
  // one means Entur has no more to give, the other means we stopped.
  else if (_pageDone) html += '<div class="dep-more-msg">det er alt Entur har herfra.</div>';
  else if (_pageCapped) html += '<div class="dep-more-msg">viser de første ' + MAX_ROWS
    + ' avgangene. sett en senere avreisetid for å se lenger fram.</div>';

  const keep = list.scrollTop;
  list.innerHTML = html;
  list.scrollTop = keep;
  _bindInfiniteScroll(list);
}

/**
 * Row-side wrapper: is this departure's train standing at your platform?
 *
 * Only ever true from evidence. When the isolated request has not landed, or
 * the operator reports nothing and there is no measured position, this is
 * false and the row says nothing extra — "NÅ" already means due now.
 */
function _atPlatform(c) {
  const jid = c.serviceJourney && c.serviceJourney.id;
  if (!jid) return false;
  const dir = config.dirs[state.dIdx];
  const stopLL = (state.statLL && dir && state.statLL[dir.key]) || null;
  const live = livePosition(_livePos, jid, Date.now());
  return _platformState(_atStop.get(jid), live, stopLL) === 'at';
}

// The very first board of a session restores the last known departures, so a
// cold start with no signal shows something. Every later call — a back
// navigation, a direction swap — blanks as before; the data is about to be
// refetched and stale rows would just flicker.
// The last fetch's record. Written by _fetchBoard, completed by renderBoard
// (which is where the filters live), and painted into the debug panel.
let _diag = null;
export function _lastDiagnosis() { return _diag; }

let _hydrated = false;

export function startBoard() {
  // show() only runs on navigation, and at startup the board is already the
  // visible screen — so without this the fixed layout never applied on a cold
  // load, which is the only load that matters most of the time.
  document.documentElement.classList.add('view-board');
  state.deps = [];
  // A new route, or a refresh, starts from the near window again.
  resetPages();
  if (!_hydrated) {
    _hydrated = true;
    const snap = loadBoardSnapshot(config.dirs[state.dIdx]);
    if (snap) {
      state.deps = snap.deps;
      state.lastFetch = snap.ts;
      logMsg('gjenopprettet ' + snap.deps.length + ' avganger fra ' + new Date(snap.ts).toLocaleTimeString('nb-NO'));
    }
  }
  if (intervals.board) clearInterval(intervals.board);
  _fetchBoard();
  intervals.board = setInterval(_fetchBoard, config.boardRefreshMs);
  window._updatePlanCtx && window._updatePlanCtx();
}

/**
 * What the ↻ on the board does.
 *
 * Reported: "Refresh på tavla tar meg til auto-reise. Det blir feil." It was
 * a `location.reload()` — honest enough when the board was the only screen
 * the app could open on. Since v1.61.0 a reload re-runs the landing ladder,
 * and with auto-reise as your landing screen that is where a reload puts you.
 * The button did not refresh the board; it restarted the app.
 *
 * So: refresh in place, and refresh everything the screen is made of. The
 * list and the strip both come from `state.deps`, and the map's route and
 * vehicles are redrawn from the same render — but three short-lived caches
 * sit in front of the network and would answer instantly with what is already
 * on screen. A refresh button that returns the same answer is indistinguish-
 * able from one that does nothing, so an explicit tap drops them.
 */
export function refreshBoard() {
  _resetStopBoardCache();   // platforms and the departures the trip search missed
  _resetVehicleCache();     // the vehicles drawn on the map
  _resetNearbyCache();      // the stops around you
  _stopQuays = null;
  _stopCalls = null;
  startBoard();
}

export function stopBoard() {
  if (intervals.board) { clearInterval(intervals.board); intervals.board = null; }
  _destroyBoardMap();
  closeSpectatePanel();
}

// Raw thrower messages ("HTTP 503", "Failed to fetch") tell the user nothing
// they can act on. Translate, and always offer a way to try again.
function _showBoardError(msg) {
  const be = document.getElementById('board-error');
  if (!be) return;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  // Offline with a restored board, the banner above already says there is no
  // net and the stamp already says the times aren't live. A third message
  // saying the same thing, with a retry button that cannot work, is noise.
  if (offline && state.deps.length) { be.style.display = 'none'; return; }
  let human;
  if (offline) human = 'Ingen nettforbindelse.';
  else if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) human = 'Fikk ikke kontakt med Entur \u2014 kan v\u00e6re dekningen.';
  else if (/HTTP 4\d\d/.test(msg)) human = 'Ruta kunne ikke hentes. Sjekk avreise og destinasjon.';
  else if (/HTTP 5\d\d|^\d{3}$/.test(msg)) human = 'Entur svarer ikke akkurat n\u00e5.';
  else if (/Fant ikke/i.test(msg)) human = msg + '. Pr\u00f8v et annet s\u00f8keord.';
  else human = msg;
  be.innerHTML = '';
  const t = document.createElement('span');
  t.textContent = human;
  const btn = document.createElement('button');
  btn.className = 'board-retry-btn';
  btn.type = 'button';
  btn.textContent = 'pr\u00f8v igjen';
  btn.addEventListener('click', () => { be.style.display = 'none'; _fetchBoard(); });
  be.appendChild(t);
  be.appendChild(btn);
  be.style.display = 'block';
}

/**
 * The instant the board should plan from — the trip home's departure time
 * while it is still ahead of us, otherwise nothing and the board means "now".
 */
export function _returnDepartAt(dir) {
  const r = loadReturn();
  if (!r || !dir || dir.from !== r.from || dir.to !== r.to) return undefined;
  // Declining the switch has to mean declining the question too. `shouldSwitch`
  // honours the skip flag; this did not, so after tapping ✕ the board kept
  // asking Entur for departures around the RETURN time — up to 45 minutes in
  // the future — while the reader stood on the platform now. Every imminent
  // departure is then legitimately absent from the response, with nothing on
  // screen to say why.
  if (loadSkip() === dayKey(Date.now())) return undefined;
  const w = returnWindow(r, Date.now());
  return (w.active && w.before) ? w.at : undefined;
}

/**
 * Load the next page, when the reader has scrolled to the bottom.
 *
 * Guarded three ways, each against a concrete failure: one request at a time
 * (a few pixels of scrolling would otherwise fire a burst), a stop once a
 * page adds nothing (or it would ask forever), and a row cap (the list is
 * rebuilt at 1 Hz, and that cost is what sets the ceiling).
 */
function _loadNextPage() {
  if (_pageBusy || _pageDone || _pageCapped || _pageErr) return;
  const near = state.deps || [];
  if (!near.length) return;
  if (near.length + _pages.length >= MAX_ROWS) { _pageCapped = true; return; }
  const at = _nextPageAt(near.concat(_pages));
  if (at == null) return;
  const dir = config.dirs[state.dIdx];
  _pageBusy = true;
  renderBoard();

  const done = (rows) => {
    _pageBusy = false;
    const { pages, added } = _mergePage(_pages, near, rows);
    // Trim to the cap rather than overshooting by up to a whole page.
    _pages = pages.slice(0, Math.max(0, MAX_ROWS - near.length));
    if (_pages.length < pages.length) _pageCapped = true;
    if (_pagesAt == null) _pagesAt = Date.now();
    // Nothing new came back: this is the end of what Entur will tell us.
    if (!added) _pageDone = true;
    logMsg('side: +' + added + ' avganger (' + (near.length + _pages.length) + ' totalt)',
      added ? 'ok' : null);
    renderBoard();
  };
  const failed = () => { _pageBusy = false; _pageErr = true; renderBoard(); };

  if (dir.toGeo || dir.toStopId || (dir._toLat && dir._toLon)) {
    fetchTripPage(dir, at, PAGE_SIZE,
      patterns => done(patterns.map(adaptTripPattern).filter(Boolean)), failed);
  } else {
    fetchBoardPage(dir, at, PAGE_SIZE,
      calls => done(calls.filter(c => !dir.line || (c.serviceJourney
        && c.serviceJourney.line && c.serviceJourney.line.publicCode === dir.line))), failed);
  }
}

/**
 * Bound once to the container, not to a sentinel element.
 *
 * A sentinel row would sit inside the innerHTML that is replaced every
 * second, so an IntersectionObserver on it would have to be re-attached on
 * every tick. The listener on the scroller itself survives the rebuild.
 */
function _bindInfiniteScroll(list) {
  if (!list || list._infBound) return;
  list._infBound = true;
  list.addEventListener('scroll', () => {
    const left = list.scrollHeight - list.scrollTop - list.clientHeight;
    if (left < 240) _loadNextPage();
  }, { passive: true });
}

/**
 * Ask the stop board the same question Ruter asks.
 *
 * Ruter shows every departure from the stop; this app asks the trip planner
 * for journeys, and OTP legitimately omits an itinerary it considers
 * dominated. That difference is invisible from inside, and it is why two
 * rounds of dedupe fixes did not stop the reports. One extra query settles
 * which of the two lost the departure.
 *
 * Only while the debug panel is open: the answer is a diagnostic, and a
 * second request per poll for everyone would be a cost with no reader.
 */
// Opening the panel is the moment the reader wants the comparison, and the
// board polls every 20 s — so without this the one line you opened the panel
// for could be twenty seconds late.
window._askStopBoard = () => _askStopBoard(config.dirs[state.dIdx]);

/**
 * The stop's own answer, asked once a minute and used for two things.
 *
 * It used to run only while the debug panel was open. Now the platform on
 * every row depends on it, so it runs always — but through the shared cache
 * in entur.js, so the panel no longer adds a request of its own. With the
 * panel open this is FEWER calls than before, not more.
 */
function _askStopBoard(dir) {
  if (!dir || !dir.stopId) return;
  // Ask only for the modes the reader has on. `numberOfDepartures` caps the
  // whole board, so at a bus hub like Mortensrud a mode-blind request spends
  // its twenty slots on buses: measured 3 metro and 17 bus, which left most
  // rows with no platform to cross-check against.
  const on = loadModes();
  const modes = BOARD_MODES.filter(m => on[m]);
  stopBoardSummary(dir.stopId, modes).then(res => {
    if (!res) return;
    _stopQuays = res.byJourney || null;
    _stopCalls = res.calls || null;
    _applyDeps();
    if (_diag) {
      _diag.stopBoard = res.earliest;
      _diag.stopBoardN = res.n;
      // Only the platforms carrying modes the reader has switched on. The
      // tally used to set bus bays A–F against a metro-only board and report
      // them as "platforms we do not show" — an accusation about buses the
      // reader had filtered out, which sent the next reader hunting for a bug
      // that was not there.
      const on = loadModes();
      const qm = res.quayModes || {};
      const shown = {};
      Object.entries(res.quays || {}).forEach(([q, n]) => {
        const m = qm[q];
        if (!m || on[m]) shown[q] = n;
      });
      _diag.stopBoardQuays = shown;
      if (state.debugOpen) showRecord(_diag);
    }
    // The rows carry the platform, so a fresher answer has to reach them.
    renderBoard();
  }).catch(() => {});
}

function _fetchBoard() {
  // The trip home takes over when its time comes. It restarts the board
  // itself, so there is nothing left to fetch on this pass.
  if (window._maybeReturnSwitch && window._maybeReturnSwitch()) return;
  const dir = config.dirs[state.dIdx];
  // While the trip home is showing but has not left yet, ask for the
  // departures around when you actually go, not the ones going now.
  const at = _returnDepartAt(dir);

  // One record per fetch. The whole reason it exists: this symptom has been
  // reported three times and mis-diagnosed twice, so the board now shows
  // where the earliest departure stopped being the earliest.
  _diag = newRecord(Date.now());
  _diag.askedFor = at != null ? at : Date.now() - LOOKBACK_MINS * 60000;
  _diag.askedFuture = at != null && at > Date.now();

  if (dir.toGeo || dir.toStopId || (dir._toLat && dir._toLon)) {
    fetchTrip(dir, (patterns, situations) => {
      if (dir._fromLat && dir._fromLon) {
        state.statLL[dir.key] = { lat: dir._fromLat, lon: dir._fromLon };
        window._updateWalkDbg && window._updateWalkDbg();
      }
      state.serviceAlerts = situations || [];
      // Forget put-away entries for messages that are no longer reported, so
      // the key cannot grow over months of use.
      pruneHidden(state.serviceAlerts);
      logMsg('situations: ' + state.serviceAlerts.length, state.serviceAlerts.length ? 'ok' : null);
      if (_diag) {
        stage(_diag, 'svar', patterns, tp => {
          const l = (tp.legs || []).find(x => x.mode !== 'foot');
          return l && ((l.fromEstimatedCall && (l.fromEstimatedCall.expectedDepartureTime
            || l.fromEstimatedCall.aimedDepartureTime)) || l.expectedStartTime || l.aimedStartTime);
        });
      }
      const adapted = patterns.map(adaptTripPattern).filter(Boolean);
      const dropped = patterns.length - adapted.length;
      if (_diag) {
        // Read AFTER resolution: resolveStop fills in dir.stopId, and which of
        // the two it ended up as is the point — coordinates make OTP add walk
        // time to the platform and drop departures it judges unreachable.
        // Before this it reported the pre-resolution value, which on the very
        // first fetch — the one at startup, when this is reported — was the
        // place name and told the reader nothing.
        _diag.origin = dir.stopId
          ? dir.stopId
          : ((dir._fromLat && dir._fromLon) ? 'koordinater — OTP legger på gangtid' : (dir.geo || '?'));
        _diag.dropped = takeDropReasons();
        _diag.lookbackLost = takeLookbackLost();
        stage(_diag, 'adaptert', adapted);
        _askStopBoard(dir);
      }
      logMsg('✓ ' + adapted.length + '/' + patterns.length + ' trip patterns'
        + (dropped ? ' (' + dropped + ' forkastet)' : ''), dropped ? null : 'ok');
      _tripDeps = adapted;
      _applyDeps();
      state.lastFetch = Date.now();
      saveBoardSnapshot(dir, state.deps, state.lastFetch);
      document.getElementById('board-error').style.display = 'none';
    }, _showBoardError, at);
    return;
  }
  fetchBoard(dir, (stop) => {
    const sitMap = new Map();
    const addSits = (arr) => (arr || []).forEach(s => s && s.id && sitMap.set(s.id, s));
    addSits(stop.situations);
    (stop.estimatedCalls || []).forEach(call => {
      addSits(call.situations);
      if (call.serviceJourney) addSits(call.serviceJourney.situations);
    });
    state.serviceAlerts = Array.from(sitMap.values());
    pruneHidden(state.serviceAlerts);
    logMsg('situations: ' + state.serviceAlerts.length, state.serviceAlerts.length ? 'ok' : null);
    if (stop.latitude && stop.longitude) {
      state.statLL[dir.key] = { lat: stop.latitude, lon: stop.longitude };
      window._updateWalkDbg && window._updateWalkDbg();
    }
    const raw = stop.estimatedCalls || [];
    const byL = dir.line
      ? raw.filter(c => { const l = c.serviceJourney && c.serviceJourney.line; return l && l.publicCode === dir.line; })
      : raw;
    const byD = dir.filter ? byL.filter(c => dir.filter.test((c.destinationDisplay && c.destinationDisplay.frontText) || '')) : byL;
    logMsg('✓ ' + byD.length + '/' + raw.length + (dir.line ? ' L' + dir.line : ' alle linjer'), 'ok');
    _tripDeps = null;
    state.deps = byD;
    state.lastFetch = Date.now();
    saveBoardSnapshot(dir, byD, state.lastFetch);
    document.getElementById('board-error').style.display = 'none';
    setDot('ok');
  }, _showBoardError);
}

window.tapDepId = (id) => { const dep = _depMap.get(id); if (dep) window.tap(dep); };
window._startBoard = startBoard;
window._fetchBoard = _fetchBoard;
