/**
 * SPISESTEDER MED SMILEFJES (v1.218.328) — Mattilsynets tilsynsdata → kompakt datasett.
 *
 * Ren modul (ingen nettleser, ingen nett): brukes av `scripts/bygg-smilefjes.mjs` (CSV → rutenett-filer)
 * og av appen (rutefiler → kandidater). Kilden: https://smilefjes.mattilsynet.no/api/tilsyn.csv
 *
 * IKKE VERIFISERT mot det ekte API-et (sandkassen når ikke verten): kolonnenavn, koordinater, karakterskala
 * og lisens. Derfor: kolonnene finnes via navnelister (`KOLONNE_NAVN`), manglende påkrevde kolonner
 * kaster høyt (aldri en stille tom liste), og `KARAKTER_ORD` er en justerbar hypotese — se docs/smilefjes.md.
 */

/** Alternative navn per felt, i prioritert rekkefølge (små bokstaver, uten mellomrom/understrek). */
export const KOLONNE_NAVN = Object.freeze({
  id: ['tilsynsobjektid', 'orgnummer', 'orgnr', 'objektid'],
  navn: ['navn', 'tilsynsobjektnavn', 'virksomhetsnavn'],
  adresse: ['adrlinje1', 'adresse', 'gateadresse'],
  postnr: ['postnr', 'postnummer'],
  poststed: ['poststed', 'sted'],
  dato: ['dato', 'tilsynsdato'],
  karakter: ['totalkarakter', 'karakter', 'smilefjes'],
  lat: ['lat', 'latitude', 'breddegrad'],
  lon: ['lon', 'lng', 'longitude', 'lengdegrad'],
});
export const PÅKREVD = Object.freeze(['navn', 'dato', 'karakter']);

/** HYPOTESE (justerbar, ikke verifisert): karakter → ord. Aldri en dom om stedet, bare det Mattilsynet ga. */
export const KARAKTER_ORD = Object.freeze({ 0: 'glad', 1: 'glad', 2: 'strek', 3: 'sur' });
export const karakterOrd = k => KARAKTER_ORD[k] || 'ikke vurdert';

const norm = s => String(s || '').toLowerCase().replace(/[^a-zæøå0-9]/g, '');

/** CSV → rader av felt. Støtter anførselstegn og dobbelte anførselstegn. Ren. */
export function csvRader(csv, skille) {
  const ut = []; let rad = [], felt = '', q = false;
  const tekst = String(csv || '').replace(/^﻿/, '');
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (q) { if (c === '"') { if (tekst[i + 1] === '"') { felt += '"'; i++; } else q = false; } else felt += c; }
    else if (c === '"') q = true;
    else if (c === skille) { rad.push(felt); felt = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && tekst[i + 1] === '\n') i++; rad.push(felt); felt = ''; if (rad.length > 1 || rad[0] !== '') ut.push(rad); rad = []; }
    else felt += c;
  }
  if (felt !== '' || rad.length) { rad.push(felt); ut.push(rad); }
  return ut;
}
const gjetSkille = csv => { const h = String(csv || '').split(/\r?\n/, 1)[0] || ''; return (h.match(/;/g) || []).length >= (h.match(/,/g) || []).length ? ';' : ','; };

/** ddmmyyyy | dd.mm.yyyy | yyyy-mm-dd → 'yyyy-mm-dd' eller null. Ren. */
export function datoIso(d) {
  const s = String(d || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = /^(\d{2})[.\-/]?(\d{2})[.\-/]?(\d{4})$/.exec(s); if (m) return m[3] + '-' + m[2] + '-' + m[1];
  return null;
}

/**
 * CSV → { rader, kolonner, uten:{dato, karakter, navn}, antallTilsyn }.
 * `rader` = SISTE tilsyn per spisested (nøkkel: id, ellers navn+adresse+postnr). Eldre tilsyn teller i
 * `antallTilsyn` men vises ikke. Kaster hvis en påkrevd kolonne ikke finnes (feil høyt, ikke tom liste).
 */
export function parseTilsyn(csv) {
  const rader = csvRader(csv, gjetSkille(csv));
  if (!rader.length) throw new Error('smilefjes: tom fil');
  const hode = rader[0].map(norm), kol = {};
  for (const [felt, navn] of Object.entries(KOLONNE_NAVN)) { const i = navn.map(norm).map(n => hode.indexOf(n)).find(i => i >= 0); if (i !== undefined) kol[felt] = i; }
  const mangler = PÅKREVD.filter(f => kol[f] === undefined);
  if (mangler.length) throw new Error('smilefjes: mangler kolonne(r) ' + mangler.join(', ') + ' — fant: ' + rader[0].join(' | '));
  const hent = (r, f) => (kol[f] === undefined ? '' : String(r[kol[f]] || '').trim());
  const sist = new Map(); let antall = 0; const uten = { dato: 0, karakter: 0, navn: 0 };
  for (const r of rader.slice(1)) {
    if (r.length < 2) continue;
    antall++;
    const navn = hent(r, 'navn'), dato = datoIso(hent(r, 'dato')), k = hent(r, 'karakter');
    if (!navn) { uten.navn++; continue; }
    if (!dato) { uten.dato++; continue; }
    if (!/^\d$/.test(k)) { uten.karakter++; continue; }
    const lat = parseFloat(hent(r, 'lat').replace(',', '.')), lon = parseFloat(hent(r, 'lon').replace(',', '.'));
    const adresse = [hent(r, 'adresse'), [hent(r, 'postnr'), hent(r, 'poststed')].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const nøkkel = hent(r, 'id') || (norm(navn) + '|' + norm(adresse));
    const ny = { id: nøkkel, navn, adresse, postnr: hent(r, 'postnr'), dato, karakter: +k, lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null };
    const g = sist.get(nøkkel);
    if (!g || ny.dato > g.dato) sist.set(nøkkel, ny);
  }
  return { rader: [...sist.values()], kolonner: kol, uten, antallTilsyn: antall };
}

/* ── Rutenett: 0,1°-ruter. Appen henter bare rutene rundt stoppet. ───────── */
export const RUTE_GRAD = 0.1;
export const ruteNøkkel = (lat, lon) => Math.floor(lat / RUTE_GRAD) + '_' + Math.floor(lon / RUTE_GRAD);
/** Rutene som dekker en sirkel (m) rundt punktet. Ren. */
export function naboRuter(lat, lon, radiusM = 1500) {
  const dLat = radiusM / 111_320, dLon = radiusM / (111_320 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  const ut = new Set();
  for (const a of [lat - dLat, lat + dLat]) for (const b of [lon - dLon, lon + dLon]) ut.add(ruteNøkkel(a, b));
  return [...ut];
}
/** Rader med posisjon → { nøkkel: [[navn, lat, lon, karakter, dato, adresse], …] }. Rader uten posisjon utelates (telles av kalleren). */
export function tilRuter(rader) {
  const ut = {};
  for (const r of rader) {
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon)) continue;
    (ut[ruteNøkkel(r.lat, r.lon)] ||= []).push([r.navn, +r.lat.toFixed(5), +r.lon.toFixed(5), r.karakter, r.dato, r.adresse]);
  }
  return ut;
}
/** Rutefilenes rader → opplevelseskandidater (samme form som de andre kildene). Ren. */
export function kandidaterFraRuter(rader) {
  return (rader || []).map(([navn, lat, lon, karakter, dato, adresse]) => ({
    kilde: 'smilefjes', sid: navn + '|' + lat + ',' + lon, navn, lat, lon, adresse: adresse || null,
    kat: [{ k: 'mat', u: 'spisested', sterk: true }],
    smilefjes: { karakter, ord: karakterOrd(karakter), dato },
  }));
}
/** «glad · tilsyn 12.03.2025» — faktum med dato, aldri «beste». Ren. */
export function smilefjesTekst(s) {
  if (!s) return '';
  const [å, m, d] = String(s.dato || '').split('-');
  return 'smilefjes: ' + s.ord + (d ? ' · tilsyn ' + d + '.' + m + '.' + å : '');
}
