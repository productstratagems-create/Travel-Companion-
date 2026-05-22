import config from '../config.js';
import { boardGQL, trackGQL } from './queries.js';
import { logMsg, setDot } from '../ui/log.js';

let boardController = null;

export function resolveStop(dir) {
  if (dir.stopId) return Promise.resolve(dir.stopId);
  return fetch(config.api.geocoder + '?text=' + encodeURIComponent(dir.geo) + '&size=10&layers=venue')
    .then(r => r.json())
    .then(json => {
      const ff = (json && json.features) || [];
      const q = dir.geo.toLowerCase();
      const m = ff.find(f =>
        (f.properties.category || []).indexOf('metroStation') !== -1
        && (f.properties.label || '').toLowerCase().indexOf(q) !== -1
      ) || ff.find(f => (f.properties.label || '').toLowerCase().indexOf(q) !== -1);
      if (!m) throw new Error('Fant ikke ' + dir.geo);
      dir.stopId = m.properties.id;
      logMsg('stop: ' + dir.from + ' = ' + dir.stopId, 'ok');
      return dir.stopId;
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
