/**
 * The places browser is about the DESTINATION now, not the GPS dot.
 *
 * «Utforsk» used to mean this browser, anchored to where the reader stood.
 * It now means finding journeys, and the places became a folded section
 * under the answer — about the place you are travelling to, which is what a
 * reader who has just found a journey to Kongsberg is asking about.
 *
 * Nothing was deleted to make room. The failure this guards against is the
 * quiet one: the section falling back to the GPS position and showing a
 * true list of cafés under the name of a different town.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';

vi.mock('../src/api/places.js', () => ({
  PLACE_CATS: [{ label: 'lunsj', emoji: '🍽', amenities: 'catering.restaurant' }],
  timeCategory: () => ({ label: 'lunsj' }),
  fetchNearbyPlaces: vi.fn(async () => []),
}));
vi.mock('../src/api/weather.js', () => ({ fetchWeather: vi.fn(async () => null) }));
vi.mock('../src/ui/map.js', () => ({
  createMap: () => ({
    setView: vi.fn(), remove: vi.fn(), panTo: vi.fn(), fitBounds: vi.fn(),
    removeLayer: vi.fn(), addLayer: vi.fn(), on: vi.fn(), invalidateSize: vi.fn(),
  }),
  userDot: () => null,
}));
vi.mock('../src/api/entur.js', async (orig) => ({
  ...(await orig()),
  geocodePlace: vi.fn(async () => []),
}));
vi.mock('../src/views/settings.js', () => ({ setActiveRoute: vi.fn() }));

const KONGSBERG = { lat: 59.6686, lon: 9.6497 };
const OSLO = { lat: 59.9111, lon: 10.7528 };

let renderPlaces, state, fetchNearbyPlaces;
beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = '<div id="host"></div>';
  ({ renderPlaces } = await import('../src/views/leisure.js'));
  ({ state } = await import('../src/state.js'));
  ({ fetchNearbyPlaces } = await import('../src/api/places.js'));
  fetchNearbyPlaces.mockClear();
  state.homeLL = OSLO;
});

describe('renderPlaces', () => {
  it('asks about the point it was given, not about the reader', async () => {
    renderPlaces('host', KONGSBERG, 'Kongsberg');
    expect(fetchNearbyPlaces).toHaveBeenCalled();
    const [lat, lon] = fetchNearbyPlaces.mock.calls[0];
    expect(lat).toBeCloseTo(KONGSBERG.lat, 3);
    expect(lon).toBeCloseTo(KONGSBERG.lon, 3);
  });

  it('names that point rather than the nearest station', () => {
    state.nearestStation = { name: 'Jernbanetorget' };
    renderPlaces('host', KONGSBERG, 'Kongsberg');
    const label = document.getElementById('lei-loc-label');
    expect(label.textContent).toBe('Kongsberg');
  });

  // Embedded, it is a section of another screen; it must not paint that
  // screen's title and back button a second time.
  it('drops its own header when embedded', () => {
    renderPlaces('host', KONGSBERG, 'Kongsberg');
    expect(document.querySelectorAll('.lei-header').length).toBe(0);
    renderPlaces(undefined, KONGSBERG, null);   // stand-alone still has one
  });

  // The anchor moved, so what is loaded is about somewhere else. Keeping it
  // would be «relevant, not just right» failing in its purest form.
  it('forgets the previous point\'s places when the point moves', async () => {
    renderPlaces('host', KONGSBERG, 'Kongsberg');
    await Promise.resolve();
    fetchNearbyPlaces.mockClear();
    renderPlaces('host', OSLO, 'Oslo S');
    expect(fetchNearbyPlaces).toHaveBeenCalled();
    expect(fetchNearbyPlaces.mock.calls[0][0]).toBeCloseTo(OSLO.lat, 3);
  });

  // «reis dit» plans from where the reader IS, even when the section is
  // about the far end of a journey. Deliberately not the anchor.
  it('still plans «reis dit» from the reader, not from the anchor', () => {
    const src = fs.readFileSync('src/views/leisure.js', 'utf8');
    const fn = src.slice(src.indexOf('function _reisDit'), src.indexOf('function _updateWeatherEl'));
    expect(fn).toMatch(/const pos = _locOvr \|\| state\.homeLL;/);
    expect(fn.replace(/\/\/[^\n]*/g, '')).not.toMatch(/_anchor\b/);
  });
});
