export function adaptTripPattern(tp) {
  try {
    if (!tp || !tp.legs) return null;
    const legs = tp.legs.filter(l => l.mode !== 'foot');
    if (!legs.length) return null;
    const first = legs[0], last = legs[legs.length - 1];
    const firstDepTime = first.fromEstimatedCall
      ? (first.fromEstimatedCall.expectedDepartureTime || first.fromEstimatedCall.aimedDepartureTime)
      : (first.expectedStartTime || first.aimedStartTime);
    if (!firstDepTime) return null;
    if (!last.toPlace || !last.toPlace.name) return null;
    const lastAny = tp.legs[tp.legs.length - 1];
    if (lastAny.mode !== 'foot' && (!lastAny.toPlace || !lastAny.toPlace.name)) return null;
    const transfers = legs.slice(0, -1).map((leg, i) => ({
      at:        (leg.toPlace && leg.toPlace.name) || null,
      platform:  (legs[i+1].fromEstimatedCall && legs[i+1].fromEstimatedCall.quay && legs[i+1].fromEstimatedCall.quay.publicCode) || null,
      frontText: (legs[i+1].fromEstimatedCall && legs[i+1].fromEstimatedCall.destinationDisplay && legs[i+1].fromEstimatedCall.destinationDisplay.frontText) || null,
      depTime:   (legs[i+1].fromEstimatedCall && (legs[i+1].fromEstimatedCall.expectedDepartureTime || legs[i+1].fromEstimatedCall.aimedDepartureTime))
                 || legs[i+1].expectedStartTime || legs[i+1].aimedStartTime || null,
    }));
    if (transfers.some(t => !t.at)) return null;
    return {
      expectedDepartureTime: firstDepTime,
      aimedDepartureTime:    first.fromEstimatedCall ? first.fromEstimatedCall.aimedDepartureTime : (first.aimedStartTime || firstDepTime),
      realtime:              first.fromEstimatedCall ? first.fromEstimatedCall.realtime : false,
      cancellation:          false,
      destinationDisplay:    { frontText: lastAny.toPlace.name || last.toPlace.name },
      quay:                  { publicCode: (first.fromEstimatedCall && first.fromEstimatedCall.quay && first.fromEstimatedCall.quay.publicCode) || '?' },
      serviceJourney: {
        id:   first.serviceJourney && first.serviceJourney.id,
        line: first.serviceJourney && first.serviceJourney.line,
        estimatedCalls: [],
      },
      _allLegs:          tp.legs,
      _legs:             legs,
      _isTransfer:       legs.length > 1 || lastAny.mode === 'foot',
      _transfers:        transfers,
      _transferAt:       transfers.length ? transfers[0].at : null,
      _transferPlatform: transfers.length ? transfers[0].platform : null,
      _transferFrontText: transfers.length ? transfers[0].frontText : null,
      _finalArrival:     (() => {
        if (lastAny.toEstimatedCall) {
          return lastAny.toEstimatedCall.expectedArrivalTime || lastAny.toEstimatedCall.aimedArrivalTime;
        }
        if (lastAny.expectedEndTime || lastAny.aimedEndTime) {
          return lastAny.expectedEndTime || lastAny.aimedEndTime;
        }
        if (last.toEstimatedCall) {
          return last.toEstimatedCall.expectedArrivalTime || last.toEstimatedCall.aimedArrivalTime;
        }
        return firstDepTime ? new Date(new Date(firstDepTime).getTime() + tp.duration * 1000).toISOString() : null;
      })(),
      _durationMins:     Math.round(tp.duration / 60),
    };
  } catch { return null; }
}
