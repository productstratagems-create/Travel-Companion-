import { describe, it, expect } from 'vitest';
import { parseOpeningHours, _normName, mergePlaces, parseOverpassElements } from '../src/api/places.js';

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

  // ── post-midnight closing times ──────────────────────────────────────────
  it('reports open after midnight for a wrapping range (18:00-02:00)', () => {
    // Previously reported "åpner 18:00" at 01:00 while the bar was open.
    const r = parseOpeningHours('18:00-02:00', d(6, 1)); // Saturday 01:00
    expect(r).toMatchObject({ isOpen: true });
    expect(r.minsLeft).toBe(60);
  });

  it('reports open in the evening for a wrapping range', () => {
    const r = parseOpeningHours('18:00-02:00', d(5, 19)); // Friday 19:00
    expect(r).toMatchObject({ isOpen: true });
    expect(r.minsLeft).toBe(420); // 5h to midnight + 2h
  });

  it('reports closed in the afternoon for a wrapping range', () => {
    const r = parseOpeningHours('18:00-02:00', d(5, 15)); // Friday 15:00
    expect(r).toMatchObject({ isOpen: false, label: 'åpner 18:00' });
  });

  // ── comma-separated spans (lunch break) ──────────────────────────────────
  it('handles a split day with a lunch break', () => {
    const spec = 'Mo-Fr 08:00-12:00,13:00-18:00';
    expect(parseOpeningHours(spec, d(2, 9))).toMatchObject({ isOpen: true });
    expect(parseOpeningHours(spec, d(2, 15))).toMatchObject({ isOpen: true });
  });

  it('reports the next opening during a lunch break rather than dropping the hours', () => {
    // Previously the regex failed on the comma and returned null (no hours at all).
    const r = parseOpeningHours('Mo-Fr 08:00-12:00,13:00-18:00', d(2, 12, 30));
    expect(r).not.toBeNull();
    expect(r).toMatchObject({ isOpen: false, label: 'åpner 13:00' });
  });

  // ── explicit "off" ───────────────────────────────────────────────────────
  it('reports stengt for an explicit day-off rule', () => {
    const r = parseOpeningHours('Mo-Sa 09:00-17:00; Su off', d(0, 12)); // Sunday
    expect(r).toMatchObject({ isOpen: false, label: 'stengt' });
  });

  it('still returns null for a bare unparseable closure', () => {
    expect(parseOpeningHours('closed')).toBeNull();
  });

  // ── numeric fields for arrival-time comparison ───────────────────────────
  it('exposes openMins/closeMins/minsLeft for comparison', () => {
    const r = parseOpeningHours('09:00-17:00', d(2, 16));
    expect(r).toMatchObject({ openMins: 540, closeMins: 1020, minsLeft: 60 });
  });

  it('evaluates against the time passed in, not the wall clock', () => {
    // The whole point: same spec, two moments, different answers.
    const spec = 'Mo-Fr 09:00-17:00';
    expect(parseOpeningHours(spec, d(2, 16, 30))).toMatchObject({ isOpen: true });
    expect(parseOpeningHours(spec, d(2, 17, 30))).toMatchObject({ isOpen: false });
  });

  it('answers "still open when I arrive" for a journey that outlasts closing', () => {
    const spec = 'Mo-Fr 09:00-17:00';
    const departure = d(2, 16, 40);
    const arrival = new Date(departure.getTime() + 40 * 60000); // 17:20
    expect(parseOpeningHours(spec, departure).isOpen).toBe(true);
    expect(parseOpeningHours(spec, arrival).isOpen).toBe(false);
  });
});

describe('_normName', () => {
  it('folds Norwegian letters and diacritics', () => {
    expect(_normName('Kafé Brønnøya')).toBe('kafebronnoya');
    expect(_normName('Åpent Bakeri')).toBe('apentbakeri');
  });

  it('drops legal suffixes and punctuation', () => {
    expect(_normName('Olsen & Sønn AS')).toBe('olsensonn');
    expect(_normName('Java-Bar')).toBe('javabar');
  });

  it('matches the same name written slightly differently', () => {
    expect(_normName('Café Olé')).toBe(_normName('Cafe Ole'));
  });
});

describe('mergePlaces', () => {
  const A = { name: 'Kafé A', _norm: 'kafea', osmId: 'n/1', lat: 59.9, lon: 10.7, dist: 100, hours: null, amenity: 'catering.cafe', type: 'kafé', emoji: '☕' };

  it('deduplicates across sources by shared OSM id', () => {
    const dupe = { ...A, dist: 120, _norm: 'somethingelse' }; // different name, same id
    const out = mergePlaces([[A], [dupe]]);
    expect(out).toHaveLength(1);
    expect(out[0].sources).toBe(2);
  });

  it('deduplicates by normalised name within proximity when ids differ', () => {
    const near = { ...A, osmId: 'w/9', lat: 59.9001, lon: 10.7001, dist: 110 };
    const out = mergePlaces([[A], [near]]);
    expect(out).toHaveLength(1);
    expect(out[0].sources).toBe(2);
  });

  it('keeps same-named places that are far apart as distinct', () => {
    const far = { ...A, osmId: 'w/9', lat: 60.0, lon: 10.9, dist: 5000 };
    const out = mergePlaces([[A], [far]]);
    expect(out).toHaveLength(2);
  });

  it('fills gaps (opening hours) from the secondary source', () => {
    const base = { ...A, hours: null, osmId: null };
    const withHours = { ...A, osmId: null, hours: { isOpen: true, label: 'til 22:00' } };
    const out = mergePlaces([[base], [withHours]]);
    expect(out[0].hours).toMatchObject({ isOpen: true });
  });

  it('adopts the nearest known coordinates/distance', () => {
    const nearer = { ...A, osmId: 'n/1', dist: 40, lat: 59.901, lon: 10.701 };
    const out = mergePlaces([[A], [nearer]]);
    expect(out[0].dist).toBe(40);
  });

  it('marks single-source records with sources = 1', () => {
    const out = mergePlaces([[A], []]);
    expect(out[0].sources).toBe(1);
  });
});

describe('parseOverpassElements', () => {
  it('maps node + way elements to the shared venue shape', () => {
    const els = [
      { type: 'node', id: 5, lat: 59.9, lon: 10.7, tags: { name: 'Bakeriet', shop: 'bakery' } },
      { type: 'way', id: 8, center: { lat: 59.91, lon: 10.72 }, tags: { name: 'Kino X', amenity: 'cinema', opening_hours: '10:00-22:00' } },
    ];
    const out = parseOverpassElements(els, 59.9, 10.7);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ name: 'Bakeriet', amenity: 'catering.bakery', osmId: 'n/5' });
    expect(out[1]).toMatchObject({ name: 'Kino X', amenity: 'entertainment.cinema', osmId: 'w/8' });
  });

  it('skips elements without a name or coordinates', () => {
    const els = [
      { type: 'node', id: 1, lat: 59.9, lon: 10.7, tags: { amenity: 'cafe' } }, // no name
      { type: 'way', id: 2, tags: { name: 'No Center', amenity: 'cafe' } },     // no center
    ];
    expect(parseOverpassElements(els, 59.9, 10.7)).toHaveLength(0);
  });
});

describe('venue detail tags (already in the response, previously discarded)', () => {
  const el = (tags, id = 1) => ({ type: 'node', id, lat: 59.91, lon: 10.75, tags });

  it('keeps the raw opening_hours spec so it can be re-evaluated at arrival time', () => {
    const [p] = parseOverpassElements([el({ name: 'Kafe', amenity: 'cafe', opening_hours: 'Mo-Fr 08:00-16:00' })], 59.91, 10.75);
    expect(p.rawHours).toBe('Mo-Fr 08:00-16:00');
    // and the parsed form is still there for callers that just want a label
    expect(p.hours).not.toBeNull();
  });

  it('extracts contact, accessibility and amenity tags', () => {
    const [p] = parseOverpassElements([el({
      name: 'Thea', amenity: 'restaurant',
      website: 'https://thea.no', phone: '+4722334455',
      wheelchair: 'yes', toilets: 'yes', outdoor_seating: 'yes',
      cuisine: 'italian', 'addr:street': 'Storgata', 'addr:housenumber': '12',
    })], 59.91, 10.75);
    expect(p).toMatchObject({
      website: 'https://thea.no', phone: '+4722334455',
      wheelchair: 'yes', toilets: true, outdoor: true,
      cuisine: 'italian', address: 'Storgata 12',
    });
  });

  it('prefers contact:* fallbacks', () => {
    const [p] = parseOverpassElements([el({
      name: 'X', amenity: 'cafe', 'contact:website': 'https://x.no', 'contact:phone': '123',
    })], 59.91, 10.75);
    expect(p.website).toBe('https://x.no');
    expect(p.phone).toBe('123');
  });

  it('records wheelchair=no rather than silently dropping it', () => {
    const [p] = parseOverpassElements([el({ name: 'X', amenity: 'cafe', wheelchair: 'no' })], 59.91, 10.75);
    expect(p.wheelchair).toBe('no');
  });

  it('leaves absent tags null rather than undefined noise', () => {
    const [p] = parseOverpassElements([el({ name: 'X', amenity: 'cafe' })], 59.91, 10.75);
    expect(p.website).toBeNull();
    expect(p.toilets).toBeNull();
  });

  it('back-fills detail tags across sources when merging duplicates', () => {
    // Same venue: one source knows the website, the other the wheelchair status.
    const a = [{ name: 'Kafe X', _norm: 'kafex', lat: 59.91, lon: 10.75, dist: 40, osmId: 'n/1',
                 website: 'https://x.no', wheelchair: null, hours: null }];
    const b = [{ name: 'Kafe X', _norm: 'kafex', lat: 59.91, lon: 10.75, dist: 50, osmId: 'n/1',
                 website: null, wheelchair: 'yes', hours: null }];
    const [m] = mergePlaces([a, b]);
    expect(m).toMatchObject({ website: 'https://x.no', wheelchair: 'yes', sources: 2 });
  });
});
