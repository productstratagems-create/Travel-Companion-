/**
 * Hand someone the board you are looking at.
 *
 * The app has had a deep-link RECEIVER since it shipped — `main.js` reads
 * `?from=&to=&fromStopId=…`, sets the route and scrubs the query — but
 * `URLSearchParams` appears in exactly one place in the codebase: there.
 * Nothing ever built such a link, so the receiver had no sender.
 *
 * That matters for letting people try the app: someone who opens a shared
 * link lands on a REAL route with real departures, rather than on the example
 * board or, before v1.44.0, on an empty form.
 *
 * The builder is pure and lives on its own because sender and receiver are in
 * different files and have to agree about every parameter name. That is an
 * agreement that breaks silently — the link still opens, it just quietly
 * forgets the stop ids and geocodes a guess instead — so it is pinned by a
 * round-trip test rather than by care.
 */

/**
 * Which parameters cross. Named here so the round-trip test can read them
 * from the same place the builder does.
 */
export const SHARE_PARAMS = [
  'from', 'to', 'fromStopId', 'toStopId', 'fromLat', 'fromLon', 'toLat', 'toLon',
];

/**
 * A board can be shared once it has both ends.
 *
 * The receiver applies the route only `if (from && to)`, so a link from a
 * board with no destination would open the app and do nothing at all — worse
 * than not offering it.
 */
export function canShare(dir) {
  return !!(dir && dir.from && dir.to);
}

/**
 * The link.
 *
 * Ids and coordinates ride along, because they are what make the recipient's
 * board precise rather than a geocoded guess — and a coordinate origin makes
 * OTP add walking time to the platform and drop departures it judges
 * unreachable, which is a real cost this app has paid before.
 *
 * `travelTime` deliberately does NOT: it is the sender's own walk-time
 * override, and pushing your walking speed into someone else's board means
 * nothing to them.
 *
 * @param {object} dir  the active route
 * @param {string} [base] where the app lives; derived from the current
 *   location by default, which keeps it correct through a move to a custom
 *   domain — the same trick the install guide uses for its own address.
 * @returns {string|null} null when there is nothing worth sending.
 */
export function routeShareUrl(dir, base) {
  if (!canShare(dir)) return null;
  const root = base || (typeof location !== 'undefined'
    ? new URL('./', location.href).href
    : '');
  const url = new URL(root);
  const set = (k, v) => {
    if (v === null || v === undefined || v === '') return;
    url.searchParams.set(k, String(v));
  };
  set('from', dir.from);
  set('to', dir.to);
  set('fromStopId', dir.stopId);
  set('toStopId', dir.toStopId);
  set('fromLat', dir._fromLat);
  set('fromLon', dir._fromLon);
  set('toLat', dir._toLat);
  set('toLon', dir._toLon);
  return url.href;
}

/**
 * Read a link back into a route, using the receiver's rules.
 *
 * Exported for the round-trip test — the point is to prove the two halves
 * agree, and a test that re-implements the receiver's rules would prove only
 * that it agrees with itself.
 */
export function routeFromShareUrl(href) {
  const params = new URL(href).searchParams;
  const from = params.get('from');
  const to = params.get('to');
  if (!from || !to) return null;
  const num = v => (v ? Number(v) : null);
  return {
    key: 'custom-out',
    from,
    to,
    stopId: params.get('fromStopId') || null,
    toStopId: params.get('toStopId') || null,
    filter: null,
    geo: params.get('fromStopId') ? null : from,
    toGeo: params.get('toStopId') ? null : to,
    line: null,
    _fromLat: num(params.get('fromLat')),
    _fromLon: num(params.get('fromLon')),
    _toLat: num(params.get('toLat')),
    _toLon: num(params.get('toLon')),
  };
}
