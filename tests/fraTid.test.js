// v1.218.130: «to hurtigvalg: etter 06:00 og etter 15:00».
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fraTid, fraTidTekst, fraUtløpt, FRA_UTLØP_MS } from '../src/views/auto.js';
import { boardGQL } from '../src/api/queries.js';

const kl = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime();   // 18. nov 2026

describe('tidspunktet', () => {
  it('kl. 10: 06 er i morgen, 15 er i dag; «nå» er null', () => {
    expect(fraTid('a', kl(18, 10))).toBe(kl(19, 6));
    expect(fraTid('b', kl(18, 10))).toBe(kl(18, 15));
    expect(fraTid('nå', kl(18, 10))).toBe(null);
    expect(fraTid(null, kl(18, 10))).toBe(null);
  });
  it('kl. 16: 15 er i morgen', () => {
    expect(fraTid('b', kl(18, 16))).toBe(kl(19, 15));
  });
  it('teksten sier «i morgen» når det er i morgen', () => {
    expect(fraTidTekst(kl(18, 15), kl(18, 10))).toBe('etter 15:00');
    expect(fraTidTekst(kl(19, 6), kl(18, 10))).toBe('etter 06:00 i morgen');
    expect(fraTidTekst(null, kl(18, 10))).toBe('nå');
  });
  it('valget utløper 30 min etter tidspunktet', () => {
    expect(fraUtløpt(kl(18, 15), kl(18, 15) + FRA_UTLØP_MS - 1)).toBe(false);
    expect(fraUtløpt(kl(18, 15), kl(18, 15) + FRA_UTLØP_MS + 1)).toBe(true);
    expect(fraUtløpt(null, kl(18, 15))).toBe(false);
  });
});

describe('hentingen', () => {
  it('spørringen starter ved tidspunktet', () => {
    const q = boardGQL('NSR:StopPlace:1', 30, kl(18, 15), false, 180);
    const start = Date.parse(q.match(/startTime:"([^"]+)"/)[1]);
    expect(start).toBeLessThanOrEqual(kl(18, 15));
    expect(kl(18, 15) - start).toBeLessThan(10 * 60_000);
  });
  it('auto-skjermen henter fra tidspunktet når et valg er gjort', () => {
    const s = readFileSync('src/views/auto.js', 'utf8');
    expect(s).toMatch(/if \(Number\.isFinite\(_fraMs\)\) \{[\s\S]{0,200}hentStoppAvganger\(s\.id, 30, fra, 180\)/);
    expect(readFileSync('src/api/entur.js', 'utf8')).toMatch(/boardGQL\(stopId, n, Number\.isFinite\(fraMs\) \? fraMs : null/);
  });
});

import { fraTider, settFraTid, FRA_STANDARD } from '../src/fraTider.js';
describe('justerbare tider (v1.218.132)', () => {
  it('standard er 06:00 og 15:00', () => { expect(FRA_STANDARD).toEqual(['06:00', '15:00']); });
  it('minuttene teller med', () => {
    expect(fraTid('a', kl(18, 10), ['07:30', '15:00'])).toBe(kl(19, 7, 30));
    expect(fraTid('b', kl(18, 10), ['06:00', '16:45'])).toBe(kl(18, 16, 45));
  });
  it('lagret tid leses, ugyldig faller tilbake', () => {
    settFraTid(0, '07:30'); expect(fraTider()).toEqual(['07:30', '15:00']);
    settFraTid(1, '25:00'); expect(fraTider()).toEqual(['07:30', '15:00']);
    settFraTid(0, '06:00');
  });
});
