/**
 * GANGEN, STEG FOR STEG (v1.218.192). Spurt: «Hva er proven mtp. turn by turn
 * navigasjon til fots?» Utprøvd (Google, Apple, Citymapper): kartet med ruta
 * og en retningskjegle er hovedsaken; tekst bare ved beslutningspunkter — «om
 * 60 m: til venstre» — og «stoppet er på venstre side» når du er framme.
 * Ingenting på rette strekk, og ingen alarm om du går en annen vei.
 *
 * Gangruta vi har er bare punkter (Valhalla/Entur, approach.js) — ingen
 * gatenavn. Svingene leses av geometrien. Rent; meter og grader.
 */
import { metresBetween } from './haversine.js';
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;

/** Kurs fra a til b, 0 = nord, med klokka. */
export function kurs(a, b) {
  const φ1 = rad(a.lat), φ2 = rad(b.lat), Δλ = rad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2), x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
/** Avstanden har ett hjem (haversine.js). */
export const avstand = metresBetween;
/** Vinkel fra kurs a til kurs b, −180..180 (positiv = høyre). */
export function vri(a, b) { return ((b - a + 540) % 360) - 180; }

/** Så langt du må ha gått før sporet sier noe om retningen. */
export const KURS_MIN_M = 12;
/**
 * Kursen du går i, fra sporet (de siste fiksene) — ikke kompasset, som peker
 * dit telefonen peker. Null når du står stille eller sporet er for kort.
 */
export function kursNå(spor) {
  const s = (spor || []).filter(p => p && Number.isFinite(p.lat));
  if (s.length < 2) return null;
  const b = s[s.length - 1];
  for (let i = s.length - 2; i >= 0; i--) if (avstand(s[i], b) >= KURS_MIN_M) return kurs(s[i], b);
  return null;
}

/** En sving er en kursendring på minst dette. Mindre er veien som buer. */
export const SVING_GRADER = 40;
/** Punkter nærmere enn dette slås sammen før svingene leses (støy i ruta). */
export const SVING_GLATT_M = 8;
/** Lenger unna ruta enn dette: vi vet ikke hvor på den du er — ingen linje. */
export const UTENFOR_RUTA_M = 30;
/** Nærmere stoppet enn dette: «framme», ikke «sving». */
export const FRAMME_M = 40;

const ll = p => Array.isArray(p) ? { lat: p[0], lon: p[1] } : p;
function forenkle(pts) {
  const ut = [];
  pts.forEach(p => { if (!ut.length || avstand(ut[ut.length - 1], p) >= SVING_GLATT_M) ut.push(p); });
  const sist = pts[pts.length - 1];
  if (ut[ut.length - 1] !== sist) ut.push(sist);
  return ut;
}
function projiser(p, a, b) {
  const kx = Math.cos(rad(p.lat));
  const ax = a.lon * kx, ay = a.lat, bx = b.lon * kx, by = b.lat, px = p.lon * kx, py = p.lat;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return { t, q: { lat: ay + t * dy, lon: (ax + t * dx) / kx } };
}

/**
 * Neste ting å si om gangen, eller null.
 *  { kind: 'sving', side: 'venstre'|'høyre', skarp, m }   — neste beslutningspunkt
 *  { kind: 'framme', side: 'venstre'|'høyre'|'foran', m } — stoppet, når du er nær
 *  null — rett strekk til stoppet, utenfor ruta, eller for lite å gå på.
 */
export function nesteSving(rute, pos, kursGrader) {
  const pts = (rute || []).map(ll).filter(p => p && Number.isFinite(p.lat));
  if (pts.length < 2 || !pos) return null;
  const mål = pts[pts.length - 1];
  const tilMål = avstand(pos, mål);
  if (tilMål <= FRAMME_M) {
    if (!Number.isFinite(kursGrader)) return null;
    const v = vri(kursGrader, kurs(pos, mål));
    return { kind: 'framme', side: Math.abs(v) < 30 ? 'foran' : v > 0 ? 'høyre' : 'venstre', m: Math.round(tilMål) };
  }
  const f = forenkle(pts);
  // Hvor på ruta du er: nærmeste segment.
  let best = { d: Infinity, i: 0, q: f[0] };
  for (let i = 0; i < f.length - 1; i++) {
    const { q } = projiser(pos, f[i], f[i + 1]);
    const d = avstand(pos, q);
    if (d < best.d) best = { d, i, q };
  }
  if (best.d > UTENFOR_RUTA_M) return null;
  let m = avstand(best.q, f[best.i + 1]);
  for (let j = best.i + 1; j < f.length - 1; j++) {
    const v = vri(kurs(f[j - 1], f[j]), kurs(f[j], f[j + 1]));
    if (Math.abs(v) >= SVING_GRADER) return { kind: 'sving', side: v > 0 ? 'høyre' : 'venstre', skarp: Math.abs(v) >= 110, m: Math.round(m) };
    m += avstand(f[j], f[j + 1]);
  }
  return null;
}

/** Linja på skjermen. Én tekst for alle skjermer. */
export function svingTekst(s, stoppNavn) {
  if (!s) return '';
  if (s.kind === 'framme') return (stoppNavn || 'stoppet') + ' er ' + (s.side === 'foran' ? 'rett foran deg' : 'på ' + s.side + ' side');
  const rund = s.m < 20 ? 'nå' : 'om ' + (s.m < 100 ? Math.round(s.m / 10) * 10 : Math.round(s.m / 50) * 50) + ' m';
  return rund + ': ' + (s.skarp ? 'skarpt ' : '') + 'til ' + s.side;
}

/**
 * SVINGTEKSTEN AV (v1.218.230). Spurt: «Hva er proven for navigasjonsstøtte
 * til fots? Her blir det ikke helt hjelpsomt. Ta det bort dersom vi ikke
 * greier å lage det iht. proven.» Proven (Google Maps, Apple Kart, gange):
 * svinger gis bare i en navigasjon du har startet — stor pil, avstand og
 * gatenavn, oppdatert etter kursen din, med vibrasjon ved svingen. En
 * tekstlinje under stoppnavnet på en tavle er ikke det. Én bryter for Auto
 * og avgangsdetaljene; funksjonene står.
 */
export const SVING_PÅ = false;
