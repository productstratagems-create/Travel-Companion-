import config from '../config.js';
import { state, intervals } from '../state.js';
import { findArr, haver, loadWalkSpeed, loadWalkBuffer, SPEED_MPN, loadWeekendMode } from '../geo.js';
import { fetchTrack, geocodePlace, fetchArrBoard, resolveToStop } from '../api/entur.js';
import { quayLatLon } from '../api/adapt.js';
import { fetchBysykkel } from '../api/bysykkel.js';
import { fetchWeather, forecastAt, weatherAdvice } from '../api/weather.js';
import { fetchNearbyPlaces, timeCategory, PLACE_CATS, placeEmoji } from '../api/places.js';
import { logMsg } from '../ui/log.js';
import { show } from '../ui/nav.js';
import { startBoard, _interpolateVehiclePos } from './board.js';
import { makeVehicleIcon, makeRouteStopIcon } from '../ui/mapIcons.js';
import { snapToCorridor } from '../ui/corridor.js';
import { renderAlerts } from '../ui/alerts.js';
import { fmtMins, makeSuggBtn, esc } from '../ui/fmt.js';
import L from 'leaflet';
import { fetchWalkRoute } from '../api/route.js';
import { addCompass } from '../ui/mapCompass.js';

function pad(n) { return String(n).padStart(2, '0'); }
function clk(v) { const d = new Date(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

let expanded = [];

let _walkDestLL = null;
let _walkTimer  = null;
let _walkAbort  = null;

const _TILE = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const RECENT_KEY = 't.recentDests';

let _arrBoard = null;
let _arrBoardStopId = null;
let _arrBoardInterval = null;
let _tCardsHtml = '';
let _tWeatherHtml = '';

let _arrWeather = null;
let _nearbyPlaces = null;
let _placesCat = null;   // currently active PLACE_CATS entry
let _placesLL = null;    // coords used for last places fetch
let _arrMap = null;
let _arrWalkMarker = null;
let _arrRouteLine = null;
let _arrLL = null;
let _bikeLayer = null;
let _placesLayer = null;
let _userMarker = null;
let _arrUserMoved = false;

let _tMap = null;
let _tLayer = null;
let _tVehicleMarker = null;
let _tUserMarker = null;
let _tRoutePts = null;
let _tSnapDist = null;
let _tMapKey = null;

// How long a tapped stop's name tooltip stays visible on the tracking map —
// matches the board map's route-stop tooltip behaviour.
const _T_ROUTE_STOP_TOOLTIP_MS = 3000;

function _destroyArrMap() {
  if (_arrBoardInterval) { clearInterval(_arrBoardInterval); _arrBoardInterval = null; }
  _arrBoard = null; _arrBoardStopId = null;
  _arrWeather = null;
  _nearbyPlaces = null;
  _placesCat = null;
  _placesLL = null;
  if (_arrMap) { _arrMap.remove(); _arrMap = null; _arrWalkMarker = null; _arrRouteLine = null; _arrLL = null; _bikeLayer = null; _placesLayer = null; _userMarker = null; }
  _arrUserMoved = false;
}

function _destroyTrackMap() {
  if (_tMap) { _tMap.remove(); _tMap = null; _tLayer = null; _tVehicleMarker = null; _tUserMarker = null; }
  _tRoutePts = null;
  _tSnapDist = null;
  _tMapKey = null;
}

// A leg's serviceJourney calls cover the whole physical vehicle run, which
// often extends well past where this leg's journey segment actually ends
// (e.g. the train continues past the transfer stop). Trim to just the
// fromStation→toStation span so the map reflects the user's own journey.
function _legRouteStops(leg) {
  if (!leg || !leg.stops || !leg.stops.length) return [];
  const from = normStn(leg.fromStation || '');
  const to = normStn(leg.toStation || '');
  if (!from && !to) return leg.stops;
  let pastFrom = !leg.fromStation;
  const out = [];
  for (const s of leg.stops) {
    const nm = (s.quay && s.quay.stopPlace && s.quay.stopPlace.name) || '?';
    if (!pastFrom) {
      if (normStn(nm) === from) pastFrom = true;
      else continue;
    }
    out.push(s);
    if (to && normStn(nm) === to) break;
  }
  return out.length >= 2 ? out : leg.stops;
}

function _legRoutePts(leg) {
  const pts = [];
  const stops = [];
  _legRouteStops(leg).forEach(s => {
    const sp = s.quay && s.quay.stopPlace;
    const ll = quayLatLon(s.quay);
    if (!ll) return;
    const last = pts[pts.length - 1];
    if (last && last[0] === ll.lat && last[1] === ll.lon) return;
    pts.push([ll.lat, ll.lon]);
    if (sp && sp.name) stops.push({ lat: ll.lat, lon: ll.lon, name: sp.name });
  });
  return { pts, stops };
}

function _trackMapStructKey(legs, fromIdx) {
  return legs.slice(fromIdx).map(leg => {
    if (!leg || !leg.stops || !leg.stops.length) return leg && leg.journeyId || '';
    const { pts } = _legRoutePts(leg);
    if (!pts.length) return leg.journeyId || '';
    const first = pts[0], last = pts[pts.length - 1];
    return (leg.journeyId || '') + '|' + pts.length + ':' + first.join(',') + ':' + last.join(',');
  }).join('|');
}

// Live position of the vehicle the user is currently riding, shown on its
// route corridor. Only relevant while actually riding — hidden during
// platform waits or after arrival.
function _renderTrackMap(now, cs, legs) {
  const wrap = document.getElementById('t-map-wrap');
  const mapEl = document.getElementById('t-map');
  if (!wrap || !mapEl) return;

  const leg = cs.phase === 'riding' ? legs[cs.i] : null;
  const { pts, stops } = leg ? _legRoutePts(leg) : { pts: [], stops: [] };

  if (!leg || pts.length < 2) {
    wrap.style.display = 'none';
    _destroyTrackMap();
    return;
  }

  wrap.style.display = 'block';

  const key = _trackMapStructKey(legs, cs.i);
  if (key !== _tMapKey || !_tMap) {
    _tMapKey = key;
    _destroyTrackMap();
    _tMapKey = key;
    _tMap = L.map(mapEl, { zoomControl: true, attributionControl: false, zoomControlOptions: { position: 'topleft' }, rotate: true, touchRotate: true, rotateControl: false });
    L.tileLayer(_TILE, { subdomains: 'abcd' }).addTo(_tMap);
    _tLayer = L.layerGroup().addTo(_tMap);
    addCompass(_tMap, mapEl);
    const lineColor = leg.lineBg || '#7c2d12';
    L.polyline(pts, { color: lineColor, weight: 4, opacity: 0.6, lineCap: 'round' }).addTo(_tLayer);
    const first = pts[0], last = pts[pts.length - 1];
    const allPts = pts.slice();

    // Intermediate stop dots along the line. Names stay hidden until tapped so
    // the corridor doesn't fill with permanent labels — same pattern as the
    // board map's route stops.
    const addStopMarkers = (stopList, color) => {
      stopList.forEach(s => {
        const marker = L.marker([s.lat, s.lon], { icon: makeRouteStopIcon(color) }).addTo(_tLayer);
        const tooltip = L.tooltip({ className: 'map-label' }).setLatLng([s.lat, s.lon]).setContent(esc(s.name));
        let hideTimer = null;
        marker.on('click', () => {
          if (hideTimer) clearTimeout(hideTimer);
          _tMap.openTooltip(tooltip);
          hideTimer = setTimeout(() => _tMap.closeTooltip(tooltip), _T_ROUTE_STOP_TOOLTIP_MS);
        });
      });
    };
    addStopMarkers(stops.slice(1, -1), lineColor);

    L.circleMarker(first, { radius: 6, color: '#fff', fillColor: lineColor, fillOpacity: 0.9, weight: 2 }).addTo(_tLayer);

    // Draw the rest of the journey's legs (after the transfer) as a lighter,
    // dashed corridor in each leg's own line colour, so the map reflects the
    // whole onward journey — not just the vehicle currently being ridden.
    for (let j = cs.i + 1; j < legs.length; j++) {
      const nextLeg = legs[j];
      const { pts: nPts, stops: nStops } = _legRoutePts(nextLeg);
      if (nPts.length < 2) continue;
      const nColor = nextLeg.lineBg || '#7c2d12';
      L.polyline(nPts, { color: nColor, weight: 3, opacity: 0.35, lineCap: 'round', dashArray: '1,8' }).addTo(_tLayer);
      addStopMarkers(nStops.slice(1, -1), nColor);
      allPts.push(...nPts);
      // Transfer point between this leg and the previous one
      L.circleMarker(nPts[0], { radius: 6, color: '#fff', fillColor: nColor, fillOpacity: 0.9, weight: 2 }).addTo(_tLayer);
      if (j === legs.length - 1) {
        L.circleMarker(nPts[nPts.length - 1], { radius: 6, color: '#fff', fillColor: '#f5b840', fillOpacity: 0.9, weight: 2 }).addTo(_tLayer);
      }
    }
    // Current leg is the final leg — mark its end as the destination.
    if (cs.i === legs.length - 1) {
      L.circleMarker(last, { radius: 6, color: '#fff', fillColor: '#f5b840', fillOpacity: 0.9, weight: 2 }).addTo(_tLayer);
    }

    // Remember the corridor so the live user-position dot can snap onto it.
    // Rail/tram tracks aren't drawn by the basemap so the straight stop-to-stop
    // segments only approximate them — use a looser snap than for buses.
    _tRoutePts = pts;
    _tSnapDist = leg.mode === 'bus' ? 25 : 50;

    _tMap.fitBounds(allPts, { padding: [28, 28], maxZoom: 16 });
    setTimeout(() => _tMap && _tMap.invalidateSize(), 100);

    const expandBtn = document.getElementById('t-map-expand');
    if (expandBtn) {
      expandBtn.onclick = () => {
        const exp = mapEl.classList.toggle('expanded');
        expandBtn.textContent = exp ? '✕' : '⤢';
        expandBtn.setAttribute('aria-label', exp ? 'Minimer kart' : 'Utvid kart');
        setTimeout(() => _tMap && _tMap.invalidateSize(), 320);
      };
    }
  }

  if (!_tMap) return;
  const pos = _interpolateVehiclePos(_legRouteStops(leg), now);
  if (pos) {
    if (_tVehicleMarker) {
      _tVehicleMarker.setLatLng([pos.lat, pos.lon]);
    } else {
      _tVehicleMarker = L.marker([pos.lat, pos.lon], { icon: makeVehicleIcon(leg.mode, leg.lineCode, leg.lineBg) }).addTo(_tLayer);
    }
  } else if (_tVehicleMarker) {
    _tVehicleMarker.remove();
    _tVehicleMarker = null;
  }

  // User's live position, snapped onto the line when close enough — while
  // riding this sits on the train; off the line (e.g. just before boarding)
  // it falls back to the raw GPS fix.
  const userPos = state.homeLL || state.walkFromLL;
  if (userPos) {
    const snapped = snapToCorridor(userPos, _tRoutePts, _tSnapDist) || userPos;
    if (_tUserMarker) {
      _tUserMarker.setLatLng([snapped.lat, snapped.lon]);
    } else {
      _tUserMarker = L.circleMarker([snapped.lat, snapped.lon], {
        radius: 6, color: '#fff', fillColor: '#60a5fa', fillOpacity: 0.95, weight: 2,
      }).bindTooltip('Din posisjon', { className: 'map-label' }).addTo(_tLayer);
    }
  } else if (_tUserMarker) {
    _tUserMarker.remove();
    _tUserMarker = null;
  }
}

function loadRecentDests() {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

function saveRecentDest(dest) {
  const list = loadRecentDests().filter(d => d.label !== dest.label);
  list.unshift(dest);
  if (list.length > 5) list.pop();
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch {}
}

function _fetchArrBoardData() {
  if (!_arrBoardStopId) return;
  fetchArrBoard(_arrBoardStopId).then(deps => {
    _arrBoard = deps;
    _updateArrBoardSection();
  }).catch(() => {});
}

function _renderArrBoardHtml() {
  if (!_arrBoard) return '<div class="hn-loading">laster avganger…</div>';
  if (!_arrBoard.length) return '<div class="hn-loading">ingen avganger</div>';
  const now = Date.now();
  return _arrBoard.slice(0, 8).map(c => {
    const mins = Math.floor((c.depTs - now) / 60000);
    if (mins > 90) return '';
    const lc = (c.ln && c.ln.publicCode) || '?';
    const bg = (c.ln && c.ln.presentation && c.ln.presentation.colour) ? '#' + c.ln.presentation.colour : '#7c2d12';
    const minsHtml = mins <= 0 ? 'NÅ' : mins + '<span>min</span>';
    return '<div class="hn-arr-row">'
      + '<div class="hn-arr-mins">' + minsHtml + '</div>'
      + '<div class="hn-arr-mid">'
      + '<span class="line-badge" style="background:' + bg + '">' + lc + '</span>'
      + '<span class="hn-arr-dest">' + esc(c.dest) + '</span>'
      + '</div>'
      + (c.quay && c.quay !== '?' ? '<div class="hn-arr-spor">spor ' + c.quay + '</div>' : '<div></div>')
      + '</div>';
  }).join('');
}

function _updateArrBoardSection() {
  const el = document.getElementById('hn-arr-board');
  if (el) el.innerHTML = _renderArrBoardHtml();
}

function _addArrBoardSection(arrStation) {
  if (document.getElementById('hn-arr-board')) return;
  const nb = document.getElementById('t-new-btn');
  if (!nb || !nb.parentNode) return;
  const div = document.createElement('div');
  div.className = 'hn-section';
  div.innerHTML = '<div class="hn-section-label">avganger fra ' + esc(displayStn(arrStation)) + '</div>'
    + '<div id="hn-arr-board">' + _renderArrBoardHtml() + '</div>';
  nb.parentNode.insertBefore(div, nb);
}

function _updateUserMarker() {
  if (!_arrMap || !state.homeLL) return;
  if (_userMarker) {
    _userMarker.setLatLng([state.homeLL.lat, state.homeLL.lon]);
  } else {
    _userMarker = L.circleMarker([state.homeLL.lat, state.homeLL.lon], {
      radius: 7, color: '#fff', fillColor: '#60a5fa', fillOpacity: 0.95, weight: 2,
    }).bindTooltip('Din posisjon', { className: 'map-label' }).addTo(_arrMap);
  }
}

function _initArrMap(arrLL) {
  const el = document.getElementById('hn-map');
  if (!el || !arrLL) return;
  if (_arrMap) return; // already initialized — use _addBikeMarkers to update
  _arrLL = arrLL;
  _arrUserMoved = false;
  _arrMap = L.map(el, { zoomControl: true, attributionControl: false, zoomControlOptions: { position: 'topleft' }, rotate: true, touchRotate: true, rotateControl: false });
  _arrMap.on('dragstart', () => { _arrUserMoved = true; });
  L.tileLayer(_TILE, { subdomains: 'abcd', attribution: '© CartoDB' }).addTo(_arrMap);
  L.control.scale({ imperial: false, maxWidth: 100, position: 'bottomleft' }).addTo(_arrMap);
  addCompass(_arrMap, el);
  // Arrival station marker — last transit leg's line badge
  const jLegs = state.jny && state.jny.legs;
  const jLast = jLegs && jLegs[jLegs.length - 1];
  const arrCode = (jLast && jLast.lineCode) || '?';
  const arrBg   = (jLast && jLast.lineBg)   || '#7c2d12';
  const arrMode = (jLast && jLast.mode)      || 'metro';
  L.marker([arrLL.lat, arrLL.lon], { icon: _makeTransitStopIcon(arrCode, arrBg, arrMode) }).addTo(_arrMap);
  _fitArrMap(arrLL);

  // Expand toggle
  const expandBtn = document.getElementById('hn-map-expand');
  if (expandBtn) {
    expandBtn.onclick = () => {
      const expanded = el.classList.toggle('expanded');
      expandBtn.textContent = expanded ? '✕' : '⤢';
      expandBtn.setAttribute('aria-label', expanded ? 'Minimer kart' : 'Utvid kart');
      expandBtn.title = expanded ? 'Minimer kart' : 'Utvid kart';
      setTimeout(() => _arrMap && _arrMap.invalidateSize(), 320);
    };
  }
}

function _fitArrMap(arrLL) {
  if (!_arrMap || _arrUserMoved) return;
  const pts = [[arrLL.lat, arrLL.lon]];
  if (_walkDestLL) pts.push([_walkDestLL.lat, _walkDestLL.lon]);
  if (pts.length === 1) { _arrMap.setView(pts[0], 15); return; }
  _arrMap.fitBounds(pts, { padding: [24, 24], maxZoom: 16 });
}

function _addBikeMarkers(arrLL) {
  fetchBysykkel(arrLL.lat, arrLL.lon).then(stations => {
    if (!_arrMap || !stations.length) return;
    if (_bikeLayer) { _bikeLayer.clearLayers(); } else { _bikeLayer = L.layerGroup().addTo(_arrMap); }
    stations.forEach(s => {
      const count = s.bikes + (s.ebikes || 0);
      const icon = L.divIcon({
        className: '',
        html: '<div class="hn-map-bike' + (count === 0 ? ' empty' : '') + '">' + count + '</div>',
        iconAnchor: [14, 14],
      });
      L.marker([s.lat, s.lon], { icon })
        .bindTooltip(s.name + ' · ' + count + ' sykler · ' + s.dist + ' m', { direction: 'top', offset: [0, -20], className: 'map-label' })
        .addTo(_bikeLayer);
    });
  }).catch(() => {});
}

function _updateArrMapWalkPin(arrLL) {
  if (!_arrMap || !_walkDestLL) return;
  if (_arrWalkMarker) _arrWalkMarker.remove();
  if (_arrRouteLine) { _arrRouteLine.remove(); _arrRouteLine = null; }
  _arrWalkMarker = L.circleMarker([_walkDestLL.lat, _walkDestLL.lon], { radius: 7, color: '#60a5fa', fillColor: '#60a5fa', fillOpacity: 0.85, weight: 2 }).addTo(_arrMap);
  if (arrLL) _fitArrMap(arrLL);
  // Fetch routed walking path from arrival station to typed destination
  fetchWalkRoute(arrLL, _walkDestLL).then(pts => {
    if (!_arrMap || !pts) return;
    if (_arrRouteLine) _arrRouteLine.remove();
    _arrRouteLine = L.polyline(pts, { color: '#60a5fa', weight: 3, opacity: 0.8 }).addTo(_arrMap);
    if (!_arrUserMoved) _arrMap.fitBounds(pts, { padding: [24, 24] });
  }).catch(() => {});
}

function _makeTransitStopIcon(code, bg, mode) {
  const modeLabel = mode === 'bus' ? 'BUS' : mode === 'tram' ? 'TRIKK' : 'T-BANE';
  const html = '<div style="text-align:center;line-height:1;white-space:nowrap;transform:translate(-50%,-50%)">'
    + '<span class="line-badge" style="background:' + bg + ';font-size:13px;padding:4px 9px">' + code + '</span>'
    + '<div style="font-size:8px;color:#444;font-family:JetBrains Mono,monospace;letter-spacing:.08em;margin-top:3px">' + modeLabel + '</div>'
    + '</div>';
  return L.divIcon({ className: '', html, iconSize: [0, 0], iconAnchor: [0, 0] });
}

function normStn(s) { return s.toLowerCase().replace(/,.*$/, '').replace(/\s+t$/i, '').trim(); }
function displayStn(s) { return String(s).replace(/,.*$/, '').trim(); }

function renderStopRow(r, isNext) {
  const tag = r.isTransfer ? '<span class="stop-tag bytt-tag">bytt</span>'
    : r.isDest ? '<span class="stop-tag">stå av</span>'
    : isNext ? '<span class="stop-tag">neste</span>' : '';
  const cls = r.isTransfer ? ' transfer' : r.isDest ? ' dest' : isNext ? ' next' : '';
  return '<div class="stop' + cls + '">'
    + '<div class="stop-dot"></div>'
    + '<div class="stop-name">' + tag + r.nm + '</div>'
    + '<div class="stop-clock">' + (r.arrT ? clk(r.arrT) : '—') + '</div>'
    + '<div class="stop-rel">' + r.relTxt + '</div>'
    + '</div>';
}

// DOM-safe walk result — avoids innerHTML XSS from external label strings
function _applyWalkResult() {
  const res = document.getElementById('t-walk-result');
  if (!res) return;
  while (res.firstChild) res.removeChild(res.firstChild);
  if (!_walkDestLL) return;
  const pos = _arrLL || state.homeLL || state.walkFromLL;
  if (!pos) {
    const el = document.createElement('span');
    el.className = 'hn-walk-mins';
    el.textContent = '? min';
    res.appendChild(el);
    return;
  }
  const d = haver(pos.lat, pos.lon, _walkDestLL.lat, _walkDestLL.lon);
  const spd = SPEED_MPN[loadWalkSpeed()] || 83.33;
  const mins = Math.max(1, Math.ceil(d * 1.3 / spd)) + loadWalkBuffer();
  const mEl = document.createElement('span');
  mEl.className = 'hn-walk-mins';
  mEl.textContent = mins + ' min';
  const tEl = document.createElement('span');
  tEl.className = 'hn-walk-to';
  tEl.textContent = ' til ' + _walkDestLL.label;
  res.appendChild(mEl);
  res.appendChild(tEl);
  // Update map walk-destination pin after layout settles
  _resolveArrivalLL().then(arrLL => _updateArrMapWalkPin(arrLL));
}

function _onWalkInput() {
  const q = (document.getElementById('t-walk-dest') || {}).value.trim();
  const sugg = document.getElementById('t-walk-sugg');
  if (!sugg) return;
  clearTimeout(_walkTimer);
  if (_walkAbort) { _walkAbort.abort(); _walkAbort = null; }
  if (q.length < 2) { sugg.hidden = true; sugg.innerHTML = ''; return; }
  _walkTimer = setTimeout(() => {
    const thisAbort = new AbortController();
    _walkAbort = thisAbort;
    geocodePlace(q).then(results => {
      if (thisAbort.signal.aborted) return;
      sugg.innerHTML = '';
      if (!results.length) { sugg.hidden = true; return; }
      results.slice(0, 5).forEach(r => {
        sugg.appendChild(makeSuggBtn(r.label, r.category || [], () => {
          _walkDestLL = { lat: r.lat, lon: r.lon, label: r.label };
          saveRecentDest(_walkDestLL);
          const inp = document.getElementById('t-walk-dest');
          if (inp) inp.value = r.label;
          sugg.hidden = true;
          sugg.innerHTML = '';
          _applyWalkResult();
        }));
      });
      sugg.hidden = false;
    }).catch(() => {});
  }, 250);
}

// Resolve arrival coordinates: use stored coords from settings if available, else geocode the
// destination name, else fall back to homeLL. Needed because homeLL holds the origin GPS position,
// not the destination.
function _resolveArrivalLL() {
  const dir = config.dirs[state.dIdx];
  if (dir._toLat && dir._toLon) return Promise.resolve({ lat: dir._toLat, lon: dir._toLon });
  if (state.jny && state.jny._toLat && state.jny._toLon) {
    return Promise.resolve({ lat: state.jny._toLat, lon: state.jny._toLon });
  }
  if (dir.to) {
    return geocodePlace(dir.to)
      .then(r => r[0] ? { lat: r[0].lat, lon: r[0].lon } : (state.homeLL || null))
      .catch(() => state.homeLL || null);
  }
  return Promise.resolve(state.homeLL || null);
}

function _placesSectionHtml() {
  if (!_nearbyPlaces) return '<div class="hn-loading">laster steder…</div>';
  if (!_nearbyPlaces.length) return '<div class="hn-loading">ingen steder funnet i nærheten</div>';
  return _nearbyPlaces.map(p =>
    '<div class="hn-place-row">'
    + '<span class="hn-place-emoji">' + p.emoji + '</span>'
    + '<span class="hn-place-name">' + esc(p.name) + '</span>'
    + '<span class="hn-place-dist">' + (p.dist < 1000 ? p.dist + ' m' : (p.dist / 1000).toFixed(1) + ' km') + '</span>'
    + '</div>'
  ).join('');
}

function _catPillsHtml(activeCatIdx) {
  return '<div class="hn-place-cats">'
    + PLACE_CATS.map((c, i) =>
        '<button class="hn-place-cat' + (i === activeCatIdx ? ' active' : '') + '"'
        + ' onclick="window._switchPlacesCat(' + i + ')">'
        + c.emoji + ' ' + c.label + '</button>'
      ).join('')
    + '</div>';
}

function _addPlacesMarkers(places) {
  if (!_arrMap) return;
  if (_placesLayer) { _placesLayer.clearLayers(); } else { _placesLayer = L.layerGroup().addTo(_arrMap); }
  if (!places || !places.length) return;
  places.forEach(p => {
    const icon = L.divIcon({
      className: '',
      html: '<div class="hn-map-place">' + p.emoji + '</div>',
      iconAnchor: [14, 14],
    });
    L.marker([p.lat, p.lon], { icon })
      .bindTooltip(p.name + ' · ' + (p.dist < 1000 ? p.dist + ' m' : (p.dist / 1000).toFixed(1) + ' km'),
        { direction: 'top', offset: [0, -20], className: 'map-label' })
      .addTo(_placesLayer);
  });
}

function _updatePlacesSection() {
  const el = document.getElementById('hn-places-content');
  if (el) el.innerHTML = _placesSectionHtml();
  _addPlacesMarkers(_nearbyPlaces);
}

function _weatherSectionHtml() {
  if (!_arrWeather) return '<div class="hn-loading">laster vær…</div>';
  if (_arrWeather._err) return '<div class="hn-loading">vær utilgjengelig</div>';
  const w = _arrWeather;
  const main = (w.icon ? w.icon + ' ' : '') + w.temp + '°'
    + (w.wind >= 12 ? ' · ' + w.wind + ' m/s vind' : '')
    + (w.precip >= 0.3 ? ' · ' + w.precip.toFixed(1) + ' mm' : '');
  return '<div class="hn-weather-main">' + main + '</div>'
    + (w.advice ? '<div class="hn-weather-adv">' + w.advice + '</div>' : '');
}

// Called when user taps a category pill
window._switchPlacesCat = (catIdx) => {
  _placesCat = PLACE_CATS[catIdx];
  // Update pill highlights
  document.querySelectorAll('.hn-place-cat').forEach((b, i) => b.classList.toggle('active', i === catIdx));
  // Update section label
  const lbl = document.getElementById('hn-places-label');
  if (lbl) lbl.textContent = _placesCat.emoji + ' ' + _placesCat.label;
  // Re-fetch (cache handles deduplication)
  if (!_placesLL) return;
  _nearbyPlaces = null;
  const el = document.getElementById('hn-places-content');
  if (el) el.innerHTML = '<div class="hn-loading">laster steder…</div>';
  fetchNearbyPlaces(_placesLL.lat, _placesLL.lon, _placesCat.amenities)
    .then(p => { _nearbyPlaces = p; _updatePlacesSection(); })
    .catch(() => {});
};

function _trackWeatherHtml() {
  if (!_arrWeather || _arrWeather._err) return '';
  const w = _arrWeather;
  const nowParts = [w.icon + ' ' + w.temp + '°'];
  if (w.wind >= 12) nowParts.push(w.wind + ' m/s');
  if (w.precip >= 0.3) nowParts.push(w.precip.toFixed(1) + ' mm');
  let html = '<span class="t-wx-now">' + nowParts.join(' · ') + '</span>';

  const arr = state.jny && state.jny.arrival;
  if (arr && w.forecast) {
    const arrTs = new Date(arr.time).getTime();
    if (arrTs > Date.now() + 15 * 60000) {
      const fc = forecastAt(w.forecast, arr.time);
      if (fc) {
        const fcAdv = weatherAdvice(fc.temp, fc.precip, fc.wind);
        const fcParts = [fc.icon + ' ' + fc.temp + '°'];
        if (fc.wind >= 12) fcParts.push(fc.wind + ' m/s');
        if (fc.precip >= 0.3) fcParts.push(fc.precip.toFixed(1) + ' mm');
        html += '<span class="t-wx-arr"> → ank. ' + fcParts.join(' · ') + '</span>';
        if (fcAdv && fcAdv !== w.advice) {
          html += '<span class="t-wx-adv">' + fcAdv + '</span>';
        }
      }
    }
  }

  if (w.advice) html += '<span class="t-wx-adv">' + w.advice + '</span>';

  return '<div class="t-weather-strip">' + html + '</div>';
}

function _updateWeatherSection() {
  const el = document.getElementById('hn-weather-content');
  if (el) el.innerHTML = _weatherSectionHtml();
  const tw = document.getElementById('t-weather');
  if (tw) tw.innerHTML = _trackWeatherHtml();
}

function renderNextPanel() {
  const el = document.getElementById('t-next');
  if (!el) return;
  const last = state.jny && state.jny.legs && state.jny.legs[state.jny.legs.length - 1];
  const arrStation = last ? last.toStation : '';

  const recents = loadRecentDests();
  const recentsHtml = recents.length
    ? '<div class="hn-recent-chips">'
      + recents.map(d => '<button class="hn-recent-chip" data-label="' + esc(d.label) + '">' + esc(d.label) + '</button>').join('')
      + '</div>'
    : '';

  const weekendMode = loadWeekendMode();
  const activeCatIdx = _placesCat ? PLACE_CATS.indexOf(_placesCat) : -1;
  const _cat = _placesCat || (weekendMode ? timeCategory() : null);

  el.innerHTML =
    '<div class="hn-panel">'
    + '<div class="hn-title">Hva nå?</div>'
    + '<div class="map-wrap"><div id="hn-map"></div><button class="map-expand-btn" id="hn-map-expand" aria-label="Utvid kart" title="Utvid kart">⤢</button></div>'
    + '<div class="hn-section">'
    + '<div class="hn-section-label">vær</div>'
    + '<div id="hn-weather-content">' + _weatherSectionHtml() + '</div>'
    + '</div>'
    + (weekendMode
      ? '<div class="hn-section">'
        + '<div class="hn-section-label" id="hn-places-label">' + (_cat ? _cat.emoji + ' ' + _cat.label : 'steder i nærheten') + '</div>'
        + _catPillsHtml(activeCatIdx >= 0 ? activeCatIdx : PLACE_CATS.indexOf(_cat))
        + '<div id="hn-places-content">' + _placesSectionHtml() + '</div>'
        + '</div>'
      : '')
    + '<div class="hn-section">'
    + '<div class="hn-section-label">gangavstand</div>'
    + recentsHtml
    + '<input class="hn-input" id="t-walk-dest" placeholder="hvor videre?" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"'
    + (_walkDestLL ? ' value="' + esc(_walkDestLL.label) + '"' : '') + '>'
    + '<div id="t-walk-sugg" class="stop-sugg" hidden></div>'
    + '<div id="t-walk-result"></div>'
    + '</div>'
    + '<button class="hn-new-btn" id="t-new-btn">ny reise fra ' + esc(displayStn(arrStation)) + ' →</button>'
    + '</div>';

  if (_walkDestLL) _applyWalkResult();

  const inp = document.getElementById('t-walk-dest');
  if (inp) {
    inp.addEventListener('input', _onWalkInput);
    inp.addEventListener('blur', () => {
      setTimeout(() => {
        const s = document.getElementById('t-walk-sugg');
        if (s) s.hidden = true;
      }, 150);
    });
  }
  document.querySelectorAll('.hn-recent-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = loadRecentDests().find(r => r.label === btn.dataset.label);
      if (!d) return;
      _walkDestLL = d;
      const inp2 = document.getElementById('t-walk-dest');
      if (inp2) inp2.value = d.label;
      const sugg2 = document.getElementById('t-walk-sugg');
      if (sugg2) { sugg2.hidden = true; sugg2.innerHTML = ''; }
      _applyWalkResult();
    });
  });

  const nb = document.getElementById('t-new-btn');
  if (nb) nb.addEventListener('click', () => {
    window._showSettings && window._showSettings();
    const depEl = document.getElementById('set-dep');
    if (depEl && arrStation) {
      depEl.value = displayStn(arrStation);
      const clrEl = document.getElementById('set-dep-clear');
      if (clrEl) clrEl.style.display = 'flex';
    }
    show('v-settings');
  });
}

// Returns { phase: 'riding'|'platform'|'arrived', i, next? }
function computeState(now) {
  const legs = state.jny && state.jny.legs;
  if (!legs || !legs.length) return { phase: 'arrived', i: 0 };
  for (let i = 0; i < legs.length; i++) {
    const arrTs = legs[i].arrTime ? new Date(legs[i].arrTime.time).getTime() : null;
    if (arrTs === null || now < arrTs) return { phase: 'riding', i };
    if (i === legs.length - 1) return { phase: 'arrived', i };
    const nextDepTs = legs[i + 1] && legs[i + 1].depTime
      ? new Date(legs[i + 1].depTime.time).getTime() : null;
    if (nextDepTs === null || now < nextDepTs) return { phase: 'platform', i, next: i + 1 };
  }
  return { phase: 'arrived', i: legs.length - 1 };
}

export function renderTrack() {
  renderAlerts();
  if (!state.jny || !state.jny.legs || !state.jny.legs.length) return;
  const now = Date.now();
  const legs = state.jny.legs;
  const cs = computeState(now);
  const { phase, i } = cs;

  // Auto-exit 5 min after final arrival — end the journey fully so the
  // chip, intervals and persisted state don't outlive the trip
  if (phase === 'arrived') {
    const lastLeg = legs[legs.length - 1];
    if (lastLeg.arrTime && now - new Date(lastLeg.arrTime.time).getTime() > 300000) {
      logMsg('reise fullført → ' + state.jny.dest, 'ok');
      window._clearJny && window._clearJny();
      show('v-board'); startBoard(); return;
    }
  }

  const nEl = document.getElementById('t-num');
  const lEl = document.getElementById('t-lbl');
  const cEl = document.getElementById('t-clock');
  const laEl = document.getElementById('t-label');

  if (phase === 'arrived') {
    nEl.textContent = 'ANKOMMET'; nEl.className = 'track-num arrived';
    lEl.textContent = state.jny.dest;
    cEl.textContent = ''; laEl.textContent = '';
  } else if (phase === 'riding') {
    const leg = legs[i];
    const isLastLeg = (i === legs.length - 1);
    const arrTs = leg.arrTime ? new Date(leg.arrTime.time).getTime() : null;
    const mLeft = arrTs !== null ? Math.floor((arrTs - now) / 60000) : null;
    if (mLeft !== null) {
      const ml = Math.max(0, mLeft);
      nEl.innerHTML = (() => {
        if (ml < 60) return ml + '<span class="cnt-unit">min</span>';
        const h = Math.floor(ml / 60), rm = ml % 60;
        return h + 't<span class="cnt-unit">' + (rm > 0 ? rm + 'm' : '') + '</span>';
      })();
      nEl.className = 'track-num' + (mLeft <= 2 ? ' urgent' : '');
      lEl.textContent = isLastLeg ? 'til ankomst' : (mLeft <= 0 ? 'gå av nå' : 'til bytte');
    } else {
      nEl.textContent = '—'; nEl.className = 'track-num'; lEl.textContent = 'venter på data';
    }
    if (leg.arrTime) {
      cEl.textContent = leg.arrTime.clk;
      laEl.textContent = isLastLeg
        ? 'ankommer ' + normStn(state.jny.dest)
        : 'bytt på ' + normStn(leg.toStation);
    } else { cEl.textContent = ''; laEl.textContent = ''; }
  } else { // platform
    const nextLeg = legs[cs.next];
    const depTs = nextLeg && nextLeg.depTime ? new Date(nextLeg.depTime.time).getTime() : null;
    const mToDep = depTs !== null ? Math.round((depTs - now) / 60000) : null;
    if (mToDep !== null) {
      const md = Math.max(0, mToDep);
      nEl.innerHTML = (() => {
        if (md < 60) return md + '<span class="cnt-unit">min</span>';
        const h = Math.floor(md / 60), rm = md % 60;
        return h + 't<span class="cnt-unit">' + (rm > 0 ? rm + 'm' : '') + '</span>';
      })();
      nEl.className = 'track-num' + (mToDep <= 1 ? ' urgent' : '');
      lEl.textContent = 'til avgang';
    } else {
      nEl.textContent = '—'; nEl.className = 'track-num'; lEl.textContent = 'venter på data';
    }
    if (nextLeg && nextLeg.depTime) {
      cEl.textContent = nextLeg.depTime.clk;
      laEl.textContent = 'avgang fra ' + normStn(nextLeg.fromStation) + (nextLeg.quay ? ' · spor ' + nextLeg.quay : '');
    } else { cEl.textContent = ''; laEl.textContent = ''; }
  }

  // ── Inner helpers (close over now / legs) ────────────────────────────────

  function renderStopRows(rows, cardIdx) {
    const TAIL = 2;
    let out = '', firstRendered = false;
    const exp = expanded[cardIdx];
    if (!exp && rows.length > TAIL + 1) {
      [rows[0], { isCollapse: true, count: rows.length - 1 - TAIL }, ...rows.slice(-TAIL)].forEach(r => {
        if (r.isCollapse) {
          out += '<button class="stop-collapse" onclick="window._expandStops&&window._expandStops(' + cardIdx + ')">· ' + r.count + ' stopp ·</button>';
          return;
        }
        const isNext = !firstRendered && !r.isTransfer && !r.isDest;
        if (isNext) firstRendered = true;
        out += renderStopRow(r, isNext);
      });
    } else {
      rows.forEach(r => {
        const isNext = !firstRendered && !r.isTransfer && !r.isDest;
        if (isNext) firstRendered = true;
        out += renderStopRow(r, isNext);
      });
      if (rows.length > TAIL + 1)
        out += '<button class="stop-collapse" onclick="window._expandStops&&window._expandStops(' + cardIdx + ')">· vis færre ·</button>';
    }
    return out;
  }

  function buildCard(label, headerHtml, stopsHtml) {
    return '<div class="tog-card">'
      + '<div class="tc-head">'
      + (label ? '<span class="tc-label">' + label + '</span>' : '')
      + headerHtml
      + '</div>'
      + (stopsHtml ? '<div class="tc-stops">' + stopsHtml + '</div>' : '')
      + '</div>';
  }

  function collectLegStopRows(legIdx) {
    const leg = legs[legIdx];
    if (!leg || !leg.stops || !leg.stops.length) return [];
    const isLastLeg = legIdx === legs.length - 1;
    const from = normStn(leg.fromStation || '');
    const to = normStn(leg.toStation || '');
    const rows = [];
    let pastFrom = !leg.fromStation, pastTo = false;
    leg.stops.forEach(s => {
      if (pastTo) return;
      const nm = (s.quay && s.quay.stopPlace && s.quay.stopPlace.name) || '?';
      if (!pastFrom) {
        if (normStn(nm) === from) { pastFrom = true; return; }
        else return;
      }
      const isEnd = to && normStn(nm) === to;
      const depT = s.expectedDepartureTime || s.aimedDepartureTime;
      const passed = depT && new Date(depT).getTime() < now - 10000;
      if (passed && !isEnd) return;
      const arrT = s.expectedArrivalTime || s.aimedArrivalTime || depT;
      const arrTs = arrT ? new Date(arrT).getTime() : null;
      const ma = arrTs ? Math.round((arrTs - now) / 60000) : null;
      const relTxt = ma === null ? '—' : ma <= 0 ? 'nå' : 'om ' + fmtMins(ma);
      rows.push({ nm, arrT, ma, relTxt, isTransfer: !isLastLeg && isEnd, isDest: isLastLeg && isEnd });
      if (isEnd) pastTo = true;
    });
    return rows;
  }

  function buildPreBoardHtml(legIdx) {
    const leg = legs[legIdx];
    if (!leg || !leg.fromStation || !leg.stops || !leg.stops.length) return '';
    const fromNorm = normStn(leg.fromStation);
    let nextPreStop = null, stopsAway = 0;
    for (const s of leg.stops) {
      const nm = (s.quay && s.quay.stopPlace && s.quay.stopPlace.name) || '?';
      if (normStn(nm) === fromNorm) break;
      const depT = s.expectedDepartureTime || s.aimedDepartureTime;
      if (depT && new Date(depT).getTime() < now - 10000) continue;
      if (!nextPreStop) nextPreStop = { nm, arrT: s.expectedArrivalTime || s.aimedArrivalTime || depT };
      stopsAway++;
    }
    if (!nextPreStop) return '';
    const arrTs = nextPreStop.arrT ? new Date(nextPreStop.arrT).getTime() : null;
    const ma = arrTs ? Math.round((arrTs - now) / 60000) : null;
    const relTxt = ma !== null ? (ma <= 0 ? ' · nå' : ' · om ' + fmtMins(ma)) : '';
    const vehicleLabel = legs[legIdx] && legs[legIdx].mode === 'bus' ? 'bussen er nå ved'
      : legs[legIdx] && legs[legIdx].mode === 'tram' ? 'trikken er nå ved'
      : 'toget er nå ved';
    return '<div class="pre-board-info"><span class="pre-board-label">' + vehicleLabel + '</span> '
      + nextPreStop.nm.toLowerCase() + relTxt + ' · ' + stopsAway + ' stopp til avgang</div>';
  }

  function buildLegCard(legIdx, label, rideMode) {
    const leg = legs[legIdx];
    if (!leg) return '';
    const isLastLeg = legIdx === legs.length - 1;

    const rows = collectLegStopRows(legIdx);
    let headerHtml;
    if (rideMode) {
      const arrT = leg.arrTime;
      const mToAction = arrT ? (() => {
        const m = Math.floor((new Date(arrT.time).getTime() - now) / 60000);
        return m <= 0 ? 'nå' : 'om ' + fmtMins(m);
      })() : null;
      // Count directly from leg.stops using arrival time so we count
      // stops the train is currently AT (just departed) as already visited.
      const stopsLeft = (() => {
        if (!leg.stops) return rows.length;
        const fromN = normStn(leg.fromStation || '');
        const toN   = normStn(leg.toStation   || '');
        let pastFrom = !leg.fromStation, count = 0;
        for (const s of leg.stops) {
          const nm = (s.quay && s.quay.stopPlace && s.quay.stopPlace.name) || '?';
          if (!pastFrom) { if (normStn(nm) === fromN) pastFrom = true; continue; }
          const isEnd = toN && normStn(nm) === toN;
          const arrT2 = s.expectedArrivalTime || s.aimedArrivalTime || s.expectedDepartureTime || s.aimedDepartureTime;
          if (!arrT2 || new Date(arrT2).getTime() > now - 30000 || isEnd) count++;
          if (isEnd) break;
        }
        return count;
      })();
      headerHtml = '<div class="ct-detail">'
        + '<span class="line-badge" style="background:' + leg.lineBg + '">' + leg.lineCode + '</span>'
        + '<span class="ct-dest">' + leg.frontText + '</span>'
        + '</div>'
        + '<div class="ct-detail ct-detail-2">'
        + '<span class="ct-from">fra <strong>' + normStn(leg.fromStation || '') + '</strong>'
        + (leg.depTime ? ' · avg ' + leg.depTime.clk : '') + '</span>'
        + '</div>'
        + '<div class="ct-detail ct-detail-2">'
        + (arrT
          ? '<span class="ct-time">' + (isLastLeg ? 'ank. ' : 'bytt ') + '<strong>' + normStn(leg.toStation) + '</strong> ' + arrT.clk + (mToAction ? ' · ' + mToAction : '') + '</span>'
          : '<span class="ct-time" style="color:#57534e">laster…</span>')
        + (stopsLeft > 0 ? '<span class="ct-stops">' + stopsLeft + (stopsLeft === 1 ? ' stopp' : ' stopp') + '</span>' : '')
        + '</div>';
    } else {
      const mToDep = leg.depTime
        ? Math.round((new Date(leg.depTime.time).getTime() - now) / 60000)
        : null;
      const depStatus = mToDep === null ? ''
        : mToDep > 0 ? 'om ' + fmtMins(mToDep)
        : mToDep === 0 ? 'nå' : 'avgått';
      headerHtml = '<div class="ct-detail">'
        + '<span class="line-badge" style="background:' + leg.lineBg + '">' + leg.lineCode + '</span>'
        + (leg.frontText ? '<span class="ct-dest">' + leg.frontText + '</span>' : '')
        + '</div>'
        + '<div class="ct-detail ct-detail-2">'
        + (leg.quay ? '<span class="ct-quay">spor ' + leg.quay + '</span>' : '')
        + (leg.depTime ? '<span class="ct-time">avg <strong>' + leg.depTime.clk + '</strong>' + (depStatus ? ' · ' + depStatus : '') + '</span>' : '')
        + (leg.arrTime ? '<span class="ct-arr">→ ank. ' + leg.arrTime.clk + '</span>' : '')
        + '</div>';
    }

    let stopsContent;
    if (rideMode) {
      const preBoardHtml = buildPreBoardHtml(legIdx);
      const rowsHtml = rows.length
        ? renderStopRows(rows, legIdx)
        : (!preBoardHtml ? '<div class="state-msg" style="padding:.75rem;font-size:11px">laster…</div>' : '');
      stopsContent = preBoardHtml + rowsHtml;
    } else {
      stopsContent = rows.length ? renderStopRows(rows, legIdx) : '';
    }

    return buildCard(label, headerHtml, stopsContent);
  }

  // ── Build cards ───────────────────────────────────────────────────────────

  function cardLabel(mode, isFirst) {
    if (mode === 'bus')  return isFirst ? 'byttebuss' : 'neste buss';
    if (mode === 'tram') return isFirst ? 'byttetrikk' : 'neste trikk';
    return isFirst ? 'byttetog' : 'neste tog';
  }

  let cards = '';
  if (phase === 'arrived') {
    cards = '<div class="state-msg" style="padding:1rem;font-size:11px;color:#57534e">ankommet · ' + state.jny.dest.toLowerCase() + '</div>';
  } else if (phase === 'riding') {
    cards += buildLegCard(i, 'underveis', true);
    for (let j = i + 1; j < legs.length; j++) {
      cards += buildLegCard(j, cardLabel(legs[j].mode, j === i + 1), false);
    }
    if (state.jny._toLat && state.jny._toLon) {
      cards += '<button class="t-explore-link" id="t-explore-btn">🌟 utforsk ' + state.jny.dest.toLowerCase() + ' →</button>';
    }
  } else { // platform
    const nextIdx = cs.next;
    for (let j = nextIdx; j < legs.length; j++) {
      cards += buildLegCard(j, cardLabel(legs[j].mode, j === nextIdx), false);
    }
  }

  if (cards !== _tCardsHtml) {
    _tCardsHtml = cards;
    document.getElementById('t-cards').innerHTML = cards;
    const explBtn = document.getElementById('t-explore-btn');
    if (explBtn) explBtn.addEventListener('click', () => {
      window._exploreDestination && window._exploreDestination(
        state.jny._toLat, state.jny._toLon, state.jny.dest
      );
    });
  }
  const newWeather = _trackWeatherHtml();
  if (newWeather !== _tWeatherHtml) {
    _tWeatherHtml = newWeather;
    const tw = document.getElementById('t-weather');
    if (tw) tw.innerHTML = newWeather;
  }
  _updateUserMarker();
  _renderTrackMap(now, cs, legs);
}

export function buildTrackBar() {
  const legs = (state.jny && state.jny.legs) || [];
  const badges = legs.map(leg =>
    '<span class="line-badge" style="background:' + leg.lineBg + '">' + leg.lineCode + '</span>'
  ).join('<span class="transfer-arrow" aria-hidden="true">→</span>');
  const firstDep = legs[0] && legs[0].depTime;
  document.getElementById('t-train-bar').innerHTML =
    badges
    + '<span class="tb-dest">' + (state.jny.frontText || state.jny.dest) + '</span>'
    + (firstDep ? '<span class="tb-dep">avg <span>' + firstDep.clk + '</span></span>' : '')
    + (state.jny.arrival ? '<span class="tb-dep">ank <span>' + state.jny.arrival.clk + '</span></span>' : '');

  const jidRow = document.getElementById('t-jid-row');
  const jidVal = document.getElementById('t-jid-val');
  if (jidRow && jidVal) {
    if (state.lockedJourneyId) {
      jidVal.textContent = state.lockedJourneyId;
      jidRow.style.display = 'flex';
    } else {
      jidRow.style.display = 'none';
    }
  }
}

export function copyJourneyId() {
  const jid = state.lockedJourneyId;
  const msg = document.getElementById('t-jid-msg');
  if (!jid || !msg) return;
  const showMsg = text => {
    msg.textContent = text;
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 2000);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(jid)
      .then(() => showMsg('✓ kopiert'))
      .catch(() => showMsg(jid));
  } else {
    showMsg(jid);
  }
}

export function startTracking() {
  expanded = state.jny && state.jny.legs ? state.jny.legs.map(() => false) : [];
  _destroyArrMap();
  _destroyTrackMap();
  _tCardsHtml = '';
  _tWeatherHtml = '';
  _walkDestLL = null;
  if (intervals.track) clearInterval(intervals.track);
  renderTrack();
  _fetchTrack();
  intervals.track = setInterval(_fetchTrack, config.trackRefreshMs);
  if (intervals.board) { clearInterval(intervals.board); intervals.board = null; }

  // Show "Hva nå?" panel immediately so the user can plan ahead during the journey
  const nextEl = document.getElementById('t-next');
  if (nextEl) nextEl.style.display = 'block';
  renderNextPanel();

  // Resolve arrival stop ID and start the live departure board
  const _dir = config.dirs[state.dIdx];
  if (_dir.toStopId || _dir.toGeo) {
    resolveToStop(_dir)
      .then(id => {
        _arrBoardStopId = id;
        const _last = state.jny && state.jny.legs && state.jny.legs[state.jny.legs.length - 1];
        _addArrBoardSection(_last ? _last.toStation : '');
        _fetchArrBoardData();
      }).catch(() => {});
  }
  _arrBoardInterval = setInterval(_fetchArrBoardData, 30000);

  _resolveArrivalLL().then(ll => {
    if (!ll) {
      _arrWeather = { _err: true };
      _updateWeatherSection();
      return;
    }
    _initArrMap(ll);
    _addBikeMarkers(ll);
    fetchWeather(ll.lat, ll.lon)
      .then(w => { _arrWeather = w; _updateWeatherSection(); })
      .catch(() => { _arrWeather = { _err: true }; _updateWeatherSection(); });
    if (loadWeekendMode()) {
      _placesLL = ll;
      if (!_placesCat) _placesCat = timeCategory();
      // Update pill highlights in place — avoids destroying the already-initialized map
      const activeCatIdx = PLACE_CATS.indexOf(_placesCat);
      document.querySelectorAll('.hn-place-cat').forEach((b, i) => b.classList.toggle('active', i === activeCatIdx));
      const lbl = document.getElementById('hn-places-label');
      if (lbl) lbl.textContent = _placesCat.emoji + ' ' + _placesCat.label;
      fetchNearbyPlaces(ll.lat, ll.lon, _placesCat.amenities)
        .then(p => { _nearbyPlaces = p; _updatePlacesSection(); })
        .catch(() => {});
    }
  });
}

export function stopTracking() {
  if (intervals.track) { clearInterval(intervals.track); intervals.track = null; }
  if (_arrBoardInterval) { clearInterval(_arrBoardInterval); _arrBoardInterval = null; }
}

function _fetchTrack() {
  if (!state.jny || !state.jny.legs || !state.jny.legs.length) return;
  const now = Date.now();
  const cs = computeState(now);
  if (cs.phase === 'arrived') return;

  // During platform phase fetch the next leg; while riding fetch current leg
  const activeIdx = cs.phase === 'platform' ? cs.next : cs.i;
  const leg = state.jny.legs[activeIdx];
  if (!leg || !leg.journeyId) return;

  fetchTrack(leg.journeyId)
    .then(calls => {
      if (!calls) return;
      leg.stops = calls;
      // Update arrival time for this leg
      const d = findArr(calls, leg.toStation);
      if (d) {
        const t = d.expectedArrivalTime || d.aimedArrivalTime;
        if (t) {
          leg.arrTime = { time: t, clk: clk(t) };
          if (activeIdx === state.jny.legs.length - 1)
            state.jny.arrival = { time: t, clk: clk(t) };
          logMsg('leg' + activeIdx + ' ank ' + clk(t), 'ok');
        }
      }
      // During platform phase, refresh depTime from live calls
      if (cs.phase === 'platform' && leg.fromStation) {
        const depStop = findArr(calls, leg.fromStation);
        if (depStop) {
          const dt = depStop.expectedDepartureTime || depStop.aimedDepartureTime;
          if (dt) leg.depTime = { time: dt, clk: clk(dt) };
        }
      }
      renderTrack();
    })
    .catch(err => logMsg('track ✗ ' + err.message, 'err'));

  // Pre-fetch all remaining legs while riding so cards show stops immediately,
  // and refresh their dep/arr times from live data — without this, a delay on
  // the current leg leaves later legs showing their stale as-boarded times
  // (e.g. a transfer departure shown as earlier than the current leg's arrival).
  if (cs.phase === 'riding') {
    for (let j = cs.i + 1; j < state.jny.legs.length; j++) {
      const nxt = state.jny.legs[j];
      if (nxt && nxt.journeyId) {
        fetchTrack(nxt.journeyId)
          .then(calls => {
            if (!calls) return;
            nxt.stops = calls;
            if (nxt.fromStation) {
              const depStop = findArr(calls, nxt.fromStation);
              const dt = depStop && (depStop.expectedDepartureTime || depStop.aimedDepartureTime);
              if (dt) nxt.depTime = { time: dt, clk: clk(dt) };
            }
            if (nxt.toStation) {
              const arrStop = findArr(calls, nxt.toStation);
              const at = arrStop && (arrStop.expectedArrivalTime || arrStop.aimedArrivalTime);
              if (at) {
                nxt.arrTime = { time: at, clk: clk(at) };
                if (j === state.jny.legs.length - 1) state.jny.arrival = { time: at, clk: clk(at) };
              }
            }
            renderTrack();
          })
          .catch(() => {});
      }
    }
  }
}

window._simBytt = function(minsFromNow) {
  if (!state.jny || !state.jny.legs || !state.jny.legs.length) return;
  const t = new Date(Date.now() + minsFromNow * 60000);
  const ts = { time: t.toISOString(), clk: pad(t.getHours()) + ':' + pad(t.getMinutes()) };
  state.jny.legs[0].arrTime = ts;
  if (minsFromNow <= 0) _fetchTrack();
  renderTrack();
};

window._simEtterBytt = function() {
  if (!state.jny || !state.jny.legs || state.jny.legs.length < 2) return;
  const t = new Date(Date.now() - 1000);
  const ts = { time: t.toISOString(), clk: pad(t.getHours()) + ':' + pad(t.getMinutes()) };
  state.jny.legs[0].arrTime = ts;
  // Also set leg 1 depTime to past so we skip platform-waiting
  state.jny.legs[1].depTime = ts;
  _fetchTrack();
  renderTrack();
};

window._expandStops = (idx) => { expanded[idx] = !expanded[idx]; renderTrack(); };
