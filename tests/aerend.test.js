import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ÆREND, ærendNå, ærendSteder } from '../src/aerend.js';
const d = h => new Date(2026, 10, 21, h, 0);
describe('ærend (v1.218.207)', () => {
  it('morgen: kaffe og mat først; kveld: mat', () => {
    expect(ærendNå(d(8)).slice(0, 2).map(e => e.id)).toEqual(['kafe', 'mat']);
    expect(ærendNå(d(12))[0].id).toBe('spise');
    expect(ærendNå(d(22))[0].id).toBe('mat');
    expect(ærendNå(d(8))).toHaveLength(ÆREND.length);
  });
  it('åpne først, ukjent så, stengt sist; ellers nærmest', () => {
    const l = [
      { name: 'stengt', dist: 50, lat: 59.9, lon: 10.8, hours: { isOpen: false } },
      { name: 'ukjent', dist: 80, lat: 59.9, lon: 10.8 },
      { name: 'åpen langt', dist: 900, lat: 59.9, lon: 10.8, hours: { isOpen: true } },
      { name: 'åpen nær', dist: 300, lat: 59.9, lon: 10.8, hours: { isOpen: true } },
    ];
    expect(ærendSteder(l, 4).map(p => p.name)).toEqual(['åpen nær', 'åpen langt', 'ukjent', 'stengt']);
    expect(ærendSteder(l, 2)).toHaveLength(2);
  });
  it('Auto-tavle kobler ærendet til stedene og kartet', () => {
    const s = readFileSync('src/views/auto.js', 'utf8');
    expect(s).toMatch(/fetchNearbyPlaces\(ll\.lat, ll\.lon, e\.kategorier, 8, ÆREND_RADIUS_M\)/);
    expect(s).toMatch(/_hvaSteder = ærendSteder\(l\)/);
    expect(s).toMatch(/if \(_målSted && Number\.isFinite\(_målSted\.lat\)\)/);
  });
});
