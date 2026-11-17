/**
 * ANTATT AVSTIGNING, TIL DU HAR SVART (v1.218.103).
 *
 * Bestilt: «Spør gjerne, som del av intervjuene av bruker, om vedkommende
 * har stått av i de tilfeller der det ser slik ut, før du konkluderer med at
 * bruker faktisk har stått av.»
 *
 * GPS-en ser ut til å si at du gikk av (api/avstigning.js). Det er en
 * antagelse, ikke en reise: den lagres her og spørres om i intervjuet
 * (src/intervju.js). Bare «ja» endrer vanene:
 *   art 'ny'    en tur tur-låsen i auto-reise fulgte → registrerReise
 *   art 'flytt' en startet reise, av et annet sted enn målet → flyttReise
 * «Nei» forkaster den. Ubesvart i AVSTIGNING_VENT_DØGN døgn: forkastet, ingenting
 * lært — å tie er ikke å si ja.
 */
import { storage } from '../storage.js';
import { registrerReise, flyttReise } from './smart.js';
import { MEMORY_DAYS } from './eventLog.js';

const KEY = 't.avstigningVent';
export const AVSTIGNING_VENT_DØGN = MEMORY_DAYS;
const MAKS = 20;

function les() { try { const v = JSON.parse(storage.get(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function skriv(v) { try { storage.set(KEY, JSON.stringify(v)); } catch { /* */ } }

/** Ventende antagelser, de for gamle strøket (også fra lageret). */
export function venterAvstigning(nå) {
  const alle = les();
  const igjen = alle.filter(o => o && nå - o.at <= AVSTIGNING_VENT_DØGN * 86_400_000);
  if (igjen.length !== alle.length) skriv(igjen);
  return igjen;
}

export function antaAvstigning(o) {
  if (!o || !o.fra || !o.til || !Number.isFinite(o.at)) return null;
  const id = o.art + '|' + o.fra + '|' + o.til + '|' + o.at;
  const alle = les().filter(x => x.id !== id);
  alle.push({ ...o, id });
  skriv(alle.slice(-MAKS));
  return id;
}

/** Svaret ditt. ja: læres som reise; nei: forkastes. */
export function svarAvstigning(id, ja) {
  const alle = les();
  const o = alle.find(x => x.id === id);
  skriv(alle.filter(x => x.id !== id));
  if (!o || !ja) return false;
  if (o.art === 'flytt') {
    return flyttReise({ fra: o.fra, fraStopId: o.fraStopId, planlagt: o.planlagt, faktisk: o.til,
      tilStopId: o.tilStopId, tilLat: o.tilLat, tilLon: o.tilLon, boardedAt: o.påMs, linje: o.linje }, null);
  }
  registrerReise({ fra: o.fra, til: o.til, tilStopId: o.tilStopId, fraStopId: o.fraStopId,
    tilLat: o.tilLat, tilLon: o.tilLon, linje: o.linje, når: o.påMs }, null);
  return true;
}
