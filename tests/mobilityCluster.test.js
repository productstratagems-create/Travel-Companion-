import { describe, it, expect, vi } from 'vitest';

vi.mock('leaflet', () => ({ default: {} }));

import { clusterByDistance, MOBILITY_CLUSTER_M, STOP_CLUSTER_M, haver } from '../src/geo.js';
import { mobilityCluster, vendorColour, VENDOR_COLOUR } from '../src/ui/mapIcons.js';

// A rack: scooters metres apart. Reported from the arrival map at
// Jernbanetorget as eight badges piled on one spot, all reading «100%».
const RACK = { lat: 59.9110, lon: 10.7500 };
const near = (m, dLon = 0) => ({ lat: RACK.lat + m / 111320, lon: RACK.lon + dLon });
const v = (m, operator, battery, dist) => ({ ...near(m), operator, battery, dist });

describe('clusterByDistance', () => {
  it('makes one group of a rack full of the same operator', () => {
    const out = clusterByDistance(
      [v(0, 'Voi', 100, 40), v(5, 'Voi', 100, 42), v(9, 'Voi', 97, 45)],
      MOBILITY_CLUSTER_M, x => x.operator);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(3);
  });

  // «basert på avstand OG tilbyder»: standing together is not being the same
  // offer. Two operators at one rack stay two markers.
  it('keeps operators apart even at the same spot', () => {
    const out = clusterByDistance(
      [v(0, 'Voi', 100, 40), v(2, 'Bolt', 90, 41)],
      MOBILITY_CLUSTER_M, x => x.operator);
    expect(out).toHaveLength(2);
  });

  it('keeps scooters that are genuinely apart apart', () => {
    const far = MOBILITY_CLUSTER_M + 20;
    const out = clusterByDistance([v(0, 'Voi', 100, 40), v(far, 'Voi', 100, 90)],
      MOBILITY_CLUSTER_M, x => x.operator);
    expect(out).toHaveLength(2);
  });

  it('anchors on the order given, so the nearest leads its group', () => {
    const out = clusterByDistance([v(0, 'Voi', 90, 40), v(5, 'Voi', 100, 44)],
      MOBILITY_CLUSTER_M, x => x.operator);
    expect(out[0][0].dist).toBe(40);
  });

  it('groups by distance alone when no key is given', () => {
    const out = clusterByDistance([v(0, 'Voi'), v(4, 'Bolt')], MOBILITY_CLUSTER_M);
    expect(out).toHaveLength(1);
  });

  it('loses nothing, and copes with nothing', () => {
    const list = [v(0, 'Voi'), v(5, 'Voi'), v(200, 'Bolt'), v(205, 'Bolt')];
    const out = clusterByDistance(list, MOBILITY_CLUSTER_M, x => x.operator);
    expect(out.reduce((n, g) => n + g.length, 0)).toBe(4);
    expect(clusterByDistance([], 30)).toEqual([]);
    expect(clusterByDistance(null, 30)).toEqual([]);
  });

  // The stops rule was this same loop, written inline with the metres unnamed.
  it('is the same rule the nearby stops use, with both distances named', () => {
    expect(STOP_CLUSTER_M).toBe(80);
    expect(MOBILITY_CLUSTER_M).toBe(30);
    const stops = [{ lat: RACK.lat, lon: RACK.lon, mode: 'bus' },
      { ...near(50), mode: 'bus' }, { ...near(50), mode: 'metro' }];
    const out = clusterByDistance(stops, STOP_CLUSTER_M, s => s.mode);
    expect(out.map(g => g.length)).toEqual([2, 1]);   // the metro stays its own
  });
});

describe('mobilityCluster — what a group is', () => {
  const group = [v(0, 'Voi', 90, 40), v(5, 'Voi', 100, 44), v(9, 'Voi', 97, 48)];

  it('counts them', () => {
    expect(mobilityCluster(group).count).toBe(3);
  });

  // The one you would take.
  it('reports the best battery, not the first', () => {
    expect(mobilityCluster(group).battery).toBe(100);
  });

  // How far you must walk to reach any of them.
  it('reports the nearest distance', () => {
    expect(mobilityCluster(group).dist).toBe(40);
  });

  // A marker sitting on one scooter of three would point at a single vehicle
  // while claiming to be all of them.
  it('sits at the centroid, not on one member', () => {
    const g = mobilityCluster(group);
    expect(g.lat).toBeGreaterThan(group[0].lat);
    expect(g.lat).toBeLessThan(group[2].lat);
  });

  it('names the operator in the tooltip, with the count', () => {
    expect(mobilityCluster(group).tooltip).toMatch(/^Voi · 3 stk · 100% · 40 m$/);
  });

  it('says no count for a single scooter', () => {
    expect(mobilityCluster([v(0, 'Bolt', 55, 12)]).tooltip).toBe('Bolt · 55% · 12 m');
  });

  it('copes with a missing battery and an unnamed operator', () => {
    const g = mobilityCluster([{ lat: 1, lon: 2, battery: null, dist: 5 }]);
    expect(g.battery).toBe(null);
    expect(g.operator).toBe('Sparkesykkel');
    expect(g.tooltip).toBe('Sparkesykkel · 5 m');
  });

  it('copes with nothing', () => {
    expect(mobilityCluster([])).toBe(null);
    expect(mobilityCluster(null)).toBe(null);
  });
});

// The palette was written twice: VENDOR_COLORS in board.js and a .vnd-*
// palette in board.css that carried the same colours and was applied nowhere.
describe('vendorColour', () => {
  it('gives each operator its own', () => {
    expect(vendorColour('Voi')).toBe(VENDOR_COLOUR.Voi);
    expect(vendorColour('Bolt')).not.toBe(vendorColour('Voi'));
  });

  it('gives a name it does not know a neutral one rather than another’s', () => {
    const unknown = vendorColour('Nyttfirma');
    expect(Object.values(VENDOR_COLOUR)).not.toContain(unknown);
    expect(vendorColour(null)).toBe(unknown);
  });
});
