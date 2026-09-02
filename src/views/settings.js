import config from '../config.js';
import { enturFetch } from '../api/http.js';
import { recordSmartTrip } from '../api/smart.js';
import { state } from '../state.js';
import { storage, listProfiles, getActiveProfile, createProfile, switchProfile, deleteProfile } from '../storage.js';
import { haver, loadWalkSpeed, saveWalkSpeed, loadWalkBuffer, saveWalkBuffer, loadWalkFrom, saveWalkFrom, clearWalkFrom, landingPref, saveLandingPref } from '../geo.js';
import { loadTheme, setTheme, loadPalette, setPalette } from '../theme.js';
import { geocodePlace, geocodeDest, TRANSIT_CAT } from '../api/entur.js';
import { makeSuggBtn, esc, venueDetailHtml } from '../ui/fmt.js';
import { fetchNearbyPlaces } from '../api/places.js';
import { renderRouteShortcuts } from '../ui/favs.js';
import { loadReturn, saveReturn, clearReturn, reverseOf, suggestHHMM, returnWindow, skipToday } from '../api/returnTrip.js';
import { loadSmartHist } from '../api/smart.js';

const DEST_KEY = 't.dest';
const DEP_KEY = 't.dep';
const VIA_KEY = 't.via';

const TRANSIT_CATEGORIES = TRANSIT_CAT;

const EXPLORE_CATS = [
  { label: 'spise',  emoji: '🍽', amenities: ['catering.restaurant', 'catering.fast_food'] },
  { label: 'kaffe',  emoji: '☕', amenities: ['catering.cafe', 'catering.bakery'] },
  { label: 'kultur', emoji: '🏗', amenities: ['entertainment.museum', 'entertainment.cinema', 'entertainment.theatre', 'entertainment.arts_centre', 'education.library'] },
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

function _prependFreqToSugg(sugg, inp, role, query, stopMap, onPick) {
  const key = role === 'dep' ? FREQ_DEP_KEY : FREQ_ARR_KEY;
  const all  = _loadFreq(key);
  const q    = (query || '').toLowerCase();
  const matches = q.length
    ? all.filter(p => p.name.toLowerCase().includes(q)).slice(0, 3)
    : all.slice(0, 4);
  const added = new Set();
  matches.forEach(p => {
    added.add(p.name.toLowerCase());
    if (p.lat) stopMap.set(p.name, { id: p.stopId || null, lat: p.lat, lon: p.lon });
    const btn = makeSuggBtn(p.name, p.stopId ? ['metroStation'] : [], () => {
      inp.value = p.name;
      sugg.hidden = true; sugg.innerHTML = '';
      syncClear(inp.id, inp.id + '-clear');
      if (onPick) onPick(p);
    });
    btn.classList.add('freq-sugg');
    sugg.appendChild(btn);
  });
  return added;
}

function suggestStops(query, suggId, inputId, clearId, stopMap, getAbort, setAbort, getTimer, setTimer, role) {
  clearTimeout(getTimer());
  const suggEl = document.getElementById(suggId);
  const inp    = document.getElementById(inputId);
  if (!suggEl || !inp) return;

  if (!query.length) {
    suggEl.innerHTML = '';
    const added = _prependFreqToSugg(suggEl, inp, role, '', stopMap, null);
    suggEl.hidden = !added.size;
    return;
  }

  if (query.length < 2) {
    suggEl.hidden = true; suggEl.innerHTML = '';
    return;
  }

  setTimer(setTimeout(() => {
    if (getAbort()) getAbort().abort();
    const ctrl = new AbortController();
    setAbort(ctrl);
    enturFetch(config.api.geocoder + '?text=' + encodeURIComponent(query) + '&size=8&layers=venue&focus.point.lat=59.9139&focus.point.lon=10.7522',
      { signal: ctrl.signal })
      .then(r => r.json())
      .then(j => {
        const sugg = document.getElementById(suggId);
        const inp2 = document.getElementById(inputId);
        if (!sugg || !inp2) return;
        const stops = ((j && j.features) || [])
          .filter(f => (f.properties.category || []).some(c => TRANSIT_CATEGORIES.includes(c)))
          .filter(f => {
            const coords = f.geometry && f.geometry.coordinates;
            return coords && haver(coords[1], coords[0], 59.9139, 10.7522) < 80000;
          });
        stopMap.clear();
        sugg.innerHTML = '';
        const freqNames = _prependFreqToSugg(sugg, inp2, role, query, stopMap, null);
        const fresh = stops.filter(f => {
          const name = (f.properties.name || f.properties.label || '').toLowerCase();
          return !freqNames.has(name);
        });
        if (!fresh.length && !freqNames.size) { sugg.hidden = true; return; }
        fresh.forEach(f => {
          const name = f.properties.name || f.properties.label;
          stopMap.set(name, { id: f.properties.id, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] });
          sugg.appendChild(makeSuggBtn(name, f.properties.category || [], () => {
            inp2.value = name;
            sugg.hidden = true; sugg.innerHTML = '';
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
  const palette = loadPalette();
  document.querySelectorAll('#pref-palette .pref-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.val === palette);
  });
  const landing = landingPref();
  document.querySelectorAll('#pref-landing .pref-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.val === landing);
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
  document.querySelectorAll('#pref-palette .pref-btn').forEach(btn => {
    btn.addEventListener('click', () => { setPalette(btn.dataset.val); _highlightPrefs(); });
  });
  // The one place that decides which screen the app opens on. It used to be
  // written as a side effect of navigating, from two different buttons, and
  // was visible nowhere.
  document.querySelectorAll('#pref-landing .pref-btn').forEach(btn => {
    btn.addEventListener('click', () => { saveLandingPref(btn.dataset.val); _highlightPrefs(); });
  });
}

const DEST_PEEK_KEY = 't.destPeek';

/**
 * Is the reader interested in what is at the other end?
 *
 * Reported: this section should be collapsed so the reader can decide whether
 * it is relevant. It used to open itself the instant a destination was picked
 * and fetch immediately — so a screen whose whole job is choosing a route
 * spent height on five category chips and, when the places API was
 * unreachable, answered with "Kunne ikke laste steder."
 *
 * The answer is remembered, because being asked to choose the same thing
 * every time is not really choosing. Opening it once is a standing yes.
 */
function _destPeekOn() {
  return storage.get(DEST_PEEK_KEY) === '1';
}
function _setDestPeek(on) {
  if (on) storage.set(DEST_PEEK_KEY, '1'); else storage.remove(DEST_PEEK_KEY);
}

/**
 * A destination now has coordinates: offer the section, or open it if the
 * reader has already said yes once.
 *
 * Nothing is fetched here. `_openDestPreview` is the only thing that reaches
 * the network, and it only runs when someone has asked to see this.
 */
function _showDestPreview(lat, lon) {
  _destPreviewLL = { lat, lon };
  const toggle = document.getElementById('dest-prev-toggle');
  if (toggle) toggle.style.display = _destPeekOn() ? 'none' : 'block';
  if (_destPeekOn()) _openDestPreview();
  else {
    const panel = document.getElementById('dest-preview');
    if (panel) panel.style.display = 'none';
  }
}

function _openDestPreview() {
  const panel = document.getElementById('dest-preview');
  if (!panel || !_destPreviewLL) return;
  panel.style.display = 'block';
  const toggle = document.getElementById('dest-prev-toggle');
  if (toggle) toggle.style.display = 'none';
  _renderDestPills();
  _fetchDestVenues();
}

function _hideDestPreview() {
  const panel = document.getElementById('dest-preview');
  const toggle = document.getElementById('dest-prev-toggle');
  if (panel) panel.style.display = 'none';
  if (toggle) toggle.style.display = _destPreviewLL ? 'block' : 'none';
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
  // The guard sits at the network call, not at the call sites. "Nothing is
  // fetched until the reader asks" is the property that matters here, and a
  // property enforced by remembering to call things in the right order is a
  // property that lasts until the next caller.
  if (!_destPreviewLL || !_destPeekOn()) return;
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
          + '<span class="dest-prev-main">'
          + '<span class="dest-prev-name">' + esc(p.name) + '</span>'
          + venueDetailHtml(p)
          + '</span>'
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

  function _runDepSugg(q) {
    suggestStops(q, 'dep-sugg', 'set-dep', 'set-dep-clear', _depStopIds,
      () => _depAbort, v => { _depAbort = v; },
      () => _depTimer, v => { _depTimer = v; }, 'dep');
  }

  if (depEl) {
    depEl.addEventListener('input', e => _runDepSugg(e.target.value.trim()));
    depEl.addEventListener('focus', () => { if (!depEl.value.trim()) _runDepSugg(''); });
  }

  function _runArrSugg(q) {
    const suggEl = document.getElementById('arr-sugg');
    const inp    = document.getElementById('set-arr');
    if (!suggEl || !inp) return;

    if (!q.length) {
      suggEl.innerHTML = '';
      const added = _prependFreqToSugg(suggEl, inp, 'arr', '', _arrStopIds, p => {
        if (p.lat && p.lon) _showDestPreview(p.lat, p.lon);
      });
      suggEl.hidden = !added.size;
      return;
    }

    clearTimeout(_arrTimer);
    if (q.length < 2) { suggEl.hidden = true; suggEl.innerHTML = ''; return; }
    _arrTimer = setTimeout(() => {
      if (_arrAbort) _arrAbort.abort();
      _arrAbort = new AbortController();
      geocodeDest(q).then(results => {
        const sugg = document.getElementById('arr-sugg');
        const i    = document.getElementById('set-arr');
        if (!sugg || !i) return;
        _arrStopIds.clear();
        sugg.innerHTML = '';
        const freqNames = _prependFreqToSugg(sugg, i, 'arr', q, _arrStopIds, p => {
          if (p.lat && p.lon) _showDestPreview(p.lat, p.lon);
        });
        const fresh = results.filter(r => !freqNames.has(r.label.toLowerCase()));
        if (!fresh.length && !freqNames.size) { sugg.hidden = true; return; }
        fresh.forEach(r => {
          const existing = _arrStopIds.get(r.label);
          if (!existing || !existing.id) _arrStopIds.set(r.label, { id: r.id, lat: r.lat, lon: r.lon });
          sugg.appendChild(makeSuggBtn(r.label, r.category || [], () => {
            i.value = r.label;
            sugg.hidden = true; sugg.innerHTML = '';
            syncClear('set-arr', 'set-arr-clear');
            if (r.lat && r.lon) _showDestPreview(r.lat, r.lon);
          }));
        });
        sugg.hidden = false;
      }).catch(() => {});
    }, 250);
  }

  if (arrEl) {
    arrEl.addEventListener('input', e => _runArrSugg(e.target.value.trim()));
    arrEl.addEventListener('focus', () => { if (!arrEl.value.trim()) _runArrSugg(''); });
  }

  const viaEl = document.getElementById('set-via');
  if (viaEl) viaEl.addEventListener('input', e =>
    suggestStops(e.target.value.trim(), 'via-sugg', 'set-via', 'set-via-clear', _viaStopIds,
      () => _viaAbort, v => { _viaAbort = v; },
      () => _viaTimer, v => { _viaTimer = v; }, 'via'));

  const quickOslBtn = document.getElementById('set-quick-osl');
  if (quickOslBtn) {
    quickOslBtn.addEventListener('click', () => {
      const inp = document.getElementById('set-arr');
      const sugg = document.getElementById('arr-sugg');
      if (sugg) { sugg.hidden = true; sugg.innerHTML = ''; }
      if (_arrAbort) _arrAbort.abort();
      _arrAbort = new AbortController();
      geocodeDest('Oslo lufthavn').then(results => {
        if (!results.length) return;
        const r = results.find(x => x.id) || results[0];
        _arrStopIds.clear();
        _arrStopIds.set(r.label, { id: r.id, lat: r.lat, lon: r.lon });
        if (inp) inp.value = r.label;
        syncClear('set-arr', 'set-arr-clear');
        if (r.lat && r.lon) _showDestPreview(r.lat, r.lon);
      }).catch(() => {});
    });
  }

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
          _hideDestPreview();
        }
        inp.focus();
      });
    }
  });

  const destOpenBtn = document.getElementById('dest-prev-open');
  if (destOpenBtn) {
    destOpenBtn.addEventListener('click', () => { _setDestPeek(true); _openDestPreview(); });
  }
  const destCloseBtn = document.getElementById('dest-prev-close');
  if (destCloseBtn) {
    destCloseBtn.addEventListener('click', () => { _setDestPeek(false); _hideDestPreview(); });
  }

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

  const retAddBtn = document.getElementById('set-ret-add');
  if (retAddBtn) {
    retAddBtn.addEventListener('click', () => {
      const wrap = document.getElementById('set-ret-wrap');
      const toggle = document.getElementById('set-ret-toggle');
      if (wrap) wrap.style.display = 'block';
      if (toggle) toggle.style.display = 'none';
      renderReturnSection();
      const t = document.getElementById('set-ret-time');
      if (t) t.focus();
    });
  }

  const retSaveBtn = document.getElementById('set-ret-save');
  if (retSaveBtn) {
    retSaveBtn.addEventListener('click', () => {
      const timeEl = document.getElementById('set-ret-time');
      const noteEl = document.getElementById('set-ret-note');
      const back = _pendingReturnDir();
      const hhmm = timeEl ? timeEl.value : '';
      if (!back || !/^\d{2}:\d{2}$/.test(hhmm)) {
        if (noteEl) noteEl.textContent = 'Sett et klokkeslett for når du går.';
        return;
      }
      saveReturn({ ...back, atHHMM: hhmm });
      renderReturnSection();
      if (noteEl) noteEl.textContent = 'Hjemreisen står klar: ' + back.from + ' → ' + back.to + ' kl. ' + hhmm + '.';
    });
  }

  const retClearBtn = document.getElementById('set-ret-clear');
  if (retClearBtn) {
    retClearBtn.addEventListener('click', () => {
      clearReturn();
      const timeEl = document.getElementById('set-ret-time');
      if (timeEl) timeEl.value = '';
      const wrap = document.getElementById('set-ret-wrap');
      const toggle = document.getElementById('set-ret-toggle');
      if (wrap) wrap.style.display = 'none';
      if (toggle) toggle.style.display = 'block';
      renderReturnSection();
    });
  }

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

/**
 * The two routes you actually use, as a shortcut past the whole form.
 *
 * Placed above «fra stasjon» because that is what a shortcut is for — seen
 * before you start filling anything in. Reuses .nearby-btn, the row already
 * standing directly below it, so the page gains no new shape to learn.
 */
function renderFavRouteShortcuts() {
  renderRouteShortcuts('set-fav-routes', 2);
}

/**
 * The trip home, filled in from the route you are setting.
 *
 * Prefilled rather than asked for twice: on a commute the return is the same
 * two places the other way round, and the one thing the app cannot guess is
 * when you leave. It suggests even that, from the reader's own history.
 */
function renderReturnSection() {
  const wrap = document.getElementById('set-ret-wrap');
  const toggle = document.getElementById('set-ret-toggle');
  const routeEl = document.getElementById('set-ret-route');
  const timeEl = document.getElementById('set-ret-time');
  const noteEl = document.getElementById('set-ret-note');
  const clearBtn = document.getElementById('set-ret-clear');
  if (!wrap || !toggle || !routeEl || !timeEl) return;

  const stored = loadReturn();
  const back = _pendingReturnDir();
  if (!back) {
    // Nothing to reverse yet — no route, no trip home.
    toggle.style.display = 'none';
    wrap.style.display = 'none';
    return;
  }
  routeEl.textContent = back.from + ' → ' + back.to;
  if (!timeEl.value) {
    timeEl.value = (stored && stored.atHHMM)
      || suggestHHMM(loadSmartHist(), back.from, back.to);
  }
  if (noteEl) {
    noteEl.textContent = stored
      ? 'Tavla viser hjemreisen fra 45 min før, og til halvannen time etter. Velger du en annen rute i mellomtiden, står den ut dagen.'
      : 'Settes nå, så står den klar i ettermiddag.';
  }
  if (clearBtn) clearBtn.style.display = stored ? 'inline-block' : 'none';
  // Open when there is already one, exactly as the via field does.
  wrap.style.display = stored ? 'block' : wrap.style.display;
  toggle.style.display = wrap.style.display === 'block' ? 'none' : 'block';
}

/** The reverse of the route the form is currently describing. */
function _pendingReturnDir() {
  const dir = config.dirs[state.dIdx];
  const from = loadDep() || (dir && dir.from);
  const to = loadDest() || (dir && dir.to);
  if (!from || !to) return null;
  // Prefer the live route object, which carries ids and coordinates; the two
  // names are only a fallback for a form that has not been applied yet.
  const base = (dir && dir.from === from && dir.to === to)
    ? dir
    : { from, to, stopId: null, toStopId: null };
  return reverseOf(base);
}

export function showSettings() {
  const ns = state.nearestStation;
  const depEl = document.getElementById('set-dep');

  if (depEl) {
    const saved = loadDep();
    // The active route first, since favourites and reversing now write it —
    // the field should say where the route starts, not where you happen to
    // stand. Nearest station stays as the fallback for a first run with no
    // route saved: config.dirs[0] is a non-empty neutral placeholder
    // («Jernbanetorget»), so putting it first would always win and no one
    // would ever see their nearest station. The nearby list sits right below
    // the field either way.
    depEl.value = saved || (ns ? ns.name : null) || (config.dirs[state.dIdx] ? config.dirs[state.dIdx].from : '');
    if (ns) _depStopIds.set(ns.name, { id: ns.id, lat: ns.lat, lon: ns.lon });
    syncClear('set-dep', 'set-dep-clear');
  }

  renderFavRouteShortcuts();
  renderReturnSection();

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
  renderProfileSwitcher();

  const prevDir = config.dirs[2];
  if (prevDir && prevDir._toLat && prevDir._toLon && loadDest()) {
    _showDestPreview(prevDir._toLat, prevDir._toLon);
  } else if (!_destPreviewLL) {
    _hideDestPreview();
  }
}

export function showPrefs() {
  _highlightPrefs();
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

  const depMatchesGps = ns && ns.name.toLowerCase() === dep.toLowerCase();
  const depNearby = !depMatchesGps
    && state.nearestStations.find(s => s.name.toLowerCase() === dep.toLowerCase());
  const depEntry = _depStopIds.get(dep);
  const depId  = depMatchesGps ? ns.id   : (depNearby ? depNearby.id  : (depEntry ? depEntry.id  : null));
  const depLat = depMatchesGps ? ns.lat  : (depNearby ? depNearby.lat : (depEntry ? depEntry.lat : null));
  const depLon = depMatchesGps ? ns.lon  : (depNearby ? depNearby.lon : (depEntry ? depEntry.lon : null));

  const arrEntry = _arrStopIds.get(arr);
  const arrId  = arrEntry ? arrEntry.id  : null;
  const arrLat = arrEntry ? arrEntry.lat : null;
  const arrLon = arrEntry ? arrEntry.lon : null;

  const viaRaw = (document.getElementById('set-via') || {}).value;
  const via = (viaRaw && viaRaw.trim()) || null;
  const viaEntry = via ? _viaStopIds.get(via) : null;
  const viaId = viaEntry ? viaEntry.id : null;

  setActiveRoute({
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
  }, { chosen: true });
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
  setActiveRoute({
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
    // No `chosen`: this rebuilds an already-chosen route at startup, and
    // trackPlace increments — counting every launch would crown the last
    // route used as the most used.
  });
  return true;
}

const FREQ_DEP_KEY = 't.freqDep';
const FREQ_ARR_KEY = 't.freqArr';
const FREQ_MAX     = 10;

function _loadFreq(key) {
  try { const v = storage.get(key); return v ? JSON.parse(v) : []; } catch { return []; }
}

function _saveFreq(key, list) {
  storage.set(key, JSON.stringify(list));
}

export function trackPlace(role, name, meta) {
  if (!name) return;
  const key = role === 'dep' ? FREQ_DEP_KEY : FREQ_ARR_KEY;
  const list = _loadFreq(key);
  const norm = name.trim();
  const idx = list.findIndex(p => p.name.toLowerCase() === norm.toLowerCase());
  if (idx !== -1) {
    list[idx].count += 1;
    list[idx].lastUsed = Date.now();
    if (meta) Object.assign(list[idx], { lat: meta.lat, lon: meta.lon, stopId: meta.stopId || null });
  } else {
    list.push({ name: norm, count: 1, lastUsed: Date.now(), lat: meta && meta.lat, lon: meta && meta.lon, stopId: meta && meta.stopId || null });
  }
  list.sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed);
  _saveFreq(key, list.slice(0, FREQ_MAX));
}

function _renderFreqRow(elId, role) {
  const el = document.getElementById(elId);
  if (!el) return;
  const key = role === 'dep' ? FREQ_DEP_KEY : FREQ_ARR_KEY;
  const list = _loadFreq(key).slice(0, 4);
  if (!list.length) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.innerHTML = list.map(p =>
    '<button class="freq-pill" data-name="' + esc(p.name) + '" aria-label="' + esc(p.name) + '">'
    + esc(p.name) + '</button>'
  ).join('');
  el.querySelectorAll('.freq-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = document.getElementById(role === 'dep' ? 'set-dep' : 'set-arr');
      if (inp) {
        inp.value = btn.dataset.name;
        syncClear(inp.id, inp.id + '-clear');
        const entry = list.find(p => p.name === btn.dataset.name);
        if (entry && entry.lat) {
          const map = role === 'dep' ? _depStopIds : _arrStopIds;
          map.set(entry.name, { id: entry.stopId, lat: entry.lat, lon: entry.lon });
          if (role === 'arr' && entry.lat) _showDestPreview(entry.lat, entry.lon);
        }
        const other = document.getElementById(role === 'dep' ? 'set-arr' : 'set-dep');
        if (other && !other.value) other.focus();
      }
    });
  });
}

/**
 * Make the route form agree with the route that is actually running.
 *
 * saveDep/saveDest were written from exactly two places — «bruk rute» and the
 * deep link. Picking a favourite or reversing set config.dirs and started the
 * board, so the live route was right, while t.dep/t.dest still held whatever
 * was last typed. Open «velg rute» after either and the fields showed the old
 * route — and pressing «bruk rute» put it back.
 *
 * Lives here because this file owns the keys.
 */
/**
 * Set the route the board is showing — everywhere, and durably.
 *
 * config.dirs[2] is assigned from six places, and each had to remember the
 * same four things: the route, the index, the form fields, and (now) storing
 * it. Two of them forgot the fields in v1.33.0. Storing would have been
 * forgotten just as reliably, so there is one door instead of six.
 */
export function setActiveRoute(dir, opts) {
  if (!dir) return;
  config.dirs[2] = dir;
  state.dIdx = 2;
  storage.set(config.storage.dir, '2');
  saveActiveRoute(dir);
  syncRouteFields(dir);
  if (opts && opts.chosen) {
    _recordChoice(dir);
    // A route the reader picked themselves stands for the rest of the day.
    // An automatic switch that overrides a deliberate choice is worse than no
    // automatic switch — so the one door that knows a choice happened is the
    // one place to say so.
    const r = loadReturn();
    if (r && returnWindow(r, Date.now()).active) skipToday(Date.now());
  }
}

/**
 * A human just picked this route, so it counts as use.
 *
 * trackPlace feeds the autocomplete's frequent places and recordSmartTrip
 * feeds the prediction engine. They were two parallel mechanisms with
 * different holes: favourites recorded only the second, and «reis dit» and
 * the ⇄ swap recorded neither. Autocomplete therefore never learned anything
 * from the routes people reach for most.
 *
 * Opt-in rather than automatic, because three callers must NOT count:
 * restoring at startup and applyRouteFromState are the same already-chosen
 * route arriving again — and trackPlace increments a counter, so counting
 * every launch would crown whatever you used last as your "most used". The
 * smart engine applying its own prediction must not count either, or the
 * prediction feeds itself.
 *
 * Arguments come off the route rather than being reassembled per call site.
 * That reassembly is how the two drifted apart in the first place.
 */
function _recordChoice(dir) {
  trackPlace('dep', dir.from, { lat: dir._fromLat, lon: dir._fromLon, stopId: dir.stopId || null });
  trackPlace('arr', dir.to,   { lat: dir._toLat,   lon: dir._toLon,   stopId: dir.toStopId || null });
  recordSmartTrip(dir.from, dir.to, dir.toStopId || null, dir._toLat, dir._toLon, dir.stopId || null);
}

/**
 * The whole route, kept.
 *
 * Only t.dep/t.dest were stored, so applyRouteFromState rebuilt the route
 * from two names on every start: toStopId was always dropped, coordinates
 * with it, and stopId survived only if the name happened to match your
 * nearest station. Measured against a favourite pointing at a venue, the
 * destination came back as different coordinates under the same label — the
 * app planned somewhere else and said nothing. It also cost four geocoder
 * requests per cold start to re-derive what was already known.
 *
 * `filter` is null on every dirs[2] assignment, so this serialises cleanly;
 * the RegExp fields config.js warns about belong to the two neutral dirs.
 */
export function saveActiveRoute(dir) {
  try { storage.set(config.storage.route, JSON.stringify(dir)); } catch { /* ignore */ }
}

export function loadActiveRoute() {
  try {
    const v = storage.get(config.storage.route);
    if (!v) return null;
    const d = JSON.parse(v);
    // A route without both ends cannot be shown; fall back rather than throw
    // a half-route at the board.
    return (d && d.from && d.to) ? d : null;
  } catch { return null; }
}

export function syncRouteFields(dir) {
  if (!dir) return;
  if (dir.from) saveDep(dir.from);
  if (dir.to) saveDest(dir.to);
  // favToDir carries no via, so an old one would otherwise stay behind and
  // reappear the next time the form is used.
  saveVia(dir.via || null);
}

export function loadDest() {
  return storage.get(DEST_KEY) || null;
}

export function saveDest(arr) {
  storage.set(DEST_KEY, arr);
}

export function loadDep() {
  return storage.get(DEP_KEY) || null;
}

export function saveDep(name) {
  storage.set(DEP_KEY, name);
}

export function loadVia() {
  return storage.get(VIA_KEY) || null;
}

function saveVia(v) {
  if (v) storage.set(VIA_KEY, v); else storage.remove(VIA_KEY);
}

function clearVia() {
  storage.remove(VIA_KEY);
}

function _renderProfileSwitcherInto(el, addInputId, addOkId, newWrapId) {
  if (!el) return;
  const profiles = listProfiles();
  const active   = getActiveProfile();

  el.innerHTML = '<div class="profile-row">'
    + profiles.map(p =>
        '<button class="profile-pill' + (p === active ? ' active' : '') + '" data-profile="' + p + '">'
        + p
        + (p !== 'default' && p !== active
          ? ' <span class="profile-del" data-del="' + p + '">&times;</span>'
          : '')
        + '</button>'
      ).join('')
    + '<button class="profile-pill profile-add" data-add="1">+ ny</button>'
    + '</div>'
    + '<div id="' + newWrapId + '" style="display:none;margin-top:8px">'
    + '<input id="' + addInputId + '" class="set-input" placeholder="profilnavn" maxlength="20" style="width:140px">'
    + '<button class="pref-btn" id="' + addOkId + '" style="margin-left:8px">OK</button>'
    + '</div>';

  el.querySelectorAll('.profile-pill[data-profile]').forEach(btn => {
    btn.addEventListener('click', e => {
      if (e.target.dataset.del) return;
      if (btn.dataset.profile !== active) switchProfile(btn.dataset.profile);
    });
  });

  el.querySelectorAll('.profile-del').forEach(span => {
    span.addEventListener('click', e => {
      e.stopPropagation();
      deleteProfile(span.dataset.del);
    });
  });

  el.querySelector('[data-add]').addEventListener('click', () => {
    const wrap = document.getElementById(newWrapId);
    if (wrap) { wrap.style.display = 'block'; document.getElementById(addInputId).focus(); }
  });

  document.getElementById(addOkId).addEventListener('click', () => {
    const inp = document.getElementById(addInputId);
    const name = (inp && inp.value.trim().replace(/[^a-zA-Z0-9_-]/g, '')) || '';
    if (!name) return;
    createProfile(name);
    switchProfile(name);
  });
}

export function renderProfileSwitcher() {
  _renderProfileSwitcherInto(
    document.getElementById('profile-switcher'),
    'profile-new-input', 'profile-new-ok', 'profile-new-wrap',
  );
}

export function renderBoardProfileSwitcher() {
  _renderProfileSwitcherInto(
    document.getElementById('board-profile-switcher'),
    'board-profile-new-input', 'board-profile-new-ok', 'board-profile-new-wrap',
  );
}

export function loadCustomRoute() {}
