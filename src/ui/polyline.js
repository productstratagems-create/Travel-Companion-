/**
 * Google encoded polyline → [[lat, lon], ...].
 *
 * Two callers with two precisions: Valhalla returns precision 6 for the
 * walking route, OTP/Entur returns precision 5 for a transit leg's real
 * alignment. Getting the precision wrong does not throw — it silently puts
 * the line ten degrees away — so it is an argument rather than a constant,
 * and both cases are tested.
 */
export function decodePolyline(enc, precision) {
  if (!enc || typeof enc !== 'string') return [];
  const factor = Math.pow(10, precision == null ? 5 : precision);
  const pts = [];
  let i = 0, lat = 0, lon = 0;
  while (i < enc.length) {
    let b, shift = 0, result = 0;
    do { b = enc.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = enc.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lon += (result & 1) ? ~(result >> 1) : result >> 1;
    pts.push([lat / factor, lon / factor]);
  }
  return pts;
}
