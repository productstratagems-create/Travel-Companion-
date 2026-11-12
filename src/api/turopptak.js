/**
 * TUROPPTAK (v1.218.20) — et ekte spor å rette etter.
 *
 * Rapportert: «Appen er ikke god nok til å forstå at bruker nå er på en
 * bestemt rute eller linje, og er heller ikke god nok til å bestemme når en
 * bruker har forlatt den linjen.» Reiseloggen lagret bare beslutningen
 * («låst», «sluppet:brudd»), aldri posisjonen eller kandidatene, og alle
 * tersklene i ombord.js / ombordLaas.js er valgt ved resonnement. AGENTS.md:
 * «Reproduser før du retter.» Dette er reproduksjonen.
 *
 * Nivå 3 (enkeltturer med posisjon): bare med samtykke, glemt etter 7 døgn,
 * høyst MAKS_TURER turer og MAKS_BILDER bilder per tur, i ALL_KEYS, vist og
 * kopierbart i innstillinger.
 *
 * Ett BILDE per vurdering om bord, men bare når noe endret seg eller
 * BILDE_MIN_MS har gått: fiks, fart, dom, kandidater, vinner, lås, hendelse.
 * Kandidatenes KALL (turen med stopp og tider) lagres én gang per tur-nøkkel,
 * så opptaket kan spilles av uten nett (`spillAv`).
 */
import { storage } from '../storage.js';
import { loadConsent } from './consent.js';
import { oppdaterLås } from './ombordLaas.js';
import { pushLang } from '../trail.js';
import { kandidatAv } from './kandidat.js';
import { testPosPå } from './testPos.js';

const KEY = 't.turopptak';
export const MAKS_TURER = 5;
export const MAKS_BILDER = 2000;
export const BEHOLD_MS = 7 * 24 * 3600_000;
/** Et nytt opptak når det har gått så lenge siden forrige bilde. */
export const NY_TUR_MS = 10 * 60_000;
/** Ett bilde høyst så ofte, med mindre noe endret seg. */
export const BILDE_MIN_MS = 5000;
/** Skrives til lager høyst så ofte (og alltid ved en låsehendelse). */
export const SKRIV_MIN_MS = 10_000;
/** Det korte sporet i appen er de siste 12 fiksene. */
const KORT_SPOR = 12;

let _turer = null;      // i minnet; null = ikke lest ennå
let _skrevet = 0;
let _forrige = null;    // forrige bilde, for «endret seg»

function les() {
  if (_turer) return _turer;
  try { const v = JSON.parse(storage.get(KEY) || '[]'); _turer = Array.isArray(v) ? v : []; } catch { _turer = []; }
  return _turer;
}
function skriv(nå) {
  try { storage.set(KEY, JSON.stringify(_turer || [])); _skrevet = nå; } catch { /* fullt: neste gang */ }
}
function rydd(nå) {
  const t = les().filter(x => nå - (x.slutt || x.start) <= BEHOLD_MS);
  _turer = t.slice(-MAKS_TURER);
}

/** Kallet slik ombord.js leser det; stor, så bare én gang per tur-nøkkel. */
function kallAv(k) { return k && k.call ? JSON.parse(JSON.stringify(k.call)) : null; }

/**
 * @param {{nå:number, fiks?:{lat,lon,acc,at}, fart?:number|null, dom?:string,
 *   kandidater?:Array, rang?:Array, vinner?:object|null, vinnerKilde?:string,
 *   lås?:object|null, hendelse?:string|null}} b
 */
export function taOpp(b) {
  // Ingen opptak av en testposisjon (v1.218.46).
  if (!b || !Number.isFinite(b.nå) || !loadConsent() || testPosPå()) return false;
  const nå = b.nå;
  const kand = (b.kandidater || []).slice(0, 5);
  const bilde = {
    t: nå,
    p: b.fiks && Number.isFinite(b.fiks.lat) ? [+b.fiks.lat.toFixed(6), +b.fiks.lon.toFixed(6), b.fiks.acc ?? null, b.fiks.at ?? nå] : null,
    v: Number.isFinite(b.fart) ? +b.fart.toFixed(2) : null,
    d: b.dom || null,
    // Hvorfor «vet ikke» (ingen-fart, går, kort-spor, ingen-følger) — v1.218.24.
    g: b.domGrunn || null,
    k: kand.map(k => k.nøkkel),
    r: (b.rang || []).slice(0, 5).map(r => ({ n: r.k && r.k.nøkkel, ps: r.passert, av: r.avvik == null ? null : Math.round(r.avvik), g: r.grunn })),
    w: b.vinner ? b.vinner.nøkkel : null,
    wk: b.vinnerKilde || null,
    l: b.lås ? { n: b.lås.k.nøkkel, kilde: b.lås.kilde } : null,
    h: b.hendelse || null,
  };
  const endret = !_forrige || bilde.h || bilde.d !== _forrige.d || bilde.g !== _forrige.g || bilde.w !== _forrige.w
    || JSON.stringify(bilde.l) !== JSON.stringify(_forrige.l) || bilde.k.join() !== _forrige.k.join();
  if (!endret && nå - _forrige.t < BILDE_MIN_MS) return false;
  _forrige = bilde;

  rydd(nå);
  let tur = _turer[_turer.length - 1];
  if (!tur || nå - tur.slutt > NY_TUR_MS) {
    tur = { id: String(nå), start: nå, slutt: nå, linjer: [], kall: {}, bilder: [] };
    _turer.push(tur);
    _turer = _turer.slice(-MAKS_TURER);
  }
  // Kallene, én gang per nøkkel: kandidatene, vinneren og låsen.
  [...kand, b.vinner, b.lås && b.lås.k].filter(Boolean).forEach(k => {
    if (k.nøkkel && !tur.kall[k.nøkkel]) {
      const form = typeof b.form === 'function' ? b.form(k.nøkkel) : null;
      tur.kall[k.nøkkel] = { linje: k.linje, call: kallAv(k), form: Array.isArray(form) ? form : null };
    }
    if (k.linje && !tur.linjer.includes(k.linje)) tur.linjer.push(k.linje);
  });
  if (tur.bilder.length < MAKS_BILDER) tur.bilder.push(bilde);
  tur.slutt = nå;
  if (bilde.h || nå - _skrevet >= SKRIV_MIN_MS) skriv(nå);
  return true;
}

/** Skriv det som står i minnet (f.eks. når fanen skjules). */
export function lagreTuropptak() { if (_turer) skriv(Date.now()); }

/** Oversikten til innstillinger. */
export function turopptak(nå = Date.now()) {
  rydd(nå);
  return _turer.map(t => ({ id: t.id, start: t.start, slutt: t.slutt, linjer: t.linjer.slice(), bilder: t.bilder.length,
    hendelser: t.bilder.filter(b => b.h).map(b => b.h) })).reverse();
}

/** Hele turen som JSON, til «kopier turen». */
export function turJson(id) {
  const t = les().find(x => x.id === id);
  return t ? JSON.stringify({ versjon: 1, ...t }) : null;
}

export function slettTur(id) { _turer = les().filter(x => x.id !== id); skriv(Date.now()); }
export function glemTuropptak() { _turer = []; _forrige = null; try { storage.set(KEY, ''); } catch { /* */ } }
/** Bare for tester: glem det som står i minnet. */
export function _nullstillTuropptak() { _turer = null; _forrige = null; _skrevet = 0; }

/**
 * Spill av et opptak gjennom oppdaterLås, uten nett. Sporene bygges opp igjen
 * av fiksene i bildene (kort: de siste 12, langt: pushLang) — en tilnærming,
 * fordi appen også fikk fikser mellom bildene. Vinneren er den appen valgte
 * den gang; det er LÅSEN som spilles av, og det er den en rettelse endrer.
 * @returns {Array<{t:number, hendelse:string|null, lås:string|null}>}
 */
export function spillAv(tur, o = {}) {
  // Samme kandidat som appen bygde: kandidatAv med sporet slik det var, og
  // traséen som var kjent da (lagret i opptaket).
  const kAv = (n, spor) => {
    const x = n && tur.kall[n];
    return x ? kandidatAv(x.call, spor, x.form) : null;
  };
  const låsFn = o.oppdaterLås || oppdaterLås;
  let lås = null, kort = [], lang = [];
  const ut = [];
  for (const b of tur.bilder) {
    if (b.p) {
      const f = { lat: b.p[0], lon: b.p[1], acc: b.p[2], at: b.p[3] };
      kort = kort.concat(f).slice(-KORT_SPOR);
      lang = pushLang(lang, f);
    }
    const r = låsFn(lås, { låstK: lås ? kAv(lås.k.nøkkel, kort) : null, vinner: kAv(b.w, kort), vinnerKilde: b.wk || 'sikker',
      fartMS: b.v, spor: kort, lang, nå: b.t });
    lås = r.lås;
    ut.push({ t: b.t, hendelse: r.hendelse, lås: lås ? lås.k.nøkkel : null });
  }
  return ut;
}
