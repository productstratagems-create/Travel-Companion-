import { state } from '../state.js';
import { saveWeekendMode } from '../geo.js';
import { show } from '../ui/nav.js';
import { esc, clk, clkDay, fmtMins } from '../ui/fmt.js';
import { bindPlaceInput } from '../ui/suggest.js';
import { parseAsk } from '../api/askParse.js';
import { geocodeDest, fetchTrip } from '../api/entur.js';
import { adaptTripPattern } from '../api/adapt.js';
import { setActiveRoute } from './settings.js';
import { renderPlaces } from './leisure.js';
import {
  quickTimes, horizonText, localInputValue, parseLocalInput,
  TRIP_SCAN_MINS, TRIP_PICK_HORIZON_MINS,
} from '../api/tripTime.js';

/**
 * «Utforsk» — which journeys are possible, forward in time, between two
 * places I name.
 *
 * Asked for in those words: «finne mulige reisealternativer frem i tid og på
 * strekninger som ikke nødvendigvis er relatert til brukerens gjeldende
 * posisjon fra gps målingen.»
 *
 * Until now the app had no such screen. Four doors looked like one and none
 * of them was it: «FINN REISE» pastes a reise-ID, «REISEPLAN» lists saved
 * legs, «skriv hvor du skal» opens the settings form, and that form — the
 * only real A→B input — has no time field at all. The one way the app could
 * ask about a time that is not now was the trip home, a HH:MM on today's
 * clock inside a ±45/90 minute window.
 *
 * Nothing new is asked of Entur. `tripGQL` has taken an arbitrary `dateTime`
 * and coordinates-or-id at BOTH ends from the beginning; `fetchTrip` already
 * passes `keepTime` so a specific time survives the minimal retry. What was
 * missing was somewhere to say it.
 *
 * The vision's phase table gains no row: this is «før valg», the same phase
 * as tavla and auto-reise, for a journey that is not the one you are
 * standing in front of.
 */

// ── The state of the answer ──────────────────────────────────
//
// One clean verdict, the screen derives the words — the same shape as
// `liveness` (v1.106.0), `posState` (v1.108.0) and `boardState` (v1.122.0),
// and for the same reason: the alternative is one sentence that means six
// things, which this codebase has now shipped twice.

/**
 * @returns {{kind:string, label:string}}
 */
export function exploreState(o) {
  const c = o || {};
  const now = Number.isFinite(c.now) ? c.now : Date.now();

  if (!c.from) return { kind: 'mangler-fra', label: 'Skriv hvor reisen starter.' };
  if (!c.to) return { kind: 'mangler-til', label: 'Skriv hvor du skal.' };

  const bad = horizonText(c.atMs == null ? null : c.atMs, now);
  if (bad) return { kind: 'tid', label: bad.label };

  if (!c.asked) return { kind: 'klar', label: '' };
  if (c.loading) return { kind: 'leter', label: 'Leter etter reiser …' };
  if (c.error) return { kind: 'feil', label: 'Fikk ikke svar. Prøv igjen.' };

  const rows = c.rows || [];
  if (!rows.length) {
    // WHICH empty this is, and ABOUT WHICH WINDOW. One search scans
    // TRIP_SCAN_MINS forward from its own instant, so «nothing found» is
    // never a statement about the route in general — saying so would be the
    // v1.122.0 sentence again, in a screen that can reach further.
    const hrs = Math.round(TRIP_SCAN_MINS / 60);
    return c.atMs == null
      ? { kind: 'ingen', label: 'Ingen reiser herfra de neste ' + hrs + ' timene. Prøv et senere tidspunkt.' }
      : { kind: 'ingen-da', label: 'Ingen reiser i de ' + hrs + ' timene etter tidspunktet du valgte.' };
  }
  return { kind: 'ok', label: '' };
}

/**
 * What one result says, from an adapted trip pattern.
 *
 * Pure, so the rendering can be tested without a map, a clock or a network.
 */
export function journeySummary(dep) {
  if (!dep) return null;
  const ms = v => (v ? new Date(v).getTime() : null);
  const depMs = ms(dep.expectedDepartureTime || dep.aimedDepartureTime);
  const arrMs = ms(dep._finalArrival);
  const lines = (dep._legs || [])
    .map(l => (l.serviceJourney && l.serviceJourney.line && l.serviceJourney.line.publicCode) || null)
    .filter(Boolean);
  return {
    depMs,
    arrMs,
    lines,
    transfers: (dep._transfers || []).length,
    durationMins: Number.isFinite(dep._durationMins) ? dep._durationMins : null,
    dest: (dep._alightName || (dep.destinationDisplay && dep.destinationDisplay.frontText) || ''),
    cancelled: !!dep.cancellation,
    walkMins: dep._alightWalkMins,
  };
}

// ── Screen state ─────────────────────────────────────────────

let _from = null;   // { label, id, lat, lon }
let _to = null;
let _atMs = null;   // null = «nå»
let _pickOpen = false;
let _asked = false;
let _loading = false;
let _error = false;
let _rows = null;
let _placesOpen = false;
let _reqId = 0;
let _askNote = null;   // what the sentence was read as, shown for correction
let _askText = '';

/** The starting point offered, and WHERE IT CAME FROM — never a bare claim. */
function _defaultFrom() {
  const ns = state.nearestStation;
  if (ns && ns.name) {
    return { label: ns.name, id: ns.id || null, lat: ns.lat, lon: ns.lon, _fromPos: true };
  }
  return null;
}

function _placeHtml(side, val) {
  const id = 'exp-' + side;
  return '<div class="exp-field">'
    + '<label class="exp-label" for="' + id + '">' + (side === 'from' ? 'fra' : 'til') + '</label>'
    + '<input id="' + id + '" class="exp-input" type="text" autocomplete="off" autocorrect="off"'
    + ' autocapitalize="off" spellcheck="false" placeholder="'
    + (side === 'from' ? 'sted eller holdeplass' : 'hvor skal du?') + '"'
    + ' value="' + esc(val ? val.label : '') + '">'
    + '<div id="' + id + '-sugg" class="stop-sugg" hidden></div>'
    + (side === 'from' && val && val._fromPos
      ? '<div class="exp-note">fra posisjonen din</div>' : '')
    + '</div>';
}

function _whenHtml(now) {
  const pills = quickTimes(now).map(q => {
    const on = (q.ms == null && _atMs == null) || (q.ms != null && q.ms === _atMs);
    return '<button type="button" class="exp-when-btn' + (on ? ' active' : '') + '"'
      + ' data-when="' + q.key + '" data-ms="' + (q.ms == null ? '' : q.ms) + '">'
      + esc(q.label) + '</button>';
  }).join('');
  const custom = _atMs != null && !quickTimes(now).some(q => q.ms === _atMs);
  return '<div class="exp-when">'
    + '<div class="exp-label">når</div>'
    + '<div class="exp-when-row">' + pills
    + '<button type="button" class="exp-when-btn' + (custom ? ' active' : '') + '" data-when="velg">velg …</button>'
    + '</div>'
    + '<div class="exp-when-pick"' + ((_pickOpen || custom) ? '' : ' hidden') + '>'
    + '<input type="datetime-local" id="exp-at" class="exp-at"'
    + ' value="' + esc(_atMs == null ? '' : localInputValue(_atMs)) + '"'
    + ' min="' + esc(localInputValue(now)) + '"'
    + ' max="' + esc(localInputValue(now + TRIP_PICK_HORIZON_MINS * 60000)) + '">'
    + '</div>'
    // Show what you already know: the chosen instant, spelled with its day.
    // 2 900 minutes is not an answer to «når».
    + (_atMs == null ? '' : '<div class="exp-when-chosen">reiser ' + esc(clkDay(_atMs, now)) + '</div>')
    + '</div>';
}

function _rowHtml(dep, now) {
  const s = journeySummary(dep);
  if (!s || s.depMs == null) return '';
  const badges = s.lines.map(c => '<span class="exp-line">' + esc(c) + '</span>').join('');
  const bytt = s.transfers === 0
    ? '<span class="exp-direct">direkte</span>'
    : '<span class="exp-bytt">' + s.transfers + ' bytte' + (s.transfers > 1 ? 'r' : '') + '</span>';
  return '<button type="button" class="exp-row' + (s.cancelled ? ' cancelled' : '') + '"'
    + ' data-dep="' + s.depMs + '">'
    + '<div class="exp-row-top">'
    + '<span class="exp-dep">' + esc(clkDay(s.depMs, now)) + '</span>'
    + (s.arrMs ? '<span class="exp-arr">→ ' + esc(clk(s.arrMs)) + '</span>' : '')
    + (s.durationMins != null ? '<span class="exp-dur">' + esc(fmtMins(s.durationMins)) + '</span>' : '')
    + '</div>'
    + '<div class="exp-row-bot">' + badges + bytt
    + (s.walkMins != null ? '<span class="exp-walk">' + s.walkMins + ' min gange</span>' : '')
    + (s.cancelled ? '<span class="dep-cancelled">innstilt</span>' : '')
    + '</div>'
    + '</button>';
}

function _resultsHtml(now) {
  const v = exploreState({
    now, from: _from, to: _to, atMs: _atMs,
    asked: _asked, loading: _loading, error: _error, rows: _rows,
  });
  if (v.kind === 'ok') {
    return '<div class="exp-results">' + _rows.map(d => _rowHtml(d, now)).join('') + '</div>';
  }
  if (v.kind === 'klar') return '';
  return '<div class="exp-note exp-verdict" data-kind="' + v.kind + '">' + esc(v.label) + '</div>';
}

/** The places browser, folded, and about the DESTINATION rather than the GPS dot. */
function _placesHtml() {
  if (!_to || !Number.isFinite(_to.lat)) return '';
  return '<div class="exp-places">'
    + '<button type="button" class="exp-fold" id="exp-places-fold"'
    + ' aria-expanded="' + (_placesOpen ? 'true' : 'false') + '">'
    + '<span class="exp-fold-caret">' + (_placesOpen ? '▾' : '▸') + '</span>'
    + 'Når du kommer fram til ' + esc(_to.label)
    + '</button>'
    + '<div id="exp-places-body"' + (_placesOpen ? '' : ' hidden') + '></div>'
    + '</div>';
}

/**
 * Say what the sentence was READ AS, in the app's own words.
 *
 * The whole safety of this feature is that a misreading costs a glance.
 * That only holds if the reading is visible: «til Bergen · mandag 07:00»
 * beside the fields it filled, so a wrong day is caught before a search,
 * not after a missed bus. Silence here would turn a helpful guess into an
 * invisible one.
 */
export function askSummary(parsed, now) {
  if (!parsed) return null;
  const bits = [];
  if (parsed.from) bits.push('fra ' + parsed.from);
  if (parsed.to) bits.push('til ' + parsed.to);
  if (parsed.atMs != null) bits.push(clkDay(parsed.atMs, now));
  if (!bits.length) return { kind: 'ingenting', label: 'Forsto ikke. Fyll ut feltene under.' };
  const missed = !parsed.to ? ' — mangler hvor du skal' : '';
  return { kind: missed ? 'delvis' : 'lest', label: 'Leste: ' + bits.join(' · ') + missed };
}

function _askHtml() {
  const note = _askNote
    ? '<div class="exp-ask-note" data-kind="' + _askNote.kind + '">' + esc(_askNote.label) + '</div>'
    : '';
  return '<div class="exp-ask">'
    + '<input id="exp-ask" class="exp-input exp-ask-input" type="text"'
    + ' autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"'
    + ' placeholder="f.eks. til Sandvika fredag halv ni"'
    + ' value="' + esc(_askText) + '">'
    + note
    + '</div>';
}

export function renderExplore() {
  const el = document.getElementById('v-leisure');
  if (!el) return;
  const now = Date.now();
  if (!_from) _from = _defaultFrom();

  el.innerHTML = '<div class="lei-header">'
    + '<div class="lei-title">Utforsk</div>'
    + '<button class="lei-mode-btn" id="exp-back">' + (state.jny ? '← reise' : '← pendler') + '</button>'
    + '</div>'
    + _askHtml()
    + '<div class="exp-form">'
    + _placeHtml('from', _from)
    + _placeHtml('to', _to)
    + _whenHtml(now)
    + '<button type="button" class="exp-go" id="exp-go"'
    + (_loading ? ' disabled' : '') + '>' + (_loading ? 'leter …' : 'finn reiser') + '</button>'
    + '</div>'
    + '<div id="exp-results">' + _resultsHtml(now) + '</div>'
    + _placesHtml();

  _attach(el);
  if (_placesOpen && _to) renderPlaces('exp-places-body', { lat: _to.lat, lon: _to.lon }, _to.label);
}

function _attach(el) {
  const back = document.getElementById('exp-back');
  if (back) back.addEventListener('click', () => {
    if (state.jny) { show('v-track'); }
    else { show('v-board'); window._startBoard && window._startBoard(); }
  });

  // Neither end is the GPS dot by necessity. `geocodeDest` returns an id for
  // transit places and coordinates for everything else, and tripGQL takes
  // either at either end — so «Kongsberg → Bergen» works with no position
  // at all.
  for (const side of ['from', 'to']) {
    bindPlaceInput(
      document.getElementById('exp-' + side),
      document.getElementById('exp-' + side + '-sugg'),
      q => geocodeDest(q),
      r => {
        const v = { label: r.label, id: r.id || null, lat: r.lat, lon: r.lon };
        if (side === 'from') _from = v; else { _to = v; _placesOpen = false; }
        _asked = false; _rows = null; _error = false;
        renderExplore();
      },
    );
  }

  el.querySelectorAll('.exp-when-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.when === 'velg') {
        _pickOpen = !_pickOpen;
      } else {
        _atMs = btn.dataset.ms ? Number(btn.dataset.ms) : null;
        _pickOpen = false;
      }
      _asked = false; _rows = null; _error = false;
      renderExplore();
    });
  });

  const at = document.getElementById('exp-at');
  if (at) at.addEventListener('change', () => {
    _atMs = parseLocalInput(at.value);
    _asked = false; _rows = null; _error = false;
    renderExplore();
  });

  const ask = document.getElementById('exp-ask');
  if (ask) {
    const read = () => {
      _askText = ask.value;
      const p = parseAsk(_askText, Date.now());
      _askNote = _askText.trim() ? askSummary(p, Date.now()) : null;
      // A PROPOSAL, NOT AN ACTION. The fields are filled and shown; no
      // search runs until the reader presses «finn reiser», so a wrong
      // reading costs a glance rather than a journey.
      if (p.atMs != null) _atMs = p.atMs;
      if (p.to) _to = { label: p.to, id: null, lat: null, lon: null, _typed: true };
      if (p.from) _from = { label: p.from, id: null, lat: null, lon: null, _typed: true };
      _asked = false; _rows = null; _error = false;
      renderExplore();
      const again = document.getElementById('exp-ask');
      if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    };
    ask.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); read(); } });
    ask.addEventListener('blur', () => { if (ask.value !== _askText) read(); });
  }

  const go = document.getElementById('exp-go');
  if (go) go.addEventListener('click', () => _search());

  const fold = document.getElementById('exp-places-fold');
  if (fold) fold.addEventListener('click', () => {
    _placesOpen = !_placesOpen;
    renderExplore();
  });

  el.querySelectorAll('.exp-row').forEach(btn => {
    btn.addEventListener('click', () => {
      const dep = (_rows || []).find(d =>
        new Date(d.expectedDepartureTime || d.aimedDepartureTime).getTime() === Number(btn.dataset.dep));
      _follow(dep);
    });
  });
}

/** The route object this screen searches with — the same shape applyRoute builds. */
export function searchDir(from, to, atMs) {
  if (!from || !to) return null;
  const d = {
    key: 'custom-out',
    from: from.label,
    to: to.label,
    stopId: from.id || null,
    toStopId: to.id || null,
    geo: from.label,
    toGeo: to.label,
  };
  if (Number.isFinite(from.lat)) { d._fromLat = from.lat; d._fromLon = from.lon; }
  if (Number.isFinite(to.lat)) { d._toLat = to.lat; d._toLon = to.lon; }
  // The field that was missing. `departAtMs` in api/returnTrip.js is the one
  // place that decides what instant a route is planned from, and this is how
  // a reader's explicit choice reaches it.
  if (Number.isFinite(atMs)) d.atMs = atMs;
  return d;
}

function _search() {
  const v = exploreState({ from: _from, to: _to, atMs: _atMs, asked: false });
  if (v.kind !== 'klar') { _asked = true; renderExplore(); return; }
  const dir = searchDir(_from, _to, _atMs);
  const mine = ++_reqId;
  _asked = true; _loading = true; _error = false; _rows = null;
  renderExplore();
  fetchTrip(dir, patterns => {
    if (mine !== _reqId) return;
    _loading = false;
    _rows = (patterns || []).map(adaptTripPattern).filter(Boolean);
    renderExplore();
  }, () => {
    if (mine !== _reqId) return;
    _loading = false; _error = true;
    renderExplore();
  }, _atMs == null ? undefined : _atMs);
}

/** One door onward, the same one applyRoute uses. */
function _follow(dep) {
  const dir = searchDir(_from, _to, _atMs);
  if (!dir) return;
  setActiveRoute(dir, { chosen: true });
  state.deps = [];
  show('v-board');
  window._startBoard && window._startBoard();
  void dep;
}

/** Test seam: the module keeps its answer between renders. */
export function _resetExplore() {
  _from = null; _to = null; _atMs = null; _pickOpen = false;
  _askNote = null; _askText = '';
  _asked = false; _loading = false; _error = false; _rows = null;
  _placesOpen = false; _reqId = 0;
}

/**
 * Arrive somewhere and look around it.
 *
 * The door from the arrival panel. It used to point the places browser at a
 * coordinate; now it fills in the destination of a journey search and opens
 * the places under it, which is the same fact one phase earlier — and it
 * still lands on a screen that can say how to get there.
 */
window._exploreDestination = function (lat, lon, label) {
  _to = { label: label || 'destinasjon', id: null, lat, lon };
  _asked = false; _rows = null; _error = false;
  _placesOpen = true;
  saveWeekendMode(true);
  show('v-leisure');
  renderExplore();
};

window._renderExplore = renderExplore;
window._renderLeisure = renderExplore;
