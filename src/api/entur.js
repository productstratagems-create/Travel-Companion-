import config from '../config.js';
import { boardGQL, trackGQL, tripGQL } from './queries.js';
import { logMsg, setDot } from '../ui/log.js';
import { loadWalkSpeed } from '../geo.js';
const WALK_MPS = { rolig: 41.67 / 60, middels: 83.33 / 60, rask: 116.67 / 60 };

let boardController = null;
let tripController = null;

const TRANSIT_CAT = ['metroStation', 'busStation', 'onstreetBus', 'tramStation', 'ferryStop'];

export function resolveStop(dir) {
  if (dir.stopId) return Promise.resolve(dir.stopId);
  return fetch(config.api.geocoder + '?text=' + encodeURIComponent(dir.geo) + '&size=10&layers=venue&focus.point.lat=59.9139&focus.point.lon=10.7522')
    .then(r => r.json())
    .then(json => {
      const ff = ((json && json.features) || [])
        .filter(f => (f.properties.category || []).some(c => TRANSIT_CAT.includes(c)));
      const q = dir.geo.toLowerCase();
      const m = ff.find(f =>
        (f.properties.category || []).indexOf('metroStation') !== -1
        && (f.properties.label || '').toLowerCase().indexOf(q) !== -1
      ) || ff.find(f => (f.properties.label || '').toLowerCase().indexOf(q) !== -1);
      if (!m) throw new Error('Fant ikke ' + dir.geo);
      dir.stopId = m.properties.id;
      dir._fromLat = m.geometry.coordinates[1];
      dir._fromLon = m.geometry.coordinates[0];
      logMsg('stop: ' + dir.from + ' = ' + dir.stopId, 'ok');
      return dir.stopId;
    });
}

export function resolveToStop(dir) {
  if (dir.toStopId) return Promise.resolve(dir.toStopId);
  return fetch(config.api.geocoder + '?text=' + encodeURIComponent(dir.toGeo) + '&size=10&layers=venue&focus.point.lat=59.9139&focus.point.lon=10.7522')
    .then(r => r.json())
    .then(json => {
      const ff = ((json && json.features) || [])
        .filter(f => (f.properties.category || []).some(c => TRANSIT_CAT.includes(c)));
      const q = dir.toGeo.toLowerCase();
      const m = ff.find(f =>
        (f.properties.category || []).indexOf('metroStation') !== -1
        && (f.properties.label || '').toLowerCase().indexOf(q) !== -1
      ) || ff.find(f =>
        ['busStation', 'onstreetBus'].some(c => (f.properties.category || []).indexOf(c) !== -1)
        && (f.properties.label || '').toLowerCase().indexOf(q) !== -1
      ) || ff.find(f => (f.properties.label || '').toLowerCase().indexOf(q) !== -1);
      if (!m) throw new Error('Fant ikke ' + dir.toGeo);
      dir.toStopId = m.properties.id;
      logMsg('stop: ' + dir.to + ' = ' + dir.toStopId, 'ok');
      return dir.toStopId;
    });
}

export function resolveViaStop(dir) {
  if (dir.viaStopId) return Promise.resolve(dir.viaStopId);
  if (!dir.viaGeo) return Promise.resolve(null);
  return fetch(config.api.geocoder + '?text=' + encodeURIComponent(dir.viaGeo) + '&size=10&layers=venue&focus.point.lat=59.9139&focus.point.lon=10.7522')
    .then(r => r.json())
    .then(json => {
      const ff = ((json && json.features) || [])
        .filter(f => (f.properties.category || []).some(c => TRANSIT_CAT.includes(c)));
      const q = dir.viaGeo.toLowerCase();
      const m = ff.find(f =>
        (f.properties.category || []).indexOf('metroStation') !== -1
        && (f.properties.label || '').toLowerCase().indexOf(q) !== -1
      ) || ff.find(f => (f.properties.label || '').toLowerCase().indexOf(q) !== -1);
      if (!m) throw new Error('Fant ikke via: ' + dir.viaGeo);
      dir.viaStopId = m.properties.id;
      return dir.viaStopId;
    });
}

export function geocodePlace(query) {
  return fetch(config.api.geocoder
    + '?text=' + encodeURIComponent(query)
    + '&size=8&layers=venue,address&focus.point.lat=59.9139&focus.point.lon=10.7522')
    .then(r => r.json())
    .then(json => ((json && json.features) || [])
      .filter(f => f.geometry && f.geometry.coordinates && f.geometry.coordinates[1])
      .map(f => ({
        label: f.properties.label || f.properties.name || '',
        lat:   f.geometry.coordinates[1],
        lon:   f.geometry.coordinates[0],
      }))
    );
}

export function fetchTrip(dir, onSuccess, onError) {
  if (tripController) tripController.abort();
  tripController = new AbortController();
  const signal = tripController.signal;

  setDot('loading');
  Promise.all([resolveStop(dir), resolveToStop(dir), resolveViaStop(dir)])
    .then(([fromId, toId, viaId]) => {
      if (signal.aborted) return;
      const walkSpeedMs = WALK_MPS[loadWalkSpeed()] || WALK_MPS.middels;
      logMsg('trip → ' + fromId + (viaId ? ' via ' + viaId : '') + ' → ' + toId);
      return fetch(config.api.journeyPlanner, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: tripGQL(fromId, toId, viaId || null, 12, walkSpeedMs) }),
        signal,
      });
    })
    .then(r => {
      if (!r || signal.aborted) return;
      logMsg('← ' + r.status);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(j => {
      if (!j || signal.aborted) return;
      if (!j.data) throw new Error((j.errors && j.errors[0] && j.errors[0].message) || 'No data');
      const patterns = (j.data.trip && j.data.trip.tripPatterns) || [];
      const sitStop = j.data.stopPlace || {};
      const sitMap = new Map();
      const addSits = (arr) => (arr || []).forEach(s => s && s.id && sitMap.set(s.id, s));
      addSits(sitStop.situations);
      (sitStop.estimatedCalls || []).forEach(call => {
        addSits(call.situations);
        if (call.serviceJourney) addSits(call.serviceJourney.situations);
      });
      setDot('ok');
      onSuccess(patterns, Array.from(sitMap.values()));
    })
    .catch(err => {
      if (err.name === 'AbortError') return;
      logMsg('✗ trip ' + err.message, 'err');
      setDot('error');
      if (onError) onError(err.message);
    });
}

export function fetchBoard(dir, onSuccess, onError) {
  if (boardController) boardController.abort();
  boardController = new AbortController();
  const signal = boardController.signal;
  const count = dir.key === 'in' ? 35 : 12;

  setDot('loading');
  resolveStop(dir)
    .then(id => {
      if (signal.aborted) return;
      logMsg('board → ' + id);
      return fetch(config.api.journeyPlanner, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: boardGQL(id, count) }),
        signal,
      });
    })
    .then(r => {
      if (!r || signal.aborted) return;
      logMsg('← ' + r.status);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(j => {
      if (!j || signal.aborted) return;
      if (j.errors) throw new Error(j.errors[0].message);
      const stop = j.data && j.data.stopPlace;
      if (!stop) throw new Error('Ingen data');
      onSuccess(stop);
    })
    .catch(err => {
      if (err.name === 'AbortError') return;
      logMsg('✗ ' + err.message, 'err');
      setDot('error');
      if (onError) onError(err.message);
    });
}

export function fetchTrack(journeyId) {
  return fetch(config.api.journeyPlanner, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: trackGQL(journeyId) }),
  })
    .then(r => r.json())
    .then(j => {
      const sj = j && j.data && j.data.serviceJourney;
      return (sj && sj.estimatedCalls) || null;
    });
}

export function fetchSelJourney(journeyId) {
  return fetch(config.api.journeyPlanner, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: trackGQL(journeyId) }),
  })
    .then(r => r.json())
    .then(j => {
      const sj = j && j.data && j.data.serviceJourney;
      return (sj && sj.estimatedCalls) || null;
    });
}
