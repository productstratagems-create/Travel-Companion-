/* SYNTETISKE STØYSPOR FOR #809 STEG 3 — seedet PRNG, deterministiske. KONSTRUERT støy (gaussisk), ikke opptak fra telefoner. */
export const T0 = 1.8e12;
export const LAT = 59.9;
const M_LAT = 111_320, M_LON = M_LAT * Math.cos(LAT * Math.PI / 180);
/** Seedet generator (LCG) → { rnd, gauss }. */
export function prng(seed = 12345) {
  let a = seed | 0;   // mulberry32 (bedre enn en enkel LCG: v1.218.331-kalibreringen brukte en svak LCG og få seeds)
  const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  return { rnd, gauss };
}
/**
 * Spor av `n` fikser. `fart(tSek)` = sann østover-posisjon-derivert er IKKE brukt; i stedet `x(tSek)` = sann posisjon i meter østover.
 * `sigma` = faktisk støy (m), `accRap` = RAPPORTERT acc (default sigma), `takt` = snitt-sekunder mellom fikser (±30 % jitter).
 * `hopp` = [{ i, m }]: fiks nr. i flyttes m meter (rapportert acc beholdes — løgn).
 */
export function støyspor({ x = () => 0, sigma = 5, accRap, takt = 1, n = 60, seed = 1, start = 0, hopp = [], fra = 0 }) {
  const { rnd, gauss } = prng(seed);
  let t = fra, ut = [];
  for (let i = 0; i < n; i++) {
    t += takt * (0.7 + 0.6 * rnd());
    const h = hopp.find(j => j.i === i);
    const xs = x(t) + gauss() * sigma + (h ? h.m : 0), ns = gauss() * sigma;
    ut.push({ lat: LAT + ns / M_LAT, lon: 10.7 + xs / M_LON, at: T0 + Math.round((start + t) * 1000), acc: accRap ?? sigma });
  }
  return ut;
}
export const meterTilLon = m => 10.7 + m / M_LON;
