/**
 * Ett kartspråk på tvers av skjermer.
 *
 * Reported: «maps across the app look and feel different. I want one
 * experience across maps with different purposes.»
 *
 * The same journey really was drawn three ways, and nobody chose it:
 *
 *   tavla            corridorStyle — a bus dotted and thin, rail solid
 *   underveis        drawRoute at weight 4, SOLID WHATEVER THE MODE, plus a
 *                    fourth hand-rolled `1,8` for the legs still to come
 *   avgangsdetaljer  drawRoute at weight 4, solid, mode never consulted
 *
 * And the three turning points were words on the board, unlabelled circles on
 * underveis, and nothing at all on the detail screen.
 *
 * Two of the three were measured in a browser (tests aside, see
 * scratchpad/byttekartProbe.mjs): the bus is now dotted on the board AND on
 * the detail screen. The tracking map could not be made to draw from any
 * fixture this session produced, so ITS change is held here and here only —
 * which is worth knowing when reading these tests.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const src = (f) => fs.readFileSync(f, 'utf8').replace(/\/\/[^\n]*/g, '');

describe('every map asks the same questions', () => {
  // THE ONE THAT MATTERS: a stroke chosen by mode, not by screen.
  it('draws a leg through drawLeg on all three screens', () => {
    expect(src('src/views/track.js')).toMatch(/drawLeg\(_tLayer,/);
    expect(src('src/views/selected.js')).toMatch(/drawLeg\(_selLayer,/);
    expect(src('src/views/board.js')).toMatch(/drawLeg|corridorStyle/);
  });

  // The hand-rolled styles are gone, not merely bypassed. A dead branch is a
  // second definition waiting to be re-enabled — this codebase has said so
  // about an unreachable sort mode in so many words.
  it('leaves no hand-rolled corridor behind', () => {
    const t = src('src/views/track.js');
    expect(t).not.toMatch(/dashArray: '1,8'/);
    expect(t).not.toMatch(/drawRoute\(_tLayer, pts, \{ color: lineColor/);
    expect(src('src/views/selected.js'))
      .not.toMatch(/drawRoute\(_selLayer, shape \|\| stops/);
  });

  it('marks the turning points with the same three words', () => {
    expect(src('src/views/track.js')).toMatch(/drawJourneyPoints\(_tLayer/);
    expect(src('src/views/board.js')).toMatch(/drawJourneyPoints\(_bRouteLayer|makeJourneyPointIcon/);
  });

  // The circles those words replaced are gone from the tracking map — leaving
  // them would have been a fifth vocabulary running beside the shared one.
  it('drops the unlabelled circles the words replaced', () => {
    const t = src('src/views/track.js');
    expect(t).not.toMatch(/L\.circleMarker\(first,/);
    expect(t).not.toMatch(/L\.circleMarker\(nPts\[0\],/);
  });

  // The mode has to reach the drawer, or corridorStyle is asked a question
  // with no answer in hand — which is exactly why the detail map drew every
  // line the same for so long.
  // THE WHOLE CHAIN, not just its ends. A mutant that carried the mode all the
  // way to the call site and then passed `null` into drawLeg survived both
  // halves of this test — the descriptor was right, the destructure was right,
  // and the drawer still got nothing.
  it('carries the mode into the detail screen’s leg descriptor AND on to the drawer', () => {
    const s = src('src/views/selected.js');
    expect(s).toMatch(/mode: leg\.mode \|\| null/);
    expect(s).toMatch(/\{ stops, shape, color, mode \}/);
    expect(s).toMatch(/drawLeg\(_selLayer, \{\s*mode,/);
  });
});

// ── The detail screen's own circles (v1.116.0) ─────────────────────────────
//
// Six marker styles lived on a 130px band: 14px endpoints with permanent
// names, a 5px alighting circle, 4px intermediates — none of them the bead the
// rest of the app draws. Measured: ten markers, THREE overlapping pairs.
describe('avgangsdetaljer draws the shared bead', () => {
  const s = () => src('src/views/selected.js');

  it('leaves no bespoke stop circles behind', () => {
    expect(s()).not.toMatch(/L\.circleMarker\(\[s\.lat, s\.lon\], \{ radius: 4/);
    expect(s()).not.toMatch(/L\.circleMarker\(\[s\.lat, s\.lon\], \{ radius: 5/);
  });

  // The gate that decides «is there room» must be given a projection, or it
  // has nothing to measure and every bead is drawn.
  it('hands the readability gate a projection to measure against', () => {
    expect(s()).toMatch(/drawLeg\(_selLayer,[\s\S]{0,200}project:/);
  });

  // FRAME FIRST, THEN DRAW — the third time that order has been the answer.
  // fitBounds ran at the bottom, so drawing had no frame: the first attempt
  // threw «Set map center and zoom first» and lost all ten markers, and a
  // provisional view made it worse by measuring a frame the map was leaving.
  it('fits before it draws, without animating', () => {
    const t = s();
    const frame = t.indexOf('_selMap.fitBounds(frame');
    const draw = t.indexOf('drawLeg(_selLayer');
    expect(frame).toBeGreaterThan(-1);
    expect(frame).toBeLessThan(draw);
    expect(t).toMatch(/fitBounds\(frame,[^)]*animate: false/);
  });

  // The two ends keep their permanent names — measured as not overlapping and
  // inside the frame — because this screen is about ONE departure from X to Y
  // and «PÅ»/«AV» would repeat the heading while losing the only thing the map
  // adds. But the CHANGE was marked with nothing at all.
  it('marks the change, and keeps the endpoint names', () => {
    expect(s()).toMatch(/drawJourneyPoints\(_selLayer/);
    expect(s()).toMatch(/kind === 'change'/);
    expect(s()).toMatch(/permanent: true/);
  });

  it('asks for its padding by rule rather than by number', () => {
    expect(s()).toMatch(/fitPadding\(mapEl\.clientHeight\)/);
    expect(s()).not.toMatch(/padding: \[40, 40\]/);
  });
});
