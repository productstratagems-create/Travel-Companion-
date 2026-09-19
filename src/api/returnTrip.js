import { storage } from '../storage.js';
import config from '../config.js';

/**
 * The trip home, set while you are on your way to work.
 *
 * The app already knew how to store a route, how to store a future-dated
 * trip, and what you usually do at a given hour — but none of those pieces
 * knew about each other, so a commuter had to set the return journey up again
 * from scratch every afternoon, at exactly the moment they had least patience
 * for it.
 *
 * Everything here is pure apart from the two storage functions, because the
 * rules — when the window opens, when a manual choice wins — are where this
 * goes quietly wrong and are worth testing without a DOM.
 */

/** How long before the departure time the board starts showing the way home. */
export const RETURN_LEAD_MS = 45 * 60_000;
/** And how long after, before it gives up and hands the board back. */
export const RETURN_TAIL_MS = 90 * 60_000;

export function loadReturn() {
  try {
    const r = JSON.parse(storage.get(config.storage.ret) || 'null');
    return (r && r.from && r.to && /^\d{2}:\d{2}$/.test(r.atHHMM || '')) ? r : null;
  } catch { return null; }
}

export function saveReturn(r) {
  try { storage.set(config.storage.ret, JSON.stringify(r)); } catch { /* full or blocked */ }
}

export function clearReturn() {
  storage.remove(config.storage.ret);
  storage.remove(config.storage.retSkip);
}

/**
 * The morning route, turned around — with its identities intact.
 *
 * `toggleDir` (ui/nav.js) deliberately drops stopId/toStopId and all four
 * coordinates and lets the names be geocoded again, which is fine for a quick
 * flip you are watching. It is not fine here: resolveStop's own comment warns
 * that coordinates instead of a stop id make OTP add walking time to the
 * platform and silently drop departures. A trip home set hours in advance has
 * to keep what it knows.
 */
export function reverseOf(dir) {
  if (!dir || !dir.from || !dir.to) return null;
  return {
    key: 'custom-out',
    from: dir.to,
    to: dir.from,
    stopId: dir.toStopId || null,
    toStopId: dir.stopId || null,
    filter: null,
    geo: dir.toStopId ? null : dir.to,
    toGeo: dir.stopId ? null : dir.from,
    line: null,
    via: dir.via || null,
    viaStopId: dir.viaStopId || null,
    viaGeo: dir.viaGeo || null,
    _fromLat: dir._toLat != null ? dir._toLat : null,
    _fromLon: dir._toLon != null ? dir._toLon : null,
    _toLat: dir._fromLat != null ? dir._fromLat : null,
    _toLon: dir._fromLon != null ? dir._fromLon : null,
  };
}

/** The stored return trip as a route the rest of the app can take. */
export function returnDir(r) {
  if (!r) return null;
  return {
    key: 'custom-out',
    from: r.from,
    to: r.to,
    stopId: r.stopId || null,
    toStopId: r.toStopId || null,
    filter: null,
    geo: r.stopId ? null : r.from,
    toGeo: r.toStopId ? null : r.to,
    line: null,
    via: r.via || null,
    viaStopId: r.viaStopId || null,
    viaGeo: r.viaGeo || null,
    _fromLat: r._fromLat != null ? r._fromLat : null,
    _fromLon: r._fromLon != null ? r._fromLon : null,
    _toLat: r._toLat != null ? r._toLat : null,
    _toLon: r._toLon != null ? r._toLon : null,
  };
}

/** Today's date as YYYY-MM-DD, local — the unit the skip flag is kept in. */
export function dayKey(now) {
  const d = new Date(now == null ? Date.now() : now);
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** The departure instant for a HH:MM on the day `now` falls in. */
export function atMs(hhmm, now) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return null;
  const d = new Date(now == null ? Date.now() : now);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d.getTime();
}

/**
 * Is the trip home the thing to show right now?
 *
 * A plain window on today's clock rather than anything rolling: the return
 * time is a wall-clock time, and a window that wrapped past midnight would
 * make an 08:00 departure look "active" at 23:30 the night before.
 *
 * @returns {{active:boolean, at:number|null, before:boolean}}
 */
export function returnWindow(r, now) {
  const t = now == null ? Date.now() : now;
  const at = r ? atMs(r.atHHMM, t) : null;
  if (at == null) return { active: false, at: null, before: false };
  const active = t >= at - RETURN_LEAD_MS && t <= at + RETURN_TAIL_MS;
  return { active, at, before: t < at };
}

/**
 * WHEN this route is planned from — the single derivation.
 *
 * Until «Utforsk» there was only one way a route could be about a time that
 * is not now: the trip home, a HH:MM on today's clock inside a ±45/90 minute
 * window. A journey search that can ask about tomorrow morning adds a second
 * way, and two places deciding «what instant do we send as dateTime» is the
 * failure shape this codebase has produced about twenty times.
 *
 * So it is decided here, once. `dir.atMs` — an explicit instant the reader
 * chose — wins over the return-trip window, because a deliberate choice must
 * outrank an automatic one; that is the same rule `shouldSwitch` already
 * follows for the route itself.
 *
 * `undefined` means «now», which is what `fetchTrip` expects: not a
 * timestamp equal to this instant, but the absence of one, so the planner
 * keeps its two-minute lookback and the departure at the platform survives.
 *
 * @returns {number|undefined}
 */
export function departAtMs(dir, now, opts) {
  const t = now == null ? Date.now() : now;
  if (dir && Number.isFinite(dir.atMs)) return dir.atMs > t ? dir.atMs : undefined;
  const o = opts || {};
  const r = o.ret === undefined ? loadReturn() : o.ret;
  if (!r || !dir || dir.from !== r.from || dir.to !== r.to) return undefined;
  // Declining the switch has to mean declining the question too. `shouldSwitch`
  // honours the skip flag; this did not, so after tapping ✕ the board kept
  // asking Entur for departures around the RETURN time — up to 45 minutes in
  // the future — while the reader stood on the platform now. Every imminent
  // departure is then legitimately absent from the response, with nothing on
  // screen to say why.
  const skip = o.skipDay === undefined ? loadSkip() : o.skipDay;
  if (skip === dayKey(t)) return undefined;
  const w = returnWindow(r, t);
  return (w.active && w.before) ? w.at : undefined;
}

/**
 * Whether the board should switch itself over.
 *
 * The rule that matters most is the second one: a route the reader picked
 * themselves stands for the rest of the day. An automatic switch that
 * overrides a deliberate choice is worse than no automatic switch, and it is
 * the thing that would make this feature feel like it was fighting you.
 */
export function shouldSwitch(r, now, skipDay) {
  if (!r) return false;
  if (skipDay === dayKey(now)) return false;
  return returnWindow(r, now).active;
}

/** Remember that today's switch was declined, or overridden by a choice. */
export function skipToday(now) {
  storage.set(config.storage.retSkip, dayKey(now));
}

export function loadSkip() {
  return storage.get(config.storage.retSkip) || null;
}

/**
 * A departure time to suggest, from what the reader actually does.
 *
 * smartHist buckets trips in two-hour slots with a weekday flag; the busiest
 * afternoon bucket for this direction is a far better first guess than a
 * number I would otherwise have invented. No history at all means an empty
 * field rather than a made-up 16:00 — the app does not pretend to know things.
 */
export function suggestHHMM(hist, from, to) {
  const norm = s => (s || '').toLowerCase().trim();
  const f = norm(from), t = norm(to);
  let best = null;
  (hist || []).forEach(e => {
    if (t && norm(e.toName) !== t) return;
    if (f && e.fromName && norm(e.fromName) !== f) return;
    // Mornings are when the trip out happens; a return time is an afternoon.
    if (e.bucket < 7) return;
    if (!best || e.count > best.count) best = e;
  });
  if (!best) return '';
  return String(best.bucket * 2).padStart(2, '0') + ':00';
}
