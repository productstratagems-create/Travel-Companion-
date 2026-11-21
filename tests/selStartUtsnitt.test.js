// Kartet i avgangsdetaljer starter på deg og påstigningen når du skal gå dit.
//
// Rapportert med skjermbilde: hele turen til Jernbanetorget i 5 km-skala,
// og deg og stoppet 800 m unna som én prikk.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));
import { startUtsnitt } from '../src/views/selected.js';

const DEG = { lat: 59.8495, lon: 10.8205 };
const STOPP = { lat: 59.8455, lon: 10.83 };
const RUTE = [[59.8495, 10.8205], [59.8470, 10.8245], [59.8455, 10.83]];

describe('første utsnitt', () => {
  it('er deg, stoppet og gangruta mellom dere', () => {
    expect(startUtsnitt(DEG, STOPP, RUTE)).toEqual([[59.8495, 10.8205], [59.8455, 10.83], ...RUTE]);
  });
  it('er deg og stoppet mens ruta hentes', () => {
    expect(startUtsnitt(DEG, STOPP, null)).toHaveLength(2);
  });
  it('er hele reisen når du ikke skal gå dit', () => {
    expect(startUtsnitt(null, STOPP, RUTE)).toBeNull();
  });
});

describe('koblingen i _renderSelMap', () => {
  const s = readFileSync('src/views/selected.js', 'utf8');
  const kart = s.slice(s.indexOf('function _renderSelMap('), s.indexOf('export function renderSelected('));
  it('bruker startUtsnitt bare når du går og avgangen ikke har gått', () => {
    expect(kart).toMatch(/startUtsnitt\(gå && !avgått && userPos \? userPos : null/);
  });
  it('rammer inn utsnittet og viser «hele reisen»', () => {
    // v1.218.72: «hele reisen» er en knapp i verktøysøylen, vist med `settVerktøy`.
    // v1.218.164: én knapp — fokusknappen sier «hele reisen» etter et utsnitt.
    // v1.218.228: taket er gå-stegets (STEG_TAK['gå'] = GANG 17), én definisjon med Underveis.
    expect(kart).toMatch(/if \(fokus\) \{[\s\S]{0,160}ramme\(_selMap, fokus, STEG_TAK\['gå'\], \{ pad \}\);\s*_selFokus = 'utsnitt';/);
  });
  it('avgått er en del av nøkkelen, så kartet viser hele reisen etter avgang', () => {
    expect(kart).toMatch(/\+ \(avgått \? '\|avgått' : ''\)/);
  });
});
