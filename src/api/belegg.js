/**
 * Hvor fullt det er — og hvem som sier det.
 *
 * Appen viste et belegningsnivå som var **umulig å skille** fra et målt tall.
 * Når Entur ikke sa noe, regnet `board.js` ut et nivå selv:
 *
 *     const _center = ['jernbanetorget', 'nationaltheatret', 'stortinget'];
 *     if (_dow >= 1 && _dow <= 5) { if (_h >= 7 && _h <= 9 && _toCity) score += 2; }
 *     else score -= 1;                      // helg: lettere
 *     if (score >= 4) occLevel = 5;
 *
 * Hardkodede sentrumsstopp, rushtidsvinduer, ukedag/helg. Og `occPip(5)`
 * tegnet nøyaktig samme merke med nøyaktig samme `aria-label` — «fullt» —
 * enten tallet kom fra Entur eller fra klokka. En leser kunne ikke vite
 * hvilken av delene hun så på.
 *
 * Det er regel 4 i AGENTS.md: «Si hva du ikke vet. «Ikke spurt», «leter»,
 * «avslått», «unøyaktig» og «gammel» er ikke samme setning.» «Målt» og
 * «anslag» er det heller ikke.
 *
 * HEURISTIKKEN ER IKKE KASTET. «Ingenting kastes for å rydde» — den er flyttet
 * inn hit som `anslag` og har endelig en etikett som sier hva den er. Den var
 * aldri verdiløs; den var umerket.
 *
 * ÉN TABELL, IKKE TO. `empty → 1 … full → 5` sto skrevet ned to ganger i
 * `board.js` — på linje 2988 og i `legOccLevel` på 2416 — med hver sin
 * fallback bak seg. To steder som skriver ned samme faktum er feilformen
 * dette repoet har rettet rundt tjuefem ganger.
 *
 * En bladmodul uten importer, i samme form som `liveness.js`, `seksjon.js` og
 * `posSource.js`: én navngitt dom, og skjermen avleder ordene sine av `kind`.
 */

/**
 * Hvem som sa det. Rekkefølgen er styrken.
 *
 *   målt      Entur sa det — reiseplanleggerens `occupancyStatus`, eller
 *             sanntidsstrømmen.
 *   anslag    Ingen sa det. Appen gjettet, og sier at den gjettet.
 *   vet-ikke  Ikke nok til et anslag heller. Det er et svar, ikke en feil.
 */
export const KINDS = ['målt', 'anslag', 'vet-ikke'];

/** Nivåene, 1–5. Indeks 0 finnes ikke; `null` er «vet ikke». */
export const ORD = ['', 'svært lite folk', 'lite folk', 'noen seter', 'travelt', 'fullt'];

/**
 * Enturs `occupancyStatus` → nivå. DEN ENE TABELLEN.
 *
 * Navnene er Transmodels, og de to øverste slås bevisst sammen: «fullt» og
 * «fullt med ståplasser» er samme beskjed til en som skal bestemme seg for om
 * hun tar denne eller neste.
 *
 * @param {string} status
 * @returns {number|null} 1–5, eller null når feltet mangler eller er ukjent
 */
export function fraEntur(status) {
  switch (status) {
    case 'empty':                    return 1;
    case 'manySeatsAvailable':       return 2;
    case 'fewSeatsAvailable':        return 3;
    case 'standingRoomOnly':         return 4;
    case 'full':                     return 5;
    case 'crushedStandingRoomOnly':  return 5;
    default:                         return null;
  }
}

/**
 * Dommen.
 *
 * @param {object} o
 * @param {string} [o.status]  Enturs occupancyStatus, om den finnes
 * @param {number} [o.anslag]  appens eget anslag, 1–5, eller null
 * @returns {{kind: string, nivå: number|null, ord: string}}
 */
export function belegg(o) {
  const { status = null, anslag = null } = o || {};

  const målt = fraEntur(status);
  if (målt != null) return { kind: 'målt', nivå: målt, ord: ORD[målt] };

  // Et anslag utenfor 1–5 er ikke et anslag, det er en feil et sted lenger
  // opp. Da er «vet ikke» det ærlige svaret framfor å klemme tallet inn.
  if (Number.isInteger(anslag) && anslag >= 1 && anslag <= 5) {
    return { kind: 'anslag', nivå: anslag, ord: ORD[anslag] };
  }

  return { kind: 'vet-ikke', nivå: null, ord: '' };
}

/**
 * Hva skjermen skal si. Ordene avledes av `kind`, de bæres ikke.
 *
 * «ca.» er hele forskjellen en leser trenger, og den er kort nok til å stå i
 * en rad som alt er trang. Den fulle setningen står i `aria-label` og i
 * `title`, der det er plass til den.
 */
export function beleggTekst(b) {
  if (!b || b.kind === 'vet-ikke') return { kort: '', fullt: 'ingen data om hvor fullt det er' };
  if (b.kind === 'anslag') return { kort: 'ca. ' + b.ord, fullt: b.ord + ' — anslag, ikke målt' };
  return { kort: b.ord, fullt: b.ord };
}
