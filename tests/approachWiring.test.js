import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({
  makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(),
  mapHalo: vi.fn(), sideVehicleSvg: () => '', SIDE_VEHICLE_MAX_PX: 30,
}));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

const calls = [];
vi.mock('../src/api/walkApproach.js', () => ({
  approachRoute: vi.fn((from, to, crow) => {
    calls.push({ from, to, crow });
    return Promise.resolve({ latlngs: [[from.lat, from.lon], [to.lat, to.lon]], src: 'valhalla', metres: 340 });
  }),
}));

import { _ensureApproach, _resetApproach, _approachPoints, APPROACH_MIN_M } from '../src/views/board.js';

const FROM = { lat: 59.9000, lon: 10.7000 };
const TO = { lat: 59.9027, lon: 10.7000 };      // ~300 m north
const NEAR = { lat: 59.9023, lon: 10.7000 };    // ~45 m from the stop

beforeEach(() => { calls.length = 0; _resetApproach(); });

// The board redraws every second. v1.71.0 already cost the app a request
// storm this way, and this one would hit a public demo server with no key.
describe('_ensureApproach — once per pair, not once per tick', () => {
  it('asks once however many times the screen is drawn', async () => {
    for (let i = 0; i < 10; i++) _ensureApproach(FROM, TO);
    await Promise.resolve();
    expect(calls).toHaveLength(1);
  });

  it('asks again when the reader has genuinely moved', async () => {
    _ensureApproach(FROM, TO);
    _ensureApproach({ lat: 59.9100, lon: 10.7100 }, TO);
    expect(calls).toHaveLength(2);
  });

  it('ignores GPS jitter under the key’s own resolution', () => {
    _ensureApproach(FROM, TO);
    _ensureApproach({ lat: FROM.lat + 0.00001, lon: FROM.lon }, TO);
    expect(calls).toHaveLength(1);
  });

  it('does not route to your own feet', () => {
    _ensureApproach(NEAR, TO);
    expect(calls).toHaveLength(0);
    expect(APPROACH_MIN_M).toBeGreaterThan(50);
  });

  it('clears the drawn walk when the walk no longer applies', async () => {
    _ensureApproach(FROM, TO);
    await Promise.resolve(); await Promise.resolve();
    expect(_approachPoints()).not.toBe(null);
    _ensureApproach(null, TO);
    expect(_approachPoints()).toBe(null);
  });

  it('measures to the stop it was given, and passes the crow distance on', () => {
    _ensureApproach(FROM, TO);
    expect(calls[0].to).toEqual(TO);
    expect(calls[0].crow).toBeGreaterThan(250);
    expect(calls[0].crow).toBeLessThan(350);
  });
});
