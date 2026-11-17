/**
 * Veien en tur kjører, når svaret ikke hadde den (v1.218.99).
 *
 * ÉN DEFINISJON for tre kart. Auto-reise fikk det i v1.218.98; underveis og
 * tavla tegnet fortsatt rette streker mellom stoppene når etappen manglet
 * `pointsOnLink`. Alle tre spør nå her:
 *
 *   kjent form   → delen mellom `fra` og `til` (`formMellom`), eller null
 *                  når stoppene ikke ligger på den
 *   ukjent form  → null nå, og `fetchJourneyShape`. Bare et TREFF kaller
 *                  `påTreff`, så et bom aldri gir en tegneløkke.
 *
 * @param {string|null} jid turens id
 * @param {{lat,lon}} fra
 * @param {{lat,lon}} til
 * @param {() => void} påTreff tegn kartet på nytt
 * @returns {Array<[number,number]>|null}
 */
import { journeyShapeCached, fetchJourneyShape } from '../api/entur.js';
import { formMellom } from './path.js';

export function turForm(jid, fra, til, påTreff) {
  if (!jid || !fra || !til) return null;
  const kjent = journeyShapeCached(jid);
  if (kjent !== undefined) return kjent ? formMellom(kjent, fra, til) : null;
  fetchJourneyShape(jid)
    .then(pts => { if (pts && pts.length >= 2 && påTreff) påTreff(); })
    .catch(() => {});
  return null;
}
