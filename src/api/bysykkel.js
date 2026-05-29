import { haver } from '../geo.js';

const INFO_URL   = 'https://gbfs.urbansharing.com/oslobysykkel.no/station_information.json';
const STATUS_URL = 'https://gbfs.urbansharing.com/oslobysykkel.no/station_status.json';
const HDR = { headers: { 'Client-Identifier': 'travel-companion-oslo' } };

let _cache = null;

export function fetchBysykkel(lat, lon) {
  const now = Date.now();
  if (_cache && now - _cache.ts < 60000) return Promise.resolve(_rank(_cache.stations, lat, lon));
  return Promise.all([
    fetch(INFO_URL, HDR).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch(STATUS_URL, HDR).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
  ]).then(([info, status]) => {
    const sm = {};
    (status.data.stations || []).forEach(s => { sm[s.station_id] = s; });
    const stations = (info.data.stations || [])
      .filter(s => sm[s.station_id] && sm[s.station_id].is_renting)
      .map(s => ({
        name:   s.name,
        lat:    s.lat,
        lon:    s.lon,
        bikes:  sm[s.station_id].num_bikes_available  || 0,
        ebikes: sm[s.station_id].num_ebikes_available || 0,
      }));
    _cache = { ts: Date.now(), stations };
    return _rank(stations, lat, lon);
  });
}

function _rank(stations, lat, lon) {
  return stations
    .map(s => ({ ...s, dist: Math.round(haver(lat, lon, s.lat, s.lon)) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3);
}
