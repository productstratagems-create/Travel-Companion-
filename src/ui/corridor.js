import { haver } from '../geo.js';

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

// Snap a position onto a route corridor (array of [lat,lon] points) when it
// is within maxDist metres of the line — giving a noisy GPS fix a realistic
// position on the track/road the user is actually on. Returns null when the
// position is too far from the corridor to plausibly belong to it.
export function snapToCorridor(pos, pts, maxDist) {
  if (!pos || !pts || pts.length < 2) return null;
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const proj = projectOnSegment(pos, pts[i], pts[i + 1]);
    const dist = haver(pos.lat, pos.lon, proj.lat, proj.lon);
    if (!best || dist < best.dist) best = { lat: proj.lat, lon: proj.lon, dist };
  }
  return best && best.dist <= maxDist ? { lat: best.lat, lon: best.lon } : null;
}
