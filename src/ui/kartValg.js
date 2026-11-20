/**
 * KARTVALGENE HUSKES (v1.218.187). Bestilt: «Innstillinger/valg i kart skal
 * også lagres.» Fokusknappen per kart, og Rutes linjefilter per rute. Det som
 * alt var lagret (transportmidler, skjulte linjer, kartets form) står der det
 * står. Én nøkkel per slags valg, rene les/lagre-funksjoner.
 */
import { storage } from '../storage.js';

export const FOKUS_KEY = 't.kartFokus';
export const RUTE_LINJER_KEY = 't.ruteLinjer';
export const RUTE_LINJER_MAKS = 20;

const les = (key, std) => { try { const v = JSON.parse(storage.get(key) || 'null'); return v && typeof v === 'object' ? v : std; } catch { return std; } };
const skriv = (key, v) => { try { storage.set(key, JSON.stringify(v)); } catch { /* */ } };

/** Fokuset du sist valgte på dette kartet — bare om det finnes i kartets syklus. */
export function lesFokus(kart, liste) {
  const v = les(FOKUS_KEY, {})[kart];
  return (liste || []).includes(v) ? v : 'oversikt';
}
export function lagreFokus(kart, verdi) {
  const alle = les(FOKUS_KEY, {});
  alle[kart] = verdi;
  skriv(FOKUS_KEY, alle);
}

/** Linjefilteret for én rute («fra|til»). Tom mengde = alle, som før. */
export function lesRuteLinjer(rute) {
  const v = les(RUTE_LINJER_KEY, { rekke: [], filter: {} });
  return new Set((v.filter && v.filter[rute]) || []);
}
/** Lagrer; nyeste rute sist, eldste ut over RUTE_LINJER_MAKS. Ren gitt lagret. */
export function lagreRuteLinjer(rute, linjer) {
  const v = les(RUTE_LINJER_KEY, { rekke: [], filter: {} });
  const rekke = (v.rekke || []).filter(r => r !== rute);
  const filter = { ...(v.filter || {}) };
  const liste = [...(linjer || [])];
  if (liste.length) { filter[rute] = liste; rekke.push(rute); } else delete filter[rute];
  while (rekke.length > RUTE_LINJER_MAKS) delete filter[rekke.shift()];
  skriv(RUTE_LINJER_KEY, { rekke, filter });
}
