import config from '../config.js';
import { state } from '../state.js';
import { walkInfo } from '../geo.js';

const DEST_KEY = 't.dest';
const DEP_KEY = 't.dep';

const TRANSIT_CATEGORIES = ['metroStation', 'busStation', 'onstreetBus', 'tramStation', 'ferryStop'];

let _depAbort = null, _arrAbort = null;
let _depTimer = null, _arrTimer = null;

function suggestStops(query, datalistId, getAbort, setAbort, getTimer, setTimer) {
  clearTimeout(getTimer());
  if (query.length < 2) return;
  setTimer(setTimeout(() => {
    if (getAbort()) getAbort().abort();
    const ctrl = new AbortController();
    setAbort(ctrl);
    fetch(config.api.geocoder + '?text=' + encodeURIComponent(query) + '&size=8&layers=venue&boundary.circle.lat=59.9139&boundary.circle.lon=10.7522&boundary.circle.radius=80000',
      { signal: ctrl.signal })
      .then(r => r.json())
      .then(j => {
        const dl = document.getElementById(datalistId);
        if (!dl) return;
        const stops = ((j && j.features) || []).filter(f =>
          (f.properties.category || []).some(c => TRANSIT_CATEGORIES.includes(c))
        );
        dl.innerHTML = '';
        stops.forEach(f => {
          const opt = document.createElement('option');
          opt.value = f.properties.name || f.properties.label;
          dl.appendChild(opt);
        });
      })
      .catch(() => {});
  }, 250));
}

function syncClear(inputId, clearId) {
  const btn = document.getElementById(clearId);
  const inp = document.getElementById(inputId);
  if (btn) btn.style.display = (inp && inp.value) ? 'flex' : 'none';
}

export function initSettings() {
  const depEl = document.getElementById('set-dep');
  const arrEl = document.getElementById('set-arr');
  if (depEl) depEl.addEventListener('input', e =>
    suggestStops(e.target.value.trim(), 'dep-stops',
      () => _depAbort, v => { _depAbort = v; },
      () => _depTimer, v => { _depTimer = v; }));
  if (arrEl) arrEl.addEventListener('input', e =>
    suggestStops(e.target.value.trim(), 'arr-stops',
      () => _arrAbort, v => { _arrAbort = v; },
      () => _arrTimer, v => { _arrTimer = v; }));

  ['dep', 'arr'].forEach(id => {
    const inp = document.getElementById('set-' + id);
    const btn = document.getElementById('set-' + id + '-clear');
    if (!inp || !btn) return;
    inp.addEventListener('input', () => {
      btn.style.display = inp.value ? 'flex' : 'none';
    });
    btn.addEventListener('click', () => {
      inp.value = '';
      btn.style.display = 'none';
      const dl = document.getElementById(inp.getAttribute('list'));
      if (dl) dl.innerHTML = '';
      inp.focus();
    });
  });
}

export function showSettings() {
  const ns = state.nearestStation;
  const depEl = document.getElementById('set-dep');
  const detected = document.getElementById('set-detected');

  // Dep input always visible — pre-fill from: saved > GPS station > current dir
  if (depEl) {
    const saved = loadDep();
    depEl.value = saved || (ns ? ns.name : (config.dirs[state.dIdx] ? config.dirs[state.dIdx].from : ''));
    syncClear('set-dep', 'set-dep-clear');
  }

  // GPS hint line below dep input
  if (detected) {
    if (ns) {
      const wk = walkInfo();
      detected.textContent = 'Nærmeste stasjon: ' + ns.name + ' · ' + wk.mins + ' min gange';
      detected.style.display = 'block';
      detected.style.cursor = 'pointer';
      detected.style.textDecoration = 'underline';
      detected.onclick = () => {
        if (depEl) { depEl.value = ns.name; syncClear('set-dep', 'set-dep-clear'); }
        const arrEl = document.getElementById('set-arr');
        if (arrEl) arrEl.focus();
      };
    } else {
      detected.style.display = 'none';
      detected.onclick = null;
    }
  }

  const arrEl = document.getElementById('set-arr');
  if (arrEl) { arrEl.value = loadDest() || ''; syncClear('set-arr', 'set-arr-clear'); }
  document.getElementById('set-error').style.display = 'none';
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
  const depMatchesGps = ns && ns.name.toLowerCase() === dep.toLowerCase();
  config.dirs[2] = depMatchesGps
    ? { key: 'custom-out', from: ns.name, to: arr, stopId: ns.id, toStopId: null, filter: null, geo: null, toGeo: arr, line: null }
    : { key: 'custom-out', from: dep, to: arr, stopId: null, toStopId: null, filter: null, geo: dep, toGeo: arr, line: null };
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
  config.dirs[2] = depMatchesGps
    ? { key: 'custom-out', from: dep, to: arr, stopId: ns.id, toStopId: null, filter: null, geo: null, toGeo: arr, line: null }
    : { key: 'custom-out', from: dep, to: arr, stopId: null, toStopId: null, filter: null, geo: dep, toGeo: arr, line: null };
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
