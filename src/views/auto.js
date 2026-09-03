/**
 * Auto-reise: you are here, this leaves from here, where do you want to go?
 *
 * What the ⚡ button used to be (main.js): a one-shot that GUESSED your
 * destination from history and refused to do anything without it —
 * "Ikke nok reisehistorikk ennå — reis manuelt noen ganger først." So the
 * feature was unusable on day one, exactly when a new reader needs it most.
 *
 * This trades the guess for a choice. Your position gives the stop, the stop
 * board gives the directions, and a direction gives the stops along it — and
 * every one of those already exists in the app. There is no new query here:
 * `boardGQL` already asks for `serviceJourney{estimatedCalls{...}}`, so the
 * stops along a direction, with their arrival times, are in the same response
 * that produced the directions.
 *
 * The prediction is not deleted, it is demoted: with history, the direction
 * you usually take at this hour is marked. Without it, the screen works
 * exactly as well. That is the difference between an engine that locks you
 * out and one that helps.
 */
import { esc } from '../ui/fmt.js';
import config from '../config.js';
import { state } from '../state.js';
import { fetchBoard } from '../api/entur.js';
import { predictDest } from '../api/smart.js';
import { renderRouteShortcuts } from '../ui/favs.js';
import { ensureHubs, loadHubs, isHub } from '../api/hubs.js';
import { logMsg } from '../ui/log.js';

const MIN = 60000;
/**
 * How many departures the auto-reise board asks for.
 *
 * numberOfDepartures caps the WHOLE stop — every line and mode share it — so
 * three per direction at a stop with five directions is simply not in a
 * twelve-departure answer. Measured on a Tveita-shaped stop (five directions,
 * 4-20 minute headways): at 12 only three of five rows had three departures
 * to show; at 30 all five did, and 40 added nothing.
 */
const AUTO_BOARD_DEPARTURES = 30;

/**
 * …and how many per line and direction, if Entur will have it.
 *
 * Three, because three is what the row shows. When the argument is honoured
 * this does the work and the 30 above is only a ceiling; when it is turned
 * down we are exactly where v1.69.0 left us.
 */
const AUTO_PER_LINE = 3;

/** As far as it is worth walking to a different stop instead. */
const ALT_STOP_MAX_M = 1000;

function _callTime(c) {
  const t = c && (c.expectedDepartureTime || c.aimedDepartureTime);
  const ms = t ? new Date(t).getTime() : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The directions that leave this stop, soonest first.
 *
 * A direction is the front text — what is written on the front of the
 * vehicle and on the platform sign. That is deliberate: it is the one label
 * the reader can check against the world while standing there, and the app
 * already models it (`dir.filter` is a regex tested against exactly this
 * field, board.js:2761).
 *
 * Grouped by front text, NOT by line: two lines that both run to
 * Nationaltheatret are one choice with two badges, because "which of these
 * two comes first" is the board's job, not this screen's. The same line in
 * both directions is correctly two rows — the front texts differ.
 */
export function groupDirections(calls, now) {
  const t0 = now == null ? Date.now() : now;
  const byText = new Map();
  (calls || []).forEach(c => {
    const front = ((c.destinationDisplay && c.destinationDisplay.frontText) || '').trim();
    if (!front) return;
    const ms = _callTime(c);
    if (ms == null) return;
    // Gone is not a choice.
    //
    // The stop board is asked with a two-minute lookback on purpose
    // (queries.js LOOKBACK_MINS): a train standing at the platform a minute
    // late is exactly what someone running for it needs to see. The board can
    // carry that honestly because it says "-3". This screen is a LIST OF
    // CHOICES, and it clamped the countdown with Math.max(0, …) below — so
    // everything up to two minutes gone arrived here reading "nå".
    //
    // Reported from Bogerud: three rows saying "nå" at once, on the screen a
    // new reader meets first. Dropped here rather than clamped, so the
    // direction keeps its NEXT departure instead of losing the row.
    if (ms < t0) return;
    const ln = c.serviceJourney && c.serviceJourney.line;
    const code = (ln && ln.publicCode) || null;
    const colour = (ln && ln.presentation && ln.presentation.colour) || null;
    const prev = byText.get(front);
    if (!prev) {
      byText.set(front, {
        frontText: front,
        lines: code ? [{ code, colour }] : [],
        nextMs: ms,
        call: c,
        // Every departure this way, not just the first. Asked for: "tiden til
        // avgang for de tre neste avgangene". Collected here because this is
        // the only place the raw calls are still in scope — the caller keeps
        // the grouped rows and drops the array.
        all: [ms],
      });
      return;
    }
    if (code && !prev.lines.some(l => l.code === code)) prev.lines.push({ code, colour });
    prev.all.push(ms);
    // The soonest call owns the row — and it is the one whose onward stops
    // the reader will see, so it must be the same call the time came from.
    // It stays the soonest even now that the row shows three times: tapping
    // opens a journey, and it has to be the journey the first time refers to.
    if (ms < prev.nextMs) { prev.nextMs = ms; prev.call = c; }
  });
  return [...byText.values()]
    .sort((a, b) => a.nextMs - b.nextMs)
    // No clamp. Every call here left the filter above with nextMs >= t0, so
    // the rounding cannot go negative — and a Math.max(0, …) that can never
    // fire, sitting where one used to hide departed vehicles behind "nå", is
    // worse than none: it tells the next reader that negatives get here.
    .map(d => {
      const { all, ...rest } = d;
      return {
        ...rest,
        mins: Math.round((d.nextMs - t0) / MIN),
        // The next three, soonest first, as ABSOLUTE times. Fewer when fewer
        // run — a row with one time means one departure, and padding it would
        // say something the stop board never said.
        //
        // Absolute rather than minutes, because the screen redraws long after
        // this ran and minutes computed here would be a snapshot. Two
        // representations that must agree is exactly the bug v1.68.0 fixed
        // (_bRoutePts against _bRoutePtsKey); one value, converted where it
        // is shown.
        times: all.slice().sort((a, b) => a - b).slice(0, 3),
      };
    });
}

/**
 * Where that departure goes after your stop.
 *
 * Only after. A journey's calls include the stops it has already made, and
 * offering one of those as a destination would send the reader backwards —
 * the single worst thing this screen could do, and silent, because a stop
 * behind you looks exactly like a stop ahead of you in a list.
 *
 * The cut is made on the first call whose name matches yours, not on
 * position, because the board's own stop is the anchor we have.
 */
export function stopsAhead(call, fromName, now) {
  const t0 = now == null ? Date.now() : now;
  const sjc = (call && call.serviceJourney && call.serviceJourney.estimatedCalls) || [];
  const norm = s => String(s || '').toLowerCase().replace(/\s+t$/i, '').trim();
  const me = norm(fromName);
  let seen = false;
  const out = [];
  sjc.forEach(c => {
    const sp = c.quay && c.quay.stopPlace;
    const name = (sp && sp.name) || '';
    if (!seen) { if (me && norm(name) === me) seen = true; return; }
    const t = c.expectedArrivalTime || c.aimedArrivalTime;
    const ms = t ? new Date(t).getTime() : null;
    out.push({
      name,
      id: (sp && sp.id) || null,
      lat: sp && sp.latitude != null ? sp.latitude : (c.quay && c.quay.latitude),
      lon: sp && sp.longitude != null ? sp.longitude : (c.quay && c.quay.longitude),
      mins: ms ? Math.max(0, Math.round((ms - t0) / MIN)) : null,
    });
  });
  return out;
}

/**
 * A stop pair as a route the rest of the app already understands.
 *
 * Ids in both ends wherever they exist. A coordinate origin makes OTP add
 * walking time to the platform and drop departures it judges unreachable —
 * that cost us the very next departure once already (v1.4.1) — and a bare
 * name has to be geocoded back into the id we are holding right here.
 */
export function autoRoute(from, to) {
  if (!from || !to || !from.name || !to.name) return null;
  return {
    key: 'custom-out',
    from: from.name,
    to: to.name,
    stopId: from.id || null,
    toStopId: to.id || null,
    filter: null,
    geo: from.id ? null : from.name,
    toGeo: to.id ? null : to.name,
    line: null,
    _fromLat: from.lat != null ? from.lat : null,
    _fromLon: from.lon != null ? from.lon : null,
    _toLat: to.lat != null ? to.lat : null,
    _toLon: to.lon != null ? to.lon : null,
  };
}

/** One line badge, the same shape the board and the shortcuts already use. */
export function badgeHtml(l) {
  return '<span class="line-badge" style="background:#'
    + esc(l.colour || '7c2d12') + '">' + esc(l.code || '?') + '</span>';
}


// ── The screen ─────────────────────────────────────────────────────────────

let _stop = null;      // { name, id, lat, lon }
let _dirs = [];        // groupDirections output for _stop
let _open = null;      // the direction whose stops are showing

function _el(id) { return document.getElementById(id); }

/**
 * Where the reader is, in the order the answers actually arrive.
 *
 * A live fix if geo.js has one, the last one it saw otherwise. Never a
 * blank screen: a position-first mode that cannot find a position still has
 * to say something, and "skriv hvor du skal" is always below.
 */
/**
 * What to say when there is no position — and it matters WHICH nothing.
 *
 * "Finner ikke posisjonen din ennå" is true while the fix is on its way and a
 * lie once the reader has denied permission: it reads as still-looking, so a
 * position-first screen sits there implying it is about to work. The two
 * cases need different words and, more to the point, different next steps —
 * one is "wait", the other is "this will never arrive, do the other thing".
 *
 * Pure, and exported, because it is the whole content of the screen in the
 * case a position-first mode is most likely to fail.
 *
 * `cta` relabels the button at the bottom, because without a position the
 * useful thing to type is no longer where you are GOING. The nearby-stop
 * buttons come from the position too, so they are not there to point at —
 * an earlier draft said "velg et stopp nedenfor" under an empty screen.
 *
 * @param {string|null} gpsError state.gpsError — 'denied' when refused
 * @returns {{where: string, body: string, cta: string}}
 */
export function noPosText(gpsError) {
  return gpsError === 'denied'
    ? {
      where: 'Stedstjenester er avslått.',
      body: 'Uten posisjon vet ikke appen hvilket stopp du står ved. '
        + 'Slå på stedstjenester for denne siden, eller sett stoppet selv.',
      cta: 'sett hvor du er →',
    }
    : {
      where: 'Finner ikke posisjonen din ennå.',
      body: 'Leter etter posisjonen din. Du kan sette stoppet selv mens du venter.',
      cta: 'sett hvor du er →',
    };
}

/** The button at the bottom, which is the only way on when there is no fix. */
const MANUAL_CTA = 'skriv hvor du skal →';
function _setManual(label) {
  const b = _el('auto-manual');
  if (b) b.textContent = label;
}

function _stops() {
  const list = (state.nearestStations && state.nearestStations.length)
    ? state.nearestStations
    : (state.nearestStation ? [state.nearestStation] : []);
  return list;
}

function _renderWhere() {
  const el = _el('auto-where');
  if (!el) return;
  const list = _stops();
  if (!_stop && list.length) _stop = list[0];
  if (!_stop) {
    el.innerHTML = '<div class="set-label">du er ved</div>'
      + '<div class="dest-prev-empty">' + esc(noPosText(state.gpsError).where) + '</div>';
    return;
  }
  // Other stops you could actually walk to instead. geo.js searches 5 km to
  // be sure of finding *a* station; offering one of those as an alternative
  // is not an alternative, it is another journey. A kilometre is about twelve
  // minutes at the app's own default pace.
  const others = list
    .filter(s => s.id !== _stop.id && (s.distM == null || s.distM <= ALT_STOP_MAX_M))
    .slice(0, 4);
  el.innerHTML = '<div class="set-label">du er ved</div>'
    + '<div class="auto-stop">' + esc(_stop.name)
    + (_stop.distM != null ? '<span class="nearby-dist">' + _stop.distM + ' m</span>' : '')
    + '</div>'
    + others.map(s => '<button class="nearby-btn auto-alt" type="button" data-id="' + esc(s.id) + '">'
      + '<span class="nearby-name">' + esc(s.name) + '</span>'
      + '<span class="nearby-dist">' + (s.distM != null ? s.distM + ' m' : '') + '</span>'
      + '</button>').join('');
  el.querySelectorAll('.auto-alt').forEach(b => {
    b.addEventListener('click', () => {
      _stop = list.find(s => s.id === b.dataset.id) || _stop;
      _open = null; _dirs = [];
      renderAuto();
      _load();
    });
  });
}

/**
 * The one fetch this screen makes.
 *
 * A stop board, with no destination — the same call the board itself falls
 * back to when a route has no `to`. Everything after this (the directions,
 * their lines, the stops along each one and their arrival times) is read out
 * of this single response.
 */
function _load() {
  if (!_stop) return;
  const body = _el('auto-body');
  if (body) body.innerHTML = '<div class="dest-prev-loading">henter avganger…</div>';
  // 30 rather than the default 12. numberOfDepartures caps the WHOLE board,
  // so three per direction at a stop with five of them simply is not in a
  // twelve-departure answer — measured: 3 of 5 rows could show three at 12,
  // 5 of 5 at 30.
  fetchBoard({ key: 'custom-out', from: _stop.name, stopId: _stop.id, to: '', line: null, filter: null },
    (stop) => {
      _dirs = groupDirections(stop.estimatedCalls || []);
      _renderBody();
    },
    (err) => {
      logMsg('auto-reise: ' + err, 'err');
      if (body) body.innerHTML = '<div class="dest-prev-empty">Fikk ikke avganger herfra.</div>';
    },
    AUTO_BOARD_DEPARTURES, AUTO_PER_LINE);
}

/**
 * The next three times for a row, as one string.
 *
 * The first keeps its weight; the rest are quieter. They are alternatives,
 * not equals — you act on the first and glance at the others to know whether
 * missing it matters.
 */
/**
 * Which platform, in the word that mode uses.
 *
 * Taken from the SOONEST departure — the one the first time refers to and the
 * one a tap opens. At a terminus like Mortensrud the metro alternates between
 * platforms, so the three departures on a row need not share one; showing the
 * first one's is the only answer that is true of the departure you are going
 * to catch.
 *
 * "Spor" is what the app says everywhere, and it is wrong for a bus bay —
 * Ruter calls those plattform. The stop board is the authoritative source
 * here, unlike the departure board, which has to reconcile the trip planner's
 * PLANNED platform against the stop's actual one (v1.56.0).
 *
 * Nothing rather than "spor ?" when the answer is missing: a row without a
 * platform is honest, a row with a question mark is noise.
 *
 * @returns {string|null}
 */
export function quayLabel(call) {
  const q = call && call.quay;
  const code = (q && q.publicCode)
    // Some quays carry only a name like "Mortensrud E" — the trailing token
    // is the bay. Same fallback _rowQuay uses on the departure board.
    || (q && q.name ? String(q.name).trim().split(/\s+/).pop() : null);
  if (!code || code === '?') return null;
  const mode = call.serviceJourney && call.serviceJourney.line
    && call.serviceJourney.line.transportMode;
  const word = (mode === 'metro' || mode === 'rail') ? 'spor' : 'plattform';
  return word + ' ' + code;
}

export function _minsUntil(ms, now) {
  return Math.round((ms - (now == null ? Date.now() : now)) / MIN);
}

function _timesHtml(d, now) {
  const mins = (d.times && d.times.length)
    ? d.times.map(ms => _minsUntil(ms, now))
    : [d.mins];
  // A departure that went while you were looking at the screen is not a
  // choice either — the same rule groupDirections applies when it builds the
  // row, applied again now that the row is allowed to age.
  const times = mins.filter(m => m >= 0);
  if (!times.length) return '';
  const label = (m) => (m === 0 ? 'nå' : String(m));
  const rest = times.slice(1);
  return '<span class="auto-t-next">' + label(times[0]) + '</span>'
    + (rest.length ? '<span class="auto-t-more"> · ' + rest.map(label).join(' · ') + '</span>' : '')
    + (times[0] === 0 && !rest.length ? '' : ' min');
}

function _renderBody() {
  const body = _el('auto-body');
  if (!body) return;
  if (_open) { _renderStops(body); return; }
  // "We do not know where you are" and "nothing leaves from here" are
  // different facts, and saying the second when the first is true is a lie
  // the reader cannot see through — there ARE departures, we just have no
  // position. Measured on the GPS-denied run, which said exactly that.
  if (!_stop) {
    const t = noPosText(state.gpsError);
    body.innerHTML = '<div class="dest-prev-empty">' + esc(t.body) + '</div>';
    _setManual(t.cta);
    return;
  }
  _setManual(MANUAL_CTA);
  if (!_dirs.length) {
    body.innerHTML = '<div class="dest-prev-empty">Ingen avganger herfra nå.</div>';
    return;
  }
  // The prediction, demoted from gatekeeper to hint: with history the
  // direction you usually take at this hour is marked, and without it every
  // row behaves the same.
  const guess = predictDest();
  const usual = guess && guess.toName ? String(guess.toName).toLowerCase() : null;
  // Read once, so every row on the screen agrees about what time it is.
  const now = Date.now();
  // A direction whose departures have all gone while you watched is not a
  // choice any more. The screen counts down now (v1.71.0), so rows can age
  // past their own contents — and a row naming a direction with no time
  // beside it promises something the stop board is not saying.
  const live = _dirs.map((d, i) => ({ d, i })).filter(({ d }) => _timesHtml(d, now));
  if (!live.length) {
    body.innerHTML = '<div class="dest-prev-empty">Ingen avganger herfra nå.</div>';
    return;
  }
  body.innerHTML = '<div class="set-label">hvor skal du?</div>'
    + live.map(({ d, i }) => {
      const hint = usual && d.frontText.toLowerCase() === usual;
      const q = quayLabel(d.call);
      // The destination is the part that gives way, so the whole of it has to
      // survive somewhere: aria-label for a screen reader, title for a long
      // press. A row reading "mot Jernb…" must still be able to say what it is.
      const full = 'mot ' + d.frontText + (q ? ', ' + q : '');
      return '<button class="nearby-btn auto-dir' + (hint ? ' auto-usual' : '') + '"'
        + ' type="button" data-i="' + i + '"'
        + ' title="' + esc(full) + '" aria-label="' + esc(full) + '">'
        + '<span class="auto-badges">' + d.lines.map(badgeHtml).join('') + '</span>'
        + '<span class="nearby-name">mot ' + esc(d.frontText) + '</span>'
        // Its own element, not part of the name: a long destination and the
        // platform on one line wrapped the row to two on a 414px screen —
        // measured. The name is the flexible one and gives way first; the
        // platform is two characters and must never be the part that
        // truncates, because it is the part you cannot guess.
        + (q ? '<span class="auto-quay" aria-hidden="true">' + esc(q) + '</span>' : '')
        // "2 · 12 · 22 min": the one you might catch, then the fallbacks.
        //
        // Text inside the existing span, not new children. settings.css:267
        // warns in plain words that a third child pushes the label adrift
        // under space-between — and that warning is there because it happened.
        + '<span class="nearby-dist">' + _timesHtml(d, now) + '</span>'
        + '</button>';
    }).join('');
  body.querySelectorAll('.auto-dir').forEach(b => {
    b.addEventListener('click', () => { _open = _dirs[Number(b.dataset.i)]; _renderBody(); });
  });
}

// Which line's stops the register has already been asked about. The screen
// redraws every second (v1.71.0), so without this the lookup would fire on
// every tick — one request per line, not one per frame.
let _hubsAskedFor = null;

function _renderStops(body) {
  const stops = stopsAhead(_open.call, _stop.name);
  const hubs = loadHubs();
  // The list is drawn now, from whatever the register already knows. Asking
  // is a background errand: an anchor is worth having, and worth nothing at
  // all if the reader waits for it.
  const key = _open.frontText + '|' + _open.lines.map(l => l.code).join(',');
  if (_hubsAskedFor !== key) {
    _hubsAskedFor = key;
    ensureHubs(stops.map(s => s.id)).then(next => {
      // Redraw only if the answer actually told us something, and only if the
      // reader is still looking at this list.
      if (_open && _hubsAskedFor === key
        && stops.some(s => s.id && next[s.id] && !hubs[s.id])) _renderBody();
    });
  }
  body.innerHTML = '<button class="set-via-add-btn auto-back-dir" type="button">← alle retninger</button>'
    + '<div class="set-label">' + _open.lines.map(badgeHtml).join('')
    + ' mot ' + esc(_open.frontText) + '</div>'
    + (stops.length
      ? stops.map((s, i) => '<button class="nearby-btn auto-stop-btn'
        + (isHub(hubs[s.id]) ? ' auto-hub' : '') + '" type="button" data-i="' + i + '">'
        + '<span class="nearby-name">' + esc(s.name) + '</span>'
        + '<span class="nearby-dist">' + (s.mins != null ? s.mins + ' min' : '') + '</span>'
        + '</button>').join('')
      : '<div class="dest-prev-empty">Vet ikke hvor denne stopper.</div>');
  body.querySelector('.auto-back-dir').addEventListener('click', () => {
    _open = null; _hubsAskedFor = null; _renderBody();
  });
  body.querySelectorAll('.auto-stop-btn').forEach(b => {
    b.addEventListener('click', () => {
      const dir = autoRoute(_stop, stops[Number(b.dataset.i)]);
      // The one door the favourites and the shortcuts already use: it sets
      // the route, records the choice and starts the board.
      if (dir) window._useRouteDir(dir, null);
    });
  });
}

/**
 * The stop we have already asked about.
 *
 * renderAuto now runs on the render loop, and it fetches when it has no
 * directions. A stop with no departures has no directions for ever — so
 * without this it would ask the network once a second, all day. Fetching
 * belongs to opening the screen and to ↻; the tick only draws.
 */
let _askedFor = null;

export function renderAuto() {
  // Your usual routes, under the directions and above "skriv hvor du skal":
  // from where you are, to where the line goes, to where you usually go, to
  // typing something of your own. Shared with «velg rute» — one row, one
  // definition of "ofte brukt", and it hides itself when there is nothing,
  // which for a brand-new reader is always.
  renderRouteShortcuts('auto-fav-routes', 2);
  _renderWhere();
  const need = _stop && !_dirs.length && _askedFor !== _stop.id;
  if (need) { _askedFor = _stop.id; _load(); } else _renderBody();
}

/** Fresh screen when the mode is entered, so it never opens on a stale stop. */
export function resetAuto() {
  _askedFor = null; _stop = null; _dirs = []; _open = null; }
