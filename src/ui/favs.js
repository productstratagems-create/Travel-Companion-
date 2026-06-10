import config from '../config.js';

function pad(n) { return String(n).padStart(2, '0'); }

export function loadFavs() {
  try { return JSON.parse(localStorage.getItem(config.storage.favs) || '[]'); }
  catch { return []; }
}

export function saveFavs(favs) {
  try { localStorage.setItem(config.storage.favs, JSON.stringify(favs)); } catch {}
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
