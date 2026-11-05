// «Raskere hvis du går av her.»
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('leaflet', () => ({ default: {} })); vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
import { raskereHer, bestFra, RASKERE_MIN } from '../src/raskere.js';
import { stoppFram } from '../src/api/ombord.js';

const T = (hh, mm) => Date.parse('2026-11-05T' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ':00+01:00');
const tp = (linje, går, fram) => ({ legs: [{ mode: 'bus', line: { publicCode: linje }, expectedStartTime: new Date(går).toISOString(), expectedEndTime: new Date(fram).toISOString() }] });
const ANK_TVEITA = T(8, 16), ANK_ETTER = T(8, 19);

describe('raskereHer', () => {
  it('69 fra Tveita er fram 08:32, fra stoppet etter 08:40: 8 min tidligere', () => {
    const r = raskereHer({ herfra: [tp('69', T(8, 24), T(8, 32))], herfraAnk: ANK_TVEITA,
      senere: [tp('69', T(8, 31), T(8, 40))], senereAnk: ANK_ETTER });
    expect(r.sparerMin).toBe(8);
    expect(r.tp.legs[0].line.publicCode).toBe('69');
  });
  it('mindre enn tre minutter: ingenting', () => {
    expect(RASKERE_MIN).toBe(3);
    expect(raskereHer({ herfra: [tp('69', T(8, 24), T(8, 32))], herfraAnk: ANK_TVEITA,
      senere: [tp('69', T(8, 26), T(8, 34))], senereAnk: ANK_ETTER })).toBeNull();
  });
  it('bli sittende er raskere: ingenting', () => {
    expect(raskereHer({ herfra: [tp('69', T(8, 24), T(8, 32))], herfraAnk: ANK_TVEITA, bliMs: T(8, 30) })).toBeNull();
  });
  it('bli sittende er tregere: sier fra', () => {
    expect(raskereHer({ herfra: [tp('69', T(8, 24), T(8, 32))], herfraAnk: ANK_TVEITA, bliMs: T(8, 41) }).sparerMin).toBe(9);
  });
  it('ingenting å sammenligne med: ingenting, ikke en gjetning', () => {
    expect(raskereHer({ herfra: [tp('69', T(8, 24), T(8, 32))], herfraAnk: ANK_TVEITA })).toBeNull();
  });
  it('en avgang som går før du er der, teller ikke', () => {
    expect(bestFra([tp('69', T(8, 15), T(8, 22)), tp('69', T(8, 24), T(8, 32))], ANK_TVEITA).legs[0].expectedEndTime)
      .toBe(new Date(T(8, 32)).toISOString());
  });
});

describe('stoppFram', () => {
  const kall = (id, mm) => ({ expectedDepartureTime: new Date(T(8, mm)).toISOString(), quay: { stopPlace: { id, name: id } } });
  const k = { call: { serviceJourney: { estimatedCalls: [kall('A', 10), kall('TVEITA', 16), kall('ETTER', 19)] } } };
  it('neste og stoppet etter', () => {
    expect(stoppFram(k, T(8, 12), 0).id).toBe('TVEITA');
    expect(stoppFram(k, T(8, 12), 1).id).toBe('ETTER');
  });
});

describe('visning og kobling', async () => {
  const { raskereHtml } = await import('../src/views/auto.js');
  it('én linje med stopp, linje, tid, mål og hvor mye du sparer', () => {
    const h = raskereHtml({ navn: 'Tveita', mål: 'Lutvann skole', r: { tp: tp('69', T(8, 24), T(8, 32)), framMs: T(8, 32), sparerMin: 8 } });
    expect(h).toMatch(/raskere å gå av på Tveita: <b>69<\/b> \d\d:\d\d → Lutvann skole \d\d:\d\d · <b>8 min tidligere<\/b>/);
  });
  it('ellers ingenting', () => {
    expect(raskereHtml({ r: null })).toBe('');
    expect(raskereHtml(null)).toBe('');
  });
  it('henter bare med lås og mål, én gang per neste stopp, tur og mål', () => {
    const s = readFileSync('src/views/auto.js', 'utf8');
    expect(s).toContain("const key = neste.id + '|' + _lås.k.nøkkel + '|' + mål;");
    expect(s).toMatch(/if \(!mål \|\| !neste \|\| !neste\.id \|\| neste\.id === mål/);
    expect(s).toContain("(_lås ? raskereHtml(_raskereData(nåW)) : '')");
  });
});
