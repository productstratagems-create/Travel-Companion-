/**
 * FOKUS PER STEG OG ZOOM ETTER FART (v1.218.228). Spurt: «Hvilke proven
 * forhåndsdefinerte zoomnivåer og fokus finnes?» Proven (Google, Apple,
 * Citymapper, Ruter): kartet rammer inn ETAPPEN du er på og går videre selv;
 * under navigasjon følger zoomen farten, og zoomer inn før avstigning.
 * Underveis rammet inn hele reisen på NÆRHET. Rene funksjoner.
 */
import { ZOOM } from './ui/kartRamme.js';

/** Taket per steg — én definisjon for Underveis og avgangsdetaljene. */
export const STEG_TAK = { 'gå': ZOOM.GANG, vent: ZOOM.PLATTFORM, ombord: ZOOM.REISE, 'nær-av': ZOOM.NÆRHET, bytte: ZOOM.PLATTFORM };
/** «Nær av»: så få stopp, eller så få sekunder, igjen. */
export const NÆR_AV_STOPP = 2, NÆR_AV_S = 90;

/**
 * @param fase   computeState().phase: 'riding' | 'platform' | 'arrived' | 'før'
 * @param igjen  { stopp, sek } til avstigning/bytte (om bord)
 * @returns 'gå' | 'vent' | 'ombord' | 'nær-av' | 'bytte' | null
 */
export function stegNøkkel(fase, igjen = {}, vedStoppet = false) {
  if (fase === 'før') return vedStoppet ? 'vent' : 'gå';
  if (fase === 'platform') return 'bytte';
  if (fase !== 'riding') return null;
  const { stopp, sek } = igjen;
  if ((Number.isFinite(stopp) && stopp <= NÆR_AV_STOPP) || (Number.isFinite(sek) && sek <= NÆR_AV_S)) return 'nær-av';
  return 'ombord';
}

/** Det kartet skal romme for steget. Punkter [lat, lon]. Ren. */
export function stegRamme(steg, { du, stopp, gang, plattform, neste, av, bytteGang } = {}) {
  const p = x => (x && Number.isFinite(x.lat) ? [x.lat, x.lon] : null);
  let pts = [];
  if (steg === 'gå') pts = [p(du), p(stopp), ...((gang || []).map(g => (Array.isArray(g) ? g : p(g))))];
  else if (steg === 'vent') pts = [p(plattform) || p(stopp)];
  else if (steg === 'ombord') pts = [p(du), p(neste)];
  else if (steg === 'nær-av') pts = [p(du), p(av)];
  else if (steg === 'bytte') pts = (bytteGang || []).map(g => (Array.isArray(g) ? g : p(g)));
  pts = pts.filter(Boolean);
  return pts.length ? { pts, maks: STEG_TAK[steg] } : null;
}

/** Zoomtrinnet for farten (m/s): gange nær, tog langt. Ren. */
export function zoomEtterFart(ms) {
  if (!Number.isFinite(ms) || ms < 2) return ZOOM.GANG;      // 17
  if (ms < 6) return ZOOM.NÆRHET;                             // 16
  if (ms < 15) return ZOOM.REISE;                             // 15
  return ZOOM.RUTER;                                          // 14
}
/** Et nytt trinn gjelder først når det har vart så lenge. */
export const FART_RO_MS = 8000;
/** Fartstrinn med ro: kortvarige topper (lyskryss, rykk) bytter ikke. Ren. */
export function fartMedRo(forrige, ms, nå) {
  // UKJENT FART ER IKKE GANGFART (v1.218.246, T-bane i tunnel): uten fart
  // står trinnet som det står — før zoomet kartet inn til 17 etter 8 s.
  if (!Number.isFinite(ms)) return forrige || { zoom: zoomEtterFart(null), kandidat: null, siden: null };
  const ny = zoomEtterFart(ms);
  if (!forrige) return { zoom: ny, kandidat: null, siden: null };
  if (ny === forrige.zoom) return { zoom: forrige.zoom, kandidat: null, siden: null };
  if (forrige.kandidat === ny && nå - forrige.siden >= FART_RO_MS) return { zoom: ny, kandidat: null, siden: null };
  return { zoom: forrige.zoom, kandidat: ny, siden: forrige.kandidat === ny ? forrige.siden : nå };
}
