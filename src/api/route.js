import { decodePolyline } from '../ui/polyline.js';

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
