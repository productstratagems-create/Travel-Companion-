import { stopKey } from '../stopId.js';

/**
 * Which of the geocoder's ten answers did you mean?
 *
 * The geocoder is this app's weakest link, and the ranking it gets today is
 * one line: transit results first, then whatever order Entur returned. So
 * «Ski» — a station the reader uses twice a day — can sit below «Skien» and
 * «Skippergata», and «Storaas» can resolve to somewhere in another county.
 * A wrong pick here is not a wrong list; it is a journey planned to the
 * wrong town.
 *
 * Four signals, each named, each bounded, all of them things the app already
 * knows and has never used together:
 *
 *   1. how well the label matches what was typed
 *   2. whether the reader has been there, and how recently
 *   3. how far it is from where they are
 *   4. whether it is a transit place at all
 *
 * NOT A MODEL, for the reason api/askParse.js records: a static bundle
 * cannot hold an API key, and destinations are the last data that should
 * leave the phone. Every signal here is already on the device.
 *
 * TWO RULES THIS MUST NOT BREAK. It never removes a result — reordering a
 * list the reader can still see through is recoverable; hiding the one
 * right answer is not. And it explains itself: `why` carries the reason, so
 * «ofte brukt» stands beside the row instead of the reader wondering why
 * this one is on top. The app has computed that fact for releases and spent
 * it on sort order alone.
 */

/** How well the label answers what was typed. Higher is better. */
export const MATCH = { exact: 3, prefix: 2, word: 1, contains: 0.5, none: 0 };

/**
 * The weights, in one place so the balance is legible rather than smeared
 * across four expressions.
 *
 * MATCH OUTWEIGHS ALL THE OTHERS TOGETHER, and that is the whole rule:
 * familiarity breaks a tie, it never overrules what the reader actually
 * typed. It was 10 against 6+2+4+3, which reads as dominant and is not —
 * the browser probe typed «Skippergata» in full and got «Ski stasjon»,
 * because a place used fourteen times beat an exact match by one point.
 * The unit test passed: it compared match against each other weight
 * SEPARATELY, which is not the claim the comment was making.
 *
 * `matchDominates` below binds the two, so the next person to tune a
 * weight cannot quietly break it.
 */
export const W = { match: 16, used: 6, recent: 2, near: 4, transit: 3 };

/** The invariant the weights exist to satisfy. */
export function matchDominates(w) {
  const x = w || W;
  return x.match > (x.used + x.recent + x.near + x.transit);
}

/** Used within this many days counts as recent. */
export const RECENT_DAYS = 14;
/** Above this many uses, more uses say nothing new. */
export const USED_SATURATES = 5;
/** Within this, «nær deg» is worth saying. */
export const NEAR_KM = 1.5;

function km(a, b) {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(b.lat)) return null;
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * How the label answers the query.
 *
 * `stopKey` (v1.107.0) is the normaliser, not a local lowercase: it drops
 * the «, Oslo» suffix and the trailing T, so «Ryen T» typed as «Ryen» is an
 * exact match rather than a prefix — which is the difference between the
 * stop you meant and the one two kilometres away.
 */
export function matchKind(query, label) {
  const q = stopKey(query), l = stopKey(label);
  if (!q) return 'none';
  if (l === q) return 'exact';
  if (l.startsWith(q)) return 'prefix';
  if (l.split(/[\s,]+/).some(w => w === q)) return 'word';
  if (l.includes(q)) return 'contains';
  return 'none';
}

/** Uses of this place from the reader's own history, by name. */
function usesOf(freq, label) {
  const k = stopKey(label);
  const hit = (freq || []).find(p => p && stopKey(p.name) === k);
  return hit || null;
}

/**
 * Score one candidate.
 *
 * @returns {{score:number, why:string|null, parts:object}}
 *   `parts` is kept so a test can pin one signal without asserting on the
 *   total, and so a surprising order can be read rather than guessed at.
 */
export function scorePlace(r, ctx) {
  const c = ctx || {};
  const now = Number.isFinite(c.now) ? c.now : Date.now();
  const kind = matchKind(c.query, r.label);
  const used = usesOf(c.freq, r.label);
  const count = used ? (used.count || 0) : 0;
  const days = used && used.lastUsed ? (now - used.lastUsed) / 86400000 : Infinity;
  const d = km(c.here, r);

  const parts = {
    match: MATCH[kind] / MATCH.exact,
    used: Math.min(1, count / USED_SATURATES),
    recent: days <= RECENT_DAYS ? 1 : 0,
    // Damped, not linear: the difference between 200 m and 2 km matters;
    // between 40 km and 60 km it does not.
    near: d == null ? 0 : 1 / (1 + d / 2),
    transit: r.id ? 1 : 0,
  };
  const score = Object.keys(W).reduce((a, k) => a + W[k] * parts[k], 0);

  // ONE reason, the strongest, in the reader's terms. A row carrying three
  // badges explains nothing; it just takes the space the name needed.
  let why = null;
  if (count >= 3) why = 'ofte brukt';
  else if (count >= 1) why = 'brukt før';
  else if (d != null && d <= NEAR_KM) why = 'nær deg';

  return { score, why, parts, kind };
}

/**
 * Reorder — never filter.
 *
 * Stable: equal scores keep the geocoder's own order, so this can only move
 * things for a reason it can name.
 */
export function rankPlaces(list, ctx) {
  const scored = (list || []).map((r, i) => ({ r, i, s: scorePlace(r, ctx) }));
  scored.sort((a, b) => (b.s.score - a.s.score) || (a.i - b.i));
  return scored.map(({ r, s }) => (s.why ? { ...r, why: s.why } : { ...r }));
}
