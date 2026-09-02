/**
 * The stop board is asked at most once a minute per stop — and the modes are
 * part of what "per stop" means.
 *
 * Asking for metro and asking for everything give different boards, because
 * `numberOfDepartures` caps the whole thing: at a bus hub the twenty slots go
 * to buses. So a cache keyed on the stop alone would hand the metro-only
 * answer to a reader who has just switched buses back on, and go on doing it
 * for a minute.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let calls = [];
vi.mock('../src/api/http.js', () => ({
  ET_CLIENT_NAME: 'test',
  enturFetch: (url, opts) => {
    calls.push(JSON.parse(opts.body).query);
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: { stopPlace: { estimatedCalls: [] } } }),
    });
  },
}));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));
vi.mock('../src/api/diagnose.js', () => ({ noteLookbackLost: vi.fn() }));

const { stopBoardSummary, _resetStopBoardCache } = await import('../src/api/entur.js');
const modesOf = (q) => (q.match(/whiteListedModes:\[([^\]]*)\]/) || [])[1];

beforeEach(() => { calls = []; _resetStopBoardCache(); });

describe('stopBoardSummary', () => {
  it('asks once for a stop and reuses the answer', async () => {
    await stopBoardSummary('NSR:A', ['metro']);
    await stopBoardSummary('NSR:A', ['metro']);
    expect(calls).toHaveLength(1);
    expect(modesOf(calls[0])).toBe('metro');
  });

  // The one that matters: switching the mode filter must not be served the
  // previous filter's board.
  it('asks again when the modes change', async () => {
    await stopBoardSummary('NSR:B', ['metro']);
    await stopBoardSummary('NSR:B', ['metro', 'bus']);
    expect(calls).toHaveLength(2);
    expect(modesOf(calls[1]).split(',').sort()).toEqual(['bus', 'metro']);
  });

  it('treats the same modes in another order as the same question', async () => {
    await stopBoardSummary('NSR:C', ['metro', 'bus']);
    await stopBoardSummary('NSR:C', ['bus', 'metro']);
    expect(calls).toHaveLength(1);
  });

  it('keeps stops apart, and asks nothing without one', async () => {
    await stopBoardSummary('NSR:D', ['metro']);
    await stopBoardSummary('NSR:E', ['metro']);
    expect(calls).toHaveLength(2);
    expect(await stopBoardSummary(null, ['metro'])).toBeNull();
    expect(calls).toHaveLength(2);
  });
});

// ── An explicit refresh must actually ask again ────────────────────────────
//
// Reported: "Refresh på tavla tar meg til auto-reise. Det blir feil. Jeg vil
// her refreshe kart, strip og liste." The button was a location.reload(),
// which since v1.61.0 re-runs the landing ladder and so navigates away from
// the board. Refreshing in place is the fix — but only if the caches sitting
// in front of the network let the request through. A minute of cached answers
// is right for a board that polls itself, and wrong the moment someone taps.
describe('_resetStopBoardCache', () => {
  it('lets the very next call reach the network again', async () => {
    await stopBoardSummary('NSR:A', ['metro']);
    await stopBoardSummary('NSR:A', ['metro']);
    expect(calls).toHaveLength(1);
    _resetStopBoardCache();
    await stopBoardSummary('NSR:A', ['metro']);
    expect(calls).toHaveLength(2);
  });

  it('drops every stop, not just the one last asked for', async () => {
    await stopBoardSummary('NSR:A', ['metro']);
    await stopBoardSummary('NSR:B', ['metro']);
    _resetStopBoardCache();
    await stopBoardSummary('NSR:A', ['metro']);
    await stopBoardSummary('NSR:B', ['metro']);
    expect(calls).toHaveLength(4);
  });

  // Dropping the cache must not disable it — the board polls every 20s, and a
  // cache that stopped holding would triple the traffic for an answer that
  // changes when a dispatcher reassigns a platform.
  it('leaves the cache working afterwards', async () => {
    _resetStopBoardCache();
    await stopBoardSummary('NSR:A', ['metro']);
    await stopBoardSummary('NSR:A', ['metro']);
    expect(calls).toHaveLength(1);
  });
});
