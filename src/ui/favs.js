import config from '../config.js';
import { storage } from '../storage.js';

function pad(n) { return String(n).padStart(2, '0'); }

export function loadFavs() {
  try {
    const v = JSON.parse(storage.get(config.storage.favs) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export function saveFavs(favs) {
  storage.set(config.storage.favs, JSON.stringify(favs));
}

export function addFav(dir) {
  if (!dir || !dir.from || !dir.to) return false;
  const favs = loadFavs();
  if (favs.some(f => f.from === dir.from && f.to === dir.to)) return false;
  favs.push({
    type: 'route',
    id: 'fav_' + Date.now(),
    label: dir.from + ' → ' + dir.to,
    from: dir.from, to: dir.to,
    stopId:   dir.stopId   || null,
    toStopId: dir.toStopId || null,
    geo:      dir.geo      || null,
    toGeo:    dir.toGeo    || null,
    line:     dir.line     || null,
    fromLat:  dir._fromLat || null,
    fromLon:  dir._fromLon || null,
    toLat:    dir._toLat   || null,
    toLon:    dir._toLon   || null,
    createdAt: Date.now(),
  });
  if (favs.length > 12) favs.shift();
  saveFavs(favs);
  return true;
}

export function addTimedFav(dep, dir) {
  const ln = dep.serviceJourney && dep.serviceJourney.line;
  const line = (ln && ln.publicCode) || null;
  const colour = (ln && ln.presentation && ln.presentation.colour) || '7c2d12';
  const d = new Date(dep.expectedDepartureTime);
  const hhmm = pad(d.getHours()) + ':' + pad(d.getMinutes());
  const favs = loadFavs();
  if (favs.some(f => f.type === 'timed' && f.from === dir.from && f.to === dir.to
      && f.line === line && f.departureHHMM === hhmm)) return false;
  favs.push({
    type: 'timed',
    id: 'tfav_' + Date.now(),
    label: (line || '?') + ' ' + hhmm,
    from: dir.from, to: dir.to,
    stopId:   dir.stopId   || null,
    toStopId: dir.toStopId || null,
    geo:      dir.geo      || null,
    toGeo:    dir.toGeo    || null,
    fromLat:  dir._fromLat || null,
    fromLon:  dir._fromLon || null,
    toLat:    dir._toLat   || null,
    toLon:    dir._toLon   || null,
    line, lineColour: colour,
    departureHHMM: hhmm,
    createdAt: Date.now(),
  });
  if (favs.length > 12) favs.shift();
  saveFavs(favs);
  return true;
}

/**
 * The favourites you actually use, most-used first.
 *
 * "Most used" did not exist before this: a favourite stored only createdAt,
 * and recordSmartTrip — the app's one usage signal — was never called when a
 * favourite was loaded. So the routes people tap were invisible to the only
 * thing measuring taps.
 *
 * Scored on both sources deliberately. A fresh counter starts at zero for
 * everyone, which would make the top two arbitrary for weeks; the trip
 * history already holds real counts from «bruk rute», so the list is
 * meaningful immediately and sharpens as favourites get used.
 *
 * @param {function} histCount  (from, to) => number, injected so the ranking
 *                              stays pure and testable without storage.
 */
export function topFavRoutes(favs, histCount, n) {
  const count = histCount || (() => 0);
  return (favs || [])
    // Timed favourites ("3 08:15") are a departure, not a route — they belong
    // on «lagret», not as a shortcut past the route form.
    .filter(f => f && f.type !== 'timed' && f.from && f.to)
    .map(f => ({ fav: f, score: (f.uses || 0) + count(f.from, f.to) }))
    .sort((a, b) =>
      b.score - a.score
      || (b.fav.lastUsedAt || 0) - (a.fav.lastUsedAt || 0)
      || (b.fav.createdAt || 0) - (a.fav.createdAt || 0))
    .slice(0, n == null ? 2 : n)
    .map(x => x.fav);
}

/** Record that a favourite was used, so the ranking above means something. */
export function markFavUsed(id) {
  const favs = loadFavs();
  const f = favs.find(x => x.id === id);
  if (!f) return;
  f.uses = (f.uses || 0) + 1;
  f.lastUsedAt = Date.now();
  saveFavs(favs);
}

export function removeFav(id) {
  saveFavs(loadFavs().filter(f => f.id !== id));
}

export function favToDir(fav) {
  return {
    key:      'custom-out',
    from:     fav.from,
    to:       fav.to,
    stopId:   fav.stopId,
    toStopId: fav.toStopId,
    filter:   null,
    geo:      fav.geo,
    toGeo:    fav.toGeo,
    line:     fav.line,
    _fromLat: fav.fromLat || null,
    _fromLon: fav.fromLon || null,
    _toLat:   fav.toLat   || null,
    _toLon:   fav.toLon   || null,
  };
}
