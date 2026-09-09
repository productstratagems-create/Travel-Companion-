import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { haver } from '../src/geo.js';

// Oslo S, the point six URLs and one guard are written around.
const OSLO = { lat: 59.9139, lon: 10.7522 };
const BERGEN = { lat: 60.3894, lon: 5.3327 };        // Bergen stasjon
const STOCKHOLM = { lat: 59.3300, lon: 18.0590 };

// The reported question was «vil appen fungere i Bergen». This is why the
// answer was no: a destination typed in Bergen is not merely unranked, it is
// discarded 306 km outside a radius drawn around Oslo S.
describe('FØR: the 80 km gate is drawn around Oslo, not around you', () => {
  it('puts Bergen far outside it', () => {
    expect(haver(BERGEN.lat, BERGEN.lon, OSLO.lat, OSLO.lon)).toBeGreaterThan(80000);
  });

  it('rejects Stockholm too, which is the job the radius actually has', () => {
    expect(haver(STOCKHOLM.lat, STOCKHOLM.lon, OSLO.lat, OSLO.lon)).toBeGreaterThan(80000);
  });
});

// The guard against a seventh one creeping in. A coordinate written into a
// URL is invisible until someone opens the app in the wrong city.
describe('nothing writes the focus point by hand any more', () => {
  const files = ['../src/api/entur.js', '../src/views/settings.js', '../src/views/board.js'];
  const read = (f) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

  it('has no geocoder URL with a literal focus point', () => {
    files.forEach(f => expect(read(f)).not.toMatch(/focus\.point\.lat=[0-9]/));
  });

  it('has Oslo S in exactly one place: geo.js', () => {
    files.forEach(f => expect(read(f)).not.toContain('59.9139'));
    const geo = read('../src/geo.js');
    expect((geo.match(/59\.9139/g) || []).length).toBe(1);
    expect(geo).toMatch(/FALLBACK_FOCUS/);
  });

  // The radius that used to be measured from a constant is gone entirely —
  // see «a typed search is not limited by where you stand» below.
  it('has no destination radius left to measure from anywhere', () => {
    expect(read('../src/views/settings.js')).not.toContain('DEST_MAX_M');
  });

  it('rejects Stockholm too, which is the job the radius actually has', () => {
    expect(haver(STOCKHOLM.lat, STOCKHOLM.lon, OSLO.lat, OSLO.lon)).toBeGreaterThan(80000);
  });
});

// ── geoFocus: on you, not on Oslo ──────────────────────────────────────────
describe('geoFocus', () => {
  const load = async (state) => {
    vi.resetModules();
    vi.doMock('../src/state.js', () => ({
      state: { walkOvr: null, statLL: {}, dIdx: 0, walkFromLL: null, homeLL: null, ...state },
      intervals: { board: null, track: null, sel: null },
    }));
    vi.doMock('../src/config.js', () => ({
      default: { defaultWalkMinutes: 8, dirs: [{ key: 'out' }], api: { geocoderReverse: 'x' } },
    }));
    return import('../src/geo.js');
  };

  it('uses the remembered position', async () => {
    const geo = await load({ homeLL: BERGEN });
    expect(geo.geoFocus()).toEqual(BERGEN);
  });

  it('prefers an explicit walk-from place over the remembered one', async () => {
    const geo = await load({ homeLL: OSLO, walkFromLL: BERGEN });
    expect(geo.geoFocus()).toEqual(BERGEN);
  });

  it('falls back to the active route’s own stop', async () => {
    const geo = await load({ statLL: { out: BERGEN } });
    expect(geo.geoFocus()).toEqual(BERGEN);
  });

  // Oslo S is a last resort, not a default — on a first run before GPS lands
  // it genuinely is all the app knows.
  it('uses Oslo S only when nothing at all is known', async () => {
    const geo = await load({});
    expect(geo.geoFocus()).toEqual(geo.FALLBACK_FOCUS);
    expect(geo.FALLBACK_FOCUS).toEqual(OSLO);
  });

  it('builds the query fragment from it', async () => {
    const geo = await load({ homeLL: BERGEN });
    expect(geo.focusParam()).toBe('&focus.point.lat=60.3894&focus.point.lon=5.3327');
  });
});

// ── the destination radius travels with you ────────────────────────────────
describe('a destination is judged by how far it is from YOU', () => {
  const near = (from, to) => haver(to.lat, to.lon, from.lat, from.lon) < 80000;

  it('accepts a Bergen destination when you are in Bergen', () => {
    const VOSS = { lat: 60.6285, lon: 6.4139 };
    expect(near(BERGEN, VOSS)).toBe(true);
    // …and the same destination was discarded under the old Oslo circle.
    expect(near(OSLO, VOSS)).toBe(false);
  });

  it('still keeps Stockholm out, from either city', () => {
    expect(near(BERGEN, STOCKHOLM)).toBe(false);
    expect(near(OSLO, STOCKHOLM)).toBe(false);
  });
});

// ── shared mobility: ask which systems exist, fall back to Oslo's ──────────
//
// The shape of Entur's discovery response cannot be checked from this
// sandbox. That is exactly why the parser must accept the shapes the spec
// allows and treat everything else as "no answer" — a guess that fails then
// costs nothing, because the caller keeps today's Oslo list.
describe('parseSystems', () => {
  const load = async () => { vi.resetModules(); return import('../src/api/mobility.js'); };

  it('reads a bare array', async () => {
    const { parseSystems } = await load();
    expect(parseSystems([{ id: 'boltoslo' }, { id: 'bergenbysykkel' }]).map(s => s.id))
      .toEqual(['boltoslo', 'bergenbysykkel']);
  });

  it('reads a systems or datasets wrapper', async () => {
    const { parseSystems } = await load();
    expect(parseSystems({ systems: [{ id: 'a' }] }).map(s => s.id)).toEqual(['a']);
    expect(parseSystems({ datasets: [{ system_id: 'b' }] }).map(s => s.id)).toEqual(['b']);
  });

  it('reads plain strings', async () => {
    const { parseSystems } = await load();
    expect(parseSystems(['voibergen']).map(s => s.id)).toEqual(['voibergen']);
  });

  // The whole safety of guessing a shape rests here.
  it('treats anything unexpected as no answer', async () => {
    const { parseSystems } = await load();
    [null, undefined, 42, 'nei', {}, { systems: 'nope' }, [{}], [{ id: 5 }]]
      .forEach(x => expect(parseSystems(x)).toEqual([]));
  });
});

describe('the mobility ladder ends where the app already was', () => {
  const load = async () => {
    vi.resetModules();
    return { m: await import('../src/api/mobility.js') };
  };

  it('returns an empty list when discovery fails, rather than rejecting', async () => {
    const { m } = await load();
    global.fetch = vi.fn(() => Promise.reject(new Error('nett')));
    await expect(m.discoverSystems()).resolves.toEqual([]);
  });

  it('returns an empty list on a non-OK response', async () => {
    const { m } = await load();
    global.fetch = vi.fn(() => Promise.resolve({ ok: false }));
    await expect(m.discoverSystems()).resolves.toEqual([]);
  });

  it('asks once per session', async () => {
    const { m } = await load();
    const f = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'a' }]) }));
    global.fetch = f;
    await m.discoverSystems();
    await m.discoverSystems();
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('city bikes and scooters are told apart by the system id', () => {
  it('keeps docked schemes for the bike layer', async () => {
    vi.resetModules();
    const { bikeSystems } = await import('../src/api/bysykkel.js');
    expect(bikeSystems([{ id: 'bergenbysykkel' }, { id: 'boltbergen' }, { id: 'trondheimbysykkel' }])
      .map(s => s.id)).toEqual(['bergenbysykkel', 'trondheimbysykkel']);
  });

  it('names an operator without inventing one', async () => {
    vi.resetModules();
    const { operatorName } = await import('../src/api/scooters.js');
    expect(operatorName('voibergen')).toBe('Voi');
    expect(operatorName('boltoslo')).toBe('Bolt');
    // Unknown stays itself rather than being renamed to something made up.
    expect(operatorName('nyttfirma')).toBe('Nyttfirma');
    expect(operatorName('')).toBe('Sparkesykkel');
  });
});

// ── searching for a city you are not standing in ───────────────────────────
//
// Reported after v1.96.0 shipped: «Finner ikke stopp i Bergen», typed from
// Oslo. Moving the circle from Oslo S to the reader was only half the fix —
// a circle around you is still a circle, and it forbids planning a journey in
// another city. 306 km is not a mistake to be corrected; it is the trip.
describe('a typed search is not limited by where you stand', () => {
  const load = async (homeLL) => {
    vi.resetModules();
    vi.doMock('../src/state.js', () => ({
      state: { walkOvr: null, statLL: {}, dIdx: 0, walkFromLL: null, homeLL,
        nearestStations: [], nearestStation: null },
      intervals: { board: null, track: null, sel: null },
    }));
    vi.doMock('../src/config.js', () => ({
      default: { defaultWalkMinutes: 8, dirs: [{ key: 'out' }],
        storage: {}, api: { geocoder: 'https://g/autocomplete', geocoderReverse: 'https://g/reverse' } },
    }));
    return import('../src/views/settings.js');
  };

  const bergen = (name, cats) => ({
    properties: { id: 'NSR:StopPlace:' + name, name, label: name, category: cats },
    geometry: { coordinates: [BERGEN.lon, BERGEN.lat] },
  });

  // The whole report, as one assertion: standing in Oslo, typing a Bergen
  // stop. Measured in the browser before this: three suggestions became none.
  it('offers a Bergen stop to a reader standing in Oslo', async () => {
    const { stopSuggestions } = await load(OSLO);
    const out = stopSuggestions([
      bergen('Nonneseter', ['tramStop', 'onstreetBus']),
      bergen('Bergen busstasjon', ['StopPlace']),
      bergen('Strandkaiterminalen', ['ferryStop']),
    ]);
    expect(out.map(f => f.properties.name))
      .toEqual(['Nonneseter', 'Bergen busstasjon', 'Strandkaiterminalen']);
  });

  it('still refuses things that are not stops', async () => {
    const { stopSuggestions } = await load(OSLO);
    expect(stopSuggestions([bergen('Kiwi Nonneseter', ['shop'])])).toEqual([]);
  });

  it('refuses a hit with no coordinates, which nothing downstream could use', async () => {
    const { stopSuggestions } = await load(OSLO);
    const broken = { properties: { name: 'X', category: ['onstreetBus'] }, geometry: null };
    expect(stopSuggestions([broken])).toEqual([]);
  });

  it('copes with no answer at all', async () => {
    const { stopSuggestions } = await load(OSLO);
    expect(stopSuggestions(null)).toEqual([]);
    expect(stopSuggestions([])).toEqual([]);
  });

  // Ranking still belongs to the geocoder: the focus point puts what is near
  // you first without forbidding what is far. A grep could not tell a version
  // that sent it from one that did not — this asks the URL.
  it('tells the geocoder where you are', async () => {
    const { suggestUrl } = await load(BERGEN);
    expect(suggestUrl('Nonneseter'))
      .toContain('focus.point.lat=' + BERGEN.lat + '&focus.point.lon=' + BERGEN.lon);
    expect(suggestUrl('Nonneseter')).toContain('text=Nonneseter');
  });

  it('Bergen really is outside any radius Oslo could have', () => {
    expect(haver(BERGEN.lat, BERGEN.lon, OSLO.lat, OSLO.lon)).toBeGreaterThan(300000);
  });
});
