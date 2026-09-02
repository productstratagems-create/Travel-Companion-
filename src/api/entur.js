import config from '../config.js';
import { enturFetch } from './http.js';
import { arrBoardGQL, boardGQL, inflightGQL, journeyGQL, normJid, trackGQL, tripGQL } from './queries.js';
import { quayLatLon } from './adapt.js';
import { logMsg, setDot } from '../ui/log.js';
import { noteLookbackLost } from './diagnose.js';
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

/**
 * @param {number} [atMs] Plan from this instant instead of now — the trip
 *   home, set hours earlier, wants the departures around when you actually
 *   leave rather than the ones going now.
 */
export function fetchTrip(dir, onSuccess, onError, atMs) {
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
            ? tripGQL(fromId, toId, viaId || null, 12, walkSpeedMs, atMs == null ? undefined : atMs)
            // The retry deliberately drops dateTime: it is the argument that
            // could never be verified against the live API, so it is the one
            // the fallback exists to shed. The cost is real — this poll loses
            // the two-minute lookback, and with it a train standing at the
            // platform a minute late — so the diagnostic records that it
            // happened rather than trading a silent loss for a silent outage.
            : tripGQL(fromId, toId, viaId || null, 12, walkSpeedMs, atMs == null ? null : atMs, true, atMs != null),
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
            logMsg('trip: dateTime avvist, prøver uten — tilbakeblikket tapt for denne pollen', 'err');
            noteLookbackLost();
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
      const sitMap = new Map();
      const addSits = (arr) => (arr || []).forEach(s => s && s.id && sitMap.set(s.id, s));
      // Both ends the reader named…
      addSits((j.data.stopPlace || {}).situations);
      addSits((j.data.dest || {}).situations);
      // …and the journeys they would actually ride. This used to come from
      // the origin's next five departures instead, whatever line those ran.
      patterns.forEach(tp => (tp.legs || []).forEach(leg => {
        addSits(leg.situations);
        if (leg.serviceJourney) addSits(leg.serviceJourney.situations);
      }));
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

// Paging has its own controller, and touches neither of the other two.
//
// fetchTrip and fetchBoard each abort BOTH of the others, and swallow
// AbortError silently — so a "load more" sent through them would be killed by
// the next 20-second poll, and would kill that poll in return, with nothing
// on screen to say so.
let pageController = null;

/**
 * One page of departures beyond what the board already has.
 *
 * @param {number} atMs Plan from this instant — the horizon, since OTP has no
 *   page cursor and `dateTime` is the only handle there is.
 */
export function fetchTripPage(dir, atMs, n, onSuccess, onError) {
  if (pageController) pageController.abort();
  pageController = new AbortController();
  const signal = pageController.signal;
  Promise.all([resolveStop(dir, signal), resolveToPlace(dir, signal), resolveViaStop(dir, signal)])
    .then(([fromId, toId, viaId]) => {
      if (signal.aborted) return null;
      const walkSpeedMs = WALK_MPS[loadWalkSpeed()] || WALK_MPS.middels;
      return enturFetch(config.api.journeyPlanner, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: tripGQL(fromId, toId, viaId || null, n || 12, walkSpeedMs, atMs) }),
        signal,
      }).then(r => {
        if (!r || signal.aborted) return null;
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    })
    .then(j => {
      if (!j || signal.aborted) return;
      if (!j.data) throw new Error((j.errors && j.errors[0] && j.errors[0].message) || 'No data');
      onSuccess(((j.data.trip && j.data.trip.tripPatterns) || []));
    })
    .catch(err => {
      if (err.name === 'AbortError') return;
      logMsg('✗ side: ' + err.message, 'err');
      if (onError) onError(err.message);
    });
}

/** The same, for a board with no destination set. */
export function fetchBoardPage(dir, atMs, n, onSuccess, onError) {
  if (pageController) pageController.abort();
  pageController = new AbortController();
  const signal = pageController.signal;
  resolveStop(dir, signal)
    .then(id => {
      if (signal.aborted) return null;
      // The window has to move with the horizon, not just the row count.
      return enturFetch(config.api.journeyPlanner, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: boardGQL(id, n || 12, atMs, false, 180) }),
        signal,
      }).then(r => {
        if (!r || signal.aborted) return null;
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    })
    .then(j => {
      if (!j || signal.aborted) return;
      const stop = j.data && j.data.stopPlace;
      if (!stop) throw new Error('Ingen data');
      onSuccess(stop.estimatedCalls || []);
    })
    .catch(err => {
      if (err.name === 'AbortError') return;
      logMsg('✗ side: ' + err.message, 'err');
      if (onError) onError(err.message);
    });
}

/**
 * What the STOP BOARD itself is showing — the same question Ruter answers,
 * asked so the two can be compared.
 *
 * Its own request, unguarded by the shared controllers: a diagnostic must not
 * be able to cancel the board it is diagnosing.
 *
 * Reported: "det ser ut som du kun viser avganger fra ett av sporene". The app
 * asks the trip planner for JOURNEYS A→B, and the platform each one boards at
 * is whatever OTP picked. Nothing in the app filters by platform — but the
 * only way to tell "Entur only offers this one" from "we drop the others" is
 * to ask the stop and compare, which is what the platform tally is for.
 *
 * Twenty rather than five: five departures on a trunk stop is one platform's
 * worth, which would make the comparison useless on precisely the stops where
 * the question comes up.
 *
 * @returns {Promise<{earliest:number|null, n:number, quays:Object}|null>}
 */
export function fetchStopBoardSummary(stopId, modes) {
  return enturFetch(config.api.journeyPlanner, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: boardGQL(stopId, 20, null, true, null, modes) }),
  })
    .then(r => (r && r.ok ? r.json() : null))
    .then(j => {
      const calls = (j && j.data && j.data.stopPlace && j.data.stopPlace.estimatedCalls) || [];
      let best = null;
      const quays = {};
      const byJourney = {};
      const modes = {};
      // Which mode is seen at each platform, so a caller can compare like
      // with like. Without it the tally sets bus bays against a metro-only
      // board and reports platforms we are "missing" that carry buses the
      // reader has switched off. First seen wins; a bay serving two modes is
      // rare enough that naming one of them beats naming none.
      const quayModes = {};
      calls.forEach(c => {
        const t = new Date(c.expectedDepartureTime || c.aimedDepartureTime || NaN).getTime();
        if (!isNaN(t) && (best == null || t < best)) best = t;
        const q = (c.quay && c.quay.publicCode) || '?';
        quays[q] = (quays[q] || 0) + 1;
        const sj = c.serviceJourney;
        const ln = sj && sj.line;
        if (ln && ln.transportMode && !quayModes[q]) quayModes[q] = ln.transportMode;
        // Normalised, because the realtime feed hands back a lowercase
        // codespace ("rut:ServiceJourney:…") where the trip planner uses the
        // NeTEx one ("RUT:…"). Match on the raw strings and NOTHING lines up,
        // which reads as "these two never agree" rather than as a bug.
        if (sj && sj.id) {
          const id = normJid(sj.id);
          byJourney[id] = q;
          modes[id] = (ln && ln.transportMode) || null;
        }
      });
      return { earliest: best, n: calls.length, quays, quayModes, byJourney, modes };
    });
}

/**
 * The same answer, at most once a minute per stop.
 *
 * The platform cross-check needs this on every board render, and the board
 * polls every 20 s — three times the requests for an answer that changes when
 * a dispatcher reassigns a platform, not three times a minute. The debug
 * panel shares the same cache rather than making its own call, so opening it
 * now costs nothing.
 */
const _sbCache = new Map();
const SB_TTL_MS = 60_000;

export function stopBoardSummary(stopId, modes) {
  if (!stopId) return Promise.resolve(null);
  // The modes are part of the identity: asking for metro and asking for
  // everything give different boards, and a cache that ignored that would
  // serve one as the other.
  const key = stopId + '|' + (Array.isArray(modes) ? modes.slice().sort().join(',') : '');
  const hit = _sbCache.get(key);
  if (hit && Date.now() - hit.ts < SB_TTL_MS) return hit.p;
  const p = fetchStopBoardSummary(stopId, modes).catch(() => null);
  _sbCache.set(key, { ts: Date.now(), p });
  return p;
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
      // The whole departure list rides on this one request, and it has never
      // had a way back from a rejected field — unlike fetchTrip, which has
      // retried without its optional extras since v1.22.0. The situation
      // text fields are unverifiable from here, so buy the same insurance:
      // one retry with the basic fragment rather than an empty board.
      const ask = (basic) => enturFetch(config.api.journeyPlanner, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: boardGQL(id, count, null, basic) }),
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
          if (!basic && !j.data && j.errors) {
            logMsg('board: meldingstekst avvist, prøver uten', 'err');
            return ask(true);
          }
          return j;
        });
      return ask(false);
    })
    .then(j => {
      if (!j || signal.aborted) return;
      if (j.errors && !j.data) throw new Error(j.errors[0].message);
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
