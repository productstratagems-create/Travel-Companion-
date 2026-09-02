import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/state.js', () => ({
  state: { walkOvr: null, statLL: {}, homeLL: null, dIdx: 0 },
  intervals: { board: null, track: null, sel: null },
}));
vi.mock('../src/config.js', () => ({
  default: { defaultWalkMinutes: 8, dirs: [{ key: 'out' }] },
}));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn() }));

import { loadAutoMode, saveAutoMode, autoModePref, landingPref, saveLandingPref } from '../src/geo.js';

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

// ── Which screen the app opens on ──────────────────────────────────────────
//
// Reported: «utforsk» in the ⋯ menu turned weekend mode on just to show that
// screen, and the ⚡ on auto-reise turned the mode off just to reach the
// board — "det at auto-reise slås av går unevnt for bruker". Navigation was
// writing down a preference nobody could see or find.
//
// It spans TWO flags, and they have to agree: landingChoice reads auto before
// weekend, so "utforsk" chosen while auto is still on picks a screen that can
// never appear. That is the bug this function exists to make impossible.
describe('landingPref', () => {
  beforeEach(() => { localStorage.clear(); });

  it('is the board until someone chooses otherwise', () => {
    expect(landingPref()).toBe('tavla');
  });

  it('round-trips every choice', () => {
    ['auto', 'utforsk', 'tavla'].forEach(v => {
      saveLandingPref(v);
      expect(landingPref()).toBe(v);
    });
  });

  // The one that carries the whole thing. Auto outranks weekend in the
  // landing ladder, so leaving auto on would make "utforsk" a setting that
  // changes nothing — and nothing on screen would say so.
  it('clears auto-reise when you choose utforsk', () => {
    saveLandingPref('auto');
    saveLandingPref('utforsk');
    expect(autoModePref()).toBe('off');
    expect(landingPref()).toBe('utforsk');
  });

  it('clears BOTH when you choose the board', () => {
    saveLandingPref('utforsk');
    saveLandingPref('tavla');
    expect(autoModePref()).toBe('off');
    expect(localStorage.getItem('default::t.weekendMode')).toBe(null);
    expect(landingPref()).toBe('tavla');
  });

  // Choosing the board is a DECISION, not a return to the blank slate — or
  // the v1.61.0 default would land a reader back on auto-reise next time.
  it('remembers the board as a choice, not as absence', () => {
    saveLandingPref('tavla');
    expect(autoModePref()).toBe('off');
  });

  // The upgrade path, and the reason the read order is not arbitrary. Before
  // v1.64.0 both flags could be set at once: auto-reise on, and «utforsk» in
  // the ⋯ menu had written weekend mode too, just to show that screen. The
  // setting has to report what the app ACTUALLY does — landingChoice reads
  // auto before weekend — or it highlights a screen the reader never sees.
  it('agrees with the landing ladder when both flags are set', () => {
    localStorage.setItem('default::t.autoMode', '1');
    localStorage.setItem('default::t.weekendMode', '1');
    expect(landingPref()).toBe('auto');
  });

  // And choosing again from that state must leave it consistent, rather than
  // clearing one flag and leaving the other to surface later.
  it('untangles both flags when a choice is made from that state', () => {
    localStorage.setItem('default::t.autoMode', '1');
    localStorage.setItem('default::t.weekendMode', '1');
    saveLandingPref('utforsk');
    expect(autoModePref()).toBe('off');
    expect(landingPref()).toBe('utforsk');
  });

  it('leaves weekend mode alone when you choose auto-reise', () => {
    saveLandingPref('auto');
    expect(localStorage.getItem('default::t.weekendMode')).toBe(null);
    expect(landingPref()).toBe('auto');
  });
});
