/**
 * HVA HETER STEDET DU STÅR? (v1.218.197). «Du er her: Stenbråtveien 14» —
 * ditt sted, ikke et stopp. Enturs geokoder har et omvendt oppslag
 * (/reverse); det er en PROBE: kan ikke prøves fra sandkassen, og svarer det
 * ikke, sier skjermen «nær <stopp>» i stedet — aldri tomt.
 */
import config from '../config.js';
import { enturFetch } from './http.js';

const _svar = new Map();   // ~50 m rute → navn | null
const rute = ll => (Math.round(ll.lat * 2000) / 2000) + ',' + (Math.round(ll.lon * 1000) / 1000);
export function reverseUrl(ll) {
  return String(config.api.geocoder).replace(/autocomplete$/, 'reverse')
    + '?point.lat=' + ll.lat + '&point.lon=' + ll.lon + '&size=1&layers=address,venue&boundary.circle.radius=0.2';
}
/** Navnet hvis kjent; ellers undefined (spør) eller null (fant ingen). */
export function stedNavn(ll, ferdig) {
  if (!ll || !Number.isFinite(ll.lat)) return null;
  const k = rute(ll);
  if (_svar.has(k)) return _svar.get(k);
  _svar.set(k, undefined);
  enturFetch(reverseUrl(ll))
    .then(r => (r && r.ok ? r.json() : null))
    .then(j => {
      const f = j && j.features && j.features[0];
      const p = f && f.properties;
      _svar.set(k, p ? (p.name || p.label || null) : null);
    })
    .catch(() => _svar.set(k, null))
    .finally(() => { if (ferdig) ferdig(); });
  return undefined;
}
export function _resetStedNavn() { _svar.clear(); }
