import { describe, it, expect, vi } from 'vitest';

// divIcon just returns its options, so the generated markup can be inspected.
vi.mock('leaflet', () => ({ default: { divIcon: (opts) => opts } }));

import { makeVehicleIcon, sideVehicleSvg, SIDE_VEHICLE_MAX_PX } from '../src/ui/mapIcons.js';

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

// v1.59.0. The strip's countdown pills became side views of the same vehicles
// the map draws in plan view, with the minutes on the flank. Two rules carry
// it, and both fail silently: a shape that clips outside the viewBox simply
// vanishes, and a mode that falls through to the wrong silhouette still looks
// like a vehicle — just the wrong one.
describe('sideVehicleSvg', () => {
  const svg = (mode, colour, label, dim) => sideVehicleSvg(mode, colour, label, dim);
  const num = (s, name) => Number(s.match(new RegExp('\\s' + name + '="([^"]*)"'))[1]);

  it('gives each mode its own silhouette', () => {
    const widths = ['metro', 'rail', 'tram', 'bus'].map(m => num(svg(m, null, '5'), 'width'));
    expect(new Set(widths).size).toBe(4);
  });

  // v1.65.0, and the rule that replaced the wheels-and-windows one. Reported:
  // "ikonene på strip er mindre og enklere - slik at betydningen kommer
  // tydeligere frem". The window band and the wheels worked — you could tell a
  // bus from a train — but they were what you saw FIRST, and the minutes are
  // what you act on. Body, colour, number; nothing else. Without this test the
  // decoration creeps back one detail at a time.
  it('draws nothing but a body and its number', () => {
    ['metro', 'rail', 'tram', 'bus'].forEach(m => {
      const s = svg(m, null, '12');
      expect((s.match(/<path/g) || []).length).toBe(1);
      expect((s.match(/<text/g) || []).length).toBe(1);
      expect(s).not.toContain('<circle');   // wheels
      expect(s).not.toContain('<rect');     // window panes
      expect(s).not.toContain('<line');
    });
  });

  // With the decoration gone the nose is the ONLY shape left to separate the
  // modes, so it has to carry a real spread — rendered in one colour, a gentle
  // rake on all four made them the same lozenge. A rail set rakes back nearly
  // half its length; a bus front is square.
  it('spends its whole shape budget on the nose', () => {
    const nose = (m) => {
      const d = svg(m, null, '12').match(/<path d="([^"]*)"/)[1];
      const w = Number(svg(m, null, '12').match(/\swidth="([^"]*)"/)[1]);
      // The straight roof runs to (w - nose) before the rake begins.
      return w - Number(d.match(/L([\d.]+) 2/)[1]);
    };
    expect(nose('bus')).toBe(0);
    expect(nose('rail')).toBeGreaterThan(12);
    expect(nose('rail')).toBeGreaterThan(nose('metro'));
    expect(nose('metro')).toBeGreaterThan(nose('tram'));
    expect(nose('tram')).toBeGreaterThan(nose('bus'));
  });

  // The number is why the glyph shrank at all: the body lost a quarter of its
  // width while the label kept its size, which inverts the two. If the label
  // ever shrinks with the body, the change has undone itself.
  it('keeps the number at full size while the body is small', () => {
    const s = svg('bus', null, '-12');
    expect(s).toContain('font-size="11"');
    expect(Number(s.match(/\swidth="([^"]*)"/)[1])).toBeLessThanOrEqual(38);
  });

  it('falls back to the metro silhouette for a mode it does not know', () => {
    expect(svg('water', null, '5')).toBe(svg('metro', null, '5'));
  });

  // track.js passes leg.lineBg, which entur.js can leave as an empty string.
  // Without the guard that reaches the DOM as fill="", an invisible vehicle.
  it('falls back to the mode colour when the operator gave none', () => {
    expect(svg('tram', '', '5')).not.toContain('fill=""');
    expect(svg('tram', '', '5')).toContain('#7b3999');
  });

  it('writes the label on the flank', () => {
    expect(svg('metro', null, 'nå')).toContain('>nå</text>');
    expect(svg('metro', null, '-3', true)).toContain('>-3</text>');
  });

  // A vehicle drawn past the viewBox is cropped by the browser with no error
  // and no warning — the wheels sat 0.4px outside before this test existed.
  it('keeps everything it draws inside its own viewBox', () => {
    ['metro', 'rail', 'tram', 'bus'].forEach(m => {
      const s = svg(m, null, '12');
      const w = num(s, 'width'), h = num(s, 'height');
      const nums = (s.match(/<path d="([^"]*)"/)[1].match(/-?\d+(\.\d+)?/g) || []).map(Number);
      // The path alternates x and y after the leading M, so bound both by the
      // larger dimension rather than pairing them up — a coordinate outside
      // the box fails either way, and this cannot mis-pair on a Q command.
      nums.forEach(n => { expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThanOrEqual(w); });
      (s.match(/<circle[^>]*>/g) || []).forEach(c => {
        const cy = num(c, 'cy'), r = num(c, 'r'), cx = num(c, 'cx');
        expect(cy + r).toBeLessThanOrEqual(h);
        expect(cx + r).toBeLessThanOrEqual(w);
        expect(cx - r).toBeGreaterThanOrEqual(0);
      });
    });
  });

  // The whole point of the redesign: the strip and the map say the same thing
  // about the same train. If the strip stopped honouring the line's colour it
  // would still look right — just no longer connected to the map.
  it('wears the line colour it is given', () => {
    expect(svg('metro', '#00b0ff', '5')).toContain('#00b0ff');
  });

  it('quiets, rather than strips, the vehicle that has already gone', () => {
    const gone = svg('metro', null, '-3', true);
    const here = svg('metro', null, '3', false);
    // Same parts, less presence — a departed train is context, not absence.
    // Compared on the parts that exist: the pane count this used to compare
    // is zero on both sides now, which would pass without asserting anything.
    expect((gone.match(/<path/g) || []).length).toBe((here.match(/<path/g) || []).length);
    expect(gone).toContain('>-3</text>');
    expect(gone).toContain('fill-opacity=".55"');
    expect(here).toContain('fill-opacity="1"');
  });
});

// The strip sizes its clustering threshold from this, so a silhouette that
// grows without the constant growing means glyphs that overlap.
describe('SIDE_VEHICLE_MAX_PX', () => {
  // board.test.js stubs this module and hardcodes the number, because the
  // strip reads it at module scope. Pinned here so a wider silhouette fails
  // in the one place that can see both sides.
  it('is 38 — the number board.test.js stubs', () => {
    expect(SIDE_VEHICLE_MAX_PX).toBe(38);
  });

  it('is the widest silhouette any mode draws', () => {
    const widths = ['metro', 'rail', 'tram', 'bus']
      .map(m => Number(sideVehicleSvg(m, null, '5').match(/\swidth="([^"]*)"/)[1]));
    expect(SIDE_VEHICLE_MAX_PX).toBe(Math.max(...widths));
  });
});
