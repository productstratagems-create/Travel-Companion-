/**
 * «Din vanlige 08:12 går ikke nå.»
 *
 * The app held both halves and never put them together: a starred departure
 * with its time (`addTimedFav`, ui/favs.js) and today's departures
 * (`state.deps`). `loadFavs` was even IMPORTED into views/board.js and never
 * called — the connection existed as a dead import.
 *
 * No model and no server: the privacy page promises there is no backend and
 * that promise stands. Two values the device already holds, compared.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  usualState, pickUsual, hhmmAt, RETIMED_TOL_MINS, SAME_TOL_MINS,
} from '../src/api/usual.js';
import { BOARD_WINDOW_MINS } from '../src/api/queries.js';

// Local, not UTC: a fixed-offset fixture has been wrong in this codebase
// six times, and this module is built entirely on wall-clock times.
const NOW = new Date(2026, 8, 21, 7, 50).getTime();
const W = BOARD_WINDOW_MINS;
const MIN = 60000;

const FAV = { type: 'timed', from: 'Ryen', to: 'Oslo S', line: '3', departureHHMM: '08:12' };
const dep = (hhmm, o) => {
  const [h, m] = hhmm.split(':').map(Number);
  return {
    expectedDepartureTime: new Date(2026, 8, 21, h, m).toISOString(),
    cancellation: !!(o && o.cancelled),
    serviceJourney: { line: { publicCode: (o && o.line) || '3' } },
  };
};
const st = o => usualState({ fav: FAV, now: NOW, windowMins: W, deps: [], ...o });

// ── THE BEFORE PICTURE ───────────────────────────────────────
describe('the gap this release closes', () => {
  it('board.js had the favourites imported and never used', () => {
    // Not a general claim — the specific dead import, so this case fails
    // the day someone removes the feature rather than the import.
    const src = fs.readFileSync('src/views/board.js', 'utf8');
    expect(src).toMatch(/import \{ loadFavs \}/);
    expect(src).toMatch(/pickUsual|usualState/);
  });
});

describe('usualState', () => {
  it('is silent when your usual departure is simply there', () => {
    expect(st({ deps: [dep('08:12')] })).toEqual({ kind: 'finnes', label: '' });
  });

  it('says when it has moved, and to when', () => {
    const v = st({ deps: [dep('08:19')] });
    expect(v.kind).toBe('flyttet');
    expect(v.label).toContain('08:12');
    expect(v.label).toContain('08:19');
  });

  it('says when it is cancelled', () => {
    expect(st({ deps: [dep('08:12', { cancelled: true })] }).kind).toBe('innstilt');
  });

  // Cancellation outranks the clock: listed-and-cancelled is worse news
  // than moved, and the reader needs the worse news first.
  it('puts a cancellation above a retiming', () => {
    expect(st({ deps: [dep('08:19', { cancelled: true })] }).kind).toBe('innstilt');
  });

  it('says when it is not on the board at all', () => {
    expect(st({ deps: [] }).kind).toBe('borte');
    expect(st({ deps: [dep('09:10')] }).kind).toBe('borte');
  });

  // THE DISCIPLINE FROM v1.122.0, and the assertion the whole release
  // rests on. The board asks ninety minutes forward. «It is not running»
  // said about a window we never queried is that exact fault, committed
  // somewhere the reader would believe us.
  it('stays silent about a time it never asked about', () => {
    const early = new Date(2026, 8, 21, 6, 0).getTime();   // 08:12 is 132 min out
    expect(usualState({ fav: FAV, deps: [], now: early, windowMins: W }).kind)
      .toBe('utenfor-vindu');
  });

  it('on the boundary: inside speaks, outside is quiet', () => {
    const target = hhmmAt('08:12', NOW);
    const justInside = target - W * MIN;
    expect(usualState({ fav: FAV, deps: [], now: justInside, windowMins: W }).kind).toBe('borte');
    expect(usualState({ fav: FAV, deps: [], now: justInside - MIN, windowMins: W }).kind)
      .toBe('utenfor-vindu');
  });

  it('says nothing once the time has gone', () => {
    const late = new Date(2026, 8, 21, 8, 30).getTime();
    expect(usualState({ fav: FAV, deps: [], now: late, windowMins: W }).kind).toBe('passert');
  });

  // On each side of the tolerance: beyond it, that is not your departure
  // running late — it is a different one.
  it('tells a retimed departure from a different one', () => {
    const inside = new Date(2026, 8, 21, 8, 12 + RETIMED_TOL_MINS);
    const outside = new Date(2026, 8, 21, 8, 12 + RETIMED_TOL_MINS + 1);
    const at = d => ({ expectedDepartureTime: d.toISOString(), cancellation: false,
      serviceJourney: { line: { publicCode: '3' } } });
    expect(st({ deps: [at(inside)] }).kind).toBe('flyttet');
    expect(st({ deps: [at(outside)] }).kind).toBe('borte');
  });

  it('treats a couple of minutes as the same departure, not a retiming', () => {
    expect(st({ deps: [dep('08:' + (12 + SAME_TOL_MINS))] }).kind).toBe('finnes');
    expect(st({ deps: [dep('08:' + (12 + SAME_TOL_MINS + 1))] }).kind).toBe('flyttet');
  });

  // A starred row that lost its publicCode must not match every bus at the
  // stop; and with a line, another line's departure is not yours.
  it('matches on the line when it has one', () => {
    expect(st({ deps: [dep('08:12', { line: '23' })] }).kind).toBe('borte');
    expect(usualState({ fav: { ...FAV, line: null }, deps: [dep('08:12', { line: '23' })],
      now: NOW, windowMins: W }).kind).toBe('finnes');
  });

  it('says nothing without a favourite, or with a malformed one', () => {
    expect(usualState({ fav: null, deps: [], now: NOW, windowMins: W }).kind).toBe('ingen');
    expect(usualState({ fav: { type: 'timed', departureHHMM: 'i morgen' }, deps: [],
      now: NOW, windowMins: W }).kind).toBe('ingen');
  });

  // Six states. One sentence for several is the bug this codebase has
  // shipped twice; the silent ones must carry no text at all.
  it('tells its states apart, and the quiet ones stay quiet', () => {
    const spoken = [
      st({ deps: [dep('08:19')] }), st({ deps: [dep('08:12', { cancelled: true })] }),
      st({ deps: [] }),
    ].map(v => v.label);
    expect(new Set(spoken).size).toBe(3);
    for (const v of [st({ deps: [dep('08:12')] }),
      usualState({ fav: FAV, deps: [], now: new Date(2026, 8, 21, 6, 0).getTime(), windowMins: W }),
      usualState({ fav: null, deps: [], now: NOW, windowMins: W })]) {
      expect(v.label).toBe('');
    }
  });
});

describe('pickUsual — relevant, not global', () => {
  const DIR = { from: 'Ryen', to: 'Oslo S' };

  it('picks a favourite for the route on screen', () => {
    expect(pickUsual([FAV], DIR, NOW, W)).toBe(FAV);
  });

  // v1.105.0 exists because a banner was global. A note about a departure
  // on another route is the same fault with a friendlier voice.
  it('never picks one for another route', () => {
    expect(pickUsual([{ ...FAV, to: 'Bergen' }], DIR, NOW, W)).toBe(null);
    expect(pickUsual([{ ...FAV, from: 'Majorstuen' }], DIR, NOW, W)).toBe(null);
  });

  // stopKey (v1.107.0): «Ryen» and «Ryen T» are the same place, and a
  // plain lowercase comparison would silence the note for half the stops
  // in Oslo.
  it('matches names by the app\'s one recipe', () => {
    expect(pickUsual([{ ...FAV, from: 'Ryen T' }], DIR, NOW, W)).toBeTruthy();
    expect(pickUsual([FAV], { from: 'Ryen', to: 'Oslo S, Oslo' }, NOW, W)).toBeTruthy();
  });

  it('ignores route favourites and anything already gone', () => {
    expect(pickUsual([{ ...FAV, type: 'route' }], DIR, NOW, W)).toBe(null);
    expect(pickUsual([{ ...FAV, departureHHMM: '07:00' }], DIR, NOW, W)).toBe(null);
  });

  // The one you are standing there for.
  it('takes the next one ahead when several match', () => {
    const later = { ...FAV, departureHHMM: '08:40' };
    expect(pickUsual([later, FAV], DIR, NOW, W).departureHHMM).toBe('08:12');
  });

  it('does not reach past the window', () => {
    expect(pickUsual([{ ...FAV, departureHHMM: '09:30' }], DIR, NOW, W)).toBe(null);
  });
});

describe('the window is named once', () => {
  // It was the literal 90 in `fwdMins || 90`. This release needs the same
  // number to decide whether a starred time was asked about at all, and
  // two copies would drift silently.
  it('boardGQL derives its default from the constant', () => {
    // Comments stripped: the first cut asserted against the whole file and
    // matched the PROSE describing the old literal, not the code. The
    // instrument, again — and the prose had gone stale besides.
    const code = fs.readFileSync('src/api/queries.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).toMatch(/fwdMins \|\| BOARD_WINDOW_MINS/);
    expect(code).not.toMatch(/fwdMins \|\| 90/);
  });

  it('and the board uses it rather than its own number', () => {
    const src = fs.readFileSync('src/views/board.js', 'utf8');
    const fn = src.slice(src.indexOf('function renderUsual'), src.indexOf('export function renderBoard'))
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(fn).toMatch(/BOARD_WINDOW_MINS/);
    expect(fn).not.toMatch(/\b90\b/);
  });
});
