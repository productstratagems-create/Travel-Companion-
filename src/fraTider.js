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
  // En tid satt uten dato (innstillingene) gjelder hver dag igjen (v1.218.140).
  if (!_medDato) settFraDato(i, null);
  // Innstillingsfeltet står allerede tegnet; hold det i takt (v1.218.133).
  const felt = typeof document !== 'undefined' && document.getElementById('pref-fra-' + i);
  if (felt) felt.value = hhmm;
}

/**
 * EN FAST DATO PER PLASS (v1.218.140). Bestilt: «Rullehjulene for klokkeslett
 * må inkludere dato». Satt fra rullehjulene; klokkeslettet følger med inn i
 * innstillingene. [ms|null, ms|null].
 */
export const FRA_DATO_KEY = 't.autoFraDato';
let _medDato = false;
export function fraDatoer() {
  let v = null;
  try { v = JSON.parse(storage.get(FRA_DATO_KEY) || 'null'); } catch { v = null; }
  return [0, 1].map(i => (Array.isArray(v) && Number.isFinite(v[i])) ? v[i] : null);
}
export function settFraDato(i, ms) {
  if (i !== 0 && i !== 1) return;
  const d = fraDatoer(); d[i] = Number.isFinite(ms) ? ms : null;
  try { storage.set(FRA_DATO_KEY, JSON.stringify(d)); } catch { /* privat modus */ }
}
/** Dato og tid fra rullehjulene: datoen lagres, klokkeslettet blir plassens tid. */
export function settFraDatoTid(i, ms) {
  if (!Number.isFinite(ms) || (i !== 0 && i !== 1)) return;
  const d = new Date(ms), p = n => String(n).padStart(2, '0');
  _medDato = true;
  try { settFraTid(i, p(d.getHours()) + ':' + p(d.getMinutes())); } finally { _medDato = false; }
  settFraDato(i, ms);
}
