/**
 * What the geocoder calls a public transport stop.
 *
 * Its own module, deliberately, and it imports nothing. Two consumers need
 * it — geo.js and api/stops.js — and stops.js already imports `haver` from
 * geo.js, so putting the list in either of them makes a cycle. That is not a
 * tidiness worry: `STOP_CATS` in geo.js is built at MODULE LOAD, so a cycle
 * resolved in the wrong order throws a ReferenceError in the bundle while the
 * unit tests, which load modules in a different order, stay green. A file
 * with no imports cannot be in a cycle.
 */

/**
 * Which MODE a category means. Narrower than TRANSIT_CATS on purpose: a
 * category with no entry here is skipped by fetchNearbyStops, so adding a
 * name below does not change the departure board.
 */
export const CAT_MODE = {
  metroStation: 'metro',
  busStation:   'bus',
  onstreetBus:  'bus',
  tramStation:  'tram',
  onstreetTram: 'tram',
};

/**
 * Every category that counts as a stop, for "which stop am I at".
 *
 * The only such list in the app. There used to be a second one in geo.js for
 * the same idea, and the two drifted: geo.js had no `onstreetBus`, so
 * auto-reise dropped every ordinary kerbside bus stop and could only ever
 * name a metro station, a train station or a bus terminal. Reported as
 * "appen sier jeg er nære t-banestopper og ikke relevante bussholdeplasser".
 *
 * The union of what the two lists held, and nothing invented: the geocoder
 * cannot be reached from the sandbox this was written in, so a category name
 * is not something to guess at. `railStation` and `tramStop` come from the
 * old geo.js list and stay — a name that matches nothing costs nothing, while
 * removing one that does match loses a stop.
 */
export const TRANSIT_CATS = [...new Set([
  ...Object.keys(CAT_MODE), 'railStation', 'tramStop',
])];

/**
 * What Entur calls a long-distance bus.
 *
 * Transmodel separates `coach` from `bus`: Haukeliekspressen and the
 * Telemark and Vy expresses are coaches, city buses are buses. The app asked
 * for four modes and `coach` was not among them, so EVERY express service in
 * Norway was invisible — not filtered out on screen, never requested at all.
 * Reported as "finn og integrer busstilbud som kjører mellom riksvei 37 og
 * Oslo": the services exist, the app simply never asked.
 *
 * Normalised at the door rather than compared for in a dozen places. `mode
 * === 'bus'` appears eleven times across board.js, track.js and auto.js —
 * snapping distance, vehicle labels, mode pills, ranking — and every one of
 * them means "a bus" in the sense a person means it. One named seam beats
 * eleven edits that must agree.
 */
export const COACH = 'coach';

/** @returns {string} the mode the rest of the app reasons about */
export function normMode(m) {
  return m === COACH ? 'bus' : m;
}
