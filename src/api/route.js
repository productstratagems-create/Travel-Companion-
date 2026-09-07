import { decodePolyline } from '../ui/polyline.js';

/**
 * What "safe" means to the router.
 *
 * A preference, not a promise — and that distinction is why nothing in the
 * interface calls the result safe. These are weights inside Valhalla's
 * pedestrian costing: they make a footway cheaper to use than a kerb beside
 * traffic, and stairs and alleys expensive enough that a slightly longer way
 * round wins. They know nothing about lighting, gritting or how a place feels
 * after dark.
 *
 * The route may come out a few tens of metres longer than the shortest line.
 * That is the point.
 *
 * One named table so the weights can be tuned in one place rather than hunted
 * for inside a request body.
 */
export const WALK_COSTING = {
  walkway_factor: 1.5,    // prefer dedicated walkways
  sidewalk_factor: 1.4,   // prefer a pavement over the carriageway
  alley_factor: 0.3,      // and stay out of alleys
  driveway_factor: 0.3,
  step_penalty: 40,       // seconds per flight — a lift-free detour is often better
  use_ferry: 0,
};

// Fetch a walking route between two lat/lon points using Valhalla's pedestrian router.
// Uses actual OSM footway/path data — follows pedestrian zones, footpaths, etc.
// Returns an array of [lat, lon] pairs for L.polyline(), or null on failure.
export async function fetchWalkRoute(fromLL, toLL) {
  try {
    const r = await fetch('https://valhalla1.openstreetmap.de/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: [
          { lat: fromLL.lat, lon: fromLL.lon },
          { lat: toLL.lat, lon: toLL.lon },
        ],
        costing: 'pedestrian',
        costing_options: { pedestrian: WALK_COSTING },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const shape = data.trip && data.trip.legs && data.trip.legs[0] && data.trip.legs[0].shape;
    if (!shape) return null;
    return decodePolyline(shape, 6);   // Valhalla is precision 6
  } catch {
    return null;
  }
}

/**
 * The same walk, asked of Entur.
 *
 * Valhalla is a public demo server with no key and no promise of being up, and
 * this is the number that decides when someone leaves the house. Entur's OTP3
 * answers the same question from Norwegian OSM data, over a connection the app
 * already depends on for everything else — so it is the second rung rather
 * than a straight line drawn in hope.
 *
 * Takes the fetcher as an argument: this module has stayed free of the
 * ET-Client-Name plumbing, and an import of http.js here would drag the app's
 * whole request layer into a file that is only about geometry.
 */
export async function fetchFootRouteEntur(fetcher, url, fromLL, toLL) {
  const q = '{trip(from:{coordinates:{latitude:' + fromLL.lat + ',longitude:' + fromLL.lon + '}}'
    + 'to:{coordinates:{latitude:' + toLL.lat + ',longitude:' + toLL.lon + '}}'
    + 'modes:{directMode:foot}numTripPatterns:1){tripPatterns{legs{pointsOnLink{points}}}}}';
  try {
    const r = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const pats = data && data.data && data.data.trip && data.data.trip.tripPatterns;
    const pts = pats && pats[0] && pats[0].legs && pats[0].legs[0]
      && pats[0].legs[0].pointsOnLink && pats[0].legs[0].pointsOnLink.points;
    if (!pts) return null;
    return decodePolyline(pts);        // Entur pointsOnLink is precision 5
  } catch {
    return null;
  }
}
