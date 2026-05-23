export function tripGQL(fromId, toId, n) {
  return '{ trip('
    + 'from:{place:"' + fromId + '"} '
    + 'to:{place:"' + toId + '"} '
    + 'numTripPatterns:' + (n || 8) + ' '
    + 'modes:{transportModes:[{transportMode:metro},{transportMode:bus}]}'
    + ') { tripPatterns { duration legs {'
    + ' fromPlace{name}'
    + ' toPlace{name}'
    + ' mode'
    + ' serviceJourney{id line{publicCode presentation{colour}}}'
    + ' fromEstimatedCall{expectedDepartureTime aimedDepartureTime realtime quay{publicCode} destinationDisplay{frontText}}'
    + ' toEstimatedCall{expectedArrivalTime aimedArrivalTime}'
    + '} } } }';
}

export function boardGQL(id, n) {
  return '{stopPlace(id:"' + id + '"){id name latitude longitude '
    + 'estimatedCalls(numberOfDepartures:' + (n || 10) + ',whiteListedModes:[metro]){'
    + 'realtime aimedDepartureTime expectedDepartureTime cancellation '
    + 'destinationDisplay{frontText} quay{id publicCode name} '
    + 'serviceJourney{id line{publicCode presentation{colour}} '
    + 'estimatedCalls{quay{stopPlace{name}} '
    + 'aimedArrivalTime expectedArrivalTime aimedDepartureTime expectedDepartureTime}}'
    + '}'
    + '}}';
}

export function trackGQL(jid) {
  return '{serviceJourney(id:"' + jid + '"){'
    + 'estimatedCalls{quay{stopPlace{name}} '
    + 'aimedArrivalTime expectedArrivalTime aimedDepartureTime expectedDepartureTime realtime}}}';
}
