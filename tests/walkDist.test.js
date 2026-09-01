/**
 * The walk to your stop was always crow-flight × 1.3. That number decides
 * when the app tells you to leave the house, so replacing it with a measured
 * route is the riskiest kind of improvement: more true on average, and worse
 * than useless on the day the router says something silly. The sanity band is
 * what makes it safe, and it is what these tests are mostly about.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { walkKey, plausible, getWalkDist, saveWalkDist } from '../src/api/walkDist.js';

const A = { lat: 59.8617, lon: 10.8285 };
const B = { lat: 59.8700, lon: 10.8300 };
// A line of points roughly A → B, ~930 m end to end.
const ROUTE = [[59.8617, 10.8285], [59.8650, 10.8300], [59.8700, 10.8300]];
const CROW = 930;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('__activeProfile', 'default');
});

describe('walkKey', () => {
  // Four decimals is about 11 m. Finer and a phone standing still misses its
  // own entry every few seconds and re-fetches for ever.
  it('survives GPS jitter but separates real doorways', () => {
    expect(walkKey(A, B)).toBe(walkKey({ lat: 59.86171, lon: 10.82849 }, B));
    expect(walkKey(A, B)).not.toBe(walkKey({ lat: 59.8630, lon: 10.8285 }, B));
  });

  it('is directional — the walk back is a different walk', () => {
    expect(walkKey(A, B)).not.toBe(walkKey(B, A));
  });
});

describe('plausible', () => {
  // A route shorter than the straight line between its ends is impossible;
  // one over three times it is a router that snapped an end onto the wrong
  // side of a fjord. Either way the old estimate is the better answer.
  it('rejects the impossible and the absurd, keeps the ordinary', () => {
    expect(plausible(1200, 1000)).toBe(true);     // a normal detour
    expect(plausible(1000, 1000)).toBe(true);     // dead straight
    expect(plausible(600, 1000)).toBe(false);     // shorter than the crow flies
    expect(plausible(3500, 1000)).toBe(false);    // round the fjord
  });

  it('says no to nothing rather than throwing', () => {
    expect(plausible(0, 1000)).toBe(false);
    expect(plausible(1200, 0)).toBe(false);
    expect(plausible(null, null)).toBe(false);
    expect(plausible(NaN, 1000)).toBe(false);
  });
});

describe('the round trip', () => {
  it('measures the line it was given and reads it back', () => {
    const saved = saveWalkDist(A, B, ROUTE, CROW);
    expect(saved).toBeGreaterThan(CROW * 0.95);
    expect(getWalkDist(A, B, CROW)).toBe(saved);
  });

  it('has nothing for a pair it has not seen', () => {
    expect(getWalkDist(A, B, CROW)).toBeNull();
    expect(getWalkDist(null, B, CROW)).toBeNull();
  });

  // The guard has to hold on the way IN as well as the way out — a bad route
  // that gets stored is a bad number every morning until the cache rolls.
  it('refuses to store a route the band rejects', () => {
    expect(saveWalkDist(A, B, ROUTE, 100)).toBeNull();   // 930 m route, 100 m crow
    expect(getWalkDist(A, B, 100)).toBeNull();
  });

  it('refuses a shape that is not a line', () => {
    expect(saveWalkDist(A, B, [[59.86, 10.82]], CROW)).toBeNull();
    expect(saveWalkDist(A, B, null, CROW)).toBeNull();
  });

  it('survives corrupt storage rather than throwing', () => {
    localStorage.setItem('default::t.walkDist', '{oops');
    expect(getWalkDist(A, B, CROW)).toBeNull();
  });
});
