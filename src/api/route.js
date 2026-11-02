import { decodePolyline } from '../ui/polyline.js';
import { REQUEST_TIMEOUT_MS } from './http.js';

/**
 * Hva Valhalla blir bedt om: KORTESTE gangvei.
 *
 * Rapportert med skjermbilde: «Rutevalget for gange velger ikke korteste
 * gangvei» — en omvei gjennom boliggatene i stedet for gangveien.
 *
 * Her sto en «trygghetspreferanse» med fire faktorer, og alle fire var
 * SNUDD. I Valhallas pedestrian-kostnad er faktorene multiplikatorer på
 * kostnaden: over 1 gjør en vei dyrere, under 1 billigere.
 *
 *     walkway_factor   1.5   «prefer walkways»   → gangveier UNNGÅTT   (std. 1.0)
 *     sidewalk_factor  1.4   «prefer a pavement» → fortau UNNGÅTT     (std. 1.0)
 *     alley_factor     0.3   «stay out of alleys» → smug FORETRUKKET  (std. 2.0)
 *     driveway_factor  0.3                       → innkjørsler FORETRUKKET (std. 5.0)
 *
 * Testen som skulle passe på dem krevde nettopp disse retningene, og sto
 * grønn. Ruta valgte gater og innkjørsler framfor gangstien, og den målte
 * lengden — som styrer «N min gange» og hva som strykes — ble for lang.
 *
 * `shortest` er Valhallas eget valg for ren avstand, og det er det du ba om.
 * Faktorene er fjernet, ikke snudd: snudd ville de gitt en preferanse som
 * kan gi lengre ruter. Kan ikke prøves herfra — sandkassen når ikke Valhalla.
 */
export const WALK_COSTING = {
  shortest: true,
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
      // Tallet bor i `http.js` nå; dette var det eneste stedet i appen som
      // hadde et, og de to andre manglet det helt.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
