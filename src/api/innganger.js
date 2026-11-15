/**
 * INNGANGENE TIL STASJONEN (v1.218.57). Bestilt som «nr. 3» etter
 * stasjonskartet: Entur kjenner plattformene, men ikke dørene. Ved T-bane og
 * tog er det inngangen som avgjør hvilken side av gata du skal gå til. OSM
 * kjenner dem (railway=subway_entrance / train_station_entrance).
 *
 * PROBE: Overpass kan ikke nås fra sandkassen. Svarer den ikke, eller finnes
 * ingen innganger, tegnes ingenting og gangruten går som før (til plattformen).
 */
import { fetchMedFrist } from './http.js';
import { haver } from '../haversine.js';

const _OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const INNGANG_RADIUS_M = 250;
const _cache = new Map();   // stopId → Array | Promise | null

/** Overpass-svaret som innganger. Ren. */
export function inngangerFraSvar(j) {
  return ((j && j.elements) || [])
    .filter(e => e && e.type === 'node' && Number.isFinite(e.lat) && Number.isFinite(e.lon))
    .map(e => {
      const t = e.tags || {};
      return { id: e.id, lat: e.lat, lon: e.lon, navn: t.name || null, ref: t.ref || null,
        trinnfri: t.wheelchair === 'yes' };
    });
}

/** Inngangene, når de er hentet; ellers undefined (spurt nå) eller null (feil). */
export function innganger(stopId) {
  const v = _cache.get(stopId);
  return Array.isArray(v) || v === null ? v : undefined;
}

export function hentInnganger(stopId, ll) {
  if (!stopId || !ll) return Promise.resolve(null);
  const v = _cache.get(stopId);
  if (v !== undefined) return Promise.resolve(v);
  const pos = ll.lat.toFixed(6) + ',' + ll.lon.toFixed(6);
  const ql = '[out:json][timeout:15];node["railway"~"^(subway_entrance|train_station_entrance)$"](around:'
    + INNGANG_RADIUS_M + ',' + pos + ');out 40;';
  const p = fetchMedFrist(_OVERPASS_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(ql),
  })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(j => { const l = inngangerFraSvar(j); _cache.set(stopId, l); return l; })
    .catch(() => { _cache.set(stopId, null); return null; });
  _cache.set(stopId, p);
  return p;
}

/**
 * Inngangen du skal bruke: den som gir kortest vei fra deg, inn, og videre
 * til plattformen. Ikke den nærmeste plattformen, og ikke den nærmeste deg
 * alene. Ren. Null uten innganger eller posisjon.
 */
export function valgtInngang(liste, fra, til) {
  if (!Array.isArray(liste) || !liste.length || !fra || !til) return null;
  let best = null, bestM = Infinity;
  liste.forEach(e => {
    const m = haver(fra.lat, fra.lon, e.lat, e.lon) + haver(e.lat, e.lon, til.lat, til.lon);
    if (m < bestM) { bestM = m; best = e; }
  });
  return best;
}

/** Bare for tester. */
export function _nullstillInnganger() { _cache.clear(); }

/**
 * INNGANGER I EN RUTE (v1.218.59), for stasjonslaget på alle kart. Samme
 * rutenett som plattformene (`ruterFor` i quays.js), ett Overpass-oppslag per rute.
 */
const _ruter = new Map();
export function inngangerIRute(nøkkel) {
  const v = _ruter.get(nøkkel);
  return Array.isArray(v) ? v : null;
}
export function hentInngangerRute(nøkkel, grad) {
  if (_ruter.has(nøkkel)) return Promise.resolve(_ruter.get(nøkkel));
  const [la, lo] = nøkkel.split(',').map(Number);
  const s = la * grad, v = lo * grad;
  const bbox = [s, v, s + grad, v + grad].map(x => x.toFixed(5)).join(',');
  const ql = '[out:json][timeout:15];node["railway"~"^(subway_entrance|train_station_entrance)$"](' + bbox + ');out 80;';
  const p = fetchMedFrist(_OVERPASS_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(ql),
  })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(j => { const l = inngangerFraSvar(j); _ruter.set(nøkkel, l); return l; })
    .catch(() => { _ruter.set(nøkkel, null); return null; });
  _ruter.set(nøkkel, p);
  return p;
}
export function _nullstillInngangRuter() { _ruter.clear(); }
