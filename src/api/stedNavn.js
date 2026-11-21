/**
 * HVA HETER STEDET DU STÅR? (v1.218.197). «Du er her: Stenbråtveien 14» —
 * ditt sted, ikke et stopp. Enturs geokoder har et omvendt oppslag
 * (/reverse), det samme stoppsøket bruker. Lag `address,venue` er ikke prøvd
 * mot det ekte API-et herfra; svarer det ikke, står «nær <stopp>» — aldri tomt.
 */
import config from '../config.js';
import { enturFetch } from './http.js';

import { metresBetween } from '../haversine.js';

/* RAPPORTERT (v1.218.199): «Posisjonering og adresse korresponderer ikke.»
   To feil: svaret ble gjenbrukt for en hel rute på ~55 × 55 m (første punkt i
   ruta bestemte navnet for alle), og første treff innen 200 m ble tatt uten å
   se hvor langt unna det var — et stopp eller en butikk 150 m borte ble «din
   adresse». Nå: spørsmålet stilles for punktet (≈ 1 m nøyaktig), bare
   adresser, de nærmeste flere, og det nærmeste velges — med «nær» når det
   ikke ligger der nåla står. */
const _svar = new Map();   // punkt (5 desimaler) → navn | null
const nøkkel = ll => ll.lat.toFixed(5) + ',' + ll.lon.toFixed(5);
/** Nærmere enn dette: adressen er der du står. Lenger: «nær <adresse>». */
export const ADRESSE_HER_M = 25;
/** Lenger unna enn dette: ingen adresse — skjermen faller til «nær <stopp>». */
export const ADRESSE_MAKS_M = 120;

export function reverseUrl(ll) {
  // Samme oppslag som finner stoppene rundt deg (geo.js), allerede i bruk mot
  // Entur — én adresse i config, ikke en avledet kopi.
  return config.api.geocoderReverse
    + '?point.lat=' + ll.lat + '&point.lon=' + ll.lon + '&size=5&layers=address&boundary.circle.radius=0.15';
}

/** Navnet for punktet, fra svarets treff: det NÆRMESTE, med «nær» om det ikke er her. Ren. */
export function velgAdresse(features, ll) {
  let best = null;
  for (const f of features || []) {
    const c = f && f.geometry && f.geometry.coordinates;
    const p = f && f.properties;
    if (!c || !p) continue;
    const d = metresBetween(ll, { lat: c[1], lon: c[0] });
    if (!best || d < best.d) best = { d, navn: p.name || p.label || null };
  }
  if (!best || !best.navn || best.d > ADRESSE_MAKS_M) return null;
  return best.d <= ADRESSE_HER_M ? best.navn : 'nær ' + best.navn;
}

/* KARTVERKETS ADRESSEREGISTER FØRST (v1.218.200). Rapportert: «Appen finner
   verken korrekt veinavn eller husnummer.» Enturs geokoder er laget for søk,
   ikke for adressen i et punkt. Kartverket (Geonorge) har det offisielle
   adresseregisteret og et punktsøk som gir nærmeste vegadresse med husnummer
   og avstand. Åpent, uten nøkkel, CORS. Kan ikke prøves fra sandkassen —
   svarer det ikke, spørres Entur som før. */
export function geonorgeUrl(ll) {
  return 'https://ws.geonorge.no/adresser/v1/punktsok?lat=' + ll.lat + '&lon=' + ll.lon
    + '&radius=' + ADRESSE_MAKS_M + '&treffPerSide=5&koordsys=4258&utkoordsys=4258';
}
/** Nærmeste adresse fra Kartverkets svar. Ren. */
export function velgGeonorge(json, ll) {
  const feats = ((json && json.adresser) || []).map(a => ({
    properties: { name: a.adressetekst || ((a.adressenavn || '') + (a.nummer != null ? ' ' + a.nummer + (a.bokstav || '') : '')).trim() || null },
    geometry: { coordinates: a.representasjonspunkt ? [a.representasjonspunkt.lon, a.representasjonspunkt.lat] : null },
  })).filter(f => f.geometry.coordinates);
  return velgAdresse(feats, ll);
}
const _hent = (url, opts) => fetch(url, { signal: AbortSignal.timeout(8000), ...(opts || {}) });

/** Navnet hvis kjent; ellers undefined (spør) eller null (fant ingen). */
export function stedNavn(ll, ferdig, deps = {}) {
  if (!ll || !Number.isFinite(ll.lat)) return null;
  const k = nøkkel(ll);
  if (_svar.has(k)) return _svar.get(k);
  _svar.set(k, undefined);
  const hentG = deps.geonorge || (u => _hent(u));
  const hentE = deps.entur || (u => enturFetch(u));
  const json = r => (r && r.ok ? r.json() : null);
  hentG(geonorgeUrl(ll)).then(json).then(j => velgGeonorge(j, ll)).catch(() => null)
    .then(navn => navn || hentE(reverseUrl(ll)).then(json).then(j => velgAdresse(j && j.features, ll)).catch(() => null))
    .then(navn => _svar.set(k, navn || null))
    .finally(() => { if (ferdig) ferdig(); });
  return undefined;
}
export function _resetStedNavn() { _svar.clear(); }
