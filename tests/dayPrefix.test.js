/**
 * Which day a departure falls on.
 *
 * The app had no date formatting at all — zero hits for toLocaleDateString or
 * a month name anywhere in src/ — and it never needed one. Before v1.86.3 the
 * trip planner's search window was sized by local frequency and effectively
 * never reached past midnight, so every departure on screen was today's.
 *
 * With a full day of window a rural stop answers with tomorrow's 07:05, and
 * "07:05" alone is then a time that has already passed. Reported from Storaas
 * Gjestegård, where the first two departures were 19 hours out.
 */
import { describe, it, expect } from 'vitest';
import { clk, clkDay, dayPrefix } from '../src/ui/fmt.js';

const at = (d, h, m) => new Date(2026, 8, d, h, m, 0).getTime();   // September 2026

describe('dayPrefix', () => {
  it('says nothing about today', () => {
    expect(dayPrefix(at(6, 23, 30), at(6, 10, 0))).toBe('');
    expect(dayPrefix(at(6, 10, 1), at(6, 10, 0))).toBe('');
  });

  it('names tomorrow', () => {
    expect(dayPrefix(at(7, 7, 5), at(6, 10, 32))).toBe('i morgen ');
  });

  it('names the weekday further out', () => {
    // 8 Sep 2026 is a Tuesday.
    expect(dayPrefix(at(8, 7, 5), at(6, 10, 0))).toBe('tir ');
  });

  // ── The two cases a duration threshold gets wrong ───────────────────────
  //
  // This is why the helper compares DATES. "More than n hours away" is the
  // obvious implementation and it is wrong at both ends.
  it('calls two minutes across midnight tomorrow', () => {
    expect(dayPrefix(at(7, 0, 1), at(6, 23, 59))).toBe('i morgen ');
  });

  it('calls twenty-three hours inside one day today', () => {
    expect(dayPrefix(at(6, 23, 30), at(6, 0, 30))).toBe('');
  });

  it('says nothing about a time already past', () => {
    expect(dayPrefix(at(5, 7, 0), at(6, 10, 0))).toBe('');
  });

  it('survives rubbish rather than printing NaN', () => {
    expect(dayPrefix('ikke en dato', at(6, 10, 0))).toBe('');
  });
});

describe('clk and clkDay', () => {
  it('clk is the plain clock, unchanged', () => {
    expect(clk(at(7, 7, 5))).toBe('07:05');
  });

  it('clkDay is the clock with the day in front when it needs one', () => {
    expect(clkDay(at(6, 14, 5), at(6, 10, 0))).toBe('14:05');
    expect(clkDay(at(7, 7, 5), at(6, 10, 32))).toBe('i morgen 07:05');
  });
});

// ── One clock, and the rule applied wherever a time answers "when" ───────
//
// Asked for: "Avganger og ankomster i inneværende døgn uten dato, dato med
// tidspunkter utenfor inneværende døgn." v1.87.0 did that for the departure
// board and deliberately left five other views with their own private copy of
// the clock — and a departure tomorrow read "07:05" on every one of them.
describe('the clock has one definition', () => {
  const FILES = [
    'src/views/board.js', 'src/views/selected.js', 'src/views/track.js',
    'src/views/plan.js', 'src/views/spectate.js', 'src/journey.js',
  ];

  it('is defined once, in fmt.js, and copied nowhere', async () => {
    const fs = await import('node:fs');
    FILES.forEach(f => {
      const src = fs.readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/function clk\s*\(/);
      expect(src, f).toMatch(/from '\.{1,2}\/(ui\/)?fmt\.js'/);
    });
  });

  it('is imported by every view that shows a time', async () => {
    const fs = await import('node:fs');
    FILES.forEach(f => {
      expect(fs.readFileSync(f, 'utf8'), f).toMatch(/\bclk\b/);
    });
  });
});

describe('the rule reaches the screens a departure opens onto', () => {
  const has = async (file, needle) => {
    const fs = await import('node:fs');
    return fs.readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      .includes(needle);
  };

  // The detail view: the headline departure and arrival are the answer to
  // "when", and they were plain clocks.
  it('the journey detail names the day on both ends', async () => {
    expect(await has('src/views/selected.js', "jd-val departure\">' + clkDay(")).toBe(true);
    expect(await has('src/views/selected.js', "jd-val arrival\">' + clkDay(")).toBe(true);
  });

  it('the active plan names it on departure and arrival', async () => {
    expect(await has('src/views/plan.js', "'avgang ' + clkDay(")).toBe(true);
    expect(await has('src/views/plan.js', "ank. ' + clkDay(")).toBe(true);
  });

  // Deliberately NOT changed: the per-stop columns in the tracking view and
  // the itinerary. They are contiguous times under a headline that already
  // carries the day, and the columns are two characters wide — the same shape
  // as the board's big clock, where "i morgen 07:21" wrapped with the "i"
  // rendering as a hairline.
  it('leaves the dense stop columns on the plain clock', async () => {
    expect(await has('src/views/track.js', "stop-clock\">' + (r.arrT ? clk(r.arrT)")).toBe(true);
  });
});
