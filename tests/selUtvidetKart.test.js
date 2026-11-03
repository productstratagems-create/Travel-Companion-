// Det utvidede kartet fyller plassen mellom statuslinja og knapperaden.
//
// Rapportert med skjermbilde: kartet var 72vh uansett, og den nederste
// delen lå bak knapperaden og bunnmenyen.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));
import { utvidetKartHøyde } from '../src/views/selected.js';

describe('høyden på det utvidede kartet', () => {
  it('er skjermen minus statuslinja, knapperaden og menyen under den', () => {
    // iPhone: 896 høy, 47 innsett øverst, rad 69, menyen 56 + 34 innsett.
    expect(utvidetKartHøyde(896, 47, 69, 90)).toBe(690);
  });
  it('blir aldri mindre enn et brukbart kart', () => {
    expect(utvidetKartHøyde(300, 47, 69, 90)).toBe(200);
  });
});

describe('koblingen', () => {
  const s = readFileSync('src/views/selected.js', 'utf8');
  it('avgangsdetaljene sier fra når kartet åpnes og lukkes', () => {
    expect(s).toMatch(/bindMapExpand\(_selMap, mapEl, [^)]*\), \{ onToggle: \(open\) => _plasserUtvidetKart\(mapEl, open\) \}\)/);
  });
  it('høyden settes på kartet, ruller etter overgangen, og fjernes når det lukkes', () => {
    const f = s.slice(s.indexOf('export function _plasserUtvidetKart('), s.indexOf('function _selMapStructKey('));
    expect(f).toMatch(/if \(!open\) \{ el\.style\.removeProperty\('--map-h-open'\); return; \}/);
    expect(f).toMatch(/el\.style\.setProperty\('--map-h-open', utvidetKartHøyde\(/);
    expect(f).toMatch(/setTimeout\([\s\S]*scrollIntoView\([\s\S]*320\)/);
  });
  it('map.js gir skjermen beskjed', () => {
    expect(readFileSync('src/ui/map.js', 'utf8')).toMatch(/if \(opts\.onToggle\) opts\.onToggle\(open\);/);
  });
});
