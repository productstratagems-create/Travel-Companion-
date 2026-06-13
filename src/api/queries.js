export function tripGQL(fromId, toId, viaId, n, walkSpeed) {
  const sits = 'situations{id summary{language value} severity validityPeriod{startTime endTime}}';
  const fromIsCoord = fromId && typeof fromId === 'object';
  const stopPlaceQuery = fromIsCoord ? '' : ('stopPlace(id:"' + fromId + '"){'
    + sits + ' '
    + 'estimatedCalls(numberOfDepartures:5,whiteListedModes:[metro]){'
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
    + 'modes:{transportModes:[{transportMode:metro},{transportMode:bus},{transportMode:tram}]}'
    + ') { tripPatterns { duration legs {'
    + ' fromPlace{name latitude longitude}'
    + ' toPlace{name latitude longitude}'
    + ' mode'
    + ' aimedStartTime expectedStartTime aimedEndTime expectedEndTime'
    + ' serviceJourney{id line{publicCode presentation{colour}} estimatedCalls{quay{latitude longitude stopPlace{name latitude longitude}}'
    + ' aimedArrivalTime expectedArrivalTime aimedDepartureTime expectedDepartureTime}}'
    + ' fromEstimatedCall{expectedDepartureTime aimedDepartureTime realtime occupancyStatus quay{publicCode} destinationDisplay{frontText}}'
    + ' toEstimatedCall{expectedArrivalTime aimedArrivalTime}'
    + '} } } }';
}

export function boardGQL(id, n) {
  return '{stopPlace(id:"' + id + '"){id name latitude longitude '
    + 'situations{id summary{language value} severity validityPeriod{startTime endTime}} '
    + 'estimatedCalls(numberOfDepartures:' + (n || 10) + ',whiteListedModes:[metro,tram]){'
    + 'realtime aimedDepartureTime expectedDepartureTime cancellation occupancyStatus '
    + 'situations{id summary{language value} severity validityPeriod{startTime endTime}} '
    + 'destinationDisplay{frontText} quay{id publicCode name} '
    + 'serviceJourney{id line{publicCode transportMode presentation{colour}} '
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
