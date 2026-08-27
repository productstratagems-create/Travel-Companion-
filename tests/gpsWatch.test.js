import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const state = { walkOvr: null, statLL: {}, homeLL: null, dIdx: 0,
                nearestStation: null, nearestStations: [], gpsError: null, posAt: null };
vi.mock('../src/state.js', () => ({ state, intervals: {} }));
vi.mock('../src/config.js', () => ({
  default: { defaultWalkMinutes: 8, dirs: [{ key: 'out' }], api: { geocoderReverse: 'https://x/reverse' } },
}));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn() }));

const setItem = vi.fn();
vi.mock('../src/storage.js', () => ({
  storage: { get: () => null, set: (...a) => setItem(...a), remove: vi.fn() },
}));

// Every reverse-geocode returns one station, so calls can simply be counted.
const geocode = vi.fn(() => Promise.resolve({
  json: () => Promise.resolve({ features: [{
    properties: { name: 'Mortensrud', id: 'NSR:StopPlace:1', category: ['metroStation'] },
    geometry: { coordinates: [10.82, 59.86] },
  }] }),
}));
vi.mock('../src/api/http.js', () => ({ enturFetch: (...a) => geocode(...a) }));

// One metre of latitude, near enough at Oslo's latitude for a walk fixture.
const M = 1 / 111_320;
const fix = (lat, lon, accuracy, ts) => ({
  coords: { latitude: lat, longitude: lon, accuracy: accuracy == null ? 8 : accuracy },
  timestamp: ts == null ? Date.now() : ts,
});

let cb, cleared, locateUser;
beforeEach(async () => {
  geocode.mockClear(); setItem.mockClear();
  state.homeLL = null; state.nearestStation = null; state.posAt = null;
  cleared = [];
  vi.stubGlobal('navigator', {
    geolocation: {
      watchPosition: (ok) => { cb = ok; return 7; },
      clearWatch: (id) => cleared.push(id),
    },
  });
  // geo.js holds the watch id at module scope for the session's lifetime, so
  // each test needs its own module instance rather than the previous test's
  // still-running watch.
  vi.resetModules();
  ({ locateUser } = await import('../src/geo.js'));
});
afterEach(() => vi.unstubAllGlobals());

const settle = () => new Promise(r => setTimeout(r, 0));

/**
 * Drift used to be measured from the *previous fix* rather than from where the
 * stations were last resolved. Fixes arrive about once a second, each a metre
 * or two from the last, so the 200 m threshold never tripped while walking:
 * walk 800 m to a different station and the app still believed you were at the
 * old one — and isWalkActive(), and the whole walk-time feature, hang off that.
 */
describe('the nearest station, while actually walking', () => {
  it('re-resolves once the walk has covered the threshold', async () => {
    locateUser(() => {}, () => {});
    // First fix: resolves stations once.
    cb(fix(59.8600, 10.8200));
    await settle();
    expect(geocode).toHaveBeenCalledTimes(1);

    // 400 metres, two at a time — the cadence of a real walk.
    for (let i = 1; i <= 200; i++) { cb(fix(59.8600 + i * 2 * M, 10.8200)); }
    await settle();

    // Once more for crossing 200 m, not zero times and not once per fix.
    expect(geocode.mock.calls.length).toBeGreaterThan(1);
    expect(geocode.mock.calls.length).toBeLessThan(5);
  });

  it('does not re-resolve while you stay put', async () => {
    locateUser(() => {}, () => {});
    cb(fix(59.8600, 10.8200));
    await settle();
    for (let i = 0; i < 100; i++) cb(fix(59.8600 + (i % 3) * M, 10.8200));
    await settle();
    expect(geocode).toHaveBeenCalledTimes(1);
  });
});

describe('the watch is released when the page is hidden', () => {
  it('clears on hidden and re-arms on visible, keeping the position', async () => {
    locateUser(() => {}, () => {});
    cb(fix(59.8600, 10.8200));
    await settle();
    const before = { ...state.homeLL };

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    // toContain, not toEqual: resetModules gives each test a fresh module but
    // jsdom's document is shared, so earlier instances' listeners still fire.
    // In the app the module loads once and binds once.
    expect(cleared).toContain(7);

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    // The point of pausing is battery, not amnesia.
    expect(state.homeLL).toEqual(before);
    cb(fix(59.8601, 10.8200));
    expect(state.homeLL).not.toBeNull();
  });
});

describe('the position carries its own age', () => {
  it('records when the fix was taken, so staleness can be told', async () => {
    locateUser(() => {}, () => {});
    cb(fix(59.8600, 10.8200, 8, 1_700_000_000_000));
    await settle();
    expect(state.posAt).toBe(1_700_000_000_000);
  });

  it('does not advance the timestamp for a fix too noisy to use', async () => {
    locateUser(() => {}, () => {});
    cb(fix(59.8600, 10.8200, 8, 1_000));
    await settle();
    cb(fix(59.8700, 10.8300, 250, 9_000));   // beyond ACC_GATE
    expect(state.posAt).toBe(1_000);
  });
});

describe('persisting the position', () => {
  // A synchronous localStorage write on every fix is ~60 main-thread writes a
  // minute while walking.
  it('writes at most once per throttle window, not once per fix', async () => {
    locateUser(() => {}, () => {});
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 60; i++) cb(fix(59.8600 + i * 2 * M, 10.8200, 8, t0 + i * 1000));
    await settle();
    const writes = setItem.mock.calls.filter(c => String(c[0]).includes('homeLL')).length;
    expect(writes).toBeGreaterThan(0);
    expect(writes).toBeLessThanOrEqual(8);
  });
});
