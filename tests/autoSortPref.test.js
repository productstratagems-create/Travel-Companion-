/**
 * Which order the auto-reise list opens in.
 *
 * Default is BY TYPE — that is what was asked for, and unlike t.autoMode
 * absence is safe to read as the default here: a reader who has never chosen
 * gets the order that was designed, and one tap gives back the old one.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/storage.js', () => {
  let store = {};
  return { storage: {
    get: (k) => store[k] ?? null,
    set: (k, v) => { store[k] = v; },
    remove: (k) => { delete store[k]; },
    _reset: () => { store = {}; },
  } };
});

import { loadAutoSort, saveAutoSort } from '../src/geo.js';
import { storage } from '../src/storage.js';

beforeEach(() => storage._reset());

describe('loadAutoSort', () => {
  it('is type when the reader has never chosen', () => {
    expect(loadAutoSort()).toBe('type');
  });

  it('round-trips both choices', () => {
    saveAutoSort('tid');
    expect(loadAutoSort()).toBe('tid');
    saveAutoSort('type');
    expect(loadAutoSort()).toBe('type');
  });

  // Rubbish in storage is a real state: an older build, a hand-edited value,
  // a half-written key. It must land on the default, never on undefined.
  it('falls to type on a stored value it does not know', () => {
    storage.set('t.autoSort', 'linjenummer');
    expect(loadAutoSort()).toBe('type');
    saveAutoSort('tullball');
    expect(loadAutoSort()).toBe('type');
  });
});

describe('the key travels with the profile', () => {
  it('is in ALL_KEYS', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/storage.js', 'utf8').replace(/\/\/.*$/gm, '');
    expect(src).toContain("'t.autoSort'");
  });
});

// ── The switch, pinned from the file ──────────────────────────────────────
//
// Layout decided by looking at it on a 414px screen, so the reasons live in
// a comment and the numbers live here. At the settings size this control was
// the second most prominent thing on a screen whose whole job is "what leaves
// now", and it pushed the first departure below the fold.
describe('the sort switch markup', () => {
  it('sits outside #auto-body, which is rewritten every second', async () => {
    const fs = await import('node:fs');
    const html = fs.readFileSync('index.html', 'utf8');
    const auto = html.slice(html.indexOf('id="v-auto"'), html.indexOf('id="v-saved"'));
    expect(auto.indexOf('id="auto-sort"')).toBeGreaterThan(-1);
    expect(auto.indexOf('id="auto-sort"')).toBeLessThan(auto.indexOf('id="auto-body"'));
  });

  it('stays compact rather than settings-sized', async () => {
    const fs = await import('node:fs');
    const css = fs.readFileSync('src/style/settings.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const block = css.slice(css.indexOf('#auto-sort .pref-btn'));
    expect(block).toMatch(/min-height:\s*32px/);
    // The generic .pref-btn is 44px and flex:1. Both are overridden here, and
    // dropping either brings the settings-sized block back.
    expect(block).toMatch(/flex:\s*0 0 auto/);
  });
});
