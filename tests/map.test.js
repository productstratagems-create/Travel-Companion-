import { describe, it, expect, beforeEach, vi } from 'vitest';

const drawn = { polys: [], markers: [] };
vi.mock('leaflet', () => ({ default: {
  map: vi.fn(), tileLayer: vi.fn(), control: {},
  polyline: (pts, opts) => { const o = { pts, opts, addTo() { drawn.polys.push(o); return o; } }; return o; },
  marker: (ll, opts) => { const m = { ll, opts, tip: null,
    bindTooltip(t) { m.tip = t; return m; }, addTo() { drawn.markers.push(m); return m; } }; return m; },
  divIcon: (o) => o,
} }));
vi.mock('../src/ui/themeTokens.js', () => ({
  onThemeChange: vi.fn(),
  tokens: () => ({ mapInk: '#05070d', mapYou: '#facc15', accent: '#f59e0b' }),
}));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));

import { currentTileUrl, drawStopLine, corridorStyle, stopsReadable, drawLeg, drawJourneyPoints, fitPadding, ROUTE_STOP_MIN_GAP_PX } from '../src/ui/map.js';

beforeEach(() => document.documentElement.removeAttribute('data-theme'));

describe('currentTileUrl', () => {
  it('uses the light basemap for light themes', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    expect(currentTileUrl()).toContain('/alidade_smooth/');
  });

  it('uses the dark basemap for dark themes', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(currentTileUrl()).toContain('/alidade_smooth_dark/');
  });

  it('defaults to dark when no theme is set', () => {
    // The boot script always stamps data-theme, but a missing attribute
    // should not fall back to a bright canvas.
    expect(currentTileUrl()).toContain('/alidade_smooth_dark/');
  });

  it('keeps the retina placeholder so detectRetina can fill it', () => {
    // Without {r} in the URL, detectRetina has nothing to substitute and
    // every phone silently gets 1x tiles — the bug this replaced.
    document.documentElement.setAttribute('data-theme', 'light');
    expect(currentTileUrl()).toContain('{r}');
  });

  // The maps went out covered in a repeating "API key required" watermark
  // because CARTO started requiring a key on basemaps.cartocdn.com and is
  // retiring those raster endpoints. Nothing may point back at them.
  it('does not request tiles from CARTO in either theme', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    expect(currentTileUrl()).not.toContain('cartocdn');
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(currentTileUrl()).not.toContain('cartocdn');
  });

  it('carries no {s} placeholder, which the single-host provider would not fill', () => {
    // Left in, Leaflet substitutes nothing and every tile 404s.
    document.documentElement.setAttribute('data-theme', 'light');
    expect(currentTileUrl()).not.toContain('{s}');
  });

  it('does not use the old Voyager style in either theme', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    expect(currentTileUrl()).not.toContain('voyager');
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(currentTileUrl()).not.toContain('voyager');
  });
});


// ── One way to draw a line with its stops ────────────────────────────────
//
// The pattern — polyline through the stops, a small dot on each one between —
// is written out by hand in board.js, track.js and selected.js. auto-reise
// would have been the fourth copy. Same consolidation drawWalk and userDot
// already are.
describe('drawStopLine', () => {
  const layer = {};
  const line = [
    { name: 'Mortensrud', lat: 59.8617, lon: 10.8285 },
    { name: 'Skullerud', lat: 59.8644, lon: 10.8250 },
    { name: 'Bogerud', lat: 59.8710, lon: 10.8280 },
    { name: 'Bøler', lat: 59.8790, lon: 10.8300 },
  ];
  beforeEach(() => { drawn.polys.length = 0; drawn.markers.length = 0; });

  it('follows the stops in travel order', () => {
    const { pts } = drawStopLine(layer, line, { color: '#f5a000' });
    expect(pts).toEqual([[59.8617, 10.8285], [59.8644, 10.825], [59.871, 10.828], [59.879, 10.83]]);
  });

  // A stop without coordinates must be stepped over, not allowed to drag the
  // line to [0,0] — a missing kink is a small lie, a line through null island
  // is a large one.
  it('steps over a stop with no coordinates', () => {
    const { pts } = drawStopLine(layer, [line[0], { name: 'ukjent' }, line[2]], {});
    expect(pts).toEqual([[59.8617, 10.8285], [59.871, 10.828]]);
  });

  it('draws nothing when fewer than two stops can be placed', () => {
    expect(drawStopLine(layer, [line[0]], {}).drawn).toBe(false);
    expect(drawStopLine(layer, [], {}).drawn).toBe(false);
    expect(drawn.polys.length).toBe(0);
  });

  it('prefers a real shape over the chord between stops', () => {
    const shape = [[1, 1], [2, 2], [3, 3]];
    expect(drawStopLine(layer, line, { shape }).pts).toEqual(shape);
  });

  // Only the stops BETWEEN the ends get a bead; the ends are the caller's,
  // because it knows which one you board at and which one the line is for.
  it('beads only the intermediate stops', () => {
    drawStopLine(layer, line, { color: '#f5a000' });
    expect(drawn.markers.length).toBe(2);
    expect(drawn.markers.map(m => m.tip)).toEqual(['Skullerud', 'Bogerud']);
  });

  // THE MEASUREMENT THAT DECIDED THE DESIGN. An 11 km metro line inside a
  // 140px band put its stops a 12px median apart against a 21px threshold —
  // a chain of touching beads that was right in every number.
  it('drops the beads when they would touch', () => {
    const tight = (ll) => ({ x: ll[0] * 100, y: 0 });   // ~2.7px apart
    const r = drawStopLine(layer, line, { color: '#f5a000', project: tight });
    expect(r.drawn).toBe(true);           // the line still says where it goes
    expect(r.dots).toBe(false);
    expect(drawn.markers.length).toBe(0);
  });

  it('keeps the beads when there is room', () => {
    const roomy = (ll) => ({ x: ll[0] * 10000, y: 0 });
    expect(drawStopLine(layer, line, { project: roomy }).dots).toBe(true);
    expect(drawn.markers.length).toBe(2);
  });
});

describe('corridorStyle', () => {
  // A bus on a road is a weaker claim about where the vehicle goes than a
  // train on a track, and the app has said so since v1.30.0.
  it('draws a bus dotted and thin', () => {
    const s = corridorStyle('bus', '#e60000');
    expect(s.dashArray).toBeTruthy();
    expect(s.weight).toBeLessThan(4);
  });

  it('draws rail-bound modes solid', () => {
    expect(corridorStyle('metro', '#f5a000').dashArray).toBeUndefined();
  });

  it('passes the colour through untouched', () => {
    expect(corridorStyle('metro', '#f5a000').color).toBe('#f5a000');
  });
});

describe('stopsReadable', () => {
  const chain = (gap, n) => Array.from({ length: n }, (_, i) => ({ x: i * gap, y: 0 }));

  it('is true when the median gap clears the threshold', () => {
    expect(stopsReadable(chain(ROUTE_STOP_MIN_GAP_PX + 1, 6))).toBe(true);
  });

  it('is false when the beads would touch', () => {
    expect(stopsReadable(chain(6, 6))).toBe(false);
  });

  // The gate is the MEDIAN, not the smallest: one unusually close pair should
  // not blank a corridor that is otherwise perfectly legible.
  it('tolerates a single tight pair', () => {
    const pts = chain(40, 6);
    pts[3].x = pts[2].x + 2;
    expect(stopsReadable(pts)).toBe(true);
  });

  it('is true when there is nothing between the ends', () => {
    expect(stopsReadable(chain(1, 2))).toBe(true);
  });
});


// ── One leg, drawn the one way a leg is drawn (v1.114.0) ───────────────────
//
// Reported: «maps across the app look and feel different». The same journey
// was drawn three ways — corridorStyle on the board, a solid weight-4 stroke
// on the detail screen and on underveis whatever the mode, and a fourth
// hand-rolled `1,8` for the legs still to come. corridorStyle already knew the
// answer; two of the three maps never asked it.
describe('drawLeg', () => {
  const layer = {};
  const line = (pts) => pts;
  beforeEach(() => { drawn.polys = []; drawn.markers = []; });

  // The COLOURED stroke is the last polyline drawRoute adds; the one before it
  // is the casing, which is the same under every line and says nothing about
  // the mode.
  const stroke = () => drawn.polys[drawn.polys.length - 1].opts;

  it('draws a bus the way corridorStyle says a bus is drawn', () => {
    drawLeg(layer, { mode: 'bus', colour: '#e5006d', pts: line([[0, 0], [1, 1]]) });
    expect(stroke().dashArray).toBe(corridorStyle('bus', '#e5006d').dashArray);
    expect(stroke().weight).toBe(corridorStyle('bus', '#e5006d').weight);
  });

  // The whole point: a metro and a bus must not come out the same.
  it('draws rail differently from a bus', () => {
    drawLeg(layer, { mode: 'metro', colour: '#f5a000', pts: line([[0, 0], [1, 1]]) });
    const rail = stroke();
    drawn.polys = [];
    drawLeg(layer, { mode: 'bus', colour: '#f5a000', pts: line([[0, 0], [1, 1]]) });
    expect(rail.dashArray).not.toBe(stroke().dashArray);
  });

  // `dim` is a fact about the journey — this leg is still to come — not a
  // style. It fades the same stroke rather than drawing another kind.
  it('fades a leg still to come without changing its shape', () => {
    drawLeg(layer, { mode: 'bus', colour: '#e5006d', pts: line([[0, 0], [1, 1]]) });
    const bright = stroke();
    drawn.polys = [];
    drawLeg(layer, { mode: 'bus', colour: '#e5006d', pts: line([[0, 0], [1, 1]]) }, { dim: true });
    expect(stroke().opacity).toBeLessThan(bright.opacity);
    expect(stroke().dashArray).toBe(bright.dashArray);
  });

  // A walk is the one leg you make with your own feet, and it is drawn as
  // footsteps — never in the line's colour and never as a corridor.
  it('draws a foot leg as a walk, not as a corridor', () => {
    drawLeg(layer, { mode: 'foot', colour: '#e5006d', pts: line([[0, 0], [1, 1]]) });
    expect(stroke().color).not.toBe('#e5006d');
    expect(stroke().dashArray).not.toBe(corridorStyle('bus', '#e5006d').dashArray);
  });

  it('draws beads only for the stops you pass through', () => {
    drawLeg(layer, { mode: 'metro', colour: '#f5a000', stops: [
      { lat: 0, lon: 0, name: 'A' }, { lat: 1, lon: 1, name: 'B' }, { lat: 2, lon: 2, name: 'C' },
    ] });
    expect(drawn.markers).toHaveLength(1);
    expect(drawn.markers[0].tip).toBe('B');
  });

  it('draws nothing it cannot draw', () => {
    expect(drawLeg(layer, { mode: 'bus', pts: [[0, 0]] })).toEqual([]);
    expect(drawLeg(layer, null)).toEqual([]);
    expect(drawn.polys).toHaveLength(0);
  });
});

describe('drawJourneyPoints', () => {
  const layer = {};
  beforeEach(() => { drawn.polys = []; drawn.markers = []; });
  const p = (kind, lat, lon, name) => ({ kind, lat, lon, name });

  it('marks the three points of a journey with a change', () => {
    drawJourneyPoints(layer, [p('board', 0, 0, 'A'), p('change', 1, 1, 'B'), p('alight', 2, 2, 'C')]);
    expect(drawn.markers).toHaveLength(3);
  });

  // A single leg has two points and gets none: boarding is where you already
  // are, and alighting sits under a destination marker drawn anyway.
  it('says nothing about a single leg', () => {
    drawJourneyPoints(layer, [p('board', 0, 0, 'A'), p('alight', 2, 2, 'C')]);
    expect(drawn.markers).toHaveLength(0);
  });

  it('names every place a merged marker stands for', () => {
    const project = ([lat, lon]) => ({ x: lon, y: lat });
    drawJourneyPoints(layer, [
      p('board', 0, 0, 'A'), p('change', 0, 1, 'B'), p('change', 0, 2, 'C'),
    ], { project });
    expect(drawn.markers).toHaveLength(1);
    expect(drawn.markers[0].tip).toContain('A');
    expect(drawn.markers[0].tip).toContain('C');
  });
});

// ── Air around what a map frames (v1.116.0) ────────────────────────────────
//
// Every fit asked for a constant 40px. On the 130px detail band that is 62% of
// the height spent on margin, and the journey filled THREE PER CENT of the
// map — measured, after the crowding fix made the emptiness visible.
describe('fitPadding', () => {
  it('leaves proportionally less air on a short band than on a full map', () => {
    expect(fitPadding(130)).toBeLessThan(fitPadding(220));
  });

  // The number that started it: 40px on 130px. Whatever the rule returns, it
  // must not spend most of a short band on margin.
  it('never spends more than a quarter of a short band on margin', () => {
    expect(fitPadding(130) * 2).toBeLessThan(130 * 0.35);
  });

  it('still leaves an edge on a map with no height yet', () => {
    expect(fitPadding(0)).toBeGreaterThan(0);
    expect(fitPadding(undefined)).toBeGreaterThan(0);
    expect(fitPadding(10)).toBeGreaterThan(0);
  });
});
