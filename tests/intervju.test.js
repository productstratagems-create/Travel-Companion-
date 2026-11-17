// v1.218.100: intervjuet om reisevanene, ved ujevne mellomrom.
import { describe, it, expect, beforeEach } from 'vitest';
import { storage } from '../src/storage.js';
import { intervjuKlart, intervjuUtsett, målSpørsmål, INTERVJU_MIN_T, INTERVJU_MAKS_T } from '../src/intervju.js';
import { rangerMål } from '../src/maalModell.js';

const L = (dag, hh, mm = 0) => new Date(2026, 10, dag, hh, mm).getTime();   // 10. nov = tirsdag
const tur = (til, bucket, count, helg = false) => ({ toName: til, fromName: 'Mortensrud', bucket, isWeekend: helg, count });

describe('når', () => {
  beforeEach(() => storage.set('t.intervju', ''));
  it('første gang er det klart; etter et svar venter det 6–48 t, tilfeldig', () => {
    const nå = L(10, 19);
    expect(intervjuKlart(nå)).toBe(true);
    intervjuUtsett(nå, () => 0);
    expect(intervjuKlart(nå + (INTERVJU_MIN_T - 0.1) * 3600_000)).toBe(false);
    expect(intervjuKlart(nå + INTERVJU_MIN_T * 3600_000)).toBe(true);
    intervjuUtsett(nå, () => 0.999);
    expect(intervjuKlart(nå + (INTERVJU_MAKS_T - 0.1) * 3600_000)).toBe(false);
  });
});

describe('hva', () => {
  it('spør om reiser i historikken du ikke har svart på, tidsrommet nå først', () => {
    const hist = [tur('Helsfyr', 4, 5), tur('Jernbanetorget', 9, 2), tur('Ryen', 9, 1)];
    const q = målSpørsmål(hist, L(10, 19), () => 0);
    expect(q.map(x => x.h.toName)).toEqual(['Jernbanetorget', 'Helsfyr']);   // Ryen: bare én reise
    expect(q[0].tekst).toBe('Reiser du ofte fra Mortensrud til Jernbanetorget på hverdager rundt 18–20?');
  });
  it('det du har svart på, spørres ikke om igjen', () => {
    const q = målSpørsmål([tur('Jernbanetorget', 9, 2)], L(10, 19), h => (h.toName === 'Jernbanetorget' ? 1 : 0));
    expect(q).toEqual([]);
  });
});

describe('svarene brukes', () => {
  const JBT = { name: 'Jernbanetorget', lat: 59.9119, lon: 10.7504 };
  const MORT = { name: 'Mortensrud', lat: 59.8494, lon: 10.8294 };
  it('«ja» gjør målet til en vane uten nok reiser', () => {
    const r = rangerMål([JBT], { nå: L(10, 19), her: MORT, hist: [], svar: () => 1 });
    expect(r[0].vane).toBe(true);
    expect(r[0].grunn).toMatch(/du har sagt/);
  });
  it('«nei» tar bort vanen og senker målet', () => {
    const hist = [tur('Jernbanetorget', 9, 4)];
    const uten = rangerMål([JBT], { nå: L(10, 19), her: MORT, hist, svar: () => 0 })[0];
    const nei = rangerMål([JBT], { nå: L(10, 19), her: MORT, hist, svar: () => -1 })[0];
    expect(uten.vane).toBe(true);
    expect(nei.vane).toBe(false);
    expect(nei.p).toBeLessThan(uten.p);
  });
  it('auto-reise spør via intervjuet og skriver svaret dit «stemmer/nei» skrives', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/views/auto.js', 'utf8');
    expect(src).toMatch(/intervjuKlart\(nå\)\s*\?/);
    expect(src).toMatch(/q\.art === 'mål'\) \{ lærNesteSvar\(q\.h, \+1\)/);
    expect(src).toMatch(/svar: nesteSvarFor \}\)/);
  });
});
