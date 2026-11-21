// v1.218.199: «Posisjonering og adresse korresponderer ikke.»
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { velgAdresse, reverseUrl, ADRESSE_HER_M } from '../src/api/stedNavn.js';

const N = 59.85, Ø = 10.83, DL = 1 / 111320, DO = 1 / (111320 * Math.cos(N * Math.PI / 180));
const punkt = { lat: N, lon: Ø };
const f = (navn, nord, øst) => ({ properties: { name: navn }, geometry: { coordinates: [Ø + øst * DO, N + nord * DL] } });

describe('velgAdresse', () => {
  it('før-bildet: første treff ble tatt — nå det nærmeste', () => {
    expect(velgAdresse([f('Langt unna 1', 90, 0), f('Stenbråtveien 14', 5, 0)], punkt)).toBe('Stenbråtveien 14');
  });
  it('ikke der nåla står: «nær …»', () => {
    expect(velgAdresse([f('Stenbråtveien 14', ADRESSE_HER_M + 20, 0)], punkt)).toBe('nær Stenbråtveien 14');
  });
  it('for langt unna eller ingen: null (skjermen sier «nær <stopp>»)', () => {
    expect(velgAdresse([f('Fjernt 2', 400, 0)], punkt)).toBe(null);
    expect(velgAdresse([], punkt)).toBe(null);
  });
  it('spør for punktet, bare adresser, flere treff', () => {
    const u = reverseUrl(punkt);
    expect(u).toMatch(/layers=address&/); expect(u).toMatch(/size=5/);
    expect(readFileSync('src/api/stedNavn.js', 'utf8')).toMatch(/const nøkkel = ll => ll\.lat\.toFixed\(5\)/);
  });
});
