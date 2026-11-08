import { haver, NEAR_STOP_MAX_M, NEAR_SIZE } from '../geo.js';
import config from '../config.js';
import { enturFetch } from './http.js';
import { CAT_MODE, STOP_MODE, TRANSIT_CATS } from './stopCats.js';


let _cache = null;

/** Drop it, so an explicit refresh really asks again. See entur.js. */
export function _resetNearbyCache() {
  _cache = null;
}

export function fetchNearbyStops(lat, lon) {
  const now = Date.now();
  if (_cache && now - _cache.ts < 120000 && haver(lat, lon, _cache.lat, _cache.lon) < 100)
    return Promise.resolve(_cache.stops);

  const url = config.api.geocoderReverse
    + '?point.lat=' + lat
    + '&point.lon=' + lon
    // ONE definition of nearby, shared with geo.js. This said 0.8 while
    // geo.js said 0.85 — two circles for one idea, and the map quietly saw a
    // smaller one than the list beside it.
    + '&boundary.circle.radius=' + (NEAR_STOP_MAX_M / 1000)
    + '&size=' + NEAR_SIZE
    + '&layers=venue';

  return enturFetch(url)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(json => {
      const seen = new Set();
      const stops = [];
      ((json && json.features) || []).forEach(f => {
        const cats = f.properties.category || [];
        const fLat = f.geometry.coordinates[1];
        const fLon = f.geometry.coordinates[0];
        const name = f.properties.name || f.properties.label || '';
        if (!fLat || !name) return;
        const baseId = f.properties.id || f.properties.gid || '';
        const dist = Math.round(haver(lat, lon, fLat, fLon));
        // Emit one entry per distinct transit mode served by this place
        const modesAdded = new Set();
        cats.forEach(cat => {
          // STOP_MODE, not CAT_MODE. The narrow table has no `tramStop` and
          // no `railStation`, so Bybanen and every railway station were
          // dropped here without a trace — part of what was reported as stops
          // the app cannot find in Bergen.
          const mode = STOP_MODE[cat];
          if (!mode || modesAdded.has(mode)) return;
          modesAdded.add(mode);
          const uid = baseId + '|' + mode;
          if (seen.has(uid)) return;
          seen.add(uid);
          stops.push({ id: uid, name, lat: fLat, lon: fLon, mode, dist });
        });
      });
      _cache = { ts: now, lat, lon, stops };
      return stops;
    });
}

/* LINJER PER HOLDEPLASS (v1.218.6). Geokoderen sier hvor en holdeplass er,
 * ikke hva som går der. Kartet trenger det siste for å vise bare holdeplasser
 * som gir en linje ingen nærmere har. Én spørring for alle, husket per id. */
const _linjer = new Map();
export function _resetStoppLinjer() { _linjer.clear(); _info.clear(); }

/* VIKTIGHET (v1.218.10). Bestilt: «Vi trenger et system for å rangere
 * stoppesteder (uavhengig av transportmiddel) … flere transportmidler og
 * ruter/linjer på topp, og med kriterier som kan skille nr. 2 fra nr. 3.»
 *
 * Kriteriene, i rekkefølge — hver skiller bare der de foregående står likt:
 *   1. transportmidler   T-bane + buss slår buss alene, uansett antall linjer
 *   2. linjer            flere ulike linjer
 *   3. plattformer       plattformer med linjer — flere retninger og bytter
 * Linjene er ukjente til spørringen har svart: da teller geokoderens
 * transportmidler, med 0 linjer og 0 plattformer, så et ukjent stopp aldri
 * går foran et kjent med like mange transportmidler. */
const _info = new Map();
export function stoppInfo(id) { return _info.get(id); }
export function viktighet(s, info) {
  if (info) return info;
  return { moduser: ((s && s.modes) || []).slice(), linjer: 0, plattformer: 0 };
}
/** <0 når a er viktigst. */
export function sammenlignViktighet(a, b) {
  return (b.moduser.length - a.moduser.length) || (b.linjer - a.linjer) || (b.plattformer - a.plattformer);
}
/** Svar → Map(id → {moduser, linjer, plattformer}). */
export function infoFraSvar(j) {
  const m = new Map();
  ((j && j.data && j.data.stopPlaces) || []).forEach(sp => {
    if (!sp || !sp.id) return;
    const linjer = new Set(), moduser = [];
    let plattformer = 0;
    (sp.quays || []).forEach(q => {
      const ls = (q && q.lines) || [];
      if (ls.length) plattformer++;
      ls.forEach(l => { if (!l || !l.id) return; linjer.add(l.id); if (l.transportMode && !moduser.includes(l.transportMode)) moduser.push(l.transportMode); });
    });
    m.set(sp.id, { moduser, linjer: linjer.size, plattformer });
  });
  return m;
}

/** Svar → Map(id → [linje-id …]), alle plattformene slått sammen. */
export function linjerFraSvar(j) {
  const m = new Map();
  ((j && j.data && j.data.stopPlaces) || []).forEach(sp => {
    if (!sp || !sp.id) return;
    const ids = [];
    (sp.quays || []).forEach(q => (q && q.lines || []).forEach(l => { if (l && l.id && !ids.includes(l.id)) ids.push(l.id); }));
    m.set(sp.id, ids);
  });
  return m;
}

/** @returns {Promise<Map|null>} `null` når vi ikke fikk svar — da skjules ingenting. */
export function fetchStoppLinjer(ids) {
  const nye = [...new Set((ids || []).filter(id => id && !_linjer.has(id)))];
  if (!nye.length) return Promise.resolve(_linjer);
  const q = '{ stopPlaces(ids:' + JSON.stringify(nye) + ') { id quays { lines { id transportMode } } } }';
  return enturFetch(config.api.journeyPlanner, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }),
  })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(j => { linjerFraSvar(j).forEach((v, k) => _linjer.set(k, v)); infoFraSvar(j).forEach((v, k) => _info.set(k, v)); return _linjer; })
    .catch(() => null);
}
export function stoppLinjer(id) { return _linjer.get(id); }
