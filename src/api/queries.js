export function tripGQL(fromId, toId, viaId, n, walkSpeed) {
  const sits = 'situations{id summary{language value} severity validityPeriod{startTime endTime}}';
  const fromIsCoord = fromId && typeof fromId === 'object';
  const stopPlaceQuery = fromIsCoord ? '' : ('stopPlace(id:"' + fromId + '"){'
    + sits + ' '
    + 'estimatedCalls(numberOfDepartures:5,whiteListedModes:[metro,tram,bus,rail]){'
    + sits + ' serviceJourney{' + sits + '}}} ');
  const fromField = fromIsCoord
    ? 'from:{coordinates:{latitude:' + fromId.lat + ',longitude:' + fromId.lon + '}} '
    : 'from:{place:"' + fromId + '"} ';
  return '{ ' + stopPlaceQuery
    + 'trip('
    + fromField
    + (toId && typeof toId === 'object'
      ? 'to:{coordinates:{latitude:' + toId.lat + ',longitude:' + toId.lon + '}} '
      : 'to:{place:"' + toId + '"} ')
    + (viaId ? 'via:[{visit:{stopLocationIds:["' + viaId + '"]}}] ' : '')
    + 'numTripPatterns:' + (n || 12) + ' '
    + 'walkSpeed:' + (walkSpeed || 1.3) + ' '
    + 'modes:{accessMode:foot,egressMode:foot,transportModes:[{transportMode:metro},{transportMode:bus},{transportMode:tram},{transportMode:rail}]}'
    + ') { tripPatterns { duration legs {'
    + ' fromPlace{name latitude longitude}'
    + ' toPlace{name latitude longitude}'
    + ' mode'
    + ' aimedStartTime expectedStartTime aimedEndTime expectedEndTime'
    + ' serviceJourney{id line{id publicCode presentation{colour}} estimatedCalls{quay{latitude longitude stopPlace{name latitude longitude}}'
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

export function boardGQL(id, n) {
  return '{stopPlace(id:"' + id + '"){id name latitude longitude '
    + 'situations{id summary{language value} severity validityPeriod{startTime endTime}} '
    + 'estimatedCalls(numberOfDepartures:' + (n || 10) + ',whiteListedModes:[metro,tram,bus,rail]){'
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
export function inflightGQL(id, backMins) {
  const back = backMins || 40;
  const startTime = new Date(Date.now() - back * 60000).toISOString();
  return '{stopPlace(id:"' + id + '"){'
    + 'estimatedCalls(startTime:"' + startTime + '",timeRange:' + (back * 60)
    + ',numberOfDepartures:12,whiteListedModes:[metro,tram,bus,rail]){'
    + 'aimedDepartureTime expectedDepartureTime cancellation '
    + 'destinationDisplay{frontText} '
    + 'serviceJourney{id line{id publicCode transportMode presentation{colour}} '
    + 'estimatedCalls{quay{latitude longitude stopPlace{name latitude longitude}} '
    + 'aimedArrivalTime expectedArrivalTime aimedDepartureTime expectedDepartureTime}}'
    + '}}}';
}
