/**
 * The last minute of where you have been — and what it says about where you
 * are going.
 *
 * A LEAF MODULE, like position.js and stopId.js: it imports nothing, so geo.js,
 * the views and the tests can all reach it without dragging the watch, the
 * geocoder and the logger along with them.
 *
 * ── Why this exists ─────────────────────────────────────────────────────
 *
 * Asked: «Hvordan kan Auto-reise utnytte en serie av etterfølgende gps
 * posisjoner … for å sannsynliggjøre hvilken linje vedkommende er interessert
 * i — og dermed veier tyngst når du skal sette verdien for «Du er ved»?»
 *
 * The honest starting point was that there was no series. `_handleFix` sees
 * every fix the device produces and keeps none of them: `state.homeLL` is one
 * EMA-smoothed point, `_stationAnchor` is one point, `posAcc` and `posAt` are
 * one number each. The previous reading does not exist when the next arrives.
 *
 * And `rankStops` ranks on three bands — inside CLOSE_M, used before, else
 * distance — with no notion of DIRECTION at all. A stop you are walking away
 * from and a stop you are walking towards look identical to it.
 *
 * ── What is kept, and what is not ───────────────────────────────────────
 *
 * NOTHING IS WRITTEN TO DISK AND NOTHING LEAVES THE PHONE. The trail lives in
 * memory for as long as the tab does. No new storage key, nothing in the event
 * log, no change to the published promise — a series of positions over time is
 * the most sensitive thing this app could hold, and it holds it for a minute
 * and forgets.
 *
 * A fix TOO NOISY FOR THE DOT IS STILL KEPT HERE, with its accuracy. ACC_GATE
 * discards anything worse than ±40 m for `homeLL` — routine indoors, in a
 * tunnel, in an urban canyon — and a series that inherited that rule would be
 * blind exactly where it is needed. The dot is unchanged; the gate still owns
 * `homeLL`.
 */

/** About a minute at one fix a second — long enough to see a walk turn. */
export const TRAIL_MAX = 12;

/**
 * The shortest span a rate may be computed over.
 *
 * Two fixes a second apart, each ±8 m, can differ by sixteen metres of noise
 * alone — which reads as 16 m/s of "approach". The span, not the count, is
 * what makes the difference real.
 */
export const TRAIL_MIN_MS = 4_000;

/** Below this, in m/s, you are not going anywhere. Slower than a slow walk. */
export const STILL_MS = 0.4;

const R = 6_371_000;
const rad = (d) => (d * Math.PI) / 180;

/** Metres between two points. Own copy so this module imports nothing. */
export function metres(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

const ok = (f) => !!f && Number.isFinite(f.lat) && Number.isFinite(f.lon)
  && Number.isFinite(f.at);

/**
 * Add one fix, oldest first, bounded.
 *
 * Pure: it returns a new list rather than pushing into the old one, so the
 * trail can be held in state and compared by identity when deciding whether
 * anything needs redrawing.
 */
export function pushFix(trail, fix) {
  if (!ok(fix)) return trail || [];
  const out = (trail || []).concat({
    lat: fix.lat, lon: fix.lon, at: fix.at,
    acc: Number.isFinite(fix.acc) ? fix.acc : null,
  });
  return out.length > TRAIL_MAX ? out.slice(out.length - TRAIL_MAX) : out;
}

/**
 * How fast the distance to `target` is changing, in m/s.
 *
 * NEGATIVE MEANS YOU ARE GETTING CLOSER — the sign of a distance's derivative,
 * not of an opinion about it.
 *
 * `null` when the series cannot say: fewer than two fixes, or a span shorter
 * than TRAIL_MIN_MS. That is a real answer and the caller must treat it as
 * one; a screen with no series must look exactly like today's.
 *
 * Endpoints rather than a least-squares fit: two ends four seconds apart carry
 * the same signal here, and a fit would need weights, an intercept and a story
 * about which of them the reader is being shown. When this turns out to be too
 * jittery on a real city walk, THAT is the measurement that justifies a fit.
 */
export function closingRate(trail, target) {
  const t = trail || [];
  if (t.length < 2 || !target
    || !Number.isFinite(target.lat) || !Number.isFinite(target.lon)) return null;
  const a = t[0];
  const b = t[t.length - 1];
  const span = b.at - a.at;
  if (!(span >= TRAIL_MIN_MS)) return null;
  return (metres(b, target) - metres(a, target)) / (span / 1000);
}

/**
 * What the series says about this stop, as a word the screen can print.
 *
 * `kind` is one of:
 *   'mot'       the distance is shrinking faster than standing still
 *   'fra'       it is growing
 *   'staar'     it is barely changing — you are waiting, not passing
 *   'vet-ikke'  the series has nothing to say
 *
 * 'vet-ikke' IS NOT 'fra'. The first must leave the screen alone; the second
 * pushes a stop down the list. A new reader, a fresh tab and a phone on a
 * table are all in the first state, and it is the commonest of the four.
 *
 * `etaS` is given only for 'mot' — an arrival time for a stop you are walking
 * away from would be a number with no meaning, and this app has shipped one of
 * those before.
 */
export function approach(trail, target) {
  const rate = closingRate(trail, target);
  if (rate == null) return { kind: 'vet-ikke', rate: null, etaS: null };
  if (Math.abs(rate) < STILL_MS) return { kind: 'staar', rate, etaS: null };
  if (rate > 0) return { kind: 'fra', rate, etaS: null };
  const t = trail[trail.length - 1];
  return { kind: 'mot', rate, etaS: Math.round(metres(t, target) / -rate) };
}
