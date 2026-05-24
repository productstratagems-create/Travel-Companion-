export function adaptTripPattern(tp) {
  try {
    if (!tp || !tp.legs) return null;
    const legs = tp.legs.filter(l => l.mode !== 'foot');
    if (!legs.length) return null;
    const first = legs[0], last = legs[legs.length - 1];
    if (!first.fromEstimatedCall) return null;
    if (!last.toPlace || !last.toPlace.name) return null;
    const transfers = legs.slice(0, -1).map((leg, i) => ({
      at:        (leg.toPlace && leg.toPlace.name) || null,
      platform:  (legs[i+1].fromEstimatedCall && legs[i+1].fromEstimatedCall.quay && legs[i+1].fromEstimatedCall.quay.publicCode) || null,
      frontText: (legs[i+1].fromEstimatedCall && legs[i+1].fromEstimatedCall.destinationDisplay && legs[i+1].fromEstimatedCall.destinationDisplay.frontText) || null,
      depTime:   (legs[i+1].fromEstimatedCall && (legs[i+1].fromEstimatedCall.expectedDepartureTime || legs[i+1].fromEstimatedCall.aimedDepartureTime)) || null,
    }));
    if (transfers.some(t => !t.at)) return null;
    return {
      expectedDepartureTime: first.fromEstimatedCall.expectedDepartureTime,
      aimedDepartureTime:    first.fromEstimatedCall.aimedDepartureTime,
      realtime:              first.fromEstimatedCall.realtime,
      cancellation:          false,
      destinationDisplay:    { frontText: last.toPlace.name },
      quay:                  { publicCode: (first.fromEstimatedCall.quay && first.fromEstimatedCall.quay.publicCode) || '?' },
      serviceJourney: {
        id:   first.serviceJourney && first.serviceJourney.id,
        line: first.serviceJourney && first.serviceJourney.line,
        estimatedCalls: [],
      },
      _legs:             legs,
      _isTransfer:       legs.length > 1,
      _transfers:        transfers,
      _transferAt:       transfers.length ? transfers[0].at : null,
      _transferPlatform: transfers.length ? transfers[0].platform : null,
      _transferFrontText: transfers.length ? transfers[0].frontText : null,
      _finalArrival:     last.toEstimatedCall
        ? (last.toEstimatedCall.expectedArrivalTime || last.toEstimatedCall.aimedArrivalTime)
        : null,
      _durationMins:     Math.round(tp.duration / 60),
    };
  } catch { return null; }
}
