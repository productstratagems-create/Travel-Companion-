import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  livePosition, parseVehicle, parseVehicles, fetchVehiclePositions,
  _resetVehicleCache, MAX_AGE_MS, livePosFeed } from '../src/api/vehicles.js';

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
      // v2-feltene. `null` og ikke utelatt: «spurt, og det kom ikke noe» er
      // en annen setning enn «aldri spurt», og det er `belegg.js` som gjør
      // det om til «vet ikke».
      occupancyStatus: null,
      delay: null,
    });
  });

  /* OG DE BÆRES RÅ VIDERE. Enturs navn oversettes til et nivå nøyaktig ett
   * sted — `fraEntur` i `belegg.js`. En andre oversettelse her ville vært to
   * tabeller for ett faktum, som er feilformen dette repoet har rettet rundt
   * tjuefem ganger. */
  it('bærer v2-feltene videre uten å tolke dem', () => {
    const p = parseVehicle(apiVehicle({ occupancyStatus: 'standingRoomOnly', delay: 142 }));
    expect(p.occupancyStatus).toBe('standingRoomOnly');
    expect(p.delay).toBe(142);
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

/* ── DEN DELTE LUKA ──────────────────────────────────────────────────────
 *
 * `board.js` og `track.js` skrev hver sin kopi av dette — samme ti sekunder,
 * samme sletting ved linjeskifte, samme vakt mot et for sent svar — og INGEN
 * av dem hadde en test. Dette er den første.
 *
 * Og den binder det som ble borte da det ble ett sted: lagres svaret per
 * lineRef, kan linje A sitt aldri leses som linje B sitt, og da trengs
 * verken slettingen eller vakten.
 */
describe('livePosFeed', () => {
  const svar = (jid) => ({
    ok: true,
    json: () => Promise.resolve({ data: { vehicles: [{ ...apiVehicle(), serviceJourney: { id: jid } }] } }),
  });

  beforeEach(() => { _resetVehicleCache(); vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('svarer med et tomt kart før noe har kommet — aldri null', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const m = livePosFeed('RUT:Line:5');
    expect(m).toBeInstanceOf(Map);
    expect(m.size).toBe(0);
  });

  it('har svaret klart ved neste lesning', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(svar('SJ:A'))));
    livePosFeed('RUT:Line:5');
    await vi.runAllTimersAsync();
    expect(livePosFeed('RUT:Line:5').has('SJ:A')).toBe(true);
  });

  /* KJERNEN. Tvillingene trengte en `_liveLine` å tømme fordi de hadde ÉN
   * luke. Med lineRef som nøkkel er spørsmålet meningsløst. */
  it('lar aldri én linjes tog bli lest som en annens', async () => {
    vi.stubGlobal('fetch', vi.fn((url, o) =>
      Promise.resolve(svar(o.body.includes('Line:5') ? 'SJ:FEM' : 'SJ:TRE'))));
    livePosFeed('RUT:Line:5');
    livePosFeed('RUT:Line:3');
    await vi.runAllTimersAsync();
    expect([...livePosFeed('RUT:Line:5').keys()]).toEqual(['SJ:FEM']);
    expect([...livePosFeed('RUT:Line:3').keys()]).toEqual(['SJ:TRE']);
  });

  it('spør ikke oftere enn hvert tiende sekund, selv om renderen går hvert sekund', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(svar('SJ:A')));
    vi.stubGlobal('fetch', fetchMock);
    for (let i = 0; i < 10; i++) { vi.setSystemTime(NOW + i * 1000); livePosFeed('RUT:Line:5'); }
    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(NOW + 11_000);
    livePosFeed('RUT:Line:5');
    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // Tavlas loggelinje er det eneste instrumentet som noen gang kan svare på om
  // Entur dekker en gitt linje, og det svarer bare fra en ekte tur. Den skal
  // ikke fyres av hver render — bare når et nytt svar faktisk kom.
  it('varsler bare når et nytt svar kom, ikke ved hver lesning', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(svar('SJ:A'))));
    const sett = vi.fn();
    for (let i = 0; i < 5; i++) { vi.setSystemTime(NOW + i * 1000); livePosFeed('RUT:Line:5', sett); }
    await vi.runAllTimersAsync();
    expect(sett).toHaveBeenCalledTimes(1);
    expect(sett.mock.calls[0][1]).toBe('RUT:Line:5');
  });

  it('gir ut en kopi, så en leser ikke kan endre hva de andre ser', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(svar('SJ:A'))));
    livePosFeed('RUT:Line:5');
    await vi.runAllTimersAsync();
    livePosFeed('RUT:Line:5').clear();
    expect(livePosFeed('RUT:Line:5').has('SJ:A')).toBe(true);
  });

  it('spør ikke uten linje', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(livePosFeed(null).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
