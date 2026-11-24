#!/usr/bin/env node
/**
 * TRACER DEL B — SAMMENLIGN TO UTGANGSPUNKTER (ingen appendring).
 *   node scratchpad/tracerSammenlign.mjs [--json fil]
 *
 * Mot ekte Entur, dagtid (i morgen kl. 12 norsk tid). For hvert par:
 * oppdagelse fra begge (utforsk), distinkte muligheter på kommune- og
 * områdenivå (område regnet fra MIDTPUNKTET, så begge måles i samme rutenett),
 * forklarende reiserute, og etterprøving: reisesøk fra BEGGE til et utvalg
 * «bare fra A»-mål.
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
const geo = async u => { kall++; return (await fetch(u, { headers: H })).json(); };

const PAR = [
  { navn: 'Mortensrud ↔ Hauketo stasjon', A: { navn: 'Mortensrud', lat: 59.8487, lon: 10.8291 }, B: { navn: 'Hauketo stasjon', lat: 59.845998, lon: 10.803123 } },
  { navn: 'Helsfyr ↔ Oslo S', A: { navn: 'Helsfyr', lat: 59.912673, lon: 10.801052 }, B: { navn: 'Oslo S', lat: 59.910357, lon: 10.753051 } },
];
const tid = (() => { const d = new Date(); d.setUTCHours(11, 0, 0, 0); if (d < new Date()) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString(); })();

const lt = (r, d) => { const g = (r.grupper.linjeretning[d]) || {}; return (g.modus === 'metro' ? 'T-bane ' : g.modus === 'tram' ? 'trikk ' : g.modus === 'rail' ? 'tog ' : g.modus === 'water' ? 'båt ' : g.modus === 'coach' ? 'ekspr. ' : '') + (g.kode || '?'); };

/** Det A kan nå: sted-id → { navn, lat, lon, ledd (1 hvis direkte finnes), rute (kortest forklaring) }. */
function nåbart(r) {
  const op = new Map(r.opsjoner.map(o => [o.id, o]));
  const kn = new Map((r.knutepunkter.vurdert || []).map(k => [k.id, k.navn]));
  const ut = new Map();
  const legg = (v, rute, ledd) => {
    const o = op.get(v.opsjon), d = o && o.destinations && o.destinations[0];
    if (!d) return;
    const e = ut.get(d.id);
    if (!e || ledd < e.ledd) ut.set(d.id, { id: d.id, navn: o.label || d.name, lat: d.lat, lon: d.lon, ledd, rute });
  };
  for (const v of r.veier) if (v.ledd === 1 && v.vindu === 'ordinært') legg(v, lt(r, v.directionId) + ' direkte', 1);
  for (const v of ettByttVeier(r)) legg(v, lt(r, v.inn) + ' → ' + (kn.get(v.knute) || v.knute) + ' → ' + lt(r, v.directionId), 2);
  return ut;
}

async function kommuner(ider) {
  const m = new Map();
  for (let i = 0; i < ider.length; i += 50) {
    const j = await geo('https://api.entur.io/geocoder/v1/place?ids=' + ider.slice(i, i + 50).join(','));
    for (const f of j.features || []) if (f.properties.locality) m.set(f.properties.id, f.properties.locality);
  }
  return m;
}

/** Reisesøk fra et punkt til et stoppested: { funnet, bytter, min, via } for mønsteret som er fremme først. */
async function reise(fra, destId) {
  const q = '{' + reisesøkGql(fra, destId, tid, 't') + '}';
  try {
    const j = await hent('reisesøk', { url: JP, method: 'POST', body: JSON.stringify({ query: q }) });
    const m = ((j.data && j.data.t && j.data.t.tripPatterns) || []).filter(p => p.legs && p.legs.length)
      .sort((a, b) => Date.parse(a.legs[a.legs.length - 1].expectedEndTime) - Date.parse(b.legs[b.legs.length - 1].expectedEndTime))[0];
    if (!m) return { funnet: false };
    const reis = m.legs.filter(l => l.mode !== 'foot');
    return { funnet: true, bytter: Math.max(0, reis.length - 1), min: Math.round((Date.parse(m.legs[m.legs.length - 1].expectedEndTime) - Date.parse(tid)) / 60000), via: reis.slice(0, -1).map(l => l.toPlace.name) };
  } catch (e) { return { funnet: null, feil: String(e) }; }
}

async function sammenlign(p) {
  kall = 0;
  const midt = { lat: (p.A.lat + p.B.lat) / 2, lon: (p.A.lon + p.B.lon) / 2 };
  const [rA, rB] = [await utforsk({ posisjon: p.A, tid }, { hent }), await utforsk({ posisjon: p.B, tid }, { hent })];
  const nA = nåbart(rA), nB = nåbart(rB);
  const kom = await kommuner([...new Set([...nA.keys(), ...nB.keys()])]);
  const nivå = (n, f) => { const m = new Map(); for (const s of n.values()) { const k = f(s); if (k) (m.get(k) || m.set(k, []).get(k)).push(s); } return m; };
  const omr = s => områdeFor(midt, s, PARAMETRE.områdeBåndKm);
  const deling = (mA, mB) => {
    const a = new Set(mA.keys()), b = new Set(mB.keys());
    const eks = (m, k) => m.get(k).sort((x, y) => x.ledd - y.ledd || metresBetween(midt, y) - metresBetween(midt, x))[0];
    return {
      felles: [...a].filter(k => b.has(k)).length,
      bareA: [...a].filter(k => !b.has(k)).map(k => ({ k, eks: eks(mA, k) })),
      bareB: [...b].filter(k => !a.has(k)).map(k => ({ k, eks: eks(mB, k) })),
    };
  };
  const kommuneD = deling(nivå(nA, s => kom.get(s.id)), nivå(nB, s => kom.get(s.id)));
  const områdeD = deling(nivå(nA, omr), nivå(nB, omr));
  const stedD = { felles: [...nA.keys()].filter(k => nB.has(k)).length, bareA: [...nA.keys()].filter(k => !nB.has(k)).length, bareB: [...nB.keys()].filter(k => !nA.has(k)).length };
  const sammensetning = n => ({ direkte: [...n.values()].filter(s => s.ledd === 1).length, ettBytte: [...n.values()].filter(s => s.ledd === 2).length });
  const rekkevidde = n => { const m = {}; for (const s of n.values()) { const o = omr(s); if (!o) continue; const r = o.split('|')[0]; const km = Math.round(metresBetween(midt, s) / 1000); if (!m[r] || km > m[r].km) m[r] = { km, navn: s.navn }; } return m; };
  // Etterprøving: inntil 4 «bare A»- og 4 «bare B»-kommuner, fjernest først; reisesøk fra BEGGE.
  const velg = d => d.sort((x, y) => metresBetween(midt, y.eks) - metresBetween(midt, x.eks)).slice(0, 4);
  const prøv = async (liste, fra, mot) => Promise.all(liste.map(async x => ({ kommune: x.k, sted: x.eks.navn, oppdagetRute: x.eks.rute, fraEgen: await reise(fra, x.eks.id), fraAndre: await reise(mot, x.eks.id) })));
  const etterprøv = { bareA: await prøv(velg(kommuneD.bareA), p.A, p.B), bareB: await prøv(velg(kommuneD.bareB), p.B, p.A),
    // Også områdenivå: de nære forskjellene (Linås, Ski-området), ikke bare de fjerneste kommunene.
    områdeA: await prøv(områdeD.bareA.slice(0, 5), p.A, p.B), områdeB: await prøv(områdeD.bareB.slice(0, 5), p.B, p.A) };
  const gangM = metresBetween(p.A, p.B);
  return {
    par: p.navn, tid, kall,
    avstand: { luftM: Math.round(gangM), gangMinAnslag: Math.round(gangM * 1.3 / 80) },
    steder: { A: nA.size, B: nB.size, ...stedD },
    sammensetning: { A: sammensetning(nA), B: sammensetning(nB) },
    kommuner: { A: new Set([...nA.values()].map(s => kom.get(s.id)).filter(Boolean)).size, B: new Set([...nB.values()].map(s => kom.get(s.id)).filter(Boolean)).size, felles: kommuneD.felles, bareA: kommuneD.bareA.map(x => `${x.k}: ${x.eks.navn} (${x.eks.rute})`), bareB: kommuneD.bareB.map(x => `${x.k}: ${x.eks.navn} (${x.eks.rute})`) },
    områder: { felles: områdeD.felles, bareA: områdeD.bareA.map(x => `${x.k}: ${x.eks.navn} (${x.eks.rute})`), bareB: områdeD.bareB.map(x => `${x.k}: ${x.eks.navn} (${x.eks.rute})`) },
    rekkevidde: { A: rekkevidde(nA), B: rekkevidde(nB) },
    etterprøving: etterprøv,
  };
}

const ut = [];
for (const p of PAR) { const r = await sammenlign(p); ut.push(r); console.log(JSON.stringify(r)); }
const i = process.argv.indexOf('--json'); if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(ut, null, 1));
