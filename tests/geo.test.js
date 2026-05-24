import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/state.js', () => ({
  state: { walkOvr: null, statLL: {}, homeLL: null, dIdx: 0 },
  intervals: { board: null, track: null, sel: null },
}));
vi.mock('../src/config.js', () => ({
  default: { defaultWalkMinutes: 8, dirs: [{ key: 'out' }] },
}));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn() }));

import { haver, reachCls, findArr } from '../src/geo.js';

// --- haver (Haversine distance) ---

describe('haver()', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haver(59.9139, 10.7522, 59.9139, 10.7522)).toBe(0);
  });

  it('returns a positive number for distinct coordinates', () => {
    expect(haver(59.91, 10.75, 59.95, 10.80)).toBeGreaterThan(0);
  });

  it('is symmetric — haver(A,B) === haver(B,A)', () => {
    const d1 = haver(59.91, 10.75, 59.93, 10.77);
    const d2 = haver(59.93, 10.77, 59.91, 10.75);
    expect(d1).toBeCloseTo(d2, 5);
  });

  it('returns roughly 1000m between two points ~1km apart', () => {
    // Two Oslo coordinates approximately 1km apart
    const d = haver(59.8498, 10.8426, 59.8497, 10.8311);
    expect(d).toBeGreaterThan(400);
    expect(d).toBeLessThan(2000);
  });

  it('result is in metres (two Oslo metro stops ~3km apart gives >2000m)', () => {
    // Mortensrud to Helsfyr approx 4km
    const d = haver(59.8300, 10.8400, 59.9000, 10.8200);
    expect(d).toBeGreaterThan(2000);
  });
});

// --- reachCls (CSS class for walk timing) ---

describe('reachCls()', () => {
  it('returns "r-ok" when more than 5 minutes', () => {
    expect(reachCls(6)).toBe('r-ok');
    expect(reachCls(100)).toBe('r-ok');
  });

  it('returns "r-soon" at exactly 5 (boundary — > not >=)', () => {
    expect(reachCls(5)).toBe('r-soon');
  });

  it('returns "r-soon" between 2 and 5 minutes', () => {
    expect(reachCls(3)).toBe('r-soon');
    expect(reachCls(4)).toBe('r-soon');
  });

  it('returns "r-soon" at exactly 2', () => {
    expect(reachCls(2)).toBe('r-soon');
  });

  it('returns "r-now" at exactly 1', () => {
    expect(reachCls(1)).toBe('r-now');
  });

  it('returns "r-now" at exactly 0', () => {
    expect(reachCls(0)).toBe('r-now');
  });

  it('returns "missed" when negative', () => {
    expect(reachCls(-1)).toBe('missed');
    expect(reachCls(-100)).toBe('missed');
  });
});

// --- findArr (find a stop in estimatedCalls by name) ---

const mockCalls = [
  { quay: { stopPlace: { name: 'Mortensrud T' } }, expectedArrivalTime: '2026-05-24T08:10:00+02:00' },
  { quay: { stopPlace: { name: 'Skullerud' } },    expectedArrivalTime: '2026-05-24T08:12:00+02:00' },
  { quay: { stopPlace: { name: 'Jernbanetorget' } }, expectedArrivalTime: '2026-05-24T08:30:00+02:00' },
];

describe('findArr()', () => {
  it('finds an exact name match', () => {
    const r = findArr(mockCalls, 'Skullerud');
    expect(r).not.toBeNull();
    expect(r.expectedArrivalTime).toBe('2026-05-24T08:12:00+02:00');
  });

  it('strips trailing " T" suffix before comparing (Mortensrud T → mortensrud)', () => {
    expect(findArr(mockCalls, 'Mortensrud')).not.toBeNull();
  });

  it('is case-insensitive', () => {
    expect(findArr(mockCalls, 'JERNBANETORGET')).not.toBeNull();
  });

  it('returns null when name is not found', () => {
    expect(findArr(mockCalls, 'Nationaltheatret')).toBeNull();
  });

  it('returns null when calls is null', () => {
    expect(findArr(null, 'Mortensrud')).toBeNull();
  });

  it('returns null when name is null', () => {
    expect(findArr(mockCalls, null)).toBeNull();
  });

  it('returns null when calls is empty array', () => {
    expect(findArr([], 'Mortensrud')).toBeNull();
  });

  it('handles entries where quay or stopPlace is missing', () => {
    const sparse = [
      { quay: null },
      { quay: { stopPlace: null } },
      { quay: { stopPlace: { name: 'Ekebergsletta' } }, expectedArrivalTime: '2026-05-24T08:05:00+02:00' },
    ];
    expect(findArr(sparse, 'Ekebergsletta')).not.toBeNull();
  });
});
