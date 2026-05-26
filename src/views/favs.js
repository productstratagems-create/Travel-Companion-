import config from '../config.js';
import { state } from '../state.js';
import { loadFavs, removeFav, favToDir } from '../ui/favs.js';
import { show, updateHeader } from '../ui/nav.js';

export function renderFavs() {
  const el = document.getElementById('fav-content');
  if (!el) return;
  const favs = loadFavs();
  const routes = favs.filter(f => !f.type || f.type === 'route');
  const timed  = favs.filter(f => f.type === 'timed');

  if (!favs.length) {
    el.innerHTML = '<div class="fav-empty">Ingen favoritter ennå.<br>'
      + 'Trykk ★ på en avgang for å lagre tidspunkt,<br>'
      + 'eller bruk Innstillinger for å lagre rute.</div>';
    return;
  }

  let html = '';
  if (routes.length) {
    html += '<div class="fav-section-label">ruter</div>';
    routes.forEach(f => {
      html += '<div class="fav-card">'
        + '<button class="fav-card-sel" onclick="window._loadFavRoute(\'' + f.id + '\')">'
        + f.from + ' → ' + f.to + '</button>'
        + '<button class="fav-del" onclick="window._deleteFav(\'' + f.id + '\')" aria-label="slett">×</button>'
        + '</div>';
    });
  }
  if (timed.length) {
    html += '<div class="fav-section-label">avganger</div>';
    timed.forEach(f => {
      const bg = '#' + (f.lineColour || '7c2d12');
      html += '<div class="fav-card">'
        + '<div class="fav-timed-sel" onclick="window._loadFavRoute(\'' + f.id + '\')">'
        + '<span class="line-badge" style="background:' + bg + '">' + (f.line || '?') + '</span>'
        + '<span class="fav-timed-time">' + f.departureHHMM + '</span>'
        + '<span class="fav-timed-route">' + f.from + ' → ' + f.to + '</span>'
        + '</div>'
        + '<button class="fav-del" onclick="window._deleteFav(\'' + f.id + '\')" aria-label="slett">×</button>'
        + '</div>';
    });
  }
  el.innerHTML = html;
}

window._loadFavRoute = (id) => {
  const fav = loadFavs().find(f => f.id === id);
  if (!fav) return;
  config.dirs[2] = favToDir(fav);
  state.dIdx = 2;
  try { localStorage.setItem(config.storage.dir, '2'); } catch {}
  updateHeader();
  state.deps = [];
  show('v-board');
  window._startBoard && window._startBoard();
};

window._deleteFav = (id) => {
  removeFav(id);
  renderFavs();
};

window._renderFavs = renderFavs;
