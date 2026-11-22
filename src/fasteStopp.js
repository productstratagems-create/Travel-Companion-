/**
 * DINE FASTE STOPP (v1.218.251, onboarding steg 1). Bestilt: «forhøre seg om
 * bruker ønsker å oppgi hvilken holdeplass som bruker liker å reise fra om
 * morgenen på vei til jobb/tilsvarende, og hvilken … på vei hjem fra jobb …
 * for å kunne tilby så relevante reiseforslag som mulig.» Valgt: tilbys én
 * gang ETTER første tavle; styrer «nærmeste stopp».
 *
 * Lagres i profilen (src/profil.js `settSted`) — samme plass appen alt
 * gjetter: morgen-stoppet er HJEM-holdeplassen, ettermiddags-stoppet
 * JOBB-holdeplassen. Én definisjon; ingen ny lagring. Rene funksjoner.
 */
import { erHelgLik } from './dagtype.js';
import { nærViktigFørst, båndFor } from './api/stops.js';
import { NEAR_STOP_MAX_M } from './geo.js';

/** Hverdag 05–10: du reiser fra morgen-stoppet. 14–19: fra ettermiddags-stoppet. */
export const MORGEN = [5, 10], ETTERMIDDAG = [14, 19];
/** Det faste stoppet gjelder bare innen gangavstand. */
export const FAST_MAKS_M = 640;

/** Hvilken rolle gjelder nå: 'hjem' (morgen), 'jobb' (ettermiddag) eller null. */
export function fastRolleNå(nå) {
  if (erHelgLik(nå)) return null;
  const t = new Date(nå).getHours();
  if (t >= MORGEN[0] && t < MORGEN[1]) return 'hjem';
  if (t >= ETTERMIDDAG[0] && t < ETTERMIDDAG[1]) return 'jobb';
  return null;
}

const like = (s, f) => !!(s && f && ((f.stopId && String(s.id).split('|')[0] === String(f.stopId).split('|')[0])
  || (f.navn && s.name && s.name.toLowerCase() === f.navn.toLowerCase())));

/**
 * Det faste stoppet først i lista, når det gjelder nå og er innen gangavstand
 * — men ikke når du står ved et annet stopp (≤ ved), som før.
 * @param list   rangert stoppliste ({id, name, distM})
 * @param sagt   profilens oppgitte steder ({hjem, jobb})
 */
export function fastFørst(list, sagt, nå, ved = 100) {
  const rolle = fastRolleNå(nå), f = rolle && sagt && sagt[rolle];
  if (!f || !list || !list.length) return list;
  if (Number.isFinite(list[0].distM) && list[0].distM <= ved && !like(list[0], f)) return list;
  // På bygda (v1.218.253): gangavstanden følger nærmeste stopp, som båndet.
  const maks = Math.max(FAST_MAKS_M, båndFor(Math.min(...list.map(s => (Number.isFinite(s.distM) ? s.distM : Infinity)))));
  const i = list.findIndex(s => like(s, f) && Number.isFinite(s.distM) && s.distM <= maks);
  if (i <= 0) return list;
  return [list[i], ...list.slice(0, i), ...list.slice(i + 1)];
}

/**
 * Skal kortet «dine faste stopp» stå? Etter første tavle, til begge er
 * oppgitt eller du har trykket «ikke nå» / «ferdig» (avvist).
 */
export function tilbyFasteStopp({ sagt, avvist, tavleVist }) {
  return !!tavleVist && !avvist && !(sagt && sagt.hjem && sagt.jobb);
}

/**
 * FØRSTE ÅPNING: forklar før nettleseren spør om posisjon. Bare når
 * nettleseren ennå ikke har spurt («prompt») og forklaringen ikke er vist.
 */
export function trengerPosForklaring(tillatelse, forklart) {
  return tillatelse === 'prompt' && !forklart;
}

/** Så mange forslag i kortet. */
export const FASTE_MAKS = 6;
/**
 * FORSLAGENE (v1.218.252). Rapportert: Mortensrud T og bussterminalen manglet,
 * seks små stopp nær deg sto i stedet. Rangeringskonseptet (nærViktigFørst →
 * sammenlignViktighet) over hele stopplista — stoppet i overskriften først. Ren.
 */
export function fasteKandidater(liste, overskrift, viktigAv, maks = FASTE_MAKS) {
  const innen = (liste || []).filter(s => s && s.id && (!Number.isFinite(s.distM) || s.distM <= NEAR_STOP_MAX_M));
  const rangert = innen.slice().sort(nærViktigFørst(viktigAv, s => s.distM, NEAR_STOP_MAX_M));
  const ut = [], sett = new Set();
  [overskrift, ...rangert].forEach(s => { if (s && s.id && !sett.has(s.id) && ut.length < maks) { sett.add(s.id); ut.push(s); } });
  return ut;
}
/** Flyttet du deg så langt, lages forslagene på nytt. */
export const FASTE_RO_M = 300;
/**
 * RO I FORSLAGENE (v1.218.252). Bestilt: «ikke konstant skifter plass eller at
 * plasser forsvinner eller kommer til flere ganger på svært kort tid».
 * Lista fryses første gang; ny bare når du har flyttet deg FASTE_RO_M, eller
 * én gang når tilbudet blir kjent (kjent: true første gang). Ren.
 * @param forrige { liste, pos, kjent } | null
 */
export function fasteRo(forrige, ny, pos, kjent, avstand) {
  if (!forrige || !forrige.liste || !forrige.liste.length) return { liste: ny, pos, kjent };
  const flyttet = pos && forrige.pos && avstand(pos, forrige.pos) > FASTE_RO_M;
  if (flyttet || (kjent && !forrige.kjent)) return { liste: ny, pos, kjent };
  return forrige;
}
