export function tripGQL(fromId, toId, n, walkSpeed) {
  return '{ trip('
    + 'from:{place:"' + fromId + '"} '
    + 'to:{place:"' + toId + '"} '
    + 'numTripPatterns:' + (n || 12) + ' '
    + 'walkSpeed:' + (walkSpeed || 1.3) + ' '
    + 'modes:{transportModes:[{transportMode:metro},{transportMode:bus}]}'
    + ') { tripPatterns { duration legs {'
    + ' fromPlace{name}'
    + ' toPlace{name}'
    + ' mode'
    + ' aimedStartTime expectedStartTime aimedEndTime expectedEndTime'
    + ' serviceJourney{id line{publicCode presentation{colour}}}'
    + ' fromEstimatedCall{expectedDepartureTime aimedDepartureTime realtime quay{publicCode} destinationDisplay{frontText}}'
    + ' toEstimatedCall{expectedArrivalTime aimedArrivalTime}'
    + '} } } }';
}

export function boardGQL(id, n) {
  return '{stopPlace(id:"' + id + '"){id name latitude longitude '
    + 'situations{id summary{language value} severity validityPeriod{startTime endTime}} '
    + 'estimatedCalls(numberOfDepartures:' + (n || 10) + ',whiteListedModes:[metro]){'
    + 'realtime aimedDepartureTime expectedDepartureTime cancellation '
    + 'situations{id summary{language value} severity validityPeriod{startTime endTime}} '
    + 'destinationDisplay{frontText} quay{id publicCode name} '
    + 'serviceJourney{id line{publicCode presentation{colour}} '
    + 'situations{id summary{language value} severity validityPeriod{startTime endTime}} '
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
