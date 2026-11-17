import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { gangMinutter, AT_STOP_M } from '../src/geo.js';
import { AT_STOP_M as fraApproach } from '../src/api/approach.js';
import { plattformTekst } from '../src/bytte.js';
import { minAvgang } from '../src/views/auto.js';

const SPD = 83.33, BUF = 2;
describe('ved stoppet, og sporet (v1.218.87)', () => {
  it('rapportert: 35 m er 1 min, ikke 3 — ingen buffer ved stoppet', () => {
    expect(gangMinutter(35, SPD, BUF)).toBe(1);
  });
  it('lenger unna: avstand + buffer, som før', () => {
    expect(gangMinutter(500, SPD, BUF)).toBe(7 + 2);
    expect(gangMinutter(AT_STOP_M + 1, SPD, BUF)).toBe(2 + 2);
  });
  it('én definisjon av «ved stoppet»', () => {
    expect(fraApproach).toBe(AT_STOP_M);
  });
  it('underveis viser sporet i toppraden', () => {
    expect(plattformTekst('2', 'metro')).toMatch(/spor 2/);
    expect(fs.readFileSync('src/views/track.js', 'utf8')).toMatch(/legs\[0\] && legs\[0\]\.quay \? '<span class="tb-dep">' \+ plattformTekst\(/);
  });
  it('gangveien går til den valgte avgangens spor, ikke første du rekker', () => {
    const NÅ = Date.parse('2026-11-17T06:30:00+01:00');
    const valgt = { quay: { publicCode: '2' } }, tidlig = { quay: { publicCode: '1' } };
    const dirs = [{ frontText: 'Kolsås', calls: [{ ms: NÅ + 18 * 60000, call: tidlig }] }];
    expect(minAvgang(null, { call: valgt, hensikt: 'reise' }, dirs, 12, NÅ)).toBe(valgt);
  });
});
