/**
 * Which shared-mobility systems exist near you.
 *
 * Both micromobility callers were pinned to Oslo: `scooters.js` asked three
 * operators named `boltoslo`/`voioslo`/`tieroslo`, and `bysykkel.js` fetched
 * Oslo Bysykkel's own host with `travel-companion-oslo` in the header. In
 * Bergen the scooter layer was empty and the city-bike layer was Oslo's
 * docks, hundreds of kilometres away.
 *
 * Entur aggregates every Norwegian system under one API, and its root lists
 * them. So: ask, and use what comes back.
 *
 * A LADDER, and the last rung is today's behaviour. The exact shape of the
 * discovery response cannot be checked from this sandbox — the proxy does not
 * reach api.entur.io — so the parser accepts the shapes the GBFS spec allows
 * and treats anything else as "no answer". Then the caller uses its own
 * hardcoded list, and the screen is exactly what it is today. A guess that
 * fails costs nothing; that is the only reason it is safe to make one.
 *
 * The result is logged, so the debug panel can say which systems were found.
 * An instrument that cannot be read is how three fixes in this project failed
 * to instrument anything.
 */
import { ET_CLIENT_NAME } from './http.js';
import { logMsg } from '../ui/log.js';

export const MOBILITY_BASE = 'https://api.entur.io/mobility/v2/gbfs';
const HDR = { headers: { 'ET-Client-Name': ET_CLIENT_NAME } };

let _systems = null;      // null = not asked yet, [] = asked and got nothing

/**
 * @returns {Promise<Array<{id: string}>>} possibly empty; never rejects
 */
export function discoverSystems() {
  if (_systems) return Promise.resolve(_systems);
  return fetch(MOBILITY_BASE, HDR)
    .then(r => (r.ok ? r.json() : null))
    .then(j => { _systems = parseSystems(j); return _systems; })
    .catch(() => { _systems = []; return _systems; });
}

/**
 * Pull system ids out of whatever the root returns.
 *
 * Written to accept the shapes GBFS discovery documents use — a bare array,
 * or an object with a `systems` / `datasets` list — and to ignore anything
 * else rather than throw. An id is the one field every shape agrees on.
 */
export function parseSystems(json) {
  const list = Array.isArray(json) ? json
    : (json && (json.systems || json.datasets)) || [];
  if (!Array.isArray(list)) return [];
  return list
    .map(s => (typeof s === 'string' ? { id: s } : (s && { id: s.id || s.system_id })))
    .filter(s => s && typeof s.id === 'string' && s.id);
}

/** Test seam: the discovery is asked once per session. */
export function _resetSystems() { _systems = null; }

/* ── ÉT GEOSPØRSMÅL, FRAMFOR N HELE FEEDER ──────────────────────────────
 *
 * `scooters.js` henter `free_bike_status` for HVERT oppdagede system — hele
 * landsdekkende feeder — og filtrerer så til én kilometer i `_rank`. I Oslo
 * alene er det flere operatører med tusenvis av kjøretøy hver, og leseren
 * skal se dem som står i gata hennes.
 *
 * Enturs Mobility-API har også et GraphQL-grensesnitt, og det tar
 * posisjonen som argument. Da spør appen om det den faktisk trenger.
 *
 * SKJEMAET KAN IKKE LESES HERFRA. `api.entur.io` svarer 403 gjennom denne
 * sandkassens proxy, og feltnavnene under er fra GBFS' egen modell skrevet i
 * camelCase — altså et kvalifisert gjetning, ikke et oppslag. Derfor er
 * GBFS-stien ikke en sikkerhetsmargin, men DEN FORVENTEDE STIEN til noen har
 * prøvd dette mot det ekte API-et. Avslag huskes for økta.
 */
export const MOBILITY_GQL = 'https://api.entur.io/mobility/v2/graphql';

/** Meter. Samme tall `_rank` filtrerer på, så de ikke kan drive fra hverandre. */
export const NÆR_M = 1000;

export function nærGQL(lat, lon, range) {
  return '{vehicles(lat:' + lat + ',lon:' + lon + ',range:' + (range || NÆR_M)
    + ',count:200){'
    + 'id lat lon currentRangeMeters currentFuelPercent isReserved isDisabled '
    + 'system{operator{name{translation{value}}}} '
    + 'vehicleType{formFactor}'
    + '}}';
}

/**
 * GraphQL-svaret, i den formen `_rank` alt leser.
 *
 * Oversettelsen bor HER og ikke i `scooters.js`: `_rank`, `vehicleCharge` og
 * kartlaget leser alle GBFS-navnene, og å la to kilder snakke to språk inn i
 * de samme funksjonene ville vært to tabeller for ett faktum.
 *
 * Dokkede systemer er bysykkel og hører til `bysykkel.js`; her tegnes de
 * fritt flytende. `formFactor` er GBFS' eget skille.
 */
export function parseNær(json) {
  const liste = json && json.data && json.data.vehicles;
  if (!Array.isArray(liste)) return null;        // null = «ikke noe svar»
  return liste
    .filter(v => v && v.lat != null && v.lon != null)
    .filter(v => !/station|docked/i.test((v.vehicleType && v.vehicleType.formFactor) || ''))
    .map(v => ({
      lat: v.lat, lon: v.lon,
      current_range_meters: v.currentRangeMeters,
      current_fuel_percent: v.currentFuelPercent,
      is_reserved: !!v.isReserved,
      is_disabled: !!v.isDisabled,
      _op: (v.system && v.system.operator && v.system.operator.name
        && v.system.operator.name.translation
        && v.system.operator.name.translation[0]
        && v.system.operator.name.translation[0].value) || 'delt',
    }));
}

let _gqlAvslått = false;

/** For prøvene. */
export function _resetNær() { _gqlAvslått = false; }

/**
 * @returns {Promise<Array|null>} `null` betyr «spør GBFS i stedet»
 */
export function hentNær(lat, lon) {
  if (_gqlAvslått || lat == null || lon == null) return Promise.resolve(null);
  return fetch(MOBILITY_GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ET-Client-Name': ET_CLIENT_NAME },
    body: JSON.stringify({ query: nærGQL(lat, lon, NÆR_M) }),
  })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(j => {
      // Et ukjent felt gir HTTP 200 med `{errors, data:null}`. Det er ikke
      // «ingen kjøretøy her», det er «spørsmålet gikk ikke inn».
      if (j && !j.data && j.errors) throw new Error('gql');
      const ut = parseNær(j);
      if (ut == null) throw new Error('tomt');
      logMsg('mobilitet: ' + ut.length + ' kjøretøy innen ' + NÆR_M + ' m (ett spørsmål)', 'ok');
      return ut;
    })
    .catch(() => {
      if (!_gqlAvslått) {
        _gqlAvslått = true;
        logMsg('mobilitet: geospørring avvist — henter hele feeder', 'err');
      }
      return null;
    });
}
