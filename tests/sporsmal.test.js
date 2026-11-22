// v1.218.257: onboarding steg 2 — én spørsmålsplass.
import { describe, it, expect } from 'vitest';
import { velgSpørsmål, dagNøkkel } from '../src/sporsmal.js';
const S = (...k) => new Set(k);
describe('én spørsmålsplass', () => {
  it('før-bildet: «neste reise» og et profilspørsmål samtidig — nå ett', () => {
    expect(velgSpørsmål(S('neste', 'profil'), { harReiser: true })).toBe('neste');
  });
  it('faste stopp først, også uten reiser; de andre krever reiser', () => {
    expect(velgSpørsmål(S('faste', 'neste'), { harReiser: true })).toBe('faste');
    expect(velgSpørsmål(S('faste'), { harReiser: false })).toBe('faste');
    expect(velgSpørsmål(S('profil', 'neste'), { harReiser: false })).toBe(null);
  });
  it('aldri i fart', () => {
    expect(velgSpørsmål(S('faste', 'neste'), { iFart: true, harReiser: true })).toBe(null);
  });
  it('høyst ett om dagen — men det som står, får stå til det er besvart', () => {
    expect(velgSpørsmål(S('profil'), { harReiser: true, besvartIDag: true })).toBe(null);
    expect(velgSpørsmål(S('faste', 'profil'), { harReiser: true, besvartIDag: true, pågår: 'faste' })).toBe('faste');
  });
  it('dagen er lokal dato', () => {
    expect(dagNøkkel(new Date(2026, 10, 24, 23, 59).getTime())).toBe('2026-11-24');
  });
});
import { readFileSync } from 'node:fs';
describe('koblingen (v1.218.257)', () => {
  const a = readFileSync('src/views/auto.js', 'utf8');
  it('«neste reise» og profilplassen spør bare når det er deres tur', () => {
    expect(a).toMatch(/const sinTur = \(nøkkel && nøkkel === _nesteBesvart\) \|\| _spørsmålNå\(nå\) === 'neste';/);
    expect(a).toMatch(/if \(valgt !== 'avstigning' && valgt !== 'profil'\) \{ el\.style\.display = 'none';/);
  });
  it('hvert svar teller som dagens spørsmål', () => {
    expect((a.match(/_spørsmålBesvart\(\);/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});
