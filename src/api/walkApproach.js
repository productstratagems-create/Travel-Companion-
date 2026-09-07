/**
 * The walk you are actually making: from where you stand to the stop you
 * leave from.
 *
 * This is the one walk the app counts down to — "N min igjen" on every row
 * hangs off it — and until now it was the only walk with no route and no
 * measurement. The two routers that existed pointed elsewhere: the board's
 * foot query runs origin → destination and only when the whole trip is on
 * foot, and the Valhalla call runs alighting → a place you type on the
 * in-journey screen.
 *
 * So the number was crow-flight × 1.3, every single time. walkInfo() has
 * preferred a measured length since v1.51.0, and `saveWalkDist` had no caller
 * anywhere in src/ — the module was written to keep the length of a route the
 * walk screen drew, and that screen has since been retired. This is what
 * feeds it.
 *
 * A LADDER, cheapest loss last. Valhalla is a public demo server with no key;
 * Entur answers the same question from the same OSM data over a connection
 * the app already depends on. Only if both are gone do we draw the straight
 * line — and then NOTHING is stored, because a crow-flight length entering
 * the cache as if it were measured would move someone's departure time on a
 * number we know to be wrong.
 */
import { fetchWalkRoute, fetchFootRouteEntur } from './route.js';
import { saveWalkDist } from './walkDist.js';

/**
 * @param {{lat:number,lon:number}} fromLL where you are
 * @param {{lat:number,lon:number}} toLL the stop you leave from
 * @param {number} crowMetres straight-line distance, passed in as walkDist does
 * @param {object} deps { valhalla, entur } — injected so the ladder is testable
 * @returns {Promise<{latlngs:Array, src:string, metres:number|null}>}
 */
export async function approachRoute(fromLL, toLL, crowMetres, deps) {
  const d = deps || {};
  const viaValhalla = d.valhalla || fetchWalkRoute;
  const viaEntur = d.entur || (() => Promise.resolve(null));
  const store = d.save || saveWalkDist;

  const ok = (pts) => Array.isArray(pts) && pts.length >= 2;

  let pts = await viaValhalla(fromLL, toLL);
  let src = 'valhalla';
  if (!ok(pts)) { pts = await viaEntur(fromLL, toLL); src = 'entur'; }

  if (!ok(pts)) {
    // The cord, so the map is never blank — and no measurement, ever.
    return { latlngs: [[fromLL.lat, fromLL.lon], [toLL.lat, toLL.lon]], src: 'korde', metres: null };
  }

  // plausible() inside saveWalkDist is the guard: a router that snapped an end
  // onto the wrong side of a river returns null here and the estimate stands.
  const metres = store(fromLL, toLL, pts, crowMetres);
  return { latlngs: pts, src, metres };
}
