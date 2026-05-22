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
