import { describe, it, expect } from 'vitest';
import config from '../src/config.js';
import { landingChoice, exampleDir, isExample, upgradeToNearest, exampleFallback, AUTO_FALLBACK_MS, EXAMPLE_KEY } from '../src/firstRun.js';

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


// ── What a stranger actually gets (v1.110.0) ───────────────────────────────
//
// firstRun.js exists because the first screen was an empty two-field form:
// «You cannot *try* something that demands to be filled in first.» The answer
// was a working example board.
//
// Then v1.61.0 made the ladder's last rung auto-reise — a POSITION-FIRST
// screen — and the example became reachable only by a reader who had turned
// auto-reise off, which a first-time visitor cannot have done. Measured in the
// browser with nothing stored, the first impression was «Stedstjenester er
// avslått» and a link to the form. The same screen, by a different road.
describe('exampleFallback', () => {
  // THE REACHABILITY CLAIM, in one assertion. These two rules together are
  // what a stranger meets, and testing either alone is what let the gap open:
  // landingChoice was right, the example board was right, and no test asked
  // whether one could reach the other.
  it('makes the example board reachable for a stranger again', () => {
    const stranger = {};
    expect(landingChoice(stranger)).toBe('auto');
    expect(exampleFallback({ ...stranger, hasStop: false })).toBe(true);
  });

  it('stays out of the way when auto-reise has a stop', () => {
    expect(exampleFallback({ hasStop: true })).toBe(false);
  });

  // A position with no stop near it is an ANSWER, not an absence: «ingen
  // holdeplass innenfor 850 meter» is true and about the reader, and a board
  // about Jernbanetorget would trade that for something they cannot act on.
  // The browser probe fell back on the granted run and caught this.
  it('leaves a reader alone when the position already answered', () => {
    expect(exampleFallback({ hasStop: false, posKind: 'ingen-stopp' })).toBe(false);
  });

  // The moment they have something of their own, auto-reise is a screen they
  // chose. Throwing them onto a board about somewhere else would be worse than
  // saying plainly that the position is missing.
  it('never yanks a reader who has a route of their own', () => {
    expect(exampleFallback({ hasStop: false, storedRoute: true })).toBe(false);
    expect(exampleFallback({ hasStop: false, savedDest: 'Tøyen' })).toBe(false);
    expect(exampleFallback({ hasStop: false, hasJourney: true })).toBe(false);
  });

  // THE TRAP THIS RULE MUST NOT FALL INTO. main.js writes saveAutoMode(true)
  // the first time it lands on this rung, so from the second visit every
  // stranger carries autoPref === 'on'. A fallback keyed on the preference
  // would have worked exactly once, for exactly one visit.
  it('does not read the auto-mode preference, which is written on first landing', () => {
    expect(exampleFallback({ hasStop: false, autoPref: 'on' })).toBe(true);
  });

  it('survives being asked about nothing', () => {
    expect(() => exampleFallback(null)).not.toThrow();
  });

  // A window, not a race. Zero would bounce the reader before a fix could
  // arrive; a long one leaves a stranger looking at an apology.
  it('gives GPS a window worth having', () => {
    expect(AUTO_FALLBACK_MS).toBeGreaterThanOrEqual(2000);
    expect(AUTO_FALLBACK_MS).toBeLessThanOrEqual(8000);
  });
});

// The tenth copy of the stop normaliser, and one the v1.107.0 sweep missed:
// this file had its own lowercase-and-trim rule for «am I standing at the
// example's own destination».
describe('upgradeToNearest and the shared stop rule', () => {
  it('knows Nationaltheatret T is Nationaltheatret, and turns the route around', () => {
    const ex = exampleDir();
    const up = upgradeToNearest(ex, { name: ex.to + ' T', id: 'NSR:StopPlace:1' });
    expect(up).not.toBeNull();
    expect(up.to).toBe(ex.from);
  });

  // THE JOURNEY FROM A PLACE TO ITSELF, which the old rule could still build.
  // The geocoder appends the municipality, so standing at the example's own
  // destination gives «Nationaltheatret, Oslo». Under the file's own
  // lowercase-and-trim rule that was NOT the destination — the comma survived
  // — so the swap never happened and the reader got a board from
  // Nationaltheatret to Nationaltheatret. stopKey cuts at the comma, so the
  // swap fires and the route turns around instead.
  it('turns around rather than building a journey from a place to itself', () => {
    const ex = exampleDir();
    const up = upgradeToNearest(ex, { name: ex.to + ', Oslo', id: 'NSR:StopPlace:2' });
    expect(up).not.toBeNull();
    expect(up.to).toBe(ex.from);
    expect(up.to).not.toBe(ex.to);
  });
});

// ── The wiring (the mutant the rules could not kill) ───────────────────────
//
// The rule was right and nothing happened, twice over: startBoard() states in
// its own comment that it assumes the board is already the visible screen — it
// does not navigate — so calling it alone left the reader looking at
// auto-reise while a board they could not see fetched departures behind it.
// The probe reported no change at all and was right both times.
//
// Asserted against the source because the landing runs at module scope in
// main.js: importing it stands the whole app up, and the thing worth holding
// is precisely that these two calls stay together.
describe('the fallback actually navigates', () => {
  it('shows the board as well as starting it', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/main.js', 'utf8');
    const i = src.indexOf('exampleFallback({');
    expect(i).toBeGreaterThan(-1);
    // COMMENTS STRIPPED FIRST. The prose above the code names startBoard()
    // while explaining that it does not navigate, so an ordering check against
    // the raw text failed on this file's own documentation.
    const block = src.slice(i, i + 2500).replace(/\/\/[^\n]*/g, '');
    // The two calls, adjacent and in this order. Starting a board nobody can
    // see is the bug; asserting them as a sequence is what holds them together.
    expect(block).toMatch(/show\('v-board'\);\s*startBoard\(\);/);
  });
});
