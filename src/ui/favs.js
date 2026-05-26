import config from '../config.js';

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
  const entry = {
    id: 'fav_' + Date.now(),
    label: dir.from + ' → ' + dir.to,
    from: dir.from, to: dir.to,
    stopId:   dir.stopId   || null,
    toStopId: dir.toStopId || null,
    geo:      dir.geo      || null,
    toGeo:    dir.toGeo    || null,
    line:     dir.line     || null,
    createdAt: Date.now(),
  };
  favs.push(entry);
  if (favs.length > 8) favs.shift();
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
  };
}
