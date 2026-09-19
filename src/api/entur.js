import config from '../config.js';
import { enturFetch } from './http.js';
import { arrBoardGQL, boardGQL, boardTruncated, nextBoardAsk, NEXT_DEPARTURE_HORIZON_MINS, inflightGQL, journeyGQL, normJid, trackGQL, tripGQL } from './queries.js';
import { quayLatLon } from './adapt.js';
import { addSituation } from './situations.js';
import { logMsg, setDot } from '../ui/log.js';
import { noteLookbackLost } from './diagnose.js';
import { loadWalkSpeed, focusParam } from '../geo.js';
const WALK_MPS = { rolig: 41.67 / 60, middels: 83.33 / 60, rask: 116.67 / 60 };

let boardController = null;
let tripController = null;

// One list, in stopCats.js. This file used to keep its own, and the two
// disagreed: ferry quays and multimodal hubs were findable by typing their
// name and invisible when you stood next to them.
export { TRANSIT_CATS as TRANSIT_CAT } from './stopCats.js';
import { TRANSIT_CATS as TRANSIT_CAT } from './stopCats.js';
import { rankPlaces } from './rankPlaces.js';

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
  return enturFetch(config.api.geocoder + '?text=' + encodeURIComponent(dir.geo) + '&size=10&layers=venue' + focusParam(), { signal })
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
  return enturFetch(config.api.geocoder + '?text=' + encodeURIComponent(dir.toGeo) + '&size=10&layers=venue' + focusParam(), { signal })
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
  return enturFetch(config.api.geocoder + '?text=' + encodeURIComponent(dir.viaGeo) + '&size=10&layers=venue' + focusParam(), { signal })
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

/**
 * @param {string} query
 * @param {object} [ctx] — {role, here, freq, now} for api/rankPlaces.js.
 *   Omitted, the order is exactly what it has always been: transit first,
 *   then Entur's own. So a caller that has no context costs nothing, and
 *   the ranking is opt-in per screen rather than a global behaviour change.
 */
export function geocodeDest(query, ctx) {
  return enturFetch(config.api.geocoder
    + '?text=' + encodeURIComponent(query)
    + '&size=10&layers=venue,address' + focusParam())
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
      const deduped = mapped.filter(r => {
        const key = r.label.toLowerCase();
        if (seen.has(key)) return false;
        seen.set(key, true);
        return true;
      });
      // Reordered, never filtered — the dedupe above is the only thing
      // allowed to drop a row.
      return ctx ? rankPlaces(deduped, { ...ctx, query }) : deduped;
    });
}

export function geocodePlace(query, signal) {
  return enturFetch(config.api.geocoder
    + '?text=' + encodeURIComponent(query)
    + '&size=8&layers=venue,address' + focusParam(), { signal })
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
/**
 * Has Entur turned down the `coach` mode this session?
 *
 * Remembered like the per-line cap and the hub fields before it: an argument
 * the schema will not accept must cost one request, not one per poll for the
 * rest of the day.
 */
/**
 * Whether the schema refused `affects` on situations.
 *
 * The one field that can say WHICH LINE a traffic message is about. Reported:
 * a bus from Bjørndal shown to a reader riding metro line 3, because the
 * message hung on the destination stop and nothing could tell them apart.
 *
 * Its type names cannot be checked from here — the proxy reaches neither
 * api.entur.io nor Entur's docs — so it is a probe with the same ladder
 * `coach` and `searchWindow` already have. Refused once, dropped for the
 * session; the fallback is provenance alone, which is today's behaviour.
 */
let _affectsRejected = false;
export function _affectsRefused() { return _affectsRejected; }
export function _resetAffectsProbe() { _affectsRejected = false; }

let _coachRejected = false;

/** Test seam. */
export function _coachRefused() { return _coachRejected; }
export function _resetCoachProbe() { _coachRejected = false; }

/**
 * …and the same for the search window. Shed FIRST of the three optional
 * arguments, because it is the newest, the most likely to be the one refused,
 * and the cheapest to lose: without it the app is exactly where it was
 * yesterday.
 */
let _windowRejected = false;
export function _windowRefused() { return _windowRejected; }
export function _resetWindowProbe() { _windowRejected = false; }

export function fetchTrip(dir, onSuccess, onError, atMs) {
  if (tripController) tripController.abort();
  if (boardController) boardController.abort();
  tripController = new AbortController();
  const signal = tripController.signal;

  setDot('loading');
  // The two named stop places, held where the SECOND .then can see them: the
  // situations that arrive attached to those stops have to be labelled with
  // which stop they came from, and the destructured ids below are scoped to
  // the first callback only. Missing them threw a ReferenceError that .catch
  // swallowed into onError — the board simply never arrived.
  let namedFrom = null, namedTo = null;
  Promise.all([resolveStop(dir, signal), resolveToPlace(dir, signal), resolveViaStop(dir, signal)])
    .then(([fromId, toId, viaId]) => {
      if (signal.aborted) return;
      namedFrom = typeof fromId === 'string' ? fromId : null;
      namedTo = typeof toId === 'string' ? toId : null;
      const walkSpeedMs = WALK_MPS[loadWalkSpeed()] || WALK_MPS.middels;
      const label = p => (p && typeof p === 'object') ? p.lat + ',' + p.lon : p;
      logMsg('trip → ' + label(fromId) + (viaId ? ' via ' + viaId : '') + ' → ' + label(toId));
      const ask = (withLookback, withCoach, withWindow, withAffects) => enturFetch(config.api.journeyPlanner, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: withLookback
            ? tripGQL(fromId, toId, viaId || null, 12, walkSpeedMs, atMs == null ? undefined : atMs,
              false, false, withCoach, withWindow, withAffects)
            // The retry deliberately drops dateTime: it is the argument that
            // could never be verified against the live API, so it is the one
            // the fallback exists to shed. The cost is real — this poll loses
            // the two-minute lookback, and with it a train standing at the
            // platform a minute late — so the diagnostic records that it
            // happened rather than trading a silent loss for a silent outage.
            : tripGQL(fromId, toId, viaId || null, 12, walkSpeedMs, atMs == null ? null : atMs, true, atMs != null, withCoach, withWindow, withAffects),
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
          // What Entur actually said. The ladder below sheds arguments one
          // at a time without knowing which was refused, and the log said only
          // that something was — so a refused searchWindow could not be told
          // from a wrong unit, a wrong name, or a value out of range. The
          // answer was in hand and thrown away.
          const why = (j.errors && j.errors[0] && j.errors[0].message)
            ? ' — ' + String(j.errors[0].message).slice(0, 160) : '';
          // The whole board rides on this one request. v1.12.0 put the
          // in-flight window in its own query precisely so a misspelt
          // argument could not take the departure list down; asking for
          // dateTime here gives that isolation up, so buy it back — one
          // retry without the lookback rather than an empty screen.
          // Coach first, because it is the argument that has never been
          // checked against the live schema and this one request carries
          // every journey. Shedding it costs the express services; shedding
          // the lookback costs a train standing at the platform. Neither is
          // worth an empty screen, and the cheaper loss goes first.
          // Cheapest first. The error does not say which argument was
          // refused, so they are shed one at a time in order of what their
          // loss costs the reader: the wider window (rural journeys we never
          // had), then the coaches, then the two-minute lookback.
          // Affects goes first of all. Shedding it costs only how well the
          // messages are sorted; shedding any of the others costs departures.
          // The cheapest loss leads, as the comment above says.
          if (withAffects && !j.data && j.errors) {
            _affectsRejected = true;
            logMsg('situasjoner: affects avvist, sorteres på herkomst' + why, 'err');
            return ask(withLookback, withCoach, withWindow, false);
          }
          if (withWindow && !j.data && j.errors) {
            _windowRejected = true;
            logMsg('søkevindu: searchWindow avvist' + why, 'err');
            return ask(withLookback, withCoach, false, withAffects);
          }
          if (withCoach && !j.data && j.errors) {
            _coachRejected = true;
            logMsg('ekspressbuss: coach avvist' + why, 'err');
            return ask(withLookback, false, withWindow, withAffects);
          }
          if (withLookback && !j.data && j.errors) {
            logMsg('trip: dateTime avvist, tilbakeblikket tapt denne pollen' + why, 'err');
            noteLookbackLost();
            return ask(false, withCoach, withWindow, withAffects);
          }
          return j;
        });
      return ask(true, !_coachRejected, !_windowRejected, !_affectsRejected);
    })
    .then(j => {
      if (!j || signal.aborted) return;
      if (!j.data) throw new Error((j.errors && j.errors[0] && j.errors[0].message) || 'No data');
      const patterns = (j.data.trip && j.data.trip.tripPatterns) || [];
      // WHERE EACH MESSAGE HUNG IS KEPT.
      //
      // This was `sitMap.set(s.id, s)`: the last hit won, and the only handle
      // this app has on relevance was thrown away on the very line that had
      // it. A situation carries no line or stop of its own, so the fact that
      // it arrived attached to the DESTINATION rather than to your leg is the
      // difference between «Skullerud er stengt» and a bus from Bjørndal.
      const sitMap = new Map();
      const addSits = (arr, from) => (arr || []).forEach(s => addSituation(sitMap, s, from));
      // Both ends the reader named…
      // Null when the route was given as raw coordinates: there is no id to
      // attribute the message to, so it stays unscoped — shown, not buried.
      addSits((j.data.stopPlace || {}).situations, { stop: namedFrom });
      addSits((j.data.dest || {}).situations, { stop: namedTo });
      // …and the journeys they would actually ride. This used to come from
      // the origin's next five departures instead, whatever line those ran.
      patterns.forEach(tp => (tp.legs || []).forEach(leg => {
        const sj = leg.serviceJourney;
        const from = {
          line: (leg.line && leg.line.id) || (sj && sj.line && sj.line.id) || null,
          journey: (sj && sj.id) || null,
        };
        addSits(leg.situations, from);
        if (sj) addSits(sj.situations, from);
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
      return { earliest: best, n: calls.length, quays, quayModes, byJourney, modes, calls };
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

/**
 * Drop it, for an explicit refresh.
 *
 * The 60-second life is right for a board that polls itself — a dispatcher
 * reassigns a platform, not three times a minute. It is wrong when someone
 * has just TAPPED refresh: a cache that answers instantly with the same thing
 * makes the button look broken, which is exactly what it would be.
 */
export function _resetStopBoardCache() {
  _sbCache.clear();
}

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

/**
 * @param {number} [want] how many departures to ask for. `numberOfDepartures`
 *   caps the WHOLE board — every line and mode share the budget — so a screen
 *   that needs several departures per direction has to say so. Measured on a
 *   Tveita-shaped stop (five directions, 4–20 min headways): at 12 only three
 *   of five directions had three departures to show; at 30, all five did.
 */
/**
 * Has the per-line cap been turned down in this session?
 *
 * In memory only. A page load probes again, which is what makes this a probe
 * rather than a permanent surrender — and what keeps the cost at one extra
 * request per session instead of one per poll.
 */
let _perLineRejected = false;

/** Test seam. */
export function _resetPerLineProbe() { _perLineRejected = false; }

/**
 * The next departure from here, whenever that is.
 *
 * Asked ONLY when the ordinary board came back empty, and asked for ONE row:
 * this is not a board, it is a sentence — «neste herfra: mandag 07:05». The
 * ninety-minute window the board uses cannot see Monday, and widening the
 * board itself would pay for two days of departures on every stop in the
 * country to serve the handful that need it.
 *
 * `boardGQL` already takes `now` and `fwdMins`; nothing new is asked of the
 * API. Whether Entur answers a two-day window the same way it answers ninety
 * minutes cannot be checked from a sandbox that does not reach api.entur.io —
 * so a failure here resolves to null and the screen falls back to what it says
 * today. The fallback is today's behaviour, not something worse.
 *
 * @returns {Promise<number|null>} the departure time in ms, or null
 */
export function fetchNextDeparture(dir, horizonMins) {
  return resolveStop(dir)
    .then(id => enturFetch(config.api.journeyPlanner, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: boardGQL(id, 1, null, true,
          horizonMins || NEXT_DEPARTURE_HORIZON_MINS),
      }),
    }))
    .then(r => (r && r.ok ? r.json() : null))
    .then(j => {
      const calls = (j && j.data && j.data.stopPlace
        && j.data.stopPlace.estimatedCalls) || [];
      const c = calls[0];
      if (!c) return null;
      const t = new Date(c.expectedDepartureTime || c.aimedDepartureTime).getTime();
      return Number.isFinite(t) ? t : null;
    })
    .catch(() => null);
}

export function fetchBoard(dir, onSuccess, onError, want, perLine) {
  if (boardController) boardController.abort();
  if (tripController) tripController.abort();
  boardController = new AbortController();
  const signal = boardController.signal;
  const count = want || (dir.key === 'in' ? 35 : 12);

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
      //
      // Three rungs now, not two, because the per-line cap is a SECOND
      // unverifiable argument. The order is deliberate: the newest and least
      // proven thing falls first, so a rejected per-line cap does not also
      // cost the reader the message text.
      //
      //   1. per-line cap + full text
      //   2. no cap + full text
      //   3. no cap + basic text   (what this did before)
      const ask = (wantPerLine, basic) => enturFetch(config.api.journeyPlanner, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: boardGQL(id, count, null, basic, null, null, wantPerLine || undefined),
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
          if (!j.data && j.errors) {
            if (wantPerLine) {
              // Remembered for the session, not for ever: a new load probes
              // again, so the day Entur supports it this starts working
              // without anyone touching the code. Remembering matters —
              // without it the board would pay two requests every 20 seconds
              // for the rest of the day.
              _perLineRejected = true;
              logMsg('board: per-linje-tak avvist, prøver uten', 'err');
              return ask(0, basic);
            }
            if (!basic) {
              logMsg('board: meldingstekst avvist, prøver uten', 'err');
              return ask(0, true);
            }
          }
          return j;
        });
      // ONE MORE RUNG, AND ONLY AT A HUB. An answer that comes back exactly at
      // the cap was cut by it, and at Jernbanetorget 30 departures is about
      // ninety seconds of traffic — line 3 toward Mortensrud was never in it.
      // A small stop never trips this and keeps the cheap request it has
      // always made; a hub pays one extra. Same shape as the per-line ladder
      // above, for the same reason: the right number cannot be known before
      // asking.
      const askedCount = count;
      return ask(_perLineRejected ? 0 : perLine, false).then(j => {
        const got = ((j && j.data && j.data.stopPlace
          && j.data.stopPlace.estimatedCalls) || []).length;
        if (!boardTruncated(got, askedCount)) return j;
        const more = nextBoardAsk(askedCount);
        if (!more) return j;
        logMsg('board: ' + got + ' av ' + askedCount + ' — spør om ' + more);
        return enturFetch(config.api.journeyPlanner, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: boardGQL(id, more, null, false, null, null,
              _perLineRejected ? undefined : (perLine || undefined)),
          }),
          signal,
        })
          .then(r => (r && r.ok && !signal.aborted ? r.json() : j))
          // A hub that answers once and fails the second time keeps the first
          // answer — a short list beats none, and the notice will say it is
          // short.
          .then(j2 => ((j2 && j2.data && j2.data.stopPlace) ? Object.assign(j2, { _asked: more }) : j))
          .catch(() => j);
      }).then(j => (j && !j._asked ? Object.assign(j, { _asked: askedCount }) : j));
    })
    .then(j => {
      if (!j || signal.aborted) return;
      if (j.errors && !j.data) throw new Error(j.errors[0].message);
      const stop = j.data && j.data.stopPlace;
      if (!stop) throw new Error('Ingen data');
      // WHAT THE LIST DOES NOT SHOW travels with it. The screen cannot say
      // «there may be more» unless something tells it, and this is the only
      // place that knows both halves.
      stop._asked = j._asked || count;
      stop._truncated = boardTruncated((stop.estimatedCalls || []).length, stop._asked);
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

/**
 * The stops of one journey, and WHEN THE ANSWER ARRIVED.
 *
 * Returned as `{ calls, fetchedAt }` rather than a bare array from v1.106.0.
 * The timestamp is the whole point: without it the tracking screen could not
 * tell a fetch that just succeeded from twenty that failed in a row, because
 * both leave the same stop list in place. It is stamped HERE, at the moment
 * the response is parsed, because that is the only place that knows — a caller
 * stamping `Date.now()` after its own `.then` would be timing itself.
 *
 * A GraphQL error is thrown rather than swallowed. It used to return null
 * indistinguishably from «no such journey», and the caller logged both to a
 * console the reader has no way to open.
 */
export function fetchTrack(journeyId) {
  return enturFetch(config.api.journeyPlanner, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: trackGQL(journeyId) }),
  })
    .then(r => r.json())
    .then(j => {
      if (j && j.errors && j.errors.length) throw new Error(j.errors[0].message);
      const sj = j && j.data && j.data.serviceJourney;
      const calls = (sj && sj.estimatedCalls) || null;
      return { calls, fetchedAt: Date.now() };
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
