/**
 * DE TO REISEOPPGAVENE: MOT SENTRUM OG HJEMOVER (v1.218.287).
 *
 * Plangrunnlaget steg 1 (docs/plangrunnlag.md): «Isoler og beskytt dagens
 * Mot sentrum og Hjemover.» Dette er personlige reiseoppgaver med et definert
 * mål — ikke kategorier i en generell algoritme for reisemuligheter. Hver har
 * ÉN inngang her; views/auto.js bygger konteksten og viser resultatet.
 *
 *   motSentrum(retninger, ktx)  → { oppgave, retninger, beste }
 *   hjemover(retninger, ktx)    → { oppgave, retninger, beste }
 *
 * Felles beregning (rekker du den, stoppene videre) ligger i reiseberegning.js
 * og kjenner ikke disse oppgavene. Ny mulighetsoppdagelse (lokalt, regionalt,
 * nasjonalt) skal ligge ved siden av, og skal ikke kunne endre resultatet her
 * — det bindes av tests/reiseoppgaver.test.js.
 *
 * Kontekst (ktx), alle felt valgfrie:
 *   her        { lat, lon } — stoppet tavla er hentet for
 *   fraNavn    navnet på det stoppet (stoppene videre leses derfra)
 *   gang       min å gå dit, eller null (ingen posisjon: alt rekkes)
 *   nå         ms
 *   hjemListe  hjemover-stoppene [{ id, name }] (hjemStopp)
 *   hjemSøk    { etapper, gange } — reisesøket hjem for stoppet, når det finnes
 *   reiser     tripPatterns fra der du er til sentrum (reisesøket), når det finnes
 * Rene funksjoner.
 */
import { centreward } from './api/centre.js';
import { hjemDom } from './hjemover.js';
import { stoppVidere } from './reiseberegning.js';
import { besteFraReiser } from './reiseTil.js';

export const MOT_SENTRUM = 'mot';
export const HJEMOVER = 'hjem';
/** «Dine snarveier» — de personlige reiseoppgavene, i fast rekkefølge (steg 1b). */
export const SNARVEIER = [MOT_SENTRUM, HJEMOVER];

/**
 * Retningene én snarvei slipper gjennom. Dommene kommer inn som funksjoner
 * (gårMotSentrum/hjemoverDom bundet til konteksten i presentasjonslaget), så
 * utvalget og beregningen er samme regel overalt. Ren.
 */
export function iSnarvei(retninger, valg, erMot, erHjem) {
  if (valg === MOT_SENTRUM) return (retninger || []).filter(d => erMot(d));
  if (valg === HJEMOVER) return (retninger || []).filter(d => erHjem(d));
  return [];
}

/** Går retningen mot sentrum? Dømt etter turen du faktisk tar. */
export function gårMotSentrum(d, ktx = {}) {
  return centreward(ktx.her || null, stoppVidere(d, ktx.fraNavn, ktx.gang ?? null, ktx.nå)) === 'mot';
}

/** Går retningen hjemover, og eventuelt med bytte? { hjem, bytte } */
export function hjemoverDom(d, ktx = {}) {
  const liste = ktx.hjemListe;
  if (!liste || !liste.length) return { hjem: false, bytte: null };
  const fram = stoppVidere(d, ktx.fraNavn, ktx.gang ?? null, ktx.nå);
  const l = (d && d.lines && d.lines[0]) || {};
  const s = ktx.hjemSøk || null;
  return hjemDom(l.id, fram, liste, s && s.etapper, s && s.gange);
}

/**
 * MOT SENTRUM: retningene som går dit, og beste påstigning — slik Entur velger
 * den (tidligst framme, gangen medregnet), når reisesøket har svart.
 */
export function motSentrum(retninger, ktx = {}) {
  const r = (retninger || []).filter(d => gårMotSentrum(d, ktx));
  return { oppgave: MOT_SENTRUM, retninger: r, beste: Array.isArray(ktx.reiser) ? besteFraReiser(ktx.reiser, ktx.nå) : null };
}

/**
 * HJEMOVER: retningene som når et hjemover-stopp (eventuelt via bytte). Beste
 * påstigning fra reisesøk finnes ikke ennå for hjemover (plangrunnlaget,
 * åpent spørsmål 3) — `beste` er null, og overskriften følger telleregelen.
 */
export function hjemover(retninger, ktx = {}) {
  const r = (retninger || []).filter(d => hjemoverDom(d, ktx).hjem);
  return { oppgave: HJEMOVER, retninger: r, beste: null };
}
