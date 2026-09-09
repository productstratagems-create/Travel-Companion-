import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/state.js', () => ({
  state: { walkOvr: null, statLL: {}, homeLL: null, dIdx: 0, walkFromLL: null,
    nearestStations: [], nearestStation: null, gpsError: null },
  intervals: { board: null, track: null, sel: null },
}));
vi.mock('../src/config.js', () => ({
  default: { defaultWalkMinutes: 8, dirs: [{ key: 'out' }],
    api: { geocoderReverse: 'https://api.entur.io/geocoder/v1/reverse' } },
}));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import { findNearestStation } from '../src/geo.js';
import { state } from '../src/state.js';

const HERE = { lat: 60.3894, lon: 5.3327 };          // Bergen stasjon
const at = (m) => HERE.lat + m / 111320;

const feat = (name, cats, m) => ({
  properties: { id: 'NSR:StopPlace:' + name.replace(/\W/g, ''), name, label: name, category: cats },
  geometry: { coordinates: [HERE.lon, at(m)] },
});

const find = (features) => new Promise((res, rej) => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ features }) }));
  findNearestStation(HERE.lat, HERE.lon, res, (msg) => rej(new Error(msg || 'fail')));
});

beforeEach(() => { state.nearestStations = []; state.nearestStation = null; state.gpsError = null; });

// Four kinds of stop reported missing in Bergen, four different causes.
describe('the stops Bergen has, and the app now finds', () => {
  it('finds a ferry quay, and calls it a boat stop', async () => {
    const f = await find([feat('Strandkaiterminalen', ['ferryStop'], 120)]);
    expect(f.name).toBe('Strandkaiterminalen');
    expect(f.modes).toEqual(['water']);
  });

  it('finds a harbour', async () => {
    const f = await find([feat('Nøstet', ['harbourPort'], 200)]);
    expect(f.modes).toEqual(['water']);
  });

  // Bergen busstasjon is the kind of multimodal hub Entur types like this.
  // The typed-search path always accepted them; only the GPS path did not.
  // A hub gets NO mode on purpose — the category says a stop is there, not
  // what runs from it — so it lands in the «andre stopp» lane and the board
  // answers the rest.
  it('finds a multimodal hub typed StopPlace or GroupOfStopPlaces', async () => {
    const a = await find([feat('Bergen busstasjon', ['StopPlace'], 150)]);
    expect(a.name).toBe('Bergen busstasjon');
    expect(a.modes).toEqual([]);
    const b = await find([feat('Bystasjonen', ['GroupOfStopPlaces'], 150)]);
    expect(b.name).toBe('Bystasjonen');
  });

  it('still refuses a place that is not a stop at all', async () => {
    await expect(find([feat('Kiwi Nonneseter', ['shop'], 30)]))
      .rejects.toThrow('ingen stasjon i nærheten');
  });

  // The fourth cause cannot be reproduced by mocking a response: `size` is a
  // SERVER cap, so handing the client 41 features does not simulate the 41st
  // never being sent. What is verifiable is the mechanism — the page is asked
  // for with no category restriction, and the filter runs after it. In a
  // dense centre `layers=venue` returns shops and attractions too, and they
  // spend the page.
  it('asks for a page with no category restriction, then filters', async () => {
    let url = null;
    global.fetch = vi.fn((u) => { url = u; return Promise.resolve({ ok: true, json: () => Promise.resolve({ features: [] }) }); });
    findNearestStation(HERE.lat, HERE.lon, () => {}, () => {});
    await Promise.resolve();
    expect(url).toContain('layers=venue');
    expect(url).not.toContain('categories=');
    expect(url).toMatch(/size=\d+/);
  });
});

// ── one list, not two ──────────────────────────────────────────────────────
//
// The third time this shape has appeared: two whitelists for one idea, in two
// files, drifting. In v1.76.0 it cost every kerbside bus stop in Oslo; here it
// cost the ferry quays and the multimodal hubs in Bergen.
describe('there is exactly one stop-category list', () => {
  it('entur.js does not keep its own', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/api/entur.js'), 'utf8');
    expect(src).not.toMatch(/const TRANSIT_CAT = \[/);
    expect(src).toMatch(/from '\.\/stopCats\.js'/);
  });

  it('and the one list holds every category both paths used to need', async () => {
    const { TRANSIT_CATS } = await import('../src/api/stopCats.js');
    ['metroStation', 'busStation', 'onstreetBus', 'tramStation', 'onstreetTram',
      'railStation', 'tramStop', 'ferryStop', 'harbourPort',
      'GroupOfStopPlaces', 'StopPlace', 'airport']
      .forEach(c => expect(TRANSIT_CATS).toContain(c));
  });
});

// ── water, end to end ──────────────────────────────────────────────────────
describe('a boat is a mode the app knows', () => {
  it('has a stop mode', async () => {
    const { modesOf, STOP_MODE } = await import('../src/api/stopCats.js');
    expect(modesOf(['ferryStop'])).toEqual(['water']);
    expect(modesOf(['harbourPort'])).toEqual(['water']);
    expect(STOP_MODE.ferryStop).toBe('water');
  });

  it('is asked for on the departure board', async () => {
    const { BOARD_MODES } = await import('../src/api/queries.js');
    expect(BOARD_MODES).toContain('water');
  });

  it('has a lane and a rank of its own', async () => {
    const { LANES, RANKS } = await import('../src/views/auto.js');
    expect(LANES.map(l => l.mode)).toContain('water');
    expect(RANKS.map(r => r.key)).toContain('water');
  });

  // Reported for the coach in v1.86.0 and true again: a mode nothing asks for
  // is not filtered off the screen, it never existed.
  it('is in the trip query, not only the board query', async () => {
    const { tripGQL } = await import('../src/api/queries.js');
    expect(tripGQL('A', 'B', null, 5, 1.3, Date.now(), false, false, false, null))
      .toContain('{transportMode:water}');
  });

  // A ferry used to be drawn as an orange metro: no shape, no colour, both
  // fell through to the same fallback.
  it('is not drawn as a metro', async () => {
    const { sideVehicleSvg } = await import('../src/ui/mapIcons.js');
    expect(sideVehicleSvg('water', null, '5')).not.toBe(sideVehicleSvg('metro', null, '5'));
  });

  it('leaves from a kai, not a platform and not a track', async () => {
    const { quayLabel } = await import('../src/views/auto.js');
    const call = (code, mode) => ({
      quay: { publicCode: code },
      serviceJourney: { line: { transportMode: mode } },
    });
    expect(quayLabel(call('A', 'water'))).toMatch(/kai/);
    expect(quayLabel(call('1', 'metro'))).toMatch(/spor/);
    expect(quayLabel(call('C', 'bus'))).toMatch(/plattform/);
  });
});

// ── the map's own nearby stops ─────────────────────────────────────────────
//
// This path had no test at all, which is why switching it back to the narrow
// table killed nothing — and why Bybanen could vanish from the map without a
// single assertion noticing.
describe('fetchNearbyStops keeps the modes the narrow table left out', () => {
  const load = async () => {
    vi.resetModules();
    vi.doMock('../src/config.js', () => ({
      default: { api: { geocoderReverse: 'https://api.entur.io/geocoder/v1/reverse' } },
    }));
    vi.doMock('../src/api/http.js', () => ({
      enturFetch: (u) => { lastUrl = u; return Promise.resolve({ ok: true, json: () => Promise.resolve({ features })  }); },
      ET_CLIENT_NAME: 'x',
    }));
    const m = await import('../src/api/stops.js');
    m._resetNearbyCache();
    return m;
  };
  let features = [];
  let lastUrl = null;
  const f = (name, cats) => ({
    properties: { id: 'NSR:StopPlace:' + name, name, category: cats },
    geometry: { coordinates: [5.3327, 60.3894] },
  });

  it('emits a stop for a tramStop — Bybanen', async () => {
    features = [f('Nonneseter', ['tramStop'])];
    const { fetchNearbyStops } = await load();
    const out = await fetchNearbyStops(60.3894, 5.3327);
    expect(out.map(s => s.mode)).toEqual(['tram']);
  });

  it('emits a stop for a railStation', async () => {
    features = [f('Bergen stasjon', ['railStation'])];
    const { fetchNearbyStops } = await load();
    expect((await fetchNearbyStops(60.3894, 5.3327)).map(s => s.mode)).toEqual(['rail']);
  });

  it('emits a boat stop for a ferry quay', async () => {
    features = [f('Strandkaiterminalen', ['ferryStop'])];
    const { fetchNearbyStops } = await load();
    expect((await fetchNearbyStops(60.3894, 5.3327)).map(s => s.mode)).toEqual(['water']);
  });

  it('still emits one entry per distinct mode at an interchange', async () => {
    features = [f('Bystasjonen', ['onstreetBus', 'busStation', 'tramStop'])];
    const { fetchNearbyStops } = await load();
    expect((await fetchNearbyStops(60.3894, 5.3327)).map(s => s.mode).sort())
      .toEqual(['bus', 'tram']);
  });

  // One circle, shared with geo.js. This file said 0.8 while geo.js said 0.85.
  it('uses the same radius as the list beside it', async () => {
    features = [];
    const { fetchNearbyStops } = await load();
    const { NEAR_STOP_MAX_M, NEAR_SIZE } = await import('../src/geo.js');
    await fetchNearbyStops(60.3894, 5.3327);
    expect(lastUrl).toContain('boundary.circle.radius=' + (NEAR_STOP_MAX_M / 1000));
    expect(lastUrl).toContain('size=' + NEAR_SIZE);
  });
});
