import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/state.js', () => ({
  state: { walkOvr: null, statLL: {}, homeLL: null, dIdx: 0 },
  intervals: { board: null, track: null, sel: null },
}));
vi.mock('../src/config.js', () => ({
  default: { defaultWalkMinutes: 8, dirs: [{ key: 'out' }] },
}));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn() }));

import { haver, reachCls, findArr, walkInfo, walkFocus, WALK_FOCUS_MINS } from '../src/geo.js';
import { state } from '../src/state.js';
import { saveWalkDist } from '../src/api/walkDist.js';

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


// --- walkInfo: the number people plan their morning by --------------------

describe('walkInfo()', () => {
  // ~930 m apart. The estimate is crow × 1.3 ÷ speed; the measurement, when
  // there is one, is the length of the route the app drew.
  const HOME = { lat: 59.8617, lon: 10.8285 };
  const STOP = { lat: 59.8700, lon: 10.8300 };
  const ROUTE = [[59.8617, 10.8285], [59.8650, 10.8300], [59.8700, 10.8300]];

  const setup = () => {
    localStorage.clear();
    localStorage.setItem('__activeProfile', 'default');
    state.walkOvr = null;
    state.walkFromLL = null;
    state.homeLL = HOME;
    state.statLL = { out: STOP };
    state.dIdx = 0;
  };

  it('estimates from crow-flight × 1.3 when nothing has been measured', () => {
    setup();
    const w = walkInfo();
    expect(w.src).toBe('beregnet');
    const crow = haver(HOME.lat, HOME.lon, STOP.lat, STOP.lon);
    expect(w.dist).toBe(Math.round(crow * 1.3));
  });

  // The change. A measured route beats a multiplier, and `src` says which one
  // you got — so the debug panel can tell you why the number moved.
  it('uses the measured route when there is one, and says so', () => {
    setup();
    const crow = haver(HOME.lat, HOME.lon, STOP.lat, STOP.lon);
    const saved = saveWalkDist(HOME, STOP, ROUTE, crow);
    const w = walkInfo();
    expect(w.src).toBe('gangrute');
    expect(w.dist).toBe(saved);
    expect(w.dist).toBeLessThan(Math.round(crow * 1.3));   // the real path is straighter here
  });

  // The guard that keeps a bad route from moving when the app says to leave.
  it('falls back to the estimate when the stored length is not believable', () => {
    setup();
    const crow = haver(HOME.lat, HOME.lon, STOP.lat, STOP.lon);
    saveWalkDist(HOME, STOP, ROUTE, crow);
    // The reader has moved; the same stored entry is now absurd for this pair.
    localStorage.setItem('default::t.walkDist',
      JSON.stringify({ [Object.keys(JSON.parse(localStorage.getItem('default::t.walkDist')))[0]]: 50 }));
    const w = walkInfo();
    expect(w.src).toBe('beregnet');
  });

  it('a manual override still wins over everything', () => {
    setup();
    saveWalkDist(HOME, STOP, ROUTE, haver(HOME.lat, HOME.lon, STOP.lat, STOP.lon));
    state.walkOvr = 4;
    expect(walkInfo()).toEqual({ mins: 4, src: 'manuelt' });
    state.walkOvr = null;
  });

  it('falls back to the default with no position at all', () => {
    setup();
    state.homeLL = null;
    expect(walkInfo().src).toBe('standard');
  });
});

// ── Is it time to go? ──────────────────────────────────────────────────────
//
// v1.67.0 folded the gangtid screen into the departure screen. The two screens
// duplicated four things and the second added two: a live countdown and the
// walking route. Rather than a screen you navigate to, the departure screen
// now changes SHAPE when it is time to leave — and this is the one function
// that decides when, because the hero, the itinerary and the map all read it.
describe('walkFocus', () => {
  it('is quiet while there is still time', () => {
    expect(walkFocus(20)).toBe(false);
    expect(walkFocus(WALK_FOCUS_MINS + 1)).toBe(false);
  });

  // Three minutes, not zero: at zero the screen would only become useful once
  // you were already late — the moment you are least able to read it.
  it('wakes up a few minutes before you have to go', () => {
    expect(walkFocus(WALK_FOCUS_MINS)).toBe(true);
    expect(walkFocus(1)).toBe(true);
    expect(walkFocus(0)).toBe(true);
  });

  // A countdown that stopped mattering the moment it matters most would be
  // the wrong way round.
  it('stays awake once you are late', () => {
    expect(walkFocus(-1)).toBe(true);
    expect(walkFocus(-30)).toBe(true);
  });

  it('says no rather than guessing when there is no number', () => {
    [null, undefined, NaN, Infinity, 'snart'].forEach(v => expect(walkFocus(v)).toBe(false));
  });
});
