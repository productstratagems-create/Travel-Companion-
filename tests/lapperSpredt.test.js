// v1.218.115: fullskjerm i Auto-tavles formknapp; én lapp per linje, spredt.
import { describe, it, expect } from 'vitest';
import { kartSyklus, plasserLapper, lappRekt, lappNivåer } from '../src/views/auto.js';

describe('formknappen', () => {
  it('Auto-tavle: kvadrat → bred → fullskjerm; auto-reise: to steg', () => {
    expect(kartSyklus(true)).toEqual(['kvadrat', 'bred', 'full']);
    expect(kartSyklus(false)).toEqual(['kvadrat', 'bred']);
  });
});

describe('en lapp per linje', () => {
  it('ingen linje uten lapp, også med mange', () => {
    const n = k => Array.from({ length: k }, (_, i) => ({ ms: i }));
    expect(lappNivåer(n(10), { bredde: 382, høyde: 200, zoom: 13 }).every(v => v >= 1)).toBe(true);
  });
});

const W = 400, H = 300;
const rektFor = (st, side, niv) => { const r = lappRekt(st, side, niv === 1 ? 34 : 80, 18); return r.venstre >= 0 && r.høyre <= W && r.topp >= 0 && r.bunn <= H ? r : null; };
const overlapp = (a, b) => a.venstre < b.høyre && a.høyre > b.venstre && a.topp < b.bunn && a.bunn > b.topp;

describe('spredt uten overlapp', () => {
  it('tre linjer med samme naturlige plass: tre lapper, ingen overlapper', () => {
    const felles = [{ x: 200, y: 150 }, { x: 260, y: 150 }, { x: 140, y: 150 }];
    const p = plasserLapper(3, { nivå: () => 2, kandidater: () => felles, hindre: [],
      naturlig: () => 'top', rekt: (i, st, side, niv) => rektFor(st, side, niv), tvungen: () => ({ stopp: felles[0], side: 'top' }) });
    expect(p.length).toBe(3);
    expect(p.some(x => x.tvunget)).toBe(false);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(overlapp(p[i].rekt, p[j].rekt)).toBe(false);
  });
  it('ikke plass: lavere nivå, så tvunget — men aldri uten lapp', () => {
    const ett = [{ x: 200, y: 150 }];
    const p = plasserLapper(6, { nivå: () => 2, kandidater: () => ett, hindre: [],
      naturlig: () => 'top', rekt: (i, st, side, niv) => rektFor(st, side, niv), tvungen: () => ({ stopp: ett[0], side: 'top' }) });
    expect(p.length).toBe(6);
    expect(p.some(x => x.tvunget)).toBe(true);
    // Bare de tvungne kan overlappe; de frie gjør det aldri.
    const frie = p.filter(x => !x.tvunget);
    for (let i = 0; i < frie.length; i++) for (let j = i + 1; j < frie.length; j++) expect(overlapp(frie[i].rekt, frie[j].rekt)).toBe(false);
  });
  it('faller til nivå 1 når nivå 2 ikke får plass', () => {
    // Et smalt kart: 80 px bred lapp går ikke, 34 px gjør.
    const smal = (st, side, niv) => { const r = lappRekt(st, side, niv === 1 ? 34 : 80, 18); return r.venstre >= 0 && r.høyre <= 60 && r.topp >= 0 && r.bunn <= H ? r : null; };
    const p = plasserLapper(1, { nivå: () => 2, kandidater: () => [{ x: 30, y: 150 }], hindre: [],
      naturlig: () => 'top', rekt: (i, st, side, niv) => smal(st, side, niv), tvungen: () => ({ stopp: { x: 30, y: 150 }, side: 'top' }) });
    expect(p[0].nivå).toBe(1);
    expect(p[0].tvunget).toBe(false);
  });
});
