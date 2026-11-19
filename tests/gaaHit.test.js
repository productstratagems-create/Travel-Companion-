// v1.218.143: «gå hit for å komme dit» — rett holdeplass for rett mål.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gåHitFor, annetStopp, trengerNyttSøk, gåHitMål, GÅHIT_ALDER_MS } from '../src/gaaHit.js';

const T = Date.UTC(2026, 10, 20, 7, 0);
const iso = m => new Date(T + m * 60_000).toISOString();
const gå = (a, b, len) => ({ mode: 'foot', expectedStartTime: iso(a), expectedEndTime: iso(b), pointsOnLink: { length: len } });
const kol = (a, b, stopp, spor, linje) => ({ mode: 'bus', expectedStartTime: iso(a), expectedEndTime: iso(b),
  fromPlace: { name: stopp, latitude: 59.91, longitude: 10.75, quay: { stopPlace: { id: 'NSR:StopPlace:' + stopp } } },
  fromEstimatedCall: { quay: { publicCode: spor }, destinationDisplay: { frontText: 'Bjørvika' } },
  serviceJourney: { line: { publicCode: linje } } });

describe('gåHitFor', () => {
  it('første kollektivetappe gir stopp, spor, linje; gangen dit gir minutter og meter', () => {
    const r = gåHitFor([{ legs: [gå(0, 6, 420), kol(8, 20, 'Stortorvet', 'C', '37'), gå(20, 23, 150)] }], T);
    expect(r.stoppNavn).toBe('Stortorvet');
    expect(r.stoppId).toBe('NSR:StopPlace:Stortorvet');
    expect(r.spor).toBe('C');
    expect(r.linje).toBe('37');
    expect(r.gangMin).toBe(6);
    expect(r.gangM).toBe(420);
    expect(r.framme).toBe(T + 23 * 60_000);
  });
  it('å gå hele veien er ikke et råd om holdeplass', () => {
    expect(gåHitFor([{ legs: [gå(0, 15, 1200)] }], T)).toBe(null);
  });
});

describe('kortet vises bare for et ANNET stopp enn de du ser', () => {
  const råd = { stoppId: 'NSR:StopPlace:Stortorvet' };
  // FØR-BILDET: du står ved Jernbanetorget; målet betjenes ikke derfra.
  it('Stortorvet når du ser Jernbanetorget og naboene: kort', () => {
    expect(annetStopp(råd, ['NSR:StopPlace:Jernbanetorget', 'NSR:StopPlace:Oslo S'])).toBe(true);
  });
  it('rådet er et stopp i knutepunktet: ingen ekstra kort', () => {
    expect(annetStopp(råd, ['NSR:StopPlace:Jernbanetorget', 'NSR:StopPlace:Stortorvet'])).toBe(false);
  });
  it('skjermen sammenligner med hele knutepunktet, ikke bare stoppet', () => {
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/const nærIds = _stop \? knutepunkt\(_stop, _stops\(\)\)\.map\(s => s\.id\) : \[\];/);
  });
});

describe('søket gjentas med måte', () => {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  it('nytt ved flytting over 100 m eller etter 2 min, ellers ikke', () => {
    const f = { pos: { x: 0, y: 0 }, at: T };
    expect(trengerNyttSøk(f, { x: 50, y: 0 }, T + 1000, d)).toBe(false);
    expect(trengerNyttSøk(f, { x: 150, y: 0 }, T + 1000, d)).toBe(true);
    expect(trengerNyttSøk(f, { x: 0, y: 0 }, T + GÅHIT_ALDER_MS + 1, d)).toBe(true);
  });
  it('de to mest brukte målene med kjent stopp', () => {
    expect(gåHitMål([{ name: 'A', stopId: 'a', count: 1 }, { name: 'B', stopId: 'b', count: 9 }, { name: 'C', count: 20 }, { name: 'D', stopId: 'd', count: 5 }])
      .map(m => m.name)).toEqual(['B', 'D']);
  });
});
