import { describe, it, expect, vi } from 'vitest';

// board.js pulls in Leaflet, maps and a lot of sibling views. Stub the heavy
// edges so the pure display helpers can be exercised on their own.
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({ makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn() }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));

import { dedupeDepartures, _headingDeg, _buildStrip, _stripSummary,
  _platformState, _clusterTrains, _spreadCluster, _relaxPositions,
  _approachingVehicles, APPROACH_WINDOW_MS, _widenLo, _stopsReadable, _toggleLine, _legCorridorStops, _journeyModesAllowed, _scrollRowIntoList, _corridorStyle, _interpolateVehiclePos, _interpolateOnPath,
  _nextPageAt, _mergePage, MAX_ROWS } from '../src/views/board.js';
import { measurePath } from '../src/ui/path.js';
import { haver } from '../src/geo.js';

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

// Two patterns for the SAME boarding: the trip planner returns one per way of
// walking away at the far end, so they share a service journey and differ only
// in arrival. These are what dedupe exists to collapse.
const variant = (dep, arr, id, tag) => ({
  expectedDepartureTime: dep,
  _finalArrival: arr,
  _legs: [{ mode: 'metro', serviceJourney: { id } }],
  serviceJourney: { id },
  _tag: tag,
});
const tags = rows => rows.map(r => r.c._tag);

describe('dedupeDepartures — trip-planner results', () => {
  it('keeps the EARLIEST departure among variants of one journey, even if the later one arrives sooner', () => {
    // The regression: ranking by arrival let 10:05:55 evict 10:05:05.
    const out = dedupeDepartures([
      variant(iso(10, 5, 5),  iso(10, 40, 0), 'SJ:1', 'slow-but-first'),
      variant(iso(10, 5, 55), iso(10, 30, 0), 'SJ:1', 'fast-but-later'),
    ]);
    expect(out).toHaveLength(1);
    expect(tags(out)).toEqual(['slow-but-first']);
  });

  it('breaks a true tie (identical departure instant) by earliest arrival', () => {
    const out = dedupeDepartures([
      variant(iso(10, 5, 0), iso(10, 40, 0), 'SJ:1', 'slower'),
      variant(iso(10, 5, 0), iso(10, 30, 0), 'SJ:1', 'faster'),
    ]);
    expect(out).toHaveLength(1);
    expect(tags(out)).toEqual(['faster']);
  });

  // The reported bug, and the reason the key is an identity rather than a
  // clock minute: on a shared trunk two lines leave seconds apart, and the
  // minute bucket deleted one of them — usually the reader's next departure.
  it('keeps two DIFFERENT journeys that leave within the same minute', () => {
    const out = dedupeDepartures([
      trip(iso(10, 5, 5),  iso(10, 40, 0), 'SJ:line-3'),
      trip(iso(10, 5, 50), iso(10, 30, 0), 'SJ:line-2'),
    ]);
    expect(ids(out)).toEqual(['SJ:line-3', 'SJ:line-2']);
  });

  // Without an id there is no identity to key on, so the old minute bucket
  // still guards against a minute full of variations of one trip.
  it('falls back to the departure minute when the journey has no id', () => {
    const noId = (dep, arr) => ({
      expectedDepartureTime: dep, _finalArrival: arr,
      _legs: [{ mode: 'metro' }], serviceJourney: {},
    });
    const out = dedupeDepartures([noId(iso(10, 5, 5), iso(10, 40, 0)), noId(iso(10, 5, 55), iso(10, 30, 0))]);
    expect(out).toHaveLength(1);
    expect(depTimes(out)).toEqual([iso(10, 5, 5)]);
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
      { expectedDepartureTime: iso(10, 5, 5), _finalArrival: null, _legs: [{ mode: 'metro' }], serviceJourney: { id: 'SJ:1' } },
      variant(iso(10, 5, 55), iso(10, 30, 0), 'SJ:1', 'later-with-arrival'),
    ]);
    expect(ids(out)).toEqual(['SJ:1']);
    expect(depTimes(out)).toEqual([iso(10, 5, 5)]);
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

describe('_spreadCluster — opening a cluster has to separate its members', () => {
  const T = (pos, mins) => ({ pos, mins });

  it('spreads members a full separation apart', () => {
    const out = _spreadCluster([T(-1, 6), T(-1.1, 12), T(-1.2, 18)], 1);
    const gaps = out.slice(1).map((x, i) => x.pos - out[i].pos);
    gaps.forEach(g => expect(g).toBeCloseTo(1, 6));
  });

  it('keeps the group centred where the cluster sat', () => {
    const items = [T(-2, 6), T(-2.2, 12)];
    const mid = (items[0].pos + items[1].pos) / 2;
    const out = _spreadCluster(items, 1);
    expect((out[0].pos + out[1].pos) / 2).toBeCloseTo(mid, 6);
  });

  it('lays members out in axis order, not the order it was handed them', () => {
    // Clustering anchors soonest-first, so items arrive as 6, 12, 18 while
    // their positions run the other way. Spreading in that order put the
    // soonest departure left of a later one — backwards on an axis where time
    // decreases towards your stop.
    const items = [T(-1, 6), T(-1.1, 12), T(-1.2, 18)];
    const out = _spreadCluster(items, 1);
    expect(out.map(x => x.item.mins)).toEqual([18, 12, 6]);
    for (let i = 1; i < out.length; i++) expect(out[i].pos).toBeGreaterThan(out[i - 1].pos);
  });

  it('leaves a lone train exactly where it is', () => {
    expect(_spreadCluster([T(-3, 9)], 1)).toEqual([{ pos: -3, item: { pos: -3, mins: 9 } }]);
  });

  it('copes with an empty cluster', () => {
    expect(_spreadCluster([], 1)).toEqual([]);
  });

  it('never loses a member', () => {
    const items = Array.from({ length: 5 }, (_, i) => T(-1 - i * 0.05, i));
    expect(_spreadCluster(items, 1)).toHaveLength(5);
  });
});

describe('_relaxPositions — an overlapping glyph swallows the taps beneath it', () => {
  const G = (pos) => ({ pos });

  it('pushes apart anything closer than the separation', () => {
    const out = _relaxPositions([G(0), G(0.2), G(0.3)], 1, -10, 10);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].pos - out[i - 1].pos).toBeGreaterThanOrEqual(1 - 1e-9);
    }
  });

  it('leaves well-spaced groups untouched', () => {
    const out = _relaxPositions([G(0), G(2), G(4)], 1, -10, 10);
    expect(out.map(g => g.pos)).toEqual([0, 2, 4]);
  });

  it('slides the run back rather than spilling past the end', () => {
    const out = _relaxPositions([G(-0.2), G(-0.1), G(0)], 1, -4, 0);
    expect(out[out.length - 1].pos).toBeLessThanOrEqual(0 + 1e-9);
    expect(out[0].pos).toBeGreaterThanOrEqual(-4 - 1e-9);
  });

  it('squeezes rather than spilling when the half is genuinely too small', () => {
    // Three glyphs needing 2 units of room in a 1-unit half.
    const out = _relaxPositions([G(-0.5), G(-0.4), G(-0.3)], 1, -1, 0);
    expect(out[0].pos).toBeGreaterThanOrEqual(-1 - 1e-9);
    expect(out).toHaveLength(3);
  });

  it('sorts by position and never loses a group', () => {
    const out = _relaxPositions([G(3), G(1), G(2)], 0.1, -10, 10);
    expect(out.map(g => g.pos)).toEqual([1, 2, 3]);
  });

  it('copes with an empty half', () => {
    expect(_relaxPositions([], 1, -1, 0)).toEqual([]);
  });
});

// ── The strip as a departure timeline ───────────────────────────────────────
describe('_buildStrip', () => {
  const LINE = { id: 'RUT:Line:5', publicCode: '5' };
  const DIR = { from: 'Grorud', to: 'Jernbanetorget' };
  const NOW = Date.UTC(2026, 4, 24, 8, 0, 0);
  const dep = (mins, id, line) => ({
    expectedDepartureTime: new Date(NOW + mins * 60000).toISOString(),
    destinationDisplay: { frontText: 'Jernbanetorget' },
    serviceJourney: { id, line: line || LINE, estimatedCalls: [] },
  });

  it('keeps the countdown the list row shows', () => {
    const s = _buildStrip([dep(6, 'a')], DIR, '5', NOW, new Map());
    expect(s.trains[0].mins).toBe(6);
  });

  it('truncates like the list does, not rounds', () => {
    const d = dep(0, 'a');
    d.expectedDepartureTime = new Date(NOW + 2 * 60000 + 40000).toISOString();
    expect(_buildStrip([d], DIR, '5', NOW, new Map()).trains[0].mins).toBe(2);
  });

  it('runs the axis from the furthest departure to your stop', () => {
    const s = _buildStrip([dep(5, 'a'), dep(10, 'b'), dep(20, 'c')], DIR, '5', NOW, new Map());
    // Sorted furthest first; the last one sits at your stop end.
    expect(s.trains.map(t => t.mins)).toEqual([20, 10, 5]);
    expect(s.trains[0].pos).toBeCloseTo(-1, 6);
    expect(s.trains[2].pos).toBeCloseTo(-0.25, 6);
  });

  it('ignores other lines', () => {
    const other = dep(6, 'x', { id: 'RUT:Line:2', publicCode: '2' });
    expect(_buildStrip([other], DIR, '5', NOW, new Map()).trains).toHaveLength(0);
  });

  it('never lists the same journey twice', () => {
    const d = dep(6, 'same');
    expect(_buildStrip([d, d], DIR, '5', NOW, new Map()).trains).toHaveLength(1);
  });

  it('carries the origin, and copes with nothing to show', () => {
    expect(_buildStrip([], DIR, '5', NOW, new Map())).toEqual({ trains: [], from: 'Grorud' });
  });
});

describe('_stripSummary', () => {
  const D = (mins) => ({ trains: mins.map(m => ({ mins: m })), from: 'Økern' });

  it('counts the departures and names the soonest', () => {
    expect(_stripSummary(D([6, 12, 21]))).toBe('3 tog på vei til Økern, neste om 6 min');
  });

  it('does not assume the list arrived sorted', () => {
    expect(_stripSummary(D([21, 6, 12]))).toContain('neste om 6 min');
  });

  it('says so plainly when there is nothing', () => {
    expect(_stripSummary(D([]))).toBe('Ingen avganger på linja nå');
    expect(_stripSummary(null)).toBe('Ingen avganger på linja nå');
  });

  it('falls back when the stop is unknown', () => {
    expect(_stripSummary({ trains: [{ mins: 4 }] })).toBe('1 tog på vei til stoppet ditt, neste om 4 min');
  });
});

// ── Departures that have already gone ───────────────────────────────────────
//
// The board now asks the API for a two-minute lookback, so a train whose time
// has passed stays on screen instead of falling out at the next 20-second
// poll. That is the whole point: a train running a minute late is standing at
// the platform, and before this the app had already forgotten it.
describe('_buildStrip — the lookback window', () => {
  const LINE = { id: 'RUT:Line:5', publicCode: '5' };
  const DIR = { from: 'Grorud', to: 'Jernbanetorget' };
  const NOW = Date.UTC(2026, 4, 24, 8, 0, 0);
  const at = (mins, id, secs) => ({
    expectedDepartureTime: new Date(NOW + mins * 60000 + (secs || 0) * 1000).toISOString(),
    destinationDisplay: { frontText: 'Jernbanetorget' },
    serviceJourney: { id, line: LINE, estimatedCalls: [] },
  });
  const strip = (deps) => _buildStrip(deps, DIR, '5', NOW, new Map());

  it('keeps a departure that has already gone, rather than dropping it', () => {
    const s = strip([at(-2, 'gone'), at(4, 'next')]);
    expect(s.trains.map(t => t.id).sort()).toEqual(['gone', 'next']);
  });

  it('counts how long ago it went, in whole minutes', () => {
    expect(strip([at(-2, 'a')]).trains[0].ago).toBe(2);
    expect(strip([at(-1, 'a', -30)]).trains[0].ago).toBe(1);
    expect(strip([at(0, 'a', -30)]).trains[0].ago).toBe(0);
  });

  it('leaves ago null for a departure still to come, so the two states never blur', () => {
    // A signed countdown would collapse "due now" and "gone thirty seconds
    // ago" onto zero — the two things a person on a platform most needs told
    // apart.
    expect(strip([at(4, 'a')]).trains[0].ago).toBeNull();
    expect(strip([at(4, 'a')]).trains[0].departed).toBe(false);
    expect(strip([at(0, 'a', -1)]).trains[0].departed).toBe(true);
  });

  it('puts a departed train past your stop, and an upcoming one before it', () => {
    const s = strip([at(-1, 'gone'), at(4, 'next')]);
    const gone = s.trains.find(t => t.id === 'gone');
    const next = s.trains.find(t => t.id === 'next');
    expect(gone.pos).toBeGreaterThan(0);
    expect(next.pos).toBeLessThan(0);
  });

  // They deliberately share one position so _clusterTrains merges them into a
  // single glyph with a +N badge. Spreading them was tried and measured: the
  // rail's axis is not linear across your stop — the strip right of it maps
  // about 0.19 of the width onto an axis unit against ~0.82 on the left — so
  // three "separated" glyphs landed 6px apart at 414px, against a 46px glyph.
  // Overlapping glyphs swallow each other's taps.
  it('gives every departed train the same position, so they cluster', () => {
    const s = strip([at(-2, 'old'), at(-1, 'mid'), at(0, 'justnow', -5)]);
    const pos = s.trains.filter(t => t.departed).map(t => t.pos);
    expect(pos).toHaveLength(3);
    expect(new Set(pos).size).toBe(1);
    expect(pos[0]).toBe(0.5);   // _STRIP_GONE_AT
  });

  // Of the trains that have gone, the one that just went is the only one worth
  // a second look — so it must lead the cluster rather than whichever happened
  // to come first in the response.
  it('orders the departed most-recent-first, so the cluster leads with it', () => {
    const s = strip([at(-2, 'old'), at(0, 'justnow', -5), at(-1, 'mid')]);
    const gone = s.trains.filter(t => t.departed);
    expect(gone.map(t => t.id)).toEqual(['justnow', 'mid', 'old']);
  });
});

// ── Which trains belong on the map ──────────────────────────────────────────
//
// Reported: the board map showed trains that were not on or between the
// chosen stations. Two halves of one render disagreed — markers were placed
// across the service journey's ENTIRE run while the corridor was clipped to
// boarding→alighting. The board lists departures ~45 min out and a metro run
// is ~40, so most of that list had not left its terminus yet and every one
// was drawn parked there: measured at 281px from a 382px-wide map's corridor,
// all sixteen on the same point.
describe('_approachingVehicles', () => {
  const LINE = { id: 'RUT:Line:3', publicCode: '3' };
  const NOW = Date.UTC(2026, 4, 24, 8, 0, 0);
  const T = (mins) => new Date(NOW + mins * 60000).toISOString();

  // A run whose own first departure is `startMin` from now, calling at your
  // stop `depMin` from now.
  const dep = (depMin, startMin, id, line) => ({
    c: {
      expectedDepartureTime: T(depMin),
      destinationDisplay: { frontText: 'Jernbanetorget' },
      serviceJourney: {
        id, line: line || LINE,
        estimatedCalls: [0, 1, 2, 3].map(i => ({
          quay: { stopPlace: { name: 'S' + i, latitude: 59.86 + i * 0.01, longitude: 10.83 } },
          aimedArrivalTime: T(startMin + i * 10), expectedArrivalTime: T(startMin + i * 10),
          aimedDepartureTime: T(startMin + i * 10), expectedDepartureTime: T(startMin + i * 10),
        })),
      },
    },
  });
  const run = (deps) => _approachingVehicles(deps, '3', NOW, new Map());

  it('draws a train that is on its way to you', () => {
    expect(run([dep(8, -10, 'a')]).map(v => v.jid)).toEqual(['a']);
  });

  it('leaves out one still far up the line', () => {
    expect(run([dep(40, -2, 'a')])).toEqual([]);
    expect(APPROACH_WINDOW_MS).toBe(15 * 60_000);
  });

  // A train waiting at a terminus is genuinely there, and inside the window
  // that terminus is at most fifteen minutes of line behind you — which the
  // corridor is widened to hold. Excluding these emptied the map entirely
  // wherever the boarding stop is itself a terminus.
  it('keeps one waiting at a terminus inside the window', () => {
    expect(run([dep(10, 5, 'a')]).map(v => v.jid)).toEqual(['a']);
  });

  it('keeps one that has just left your stop — it is on your stretch', () => {
    expect(run([dep(-1, -20, 'a')]).map(v => v.jid)).toEqual(['a']);
  });

  it('ignores other lines and duplicate journeys', () => {
    const other = dep(5, -10, 'x', { id: 'RUT:Line:2', publicCode: '2' });
    expect(run([dep(5, -10, 'a'), other, dep(6, -10, 'a')]).map(v => v.jid)).toEqual(['a']);
  });

  it('carries a position for everything it returns, so the caller cannot draw a hole', () => {
    run([dep(8, -10, 'a')]).forEach(v => {
      expect(typeof v.pos.lat).toBe('number');
      expect(typeof v.pos.lon).toBe('number');
    });
  });

  it('returns nothing rather than throwing on junk', () => {
    expect(_approachingVehicles(null, '3', NOW, new Map())).toEqual([]);
    expect(run([{ c: {} }])).toEqual([]);
    expect(run([{ c: { serviceJourney: { line: LINE, estimatedCalls: [] } } }])).toEqual([]);
  });
});

describe('_widenLo — the corridor reaches back far enough to hold them', () => {
  // A line running due north, one stop every ~1.1 km.
  const stops = Array.from({ length: 15 }, (_, i) => ({ lat: 59.86 + i * 0.01, lon: 10.83 }));
  const at = (i) => ({ pos: { lat: stops[i].lat, lon: stops[i].lon } });

  it('reaches back to the furthest train behind you', () => {
    expect(_widenLo(stops, 8, [at(2), at(5), at(9)])).toBe(2);
  });

  it('leaves the corridor alone when every train is already on it', () => {
    expect(_widenLo(stops, 5, [at(7), at(9)])).toBe(5);
  });

  it('is unchanged with nothing to draw', () => {
    expect(_widenLo(stops, 5, [])).toBe(5);
    expect(_widenLo(stops, 5, null)).toBe(5);
    expect(_widenLo(stops, 5, [{ pos: null }])).toBe(5);
  });

  it('snaps a train between two stops to the nearer one', () => {
    const between = { pos: { lat: (stops[2].lat + stops[3].lat) / 2 + 0.004, lon: 10.83 } };
    expect(_widenLo(stops, 8, [between])).toBe(3);
  });
});

// ── Intermediate stops only when there is room to read them ─────────────────
describe('_stopsReadable', () => {
  // Evenly spaced along one axis, as the corridor is on screen.
  const row = (n, gap) => Array.from({ length: n }, (_, i) => ({ x: i * gap, y: 0 }));

  it('hides the beads when fifteen stops share a phone-width map', () => {
    // 382px of map, fourteen gaps — about 27px… but the corridor is fitted
    // with padding, so the real spacing is tighter than the map is wide.
    expect(_stopsReadable(row(15, 12))).toBe(false);
  });

  it('shows them once there is room', () => {
    expect(_stopsReadable(row(15, 40))).toBe(true);
  });

  it('uses the median, so one unusually close pair does not blank the rest', () => {
    const pts = row(9, 40);
    pts.splice(4, 0, { x: pts[4].x + 2, y: 0 });   // one near-duplicate stop
    expect(_stopsReadable(pts)).toBe(true);
  });

  it('says yes when there is nothing between the ends to crowd', () => {
    expect(_stopsReadable(row(2, 1))).toBe(true);
    expect(_stopsReadable([])).toBe(true);
    expect(_stopsReadable(null)).toBe(true);
  });

  it('measures in two dimensions, not just along x', () => {
    const diag = Array.from({ length: 15 }, (_, i) => ({ x: i * 30, y: i * 30 }));
    expect(_stopsReadable(diag)).toBe(true);          // ~42px apart
    expect(_stopsReadable(diag, 60)).toBe(false);
  });
});

// ── Flere linjer samtidig ───────────────────────────────────────────────────
//
// The line filter was radio while the departure list beneath it is filtered
// only by mode — so the list showed every line that takes you there and the
// strip above it showed one. On a route served by four lines you saw a
// quarter of your options with nothing saying so.
describe('_toggleLine', () => {
  const ALL = ['1', '2', '3'];

  it('turns one off, leaving the rest on', () => {
    expect([..._toggleLine(new Set(), '2', ALL)].sort()).toEqual(['1', '3']);
  });

  it('turns one back on', () => {
    expect(_toggleLine(new Set(['1', '3']), '2', ALL).size).toBe(0);   // all → empty
  });

  // Turning off the last one turns them all back on: an empty filter is an
  // empty strip with no explanation, and "none of them" is never the intent.
  it('comes back to all when the last one is switched off', () => {
    const one = _toggleLine(_toggleLine(new Set(), '2', ALL), '3', ALL);
    expect([...one]).toEqual(['1']);
    expect(_toggleLine(one, '1', ALL).size).toBe(0);
  });

  it('treats the full set as all, so the pills read as every line on', () => {
    expect(_toggleLine(new Set(['1', '2']), '3', ALL).size).toBe(0);
  });

  it('ignores a code that is not on this route', () => {
    expect(_toggleLine(new Set(['1']), '9', ALL)).toEqual(new Set(['1']));
  });
});

describe('_buildStrip — several lines on one axis', () => {
  const NOW = Date.UTC(2026, 4, 24, 8, 0, 0);
  const DIR = { from: 'Grorud', to: 'Jernbanetorget' };
  const line = (code, colour) => ({ id: 'RUT:Line:' + code, publicCode: code, presentation: { colour } });
  const dep = (mins, id, code, colour) => ({
    expectedDepartureTime: new Date(NOW + mins * 60000).toISOString(),
    destinationDisplay: { frontText: 'Jernbanetorget' },
    serviceJourney: { id, line: line(code, colour), estimatedCalls: [] },
  });
  const deps = [dep(4, 'a', '3', 'f5a000'), dep(7, 'b', '5', '00b9f2'), dep(11, 'c', '3', 'f5a000')];

  it('shows every line that is on, interleaved by time', () => {
    const s = _buildStrip(deps, DIR, new Set(), NOW, new Map());
    expect(s.trains.map(t => t.mins)).toEqual([11, 7, 4]);   // furthest first, as the axis runs
    expect(s.trains.map(t => t.line).sort()).toEqual(['3', '3', '5']);
  });

  it('gives each train its own line colour, so a glyph says which line it is', () => {
    const s = _buildStrip(deps, DIR, new Set(), NOW, new Map());
    expect(s.trains.find(t => t.line === '5').colour).toBe('#00b9f2');
    expect(s.trains.find(t => t.line === '3').colour).toBe('#f5a000');
  });

  it('drops a line that has been switched off', () => {
    const s = _buildStrip(deps, DIR, new Set(['3']), NOW, new Map());
    expect(s.trains.map(t => t.line)).toEqual(['3', '3']);
  });

  // The old single-code form is still what the unit tests upstream pass.
  it('still accepts a single line code', () => {
    expect(_buildStrip(deps, DIR, '5', NOW, new Map()).trains.map(t => t.line)).toEqual(['5']);
  });
});

// ── Hele reisen, også over bytte ────────────────────────────────────────────
//
// The board map built its whole corridor from the departure's serviceJourney,
// which adaptTripPattern sets to the FIRST leg. On Mortensrud → Frognerseteren
// that drew as far as the interchange and stopped — and findStopIdx, unable to
// find the real destination among leg one's stops, fell back to the nearest
// point and landed there too.
describe('_legCorridorStops', () => {
  const NAMES = ['Mortensrud', 'Bøler', 'Helsfyr', 'Stortinget', 'Majorstuen', 'Frognerseteren'];
  const call = (i) => ({ quay: { stopPlace: { name: NAMES[i], latitude: 59.86 + i * 0.01, longitude: 10.83 - i * 0.01 } } });
  const leg = (fromI, toI, callIdx) => ({
    fromPlace: { name: NAMES[fromI], latitude: 59.86 + fromI * 0.01, longitude: 10.83 - fromI * 0.01 },
    toPlace:   { name: NAMES[toI],   latitude: 59.86 + toI * 0.01,   longitude: 10.83 - toI * 0.01 },
    serviceJourney: { estimatedCalls: callIdx.map(call) },
  });

  it('clips a leg to its own ends, not the journey’s', () => {
    // Leg one runs Mortensrud→Stortinget on a service that continues further.
    const l = leg(0, 3, [0, 1, 2, 3, 4]);
    expect(_legCorridorStops(l).map(s => s.name)).toEqual(
      ['Mortensrud', 'Bøler', 'Helsfyr', 'Stortinget']);
  });

  it('gives the second leg the stops the first one never had', () => {
    const l2 = leg(3, 5, [3, 4, 5]);
    const names = _legCorridorStops(l2).map(s => s.name);
    expect(names[0]).toBe('Stortinget');
    expect(names).toContain('Frognerseteren');
  });

  it('falls back to coordinates when the name does not match a stop', () => {
    const l = leg(0, 3, [0, 1, 2, 3]);
    l.toPlace = { name: 'Et sted uten treff', latitude: 59.88, longitude: 10.81 };
    expect(_legCorridorStops(l).map(s => s.name)).toContain('Helsfyr');
  });

  it('returns nothing rather than throwing when there is no leg to clip', () => {
    expect(_legCorridorStops(null)).toEqual([]);
    expect(_legCorridorStops({})).toEqual([]);
    expect(_legCorridorStops({ serviceJourney: { estimatedCalls: [call(0)] } })).toEqual([]);
  });

  // The bug in one assertion: a two-leg journey has to yield two corridors,
  // and the second must reach the destination.
  it('covers the destination across a change, which one leg alone cannot', () => {
    const legs = [leg(0, 3, [0, 1, 2, 3]), leg(3, 5, [3, 4, 5])];
    const all = legs.flatMap(l => _legCorridorStops(l).map(s => s.name));
    expect(all).toContain('Mortensrud');
    expect(all).toContain('Frognerseteren');
    // Leg one alone stops at the interchange — that was the whole map.
    expect(_legCorridorStops(legs[0]).map(s => s.name)).not.toContain('Frognerseteren');
  });
});

// ── Modusfiltrene ser hele reisen ───────────────────────────────────────────
//
// _depMode returns the FIRST leg's mode, and the pills filtered on it. So a
// journey that is metro then bus counted as metro alone: switching Buss off
// left all sixteen rows standing, and switching T-bane off removed every one.
describe('_journeyModesAllowed', () => {
  const ALL = ['metro', 'tram', 'bus', 'rail'];

  it('shows a single-mode journey when its mode is on', () => {
    expect(_journeyModesAllowed(['metro'], ALL)).toBe(true);
    expect(_journeyModesAllowed(['metro'], ['tram', 'bus', 'rail'])).toBe(false);
  });

  // The reported case, both directions.
  it('hides a metro-and-bus journey when either mode is switched off', () => {
    expect(_journeyModesAllowed(['metro', 'bus'], ALL)).toBe(true);
    expect(_journeyModesAllowed(['metro', 'bus'], ['metro', 'tram', 'rail'])).toBe(false);
    expect(_journeyModesAllowed(['metro', 'bus'], ['tram', 'bus', 'rail'])).toBe(false);
  });

  it('does not hide a journey whose modes are unknown', () => {
    expect(_journeyModesAllowed([], ALL)).toBe(true);
    expect(_journeyModesAllowed(null, ALL)).toBe(true);
  });

  it('hides everything when nothing is on', () => {
    expect(_journeyModesAllowed(['metro'], [])).toBe(false);
    expect(_journeyModesAllowed(['metro'], null)).toBe(false);
  });
});

// ── Trykk på en perle skal treffe raden ─────────────────────────────────────
//
// The target was computed from row.offsetTop, which is relative to the
// nearest POSITIONED ancestor. #dep-list is position:static, so offsetParent
// was BODY and every target was off by the distance from the top of the page
// down to the list — measured at 418px. The row got highlighted off-screen.
describe('_scrollRowIntoList', () => {
  const LIST = { top: 418, height: 318 };
  const CLIENT = 318, SCROLL = 1280;
  const row = (topOnScreen, height) => ({ top: topOnScreen, height: height == null ? 80 : height });

  it('leaves the first row alone — centring it would mean scrolling above the top', () => {
    // Its true offset in the list is 0; offsetTop would have said 418.
    expect(_scrollRowIntoList(LIST, row(418), 0, CLIENT, SCROLL)).toBe(0);
  });

  it('centres a row further down', () => {
    // 600px into the content, list scrolled to 0 → 600 - (318-80)/2 = 481.
    expect(_scrollRowIntoList(LIST, row(418 + 600), 0, CLIENT, SCROLL)).toBe(481);
  });

  it('accounts for where the list is already scrolled to', () => {
    // Same row, but the list has already moved 200px: on screen it sits 200
    // higher, and the answer must not move with it.
    expect(_scrollRowIntoList(LIST, row(418 + 400), 200, CLIENT, SCROLL)).toBe(481);
  });

  it('never scrolls past the end of the content', () => {
    expect(_scrollRowIntoList(LIST, row(418 + 1260), 0, CLIENT, SCROLL)).toBe(SCROLL - CLIENT);
  });

  it('copes with a list that does not scroll at all', () => {
    expect(_scrollRowIntoList(LIST, row(418), 0, 400, 400)).toBe(0);
    expect(_scrollRowIntoList(LIST, row(418), 0, CLIENT, 0)).toBe(0);
  });
});

// ── Korridorstil ────────────────────────────────────────────────────────────
//
// Three places built these two style objects by hand, and the loop drawing
// the non-primary lines spread the PRIMARY line's style over them. So the bus
// corridor came out solid and 4px whenever a metro line happened to have the
// soonest departure: the same bus, two thicknesses, depending on what else
// was selected.
describe('_corridorStyle', () => {
  it('draws a bus thin and dashed', () => {
    const s = _corridorStyle('bus', '#e5006d');
    expect(s.weight).toBe(2);
    expect(s.dashArray).toBe('1 7');
    expect(s.color).toBe('#e5006d');
  });

  it('draws rail modes solid and thicker', () => {
    ['metro', 'tram', 'rail'].forEach(m => {
      const s = _corridorStyle(m, '#f5a000');
      expect(s.weight).toBe(4);
      expect(s.dashArray).toBeUndefined();
    });
  });

  // The bug in one line: the style must come from the mode it is given, never
  // from whichever line happened to be drawn first.
  it('depends on nothing but the mode it is handed', () => {
    expect(_corridorStyle('bus', '#000')).toEqual(_corridorStyle('bus', '#000'));
    expect(_corridorStyle('bus', '#000').weight)
      .not.toBe(_corridorStyle('metro', '#000').weight);
  });

  it('treats an unknown mode as rail rather than as a bus', () => {
    expect(_corridorStyle(undefined, '#000').weight).toBe(4);
  });
});

// ── Vehicles on the drawn line ───────────────────────────────────────────────
//
// The same quarter-circle as tests/path.test.js: a chord between its ends
// misses the arc by R(1 − cos45°) ≈ 293 m, which is exactly how far a marker
// used to float from the track drawn beneath it.
const VR = 1000, VC = { lat: 59.9139, lon: 10.7522 };
const V_LAT = 111320, V_LON = 111320 * Math.cos(VC.lat * Math.PI / 180);
const vAt = deg => {
  const r = deg * Math.PI / 180;
  return [VC.lat + (VR * Math.cos(r)) / V_LAT, VC.lon + (VR * Math.sin(r)) / V_LON];
};
const VARC = [];
for (let d = 0; d <= 90; d += 5) VARC.push(vAt(d));
const VA = VARC[0], VB = VARC[VARC.length - 1];
const VCHORD_MID = { lat: (VA[0] + VB[0]) / 2, lon: (VA[1] + VB[1]) / 2 };

const T0 = Date.parse('2026-05-24T10:00:00+02:00');
const vCall = (ll, arrMs, depMs) => ({
  quay: { latitude: ll[0], longitude: ll[1] },
  aimedArrivalTime: new Date(arrMs).toISOString(),
  expectedArrivalTime: new Date(arrMs).toISOString(),
  aimedDepartureTime: new Date(depMs).toISOString(),
  expectedDepartureTime: new Date(depMs).toISOString(),
});
// Two stops, ten minutes apart: the ends of the arc.
const VCALLS = [vCall(VA, T0, T0), vCall(VB, T0 + 600000, T0 + 600000)];

describe('_interpolateOnPath', () => {
  it('puts the vehicle on the drawn line, not on the chord between platforms', () => {
    const mid = T0 + 300000;
    const onPath = _interpolateOnPath(VCALLS, mid, VARC);
    const onChord = _interpolateVehiclePos(VCALLS, mid);
    // What the old code answers, stated as a number so the size of the bug is
    // on the record: the chord midpoint, ~293 m from the track.
    expect(haver(onChord.lat, onChord.lon, VCHORD_MID.lat, VCHORD_MID.lon)).toBeLessThan(1);
    expect(haver(onChord.lat, onChord.lon, vAt(45)[0], vAt(45)[1])).toBeGreaterThan(250);
    // What it answers now: on the arc.
    expect(haver(onPath.lat, onPath.lon, vAt(45)[0], vAt(45)[1])).toBeLessThan(10);
    expect(haver(onPath.lat, onPath.lon, VCHORD_MID.lat, VCHORD_MID.lon)).toBeGreaterThan(250);
  });

  it('keeps the timetable semantics exactly — the ends, the wait, and the end of the run', () => {
    expect(haver(_interpolateOnPath(VCALLS, T0, VARC).lat, _interpolateOnPath(VCALLS, T0, VARC).lon,
      VA[0], VA[1])).toBeLessThan(1);
    expect(haver(_interpolateOnPath(VCALLS, T0 + 600000, VARC).lat,
      _interpolateOnPath(VCALLS, T0 + 600000, VARC).lon, VB[0], VB[1])).toBeLessThan(1);
    // Before the first departure it is parked; after the last arrival the run
    // is over and there is nothing to draw — same as before.
    expect(_interpolateOnPath(VCALLS, T0 - 60000, VARC)).not.toBeNull();
    expect(_interpolateOnPath(VCALLS, T0 + 600001, VARC)).toBeNull();
    expect(_interpolateVehiclePos(VCALLS, T0 + 600001)).toBeNull();
  });

  it('advances along the line and never doubles back', () => {
    let prev = -1;
    for (let f = 0; f <= 1.0001; f += 0.05) {
      const p = _interpolateOnPath(VCALLS, T0 + 600000 * f, VARC);
      const along = haver(VA[0], VA[1], p.lat, p.lon);
      expect(along).toBeGreaterThanOrEqual(prev - 1);
      prev = along;
    }
    // And it really travelled the arc, not the chord.
    expect(measurePath(VARC).total).toBeGreaterThan(haver(VA[0], VA[1], VB[0], VB[1]) + 150);
  });

  it('takes its heading from the line it is on', () => {
    const q = _interpolateOnPath(VCALLS, T0 + 150000, VARC);
    // A quarter of the way along, the tangent is 22.5° off the chord — which
    // is the direction the old marker pointed while sitting on the curve.
    expect(Math.abs(q.heading - 112.5)).toBeLessThan(5);
    expect(Math.abs(_interpolateVehiclePos(VCALLS, T0 + 150000).heading - 135)).toBeLessThan(3);
  });

  // The guarantee that makes this safe to ship: without geometry, nothing
  // changes at all. Asserted against the old function rather than literals.
  it('degrades to exactly the old answer with no usable path', () => {
    const t = T0 + 200000;
    const old = _interpolateVehiclePos(VCALLS, t);
    expect(_interpolateOnPath(VCALLS, t, null)).toEqual(old);
    expect(_interpolateOnPath(VCALLS, t, [])).toEqual(old);
    expect(_interpolateOnPath(VCALLS, t, [VA])).toEqual(old);
    // A path belonging to some other line entirely: the stops are nowhere
    // near it, so hanging the train on it would be worse than the chord.
    const elsewhere = [[60.5, 11.5], [60.6, 11.6]];
    expect(_interpolateOnPath(VCALLS, t, elsewhere)).toEqual(old);
  });

  it('has nothing to say about calls it cannot read, same as before', () => {
    expect(_interpolateOnPath(null, T0, VARC)).toBeNull();
    expect(_interpolateOnPath([], T0, VARC)).toBeNull();
    expect(_interpolateOnPath([VCALLS[0]], T0, VARC)).toBeNull();
  });
});

// ── Infinite scroll ─────────────────────────────────────────────────────────
const pdep = (iso, id) => ({ expectedDepartureTime: iso, serviceJourney: { id } });

describe('_nextPageAt', () => {
  // OTP has no page cursor, so the horizon IS the time — one minute past the
  // last departure held. Asking from the same instant returns the same page
  // forever, which is the loop this avoids.
  it('is one minute past the latest departure held', () => {
    const deps = [pdep(iso(10, 5, 0), 'a'), pdep(iso(10, 21, 0), 'c'), pdep(iso(10, 9, 0), 'b')];
    expect(_nextPageAt(deps)).toBe(Date.parse(iso(10, 21, 0)) + 60000);
  });

  it('has no horizon without departures, and does not produce NaN from junk', () => {
    expect(_nextPageAt([])).toBeNull();
    expect(_nextPageAt(null)).toBeNull();
    expect(_nextPageAt([{ expectedDepartureTime: 'tull' }])).toBeNull();
  });
});

describe('_mergePage', () => {
  const near = [pdep(iso(10, 5, 0), 'a'), pdep(iso(10, 9, 0), 'b')];

  it('adds what is new and says how much', () => {
    const r = _mergePage([], near, [pdep(iso(10, 25, 0), 'c'), pdep(iso(10, 31, 0), 'd')]);
    expect(r.added).toBe(2);
    expect(r.pages.map(c => c.serviceJourney.id)).toEqual(['c', 'd']);
  });

  it('ignores journeys already held, in the near window or an earlier page', () => {
    const r = _mergePage([pdep(iso(10, 25, 0), 'c')], near,
      [pdep(iso(10, 5, 0), 'a'), pdep(iso(10, 25, 0), 'c'), pdep(iso(10, 40, 0), 'e')]);
    expect(r.added).toBe(1);
    expect(r.pages.map(c => c.serviceJourney.id)).toEqual(['c', 'e']);
  });

  // A page that repeats what we have is how the end of the line announces
  // itself; without noticing it the list would ask forever.
  it('adds nothing when the page only repeats what is held', () => {
    expect(_mergePage([], near, near).added).toBe(0);
  });

  it('falls back to the departure time when a journey has no id', () => {
    const noId = { expectedDepartureTime: iso(10, 45, 0) };
    expect(_mergePage([], near, [noId, { ...noId }]).added).toBe(1);
  });

  it('survives an empty or missing page rather than throwing', () => {
    expect(_mergePage([], near, []).added).toBe(0);
    expect(_mergePage([], near, null).added).toBe(0);
  });
});

describe('the row cap', () => {
  // Set from measurement — the list is rebuilt at 1 Hz, and that is the cost
  // that decides how far scrolling can go.
  it('is a real number, comfortably above one screenful', () => {
    expect(MAX_ROWS).toBeGreaterThan(24);
    expect(MAX_ROWS).toBeLessThanOrEqual(120);
  });
});
