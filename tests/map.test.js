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

import { currentTileUrl, drawStopLine, corridorStyle, stopsReadable, ROUTE_STOP_MIN_GAP_PX } from '../src/ui/map.js';

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
