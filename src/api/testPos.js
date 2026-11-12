/**
 * TESTPOSISJON (v1.218.46). Bestilt: «et sted i innstillinger der jeg kan legge
 * inn et sted for å kunne teste appen i ulike områder. Det stedet skal benyttes
 * i stedet for gps posisjon for testformål.»
 *
 * Når den er satt, starter ikke GPS (geo.js `_startWatch`); en syntetisk fiks
 * går gjennom den samme veien som en ekte, så alt nedstrøms er uendret. Og
 * ingenting fra testen havner i minnet ditt: ikke turopptak, ikke reiseloggen,
 * ikke vanene, ikke den lagrede posisjonen.
 *
 * Bladmodul: bare lageret.
 */
import { storage } from '../storage.js';

const KEY = 't.testPos';

/** Faste steder å teste fra. */
export const TEST_STEDER = [
  { navn: 'Oslo S', lat: 59.9111, lon: 10.7528 },
  { navn: 'Mortensrud', lat: 59.8493, lon: 10.8297 },
  { navn: 'Bergen, Byparken', lat: 60.3913, lon: 5.3221 },
  { navn: 'Bergen, Paradis', lat: 60.3684, lon: 5.3418 },
  { navn: 'Trondheim, Torvet', lat: 63.4305, lon: 10.3951 },
  { navn: 'Stavanger, Torget', lat: 58.9700, lon: 5.7331 },
];

export function hentTestPos() {
  try {
    const v = JSON.parse(storage.get(KEY) || 'null');
    return v && Number.isFinite(v.lat) && Number.isFinite(v.lon) ? { navn: String(v.navn || 'testposisjon'), lat: v.lat, lon: v.lon } : null;
  } catch { return null; }
}
export function settTestPos(p) {
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return false;
  try { storage.set(KEY, JSON.stringify({ navn: p.navn || 'testposisjon', lat: p.lat, lon: p.lon })); return true; } catch { return false; }
}
export function slettTestPos() { try { storage.remove(KEY); } catch { /* */ } }
/** Er testposisjonen på? Ett navn for alle vaktene. */
export const testPosPå = () => !!hentTestPos();
