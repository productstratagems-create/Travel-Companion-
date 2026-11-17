/**
 * HØYRE- ELLER VENSTREHENDT (v1.218.73). Bestilt: «en innstilling som lar
 * bruker velge om appen skal optimalisere for høyrehendt eller venstrehendt
 * bruk. Høyrehendt: knappene på kartene er nede til høyre, og omvendt.»
 *
 * Én definisjon av hjørnet. Verktøysøylen står i det; skalastreken i det
 * andre, så de aldri deler hjørne.
 */
import { storage } from './storage.js';

export const HÅND_KEY = 't.hånd';
export const HÅND_HENDELSE = 'tc:hånd';

export function lastHånd() {
  try { return storage.get(HÅND_KEY) === 'venstre' ? 'venstre' : 'høyre'; } catch { return 'høyre'; }
}
export function lagreHånd(h) {
  const v = h === 'venstre' ? 'venstre' : 'høyre';
  try { storage.set(HÅND_KEY, v); } catch (_) {}
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(HÅND_HENDELSE, { detail: v }));
  return v;
}
/** Hjørnet knappene står i. Ren. */
/**
 * KOMPASSET I MOTSATT HJØRNE (v1.218.110). Bestilt: «Kan vi ha knappepanelet
 * vertikalt dersom vi flytter kompasset til øvre venstre hjørnet — og bytte
 * om dersom bruker velger venstrehendt.» Da står det aldri over søylen.
 */
export function kompassHjørne(h) { return h === 'venstre' ? 'topright' : 'topleft'; }
export function verktøyHjørne(h) { return h === 'venstre' ? 'bottomleft' : 'bottomright'; }
/** Hjørnet skalastreken står i: det andre. Ren. */
export function skalaHjørne(h) { return h === 'venstre' ? 'bottomright' : 'bottomleft'; }
