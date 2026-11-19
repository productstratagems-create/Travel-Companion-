// v1.218.135: gangtidslappen står halvveis på gangruta.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { halvveis } from '../src/views/auto.js';

describe('halvveis', () => {
  it('rett linje: midtpunktet', () => {
    expect(halvveis([[0, 0], [0, 2]])).toEqual([0, 1]);
  });
  it('en svingete rute: halvveis langs ruta, ikke mellom endene', () => {
    // 0,0 → 0,3 → 1,3: lengde 4, halvveis er 0,2 — ikke midt mellom endene (0.5, 1.5)
    const m = halvveis([[0, 0], [0, 3], [1, 3]]);
    expect(m[0]).toBeCloseTo(0); expect(m[1]).toBeCloseTo(2);
  });
  it('tåler objekter og tomt', () => {
    expect(halvveis([{ lat: 0, lon: 0 }, { lat: 0, lon: 4 }])).toEqual([0, 2]);
    expect(halvveis([])).toBe(null);
  });
  it('kartet forankrer stoppets lapp der når gangruta finnes', () => {
    const s = readFileSync('src/views/auto.js', 'utf8');
    expect(s).toMatch(/const midt = sentrert && walkPts && walkPts\.length >= 2 \? halvveis\(walkPts\) : null;/);
    expect(s).toMatch(/direction: 'center', offset: \[dx, dy\]/);
  });
});
