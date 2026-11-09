/**
 * NESTESVAR (v1.218.22) — det du har SAGT om appens hypotese for neste reise.
 * Samme nivå og form som linjesvar (api/linjeSvar.js): nivå 1, «det du har
 * sagt», til du sletter; vises i innstillinger. Kontekst: mål · hverdag/helg ·
 * to-timersbøtta hypotesen gjaldt. «stemmer» +1, «nei» −1.
 */
import { storage } from '../storage.js';

const KEY = 't.nesteSvar';
export const MAKS_NESTE = 200;

function les() { try { const v = JSON.parse(storage.get(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } }
function skriv(v) { try { storage.set(KEY, JSON.stringify(v)); } catch { /* */ } }
const nøkkel = h => h && h.toName ? String(h.toName).toLowerCase() + '|' + (h.helg ? 'helg' : 'hverdag') + '|' + h.bucket : null;

export function nesteSvarFor(h) { const k = nøkkel(h); const r = k && les()[k]; return r ? r.n : 0; }

export function lærNesteSvar(h, tegn) {
  const k = nøkkel(h);
  if (!k || !tegn) return;
  const alle = les();
  const r = alle[k] || { toName: h.toName, helg: !!h.helg, bucket: h.bucket, n: 0, t: 0 };
  r.n += tegn > 0 ? 1 : -1;
  r.t = Date.now();
  alle[k] = r;
  const nøkler = Object.keys(alle);
  if (nøkler.length > MAKS_NESTE) nøkler.sort((a, b) => alle[a].t - alle[b].t).slice(0, nøkler.length - MAKS_NESTE).forEach(x => delete alle[x]);
  skriv(alle);
}

export function nesteSvarOversikt() { return Object.values(les()).sort((a, b) => b.t - a.t); }
export function glemNesteSvar() { try { storage.set(KEY, ''); } catch { /* */ } }
