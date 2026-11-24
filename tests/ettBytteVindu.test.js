/* TIDSVINDUET I «ETT BYTTE» (v1.218.310). Spurt: «Hva er tidsperspektivet?» */
import { describe, it, expect } from 'vitest';
import { vinduTekst, ettByttePer } from '../src/ettBytte.js';
import { utforsk, PARAMETRE, _tømCache } from '../src/nettverksutforsker.js';
import { lastOpptak, avspiller } from './fixtures/entur/avspilling.js';

const kn = (...m) => ({ knutepunkter: { vurdert: m.map(h => ({ status: 'spurt', horisontMin: h })).concat([{ status: 'ikke spurt', horisontMin: 999 }]) } });
describe('vinduTekst', () => {
  it('bare buss: én time; buss og tog: 1–3 timer; ikke-spurte knutepunkter teller ikke', () => {
    expect(vinduTekst({ tilgangHorisontMin: [60, 60], ...kn(60) })).toBe('avganger fra nå og 1 time fram');
    expect(vinduTekst({ tilgangHorisontMin: [60], ...kn(180) })).toBe('avganger fra nå og 1–3 timer fram');
    expect(vinduTekst({ tilgangHorisontMin: [180], ...kn(180) })).toBe('avganger fra nå og 3 timer fram');
    expect(vinduTekst({ tilgangHorisontMin: [30, 45] })).toBe('avganger fra nå og 30–45 min fram');
    expect(vinduTekst({ tilgangHorisontMin: [30], ...kn(120) })).toBe('avganger fra nå og 30 min–2 timer fram');
  });
  it('uten vindu i svaret: null (overskriften står som før)', () => {
    expect(vinduTekst({})).toBeNull();
    expect(vinduTekst(null)).toBeNull();
  });
});

describe('opptakene: overskriften har vinduet, og det følger PARAMETRE.horisontMin', () => {
  for (const n of ['mortensrud_dag', 'ranheim_dag', 'tretten_dag']) {
    it(n, async () => {
      _tømCache();
      const O = lastOpptak(n);
      const res = await utforsk({ posisjon: O.scenario.posisjon, tid: O.scenario.tid }, { hent: avspiller(O).hent });
      const g = ettByttePer(res, O.scenario.posisjon, 'retning').grunnlag;
      const lov = Object.values(PARAMETRE.horisontMin);
      expect(res.tilgangHorisontMin.every(m => lov.includes(m))).toBe(true);
      expect(g).toMatch(/^mulig med ett bytte · avganger fra nå og .+ fram — ikke sjekket mot reisesøket/);
      const alle = [...res.tilgangHorisontMin, ...res.knutepunkter.vurdert.filter(k => k.status === 'spurt').map(k => k.horisontMin)];
      expect(g).toContain(Math.max(...alle) / 60 + (Math.max(...alle) === 60 ? ' time' : ' timer'));
    });
  }
});
