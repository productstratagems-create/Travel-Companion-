/**
 * Express coaches.
 *
 * Asked for: "Finn og integrer busstilbud som kjører mellom riksvei 37 og
 * Oslo." The services were never missing from the screen — they were never
 * requested. Transmodel separates `coach` from `bus`, and the app asked for
 * exactly four modes:
 *
 *   tripGQL   transportModes:[metro, bus, tram, rail]
 *   boardGQL  whiteListedModes:[metro,tram,bus,rail]
 *
 * Zero occurrences of 'coach' in src/. So every express service in Norway —
 * Haukeliekspressen, the Telemark and Vy expresses, the Rv 37 corridor the
 * question is about — was invisible, and no filter could bring it back.
 */
import { describe, it, expect } from 'vitest';
import { normMode, COACH } from '../src/api/stopCats.js';
import { tripGQL, TRIP_SEARCH_WINDOW } from '../src/api/queries.js';
import { adaptTripPattern } from '../src/api/adapt.js';
import { dirRank, RANKS } from '../src/views/auto.js';

describe('normMode', () => {
  // Normalised at the door rather than compared for in a dozen places:
  // `mode === 'bus'` appears eleven times across board.js, track.js and
  // auto.js, and every one means "a bus" the way a person means it.
  it('calls a coach a bus', () => {
    expect(normMode(COACH)).toBe('bus');
  });

  it('leaves every other mode exactly as it was', () => {
    ['bus', 'metro', 'tram', 'rail', 'foot', 'water', null, undefined]
      .forEach(m => expect(normMode(m)).toBe(m));
  });
});

describe('a coach leg becomes a bus leg', () => {
  const leg = (mode, over = {}) => ({
    mode,
    aimedStartTime: '2026-09-06T10:00:00+02:00',
    expectedStartTime: '2026-09-06T10:00:00+02:00',
    aimedEndTime: '2026-09-06T13:00:00+02:00',
    expectedEndTime: '2026-09-06T13:00:00+02:00',
    fromPlace: { name: 'Oslo bussterminal', quay: { id: 'NSR:Quay:1' } },
    toPlace: { name: 'Rjukan', quay: { id: 'NSR:Quay:2' } },
    line: { id: 'VYX:Line:NW180', publicCode: 'NW180', presentation: { colour: 'e5006d' } },
    serviceJourney: { id: 'VYX:ServiceJourney:1' },
    ...over,
  });

  it('is a bus everywhere downstream', () => {
    const out = adaptTripPattern({
      duration: 10800, legs: [leg('coach')],
      aimedStartTime: '2026-09-06T10:00:00+02:00',
      expectedStartTime: '2026-09-06T10:00:00+02:00',
    });
    expect(out).toBeTruthy();
    expect(out._legs[0].mode).toBe('bus');
    expect(out._allLegs[0].mode).toBe('bus');
  });

  it('does not touch the response it was handed', () => {
    const legs = [leg('coach')];
    adaptTripPattern({ duration: 1, legs,
      aimedStartTime: '2026-09-06T10:00:00+02:00',
      expectedStartTime: '2026-09-06T10:00:00+02:00' });
    expect(legs[0].mode).toBe('coach');
  });
});

describe('where a coach ranks on auto-reise', () => {
  const row = (mode, lineId) => ({ call: { serviceJourney: { line: {
    id: lineId, transportMode: mode, publicCode: 'NW180' } } } });
  const rankOf = (key) => RANKS.findIndex(r => r.key === key);

  // Not a Ruter bus, which is exactly what it is: "andre busser".
  it('ranks with the other buses, not as unknown', () => {
    expect(dirRank(row('coach', 'VYX:Line:NW180'))).toBe(rankOf('annenbuss'));
    expect(dirRank(row('coach', 'VYX:Line:NW180'))).not.toBe(rankOf('ukjent'));
  });

  it('does not become a Ruter bus on a RUT codespace', () => {
    // Hypothetical, but the rule should be the same one either way.
    expect(dirRank(row('coach', 'RUT:Line:1'))).toBe(rankOf('rutebuss'));
  });
});

// ── The search window ────────────────────────────────────────────────────
//
// Measured on a real screen: Mortensrud→Stortinget returned 6/6 trip
// patterns while Storaas Gjestegård→Jernbanetorget returned 0/0 in the same
// minute, with no error. OTP2 sizes its window from local frequency when none
// is given — generous in Oslo, and able to close before the next departure on
// a stop with two services a day.
describe('tripGQL and the search window', () => {
  const q = (window) => tripGQL('NSR:1', 'NSR:2', null, 12, 1.3, Date.now(), false, false, false, window);

  it('is opt-in, like every argument that cannot be checked from here', () => {
    expect(q(false)).not.toContain('searchWindow');
    expect(q(true)).toContain('searchWindow:' + TRIP_SEARCH_WINDOW);
  });

  // The number is chosen for a unit I cannot check: Entur documents minutes,
  // OTP2's other API counts seconds. 43200 is twelve hours under one reading
  // and thirty days under the other — which OTP clamps rather than honours.
  // A middling number would have been twelve MINUTES under one reading, which
  // is shorter than the default it replaces.
  it('is a value that survives either unit', () => {
    expect(TRIP_SEARCH_WINDOW).toBe(43200);
    expect(TRIP_SEARCH_WINDOW / 60).toBeGreaterThanOrEqual(12 * 60);   // ok as seconds
    expect(TRIP_SEARCH_WINDOW).toBeGreaterThan(24 * 60);               // clamped as minutes
  });
});
