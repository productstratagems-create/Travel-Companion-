/**
 * Hvor en avgang SKAL være nå, ut fra rutetid og sanntid.
 *
 * Flyttet ut av `views/board.js` i v1.198.0. To skjermer hentet allerede
 * disse funksjonene ut av tavla (`track.js`, `trainPosition.js`), og
 * `recentDests.js:13` har skrevet ned hvorfor det er feil: et faktum om
 * hvor et kjøretøy er, bodde i en visning. Auto-reise trenger det nå for å
 * kjenne igjen at du sitter på — og skulle ikke bli den fjerde som henter
 * det ut av en skjerm. `board.js` eksporterer dem videre under de gamle
 * navnene, så ingen eksisterende leser måtte endres.
 */
import { quayLatLon } from './adapt.js';
import { _headingDeg, anchorDistances, pointAtDistance } from '../ui/path.js';

export function _callTime(call, arrival) {
  if (arrival) return call.expectedArrivalTime || call.aimedArrivalTime || call.expectedDepartureTime || call.aimedDepartureTime;
  return call.expectedDepartureTime || call.aimedDepartureTime || call.expectedArrivalTime || call.aimedArrivalTime;
}

export function _callPoints(calls) {
  if (!calls || !calls.length) return null;
  const pts = calls.map(call => {
    const ll = quayLatLon(call.quay);
    if (!ll) return null;
    const arr = _callTime(call, true);
    const dep = _callTime(call, false);
    if (!arr || !dep) return null;
    return { lat: ll.lat, lon: ll.lon, arr: new Date(arr).getTime(), dep: new Date(dep).getTime() };
  }).filter(Boolean);
  return pts.length >= 2 ? pts : null;
}

export function _interpolateVehiclePos(calls, now) {
  const pts = _callPoints(calls);
  if (!pts) return null;
  if (now <= pts[0].dep) {            // parked at origin terminus
    return { lat: pts[0].lat, lon: pts[0].lon,
             heading: _headingDeg(pts[0].lat, pts[0].lon, pts[1].lat, pts[1].lon) };
  }
  if (now > pts[pts.length - 1].arr) return null;   // run finished
  for (let i = 0; i < pts.length - 1; i++) {
    const cur = pts[i], next = pts[i + 1];
    if (now >= cur.dep && now <= next.arr) {
      const span = next.arr - cur.dep;
      const frac = span > 0 ? Math.min(1, Math.max(0, (now - cur.dep) / span)) : 0;
      return { lat: cur.lat + (next.lat - cur.lat) * frac,
               lon: cur.lon + (next.lon - cur.lon) * frac,
               heading: _headingDeg(cur.lat, cur.lon, next.lat, next.lon) };
    }
    if (now >= next.arr && now <= next.dep) {   // standing at a stop
      const after = pts[i + 2];
      return { lat: next.lat, lon: next.lon,
               heading: after ? _headingDeg(next.lat, next.lon, after.lat, after.lon)
                              : _headingDeg(cur.lat, cur.lon, next.lat, next.lon) };
    }
  }
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  return { lat: last.lat, lon: last.lon,
           heading: _headingDeg(prev.lat, prev.lon, last.lat, last.lon) };
}

/**
 * The same position, but measured along the line that is actually drawn.
 *
 * `_interpolateVehiclePos` slides between platform COORDINATES, so on a curve
 * the marker cuts the corner and floats beside its own track — by the arc's
 * sagitta, which on a metro alignment is hundreds of metres. Here each stop is
 * placed once along the drawn path, the DISTANCE between two stops is
 * interpolated with exactly the same time fractions, and the coordinate is
 * read back off the path. Timing semantics are untouched; only the mapping
 * from time to point changes.
 *
 * Distance rather than a perpendicular snap of the chord point, deliberately:
 * a snap cuts corners too, and on a hairpin it lands on the returning limb and
 * runs the train backwards.
 *
 * Falls back to `_interpolateVehiclePos` — identically, not approximately —
 * whenever the path cannot carry the answer: no path, an uncovered stop, or
 * anchors that do not advance. That fallback is what makes this safe for a
 * board with no geometry at all.
 */
export function _interpolateOnPath(calls, now, path) {
  const pts = _callPoints(calls);
  if (!pts || !path || path.length < 2) return _interpolateVehiclePos(calls, now);
  const d = anchorDistances(path, pts);
  if (!d) return _interpolateVehiclePos(calls, now);
  const at = (metres, fallbackFn) => {
    const p = pointAtDistance(path, metres);
    return p ? { lat: p.lat, lon: p.lon, heading: p.heading } : fallbackFn();
  };
  const bail = () => _interpolateVehiclePos(calls, now);

  if (now <= pts[0].dep) return d[0] == null ? bail() : at(d[0], bail);
  if (now > pts[pts.length - 1].arr) return null;
  for (let i = 0; i < pts.length - 1; i++) {
    const cur = pts[i], next = pts[i + 1];
    if (now >= cur.dep && now <= next.arr) {
      if (d[i] == null || d[i + 1] == null) return bail();
      const span = next.arr - cur.dep;
      const frac = span > 0 ? Math.min(1, Math.max(0, (now - cur.dep) / span)) : 0;
      return at(d[i] + (d[i + 1] - d[i]) * frac, bail);
    }
    if (now >= next.arr && now <= next.dep) {
      return d[i + 1] == null ? bail() : at(d[i + 1], bail);
    }
  }
  const lastD = d[d.length - 1];
  return lastD == null ? bail() : at(lastD, bail);
}
