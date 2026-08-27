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

import { topFavRoutes } from '../src/ui/favs.js';

const route = (from, to, over = {}) => ({
  type: 'route', id: from + '>' + to, from, to, createdAt: 1000, ...over,
});

describe('topFavRoutes', () => {
  it('puts the most used first', () => {
    const favs = [route('A', 'B', { uses: 1 }), route('C', 'D', { uses: 9 }), route('E', 'F', { uses: 4 })];
    expect(topFavRoutes(favs, null, 2).map(f => f.from)).toEqual(['C', 'E']);
  });

  // A fresh counter is zero for everyone, so without this the top two would
  // be arbitrary for weeks. The trip history already holds real counts.
  it('falls back on recorded trips when the counter is still empty', () => {
    const favs = [route('A', 'B'), route('C', 'D')];
    const hist = (from, to) => (to === 'D' ? 7 : 0);
    expect(topFavRoutes(favs, hist, 2).map(f => f.from)).toEqual(['C', 'A']);
  });

  it('adds the two sources rather than preferring one', () => {
    const favs = [route('A', 'B', { uses: 5 }), route('C', 'D', { uses: 1 })];
    const hist = (from, to) => (to === 'D' ? 9 : 0);   // 1+9 beats 5+0
    expect(topFavRoutes(favs, hist, 2).map(f => f.from)).toEqual(['C', 'A']);
  });

  it('breaks a tie on last used, then on newest', () => {
    const favs = [
      route('A', 'B', { uses: 2, lastUsedAt: 10 }),
      route('C', 'D', { uses: 2, lastUsedAt: 99 }),
    ];
    expect(topFavRoutes(favs, null, 2).map(f => f.from)).toEqual(['C', 'A']);
    const noUse = [route('A', 'B', { createdAt: 1 }), route('C', 'D', { createdAt: 50 })];
    expect(topFavRoutes(noUse, null, 2).map(f => f.from)).toEqual(['C', 'A']);
  });

  // A timed favourite is a departure ("3 08:15"), not a route — it cannot
  // stand in as a shortcut past the route form.
  it('leaves out timed favourites', () => {
    const favs = [{ type: 'timed', id: 't', from: 'A', to: 'B', uses: 99 }, route('C', 'D')];
    expect(topFavRoutes(favs, null, 2).map(f => f.from)).toEqual(['C']);
  });

  it('returns what exists when there are fewer than two, and nothing when there are none', () => {
    expect(topFavRoutes([route('A', 'B')], null, 2)).toHaveLength(1);
    expect(topFavRoutes([], null, 2)).toEqual([]);
    expect(topFavRoutes(null, null, 2)).toEqual([]);
  });

  it('skips a malformed entry rather than throwing', () => {
    const favs = [null, { type: 'route' }, route('A', 'B')];
    expect(topFavRoutes(favs, null, 2).map(f => f.from)).toEqual(['A']);
  });
});
