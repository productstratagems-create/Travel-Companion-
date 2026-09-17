/**
 * Hvor du går på, hvor du bytter, hvor du går av.
 *
 * Reported with a screenshot of the board map: «Måten multi-stopps reiser
 * tegnes opp i kart er uklart og vanskelig å tyde. Både linjene og prikken.»
 *
 * Mortensrud → Ljan, one change, bus 73 onto bus 81. Both are RUT buses, so
 * both corridors were drawn in the same red with the same dash — one unbroken
 * string with no visible seam. Six symbols on that map, and not one of them
 * marked the change.
 */
import { describe, it, expect } from 'vitest';
import { journeyPoints } from '../src/api/adapt.js';

const place = (name, lat, lon) => ({ name, latitude: lat, longitude: lon });
const leg = (mode, from, to) => ({ mode, fromPlace: from, toPlace: to });

const MORTENSRUD = place('Mortensrud', 59.8570, 10.8280);
const HAUKETO = place('Hauketo', 59.8420, 10.8020);
const LJAN = place('Ljan stasjon', 59.8430, 10.7820);

describe('journeyPoints', () => {
  // THE REPORTED JOURNEY. Three markers where there were none.
  it('names the three points of a two-leg trip', () => {
    const pts = journeyPoints([
      leg('bus', MORTENSRUD, HAUKETO),
      leg('bus', HAUKETO, LJAN),
    ]);
    expect(pts.map(p => p.kind)).toEqual(['board', 'change', 'alight']);
    expect(pts.map(p => p.name)).toEqual(['Mortensrud', 'Hauketo', 'Ljan stasjon']);
  });

  // One change is ONE marker, not two stacked on each other — getting off and
  // getting on at the same interchange is one place.
  it('does not stack two markers on one interchange', () => {
    const pts = journeyPoints([
      leg('bus', MORTENSRUD, HAUKETO),
      leg('bus', { ...HAUKETO, latitude: 59.84203 }, LJAN),   // 3 m away
    ]);
    expect(pts).toHaveLength(3);
  });

  // But when a walk moves you somewhere else, «get off here» and «get on
  // there» are two different facts, and a reader who is told only one of them
  // is standing at the wrong stop.
  it('keeps both ends when the change is a walk between two places', () => {
    const far = place('Hauketo skole', 59.8460, 10.8100);   // ~400 m
    const pts = journeyPoints([
      leg('bus', MORTENSRUD, HAUKETO),
      leg('foot', HAUKETO, far),
      leg('bus', far, LJAN),
    ]);
    expect(pts.map(p => p.kind)).toEqual(['board', 'change', 'change', 'alight']);
    expect(pts.map(p => p.name)).toEqual(
      ['Mortensrud', 'Hauketo', 'Hauketo skole', 'Ljan stasjon']);
  });

  // A walk makes no point of its own: it is already drawn as a walking line,
  // and marking its ends as well would put three markers on one change.
  it('gives a leading or trailing walk no markers', () => {
    const home = place('Hjemme', 59.8590, 10.8300);
    const pts = journeyPoints([
      leg('foot', home, MORTENSRUD),
      leg('bus', MORTENSRUD, LJAN),
      leg('foot', LJAN, place('Jobben', 59.8440, 10.7800)),
    ]);
    expect(pts.map(p => p.kind)).toEqual(['board', 'alight']);
    expect(pts.map(p => p.name)).toEqual(['Mortensrud', 'Ljan stasjon']);
  });

  // A single-leg journey has two points, and the drawing suppresses them —
  // boarding is where you stand and alighting is under the destination pin.
  // The RULE still returns them; the decision not to draw belongs to the map.
  it('returns two points for a single leg, and no change', () => {
    const pts = journeyPoints([leg('metro', MORTENSRUD, LJAN)]);
    expect(pts.map(p => p.kind)).toEqual(['board', 'alight']);
  });

  it('gives nothing for a walk-only journey, or for junk', () => {
    expect(journeyPoints([leg('foot', MORTENSRUD, LJAN)])).toEqual([]);
    expect(journeyPoints([])).toEqual([]);
    expect(journeyPoints(null)).toEqual([]);
  });

  // A leg with no coordinates cannot be drawn, and must not become a marker at
  // latitude zero — which is in the Atlantic.
  it('skips a place with no coordinates rather than placing it at null island', () => {
    const pts = journeyPoints([
      leg('bus', { name: 'Ukjent' }, HAUKETO),
      leg('bus', HAUKETO, LJAN),
    ]);
    expect(pts.every(p => Number.isFinite(p.lat) && p.lat !== 0)).toBe(true);
    expect(pts.map(p => p.kind)).toEqual(['change', 'alight']);
  });

  // Three legs, two changes — the rule must not stop after the first.
  it('marks every change, not just the first', () => {
    const mid = place('Holmlia', 59.8480, 10.7980);
    const pts = journeyPoints([
      leg('bus', MORTENSRUD, HAUKETO),
      leg('rail', HAUKETO, mid),
      leg('bus', mid, LJAN),
    ]);
    expect(pts.map(p => p.kind)).toEqual(['board', 'change', 'change', 'alight']);
  });
});

// ── Markers that would sit on top of each other ────────────────────────────
//
// The browser probe drew «BYTT» twice, overlapping, for one change: a 370 m
// walk between two stops is two real facts and about eight pixels at the zoom
// a whole journey fits in. Both were correct and the pair was unreadable.
import { mergeNearby, ROUTE_STOP_MIN_GAP_PX } from '../src/ui/map.js';

describe('mergeNearby', () => {
  // A crude projection is enough: the question is pixels, and these ARE the
  // pixels. Latitude grows downward here, which does not matter to a distance.
  const project = ([lat, lon]) => ({ x: lon * 1000, y: lat * 1000 });
  const at = (name, lat, lon) => ({ name, lat, lon });

  it('keeps markers that have room', () => {
    const out = mergeNearby([at('A', 0, 0), at('B', 0, 0.1)], project);
    expect(out).toHaveLength(2);
  });

  it('folds two that would touch into one', () => {
    const out = mergeNearby([at('Hauketo', 0, 0), at('Hauketo skole', 0, 0.005)], project);
    expect(out).toHaveLength(1);
  });

  // NOTHING IS DROPPED. The merged marker still names both ends, so tapping it
  // tells you where you get off AND where you get on — the same call
  // splitSituations made about messages it could not prove irrelevant.
  it('keeps every name it stands for', () => {
    const out = mergeNearby([at('Hauketo', 0, 0), at('Hauketo skole', 0, 0.005)], project);
    expect(out[0].names).toEqual(['Hauketo', 'Hauketo skole']);
  });

  it('does not repeat one name twice', () => {
    const out = mergeNearby([at('Hauketo', 0, 0), at('Hauketo', 0, 0.005)], project);
    expect(out[0].names).toEqual(['Hauketo']);
  });

  // The FIRST one is kept, so «på» is never swallowed by a «bytt» that follows
  // it — the order of the journey survives the thinning.
  it('keeps the earlier marker, not the later one', () => {
    const out = mergeNearby([at('på', 0, 0), at('bytt', 0, 0.005)], project);
    expect(out[0].name).toBe('på');
  });

  // AND THE ORDER OF THE ONES IT KEEPS. The merge test above only ever leaves
  // one marker, so it could not see a thinning that reordered the rest — a
  // mutant that overwrote an earlier entry with a later one survived it. A
  // journey read out of order is worse than a crowded one.
  it('leaves the order of the kept markers alone', () => {
    const out = mergeNearby(
      [at('på', 0, 0), at('bytt', 0, 0.1), at('av', 0, 0.2)], project);
    expect(out.map(p => p.name)).toEqual(['på', 'bytt', 'av']);
  });

  it('measures against the shared gap, on the boundary', () => {
    const gap = ROUTE_STOP_MIN_GAP_PX;
    const just = mergeNearby([at('A', 0, 0), at('B', 0, (gap + 1) / 1000)], project);
    expect(just).toHaveLength(2);
    const not = mergeNearby([at('A', 0, 0), at('B', 0, (gap - 1) / 1000)], project);
    expect(not).toHaveLength(1);
  });

  it('survives junk, and no projection at all', () => {
    expect(mergeNearby(null, project)).toEqual([]);
    expect(mergeNearby([null, at('A', 0, 0)], project)).toHaveLength(1);
    expect(mergeNearby([at('A', 0, 0), at('B', 0, 0.005)], null)).toHaveLength(2);
  });
});
