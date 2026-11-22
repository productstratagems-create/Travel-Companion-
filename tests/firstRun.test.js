import { describe, it, expect } from 'vitest';
import config from '../src/config.js';
import { landingChoice } from '../src/firstRun.js';

describe('landingChoice', () => {
  // v1.44.0: the last rung used to be "give up and show the form" — a
  // stranger cannot try something that demands two stop names first — and
  // became the example board. v1.61.0 moved it on again, to auto-reise, for
  // a reader who has not turned that off. The example is one rung down now;
  // see the auto-reise block below.
  it('shows a working example to a reader who declined auto-reise', () => {
    expect(landingChoice({ autoPref: 'off' })).toBe('rute');
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
    expect(landingChoice({ autoPref: 'off' })).toBe('rute');
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
