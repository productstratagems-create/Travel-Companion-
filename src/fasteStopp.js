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
  const i = list.findIndex(s => like(s, f) && Number.isFinite(s.distM) && s.distM <= FAST_MAKS_M);
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
