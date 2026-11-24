#!/usr/bin/env node
/**
 * TRACER 2 — GIR ET ANNET UTGANGSPUNKT EN BEDRE REISE? (ingen appendring)
 *   node scratchpad/tracerBedreReise.mjs [--json fil] [--mål N]
 *
 * Spørsmålet: du står på A. Lønner det seg å gå til B først?
 *   «fra A»      reisesøk fra A, avreise t (Entur kan selv velge å gå via B)
 *   «via B»      gange A→B (luftlinje × 1,3 / 80 m/min — Valhalla nås ikke herfra)
 *                + reisesøk fra B, avreise t + gangtid
 * Begge retninger (står på A / står på B), samme mål, flere tidspunkt.
 * Mål: et REPRESENTATIVT utvalg, stratifisert på avstandsbånd fra midtpunktet,
 * trukket deterministisk fra det begge steder når (ikke bare «unike» mål).
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
/** Tidspunkt (norsk vintertid = UTC+1): neste tirsdag 08/12/22 og lørdag 12. */
const TIDER = (() => {
  const neste = (ukedag, timeNo) => { const d = new Date(); d.setUTCHours(timeNo - 1, 0, 0, 0); while (d.getUTCDay() !== ukedag || d < new Date()) d.setUTCDate(d.getUTCDate() + 1); return d; };
  return [['tirsdag 08', neste(2, 8)], ['tirsdag 12', neste(2, 12)], ['tirsdag 22', neste(2, 22)], ['lørdag 12', neste(6, 12)]];
})();
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
      // Reelle alternativer: ulike mønstre fremme innen 30 min etter det beste (høyst 3 spurt).
      alternativer: new Set(mønstre.filter(p => ank(p) - ank(best) <= 30 * 60000).map(p => p.legs.filter(l => l.mode !== 'foot').map(l => l.serviceJourney && l.serviceJourney.line && l.serviceJourney.line.publicCode).join('>'))).size,
      linjer: reis.map(l => (l.serviceJourney && l.serviceJourney.line && l.serviceJourney.line.publicCode) || l.mode).join(' → '),
    };
  } catch (e) { return { funnet: null, feil: String(e) }; }
}

/** Du står på X; alternativet er å gå til Y først. */
function utfall(her, via) {
  if (her.funnet === null || via.funnet === null) return { klasse: 'feil' };
  if (!her.funnet && !via.funnet) return { klasse: 'ingen reise fra noen' };
  if (!her.funnet) return { klasse: 'bare via alternativet' };
  if (!via.funnet) return { klasse: 'bare herfra' };
  const min = Math.round((her.ankomst - via.ankomst) / 60000); // > 0: alternativet er fremme tidligere
  const db = her.bytter - via.bytter;                           // > 0: alternativet har færre bytter
  let klasse = 'ubetydelig';
  if (min >= UBETYDELIG_MIN || (db > 0 && min > -UBETYDELIG_MIN)) klasse = 'alternativet bedre';
  else if (min <= -UBETYDELIG_MIN || (db < 0 && min < UBETYDELIG_MIN)) klasse = 'herfra bedre';
  return { klasse, minSpart: min, bytterSpart: db, alternativer: [her.alternativer, via.alternativer] };
}

/** Representativt utvalg: per avstandsbånd fra midtpunktet, deterministisk (sortert på id). */
async function utvalg(p) {
  const midt = { lat: (p.A.lat + p.B.lat) / 2, lon: (p.A.lon + p.B.lon) / 2 };
  const tid = TIDER[1][1].toISOString();
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

const resultat = [];
for (const p of PAR) {
  kall = 0;
  const mål = await utvalg(p);
  const gang = gangMin(p.A, p.B);
  const rader = [];
  for (const [tidNavn, t] of TIDER) {
    const tGang = new Date(+t + gang * 60000);
    const r = await iPuljer(mål.map(m => async () => {
      const [aNå, bNå, aEtter, bEtter] = await Promise.all([reise(p.A, m.id, t), reise(p.B, m.id, t), reise(p.A, m.id, tGang), reise(p.B, m.id, tGang)]);
      return { tid: tidNavn, mål: m.navn, bånd: m.bånd,
        // Står på A: fra A nå, eller gå til B og reise derfra. Står på B: omvendt.
        påA: { ...utfall(aNå, bEtter), her: aNå, via: bEtter },
        påB: { ...utfall(bNå, aEtter), her: bNå, via: aEtter } };
    }));
    rader.push(...r);
  }
  resultat.push({ par: p.navn, A: p.A.navn, B: p.B.navn, gangMin: gang, mål: mål.length, kall, rader });
  console.log(p.navn, 'mål', mål.length, 'kall', kall);
}
const i = process.argv.indexOf('--json'); if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(resultat, null, 1));
