// Avgangsdetaljer tegner gangruta til stoppet, ikke en rett strek.
//
// Rapportert med skjermbilde: «802 m · 12 min å gå» over et kart der streken
// gikk rett over hus og skog. Tavla og auto-reise tegnet allerede ruta fra
// den felles bufferen i `api/approach.js`.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));
import { gangLinje } from '../src/views/selected.js';

const FRA = { lat: 59.845, lon: 10.82 };
const TIL = { lat: 59.849, lon: 10.83 };
const RUTE = [[59.845, 10.82], [59.846, 10.823], [59.848, 10.826], [59.849, 10.83]];

describe('streken fra deg til påstigningen', () => {
  it('er gangruta når den finnes', () => {
    expect(gangLinje(RUTE, FRA, TIL)).toEqual(RUTE);
  });
  it('er den rette streken mens ruta hentes', () => {
    expect(gangLinje(null, FRA, TIL)).toEqual([[59.845, 10.82], [59.849, 10.83]]);
  });
});

describe('koblingen i _renderSelMap', () => {
  const src = readFileSync('src/views/selected.js', 'utf8');
  const kart = src.slice(src.indexOf('function _renderSelMap('), src.indexOf('export function renderSelected('));
  it('ber om ruta fra den felles bufferen, og bare når du går', () => {
    expect(kart).toMatch(/ensureApproach\(gå && herfra && harPåstigning \? herfra : null/);
    expect(kart).toMatch(/const gå = gangGjelder\(/);
  });
  it('ruta er en del av kartnøkkelen, så kartet bygges om når den kommer', () => {
    expect(kart).toMatch(/_selMapStructKey\([^)]*\) \+ '\|gang:' \+ \(gangrute \? gangrute\.length/);
    expect(kart.indexOf('approachPoints()')).toBeLessThan(kart.indexOf('key === _selMapKey'));
  });
  it('tegner det gangLinje gir', () => {
    expect(kart).toMatch(/drawWalk\(_selLayer, gangLinje\(|const linje = gangLinje\(gangrute/);
  });
});
