/**
 * Hvor lenge appen husker en vane — ett navn, to lagre.
 *
 * ── BESLUTNINGEN DENNE FILA BÆRER ──────────────────────────────────────
 *
 * Personvernsida har sagt at appen husker reisene dine «de siste sju
 * døgnene», og at det er av til du slår det på. Det var sant om reiseloggen
 * (`api/eventLog.js`) og usant om alt annet: `t.smartHist` og
 * `t.freqArr`/`t.freqDep` skrives uten samtykke, uten vindu, og de bærer
 * destinasjoner, avreisesteder OG koordinater.
 *
 * To utveier fantes. Å skrive om teksten til å si at appen oppbevarer en
 * koordinatfestet reisehistorikk for alltid, uten å spørre — ærlig, men da
 * argumenterer sida mot seg selv, for den sier i samme avsnitt hvorfor
 * vinduet er sju døgn: «en ukes posisjonshistorikk på telefonen kan leses av
 * den som får telefonen ulåst i hendene.» Den begrunnelsen skiller ikke
 * mellom hendelser og aggregater.
 *
 * Så: LAGERET ENDRES, OG TEKSTEN BESKRIVER DET SOM BLIR IGJEN.
 *
 * ── MEN IKKE SJU DØGN ──────────────────────────────────────────────────
 *
 * Et sju døgns vindu på vanene ville ødelagt dem. `VANE_MIN_TURER` er fire,
 * og fire turer er omtrent det en uke rommer — hver eneste vane ville ligget
 * på grensen for alltid. Vinduet skal passe det det måler: en vane er noe du
 * har gjort over tid, et hendelsesspor er noe du gjorde i går.
 *
 * Tre nivåer, og de har tre ulike grunner:
 *
 *   det du har sagt       rute, favoritter          til du sletter
 *   det appen har merket  vaner, ofte brukte steder  90 dager uten bruk
 *   enkeltturer m/ pos.   reiseloggen                7 døgn, med samtykke
 *
 * 90 dager er en kvartalsgrense og ikke en måling — ingen her har prøvd den
 * mot ekte bruk. Den er valgt fordi en rute du ikke har tatt på tre måneder
 * ikke lenger er din vane, og fordi `ferskhet()` (v1.192.0) alt demoterer
 * den lenge før: etter sju døgn sier raden «før», ikke «vanlig nå». Dette
 * vinduet rydder altså bare bort det skjermen for lengst har sluttet å tro
 * på.
 *
 * EN BLADMODUL uten importer, som `stopId.js` og `walkSpeed.js`. Begge
 * lagrene leser den, og to filer som skrev ned det samme tallet ville vært
 * kodebasens signaturfeil: appen ville glemt en destinasjon og husket at du
 * pleide å reise dit.
 */

/** Hvor mange dager uten bruk før appen glemmer en vane. */
export const VANE_MAKS_DAGER = 90;

const DAG = 86400000;

/**
 * Alt som er brukt innenfor vinduet.
 *
 * `lastUsed` er feltet begge lagrene alt fører — `recordSmartTrip` og
 * `trackPlace` setter det ved hver bruk — så dette er ikke ny bokføring,
 * bare å lese det som står der.
 *
 * EN RAD UTEN `lastUsed` BEHOLDES. Den er skrevet av en eldre utgave, og å
 * kaste den ville vært å slette data på grunn av et felt den aldri fikk
 * sjansen til å ha. Neste bruk gir den et tidsstempel, og da gjelder
 * vinduet.
 *
 * @param {Array<{lastUsed?:number}>} list
 * @param {number} [nå]
 */
export function eldes(list, nå) {
  const t = Number.isFinite(nå) ? nå : Date.now();
  const grense = t - VANE_MAKS_DAGER * DAG;
  return (list || []).filter(e => {
    if (!e) return false;
    if (!Number.isFinite(e.lastUsed)) return true;
    return e.lastUsed >= grense;
  });
}
