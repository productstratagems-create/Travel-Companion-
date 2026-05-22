import config from '../config.js';
import { state } from '../state.js';

const STORAGE_KEY = 't.route';

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
  const dir = config.dirs[state.dIdx];
  document.getElementById('set-dep').value = dir.from;
  document.getElementById('set-arr').value = dir.to;
  document.getElementById('set-error').style.display = 'none';
}

export function applyRoute() {
  const dep = document.getElementById('set-dep').value.trim();
  const arr = document.getElementById('set-arr').value.trim();
  const errEl = document.getElementById('set-error');
  if (!dep || !arr) {
    errEl.textContent = 'Fyll inn begge stasjoner.';
    errEl.style.display = 'block';
    return false;
  }
  if (dep.toLowerCase() === arr.toLowerCase()) {
    errEl.textContent = 'Fra og til kan ikke være samme stasjon.';
    errEl.style.display = 'block';
    return false;
  }
  config.dirs[2] = {
    key: 'custom-out',
    from: dep,
    to: arr,
    stopId: null,
    filter: new RegExp(arr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
    geo: dep,
  };
  state.dIdx = 2;
  saveCustomRoute(dep, arr);
  return true;
}

export function saveCustomRoute(dep, arr) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ dep, arr })); } catch {}
}

export function loadCustomRoute() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const { dep, arr } = JSON.parse(raw);
    if (dep && arr) {
      config.dirs[2] = {
        key: 'custom-out',
        from: dep,
        to: arr,
        stopId: null,
        filter: new RegExp(arr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
        geo: dep,
      };
      state.dIdx = 2;
    }
  } catch {}
}
