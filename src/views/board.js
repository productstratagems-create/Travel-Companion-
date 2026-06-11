import config from '../config.js';
import { state, intervals } from '../state.js';
import { walkInfo, mToLeave, reachCls, findArr, isWalkActive, loadWalkFrom, haver, SPEED_MPN, loadWalkSpeed, loadWalkBuffer, normStopName } from '../geo.js';
import { fetchBoard, fetchTrip, geocodePlace } from '../api/entur.js';
import { setDot, logMsg } from '../ui/log.js';
import { adaptTripPattern } from '../api/adapt.js';
import { loadPlan, legStatus } from '../api/plan.js';
import { renderAlerts } from '../ui/alerts.js';
import { loadFavs } from '../ui/favs.js';
import { fmtMins, esc } from '../ui/fmt.js';
import L from 'leaflet';
import { fetchBysykkel } from '../api/bysykkel.js';
import { fetchScooters }    from '../api/scooters.js';
import { fetchNearbyStops } from '../api/stops.js';
import { makeStopIcon } from '../ui/mapIcons.js';
import { closeSpectatePanel } from './spectate.js';

function pad(n) { return String(n).padStart(2, '0'); }
function clk(v) { const d = new Date(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

// Keyed by expectedDepartureTime — stable across re-renders so a click fired on
// a DOM element from a previous render still resolves the correct departure.
const _depMap = new Map();

// ── Mode filter ──────────────────────────────────────────────────────────────
const MODES_KEY = 't.modes';
const DEFAULT_MODES = { metro: true, tram: true, bus: true, sykkel: false };
function loadModes() {
  try { const v = localStorage.getItem(MODES_KEY); return v ? { ...DEFAULT_MODES, ...JSON.parse(v) } : { ...DEFAULT_MODES }; }
  catch { return { ...DEFAULT_MODES }; }
}
function saveModes(m) { try { localStorage.setItem(MODES_KEY, JSON.stringify(m)); } catch {} }
function _depMode(dep) {
  if (dep._legs && dep._legs[0]) return dep._legs[0].mode;
  const ln = dep.serviceJourney && dep.serviceJourney.line;
  return (ln && ln.transportMode) || 'metro';
}

// ── Board map (single universal map for all modes) ──────────────────────────
const _TILE = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
let _bMap = null;
let _bLayer = null;
let _bUserMoved = false;
let _bFitted = false;
let _bDestLL = null;
let _bDestKey = null;
let _bMapKey = null;

function _destroyBoardMap() {
  if (_bMap) { _bMap.remove(); _bMap = null; _bLayer = null; }
  _bUserMoved = false;
  _bFitted = false;
  _bMapKey = null;
  _walkRouteKey = null;
}

function _makeBikeIcon(bikes, ebikes) {
  const color = bikes === 0 ? '#f87171' : bikes <= 2 ? '#fbbf24' : '#4ade80';
  const label = bikes + (ebikes ? '+' : '');
  const html = '<div style="background:' + color + ';color:#111;border-radius:50%;width:28px;height:28px;'
    + 'display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;'
    + 'transform:translate(-50%,-50%);box-shadow:0 1px 4px rgba(0,0,0,.3)">' + label + '</div>';
  return L.divIcon({ className: '', html, iconSize: [0, 0], iconAnchor: [0, 0] });
}

function _makeStopIcon(mode, count) { return makeStopIcon(mode, count); }

function _makeDestIcon() {
  const html = '<svg width="22" height="30" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M11 0C5 0 0 5 0 11c0 8.3 11 19 11 19S22 19.3 22 11C22 5 17 0 11 0z" fill="#f5b840"/>'
    + '<circle cx="11" cy="11" r="4.5" fill="#b8860b"/>'
    + '</svg>';
  return L.divIcon({ className: '', html, iconSize: [22, 30], iconAnchor: [11, 30] });
}

const VENDOR_COLORS = { Bolt: '#22c55e', Voi: '#f87171', Tier: '#60a5fa' };
function _makeScooterIcon(operator, battery) {
  const vc = VENDOR_COLORS[operator] || '#94a3b8';
  const label = battery != null ? battery + '%' : '?';
  const html = '<div style="background:rgba(10,8,6,.85);border:2px solid ' + vc + ';border-radius:4px;padding:2px 5px;'
    + 'font-size:10px;font-weight:700;transform:translate(-50%,-100%);white-space:nowrap;'
    + 'box-shadow:0 1px 4px rgba(0,0,0,.4);color:' + vc + '">⚡' + label + '</div>';
  return L.divIcon({ className: '', html, iconSize: [0, 0], iconAnchor: [0, 0] });
}

function renderBoardMap(pos, modes) {
  const mapEl = document.getElementById('board-map');
  if (!mapEl) return;

  if (!_bMap) {
    _bMap = L.map(mapEl, { zoomControl: true, attributionControl: false, zoomControlOptions: { position: 'topleft' } });
    _bMap.on('dragstart', () => { _bUserMoved = true; });
    L.tileLayer(_TILE, { subdomains: 'abcd', attribution: '© CartoDB' }).addTo(_bMap);
    L.control.scale({ imperial: false, maxWidth: 100, position: 'bottomleft' }).addTo(_bMap);
    _bLayer = L.layerGroup().addTo(_bMap);
    const c = pos || { lat: 59.9139, lon: 10.7522 };
    _bMap.setView([c.lat, c.lon], 14);
    setTimeout(() => _bMap && _bMap.invalidateSize(), 100);
    const expandBtn = document.getElementById('board-map-expand');
    if (expandBtn) {
      expandBtn.onclick = () => {
        const exp = mapEl.classList.toggle('expanded');
        expandBtn.textContent = exp ? '✕' : '⤢';
        expandBtn.setAttribute('aria-label', exp ? 'Minimer kart' : 'Utvid kart');
        expandBtn.title = exp ? 'Minimer kart' : 'Utvid kart';
        setTimeout(() => _bMap && _bMap.invalidateSize(), 320);
      };
    }
  }

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
  const p5 = transitModes.length
    ? p4.then(d => d ? fetchNearbyStops(d.lat, d.lon) : []).catch(() => [])
    : Promise.resolve([]);

  Promise.allSettled([p1, p2, p3, p4, p5]).then(([r1, r2, r3, r4, r5]) => {
    if (!_bLayer) return;
    _bLayer.clearLayers();
    const pts = [];

    if (pos) {
      L.circleMarker([pos.lat, pos.lon], { radius: 7, color: '#60a5fa', fillColor: '#60a5fa', fillOpacity: 0.9, weight: 2 })
        .bindTooltip('Din posisjon', { className: 'map-label' })
        .addTo(_bLayer);
      pts.push([pos.lat, pos.lon]);
    }

    // Merge stops from both ends, dedup by uid
    const allStops = [
      ...(r1.status === 'fulfilled' ? r1.value : []),
      ...(r5.status === 'fulfilled' ? r5.value : []),
    ];
    const seen = new Set();
    const uniqueStops = allStops.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
    if (uniqueStops.length) {
      const modeSet = new Set(transitModes);
      const filtered = uniqueStops.filter(s => modeSet.has(s.mode));
      const used = new Set();
      filtered.forEach((s, i) => {
        if (used.has(i)) return;
        used.add(i);
        const cluster = [s];
        filtered.forEach((t, j) => {
          if (used.has(j) || t.mode !== s.mode) return;
          if (haver(s.lat, s.lon, t.lat, t.lon) < 80) { cluster.push(t); used.add(j); }
        });
        const lat = cluster.reduce((a, c) => a + c.lat, 0) / cluster.length;
        const lon = cluster.reduce((a, c) => a + c.lon, 0) / cluster.length;
        const name = cluster.slice().sort((a, b) => a.name.length - b.name.length)[0].name;
        pts.push([lat, lon]);
        L.marker([lat, lon], { icon: _makeStopIcon(s.mode, cluster.length) })
          .bindTooltip(name, { permanent: true, direction: 'top', offset: [0, -15], className: 'map-label' })
          .addTo(_bLayer);
      });
    }

    if (r2.status === 'fulfilled') {
      r2.value.forEach(s => {
        pts.push([s.lat, s.lon]);
        L.marker([s.lat, s.lon], { icon: _makeBikeIcon(s.bikes, s.ebikes) })
          .bindTooltip(s.name, { permanent: true, direction: 'top', offset: [0, -18], className: 'map-label' })
          .addTo(_bLayer);
      });
    }

    if (r3.status === 'fulfilled') {
      r3.value.forEach(v => {
        pts.push([v.lat, v.lon]);
        L.marker([v.lat, v.lon], { icon: _makeScooterIcon(v.operator, v.battery) }).addTo(_bLayer);
      });
    }

    if (r4.status === 'fulfilled' && r4.value) {
      const { lat, lon } = r4.value;
      pts.push([lat, lon]);
      L.marker([lat, lon], { icon: _makeDestIcon() })
        .bindTooltip(destName, { permanent: true, direction: 'top', offset: [0, -32], className: 'map-label' })
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
function _decodePoly(str) {
  const out = []; let lat = 0, lng = 0, i = 0;
  while (i < str.length) {
    let b, s = 0, r = 0;
    do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << s; s += 5; } while (b >= 0x20);
    lat += (r & 1) ? ~(r >> 1) : (r >> 1); r = 0; s = 0;
    do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << s; s += 5; } while (b >= 0x20);
    lng += (r & 1) ? ~(r >> 1) : (r >> 1);
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

function _drawWalkRoute(fromLL, toLL, destName) {
  if (!_bMap) return;
  const key = fromLL.lat + ',' + fromLL.lon + '→' + toLL.lat + ',' + toLL.lon;
  if (_walkRouteKey === key) return;
  _walkRouteKey = key;

  if (_bLayer) _bLayer.clearLayers();

  L.circleMarker([fromLL.lat, fromLL.lon], {
    radius: 8, color: '#f5b840', fillColor: '#f5b840', fillOpacity: 0.9, weight: 2,
  }).bindTooltip('Avreisested', { className: 'map-label' }).addTo(_bLayer);

  L.marker([toLL.lat, toLL.lon], { icon: _makeDestIcon() })
    .bindTooltip(destName, { permanent: true, direction: 'top', offset: [0, -32], className: 'map-label' })
    .addTo(_bLayer);

  if (!_bUserMoved) {
    _bMap.fitBounds([[fromLL.lat, fromLL.lon], [toLL.lat, toLL.lon]], { padding: [44, 44], maxZoom: 17 });
    _bFitted = true;
  }

  // Foot route from Entur OTP3 — uses Norwegian OSM pedestrian data, same API already in use
  const q = '{trip(from:{coordinates:{latitude:' + fromLL.lat + ',longitude:' + fromLL.lon + '}}' +
    'to:{coordinates:{latitude:' + toLL.lat + ',longitude:' + toLL.lon + '}}' +
    'modes:{directMode:foot}numTripPatterns:1){tripPatterns{legs{pointsOnLink{points}}}}}';
  fetch(config.api.journeyPlanner, {
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
      const latlngs = _decodePoly(pts);
      L.polyline(latlngs, { color: '#f5b840', weight: 3, opacity: 0.85, dashArray: '7 6' }).addTo(_bLayer);
      if (!_bUserMoved) _bMap.fitBounds(latlngs, { padding: [44, 44], maxZoom: 17 });
    })
    .catch(() => {
      if (!_bLayer) return;
      L.polyline([[fromLL.lat, fromLL.lon], [toLL.lat, toLL.lon]], {
        color: '#f5b840', weight: 2, opacity: 0.45, dashArray: '6 7',
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
    el.textContent = (fromLabel ? fromLabel + ' · ' : '') + wk.mins + ' min gange';
    el.style.display = 'block';
  } else if (state.gpsError === 'denied' && dir.key === 'out') {
    el.textContent = 'posisjon: ikke tilgjengelig';
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

export function renderBoard() {
  renderAlerts();
  renderWalkSummary();
  renderModeFilter();
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

  const activeModes = ['metro', 'tram', 'bus'].filter(m => modes[m]);
  const list = document.getElementById('dep-list');
  if (!activeModes.length) {
    list.innerHTML = '';
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
    const msg = state.lastFetch !== null ? 'ingen ruter funnet' : 'kobler til…';
    list.innerHTML = '<div class="state-msg">' + msg + '</div>';
    return;
  }
  const now = Date.now();
  const walkActive = isWalkActive(dir);

  // For each departure minute keep only the route with the earliest arrival.
  const indexed = state.deps.map((c, i) => ({ c, origIdx: i }));
  indexed.sort((a, b) =>
    new Date(a.c.expectedDepartureTime).getTime() - new Date(b.c.expectedDepartureTime).getTime()
  );
  const depMinMap = new Map();
  indexed.forEach(({ c, origIdx }) => {
    const depMin = Math.floor(new Date(c.expectedDepartureTime).getTime() / 60000);
    const arrMs  = c._finalArrival ? new Date(c._finalArrival).getTime() : Infinity;
    const cur    = depMinMap.get(depMin);
    if (!cur || arrMs < cur.arrMs) depMinMap.set(depMin, { c, origIdx, arrMs });
  });
  let visibleDeps = Array.from(depMinMap.values());
  if (activeModes.length < 3) {
    visibleDeps = visibleDeps.filter(({ c }) => activeModes.includes(_depMode(c)));
  }
  if (!visibleDeps.length) {
    list.innerHTML = '<div class="state-msg">ingen avganger for valgte modi</div>';
    return;
  }

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

  _depMap.clear();
  visibleDeps.forEach(v => _depMap.set(v.c.expectedDepartureTime, v.c));

  let html = '';
  let urgentShown = false;
  visibleDeps.forEach(({ c, origIdx }) => {
    const depId = c.expectedDepartureTime;
    const depTs = new Date(c.expectedDepartureTime).getTime();
    const diffSec = Math.floor((depTs - now) / 1000);
    const mins = Math.floor(Math.max(0, diffSec) / 60);
    const secs = Math.max(0, diffSec) % 60;
    const isNow = diffSec <= 0, urgent = diffSec > 0 && mins <= 2;
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
    const isCancelled = c.cancellation;
    const missed = rcls === 'missed';
    const tooEarlyForPlan = planMinDepTs !== null && depTs < planMinDepTs;
    const rowCls = 'dep-row' + (isCancelled ? ' cancelled' : missed ? ' missed' : rcls ? ' ' + rcls : '') + (tooEarlyForPlan ? ' plan-early' : '');
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
    const a11yLabel = lc + ' mot ' + dest + ', avgang om ' + minsLabel + (quay !== '?' ? ', spor ' + quay : '');

    const isClock = mins >= 60;
    html += '<div class="' + rowCls + '"'
      + (isCancelled
        ? ''
        : ' onclick="window.tapDepId(\'' + depId + '\')"'
          + ' role="button" tabindex="0"'
          + ' aria-label="' + esc(a11yLabel) + '"'
          + ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();window.tapDepId(\'' + depId + '\')}"'
      ) + '>'
      + '<div class="dep-mins' + (urgent ? ' urgent' : '') + (isNow ? ' now' : '') + (isClock ? ' clock' : '') + '">'
      + (() => {
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
      + '</div>'
      + '</div>'
      + '<div class="dep-info">'
      + '<span class="dep-dest">' + esc(dest) + '</span>'
      + (xferCount ? '<span class="dep-tag">' + xferCount + (xferCount === 1 ? ' bytte' : ' bytter') + '</span>' : '')
      + (delayed ? '<span class="dep-tag">+' + delayMins + ' min</span>' : '')
      + (c.cancellation ? '<span class="dep-cancelled">innstilt</span>' : '')
      + (tooEarlyForPlan ? '<span class="dep-cancelled">før forrige etappe</span>' : '')
      + '</div>'
      + (showReach
        ? '<div class="dep-reach ' + rcls + '">'
          + (rcls === 'r-ok' || rcls === 'r-soon' ? 'gå om ' + fmtMins(mtl) : 'gå nå')
          + '</div>'
        : '')
      + '</div>'
      + '<div class="dep-spor"><div class="sl">spor</div><div class="sn">' + quay + '</div></div>'
      + '</div>';
  });
  list.innerHTML = html;
}

export function startBoard() {
  state.deps = [];
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

function _fetchBoard() {
  const dir = config.dirs[state.dIdx];
  if (dir.toGeo || dir.toStopId || (dir._toLat && dir._toLon)) {
    fetchTrip(dir, (patterns, situations) => {
      // Populate statLL from geocoded departure coords (covers GPS-unavailable + walkFromLL path)
      if (dir._fromLat && dir._fromLon) {
        state.statLL[dir.key] = { lat: dir._fromLat, lon: dir._fromLon };
        window._updateWalkDbg && window._updateWalkDbg();
      }
      state.serviceAlerts = situations || [];
      logMsg('situations: ' + state.serviceAlerts.length, state.serviceAlerts.length ? 'ok' : null);
      const adapted = patterns.map(adaptTripPattern).filter(Boolean);
      logMsg('✓ ' + adapted.length + ' trip patterns', 'ok');
      state.deps = adapted;
      state.lastFetch = Date.now();
      document.getElementById('board-error').style.display = 'none';
    }, (msg) => {
      const be = document.getElementById('board-error');
      be.style.display = 'block';
      be.textContent = msg;
    });
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
    document.getElementById('board-error').style.display = 'none';
    setDot('ok');
  }, (msg) => {
    const be = document.getElementById('board-error');
    be.style.display = 'block';
    be.textContent = msg;
  });
}

window.tapDepId = (id) => { const dep = _depMap.get(id); if (dep) window.tap(dep); };
window._startBoard = startBoard;
window._fetchBoard = _fetchBoard;
