/**
 * VEIVALGET (v1.218.204). Rapportert med skjermbilde: to gangruter fra
 * adressen — én til hovedstoppet, én til alternativet — som går hver sin vei
 * og krysser hverandre lenger fram. «Rart at ikke appen foreslår det jeg har
 * ringet rundt som stedet veivalget må tas, heller enn å foreslå to ulike
 * stier ut fra adressen.»
 *
 * Rutene hentes hver for seg, så fram til der de møtes er de to likeverdige
 * veier til samme punkt. Valget tas der de skilles. Her: finn møtepunktet,
 * bruk én felles stamme (den korteste) fram dit, og to grener derfra. Ren.
 */
import { metresBetween } from './haversine.js';

const ll = p => (Array.isArray(p) ? { lat: p[0], lon: p[1] } : p);
const lengde = pts => pts.slice(1).reduce((s, p, i) => s + metresBetween(ll(pts[i]), ll(p)), 0);

/** Så nær må rutene komme for å regnes som møtt. */
export const MØTES_M = 12;
/** Møtepunkt nærmere starten enn dette er bare der du står — ingen stamme. */
export const STAMME_MIN_M = 30;

/**
 * @param a, b  rutene ([lat, lon]-punkter), begge fra der du står
 * @returns { stamme, a, b, veivalg: [lat, lon] } — eller null når rutene ikke
 *   møtes (eller møtes ved starten): da tegnes de som før.
 */
export function felles(a, b) {
  if (!a || !b || a.length < 2 || b.length < 2) return null;
  // SISTE møte: der de skilles for godt. Første møte etter starten kunne vært
  // en kryssing midt i et felles strekk.
  let best = null;
  for (let i = a.length - 1; i >= 0 && !best; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      if (metresBetween(ll(a[i]), ll(b[j])) <= MØTES_M) { best = { i, j }; break; }
    }
  }
  if (!best) return null;
  const stammeA = a.slice(0, best.i + 1), stammeB = b.slice(0, best.j + 1);
  if (lengde(stammeA) < STAMME_MIN_M || lengde(stammeB) < STAMME_MIN_M) return null;
  // Er møtet ved målet for den ene, er det ingen gaffel — samme mål.
  if (best.i >= a.length - 1 || best.j >= b.length - 1) return null;
  const stamme = lengde(stammeA) <= lengde(stammeB) ? stammeA : stammeB;
  return { stamme, a: a.slice(best.i), b: b.slice(best.j), veivalg: a[best.i] };
}
