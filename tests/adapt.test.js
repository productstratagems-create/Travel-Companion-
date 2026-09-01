import { describe, it, expect, beforeEach } from 'vitest';
import { adaptTripPattern, _rowDest } from '../src/api/adapt.js';
import {
  oneLeMetro,
  twoLegTransfer,
  noFromEstimatedCall,
  noToPlace,
  toPlaceNameUndefined,
  transferWithUndefinedAt,
  allFoot,
  threeLegsMetroBus,
  metroThenWalk,
  metroFootBus,
  fullJourney,
  metroToAddress,
} from './fixtures/tripPatterns.js';

// --- Null-guard cases (these are the bugs that have broken the app) ---

describe('adaptTripPattern — null/missing data returns null', () => {
  it('returns null when tp is null', () => {
    expect(adaptTripPattern(null)).toBeNull();
  });

  it('returns null when tp.legs is missing', () => {
    expect(adaptTripPattern({ duration: 0 })).toBeNull();
  });

  it('returns null when all legs are foot mode', () => {
    expect(adaptTripPattern(allFoot)).toBeNull();
  });

  it('returns null when legs array is empty', () => {
    expect(adaptTripPattern({ duration: 0, legs: [] })).toBeNull();
  });

  it('returns null when fromEstimatedCall is null (no live data)', () => {
    expect(adaptTripPattern(noFromEstimatedCall)).toBeNull();
  });

  it('returns null when last leg toPlace is null', () => {
    expect(adaptTripPattern(noToPlace)).toBeNull();
  });

  it('returns null when last leg toPlace.name is undefined', () => {
    expect(adaptTripPattern(toPlaceNameUndefined)).toBeNull();
  });

  it('returns null when transfer leg toPlace.name is undefined (the t.at crash)', () => {
    // This was the exact crash: t.at.toLowerCase() threw TypeError in renderBoard
    expect(adaptTripPattern(transferWithUndefinedAt)).toBeNull();
  });
});

// --- 1-leg metro trip (golden path) ---

describe('adaptTripPattern — 1-leg metro', () => {
  let result;
  beforeEach(() => { result = adaptTripPattern(oneLeMetro); });

  it('returns a non-null object', () => {
    expect(result).not.toBeNull();
  });

  it('copies expectedDepartureTime from fromEstimatedCall', () => {
    expect(result.expectedDepartureTime).toBe('2026-05-24T08:00:00+02:00');
  });

  it('copies aimedDepartureTime from fromEstimatedCall', () => {
    expect(result.aimedDepartureTime).toBe('2026-05-24T08:00:00+02:00');
  });

  it('copies realtime flag', () => {
    expect(result.realtime).toBe(true);
  });

  it('sets cancellation to false', () => {
    expect(result.cancellation).toBe(false);
  });

  it('sets destinationDisplay.frontText from last leg toPlace.name', () => {
    expect(result.destinationDisplay.frontText).toBe('Jernbanetorget');
  });

  it('sets quay.publicCode from fromEstimatedCall.quay', () => {
    expect(result.quay.publicCode).toBe('1');
  });

  it('sets _finalArrival from toEstimatedCall.expectedArrivalTime', () => {
    expect(result._finalArrival).toBe('2026-05-24T08:22:00+02:00');
  });

  it('calculates _durationMins correctly (1320s = 22min)', () => {
    expect(result._durationMins).toBe(22);
  });

  it('is not a transfer', () => {
    expect(result._isTransfer).toBe(false);
  });

  it('has empty _transfers array', () => {
    expect(result._transfers).toHaveLength(0);
  });

  it('has _transferAt as null', () => {
    expect(result._transferAt).toBeNull();
  });

  it('has one entry in _legs (the metro leg)', () => {
    expect(result._legs).toHaveLength(1);
    expect(result._legs[0].mode).toBe('metro');
  });

  it('sets serviceJourney.line.publicCode', () => {
    expect(result.serviceJourney.line.publicCode).toBe('3');
  });
});

// --- 2-leg transfer trip (foot leg stripped, transfer extracted) ---

describe('adaptTripPattern — 2-leg metro transfer', () => {
  let result;
  beforeEach(() => { result = adaptTripPattern(twoLegTransfer); });

  it('returns a non-null object', () => {
    expect(result).not.toBeNull();
  });

  it('strips foot leg — _legs contains 2 transit legs', () => {
    expect(result._legs).toHaveLength(2);
    expect(result._legs.every(l => l.mode !== 'foot')).toBe(true);
  });

  it('is marked as a transfer trip', () => {
    expect(result._isTransfer).toBe(true);
  });

  it('has one entry in _transfers', () => {
    expect(result._transfers).toHaveLength(1);
  });

  it('sets _transfers[0].at to the transfer station name', () => {
    expect(result._transfers[0].at).toBe('Brynseng');
  });

  it('sets _transferAt to Brynseng', () => {
    expect(result._transferAt).toBe('Brynseng');
  });

  it('extracts transfer platform from second leg fromEstimatedCall.quay', () => {
    expect(result._transfers[0].platform).toBe('2');
    expect(result._transferPlatform).toBe('2');
  });

  it('extracts transfer frontText (direction of connecting train)', () => {
    expect(result._transfers[0].frontText).toBe('Østerås');
    expect(result._transferFrontText).toBe('Østerås');
  });

  it('departure time comes from first transit leg (not the foot leg)', () => {
    expect(result.expectedDepartureTime).toBe('2026-05-24T08:00:00+02:00');
  });

  it('destinationDisplay.frontText is last leg toPlace.name', () => {
    expect(result.destinationDisplay.frontText).toBe('Jernbanetorget');
  });

  it('sets _finalArrival from last leg toEstimatedCall', () => {
    expect(result._finalArrival).toBe('2026-05-24T08:30:00+02:00');
  });

  it('calculates _durationMins (1800s = 30min)', () => {
    expect(result._durationMins).toBe(30);
  });
});

// --- 3-leg metro+metro+bus (bus has no toEstimatedCall) ---

describe('adaptTripPattern — 3-leg metro+metro+bus', () => {
  let result;
  beforeEach(() => { result = adaptTripPattern(threeLegsMetroBus); });

  it('returns non-null (trip not dropped)', () => {
    expect(result).not.toBeNull();
  });

  it('strips foot leg — _legs has 3 transit legs', () => {
    expect(result._legs).toHaveLength(3);
    expect(result._legs.map(l => l.mode)).toEqual(['metro', 'metro', 'bus']);
  });

  it('has 2 transfer entries', () => {
    expect(result._transfers).toHaveLength(2);
  });

  it('first transfer at Helsfyr', () => {
    expect(result._transfers[0].at).toBe('Helsfyr');
  });

  it('second transfer at Tøyen', () => {
    expect(result._transfers[1].at).toBe('Tøyen');
  });

  it('_transferAt is first transfer only (Helsfyr)', () => {
    expect(result._transferAt).toBe('Helsfyr');
  });

  it('_finalArrival comes from bus leg aimedEndTime when toEstimatedCall is null', () => {
    // bus leg aimedEndTime = '2026-05-24T07:40:00Z' (engine-provided, preferred over duration hack)
    expect(result._finalArrival).toBe('2026-05-24T07:40:00Z');
  });

  it('second transfer depTime falls back to bus leg aimedStartTime', () => {
    // bus leg has fromEstimatedCall:null, so depTime falls back to leg.aimedStartTime
    expect(result._transfers[1].depTime).toBe('2026-05-24T07:32:00Z');
  });

  it('destinationDisplay.frontText is Manglerud (bus final stop)', () => {
    expect(result.destinationDisplay.frontText).toBe('Manglerud');
  });

  it('_durationMins is 40', () => {
    expect(result._durationMins).toBe(40);
  });
});

// --- [metro, foot] — transit then walk to final destination (the Hellerud scenario) ---

describe('adaptTripPattern — metro then walk to destination', () => {
  let result;
  beforeEach(() => { result = adaptTripPattern(metroThenWalk); });

  it('returns a non-null object', () => {
    expect(result).not.toBeNull();
  });

  it('destinationDisplay.frontText is the foot leg destination, not the metro stop', () => {
    expect(result.destinationDisplay.frontText).toBe('Tveita T');
    expect(result.destinationDisplay.frontText).not.toBe('Hellerud');
  });

  it('_isTransfer is true so itinerary view is rendered with the walk leg', () => {
    expect(result._isTransfer).toBe(true);
  });

  it('_legs contains only the transit leg', () => {
    expect(result._legs).toHaveLength(1);
    expect(result._legs[0].mode).toBe('metro');
  });

  it('_allLegs contains both legs including the walk', () => {
    expect(result._allLegs).toHaveLength(2);
    expect(result._allLegs[1].mode).toBe('foot');
  });

  it('_finalArrival comes from the foot legs expectedEndTime', () => {
    expect(result._finalArrival).toBe('2026-05-25T16:29:00+02:00');
  });

  it('departure time comes from the metro legs fromEstimatedCall', () => {
    expect(result.expectedDepartureTime).toBe('2026-05-25T16:03:00+02:00');
  });

  // v1.50.0. Reported: a board with destination "Aker brygge, Oslo" showed a
  // metro line 3 row reading "Aker brygge". The metro does not go there — you
  // ride to Nationaltheatret and walk. Here: ride to Hellerud, walk to Tveita.
  it('_alightName is the stop you get off at, not the place you walk to', () => {
    expect(result._alightName).toBe('Hellerud');
  });

  it('_alightWalkMins is the walk that follows, from the foot legs own times', () => {
    expect(result._alightWalkMins).toBe(13);
  });

  // The fix adds a field rather than redefining one. `frontText` is read on
  // the live stop-board path as the vehicle's real front text, and the test
  // above pins today's value on purpose — breaking it would be trading one
  // wrong claim for another.
  it('leaves frontText exactly as it was', () => {
    expect(result.destinationDisplay.frontText).toBe('Tveita T');
  });

  it('_transfers is empty (no transit-to-transit transfer)', () => {
    expect(result._transfers).toHaveLength(0);
  });
});

// --- [metro, foot, bus] — transit → platform walk → transit ---

describe('adaptTripPattern — metro platform-walk bus', () => {
  let result;
  beforeEach(() => { result = adaptTripPattern(metroFootBus); });

  it('returns a non-null object', () => {
    expect(result).not.toBeNull();
  });

  it('destinationDisplay.frontText is the bus final stop, not the foot leg intermediate name', () => {
    expect(result.destinationDisplay.frontText).toBe('Tveita');
  });

  it('_isTransfer is true', () => {
    expect(result._isTransfer).toBe(true);
  });

  it('_legs contains both transit legs (foot stripped)', () => {
    expect(result._legs).toHaveLength(2);
    expect(result._legs.map(l => l.mode)).toEqual(['metro', 'bus']);
  });

  it('_allLegs contains all three legs including the platform walk', () => {
    expect(result._allLegs).toHaveLength(3);
    expect(result._allLegs[1].mode).toBe('foot');
  });

  it('_transfers[0].at is the metro arrival station (Helsfyr)', () => {
    expect(result._transfers[0].at).toBe('Helsfyr');
  });

  it('_transfers[0].platform is from the bus legs fromEstimatedCall.quay', () => {
    expect(result._transfers[0].platform).toBe('1');
  });

  it('_finalArrival comes from bus legs toEstimatedCall', () => {
    expect(result._finalArrival).toBe('2026-05-25T16:35:00+02:00');
  });
});

// --- [metro, foot] to coordinate address (foot toPlace.name is empty) ---

describe('adaptTripPattern — metro to street address (foot leg has empty toPlace.name)', () => {
  let result;
  beforeEach(() => { result = adaptTripPattern(metroToAddress); });

  it('returns non-null — was null before the foot-leg name guard fix', () => {
    expect(result).not.toBeNull();
  });

  it('destinationDisplay.frontText falls back to last transit stop name', () => {
    expect(result.destinationDisplay.frontText).toBe('Stortinget');
  });

  it('_isTransfer is true (foot leg appended)', () => {
    expect(result._isTransfer).toBe(true);
  });

  it('_legs contains only the metro leg', () => {
    expect(result._legs).toHaveLength(1);
    expect(result._legs[0].mode).toBe('metro');
  });

  it('_finalArrival comes from foot leg expectedEndTime', () => {
    expect(result._finalArrival).toBe('2026-05-28T10:31:00+02:00');
  });

  it('departure time comes from metro leg', () => {
    expect(result.expectedDepartureTime).toBe('2026-05-28T10:00:00+02:00');
  });

  it('_transfers is empty', () => {
    expect(result._transfers).toHaveLength(0);
  });
});

// --- [foot, metro, metro, foot] — full journey: walk in, two transit legs, walk to destination ---

describe('adaptTripPattern — full journey with initial and final walks', () => {
  let result;
  beforeEach(() => { result = adaptTripPattern(fullJourney); });

  it('returns a non-null object', () => {
    expect(result).not.toBeNull();
  });

  it('destinationDisplay.frontText is the final walk destination', () => {
    expect(result.destinationDisplay.frontText).toBe('Grønland');
  });

  it('_isTransfer is true', () => {
    expect(result._isTransfer).toBe(true);
  });

  it('_legs has 2 transit legs (both foot legs stripped)', () => {
    expect(result._legs).toHaveLength(2);
    expect(result._legs.every(l => l.mode !== 'foot')).toBe(true);
  });

  it('_allLegs has all 4 legs including both walks', () => {
    expect(result._allLegs).toHaveLength(4);
  });

  it('_transfers has 1 entry at Helsfyr', () => {
    expect(result._transfers).toHaveLength(1);
    expect(result._transfers[0].at).toBe('Helsfyr');
  });

  it('_finalArrival comes from the final foot legs expectedEndTime', () => {
    expect(result._finalArrival).toBe('2026-05-25T09:43:00+02:00');
  });

  it('_durationMins is 43 (2580 / 60)', () => {
    expect(result._durationMins).toBe(43);
  });
});

describe('arrival platform (_arrQuay)', () => {
  const withArrQuay = quay => ({
    duration: 900,
    legs: [{
      mode: 'metro',
      fromPlace: { name: 'Helsfyr' },
      toPlace: { name: 'Jernbanetorget' },
      serviceJourney: { id: 'sj', line: { publicCode: '3', presentation: { colour: '8B0000' } } },
      fromEstimatedCall: { expectedDepartureTime: '2026-05-24T08:00:00+02:00',
        aimedDepartureTime: '2026-05-24T08:00:00+02:00', realtime: true,
        quay: { publicCode: '1' }, destinationDisplay: { frontText: 'Jernbanetorget' } },
      toEstimatedCall: { expectedArrivalTime: '2026-05-24T08:15:00+02:00',
        aimedArrivalTime: '2026-05-24T08:15:00+02:00',
        ...(quay === undefined ? {} : { quay }) },
    }],
  });

  it('exposes the platform you get off at', () => {
    expect(adaptTripPattern(withArrQuay({ publicCode: '3' }))._arrQuay).toBe('3');
  });

  it('is null when the API does not report one', () => {
    expect(adaptTripPattern(withArrQuay(undefined))._arrQuay).toBeNull();
    expect(adaptTripPattern(withArrQuay({}))._arrQuay).toBeNull();
  });

  it('does not disturb the boarding platform', () => {
    const a = adaptTripPattern(withArrQuay({ publicCode: '3' }));
    expect(a.quay.publicCode).toBe('1');   // where you board
    expect(a._arrQuay).toBe('3');          // where you alight
  });
});

// --- Where you get off, and whether to say so ------------------------------

describe('_alightWalkMins on journeys that do not end on foot', () => {
  // null, not 0: "does not end on foot" and "ends on a walk too short to
  // round up" are different facts, and _rowDest needs to tell them apart.
  it('is null for a plain one-leg ride', () => {
    expect(adaptTripPattern(oneLeMetro)._alightWalkMins).toBeNull();
  });

  it('is null when the last leg is transit, even with a walk in the middle', () => {
    const r = adaptTripPattern(metroFootBus);
    expect(r._alightWalkMins).toBeNull();
    expect(r._alightName).toBe('Tveita');   // the bus's arrival, not the mid walk
  });
});

describe('_rowDest', () => {
  const row = (over) => _rowDest({
    destinationDisplay: { frontText: 'Aker brygge' },
    _alightName: 'Nationaltheatret',
    _alightWalkMins: 8,
    ...over,
  });

  // The reported case. The heading above the list already says where you are
  // going; what the row has to say is where to get off.
  it('names the alighting stop when the journey ends on foot somewhere else', () => {
    expect(row()).toEqual({ text: 'Nationaltheatret', walkMins: 8 });
  });

  // No minute threshold: a two-minute walk is still a place the train does
  // not reach, and a threshold would let that claim through.
  it('says so even when the walk is short', () => {
    expect(row({ _alightWalkMins: 1 })).toEqual({ text: 'Nationaltheatret', walkMins: 1 });
    expect(row({ _alightWalkMins: 0 }).text).toBe('Nationaltheatret');
  });

  it('changes nothing when the vehicle actually reaches the destination', () => {
    expect(row({ _alightWalkMins: null })).toEqual({ text: 'Aker brygge', walkMins: 0 });
  });

  // A walk that ends where the transit leg ended is OTP tidying, not a
  // journey step worth renaming the row for.
  it('changes nothing when the walk ends at the same name', () => {
    expect(row({ _alightName: 'Aker brygge' })).toEqual({ text: 'Aker brygge', walkMins: 0 });
  });

  // The live stop-board path has none of these fields.
  it('falls back to the front text, and survives nothing at all', () => {
    expect(_rowDest({ destinationDisplay: { frontText: 'Kolsås' } }).text).toBe('Kolsås');
    expect(_rowDest({})).toEqual({ text: '', walkMins: 0 });
    expect(_rowDest(null)).toEqual({ text: '', walkMins: 0 });
  });
});
