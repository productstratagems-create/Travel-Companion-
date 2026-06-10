import config from '../config.js';
import { state } from '../state.js';
import { haver, loadWalkSpeed, saveWalkSpeed, loadWalkBuffer, saveWalkBuffer, loadWalkFrom, saveWalkFrom, clearWalkFrom } from '../geo.js';
import { loadTheme, setTheme } from '../theme.js';
import { geocodePlace, geocodeDest } from '../api/entur.js';
import { makeSuggBtn } from '../ui/fmt.js';
import { fetchNearbyPlaces } from '../api/places.js';

const DEST_KEY = 't.dest';
const DEP_KEY = 't.dep';
const VIA_KEY = 't.via';

const TRANSIT_CATEGORIES = ['metroStation', 'busStation', 'onstreetBus', 'tramStation', 'ferryStop'];

const EXPLORE_CATS = [
  { label: 'spise',  emoji: '🍽', amenities: ['catering.restaurant', 'catering.fast_food'] },
  { label: 'kaffe',  emoji: '☕', amenities: ['catering.cafe', 'catering.bakery'] },
  { label: 'kultur', emoji: '🏛', amenities: ['entertainment.museum', 'entertainment.cinema', 'entertainment.theatre', 'entertainment.arts_centre', 'education.library'] },
  { label: 'handel', emoji: '🛍', amenities: ['commercial.clothing', 'commercial.shoes', 'commercial.sport', 'commercial.books', 'commercial.electronics', 'commercial.shopping_mall'] },
  { label: 'drikke', emoji: '🍺', amenities: ['catering.bar', 'catering.pub'] },
];

let _depAbort = null, _arrAbort = null, _viaAbort = null, _wfAbort = null;
let _depTimer = null, _arrTimer = null, _viaTimer = null, _wfTimer = null;
let _destPreviewLL = null;
let _destPreviewCatIdx = 0;

const _depStopIds = new Map();
const _arrStopIds = new Map();
const _viaStopIds = new Map();

function suggestStops(query, suggId, inputId, clearId, stopMap, getAbort, setAbort, getTimer, setTimer) {
  clearTimeout(getTimer());
  const suggEl = document.getElementById(suggId);
  if (query.length < 2) {
    if (suggEl) { suggEl.hidden = true; suggEl.innerHTML = ''; }
    return;
  }
  setTimer(setTimeout(() => {
    if (getAbort()) getAbort().abort();
    const ctrl = new AbortController();
    setAbort(ctrl);
    fetch(config.api.geocoder + '?text=' + encodeURIComponent(query) + '&size=8&layers=venue&focus.point.lat=59.9139&focus.point.lon=10.7522',
      { signal: ctrl.signal })
      .then(r => r.json())
      .then(j => {
        const sugg = document.getElementById(suggId);
        const inp = document.getElementById(inputId);
        if (!sugg || !inp) return;
        const stops = ((j && j.features) || [])
          .filter(f => (f.properties.category || []).some(c => TRANSIT_CATEGORIES.includes(c)))
          .filter(f => {
            const coords = f.geometry && f.geometry.coordinates;
            return coords && haver(coords[1], coords[0], 59.9139, 10.7522) < 80000;
          });
        stopMap.clear();
        sugg.innerHTML = '';
        if (!stops.length) { sugg.hidden = true; return; }
        stops.forEach(f => {
          const name = f.properties.name || f.properties.label;
          stopMap.set(name, { id: f.properties.id, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] });
          sugg.appendChild(makeSuggBtn(name, f.properties.category || [], () => {
            inp.value = name;
            sugg.hidden = true;
            sugg.innerHTML = '';
            syncClear(inputId, clearId);
          }));
        });
        sugg.hidden = false;
      })
      .catch(() => {});
  }, 250));
}

function syncClear(inputId, clearId) {
  const btn = document.getElementById(clearId);
  const inp = document.getElementById(inputId);
  if (btn) btn.style.display = (inp && inp.value) ? 'flex' : 'none';
}

function _highlightPrefs() {
  const spd = loadWalkSpeed();
  document.querySelectorAll('#pref-speed .pref-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.val === spd);
  });
  const buf = String(loadWalkBuffer());
  document.querySelectorAll('#pref-buf .pref-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.val === buf);
  });
  const theme = loadTheme();
  document.querySelectorAll('#pref-theme .pref-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.val === theme);
  });
}

function initPrefs() {
  document.querySelectorAll('#pref-speed .pref-btn').forEach(btn => {
    btn.addEventListener('click', () => { saveWalkSpeed(btn.dataset.val); _highlightPrefs(); });
  });
  document.querySelectorAll('#pref-buf .pref-btn').forEach(btn => {
    btn.addEventListener('click', () => { saveWalkBuffer(Number(btn.dataset.val)); _highlightPrefs(); });
  });
  document.querySelectorAll('#pref-theme .pref-btn').forEach(btn => {
    btn.addEventListener('click', () => { setTheme(btn.dataset.val); _highlightPrefs(); });
  });
}

function _showDestPreview(lat, lon) {
  _destPreviewLL = { lat, lon };
  const panel = document.getElementById('dest-preview');
  if (!panel) return;
  panel.style.display = 'block';
  _renderDestPills();
  _fetchDestVenues();
}

function _renderDestPills() {
  const el = document.getElementById('dest-prev-cats');
  if (!el) return;
  el.innerHTML = EXPLORE_CATS.map((c, i) =>
    '<button class="dest-prev-cat' + (i === _destPreviewCatIdx ? ' active' : '') + '" data-idx="' + i + '">'
    + c.emoji + ' ' + c.label + '</button>'
  ).join('');
  el.querySelectorAll('.dest-prev-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      _destPreviewCatIdx = Number(btn.dataset.idx);
      _renderDestPills();
      _fetchDestVenues();
    });
  });
}

function _fetchDestVenues() {
  if (!_destPreviewLL) return;
  const res = document.getElementById('dest-prev-results');
  if (!res) return;
  res.innerHTML = '<div class="dest-prev-loading">laster steder…</div>';
  const cat = EXPLORE_CATS[_destPreviewCatIdx];
  fetchNearbyPlaces(_destPreviewLL.lat, _destPreviewLL.lon, cat.amenities, 5)
    .then(places => {
      if (!places.length) {
        res.innerHTML = '<div class="dest-prev-empty">Ingen ' + cat.label + 'steder funnet i nærheten.</div>';
        return;
      }
      res.innerHTML = places.map(p => {
        const distTxt = p.dist < 1000 ? p.dist + ' m' : (p.dist / 1000).toFixed(1) + ' km';
        const hoursTxt = p.hours
          ? '<span class="dest-prev-hours' + (p.hours.isOpen ? ' open' : ' closed') + '">'
            + p.hours.label + '</span>'
          : '';
        return '<div class="dest-prev-row">'
          + '<span class="dest-prev-emoji">' + p.emoji + '</span>'
          + '<span class="dest-prev-name">' + p.name + '</span>'
          + hoursTxt
          + '<span class="dest-prev-dist">' + distTxt + '</span>'
          + '</div>';
      }).join('');
    })
    .catch(() => {
      res.innerHTML = '<div class="dest-prev-empty">Kunne ikke laste steder.</div>';
    });
}

export function initSettings() {
  const depEl = document.getElementById('set-dep');
  const arrEl = document.getElementById('set-arr');
  if (depEl) depEl.addEventListener('input', e =>
    suggestStops(e.target.value.trim(), 'dep-sugg', 'set-dep', 'set-dep-clear', _depStopIds,
      () => _depAbort, v => { _depAbort = v; },
      () => _depTimer, v => { _depTimer = v; }));
  if (arrEl) arrEl.addEventListener('input', e => {
    const q = e.target.value.trim();
    clearTimeout(_arrTimer);
    const suggEl = document.getElementById('arr-sugg');
    if (q.length < 2) { if (suggEl) { suggEl.hidden = true; suggEl.innerHTML = ''; } return; }
    _arrTimer = setTimeout(() => {
      if (_arrAbort) { _arrAbort.abort(); }
      _arrAbort = new AbortController();
      geocodeDest(q).then(results => {
        const sugg = document.getElementById('arr-sugg');
        const inp = document.getElementById('set-arr');
        if (!sugg || !inp) return;
        _arrStopIds.clear();
        sugg.innerHTML = '';
        if (!results.length) { sugg.hidden = true; return; }
        results.forEach(r => {
          _arrStopIds.set(r.label, { id: r.id, lat: r.lat, lon: r.lon });
          sugg.appendChild(makeSuggBtn(r.label, r.category || [], () => {
            inp.value = r.label;
            sugg.hidden = true;
            sugg.innerHTML = '';
            syncClear('set-arr', 'set-arr-clear');
            if (r.lat && r.lon) _showDestPreview(r.lat, r.lon);
          }));
        });
        sugg.hidden = false;
      }).catch(() => {});
    }, 250);
  });

  const viaEl = document.getElementById('set-via');
  if (viaEl) viaEl.addEventListener('input', e =>
    suggestStops(e.target.value.trim(), 'via-sugg', 'set-via', 'set-via-clear', _viaStopIds,
      () => _viaAbort, v => { _viaAbort = v; },
      () => _viaTimer, v => { _viaTimer = v; }));

  ['dep', 'arr', 'via'].forEach(id => {
    const inp = document.getElementById('set-' + id);
    const btn = document.getElementById('set-' + id + '-clear');
    const sugg = document.getElementById(id + '-sugg');
    if (!inp || !btn) return;
    inp.addEventListener('input', () => {
      btn.style.display = inp.value ? 'flex' : 'none';
    });
    inp.addEventListener('blur', () => {
      setTimeout(() => { if (sugg) { sugg.hidden = true; } }, 150);
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Escape' && sugg) { sugg.hidden = true; sugg.innerHTML = ''; }
    });
    if (id === 'via') {
      btn.addEventListener('click', () => {
        inp.value = '';
        btn.style.display = 'none';
        if (sugg) { sugg.hidden = true; sugg.innerHTML = ''; }
        _viaStopIds.clear();
        clearVia();
        const wrap = document.getElementById('set-via-wrap');
        const toggle = document.getElementById('set-via-toggle');
        if (wrap) wrap.style.display = 'none';
        if (toggle) toggle.style.display = 'block';
      });
    } else {
      btn.addEventListener('click', () => {
        inp.value = '';
        btn.style.display = 'none';
        if (sugg) { sugg.hidden = true; sugg.innerHTML = ''; }
        if (id === 'arr') {
          _destPreviewLL = null;
          const preview = document.getElementById('dest-preview');
          if (preview) preview.style.display = 'none';
        }
        inp.focus();
      });
    }
  });

  const viaAddBtn = document.getElementById('set-via-add');
  if (viaAddBtn) {
    viaAddBtn.addEventListener('click', () => {
      const wrap = document.getElementById('set-via-wrap');
      const toggle = document.getElementById('set-via-toggle');
      if (wrap) wrap.style.display = 'block';
      if (toggle) toggle.style.display = 'none';
      const vi = document.getElementById('set-via');
      if (vi) vi.focus();
    });
  }

  // Walk-from: show/hide toggle
  const wfAddBtn = document.getElementById('set-walkfrom-add');
  if (wfAddBtn) {
    wfAddBtn.addEventListener('click', () => {
      const wrap = document.getElementById('set-walkfrom-wrap');
      const toggle = document.getElementById('set-walkfrom-toggle');
      if (wrap) wrap.style.display = 'block';
      if (toggle) toggle.style.display = 'none';
      const wfi = document.getElementById('set-walkfrom');
      if (wfi) wfi.focus();
    });
  }

  // Walk-from: input → geocode any place
  const wfEl = document.getElementById('set-walkfrom');
  if (wfEl) {
    wfEl.addEventListener('input', () => {
      const q = wfEl.value.trim();
      syncClear('set-walkfrom', 'set-walkfrom-clear');
      if (_wfTimer) clearTimeout(_wfTimer);
      if (_wfAbort) { _wfAbort.abort(); _wfAbort = null; }
      const sugg = document.getElementById('walkfrom-sugg');
      if (!sugg) return;
      if (q.length < 2) { sugg.hidden = true; sugg.innerHTML = ''; return; }
      _wfTimer = setTimeout(() => {
        _wfAbort = new AbortController();
        geocodePlace(q).then(results => {
          sugg.innerHTML = '';
          if (!results.length) { sugg.hidden = true; return; }
          results.slice(0, 6).forEach(r => {
            sugg.appendChild(makeSuggBtn(r.label, r.category || [], () => {
              wfEl.value = r.label;
              sugg.hidden = true;
              sugg.innerHTML = '';
              syncClear('set-walkfrom', 'set-walkfrom-clear');
              state.walkFromLL = { lat: r.lat, lon: r.lon };
              saveWalkFrom({ label: r.label, lat: r.lat, lon: r.lon });
              window._logMsg && window._logMsg('gå fra: ' + r.label);
            }));
          });
          sugg.hidden = false;
        }).catch(() => {});
      }, 250);
    });
    wfEl.addEventListener('blur', () => {
      setTimeout(() => {
        const sugg = document.getElementById('walkfrom-sugg');
        if (sugg) sugg.hidden = true;
      }, 150);
    });
    wfEl.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const sugg = document.getElementById('walkfrom-sugg');
        if (sugg) { sugg.hidden = true; sugg.innerHTML = ''; }
      }
    });
  }

  // Walk-from: clear button
  const wfClearBtn = document.getElementById('set-walkfrom-clear');
  if (wfClearBtn) {
    wfClearBtn.addEventListener('click', () => {
      const inp = document.getElementById('set-walkfrom');
      const sugg = document.getElementById('walkfrom-sugg');
      const wrap = document.getElementById('set-walkfrom-wrap');
      const toggle = document.getElementById('set-walkfrom-toggle');
      if (inp) inp.value = '';
      if (sugg) { sugg.hidden = true; sugg.innerHTML = ''; }
      if (wrap) wrap.style.display = 'none';
      if (toggle) toggle.style.display = 'block';
      syncClear('set-walkfrom', 'set-walkfrom-clear');
      clearWalkFrom();
      window._logMsg && window._logMsg('gå fra: tilbakestilt til GPS');
    });
  }

  initPrefs();
}

export function showSettings() {
  const ns = state.nearestStation;
  const depEl = document.getElementById('set-dep');

  // Dep input always visible — pre-fill from: saved > GPS station > current dir
  if (depEl) {
    const saved = loadDep();
    depEl.value = saved || (ns ? ns.name : (config.dirs[state.dIdx] ? config.dirs[state.dIdx].from : ''));
    syncClear('set-dep', 'set-dep-clear');
  }

  // Nearby station list
  const nearbyList = document.getElementById('set-nearby-list');
  if (nearbyList) {
    const stations = (state.nearestStations && state.nearestStations.length)
      ? state.nearestStations : (ns ? [ns] : []);
    if (stations.length) {
      nearbyList.innerHTML = stations.map(s => {
        const spd = { rolig: 41.67, middels: 83.33, rask: 116.67 }[loadWalkSpeed()] || 83.33;
        const mins = s.distM != null
          ? Math.max(1, Math.ceil(s.distM * 1.3 / spd)) + loadWalkBuffer()
          : null;
        return '<button class="nearby-btn" data-name="' + s.name + '">'
          + '<span class="nearby-name">' + s.name + '</span>'
          + (mins != null ? '<span class="nearby-dist">' + mins + ' min</span>' : '')
          + '</button>';
      }).join('');
      nearbyList.style.display = 'block';
      nearbyList.querySelectorAll('.nearby-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (depEl) { depEl.value = btn.dataset.name; syncClear('set-dep', 'set-dep-clear'); }
          const arrEl = document.getElementById('set-arr');
          if (arrEl) arrEl.focus();
        });
      });
    } else {
      nearbyList.style.display = 'none';
    }
  }

  const arrEl = document.getElementById('set-arr');
  if (arrEl) { arrEl.value = loadDest() || ''; syncClear('set-arr', 'set-arr-clear'); }

  const savedVia = loadVia();
  const viaInput = document.getElementById('set-via');
  const viaWrap = document.getElementById('set-via-wrap');
  const viaToggle = document.getElementById('set-via-toggle');
  if (viaInput) { viaInput.value = savedVia || ''; syncClear('set-via', 'set-via-clear'); }
  if (viaWrap) viaWrap.style.display = savedVia ? 'block' : 'none';
  if (viaToggle) viaToggle.style.display = savedVia ? 'none' : 'block';

  const savedWf = loadWalkFrom();
  const wfInput = document.getElementById('set-walkfrom');
  const wfWrap = document.getElementById('set-walkfrom-wrap');
  const wfToggle = document.getElementById('set-walkfrom-toggle');
  if (wfInput) { wfInput.value = savedWf ? savedWf.label : ''; syncClear('set-walkfrom', 'set-walkfrom-clear'); }
  if (wfWrap) wfWrap.style.display = savedWf ? 'block' : 'none';
  if (wfToggle) wfToggle.style.display = savedWf ? 'none' : 'block';

  document.getElementById('set-error').style.display = 'none';
  _highlightPrefs();

  // Restore destination preview if we already have resolved coords from a prior apply
  const prevDir = config.dirs[2];
  if (prevDir && prevDir._toLat && prevDir._toLon && loadDest()) {
    _showDestPreview(prevDir._toLat, prevDir._toLon);
  } else if (!_destPreviewLL) {
    const preview = document.getElementById('dest-preview');
    if (preview) preview.style.display = 'none';
  }
}

export function applyRoute() {
  const ns = state.nearestStation;
  const dep = document.getElementById('set-dep').value.trim();
  const arr = document.getElementById('set-arr').value.trim();
  const errEl = document.getElementById('set-error');
  if (!dep || !arr) {
    errEl.textContent = !dep ? 'Fyll inn avgangssted.' : 'Fyll inn destinasjon.';
    errEl.style.display = 'block';
    return false;
  }
  if (dep.toLowerCase() === arr.toLowerCase()) {
    errEl.textContent = 'Fra og til kan ikke være samme stasjon.';
    errEl.style.display = 'block';
    return false;
  }

  // Resolve departure stop ID + coords: GPS > nearestStations list > autocomplete map > geocode
  const depMatchesGps = ns && ns.name.toLowerCase() === dep.toLowerCase();
  const depNearby = !depMatchesGps
    && state.nearestStations.find(s => s.name.toLowerCase() === dep.toLowerCase());
  const depEntry = _depStopIds.get(dep);  // { id, lat, lon } | null
  const depId  = depMatchesGps ? ns.id   : (depNearby ? depNearby.id  : (depEntry ? depEntry.id  : null));
  const depLat = depMatchesGps ? ns.lat  : (depNearby ? depNearby.lat : (depEntry ? depEntry.lat : null));
  const depLon = depMatchesGps ? ns.lon  : (depNearby ? depNearby.lon : (depEntry ? depEntry.lon : null));

  // Resolve destination: autocomplete map gives { id, lat, lon }; id may be null for addresses
  const arrEntry = _arrStopIds.get(arr);  // { id, lat, lon } | null
  const arrId  = arrEntry ? arrEntry.id  : null;
  const arrLat = arrEntry ? arrEntry.lat : null;
  const arrLon = arrEntry ? arrEntry.lon : null;

  // Resolve optional via stop ID: autocomplete map > geocode
  const viaRaw = (document.getElementById('set-via') || {}).value;
  const via = (viaRaw && viaRaw.trim()) || null;
  const viaEntry = via ? _viaStopIds.get(via) : null;
  const viaId = viaEntry ? viaEntry.id : null;

  config.dirs[2] = {
    key: 'custom-out',
    from: dep,
    to:   arr,
    stopId:   depId,
    toStopId: arrId,
    filter:   null,
    geo:      depId ? null : dep,
    toGeo:    (arrId || arrLat) ? null : arr,
    line:     null,
    via:      via || null,
    viaStopId: viaId || null,
    viaGeo:   (via && !viaId) ? via : null,
    _fromLat: depLat,
    _fromLon: depLon,
    _toLat:   arrLat,
    _toLon:   arrLon,
  };
  state.dIdx = 2;
  saveDep(dep);
  saveDest(arr);
  saveVia(via);
  return true;
}

export function applyRouteFromState(arr) {
  const ns = state.nearestStation;
  if (!arr) return false;
  const savedDep = loadDep();
  const dep = savedDep || (ns ? ns.name : null);
  if (!dep) return false;
  const depMatchesGps = ns && ns.name.toLowerCase() === dep.toLowerCase();
  const depNearby = !depMatchesGps
    && state.nearestStations.find(s => s.name.toLowerCase() === dep.toLowerCase());
  const depId  = depMatchesGps ? ns.id   : (depNearby ? depNearby.id  : null);
  const depLat = depMatchesGps ? ns.lat  : (depNearby ? depNearby.lat : null);
  const depLon = depMatchesGps ? ns.lon  : (depNearby ? depNearby.lon : null);
  config.dirs[2] = {
    key: 'custom-out',
    from: dep,
    to:   arr,
    stopId:   depId,
    toStopId: null,
    filter:   null,
    geo:      depId ? null : dep,
    toGeo:    arr,
    line:     null,
    _fromLat: depLat,
    _fromLon: depLon,
  };
  state.dIdx = 2;
  return true;
}

export function loadDest() {
  try { return localStorage.getItem(DEST_KEY) || null; } catch { return null; }
}

export function saveDest(arr) {
  try { localStorage.setItem(DEST_KEY, arr); } catch {}
}

export function loadDep() {
  try { return localStorage.getItem(DEP_KEY) || null; } catch { return null; }
}

export function saveDep(name) {
  try { localStorage.setItem(DEP_KEY, name); } catch {}
}

export function loadVia() {
  try { return localStorage.getItem(VIA_KEY) || null; } catch { return null; }
}

function saveVia(v) {
  try { if (v) localStorage.setItem(VIA_KEY, v); else localStorage.removeItem(VIA_KEY); } catch {}
}

function clearVia() {
  try { localStorage.removeItem(VIA_KEY); } catch {}
}

// Kept for backward compat — no-op; GPS now determines departure
export function loadCustomRoute() {}
