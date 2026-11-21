// v1.218.222: «krevende å forstå hva lappene med linje/rutenummer i kartet betyr».
import { describe, it, expect, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
import { readFileSync } from 'node:fs';
import { valgtLappHtml, stoppLinjerLapp, EDD_DEMPET } from '../src/views/auto.js';
const T = Date.parse('2026-11-21T19:20:00+01:00');
const b = (kode, min, front) => ({ kode, ms: T + min * 60000, front, farge: '#e60000', modus: 'bus' });
describe('lappene i Auto-kartet', () => {
  it('den valgte linja sier hva den er: linje, mot hvor, framme når', () => {
    const h = valgtLappHtml(b('74', 14, 'Jernbanetorget'), { name: 'Lofsrud', at: T + 15 * 60000 });
    expect(h).toMatch(/mot Jernbanetorget/);
    expect(h).toMatch(/framme Lofsrud \d\d:35/);
  });
  it('ved stoppet: linjene herfra og den førstes «gå om»', () => {
    expect(stoppLinjerLapp([b('76', 18, 'Helsfyr'), b('74', 14, 'Jernbanetorget')], 12, T)).toBe('<br><span class="stopp-linjer lapp-lang">74 gå om 2 min · også 76</span>');   // v1.218.230: 74 én gang
    expect(stoppLinjerLapp([], 12, T)).toBe('');
  });
  it('bare den valgte (først) får lapp; de andre dempes', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    // v1.218.226: én valgt også ved samme minutt, og ingen lapp på linjene (stopplappen sier det).
    expect(a).toMatch(/const valgt = bi === valgtIndeks;/);
    expect(a).toMatch(/const valgtIndeks = bein\.findIndex\(b => b\.ms === førsteMs\);/);
    expect(a).toMatch(/export const VALGT_LAPP_PÅ = false;/);
    expect(EDD_DEMPET).toBeLessThan(0.5);
  });
});
import { endeMerkeHtml, endeMerkeSide, endeLapper } from '../src/views/auto.js';
describe('linjemerket ved linjas ende (v1.218.227)', () => {
  const ende = { id: 'E', name: 'Dalsåsen', lat: 59.8, lon: 10.8 };
  it('samme ende: én lapp med begge merkene, uten tid og navn', () => {
    const g = endeLapper([{ kode: '73', farge: '#e60000', modus: 'bus', ms: T, stopp: [ende] }, { kode: '72', farge: '#e60000', modus: 'bus', ms: T, stopp: [ende] }]);
    expect(g).toHaveLength(1);
    const h = endeMerkeHtml(g[0]);
    expect(h).toMatch(/73/); expect(h).toMatch(/72/);
    expect(h).not.toMatch(/Dalsåsen|\d\d:\d\d/);
  });
  it('fritt endepunkt: lapp ved enden; overlapp med en viktigere lapp: ingen lapp (ikke flyttet)', () => {
    expect(endeMerkeSide({ x: 200, y: 200 }, 40, 22, [], 414, 400)).toMatchObject({ side: 'right' });
    const stoppLapp = { venstre: 150, høyre: 300, topp: 150, bunn: 250 };
    expect(endeMerkeSide({ x: 200, y: 200 }, 40, 22, [stoppLapp], 414, 400)).toBe(null);
  });
  it('ved kanten: en annen side', () => {
    expect(endeMerkeSide({ x: 400, y: 200 }, 40, 22, [], 414, 400).side).not.toBe('right');
  });
});

import { plattformLinjer } from '../src/ui/stasjonslag.js';
describe('linjene på plattformen (v1.218.230)', () => {
  it('per stoppested og plattformkode, hver linje én gang', () => {
    const k = (kode, linje, fra) => ({ quay: { publicCode: kode }, serviceJourney: { line: { publicCode: linje } }, ...(fra ? { _fra: { id: fra } } : {}) });
    const m = plattformLinjer([k('B', '73'), k('B', '72'), k('B', '73'), k('A', '74'), k('D', '71', 'NSR:T')], 'NSR:M');
    expect(m.get('NSR:M|B')).toEqual(['73', '72']);
    expect(m.get('NSR:M|A')).toEqual(['74']);
    expect(m.get('NSR:T|D')).toEqual(['71']);
  });
});
