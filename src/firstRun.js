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
 * Rute (med «Din rute»-kortet, v1.218.261) er for den som slo auto-reise av. Absence
 * of a preference is not that — see autoModePref in geo.js.
 *
 * @returns {'journey'|'deeplink'|'auto'|'leisure'|'stored'|'legacy'|'rute'}
 */
export function landingChoice(o) {
  const s = o || {};
  if (s.hasJourney) return 'journey';
  if (s.hasDeepLink) return 'deeplink';
  if (s.autoPref === 'on') return 'auto';
  if (s.weekend) return 'leisure';
  if (s.storedRoute) return 'stored';
  if (s.savedDest) return 'legacy';
  return s.autoPref === 'off' ? 'rute' : 'auto';
}
