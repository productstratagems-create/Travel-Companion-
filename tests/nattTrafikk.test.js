// Steg 3: «siste i natt» bare når hullet etter er sett, og retninger som er ferdige for natta.
import { describe, it, expect } from 'vitest';
import { erNatt, radNøkkel, nesteEtter, sisteDom, ferdigeRetninger, NATT_PAUSE_MIN } from '../src/nattTrafikk.js';
import { nattRadHtml, nattFerdigeHtml } from '../src/views/auto.js';

const T = (hm) => new Date('2026-11-11T' + hm + ':00').getTime();
const L3 = { id: 'RUT:Line:3', publicCode: '3' };
const etter = nesteEtter([
  { ln: L3, dest: 'Kolsås', depTs: T('05:12') }, { ln: L3, dest: 'Kolsås', depTs: T('05:27') },
  { ln: { id: 'RUT:Line:74', publicCode: '74' }, dest: 'Jernbanetorget', depTs: T('05:40') },
  { ln: L3, dest: 'Stortinget', depTs: T('01:05'), cancelled: true },
]);

describe('natt', () => {
  it('erNatt: 21–05', () => {
    expect([T('20:59'), T('21:00'), T('00:15'), T('04:59'), T('05:00')].map(erNatt)).toEqual([false, true, true, true, false]);
  });
  it('første avgang per linje og retning; innstilte teller ikke', () => {
    expect(etter.get(radNøkkel('RUT:Line:3', 'Kolsås')).depTs).toBe(T('05:12'));
    expect(etter.has(radNøkkel('RUT:Line:3', 'Stortinget'))).toBe(false);
  });
  it('siste i natt bare når hullet er minst NATT_PAUSE_MIN', () => {
    const neste = etter.get(radNøkkel('RUT:Line:3', 'Kolsås'));
    expect(sisteDom(T('00:47'), neste, true)).toEqual({ siste: T('00:47'), neste: T('05:12') });
    expect(sisteDom(T('05:00'), neste, true)).toBe(null);
    expect(NATT_PAUSE_MIN).toBe(120);
  });
  it('uten svar, eller uten neste avgang i svaret: ingen påstand', () => {
    expect(sisteDom(T('00:47'), undefined, false)).toBe(null);
    expect(sisteDom(T('00:47'), undefined, true)).toBe(null);
  });
  it('raden: «siste i natt · neste» når den siste står på skjermen', () => {
    const d = { lines: [{ id: 'RUT:Line:3', code: '3' }], frontText: 'Kolsås', calls: [{ ms: T('00:32') }, { ms: T('00:47') }] };
    expect(nattRadHtml(d, { spurt: true, etter })).toMatch(/siste i natt · neste /);
    expect(nattRadHtml({ ...d, calls: [1, 2, 3, 4].map(i => ({ ms: T('00:0' + i) })) }, { spurt: true, etter })).toBe('');
    expect(nattRadHtml(d, { spurt: false, etter })).toBe('');
  });
  it('ferdige retninger: i svaret etter, men ikke i lista', () => {
    const dirs = [{ lines: [{ id: 'RUT:Line:3' }], frontText: 'Kolsås' }];
    expect(ferdigeRetninger(etter, new Set([radNøkkel('RUT:Line:3', 'Kolsås')])).map(f => f.kode)).toEqual(['74']);
    expect(nattFerdigeHtml(dirs, { spurt: true, etter })).toMatch(/ingen flere i natt.*74 mot Jernbanetorget · neste /s);
  });
});
