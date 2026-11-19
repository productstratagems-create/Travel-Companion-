/**
 * "You are here" is one dot, in one colour, on every map.
 *
 * There were five of these — board.js, two in track.js, selected.js and
 * leisure.js. Three read `tokens().mapYou`; the other two were still
 * hardcoded `#60a5fa`, WHICH IS THE SAME BLUE AS THE DESTINATION PINS. So on
 * two screens the dot meaning "you are here" was indistinguishable from the
 * dot meaning "that is where you are going" — on an app whose whole promise
 * is that it is always clear where you are.
 *
 * track.js's own comment says the token exists precisely to prevent that.
 * Two maps never got the message, and a sixth map was about to be added.
 *
 * Same consolidation drawWalk did for the walking line: nobody chose five,
 * it accumulated.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const made = [];
vi.mock('leaflet', () => ({
  default: {
    map: vi.fn(), tileLayer: vi.fn(), control: {},
    layerGroup: () => { const g = { lag: [], addTo() { return g; }, eachLayer(f) { g.lag.forEach(f); } }; return g; },
    circle: (ll, opts) => { const c = { ll, opts, ring: true, addTo() { return c; } }; made.push(c); return c; },
    circleMarker: (ll, opts) => {
      const m = {
        ll, opts, tooltip: null,
        bindTooltip(t) { m.tooltip = t; return m; },
        addTo() { return m; },
      };
      made.push(m);
      return m;
    },
  },
}));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/ui/themeTokens.js', () => ({
  onThemeChange: vi.fn(),
  tokens: () => ({ mapInk: '#05070d', mapYou: '#facc15', accent: '#f59e0b' }),
}));

vi.mock('../src/geo.js', () => ({ posNå: () => globalThis.__pos }));
globalThis.__pos = { asked: true, homeLL: { lat: 59.9, lon: 10.8 }, posAt: Date.now(), acc: null };
import { userDot, prikkStil, BRUKER_BLÅ, BRUKER_GRÅ, RING_MAKS_M } from '../src/ui/map.js';
const prikk = () => made.find(m => !m.ring);

/** The blue that meant both "you" and "your destination". */
const DEST_BLUE = '#60a5fa';

describe('userDot', () => {
  it('fills with the colour reserved for you', () => {
    made.length = 0;
    userDot({}, { lat: 59.9, lon: 10.8 });
    expect(prikk().opts.fillColor).toBe(BRUKER_BLÅ);
  });

  // The assertion this function exists for.
  it('is not the destination-pin blue', () => {
    made.length = 0;
    userDot({}, { lat: 59.9, lon: 10.8 });
    expect(prikk().opts.fillColor).not.toBe(DEST_BLUE);
    expect(prikk().opts.color).not.toBe(DEST_BLUE);
  });

  it('says what it is', () => {
    made.length = 0;
    userDot({}, { lat: 59.9, lon: 10.8 });
    expect(prikk().tooltip).toBe('Din posisjon');
  });

  it('takes the position it was given', () => {
    made.length = 0;
    userDot({}, { lat: 59.91, lon: 10.75 });
    expect(prikk().ll).toEqual([59.91, 10.75]);
  });

  // track.js and selected.js draw a smaller dot where the map is denser.
  it('allows a smaller radius without changing the colour', () => {
    made.length = 0;
    userDot({}, { lat: 59.9, lon: 10.8 }, { radius: 6 });
    expect(prikk().opts.radius).toBe(6);
    expect(prikk().opts.fillColor).toBe(BRUKER_BLÅ);
  });
});

// ── No screen keeps its own ──────────────────────────────────────────────
//
// This is the only thing stopping a sixth copy, and the fifth and fourth had
// already drifted. Backed by the behavioural tests above rather than standing
// alone — v1.97.1 had two mutants survive tests that only grepped source.
describe('no view hardcodes the user dot', () => {
  const views = ['board.js', 'track.js', 'selected.js', 'leisure.js', 'auto.js'];

  // The tooltip belongs to userDot now, so no view should be able to say it.
  // That is a sharper claim than "no view contains the blue": the blue is
  // still legitimate on a DESTINATION pin (track.js draws one), and it is the
  // user dot wearing it that was the bug.
  views.forEach(v => {
    it(v + ' does not build its own "you are here" marker', () => {
      const src = fs.readFileSync(path.resolve(__dirname, '../src/views/' + v), 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code).not.toContain('Din posisjon');
    });
  });

  it('the one place that says it is the shared helper', () => {
    const map = fs.readFileSync(path.resolve(__dirname, '../src/ui/map.js'), 'utf8');
    expect(map).toContain('Din posisjon');
  });
});

// ── v1.218.137: den kjente prikken ───────────────────────────────────────
describe('blå prikk, usikkerhetsring, grå når gammel', () => {
  it('blå med hvit kant', () => {
    made.length = 0; globalThis.__pos = { asked: true, homeLL: { lat: 59.9, lon: 10.8 }, posAt: Date.now(), acc: null };
    userDot({}, { lat: 59.9, lon: 10.8 });
    expect(prikk().opts.fillColor).toBe('#4285f4');
    expect(prikk().opts.color).toBe('#ffffff');
  });
  it('ringen er nøyaktigheten i meter', () => {
    made.length = 0; globalThis.__pos = { asked: true, homeLL: { lat: 59.9, lon: 10.8 }, posAt: Date.now(), acc: 35 };
    userDot({}, { lat: 59.9, lon: 10.8 });
    expect(made.find(m => m.ring).opts.radius).toBe(35);
    expect(prikk().tooltip).toBe('Din posisjon · ±35 m');
  });
  it('gammel posisjon: grå, ingen ring, og lappen sier hvor gammel', () => {
    made.length = 0; globalThis.__pos = { asked: true, homeLL: { lat: 59.9, lon: 10.8 }, posAt: Date.now() - 3 * 60_000, acc: 35 };
    userDot({}, { lat: 59.9, lon: 10.8 });
    expect(prikk().opts.fillColor).toBe(BRUKER_GRÅ);
    expect(made.some(m => m.ring)).toBe(false);
    expect(prikk().tooltip).toMatch(/3 min gammel/);
  });
  it('et sted du satte selv: blå, ingen ring, aldri grå', () => {
    expect(prikkStil({ kind: 'gammel', acc: 30, label: 'x' }, true)).toEqual({ fyll: BRUKER_BLÅ, grå: false, ringM: null, merk: 'satt av deg' });
  });
  it('en ring større enn RING_MAKS_M tegnes ikke', () => {
    expect(prikkStil({ kind: 'ok', acc: RING_MAKS_M + 1, label: '' }).ringM).toBe(null);
    expect(prikkStil({ kind: 'framskrevet', acc: null, label: 'anslått posisjon (±80 m)' }).ringM).toBe(80);
  });
});
