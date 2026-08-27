import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = {};
vi.mock('../src/storage.js', () => ({
  storage: {
    get: (k) => (k in store ? store[k] : null),
    set: (k, v) => { store[k] = v; },
    remove: (k) => { delete store[k]; },
  },
  listProfiles: () => ['default'], getActiveProfile: () => 'default',
  createProfile: vi.fn(), switchProfile: vi.fn(), deleteProfile: vi.fn(),
}));
vi.mock('../src/config.js', () => ({ default: { dirs: [{ key: 'out', from: 'A', to: 'B' }, {}, {}], storage: { dir: 't.dir', route: 't.route' }, api: {} } }));
vi.mock('../src/api/http.js', () => ({ enturFetch: vi.fn() }));
vi.mock('../src/api/smart.js', () => ({ recordSmartTrip: vi.fn(), tripCount: () => 0 }));
vi.mock('../src/state.js', () => ({ state: { dIdx: 0, nearestStation: null, nearestStations: [] } }));
vi.mock('../src/geo.js', () => ({
  haver: () => 0, loadWalkSpeed: () => 'middels', saveWalkSpeed: vi.fn(),
  loadWalkBuffer: () => 0, saveWalkBuffer: vi.fn(), loadWalkFrom: () => null,
  saveWalkFrom: vi.fn(), clearWalkFrom: vi.fn(),
}));
vi.mock('../src/theme.js', () => ({
  loadTheme: () => 'system', setTheme: vi.fn(), loadPalette: () => 'standard', setPalette: vi.fn(),
}));
vi.mock('../src/api/entur.js', () => ({ geocodePlace: vi.fn(), geocodeDest: vi.fn(), TRANSIT_CAT: [] }));
vi.mock('../src/ui/fmt.js', () => ({ makeSuggBtn: vi.fn(), esc: (x) => x, venueDetailHtml: () => '' }));
vi.mock('../src/api/places.js', () => ({ fetchNearbyPlaces: vi.fn() }));
vi.mock('../src/ui/favs.js', () => ({ loadFavs: () => [], topFavRoutes: () => [] }));

const { syncRouteFields, loadDep, loadDest, loadVia, setActiveRoute, loadActiveRoute } = await import('../src/views/settings.js');
const config = (await import('../src/config.js')).default;
const { state } = await import('../src/state.js');
const storeRaw = (k, v) => { store['t.route'] = v; };

beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; });

/**
 * saveDep/saveDest were written from «bruk rute» and the deep link only.
 * Picking a favourite or reversing set the running route but left the form
 * holding whatever was last typed — so «velg rute» showed the old route, and
 * pressing «bruk rute» put it back.
 */
describe('syncRouteFields', () => {
  it('writes the route the board is actually showing', () => {
    syncRouteFields({ from: 'Bøler', to: 'Helsfyr' });
    expect(loadDep()).toBe('Bøler');
    expect(loadDest()).toBe('Helsfyr');
  });

  it('keeps a via stop when the route has one', () => {
    syncRouteFields({ from: 'A', to: 'B', via: 'Helsfyr' });
    expect(loadVia()).toBe('Helsfyr');
  });

  // favToDir carries no via, so without clearing it an old one would stay
  // behind and reappear the next time the form was used.
  it('clears a stale via when the new route has none', () => {
    syncRouteFields({ from: 'A', to: 'B', via: 'Helsfyr' });
    syncRouteFields({ from: 'C', to: 'D' });
    expect(loadVia()).toBeNull();
    expect(loadDep()).toBe('C');
  });

  it('leaves a field alone rather than blanking it on a partial route', () => {
    syncRouteFields({ from: 'A', to: 'B' });
    syncRouteFields({ from: 'C' });
    expect(loadDep()).toBe('C');
    expect(loadDest()).toBe('B');
  });

  it('does nothing at all when there is no route', () => {
    syncRouteFields({ from: 'A', to: 'B' });
    syncRouteFields(null);
    expect(loadDep()).toBe('A');
  });
});

/**
 * Only t.dep/t.dest were stored, so applyRouteFromState rebuilt the route
 * from two names on every start: toStopId was always dropped and coordinates
 * with it. Measured against a favourite pointing at a venue, the destination
 * came back as different coordinates under the same label — the app planned
 * somewhere else and said nothing.
 */
describe('setActiveRoute / loadActiveRoute', () => {
  const venue = {
    key: 'custom-out', from: 'Bøler', to: 'Kaffebrenneriet Grünerløkka',
    stopId: 'NSR:StopPlace:3', toStopId: null, filter: null,
    geo: null, toGeo: 'Kaffebrenneriet Grünerløkka', line: null,
    _fromLat: 59.877, _fromLon: 10.818, _toLat: 59.926, _toLon: 10.759,
  };

  it('brings the whole route back, ids and coordinates included', () => {
    setActiveRoute(venue);
    expect(loadActiveRoute()).toEqual(venue);
  });

  // The four things every one of the six call sites had to remember.
  it('sets the route, the index, the stored copy and the form fields', () => {
    setActiveRoute(venue);
    expect(config.dirs[2]).toBe(venue);
    expect(state.dIdx).toBe(2);
    expect(loadActiveRoute().toStopId).toBeNull();
    expect(loadDep()).toBe('Bøler');
    expect(loadDest()).toBe('Kaffebrenneriet Grünerløkka');
  });

  it('keeps a via stop across the round trip', () => {
    setActiveRoute({ ...venue, via: 'Helsfyr', viaStopId: 'NSR:StopPlace:9' });
    expect(loadActiveRoute().via).toBe('Helsfyr');
    expect(loadActiveRoute().viaStopId).toBe('NSR:StopPlace:9');
  });

  // Startup must be able to fall back, not crash, on anything unusable.
  it('returns null rather than throwing on nothing usable', () => {
    expect(loadActiveRoute()).toBeNull();
    setActiveRoute(venue);
    storeRaw('t.route', '{ ikke json');
    expect(loadActiveRoute()).toBeNull();
    storeRaw('t.route', JSON.stringify({ from: 'A' }));
    expect(loadActiveRoute()).toBeNull();
  });

  it('ignores a call with no route at all', () => {
    setActiveRoute(venue);
    setActiveRoute(null);
    expect(loadActiveRoute().from).toBe('Bøler');
  });
});
