// Tidene til høyre på tavleraden gjentar ikke det som alt står.
//
// Rapportert kl. 22:48: «00:03» stort til venstre, «i morgen 00:03» og «ank.
// i morgen 00:28» til høyre. Klokkeslettet og dagen sto to ganger, og
// teksten gikk inn i spor-kolonnen.
import { describe, it, expect, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({ makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), VEHICLE_MARKER_OPTS: {}, makeRouteStopIcon: vi.fn(), makeJourneyPointIcon: vi.fn(), mapHalo: vi.fn(), sideVehicleSvg: vi.fn(), SIDE_VEHICLE_MAX_PX: 1, mobilityCluster: vi.fn(), vendorColour: vi.fn() }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));
const { radTider, ankomstHtml } = await import('../src/views/board.js');

const L = (d, hh, mm) => new Date(2026, 10, d, hh, mm).getTime();
const NÅ = L(5, 22, 48);

describe('radTider', () => {
  it('klokkeslettet står til venstre: bare dagen til høyre', () => {
    expect(radTider(L(6, 0, 3), L(6, 0, 28), NÅ, true)).toEqual({ dep: 'i morgen', ank: '00:28' });
  });
  it('i dag med klokke til venstre: ingenting gjentas', () => {
    expect(radTider(L(5, 23, 55), L(6, 0, 47), NÅ, true)).toEqual({ dep: '', ank: 'i morgen 00:47' });
  });
  it('minutter til venstre: avgangstiden står til høyre som før', () => {
    expect(radTider(L(5, 23, 2), L(5, 23, 30), NÅ, false).dep).toBe('23:02');
  });
  it('ankomsten regnes fra avgangsdagen, ikke fra nå', () => {
    expect(ankomstHtml(L(6, 0, 28), NÅ, { fra: L(6, 0, 3) })).toContain('ank. 00:28');
    expect(ankomstHtml(L(6, 0, 28), NÅ, {})).toContain('ank. i morgen 00:28');
  });
});
