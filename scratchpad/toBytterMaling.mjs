#!/usr/bin/env node
/**
 * TO BYTTER — MÅLING (ikke en del av appen eller `npm test`).
 *
 *   node scratchpad/toBytterMaling.mjs [--natt] [--json fil]
 *
 * Kjører nettverksutforskeren som i dag (ledd 1 + 2) mot ekte Entur, og legger
 * på et ledd 3 her i skriptet: knutepunkter valgt blant stedene ledd 2 når,
 * med samme marginale regel som utforskeren (flest linjer som verken ledd 1
 * eller ledd 2 har, høyst knuteMaks), og én aliased avgangsspørring fra dem.
 * Måler i ULIKE MULIGHETER (områder og retninger), ikke i treff.
 *
 * Kostnaden for å finne linjene ved kandidatene telles med (stopPlaces i
 * biter à 100), men en produksjonsversjon kan gjøre det billigere.
 */
import { utforsk, PARAMETRE, somAlias, medPlanlagteStopp, stoppVidere, horisontFor, områdeFor } from '../src/nettverksutforsker.js';
import { boardGQL } from '../src/api/queries.js';
import { writeFileSync } from 'node:fs';

const JP = 'https://api.entur.io/journey-planner/v3/graphql';
const STEDER = {
  mortensrud: { lat: 59.8487, lon: 10.8291 },
  nesttun: { lat: 60.3197, lon: 5.3537 },
  ranheim: { lat: 63.4286, lon: 10.5248 },
  tretten: { lat: 61.3125, lon: 10.3005 },
};
const arg = process.argv.slice(2);
const natt = arg.includes('--natt');
const jsonUt = arg.includes('--json') ? arg[arg.indexOf('--json') + 1] : null;

let kall = 0;
const hent = async (_navn, req) => {
  kall++;
  const r = await fetch(req.url, { method: req.method || 'GET', body: req.body, headers: { 'Content-Type': 'application/json', 'ET-Client-Name': 'travelcompanion-maling' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
};
const gql = query => ({ url: JP, method: 'POST', body: JSON.stringify({ query }) });
const tidFor = () => {
  if (!natt) return new Date().toISOString();
  const d = new Date(); d.setUTCDate(d.getUTCDate() + (d.getUTCHours() >= 1 ? 1 : 0)); d.setUTCHours(0, 30, 0, 0); // 01:30 norsk vintertid
  return d.toISOString();
};
const retningAv = o => (o ? o.split('|')[0] : null);
const erRetning = s => s && s !== '•';

async function mål(navn, pos) {
  kall = 0;
  const tid = tidFor();
  const t0 = Date.now();
  const res = await utforsk({ posisjon: pos, tid }, { hent });
  const kall12 = kall, ms12 = Date.now() - t0;

  const opsjon = new Map(res.opsjoner.map(o => [o.id, o]));
  const sted = id => { const o = opsjon.get(id); return o && o.destinations && o.destinations[0]; };
  const ledd1 = new Set(res.veier.filter(v => v.ledd === 1).map(v => v.opsjon));
  const ledd2 = new Set(res.veier.filter(v => v.ledd === 2 && !ledd1.has(v.opsjon)).map(v => v.opsjon));
  const kjenteSteder = new Set([...ledd1, ...ledd2].map(id => sted(id) && sted(id).id).filter(Boolean));
  const kjenteLinjer = new Set(Object.values(res.grupper.linjeretning).map(g => g.lineId));
  const område12 = new Set([...ledd1, ...ledd2].map(id => sted(id) && områdeFor(pos, sted(id), PARAMETRE.områdeBåndKm)).filter(Boolean));
  const område1 = new Set([...ledd1].map(id => sted(id) && områdeFor(pos, sted(id), PARAMETRE.områdeBåndKm)).filter(Boolean));
  const retning12 = new Set([...område12].map(retningAv).filter(erRetning));
  const brukteKnuter = new Set((res.knutepunkter.spurt || []));

  // Kandidater til ledd 3: stedene som BARE ledd 2 når (de som ledd 1 når, er alt vurdert som knutepunkt).
  const kandidater = [...ledd2].map(sted).filter(s => s && !brukteKnuter.has(s.id));
  const info = new Map();
  const t1 = Date.now();
  for (let i = 0; i < kandidater.length; i += 100) {
    const ider = kandidater.slice(i, i + 100).map(s => s.id);
    const j = await hent('ledd 3: linjer ved kandidatene', gql(`{stopPlaces(ids:${JSON.stringify(ider)}){id name quays{lines{id transportMode}}}}`));
    for (const s of (j.data && j.data.stopPlaces) || []) if (s) info.set(s.id, s);
  }
  const kallLinjer = kall - kall12;
  // Marginalt utvalg, som utforskeren: flest linjer ingen tidligere ledd eller valgt knute dekker.
  const dekket = new Set(kjenteLinjer), valgt = [];
  const linjerVed = new Map(kandidater.map(s => {
    const sp = info.get(s.id), m = new Map();
    for (const q of (sp && sp.quays) || []) for (const l of q.lines || []) m.set(l.id, l.transportMode);
    return [s.id, m];
  }));
  while (valgt.length < PARAMETRE.knuteMaks) {
    let best = null, bestN = 0;
    for (const s of kandidater) {
      if (valgt.includes(s)) continue;
      const n = [...linjerVed.get(s.id).keys()].filter(l => !dekket.has(l)).length;
      if (n > bestN || (n === bestN && n > 0 && best && s.id < best.id)) { best = s; bestN = n; }
    }
    if (!best || bestN === 0) break;
    valgt.push(best);
    for (const l of linjerVed.get(best.id).keys()) dekket.add(l);
  }

  // Én aliased avgangsspørring fra de valgte, som ledd 2 i utforskeren.
  const nye = new Map(); // stedId → { navn, område, linje, knute }
  let kall3 = 0;
  if (valgt.length) {
    const q = '{' + valgt.map((k, i) => somAlias('s' + i, medPlanlagteStopp(boardGQL(k.id, PARAMETRE.avgangerMaks, new Date(tid), true,
      horisontFor([...new Set(linjerVed.get(k.id).values())], PARAMETRE.horisontMin), null, PARAMETRE.perLinje)))).join(' ') + '}';
    const før = kall;
    const j = await hent('ledd 3', gql(q));
    kall3 = kall - før;
    valgt.forEach((k, i) => {
      const sp = j.data && j.data['s' + i];
      for (const c of (sp && sp.estimatedCalls) || []) {
        const sj = c.serviceJourney || {}, line = sj.line || {};
        const { videre } = stoppVidere(sj, c.quay && c.quay.id);
        for (const v of videre) {
          if (kjenteSteder.has(v.id) || v.id === k.id || nye.has(v.id)) continue;
          nye.set(v.id, { navn: v.name, område: områdeFor(pos, v, PARAMETRE.områdeBåndKm), linje: line.publicCode, nyLinje: !kjenteLinjer.has(line.id), knute: k.name, km: Math.round(Math.hypot((v.lat - pos.lat) * 111, (v.lon - pos.lon) * 111 * Math.cos(pos.lat * Math.PI / 180))) });
        }
      }
    });
  }
  const ms3 = Date.now() - t1;
  const nyeOmråder = new Set([...nye.values()].map(x => x.område).filter(o => o && !område12.has(o)));
  const nyeRetninger = new Set([...nyeOmråder].map(retningAv).filter(r => erRetning(r) && !retning12.has(r)));
  const iNyeOmråder = [...nye.values()].filter(x => nyeOmråder.has(x.område));
  const eksempler = [...iNyeOmråder].sort((a, b) => b.km - a.km);
  const eks = []; const sett = new Set();
  for (const x of eksempler) if (!sett.has(x.område)) { sett.add(x.område); eks.push(`${x.navn} (${x.område}, via ${x.knute}, ${x.linje})`); }
  return {
    sted: navn, tid, natt,
    ettBytte: { kall: kall12, ms: ms12, steder: kjenteSteder.size, områder: område12.size, områderUtenBytte: område1.size, retninger: retning12.size, knuter: brukteKnuter.size },
    toBytter: {
      kandidater: kandidater.length, knuterValgt: valgt.map(k => k.name), kallLinjer, kallAvganger: kall3, ms: ms3,
      nyeSteder: nye.size, nyeStederPåNyLinje: [...nye.values()].filter(x => x.nyLinje).length,
      nyeOmråder: nyeOmråder.size, stederINyeOmråder: iNyeOmråder.length, nyeRetninger: [...nyeRetninger],
      eksempler: eks.slice(0, 8),
    },
  };
}

const ut = [];
for (const [navn, pos] of Object.entries(STEDER)) {
  if (natt && navn !== 'mortensrud') continue;
  try { const r = await mål(navn, pos); ut.push(r); console.log(JSON.stringify(r)); }
  catch (e) { console.log(JSON.stringify({ sted: navn, feil: String(e) })); }
}
if (jsonUt) writeFileSync(jsonUt, JSON.stringify(ut, null, 2));
