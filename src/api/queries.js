export function tripGQL(fromId, toId, viaId, n, walkSpeed) {
  const sits = 'situations{id summary{language value} severity validityPeriod{startTime endTime}}';
  return '{ stopPlace(id:"' + fromId + '"){'
    + sits + ' '
    + 'estimatedCalls(numberOfDepartures:5,whiteListedModes:[metro]){'
    + sits + ' serviceJourney{' + sits + '}}} '
    + 'trip('
    + 'from:{place:"' + fromId + '"} '
    + (toId && typeof toId === 'object'
      ? 'to:{coordinates:{latitude:' + toId.lat + ',longitude:' + toId.lon + '}} '
      : 'to:{place:"' + toId + '"} ')
    + (viaId ? 'via:[{visit:{stopLocationIds:["' + viaId + '"]}}] ' : '')
    + 'numTripPatterns:' + (n || 12) + ' '
    + 'walkSpeed:' + (walkSpeed || 1.3) + ' '
    + 'modes:{transportModes:[{transportMode:metro},{transportMode:bus},{transportMode:tram}]}'
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
    + 'estimatedCalls(numberOfDepartures:' + (n || 10) + ',whiteListedModes:[metro,tram]){'
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
