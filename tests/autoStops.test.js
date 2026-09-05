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

import { stopHeadHtml, stopsOpen, pickStop, resetAuto, _setStopsOpen } from '../src/views/auto.js';
import { storage } from '../src/storage.js';

beforeEach(() => storage._reset());

// ── The list starts collapsed every time ─────────────────────────────────
//
// v1.79.0 stored the choice, so "collapsed by default" only held until the
// first tap: after that the list was open for ever, and the reported
// behaviour was the opposite of the default. Reported back as "«Du er her»
// feltet starter collapsed" — an instruction, not an observation.
//
// It is a module variable now, cleared by resetAuto when the screen is
// entered, exactly as _openRuns already was for the folded stretches.
describe('stopsOpen', () => {
  it('is closed when the screen is entered', () => {
    _setStopsOpen(true);
    resetAuto();
    expect(stopsOpen(7)).toBe(false);
  });

  // The reported bug, as an assertion: a value left over from v1.79.0 must
  // no longer mean anything at all.
  it('ignores a choice stored by the build that stored one', () => {
    storage.set('t.autoStops', '1');
    resetAuto();
    expect(stopsOpen(7)).toBe(false);
  });

  it('stays open while you are on the screen', () => {
    resetAuto();
    _setStopsOpen(true);
    expect(stopsOpen(7)).toBe(true);
    expect(stopsOpen(7)).toBe(true);   // a redraw does not close it
  });

  // A heading that folds away an empty list is a control that cannot change
  // anything, which is worse than no control.
  it('is never open with nothing in the list', () => {
    _setStopsOpen(true);
    expect(stopsOpen(0)).toBe(false);
  });

  it('is not stored any more', async () => {
    const fs = await import('node:fs');
    const src = ['src/views/auto.js', 'src/geo.js']
      .map(f => fs.readFileSync(f, 'utf8')).join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).not.toContain('saveAutoStopsOpen');
    expect(src).not.toContain('loadAutoStopsOpen');
    // …but the key stays listed, so a stale value is still deleted with the
    // profile that made it.
    const st = fs.readFileSync('src/storage.js', 'utf8');
    expect(st).toContain("'t.autoStops'");
  });
});

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

  // Not a class on the markup, and not storage either — a module variable,
  // which is the only shape that both survives the redraw AND starts fresh
  // when the reader comes back to the screen.
  it('holds it outside the markup, not as a class on it', () => {
    const all = src();
    const where = all.slice(all.indexOf('function _renderWhere'), all.indexOf('function _load'));
    expect(where).not.toMatch(/classList\.(toggle|add|remove)/);
  });

  it('is cleared when the screen is entered', () => {
    const all = src();
    const reset = all.slice(all.indexOf('export function resetAuto'));
    expect(reset).toContain('_stopsShown = false');
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

// ── ↻ has to reach the register too ──────────────────────────────────────
//
// Measured, and it is why the first version of v1.84.2 did nothing: the
// button cleared the store, but the screen still believed it had already
// asked, so no new request followed and the diagnostic line never came back.
// Two pieces of "have we asked" in two files, which had to agree.
describe('resetAuto and the register', () => {
  it('forgets that it has asked about the hubs', () => {
    const fs = require('node:fs');
    const src = fs.readFileSync('src/views/auto.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const reset = src.slice(src.indexOf('export function resetAuto'));
    expect(reset).toContain('_hubsAskedFor = null');
  });
});
