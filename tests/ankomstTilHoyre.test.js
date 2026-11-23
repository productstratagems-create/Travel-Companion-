import { describe, it, expect } from 'vitest';
import { tavleRadHtml } from '../src/ui/tavleRad.js';
import { kombiAvgang } from '../src/views/auto.js';

// Oslo (skjermbildet): T3 fra Mortensrud går 11:33, framme Jernbanetorget 11:58.
// Trondheim: 3 fra Ranheim går 08:21, framme Studentersamfundet 08:52.
const t = hm => new Date(2026, 10, 23, +hm.slice(0, 2), +hm.slice(3, 5)).getTime();   // lokal tid, som clk
const rad = (avg, ank, navn, kode) => ({ d: { frontText: 'Kolsås', lines: [{ code: kode, mode: 'metro' }] },
  call: { realtime: true, quay: { publicCode: '1' } }, ms: t(avg), rekker: true, gåOm: 6, gang: 12,
  ank: ank ? { navn, ms: t(ank) } : null, herNavn: 'Mortensrud' });
const tekst = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const klokke = h => tekst((h.match(/<span class="at-klokke[^"]*">[\s\S]*?<\/span>/) || [''])[0]);

describe('ankomsten får plassen til høyre (v1.218.286)', () => {
  it('før-bildet: avgangen var det store tallet, ankomsten grå i midten; nå framme stort, går smått', () => {
    const h = tavleRadHtml(rad('11:33', '11:58', 'Jernbanetorget', '3'), t('11:14'), 0);
    expect(klokke(h)).toBe('framme 11:58 går 11:33');
    expect(tekst(h)).toContain('til Jernbanetorget');
    expect(tekst(h)).not.toContain('ank. Jernbanetorget');
    expect(h).toMatch(/aria-label="[^"]*framme 11:58/);
  });
  it('Trondheim: samme kolonne', () => {
    expect(klokke(tavleRadHtml(rad('08:21', '08:52', 'Studentersamfundet', '3'), t('08:10'), 0))).toBe('framme 08:52 går 08:21');
  });
  it('uten kjent mål: avgangen til høyre som før', () => {
    const h = tavleRadHtml(rad('11:33', null, null, '3'), t('11:14'), 0);
    expect(klokke(h)).toBe('11:33');
    expect(h).not.toContain('framme');
  });
  it('bytteraden: avgangen er første kollektivetappe', () => {
    const r = { tp: { legs: [{ mode: 'foot', expectedStartTime: '2026-11-23T11:00:00+01:00' }, { mode: 'bus', expectedStartTime: new Date(t('11:15')).toISOString() }] } };
    expect(kombiAvgang(r)).toBe(t('11:15'));
    expect(kombiAvgang({})).toBeNull();
  });
});
describe('blandet liste (v1.218.286)', () => {
  it('rader uten mål sier «går» når andre sier «framme»', () => {
    const r = { ...rad('11:48', null, null, '1'), klokkeOrd: true };
    expect(klokke(tavleRadHtml(r, t('11:40'), 0))).toBe('går 11:48');
  });
});
