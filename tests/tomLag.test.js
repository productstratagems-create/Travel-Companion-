// v1.218.196: lappene ble liggende — 100 lapper for 6 markører på Auto-kartet.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tømLag } from '../src/ui/tomLag.js';

function markør(medLapp) {
  const forelder = { barn: new Set(), removeChild(c) { this.barn.delete(c); } };
  const el = { parentNode: forelder }; forelder.barn.add(el);
  return { forelder, closed: 0, getTooltip: () => (medLapp ? { getElement: () => el } : null), closeTooltip() { this.closed++; } };
}
const lag = (ls) => ({ ls: [...ls], eachLayer(f) { this.ls.forEach(f); }, clearLayers() { this.ls = []; } });

describe('tømLag', () => {
  it('fjerner lappens element fra lapp-laget, så markøren', () => {
    const m = markør(true), l = lag([m, markør(false)]);
    tømLag(l);
    expect(m.forelder.barn.size).toBe(0);
    expect(m.closed).toBe(1);
    expect(l.ls).toEqual([]);
  });
  it('også i en gruppe i laget', () => {
    const m = markør(true); const g = lag([m]); const l = lag([g]);
    tømLag(l);
    expect(m.forelder.barn.size).toBe(0);
  });
});

describe('kartene tømmer lagene sine med lappene', () => {
  it('Auto, Rute, plan, ankomst og stasjonslaget', () => {
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/tømLag\(_aLayer\);/);
    const b = readFileSync('src/views/board.js', 'utf8');
    expect(b).toMatch(/tømLag\(_bLayer\);/); expect(b).toMatch(/tømLag\(_bRouteLayer\);/);
    expect(b).not.toMatch(/_bLayer\.clearLayers\(\)/);
    expect(readFileSync('src/ui/stasjonslag.js', 'utf8')).toMatch(/tømLag\(st\.lag\);/);
  });
});
