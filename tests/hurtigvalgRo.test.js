import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { byttUtenNyTavle } from '../src/views/auto.js';

// Oslo (opptaket): tavla hentet for Mortensrud, med Stenbråten flettet inn.
// Bergen: Nesttun terminal med Nesttun sentrum flettet inn.
const kall = fra => ({ call: fra ? { _fra: { id: fra } } : {} });
const OSLO = [{ calls: [kall(null), kall('NSR:StopPlace:Stenbråten')] }, { calls: [kall(null)] }];
const BERGEN = [{ calls: [kall('NSR:StopPlace:NesttunSentrum')] }];

describe('hurtigvalg flytter overskriften uten å bygge skjermen på nytt (v1.218.283)', () => {
  it('før-bildet: bytte til Stenbråten tømte tavla; nå er det bare visning når avgangene alt er der', () => {
    expect(byttUtenNyTavle('NSR:StopPlace:Stenbråten', OSLO)).toBe(true);
    expect(byttUtenNyTavle('NSR:StopPlace:NesttunSentrum', BERGEN)).toBe(true);
  });
  it('et stopp som ikke er i tavla: ny tavle som før', () => {
    expect(byttUtenNyTavle('NSR:StopPlace:Holmlia', OSLO)).toBe(false);
    expect(byttUtenNyTavle(null, OSLO)).toBe(false);
  });
  it('hurtigvalg, målområder og reisesøk regnes fra tavlas stopp, ikke overskriften', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect(a).toMatch(/const visning = !!_stop && _avklar\.dirsFor != null && _stop\.id !== _avklar\.dirsFor && byttUtenNyTavle\(_stop\.id, _dirs\);/);
    expect(a).toMatch(/const sig = \(_tavle\(\) && _tavle\(\)\.id\)/);
    expect(a).toMatch(/if \(!_stop \|\| _atStopp !== _tavle\(\)\.id\)/);
    expect(a).toMatch(/_kombi\.get\(_tavle\(\)\.id \+ '\|' \+ _atRetning\)/);
    expect(a).toMatch(/const k = _tavle\(\)\.id \+ '\|' \+ valg/);
  });
});
