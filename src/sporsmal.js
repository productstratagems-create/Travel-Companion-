/**
 * ÉN SPØRSMÅLSPLASS (v1.218.257, onboarding steg 2). Planen: profilspørsmål,
 * «neste reise», avstigning og dine faste stopp i ÉN kø — høyst ett spørsmål
 * om dagen, aldri i fart, og aldri før appen har sett noen reiser (bortsett
 * fra de faste stoppene, som er onboarding og tilbys etter første tavle).
 * Før spurte fire steder hver for seg, og en ny bruker kunne få flere samme
 * dag. Rene funksjoner.
 */
import { storage } from './storage.js';

/** Rekkefølgen når flere er klare: onboarding, så det ferskeste, så profilen. */
/** «hjemover» (v1.218.258) rett etter de faste stoppene — begge er onboarding. */
export const SPØRSMÅL_REKKEFØLGE = ['faste', 'hjemover', 'avstigning', 'neste', 'profil'];
/** Kan spørres før appen har sett reiser: onboarding, ikke vaner. */
export const UTEN_REISER = new Set(['faste', 'hjemover']);
export const SPURT_DAG_KEY = 't.spurtDag';

/** Lokal dato «2026-11-24». */
export function dagNøkkel(nå) {
  const d = new Date(nå);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * Hvilket spørsmål — ett eller ingen.
 * @param klare    Set av kilder som har et spørsmål nå
 * @param o.iFart  i fart eller om bord: ingen
 * @param o.harReiser  appen har sett reiser (ellers bare 'faste')
 * @param o.besvartIDag  et spørsmål er alt besvart i dag: ingen nye …
 * @param o.pågår  … men det som står (ikke besvart ennå), får stå
 */
export function velgSpørsmål(klare, { iFart = false, harReiser = false, besvartIDag = false, pågår = null } = {}) {
  if (iFart || !klare) return null;
  if (pågår && klare.has(pågår)) return pågår;
  if (besvartIDag) return null;
  return SPØRSMÅL_REKKEFØLGE.find(k => klare.has(k) && (UTEN_REISER.has(k) || harReiser)) || null;
}

export function besvartIDag(nå) {
  try { return storage.get(SPURT_DAG_KEY) === dagNøkkel(nå); } catch { return false; }
}
/** Et svar — ja, nei, senere, ikke nå, ferdig — teller som dagens spørsmål. */
export function merkBesvart(nå) {
  try { storage.set(SPURT_DAG_KEY, dagNøkkel(nå)); } catch { /* */ }
}
