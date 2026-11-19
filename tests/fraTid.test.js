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
    expect(s).toMatch(/if \(Number\.isFinite\(_fraMs\)\) \{[\s\S]{0,800}hentStoppAvganger\(s\.id, modus === .ankomst. \? 60 : 30, start, vindu\)/);
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

describe('langt trykk justerer tiden (v1.218.133)', () => {
  const s = readFileSync('src/views/auto.js', 'utf8');
  it('holdet åpner telefonens tidsvelger når fingeren slippes', () => {
    expect(s).toMatch(/export const FRA_HOLD_MS = 550;/);
    expect(s).toMatch(/addEventListener\('pointerup'[\s\S]{0,200}_åpneFraVelger\(el, v\)/);
    expect(s).toMatch(/inp\.type = 'datetime-local'/);
  });
  it('lukking med ny verdi lagrer på samme sted som innstillingene, og velger tiden', () => {
    // v1.218.140: dato og tid; lagres med settFraDatoTid (som også setter tiden i innstillingene).
    expect(s).toMatch(/addEventListener\('change', \(\) => \{[\s\S]{0,400}settFraDatoTid\(FRA_VALG\[plass\], ms\);\s*settFraValg\(plass\);/);
  });
  it('et langt trykk er ikke et valg', () => {
    expect(s).toMatch(/if \(_fraHold\.brukt\) \{ _fraHold\.brukt = false; e\.preventDefault\(\); return; \}/);
  });
});

import { nesteModus, fraKnappTekst, hentFraMs, ANKOMST_VINDU_MIN, destinations } from '../src/views/auto.js';
describe('nå · avgang · ankomst (v1.218.136)', () => {
  it('Auto-reise sykler tre, Auto-tavle to', () => {
    expect(['nå', 'avgang', 'ankomst'].map(m => nesteModus(m, false))).toEqual(['avgang', 'ankomst', 'nå']);
    expect(['nå', 'avgang'].map(m => nesteModus(m, true))).toEqual(['avgang', 'nå']);
  });
  it('tidsknappene følger modusen', () => {
    expect(fraKnappTekst('avgang', kl(18, 15), kl(18, 10))).toBe('etter 15:00');
    expect(fraKnappTekst('ankomst', kl(19, 6), kl(18, 10))).toBe('fremme før 06:00 i morgen');
  });
  it('ankomst henter vinduet før fristen', () => {
    expect(hentFraMs('ankomst', kl(18, 15))).toBe(kl(18, 15) - ANKOMST_VINDU_MIN * 60_000);
    expect(hentFraMs('avgang', kl(18, 15))).toBe(kl(18, 15));
  });
  it('fremme før: den SISTE avgangen som er framme innen fristen', () => {
    const t = kl(18, 6);
    const call = (dep, arr) => ({ expectedDepartureTime: new Date(dep).toISOString(), serviceJourney: { id: 'sj' + dep, estimatedCalls: [
      { quay: { stopPlace: { id: 'A', name: 'Her' } }, expectedDepartureTime: new Date(dep).toISOString(), expectedArrivalTime: new Date(dep).toISOString() },
      { quay: { stopPlace: { id: 'M', name: 'Målet', latitude: 59.9, longitude: 10.7 } }, expectedArrivalTime: new Date(arr).toISOString() }] } });
    const m = 60_000, frist = t + 50 * m;
    const d = { frontText: 'X', lines: [{}], call: call(t + 10 * m, t + 30 * m),
      calls: [t + 10 * m, t + 25 * m, t + 40 * m].map(ms => ({ ms, call: call(ms, ms + 20 * m) })) };
    const live = [{ d, i: 0 }];
    const freq = [{ name: 'Målet', stopId: 'M', count: 5 }];
    const før = destinations(live, freq, 0, t, 'Her', null, null, frist);
    expect(før[0].options[0].at).toBe(t + 45 * m);          // 06:25 → 06:45; 06:40 → 07:00 er for sent
    const vanlig = destinations(live, freq, 0, t, 'Her', null, null);
    expect(vanlig[0].options[0].at).toBe(t + 30 * m);
  });
});

describe('kartet følger kortets tur (v1.218.136)', () => {
  it('kartnøkkelen tar med turens id, ikke bare antall stopp', () => {
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/kortLinje\.length \+ ':' \+ \(\(_kortRute\.call && _kortRute\.call\.serviceJourney && _kortRute\.call\.serviceJourney\.id\) \|\| ''\)/);
  });
});

import { fraDagTekst } from '../src/views/auto.js';
import { fraDatoer, settFraDatoTid, settFraDato } from '../src/fraTider.js';
describe('dato i rullehjulene (v1.218.140)', () => {
  it('knappen sier bare klokkeslett i dag, «i morgen» i morgen, ellers ukedag og dato', () => {
    expect(fraTidTekst(kl(18, 15), kl(18, 10))).toBe('etter 15:00');
    expect(fraTidTekst(kl(19, 15), kl(18, 10))).toBe('etter 15:00 i morgen');
    expect(fraTidTekst(kl(21, 15), kl(18, 10))).toBe('etter 15:00 lør 21.11');
    expect(fraDagTekst(kl(18, 23), kl(18, 10))).toBe('');
  });
  it('en fast dato gjelder til den er passert, så klokkeslettet som før', () => {
    expect(fraTid('b', kl(18, 10), ['06:00', '15:00'], [null, kl(21, 15)])).toBe(kl(21, 15));
    expect(fraTid('b', kl(22, 10), ['06:00', '15:00'], [null, kl(21, 15)])).toBe(kl(22, 15));
  });
  it('rullehjulene lagrer dato og tid; innstillingene sletter datoen', () => {
    settFraDatoTid(1, kl(21, 16, 45));
    expect(fraTider()[1]).toBe('16:45');
    expect(fraDatoer()[1]).toBe(kl(21, 16, 45));
    settFraTid(1, '15:00');
    expect(fraDatoer()[1]).toBe(null);
    settFraDato(1, null);
  });
});
