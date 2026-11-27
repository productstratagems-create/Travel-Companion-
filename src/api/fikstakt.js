/**
 * GPS-FIKSTAKT — en diagnostisk måling (#809, v1.218.333). IKKE en produktfunksjon.
 *
 * Spørsmålet: hvor ofte leverer telefonen faktisk GPS-oppdateringer til appen? Svaret avgjør om dagens `posTrail` (12 fikser) gir nok
 * historikk, om bevegelsesinferensen får nok observasjoner i sitt 60 s vindu, og om et eget bevegelsesspor (steg 3b) trengs. Ingen produktbeslutning
 * er koblet til målingen: ingen rangering, anbefaling eller visning leser den.
 *
 * DATAMINIMERING: lagrer BARE tellere per døgn og per intervallbøtte (histogrammer). Ingen rå intervaller, ingen tidsrekke (rekkefølgen kan
 * avsløre bevegelsesmønster), ingen breddegrad/lengdegrad, posisjonsobjekt, fart, kurs, høyde, stopp, ruter eller eksakte tidspunkt. Døgn er
 * bare datoen. Hviteliste: `FIKSTAKT_FELT` — alt som lagres vises i innstillinger (samme invariant som reiseloggen).
 *
 * SAMTYKKE: av som standard. Måler bare når «appen husker» er på (`loadConsent`) og testposisjon er av (`testPosPå`). Tilbaketrekking stopper
 * målingen og sletter lagrede data (`slettFikstakt`). Lokalt på telefonen, aldri sendt noe sted, slettes etter 7 dager.
 *
 * FEILSIKKER: `registrerFiks` kalles fra GPS-callbacken og må aldri forsinke, endre eller avbryte posisjonsbehandlingen. Den gjør bare noen få
 * additions/sammenligninger i minnet; ingen synkron lagring (skriving skjer på en timer og ved skjult side); alle feil svelges (data kan gå tapt).
 *
 * FORGRUNN: appen stopper GPS-watchen i bakgrunnen, så målingen gjelder FORGRUNNSBRUK. Første fiks etter retur til forgrunnen er et nytt
 * utgangspunkt: det blir aldri et kunstig langt intervall (`avbrudd` teller slike gap).
 *
 * IKKE VALIDERT: `pos.timestamp` (enhetens fikstid) har nettleser-/enhetsspesifikk semantikk og må valideres på FAKTISKE iOS- og
 * Android-enheter før tallene tolkes. Modulen lagrer fordelinger, ikke tolkninger. Bøttekantene er hypoteser (0,25–120 s).
 *
 * Bladmodul: importerer bare storage, consent og testPos.
 */
import { storage } from '../storage.js';
import { loadConsent } from './consent.js';
import { testPosPå } from './testPos.js';

const KEY = 't.fikstakt';
export const BEHOLD_DAGER = 7;
const DAG = 86_400_000;
/** Et gap lengre enn dette er avbrudd (bakgrunn, mistet signal), ikke et intervall. */
export const AVBRUDD_S = 120;
/** Bøttekanter i sekunder. Verdi v havner i bøtte = antall kanter ≤ v (bøtte i dekker [kant[i-1], kant[i])). HYPOTESER. */
export const KANTER_S = Object.freeze([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 4, 5, 7.5, 10, 15, 20, 30, 45, 60, 90, 120]);
/** Kanter for «antall fikser siste 60 s». */
export const KANTER_ANTALL = Object.freeze([1, 2, 3, 4, 5, 8, 10, 12, 15, 20, 30, 45, 60, 90, 120]);
export const FLUSH_MS = 60_000;
const SAMTYKKE_TTL_MS = 5_000;

/** Alt som kan lagres, og hva det kalles for et menneske. Hvitelista: ingenting utenfor den skrives. */
export const FIKSTAKT_FELT = Object.freeze({
  dag: 'døgn (dato)', n: 'antall fikser', cb: 'intervall mellom leveringer (histogram)', gps: 'intervall mellom enhetens fikstidsstempler (histogram)',
  alder: 'alder på fiks ved levering (histogram)', dekk12: 'tid de siste 12 fiksene spenner (histogram)', ant60: 'antall fikser siste 60 s (histogram)',
  likTs: 'gjentatt fikstidsstempel', baklengs: 'tidsstempel bakover', fremtid: 'tidsstempel i fremtiden', avbrudd: `opphold over ${AVBRUDD_S} s`,
  gap5: 'intervall over 5 s', gap10: 'intervall over 10 s', gap30: 'intervall over 30 s', sum: 'sum av intervaller (for snitt)', min: 'korteste intervall', maks: 'lengste intervall',
});

const nyHist = kanter => new Array(kanter.length + 1).fill(0);
const bøtte = (kanter, v) => { let i = 0; while (i < kanter.length && v >= kanter[i]) i++; return i; };
const nyDag = dag => ({ dag, n: 0, cb: nyHist(KANTER_S), gps: nyHist(KANTER_S), alder: nyHist(KANTER_S), dekk12: nyHist(KANTER_S), ant60: nyHist(KANTER_ANTALL),
  likTs: 0, baklengs: 0, fremtid: 0, avbrudd: 0, gap5: 0, gap10: 0, gap30: 0, sum: 0, min: null, maks: null });

let _dager = null;          // lest fra lager første gang; null = ikke lest
let _dirty = false, _timer = null, _bundet = false;
let _sistCb = null, _sistTs = null, _v60 = [], _v12 = [];
let _samtykke = { ok: false, til: 0 };
const dagNøkkel = ms => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

function les() {
  if (_dager) return _dager;
  try { const v = JSON.parse(storage.get(KEY) || 'null'); _dager = v && Array.isArray(v.dager) ? v.dager.filter(d => d && typeof d.dag === 'string') : []; } catch { _dager = []; }
  return _dager;
}
/** Dropper det som er eldre enn 7 døgn og alt over 7 døgnposter. Håndheves ved skriving og lesing (ikke bare som filter). */
export function pruneFikstakt(dager, nå) {
  const t = Number.isFinite(nå) ? nå : Date.now(), grense = dagNøkkel(t - (BEHOLD_DAGER - 1) * DAG);
  return (dager || []).filter(d => d && d.dag >= grense).sort((a, b) => (a.dag < b.dag ? -1 : 1)).slice(-BEHOLD_DAGER);
}
function skriv() {
  _timer = null;
  if (!_dirty) return;
  try { storage.set(KEY, JSON.stringify({ v: 1, dager: pruneFikstakt(les(), Date.now()) })); _dirty = false; } catch { /* fullt/avslått: data kan gå tapt */ }
}
function nullstillUtgangspunkt() { _sistCb = null; _sistTs = null; _v60 = []; _v12 = []; }
function bind() {
  if (_bundet || typeof document === 'undefined') return;
  _bundet = true;
  // Ny forgrunn = nytt utgangspunkt (ingen kunstig lang første intervall). Skriv også ut det som er samlet.
  try { document.addEventListener('visibilitychange', () => { nullstillUtgangspunkt(); if (document.visibilityState === 'hidden') skriv(); }); } catch { /* */ }
  try { window.addEventListener('pagehide', () => { nullstillUtgangspunkt(); skriv(); }); } catch { /* */ }
}
/** Samtykke og testposisjon, bufret noen sekunder så GPS-callbacken ikke leser lageret hver gang. */
function aktiv(nå) {
  if (nå >= _samtykke.til) { let ok = false; try { ok = loadConsent() && !testPosPå(); } catch { ok = false; } _samtykke = { ok, til: nå + SAMTYKKE_TTL_MS }; }
  return _samtykke.ok;
}
/** Kalles når samtykket endres: ugyldiggjør bufferen så målingen stopper/starter umiddelbart. */
export function oppdaterFikstaktSamtykke() { _samtykke = { ok: false, til: 0 }; nullstillUtgangspunkt(); }

/**
 * Registrer én levert fiks. Returnerer ingenting; leser og endrer ikke `pos`. Kalles fra GPS-callbacken inni try/catch.
 * @param {{timestamp?:number}} pos  bare `timestamp` leses — aldri koordinater
 * @param {number} nå  appens mottakstid (ms)
 */
export function registrerFiks(pos, nå) {
  try {
    if (!Number.isFinite(nå) || !aktiv(nå)) return;
    bind();
    const dag = dagNøkkel(nå), l = les();
    let d = l.length ? l[l.length - 1] : null;
    if (!d || d.dag !== dag) { d = l.find(x => x.dag === dag); if (!d) { d = nyDag(dag); l.push(d); _dager = pruneFikstakt(l, nå); d = _dager.find(x => x.dag === dag); } }
    d.n++;
    // 1. Intervall mellom leveringer til appen (callback).
    if (_sistCb != null) {
      const s = (nå - _sistCb) / 1000;
      if (s > AVBRUDD_S) { d.avbrudd++; _v60 = []; _v12 = []; _sistTs = null; }
      else if (s >= 0) {
        d.cb[bøtte(KANTER_S, s)]++; d.sum += s;
        if (d.min == null || s < d.min) d.min = s;
        if (d.maks == null || s > d.maks) d.maks = s;
        if (s > 5) d.gap5++; if (s > 10) d.gap10++; if (s > 30) d.gap30++;
      } else { _v60 = []; _v12 = []; }
    }
    _sistCb = nå;
    // 2. Enhetens egen fikstid (pos.timestamp) — skiller leveringsforsinkelse fra faktisk fiksfrekvens.
    const ts = pos && Number.isFinite(pos.timestamp) ? pos.timestamp : null;
    if (ts != null) {
      if (_sistTs != null) {
        const g = (ts - _sistTs) / 1000;
        if (g === 0) d.likTs++; else if (g < 0) d.baklengs++; else if (g <= AVBRUDD_S) d.gps[bøtte(KANTER_S, g)]++;
      }
      _sistTs = ts;
      const a = (nå - ts) / 1000;
      if (a < -1) d.fremtid++; else d.alder[bøtte(KANTER_S, Math.max(0, a))]++;
    }
    // 3. Dekning: hvor lenge spenner de siste 12 levertene, og hvor mange fikser kom siste 60 s.
    _v12.push(nå); if (_v12.length > 12) _v12.shift();
    if (_v12.length === 12) d.dekk12[bøtte(KANTER_S, (nå - _v12[0]) / 1000)]++;
    _v60.push(nå); while (_v60.length && nå - _v60[0] > 60_000) _v60.shift(); if (_v60.length > 500) _v60.shift();
    d.ant60[bøtte(KANTER_ANTALL, _v60.length)]++;
    _dirty = true;
    if (_timer == null && typeof setTimeout === 'function') _timer = setTimeout(skriv, FLUSH_MS);
  } catch { /* målingen må aldri påvirke GPS-behandlingen */ }
}

/** Sletter alle måledata og stopper målingen til samtykket leses på nytt. */
export function slettFikstakt() {
  _dager = []; _dirty = false; nullstillUtgangspunkt();
  if (_timer != null && typeof clearTimeout === 'function') { clearTimeout(_timer); _timer = null; }
  _samtykke = { ok: false, til: 0 };
  try { storage.remove(KEY); } catch { /* */ }
}
/** Testhjelp: glem minnetilstand uten å røre lageret. */
export function _nullstillFikstaktMinne() { _dager = null; _dirty = false; _timer = null; nullstillUtgangspunkt(); _samtykke = { ok: false, til: 0 }; }
/** Skriv nå (test og pagehide). */
export function skrivFikstakt() { skriv(); }

const sumHist = (dager, f) => { const ut = new Array(dager.length ? dager[0][f].length : 0).fill(0); for (const d of dager) d[f].forEach((x, i) => { ut[i] += x || 0; }); return ut; };
const tot = h => h.reduce((a, b) => a + b, 0);
/** Omtrentlig kvantil fra histogram: bøtta (fra–til sekunder) der kvantilen faller. Oppløsningen er bøttene — ikke eksakt. */
function kvantil(h, kanter, q) {
  const n = tot(h); if (!n) return null;
  let c = 0; for (let i = 0; i < h.length; i++) { c += h[i]; if (c >= q * n) return { fra: i === 0 ? 0 : kanter[i - 1], til: i < kanter.length ? kanter[i] : null }; }
  return null;
}
/** Andel av målingene med verdi ≥ x (x må være en bøttekant, så grensen er eksakt). */
const andelFraOgMed = (h, kanter, x) => { const n = tot(h); if (!n) return null; const i = kanter.indexOf(x); return i < 0 ? null : Math.round(1000 * h.slice(i + 1).reduce((a, b) => a + b, 0) / n) / 1000; };

/**
 * Måleresultatet som JSON-objekt. Ingen koordinater, ingen eksakte tidspunkt, ingen reisedetaljer.
 * Kvantiler er omtrentlige (bøtteoppløsning); snitt, min, maks og tellere er eksakte.
 */
export function fikstaktStatistikk(nå = Date.now()) {
  const dager = pruneFikstakt(les(), nå), n = dager.reduce((s, d) => s + d.n, 0);
  const cb = sumHist(dager, 'cb'), gps = sumHist(dager, 'gps'), alder = sumHist(dager, 'alder'), d12 = sumHist(dager, 'dekk12'), a60 = sumHist(dager, 'ant60');
  const nCb = tot(cb), sum = dager.reduce((s, d) => s + d.sum, 0);
  const mins = dager.map(d => d.min).filter(x => x != null), maks = dager.map(d => d.maks).filter(x => x != null);
  const sum_ = dager.reduce((a, d) => ({ likTs: a.likTs + d.likTs, baklengs: a.baklengs + d.baklengs, fremtid: a.fremtid + d.fremtid, avbrudd: a.avbrudd + d.avbrudd, gap5: a.gap5 + d.gap5, gap10: a.gap10 + d.gap10, gap30: a.gap30 + d.gap30 }), { likTs: 0, baklengs: 0, fremtid: 0, avbrudd: 0, gap5: 0, gap10: 0, gap30: 0 });
  return {
    type: 'gps-fikstakt', versjon: 1,
    merknader: ['Måling i FORGRUNNEN (GPS-watchen stoppes i bakgrunnen).', 'pos.timestamp er ikke validert på faktiske iOS- og Android-enheter.',
      'Kvantiler er omtrentlige (bøtteoppløsning); snitt, min, maks og tellere er eksakte.', 'Ingen koordinater eller eksakte tidspunkt er lagret eller eksportert.'],
    dager: dager.map(d => d.dag), antallDager: dager.length, antallFikser: n,
    kanterSekunder: KANTER_S, kanterAntall: KANTER_ANTALL,
    leveringsintervall: { n: nCb, snittSek: nCb ? Math.round(1000 * sum / nCb) / 1000 : null, minSek: mins.length ? Math.min(...mins) : null, maksSek: maks.length ? Math.max(...maks) : null,
      medianSek: kvantil(cb, KANTER_S, 0.5), p90Sek: kvantil(cb, KANTER_S, 0.9), p95Sek: kvantil(cb, KANTER_S, 0.95),
      over5: sum_.gap5, over10: sum_.gap10, over30: sum_.gap30, histogram: cb },
    fikstidsintervall: { n: tot(gps), medianSek: kvantil(gps, KANTER_S, 0.5), p90Sek: kvantil(gps, KANTER_S, 0.9), p95Sek: kvantil(gps, KANTER_S, 0.95), histogram: gps },
    alderVedLevering: { n: tot(alder), medianSek: kvantil(alder, KANTER_S, 0.5), p90Sek: kvantil(alder, KANTER_S, 0.9), andelMinst5Sek: andelFraOgMed(alder, KANTER_S, 5), histogram: alder },
    gjentatteFikstidsstempler: sum_.likTs, tidsstempelBakover: sum_.baklengs, tidsstempelIFremtiden: sum_.fremtid, oppholdOver120s: sum_.avbrudd,
    tolvSisteFikser: { n: tot(d12), andelSomSpennerMinst: { '10s': andelFraOgMed(d12, KANTER_S, 10), '20s': andelFraOgMed(d12, KANTER_S, 20), '30s': andelFraOgMed(d12, KANTER_S, 30), '60s': andelFraOgMed(d12, KANTER_S, 60) }, histogram: d12 },
    fikserSiste60s: { n: tot(a60), andelMedMinst: { '10': andelFraOgMed(a60, KANTER_ANTALL, 10), '20': andelFraOgMed(a60, KANTER_ANTALL, 20), '30': andelFraOgMed(a60, KANTER_ANTALL, 30) }, histogram: a60 },
  };
}
/** Én rad per lagret felt, så alt som lagres vises (invarianten, bundet av test). */
export function fikstaktRader(nå = Date.now()) {
  const dager = pruneFikstakt(les(), nå), s = (f) => dager.reduce((a, d) => a + (d[f] || 0), 0);
  const h = f => tot(sumHist(dager, f));
  const val = { dag: dager.map(d => d.dag).join(', ') || '–', n: s('n'), cb: h('cb') + ' målinger', gps: h('gps') + ' målinger', alder: h('alder') + ' målinger', dekk12: h('dekk12') + ' målinger', ant60: h('ant60') + ' målinger',
    likTs: s('likTs'), baklengs: s('baklengs'), fremtid: s('fremtid'), avbrudd: s('avbrudd'), gap5: s('gap5'), gap10: s('gap10'), gap30: s('gap30'),
    sum: Math.round(s('sum')) + ' s', min: (() => { const m = dager.map(d => d.min).filter(x => x != null); return m.length ? Math.min(...m) + ' s' : '–'; })(),
    maks: (() => { const m = dager.map(d => d.maks).filter(x => x != null); return m.length ? Math.max(...m) + ' s' : '–'; })() };
  return Object.keys(FIKSTAKT_FELT).map(k => ({ felt: k, navn: FIKSTAKT_FELT[k], verdi: String(val[k]) }));
}
