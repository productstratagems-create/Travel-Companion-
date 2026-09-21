import { stopKey } from '../stopId.js';

/**
 * Når skal jeg av — sagt med det appen allerede vet.
 *
 * The «underveis» screen already has a prominent card for this moment, and
 * a strip under the map that says «1 stopp igjen». They do not agree,
 * because they are two facts written down separately — the codebase's
 * signature bug, found about twenty times:
 *
 *   - the CARD appears on a clock threshold (`mLeft > 5` for the final leg,
 *     `> 2` for a transfer) and calls itself «Snart fremme»
 *   - the STRIP counts stops, and says «1 stopp igjen»
 *
 * So the screen can hold a vague «Snart fremme» directly above a precise
 * «1 stopp igjen», and on a tram with 45-second hops five minutes is six
 * stops away while on a train it is the platform you are already at.
 *
 * The first cut of this release added a THIRD statement of the same fact,
 * in a new banner, below the fold. The screenshot killed it: the screen was
 * already saying it three times above the fold. Nothing is added here. The
 * card keeps its timing exactly as it is — that is behaviour this sandbox
 * cannot validate against a real ride — and gains the count it was missing.
 *
 * Pure, and its own module because the count could not be tested where it
 * lived: twenty-five lines inlined in a render function.
 */

/** Within this many stops, the count is the more useful thing to say. */
export const NAME_STOPS = 3;

/**
 * How many stops remain, INCLUDING the one you get off at.
 *
 * So 1 means «the next stop is yours» and 0 means the leg is behind you.
 * Lifted unchanged from views/track.js — behaviour is not what this release
 * changes — except that it now uses `stopKey` by import rather than by a
 * local alias, which is the app's one stop-name recipe (v1.107.0).
 *
 * IT WAS OFF BY ONE, and had been for as long as it existed. The comment
 * above it in track.js said it counted «stops the train is currently AT
 * (just departed) as already visited» — and the code did the opposite: a
 * 30-second grace kept the stop just reached in the remaining count. So the
 * muted tag read «2 stopp» while the strip under the map read «1 stopp
 * igjen», and nobody noticed because the tag was twelve pixels wide and the
 * prominent card said only «Snart fremme».
 *
 * Making the card say the count is what put the two side by side and made
 * the disagreement visible in a screenshot. The strip is the one that is
 * right: standing at a stop, that stop is behind you.
 *
 * `journeyProgress().left` in views/journeyStrip.js is the other count, and
 * tests/alight.test.js binds the two on one fixture — the remedy this
 * codebase applies every time it finds a fact written down twice.
 */
export function stopsUntil(leg, now) {
  if (!leg) return 0;
  const t = Number.isFinite(now) ? now : Date.now();
  if (!leg.stops) return 0;
  const fromN = stopKey(leg.fromStation || '');
  const toN = stopKey(leg.toStation || '');
  let pastFrom = !leg.fromStation, count = 0;
  for (const s of leg.stops) {
    const nm = (s.quay && s.quay.stopPlace && s.quay.stopPlace.name) || '?';
    if (!pastFrom) { if (stopKey(nm) === fromN) pastFrom = true; continue; }
    const isEnd = toN && stopKey(nm) === toN;
    const arr = s.expectedArrivalTime || s.aimedArrivalTime
      || s.expectedDepartureTime || s.aimedDepartureTime;
    // Strictly ahead. A stop whose arrival has passed — including the one
    // the vehicle is standing at this second — is behind you.
    const ahead = !arr || new Date(arr).getTime() > t;
    if (ahead) count++;
    if (isEnd) break;
  }
  return count;
}

/**
 * What the card's eyebrow should say.
 *
 * ONLY the wording — never whether the card appears. The card's clock
 * thresholds are untouched, because «does five minutes' warning feel right
 * on this line» is a question about a real ride and this sandbox cannot
 * answer it. What it can fix is a card saying «Snart fremme» while the
 * strip two centimetres above says «1 stopp igjen».
 *
 * One clean verdict, in the shape of `liveness` (v1.106.0), `posState`
 * (v1.108.0) and `boardState` (v1.122.0): the screen derives its words
 * from `kind`.
 *
 * @param {{stopsLeft:number|null, arriving:boolean, transfer:boolean}} o
 * @returns {{kind:string, label:string}}
 */
export function alightEyebrow(o) {
  const c = o || {};
  const n = Number.isFinite(c.stopsLeft) ? c.stopsLeft : null;
  const off = c.transfer ? 'Bytt' : 'Av';

  // The clock has run out. This outranks the count: a stop list that has
  // not caught up must not talk a reader out of standing up.
  if (c.arriving) return { kind: 'na', label: c.transfer ? 'Bytt her' : 'Gå av nå' };

  // NOT the same as «one stop left». The count is null while the leg's
  // calls have not arrived — a journey restored from storage before the
  // first fetch — and «av ved neste stopp» there would be an invention.
  if (n === null) return { kind: 'snart', label: c.transfer ? 'Bytt her' : 'Snart fremme' };

  if (n <= 1) return { kind: 'neste', label: off + ' ved neste stopp' };
  if (n <= NAME_STOPS) return { kind: 'teller', label: off + ' om ' + n + ' stopp' };

  // Further out than the count usefully says, the card's own timing is the
  // reason it is on screen at all — so it keeps its original words.
  return { kind: 'snart', label: c.transfer ? 'Bytt her' : 'Snart fremme' };
}
