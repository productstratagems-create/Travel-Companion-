import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));
vi.mock('../src/geo.js', () => ({ loadWalkSpeed: () => 'middels' }));
vi.mock('../src/api/adapt.js', () => ({ quayLatLon: () => null }));

const fetchMock = vi.fn();
vi.mock('../src/api/http.js', () => ({ enturFetch: (...a) => fetchMock(...a) }));

const { fetchTrip, fetchBoard, _resetPerLineProbe, _coachRefused, _resetCoachProbe,
  _windowRefused, _resetWindowProbe } = await import('../src/api/entur.js');

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

// The coach refusal is remembered for the session on purpose, so it has to
// be cleared between tests or the first refusal decides all the rest.
beforeEach(() => { fetchMock.mockReset(); _resetCoachProbe(); _resetWindowProbe(); });

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

  // ── The ladder, in order ───────────────────────────────────────────────
  //
  // Two arguments here have never been checkable against the live schema:
  // dateTime, and now coach (v1.86.0). The error does not say which was
  // refused, so they are shed one at a time — coach first, because losing the
  // express services costs less than losing the two-minute lookback, which is
  // a train standing at the platform a minute late.
  it('sheds the search window first and still renders a board', async () => {
    fetchMock
      .mockReturnValueOnce(Promise.resolve(gqlError()))
      .mockReturnValueOnce(Promise.resolve(ok([{ duration: 1 }, { duration: 2 }])));
    const onSuccess = vi.fn(), onError = vi.fn();
    fetchTrip(DIR, onSuccess, onError);
    await settle(); await settle(); await settle(); await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock.mock.calls[0])).toContain('searchWindow:');
    expect(bodyOf(fetchMock.mock.calls[1])).not.toContain('searchWindow:');
    // Neither the coaches nor the lookback are given up for a refusal that
    // might have been the window.
    expect(bodyOf(fetchMock.mock.calls[1])).toContain('transportMode:coach');
    expect(bodyOf(fetchMock.mock.calls[1])).toContain('dateTime:');
    // The point of the whole exercise: the departure list still arrives.
    expect(onSuccess).toHaveBeenCalled();
    expect(onSuccess.mock.calls[0][0]).toHaveLength(2);
    expect(onError).not.toHaveBeenCalled();
  });

  // Cheapest loss first, all the way down: the wider window (rural journeys
  // we never had), then the coaches, then the two-minute lookback — which is
  // a train standing at the platform a minute late.
  it('sheds the coaches next, and the lookback only last', async () => {
    fetchMock
      .mockReturnValueOnce(Promise.resolve(gqlError()))
      .mockReturnValueOnce(Promise.resolve(gqlError()))
      .mockReturnValueOnce(Promise.resolve(gqlError()))
      .mockReturnValueOnce(Promise.resolve(ok([{ duration: 1 }])));
    const onSuccess = vi.fn(), onError = vi.fn();
    fetchTrip(DIR, onSuccess, onError);
    for (let i = 0; i < 6; i++) await settle();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(bodyOf(fetchMock.mock.calls[1])).not.toContain('searchWindow:');
    expect(bodyOf(fetchMock.mock.calls[2])).not.toContain('transportMode:coach');
    expect(bodyOf(fetchMock.mock.calls[3])).not.toContain('dateTime:');
    expect(onSuccess).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('remembers a refused window and stops asking for it', async () => {
    fetchMock
      .mockReturnValueOnce(Promise.resolve(gqlError()))
      .mockReturnValue(Promise.resolve(ok([{ duration: 1 }])));
    fetchTrip(DIR, vi.fn(), vi.fn());
    for (let i = 0; i < 5; i++) await settle();
    expect(_windowRefused()).toBe(true);

    fetchMock.mockClear();
    fetchMock.mockReturnValue(Promise.resolve(ok([{ duration: 1 }])));
    fetchTrip(DIR, vi.fn(), vi.fn());
    await settle(); await settle(); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetchMock.mock.calls[0])).not.toContain('searchWindow:');
  });

  // A refused enum must cost one request, not one per poll for the rest of
  // the day — the same session memory the per-line cap and the hub fields got.
  it('remembers the refusal and stops asking for coach', async () => {
    fetchMock
      .mockReturnValueOnce(Promise.resolve(gqlError()))
      .mockReturnValueOnce(Promise.resolve(gqlError()))
      .mockReturnValue(Promise.resolve(ok([{ duration: 1 }])));
    fetchTrip(DIR, vi.fn(), vi.fn());
    await settle(); await settle(); await settle(); await settle();
    expect(_coachRefused()).toBe(true);

    fetchMock.mockClear();
    fetchMock.mockReturnValue(Promise.resolve(ok([{ duration: 1 }])));
    fetchTrip(DIR, vi.fn(), vi.fn());
    await settle(); await settle(); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetchMock.mock.calls[0])).not.toContain('transportMode:coach');
  });

  it('does not retry forever when every attempt fails', async () => {
    fetchMock.mockReturnValue(Promise.resolve(gqlError()));
    const onError = vi.fn();
    fetchTrip(DIR, vi.fn(), onError);
    for (let i = 0; i < 6; i++) await settle();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(onError).toHaveBeenCalled();
  });
});

/**
 * Which situations reach the banner.
 *
 * Before this, they came from the origin stop place AND from its next five
 * departures — whatever line or direction those ran — while the trip's own
 * legs were never asked at all. So the alerts most likely to matter were
 * absent and the ones least likely to were present.
 */
describe('fetchTrip — situations belong to the route, not the platform', () => {
  const withSits = () => ({
    ok: true, status: 200,
    json: () => Promise.resolve({ data: {
      stopPlace: { situations: [{ id: 'origin-stop', summary: [{ value: 'Heis ute av drift' }] }] },
      dest: { situations: [{ id: 'dest-stop', summary: [{ value: 'Trapp stengt' }] }] },
      trip: { tripPatterns: [{ duration: 1, legs: [{
        situations: [{ id: 'leg', summary: [{ value: 'Forsinkelser linje 3' }] }],
        serviceJourney: { situations: [{ id: 'journey', summary: [{ value: 'Innstilt avgang' }] }] },
      }] }] },
    } }),
  });

  it('takes both named stop places and the legs actually ridden', async () => {
    fetchMock.mockReturnValue(Promise.resolve(withSits()));
    const onSuccess = vi.fn();
    fetchTrip(DIR, onSuccess, vi.fn());
    await settle(); await settle(); await settle();
    const ids = (onSuccess.mock.calls[0][1] || []).map(s => s.id).sort();
    expect(ids).toEqual(['dest-stop', 'journey', 'leg', 'origin-stop']);
  });

  it('de-duplicates one situation reported in two places', async () => {
    const dup = { id: 'same', summary: [{ value: 'x' }] };
    fetchMock.mockReturnValue(Promise.resolve({ ok: true, status: 200,
      json: () => Promise.resolve({ data: {
        stopPlace: { situations: [dup] },
        trip: { tripPatterns: [{ legs: [{ situations: [dup] }] }] },
      } }) }));
    const onSuccess = vi.fn();
    fetchTrip(DIR, onSuccess, vi.fn());
    await settle(); await settle(); await settle();
    expect(onSuccess.mock.calls[0][1]).toHaveLength(1);
  });

  it('survives a response with no situations anywhere', async () => {
    fetchMock.mockReturnValue(Promise.resolve({ ok: true, status: 200,
      json: () => Promise.resolve({ data: { trip: { tripPatterns: [{ legs: [{}] }] } } }) }));
    const onSuccess = vi.fn();
    fetchTrip(DIR, onSuccess, vi.fn());
    await settle(); await settle(); await settle();
    expect(onSuccess.mock.calls[0][1]).toEqual([]);
  });
});

// ── The departure board's own retry ─────────────────────────────────────────
//
// fetchBoard had no way back from a rejected field at all: one unknown name
// and the whole departure list goes blank. Asking for the situation text —
// field names that cannot be checked against the live API from here — is
// exactly the change that needs the insurance.
describe('fetchBoard retries without the situation text', () => {
  const stopOk = () => ({
    ok: true, status: 200,
    json: () => Promise.resolve({ data: { stopPlace: { id: 'X', name: 'Grorud', estimatedCalls: [] } } }),
  });
  const textRejected = () => ({
    ok: true, status: 200,
    json: () => Promise.resolve({ errors: [{ message: "Unknown field 'description'" }] }),
  });

  it('asks again without them, and still renders the board', async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve(textRejected()))
             .mockReturnValueOnce(Promise.resolve(stopOk()));
    const onSuccess = vi.fn(), onError = vi.fn();
    fetchBoard(DIR, onSuccess, onError);
    await settle(); await settle(); await settle(); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock.mock.calls[0])).toContain('description{language value}');
    expect(bodyOf(fetchMock.mock.calls[1])).not.toContain('description');
    expect(onSuccess).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not retry when the first answer was fine', async () => {
    fetchMock.mockReturnValue(Promise.resolve(stopOk()));
    fetchBoard(DIR, vi.fn(), vi.fn());
    await settle(); await settle(); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ── The per-line cap: a probe, and what it costs when the answer is no ─────
//
// `numberOfDeparturesPerLineAndDestinationDisplay` is exactly the right
// argument for "three departures per direction" — numberOfDepartures caps the
// WHOLE stop, so one frequent line can eat the budget. Its name cannot be
// checked from here: the proxy reaches neither api.entur.io nor Entur's docs.
//
// So it ships as a probe, and these are the two worlds it has to work in.
describe('fetchBoard and the per-line cap', () => {
  const PER = 'numberOfDeparturesPerLineAndDestinationDisplay:3';
  const stopOk = () => ({
    ok: true, status: 200,
    json: () => Promise.resolve({ data: { stopPlace: { id: 'X', name: 'Grorud', estimatedCalls: [] } } }),
  });
  const gqlNo = (msg) => ({
    ok: true, status: 200,
    json: () => Promise.resolve({ errors: [{ message: msg }] }),
  });
  const argRejected = () => gqlNo("Unknown argument 'numberOfDeparturesPerLineAndDestinationDisplay'");
  const textRejected = () => gqlNo("Unknown field 'description'");

  beforeEach(() => { _resetPerLineProbe(); });

  it('asks for it when the caller wants it', async () => {
    fetchMock.mockReturnValue(Promise.resolve(stopOk()));
    fetchBoard(DIR, vi.fn(), vi.fn(), 30, 3);
    await settle(); await settle(); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetchMock.mock.calls[0])).toContain(PER);
  });

  it('never asks for it unless a caller does', async () => {
    fetchMock.mockReturnValue(Promise.resolve(stopOk()));
    fetchBoard(DIR, vi.fn(), vi.fn());
    await settle(); await settle(); await settle();
    expect(bodyOf(fetchMock.mock.calls[0])).not.toContain('PerLineAndDestinationDisplay');
  });

  // The order matters: the newest, least proven thing falls first. Dropping
  // the message text as well would make a rejected cap cost the reader
  // something it has nothing to do with.
  it('drops the cap before it drops the message text', async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve(argRejected()))
             .mockReturnValueOnce(Promise.resolve(stopOk()));
    const onSuccess = vi.fn(), onError = vi.fn();
    fetchBoard(DIR, onSuccess, onError, 30, 3);
    await settle(); await settle(); await settle(); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock.mock.calls[1])).not.toContain('PerLineAndDestinationDisplay');
    expect(bodyOf(fetchMock.mock.calls[1])).toContain('description{language value}');
    expect(onSuccess).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('falls all the way to the basic text if both are refused', async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve(argRejected()))
             .mockReturnValueOnce(Promise.resolve(textRejected()))
             .mockReturnValueOnce(Promise.resolve(stopOk()));
    const onSuccess = vi.fn(), onError = vi.fn();
    fetchBoard(DIR, onSuccess, onError, 30, 3);
    await settle(); await settle(); await settle(); await settle(); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(bodyOf(fetchMock.mock.calls[2])).not.toContain('PerLineAndDestinationDisplay');
    expect(bodyOf(fetchMock.mock.calls[2])).not.toContain('description');
    expect(onSuccess).toHaveBeenCalled();
  });

  // fetchBoard has never had this test, unlike fetchTrip. Without it a
  // three-rung ladder is one edit away from being an infinite one.
  //
  // The server relents after five refusals rather than refusing for ever. A
  // mock that always says no turns an endless ladder into an endless
  // microtask loop, and the test HANGS instead of failing — measured, twice,
  // while writing this. A hang in CI takes the whole suite with it and says
  // nothing about which rung broke; a count says exactly.
  it('stops rather than retrying for ever', async () => {
    let n = 0;
    fetchMock.mockImplementation(() =>
      Promise.resolve(++n <= 5 ? gqlNo('nope') : stopOk()));
    const onError = vi.fn();
    fetchBoard(DIR, vi.fn(), onError, 30, 3);
    for (let i = 0; i < 10; i++) await settle();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalled();
  });

  // The whole difference between a probe and a permanent double cost: after
  // one no, the board must stop asking for the rest of the session.
  it('remembers the no, so the next poll asks once', async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve(argRejected()))
             .mockReturnValue(Promise.resolve(stopOk()));
    fetchBoard(DIR, vi.fn(), vi.fn(), 30, 3);
    await settle(); await settle(); await settle(); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockClear();
    fetchBoard(DIR, vi.fn(), vi.fn(), 30, 3);
    await settle(); await settle(); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetchMock.mock.calls[0])).not.toContain('PerLineAndDestinationDisplay');
  });

  // A new page load is a new probe — otherwise the day Entur adds support,
  // nothing would ever start using it.
  it('probes again in a fresh session', async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve(argRejected()))
             .mockReturnValue(Promise.resolve(stopOk()));
    fetchBoard(DIR, vi.fn(), vi.fn(), 30, 3);
    await settle(); await settle(); await settle(); await settle();

    _resetPerLineProbe();
    fetchMock.mockClear();
    fetchBoard(DIR, vi.fn(), vi.fn(), 30, 3);
    await settle(); await settle();
    expect(bodyOf(fetchMock.mock.calls[0])).toContain(PER);
  });
});
