#!/usr/bin/env node
/**
 * TRACER DEL A — LINJEPAR (ingen appendring). Kortet viser linjer inn og ut som
 * to lister; antyder dermed |inn| × |ut| kombinasjoner. Hvor mange av dem er
 * faktisk observert som linje inn → (knutepunkt) → linje ut?
 *   node scratchpad/tracerLinjepar.mjs   (fra repo-roten; bruker opptakene)
 */
import { utforsk, _tømCache } from '../src/nettverksutforsker.js';
import { ettByttePer, ettByttVeier, FASETTER, listerHolder } from '../src/ettBytte.js';
import { SCENARIOER, lastOpptak, avspiller } from '../tests/fixtures/entur/avspilling.js';

const lt = (r, d) => { const g = r.grupper.linjeretning[d] || {}; return (g.modus === 'metro' ? 'T-bane ' : g.modus === 'tram' ? 'trikk ' : g.modus === 'rail' ? 'tog ' : g.modus === 'water' ? 'båt ' : '') + g.kode; };
const ut = {};
for (const n of SCENARIOER) {
  _tømCache(); const O = lastOpptak(n);
  const r = await utforsk(O.scenario, { hent: avspiller(O).hent });
  const veier = ettByttVeier(r);
  ut[n] = {};
  for (const f of FASETTER.filter(f => f !== 'kommune')) {
    const { rader } = ettByttePer(r, O.scenario.posisjon, f);
    let antydet = 0, observert = 0, medKnute = 0; const verst = [];
    for (const rad of rader) {
      // Veiene bak kortet: samme regel som fasetten (gjenskapt via kortets steder og knutepunkter).
      const knuter = new Set(rad.knuterDetalj.map(k => k.id)), steder = new Set(rad.punkter.map(p => p.id));
      const vk = veier.filter(v => knuter.has(v.knute) && steder.has((r.opsjoner.find(o => o.id === v.opsjon) || {}).destinations?.[0]?.id)
        && rad.inn.includes(lt(r, v.inn)) && rad.ut.includes(lt(r, v.directionId)));
      const par = new Set(vk.map(v => lt(r, v.inn) + ' → ' + lt(r, v.directionId)));
      const parK = new Set(vk.map(v => lt(r, v.inn) + ' → ' + v.knute + ' → ' + lt(r, v.directionId)));
      // Etter rettelsen (v1.218.300): hva kortet PÅSTÅR — listene (uten «samme linje videre») bare når listerHolder,
      // ellers parene. Før rettelsen: alltid listene, med samme linje (sett: «74 → 74»).
      const etter = process.argv.includes('--etter');
      const påstått = !etter ? rad.inn.flatMap(i => rad.ut.map(u => i + ' → ' + u))
        : listerHolder(rad) ? rad.inn.flatMap(i => rad.ut.filter(u => u !== i).map(u => i + ' → ' + u)) : (rad.linjepar || []).map(p => p.inn + ' → ' + p.ut);
      const a = påstått.length;
      const ikke = påstått.filter(p => !par.has(p)).length;
      antydet += a; observert += a - ikke; medKnute += parK.size;
      const mangler = påstått.filter(p => !par.has(p));
      verst.push({ kort: rad.retningNavn, inn: rad.inn.length, ut: rad.ut.length, antydet: a, observert: a - mangler.length, eksempelIkkeObservert: mangler.slice(0, 2), eksempelObservert: [...par].slice(0, 2) });
    }
    verst.sort((x, y) => (y.antydet - y.observert) - (x.antydet - x.observert));
    ut[n][f] = { kort: rader.length, antydet, observert, ikkeObservertAndel: antydet ? Math.round(100 * (antydet - observert) / antydet) : 0, reiseruterMedKnute: medKnute, verst: verst.slice(0, 2) };
  }
}
console.log(JSON.stringify(ut, null, 1));
