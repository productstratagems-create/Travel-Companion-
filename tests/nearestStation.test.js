/**
 * Which stop "du er ved" names.
 *
 * Reported: "Har auto-reise «du er ved» et bias for stoppesteder langs
 * t-bane-nettet? Kjører buss, men appen sier jeg er nære t-banestopper og
 * ikke relevante bussholdeplasser."
 *
 * It did, and the bias was ours in two independent ways — a category list
 * that dropped ordinary kerbside bus stops, and a search radius given in the
 * wrong unit so the geocoder ranked by prominence rather than distance. Both
 * are pinned here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/state.js', () => ({
  state: { walkOvr: null, statLL: {}, homeLL: null, dIdx: 0, nearestStations: [],
    nearestStation: null, gpsError: null },
  intervals: { board: null, track: null, sel: null },
}));
vi.mock('../src/config.js', () => ({
  default: { defaultWalkMinutes: 8, dirs: [{ key: 'out' }],
    api: { geocoderReverse: 'https://api.entur.io/geocoder/v1/reverse' } },
}));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn() }));

import { findNearestStation, NEAR_STOP_MAX_M } from '../src/geo.js';
import { state } from '../src/state.js';

// The reader is standing AT a kerbside bus stop. The metro station is four
// hundred metres away — and it is the one the app named.
const HERE = { lat: 59.9200, lon: 10.7600 };
const at = (m) => ({ lat: HERE.lat + m / 111320, lon: HERE.lon });

const feature = (name, cats, offsetM) => ({
  properties: { id: 'NSR:StopPlace:' + name, name, label: name, category: cats },
  geometry: { coordinates: [at(offsetM).lon, at(offsetM).lat] },
});

let lastUrl = null;
const respond = (features) => {
  lastUrl = null;
  global.fetch = vi.fn((url) => {
    lastUrl = url;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ features }) });
  });
};

const find = (features) => new Promise((res, rej) => {
  respond(features);
  findNearestStation(HERE.lat, HERE.lon, res, (m) => rej(new Error(m || 'fail')));
});

beforeEach(() => { state.nearestStations = []; state.nearestStation = null; state.gpsError = null; });

describe('the categories that count as a stop', () => {
  // The whole of the report, in one assertion: an ordinary bus stop 30 m away
  // must win over a metro station 400 m away.
  it('lets an ordinary kerbside bus stop be the nearest stop', async () => {
    const found = await find([
      feature('Ryen T', ['metroStation'], 400),
      feature('Ryenkrysset', ['onstreetBus'], 30),
    ]);
    expect(found.name).toBe('Ryenkrysset');
    expect(state.nearestStations.map(s => s.name)).toEqual(['Ryenkrysset', 'Ryen T']);
  });

  // Every category in the shared set, one by one. This list carries the whole
  // case, so nothing in it may pass by accident.
  it.each([
    ['metroStation'], ['railStation'], ['busStation'],
    ['onstreetBus'], ['tramStation'], ['onstreetTram'],
  ])('accepts %s', async (cat) => {
    const found = await find([feature('Et stopp', [cat], 50)]);
    expect(found.name).toBe('Et stopp');
  });

  it('still ignores places that are not stops at all', async () => {
    await expect(find([
      feature('Ryen skole', ['school'], 20),
      feature('Kiwi Ryen', ['shop'], 25),
    ])).rejects.toThrow('ingen stasjon i nærheten');
  });
});

describe('distance decides, not the geocoder’s ranking', () => {
  // Pelias returns by confidence, and a metro station is a more prominent
  // venue than a kerb. The order in the response must not survive.
  it('sorts by real distance regardless of response order', async () => {
    await find([
      feature('Fjernt', ['metroStation'], 900),
      feature('Nært', ['onstreetBus'], 40),
      feature('Midt', ['onstreetTram'], 300),
    ]);
    expect(state.nearestStations.map(s => s.name)).toEqual(['Nært', 'Midt', 'Fjernt']);
  });
});

describe('the request', () => {
  // The unit is invisible in everything but the number, so the number is
  // pinned. It was 5000 — read by Pelias as 5000 KM, which made the search
  // unbounded and handed prominence the decision.
  it('asks within a real radius, in kilometres', async () => {
    await find([feature('Et stopp', ['onstreetBus'], 50)]);
    expect(lastUrl).toContain('boundary.circle.radius=0.85');
    expect(lastUrl).not.toContain('radius=5000');
  });

  // The one number, proved to be one. A query radius smaller than the list's
  // limit promises stops that were never asked for; two constants in two
  // files were free to drift into exactly that.
  it('asks for exactly as far as the list is willing to offer', async () => {
    await find([feature('Et stopp', ['onstreetBus'], 50)]);
    expect(lastUrl).toContain('boundary.circle.radius=' + (NEAR_STOP_MAX_M / 1000));
    const fs = await import('node:fs');
    const auto = fs.readFileSync('src/views/auto.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(auto).toContain('NEAR_STOP_MAX_M');
    expect(auto).not.toMatch(/ALT_STOP_MAX_M\s*=/);
  });

  // The filter runs AFTER the fetch, so the page size is what decides whether
  // there are any bus stops left to keep.
  it('asks for enough candidates to survive the filter', async () => {
    await find([feature('Et stopp', ['onstreetBus'], 50)]);
    expect(lastUrl).toContain('size=40');
  });
});

describe('one list, in one place', () => {
  // The two whitelists for this one idea sat in two files and drifted apart —
  // that drift IS the bug. A second copy in geo.js must not come back.
  it('geo.js does not keep a category list of its own', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/geo.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).toContain('TRANSIT_CATS');
    expect(src).not.toContain("'onstreetBus'");
    expect(src).not.toContain("'metroStation'");
  });
});

describe('nothing within the radius is its own fact', () => {
  // With radius=5000 this could never happen, so the screen had one message
  // for two different situations and picked the wrong one. Now that the
  // radius is real, "we cannot find you" and "there is nothing here" are
  // separate — and only one of them is true when someone is standing at a
  // stop the geocoder does not know.
  it('marks the position as good and the surroundings as empty', async () => {
    await expect(find([feature('Ryen skole', ['school'], 20)]))
      .rejects.toThrow('ingen stasjon i nærheten');
    expect(state.gpsError).toBe('nostops');
  });

  it('clears that mark once stops are found again', async () => {
    state.gpsError = 'nostops';
    await find([feature('Skullerudstubben', ['onstreetBus'], 30)]);
    expect(state.gpsError).toBe(null);
  });
});

describe('how far a stop may be', () => {
  // Asked for: only stops within 850 m. The number is the contract, so it is
  // pinned rather than left to be read off a comment.
  it('is 850 metres', () => {
    expect(NEAR_STOP_MAX_M).toBe(850);
  });

  it('keeps a stop just inside and drops one just outside', async () => {
    await find([
      feature('Så vidt innenfor', ['onstreetBus'], NEAR_STOP_MAX_M - 20),
      feature('Nærmest', ['onstreetBus'], 30),
    ]);
    expect(state.nearestStations.map(s => s.name)).toEqual(['Nærmest', 'Så vidt innenfor']);
  });
});

describe('distance is the only rule', () => {
  // There were two silent caps on top of the distance limit — eight here and
  // four alternatives in auto.js — so a stop well inside 850 m could still be
  // invisible. Measured before this: "Skullerud stasjon" at 650 m vanished
  // behind three nearer ones.
  it('keeps every stop inside the limit, however many there are', async () => {
    const many = Array.from({ length: 11 }, (_, i) =>
      feature('Stopp ' + i, ['onstreetBus'], 40 + i * 70));
    await find(many);
    expect(state.nearestStations).toHaveLength(11);
    expect(state.nearestStations[10].distM).toBeLessThanOrEqual(NEAR_STOP_MAX_M);
  });
});
