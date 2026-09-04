/**
 * Ranking the nearby stops by use.
 *
 * Asked for: "Rangér «du er ved» basert på bruk. Steder ofte i bruk kan
 * foreslås foran steder som er nærmere."
 *
 * That reverses v1.76.0's "nearest wins, always" — which was right then, when
 * the app preferred metro stations and hid kerbside bus stops entirely. Now
 * that every stop is in the list, the nearest is often one the reader has
 * never used. Reported from Mortensrud, where the stop they take every day
 * sat fifth at 649 m behind four they have never boarded.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/storage.js', () => {
  let store = {};
  return { storage: {
    get: (k) => store[k] ?? null,
    set: (k, v) => { store[k] = v; },
    remove: (k) => { delete store[k]; },
    _reset: () => { store = {}; },
  } };
});

import { rankStops, CLOSE_M } from '../src/views/auto.js';
import { depUses, usesOf, trackPlace } from '../src/api/usage.js';
import { storage } from '../src/storage.js';

beforeEach(() => storage._reset());

const s = (name, distM, id) => ({ name, distM, id: id || 'NSR:StopPlace:' + name });
const used = (name, n, id) => {
  for (let i = 0; i < n; i++) trackPlace('dep', name, { stopId: id || 'NSR:StopPlace:' + name });
};
const names = (list) => list.map(x => x.name);

// The reported screen, stop for stop.
const MORTENSRUD = [
  s('Olasrudveien', 369), s('Granebakken', 429), s('Stenbråten', 496),
  s('Maikollen', 548), s('Mortensrud', 649),
];

describe('the order before this change', () => {
  it('put the stop you take every day fifth', () => {
    // No history: distance alone, which is what shipped.
    expect(names(rankStops(MORTENSRUD, depUses()))).toEqual([
      'Olasrudveien', 'Granebakken', 'Stenbråten', 'Maikollen', 'Mortensrud']);
  });
});

describe('rankStops', () => {
  it('puts a stop you use ahead of nearer ones you never have', () => {
    used('Mortensrud', 14);
    expect(names(rankStops(MORTENSRUD, depUses()))[0]).toBe('Mortensrud');
  });

  it('orders several used stops by how often, then by distance', () => {
    used('Maikollen', 3);
    used('Mortensrud', 14);
    used('Granebakken', 3);
    expect(names(rankStops(MORTENSRUD, depUses()))).toEqual([
      'Mortensrud',                    // 14
      'Granebakken', 'Maikollen',      // 3 each — 429 m before 548 m
      'Olasrudveien', 'Stenbråten',    // never used, by distance
    ]);
  });

  // ── The half that is easy to lose ───────────────────────────────────────
  //
  // Standing at a bus stop you have never used, the app must not name
  // somewhere six hundred metres away. Inside GPS accuracy you are there.
  it('lets a stop you are standing at win anyway', () => {
    used('Mortensrud', 40);
    const list = [s('Ryenkrysset', 30), ...MORTENSRUD];
    expect(names(rankStops(list, depUses()))[0]).toBe('Ryenkrysset');
  });

  it('draws that line at CLOSE_M, in both directions', () => {
    used('Mortensrud', 40);
    const inside = [s('Nær', CLOSE_M), ...MORTENSRUD];
    const outside = [s('Nær', CLOSE_M + 1), ...MORTENSRUD];
    expect(names(rankStops(inside, depUses()))[0]).toBe('Nær');
    expect(names(rankStops(outside, depUses()))[0]).toBe('Mortensrud');
  });

  it('orders several very near stops by distance among themselves', () => {
    used('B', 40);
    expect(names(rankStops([s('B', 80), s('A', 20)], depUses()))).toEqual(['A', 'B']);
  });

  it('leaves the list alone when there is no history at all', () => {
    expect(names(rankStops(MORTENSRUD, depUses()))).toEqual(names(MORTENSRUD));
  });

  it('does not touch the array it was given', () => {
    used('Mortensrud', 5);
    const before = names(MORTENSRUD);
    rankStops(MORTENSRUD, depUses());
    expect(names(MORTENSRUD)).toEqual(before);
  });

  it('survives an empty or missing list, and a stop with no distance', () => {
    expect(rankStops([], depUses())).toEqual([]);
    expect(rankStops(null, depUses())).toEqual([]);
    used('Fjern', 2);
    expect(names(rankStops([s('Nær', 200), s('Fjern', null)], depUses())))
      .toEqual(['Fjern', 'Nær']);
  });
});

// ── The join ──────────────────────────────────────────────────────────────
//
// Every usage store keys on the lowercased NAME; stopId rides along and is
// null whenever the route came from a typed or geocoded place. So the name is
// the only join that always works, and the id is preferred when both sides
// have one.
describe('usesOf', () => {
  it('matches on the name whatever the case or spacing', () => {
    trackPlace('dep', '  Mortensrud  ', {});
    const u = depUses();
    expect(usesOf({ name: 'MORTENSRUD' }, u)).toBe(1);
    expect(usesOf({ name: 'mortensrud' }, u)).toBe(1);
  });

  it('prefers the stop id when both sides carry one', () => {
    used('Mortensrud', 7, 'NSR:StopPlace:6013');
    const u = depUses();
    // Same id, different name in the geocoder answer — the id still wins.
    expect(usesOf({ name: 'Mortensrud T', id: 'NSR:StopPlace:6013' }, u)).toBe(7);
  });

  it('does not treat two missing ids as a match', () => {
    trackPlace('dep', 'Mortensrud', {});          // stopId null
    const u = depUses();
    expect(usesOf({ name: 'Granebakken', id: null }, u)).toBe(0);
  });

  it('is zero for anything it has never seen', () => {
    const u = depUses();
    expect(usesOf({ name: 'Ukjent' }, u)).toBe(0);
    expect(usesOf(null, u)).toBe(0);
    expect(usesOf({ name: 'x' }, null)).toBe(0);
  });
});
