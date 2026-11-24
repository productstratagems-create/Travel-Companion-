/* HELE REISEN PÅ STRIPEN (v1.218.307). Rapportert fra Underveis (74 → VY190):
 * stripen viste bare etappen du satt på — ikke byttet, ikke målet. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { _reiseOppsett, _reiseTekst, _fordel, REISE_MIN_ETAPPE, REISE_MIN_BYTTE } from '../src/views/journeyStrip.js';

const T0 = Date.parse('2026-11-24T18:08:00Z');
const iso = ms => new Date(ms).toISOString();
const clk = ms => new Date(ms).toISOString().slice(11, 16);
const t = ms => ({ time: iso(ms), clk: clk(ms) });
const kall = (navn, start, steg) => navn.map((n, i) => ({ quay: { stopPlace: { name: n, latitude: 59.9, longitude: 10.7 + i * 0.01 } },
  aimedArrivalTime: iso(start + i * steg), expectedArrivalTime: iso(start + i * steg), aimedDepartureTime: iso(start + i * steg), expectedDepartureTime: iso(start + i * steg) }));
const MIN = 60_000;
// 74: 18:08–18:52, 5 stopp. Bytte 13 min. VY190: 19:05–23:59, 4 stopp.
const ben = (kode, fra, til, dep, arr, navn, medKall = true) => ({ lineCode: kode, lineBg: '#e60000', lineFg: '#fff', fromStation: fra, toStation: til, depTime: t(dep), arrTime: t(arr),
  calls: medKall ? kall(navn, dep, (arr - dep) / (navn.length - 1)) : [] });
const legs = [
  ben('74', 'Dalsåsen', 'Oslo bussterminal', T0, T0 + 44 * MIN, ['Dalsåsen', 'A', 'B', 'C', 'Oslo bussterminal']),
  ben('VY190', 'Oslo bussterminal', 'Kristiansand', T0 + 57 * MIN, T0 + 351 * MIN, ['Oslo bussterminal', 'D', 'E', 'Kristiansand']),
];

describe('stripen for hele reisen', () => {
  it('_fordel: i forhold, men ingen under gulvet, og summen holder', () => {
    const b = _fordel([44, 13, 294], [REISE_MIN_ETAPPE, REISE_MIN_BYTTE, REISE_MIN_ETAPPE], 90);
    expect(b.reduce((s, x) => s + x, 0)).toBeCloseTo(90, 6);
    expect(b[0]).toBeGreaterThanOrEqual(REISE_MIN_ETAPPE);
    expect(b[1]).toBeGreaterThanOrEqual(REISE_MIN_BYTTE);
    expect(b[2]).toBeGreaterThan(b[0]); // den lange etappen er lengst
  });
  it('etapper og bytte etter hverandre, fra 5 % til 95 %', () => {
    const o = _reiseOppsett(legs, { phase: 'riding', i: 0 }, T0, null);
    expect(o.seg).toHaveLength(2); expect(o.luker).toHaveLength(1);
    expect(o.seg[0].a).toBeCloseTo(5); expect(o.seg[1].b).toBeCloseTo(95);
    expect(o.luker[0].a).toBeCloseTo(o.seg[0].b); expect(o.luker[0].b).toBeCloseTo(o.seg[1].a);
    expect(o.luker[0].sted).toBe('Oslo bussterminal');
  });
  it('prikken: på etappen du sitter på, i luka mens du venter, ved målet når du er framme', () => {
    const start = _reiseOppsett(legs, { phase: 'riding', i: 0 }, T0, null);
    expect(start.pct).toBeCloseTo(start.seg[0].a);
    const halv = _reiseOppsett(legs, { phase: 'riding', i: 0 }, T0 + 22 * MIN, null);
    expect(halv.pct).toBeCloseTo((halv.seg[0].a + halv.seg[0].b) / 2, 1);
    const venter = _reiseOppsett(legs, { phase: 'platform', i: 0, next: 1 }, T0 + 50 * MIN, null);
    expect(venter.pct).toBeGreaterThan(venter.luker[0].a); expect(venter.pct).toBeLessThan(venter.luker[0].b);
    const andre = _reiseOppsett(legs, { phase: 'riding', i: 1 }, T0 + 200 * MIN, null);
    expect(andre.pct).toBeGreaterThan(andre.seg[1].a); expect(andre.pct).toBeLessThan(andre.seg[1].b);
    expect(_reiseOppsett(legs, { phase: 'arrived', i: 1 }, T0 + 400 * MIN, null).pct).toBeCloseTo(95);
  });
  it('etappe uten stopp: står som et stykke, prikken går etter klokka', () => {
    const uten = [legs[0], { ...legs[1], calls: [] }];
    const o = _reiseOppsett(uten, { phase: 'riding', i: 1 }, T0 + 204 * MIN, null);
    expect(o.seg[1].e.pts).toBeNull();
    expect(o.pct).toBeCloseTo((o.seg[1].a + o.seg[1].b) / 2, 1);
  });
  it('teksten: stopp til bytte og framme; bytte på … mens du venter; siste etappe', () => {
    expect(_reiseTekst(_reiseOppsett(legs, { phase: 'riding', i: 0 }, T0, null))).toBe('4 stopp til bytte · framme ' + clk(T0 + 351 * MIN) + ' · etter rutetid');
    expect(_reiseTekst(_reiseOppsett(legs, { phase: 'platform', i: 0, next: 1 }, T0 + 50 * MIN, null))).toBe('bytte på Oslo bussterminal · går ' + clk(T0 + 57 * MIN) + ' · framme ' + clk(T0 + 351 * MIN));
    expect(_reiseTekst(_reiseOppsett(legs, { phase: 'riding', i: 1 }, T0 + 60 * MIN, null))).toMatch(/^\d stopp igjen · framme /);
    expect(_reiseTekst(_reiseOppsett(legs, { phase: 'arrived', i: 1 }, T0 + 400 * MIN, null))).toBe('framme');
  });
  it('én etappe: ikke denne stripen (den gamle står)', () => {
    expect(_reiseOppsett([legs[0]], { phase: 'riding', i: 0 }, T0, null)).toBeNull();
  });
  it('track.js: med bytte tegnes hele reisen, også mens du venter', () => {
    const src = readFileSync('src/views/track.js', 'utf8');
    const i = src.indexOf('if (legs.length > 1) { renderReiseStrip('), j = src.indexOf("const leg = cs.phase === 'riding' ? legs[cs.i] : null;", i);
    expect(i).toBeGreaterThan(0); expect(j).toBeGreaterThan(i);
  });
});
