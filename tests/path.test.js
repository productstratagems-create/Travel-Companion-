import { describe, it, expect } from 'vitest';
import { measurePath, projectOnPath, pointAtDistance, anchorDistances } from '../src/ui/path.js';
import { snapToCorridor } from '../src/ui/corridor.js';
import { haver } from '../src/geo.js';

// A quarter circle of radius 1000 m at Oslo's latitude, sampled every 5°.
//
// Chosen because its chord error is a known quantity rather than a guess: the
// sagitta is R(1 − cos 45°) ≈ 293 m. That is the exact distance by which the
// old chord interpolation put a train off its own track, so every assertion
// below can be stated in metres instead of "closer".
const R = 1000;
const C = { lat: 59.9139, lon: 10.7522 };
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos(C.lat * Math.PI / 180);
const at = deg => {
  const r = deg * Math.PI / 180;
  return [C.lat + (R * Math.cos(r)) / M_PER_DEG_LAT, C.lon + (R * Math.sin(r)) / M_PER_DEG_LON];
};
const ARC = [];
for (let d = 0; d <= 90; d += 5) ARC.push(at(d));
const A = ARC[0], B = ARC[ARC.length - 1];
const CHORD_MID = { lat: (A[0] + B[0]) / 2, lon: (A[1] + B[1]) / 2 };
const ARC_MID = at(45);
const CHORD_DEG = 135;   // the straight line A→B, which is what the old code drew along
// 30 m off the arc, measured perpendicular to it (radially) — a pure
// north offset would mostly be along-track and measure the wrong thing.
const OFF_MID = {
  lat: ARC_MID[0] + (30 * Math.cos(Math.PI / 4)) / M_PER_DEG_LAT,
  lon: ARC_MID[1] + (30 * Math.sin(Math.PI / 4)) / M_PER_DEG_LON,
};

describe('measurePath', () => {
  it('measures the arc, not the chord', () => {
    const m = measurePath(ARC);
    expect(m.total).toBeGreaterThan(Math.PI * R / 2 * 0.99);
    expect(m.total).toBeLessThan(Math.PI * R / 2 * 1.01);
    // The chord is materially shorter — that difference is the whole bug.
    expect(m.total - haver(A[0], A[1], B[0], B[1])).toBeGreaterThan(150);
  });

  it('memoises on array identity, so a 1 Hz render pays once', () => {
    expect(measurePath(ARC)).toBe(measurePath(ARC));
    expect(measurePath(ARC.slice())).not.toBe(measurePath(ARC));
  });

  it('returns null for anything that is not a line', () => {
    expect(measurePath(null)).toBeNull();
    expect(measurePath([])).toBeNull();
    expect(measurePath([[59.9, 10.7]])).toBeNull();
  });
});

describe('pointAtDistance', () => {
  it('lands on the arc at half its length — 250+ m from the chord midpoint', () => {
    const m = measurePath(ARC);
    const p = pointAtDistance(ARC, m.total / 2);
    expect(haver(p.lat, p.lon, ARC_MID[0], ARC_MID[1])).toBeLessThan(5);
    expect(haver(p.lat, p.lon, CHORD_MID.lat, CHORD_MID.lon)).toBeGreaterThan(250);
  });

  it('takes its heading from the tangent, not the chord', () => {
    const m = measurePath(ARC);
    // A circular arc's midpoint tangent is parallel to its chord, so the
    // midpoint is exactly where the two agree and proves nothing. A quarter
    // of the way along, the tangent is 22.5° off the chord — and that is the
    // angle a marker drawn on chord heading gets wrong while sitting on the
    // curve.
    expect(Math.abs(pointAtDistance(ARC, m.total / 2).heading - CHORD_DEG)).toBeLessThan(3);
    const q = pointAtDistance(ARC, m.total / 4).heading;
    expect(Math.abs(q - (CHORD_DEG - 22.5))).toBeLessThan(3);
  });

  it('clamps to the ends rather than running off the line', () => {
    const m = measurePath(ARC);
    const before = pointAtDistance(ARC, -500);
    const after = pointAtDistance(ARC, m.total + 500);
    expect(haver(before.lat, before.lon, A[0], A[1])).toBeLessThan(1);
    expect(haver(after.lat, after.lon, B[0], B[1])).toBeLessThan(1);
  });
});

describe('projectOnPath', () => {
  it('reports where, how far off, which segment and how far along', () => {
    const p = projectOnPath(OFF_MID, ARC);
    expect(p.dist).toBeGreaterThan(28);
    expect(p.dist).toBeLessThan(32);
    expect(Math.abs(p.along - measurePath(ARC).total / 2)).toBeLessThan(5);
    expect(haver(p.lat, p.lon, ARC_MID[0], ARC_MID[1])).toBeLessThan(5);
  });

  it('starts the scan where it is told, which is what keeps a chain monotone', () => {
    const near0 = { lat: A[0], lon: A[1] };
    expect(projectOnPath(near0, ARC).along).toBeLessThan(1);
    // Told to start halfway, it cannot report a point behind that.
    expect(projectOnPath(near0, ARC, 9).along).toBeGreaterThan(measurePath(ARC).total / 2 - 100);
  });
});

// snapToCorridor is now a wrapper. Its contract must not have moved: it is
// the guard that decides whether the user is on the train (v1.24.0).
describe('snapToCorridor — unchanged contract', () => {
  it('snaps a nearby fix and returns only lat/lon', () => {
    const s = snapToCorridor(OFF_MID, ARC, 50);
    expect(Object.keys(s).sort()).toEqual(['lat', 'lon']);
    expect(haver(s.lat, s.lon, ARC_MID[0], ARC_MID[1])).toBeLessThan(5);
  });

  it('rejects a fix beyond maxDist, and degenerate input', () => {
    const far = { lat: ARC_MID[0] + 300 / M_PER_DEG_LAT, lon: ARC_MID[1] + 300 / M_PER_DEG_LON };
    expect(snapToCorridor(far, ARC, 50)).toBeNull();
    expect(snapToCorridor(null, ARC, 50)).toBeNull();
    expect(snapToCorridor({ lat: 1, lon: 1 }, [[0, 0]], 50)).toBeNull();
  });
});

describe('anchorDistances', () => {
  it('places a stop chain along the path, increasing', () => {
    const stops = [A, ARC_MID, B].map(([lat, lon]) => ({ lat, lon }));
    const d = anchorDistances(ARC, stops);
    expect(d[0]).toBeLessThan(1);
    expect(d[1]).toBeGreaterThan(d[0]);
    expect(d[2]).toBeGreaterThan(d[1]);
  });

  // A journey that touches the same place twice would otherwise project the
  // second visit back onto the first, and run the train backwards.
  it('never goes backwards on a path that doubles back', () => {
    const OUT = [], BACK = [];
    for (let i = 0; i <= 10; i++) OUT.push([C.lat + (i * 100) / M_PER_DEG_LAT, C.lon]);
    for (let i = 10; i >= 0; i--) BACK.push([C.lat + (i * 100) / M_PER_DEG_LAT, C.lon + 40 / M_PER_DEG_LON]);
    const U = OUT.concat(BACK);
    const stops = [
      { lat: C.lat, lon: C.lon },                                    // start of the outbound limb
      { lat: C.lat + 1000 / M_PER_DEG_LAT, lon: C.lon + 20 / M_PER_DEG_LON }, // the turn
      { lat: C.lat + 20 / M_PER_DEG_LAT, lon: C.lon + 40 / M_PER_DEG_LON },   // back near the start
    ];
    const d = anchorDistances(U, stops);
    expect(d[1]).toBeGreaterThan(d[0]);
    expect(d[2]).toBeGreaterThan(d[1]);
  });

  it('reports null for a stop the path does not cover', () => {
    const stops = [{ lat: A[0], lon: A[1] }, { lat: A[0] + 0.05, lon: A[1] + 0.05 }];
    expect(anchorDistances(ARC, stops)[1]).toBeNull();
  });
});
