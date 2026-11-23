/**
 * FELLES REISEBEREGNING (v1.218.287, plangrunnlaget steg 1).
 *
 * Det alle reiseoppgaver og all senere mulighetsoppdagelse trenger, og som
 * IKKE vet noe om «mot sentrum» eller «hjemover»: rekker du avgangen, hvilken
 * er den første du rekker i en retning, og hvilke stopp kjører den videre til.
 * Flyttet hit fra views/auto.js uendret (auto.js eksporterer dem videre, så
 * eksisterende kall og tester står). Rene funksjoner.
 */
import { minsToLeave } from './geo.js';
import { erInnstilt } from './innstilt.js';
import { stopsAhead } from './ui/stoppVelger.js';

/**
 * ÉN definisjon av «rekker du den». Uten gangtid (ingen posisjon) teller alt.
 */
export function canCatch(ms, walkMins, now) {
  if (!Number.isFinite(ms)) return false;
  if (walkMins == null) return true;
  return minsToLeave(ms, walkMins, now) >= 0;
}

/** Avgangene i en retning du rekker, tidligst først, med kallet. Innstilte teller ikke. */
export function catchable(d, walkMins, now) {
  const t = Number.isFinite(now) ? now : Date.now();
  return ((d && d.calls) || [])
    .filter(x => x && !x.innstilt && !erInnstilt(x.call)
      && x.ms >= t && canCatch(x.ms, walkMins, t))
    .sort((a, b) => a.ms - b.ms);
}

/**
 * Stoppene videre på turen du faktisk tar i en retning: den første du rekker,
 * ellers retningens første kall. Lest fra stoppet tavla er hentet for
 * (`fraNavn`); et kall fra et nabostopp leser sitt eget (`_fra`, stopsAhead).
 */
export function stoppVidere(d, fraNavn, gang, nå) {
  const ride = catchable(d, gang, nå)[0];
  return stopsAhead((ride && ride.call) || (d && d.call), fraNavn, nå);
}
