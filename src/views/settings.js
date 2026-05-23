import config from '../config.js';
import { state } from '../state.js';
import { walkInfo } from '../geo.js';

const DEST_KEY = 't.dest';

const METRO_STATIONS = [
  'Avløs', 'Bergkrystallen', 'Bekkestua', 'Bogerud', 'Bryn', 'Brynseng', 'Bøler',
  'Eiksmarka', 'Ellingsrudåsen', 'Ensjø', 'Etterstad',
  'Frognerseteren', 'Gjønnes', 'Godlia', 'Grinilund', 'Grønland', 'Gulleråsen',
  'Hauger', 'Haugerud', 'Helsfyr', 'Holmenkollen', 'Holmlia',
  'Jar', 'Jernbanetorget', 'Kolsås',
  'Lilleaker', 'Løren',
  'Majorstuen', 'Midtstuen', 'Mortensrud', 'Munkerud',
  'Nationaltheatret',
  'Oppsal', 'Østerås',
  'Ringstabekkveien', 'Ringen', 'Romsås', 'Røa',
  'Sinsen', 'Skullerud', 'Skøyen', 'Stortinget',
  'Tøyen',
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
  const depWrap = document.getElementById('set-dep-wrap');
  const detected = document.getElementById('set-detected');
  if (ns) {
    if (depWrap) depWrap.style.display = 'none';
    if (detected) {
      const wk = walkInfo();
      detected.textContent = 'Nærmeste stasjon: ' + ns.name + ' · ' + wk.mins + ' min gange';
      detected.style.display = 'block';
    }
  } else {
    if (depWrap) depWrap.style.display = 'block';
    if (detected) detected.style.display = 'none';
    const dir = config.dirs[state.dIdx];
    const depEl = document.getElementById('set-dep');
    if (depEl) depEl.value = dir ? dir.from : '';
  }
  const arrEl = document.getElementById('set-arr');
  if (arrEl) arrEl.value = loadDest() || '';
  document.getElementById('set-error').style.display = 'none';
}

export function applyRoute() {
  const ns = state.nearestStation;
  const dep = ns ? ns.name : (document.getElementById('set-dep').value.trim());
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
  config.dirs[2] = ns
    ? { key: 'custom-out', from: ns.name, to: arr, stopId: ns.id, toStopId: null, filter: null, geo: null, toGeo: arr, line: null }
    : { key: 'custom-out', from: dep, to: arr, stopId: null, toStopId: null, filter: null, geo: dep, toGeo: arr, line: null };
  state.dIdx = 2;
  saveDest(arr);
  return true;
}

export function applyRouteFromState(arr) {
  const ns = state.nearestStation;
  if (!ns || !arr) return false;
  config.dirs[2] = {
    key: 'custom-out',
    from: ns.name,
    to: arr,
    stopId: ns.id,
    toStopId: null,
    filter: null,
    geo: null,
    toGeo: arr,
    line: null,
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

// Kept for backward compat — no-op; GPS now determines departure
export function loadCustomRoute() {}
