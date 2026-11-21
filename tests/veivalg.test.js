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
    // Med tette punkter: innen noen få meter fra krysset.
    const nær = (x, y) => Math.hypot((x[0] - y[0]) / DL, (x[1] - y[1]) / DO);
    expect(nær(g.veivalg, p(0, 100))).toBeLessThan(6);
    expect(nær(g.a[0], p(0, 100))).toBeLessThan(6); expect(g.a.at(-1)).toEqual(p(0, 200));
    expect(nær(g.b[0], p(0, 100))).toBeLessThan(6); expect(g.b.at(-1)).toEqual(p(-100, 150));
    expect(g.stamme[0]).toEqual(p(0, 0)); expect(nær(g.stamme.at(-1), p(0, 100))).toBeLessThan(6);
  });
  it('siste møte, ikke første: et felles strekk er ikke to valg', () => {
    const A2 = [p(0, 0), p(0, 50), p(0, 100), p(0, 200)], B2 = [p(0, 0), p(0, 50), p(0, 100), p(-100, 150)];
    const v = felles(A2, B2).veivalg;
    expect(Math.hypot((v[0] - p(0, 100)[0]) / DL, (v[1] - p(0, 100)[1]) / DO)).toBeLessThan(6);
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
    expect(a).toMatch(/const _tre = gangTre\(_ruter\);/);
    // v1.218.208: ÉN tegneplass for gang i Auto-kartet — ingen sti tegnes utenom treet.
    expect(a.match(/drawWalk\(_aLayer,/g)).toHaveLength(1);
    expect(a).toMatch(/_tre\.linjer\.forEach\(l => drawWalk\(_aLayer, l\)\)/);
    // v1.218.223: ringen står, lappen er borte («overflødig»).
    expect(a).toMatch(/veivalg-merke/);
    expect(a).not.toMatch(/bindTooltip\('veivalg'/);
    expect(MØTES_M).toBe(12);
  });
});

describe('ekte ruter: knekkpunktene ligger ikke på samme sted (v1.218.206)', () => {
  // Skjermbildet 15:22: begge rutene følger samme gate nordover fra deg i 200 m,
  // men Valhalla har lagt knekkpunktene ulikt (A hver 80 m, B forskjøvet 40 m,
  // og 4 m til siden), så ingen to knekkpunkter er innenfor 12 m. Så skilles de.
  // A går RETT FRAM gjennom krysset ved 200 m (ingen knekkpunkt der); B svinger der.
  const A = [p(0, 0), p(130, 0), p(400, 0)];
  const B = [p(0, 4), p(60, 4), p(200, 4), p(260, 150)];
  it('før-bildet: to stier fra døra — nå én stamme og veivalg der gata deler seg', () => {
    const g = felles(A, B);
    expect(g).not.toBe(null);
    const [la] = g.veivalg;
    const nord = (la - N) / DL;
    expect(nord).toBeGreaterThan(185); expect(nord).toBeLessThan(205);
  });
});
