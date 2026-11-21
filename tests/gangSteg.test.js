// v1.218.192: gangen steg for steg — neste sving, framme-siden, kurs fra sporet.
import { describe, it, expect } from 'vitest';
import { nesteSving, svingTekst, kursNå, SVING_GRADER, SVING_PÅ } from '../src/gangSteg.js';

const N = 59.85, Ø = 10.83, M_LAT = 1 / 111320, M_LON = 1 / (111320 * Math.cos(N * Math.PI / 180));
const p = (nord, øst) => [N + nord * M_LAT, Ø + øst * M_LON];
const pos = (nord, øst) => ({ lat: N + nord * M_LAT, lon: Ø + øst * M_LON });

describe('nesteSving', () => {
  // 100 m nordover, så 100 m vestover (til venstre), stoppet i enden.
  const RUTE = [p(0, 0), p(50, 0), p(100, 0), p(100, -50), p(100, -100)];
  it('om 60 m: til venstre', () => {
    const s = nesteSving(RUTE, pos(40, 0), 0);
    expect(s).toMatchObject({ kind: 'sving', side: 'venstre' });
    expect(s.m).toBeGreaterThan(55); expect(s.m).toBeLessThan(65);
    expect(svingTekst(s)).toBe('om 60 m: til venstre');
  });
  it('etter svingen, rett strekk til stoppet: ingenting', () => {
    expect(nesteSving(RUTE, pos(100, -30), 270)).toBe(null);
  });
  it('en bue under SVING_GRADER er ingen sving', () => {
    const bue = [p(0, 0), p(50, 0), p(100, 10), p(150, 20)];   // ~11°
    expect(nesteSving(bue, pos(10, 0), 0)).toBe(null);
    expect(SVING_GRADER).toBe(40);
  });
  it('utenfor ruta: ingenting (ingen «feil vei»-alarm)', () => {
    expect(nesteSving(RUTE, pos(40, 80), 0)).toBe(null);
  });
  it('framme: siden stoppet er på, fra kursen du går i', () => {
    const s = nesteSving(RUTE, pos(100, -80), 0);   // går nordover, stoppet 20 m vest
    expect(s).toMatchObject({ kind: 'framme', side: 'venstre' });
    expect(svingTekst(s, 'Mortensrud')).toBe('Mortensrud er på venstre side');
    expect(nesteSving(RUTE, pos(100, -80), null)).toBe(null);
  });
});

describe('kursNå', () => {
  it('fra sporet, ikke kompasset; null når du står stille', () => {
    expect(kursNå([pos(0, 0), pos(20, 0)])).toBeCloseTo(0, 0);
    expect(kursNå([pos(0, 0), pos(0, 20)])).toBeCloseTo(90, 0);
    expect(kursNå([pos(0, 0), pos(3, 0)])).toBe(null);
  });
});

import { readFileSync } from 'node:fs';
describe('koblingen', () => {
  it('kjeglen fra sporet på prikken; linja i Auto og avgangsdetaljene', () => {
    expect(readFileSync('src/ui/map.js', 'utf8')).toMatch(/const k = manuell \? null : kursNå\(state\.posTrail\);/);
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/sving: SVING_PÅ && !fart && !syn\.lås \? svingTekst\(nesteSving\(approachPoints\(\), userLL\(\), kursNå\(state\.posTrail\)\)/);
    expect(readFileSync('src/views/selected.js', 'utf8')).toMatch(/SVING_PÅ \? svingTekst\(nesteSving\(approachPoints\(\), userLL\(\), kursNå\(state\.posTrail\)\), navn\) : ''/);
    // v1.218.230: av, ikke etter proven.
    expect(SVING_PÅ).toBe(false);
  });
});
