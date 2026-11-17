/**
 * VERKTØYSØYLEN PÅ KARTET (v1.218.72). Bestilt: «en helhetlig tilnærming til
 * hvilke knapper som er på kartet … uniformt … plassert i nedre høyre hjørne.»
 *
 * Før: fem slags knapper i fire stiler på fire steder — ⤢ og kompasset oppe
 * til høyre (28 px), Leaflets +/− nede til høyre, filterpiller oppe til
 * venstre, og en stor tekstpille for fokus. Nå: én søyle, nede til høyre der
 * tommelen er, med like firkanter. Hvert kart legger til bare det det trenger.
 *
 * Rekkefølgen er ÉN tabell, ovenfra og ned.
 */
import L from 'leaflet';
import { lastHånd, verktøyHjørne, skalaHjørne, kompassHjørne, HÅND_HENDELSE } from '../haand.js';

// v1.218.82: ◎ nederst, under − (skjermbilde med pil ned).
// v1.218.89: kartformen (bredt/kvadratisk, ⤢ på andre kart) mellom − og ◎.
export const REKKEFØLGE = { hele: 15, lag: 20, inn: 50, ut: 60, fullskjerm: 65, fokus: 70 };
/**
 * ØVERST TIL HØYRE (v1.218.79). Bestilt: «Kompasset hører hjemme øverst i
 * høyre hjørne.» Det er en indikator, ikke en tommelknapp — der kartapper har
 * det, også for venstrehendte. Én navngitt liste over hva som står der.
 */
export const ØVERST = ['kompass'];

/**
 * L-EN I HJØRNET (v1.218.76). Bestilt med skjermbilde: ◎ og lag flyttet ned
 * på rad ved siden av −. Søylen helt ut (kompass, fullskjerm, +, −); raden
 * nederst innenfor (utsnitt og filter). Venstrehendt speiler.
 */
// IKKE L — I (v1.218.78). Brukeren: «Ikke L. I». Alle i én søylerad, i
// REKKEFØLGE. Tabellen står (raden er tom) så L-en kan komme tilbake ved ett ord.
export const GRUPPE = { fokus: 'søyle', hele: 'søyle', lag: 'søyle', kompass: 'søyle', fullskjerm: 'søyle', inn: 'søyle', ut: 'søyle' };
export function gruppeFor(id) { return GRUPPE[id] === 'rad' ? 'rad' : 'søyle'; }

/** Knappene i rekkefølge. Ukjente id-er sist. Ren. */
export function sorterKnapper(ider) {
  const r = id => (id in REKKEFØLGE ? REKKEFØLGE[id] : 99);
  return [...ider].sort((a, b) => r(a) - r(b));
}

/* Kartene med søyle, så et bytte av hånd flytter dem alle (v1.218.73). */
const _levende = new Set();
export function byttHjørne(map, hånd) {
  const v = map && map._verktøy;
  if (!v) return;
  // Ikke Leaflets setPosition: den kaller onAdd på nytt og lager en tom søyle.
  // Samme element flyttes til det andre hjørnet, med knappene i.
  const hjørne = verktøyHjørne(hånd);
  v.kontroll.options.position = hjørne;
  const mål = map._controlCorners && map._controlCorners[hjørne];
  if (mål) mål.insertBefore(v.el, mål.firstChild);
  v.el.classList.toggle('kv-venstre', hånd === 'venstre');
  if (map._skala) map._skala.setPosition(skalaHjørne(hånd));
  // Kompasset i hjørnet over den andre siden (v1.218.110).
  if (v.øverstKontroll) {
    const kh = kompassHjørne(hånd);
    v.øverstKontroll.options.position = kh;
    const km = map._controlCorners && map._controlCorners[kh];
    if (km) km.insertBefore(v.øverstKontroll.getContainer(), km.firstChild);
  }
  tilpassForm(map);
}
if (typeof window !== 'undefined') {
  window.addEventListener(HÅND_HENDELSE, e => _levende.forEach(m => byttHjørne(m, e.detail)));
}

/** Søylen på et kart; lages første gang. */
export function festVerktøy(map) {
  if (map._verktøy) return map._verktøy;
  const C = L.Control.extend({ onAdd() {
    const d = L.DomUtil.create('div', 'kart-verktøy');
    L.DomUtil.create('div', 'kv-rad-gruppe', d);
    L.DomUtil.create('div', 'kv-søyle-gruppe', d);
    L.DomEvent.disableClickPropagation(d);
    L.DomEvent.disableScrollPropagation(d);
    return d;
  } });
  const hånd = lastHånd();
  const kontroll = new C({ position: verktøyHjørne(hånd) }).addTo(map);
  map._verktøy = { el: kontroll.getContainer(), knapper: new Map(), panel: null, kontroll };
  kontroll.getContainer().classList.toggle('kv-venstre', hånd === 'venstre');
  map.on('resize', () => tilpassForm(map));
  _levende.add(map);
  map.on('unload', () => _levende.delete(map));
  return map._verktøy;
}

/** Søyle eller rad? En rad når kartet er for lavt til søylen. Ren. */
export const KNAPP_STEG = 46;
/** Løftet fra bunnen (v1.218.77: «litt opp»). Samme tall som --kv-løft i CSS. */
// v1.218.89: «Hele knapperekka bør være bunnstilt» — løftet er tatt bort.
export const KV_LØFT = 10;
/**
 * PLASSEN KOMPASSET TAR (v1.218.106). Rapportert: «Knappene legger seg over
 * kompasset». Søylen regnet med hele kartets høyde, mens kompasset øverst
 * til høyre tok 56 px av den. Knapp 40 + toppmarg 10 + mellomrom 6.
 */
export const KOMPASS_PLASS = 56;
const _ledig = (h, øverst) => h - (øverst ? KOMPASS_PLASS : 0);
/**
 * TETT SØYLE (v1.218.110). Bestilt: knappepanelet vertikalt. Auto-reise har
 * fem knapper (240 px) på et kart på om lag 215 px — da står de tettere
 * (34 px knapper) før de legger seg på rad.
 */
export const KNAPP_STEG_TETT = 38;
export function tett(antallSynlige, kartHøyde, øverst = false) {
  const h = _ledig(kartHøyde, øverst);
  return antallSynlige * KNAPP_STEG + 10 > h && antallSynlige * KNAPP_STEG_TETT + 10 < h;
}
export function somRad(antallSynlige, kartHøyde, øverst = false) {
  // «Akkurat» er for trangt: 130 px og tre knapper forblir rad (v1.218.72).
  return antallSynlige * KNAPP_STEG_TETT + 10 >= _ledig(kartHøyde, øverst);
}
/** Får søylen plass MED løftet? Ellers står den nede (uten løft) før den blir rad. Ren. */
export function medLøft(antallSynlige, kartHøyde, øverst = false) {
  return antallSynlige * KNAPP_STEG + KV_LØFT <= _ledig(kartHøyde, øverst);
}
/**
 * LAVE KART (v1.218.72): avgangsdetaljenes bånd er 130 px — tre knapper i
 * søyle gikk ut over toppen (sett i proben). Da ligger de på rad nede til høyre.
 */
export function tilpassForm(map) {
  const v = map && map._verktøy;
  if (!v || !map.getSize) return;
  // Høyden avgjøres av søylen; raden ligger ved siden av (v1.218.76).
  const n = [...v.knapper.entries()].filter(([id, b]) => !b.hidden && gruppeFor(id) === 'søyle').length;
  // KILDELINJA tar også plass (v1.218.110): på et smalt kart går den over to
  // linjer, og søylen ble kuttet øverst (sett i proben). Målt, ikke gjettet.
  const attr = map.getContainer && map.getContainer().querySelector('.leaflet-control-attribution');
  const h = map.getSize().y - (attr ? attr.offsetHeight : 0);
  // Bare når kompasset VISES (det står skjult til kartet er rotert) OG står
  // over søylen. Siden v1.218.110 står det i motsatt hjørne, så søylen beholder
  // hele høyden; regelen står likevel, så de to ikke kan komme på kant igjen.
  const kh = v.øverstKontroll && v.øverstKontroll.options.position;
  const sammeSide = !!kh && (kh.endsWith('right') === (v.kontroll.options.position || '').endsWith('right'));
  const øverst = sammeSide && !!(v.øverst && [...v.øverst.values()].some(b => !b.hidden));
  v.el.classList.toggle('kv-rad', somRad(n, h, øverst));
  v.el.classList.toggle('kv-tett', tett(n, h, øverst));
  v.el.classList.toggle('kv-uten-løft', !medLøft(n, h, øverst));
  // Panelet (lag) får heller ikke gå opp i kompasset.
  v.el.style.setProperty('--kv-kart-h', _ledig(h, øverst) + 'px');
  // Ingenting å regne på før kildelinja er tegnet: én gang til etter neste ramme.
  if (attr && !attr.offsetHeight && typeof requestAnimationFrame !== 'undefined' && !v._attrVent) {
    v._attrVent = true; requestAnimationFrame(() => { v._attrVent = false; tilpassForm(map); });
  }
}

function _ordne(v) {
  const rad = v.el.querySelector('.kv-rad-gruppe'), søyle = v.el.querySelector('.kv-søyle-gruppe');
  sorterKnapper(v.knapper.keys()).forEach(id => (gruppeFor(id) === 'rad' ? rad : søyle).appendChild(v.knapper.get(id)));
  if (v.panel) v.el.appendChild(v.panel);
}

/** Legg til (eller hent) en knapp. `element`: en knapp som finnes fra før, flyttes inn. */
export function leggTil(map, id, o = {}) {
  const v = festVerktøy(map);
  let b = v.knapper.get(id);
  // En ny knapp for samme plass erstatter den gamle (v1.218.90): formknappen
  // ble laget på nytt etter å ha forsvunnet, og ble stående utenfor søylen.
  if (b && o.element && b !== o.element) { if (b.parentNode) b.remove(); v.knapper.delete(id); b = null; }
  if (!b) {
    // EN KNAPP SOM FINNES FRA FØR (⤢ i index.html) går tilbake dit den kom
    // fra når kartet fjernes. Avgangsdetaljene bygger kartet på nytt per
    // avgang, og knappen forsvant med det gamle kartet (sett i proben).
    if (o.element && o.element.parentNode && !o.element.closest('.kart-verktøy')) {
      const hjem = o.element.parentNode, etter = o.element.nextSibling;
      map.on('unload', () => { try { hjem.insertBefore(o.element, etter && etter.parentNode === hjem ? etter : null); } catch (_) {} });
    }
    b = o.element || document.createElement('button');
    b.type = 'button';
    b.classList.add('kv-knapp');
    b.dataset.kv = id;
    v.knapper.set(id, b);
    _ordne(v);
    tilpassForm(map);
  }
  if (o.påTrykk) b.onclick = o.påTrykk;
  sett(map, id, o);
  return b;
}

/** En knapp øverst til høyre (ØVERST), i samme firkantstil som søylen. */
export function leggTilØverst(map, id, o = {}) {
  const v = festVerktøy(map);
  if (!v.øverst) {
    const C = L.Control.extend({ onAdd() {
      const d = L.DomUtil.create('div', 'kart-kompass');
      L.DomEvent.disableClickPropagation(d);
      return d;
    } });
    v.øverstKontroll = new C({ position: kompassHjørne(lastHånd()) }).addTo(map);
    v.øverst = new Map();
  }
  let b = v.øverst.get(id);
  if (!b) {
    b = document.createElement('button');
    b.type = 'button'; b.classList.add('kv-knapp'); b.dataset.kv = id;
    v.øverst.set(id, b);
    v.øverstKontroll.getContainer().appendChild(b);
    tilpassForm(map);   // søylen har nå mindre plass (v1.218.106)
  }
  if (o.påTrykk) b.onclick = o.påTrykk;
  sett(map, id, o);
  return b;
}

/** Endre en knapp: ikon, tekst (aria og title), aktiv, skjult, merket. */
export function sett(map, id, o = {}) {
  const v = map && map._verktøy;
  const b = v && (v.knapper.get(id) || (v.øverst && v.øverst.get(id)));
  if (!b) return;
  if (o.ikon != null) b.innerHTML = o.ikon;
  if (o.tekst != null) { b.title = o.tekst; b.setAttribute('aria-label', o.tekst); }
  if (o.aktiv != null) b.classList.toggle('kv-aktiv', !!o.aktiv);
  if (o.skjult != null) b.hidden = !!o.skjult;
  if (o.merket != null) b.classList.toggle('kv-merket', !!o.merket);
  if (o.skjult != null) tilpassForm(map);
}

/**
 * «LAG»: én knapp med et lite panel til venstre for søylen, for filtrene.
 * Merket (en prikk) når noe er skjult, så et filter aldri er usynlig.
 * Gir panelet å tegne i.
 */
export const LAG_IKON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3 2 8l10 5 10-5-10-5Zm-7.6 8.2L2 12.4l10 5 10-5-2.4-1.2L12 15l-7.6-3.8Zm0 4.4L2 16.8l10 5 10-5-2.4-1.2L12 19.4l-7.6-3.8Z" fill="currentColor"/></svg>';
export function leggTilLag(map, tekst = 'Vis og skjul') {
  const v = festVerktøy(map);
  if (!v.panel) {
    v.panel = document.createElement('div');
    v.panel.className = 'kv-panel';
    v.panel.hidden = true;
    const lukk = (e) => {
      // Et trykk på en pille som bygges på nytt i samme øyeblikk kom fram som
      // et klikk i kartet, og lukket panelet midt i valget (sett i proben).
      const t = e && e.originalEvent && e.originalEvent.target;
      if (t && (!t.isConnected || v.el.contains(t))) return;
      v.panel.hidden = true; sett(map, 'lag', { aktiv: false });
    };
    leggTil(map, 'lag', { ikon: LAG_IKON, tekst, påTrykk: () => {
      v.panel.hidden = !v.panel.hidden; sett(map, 'lag', { aktiv: !v.panel.hidden });
    } });
    // Bare når DU trykker i kartet eller drar det: en omramming etter et
    // filtervalg lukket panelet midt i bruken (sett i proben).
    map.on('click dragstart', lukk);
    _ordne(v);
  }
  return v.panel;
}

/** Bredde og høyde søylen (og et åpent panel) tar nede til høyre. Til rammer og lapper. */
export function verktøyFlate(map) {
  const v = map && map._verktøy;
  if (!v) return null;
  const r = v.el.getBoundingClientRect();
  const p = v.panel && !v.panel.hidden ? v.panel.getBoundingClientRect() : null;
  return { el: v.el, r, p };
}
