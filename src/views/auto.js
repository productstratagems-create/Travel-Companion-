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
import { ensureHubs, loadHubs, anchorIds } from '../api/hubs.js';
import { logMsg } from '../ui/log.js';
import { loadAutoSort, saveAutoSort, loadAutoStopsOpen, saveAutoStopsOpen,
  NEAR_STOP_MAX_M } from '../geo.js';

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
 * ONE ROW IS ONE LINE. Metro 2 and metro 3 to the same place are two rows,
 * not one row with two badges.
 *
 * This screen used to group by front text alone, on the reasoning that "which
 * of these comes first" is the board's job — two lines to Nationaltheatret
 * were one choice. That reasoning collapsed twice against real data:
 *
 *   1. Reported from Skullerud, with a picture: the metro 3 and the bus 76
 *      both say "Mortensrud", so they folded into one row carrying both
 *      badges — and the row read "spor 1", the metro's platform, because the
 *      platform comes from the soonest call. A reader taking the bus was sent
 *      to the metro track (v1.73.0 split those by mode).
 *   2. Mode alone was not enough either: when `transportMode` is absent from
 *      both, the key falls to the same value and the Skullerud row comes
 *      straight back. Measured.
 *
 * Keying on the line closes both, because two lines never share a `line.id`.
 * A row now carries exactly one badge, one platform and one type — which is
 * also what makes the type sort (v1.73.0) mean anything: a row that was
 * several lines had no single answer to sort on, and no single platform to
 * name.
 *
 * THE PRICE, said here rather than discovered on a screen: at an interchange
 * where lines share a stretch — 1 through 5 westbound from Jernbanetorget —
 * this is five rows where it used to be one. Measured: a Jernbanetorget-
 * shaped stop goes 4 rows to 12. The list is longer on purpose; every row
 * names one vehicle the reader can actually check against the platform sign.
 *
 * The same line in both directions is still two rows — the front texts
 * differ, and that was never in question.
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
    // The line, not the mode. Two lines never share a line.id, so this also
    // subsumes the mode split it replaces — including the case where
    // transportMode is missing, which mode-keying could not survive.
    //
    // publicCode is the fallback rather than nothing: a departure with no
    // line.id at all still has a number on the front of it, and folding all
    // such departures into one row is the very thing being fixed. Front text
    // stays in the key so one line in two directions remains two rows.
    //
    // A NUL separator, not a space or a colon: a front text can contain
    // either, and a key two different directions could collide on is the
    // same bug one level down.
    const lineKey = (ln && (ln.id || ln.publicCode)) || '';
    const key = front + '\u0000' + lineKey;
    const prev = byText.get(key);
    if (!prev) {
      byText.set(key, {
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
    // No badge is added here any more: the key IS the line, so every call
    // reaching an existing row belongs to the line already on it. `lines`
    // stays an array rather than a single field so badgeHtml and the row
    // template keep one shape to render — it is simply always length 1.
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
 * Sorting the list of directions.
 *
 * Asked for: T-bane, Ruter-buss, andre busser, tog — and the soonest
 * departure first inside each group. The list had exactly one order before
 * this, `nextMs` alone, so a bus a minute away always outranked the metro the
 * reader was actually waiting for.
 *
 * WHAT THE APP DOES NOT HAVE, said here rather than discovered in the list:
 * there is no operator or authority data anywhere in it. `boardGQL` selects
 * `line{id publicCode transportMode presentation{colour}}` (queries.js) and
 * nothing more — no `authority`, no `operator`, no `transportSubmode`. So
 * "Ruter-buss" cannot be read directly.
 *
 * What IS in the answer is `line.id`, a NeTEx id whose codespace prefix is
 * the dataset owner: `RUT:Line:…` against `VYX:`, `FLI:` and the rest. That
 * gives the split for free, without touching a query whose field names
 * cannot be tried from here. It is a proxy for the authority, not the
 * authority — hence one named constant, and a fallback that goes DOWNWARDS:
 * a bus with no `line.id`, or a prefix we do not know, lands in "andre
 * busser". The worst outcome is a Ruter bus sinking a little. Never a row
 * disappearing.
 */
/** The NeTEx codespace Ruter publishes under. */
const RUTER_CODESPACE = 'RUT:';

/**
 * The groups, in order, with the words the screen uses for them.
 *
 * A table rather than a chain of ifs, because the sort switch is labelled
 * from the two ENDS of this list — "T-bane først" against "Tog først". Those
 * labels and this order have to agree, and the only way to guarantee that is
 * for there to be one of them. Written as a chain, moving a group would have
 * silently made the buttons lie.
 *
 * The tram is a judgement call and is written down as one: four groups were
 * asked for and `BOARD_MODES` has five modes. It is rail-bound Ruter
 * transport, so it sits with the metro rather than after the train. One row
 * to move if that reads wrong on a real morning.
 */
export const RANKS = [
  { key: 'metro',     label: 'T-bane' },
  { key: 'tram',      label: 'Trikk' },
  { key: 'rutebuss',  label: 'Ruter-buss' },
  { key: 'annenbuss', label: 'Andre busser' },
  { key: 'rail',      label: 'Tog' },
  // An unknown mode is still a departure. Last, never dropped, and never a
  // label — nothing on screen should claim to know what it is.
  { key: 'ukjent',    label: null },
];

const _RANK_OF = Object.fromEntries(RANKS.map((r, i) => [r.key, i]));

/** Which group a direction belongs to. Lower comes first. */
export function dirRank(d) {
  const ln = d && d.call && d.call.serviceJourney && d.call.serviceJourney.line;
  const mode = (ln && ln.transportMode) || null;
  if (mode === 'metro') return _RANK_OF.metro;
  if (mode === 'tram') return _RANK_OF.tram;
  if (mode === 'bus') {
    return String((ln && ln.id) || '').startsWith(RUTER_CODESPACE)
      ? _RANK_OF.rutebuss : _RANK_OF.annenbuss;
  }
  if (mode === 'rail') return _RANK_OF.rail;
  return _RANK_OF.ukjent;
}

/** The two ends of the list, which are what the switch offers. */
export function sortEndLabels() {
  const named = RANKS.filter(r => r.label);
  return { asc: named[0].label, desc: named[named.length - 1].label };
}

/**
 * ONE comparator, used both by `sortDirs` and by the render pass.
 *
 * The render pass cannot sort the rows themselves — `data-i` indexes back
 * into `_dirs` and the click handler reads `_dirs[data-i]`, so re-ordering
 * the array would move the indices under the handler's feet. It sorts the
 * {row, index} pairs instead, with this comparator, so there is no second
 * definition of the order that could drift from this one. Two things that
 * must agree, set in two places, is the bug shape this codebase keeps
 * finding (v1.68.0, v1.71.0).
 */
/**
 * TYPE IS PRIMARY, TIME IS SECONDARY. That is the whole sort, and it is now
 * the only one.
 *
 * There used to be a second mode, time alone, offered beside it. Asked to
 * remove it: sorting by the clock across every type is not an order anyone
 * wanted, and leaving it as a choice meant half the taps produced a list
 * nobody had asked for. It is deleted rather than hidden — an unreachable
 * mode is a second definition of the order waiting to be re-enabled.
 *
 * The direction reverses the GROUPS, not the clock inside them: the reader
 * chooses which type to see first, but putting a departure 37 minutes out
 * above one 3 minutes out helps nobody standing on a platform.
 *
 * @param {boolean} desc
 */
export function dirCmp(desc) {
  const way = desc ? -1 : 1;
  return (a, b) => ((dirRank(a) - dirRank(b)) * way) || (a.nextMs - b.nextMs);
}

/** The rows in the reader's chosen order. Pure; does not touch the input. */
export function sortDirs(rows, desc) {
  return (rows || []).slice().sort(dirCmp(desc));
}

/**
 * What the screen actually draws: the surviving rows, in order, each still
 * carrying the index it has in `_dirs`.
 *
 * The index is the whole reason this is a function and not two lines inline.
 * The button's `data-i` indexes back into `_dirs` and the click handler reads
 * `_dirs[data-i]`, so if the order and the index ever disagree the reader
 * taps "mot Vestli" and gets the stops for a bus to Helsfyr — a wrong answer
 * that looks completely right. Pairing them here means the invariant
 * `dirs[out[k].i] === out[k].d` can be asserted, which is exactly what the
 * test does.
 *
 * @param {(d) => boolean} keep drops rows whose departures have all gone
 */
export function dirRows(dirs, desc, keep) {
  const cmp = dirCmp(desc);
  return (dirs || []).map((d, i) => ({ d, i }))
    .filter(({ d }) => (keep ? keep(d) : true))
    .sort((a, b) => cmp(a.d, b.d));
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
// Did the READER pick this stop, or did the app? Only the reader's choice
// survives a better position fix. Cleared by resetAuto with everything else.
let _stopPinned = false;
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
 * @param {string|null} gpsError state.gpsError — 'denied' when refused,
 *   'nostops' when the position is known but nothing is within the radius
 * @returns {{where: string, body: string, cta: string}}
 */
export function noPosText(gpsError) {
  // Position fine, nothing within the search radius. Not the same fact as
  // "no position", and saying the second when the first is true is a lie the
  // reader cannot see through: they are looking straight at a bus stop while
  // the app tells them it cannot find them. Reachable for the first time now
  // that the radius is 1.2 km rather than an unbounded 5000.
  if (gpsError === 'nostops') {
    return {
      where: 'Ingen holdeplass innen gangavstand.',
      // The distance is read from the constant, not repeated in prose. A
      // sentence that says "en kilometer" while the code says 850 is a lie
      // nobody notices until they count.
      body: 'Vi fant posisjonen din, men ingen holdeplass innenfor '
        + NEAR_STOP_MAX_M + ' meter. Sett stoppet selv hvis du vet hva det heter.',
      cta: 'sett hvor du er →',
    };
  }
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

/**
 * The other stops worth offering next to the one you are at.
 *
 * Exported and pure because the rule it carries is a promise: everything
 * within NEAR_STOP_MAX_M, and nothing else. It used to end in .slice(0, 4),
 * so a stop well inside the limit could still be invisible — measured,
 * "Skullerud stasjon" at 650 m vanished behind three nearer ones. A distance
 * limit with a hidden count limit behind it is not a distance limit.
 *
 * A stop with no measured distance is kept rather than dropped: it came from
 * the same nearby query, so "we did not measure it" is not the same fact as
 * "it is far away".
 */
export function nearbyAlternatives(list, chosen) {
  const id = chosen && chosen.id;
  return (list || []).filter(s =>
    s && s.id !== id && (s.distM == null || s.distM <= NEAR_STOP_MAX_M));
}

/**
 * Is the nearby-stops list showing?
 *
 * Never when there is nothing in it: a heading that folds away an empty list
 * is a control that cannot change anything, which is worse than no control —
 * the same rule _showSort keeps.
 */
export function stopsOpen(count) {
  return count > 0 && loadAutoStopsOpen();
}

/**
 * The "du er ved" heading, which is also the fold.
 *
 * Exported and pure because everything that matters about it is in the
 * markup: whether it is a button at all, what it promises a screen reader,
 * and which way the caret points. Grepping the source for those is not a
 * test — this is.
 *
 * The name and the caret are ONE left-hand flex child, not two siblings. The
 * row is space-between, and a third child in a space-between row pushes the
 * label off its column; settings.css says so in plain words because it has
 * happened here before.
 *
 * The count shows only while the list is closed. Open, the stops are on
 * screen, and a number counting what you are looking at is noise.
 */
export function stopHeadHtml(stop, count, open) {
  const dist = stop && stop.distM != null
    ? '<span class="nearby-dist">' + stop.distM + ' m</span>' : '';
  const name = esc((stop && stop.name) || '');
  const head = '<span class="auto-stop-name">' + name
    + (count > 0
      ? '<span class="auto-stop-more">' + (open ? '' : count + ' ')
        + (open ? '▴' : '▾') + '</span>'
      : '')
    + '</span>';
  if (!count) return '<div class="auto-stop">' + head + dist + '</div>';
  return '<button class="auto-stop" type="button" id="auto-stop-toggle"'
    + ' aria-expanded="' + (open ? 'true' : 'false') + '" aria-controls="auto-alts"'
    + ' aria-label="' + name + ', ' + count + ' holdeplasser i nærheten.'
    + ' Trykk for å ' + (open ? 'skjule' : 'vise') + '">'
    + head + dist + '</button>';
}

/**
 * Which stop the heading names, given the list we have right now.
 *
 * Exported and pure, because the bug it fixes is invisible to any test that
 * renders once. Reported by screenshot: the heading read "Mortensrud 649 m"
 * while every one of the seven alternatives under it was NEARER, down to
 * 369 m. Reproduced in the browser, where it was worse than it looked — the
 * heading said "Mortensrud T · 20 m" beside alternatives at 446 m, so the
 * DISTANCE was stale too, not only the choice.
 *
 * The cause is a one-line guard, `if (!_stop && list.length)`. locateUser
 * resolves stops from the REMEMBERED position first so the screen has
 * something before GPS warms up (geo.js), then resolves again once you have
 * moved 200 m. The second, better answer never reached the heading: _stop was
 * no longer null, so the whole frozen object — name and metres — stayed.
 *
 * Two cases, and they are genuinely different:
 *
 *   not pinned  the app chose this stop, so a better answer replaces it.
 *   pinned      the READER chose it by tapping an alternative. That choice
 *               survives a new fix — but its distance is refreshed from the
 *               new list, because the reader picked a place, not a number.
 *
 * @returns {{stop: object|null, changed: boolean}} changed = a different stop
 */
export function pickStop(list, current, pinned) {
  const l = list || [];
  if (!current) return { stop: l.length ? l[0] : null, changed: !!l.length };
  if (pinned) {
    // Same place, current metres. Falls back to what we have when the reader's
    // stop drops out of range — losing their choice because they walked is
    // worse than a distance going briefly stale.
    const fresh = l.find(s => s.id === current.id);
    return { stop: fresh || current, changed: false };
  }
  if (!l.length) return { stop: current, changed: false };
  return { stop: l[0], changed: l[0].id !== current.id };
}

function _renderWhere() {
  const el = _el('auto-where');
  if (!el) return;
  const list = _stops();
  const picked = pickStop(list, _stop, _stopPinned);
  _stop = picked.stop;
  // A different stop is a different board. Without this the departures below
  // would keep belonging to the stop the reader has walked away from — and
  // the guard in renderAuto only refetches when _dirs is empty.
  if (picked.changed) { _dirs = []; _open = null; }
  if (!_stop) {
    el.innerHTML = '<div class="set-label">du er ved</div>'
      + '<div class="dest-prev-empty">' + esc(noPosText(state.gpsError).where) + '</div>';
    return;
  }
  // Other stops you could actually walk to instead. geo.js searches 5 km to
  // be sure of finding *a* station; offering one of those as an alternative
  // is not an alternative, it is another journey. The limit is
  // NEAR_STOP_MAX_M, defined next to the query that fetches them, so the list
  // cannot offer a distance the query never looked at.
  const others = nearbyAlternatives(list, _stop);
  const open = stopsOpen(others.length);

  el.innerHTML = '<div class="set-label">du er ved</div>'
    + stopHeadHtml(_stop, others.length, open)
    + '<div id="auto-alts"' + (open ? '' : ' hidden') + '>'
    + others.map(s => '<button class="nearby-btn auto-alt" type="button" data-id="' + esc(s.id) + '">'
      + '<span class="nearby-name">' + esc(s.name) + '</span>'
      + '<span class="nearby-dist">' + (s.distM != null ? s.distM + ' m' : '') + '</span>'
      + '</button>').join('')
    + '</div>';

  // Listeners are re-attached on every tick, which is fine and is how the
  // alternatives have always worked. It is the STATE that cannot live here:
  // this innerHTML is rewritten once a second, so a class on the markup would
  // be wiped before the reader let go of the button. It lives in storage.
  const toggle = _el('auto-stop-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      saveAutoStopsOpen(!loadAutoStopsOpen());
      _renderWhere();
    });
  }
  el.querySelectorAll('.auto-alt').forEach(b => {
    b.addEventListener('click', () => {
      _stop = list.find(s => s.id === b.dataset.id) || _stop;
      // The reader chose. From here a new fix refreshes the distance but does
      // not overrule the choice — until they leave the screen.
      _stopPinned = true;
      _open = null; _dirs = [];
      // Deliberately NOT collapsing here. Having the list shut under the
      // finger that just picked from it is a movement nobody asked for, and
      // it makes trying two stops in a row needlessly hard.
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

/**
 * The sort switch is only there when there is something to sort.
 *
 * Not while a direction is open (that screen is a list of stops in line
 * order, and re-ordering it would be nonsense), and not while the list is
 * empty or we have no position. A control that cannot change anything is
 * worse than no control.
 */
let _sortWired = false;
function _showSort(on) {
  const el = _el('auto-sort');
  if (!el) return;
  el.style.display = on ? '' : 'none';
  if (!on) return;
  const { desc } = loadAutoSort();
  const ends = sortEndLabels();
  el.querySelectorAll('.pref-btn').forEach(b => {
    const wantsDesc = b.dataset.val === 'desc';
    const active = wantsDesc === desc;
    // The words come from the ends of the RANKS table, so a group moved there
    // moves the label with it. "Stigende" and "synkende" said nothing about
    // an order of categories — the reader had to tap to find out what they
    // meant, which is the definition of a control that does not explain
    // itself.
    b.querySelector('.sort-word').textContent = (wantsDesc ? ends.desc : ends.asc) + ' først';
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  if (_sortWired) return;
  _sortWired = true;
  el.querySelectorAll('.pref-btn').forEach(b => {
    b.addEventListener('click', () => {
      saveAutoSort(b.dataset.val === 'desc');
      _renderBody();
    });
  });
}

function _renderBody() {
  const body = _el('auto-body');
  if (!body) return;
  if (_open) { _showSort(false); _renderStops(body); return; }
  // "We do not know where you are" and "nothing leaves from here" are
  // different facts, and saying the second when the first is true is a lie
  // the reader cannot see through — there ARE departures, we just have no
  // position. Measured on the GPS-denied run, which said exactly that.
  if (!_stop) {
    const t = noPosText(state.gpsError);
    _showSort(false);
    body.innerHTML = '<div class="dest-prev-empty">' + esc(t.body) + '</div>';
    _setManual(t.cta);
    return;
  }
  _setManual(MANUAL_CTA);
  if (!_dirs.length) {
    _showSort(false);
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
  const live = dirRows(_dirs, loadAutoSort().desc, d => _timesHtml(d, now));
  if (!live.length) {
    _showSort(false);
    body.innerHTML = '<div class="dest-prev-empty">Ingen avganger herfra nå.</div>';
    return;
  }
  _showSort(true);
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
// Which folded stretches the reader has opened. A module variable, cleared
// when the direction changes, for the same reason _hubsAskedFor is one:
// everything in #auto-body is rewritten once a second, so state kept in the
// markup would be gone before the finger lifted.
const _openRuns = new Set();

/**
 * The stops along a direction, with the plain stretches folded away.
 *
 * Asked for: "holdeplasser som ikke har slike funksjoner kollapses. Må kunne
 * ekspanderes." Line 3 to Kolsås is twenty-four stops, and the ones you can
 * actually change at are a handful. Anchoring them (v1.72.0) helped; it did
 * not shorten anything.
 *
 * One folded row per STRETCH between two interchanges, not one switch for the
 * whole list — chosen, and it keeps the sense of how far apart the anchors
 * are. Expanding opens only that stretch.
 *
 * Three guards, because the worst outcome here is a list that has eaten
 * itself:
 *
 *   no anchors      if the register found no interchange on this line — the
 *                   line field was refused, or the answer has not landed yet
 *                   — every stop is shown. MEASURED, and it is why this
 *                   guard is about anchors rather than about knowledge: with
 *                   Quay.lines refused every stop falls back to a plain
 *                   two-platform entry, the register knows them all perfectly
 *                   well, and seventeen stops folded into ONE row plus the
 *                   terminus. A list that has eaten itself because a field
 *                   was refused is far worse than a long list.
 *   the last stop   always shown. It is the terminus, and it is the name of
 *                   the direction itself.
 *   a run of one    not folded. "1 stopp" costs a row and saves none.
 *
 * @param {Array} stops   from stopsAhead
 * @param {object} hubs   the register
 * @param {Set} openRuns  which folded stretches the reader has opened
 * @returns {Array} rows: {kind:'stop', s, i} or {kind:'run', key, from, to, items}
 */
export function stopRuns(stops, hubs, openRuns) {
  const list = stops || [];
  if (!list.length) return [];
  const ids = anchorIds(list, hubs);
  if (!ids.size) return list.map((s, i) => ({ kind: 'stop', s, i }));

  const anchor = (s, i) => ids.has(s.id) || i === list.length - 1;
  const out = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    if (run.length === 1) out.push(run[0]);
    else {
      const key = run[0].s.id || run[0].s.name;
      out.push(openRuns && openRuns.has(key)
        ? { kind: 'open', key, items: run }
        : { kind: 'run', key, from: run[0].s.name, to: run[run.length - 1].s.name,
            items: run });
    }
    run = [];
  };
  list.forEach((s, i) => {
    if (anchor(s, i)) { flush(); out.push({ kind: 'stop', s, i }); }
    else run.push({ kind: 'stop', s, i });
  });
  flush();
  return out;
}

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
  const anchors = anchorIds(stops, hubs);
  const stopHtml = ({ s, i }) => '<button class="nearby-btn auto-stop-btn'
    + (anchors.has(s.id) ? ' auto-hub' : '') + '" type="button" data-i="' + i + '">'
    + '<span class="nearby-name">' + esc(s.name) + '</span>'
    + '<span class="nearby-dist">' + (s.mins != null ? s.mins + ' min' : '') + '</span>'
    + '</button>';
  const rowHtml = (r) => {
    if (r.kind === 'stop') return stopHtml(r);
    if (r.kind === 'open') return r.items.map(stopHtml).join('');
    return '<button class="nearby-btn auto-run" type="button" data-run="' + esc(r.key) + '"'
      + ' aria-expanded="false"'
      + ' aria-label="' + esc(r.from) + ' til ' + esc(r.to) + ', ' + r.items.length
      + ' stopp. Trykk for å vise">'
      + '<span class="nearby-name">' + esc(r.from) + ' → ' + esc(r.to) + '</span>'
      + '<span class="nearby-dist">' + r.items.length + ' stopp ▾</span>'
      + '</button>';
  };
  body.innerHTML = '<button class="set-via-add-btn auto-back-dir" type="button">← alle retninger</button>'
    + '<div class="set-label">' + _open.lines.map(badgeHtml).join('')
    + ' mot ' + esc(_open.frontText) + '</div>'
    + (stops.length
      ? stopRuns(stops, hubs, _openRuns).map(rowHtml).join('')
      : '<div class="dest-prev-empty">Vet ikke hvor denne stopper.</div>');
  body.querySelector('.auto-back-dir').addEventListener('click', () => {
    _open = null; _hubsAskedFor = null; _openRuns.clear(); _renderBody();
  });
  body.querySelectorAll('.auto-run').forEach(b => {
    b.addEventListener('click', () => { _openRuns.add(b.dataset.run); _renderBody(); });
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
  _askedFor = null; _stop = null; _stopPinned = false; _dirs = []; _open = null;
  _openRuns.clear(); }
