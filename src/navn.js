/**
 * HVA APPEN HETER — og det eneste stedet det er skrevet ned.
 *
 * Den het fem ting: «T-bane — sanntid for Oslo og Viken» i fanen, «T-bane —
 * reisefølge for Oslo» i manifestet, «T-bane på hjemskjermen» på
 * installasjonssiden, «reisefølge for oslo» på personvernsiden og
 * social-kortet, og «travel-companion» i pakka.
 *
 * Og `index.html` sin egen beskrivelse motsa dem alle: «Sanntids avganger
 * for T-bane, buss, trikk OG TOG». Appen het én av fire ting den gjør.
 *
 * REISEFØLGE ER IKKE ET NYTT NAVN. Det sto allerede i manifestets `name`, i
 * personvernsidens tittel og som øyenbryn på social-kortet — halvveis
 * adoptert, uten at noe gjorde de andre stedene enige.
 *
 * SAMME GREP SOM `origin.js`: ett navn i JS, `__NAVN__`-merker i de statiske
 * filene, byttet ut ved bygg av `scripts/injectFakta.mjs`. En bladmodul uten
 * importer, så den kan leses av appen, byggetrinnet og skriptene som lager
 * bildene — uten å kunne havne i en sykel.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * DET TJENESTENE SER ER NOE ANNET, OG STÅR URØRT MED VILJE:
 *
 *   ET_CLIENT_NAME    productstratagems-travel-companion   api/http.js
 *   Client-Identifier travel-companion-oslo                api/bysykkel.js
 *   ICS_DOMAIN        travel-companion.local               api/ics.js
 *   package.json      travel-companion
 *
 * Det første er Enturs kjennetegn på denne klienten i deres egen
 * strupekontroll; det siste ligger i UID-en på kalenderoppføringer du alt
 * har delt. Et teknisk kjennetegn er ikke et produktnavn, og å slå dem
 * sammen fordi de ligner er den sammenblandingen dette repoet bruker
 * tjuefem rettelser på å unngå. `tests/navn.test.js` binder at de blir
 * stående.
 * ──────────────────────────────────────────────────────────────────────────
 */

/**
 * Kortformen — og den ENE strengen en bruker ser hver dag.
 *
 * iOS kutter hjemskjerm-etiketten rundt tolv tegn. «Reisefølge» er elleve.
 * Et navn som kuttes er et navn ingen kan lese, så lengden er bundet i test.
 */
export const NAVN = 'Reisefølge';

/** Fanen, Google-treffet og lenkeforhåndsvisningen. */
export const NAVN_TITTEL = NAVN + ' — sanntid for Oslo og Viken';

/** Manifestets `name`: det som står i installasjonsdialogen. */
export const NAVN_LANGT = NAVN + ' for Oslo og Viken';
