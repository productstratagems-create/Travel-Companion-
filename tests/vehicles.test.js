import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  livePosition, parseVehicle, parseVehicles, fetchVehiclePositions,
  _resetVehicleCache, MAX_AGE_MS,
} from '../src/api/vehicles.js';

const NOW = 1_700_000_000_000;
const at = (msAgo) => new Date(NOW - msAgo).toISOString();

const apiVehicle = (over = {}) => ({
  vehicleId: 'RUT:Vehicle:1',
  lastUpdated: at(5_000),
  bearing: 214,
  speed: 12.5,
  location: { latitude: 59.9139, longitude: 10.7522 },
  line: { lineRef: 'RUT:Line:5' },
  serviceJourney: { id: 'RUT:ServiceJourney:5-1' },
  ...over,
});

describe('parseVehicle', () => {
  it('normalises a vehicle into a position keyed by service journey', () => {
    const p = parseVehicle(apiVehicle());
    expect(p).toEqual({
      id: 'RUT:ServiceJourney:5-1',
      lat: 59.9139, lon: 10.7522,
      bearing: 214,
      lastUpdated: NOW - 5_000,
    });
  });

  it('drops a position with no service journey — it cannot be tied to a departure', () => {
    expect(parseVehicle(apiVehicle({ serviceJourney: null }))).toBeNull();
  });

  it('drops a position with no coordinates or no timestamp', () => {
    expect(parseVehicle(apiVehicle({ location: null }))).toBeNull();
    expect(parseVehicle(apiVehicle({ location: { latitude: null, longitude: 10.7 } }))).toBeNull();
    expect(parseVehicle(apiVehicle({ lastUpdated: null }))).toBeNull();
    expect(parseVehicle(apiVehicle({ lastUpdated: 'not a date' }))).toBeNull();
  });

  it('keeps a missing bearing as null rather than dropping the position', () => {
    expect(parseVehicle(apiVehicle({ bearing: null })).bearing).toBeNull();
  });
});

describe('parseVehicles', () => {
  it('maps by service journey id and skips unusable entries', () => {
    const m = parseVehicles({ data: { vehicles: [
      apiVehicle(),
      apiVehicle({ serviceJourney: { id: 'RUT:ServiceJourney:5-2' }, location: { latitude: 59.92, longitude: 10.76 } }),
      apiVehicle({ serviceJourney: null }),
    ] } });
    expect([...m.keys()]).toEqual(['RUT:ServiceJourney:5-1', 'RUT:ServiceJourney:5-2']);
  });

  it('returns an empty map for an error payload or a missing field', () => {
    expect(parseVehicles({ errors: [{ message: 'boom' }] }).size).toBe(0);
    expect(parseVehicles({ data: {} }).size).toBe(0);
    expect(parseVehicles(null).size).toBe(0);
  });
});

describe('livePosition — the staleness rule', () => {
  const mapWith = (msAgo) => parseVehicles({ data: { vehicles: [apiVehicle({ lastUpdated: at(msAgo) })] } });
  const JID = 'RUT:ServiceJourney:5-1';

  it('returns a fresh reading, flagged live', () => {
    const p = livePosition(mapWith(5_000), JID, NOW);
    expect(p).toMatchObject({ lat: 59.9139, lon: 10.7522, live: true });
  });

  it('accepts a reading right up to the age limit', () => {
    expect(livePosition(mapWith(MAX_AGE_MS - 1_000), JID, NOW)).not.toBeNull();
  });

  it('rejects a reading past the age limit — a stopped feed drifts silently', () => {
    expect(livePosition(mapWith(MAX_AGE_MS + 1_000), JID, NOW)).toBeNull();
    expect(livePosition(mapWith(10 * 60_000), JID, NOW)).toBeNull();
  });

  it('rejects a reading from the future — clock skew is not evidence', () => {
    expect(livePosition(mapWith(-(MAX_AGE_MS + 1_000)), JID, NOW)).toBeNull();
  });

  it('returns null when this journey has no live vehicle', () => {
    expect(livePosition(mapWith(5_000), 'RUT:ServiceJourney:OTHER', NOW)).toBeNull();
  });

  it('returns null for an empty map or a missing journey id', () => {
    expect(livePosition(new Map(), JID, NOW)).toBeNull();
    expect(livePosition(mapWith(5_000), null, NOW)).toBeNull();
    expect(livePosition(null, JID, NOW)).toBeNull();
  });
});

describe('fetchVehiclePositions', () => {
  beforeEach(() => { _resetVehicleCache(); vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('sends ET-Client-Name and the line, and returns the parsed map', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true, json: () => Promise.resolve({ data: { vehicles: [apiVehicle()] } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const m = await fetchVehiclePositions('RUT:Line:5');
    expect(m.get('RUT:ServiceJourney:5-1').lat).toBe(59.9139);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/realtime/');
    expect(opts.headers['ET-Client-Name']).toBeTruthy();
    expect(opts.body).toContain('RUT:Line:5');
  });

  it('caches within the TTL so a 1 Hz render loop cannot hammer the API', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true, json: () => Promise.resolve({ data: { vehicles: [apiVehicle()] } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await fetchVehiclePositions('RUT:Line:5');
    await fetchVehiclePositions('RUT:Line:5');
    await fetchVehiclePositions('RUT:Line:5');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches once the TTL has passed', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true, json: () => Promise.resolve({ data: { vehicles: [apiVehicle()] } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await fetchVehiclePositions('RUT:Line:5');
    vi.setSystemTime(NOW + 11_000);
    await fetchVehiclePositions('RUT:Line:5');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resolves to an empty map on a network error or a bad status — never rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await expect(fetchVehiclePositions('RUT:Line:5')).resolves.toEqual(new Map());
    _resetVehicleCache();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 503 })));
    await expect(fetchVehiclePositions('RUT:Line:5')).resolves.toEqual(new Map());
  });

  it('does not call the API without a line', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await fetchVehiclePositions(null)).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
