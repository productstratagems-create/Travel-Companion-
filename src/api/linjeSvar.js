/**
 * LINJESVAR (v1.218.19) — det du har SAGT om hvilken linje du var på.
 *
 * Bestilt: «I auto-reise modus la bruker få bekrefte eller avkrefte om din
 * hypotese om hvilken rute denne er på stemmer. Lær av det bruker bekrefter.»
 *
 * Nivå 1 i tre-nivå-regelen (docs/produktretning.md): det du har sagt, som
 * rute og favoritter — til du sletter, uten samtykkebryter. Ingen koordinater
 * og intet klokkeslett utover en tre-timersblokk. Vises i innstillinger.
 *
 *   kontekst   holdeplassen kandidatene kom fra · hverdag/helg · 3-timersblokk
 *   ja         +1 (bekreftet, eller valgt i «feil linje?»)
 *   nei        −1 (den du rettet bort fra, eller alle ved «ingen av disse»)
 */
import { storage } from '../storage.js';

const KEY = 't.linjeSvar';
/** Høyst så mange kontekster; den som er rørt sist, blir. */
export const MAKS_KONTEKSTER = 200;
/** Vekten bor i ombord.js (bladmodulen); her for den som leser svarene. */
export { SVAR_VEKT } from './ombord.js';

function les() {
  try { const v = JSON.parse(storage.get(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function skriv(v) { try { storage.set(KEY, JSON.stringify(v)); } catch { /* fullt lager: glemmes */ } }

export function kontekst(stoppId, nåMs) {
  if (!stoppId || !Number.isFinite(nåMs)) return null;
  const d = new Date(nåMs);
  const helg = d.getDay() === 0 || d.getDay() === 6;
  return stoppId + '|' + (helg ? 'helg' : 'hverdag') + '|' + Math.floor(d.getHours() / 3) * 3;
}

export function lærSvar(kx, { ja = [], nei = [], navn = null } = {}) {
  if (!kx) return;
  const alle = les();
  const rad = alle[kx] || { n: {}, t: 0 };
  ja.filter(Boolean).forEach(l => { rad.n[l] = (rad.n[l] || 0) + 1; });
  nei.filter(Boolean).forEach(l => { rad.n[l] = (rad.n[l] || 0) - 1; });
  rad.t = Date.now();
  // Navnet, så oversikten i innstillinger sier «Mortensrud», ikke en id.
  if (navn) rad.navn = navn;
  alle[kx] = rad;
  const nøkler = Object.keys(alle);
  if (nøkler.length > MAKS_KONTEKSTER) {
    nøkler.sort((a, b) => (alle[a].t || 0) - (alle[b].t || 0))
      .slice(0, nøkler.length - MAKS_KONTEKSTER).forEach(k => delete alle[k]);
  }
  skriv(alle);
}

/** Map(linje → sum) for konteksten. Tom når du ikke har sagt noe der. */
export function svarFor(kx) {
  const rad = kx && les()[kx];
  return new Map(rad ? Object.entries(rad.n) : []);
}

/** Til innstillinger: alt som er lagret, rett fram. */
export function linjeSvarOversikt() {
  return Object.entries(les()).map(([kx, r]) => {
    const [stopp, dag, blokk] = kx.split('|');
    return { stopp, navn: r.navn || stopp, dag, blokk: Number(blokk), linjer: r.n, sist: r.t };
  }).sort((a, b) => b.sist - a.sist);
}

export function glemLinjeSvar() { try { storage.set(KEY, ''); } catch { /* */ } }
