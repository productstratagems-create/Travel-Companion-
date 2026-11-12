// v1.218.48 — om bord: ingen gangvei/meter til stasjonen toget skal til, og «dit du ofte skal» sier
// «bli sittende» når turen selv går dit (rapportert: T2 fra Hellerud fra en linje 3 til Jernbanetorget).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { stopHeadHtml, kortHtml } from '../src/views/auto.js';
import { clk } from '../src/ui/fmt.js';

const T = Date.parse('2026-11-12T08:41:00+01:00');
const tekst = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('stopphodet om bord', () => {
  it('«toget er der hh:mm», ikke meter, gangtid eller «du nærmer deg den»', () => {
    const h = tekst(stopHeadHtml({ name: 'Oppsal', distM: 2335 }, 2, false,
      { iFart: false, ombordAt: T, walkDist: 2335, walkMins: 31, way: 'mot', wayEtaS: 30, pos: 'ok' }));
    expect(h).toContain('toget er der ' + clk(T));
    expect(h).not.toMatch(/2335|31 min gange|nærmer deg/);
  });
  it('til fots: som før', () => {
    const h = tekst(stopHeadHtml({ name: 'Oppsal', distM: 300 }, 2, false, { iFart: false, walkDist: 300, walkMins: 5, pos: 'ok' }));
    expect(h).toContain('300 m å gå');
    expect(h).toContain('5 min gange');
  });
});

describe('kartet om bord', () => {
  it('ber ikke om ganglinja når en tur er låst, også når toget står', () => {
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/ensureApproach\(!_lås && gangGjelder\(/);
  });
});

describe('«dit du ofte skal» om bord', () => {
  const o = { ms: T + 10 * 60000, at: T + 22 * 60000, call: { quay: { publicCode: '2' } }, d: { frontText: 'Østerås', lines: [{ code: '2' }] } };
  it('turen går selv dit: «bli sittende på 3 · framme»', () => {
    const h = tekst(kortHtml({ name: 'Jernbanetorget', options: [o, o, o], bliSittende: T + 12 * 60000, bliLinje: '3' }, 0));
    expect(h).toContain('bli sittende på 3');
    expect(h).toContain('framme ' + clk(T + 12 * 60000));
    expect(h).not.toContain('Østerås');
  });
  it('uten låst tur: som før', () => {
    expect(tekst(kortHtml({ name: 'Jernbanetorget', options: [o] }, 0))).toContain('mot Østerås');
  });
  it('koblingen: beregnet fra låsen', () => {
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/x\.bliSittende = _lås \? \(_bliSittendeMs\(_lås\.k, x\.id, now\)/);
  });
});
