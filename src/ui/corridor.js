import { projectOnPath, projectOnSegment } from './path.js';

// Kept here because this is where the app has always asked "where is this
// position, against that line" — but the arithmetic itself now lives in
// path.js, which is the single projection loop everything else shares too.
export { projectOnSegment };

// Snap a position onto a route corridor (array of [lat,lon] points) when it
// is within maxDist metres of the line — giving a noisy GPS fix a realistic
// position on the track/road the user is actually on. Returns null when the
// position is too far from the corridor to plausibly belong to it.
export function snapToCorridor(pos, pts, maxDist) {
  const p = projectOnPath(pos, pts, 0);
  return p && p.dist <= maxDist ? { lat: p.lat, lon: p.lon } : null;
}
