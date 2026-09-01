import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/config.js', () => ({ default: { storage: { favs: 't.favs' } } }));
vi.mock('../src/storage.js', () => {
  let store = {};
  return { storage: {
    get: (k) => store[k] ?? null,
    set: (k, v) => { store[k] = v; },
    remove: (k) => { delete store[k]; },
    _reset: () => { store = {}; },
  } };
});

import { routeShortcuts, histToDir } from '../src/ui/favs.js';

const route = (from, to, over = {}) => ({
  type: 'route', id: from + '>' + to, from, to, createdAt: 1000, ...over,
});

const trip = (from, to, over = {}) => ({
  key: to.toLowerCase() + '|9|wd', fromName: from, toName: to,
  count: 1, lastUsed: 1000, ...over,
});
// The shortcuts row is scored with tripCount, which aggregates the history's
// hour/weekday buckets. Stubbed here so the two sources stay separable.
const counter = (map) => (from, to) => map[from + '>' + to] || 0;

describe('routeShortcuts', () => {
  it('puts the most used first', () => {
    const favs = [route('A', 'B', { uses: 1 }), route('C', 'D', { uses: 9 }), route('E', 'F', { uses: 4 })];
    expect(routeShortcuts(favs, [], null, 2).map(f => f.from)).toEqual(['C', 'E']);
  });

  // Reported: "hvor er favorittene mine / snarveiene". The row drew ONLY from
  // starred routes, and the button that stars one sits below the primary call
  // to action, off the bottom of a phone screen. So the app counted every
  // route you took and used the count only to rank a list that stayed empty.
  it('offers routes from the history, with nothing starred at all', () => {
    const hist = [trip('A', 'B'), trip('C', 'D')];
    const out = routeShortcuts([], hist, counter({ 'A>B': 3, 'C>D': 11 }), 2);
    expect(out.map(f => f.from + '>' + f.to)).toEqual(['C>D', 'A>B']);
    expect(out.every(o => o.saved === false)).toBe(true);
    expect(out[0].favId).toBeNull();
    expect(out[0].dir.from).toBe('C');
  });

  // A star is an explicit statement; a trip is an inference. It should beat
  // light use — and lose to a habit.
  it('lets a star outrank light use but not heavy use', () => {
    const beatsLight = routeShortcuts(
      [route('A', 'B')], [trip('C', 'D')], counter({ 'C>D': 3 }), 2);
    expect(beatsLight[0].from).toBe('A');            // star (5) > 3 trips

    const losesToHabit = routeShortcuts(
      [route('A', 'B')], [trip('C', 'D')], counter({ 'C>D': 30 }), 2);
    expect(losesToHabit[0].from).toBe('C');          // 30 trips > star (5)
  });

  // The starred copy carries stop ids, a via and a line filter that a history
  // row does not, so it must be the one that survives.
  it('keeps the starred copy when both describe the same journey', () => {
    const favs = [route('A', 'B', { stopId: 'NSR:1', line: '3' })];
    const out = routeShortcuts(favs, [trip('a', 'b')], counter({ 'A>B': 4 }), 2);
    expect(out).toHaveLength(1);
    expect(out[0].saved).toBe(true);
    expect(out[0].dir.line).toBe('3');
  });

  it('adds the two sources rather than preferring one', () => {
    const favs = [route('A', 'B', { uses: 5 }), route('C', 'D', { uses: 1 })];
    expect(routeShortcuts(favs, [], counter({ 'C>D': 9 }), 2).map(f => f.from)).toEqual(['C', 'A']);
  });

  it('breaks a tie on last used, then on newest', () => {
    const favs = [
      route('A', 'B', { uses: 2, lastUsedAt: 10 }),
      route('C', 'D', { uses: 2, lastUsedAt: 99 }),
    ];
    expect(routeShortcuts(favs, [], null, 2).map(f => f.from)).toEqual(['C', 'A']);
    const noUse = [route('A', 'B', { createdAt: 1 }), route('C', 'D', { createdAt: 50 })];
    expect(routeShortcuts(noUse, [], null, 2).map(f => f.from)).toEqual(['C', 'A']);
  });

  // A timed favourite is a departure ("3 08:15"), not a route — it cannot
  // stand in as a shortcut past the route form.
  it('leaves out timed favourites', () => {
    const favs = [{ type: 'timed', id: 't', from: 'A', to: 'B', uses: 99 }, route('C', 'D')];
    expect(routeShortcuts(favs, [], null, 2).map(f => f.from)).toEqual(['C']);
  });

  it('leaves out history rows that are missing an end', () => {
    const hist = [trip('A', 'B'), { key: 'x', toName: 'D', count: 99 }];
    expect(routeShortcuts([], hist, counter({ 'A>B': 1 }), 2).map(f => f.to)).toEqual(['B']);
  });

  it('returns what exists when there are fewer than two, and nothing when there are none', () => {
    expect(routeShortcuts([route('A', 'B')], [], null, 2)).toHaveLength(1);
    expect(routeShortcuts([], [], null, 2)).toEqual([]);
    expect(routeShortcuts(null, null, null, 2)).toEqual([]);
  });

  it('skips a malformed entry rather than throwing', () => {
    const favs = [null, { type: 'route' }, route('A', 'B')];
    expect(routeShortcuts(favs, [null, {}], null, 2).map(f => f.from)).toEqual(['A']);
  });
});

describe('histToDir', () => {
  // A history row knows less than a favourite. The fields it cannot fill are
  // left null rather than guessed, and geo falls back to the name exactly
  // where the id is missing — the same rule the deep-link receiver uses.
  it('carries the ids it has and geocodes only the end that lacks one', () => {
    const d = histToDir(trip('A', 'B', { fromStopId: 'NSR:1', toStopId: null, toLat: null }));
    expect(d.stopId).toBe('NSR:1');
    expect(d.geo).toBeNull();
    expect(d.toGeo).toBe('B');
    expect(d.line).toBeNull();
  });

  it('does not ask for a geocode when it has coordinates', () => {
    expect(histToDir(trip('A', 'B', { toLat: 59.9, toLon: 10.7 })).toGeo).toBeNull();
  });

  it('refuses a row that is not a route', () => {
    expect(histToDir(null)).toBeNull();
    expect(histToDir({ toName: 'B' })).toBeNull();
  });
});
