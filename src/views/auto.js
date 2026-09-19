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
import { esc, clkDay } from '../ui/fmt.js';
import { stopKey } from '../stopId.js';
import config from '../config.js';
import { state } from '../state.js';
import { fetchNextDeparture, fetchBoard } from '../api/entur.js';
import { NEXT_DEPARTURE_HORIZON_MINS } from '../api/queries.js';
import { predictDest, autoJumpDest } from '../api/smart.js';
import { renderRouteShortcuts } from '../ui/favs.js';
import { renderAlertsInto } from '../ui/alerts.js';
import { byLine } from '../api/situations.js';
import { addSituation } from '../api/situations.js';
import { logMsg } from '../ui/log.js';
import { depUses, usesOf, loadFreq } from '../api/usage.js';
import { normMode } from '../api/stopCats.js';
import { loadAutoSort, saveAutoSort, NEAR_STOP_MAX_M, walkMinsTo, userLL, minsToLeave, reachCls, posState } from '../geo.js';
import L from 'leaflet';
import { createMap, drawWalk, userDot, drawStopLine } from '../ui/map.js';
import { makeStopIcon } from '../ui/mapIcons.js';
import { ensureApproach, approachPoints, AT_STOP_M } from '../api/approach.js';

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
        // THE LINE'S OWN ID travels with the badge now. It was the one field
        // the descriptor did not carry, and without it a row cannot be asked
        // whether a disruption is about its line — the same shape as the
        // detail map drawing every mode alike until `mode` was added in
        // v1.114.0. `lineKey` above has had it in hand all along.
        lines: code ? [{ code, colour, id: (ln && ln.id) || null }] : [],
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
/**
 * Which operator's buses are the LOCAL ones — read off the stop itself.
 *
 * This used to be the literal 'RUT:'. Ruter's codespace, written into the
 * ranking, which meant that outside Ruter's area EVERY bus fell into «andre
 * busser» while the group named after the local operator stood empty. In
 * Bergen the split said the exact opposite of the truth.
 *
 * The codespace running the most bus departures AT THIS STOP is the local
 * network there, whether that is RUT:, SKY: or ATB:. Self-configuring — and
 * this is the point — it needs no table of codespaces written from memory.
 * The sandbox cannot reach Entur to check one, and a guessed field value has
 * cost this project a release before.
 *
 * A tie means we do not know, and then there is no local operator: one bus
 * group beats a confident wrong split.
 */
export function localCodespace(dirs) {
  const counts = new Map();
  (dirs || []).forEach(d => {
    const ln = d && d.call && d.call.serviceJourney && d.call.serviceJourney.line;
    if (normMode((ln && ln.transportMode) || null) !== 'bus') return;
    const id = String((ln && ln.id) || '');
    const i = id.indexOf(':');
    if (i < 1) return;
    const cs = id.slice(0, i + 1);
    counts.set(cs, (counts.get(cs) || 0) + 1);
  });
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null;
  return ranked[0][0];
}

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
  // Named for what it is, not for who runs it: the operator differs by
  // city, and the app no longer claims to know which one you are looking at.
  { key: 'rutebuss',  label: 'Lokalbuss' },
  { key: 'annenbuss', label: 'Andre busser' },
  { key: 'rail',      label: 'Tog' },
  { key: 'water',     label: 'Båt' },
  // An unknown mode is still a departure. Last, never dropped, and never a
  // label — nothing on screen should claim to know what it is.
  { key: 'ukjent',    label: null },
];

const _RANK_OF = Object.fromEntries(RANKS.map((r, i) => [r.key, i]));

/** Which group a direction belongs to. Lower comes first. */
export function dirRank(d, local) {
  const ln = d && d.call && d.call.serviceJourney && d.call.serviceJourney.line;
  // An express coach is a bus here, and not a local one — it ranks with
  // "andre busser", which is exactly what it is.
  const mode = normMode((ln && ln.transportMode) || null);
  if (mode === 'metro') return _RANK_OF.metro;
  if (mode === 'tram') return _RANK_OF.tram;
  if (mode === 'bus') {
    // No local operator known — one bus, or a dead heat — means ONE bus
    // group rather than a wrong split. The two keys are adjacent, so the
    // list still reads as a single run of buses.
    if (!local) return _RANK_OF.annenbuss;
    return String((ln && ln.id) || '').startsWith(local)
      ? _RANK_OF.rutebuss : _RANK_OF.annenbuss;
  }
  if (mode === 'rail') return _RANK_OF.rail;
  if (mode === 'water') return _RANK_OF.water;
  return _RANK_OF.ukjent;
}

/**
 * The two ends of the list, which are what the switch offers.
 *
 * NAMED FOR WHAT IS ACTUALLY HERE. This used to take the ends of RANKS
 * outright, so the switch said «T-bane først» at a Bergen stop that has no
 * metro at all — seen on the screen, not in any number — and «Tog først» at
 * any Oslo stop with no trains. A control that names a group it cannot show
 * is worse than one that names nothing.
 *
 * With nothing to look at, the old answer stands: on a first render the
 * labels have to say something.
 */
export function sortEndLabels(dirs, local) {
  const named = RANKS.filter(r => r.label);
  const here = named.filter(r =>
    (dirs || []).some(d => dirRank(d, local) === _RANK_OF[r.key]));
  const use = here.length ? here : named;
  return {
    asc: use[0].label,
    desc: use[use.length - 1].label,
    // ONE GROUP MEANS THERE IS NOTHING TO ORDER. Reported with a screenshot
    // from Mortensrud: every departure was a local bus, so both ends of the
    // table named the same group and the switch offered «Lokalbuss først»
    // twice — two buttons, one of them highlighted, and no way to tell them
    // apart or any difference if you tapped.
    //
    // The labels are derived from what is actually present, which is what
    // makes them honest; this is the same derivation carried one step further,
    // to whether the control means anything at all. _showSort already says in
    // its own doc that «a control that cannot change anything is worse than no
    // control» — it simply had no way to know this was one of those times.
    meaningful: use.length > 1,
  };
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
export function dirCmp(desc, local) {
  const way = desc ? -1 : 1;
  return (a, b) => ((dirRank(a, local) - dirRank(b, local)) * way) || (a.nextMs - b.nextMs);
}

/** The rows in the reader's chosen order. Pure; does not touch the input. */
export function sortDirs(rows, desc, local) {
  return (rows || []).slice().sort(dirCmp(desc, local));
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
export function dirRows(dirs, desc, keep, local) {
  const cmp = dirCmp(desc, local);
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
  const norm = stopKey;   // was recipe C: the comma clause was missing
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
/** A message's one-line summary, in the reader's language where there is one. */
function _sitTitle(s) {
  const arr = (s && s.summary) || [];
  const no = arr.find(x => x && x.language === 'no') || arr[0];
  return (no && no.value) || '';
}

/**
 * A disruption, on the row it concerns.
 *
 * Inside `.auto-badges` on purpose. This row is a flex with space-between, and
 * settings.css warns in plain words — twice, because it has happened — that a
 * third child pushes the destination adrift. The badges span is already a
 * container of small things about the line, and a disruption about that line
 * belongs with them.
 *
 * The mark says HOW MANY and the row says WHAT, through its label: on a phone
 * there is no hover, so the text has to be somewhere a screen reader and a
 * long press can both reach. The full message stays in the folded banner —
 * nothing is only here.
 */
/** The messages for a row's lines, deduped across the lines it carries. */
function _dirAlerts(dir, perLine) {
  const out = [];
  ((dir && dir.lines) || []).forEach(l => {
    (perLine.get(l && l.id) || []).forEach(m => { if (!out.includes(m)) out.push(m); });
  });
  return out;
}

/**
 * What «ingen avganger» actually means this time.
 *
 * Reported from Storaas Gjestegård on a Saturday: «vår app viser ingen
 * avganger, men Entur har avganger.» Entur had none that day either — its own
 * message says so and then shows MONDAY. The stop has no weekend service. So
 * the app was right, and «Ingen avganger herfra nå.» read as «something is
 * broken, try later» when the truth was «not until Monday 07:05».
 *
 * AND THAT ONE SENTENCE MEANT SIX THINGS. It was written from two places on a
 * bare `!_dirs.length`, and covered: nothing in the ninety-minute window;
 * everything in the answer already gone; calls with no front text; everything
 * filtered out by mode; stale rows aged out at the one-second tick; and —
 * plainly a bug — THE SCREEN HAVING ASKED NOTHING YET, because `pinStop`
 * empties `_dirs` and renders before `_load` runs.
 *
 * One pure verdict, as `liveness` (v1.106.0) and `posState` (v1.108.0) are,
 * and the screen takes its words from the kind rather than testing the inputs
 * again.
 *
 * @param {{asked: boolean, dirs: Array, live: Array, nextMs: number|null,
 *          now: number, horizonMins: number}} o
 * @returns {{kind: string, label: string}}
 */
export function boardState(o) {
  const c = o || {};
  const now = Number.isFinite(c.now) ? c.now : Date.now();

  // NOT ASKED IS NOT EMPTY. This is the bug, not the wording: the screen said
  // «ingen avganger» about something it had not looked at.
  if (!c.asked) return { kind: 'henter', label: 'Henter avganger \u2026' };

  const dirs = c.dirs || [];
  const live = c.live || [];

  // Rows exist and every one has aged past its last departure. A different
  // fact from «the stop gave us nothing», and the reader can act on it: a
  // refresh will help here and will not help there.
  if (dirs.length && !live.length) {
    return { kind: 'passert', label: 'Avgangene herfra har g\u00e5tt. Hent p\u00e5 nytt.' };
  }

  if (!dirs.length) {
    // UNDEFINED IS «STILL LOOKING», null is «looked and found nothing». The
    // first cut normalised both to null before testing, so the «still
    // looking» branch could never fire and the screen jumped straight to
    // «ingen avganger» — the flicker this state exists to prevent, written
    // into the very function meant to prevent it.
    if (c.nextMs === undefined) return { kind: 'henter', label: 'Henter avganger \u2026' };
    const next = Number.isFinite(c.nextMs) ? c.nextMs : null;
    if (next && next > now) {
      return { kind: 'senere', label: 'Neste avgang herfra: ' + clkDay(next, now) };
    }
    // Asked two days ahead and found nothing. Said plainly rather than left
    // as «nå», which invites a reader to wait for something that is not
    // coming.
    const days = Math.round((c.horizonMins || 0) / (24 * 60));
    return {
      kind: 'ingen',
      label: days >= 1
        ? 'Ingen avganger herfra de neste ' + (days === 1 ? 'd\u00f8gnet' : days + ' d\u00f8gnene') + '.'
        : 'Ingen avganger herfra n\u00e5.',
    };
  }

  return { kind: 'ok', label: '' };
}

export function badgeHtml(l) {
  return '<span class="line-badge" style="background:#'
    + esc(l.colour || '7c2d12') + '">' + esc(l.code || '?') + '</span>';
}


// ── The screen ─────────────────────────────────────────────────────────────

let _stop = null;      // { name, id, lat, lon }
// Did the READER pick this stop, or did the app? Only the reader's choice
// survives a better position fix. Cleared by resetAuto with everything else.
let _stopPinned = false;
/** Has a board answer arrived for this stop yet? «Not asked» is not «empty». */
let _asked = false;
/** The next departure beyond the board's window: ms, null when none, undefined while looking. */
let _nextMs = undefined;
/** Did the answer come back at the query's cap? See boardTruncated. */
let _truncated = false;
/** This stop's own traffic messages — auto-reise threw them away entirely. */
let _alerts = [];
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
  // EVERY state gets its own sentence, and each one names what the reader can
  // actually do about it. The three below used to be one: codes 2 and 3 never
  // reached state at all, and «not asked» and «searching» were both
  // gpsError === null.
  const CTA = 'sett hvor du er →';
  if (gpsError === 'denied') {
    return {
      where: 'Stedstjenester er avslått.',
      body: 'Uten posisjon vet ikke appen hvilket stopp du står ved. '
        + 'Slå på stedstjenester for denne siden, eller sett stoppet selv.',
      cta: CTA,
    };
  }
  if (gpsError === 'unavailable') {
    return {
      where: 'Finner ikke posisjonen din.',
      // Not «leter». The device tried and gave up, so waiting will not help —
      // and telling someone indoors to keep waiting is the worst of the five.
      body: 'Enheten fikk ikke tak i posisjonen. Det skjer ofte innendørs og '
        + 'i tunnel. Sett stoppet selv, eller gå ut og prøv igjen.',
      cta: CTA,
    };
  }
  if (gpsError === 'timeout') {
    return {
      where: 'Posisjonen tok for lang tid.',
      body: 'Enheten svarte ikke i tide. Sett stoppet selv, så prøver vi '
        + 'videre i bakgrunnen.',
      cta: CTA,
    };
  }
  // The two that were one. `asked` is false only before locateUser has run —
  // a real state, and the one where «leter etter posisjonen din» is a lie.
  if (gpsError === 'unsupported') {
    return {
      where: 'Enheten kan ikke oppgi posisjon.',
      // Not «slå på stedstjenester»: there is no such switch here. The browser
      // has no Geolocation API — an insecure context, an embedded webview, or
      // simply an old one.
      body: 'Denne nettleseren har ikke stedstjenester. Sett stoppet selv, '
        + 'så husker appen det.',
      cta: CTA,
    };
  }
  return {
    where: 'Finner ikke posisjonen din ennå.',
    body: 'Leter etter posisjonen din. Du kan sette stoppet selv mens du venter.',
    cta: CTA,
  };
}

/** The button at the bottom, which is the only way on when there is no fix. */
const MANUAL_CTA = 'skriv hvor du skal →';
function _setManual(label) {
  const b = _el('auto-manual');
  if (b) b.textContent = label;
}

/**
 * How close counts as "you are standing there".
 *
 * A claim about GPS ACCURACY, not about transit: geo.js already refuses fixes
 * noisier than ACC_GATE = 40 m, so a stop within a hundred metres of an
 * accepted fix is somewhere the reader can see. Inside that band the app does
 * not argue with them, whatever the history says.
 */
export const CLOSE_M = 100;

/**
 * The nearby stops, best suggestion first.
 *
 * Asked for: "Rangér «du er ved» basert på bruk. Steder ofte i bruk kan
 * foreslås foran steder som er nærmere." That reverses v1.76.0's "nearest
 * wins, always" — which was right then, when the app preferred metro stations
 * and hid kerbside bus stops entirely. Now that every stop is in the list,
 * the nearest is often one the reader has never used: reported from
 * Mortensrud, where the stop they take every day sat fifth at 649 m behind
 * four they have never boarded.
 *
 * Three bands, in order:
 *
 *   1. within CLOSE_M   nearest first. You are standing there.
 *   2. used before      most used first, then distance.
 *   3. everything else  distance, exactly as before.
 *
 * Band 1 is the half that is easy to lose: without it, standing at a bus stop
 * you have never used would have the app name somewhere six hundred metres
 * away.
 *
 * With no history at all every stop falls to band 3, so a new reader sees
 * precisely today's list.
 */
export function rankStops(list, uses) {
  const band = (s) => {
    if (s.distM != null && s.distM <= CLOSE_M) return 0;
    return usesOf(s, uses) > 0 ? 1 : 2;
  };
  const d = (s) => (s.distM == null ? Infinity : s.distM);
  return (list || []).slice().sort((a, b) =>
    (band(a) - band(b))
    // Inside the used band, count decides and distance breaks the tie — so
    // two equally used stops still order predictably rather than by whatever
    // the geocoder happened to return.
    || (band(a) === 1 ? usesOf(b, uses) - usesOf(a, uses) : 0)
    || (d(a) - d(b)));
}

function _stops() {
  const list = (state.nearestStations && state.nearestStations.length)
    ? state.nearestStations
    : (state.nearestStation ? [state.nearestStation] : []);
  // Ranked HERE, once, so the heading and the alternatives cannot disagree
  // about the order — pickStop and nearbyAlternatives both read this.
  //
  // state.nearestStations itself is left alone: "fra stasjon" in settings
  // reads the same array and should stay purely nearest-first. Sorting it in
  // place would move a list nobody asked to move.
  return rankStops(list, depUses());
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
 * The lanes, in order, with their Norwegian names.
 *
 * NOT `RANKS`. That table splits buses into «Ruter-buss» and «Andre busser»
 * on the codespace in `line.id` — something a departure has and a STOP does
 * not. Two lists for two different questions, and a test asserts that every
 * mode `modesOf` can produce has a lane here, which is the guard against them
 * drifting apart.
 */
export const LANES = [
  { mode: 'metro', label: 'T-bane' },
  { mode: 'tram',  label: 'Trikk' },
  { mode: 'bus',   label: 'Buss' },
  { mode: 'rail',  label: 'Tog' },
  { mode: 'water', label: 'Båt' },
  { mode: null,    label: 'Andre stopp' },
];

/**
 * The nearby stops, split into one band per mode.
 *
 * A STOP APPEARS IN EVERY LANE IT SERVES. Hellerud is under T-bane and under
 * Buss, same id, same tap — chosen deliberately: one row is one way to
 * travel, and "you can get a bus from here too" is usually the thing worth
 * knowing. It also means the lane a reader scans is complete, which a
 * one-lane-per-stop rule could never promise.
 *
 * Order INSIDE a lane is the order it was given — `rankStops` has already
 * weighed closeness and use, and splitting the list must not throw that away.
 *
 * Empty lanes are dropped: a heading over nothing is a label that lies about
 * what is nearby.
 *
 * A stop with no known mode still gets a lane. Falling out of the list
 * entirely would be a stop the geocoder found and the screen hid.
 */
export function laneStops(list) {
  return LANES
    .map(({ mode, label }) => ({
      mode, label,
      stops: (list || []).filter(s => {
        const m = (s && s.modes) || [];
        return mode === null ? !m.length : m.includes(mode);
      }),
    }))
    .filter(l => l.stops.length);
}

/**
 * Is the nearby-stops list showing?
 *
 * Never when there is nothing in it: a heading that folds away an empty list
 * is a control that cannot change anything, which is worse than no control —
 * the same rule _showSort keeps.
 */
/**
 * Is the nearby-stops list showing?
 *
 * A module variable, NOT a stored preference, and cleared by resetAuto when
 * the screen is entered, so it never opens expanded on a later visit.
 *
 * v1.79.0 stored it, so "collapsed by default" only held until the first tap:
 * after that the list was open for ever, and the reported behaviour was the
 * opposite of the default. Open while you are on the screen, closed when you
 * come back, is what was actually wanted.
 *
 * Never open when there is nothing in it: a heading that folds away an empty
 * list is a control that cannot change anything, which is worse than no
 * control — the same rule _showSort keeps.
 */
let _stopsShown = false;

export function stopsOpen(count) {
  return count > 0 && _stopsShown;
}

/** Test seam. The tap itself lives in a DOM handler and no unit test reaches
 *  it; the browser probe carries that half. */
export function _setStopsOpen(v) { _stopsShown = !!v; }

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
export function stopHeadHtml(stop, count, open, extra) {
  // TWO LINES, and that is the repair rather than a CSS patch on one.
  //
  // v1.101.0 put three facts where «369 m» had been — «6014 m · 15 min gange ·
  // posisjon 8 min gammel», some 44 characters — beside a 1.35rem name in a
  // space-between row of exactly two children. Reported by screenshot from a
  // phone in portrait: «Mortensrud» with the metres printed straight across
  // it. Measured at 390px: a 35×16px collision.
  //
  // The name is one unbreakable word and the row gave it no floor, so it ran
  // out of its own box. The codebase warned about precisely this twice — in
  // the CSS above .auto-stop and in this file — but the guard that enforces it
  // was only ever written for the direction rows.
  //
  // So the name gets a line to itself. It shares a row with nothing, and
  // therefore cannot collide with anything: structure, not a rule that has to
  // keep holding.
  const bits = [];
  // THE DISTANCE AND THE WALK COME FROM ONE CALL, FROM ONE POSITION.
  //
  // They did not. `stop.distM` is measured from wherever findNearestStation
  // was last called — frozen until you have drifted STATION_REFRESH_M — while
  // walkMinsTo measures from `walkFromLL || homeLL`, live. With a «gå fra»
  // place set in settings those are two different points, permanently, across
  // sessions: nothing in findNearestStation reads walkFromLL. The screenshot
  // is the proof — «6014 m» beside «15 min gange», and six kilometres is over
  // an hour on foot.
  //
  // v1.101.0 did not create that; it made it visible by printing the two
  // numbers side by side. The fix is not to keep them in step but to have one
  // answer: walkMinsTo already returns the distance it used.
  if (extra && extra.walkDist != null) bits.push(extra.walkDist + ' m å gå');
  else if (stop && stop.distM != null) bits.push(stop.distM + ' m');
  if (extra && extra.walkMins != null) bits.push(extra.walkMins + ' min gange');
  // Only when it is stale — posAgeMins returns null while the fix is fresh, so
  // the threshold is not repeated here.
  // THE SENTENCE COMES FROM posState. «posisjon N min gammel» was written out
  // here and again in board.js:2321 — two copies of one string, which is how
  // «unøyaktig» could be added to one screen and not the other. Now both read
  // the label off the same verdict, and this screen gains «posisjonen er
  // unøyaktig (±120 m)» for free.

  // The note gets its OWN span, and the facts line does not.
  //
  // v1.108.0 put the sentence here and left it in the same ink as the walking
  // distance beside it — measured on the screen, and reported as left undone,
  // because colouring the whole line would have coloured «374 m å gå» too.
  // Its own element is the way out: the caution is on the caution, and the
  // distance stays a plain fact. The board has had this since v1.60 (its
  // stamp takes a `stale` class); this is auto-reise catching up.
  // THE VERDICT ITSELF, not a label and a kind passed side by side. The first
  // cut took `posNote` and `posKind` as two fields, and a mutant that simply
  // stopped passing the second survived every test: the class fell back to
  // «gammel», so an inaccurate position would have been amber where it should
  // be red. Two things that must agree, one release after the last one. One
  // object cannot disagree with itself.
  const ps = extra && extra.pos;
  const note = ps && ps.kind && ps.kind !== 'ok' && ps.label
    ? '<span class="auto-pos-note ' + esc('pos-' + ps.kind) + '">'
      + esc(ps.label) + '</span>'
    : '';

  // THE NOTE ON ITS OWN ROW, not appended to the facts with a middot.
  //
  // Reported with a screenshot: «979 m å gå · 14 min gange · posisjonen er
  // unøyaktig (±56 m)» wrapped at 390px, and it wrapped INSIDE the caution —
  // «posisjonen er / unøyaktig (±56 m)». Measured as text runs: two line
  // boxes for one phrase, and a facts line 32px tall instead of 16.
  //
  // The CSS above this once said a sentence taking two lines is not a layout
  // fault, and that was true when the line held two numbers. v1.108.0 made it
  // three things, and the third is a different KIND of thing: how far and how
  // long are facts about the walk, and the note is a caution about the sensor.
  // A middot joins peers. Its own row cannot split another fact, and cannot be
  // split by one.
  const factsLine = bits.length
    ? '<span class="auto-stop-facts">' + esc(bits.join(' \u00b7 ')) + '</span>' : '';
  const facts = factsLine + note;
  const name = esc((stop && stop.name) || '');
  // The name in its own element so it can be given an ellipsis. It used to be
  // a bare text node beside the caret, which is also why a browser probe that
  // swept ELEMENTS could not see it overflow — it had no box of its own.
  const head = '<span class="auto-stop-name">'
    + '<span class="auto-stop-label">' + name + '</span>'
    + (count > 0
      ? '<span class="auto-stop-more">' + (open ? '' : count + ' ')
        + (open ? '▴' : '▾') + '</span>'
      : '')
    + '</span>';
  if (!count) return '<div class="auto-stop">' + head + facts + '</div>';
  return '<button class="auto-stop" type="button" id="auto-stop-toggle"'
    + ' aria-expanded="' + (open ? 'true' : 'false') + '" aria-controls="auto-alts"'
    + ' aria-label="' + name + ', ' + count + ' holdeplasser i nærheten.'
    + ' Trykk for å ' + (open ? 'skjule' : 'vise') + '">'
    + head + facts + '</button>';
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

/**
 * What to say about the position under the stop name, or nothing.
 *
 * Silent while the fix is good: a line reading «posisjonen er fin» under a
 * stop name is the noise this app keeps removing. It speaks for exactly the
 * states a reader could act on — old, and the one that used to be invisible.
 */
function _posState() {
  return posState({
    asked: state.posAsked, homeLL: state.homeLL, posAt: state.posAt,
    gpsError: state.gpsError, rejAt: state.posRejAt, acc: state.posAcc,
  });
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
  if (picked.changed) { _dirs = []; _open = null; _asked = false; _nextMs = undefined; }
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

  const w = walkMinsTo(_stop);
  // posAgeMins already returns null while the fix is fresh (POS_STALE_MS), so
  // the threshold is not repeated here. One definition of "stale".
  el.innerHTML = '<div class="set-label">du er ved</div>'
    + stopHeadHtml(_stop, others.length, open, {
      walkDist: w ? w.dist : null,
      walkMins: w ? w.mins : null,
      pos: _posState(),
    })
    + '<div id="auto-alts"' + (open ? '' : ' hidden') + '>'
    // One band per mode. The count in the heading above is the number of
    // STOPS, not of rows — an interchange stands in two lanes, and letting it
    // count twice is the one error here that would look entirely right.
    + laneStops(others).map(lane =>
      '<div class="auto-lane">'
      + '<div class="set-label">' + esc(lane.label) + '</div>'
      + lane.stops.map(s => '<button class="nearby-btn auto-alt" type="button" data-id="' + esc(s.id) + '">'
        + '<span class="nearby-name">' + esc(s.name) + '</span>'
        + '<span class="nearby-dist">' + (s.distM != null ? s.distM + ' m' : '') + '</span>'
        + '</button>').join('')
      + '</div>').join('')
    + '</div>';

  // Listeners are re-attached on every tick, which is fine and is how the
  // alternatives have always worked. It is the STATE that cannot live here:
  // this innerHTML is rewritten once a second, so a class on the markup would
  // be wiped before the reader let go of the button. It lives in storage.
  const toggle = _el('auto-stop-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      _stopsShown = !_stopsShown;
      _renderWhere();
    });
  }
  el.querySelectorAll('.auto-alt').forEach(b => {
    b.addEventListener('click', () => pinStop(b.dataset.id));
  });
}

/**
 * The orientation map.
 *
 * The thing this screen was missing entirely. auto-reise is where the app
 * answers «where am I, where is the stop, how do I get there», and until now
 * it answered all three in text: «du er ved Mortensrud T» and «369 m». There
 * was no Leaflet import in the file at all.
 *
 * CREATED ONCE. The screen redraws every second (scheduler.js), so building
 * the map inside the render would tear down and rebuild a Leaflet instance at
 * 1 Hz. It is built on the first render that has a stop, and updated after.
 *
 * REDRAWN ONLY WHEN SOMETHING MOVED. Same reasoning one level down: clearing
 * and refilling the layer every tick is churn the reader sees as flicker, so
 * the markers are keyed on what they depend on.
 */
let _aMap = null;
let _aLayer = null;
let _aKey = '';
let _aFitKey = '';
let _aUserMoved = false;
let _aOpenKey = null;

/** Test seam: module state, and a test must be able to clear it. */
export function _resetAutoMap() {
  if (_aMap) { try { _aMap.remove(); } catch (_) {} }
  _aMap = null; _aLayer = null; _aKey = ''; _aFitKey = ''; _aUserMoved = false;
  _aOpenKey = null; _linePicked = null;
}
export function _autoMap() { return _aMap; }

/**
 * What the map is showing right now, as one string.
 *
 * Pure and exported so the "drawn once" claim is testable without a browser.
 * The position is rounded to ~11 m — the same four decimals `walkKey` uses —
 * because a GPS fix jitters by a few metres while standing still, and keying
 * on the raw value would redraw the map on jitter alone.
 */
export function mapKey(stop, userPos, others, walkPts, open) {
  const r = v => (v == null ? '-' : v.toFixed(4));
  return [
    stop ? stop.id : '-',
    userPos ? r(userPos.lat) + ',' + r(userPos.lon) : '-',
    others.length,
    walkPts ? walkPts.length : 0,
    // WHICH DIRECTION IS OPEN, AND HOW MANY STOPS ARE STILL AHEAD.
    //
    // This is the whole of the reported bug. Opening a direction changes none
    // of the four above, so the key matched, _renderMap returned before
    // clearLayers(), and the map could not follow the list however long you
    // looked at it. It was not «the map forgot to update» — it had been told
    // nothing had changed.
    //
    // The count is here because the list shrinks as you ride past stops. The
    // MINUTES are deliberately not: they change every minute for every stop,
    // and a key that carried them would re-fit and flicker a map that is
    // drawn once a second.
    open ? open.id + '×' + open.count : '-',
  ].join('|');
}

/**
 * The open direction, as the two facts the map depends on.
 *
 * Pure and exported so the key can be tested without a screen. The identity
 * is `frontText \0 line.id` — the SAME key groupDirections already builds for
 * its accumulator, not a second way of saying "this direction".
 */
export function openKey(dir, stops) {
  if (!dir) return null;
  const ln = dir.call && dir.call.serviceJourney && dir.call.serviceJourney.line;
  const lineId = (ln && (ln.id || ln.publicCode)) || '';
  return { id: (dir.frontText || '') + '\u0000' + lineId, count: (stops || []).length };
}

/** The line's colour and mode, from the one place that carries them. */
export function openLine(dir) {
  const ln = dir && dir.call && dir.call.serviceJourney && dir.call.serviceJourney.line;
  const raw = (dir && dir.lines && dir.lines[0] && dir.lines[0].colour)
    || (ln && ln.presentation && ln.presentation.colour) || '7c2d12';
  // The API gives hex WITHOUT a '#', and badgeHtml adds it. One rule, not two.
  return { color: '#' + String(raw).replace(/^#/, ''), mode: (ln && ln.transportMode) || null };
}

function _renderMap() {
  const wrap = _el('auto-map-wrap');
  const el = _el('auto-map');
  if (!wrap || !el) return;

  const userPos = userLL();
  // Nothing to orient by. A map showing neither you nor a stop is a grey
  // rectangle taking 140px from the departures, so it is not shown at all.
  if (!_stop && !userPos) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  if (!_aMap) {
    _aMap = createMap(el, { zoom: false });
    _aLayer = L.layerGroup().addTo(_aMap);
    // Once the reader has DRAGGED the map it is theirs. Same rule, and the
    // same single event, as the board (_bUserMoved): an auto-fit that keeps
    // yanking the frame back is the most irritating thing a small map can do.
    //
    // `zoomstart` was here too, and it was self-defeating — Leaflet fires it
    // for programmatic zooms as well, so `fitBounds` declared the reader had
    // moved the map in the act of framing it, and every later fit was
    // blocked. Measured: the stop marker sat 40px above a 140px band.
    _aMap.on('dragstart', () => { _aUserMoved = true; });
    // Only a redraw, never a refit: zoomend fires for fitBounds too, and
    // treating that as «the reader moved the map» is the trap that made
    // zoomstart self-defeating in v1.101.0.
    _aMap.on('zoomend', () => { _aKey = ''; });
  }
  // Leaflet measures the container when it is created; created while the
  // screen was hidden, that measurement is zero and the tiles never fill.
  _aMap.invalidateSize();
  // AND THE FRAME HAS TO BE RECOMPUTED WHEN THAT MEASUREMENT CHANGES.
  // Measured in the browser: the first fitBounds ran against a 0-height
  // container, so the map settled centred on the reader at max zoom with the
  // stop 550px above the band — the walking line ran off the top edge and the
  // stop marker was not on screen at all. Every number was right; only the
  // screenshot showed it.
  //
  // The size is part of the fit key, because a different container is a
  // different frame. Nothing to fit into yet means nothing to fit.
  const box = el.getBoundingClientRect();
  const sizeKey = Math.round(box.width) + 'x' + Math.round(box.height);
  if (!box.width || !box.height) return;

  // The walk, from the one cache that owns it. The board reads the same
  // points from the same module, so the two screens cannot draw different
  // routes between the same two places.
  if (userPos && _stop) ensureApproach(userPos, _stop);
  const walkPts = approachPoints();

  // WHEN A DIRECTION IS OPEN THE MAP IS ABOUT THE LINE, NOT THE NEIGHBOURHOOD.
  // The list has moved on to the stops ahead; the alternatives it was offering
  // a moment ago belong to a question the reader has already answered.
  const line = _open && _stop ? stopsAhead(_open.call, _stop.name) : null;
  const others = (!_open && _stop) ? nearbyAlternatives(_stops(), _stop) : [];
  // The zoom is part of the content, because readability is. Culled beads must
  // come back when the reader pinches in — without this the map answers for
  // the zoom it was drawn at for the rest of the screen's life.
  const key = mapKey(_stop, userPos, others, walkPts, openKey(_open, line))
    + '|z' + (_aMap.getZoom ? Math.round(_aMap.getZoom() * 2) / 2 : 0);
  // Redraw when the content changed; re-fit when the content OR the frame
  // changed. Returning early on content alone is what let the bad first fit
  // survive for the life of the screen.
  // A NEW CONTENT IS A NEW FRAME. _aUserMoved is sticky for the life of the
  // screen, so a reader who dragged the map once while orienting would never
  // have seen it frame the line — their choice was about the old picture.
  if (_aOpenKey !== (openKey(_open, line) || {}).id) {
    _aOpenKey = (openKey(_open, line) || {}).id;
    _aUserMoved = false;
    _linePicked = null;
  }
  const fitStale = !_aUserMoved && _aFitKey !== key + '|' + sizeKey;
  if (key === _aKey && !fitStale) return;
  _aKey = key;

  _aLayer.clearLayers();

  // ── FRAME FIRST, THEN DRAW ───────────────────────────────────────────
  //
  // Readability has to be judged against the frame the map ENDS UP in, not
  // the one it is leaving. Fitting after drawing measured a comfortable gap
  // at the old zoom, kept every bead, and then zoomed out — 15 stops at a 9px
  // median, a solid caterpillar. Every number was right.
  //
  // So the points are gathered without drawing anything, the frame is set,
  // and only then are the markers placed against a projection that is true.
  const pts = [];
  if (_stop && _stop.lat != null) pts.push([_stop.lat, _stop.lon]);
  (line || []).forEach(st => { if (st.lat != null) pts.push([st.lat, st.lon]); });
  others.forEach(s => { if (s.lat != null) pts.push([s.lat, s.lon]); });
  (walkPts || []).forEach(p => pts.push(p));
  if (userPos) pts.push([userPos.lat, userPos.lon]);

  if (pts.length && !_aUserMoved && _aFitKey !== key + '|' + sizeKey) {
    _aFitKey = key + '|' + sizeKey;
    // animate:false so the projection is TRUE the moment this returns. With
    // the default animation latLngToContainerPoint still answers for the view
    // being left, so the readability check below measured the old zoom and
    // kept every bead — 12px median where the threshold is 21.
    _aMap.fitBounds(pts, { padding: [26, 26], maxZoom: 17, animate: false });
  }

  if (_stop && _stop.lat != null) {
    L.marker([_stop.lat, _stop.lon], {
      icon: makeStopIcon(normMode((_stop.modes || [])[0]), (_stop.modes || []).length, { primary: true }),
    })
      .bindTooltip(_stop.name, { className: 'map-label', direction: 'top', offset: [0, -8] })
      .addTo(_aLayer);
  }

  // ── The line ahead, when one is open ──────────────────────────────────
  //
  // Reported: «når bruker har klikket seg inn på en linje, så burde kartet
  // gjenspeile listen». Every stop the list shows already carries lat/lon —
  // stopsAhead returns them — so this costs no request at all.
  //
  // Straight segments between stops: boardGQL does not ask for pointsOnLink,
  // so the real alignment is not in this answer and the line cuts every curve.
  // Named in drawStopLine rather than hidden.
  if (line && line.length) {
    const { color, mode } = openLine(_open);
    drawStopLine(_aLayer, line, {
      color, mode: normMode(mode),
      // Cull the beads when they would touch. The line still says where it
      // goes, and every stop is named in the list directly below it.
      project: (ll) => _aMap.latLngToContainerPoint(ll),
    });
    // The ends are louder than the stops you pass through, and tappable — a
    // tap points at the row rather than choosing it, because a mis-tap on a
    // band this dense should not throw you off the screen.
    const fav = new Set(stopShortcuts(line, loadFreq('arr')));
    line.forEach((st, i) => {
      if (st.lat == null) return;
      const last = i === line.length - 1;
      const picked = _linePicked === i;
      if (!last && !picked && !fav.has(i)) return;   // the rest are drawn as dots already
      L.marker([st.lat, st.lon], {
        icon: makeStopIcon(normMode(mode), 0, { primary: last || picked }),
        keyboard: false, zIndexOffset: picked ? 1000 : (last ? 500 : 250),
      })
        .bindTooltip(st.name + (st.mins != null ? ' · ' + st.mins + ' min' : ''),
          { className: 'map-label', direction: 'top', offset: [0, -8],
            permanent: picked })
        .on('click', () => _pickLineStop(i))
        .addTo(_aLayer);
    });
  }

  // Every other stop you could walk to, and TAPPABLE — the same choice the
  // rows below offer, through the same door. This is also a repair: the
  // alternatives are folded shut by default (_stopsShown), so when the app
  // has guessed the wrong stop the reader has to find a disclosure triangle
  // to discover it. On the map the mistake is visible immediately.
  others.forEach(s => {
    if (s.lat == null) return;
    L.marker([s.lat, s.lon], {
      icon: makeStopIcon(normMode((s.modes || [])[0]), (s.modes || []).length),
      keyboard: false,
    })
      .bindTooltip(s.name + ' · ' + s.distM + ' m', { className: 'map-label', direction: 'top', offset: [0, -8] })
      .on('click', () => pinStop(s.id))
      .addTo(_aLayer);
  });

  if (walkPts && walkPts.length) drawWalk(_aLayer, walkPts);
  if (userPos) userDot(_aLayer, userPos);
}

/**
 * A tap on a stop in the line POINTS AT IT — it does not choose it.
 *
 * A tap on the ROW sets the route and opens the board: you leave the screen.
 * A tap on the map marks the row and scrolls to it, exactly as the arrival
 * screen has done since v1.100.0. The two are different questions — «where is
 * this» and «I want this» — and on an 11 km line inside a 140px band the
 * stops sit some 35px apart, so a mis-tap that throws you off the screen is a
 * far more expensive mistake than one that highlights the wrong row.
 *
 * The index is the index into `stopsAhead`, which is the same `data-i` the
 * rows carry and the same index `stopShortcuts` returns — so a stop that
 * appears both under «ofte brukt» and in the full list is one stop, marked in
 * both places, with no third representation of it.
 */
let _linePicked = null;

export function _setLinePicked(i) { _linePicked = i; }
export function _getLinePicked() { return _linePicked; }

function _pickLineStop(i) {
  // Tapping the marked stop again clears it — the same toggle the mobility
  // rows use, so the reader can always get back to a quiet map.
  _linePicked = (_linePicked === i) ? null : i;
  // The key must change or the map will not redraw: this is the very guard
  // that caused the reported bug one level up.
  _aKey = '';
  _renderBody();
  _renderMap();
  const row = document.querySelector('#auto-body .auto-stop-btn[data-i="' + i + '"]');
  if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/**
 * The reader picked a stop — from the list, or from the map.
 *
 * ONE DOOR, because there are now two ways in. A tap on the band and a tap on
 * the row must do the identical thing, and the way they stop doing the
 * identical thing is by being written down twice.
 */
export function pinStop(id) {
  const found = _stops().find(s => s.id === id);
  if (!found) return false;
  _stop = found;
  // The reader chose. From here a new fix refreshes the distance but does
  // not overrule the choice — until they leave the screen.
  _stopPinned = true;
  // A NEW STOP HAS NOT BEEN ASKED ABOUT. Clearing the rows without clearing
  // these two left the previous stop's answer standing: «asked» stayed true,
  // so the screen said «ingen avganger» about a stop nothing had looked at,
  // and `_nextMs` would have offered the OLD stop's next departure as this
  // one's. Found by a mutant that survived — the «not asked» guard was
  // unreachable because nothing ever set it back.
  _open = null; _dirs = []; _asked = false; _nextMs = undefined;
  // Deliberately NOT collapsing here. Having the list shut under the
  // finger that just picked from it is a movement nobody asked for, and
  // it makes trying two stops in a row needlessly hard.
  renderAuto();
  _load();
  return true;
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
      // Keep WHERE each message hung, exactly as fetchTrip does: a stop-board
      // answer carries the stop's own situations and each departure's, and
      // which is which is the only thing that can tell them apart later.
      const m = new Map();
      (stop.situations || []).forEach(x => addSituation(m, x, { stop: _stop && _stop.id }));
      (stop.estimatedCalls || []).forEach(c => {
        const sj = c && c.serviceJourney;
        const from = { line: (sj && sj.line && sj.line.id) || null, journey: (sj && sj.id) || null };
        (c.situations || []).forEach(x => addSituation(m, x, from));
        ((sj && sj.situations) || []).forEach(x => addSituation(m, x, from));
      });
      _alerts = Array.from(m.values());
      // WHAT THE LIST DOES NOT SHOW. At a hub the answer is cut by the query's
      // own cap, and drawing it as though it were complete is the failure this
      // release exists for — «hvorfor er ikke linje 3 Mortensrud på lista?»
      _truncated = !!stop._truncated;
      _asked = true;
      // AN EMPTY ANSWER IS A QUESTION, not a conclusion. Asked once, and only
      // when there is nothing — a stop with departures never pays for this.
      // Same ladder shape as the per-line cap and v1.121.0's ceiling rung.
      if (!_dirs.length) {
        _nextMs = undefined;
        const forStop = _stop && _stop.id;
        fetchNextDeparture({ key: 'custom-out', from: _stop.name, stopId: _stop.id,
          to: '', line: null, filter: null })
          .then(ms => {
            // The reader may have moved on while we were asking.
            if (!_stop || _stop.id !== forStop) return;
            _nextMs = ms;
            _renderBody();
          });
      } else {
        _nextMs = null;
      }
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
  // A boat leaves from a kai, not a platform and not a track. Three words for
  // three things, and the wrong one reads as a mistake to anyone standing
  // there looking for the sign.
  const word = mode === 'water' ? 'kai'
    : (mode === 'metro' || mode === 'rail') ? 'spor' : 'plattform';
  return word + ' ' + code;
}

export function _minsUntil(ms, now) {
  return Math.round((ms - (now == null ? Date.now() : now)) / MIN);
}

/**
 * The times on a direction row — and, when we know how far you have to walk,
 * whether you can actually make them.
 *
 * The screen used to say «2 · 12 · 22 min» with no qualification, leaving the
 * reader to work out for themselves whether the one in two minutes was
 * reachable from 369 m away. The app had already worked it out: `walkMinsTo`
 * is computed in `_maybeAdvance` and goes to the debug log.
 *
 * So each time carries `reachCls` — the same four states the departure board
 * has always used, with the same CSS. With a five-minute walk the departure
 * in two minutes is dimmed and the one in twelve is the one to read.
 *
 * NOTHING IS REMOVED. Same principle as v1.98.0's onward list: you may choose
 * to run, and a departure that vanishes without trace is worse than one you
 * can see you just missed. `walkMins == null` (no position, no stop) means no
 * classes at all — exactly today's row.
 *
 * @param {number|null} walkMins minutes on foot to this stop, or null
 */
export function _timesHtml(d, now, walkMins) {
  const raw = (d.times && d.times.length) ? d.times : null;
  const mins = raw ? raw.map(ms => _minsUntil(ms, now)) : [d.mins];
  // A departure that went while you were looking at the screen is not a
  // choice either — the same rule groupDirections applies when it builds the
  // row, applied again now that the row is allowed to age.
  const keep = mins.map((m, i) => ({ m, ms: raw ? raw[i] : null })).filter(x => x.m >= 0);
  if (!keep.length) return '';
  const rcls = (x) => {
    if (walkMins == null || x.ms == null) return '';
    return reachCls(minsToLeave(x.ms, walkMins, now));
  };
  const label = (x) => (x.m === 0 ? 'nå' : String(x.m));

  // THE ONE YOU AIM FOR IS THE ONE THAT CARRIES THE EMPHASIS.
  //
  // Reported with a screenshot: «Noen avgangstider er gjennomstrekede, antar
  // fordi de er utenfor gangrekkevidde?» — and the word «antar» is the
  // report. The strike is right, and nothing says what it means.
  //
  // The sharper fault was underneath it. The row lit the FIRST time and dimmed
  // the rest, so at «nå · 15 · 30 min» with fourteen minutes on foot, the
  // bright number was the departure you cannot reach and the one you should
  // walk for was faded to 55%. The emphasis pointed at the wrong departure.
  //
  // The CSS beside this says «the first time is the one you act on, so a
  // missed first time has to be legible as struck-through». That was true when
  // it was written — before walk time was on this screen there was nothing to
  // miss, and the first departure WAS the one you act on. Walk time made it
  // false, and nothing moved the emphasis with it.
  //
  // So the loud one is the first you can still make. Then the strike explains
  // itself without a legend: not those, THIS one.
  const first = keep.findIndex(x => rcls(x) !== 'missed');
  const aim = first === -1 ? -1 : first;

  const html = keep.map((x, i) => {
    const r = rcls(x);
    // No walk time means no verdict, and then the old rule is the right one:
    // the first departure is the one you act on.
    const loud = aim === -1 ? i === 0 : i === aim;
    return '<span class="' + (loud ? 'auto-t-next' : 'auto-t-dim')
      + (r ? ' ' + r : '') + '">' + label(x) + '</span>';
  }).join('<span class="auto-t-sep"> · </span>');

  return html + (keep[0].m === 0 && keep.length === 1 ? '' : ' min');
}

/**
 * Do all these directions leave the stop the same way?
 *
 * The guard on advancing by yourself. At Mortensrud — a terminus — «mot
 * Stortinget» and «mot Kolsås» both run the same way out and differ only in
 * how far they go, so picking the sooner one is plainly right. At a
 * mid-line stop like Tøyen the two metro directions are OPPOSITE, and
 * "soonest" would send the reader the wrong way.
 *
 * The test is the first stop after yours, from `stopsAhead` — data already in
 * the answer, no extra request.
 *
 * A PROXY, and named as one. It promises that the choice cannot send you out
 * of this stop in the wrong direction. It does NOT promise the lines stay
 * together: two metros can share the first stop and part five stops later.
 * There the back button is the answer, and that is a far smaller error than
 * being sent the opposite way.
 */
export function sameWayOut(dirs, fromName, now) {
  const list = dirs || [];
  if (list.length < 2) return list.length === 1;
  let first = null;
  for (const d of list) {
    const ahead = stopsAhead(d.call, fromName, now);
    if (!ahead.length) return false;
    const key = ahead[0].id || String(ahead[0].name || '').toLowerCase();
    if (first === null) first = key;
    else if (key !== first) return false;
  }
  return true;
}

/**
 * The metro to open by itself: the soonest one you can actually catch.
 *
 * Chosen on `dirRank`, NOT on position in the list. With «Tog først» the
 * metro rows sit at the bottom, and a rule that read the top of the list
 * would quietly follow the sort switch instead of the mode.
 *
 * "Catch" is the whole of it. Measured on the reported screen: 637 m from the
 * stop is about eight minutes' walk, and the soonest metro was two minutes
 * away — advancing onto that one points at a train that is gone before you
 * arrive. So the soonest departure at least `walkMins` away wins, and if none
 * is, nothing opens and the list stands.
 *
 * Liveness is the list's own rule — a row whose times have all passed is one
 * the screen has already stopped showing, and it must not be chosen off a raw
 * nextMs that is still in the array.
 *
 * @param {Array} dirs groupDirections output
 * @param {string} fromName the stop you are standing at
 * @param {number} now
 * @param {number|null} walkMins minutes to reach the stop; null skips the test
 */
export function nextRail(dirs, fromName, now, walkMins) {
  const t = now == null ? Date.now() : now;
  const live = (dirs || []).filter(d => _timesHtml(d, t) !== '');
  // THE RAIL-BOUND MODE THIS STOP ACTUALLY HAS. It used to be metro, full
  // stop — so in Bergen, where the rail-bound network is Bybanen and
  // Transmodel calls it `tram`, this feature was permanently dead. Metro
  // first where a stop has both, which is the Oslo case and unchanged there.
  const railish = [_RANK_OF.metro, _RANK_OF.tram].find(r => live.some(d => dirRank(d) === r));
  if (railish == null) return null;
  const metros = live.filter(d => dirRank(d) === railish);
  if (!metros.length) return null;
  if (!sameWayOut(metros, fromName, t)) return null;
  const need = walkMins == null ? 0 : walkMins;
  const catchable = metros
    .map(d => ({ d, at: (d.times || []).find(ms => (ms - t) / MIN >= need) }))
    .filter(x => x.at != null)
    .sort((a, b) => a.at - b.at);
  return catchable.length ? catchable[0].d : null;
}


/**
 * The sort switch is only there when there is something to sort.
 *
 * Not while a direction is open (that screen is a list of stops in line
 * order, and re-ordering it would be nonsense), and not while the list is
 * empty or we have no position. A control that cannot change anything is
 * worse than no control.
 */
/**
 * Should the sort switch be on screen at all?
 *
 * Its own function because the last two releases have both watched a correct
 * rule do nothing: a pure verdict fully tested, and a renderer that quietly
 * stopped asking for it. A one-line condition inside a DOM function is exactly
 * where that hides.
 *
 * @param {boolean} on   the caller's own answer — not while a direction is
 *   open, not while the list is empty, not without a position
 * @param {{meaningful: boolean}|null} ends  from sortEndLabels
 */
export function shouldShowSort(on, ends) {
  return !!on && !!(ends && ends.meaningful);
}

let _sortWired = false;
function _showSort(on) {
  const el = _el('auto-sort');
  if (!el) return;
  const { desc } = loadAutoSort();
  const ends = on ? sortEndLabels(_dirs, localCodespace(_dirs)) : null;
  // Hidden when there is only one group on screen: see sortEndLabels.
  const show = shouldShowSort(on, ends);
  el.style.display = show ? '' : 'none';
  if (!show) return;
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

/**
 * Armed by the landing branch, and by nothing else.
 *
 * The jump belongs to opening the app, not to the screen. Tapping ⚡ in the
 * nav bar means "show me the directions" — a jump there would make the list
 * unreachable except by going back every single time.
 *
 * A module variable, like _stopsShown: true while this visit lasts, gone when
 * you come back. resetAuto clears it, so navTo('v-auto') — which resets on
 * entry — can never inherit an arming from startup.
 */
let _jumpArmed = false;
export function armAutoJump() { _jumpArmed = true; }
export function _isJumpArmed() { return _jumpArmed; }

/**
 * Go where you always go, once, and only when the history is sure.
 *
 * Consumes the arming whatever the outcome: a screen that keeps trying every
 * second would jump the moment a late departure tipped the balance, under the
 * reader's finger.
 *
 * Cancelled if the reader got there first — an opened direction or a pinned
 * stop means they are already choosing, and moving the screen under someone
 * who is using it is the worst version of this feature.
 *
 * The route is set with chosen:false. _useRouteDir normally records a use in
 * t.freqArr and t.smartHist, and counting the app's own guess as the reader's
 * choice would feed the prediction its own output until it could no longer be
 * disproved. The trip-home switch (nav.js) has always taken the same care.
 */
/**
 * One step, when going all the way is not warranted.
 *
 * The complement to _maybeJump. With a clear favourite in the history the app
 * goes to the board; without one it should still take the obvious step, which
 * on a screen of seven directions is the metro that leaves first.
 *
 * Shares the SAME arming — one flag, two steps — so this can only happen when
 * opening the app, never when the reader taps ⚡ asking for the list. And it
 * is tried only after the jump has declined, so the two can never both fire.
 *
 * Opens `_open` on the identical object from `_dirs`, so «← alle retninger»
 * and the data-i contract are untouched. No toast: this does not move the
 * reader off the screen, it unfolds one step of it, and the way back is
 * already at the top of the stop list.
 */
/**
 * Are you standing at the stop, or walking to it?
 *
 * Pure and exported, because it is the one rule that decides whether the app
 * may skip this screen — and «skip the screen that says where you are» is
 * exactly the kind of decision that should be readable in a test.
 *
 * AT_STOP_M is the approach route's own number, not a new one. It already
 * means «close enough that drawing a walk to your feet is noise»; if the walk
 * is not worth drawing, it is not worth reading either, and the shortcut is
 * free. Two numbers for that one idea would drift, and the drift would be an
 * app that draws you a walking route and then jumps past it.
 *
 * Unknown distance counts as NOT at the stop. Without a position the jump
 * cannot happen anyway, and the failure mode is «the list stays» — today's
 * screen, not something worse.
 */
export function atStop(stop) {
  return !!stop && stop.distM != null && stop.distM < AT_STOP_M;
}

function _maybeAdvance() {
  if (_open || _stopPinned || !_stop) return false;
  // Standing 600 m away, the walking route and the walking time are precisely
  // what you need, so the orientation screen stays. At the stop it has been
  // read, and this is a plain shortcut.
  if (!atStop(_stop)) return false;
  const walk = walkMinsTo(_stop);
  const hit = nextRail(_dirs, _stop.name, Date.now(), walk && walk.mins);
  if (!hit) return false;
  _open = hit;
  logMsg('auto: åpnet ' + hit.frontText
    + (walk ? ' (' + walk.mins + ' min gange)' : ''), 'ok');
  _renderBody();
  return true;
}

function _maybeJump() {
  if (_open || _stopPinned || !_stop) return false;
  if (!atStop(_stop)) return false;
  const guess = autoJumpDest();
  if (!guess) return false;
  const hit = findJumpTarget(_dirs, guess, _stop.name);
  if (!hit) return false;
  const dir = autoRoute(_stop, hit.stop);
  if (!dir) return false;
  window._autoJumped && window._autoJumped(hit.stop.name);
  window._useRouteDir(dir, null, { chosen: false });
  return true;
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
    body.innerHTML = '<div class="dest-prev-empty">'
      // Date.now() rather than the `now` fifty lines below: that one is a
      // `const` declared later in this function, so reading it here is a
      // temporal dead zone — it threw «Cannot access before initialization»,
      // the render died, and the screen fell through to «Fikk ikke avganger
      // herfra» — an error message for a stop that had answered perfectly.
      // Caught by the probe; no test could see it, because the throw is in
      // the renderer.
      + esc(boardState({ asked: _asked, dirs: _dirs, live: [], nextMs: _nextMs,
        now: Date.now(), horizonMins: NEXT_DEPARTURE_HORIZON_MINS }).label) + '</div>';
    return;
  }
  // ONE ARMING, TWO STEPS — and the arming is consumed HERE, by the caller.
  //
  // It used to be consumed inside each step, and _maybeJump cleared it before
  // returning false: the second step could then never run, because the flag
  // it checked was already gone. The unit tests of both pieces passed, and
  // the browser probe caught it — the screen simply stayed on the list.
  //
  // Consumed whatever the outcome: a screen that retried every second would
  // advance the moment a late departure tipped the balance, under the
  // reader's finger.
  if (_jumpArmed) {
    _jumpArmed = false;
    if (_maybeJump() || _maybeAdvance()) return;
  }
  // The prediction, demoted from gatekeeper to hint: with history the
  // direction you usually take at this hour is marked, and without it every
  // row behaves the same.
  const guess = predictDest();
  const usual = guess && guess.toName ? String(guess.toName).toLowerCase() : null;
  // Read once, so every row on the screen agrees about what time it is.
  const now = Date.now();
  // How far you have to walk to be standing here — the number this screen has
  // always computed and never shown. Null when we cannot know, and then the
  // rows are exactly as they were.
  const walk = walkMinsTo(_stop);
  const walkMins = walk ? walk.mins : null;
  // A direction whose departures have all gone while you watched is not a
  // choice any more. The screen counts down now (v1.71.0), so rows can age
  // past their own contents — and a row naming a direction with no time
  // beside it promises something the stop board is not saying.
  const live = dirRows(_dirs, loadAutoSort().desc, d => _timesHtml(d, now), localCodespace(_dirs));
  if (!live.length) {
    _showSort(false);
    body.innerHTML = '<div class="dest-prev-empty">'
      + esc(boardState({ asked: _asked, dirs: _dirs, live, nextMs: _nextMs,
        now, horizonMins: NEXT_DEPARTURE_HORIZON_MINS }).label) + '</div>';
    return;
  }
  _showSort(true);
  // Once for the list, not once per row: byLine walks every message.
  const perLine = byLine(_alerts);
  body.innerHTML = '<div class="set-label">hvor skal du?</div>'
    + live.map(({ d, i }) => {
      const hint = usual && d.frontText.toLowerCase() === usual;
      const q = quayLabel(d.call);
      // The destination is the part that gives way, so the whole of it has to
      // survive somewhere: aria-label for a screen reader, title for a long
      // press. A row reading "mot Jernb…" must still be able to say what it is.
      const dirMsgs = _dirAlerts(d, perLine);
      // The mark says how many; the LABEL says what. There is no hover on a
      // phone, so the text has to be somewhere a screen reader and a long
      // press can both reach — and the full message is still in the folded
      // banner, so nothing lives only here.
      const full = 'mot ' + d.frontText + (q ? ', ' + q : '')
        + (dirMsgs.length ? '. ' + dirMsgs.map(m => _sitTitle(m)).join('. ') : '');
      return '<button class="nearby-btn auto-dir' + (hint ? ' auto-usual' : '') + '"'
        + ' type="button" data-i="' + i + '"'
        + ' title="' + esc(full) + '" aria-label="' + esc(full) + '">'
        + '<span class="auto-badges">' + d.lines.map(badgeHtml).join('')
        + (dirMsgs.length ? '<span class="auto-dir-alert" aria-hidden="true">!</span>' : '')
        + '</span>'
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
        + '<span class="nearby-dist">' + _timesHtml(d, now, walkMins) + '</span>'
        + '</button>';
    }).join('')
    // SAID, NOT IMPLIED. The list is complete at a small stop and cut at a
    // hub, and it looked identical either way — so it earned trust where it
    // was right and spent it where it was not. One quiet line, only when
    // there is something to admit.
    + (_truncated
      ? '<div class="auto-more-note">flere avganger enn vi får plass til \u2014 '
        + 'vis flere stopp eller velg en linje for hele lista</div>'
      : '');
  body.querySelectorAll('.auto-dir').forEach(b => {
    b.addEventListener('click', () => { _open = _dirs[Number(b.dataset.i)]; _renderBody(); });
  });
}

// Which line's stops the register has already been asked about. The screen
// redraws every second (v1.71.0), so without this the lookup would fire on
// every tick — one request per line, not one per frame.

/**
 * How many of the reader's own stops go above the list.
 *
 * Three: enough for the trips actually taken, and the same number the "ofte
 * brukt" route row already uses. More and the shortcuts become the list they
 * are meant to spare you.
 */
export const STOP_SHORTCUTS = 3;

/**
 * The stops on THIS direction that the reader travels to most.
 *
 * Asked for after five attempts at defining an interchange: "legg de mest
 * brukte stoppene som snarveier over listen — etterhvert som brukeren bruker
 * funksjonen". Every one of those attempts reasoned about how Oslo's network
 * OUGHT to look, against data the sandbox cannot reach. This asks about the
 * reader instead, and t.freqArr has counted every destination they have
 * chosen since v1.36.0.
 *
 * Returns INDICES into `stops`, not stop objects. The shortcut then carries
 * the same data-i as the row below it, shares one click handler, and shows
 * the minutes from this very departure. Two representations of one stop is
 * the bug shape this codebase has found six times.
 *
 * Only stops that are actually on this line: a shortcut to somewhere this
 * direction does not go is a button that cannot do what it says.
 *
 * The join is stopId first, name as fallback — the rule usesOf already
 * follows, because stopId is null whenever the route came from a typed place.
 *
 * @param {Array} stops from stopsAhead
 * @param {Array} arr   loadFreq('arr')
 * @returns {number[]} indices, most used first
 */
export function stopShortcuts(stops, arr, n) {
  const list = stops || [];
  const hist = (arr || []).filter(p => p && p.name);
  if (!list.length || !hist.length) return [];
  // WAS A SECOND COPY of depUses + usesOf, keyed on lowercase-only names.
  // The index is still built here because this function is handed its history
  // rather than reading storage — but the KEY and the LOOKUP are now the
  // shared ones, so a stop saved as «Ryen T» and offered as «Ryen» is one stop
  // on this screen too. Counts add up across a merged key, as in depUses; two
  // aggregations for one key would be the same fault one level down.
  const byId = new Map(), byName = new Map();
  hist.forEach(p => {
    const c = Number(p.count) || 0;
    if (p.stopId) byId.set(p.stopId, Math.max(c, byId.get(p.stopId) || 0));
    const k = stopKey(p.name);
    if (k) byName.set(k, (byName.get(k) || 0) + c);
  });
  const uses = (s) => usesOf(s, { byId, byName });
  return list
    .map((s, i) => ({ i, n: uses(s) }))
    .filter(x => x.n > 0)
    // Most used first; the line's own order breaks a tie, so two equally used
    // stops stay in the order you would ride past them.
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, n == null ? STOP_SHORTCUTS : n)
    .map(x => x.i);
}

/**
 * The stop this direction list can take you to, if history is sure enough.
 *
 * Searches every direction's own stops for the predicted destination — id
 * first, normalised name as the fallback, the same join `usesOf` and
 * `nearStopMatch` already use, because the saved history carries a stopId
 * only when the route was set from one.
 *
 * The SOONEST direction wins when two go the same way. Nothing else would
 * make sense: the jump exists to save a tap on the departure you are about
 * to make.
 *
 * Returns null when the destination is not on any line from here — an
 * automatic jump towards a place this stop does not serve is worse than no
 * jump at all.
 *
 * @param {Array} dirs groupDirections output, in the order they depart
 * @param {{toName:string,toStopId:string|null}} guess from autoJumpDest
 * @param {string} fromName the stop you are standing at — stopsAhead needs the
 *   origin to know which calls are still ahead of you
 * @param {number} [now]
 */
export function findJumpTarget(dirs, guess, fromName, now) {
  if (!guess || !guess.toName || !Array.isArray(dirs)) return null;
  const want = stopKey(guess.toName);
  const wantId = guess.toStopId || null;
  const byTime = dirs.slice().sort((a, b) => a.nextMs - b.nextMs);
  for (const d of byTime) {
    const stops = stopsAhead(d.call, fromName, now);
    const hit = stops.find(s => (wantId && s.id && s.id === wantId)
      || stopKey(s.name) === want);
    if (hit) return { dir: d, stop: hit };
  }
  return null;
}

function _renderStops(body) {
  const stops = stopsAhead(_open.call, _stop.name);
  // `.picked` is the mark a tap on the map leaves. It is a CLASS on the row
  // rather than state in the markup, because this innerHTML is replaced once a
  // second — anything stored here would be gone before the finger lifted.
  const stopHtml = (s, i, extra) => '<button class="nearby-btn auto-stop-btn'
    + (extra || '') + (_linePicked === i ? ' picked' : '')
    + '" type="button" data-i="' + i + '">'
    + '<span class="nearby-name">' + esc(s.name) + '</span>'
    + '<span class="nearby-dist">' + (s.mins != null ? s.mins + ' min' : '') + '</span>'
    + '</button>';

  // Nothing at all until the reader has travelled — which is the whole of
  // "etterhvert som brukeren bruker funksjonen", and it falls out by itself.
  const short = stopShortcuts(stops, loadFreq('arr'));
  const shortHtml = short.length
    ? '<div class="set-label">ofte brukt</div>'
      + short.map(i => stopHtml(stops[i], i, ' auto-fav-stop')).join('')
      + '<div class="set-label">alle stopp</div>'
    : '';

  body.innerHTML = '<button class="set-via-add-btn auto-back-dir" type="button">← alle retninger</button>'
    + '<div class="set-label">' + _open.lines.map(badgeHtml).join('')
    + ' mot ' + esc(_open.frontText) + '</div>'
    + shortHtml
    // The whole line stays, in its own order. A shortcut is a way past the
    // list, not a way of shortening it — the stop above is the same row.
    + (stops.length
      ? stops.map((s, i) => stopHtml(s, i)).join('')
      : '<div class="dest-prev-empty">Vet ikke hvor denne stopper.</div>');
  body.querySelector('.auto-back-dir').addEventListener('click', () => {
    _open = null; _renderBody();
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
  // Auto-reise showed the GLOBAL banner from the last board fetch — stale,
  // and about a different stop. Now it shows its own stop's messages, scoped
  // to the lines that actually leave from here.
  // NO LINE IS YOURS UNTIL YOU HAVE PICKED ONE.
  //
  // This passed «the lines that actually leave from here» as the reader's own.
  // At Mortensrud that is three lines and the filter works. At Jernbanetorget
  // it is every line in Oslo — so every line-specific message counted as
  // yours, nothing was ever folded, and four of them pushed «du er ved», the
  // map and every departure below the fold. The rule from v1.105.0 was right;
  // this context made it empty.
  //
  // The banner now keeps what is about THE STOP — «ruteendringer i
  // høstferien», a closed entrance — and a message that names lines goes to
  // the rows for those lines instead, where the choice is made. Nothing is
  // dropped: the folded row still counts every one.
  renderAlertsInto(_el('auto-alerts'), _alerts, renderAuto, {
    stopIds: [_stop && _stop.id].filter(Boolean),
    lineIds: [],
    journeyIds: [],
  });
  renderRouteShortcuts('auto-fav-routes', 2);
  _renderWhere();
  // After _renderWhere, which is what settles _stop for this tick — the map
  // draws the stop the heading names, never the one it named last second.
  _renderMap();
  const need = _stop && !_dirs.length && _askedFor !== _stop.id;
  if (need) { _askedFor = _stop.id; _load(); } else _renderBody();
}

/** Fresh screen when the mode is entered, so it never opens on a stale stop. */
/**
 * Does auto-reise have a stop to be about?
 *
 * Exported so the landing can ask rather than reach into a module variable.
 * The whole screen hangs off this one object: with it there are directions, a
 * map and a walk; without it there is an apology and a link to a form.
 */
export function hasStop() { return !!_stop; }

export function resetAuto() {
  _askedFor = null; _stop = null; _stopPinned = false; _dirs = []; _open = null; _alerts = [];
  _truncated = false; _asked = false; _nextMs = undefined;
  _resetAutoMap();
  _stopsShown = false; _jumpArmed = false; }
