/**
 * REKK DEN LENGER NED (v1.218.176). Rapportert fra Mortensrud: raden «73 → 81
 * · 19:14 · rekker ikke» sto i lista, og et kort over kartet foreslo
 * Kantarellen 19:19, 13 min unna — SAMME buss. Appen visste begge deler og
 * sa dem på to steder. Svaret hører hjemme på raden.
 *
 * Bare data raden alt har: turens kall etter ditt stopp, med tid og sted.
 * Ingen søk. Ren.
 */
import { stopKey } from './stopId.js';

/** Hvor mye lenger du går enn til ditt eget stopp, før det ikke er et råd. */
export const REKK_EKSTRA_MIN = 5;
/** Uansett ditt eget stopp: lenger enn dette er ikke «lenger ned», det er en tur. */
export const REKK_MAKS_MIN = 20;

const ms = c => Date.parse((c && (c.expectedDepartureTime || c.aimedDepartureTime)) || '');
const sted = c => (c && c.quay && c.quay.stopPlace) || {};
const lik = (c, id, navn) => {
  const s = sted(c);
  return (id && s.id === id) || (!!navn && !!s.name && stopKey(s.name) === stopKey(navn));
};

/**
 * Første stopp ETTER ditt der turen kan nås til fots, før du uansett skulle gått av.
 * @param kall     turens estimatedCalls
 * @param fra      { id, navn } — stoppet raden går fra
 * @param slutt    { id, navn } | null — der etappen slutter (bytte eller mål)
 * @param gangTil  ({lat,lon}) => minutter | null
 * @param egenGang minutter til ditt eget stopp
 * @returns { stopp: {id,navn,lat,lon}, ms, gangMin } | null
 */
export function rekkLengerNed(kall, fra, slutt, gangTil, egenGang, nå) {
  const k = kall || [];
  const i = k.findIndex(c => lik(c, fra && fra.id, fra && fra.navn));
  if (i < 0) return null;   // vet ikke hvor på turen vi er: si ingenting
  const maks = Math.min(REKK_MAKS_MIN, (Number.isFinite(egenGang) ? egenGang : 0) + REKK_EKSTRA_MIN);
  for (let j = i + 1; j < k.length; j++) {
    const c = k[j];
    if (slutt && lik(c, slutt.id, slutt.navn)) return null;
    const lat = c.quay && Number.isFinite(c.quay.latitude) ? c.quay.latitude : sted(c).latitude;
    const lon = c.quay && Number.isFinite(c.quay.longitude) ? c.quay.longitude : sted(c).longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const t = ms(c);
    if (!Number.isFinite(t)) continue;
    const g = gangTil({ lat, lon });
    if (!Number.isFinite(g) || g > maks) continue;
    // Samme regel som «rekker»: du må kunne gå nå og være der før den.
    if (Math.floor((t - g * 60_000 - nå) / 60_000) < 0) continue;
    return { stopp: { id: sted(c).id || null, navn: sted(c).name || '', lat, lon }, ms: t, gangMin: g };
  }
  return null;
}

/** Linja på raden. Én tekst for Rute og Auto-tavle. */
export function rekkTekst(r, klokke) {
  return 'rekk den på ' + r.stopp.navn + ' ' + klokke(r.ms) + ' · ' + r.gangMin + ' min å gå';
}
