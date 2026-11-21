/**
 * LAPPENES PLASS (v1.218.233). Bestilt: «Appen må ha et konsept for å
 * decluttre kartenes symbologi og lapper så den kritisk viktige infoen blir
 * lesbar og ikke overlappes av annen info.» Proven (Mapbox/MapLibre symbol
 * collision, Google, Apple, OpenLayers declutter):
 *   1. alle lapper i ett register, med prioritet;
 *   2. plasseres i prioritetsrekkefølge — første som ikke kolliderer vinner;
 *   3. taper du: kortform, ellers skjult — aldri flyttet løs fra ankeret (§8);
 *   4. ro: blant like viktige går den som sto forrige gang først.
 * docs/kartregler.md §10.
 */

/** Prioriteten per lapptype — én tabell for kartet. Lavere tall = viktigere. */
export const LAPP_PRIO = { stopp: 1, gang: 2, plattformDin: 3, annet: 4, linje: 5, plattform: 6 };

const kolliderer = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Ren kjerne.
 * @param lapper [{ id, prio, rekt, kortRekt? }] — rekt/kortRekt: {left,top,right,bottom}
 * @param hindre [rekt] — prikken din, kartets knapper
 * @param forrige Set med id-er som sto forrige gang (ro)
 * @returns Map id → 'full' | 'kort' | 'skjult'
 */
export function ryddLapper(lapper, hindre = [], forrige = new Set()) {
  const rekkefølge = [...lapper].sort((a, b) => a.prio - b.prio || (forrige.has(b.id) ? 1 : 0) - (forrige.has(a.id) ? 1 : 0));
  const tatt = [...hindre];
  const ut = new Map();
  for (const l of rekkefølge) {
    if (l.rekt && !tatt.some(t => kolliderer(l.rekt, t))) { tatt.push(l.rekt); ut.set(l.id, 'full'); continue; }
    if (l.kortRekt && !tatt.some(t => kolliderer(l.kortRekt, t))) { tatt.push(l.kortRekt); ut.set(l.id, 'kort'); continue; }
    ut.set(l.id, 'skjult');
  }
  return ut;
}

/** Lapptypen ut fra klassene elementet har. Ren. */
export function lappType(klasser) {
  const k = new Set(klasser);
  if (k.has('lapp-stopp')) return 'stopp';
  if (k.has('gang-pille')) return 'gang';
  if (k.has('quay-pin')) return k.has('aktiv') ? 'plattformDin' : 'plattform';
  if (k.has('edd-ende-merke')) return 'linje';
  return 'annet';
}

let _forrige = new Set();
/**
 * Kartets lapper i nettleseren: mål de faktiske størrelsene, rydd, vis.
 * Kortform = klassen `kort` (CSS skjuler `.lapp-lang`). Returnerer antall skjult.
 */
export function ryddKart(el) {
  if (!el || typeof el.querySelectorAll !== 'function') return 0;
  const noder = [...el.querySelectorAll('.leaflet-tooltip, .quay-pin')];
  noder.forEach(n => n.classList.remove('lapp-skjult', 'kort'));
  const id = n => n.dataset.lappId || (n.dataset.lappId = 'l' + Math.random().toString(36).slice(2));
  const lapper = noder.map(n => {
    const rekt = n.getBoundingClientRect();
    let kortRekt = null;
    if (n.querySelector('.lapp-lang')) { n.classList.add('kort'); kortRekt = n.getBoundingClientRect(); n.classList.remove('kort'); }
    const nøkkel = (n.textContent || '').trim() || id(n);
    return { id: nøkkel, node: n, prio: LAPP_PRIO[lappType(n.classList)], rekt: rekt.width ? rekt : null, kortRekt };
  });
  const hindre = [...el.querySelectorAll('.bruker-prikk, .kart-verktøy, .kart-kompass, .leaflet-control-attribution')]
    .map(n => n.getBoundingClientRect()).filter(r => r.width);
  const dom = ryddLapper(lapper, hindre, _forrige);
  let skjult = 0;
  const vist = new Set();
  lapper.forEach(l => {
    const d = dom.get(l.id);
    if (d === 'kort') l.node.classList.add('kort');
    if (d === 'skjult') { l.node.classList.add('lapp-skjult'); skjult++; } else vist.add(l.id);
  });
  _forrige = vist;
  return skjult;
}
