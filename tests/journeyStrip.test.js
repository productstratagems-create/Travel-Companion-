import { describe, it, expect } from 'vitest';
import { _journeyProgress, _journeySummary } from '../src/views/journeyStrip.js';
import { MAX_AGE_MS } from '../src/api/vehicles.js';

const T0 = 1_700_000_000_000;
const NAMES = ['Mortensrud', 'Skullerud', 'Bøler', 'Brynseng', 'Jernbanetorget'];
// Two minutes between stops, thirty seconds standing at each.
const STEP = 120_000, DWELL = 30_000;
const iso = (ms) => new Date(ms).toISOString();

// A straight line east, so a projected coordinate maps to a predictable stop.
const LAT = 59.9, LON0 = 10.75, DLON = 0.02;

const calls = NAMES.map((name, i) => {
  const arr = T0 + i * STEP;
  return {
    quay: { stopPlace: { name, latitude: LAT, longitude: LON0 + i * DLON } },
    aimedArrivalTime: iso(arr), expectedArrivalTime: iso(arr),
    aimedDepartureTime: iso(arr + DWELL), expectedDepartureTime: iso(arr + DWELL),
  };
});
const at = (i) => T0 + i * STEP;

describe('_journeyProgress — the timetable path', () => {
  it('parks the train at the boarding stop before it has left', () => {
    const p = _journeyProgress(calls, at(0), null);
    expect(p.frac).toBe(0);
    expect(p.atStop).toBe(true);
    expect(p.at).toBe('Mortensrud');
    expect(p.next).toBe('Skullerud');
    expect(p.left).toBe(4);
  });

  it('reports standing at a stop while it is between arrival and departure', () => {
    const p = _journeyProgress(calls, at(2) + 10_000, null);
    expect(p.frac).toBe(2);
    expect(p.atStop).toBe(true);
    expect(p.at).toBe('Bøler');
    expect(p.left).toBe(2);
  });

  // The whole point of the fraction: an integer index is enough to write
  // "2 stopp unna" but not to place a glyph that visibly moves. The time here
  // is deliberately off a stop boundary — with whole-stop fixtures a mutant
  // that returned the segment's start index would pass.
  it('interpolates between two stops rather than snapping to either', () => {
    const mid = at(1) + DWELL + (STEP - DWELL) / 2;
    const p = _journeyProgress(calls, mid, null);
    expect(p.frac).toBeCloseTo(1.5, 5);
    expect(p.atStop).toBe(false);
    expect(p.at).toBeNull();
    expect(p.next).toBe('Bøler');
    expect(p.left).toBe(3);
  });

  it('moves monotonically across the whole leg', () => {
    let prev = -1;
    for (let t = at(0); t <= at(4); t += 5_000) {
      const p = _journeyProgress(calls, t, null);
      expect(p.frac).toBeGreaterThanOrEqual(prev);
      prev = p.frac;
    }
    expect(prev).toBe(4);
  });

  it('settles at the alighting stop and stops counting down past it', () => {
    const p = _journeyProgress(calls, at(4) + 600_000, null);
    expect(p.frac).toBe(4);
    expect(p.left).toBe(0);
    expect(p.next).toBeNull();
  });
});

describe('_journeyProgress — a measured position', () => {
  const fix = (msAgo, lon) => ({ lat: LAT, lon, lastUpdated: T0 - msAgo });
  const posMap = (msAgo, lon) => new Map([['SJ:1', fix(msAgo, lon)]]);
  const NOW = at(0);   // timetable says stop 0; the fix says otherwise

  it('wins over the timetable while it is fresh, and says so', () => {
    // Between stops 2 and 3, three quarters of the way along.
    const lon = LON0 + (2 + 0.75) * DLON;
    const live = { lat: LAT, lon, lastUpdated: NOW - 5_000 };
    const p = _journeyProgress(calls, NOW, live);
    expect(p.frac).toBeCloseTo(2.75, 2);
    expect(p.live).toBe(true);
    expect(p.next).toBe('Brynseng');
    expect(p.left).toBe(2);
  });

  it('falls back to the timetable rather than passing a null position through', () => {
    const p = _journeyProgress(calls, at(2) + 10_000, null);
    expect(p.live).toBe(false);
    expect(p.frac).toBe(2);
  });

  it('is clamped to the leg when the fix sits beyond either end', () => {
    const before = _journeyProgress(calls, NOW, { lat: LAT, lon: LON0 - 5 * DLON });
    expect(before.frac).toBe(0);
    const after = _journeyProgress(calls, NOW, { lat: LAT, lon: LON0 + 9 * DLON });
    expect(after.frac).toBe(4);
  });

  it('ignores a fix on calls that carry no coordinates', () => {
    const bare = calls.map(c => ({ ...c, quay: { stopPlace: { name: c.quay.stopPlace.name } } }));
    const p = _journeyProgress(bare, at(2) + 10_000, { lat: LAT, lon: LON0 + 3 * DLON });
    expect(p.live).toBe(false);
    expect(p.frac).toBe(2);
    // Names still work, so the strip degrades to the timetable rather than vanishing.
    expect(p.at).toBe('Bøler');
  });

  // The staleness rule itself lives in livePosition and is tested there; this
  // asserts the strip is wired through it rather than reading the map directly.
  it('leaves the staleness rule to livePosition', async () => {
    const { livePosition } = await import('../src/api/vehicles.js');
    const stale = new Map([['SJ:1', { ...fix(MAX_AGE_MS + 1_000, LON0 + 3 * DLON), lastUpdated: NOW - MAX_AGE_MS - 1_000 }]]);
    expect(livePosition(stale, 'SJ:1', NOW)).toBeNull();
    expect(_journeyProgress(calls, at(2) + 10_000, livePosition(stale, 'SJ:1', NOW)).live).toBe(false);
    const fresh = posMap(0, LON0 + 3 * DLON);
    fresh.get('SJ:1').lastUpdated = NOW - 5_000;
    expect(_journeyProgress(calls, at(2), livePosition(fresh, 'SJ:1', NOW)).live).toBe(true);
  });
});

describe('_journeyProgress — degradation', () => {
  it('returns null rather than a guess when there is nothing to place a train on', () => {
    expect(_journeyProgress([], T0, null)).toBeNull();
    expect(_journeyProgress(null, T0, null)).toBeNull();
    expect(_journeyProgress([calls[0]], T0, null)).toBeNull();
  });

  it('returns null when the calls carry no usable times', () => {
    const timeless = NAMES.map(name => ({ quay: { stopPlace: { name } } }));
    expect(_journeyProgress(timeless, T0, null)).toBeNull();
  });
});

describe('_journeySummary', () => {
  it('agrees in number, which is where Norwegian quietly goes wrong', () => {
    expect(_journeySummary({ at: 'Bøler', next: 'Brynseng', left: 1, to: 'Jernbanetorget' }))
      .toBe('Ved Bøler. 1 stopp igjen til Jernbanetorget.');
    expect(_journeySummary({ at: null, next: 'Brynseng', left: 3, to: 'Jernbanetorget' }))
      .toBe('Neste stopp Brynseng. 3 stopp igjen til Jernbanetorget.');
  });

  it('says you are there rather than counting zero stops', () => {
    expect(_journeySummary({ at: 'Jernbanetorget', next: null, left: 0, to: 'Jernbanetorget' }))
      .toBe('Ved Jernbanetorget. Du er framme.');
  });

  // Written as two independent halves this reads "Neste stopp Jernbanetorget.
  // 1 stopp igjen til Jernbanetorget." — which is what the probe actually saw.
  it('does not name the destination twice on the approach to it', () => {
    expect(_journeySummary({ at: null, next: 'Jernbanetorget', left: 1, to: 'Jernbanetorget' }))
      .toBe('Neste stopp Jernbanetorget. Siste stopp.');
  });
});
