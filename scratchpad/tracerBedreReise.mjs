#!/usr/bin/env node
/**
 * TRACER 2 — GIR ET ANNET UTGANGSPUNKT EN BEDRE REISE? (ingen appendring)
 *   node scratchpad/tracerBedreReise.mjs --tirsdag ÅÅÅÅ-MM-DD [--json fil] [--utvalg fil] [--mål N]
 *   node scratchpad/tracerBedreReise.mjs --analyse fil.json[.gz]   (ingen nettkall: tabellene i rapporten)
 *
 * Tidspunktene er FASTE: tirsdagen som oppgis, kl. 08, 12 og 22, og lørdagen fire
 * dager etter, kl. 12 — norsk vintertid (+01:00). (Før: «neste tirsdag 08» regnet
 * fra kjøretidspunktet, så en kjøring etter kl. 08 la 08-tidspunktet en uke senere
 * enn de andre — skjedde i kjøring 2.) Hvert tidspunkt lagres som ISO på hver rad.
 * Utvalget av mål lagres i utdata og kan gjenbrukes med --utvalg (en tidligere
 * kjørings JSON), så to kjøringer bruker de SAMME målene.
 *
 * Spørsmålet: du står på A. Lønner det seg å gå til B først?
 *   «fra A»      reisesøk fra A, avreise t (Entur kan selv velge å gå via B)
 *   «via B»      gange A→B (luftlinje × 1,3 / 80 m/min — Valhalla nås ikke herfra)
 *                + reisesøk fra B, avreise t + gangtid
 * Begge retninger (står på A / står på B), samme mål, flere tidspunkt.
 * Mål: et STRATIFISERT, DETERMINISTISK utvalg — ikke et tilfeldig eller statistisk
 * representativt. Kilde: stedene MINST ETT av utgangspunktene når med høyst ett bytte
 * ifølge utforskeren (live, tirsdag kl. 12; union, ikke snitt). Per avstandsbånd fra
 * midtpunktet sorteres stedene på NSR-id, og hvert k-te tas (k = antall / 3), høyst 3.
 * NSR-id-rekkefølgen er administrativ, ikke geografisk: spredning i retning eller
 * type er ikke sikret. Arver utforskerens grenser (ett bytte, ordinært vindu, ≤ 15
 * knutepunkter). Samme mål på alle tidspunkt i en kjøring.
 * Merk: reisesøket starter LOOKBACK_MINS (2 min) før oppgitt tid — gir B ≤ 2 min fordel.
 * Utfall per mål: B bedre / A bedre / ubetydelig / ingen reise fra noen / bare én.
 */
import { utforsk, områdeFor, PARAMETRE } from '../src/nettverksutforsker.js';
import { ettByttVeier } from '../src/ettBytte.js';
import { reisesøkGql } from '../src/reisebekreftelse.js';
import { metresBetween } from '../src/haversine.js';
import { writeFileSync } from 'node:fs';

const JP = 'https://api.entur.io/journey-planner/v3/graphql';
const H = { 'Content-Type': 'application/json', 'ET-Client-Name': 'travelcompanion-tracer' };
let kall = 0;
const hent = async (_n, req) => { kall++; const r = await fetch(req.url, { method: req.method || 'GET', body: req.body, headers: H }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const MÅL_PER_BÅND = Number(arg('--mål', 3));

const PAR = [
  { navn: 'Mortensrud ↔ Hauketo stasjon', A: { navn: 'Mortensrud', lat: 59.8487, lon: 10.8291 }, B: { navn: 'Hauketo stasjon', lat: 59.845998, lon: 10.803123 } },
  { navn: 'Helsfyr ↔ Oslo S', A: { navn: 'Helsfyr', lat: 59.912673, lon: 10.801052 }, B: { navn: 'Oslo S', lat: 59.910357, lon: 10.753051 } },
  { navn: 'Nesttun ↔ Paradis', A: { navn: 'Nesttun', lat: 60.3197, lon: 5.3537 }, B: { navn: 'Paradis', lat: 60.3355, lon: 5.3399 } },
];
/** Faste tidspunkt fra --tirsdag (norsk vintertid, +01:00). Ingen avhengighet av når skriptet kjøres. */
function tider(tirsdag) {
  if (!/^\d{4}-\d\d-\d\d$/.test(tirsdag || '')) throw new Error('oppgi --tirsdag ÅÅÅÅ-MM-DD');
  const t = new Date(tirsdag + 'T00:00:00Z');
  if (t.getUTCDay() !== 2) throw new Error(tirsdag + ' er ikke en tirsdag');
  const lør = new Date(+t + 4 * 86400000).toISOString().slice(0, 10);
  return [['tirsdag 08', tirsdag + 'T08:00:00+01:00'], ['tirsdag 12', tirsdag + 'T12:00:00+01:00'], ['tirsdag 22', tirsdag + 'T22:00:00+01:00'], ['lørdag 12', lør + 'T12:00:00+01:00']]
    .map(([n, iso]) => [n, new Date(iso), iso]);
}
/** Ubetydelig: under så mange minutter, og samme antall bytter. */
export const UBETYDELIG_MIN = 5;

const gangMin = (a, b) => Math.round(metresBetween(a, b) * 1.3 / 80);

async function reise(fra, destId, avreise) {
  const q = '{' + reisesøkGql(fra, destId, avreise.toISOString(), 't') + '}';
  try {
    const j = await hent('reisesøk', { url: JP, method: 'POST', body: JSON.stringify({ query: q }) });
    const mønstre = ((j.data && j.data.t && j.data.t.tripPatterns) || []).filter(p => p.legs && p.legs.length);
    if (!mønstre.length) return { funnet: false };
    const ank = p => Date.parse(p.legs[p.legs.length - 1].expectedEndTime);
    const best = mønstre.slice().sort((a, b) => ank(a) - ank(b))[0];
    const reis = best.legs.filter(l => l.mode !== 'foot');
    return {
      funnet: true, ankomst: ank(best), bytter: Math.max(0, reis.length - 1),
      // Første reiseetappes avgang (ikke lagret i kjøring 1 og 2).
      avgang: reis.length ? Date.parse(reis[0].expectedStartTime) : null,
      // Reelle alternativer: ulike mønstre fremme innen 30 min etter det beste (høyst 3 spurt).
      alternativer: new Set(mønstre.filter(p => ank(p) - ank(best) <= 30 * 60000).map(p => p.legs.filter(l => l.mode !== 'foot').map(l => l.serviceJourney && l.serviceJourney.line && l.serviceJourney.line.publicCode).join('>'))).size,
      linjer: reis.map(l => (l.serviceJourney && l.serviceJourney.line && l.serviceJourney.line.publicCode) || l.mode).join(' → '),
      moduser: reis.map(l => l.mode),
      // Egne felt (tid ≠ kvalitet): gange i reisesøket og tid om bord/ventende fra første til siste reiseetappe.
      gangMin: Math.round(best.legs.filter(l => l.mode === 'foot').reduce((n, l) => n + (Date.parse(l.expectedEndTime) - Date.parse(l.expectedStartTime)), 0) / 60000),
      kollektivMin: reis.length ? Math.round((Date.parse(reis[reis.length - 1].expectedEndTime) - Date.parse(reis[0].expectedStartTime)) / 60000) : 0,
      direkte: reis.length === 1,
    };
  } catch (e) { return { funnet: null, feil: String(e) }; }
}

/**
 * Du står på X; alternativet er å gå til Y først. RAPPORTENS kategorier
 * (docs/tracer-bedre-reise.md), regnet bare fra ankomst og bytter:
 *   raskere           Y minst UBETYDELIG_MIN min tidligere fremme
 *   langsommere       Y minst UBETYDELIG_MIN min senere
 *   samme, færre / like mange / flere bytter   innenfor ± UBETYDELIG_MIN
 *   uavklart: ingen fra noen / bare herfra / bare via alternativet / feil
 * «Samme tid, færre bytter» er en avveining, ikke «bedre». (Kjøring 1 og 2 lagret en
 * eldre klassifisering i feltet `klasse`, der den var regnet som «alternativet bedre»;
 * rapportens tall er regnet med denne funksjonen fra rådata — se --analyse.)
 */
export function kategori(her, via) {
  if (her.funnet === null || via.funnet === null) return { kategori: 'uavklart: feil' };
  if (!her.funnet && !via.funnet) return { kategori: 'uavklart: ingen fra noen' };
  if (!her.funnet) return { kategori: 'uavklart: bare via alternativet' };
  if (!via.funnet) return { kategori: 'uavklart: bare herfra' };
  const min = Math.round((her.ankomst - via.ankomst) / 60000); // > 0: alternativet er fremme tidligere
  const db = her.bytter - via.bytter;                           // > 0: alternativet har færre bytter
  const k = min >= UBETYDELIG_MIN ? 'raskere' : min <= -UBETYDELIG_MIN ? 'langsommere'
    : db > 0 ? 'samme, færre bytter' : db < 0 ? 'samme, flere bytter' : 'samme, like mange bytter';
  return { kategori: k, minSpart: min, bytterSpart: db };
}

/** Tabellene i rapporten fra lagret rådata (ingen nettkall). */
function analyse(data) {
  const c = new Map(), tid = new Map(), modus = new Map(), diff = [], færre = [];
  const tell = (m, k, x) => { const t = m.get(k) || m.set(k, new Map()).get(k); t.set(x, (t.get(x) || 0) + 1); };
  let n = 0;
  for (const p of data) for (const r of p.rader) for (const [side, her] of [['påA', p.A], ['påB', p.B]]) {
    const { kategori: k, minSpart } = kategori(r[side].her, r[side].via); n++;
    c.set(k, (c.get(k) || 0) + 1); tell(tid, r.tid + (r.avreise ? ' (' + r.avreise + ')' : ''), k);
    if (minSpart != null) diff.push(minSpart);
    const ms = new Set(r[side].via.moduser || []);
    if (r[side].via.funnet && ms.size) tell(modus, ms.has('rail') ? 'tog' : ms.has('metro') ? 'T-bane' : ms.has('tram') ? 'trikk/bybane' : 'buss/annet', k);
    if (k === 'samme, færre bytter') færre.push([her, r.mål]);
  }
  diff.sort((a, b) => a - b); const q = f => diff[Math.floor(f * (diff.length - 1))];
  console.log('sammenligninger', n);
  for (const [k, v] of [...c].sort()) console.log('  ' + k + ': ' + v + ' (' + Math.round(100 * v / n) + ' %)');
  console.log('tidsforskjell (min, + = alternativet tidligere): p10', q(0.1), 'p25', q(0.25), 'median', q(0.5), 'p75', q(0.75), 'p90', q(0.9), 'maks', diff[diff.length - 1]);
  for (const [t, m] of tid) console.log('  ' + t + ': ' + JSON.stringify(Object.fromEntries(m)));
  for (const [t, m] of modus) console.log('  alternativet med ' + t + ': ' + JSON.stringify(Object.fromEntries(m)));
  // To tellinger: kombinasjoner (utgangspunkt + mål) og målnavn på tvers. Mål-id er ikke lagret i kjøring 1 og 2, så «ulike mål» hviler på navn.
  console.log('samme tid, færre bytter:', færre.length, 'tilfeller,', new Set(færre.map(x => x.join(' → '))).size, 'kombinasjoner av utgangspunkt og mål,', new Set(færre.map(x => x[1])).size, 'ulike målnavn');
}

/** Stratifisert, deterministisk utvalg (IKKE representativt): per avstandsbånd fra midtpunktet, sortert på NSR-id, hvert k-te. */
async function utvalg(p) {
  const midt = { lat: (p.A.lat + p.B.lat) / 2, lon: (p.A.lon + p.B.lon) / 2 };
  const tid = TIDER[1][1].toISOString(); // oppdagelsen av mål: tirsdag kl. 12
  const steder = new Map();
  for (const o of [p.A, p.B]) {
    const r = await utforsk({ posisjon: o, tid }, { hent });
    const op = new Map(r.opsjoner.map(x => [x.id, x]));
    const veier = r.veier.filter(v => v.ledd === 1 && v.vindu === 'ordinært').concat(ettByttVeier(r));
    for (const v of veier) { const d = op.get(v.opsjon) && op.get(v.opsjon).destinations[0]; if (d && Number.isFinite(d.lat)) steder.set(d.id, { id: d.id, navn: op.get(v.opsjon).label || d.name, lat: d.lat, lon: d.lon }); }
  }
  const bånd = new Map();
  for (const s of steder.values()) {
    if (metresBetween(p.A, s) < 400 || metresBetween(p.B, s) < 400) continue; // utgangspunktene selv
    const b = (områdeFor(midt, s, PARAMETRE.områdeBåndKm) || '').split('|')[1];
    if (b) (bånd.get(b) || bånd.set(b, []).get(b)).push(s);
  }
  // Spredt i retning innen båndet: sortert på id (stabilt), så hvert k-te.
  return [...bånd.entries()].flatMap(([b, xs]) => { xs.sort((a, c) => (a.id < c.id ? -1 : 1)); const k = Math.max(1, Math.floor(xs.length / MÅL_PER_BÅND)); return xs.filter((_, i) => i % k === 0).slice(0, MÅL_PER_BÅND).map(s => ({ ...s, bånd: b })); });
}

async function iPuljer(oppgaver, n = 4) { const ut = []; for (let i = 0; i < oppgaver.length; i += n) ut.push(...await Promise.all(oppgaver.slice(i, i + n).map(f => f()))); return ut; }

if (process.argv.includes('--analyse')) {
  const f = arg('--analyse');
  const { readFileSync } = await import('node:fs'); const { gunzipSync } = await import('node:zlib');
  const rå = readFileSync(f); analyse(JSON.parse((f.endsWith('.gz') ? gunzipSync(rå) : rå).toString()));
  process.exit(0);
}
const TIDER = tider(arg('--tirsdag'));
const tidligere = process.argv.includes('--utvalg') ? JSON.parse((await import('node:fs')).readFileSync(arg('--utvalg'), 'utf8')) : null;
const resultat = [];
for (const p of PAR) {
  kall = 0;
  // Samme mål som en tidligere kjøring når --utvalg er gitt (utforskeren er live og varierer mellom kjøringer).
  const lagret = tidligere && (tidligere.find(x => x.par === p.navn) || {}).utvalg;
  const mål = lagret || await utvalg(p);
  const gang = gangMin(p.A, p.B);
  const rader = [];
  for (const [tidNavn, t, iso] of TIDER) {
    const tGang = new Date(+t + gang * 60000);
    const r = await iPuljer(mål.map(m => async () => {
      const [aNå, bNå, aEtter, bEtter] = await Promise.all([reise(p.A, m.id, t), reise(p.B, m.id, t), reise(p.A, m.id, tGang), reise(p.B, m.id, tGang)]);
      return { tid: tidNavn, avreise: iso, mål: m.navn, målId: m.id, bånd: m.bånd, avreiseMs: +t, gangTilAndreMin: gang,
        // Står på A: fra A nå, eller gå til B og reise derfra. Står på B: omvendt.
        påA: { ...kategori(aNå, bEtter), her: aNå, via: bEtter },
        påB: { ...kategori(bNå, aEtter), her: bNå, via: aEtter } };
    }));
    rader.push(...r);
  }
  resultat.push({ par: p.navn, A: p.A.navn, B: p.B.navn, gangMin: gang, mål: mål.length, utvalg: mål, tider: TIDER.map(x => x[2]), kall, rader });
  console.log(p.navn, 'mål', mål.length, 'kall', kall);
}
const i = process.argv.indexOf('--json'); if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(resultat, null, 1));
