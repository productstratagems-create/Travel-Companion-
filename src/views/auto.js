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
import { metresBetween } from '../haversine.js';
import { linjemerke, modusOrd } from '../ui/linjemerke.js';
import { lappMedLogo } from '../ui/tilbyderlogo.js';
import { esc, clk, clkDay } from '../ui/fmt.js';
import { stopKey } from '../stopId.js';
import { stopsAhead, arriveText, kjentMål, radAnkomst } from '../ui/stoppVelger.js';
import { lesFokus, lagreFokus } from '../ui/kartValg.js';
import { ZOOM as ZOOM_TRINN } from '../ui/kartRamme.js';
import { rekkLengerNed, rekkTekst } from '../rekkLengerNed.js';
import { sikreGang, gangRuteTil } from '../api/gangTilStopp.js';
import { gangTre, stierFraPrikken } from '../veivalg.js';
let _gangTreLogg = '';
/** Felles startpunkt (v1.218.208): første punkt på ruta til hovedstoppet —
 *  der rutetjenesten alt satte deg på veien — så alle ruter starter på samme vei. */
function _gangFra() { const p = approachPoints(); const f = p && p[0]; return f ? (Array.isArray(f) ? { lat: f[0], lon: f[1] } : f) : userLL(); }
import { ÆREND, ærendNå, ærendSteder, ÆREND_RADIUS_M } from '../aerend.js';
import { reiseRader, kombiRader } from '../reiseTil.js';
import { roPunkt } from '../roPunkt.js';
import { målområder } from '../maalomrader.js';
import { omrProbe } from '../api/omrProbe.js';
import { fetchNearbyPlaces } from '../api/places.js';
import { nesteSving, svingTekst, kursNå } from '../gangSteg.js';
export { stopsAhead, arriveText };
import config from '../config.js';
import { state } from '../state.js';
import { geocodePlace } from '../api/entur.js';
import { fetchNextDeparture, fetchBoard, fetchArrBoard, fetchTripFra, fetchTripFraPos, fetchBoardPage, hentStoppAvganger } from '../api/entur.js';
import { annetStopp, gåHitMål, rådGjelder, startGåHitSøk, rådReiseTekst } from '../gaaHit.js';
import { raskereHer } from '../raskere.js';
import { rangerMål, foldetSide } from '../maalModell.js';
import { overganger, arrBoardSpørsmål, ARR_BOARD_ASK } from '../overganger.js';
import { domFraKlasse, _DOM_KLASSE } from '../ui/reiselop.js';
import { NEXT_DEPARTURE_HORIZON_MINS, BOARD_WINDOW_MINS } from '../api/queries.js';
import { erNatt, radNøkkel, nesteEtter, sisteDom, ferdigeRetninger } from '../nattTrafikk.js';
import { predictDest, autoJumpDest, destRanking, vanestyrke, ferskhet, vaneMerke, vaneSetning, loadSmartHist }
  from '../api/smart.js';
import { sistReist } from '../api/eventLog.js';
import { erInnstilt } from '../innstilt.js';
import { plattformTekst } from '../bytte.js';
import { ombord, reiseMeta, iFart, gangGjelder, I_FART_NOTIS, stoppPåLinja, stoppFram, vedOgNeste, stoppEtterId, rangerKandidater } from '../api/ombord.js';
import { oppdaterLås } from '../api/ombordLaas.js';
import { journeyShapeCached, fetchJourneyShape } from '../api/entur.js';
import { turForm } from '../ui/turForm.js';
import { tavleUtvalg, tavleRadHtml, tavleDel, TAVLE_SIDE } from '../ui/tavleRad.js';
import { joinJourney } from '../journey.js';
import { logEvent, recentEvents } from '../api/eventLog.js';
import { loadConsent } from '../api/consent.js';
import { renderRouteShortcuts, relevanteSnarveier } from '../ui/favs.js';
import { approach } from '../trail.js';
import { renderAlertsInto, situationTitle, situationBody, sevClass, sevRank,
  SEVERITY_RANK } from '../ui/alerts.js';
import { byLine } from '../api/situations.js';
import { collectStopSituations } from '../api/situations.js';
import { logMsg } from '../ui/log.js';
import { lastHånd } from '../haand.js';
import { ankomstMs } from '../ankomst.js';
import { hensikt, hensiktLinje, sammeTur, reiseKall } from '../hensikt.js';
import { belegg, beleggTekst } from '../api/belegg.js';
import { fetchStoppLinjer, stoppLinjer, stoppInfo, nærViktigFørst, fetchNearbyStops } from '../api/stops.js';
import { kontekstNå, kontekstLinje, stedType, profil, vaneMatrise, hypoteseNå, nesteSpørsmål, settSted, avvisSted, svarReise } from '../profil.js';
import { depUses, usesOf, loadFreq, glemSted } from '../api/usage.js';
import { normMode } from '../api/stopCats.js';
import { loadAutoSort, saveAutoSort, NEAR_STOP_MAX_M, walkMinsTo, gangTil, userLL, minsToLeave, reachCls, posState, posNå, fartNå, loadWalkBuffer, saveWalkFrom, loadWalkFrom, clearWalkFrom, findNearestStation } from '../geo.js';
import { posBekreftelse } from '../position.js';
import { herLinjeHtml, stedPanelHtml, MANUELL_FLYTT_M } from '../ui/stedVelger.js';
import { stedNavn, stedMåling, målingLinje } from '../api/stedNavn.js';
import { åpneStedKart } from '../ui/stedKart.js';
import { bindPlaceInput } from '../ui/suggest.js';
import { metresBetween as _avst } from '../haversine.js';
import L from 'leaflet';
import { SPOR_ZOOM as PLATTFORM_ZOOM_AUTO, createMap, drawWalk, userDot, drawStopLine, ryddMerkelapper, bindMapExpand, fitExpandedMap, tømLag } from '../ui/map.js';
import { uthevAvgang, aktivFraAvgang } from '../ui/stasjonslag.js';
import { leggTil as leggTilVerktøy, sett as settVerktøy, leggTilLag, verktøyFlate } from '../ui/kartVerktoy.js';
import { plattformer as _plattformer, hentPlattformer as _hentPlattformer, plattformMedKode as _plattformMedKode } from '../api/quays.js';
import { innganger as _innganger, hentInnganger as _hentInnganger, valgtInngang as _valgtInngang } from '../api/innganger.js';
import { storage } from '../storage.js';
import { fraTider, settFraTid, fraDatoer, settFraDatoTid, KLOKKESLETT_VALG } from '../fraTider.js';
import { hjemStopp, gårHjemover, hjemDom, hjemFørsteEtapper, hjemRaskest, annetHjemStopp, hjemGange } from '../hjemover.js';
import { navTo } from '../ui/nav.js';
import { lagreLås, hentLås } from '../api/ombordLagring.js';
import { nesteReise, tilstand } from '../nesteReise.js';
import { nesteSvarFor, lærNesteSvar } from '../api/nesteSvar.js';
import { intervjuKlart, intervjuUtsett, målSpørsmål, avstigningSpørsmål } from '../intervju.js';
import { avstigningsStopp, påstigningsStopp } from '../api/avstigning.js';
import { antaAvstigning, venterAvstigning, svarAvstigning } from '../api/avstigningVent.js';
import { kandidatAv } from '../api/kandidat.js';
import { taOpp, lagreTuropptak } from '../api/turopptak.js';
import { kontekst, lærSvar, svarFor } from '../api/linjeSvar.js';
import { makeStopIcon } from '../ui/mapIcons.js';
import { ensureApproach, approachPoints, AT_STOP_M } from '../api/approach.js';
import { centreward, CENTRE_LABEL, sentrumFor } from '../api/centre.js';

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
        // TROMMELEN (v1.218.139): alle tidene, så raden kan rulles videre.
        alleTider: calls.slice(0, TROMMEL_MAKS).map(x => x.ms),
        // Hvilke av tidene over som er innstilt, slått opp på VERDI. Et
        // parallelt array av sannhetsverdier ville vært to lister som måtte
        // holdes i takt — og en sortering av den ene uten den andre ville
        // strøket feil avgang.
        innstiltMs: new Set(calls.filter(x => x.innstilt).map(x => x.ms)),
        // Hvilke tider som er SANNTID (v1.218.36), samme oppslag på verdi.
        sanntidMs: new Set(calls.filter(x => x.call && x.call.realtime).map(x => x.ms)),
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
  // Bybanen i Bergen (v1.218.41): trikkeraden heter det linjene her heter.
  const trikk = (dirs || []).map(d => d && d.call && d.call.serviceJourney && d.call.serviceJourney.line)
    .find(ln => ln && normMode(ln.transportMode) === 'tram');
  const ord = r => (r.key === 'tram' && trikk ? (modusOrd('tram', trikk.id) || '').replace(/^./, c => c.toUpperCase()) : r.label);
  return {
    asc: ord(use[0]),
    desc: ord(use[use.length - 1]),
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
// stopsAhead bor i src/ui/stoppVelger.js (v1.218.181), delt med avgangsdetaljene.

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
// arriveText bor i src/ui/stoppVelger.js (v1.218.181), re-eksportert under.

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
      mode,
      // Bybanen når trikkestoppene ligger i Bergen (v1.218.41). Et stopp har
      // ingen linje-id, men det har en plass.
      label: mode === 'tram' && (list || []).some(s => s && (s.modes || []).includes('tram')
        && (sentrumFor(s) || {}).by === 'Bergen') ? 'Bybanen' : label,
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
  // OM BORD (v1.218.48): «773 m» og «du nærmer deg den · ca 30 s» sto under
  // stasjonen toget skal til — en avstand til fots, og en gang-ETA, fra et
  // tog. Når toget er der, er svaret.
  const ombordAt = extra && Number.isFinite(extra.ombordAt) ? extra.ombordAt : null;
  // ANSLAG, IKKE MÅLING (v1.218.205): med en usikker posisjon er gangtida et
  // anslag — «ca.», dempet — og ringen på kartet viser usikkerheten. Ingen
  // setning om sensoren (godkjent mønster, AGENTS.md).
  const _ps = extra && extra.pos;
  const ca = !!(_ps && _ps.kind && !['ok', 'ingen-stopp'].includes(_ps.kind)) ? 'ca. ' : '';
  if (ombordAt != null) bits.push(extra.ombordHer ? 'toget står her' : 'toget er der ' + clk(ombordAt));
  else if (extra && extra.walkDist != null) bits.push(ca + extra.walkDist + (fart ? ' m' : ' m å gå'));
  else if (stop && stop.distM != null) bits.push(stop.distM + ' m');
  if (ombordAt == null && !fart && extra && extra.walkMins != null) bits.push(ca + extra.walkMins + ' min gange');
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
  const wayNote = (ombordAt == null && extra && extra.way === 'mot')
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
  // Bare det du kan gjøre noe med står som tekst (avslått, ikke støttet);
  // alder og nøyaktighet vises på kartet (v1.218.205).
  const note = ps && ['avslatt', 'utilgjengelig', 'tidsavbrudd', 'ikke-stottet'].includes(ps.kind) && ps.label
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
    ? '<span class="auto-stop-facts' + (ca ? ' auto-anslag' : '') + '">' + esc(bits.join(' \u00b7 ')) + '</span>' : '';
  // NESTE SVING (v1.218.192): bare ved beslutningspunkter, ikke på rette strekk.
  const svingNote = extra && extra.sving ? '<span class="auto-way-note auto-sving">' + esc(extra.sving) + '</span>' : '';
  const facts = factsLine + wayNote + svingNote + note;
  const name = esc((stop && stop.name) || '');
  // The name in its own element so it can be given an ellipsis. It used to be
  // a bare text node beside the caret, which is also why a browser probe that
  // swept ELEMENTS could not see it overflow — it had no box of its own.
  const head = '<span class="auto-stop-name">'
    + '<span class="auto-stop-label" title="' + name + '">' + name + '</span>'
    + (count > 0
      ? '<span class="auto-stop-more">' + (open ? '' : count + ' ')
        + (open ? '▴' : '▾') + '</span>'
      : '')
    + '</span>';
  // FAKTA UNDER, UTENFOR NAVNET (v1.218.30). Kart- og sorteringsknappene
  // flyter til høyre for overskriften; navnet står ved siden av dem, og
  // faktaene inni navnet ble brutt i den smale spalten («5 min / gange»).
  // Som egen blokk med clear:right starter de under knappene, i full bredde.
  // Kompakt om bord (v1.218.69): avstanden til fots er ikke spørsmålet.
  const under = facts && !(extra && extra.kompakt) ? '<div class="auto-stop-under">' + facts + '</div>' : '';
  const kl = 'auto-stop' + (extra && extra.kompakt ? ' kompakt' : '');
  if (!count) return '<div class="' + kl + '">' + head + '</div>' + under;
  return '<button class="' + kl + '" type="button" id="auto-stop-toggle"'
    + ' aria-expanded="' + (open ? 'true' : 'false') + '" aria-controls="auto-alts"'
    + ' aria-label="' + name + ', ' + count + ' holdeplasser i nærheten.'
    + ' Trykk for å ' + (open ? 'skjule' : 'vise') + '">'
    + head + '</button>' + under;
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
 * KANDIDATBASSENGET (v1.218.142). Analysen «Auto-reise i tette områder»:
 * kandidatene kom bare fra tavla til stoppet som står på skjermen. Gikk du
 * om bord på et annet stopp, eller kuttet en travel tavle linja di bort,
 * var turen din aldri kandidat. Bassenget holder turene fra stoppene du har
 * vært ved i BASSENG_MS, og dommen leser tavla OG bassenget.
 *
 * Rent: et Map fra turens id til { call, sett }.
 */
export const BASSENG_MS = 15 * 60_000;
/** Ruteformer hentet i tvil: de beste to, ikke fem (v1.218.142, hentebudsjett). */
export const TVIL_FORMER = 2;
export const BASSENG_MAKS = 400;
const _sisteAnkomst = c => {
  const ec = (c && c.serviceJourney && c.serviceJourney.estimatedCalls) || [];
  const t = ec.length ? ec[ec.length - 1] : c;
  return Date.parse((t && (t.expectedArrivalTime || t.aimedArrivalTime || t.expectedDepartureTime || t.aimedDepartureTime)) || '');
};
export function bassengInn(basseng, kall, nå) {
  (kall || []).forEach(c => {
    const id = c && c.serviceJourney && c.serviceJourney.id;
    if (id) basseng.set(id, { call: c, sett: nå });
  });
  return bassengUt(basseng, nå);
}
/** Beskjær: sett for lenge siden, eller turen er helt ferdig. Og et tak. */
export function bassengUt(basseng, nå) {
  for (const [id, v] of basseng) {
    const slutt = _sisteAnkomst(v.call);
    if (nå - v.sett > BASSENG_MS || (Number.isFinite(slutt) && slutt < nå)) basseng.delete(id);
  }
  if (basseng.size > BASSENG_MAKS) [...basseng.entries()].sort((a, b) => a[1].sett - b[1].sett)
    .slice(0, basseng.size - BASSENG_MAKS).forEach(([id]) => basseng.delete(id));
  return basseng;
}
/** Tavla først (den er ferskest), så bassengets turer som ikke står der. */
export function kandidatKall(rå, basseng, nå) {
  if (basseng) bassengUt(basseng, nå);
  const sett = new Set((rå || []).map(c => c && c.serviceJourney && c.serviceJourney.id));
  return [...(rå || []), ...[...((basseng && basseng.values()) || [])].map(v => v.call)
    .filter(c => !sett.has(c.serviceJourney.id))];
}
const _kandidatBasseng = new Map();

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
  return ombord({ spor, fartMS: fartNå(nå), kandidater: ombordKandidater(kandidatKall(_rå, _kandidatBasseng, nå), spor, _avvistOmbord) });
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
  // SPØR TIL DET ER BEKREFTET (v1.218.70). Rapportert: med en startet reise
  // sto bare «feil linje?» — ingen måte å si «riktig». Å starte en reise er
  // ikke å bekrefte linja; bare ditt svar er det. Bekreftet: en kvittering.
  const topp = '<div class="rett-linje">'
    + (lås.kilde === 'gjettet' ? '<span class="rett-gjettet">gjettet' + (grunn ? ' · ' + esc(grunn) : '') + '</span>' : '')
    + (erBekreftet(lås)
      ? '<span class="rett-bekreftet">✓ riktig linje og avgang</span>'
        + '<button type="button" class="rett-feil rett-endre" aria-expanded="' + (åpen ? 'true' : 'false') + '">endre</button></div>'
      : '<button type="button" class="rett-ja">✓ riktig linje</button>'
        + '<button type="button" class="rett-feil" aria-expanded="' + (åpen ? 'true' : 'false') + '">feil linje?</button></div>');
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
// FRIGJORT (v1.218.172): Auto-tavle er for deg til fots ved stoppene; reisen
// du sitter på eier Auto-reise. Én bryter avgjør hva tavla ser av reisen:
// ingen linje, ingen lås, fart bare fra GPS. Låsen selv røres ikke.
export function reiseSyn(autoTavle, { påLinja = null, lås = null, gpsFart = false } = {}) {
  if (autoTavle) return { påLinja: null, lås: null, fart: !!gpsFart, følger: false };
  return { påLinja, lås, fart: !!gpsFart || !!lås, følger: true };
}
function _følgerReise() { return !_autoTavle; }
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
  // REISEN GIR LÅSEN (v1.218.53): har du startet en reise og turen er blant
  // kandidatene, er det den — ikke et spørsmål.
  if (!_lås && state.jny) {
    const id = state.lockedJourneyId || (state.jny.legs && state.jny.legs[0] && state.jny.legs[0].journeyId);
    const k = id && (dom.kandidater || []).find(x => x.nøkkel === id);
    if (k) _lås = { k, kilde: 'valgt', stilleFra: null };
    // UTEN GPS-BEVIS (v1.218.90): reisen er startet og avgangen har gått —
    // da er det den, også når posisjonen er gammel eller står ved perrongen.
    if (!_lås) {
      const h = hensikt(state.jny, state.route, nå);
      const rk = h && h.fase === 'underveis' ? reiseKall(state.jny) : null;
      const kr = rk ? ombordKandidater([rk], state.posTrail || [], null)[0] : null;
      if (kr) _lås = { k: kr, kilde: 'reise', stilleFra: null };
    }
  }
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
  [_lås && _lås.k, ...(dom.kind === 'ombord-tvil' ? (_sisteRang || []).map(r => r.k).concat(dom.kandidater).slice(0, TVIL_FORMER) : [])]
    .filter(k => k && k.nøkkel && journeyShapeCached(k.nøkkel) === undefined)
    .forEach(k => { fetchJourneyShape(k.nøkkel).catch(() => {}); });
  const r = oppdaterLås(_lås, { låstK, vinner, vinnerKilde, fartMS: fartNå(nå), spor: state.posTrail || [],
    lang: state.posTrailLang, nå });
  if (r.hendelse) {
    const k = (r.lås && r.lås.k) || (_lås && _lås.k);
    logEvent('ombord', { svarte: r.hendelse, linje: k ? k.linje : '', handling: r.lås ? 'låst' : 'sluppet' }, null);
  }
  // HVOR DU GIKK AV, MÅLT (v1.218.101, api/avstigning.js): en tur appen så
  // deg ta, teller som en reise til stoppet du forlot den ved. Ikke for en
  // startet reise (`kilde 'reise'`): den ble talt da du trykket «på».
  if (!r.lås && _lås && _lås.kilde !== 'reise' && String(r.hendelse || '').startsWith('sluppet')) {
    lærAvstigning(_lås.k, state.posTrailLang && state.posTrailLang.length ? state.posTrailLang : (state.posTrail || []), r.hendelse);
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
  const grunn = _lås ? { linjer: [_lås.k.linje], k: _lås.k } : fri;
  // Låsen fra en startet reise leser rutetiden, ikke GPS-fiksen (v1.218.91):
  // en gammel fiks ved perrongen ville sagt «du er ved» stedet du dro fra.
  const fiks = _lås && _lås.kilde === 'reise' ? null : (state.posTrail || [])[(state.posTrail || []).length - 1];
  if (!grunn || !grunn.k) { _fokusN = 0; _fokusNesteId = null; return medVedOgNeste(grunn, nå, fiks); }
  // FOKUSET FØLGER TOGET (v1.218.47): passerer toget en stasjon, er stasjonen
  // du ser på én nærmere. Når den du så på er passert, er fokuset neste igjen.
  const nå0 = medVedOgNeste(grunn, nå, fiks, 0);
  // Utgangspunktet (ved- eller neste-stasjonen) er det fokuset telles fra.
  const nesteId = nå0 && nå0.base && nå0.base.id;
  _fokusN = justerFokus(_fokusN, _fokusNesteId, nesteId);
  _fokusNesteId = nesteId || null;
  const r2 = medVedOgNeste(grunn, nå, fiks, _fokusN);
  if (r2) _fokusN = r2.fokusN || 0;
  return r2;
}

/**
 * Registrer turen låsen fulgte, til stoppet du gikk av (v1.218.101).
 * Én gang per tur, og bare når stoppet er kjent og ikke er der du gikk på.
 */
const _avstigningLært = new Set();
export function lærAvstigning(k, spor, hendelse) {
  if (!k || !k.nøkkel || _avstigningLært.has(k.nøkkel)) return null;
  const av = avstigningsStopp(k, spor, hendelse);
  const på = påstigningsStopp(k);
  if (!av || !på || stopKey(av.name) === stopKey(på.name)) return null;
  _avstigningLært.add(k.nøkkel);
  // EN ANTAGELSE, IKKE EN REISE (v1.218.103): spørres om i intervjuet.
  const siste = (spor || [])[(spor || []).length - 1] || null;
  const påMs = (k.call && Date.parse(k.call.expectedDepartureTime || k.call.aimedDepartureTime)) || (siste && siste.at) || Date.now();
  antaAvstigning({ art: 'ny', fra: på.name, fraStopId: på.id, til: av.name, tilStopId: av.id,
    tilLat: av.lat, tilLon: av.lon, linje: k.linje, påMs, at: (siste && siste.at) || Date.now() });
  return av;
}

/** Toget passerte en stasjon: stasjonen i fokus er én nærmere. Ren. */
export function justerFokus(n, forrigeNesteId, nesteId) {
  return nesteId && forrigeNesteId && nesteId !== forrigeNesteId && n > 0 ? n - 1 : n;
}

/* Stasjonen i fokus om bord: antall stasjoner etter neste (v1.218.47).
 * Modulstate, ikke lagret — som _stopsShown. */
let _fokusN = 0;
let _fokusNesteId = null;
export function _settFokus(n) { _fokusN = Math.max(0, n | 0); }
export function _fokus() { return _fokusN; }

/**
 * «DU ER VED» + «NESTE STASJON» (v1.218.26): på én kjent tur leses begge fra
 * `vedOgNeste`, og stoppet tavla viser ER neste stasjon — samme kilde, så
 * raden og tavla ikke kan si hver sin ting. Uten én tur: uendret.
 */
export function medVedOgNeste(påLinja, nå, fiks, fokusN = 0) {
  if (!påLinja || !påLinja.k) return påLinja || null;
  const vn = vedOgNeste(påLinja.k, nå, fiks);
  if (!vn.neste) return null;
  /* BLA LANGS LINJA (v1.218.47): fokus `fokusN` stasjoner etter neste. Tavla,
   * overgangene og kortet følger `stop`; «neste stasjon» er fortsatt `neste`.
   * Går fokuset forbi endestasjonen, stopper det der. */
  // UTGANGSPUNKTET (v1.218.49): står toget VED en stasjon, er det der du er —
  // rapportert: «du er ved Godlia», men overskriften sa Skøyenåsen. Mellom
  // to stasjoner: neste, som før.
  const base = vn.ved || vn.neste;
  let n = Math.max(0, fokusN | 0), fokus = base;
  while (n > 0) { const f = stoppEtterId(påLinja.k, base.id, n, nå); if (f) { fokus = f; break; } n--; }
  return { ...påLinja, stop: fokus, neste: vn.neste, ved: vn.ved, forrige: vn.forrige, fokusN: n, base,
    fokusForrige: n > 0 ? (n === 1 ? base : stoppEtterId(påLinja.k, base.id, n - 1, nå)) : null,
    fokusEtter: stoppEtterId(påLinja.k, base.id, n + 1, nå) };
}

/** Navigasjonen langs linja under «neste stasjon» (v1.218.47). Ren. */
export function fokusNavHtml(p, nå, dest) {
  if (!p || !p.k || !p.stop || !p.neste) return '';
  const n = p.fokusN || 0;
  const min = Number.isFinite(p.stop.at) ? Math.max(0, Math.round((p.stop.at - nå) / 60000)) : null;
  // Ved neste stasjon står rollen alt i raden over; ikke si den to ganger.
  void min;
  // Antall stasjoner fram regnes fra der toget er: står det ved en, er den 0.
  const fram = n + (p.ved ? 0 : 1);
  const rolle = n === 0 ? '' : (fram === 1 ? 'neste stasjon' : 'om ' + fram + ' stasjoner') + (Number.isFinite(p.stop.at) ? ' · ' + clk(p.stop.at) : '');
  /* ÉN VEI TILBAKE (v1.218.50). Rapportert: «To knapper for å gå tilbake gir
   * ikke mening» — ‹ Skullerud og «↩ tilbake til Skullerud» gjorde det samme.
   * Nå: ‹ er ett steg. Først fra to steg ut blir midten selv hoppet hjem,
   * «↩ til Bogerud»; da gjør de to noe forskjellig. */
  const hjem = (p.base || p.ved || p.neste).name;
  // Målet for reisen din, når du blar dit (v1.218.52).
  const avHer = !!dest && n > 0 && stopKey(p.stop.name) === stopKey(dest);
  const midt = n >= 2
    ? '<button type="button" class="fokus-tilbake fokus-rolle" aria-label="Tilbake til ' + esc(hjem) + '">' + esc(avHer ? 'gå av her · ' + rolle : rolle) + '<br>↩ til ' + esc(hjem) + '</button>'
    : '<span class="fokus-rolle">' + esc(avHer ? 'gå av her · ' + rolle : rolle) + '</span>';
  return '<div class="fokus-nav">'
    + (p.fokusForrige ? '<button type="button" class="fokus-forrige" aria-label="Se ' + esc(p.fokusForrige.name) + '">‹ ' + esc(p.fokusForrige.name) + '</button>' : '<span></span>')
    + midt
    + (p.fokusEtter ? '<button type="button" class="fokus-etter" aria-label="Se ' + esc(p.fokusEtter.name) + '">' + esc(p.fokusEtter.name) + ' ›</button>' : '<span></span>')
    + '</div>';
}

/**
 * LINJE OG RETNING ØVERST (v1.218.69). Om bord svarer reiseappene først på
 * «hvilket tog sitter jeg på» — linjemerket og retningen. Det sto bare i
 * stripa nederst, avkortet. Ren.
 */
export function linjeHodeHtml(lås, jny) {
  if (!lås || !lås.k) return '';
  const k = lås.k;
  const front = k.front || (jny && jny.frontText) || '';
  return '<div class="ved-rad ved-linje">' + linjemerke({ kode: k.linje || (jny && jny.lineCode), farge: k.farge, linjeId: k.linjeId, modus: k.modus, logo: false })
    + (front ? ' <span class="ved-mot">mot ' + esc(front) + '</span>' : '') + '</div>';
}

/** Retningene uten toget du sitter på: det er ikke en avgang du skal rekke. Ren. */
export function utenEgetTog(dirs, egenId) {
  if (!egenId) return dirs || [];
  return (dirs || []).filter(d => !(d.calls || []).some(x => x && x.call && x.call.serviceJourney && x.call.serviceJourney.id === egenId));
}

/** Radene over stopphodet om bord. Tom uten én kjent tur. */
export function vedNesteHtml(påLinja, nå) {
  if (!påLinja || !påLinja.k || !påLinja.stop) return '';
  const her = påLinja.ved
    ? 'du er ved <b>' + esc(påLinja.ved.name) + '</b>'
    : påLinja.forrige
      ? 'mellom <b>' + esc(påLinja.forrige.name) + '</b> og <b>' + esc((påLinja.neste || påLinja.stop).name) + '</b>'
      : 'på vei til <b>' + esc((påLinja.neste || påLinja.stop).name) + '</b>';
  const ns = påLinja.neste || påLinja.stop;
  // KLOKKESLETT, OG «NÅ» BARE NÅR DET ER NÅ (v1.218.69). Rapportert: «neste
  // stasjon Skøyenåsen · nå» over «toget er der 09:04» — samme ankomst, to
  // svar. Én tid; stopphodet sier den ikke lenger om bord.
  const nåNå = Number.isFinite(ns.at) && ns.at - nå <= 30000;
  return '<div class="ved-neste">'
    + '<div class="ved-rad">' + her + '</div>'
    + '<div class="ved-rad"><span class="ved-merke">neste stasjon</span> <b>' + esc(ns.name) + '</b>'
    + (Number.isFinite(ns.at) ? ' · ' + (nåNå ? 'nå' : clk(ns.at)) : '') + '</div>'
    + '</div>';
}

/**
 * IKKE SPØR OM DET APPEN ALT VET (v1.218.53). Rapportert: med en startet
 * reise og en lås «bekreftet av deg» sto «DU ER PÅ EN AV DISSE» (2, 3, 4)
 * øverst. Ingen spørsmål når låsen er satt av deg, eller reisen er låsens tur.
 * Ren.
 */
/** Har du selv sagt at dette er linja og avgangen? Én definisjon (v1.218.70). Ren. */
export function erBekreftet(lås) {
  return !!(lås && lås.kilde === 'valgt');
}

export function trengerSvar(lås, jny, lockedId) {
  if (erBekreftet(lås)) return false;
  if (reiseAktiv(jny, lås, lockedId)) return false;
  return true;
}

function _renderOmbord() {
  const el = _el('auto-ombord');
  if (!el) return;
  const nå = Date.now();
  const dom = _ombordDom(nå);
  const html = _følgerReise() && trengerSvar(_lås, state.jny, state.lockedJourneyId) ? ombordKortHtml(dom, nå) : '';
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
export function whereLabel(fart, linjer, avstandM) {
  if (fart && linjer && linjer.length) return 'neste stopp på ' + linjer.join(' / ');
  // «Du er ved» bare når du står der (v1.218.197). Rapportert som
  // selvmotsigelse: «DU ER VED Olasrudveien · 605 m å gå».
  if (fart || (Number.isFinite(avstandM) && avstandM > AT_STOP_M)) return 'nærmeste stopp';
  return 'du er ved';
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

/** Kortet når turen du sitter på selv går dit (v1.218.48). Samme ramme og ×. */
function _bliSittendeKort(x, n) {
  const how = 'bli sittende' + (x.bliLinje ? ' på ' + x.bliLinje : '');
  return '<span class="auto-dest-rad" data-rad="' + esc(x.name) + '">'
    + '<button class="nearby-btn auto-dest" type="button" data-d="' + n + '"'
    + ' aria-label="' + esc(x.name + ', ' + how + ', framme ' + clk(x.bliSittende)) + '">'
    + '<span class="auto-dest-top">'
    + '<span class="auto-dest-name">' + esc(x.name) + '</span>'
    + '<span class="auto-dest-at">' + esc('framme ' + clk(x.bliSittende)) + '</span>'
    + '</span>'
    + '<span class="auto-dest-how">' + esc(how) + '</span>'
    + '</button>'
    + '<button class="auto-dest-del" type="button" data-glem="' + esc(x.name) + '"'
    + (x.id ? ' data-glem-id="' + esc(x.id) + '"' : '')
    + ' aria-label="' + esc('Glem ' + x.name) + '">\u00d7</button>'
    + '</span>';
}

/** Samme, på navn, når målet ikke har id. */
function _bliSittendeNavn(k, navn, nå) {
  if (!navn) return null;
  const sj = k && k.call && k.call.serviceJourney;
  const c = ((sj && sj.estimatedCalls) || []).find(x => {
    const sp = x.quay && x.quay.stopPlace;
    const t = new Date(x.expectedArrivalTime || x.aimedArrivalTime || x.expectedDepartureTime || 0).getTime();
    return sp && stopKey(sp.name) === stopKey(navn) && t > nå;
  });
  return c ? new Date(c.expectedArrivalTime || c.aimedArrivalTime || c.expectedDepartureTime).getTime() : null;
}

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

/**
 * GJELDER MÅLET TUREN DU SITTER PÅ? (v1.218.39)
 *
 * Rapportert: på linje 3 fra Bogerud mot sentrum sa appen «raskere å gå av på
 * Bøler: 3 07:43 → Mortensrud». Målet var kortet «dit du ofte skal» fra
 * stoppet — Mortensrud, der du KOM FRA. Turen kjører bort fra det, så å gå av
 * og snu blir alltid «raskere» enn å bli sittende til et sted turen aldri når.
 * Rådet gjelder bare et mål som ligger foran:
 *   - har turen alt vært innom målet, er det bak deg: nei;
 *   - skal turen selv innom det: ja;
 *   - ellers: bare når turen nærmer seg det (stoppet etter er nærmere enn neste).
 */
export function målForan(k, mål, nå, neste, etter) {
  if (!mål || !mål.id) return false;
  const sj = k && k.call && k.call.serviceJourney;
  const kall = (sj && sj.estimatedCalls) || [];
  const tid = x => new Date(x.expectedArrivalTime || x.aimedArrivalTime || x.expectedDepartureTime || x.aimedDepartureTime || 0).getTime();
  const her = x => x.quay && x.quay.stopPlace && x.quay.stopPlace.id === mål.id;
  if (kall.some(x => her(x) && tid(x) <= nå)) return false;
  if (kall.some(x => her(x) && tid(x) > nå)) return true;
  const ok = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon);
  if (!ok(mål) || !ok(neste) || !ok(etter)) return false;
  return metresBetween(etter, mål) < metresBetween(neste, mål);
}

/**
 * HENTEBUDSJETT (v1.218.142). En rask tur gjennom sentrum passerer et stopp
 * i minuttet, og hvert stopp kostet opptil 9 forespørsler uten tak. Det
 * dyreste og minst presserende — reisesøkene for «raskere å gå av» — venter
 * når budsjettet er brukt, og prøves igjen ved neste tikk. Rent.
 */
export const HENT_BUDSJETT_PR_MIN = 6;
export function budsjettTillater(logg, nå, n = 1) {
  while (logg.length && nå - logg[0] > 60_000) logg.shift();
  if (logg.length + n > HENT_BUDSJETT_PR_MIN) return false;
  for (let i = 0; i < n; i++) logg.push(nå);
  return true;
}
const _søkLogg = [];

/* ── GÅ HIT FOR Å KOMME DIT (v1.218.143, src/gaaHit.js) ─────────────── */
const _gåHit = new Map();   // målets stopId → { pos, at, råd, henter, feil }
let _gåHitVis = null;       // målet hvis gangrute står på kartet
let _gåHitSist = null;      // posisjonen ved forrige tegning
/** Et sprang lenger enn dette mellom to tegninger er et hopp, ikke en gåtur. */
export const GÅHIT_HOPP_M = 1000;
/**
 * BARE NÅR DU BER OM DET (v1.218.149). Rapportert: «Gå hit for å komme dit
 * gir ingen mening. Gir ikke relevant råd» — søket gikk av seg selv til de
 * to mest brukte målene, også Bergen sentrum fra Oslo. Valgt: rådet kommer
 * bare når du trykker «beste holdeplass?» på et kort.
 */
export const GÅHIT_AUTO = false;
const _gåHitBedt = new Map();   // målets stopId → navn
export function gåHitMålNå(freq, bedt) {
  return GÅHIT_AUTO ? gåHitMål(freq) : [...bedt.entries()].map(([stopId, name]) => ({ stopId, name }));
}
function _gåHitOppdater(pos, nå) {
  if (!pos) return;
  // Samme henting som Rute (v1.218.173, src/gaaHit.js).
  gåHitMålNå(loadFreq('arr'), _gåHitBedt).forEach(m => startGåHitSøk(_gåHit,
    { id: m.stopId, til: m.stopId, navn: m.name }, pos, nå,
    { hent: (p, til, t) => fetchTripFraPos(p, til, t, 3), tillat: t => budsjettTillater(_søkLogg, t, 1), avstand: metresBetween }));
}
/** Punktene kartet rammer inn for et valgt «gå hit»-kort. Ren; null uten råd. */
export function gåHitRamme(userPos, råd) {
  if (!råd || !Number.isFinite(råd.lat)) return null;
  return [userPos && Number.isFinite(userPos.lat) ? [userPos.lat, userPos.lon] : null, [råd.lat, råd.lon],
    ...(råd.gangPunkter || [])].filter(Boolean);
}
/** Kortene: bare der rådet er et annet stopp enn de du ser. */
export function gåHitKortHtml(liste, nå) {
  return liste.map(({ id, navn, råd }) => {
    const gå = råd.gangMin <= 0 ? 'gå til ' : 'gå ' + råd.gangMin + ' min til ';
    const how = gå + råd.stoppNavn + (råd.spor ? ' · spor ' + råd.spor : '');
    // Målet står alt som kortets tittel.
    const ta = rådReiseTekst(råd, null, clk);
    return '<button class="nearby-btn auto-dest auto-gaa' + (_gåHitVis === id ? ' valgt' : '') + '" type="button" data-gaa="' + esc(id) + '"'
      + ' aria-label="' + esc(navn + ': ' + how + ', ' + ta + ', framme ' + clk(råd.framme)) + '">'
      + '<span class="auto-dest-top"><span class="auto-dest-name">' + esc(navn) + '</span>'
      + (Number.isFinite(råd.framme) ? '<span class="auto-dest-at">' + esc('framme ' + clk(råd.framme)) + '</span>' : '') + '</span>'
      + '<span class="auto-gaa-hit">\u{1F6B6} ' + esc(how) + '</span>'
      + '<span class="auto-dest-how">' + esc(ta) + '</span>'
      + '</button>';
  }).join('');
}

function _raskereData(nå) {
  const mål = _kortRute && _kortRute.id;
  const neste = _lås && stoppFram(_lås.k, nå, 0);
  if (!mål || !neste || !neste.id || neste.id === mål || !Number.isFinite(neste.at)
    || !målForan(_lås.k, _kortRute, nå, neste, stoppFram(_lås.k, nå, 1))) { _rask = { key: null, svar: null }; return null; }
  const key = neste.id + '|' + _lås.k.nøkkel + '|' + mål;
  if (_rask.key !== key) {
    if (!budsjettTillater(_søkLogg, nå, 2)) return null;   // neste tikk
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
  // Profilen (v1.218.29) treffer på flere holdeplasser: alle innen gangavstand
  // fra hjem eller jobb, eller alle i sentrum. Ellers: navnet.
  const treff = typeof h.treff === 'function' ? h.treff : st => stopKey(st.name) === want;
  let best = null;
  dirs.forEach(d => {
    const ride = catchable(d, walkMins, now).find(r => stopsAhead(r.call, fromName, now).some(treff));
    if (ride && (!best || ride.ms < best.ride.ms)) {
      const stop = stopsAhead(ride.call, fromName, now).find(treff);
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

/* ── BRUKERPROFILEN I AUTO-REISE (v1.218.29, src/profil.js) ──────────── */
function _profilNå() {
  const hist = loadSmartHist();
  const p = profil(hist);
  return { p, m: vaneMatrise(hist, p) };
}
function _herSom() {
  return _stop ? { navn: _stop.name, stopId: _stop.id, lat: _stop.lat, lon: _stop.lon } : null;
}
/* Spørsmål du har sagt «senere» til, denne økta. */
const _profilSenere = new Set();
export function profilSpørsmålHtml(q) {
  if (!q) return '';
  return '<div class="profil-q">'
    + '<div class="set-label">' + (q.art === 'mål' || q.art === 'avstigning' ? 'om reisene dine' : 'om deg') + '</div>'
    + '<div class="profil-q-tekst">' + esc(q.tekst) + '</div>'
    + (q.grunn ? '<div class="neste-grunn">' + esc(q.grunn) + '</div>' : '')
    + '<div class="neste-svar"><button type="button" class="neste-ja profil-ja">ja</button>'
    + '<button type="button" class="neste-nei profil-nei">nei</button>'
    + '<button type="button" class="neste-nei profil-senere">senere</button></div>'
    + '</div>';
}
function _renderProfilQ(nå) {
  const el = _el('auto-profil');
  if (!el) return;
  // Ett spørsmål, og bare når du står stille: i fart og om bord er det
  // andre spørsmål som gjelder.
  if (_følgerReise() && _lås || iFart(fartNå(nå)) || _følgerReise() && (_ombordDom(nå).kind || '').startsWith('ombord')) { el.style.display = 'none'; return; }
  const { p, m } = _profilNå();
  // VED UJEVNE MELLOMROM (v1.218.100, src/intervju.js): profilen først, så
  // reisene i innstillinger du ikke har svart på.
  // Antatt avstigning FØRST og uten å vente på intervjuets pause: den gjelder
  // en bestemt tur, og svaret er ferskest nå (v1.218.103).
  const qa = avstigningSpørsmål(venterAvstigning(nå)).find(x => !_profilSenere.has(x.nøkkel)) || null;
  const q = qa || (intervjuKlart(nå)
    ? (nesteSpørsmål(p, m, nå, _profilSenere) || målSpørsmål(loadSmartHist(), nå).find(x => !_profilSenere.has(x.nøkkel)) || null)
    : null);
  const html = profilSpørsmålHtml(q);
  el.style.display = html ? '' : 'none';
  if (el.innerHTML === html) return;
  el.innerHTML = html;
  if (!q) return;
  const ferdig = () => { _profilSenere.add(q.nøkkel); intervjuUtsett(Date.now()); _renderProfilQ(Date.now()); };
  el.querySelector('.profil-ja').addEventListener('click', () => {
    if (q.art === 'reise') { svarReise(q.celle, q.type, true); ferdig(); return; }
    if (q.art === 'mål') { lærNesteSvar(q.h, +1); ferdig(); return; }
    if (q.art === 'avstigning') { svarAvstigning(q.obs.id, true); ferdig(); return; }
    // Holdeplassene innen gangavstand følger med, så hjem er «hjem» fra alle.
    const s = q.sted;
    const lagre = nær => { settSted(q.rolle, s, nær); ferdig(); };
    if (Number.isFinite(s.lat)) fetchNearbyStops(s.lat, s.lon).then(l => lagre(l || []), () => lagre([]));
    else lagre([]);
  });
  el.querySelector('.profil-nei').addEventListener('click', () => {
    if (q.art === 'reise') svarReise(q.celle, q.type, false);
    else if (q.art === 'mål') lærNesteSvar(q.h, -1);
    else if (q.art === 'avstigning') svarAvstigning(q.obs.id, false);
    else avvisSted(q.rolle, q.sted);
    ferdig();
  });
  el.querySelector('.profil-senere').addEventListener('click', ferdig);
}

function _renderNeste(nå) {
  const el = _el('auto-neste');
  if (!el) return;
  if (_følgerReise() && (_lås || (_ombordDom(nå).kind || "").startsWith("ombord"))) { el.style.display = "none"; return; }
  // PROFILEN FØRST (v1.218.29): hjem/jobb/sentrum for døgndelen du er i.
  // Uten noe der: vanen per mål, som før.
  const { p: prof, m: matr } = _profilNå();
  const h = kontekstNå(nå, _herSom(), prof, matr).neste || nesteReise({ nå, her: userLL(), rangering: at => destRanking(at), svar: nesteSvarFor });
  const nøkkel = h ? h.toName + '|' + h.bucket + '|' + h.helg : null;
  // Samme gangtid som lista bruker til «rekker du den?».
  const w = _stop ? gangTil(_stop) : null;
  const hit = h && _stop && tilstand(h, nå) === 'nær' ? vanligAvgang(_dirs, h, _stop.name, w ? w.mins : null, nå) : null;
  // Med en startet reise foreslås ikke andre (v1.218.90).
  const html = erReiseStartet(state.jny, state.route, nå) ? '' : nøkkel && nøkkel === _nesteAvvist ? ''
    : nesteReiseHtml(h, nøkkel && nøkkel === _nesteBesvart, { nå, hit, walkMins: w ? w.mins : null });
  el.style.display = html ? '' : 'none';
  if (el.innerHTML === html) return;
  el.innerHTML = html;
  const svar = tegn => () => { if (h.kilde === 'profil') svarReise(h.celle, h.type, tegn > 0); else lærNesteSvar(h, tegn); _nesteBesvart = nøkkel; if (tegn < 0) _nesteAvvist = nøkkel; _renderNeste(Date.now()); };
  const ja = el.querySelector('.neste-ja'), nei = el.querySelector('.neste-nei');
  if (ja) ja.addEventListener('click', svar(+1));
  if (nei) nei.addEventListener('click', svar(-1));
  // Trykk på kortet: retningen åpnes, med stoppene og ankomsten.
  const t = el.querySelector('.neste-tekst');
  if (t && hit) t.addEventListener('click', () => { _open = hit.dir; _renderBody(); });
}

/** Minste skriftstørrelse for holdeplassnavnet før det får «…». */
export const NAVN_MIN_PX = 18;
const _navnPx = new Map();   // navn|bredde → px, så tegningen hvert sekund ikke måler på nytt
/**
 * Krymp holdeplassnavnet til det får plass på én linje (v1.218.32), i stedet
 * for å bryte det eller skyve «7 ▾» ned. Starter fra CSS-størrelsen (som på
 * tavla) og går ned én piksel om gangen til NAVN_MIN_PX.
 */
export function tilpassNavn(lab) {
  if (!lab || !lab.isConnected) return;
  lab.style.fontSize = '';
  // Navneraden skal stå VED kart/sortering, ikke under: en <button> vil være
  // bred nok til hele teksten og hopper ellers ned under floaten. Bredden den
  // har, er plassen fram til knappene.
  const rad = lab.closest('.auto-stop');
  const ctl = typeof document !== 'undefined' && document.getElementById('auto-ctl');
  if (rad && rad.parentElement) {
    const venstre = rad.parentElement.getBoundingClientRect().left;
    const cr = ctl && ctl.offsetParent !== null ? ctl.getBoundingClientRect() : null;
    rad.style.maxWidth = cr && cr.width ? Math.max(0, Math.floor(cr.left - venstre - 8)) + 'px' : '';
  }
  // Bebas Neue lastes etter første tegning; målt med reserveskriften ble
  // «Jernbanetorget» til «JERNBANETORG…» da den kom (sett i proben). Om
  // skriftene er lastet hører derfor med i nøkkelen, så den måles på nytt.
  const fonter = typeof document !== 'undefined' && document.fonts ? document.fonts.status : '';
  const nøkkel = lab.textContent + '|' + (rad ? rad.style.maxWidth : '') + '|' + fonter;
  if (_navnPx.has(nøkkel)) {
    const v = _navnPx.get(nøkkel);
    if (v.under && rad) rad.style.maxWidth = '';
    if (v.px) lab.style.fontSize = v.px + 'px';
    return;
  }
  // Tekstens egen bredde, med desimaler. scrollWidth rundes til hele piksler,
  // og «JERNBANETORG…» sto på skjermen mens scrollWidth sa at det fikk plass.
  // Målt mot PLASSEN, ikke mot feltet: navnefeltet er like bredt som teksten
  // sin. Plassen er radens grense (knappene, eller hele bredden) minus «7 ▾».
  const forBred = () => {
    const r = document.createRange(); r.selectNodeContents(lab);
    const navn = lab.parentElement;
    const merke = navn && navn.querySelector('.auto-stop-more');
    const gap = navn ? parseFloat(getComputedStyle(navn).columnGap) || 0 : 0;
    const grense = rad && rad.style.maxWidth ? parseFloat(rad.style.maxWidth)
      : (rad && rad.parentElement ? rad.parentElement.clientWidth : Infinity);
    const plass = grense - (merke ? merke.getBoundingClientRect().width + gap : 0);
    return r.getBoundingClientRect().width > plass - 0.5;
  };
  const krymp = () => {
    lab.style.fontSize = '';
    let px = parseFloat(getComputedStyle(lab).fontSize) || 0, satt = 0;
    while (px > NAVN_MIN_PX && forBred()) {
      px = Math.max(NAVN_MIN_PX, px - 1); lab.style.fontSize = px + 'px'; satt = px;
    }
    return satt;
  };
  let satt = krymp();
  // Får det ikke plass ved knappene selv på minste størrelse, får navnet hele
  // bredden under dem — større skrift, uten «…».
  let under = false;
  if (rad && rad.style.maxWidth && forBred()) { rad.style.maxWidth = ''; satt = krymp(); under = true; }
  _navnPx.set(nøkkel, { px: satt, under });
}

/* ── «DU ER HER» (v1.218.197, onboarding steg 1) ─────────────────────────
   Bestilt: «har appen satt bruker på riktig sted? Dersom bruker er uenig må
   bruker kunne sette rett sted?» Linja over «du er ved»: påstand når
   posisjonen er god, spørsmål når den er usikker, «hvor er du?» uten. Panelet
   bak «ikke riktig?» setter stedet (walkFromLL), og stoppene hentes der. */
/* BEKREFTELSEN HUSKES (v1.218.203). Bestilt: «la bekreftelsen huskes til jeg
   flytter meg». Punktet du sa «ja» på lagres; ved oppstart på samme sted
   (innen 100 m, herTilstand) spør appen ikke igjen. */
export const HER_JA_KEY = 't.herBekreftet';
function _lesHerJa() { try { const v = JSON.parse(storage.get(HER_JA_KEY) || 'null'); return v && Number.isFinite(v.lat) ? v : null; } catch { return null; } }
function _lagreHerJa(v) { try { if (v) storage.set(HER_JA_KEY, JSON.stringify({ lat: v.lat, lon: v.lon })); else storage.remove(HER_JA_KEY); } catch { /* */ } }
let _herÅpen = false, _herJa = _lesHerJa(), _herAnker = null, _herKartVelg = false, _herSist = null;
/* USIKKERHET MED RO (v1.218.205). Bestilt: en svært usikker posisjon skal
   oppheve bekreftelsen — «men dersom en situasjon gir masse fluktueringer …
   så må det håndteres på en måte som skaper ro». Hysterese med ventetid:
   usikker først når det har vart USIKKER_INN_MS, sikker igjen først når det
   har vart SIKKER_UT_MS — og grensene er ulike (150 m inn, 60 m ut), så en
   nøyaktighet som bølger rundt én grense ikke flytter skjermen. Ren. */
export const USIKKER_INN_M = 150, SIKKER_UT_M = 60, USIKKER_INN_MS = 15_000, SIKKER_UT_MS = 45_000;
export function usikkerMedRo(forrige, ps, nå) {
  const f = forrige || { usikker: false, siden: null };
  const acc = ps && Number.isFinite(ps.acc) ? ps.acc : null;
  const grå = ps && ['gammel', 'borte', 'ukjent-alder', 'framskrevet'].includes(ps.kind);
  const vilUsikker = grå || (acc != null && acc > USIKKER_INN_M);
  const vilSikker = !grå && acc != null && acc < SIKKER_UT_M;
  const bytt = f.usikker ? vilSikker : vilUsikker;
  if (!bytt) return { usikker: f.usikker, siden: null };
  const siden = f.siden != null ? f.siden : nå;
  if (nå - siden >= (f.usikker ? SIKKER_UT_MS : USIKKER_INN_MS)) return { usikker: !f.usikker, siden: null };
  return { usikker: f.usikker, siden };
}
let _usikkerRo = null, _herRo = null, _herVist = null, _herNode = null, _herTrykk = false, _herVenter = false;

/** Skal «du er her»-linja stå? Bare når den sier noe prikken ikke sier. Ren. */
export function herVises({ manuell, kind, usikker, kartVelg }) {
  return !!(manuell || kartVelg || usikker || kind === 'ukjent');
}
export function herTilstand(ps, manuell, ja, gps, usikker = false) {
  let kind = posBekreftelse(ps, manuell);
  // MED RO (v1.218.212): spørsmålet kommer og går med hysteresen
  // (usikkerMedRo), ikke med hver fiks som krysser 100 m.
  if (kind === 'spørsmål' && !usikker) kind = 'påstand';
  // ALDRI SPØRSMÅL AV SEG SELV (v1.218.218). Rapportert: «App spør for ofte
  // om posisjonen er riktig. Blir for masete.» Proven (Apple, Google): appen
  // spør aldri — usikkerheten står på kartet (grå prikk, ring), og stedet
  // rettes ved å trykke på linja. Usikker gir påstand med «ca.» (herCa).
  if (kind === 'spørsmål') kind = 'påstand';
  // BEKREFTET (v1.218.202): «ja» — på påstanden eller spørsmålet — tar
  // spørsmålet bort til du har flyttet deg tydelig (100 m).
  if ((kind === 'spørsmål' || kind === 'påstand') && ja && gps && _avst(ja, gps) < 100) kind = 'bekreftet';
  // En bekreftelse holder ikke mot en posisjon som har vært svært usikker en stund (v1.218.205).
  if (kind === 'bekreftet' && usikker) kind = 'påstand';   // med «ca.», aldri spørsmål (v1.218.218)
  return kind;
}
/* ── HVA SKAL DU? (v1.218.207, steg 2a) ─────────────────────────────────
   Bestilt: «"hvor" er underordnet "hvorfor"». Ærendet først: et trykk på
   «🛒 handle mat» gir de nærmeste likeverdige stedene (åpne først), hvert
   med gangtid — et trykk på ett tegner gangen dit. «🔍 et sted …» for den
   som vet hvor. Stedene fra places.js (Geoapify + OpenStreetMap). */
let _hvaÆrend = null, _hvaSteder = null, _målSted = null, _hvaSøk = false;
/* FOLDET (v1.218.210). «De gir ikke noe mening slik de er nå»: valget
   endret ikke tavla under. Til svaret henger sammen med tavla, står bare en
   liten lenke; knappene åpnes ved trykk. */
let _hvaÅpen = false;
/** «Hva skal du?» på Auto-tavle. Av (v1.218.220): bestilt kuttet. */
export const HVA_PÅ = false;
/* STEG 2a (v1.218.211): «hvor skal du?» → reiser dit som rader. */
let _hvaReiser = null, _hvaValgt = 0, _hvaVisAlle = false, _hvaFeil = false;
const _klokke = ms => new Date(ms).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' });
function _velgSted(p) {
  _hvaSøk = false; _hvaÆrend = 'sted'; _målSted = { name: p.label || p.name, lat: p.lat, lon: p.lon, type: 'sted' };
  _hvaSteder = [_målSted]; _hvaReiser = 'henter'; _hvaValgt = 0; _hvaVisAlle = false;
  const fra = _gangFra(), mål = _målSted;
  if (!fra) { _hvaReiser = 'feil'; return; }
  fetchTripFraPos(fra, { lat: p.lat, lon: p.lon }, Date.now(), 6)
    .then(tps => { if (_målSted !== mål) return; _hvaReiser = tps; logMsg('hvor skal du: ' + tps.length + ' reiser til ' + mål.name); })
    .catch(e => { if (_målSted === mål) { _hvaReiser = 'feil'; logMsg('✗ hvor skal du: ' + (e && e.message), 'err'); } })
    .finally(() => { _herSist = null; _renderHer(); _aKey = ''; _renderMap(); });
}
/** Radene akkurat nå — én definisjon for lista og kartet. */
function _hvaRader() {
  if (!Array.isArray(_hvaReiser) || !_målSted) return [];
  const w = walkMinsTo(_målSted);
  return reiseRader(_hvaReiser, Date.now(), w ? w.mins : null);
}
function _hvaRadHtml(r, i) {
  const valgt = i === _hvaValgt;
  const merker = r.type === 'gå' ? '<span class="hva-gå">🚶</span>' : r.linjer.map(l => linjemerke({ kode: l.kode, farge: l.farge, tekst: l.tekst, modus: l.modus })).join('<span class="hva-pil">→</span>');
  const tall = r.type === 'gå' ? r.gangMin : Math.max(0, r.gåOm);
  const linje1 = r.type === 'gå' ? 'gå hele veien' : 'fra ' + esc(r.fra);
  const linje2 = r.type === 'gå' ? (walkMinsTo(_målSted) && !walkMinsTo(_målSted).målt ? 'ca. ' : '') + r.gangMin + ' min gange'
    : r.gangMin + ' min gange';
  const linje3 = 'ank. ' + _klokke(r.ank) + (r.type === 'gå' ? '' : ' · ' + (r.bytter ? r.bytter + ' bytte' : '')) + r.fakta.filter(f => !(f === 'ingen bytte' && false)).map(f => ' · ' + f).join('');
  return '<button type="button" class="hva-reise' + (valgt ? ' valgt' : '') + '" data-hva-r="' + i + '">'
    // Det store tallet er «gå om» — som tavla (én betydning, ikke gjentatt i teksten).
    + '<span class="hva-tall"><small>' + (r.type === 'gå' ? 'gå' : r.gåOm <= 0 ? 'gå' : 'gå om') + '</small><b>' + (r.type !== 'gå' && r.gåOm <= 0 ? 'nå' : tall) + '</b><small>' + (r.type !== 'gå' && r.gåOm <= 0 ? '' : 'min') + '</small></span>'
    + '<span class="hva-info"><span class="hva-l1">' + merker + ' ' + linje1 + '</span><span class="hva-l2">' + linje2 + '</span><span class="hva-l3">' + linje3.replace(' ·  · ', ' · ').replace(/ · $/, '') + '</span></span></button>';
}
function _hvaHtml() {
  if (_hvaSøk) return '<div class="hva"><div class="hva-rad"><input id="hva-sok" class="her-sok" type="search" autocomplete="off" placeholder="hvor skal du? sted, adresse …">'
    + '<button type="button" class="her-knapp her-stille" data-hva="lukk">avbryt</button></div><div id="hva-sugg" class="sugg-list" hidden></div></div>';
  if (!_hvaÆrend && !_hvaÅpen) return '<div class="hva"><button type="button" class="hva-lenke" data-hva="åpne">hva skal du? ▸</button></div>';
  if (!_hvaÆrend && !_hvaSøk) { _hvaSøk = true; return _hvaHtml(); }   // 2a: åpnet = feltet. Ærend-knappene venter på 2c.
  if (!_hvaÆrend) {
    return '<div class="hva"><div class="set-label">hva skal du?</div><div class="hva-chips">'
      + ærendNå().map(e => '<button type="button" class="hva-chip" data-hva="ærend:' + e.id + '">' + e.emoji + ' ' + esc(e.tekst) + '</button>').join('')
      + '<button type="button" class="hva-chip" data-hva="sted">🔍 et sted …</button></div></div>';
  }
  const e = ÆREND.find(x => x.id === _hvaÆrend);
  const hode = '<div class="hva-hode"><b>' + (e ? e.emoji + ' ' + esc(e.tekst) : '📍 ' + esc((_målSted && _målSted.name) || 'sted')) + '</b>'
    + '<button type="button" class="her-knapp her-stille" data-hva="lukk" aria-label="fjern">✕</button></div>';
  if (_hvaÆrend === 'sted') {
    let kropp;
    if (_hvaReiser === 'henter') kropp = '<div class="hva-tom">leter etter reiser …</div>';
    else if (_hvaReiser === 'feil') kropp = '<div class="hva-tom">fant ikke reiser nå — prøv igjen</div>';
    else {
      const rader = _hvaRader();
      kropp = rader.length ? rader.map(_hvaRadHtml).join('') : '<div class="hva-tom">ingen reiser dit den neste timen</div>';
    }
    return '<div class="hva">' + hode + kropp
      + '<button type="button" class="hva-lenke" data-hva="alle">' + (_hvaVisAlle ? '▾ skjul avgangene herfra' : '▸ alle avganger herfra') + '</button></div>';
  }
  if (_hvaSteder === 'henter') return '<div class="hva">' + hode + '<div class="hva-tom">leter i nærheten …</div></div>';
  if (_hvaSteder === 'feil') return '<div class="hva">' + hode + '<div class="hva-tom">fant ikke steder nå</div></div>';
  const liste = Array.isArray(_hvaSteder) ? _hvaSteder : [];
  if (!liste.length) return '<div class="hva">' + hode + '<div class="hva-tom">ingen innen ' + (ÆREND_RADIUS_M / 1000).toFixed(1).replace('.', ',') + ' km</div></div>';
  return '<div class="hva">' + hode + liste.map((p, i) => {
    const w = walkMinsTo(p);
    const valgt = _målSted && _målSted.lat === p.lat && _målSted.lon === p.lon;
    return '<button type="button" class="nearby-btn hva-sted' + (valgt ? ' picked' : '') + '" data-hva-i="' + i + '">'
      + '<span class="nearby-name">' + esc((p.emoji || '') + ' ' + p.name) + '<small class="hva-type">' + esc(p.type || '')
      + (p.hours && p.hours.label ? ' · ' + p.hours.label : '') + '</small></span>'
      + '<span class="nearby-dist">' + (w ? '🚶 ' + (w.målt ? '' : 'ca. ') + w.mins + ' min' : '') + '</span></button>';
  }).join('') + '</div>';
}
function _bindHva(el) {
  el.querySelectorAll('[data-hva]').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.hva;
    if (v === 'lukk') { _hvaÆrend = null; _hvaSteder = null; _målSted = null; _hvaSøk = false; _hvaÅpen = false; _hvaReiser = null; }
    else if (v === 'alle') { _hvaVisAlle = !_hvaVisAlle; }
    else if (v === 'åpne') { _hvaÅpen = true; }
    else if (v === 'sted') { _hvaSøk = true; }
    else if (v.startsWith('ærend:')) _velgÆrend(v.slice(6));
    _herSist = null; _renderHer(); _aKey = ''; _renderMap();
    if (_hvaSøk && el.querySelector('#hva-sok')) {
      const inp = el.querySelector('#hva-sok');
      if (inp) { inp.focus(); bindPlaceInput(inp, el.querySelector('#hva-sugg'), q => geocodePlace(q), r => {
        _velgSted(r);
        _herSist = null; _renderHer(); _aKey = ''; _renderMap(); }); }
    }
  }));
  el.querySelectorAll('[data-hva-r]').forEach(b => b.addEventListener('click', () => {
    _hvaValgt = Number(b.dataset.hvaR); _herSist = null; _renderHer(); _aKey = ''; _renderMap();
  }));
  // Resten av tavla foldes mens et sted er valgt — ikke kastet (AGENTS.md).
  const side = _el('auto-body') && _el('auto-body').parentElement;
  if (side) side.classList.toggle('hva-mål', _hvaÆrend === 'sted' && !_hvaVisAlle);
  el.querySelectorAll('[data-hva-i]').forEach(b => b.addEventListener('click', () => {
    const p = Array.isArray(_hvaSteder) && _hvaSteder[Number(b.dataset.hvaI)];
    if (!p) return;
    _målSted = p; _herSist = null; _renderHer(); _aKey = ''; _renderMap();
  }));
}
function _velgÆrend(id) {
  const e = ÆREND.find(x => x.id === id), ll = state.walkFromLL || state.homeLL;
  if (!e || !ll) return;
  _hvaÆrend = id; _hvaSteder = 'henter'; _målSted = null;
  fetchNearbyPlaces(ll.lat, ll.lon, e.kategorier, 8, ÆREND_RADIUS_M)
    .then(l => { if (_hvaÆrend !== id) return; _hvaSteder = ærendSteder(l); })
    .catch(() => { if (_hvaÆrend === id) _hvaSteder = 'feil'; })
    .finally(() => { _herSist = null; _renderHer(); });
}

function _renderHer() {
  const el = _el('auto-her');
  if (!el || _herÅpen) return;
  const manuell = !!state.walkFromLL;
  const ps = _posState();
  _usikkerRo = usikkerMedRo(_usikkerRo, ps, Date.now());
  const kind = herTilstand(ps, manuell, _herJa, state.homeLL, _usikkerRo.usikker);
  const wf = manuell ? loadWalkFrom() : null;
  // RO-PUNKTET (v1.218.212, src/roPunkt.js): adressen følger stedet du er,
  // ikke hver fiks (81D → 81C → 81D).
  if (!manuell && state.homeLL) _herRo = roPunkt(_herRo, { lat: state.homeLL.lat, lon: state.homeLL.lon, acc: ps && ps.acc }, Date.now());
  const oppslag = !manuell && _herRo ? stedNavn(_herRo, () => { _herSist = null; _renderHer(); }) : null;
  const navn = (wf && wf.label) || oppslag || (_stop ? 'nær ' + _stop.name : null);
  const flyttet = manuell && _herAnker && state.homeLL && _avst(_herAnker, state.homeLL) > MANUELL_FLYTT_M;
  // «ca.» bare fra hysteresen (v1.218.221): den rå 100 m-terskelen blafret.
  const ca = !manuell && _usikkerRo.usikker;
  const html = (_herKartVelg ? '<div class="her-linje her-spørsmål"><span class="her-tekst">Trykk i kartet der du er</span><button type="button" class="her-knapp her-stille" data-her="lukk">avbryt</button></div>' : herLinjeHtml({ kind, navn, acc: ps && ps.acc, flyttet, ca }))
    // «HVA SKAL DU?» KUTTET (v1.218.220). Bestilt: «Kutt hele denne funksjonen
    // nå.» Ikke tegnet; koden (2a-reisene, ærend) står, slått av med ett navn.
    + (!HVA_PÅ || kind === 'ukjent' || !_autoTavle ? '' : _hvaHtml());
  // KNAPPENE SVARER (v1.218.218). Rapportert: «knappene responderer ofte
  // ikke». innerHTML ble byttet hver gang _herSist ble nullet — også med lik
  // html — og en knapp byttet mellom finger ned og opp gir aldri et klikk.
  // Nå: byttes bare når html-en faktisk er en annen, og aldri mens en finger
  // er nede på linja (tegnes når den slippes).
  if (!el._herPeker) {
    el._herPeker = true;
    el.addEventListener('pointerdown', () => { _herTrykk = true; });
    const slipp = () => { if (!_herTrykk) return; _herTrykk = false; if (_herVenter) { _herVenter = false; setTimeout(_renderHer, 0); } };
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => el.addEventListener(t, slipp));
  }
  // SKJULT NÅR SIKKER NOK (v1.218.221). Bestilt: «Når du er sikker nok på
  // posisjon så kan du skjule denne linjen.» Prikken sier det samme; rett
  // stedet med et trykk på prikken (userDot påTrykk).
  const vis = herVises({ manuell, kind, usikker: ca, kartVelg: _herKartVelg });
  el.hidden = !vis;
  if (!vis) { _herSist = null; _herVist = null; if (el.firstChild) el.innerHTML = ''; _herNode = null; return; }
  _herSist = html;
  // Lik html OG våre egne noder (panelet/kartvelgeren kan ha byttet dem).
  if (html === _herVist && el.firstElementChild && el.firstElementChild === _herNode) return;
  if (_herTrykk) { _herVenter = true; return; }
  _herVist = html;
  el.innerHTML = html;
  _herNode = el.firstElementChild;
  _bindHer(el);
  _bindHva(el);
  if (_aMap && !_aMap._herKlikk) {
    _aMap._herKlikk = true;
    _aMap.on('click', e => { if (!_herKartVelg) return; _herKartVelg = false; _settSted('punkt i kartet', { lat: e.latlng.lat, lon: e.latlng.lng }); });
  }
}
function _bindHer(el) {
  el.querySelectorAll('[data-her]').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.her;
    if (v === 'ja') { _herJa = state.homeLL ? { lat: state.homeLL.lat, lon: state.homeLL.lon } : null; _lagreHerJa(_herJa); _herSist = null; _renderHer(); }
    else if (v === 'gps') { clearWalkFrom(); _herAnker = null; _herÅpen = false; _herSist = null; if (state.homeLL) _hentStoppVed(state.homeLL); _renderHer(); }
    else if (v === 'kart') { _herKartVelg = true; _herÅpen = false; _herSist = null; _renderHer(); }
    else if (v === 'lukk') { _herKartVelg = false; _herÅpen = false; _herSist = null; _renderHer(); }
    else if (v === 'velg') _åpneStedPanel();
  }));
}
/* KARTET MED FAST NÅL (v1.218.198) er døra; lista-panelet under står, foldet. */
function _åpneStedPanel() {
  const gps = state.homeLL ? { lat: state.homeLL.lat, lon: state.homeLL.lon } : null;
  const start = state.walkFromLL || gps || (_stop && Number.isFinite(_stop.lat) ? { lat: _stop.lat, lon: _stop.lon } : null);
  if (!start || typeof document === 'undefined') return _åpneStedListe(_el('auto-her'));
  const ps = _posState();
  åpneStedKart({ start, acc: ps && ps.acc, gps, nære: _stops().slice(0, 4), manuell: !!state.walkFromLL,
    navnFor: (ll, ferdig) => stedNavn(ll, ferdig, { logg: m => logMsg(m) }), søk: q => geocodePlace(q),
    målingFor: ll => stedMåling(ll), målingLinje,
    onVelg: (label, ll) => _settSted(label, ll),
    onGps: () => { clearWalkFrom(); _herAnker = null; _herSist = null; if (state.homeLL) _hentStoppVed(state.homeLL); _renderHer(); } });
}
function _åpneStedListe(el) {
  if (!el) return;
  _herÅpen = true;
  const nære = _stops().slice(0, 5).map(s => ({ ...s, distM: s.distM }));
  el.innerHTML = stedPanelHtml(nære, !!state.walkFromLL);
  _bindHer(el);
  el.querySelectorAll('[data-her-i]').forEach(b => b.addEventListener('click', () => {
    const s = nære[Number(b.dataset.herI)]; if (s) _settSted(s.name, s);
  }));
  bindPlaceInput(el.querySelector('#her-sok'), el.querySelector('#her-sugg'), q => geocodePlace(q), r => _settSted(r.label, r));
  const inp = el.querySelector('#her-sok'); if (inp) inp.focus();
}
/** Stedet du har valgt: walkFromLL (som «gå fra»), og stoppene hentes der. */
function _settSted(label, ll) {
  if (!ll || !Number.isFinite(ll.lat)) return;
  state.walkFromLL = { lat: ll.lat, lon: ll.lon };
  saveWalkFrom({ label, lat: ll.lat, lon: ll.lon });
  _herAnker = state.homeLL ? { lat: state.homeLL.lat, lon: state.homeLL.lon } : null;
  _herÅpen = false; _herSist = null;
  _hentStoppVed(ll);
  _renderHer();
}
function _hentStoppVed(ll) {
  findNearestStation(ll.lat, ll.lon, () => { _stopPinned = false; _dirs = []; _asked = false; renderAuto(); }, () => renderAuto());
}

function _renderWhere() {
  _renderHer();
  const el = _el('auto-where');
  if (!el) return;
  _renderNeste(Date.now());
  _renderProfilQ(Date.now());
  const list = _stops();
  _hentStoppInfo(list);
  const nåW = Date.now();
  const syn = reiseSyn(_autoTavle, { påLinja: _autoTavle ? null : _påLinjaMedLås(nåW), lås: _lås, gpsFart: iFart(fartNå(nåW)) });
  const påLinja = syn.påLinja;
  const picked = velgStoppIFart(pickStop(list, _stop, _stopPinned, _bandOf()), _stop, _stopPinned,
    påLinja, list);
  _stop = picked.stop;
  // A different stop is a different board. Without this the departures below
  // would keep belonging to the stop the reader has walked away from — and
  // the guard in renderAuto only refetches when _dirs is empty.
  if (picked.changed) { _dirs = []; _open = null; _asked = false; _nextMs = undefined; }
  if (!_stop) {
    el._sistHtml = null;
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
  const fart = syn.fart;
  const _way = (_stop && _stop.lat != null)
    ? approach(state.posTrail, { lat: _stop.lat, lon: _stop.lon })
    : { kind: 'vet-ikke', etaS: null };
  // posAgeMins already returns null while the fix is fresh (POS_STALE_MS), so
  // the threshold is not repeated here. One definition of "stale".
  // «Du er ved» er usant fra en buss i 40 km/t. «Nærmeste stopp» er sant.
  // Med «du er ved / neste stasjon» over er «neste stopp på 3» samme setning to ganger.
  const r = syn.følger ? reiseAktiv(state.jny, _lås, state.lockedJourneyId) : null;
  const fra = påLinja && (påLinja.base || påLinja.neste || påLinja.stop);
  _reiseInfo = r ? { r, igjen: fra ? stasjonerIgjen(r.k, fra.id, r.dest, nåW) : null } : null;
  const vn = picked.linjer ? (syn.lås ? linjeHodeHtml(syn.lås, state.jny) : '') + vedNesteHtml(påLinja, nåW) + (_reiseInfo ? avstigningHtml(r, _reiseInfo.igjen) : '')
    + fokusNavHtml(påLinja, nåW, r && r.dest) : '';
  const _html = (vn || '<div class="set-label">' + esc(whereLabel(fart, picked.linjer, w ? w.dist : null)) + '</div>')
    + stopHeadHtml(_stop, others.length, open, {
      iFart: fart,
      // OM BORD (v1.218.48): avstanden til fots er ikke spørsmålet når toget
      // kjører dit. Stopphodet sier når toget er der.
      // Når «neste stasjon» står over med klokkeslett, sier ikke stopphodet
      // det igjen (v1.218.69); det blir en liten linje med «▾ N» for holdeplassene.
      ombordAt: !(syn.lås && vn) && syn.lås && påLinja && påLinja.stop && Number.isFinite(påLinja.stop.at) ? påLinja.stop.at : null,
      kompakt: !!(syn.lås && vn),
      // Toget står ved stasjonen som vises (v1.218.49).
      ombordHer: !!(syn.lås && påLinja && påLinja.ved && påLinja.stop && påLinja.ved.id === påLinja.stop.id),
      walkDist: w ? w.dist : null,
      walkMins: w ? w.mins : null,
      pos: _posState(),
      // The same approach() the ranking used, asked about the stop it chose —
      // so the sentence and the choice cannot say different things.
      way: _way.kind,
      wayEtaS: _way.etaS,
      // Neste sving på gangruta til stoppet (v1.218.192) — bare til fots.
      sving: !fart && !syn.lås ? svingTekst(nesteSving(approachPoints(), userLL(), kursNå(state.posTrail)), _stop && _stop.name) : '',
    })
    // HVA APPEN TROR (v1.218.55): dag, del av døgnet, hvor du er og neste
    // reise, sagt — ikke bare brukt. Bare til fots; om bord sier raden over det.
    + (() => {
      if (picked.linjer) return '';
      // TAVLAS VALG FØRST (v1.218.85): en valgt reise eller tavlas mål sies
      // her, med avgang, spor, mål og når du må gå — før vanen.
      const h0 = hensikt(state.jny, state.route, nåW);
      const h = h0 && _kortRute && _kortRute.hensikt && Number.isFinite(_kortRute.ank) ? { ...h0, ank: _kortRute.ank } : h0;
      if (h) {
        const w = _stop ? gangTil(_stop) : null;
        const gåMs = h.avgang != null && w ? h.avgang - w.mins * 60000 : null;
        return '<div class="auto-kontekst auto-hensikt">' + esc(hensiktLinje(h, nåW, gåMs)) + '</div>';
      }
      const { p: pr, m: ma } = _profilNå();
      const linje = kontekstLinje(kontekstNå(nåW, _herSom(), pr, ma), nåW);
      return linje ? '<div class="auto-kontekst">' + esc(linje) + '</div>' : '';
    })()
    + (syn.følger ? rettLinjeHtml(_lås, _sisteKand, _feilÅpen, _gjettGrunn) : '')
    + (syn.lås ? raskereHtml(_raskereData(nåW)) : '')
    + (syn.lås ? overgangerHtml(_overgangerData(påLinja, nåW), (påLinja && påLinja.stop && påLinja.stop.name) || '', _ovÅpen) : '')
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
  // BYGG BARE NÅR NOE ER ENDRET (v1.218.70). Hodet ble skrevet på nytt hvert
  // sekund, så «✓ riktig linje» var en ny knapp hvert sekund — sett i proben:
  // trykket nådde aldri fram. Samme vakt som tavlas modusknapper.
  if (_html === el._sistHtml) return;
  el._sistHtml = _html;
  el.innerHTML = _html;

  tilpassNavn(el.querySelector('.auto-stop-label'));
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
  // Bla langs linja (v1.218.47), og veien tilbake.
  const fE = el.querySelector('.fokus-etter'), fF = el.querySelector('.fokus-forrige'), fT = el.querySelector('.fokus-tilbake');
  if (fE) fE.addEventListener('click', () => { _fokusN++; _renderWhere(); _renderBody && _renderBody(); });
  if (fF) fF.addEventListener('click', () => { _fokusN = Math.max(0, _fokusN - 1); _renderWhere(); _renderBody && _renderBody(); });
  if (fT) fT.addEventListener('click', () => { _fokusN = 0; _renderWhere(); _renderBody && _renderBody(); });
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
/* ROLIG KART (v1.218.150). Bestilt: «Kartets zoom, senterpunkt og innhold er
 * for ustabilt nå. Dersom bruker har justert noe må ikke systemet endre på
 * det av seg selv.» Knipe-zoom og hjul talte ikke som en justering (bare
 * dra gjorde), og rammen fulgte innholdsnøkkelen, som skifter hvert minutt.
 * En zoom eller flytting innen BRUKER_INPUT_MS etter en berøring, et hjul
 * eller en tast er din; appens egne setView/fitBounds er det aldri. */
export const BRUKER_INPUT_MS = 800;
let _aSisteInput = 0, _aProgrammatisk = false;
function _rammer(fn) { _aProgrammatisk = true; try { fn(); } finally { _aProgrammatisk = false; } }
/**
 * Hva som får kartet til å ramme inn på nytt — det du har bedt om, og
 * stoppet. IKKE minuttet, avgangene eller GPS-støy. Ren.
 */
export function rammeNøkkel({ stoppId, åpen, kort, gåHit, fokus, størrelse, gangTil }) {
  return [stoppId || '-', åpen || '-', kort || '-', gåHit || '-', fokus || '-', størrelse || '-'].join('|') + (gangTil ? '|g:' + gangTil : '');
}
let _aOpenKey = null;

/** Test seam: module state, and a test must be able to clear it. */
export function _resetAutoMap() {
  if (_aMap) { try { _aMap.remove(); } catch (_) {} }
  _aMap = null; _aLayer = null; _fokusKontroll = null; _kartFokus = 'oversikt'; _modiKontroll = null; _modiNøkkel = null; _aKey = ''; _aFitKey = ''; _aUserMoved = false;
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
 * EDDERKOPPKARTET (v1.218.61). Spurt: «Hvordan kan vi gi brukeren en god
 * oversikt over reisemulighetene i kartet i auto-reise?» Kartet svarte på
 * «hvor er jeg» og «hvor er stoppet», men ikke «hvor kan jeg reise herfra» —
 * retningene sto bare i lista. Plakaten ved holdeplassen (Ruter, TfL) er det
 * etablerte svaret: hver linje en farget strek ut fra stoppet, med nummer,
 * retning og neste avgang ved enden. Stoppene finnes alt i svaret
 * (`stopsAhead`); ingen nye oppslag. Rette streker mellom stopp — boardGQL
 * henter ikke pointsOnLink, som for den åpne linja.
 */
export const EDDERKOPP_MAKS = 5;
export const EDDERKOPP_STOPP = 6;
/** Hvor duset linja er fra sjette stopp til endestoppet (v1.218.64). */
export const EDDERKOPP_REST_OPASITET = 0.28;

/** Beina: én per retning, den foretrukne først, så etter neste avgang. Ren. */
// v1.218.63: avgangen på lappen er den første du REKKER, med samme regel som
// streken i lista (`catchable`). Rapportert: kartet sa «3 Kolsås 22:48» mens
// lista strøk 22:48 og viste 23:03 — 12 min gange, 6 min igjen.
export function edderkoppBein(dirs, stopName, now, foretrukket, walkMins = null, maks = EDDERKOPP_MAKS, o = {}) {
  // TELLEREN (v1.218.68): hvorfor en retning ikke ble et bein. Rapportert:
  // lista hadde fire retninger, kartet ingen — og ingenting sa hvorfor.
  const teller = o.teller || {};
  const tell = k => { teller[k] = (teller[k] || 0) + 1; };
  const nøkkel = d => (d.frontText || '') + '\u0000' + ((d.lines && d.lines[0] && (d.lines[0].id || d.lines[0].code)) || '');
  const fFront = foretrukket ? String(foretrukket).trim().toLowerCase() : null;
  return (dirs || [])
    .filter(d => d && d.call && Number.isFinite(d.nextMs))
    .map(d => ({ d, rides: catchable(d, walkMins, now), først: !!fFront && (d.frontText || '').trim().toLowerCase() === fFront }))
    .filter(x => { if (!x.rides.length) tell('ingenAvgang'); return x.rides.length; })
    .map(x => {
      // NESTE AVGANG SOM HAR STOPPENE (v1.218.68): den første du rekker kan
      // mangle koordinater; samme retning, samme strek, en senere tur.
      let alle = [], fant = false;
      for (const r of x.rides) {
        const a = stopsAhead(r.call, stopName, now, o.stopId || null);
        if (a.length) fant = true;
        alle = a.filter(st => st.lat != null && st.lon != null);
        if (alle.length >= 2) break;
      }
      if (alle.length < 2) tell(fant ? 'utenKoord' : 'ikkeFunnet');
      return { ...x, ride: x.rides[0], alle };
    })
    .sort((a, b) => (b.først - a.først) || (a.ride.ms - b.ride.ms))
    .map(({ d, ride, rides, alle }) => {
      const stopp = alle.slice(0, EDDERKOPP_STOPP);
      // RESTEN AV LINJA (v1.218.64), fra sjette stopp til endestoppet: tegnes
      // dusere. Starter PÅ sjette stopp, så de to strekene henger sammen.
      const rest = alle.slice(EDDERKOPP_STOPP - 1);
      const l = (d.lines && d.lines[0]) || {};
      const { color, mode } = openLine(d);
      return { key: nøkkel(d), dir: d, farge: color, modus: mode || l.mode || null, kode: l.code || null,
        linjeId: l.id || null, tekst: l.tekst || null, front: d.frontText, ms: ride.ms, stopp,
        // Sporet avgangen går fra (v1.218.81): beinet starter der.
        spor: (ride.call && ride.call.quay && ride.call.quay.publicCode) || null,
        // Turens id, for veiformen (v1.218.98).
        jid: (ride.call && ride.call.serviceJourney && ride.call.serviceJourney.id) || null,
        // De neste du rekker, til lappens høyeste nivå (v1.218.65).
        tider: rides.slice(0, 3).map(r => r.ms),
        rester: rest.length >= 2 ? [rest] : [] };
    })
    .filter(b => b.stopp.length >= 2)
    .reduce((acc, b) => slåSammenBein(acc, b), [])
    .slice(0, maks);
}

/**
 * KUTTET (v1.218.83): så mange bein som kartet har plass til, men hvert
 * transportmiddel får minst ett — det første av sitt slag. Ellers i den
 * rekkefølgen beina har. Ren.
 */
export function velgBein(bein, maks) {
  const liste = bein || [];
  if (liste.length <= maks) return liste.slice();
  const sett = new Set(), førsteAvSlag = new Set();
  liste.forEach((b, i) => { const m = normMode(b.modus) || 'bus'; if (!sett.has(m)) { sett.add(m); førsteAvSlag.add(i); } });
  const valgt = new Set([...førsteAvSlag].slice(0, maks));
  for (let i = 0; i < liste.length && valgt.size < maks; i++) valgt.add(i);
  return liste.filter((_, i) => valgt.has(i));
}

/**
 * ETT BEIN PER LINJE OG KORRIDOR (v1.218.62). «3 Stortinget», «3 Kolsås» og
 * «3 Avløs» fulgte samme strek og sa det samme tre ganger. Samme linje og
 * samme to første stopp er samme bein: det lengste tegnes, retningene samles,
 * og den tidligste avgangen står. Motsatt retning har andre første stopp og
 * forblir sitt eget. Ren; rekkefølgen fra kalleren beholdes.
 */
export function slåSammenBein(acc, b) {
  const korridor = x => (x.linjeId || x.kode || '') + '|' + x.stopp.slice(0, 2).map(s => s.id || s.name).join('>');
  const k = korridor(b);
  const før = acc.find(x => korridor(x) === k);
  if (!før) { acc.push({ ...b, fronter: [b.front] }); return acc; }
  if (!før.fronter.includes(b.front)) før.fronter.push(b.front);
  if (b.stopp.length > før.stopp.length) før.stopp = b.stopp;
  // Grenene beholdes hver for seg: Kolsås og Stortinget deler korridoren, men
  // ender ulike steder, og begge endene er en del av hvor du kan reise.
  før.rester = (før.rester || []).concat(b.rester || []);
  før.tider = [...new Set([...(før.tider || []), ...(b.tider || [])])].sort((x, y) => x - y).slice(0, 3);
  if (b.ms < før.ms) { før.ms = b.ms; før.dir = b.dir; }
  return acc;
}

/** Retningene på lappen, avkortet: plakaten har plass til et blikk, ikke en setning. Ren. */
export const LAPP_TEGN = 14;
export function lappFronter(fronter) {
  const t = (fronter || []).join(' · ');
  return t.length > LAPP_TEGN ? t.slice(0, LAPP_TEGN - 1).replace(/[\s·]+$/, '') + '…' : t;
}

/**
 * Hvor lappen står: UTOVER, bort fra stoppet — i skjermpiksler, så kartets
 * rotasjon og breddegrad ikke lurer den. Et bein nedover fikk lappen tilbake
 * oppå seg selv og «du er ved». Ren.
 */
export function lappRetning(fra, til) {
  const dx = til.x - fra.x, dy = til.y - fra.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'bottom' : 'top';
}
/**
 * LAPPENE SKALERER (v1.218.65). Bestilt: «skalere opp og ned hvilke lapper
 * som vises, og detaljgraden for hver lapp basert på zoom-nivå, kartstørrelse
 * og antall linjer». Én trapp, fra ingenting til alt; størrelsene er anslag
 * (`ryddMerkelapper` tar det trappa bommer på).
 *   0 ingen lapp · 1 merket · 2 + neste tid · 3 + retning · 4 tre tider, hel retning
 */
export const LAPP_NIVÅ = [
  { b: 0, h: 0 }, { b: 34, h: 18 }, { b: 80, h: 18 }, { b: 100, h: 32 }, { b: 160, h: 32 },
];
/** Andelen av kartflaten lappene får dekke. */
export const LAPP_ANDEL = 0.15;
/** Den viktigste lappen viser alltid minst neste avgang du rekker. */
export const LAPP_GULV_FØRST = 2;

/** Høyeste nivå zoomen tillater. Ren. */
export function nivåTak(zoom) {
  if (!Number.isFinite(zoom)) return 3;
  return zoom < 12 ? 1 : zoom < 14 ? 2 : zoom < 16 ? 3 : 4;
}

/**
 * Nivå per bein. Alle starter på taket; så lenge lappene dekker mer enn
 * budsjettet, senkes det minst viktige (det siste) ett hakk — helt til 0 før
 * det neste røres. Rekkefølgen er alt viktigheten: kortets retning, så
 * avgangen du rekker. Ren.
 */
export function lappNivåer(bein, { bredde, høyde, zoom }) {
  const tak = nivåTak(zoom);
  const n = (bein || []).length;
  const nivå = Array(n).fill(tak);
  if (n) nivå[0] = Math.max(tak, LAPP_GULV_FØRST);
  const budsjett = Math.max(0, bredde || 0) * Math.max(0, høyde || 0) * LAPP_ANDEL;
  const flate = () => nivå.reduce((s, v) => s + LAPP_NIVÅ[v].b * LAPP_NIVÅ[v].h, 0);
  // Gulv 1 for alle (v1.218.115): hver linje har minst merket sitt.
  const gulv = i => (i === 0 ? LAPP_GULV_FØRST : 1);
  while (flate() > budsjett) {
    let i = n - 1;
    while (i >= 0 && nivå[i] <= gulv(i)) i--;
    if (i < 0) break;
    nivå[i]--;
  }
  return nivå;
}

/** Hvor mange bein kartet bærer: strekene er billige, lappene trenger plass. Ren. */
export function beinMaks(bredde, høyde) {
  const flate = Math.max(0, bredde || 0) * Math.max(0, høyde || 0);
  return Math.max(4, Math.min(8, Math.round(flate / 30000)));
}

/**
 * Hvor på beinet lappen står (v1.218.65): det siste stoppet som er godt
 * innenfor kartet. Zoomet inn lå sjette stopp utenfor rammen, og lappen ble
 * kuttet eller borte. Ingen synlige: første stopp, nærmest deg. Ren.
 */
export function lappAnker(stopp, erSynlig) {
  for (let i = (stopp || []).length - 1; i >= 0; i--) if (erSynlig(stopp[i])) return stopp[i];
  return (stopp || [])[0] || null;
}

/** Får en lapp b×h plass i kartet W×H, satt utover fra stoppet? Ren. */
/** Rektangelet en lapp b×h dekker, satt mot `side` fra punktet. Ren (v1.218.115). */
export function lappRekt(pt, r, b, h) {
  const m = 8;
  return {
    venstre: pt.x - (r === 'left' ? b + m : r === 'right' ? 0 : b / 2),
    høyre: pt.x + (r === 'right' ? b + m : r === 'left' ? 0 : b / 2),
    topp: pt.y - (r === 'top' ? h + m : r === 'bottom' ? 0 : h / 2),
    bunn: pt.y + (r === 'bottom' ? h + m : r === 'top' ? 0 : h / 2),
  };
}
const _kolliderer = (a, liste) => (liste || []).some(r => a.venstre < r.høyre && a.høyre > r.venstre && a.topp < r.bunn && a.bunn > r.topp);

/**
 * EN LAPP PER LINJE, SPREDT (v1.218.115). Bestilt: «Gi alle linjene en lapp
 * på kartet, men spred de ut for å unngå overlapp.» Lappene plasseres én og
 * én, viktigst først, og hver plassert lapp er et hinder for de neste.
 * Ingen plass på nivået: et lavere nivå, ned til 1 (bare merket). Fortsatt
 * ingen: lappen står ved sitt naturlige stopp, og kan da overlappe — hver
 * linje skal ha sin lapp. Ren.
 *
 * @param {number} n antall bein
 * @param {{nivå:(i)=>number, kandidater:(i)=>Array, rekt:(i,st,side,niv)=>object|null,
 *   naturlig:(i,st)=>string, tvungen:(i)=>{stopp,side}, hindre:Array}} o
 *   rekt gir null når lappen går utenfor kartet
 * @returns {Array<{stopp, side, nivå, tvunget, rekt}>}
 */
/** Avstand fra kartkanten en lapp må holde (v1.218.115). */
export const LAPP_KANT = 6;
export function plasserLapper(n, o) {
  const brukt = [];
  const ut = [];
  for (let i = 0; i < n; i++) {
    let funnet = null;
    for (let niv = Math.max(1, o.nivå(i)); niv >= 1 && !funnet; niv--) {
      const p = lappPlass(o.kandidater(i), (st, side) => {
        const r = o.rekt(i, st, side, niv);
        return !!r && !_kolliderer(r, (o.hindre || []).concat(brukt));
      }, st => o.naturlig(i, st));
      if (p) funnet = { ...p, nivå: niv, tvunget: false, rekt: o.rekt(i, p.stopp, p.side, niv) };
    }
    if (!funnet) {
      const t = o.tvungen(i);
      funnet = { stopp: t.stopp, side: t.side, nivå: 1, tvunget: true, rekt: o.rekt(i, t.stopp, t.side, 1) };
    }
    if (funnet.rekt) brukt.push(funnet.rekt);
    ut.push(funnet);
  }
  return ut;
}

export function lappPasser(pt, stopPt, b, h, W, H, hindre = [], side = null) {
  const r = side || lappRetning(stopPt, pt);
  const { venstre, høyre, topp, bunn } = lappRekt(pt, r, b, h);
  if (!(venstre >= 0 && høyre <= W && topp >= 0 && bunn <= H)) return false;
  // HINDRENE (v1.218.66): zoomknappene, fullskjermknappen og kreditteringen.
  // Bestilt: «Flytt lappene bort fra zoomknappene.»
  return !(hindre || []).some(r => venstre < r.høyre && høyre > r.venstre && topp < r.bunn && bunn > r.topp);
}

/**
 * HOLDEPLASSLAPPEN (v1.218.66). Bestilt: den skal ikke synes før man har
 * zoomet inn litt, og ikke dekke kartdetaljene for holdeplassen. Utzoomet
 * står navn og gangtid alt i hodet over kartet; på kartet er det støy.
 */
export const STOPP_LAPP_ZOOM = 14;
/** Fra plattformzoom står lappen så langt ut at plattformer og innganger synes. */
export const STOPP_LAPP_AVSTAND_NÆR = 44;

/**
 * Plassen for en lapp på beinet (v1.218.66): siste stopp der den passer på
 * sin naturlige side (utover), ellers på en annen side. Ingen plass noe sted:
 * null — da står ingen lapp, heller enn at den dekker en knapp. Ren.
 */
export function lappPlass(stopp, passer, naturlig) {
  const sider = ['top', 'bottom', 'right', 'left'];
  for (let i = (stopp || []).length - 1; i >= 0; i--) {
    const n = naturlig(stopp[i]);
    if (passer(stopp[i], n)) return { stopp: stopp[i], side: n };
  }
  for (let i = (stopp || []).length - 1; i >= 0; i--) {
    for (const r of sider) if (passer(stopp[i], r)) return { stopp: stopp[i], side: r };
  }
  return null;
}

/** Siden med færrest bein ut fra stoppet — der lappen dekker minst. Ren. */
export function stoppLappSide(stopPt, endePts, passer = () => true) {
  const tell = { top: 0, bottom: 0, right: 0, left: 0 };
  // Vekt (v1.218.66): beinet til den viktigste avgangen teller mer — der skal
  // linjelappen stå, og holdeplasslappen vike.
  (endePts || []).forEach(p => { tell[lappRetning(stopPt, p)] += (p.vekt || 1); });
  const sider = ['top', 'bottom', 'right', 'left'];
  const kandidater = sider.filter(passer);
  return (kandidater.length ? kandidater : sider).reduce((best, r) => (tell[r] < tell[best] ? r : best));
}

/** Forskyvningen for en side og en avstand. Ren. */
export function lappForskyv(side, avstand) {
  return { top: [0, -avstand], bottom: [0, avstand], left: [-avstand, 0], right: [avstand, 0] }[side];
}

/**
 * AV/PÅ PER TRANSPORTMIDDEL (v1.218.67). Bestilt med skjermbilde: knapper i
 * kartets tomme venstre kant for å vise/skjule T-bane, trikk, buss, tog —
 * de som er relevante her. Samme piller som tavlekartet (`.mode-pill`), men
 * eget valg: tavlas filter er en annen skjerm.
 */
export const MODI_REKKEFØLGE = ['metro', 'tram', 'rail', 'bus', 'water'];
const MODI_NAVN = { metro: 'T-bane', tram: 'Trikk', rail: 'Tog', bus: 'Buss', water: 'Båt' };
const SKJULT_NØKKEL = 't.autoKartSkjult';

/** Står lag-knappen? Bare når det er noe å velge. Ren. */
export function lagSynlig(modi) { return Array.isArray(modi) && modi.length > 0; }

/** Transportmidlene på beina, med antall; tom under to (ingenting å velge). Ren. */
export function kartModi(bein) {
  const tell = new Map();
  (bein || []).forEach(b => { const m = normMode(b.modus) || 'bus'; tell.set(m, (tell.get(m) || 0) + 1); });
  const ut = [...tell.entries()].map(([modus, antall]) => ({ modus, antall }))
    .sort((a, b) => (MODI_REKKEFØLGE.indexOf(a.modus) + 99) % 99 - (MODI_REKKEFØLGE.indexOf(b.modus) + 99) % 99);
  return ut.length >= 2 ? ut : [];
}

/** Beina uten de skjulte transportmidlene. Ren. */
/** Transportmiddelet filteret i lag-panelet bruker. ÉN regel for kart og liste (v1.218.108). */
export function filterModus(modus) { return normMode(modus) || 'bus'; }
export function filtrerBein(bein, skjult) {
  const s = skjult instanceof Set ? skjult : new Set(skjult || []);
  return (bein || []).filter(b => !s.has(filterModus(b.modus)));
}
/**
 * Samme filter på retningene (v1.218.108). Bestilt: «La filterknappen for
 * ruter og linjer i kartet også filtrere listen over avganger i Auto-tavla.»
 */
export function filtrerRetninger(dirs, skjult) {
  const s = skjult instanceof Set ? skjult : new Set(skjult || []);
  return (dirs || []).filter(d => !s.has(filterModus(d.lines && d.lines[0] && d.lines[0].mode)));
}

/**
 * FILTER PER LINJE (v1.218.110). Bestilt: «Legg til filter per enkeltlinje i
 * kartet.» Én nøkkel for en linje, for beina og for lista: linjens id, ellers
 * nummeret. Ren.
 */
export const LINJE_SKJULT_NØKKEL = 't.autoKartSkjulteLinjer';
export function linjeNøkkel(id, kode) { return id || (kode != null ? 'kode:' + kode : null); }
/** Retningene som «bein»-form for filteret: transportmiddel og linje. Ren. */
export function filterValg(dirs) {
  return (dirs || []).map(d => { const l = (d.lines && d.lines[0]) || {};
    return { modus: l.mode || null, linjeId: l.id || null, kode: l.code || null, farge: l.colour ? '#' + String(l.colour).replace(/^#/, '') : null, tekst: l.tekst || null }; })
    .filter(b => b.kode || b.linjeId);
}
export function kartLinjer(bein) {
  const sett = new Map();
  (bein || []).forEach(b => { const k = linjeNøkkel(b.linjeId, b.kode); if (k && !sett.has(k)) sett.set(k, { nøkkel: k, kode: b.kode, farge: b.farge, tekst: b.tekst, linjeId: b.linjeId, modus: b.modus }); });
  const ut = [...sett.values()].sort((a, b) => String(a.kode).localeCompare(String(b.kode), 'nb', { numeric: true }));
  return ut.length >= 2 ? ut : [];
}
export function utenSkjulteLinjerBein(bein, skjult) {
  const s = skjult instanceof Set ? skjult : new Set(skjult || []);
  return (bein || []).filter(b => !s.has(linjeNøkkel(b.linjeId, b.kode)));
}
export function utenSkjulteLinjerRetninger(dirs, skjult) {
  const s = skjult instanceof Set ? skjult : new Set(skjult || []);
  return (dirs || []).filter(d => { const l = (d.lines && d.lines[0]) || {}; return !s.has(linjeNøkkel(l.id, l.code)); });
}
/**
 * LINJENE FØLGER TRANSPORTMIDDELET (v1.218.113). Rapportert: «Velges bort
 * tbane bør også de tbane linjene filtreres bort, samme for andre
 * transportmodi.» En linje er synlig bare når både transportmiddelet og
 * linja er på. Ren.
 */
export function linjeSynlig(l, skjulteModi, skjulteLinjer) {
  return !skjulteModi.has(filterModus(l.modus)) && !skjulteLinjer.has(l.nøkkel);
}
/**
 * Et trykk på en linje. Er transportmiddelet av, slås det på med BARE denne
 * linja synlig — det er det et trykk på én linje betyr. Ellers av/på. Ren.
 */
export function trykkLinje(nøkkel, linjer, skjulteModi, skjulteLinjer) {
  const modi = new Set(skjulteModi), sl = new Set(skjulteLinjer);
  const l = (linjer || []).find(x => x.nøkkel === nøkkel);
  const m = l ? filterModus(l.modus) : null;
  if (m && modi.has(m)) {
    modi.delete(m);
    linjer.filter(x => filterModus(x.modus) === m).forEach(x => (x.nøkkel === nøkkel ? sl.delete(x.nøkkel) : sl.add(x.nøkkel)));
  } else if (sl.has(nøkkel)) sl.delete(nøkkel);
  else sl.add(nøkkel);
  return { modi, linjer: sl };
}

function _skjulteLinjer() {
  try { return new Set(JSON.parse(storage.get(LINJE_SKJULT_NØKKEL) || '[]')); } catch { return new Set(); }
}

function _skjulteModi() {
  try { return new Set(JSON.parse(storage.get(SKJULT_NØKKEL) || '[]')); } catch { return new Set(); }
}

// null, ikke '' (v1.218.92): en tom liste ga også '', og første tegning returnerte før knappen ble skjult.
let _modiKontroll = null, _modiNøkkel = null;
function _tegnModiKnapper(modi, linjer = []) {
  if (!_aMap) return;
  // BAK «LAG»-KNAPPEN I VERKTØYSØYLEN (v1.218.72): pillene var en egen søyle
  // oppe til venstre. Samme piller, samme lagring; panelet åpnes ved søylen.
  if (!_modiKontroll) {
    const panel = leggTilLag(_aMap, 'Vis og skjul transportmidler');
    const d = document.createElement('div'); d.className = 'auto-map-modi'; d.id = 'auto-map-modi';
    panel.appendChild(d);
    _modiKontroll = { getContainer: () => d };
  }
  const el = _modiKontroll.getContainer();
  const skjult = _skjulteModi(), skjulteL = _skjulteLinjer();
  const nøkkel = modi.map(m => m.modus + m.antall + (skjult.has(m.modus) ? '-' : '+')).join(',')
    + '|' + linjer.map(l => l.nøkkel + (skjulteL.has(l.nøkkel) ? '-' : '+')).join(',');
  const noe = lagSynlig(modi) || linjer.length > 0;
  // Ingenting å velge: knappen bort og panelet lukket, før vakten — alltid.
  if (!noe) {
    if (el.parentElement) el.parentElement.hidden = true;
    settVerktøy(_aMap, 'lag', { skjult: true, aktiv: false });
  }
  if (nøkkel === _modiNøkkel) return;
  _modiNøkkel = nøkkel;
  el.hidden = !noe;
  // Ingenting å velge: panelet lukkes, aldri åpent og tomt (v1.218.83).
  if (!noe && el.parentElement) { el.parentElement.hidden = true; settVerktøy(_aMap, 'lag', { aktiv: false }); }
  settVerktøy(_aMap, 'lag', { skjult: !noe, merket: modi.some(m => skjult.has(m.modus)) || linjer.some(l => skjulteL.has(l.nøkkel)) });
  el.innerHTML = modi.map(m => '<button type="button" class="mode-pill' + (skjult.has(m.modus) ? '' : ' active')
    + '" data-modus="' + m.modus + '" aria-pressed="' + !skjult.has(m.modus) + '">'
    + esc(MODI_NAVN[m.modus] || m.modus) + ' ' + m.antall + '</button>').join('')
    + (linjer.length ? '<div class="auto-map-linjer" role="group" aria-label="Linjer">' + linjer.map(l => '<button type="button" class="linje-pill'
      + (linjeSynlig(l, skjult, skjulteL) ? ' active' : '') + '" data-linje="' + esc(l.nøkkel) + '" aria-pressed="' + linjeSynlig(l, skjult, skjulteL) + '"'
      + ' aria-label="linje ' + esc(l.kode || '') + '">' + linjemerke({ kode: l.kode, farge: l.farge, tekst: l.tekst, linjeId: l.linjeId, modus: l.modus }) + '</button>').join('') + '</div>' : '');
  el.querySelectorAll('.linje-pill').forEach(b => b.addEventListener('click', () => {
    const { modi: m2, linjer: l2 } = trykkLinje(b.dataset.linje, linjer, _skjulteModi(), _skjulteLinjer());
    try { storage.set(SKJULT_NØKKEL, JSON.stringify([...m2])); storage.set(LINJE_SKJULT_NØKKEL, JSON.stringify([...l2])); } catch (_) {}
    _modiNøkkel = ''; _aKey = ''; _renderMap();
    if (_autoTavle) _renderBody();
  }));
  el.querySelectorAll('button.mode-pill').forEach(b => b.addEventListener('click', () => {
    const s = _skjulteModi();
    if (s.has(b.dataset.modus)) s.delete(b.dataset.modus); else s.add(b.dataset.modus);
    try { storage.set(SKJULT_NØKKEL, JSON.stringify([...s])); } catch (_) {}
    _modiNøkkel = ''; _aKey = ''; _renderMap();
    if (_autoTavle) _renderBody();   // lista følger kartets filter (v1.218.108)
  }));
}

/**
 * SI DET (v1.218.68): lista har retninger, kartet ingen bein. Stillhet leses
 * som «ingenting går herfra». Én stille linje under kartet, og grunnen i
 * loggen — den er det eneste vitnet fra telefonen.
 */
let _sistBeinMelding = '';
export function manglendeBeinTekst(antallRetninger, antallBein) {
  return antallRetninger > 0 && antallBein === 0 ? 'linjene herfra kan ikke tegnes nå' : '';
}
function _meldManglendeBein(sentrert, bein, teller) {
  const el = _el('auto-map-bein-mangler');
  const tekst = sentrert ? manglendeBeinTekst((_dirs || []).length, bein.length) : '';
  if (el) { el.hidden = !tekst; el.textContent = tekst; }
  if (!tekst) { _sistBeinMelding = ''; return; }
  const m = 'edderkopp: ' + (_dirs || []).length + ' retninger → 0 bein (ikke funnet ' + (teller.ikkeFunnet || 0)
    + ', uten koord ' + (teller.utenKoord || 0) + ', ingen avgang ' + (teller.ingenAvgang || 0) + ')';
  if (m !== _sistBeinMelding) { _sistBeinMelding = m; logMsg(m, 'warn'); }
}

/**
 * ÉN KNAPP, TRE SPØRSMÅL (v1.218.71). Bestilt: første trykk rammer inn
 * beste vei til stoppet; neste viser hvilken plattform eller hvilket spor du
 * skal til; samme knapp sykler. Nederst til høyre, der tommelen er.
 */
/**
 * AVGANGEN DIN (v1.218.73). Rapportert: kartet viste ikke hvilket spor første
 * mulige avgang går fra — uten åpen retning eller kort ble ingen plattform
 * uthevet, og gangruta gikk til midten av stoppet. Én regel for kartet,
 * gangruta og plattformvisningen: åpen retning, så kortet, så den første
 * avgangen du rekker (samme `catchable` som streken i lista). Ren.
 */
export function minAvgang(open, kortRute, dirs, walkMins, now) {
  if (open && open.call) return open.call;
  if (kortRute && kortRute.call) return kortRute.call;
  let best = null;
  (dirs || []).forEach(d => {
    const r = catchable(d, walkMins, now)[0];
    if (r && (!best || r.ms < best.ms)) best = r;
  });
  return best ? best.call : null;
}
function _minAvgang() {
  const w = _stop ? gangTil(_stop) : null;
  return minAvgang(_open, _kortRute, _dirs, w ? w.mins : null, Date.now());
}

// Zoomnivåene og utsnittsregelen bor i ui/kartFokus.js (v1.218.129): Rute-kartet bruker dem også.
export { KART_FOKUS, KART_FOKUS_TAVLE, HELE_RUTER_LAPP_PX, nesteFokus, fokusTekst, fokusRamme, FOKUS_IKON } from '../ui/kartFokus.js';
import { KART_FOKUS, KART_FOKUS_TAVLE, HELE_RUTER_LAPP_PX, nesteFokus, fokusTekst, fokusRamme, FOKUS_IKON } from '../ui/kartFokus.js';

/**
 * Lappene ved endestasjonene (v1.218.112): én per endestasjon, med linjene
 * som ender der og FØRSTE AVGANG DU REKKER (`b.ms`, fra `catchable` — samme
 * tid som første ustrøkne rad i lista). Endestasjonen er linjens siste stopp,
 * stedet kartet viser, ikke `frontText`. Ren.
 */
export function endeLapper(bein) {
  const ut = new Map();
  (bein || []).forEach(b => {
    // Et sammenslått bein (slåSammenBein) har én rest per retning: hver ende
    // er en endestasjon, og hver får sitt navn.
    const ender = (b.rester || []).length ? b.rester.map(r => r[r.length - 1]) : [(b.stopp || [])[(b.stopp || []).length - 1]];
    ender.forEach(e => {
      if (!e || e.lat == null) return;
      const k = e.id || stopKey(e.name);
      const g = ut.get(k) || { ende: { name: e.name, lat: e.lat, lon: e.lon }, linjer: [] };
      if (!g.linjer.some(l => l.kode === b.kode)) g.linjer.push({ kode: b.kode, farge: b.farge, tekst: b.tekst, linjeId: b.linjeId, modus: b.modus, ms: b.ms });
      ut.set(k, g);
    });
  });
  return [...ut.values()].map(g => ({ ...g, linjer: g.linjer.sort((a, b) => a.ms - b.ms) }));
}
export function endeLappHtml(g) {
  return '<span class="edd-ende-navn">' + esc(g.ende.name) + '</span>'
    + g.linjer.map(l => '<span class="edd-topp">' + linjemerke({ kode: l.kode, farge: String(l.farge || '').replace(/^#/, ''), tekst: l.tekst, linjeId: l.linjeId, modus: l.modus, logo: false })
      + '<b class="edd-tid">' + (Number.isFinite(l.ms) ? clk(l.ms) : 'rekker ingen nå') + '</b></span>').join('');
}

let _kartFokus = 'oversikt', _fokusKontroll = null, _fokusStopp = null, _sisteBein = [];
function _fokusData() {
  const du = userLL();
  const aktiv = _stop ? aktivFraAvgang(_minAvgang(), _stop.id) : null;
  const pl = _stop ? _plattformer(_stop.id) : null;
  const plattform = aktiv ? _plattformMedKode(pl, aktiv.kode) : null;
  const inngang = _stop ? _valgtInngang(_innganger(_stop.id), du, plattform || _stop) : null;
  return { du, stopp: _stop, gang: approachPoints(), inngang, plattform, plattformer: Array.isArray(pl) ? pl : [], bein: _sisteBein };
}
/* FOKUS GJENNOM RAMMEN (v1.218.189). Rapportert: husket fokus etter omstart
   viste et utsnitt uten deg og uten stoppet. Fokuset ble brukt én gang, før
   kartet hadde størrelse, gangrute og posisjon — og låste kartet som om du
   hadde flyttet det, så det ble aldri rammet inn når dataene kom. Nå er
   fokuset en del av rammen: den rammes inn på nytt når kartets størrelse
   eller fokusets data (deg, gangen, plattformen) kommer til, til du selv
   rører kartet (docs/kartregler.md §4–5). */
function _brukFokus() {
  if (!_aMap) return;
  _aUserMoved = false; _aFitKey = ''; _aKey = ''; _renderMap();
}
/** Hva fokuset har å ramme inn nå — en del av rammenøkkelen. Ren gitt data. */
export function fokusSignatur(fokus, d) {
  if (fokus === 'oversikt') return fokus;
  return fokus + ':' + (d.du ? 1 : 0) + ((d.gang || []).length ? 1 : 0) + (d.plattform ? 1 : 0) + (d.inngang ? 1 : 0) + ((d.bein || []).length ? 1 : 0);
}
function _rammFokus(r) {
  if (r.pts.length === 1) _rammer(() => _aMap.setView(r.pts[0], r.maksZoom));
  else {
    // Rammen holder plass til knappene nede til høyre (fokusknappen og +/−),
    // ellers ligger plattformen du skal til under dem — sett i proben.
    // Ett hinder (v1.218.72): verktøysøylen nede til høyre.
    const vf = verktøyFlate(_aMap);
    const side = vf && vf.r.width ? Math.round(vf.r.width + 24) : 40;
    // Søylen står på den siden hånden din er (v1.218.73).
    const venstre = lastHånd() === 'venstre';
    // «Hele ruter»: lappene stikker ut fra endestasjonene; plass til dem også.
    const lappB = _kartFokus === 'ruter' ? HELE_RUTER_LAPP_PX : 0;
    _rammer(() => _aMap.fitBounds(L.latLngBounds(r.pts), { paddingTopLeft: [(venstre ? side : 40) + lappB, 40 + (lappB ? 30 : 0)],
      paddingBottomRight: [(venstre ? 40 : side) + lappB, 40 + (lappB ? 30 : 0)], maxZoom: r.maksZoom }));
  }
}
const _FOKUS_IKON = FOKUS_IKON;
function _tegnFokusKnapp(ukjent) {
  if (!_aMap) return;
  // En firkant i verktøysøylen (v1.218.72), som de andre knappene. Ikonet
  // viser neste steg; teksten står i title og aria-label.
  if (!_fokusKontroll) {
    leggTilVerktøy(_aMap, 'fokus', { påTrykk: () => {
      _kartFokus = nesteFokus(_kartFokus, _autoTavle ? KART_FOKUS_TAVLE : KART_FOKUS);
      lagreFokus(_autoTavle ? 'autoTavle' : 'auto', _kartFokus);   // huskes (v1.218.187)
      // Spor: hent plattformene og inngangene om de mangler, og ramm inn når de kommer.
      if (_kartFokus === 'spor' && _stop && _stop.id) {
        const vent = [];
        if (_plattformer(_stop.id) === undefined) vent.push(_hentPlattformer(_stop.id));
        if (_innganger(_stop.id) === undefined && _stop.lat != null) vent.push(_hentInnganger(_stop.id, _stop));
        if (vent.length) Promise.all(vent).then(() => { if (_kartFokus === 'spor') _brukFokus(); });
      }
      _brukFokus();
    } }).id = 'auto-map-fokus';
    _fokusKontroll = true;
  }
  settVerktøy(_aMap, 'fokus', { ikon: _FOKUS_IKON[_kartFokus],
    tekst: fokusTekst(_kartFokus, _autoTavle).replace(/^\S+\s/, '') + (ukjent ? ' · spor ukjent' : ''),
    merket: !!ukjent, aktiv: _kartFokus !== 'oversikt' });
}

/** Knappene og kreditteringen på kartet, i kartets egne koordinater. */
function _kartHindre(el, box) {
  return [...(el.parentElement || el).querySelectorAll('.kart-verktøy, .kart-verktøy .kv-panel:not([hidden]), .kart-kompass, .leaflet-control-attribution')]
    .map(n => n.getBoundingClientRect()).filter(r => r.width && r.height)
    .map(r => ({ venstre: r.left - box.left - 4, høyre: r.right - box.left + 4, topp: r.top - box.top - 4, bunn: r.bottom - box.top + 4 }));
}

/** Lappens innhold på et nivå. */
/** Dempede linjer (ikke valgt) i Auto-kartet. */
export const EDD_DEMPET = 0.3;
/** Lappen på den valgte linja: «74 mot Jernbanetorget · framme Lofsrud 19:34». Ren. */
export function valgtLappHtml(b, e) {
  const merke = linjemerke({ kode: b.kode, farge: (b.farge || '').replace(/^#/, ''), tekst: b.tekst, linjeId: b.linjeId, modus: b.modus, logo: false });
  const fram = e && e.name && Number.isFinite(e.at) ? '<span class="edd-mot">framme ' + esc(e.name) + ' ' + clk(e.at) + '</span>' : '';
  return '<span class="edd-topp">' + merke + '<span class="edd-mot">mot ' + esc(b.front || '') + '</span></span>' + fram;
}
/** Linjene ved stoppet + den valgte avgangens «gå om». Ren. */
export function stoppLinjerLapp(bein, gangMin, nå) {
  if (!bein || !bein.length) return '';
  const koder = [...new Set(bein.map(b => b.kode).filter(Boolean))].slice(0, 5);
  const først = bein.reduce((a, b) => (!a || b.ms < a.ms ? b : a), null);
  const om = først && Number.isFinite(gangMin) ? Math.round((først.ms - nå) / 60000) - gangMin : null;
  return '<br><span class="stopp-linjer">' + esc(koder.join(' · '))
    + (først && om != null ? ' — ' + esc(først.kode) + (om <= 0 ? ' gå nå' : ' gå om ' + om + ' min') : '') + '</span>';
}
function _lappHtml(b, nivå) {
  if (nivå <= 0) return null;
  const merke = linjemerke({ kode: b.kode, farge: b.farge.replace(/^#/, ''), tekst: b.tekst, linjeId: b.linjeId, modus: b.modus, logo: false });
  if (nivå === 1) return '<span class="edd-topp">' + merke + '</span>';
  const tider = nivå >= 4 ? (b.tider && b.tider.length ? b.tider : [b.ms]) : [b.ms];
  const topp = '<span class="edd-topp">' + merke + '<b class="edd-tid">' + tider.map(clk).join(' · ') + '</b></span>';
  if (nivå === 2) return topp;
  const mot = nivå >= 4 ? (b.fronter || [b.front]).join(' · ') : lappFronter(b.fronter || [b.front]);
  return topp + '<span class="edd-mot">' + esc(mot) + '</span>';
}

const _LAPP_FORSKYV = { top: [0, -6], bottom: [0, 6], left: [-6, 0], right: [6, 0] };

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
/**
 * Punktet halvveis langs en linje, målt i lengde langs linja — ikke midt
 * mellom endene, for gangruta svinger (v1.218.135). Ren; [lat, lon].
 */
export function halvveis(pts) {
  const p = (pts || []).map(x => Array.isArray(x) ? x : [x.lat, x.lon]).filter(x => x && Number.isFinite(x[0]));
  if (!p.length) return null;
  if (p.length === 1) return p[0];
  const k = Math.cos(p[0][0] * Math.PI / 180);
  const d = (a, b) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * k);
  let total = 0; for (let i = 1; i < p.length; i++) total += d(p[i - 1], p[i]);
  let igjen = total / 2;
  for (let i = 1; i < p.length; i++) {
    const s = d(p[i - 1], p[i]);
    if (s >= igjen && s > 0) { const t = igjen / s; return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t]; }
    igjen -= s;
  }
  return p[p.length - 1];
}

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
// v1.218.89: bare bredt og kvadratisk — knappen veksler mellom de to.
const KART_FORMER = ['kvadrat', 'bred'];
/**
 * Formknappens syklus: kvadrat → bred → fullskjerm. Auto-tavle fikk
 * fullskjerm i v1.218.115; auto-reise også fra v1.218.116 («Legg fullskjerm
 * i formknappen i auto-reise også»). Parameteren står for et senere skille. Ren.
 */
export function kartSyklus(tavle) { return [...KART_FORMER, 'full']; }
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
/**
 * HVOR BEINET STARTER (v1.218.81). Rapportert med skjermbilde: «Linjene må gå
 * ut fra sine respektive plattformer og spor.» Alle beina startet i stoppets
 * midtpunkt. Nå starter hvert ved plattformen avgangen går fra, når den er
 * kjent; ellers i midtpunktet som før. Ren.
 */
export function beinStart(b, plattformListe, stopp) {
  const p = b && b.spor ? (plattformListe || []).find(q => q.kode === String(b.spor)) : null;
  return p ? { lat: p.lat, lon: p.lon } : { lat: stopp.lat, lon: stopp.lon };
}

/**
 * Stoppene du har kjørt: fra påstigningen (medregnet) til der du er nå
 * (medregnet), langs turens egne kall. Tom når ett av dem ikke finnes, eller
 * de står i feil rekkefølge. Ren.
 */
export function stoppBakover(call, fraNavn, tilNavn) {
  const kall = (call && call.serviceJourney && call.serviceJourney.estimatedCalls) || [];
  const navn = c => (c.quay && c.quay.stopPlace && c.quay.stopPlace.name) || '';
  const i = kall.findIndex(c => stopKey(navn(c)) === stopKey(fraNavn));
  const j = kall.findIndex((c, n) => n >= i && stopKey(navn(c)) === stopKey(tilNavn));
  if (i < 0 || j <= i) return [];
  return kall.slice(i, j + 1).map(c => {
    const sp = c.quay && c.quay.stopPlace;
    return { name: navn(c), lat: sp && sp.latitude != null ? sp.latitude : (c.quay && c.quay.latitude),
      lon: sp && sp.longitude != null ? sp.longitude : (c.quay && c.quay.longitude) };
  }).filter(s => s.lat != null && s.lon != null);
}

/**
 * FORMKNAPPEN ALLTID I SØYLEN (v1.218.90). Rapportert to ganger uten knapp;
 * sikringen i v1.218.89 gjorde ingenting når knappen var borte fra siden.
 * Mangler den, lages den på nytt med samme id og bindes på nytt.
 */
function _sikreFormknapp() {
  if (!_aMap || !_aMap._verktøy) return;
  let fb = _el('auto-map-expand');
  if (fb && _aMap._verktøy.el.contains(fb)) return;
  if (!fb) {
    fb = document.createElement('button');
    fb.type = 'button'; fb.id = 'auto-map-expand'; fb.className = 'map-expand-btn';
    const wrap = _el('auto-map') && _el('auto-map').parentElement;
    if (wrap) wrap.appendChild(fb);
  }
  const el = _el('auto-map');
  _bindForm(el, fb);
}
/** ÉN binding av formknappen, med syklusen for modusen du er i. */
function _bindForm(el, fb) {
  if (!_aMap || !el || !fb) return;
  _formTavle = _autoTavle;
  _aForm = bindMapExpand(_aMap, el, fb, { syklus: kartSyklus(_autoTavle), start: kartForm(), onToggle: (open, form) => {
    fitExpandedMap(el, open); settKartForm(form); _aKey = ''; _aFitKey = '';
    setTimeout(() => _renderMap(), 340);
  } });
}
let _formTavle = null;

/** Er en reise startet (tavlas valgte avgang, ikke framme)? Da foreslås ikke andre. Ren. */
export function erReiseStartet(jny, route, nå) {
  const h = hensikt(jny, route, nå);
  return !!(h && h.styrke === 'reise');
}

/** Mållappen: navnet og når du er der. Ren. */
export function målLapp(mål) {
  return (mål && mål.name ? mål.name : '') + (mål && Number.isFinite(mål.at) ? ' · ' + clk(mål.at) : '');
}
/** Er dette retningen med tavlas valg (reise eller rute)? Ren. */
export function erDinAvgang(d, kortRute) {
  return !!(d && kortRute && kortRute.hensikt && kortRute.d === d);
}

/** Hvor mye av hver linje utgangsrammen tar med (v1.218.80). */
export const UTGANG_BEIN_STOPP = 2;
/** Punktene av beina utgangsrammen tar med: de første stoppene, ikke enden. Ren. */
export function utgangBeinPunkter(bein) {
  return (bein || []).map(b => b.stopp[Math.min(UTGANG_BEIN_STOPP, b.stopp.length) - 1])
    .filter(s => s && s.lat != null).map(s => [s.lat, s.lon]);
}
export const START_ZOOM = ZOOM_TRINN.REISE;   // kartreglene §2 (v1.218.188); 15 som før  // v1.218.9: nytt skjermbilde, 2,03× det forrige → ett trinn inn.
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
  // v1.218.28: «▸ vis kart» tok en egen linje over lista. Bryteren står nå
  // på linja med «du er ved» (#auto-kart-knapp); den gamle er foldet bort.
  const knapp = _el('auto-kart-knapp');
  if (knapp && !knapp._bundet) {
    knapp._bundet = true;
    knapp.addEventListener('click', () => {
      const skjult = !kartSkjult();
      settKartSkjult(skjult);
      if (!skjult) { _aKey = ''; _aFitKey = ''; }
      _renderMap();
    });
  }
  if (knapp) {
    knapp.setAttribute('aria-pressed', kartSkjult() ? 'false' : 'true');
    knapp.className = 'auto-ctl-btn' + (kartSkjult() ? '' : ' active');
    knapp.setAttribute('aria-label', kartSkjult() ? 'Vis kart' : 'Skjul kart');
  }
  if (vis) vis.hidden = true;
  // «skjul kart» under kartet: samme knapp som over, foldet bort.
  if (skjul) skjul.hidden = true;
  if (kartSkjult()) {
    wrap.style.display = 'none';
    return;
  }

  const userPos = userLL();
  // Nothing to orient by. A map showing neither you nor a stop is a grey
  // rectangle taking 140px from the departures, so it is not shown at all.
  if (!_stop && !userPos) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  if (!_aMap) {
    // `zoom: false` sto her. Kommentaren rett under sier at kartet er DITT
    // når du har dratt det — da skal knappene også si at du kan. Issue #397.
    _aMap = createMap(el);
    _zoomKnapper();
    // Fullskjerm som de andre kartene: plassen mellom statuslinja og
    // bunnmenyen. Utsnittet tegnes på nytt, så du står i midten av den nye
    // størrelsen.
    _bindForm(el, _el('auto-map-expand'));
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
    // Knipe-zoom, hjul, dobbelttrykk og taster (v1.218.150): input rett før.
    const _inp = () => { _aSisteInput = Date.now(); };
    ['touchstart', 'pointerdown', 'wheel', 'keydown', 'dblclick'].forEach(t => el.addEventListener(t, _inp, { passive: true, capture: true }));
    _aMap.on('zoomstart movestart', () => {
      if (!_aProgrammatisk && Date.now() - _aSisteInput < BRUKER_INPUT_MS) _aUserMoved = true;
    });
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
    // Og ikke om bord (v1.218.48): når toget står ved en stasjon er farten
    // null, og ganglinja kom tilbake. Låsen er det sikre tegnet.
    // TIL SPORET (v1.218.73): gangruta ender ved plattformen avgangen din går
    // fra når den er kjent — ikke midt i stoppet. Samme regel som tavla.
    const _akt = aktivFraAvgang(_minAvgang(), _stop.id);
    const _pl = _akt ? _plattformMedKode(_plattformer(_stop.id), _akt.kode) : null;
    ensureApproach(!_lås && gangGjelder(fartNå(), state.walkFromLL !== null) ? userPos : null, _pl ? { lat: _pl.lat, lon: _pl.lon } : _stop);
  }
  const walkPts = approachPoints();
  // DIN PLATTFORM (v1.218.60): åpen retning vinner, så kortet — samme
  // prioritet som kartets tema under.
  uthevAvgang(_aMap, _minAvgang(), _stop && _stop.id);
  // Formknappen skal alltid stå i søylen (v1.218.89). Sett mangle på telefonen
  // om bord; ikke gjenskapt i proben — så den settes inn igjen om den er borte.
  _sikreFormknapp();
  // Ny holdeplass: kartet går tilbake til oversikten (v1.218.71).
  if (_stop && _fokusStopp !== _stop.id) {
    _fokusStopp = _stop.id;
    // Ikke om du har justert kartet: et stopp appen byttet av seg selv er
    // ingen grunn til å ta det tilbake (v1.218.150).
    // FOKUSET DU VALGTE HUSKES (v1.218.187): nytt stopp rammes inn etter det,
    // ikke tilbake til oversikten — med mindre du har flyttet kartet selv.
    if (!_aUserMoved) {
      const f = lesFokus(_autoTavle ? 'autoTavle' : 'auto', _autoTavle ? KART_FOKUS_TAVLE : KART_FOKUS);
      if (f !== 'oversikt' || _kartFokus !== 'oversikt') { _kartFokus = f; _aFitKey = ''; }
    }
  }
  _tegnFokusKnapp();

  // WHEN A DIRECTION IS OPEN THE MAP IS ABOUT THE LINE, NOT THE NEIGHBOURHOOD.
  // The list has moved on to the stops ahead; the alternatives it was offering
  // a moment ago belong to a question the reader has already answered.
  const line = _open && _stop ? stopsAhead(_open.call, _stop.name) : null;
  /* «DIT DU OFTE SKAL» ER KARTETS TEMA når det finnes et kort og ingen
   * retning er åpen. En åpen retning er det du nettopp trykket på, og den
   * vinner. Rapportert: kortet sa «Jernbanetorget», kartet viste sju stopp
   * i nabolaget og ingen rute. */
  const kortLinje = (!_open && !_gåHitVis && _stop && _kortRute)
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
    + '|g' + (_gåHitVis || '-') + ((_gåHitVis && _gåHit.get(_gåHitVis) && _gåHit.get(_gåHitVis).at) || '')
    // Turen også (v1.218.136): et nytt kort med like mange stopp (en annen
    // avgang, «fremme før») sto ellers med den gamle tiden på kartet.
    + '|k' + (kortLinje ? (_kortRute.id || _kortRute.navn) + ':' + kortLinje.length + ':' + ((_kortRute.call && _kortRute.call.serviceJourney && _kortRute.call.serviceJourney.id) || '') : '-')
    + '|z' + (_aMap.getZoom ? Math.round(_aMap.getZoom() * 2) / 2 : 0)
    // Beina endres når en avgang går, ikke hvert sekund (ro).
    + '|e' + (!line && !kortLinje ? (_dirs || []).map(d => d.nextMs).join(',')
      // og når en avgang glipper fra rekkevidde: minuttet, bare når nettet vises
      + '|' + Math.floor(Date.now() / 60000) + '|s' + [..._skjulteModi()].join() + '|r' + (_autoTavle ? _atRetning : '-')
      // Når plattformene kommer, starter beina ved sporene sine (v1.218.81).
      + '|p' + (_stop && Array.isArray(_plattformer(_stop.id)) ? _plattformer(_stop.id).length : '-') : '-');
  // Redraw when the content changed; re-fit when the content OR the frame
  // changed. Returning early on content alone is what let the bad first fit
  // survive for the life of the screen.
  // A NEW CONTENT IS A NEW FRAME. _aUserMoved is sticky for the life of the
  // screen, so a reader who dragged the map once while orienting would never
  // have seen it frame the line — their choice was about the old picture.
  if (_aOpenKey !== (openKey(_open, line) || {}).id) {
    _aOpenKey = (openKey(_open, line) || {}).id;
    _aUserMoved = false;
    // En åpnet retning handler om linja: oversikt. Lukket: fokuset du valgte (v1.218.187).
    _kartFokus = _open ? 'oversikt' : lesFokus(_autoTavle ? 'autoTavle' : 'auto', _autoTavle ? KART_FOKUS_TAVLE : KART_FOKUS);
    _linePicked = null;
  }
  // Rammen følger det du har bedt om, ikke klokka (v1.218.150).
  const _gvF = _gåHitVis && _gåHit.get(_gåHitVis);
  const rKey = rammeNøkkel({ stoppId: _stop && _stop.id, åpen: (openKey(_open, line) || {}).id, kort: kortLinje ? (_kortRute.id || _kortRute.navn) : null,
    gåHit: _gvF && _gvF.råd ? _gåHitVis + ':' + _gvF.at : null, fokus: fokusSignatur(_kartFokus, _fokusData()), størrelse: sizeKey, gangTil: _altStopp() ? (_altStopp().id || _altStopp().name) + (gangRuteTil(_altStopp()) ? ':r' : '') : null });
  // Ute av rammen: går du ut av utsnittet (og ikke har rørt kartet), rammes det inn igjen.
  const ute = !!(userPos && _aFitKey && !_aMap.getBounds().pad(-0.05).contains([userPos.lat, userPos.lon]));
  const fitStale = !_aUserMoved && (_aFitKey !== rKey || ute);
  if (key === _aKey && !fitStale) return;
  _aKey = key;

  tømLag(_aLayer);

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
  // Hele reisen i rammen om bord, også det du har kjørt (v1.218.88).
  // Toget du sitter på (låsens tur) har alle stoppene; ellers reisens avgang.
  const _bakKall = (_lås && _lås.k && _lås.k.call) || (_kortRute && _kortRute.hensikt === 'reise' ? _kortRute.call : null);
  const _bak = kortLinje && _bakKall && state.jny && state.jny.from && _stop
    ? stoppBakover(_bakKall, state.jny.from, _stop.name) : [];
  _bak.forEach(st => pts.push([st.lat, st.lon]));
  others.forEach(s => { if (s.lat != null) pts.push([s.lat, s.lon]); });
  (walkPts || []).forEach(p => pts.push(p));
  if (_altStopp() && Number.isFinite(_altStopp().lat)) pts.push([_altStopp().lat, _altStopp().lon]);
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
  // Beina tegnes bare i utgangskartet: med en åpen retning eller et kort er
  // kartet om DEN reisen, og fem streker til ville stjele den.
  const _gang = _stop ? gangTil(_stop) : null;
  const _beinTeller = {};
  // ALLE BEINA FØRST, SÅ FILTERET, SÅ KUTTET (v1.218.83). Rapportert: seks
  // busser gikk før T-banen, kartet hadde plass til seks, og T-banen forsvant
  // — og med den T-bane-valget i lag-panelet, som ble tomt.
  // INGEN TAK (v1.218.114). Bestilt: «Ikke begrens antall linjer som vises på
  // kartet, la bruker heller filtrere bort etter behov.» `velgBein`/`beinMaks`
  // kuttet til 4–8 og var et andre, usynlig filter ved siden av lag-panelet.
  // De står igjen som rene funksjoner (foldet, ikke slettet), men kalles ikke.
  // Gå hit alene på kartet (v1.218.144): beina rundt stoppet tegnes ikke da.
  let bein = sentrert && _stop && !_gåHitVis ? edderkoppBein(_iRetning(_dirs), _stop.name, Date.now(), _kortRute && _kortRute.navn, _gang ? _gang.mins : null,
    Infinity, { teller: _beinTeller, stopId: _stop.id || null }) : [];
  _meldManglendeBein(sentrert && !_gåHitVis, bein, _beinTeller);   // skjult med vilje er ikke «kan ikke tegnes»
  // AV/PÅ PER TRANSPORTMIDDEL (v1.218.67), fra alle beina før filteret.
  // FILTERET FRA ALLE RETNINGENE, IKKE BARE DE TEGNEDE (v1.218.117).
  // Rapportert fra Jernbanetorget: T-bane manglet i filteret, fordi ingen
  // T-banestrek ble tegnet — mens lista hadde T-bane 1. Lista og panelet
  // leser nå samme kilde.
  const filterKilde = filterValg(_dirs);
  const _modi = kartModi(filterKilde);
  _tegnModiKnapper(_modi, kartLinjer(filterKilde));
  bein = utenSkjulteLinjerBein(filtrerBein(bein, _skjulteModi()), _skjulteLinjer());
  // UTGANGSRAMMEN (v1.218.80). Bestilt med skjermbilde: «la dette bli
  // default zoom og kartdetaljnivå» — deg, stoppet, gangruta og den nære
  // delen av hver linje, ikke hele byen. Beinas ende (6. stopp) trakk kartet
  // ut til Oslo sentrum; nå rammer de første UTGANG_BEIN_STOPP stoppene inn.
  // Resten av linjene går ut av kartet, som på skjermbildet.
  // GÅ HIT (v1.218.144): et valgt «gå hit»-kort rammer inn deg, gangruta og
  // stoppet den ender ved — ikke stoppet du står ved og beina rundt det.
  const _gvR = _gåHitVis && rådGjelder(_gåHit.get(_gåHitVis), userPos, _stop, metresBetween) ? _gåHit.get(_gåHitVis) : null;
  const gåRamme = gåHitRamme(userPos, _gvR && _gvR.råd);
  const rammePts = gåRamme ? gåRamme : sentrert
    ? [userPos, _stop, ...others].filter(s => s && s.lat != null).map(s => [s.lat, s.lon])
      .concat(utgangBeinPunkter(bein))
      .concat(walkPts || [])
    : pts;
  const _fr = _kartFokus !== 'oversikt' ? fokusRamme(_kartFokus, _fokusData()) : null;
  if (_fr && fitStale) { _aFitKey = rKey; _rammFokus(_fr); }
  if (_kartFokus !== 'oversikt') _tegnFokusKnapp(_fr && _fr.ukjent);
  if (!_fr && rammePts.length && fitStale) {
    _aFitKey = rKey;
    // animate:false so the projection is TRUE the moment this returns. With
    // the default animation latLngToContainerPoint still answers for the view
    // being left, so the readability check below measured the old zoom and
    // kept every bead — 12px median where the threshold is 21.
    const pass = _aMap.getBoundsZoom(L.latLngBounds(rammePts), false, L.point(2 * FIT_PAD, 2 * FIT_PAD));
    _rammer(() => _aMap.setView(midtpunkt(rammePts), Math.min(FIT_MAKS_ZOOM, pass), { animate: false }));
  }

  let stoppHinder = null;
  if (_stop && _stop.lat != null) {
    L.marker([_stop.lat, _stop.lon], {
      icon: makeStopIcon(normMode((_stop.modes || [])[0]), (_stop.modes || []).length, { primary: true }),
    })
      // LINJENE VED STOPPET (v1.218.222): «Mortensrud · 12 min» + linjene som
      // går herfra, og den valgte avgangens «gå om» — der du skal gå på.
      .bindTooltip(lappMedLogo((sentrert ? gangLapp(_stop) : _stop.name) + (sentrert ? stoppLinjerLapp(bein, _gang ? _gang.mins : null, Date.now()) : ''), stoppLinjer(_stop.id)),
        (() => {
          // Bort fra beina og gangruta, og lenger ut når stasjonsdetaljene vises.
          const z = _aMap.getZoom();
          const sp = _aMap.latLngToContainerPoint([_stop.lat, _stop.lon]);
          const ender = bein.map((b, i) => { const e = b.stopp[0]; const p = _aMap.latLngToContainerPoint([e.lat, e.lon]); return { x: p.x, y: p.y, vekt: i === 0 ? 3 : 1 }; })
            .concat(userPos ? [_aMap.latLngToContainerPoint([userPos.lat, userPos.lon])] : []);
          // Siden med færrest bein, men bare om lappen (anslått 150×20) får plass der.
          const bx = el.getBoundingClientRect(), hindre = _kartHindre(el, bx);
          const av = z >= PLATTFORM_ZOOM_AUTO ? STOPP_LAPP_AVSTAND_NÆR : 8;
          const passer = r => { const [dx, dy] = lappForskyv(r, av); return lappPasser({ x: sp.x + dx, y: sp.y + dy }, sp, 150, 20, bx.width, bx.height, hindre, r); };
          // HALVVEIS PÅ GANGRUTA (v1.218.135). Bestilt med skjermbilde: «Lappen
          // # Mortensrud 12 min kan kanskje forankres til halvveien mellom brukers
          // posisjon og stedet?» Lappen sier gangtiden, så den står på gangen.
          const midt = sentrert && walkPts && walkPts.length >= 2 ? halvveis(walkPts) : null;
          if (midt) {
            const mp = _aMap.latLngToContainerPoint(midt);
            const dx = Math.round(mp.x - sp.x), dy = Math.round(mp.y - sp.y), w = 150, h = 20;
            if (z >= STOPP_LAPP_ZOOM) stoppHinder = { venstre: mp.x - w / 2, høyre: mp.x + w / 2, topp: mp.y - h / 2, bunn: mp.y + h / 2 };
            return { className: lappKlasse, direction: 'center', offset: [dx, dy], permanent: z >= STOPP_LAPP_ZOOM && !_gåHitVis };
          }
          const side = stoppLappSide(sp, ender, passer);
          // Linjelappene skal ikke legge seg oppå denne (v1.218.66).
          if (sentrert && z >= STOPP_LAPP_ZOOM) {
            const [dx, dy] = lappForskyv(side, av), w = 150, h = 20;
            const cx = sp.x + dx, cy = sp.y + dy;
            stoppHinder = { venstre: cx - (side === 'left' ? w : side === 'right' ? 0 : w / 2), høyre: cx + (side === 'right' ? w : side === 'left' ? 0 : w / 2),
              topp: cy - (side === 'top' ? h : side === 'bottom' ? 0 : h / 2), bunn: cy + (side === 'bottom' ? h : side === 'top' ? 0 : h / 2) };
          }
          return { className: sentrert ? lappKlasse : 'map-label', direction: side,
            offset: lappForskyv(side, av),
            permanent: sentrert && z >= STOPP_LAPP_ZOOM && !_gåHitVis };   // gå-hit-lappen alene (v1.218.144)
        })())
      .addTo(_aLayer);
  }

  // ── EDDERKOPPBEINA (v1.218.61) ──────────────────────────────────────
  // v1.218.62: lappen er linjemerket og klokka, retningen liten under; satt
  // utover; den første avgangen full styrke, resten dempet.
  // Uten stopp har beina ingen fot å stå på (v1.218.198): sidefeil «reading 'lat'» i proben, eldre enn denne endringen.
  if (!_stop || !Number.isFinite(_stop.lat)) bein = [];
  const førsteMs = bein.length ? Math.min(...bein.map(b => b.ms)) : null;
  _sisteBein = bein;
  // HELE RUTER (v1.218.112): hele linja i full styrke, lappen ved endestasjonen.
  const ruterModus = _autoTavle && _kartFokus === 'ruter';
  const nivåer = lappNivåer(bein, { bredde: box.width, høyde: box.height, zoom: _aMap.getZoom() });
  // Restene først, så de klare beina ligger oppå dem.
  bein.forEach(b => (b.rester || []).forEach(r => {
    const g = L.layerGroup().addTo(_aLayer);
    drawStopLine(g, r, { color: b.farge, mode: normMode(b.modus), dots: false,
      shape: turForm(b.jid, r[0], r[r.length - 1], _renderBody) });
    if (!ruterModus) g.eachLayer(l => l.setStyle && l.setStyle({ opacity: EDDERKOPP_REST_OPASITET }));
  }));
  // PLASSERINGEN FØRST, FOR ALLE (v1.218.115): én lapp per linje, spredt.
  const W = box.width, H = box.height, grunnHindre = _kartHindre(el, box).concat(stoppHinder ? [stoppHinder] : []);
  const stopPt = _stop && Number.isFinite(_stop.lat) ? _aMap.latLngToContainerPoint([_stop.lat, _stop.lon]) : { x: W / 2, y: H / 2 };
  const tilPt = st => _aMap.latLngToContainerPoint([st.lat, st.lon]);
  const kandidaterFor = b => [{ lat: (_stop.lat + b.stopp[0].lat) / 2, lon: (_stop.lon + b.stopp[0].lon) / 2 }, ...b.stopp,
    ...(b.rester || []).flatMap(r => r.slice(1))].filter(st => st && st.lat != null);
  const plasser = ruterModus ? [] : plasserLapper(bein.length, {
    nivå: i => nivåer[i], kandidater: i => kandidaterFor(bein[i]), hindre: grunnHindre,
    naturlig: (i, st) => lappRetning(stopPt, tilPt(st)),
    rekt: (i, st, side, niv) => {
      const { b: lw, h: lh } = LAPP_NIVÅ[niv];
      // Bredden er et anslag; den faktiske lappen kan være litt bredere (sett i
      // proben: «72 19:58» kuttet i kanten). Derfor en margin mot kanten og 15 %.
      const r = lappRekt(tilPt(st), side, Math.round(lw * 1.15), lh);
      return r.venstre >= LAPP_KANT && r.høyre <= W - LAPP_KANT && r.topp >= LAPP_KANT && r.bunn <= H - LAPP_KANT ? r : null;
    },
    tvungen: i => { const e = bein[i].stopp[bein[i].stopp.length - 1]; return { stopp: e, side: lappRetning(stopPt, tilPt(e)) }; },
  });
  bein.forEach((b, bi) => {
    const først = b.ms === førsteMs;
    const g = L.layerGroup().addTo(_aLayer);
    const _pl = _plattformer(_stop.id);
    const start = beinStart(b, Array.isArray(_pl) ? _pl : [], _stop);
    // Veien bussen kjører (v1.218.98), fra sporet ditt; rette streker uten form.
    const vei = turForm(b.jid, start, b.stopp[b.stopp.length - 1], _renderBody);
    drawStopLine(g, [start, ...b.stopp], { color: b.farge, mode: normMode(b.modus), dots: false,
      shape: vei ? [[start.lat, start.lon], ...vei] : null });
    // ÉN LAPP, DEN VALGTE (v1.218.222). Rapportert: «krevende å forstå hva
    // lappene med linje/rutenummer i kartet egentlig betyr for bruker.» Bare
    // avgangen øverst i lista (den første) får lapp og full styrke; de andre
    // linjene står tynne og dempet, uten lapp. Lappen sier hva den er:
    // linja, mot hvor, og når du er framme der.
    const valgt = først;
    if (!valgt) g.eachLayer(l => l.setStyle && l.setStyle({ opacity: EDD_DEMPET }));
    const plass = plasser[bi] || null;
    const e = plass ? plass.stopp : b.stopp[b.stopp.length - 1];
    const retning = plass ? plass.side : 'top';
    const niv = plass ? plass.nivå : 0;
    const lapp = valgt && plass && !ruterModus ? valgtLappHtml(b, e) : null;
    const ende = L.marker([e.lat, e.lon], { icon: L.divIcon({ className: 'edderkopp-ende', html: '', iconSize: [8, 8] }), keyboard: false })
      .on('click', () => { _open = b.dir; _renderBody(); });
    if (lapp) ende.bindTooltip(lapp, { className: lappKlasse + ' edderkopp-lapp nivå-' + niv + (først ? ' først' : '') + (plass.tvunget ? ' tvunget' : ''), direction: retning,
      offset: _LAPP_FORSKYV[retning], permanent: true, interactive: true });
    ende.addTo(g);
  });
  if (ruterModus) {
    const sp = _aMap.latLngToContainerPoint([_stop.lat, _stop.lon]);
    endeLapper(bein).forEach(gr => {
      const ep = _aMap.latLngToContainerPoint([gr.ende.lat, gr.ende.lon]);
      // Over eller under, sentrert: da stikker bare halve lappen ut til siden.
      const retning = ep.y < sp.y ? 'top' : 'bottom';
      L.marker([gr.ende.lat, gr.ende.lon], { icon: L.divIcon({ className: 'edderkopp-ende', html: '', iconSize: [8, 8] }), keyboard: false })
        .bindTooltip(endeLappHtml(gr), { className: lappKlasse + ' edderkopp-lapp edd-ende-lapp', direction: retning,
          offset: _LAPP_FORSKYV[retning], permanent: true })
        .addTo(_aLayer);
    });
  }

  // ── The line ahead, when one is open ──────────────────────────────────
  //
  // Reported: «når bruker har klikket seg inn på en linje, så burde kartet
  // gjenspeile listen». Every stop the list shows already carries lat/lon —
  // stopsAhead returns them — so this costs no request at all.
  //
  // Straight segments between stops: boardGQL does not ask for pointsOnLink,
  // so the alignment is fetched per journey (`turForm`, v1.218.98); until it
  // arrives, or when Entur has none, the line cuts every curve.
  // Named in drawStopLine rather than hidden.
  if (line && line.length) {
    const { color, mode } = openLine(_open);
    drawStopLine(_aLayer, line, {
      color, mode: normMode(mode),
      shape: turForm(_open.call && _open.call.serviceJourney && _open.call.serviceJourney.id, _stop, line[line.length - 1], _renderBody),
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
  const _altId = _altStopp() && (_altStopp().id || _altStopp().name);
  others.forEach(s => {
    if (s.lat == null) return;
    // Står allerede som alternativet, med gangtid og gangrute (v1.218.197).
    if (_altId && (s.id === _altId || s.name === _altId)) return;
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
    // TILBAKELAGT STREKNING (v1.218.88). Rapportert om bord: ruta «forsvant»
    // bak deg — bare strekningen foran ble tegnet. Fra der du gikk på til der
    // du er nå, duset, under den klare delen.
    {
      const bak = _bak;
      if (bak.length >= 2) {
        const g = L.layerGroup().addTo(_aLayer);
        drawStopLine(g, bak, { color, mode: normMode(mode), dots: false });
        g.eachLayer(l => l.setStyle && l.setStyle({ opacity: EDDERKOPP_REST_OPASITET }));
      }
    }
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
        // Med ankomsttid (v1.218.86): «Jernbanetorget · 07:19» — når du er der.
        .bindTooltip(målLapp(mål), { className: 'map-label', direction: 'top', offset: [0, -8], permanent: true })
        .addTo(_aLayer);
    }
  }

  // GANGTREET (v1.218.208, src/veivalg.js): ALLE gangruter fra deg —
  // hovedstoppet, alternativet/ærendet og GÅ HIT — tegnes som ett tre. Én
  // sti ut fra prikken, grener fra veivalgene. Før: tre drawWalk-kall,
  // hvert fra prikken («ikke lag flere veier ut fra brukers pos enn
  // nødvendig»). Markørene tegnes som før.
  const _gv = _gåHitVis && rådGjelder(_gåHit.get(_gåHitVis), userPos, _stop, metresBetween) ? _gåHit.get(_gåHitVis) : null, _gr = _gv && _gv.råd;
  const _alt = _altStopp();
  const _altR = _alt && gangRuteTil(_alt);
  const _ruter = [];
  if (walkPts && walkPts.length) _ruter.push(walkPts);
  // Bare MÅLTE ruter tegnes (v1.218.209): en luftlinje over jordet er ikke en
  // vei. Mangler ruta, bes den hentet; stoppet står med «ca. N min» til den kommer.
  if (_alt && userPos && Number.isFinite(_alt.lat)) {
    if (_altR) _ruter.push(_altR);
    else sikreGang(_gangFra(), _alt, { ferdig: () => { _aKey = ''; _renderMap(); } });
  }
  if (_gr && Number.isFinite(_gr.lat) && _gr.gangPunkter && _gr.gangPunkter.length > 2) _ruter.push(_gr.gangPunkter);
  const _tre = gangTre(_ruter);
  _tre.linjer.forEach(l => drawWalk(_aLayer, l));
  _tre.veivalg.forEach(v => L.marker(v, { icon: L.divIcon({ className: 'veivalg-merke', html: '<span></span>', iconSize: [16, 16], iconAnchor: [8, 8] }), keyboard: false, interactive: false })
    // Ingen «veivalg»-lapp (v1.218.223): «overflødig» — ringen viser gaffelen, og lappen dekket stopplappen.
    .addTo(_aLayer));
  if (_ruter.length > 1 && userPos) {
    const sig = _ruter.length + ':' + stierFraPrikken(_tre.linjer, userPos) + ':' + _tre.veivalg.length;
    if (sig !== _gangTreLogg) { _gangTreLogg = sig; logMsg('gangtre: ' + _ruter.length + ' ruter · ' + stierFraPrikken(_tre.linjer, userPos) + ' sti(er) fra prikken · ' + _tre.veivalg.length + ' veivalg' + _tre.veivalg.map(v => ' ' + Math.round(metresBetween(userPos, { lat: v[0], lon: v[1] })) + ' m').join(',')); }
  }
  if (_gr && Number.isFinite(_gr.lat)) {
    L.marker([_gr.lat, _gr.lon], { icon: makeStopIcon(normMode(_gr.modus), 1, { primary: true }) })
      .bindTooltip(esc(_gr.stoppNavn + (_gr.spor ? ' · spor ' + _gr.spor : '') + ' · ' + _gr.gangMin + ' min'), { permanent: true, direction: 'top', className: 'map-label', offset: [0, -8] })
      .addTo(_aLayer);
  }
  if (_alt && userPos && Number.isFinite(_alt.lat)) {
    const gm = Number.isFinite(_alt.gangMin) ? ' · ' + (_alt.målt === false ? 'ca. ' : '') + _alt.gangMin + ' min' : '';
    L.marker([_alt.lat, _alt.lon], { icon: makeStopIcon('bus', 1, { primary: true }) })
      .bindTooltip(esc((_alt.name || '') + gm), { permanent: true, direction: 'top', className: 'map-label', offset: [0, -8] })
      .addTo(_aLayer);
  }
  // Trykk på prikken: rett stedet — døra når «du er her»-linja er skjult (v1.218.221).
  if (userPos) userDot(_aLayer, userPos, { påTrykk: () => _åpneStedPanel() });
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
/**
 * KNUTEPUNKTET (v1.218.119). Rapportert fra Tveita: «kun t-baner og ingen
 * busser». T-banestasjonen og bussholdeplassen er to stoppesteder i Enturs
 * data, og auto-reise hentet bare det ene. Stoppet ditt pluss nabostopp innen
 * KNUTEPUNKT_M, høyst KNUTEPUNKT_MAKS; nye transportmidler foran, så nærmest.
 * Avstanden måles fra stoppet, ikke fra deg. Ren.
 */
export const KNUTEPUNKT_M = 250;
export const KNUTEPUNKT_MAKS = 3;
/* TIL FOTS (v1.218.171): Auto-tavle tar med stopp innen gangavstand, ikke
 * bare 250 m. Bestilt: «Se hva som bør gjøres med Auto-tavle for at den skal
 * støtte brukeren i å finne best egnet avreise mens bruker er til fots.» */
export const TAVLE_GANG_MAKS_MIN = 8;
export const TAVLE_GANG_M = TAVLE_GANG_MAKS_MIN * 80;   // ca. 4,8 km/t
export const TAVLE_NABO_MAKS = 5;
export function knutepunkt(stopp, nære, maksM = KNUTEPUNKT_M, maks = KNUTEPUNKT_MAKS) {
  if (!stopp) return [];
  const har = new Set((stopp.modes || []).map(normMode));
  const naboer = (nære || [])
    .filter(s => s && s.id && s.id !== stopp.id && Number.isFinite(s.lat) && Number.isFinite(stopp.lat))
    .map(s => ({ s, d: metresBetween(stopp, s), ny: (s.modes || []).some(m => !har.has(normMode(m))) }))
    .filter(x => x.d <= maksM)
    .sort((a, b) => (b.ny - a.ny) || (a.d - b.d))
    .slice(0, maks)
    .map(x => x.s);
  return [stopp, ...naboer];
}
/** Knutepunktet slik skjermen bruker det: gangavstand i Auto-tavle (v1.218.171). */
function _knutepunktHer(stopp) {
  return _autoTavle ? knutepunkt(stopp, _stops(), TAVLE_GANG_M, TAVLE_NABO_MAKS) : knutepunkt(stopp, _stops());
}
/**
 * Gangtiden for EN rad: til stoppet raden går fra (v1.218.171). Før brukte
 * alle radene gangtiden til hovedstoppet, også de fra et nabostopp. Ren.
 */
export function radGang(call, hovedGang, gangTilStopp) {
  const fra = call && call._fra;
  if (!fra) return hovedGang;
  const g = gangTilStopp(fra);
  return Number.isFinite(g) ? g : hovedGang;
}
/** Minutter til du må gå for å rekke avgangen; samme regel som «rekker». Ren. */
export function gåOm(ms, gang, nå) {
  return Number.isFinite(gang) ? minsToLeave(ms, gang, nå) : null;
}

/**
 * GANGRETNING (v1.218.172): går du bort fra stoppet? Ren; «vet ikke» er ikke
 * «bak deg» — uten spor stokkes ingenting.
 */
export function gangRetning(stopp, spor) {
  if (!stopp || !Number.isFinite(stopp.lat)) return 'vet-ikke';
  return approach(spor, { lat: stopp.lat, lon: stopp.lon }).kind === 'fra' ? 'bak' : 'ok';
}
export const TAVLE_RO_MIN = 2;
/**
 * ROLIG REKKEFØLGE (v1.218.172): rader innen `terskel` minutter av hverandre
 * beholder forrige innbyrdes rekkefølge. Lista stokkes bare ved tydelig
 * forskjell. Stabil innsetting. Ren.
 */
export function roligSortering(rader, forrige, nøkkel, verdi, terskel = TAVLE_RO_MIN) {
  const pos = new Map((forrige || []).map((k, i) => [k, i]));
  const ut = [...rader].sort((a, b) => verdi(a) - verdi(b));
  for (let i = 1; i < ut.length; i++) {
    let j = i;
    while (j > 0) {
      const a = ut[j - 1], b = ut[j];
      const pa = pos.get(nøkkel(a)), pb = pos.get(nøkkel(b));
      if (pa == null || pb == null || pa < pb || Math.abs(verdi(a) - verdi(b)) > terskel) break;
      ut[j - 1] = b; ut[j] = a; j--;
    }
  }
  return ut;
}
/**
 * REKK DEN LENGER NED I AUTO-TAVLE (v1.218.185). Uten mål vet tavla ikke hvor
 * du skal av, så ethvert senere stopp på turen teller (slutt: null); grensene
 * for gange er de samme som i Rute. Ren.
 */
export function tavleRekk(call, fra, gangTil, egenGang, nå) {
  if (!call || !fra) return null;
  return rekkLengerNed(call.serviceJourney && call.serviceJourney.estimatedCalls,
    { id: fra.id || null, navn: fra.name }, null, gangTil, egenGang, nå);
}
/**
 * REKK DEN LENGER NED I AUTO-REISE (v1.218.190). Retningsraden: den første
 * avgangen du ikke rekker her, men lenger ned på samme tur — og bare når den
 * kommer før den første du rekker herfra (ellers er det ingenting å vinne).
 * Samme regel som Rute og Auto-tavle (tavleRekk → rekkLengerNed). Ren.
 */
export function retningRekk(d, fra, gangTil, walkMins, now) {
  if (!Number.isFinite(walkMins)) return null;
  const her = catchable(d, walkMins, now)[0];
  for (const x of (d && d.calls) || []) {
    if (!x || !x.call || x.innstilt || erInnstilt(x.call) || canCatch(x.ms, walkMins, now)) continue;
    const rk = tavleRekk(x.call, fra, gangTil, walkMins, now);
    if (rk && (!her || rk.ms < her.ms)) return { ...rk, call: x.call };
  }
  return null;
}
/** Gangtid til et stopp med «målt»-merke (v1.218.194). Null i fart. */
function _gangMålt(ll) { const g = gangTil(ll); return g ? { mins: g.mins, målt: g.målt } : null; }
function _retningRekkMålt(d, walkMins, now) {
  const rk = retningRekk(d, _stop, _gangMålt, walkMins, now);
  if (rk && !rk.målt) sikreGang(_gangFra(), rk.stopp, { ferdig: () => _renderBody() });
  return rk;
}
/** Kallet slik det ser ut fra stoppet lenger ned: der går du på, da. Ren. */
export function rekkKall(call, rk) {
  const t = new Date(rk.ms).toISOString();
  return { ...call, expectedDepartureTime: t, aimedDepartureTime: t,
    _fra: { id: rk.stopp.id, name: rk.stopp.navn, lat: rk.stopp.lat, lon: rk.stopp.lon }, _rekkFraTavle: true };
}
/**
 * Retningen avgangsdetaljene får fra en tavlerad (v1.218.181). Ren.
 * Fra: radens eget stopp (nabostoppet for `_fra`-rader). Til: et vanlig mål
 * turen stopper ved etter påstigning, ellers ingenting — da spør skjermen.
 */
export function tavleDetaljDir(c, stopp, medKoord, vanlige, nå) {
  const fra = (c && c._fra && medKoord(c._fra)) || stopp || {};
  const mål = kjentMål(stopsAhead(c, fra.name, nå, fra.id || null), vanlige);
  return { key: 'auto-tavle', from: fra.name || '', stopId: fra.id || null,
    _fromLat: Number.isFinite(fra.lat) ? fra.lat : null, _fromLon: Number.isFinite(fra.lon) ? fra.lon : null,
    to: mål ? mål.name : null, toStopId: mål ? mål.id : null, _målKjent: !!mål };
}
/** Kallene fra flere stoppesteder som ett: hver tur én gang, merket med stedet. Ren. */
export function slåSammenKall(svar) {
  const sett = new Set();
  // SAMME TUR FRA TO STOPP (v1.218.216). Rapportert fra Munkerud: 74 passerte
  // nabostoppet 18:10 og Munkerud 18:12 — ulik tid, så begge sto, og raden
  // fra nabostoppet sa «rekker ikke her — rekk den på Munkerud», der du stod.
  // Én avgang per tur på tvers av stoppene: den fra første gruppe (stoppet
  // ditt). Innen ett stopp: tur + tid, så en ringlinje står to ganger.
  const turFra = new Map();   // turens id → gruppen den først kom fra
  const ut = [];
  (svar || []).forEach(({ stopp, kall }, gruppe) => (kall || []).forEach(c => {
    const id = c && c.serviceJourney && c.serviceJourney.id;
    if (id && turFra.has(id) && turFra.get(id) !== gruppe) return;
    if (id && !turFra.has(id)) turFra.set(id, gruppe);
    const k = id ? id + '|' + (c.expectedDepartureTime || c.aimedDepartureTime) : null;
    if (k && sett.has(k)) return;
    if (k) sett.add(k);
    ut.push(stopp ? { ...c, _fra: { id: stopp.id, name: stopp.name } } : c);
  }));
  return ut.sort((a, b) => Date.parse(a.expectedDepartureTime || a.aimedDepartureTime) - Date.parse(b.expectedDepartureTime || b.aimedDepartureTime));
}

/**
 * AVGANGER ETTER ET TIDSPUNKT (v1.218.130). Bestilt som første forsøk: «to
 * hurtigvalg: etter 06:00 og etter 15:00». Neste gang klokkeslettet
 * inntreffer: passert i dag betyr i morgen. Ren; null for «nå».
 */
// v1.218.132: tidene justeres i innstillinger (src/fraTider.js); brikkene er plasser.
export const FRA_VALG = { a: 0, b: 1 };
export const FRA_REKKEFØLGE = ['a', 'b'];
export const FRA_UTLØP_MS = 30 * 60_000;
export function fraTid(valg, nå, tider = fraTider(), datoer = fraDatoer()) {
  const i = FRA_VALG[valg];
  if (i == null) return null;
  // En fast dato fra rullehjulene gjelder til den er passert (v1.218.140).
  const fast = datoer && datoer[i];
  if (Number.isFinite(fast) && !fraUtløpt(fast, nå)) return fast;
  const [h, m] = tider[i].split(':').map(Number);
  const d = new Date(nå); d.setHours(h, m, 0, 0);
  if (d.getTime() <= nå) d.setDate(d.getDate() + 1);
  return d.getTime();
}
export function fraTidTekst(ms, nå) {
  if (!Number.isFinite(ms)) return 'nå';
  return 'etter ' + clk(ms) + fraDagTekst(ms, nå);
}
const UKEDAG = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
/** Dagen, bare når det ikke er i dag: '' · ' i morgen' · ' fre 21.11'. Ren. */
export function fraDagTekst(ms, nå) {
  const d = new Date(ms), n = new Date(nå);
  if (d.toDateString() === n.toDateString()) return '';
  const m = new Date(n); m.setDate(m.getDate() + 1);
  if (d.toDateString() === m.toDateString()) return ' i morgen';
  return ' ' + UKEDAG[d.getDay()] + ' ' + d.getDate() + '.' + (d.getMonth() + 1);
}
/** Utløpt: tidspunktet er passert med FRA_UTLØP_MS. Ren. */
export function fraUtløpt(ms, nå) { return Number.isFinite(ms) && nå > ms + FRA_UTLØP_MS; }
/** Tid og fast dato for en plass: endres en av dem, hentes lista på nytt. */
function _fraSignatur(v) { const i = FRA_VALG[v]; return fraTider()[i] + '|' + fraDatoer()[i]; }
let _fraValg = null, _fraMs = null, _fraTidVed = null;   // tiden valget ble regnet fra
/**
 * NÅ · AVGANG · ANKOMST (v1.218.136). Bestilt: «"nå" knappen sykler mellom
 * "nå", "avgang" og "ankomst" og de to siste er koblet "etter klokkeslett"
 * knappene.» Ankomst er «fremme før» (valgt), og krever et mål — derfor bare
 * i Auto-reise; Auto-tavle sykler nå ↔ avgang.
 */
export const FRA_MODI = ['nå', 'avgang', 'ankomst'];
// 90 min før fristen, og 60 avganger: et travelt knutepunkt skal nå helt fram til fristen.
export const ANKOMST_VINDU_MIN = 90;
let _fraModus = 'nå';
export function nesteModus(modus, tavle) {
  const modi = tavle ? FRA_MODI.slice(0, 2) : FRA_MODI;
  return modi[(modi.indexOf(modus) + 1) % modi.length];
}
/** Brikketeksten for et tidspunkt i en modus. Ren. */
export function fraKnappTekst(modus, ms, nå) {
  const t = fraTidTekst(ms, nå);
  return modus === 'ankomst' ? t.replace(/^etter /, 'fremme før ') : t;
}
/** Hvor hentingen starter: tidspunktet, eller vinduet før det ved ankomst. Ren. */
export function hentFraMs(modus, ms) {
  return Number.isFinite(ms) ? (modus === 'ankomst' ? ms - ANKOMST_VINDU_MIN * 60_000 : ms) : null;
}
export function settFraModus(modus) {
  _fraModus = FRA_MODI.includes(modus) ? modus : 'nå';
  if (_fraModus === 'ankomst' && _autoTavle) _fraModus = 'nå';
  settFraValg(_fraModus === 'nå' ? null : _fraValg);
}
export function settFraValg(valg) {
  if (!KLOKKESLETT_VALG) { valg = null; _fraModus = 'nå'; }   // v1.218.145: tatt bort
  _fraValg = FRA_VALG[valg] != null ? valg : null;
  if (_fraValg && _fraModus === 'nå') _fraModus = 'avgang';
  if (!_fraValg && _fraModus === 'ankomst') { /* ankomst uten tid: venter på tid */ }
  _fraMs = _fraValg ? fraTid(_fraValg, Date.now()) : null;
  _fraTidVed = _fraValg ? _fraSignatur(_fraValg) : null;
  _dirs = []; _asked = false; _open = null; _atGrense = TAVLE_SIDE; _atEkstra = []; _atSlutt = false;
  _tegnFraValg();
  if (_stop) _load();
}
function _tegnFraValg() {
  if (typeof document === 'undefined') return;
  if (!KLOKKESLETT_VALG) { const gml = _el('auto-fra'); if (gml) gml.remove(); return; }   // v1.218.145
  const body = _el('auto-body');
  if (!body || !body.parentNode) return;
  let el = _el('auto-fra');
  if (!el) {
    el = document.createElement('div'); el.id = 'auto-fra'; el.className = 'auto-fra'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Avganger fra');
    body.parentNode.insertBefore(el, body);
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-fra]');
      if (!b) return;
      if (_fraHold.brukt) { _fraHold.brukt = false; e.preventDefault(); return; }   // langt trykk er ikke et valg
      if (b.dataset.fra === 'nå') { settFraModus(nesteModus(_fraModus, _autoTavle)); return; }
      settFraValg(b.dataset.fra);
    });
    _fraLangtTrykk(el);
  }
  const nå = Date.now();
  if (_autoTavle && _fraModus === 'ankomst') _fraModus = 'nå';
  const valgt = v => v === 'nå' ? _fraModus !== 'nå' || !_fraValg : _fraValg === v;
  const knapp = (v, tekst) => '<button type="button" class="auto-fra-knapp' + (valgt(v) ? ' valgt' : '') + (v === 'nå' ? ' auto-fra-modus' : '') + (_fraHold.klar && _fraHold.v === v ? ' holder' : '') + '" data-fra="' + v + '" aria-pressed="' + valgt(v) + '"' + (FRA_VALG[v] != null ? ' title="hold for å justere tiden"' : ' title="trykk for å bytte: ' + (_autoTavle ? 'nå · avgang' : 'nå · avgang · ankomst') + '"') + '>' + esc(tekst) + '</button>';
  el.hidden = !_stop;
  // Fast rekkefølge: «15» er en tallnøkkel og ville ellers stått foran «06».
  el.innerHTML = knapp('nå', _fraModus) + FRA_REKKEFØLGE.map(v => knapp(v, fraKnappTekst(_fraModus, fraTid(v, nå), nå))).join('');
}

function _load() {
  if (!_stop) return;
  const body = _el('auto-body');
  if (body) body.innerHTML = '<div class="dest-prev-loading">henter avganger…</div>';
  // ETTER ET TIDSPUNKT (v1.218.130): hele knutepunktet hentes fra det.
  if (Number.isFinite(_fraMs)) {
    const her = _stop, fra = _fraMs, modus = _fraModus;
    const steder = _knutepunktHer(her);
    // ANKOMST: vinduet før fristen, og bare avganger som går innen den.
    const start = hentFraMs(modus, fra), vindu = modus === 'ankomst' ? ANKOMST_VINDU_MIN : 180;
    const innen = c => modus !== 'ankomst' || Date.parse(c.expectedDepartureTime || c.aimedDepartureTime) <= fra;
    Promise.all(steder.map(s => hentStoppAvganger(s.id, modus === 'ankomst' ? 60 : 30, start, vindu).then(sp => ({ stopp: s, sp }))))
      .then(svar => {
        if (!_stop || _stop.id !== her.id || _fraMs !== fra || _fraModus !== modus) return;
        const hoved = (svar[0] && svar[0].sp) || { estimatedCalls: [], situations: [] };
        const kall = slåSammenKall(svar.filter(x => x.sp).map((x, i) => ({ stopp: x.stopp.id === her.id ? null : x.stopp, kall: (x.sp.estimatedCalls || []).filter(innen) })));
        _lastAvganger(hoved, kall, svar.slice(1).filter(x => x.sp).map(x => x.sp));
      });
    return;
  }
  // 30 rather than the default 12. numberOfDepartures caps the WHOLE board,
  // so three per direction at a stop with five of them simply is not in a
  // twelve-departure answer — measured: 3 of 5 rows could show three at 12,
  // 5 of 5 at 30.
  fetchBoard({ key: 'custom-out', from: _stop.name, stopId: _stop.id, to: '', line: null, filter: null },
    (stop) => {
      // NABOSTOPPENE I KNUTEPUNKTET (v1.218.119), hentet ved siden av; lista
      // tegnes når de har svart, men senest etter KNUTEPUNKT_VENT_MS.
      const her = _stop;
      const naboer = _knutepunktHer(her).slice(1);
      const vent = ms => new Promise(r => setTimeout(() => r(null), ms));
      Promise.all(naboer.map(n => Promise.race([hentStoppAvganger(n.id, 20), vent(KNUTEPUNKT_VENT_MS)])
        .then(sp => ({ stopp: n, sp }))))
        .then(svar => {
          if (!_stop || !her || _stop.id !== her.id) return;
          const kall = slåSammenKall([{ stopp: null, kall: stop.estimatedCalls || [] },
            ...svar.filter(x => x.sp).map(x => ({ stopp: x.stopp, kall: x.sp.estimatedCalls || [] }))]);
          _lastAvganger(stop, kall, svar.filter(x => x.sp).map(x => x.sp));
        });
    },
    (err) => {
      logMsg('auto-reise: ' + err, 'err');
      if (body) body.innerHTML = '<div class="dest-prev-empty">Fikk ikke avganger herfra.</div>';
    },
    AUTO_BOARD_DEPARTURES, AUTO_PER_LINE);
}

/**
 * LANGT TRYKK JUSTERER TIDEN (v1.218.133). Bestilt: «holde på knappen lenge
 * nok til at rullehjulene dukker opp? Og klikk utenfor lagrer til
 * innstillinger?» Telefonens egen tidsvelger (rullehjul på iPhone) åpnes på
 * et skjult tidsfelt; endringen lagres med settFraTid — samme sted som
 * innstillingene — og lista hentes fra den nye tiden.
 *
 * Velgeren åpnes når fingeren SLIPPES etter holdet: et trykk som fortsatt
 * holdes gir ikke nettleseren lov til å åpne den.
 */
export const FRA_HOLD_MS = 550;
const _fraHold = { tid: null, v: null, klar: false, brukt: false };
function _fraLangtTrykk(el) {
  const avbryt = () => { clearTimeout(_fraHold.tid); _fraHold.tid = null; _fraHold.klar = false; _fraHold.v = null;
    el.querySelectorAll('.holder').forEach(b => b.classList.remove('holder')); };
  el.addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-fra]');
    if (!b || FRA_VALG[b.dataset.fra] == null) return;
    avbryt(); _fraHold.v = b.dataset.fra;
    _fraHold.tid = setTimeout(() => {
      _fraHold.klar = true;
      const nå = el.querySelector('[data-fra="' + _fraHold.v + '"]');
      if (nå) nå.classList.add('holder');
      try { navigator.vibrate && navigator.vibrate(10); } catch { /* */ }
    }, FRA_HOLD_MS);
  });
  el.addEventListener('pointerup', () => {
    if (!_fraHold.klar) { avbryt(); return; }
    const v = _fraHold.v; avbryt(); _fraHold.brukt = true;
    _åpneFraVelger(el, v);
  });
  el.addEventListener('pointercancel', avbryt);
  el.addEventListener('pointerleave', () => { if (!_fraHold.klar) avbryt(); });
  el.addEventListener('contextmenu', e => { if (e.target.closest('[data-fra]')) e.preventDefault(); });
}
/**
 * TIDEN ER DET SENTRALE, DAGEN ER I DAG ELLER I MORGEN (v1.218.141).
 * Rapportert med skjermbilde: kalendervelgeren lot deg ikke velge dagens dato
 * (iOS sperret dagen fordi starttiden lå før `min`), og en hel måned var mer
 * enn spørsmålet. Nå: et lite panel under knappene med «i dag · i morgen» og
 * telefonens egen tidsvelger (rullehjul). Ferdig eller trykk utenfor lagrer.
 */
export function fraPanelMs(dag, hhmm, nå) {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const d = new Date(nå); d.setDate(d.getDate() + (dag ? 1 : 0)); d.setHours(h, m, 0, 0);
  // «I dag» med en tid som er passert er i morgen — et tidspunkt bak deg gir ingen avganger.
  if (d.getTime() <= nå) d.setDate(d.getDate() + 1);
  return d.getTime();
}
function _åpneFraVelger(el, v) {
  const i = FRA_VALG[v];
  _el('auto-fra-panel') && _el('auto-fra-panel').remove();
  const nå = Date.now(), nå0 = fraTid(v, nå);
  const iMorgen = new Date(nå0).toDateString() !== new Date(nå).toDateString();
  const p2 = n => String(n).padStart(2, '0');
  const panel = document.createElement('div');
  panel.id = 'auto-fra-panel'; panel.className = 'auto-fra-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Velg tidspunkt');
  panel.innerHTML = '<input type="time" class="auto-fra-tid" aria-label="Klokkeslett" value="' + p2(new Date(nå0).getHours()) + ':' + p2(new Date(nå0).getMinutes()) + '">'
    + '<div class="auto-fra-dag" role="group" aria-label="Dag">'
    + ['i dag', 'i morgen'].map((t, d) => '<button type="button" class="auto-fra-knapp' + ((d === 1) === iMorgen ? ' valgt' : '') + '" data-dag="' + d + '" aria-pressed="' + ((d === 1) === iMorgen) + '">' + t + '</button>').join('')
    + '</div><button type="button" class="auto-fra-knapp auto-fra-ok">ferdig</button>';
  el.parentNode.insertBefore(panel, el.nextSibling);
  let dag = iMorgen ? 1 : 0, lukket = false;
  const tid = panel.querySelector('.auto-fra-tid');
  const lagre = () => {
    if (lukket) return; lukket = true;
    document.removeEventListener('pointerdown', utenfor, true);
    const ms = fraPanelMs(dag, tid.value, Date.now());
    panel.remove();
    if (!Number.isFinite(ms)) return;
    settFraDatoTid(i, ms);
    settFraValg(v);
  };
  const utenfor = e => { if (!panel.contains(e.target)) lagre(); };
  panel.querySelectorAll('[data-dag]').forEach(b => b.addEventListener('click', () => {
    dag = Number(b.dataset.dag);
    panel.querySelectorAll('[data-dag]').forEach(x => { x.classList.toggle('valgt', x === b); x.setAttribute('aria-pressed', String(x === b)); });
  }));
  panel.querySelector('.auto-fra-ok').addEventListener('click', lagre);
  // Neste tikk: trykket som åpnet panelet skal ikke lukke det.
  setTimeout(() => document.addEventListener('pointerdown', utenfor, true), 0);
  try { if (tid.showPicker) { tid.showPicker(); return; } } catch { /* fokus under */ }
  tid.focus();
}
const KNUTEPUNKT_VENT_MS = 2500;
function _lastAvganger(stop, kall, naboSvar) {
    {
      _dirs = groupDirections(kall);
      _rå = kall;
      bassengInn(_kandidatBasseng, kall, Date.now());   // v1.218.142
      _hentetMs = Date.now();
      _spørNatt(_stop && _stop.id, _hentetMs);
      // Keep WHERE each message hung. This screen has done it right since
      // v1.137.0 — by writing the loop out here. It was the fourth copy of
      // one loop, and two of the four had lost the origin entirely; the
      // collection has a name now, and every path reads it.
      _alerts = collectStopSituations(stop, _stop && _stop.id);
      // Og nabostoppenes meldinger (v1.218.119), merket med sitt eget sted.
      (naboSvar || []).forEach(sp => { _alerts = _alerts.concat(collectStopSituations(sp, sp.id)); });
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
    }
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
/**
 * Sporet i et plattformnavn som «Mortensrud E» (v1.218.122). Bare når siste
 * ord SER UT som et spor — kort, med tall eller én bokstav — og ikke er en
 * del av stoppets navn. «Stenbråten» ga «plattform Stenbråten» (rapportert:
 * «Formatering feiler»). Ren.
 */
export function sporFraNavn(navn, stoppNavn) {
  const ord = String(navn || '').trim().split(/\s+/);
  if (ord.length < 2 && !/^[A-Z0-9]{1,3}$/i.test(ord[0] || '')) return null;
  const siste = ord[ord.length - 1];
  if (!/^(\d{1,3}[A-Z]?|[A-Z]{1,2})$/.test(siste)) return null;
  if (stoppNavn && String(stoppNavn).trim().split(/\s+/).includes(siste)) return null;
  return siste;
}

export function quayLabel(call) {
  const q = call && call.quay;
  const code = (q && q.publicCode)
    // Some quays carry only a name like "Mortensrud E" — the trailing token
    // is the bay. Same fallback _rowQuay uses on the departure board.
    || (q && q.name ? sporFraNavn(q.name, call._fra && call._fra.name) : null);
  if (!code || code === '?') return call && call._fra && call._fra.name ? call._fra.name : null;
  const mode = call.serviceJourney && call.serviceJourney.line
    && call.serviceJourney.line.transportMode;
  // Ordvalget — spor, plattform, kai — bor i `bytte.js`, delt med
  // avgangsdetaljene (v1.208.0).
  // Fra et nabostopp i knutepunktet (v1.218.119): sporet FØRST, så stedet —
  // et langt stedsnavn forkortes (…), sporet aldri (v1.218.122).
  return plattformTekst(code, mode) + (call._fra && call._fra.name ? ' · ' + call._fra.name : '');
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

/* BELEGG PÅ RADEN (v1.218.36): samme dom og ord som tavla (`belegg.js`), men
 * bare MÅLT — et anslag per rad i en liste på ti ville vært gjetting ti ganger. */
export function radBeleggHtml(call) {
  const b = belegg({ status: call && call.occupancyStatus });
  if (b.kind !== 'målt') return '';
  const t = beleggTekst(b);
  return '<span class="auto-belegg belegg-' + b.nivå + '" title="' + esc(t.fullt) + '">' + esc(t.kort) + '</span>';
}

/* NATT (v1.218.38, src/nattTrafikk.js): første avgang per linje og retning
 * ETTER vinduet, hentet én gang per stopp og bare om natta. */
let _natt = { stopId: null, spurt: false, etter: new Map() };
function _spørNatt(stopId, nå) {
  if (!stopId || !erNatt(nå) || _natt.stopId === stopId) return;
  _natt = { stopId, spurt: false, etter: new Map() };
  fetchArrBoard(stopId, 60, { fraMs: nå + BOARD_WINDOW_MINS * 60000, perLinje: 1, vinduMin: 10 * 60 })
    .then(r => {
      if (_natt.stopId !== stopId) return;
      _natt = { stopId, spurt: true, etter: nesteEtter(r && r.departures) };
      _renderBody();
    })
    .catch(() => { /* ikke svar: ingen påstand om «siste» */ });
}
/** «siste i natt · neste 05:12» under radens tider, når hullet er sett. */
export function nattRadHtml(d, natt) {
  if (!natt || !natt.spurt || !d || !d.calls || !d.calls.length) return '';
  // Bare når den siste i vinduet står på skjermen (raden viser tre tider).
  if (d.calls.length > 3) return '';
  const ln = d.lines && d.lines[0];
  const dom = sisteDom(d.calls[d.calls.length - 1].ms, natt.etter.get(radNøkkel(ln && (ln.id || ln.code), d.frontText)), natt.spurt);
  if (!dom) return '';
  return '<span class="auto-natt">siste i natt · '
    + 'neste ' + clk(dom.neste) + '</span>';
}
/** Retninger som er ferdige for natta, med neste avgang. */
export function nattFerdigeHtml(dirs, natt) {
  if (!natt || !natt.spurt) return '';
  const iLista = new Set((dirs || []).map(d => radNøkkel(d.lines && d.lines[0] && (d.lines[0].id || d.lines[0].code), d.frontText)));
  const ferdige = ferdigeRetninger(natt.etter, iLista).slice(0, 6);
  if (!ferdige.length) return '';
  return '<div class="auto-natt-ferdige"><div class="set-label">ingen flere i natt</div>'
    + ferdige.map(f => '<div class="auto-natt-rad">' + esc(f.kode + ' mot ' + f.dest) + ' · neste ' + clk(f.depTs) + '</div>').join('')
    + '</div>';
}

/* NÅR AVGANGENE BLE HENTET (v1.218.36). Appen visste det og sa det aldri —
 * AGENTS.md: «Si hva du ikke vet». Ferskt: en stille linje. Gammelt eller
 * frakoblet: et varsel, fordi tidene under da kan være feil. */
let _hentetMs = null;
export const OPPDATERT_GAMMEL_MIN = 3;
export function oppdatertHtml(hentetMs, nå, påNett = true) {
  if (!Number.isFinite(hentetMs)) return '';
  const alder = Math.floor((nå - hentetMs) / 60000);
  if (!påNett) return '<div class="auto-oppdatert is-gammel">frakoblet · tidene er fra ' + clk(hentetMs) + '</div>';
  if (alder >= OPPDATERT_GAMMEL_MIN) return '<div class="auto-oppdatert is-gammel">oppdatert for ' + alder + ' min siden · trykk ↻</div>';
  return '<div class="auto-oppdatert">oppdatert ' + clk(hentetMs) + '</div>';
}

/* Navnene på kortene «dit du ofte skal», sist tegnet — så «ofte brukt» ikke
 * gjentar et mål kortene alt viser (v1.218.51). */
let _kortNavn = [];
function _kortNavnFra(dests) { _kortNavn = (dests || []).map(x => x && x.name).filter(Boolean); return dests; }

/* ── DIN REISE (v1.218.52) ─────────────────────────────────────────────
 * Rapportert med skjermbilde: brukeren har trykket «reis» (Mortensrud →
 * Jernbanetorget, linje 3, ank 09:13), men auto-reise kalte målet «dit du
 * ofte skal», viste avganger fra stoppet toget går fra, og sa ingenting om
 * hvor mange stasjoner det er igjen. Reisen er det sterkeste signalet appen
 * har; når låsen er turen den gjelder, styrer den skjermen. */

/** Reisen, når den og låsen er samme tur; ellers null. Ren. */
export function reiseAktiv(jny, lås, lockedId) {
  if (!jny || !jny.dest || !lås || !lås.k) return null;
  const id = lockedId || (jny.legs && jny.legs[0] && jny.legs[0].journeyId) || null;
  if (!id || lås.k.nøkkel !== id) return null;
  return { dest: jny.dest, ank: ankomstMs(jny),
    linje: jny.lineCode || lås.k.linje || null, k: lås.k };
}

/** Stasjoner fra `fraId` (ikke medregnet) til målet (medregnet), eller null. Ren. */
export function stasjonerIgjen(k, fraId, målNavn, nå) {
  const sj = k && k.call && k.call.serviceJourney;
  const kall = (sj && sj.estimatedCalls) || [];
  const t = c => new Date(c.expectedArrivalTime || c.aimedArrivalTime || c.expectedDepartureTime || 0).getTime();
  const i = kall.findIndex(c => c.quay && c.quay.stopPlace && c.quay.stopPlace.id === fraId && !(t(c) < nå - 180000));
  if (i < 0) return null;
  const j = kall.findIndex((c, n) => n >= i && c.quay && c.quay.stopPlace && stopKey(c.quay.stopPlace.name) === stopKey(målNavn));
  return j < 0 ? null : j - i;
}

/** Kortet øverst når du har startet en reise. Ikke en knapp: reisen er valgt. */
export function reiseKortHtml(r, igjen) {
  if (!r) return '';
  const deler = ['bli sittende' + (r.linje ? ' på ' + r.linje : '')];
  if (Number.isFinite(igjen) && igjen > 0) deler.push(igjen + (igjen === 1 ? ' stasjon igjen' : ' stasjoner igjen'));
  return '<div class="set-label">din reise</div>'
    + '<div class="nearby-btn auto-dest auto-reise-kort">'
    + '<span class="auto-dest-top"><span class="auto-dest-name">' + esc(r.dest) + '</span>'
    + (Number.isFinite(r.ank) ? '<span class="auto-dest-at">' + esc('framme ' + clk(r.ank)) + '</span>' : '') + '</span>'
    + '<span class="auto-dest-how">' + esc(deler.join(' · ')) + '</span></div>';
}

/** Linja under «neste stasjon»: hvor du går av. Ren. */
export function avstigningHtml(r, igjen) {
  if (!r || !Number.isFinite(igjen)) return '';
  const tekst = igjen <= 0 ? 'gå av her'
    : igjen === 1 ? 'neste: gå av på ' + r.dest
    : 'går av på ' + r.dest + (Number.isFinite(r.ank) ? ' · ' + clk(r.ank) : '') + ' · ' + igjen + ' stasjoner igjen';
  return '<div class="ved-rad avstigning' + (igjen <= 1 ? ' avstigning-nå' : '') + '">' + esc(tekst) + '</div>';
}

let _reiseInfo = null;   // { r, igjen } for denne tegningen
let _avgÅpen = false;    // avgangslista om bord, utfoldet av deg
if (typeof document !== 'undefined') {
  document.addEventListener('toggle', e => {
    if (e.target && e.target.classList && e.target.classList.contains('auto-avg-fold')) _avgÅpen = e.target.open;
  }, true);
}

/** Fra så mange minutter står klokkeslettet i stedet for minuttene (v1.218.36). */
export const KLOKKE_FRA_MIN = 15;

/**
 * TROMMELEN (v1.218.139). Bestilt med skjermbilde: «avgangstidene på hvert
 * kort kan roteres som om de gikk på en trommel som kan roteres mot venstre».
 * Tre tider står i vinduet som før; sveip mot venstre ruller de neste inn.
 */
export const TROMMEL_SYNLIG = 3;
export const TROMMEL_SVEIP_MS = 350;
const _trommelPos = new Map();
let _trommelStopp = null, _trommelSveip = 0;
/** Radens nøkkel for rulleposisjonen: linje og retning, ikke plass i lista. */
export function trommelNøkkel(d) {
  return ((d.lines || []).map(l => l.code || l.id).join('+')) + '>' + (d.frontText || '');
}
export const TROMMEL_MAKS = 12;
export function _timesHtml(d, now, walkMins, opt = {}) {
  const kilde = opt.trommel && d.alleTider && d.alleTider.length ? d.alleTider : d.times;
  const raw = (kilde && kilde.length) ? kilde : null;
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
  // KLOKKESLETT LENGER FRAM (v1.218.36): «72 min» kl. 00:15 er regnestykket
  // leseren må gjøre selv. Fra KLOKKE_FRA_MIN står klokkeslettet.
  const klokke = (x) => x.ms != null && x.m > KLOKKE_FRA_MIN;
  const label = (x) => (x.m === 0 ? 'nå' : klokke(x) ? clk(x.ms) : String(x.m));
  // SANNTID: en prikk ved tider som følger kjøretøyet; rutetid har ingen.
  const sanntid = d.sanntidMs instanceof Set ? d.sanntidMs : new Set();
  const rt = (x) => (x.ms != null && sanntid.has(x.ms) ? ' is-sanntid' : '');
  // «min» etter det SISTE minuttallet, ikke etter et klokkeslett.
  const sisteMin = (() => { for (let i = keep.length - 1; i >= 0; i--) if (!klokke(keep[i]) && keep[i].m !== 0) return i; return -1; })();

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
    const enhet = i === sisteMin && keep.slice(i + 1).some(klokke) ? ' min' : '';
    return '<span class="' + (loud ? 'auto-t-next' : 'auto-t-dim')
      + (r ? ' ' + r : '') + rt(x) + '"' + (rt(x) ? ' title="sanntid"' : '') + '>' + label(x) + '</span>' + enhet;
  }).join('<span class="auto-t-sep"> · </span>');

  // Den felles enheten hører til tallene som GÅR. Er den siste innstilt,
  // har den sin egen inni streken, og en til ville hengt etter «innstilt».
  const sist = keep[keep.length - 1];
  if (rcls(sist) === 'innstilt') return html;
  // Er den siste et klokkeslett, sto «min» alt ved siste minuttall.
  if (klokke(sist)) return html;
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
  // v1.218.28: segmentbryteren og «sorter» tok to linjer over lista. Én
  // knapp på linja med «du er ved» sier hva som gjelder og bytter ved trykk.
  el.style.display = 'none';
  const knapp = _el('auto-sort-knapp');
  if (knapp) {
    knapp.hidden = !show;
    if (show) {
      const nå = desc ? ends.desc : ends.asc, annen = desc ? ends.asc : ends.desc;
      knapp.textContent = sorterKnappTekst(ends, desc);
      knapp.setAttribute('aria-label', 'Sortert: ' + nå + ' først. Trykk for ' + annen + ' først');
      if (!knapp._bundet) {
        knapp._bundet = true;
        knapp.addEventListener('click', () => { saveAutoSort(!loadAutoSort().desc); _renderBody(); });
      }
    }
  }
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

/* ── AUTO-TAVLE (v1.218.107) ──────────────────────────────────────────────
 * Testsiden «Auto-tavle»: auto-reise-skjermen i en modus, ikke en kopi, så
 * stoppvalg, gangtid og henting har ett hjem. Det som ikke er proven (kort,
 * intervju, «neste reise», ombord) skjules med klassen `auto-tavle`. */
let _autoTavle = false;
export function erAutoTavle() { return _autoTavle; }
let _profilHjem = null;
function _flyttProfil(tavle) {
  if (typeof document === 'undefined') return;
  const p = document.getElementById('auto-profil'), body = document.getElementById('auto-body');
  if (!p || !body) return;
  if (tavle) {
    if (!_profilHjem) _profilHjem = { forelder: p.parentNode, etter: p.nextSibling };
    body.parentNode.insertBefore(p, body);
  } else if (_profilHjem) {
    _profilHjem.forelder.insertBefore(p, _profilHjem.etter && _profilHjem.etter.parentNode === _profilHjem.forelder ? _profilHjem.etter : null);
    _profilHjem = null;
  }
}

/**
 * + OG − BARE I AUTO-REISE (v1.218.124). Bestilt: «På auto-tavle kutter vi
 * ut + og − for zoom. Da kan vi opprettholde et vertikalt knappepanel
 * uavhengig av kartstørrelse.» Skjult, ikke slettet; to fingre og
 * zoomknappen (fokus) zoomer fortsatt. Ren.
 */
// v1.218.128: også i auto-reise («ta bort + og − … slik at knappepanelet kan
// være vertikalt i alle kartstørrelser»). Parameteren står for et senere skille.
export function zoomKnapperSynlige(tavle) { return false; }
function _zoomKnapper() {
  if (!_aMap) return;
  const vis = zoomKnapperSynlige(_autoTavle);
  settVerktøy(_aMap, 'inn', { skjult: !vis });
  settVerktøy(_aMap, 'ut', { skjult: !vis });
}

export function settAutoTavle(på) {
  const byttet = _autoTavle !== !!på;
  _autoTavle = !!på;
  _zoomKnapper();
  // Knutepunktet er større i tavla (gangavstand, v1.218.171): hent på nytt
  // når modusen byttes, ellers står 250 m-svaret fra Auto-reise.
  if (byttet && _stop && typeof document !== 'undefined') { _dirs = []; _asked = false; setTimeout(() => _stop && _load(), 0); }
  // Hver modus har sitt fokus (v1.218.187): les det på nytt ved byttet.
  if (byttet) _fokusStopp = null;
  // INTERVJUET OVER LISTA I AUTO-TAVLE (v1.218.126): nederst ville det aldri
  // bli sett under en liste med uendelig rulling. Tilbake når modusen slås av.
  _flyttProfil(_autoTavle);
  // Formknappen får syklusen for modusen (v1.218.115); ut av fullskjerm først.
  if (_aMap && _formTavle !== null && _formTavle !== _autoTavle) {
    const el = _el('auto-map');
    if (el && el.classList.contains('expanded')) { el.classList.remove('expanded'); document.documentElement.classList.remove('map-open'); }
    _bindForm(el, _el('auto-map-expand'));
  }
  const v = typeof document !== 'undefined' && document.getElementById('v-auto');
  if (v) {
    v.classList.toggle('auto-tavle', _autoTavle);
    const lab = v.querySelector('.screen-label');
    if (lab) lab.textContent = _autoTavle ? 'auto-tavle' : 'auto-reise';
  }
}
// Sidene du har rullet til, avgangene hentet utover første svar, og om
// gruppen «rekker ikke» er åpen. Nullstilt når stoppet byttes.
let _atGrense = TAVLE_SIDE, _atEkstra = [], _atStopp = null, _atHenter = false, _atSlutt = false, _atIkkeÅpen = false, _atObs = null;
/**
 * Gruppen en retning står i: 'mot' sentrum, ellers null («andre retninger»).
 * ÉN definisjon for Auto-reises seksjoner og Auto-tavlas filter (v1.218.131).
 * Lest fra avgangen du rekker, så raden dømmes etter turen du faktisk tar.
 */
export function retningGruppe(d, here, walkMins, now) {
  const ride = catchable(d, walkMins, now)[0];
  return centreward(here, stopsAhead((ride && ride.call) || d.call, _stop && _stop.name, now)) === 'mot' ? 'mot' : null;
}
/** Retningsfilteret i Auto-tavle: knappene i rekkefølge, med tekst. */
export const AT_RETNINGER = ['alle', 'mot', 'hjem', 'andre'];
export const AT_RETNING_TEKST = { alle: 'alle', mot: 'mot sentrum', hjem: 'hjemover', andre: 'andre retninger' };
/** Retningene filteret slipper gjennom. «Andre» er verken mot sentrum eller hjemover. */
export function filtrerRetning(dirs, valg, gruppe, hjem = () => false, område = () => null) {
  // MÅLOMRÅDENE (v1.218.213): «andre retninger» delt etter hvor linjene går.
  if (typeof valg === 'string' && valg.startsWith('omr:')) return dirs.filter(d => område(d) === valg);
  if (valg === 'mot') return dirs.filter(d => gruppe(d) === 'mot');
  if (valg === 'hjem') return dirs.filter(d => hjem(d));
  if (valg === 'andre') return dirs.filter(d => gruppe(d) !== 'mot' && !hjem(d));
  return dirs;
}
/** Går retningen hjemover (src/hjemover.js)? Lest fra avgangen du rekker, som sentrum. */
export function retningHjem(d, walkMins, now, liste) {
  return retningHjemDom(d, walkMins, now, liste).hjem;
}
/** Med bytte (v1.218.151): { hjem, bytte }. Leser reisesøket for stoppet. */
export function retningHjemDom(d, walkMins, now, liste) {
  if (!liste || !liste.length) return { hjem: false, bytte: null };
  const ride = catchable(d, walkMins, now)[0];
  const fram = stopsAhead((ride && ride.call) || d.call, _stop && _stop.name, now);
  const s = _stop && _hjemSøk.get(_stop.id);
  const l = (d.lines && d.lines[0]) || {};
  return hjemDom(l.id, fram, liste, s && s.etapper, s && s.gange);
}
/** «Gå hjem» når det er raskest (v1.218.158) — tavla og Auto-reise. */
export function gåHjemHtml(hs, gangTilStopp) {
  const g = hs && hs.gange;
  if (!g) return '';
  const hjem = (hjemStopp()[0] || {}).name || 'hjem';
  return '<div class="at-gaa-hjem">\u{1F6B6} gå hjem: ca. ' + esc(String((gangTilStopp || 0) + g.gangMin)) + ' min til ' + esc(hjem) + ' — raskere enn å vente på en avgang</div>';
}
/** «Raskest hjem» fra et annet stopp — én definisjon, tavla og Auto-reise (v1.218.156). */
function raskestHjemHtml(hs, nær, linjerHer) {
  const rk = hs && hs.raskest;
  if (!annetHjemStopp(rk, nær, linjerHer)) return '';
  return '<button type="button" class="at-raskest" data-pin="' + esc(rk.fraId) + '">raskest hjem: '
    + esc((rk.gangMin > 0 ? 'gå ' + rk.gangMin + ' min til ' : 'fra ') + rk.fraNavn + ' · linje ' + rk.kode + (Number.isFinite(rk.går) ? ' · går ' + clk(rk.går) : '')) + ' →</button>';
}
/**
 * Seksjonenes rekkefølge i Auto-reise (v1.218.156): fra kl. 14 og gjennom
 * kvelden og natta står hjemover først; om morgen og formiddag mot sentrum.
 * «Andre retninger» alltid sist. Ren.
 */
export function seksjonRekkefølge(nå) {
  const h = new Date(nå).getHours();
  return (h >= 14 || h < 4) ? ['hjem', 'mot', null] : ['mot', 'hjem', null];
}
/* REISESØKET HJEM (v1.218.151): én gang per stopp, fornyet etter HJEM_SØK_MS. */
export const HJEM_SØK_MS = 10 * 60_000;
export const HJEM_SØK_MÅL = 2;
/** Gangtiden kan endre seg så mye før søket gjentas. */
export const HJEM_GANG_SLAKK_MIN = 3;
const _hjemSøk = new Map();   // stoppets id → { at, etapper, henter, feil }
function _hjemSøkOppdater(nå) {
  const liste = hjemStopp();
  if (!_stop || !_stop.id || !liste.length) return;
  // FRA NÅR DU ER VED STOPPET (v1.218.155): gangtiden med, så søket ikke
  // gir avganger lista sier du ikke rekker.
  const g = gangTil(_stop), gangMin = g && Number.isFinite(g.mins) ? Math.ceil(g.mins) : 0;
  const f = _hjemSøk.get(_stop.id);
  if (f && (f.henter || (nå - f.at < HJEM_SØK_MS && Math.abs((f.gangMin || 0) - gangMin) <= HJEM_GANG_SLAKK_MIN))) return;
  const mål = liste.slice(0, HJEM_SØK_MÅL).filter(m => m.id !== _stop.id);
  if (!mål.length || !budsjettTillater(_søkLogg, nå, mål.length)) return;
  const post = { at: nå, gangMin, etapper: f ? f.etapper : [], henter: true, feil: false };
  _hjemSøk.set(_stop.id, post);
  const fra = nå + gangMin * 60_000;
  Promise.all(mål.map(m => fetchTripFra(_stop.id, m.id, fra, 5).catch(() => null)))
    .then(svar => {
      post.henter = false;
      if (svar.every(x => x == null)) { post.feil = true; return; }
      const alle = svar.flatMap(x => x || []);
      post.etapper = hjemFørsteEtapper(alle);
      post.raskest = hjemRaskest(alle);
      post.gange = hjemGange(alle);
    });
}
/* RETNINGSVALGET HUSKES (v1.218.185). Bestilt: «Lagre brukervalg som alle,
   mot sentrum, hjemover og andre retninger.» Lagret valg gjelder fra start og
   ved hvert nytt stopp; finnes ikke valget på et stopp (ingen hjemover-stopp,
   bare én retning), vises «alle» der — uten at valget ditt glemmes. */
export const AT_RETNING_KEY = 't.autoTavleRetning';
export function lagretRetning() {
  try { const v = storage.get(AT_RETNING_KEY); return AT_RETNINGER.includes(v) || (v && v.startsWith('omr:')) ? v : 'alle'; } catch { return 'alle'; }
}
function _lagreRetning(v) { try { if (AT_RETNINGER.includes(v) || (v && v.startsWith('omr:'))) storage.set(AT_RETNING_KEY, v); } catch { /* */ } }
/* MÅLOMRÅDENE HER (v1.218.213, src/maalomrader.js). Regnet på nytt bare når
   stoppet eller settet av retninger endres — knappene hopper ikke. */
let _atOmr = [], _atOmrNøkkel = '', _atOmrAv = new Map();
const _omrNøkkel = d => (d.frontText || '') + '\0' + ((d.lines && d.lines[0] && (d.lines[0].id || d.lines[0].code)) || '');
function _oppdaterOmråder(andre, here, nå) {
  const sig = (_stop && _stop.id) + '|' + andre.map(_omrNøkkel).sort().join('|');
  if (sig === _atOmrNøkkel) return;
  _atOmrNøkkel = sig;
  _atOmr = målområder(andre, here, d => stopsAhead(d.call, _stop && _stop.name, nå), _omrNøkkel);
  _atOmrAv = new Map();
  _atOmr.forEach(o => o.nøkler.forEach(k => _atOmrAv.set(k, o.id)));
  // PROBEN (v1.218.214): hva Entur og Kartverket sier om områdene — til loggen.
  if (_atOmr.length && _stop) omrProbe(_stop.id, _atOmr, t => logMsg(t)).catch(() => {});
  _atOmr.forEach(o => { o.linjer = [...new Set(andre.filter(d => o.nøkler.has(_omrNøkkel(d))).map(d => d.lines && d.lines[0] && d.lines[0].code).filter(Boolean))]; });
}
/* KOMBINASJONER I VALGT OMRÅDE (v1.218.215, kombiRader i src/reiseTil.js).
   Ett reisesøk per valgt område (ikke «alle», ikke «hjemover», som har sitt
   eget), husket i 3 min eller til stoppet byttes. */
export const KOMBI_GYLDIG_MS = 3 * 60_000;
const _kombi = new Map();   // stopp|område → { t, tps | 'henter' | 'feil' }
function _kombiMål(valg, here) {
  if (valg === 'mot') { const c = sentrumFor(here); return c ? { lat: c.lat, lon: c.lon, name: 'sentrum' } : null; }
  const o = _atOmr.find(x => x.id === valg);
  return o && o.fjern && Number.isFinite(o.fjern.lat) ? { lat: o.fjern.lat, lon: o.fjern.lon, name: o.fjern.name } : null;
}
function _kombiFor(valg, here, nå) {
  if (!_stop || valg === 'alle' || valg === 'hjem') return null;
  const k = _stop.id + '|' + valg, v = _kombi.get(k);
  if (v && (v.tps === 'henter' || nå - v.t < KOMBI_GYLDIG_MS)) return v;
  const mål = _kombiMål(valg, here), fra = _gangFra();
  if (!mål || !fra) return null;
  if (!budsjettTillater(_søkLogg, nå, 1)) return v || null;
  const post = { t: nå, tps: 'henter' };
  _kombi.set(k, post);
  fetchTripFraPos(fra, { lat: mål.lat, lon: mål.lon }, nå, 6)
    .then(tps => { post.tps = tps; post.t = Date.now(); logMsg('kombi ' + _retningTekst(valg) + ': ' + tps.length + ' reiser, ' + kombiRader(reiseRader(tps, Date.now(), null)).length + ' med bytte vist'); })
    .catch(e => { post.tps = 'feil'; post.t = Date.now(); logMsg('✗ kombi ' + _retningTekst(valg) + ': ' + (e && e.message), 'err'); })
    .finally(() => _renderBody());
  return post;
}
function _kombiRadHtml(r, i) {
  const merker = r.linjer.map(l => linjemerke({ kode: l.kode, farge: l.farge, tekst: l.tekst, modus: l.modus })).join('<span class="hva-pil">→</span>');
  return '<button type="button" class="at-kombi" data-kombi="' + i + '">'
    + '<span class="hva-tall"><small>gå om</small><b>' + Math.max(0, r.gåOm) + '</b><small>min</small></span>'
    + '<span class="hva-info"><span class="hva-l1">' + merker + (r.via ? ' via ' + esc(r.via) : '') + '</span>'
    + '<span class="hva-l2">fra ' + esc(r.fra) + ' · ' + r.gangMin + ' min gange</span>'
    + '<span class="hva-l3">ank. ' + _klokke(r.ank) + ' · ' + r.bytter + ' bytte' + r.fakta.filter(f => f !== 'ingen bytte').map(f => ' · ' + esc(f)).join('') + '</span></span></button>';
}
const _retningTekst = k => AT_RETNING_TEKST[k] || ((_atOmr.find(o => o.id === k) || {}).tekst) || 'dit';
let _atRetning = lagretRetning();
let _atRekke = [];      // forrige rekkefølge, for ro (v1.218.172)
let _atGangTil = null;  // nabostoppet du trykket på (v1.218.172)
/* ALTERNATIVET PÅ KARTET (v1.218.194). Rapportert: «rekk den på Stenbråten»
   på raden, men kartet viste bare gangen til Mortensrud. Øverste rad som går
   fra et annet stopp (rekk lenger ned eller nabostopp) står på kartet med
   lapp og gangen dit — uten at du må trykke. */
let _atAlt = null;
/** Stoppet kartet skal vise gangen til: det du trykket, ellers øverste alternativ. */
function _altStopp() {
  if (!_autoTavle) return null;
  // Målet for ærendet du valgte går foran (v1.218.207): gangen DIT.
  if (_hvaÆrend === 'sted') {
    // Kartet følger raden du har valgt: påstigningen, eller stedet når du går hele veien.
    const rad = _hvaRader()[_hvaValgt];
    const m = rad && rad.type === 'kollektiv' ? rad.fraLL : (rad ? _målSted : null);
    if (!m || !Number.isFinite(m.lat)) return null;
    const w = walkMinsTo(m);
    if (w && !w.målt) sikreGang(_gangFra(), { id: 'mål:' + m.name, lat: m.lat, lon: m.lon }, { ferdig: () => { _aKey = ''; _renderMap(); } });
    return { id: 'mål:' + m.name, name: m.name, lat: m.lat, lon: m.lon, gangMin: w ? w.mins : null, målt: w ? w.målt : false };
  }
  if (_målSted && Number.isFinite(_målSted.lat)) {
    const w = walkMinsTo(_målSted);
    if (w && !w.målt) sikreGang(_gangFra() || state.walkFromLL || state.homeLL, { id: 'mål:' + _målSted.name, lat: _målSted.lat, lon: _målSted.lon }, { ferdig: () => { _aKey = ''; _renderMap(); _herSist = null; _renderHer(); } });
    return { id: 'mål:' + _målSted.name, name: _målSted.name, lat: _målSted.lat, lon: _målSted.lon, gangMin: w ? w.mins : null, målt: w ? w.målt : false };
  }
  return _atGangTil || _atAlt;
}
/**
 * LANGT TRYKK PÅ «HJEMOVER» (v1.218.147). Bestilt: «Når bruker trykker og
 * holder på knappen lenge nok så sendes bruker til innstillinger for å legge
 * inn/redigere stedene.» Bundet én gang på lista (den tegnes hvert sekund).
 */
export const HJEM_HOLD_MS = 550;
/** Hjemover-knappen på tavla og hjemover-overskriften i Auto-reise (v1.218.156). */
export const HJEM_HOLD_SEL = '.at-retning [data-retning="hjem"], [data-hjem-side]';
const _hjemHold = { tid: null, brukt: false };
export function tilHjemoverInnstilling() {
  navTo('v-prefs');
  setTimeout(() => {
    const f = document.querySelector('.pref-hjem');
    if (!f) return;
    f.scrollIntoView({ block: 'center' });
    const s = f.querySelector('.pref-hjem-sok');
    if (s) s.focus({ preventScroll: true });
  }, 60);
}
function _hjemLangtTrykk(body) {
  if (body._hjemBundet) return;
  body._hjemBundet = true;
  const avbryt = () => { clearTimeout(_hjemHold.tid); _hjemHold.tid = null; };
  body.addEventListener('pointerdown', e => {
    if (!e.target.closest(HJEM_HOLD_SEL)) return;
    avbryt();
    _hjemHold.tid = setTimeout(() => { _hjemHold.tid = null; _hjemHold.brukt = true; tilHjemoverInnstilling(); }, HJEM_HOLD_MS);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => body.addEventListener(t, avbryt));
  body.addEventListener('contextmenu', e => { if (e.target.closest(HJEM_HOLD_SEL)) e.preventDefault(); });
}
/**
 * Retningene filteret slipper gjennom, for lista OG kartet (v1.218.134).
 * Bestilt: «La kartet følge retningsfilteret også.» Bare i Auto-tavle.
 */
function _iRetning(dirs, nå = Date.now()) {
  if (!_autoTavle || _atRetning === 'alle' || !dirs) return dirs;
  const here = (_stop && _stop.lat != null) ? { lat: _stop.lat, lon: _stop.lon } : null;
  const g = _stop ? gangTil(_stop) : null, gang = g ? g.mins : null;
  const liste = hjemStopp();
  return filtrerRetning(dirs, _atRetning, d => retningGruppe(d, here, gang, nå), d => retningHjem(d, gang, nå, liste), d => _atOmrAv.get(_omrNøkkel(d)) || null);
}
function _tegnAutoTavle(body) {
  const nå = Date.now();
  if (!_stop || _atStopp !== _stop.id) { _atStopp = _stop && _stop.id; _atGrense = TAVLE_SIDE; _atEkstra = []; _atSlutt = false; _atIkkeÅpen = false; _atRetning = lagretRetning(); }
  const g = _stop ? gangTil(_stop) : null, gang = g ? g.mins : null;
  // Kartets filter (lag-panelet) gjelder lista også, og den sier det.
  const skjult = _skjulteModi();
  const alleDirs = _atEkstra.length ? [..._dirs, ...groupDirections(_atEkstra, nå)] : _dirs;
  const synlige = utenSkjulteLinjerRetninger(filtrerRetninger(alleDirs, skjult), _skjulteLinjer());   // transportmiddel, så linje
  const etterModus = filtrerRetninger(alleDirs, skjult);
  const skjulteNavn = [...new Set(alleDirs.filter(d => !etterModus.includes(d)).map(d => filterModus(d.lines && d.lines[0] && d.lines[0].mode)))]
    .map(m => MODI_NAVN[m] || m);
  const sl = _skjulteLinjer();
  [...new Set(alleDirs.filter(d => !synlige.includes(d)).map(d => (d.lines && d.lines[0]) || {})
    .filter(l => sl.has(linjeNøkkel(l.id, l.code))).map(l => 'linje ' + l.code))].forEach(t => skjulteNavn.push(t));
  const here = (_stop && _stop.lat != null) ? { lat: _stop.lat, lon: _stop.lon } : null;
  const grp = new Map(synlige.map(d => [d, retningGruppe(d, here, gang, nå)]));
  // Knappene bare når valget betyr noe: noe går mot sentrum, og noe annet —
  // eller du har sagt hva hjemover er (v1.218.146).
  const hjemListe = hjemStopp();
  const harBegge = ([...grp.values()].some(v => v === 'mot') && [...grp.values()].some(v => v !== 'mot')) || hjemListe.length > 0;
  if (!harBegge) _atRetning = 'alle';
  // «Hjemover» står alltid (v1.218.147): uten stopp tar et trykk deg dit du velger dem.
  // «Andre retninger» delt i målområder når linjene herfra går flere veier.
  _oppdaterOmråder(synlige.filter(d => grp.get(d) !== 'mot' && !retningHjem(d, gang, nå, hjemListe)), here, nå);
  const knappValg = _atOmr.length ? ['alle', 'mot', 'hjem', ..._atOmr.map(o => o.id)] : AT_RETNINGER;
  if (!knappValg.includes(_atRetning)) _atRetning = 'alle';
  if (hjemListe.length) _hjemSøkOppdater(nå);
  const iRetning = _iRetning(synlige, nå);
  // GANGTID PER RAD (v1.218.171): til radens eget stopp.
  // KOORDINATENE til nabostoppet (v1.218.172): `_fra` bærer bare id og navn,
  // så gangtiden ble regnet mot ingenting — «1 min å gå» der kartet sa 7.
  const medKoord = f => (f && Number.isFinite(f.lat)) ? f : (f && _stops().find(s => s.id === f.id)) || null;
  const gangTilStopp = s => { const k = medKoord(s); const g = k && gangTil(k); return g ? g.mins : null; };
  const del = tavleDel(iRetning, nå, (ms, call) => canCatch(ms, radGang(call, gang, gangTilStopp), nå), _atGrense);
  // «Gå om N min» og rangering etter når du må gå — bare til fots.
  const tilFots = Number.isFinite(gang);
  if (tilFots) [...del.ikke, ...del.rekker].forEach(x => { x.gang = radGang(x.call, gang, gangTilStopp); x.gåOm = gåOm(x.ms, x.gang, nå); });
  // REKK DEN LENGER NED (v1.218.185), samme regel som Rute (src/rekkLengerNed.js):
  // en avgang du ikke rekker her, men lenger ned på samme tur, er en du rekker.
  if (tilFots) {
    const flytt = [];
    del.ikke = del.ikke.filter(x => {
      const rk = !x.innstilt && tavleRekk(x.call, x.call && x.call._fra ? medKoord(x.call._fra) : _stop, _gangMålt, x.gang, nå);
      if (rk && !rk.målt) sikreGang(_gangFra(), rk.stopp, { ferdig: () => _renderBody() });
      if (!rk) return true;
      Object.assign(x, { rekk: rk, rekker: true, gang: rk.gangMin, gåOm: gåOm(rk.ms, rk.gangMin, nå) });
      flytt.push(x);
      return false;
    });
    del.rekker = del.rekker.concat(flytt);
  }
  // Øverste rad som går fra et annet stopp, til kartet (v1.218.194).
  {
    const x = del.rekker.find(r => r.rekk || (r.call && r.call._fra));
    const s = x && (x.rekk ? { id: x.rekk.stopp.id, name: x.rekk.stopp.navn, lat: x.rekk.stopp.lat, lon: x.rekk.stopp.lon, gangMin: x.rekk.gangMin, målt: x.rekk.målt }
      : (k => k && { id: k.id, name: k.name, lat: k.lat, lon: k.lon, gangMin: x.gang, målt: (gangTil(k) || {}).målt })(medKoord(x.call._fra)));
    const før = _atAlt && (_atAlt.id || _atAlt.name), nå2 = s && (s.id || s.name);
    _atAlt = s && Number.isFinite(s.lat) ? s : null;
    if (s && Number.isFinite(s.lat) && !s.målt) sikreGang(_gangFra(), s, { ferdig: () => { _aKey = ''; _renderMap(); _renderBody(); } });
    if (før !== nå2) { _aKey = ''; setTimeout(() => _renderMap(), 0); }
  }
  // ANKOMST TIL DITT VANLIGE MÅL (v1.218.193): bare når turen stopper der.
  {
    const vanlige = loadFreq('arr');
    [...del.ikke, ...del.rekker].forEach(x => {
      const fra = x.rekk ? { id: x.rekk.stopp.id, name: x.rekk.stopp.navn } : (x.call && x.call._fra ? x.call._fra : _stop);
      x.ank = radAnkomst(x.call, fra, vanlige, nå);
    });
  }
  // BAK DEG (v1.218.172): stopp du går bort fra, kommer etter — også når
  // gangtiden ikke er kjent; retningen kommer fra sporet, ikke fra ruta.
  // Retningen mot stoppet du faktisk går på — lenger ned når raden rekkes der (v1.218.185).
  del.rekker.forEach(x => { x.bak = gangRetning(x.rekk ? { lat: x.rekk.stopp.lat, lon: x.rekk.stopp.lon } : x.call && x.call._fra ? medKoord(x.call._fra) : _stop, state.posTrail) === 'bak'; });
  if (tilFots || del.rekker.some(x => x.bak)) {
    const nøkkel = x => (x.d && (x.d.journeyId || x.d.id)) || (x.ms + '|' + (x.d && x.d.frontText));
    const verdi = x => ((x.rekk ? x.rekk.ms : x.ms) - (x.gang || 0) * 60_000) / 60_000 + (x.bak ? 1e6 : 0);
    del.rekker = roligSortering(del.rekker, _atRekke, nøkkel, verdi);
    _atRekke = del.rekker.map(nøkkel);
    if (tilFots && del.rekker[0]) del.rekker[0].best = true;
  }
  const retningKnapper = harBegge ? '<div class="auto-fra at-retning" role="group" aria-label="retning">'
    + knappValg.map(k => '<button type="button" class="auto-fra-knapp' + (k === _atRetning ? ' valgt' : '')
      + '" data-retning="' + k + '" aria-pressed="' + (k === _atRetning) + '"' + (k === 'hjem' ? ' title="hold for å velge stoppene"' : '') + '>' + esc(_retningTekst(k))
      + ((o => o && o.linjer && o.linjer.length ? '<small class="omr-linjer">' + esc(o.linjer.slice(0, 4).join(' ')) + '</small>' : '')(_atOmr.find(o => o.id === k))) + '</button>').join('') + '</div>' : '';
  // Avvikene per linje, samme kilde som retningskortene (v1.218.126).
  const perLinje = byLine(_alerts);
  const meld = id => perLinje.get(id) || [];
  // «Bytt på X» på radene når hjemover er valgt (v1.218.151).
  if (_atRetning === 'hjem') [...del.ikke, ...del.rekker].forEach(x => { x.bytte = retningHjemDom(x.d, gang, nå, hjemListe).bytte; });
  const rader = [...del.ikke, ...del.rekker];
  const kv = _autoTavle ? _kombiFor(_atRetning, here, nå) : null;
  const kombi = kv && Array.isArray(kv.tps) ? kombiRader(reiseRader(kv.tps, nå, null)).filter(r => r.gåOm >= 0).sort((a, b) => a.gåOm - b.gåOm) : [];
  // Si hva du ikke vet: leter, feilet — ikke stillhet.
  const kombiMerk = !kv ? '' : kv.tps === 'henter' ? '<div class="at-filter">ser etter reiser med bytte …</div>'
    : kv.tps === 'feil' ? '<div class="at-filter">fant ikke reiser med bytte nå</div>' : '';
  const hs = _stop && _hjemSøk.get(_stop.id);
  // RASKEST HJEM FRA ET ANNET STOPP (v1.218.153): starter den beste veien
  // fra et stopp tavla ikke viser (Majorstuen T fra trikkestoppet), sies det,
  // og et trykk gjør det stoppet til ditt.
  const rk = hs && hs.raskest;
  const nærHjem = _stop ? knutepunkt(_stop, _stops()) : [];
  const linjerHer = new Set(synlige.flatMap(d => (d.lines || []).map(l => l.id)).filter(Boolean));
  const raskestHtml = _atRetning === 'hjem' ? raskestHjemHtml(hs, nærHjem, linjerHer) : '';
  const hjemMerk = _atRetning !== 'hjem' || !hs ? '' : hs.henter ? '<div class="at-filter">leter etter reiser hjem med bytte …</div>'
    : hs.feil ? '<div class="at-filter">fant ikke reiser hjem med bytte herfra — viser bare direkte</div>' : (gåHjemHtml(hs, gang) || raskestHtml);
  const merknad = skjulteNavn.length ? '<div class="at-filter">skjult i kartets filter: ' + esc(skjulteNavn.join(', ')) + '</div>' : '';
  const ikkeHtml = del.ikke.length
    ? '<details class="at-ikke"' + (_atIkkeÅpen ? ' open' : '') + '><summary>' + del.ikke.length
      + (del.ikke.length === 1 ? ' avgang' : ' avganger') + ' du ikke rekker</summary><div class="at-liste">'
      + del.ikke.map((x, i) => tavleRadHtml(x, nå, i, meld)).join('') + '</div></details>'
    : '';
  const bunn = '<div class="at-bunn">' + (_atSlutt ? 'ikke flere avganger herfra' : _atHenter ? 'henter flere …' : '') + '</div>';
  body.innerHTML = retningKnapper + (rader.length
    ? '<div class="set-label">' + (Number.isFinite(_fraMs) ? 'avganger ' + esc(fraTidTekst(_fraMs, nå)) : 'neste avganger herfra') + '</div>' + merknad + hjemMerk + ikkeHtml
      + kombiMerk + '<div class="at-liste">' + (() => {
        // Flettet inn etter «gå om» blant de direkte radene — en rad i lista, ikke en boks.
        const ut = [], k = kombi.slice();
        del.rekker.forEach((x, i) => {
          while (k.length && Number.isFinite(x.gåOm) && k[0].gåOm < x.gåOm) ut.push(_kombiRadHtml(k[0], kombi.indexOf(k.shift())));
          ut.push(tavleRadHtml(x, nå, del.ikke.length + i, meld));
        });
        k.forEach(r => ut.push(_kombiRadHtml(r, kombi.indexOf(r))));
        return ut.join('');
      })() + '</div>' + bunn
    : merknad + hjemMerk + '<div class="dest-prev-empty">' + (skjulteNavn.length && _dirs.length ? 'alt herfra er skjult i kartets filter' : (_atRetning !== 'alle' ? 'ingen avganger ' + _retningTekst(_atRetning) + ' herfra nå' : 'ingen avganger herfra den nærmeste timen')) + '</div>');
  body.querySelectorAll('.at-raskest[data-pin]').forEach(b => b.addEventListener('click', () => { if (pinStop(b.dataset.pin)) _renderBody(); }));
  body.querySelectorAll('.at-retning [data-retning]').forEach(b => b.addEventListener('click', () => {
    if (_hjemHold.brukt) { _hjemHold.brukt = false; return; }   // langt trykk er ikke et valg
    // Uten stopp valgt er hjemover et spørsmål: hva er hjem? Svaret står i innstillinger.
    if (b.dataset.retning === 'hjem' && !hjemStopp().length) { tilHjemoverInnstilling(); return; }
    _atRetning = b.dataset.retning; _lagreRetning(_atRetning); _atGrense = TAVLE_SIDE; _renderBody();
  }));
  _hjemLangtTrykk(body);
  const det = body.querySelector('.at-ikke');
  if (det) det.addEventListener('toggle', () => { _atIkkeÅpen = det.open; });
  // Trykk på en kombinasjon: kartet viser gangen til påstigningen.
  body.querySelectorAll('.at-kombi').forEach(b => b.addEventListener('click', () => {
    const r = kombi[Number(b.dataset.kombi)];
    if (r && r.fraLL) { _atGangTil = { id: 'kombi:' + r.fraLL.name, name: r.fraLL.name, lat: r.fraLL.lat, lon: r.fraLL.lon }; _aKey = ''; _renderMap(); }
  }));
  body.querySelectorAll('.at-rad').forEach(b => b.addEventListener('click', () => {
    const x = rader[Number(b.dataset.i)];
    if (!x) return;
    // ETT TRYKK → AVGANGSDETALJER (v1.218.181). Før: trykket åpnet stopplista,
    // og et stopp der laget en Rute og åpnet tavla — to trykk, og ikke
    // avgangen du trykket på. Nå: det kallet, med målet appen alt vet
    // (kjentMål), ellers spør avgangsdetaljene «hvor går du av?».
    // Rekkes den lenger ned, er det DER du går på (v1.218.185).
    const c = x.rekk ? rekkKall(x.call, x.rekk) : x.call;
    if (c && typeof window !== 'undefined' && window.tap) {
      c._dir = tavleDetaljDir(c, _stop, medKoord, loadFreq('arr'), Date.now());
      window.tap(c);
      return;
    }
    // Uten kallet (eller uten avgangsdetaljer): som før.
    _open = x.d; _atGangTil = (c && c._fra && medKoord(c._fra)) || null; _renderBody(); _renderMap();
  }));
  // UENDELIG RULLING: når bunnen synes, en side til; tomt lokalt → hent neste.
  if (_atObs) { _atObs.disconnect(); _atObs = null; }
  const vakt = body.querySelector('.at-bunn');
  if (!vakt || _atSlutt || typeof IntersectionObserver === 'undefined') return;
  _atObs = new IntersectionObserver(innslag => {
    if (!innslag.some(e => e.isIntersecting) || _atHenter) return;
    if (!del.tomForLokale) { _atGrense += TAVLE_SIDE; _renderBody(); return; }
    _atHenter = true; _renderBody();
    const fra = (del.sisteMs || Date.now()) + 1000, stopp = _stop;
    fetchBoardPage({ key: 'custom-out', from: stopp.name, stopId: stopp.id, to: '', line: null, filter: null }, fra, 30, calls => {
      _atHenter = false;
      if (!_stop || _stop.id !== stopp.id) return;
      const nye = (calls || []).filter(c => Date.parse(c.expectedDepartureTime || c.aimedDepartureTime) >= fra);
      if (!nye.length) _atSlutt = true; else { _atEkstra.push(...nye); _atGrense += TAVLE_SIDE; }
      _renderBody();
    }, () => { _atHenter = false; _atSlutt = true; _renderBody(); });
  }, { rootMargin: '200px' });
  _atObs.observe(vakt);
}
if (typeof window !== 'undefined') { window._settAutoTavle = settAutoTavle; window._erAutoTavle = erAutoTavle; }

function _renderBody() {
  _kortRute = null;
  // ↑ Nullstilt hvert tikk; settes igjen bare når lista faktisk har et kort.
  // Ellers ville et kort fra et stopp du har gått fra blitt stående på kartet.
  // Et passert tidspunkt slipper av seg selv (v1.218.130).
  if (fraUtløpt(_fraMs, Date.now())) { settFraValg(null); return; }
  // Tiden endret i innstillinger mens den var valgt: regn og hent på nytt (v1.218.132).
  if (_fraValg && _fraSignatur(_fraValg) !== _fraTidVed) { settFraValg(_fraValg); return; }
  _tegnFraValg();
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
  // AUTO-TAVLE (v1.218.107): samme stopp og samme data, tegnet som tavlerader.
  if (_autoTavle && _dirs.length) { _visListeDel(false); _tegnAutoTavle(body); return; }
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
  // TOGET DU SITTER PÅ er ikke en avgang du skal rekke (v1.218.69).
  // Rapportert: «3 mot Stortinget · nå» øverst i lista, om bord på den.
  const live = _lås ? utenEgetTog(_liveRows(now), _lås.k && _lås.k.nøkkel) : _liveRows(now);
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
  /** Gruppen raden står i: 'mot' sentrum, ellers null («andre retninger»). */
  const gruppe = i => side.get(i);
  for (const { d, i } of live) {
    // The row's own onward stops, for the centre grouping. Read from the
    // departure you can catch, so the row is judged by the journey the
    // reader would actually take (v1.142.0).
    side.set(i, retningGruppe(d, here, walkMins, now));
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
    { her: _stop, hist: loadSmartHist() }, _fraModus === 'ankomst' ? _fraMs : null);
  _kortNavnFra(dests);
  // Samme kort og samme alternativ som kortets overskrift: kartet og kortet
  // skal vise samme reise.
  const k0 = dests[0], o0 = k0 && k0.options && k0.options[0];
  // Koordinaten til målet følger med (v1.218.39), så «raskere å gå av» kan
  // spørre om turen du sitter på er på vei MOT det.
  const mål0 = o0 ? stopsAhead(o0.call, _stop && _stop.name, now).find(st => (k0.id && st.id === k0.id) || stopKey(st.name) === stopKey(k0.name)) : null;
  _kortRute = o0 ? { navn: k0.name, id: k0.id || null, d: o0.d, call: o0.call,
    lat: mål0 && Number.isFinite(mål0.lat) ? mål0.lat : null, lon: mål0 && Number.isFinite(mål0.lon) ? mål0.lon : null } : null;
  // TAVLAS VALG ER KARTETS TEMA (v1.218.85), foran vanekortet: den valgte
  // avgangen (samme tur) eller første du rekker til tavlas mål. Da tegner
  // kartet linja til målet, uthever sporet og sender gangruta dit — samme vei
  // som kortet allerede går.
  {
    const h = hensikt(state.jny, state.route, now);
    if (h) {
      let funnet = null;
      (_dirs || []).forEach(d => (d.calls || []).forEach(x => {
        if (funnet || !x || !x.call) return;
        const sj = x.call.serviceJourney;
        if (h.styrke === 'reise' ? sammeTur(sj && sj.id, h.journeyId)
          : (catchable(d, walkMins, now).some(r => r.call === x.call)
            && stopsAhead(x.call, _stop && _stop.name, now).some(st => stopKey(st.name) === stopKey(h.mål)))) funnet = { d, call: x.call };
      }));
      // Avgangen er gått og står ikke lenger på tavla: reisens eget kall (v1.218.90).
      if (!funnet && h.styrke === 'reise') {
        const rk = reiseKall(state.jny);
        if (rk) funnet = { call: rk, d: { frontText: rk.destinationDisplay.frontText, call: rk, calls: [],
          lines: [{ code: rk.serviceJourney.line.publicCode, colour: rk.serviceJourney.line.presentation.colour }] } };
      }
      if (funnet) {
        const m = stopsAhead(funnet.call, _stop && _stop.name, now).find(st => stopKey(st.name) === stopKey(h.mål));
        _kortRute = { navn: h.mål, id: h.målId || (m && m.id) || null, d: funnet.d, call: funnet.call, hensikt: h.styrke,
          // Sanntid fra turen: hodet og mållappen sier samme ankomst (v1.218.86).
          ank: m && Number.isFinite(m.at) ? m.at : null,
          lat: m && Number.isFinite(m.lat) ? m.lat : null, lon: m && Number.isFinite(m.lon) ? m.lon : null };
      }
    }
  }
  // PARTITIONED, not a heading emitted whenever the value changes. The list
  // is already sorted by the reader's own choice (T-bane først / Lokalbuss
  // først), and a heading-on-change would interleave «mot sentrum» through
  // that order three times over. Within each group the chosen order is kept
  // exactly as it was.
  // TO GRUPPER, IKKE TRE (v1.218.33). Bestilt: «kutt «Fra sentrum» og legg
  // alt som ikke er mot sentrum under «Andre retninger».» `centreward` svarer
  // fortsatt mot/fra/null; skjermen spør bare om raden går mot sentrum.
  // HJEMOVER SOM EGEN SEKSJON (v1.218.156). Valgt: «Seksjon, rekkefølge etter
  // tid» — samme regel som tavlas hjemover-knapp (retningHjemDom), og
  // gruppen som passer tiden på døgnet står øverst.
  const hjemListeAR = hjemStopp();
  if (hjemListeAR.length) _hjemSøkOppdater(now);
  const hjemAR = new Map(live.map(({ d, i }) => [i, hjemListeAR.length ? retningHjemDom(d, walkMins, now, hjemListeAR) : { hjem: false, bytte: null }]));
  const gruppeAR = i => (hjemAR.get(i) && hjemAR.get(i).hjem ? 'hjem' : gruppe(i));
  const rekke = seksjonRekkefølge(now);
  const groups = rekke.map(k => [k, []]);
  for (const row of live) groups[rekke.indexOf(gruppeAR(row.i))][1].push(row);
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
  // NÅR DU MÅ GÅ (v1.218.36), på alternativet, så kortet og lista leser samme
  // gangtid (`walkMins`, den samme `catchable` stryker med).
  dests.forEach(x => (x.options || []).forEach(o => { o.gåMin = walkMins == null ? null : minsToLeave(o.ms, walkMins, now); }));
  // OM BORD (v1.218.48): går turen du sitter på selv til målet, er svaret
  // «bli sittende» — ikke et bytte fra stasjonen tavla viser. Rapportert: T2
  // fra Hellerud til Jernbanetorget, fra en linje 3 som skulle dit.
  dests.forEach(x => {
    x.bliSittende = _lås ? (_bliSittendeMs(_lås.k, x.id, now) || _bliSittendeNavn(_lås.k, x.name, now)) : null;
    x.bliLinje = x.bliSittende && _lås ? _lås.k.linje : null;
  });
  const destHtml = (x, n) => kortHtml(x, n);

  /* KORTENE I SIN EGEN CONTAINER, radene i sin.
   *
   * De sto i samme `innerHTML`, og da kunne ingen statisk bryter stå mellom
   * dem — som er hele grunnen til at den havnet over begge. «Hvor skal du?»
   * er flyttet til index.html, rett over bryteren, så overskriften og
   * kontrollen hører sammen uten at noen av dem tegnes på nytt hvert sekund. */
  // GÅ HIT (v1.218.143): søk fra der du står, kort der rådet er et annet stopp.
  const _her = userLL();
  // Et hopp (testposisjonen byttet) tømmer alt: ingen råd fra forrige sted.
  if (_her && _gåHitSist && metresBetween(_gåHitSist, _her) > GÅHIT_HOPP_M) { _gåHit.clear(); _gåHitVis = null; _gåHitBedt.clear(); }
  if (_her) _gåHitSist = { lat: _her.lat, lon: _her.lon };
  if (!_reiseInfo && !_lås && _her) _gåHitOppdater(_her, now);
  const nærIds = _stop ? knutepunkt(_stop, _stops()).map(s => s.id) : [];
  const gåKort = (_reiseInfo || _lås) ? [] : [..._gåHit.entries()]
    .filter(([id, v]) => (GÅHIT_AUTO || _gåHitBedt.has(id)) && rådGjelder(v, _her, _stop, metresBetween)
      && (!GÅHIT_AUTO || annetStopp(v.råd, nærIds))).map(([id, v]) => ({ id, navn: v.navn, råd: v.råd }));
  const gåNavn = new Set(gåKort.map(k => stopKey(k.navn)));
  // Målene gå-hit-kortene alt svarer for, står ikke to ganger.
  // Bedt om (v1.218.149): kortet står, med knappen som skjuler rådet igjen.
  const destsHer = GÅHIT_AUTO ? dests.filter(x => !gåNavn.has(stopKey(x.name))) : dests;
  // Si hva du ikke vet: et råd du har bedt om, som ikke er her ennå.
  const gåVenter = GÅHIT_AUTO ? [] : [..._gåHitBedt.entries()].filter(([id]) => !gåKort.some(k => k.id === id))
    .map(([id, navn]) => { const v = _gåHit.get(id); return navn + ': ' + (v && v.feil ? 'fant ikke noe råd' : v && !v.henter && v.pos ? 'ingen reise funnet herfra' : 'leter etter beste holdeplass …'); });
  if (_gåHitVis && !gåKort.some(k => k.id === _gåHitVis) && !_gåHitBedt.has(_gåHitVis)) _gåHitVis = null;   // venter på svaret
  const destBody = _el('auto-dest-body');
  if (destBody) {
    destBody.innerHTML = _reiseInfo
      // DIN REISE (v1.218.52): det valgte målet, ikke en gjetning; de andre
      // vanekortene foldet, ikke slettet.
      // Kortet sa det hodet sier (v1.218.69): «går av på Jernbanetorget · 8
      // stasjoner igjen» to ganger. Står avstigningen i hodet, står ikke kortet.
      ? (Number.isFinite(_reiseInfo.igjen) ? '' : reiseKortHtml(_reiseInfo.r, _reiseInfo.igjen))
        + (() => {
          // Ikke reisens eget mål en gang til.
          const andre = dests.map((x, n) => ({ x, n })).filter(({ x }) => stopKey(x.name) !== stopKey(_reiseInfo.r.dest));
          return andre.length ? '<details class="auto-andre-mål"><summary class="auto-side">andre mål · ' + andre.length + '</summary>'
            + andre.map(({ x, n }) => destHtml(x, n)).join('') + '</details>' : '';
        })()
      // Startet reise uten lås (v1.218.90): de andre målene foldet, ikke foreslått.
      : erReiseStartet(state.jny, state.route, now)
        ? (dests.length ? '<details class="auto-andre-mål"><summary class="auto-side">andre mål · ' + dests.length + '</summary>'
          + dests.map(destHtml).join('') + '</details>' : '')
      : ((gåKort.length || gåVenter.length) ? '<div class="set-label">beste holdeplass</div>' + gåHitKortHtml(gåKort, now)
        + gåVenter.map(t => '<div class="dest-prev-empty">' + esc(t) + '</div>').join('') : '')
      + (destsHer.length
        // Overskriften sier hva kortene bygger på (v1.218.97): en vane nå,
        // eller bare steder du har reist til før. Bare over kort som står der.
        ? '<div class="set-label">' + (destsHer.some(x => x.vane || x.retning === 'mot') ? 'dit du pleier nå' : 'steder du har valgt før') + '</div>'
          + destsHer.map(x => destHtml(x, dests.indexOf(x))).join('')
        : '');
  }

  /* OVERSKRIFTEN UNDER, FRA DET ENE STEDET SOM VET OM DET BLE KORT.
   *
   * Ikke fra `_visListeDel`: den kalles før `dests` er regnet ut, og å flytte
   * det kallet for å få tak i et tall ville vært å endre rekkefølgen på en
   * render for en etikett. Er seksjonen skjult, spiller teksten ingen rolle,
   * så ingen av `_visListeDel(false)`-stiene trenger å nullstille noe. */
  const whereLabel = _el('auto-where-label');
  // Uten kort over er «reisealternativer» en overskrift over det eneste som
  // står der; «mot sentrum» under sier allerede hva lista er (v1.218.28).
  if (whereLabel) { whereLabel.textContent = listeOverskrift(dests.length > 0); whereLabel.hidden = !dests.length || !!_reiseInfo; }

  let shown;
  /* GRUPPEN I MOTSATT RETNING AV MØNSTERET, FOLDET (src/maalModell.js
   * `foldetSide`). Unntatt når dine egne mål akkurat nå ligger i den. */
  const egneSider = new Set();
  dests.filter(x => x.eget > 0).forEach(x => x.options.forEach(o => { const k = gruppe(o.i); if (k) egneSider.add(k); }));
  // Om morgenen er hjemover foldet; ellers den gamle regelen (v1.218.156).
  const foldet = !grouped ? null : (rekke[0] === 'mot' && groups.some(([k, r]) => k === 'hjem' && r.length)) ? 'hjem'
    : foldetSide(now, _stop, egneSider, stedType(_herSom(), _profilNå().p));
  const antallI = k => ordered.filter(({ i }) => gruppeAR(i) === k).length;
  let iFold = false;
  // SI DET: i fart strykes ingen rad på gangtid, og ustrøkne rader uten
  // forklaring leses som at alt kan nås.
  const fartNotis = gangGjelder(fartNå(now), state.walkFromLL !== null) ? ''
    : '<div class="i-fart-notis">' + esc(I_FART_NOTIS) + '</div>';
  body.innerHTML = fartNotis + oppdatertHtml(_hentetMs, now, typeof navigator !== 'undefined' ? navigator.onLine !== false : true)
    // NÆR HJEM (v1.218.158): «gå hjem» øverst; avgangene er da ikke hjemover.
    + (hjemListeAR.length ? gåHjemHtml(_stop && _hjemSøk.get(_stop.id), Number.isFinite(walkMins) ? Math.ceil(walkMins) : 0) : '')
    + ordered.map(({ d, i }) => {
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
        const k = gruppeAR(i);
        if (k !== shown) {
          shown = k;
          const navn = k === 'hjem' ? 'hjemover' : k ? CENTRE_LABEL[k] : 'andre retninger';
          head = (iFold ? '</details>' : '')
            + (k && k === foldet
              ? '<details class="auto-side-fold"' + (_sideFoldÅpen ? ' open' : '') + '><summary class="auto-side">'
                + esc(navn + ' · ' + antallI(k)) + '</summary>'
              : '<div class="auto-side"' + (k === 'hjem' ? ' data-hjem-side="1" title="hold for å velge stoppene"' : '') + '>' + esc(navn) + '</div>')
            + (k === 'hjem' ? raskestHjemHtml(_stop && _hjemSøk.get(_stop.id), _stop ? knutepunkt(_stop, _stops()) : [],
              new Set(live.flatMap(({ d }) => (d.lines || []).map(l => l.id)).filter(Boolean))) : '');
          iFold = !!(k && k === foldet);
        }
      }
      const din = erDinAvgang(d, _kortRute);
      return head + '<button class="nearby-btn auto-dir'
        + (hint ? ' auto-usual auto-usual-' + vane.kind : '') + (din ? ' auto-din' : '') + '"'
        + ' type="button" data-i="' + i + '"'
        + ' title="' + esc(full) + '" aria-label="' + esc(full) + '">'
        + '<span class="auto-badges">' + d.lines.map(badgeHtml).join('')
        + msg.mark
        + '</span>'
        + '<span class="nearby-name">mot ' + esc(d.frontText)
        + (hjemAR.get(i) && hjemAR.get(i).bytte ? '<span class="auto-bytte">bytt på ' + esc(hjemAR.get(i).bytte) + '</span>' : '') + '</span>'
        // DIN AVGANG (v1.218.86): raden for tavlas valg merkes; den flyttes ikke.
        + (din ? '<span class="auto-din-merke">din avgang</span>' : '')
        // REKK DEN LENGER NED (v1.218.190): samme tekst som Rute og Auto-tavle.
        + ((rk => rk ? '<span class="auto-rekk">rekker ikke her — ' + esc(rekkTekst(rk, clk)) + '</span>' : '')(
          _stop ? _retningRekkMålt(d, walkMins, now) : null))
        // Its own element, not part of the name: a long destination and the
        // platform on one line wrapped the row to two on a 414px screen —
        // measured. The name is the flexible one and gives way first; the
        // platform is two characters and must never be the part that
        // truncates, because it is the part you cannot guess.
        // SPORET PÅ TIDSLINJA (v1.218.36): ved siden av navnet ble det skjøvet
        // ned på egen linje når navnet var langt («73 mot Holmlia stasjon /
        // plattform B»), og sto til høyre på de andre radene. Navnet forkortes
        // ikke (rapportert «mot Hels…»), så sporet flytter: alltid venstre på
        // linja med tidene, samme plass på hver rad.
        // "2 · 12 · 22 min": the one you might catch, then the fallbacks.
        //
        // Text inside the existing span, not new children. settings.css:267
        // warns in plain words that a third child pushes the label adrift
        // under space-between — and that warning is there because it happened.
        + '<span class="nearby-dist">' + vaneHtml
        + (q ? '<span class="auto-quay" aria-hidden="true">' + esc(q) + '</span>' : '')
        + radBeleggHtml(d.call)
        + '<span class="auto-trommel" data-trommel="' + esc(trommelNøkkel(d)) + '">' + _timesHtml(d, now, walkMins, { trommel: true }) + '</span></span>'
        + nattRadHtml(d, _natt)
        + '</button>'
        + msg.block;
    }).join('') + (iFold ? '</details>' : '')
    + nattFerdigeHtml(_dirs, _natt)
    // SAID, NOT IMPLIED. The list is complete at a small stop and cut at a
    // hub, and it looked identical either way — so it earned trust where it
    // was right and spent it where it was not. One quiet line, only when
    // there is something to admit.
    + (_truncated
      ? '<div class="auto-more-note">flere avganger enn vi får plass til \u2014 '
        + 'vis flere stopp eller velg en linje for hele lista</div>'
      : '');
  // OM BORD PÅ REISEN DIN (v1.218.52): avgangene fra stoppet er ikke spørsmålet
  // lenger. Foldet til én linje — ett trykk unna om du ombestemmer deg.
  if (_reiseInfo) body.innerHTML = '<details class="auto-avg-fold"' + (_avgÅpen ? ' open' : '') + '><summary class="auto-side">avganger fra '
    + esc((_stop && _stop.name) || 'stoppet') + ' · ' + ordered.length + '</summary>' + body.innerHTML + '</details>';
  // TROMMELEN BLIR STÅENDE (v1.218.139): lista tegnes hvert sekund, og en
  // trommel som hoppet tilbake til start hver gang ville vært uro.
  if (_trommelStopp !== (_stop && _stop.id)) { _trommelStopp = _stop && _stop.id; _trommelPos.clear(); }
  body.querySelectorAll('.auto-trommel').forEach(t => {
    const k = t.dataset.trommel;
    if (_trommelPos.has(k)) t.scrollLeft = _trommelPos.get(k);
    // Kanten tones bare der det finnes mer å rulle til — ellers kuttes en tid
    // som står der i sin helhet.
    const kanter = () => { t.classList.toggle('mer-venstre', t.scrollLeft > 2);
      t.classList.toggle('mer-hoyre', t.scrollLeft + t.clientWidth < t.scrollWidth - 2); };
    kanter();
    t.addEventListener('scroll', () => { _trommelPos.set(k, t.scrollLeft); _trommelSveip = Date.now(); kanter(); }, { passive: true });
  });
  body.querySelectorAll('.at-raskest[data-pin]').forEach(b => b.addEventListener('click', () => { if (pinStop(b.dataset.pin)) _renderBody(); }));
  _hjemLangtTrykk(body);
  body.querySelectorAll('.auto-dir').forEach(b => {
    b.addEventListener('click', () => {
      if (Date.now() - _trommelSveip < TROMMEL_SVEIP_MS) return;   // en sveip er ikke et trykk
      _open = _dirs[Number(b.dataset.i)]; _renderBody();
    });
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
  if (destBody) destBody.querySelectorAll('[data-gaa-be]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const id = b.dataset.gaaBe;
    if (_gåHitBedt.has(id)) { _gåHitBedt.delete(id); _gåHit.delete(id); if (_gåHitVis === id) _gåHitVis = null; }
    else { _gåHitBedt.set(id, b.dataset.gaaNavn); _gåHitVis = id; _aUserMoved = false; }
    _aKey = ''; _renderBody();
  }));
  if (destBody) destBody.querySelectorAll('.auto-gaa').forEach(b => b.addEventListener('click', () => {
    // Et nytt valg er en ny ramme, også om du har dratt i kartet før.
    _gåHitVis = _gåHitVis === b.dataset.gaa ? null : b.dataset.gaa; _aKey = ''; _aUserMoved = false; _renderBody();
  }));
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
/** Teksten på sorteringsknappen: valget som gjelder, og at den bytter. */
export function sorterKnappTekst(ends, desc) {
  return (desc ? ends.desc : ends.asc) + ' først ⇅';
}

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

  destBody.querySelectorAll('.auto-dest:not(.auto-gaa)').forEach(b => {   // gå-hit-kortene har sin egen (v1.218.143)
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
  if (Number.isFinite(x.bliSittende)) return _bliSittendeKort(x, n);
  const o = x.options[0];
  const q = quayLabel(o.call);
  const ln = (o.d.lines && o.d.lines[0]) || {};
  // «gå om N min» — det kortet manglet: det sa når toget går, ikke når DU går.
  // Over en time fram (et valgt tidspunkt): klokkeslett, ikke «gå om 1068 min» (v1.218.136).
  const gå = Number.isFinite(o.gåMin) ? (o.gåMin <= 0 ? ' · gå nå' : o.gåMin > 60 ? ' · gå ' + clk(Date.now() + o.gåMin * 60_000) : ' · gå om ' + o.gåMin + ' min') : '';
  const how = 'mot ' + o.d.frontText + (q ? ' · ' + q : '') + ' · går ' + clk(o.ms) + gå;
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
      + (annet ? ' · ' + annet : '')
      + (x.også && x.også.length ? ' · også ' + x.også.map(y => y.name + ' ' + clk(y.at)).join(', ') : '')) + '">'
    + '<span class="auto-dest-top">'
    + '<span class="auto-dest-name">' + esc(x.name) + '</span>'
    + '<span class="auto-dest-at">' + esc('framme ' + clk(o.at)) + '</span>'
    + '</span>'
    // Hvorfor dette står her (src/maalModell.js), når det er noe å si.
    // Hvorfor kortet står her. Uten en grunn fra konteksten er det et vanemål
    // herfra — sagt, så det ikke leses som at du skal dit nå (v1.218.55).
    + '<span class="auto-dest-grunn">' + esc(x.grunn || grunnUtenVane(x.uses)) + '</span>'
    + (x.også && x.også.length ? '<span class="auto-dest-ogsa">' + esc('også ' + x.også.map(y => y.name + ' ' + clk(y.at)).join(' · ')) + '</span>' : '')
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
    + '</span>'
    // GÅ HIT NÅR DU BER OM DET (v1.218.149): ett søk for dette målet.
    // UTENFOR raden (v1.218.157): inni den brøt raden til to linjer, og
    // den skjulte ×-en sto synlig alene på den andre.
    + (x.id ? '<button class="auto-dest-gaa" type="button" data-gaa-be="' + esc(x.id) + '" data-gaa-navn="' + esc(x.name) + '"'
      + ' aria-pressed="' + _gåHitBedt.has(x.id) + '">' + (_gåHitBedt.has(x.id) ? 'skjul holdeplassråd' : '\u{1F6B6} beste holdeplass?') + '</button>' : '');
}

/**
 * Rekkefølgen etter hvor du er på vei. Bestilt: «Rekkefølgen på kortene
 * under «Dit du ofte skal» bør være iht. sannsynlig reiseretning bruker er
 * på.» Et sted sporet ditt nærmer seg (`approach` → 'mot') står først, så de
 * sporet ikke sier noe om, og sist de du fjerner deg fra. Innenfor samme
 * retning avgjør bruken, som før. Uten spor er rekkefølgen som før.
 */
export const RETNING_RANG = { mot: 0, staar: 1, 'vet-ikke': 1, fra: 2 };

export function destinations(live, freq, walkMins, now, fromName, trail, modell, frist = null) {
  const før = Number.isFinite(frist);   // «fremme før» (v1.218.136)
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
    // FREMME FØR (v1.218.136): alle avgangene du rekker, ikke bare den første;
    // per sted beholdes den SISTE som er framme innen fristen.
    const rides = før ? catchable(d, walkMins, now) : catchable(d, walkMins, now).slice(0, 1);
    rides.forEach(ride => stopsAhead(ride.call, fromName, now).forEach(st => {
      if (før && !(st.at <= frist)) return;
      const n = usesOf(st, { byId, byName });
      if (!n) return;
      const key = stopKey(st.name);
      if (!key) return;
      const prev = out.get(key)
        || { name: st.name, id: st.id, uses: n, options: [], lat: st.lat, lon: st.lon };
      // The same row twice keeps only its own earliest arrival: one row is
      // one way there, whatever it is called on the way.
      const seen = prev.options.find(o => o.i === i);
      if (seen) { if (før ? st.at > seen.at : st.at < seen.at) { seen.at = st.at; seen.call = ride.call; seen.ms = ride.ms; } }
      else prev.options.push({ i, d, call: ride.call, ms: ride.ms, at: st.at });
      prev.uses = Math.max(prev.uses, n);
      out.set(key, prev);
    }));
  });

  return [...out.values()]
    .map(x => ({ ...x, options: x.options.slice().sort((a, b) => før ? b.at - a.at : a.at - b.at) }))
    .map(x => ({ ...x, retning: (trail && trail.length && Number.isFinite(x.lat))
      ? approach(trail, { lat: x.lat, lon: x.lon }).kind : 'vet-ikke' }))
    // HVOR DU MEST SANNSYNLIG SKAL NÅ (src/maalModell.js): ditt mønster for
    // tid og dagtype blandet med det vanlige mønsteret. Bevegelsen går foran.
    .map((x, _, alle) => {
      if (!modell) return x;
      if (!alle._r) {
        // Samme kontekst som «din vanlige reise» (v1.218.54).
        const { p: pr, m: ma } = _profilNå();
        const kx = kontekstNå(now, _herSom(), pr, ma);
        alle._r = new Map(rangerMål(alle, { nå: now, her: modell.her, hist: modell.hist, profil: kx.profilMål, svar: nesteSvarFor }).map(r => [r.kort.name, r]));
      }
      const r = alle._r.get(x.name);
      return { ...x, p: r ? r.p : 0, eget: r ? r.eget : 0, vane: !!(r && r.vane),
        grunn: x.retning === 'mot' ? 'på vei dit' : (r ? r.grunn : '') };
    })
    .sort((a, b) => (RETNING_RANG[a.retning] - RETNING_RANG[b.retning])
      || ((b.p || 0) - (a.p || 0)) || b.uses - a.uses || a.name.localeCompare(b.name, 'nb'))
    .reduce(slåSammenSammeAvgang, [])
    .slice(0, DEST_BLOCK);
}

/**
 * ETT KORT PER AVGANG (v1.218.97). Rapportert: «Jernbanetorget» og «Helsfyr»
 * som to kort med samme T-bane 3 kl. 19:09. Det er én beslutning, ikke to.
 * Et mål som nås med samme første avgang som et kort over, blir en linje i
 * det kortet («også Helsfyr 19:27») og ikke et eget kort. Foldet, ikke slettet.
 */
export function slåSammenSammeAvgang(acc, x) {
  const o = x.options && x.options[0];
  const vert = o && acc.find(a => a.options && a.options[0] && a.options[0].i === o.i);
  if (!vert) { acc.push(x); return acc; }
  vert.også = [...(vert.også || []), { name: x.name, at: o.at }].sort((a, b) => a.at - b.at);
  return acc;
}

/** Grunnen når modellen ikke har noen: sagt med det appen faktisk vet. */
export function grunnUtenVane(uses) {
  // `uses` er VALG (usage.js), ikke reiser (v1.218.105): ordene sier det.
  return uses >= 3 ? 'ofte valgt herfra' : 'valgt før';
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
    utenAndre: !!_lås,
  });
  // Bare reiser du kan ta herfra, og ikke de kortene alt viser (v1.218.51).
  // «Velg rute» viser fortsatt den globale lista.
  renderRouteShortcuts('auto-fav-routes', 2, liste => relevanteSnarveier(liste,
    _stop ? [_stop, ...nearbyAlternatives(_stops(), _stop)] : [], _kortNavn));
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
