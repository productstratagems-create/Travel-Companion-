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

/* MÅLERUNDEN (v1.218.201). Bestilt: «Legg inn målerunden som viser hva
   Kartverket svarer.» Sandkassen når verken Kartverket eller Entur, så formen
   på svaret er fra dokumentasjonen. Hvert oppslag tar vare på hva som faktisk
   kom tilbake — status eller feil, treff, avstander, feltnavn og starten av
   råsvaret — og kartvelgeren viser det sammenfoldet. Blir på telefonen. */
const _måling = new Map();
export const RÅ_TEGN = 400;

/** Kartverkets treff som enkle rader. Ren. */
function kvRader(json) {
  return ((json && json.adresser) || []).map(a => ({
    navn: a.adressetekst || ((a.adressenavn || '') + (a.nummer != null ? ' ' + a.nummer + (a.bokstav || '') : '')).trim() || null,
    lat: a.representasjonspunkt && a.representasjonspunkt.lat, lon: a.representasjonspunkt && a.representasjonspunkt.lon,
    mOppgitt: Number.isFinite(a.meterDistanseTilPunkt) ? Math.round(a.meterDistanseTilPunkt) : null, rå: a,
  }));
}
function enRader(json) {
  return ((json && json.features) || []).map(f => ({
    navn: f.properties && (f.properties.name || f.properties.label) || null,
    lat: f.geometry && f.geometry.coordinates && f.geometry.coordinates[1],
    lon: f.geometry && f.geometry.coordinates && f.geometry.coordinates[0], mOppgitt: null, rå: f.properties || f,
  }));
}
/** Én kildes måling fra status, råtekst og rader. Ren. */
export function målKilde({ status, feil, tekst, rader }, ll) {
  const m = { status: status != null ? status : null, feil: feil || null, antall: 0, nærmeste: [], felter: [], rå: (tekst || '').slice(0, RÅ_TEGN) };
  if (!rader) return m;
  m.antall = rader.length;
  m.felter = rader[0] && rader[0].rå ? Object.keys(rader[0].rå) : [];
  m.nærmeste = rader.map(r => ({ navn: r.navn, m: Number.isFinite(r.lat) ? Math.round(metresBetween(ll, { lat: r.lat, lon: r.lon })) : null, mOppgitt: r.mOppgitt }))
    .sort((a, b) => (a.m == null) - (b.m == null) || a.m - b.m).slice(0, 3);
  return m;
}
/** Valget fra målingen: kilde, navn og hvorfor. Ren. */
export function valgFraMåling(kv, en) {
  const fra = (kilde, m) => {
    const n = m && m.nærmeste.find(x => x.navn && x.m != null);
    if (!n || n.m > ADRESSE_MAKS_M) return null;
    return { kilde, navn: n.m <= ADRESSE_HER_M ? n.navn : 'nær ' + n.navn, m: n.m };
  };
  return fra('kartverket', kv) || fra('entur', en)
    || { kilde: 'ingen', navn: null, m: null, grunn: 'ingen adresse innen ' + ADRESSE_MAKS_M + ' m' };
}
/** Én linje: hva valget bygde på. Ren. */
export function målingLinje(mål) {
  if (!mål) return '';
  const kv = mål.kartverket, v = mål.valg || {};
  const kvFeil = kv && (kv.feil || (kv.status && kv.status !== 200) ? 'Kartverket svarte ikke (' + (kv.feil || 'HTTP ' + kv.status) + ')' : null);
  if (v.kilde === 'kartverket') return 'Kartverket · ' + v.navn + ' · ' + v.m + ' m';
  if (v.kilde === 'entur') return (kvFeil || 'Kartverket: ingen adresse') + ' → Entur · ' + v.navn + ' · ' + v.m + ' m';
  return (kvFeil ? kvFeil + ' · ' : '') + (v.grunn || 'ingen adresse');
}
export function stedMåling(ll) { return ll && Number.isFinite(ll.lat) ? _måling.get(nøkkel(ll)) || null : null; }

async function spør(hent, url, tilRader, ll) {
  try {
    const r = await hent(url);
    if (!r || !r.ok) return målKilde({ status: r && r.status, tekst: r && r.text ? await r.text() : '' }, ll);
    let json = null, tekst = '';
    if (r.text) { tekst = await r.text(); try { json = JSON.parse(tekst); } catch { return målKilde({ status: r.status, feil: 'ikke JSON', tekst }, ll); } }
    else { json = await r.json(); tekst = JSON.stringify(json); }
    return målKilde({ status: r.status, tekst, rader: tilRader(json) }, ll);
  } catch (e) {
    return målKilde({ feil: (e && (e.name === 'TimeoutError' ? 'tidsavbrudd' : e.message)) || 'nettverk' }, ll);
  }
}

/** Navnet hvis kjent; ellers undefined (spør) eller null (fant ingen). */
export function stedNavn(ll, ferdig, deps = {}) {
  if (!ll || !Number.isFinite(ll.lat)) return null;
  const k = nøkkel(ll);
  if (_svar.has(k)) return _svar.get(k);
  _svar.set(k, undefined);
  const hentG = deps.geonorge || (u => _hent(u));
  const hentE = deps.entur || (u => enturFetch(u));
  (async () => {
    const kv = await spør(hentG, geonorgeUrl(ll), kvRader, ll);
    let valg = valgFraMåling(kv, null), en = null;
    if (valg.kilde !== 'kartverket') { en = await spør(hentE, reverseUrl(ll), enRader, ll); valg = valgFraMåling(kv, en); }
    const mål = { kartverket: kv, entur: en, valg };
    _måling.set(k, mål);
    _svar.set(k, valg.navn || null);
    if (deps.logg) deps.logg('adresse: ' + målingLinje(mål));
  })().catch(() => _svar.set(k, null)).finally(() => { if (ferdig) ferdig(); });
  return undefined;
}
export function _resetStedNavn() { _svar.clear(); _måling.clear(); }
