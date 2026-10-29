/**
 * HVA EN SEKSJON VET — og hva den skal si om det.
 *
 * Tre seksjoner på ankomstpanelet sa «laster …» utelukkende fordi en
 * variabel var `null`:
 *
 *     track.js:683    !_arrBoard      → «laster avganger…»
 *     track.js:1044   !_nearbyPlaces  → «laster steder…»
 *     track.js:1099   !_arrWeather    → «laster vær…»
 *
 * Da bærer `null` fire ulike fakta samtidig: *ikke spurt*, *spør nå*,
 * *spurte og feilet*, *spurte og fikk ingenting*. AGENTS.md regel 4 forbyr
 * nøyaktig det, med nesten de samme ordene: «"Ikke spurt", "leter",
 * "avslått", "unøyaktig" og "gammel" er ikke samme setning. Stillhet leses
 * som "alt er i orden".»
 *
 * En evig «laster …» er verre enn stillhet. Den lover at noe er på vei.
 *
 * SAMME FORM SOM `liveness`, `posState` og `boardState` — mønsteret
 * `alight.js:138` skriver ned: «One clean verdict … the screen derives its
 * words from `kind`.» Det er derfor dette er en ren funksjon i `api/` og
 * ikke en `if` inne i visningen: da kan den prøves uten en DOM.
 *
 * `feilet` og `tomt` deler ikke klasse, fordi de ikke er samme sak. «Ingen
 * steder i nærheten» er et SVAR. «Fikk ikke svar» er en innrømmelse.
 */

/** Ordene per seksjon. Ett sted, så to skjermer ikke finner opp hvert sitt. */
const ORD = {
  vær: {
    henter: 'henter vær …',
    feilet: 'vær utilgjengelig',
    tomt:   'ingen værdata',
  },
  steder: {
    henter: 'henter steder …',
    feilet: 'fikk ikke svar om steder',
    tomt:   'ingen steder i nærheten',
  },
  avganger: {
    henter: 'henter avganger …',
    feilet: 'fikk ikke svar om avganger',
    tomt:   'ingen avganger herfra',
  },
};

/** De fem tilstandene en seksjon kan være i. Ikke flere, og ikke færre. */
export const KINDS = ['ikke-spurt', 'henter', 'feilet', 'tomt', 'ok'];

/**
 * Dommen om én seksjon.
 *
 * @param {string} emne  'vær' | 'steder' | 'avganger'
 * @param {{spurt?:boolean, feil?:boolean, data?:any}} o
 * @returns {{kind:string, label:string|null}} `label` er null når seksjonen
 *   har innhold å vise — da er det innholdet som taler, ikke en setning om
 *   det.
 */
export function seksjon(emne, o) {
  const ord = ORD[emne];
  if (!ord) return { kind: 'feilet', label: null };
  const c = o || {};

  // Rekkefølgen bærer betydning: en feil er en feil selv om noe gammelt
  // ligger igjen i cachen, og «ikke spurt» kommer før «henter» fordi en
  // seksjon ingen har bedt om ikke skal se ut som en som er på vei.
  if (c.feil) return { kind: 'feilet', label: ord.feilet };
  if (!c.spurt) return { kind: 'ikke-spurt', label: ord.henter };
  if (c.data == null) return { kind: 'henter', label: ord.henter };
  if (Array.isArray(c.data) && !c.data.length) return { kind: 'tomt', label: ord.tomt };
  return { kind: 'ok', label: null };
}

/**
 * Prøv igjen, med en slutt.
 *
 * Fem sekunder, så femten, så førtifem — og så ikke mer. Overpass er en
 * delt dugnadstjeneste og Open-Meteo er gratis; en app som maser blir
 * utestengt, og da hjelper det ingen at den var ivrig.
 *
 * Tallene står her framfor i tre kallesteder, av samme grunn som alt annet
 * i denne fila.
 */
export const REFORSØK_MS = [5_000, 15_000, 45_000];

/**
 * Hvor lenge til neste forsøk, eller null når vi har prøvd ferdig.
 * @param {number} forsøk antall forsøk som alt er gjort (0 = ingen ennå)
 */
export function nesteForsøk(forsøk) {
  const i = Number.isFinite(forsøk) ? forsøk : 0;
  return i >= 0 && i < REFORSØK_MS.length ? REFORSØK_MS[i] : null;
}
