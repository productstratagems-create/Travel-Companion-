// v1.218.189: husket fokus etter omstart rammet inn før kartet hadde data, og låste kartet.
import { describe, it, expect, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
import { readFileSync } from 'node:fs';
import { fokusSignatur } from '../src/views/auto.js';

describe('fokusSignatur', () => {
  it('endres når fokusets data kommer: deg, gangen, plattformen', () => {
    const tom = fokusSignatur('vei', {});
    const medDeg = fokusSignatur('vei', { du: {} });
    const medGang = fokusSignatur('vei', { du: {}, gang: [[1, 1]] });
    expect(new Set([tom, medDeg, medGang]).size).toBe(3);
    expect(fokusSignatur('spor', { plattform: {} })).not.toBe(fokusSignatur('spor', {}));
  });
  it('oversikt: uendret av data', () => {
    expect(fokusSignatur('oversikt', { du: {} })).toBe(fokusSignatur('oversikt', {}));
  });
});

describe('koblingen', () => {
  const s = readFileSync('src/views/auto.js', 'utf8');
  it('før-bildet: _brukFokus satte _aUserMoved = true og låste kartet; nå går fokuset gjennom rammen', () => {
    const i = s.indexOf('function _brukFokus()');
    const kropp = s.slice(i, s.indexOf('\n}', i));
    expect(kropp).not.toMatch(/_aUserMoved = true/);
    expect(s).toMatch(/fokus: fokusSignatur\(_kartFokus, _fokusData\(\)\)/);
    expect(s).toMatch(/if \(_fr && fitStale\) \{ _aFitKey = rKey; _rammFokus\(_fr\); \}/);
  });
});
