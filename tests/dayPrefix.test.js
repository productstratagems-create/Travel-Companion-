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
