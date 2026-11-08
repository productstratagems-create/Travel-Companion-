// Tavla later som bussen går fra Olasrudveien.
// Rapportert med skjermbilde: «Olasrudveien er ikke en holdeplass på denne ruten, men appen later
// som om den er det.» Ekte svar (2026-11-08): Olasrudveien har bare 73X; reisen er gange 429 m
// til Mortensrud, så 74 fra spor E.
import { describe, it, expect, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} })); vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
import { readFileSync } from 'node:fs';
import { adaptTripPattern } from '../src/api/adapt.js';

const OLASRUD = {
  duration: 2520,
  legs: [
    { mode: 'foot', distance: 429.03, expectedStartTime: '2026-11-08T22:42:07+01:00', expectedEndTime: '2026-11-08T22:48:00+01:00',
      fromPlace: { name: 'Olasrudveien' }, toPlace: { name: 'Mortensrud' } },
    { mode: 'bus', expectedStartTime: '2026-11-08T22:49:00+01:00', expectedEndTime: '2026-11-08T23:24:00+01:00',
      fromPlace: { name: 'Mortensrud' }, toPlace: { name: 'Jernbanetorget' },
      fromEstimatedCall: { expectedDepartureTime: '2026-11-08T22:49:00+01:00', aimedDepartureTime: '2026-11-08T22:49:00+01:00', realtime: false, quay: { publicCode: 'E' }, destinationDisplay: { frontText: 'Jernbanetorget' } },
      toEstimatedCall: { expectedArrivalTime: '2026-11-08T23:24:00+01:00' },
      serviceJourney: { id: 'RUT:ServiceJourney:x', line: { id: 'RUT:Line:74', publicCode: '74' } } },
  ],
};
const FRA_STOPPET = { ...OLASRUD, legs: [OLASRUD.legs[1]] };

describe('adapteren tar vare på gangen i starten', () => {
  it('Olasrudveien → gå til Mortensrud', () => {
    const c = adaptTripPattern(OLASRUD);
    expect(c._gåTil).toEqual({ navn: 'Mortensrud', min: 6, startTid: '2026-11-08T22:42:07+01:00' });
    expect(c.quay.publicCode).toBe('E');          // fortsatt Mortensruds spor — nå sagt hvor
    expect(c.expectedDepartureTime).toBe('2026-11-08T22:49:00+01:00');
  });
  it('reisen starter på stoppet: null', () => {
    expect(adaptTripPattern(FRA_STOPPET)._gåTil).toBe(null);
  });
});

describe('Tavla', () => {
  const b = readFileSync('src/views/board.js', 'utf8');
  it('én definisjon av når du må gå', () => {
    expect(b).toContain('export { påstigningTs };');  // bor i api/adapt.js fra v1.218.17
    expect(b).toContain('const mtl = walkActive ? mToLeave(påstigningTs(c)) : null;');
  });
  it('raden sier «gå N min til X», og sporet sier hvor', () => {
    expect(b).toContain("(gåTilTekst(c) ? '<div class=\"dep-gaa\">' + esc(gåTilTekst(c)) + '</div>' : '')");
    expect(b).not.toContain('dep-tag-gaa');  // som tagg presset den destinasjonen ut
    expect(b).toMatch(/spor ' \+ esc\(quay\) \+ ' på ' \+ esc\(c\._gåTil\.navn\)/);
  });
});

describe('påstigningTs — når du må gå', async () => {
  const { påstigningTs } = await import('../src/views/board.js');
  it('med gange først: fotetappens start, ikke bussens avgang', () => {
    expect(påstigningTs(adaptTripPattern(OLASRUD))).toBe(new Date('2026-11-08T22:42:07+01:00').getTime());
  });
  it('uten: avgangen', () => {
    expect(påstigningTs(adaptTripPattern(FRA_STOPPET))).toBe(new Date('2026-11-08T22:49:00+01:00').getTime());
  });
});
