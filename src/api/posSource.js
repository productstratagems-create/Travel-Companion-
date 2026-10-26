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

/* ── OG HVA SLAGS KJØRETØY DET ER ──────────────────────────────────────────
 *
 * Samme begrunnelse, ett hakk ned. Tabellene bodde i `views/track.js`, med
 * kommentaren «One table, five modes» — og det var sant så lenge ÉN skjerm
 * leste dem. Avgangsdetaljer trenger nå det samme ordet til sin
 * kart­etikett, og to skjermer som sier «bussen» hver for seg er formen
 * denne kodebasen har funnet rundt tjuefem ganger.
 *
 * Alle tre flytter sammen. Å ta med seg én og la de to søsknene bli igjen er
 * nettopp slik neste avdrift begynner.
 */

/** Bestemt form, for «bussen er nå ved». */
export const VEHICLE_NOUN = {
  bus: 'bussen', tram: 'trikken', metro: 'toget', rail: 'toget', water: 'båten',
};

/** Ubestemt form, for «byttebuss» og «neste buss». */
export const VEHICLE_WORD = {
  bus: 'buss', tram: 'trikk', metro: 'tog', rail: 'tog', water: 'båt',
};

/** Versalene på en stoppnål. En ukjent modus sier INGENTING framfor en løgn. */
export const MODE_PIN = {
  bus: 'BUSS', tram: 'TRIKK', metro: 'T-BANE', rail: 'TOG', water: 'BÅT',
};
