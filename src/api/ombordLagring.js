/**
 * LÅSEN OVERLEVER EN OMLASTING (v1.218.25).
 *
 * Turopptaket 2026-11-10: låsen holdt på linje 3 («valgt» av deg) fra
 * Mortensrud til Bøler. Så ble appen lastet på nytt — telefonen la den i
 * bakgrunnen, eller fanen ble lastet om — og låsen, som bare lå i minnet, var
 * borte. Appen falt til nærmeste stopp: Olav Nygards veg, en bussholdeplass.
 *
 * Lagres: turen (kallet, med stoppene og tidene) og kilden. Ikke posisjonen
 * din. Hentes bare så lenge turen har stopp igjen; ellers slettes den.
 */
import { storage } from '../storage.js';

const KEY = 't.ombordLås';
const _tid = c => {
  const v = c && (c.expectedArrivalTime || c.aimedArrivalTime || c.expectedDepartureTime || c.aimedDepartureTime);
  return v ? new Date(v).getTime() : NaN;
};

export function lagreLås(lås, nå) {
  try {
    if (!lås || !lås.k || !lås.k.call) { storage.remove(KEY); return; }
    storage.set(KEY, JSON.stringify({ kilde: lås.kilde || 'sikker', call: lås.k.call, lagret: nå }));
  } catch { /* fullt lager: låsen lever i minnet som før */ }
}

/** @returns {{kilde:string, call:object}|null} */
export function hentLås(nå) {
  try {
    const v = JSON.parse(storage.get(KEY) || 'null');
    const kall = v && v.call && v.call.serviceJourney && v.call.serviceJourney.estimatedCalls;
    if (!Array.isArray(kall) || !kall.some(c => _tid(c) > nå)) { storage.remove(KEY); return null; }
    return { kilde: v.kilde, call: v.call };
  } catch { return null; }
}
