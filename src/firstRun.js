import config from './config.js';

/**
 * What a stranger sees first.
 *
 * Until now: an empty two-field form. With nothing stored and no location
 * permission, startup fell through to «velg rute» — two text inputs, a
 * placeholder that is not your stop, no departures, no map. You cannot *try*
 * something that demands to be filled in first, and the install guide had a
 * line apologising for it, which is the clearest possible bug report.
 *
 * So the first screen is a working board. The rules live here rather than
 * inline in main.js because they decide what everyone's first impression is,
 * and that deserves to be tested without standing the whole app up.
 */

/** The example is a real route, but it is not the reader's route. */
export const EXAMPLE_KEY = 'example';

/**
 * Which landing path applies. The ONE copy of the ladder.
 *
 * It was a pure mirror of main.js, and it had already drifted: the auto-reise
 * rung main.js grew in v1.54.0 never reached here, so the tests pinned a
 * ladder the app did not have. main.js now branches on this instead of
 * carrying its own, which is the only way a mirror stops drifting.
 *
 * Two rungs are auto-reise, and they are different things:
 *
 * - `autoPref === 'on'` is a CHOICE, and sits where main.js has always put
 *   it: above the other mode flag, below a journey and a shared link.
 * - the LAST rung is the DEFAULT (v1.61.0). It replaces the example board,
 *   which is to say it applies exactly where the app has nothing of the
 *   reader's — no journey, no link, no mode, no route, no destination. That
 *   needs no separate definition of "no history to go on"; this ladder
 *   already is one, and one that cannot drift from itself.
 *
 * The example board stays for the reader who turned auto-reise off. Absence
 * of a preference is not that — see autoModePref in geo.js.
 *
 * @returns {'journey'|'deeplink'|'auto'|'leisure'|'stored'|'legacy'|'example'}
 */
export function landingChoice(o) {
  const s = o || {};
  if (s.hasJourney) return 'journey';
  if (s.hasDeepLink) return 'deeplink';
  if (s.autoPref === 'on') return 'auto';
  if (s.weekend) return 'leisure';
  if (s.storedRoute) return 'stored';
  if (s.savedDest) return 'legacy';
  return s.autoPref === 'off' ? 'example' : 'auto';
}

/**
 * A board to open on: the neutral central-Oslo pair that config already
 * carries for the reverse button.
 *
 * Deliberately built WITHOUT stop ids. They would save two geocoder round
 * trips on the slowest possible connection, but they cannot be looked up from
 * a sandbox with no network, and an id invented from memory would send the
 * first-ever board to the wrong platform. Names geocode correctly; a wrong id
 * fails silently.
 */
export function exampleDir() {
  const base = (config.dirs && config.dirs[0]) || null;
  if (!base || !base.from || !base.to) return null;
  return {
    ...base,
    key: EXAMPLE_KEY,
    filter: null,
    geo: base.geo || base.from,
    toGeo: base.toGeo || base.to,
  };
}

/** Is the board currently showing the example rather than someone's route? */
export function isExample(dir) {
  return !!dir && dir.key === EXAMPLE_KEY;
}

/**
 * The same board, but starting where the reader actually is.
 *
 * GPS is requested after the screen is painted — deliberately, since a slow
 * or blocked fix once left the board empty, and the rule that it must never
 * gate which route is shown still holds. So the example opens immediately and
 * this upgrades it when the fix lands.
 *
 * Only the origin moves. Keeping a real destination is what makes the board
 * show the whole app — map, corridor, strip — rather than a bare list.
 *
 * @returns {object|null} null when there is nothing better to show, so the
 *   caller leaves the example alone rather than replacing it with something
 *   worse.
 */
export function upgradeToNearest(dir, ns) {
  if (!isExample(dir) || !ns || !ns.name) return null;
  // Standing at the example's own destination: swapping would give a journey
  // from a place to itself. Turn it around instead.
  const sameAsDest = _norm(ns.name) === _norm(dir.to);
  const to = sameAsDest ? dir.from : dir.to;
  const toGeo = sameAsDest ? (dir.geo || dir.from) : (dir.toGeo || dir.to);
  if (_norm(ns.name) === _norm(to)) return null;
  return {
    ...dir,
    // Marked so the note can be honest about which half is real: after this
    // the origin IS the reader's, and only the destination is still a guess.
    _fromGps: true,
    from: ns.name,
    stopId: ns.id || null,
    geo: ns.id ? null : ns.name,
    _fromLat: ns.lat != null ? ns.lat : null,
    _fromLon: ns.lon != null ? ns.lon : null,
    to,
    toGeo,
    toStopId: null,
    _toLat: null,
    _toLon: null,
  };
}

function _norm(s) {
  return String(s || '').toLowerCase().trim();
}
