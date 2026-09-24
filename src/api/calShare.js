/**
 * One leg to the phone's own calendar — the one ladder, with one owner.
 *
 * This lived inside `views/plan.js` while the bell on the plan card was its
 * only caller. The moment the departure screen wanted the same sheet the
 * instant a leg is added, it became the shape this codebase keeps paying for:
 * two places building the same file, free to drift on the alarm, the file
 * name or the SEQUENCE. So it has one name before the second caller exists.
 *
 * A LADDER, like the rest of this app's outward edges: share sheet first
 * because that is the iOS path — a text/calendar File lands in Kalender from
 * there — then a download for desktop and Android, then a word rather than
 * nothing.
 *
 * TRANSIENT USER ACTIVATION is why this stays callable straight from a click
 * handler and does nothing asynchronous before `navigator.share`: the browser
 * only opens the sheet while the tap is still fresh. Put a fetch in front of
 * it and the sheet is refused — which is exactly why `addLegToPlan` writing
 * to localStorage (and nothing else) is what makes the add-time sheet legal.
 *
 * Nothing leaves the phone that the reader did not send: the file is built
 * here and handed to the operating system, which asks them where it goes.
 */
import { legIcs, leadMins, loadLeadPref, LEAD_AUTO } from './ics.js';
import { storage } from '../storage.js';
import { logMsg } from '../ui/log.js';
import { loadWalkBuffer, walkMinsTo } from '../geo.js';
import { state } from '../state.js';
import config from '../config.js';

/**
 * SEQUENCE per leg, so a second export of the same leg MOVES the entry the
 * calendar already holds instead of leaving a stale alarm beside a new one.
 * The UID is the leg's own; this is the number that says «this is newer».
 */
export const CAL_SEQ_KEY = 't.calSeq';

export function calSeq(id) {
  let map = {};
  try { map = JSON.parse(storage.get(CAL_SEQ_KEY) || '{}') || {}; } catch { map = {}; }
  const next = (Number(map[id]) || 0) + 1;
  map[id] = next;
  try { storage.set(CAL_SEQ_KEY, JSON.stringify(map)); } catch { /* full */ }
  return next - 1;
}

/** The alarm offset for a leg, read from the one setting. */
export function legLead(leg) {
  const pref = loadLeadPref();
  // The walk cannot always be known — a leg stores no coordinates for its
  // origin — and leadMins says which of the three it used, so the entry can too.
  const w = walkMinsTo(state.statLL && state.statLL[config.dirs[state.dIdx].key]);
  return leadMins(leg, {
    pref: pref === LEAD_AUTO ? null : pref,
    walkMins: w ? w.mins : null,
    buffer: loadWalkBuffer(),
    fallback: config.defaultWalkMinutes,
  });
}

/** The file for a leg, built without touching the network. */
export function legCalFile(leg) {
  const text = legIcs(leg, legLead(leg), calSeq(leg.id));
  const name = 'reise-' + leg.line + '-' + leg.depIso.slice(11, 16).replace(':', '') + '.ics';
  return new File([text], name, { type: 'text/calendar' });
}

/** True when this device can hand a calendar file to the OS sheet. */
export function canShareCal() {
  try {
    if (!navigator.canShare || !navigator.share) return false;
    const probe = new File(['BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n'],
      'p.ics', { type: 'text/calendar' });
    return !!navigator.canShare({ files: [probe] });
  } catch { return false; }
}

/**
 * @param {object} leg
 * @param {object} [o] `o.shareOnly` skips the download rung — used when the
 *   sheet is offered unasked, so a desktop does not quietly drop a file in
 *   Downloads every time a leg is added.
 */
export async function shareLegCalendar(leg, o) {
  if (!leg) return false;
  const file = legCalFile(leg);

  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Linje ' + leg.line + ' → ' + leg.to });
      return true;
    }
  } catch { /* the reader cancelled, or the sheet refused — fall through */ }

  if (o && o.shareOnly) return false;

  try {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  } catch { /* no download either */ }

  logMsg('kunne ikke lage kalenderoppføring her', 'err');
  return false;
}
