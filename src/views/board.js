import config from '../config.js';
import { enturFetch } from '../api/http.js';
import { saveBoardSnapshot, loadBoardSnapshot } from '../boardCache.js';
import { state, intervals } from '../state.js';
import { storage } from '../storage.js';
import { walkInfo, mToLeave, reachCls, findArr, isWalkActive, loadWalkFrom, haver, SPEED_MPN, loadWalkSpeed, loadWalkBuffer, normStopName, posAgeMins } from '../geo.js';
import { fetchBoard, fetchTrip, geocodePlace } from '../api/entur.js';
import { setDot, logMsg } from '../ui/log.js';
import { adaptTripPattern, quayLatLon, legShape } from '../api/adapt.js';
import { loadPlan, legStatus } from '../api/plan.js';
import { renderAlerts } from '../ui/alerts.js';
import { loadFavs } from '../ui/favs.js';
import { fmtMins, esc } from '../ui/fmt.js';
import L from 'leaflet';
import { fetchBysykkel } from '../api/bysykkel.js';
import { fetchScooters }    from '../api/scooters.js';
import { fetchNearbyStops } from '../api/stops.js';
import { makeStopIcon, makeVehicleIcon, makeRouteStopIcon, mapHalo } from '../ui/mapIcons.js';
import { fetchVehiclePositions, livePosition } from '../api/vehicles.js';
import { fetchInflight } from '../api/entur.js';
import { createMap, drawRoute } from '../ui/map.js';
import { snapToCorridor } from '../ui/corridor.js';
import { decodePolyline } from '../ui/polyline.js';
import { tokens, alpha } from '../ui/themeTokens.js';
import { closeSpectatePanel } from './spectate.js';

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
 * Toggle one line.
 *
 * Turning off the last one brings them all back, which is what you want — an
 * empty filter is an empty strip with no explanation, and "none of them" is
 * never the intent. That is not a separate rule though: it falls out of empty
 * meaning all. A guard for it looked necessary and was an equivalent mutant,
 * so it is not here.
 */
export function _toggleLine(selected, code, allCodes) {
  const all = (allCodes || []).slice();
  if (!all.includes(code)) return new Set(selected);
  // An empty set already means all, so start from the explicit full set.
  const cur = new Set((selected && selected.size) ? selected : all);
  if (cur.has(code)) cur.delete(code); else cur.add(code);
  return cur.size === all.length ? new Set() : cur;
}
let _bRoutePts = null;
let _bRouteSnapDist = null;
let _shapeLogKey = null;

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
      drawRoute(_bLayer, latlngs, { color: tokens().accent, weight: 3, opacity: 0.9, dashArray: '7 6' });
      if (!_bUserMoved) _bMap.fitBounds(latlngs, { padding: [44, 44], maxZoom: 17 });
    })
    .catch(() => {
      if (!_bLayer) return;
      L.polyline([[fromLL.lat, fromLL.lon], [toLL.lat, toLL.lon]], {
        color: tokens().accent, weight: 2, opacity: 0.45, dashArray: '6 7',
      }).addTo(_bLayer);
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

  el.innerHTML = lines.map(l =>
    '<button class="line-pill' + (_lineOn(l.code) ? ' active' : '') + '" data-line="' + esc(l.code) + '">'
    + '<span class="line-badge" style="background:' + l.color + '">' + esc(l.code) + '</span>'
    + '</button>'
  ).join('');
  el.querySelectorAll('.line-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      _selectedLines = _toggleLine(_selectedLines, btn.dataset.line, lines.map(l => l.code));
      _lineFilterKey = '';
      _bFitRouteRequested = true;
      renderBoard();
    });
  });
}

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
/**
 * Compass heading from one point to another, in degrees clockwise from north.
 *
 * A degree of longitude is much shorter than a degree of latitude this far
 * north, so the east-west component has to be scaled by cos(lat). Skipping
 * that skews a diagonal heading by roughly 25 degrees at Oslo's latitude —
 * wrong in a way that still looks plausible on a map.
 *
 * @returns {number|null} null when the two points coincide, so callers can
 *   leave the symbol unrotated rather than snapping it north.
 */
export function _headingDeg(fromLat, fromLon, toLat, toLon) {
  const dLat = toLat - fromLat;
  const dLon = (toLon - fromLon) * Math.cos(((fromLat + toLat) / 2) * Math.PI / 180);
  if (dLat === 0 && dLon === 0) return null;
  const deg = Math.atan2(dLon, dLat) * 180 / Math.PI;
  return (deg + 360) % 360;
}

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

export function _interpolateVehiclePos(calls, now) {
  if (!calls || !calls.length) return null;
  const pts = calls.map(call => {
    const ll = quayLatLon(call.quay);
    if (!ll) return null;
    const arr = _callTime(call, true);
    const dep = _callTime(call, false);
    if (!arr || !dep) return null;
    return { lat: ll.lat, lon: ll.lon, arr: new Date(arr).getTime(), dep: new Date(dep).getTime() };
  }).filter(Boolean);

  if (pts.length < 2) return null;

  // Vehicle hasn't left its starting terminus yet — show it parked there.
  if (now <= pts[0].dep) {
    return { lat: pts[0].lat, lon: pts[0].lon,
             heading: _headingDeg(pts[0].lat, pts[0].lon, pts[1].lat, pts[1].lon) };
  }

  // Service has already finished its run — nothing to show.
  if (now > pts[pts.length - 1].arr) return null;

  for (let i = 0; i < pts.length - 1; i++) {
    const cur = pts[i], next = pts[i + 1];
    if (now >= cur.dep && now <= next.arr) {
      const span = next.arr - cur.dep;
      const frac = span > 0 ? Math.min(1, Math.max(0, (now - cur.dep) / span)) : 0;
      return { lat: cur.lat + (next.lat - cur.lat) * frac,
               lon: cur.lon + (next.lon - cur.lon) * frac,
               heading: _headingDeg(cur.lat, cur.lon, next.lat, next.lon) };
    }
    // Standing at a stop: keep facing the way it is about to go.
    if (now >= next.arr && now <= next.dep) {
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

// ── Line route corridor ──────────────────────────────────────────────────────
// Trains and trams run on dedicated tracks the basemap doesn't draw, so for
// the selected line we sketch its stop-to-stop corridor. Buses already follow
// visible roads, so their corridor is drawn lighter — a subtle "which road"
// hint rather than the primary cue.

// How long a tapped stop's name tooltip stays visible — long enough to read
// on a phone, short enough not to clutter a corridor with many stops.
const _ROUTE_STOP_TOOLTIP_MS = 3000;

let _walkExtKey = null;

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
    stops.push({ lat: ll.lat, lon: ll.lon, name: (sp && sp.name) || '' });
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

function renderLineRoute(visibleDeps, vehicles) {
  if (!_bMap) return;
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
    _walkExtKey = null;
    return;
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
    allStops.push({ lat: ll.lat, lon: ll.lon, name: (sp && sp.name) || '' });
  });
  if (allPts.length < 2) {
    _bRouteLayer.clearLayers();
    _bRoutePts = null;
    _walkExtKey = null;
    return;
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
  let alightIdx = findStopIdx(dir.to, dir._toLat, dir._toLon);

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
    return;
  }

  const ln = c.serviceJourney.line;
  const color = ln.presentation && ln.presentation.colour ? '#' + ln.presentation.colour : '#7c2d12';
  const isBus = _depMode(c) === 'bus';
  const style = _corridorStyle(_depMode(c), color);

  _bRoutePts = pts;
  _bRouteSnapDist = isBus ? 25 : 50;

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
  if (pts.length >= 2) L.polyline(pts, style).addTo(_bRouteLayer);

  // Every leg after the first.
  //
  // The corridor above is built from the departure's serviceJourney, which
  // adaptTripPattern sets to leg one — so on a journey with a change the map
  // stopped at the interchange and said nothing. Leg one keeps everything
  // that is one-per-board (the snap corridor, the widening, the walk
  // extensions): those are about the stop you are standing at and the train
  // you are catching, not the rest of the trip. Only the drawing and the fit
  // go multi-leg.
  const restPts = [];
  ((c._legs || []).slice(1)).forEach(leg => {
    const legStops = _legCorridorStops(leg, dir);
    const legShapePts = legShape(leg);
    const lp = legShapePts || legStops.map(st => [st.lat, st.lon]);
    if (lp.length < 2) return;
    const ll = leg.serviceJourney && leg.serviceJourney.line;
    const lc = ll && ll.presentation && ll.presentation.colour
      ? '#' + ll.presentation.colour : color;
    L.polyline(lp, _corridorStyle(leg.mode, lc)).addTo(_bRouteLayer);
    restPts.push(...lp);
  });

  // Every other selected line, as a corridor only. Deduped on geometry: on
  // shared track four lines would otherwise stack four identical strokes.
  const drawn = new Set([JSON.stringify(pts)]);
  [...perLine.values()].slice(1).forEach(({ c: oc }) => {
    const ocStops = _legCorridorStops((oc._legs && oc._legs[0]) || null, dir);
    if (ocStops.length < 2) return;
    const ocPts = ocStops.map(st => [st.lat, st.lon]);
    const key = JSON.stringify(ocPts);
    if (drawn.has(key)) return;
    drawn.add(key);
    const ol = oc.serviceJourney.line;
    const ocColor = ol.presentation && ol.presentation.colour ? '#' + ol.presentation.colour : color;
    // Its own mode, not the primary line's. Spreading `style` here meant the
    // bus corridor was drawn solid and 4px whenever a metro line happened to
    // have the soonest departure — the same bus, two thicknesses, depending
    // on what else was selected.
    L.polyline(ocPts, _corridorStyle(_depMode(oc), ocColor)).addTo(_bRouteLayer);
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

  // Walking extension: dashed line from alighting stop to final destination venue.
  if (destIsVenue && alightIdx !== -1) {
    const alightPt = allPts[alightIdx];
    const destLL = { lat: dir._toLat, lon: dir._toLon };
    const extKey = alightPt[0] + ',' + alightPt[1] + '→' + destLL.lat + ',' + destLL.lon;
    if (extKey !== _walkExtKey) {
      _walkExtKey = extKey;
      L.marker([destLL.lat, destLL.lon], { icon: _makeDestIcon() })
        .bindTooltip(dir.to || 'Destinasjon', { permanent: false, direction: 'top', offset: [0, -32], className: 'map-label' })
        .addTo(_bRouteLayer);
      const q = '{trip(from:{coordinates:{latitude:' + alightPt[0] + ',longitude:' + alightPt[1] + '}}'
        + 'to:{coordinates:{latitude:' + destLL.lat + ',longitude:' + destLL.lon + '}}'
        + 'modes:{directMode:foot}numTripPatterns:1){tripPatterns{legs{pointsOnLink{points}}}}}';
      enturFetch(config.api.journeyPlanner, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(data => {
          if (!_bRouteLayer) return;
          const pats = data.data && data.data.trip && data.data.trip.tripPatterns;
          const encoded = pats && pats[0] && pats[0].legs && pats[0].legs[0]
            && pats[0].legs[0].pointsOnLink && pats[0].legs[0].pointsOnLink.points;
          if (!encoded) throw new Error('no points');
          const latlngs = decodePolyline(encoded);
          drawRoute(_bRouteLayer, latlngs, { color: tokens().accent, weight: 3, opacity: 0.9, dashArray: '6 6' });
        })
        .catch(() => {
          if (!_bRouteLayer) return;
          L.polyline([alightPt, [destLL.lat, destLL.lon]], {
            color: tokens().accent, weight: 2, opacity: 0.55, dashArray: '6 7',
          }).addTo(_bRouteLayer);
        });
    }
  } else {
    _walkExtKey = null;
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
const _STRIP_GLYPH_PX = 46;

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
  // against a 46px glyph. Spreading them produced overlapping glyphs, and an
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
    const body = '<b>' + (lead.ago >= 1 ? '-' + lead.ago : lead.ago !== null || lead.mins <= 0 ? 'nå' : lead.mins) + '</b>'
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
    // Several lines can share the axis now, so a glyph carries its own line
    // colour. Falls back to the accent when the operator gave none.
    const tint = lead.colour ? 'background:' + lead.colour + ';border-color:' + lead.colour + ';' : '';
    return '<span class="' + cls + '" style="' + tint + 'left:' + cl.pos.toFixed(2) + '%"'
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
 * The trains worth drawing, decided once and used by both the corridor and
 * the markers — so the drawn line and the things on it cannot disagree, which
 * is the fault this replaces.
 */
/**
 * How far back the drawn corridor has to reach to hold every train on it.
 *
 * The corridor is clipped to boarding→alighting; the trains coming to get you
 * are behind that, so without widening they sit off the drawn line — which is
 * what was reported.
 *
 * Nearest stop by distance, deliberately not _stopsAway's index: that counts
 * a differently filtered array and would be quietly off by a few. Whole
 * stops, so the left end steps as trains drop out of the window rather than
 * creeping every second.
 */
export function _widenLo(allStops, boardIdx, vehicles) {
  let lo = boardIdx;
  (vehicles || []).forEach(({ pos }) => {
    if (!pos) return;
    let best = -1, bestD = Infinity;
    (allStops || []).forEach((st, i) => {
      const d = haver(st.lat, st.lon, pos.lat, pos.lon);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best !== -1 && best < lo) lo = best;
  });
  return lo;
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

function renderVehicleMarkers(vehicles) {
  if (!_bMap) return;
  if (!_bVehicleLayer) _bVehicleLayer = L.layerGroup().addTo(_bMap);
  _bVehicleLayer.clearLayers();

  const now = Date.now();
  vehicles.forEach(({ c, sjc, live, pos }) => {
    const ln = c.serviceJourney.line;
    const color = ln.presentation && ln.presentation.colour ? '#' + ln.presentation.colour : '#7c2d12';
    const mode = _depMode(c);
    const dest = (c.destinationDisplay && c.destinationDisplay.frontText) || '';
    const lastCall = sjc[sjc.length - 1];
    const finalArr = lastCall && _callTime(lastCall, true);
    const mins = finalArr ? Math.max(0, Math.round((new Date(finalArr).getTime() - now) / 60000)) : null;
    const eta = mins != null ? ' · ankomst om ' + fmtMins(mins) : '';
    const away = _stopsAway(sjc, now);
    const where = live
      ? 'sanntid'
      : (away ? away.label : 'beregnet fra rutetabellen');
    L.marker([pos.lat, pos.lon], { icon: makeVehicleIcon(mode, color, {
      bearing: live ? live.bearing : pos.heading,
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

export function renderBoard() {
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

  let modeDeps = dedupeDepartures(state.deps);
  if (activeModes.length < 4) {
    modeDeps = modeDeps.filter(({ c }) => _journeyModesAllowed(_depModes(c), activeModes));
  }
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
  const visibleDeps = modeDeps.filter(({ c }) => {
    const ln = c.serviceJourney && c.serviceJourney.line;
    return !ln || _lineOn(ln.publicCode);
  });
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
  renderLineRoute(visibleDeps, vehicles);
  renderVehicleMarkers(vehicles);
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
  visibleDeps.forEach(v => _depMap.set(_depKey(v.c, v.origIdx), v.c));

  let html = '';
  let urgentShown = false;
  visibleDeps.forEach(({ c, origIdx }) => {
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
    const dest = (c.destinationDisplay && c.destinationDisplay.frontText) || '';
    const quay = (c.quay && c.quay.publicCode) || (c.quay && c.quay.name ? c.quay.name.replace(/^.*?\s/, '') : '?');
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
    const a11yLabel = departed
      ? lc + ' mot ' + dest + ', gikk ' + agoMins + ' min siden'
        + (quay !== '?' ? ', spor ' + quay : '')
      : lc + ' mot ' + dest + ', avgang om ' + minsLabel + (quay !== '?' ? ', spor ' + quay : '');

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
      + (arrT ? '<span class="dep-arr">ank. ' + clk(arrT) + '</span>' : '')
      + (railDuration ? '<span class="dep-arr dep-rail-dur">' + railDuration + '</span>' : '')
      + '</div>'
      + '</div>'
      + '<div class="dep-info">'
      + '<span class="dep-dest">' + esc(dest) + '</span>'
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
  const keep = list.scrollTop;
  list.innerHTML = html;
  list.scrollTop = keep;
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
let _hydrated = false;

export function startBoard() {
  // show() only runs on navigation, and at startup the board is already the
  // visible screen — so without this the fixed layout never applied on a cold
  // load, which is the only load that matters most of the time.
  document.documentElement.classList.add('view-board');
  state.deps = [];
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

function _fetchBoard() {
  const dir = config.dirs[state.dIdx];
  if (dir.toGeo || dir.toStopId || (dir._toLat && dir._toLon)) {
    fetchTrip(dir, (patterns, situations) => {
      if (dir._fromLat && dir._fromLon) {
        state.statLL[dir.key] = { lat: dir._fromLat, lon: dir._fromLon };
        window._updateWalkDbg && window._updateWalkDbg();
      }
      state.serviceAlerts = situations || [];
      logMsg('situations: ' + state.serviceAlerts.length, state.serviceAlerts.length ? 'ok' : null);
      const adapted = patterns.map(adaptTripPattern).filter(Boolean);
      const dropped = patterns.length - adapted.length;
      logMsg('✓ ' + adapted.length + '/' + patterns.length + ' trip patterns'
        + (dropped ? ' (' + dropped + ' forkastet)' : ''), dropped ? null : 'ok');
      state.deps = adapted;
      state.lastFetch = Date.now();
      saveBoardSnapshot(dir, adapted, state.lastFetch);
      document.getElementById('board-error').style.display = 'none';
    }, _showBoardError);
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
