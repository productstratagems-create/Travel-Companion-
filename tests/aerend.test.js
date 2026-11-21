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
describe('foldet til svaret henger sammen med tavla (v1.218.210)', () => {
  it('uten valg står bare lenken; knappene først etter trykk', () => {
    const s = readFileSync('src/views/auto.js', 'utf8');
    expect(s).toMatch(/if \(!_hvaÆrend && !_hvaÅpen\) return '<div class="hva"><button type="button" class="hva-lenke" data-hva="åpne">hva skal du\? ▸<\/button><\/div>';/);
    expect(s).toMatch(/let _hvaÅpen = false;/);
  });
});
describe('kuttet (v1.218.220)', () => {
  it('«hva skal du?» tegnes ikke på Auto-tavle', () => {
    const s = readFileSync('src/views/auto.js', 'utf8');
    expect(s).toMatch(/export const HVA_PÅ = false;/);
    expect(s).toMatch(/\+ \(!HVA_PÅ \|\| kind === 'ukjent' \|\| !_autoTavle \? '' : _hvaHtml\(\)\);/);
  });
});
