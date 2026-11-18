/**
 * KLOKKESLETTENE FOR «AVGANGER ETTER …» (v1.218.132). Bestilt: «I innstillinger
 * skal det være mulig å justere de to klokkeslettene for avganger etter 06:00
 * og 15:00.» Én definisjon: hurtigvalgene i Auto-reise/Auto-tavle og
 * innstillingene leser herfra.
 */
import { storage } from './storage.js';

export const FRA_TIDER_KEY = 't.autoFraTider';
export const FRA_STANDARD = ['06:00', '15:00'];
const GYLDIG = /^([01]\d|2[0-3]):[0-5]\d$/;

/** De to tidene som 'HH:MM'; manglende eller ugyldig → standard. */
export function fraTider() {
  let lagret = null;
  try { lagret = JSON.parse(storage.get(FRA_TIDER_KEY) || 'null'); } catch { lagret = null; }
  return FRA_STANDARD.map((s, i) => (Array.isArray(lagret) && GYLDIG.test(lagret[i])) ? lagret[i] : s);
}

/** Sett tid nummer i (0 eller 1). Ugyldig verdi ignoreres. */
export function settFraTid(i, hhmm) {
  if (!GYLDIG.test(hhmm) || (i !== 0 && i !== 1)) return;
  const t = fraTider(); t[i] = hhmm;
  try { storage.set(FRA_TIDER_KEY, JSON.stringify(t)); } catch { /* privat modus */ }
}
