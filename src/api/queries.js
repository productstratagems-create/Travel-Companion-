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

export function tripGQL(fromId, toId, viaId, n, walkSpeed, now, minimal) {
  const sits = 'situations{id summary{language value} severity validityPeriod{startTime endTime}}';
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
    + (minimal ? '' : 'dateTime:"' + lookbackISO(now) + '" ')
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
    + ' estimatedCalls{quay{latitude longitude stopPlace{name latitude longitude}}'
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
export function arrBoardGQL(id, n) {
  const sits = 'situations{id summary{language value} severity validityPeriod{startTime endTime}}';
  return '{stopPlace(id:"' + id + '"){name latitude longitude ' + sits + ' '
    + 'estimatedCalls(numberOfDepartures:' + (n || 8) + '){'
    + 'realtime aimedDepartureTime expectedDepartureTime cancellation '
    + sits + ' '
    + 'destinationDisplay{frontText} quay{publicCode} '
    + 'serviceJourney{id ' + sits + ' line{publicCode transportMode presentation{colour}}}}}}';
}

export function boardGQL(id, n, now) {
  // startTime/timeRange rather than a bare numberOfDepartures, for the same
  // reason as tripGQL above. These two argument names are already in
  // production in inflightGQL, so unlike tripGQL's dateTime they are proven.
  const back = LOOKBACK_MINS, fwd = 90;
  return '{stopPlace(id:"' + id + '"){id name latitude longitude '
    + 'situations{id summary{language value} severity validityPeriod{startTime endTime}} '
    + 'estimatedCalls(startTime:"' + lookbackISO(now) + '",timeRange:' + ((back + fwd) * 60)
    + ',numberOfDepartures:' + (n || 10) + ',whiteListedModes:[metro,tram,bus,rail]){'
    + 'realtime aimedDepartureTime expectedDepartureTime cancellation occupancyStatus '
    + 'situations{id summary{language value} severity validityPeriod{startTime endTime}} '
    + 'destinationDisplay{frontText} quay{id publicCode name} '
    + 'serviceJourney{id line{id publicCode transportMode presentation{colour}} '
    + 'situations{id summary{language value} severity validityPeriod{startTime endTime}} '
    + 'estimatedCalls{quay{latitude longitude stopPlace{name latitude longitude}} '
    + 'aimedArrivalTime expectedArrivalTime aimedDepartureTime expectedDepartureTime}}'
    + '}'
    + '}}';
}

// Realtime EstimatedCall.serviceJourney.id sometimes carries a lowercase
// codespace prefix (e.g. "rut:ServiceJourney:..."), while the static graph
// indexes ServiceJourney by its NeTEx ID with an uppercase codespace
// ("RUT:ServiceJourney:..."). Uppercase the prefix so serviceJourney(id:)
// lookups can resolve IDs copied straight from board/track data.
function normJid(jid) {
  return String(jid || '').replace(/^([a-z]+):/, m => m.toUpperCase());
}

export function trackGQL(jid) {
  return '{serviceJourney(id:"' + normJid(jid) + '"){'
    + 'estimatedCalls{quay{latitude longitude stopPlace{name latitude longitude}} '
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
    + 'quay{publicCode latitude longitude stopPlace{name latitude longitude}} '
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
    + 'estimatedCalls{quay{latitude longitude stopPlace{name latitude longitude}} '
    + 'aimedArrivalTime expectedArrivalTime aimedDepartureTime expectedDepartureTime}}'
    + '}}}';
}
