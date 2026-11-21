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
import { kombiRader } from '../src/reiseTil.js';
describe('kombinasjoner som kan brukes (v1.218.215)', () => {
  const kj2 = (kode, a, b, fra, til) => ({ ...kj(kode, a, b, fra), toPlace: { name: til } });
  // Før-bildet: 73→81 via Bøler framme 17:33 (min 33), direkte 74 framme 17:41 (min 41).
  const SVAR = [
    { legs: [gå(1, 11), kj2('73', 11, 25, 'Stenbråten', 'Bøler'), kj('81', 27, 33, 'Bøler')] },
    { legs: [gå(4, 16), kj('74', 16, 41, 'Mortensrud T')] },
    { legs: [gå(2, 12), kj2('76', 12, 30, 'Olasrudveien', 'Helsfyr'), kj('3', 32, 50, 'Helsfyr')] },
  ];
  it('raden med bytte står når den er raskere, med via og «N min raskere»', () => {
    const k = kombiRader(reiseRader(SVAR, T, null));
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ via: 'Bøler', bytter: 1 });
    expect(k[0].fakta).toContain('8 min raskere');
  });
  it('senere enn direkte: vises ikke', () => {
    expect(kombiRader(reiseRader(SVAR, T, null)).some(r => r.via === 'Helsfyr')).toBe(false);
  });
  it('uten direkte reise: eneste vei dit', () => {
    const k = kombiRader(reiseRader([SVAR[2]], T, null));
    expect(k).toHaveLength(1);
    expect(k[0].fakta).toContain('eneste vei dit');
  });
  it('direkte reiser er aldri kombinasjoner', () => {
    expect(kombiRader(reiseRader([SVAR[1]], T, null))).toEqual([]);
  });
});
describe('kombinasjonene i Auto-tavle (v1.218.215)', () => {
  const a = readFileSync('src/views/auto.js', 'utf8');
  it('ett søk per valgt område, ikke «alle»/«hjemover», innenfor budsjettet', () => {
    expect(a).toMatch(/if \(!_stop \|\| valg === 'alle' \|\| valg === 'hjem'\) return null;/);
    expect(a).toMatch(/if \(!budsjettTillater\(_søkLogg, nå, 1\)\) return v \|\| null;/);
  });
  it('radene fra kombiRader, flettet inn i lista; leter/feil sies', () => {
    expect(a).toMatch(/kombiRader\(reiseRader\(kv\.tps, nå, null\)\)/);
    expect(a).toMatch(/ser etter reiser med bytte …/);
    expect(a).toMatch(/fant ikke reiser med bytte nå/);
  });
});
