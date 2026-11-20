import { describe, it, expect, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({
  makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(),
  mapHalo: vi.fn(() => '#fff'), sideVehicleSvg: vi.fn(() => '<svg/>'),
  SIDE_VEHICLE_MAX_PX: 38,
}));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));

import { belegg, fraEntur, beleggTekst, KINDS, ORD } from '../src/api/belegg.js';
import { ruteStoppIder, ruteViktigst } from '../src/views/board.js';

// v1.218.177: Rute-kartets faste lapp bare for et stopp ruta går fra.
const cl = (id, name) => [{ id: 'NSR:StopPlace:' + id, name }];
const OLAS = cl('Olas', 'Olasrudveien'), MRUD = cl('Mrud', 'Mortensrud'), KANT = cl('Kant', 'Kantarellen');
const dir = { stopId: 'NSR:StopPlace:Mrud' };

describe('ruteViktigst', () => {
  it('før-bildet: Olasrudveien er nærmest og «viktigst», men betjener ikke ruta → ingen fast lapp på den', () => {
    expect(ruteViktigst([OLAS], ruteStoppIder(dir, []))).toBe(null);
  });
  it('rutas eget stopp får lappen, selv om et annet er nærmere', () => {
    expect(ruteViktigst([OLAS, MRUD], ruteStoppIder(dir, []))).toBe(MRUD);
  });
  it('påstigningen på en rad og «rekk den lenger ned» teller', () => {
    const deps = [{ _legs: [{ mode: 'foot' }, { mode: 'bus', fromPlace: { quay: { stopPlace: { id: 'NSR:StopPlace:Kant' } } } }] }];
    expect(ruteViktigst([OLAS, KANT], ruteStoppIder({}, deps))).toBe(KANT);
    expect(ruteViktigst([OLAS, KANT], ruteStoppIder({}, [{ _rekkLengerNed: { stopp: { id: 'NSR:StopPlace:Kant' } } }]))).toBe(KANT);
  });
});
