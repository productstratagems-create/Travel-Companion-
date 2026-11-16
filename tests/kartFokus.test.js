import { describe, it, expect } from 'vitest';
import { nesteFokus, fokusRamme, KART_FOKUS } from '../src/views/auto.js';

const du = { lat: 59.856, lon: 10.82 }, stopp = { lat: 59.8493, lon: 10.8297 };
const gang = [[59.8555, 10.8205], [59.852, 10.825], [59.8494, 10.8296]];
const pl2 = { kode: '2', lat: 59.8495, lon: 10.8299 }, pl1 = { kode: '1', lat: 59.8491, lon: 10.8294 };
const inngang = { lat: 59.8497, lon: 10.8292 };

describe('kartknappen sykler oversikt → vei → spor (v1.218.71)', () => {
  it('trappa går rundt', () => {
    expect(KART_FOKUS).toEqual(['oversikt', 'vei', 'spor']);
    expect(nesteFokus('oversikt')).toBe('vei');
    expect(nesteFokus('vei')).toBe('spor');
    expect(nesteFokus('spor')).toBe('oversikt');
  });
  it('vei: deg, gangruta og stoppet', () => {
    const r = fokusRamme('vei', { du, stopp, gang, inngang });
    expect(r.pts).toContainEqual([du.lat, du.lon]);
    expect(r.pts).toContainEqual([stopp.lat, stopp.lon]);
    expect(r.pts).toContainEqual(gang[1]);
    expect(r.maksZoom).toBe(17);
  });
  it('vei uten posisjon: stoppet', () => {
    expect(fokusRamme('vei', { stopp })).toEqual({ pts: [[stopp.lat, stopp.lon]], maksZoom: 16 });
  });
  it('spor: din plattform og inngangen, ikke de andre', () => {
    const r = fokusRamme('spor', { stopp, plattform: pl2, plattformer: [pl1, pl2], inngang });
    expect(r.pts).toEqual([[pl2.lat, pl2.lon], [inngang.lat, inngang.lon]]);
    expect(r.maksZoom).toBe(18);
  });
  it('spor uten kjent plattform: alle plattformene; uten plattformer: stoppet', () => {
    expect(fokusRamme('spor', { stopp, plattformer: [pl1, pl2] }).pts).toHaveLength(2);
    expect(fokusRamme('spor', { stopp, plattformer: [] })).toEqual({ pts: [[stopp.lat, stopp.lon]], maksZoom: 17, ukjent: true });
  });
  it('oversikt: den automatiske rammen tar over', () => {
    expect(fokusRamme('oversikt', { du, stopp })).toBeNull();
  });
});

import fs from 'node:fs';
describe('stoppets plattformer uten en avgang å utheve (v1.218.71)', () => {
  it('uthevAvgang viser stoppet selv uten kode', () => {
    expect(fs.readFileSync('src/ui/stasjonslag.js', 'utf8')).toMatch(/const vis = aktiv \|\| \(stopId \?/);
  });
});
