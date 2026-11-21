import { describe, it, expect } from 'vitest';
import { reiseRader, GÅ_MAKS_MIN } from '../src/reiseTil.js';
const T = Date.parse('2026-11-21T13:30:00+01:00'), iso = m => new Date(T + m * 60000).toISOString();
const gå = (a, b) => ({ mode: 'foot', expectedStartTime: iso(a), expectedEndTime: iso(b) });
const kj = (kode, a, b, fra) => ({ mode: 'bus', expectedStartTime: iso(a), expectedEndTime: iso(b), fromPlace: { name: fra, latitude: 59.86, longitude: 10.83 }, serviceJourney: { line: { publicCode: kode, presentation: { colour: 'e60000' } } } });
// Skissen i onboarding-forslag.md: 74 fra Mortensrud, 73→81 fra Stenbråten, 71 fra Olasrudveien.
const TPS = [
  { legs: [gå(4, 16), kj('74', 16, 41, 'Mortensrud T'), gå(41, 41)] },
  { legs: [gå(1, 11), kj('73', 11, 25, 'Stenbråten'), kj('81', 27, 38, 'Bøler')] },
  { legs: [gå(13, 15), kj('71', 15, 49, 'Olasrudveien')] },
  { legs: [gå(-5, 2), kj('70', 2, 30, 'Mortensrud T')] },
];
describe('reiser til stedet som rader (v1.218.211)', () => {
  it('sortert etter når du er framme, med «gå om», og det du alt har mistet er borte', () => {
    const r = reiseRader(TPS, T, null);
    expect(r.map(x => x.linjer.map(l => l.kode).join('→'))).toEqual(['73→81', '74', '71']);
    expect(r.map(x => x.gåOm)).toEqual([1, 4, 13]);
    expect(r[0]).toMatchObject({ fra: 'Stenbråten', bytter: 1, gangMin: 10 });
  });
  it('fakta, ikke rangering: «ingen bytte», «minst gange»', () => {
    const r = reiseRader(TPS, T, null);
    expect(r.find(x => x.fra === 'Mortensrud T').fakta).toEqual(['ingen bytte']);
    expect(r.find(x => x.fra === 'Olasrudveien').fakta).toEqual(['ingen bytte', 'minst gange']);
    expect(r.find(x => x.fra === 'Stenbråten').fakta).toEqual([]);
  });
  it('gå hele veien er en rad, plassert etter når du er framme', () => {
    const r = reiseRader(TPS, T, 12);
    expect(r[0]).toMatchObject({ type: 'gå', gangMin: 12 });
    expect(reiseRader(TPS, T, GÅ_MAKS_MIN + 1).some(x => x.type === 'gå')).toBe(false);
  });
  it('samme avgang to ganger står én gang', () => {
    expect(reiseRader([TPS[0], TPS[0]], T, null)).toHaveLength(1);
  });
});
import { readFileSync } from 'node:fs';
describe('koblingen i Auto-tavle (v1.218.211)', () => {
  const a = readFileSync('src/views/auto.js', 'utf8');
  it('valgt sted → reisesøk fra der du står, rader fra reiseRader', () => {
    expect(a).toMatch(/fetchTripFraPos\(fra, \{ lat: p\.lat, lon: p\.lon \}, Date\.now\(\), 6\)/);
    expect(a).toMatch(/return reiseRader\(_hvaReiser, Date\.now\(\), w \? w\.mins : null\);/);
  });
  it('kartet følger den valgte raden (én definisjon: _hvaRader)', () => {
    expect(a).toMatch(/const rad = _hvaRader\(\)\[_hvaValgt\];/);
  });
  it('resten av tavla foldes, ikke kastes', () => {
    expect(a).toMatch(/side\.classList\.toggle\('hva-mål', _hvaÆrend === 'sted' && !_hvaVisAlle\)/);
    expect(readFileSync('src/style/settings.css', 'utf8')).toMatch(/\.hva-mål #auto-body/);
  });
});
