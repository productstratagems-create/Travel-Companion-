import { stopKey } from '../stopId.js';

/**
 * «Din vanlige 08:12 går ikke nå.»
 *
 * The app holds both halves of this and has never put them together.
 *
 *   - `addTimedFav` (ui/favs.js) stores {from, to, line, departureHHMM:'08:12'}
 *     when you press the star. That is not an inference about your habits —
 *     it is a statement you made.
 *   - `state.deps` holds today's departures for the active route.
 *
 * `loadFavs` was even IMPORTED into views/board.js and never called: the
 * connection existed as a dead import. So if your starred 08:12 is not
 * running today, you find out on the platform.
 *
 * NO MODEL AND NO SERVER. The app's privacy page promises there is no
 * backend — «ingen database og ingen server som lagrer noe om deg» — and
 * that promise stands. Everything here is two values the device already
 * holds, compared.
 *
 * Pure; the screen derives its words from `kind`, in the shape of
 * `liveness` (v1.106.0), `posState` (v1.108.0), `boardState` (v1.122.0) and
 * `alightEyebrow` (v1.126.0).
 */

/**
 * Further than this and it is not your departure running late — it is the
 * next one.
 *
 * Ten minutes, and the number is a compromise rather than a truth. A
 * starred favourite stores a LINE AND A TIME, never a service-journey id
 * (`addTimedFav`, ui/favs.js), so nothing here can prove two departures are
 * the same vehicle. On a line running every five minutes, a delay near this
 * bound genuinely cannot be told from the following service.
 *
 * Which way to be wrong is the real choice. Too generous and the app says
 * «din vanlige går 08:24» about a train that is not yours — a confident
 * falsehood. Too strict and it says «ikke blant avgangene» about a train
 * that is yours, seven minutes late — which sends the reader to look at the
 * board, where the answer is. The second is the recoverable error, so the
 * bound sits below a typical metro headway.
 *
 * The probe found this: at twelve minutes it called the NEXT departure the
 * starred one.
 */
export const RETIMED_TOL_MINS = 10;
/** Within this, the departure is simply yours, running normally. */
export const SAME_TOL_MINS = 2;

const MIN = 60_000;

/** The instant `08:12` names on the day `now` falls in, in local time. */
export function hhmmAt(hhmm, now) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return null;
  const d = new Date(now == null ? Date.now() : now);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d.getTime();
}

const depMs = d => {
  const v = d && (d.expectedDepartureTime || d.aimedDepartureTime);
  const t = v ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};
const lineOf = d => (d && d.serviceJourney && d.serviceJourney.line
  && d.serviceJourney.line.publicCode) || null;

/** Does this starred departure belong to the route on screen? */
function onThisRoute(fav, dir) {
  if (!fav || !dir) return false;
  return stopKey(fav.from) === stopKey(dir.from) && stopKey(fav.to) === stopKey(dir.to);
}

/**
 * Which starred departure, if any, this screen should speak about.
 *
 * RELEVANT, NOT GLOBAL. v1.105.0 exists because a banner was global; a note
 * about a departure on another route is the same fault with a friendlier
 * voice. So a favourite only counts when both its ends match the route being
 * shown — by `stopKey`, the app's one stop-name recipe (v1.107.0), which is
 * what makes «Ryen» and «Ryen T» the same place.
 *
 * Among several, the next one ahead inside the window: that is the one the
 * reader is standing there for.
 */
export function pickUsual(favs, dir, now, windowMins) {
  const t = Number.isFinite(now) ? now : Date.now();
  const w = Number.isFinite(windowMins) ? windowMins : 90;
  let best = null, bestAt = Infinity;
  for (const f of (favs || [])) {
    if (!f || f.type !== 'timed' || !onThisRoute(f, dir)) continue;
    const at = hhmmAt(f.departureHHMM, t);
    if (at == null || at <= t || at > t + w * MIN) continue;
    if (at < bestAt) { best = f; bestAt = at; }
  }
  return best;
}

/**
 * What to say about it — and, most of the time, nothing.
 *
 * @param {{fav:object|null, deps:Array, now:number, windowMins:number}} o
 * @returns {{kind:string, label:string}}
 */
export function usualState(o) {
  const c = o || {};
  const t = Number.isFinite(c.now) ? c.now : Date.now();
  const w = Number.isFinite(c.windowMins) ? c.windowMins : 90;
  const fav = c.fav;
  const quiet = k => ({ kind: k, label: '' });

  if (!fav || fav.type !== 'timed') return quiet('ingen');
  const target = hhmmAt(fav.departureHHMM, t);
  if (target == null) return quiet('ingen');

  // Nothing to warn about once it has gone — the board is showing what
  // actually leaves next, which is a better answer than a note about a
  // departure in the past.
  if (target <= t) return quiet('passert');

  // THE DISCIPLINE FROM v1.122.0. The board's window is ninety minutes
  // forward. Saying «it is not running» about something we never asked
  // about is exactly the fault that release existed to fix, and it is much
  // easier to commit here, where the reader would believe us.
  if (target > t + w * MIN) return quiet('utenfor-vindu');

  const hh = fav.departureHHMM;
  const mine = 'Din vanlige ' + hh;

  // The nearest departure on the same line. Without a line code, time alone
  // decides — a starred row that lost its publicCode should not match every
  // bus at the stop.
  let hit = null, best = Infinity;
  for (const d of (c.deps || [])) {
    if (fav.line && lineOf(d) !== fav.line) continue;
    const ms = depMs(d);
    if (ms == null) continue;
    const diff = Math.abs(ms - target);
    if (diff < best) { best = diff; hit = d; }
  }

  if (!hit || best > RETIMED_TOL_MINS * MIN) {
    // «ikke blant avgangene nå», not «går ikke i dag». The second is a
    // claim about the whole day, and a ninety-minute window cannot make it.
    return { kind: 'borte', label: mine + ' er ikke blant avgangene nå.' };
  }

  // Cancellation outranks the clock: a departure that is listed and
  // cancelled is worse news than one that moved, and the reader needs the
  // worse news first.
  if (hit.cancellation) return { kind: 'innstilt', label: mine + ' er innstilt.' };

  if (best <= SAME_TOL_MINS * MIN) return quiet('finnes');

  const d = new Date(depMs(hit));
  const p = n => String(n).padStart(2, '0');
  return {
    kind: 'flyttet',
    label: mine + ' går ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ' i dag.',
  };
}
