/* BASELINE-FORLØP FOR #809 STEG 1 (v1.218.329).
 * KONSTRUERT, ikke innspilt: sandkassen har ingen ekte GPS. Geometrien er en rett linje østover langs 59,9° N
 * (som tests/ombord.test.js), stoppene ligger på linja. Tidsstempler er faste, så alt er deterministisk.
 * Hvert forløp gir: spor (som state.posTrail: {lat,lon,at,acc}), stopplista slik den ser ut ved siste punkt
 * (distM målt fra siste punkt), og hva forløpet skal vise. */
import { pushFix } from '../../../src/trail.js';
import { metresBetween } from '../../../src/haversine.js';

export const T0 = Date.UTC(2026, 10, 2, 7, 0, 0);
export const LAT = 59.9;
export const lon = m => 10.70 + m / 55_800;   // 1° lengde ≈ 55,8 km ved 59,9° N
export const fiks = (m, tSek, acc = 10) => ({ lat: LAT, lon: lon(m), at: T0 + tSek * 1000, acc });

/** Stopp på linja (meter fra origo). Samme liste i alle forløp. */
export const STOPP = [
  { name: 'Granebakken', m: -250, id: 'NSR:StopPlace:Granebakken' },
  { name: 'Stenbråten', m: 0, id: 'NSR:StopPlace:Stenbråten' },
  { name: 'Maikollen', m: 300, id: 'NSR:StopPlace:Maikollen' },
  { name: 'Olasrudveien', m: 600, id: 'NSR:StopPlace:Olasrudveien' },
  { name: 'Mortensrud', m: 900, id: 'NSR:StopPlace:Mortensrud' },
];
/** Stopplista sett fra posisjonen `fraM`: { name, id, lat, lon, distM } — som state.nearestStations. */
export const stoppFra = fraM => STOPP.map(s => ({ name: s.name, id: s.id, lat: LAT, lon: lon(s.m), distM: Math.round(metresBetween({ lat: LAT, lon: lon(fraM) }, { lat: LAT, lon: lon(s.m) })) }));

/** Et spor fra `meterVedT(t)` for t i `tider` (sek), gjennom pushFix (maks 12 punkter, ≥4 s imellom — som i appen). */
export const spor = (meterVedT, tider, acc = 10) => tider.reduce((tr, t) => pushFix(tr, fiks(meterVedT(t), t, acc)), []);
const hver = (fra, til, steg) => Array.from({ length: Math.floor((til - fra) / steg) + 1 }, (_, i) => fra + i * steg);

/** Forløpene. `sluttM` = siste posisjon (m), `fartMS` = sann fart. */
export const FORLØP = {
  'står stille ved et stopp': { spor: spor(() => 20, hver(0, 30, 5)), sluttM: 20, fartMS: 0 },
  'går mot Granebakken (1,4 m/s, 110 m unna)': { spor: spor(t => -500 + 1.4 * t, hver(0, 100, 10)), sluttM: -500 + 1.4 * 100, fartMS: 1.4 },
  'går bort fra Stenbråten, 82 m unna (innenfor båndet)': { spor: spor(t => 40 + 1.4 * t, hver(0, 30, 5)), sluttM: 40 + 1.4 * 30, fartMS: 1.4 },
  'går bort fra Stenbråten, 180 m unna (utenfor båndet)': { spor: spor(t => 40 + 1.4 * t, hver(0, 100, 10)), sluttM: 40 + 1.4 * 100, fartMS: 1.4 },
  'sitter på buss (10 m/s østover)': { spor: spor(t => 10 * t, hver(0, 30, 10)), sluttM: 300, fartMS: 10 },
  'sitter på T-bane (18 m/s østover)': { spor: spor(t => 18 * t, hver(0, 30, 10)), sluttM: 540, fartMS: 18 },
  // To gode punkter, så ett hopp 2 km unna med dårlig nøyaktighet (300 m), så tilbake.
  'GPS hopper og mister nøyaktighet': { spor: [fiks(20, 0), fiks(20, 5), fiks(2000, 10, 300), fiks(20, 15), fiks(22, 20)], sluttM: 22, fartMS: 0 },
};
