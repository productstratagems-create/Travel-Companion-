import { state } from './state.js';
import config from './config.js';
import { logMsg } from './ui/log.js';

export function haver(la1, lo1, la2, lo2) {
  const R = 6371000, r = Math.PI / 180;
  const dL = (la2 - la1) * r, dN = (lo2 - lo1) * r;
  const a = Math.sin(dL / 2) * Math.sin(dL / 2)
    + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dN / 2) * Math.sin(dN / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function walkInfo() {
  if (state.walkOvr !== null) return { mins: state.walkOvr, src: 'manuelt' };
  const sc = state.statLL[config.dirs[state.dIdx].key];
  if (state.homeLL && sc) {
    const d = haver(state.homeLL.lat, state.homeLL.lon, sc.lat, sc.lon);
    return { mins: Math.max(1, Math.ceil(d * 1.3 / 83.3)) + 1, dist: Math.round(d), src: 'beregnet' };
  }
  return { mins: config.defaultWalkMinutes, src: 'standard' };
}

export function mToLeave(depTs) {
  const w = walkInfo();
  return Math.floor((depTs - w.mins * 60000 - Date.now()) / 60000);
}

export function reachCls(mtl) {
  if (mtl > 5)  return 'r-ok';
  if (mtl > 1)  return 'r-soon';
  if (mtl >= 0) return 'r-now';
  return 'missed';
}

export function findArr(calls, name) {
  if (!calls || !name) return null;
  const norm = s => s.toLowerCase().replace(/\s+t$/i, '').trim();
  const n = norm(name);
  for (let i = 0; i < calls.length; i++) {
    const nm = (calls[i].quay && calls[i].quay.stopPlace && calls[i].quay.stopPlace.name) || '';
    if (norm(nm) === n) return calls[i];
  }
  return null;
}

export function findNearestStation(lat, lon, onFound, onFail) {
  fetch(config.api.geocoderReverse
    + '?point.lat=' + lat + '&point.lon=' + lon
    + '&boundary.circle.radius=5000&size=10&layers=venue')
    .then(r => r.json())
    .then(j => {
      const metros = ((j && j.features) || [])
        .filter(f => (f.properties.category || []).includes('metroStation'))
        .map(f => ({
          name: f.properties.name || f.properties.label,
          id: f.properties.id,
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
          distM: Math.round(haver(lat, lon, f.geometry.coordinates[1], f.geometry.coordinates[0])),
        }))
        .sort((a, b) => a.distM - b.distM)
        .slice(0, 5);
      if (!metros.length) { if (onFail) onFail('ingen stasjon i nærheten'); return; }
      state.nearestStations = metros;
      state.nearestStation = metros[0];
      state.statLL['custom-out'] = { lat: metros[0].lat, lon: metros[0].lon };
      logMsg('nærmeste: ' + metros[0].name, 'ok');
      updateWalkDbg();
      if (onFound) onFound(metros[0]);
    })
    .catch(err => { if (onFail) onFail(err.message); });
}

export function locateUser(onFound, onFail) {
  if (!navigator.geolocation) {
    logMsg('geolokasjon ikke tilgjengelig', 'err');
    if (onFail) onFail('geolokasjon ikke tilgjengelig');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      state.gpsError = null;
      state.homeLL = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      logMsg('✓ posisjon ' + state.homeLL.lat.toFixed(4) + ',' + state.homeLL.lon.toFixed(4), 'ok');
      updateWalkDbg();
      findNearestStation(pos.coords.latitude, pos.coords.longitude, onFound, onFail);
    },
    err => {
      if (err.code === 1) state.gpsError = 'denied';
      logMsg('posisjon: ' + err.message, 'err');
      if (onFail) onFail(err.message);
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
  );
}

export function refreshPosition() {
  if (!navigator.geolocation || !state.homeLL) return;
  navigator.geolocation.getCurrentPosition(
    pos => {
      state.homeLL = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      updateWalkDbg();
    },
    () => {},
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }
  );
}

export function updateWalkDbg() {
  const el = document.getElementById('walk-dbg');
  if (!el) return;
  const w = walkInfo();
  el.textContent = w.src + ': ~' + w.mins + ' min' + (w.dist ? ' (' + w.dist + ' m)' : '');
}
