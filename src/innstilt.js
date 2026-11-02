/**
 * Er denne avgangen innstilt? Ett svar, for alle skjermene.
 *
 * TO STEDER KAN BÆRE DET: `cancellation` på kallet (denne avgangen, ved
 * dette stoppet) og `serviceJourney.cancellation` (hele turen). `selected.js`
 * spurte om begge; alle andre spurte om det første eller ingen av dem. Og
 * auto-reise spurte ikke i det hele tatt — `groupDirections` og `catchable`
 * kjente ikke ordet. En innstilt avgang som nådde dem ville blitt «2 min»
 * for et tog som ikke kommer.
 *
 * At det ikke skjedde var flaks, ikke design: ingen spørring i appen ber
 * Journey Planner om innstilte avganger, og da filtreres de bort før appen
 * ser dem. Skal de slippes inn (v1.196.0), må alle skjermer kunne kjenne dem
 * igjen først. Dette er den ene definisjonen de leser.
 *
 * EN BLADMODUL uten importer, som `stopId.js` og `vane.js`.
 */
export function erInnstilt(c) {
  return !!(c && (c.cancellation
    || (c.serviceJourney && c.serviceJourney.cancellation)));
}
