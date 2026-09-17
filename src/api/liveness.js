/**
 * What underveis knows about its own data — and when it knows nothing.
 *
 * The reported shape of this release: the tracking screen is SILENT in every
 * failure it can have. Three of them, all invisible today:
 *
 *   1. A CANCELLED JOURNEY YOU ARE SITTING ON. `trackGQL` never asked for
 *      `cancellation`, so «innstilt» could not be shown even in principle —
 *      the screen went on counting minutes to an arrival that will not happen.
 *   2. NO NEWS. `_fetchTrack` catches its errors into a log line the reader
 *      cannot see. Eight minutes of failed polls and one second look exactly
 *      alike: the same countdown, ticking down from cached numbers.
 *   3. OFFLINE. The board has said «Ingen nettforbindelse» since v1.60; the
 *      tracking screen has never said it.
 *
 * ONE DEFINITION, TWO SCREENS. The board already had the freshness rule —
 * `STALE_AFTER_MS = 60_000` and a stamp reading «ikke sanntid nå»
 * (board.js:2332). It was right, and it lived in a function that renders a
 * specific element on a specific screen, so underveis could not reach it. The
 * constant and the judgement move HERE and the board derives its stamp from
 * them, rather than a second copy being written next to the second screen.
 *
 * Pure, so «how old is too old» can be tested without a browser, a clock or a
 * network.
 */

/**
 * Past this, a countdown computed from the last answer is no longer realtime.
 * Underground the connection drops without an error and the numbers keep
 * ticking, which is precisely the case the board chose this number for.
 */
export const STALE_AFTER_MS = 60_000;

/**
 * Past this, «slightly old» has become «we have lost the feed». The polls run
 * every `trackRefreshMs` (20s), so this is roughly two dozen missed answers —
 * long past coincidence, and long enough that a reader deciding whether to get
 * off needs to be told the screen is guessing.
 */
export const DEAD_AFTER_MS = 8 * 60_000;

/** The kinds, in the order of how much they should worry a reader. */
export const LIVE_KINDS = ['fersk', 'venter', 'gammel', 'tapt', 'borte', 'frakoblet'];

/**
 * How much to trust what is on the screen right now.
 *
 * @param {{fetchedAt: number|null, now: number, online?: boolean,
 *          failures?: number}} o
 *   `fetchedAt` is when an answer last ARRIVED — not when one was last asked
 *   for. A request in flight is not news.
 * @returns {{kind: string, ageMs: number|null, ageMins: number|null,
 *            live: boolean, label: string}}
 */
export function liveness(o) {
  const c = o || {};
  const now = Number.isFinite(c.now) ? c.now : Date.now();
  const at = Number.isFinite(c.fetchedAt) ? c.fetchedAt : null;
  // A clock that jumped backwards, or a timestamp from the future, is not
  // freshness — treat it as no age at all rather than as very fresh.
  const ageMs = at == null ? null : Math.max(0, now - at);
  const ageMins = ageMs == null ? null : Math.floor(ageMs / 60000);

  // OFFLINE OUTRANKS AGE, even a fresh answer. `navigator.onLine === false` is
  // one of the few things the browser states rather than infers, and it names
  // the cause where age only names the symptom. It does NOT outrank
  // «cancelled»: that is a fact about the journey, not about the connection,
  // and it is rendered separately for exactly that reason.
  if (c.online === false) {
    return mk('frakoblet', ageMs, ageMins,
      'ingen nettforbindelse' + (ageMins != null ? ' · sist ' + agoText(ageMins) : ''));
  }

  // NOTHING HAS ARRIVED YET. Distinct from old data, and the distinction
  // matters: an empty screen that is still working looks identical to one that
  // has given up.
  if (at == null) {
    // TWO SENTENCES, NOT ONE. «Still working» and «has already failed» were
    // the same kind in the first cut of this module, and the probe showed what
    // that costs: a real failure printed in the dimmest colour on the screen,
    // because one kind can only have one style. Separating them here is what
    // lets the CSS disagree about them.
    return c.failures > 0
      ? mk('tapt', null, null, 'får ikke kontakt med Entur')
      : mk('venter', null, null, 'henter sanntid …');
  }

  if (ageMs > DEAD_AFTER_MS) {
    // «ingen nytt på 9 min», not «ingen nytt på for 9 min siden»: the
    // preposition is already in the sentence, so this one takes the duration
    // bare while «sist …» above takes the whole phrase.
    return mk('borte', ageMs, ageMins, 'ingen nytt på ' + ageMins + ' min');
  }

  if (ageMs > STALE_AFTER_MS) {
    return mk('gammel', ageMs, ageMins, 'ikke sanntid nå · sist ' + agoText(ageMins));
  }

  return mk('fersk', ageMs, ageMins, 'sanntid');
}

function mk(kind, ageMs, ageMins, label) {
  return { kind, ageMs, ageMins, live: kind === 'fersk', label };
}

/**
 * «for 3 min siden», and «nå nettopp» under a minute.
 *
 * Whole minutes, floored — the same reading the board's clock stamp gives, so
 * a reader glancing between the two screens is not told two different ages for
 * one fetch.
 */
export function agoText(mins) {
  if (!Number.isFinite(mins) || mins <= 0) return 'nå nettopp';
  return 'for ' + mins + ' min siden';
}

/**
 * Is the leg you are riding cancelled?
 *
 * Transmodel marks cancellation PER CALL, not per journey: an operator can
 * cancel the tail of a run and leave the first half operating. So «is my trip
 * cancelled» is not «does this journey contain a cancelled call» — it is
 * whether the two calls that are YOURS are cancelled: the one you board at and
 * the one you get off at. A cancelled call in the middle, between neither, is
 * someone else's problem and must not blank your screen.
 *
 * Matching by name, because that is the only handle a stored leg has —
 * `fromStation`/`toStation` are names, and `findArr` in track.js matches the
 * same way. Named here so the rule has one home; the comparison itself is
 * deliberately the loose one the rest of the screen already uses.
 *
 * @returns {{cancelled: boolean, at: string|null}} `at` names WHERE, because
 *   «innstilt» without a place is a sentence a reader cannot act on.
 */
export function legCancelled(calls, fromName, toName) {
  const list = Array.isArray(calls) ? calls : [];
  const nameOf = (c) => {
    const sp = c && c.quay && c.quay.stopPlace;
    return (sp && sp.name) || (c && c.name) || '';
  };
  const same = (a, b) => !!a && !!b
    && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

  for (const c of list) {
    if (!c || !c.cancellation) continue;
    const n = nameOf(c);
    if (same(n, fromName) || same(n, toName)) return { cancelled: true, at: n || null };
  }

  // A run cancelled in its entirety carries the flag on every call, including
  // ones we could not name — so a journey whose calls are ALL cancelled counts
  // even when neither endpoint matched.
  if (list.length && list.every(c => c && c.cancellation)) {
    return { cancelled: true, at: null };
  }
  return { cancelled: false, at: null };
}
