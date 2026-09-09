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
 * Which MODE a category means, for the departure board's own nearby stops.
 *
 * It used to be deliberately narrow — a category with no entry here is
 * skipped by fetchNearbyStops, and that was the point. It stopped being the
 * point when a reader in Bergen reported missing stops: `tramStop` and
 * `railStation` have no entry, so Bybanen and every railway station vanished
 * from the map's nearby stops. `fetchNearbyStops` now reads STOP_MODE below,
 * which is this table plus the ones that were left out.
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
  ...Object.keys(CAT_MODE),
  'railStation', 'tramStop',
  // Boats and hubs. These lived in a SECOND list, in entur.js, which only the
  // typed-search path used — so Strandkaiterminalen and Bergen busstasjon
  // could be found by typing their names and never by standing next to them.
  // Reported as "mange kollektiv stoppesteder i Bergen som appen ikke finner".
  // Same shape as the drift this comment already describes, one layer up.
  'ferryStop', 'harbourPort', 'GroupOfStopPlaces', 'StopPlace',
  // You can stand at an airport and want the bus. It is a stop.
  'airport',
])];

/**
 * Which mode a stop category means — the whole table.
 *
 * Built FROM CAT_MODE so the two cannot say different things about
 * metroStation, with the categories that used to be left out. Both the lanes
 * on auto-reise and the board's nearby stops read this one; the split that
 * once existed between them is what hid Bybanen.
 *
 * A hub typed `StopPlace` or `GroupOfStopPlaces` gets NO mode on purpose: the
 * category says a stop is there, not what runs from it. It still reaches the
 * screen — the «andre stopp» lane is exactly for a stop whose mode we do not
 * know — and tapping it asks the board, which does know.
 */
export const STOP_MODE = {
  ...CAT_MODE,
  railStation: 'rail',
  tramStop:    'tram',
  ferryStop:   'water',
  harbourPort: 'water',
};

/**
 * Every mode a stop serves — plural, because interchanges exist.
 *
 * Hellerud is a metro station AND a kerbside bus stop, and the geocoder says
 * so in an array. geo.js used to keep only the first entry, which made a stop
 * that serves two modes indistinguishable from one that serves one.
 *
 * Unique and in the order given: two `onstreetBus` quays are still one bus.
 */
export function modesOf(cats) {
  const out = [];
  (cats || []).forEach(c => {
    const m = STOP_MODE[c];
    if (m && !out.includes(m)) out.push(m);
  });
  return out;
}

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
