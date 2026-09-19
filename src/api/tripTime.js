import { TRIP_SEARCH_WINDOW } from './queries.js';

/**
 * WHEN a journey search is asking about.
 *
 * «Utforsk» used to mean a browser of cafés within a radius of the GPS dot.
 * It now means «what journeys are possible, forward in time, between two
 * places I name» — and the moment a screen can ask about a time that is not
 * now, three facts have to stop being implicit: which times are one tap
 * away, how far ahead we can honestly answer, and what to say when the
 * question falls outside that.
 *
 * Everything here is pure. The horizon is DERIVED from the trip planner's
 * own search window rather than written down a second time: two places
 * recording the same fact is the failure shape this codebase has produced
 * about twenty times, and a horizon that promised more than `searchWindow`
 * could deliver would be exactly that failure with a friendly face.
 */

/**
 * TWO horizons, because they are two facts.
 *
 * This shipped as one and the browser probe caught it within the hour: the
 * reported journey — Storaas → Oslo S, bus 415 on Monday 07:05, forty-six
 * hours out — was REFUSED by the screen built to find it. The rule was
 * correct and fed a context that made it vacuous, which is the second
 * failure shape this codebase keeps producing.
 *
 * `searchWindow` is how far a single search SCANS FORWARD FROM ITS OWN
 * `dateTime`. Entur's measured ceiling is PT48H on that argument. It says
 * nothing about how far ahead the `dateTime` itself may point, and the trip
 * home has been sending an arbitrary instant for releases.
 */

/** How far one search scans forward from the instant it is given. */
export const TRIP_SCAN_MINS = TRIP_SEARCH_WINDOW;

/**
 * How far ahead the reader may point, IN DAYS.
 *
 * A product decision, not an API limit, and named as one: planned timetables
 * thin out beyond a week, and a date picker with no ceiling invites the
 * question «lørdag om to måneder» that no answer will be true for by then.
 * A week covers the case this release exists for — «no service this
 * weekend, when does the next bus go» — with room to spare.
 *
 * NOT VERIFIABLE FROM HERE: how far ahead Entur's planned data actually
 * reaches. The sandbox cannot ask. A search past the data returns an empty
 * list, which is why the empty answer below says which window it is about.
 */
export const TRIP_PICK_HORIZON_DAYS = 7;
export const TRIP_PICK_HORIZON_MINS = TRIP_PICK_HORIZON_DAYS * 24 * 60;

const MIN = 60_000;

/** Today's date at hh:mm, offset by whole days. */
function at(now, hh, mm, dayOffset) {
  const d = new Date(now);
  d.setDate(d.getDate() + (dayOffset || 0));
  d.setHours(hh, mm, 0, 0);
  return d.getTime();
}

/**
 * The times worth one tap.
 *
 * `ms: null` means «now» — the absence of a dateTime, not a timestamp equal
 * to this instant, because `fetchTrip` plans from slightly in the past on
 * purpose and a literal now would throw away the departure standing at the
 * platform.
 *
 * «i kveld» is dropped once the evening has started rather than offered as a
 * time in the past: a choice that means «now, but spelled differently» is
 * worse than one fewer choice. At 23:30 «i morgen tidlig» is still tomorrow
 * morning, which is why it is computed from the date and not from `now + n`.
 */
export function quickTimes(now) {
  const t = now == null ? Date.now() : now;
  const out = [{ key: 'na', label: 'nå', ms: null }];
  const kveld = at(t, 18, 0, 0);
  if (kveld > t) out.push({ key: 'kveld', label: 'i kveld', ms: kveld });
  out.push({ key: 'morgen', label: 'i morgen tidlig', ms: at(t, 7, 0, 1) });
  return out;
}

/**
 * Can we answer about this instant at all?
 *
 * A time in the past is not a search we can run, and a time past the horizon
 * would come back as an empty list that reads like «there are no journeys» —
 * the v1.122.0 mistake in a new place.
 */
export function withinHorizon(ms, now) {
  const t = now == null ? Date.now() : now;
  if (ms == null) return true;
  if (!Number.isFinite(ms)) return false;
  return ms >= t && ms <= t + TRIP_PICK_HORIZON_MINS * MIN;
}

/**
 * Say which kind of «no» this is — never silence.
 *
 * Returns null when the time is answerable, so the caller can use it as the
 * whole test. `kind` carries the meaning; the screen may phrase it.
 */
export function horizonText(ms, now) {
  const t = now == null ? Date.now() : now;
  if (ms == null) return null;
  if (!Number.isFinite(ms)) return { kind: 'ugyldig', label: 'Velg et tidspunkt.' };
  if (ms < t) return { kind: 'fortid', label: 'Det tidspunktet har passert.' };
  if (ms > t + TRIP_PICK_HORIZON_MINS * MIN) {
    return {
      kind: 'utenfor',
      label: 'Vi kan bare svare ' + TRIP_PICK_HORIZON_DAYS
        + ' dager fram. Velg et tidligere tidspunkt.',
    };
  }
  return null;
}

/** `datetime-local` wants a local ISO without a zone; `toISOString` is UTC. */
export function localInputValue(ms) {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/** And back. Parsed as LOCAL time, which `new Date(string)` does for this shape. */
export function parseLocalInput(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(v || ''));
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0).getTime();
}
