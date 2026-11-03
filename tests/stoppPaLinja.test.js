// I fart foreslår «du er ved» neste stopp på linja du mest sannsynlig er
// på, ikke det nærmeste stoppet ved veien.
//
// Bestilt: «Auto-reise skal foreslå den holdeplassen, som en bruker som
// opplagt er i bevegelse med en hastighet som overgår 10 km i timen …, som
// ligger på den linjen bruker mest sannsynlig reiser med.»
import { describe, it, expect, vi } from 'vitest';

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({
  makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(),
  mapHalo: vi.fn(), sideVehicleSvg: () => '', SIDE_VEHICLE_MAX_PX: 30,
}));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import { velgStoppIFart, whereLabel } from '../src/views/auto.js';
import { iFart, stoppPåLinja, nesteStopp, OMBORD_MIN_FART_MS } from '../src/api/ombord.js';

const NÅ = Date.parse('2026-11-03T07:30:00Z');
const iso = (min) => new Date(NÅ + min * 60000).toISOString();
const kall = (id, name, min) => ({
  expectedDepartureTime: iso(min),
  quay: { latitude: 59.9, longitude: 10.8, stopPlace: { id, name, latitude: 59.9, longitude: 10.8 } },
});
const kand = (linje, stopp) => ({
  nøkkel: 'sj-' + linje, linje,
  call: { serviceJourney: { id: 'sj-' + linje, estimatedCalls: stopp } },
});
const LINJE_3 = kand('3', [kall('NSR:A', 'Lofsrud', -1), kall('NSR:B', 'Mortensrud', 1), kall('NSR:C', 'Skullerud', 3)]);

describe('10 km/t er grensen for «i fart»', () => {
  it('11 km/t er i fart, 9 km/t er det ikke', () => {
    expect(iFart(11 / 3.6)).toBe(true);
    expect(iFart(9 / 3.6)).toBe(false);
  });
  it('grensen er 10 km/t', () => {
    expect(OMBORD_MIN_FART_MS * 3.6).toBeCloseTo(10, 5);
  });
});

describe('neste stopp på linja', () => {
  it('er det første stoppet turen skal innom etter nå', () => {
    expect(nesteStopp(LINJE_3, NÅ).id).toBe('NSR:B');
  });

  it('én linje følger deg: dens neste stopp', () => {
    const r = stoppPåLinja({ kind: 'ombord', kandidater: [LINJE_3] }, NÅ);
    expect(r.stop.id).toBe('NSR:B');
    expect(r.linjer).toEqual(['3']);
  });

  it('to linjer til samme neste stopp: det stoppet, med begge linjene', () => {
    const L79 = kand('79', [kall('NSR:B', 'Mortensrud', 1.5), kall('NSR:D', 'Bjørndal', 4)]);
    const r = stoppPåLinja({ kind: 'ombord-tvil', kandidater: [LINJE_3, L79] }, NÅ);
    expect(r.stop.id).toBe('NSR:B');
    expect(r.linjer).toEqual(['3', '79']);
  });

  it('to linjer til hvert sitt neste stopp: appen velger ikke', () => {
    const L79 = kand('79', [kall('NSR:D', 'Bjørndal', 1)]);
    expect(stoppPåLinja({ kind: 'ombord-tvil', kandidater: [LINJE_3, L79] }, NÅ)).toBeNull();
  });

  it('ingen linje følger deg: ingenting', () => {
    expect(stoppPåLinja({ kind: 'vet-ikke', kandidater: [] }, NÅ)).toBeNull();
  });
});

describe('«du er ved» i fart', () => {
  // Det nærmeste stoppet er på en annen linje enn den du sitter på.
  const NÆRMEST = { id: 'NSR:X', name: 'Lofsrudhøgda', distM: 80 };
  const LISTE = [NÆRMEST, { id: 'NSR:B', name: 'Mortensrud', distM: 420 }];
  const påLinja = stoppPåLinja({ kind: 'ombord', kandidater: [LINJE_3] }, NÅ);

  it('neste stopp på linja går foran det nærmeste', () => {
    const r = velgStoppIFart({ stop: NÆRMEST, changed: false }, NÆRMEST, false, påLinja, LISTE);
    expect(r.stop.id).toBe('NSR:B');
    expect(r.stop.distM).toBe(420);
    expect(r.changed).toBe(true);
  });

  it('et stopp du har trykket på selv, vinner', () => {
    const r = velgStoppIFart({ stop: NÆRMEST, changed: false }, NÆRMEST, true, påLinja, LISTE);
    expect(r.stop.id).toBe('NSR:X');
  });

  it('uten kjent linje er det nærmeste stoppet som før', () => {
    const r = velgStoppIFart({ stop: NÆRMEST, changed: false }, NÆRMEST, false, null, LISTE);
    expect(r.stop.id).toBe('NSR:X');
  });

  it('overskriften navngir linja', () => {
    expect(whereLabel(true, ['3'])).toBe('neste stopp på 3');
    expect(whereLabel(true, null)).toBe('nærmeste stopp');
    expect(whereLabel(false, ['3'])).toBe('du er ved');
  });
});

import { readFileSync } from 'node:fs';
describe('koblingen i auto-reise', () => {
  const src = readFileSync('src/views/auto.js', 'utf8');
  const where = src.slice(src.indexOf('function _renderWhere()'), src.indexOf('function _renderWhere()') + 600);
  it('«du er ved» velger med stoppet på linja fra samme dom som tilbudet', () => {
    expect(where).toMatch(/velgStoppIFart\([\s\S]*stoppPåLinja\(_ombordDom\(/);
  });
  it('tilbudet leser den samme dommen', () => {
    const omb = src.slice(src.indexOf('function _renderOmbord()'), src.indexOf('function _renderOmbord()') + 300);
    expect(omb).toContain('_ombordDom(');
  });
});
