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
vi.mock('../src/geo.js', async (orig) => ({ ...(await orig()), mToLeave: () => 10, walkInfo: () => ({ mins: 2 }) }));
import { egetAlternativ } from '../src/views/board.js';

// v1.218.175: ditt eget alternativ — første avgang du rekker, og når den er framme.
const T = Date.UTC(2026, 10, 20, 16, 30), M = 60_000, iso = m => new Date(T + m * M).toISOString();
const dir = { from: 'Mortensrud', to: 'Jernbanetorget' };
const rad = (dep, arr, ekstra = {}) => ({ c: { expectedDepartureTime: iso(dep), aimedDepartureTime: iso(dep), cancellation: false,
  serviceJourney: { estimatedCalls: [
    { quay: { stopPlace: { name: 'Mortensrud' } }, expectedDepartureTime: iso(dep) },
    { quay: { stopPlace: { name: 'Jernbanetorget' } }, expectedArrivalTime: iso(arr) },
  ] }, ...ekstra } });

describe('egetAlternativ', () => {
  it('første avgang som ikke er gått, med ankomsten raden viser', () => {
    const e = egetAlternativ([rad(-2, 15), rad(4, 21), rad(10, 27)], dir, true, T);
    expect(e && e.framme).toBe(T + 21 * M);
  });
  it('hopper over innstilte', () => {
    const e = egetAlternativ([rad(4, 21, { cancellation: true }), rad(10, 27)], dir, true, T);
    expect(e.framme).toBe(T + 27 * M);
  });
  it('uten rader: null', () => { expect(egetAlternativ([], dir, true, T)).toBe(null); });
});

describe('uten gangtid (v1.218.179)', () => {
  it('vet ikke hva du rekker → intet eget alternativ, ikke første rad', () => {
    expect(egetAlternativ([rad(4, 21)], dir, false, T)).toBe(null);
  });
});
