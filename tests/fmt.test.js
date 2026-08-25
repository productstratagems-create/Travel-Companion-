import { describe, it, expect } from 'vitest';
import { venueDetailHtml, cuisineLabel, esc, fmtMins } from '../src/ui/fmt.js';

describe('cuisineLabel', () => {
  it('translates common OSM cuisine values', () => {
    expect(cuisineLabel('italian')).toBe('italiensk');
    expect(cuisineLabel('seafood')).toBe('sjømat');
  });

  it('takes the first of a multi-value tag', () => {
    expect(cuisineLabel('pizza;italian;pasta')).toBe('pizza');
    expect(cuisineLabel('burger,american')).toBe('burger');
  });

  it('falls back to the raw value, de-underscored', () => {
    expect(cuisineLabel('fish_and_chips')).toBe('fish and chips');
  });

  it('returns null for nothing', () => {
    expect(cuisineLabel(null)).toBeNull();
    expect(cuisineLabel('')).toBeNull();
  });
});

describe('venueDetailHtml', () => {
  it('prefers cuisine over the generic category', () => {
    const h = venueDetailHtml({ type: 'restaurant', cuisine: 'thai' });
    expect(h).toContain('thai');
    expect(h).not.toContain('restaurant');
  });

  it('falls back to the category when there is no cuisine', () => {
    expect(venueDetailHtml({ type: 'bakeri' })).toContain('bakeri');
  });

  it('shows accessibility, toilets and outdoor seating as glyphs', () => {
    const h = venueDetailHtml({ type: 'kafé', wheelchair: 'yes', toilets: true, outdoor: true });
    expect(h).toContain('♿');
    expect(h).toContain('🚻');
    expect(h).toContain('⛱');
  });

  it('does not claim step-free access when the tag says no', () => {
    expect(venueDetailHtml({ type: 'kafé', wheelchair: 'no' })).not.toContain('♿');
  });

  it('treats limited access as accessible-with-caveat rather than hiding it', () => {
    expect(venueDetailHtml({ type: 'kafé', wheelchair: 'limited' })).toContain('♿');
  });

  it('returns an empty string when there is nothing to say', () => {
    expect(venueDetailHtml({})).toBe('');
    expect(venueDetailHtml(null)).toBe('');
  });

  it('escapes venue-supplied text', () => {
    // type and cuisine come from OSM, i.e. from strangers.
    const h = venueDetailHtml({ type: '<script>alert(1)</script>' });
    expect(h).not.toContain('<script>');
    expect(h).toContain('&lt;script&gt;');
  });
});

describe('esc', () => {
  it('escapes the characters that break out of markup', () => {
    expect(esc('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });

  it('renders null and undefined as empty, not as the word "null"', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });

  it('still stringifies numbers', () => {
    expect(esc(0)).toBe('0');
    expect(esc(42)).toBe('42');
  });
});

describe('fmtMins', () => {
  it('formats sub-hour durations', () => {
    expect(fmtMins(0)).toBe('nå');
    expect(fmtMins(7)).toBe('7 min');
  });

  it('formats hours', () => {
    expect(fmtMins(60)).toBe('1t');
    expect(fmtMins(95)).toBe('1t 35m');
  });
});
