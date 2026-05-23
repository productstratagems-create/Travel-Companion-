import config from '../config.js';
import { state } from '../state.js';
import { walkInfo } from '../geo.js';

const DEST_KEY = 't.dest';
const DEP_KEY = 't.dep';

const METRO_STATIONS = [
  'Avløs', 'Bergkrystallen', 'Bekkestua', 'Bogerud', 'Bryn', 'Brynseng', 'Bøler',
  'Eiksmarka', 'Ellingsrudåsen', 'Ensjø', 'Etterstad',
  'Frognerseteren', 'Furuset', 'Gjønnes', 'Godlia', 'Grinilund', 'Grønland', 'Gulleråsen',
  'Hauger', 'Haugerud', 'Hellerud', 'Helsfyr', 'Holmenkollen', 'Holmlia',
  'Jar', 'Jernbanetorget', 'Kolsås',
  'Lilleaker', 'Lindeberg', 'Løren',
  'Majorstuen', 'Midtstuen', 'Mortensrud', 'Munkerud',
  'Nationaltheatret',
  'Oppsal', 'Østerås',
  'Ringstabekkveien', 'Ringen', 'Romsås', 'Røa',
  'Sinsen', 'Skullerud', 'Skøyen', 'Skøyenåsen', 'Stortinget',
  'Trosterud', 'Tveita', 'Tøyen',
  'Ullevål stadion', 'Ulsrud',
  'Vestli', 'Vinderen', 'Voksenlia',
];

export function initSettings() {
  const dl = document.getElementById('metro-stations');
  METRO_STATIONS.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    dl.appendChild(opt);
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
  }

  // GPS hint line below dep input
  if (detected) {
    if (ns) {
      const wk = walkInfo();
      detected.textContent = 'Nærmeste stasjon: ' + ns.name + ' · ' + wk.mins + ' min gange';
      detected.style.display = 'block';
    } else {
      detected.style.display = 'none';
    }
  }

  const arrEl = document.getElementById('set-arr');
  if (arrEl) arrEl.value = loadDest() || '';
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
