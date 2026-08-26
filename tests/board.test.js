import { describe, it, expect, vi } from 'vitest';

// board.js pulls in Leaflet, maps and a lot of sibling views. Stub the heavy
// edges so the pure display helpers can be exercised on their own.
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({ makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn() }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));

import { dedupeDepartures, _headingDeg, _corridorProgress, _legIndices, _buildStrip, _stripSummary, _platformState, _clusterTrains } from '../src/views/board.js';

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

// ── Corridor strip maths ────────────────────────────────────────────────────
const stopCall = (name, mins, base = Date.UTC(2026, 4, 24, 8, 0, 0)) => {
  const t = new Date(base + mins * 60000).toISOString();
  return { quay: { stopPlace: { name } }, aimedArrivalTime: t, expectedArrivalTime: t,
           aimedDepartureTime: t, expectedDepartureTime: t };
};
const BASE = Date.UTC(2026, 4, 24, 8, 0, 0);
// Five stops, two minutes apart, leaving the first at 08:00.
const RUN = ['Vestli', 'Grorud', 'Økern', 'Tøyen', 'Jernbanetorget'].map((n, i) => stopCall(n, i * 2));
const at = (mins) => BASE + mins * 60000;

describe('_corridorProgress', () => {
  it('is null before the run starts and after it ends', () => {
    expect(_corridorProgress(RUN, at(-1))).toBeNull();
    expect(_corridorProgress(RUN, at(9))).toBeNull();
  });

  it('reads whole numbers at stops', () => {
    expect(_corridorProgress(RUN, at(0))).toBe(0);
    expect(_corridorProgress(RUN, at(4))).toBe(2);
    expect(_corridorProgress(RUN, at(8))).toBe(4);
  });

  it('interpolates between stops', () => {
    expect(_corridorProgress(RUN, at(1))).toBeCloseTo(0.5, 5);
    expect(_corridorProgress(RUN, at(5))).toBeCloseTo(2.5, 5);
    expect(_corridorProgress(RUN, at(2.5))).toBeCloseTo(1.25, 5);
  });

  it('rises monotonically across the whole run', () => {
    let prev = -1;
    for (let m = 0; m <= 8; m += 0.25) {
      const p = _corridorProgress(RUN, at(m));
      expect(p).not.toBeNull();
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it('returns null rather than guessing when there is nothing to interpolate', () => {
    expect(_corridorProgress(null, at(1))).toBeNull();
    expect(_corridorProgress([RUN[0]], at(1))).toBeNull();
    expect(_corridorProgress([{ quay: { stopPlace: { name: 'X' } } }, { quay: {} }], at(1))).toBeNull();
  });
});

describe('_legIndices — direction is what keeps foreign trains off the strip', () => {
  it('finds both ends when the journey runs our way', () => {
    expect(_legIndices(RUN, 'Grorud', 'Tøyen')).toEqual({ from: 1, to: 3 });
  });

  it('rejects a journey running the other way rather than mirroring it', () => {
    expect(_legIndices(RUN, 'Tøyen', 'Grorud')).toBeNull();
  });

  it('rejects a journey that does not serve both ends', () => {
    expect(_legIndices(RUN, 'Grorud', 'Majorstuen')).toBeNull();
    expect(_legIndices(RUN, 'Majorstuen', 'Tøyen')).toBeNull();
  });

  it('rejects origin and destination being the same stop', () => {
    expect(_legIndices(RUN, 'Grorud', 'Grorud')).toBeNull();
  });

  it('matches loosely enough for the "T" suffix and case Entur returns', () => {
    expect(_legIndices(RUN, 'grorud', 'JERNBANETORGET')).toEqual({ from: 1, to: 4 });
    expect(_legIndices(RUN, 'Grorud T', 'Tøyen')).toEqual({ from: 1, to: 3 });
  });

  it('is null with missing arguments', () => {
    expect(_legIndices(RUN, null, 'Tøyen')).toBeNull();
    expect(_legIndices(null, 'Grorud', 'Tøyen')).toBeNull();
  });
});

describe('_buildStrip', () => {
  const LINE = { id: 'RUT:Line:5', publicCode: '5', presentation: { colour: 'f5a000' } };
  const DIR = { from: 'Grorud', to: 'Jernbanetorget' };
  // RUN: Vestli(0) Grorud(2) Økern(4) Tøyen(6) Jernbanetorget(8), in minutes.
  const dep = (offsetMin, id, frontText) => {
    const calls = RUN.map(c => {
      const t = new Date(new Date(c.aimedArrivalTime).getTime() + offsetMin * 60000).toISOString();
      return { ...c, aimedArrivalTime: t, expectedArrivalTime: t,
               aimedDepartureTime: t, expectedDepartureTime: t };
    });
    return {
      expectedDepartureTime: calls[1].expectedDepartureTime,   // leaves Grorud
      destinationDisplay: { frontText: frontText || 'Jernbanetorget' },
      serviceJourney: { id, line: LINE, estimatedCalls: calls },
    };
  };
  // now = 08:10. A run offset by +N has its Grorud departure at 08:02+N.
  const NOW = at(10);

  it('places the origin at 0 and lists stops from origin to destination', () => {
    const s = _buildStrip([dep(10, 'a')], [], DIR, '5', NOW, new Map());
    expect(s.stops).toEqual(['Grorud', 'Økern', 'Tøyen', 'Jernbanetorget']);
    expect(s.from).toBe('Grorud');
    expect(s.to).toBe('Jernbanetorget');
  });

  it('gives approaching trains the same countdown the list row shows', () => {
    // Grorud departure at 08:02+10 = 08:12, i.e. 2 minutes after NOW.
    const s = _buildStrip([dep(10, 'a')], [], DIR, '5', NOW, new Map());
    const t = s.trains.find(x => x.approaching);
    expect(t.mins).toBe(2);
  });

  it('truncates like the list does, not rounds', () => {
    // 2 min 40 s away. The list floors this to 2; rounding would print 3 and
    // the strip would contradict the row sitting directly beneath it.
    const d = dep(10, 'a');
    const shifted = new Date(new Date(d.expectedDepartureTime).getTime() + 40000).toISOString();
    d.expectedDepartureTime = shifted;
    const s = _buildStrip([d], [], DIR, '5', NOW, new Map());
    expect(s.trains.find(t => t.approaching).mins).toBe(2);
  });

  it('orders approaching trains by countdown, furthest back first', () => {
    const s = _buildStrip([dep(10, 'a'), dep(24, 'b'), dep(17, 'c')], [], DIR, '5', NOW, new Map());
    const appr = s.trains.filter(t => t.approaching);
    expect(appr.map(t => t.mins)).toEqual([16, 9, 2]);
    // Strictly increasing position, so none can stack on top of another.
    for (let i = 1; i < appr.length; i++) expect(appr[i].pos).toBeGreaterThan(appr[i - 1].pos);
  });

  it('puts a train that already left ahead of you, with no countdown', () => {
    // Offset +4 puts its Grorud departure at 08:06 and its arrival at 08:12,
    // so at 08:10 it is on the stretch, four minutes in front.
    const s = _buildStrip([], [dep(4, 'past')], DIR, '5', NOW, new Map());
    const t = s.trains[0];
    expect(t.approaching).toBe(false);
    expect(t.mins).toBeNull();
    expect(t.pos).toBeGreaterThan(0);
  });

  it('drops a train running the opposite direction', () => {
    const backwards = dep(4, 'wrong');
    backwards.serviceJourney.estimatedCalls = backwards.serviceJourney.estimatedCalls.slice().reverse();
    expect(_buildStrip([], [backwards], DIR, '5', NOW, new Map()).trains).toHaveLength(0);
  });

  it('drops a train already past your destination, though still running', () => {
    // Alighting at Økern (08:08) while the train is at Tøyen (08:10): gone.
    const shortHop = { from: 'Grorud', to: 'Økern' };
    expect(_buildStrip([], [dep(4, 'gone')], shortHop, '5', NOW, new Map()).trains).toHaveLength(0);
  });

  it('ignores other lines', () => {
    const other = dep(10, 'x');
    other.serviceJourney.line = { id: 'RUT:Line:2', publicCode: '2' };
    expect(_buildStrip([other], [], DIR, '5', NOW, new Map()).trains).toHaveLength(0);
  });

  it('never lists the same journey twice', () => {
    const d = dep(10, 'same');
    expect(_buildStrip([d, d], [d], DIR, '5', NOW, new Map()).trains).toHaveLength(1);
  });

  it('still works with no in-flight data at all', () => {
    const s = _buildStrip([dep(10, 'a')], [], DIR, '5', NOW, new Map());
    expect(s.trains).toHaveLength(1);
    expect(s.stops.length).toBeGreaterThan(1);
  });

  it('returns nothing usable when no journey serves both ends', () => {
    const s = _buildStrip([dep(10, 'a')], [], { from: 'Majorstuen', to: 'Ryen' }, '5', NOW, new Map());
    expect(s.stops).toEqual([]);
    expect(s.trains).toEqual([]);
  });
});

describe('_stripSummary', () => {
  const t = (approaching) => ({ approaching });
  const D = (trains) => ({ trains, from: 'Økern', to: 'Jernbanetorget' });

  it('names both halves when both have trains', () => {
    expect(_stripSummary(D([t(true), t(true), t(true), t(false), t(false)])))
      .toBe('3 tog på vei til Økern, 2 tog foran deg mot Jernbanetorget');
  });

  it('omits a half that is empty rather than saying zero', () => {
    expect(_stripSummary(D([t(true), t(true)]))).toBe('2 tog på vei til Økern');
    expect(_stripSummary(D([t(false)]))).toBe('1 tog foran deg mot Jernbanetorget');
  });

  it('keeps "tog" invariant, which is how the plural actually works', () => {
    expect(_stripSummary(D([t(true)]))).toContain('1 tog på vei');
    expect(_stripSummary(D([t(true), t(true)]))).toContain('2 tog på vei');
  });

  it('says so plainly when there is nothing to show', () => {
    expect(_stripSummary(D([]))).toBe('Ingen tog på strekningen nå');
    expect(_stripSummary(null)).toBe('Ingen tog på strekningen nå');
  });

  it('falls back to generic wording when the stops are unknown', () => {
    expect(_stripSummary({ trains: [t(true), t(false)] }))
      .toBe('1 tog på vei til stoppet ditt, 1 tog foran deg mot destinasjonen');
  });
});

describe('_platformState — three-valued, because "unknown" is not "no"', () => {
  const LL = { lat: 59.9139, lon: 10.7522 };
  const near = { lat: 59.9141, lon: 10.7524 };     // ~28 m away
  const far = { lat: 59.9180, lon: 10.7600 };      // ~600 m away

  it('is "at" when the operator says it arrived and not that it left', () => {
    expect(_platformState({ actualArrivalTime: '2026-05-24T08:00:00Z' }, null, LL)).toBe('at');
  });

  it('is "gone" once an actual departure is reported', () => {
    expect(_platformState({ actualArrivalTime: '2026-05-24T08:00:00Z',
                            actualDepartureTime: '2026-05-24T08:00:30Z' }, null, LL)).toBe('gone');
  });

  it('trusts an actual departure even with no arrival reported', () => {
    expect(_platformState({ actualDepartureTime: '2026-05-24T08:00:30Z' }, null, LL)).toBe('gone');
  });

  it('falls back to a measured position at the stop', () => {
    expect(_platformState({}, near, LL)).toBe('at');
  });

  it('never says "gone" from position alone — far away may mean not yet here', () => {
    expect(_platformState({}, far, LL)).toBeNull();
  });

  it('prefers the operator over the position when they disagree', () => {
    expect(_platformState({ actualDepartureTime: '2026-05-24T08:00:30Z' }, near, LL)).toBe('gone');
  });

  it('is null when nothing can establish it, so the caller says nothing', () => {
    expect(_platformState({}, null, LL)).toBeNull();
    expect(_platformState({ expectedDepartureTime: '2026-05-24T08:00:00Z' }, null, LL)).toBeNull();
    expect(_platformState({}, near, null)).toBeNull();
    expect(_platformState(null, near, LL)).toBeNull();
  });
});

describe('_clusterTrains', () => {
  const T = (pos, mins) => ({ pos, mins });

  it('leaves well-separated trains alone', () => {
    const c = _clusterTrains([T(0), T(2), T(4)], 1);
    expect(c).toHaveLength(3);
    expect(c.every(x => x.items.length === 1)).toBe(true);
  });

  it('absorbs anything closer than the separation into the running cluster', () => {
    const c = _clusterTrains([T(0), T(0.3), T(0.6), T(5)], 1);
    expect(c).toHaveLength(2);
    expect(c[0].items).toHaveLength(3);
    expect(c[1].items).toHaveLength(1);
  });

  it('anchors on the first member, so the caller picks which end survives', () => {
    // Soonest-first is how the strip calls it: the countdown kept is the one
    // still worth acting on.
    const c = _clusterTrains([T(-1, 2), T(-1.3, 5), T(-1.6, 8)], 1);
    expect(c).toHaveLength(1);
    expect(c[0].pos).toBe(-1);
    expect(c[0].items[0].mins).toBe(2);
  });

  it('never loses a train', () => {
    const trains = Array.from({ length: 12 }, (_, i) => T(i * 0.2, i));
    const c = _clusterTrains(trains, 1);
    expect(c.reduce((n, x) => n + x.items.length, 0)).toBe(12);
  });

  it('measures distance both ways, so order of sign does not matter', () => {
    expect(_clusterTrains([T(2), T(1.5)], 1)).toHaveLength(1);
    expect(_clusterTrains([T(1.5), T(2)], 1)).toHaveLength(1);
  });

  it('does nothing with a separation of zero, and copes with an empty list', () => {
    expect(_clusterTrains([T(0), T(0.1)], 0)).toHaveLength(2);
    expect(_clusterTrains([], 1)).toEqual([]);
    expect(_clusterTrains(null, 1)).toEqual([]);
  });
});
