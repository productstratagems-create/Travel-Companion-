import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/state.js', () => ({
  state: {
    walkOvr: null, statLL: {}, homeLL: null, dIdx: 0,
    walkFromLL: null, nearestStation: null, nearestStations: [],
  },
  intervals: { board: null, track: null, sel: null },
}));
vi.mock('../src/config.js', () => ({
  default: { defaultWalkMinutes: 8, dirs: [{ key: 'out' }] },
}));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn() }));

import { isWalkActive, nearStopMatch } from '../src/geo.js';
import { state } from '../src/state.js';

const KERB  = { name: 'Skullerudstubben', id: 'NSR:StopPlace:6060', lat: 59.85, lon: 10.83, distM: 35,  type: 'onstreetBus' };
const METRO = { name: 'Skullerud',        id: 'NSR:StopPlace:6083', lat: 59.85, lon: 10.83, distM: 300, type: 'metroStation' };

function nearby(list) {
  state.nearestStations = list;
  state.nearestStation = list[0] || null;
}

beforeEach(() => {
  state.walkFromLL = null;
  nearby([]);
});

// The bug, as reported: after v1.76.0/v1.77.0 the nearest stop is the kerb,
// not the station the route departs from — so an equality against stops[0]
// switched the whole walk-time feature off.
describe('isWalkActive — the stop is nearby, not necessarily nearest', () => {
  it('is true when the route stop is further down the list', () => {
    nearby([KERB, METRO]);
    expect(isWalkActive({ key: 'custom-out', stopId: METRO.id, from: METRO.name })).toBe(true);
  });

  it('is true when only the name matches — a route saved before the ids moved', () => {
    nearby([KERB, { ...METRO, id: 'NSR:StopPlace:99999' }]);
    expect(isWalkActive({ key: 'custom-out', stopId: METRO.id, from: 'Skullerud, Oslo' })).toBe(true);
  });

  it('is false when the stop is not in range at all', () => {
    nearby([KERB]);
    expect(isWalkActive({ key: 'custom-out', stopId: METRO.id, from: METRO.name })).toBe(false);
  });

  it('is false for the trip home, even standing at the stop', () => {
    nearby([METRO]);
    expect(isWalkActive({ key: 'in', stopId: METRO.id, from: METRO.name })).toBe(false);
  });

  it('is true whenever an explicit walk-from place is set', () => {
    state.walkFromLL = { lat: 59.9, lon: 10.7 };
    expect(isWalkActive({ key: 'custom-out', stopId: null, from: null })).toBe(true);
  });
});

describe('nearStopMatch', () => {
  it('prefers the id over the name', () => {
    nearby([{ ...KERB, name: 'Skullerud' }, METRO]);
    expect(nearStopMatch(METRO.id, 'Skullerud').id).toBe(METRO.id);
  });

  it('does not match two unknown ids against each other', () => {
    nearby([{ ...KERB, id: null }]);
    expect(nearStopMatch(null, 'Et helt annet sted')).toBe(null);
  });

  it('returns null with nothing nearby', () => {
    expect(nearStopMatch(METRO.id, METRO.name)).toBe(null);
  });
});

// v1.218.180: grå prikk → ingen «rekker / rekker ikke» fra posisjonen.
import { posGrå, GRÅ_POS, posState } from '../src/position.js';
import { readFileSync } from 'node:fs';
describe('grå prikk dømmer ikke (v1.218.180)', () => {
  const dir = { key: 'custom-out', stopId: METRO.id, from: METRO.name };
  it('posisjon uten kjent alder (skjermbildet): ikke gangtid som dømmer', () => {
    nearby([METRO]); state.homeLL = { lat: 59.85, lon: 10.83 }; state.posAt = undefined;
    expect(posGrå(posState({ homeLL: state.homeLL, now: Date.now() }))).toBe(true);
    expect(isWalkActive(dir)).toBe(false);
  });
  it('fersk posisjon: dømmer som før', () => {
    nearby([METRO]); state.homeLL = { lat: 59.85, lon: 10.83 }; state.posAt = Date.now();
    expect(isWalkActive(dir)).toBe(true);
    state.homeLL = null; state.posAt = undefined;
  });
  it('kartets prikk og skjermene leser samme navn', () => {
    const map = readFileSync('src/ui/map.js', 'utf8');
    expect(map).toMatch(/const grå = posGrå\(ps\);/);
    expect(map).not.toMatch(/new Set\(\['gammel'/);
    expect([...GRÅ_POS]).toContain('ukjent-alder');
  });
  it('ingen målesetning ved siden av gangtida — «ca.» i stedet', () => {
    const b = readFileSync('src/views/board.js', 'utf8');
    expect(b).toMatch(/\(usikker \? 'ca\. ' : ''\) \+ wk\.mins \+ ' min gange'/);
    expect(b).not.toMatch(/\+ \(note \? ' · ' \+ note : ''\)/);
  });
});
