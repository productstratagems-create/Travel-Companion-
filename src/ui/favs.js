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
 * A star is an explicit statement; a trip in the history is an inference.
 *
 * So a starred route outranks one you have merely taken a couple of times,
 * but not one you take every day. Five is the price of that sentence: it has
 * to be more than "a couple" and less than "a habit", and no measurement can
 * tell us where that line is — only the shape of the claim can.
 */
const STAR_TRIPS = 5;

function _pairKey(from, to) {
  return String(from || '').toLowerCase().trim() + '|' + String(to || '').toLowerCase().trim();
}

/**
 * The routes worth offering as a shortcut past the whole form.
 *
 * Reported: "hvor er favorittene mine / snarveiene". The row existed and was
 * empty, and it was empty for a reason that could not be discovered from the
 * screen: it drew ONLY from manually starred routes, and the button that
 * stars one sits below the primary "bruk rute" call to action — off the
 * bottom of a phone screen. Meanwhile "lagre avgang", the save button people
 * do find, makes a TIMED favourite, which is deliberately not a route.
 *
 * So the app was counting every route you chose (`recordSmartTrip`, since
 * v1.36.0, with the names, the stop ids and the coordinates) and using that
 * count only to RANK the favourites you had starred — never to suggest one.
 * A shortcut list that can only show what you pressed a hidden button for is
 * a shortcut list that stays empty.
 *
 * Now both are candidates. A star still wins over light use (see STAR_TRIPS),
 * and where the two describe the same journey the starred one is kept: it
 * carries stop ids, a via and a line filter that the history does not.
 *
 * @param {Array} favs saved favourites
 * @param {Array} hist smart-history entries (`loadSmartHist()`)
 * @param {(from:string,to:string)=>number} count trips for a pair — the
 *   history is bucketed by hour and weekday, so the same journey appears
 *   several times; `tripCount` is what already aggregates it.
 * @param {number} [n=2]
 * @returns {Array<{key,from,to,favId,dir,saved,score}>}
 */
export function routeShortcuts(favs, hist, count, n) {
  const trips = typeof count === 'function' ? count : () => 0;
  const byPair = new Map();

  // Timed favourites ("3 08:15") are a departure, not a route — they belong
  // on «lagret», not as a shortcut past the route form.
  (favs || [])
    .filter(f => f && f.type !== 'timed' && f.from && f.to)
    .forEach(f => {
      const key = _pairKey(f.from, f.to);
      const score = (f.uses || 0) + trips(f.from, f.to) + STAR_TRIPS;
      const prev = byPair.get(key);
      if (prev && prev.saved && prev.score >= score) return;
      byPair.set(key, {
        key, from: f.from, to: f.to, favId: f.id, dir: favToDir(f), saved: true, score,
        at: f.lastUsedAt || f.createdAt || 0,
      });
    });

  (hist || [])
    .filter(e => e && e.fromName && e.toName)
    .forEach(e => {
      const key = _pairKey(e.fromName, e.toName);
      // A starred route says more than the same route in the history.
      if (byPair.has(key)) return;
      byPair.set(key, {
        key, from: e.fromName, to: e.toName, favId: null,
        dir: histToDir(e), saved: false, score: trips(e.fromName, e.toName),
        at: e.lastUsed || 0,
      });
    });

  return [...byPair.values()]
    .sort((a, b) => b.score - a.score || b.at - a.at)
    .slice(0, n == null ? 2 : n);
}

/**
 * A history entry as a route.
 *
 * It carries less than a favourite — no via, no line filter, no departure
 * coordinate — so the fields it cannot fill are left null rather than
 * guessed. `geo`/`toGeo` fall back to the name exactly where the id is
 * missing, which is the same rule the deep-link receiver uses.
 */
export function histToDir(e) {
  if (!e || !e.fromName || !e.toName) return null;
  return {
    key:      'custom-out',
    from:     e.fromName,
    to:       e.toName,
    stopId:   e.fromStopId || null,
    toStopId: e.toStopId   || null,
    filter:   null,
    geo:      e.fromStopId ? null : e.fromName,
    toGeo:    (e.toStopId || e.toLat != null) ? null : e.toName,
    line:     null,
    _fromLat: null,
    _fromLon: null,
    _toLat:   e.toLat != null ? e.toLat : null,
    _toLon:   e.toLon != null ? e.toLon : null,
  };
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
