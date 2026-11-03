/**
 * Hvilke knapper som brukes, og hvilke som bare står der.
 *
 * Bestilt: «Mål hvilke knapper som brukes og ranger etter mest til minst
 * for å kunne flytte funksjoner nærmere eller lenger unna bruker.»
 *
 * TELLERE, IKKE HENDELSER. Reiseloggen (`eventLog.js`) har tak på 300
 * hendelser, og trykk ville fylt den på en dag. Her lagres per knapp og per
 * dag hvor mange ganger den ble trykket og hvor mange skjermbesøk den sto på
 * skjermen. Ingen koordinater, ingen klokkeslett, intet innhold.
 *
 * VIST, IKKE BARE TRYKKET. En knapp som vises 200 ganger og trykkes 2, er noe
 * annet enn en som vises 2 og trykkes 2. Den som vises og aldri trykkes, er
 * den viktigste kandidaten til å flyttes lenger unna, og den finnes bare om
 * visningene telles.
 *
 * Samme løfte som loggen: ingenting uten samtykke (`consent.js`), glemt etter
 * `MEMORY_DAYS`, og alt som lagres vises (innstillinger, «knappebruk»).
 * En bladmodul: storage og consent, og ingenting annet.
 */
import { storage } from '../storage.js';
import { loadConsent } from './consent.js';

const KEY = 't.knappebruk';
/** Samme vindu som reiseloggen, og av samme grunn: det er det som er lovet. */
export const KNAPP_DAGER = 7;

/** Det som regnes som en knapp. Én liste, lest av tellingen og visningen. */
export const KNAPP_VELGER = 'button, a[href], summary, [role="button"], input[type="checkbox"]';

const DAY = 86400000;
const _dag = (t) => new Date(t).toISOString().slice(0, 10);

function _load() {
  try { const v = storage.get(KEY); const o = v ? JSON.parse(v) : {}; return o && typeof o === 'object' ? o : {}; }
  catch { return {}; }
}
function _save(o) { try { storage.set(KEY, JSON.stringify(o)); } catch { /* quota */ } }

/** Dager eldre enn vinduet slettes, og knapper uten dager forsvinner. */
export function prune(o, nå) {
  const grense = _dag(nå - (KNAPP_DAGER - 1) * DAY);
  const ut = {};
  Object.entries(o || {}).forEach(([k, v]) => {
    const dager = {};
    Object.entries((v && v.dager) || {}).forEach(([d, n]) => { if (d >= grense) dager[d] = n; });
    if (Object.keys(dager).length) ut[k] = { skjerm: v.skjerm || '', dager };
  });
  return ut;
}

/**
 * Teksten på en knapp uten det som skifter: klokkeslett og tall. «← 19:33»
 * og «← 19:48» er samme knapp, og uten dette ble hvert tidsvalg sin egen.
 */
export function normTekst(t) {
  return String(t || '')
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '')
    .replace(/\b\d{1,2}[:.]\d{2}\b/g, 'tid')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

/** Skjermen knappen står på: id-en til den nærmeste `#v-…`. */
export function skjermAv(el) {
  const v = el && el.closest ? el.closest('[id^="v-"]') : null;
  if (v) return v.id.slice(2);
  // Bunnmenyen og annet utenfor skjermene.
  if (el && el.closest && el.closest('#app-nav')) return 'meny';
  return 'annet';
}

/**
 * Knappens navn. ÉN navngiving: `data-knapp` (satt der teksten skifter),
 * ellers `id`, ellers skjerm + aria-label eller tekst, normalisert.
 */
/** Ikke knapper: kartets kildehenvisning (OSM, Stadia …), lenker ingen styrer. */
const _IKKE = '.leaflet-control-attribution';

export function knappNavn(el) {
  if (!el) return null;
  if (el.closest && el.closest(_IKKE)) return null;
  const satt = el.getAttribute && el.getAttribute('data-knapp');
  if (satt) return satt;
  if (el.id) return el.id;
  const tekst = (el.getAttribute && el.getAttribute('aria-label')) || el.textContent || '';
  const n = normTekst(tekst);
  return n ? skjermAv(el) + ': ' + n : null;
}

function _tell(el, felt, nå) {
  if (!loadConsent()) return false;
  const navn = knappNavn(el);
  if (!navn) return false;
  const t = Number.isFinite(nå) ? nå : Date.now();
  const o = prune(_load(), t);
  const k = o[navn] || (o[navn] = { skjerm: skjermAv(el), dager: {} });
  const d = k.dager[_dag(t)] || (k.dager[_dag(t)] = { trykk: 0, vist: 0 });
  d[felt] += 1;
  _save(o);
  return true;
}

/** Et trykk. Fra den delegerte lytteren i main.js. */
export function tellTrykk(el, nå) {
  const k = el && el.closest ? el.closest(KNAPP_VELGER) : null;
  return k ? _tell(k, 'trykk', nå) : false;
}

/** Synlig: har en boks. Ikke `offsetParent`, som er null for position:fixed. */
const _synlig = (e) => !e.hidden && e.getClientRects().length > 0;

/**
 * Ett skjermbesøk: hver synlige knapp under `rot` teller én visning, og samme
 * navn bare én gang. To «hele reisen»-knapper på én skjerm er ett besøk.
 */
export function tellVist(rot, nå) {
  if (!loadConsent() || !rot || !rot.querySelectorAll) return 0;
  const t = Number.isFinite(nå) ? nå : Date.now();
  const o = prune(_load(), t);
  const sett = new Set();
  rot.querySelectorAll(KNAPP_VELGER).forEach(el => {
    if (!_synlig(el)) return;
    const navn = knappNavn(el);
    if (!navn || sett.has(navn)) return;
    sett.add(navn);
    const k = o[navn] || (o[navn] = { skjerm: skjermAv(el), dager: {} });
    const d = k.dager[_dag(t)] || (k.dager[_dag(t)] = { trykk: 0, vist: 0 });
    d.vist += 1;
  });
  if (sett.size) _save(o);
  return sett.size;
}

/**
 * Rangeringen: mest trykket først, så høyest andel trykk per visning, så navn.
 * @returns {{knapp:string, skjerm:string, trykk:number, vist:number, andel:number|null}[]}
 */
export function rangering(nå) {
  if (!loadConsent()) return [];
  const t = Number.isFinite(nå) ? nå : Date.now();
  return Object.entries(prune(_load(), t)).map(([knapp, v]) => {
    let trykk = 0, vist = 0;
    Object.values(v.dager).forEach(d => { trykk += d.trykk || 0; vist += d.vist || 0; });
    return { knapp, skjerm: v.skjerm, trykk, vist, andel: vist ? trykk / vist : null };
  }).sort((a, b) => (b.trykk - a.trykk) || ((b.andel || 0) - (a.andel || 0)) || a.knapp.localeCompare(b.knapp));
}

/** Rangeringen som ren tekst, til å lime inn et annet sted. */
export function rangeringTekst(liste) {
  return (liste || []).map((r, i) => (i + 1) + '. ' + r.knapp + ' (' + r.skjerm + ') — '
    + r.trykk + ' trykk, vist ' + r.vist + (r.andel != null ? ', ' + Math.round(r.andel * 100) + ' %' : '')).join('\n');
}

export function glemKnappebruk() { storage.remove(KEY); }
