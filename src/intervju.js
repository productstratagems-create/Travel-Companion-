/**
 * INTERVJUET (v1.218.100). Bestilt: «bruk informasjonen om reiser som lagres
 * i innstillinger til å "intervjue" bruker ved ujevne mellomrom for å få
 * bekreftet eller avkreftet reisevaner.»
 *
 * To ting manglet i spørsmålskortet som fantes (`profil.nesteSpørsmål`):
 *
 *   HVA    Det spurte om hjem, jobb og reisetyper, aldri om reisene som står
 *          i innstillinger («Mortensrud → Jernbanetorget rundt 18–20, 2×»).
 *          `målSpørsmål` lager ett spørsmål per slik vane du ikke har svart på.
 *          Svaret lagres i nesteSvar — samme sted som «stemmer/nei» på «din
 *          vanlige reise», så «det du har sagt» er ett faktum, ikke to.
 *   NÅR    Det sto der hver gang du sto stille. Nå: etter et svar eller
 *          «senere» kommer neste tidligst etter et tilfeldig tidsrom mellom
 *          INTERVJU_MIN_T og INTERVJU_MAKS_T. Ujevnt med vilje — et spørsmål
 *          hver morgen kl. 8 blir støy man lærer å overse.
 */
import { storage } from './storage.js';
import { erHelgLik } from './dagtype.js';
import { nesteSvarFor } from './api/nesteSvar.js';

const KEY = 't.intervju';
export const INTERVJU_MIN_T = 6;
export const INTERVJU_MAKS_T = 48;
/** Så mange reiser i samme tidsrom før vi spør om vanen. */
export const INTERVJU_MIN_TURER = 2;

function les() { try { const v = JSON.parse(storage.get(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } }

/** Er det tid for et spørsmål nå? Første gang: ja. */
export function intervjuKlart(nå) {
  const n = les().neste;
  return !Number.isFinite(n) || nå >= n;
}

/** Et svar eller «senere»: neste spørsmål om 6–48 timer, tilfeldig. */
export function intervjuUtsett(nå, tilfeldig = Math.random) {
  const t = INTERVJU_MIN_T + tilfeldig() * (INTERVJU_MAKS_T - INTERVJU_MIN_T);
  try { storage.set(KEY, JSON.stringify({ neste: nå + Math.round(t * 3600_000) })); } catch { /* */ }
}

const _dag = h => (h ? 'i helgene' : 'på hverdager');
const _tid = b => 'rundt ' + String(b * 2).padStart(2, '0') + '–' + String(b * 2 + 2).padStart(2, '0');

/**
 * Spørsmål om reisene i historikken (`loadSmartHist`) du ikke har svart på.
 * Tidsrommet du er i først, så de med flest reiser. Ren gitt `svar`.
 *
 * @param {Array} hist  smartHist-radene
 * @param {number} nå
 * @param {(h)=>number} svar  nesteSvarFor
 */
export function målSpørsmål(hist, nå, svar = nesteSvarFor) {
  const bøtte = Math.floor(new Date(nå).getHours() / 2), helg = erHelgLik(nå);
  return (hist || [])
    .filter(e => e && e.toName && (e.count || 0) >= INTERVJU_MIN_TURER)
    .map(e => ({ toName: e.toName, fromName: e.fromName || null, helg: !!e.isWeekend, bucket: e.bucket, count: e.count }))
    .filter(h => !svar(h))
    .sort((a, b) => ((b.helg === helg && b.bucket === bøtte) - (a.helg === helg && a.bucket === bøtte)) || b.count - a.count)
    .map(h => ({
      nøkkel: 'mål|' + h.toName.toLowerCase() + '|' + (h.helg ? 'helg' : 'hverdag') + '|' + h.bucket,
      art: 'mål', h,
      tekst: 'Reiser du ofte ' + (h.fromName ? 'fra ' + h.fromName + ' ' : '') + 'til ' + h.toName + ' '
        + _dag(h.helg) + ' ' + _tid(h.bucket) + '?',
      grunn: h.count + ' reiser registrert',
    }));
}
