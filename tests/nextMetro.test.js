import { describe, it, expect, vi } from 'vitest';

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({
  makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(),
  mapHalo: vi.fn(), sideVehicleSvg: () => '', SIDE_VEHICLE_MAX_PX: 30,
}));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import { nextMetro, sameWayOut, dirRank } from '../src/views/auto.js';

const NOW = Date.UTC(2026, 8, 8, 15, 7, 0);
const MIN = 60000;
const iso = (m) => new Date(NOW + m * MIN).toISOString();

/** A grouped direction, as groupDirections builds them. */
const dir = (front, line, mode, mins, ahead, codespace) => ({
  frontText: front,
  lines: [{ code: line, colour: 'f5a000' }],
  nextMs: NOW + mins[0] * MIN,
  times: mins.map(m => NOW + m * MIN),
  mins: mins[0],
  call: {
    destinationDisplay: { frontText: front },
    serviceJourney: {
      line: { id: (codespace || 'RUT:') + 'Line:' + line, publicCode: line, transportMode: mode },
      estimatedCalls: [
        { quay: { stopPlace: { id: 'NSR:StopPlace:Mortensrud', name: 'Mortensrud' } } },
        ...ahead.map((n, i) => ({
          quay: { stopPlace: { id: 'NSR:StopPlace:' + n, name: n, latitude: 59.9, longitude: 10.7 } },
          expectedArrivalTime: iso(mins[0] + 3 + i * 2),
        })),
      ],
    },
  },
});

// The reported screen at Mortensrud: two metros the same way out, five buses.
const STORTINGET = dir('Stortinget', '3', 'metro', [2, 17, 32], ['Skullerud', 'Bøler', 'Stortinget']);
const KOLSAS = dir('Kolsås', '3', 'metro', [11, 26, 41], ['Skullerud', 'Bøler', 'Kolsås']);
const BUSSER = [
  dir('Maikollen', '73X', 'bus', [0, 15, 30], ['Lofsrud']),
  dir('Bjørndal', '71', 'bus', [4, 8, 21], ['Lofsrud']),
];
const SCREEN = [STORTINGET, KOLSAS, ...BUSSER];

describe('nextMetro — the soonest metro you can actually catch', () => {
  // The heart of it, measured from the screenshot: 637 m away is about eight
  // minutes' walk, and the two-minute train is gone before you arrive.
  it('skips a departure the walk cannot reach', () => {
    expect(nextMetro(SCREEN, 'Mortensrud', NOW, 8).frontText).toBe('Kolsås');
  });

  it('takes the soonest when you are already at the stop', () => {
    expect(nextMetro(SCREEN, 'Mortensrud', NOW, 0).frontText).toBe('Stortinget');
  });

  // A later departure ON the soonest row still counts: «mot Stortinget» also
  // runs at 17, and that beats Kolsås at 11 only if 11 is unreachable.
  it('uses a later time on the same row when the first is unreachable', () => {
    expect(nextMetro([STORTINGET], 'Mortensrud', NOW, 8).frontText).toBe('Stortinget');
  });

  it('opens nothing when no metro can be caught at all', () => {
    expect(nextMetro(SCREEN, 'Mortensrud', NOW, 60)).toBe(null);
  });

  it('ignores buses however soon they are', () => {
    expect(nextMetro(BUSSER, 'Mortensrud', NOW, 0)).toBe(null);
    expect(BUSSER.map(dirRank)).not.toContain(0);
  });

  it('opens nothing when there is no metro', () => {
    expect(nextMetro([], 'Mortensrud', NOW, 0)).toBe(null);
    expect(nextMetro(null, 'Mortensrud', NOW, 0)).toBe(null);
  });

  // The sort switch moves metro rows to the bottom. Choosing by list position
  // would quietly follow the switch instead of the mode.
  it('does not care where the metro sits in the list', () => {
    const reversed = [...BUSSER, KOLSAS, STORTINGET];
    expect(nextMetro(reversed, 'Mortensrud', NOW, 8).frontText).toBe('Kolsås');
  });

  // A row whose times have all passed is one the screen has already stopped
  // showing. It must not be chosen off a raw nextMs still sitting in times.
  it('will not choose a row the list has stopped showing', () => {
    const gone = dir('Gammel', '3', 'metro', [-9, -4], ['Skullerud']);
    expect(nextMetro([gone], 'Mortensrud', NOW, 0)).toBe(null);
  });
});

describe('sameWayOut — never the opposite direction', () => {
  it('is true at a terminus, where both run the same way', () => {
    expect(sameWayOut([STORTINGET, KOLSAS], 'Mortensrud', NOW)).toBe(true);
  });

  // Tøyen: line 3 west and line 3 east are opposite. "Soonest" would be a
  // coin toss on which way the reader is sent.
  it('is false when the first stop differs', () => {
    const vest = dir('Vestli', '5', 'metro', [3], ['Grønland', 'Jernbanetorget']);
    const ost = dir('Bergkrystallen', '4', 'metro', [5], ['Ensjø', 'Helsfyr']);
    expect(sameWayOut([vest, ost], 'Tøyen', NOW)).toBe(false);
    expect(nextMetro([vest, ost], 'Tøyen', NOW, 0)).toBe(null);
  });

  it('is false when a direction has no stop after yours', () => {
    const endestopp = dir('Ingensteds', '3', 'metro', [4], []);
    expect(sameWayOut([STORTINGET, endestopp], 'Mortensrud', NOW)).toBe(false);
  });

  it('is true for a single direction, and false for none', () => {
    expect(sameWayOut([STORTINGET], 'Mortensrud', NOW)).toBe(true);
    expect(sameWayOut([], 'Mortensrud', NOW)).toBe(false);
  });
});

// ── walkMinsTo: one rule, two callers ──────────────────────────────────────
//
// walkInfo reads the ACTIVE ROUTE's station, so it could never answer "how
// far to the stop I am standing near". The arithmetic moved out; this is what
// stops the two from drifting apart, which is the failure shape this codebase
// has found eight times.
describe('walkMinsTo and walkInfo agree', () => {
  it('gives walkInfo the same answer for the same two points', async () => {
    vi.resetModules();
    vi.doMock('../src/state.js', () => ({
      state: { walkOvr: null, walkFromLL: null, homeLL: { lat: 59.8617, lon: 10.8285 },
        statLL: { out: { lat: 59.8674, lon: 10.8285 } }, dIdx: 0 },
      intervals: { board: null, track: null, sel: null },
    }));
    vi.doMock('../src/config.js', () => ({
      default: { defaultWalkMinutes: 8, dirs: [{ key: 'out' }],
        api: { geocoderReverse: 'x' } },
    }));
    const geo = await import('../src/geo.js');
    const stop = { lat: 59.8674, lon: 10.8285 };          // ~637 m north
    expect(geo.walkMinsTo(stop).mins).toBe(geo.walkInfo().mins);
    expect(geo.walkMinsTo(stop).dist).toBeGreaterThan(700);   // 637 m × 1.3
    vi.doUnmock('../src/state.js');
    vi.doUnmock('../src/config.js');
  });

  it('returns null without a position or without a stop', async () => {
    vi.resetModules();
    vi.doMock('../src/state.js', () => ({
      state: { walkOvr: null, walkFromLL: null, homeLL: null, statLL: {}, dIdx: 0 },
      intervals: { board: null, track: null, sel: null },
    }));
    vi.doMock('../src/config.js', () => ({
      default: { defaultWalkMinutes: 8, dirs: [{ key: 'out' }], api: { geocoderReverse: 'x' } },
    }));
    const geo = await import('../src/geo.js');
    expect(geo.walkMinsTo({ lat: 59.9, lon: 10.7 })).toBe(null);
    // …and walkInfo still falls back to the standard number, as it always has.
    expect(geo.walkInfo()).toEqual({ mins: 8, src: 'standard' });
    vi.doUnmock('../src/state.js');
    vi.doUnmock('../src/config.js');
  });
});
