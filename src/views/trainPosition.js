import { snapToCorridor } from '../ui/corridor.js';
import { pointAtDistance, projectOnPath } from '../ui/path.js';
import { livePosition } from '../api/vehicles.js';
import { POS_STALE_MS } from '../geo.js';
import { _interpolateOnPath } from './board.js';

/**
 * Where the train is, and — just as importantly — how we know.
 *
 * The underveis map used to draw two markers for one physical object: a
 * vehicle icon placed from the timetable, and a "Din posisjon" dot placed from
 * GPS. While you are riding those are the same train, drawn twice, from two
 * sources, disagreeing — the timetable one gliding along on schedule whether
 * or not the train is.
 *
 * Your phone is the best sensor available while you are on board. It is on
 * the vehicle, its fix is about this vehicle now, and it exists for lines with
 * no operator feed — which appears to be all of T-banen.
 */

export const SRC_LABEL = {
  gps:     'din gps',
  live:    'sanntid',
  rutetid: 'etter rutetid',
};

/**
 * @returns {{lat:number, lon:number, heading:number|null, src:'gps'|'live'|'rutetid'}|null}
 */
export function _trainPosition(o) {
  const { calls, routePts, snapDist, now, phase, livePos, journeyId, userLL, posAt } = o || {};

  // 1. You, while you are actually on the train.
  //
  // Three conditions, and the third is the load-bearing one. Riding says the
  // phone is on the vehicle rather than on a platform; freshness is the same
  // rule the rest of the app uses, and matters most in a tunnel where fixes
  // stop arriving; and the corridor snap is what separates "on the train"
  // from "standing near the line" or "GPS wandering indoors". Without it a
  // stationary user drags the train onto themselves.
  if (phase === 'riding' && userLL && posAt != null
      && (now - posAt) < POS_STALE_MS && (now - posAt) > -POS_STALE_MS) {
    const snapped = routePts && routePts.length >= 2
      ? snapToCorridor(userLL, routePts, snapDist == null ? 50 : snapDist)
      : null;
    if (snapped) {
      return { lat: snapped.lat, lon: snapped.lon, heading: _headingAt(routePts, snapped), src: 'gps' };
    }
  }

  // 2. The operator's own measurement. livePosition applies the staleness
  //    rule, so a feed that stopped falls through rather than drifting.
  const live = livePosition(livePos, journeyId, now);
  if (live) {
    // Onto the drawn line, like the board's markers: the train is on the
    // rail, and this polyline is our drawing of that rail. Its tangent also
    // gives a better heading than a feed bearing that points off the track.
    const on = projectOnPath(live, routePts);
    const tangent = on ? (pointAtDistance(routePts, on.along) || {}).heading : null;
    return {
      lat: on ? on.lat : live.lat,
      lon: on ? on.lon : live.lon,
      heading: tangent != null ? tangent : live.bearing,
      src: 'live',
    };
  }

  // 3. The timetable, as before — an estimate, and labelled as one. It now
  //    runs along the drawn alignment instead of cutting between platforms;
  //    with no alignment it degrades to exactly the old answer.
  const est = _interpolateOnPath(calls, now, routePts);
  if (est) return { lat: est.lat, lon: est.lon, heading: est.heading, src: 'rutetid' };

  return null;
}

/**
 * Heading from the line itself.
 *
 * A phone at walking-to-metro speed reports a bearing that is mostly noise,
 * and often none at all — but the segment the train is standing on knows
 * which way it points.
 *
 * This used to pick the segment by distance to its midpoint in raw degrees:
 * no cos-lat scaling, and wrong on a long segment, where the midpoint can be
 * further from the point than a neighbouring segment's. The shared projection
 * answers the same question exactly.
 */
function _headingAt(pts, p) {
  const on = projectOnPath(p, pts);
  if (!on) return null;
  const at = pointAtDistance(pts, on.along);
  return at ? at.heading : null;
}
