// v1.218.119: «kun t-baner og ingen busser» ved Tveita — nabostopp i knutepunktet.
import { describe, it, expect } from 'vitest';
import { knutepunkt, slåSammenKall, KNUTEPUNKT_M } from '../src/views/auto.js';

const TVEITA = { id: 'NSR:StopPlace:T', name: 'Tveita', lat: 59.9145, lon: 10.8410, modes: ['metro'] };
const TVEITA_T = { id: 'NSR:StopPlace:B', name: 'Tveita T', lat: 59.9150, lon: 10.8415, modes: ['bus'] };   // ~65 m
const LANGT = { id: 'NSR:StopPlace:L', name: 'Langt unna', lat: 59.9180, lon: 10.8410, modes: ['bus'] };     // ~390 m

describe('knutepunktet', () => {
  it('T-banestasjonen og bussholdeplassen ved siden av er ett knutepunkt', () => {
    expect(KNUTEPUNKT_M).toBe(250);
    expect(knutepunkt(TVEITA, [TVEITA, TVEITA_T, LANGT]).map(s => s.name)).toEqual(['Tveita', 'Tveita T']);
  });
  it('et stopp 400 m unna er ikke med', () => {
    expect(knutepunkt(TVEITA, [LANGT]).map(s => s.name)).toEqual(['Tveita']);
  });
});

describe('sammenslåingen', () => {
  const k = (id, min) => ({ serviceJourney: { id }, expectedDepartureTime: new Date(Date.UTC(2026, 10, 18, 8, min)).toISOString() });
  it('samme tur fra to stopp er én avgang, og nabostoppet merkes', () => {
    const ut = slåSammenKall([{ stopp: null, kall: [k('a', 1), k('b', 5)] }, { stopp: TVEITA_T, kall: [k('b', 5), k('c', 3)] }]);
    expect(ut.map(c => c.serviceJourney.id)).toEqual(['a', 'c', 'b']);
    expect(ut.find(c => c.serviceJourney.id === 'c')._fra.name).toBe('Tveita T');
    expect(ut.find(c => c.serviceJourney.id === 'a')._fra).toBe(undefined);
  });
});

import { quayLabel } from '../src/views/auto.js';
import { tavleRadHtml } from '../src/ui/tavleRad.js';
describe('raden sier hvor (v1.218.119)', () => {
  it('nabostoppets navn foran sporet, og «fra …» i Auto-tavle', () => {
    const call = { quay: { publicCode: 'B' }, serviceJourney: { line: { transportMode: 'bus' } }, _fra: { name: 'Tveita T' } };
    expect(quayLabel(call)).toMatch(/ · Tveita T$/);   // v1.218.122: sporet først
    const h = tavleRadHtml({ d: { frontText: 'Bryn', lines: [{ code: '25', mode: 'bus' }] }, ms: Date.now() + 5 * 60_000, call, rekker: true }, Date.now(), 0);
    expect(h).toMatch(/fra <b>Tveita T<\/b>/);
  });
});

import { stopsAhead } from '../src/views/auto.js';
describe('stoppene videre fra et nabostopp (v1.218.119)', () => {
  it('leter fra stedet kallet kom fra, ikke stoppet du står ved', () => {
    const t = Date.now();
    const call = { _fra: { id: 'B', name: 'Tveita T' }, serviceJourney: { estimatedCalls: [
      { quay: { stopPlace: { id: 'B', name: 'Tveita T', latitude: 59.9, longitude: 10.8 } }, expectedArrivalTime: new Date(t + 60_000).toISOString() },
      { quay: { stopPlace: { id: 'C', name: 'Bryn', latitude: 59.91, longitude: 10.81 } }, expectedArrivalTime: new Date(t + 300_000).toISOString() }] } };
    expect(stopsAhead(call, 'Tveita', t, 'T').map(s => s.name)).toEqual(['Bryn']);
  });
});
