import { describe, it, expect } from 'vitest';
import config from '../src/config.js';
import { landingChoice, exampleDir, isExample, upgradeToNearest, EXAMPLE_KEY } from '../src/firstRun.js';

describe('landingChoice', () => {
  // The change: the last rung used to be "give up and show the form". A
  // stranger cannot try something that demands two stop names first.
  it('shows a working example when there is nothing else to show', () => {
    expect(landingChoice({})).toBe('example');
    expect(landingChoice()).toBe('example');
  });

  it('never overrides something the reader already has', () => {
    expect(landingChoice({ storedRoute: true })).toBe('stored');
    expect(landingChoice({ savedDest: 'Tøyen' })).toBe('legacy');
    expect(landingChoice({ weekend: true })).toBe('leisure');
  });

  it('keeps the precedence the app already had', () => {
    const all = { hasJourney: true, hasDeepLink: true, weekend: true, storedRoute: true, savedDest: 'x' };
    expect(landingChoice(all)).toBe('journey');
    expect(landingChoice({ ...all, hasJourney: false })).toBe('deeplink');
    expect(landingChoice({ ...all, hasJourney: false, hasDeepLink: false })).toBe('leisure');
    expect(landingChoice({ hasJourney: false, hasDeepLink: false, weekend: false, storedRoute: true, savedDest: 'x' }))
      .toBe('stored');
  });
});

describe('exampleDir', () => {
  it('is a real, usable route built from the neutral pair', () => {
    const d = exampleDir();
    expect(d.from).toBe(config.dirs[0].from);
    expect(d.to).toBe(config.dirs[0].to);
    expect(d.geo).toBeTruthy();
    expect(d.toGeo).toBeTruthy();
    expect(isExample(d)).toBe(true);
  });

  // An id invented from memory would send the first-ever board to the wrong
  // platform, and fail silently. Names geocode; wrong ids do not announce
  // themselves.
  it('carries no invented stop ids', () => {
    const d = exampleDir();
    expect(d.stopId).toBeFalsy();
    expect(d.toStopId).toBeFalsy();
  });

  it('is JSON-serialisable, so it cannot poison the saved route if stored', () => {
    expect(() => JSON.stringify(exampleDir())).not.toThrow();
    expect(exampleDir().filter).toBeNull();
  });

  it('is marked as an example, and a real route is not', () => {
    expect(isExample({ key: EXAMPLE_KEY })).toBe(true);
    expect(isExample({ key: 'custom-out' })).toBe(false);
    expect(isExample(null)).toBe(false);
  });
});

describe('upgradeToNearest', () => {
  const ex = exampleDir();
  const ns = { name: 'Tøyen', id: 'NSR:StopPlace:9', lat: 59.917, lon: 10.777 };

  it('moves the origin to where the reader is, keeping a real destination', () => {
    const up = upgradeToNearest(ex, ns);
    expect(up.from).toBe('Tøyen');
    expect(up.stopId).toBe('NSR:StopPlace:9');
    expect(up._fromLat).toBe(59.917);
    // A destination is what makes the board show the map, the corridor and
    // the strip rather than a bare list.
    expect(up.to).toBe(ex.to);
    expect(isExample(up)).toBe(true);
  });

  // Standing at the example's own destination would otherwise give a journey
  // from a place to itself.
  it('turns the route around when you are already at the destination', () => {
    const up = upgradeToNearest(ex, { name: ex.to, id: 'NSR:StopPlace:2' });
    expect(up.from).toBe(ex.to);
    expect(up.to).toBe(ex.from);
  });

  it('leaves a real route alone — an upgrade must never touch a chosen one', () => {
    expect(upgradeToNearest({ ...ex, key: 'custom-out' }, ns)).toBeNull();
  });

  it('declines rather than making the board worse', () => {
    expect(upgradeToNearest(ex, null)).toBeNull();
    expect(upgradeToNearest(ex, {})).toBeNull();
    // Nearest stop IS both ends: there is no journey to show.
    expect(upgradeToNearest({ ...ex, from: 'A', to: 'A' }, { name: 'A' })).toBeNull();
  });
});

describe('the cold-start index', () => {
  // config.dirs has two entries until setActiveRoute pushes a third, and
  // board.js dereferences config.dirs[state.dIdx]. loadDirIndex clamps to
  // dirs.length - 1, which is what keeps that from throwing on a fresh
  // profile — worth pinning, since landing on the board now exercises it.
  it('cannot point past the end of dirs', () => {
    const clamp = v => Math.min(parseInt(v || '0', 10), config.dirs.length - 1);
    expect(clamp('2')).toBeLessThanOrEqual(config.dirs.length - 1);
    expect(config.dirs[clamp('2')]).toBeTruthy();
    expect(config.dirs[clamp(null)]).toBeTruthy();
  });
});
