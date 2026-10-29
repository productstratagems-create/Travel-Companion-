/**
 * How a transit corridor is drawn, per mode.
 *
 * EN BLADMODUL, OG DET ER POENGET. Den importerer ingenting, så den kan leses
 * av `map.js`, av `board.js` — og av `scratchpad/korridorProbe.mjs`, som
 * kjører i Node og måler stilen mot et ekte kartutsnitt. Den prøven er det
 * eneste instrumentet som kan svare på om streken LESES, og den måtte ellers
 * ha skrevet tallene ned en gang til. To steder som må være enige om samme
 * faktum er feilformen dette repoet har rettet rundt tjuefem ganger; her
 * skilte bare Leaflet-importen dem.
 *
 * `map.js` re-eksporterer navnet, så ingen leser trenger å flytte seg.
 *
 * Moved here from board.js, where it was exported but lived among three
 * hundred lines of corridor clipping. It is a pure lookup about how a LINE
 * looks, which belongs beside the function that draws lines — and auto-reise
 * now needs the same answer. Two tables for one idea is the failure shape
 * this codebase has found around a dozen times; board.js re-exports it under
 * its old name so nothing there has to change.
 *
 * A bus is DASHED and rail-bound modes are solid: a bus on a road is a weaker
 * claim about where the vehicle actually goes than a train on a track.
 *
 * THE CLAIM WAS RIGHT AND THE DRAWING SAID IT WRONG. Reported with a
 * screenshot of the board: «Busslinjen har en veldig tynn og uleselig strek.»
 * The bus was
 *
 *     weight: 2, opacity: 0.55, dashArray: '1 7'
 *
 * against rail's weight 4 at 0.7 — half the width, four fifths the cover, and
 * `1 7` paints an eighth of the distance. Under nineteen percent of rail's
 * ink, and no `lineCap: 'round'` in that branch either, so the dots were 1×2px
 * rectangles rather than beads. On a dark basemap crossing forest and road it
 * fell below readable.
 *
 * Thinness and transparency do not read as «uncertain». They read as
 * «unimportant» — and the second line on the board is not less important than
 * the first; it is the other line you chose.
 *
 * SO THE DISTINCTION IS CARRIED BY THE DASH ALONE, at one weight and one
 * opacity. Three shapes on the map, none of them a weaker copy of another:
 *
 *     rail   ━━━━━━━━━━━━━━━━━━━━   solid
 *     bus    ━━  ━━  ━━  ━━  ━━  ━━   dashArray '8 12'
 *     walk   ●  ●  ●  ●  ●  ●  ●    dashArray '0.1 10', accent   (drawWalk)
 *
 * Dashes and not dots: drawWalk warns in its own comment against «a slightly
 * different dash from a bus», and `1 7` against `0.1 10` was exactly that —
 * two faint beaded strings a pixel apart. A bus now reads as a line that is
 * broken, a walk as footsteps.
 *
 * `8 12` AND NOT `10 7`, AND THE ROUND CAP IS WHY. A round cap adds half the
 * weight to each end of every dash, so `10 7` at weight 4 paints 14 on and 3
 * off — measured at 85 % of the corridor's length, which is a solid line with
 * notches, not a dash. `8 12` measures 64 %, with a gap you can see. The
 * numbers are from scratchpad/korridorProbe.mjs over the reported map, not
 * from reading the dash array.
 *
 * `exact: false` is the one case that still earns less ink: a corridor drawn
 * from stop chords is a GUESS about the path, not a weaker kind of line. That
 * is the axis the old numbers belonged on — alignment versus chord, not bus
 * versus rail.
 */
export function corridorStyle(mode, color, opts = {}) {
  const { exact = true } = opts;
  const base = {
    color, weight: 4, opacity: exact ? 0.85 : 0.6,
    lineCap: 'round', interactive: false,
  };
  return mode === 'bus' ? { ...base, dashArray: '8 12' } : base;
}