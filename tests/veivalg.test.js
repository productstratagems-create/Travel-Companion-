// v1.218.204: veivalget — én felles stamme til der rutene skilles.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { felles, MØTES_M } from '../src/veivalg.js';

const N = 59.83, Ø = 10.80, DL = 1 / 111320, DO = 1 / (111320 * Math.cos(N * Math.PI / 180));
const p = (nord, øst) => [N + nord * DL, Ø + øst * DO];

describe('felles', () => {
  // Skjermbildet: to veier fra døra (nord og sør rundt et kvartal) som møtes i krysset (100 Ø),
  // så går A videre øst til hovedstoppet og B sørøst til alternativet.
  const A = [p(0, 0), p(20, 30), p(20, 70), p(0, 100), p(0, 200)];
  const B = [p(0, 0), p(-20, 30), p(-20, 70), p(0, 100), p(-100, 150)];
  it('før-bildet: to stier fra adressen — nå én stamme til krysset og to grener derfra', () => {
    const g = felles(A, B);
    expect(g).not.toBe(null);
    expect(g.veivalg).toEqual(p(0, 100));
    expect(g.a[0]).toEqual(p(0, 100)); expect(g.a.at(-1)).toEqual(p(0, 200));
    expect(g.b[0]).toEqual(p(0, 100)); expect(g.b.at(-1)).toEqual(p(-100, 150));
    expect(g.stamme[0]).toEqual(p(0, 0)); expect(g.stamme.at(-1)).toEqual(p(0, 100));
  });
  it('siste møte, ikke første: et felles strekk er ikke to valg', () => {
    const A2 = [p(0, 0), p(0, 50), p(0, 100), p(0, 200)], B2 = [p(0, 0), p(0, 50), p(0, 100), p(-100, 150)];
    expect(felles(A2, B2).veivalg).toEqual(p(0, 100));
  });
  it('skilles ved døra, eller møtes aldri: ingen gaffel (tegnes som før)', () => {
    expect(felles([p(0, 0), p(0, 200)], [p(0, 0), p(-200, 0)])).toBe(null);
    expect(felles([p(0, 0), p(0, 200)], [p(500, 0), p(500, 200)])).toBe(null);
  });
  it('samme mål: ingen gaffel', () => {
    expect(felles(A, [...A])).toBe(null);
  });
  it('koblingen: Auto-kartet tegner stamme, grener og «veivalg»', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect(a).toMatch(/const _gaffel = walkPts && walkPts\.length && _altR \? felles\(walkPts, _altR\) : null;/);
    expect(a).toMatch(/bindTooltip\('veivalg'/);
    expect(MØTES_M).toBe(12);
  });
});
