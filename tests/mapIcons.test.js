import { describe, it, expect, vi } from 'vitest';

// divIcon just returns its options, so the generated markup can be inspected.
vi.mock('leaflet', () => ({ default: { divIcon: (opts) => opts } }));

import { makeVehicleIcon } from '../src/ui/mapIcons.js';

const html = (mode, opts) => makeVehicleIcon(mode, '#f5a000', opts).html;
const bodyRect = (h) => h.match(/<rect[^>]*rx="[\d.]+"[^>]*\/>/)[0];
// Anchored on whitespace, or `opacity` also matches inside `fill-opacity`.
const attr = (tag, name) => {
  const m = tag.match(new RegExp('\\s' + name + '="([^"]*)"'));
  return m ? m[1] : null;
};

describe('makeVehicleIcon', () => {
  describe('the estimated variant is drawn, not merely present', () => {
    // v1.11.0 shipped this variant as a hollow dashed outline in the line's
    // own colour, on top of a corridor drawn in that same colour. It was in
    // the DOM, correctly placed, and invisible on a phone — and since metro
    // has no live feed it was the only variant anyone ever saw.
    it('fills its body rather than leaving it hollow', () => {
      const rect = bodyRect(html('metro', { estimated: true, bearing: 90 }));
      expect(attr(rect, 'fill')).not.toBe('none');
      expect(Number(attr(rect, 'fill-opacity'))).toBeGreaterThan(0.3);
    });

    it('keeps a solid outline, so the silhouette survives on any basemap', () => {
      const rect = bodyRect(html('metro', { estimated: true, bearing: 90 }));
      expect(rect).not.toContain('stroke-dasharray');
      expect(Number(attr(rect, 'stroke-width'))).toBeGreaterThan(0);
    });

    it('does not stack a second opacity reduction on top of the fill', () => {
      const h = html('metro', { estimated: true, bearing: 90 });
      const rect = bodyRect(h);
      const o = attr(rect, 'opacity');
      expect(o === null || Number(o) >= 0.9).toBe(true);
    });
  });

  describe('live and estimated stay distinguishable', () => {
    it('spends the distinction on fill and the nose band, not on presence', () => {
      const live = html('metro', { estimated: false, bearing: 90 });
      const est = html('metro', { estimated: true, bearing: 90 });
      expect(live).not.toBe(est);
      // The nose band marks the leading end and belongs only to a measured
      // position; it is the extra <rect> beyond the body.
      expect((live.match(/<rect/g) || []).length).toBeGreaterThan((est.match(/<rect/g) || []).length);
      expect(Number(attr(bodyRect(live), 'fill-opacity')))
        .toBeGreaterThan(Number(attr(bodyRect(est), 'fill-opacity')));
    });

    it('animates only a measured position', () => {
      expect(html('metro', { estimated: false })).toContain('veh-live');
      expect(html('metro', { estimated: true })).toContain('veh-est');
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
