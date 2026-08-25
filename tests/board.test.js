import { describe, it, expect, vi } from 'vitest';

// board.js pulls in Leaflet, maps and a lot of sibling views. Stub the heavy
// edges so the pure display helpers can be exercised on their own.
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({ makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn() }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));

import { dedupeDepartures, _headingDeg } from '../src/views/board.js';

const iso = (hh, mm, ss) => `2026-05-24T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}+02:00`;

// A trip-planner result: has _legs, so it takes the per-minute bucket path.
const trip = (depIso, arrIso, id) => ({
  expectedDepartureTime: depIso,
  _finalArrival: arrIso,
  _legs: [{ mode: 'metro', serviceJourney: { id } }],
  serviceJourney: { id },
});

// A departure-board result: no _legs.
const boardDep = (depIso, id) => ({
  expectedDepartureTime: depIso,
  serviceJourney: { id, line: { publicCode: '3', transportMode: 'metro' } },
});

const depTimes = rows => rows.map(r => r.c.expectedDepartureTime);
const ids = rows => rows.map(r => (r.c.serviceJourney || {}).id);

describe('dedupeDepartures — trip-planner results', () => {
  it('keeps the EARLIEST departure when two share a minute, even if the later one arrives sooner', () => {
    // The regression: ranking by arrival let 10:05:55 evict 10:05:05.
    const out = dedupeDepartures([
      trip(iso(10, 5, 5),  iso(10, 40, 0), 'slow-but-first'),
      trip(iso(10, 5, 55), iso(10, 30, 0), 'fast-but-later'),
    ]);
    expect(out).toHaveLength(1);
    expect(ids(out)).toEqual(['slow-but-first']);
  });

  it('breaks a true tie (identical departure instant) by earliest arrival', () => {
    const out = dedupeDepartures([
      trip(iso(10, 5, 0), iso(10, 40, 0), 'slower'),
      trip(iso(10, 5, 0), iso(10, 30, 0), 'faster'),
    ]);
    expect(out).toHaveLength(1);
    expect(ids(out)).toEqual(['faster']);
  });

  it('keeps departures that fall in different minutes', () => {
    const out = dedupeDepartures([
      trip(iso(10, 5, 30), iso(10, 40, 0), 'a'),
      trip(iso(10, 6, 30), iso(10, 41, 0), 'b'),
      trip(iso(10, 7, 30), iso(10, 42, 0), 'c'),
    ]);
    expect(ids(out)).toEqual(['a', 'b', 'c']);
  });

  it('returns rows sorted ascending by departure time regardless of input order', () => {
    const out = dedupeDepartures([
      trip(iso(10, 9, 0), iso(10, 45, 0), 'c'),
      trip(iso(10, 5, 0), iso(10, 40, 0), 'a'),
      trip(iso(10, 7, 0), iso(10, 42, 0), 'b'),
    ]);
    expect(ids(out)).toEqual(['a', 'b', 'c']);
  });

  it('does not drop an early departure that has no known arrival time', () => {
    const out = dedupeDepartures([
      { expectedDepartureTime: iso(10, 5, 5), _finalArrival: null, _legs: [{ mode: 'metro' }], serviceJourney: { id: 'no-arrival' } },
      trip(iso(10, 5, 55), iso(10, 30, 0), 'later-with-arrival'),
    ]);
    expect(ids(out)).toEqual(['no-arrival']);
  });
});

describe('dedupeDepartures — departure-board results', () => {
  it('keeps distinct services that share a departure minute', () => {
    const out = dedupeDepartures([
      boardDep(iso(10, 5, 0), 'metro-3'),
      boardDep(iso(10, 5, 0), 'bus-37'),
    ]);
    expect(out).toHaveLength(2);
    expect(ids(out).sort()).toEqual(['bus-37', 'metro-3']);
  });

  it('merges exact duplicates of the same service journey', () => {
    const out = dedupeDepartures([
      boardDep(iso(10, 5, 0), 'metro-3'),
      boardDep(iso(10, 5, 0), 'metro-3'),
    ]);
    expect(out).toHaveLength(1);
  });

  it('keeps entries with no serviceJourney id distinct via their original index', () => {
    const out = dedupeDepartures([
      { expectedDepartureTime: iso(10, 5, 0) },
      { expectedDepartureTime: iso(10, 5, 0) },
    ]);
    expect(out).toHaveLength(2);
  });
});

describe('dedupeDepartures — edge cases', () => {
  it('handles an empty list', () => {
    expect(dedupeDepartures([])).toEqual([]);
  });

  it('handles null/undefined input', () => {
    expect(dedupeDepartures(null)).toEqual([]);
    expect(dedupeDepartures(undefined)).toEqual([]);
  });

  it('preserves the original index so callers can build stable row keys', () => {
    const out = dedupeDepartures([trip(iso(10, 5, 0), iso(10, 40, 0), 'a')]);
    expect(out[0]).toHaveProperty('origIdx', 0);
  });

  it('exposes departure times unmodified', () => {
    const out = dedupeDepartures([trip(iso(10, 5, 0), iso(10, 40, 0), 'a')]);
    expect(depTimes(out)).toEqual([iso(10, 5, 0)]);
  });
});

// ── Vehicle heading ─────────────────────────────────────────────────────────
// Pure, and wrong in a way that still looks plausible on a map if the
// longitude scaling is skipped — so it is worth pinning down numerically.
describe('_headingDeg', () => {
  const OSLO = 59.91;

  it('reads compass degrees clockwise from north', () => {
    expect(_headingDeg(OSLO, 10.75, OSLO + 0.01, 10.75)).toBeCloseTo(0, 5);    // north
    expect(_headingDeg(OSLO, 10.75, OSLO, 10.76)).toBeCloseTo(90, 5);          // east
    expect(_headingDeg(OSLO, 10.75, OSLO - 0.01, 10.75)).toBeCloseTo(180, 5);  // south
    expect(_headingDeg(OSLO, 10.75, OSLO, 10.74)).toBeCloseTo(270, 5);         // west
  });

  it('scales longitude by cos(lat) — the bug a screenshot would never show', () => {
    // Equal degree steps north and east. A degree of longitude is about half a
    // degree of latitude this far north, so the true bearing is well under 45.
    const h = _headingDeg(OSLO, 10.75, OSLO + 0.01, 10.76);
    expect(h).toBeGreaterThan(20);
    expect(h).toBeLessThan(30);
    // Without the cos(lat) term this would come out at exactly 45.
    expect(Math.abs(h - 45)).toBeGreaterThan(15);
  });

  it('is null for two identical points, so the symbol stays unrotated', () => {
    expect(_headingDeg(OSLO, 10.75, OSLO, 10.75)).toBeNull();
  });

  it('never returns a negative angle', () => {
    for (const [dLat, dLon] of [[1, -1], [-1, -1], [-1, 1], [1, 1], [0, -1], [-1, 0]]) {
      const h = _headingDeg(OSLO, 10.75, OSLO + dLat * 0.01, 10.75 + dLon * 0.01);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });
});
