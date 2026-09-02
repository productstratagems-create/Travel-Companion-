/**
 * Where a departure went.
 *
 * The board has now been reported three times for not showing the most
 * imminent departure. Two fixes each found a real cause — the dedupe ranking
 * by arrival, and the dedupe bucketing on the departure minute — and the
 * symptom came back both times. That means the sufficient cause has not been
 * found, and a third guess is not a plan.
 *
 * So the board counts itself. One record per fetch, stage by stage, with the
 * earliest departure surviving each. When it happens again the reader opens
 * the debug panel and reads which line the earliest time jumped at, instead of
 * me guessing from the outside.
 *
 * The load-bearing line is the last one. Ruter shows a STOP BOARD — every
 * departure from the stop. This app asks the TRIP PLANNER for journeys from A
 * to B, and OTP legitimately omits an itinerary it considers dominated: a slow
 * bus leaving in two minutes that arrives after the metro leaving in six. So
 * "it is in Ruter but not here" can be entirely correct behaviour, and no
 * amount of dedupe fixing would change it. Asking the stop board the same
 * question Ruter asks is what finally tells the two apart.
 */

/**
 * The retry shed the two-minute lookback for a poll.
 *
 * Recorded rather than prevented: dropping dateTime is the whole point of
 * that fallback — it is the argument that was never verifiable against the
 * live API. But it silently costs the just-departed row, so the record says
 * so instead of the loss being invisible.
 */
let _lookbackLost = false;
export function noteLookbackLost() { _lookbackLost = true; }
export function takeLookbackLost() { const v = _lookbackLost; _lookbackLost = false; return v; }

/** Stages in the order a departure passes through them. */
export const STAGES = ['svar', 'adaptert', 'dedup', 'modus', 'linje', 'rader'];

export function newRecord(at) {
  return {
    at: at == null ? Date.now() : at,
    askedFor: null,      // the dateTime actually sent
    askedFuture: false,  // …and whether that is ahead of now
    origin: null,        // stop id, or 'koordinater' — a known dropper
    stages: {},          // stage → { n, earliest }
    dropped: [],         // reasons from adaptTripPattern
    stopBoard: null,     // earliest the stop board reports, when asked
    stopBoardN: null,    // how many departures that board held
    stopBoardQuays: null, // and how they split across platforms
    ourQuays: null,      // the same split for the rows we ended up showing
    lookbackLost: false, // the retry shed the 2-minute lookback this poll
  };
}

/** Earliest departure in a list, as epoch ms; null when there is none. */
export function earliestOf(list, pick) {
  let best = null;
  (list || []).forEach(item => {
    const iso = pick ? pick(item) : (item && item.expectedDepartureTime);
    const t = new Date(iso || NaN).getTime();
    if (!isNaN(t) && (best == null || t < best)) best = t;
  });
  return best;
}

export function stage(rec, name, list, pick) {
  if (!rec) return;
  rec.stages[name] = { n: (list || []).length, earliest: earliestOf(list, pick) };
}

const hhmm = ms => {
  if (ms == null) return '—';
  const d = new Date(ms);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

/**
 * Which stage lost the earliest departure.
 *
 * The whole point of the record: not "how many survived" but "where did the
 * soonest one stop being the soonest". Returns the stage name, or null when
 * the earliest never moved.
 */
export function lostAt(rec) {
  if (!rec) return null;
  let prev = null;
  for (const name of STAGES) {
    const s = rec.stages[name];
    if (!s) continue;
    if (prev != null && s.earliest != null && s.earliest > prev) return name;
    if (s.earliest != null) prev = s.earliest;
  }
  return null;
}

/**
 * The record as lines for the debug panel.
 *
 * Deliberately plain text in a fixed-width panel rather than a designed
 * component: it is read once, in a hurry, on a platform, by someone who wants
 * to tell me a number.
 */
export function formatRecord(rec) {
  if (!rec) return [];
  const out = [];
  if (rec.askedFor != null) {
    out.push('spurt om   ' + hhmm(rec.askedFor)
      + (rec.askedFuture ? '   ← FRAMTIDIG' : ''));
  }
  if (rec.origin) out.push('origo      ' + rec.origin);
  if (rec.lookbackLost) out.push('tilbakeblikk  TAPT (dateTime avvist)');
  const lost = lostAt(rec);
  STAGES.forEach(name => {
    const s = rec.stages[name];
    if (!s) return;
    let line = name.padEnd(11) + String(s.n).padStart(3) + '   ' + hhmm(s.earliest);
    if (name === 'adaptert' && rec.dropped.length) {
      line += '   (' + rec.dropped.length + ' forkastet: ' + _tally(rec.dropped) + ')';
    }
    if (name === lost) line += '   ← MISTET HER';
    out.push(line);
  });
  // Which platforms we ended up boarding at. Reported as "you only show
  // departures from one of the platforms" — and the app filters nothing by
  // platform, so the only way to tell "Entur offers just this one" from "we
  // drop the rest" is to put the two tallies next to each other.
  if (rec.ourQuays) out.push('spor       ' + _quays(rec.ourQuays));
  if (rec.stopBoard !== null) {
    const ours = rec.stages.rader ? rec.stages.rader.earliest : null;
    out.push('───────────────────────────────');
    out.push('stopptavle     ' + hhmm(rec.stopBoard)
      + (rec.stopBoardN != null ? '   ' + rec.stopBoardN + ' avganger' : '')
      + (ours != null && rec.stopBoard != null && rec.stopBoard < ours - 30000
        ? '   ← Entur har en tidligere' : ''));
    if (rec.stopBoardQuays) {
      out.push('  spor     ' + _quays(rec.stopBoardQuays)
        + (_missingQuay(rec.ourQuays, rec.stopBoardQuays)
          ? '   ← spor vi ikke viser' : ''));
    }
  }
  return out;
}

function _tally(reasons) {
  const counts = new Map();
  reasons.forEach(r => counts.set(r, (counts.get(r) || 0) + 1));
  return [...counts.entries()].map(([r, n]) => (n > 1 ? n + '× ' : '') + r).join(', ');
}

/** Paint the record into the debug panel. */
export function showRecord(rec) {
  const el = typeof document !== 'undefined' && document.getElementById('dbg-diag');
  if (!el) return;
  const lines = formatRecord(rec);
  el.textContent = lines.length ? lines.join('\n') : '—';
}

/** "2×8, 1×6" — a platform tally, busiest first. */
function _quays(map) {
  return Object.entries(map || {})
    .sort((a, b) => b[1] - a[1])
    .map(([q, n]) => q + '×' + n)
    .join(', ') || '—';
}

/**
 * Does the stop board have a platform our rows never use?
 *
 * The whole point of the two tallies. A platform Entur reports and we never
 * show is the reported symptom, stated as a fact rather than an impression.
 */
export function _missingQuay(ours, board) {
  if (!ours || !board) return false;
  return Object.keys(board).some(q => q !== '?' && !ours[q]);
}
