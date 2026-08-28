import { haver } from '../geo.js';

/**
 * Distance along a drawn line.
 *
 * Everything that puts a vehicle on a map needs the same two questions
 * answered — "how far along this line is that point" and "what point is this
 * far along" — and the app had grown three partial answers to them: chord
 * interpolation on the board, a corridor snap in underveis, and a fraction of
 * stop index in the strip. This is the one place that knows.
 *
 * Distances are metres, via haver. Projection uses the equirectangular
 * approximation in projectOnSegment, which is accurate over the short
 * segments a decoded alignment is made of.
 */

// Project p ({lat,lon}) onto the segment a→b ([lat,lon] each), using an
// equirectangular approximation — accurate enough over the short stop-to-stop
// segments of a transit route corridor.
export function projectOnSegment(p, a, b) {
  const cos = Math.cos(a[0] * Math.PI / 180) || 1;
  const ax = a[1] * cos, ay = a[0];
  const bx = b[1] * cos, by = b[0];
  const px = p.lon * cos, py = p.lat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { lat: ay + t * dy, lon: (ax + t * dx) / cos };
}

// Keyed on the array object, so a path that keeps its identity across render
// ticks is measured once. Callers that rebuild the array every tick get no
// benefit — which is why board.js caches its corridor array by content key.
const _measured = new WeakMap();

/** @returns {{cum: Float64Array, total: number}|null} */
export function measurePath(path) {
  if (!path || path.length < 2) return null;
  const hit = _measured.get(path);
  if (hit) return hit;
  const cum = new Float64Array(path.length);
  for (let i = 1; i < path.length; i++) {
    cum[i] = cum[i - 1] + haver(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]);
  }
  const out = { cum, total: cum[path.length - 1] };
  _measured.set(path, out);
  return out;
}

/**
 * Nearest point on the path, with everything the callers actually need:
 * where it is, how far off the caller's position was, which segment won, and
 * how many metres along the line that lands.
 *
 * `fromSeg` starts the scan partway in. That is what makes a chain of
 * anchors monotone — without it a loop line, or a stop the journey visits
 * twice, can project backwards and send the vehicle into reverse.
 *
 * @returns {{lat:number, lon:number, dist:number, segIdx:number, along:number}|null}
 */
export function projectOnPath(pos, path, fromSeg) {
  const m = measurePath(path);
  if (!pos || !m) return null;
  const start = Math.max(0, Math.min(fromSeg || 0, path.length - 2));
  let best = null;
  for (let i = start; i < path.length - 1; i++) {
    const proj = projectOnSegment(pos, path[i], path[i + 1]);
    const dist = haver(pos.lat, pos.lon, proj.lat, proj.lon);
    if (best && dist >= best.dist) continue;
    const along = m.cum[i] + haver(path[i][0], path[i][1], proj.lat, proj.lon);
    best = { lat: proj.lat, lon: proj.lon, dist, segIdx: i, along };
  }
  return best;
}

/**
 * The point a given distance along the path, and the direction the line is
 * heading there — the tangent, which is the whole point: a chord between
 * platforms says the train is going one way while the track it is drawn on
 * curves away to another.
 *
 * @returns {{lat:number, lon:number, heading:number|null}|null}
 */
export function pointAtDistance(path, metres) {
  const m = measurePath(path);
  if (!m) return null;
  const d = Math.max(0, Math.min(metres, m.total));
  // Binary search rather than a scan: a full metro alignment is a few
  // thousand points and this runs once per vehicle per tick.
  let lo = 0, hi = path.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (m.cum[mid] <= d) lo = mid; else hi = mid;
  }
  const a = path[lo], b = path[lo + 1];
  const span = m.cum[lo + 1] - m.cum[lo];
  const t = span > 0 ? (d - m.cum[lo]) / span : 0;
  return {
    lat: a[0] + (b[0] - a[0]) * t,
    lon: a[1] + (b[1] - a[1]) * t,
    heading: _headingDeg(a[0], a[1], b[0], b[1]),
  };
}

/**
 * Where a chain of anchors — a journey's stops — sit along the path.
 *
 * Forward-constrained: each anchor's scan resumes where the previous one
 * landed, so the whole chain is one sweep of the path rather than one sweep
 * per anchor, and the result cannot run backwards.
 *
 * An anchor further than `maxDev` metres from the path is reported as null:
 * the path does not cover that stop, and hanging the vehicle on it anyway
 * would put the train somewhere it has never been. Callers fall back for
 * those segments.
 *
 * @returns {Array<number|null>|null}
 */
export function anchorDistances(path, anchors, maxDev) {
  const m = measurePath(path);
  if (!m || !anchors || !anchors.length) return null;
  const lim = maxDev == null ? 150 : maxDev;
  const out = [];
  let seg = 0, prev = -Infinity;
  anchors.forEach(a => {
    const p = (a && a.lat != null && a.lon != null) ? projectOnPath(a, path, seg) : null;
    if (!p || p.dist > lim || p.along < prev) { out.push(null); return; }
    seg = p.segIdx;
    prev = p.along;
    out.push(p.along);
  });
  return out;
}

/**
 * Compass heading from one point to another, in degrees clockwise from north.
 *
 * A degree of longitude is much shorter than a degree of latitude this far
 * north, so the east-west component has to be scaled by cos(lat). Skipping
 * that skews a diagonal heading by roughly 25 degrees at Oslo's latitude —
 * wrong in a way that still looks plausible on a map.
 *
 * @returns {number|null} null when the two points coincide, so callers can
 *   leave the symbol unrotated rather than snapping it north.
 */
export function _headingDeg(fromLat, fromLon, toLat, toLon) {
  const dLat = toLat - fromLat;
  const dLon = (toLon - fromLon) * Math.cos(((fromLat + toLat) / 2) * Math.PI / 180);
  if (dLat === 0 && dLon === 0) return null;
  const deg = Math.atan2(dLon, dLat) * 180 / Math.PI;
  return (deg + 360) % 360;
}
