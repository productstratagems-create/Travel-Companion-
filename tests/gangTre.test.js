import { describe, it, expect } from 'vitest';
import { gangTre, stierFraPrikken } from '../src/veivalg.js';
// Skjermbildet (Stenbråtveien 81D, 2026-11-21): 1 px ≈ 0,5 m, origo i prikken.
const P = (x, y) => [59.86 - (y - 1020) * 0.5 / 111000, 10.83 + (x - 190) * 0.5 / 55700];
const hoved = [P(190, 1020), P(420, 1045), P(580, 1160), P(680, 1080), P(770, 940), P(840, 770)];
const alt = [P(190, 1020), P(680, 1075), P(900, 1095)];
const gåHit = [P(190, 1020), P(300, 1032), P(420, 1046), P(430, 1300)]; // følger stammen, så sørover
describe('gangtreet (v1.218.208)', () => {
  it('skjermbildets form: én sti ut fra prikken og et veivalg', () => {
    const t = gangTre([hoved, alt]);
    expect(stierFraPrikken(t.linjer, P(190, 1020))).toBe(1);
    expect(t.veivalg).toHaveLength(1);
  });
  it('GÅ HIT går også gjennom treet', () => {
    const t = gangTre([hoved, alt, gåHit]);
    expect(stierFraPrikken(t.linjer, P(190, 1020))).toBe(1);
    expect(t.linjer).toHaveLength(3);
  });
  it('rute som går parallelt (~25 m unna) uten å møte grener fra stammen', () => {
    const parallell = [P(190, 1020), P(240, 990), P(500, 1000), P(520, 700)];
    const t = gangTre([hoved, parallell]);
    expect(t.veivalg).toHaveLength(0);
    expect(stierFraPrikken(t.linjer, P(190, 1020))).toBe(1);
  });
  it('rute i motsatt retning fra døra er en egen vei — nødvendig', () => {
    const motsatt = [P(190, 1020), P(100, 1020), P(-200, 1000)];
    expect(stierFraPrikken(gangTre([hoved, motsatt]).linjer, P(190, 1020))).toBe(2);
  });
  it('før-bildet: tre separate stier ga 3 fra prikken', () => {
    expect(stierFraPrikken([hoved, alt, gåHit], P(190, 1020))).toBe(3);
  });
});
