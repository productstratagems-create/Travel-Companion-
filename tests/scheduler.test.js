import { describe, it, expect, vi, beforeEach } from 'vitest';

let boardThrows = false;
const logged = [];
vi.mock('../src/views/board.js', () => ({
  renderBoard: () => { if (boardThrows) throw new TypeError("Cannot read properties of null (reading 'length')"); },
}));
vi.mock('../src/views/selected.js', () => ({ renderSelected: () => {} }));
vi.mock('../src/views/track.js', () => ({ renderTrack: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: (m, k) => logged.push([m, k]) }));
// state.js reads config.storage.dir at import time, so the stub needs it.
vi.mock('../src/config.js', () => ({ default: { renderTickMs: 1000, storage: { dir: 't.dir' }, dirs: [{ key: 'out' }] } }));
vi.mock('../src/storage.js', () => ({ storage: { get: () => null, set: () => {}, remove: () => {} } }));

const { startRenderLoop } = await import('../src/scheduler.js');
const { state } = await import('../src/state.js');

beforeEach(() => { boardThrows = false; logged.length = 0; vi.useFakeTimers(); });

// ── One bad tick must not stop the clock ───────────────────────────────────
//
// Reported: "noen ganger forsvinner lista med avganger, og jeg må reversere
// ruta for å få den opp igjen. Refresh-knappen løser ikke problemet."
//
// The cause was a null dereference inside renderBoard — but what turned a
// single throw into a screen frozen for as long as you looked at it was this
// loop running unguarded. renderBoard threw before writing the departure
// list, so the list kept whatever it last had, and every tick after landed in
// exactly the same place. Nothing was logged and nothing was shown.
describe('the render loop', () => {
  it('keeps ticking after a render throws', () => {
    state.view = 'board';
    startRenderLoop();
    boardThrows = true;
    expect(() => vi.advanceTimersByTime(3000)).not.toThrow();
  });

  it('says so rather than swallowing it', () => {
    state.view = 'board';
    startRenderLoop();
    boardThrows = true;
    vi.advanceTimersByTime(1000);
    expect(logged.length).toBeGreaterThan(0);
    const [msg, kind] = logged[0];
    expect(kind).toBe('err');
    expect(msg).toContain('board');
    // The message the reader would have to relay, not just "noe gikk galt".
    expect(msg).toContain('length');
  });

  it('renders normally when nothing is wrong', () => {
    state.view = 'board';
    startRenderLoop();
    vi.advanceTimersByTime(2000);
    expect(logged).toEqual([]);
  });
});
