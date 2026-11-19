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
    layerGroup: () => { const g = { addTo() { return g; }, on() { return g; } }; return g; },
    circle: (ll, opts) => { const c = { ll, opts: { ...opts }, ring: true, addTo() { return c; },
      setRadius(r) { c.opts.radius = r; }, setStyle(o) { Object.assign(c.opts, o); }, setLatLng(p) { c.ll = p; } }; made.push(c); return c; },
    divIcon: (o) => o,
    marker: (ll, opts) => {
      const m = {
        ll, opts: { ...opts, fillColor: opts.icon && opts.icon.fyll, color: '#ffffff', radius: opts.icon && opts.icon.iconSize[0] / 2 }, tooltip: null,
        bindTooltip(t) { m.tooltip = t; return m; },
        getTooltip() { return m.tooltip; }, setTooltipContent(t) { m.tooltip = t; },
        setIcon(i) { m.opts.icon = i; m.opts.fillColor = i.fyll; }, setLatLng(p) { m.ll = p; },
        addTo() { return m; },
      };
      made.push(m);
      return m;
    },
    circleMarker: (ll, opts) => {
      const m = {
        ll, opts: { ...opts }, tooltip: null,
        bindTooltip(t) { m.tooltip = t; return m; },
        getTooltip() { return m.tooltip; }, setTooltipContent(t) { m.tooltip = t; },
        setStyle(o) { Object.assign(m.opts, o); }, setLatLng(p) { m.ll = p; },
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
    expect(made.find(m => m.ring).opts.radius).toBe(0);
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

describe('prikken oppdateres der den flyttes (v1.218.138)', () => {
  it('blir grå ved flytting når posisjonen er blitt gammel, og blå igjen når den er fersk', () => {
    made.length = 0; globalThis.__pos = { asked: true, homeLL: { lat: 59.9, lon: 10.8 }, posAt: Date.now(), acc: 30 };
    const g = userDot({}, { lat: 59.9, lon: 10.8 });
    expect(prikk().opts.fillColor).toBe(BRUKER_BLÅ);
    globalThis.__pos = { ...globalThis.__pos, posAt: Date.now() - 5 * 60_000 };
    g.setLatLng([59.91, 10.81]);
    expect(prikk().opts.fillColor).toBe(BRUKER_GRÅ);
    expect(made.find(m => m.ring).opts.radius).toBe(0);
    expect(prikk().ll).toEqual([59.91, 10.81]);
    globalThis.__pos = { ...globalThis.__pos, posAt: Date.now(), acc: 20 };
    g.restil();
    expect(prikk().opts.fillColor).toBe(BRUKER_BLÅ);
    expect(made.find(m => m.ring).opts.radius).toBe(20);
  });
  it('ser på alderen selv også når ingenting flytter seg', () => {
    const s = fs.readFileSync(path.resolve(__dirname, '../src/ui/map.js'), 'utf8');
    expect(s).toMatch(/tikk = setInterval\(restil, PRIKK_TIKK_MS\)/);
  });
});

import { BRUKER_LAG, BRUKER_LAG_Z } from '../src/ui/map.js';
describe('prikken ligger øverst (v1.218.152)', () => {
  it('eget lag over markører og lapper, under popups', () => {
    expect(BRUKER_LAG_Z).toBeGreaterThan(650);
    expect(BRUKER_LAG_Z).toBeLessThan(700);
  });
  it('prikk og ring legges i laget når kartet er kjent', () => {
    made.length = 0;
    const panes = {};
    const norot = { id: 'norotatePane' };
    const kart = { _norotatePane: norot, createPane: (n, c) => (panes[n] = { style: {}, forelder: c }), getPane: n => panes[n] };
    userDot({ _map: kart }, { lat: 59.9, lon: 10.8 });
    expect(panes[BRUKER_LAG].style.zIndex).toBe(String(BRUKER_LAG_Z));
    expect(prikk().opts.pane).toBe(BRUKER_LAG);
    // v1.218.166: ringen (meter) følger kartet i overlayPane; laget er i norotatePane.
    expect(made.find(m => m.ring).opts.pane).toBe(undefined);
    expect(panes[BRUKER_LAG].forelder).toBe(norot);
  });
});
