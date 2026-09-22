/**
 * Which traffic messages are about YOUR journey.
 *
 * Reported with a screenshot from the underveis screen. The reader was on
 * metro line 3 toward Jernbanetorget, and the banner said:
 *
 *   «Avgangen fra Bjørndal kl. 08:10 i retning Jernbanetorget er ca. 22
 *    minutter forsinket. Dette skyldes en ulykke.»
 *
 * Bjørndal is a BUS destination. The message was about a different departure
 * entirely.
 *
 * THREE STRUCTURAL CAUSES, and this module addresses the one that is about
 * judgement. The other two are a banner that lives outside every screen and a
 * fetch that threw away where each message came from; both are fixed at their
 * own call sites.
 *
 * A SITUATION CARRIES NO IDENTIFIERS OF ITS OWN. sitsGQL asks for id, summary,
 * description, advice, severity and validityPeriod — and nothing that says
 * which line or stop the message is about. So there are exactly two handles:
 *
 *   `affects`  what Entur says the message is about. Asked for as a probe,
 *              because the field names cannot be checked from a sandbox that
 *              cannot reach api.entur.io. Absent on a rejection.
 *   `_from`    WHERE THE MESSAGE HUNG when it was fetched — the stop, the leg,
 *              the service journey. That information exists for one moment in
 *              fetchTrip and used to be discarded by a Map keyed on id alone.
 *
 * Matching on the TEXT was never an option: it would have been guesswork, and
 * it would have become this codebase's fourth parallel definition of «the same
 * line».
 */
// Journey ids are compared through normJid — codespace casing varies. It used
// to be COPIED into this file, byte for byte, directly under a comment saying
// the ids go through normJid. v1.107.0 made that true.
import { normJid } from './queries.js';

/**
 * One line is the same line as another.
 *
 * The genuinely missing helper. When this was written there were two rules for
 * «the same stop» and two for «the same journey» — and for lines, board.js
 * compared raw publicCodes while auto.js preferred line.id. A third caller
 * would have invented a fourth.
 *
 * v1.107.0 paid the rest of that debt off: stopId.js now holds the one stop
 * rule (it turned out to be four recipes across nine places, not two), and
 * _sameDep compares through normJid.
 *
 * Id first, publicCode as the fallback, and TWO MISSING IDS ARE NOT A MATCH —
 * the same shape, and the same reasoning, as sameStop.
 */
export function sameLine(a, b) {
  if (!a || !b) return false;
  const ai = a.id || null, bi = b.id || null;
  if (ai && bi) return ai === bi;
  const ac = a.publicCode != null ? String(a.publicCode) : null;
  const bc = b.publicCode != null ? String(b.publicCode) : null;
  return !!ac && ac === bc;
}

const asSet = (v) => (v instanceof Set ? v : new Set(v || []));

/**
 * Everything a situation says, or is known, to be about.
 *
 * UNION, NOT REPLACEMENT. `affects` is what Entur declares; `_from` is where
 * we found it. A message can arrive attached to your leg AND name a line, and
 * both facts are worth keeping — letting one overwrite the other would throw
 * away the very provenance this release exists to preserve.
 *
 * @returns {{lines: Set<string>, stops: Set<string>, journeys: Set<string>,
 *            namesLines: boolean}}
 */
export function situationScope(s) {
  const from = (s && s._from) || {};
  const lines = new Set(asSet(from.lines));
  const stops = new Set(asSet(from.stops));
  const journeys = new Set(asSet(from.journeys));

  // `affects` is a probe: absent whenever the query was rejected, so every
  // read of it has to survive it not being there at all.
  let namesLines = false;
  (s && Array.isArray(s.affects) ? s.affects : []).forEach(a => {
    if (!a) return;
    if (a.line && a.line.id) { lines.add(a.line.id); namesLines = true; }
    if (a.stopPlace && a.stopPlace.id) stops.add(a.stopPlace.id);
    if (a.quay && a.quay.stopPlace && a.quay.stopPlace.id) stops.add(a.quay.stopPlace.id);
    if (a.serviceJourney && a.serviceJourney.id) journeys.add(normJid(a.serviceJourney.id));
  });

  return { lines, stops, journeys, namesLines };
}

/**
 * Which messages belong to which line.
 *
 * Reported with a screenshot of auto-reise at Jernbanetorget: four traffic
 * messages filled the screen above «du er ved», the map and every departure.
 * All four named specific lines — trams 12 and 15, line 17, tram 18 — and the
 * reader had not chosen a line yet.
 *
 * THE RULE FROM v1.105.0 WAS RIGHT AND ITS CONTEXT MADE IT EMPTY. auto.js
 * passed «the lines that actually leave from here» as the reader's own lines.
 * At Mortensrud that is three lines and the filter works. At Jernbanetorget it
 * is every line in Oslo, so every message matched and nothing was ever folded.
 *
 * What the reader needs before they have chosen anything is not a wall of
 * text: it is to know which DEPARTURE a disruption changes. So the messages
 * are handed to the rows instead — one mark on the line it concerns, where the
 * choice is actually made.
 *
 * @param {Array} list  active situations
 * @returns {Map<string, Array>} line id → the messages naming that line
 */
export function byLine(list) {
  const out = new Map();
  (list || []).forEach(s => {
    if (!s) return;
    situationScope(s).lines.forEach(id => {
      if (!out.has(id)) out.set(id, []);
      const at = out.get(id);
      if (!at.includes(s)) at.push(s);
    });
  });
  return out;
}

/**
 * Is this message about the journey the reader is looking at?
 *
 * @param {object} s   a situation
 * @param {{lineIds?: string[], journeyIds?: string[], stopIds?: string[]}} ctx
 *        what THIS screen knows it is showing
 * @returns {'mine'|'other'}
 */
export function relevance(s, ctx) {
  const c = ctx || {};
  const mineLines = new Set((c.lineIds || []).filter(Boolean));
  const mineStops = new Set((c.stopIds || []).filter(Boolean));
  const mineJourneys = new Set((c.journeyIds || []).filter(Boolean).map(id => normJid(id)));
  const scope = situationScope(s);

  // Your own service journey settles it, whatever else the message mentions.
  for (const j of scope.journeys) if (mineJourneys.has(j)) return 'mine';

  const lineHit = [...scope.lines].some(l => mineLines.has(l));
  if (lineHit) return 'mine';

  // RULE 1, AND THE WHOLE POINT. A message that names lines and names none of
  // yours is not yours — even though it hung on a stop you pass through. That
  // is the reported case exactly: the Bjørndal message hung on Jernbanetorget,
  // which the reader WAS travelling to, but it is about line 71.
  //
  // Only `affects` can say this. Without it namesLines is false, this branch
  // never fires, and a stop match still counts — today's behaviour, not worse.
  if (scope.namesLines) return 'other';

  for (const st of scope.stops) if (mineStops.has(st)) return 'mine';

  // Nothing known about it, and nothing matched: an unscoped message is shown
  // rather than buried. We cannot prove it is irrelevant either.
  if (!scope.lines.size && !scope.stops.size && !scope.journeys.size) return 'mine';

  return 'other';
}

/**
 * The same list, in two piles.
 *
 * NOTHING IS DROPPED — mine.length + other.length always equals what came in.
 * Our matching rests on provenance and on a field we cannot verify from here,
 * and hiding a real closure because we could not prove it was relevant is the
 * expensive mistake. The second pile is folded to one line, not deleted.
 */
export function splitSituations(list, ctx) {
  const mine = [], other = [];
  (list || []).forEach(s => {
    if (!s) return;
    (relevance(s, ctx) === 'mine' ? mine : other).push(s);
  });
  return { mine, other };
}

/**
 * Every situation a stop board answered with, counted once, with its origin.
 *
 * THE SAME LOOP WAS WRITTEN DOWN FOUR TIMES. v1.105.0 gave situations an
 * origin — the stop, the line, the journey they hung on — because nothing
 * else can tell «linje 3 er innstilt» from «heisen på Ljan er ute av drift».
 * The repair was made in `fetchTrip`. It was never made in the other three:
 *
 *   api/entur.js  fetchTrip       addSituation(...)   ✓ v1.105.0
 *   views/auto.js stop board      addSituation(...)   ✓ v1.137.0
 *   views/board.js stop board     sitMap.set(s.id, s) ✗
 *   api/entur.js  fetchArrBoard   sitMap.set(s.id, s) ✗
 *
 * With no `_from`, `situationScope` is empty and `relevance` falls through to
 * its «nothing is known» branch — which means MINE. So on a plain stop board
 * and on the destination panel the whole of v1.105.0 was dead: every message
 * stood open as though it were about your journey, and the same message
 * behaved differently depending on which way it had been fetched.
 *
 * Reported as «meldingshåndteringen er wonky», and that is exactly what it is
 * from the outside: the rules are real, and they applied on two screens out
 * of four.
 *
 * One name, and the copies cannot come back.
 */
export function collectStopSituations(stop, stopId) {
  const map = new Map();
  (stop && stop.situations || []).forEach(s => addSituation(map, s, { stop: stopId }));
  ((stop && stop.estimatedCalls) || []).forEach(c => {
    const sj = c && c.serviceJourney;
    const from = {
      line: (sj && sj.line && sj.line.id) || null,
      journey: (sj && sj.id) || null,
    };
    ((c && c.situations) || []).forEach(s => addSituation(map, s, from));
    ((sj && sj.situations) || []).forEach(s => addSituation(map, s, from));
  });
  return Array.from(map.values());
}

/**
 * Merge a situation into a map, keeping every place it was found.
 *
 * fetchTrip used `sitMap.set(s.id, s)`, so the last hit won and the provenance
 * of the earlier ones was lost — along with the only handle this app has on
 * relevance. The same message really can arrive from two directions.
 */
export function addSituation(map, s, from) {
  if (!map || !s || !s.id) return;
  const prev = map.get(s.id);
  const acc = prev && prev._from ? prev._from : { lines: new Set(), stops: new Set(), journeys: new Set() };
  const f = from || {};
  if (f.line) acc.lines.add(f.line);
  if (f.stop) acc.stops.add(f.stop);
  if (f.journey) acc.journeys.add(normJid(f.journey));
  map.set(s.id, { ...(prev || s), ...s, _from: acc });
}
