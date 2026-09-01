import { decodePolyline } from '../ui/polyline.js';
// Quays carry their own coordinates (the actual platform), distinct from
// their stopPlace's centroid. Prefer the quay-level point when present so
// map markers land on the platform rather than the station's middle.
export function quayLatLon(quay) {
  if (!quay) return null;
  if (quay.latitude != null && quay.longitude != null) {
    return { lat: quay.latitude, lon: quay.longitude };
  }
  const sp = quay.stopPlace;
  if (sp && sp.latitude != null && sp.longitude != null) {
    return { lat: sp.latitude, lon: sp.longitude };
  }
  return null;
}

/**
 * A leg's real alignment, decoded once.
 *
 * Every transit line on every map was a chord between platform coordinates —
 * it cut across ridges, crossed water, and ignored every curve the train
 * actually takes. OTP hands back the true geometry on the leg; this decodes
 * it and caches the result on the leg object, because the render loop runs at
 * 1 Hz and a full metro alignment is a few thousand points.
 *
 * Returns null whenever there is nothing usable, which is the signal for
 * every caller to fall back to stop-to-stop points exactly as before.
 */
export function legShape(leg) {
  if (!leg) return null;
  if (leg._shape !== undefined) return leg._shape;
  // Two shapes of leg reach here: a raw OTP leg carrying pointsOnLink, and a
  // journey leg that persisted the encoded string as `shape`.
  const enc = (leg.pointsOnLink && leg.pointsOnLink.points) || leg.shape;
  const pts = enc ? decodePolyline(enc, 5) : [];
  // One point is not a line, and would draw nothing at all.
  leg._shape = pts.length >= 2 ? pts : null;
  return leg._shape;
}

/**
 * Why the last batch of patterns was dropped.
 *
 * Six paths return null here, and the board reported only a count — so a
 * discarded journey was invisible except as a number. Each one now says which
 * rule rejected it, which is the difference between "1 forkastet" and "1
 * forkastet: bytte uten navn".
 */
let _reasons = [];
export function takeDropReasons() {
  const out = _reasons;
  _reasons = [];
  return out;
}
function drop(reason) {
  _reasons.push(reason);
  if (_reasons.length > 40) _reasons.shift();
  return null;
}

/**
 * What the row says under the line badge, and whether to admit a walk.
 *
 * Reported: a board with destination "Aker brygge, Oslo" — a place, not a
 * stop — showed a metro line 3 row reading "Aker brygge". Line 3 does not go
 * there; you ride to Nationaltheatret and walk. The row was printing
 * `frontText`, which `adaptTripPattern` sets from the last leg INCLUDING the
 * final walk.
 *
 * The heading above the list already names the destination, so repeating it
 * on every row was both wrong and redundant. What differs BETWEEN rows — and
 * what you need while sitting on the train — is which stop you get off at.
 * In the reported case that is exactly what separated the metro row from the
 * bus 74 → tram 12 row: the tram runs all the way, the metro does not, and
 * the two rows looked identical.
 *
 * No minute threshold. The rule is structural: if the journey ends on foot
 * somewhere with another name, we name the stop. A threshold would have let
 * a two-minute walk go on lying.
 */
export function _rowDest(c) {
  const front = (c && c.destinationDisplay && c.destinationDisplay.frontText) || '';
  const alight = (c && c._alightName) || '';
  // null means "does not end on foot"; 0 means "it does, but briefly".
  const walk = c ? c._alightWalkMins : null;
  const endsOnFoot = walk !== null && walk !== undefined;
  const offEarlier = endsOnFoot && !!alight && alight !== front;
  return { text: offEarlier ? alight : front, walkMins: offEarlier ? walk : 0 };
}

export function adaptTripPattern(tp) {
  try {
    if (!tp || !tp.legs) return drop('uten bein');
    const legs = tp.legs.filter(l => l.mode !== 'foot');
    // OTP routinely offers a walk-only itinerary when the destination is
    // close. It is not a departure, but it does consume one of the twelve
    // slots we asked for — worth seeing in the record.
    if (!legs.length) return drop('kun gange');
    const first = legs[0], last = legs[legs.length - 1];
    const firstDepTime = first.fromEstimatedCall
      ? (first.fromEstimatedCall.expectedDepartureTime || first.fromEstimatedCall.aimedDepartureTime)
      : (first.expectedStartTime || first.aimedStartTime);
    if (!firstDepTime) return drop('uten avgangstid');
    if (!last.toPlace || !last.toPlace.name) return drop('siste bein uten navn');
    const lastAny = tp.legs[tp.legs.length - 1];
    if (lastAny.mode !== 'foot' && (!lastAny.toPlace || !lastAny.toPlace.name)) return drop('siste bein uten navn');
    const transfers = legs.slice(0, -1).map((leg, i) => ({
      at:        (leg.toPlace && leg.toPlace.name) || null,
      platform:  (legs[i+1].fromEstimatedCall && legs[i+1].fromEstimatedCall.quay && legs[i+1].fromEstimatedCall.quay.publicCode) || null,
      frontText: (legs[i+1].fromEstimatedCall && legs[i+1].fromEstimatedCall.destinationDisplay && legs[i+1].fromEstimatedCall.destinationDisplay.frontText) || null,
      depTime:   (legs[i+1].fromEstimatedCall && (legs[i+1].fromEstimatedCall.expectedDepartureTime || legs[i+1].fromEstimatedCall.aimedDepartureTime))
                 || legs[i+1].expectedStartTime || legs[i+1].aimedStartTime || null,
    }));
    if (transfers.some(t => !t.at)) return drop('bytte uten navn');
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
        estimatedCalls: (first.serviceJourney && first.serviceJourney.estimatedCalls) || [],
      },
      // Where you get OFF. The app has always shown the boarding platform and
      // never this one, even though it rides along in the same response.
      _arrQuay:          (last.toEstimatedCall && last.toEstimatedCall.quay
                          && last.toEstimatedCall.quay.publicCode) || null,

      // Where you get off, BY NAME — and how long you then walk.
      //
      // `frontText` above is where the JOURNEY ends, walk included. When the
      // destination is a place rather than a stop ("Aker brygge") that is
      // somewhere the vehicle does not go, and the board printed it beside
      // the line badge: metro 3 → Aker brygge, which the metro does not do.
      //
      // The honest name was already here, one variable away: `last` is the
      // final TRANSIT leg, so `last.toPlace.name` is the platform you step
      // onto. It is added beside `frontText` rather than replacing it,
      // because the live stop-board path uses that same field for the real
      // front text of the vehicle, and adapt.test.js pins today's value.
      //
      // `_alightWalkMins` is null when the journey does not end on foot —
      // distinct from 0, which means "it does, but it rounds to nothing".
      // The reader of this decides what to show; the adapter only reports.
      _alightName:       last.toPlace.name,
      _alightWalkMins:   (() => {
        if (lastAny.mode !== 'foot') return null;
        const a = lastAny.expectedStartTime || lastAny.aimedStartTime;
        const b = lastAny.expectedEndTime || lastAny.aimedEndTime;
        if (!a || !b) return null;
        // OTP has already applied the reader's own walking speed to this leg
        // (walkSpeed goes out with every trip query), so the minutes are
        // theirs, not a second guess at them.
        return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
      })(),
      _toLat:            last.toPlace && last.toPlace.latitude,
      _toLon:            last.toPlace && last.toPlace.longitude,
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
  } catch (err) {
    // Dropping a pattern silently made a whole class of "missing departure"
    // bugs invisible; surface it in the debug log at least.
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('adaptTripPattern dropped a pattern:', err && err.message);
    }
    return drop('feil: ' + ((err && err.message) || 'ukjent'));
  }
}
