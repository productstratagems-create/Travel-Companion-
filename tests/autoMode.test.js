import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/state.js', () => ({
  state: { walkOvr: null, statLL: {}, homeLL: null, dIdx: 0 },
  intervals: { board: null, track: null, sel: null },
}));
vi.mock('../src/config.js', () => ({
  default: { defaultWalkMinutes: 8, dirs: [{ key: 'out' }] },
}));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn() }));

import { loadAutoMode, saveAutoMode, autoModePref } from '../src/geo.js';

// ── The flag that decides the first screen ─────────────────────────────────
//
// v1.61.0 makes auto-reise the default for a reader with no history. That is
// only safe if "I turned this off" is a state the app can HOLD — and until
// now it was not: off was stored by deleting the key, so it was indent-
// istinguishable from "never asked". Reading absence as the default ON would
// have switched the mode back on for someone who had just switched it off.
//
// Nothing tested this before, and both mutants for it survived the first
// mutation run: making '0' read as never-chosen, and going back to remove().
describe('auto-reise mode flag', () => {
  beforeEach(() => { localStorage.clear(); });

  it('has never been chosen before anyone chooses', () => {
    expect(autoModePref()).toBe(null);
    expect(loadAutoMode()).toBe(false);
  });

  it('remembers ON', () => {
    saveAutoMode(true);
    expect(autoModePref()).toBe('on');
    expect(loadAutoMode()).toBe(true);
  });

  // The one that matters. Turning it off must be a DECISION that survives,
  // not a return to the blank slate the default reads as "yes please".
  it('remembers OFF as a decision, not as absence', () => {
    saveAutoMode(false);
    expect(autoModePref()).toBe('off');
    expect(loadAutoMode()).toBe(false);
    // Written, not deleted — this is the assertion the whole default rests on.
    expect(localStorage.getItem('default::t.autoMode')).toBe('0');
  });

  it('survives being switched back and forth', () => {
    saveAutoMode(true); saveAutoMode(false); saveAutoMode(true);
    expect(autoModePref()).toBe('on');
    saveAutoMode(false);
    expect(autoModePref()).toBe('off');
  });

  // An install from before v1.61.0 has no key at all, whichever way the
  // reader last left it — there was nothing else to store. Those readers get
  // the default once, and their next choice is remembered properly.
  it('treats a pre-v1.61.0 install as never chosen', () => {
    expect(autoModePref()).toBe(null);
  });

  // A value from a future version, or a corrupted one, is not a refusal.
  it('does not read an unknown value as off', () => {
    localStorage.setItem('default::t.autoMode', 'yes');
    expect(autoModePref()).toBe(null);
    expect(loadAutoMode()).toBe(false);
  });
});
