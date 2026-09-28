/**
 * Avstand mellom to punkter på jorda. ÉN GANG.
 *
 * EN BLADMODUL UTEN IMPORTER, og det er ikke tilfeldig.
 *
 * Formelen var skrevet tre ganger — `geo.js` med `atan2`, `position.js` og
 * `trail.js` med `asin`. Grunnen var ekte, ikke slurv: `position.js` og
 * `trail.js` importerer ingenting med vilje, og `geo.js` importerer selv fra
 * begge. En import den veien ville laget en syklus, så hver av dem bar sin
 * egen kopi med en kommentar som sa hvorfor.
 *
 * De tre var enige. `2·atan2(√a, √(1−a))` og `2·asin(√a)` gir samme tall for
 * a ≤ 1 — og NETTOPP DERFOR ville driften vært usynlig: ingenting bandt dem
 * sammen, og to formuleringer av samme formel inviterer til at én av dem
 * «forbedres».
 *
 * Rettelsen er derfor ikke å slette to kopier, men å gi formelen et hjem som
 * alle tre kan nå uten å bryte sin egen regel. Samme grep som `stopId.js`
 * for stoppnavn og `posSource.js` for kildeordene.
 */

/** Jordas middelradius i meter. Det ene tallet. */
export const EARTH_R_M = 6_371_000;

const rad = (d) => (d * Math.PI) / 180;

/**
 * Meter mellom to `{lat, lon}`.
 *
 * `asin`-formen, med `Math.min(1, …)` mot flyttallsstøy nær antipoder —
 * uten den kan `√s` så vidt overstige 1 og gi NaN.
 */
export function metresBetween(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Den samme avstanden, med fire tall i stedet for to punkter.
 *
 * Navnet og argumentformen er `geo.js` sin, som ni kallesteder alt kjenner.
 * Den er en innpakning, ikke en andre utregning — det er hele poenget.
 */
export function haver(la1, lo1, la2, lo2) {
  return metresBetween({ lat: la1, lon: lo1 }, { lat: la2, lon: lo2 });
}
