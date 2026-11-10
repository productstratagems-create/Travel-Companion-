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
import { linjemerke } from '../ui/linjemerke.js';
import { lappMedLogo } from '../ui/tilbyderlogo.js';
import { esc, clk, clkDay } from '../ui/fmt.js';
import { stopKey } from '../stopId.js';
import config from '../config.js';
import { state } from '../state.js';
import { fetchNextDeparture, fetchBoard, fetchArrBoard, fetchTripFra } from '../api/entur.js';
import { raskereHer } from '../raskere.js';
import { rangerMål, foldetSide } from '../maalModell.js';
import { overganger, arrBoardSpørsmål, ARR_BOARD_ASK } from '../overganger.js';
import { domFraKlasse, _DOM_KLASSE } from '../ui/reiselop.js';
import { NEXT_DEPARTURE_HORIZON_MINS } from '../api/queries.js';
import { predictDest, autoJumpDest, destRanking, vanestyrke, ferskhet, vaneMerke, vaneSetning, loadSmartHist }
  from '../api/smart.js';
import { sistReist } from '../api/eventLog.js';
import { erInnstilt } from '../innstilt.js';
import { plattformTekst } from '../bytte.js';
import { ombord, reiseMeta, iFart, gangGjelder, I_FART_NOTIS, stoppPåLinja, stoppFram, vedOgNeste, rangerKandidater } from '../api/ombord.js';
import { oppdaterLås } from '../api/ombordLaas.js';
import { journeyShapeCached, fetchJourneyShape } from '../api/entur.js';
import { joinJourney } from '../journey.js';
import { logEvent, recentEvents } from '../api/eventLog.js';
import { loadConsent } from '../api/consent.js';
import { renderRouteShortcuts } from '../ui/favs.js';
import { approach } from '../trail.js';
import { renderAlertsInto, situationTitle, situationBody, sevClass, sevRank,
  SEVERITY_RANK } from '../ui/alerts.js';
import { byLine } from '../api/situations.js';
import { collectStopSituations } from '../api/situations.js';
import { logMsg } from '../ui/log.js';
import { fetchStoppLinjer, stoppLinjer, stoppInfo, nærViktigFørst } from '../api/stops.js';
import { depUses, usesOf, loadFreq, glemSted } from '../api/usage.js';
import { normMode } from '../api/stopCats.js';
import { loadAutoSort, saveAutoSort, NEAR_STOP_MAX_M, walkMinsTo, gangTil, userLL, minsToLeave, reachCls, posState, posNå, fartNå, loadWalkBuffer } from '../geo.js';
import L from 'leaflet';
import { createMap, drawWalk, userDot, drawStopLine, ryddMerkelapper, bindMapExpand, fitExpandedMap } from '../ui/map.js';
import { storage } from '../storage.js';
import { lagreLås, hentLås } from '../api/ombordLagring.js';
import { nesteReise, tilstand } from '../nesteReise.js';
import { nesteSvarFor, lærNesteSvar } from '../api/nesteSvar.js';
import { kandidatAv } from '../api/kandidat.js';
import { taOpp, lagreTuropptak } from '../api/turopptak.js';
import { kontekst, lærSvar, svarFor } from '../api/linjeSvar.js';
import { makeStopIcon } from '../ui/mapIcons.js';
import { ensureApproach, approachPoints, AT_STOP_M } from '../api/approach.js';
import { centreward, CENTRE_LABEL } from '../api/centre.js';

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
        // Transportmiddel og tilbyderens tekstfarge (v1.218.13): uten dem fikk
        // merket verken Enturs ikon eller Ruters hvite tall — sett i proben.
        lines: code ? [{ code, colour, id: (ln && ln.id) || null,
          mode: (ln && ln.transportMode) || null,
          tekst: (ln && ln.presentation && ln.presentation.textColour) || null }] : [],
        nextMs: ms,
        // EVERY DEPARTURE THIS WAY, as the CALLS and not just their times.
        //
        // It kept `all: [ms]` — timestamps — and threw every call away but
        // the soonest. So there was no way to ask what the SECOND departure
        // passes on its way, and the arrival under the row was therefore
        // always the first one's. On a screen that had already struck that
        // departure out as unreachable, that is a clock time for a journey
        // the reader cannot take.
        //
        // Collected here because this is the only place the raw calls are
        // still in scope — the caller keeps the grouped rows and drops the
        // array. `call` and `times` are derived from this below, so there is
        // one record of which departures the row has.
        calls: [{ ms, call: c, innstilt: erInnstilt(c) }],
      });
      return;
    }
    // No badge is added here any more: the key IS the line, so every call
    // reaching an existing row belongs to the line already on it. `lines`
    // stays an array rather than a single field so badgeHtml and the row
    // template keep one shape to render — it is simply always length 1.
    prev.calls.push({ ms, call: c, innstilt: erInnstilt(c) });
  });
  return [...byText.values()]
    // No clamp. Every call here left the filter above with nextMs >= t0, so
    // the rounding cannot go negative — and a Math.max(0, …) that can never
    // fire, sitting where one used to hide departed vehicles behind "nå", is
    // worse than none: it tells the next reader that negatives get here.
    .map(d => {
      const calls = d.calls.slice().sort((a, b) => a.ms - b.ms);
      /* NESTE ER DEN SOM GÅR.
       *
       * `nextMs` var den tidligste avgangen, innstilt eller ei. Den bestemmer
       * radens «2 min», rekkefølgen på skjermen og hvilket kall `call`
       * peker på — tre ting som alle ville pekt på et tog som ikke kommer.
       *
       * Er ALT innstilt, blir raden stående likevel, med `alleInnstilt`. En
       * retning der ingenting går er en opplysning; et hull der raden sto er
       * stillhet, og stillhet leses som at alt er i orden. */
      const går = calls.filter(x => !x.innstilt);
      const første = går[0] || calls[0];
      return {
        ...d,
        calls,
        call: første.call,
        nextMs: første.ms,
        alleInnstilt: går.length === 0,
        mins: Math.round((første.ms - t0) / MIN),
        times: calls.slice(0, 3).map(x => x.ms),
        // Hvilke av tidene over som er innstilt, slått opp på VERDI. Et
        // parallelt array av sannhetsverdier ville vært to lister som måtte
        // holdes i takt — og en sortering av den ene uten den andre ville
        // strøket feil avgang.
        innstiltMs: new Set(calls.filter(x => x.innstilt).map(x => x.ms)),
      };
    })
    // Sortert ETTER at neste er valgt, så rekkefølgen følger avgangene som går.
    .sort((a, b) => a.nextMs - b.nextMs);
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

/* `foretrukket()` STO HER, OG ER FJERNET MED VILJE.
 *
 * Den fant den veien leserens sortering prioriterte, så kortet kunne navngi
 * den ved siden av overskriften. Rapportert på skjermen med «Andre busser
 * først» valgt: «Nå blandes bussavgang inn i kortet med t-bane.»
 *
 * Antakelsen var at «raskest i tittelen, alternativet navngitt» ville lese
 * som ett svar med en fotnote. Det gjorde det ikke — det leste som to
 * avganger i samme kort.
 *
 * Valget er at bryteren gjelder LISTA, og bare den. `kortHtml` tar derfor
 * ikke lenger sorteringen inn i det hele tatt: en parameter som står ubrukt
 * er en dør noen åpner igjen uten å vite at den var prøvd.
 */


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
      // BOTH DERIVED FROM ONE TIMESTAMP. `at` is what the screen shows and
      // `mins` is what the map ranks by; two independently computed copies
      // of the same arrival is exactly how they would drift apart.
      at: ms,
      mins: ms ? Math.max(0, Math.round((ms - t0) / MIN)) : null,
    });
  });
  return out;
}

/**
 * When you are there — said as a clock, once, for every screen that says it.
 *
 * Reported as a question: «Hva betyr tidsangivelsen på det innrykkede
 * stoppet?» The row above it counted down to the DEPARTURE («12 min») and the
 * stop under it counted down to the ARRIVAL («26 min»). Two different events
 * in the same shape, one above the other, with nothing saying which was which
 * — and the reader is left to guess whether 26 is a later train, a journey
 * time, or a clock.
 *
 * A clock time fixes it by being a different kind of thing to look at: the
 * countdown says when to move, the clock says when you are there. The word
 * carries the rest, and there is only one word — anything longer would buy
 * the clarity back in clutter, on a row that is a detail of the row above it.
 *
 * One function, three callers (the indented stop, the drill-down list, the
 * map tooltip), because the same sentence written down three times is the
 * fault this codebase keeps finding.
 */
export function arriveText(st) {
  return (st && st.at != null) ? 'framme ' + clk(st.at) : '';
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
// A message's heading is `situationTitle` from ui/alerts.js. There used to be
// a private copy here doing the same language pick — one fact, two places,
// free to drift.

/**
 * A disruption, on the row it concerns.
 *
 * Inside `.auto-badges` on purpose. This row is a flex with space-between, and
 * settings.css warns in plain words — twice, because it has happened — that a
 * third child pushes the destination adrift. The badges span is already a
 * container of small things about the line, and a disruption about that line
 * belongs with them.
 *
 * THE MARK SAYS HOW MANY, AND OPENS TO SAY WHAT.
 *
 * It used to be a bare `!` with the text on the row's `title` attribute —
 * invisible on a phone, which is point 2 of the rettesnor word for word. The
 * answer was computed and then put somewhere nobody looks. And it said `!`
 * while the comment here said it said how many: one fact, two places.
 *
 * Now the banner no longer repeats these at all, so this IS where the message
 * is. A button, with the text folded out under the row.
 */
export function dirAlertHtml(msgs, openKeys, key, idx) {
  if (!msgs || !msgs.length) return { mark: '', block: '' };
  const open = !!openKeys && openKeys.has(key);
  // Warn rather than err is the rule for the mark — but a closure is not a
  // warning, and the colour is the only thing that says so before the tap.
  const severe = msgs.some(m => sevRank(m && m.severity) <= SEVERITY_RANK.severe);
  const label = msgs.length === 1
    ? 'Vis meldingen om denne linjen'
    : 'Vis ' + msgs.length + ' meldinger om denne linjen';
  /* ET SPAN MED role=button, IKKE EN <button>. Merket står inni raden, og
   * raden er selv en <button>. En knapp inni en knapp brytes ut av
   * HTML-parseren når lista tegnes fra tekst: raden ble et tomt merke, og
   * navn, spor og tider havnet utenfor den (sett i nettleserprøven for
   * v1.218.1). Tastaturet når det fortsatt (tabindex, Enter og mellomrom). */
  const mark = '<span role="button" tabindex="0" class="auto-dir-alert' + (severe ? ' sev-severe' : '') + '"'
    + ' data-i="' + esc(String(idx)) + '"'
    + ' aria-expanded="' + (open ? 'true' : 'false') + '"'
    + ' aria-label="' + esc(label) + '">'
    + (msgs.length > 1 ? msgs.length : '!') + '</span>';
  // A SIBLING of the row, not a child: .auto-dir is itself a button, and
  // ui/alerts.js explains beside its own ✕ why a button inside a button is
  // invalid markup and one unpredictable tap target. Same classes as the
  // banner's alerts, so a message looks like a message wherever it is.
  const block = open
    ? '<div class="auto-dir-msg">' + msgs.map(m => '<div class="service-alert' + sevClass(m && m.severity) + '">'
        + '<span class="sa-title">' + esc(situationTitle(m)) + '</span>'
        + (situationBody(m) ? '<span class="sa-body">' + esc(situationBody(m)) + '</span>' : '')
        + '</div>').join('') + '</div>'
    : '';
  return { mark, block };
}

/**
 * Which rows have their messages open.
 *
 * Keyed by SITUATION ID, not by row index: «T-bane først / Lokalbuss først»
 * re-sorts the list and every index moves. And not in the markup either —
 * this body is rewritten once a second, so a class would be gone before the
 * finger lifted (the same reason the folded stop list keeps its state here).
 */
let _openMsgs = new Set();
export function _setOpenMsgs(ids) { _openMsgs = new Set(ids || []); }

/**
 * The rows this screen draws right now.
 *
 * ONE definition, because two callers need the same answer in the same tick:
 * _renderBody draws them, and renderAuto has to know which messages they
 * carry before it draws the banner. A direction whose departures have all
 * gone is filtered out here — and a message whose only row was filtered out
 * has nowhere else to be said, which is exactly what the banner is for.
 */
function _liveRows(now) {
  return dirRows(_dirs, loadAutoSort().desc, d => _timesHtml(d, now), localCodespace(_dirs));
}

/**
 * The messages each live row carries, and the ids that therefore need no
 * line in the banner.
 *
 * Derived from `live`, never from `_dirs`: at a hub the departure list is
 * capped (`_truncated`) and rows age out, so `_dirs` would claim delivery to
 * rows that are not on screen — and the message would be folded away as
 * «already shown» while nothing showed it.
 */
export function rowMessages(live, perLine) {
  const byRow = new Map();
  const keys = new Map();
  const ids = new Set();
  (live || []).forEach(({ d, i }) => {
    const msgs = _dirAlerts(d, perLine);
    byRow.set(i, msgs);
    keys.set(i, rowKey(d));
    msgs.forEach(m => { if (m && m.id) ids.add(m.id); });
  });
  return { byRow, keys, ids };
}

/**
 * A row's identity, for remembering which one is open.
 *
 * NOT the row index: «T-bane først / Lokalbuss først» re-sorts the list and
 * every index moves under the reader's finger.
 *
 * NOT the situation id either, which was the first attempt and the probe
 * caught it: the same closure hangs on every L2 row, so opening «mot Ski»
 * unfolded «mot Stabekk» and «mot Lysaker» too — the same three sentences
 * three times down the screen. The mark belongs to the row that was tapped.
 *
 * Its own tiny function rather than openKey's, which also carries a stop
 * count and means «is the drill-down still showing the same line».
 */
export function rowKey(dir) {
  const ln = (dir && dir.lines && dir.lines[0] && dir.lines[0].id) || '';
  return (dir && dir.frontText ? dir.frontText : '') + '\u0000' + ln;
}

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
  return linjemerke({ kode: l.code, farge: l.colour, tekst: l.tekst, linjeId: l.id, modus: l.mode });
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
/* Det første kortet under «Dit du ofte skal», for kartet. Satt av
 * `_renderBody`, lest av `_renderMap` — som tegnes FØR lista i hvert tikk,
 * så kartet viser forrige tikks kort: høyst ett sekund bak. */
let _kortRute = null;
/* DE RÅ KALLENE fra siste tavlesvar, også de som har gått.
 *
 * `groupDirections` kaster avganger som har forlatt stoppet — riktig for
 * lista, feil for spørsmålet «sitter du på en av dem»: bussen du er på har
 * nettopp forlatt stoppet du passerte. Og de NULLSTILLES IKKE når «du er
 * ved» bytter stopp. Om bord bytter den ved hvert stopp; en kandidatliste
 * som fulgte `_dirs` ville tømt seg hver gang og latt tilbudet blinke av og
 * på. Hvert kall bærer hele turens stopp, så forventet posisjon kan regnes
 * fra dem til neste tavlesvar erstatter dem. */
let _rå = [];
/** Turer du har sagt nei til denne økten. Et × skal ikke komme tilbake. */
const _avvistOmbord = new Set();
/** Hva som sist ble logget, så loggen får én linje per tilbud og ikke én per sekund. */
let _ombordLogget = null;
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
/**
 * Which band a stop falls in — the one definition, read by both the ranking
 * and the margin that decides whether the heading may change.
 *
 * It was inline in `rankStops`, and `pickStop`'s margin was therefore written
 * in METRES while the ranking was not about metres. The browser probe caught
 * it: walking north, the ranking put the stop ahead of you first and the
 * margin kept the heading on the one behind you, because the one behind was
 * still the nearer of the two. The margin was guarding against the wrong
 * thing. One name, both callers.
 */
export function stopBand(s, uses, trail) {
  if (!s) return 2;
  // BAND 0 IS UNTOUCHED. You are standing there; the app does not argue with
  // you about where you are, whatever direction the series reads.
  if (s.distM != null && s.distM <= CLOSE_M) return 0;
  if (usesOf(s, uses) > 0) return 1;
  // A stop you are walking towards is worth as much as one you have used
  // before — it is the best evidence available about where you are going.
  return stopWay(s, trail) === 'mot' ? 1 : 2;
}

/**
 * What the series says about one stop, or 'vet-ikke'.
 *
 * 'vet-ikke' whenever the series cannot say — a fresh tab, a phone on a table,
 * two fixes a moment apart, a stop the geocoder gave without coordinates. That
 * is the commonest state of all, and in it the ranking is exactly what it was.
 */
export function stopWay(s, trail) {
  return (trail && trail.length && s && s.lat != null)
    ? approach(trail, { lat: s.lat, lon: s.lon }).kind : 'vet-ikke';
}

/* LIK AVSTAND (v1.218.10): to stopp der avstanden skiller mindre enn dette,
 * står likt på avstand — da avgjør viktigheten. Skrittene er faste (0–59,
 * 60–119 …) så rekkefølgen er transitiv; prisen er at 59 og 61 m havner i
 * hvert sitt skritt. 60 m er under ett minutts gange. */
export const LIK_AVSTAND_M = 60;  // Brukes ikke fra v1.218.11 — erstattet av VIKTIG_GANG_M (api/stops.js). Står igjen, foldet.

export function rankStops(list, uses, trail, viktigAv) {
  // WHICH WAY YOU ARE WALKING, which this function had no notion of at all: a
  // stop you are walking away from and one you are walking towards were both
  // just a number of metres to it.
  const way = (s) => stopWay(s, trail);
  const band = (s) => stopBand(s, uses, trail);
  const d = (s) => (s.distM == null ? Infinity : s.distM);
  // Approaching beats standing beats walking away, inside a band.
  const dir = (s) => ({ mot: 0, 'vet-ikke': 1, staar: 1, fra: 2 }[way(s)]);
  return (list || []).slice().sort((a, b) =>
    (band(a) - band(b))
    // DIRECTION BEFORE HISTORY, and never above band 0: at the platform the
    // question is settled and the metres answer it.
    //
    // Walking away from a stop is live evidence about this trip; history is a
    // prior about trips in general. So your daily stop, being walked away
    // from, yields to one you are walking towards — which is the whole of
    // «hvilken linje vedkommende er interessert i». With no series every stop
    // reads 'vet-ikke', this comparison is always zero, and the order below is
    // exactly what it was before.
    || (band(a) === 0 ? 0 : dir(a) - dir(b))
    // Then count, and distance breaks the tie — so two equally used stops
    // still order predictably rather than by whatever the geocoder returned.
    || (band(a) === 1 ? usesOf(b, uses) - usesOf(a, uses) : 0)
    // VIKTIGHET SOM TIEBREAK, aldri i band 0: der står du.
    // NÆR OG VIKTIG (v1.218.11), aldri i band 0: der står du. Innen gangavstand
    // avgjør viktigheten, ellers avstanden. Gangruten går til det som vinner.
    || (band(a) === 0 ? d(a) - d(b) : nærViktigFørst(viktigAv)(a, b)));
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
  // The trail is read here, once, for the same reason the ranking is: the
  // heading and the alternatives must not disagree about the order.
  return rankStops(list, depUses(), state.posTrail, s => stoppInfo(s.id));
}

/** The band function the heading's margin asks with — the ranking's own. */
function _bandOf() {
  const uses = depUses();
  return (s) => stopBand(s, uses, state.posTrail);
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
/** Seconds as something to read: «40 s», «3 min». */
function _etaOrd(sec) {
  return sec < 90 ? Math.round(sec / 10) * 10 + ' s' : Math.round(sec / 60) + ' min';
}

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
  //
  // I FART er gangtid et svar på et spørsmål ingen stilte. Under «ser ut som
  // du er på 31» sto «127 m å gå · 4 min gange · du går mot den · ca 10 s»:
  // fire minutter og ti sekunder om samme stopp. Avstanden er fortsatt sann
  // og står; gangen gjør det ikke.
  const fart = !!(extra && extra.iFart);
  if (extra && extra.walkDist != null) bits.push(extra.walkDist + (fart ? ' m' : ' m å gå'));
  else if (stop && stop.distM != null) bits.push(stop.distM + ' m');
  if (!fart && extra && extra.walkMins != null) bits.push(extra.walkMins + ' min gange');
  // WHY THIS STOP AND NOT ANOTHER.
  //
  // From v1.141.0 the ranking can prefer a stop you are walking TOWARDS over
  // one that is nearer — so the name over the screen can change for a reason
  // the metres do not explain. A name that moves without saying why is the
  // unrest the rettesnor names; and the value is computed either way, which
  // is the other half of the same rule.
  //
  // Only «mot»: «du går fra den» about the stop being named would be an odd
  // thing to say, and 'vet-ikke' is silence by design — the commonest state
  // of all, and today's screen exactly.
  // Its own row, not a fourth fact joined by a middot — the SAME lesson the
  // position note carries twenty lines below, learned the same way: at 414 px
  // «365 m å gå · 7 min gange · du går mot den · ca 60 s» broke across two
  // lines, splitting «ca / 60 s». A middot joins peers, and this is not a
  // peer of the metres: they describe the walk, this says why THIS stop is
  // the one being named.
  // Samme `approach()`, men verbet følger farten: du GÅR ikke mot et stopp
  // fra en buss, du nærmer deg det.
  const verb = fart ? 'du nærmer deg den' : 'du går mot den';
  const wayNote = (extra && extra.way === 'mot')
    ? '<span class="auto-way-note">' + esc(extra.wayEtaS != null && extra.wayEtaS < 600
      ? verb + ' · ca ' + _etaOrd(extra.wayEtaS)
      : verb) + '</span>'
    : '';
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
  const facts = factsLine + wayNote + note;
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
export function pickStop(list, current, pinned, bandOf) {
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
  const top = l[0];
  if (top.id === current.id) return { stop: top, changed: false };
  // A MARGIN, SO THE HEADING DOES NOT FLUTTER.
  //
  // Direction entered the ranking in v1.141.0, and with it two stops you are
  // walking BETWEEN can take turns winning: every time you pass the midpoint
  // the closing rate changes sign and the name over the screen swaps. Nothing
  // on this screen is allowed to flicker.
  //
  // So a challenger has to be clearly better than the incumbent, and only
  // while the incumbent is still on offer at all — once it drops out of the
  // list it is not a close race any more, it is gone. `pinned` still outranks
  // everything, above; this is only about the choice the app makes itself.
  const held = l.find(x => x.id === current.id);
  // A BETTER BAND IS A REASON, and the margin does not apply to it: the
  // challenger is not merely a few metres nearer, it is a different kind of
  // candidate — the one you are walking towards rather than the one behind
  // you. The margin exists for the case where metres are the only difference.
  const better = bandOf ? bandOf(top) < bandOf(held || current) : false;
  if (!better && held && held.distM != null && top.distM != null
    && held.distM - top.distM < PICK_MARGIN_M) {
    return { stop: held, changed: false };
  }
  return { stop: top, changed: true };
}

/**
 * How much better a challenger must be before the heading changes, in metres.
 *
 * Wide enough to cover ordinary GPS wobble between two stops on the same
 * street, narrow enough that walking decisively towards one still wins. Not
 * measured against real traces — the sandbox has none — so this is the number
 * most likely to need moving once someone walks with it.
 */
export const PICK_MARGIN_M = 40;

/**
 * What to say about the position under the stop name, or nothing.
 *
 * Silent while the fix is good: a line reading «posisjonen er fin» under a
 * stop name is the noise this app keeps removing. It speaks for exactly the
 * states a reader could act on — old, and the one that used to be invisible.
 */
function _posState() {
  return posState(posNå());
}


/**
 * Sitter du på en av avgangene fra tavla? Dommen er `api/ombord.js`; her
 * samles kandidatene og forventet posisjon ved hvert fikstidspunkt.
 *
 * Linjeformen når den alt er hentet (`journeyShapeCached`), ellers mellom
 * stoppene. Ingen ny forespørsel: et tilbud er ikke verdt en.
 */
export function ombordKandidater(kall, spor, avvist) {
  const sett = new Map();
  (kall || []).forEach(c => {
    const sj = c && c.serviceJourney;
    if (!sj || !sj.id || sett.has(sj.id)) return;
    if (erInnstilt(c) || (avvist && avvist.has(sj.id))) return;
    // Én definisjon (api/kandidat.js), delt med avspillingen av turopptak.
    const k = kandidatAv(c, spor, journeyShapeCached(sj.id));
    if (k) sett.set(sj.id, k);
  });
  return [...sett.values()];
}

/**
 * Tilbudet, som HTML. Tomt for `vet-ikke` — da er skjermen nøyaktig som før.
 *
 * Et TILBUD: én knapp, «følg reisen», og en ×. Ved tvil én knapp per
 * kandidat, og ingen er valgt for deg.
 */
export function ombordKortHtml(dom, nå) {
  if (!dom || (dom.kind !== 'ombord' && dom.kind !== 'ombord-tvil')) return '';
  const linje = k => {
    const meta = reiseMeta(k.call, nå);
    const neste = meta && meta.calls[1] ? meta.calls[1].name : null;
    return '<button class="ombord-valg" type="button" data-jid="' + esc(k.nøkkel) + '"'
      + ' aria-label="Følg reisen med ' + esc(k.linje) + ' mot ' + esc(k.front)
      + (neste ? ', neste stopp ' + esc(neste) : '') + '">'
      + badgeHtml({ code: k.linje, colour: k.farge })
      + '<span class="ombord-front">mot ' + esc(k.front) + '</span>'
      + (neste ? '<span class="ombord-neste">neste: ' + esc(neste) + '</span>' : '')
      + '</button>';
  };
  const tittel = dom.kind === 'ombord' ? 'ser ut som du er på' : 'du er på en av disse';
  return '<div class="ombord-kort" role="group" aria-label="' + tittel + '">'
    + '<div class="ombord-topp"><span class="set-label">' + tittel + '</span>'
    + '<button class="ombord-x" type="button" aria-label="Nei, ikke på noen av disse">×</button></div>'
    + dom.kandidater.map(linje).join('')
    + '<div class="ombord-hint">trykk for å følge reisen</div>'
    + '</div>';
}

/**
 * Dommen «sitter du på noe?», ett sted. Tilbudet og «du er ved» leser
 * begge denne, så de ikke kan svare hver sin linje.
 */
function _ombordDom(nå) {
  const spor = state.posTrail || [];
  return ombord({ spor, fartMS: fartNå(nå), kandidater: ombordKandidater(_rå, spor, _avvistOmbord) });
}

/**
 * I fart, på en linje: neste stopp på den linja går foran det nærmeste.
 * Ren, så regelen kan prøves uten DOM. `pinned` (du trykket selv) vinner.
 *
 * @returns {{stop:object|null, changed:boolean, linjer:string[]|null}}
 */
export function velgStoppIFart(picked, current, pinned, påLinja, list) {
  if (pinned || !påLinja) return { ...picked, linjer: null };
  // Avstanden fra lista når stoppet står der; ellers ukjent, ikke gjettet.
  const fra = (list || []).find(s => s.id === påLinja.stop.id);
  const stop = fra ? { ...fra } : { ...påLinja.stop, distM: null };
  return { stop, changed: !current || current.id !== stop.id, linjer: påLinja.linjer };
}

/* LÅSEN PÅ TUREN DU SITTER PÅ (`api/ombordLaas.js`). Modulstate, som de
 * andre her: skjermen tegnes hvert sekund, og en lås i DOM-en ville blitt
 * skrevet over før den kunne leses. */
let _lås = null;
export function _nullstillLås() { _lås = null; }

/**
 * Neste stopp på linja: fra låsen når den holder, ellers fra dommen.
 * Låsen oppdateres her, én gang per tegning, og hendelsene går til
 * reiseloggen så tersklene kan måles.
 */
/* Kandidatene sist tegning, til «feil linje?», og grunnen til et gjett. */
let _sisteKand = [];
/* Den sammenfoldede retningsgruppen husker at du åpnet den. */
let _sideFoldÅpen = false;
if (typeof document !== 'undefined') {
  document.addEventListener('toggle', e => {
    if (e.target && e.target.classList && e.target.classList.contains('auto-side-fold')) _sideFoldÅpen = e.target.open;
  }, true);
}
let _gjettGrunn = '';
let _sisteRang = null;
// Turopptaket skrives samlet; det som står i minnet lagres når fanen skjules.
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) lagreTuropptak(); });
let _feilÅpen = false;

/** Hvor mange ganger hver linje er reist med den siste uka (reiseloggen). */
function _linjeBruk(nå) {
  const m = new Map();
  recentEvents(nå).filter(e => e.kind === 'reise' && e.linje)
    .forEach(e => String(e.linje).split(',').forEach(l => m.set(l, (m.get(l) || 0) + 1)));
  return m;
}

/* LINJESVAR (v1.218.19): konteksten et svar læres i — holdeplassen kandidaten
 * kom fra, ellers stoppet du er ved. Én definisjon for lagring og oppslag. */
function _svarKx(k, nå) {
  const id = (k && k.call && k.call.quay && k.call.quay.stopPlace && k.call.quay.stopPlace.id) || (_stop && _stop.id);
  return kontekst(id, nå);
}
function _svarNavn(k) {
  return (k && k.call && k.call.quay && k.call.quay.stopPlace && k.call.quay.stopPlace.name) || (_stop && _stop.name) || null;
}

/** «Stemmer»: hypotesen er bekreftet. Holdes som et valg, og læres. */
export function _bekreftLinje() {
  if (!_lås) return false;
  lærSvar(_svarKx(_lås.k, Date.now()), { ja: [_lås.k.linje], navn: _svarNavn(_lås.k) });
  logEvent('ombord', { svarte: 'bekreftet', linje: _lås.k.linje, handling: 'bekreftet' }, null);
  _lås = { k: _lås.k, kilde: 'valgt', stilleFra: null };
  _feilÅpen = false;
  return true;
}

/** Du valgte selv: den turen, holdt som et valg. */
export function _velgLinje(nøkkel) {
  const k = _sisteKand.find(x => x.nøkkel === nøkkel);
  if (!k) return false;
  logEvent('ombord', { svarte: 'rettet', linje: (_lås ? _lås.k.linje + '→' : '') + k.linje, handling: 'valgt' }, null);
  lærSvar(_svarKx(k, Date.now()), { ja: [k.linje], nei: _lås && _lås.k.linje !== k.linje ? [_lås.k.linje] : [], navn: _svarNavn(k) });
  _lås = { k, kilde: 'valgt', stilleFra: null };
  _feilÅpen = false;
  return true;
}

/** «ingen av disse»: ingen lås, og alle kandidatene avvist. */
export function _ingenLinje() {
  _sisteKand.forEach(k => _avvistOmbord.add(k.nøkkel));
  if (_lås) logEvent('ombord', { svarte: 'rettet', linje: _lås.k.linje + '→ingen', handling: 'avvist' }, null);
  if (_lås) lærSvar(_svarKx(_lås.k, Date.now()), { nei: [_lås.k.linje], navn: _svarNavn(_lås.k) });
  _lås = null;
  _feilÅpen = false;
}

/**
 * «feil linje?» og, åpnet, de andre kandidatene. Med et gjett står «gjettet»
 * og hvorfor. Ingenting uten lås.
 */
export function rettLinjeHtml(lås, kandidater, åpen, grunn) {
  if (!lås) return '';
  const andre = (kandidater || []).filter(k => k.nøkkel !== lås.k.nøkkel);
  const topp = '<div class="rett-linje">'
    + (lås.kilde === 'gjettet' ? '<span class="rett-gjettet">gjettet' + (grunn ? ' · ' + esc(grunn) : '') + '</span>' : '')
    // Bekreft eller avkreft (v1.218.19). Besvart: en stille kvittering.
    + (lås.kilde === 'valgt' ? '<span class="rett-bekreftet">bekreftet av deg</span>'
      : '<button type="button" class="rett-ja">stemmer</button>')
    + '<button type="button" class="rett-feil" aria-expanded="' + (åpen ? 'true' : 'false') + '">feil linje?</button></div>';
  if (!åpen) return topp;
  const knapp = k => {
    return '<button type="button" class="rett-valg" data-jid="' + esc(k.nøkkel) + '">'
      + linjemerke({ kode: k.linje, farge: k.farge, linjeId: k.linjeId, modus: k.modus })
      + '<span class="rett-front">mot ' + esc(k.front || '') + '</span></button>';
  };
  return topp + '<div class="rett-liste">' + andre.map(knapp).join('')
    + '<button type="button" class="rett-ingen">ingen av disse</button></div>';
}

let _låsHentet = false;
let _låsLagret = '';
function _påLinjaMedLås(nå) {
  // OMLASTING (v1.218.25): låsen fra før omlastingen, hvis turen fortsatt går.
  if (!_lås && !_låsHentet) {
    _låsHentet = true;
    const h = hentLås(nå);
    if (h) {
      const k = ombordKandidater([h.call], state.posTrail || [], null)[0];
      if (k) _lås = { k, kilde: h.kilde, stilleFra: null };
    }
  }
  const dom = _ombordDom(nå);
  const fri = stoppPåLinja(dom, nå, state.posTrailLang);
  // Avvist med × slipper låsen også: du har sagt at du ikke er på den.
  if (_lås && _avvistOmbord.has(_lås.k.nøkkel)) _lås = null;
  // Den låste turens forventede posisjon, regnet mot sporet nå, fra turens
  // EGNE kall, ikke fra tavla for stoppet som vises.
  const låstK = _lås ? (ombordKandidater([_lås.k.call], state.posTrail || [], null)[0] || null) : null;
  _sisteKand = dom.kandidater || [];
  // ET VALG OGSÅ VED TVIL: den øverste i rangeringen, merket gjettet.
  _sisteRang = null;
  let vinner = dom.kind === 'ombord' ? dom.kandidater[0] : (fri && fri.k) || null;
  let vinnerKilde = dom.kind === 'ombord' ? 'sikker' : 'gjettet';
  if (!vinner && dom.kind === 'ombord-tvil') {
    const rang = rangerKandidater(dom.kandidater, { spor: state.posTrail || [], lang: state.posTrailLang, nå,
      linjeBruk: _linjeBruk(nå), ofte: new Set(loadFreq('arr').map(p => stopKey(p.name)).filter(Boolean)), stopKey,
      svar: svarFor(_svarKx(dom.kandidater[0], nå)) });
    if (rang[0]) { vinner = rang[0].k; _gjettGrunn = rang[0].grunn; }
    _sisteRang = rang;
  }
  // TRASÉEN for låsen og for kandidatene i tvil (v1.218.21): uten den måles
  // «utenfor ruta» mot rette streker, og på T-bane 3 ga det bytte til buss.
  // Hentet én gang per tur; ved neste vurdering ligger den i hurtiglageret.
  [_lås && _lås.k, ...(dom.kind === 'ombord-tvil' ? dom.kandidater.slice(0, 5) : [])]
    .filter(k => k && k.nøkkel && journeyShapeCached(k.nøkkel) === undefined)
    .forEach(k => { fetchJourneyShape(k.nøkkel).catch(() => {}); });
  const r = oppdaterLås(_lås, { låstK, vinner, vinnerKilde, fartMS: fartNå(nå), spor: state.posTrail || [],
    lang: state.posTrailLang, nå });
  if (r.hendelse) {
    const k = (r.lås && r.lås.k) || (_lås && _lås.k);
    logEvent('ombord', { svarte: r.hendelse, linje: k ? k.linje : '', handling: r.lås ? 'låst' : 'sluppet' }, null);
  }
  _lås = r.lås;
  // Lagret når den endres — tur eller kilde — ikke hvert sekund.
  const låsNøkkel = _lås ? _lås.k.nøkkel + '|' + _lås.kilde : '';
  if (låsNøkkel !== _låsLagret) { _låsLagret = låsNøkkel; lagreLås(_lås, nå); }
  // TUROPPTAK (v1.218.20): bare med samtykke, og bare når appen ser deg om bord
  // eller har en lås. Se api/turopptak.js.
  // OGSÅ I FART UTEN NOEN TUR (v1.218.24): turen på linje 3 der appen aldri
  // kjente igjen T-banen, ga ikke noe opptak — det var nettopp den som trengtes.
  if (_lås || r.hendelse || dom.kind === 'ombord' || dom.kind === 'ombord-tvil' || iFart(fartNå(nå))) {
    const siste = (state.posTrail || [])[(state.posTrail || []).length - 1];
    taOpp({ nå, fiks: siste, fart: fartNå(nå), dom: dom.kind, domGrunn: dom.grunn, kandidater: dom.kandidater, rang: _sisteRang,
      vinner, vinnerKilde, lås: _lås, hendelse: r.hendelse, form: n => journeyShapeCached(n) });
  }
  return medVedOgNeste(_lås ? { linjer: [_lås.k.linje], k: _lås.k } : fri, nå,
    (state.posTrail || [])[(state.posTrail || []).length - 1]);
}

/**
 * «DU ER VED» + «NESTE STASJON» (v1.218.26): på én kjent tur leses begge fra
 * `vedOgNeste`, og stoppet tavla viser ER neste stasjon — samme kilde, så
 * raden og tavla ikke kan si hver sin ting. Uten én tur: uendret.
 */
export function medVedOgNeste(påLinja, nå, fiks) {
  if (!påLinja || !påLinja.k) return påLinja || null;
  const vn = vedOgNeste(påLinja.k, nå, fiks);
  if (!vn.neste) return null;
  return { ...påLinja, stop: vn.neste, ved: vn.ved, forrige: vn.forrige };
}

/** Radene over stopphodet om bord. Tom uten én kjent tur. */
export function vedNesteHtml(påLinja, nå) {
  if (!påLinja || !påLinja.k || !påLinja.stop) return '';
  const her = påLinja.ved
    ? 'du er ved <b>' + esc(påLinja.ved.name) + '</b>'
    : påLinja.forrige
      ? 'mellom <b>' + esc(påLinja.forrige.name) + '</b> og <b>' + esc(påLinja.stop.name) + '</b>'
      : 'på vei til <b>' + esc(påLinja.stop.name) + '</b>';
  const min = Number.isFinite(påLinja.stop.at) ? Math.max(0, Math.round((påLinja.stop.at - nå) / 60000)) : null;
  return '<div class="ved-neste">'
    + '<div class="ved-rad">' + her + '</div>'
    + '<div class="ved-rad"><span class="ved-merke">neste stasjon</span> <b>' + esc(påLinja.stop.name) + '</b>'
    + (min == null ? '' : ' · ' + (min === 0 ? 'nå' : 'om ' + min + ' min')) + '</div>'
    + '</div>';
}

function _renderOmbord() {
  const el = _el('auto-ombord');
  if (!el) return;
  const nå = Date.now();
  const dom = _ombordDom(nå);
  const html = ombordKortHtml(dom, nå);
  el.style.display = html ? '' : 'none';
  el.innerHTML = html;
  if (!html) return;
  // Én linje i loggen per tilbud, ikke én per sekund.
  const nøkkel = dom.kandidater.map(k => k.nøkkel).join('|');
  if (nøkkel !== _ombordLogget) {
    _ombordLogget = nøkkel;
    logEvent('ombord', { svarte: dom.kind, linje: dom.kandidater.map(k => k.linje).join(','), handling: 'vist' }, null);
  }
  el.querySelectorAll('.ombord-valg').forEach(b => b.addEventListener('click', () => {
    const k = dom.kandidater.find(x => x.nøkkel === b.dataset.jid);
    const meta = k && reiseMeta(k.call, Date.now());
    if (!meta || meta.calls.length < 2) return;
    logEvent('ombord', { svarte: dom.kind, linje: k.linje, handling: 'tatt' }, null);
    // Mot vanemålet ditt når denne turen går dit, ellers til endestasjonen.
    // Samme navneoppskrift som resten av appen.
    const mål = predictDest();
    const idx = mål && mål.toName
      ? meta.calls.findIndex((c, i) => i > 0 && stopKey(c.name) === stopKey(mål.toName)) : -1;
    joinJourney(meta, idx > 0 ? idx : meta.calls.length - 1);
  }));
  const x = el.querySelector('.ombord-x');
  if (x) x.addEventListener('click', () => {
    dom.kandidater.forEach(k => _avvistOmbord.add(k.nøkkel));
    logEvent('ombord', { svarte: dom.kind, linje: dom.kandidater.map(k => k.linje).join(','), handling: 'avvist' }, null);
    _renderOmbord();
  });
}

/**
 * Overskriften over stoppet. «Du er ved» er usant fra en buss i 40 km/t.
 * På en kjent linje er det neste stopp på den; ellers bare nærmeste.
 */
export function whereLabel(fart, linjer) {
  if (fart && linjer && linjer.length) return 'neste stopp på ' + linjer.join(' / ');
  return fart ? 'nærmeste stopp' : 'du er ved';
}

/* OVERGANGENE PÅ NESTE STOPP (src/overganger.js). Hentet én gang per stopp
 * og tur, ikke per sekund, og bare mens låsen holder. */
let _ov = { key: null, board: null };
let _ovÅpen = false;
if (typeof document !== 'undefined') {
  document.addEventListener('toggle', e => {
    if (e.target && e.target.classList && e.target.classList.contains('ov-fold')) _ovÅpen = e.target.open;
  }, true);
}

function _overgangerData(påLinja, nå) {
  const st = påLinja && påLinja.stop;
  if (!_lås || !st || !st.id || !Number.isFinite(st.at)) { _ov = { key: null, board: null }; return null; }
  const key = st.id + '|' + _lås.k.nøkkel;
  if (_ov.key !== key) {
    _ov = { key, board: null };
    _ovÅpen = false;
    fetchArrBoard(st.id, ARR_BOARD_ASK, arrBoardSpørsmål(st.at))
      .then(res => { if (_ov.key === key) _ov.board = res.departures || []; })
      .catch(() => { if (_ov.key === key) _ov.board = []; });
  }
  if (!_ov.board) return null;
  return overganger(_ov.board, st.at, {
    linje: _lås.k.linje, journeyId: _lås.k.nøkkel,
    ofte: loadFreq('arr').map(p => p.name), ekstraMin: loadWalkBuffer(),
  });
}

/**
 * Overgangene som én sammenfoldet linje: «3 overganger på Tveita». Åpnet
 * viser den linjemerke, skilt, avgang og dommen (samme ord som bytteraden).
 * Tom når det ikke er noen, for stillhet her betyr at det ikke er noe å
 * gjøre annerledes.
 */
export function overgangerHtml(ov, stoppNavn, åpen) {
  if (!ov || !ov.rader.length) return '';
  const rad = ({ c, rcls, relevant }) => {
    const ln = c.ln || {};
    const dom = domFraKlasse(rcls);
    return '<div class="ov-rad' + (relevant ? ' ov-relevant' : '') + '">'
      + linjemerke({ kode: ln.publicCode, farge: ln.presentation && ln.presentation.colour, tekst: ln.presentation && ln.presentation.textColour, linjeId: ln.id, modus: ln.transportMode })
      + '<span class="ov-dest">' + esc(c.dest || '') + '</span>'
      + '<span class="ov-tid">' + clk(c.depTs) + '</span>'
      + '<span class="ov-dom ' + (_DOM_KLASSE[dom] || '') + '">' + esc(dom) + '</span></div>';
  };
  const n = ov.totalt;
  return '<details class="ov-fold"' + (åpen ? ' open' : '') + '><summary>'
    + n + (n === 1 ? ' overgang' : ' overganger') + ' på ' + esc(stoppNavn) + '</summary>'
    + ov.rader.map(rad).join('')
    + (n > ov.rader.length ? '<div class="ov-mer">+ ' + (n - ov.rader.length) + ' til innen 30 min</div>' : '')
    + '</details>';
}

/* «RASKERE HVIS DU GÅR AV HER» (src/raskere.js). Hentet én gang per neste
 * stopp, tur og mål, og bare mens låsen holder og et mål er kjent (det
 * første kortet under «Dit du ofte skal»). */
let _rask = { key: null, svar: null };

/** Når den låste turen selv er ved målet, eller null. */
function _bliSittendeMs(k, målId, nå) {
  const sj = k && k.call && k.call.serviceJourney;
  const c = ((sj && sj.estimatedCalls) || []).find(x => {
    const sp = x.quay && x.quay.stopPlace;
    const t = new Date(x.expectedArrivalTime || x.aimedArrivalTime || x.expectedDepartureTime || 0).getTime();
    return sp && sp.id === målId && t > nå;
  });
  return c ? new Date(c.expectedArrivalTime || c.aimedArrivalTime || c.expectedDepartureTime).getTime() : null;
}

function _raskereData(nå) {
  const mål = _kortRute && _kortRute.id;
  const neste = _lås && stoppFram(_lås.k, nå, 0);
  if (!mål || !neste || !neste.id || neste.id === mål || !Number.isFinite(neste.at)) { _rask = { key: null, svar: null }; return null; }
  const key = neste.id + '|' + _lås.k.nøkkel + '|' + mål;
  if (_rask.key !== key) {
    _rask = { key, svar: null };
    const etter = stoppFram(_lås.k, nå, 1);
    const bliMs = _bliSittendeMs(_lås.k, mål, nå);
    const herfra = fetchTripFra(neste.id, mål, neste.at);
    // Bare søk fra stoppet etter når turen ikke selv går til målet.
    const senere = (bliMs == null && etter && etter.id && etter.id !== mål)
      ? fetchTripFra(etter.id, mål, etter.at) : Promise.resolve(null);
    Promise.all([herfra, senere]).then(([h, sn]) => {
      if (_rask.key !== key) return;
      _rask.svar = { navn: neste.name, mål: _kortRute ? _kortRute.navn : '',
        r: raskereHer({ herfra: h, herfraAnk: neste.at, senere: sn, senereAnk: etter && etter.at, bliMs }) };
    }).catch(() => { if (_rask.key === key) _rask.svar = { r: null }; });
  }
  return _rask.svar;
}

/**
 * Én linje, og bare når det er raskere: «raskere å gå av på Tveita: 69 08:24 →
 * Lutvann skole 08:32 · 5 min tidligere». Ellers ingenting.
 */
export function raskereHtml(svar) {
  if (!svar || !svar.r) return '';
  const legs = (svar.r.tp.legs || []).filter(l => l.mode !== 'foot');
  const første = legs[0] || {};
  const ln = (første.line && første.line.publicCode) || (første.serviceJourney && første.serviceJourney.line && første.serviceJourney.line.publicCode) || '?';
  const går = clk(første.expectedStartTime || første.aimedStartTime);
  /* GANGEN FØRST (v1.218.17): samme feil som Tavla hadde. Starter svaret med
   * gange til et annet stopp, gikk linja ikke der du går av — si det. */
  const f = (svar.r.tp.legs || [])[0];
  const til = f && f.mode === 'foot' && første.fromPlace && første.fromPlace.name;
  const gåMin = til && f.expectedStartTime && f.expectedEndTime
    ? Math.round((new Date(f.expectedEndTime) - new Date(f.expectedStartTime)) / 60000) : null;
  const gå = til && til !== svar.navn ? ' (gå ' + (gåMin != null ? gåMin + ' min ' : '') + 'til ' + esc(til) + ')' : '';
  return '<div class="rask-rad">raskere å gå av på ' + esc(svar.navn) + ': '
    + '<b>' + esc(ln) + '</b> ' + går + gå + (legs.length > 1 ? ' (' + (legs.length - 1) + ' bytte)' : '')
    + ' → ' + esc(svar.mål) + ' ' + clk(svar.r.framMs) + ' · <b>' + svar.r.sparerMin + ' min tidligere</b></div>';
}

/* LINJER OG VIKTIGHET hentes her, én gang per holdeplass, for HELE lista —
 * ikke bare der kartet tegnes: rangeringen (rankStops) trenger dem også når
 * kartet er skjult. Kommer svaret, tegnes både «du er ved» og kartet på nytt. */
function _hentStoppInfo(list) {
  const mangler = (list || []).filter(s => s && s.id && stoppLinjer(s.id) === undefined).map(s => s.id);
  if (!mangler.length || _linjerVenter || _linjerFeilet) return;
  _linjerVenter = true;
  fetchStoppLinjer(mangler).then(m => {
    _linjerVenter = false;
    if (m) { _renderWhere(); _aKey = ''; _renderMap(); }
    else { _linjerFeilet = true; logMsg('linjer per holdeplass: ikke svar — viser alle, rangert som før', 'warn'); }
  });
}

/* NESTE REISE (v1.218.22, src/nesteReise.js): hva appen tror er din neste
 * reise, med fuzzy tid og retning, og «stemmer» / «nei». Skjult om bord: da
 * er reisen i gang, og spørsmålet er et annet. */
let _nesteBesvart = null;   // nøkkelen til hypotesen du har svart på denne økta
/**
 * Avgangen som tar deg dit du pleier (v1.218.27): den første du REKKER med
 * gangtiden, som stopper ved målet. Samme `catchable` og `stopsAhead` som
 * lista og «alle stopp» bruker, så kortet ikke kan foreslå et tog lista har
 * strøket.
 */
export function vanligAvgang(dirs, h, fromName, walkMins, now) {
  if (!h || !h.toName || !Array.isArray(dirs)) return null;
  const want = stopKey(h.toName);
  let best = null;
  dirs.forEach(d => {
    const ride = catchable(d, walkMins, now).find(r => stopsAhead(r.call, fromName, now)
      .some(st => stopKey(st.name) === want));
    if (ride && (!best || ride.ms < best.ride.ms)) {
      const stop = stopsAhead(ride.call, fromName, now).find(st => stopKey(st.name) === want);
      best = { dir: d, ride, stop };
    }
  });
  return best;
}

export function nesteReiseHtml(h, besvart, o = {}) {
  const { nå = Date.now(), hit = null, walkMins = null } = o;
  if (!h || tilstand(h, nå) !== 'nær') return '';
  const spør = !(h.sagt > 0) && !besvart;
  let linje;
  if (hit) {
    const c = hit.ride.call;
    const ln = (c.serviceJourney && c.serviceJourney.line) || {};
    const spor = c.quay && c.quay.publicCode;
    const gåMs = hit.ride.ms - (walkMins || 0) * 60_000;
    const gåMin = Math.round((gåMs - nå) / 60_000);
    const gå = walkMins ? (gåMin <= 0 ? '<b class="neste-gaa-naa">gå nå</b>' : 'gå om ' + gåMin + ' min') : null;
    linje = 'til <b>' + esc(h.toName) + '</b> · '
      + linjemerke({ kode: ln.publicCode, farge: ln.presentation && ln.presentation.colour,
        tekst: ln.presentation && ln.presentation.textColour, linjeId: ln.id, modus: ln.transportMode })
      + ' kl ' + clk(hit.ride.ms) + (spor ? ' fra spor ' + esc(spor) : '')
      + (gå ? ' · ' + gå : '') + (hit.stop && hit.stop.at != null ? ' · framme ' + clk(hit.stop.at) : '');
  } else {
    // Si hva du ikke vet: vanen er nær, men ingen avgang herfra går dit.
    linje = 'til <b>' + esc(h.toName) + '</b> · ' + esc(h.tekst) + ' · ingen avgang herfra går dit';
  }
  return '<div class="neste-reise">'
    + '<div class="set-label">din vanlige reise</div>'
    + '<div class="neste-tekst">' + linje + '</div>'
    + (spør
      ? '<div class="neste-svar"><span class="neste-grunn">' + esc(h.antall + (h.antall === 1 ? ' reise' : ' reiser') + ' da')
        + '</span><button type="button" class="neste-ja">stemmer</button><button type="button" class="neste-nei">nei</button></div>'
      : '')
    + '</div>';
}

let _nesteAvvist = null;
function _renderNeste(nå) {
  const el = _el('auto-neste');
  if (!el) return;
  if (_lås || (_ombordDom(nå).kind || '').startsWith('ombord')) { el.style.display = 'none'; return; }
  const h = nesteReise({ nå, her: userLL(), rangering: at => destRanking(at), svar: nesteSvarFor });
  const nøkkel = h ? h.toName + '|' + h.bucket + '|' + h.helg : null;
  // Samme gangtid som lista bruker til «rekker du den?».
  const w = _stop ? gangTil(_stop) : null;
  const hit = h && _stop && tilstand(h, nå) === 'nær' ? vanligAvgang(_dirs, h, _stop.name, w ? w.mins : null, nå) : null;
  const html = nøkkel && nøkkel === _nesteAvvist ? ''
    : nesteReiseHtml(h, nøkkel && nøkkel === _nesteBesvart, { nå, hit, walkMins: w ? w.mins : null });
  el.style.display = html ? '' : 'none';
  if (el.innerHTML === html) return;
  el.innerHTML = html;
  const svar = tegn => () => { lærNesteSvar(h, tegn); _nesteBesvart = nøkkel; if (tegn < 0) _nesteAvvist = nøkkel; _renderNeste(Date.now()); };
  const ja = el.querySelector('.neste-ja'), nei = el.querySelector('.neste-nei');
  if (ja) ja.addEventListener('click', svar(+1));
  if (nei) nei.addEventListener('click', svar(-1));
  // Trykk på kortet: retningen åpnes, med stoppene og ankomsten.
  const t = el.querySelector('.neste-tekst');
  if (t && hit) t.addEventListener('click', () => { _open = hit.dir; _renderBody(); });
}

function _renderWhere() {
  const el = _el('auto-where');
  if (!el) return;
  _renderNeste(Date.now());
  const list = _stops();
  _hentStoppInfo(list);
  const nåW = Date.now();
  const påLinja = _påLinjaMedLås(nåW);
  const picked = velgStoppIFart(pickStop(list, _stop, _stopPinned, _bandOf()), _stop, _stopPinned,
    påLinja, list);
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
  // Samme terskel som tilbudet over, fra samme filter.
  // Låst på en tur er du i fart også når bussen står ved holdeplassen.
  const fart = iFart(fartNå(Date.now())) || !!_lås;
  const _way = (_stop && _stop.lat != null)
    ? approach(state.posTrail, { lat: _stop.lat, lon: _stop.lon })
    : { kind: 'vet-ikke', etaS: null };
  // posAgeMins already returns null while the fix is fresh (POS_STALE_MS), so
  // the threshold is not repeated here. One definition of "stale".
  // «Du er ved» er usant fra en buss i 40 km/t. «Nærmeste stopp» er sant.
  // Med «du er ved / neste stasjon» over er «neste stopp på 3» samme setning to ganger.
  const vn = picked.linjer ? vedNesteHtml(påLinja, nåW) : '';
  el.innerHTML = (vn || '<div class="set-label">' + esc(whereLabel(fart, picked.linjer)) + '</div>')
    + stopHeadHtml(_stop, others.length, open, {
      iFart: fart,
      walkDist: w ? w.dist : null,
      walkMins: w ? w.mins : null,
      pos: _posState(),
      // The same approach() the ranking used, asked about the stop it chose —
      // so the sentence and the choice cannot say different things.
      way: _way.kind,
      wayEtaS: _way.etaS,
    })
    + rettLinjeHtml(_lås, _sisteKand, _feilÅpen, _gjettGrunn)
    + (_lås ? raskereHtml(_raskereData(nåW)) : '')
    + (_lås ? overgangerHtml(_overgangerData(påLinja, nåW), (påLinja && påLinja.stop && påLinja.stop.name) || '', _ovÅpen) : '')
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
  const ja = el.querySelector('.rett-ja');
  if (ja) ja.addEventListener('click', () => { if (_bekreftLinje()) _renderWhere(); });
  const feil = el.querySelector('.rett-feil');
  if (feil) feil.addEventListener('click', () => { _feilÅpen = !_feilÅpen; _renderWhere(); });
  el.querySelectorAll('.rett-valg').forEach(b => b.addEventListener('click', () => { if (_velgLinje(b.dataset.jid)) _renderWhere(); }));
  const ingen = el.querySelector('.rett-ingen');
  if (ingen) ingen.addEventListener('click', () => { _ingenLinje(); _renderWhere(); });
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
    /* ~100 M, IKKE ~11. Rapportert: kartet zoomet inn, viste gangtid i et
     * sekund og «snappet tilbake». Hver GPS-fiks flyttet posisjonen litt,
     * nøkkelen endret seg, og kartet ble tegnet helt på nytt hvert sekund. */
    userPos ? userPos.lat.toFixed(3) + ',' + userPos.lon.toFixed(3) : '-',
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
/**
 * Stoppene fra der du står til kortets mål — og ikke lenger.
 *
 * Kortet under «Dit du ofte skal» sier «Jernbanetorget · 3 mot Kolsås».
 * Linja går til Kolsås; reisen din slutter på Jernbanetorget, og det er
 * reisen kartet skal vise. Målet finnes på id når den er kjent, ellers på
 * `stopKey` — samme matching som kortet bruker. `null` når målet ikke er
 * blant stoppene framover.
 */
export function kortRuteStopp(call, fraNavn, mål) {
  if (!call || !mål) return null;
  const s = stopsAhead(call, fraNavn);
  if (!Array.isArray(s) || !s.length) return null;
  const i = s.findIndex(st => (mål.id && st.id && st.id === mål.id)
    || (mål.name && stopKey(st.name) === stopKey(mål.name)));
  return i < 0 ? null : s.slice(0, i + 1);
}

export function openLine(dir) {
  const ln = dir && dir.call && dir.call.serviceJourney && dir.call.serviceJourney.line;
  const raw = (dir && dir.lines && dir.lines[0] && dir.lines[0].colour)
    || (ln && ln.presentation && ln.presentation.colour) || '7c2d12';
  // The API gives hex WITHOUT a '#', and badgeHtml adds it. One rule, not two.
  return { color: '#' + String(raw).replace(/^#/, ''), mode: (ln && ln.transportMode) || null };
}

/**
 * Stoppene som får merkelapp på kartet: der du er, og de RELEVANT_ANDRE
 * nærmeste alternativene, med et nytt transportmiddel først. Rapportert: ti
 * prikker uten navn, og gangavstanden bare i et verktøytips. De andre står
 * fortsatt som prikker: foldet, ikke fjernet.
 */
export const RELEVANT_ANDRE = 2;
export function relevanteStopp(stopp, andre, n, forrige, viktigAv) {
  const maks = Number.isFinite(n) ? n : RELEVANT_ANDRE;
  /* STABILT: de som ble valgt sist, beholdes så lenge de fortsatt er i
   * nærheten. Uten dette byttet valget mellom Olasrudveien, Kantarellen og
   * P. A. Holms vei hvert sekund mens GPS-en flyttet seg noen meter. */
  const behold = (andre || []).filter(s => s && s.lat != null && (forrige || []).includes(s.id)).slice(0, maks);
  if (behold.length === maks) return behold;
  const modus = s => normMode(((s && s.modes) || [])[0] || '');
  const sett = new Set(stopp ? [modus(stopp)] : []);
  // Viktighet som tiebreak (v1.218.10): samme avstandsskritt → viktigst får lappen.
  const etter = (andre || []).filter(s => s && s.lat != null).slice().sort(nærViktigFørst(viktigAv));
  const valgt = behold.slice();
  behold.forEach(s => sett.add(modus(s)));
  etter.forEach(s => { if (valgt.length < maks && !valgt.includes(s) && !sett.has(modus(s))) { valgt.push(s); sett.add(modus(s)); } });
  etter.forEach(s => { if (valgt.length < maks && !valgt.includes(s)) valgt.push(s); });
  return valgt;
}

/**
 * UNIKE HOLDEPLASSER (v1.218.6). Bestilt: «Kartet trenger kun å vise
 * holdeplasser som tilbyr unike ruter, ingen grunn til å vise holdeplasser for
 * ruter og linjer som betjenes av en holdeplass nærmere brukers posisjon.»
 *
 * Fra nærmest til fjernest, stoppet du er ved først: en holdeplass vises bare
 * når den har en linje ingen NÆRMERE har. Ukjente linjer (`undefined`) skjules
 * aldri — vi vet ikke at den er overflødig. Linje-id sier ikke retning.
 */
export function unikeStopp(stopp, andre, linjerAv) {
  const sett = new Set(((stopp && linjerAv(stopp.id)) || []));
  const vis = [], skjult = [];
  (andre || []).slice().sort((a, b) => (a.distM ?? Infinity) - (b.distM ?? Infinity)).forEach(s => {
    const l = linjerAv(s.id);
    if (!Array.isArray(l)) { vis.push(s); return; }
    if (l.some(x => !sett.has(x))) vis.push(s); else skjult.push(s);
    l.forEach(x => sett.add(x));
  });
  return { vis, skjult };
}

/** Midt mellom punktene: midten av rammen rundt dem, ikke gjennomsnittet —
 *  tre holdeplasser samlet på én side skal ikke dra deg ut av kartet. */
export function midtpunkt(pts) {
  if (!pts || !pts.length) return null;
  const la = pts.map(p => p[0]), lo = pts.map(p => p[1]);
  return [(Math.min(...la) + Math.max(...la)) / 2, (Math.min(...lo) + Math.max(...lo)) / 2];
}

/**
 * (Brukes ikke lenger for rammen fra v1.218.9 — kartet sentreres midt mellom
 * punktene. Står igjen, foldet.)
 * Punktene speilet om deg: med dem i utsnittet legger `fitBounds` deg i
 * midten og viser likevel alle punktene. Bestilt: «Sentrert på brukers
 * posisjon.»
 */
export function speiletOm(her, pts) {
  if (!her) return pts || [];
  return (pts || []).flatMap(p => [p, [2 * her.lat - p[0], 2 * her.lon - p[1]]]).concat([[her.lat, her.lon]]);
}

/** Merkelappen: navn og gangtid, eller meter når gangtiden er ukjent. */
export function gangLapp(s) {
  const w = walkMinsTo(s);
  return s.name + (w ? ' · ' + w.mins + ' min' : (s.distM != null ? ' · ' + s.distM + ' m' : ''));
}

/* SKJULT KART huskes i `t.autoKart` (v1.218.4). Følger profilen (ALL_KEYS). */
const KART_KEY = 't.autoKart';
export function kartSkjult() { try { return storage.get(KART_KEY) === 'skjult'; } catch { return false; } }
export function settKartSkjult(på) { try { storage.set(KART_KEY, på ? 'skjult' : ''); } catch { /* */ } }
/* FORMEN (v1.218.5): knappen sykler kvadrat → bred → fullskjerm. Kvadrat/bred
   huskes i `t.autoKartForm`; fullskjerm huskes ikke — den er et øyeblikk. */
const KART_FORMER = ['kvadrat', 'bred', 'full'];
const FORM_KEY = 't.autoKartForm';
export function kartForm() { try { return storage.get(FORM_KEY) === 'bred' ? 'bred' : 'kvadrat'; } catch { return 'kvadrat'; } }
export function settKartForm(f) { if (f === 'full') return; try { storage.set(FORM_KEY, f === 'bred' ? 'bred' : 'kvadrat'); } catch { /* */ } }
/** Det brukeren har valgt med knappen, eller `null` — da velger geometrien. */
export function kartFormValgt() { try { const v = storage.get(FORM_KEY); return v === 'bred' || v === 'kvadrat' ? v : null; } catch { return null; } }

/* UTGANGSFORM FRA GEOMETRIEN (v1.218.7). Bestilt: «Bestem utgangsformat for
 * kart (rektangel eller kvadrat basert på holdeplass-geometrien.»
 *
 * Spørsmålet er ikke «er holdeplassene brede», men «koster bred noe». Kvadratet
 * gir alltid minst like stor målestokk, men Leaflet zoomer i HELE trinn — så
 * får bred samme trinn som kvadratet, viser den det samme og sparer 167 px
 * høyde til lista. Da velges bred. Koster bred et trinn, velges kvadrat.
 *
 * Første forsøk sammenlignet bredde mot høyde med terskel 16:9: på seksten
 * ekte steder rundt Oslo ble det aldri bredt (høyest Bygdøynes, 1,42). Et
 * utsnitt speilet om deg er sjelden så flatt.
 *
 * `størrelser`: { kvadrat:[b,h], bred:[b,h] } i px. Utsnittet er speilet om deg,
 * så utstrekningen er 2× lengste avstand hver vei, i meter.
 * Hysterese: inn i bred bare med `MARGIN` trinn å gå på — ellers blafrer det
 * når GPS-en flytter deg over en grense. */
/* UTGANGSZOOM (v1.218.8): «Dette er detaljgraden og zoom-nivået kartet her bør
 * ha som utgangspunkt» — skjermbilde fra Mortensrud, gjenskapt i proben: z=14.
 * Gatenavn og E6 for sammenheng. Rammen zoomer aldri nærmere; lenger ut bare
 * når stoppene ellers ikke får plass. Var 17: tett ved holdeplassene ble det
 * få gater og ingen sammenheng (Lysaker 16, Bislett og Nydalen 15). */
export const START_ZOOM = 15;  // v1.218.9: nytt skjermbilde, 2,03× det forrige → ett trinn inn.
export const FIT_PAD = 26, FIT_MAKS_ZOOM = START_ZOOM, MARGIN = 0.15;
const M_PER_GRAD = 111320;
export function zoomFor(her, pts, [b, h]) {
  const kx = Math.cos(her.lat * Math.PI / 180);
  let dx = 0, dy = 0;
  pts.forEach(([la, lo]) => { dx = Math.max(dx, Math.abs(lo - her.lon) * kx * M_PER_GRAD); dy = Math.max(dy, Math.abs(la - her.lat) * M_PER_GRAD); });
  // Meter per piksel på zoom z: 156543·cos(lat)/2^z (Web Mercator, 256 px fliser).
  const z = (px, m) => m > 0 ? Math.log2(156543.03 * kx * px / m) : Infinity;
  return Math.min(FIT_MAKS_ZOOM, z(b - 2 * FIT_PAD, 2 * dx), z(h - 2 * FIT_PAD, 2 * dy));
}
export function formFraGeometri(her, pts, nå, størrelser) {
  if (!her || !pts || !pts.length || !størrelser) return nå;
  const zK = zoomFor(her, pts, størrelser.kvadrat), zB = zoomFor(her, pts, størrelser.bred);
  if (!Number.isFinite(zK) || !Number.isFinite(zB)) return nå;
  const trinnK = Math.floor(zK), trinnB = Math.floor(zB);
  if (trinnB < trinnK) return 'kvadrat';
  if (nå === 'bred') return 'bred';
  return (zB - trinnB >= MARGIN || zB >= FIT_MAKS_ZOOM) ? 'bred' : 'kvadrat';
}

let _relevanteSist = [];
let _linjerVenter = false;
let _aForm = null;
let _linjerFeilet = false;
let _visLike = false;
let _tegning = 0;

function _renderMap() {
  const wrap = _el('auto-map-wrap');
  const el = _el('auto-map');
  if (!wrap || !el) return;
  // Skjult: én linje «vis kart», og ingen kart å tegne.
  const vis = _el('auto-map-vis');
  const skjul = _el('auto-map-skjul');
  if (vis && !vis._bundet) {
    vis._bundet = true;
    vis.addEventListener('click', () => { settKartSkjult(false); _aKey = ''; _aFitKey = ''; _renderMap(); });
  }
  if (skjul && !skjul._bundet) {
    skjul._bundet = true;
    skjul.addEventListener('click', () => { settKartSkjult(true); _renderMap(); });
  }
  if (kartSkjult()) {
    wrap.style.display = 'none';
    if (vis) vis.hidden = false;
    return;
  }
  if (vis) vis.hidden = true;

  const userPos = userLL();
  // Nothing to orient by. A map showing neither you nor a stop is a grey
  // rectangle taking 140px from the departures, so it is not shown at all.
  if (!_stop && !userPos) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  if (!_aMap) {
    // `zoom: false` sto her. Kommentaren rett under sier at kartet er DITT
    // når du har dratt det — da skal knappene også si at du kan. Issue #397.
    _aMap = createMap(el);
    // Fullskjerm som de andre kartene: plassen mellom statuslinja og
    // bunnmenyen. Utsnittet tegnes på nytt, så du står i midten av den nye
    // størrelsen.
    _aForm = bindMapExpand(_aMap, el, _el('auto-map-expand'), { syklus: KART_FORMER, start: kartForm(), onToggle: (open, form) => {
      fitExpandedMap(el, open); settKartForm(form); _aKey = ''; _aFitKey = '';
      setTimeout(() => _renderMap(), 340);
    } });
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
  //
  // IKKE I FART. Ganglinja fra deg til stoppet er et råd om å gå, og fra en
  // buss er det feil råd. Samme regel som radene (`gangGjelder`, v1.202.0);
  // `null` tømmer en linje som alt var hentet før du gikk på.
  if (userPos && _stop) {
    ensureApproach(gangGjelder(fartNå(), state.walkFromLL !== null) ? userPos : null, _stop);
  }
  const walkPts = approachPoints();

  // WHEN A DIRECTION IS OPEN THE MAP IS ABOUT THE LINE, NOT THE NEIGHBOURHOOD.
  // The list has moved on to the stops ahead; the alternatives it was offering
  // a moment ago belong to a question the reader has already answered.
  const line = _open && _stop ? stopsAhead(_open.call, _stop.name) : null;
  /* «DIT DU OFTE SKAL» ER KARTETS TEMA når det finnes et kort og ingen
   * retning er åpen. En åpen retning er det du nettopp trykket på, og den
   * vinner. Rapportert: kortet sa «Jernbanetorget», kartet viste sju stopp
   * i nabolaget og ingen rute. */
  const kortLinje = (!_open && _stop && _kortRute)
    ? kortRuteStopp(_kortRute.call, _stop.name, { name: _kortRute.navn, id: _kortRute.id })
    : null;
  // LITE ANNET: med en kortrute tegnes ikke de andre stoppene. De ligger
  // fortsatt bak «7 ▾» under «du er ved».
  const alle = (!_open && _stop && !kortLinje) ? nearbyAlternatives(_stops(), _stop) : [];
  // UNIKE: holdeplasser med bare linjer en nærmere holdeplass har, foldes inn
  // under kartet — ikke kastet, ett trykk unna. Linjene hentes én gang per id;
  // til de er her (eller om spørringen feiler) vises alle, som før.
  const { vis: unike, skjult: like } = unikeStopp(_stop, alle, stoppLinjer);
  const others = _visLike ? alle : unike;
  const flere = _el('auto-map-flere');
  if (flere) {
    flere.hidden = !like.length;
    flere.textContent = _visLike ? '▾ skjul holdeplasser med samme linjer nærmere'
      : '▸ ' + like.length + (like.length === 1 ? ' holdeplass' : ' holdeplasser') + ' til med samme linjer nærmere · vis';
    if (!flere._bundet) { flere._bundet = true; flere.addEventListener('click', () => { _visLike = !_visLike; _aKey = ''; _renderMap(); }); }
  }
  // The zoom is part of the content, because readability is. Culled beads must
  // come back when the reader pinches in — without this the map answers for
  // the zoom it was drawn at for the rest of the screen's life.
  const key = mapKey(_stop, userPos, others, walkPts, openKey(_open, line))
    + '|k' + (kortLinje ? (_kortRute.id || _kortRute.navn) + ':' + kortLinje.length : '-')
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
  (kortLinje || []).forEach(st => { if (st.lat != null) pts.push([st.lat, st.lon]); });
  others.forEach(s => { if (s.lat != null) pts.push([s.lat, s.lon]); });
  (walkPts || []).forEach(p => pts.push(p));
  if (userPos) pts.push([userPos.lat, userPos.lon]);

  // DEG I MIDTEN når ingen retning eller kort er tema: stoppet du er ved og
  // de relevante alternativene, speilet om posisjonen din.
  const relevante = relevanteStopp(_stop, others, RELEVANT_ANDRE, _relevanteSist, s => stoppInfo(s.id));
  _relevanteSist = relevante.map(s => s.id);
  // Hver tegning har sitt nummer, så ryddingen bare ser denne tegningens merkelapper.
  const lappKlasse = 'map-label lapp-t' + (++_tegning);
  const sentrert = !!(userPos && !line && !kortLinje);
  // UTGANGSKARTET (v1.218.9). Bestilt med skjermbilde: «Velg kvadratisk og
  // dette zoom-nivået. Senter av kartet må beregnes som punktet midt mellom
  // alle punktene i kartet; brukers posisjon, holdeplasser og stasjoner.»
  // Punktene er deg, stoppet og holdeplassene som faktisk er TEGNET (også de
  // utfoldede). Midt mellom dem, på START_ZOOM — eller lenger ut om de ellers
  // ikke får plass. Speilingen om deg (speiletOm) og formregelen
  // (formFraGeometri) er koblet fra her; begge står igjen, foldet.
  const rammePts = sentrert
    ? [userPos, _stop, ...others].filter(s => s && s.lat != null).map(s => [s.lat, s.lon])
    : pts;
  if (rammePts.length && !_aUserMoved && _aFitKey !== key + '|' + sizeKey) {
    _aFitKey = key + '|' + sizeKey;
    // animate:false so the projection is TRUE the moment this returns. With
    // the default animation latLngToContainerPoint still answers for the view
    // being left, so the readability check below measured the old zoom and
    // kept every bead — 12px median where the threshold is 21.
    const pass = _aMap.getBoundsZoom(L.latLngBounds(rammePts), false, L.point(2 * FIT_PAD, 2 * FIT_PAD));
    _aMap.setView(midtpunkt(rammePts), Math.min(FIT_MAKS_ZOOM, pass), { animate: false });
  }

  if (_stop && _stop.lat != null) {
    L.marker([_stop.lat, _stop.lon], {
      icon: makeStopIcon(normMode((_stop.modes || [])[0]), (_stop.modes || []).length, { primary: true }),
    })
      .bindTooltip(lappMedLogo(sentrert ? gangLapp(_stop) : _stop.name, stoppLinjer(_stop.id)),
        { className: sentrert ? lappKlasse : 'map-label', direction: 'top', offset: [0, -8], permanent: sentrert })
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
        .bindTooltip(st.name + (arriveText(st) ? ' · ' + arriveText(st) : ''),
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
  // Det viktigste av de andre stoppene (v1.218.11): stor nål og fast lapp.
  const viktigst = others.slice().sort(nærViktigFørst(s => stoppInfo(s.id)))[0];
  others.forEach(s => {
    if (s.lat == null) return;
    const fast = relevante.includes(s) || s === viktigst;
    L.marker([s.lat, s.lon], {
      icon: makeStopIcon(normMode((s.modes || [])[0]), (s.modes || []).length, { viktig: s === viktigst }),
      keyboard: false,
    })
      // Gangtid med fast merkelapp på de relevante, prikk med verktøytips på resten.
      .bindTooltip(lappMedLogo(gangLapp(s), stoppLinjer(s.id)), { className: fast ? lappKlasse : 'map-label', direction: 'top', offset: [0, -8], permanent: fast })
      .on('click', () => pinStop(s.id))
      .addTo(_aLayer);
  });

  // Kortets rute, i linjas egen farge, som en åpen retning — og målet med
  // navn, så kartet sier det samme som kortet under det.
  if (kortLinje && kortLinje.length) {
    const { color, mode } = openLine(_kortRute.d);
    /* FRA STOPPET DU STÅR VED. `stopsAhead` gir stoppene ETTER det, så linja
     * manglet stykket fram til første stopp — og med bare ett stopp igjen
     * var det ingen linje i det hele tatt, bare to prikker. Sett i
     * nettleserprøven. */
    const fra = _stop && _stop.lat != null ? [{ name: _stop.name, lat: _stop.lat, lon: _stop.lon }] : [];
    drawStopLine(_aLayer, fra.concat(kortLinje), {
      color, mode: normMode(mode),
      project: (ll) => _aMap.latLngToContainerPoint(ll),
    });
    const mål = kortLinje[kortLinje.length - 1];
    if (mål && mål.lat != null) {
      L.marker([mål.lat, mål.lon], {
        icon: makeStopIcon(normMode(mode), 0, { primary: true }),
        keyboard: false, zIndexOffset: 500,
      })
        .bindTooltip(mål.name, { className: 'map-label', direction: 'top', offset: [0, -8], permanent: true })
        .addTo(_aLayer);
    }
  }

  if (walkPts && walkPts.length) drawWalk(_aLayer, walkPts);
  if (userPos) userDot(_aLayer, userPos);
  // MERKELAPPER SOM KRASJER: den som kommer sist (lavere prioritet), blir et
  // vanlig verktøytips. Stoppet du er ved tegnes først og beholdes. Målt i
  // nettleserprøven: tre faste merkelapper i et 140 px kart overlappet.
  if (sentrert && typeof requestAnimationFrame === 'function') requestAnimationFrame(() => ryddMerkelapper(el, lappKlasse.split(' ').pop()));
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
      _rå = stop.estimatedCalls || [];
      // Keep WHERE each message hung. This screen has done it right since
      // v1.137.0 — by writing the loop out here. It was the fourth copy of
      // one loop, and two of the four had lost the origin entirely; the
      // collection has a name now, and every path reads it.
      _alerts = collectStopSituations(stop, _stop && _stop.id);
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
  // Ordvalget — spor, plattform, kai — bor i `bytte.js`, delt med
  // avgangsdetaljene (v1.208.0).
  return plattformTekst(code, mode);
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
/**
 * The departures on this row you can still catch, soonest first.
 *
 * ONE DEFINITION OF «rekker du den». It was written down twice already —
 * `_timesHtml` struck a time out with `reachCls(minsToLeave(...))` while
 * `nextRail` looked for `(ms - t) / MIN >= need`. They agreed, and nothing
 * bound them. And the arrival under the row read neither: it came from the
 * soonest departure whatever the strike said, which produced «framme 19:58»
 * under a row whose 19:33 was crossed out.
 *
 * `walkMins == null` — no position, so no walk — means everything counts,
 * which is exactly the rule `_timesHtml` already wrote for that case and
 * exactly today's screen.
 *
 * Carries the CALL, not just the time: the whole point is being able to ask
 * that departure what it passes on the way.
 */
export function canCatch(ms, walkMins, now) {
  if (!Number.isFinite(ms)) return false;
  // No position, so no walk: everything counts. That is today's screen, and
  // the rule `_timesHtml` already wrote for this case.
  if (walkMins == null) return true;
  return minsToLeave(ms, walkMins, now) >= 0;
}

/**
 * The same rule over a row's departures, carrying the call.
 *
 * The predicate above is what a TIME is judged by; this is what a ROW is
 * asked. Both exist because the two callers hold different things —
 * `_timesHtml` renders `times`, and the arrival needs the call — and they
 * decide with one rule so the strike and the clock cannot disagree.
 */
export function catchable(d, walkMins, now) {
  const t = Number.isFinite(now) ? now : Date.now();
  return ((d && d.calls) || [])
    // Innstilt slås opp på kallet også, ikke bare på `x.innstilt`: en rad
    // bygget et annet sted enn `groupDirections` har ikke det feltet, og
    // regelen skal holde likevel.
    .filter(x => x && !x.innstilt && !erInnstilt(x.call)
      && x.ms >= t && canCatch(x.ms, walkMins, t))
    .sort((a, b) => a.ms - b.ms);
}

export function _timesHtml(d, now, walkMins) {
  const raw = (d.times && d.times.length) ? d.times : null;
  const mins = raw ? raw.map(ms => _minsUntil(ms, now)) : [d.mins];
  // A departure that went while you were looking at the screen is not a
  // choice either — the same rule groupDirections applies when it builds the
  // row, applied again now that the row is allowed to age.
  const keep = mins.map((m, i) => ({ m, ms: raw ? raw[i] : null })).filter(x => x.m >= 0);
  if (!keep.length) return '';
  // THE STRIKE AND THE CLOCK BELOW IT READ THE SAME RULE. `reachCls` still
  // grades how comfortable a reachable departure is — far, ok, soon, now —
  // but WHETHER it is reachable at all is `catchable`'s answer, so the row
  // and the arrival under it cannot disagree about which departure it means.
  const strøket = d.innstiltMs instanceof Set ? d.innstiltMs : new Set();
  const rcls = (x) => {
    // Før gangtiden: «innstilt» og «rekker ikke» er to faktum, og det første
    // gjelder uansett hvor langt du har å gå.
    if (x.ms != null && strøket.has(x.ms)) return 'innstilt';
    if (walkMins == null || x.ms == null) return '';
    return canCatch(x.ms, walkMins, now) ? reachCls(minsToLeave(x.ms, walkMins, now)) : 'missed';
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
  const first = keep.findIndex(x => rcls(x) !== 'missed' && rcls(x) !== 'innstilt');
  const aim = first === -1 ? -1 : first;

  const html = keep.map((x, i) => {
    const r = rcls(x);
    // No walk time means no verdict, and then the old rule is the right one:
    // the first departure is the one you act on.
    const loud = aim === -1 ? i === 0 && r !== 'innstilt' : i === aim;
    // Innstilt får ORDET, ikke bare streken. Gjennomstreket uten ord leses
    // som «rekker ikke» — som er streken sin vanlige betydning på denne
    // skjermen — og det er et annet faktum.
    //
    // Med sin EGEN enhet inni streken: «~~2 min~~ innstilt · 7 min». Uten
    // den leste en rad der alt var innstilt «~~19~~ innstilt min» — sett i
    // nettleserprøven, usynlig i hver test.
    if (r === 'innstilt') {
      const enhet = x.m === 0 ? '' : ' min';
      return '<span class="auto-t-dim auto-t-innstilt" aria-label="' + label(x)
        + enhet + ', innstilt"><s>' + label(x) + enhet + '</s> innstilt</span>';
    }
    return '<span class="' + (loud ? 'auto-t-next' : 'auto-t-dim')
      + (r ? ' ' + r : '') + '">' + label(x) + '</span>';
  }).join('<span class="auto-t-sep"> · </span>');

  // Den felles enheten hører til tallene som GÅR. Er den siste innstilt,
  // har den sin egen inni streken, og en til ville hengt etter «innstilt».
  const sist = keep[keep.length - 1];
  if (rcls(sist) === 'innstilt') return html;
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
  /* `catchable`, IKKE EN EGEN KOPI. Her sto `times.find(ms => … >= need)`
   * — regelen for «kan nås» skrevet en gang til, uten å spørre om
   * avgangen gikk. Den åpnet en retning av seg selv for et tog som var
   * innstilt. Én regel, så skjermen og valget ikke kan være uenige. */
  const kan = metros
    .map(d => ({ d, at: (catchable(d, walkMins, t)[0] || {}).ms }))
    .filter(x => x.at != null)
    .sort((a, b) => a.at - b.at);
  return kan.length ? kan[0].d : null;
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
/**
 * Hele listeseksjonen av eller på: overskrift, bryter og kort.
 *
 * `_showSort` eide bare bryteren, og ble kalt fra seks steder i
 * `_renderBody` — én per tilstand der det ikke finnes noen liste. Nå er det
 * TRE ting som må forsvinne sammen, og seks kallesteder ganger tre ting er
 * nøyaktig hvor mange ganger noen glemmer ett av dem.
 *
 * En overskrift uten liste under er en overskrift som lyver, og kort som
 * blir stående når stoppvelgeren åpnes er forrige skjerm som henger igjen.
 *
 * Bryteren har fortsatt sin egen regel — den skjules også når det bare
 * finnes én gruppe å ordne — så den er `_showSort` sitt ansvar alene.
 */
export function _visListeDel(on) {
  const hode = _el('auto-where-head');
  if (hode) hode.style.display = on ? '' : 'none';
  const kort = _el('auto-dest-body');
  if (kort && !on) kort.innerHTML = '';
  _showSort(on);
}

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
  const walk = gangTil(_stop);
  const hit = nextRail(_dirs, _stop.name, Date.now(), walk && walk.mins);
  if (!hit) return false;
  _open = hit;
  logMsg('auto: åpnet ' + hit.frontText
    + (walk ? ' (' + walk.mins + ' min gange)' : ''), 'ok');
  _renderBody();
  return true;
}

/**
 * Navnet `autoJumpDest` ville valgt, før ferskheten kan slå det ut.
 *
 * Hønen og egget: `ferskhet` trenger destinasjonen, og destinasjonen kommer
 * fra den funksjonen ferskheten skal begrense. `destRanking()[0]` er
 * nøyaktig det `autoJumpDest` rangerer øverst — samme ene kilde, ikke en
 * andre regel som måtte holdes enig.
 */
function _sistTil() {
  const top = destRanking()[0];
  return top ? sistReist(top.toName) : null;
}

function _maybeJump() {
  if (_open || _stopPinned || !_stop) return false;
  if (!atStop(_stop)) return false;
  /* SAMME DOM SOM RADEN UNDER. Sier skjermen «før (40)» om en vane, skal
   * ikke appen flytte deg dit — regelen bor i `autoJumpDest`, så de to kan
   * ikke bli uenige. */
  const guess = autoJumpDest(undefined,
    ferskhet(_sistTil(), Date.now(), loadConsent()));
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
  // Nullstilt hvert tikk; settes igjen bare når lista faktisk har et kort.
  // Ellers ville et kort fra et stopp du har gått fra blitt stående på kartet.
  _kortRute = null;
  const body = _el('auto-body');
  if (!body) return;
  if (_open) { _visListeDel(false); _renderStops(body); return; }
  // "We do not know where you are" and "nothing leaves from here" are
  // different facts, and saying the second when the first is true is a lie
  // the reader cannot see through — there ARE departures, we just have no
  // position. Measured on the GPS-denied run, which said exactly that.
  if (!_stop) {
    const t = noPosText(state.gpsError);
    _visListeDel(false);
    body.innerHTML = '<div class="dest-prev-empty">' + esc(t.body) + '</div>';
    _setManual(t.cta);
    return;
  }
  _setManual(MANUAL_CTA);
  if (!_dirs.length) {
    _visListeDel(false);
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
  /* OG HVOR MYE GJETNINGEN ER VERDT.
   *
   * Merket var bare en rammefarge (`settings.css:609`): førti reiser og én
   * reise så nøyaktig like sikre ut, og `aria-label` sa ingenting om at
   * raden var merket i det hele tatt. Regningen fantes hele tiden inne i
   * `destRanking` — dette er bare å la den nå skjermen.
   *
   * Uten argument, som `predictDest()` over: kalles de med hvert sitt
   * tidspunkt er det to steder som skriver ned «nå», og de ville drevet fra
   * hverandre over et bøtteskille. (`now` er dessuten deklarert NEDENFOR —
   * se den dødsonen kommentaren åtti linjer opp beskriver.) */
  /* OG OM VANEN ER FERSK. Reiseloggens sju døgn har til nå betalt for én
   * liste under «hva appen husker» og ingen dom. Her gjør de arbeid: en vane
   * på førti turer med ingen av dem denne uka sier «før», ikke «vanlig nå».
   *
   * `loadConsent()` og ikke en gjetning på tom logg: «av» og «på og tom» er
   * to setninger, og bare den andre er et bevis. */
  const vane = vanestyrke(destRanking(), guess && guess.source,
    ferskhet(guess && sistReist(guess.toName), Date.now(), loadConsent()));
  // Read once, so every row on the screen agrees about what time it is.
  const now = Date.now();
  // How far you have to walk to be standing here — the number this screen has
  // always computed and never shown. Null when we cannot know, and then the
  // rows are exactly as they were.
  const walk = gangTil(_stop);
  const walkMins = walk ? walk.mins : null;
  // A direction whose departures have all gone while you watched is not a
  // choice any more. The screen counts down now (v1.71.0), so rows can age
  // past their own contents — and a row naming a direction with no time
  // beside it promises something the stop board is not saying.
  const live = _liveRows(now);
  if (!live.length) {
    _visListeDel(false);
    body.innerHTML = '<div class="dest-prev-empty">'
      + esc(boardState({ asked: _asked, dirs: _dirs, live, nextMs: _nextMs,
        now, horizonMins: NEXT_DEPARTURE_HORIZON_MINS }).label) + '</div>';
    return;
  }
  _visListeDel(true);
  // Once for the list, not once per row: byLine walks every message.
  const perLine = byLine(_alerts);
  // The same named derivation renderAuto hands to the banner as `delivered`.
  const rm = rowMessages(live, perLine);
  // Forget rows that are no longer here — a direction that has left, or a
  // whole new stop — so the set cannot grow across a morning of stops.
  _openMsgs.forEach(k => { if (![...rm.keys.values()].includes(k)) _openMsgs.delete(k); });
  // MOT ELLER FRA SENTRUM. Eight rows of «mot Lysaker», «mot Ski», «mot
  // Stabekk» are each correct and none answers the question a person
  // actually holds, which is almost always one of two.
  //
  // `centreward` returns null wherever it does not know — outside Oslo, at
  // the centre itself, or for a line that neither approaches nor recedes by
  // a real margin. When nothing can be judged the headings never appear and
  // this screen is exactly what it was.
  const here = (_stop && _stop.lat != null) ? { lat: _stop.lat, lon: _stop.lon } : null;
  // ONCE PER DRAW, not once per row. This screen redraws every second, and
  // eleven rows each reading and re-indexing the history would be eleven
  // times the work for one answer.
  const freq = loadFreq('arr');
  const side = new Map();
  for (const { d, i } of live) {
    // The row's own onward stops, for the centre grouping. Read from the
    // departure you can catch, so the row is judged by the journey the
    // reader would actually take (v1.142.0).
    const ride = catchable(d, walkMins, now)[0];
    side.set(i, centreward(here, stopsAhead((ride && ride.call) || d.call, _stop && _stop.name, now)));
  }
  // WHERE YOU ARE GOING, over where the lines are going.
  //
  // The same stops that used to be drawn indented under each row, grouped by
  // DESTINATION instead of by row. On the reported screen four rows each
  // carried «Jernbanetorget» with a different clock time, and the reader had
  // to sort four numbers to find the earliest. Now it is said once, ranked.
  //
  // The indented stops are not deleted — they are this, folded up. Saying the
  // same clock time in two places is the fault this codebase spends most of
  // its time on.
  // Med det lange sporet når det finnes: retningen over minutter, ikke sekunder.
  const dests = destinations(live, freq, walkMins, now, _stop && _stop.name,
    (state.posTrailLang && state.posTrailLang.length >= 2) ? state.posTrailLang : state.posTrail,
    { her: _stop, hist: loadSmartHist() });
  // Samme kort og samme alternativ som kortets overskrift: kartet og kortet
  // skal vise samme reise.
  const k0 = dests[0], o0 = k0 && k0.options && k0.options[0];
  _kortRute = o0 ? { navn: k0.name, id: k0.id || null, d: o0.d, call: o0.call } : null;
  // PARTITIONED, not a heading emitted whenever the value changes. The list
  // is already sorted by the reader's own choice (T-bane først / Lokalbuss
  // først), and a heading-on-change would interleave «mot sentrum» through
  // that order three times over. Within each group the chosen order is kept
  // exactly as it was.
  const groups = [['mot', []], ['fra', []], [null, []]];
  for (const row of live) {
    (groups.find(g => g[0] === side.get(row.i)) || groups[2])[1].push(row);
  }
  const grouped = groups.some(([k, rows]) => k && rows.length);
  const ordered = grouped ? groups.flatMap(([, rows]) => rows) : live;

  /**
   * One destination, said once: where, when you are there, and how.
   *
   * The heading carries the ANSWER — «Jernbanetorget · framme 20:13» — and
   * the line under it carries what you need to act: which line, which
   * platform, when it leaves. A reader standing at a hub has to know which
   * row to walk to, and that is the whole of it.
   *
   * The rest are counted, not listed. They are the same journey by a slower
   * road, and four of them under a heading would be the list this block
   * exists to replace.
   */
  const destHtml = (x, n) => kortHtml(x, n);

  /* KORTENE I SIN EGEN CONTAINER, radene i sin.
   *
   * De sto i samme `innerHTML`, og da kunne ingen statisk bryter stå mellom
   * dem — som er hele grunnen til at den havnet over begge. «Hvor skal du?»
   * er flyttet til index.html, rett over bryteren, så overskriften og
   * kontrollen hører sammen uten at noen av dem tegnes på nytt hvert sekund. */
  const destBody = _el('auto-dest-body');
  if (destBody) {
    destBody.innerHTML = dests.length
      ? '<div class="set-label">dit du ofte skal</div>' + dests.map(destHtml).join('')
      : '';
  }

  /* OVERSKRIFTEN UNDER, FRA DET ENE STEDET SOM VET OM DET BLE KORT.
   *
   * Ikke fra `_visListeDel`: den kalles før `dests` er regnet ut, og å flytte
   * det kallet for å få tak i et tall ville vært å endre rekkefølgen på en
   * render for en etikett. Er seksjonen skjult, spiller teksten ingen rolle,
   * så ingen av `_visListeDel(false)`-stiene trenger å nullstille noe. */
  const whereLabel = _el('auto-where-label');
  if (whereLabel) whereLabel.textContent = listeOverskrift(dests.length > 0);

  let shown;
  /* GRUPPEN I MOTSATT RETNING AV MØNSTERET, FOLDET (src/maalModell.js
   * `foldetSide`). Unntatt når dine egne mål akkurat nå ligger i den. */
  const egneSider = new Set();
  dests.filter(x => x.eget > 0).forEach(x => x.options.forEach(o => { const k = side.get(o.i); if (k) egneSider.add(k); }));
  const foldet = grouped ? foldetSide(now, _stop, egneSider) : null;
  const antallI = k => ordered.filter(({ i }) => (side.get(i) || null) === k).length;
  let iFold = false;
  // SI DET: i fart strykes ingen rad på gangtid, og ustrøkne rader uten
  // forklaring leses som at alt kan nås.
  const fartNotis = gangGjelder(fartNå(now), state.walkFromLL !== null) ? ''
    : '<div class="i-fart-notis">' + esc(I_FART_NOTIS) + '</div>';
  body.innerHTML = fartNotis + ordered.map(({ d, i }) => {
      /* Merket bare når det finnes noe å si om STYRKEN. `gjetning` er
       * `t.freqArr`-fallbacken, som ikke vet noe om tid på døgnet —
       * `autoJumpDest` nekter alt å handle på den, og en rad merket «du
       * pleier» på den strengen ville påstått noe ingen har målt. */
      const hint = !!usual && d.frontText.toLowerCase() === usual
        && (vane.kind === 'sterk' || vane.kind === 'gammel' || vane.kind === 'svak');
      const q = quayLabel(d.call);
      // The destination is the part that gives way, so the whole of it has to
      // survive somewhere: aria-label for a screen reader, title for a long
      // press. A row reading "mot Jernb…" must still be able to say what it is.
      // The row's own messages, from the same rowMessages the banner is told
      // about, so a message cannot be folded there while missing here.
      const dirMsgs = rm.byRow.get(i) || [];
      const msg = dirAlertHtml(dirMsgs, _openMsgs, rm.keys.get(i), i);
      // The label names the row, and only the row. The message text used to
      // be appended here because there was nowhere visible to put it; it has
      // its own button now, with its own label, and reading it three times in
      // a row is not an improvement.
      // SKJERMLESEREN FÅR DET SAMME SOM ØYET. En forskjell som bare er en
      // farge er en forskjell halve lesergruppa ikke har — og her var det
      // ikke engang et ord å lese opp.
      const full = 'mot ' + d.frontText + (q ? ', ' + q : '')
        // «1 turer» sto på skjermen i første kjøring av prøven. Ett tall som
        // bærer sitt eget ord, ikke to skrivemåter som må være enige.
        // Og begrunnelsen: «… 28 ganger, men sjelden på denne tiden». Raden
        // har bare plass til «tatt 28 ganger»; dette er stedet for hvorfor.
        + (hint ? ', ' + vaneSetning(vane) : '');
      /* MERKET STÅR PÅ LINJA MED TIDENE, til venstre.
       *
       * Det sto i `.auto-badges`, på navnelinja. Rapportert fra Mortensrud:
       * «74 AV OG TIL (28) mot Jernbanetorget» skjøv «plattform E» ned på en
       * egen linje, og raden ble høyere enn naboene. Venstre del av
       * tidslinja er tom på hver rad, så der koster merket ingen plass. Inni
       * `.nearby-dist`, ikke som et nytt barn av raden — settings.css:402
       * advarer om hva et tredje barn gjør. */
      const vaneHtml = hint
        ? '<span class="auto-vane" aria-hidden="true">' + esc(vaneMerke(vane)) + '</span>'
        : '';
      // The heading is emitted by the first row of each group, so the
      // order the list is already sorted in is the order the groups appear
      // in — no second sort that could disagree with the first.
      // Emitted by the first row of each group, now that the rows are in
      // group order and cannot interleave.
      let head = '';
      if (grouped) {
        const k = side.get(i) || null;
        if (k !== shown) {
          shown = k;
          const navn = k ? CENTRE_LABEL[k] : 'andre retninger';
          head = (iFold ? '</details>' : '')
            + (k && k === foldet
              ? '<details class="auto-side-fold"' + (_sideFoldÅpen ? ' open' : '') + '><summary class="auto-side">'
                + esc(navn + ' · ' + antallI(k)) + '</summary>'
              : '<div class="auto-side">' + esc(navn) + '</div>');
          iFold = !!(k && k === foldet);
        }
      }
      return head + '<button class="nearby-btn auto-dir'
        + (hint ? ' auto-usual auto-usual-' + vane.kind : '') + '"'
        + ' type="button" data-i="' + i + '"'
        + ' title="' + esc(full) + '" aria-label="' + esc(full) + '">'
        + '<span class="auto-badges">' + d.lines.map(badgeHtml).join('')
        + msg.mark
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
        + '<span class="nearby-dist">' + vaneHtml + _timesHtml(d, now, walkMins) + '</span>'
        + '</button>'
        + msg.block;
    }).join('') + (iFold ? '</details>' : '')
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
  // THE SAME DOOR the stop in the drill-down goes through, so the two cannot
  // drift apart: autoRoute, then the one route-setter every caller uses.
  // TAPPING THE MARK OPENS THE MESSAGE, and does not also open the direction:
  // the mark sits inside .auto-dir, which drills down. Same stopPropagation
  // as the indented stop below (v1.138.0).
  body.querySelectorAll('.auto-dir-alert').forEach(b => {
    b.addEventListener('click', e => {
      e.stopPropagation();
      // THE KEY STAYS IN JS. It was in the attribute, and it contains a
      // \u0000 separator — which in an HTML attribute is not a character but
      // a parse error: every row collapsed to its line badge alone. The
      // markup carries the row index; rm.keys is right here in scope.
      const k = rm.keys.get(Number(b.dataset.i)) || '';
      if (_openMsgs.has(k)) _openMsgs.delete(k); else _openMsgs.add(k);
      _renderBody();
    });
    b.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault(); e.stopPropagation(); b.click();
    });
  });
  // THE SAME DOOR the indented stop went through, and the «ofte brukt» row
  // still does: autoRoute, then the one route-setter every caller uses. Three
  // ways in, one way on.
  /* Der kortene nå står. Bindes de fortsatt på `body`, finnes de ikke der —
   * og knappene ville sluttet å virke uten at noe falt.
   *
   * Ingen `|| body` som fallback: finnes ikke containeren, ble kortene aldri
   * tegnet, og å lete etter dem et annet sted finner ingenting uansett. En
   * fallback som aldri kan hjelpe er bare støy som ser ut som forsiktighet. */
  _gjenopprettSlett(destBody);
  _bindKort(destBody, dests);
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
 * How many of your most-used stops sit indented under a direction row.
 *
 * TWO, where the drill-down shows three — a different choice for a different
 * reason, which is why it is its own constant rather than a reuse of that
 * one. In the drill-down the shortcuts are the only thing on screen; here
 * they hang under as many as eleven rows, and three apiece would make the
 * list three times as long to answer the same question.
 */
export const INLINE_STOPS = 2;

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
/**
 * How many destinations the block may name at once.
 *
 * Two, like INLINE_STOPS and for the mirror of its reason: the indented stops
 * sat UNDER up to eleven rows, and this sits OVER them. Anything that pushes
 * the departures off the screen has taken more than it gave.
 */
export const DEST_BLOCK = 2;

/**
 * YOUR OWN DESTINATIONS, and every way of getting to each from here.
 *
 * Reported with a screenshot from Mortensrud: four rows — mot Kolsås, mot
 * Stortinget, mot Avløs, mot Jernbanetorget — and under every one of them the
 * same stop, Jernbanetorget, with a different clock time. FOUR ROWS, FOUR
 * CLOCK TIMES, ONE QUESTION: when am I at Jernbanetorget? The reader had to
 * sort them in their head.
 *
 * The list is keyed on the DEPARTURE while the answer is a DESTINATION. This
 * turns the axis: group by where you are going, rank by when you arrive.
 *
 * ── Nothing new is fetched ──────────────────────────────────────────────
 *
 * Both halves of the join already exist and were never put together:
 * `stopsAhead` has been computed per row since v1.133.0, and `loadFreq('arr')`
 * has held the reader's destinations since long before. The same computation,
 * grouped by destination instead of by row, is the whole block.
 *
 * ── The rules ───────────────────────────────────────────────────────────
 *
 * Only what the reader USES, by `usesOf` and `stopKey` — the same key the
 * indented stops and depUses share, so «Ryen» and «Ryen T» are one place here
 * too. Without it every stop on every line would become a heading.
 *
 * Options sorted by ARRIVAL, because that is the question. Destinations
 * sorted by USE, because a heading that reorders itself while the minutes
 * count down is the unrest this app keeps removing.
 *
 * One row is one way there however many departures it has, and its arrival is
 * the one from the departure you can still catch (v1.142.0). A row with
 * nothing catchable yields no option at all — it falls out of `catchable`
 * without a branch, which is the same reason «framme 20:04» stopped being
 * printed under a row you could not use.
 *
 * `fromName` is the stop you are standing at, passed rather than read off
 * module state: this is a rule, and a rule that reaches for `_stop` cannot be
 * tested without the whole screen around it.
 */
/**
 * Ett kort: hvor du skal, når du er framme, og hvordan.
 *
 * Lå som en closure inne i renderen og kunne derfor bare prøves ved å bygge
 * hele skjermen. Den bærer to rettelser nå, og begge er påstander om HTML —
 * de må kunne feile for seg.
 *
 * 1 · MERKET. Kortet skrev «linje 71» og ingenting om hva 71 er. Radene
 *     under har hatt fargemerket hele tiden, og appen VET modusen —
 *     `dirRank` grupperer på den. Kortet var det eneste stedet kunnskapen
 *     ikke nådde skjermen.
 *
 * 2 · DEN ANDRE VEIEN. «+3 andre veier» er et tall, ikke et svar. T-banen
 *     leseren valgte å prioritere lå i `options`, bare ikke på plass 0.
 *
 * Overskriften flytter seg IKKE. «framme 07:40» betyr fortsatt raskest, og
 * blokka finnes fordi fire rader med hver sin klokke tvang leseren til å
 * sortere tall selv. Lar bryteren overstyre den, er vi tilbake der vi
 * startet — så den navngir den foretrukne veien ved siden av, ikke i stedet.
 */
/**
 * Overskriften over reisealternativene — og ordet som krever et første.
 *
 * «Andre reisealternativer» er riktig når det står kort over. Men
 * `destinations()` gir tom liste uten historikk (`if (!hist.length) return
 * []`), og da tegnes kortseksjonen ikke i det hele tatt. «Andre» ville stått
 * øverst på skjermen uten noe å være andre enn — hos hver førstegangsbruker,
 * og på hvert stopp der ingen av leserens vanlige destinasjoner går fra.
 *
 * To ordlyder, ett navn, så de ikke kan drive fra hverandre. Substantivet er
 * det samme i begge: det er den samme lista, og bare forholdet til det over
 * som endrer seg.
 */
export function listeOverskrift(harKort) {
  return (harKort ? 'andre ' : '') + 'reisealternativer';
}

/* ── HVILKET KORT ER ÅPNET FOR SLETTING ─────────────────────────────────
 *
 * I MODULEN, IKKE I MARKUPEN, og det er ikke en smakssak.
 *
 * Skjermen tegner på nytt hvert sekund, og `destBody.innerHTML` byttes i sin
 * helhet. Lå tilstanden i HTML-en, ville ×-en forsvunnet innen ett sekund —
 * før fingeren rakk fram til den — og feilen ville sett ut som at
 * langtrykket ikke virket i det hele tatt.
 *
 * Navnet, ikke indeksen: lista sorteres på bruk, og en indeks peker på et
 * annet sted så snart rekkefølgen endrer seg. Samme grunn som
 * `removeRecentDest` tar en etikett.
 *
 * Ett kort av gangen. To åpne ×-er er to spørsmål stilt samtidig.
 */
let _slettbarNavn = null;

/** For prøvene og for renderen. */
export function _slettbar() { return _slettbarNavn; }
export function _settSlettbar(navn) { _slettbarNavn = navn || null; }

/**
 * Hvor lenge et trykk må holdes.
 *
 * 500 ms er iOS' egen terskel for et langtrykk, så gesten kjennes som
 * systemets. VALGT, IKKE MÅLT — sandkassen har ingen finger, og dette er
 * tallet som må flyttes om holdet kjennes tregt eller for lett å utløse.
 */
export const HOLD_MS = 500;

/**
 * Hvor mye fingeren får flytte seg før holdet er en skrolling.
 *
 * Lista er høyere enn skjermen. Uten dette ville hver dragning som startet
 * på et kort åpnet en ×, og det er den slags som gjør at en skjerm føles
 * urolig uten at man klarer å si hvorfor.
 */
export const HOLD_SLARK_PX = 10;

/**
 * Legg klassen tilbake på det åpnede kortet etter en tegning.
 *
 * TRUKKET UT AV RENDEREN FOR Å KUNNE PRØVES, og det er ikke rydding.
 *
 * Tre utgaver av testen for dette tok feil, fordi de alle bandt KILDETEKST:
 * først et tegnvindu etter `destBody.innerHTML` (bommet da
 * overskriftsblokka la seg imellom), så nærheten mellom `_slettbarNavn` og
 * `vis-slett` (OVERLEVDE at hele gjenopprettingen ble slått av, fordi
 * langtrykk-handleren noen linjer under nevner begge), så oppslaget på
 * `data-rad` (overlevde en mutert vakt).
 *
 * En vakt kan ikke bindes av et søk i en fil. Den må kjøres.
 */
export function _gjenopprettSlett(destBody) {
  if (!destBody || !_slettbarNavn) return;
  const sel = (typeof CSS !== 'undefined' && CSS.escape)
    ? CSS.escape(_slettbarNavn) : _slettbarNavn;
  const rad = destBody.querySelector('.auto-dest-rad[data-rad="' + sel + '"]');
  if (rad) rad.classList.add('vis-slett');
  // Kortet er borte fra lista — da er det ingenting å glemme lenger.
  else _slettbarNavn = null;
}

/**
 * Trykk, hold og slett på kortene.
 *
 * Egen funksjon av samme grunn som `_gjenopprettSlett`: en gest er
 * oppførsel, og oppførsel kan bare bindes ved å kjøres. Mutanten som fjernet
 * avbruddet ved bevegelse overlevde en test som bare krevde at ordet
 * `pointermove` fantes i fila.
 */
export function _bindKort(destBody, dests) {
  if (!destBody) return;

  const lukkAlle = () => {
    _slettbarNavn = null;
    destBody.querySelectorAll('.auto-dest-rad.vis-slett')
      .forEach(r => r.classList.remove('vis-slett'));
  };

  destBody.querySelectorAll('.auto-dest').forEach(b => {
    /* LANGTRYKK: hold et halvt sekund for å avsløre ×-en.
     *
     * `pointer`-hendelser og ikke `touch`: de dekker finger, mus og penn med
     * ett sett, og dette er det ene stedet i appen som trenger dem. */
    let holdTimer = null;
    let start = null;
    let holdt = false;
    const avbryt = () => {
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = null; start = null;
    };

    b.addEventListener('pointerdown', (e) => {
      holdt = false;
      start = { x: e.clientX, y: e.clientY };
      holdTimer = setTimeout(() => {
        holdTimer = null;
        holdt = true;
        const rad = b.closest('.auto-dest-rad');
        const navn = rad && rad.dataset.rad;
        if (!navn) return;
        lukkAlle();                       // ett kort av gangen
        _slettbarNavn = navn;
        rad.classList.add('vis-slett');
      }, HOLD_MS);
    });

    /* EN SKROLLING ER IKKE ET HOLD. Lista er høyere enn skjermen, og uten
     * dette ville hver dragning som startet på et kort åpnet en ×. */
    b.addEventListener('pointermove', (e) => {
      if (!start) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > HOLD_SLARK_PX) avbryt();
    });
    b.addEventListener('pointerup', avbryt);
    b.addEventListener('pointercancel', () => { avbryt(); holdt = false; });

    b.addEventListener('click', () => {
      /* HOLDET SVELGER KLIKKET. Uten dette navigerer et langtrykk deg til
       * tavla i stedet for å avsløre ×-en — altså gjør gesten det motsatte
       * av det den lover. */
      if (holdt) { holdt = false; return; }
      // Et trykk et annet sted lukker en åpen ×.
      if (_slettbarNavn) { lukkAlle(); return; }
      const x = dests && dests[Number(b.dataset.d)];
      const dir = x && autoRoute(_stop, { name: x.name, id: x.id });
      if (dir) window._useRouteDir && window._useRouteDir(dir, null);
    });
  });

  /* OG SELVE SLETTINGEN. Bare raden fjernes fra DOM-en, ikke hele seksjonen:
   * `track.js:1551` gjorde det samme valget for chipsene, med samme
   * begrunnelse — «ro er regelen». Neste sekundtegning bygger lista uten
   * stedet uansett, fordi `glemSted` har skrevet den. */
  destBody.querySelectorAll('.auto-dest-del').forEach(d => {
    d.addEventListener('click', (e) => {
      e.stopPropagation();
      const navn = d.dataset.glem;
      if (!navn) return;
      glemSted('arr', navn, d.dataset.glemId || null);
      _slettbarNavn = null;
      const rad = d.closest('.auto-dest-rad');
      if (rad) rad.remove();
    });
  });
}

export function kortHtml(x, n) {
  const o = x.options[0];
  const q = quayLabel(o.call);
  const ln = (o.d.lines && o.d.lines[0]) || {};
  const how = 'mot ' + o.d.frontText + (q ? ' · ' + q : '') + ' · går ' + clk(o.ms);
  // Ordene for en skjermleser. Et merke er en farge, og en forskjell som bare
  // er en farge er en forskjell halve lesergruppa ikke har.
  const sagt = 'linje ' + (ln.code || '?') + ' ' + how;

  /* TELLINGEN, IKKE NAVNET. Den sier at det finnes mer uten å dra en annen
   * avgang inn i kortet — og et trykk bygger ruta dit og sender deg til
   * tavla, der alle linjene står. Alternativene er ett trykk unna uansett;
   * de trenger ikke stå her. */
  const flere = x.options.length - 1;
  const annet = flere
    ? flere + (flere === 1 ? ' annen vei' : ' andre veier')
    : null;

  /* EN RAMME RUNDT TO KNAPPER, ikke en knapp inni en knapp.
   *
   * `.auto-dest` ER en `<button>`, og en knapp inni en knapp er ugyldig
   * HTML. `track.js:1450` skrev ned nøyaktig dette for chipsene og løste det
   * med en `<span>`-ramme; her gjelder det samme.
   *
   * ×-EN ER DER HELE TIDEN, ikke noe som settes inn ved et langtrykk. En
   * gest har ingen vei inn for tastatur eller skjermleser; en knapp som
   * alltid står der, og som blir synlig når den får fokus, har det.
   * Langtrykket er en snarvei til den, ikke den eneste veien. */
  return '<span class="auto-dest-rad" data-rad="' + esc(x.name) + '">'
    + '<button class="nearby-btn auto-dest" type="button" data-d="' + n + '"'
    + ' aria-label="' + esc('reis til ' + x.name + ', framme ' + clk(o.at) + ', ' + sagt
      + (annet ? ' · ' + annet : '')) + '">'
    + '<span class="auto-dest-top">'
    + '<span class="auto-dest-name">' + esc(x.name) + '</span>'
    + '<span class="auto-dest-at">' + esc('framme ' + clk(o.at)) + '</span>'
    + '</span>'
    // Hvorfor dette står her (src/maalModell.js), når det er noe å si.
    + (x.grunn ? '<span class="auto-dest-grunn">' + esc(x.grunn) + '</span>' : '')
    /* Tellingen INNE i samme avsnitt, ikke som et eget barn. Kommentaren i
     * settings.css:731 forklarer hvorfor: som høyrestilt flex-barn brøt
     * leserekkefølgen på 414 px, og som egen blokk-linje ble den et nytt
     * utsagn der den bare er en fotnote. Vanlig tekst som brytes der den må. */
    + '<span class="auto-dest-how">' + badgeHtml(ln) + ' ' + esc(how)
    + (annet ? '<span class="auto-dest-more">' + esc(' · +' + annet) + '</span>' : '')
    + '</span>'
    + '</button>'
    /* ID-EN FØLGER MED. `usesOf` foretrekker stopp-id framfor navnet når den
     * avgjør om kortet skal vises; da må slettingen kunne bruke den samme —
     * ellers er en oppføring som ble FUNNET på id utilgjengelig for sletting
     * uansett hva den heter. */
    + '<button class="auto-dest-del" type="button" data-glem="' + esc(x.name) + '"'
    + (x.id ? ' data-glem-id="' + esc(x.id) + '"' : '')
    + ' aria-label="' + esc('Glem ' + x.name) + '">\u00d7</button>'
    + '</span>';
}

/**
 * Rekkefølgen etter hvor du er på vei. Bestilt: «Rekkefølgen på kortene
 * under «Dit du ofte skal» bør være iht. sannsynlig reiseretning bruker er
 * på.» Et sted sporet ditt nærmer seg (`approach` → 'mot') står først, så de
 * sporet ikke sier noe om, og sist de du fjerner deg fra. Innenfor samme
 * retning avgjør bruken, som før. Uten spor er rekkefølgen som før.
 */
export const RETNING_RANG = { mot: 0, staar: 1, 'vet-ikke': 1, fra: 2 };

export function destinations(live, freq, walkMins, now, fromName, trail, modell) {
  const hist = (freq || []).filter(p => p && p.name);
  if (!hist.length) return [];
  // The index is built the way stopShortcuts builds it, from the same fields,
  // so the two cannot disagree about what counts as used.
  const byId = new Map(), byName = new Map();
  hist.forEach(p => {
    const c = Number(p.count) || 0;
    if (p.stopId) byId.set(p.stopId, Math.max(c, byId.get(p.stopId) || 0));
    const k = stopKey(p.name);
    if (k) byName.set(k, (byName.get(k) || 0) + c);
  });

  const out = new Map();
  (live || []).forEach(({ d, i }) => {
    const ride = catchable(d, walkMins, now)[0];
    if (!ride) return;
    stopsAhead(ride.call, fromName, now).forEach(st => {
      const n = usesOf(st, { byId, byName });
      if (!n) return;
      const key = stopKey(st.name);
      if (!key) return;
      const prev = out.get(key)
        || { name: st.name, id: st.id, uses: n, options: [], lat: st.lat, lon: st.lon };
      // The same row twice keeps only its own earliest arrival: one row is
      // one way there, whatever it is called on the way.
      const seen = prev.options.find(o => o.i === i);
      if (seen) { if (st.at < seen.at) { seen.at = st.at; seen.call = ride.call; } }
      else prev.options.push({ i, d, call: ride.call, ms: ride.ms, at: st.at });
      prev.uses = Math.max(prev.uses, n);
      out.set(key, prev);
    });
  });

  return [...out.values()]
    .map(x => ({ ...x, options: x.options.slice().sort((a, b) => a.at - b.at) }))
    .map(x => ({ ...x, retning: (trail && trail.length && Number.isFinite(x.lat))
      ? approach(trail, { lat: x.lat, lon: x.lon }).kind : 'vet-ikke' }))
    // HVOR DU MEST SANNSYNLIG SKAL NÅ (src/maalModell.js): ditt mønster for
    // tid og dagtype blandet med det vanlige mønsteret. Bevegelsen går foran.
    .map((x, _, alle) => {
      if (!modell) return x;
      if (!alle._r) alle._r = new Map(rangerMål(alle, { nå: now, her: modell.her, hist: modell.hist }).map(r => [r.kort.name, r]));
      const r = alle._r.get(x.name);
      return { ...x, p: r ? r.p : 0, eget: r ? r.eget : 0, grunn: x.retning === 'mot' ? 'på vei dit' : (r ? r.grunn : '') };
    })
    .sort((a, b) => (RETNING_RANG[a.retning] - RETNING_RANG[b.retning])
      || ((b.p || 0) - (a.p || 0)) || b.uses - a.uses || a.name.localeCompare(b.name, 'nb'))
    .slice(0, DEST_BLOCK);
}

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
  // Bare retninger med en avgang som GÅR. En der alt er innstilt har et
  // `nextMs` — det tidligste innstilte — og ville ellers sendt deg mot målet
  // via et tog som ikke kommer.
  const byTime = dirs.filter(d => catchable(d, null, now).length)
    .sort((a, b) => a.nextMs - b.nextMs);
  for (const d of byTime) {
    const stops = stopsAhead(d.call, fromName, now);
    const hit = stops.find(s => (wantId && s.id && s.id === wantId)
      || stopKey(s.name) === want);
    if (hit) return { dir: d, stop: hit };
  }
  return null;
}

function _renderStops(body) {
  // THE SAME DEPARTURE THE LIST OUTSIDE USES. This drill-down reads the row's
  // onward stops too, and it read them off the soonest call — so a reader who
  // could not catch that one got arrival times for a journey already struck
  // out on the screen they came from. Two places showing one fact, and only
  // one of them fixed would be the fault this release is about.
  const walk = gangTil(_stop);
  const ride = catchable(_open, walk ? walk.mins : null, Date.now())[0];
  const stops = stopsAhead((ride && ride.call) || _open.call, _stop.name);
  // `.picked` is the mark a tap on the map leaves. It is a CLASS on the row
  // rather than state in the markup, because this innerHTML is replaced once a
  // second — anything stored here would be gone before the finger lifted.
  const stopHtml = (s, i, extra) => '<button class="nearby-btn auto-stop-btn'
    + (extra || '') + (_linePicked === i ? ' picked' : '')
    + '" type="button" data-i="' + i + '">'
    + '<span class="nearby-name">' + esc(s.name) + '</span>'
    + '<span class="nearby-dist">' + (ride ? arriveText(s) : '') + '</span>'
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
  // the rows for those lines instead, where the choice is made.
  //
  // AND THE BANNER HAS TO KNOW THAT HAPPENED. Reported from Jernbanetorget:
  // «5 ANDRE MELDINGER · VIS» stood above «du er ved», and the five were
  // precisely the ones the rows below were already marking. The rule was
  // right and the banner counted them a second time, under a heading that
  // said nothing about any of them.
  //
  // `delivered` comes from the SAME rowMessages the rows are drawn from, so
  // the two cannot disagree about what is on screen. A line with no row —
  // the list is capped at a hub — keeps its line in the banner, and a
  // closure is never folded at all.
  const rm = rowMessages(_liveRows(Date.now()), byLine(_alerts));
  renderAlertsInto(_el('auto-alerts'), _alerts, renderAuto, {
    stopIds: [_stop && _stop.id].filter(Boolean),
    lineIds: [],
    journeyIds: [],
    delivered: rm.ids,
    otherWord: { one: 'melding om en annen linje', many: 'meldinger om andre linjer' },
  });
  renderRouteShortcuts('auto-fav-routes', 2);
  // Før «du er ved»: sitter du på noe, er det det første spørsmålet.
  _renderOmbord();
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
  _stopsShown = false; _jumpArmed = false; _openMsgs = new Set(); }
