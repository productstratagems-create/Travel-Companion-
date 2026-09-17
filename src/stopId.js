/**
 * One name for one stop. A LEAF MODULE ON PURPOSE.
 *
 * It imports nothing, so anything may import it — including api/usage.js,
 * whose own doc comment says in as many words that it imports only storage,
 * because a file with no imports cannot land in an import cycle. Putting this
 * rule in geo.js would have forced usage.js to pull in state, config, http and
 * the logger to ask whether two stops are the same stop. The rule is four
 * lines; the dependency would have been the whole app.
 *
 * geo.js re-exports both under the names the codebase already uses.
 */

/**
 * ONE NAME FOR ONE STOP.
 *
 * The recurring fault of this codebase, in its worst instance yet. The mapping
 * for v1.107.0 found not two rules for «the same stop» but FOUR RECIPES across
 * nine places:
 *
 *   A  lowercase + cut at the first comma        normStopName, plan.js
 *   B  A, plus strip a trailing « T»             selected.js, track.js
 *   C  lowercase + strip « T», comma KEPT        auto.js ×2, board.js
 *   D  lowercase + trim only                     usage.js, settings.js ×3
 *
 * «Ryen T» and «Ryen» are one stop under B and C and two under A and D.
 * «Skullerud, Oslo» and «Skullerud» are one under A and B and two under C and
 * D. Both are real names from real answers — the geocoder appends the
 * municipality, and Oslo's metro stops carry the T. So the app's answer to
 * «have I been here before» depended on which screen asked.
 *
 * B WINS because A, C and D are each an incomplete B: every one of them is
 * missing a clause B has, and none has a clause B lacks. Choosing the union is
 * therefore not a new rule — it is the rule three screens were already trying
 * to write.
 *
 * Order matters: the comma is cut BEFORE the T is stripped, so «Ryen T, Oslo»
 * reduces the same as «Ryen T». The other order would leave the comma clause
 * protecting the T from the strip.
 */
export function stopKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/,.*$/, '')
    .replace(/\s+t$/i, '')
    .trim();
}

/**
 * Kept as the name the codebase already uses in nine places. It is stopKey.
 *
 * Not deleted in favour of a rename: a rename of this size is a diff nobody
 * can read, and the point of this release is that there is ONE definition, not
 * that it has a particular spelling.
 */
export const normStopName = stopKey;

/**
 * Are these two the same stop?
 *
 * The predicate, in exactly the shape `sameLine` has (api/situations.js:45) —
 * because that shape was argued out in v1.105.0 and is right: null-guard, the
 * strong key when BOTH sides have it, the weak key as the fallback, and TWO
 * MISSING KEYS ARE NOT A MATCH. Two unknowns are not the same thing.
 *
 * Takes objects, not loose strings, and reads the id from either `id` or
 * `stopId`: the history records store it under `stopId` and the live responses
 * under `id`, which is by itself enough to make a rule that reads only one of
 * them answer no to a stop it has seen a hundred times.
 */
export function sameStop(a, b) {
  if (!a || !b) return false;
  const ai = a.id || a.stopId || null, bi = b.id || b.stopId || null;
  if (ai && bi) return ai === bi;
  const an = stopKey(a.name), bn = stopKey(b.name);
  return !!an && an === bn;
}

/**
 * The FORGIVING search: does this list hold that stop?
 *
 * Deliberately NOT sameStop over a list, and the difference is the whole
 * reason both exist. sameStop says an id mismatch settles it — right when
 * comparing two live objects from one answer. Here the two sides come from
 * different times: `t.route` carries a stopId saved months ago and nothing
 * rewrites it, and Entur's stop-place ids DO move. So a mismatch must not veto
 * the name.
 *
 * Two passes, not one per candidate, because the order is «any id match beats
 * every name match» — checking id-then-name per candidate would let the first
 * list entry with a matching name win over a later one with a matching id.
 *
 * Trying to force this into sameStop's shape broke
 * tests/walkActive.test.js:40 — the test that encodes exactly this
 * requirement, written when v1.76.0 lost the walk time for every saved route.
 * Two questions that differ are two functions, not one with a flag.
 */
export function findStop(list, want) {
  const arr = Array.isArray(list) ? list : [];
  if (!want) return null;
  const id = want.id || want.stopId || null;
  if (id) {
    const byId = arr.find(s => s && s.id && s.id === id);
    if (byId) return byId;
  }
  const n = stopKey(want.name);
  if (!n) return null;
  return arr.find(s => s && stopKey(s.name) === n) || null;
}
