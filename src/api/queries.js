/**
 * How far into the past a departure board still reaches.
 *
 * Matches the app's own existing definition of still-boardable:
 * selected.js keeps «reis →» enabled until depTs < now - 120000. Asking the
 * API from now forward meant a train standing at the platform a minute late
 * had already fallen out of the response — invisible at exactly the moment
 * someone is running for it.
 */
export const LOOKBACK_MINS = 2;

/** now - LOOKBACK_MINS, as the ISO string both queries below want. */
export function lookbackISO(now) {
  return new Date((now == null ? Date.now() : now) - LOOKBACK_MINS * 60000).toISOString();
}

/**
 * The situation fields every query asks for.
 *
 * `summary` is a HEADING — Entur puts "Anbefaling for reiser til Oslo
 * sentrum" there and the recommendation itself in `description`, with any
 * advice in `advice`. Asking for the heading alone meant the banner could
 * never show what a message actually said; that was not a rendering bug but
 * data we never requested.
 *
 * `basic` is the same fragment without the two text fields. Both tripGQL's
 * existing minimal retry and fetchBoard's new one fall back to it, so an
 * unknown field name cannot take the departure list down — which matters
 * because these names cannot be checked against the live API from a
 * sandbox that cannot reach it.
 */
/**
 * What a situation is ABOUT, when the schema will tell us.
 *
 * A situation carries no identifiers otherwise — id, summary, description,
 * advice, severity, validity, and nothing that says which line or stop it
 * concerns. Reported: a bus from Bjørndal shown to a reader riding metro line
 * 3, because the message hung on the destination stop and nothing could tell
 * the two apart.
 *
 * `affects` is the field that can. It is ASKED AS A PROBE: these type names
 * cannot be checked against the live schema from a sandbox that reaches
 * neither api.entur.io nor Entur's docs, and an unknown field takes the whole
 * query down with `{errors, data:null}` on HTTP 200. So the caller drops it
 * and remembers on a rejection, exactly as it already does for `coach` and
 * `searchWindow`.
 *
 * Without it the app falls back to provenance alone — where the message hung
 * — which is today's behaviour, not something worse.
 */
export const AFFECTS_GQL = ' affects{__typename'
  + ' ... on AffectedLine{line{id}}'
  + ' ... on AffectedStopPlace{stopPlace{id}}'
  + ' ... on AffectedQuay{quay{stopPlace{id}}}'
  + ' ... on AffectedServiceJourney{serviceJourney{id}}}';

export function sitsGQL(basic, withAffects) {
  return 'situations{id summary{language value}'
    + (basic ? '' : ' description{language value} advice{language value}')
    + ' severity validityPeriod{startTime endTime}'
    + (withAffects ? AFFECTS_GQL : '')
    + '}';
}

/**
 * How far ahead the trip planner is asked to look, IN MINUTES.
 *
 * OTP2 sizes its search window from local frequency when none is given,
 * which is generous in Oslo and can close before the next departure at a stop
 * with two services a day. Measured: Mortensrud→Stortinget returned 6/6 trip
 * patterns while Storaas Gjestegård→Jernbanetorget returned 0/0 in the same
 * minute, with no error at all.
 *
 * THE UNIT IS NO LONGER A GUESS. v1.86.1 sent 43200, chosen to be useful
 * whether the field counted minutes or seconds, and Entur answered:
 *
 *   The search window cannot exceed PT48H
 *
 * Forty-three thousand two hundred SECONDS is twelve hours and would have
 * been accepted. It was refused, so the field counts MINUTES and the ceiling
 * is 2880. That is measured, not reasoned — the first thing in this corner of
 * the app that stopped being unverifiable.
 *
 * 1440 rather than the 2880 maximum: twenty-four hours catches both of the
 * day's departures at a rural stop, journeys the day after tomorrow are not
 * an answer to "when can I go", and a value sitting exactly on a documented
 * limit is the one most likely to be moved by the other side.
 */
export const TRIP_SEARCH_WINDOW = 1440;

export function tripGQL(fromId, toId, viaId, n, walkSpeed, now, minimal, keepTime, coach, window, affects) {
  const sits = sitsGQL(minimal, affects);
  const fromIsCoord = fromId && typeof fromId === 'object';
  // Only the stop places the reader actually named.
  //
  // This used to also pull situations from the origin's next five departures,
  // whatever line or direction they ran — at an interchange those have
  // nothing to do with the chosen journey, and they were most of the noise.
  // What is certainly relevant, the trip's own legs, was never asked for at
  // all; that now rides on the legs below.
  const stopPlaceQuery = fromIsCoord ? '' : ('stopPlace(id:"' + fromId + '"){' + sits + '} ');
  const toIsCoord = toId && typeof toId === 'object';
  // «Hva bruker har lagt inn» is both ends, so the destination's own
  // disruptions count too. Aliased, or it would collide with the origin.
  const destQuery = (minimal || toIsCoord || !toId)
    ? '' : ('dest: stopPlace(id:"' + toId + '"){' + sits + '} ');
  const fromField = fromIsCoord
    ? 'from:{coordinates:{latitude:' + fromId.lat + ',longitude:' + fromId.lon + '}} '
    : 'from:{place:"' + fromId + '"} ';
  return '{ ' + stopPlaceQuery + destQuery
    + 'trip('
    + fromField
    + (toId && typeof toId === 'object'
      ? 'to:{coordinates:{latitude:' + toId.lat + ',longitude:' + toId.lon + '}} '
      : 'to:{place:"' + toId + '"} ')
    + (viaId ? 'via:[{visit:{stopLocationIds:["' + viaId + '"]}}] ' : '')
    + 'numTripPatterns:' + (n || 12) + ' '
    // Opt-in, and shed first of all the optional arguments: losing it costs
    // the rural journeys we did not have yesterday either, where losing the
    // lookback costs a train standing at the platform right now.
    + (window ? 'searchWindow:' + TRIP_SEARCH_WINDOW + ' ' : '')
    // Plan from slightly in the past, or OTP plans from this instant and a
    // departure drops out of the board the moment its time passes.
    // `minimal` is the retry path in fetchTrip: if either of the optional
    // extras is rejected the board must still render, so it asks again
    // without them.
    // The retry drops it — unless the caller asked for a SPECIFIC departure
    // time and said to keep it. Answering a "what leaves at 16:20" question
    // with departures going now would be the wrong answer presented as the
    // right one, which is worse than an error.
    + ((minimal && !keepTime) ? '' : 'dateTime:"' + lookbackISO(now) + '" ')
    + 'walkSpeed:' + (walkSpeed || 1.3) + ' '
    + 'modes:{accessMode:foot,egressMode:foot,transportModes:[{transportMode:metro},'
    + '{transportMode:bus},{transportMode:tram},{transportMode:rail}'
    + ',{transportMode:water}'
    // Express coaches. `coach` cannot be checked against the live schema from
    // here, and this one query carries EVERY journey — so it is opt-in and
    // fetchTrip drops it for the session if Entur turns it down. The cost of
    // a wrong enum name here is the whole board, not one feature.
    + (coach ? ',{transportMode:coach}' : '')
    + ']}'
    + ') { tripPatterns { duration legs {'
    + ' fromPlace{name latitude longitude}'
    + ' toPlace{name latitude longitude}'
    + ' mode'
    + ' aimedStartTime expectedStartTime aimedEndTime expectedEndTime'
    // The leg's real alignment, as a Google encoded polyline — the difference
    // between drawing the track and drawing a chord between platforms.
    // Optional by design: every consumer falls back to stop-to-stop points,
    // and fetchTrip retries without the optional fields if the API objects.
    + (minimal ? '' : ' pointsOnLink{points length}')
    // The one set of situations that is certainly about this journey.
    + (minimal ? '' : ' ' + sits)
    + ' serviceJourney{id line{id publicCode presentation{colour}}'
    + (minimal ? '' : ' ' + sits)
    + ' estimatedCalls{quay{latitude longitude stopPlace{id name latitude longitude}}'
    + ' aimedArrivalTime expectedArrivalTime aimedDepartureTime expectedDepartureTime}}'
    + ' fromEstimatedCall{expectedDepartureTime aimedDepartureTime realtime cancellation occupancyStatus quay{publicCode} destinationDisplay{frontText}}'
    + ' toEstimatedCall{expectedArrivalTime aimedArrivalTime quay{publicCode}}'
    + '} } } }';
}

/**
 * Departures from the ARRIVAL stop, plus that stop's disruptions.
 *
 * The app's other situation queries are all keyed on the departure stop, so
 * until now a closure at the far end of the trip was invisible. Same fragment
 * and same shape as boardGQL, so ui/alerts.js renders it unchanged.
 */
export function arrBoardGQL(id, n, basic) {
  const sits = sitsGQL(basic);
  return '{stopPlace(id:"' + id + '"){name latitude longitude ' + sits + ' '
    + 'estimatedCalls(numberOfDepartures:' + (n || 8) + '){'
    + 'realtime aimedDepartureTime expectedDepartureTime cancellation '
    + sits + ' '
    + 'destinationDisplay{frontText} quay{publicCode} '
    + 'serviceJourney{id ' + sits + ' line{publicCode transportMode presentation{colour}}}}}}';
}

/**
 * @param {number} [fwdMins] How far forward to look, in minutes. Raising
 *   `numberOfDepartures` alone changes nothing once the 92-minute window is
 *   exhausted, so a later page has to widen the window as well as ask for
 *   more rows.
 */
/** The only modes the app ever asks for. Also a whitelist: these go into the
 *  query as bare GraphQL enums, so nothing else may reach it.
 *
 *  `water` is here because Norway is a coastal country and the app never once
 *  asked: Beffen across Vågen, the fast boats out of Bergen, Nesoddbåten and
 *  the Oslo island ferries were not filtered off the screen — they were never
 *  requested. Reported as stops the app could not find in Bergen. Same shape
 *  as `coach` in v1.86.0, and the same cost: a whole mode, invisible. */
export const BOARD_MODES = ['metro', 'tram', 'bus', 'rail', 'water'];

/**
 * …and the same list with express coaches, which Transmodel keeps separate
 * from `bus`. Opt-in for the same reason: the name cannot be checked from
 * here, and a rejected enum takes the stop board with it.
 */
export const BOARD_MODES_COACH = [...BOARD_MODES, 'coach'];

/**
 * @param {string[]} [modes] which modes to ask for. Defaults to all four.
 *
 * It matters more than it looks. `numberOfDepartures` is a cap on the WHOLE
 * board, so at a multimodal stop the twenty departures you asked for are
 * mostly whatever runs most often there. Measured at Mortensrud: 20
 * departures, of which 3 were metro and 17 were buses from bays A–F. Anything
 * comparing against that board saw almost none of the mode it cared about.
 */
/**
 * @param {number} [perLine] adds `numberOfDeparturesPerLineAndDestinationDisplay`.
 *
 * `numberOfDepartures` caps the WHOLE stop, so at a busy interchange one
 * frequent line can eat the budget and a quieter direction shows a single
 * time. This argument is the answer to exactly that — N per line and
 * destination — but its name cannot be checked from here: the proxy reaches
 * neither api.entur.io nor Entur's docs.
 *
 * So it is OPT-IN, and only fetchBoard passes it. `fetchBoardPage` and
 * `fetchStopBoardSummary` never inspect `j.errors` at all, so a rejected
 * argument there would be a silently empty board rather than a fallback.
 */
/**
 * Did the answer come back at the cap?
 *
 * Reported: standing at Jernbanetorget, «hvorfor er ikke linje 3 Mortensrud på
 * lista her?» It was not filtered out and not below the fold — it was never in
 * the answer. `numberOfDepartures` caps the WHOLE stop, every line and mode
 * sharing it, and auto-reise asked for 30. The comment above that number says
 * where it came from: «Measured on a Tveita-shaped stop (five directions)».
 * Jernbanetorget has every metro line both ways, six tram lines and a dozen
 * bus routes; 30 departures there is about ninety seconds of traffic.
 *
 * AND IT WAS SILENT. The list was drawn as though it were complete, so the
 * reader had no way to know it was cut — which is the failure this codebase
 * keeps naming: silence reads as «alt er i orden». Worse, the list IS complete
 * at a small stop, so it earns trust there and spends it at a hub.
 *
 * Exactly at the cap means cut: an API that had fewer to give would have given
 * fewer. It cannot tell «cut at 30» from «has exactly 30», and that is the
 * safe direction — saying «there may be more» about a list that happens to be
 * complete costs a line of text; the other way costs a departure.
 */
export function boardTruncated(got, asked) {
  return Number.isFinite(got) && Number.isFinite(asked) && asked > 0 && got >= asked;
}

/**
 * How many to ask for once the first answer came back cut.
 *
 * A ladder rather than a bigger constant, because the right number cannot be
 * known before asking and differs by two orders of magnitude between a
 * suburban kerb and Jernbanetorget. Small stops keep the cheap request they
 * have always made; a hub pays one extra.
 *
 * The ceiling is NOT a measurement and is not claimed as one — it cannot be
 * checked from a sandbox that does not reach api.entur.io. It is high enough
 * to cover a stop with forty line-and-direction combinations at three each,
 * and the notice below the list covers whatever a bigger hub still exceeds.
 * The design does not depend on this number being right.
 */
export const BOARD_ASK_MAX = 120;

export function nextBoardAsk(asked, max) {
  const ceiling = Number.isFinite(max) ? max : BOARD_ASK_MAX;
  if (!Number.isFinite(asked) || asked <= 0) return ceiling;
  return asked >= ceiling ? 0 : ceiling;
}

/**
 * How far to look when the next ninety minutes are empty.
 *
 * Reported from Storaas Gjestegård on a Saturday: «vår app viser ingen
 * avganger, men Entur har avganger». Entur had none that day either — its own
 * message reads «Vi finner ingen reiser etter dette tidspunktet på lørdag. Vi
 * viser første mulige reise», and the list under it is MONDAY. The stop has no
 * weekend service.
 *
 * So the app was right and unhelpful: «Ingen avganger herfra nå» reads as «try
 * again later today», and the truth is «not until Monday morning». The board
 * asks for BOARD_WINDOW_MINS (below) and cannot tell the two
 * apart.
 *
 * Two days, because that is what a weekend without service costs: a Saturday
 * morning reader needs Monday. Not a week — a stop with nothing for two days
 * is better served by saying so than by a date nobody will act on.
 */
export const NEXT_DEPARTURE_HORIZON_MINS = 48 * 60;

/**
 * How far forward the stop board asks, IN MINUTES, when no caller says.
 *
 * It was the literal `90` in `fwdMins || 90` below, which was fine while
 * exactly one place knew it. v1.127.0 needs the same number to decide
 * whether a starred 08:12 is something we asked about at all — and «it is
 * not running» said about a window we never queried is the v1.122.0 fault.
 * Two copies of that number would put the two out of step silently.
 */
export const BOARD_WINDOW_MINS = 90;

export function boardGQL(id, n, now, basic, fwdMins, modes, perLine) {
  const sits = sitsGQL(basic);
  const wl = (Array.isArray(modes) ? modes.filter(m => BOARD_MODES_COACH.includes(m)) : []);
  // Asking for `bus` means asking for the express coaches too. Transmodel
  // keeps them apart; a person does not, and that was the reader's call.
  const withCoach = wl.length ? (wl.includes('bus') ? [...wl, 'coach'] : wl) : BOARD_MODES_COACH;
  const modeList = [...new Set(withCoach)].join(',');
  // startTime/timeRange rather than a bare numberOfDepartures, for the same
  // reason as tripGQL above. These two argument names are already in
  // production in inflightGQL, so unlike tripGQL's dateTime they are proven.
  const back = LOOKBACK_MINS, fwd = fwdMins || BOARD_WINDOW_MINS;
  return '{stopPlace(id:"' + id + '"){id name latitude longitude ' + sits + ' '
    + 'estimatedCalls(startTime:"' + lookbackISO(now) + '",timeRange:' + ((back + fwd) * 60)
    + ',numberOfDepartures:' + (n || 10)
    + (perLine ? ',numberOfDeparturesPerLineAndDestinationDisplay:' + perLine : '')
    + ',whiteListedModes:[' + modeList + ']){'
    + 'realtime aimedDepartureTime expectedDepartureTime cancellation occupancyStatus '
    + sits + ' '
    + 'destinationDisplay{frontText} quay{id publicCode name} '
    + 'serviceJourney{id line{id publicCode transportMode presentation{colour}} '
    + sits + ' '
    + 'estimatedCalls{quay{latitude longitude stopPlace{id name latitude longitude}} '
    + 'aimedArrivalTime expectedArrivalTime aimedDepartureTime expectedDepartureTime}}'
    + '}'
    + '}}';
}

// Realtime EstimatedCall.serviceJourney.id sometimes carries a lowercase
// codespace prefix (e.g. "rut:ServiceJourney:..."), while the static graph
// indexes ServiceJourney by its NeTEx ID with an uppercase codespace
// ("RUT:ServiceJourney:..."). Uppercase the prefix so serviceJourney(id:)
// lookups can resolve IDs copied straight from board/track data.
/**
 * What kind of place these stops are — asked once per line, never per poll.
 *
 * The stops list needs to tell an interchange from a request stop, and the
 * departure response carries nothing that says so: `id name latitude
 * longitude` and four timestamps, and that is all of it. Widening the nested
 * estimatedCalls selection would have bought the answer at the price of these
 * fields for EVERY stop on EVERY one of thirty departures, on a query that
 * runs every twenty seconds. This asks separately, for the stops of one line,
 * and the answer is kept.
 *
 * `quays` and `transportMode` on StopPlace cannot be checked from here — the
 * proxy reaches neither api.entur.io nor Entur's docs. So this is a probe,
 * and its caller drops it and remembers on a rejection, exactly as fetchBoard
 * does for the per-line cap (v1.70.0).
 */
export function normJid(jid) {
  return String(jid || '').replace(/^([a-z]+):/, m => m.toUpperCase());
}

/**
 * The stops of the journey being ridden, polled every twenty seconds.
 *
 * `cancellation` is asked for here from v1.106.0. It was the one fact that
 * could turn the whole screen into a lie — a cancelled run you are standing on
 * a platform for, counting down to an arrival that will not happen — and it
 * was the only field on this call that was never requested.
 *
 * It needs NO PROBE, unlike `affects` or the per-line cap. `journeyGQL` below
 * has asked for `cancellation` on EstimatedCall in shipped code since v1.44,
 * against this same type on this same endpoint. The schema has already
 * answered; asking a second time from a sandbox that cannot reach
 * api.entur.io would prove nothing the running app has not proved.
 */
export function trackGQL(jid) {
  return '{serviceJourney(id:"' + normJid(jid) + '"){'
    + 'estimatedCalls{quay{latitude longitude stopPlace{id name latitude longitude}} '
    + 'aimedArrivalTime expectedArrivalTime aimedDepartureTime expectedDepartureTime '
    + 'cancellation realtime}}}';
}

// Richer query used by fetchJourneyMeta — includes cancellation + platform per call.
// Normalised shape is JourneyMeta (see entur.js).
export function journeyGQL(jid) {
  return '{serviceJourney(id:"' + normJid(jid) + '"){'
    + 'line{publicCode transportMode presentation{colour}} '
    + 'estimatedCalls{'
    + 'cancellation realtime '
    + 'destinationDisplay{frontText} '
    + 'quay{publicCode latitude longitude stopPlace{id name latitude longitude}} '
    + 'aimedArrivalTime expectedArrivalTime '
    + 'aimedDepartureTime expectedDepartureTime'
    + '}}}';
}

/**
 * Live vehicle positions (SIRI-VM, via Entur's realtime API).
 *
 * Separate endpoint from the journey planner — see api.vehicles in config.
 * `serviceJourneyId` is the join key back to a departure; without it a
 * position cannot be tied to the train the user is waiting for, and an
 * untied position is worse than none.
 */
export function vehiclesGQL(lineRef) {
  return '{vehicles(lineRef:"' + lineRef + '"){'
    + 'vehicleId lastUpdated bearing speed '
    + 'location{latitude longitude} '
    + 'line{lineRef} '
    + 'serviceJourney{id}'
    + '}}';
}

/**
 * Departures that have already left — the trains now between you and your
 * destination.
 *
 * A train currently on your stretch is, by construction, one that departed
 * your stop a little while ago, so a window that starts in the past returns
 * exactly them. Deliberately its own query rather than another field on the
 * board query: if these argument names are wrong the request fails on its
 * own, instead of taking the departure list down with it.
 *
 * @param {string} id      origin stop place
 * @param {number} backMins how far back to look
 */
export function inflightGQL(id, backMins, fwdMins) {
  const back = backMins == null ? 5 : backMins;
  const fwd = fwdMins == null ? 25 : fwdMins;
  const startTime = new Date(Date.now() - back * 60000).toISOString();
  return '{stopPlace(id:"' + id + '"){'
    + 'estimatedCalls(startTime:"' + startTime + '",timeRange:' + ((back + fwd) * 60)
    + ',numberOfDepartures:20,whiteListedModes:[metro,tram,bus,rail,water,coach]){'
    + 'aimedDepartureTime expectedDepartureTime cancellation realtime '
    // The only authoritative answer to "is it standing at my platform": it has
    // actually arrived and has not actually left. These two fields ride in
    // this isolated query rather than the board query on purpose — if they are
    // not spelled the way I think, the strip and this badge go quiet and the
    // departure list is untouched.
    + 'actualArrivalTime actualDepartureTime '
    + 'destinationDisplay{frontText} '
    + 'serviceJourney{id line{id publicCode transportMode presentation{colour}} '
    + 'estimatedCalls{quay{latitude longitude stopPlace{id name latitude longitude}} '
    + 'aimedArrivalTime expectedArrivalTime aimedDepartureTime expectedDepartureTime}}'
    + '}}}';
}
