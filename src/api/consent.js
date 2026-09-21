import { storage } from '../storage.js';

/**
 * Samtykket til at appen husker.
 *
 * Its own leaf module, importing only storage, for the same reason
 * `api/usage.js` is one: two readers of a key in two files is how this
 * codebase's recurring bug starts, and this is the one key where the failure
 * mode is «the app remembered something it was told not to».
 *
 * OFF BY DEFAULT, and the default is the whole point. A missing value, a
 * corrupt value, a value written by an older build — all of them mean no.
 * Only an explicit `'1'` is yes.
 */

const CONSENT_KEY = 't.memoryConsent';

/** @returns {boolean} */
export function loadConsent() {
  try { return storage.get(CONSENT_KEY) === '1'; } catch { return false; }
}

export function saveConsent(on) {
  try { storage.set(CONSENT_KEY, on ? '1' : '0'); } catch { /* quota */ }
}
