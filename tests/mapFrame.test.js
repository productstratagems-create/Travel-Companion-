/**
 * Én oppførsel og én ramme for hvert kart.
 *
 * Reported: «maps across the app look and feel different». The drawing was the
 * first half (v1.114.0); this is the second.
 *
 * The expand button was written FIVE times — board, selected, track, the
 * onward map inside track, and plan — and the five had drifted. Only the
 * onward map's copy updated `title`; only the board's toggled `map-open`; plan
 * kept its own boolean instead of reading the class back. Nobody chose that:
 * it was copied, then edited in one place at a time.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';

const drawn = [];
vi.mock('leaflet', () => ({ default: {
  map: vi.fn(), tileLayer: () => ({ addTo: () => ({}) }),
  control: { zoom: (o) => ({ addTo: () => drawn.push('zoom@' + o.position) }),
             scale: (o) => ({ addTo: () => drawn.push('scale@' + o.position) }) },
} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/ui/themeTokens.js', () => ({ onThemeChange: vi.fn(), tokens: () => ({}) }));

const { bindMapExpand } = await import('../src/ui/map.js');

const src = (f) => fs.readFileSync(f, 'utf8').replace(/\/\/[^\n]*/g, '');

describe('bindMapExpand', () => {
  let el, btn, map, sized;
  beforeEach(() => {
    vi.useFakeTimers();
    // Timers queued by earlier tests survive into this one, and advancing the
    // clock flushed all of them at once — the first run of this test counted
    // seven remeasures for one click.
    vi.clearAllTimers();
    document.documentElement.className = '';
    el = document.createElement('div');
    btn = document.createElement('button');
    sized = 0;
    map = { invalidateSize: () => { sized++; } };
    bindMapExpand(map, el, btn);
  });

  it('opens and closes the same way', () => {
    btn.onclick();
    expect(el.classList.contains('expanded')).toBe(true);
    btn.onclick();
    expect(el.classList.contains('expanded')).toBe(false);
  });

  // Only one of the five copies told a hovering cursor what it would do.
  it('tells the cursor too, not just a screen reader', () => {
    btn.onclick();
    expect(btn.title).toBe('Minimer kart');
    expect(btn.getAttribute('aria-label')).toBe('Minimer kart');
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    btn.onclick();
    expect(btn.title).toBe('Utvid kart');
  });

  // The board is the one screen with a fixed layout that has to yield. Setting
  // the class everywhere changes nothing elsewhere — the CSS is scoped to
  // html.view-board — and stops this from being five handlers.
  it('lets the page yield while a map is open', () => {
    btn.onclick();
    expect(document.documentElement.classList.contains('map-open')).toBe(true);
    btn.onclick();
    expect(document.documentElement.classList.contains('map-open')).toBe(false);
  });

  // AFTER the CSS transition, not before it: Leaflet measures the container,
  // and measuring it mid-transition gives a map sized to a height it is
  // leaving.
  it('remeasures the map once the frame has finished growing', () => {
    btn.onclick();
    expect(sized).toBe(0);
    vi.advanceTimersByTime(400);
    expect(sized).toBe(1);
  });

  it('survives a screen with no button', () => {
    expect(() => bindMapExpand(map, el, null)).not.toThrow();
    expect(() => bindMapExpand(map, null, btn)).not.toThrow();
  });
});

describe('every map is bound the one way', () => {
  // EVERY map that can open, including the one built in JS rather than in
  // index.html — the onward map on underveis, which is why a grep of the
  // markup made it look as though it had no button at all. Its copy was the
  // only one of the five that updated `title`.
  it('binds all five, the JS-built one included', () => {
    const t = src('src/views/track.js');
    expect(t).toMatch(/bindMapExpand\(_tMap,/);
    expect(t).toMatch(/bindMapExpand\(_arrMap,/);
  });

  it('leaves no hand-rolled expand handler behind', () => {
    for (const f of ['src/views/board.js', 'src/views/selected.js',
                     'src/views/track.js', 'src/views/plan.js']) {
      expect(src(f)).not.toMatch(/classList\.toggle\('expanded'\)/);
      expect(src(f)).toMatch(/bindMapExpand\(/);
    }
  });

  // The controls follow the rule, and the rule is one word at each call site:
  // a map you can open full-screen carries what exploring needs; a band you
  // cannot open is a glance the app has already framed.
  it('asks for the controls by purpose, not one by one', () => {
    for (const f of ['src/views/board.js', 'src/views/selected.js',
                     'src/views/track.js', 'src/views/plan.js']) {
      expect(src(f)).toMatch(/createMap\([^)]*expandable: true/);
    }
    // And the two bands ask for neither.
    expect(src('src/views/auto.js')).not.toMatch(/expandable: true/);
    expect(src('src/views/leisure.js')).not.toMatch(/expandable: true/);
  });
});

describe('createMap and the controls rule', () => {
  beforeEach(() => { drawn.length = 0; });

  it('gives an expandable map both controls', async () => {
    const { createMap } = await import('../src/ui/map.js');
    const L = (await import('leaflet')).default;
    L.map = () => ({ addLayer: () => {}, attributionControl: { setPrefix: () => {} },
      remove: () => {} });
    createMap(document.createElement('div'), { expandable: true });
    expect(drawn).toContain('zoom@bottomright');
    expect(drawn).toContain('scale@bottomleft');
  });

  it('gives a band neither', async () => {
    const { createMap } = await import('../src/ui/map.js');
    createMap(document.createElement('div'), {});
    expect(drawn).toEqual([]);
  });
});
