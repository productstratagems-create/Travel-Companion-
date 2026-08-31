import { describe, it, expect, vi } from 'vitest';

// divIcon just returns its options, so the generated markup can be inspected.
vi.mock('leaflet', () => ({ default: { divIcon: (opts) => opts } }));

import { makeVehicleIcon } from '../src/ui/mapIcons.js';

const html = (mode, opts) => makeVehicleIcon(mode, '#f5a000', opts).html;
// The body is the tapered silhouette, named rather than found by position —
// it used to be "the first <rect with an rx>", which quietly retargets the
// moment the shape gains another rounded rect.
const bodyPath = (h) => h.match(/<path class="veh-body"[^>]*\/>/)[0];
const parts = (h, cls) => (h.match(new RegExp('class="' + cls + '"', 'g')) || []).length;
// Anchored on whitespace, or `opacity` also matches inside `fill-opacity`.
const attr = (tag, name) => {
  const m = tag.match(new RegExp('\\s' + name + '="([^"]*)"'));
  return m ? m[1] : null;
};
const BOX = 30;

describe('makeVehicleIcon', () => {
  describe('the estimated variant is drawn, not merely present', () => {
    // v1.11.0 shipped this variant as a hollow dashed outline in the line's
    // own colour, on top of a corridor drawn in that same colour. It was in
    // the DOM, correctly placed, and invisible on a phone — and since metro
    // has no live feed it was the only variant anyone ever saw.
    it('fills its body rather than leaving it hollow', () => {
      const body = bodyPath(html('metro', { estimated: true, bearing: 90 }));
      expect(attr(body, 'fill')).not.toBe('none');
      expect(Number(attr(body, 'fill-opacity'))).toBeGreaterThan(0.3);
    });

    it('keeps a solid outline, so the silhouette survives on any basemap', () => {
      const body = bodyPath(html('metro', { estimated: true, bearing: 90 }));
      expect(body).not.toContain('stroke-dasharray');
      expect(Number(attr(body, 'stroke-width'))).toBeGreaterThan(0);
    });

    it('does not stack a second opacity reduction on top of the fill', () => {
      const body = bodyPath(html('metro', { estimated: true, bearing: 90 }));
      const o = attr(body, 'opacity');
      expect(o === null || Number(o) >= 0.9).toBe(true);
    });

    // v1.49.0, and the whole point of it. The windscreen used to belong to the
    // measured variant alone — so metro, which has no live feed and is
    // therefore ALWAYS estimated, was the one mode drawn as a bare capsule
    // with no front at all. A timetable position still points somewhere.
    it('has a front and carriage joints, not just a silhouette', () => {
      const est = html('metro', { estimated: true, bearing: 90 });
      expect(parts(est, 'veh-glass')).toBe(1);
      expect(parts(est, 'veh-joint')).toBeGreaterThanOrEqual(1);
    });
  });

  describe('live and estimated stay distinguishable', () => {
    // The distinction moved from removing the front to dimming the vehicle:
    // both read as something facing a direction, only one claims to have been
    // measured. Headlights are the part that is only true of a live position.
    it('spends the distinction on headlights and fill, not on presence', () => {
      const live = html('metro', { estimated: false, bearing: 90 });
      const est = html('metro', { estimated: true, bearing: 90 });
      expect(parts(live, 'veh-lamp')).toBe(1);
      expect(parts(est, 'veh-lamp')).toBe(0);
      expect(Number(attr(bodyPath(live), 'fill-opacity')))
        .toBeGreaterThan(Number(attr(bodyPath(est), 'fill-opacity')));
    });

    it('animates only a measured position', () => {
      expect(html('metro', { estimated: false })).toContain('veh-live');
      expect(html('metro', { estimated: true })).toContain('veh-est');
    });
  });

  // ── One shape per mode ────────────────────────────────────────────────────
  describe('each mode has its own silhouette', () => {
    const MODES = ['metro', 'rail', 'tram', 'bus'];
    const shapeOf = (m) => attr(bodyPath(html(m, { bearing: 0 })), 'd');

    // Before v1.49.0 metro and rail were the same 22×10 capsule, and bus and
    // tram differed from it only in length: four transport modes, two shapes.
    it('draws four different bodies for four different vehicles', () => {
      const shapes = MODES.map(shapeOf);
      expect(new Set(shapes).size).toBe(MODES.length);
    });

    // The joints are what say "articulated". A bus is one box and gets none;
    // anything running on rails is drawn in carriages.
    it('gives a bus no carriage joints and the rail modes some', () => {
      expect(parts(html('bus', { bearing: 0 }), 'veh-joint')).toBe(0);
      ['metro', 'rail', 'tram'].forEach(m =>
        expect(parts(html(m, { bearing: 0 }), 'veh-joint')).toBeGreaterThan(0));
    });

    it('falls back to the metro shape for a mode it does not know', () => {
      expect(shapeOf('funicular')).toBe(shapeOf('metro'));
      expect(shapeOf(undefined)).toBe(shapeOf('metro'));
    });
  });

  // track.js passes `leg.lineBg`, which is '' for a line with no presentation
  // colour — and `fill=""` renders black on a black-ish basemap.
  it('falls back to the mode colour when the caller has none', () => {
    const h = makeVehicleIcon('bus', '', { bearing: 0 }).html;
    expect(h).not.toContain('fill=""');
    expect(bodyPath(h)).toContain('#e5006d');
  });

  // Anything outside the viewBox is silently clipped — a mistake that shows up
  // only on screen, never in a passing test.
  it('keeps every part inside the icon box', () => {
    ['metro', 'rail', 'tram', 'bus'].forEach(mode => {
      [true, false].forEach(estimated => {
        const h = html(mode, { estimated, bearing: 0 });
        const nums = (attr(bodyPath(h), 'd').match(/-?\d+(\.\d+)?/g) || []).map(Number);
        nums.forEach(n => {
          expect(n, mode).toBeGreaterThanOrEqual(0.85);   // room for the stroke
          expect(n, mode).toBeLessThanOrEqual(BOX - 0.85);
        });
        [...h.matchAll(/<rect[^>]*\/>/g)].forEach(([tag]) => {
          const x = Number(attr(tag, 'x')), w = Number(attr(tag, 'width'));
          const y = Number(attr(tag, 'y')), ht = Number(attr(tag, 'height'));
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x + w).toBeLessThanOrEqual(BOX);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y + ht).toBeLessThanOrEqual(BOX);
        });
      });
    });
  });

  describe('orientation', () => {
    it('rotates to the bearing', () => {
      expect(html('metro', { bearing: 214 })).toContain('rotate(214deg)');
    });

    it('stays unrotated when the heading is unknown, rather than snapping north', () => {
      expect(html('metro', { bearing: null })).not.toContain('rotate(');
      expect(html('metro', {})).not.toContain('rotate(');
    });
  });

  it('carries no line code — the map only ever draws one line at a time', () => {
    expect(html('metro', { bearing: 90 })).not.toMatch(/>\s*\d+\s*</);
  });
});
