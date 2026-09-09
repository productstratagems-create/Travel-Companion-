import { haver } from '../geo.js';

import { discoverSystems, MOBILITY_BASE } from './mobility.js';
import { ET_CLIENT_NAME } from './http.js';
import { logMsg } from '../ui/log.js';

/**
 * Oslo Bysykkel's own feed — now the LAST RUNG, not the only one.
 *
 * A reader in Bergen was shown Oslo's docks, three hundred kilometres away:
 * the host, and the client id, both said oslo. Entur carries every Norwegian
 * city-bike scheme under one API, so the app asks which ones exist and uses
 * the docked ones near you. When discovery says nothing, this is what was
 * here before.
 */
const OSLO_INFO   = 'https://gbfs.urbansharing.com/oslobysykkel.no/station_information.json';
const OSLO_STATUS = 'https://gbfs.urbansharing.com/oslobysykkel.no/station_status.json';
const HDR = { headers: { 'Client-Identifier': 'travel-companion-oslo' } };
const ENTUR_HDR = { headers: { 'ET-Client-Name': ET_CLIENT_NAME } };

/** Which discovered systems are docked city-bike schemes. */
export function bikeSystems(found) {
  return (found || []).filter(f => /bysykkel|citybike|bikeshare/i.test(f.id));
}

function _fromEntur(sys) {
  return Promise.all([
    fetch(`${MOBILITY_BASE}/${sys.id}/station_information`, ENTUR_HDR).then(r => r.json()),
    fetch(`${MOBILITY_BASE}/${sys.id}/station_status`, ENTUR_HDR).then(r => r.json()),
  ]).then(([info, status]) => _join(info, status));
}

let _cache = null;

export function fetchBysykkel(lat, lon) {
  const now = Date.now();
  if (_cache && now - _cache.ts < 60000) return Promise.resolve(_rank(_cache.stations, lat, lon));
  return discoverSystems().then(found => {
    const systems = bikeSystems(found);
    logMsg('bysykkel: ' + systems.length + ' systemer'
      + (systems.length ? '' : ' (ingen oppdaget, bruker Oslo)'),
    systems.length ? 'ok' : null);
    if (!systems.length) {
      return Promise.all([
        fetch(OSLO_INFO, HDR).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
        fetch(OSLO_STATUS, HDR).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      ]).then(([info, status]) => _join(info, status));
    }
    // Every discovered scheme, and let distance decide. Asking which CITY the
    // reader is in would mean a table of cities written from memory; the
    // ranking below already answers it from the coordinates.
    return Promise.allSettled(systems.map(_fromEntur))
      .then(rs => rs.flatMap(r => (r.status === 'fulfilled' ? r.value : [])));
  }).then(stations => {
    _cache = { ts: Date.now(), stations };
    return _rank(stations, lat, lon);
  });
}

/** One station list from the two GBFS documents. Shared by both rungs. */
function _join(info, status) {
  const sm = {};
  (((status && status.data && status.data.stations) || [])).forEach(s => { sm[s.station_id] = s; });
  return (((info && info.data && info.data.stations) || []))
    .filter(s => sm[s.station_id] && sm[s.station_id].is_renting)
    .map(s => ({
      name:   s.name,
      lat:    s.lat,
      lon:    s.lon,
      bikes:  sm[s.station_id].num_bikes_available  || 0,
      ebikes: sm[s.station_id].num_ebikes_available || 0,
      // A ride needs a free dock to END, not just a bike to start. Both
      // numbers ride along in the same payload; only bikes were kept.
      docks:  sm[s.station_id].num_docks_available ?? null,
      capacity: s.capacity ?? null,
      returning: sm[s.station_id].is_returning !== false,
    }));
}

function _rank(stations, lat, lon) {
  return stations
    .map(s => ({ ...s, dist: Math.round(haver(lat, lon, s.lat, s.lon)) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3);
}
