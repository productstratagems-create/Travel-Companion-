import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));
vi.mock('../src/geo.js', () => ({ loadWalkSpeed: () => 'middels' }));
vi.mock('../src/api/adapt.js', () => ({ quayLatLon: () => null }));

const fetchMock = vi.fn();
vi.mock('../src/api/http.js', () => ({ enturFetch: (...a) => fetchMock(...a) }));

const { fetchTrip } = await import('../src/api/entur.js');

const DIR = { from: 'Grorud', to: 'Jernbanetorget', stopId: 'NSR:StopPlace:1', toStopId: 'NSR:StopPlace:2' };
const ok = (patterns) => ({
  ok: true, status: 200,
  json: () => Promise.resolve({ data: { trip: { tripPatterns: patterns }, stopPlace: { situations: [] } } }),
});
const gqlError = () => ({
  ok: true, status: 200,
  json: () => Promise.resolve({ errors: [{ message: 'Unknown argument \'dateTime\'' }] }),
});
const bodyOf = (call) => JSON.parse(call[1].body).query;
const settle = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => fetchMock.mockReset());

/**
 * The board rides on this one request. v1.12.0 put the in-flight window in its
 * own query precisely so a misspelt argument could not take the departure list
 * down; asking trip() for a dateTime gives that isolation up. This retry buys
 * it back — and since the Entur API is unreachable from this sandbox, this
 * test is the only thing that exercises it.
 */
describe('fetchTrip — the retry when dateTime is rejected', () => {
  it('asks once, with the lookback, when the API is happy', async () => {
    fetchMock.mockReturnValue(Promise.resolve(ok([{ duration: 1 }])));
    const onSuccess = vi.fn();
    fetchTrip(DIR, onSuccess, vi.fn());
    await settle(); await settle(); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetchMock.mock.calls[0])).toContain('dateTime:');
    expect(onSuccess).toHaveBeenCalled();
  });

  it('retries without the lookback and still renders a board', async () => {
    fetchMock
      .mockReturnValueOnce(Promise.resolve(gqlError()))
      .mockReturnValueOnce(Promise.resolve(ok([{ duration: 1 }, { duration: 2 }])));
    const onSuccess = vi.fn(), onError = vi.fn();
    fetchTrip(DIR, onSuccess, onError);
    await settle(); await settle(); await settle(); await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock.mock.calls[0])).toContain('dateTime:');
    expect(bodyOf(fetchMock.mock.calls[1])).not.toContain('dateTime:');
    // The point of the whole exercise: the departure list still arrives.
    expect(onSuccess).toHaveBeenCalled();
    expect(onSuccess.mock.calls[0][0]).toHaveLength(2);
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not retry forever when the second attempt fails too', async () => {
    fetchMock.mockReturnValue(Promise.resolve(gqlError()));
    const onError = vi.fn();
    fetchTrip(DIR, vi.fn(), onError);
    await settle(); await settle(); await settle(); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalled();
  });
});
