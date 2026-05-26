import config from '../config.js';
import { state } from '../state.js';
import { haver, loadWalkSpeed, saveWalkSpeed, loadWalkBuffer, saveWalkBuffer } from '../geo.js';

const DEST_KEY = 't.dest';
const DEP_KEY = 't.dep';

const TRANSIT_CATEGORIES = ['metroStation', 'busStation', 'onstreetBus', 'tramStation', 'ferryStop'];

let _depAbort = null, _arrAbort = null;
let _depTimer = null, _arrTimer = null;

const _depStopIds = new Map();
const _arrStopIds = new Map();

function suggestStops(query, suggId, inputId, clearId, stopMap, getAbort, setAbort, getTimer, setTimer) {
  clearTimeout(getTimer());
  const suggEl = document.getElementById(suggId);
  if (query.length < 2) {
    if (suggEl) { suggEl.hidden = true; suggEl.innerHTML = ''; }
    return;
  }
  setTimer(setTimeout(() => {
    if (getAbort()) getAbort().abort();
    const ctrl = new AbortController();
    setAbort(ctrl);
    fetch(config.api.geocoder + '?text=' + encodeURIComponent(query) + '&size=8&layers=venue&focus.point.lat=59.9139&focus.point.lon=10.7522',
      { signal: ctrl.signal })
      .then(r => r.json())
      .then(j => {
        const sugg = document.getElementById(suggId);
        const inp = document.getElementById(inputId);
        if (!sugg || !inp) return;
        const stops = ((j && j.features) || [])
          .filter(f => (f.properties.category || []).some(c => TRANSIT_CATEGORIES.includes(c)))
          .filter(f => {
            const coords = f.geometry && f.geometry.coordinates;
            return coords && haver(coords[1], coords[0], 59.9139, 10.7522) < 80000;
          });
        stopMap.clear();
        sugg.innerHTML = '';
        if (!stops.length) { sugg.hidden = true; return; }
        stops.forEach(f => {
          const name = f.properties.name || f.properties.label;
          stopMap.set(name, f.properties.id);
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = name;
          btn.addEventListener('mousedown', e => e.preventDefault());
          btn.addEventListener('click', () => {
            inp.value = name;
            sugg.hidden = true;
            sugg.innerHTML = '';
            syncClear(inputId, clearId);
          });
          sugg.appendChild(btn);
        });
        sugg.hidden = false;
      })
      .catch(() => {});
  }, 250));
}

function syncClear(inputId, clearId) {
  const btn = document.getElementById(clearId);
  const inp = document.getElementById(inputId);
  if (btn) btn.style.display = (inp && inp.value) ? 'flex' : 'none';
}

function _highlightPrefs() {
  const spd = loadWalkSpeed();
  document.querySelectorAll('#pref-speed .pref-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.val === spd);
  });
  const buf = String(loadWalkBuffer());
  document.querySelectorAll('#pref-buf .pref-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.val === buf);
  });
}

function initPrefs() {
  document.querySelectorAll('#pref-speed .pref-btn').forEach(btn => {
    btn.addEventListener('click', () => { saveWalkSpeed(btn.dataset.val); _highlightPrefs(); });
  });
  document.querySelectorAll('#pref-buf .pref-btn').forEach(btn => {
    btn.addEventListener('click', () => { saveWalkBuffer(Number(btn.dataset.val)); _highlightPrefs(); });
  });
}

export function initSettings() {
  const depEl = document.getElementById('set-dep');
  const arrEl = document.getElementById('set-arr');
  if (depEl) depEl.addEventListener('input', e =>
    suggestStops(e.target.value.trim(), 'dep-sugg', 'set-dep', 'set-dep-clear', _depStopIds,
      () => _depAbort, v => { _depAbort = v; },
      () => _depTimer, v => { _depTimer = v; }));
  if (arrEl) arrEl.addEventListener('input', e =>
    suggestStops(e.target.value.trim(), 'arr-sugg', 'set-arr', 'set-arr-clear', _arrStopIds,
      () => _arrAbort, v => { _arrAbort = v; },
      () => _arrTimer, v => { _arrTimer = v; }));

  ['dep', 'arr'].forEach(id => {
    const inp = document.getElementById('set-' + id);
    const btn = document.getElementById('set-' + id + '-clear');
    const sugg = document.getElementById(id + '-sugg');
    if (!inp || !btn) return;
    inp.addEventListener('input', () => {
      btn.style.display = inp.value ? 'flex' : 'none';
    });
    inp.addEventListener('blur', () => {
      setTimeout(() => { if (sugg) { sugg.hidden = true; } }, 150);
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Escape' && sugg) { sugg.hidden = true; sugg.innerHTML = ''; }
    });
    btn.addEventListener('click', () => {
      inp.value = '';
      btn.style.display = 'none';
      if (sugg) { sugg.hidden = true; sugg.innerHTML = ''; }
      inp.focus();
    });
  });
  initPrefs();
}

export function showSettings() {
  const ns = state.nearestStation;
  const depEl = document.getElementById('set-dep');

  // Dep input always visible — pre-fill from: saved > GPS station > current dir
  if (depEl) {
    const saved = loadDep();
    depEl.value = saved || (ns ? ns.name : (config.dirs[state.dIdx] ? config.dirs[state.dIdx].from : ''));
    syncClear('set-dep', 'set-dep-clear');
  }

  // Nearby station list
  const nearbyList = document.getElementById('set-nearby-list');
  if (nearbyList) {
    const stations = (state.nearestStations && state.nearestStations.length)
      ? state.nearestStations : (ns ? [ns] : []);
    if (stations.length) {
      nearbyList.innerHTML = stations.map(s => {
        const spd = { rolig: 41.67, middels: 83.33, rask: 116.67 }[loadWalkSpeed()] || 83.33;
        const mins = s.distM != null
          ? Math.max(1, Math.ceil(s.distM * 1.3 / spd)) + loadWalkBuffer()
          : null;
        return '<button class="nearby-btn" data-name="' + s.name + '">'
          + '<span class="nearby-name">' + s.name + '</span>'
          + (mins != null ? '<span class="nearby-dist">' + mins + ' min</span>' : '')
          + '</button>';
      }).join('');
      nearbyList.style.display = 'block';
      nearbyList.querySelectorAll('.nearby-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (depEl) { depEl.value = btn.dataset.name; syncClear('set-dep', 'set-dep-clear'); }
          const arrEl = document.getElementById('set-arr');
          if (arrEl) arrEl.focus();
        });
      });
    } else {
      nearbyList.style.display = 'none';
    }
  }

  const arrEl = document.getElementById('set-arr');
  if (arrEl) { arrEl.value = loadDest() || ''; syncClear('set-arr', 'set-arr-clear'); }
  document.getElementById('set-error').style.display = 'none';
  _highlightPrefs();
}

export function applyRoute() {
  const ns = state.nearestStation;
  const dep = document.getElementById('set-dep').value.trim();
  const arr = document.getElementById('set-arr').value.trim();
  const errEl = document.getElementById('set-error');
  if (!dep || !arr) {
    errEl.textContent = 'Fyll inn destinasjon.';
    errEl.style.display = 'block';
    return false;
  }
  if (dep.toLowerCase() === arr.toLowerCase()) {
    errEl.textContent = 'Fra og til kan ikke være samme stasjon.';
    errEl.style.display = 'block';
    return false;
  }

  // Resolve departure stop ID: GPS > nearestStations list > autocomplete map > geocode
  const depMatchesGps = ns && ns.name.toLowerCase() === dep.toLowerCase();
  const depNearby = !depMatchesGps
    && state.nearestStations.find(s => s.name.toLowerCase() === dep.toLowerCase());
  const depId = depMatchesGps ? ns.id
    : (depNearby ? depNearby.id : (_depStopIds.get(dep) || null));

  // Resolve destination stop ID: autocomplete map > geocode
  const arrId = _arrStopIds.get(arr) || null;

  config.dirs[2] = {
    key: 'custom-out',
    from: dep,
    to:   arr,
    stopId:   depId,
    toStopId: arrId,
    filter:   null,
    geo:      depId ? null : dep,
    toGeo:    arrId ? null : arr,
    line:     null,
  };
  state.dIdx = 2;
  saveDep(dep);
  saveDest(arr);
  return true;
}

export function applyRouteFromState(arr) {
  const ns = state.nearestStation;
  if (!arr) return false;
  const savedDep = loadDep();
  const dep = savedDep || (ns ? ns.name : null);
  if (!dep) return false;
  const depMatchesGps = ns && ns.name.toLowerCase() === dep.toLowerCase();
  const depNearby = !depMatchesGps
    && state.nearestStations.find(s => s.name.toLowerCase() === dep.toLowerCase());
  const depId = depMatchesGps ? ns.id : (depNearby ? depNearby.id : null);
  config.dirs[2] = {
    key: 'custom-out',
    from: dep,
    to:   arr,
    stopId:   depId,
    toStopId: null,
    filter:   null,
    geo:      depId ? null : dep,
    toGeo:    arr,
    line:     null,
  };
  state.dIdx = 2;
  return true;
}

export function loadDest() {
  try { return localStorage.getItem(DEST_KEY) || null; } catch { return null; }
}

export function saveDest(arr) {
  try { localStorage.setItem(DEST_KEY, arr); } catch {}
}

export function loadDep() {
  try { return localStorage.getItem(DEP_KEY) || null; } catch { return null; }
}

export function saveDep(name) {
  try { localStorage.setItem(DEP_KEY, name); } catch {}
}

// Kept for backward compat — no-op; GPS now determines departure
export function loadCustomRoute() {}
