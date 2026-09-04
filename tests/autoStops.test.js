/**
 * The nearby-stops list folds away.
 *
 * Reported with a screenshot from Mortensrud: "Et klikk på stedet du er ved
 * collapses listen med holdeplasser i nærheten. Et nytt klikk expander listen
 * igjen."
 *
 * This is the second half of v1.77.0. Making distance the only rule meant a
 * dense stop offers seven alternatives, and measured on that screen they
 * pushed the first departure to y=490 of an 860px screen — 57% of it spent
 * before the thing the screen exists for. Every stop is still there; they are
 * just not in the way.
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

import { loadAutoStopsOpen, saveAutoStopsOpen } from '../src/geo.js';
import { stopHeadHtml, stopsOpen, pickStop } from '../src/views/auto.js';
import { storage } from '../src/storage.js';

beforeEach(() => storage._reset());

describe('loadAutoStopsOpen', () => {
  // Closed unless opened. Chosen deliberately: the departures are what the
  // screen is for, and they were below the fold.
  it('is closed when the reader has never chosen', () => {
    expect(loadAutoStopsOpen()).toBe(false);
  });

  it('round-trips both states', () => {
    saveAutoStopsOpen(true);
    expect(loadAutoStopsOpen()).toBe(true);
    saveAutoStopsOpen(false);
    expect(loadAutoStopsOpen()).toBe(false);
  });

  // Rubbish in storage is a real state: an older build, a hand-edited value,
  // a half-written key. It must land closed, never on undefined.
  it('falls to closed on a value it does not know', () => {
    storage.set('t.autoStops', 'kanskje');
    expect(loadAutoStopsOpen()).toBe(false);
  });

  it('travels with the profile', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/storage.js', 'utf8').replace(/\/\/.*$/gm, '');
    expect(src).toContain("'t.autoStops'");
  });
});

// ── The heading, which is also the fold ───────────────────────────────────
describe('stopHeadHtml', () => {
  const stop = { id: 'NSR:1', name: 'Mortensrud', distM: 649 };

  it('is a plain heading when there is nothing to fold away', () => {
    const html = stopHeadHtml(stop, 0, false);
    expect(html).toContain('<div class="auto-stop"');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('▾');
    expect(html).toContain('649 m');
  });

  it('is a button, closed, with the count beside the name', () => {
    const html = stopHeadHtml(stop, 7, false);
    expect(html).toContain('<button class="auto-stop"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('7 ▾');
    expect(html).toContain('Trykk for å vise');
  });

  // Open, the stops are on screen; a number counting what you are looking at
  // is noise.
  it('drops the count and turns the caret when open', () => {
    const html = stopHeadHtml(stop, 7, true);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('▴');
    expect(html).not.toContain('7 ▴');
    expect(html).toContain('Trykk for å skjule');
  });

  // The row is space-between. A third sibling pushes the name off its column
  // — settings.css warns about exactly this because it happened before.
  it('keeps the name and the caret in one left-hand group', () => {
    const html = stopHeadHtml(stop, 7, false);
    const nameSpan = html.slice(html.indexOf('auto-stop-name'), html.indexOf('nearby-dist'));
    expect(nameSpan).toContain('auto-stop-more');
  });

  it('escapes a stop name in both the label and the aria-label', () => {
    const html = stopHeadHtml({ name: 'A & <b>', distM: 10 }, 2, false);
    expect(html).not.toContain('<b>');
    expect(html).toContain('&amp;');
  });
});

describe('stopsOpen', () => {
  it('is never open with nothing in the list', () => {
    saveAutoStopsOpen(true);
    expect(stopsOpen(0)).toBe(false);
    expect(stopsOpen(3)).toBe(true);
  });

  it('follows the stored choice', () => {
    expect(stopsOpen(3)).toBe(false);
    saveAutoStopsOpen(true);
    expect(stopsOpen(3)).toBe(true);
  });
});

// ── The state may not live in the markup ──────────────────────────────────
//
// #auto-where has its whole innerHTML rewritten every second (scheduler.js,
// renderTickMs 1000). A toggle whose state were a class on that markup would
// be wiped before the reader let go of the button — and no unit test that
// only calls the render function once could see it.
describe('where the state lives', () => {
  const src = () => {
    const fs = require('node:fs');
    return fs.readFileSync('src/views/auto.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  };

  it('reads the toggle on every rebuild rather than once', () => {
    const all = src();
    const where = all.slice(all.indexOf('function _renderWhere'));
    expect(where).toContain('stopsOpen(');
  });

  it('writes it to storage rather than holding it in the markup', () => {
    const all = src();
    const where = all.slice(all.indexOf('function _renderWhere'));
    expect(where).toContain('saveAutoStopsOpen(');
  });
});

// ── Which stop the heading names ──────────────────────────────────────────
//
// Reported by screenshot: "du er ved Mortensrud, 649 m" with all seven
// alternatives under it NEARER, down to 369 m. Reproduced in the browser and
// it was worse than it looked — the heading read "Mortensrud T · 20 m" beside
// alternatives at 446 m, so the DISTANCE was stale too.
//
// The cause: `if (!_stop && list.length)`. locateUser resolves stops from the
// remembered position first so the screen has something before GPS warms up,
// then resolves again once you have moved 200 m. The second, better answer
// never reached the heading, because _stop was no longer null.
describe('pickStop', () => {
  const s = (id, distM) => ({ id, name: id, distM });
  const OLD = [s('Mortensrud', 20), s('Olasrudveien', 400)];
  const NEW = [s('Olasrudveien', 446), s('Granebakken', 497), s('Mortensrud', 695)];

  it('takes the nearest when there is nothing yet', () => {
    expect(pickStop(NEW, null, false)).toEqual({ stop: NEW[0], changed: true });
  });

  // The reported bug, as one assertion.
  it('follows a better fix when the app chose the stop', () => {
    const { stop, changed } = pickStop(NEW, OLD[0], false);
    expect(stop.id).toBe('Olasrudveien');
    expect(stop.distM).toBe(446);
    expect(changed).toBe(true);
  });

  // The reader tapped this one. A new fix must not overrule that.
  it('keeps the reader’s own choice', () => {
    const { stop, changed } = pickStop(NEW, OLD[0], true);
    expect(stop.id).toBe('Mortensrud');
    expect(changed).toBe(false);
  });

  // …but the metres are refreshed, because they picked a place, not a number.
  // This is the half the screenshot actually showed.
  it('refreshes the distance of a pinned stop', () => {
    expect(pickStop(NEW, s('Mortensrud', 20), true).stop.distM).toBe(695);
  });

  // Losing the reader's choice because they walked out of range is worse than
  // a distance going briefly stale.
  it('holds on to a pinned stop that has dropped out of the list', () => {
    const gone = s('Bortenfor', 900);
    expect(pickStop(NEW, gone, true).stop).toBe(gone);
  });

  it('keeps what it has when a fix returns nothing', () => {
    expect(pickStop([], OLD[0], false)).toEqual({ stop: OLD[0], changed: false });
    expect(pickStop(null, OLD[0], false)).toEqual({ stop: OLD[0], changed: false });
  });

  // Same stop, new metres, and NOT a change — clearing the departures every
  // time the distance moves a metre would refetch the board all day.
  it('does not call it a change when the nearest is still the same stop', () => {
    const { stop, changed } = pickStop([s('Olasrudveien', 450)], s('Olasrudveien', 446), false);
    expect(changed).toBe(false);
    expect(stop.distM).toBe(450);
  });
});
