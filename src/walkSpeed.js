/**
 * Hvor fort du går.
 *
 * Egen modul, og den importerer ingenting — med vilje.
 *
 * De tre tallene sto fire steder: her (under navnet `SPEED_MPN`), i
 * `api/entur.js` omregnet til meter per sekund og tastet inn på nytt, i
 * `views/settings.js` som et objekt-literal inne i en skjerm, og som
 * `|| 83.33` spredt over fem linjer som fallback. Fire kopier av tre tall
 * som bestemmer når appen ber deg gå hjemmefra.
 *
 * Grunnen til at tabellen ikke bare ble stående i `geo.js` er den samme som
 * `stopCats.js` skriver ned: `geo.js` er 848 linjer med tretti avhengigheter,
 * og en fil med null importer kan ikke havne i en sykel. Da `api/entur.js`
 * begynte å lese navnet framfor tallene, var det nettopp en modullasting som
 * knakk først — i en test som mocket `geo.js` bort.
 *
 * Meter per minutt, fordi det er enheten resten av appen regner i. Enhver
 * annen enhet er en omregning av DETTE navnet, aldri tre nye tall.
 */
export const SPEED_MPN = { rolig: 41.67, middels: 83.33, rask: 116.67 };

/** Den som gjelder når ingenting er valgt, sagt med navn framfor med tall. */
export const SPEED_DEFAULT = SPEED_MPN.middels;
