import config from '../config.js';

// Decode Google/OTP3 encoded polyline (precision 5) → [[lat, lon], ...]
function decodePolyline(enc) {
  const pts = [];
  let i = 0, lat = 0, lon = 0;
  while (i < enc.length) {
    let b, shift = 0, result = 0;
    do { b = enc.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = enc.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lon += (result & 1) ? ~(result >> 1) : result >> 1;
    pts.push([lat / 1e5, lon / 1e5]);
  }
  return pts;
}

// Fetch a walking route between two lat/lon points using Entur's OTP3 journey planner
// with directModes:[foot]. This uses OpenStreetMap foot-routing data (footways, paths,
// pedestrian zones) rather than car roads.
// Returns an array of [lat, lon] pairs for L.polyline(), or null on failure.
export async function fetchWalkRoute(fromLL, toLL) {
  const query = '{ trip('
    + 'from:{coordinates:{latitude:' + fromLL.lat + ',longitude:' + fromLL.lon + '}} '
    + 'to:{coordinates:{latitude:' + toLL.lat + ',longitude:' + toLL.lon + '}} '
    + 'modes:{directModes:[foot]} numTripPatterns:1'
    + ') { tripPatterns { legs { legGeometry { points } } } } }';
  try {
    const r = await fetch(config.api.journeyPlanner, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const legs = data.data && data.data.trip && data.data.trip.tripPatterns
      && data.data.trip.tripPatterns[0] && data.data.trip.tripPatterns[0].legs;
    if (!legs || !legs.length) return null;
    // Concatenate all legs (should be one for direct foot routing)
    const pts = [];
    legs.forEach(leg => {
      if (leg.legGeometry && leg.legGeometry.points)
        pts.push(...decodePolyline(leg.legGeometry.points));
    });
    return pts.length ? pts : null;
  } catch {
    return null;
  }
}
