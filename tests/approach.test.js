/**
 * The walk to the stop is one cache, not one per screen.
 *
 * It lived inside board.js as module state. That was fine while the departure
 * board was its only reader; it stopped being fine when auto-reise needed the
 * same route, from the same position, to the same stop. Copying it would have
 * been two things that must agree written down twice — the failure shape this
 * codebase has found around a dozen times, and the drift here would have been
 * a second routing request a second against a public demo server.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

vi.mock('../src/storage.js', () => {
  let store = {};
  return { storage: {
    get: (k) => store[k] ?? null,
    set: (k, v) => { store[k] = v; },
    remove: (k) => { delete store[k]; },
    _reset: () => { store = {}; },
  } };
});

vi.mock('../src/ui/log.js', () => ({ logMsg: () => {} }));

const routeCalls = [];
vi.mock('../src/api/walkApproach.js', () => ({
  approachRoute: (from, to, crow) => {
    routeCalls.push({ from, to, crow });
    return Promise.resolve({
      latlngs: [[from.lat, from.lon], [to.lat, to.lon]], src: 'valhalla', metres: Math.round(crow),
    });
  },
}));

import { ensureApproach, approachPoints, approachKey, resetApproach, AT_STOP_M }
  from '../src/api/approach.js';

beforeEach(() => { resetApproach(); routeCalls.length = 0; });

const HERE = { lat: 59.9000, lon: 10.8000 };
const STOP = { lat: 59.9050, lon: 10.8050 };   // ~640 m away

describe('ensureApproach', () => {
  // The screens that read this redraw every second. Ten renders must be one
  // request, not ten — this is the easy mistake here, and it would land on a
  // public demo server.
  it('fetches once however many times it is asked', async () => {
    for (let i = 0; i < 10; i++) ensureApproach(HERE, STOP);
    await Promise.resolve();
    expect(routeCalls.length).toBe(1);
  });

  it('stores the points it was given', async () => {
    ensureApproach(HERE, STOP);
    await Promise.resolve(); await Promise.resolve();
    expect(approachPoints()).toEqual([[59.9, 10.8], [59.905, 10.805]]);
  });

  // Standing on the platform, a route to your own feet is noise on the map
  // and a request for nothing.
  it('does not fetch when you are already at the stop', async () => {
    ensureApproach(HERE, { lat: 59.90005, lon: 10.80005 });
    await Promise.resolve();
    expect(routeCalls.length).toBe(0);
    expect(approachPoints()).toBe(null);
  });

  it('fetches again once you have genuinely moved', async () => {
    ensureApproach(HERE, STOP);
    await Promise.resolve();
    ensureApproach({ lat: 59.8900, lon: 10.7900 }, STOP);
    await Promise.resolve();
    expect(routeCalls.length).toBe(2);
  });

  // ~11 m, the same four decimals walkKey stores under. A GPS fix jitters
  // while you stand still; keying on the raw value would refetch on jitter.
  it('ignores jitter below the rounding', async () => {
    ensureApproach(HERE, STOP);
    await Promise.resolve();
    ensureApproach({ lat: 59.90000009, lon: 10.80000009 }, STOP);
    await Promise.resolve();
    expect(routeCalls.length).toBe(1);
  });

  it('clears itself when either end is missing', () => {
    ensureApproach(null, STOP);
    expect(approachPoints()).toBe(null);
    expect(approachKey()).toBe(null);
  });
});

// ── One cache, provably ──────────────────────────────────────────────────
//
// This is the only thing standing between the app and two copies of the
// approach route, and the two have already drifted apart once for stop
// categories, once for the Oslo focus point, and once for how far "nearby"
// is. Reading the file is the right test HERE — the claim is precisely about
// what board.js does and does not own — but it is backed by the behavioural
// tests above, because v1.97.1 had two mutants survive tests that only
// grepped source text.
describe('board.js does not keep its own copy', () => {
  const board = fs.readFileSync(path.resolve(__dirname, '../src/views/board.js'), 'utf8');

  it('has no private approach cache', () => {
    expect(board).not.toMatch(/let\s+_approachKey/);
    expect(board).not.toMatch(/let\s+_approachPts/);
  });

  it('does not call the router itself', () => {
    expect(board).not.toMatch(/approachRoute\s*\(/);
  });

  it('reads the shared module', () => {
    expect(board).toMatch(/from '\.\.\/api\/approach\.js'/);
  });
});

describe('AT_STOP_M', () => {
  // One number, two meanings that are the same meaning: "not worth drawing a
  // walk" and "not worth keeping you on the orientation screen".
  it('is a real distance in metres', () => {
    expect(AT_STOP_M).toBeGreaterThan(0);
    expect(AT_STOP_M).toBeLessThan(1000);
  });
});
