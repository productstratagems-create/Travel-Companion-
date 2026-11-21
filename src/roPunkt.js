/**
 * RO-PUNKTET (v1.218.212). Rapportert: «virker som en nervøs og skjelvende
 * app som ikke egentlig aner hvor bruker er, når gps-målingen flytter seg
 * litt uten at bruker har flyttet seg». Linja «du er her» fulgte hver fiks:
 * 81D → 81C, påstand → spørsmål → påstand, «(±1126 m)» som tikket.
 *
 * Stedet du «er» ligger fast til en ny fiks er TYDELIG et annet sted:
 * lenger unna enn både ROM_M og fiksens egen usikkerhet, og det har VART i
 * FLYTT_MS. En skarpere fiks inni den gamle usikkerheten forbedrer punktet
 * med én gang (det er ikke en flytting, det er bedre kunnskap). Ren.
 */
import { metresBetween } from './haversine.js';
export const ROM_M = 30, FLYTT_MS = 8000;

/**
 * @param forrige { lat, lon, acc, ute: ms|null } | null
 * @param fix     { lat, lon, acc }
 * @returns nytt ro-punkt (samme objekt når ingenting endres)
 */
export function roPunkt(forrige, fix, nå) {
  if (!fix || !Number.isFinite(fix.lat)) return forrige;
  const acc = Number.isFinite(fix.acc) ? fix.acc : ROM_M;
  if (!forrige) return { lat: fix.lat, lon: fix.lon, acc, ute: null };
  const d = metresBetween(forrige, fix);
  // Skarpere og innenfor det vi alt visste: bedre kunnskap, ikke flytting.
  if (acc < forrige.acc / 2 && d <= forrige.acc) return { lat: fix.lat, lon: fix.lon, acc, ute: null };
  if (d <= Math.max(ROM_M, acc)) return forrige.ute == null ? forrige : { ...forrige, ute: null };
  const ute = forrige.ute != null ? forrige.ute : nå;
  if (nå - ute >= FLYTT_MS) return { lat: fix.lat, lon: fix.lon, acc, ute: null };
  return forrige.ute === ute ? forrige : { ...forrige, ute };
}
