/**
 * PLATTFORMENE PÅ EN STASJON (v1.218.56). Bestilt: «bedre/mer detaljerte
 * kart for stasjonsområder med merking av spor og holdeplassmerking». Det
 * etablerte i reiseapper (Entur, Ruter, Google): hvert spor/plattform får sin
 * egen markør med koden, og gangruten ender ved plattformen avgangen går fra.
 *
 * Entur kjenner hver plattform (quay) med koordinat og kode. Appen hentet
 * dem for avgangene, men tegnet bare stasjonens midtpunkt. Ett oppslag per
 * stasjon, mellomlagret for økta (registeret endrer seg i uker, ikke sekunder).
 */
import config from '../config.js';
import { enturFetch } from './http.js';
import { plattformTekst } from '../bytte.js';

const _cache = new Map();   // stopId → Array | Promise | null

/** Svaret, gjort om til plattformer med kode og koordinat. Ren. */
export function plattformerFraSvar(j) {
  const sp = j && j.data && j.data.stopPlace;
  return ((sp && sp.quays) || [])
    .filter(q => q && q.publicCode && Number.isFinite(q.latitude) && Number.isFinite(q.longitude))
    .map(q => {
      const moduser = [...new Set((q.lines || []).map(l => l && l.transportMode).filter(Boolean))];
      return { id: q.id, kode: String(q.publicCode), lat: q.latitude, lon: q.longitude, modus: moduser[0] || null,
        tekst: plattformTekst(String(q.publicCode), moduser[0] || null) };
    });
}

/** Plattformene, når de er hentet; ellers undefined (spurt nå) eller null (feil). */
export function plattformer(stopId) {
  const v = _cache.get(stopId);
  return Array.isArray(v) || v === null ? v : undefined;
}

export function hentPlattformer(stopId) {
  if (!stopId) return Promise.resolve(null);
  const v = _cache.get(stopId);
  if (v !== undefined) return Promise.resolve(v && v.then ? v : v);
  const q = '{stopPlace(id:"' + stopId + '"){id quays{id publicCode latitude longitude lines{transportMode}}}}';
  const p = enturFetch(config.api.journeyPlanner, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }),
  })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(j => { const l = plattformerFraSvar(j); _cache.set(stopId, l); return l; })
    .catch(() => { _cache.set(stopId, null); return null; });
  _cache.set(stopId, p);
  return p;
}

/** Plattformen med denne koden, eller null. Ren. */
export function plattformMedKode(liste, kode) {
  if (!Array.isArray(liste) || !kode || kode === '?') return null;
  return liste.find(q => q.kode === String(kode)) || null;
}

/** Bare for tester. */
export function _nullstillPlattformer() { _cache.clear(); }
