import config from '../config.js';
import { enturFetch } from './http.js';
import { arrBoardGQL, boardGQL, inflightGQL, journeyGQL, trackGQL, tripGQL } from './queries.js';
import { quayLatLon } from './adapt.js';
import { logMsg, setDot } from '../ui/log.js';
import { loadWalkSpeed } from '../geo.js';
const WALK_MPS = { rolig: 41.67 / 60, middels: 83.33 / 60, rask: 116.67 / 60 };

let boardController = null;
let tripController = null;

const TRANSIT_CAT = [
  'railStation', 'metroStation', 'busStation', 'onstreetBus', 'onstreetTram',
  'tramStation', 'harbourPort', 'airport', 'ferryStop', 'GroupOfStopPlaces', 'StopPlace',
];
export { TRANSIT_CAT };

export function resolveStop(dir, signal) {
  // Prefer the stop id. Passing coordinates instead makes OTP run a foot-access
  // search and add walking time to the platform, which silently drops departures
  // it judges unreachable — the user loses the very next one. This app already
  // computes and shows its own walk time and reachability, so letting OTP also
  // subtract it double-counts, and it hides options rather than flagging them.
  // Coordinates remain the fallback for origins that aren't transit stops.
  if (dir.stopId) return Promise.resolve(dir.stopId);
  if (dir._fromLat && dir._fromLon) return Promise.resolve({ lat: dir._fromLat, lon: dir._fromLon });
  if (!dir.geo) return Promise.reject(new Error('Mangler avgangssted'));
  return enturFetch(config.api.geocoder + '?text=' + encodeURIComponent(dir.geo) + '&size=10&layers=venue&focus.point.lat=59.9139&focus.point.lon=10.7522', { signal })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(json => {
      const ff = ((json && json.features) || [])
        .filter(f => (f.properties.category || []).some(c => TRANSIT_CAT.includes(c)));
      const q = dir.geo.toLowerCase();
      const m = ff.find(f =>
        (f.properties.category || []).indexOf('metroStation') !== -1
        && (f.properties.label || '').toLowerCase().indexOf(q) !== -1
      ) || ff.find(f => (f.properties.label || '').toLowerCase().indexOf(q) !== -1);
      if (m) {
        dir.stopId = m.properties.id;
        dir._fromLat = m.geometry.coordinates[1];
        dir._fromLon = m.geometry.coordinates[0];
        logMsg('stop: ' + dir.from + ' = ' + dir.stopId, 'ok');
        return dir.stopId;
      }
      // Not a transit stop — fall back to a general place/address lookup so
      // trip planning can still start from these coordinates.
      return geocodePlace(dir.geo, signal).then(results => {
        if (!results.length) throw new Error('Fant ikke ' + dir.geo);
        dir._fromLat = results[0].lat;
        dir._fromLon = results[0].lon;
        logMsg('sted: ' + dir.from + ' = ' + dir._fromLat + ',' + dir._fromLon, 'ok');
        return { lat: dir._fromLat, lon: dir._fromLon };
      });
    });
}

export function resolveToStop(dir, signal) {
  if (dir.toStopId) return Promise.resolve(dir.toStopId);
  return enturFetch(config.api.geocoder + '?text=' + encodeURIComponent(dir.toGeo) + '&size=10&layers=venue&focus.point.lat=59.9139&focus.point.lon=10.7522', { signal })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
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

export function resolveViaStop(dir, signal) {
  if (dir.viaStopId) return Promise.resolve(dir.viaStopId);
  if (!dir.viaGeo) return Promise.resolve(null);
  return enturFetch(config.api.geocoder + '?text=' + encodeURIComponent(dir.viaGeo) + '&size=10&layers=venue&focus.point.lat=59.9139&focus.point.lon=10.7522', { signal })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
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

export function geocodeDest(query) {
  return enturFetch(config.api.geocoder
    + '?text=' + encodeURIComponent(query)
    + '&size=10&layers=venue,address&focus.point.lat=59.9139&focus.point.lon=10.7522')
    .then(r => r.json())
    .then(json => {
      const mapped = ((json && json.features) || [])
        .filter(f => f.geometry && f.geometry.coordinates && f.geometry.coordinates[1])
        .map(f => {
          const isTransit = (f.properties.category || []).some(c => TRANSIT_CAT.includes(c));
          return {
            label:    f.properties.label || f.properties.name || '',
            id:       isTransit ? f.properties.id : null,
            lat:      f.geometry.coordinates[1],
            lon:      f.geometry.coordinates[0],
            category: f.properties.category || [],
          };
        });
      // Deduplicate by label: if a transit result (has id) and a venue result share
      // the same label, keep only the transit one. Transit results sort first.
      const seen = new Map();
      mapped.sort((a, b) => (b.id ? 1 : 0) - (a.id ? 1 : 0));
      return mapped.filter(r => {
        const key = r.label.toLowerCase();
        if (seen.has(key)) return false;
        seen.set(key, true);
        return true;
      });
    });
}

export function geocodePlace(query, signal) {
  return enturFetch(config.api.geocoder
    + '?text=' + encodeURIComponent(query)
    + '&size=8&layers=venue,address&focus.point.lat=59.9139&focus.point.lon=10.7522', { signal })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(json => ((json && json.features) || [])
      .filter(f => f.geometry && f.geometry.coordinates && f.geometry.coordinates[1])
      .map(f => ({
        label:    f.properties.label || f.properties.name || '',
        lat:      f.geometry.coordinates[1],
        lon:      f.geometry.coordinates[0],
        category: f.properties.category || [],
      }))
    );
}

export function resolveToPlace(dir, signal) {
  if (dir.toStopId) return Promise.resolve(dir.toStopId);
  if (dir._toLat && dir._toLon) return Promise.resolve({ lat: dir._toLat, lon: dir._toLon });
  if (!dir.toGeo) return Promise.reject(new Error('Ingen destinasjon'));
  return resolveToStop(dir, signal).catch(() =>
    geocodePlace(dir.toGeo, signal).then(results => {
      if (!results.length) throw new Error('Fant ikke ' + dir.toGeo);
      dir._toLat = results[0].lat;
      dir._toLon = results[0].lon;
      return { lat: results[0].lat, lon: results[0].lon };
    })
  );
}

export function fetchTrip(dir, onSuccess, onError) {
  if (tripController) tripController.abort();
  if (boardController) boardController.abort();
  tripController = new AbortController();
  const signal = tripController.signal;

  setDot('loading');
  Promise.all([resolveStop(dir, signal), resolveToPlace(dir, signal), resolveViaStop(dir, signal)])
    .then(([fromId, toId, viaId]) => {
      if (signal.aborted) return;
      const walkSpeedMs = WALK_MPS[loadWalkSpeed()] || WALK_MPS.middels;
      const label = p => (p && typeof p === 'object') ? p.lat + ',' + p.lon : p;
      logMsg('trip → ' + label(fromId) + (viaId ? ' via ' + viaId : '') + ' → ' + label(toId));
      const ask = (withLookback) => enturFetch(config.api.journeyPlanner, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: withLookback
            ? tripGQL(fromId, toId, viaId || null, 12, walkSpeedMs)
            : tripGQL(fromId, toId, viaId || null, 12, walkSpeedMs, null, true),
        }),
        signal,
      })
        .then(r => {
          if (!r || signal.aborted) return null;
          logMsg('← ' + r.status);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(j => {
          if (!j || signal.aborted) return j;
          // The whole board rides on this one request. v1.12.0 put the
          // in-flight window in its own query precisely so a misspelt
          // argument could not take the departure list down; asking for
          // dateTime here gives that isolation up, so buy it back — one
          // retry without the lookback rather than an empty screen.
          if (withLookback && !j.data && j.errors) {
            logMsg('trip: dateTime avvist, prøver uten', 'err');
            return ask(false);
          }
          return j;
        });
      return ask(true);
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
  if (tripController) tripController.abort();
  boardController = new AbortController();
  const signal = boardController.signal;
  const count = dir.key === 'in' ? 35 : 12;

  setDot('loading');
  resolveStop(dir, signal)
    .then(id => {
      if (signal.aborted) return;
      logMsg('board → ' + id);
      return enturFetch(config.api.journeyPlanner, {
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

/**
 * Resolves to { stop, departures, situations } — the arrival stop's onward
 * departures AND its disruptions, which no other call in the app fetches.
 */
export function fetchArrBoard(stopId, n) {
  return enturFetch(config.api.journeyPlanner, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: arrBoardGQL(stopId, n) }),
  })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(j => {
      const stop = (j && j.data && j.data.stopPlace) || null;
      const calls = (stop && stop.estimatedCalls) || [];
      const now = Date.now();

      // Deduplicate across the three levels the API reports them at.
      const sitMap = new Map();
      const addSits = arr => (arr || []).forEach(s => s && s.id && sitMap.set(s.id, s));
      addSits(stop && stop.situations);
      calls.forEach(c => {
        addSits(c.situations);
        if (c.serviceJourney) addSits(c.serviceJourney.situations);
      });
      // Cancelled departures stay in the list — hiding them sends the user
      // to a platform for a service that isn't coming.
      const departures = calls
        .map(c => ({
          ln:      c.serviceJourney && c.serviceJourney.line,
          journeyId: c.serviceJourney && c.serviceJourney.id,
          dest:    (c.destinationDisplay && c.destinationDisplay.frontText) || '',
          depTs:   new Date(c.expectedDepartureTime || c.aimedDepartureTime).getTime(),
          realtime: c.realtime || false,
          cancelled: !!c.cancellation,
          quay:    c.quay && c.quay.publicCode,
        }))
        .filter(c => c.depTs > now - 30000);

      return {
        stop: stop ? { name: stop.name, lat: stop.latitude, lon: stop.longitude } : null,
        departures,
        situations: Array.from(sitMap.values()),
      };
    });
}

export function fetchTrack(journeyId) {
  return enturFetch(config.api.journeyPlanner, {
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

/**
 * Fetch normalised real-time metadata for a locked journey.
 *
 * Returns JourneyMeta:
 *   { journeyId, calls[], cancelled, delayMins, quay, realtime, fetchedAt }
 *
 * calls[] items: { name, lat, lon, quay, aimed, expected, cancelled, realtime }
 *
 * This is the canonical way to query a specific serviceJourney by ID.
 * state.lockedJourneyMeta is kept in sync with the latest result.
 */
export function fetchJourneyMeta(journeyId) {
  return enturFetch(config.api.journeyPlanner, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: journeyGQL(journeyId) }),
  })
    .then(r => r.json())
    .then(j => {
      if (j && j.errors) throw new Error(j.errors[0].message);
      const sj = j && j.data && j.data.serviceJourney;
      if (!sj || !sj.estimatedCalls) return null;
      const calls = sj.estimatedCalls.map(c => {
        const sp = c.quay && c.quay.stopPlace;
        const ll = quayLatLon(c.quay);
        return {
          name:      (sp && sp.name) || '',
          lat:       ll ? ll.lat : null,
          lon:       ll ? ll.lon : null,
          quay:      (c.quay && c.quay.publicCode) || null,
          aimed:     c.aimedDepartureTime    || c.aimedArrivalTime    || null,
          expected:  c.expectedDepartureTime || c.expectedArrivalTime || null,
          cancelled: c.cancellation || false,
          realtime:  c.realtime || false,
          dest:      (c.destinationDisplay && c.destinationDisplay.frontText) || '',
        };
      });
      const first = calls[0] || null;
      const delayMs = first && first.aimed && first.expected
        ? new Date(first.expected).getTime() - new Date(first.aimed).getTime()
        : 0;
      return {
        journeyId,
        calls,
        cancelled: calls.length > 0 && calls.every(c => c.cancelled),
        delayMins: Math.round(delayMs / 60000),
        quay:      first ? first.quay : null,
        realtime:  first ? first.realtime : false,
        fetchedAt: Date.now(),
        lineCode:  (sj.line && sj.line.publicCode) || '',
        lineBg:    (sj.line && sj.line.presentation && sj.line.presentation.colour) ? '#' + sj.line.presentation.colour : '',
        mode:      (sj.line && sj.line.transportMode) || 'metro',
        dest:      first ? first.dest : '',
      };
    });
}

/**
 * Trains that have already left the origin — see inflightGQL.
 *
 * Never rejects and never disturbs the board: this is extra context, and a
 * board that works is worth more than a strip that is complete.
 *
 * @returns {Promise<Array>} the raw estimatedCalls, or [] on any failure.
 */
export function fetchInflight(stopId, backMins, fwdMins) {
  if (!stopId) return Promise.resolve([]);
  return enturFetch(config.api.journeyPlanner, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: inflightGQL(stopId, backMins, fwdMins) }),
  })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(j => {
      const sp = j && j.data && j.data.stopPlace;
      return (sp && sp.estimatedCalls) || [];
    })
    .catch(() => []);
}
