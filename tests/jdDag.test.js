// Avgangsdetaljer: dagen i etiketten, klokkeslettet alene i det store tallet.
import { describe, it, expect, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));
const { jdDag, jdEtikett } = await import('../src/views/selected.js');
const L = (d, hh, mm) => new Date(2026, 10, d, hh, mm).getTime();
const NÅ = L(5, 22, 48);

describe('jdDag', () => {
  it('avgang i morgen: dagen på avgangen, ingenting på en ankomst samme dag', () => {
    expect(jdDag(L(6, 0, 3), L(6, 0, 28), NÅ)).toEqual({ dep: 'i morgen', ank: '' });
  });
  it('over midnatt: dagen på ankomsten, regnet fra avgangen', () => {
    expect(jdDag(L(5, 23, 55), L(6, 0, 47), NÅ)).toEqual({ dep: '', ank: 'i morgen' });
  });
  it('i dag: ingenting', () => {
    expect(jdDag(L(5, 23, 0), L(5, 23, 25), NÅ)).toEqual({ dep: '', ank: '' });
  });
  it('etiketten', () => {
    expect(jdEtikett('i morgen', 'Mortensrud')).toBe('i morgen · Mortensrud');
    expect(jdEtikett('', 'Mortensrud')).toBe('Mortensrud');
  });
});

import { readFileSync } from 'node:fs';
describe('det store tallet', () => {
  it('er bare klokkeslettet, på begge ender', () => {
    const s = readFileSync('src/views/selected.js', 'utf8');
    expect(s).toContain(`'<div class="jd-val departure">' + clk(c.expectedDepartureTime)`);
    expect(s).toContain(`'<div class="jd-val arrival">' + clk(arrT)`);
  });
});
