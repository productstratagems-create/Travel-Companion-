const OSRM = 'https://router.project-osrm.org/route/v1/foot';

// Fetch a walking route between two lat/lon points via OSRM.
// Returns an array of [lat, lon] pairs suitable for L.polyline(), or null on failure.
export async function fetchWalkRoute(fromLL, toLL) {
  try {
    const url = OSRM + '/' + fromLL.lon + ',' + fromLL.lat + ';' + toLL.lon + ',' + toLL.lat
      + '?overview=full&geometries=geojson';
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const data = await r.json();
    const coords = data.routes && data.routes[0] && data.routes[0].geometry && data.routes[0].geometry.coordinates;
    if (!coords || !coords.length) return null;
    return coords.map(c => [c[1], c[0]]); // GeoJSON [lon,lat] → Leaflet [lat,lon]
  } catch {
    return null;
  }
}
