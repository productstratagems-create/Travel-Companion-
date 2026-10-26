import config from '../config.js';
import { enturFetch } from './http.js';
import { vehiclesGQL } from './queries.js';

/**
 * Live vehicle positions, keyed by service journey.
 *
 * Until now the icons on the maps were slid between scheduled stop times —
 * an estimate presented as a position. This asks Entur where the vehicle
 * actually is. Coverage varies by operator, so every consumer must be able
 * to do without it: on a miss, a stale reading, or any failure, callers fall
 * back to the timetable estimate and say so.
 */

// A reading older than this is not "live" any more. A feed that stopped a few
// minutes ago would drift silently, which is worse than an honest estimate —
// so it is treated as absent rather than as slightly old.
export const MAX_AGE_MS = 60_000;

// Polls, not renders. The render loop runs at 1 Hz; this keeps it from turning
// into 1 Hz of network traffic against a shared public API.
const TTL_MS = 10_000;

const _cache = new Map();   // lineRef -> { ts, promise }

/**
 * Pick the usable position for one journey out of a positions map.
 * Pure, so the staleness rule is testable without a network.
 *
 * @returns {{lat:number, lon:number, bearing:number|null, lastUpdated:number, live:true}|null}
 */
export function livePosition(positions, journeyId, now) {
  if (!positions || !journeyId) return null;
  const v = positions.get(journeyId);
  if (!v) return null;
  if (v.lat == null || v.lon == null) return null;
  if (!v.lastUpdated) return null;
  const age = (now == null ? Date.now() : now) - v.lastUpdated;
  // Guard the future too: a clock-skewed reading is not evidence of anything.
  if (age > MAX_AGE_MS || age < -MAX_AGE_MS) return null;
  return { lat: v.lat, lon: v.lon, bearing: v.bearing, lastUpdated: v.lastUpdated, live: true };
}

/** Normalise one API vehicle into the shape livePosition expects. */
export function parseVehicle(v) {
  if (!v || !v.location) return null;
  const id = v.serviceJourney && v.serviceJourney.id;
  if (!id) return null;                       // untied position — unusable
  const { latitude, longitude } = v.location;
  if (latitude == null || longitude == null) return null;
  const ts = v.lastUpdated ? new Date(v.lastUpdated).getTime() : NaN;
  if (!ts || isNaN(ts)) return null;
  return { id, lat: latitude, lon: longitude, bearing: v.bearing == null ? null : v.bearing, lastUpdated: ts };
}

export function parseVehicles(json) {
  const out = new Map();
  const list = json && json.data && json.data.vehicles;
  if (!Array.isArray(list)) return out;
  list.forEach(v => {
    const p = parseVehicle(v);
    if (p) out.set(p.id, p);
  });
  return out;
}

/**
 * @param {string} lineRef e.g. "RUT:Line:5"
 * @returns {Promise<Map<string, object>>} never rejects — an empty map means
 *   "no live data", which callers already handle.
 */
export function fetchVehiclePositions(lineRef) {
  if (!lineRef) return Promise.resolve(new Map());
  const hit = _cache.get(lineRef);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.promise;

  const promise = enturFetch(config.api.vehicles, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: vehiclesGQL(lineRef) }),
  })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(parseVehicles)
    .catch(() => new Map());

  _cache.set(lineRef, { ts: Date.now(), promise });
  return promise;
}

/* ── DEN SIST KJENTE POSISJONEN, LESBAR MED ÉN GANG ────────────────────────
 *
 * `fetchVehiclePositions` gir et løfte. En render trenger et SVAR nå. Så
 * begge skjermene som tegner kjøretøy skrev sin egen lille mellomlagring
 * rundt den — og de ble tvillinger:
 *
 *   views/board.js:1420  _refreshLivePositions(lineRef)
 *   views/track.js:203   _refreshTrackLive(lineRef)
 *
 * Samme 10 sekunder, samme sletting ved linjeskifte, samme vakt mot et svar
 * som kommer for sent. Ingen av dem hadde en test. En tredje kopi, for
 * avgangsdetaljer, ville vært signaturfeilen begått med vilje.
 *
 * OG NÅR DET BLE ÉTT STED, FORSVANT TO AV DE TRE DELENE.
 *
 * Tvillingene holdt ÉN luke pluss en `_liveLine` de måtte tømme når linja
 * skiftet, og en vakt mot at et svar for gammel linje landet i den. Lagres
 * svaret per lineRef i stedet, kan linje A sitt svar aldri leses som linje
 * B sitt — og da trengs verken slettingen eller vakten. De var ikke to
 * regler; de var én nøkkel som manglet.
 */
const _snap = new Map();   // lineRef -> Map<journeyId, position>
const _at   = new Map();   // lineRef -> da vi sist spurte

/**
 * Siste kjente posisjoner for linja, og en ny forespørsel når det er på tide.
 *
 * Svaret er alltid et Map — tomt når ingenting har kommet ennå — aldri null,
 * slik at hver leser kan gjøre `livePosition(feed, id, now)` uten vakt.
 *
 * @param {string|null} lineRef
 * @param {function(Map, string)=} onUpdate kalles når et NYTT svar kommer.
 *   Tavla logger treffene der; det er det eneste instrumentet som noen gang
 *   kan svare på om Entur i det hele tatt dækker en gitt linje, og det svarer
 *   bare fra en ekte tur.
 */
export function livePosFeed(lineRef, onUpdate) {
  if (!lineRef) return new Map();
  const now = Date.now();
  if (now - (_at.get(lineRef) || 0) >= TTL_MS) {
    _at.set(lineRef, now);
    fetchVehiclePositions(lineRef).then(m => {
      _snap.set(lineRef, m);
      if (onUpdate) onUpdate(m, lineRef);
    });
  }
  // En kopi, ikke luka selv: en leser som skrev i den ville endret hva de
  // andre skjermene ser, og det er nettopp den slags deling ingen oppdager.
  return new Map(_snap.get(lineRef) || []);
}

/** Test seam, and used when the profile or route changes. */
export function _resetVehicleCache() {
  _cache.clear();
  _snap.clear();
  _at.clear();
}
