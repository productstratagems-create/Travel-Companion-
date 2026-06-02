import { describe, it, expect } from 'vitest';
import { parseOpeningHours } from '../src/api/places.js';

function d(weekday, hour, min = 0) {
  // weekday: 1=Mon..5=Fri, 6=Sat, 0=Sun
  const now = new Date(2024, 0, 1); // Jan 1 2024 is a Monday
  const offset = (weekday - now.getDay() + 7) % 7;
  now.setDate(now.getDate() + offset);
  now.setHours(hour, min, 0, 0);
  return now;
}

describe('parseOpeningHours', () => {

  it('returns { isOpen:true, label:"åpent 24/7" } for 24/7', () => {
    const r = parseOpeningHours('24/7');
    expect(r).toMatchObject({ isOpen: true, label: 'åpent 24/7' });
  });

  it('returns null for null/empty input', () => {
    expect(parseOpeningHours(null)).toBeNull();
    expect(parseOpeningHours('')).toBeNull();
  });

  it('returns null for unparseable format', () => {
    expect(parseOpeningHours('by appointment')).toBeNull();
    expect(parseOpeningHours('closed')).toBeNull();
  });

  it('reports open when within hours (no day prefix)', () => {
    const r = parseOpeningHours('08:00-22:00', d(2, 14)); // Tuesday 14:00
    expect(r).toMatchObject({ isOpen: true });
    expect(r.label).toContain('22:00');
  });

  it('reports closed when before opening (no day prefix)', () => {
    const r = parseOpeningHours('10:00-20:00', d(3, 8)); // Wednesday 08:00
    expect(r).toMatchObject({ isOpen: false });
    expect(r.label).toContain('10:00');
  });

  it('reports closed when after closing (no day prefix)', () => {
    const r = parseOpeningHours('09:00-18:00', d(4, 20)); // Thursday 20:00
    expect(r).toMatchObject({ isOpen: false, label: 'stengt' });
  });

  it('shows "stenger HH:MM" when less than 60 min remain', () => {
    const r = parseOpeningHours('08:00-22:00', d(5, 21, 30)); // Friday 21:30 → 30 min left
    expect(r).toMatchObject({ isOpen: true });
    expect(r.label).toBe('stenger 22:00');
  });

  it('matches weekday day range — open on Monday', () => {
    const r = parseOpeningHours('Mo-Fr 09:00-17:00', d(1, 12)); // Monday noon
    expect(r).toMatchObject({ isOpen: true });
  });

  it('does not match outside day range — closed on Saturday', () => {
    const r = parseOpeningHours('Mo-Fr 09:00-17:00', d(6, 12)); // Saturday noon
    expect(r).toBeNull();
  });

  it('matches Saturday in Mo-Sa range', () => {
    const r = parseOpeningHours('Mo-Sa 10:00-20:00', d(6, 14)); // Saturday 14:00
    expect(r).toMatchObject({ isOpen: true });
  });

  it('falls through to second semicolon rule when first day-spec does not match', () => {
    const spec = 'Mo-Fr 09:00-17:00; Sa 10:00-15:00';
    const r = parseOpeningHours(spec, d(6, 11)); // Saturday 11:00
    expect(r).toMatchObject({ isOpen: true });
    expect(r.label).toContain('15:00');
  });

  it('uses first matching rule when both could match', () => {
    const spec = 'Mo-Su 08:00-22:00; Mo-Fr 09:00-17:00';
    const r = parseOpeningHours(spec, d(1, 20)); // Monday 20:00
    expect(r).toMatchObject({ isOpen: true }); // first rule matches
  });
});
