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

const { stopBoardSummary } = await import('../src/api/entur.js');
const modesOf = (q) => (q.match(/whiteListedModes:\[([^\]]*)\]/) || [])[1];

beforeEach(() => { calls = []; });

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
