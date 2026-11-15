// «Hvilken dag er det i dag? Hva er klokken? Hvor er bruker? Hva er sannsynlig neste reise? Når?
// I hvilken retning?» — skjermbilde søndag 18:16 på Mortensrud (v1.218.55).
import { describe, it, expect } from 'vitest';
import { avledProfil, slåSammen, vaneMatrise, kontekstNå, kontekstLinje, nesteFraProfil } from '../src/profil.js';

const t = s => new Date(s).getTime();
const MORT = { navn: 'Mortensrud', stopId: 'NSR:StopPlace:5687', lat: 59.8493, lon: 10.8297 };
const HELS = { navn: 'Helsfyr', stopId: 'NSR:StopPlace:6068', lat: 59.9127, lon: 10.8014 };
const JBT = { navn: 'Jernbanetorget', stopId: 'NSR:StopPlace:3990', lat: 59.9122, lon: 10.7511 };
const tur = (a, b, bucket, count, helg = false) => ({ fromName: a.navn, fromStopId: a.stopId, toName: b.navn, toStopId: b.stopId, toLat: b.lat, toLon: b.lon, bucket, isWeekend: helg, count });
const HIST = [tur(MORT, HELS, 3, 18), tur(HELS, MORT, 8, 15), tur(MORT, JBT, 6, 5, true), tur(JBT, MORT, 10, 4, true)];
const P = slåSammen(null, avledProfil(HIST));
const M = vaneMatrise(HIST, P);

describe('konteksten, sagt', () => {
  it('søndag 18:16 hjemme: neste reise i morgen tidlig til jobb, nordvest', () => {
    const nå = t('2026-11-15T18:16:00');
    const k = kontekstNå(nå, MORT, P, M);
    expect(k).toMatchObject({ dag: 'helg', del: 'kveld', sted: 'hjem', neste: null });
    expect(k.senere).toMatchObject({ type: 'hjem-jobb', retning: 'nord' });
    expect(kontekstLinje(k, nå)).toBe('søndag kveld · hjemme · neste reise: i morgen tidlig til jobb (Helsfyr), nord');
  });
  it('mandag 07:30 hjemme: nå til jobb', () => {
    const nå = t('2026-11-16T07:30:00');
    expect(kontekstLinje(kontekstNå(nå, MORT, P, M), nå)).toBe('mandag morgen · hjemme · neste reise: nå til jobb (Helsfyr)');
  });
  it('fredag 18:00 hjemme: ikke «i morgen tidlig til jobb» — i morgen er lørdag', () => {
    const nå = t('2026-11-20T18:00:00');
    const s = kontekstNå(nå, MORT, P, M).senere;
    expect(!s || s.type !== 'hjem-jobb').toBe(true);
    expect(kontekstLinje(kontekstNå(nå, MORT, P, M), nå)).not.toContain('til jobb');
  });
  it('uten profil: ingen linje', () => {
    expect(kontekstLinje(kontekstNå(t('2026-11-15T18:16:00'), MORT, null, {}), t('2026-11-15T18:16:00'))).toBe('');
  });
  it('17. mai (mandag) 07:30: fridag, ikke jobb', () => {
    const nå = t('2027-05-17T07:30:00');
    expect(kontekstLinje(kontekstNå(nå, MORT, P, M), nå)).toMatch(/^mandag \(fridag\) morgen · hjemme/);
    expect(kontekstLinje(kontekstNå(nå, MORT, P, M), nå)).not.toContain('nå til jobb');
  });
});
