/**
 * Hva underveis-skjermen sier om enden av en etappe.
 *
 * TO SETNINGER SOM LÅNTE NAVN FRA FEIL STED.
 *
 *     siste etappe   'ankommer ' + state.jny.dest
 *     ellers         'bytt på '  + leg.toStation
 *
 * Den første sto ved siden av KJØRETØYETS ankomsttid. Ender reisen til fots
 * («Aker brygge»), er det tiden T-banen er på Nationaltheatret — og skjermen
 * sa «07:22 ankommer Aker brygge», der du er framme 07:30. En tid du ikke
 * er framme, med et sted du ikke er på.
 *
 * Den andre var sann om stedet du går av, og taus om at neste etappe går
 * fra et ANNET sted. Ved Jernbanetorget → Oslo S sa den «bytt på
 * Jernbanetorget», og ingenting om at toget står på Oslo S.
 *
 * Begge svarene var regnet ut: OTP gir gangeetappene, adapteren regner
 * minuttene (`gåMin`, `_alightWalkMins`). AGENTS.md regel 2: er verdien
 * regnet ut, skal den stå på skjermen.
 *
 * EN BLADMODUL. Den importerer bare `stopKey`, så den kan prøves uten
 * `track.js` og alt den drar med seg.
 */
import { stopKey } from './stopId.js';

const id = s => String(s || '');

/** «4 min å gå», eller ingenting når gangen ikke er kjent eller er null. */
function _gang(min) {
  return Number.isFinite(min) && min > 0 ? ' · ' + min + ' min å gå' : '';
}

/**
 * Siste etappe: der du går av, og — om det ikke er målet — gangen dit.
 *
 * @param {{toStation:string, gåEtter?:number|null}} leg
 * @param {string} mål reisens endepunkt, `state.jny.dest`
 * @param {(s:string)=>string} [vis] hvordan et stoppnavn skrives ut
 */
export function ankomstTekst(leg, mål, vis = id) {
  const stopp = leg && leg.toStation;
  // Samme sted, eller vi vet ikke hvor kjøretøyet stopper: da er den gamle
  // setningen den riktige. `stopKey`, så «Ryen T» og «Ryen» er ett sted.
  if (!stopp || !mål || stopKey(stopp) === stopKey(mål)) {
    return 'ankommer ' + vis(mål || stopp || '');
  }
  return 'av på ' + vis(stopp) + _gang(leg.gåEtter);
}

/**
 * En etappe som ikke er den siste: der du går av, og — om neste etappe går
 * fra et annet sted — hvor du skal og hvor langt det er å gå.
 *
 * @param {{toStation:string, gåEtter?:number|null}} leg
 * @param {{fromStation:string}|null} neste
 * @param {(s:string)=>string} [vis]
 */
export function bytteTekst(leg, neste, vis = id) {
  const av = leg && leg.toStation;
  const på = neste && neste.fromStation;
  if (!av) return '';
  /* BLI SITTENDE. Linja skifter nummer, du skifter ikke sete. «Bytt på
   * Oslo S» til en som skal bli sittende til Ski er et råd om å gå av. */
  if (leg.blisittende && neste) {
    return 'bli sittende — fortsetter som ' + (neste.lineCode || '?')
      + (neste.frontText ? ' mot ' + neste.frontText : '');
  }
  if (!på || stopKey(av) === stopKey(på)) return 'bytt på ' + vis(av);
  return 'av på ' + vis(av) + ' · gå til ' + vis(på) + _gang(leg.gåEtter);
}
