import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { kombiRader, KOMBI_MIN_GEVINST_MIN } from '../src/reiseTil.js';

// Skjermbildet, Oslo (Mortensrud → sentrum): kombien 81→54 er framme 11:44,
// søkesvarets beste direkte 11:46, T-bane 3 i lista 11:43. Bergen: Nesttun → sentrum.
const t = hm => Date.parse('2026-11-23T' + hm + ':00+01:00');
const rad = (ank, bytter) => ({ type: 'kollektiv', ank, bytter, fakta: [], gåOm: 1, linjer: [] });

describe('bytteraden vises bare når den slår lista (v1.218.285)', () => {
  it('før-bildet: «2 min raskere» mot søkesvaret, tregere enn T-banen i lista; nå ikke vist', () => {
    const svar = [rad(t('11:44'), 1), rad(t('11:46'), 0)];
    expect(kombiRader(svar).length).toBe(1);                               // dagens regel
    expect(kombiRader(svar, { besteAnk: t('11:43') })).toEqual([]);
  });
  it('klart raskere enn lista: vist, og «N min raskere» måles mot lista', () => {
    const k = kombiRader([rad(t('11:35'), 1), rad(t('11:46'), 0)], { besteAnk: t('11:43') });
    expect(k.length).toBe(1);
    expect(k[0].fakta).toContain('8 min raskere');
  });
  it('under terskelen: ikke vist', () => {
    expect(KOMBI_MIN_GEVINST_MIN).toBe(3);
    expect(kombiRader([rad(t('11:41'), 1)], { besteAnk: t('11:43') })).toEqual([]);
  });
  it('lista uten ankomst (Bergen, ingen kjent mål): søkesvaret som før; eneste vei står', () => {
    expect(kombiRader([rad(t('08:20'), 1), rad(t('08:25'), 0)], { besteAnk: null })[0].fakta).toContain('5 min raskere');
    expect(kombiRader([rad(t('08:20'), 1)])[0].fakta).toContain('eneste vei dit');
  });
  it('koblingen: lista sender sin tidligste ankomst', () => {
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/const listaAnk = del\.rekker\.map\(x => x\.ank && x\.ank\.ms\)\.filter\(Number\.isFinite\);/);
  });
});
