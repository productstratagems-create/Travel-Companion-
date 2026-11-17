/**
 * Tavlas valg av transportmidler — ett navn for ett faktum.
 *
 * Før v1.218.94 lå valget i board.js og ble bare brukt på avgangslista fra
 * stoppet. Reisesøket spurte alltid om alle transportmidler, så med tolv
 * svar Mortensrud → Helsfyr ble alle T-bane, og bussen fantes ikke å velge.
 * Nå leser både avgangslista og reisesøket herfra.
 */
import { storage } from './storage.js';
import { BOARD_MODES } from './api/queries.js';

export const MODES_KEY = 't.modes';
export const DEFAULT_MODES = { metro: true, tram: true, bus: true, rail: true, water: true, sykkel: false };

export function loadModes() {
  try { const v = storage.get(MODES_KEY); return v ? { ...DEFAULT_MODES, ...JSON.parse(v) } : { ...DEFAULT_MODES }; }
  catch { return { ...DEFAULT_MODES }; }
}
export function saveModes(m) { storage.set(MODES_KEY, JSON.stringify(m)); }

/** Transportmidlene reisesøket og avgangslista skal spørre om. */
export function tavlaModuser() {
  const on = loadModes();
  return BOARD_MODES.filter(m => on[m]);
}
