// v1.218.253: «alle funksjoner må skalere godt innenfor Enturs API geografisk
// dekningsområde.» Fiksturer: en bygd med to avganger i døgnet, et knutepunkt.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
import { båndFor, nærViktigFørst, sammenlignViktighet, infoFraSvar, iBiter, STOPP_BIT, VIKTIG_GANG_M } from '../src/api/stops.js';
import { SØK_TRINN_KM } from '../src/geo.js';
import { readFileSync } from 'node:fs';
const I = (nå, døgn) => ({ moduser: ['bus'], avgangerNå: nå, avgangerDøgn: døgn, linjer: 1, plattformer: 1 });
describe('bygda: få avganger, langt mellom stoppene', () => {
  it('stoppsøket leter utover når ingenting er innen 850 m', () => {
    expect(SØK_TRINN_KM).toEqual([0.85, 2, 5]);
    expect(readFileSync('src/geo.js', 'utf8')).toMatch(/if \(!stops\.length && trinn \+ 1 < SØK_TRINN_KM\.length\)/);
  });
  it('båndet følger nærmeste stopp: tilbudet teller også på 1,8 km', () => {
    expect(båndFor(150)).toBe(VIKTIG_GANG_M);
    expect(båndFor(1800)).toBe(2700);
    // Før-bildet: to stopp på 1,8 og 2,2 km — avstanden avgjorde; nå tilbudet.
    const info = { A: I(0, 2), B: I(0, 14) };
    const s = [{ id: 'A', distM: 1800 }, { id: 'B', distM: 2200 }];
    expect([...s].sort(nærViktigFørst(x => info[x.id]))[0].id).toBe('A');
    expect([...s].sort(nærViktigFørst(x => info[x.id], undefined, båndFor(1800)))[0].id).toBe('B');
  });
  it('neste time er 0 for begge: døgnet avgjør', () => {
    expect(sammenlignViktighet(I(0, 14), I(0, 2))).toBeLessThan(0);
  });
  it('tellingen: neste time og døgnet fra samme svar', () => {
    const t = m => new Date(Date.now() + m * 60000).toISOString();
    const m = infoFraSvar({ data: { stopPlaces: [{ id: 'X', quays: [], estimatedCalls: [{ expectedDepartureTime: t(20) }, { expectedDepartureTime: t(300) }] }] } });
    expect(m.get('X')).toMatchObject({ avgangerNå: 1, avgangerDøgn: 2 });
  });
});
describe('knutepunktet: spørringen deles', () => {
  it('100 stopp blir 5 spørringer à 20', () => {
    expect(iBiter(Array.from({ length: 100 }, (_, i) => i), STOPP_BIT).map(b => b.length)).toEqual([20, 20, 20, 20, 20]);
  });
});
import { sentrumFor } from '../src/api/centre.js';
describe('«mot sentrum» i flere byer (v1.218.254)', () => {
  it('Tromsø, Bodø og Kristiansand har sentrum; en bygd langt fra alle har ikke', () => {
    expect(sentrumFor({ lat: 69.68, lon: 18.93 }).by).toBe('Tromsø');
    expect(sentrumFor({ lat: 67.28, lon: 14.38 }).by).toBe('Bodø');
    expect(sentrumFor({ lat: 58.16, lon: 8.0 }).by).toBe('Kristiansand');
    expect(sentrumFor({ lat: 61.6, lon: 9.0 })).toBe(null);   // Valdres/Gudbrandsdalen
  });
  it('de store byene som før; liten by vinner ikke over stor by i nærheten', () => {
    expect(sentrumFor({ lat: 59.92, lon: 10.75 }).by).toBe('Oslo');
    expect(sentrumFor({ lat: 60.39, lon: 5.33 }).by).toBe('Bergen');
    expect(sentrumFor({ lat: 59.745, lon: 10.21 }).by).toBe('Drammen');
  });
});
