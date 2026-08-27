import { describe, it, expect } from 'vitest';
import { _trainPosition, SRC_LABEL } from '../src/views/trainPosition.js';
import { POS_STALE_MS } from '../src/geo.js';

const NOW = 1_700_000_000_000;
// A straight leg running east along one parallel, so "on the corridor" and
// "off it" are easy to state exactly.
const LAT = 59.9, LON0 = 10.75, DLON = 0.01;
const calls = [0, 1, 2, 3].map(i => ({
  quay: { stopPlace: { name: 'S' + i, latitude: LAT, longitude: LON0 + i * DLON } },
  aimedArrivalTime: new Date(NOW + i * 120_000).toISOString(),
  expectedArrivalTime: new Date(NOW + i * 120_000).toISOString(),
  aimedDepartureTime: new Date(NOW + i * 120_000 + 20_000).toISOString(),
  expectedDepartureTime: new Date(NOW + i * 120_000 + 20_000).toISOString(),
}));
const routePts = calls.map(c => [c.quay.stopPlace.latitude, c.quay.stopPlace.longitude]);
const LIVE_LL = { lat: LAT, lon: LON0 + 2.5 * DLON };

const base = {
  calls, routePts, snapDist: 50, now: NOW + 150_000, phase: 'riding',
  livePos: new Map([['SJ:1', { lat: LIVE_LL.lat, lon: LIVE_LL.lon, bearing: 90, lastUpdated: NOW + 150_000 }]]),
  journeyId: 'SJ:1',
  userLL: { lat: LAT, lon: LON0 + 1.5 * DLON },
  posAt: NOW + 150_000,
};
const at = (over) => _trainPosition({ ...base, ...over });

describe('_trainPosition — which sensor wins', () => {
  it('prefers your own fix while you are on board', () => {
    const p = at({});
    expect(p.src).toBe('gps');
    // Snapped onto the corridor, not the raw fix.
    expect(p.lat).toBeCloseTo(LAT, 4);
    expect(p.lon).toBeCloseTo(LON0 + 1.5 * DLON, 4);
  });

  it('falls to the operator feed when your fix has gone stale', () => {
    const p = at({ posAt: NOW + 150_000 - POS_STALE_MS - 1_000 });
    expect(p.src).toBe('live');
    expect(p.lon).toBeCloseTo(LIVE_LL.lon, 4);
  });

  it('falls to the timetable when neither is usable', () => {
    const p = at({ posAt: null, userLL: null, livePos: new Map() });
    expect(p.src).toBe('rutetid');
    expect(p.lat).toBeCloseTo(LAT, 3);
  });

  // The corridor snap is what separates "on the train" from "standing near
  // the line" or "GPS wandering indoors". Without it a stationary user drags
  // the train onto themselves.
  it('declines a fresh fix that is nowhere near the line', () => {
    const p = at({ userLL: { lat: LAT + 0.02, lon: LON0 + 1.5 * DLON } });   // ~2.2 km north
    expect(p.src).toBe('live');
  });

  it('never uses your fix when you are not on the train', () => {
    // Waiting on a platform: the phone is stationary and perfectly accurate,
    // and it is still not where the train is.
    expect(at({ phase: 'platform' }).src).toBe('live');
    expect(at({ phase: 'arrived' }).src).toBe('live');
  });

  it('rejects a stale operator fix too, rather than drifting on it', () => {
    // 150s old against a 60s rule, at a moment still inside the leg — so the
    // timetable has something to say and the stale feed must lose to it.
    const stale = new Map([['SJ:1', { ...LIVE_LL, bearing: 90, lastUpdated: NOW }]]);
    const p = at({ posAt: null, userLL: null, livePos: stale });
    expect(p.src).toBe('rutetid');
  });

  it('returns null only when there is nothing at all to draw', () => {
    expect(_trainPosition({ ...base, calls: [], userLL: null, livePos: new Map() })).toBeNull();
  });
});

describe('_trainPosition — heading', () => {
  it('carries the operator bearing when the operator supplied it', () => {
    expect(at({ posAt: null, userLL: null }).heading).toBe(90);
  });

  it('derives a heading from the line for a position that has none', () => {
    // Your phone reports no bearing worth trusting at walking speed, but the
    // segment you are on does.
    const p = at({});
    expect(p.heading).not.toBeNull();
    expect(Math.round(p.heading)).toBeGreaterThan(60);
    expect(Math.round(p.heading)).toBeLessThan(120);
  });
});

describe('SRC_LABEL — what the reader is told', () => {
  it('names each source in the app’s own words', () => {
    expect(SRC_LABEL.gps).toBe('din gps');
    expect(SRC_LABEL.live).toBe('sanntid');
    expect(SRC_LABEL.rutetid).toBe('etter rutetid');
  });
});

/**
 * Real track geometry (v1.25.0) makes the corridor guard mean what it says.
 *
 * The corridor used to be a chord between platforms. A train on a curve is
 * genuinely on the track and can still be hundreds of metres from that chord,
 * so a perfectly good fix was rejected and the marker fell back to the
 * timetable. Feeding the real alignment fixes the guard without touching it.
 */
describe('_trainPosition — the corridor guard against real geometry', () => {
  // The line bows north between stops 1 and 2; the chord cuts straight across.
  const BOW_LAT = LAT + 0.004;                       // ~440 m off the chord
  const realPts = [
    [LAT, LON0],
    [LAT, LON0 + DLON],
    [BOW_LAT, LON0 + 1.5 * DLON],
    [LAT, LON0 + 2 * DLON],
    [LAT, LON0 + 3 * DLON],
  ];
  const onTheBow = { lat: BOW_LAT, lon: LON0 + 1.5 * DLON };

  it('rejects a fix on the curve when the corridor is a straight chord', () => {
    const p = _trainPosition({ ...base, userLL: onTheBow });
    expect(p.src).toBe('live');
  });

  it('accepts the same fix once the corridor follows the track', () => {
    const p = _trainPosition({ ...base, userLL: onTheBow, routePts: realPts });
    expect(p.src).toBe('gps');
    expect(p.lat).toBeCloseTo(BOW_LAT, 4);
  });
});
