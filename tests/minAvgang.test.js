import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { minAvgang } from '../src/views/auto.js';

const NÅ = Date.parse('2026-11-16T19:23:00+01:00');
const kall = (min, spor) => ({ quay: { publicCode: spor }, expectedDepartureTime: new Date(NÅ + min * 60000).toISOString() });
const retning = (front, avganger) => ({ frontText: front, call: avganger[0].call, nextMs: avganger[0].ms, calls: avganger });
const av = (min, spor) => ({ ms: NÅ + min * 60000, call: kall(min, spor) });

describe('avgangen din på kartet (v1.218.73)', () => {
  // Rapportert 19:23 på Mortensrud, 12 min gange: kartet viste ingen plattform.
  // Lista: 3 mot Kolsås 10 min (strøket) · 19:48 spor 1, 3 mot Stortinget 1 min (strøket) · 19:39 spor 2.
  const dirs = [retning('Kolsås', [av(10, '1'), av(25, '1')]), retning('Stortinget', [av(1, '2'), av(16, '2')])];
  it('uten åpen retning eller kort: den første avgangen du rekker', () => {
    const c = minAvgang(null, null, dirs, 12, NÅ);
    expect(c.quay.publicCode).toBe('2');
    expect(Date.parse(c.expectedDepartureTime)).toBe(NÅ + 16 * 60000);
  });
  it('en åpen retning vinner, så kortet', () => {
    expect(minAvgang({ call: kall(5, 'X') }, { call: kall(6, 'Y') }, dirs, 12, NÅ).quay.publicCode).toBe('X');
    expect(minAvgang(null, { call: kall(6, 'Y') }, dirs, 12, NÅ).quay.publicCode).toBe('Y');
  });
  it('ingenting å rekke: ingenting', () => {
    expect(minAvgang(null, null, [], 12, NÅ)).toBeNull();
  });
  it('kartet, gangruta og plattformvisningen bruker samme regel', () => {
    const s = fs.readFileSync('src/views/auto.js', 'utf8');
    expect(s).toMatch(/uthevAvgang\(_aMap, _minAvgang\(\)/);
    expect(s).toMatch(/aktivFraAvgang\(_minAvgang\(\), _stop\.id\)/);
  });
});
