import { describe, it, expect, vi } from 'vitest';

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({
  makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(),
  mapHalo: vi.fn(), sideVehicleSvg: () => '', SIDE_VEHICLE_MAX_PX: 30,
  mobilityCluster: (g) => ({ lat: g[0].lat, lon: g[0].lon, count: g.length, operator: g[0].operator }),
  vendorColour: () => '#fff',
}));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import { mobilityTarget, clusterIndexOf } from '../src/views/track.js';
import { clusterByDistance, MOBILITY_CLUSTER_M } from '../src/geo.js';

const DEST = { lat: 59.9127, lon: 10.7400, label: 'Stortinget' };

// The list said «1 Bysykkel · The Hub · 30 m unna» and pointed at nothing:
// the rows were plain divs. This is what a tap resolves to.
describe('mobilityTarget — where a row is', () => {
  it('points a vehicle row at the vehicle', () => {
    const o = { type: 'scooter', label: 'Voi', lat: 59.9110, lon: 10.7500 };
    expect(mobilityTarget(o, DEST)).toEqual({ lat: 59.9110, lon: 10.7500, kind: 'scooter' });
  });

  it('points a bike row at the station', () => {
    const o = { type: 'bike', label: 'Bysykkel', lat: 59.9112, lon: 10.7502 };
    expect(mobilityTarget(o, DEST).kind).toBe('bike');
  });

  // «Gå» is not a place — it is the whole way there — so it resolves to the
  // far end of the walk, which the map already draws.
  it('points the walk row at the destination', () => {
    expect(mobilityTarget({ type: 'walk', label: 'Gå' }, DEST))
      .toEqual({ lat: DEST.lat, lon: DEST.lon, kind: 'walk' });
  });

  it('points at nothing when there is nothing to point at', () => {
    expect(mobilityTarget({ type: 'walk' }, null)).toBe(null);
    expect(mobilityTarget(null, DEST)).toBe(null);
  });
});

// A bug shipped in v1.99.0: the rank badge was looked up by the RAW vehicle's
// lat/lon, and clustering moved the marker to the group's centroid. A ranked
// scooter that was not first in its group lost its number entirely.
describe('clusterIndexOf — the badge follows the vehicle into its group', () => {
  const at = (m, op) => ({ lat: 59.9110 + m / 111320, lon: 10.7500, operator: op });
  const groups = () => clusterByDistance(
    [at(0, 'Voi'), at(6, 'Voi'), at(11, 'Voi'), at(300, 'Bolt')],
    MOBILITY_CLUSTER_M, v => v.operator);

  it('finds the group of the FIRST member', () => {
    const g = groups();
    expect(clusterIndexOf(g, { ...at(0, 'Voi'), label: 'Voi' })).toBe(0);
  });

  // The case that broke: the ranked scooter is the third in its rack.
  it('finds the group of a member that is not first', () => {
    const g = groups();
    expect(clusterIndexOf(g, { ...at(11, 'Voi'), label: 'Voi' })).toBe(0);
  });

  it('does not put a vehicle in another operator’s group', () => {
    const g = groups();
    expect(clusterIndexOf(g, { ...at(300, 'Bolt'), label: 'Bolt' })).toBe(1);
  });

  // Two scooters left in the same spot by different operators end up in
  // different groups — coordinates alone would find whichever came first.
  it('tells two operators apart at the very same coordinate', () => {
    const spot = { lat: 59.9110, lon: 10.7500 };
    const g = clusterByDistance(
      [{ ...spot, operator: 'Voi' }, { ...spot, operator: 'Bolt' }],
      MOBILITY_CLUSTER_M, v => v.operator);
    expect(g).toHaveLength(2);
    expect(clusterIndexOf(g, { ...spot, label: 'Voi' })).toBe(0);
    expect(clusterIndexOf(g, { ...spot, label: 'Bolt' })).toBe(1);
  });

  it('answers -1 for something not on the map', () => {
    expect(clusterIndexOf(groups(), { lat: 1, lon: 2, label: 'Voi' })).toBe(-1);
    expect(clusterIndexOf(groups(), { type: 'walk' })).toBe(-1);
    expect(clusterIndexOf(null, { lat: 1, lon: 2 })).toBe(-1);
  });
});
