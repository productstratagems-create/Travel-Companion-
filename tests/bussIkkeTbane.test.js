import { describe, it, expect } from 'vitest';
import { legsFromTrip } from '../src/journey.js';

const dir = { from: 'Mortensrud', to: 'Helsfyr' };
const bussavgang = {
  expectedDepartureTime: '2026-11-18T08:00:00+01:00', quay: { publicCode: 'B' },
  destinationDisplay: { frontText: 'Helsfyr' },
  serviceJourney: { id: 'SJ-bus', line: { id: 'RUT:Line:74', publicCode: '74', transportMode: 'bus', presentation: { colour: 'E60000' } },
    estimatedCalls: [] },
};

describe('en valgt bussavgang blir ikke T-bane (v1.218.93)', () => {
  // Rapportert: «Buss til Helsfyr ser ut til å bli til t-bane til Helsfyr.»
  it('transportmiddelet kommer fra avgangen, ikke en fast verdi', () => {
    expect(legsFromTrip(bussavgang, dir)[0].mode).toBe('bus');
  });
  it('trikk og tog likeså', () => {
    const tog = { ...bussavgang, serviceJourney: { ...bussavgang.serviceJourney, line: { ...bussavgang.serviceJourney.line, transportMode: 'rail' } } };
    expect(legsFromTrip(tog, dir)[0].mode).toBe('rail');
  });
  it('ukjent transportmiddel: sier ikke T-bane', () => {
    const ukjent = { ...bussavgang, serviceJourney: { ...bussavgang.serviceJourney, line: { id: 'x', publicCode: '74' } } };
    expect(legsFromTrip(ukjent, dir)[0].mode).not.toBe('metro');
  });
});
