/**
 * STEDENE DU HAR GÅTT TIL — de fem siste, og veien ut av dem.
 *
 * Når du har valgt et gåmål fra et ankomststopp, huskes det, og dukker opp
 * som en chip under «hvor skal du videre?» neste gang. Det sparer deg for å
 * skrive adressen på nytt.
 *
 * DEN BOR HER OG IKKE I `views/track.js`, der den sto.
 *
 * Innstillingene må kunne tømme lista — «slett alt appen husker» lover det
 * — og da måtte `settings.js` ellers importert fra en VISNING. Det er
 * nøyaktig lekkasjen revisjonen fant mellom `track.js` og `board.js`, der to
 * moduler henter `_interpolateVehiclePos` ut av en skjerm. Et faktum om hva
 * appen lagrer hører i `api/`, ikke bak en render.
 *
 * ET STED ER `{ label, lat, lon }`, og ETIKETTEN er identiteten. Ikke
 * indeksen: to chips kan dele prefiks — «Oslo S» og «Oslo lufthavn» er ekte
 * stopp — og å fjerne på posisjon ser riktig ut helt til det ikke gjør det.
 * Denne kodebasen har `legExtent` fordi «Bryn» er en delstreng av
 * «Brynseng», og den feilen tegnet feil strekning uten å si fra.
 */
import { storage } from '../storage.js';

/** Nøkkelen. Står også i `ALL_KEYS` i storage.js, bundet av storageKeys.test.js. */
export const RECENT_KEY = 't.recentDests';

/**
 * Hvor mange som huskes.
 *
 * Fem er en rad som brekker til to linjer på telefonbredde, ikke fire. Lista
 * er en snarvei, ikke et arkiv — den som skal ha historikken sin har
 * reiseloggen under «hva appen husker».
 */
export const MAX_RECENTS = 5;

/** Nyeste først. Et ødelagt lager leses som tomt framfor å kaste. */
export function loadRecentDests() {
  try {
    const v = JSON.parse(storage.get(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

function lagre(liste) {
  try { storage.set(RECENT_KEY, JSON.stringify(liste)); } catch { /* fullt eller sperret */ }
}

/** Legg til, eller flytt til toppen om stedet alt er der. */
export function saveRecentDest(dest) {
  if (!dest || !dest.label) return;
  const liste = loadRecentDests().filter(d => d.label !== dest.label);
  liste.unshift(dest);
  lagre(liste.slice(0, MAX_RECENTS));
}

/**
 * Fjern ett sted, på etikett.
 *
 * Du kunne velge en chip, men ikke bli kvitt den. Det var det rapporterte
 * hullet: lista vokste til fem og ble stående, med steder du var innom én
 * gang.
 */
export function removeRecentDest(label) {
  const liste = loadRecentDests();
  const igjen = liste.filter(d => d.label !== label);
  if (igjen.length !== liste.length) lagre(igjen);
}

/**
 * Tøm alt.
 *
 * Kalles fra «slett alt appen husker» i innstillingene. Den knappen lover
 * noe absolutt, og kalte før bare `clearEvents()` — som rører `t.events`
 * alene. Fem destinasjoner ble stående igjen etter at noen hadde bedt appen
 * glemme alt, og destinasjoner er det mest avslørende appen holder på.
 */
export function clearRecentDests() {
  try { storage.remove(RECENT_KEY); } catch { /* ignore */ }
}
