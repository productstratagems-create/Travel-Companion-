// Decode Valhalla encoded polyline (precision 6) → [[lat, lon], ...]
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
    pts.push([lat / 1e6, lon / 1e6]);
  }
  return pts;
}

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
    return decodePolyline(shape);
  } catch {
    return null;
  }
}
