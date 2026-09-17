import config from './config.js';
// The tenth copy of the stop normaliser, and one the v1.107.0 sweep missed:
// this file had its own lowercase-and-trim `_norm` for «am I standing at the
// example's own destination». Same question, so the same rule.
import { stopKey as _norm } from './stopId.js';

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
 * How long auto-reise gets to find a stop before the example board answers.
 *
 * A window, not a race: GPS takes a second or two on a good day, and bouncing
 * a reader off the screen they landed on before the fix could possibly arrive
 * would be its own bug. Four seconds is past the ordinary fix and well short
 * of the point where someone concludes the app is broken.
 */
export const AUTO_FALLBACK_MS = 4000;

/**
 * Auto-reise has nothing to show. Is the example board better than an apology?
 *
 * THE FIRST SCREEN WENT BACK TO BEING A FORM, and nobody noticed because the
 * thing that was supposed to prevent it still existed. `firstRun.js` was
 * written because a stranger met two empty text fields — «You cannot *try*
 * something that demands to be filled in first» — and the answer was a working
 * example board. Then v1.61.0 made the ladder's last rung auto-reise, which is
 * a POSITION-FIRST screen, and the example became reachable only by a reader
 * who had turned auto-reise off. A first-time visitor cannot have done that.
 *
 * So the measured first impression, with nothing stored, was «Stedstjenester er
 * avslått» and a link to the form. The same screen, by a different road.
 *
 * YES exactly when the app holds nothing of the reader's — no stored route, no
 * saved destination, no journey. Then this is still a first visit however many
 * times it has happened, and a board that works beats a link to a form.
 *
 * NO the moment they have a route of their own: they know what auto-reise is,
 * they chose to be here, and throwing them onto a board about somewhere else
 * would be worse than saying plainly that the position is missing. The
 * auto-mode preference deliberately does NOT enter into it — main.js writes it
 * the first time it lands here, so from the second visit every stranger would
 * look like someone who had chosen this screen.
 */
export function exampleFallback(o) {
  const s = o || {};
  if (s.hasStop) return false;
  // A POSITION WITH NO STOP NEAR IT IS AN ANSWER, not an absence. The reader
  // granted location, the app found them, and «ingen holdeplass innenfor 850
  // meter» is true and about them. Replacing that with a board about
  // Jernbanetorget would trade something they can act on for something they
  // cannot. Caught by the probe, which fell back on the granted run too.
  if (s.posKind === 'ingen-stopp') return false;
  return !s.storedRoute && !s.savedDest && !s.hasJourney;
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


