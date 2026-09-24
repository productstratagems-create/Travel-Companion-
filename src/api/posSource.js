/**
 * HVEM SVARTE — og med hvilke ord.
 *
 * En bladmodul uten importer, som `stopId.js` og av samme grunn.
 *
 * Underveis-skjermen har to lesere som begge må si hvem som svarte: stripen
 * navngir sensoren som plasserte TOGET, og stopplista navngir den som
 * plasserte DEG. Da de ble skrevet hver for seg hadde de hvert sitt ordvalg
 * — «din gps» mot «etter posisjon» — for det samme. To sett ord for ett
 * begrep, på samme skjerm, er den samme feilformen som to sett regler.
 *
 * Så ordene bor her, og begge leser dem. `views/trainPosition.js`
 * re-eksporterer dem under navnet ni kallesteder alt kjenner.
 */
export const SRC_LABEL = {
  gps:     'din gps',
  live:    'sanntid',
  rutetid: 'etter rutetid',
};
