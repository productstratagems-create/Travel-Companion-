import { state } from '../state.js';
import { fetchNearbyPlaces, timeCategory, PLACE_CATS } from '../api/places.js';
import { fetchWeather } from '../api/weather.js';
import { saveWeekendMode } from '../geo.js';
import { geocodePlace } from '../api/entur.js';
import config from '../config.js';
import { show, updateHeader } from '../ui/nav.js';

const HANDEL = { label: 'handel', emoji: '🛍', amenities: ['clothes','shoes','sports','books','electronics','mall','department_store','gift','jewelry'] };
const LEISURE_CATS = [...PLACE_CATS, HANDEL];
const RADII = [500, 1000, 2000, 5000];

let _catIdx    = null;   // null = auto via timeCategory()
let _venues    = null;
let _loading   = false;
let _weather   = null;
let _expanded  = null;   // expanded venue card index
let _locOvr    = null;   // { lat, lon, label } — user-set position override
let _radius    = 1000;   // metres

export function renderLeisure() {
  const el = document.getElementById('v-leisure');
  if (!el) return;

  const pos = _locOvr || state.homeLL;
  el.innerHTML = _buildHtml(pos);
  _attachListeners(el, pos);

  if (pos && !_venues && !_loading) _loadVenues(_activeCat(), pos);
  if (pos && !_weather) {
    fetchWeather(pos.lat, pos.lon)
      .then(w => { _weather = w; _updateWeatherEl(); })
      .catch(() => {});
  }
}

function _activeCat() {
  if (_catIdx !== null) return LEISURE_CATS[_catIdx];
  const tc = timeCategory();
  return LEISURE_CATS.find(c => c.label === tc.label) || LEISURE_CATS[1];
}

function _locLabel(pos) {
  if (_locOvr) return _locOvr.label;
  if (pos) return (state.nearestStation && state.nearestStation.name) || 'GPS posisjon';
  return 'søk etter sted';
}

function _buildHtml(pos) {
  const act = _activeCat();
  const label = _locLabel(pos);

  const wHtml = _weather
    ? '<div class="lei-weather" id="lei-weather">'
      + _weather.icon + ' ' + _weather.temp + '°'
      + (_weather.advice ? ' · ' + _weather.advice : '') + '</div>'
    : '<div class="lei-weather" id="lei-weather"></div>';

  // Location bar — always visible; search panel starts open when no position set
  const searchOpen = !pos;
  const locHtml = '<div class="lei-loc-bar">'
    + '<span class="lei-loc-dot">📍</span>'
    + '<span class="lei-loc-label" id="lei-loc-label">' + label + '</span>'
    + '<button class="lei-loc-edit-btn" id="lei-loc-edit-btn">endre</button>'
    + '</div>'
    + '<div class="lei-loc-search" id="lei-loc-search"' + (searchOpen ? '' : ' style="display:none"') + '>'
    + '<input id="lei-loc-input" type="text" placeholder="f.eks. Grünerløkka, Oslo"'
    + ' autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">'
    + '<div id="lei-loc-sugg" class="stop-sugg" hidden></div>'
    + '</div>';

  const radiusHtml = '<div class="lei-radius-row">'
    + RADII.map(r => {
        const lbl = r >= 1000 ? (r / 1000) + ' km' : r + ' m';
        return '<button class="lei-radius-btn' + (r === _radius ? ' active' : '') + '" data-r="' + r + '">' + lbl + '</button>';
      }).join('')
    + '</div>';

  const pills = LEISURE_CATS.map((c, i) => {
    const on = _catIdx !== null ? i === _catIdx : c.label === act.label;
    return '<button class="lei-cat-btn' + (on ? ' active' : '') + '" data-idx="' + i + '">'
      + c.emoji + ' ' + c.label + '</button>';
  }).join('');

  let venuesHtml;
  if (!pos) {
    venuesHtml = '<div class="lei-loading">Velg et sted for å se steder i nærheten.</div>';
  } else if (_loading) {
    venuesHtml = '<div class="lei-loading">laster steder…</div>';
  } else if (_venues !== null) {
    venuesHtml = _venues.length
      ? _venues.map((v, i) => _cardHtml(v, i)).join('')
      : '<div class="lei-loading">Ingen steder funnet i nærheten.</div>';
  } else {
    venuesHtml = '<div class="lei-loading">laster steder…</div>';
  }

  return '<div class="lei-header">'
    + '<div class="lei-title">Utforsk</div>'
    + '<button class="lei-mode-btn" id="lei-commute-btn">← pendler</button>'
    + '</div>'
    + wHtml
    + locHtml
    + radiusHtml
    + '<div class="lei-cats">' + pills + '</div>'
    + '<div id="lei-venues">' + venuesHtml + '</div>';
}

function _attachListeners(el, pos) {
  // Mode toggle
  document.getElementById('lei-commute-btn').addEventListener('click', () => {
    saveWeekendMode(false);
    show('v-board');
    window._startBoard && window._startBoard();
  });

  // Location bar — "endre" toggles the search panel
  document.getElementById('lei-loc-edit-btn').addEventListener('click', () => {
    const search = document.getElementById('lei-loc-search');
    if (!search) return;
    const open = search.style.display !== 'none';
    search.style.display = open ? 'none' : 'block';
    if (!open) {
      const inp = document.getElementById('lei-loc-input');
      if (inp) { inp.value = ''; inp.focus(); }
    }
  });

  // Location input + suggestions
  _attachLocInput(el);

  // Radius pills
  el.querySelectorAll('.lei-radius-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = Number(btn.dataset.r);
      if (r === _radius) return;
      _radius = r;
      el.querySelectorAll('.lei-radius-btn').forEach(b =>
        b.classList.toggle('active', Number(b.dataset.r) === r));
      _venues = null;
      _expanded = null;
      const p = _locOvr || state.homeLL;
      if (p) _loadVenues(_activeCat(), p);
    });
  });

  // Category pills
  el.querySelectorAll('.lei-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      if (_catIdx === idx) return;
      _catIdx = idx;
      _venues = null;
      _expanded = null;
      el.querySelectorAll('.lei-cat-btn').forEach(b =>
        b.classList.toggle('active', Number(b.dataset.idx) === idx));
      const venEl = document.getElementById('lei-venues');
      if (venEl) venEl.innerHTML = '<div class="lei-loading">laster steder…</div>';
      const p = _locOvr || state.homeLL;
      if (p) _loadVenues(LEISURE_CATS[idx], p);
    });
  });

  _attachVenueListeners(el);
}

function _attachLocInput(el) {
  const inp = document.getElementById('lei-loc-input');
  if (!inp) return;
  let _timer = null;

  inp.addEventListener('input', () => {
    const q = inp.value.trim();
    const sugg = document.getElementById('lei-loc-sugg');
    clearTimeout(_timer);
    if (!sugg || q.length < 2) { if (sugg) { sugg.hidden = true; sugg.innerHTML = ''; } return; }
    _timer = setTimeout(() => {
      geocodePlace(q).then(results => {
        const s = document.getElementById('lei-loc-sugg');
        if (!s) return;
        s.innerHTML = '';
        if (!results.length) { s.hidden = true; return; }
        results.slice(0, 5).forEach(r => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = r.label;
          btn.addEventListener('mousedown', ev => ev.preventDefault());
          btn.addEventListener('click', () => {
            _locOvr = { lat: r.lat, lon: r.lon, label: r.label };
            _venues = null;
            _weather = null;
            renderLeisure();  // full re-render: new pos, new weather, new venues
          });
          s.appendChild(btn);
        });
        s.hidden = false;
      }).catch(() => {});
    }, 250);
  });

  inp.addEventListener('blur', () => {
    setTimeout(() => {
      const s = document.getElementById('lei-loc-sugg');
      if (s) s.hidden = true;
    }, 150);
  });
}

function _attachVenueListeners(el) {
  const venEl = document.getElementById('lei-venues');
  if (!venEl) return;

  venEl.querySelectorAll('.lei-venue-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.lei-reis-btn')) return;
      const idx = Number(card.dataset.idx);
      _expanded = (_expanded === idx) ? null : idx;
      venEl.innerHTML = _venues.map((v, i) => _cardHtml(v, i)).join('');
      _attachVenueListeners(el);
    });
  });

  venEl.querySelectorAll('.lei-reis-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const v = _venues && _venues[Number(btn.dataset.idx)];
      if (v) _reisDit(v);
    });
  });
}

function _cardHtml(v, i) {
  const dist = v.dist < 1000 ? v.dist + ' m' : (v.dist / 1000).toFixed(1) + ' km';
  const hoursHtml = v.hours
    ? '<span class="lei-venue-hours ' + (v.hours.isOpen ? 'open' : 'closed') + '">'
      + v.hours.label + '</span>'
    : '';
  const expandedHtml = _expanded === i
    ? '<div class="lei-venue-expanded">'
      + '<div class="lei-venue-type">' + v.emoji + ' ' + v.type + '</div>'
      + '<button class="lei-reis-btn" data-idx="' + i + '">Reis dit →</button>'
      + '</div>'
    : '';
  return '<div class="lei-venue-card" data-idx="' + i + '">'
    + '<div class="lei-venue-row">'
    + '<span class="lei-venue-emoji">' + v.emoji + '</span>'
    + '<span class="lei-venue-name">' + v.name + '</span>'
    + hoursHtml
    + '<span class="lei-venue-dist">' + dist + '</span>'
    + '</div>'
    + expandedHtml
    + '</div>';
}

function _reisDit(venue) {
  const ns = state.nearestStation;
  const pos = _locOvr || state.homeLL;
  config.dirs[2] = {
    key: 'custom-out',
    from: ns ? ns.name : (_locOvr ? _locOvr.label : 'Min posisjon'),
    to: venue.name,
    stopId: null,
    toStopId: null,
    filter: null,
    geo: null,
    toGeo: null,
    line: null,
    _fromLat: ns ? ns.lat : (pos ? pos.lat : null),
    _fromLon: ns ? ns.lon : (pos ? pos.lon : null),
    _toLat: venue.lat,
    _toLon: venue.lon,
  };
  state.dIdx = 2;
  updateHeader();
  saveWeekendMode(false);
  show('v-board');
  window._startBoard && window._startBoard();
}

function _updateWeatherEl() {
  const el = document.getElementById('lei-weather');
  if (!el || !_weather) return;
  el.textContent = _weather.icon + ' ' + _weather.temp + '°'
    + (_weather.advice ? ' · ' + _weather.advice : '');
}

function _loadVenues(cat, pos) {
  _loading = true;
  const venEl = document.getElementById('lei-venues');
  if (venEl) venEl.innerHTML = '<div class="lei-loading">laster steder…</div>';

  fetchNearbyPlaces(pos.lat, pos.lon, cat.amenities, 8, _radius)
    .then(places => {
      _venues = places;
      _loading = false;
      const el = document.getElementById('v-leisure');
      const vEl = document.getElementById('lei-venues');
      if (!vEl || !el) return;
      vEl.innerHTML = places.length
        ? places.map((v, i) => _cardHtml(v, i)).join('')
        : '<div class="lei-loading">Ingen steder funnet i nærheten.</div>';
      _attachVenueListeners(el);
    })
    .catch(() => {
      _loading = false;
      const vEl = document.getElementById('lei-venues');
      if (vEl) vEl.innerHTML = '<div class="lei-loading">Kunne ikke laste steder.</div>';
    });
}

window._renderLeisure = renderLeisure;
