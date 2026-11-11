/**
 * Går denne veien mot sentrum, eller fra?
 *
 * «Hvor skal du?» on auto-reise lists every direction leaving your stop —
 * at Hauketo that is eight rows of «mot Lysaker», «mot Ski», «mot Stabekk»,
 * «mot Fornebu», «mot Brenna». Each is correct and none of them answers the
 * question a person actually holds, which is almost always one of two:
 * **inn til byen, eller ut fra den.**
 *
 * ── THE PART THAT HAD TO BE GOT RIGHT ────────────────────────────
 *
 * There is no safe global «centre». `geo.js` carries that scar: Oslo S was
 * written into six geocoder URLs and one validity radius, «every search in
 * Norway leaned towards Oslo and a destination typed in Bergen was discarded
 * 306 km outside a circle the reader could not move». It is named
 * FALLBACK_FOCUS there precisely because it is a LAST RESORT.
 *
 * So this module refuses rather than guesses:
 *
 *   - beyond CENTRE_MAX_KM from the centre it knows, every answer is `null`
 *     and the screen stays exactly as it is today
 *   - standing AT the centre, «mot sentrum» means nothing, so again `null`
 *   - a direction that neither approaches nor recedes by a real margin is
 *     `null` too — a tangential line does not get a label to make the
 *     grouping look complete
 *
 * Silence is the honest answer for all three. A wrong «mot sentrum» sends
 * someone the opposite way.
 *
 * ── THE SIGNAL ───────────────────────────────────────────────────
 *
 * The CLOSEST APPROACH along the onward stops, not the terminus. From
 * Hauketo the train to Lysaker runs through the middle of town and out the
 * other side; judged by its destination alone it would look like any other
 * suburb. Judged by where the journey takes you, it passes the centre — and
 * that is what the reader is asking about.
 */

/**
 * The centre this module reasons about — and the app's ONE copy of it.
 *
 * `geo.js` used to own the coordinate as `FALLBACK_FOCUS`; it now imports it
 * from here and re-exports it under that name, so every existing caller is
 * untouched and there is still exactly one pair of numbers. The direction
 * was inverted rather than copied because this module must import NOTHING:
 * `geo.js` pulls in `config.js` and `state.js`, and a file with no imports
 * of its own cannot land in an import cycle — the reason `api/stopCats.js`
 * and `api/usage.js` are shaped the same way.
 *
 * Six copies of this coordinate once decided which half of the country a
 * search could see. There is one.
 */
export const CENTRE = { lat: 59.9139, lon: 10.7522 };

/**
 * BYENES SENTRUM (v1.218.41). Rapportert ved gjennomgang av Bergen: med Oslo
 * som eneste sentrum svarte `centreward` null for hvert stopp mer enn 40 km
 * unna, og «mot sentrum» fantes ikke i Bergen. Profilens «sentrum» pekte til
 * Oslo, 300 km unna. Nå: nærmeste bysentrum innenfor CENTRE_MAX_KM.
 * `CENTRE` er fortsatt Oslo og fortsatt søkets reservefokus.
 */
export const SENTRA = [
  { by: 'Oslo', lat: CENTRE.lat, lon: CENTRE.lon },
  { by: 'Bergen', lat: 60.3913, lon: 5.3221 },       // Byparken
  { by: 'Trondheim', lat: 63.4305, lon: 10.3951 },   // Torvet
  { by: 'Stavanger', lat: 58.9700, lon: 5.7331 },    // Torget
];

/** Sentrum i byen du er i, eller null utenfor alle. */
export function sentrumFor(p) {
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
  let best = null, bestKm = Infinity;
  for (const s of SENTRA) { const d = kmTo(p, s); if (d != null && d < bestKm) { best = s; bestKm = d; } }
  return bestKm <= CENTRE_MAX_KM ? best : null;
}

/** Beyond this, the app does not know where «sentrum» is, and says so by saying nothing. */
export const CENTRE_MAX_KM = 40;
/** Inside this you are already there, and the question does not arise. */
export const AT_CENTRE_KM = 1.5;
/**
 * How much closer a journey must come before it counts as «mot sentrum».
 *
 * Without a margin a line that wobbles two hundred metres towards town gets
 * a confident label. The number is a distance rather than a ratio so it
 * behaves the same at 3 km out and at 30.
 */
export const MIN_GAIN_KM = 1.2;

export function kmTo(a, b) {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(b.lat)) return null;
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * @param {{lat:number, lon:number}} from   the stop you are standing at
 * @param {Array<{lat:number, lon:number}>} stops  the onward stops, in order
 * @returns {'mot'|'fra'|null}
 */
export function centreward(from, stops) {
  const S = sentrumFor(from);
  if (!S) return null;
  const here = kmTo(from, S);
  if (here == null || here > CENTRE_MAX_KM || here < AT_CENTRE_KM) return null;

  const ds = (stops || [])
    .map(s => kmTo(s, S))
    .filter(d => d != null);
  if (!ds.length) return null;

  // The nearest the journey ever gets — the line through town counts as
  // towards it even when its terminus is another suburb.
  const closest = Math.min(...ds);
  if (closest <= here - MIN_GAIN_KM) return 'mot';

  // Away only if it keeps going away. The LAST stop, not the closest: a
  // journey that dips towards town and then leaves is not «fra sentrum» in
  // any useful sense, and it has already failed the test above.
  const end = ds[ds.length - 1];
  if (end >= here + MIN_GAIN_KM) return 'fra';

  return null;
}

/** What the heading says. One place, so the screen cannot invent a third word. */
export const CENTRE_LABEL = { mot: 'mot sentrum', fra: 'fra sentrum' };
