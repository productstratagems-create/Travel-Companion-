import { describe, it, expect, vi } from 'vitest';

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({
  makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(),
  mapHalo: vi.fn(), sideVehicleSvg: () => '', SIDE_VEHICLE_MAX_PX: 30,
}));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import { modesOf, STOP_MODE, TRANSIT_CATS, CAT_MODE } from '../src/api/stopCats.js';
import { laneStops, LANES } from '../src/views/auto.js';

describe('modesOf — every mode a stop serves, not the first one', () => {
  // The reported case: Hellerud is a metro station AND a kerbside bus stop.
  it('keeps both modes of an interchange', () => {
    expect(modesOf(['metroStation', 'onstreetBus'])).toEqual(['metro', 'bus']);
  });

  it.each([
    ['metroStation', 'metro'], ['tramStation', 'tram'], ['onstreetTram', 'tram'],
    ['busStation', 'bus'], ['onstreetBus', 'bus'],
    ['railStation', 'rail'], ['tramStop', 'tram'],
  ])('maps %s to %s', (cat, mode) => {
    expect(modesOf([cat])).toEqual([mode]);
  });

  it('says a mode once however many categories mean it', () => {
    expect(modesOf(['onstreetBus', 'busStation'])).toEqual(['bus']);
  });

  it('gives nothing for a category it does not know, and for nothing at all', () => {
    expect(modesOf(['school'])).toEqual([]);
    expect(modesOf([])).toEqual([]);
    expect(modesOf(null)).toEqual([]);
  });

  // railStation and tramStop are deliberately absent from CAT_MODE — adding
  // them there would change what fetchNearbyStops puts on the board's map.
  // This is what keeps the two tables from being made "consistent" by
  // someone tidying up.
  it('is CAT_MODE plus rail and tramStop, and CAT_MODE stays narrow', () => {
    Object.entries(CAT_MODE).forEach(([c, m]) => expect(STOP_MODE[c]).toBe(m));
    expect(CAT_MODE.railStation).toBeUndefined();
    expect(CAT_MODE.tramStop).toBeUndefined();
    expect(STOP_MODE.railStation).toBe('rail');
  });

  // The guard against LANES and STOP_MODE drifting apart.
  it('produces no mode that has no lane', () => {
    const lanes = new Set(LANES.map(l => l.mode));
    TRANSIT_CATS.forEach(c => modesOf([c]).forEach(m => expect(lanes.has(m)).toBe(true)));
  });
});

describe('laneStops — one band per mode', () => {
  const S = (name, distM, modes) => ({ id: 'NSR:StopPlace:' + name, name, distM, modes });
  // The reported screen at Hellerud, in the order rankStops gave it.
  const LIST = [
    S('Godlia', 114, ['metro']),
    S('Tveten gård', 376, ['bus']),
    S('Stordamveien', 721, ['bus']),
    S('Tveita T', 751, ['metro', 'bus']),
    S('Trasoppveien', 774, ['bus']),
  ];

  it('orders the bands and drops the empty ones', () => {
    expect(laneStops(LIST).map(l => l.label)).toEqual(['T-bane', 'Buss']);
  });

  it('puts an interchange in both its lanes, with the same id', () => {
    const lanes = laneStops(LIST);
    const inMetro = lanes[0].stops.find(s => s.name === 'Tveita T');
    const inBus = lanes[1].stops.find(s => s.name === 'Tveita T');
    expect(inMetro).toBeTruthy();
    expect(inBus).toBeTruthy();
    expect(inBus.id).toBe(inMetro.id);
  });

  it('keeps the order it was given inside a lane', () => {
    expect(laneStops(LIST)[1].stops.map(s => s.name))
      .toEqual(['Tveten gård', 'Stordamveien', 'Tveita T', 'Trasoppveien']);
  });

  it('never hides a stop whose mode is unknown', () => {
    const out = laneStops([S('Et sted', 50, [])]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('Andre stopp');
  });

  it('puts the unknown lane last', () => {
    const out = laneStops([S('Ukjent', 50, []), S('Godlia', 114, ['metro'])]);
    expect(out.map(l => l.mode)).toEqual(['metro', null]);
  });

  it('copes with nothing', () => {
    expect(laneStops([])).toEqual([]);
    expect(laneStops(null)).toEqual([]);
  });

  // The count over the list is stops, not rows. An interchange in two lanes
  // must not make "5 ▾" read "6 ▾".
  it('does not change how many stops there are', () => {
    const rows = laneStops(LIST).reduce((n, l) => n + l.stops.length, 0);
    expect(rows).toBe(6);          // five stops, one of them twice
    expect(LIST.length).toBe(5);   // and the heading counts this
  });
});
