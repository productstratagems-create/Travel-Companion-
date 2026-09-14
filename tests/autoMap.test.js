/**
 * The orientation screen becomes spatial.
 *
 * auto-reise is where the app answers «where am I, where is the stop, how do
 * I get there, which departures matter». It answered the first three in text
 * — «du er ved Mortensrud T», «369 m» — and had no Leaflet import at all. The
 * walking time it needed for the fourth was computed in `_maybeAdvance` and
 * sent to the debug log.
 *
 * These tests drive the functions. The jump's existing tests read auto.js as
 * TEXT and assert on regexes; that is why the distance guard added here could
 * be deleted without a single failure, and it is the same weakness v1.97.1
 * found in the Bergen search. A grep cannot tell a screen that shows the walk
 * from one that computes it and throws it away.
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

import { mapKey, atStop, stopHeadHtml, resetAuto, _timesHtml } from '../src/views/auto.js';
import { AT_STOP_M } from '../src/api/approach.js';
import { storage } from '../src/storage.js';

beforeEach(() => { storage._reset(); resetAuto(); });

// ── The map is redrawn when something moved, not once a second ───────────
//
// The screen renders at 1 Hz. Without a key the layer would be cleared and
// refilled sixty times a minute, which the reader sees as flicker and the
// tile server sees as churn. The position is rounded to ~11 m because a fix
// jitters by a few metres while you stand still.
describe('mapKey', () => {
  const stop = { id: 'NSR:StopPlace:1', lat: 59.9, lon: 10.8 };
  const pos = { lat: 59.9012345, lon: 10.8012345 };

  it('is stable across GPS jitter below the rounding', () => {
    const a = mapKey(stop, pos, [], null);
    const b = mapKey(stop, { lat: 59.90123499, lon: 10.80123499 }, [], null);
    expect(b).toBe(a);
  });

  it('changes when you actually move', () => {
    const a = mapKey(stop, pos, [], null);
    const b = mapKey(stop, { lat: 59.9099, lon: 10.8099 }, [], null);
    expect(b).not.toBe(a);
  });

  it('changes when the stop changes', () => {
    const a = mapKey(stop, pos, [], null);
    const b = mapKey({ id: 'NSR:StopPlace:2', lat: 59.9, lon: 10.8 }, pos, [], null);
    expect(b).not.toBe(a);
  });

  // The walk lands asynchronously, after the first draw. If the key ignored
  // it the route would be fetched, stored, and never drawn — which is exactly
  // the bug v1.91.0 fixed for saveWalkDist.
  it('changes when the walking route arrives', () => {
    const a = mapKey(stop, pos, [], null);
    const b = mapKey(stop, pos, [], [[59.9, 10.8], [59.901, 10.801]]);
    expect(b).not.toBe(a);
  });

  it('changes when the set of nearby stops changes', () => {
    expect(mapKey(stop, pos, [{}, {}], null)).not.toBe(mapKey(stop, pos, [{}], null));
  });

  it('survives a missing position and a missing stop', () => {
    expect(() => mapKey(null, null, [], null)).not.toThrow();
    expect(mapKey(null, null, [], null)).toBe(mapKey(null, null, [], null));
  });
});

// ── May the app skip this screen? ────────────────────────────────────────
//
// Chosen: only when you are already standing at the stop. 600 m away the
// walking route and the walking time are the whole point of the screen, and
// jumping past them is jumping past the answer.
describe('atStop', () => {
  it('is true at the platform', () => {
    expect(atStop({ distM: 40 })).toBe(true);
  });

  it('is false while you still have to walk', () => {
    expect(atStop({ distM: 600 })).toBe(false);
  });

  // The boundary is the approach route's own number, so the two cannot
  // disagree about what "at the stop" means. If the walk is worth drawing,
  // it is worth reading.
  it('uses the same boundary the approach route draws from', () => {
    expect(atStop({ distM: AT_STOP_M - 1 })).toBe(true);
    expect(atStop({ distM: AT_STOP_M })).toBe(false);
  });

  // Unknown counts as not-at-the-stop: the failure mode is "the list stays",
  // which is today's screen, rather than a jump made on nothing.
  it('is false when the distance is unknown', () => {
    expect(atStop({ distM: null })).toBe(false);
    expect(atStop({})).toBe(false);
    expect(atStop(null)).toBe(false);
  });
});

// ── The heading says what the app already knew, on its own line ──────────
//
// Reported by screenshot from a phone in portrait: «Mortensrud» with
// «6014 m ▾» printed straight across it. v1.101.0 put three facts where one
// had been, in a space-between row of two children, and the name is one
// unbreakable word with no floor under it. Measured at 390px: a 35×16px
// collision.
describe('stopHeadHtml', () => {
  const stop = { name: 'Mortensrud T', distM: 369 };

  it('shows metres alone when there is no walk to report', () => {
    const h = stopHeadHtml(stop, 0, false, {});
    expect(h).toContain('369 m');
    expect(h).not.toContain('gange');
  });

  // THE TWO NUMBERS COME FROM ONE CALL, FROM ONE POSITION.
  //
  // They did not. `distM` is measured from wherever findNearestStation was
  // last called; walkMinsTo measures from `walkFromLL || homeLL`, and with a
  // «gå fra» place set those are different points permanently. The screenshot
  // showed «6014 m» beside «15 min gange» — six kilometres is over an hour on
  // foot, so they could not both be true. This is that case, and it fails
  // against the code that read stop.distM.
  it('prefers the distance the walk itself was measured over', () => {
    const far = { name: 'Mortensrud', distM: 6014 };
    const h = stopHeadHtml(far, 0, false, { walkDist: 1240, walkMins: 15 });
    expect(h).toContain('1240 m');
    expect(h).not.toContain('6014');
  });

  // A number that changes meaning without saying so is worse than two numbers
  // that disagree: «m» is now the distance you walk, not the crow line.
  it('says the metres are a walk when they are', () => {
    expect(stopHeadHtml(stop, 0, false, { walkDist: 480, walkMins: 6 }))
      .toContain('480 m å gå');
  });

  it('does not say «å gå» about the crow distance', () => {
    const h = stopHeadHtml(stop, 0, false, {});
    expect(h).toContain('369 m');
    expect(h).not.toContain('å gå');
  });

  it('falls back to the crow distance when there is no position', () => {
    const h = stopHeadHtml(stop, 0, false, { walkDist: null, walkMins: null });
    expect(h).toContain('369 m');
    expect(h).not.toContain('gange');
    expect(h).not.toContain('gammel');
  });

  it('shows the walking time beside the metres', () => {
    const h = stopHeadHtml(stop, 0, false, { walkDist: 480, walkMins: 5 });
    expect(h).toContain('5 min gange');
  });

  // The whole screen — heading, map, and the reach on every row — now leans
  // on the position being right. A twelve-minute-old fix has to say so.
  it('says when the position is stale', () => {
    const h = stopHeadHtml(stop, 0, false, { walkMins: 5, ageMins: 12 });
    expect(h).toContain('posisjon 12 min gammel');
  });

  it('says nothing about age while the fix is fresh', () => {
    const h = stopHeadHtml(stop, 0, false, { walkMins: 5, ageMins: null });
    expect(h).not.toContain('gammel');
  });

  // THE STRUCTURAL CLAIM: the name shares a row with nothing.
  //
  // Not a CSS assertion — a markup one. The facts must not be a sibling that
  // sits beside the name; they must be their own block under it. That is what
  // makes the collision impossible rather than merely unlikely.
  it('puts the facts outside the name, not inside it', () => {
    // Parsed, not sliced. A first version compared string offsets, and a
    // mutant that nested the facts INSIDE the name span survived it — the
    // substring between the two class names was still free of «480 m»
    // because the facts carried it along. Nesting is not ordering, so the
    // question has to be put to the DOM.
    const host = document.createElement('div');
    host.innerHTML = stopHeadHtml(stop, 0, false, { walkDist: 480, walkMins: 6 });
    const name = host.querySelector('.auto-stop-name');
    const facts = host.querySelector('.auto-stop-facts');
    expect(name).not.toBeNull();
    expect(facts).not.toBeNull();
    expect(name.contains(facts)).toBe(false);
    expect(facts.textContent).toContain('480 m');
  });

  // The name needs a box of its own to be given an ellipsis. It used to be a
  // bare text node beside the caret — which is also why a browser probe that
  // swept elements could not see it overflow: it had no box to measure.
  it('gives the name an element of its own', () => {
    expect(stopHeadHtml(stop, 0, false, {})).toContain('auto-stop-label');
  });

  // The caret must sit outside the truncated text, so the one part you cannot
  // guess is never the part that is cut.
  it('keeps the caret out of the truncated name', () => {
    const h = stopHeadHtml(stop, 3, false, {});
    const label = h.slice(h.indexOf('auto-stop-label'), h.indexOf('auto-stop-more'));
    expect(label).not.toContain('▾');
    expect(h).toContain('▾');
  });

  // The heading is a button when there are stops to fold. That contract is
  // untouched by the relayout.
  it('stays a button with its aria intact when there are alternatives', () => {
    const h = stopHeadHtml(stop, 3, false, { walkDist: 480, walkMins: 6 });
    expect(h).toContain('id="auto-stop-toggle"');
    expect(h).toContain('aria-expanded="false"');
    expect(h).toContain('aria-controls="auto-alts"');
  });

  it('is unchanged when nothing extra is known', () => {
    expect(stopHeadHtml(stop, 0, false)).toContain('369 m');
    expect(stopHeadHtml(stop, 0, false)).not.toContain('gange');
  });
});


// ── Which departures are actually relevant ───────────────────────────────
//
// The screen said «2 · 12 · 22 min» with no qualification, leaving the reader
// to work out whether the one in two minutes was reachable from 369 m away.
// The app had already worked it out and put the answer in the debug log.
describe('_timesHtml reach', () => {
  const NOW = 1_700_000_000_000;
  const at = (m) => NOW + m * 60000;
  const dir = { times: [at(2), at(12), at(22)], mins: 2 };

  // Today's behaviour, and it must survive: no position means no claim.
  it('marks nothing when the walk is unknown', () => {
    const h = _timesHtml(dir, NOW, null);
    expect(h).not.toMatch(/r-ok|r-soon|r-now|missed/);
    expect(h).toContain('2');
    expect(h).toContain('12');
    expect(h).toContain('22');
  });

  // The whole case in one assertion: five minutes on foot, so the departure
  // in two is gone and the one in twelve is the one to read.
  it('marks a departure you cannot walk to in time as missed', () => {
    const h = _timesHtml(dir, NOW, 5);
    expect(h).toMatch(/class="auto-t-next missed"/);
  });

  it('leaves a departure you can comfortably make alone', () => {
    const h = _timesHtml({ times: [at(30)], mins: 30 }, NOW, 5);
    expect(h).toMatch(/class="auto-t-next r-ok"/);
  });

  // NOTHING IS REMOVED — the same principle as v1.98.0's onward list. You may
  // choose to run, and a departure that vanishes without trace is worse than
  // one you can see you just missed. This is the single way "marked" turns
  // into "hidden" by accident.
  it('keeps every departure it had before marking them', () => {
    const before = _timesHtml(dir, NOW, null);
    const after = _timesHtml(dir, NOW, 5);
    const nums = (h) => (h.replace(/<[^>]*>/g, ' ').match(/\d+/g) || []);
    expect(nums(after)).toEqual(nums(before));
  });

  it('still drops departures that have already gone', () => {
    const h = _timesHtml({ times: [at(-5), at(9)], mins: -5 }, NOW, 3);
    expect(h.replace(/<[^>]*>/g, ' ')).not.toMatch(/-5/);
    expect(h).toContain('9');
  });

  it('is empty when every departure has gone, walk or no walk', () => {
    expect(_timesHtml({ times: [at(-5)], mins: -5 }, NOW, 3)).toBe('');
    expect(_timesHtml({ times: [at(-5)], mins: -5 }, NOW, null)).toBe('');
  });

  // The liveness check in nextRail and dirRows calls this with two arguments.
  // It must keep answering "is there anything here" identically.
  it('answers liveness the same with and without a walk', () => {
    expect(_timesHtml(dir, NOW) === '').toBe(_timesHtml(dir, NOW, 5) === '');
  });
});
