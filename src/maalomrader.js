/**
 * MÅLOMRÅDER (v1.218.213). Bestilt: «hvor kan jeg dra, gitt det jeg skal
 * oppnå? … generere et lite sett med filtervalg slik vi har det nå». De faste
 * valgene «mot sentrum · hjemover · andre retninger» puttet Holmlia, Kolbotn
 * og Lørenskog i samme «andre». Her blir «andre» delt etter hvor linjene
 * faktisk går: retningene samles etter himmelretning (delt ved de største
 * hullene), og hvert område får navnet på stoppet flest av dem passerer.
 * Hver retning havner i nøyaktig ett område. Ren.
 */
import { metresBetween } from './haversine.js';
import { stopKey } from './stopId.js';

/** Stopp nærmere enn dette er ikke et «sted å dra». */
export const OMR_NÆR_M = 1500;
/** Retningen leses mot stopp innen dette. */
export const OMR_FJERN_M = 15000;
/** Høyst så mange områder. */
export const OMR_MAKS = 3;
/** Hull mindre enn dette deler ikke. */
export const OMR_HULL_GRADER = 45;

function peiling(a, b) {
  const r = Math.PI / 180, y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

/**
 * @param dirs   retningene som skal deles (verken «mot sentrum» eller «hjemover»)
 * @param her    { lat, lon }
 * @param stoppFor  d → stoppene videre [{ name, lat, lon }]
 * @param nøkkel    d → stabil nøkkel
 * @returns [{ id:'omr:<navn>', navn, tekst, nøkler:Set, peiling }] — med klokka fra nord
 */
export function målområder(dirs, her, stoppFor, nøkkel) {
  if (!her || !Array.isArray(dirs) || dirs.length < 2) return [];
  const med = [];
  for (const d of dirs) {
    const st = (stoppFor(d) || []).filter(s => Number.isFinite(s.lat)).map(s => ({ ...s, m: metresBetween(her, s) }));
    const ute = st.filter(s => s.m >= OMR_NÆR_M && s.m <= OMR_FJERN_M);
    const fjern = (ute.length ? ute : st).reduce((a, s) => (!a || s.m > a.m ? s : a), null);
    if (!fjern) continue;
    med.push({ d, p: peiling(her, fjern), stopp: ute, front: d.frontText || '' });
  }
  if (med.length < 2) return [];
  med.sort((a, b) => a.p - b.p);
  // Hullene mellom nabopeilinger (sirkulært); del ved de største.
  const hull = med.map((x, i) => ({ i, g: ((med[(i + 1) % med.length].p - x.p) + 360) % 360 || (med.length === 1 ? 360 : 0) }));
  const deler = hull.filter(h => h.g >= OMR_HULL_GRADER).sort((a, b) => b.g - a.g).slice(0, OMR_MAKS).map(h => h.i).sort((a, b) => a - b);
  if (deler.length < 2) return [];   // alt går samme vei: ingen deling å tilby
  const grupper = deler.map((d, k) => {
    const fra = (d + 1) % med.length, til = deler[(k + 1) % deler.length];
    const g = [];
    for (let i = fra; ; i = (i + 1) % med.length) { g.push(med[i]); if (i === til) break; }
    return g;
  });
  const brukt = new Set();
  return grupper.map(g => {
    // Navnet: stoppet flest av retningene passerer (≥ 2 km unna), ellers frontText.
    const tell = new Map();
    g.forEach(x => new Set(x.stopp.filter(s => s.m >= 2000).map(s => s.name)).forEach(n => {
      const k = stopKey(n); const v = tell.get(k) || { n, c: 0, m: Infinity };
      v.c++; v.m = Math.min(v.m, x.stopp.find(s => s.name === n).m); tell.set(k, v);
    }));
    const kand = [...tell.values()].filter(v => v.c >= 2 || g.length === 1).sort((a, b) => b.c - a.c || b.m - a.m);
    // Høyst to mål: si begge («Holmlia / Kolbotn»); flere: stoppet de har felles.
    const fronter = [...new Set(g.map(x => x.front).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb'));
    let navn = fronter.length && fronter.length <= 2 ? fronter.join(' / ')
      : (kand[0] ? kand[0].n : (fronter[0] || 'andre'));
    if (brukt.has(stopKey(navn))) navn = g[0].front || navn + ' ' + (brukt.size + 1);
    brukt.add(stopKey(navn));
    const p = g[0].p;
    return { id: 'omr:' + navn, navn, tekst: 'mot ' + navn, nøkler: new Set(g.map(x => nøkkel(x.d))), peiling: p };
  }).sort((a, b) => a.peiling - b.peiling);
}
