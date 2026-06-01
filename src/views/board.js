import config from '../config.js';
import { state, intervals } from '../state.js';
import { walkInfo, mToLeave, reachCls, findArr, isWalkActive, loadWalkFrom } from '../geo.js';
import { fetchBoard, fetchTrip } from '../api/entur.js';
import { setDot, logMsg } from '../ui/log.js';
import { adaptTripPattern } from '../api/adapt.js';
import { renderAlerts } from '../ui/alerts.js';
import { loadFavs } from '../ui/favs.js';
import { fmtMins } from '../ui/fmt.js';
import L from 'leaflet';
import { fetchBysykkel } from '../api/bysykkel.js';
import { fetchScooters } from '../api/scooters.js';

function pad(n) { return String(n).padStart(2, '0'); }
function clk(v) { const d = new Date(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

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

// ── Bike board map ───────────────────────────────────────────────────────────
const _BIKE_TILE = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
let _bikeMap = null;
let _bikeMarkersLayer = null;
let _bikeUserMoved = false;
function _destroyBikeMap() {
  if (_bikeMap) { _bikeMap.remove(); _bikeMap = null; _bikeMarkersLayer = null; }
  _bikeUserMoved = false;
}
function _makeBikeIcon(bikes, ebikes) {
  const color = bikes === 0 ? '#f87171' : bikes <= 2 ? '#fbbf24' : '#4ade80';
  const label = bikes + (ebikes ? '+' : '');
  const html = '<div style="background:' + color + ';color:#111;border-radius:50%;width:28px;height:28px;'
    + 'display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;'
    + 'transform:translate(-50%,-50%);box-shadow:0 1px 4px rgba(0,0,0,.3)">' + label + '</div>';
  return L.divIcon({ className: '', html, iconSize: [0, 0], iconAnchor: [0, 0] });
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

// ── Mob-type sub-filter (inside bike board) ──────────────────────────────────
const MOB_TYPE_KEY = 't.mobType';
function loadMobType() { try { return localStorage.getItem(MOB_TYPE_KEY) || 'all'; } catch { return 'all'; } }
function saveMobType(t) { try { localStorage.setItem(MOB_TYPE_KEY, t); } catch {} }

function renderMobTypeFilter() {
  const el = document.getElementById('mob-type-filter');
  if (!el) return;
  const cur = loadMobType();
  el.innerHTML = [
    { key: 'all',      label: 'Alt' },
    { key: 'bikes',    label: 'Sykkel' },
    { key: 'scooters', label: 'Sparkesykkel' },
  ].map(p => '<button class="mob-pill' + (cur === p.key ? ' active' : '') + '" data-type="' + p.key + '">'
    + p.label + '</button>').join('');
  el.querySelectorAll('.mob-pill').forEach(btn => {
    btn.addEventListener('click', () => { saveMobType(btn.dataset.type); renderBikeBoard(); });
  });
}

function renderBikeBoard() {
  const el = document.getElementById('bike-board');
  if (!el) return;
  const pos = state.walkFromLL || state.homeLL;
  if (!document.getElementById('bike-map')) {
    el.innerHTML = '<div id="mob-type-filter" style="display:flex;gap:.35rem;flex-wrap:wrap;padding:.4rem 0 .5rem"></div>'
      + '<div class="map-wrap"><div id="bike-map"></div>'
      + '<button class="map-expand-btn" id="bike-map-expand" aria-label="Utvid kart" title="Utvid kart">⤢</button></div>'
      + '<div id="bike-list"><div class="hn-loading">laster…</div></div>';
  }
  renderMobTypeFilter();
  if (!_bikeMap) {
    const mapEl = document.getElementById('bike-map');
    if (!mapEl) return;
    _bikeUserMoved = false;
    _bikeMap = L.map(mapEl, { zoomControl: true, attributionControl: false, zoomControlOptions: { position: 'topleft' } });
    _bikeMap.on('dragstart', () => { _bikeUserMoved = true; });
    L.tileLayer(_BIKE_TILE, { subdomains: 'abcd', attribution: '© CartoDB' }).addTo(_bikeMap);
    _bikeMarkersLayer = L.layerGroup().addTo(_bikeMap);
    const c = pos || { lat: 59.9139, lon: 10.7522 };
    _bikeMap.setView([c.lat, c.lon], 15);
    const expandBtn = document.getElementById('bike-map-expand');
    if (expandBtn) {
      expandBtn.onclick = () => {
        const exp = mapEl.classList.toggle('expanded');
        expandBtn.textContent = exp ? '✕' : '⤢';
        expandBtn.setAttribute('aria-label', exp ? 'Minimer kart' : 'Utvid kart');
        expandBtn.title = exp ? 'Minimer kart' : 'Utvid kart';
        setTimeout(() => _bikeMap && _bikeMap.invalidateSize(), 320);
      };
    }
  }
  if (!pos) {
    const listEl = document.getElementById('bike-list');
    if (listEl) listEl.innerHTML = '<div class="hn-loading">posisjon ikke tilgjengelig</div>';
    return;
  }
  const mobType = loadMobType();
  const wantBikes    = mobType === 'all' || mobType === 'bikes';
  const wantScooters = mobType === 'all' || mobType === 'scooters';
  const p1 = wantBikes    ? fetchBysykkel(pos.lat, pos.lon) : Promise.resolve([]);
  const p2 = wantScooters ? fetchScooters(pos.lat, pos.lon) : Promise.resolve([]);
  Promise.allSettled([p1, p2]).then(([r1, r2]) => {
    if (r1.status === 'rejected') console.warn('[bysykkel]', r1.reason);
    if (r2.status === 'rejected') console.warn('[scooters]', r2.reason);
    const stations = r1.status === 'fulfilled' ? r1.value : [];
    const scooters = r2.status === 'fulfilled' ? r2.value : [];
    if (!_bikeMap || !_bikeMarkersLayer) return;
    _bikeMarkersLayer.clearLayers();
    L.circleMarker([pos.lat, pos.lon], { radius: 6, color: '#60a5fa', fillColor: '#60a5fa', fillOpacity: 0.85, weight: 2 }).addTo(_bikeMarkersLayer);
    const bounds = [[pos.lat, pos.lon]];
    stations.forEach(s => {
      bounds.push([s.lat, s.lon]);
      L.marker([s.lat, s.lon], { icon: _makeBikeIcon(s.bikes, s.ebikes) }).addTo(_bikeMarkersLayer);
    });
    scooters.forEach(v => {
      bounds.push([v.lat, v.lon]);
      L.marker([v.lat, v.lon], { icon: _makeScooterIcon(v.operator, v.battery) }).addTo(_bikeMarkersLayer);
    });
    if (bounds.length > 1 && !_bikeUserMoved) _bikeMap.fitBounds(bounds, { padding: [32, 32] });
    setTimeout(() => _bikeMap && _bikeMap.invalidateSize(), 60);
    const listEl = document.getElementById('bike-list');
    if (!listEl) return;
    const distFmt = d => d < 1000 ? d + ' m' : (d / 1000).toFixed(1) + ' km';
    const bikeRows = stations.map(s =>
      '<div class="hn-bike-row">'
      + '<span class="hn-bike-name"><span class="vnd-badge vnd-bysykkel">Bysykkel</span>' + s.name + '</span>'
      + '<span class="hn-bike-dist">' + distFmt(s.dist) + '</span>'
      + '<span class="hn-bike-count' + (s.bikes === 0 ? ' empty' : '') + '">'
      + s.bikes + (s.ebikes ? ' · ' + s.ebikes + ' el' : '') + ' 🚲</span>'
      + '</div>'
    );
    const scooterRows = scooters.map(v =>
      '<div class="hn-bike-row">'
      + '<span class="hn-bike-name"><span class="vnd-badge vnd-' + v.operator.toLowerCase() + '">' + v.operator + '</span><span class="mob-scooter-tag">sparkesykkel</span></span>'
      + '<span class="hn-bike-dist">' + distFmt(v.dist) + '</span>'
      + '<span class="hn-bike-count' + (v.battery != null && v.battery < 20 ? ' empty' : '') + '">'
      + (v.battery != null ? '⚡' + v.battery + '%' : '⚡?') + '</span>'
      + '</div>'
    );
    const combined = [
      ...stations.map((s, i) => ({ row: bikeRows[i], dist: s.dist })),
      ...scooters.map((v, i) => ({ row: scooterRows[i], dist: v.dist })),
    ].sort((a, b) => a.dist - b.dist).map(x => x.row);
    const scooterErr = wantScooters && r2.status === 'rejected';
    listEl.innerHTML = (combined.length === 0 && !scooterErr)
      ? '<div class="hn-loading">ingen tilgjengelig i nærheten</div>'
      : combined.join('')
        + (scooterErr ? '<div class="hn-loading" style="margin-top:.5rem">sparkesykkel utilgjengelig</div>' : '');
  });
}

function renderModeFilter() {
  const el = document.getElementById('mode-filter');
  if (!el) return;
  const modes = loadModes();
  el.innerHTML = [
    { key: 'metro', label: 'T-bane' },
    { key: 'tram',  label: 'Trikk' },
    { key: 'bus',   label: 'Buss' },
    { key: 'sykkel', label: 'Sykkel' },
  ].map(p => '<button class="mode-pill' + (modes[p.key] ? ' active' : '') + '" data-mode="' + p.key + '">'
    + p.label + '</button>').join('');
  el.querySelectorAll('.mode-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = loadModes();
      m[btn.dataset.mode] = !m[btn.dataset.mode];
      saveModes(m);
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
  const bikeEl = document.getElementById('bike-board');
  if (bikeEl) {
    bikeEl.style.display = modes.sykkel ? 'block' : 'none';
    if (modes.sykkel) renderBikeBoard();
    else _destroyBikeMap();
  }
  const activeModes = ['metro', 'tram', 'bus'].filter(m => modes[m]);
  const list = document.getElementById('dep-list');
  const dir = config.dirs[state.dIdx];
  if (!activeModes.length) {
    list.innerHTML = '';
    return;
  }
  if (!state.deps.length) {
    list.innerHTML = '<div class="state-msg">' + (state.view === 'board' ? 'kobler til…' : 'ingen avganger') + '</div>';
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

  let html = '';
  let urgentShown = false;
  visibleDeps.forEach(({ c, origIdx }) => {
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
    const delayed = c.realtime && depTs - new Date(c.aimedDepartureTime).getTime() > 60000;
    const sjc = c.serviceJourney && c.serviceJourney.estimatedCalls;
    const arr = findArr(sjc, dir.to);
    const arrT = (arr && (arr.expectedArrivalTime || arr.aimedArrivalTime)) || c._finalArrival || null;
    const mtl = walkActive ? mToLeave(depTs) : null;
    const rcls = walkActive ? reachCls(mtl) : null;
    const isCancelled = c.cancellation;
    const missed = rcls === 'missed';
    const rowCls = 'dep-row' + (isCancelled ? ' cancelled' : missed ? ' missed' : rcls ? ' ' + rcls : '');
    const showReach = walkActive && rcls && !missed && (rcls !== 'r-now' || !urgentShown);
    if (rcls === 'r-now') urgentShown = true;

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

    const xferCount = c._transfers && c._transfers.length;

    const minsLabel = isNow ? 'nå' : mins < 60 ? mins + ' min' : Math.floor(mins / 60) + ' t' + (mins % 60 > 0 ? ' ' + mins % 60 + ' m' : '');
    const a11yLabel = lc + ' mot ' + dest + ', avgang om ' + minsLabel + (quay !== '?' ? ', spor ' + quay : '');

    const isClock = mins >= 60;
    html += '<div class="' + rowCls + '"'
      + (isCancelled
        ? ''
        : ' onclick="window.tap(' + origIdx + ')"'
          + ' role="button" tabindex="0"'
          + ' aria-label="' + a11yLabel.replace(/"/g, '&quot;') + '"'
          + ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();window.tap(' + origIdx + ')}"'
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
      + (arrT ? '<span class="dep-arr">ank.' + clk(arrT) + '</span>' : '')
      + '</div>'
      + '<div class="dep-info">'
      + '<span class="dep-dest">' + dest + '</span>'
      + (xferCount ? '<span class="dep-tag">' + xferCount + (xferCount === 1 ? ' bytte' : ' bytter') + '</span>' : '')
      + (delayed ? '<span class="dep-tag">+for</span>' : '')
      + (c.cancellation ? '<span class="dep-cancelled">innstilt</span>' : '')
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
}

export function stopBoard() {
  if (intervals.board) { clearInterval(intervals.board); intervals.board = null; }
  _destroyBikeMap();
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

window._startBoard = startBoard;
window._fetchBoard = _fetchBoard;
