/**
 * The walk from where you stand to the stop you leave from — fetched once,
 * held in one place, read by every screen that needs it.
 *
 * This lived inside board.js as module state (`_approachKey`, `_approachPts`).
 * That was fine while the departure board was the only screen that drew it.
 * It is not fine now that auto-reise draws it too: a second copy of the cache
 * and the key guard is two things that must agree, written down twice — the
 * failure shape this codebase has found around a dozen times, most recently
 * as two category whitelists that quietly lost every kerbside bus stop.
 *
 * So the cache lives here and board.js imports it. One key, one set of points,
 * one in-flight request no matter how many maps are looking at it.
 *
 * FETCHED ONCE PER PAIR OF POINTS, NOT ONCE PER RENDER. Every screen that
 * reads this redraws every second (renderTickMs), and without the key guard
 * this would be a routing request a second against a public demo server.
 *
 * The key is `walkKey` — the same four decimals (~11 m) walkDist stores
 * under — rather than a rounding of its own. Two roundings for one idea is
 * how they drift apart, and here the drift would be a fetch that never hits
 * the cache it just filled.
 */
import config from '../config.js';
import { haver } from '../geo.js';
import { walkKey } from './walkDist.js';
import { approachRoute } from './walkApproach.js';
import { fetchFootRouteEntur } from './route.js';
import { enturFetch } from './http.js';
import { logMsg } from '../ui/log.js';

/**
 * Close enough that you are already there.
 *
 * Standing on the platform, a route to your own feet is noise on the map and
 * a request for nothing. Above this the walk is a real part of catching the
 * departure, which is exactly when the countdown starts mattering.
 *
 * ONE DEFINITION OF "AT THE STOP". auto-reise reads the same number to decide
 * whether it may skip its own orientation screen: if the walk is worth
 * drawing, the walk is worth reading, and the app should not jump past it.
 * Two numbers for that one idea would drift, and the drift would show as a
 * screen that draws a route to a stop it has already decided you are standing
 * at.
 */
export const AT_STOP_M = 120;

let _key = null;
let _pts = null;

/** Test seam: the guard is module state, and a test must be able to clear it. */
export function resetApproach() { _key = null; _pts = null; }
export function approachPoints() { return _pts; }
export function approachKey() { return _key; }

export function ensureApproach(fromLL, stopLL) {
  if (!fromLL || !stopLL) { _key = null; _pts = null; return; }
  const crow = haver(fromLL.lat, fromLL.lon, stopLL.lat, stopLL.lon);
  if (crow < AT_STOP_M) { _key = null; _pts = null; return; }

  const key = walkKey(fromLL, stopLL);
  if (_key === key) return;
  _key = key;
  _pts = null;

  approachRoute(fromLL, stopLL, crow, {
    entur: (a, b) => fetchFootRouteEntur(enturFetch, config.api.journeyPlanner, a, b),
  }).then(({ latlngs, src, metres }) => {
    // The reader may have moved, or the route changed, while we waited.
    if (_key !== key) return;
    _pts = latlngs;
    logMsg('gangrute: ' + src + (metres != null ? ' · ' + metres + ' m' : ' · ikke målt'),
      metres != null ? 'ok' : null);
  });
}
