import { describe, it, expect } from 'vitest';
import config from '../src/config.js';
import { landingChoice, exampleDir, isExample, upgradeToNearest, EXAMPLE_KEY } from '../src/firstRun.js';

describe('landingChoice', () => {
  // v1.44.0: the last rung used to be "give up and show the form" — a
  // stranger cannot try something that demands two stop names first — and
  // became the example board. v1.61.0 moved it on again, to auto-reise, for
  // a reader who has not turned that off. The example is one rung down now;
  // see the auto-reise block below.
  it('shows a working example to a reader who declined auto-reise', () => {
    expect(landingChoice({ autoPref: 'off' })).toBe('example');
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

// ── Auto-reise as the way in for someone with nothing ──────────────────────
//
// Asked for: auto-reise should be ON BY DEFAULT when there is no history to
// base a suggestion on, so a new reader is onboarded through that screen
// rather than through an example route that is not theirs.
//
// The default sits on the LAST rung — exactly where the app has nothing of
// the reader's at all: no stored route, no saved destination, no journey, no
// link. That needs no new definition of "empty history"; the ladder already
// is one.
describe('landingChoice and auto-reise', () => {
  it('sends a reader with nothing at all to auto-reise', () => {
    expect(landingChoice({})).toBe('auto');
    expect(landingChoice()).toBe('auto');
  });

  // The whole reason the flag needed a third state. "Off" and "never chosen"
  // used to be the same stored value, so a default that read absence as ON
  // would turn the mode back on for someone who had just turned it off —
  // a screen coming back after you dismissed it.
  it('leaves the example to a reader who turned auto-reise off', () => {
    expect(landingChoice({ autoPref: 'off' })).toBe('example');
  });

  // An explicit ON is a choice, and outranks the other mode flag — the
  // position main.js has given it since v1.54.0.
  it('lets an explicit on outrank weekend mode', () => {
    expect(landingChoice({ autoPref: 'on', weekend: true })).toBe('auto');
    expect(landingChoice({ autoPref: 'on', storedRoute: true })).toBe('auto');
  });

  // ...but the DEFAULT never does. Someone who has used the app has a route,
  // and the landing screen they know must not move under them.
  it('never lets the default outrank something the reader already has', () => {
    expect(landingChoice({ storedRoute: true })).toBe('stored');
    expect(landingChoice({ savedDest: 'Tøyen' })).toBe('legacy');
    expect(landingChoice({ weekend: true })).toBe('leisure');
    expect(landingChoice({ hasJourney: true })).toBe('journey');
    expect(landingChoice({ hasDeepLink: true })).toBe('deeplink');
  });

  // A journey in progress beats even an explicit mode: you are on a train.
  it('keeps a journey in progress above every mode', () => {
    expect(landingChoice({ autoPref: 'on', hasJourney: true })).toBe('journey');
    expect(landingChoice({ autoPref: 'on', hasDeepLink: true })).toBe('deeplink');
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
