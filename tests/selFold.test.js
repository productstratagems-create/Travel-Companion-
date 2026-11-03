// «Reiseplan»-folden i avgangsdetaljer holder seg åpen.
//
// Rapportert: den lukket seg igjen rett etter trykket. #s-content skrives om
// ved hver oppfriskning, og en ny <details> er lukket.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));
import { foldÅpen, stopSelRefresh } from '../src/views/selected.js';

describe('folden husker at du åpnet den', () => {
  it('et trykk som åpner den, blir husket', () => {
    document.body.innerHTML = '<details class="itin-fold"><summary>reiseplan</summary></details>';
    const d = document.querySelector('details');
    d.open = true;
    d.dispatchEvent(new Event('toggle'));      // bobler ikke, som i nettleseren
    expect(foldÅpen()).toBe(true);
  });
  it('og glemt når du forlater skjermen', () => {
    stopSelRefresh();
    expect(foldÅpen()).toBe(false);
  });
  it('renderingen skriver den ut åpen', () => {
    const s = readFileSync('src/views/selected.js', 'utf8');
    expect(s).toMatch(/'<details class="itin-fold"' \+ \(_foldÅpen \? ' open' : ''\)/);
  });
});
