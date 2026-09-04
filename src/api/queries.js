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
export function sitsGQL(basic) {
  return 'situations{id summary{language value}'
    + (basic ? '' : ' description{language value} advice{language value}')
    + ' severity validityPeriod{startTime endTime}}';
}

export function tripGQL(fromId, toId, viaId, n, walkSpeed, now, minimal, keepTime) {
  const sits = sitsGQL(minimal);
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
    + 'modes:{accessMode:foot,egressMode:foot,transportModes:[{transportMode:metro},{transportMode:bus},{transportMode:tram},{transportMode:rail}]}'
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
    + ' fromEstimatedCall{expectedDepartureTime aimedDepartureTime realtime occupancyStatus quay{publicCode} destinationDisplay{frontText}}'
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
 *  query as bare GraphQL enums, so nothing else may reach it. */
export const BOARD_MODES = ['metro', 'tram', 'bus', 'rail'];

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
export function boardGQL(id, n, now, basic, fwdMins, modes, perLine) {
  const sits = sitsGQL(basic);
  const wl = (Array.isArray(modes) ? modes.filter(m => BOARD_MODES.includes(m)) : []);
  const modeList = (wl.length ? wl : BOARD_MODES).join(',');
  // startTime/timeRange rather than a bare numberOfDepartures, for the same
  // reason as tripGQL above. These two argument names are already in
  // production in inflightGQL, so unlike tripGQL's dateTime they are proven.
  const back = LOOKBACK_MINS, fwd = fwdMins || 90;
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
/**
 * What kind of place each of these stops is.
 *
 * `rich` asks for the lines calling at every quay, which is what actually
 * makes somewhere an interchange — you change there because ANOTHER LINE
 * stops there, not because it has four platforms. Without it the register can
 * only count platforms, and a two-platform metro stop where four lines and
 * the buses meet does not qualify. That was the reported bug.
 *
 * Opt-in, because `Quay.lines` cannot be tried from the sandbox this was
 * written in — the proxy does not reach api.entur.io. hubs.js asks for it
 * first and drops back to the plain form for the session if Entur turns it
 * down, so the failure mode is exactly the query that shipped in v1.72.0.
 */
export function stopPlacesGQL(ids, rich) {
  const list = (ids || []).map(id => '"' + String(id).replace(/"/g, '') + '"').join(',');
  const quays = rich ? 'quays{id lines{id transportMode}}' : 'quays{id}';
  return '{stopPlaces(ids:[' + list + ']){id transportMode ' + quays + '}}';
}

export function normJid(jid) {
  return String(jid || '').replace(/^([a-z]+):/, m => m.toUpperCase());
}

export function trackGQL(jid) {
  return '{serviceJourney(id:"' + normJid(jid) + '"){'
    + 'estimatedCalls{quay{latitude longitude stopPlace{id name latitude longitude}} '
    + 'aimedArrivalTime expectedArrivalTime aimedDepartureTime expectedDepartureTime realtime}}}';
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
    + ',numberOfDepartures:20,whiteListedModes:[metro,tram,bus,rail]){'
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
