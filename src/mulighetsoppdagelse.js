/**
 * ANDRE REISEMULIGHETER (v1.218.288, plangrunnlaget steg 1b).
 *
 * Inngangen for det som IKKE er de personlige snarveiene: andre aktuelle
 * retninger og de geografiske målområdene — og senere lokale, regionale og
 * nasjonale muligheter. Skilt fra src/reiseoppgaver.js med en håndhevet
 * avhengighetsregel (tests/arkitektur.test.js):
 *
 *   reiseoppgaver.js       → reiseberegning.js
 *   mulighetsoppdagelse.js → reiseberegning.js
 *   ingen av dem importerer den andre; reiseberegning.js importerer ingen av dem.
 *
 * Kjent kobling som er beholdt (steg 1b.3, ikke endret her fordi det ville
 * endret skjermen): «andre retninger» er det som verken er mot sentrum eller
 * hjemover, og målområdene bygges av dem. Den koblingen kommer inn som en
 * parameter (`erSnarvei`) fra presentasjonslaget — denne modulen vet ikke hva
 * en snarvei er. Rene funksjoner.
 */
import { målområder } from './maalomrader.js';

/** Retningene som ikke er tatt av en snarvei (presentasjonslaget sier hvilke). */
export function andreRetninger(retninger, erSnarvei = () => false) {
  return (retninger || []).filter(d => !erSnarvei(d));
}

/** De geografiske målområdene for et sett retninger (src/maalomrader.js). */
export function områderFor(retninger, her, stoppFor, nøkkel) {
  return målområder(retninger, her, stoppFor, nøkkel);
}

/** Retningene i ett målområde. */
export function iOmråde(retninger, områdeAv, id) {
  return (retninger || []).filter(d => områdeAv(d) === id);
}

/** Er valget et målområde? */
export function erOmrådeValg(valg) {
  return typeof valg === 'string' && valg.startsWith('omr:');
}
