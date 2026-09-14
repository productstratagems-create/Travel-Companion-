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

import { userDot } from '../src/ui/map.js';

/** The blue that meant both "you" and "your destination". */
const DEST_BLUE = '#60a5fa';

describe('userDot', () => {
  it('fills with the colour reserved for you', () => {
    made.length = 0;
    userDot({}, { lat: 59.9, lon: 10.8 });
    expect(made[0].opts.fillColor).toBe('#facc15');
  });

  // The assertion this function exists for.
  it('is not the destination-pin blue', () => {
    made.length = 0;
    userDot({}, { lat: 59.9, lon: 10.8 });
    expect(made[0].opts.fillColor).not.toBe(DEST_BLUE);
    expect(made[0].opts.color).not.toBe(DEST_BLUE);
  });

  it('says what it is', () => {
    made.length = 0;
    userDot({}, { lat: 59.9, lon: 10.8 });
    expect(made[0].tooltip).toBe('Din posisjon');
  });

  it('takes the position it was given', () => {
    made.length = 0;
    userDot({}, { lat: 59.91, lon: 10.75 });
    expect(made[0].ll).toEqual([59.91, 10.75]);
  });

  // track.js and selected.js draw a smaller dot where the map is denser.
  it('allows a smaller radius without changing the colour', () => {
    made.length = 0;
    userDot({}, { lat: 59.9, lon: 10.8 }, { radius: 6 });
    expect(made[0].opts.radius).toBe(6);
    expect(made[0].opts.fillColor).toBe('#facc15');
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
