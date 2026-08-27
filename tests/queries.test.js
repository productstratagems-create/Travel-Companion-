import { describe, it, expect } from 'vitest';
import { tripGQL, boardGQL, trackGQL, arrBoardGQL, LOOKBACK_MINS } from '../src/api/queries.js';

// --- tripGQL ---

describe('tripGQL(fromId, toId, viaId, n)', () => {
  const q = tripGQL('NSR:StopPlace:5687', 'NSR:StopPlace:58366', null, 5);

  it('is a non-empty string', () => {
    expect(typeof q).toBe('string');
    expect(q.length).toBeGreaterThan(50);
  });

  it('contains the from stop ID', () => {
    expect(q).toContain('NSR:StopPlace:5687');
  });

  it('contains the to stop ID', () => {
    expect(q).toContain('NSR:StopPlace:58366');
  });

  it('contains the requested numTripPatterns', () => {
    expect(q).toContain('numTripPatterns:5');
  });

  it('defaults numTripPatterns to 12 when n is omitted', () => {
    expect(tripGQL('A', 'B', null)).toContain('numTripPatterns:12');
  });

  it('includes walkSpeed parameter — defaults to 1.3 m/s', () => {
    expect(tripGQL('A', 'B', null)).toContain('walkSpeed:1.3');
  });

  it('accepts custom walkSpeed', () => {
    expect(tripGQL('A', 'B', null, 8, 1.389)).toContain('walkSpeed:1.389');
  });

  it('omits via clause when viaId is null', () => {
    expect(tripGQL('A', 'B', null)).not.toContain('via:');
  });

  it('includes via clause when viaId is provided', () => {
    expect(tripGQL('A', 'B', 'NSR:StopPlace:999')).toContain('via:[{visit:{stopLocationIds:["NSR:StopPlace:999"]}}]');
  });

  // REGRESSION: {transportMode:bus} was accidentally removed, causing zero results
  // for any non-metro destination. This test prevents that regression.
  it('supports coordinate-based destination', () => {
    const cq = tripGQL('NSR:StopPlace:5687', { lat: 59.912, lon: 10.744 }, null);
    expect(cq).toContain('to:{coordinates:{latitude:59.912,longitude:10.744}}');
    expect(cq).not.toContain('to:{place:');
  });

  it('uses place-based destination for stop ID strings', () => {
    expect(q).toContain('to:{place:"NSR:StopPlace:58366"}');
  });

  it('includes metro transport mode', () => {
    expect(q).toContain('{transportMode:metro}');
  });

  it('includes bus transport mode — REGRESSION GUARD', () => {
    expect(q).toContain('{transportMode:bus}');
  });

  it('requests toPlace{name} on legs (needed for transfer station name)', () => {
    expect(q).toContain('toPlace{name latitude longitude}');
  });

  it('requests fromEstimatedCall with expectedDepartureTime', () => {
    expect(q).toContain('fromEstimatedCall');
    expect(q).toContain('expectedDepartureTime');
  });

  it('requests fromEstimatedCall with quay{publicCode} (platform number)', () => {
    expect(q).toContain('quay{publicCode}');
  });

  it('requests toEstimatedCall with expectedArrivalTime', () => {
    expect(q).toContain('toEstimatedCall');
    expect(q).toContain('expectedArrivalTime');
  });

  it('requests serviceJourney with line publicCode and colour', () => {
    expect(q).toContain('serviceJourney');
    expect(q).toContain('publicCode');
    expect(q).toContain('colour');
  });

  it('includes parallel stopPlace situations query for service alert display', () => {
    expect(q).toContain('stopPlace(id:"NSR:StopPlace:5687")');
    expect(q).toContain('situations');
    expect(q).toContain('validityPeriod');
  });
});

// --- boardGQL ---

describe('boardGQL(id, n)', () => {
  const q = boardGQL('NSR:StopPlace:5687', 10);

  it('contains the stop ID', () => {
    expect(q).toContain('NSR:StopPlace:5687');
  });

  it('contains the number of departures', () => {
    expect(q).toContain('numberOfDepartures:10');
  });

  it('defaults to 10 departures when n is omitted', () => {
    expect(boardGQL('X')).toContain('numberOfDepartures:10');
  });

  it('whitelists all supported transit modes (departure board)', () => {
    expect(q).toContain('whiteListedModes:[metro,tram,bus,rail]');
  });

  it('requests estimatedCalls with quay and serviceJourney', () => {
    expect(q).toContain('estimatedCalls');
    expect(q).toContain('quay');
    expect(q).toContain('serviceJourney');
  });

  it('requests realtime and cancellation fields', () => {
    expect(q).toContain('realtime');
    expect(q).toContain('cancellation');
  });

  it('requests latitude and longitude (used for walk distance calculation)', () => {
    expect(q).toContain('latitude');
    expect(q).toContain('longitude');
  });

  it('requests situations for service disruption notices', () => {
    expect(q).toContain('situations');
    expect(q).toContain('summary');
    expect(q).toContain('validityPeriod');
  });
});

// --- trackGQL ---

describe('trackGQL(jid)', () => {
  const q = trackGQL('RUT:ServiceJourney:3-123456');

  it('contains the journey ID', () => {
    expect(q).toContain('RUT:ServiceJourney:3-123456');
  });

  it('requests estimatedCalls with stopPlace name and coordinates', () => {
    expect(q).toContain('estimatedCalls');
    expect(q).toContain('stopPlace{name latitude longitude}');
  });

  it('requests both aimed and expected arrival times', () => {
    expect(q).toContain('aimedArrivalTime');
    expect(q).toContain('expectedArrivalTime');
  });

  it('requests both aimed and expected departure times', () => {
    expect(q).toContain('aimedDepartureTime');
    expect(q).toContain('expectedDepartureTime');
  });

  it('requests realtime flag for live tracking', () => {
    expect(q).toContain('realtime');
  });
});

describe('arrBoardGQL — the destination stop', () => {
  const q = arrBoardGQL('NSR:StopPlace:337', 8);

  it('queries the stop it is given', () => {
    expect(q).toContain('stopPlace(id:"NSR:StopPlace:337")');
  });

  it('asks for situations at all three levels', () => {
    // Disruption can be attached to the stop, the call, or the journey.
    // Missing any level means silently missing disruptions.
    const levels = q.split('situations{').length - 1;
    expect(levels).toBe(3);
  });

  it('asks for severity and validity so alerts can be ranked and expired', () => {
    expect(q).toContain('severity');
    expect(q).toContain('validityPeriod{startTime endTime}');
  });

  it('asks for the stop name and coordinates', () => {
    expect(q).toContain('name latitude longitude');
  });

  it('keeps the fields the onward-departures list renders', () => {
    ['expectedDepartureTime', 'cancellation', 'destinationDisplay{frontText}',
     'quay{publicCode}', 'line{publicCode transportMode presentation{colour}}']
      .forEach(f => expect(q).toContain(f));
  });

  it('defaults to 8 departures', () => {
    expect(arrBoardGQL('X')).toContain('numberOfDepartures:8');
  });
});

describe('tripGQL — arrival platform', () => {
  it('requests the quay you get off at, not just the one you board from', () => {
    const q = tripGQL('A', 'B', null, 12, 1.3);
    expect(q).toContain('toEstimatedCall{expectedArrivalTime aimedArrivalTime quay{publicCode}}');
  });
});

describe('the lookback window — departures right up to now', () => {
  const NOW = Date.parse('2026-08-27T20:00:00Z');
  const back = (iso) => (NOW - Date.parse(iso)) / 60000;

  // Both board paths used to ask from the current instant forward, and
  // state.deps is replaced wholesale every poll — so a departure vanished the
  // moment its time passed, taking a late train still at the platform with it.
  it('asks trip() to plan from two minutes ago, not from now', () => {
    const q = tripGQL('NSR:StopPlace:1', 'NSR:StopPlace:2', null, 12, 1.3, NOW);
    const m = q.match(/dateTime:"([^"]+)"/);
    expect(m).not.toBeNull();
    expect(back(m[1])).toBe(LOOKBACK_MINS);
    expect(LOOKBACK_MINS).toBe(2);
  });

  it('gives boardGQL the same window, from the same source', () => {
    const q = boardGQL('NSR:StopPlace:1', 10, NOW);
    const m = q.match(/startTime:"([^"]+)"/);
    expect(m).not.toBeNull();
    expect(back(m[1])).toBe(LOOKBACK_MINS);
    // timeRange must cover the lookback as well as the forward window, or the
    // past departures are requested and then immediately excluded.
    const range = Number(q.match(/timeRange:(\d+)/)[1]);
    expect(range).toBeGreaterThan(LOOKBACK_MINS * 60);
  });

  // fetchTrip retries without dateTime if the API rejects it. That retry is
  // the only thing standing between a wrong argument name and a blank board,
  // and it cannot be checked against the live API from here.
  it('can build the same trip query without the lookback, for the retry', () => {
    const q = tripGQL('NSR:StopPlace:1', 'NSR:StopPlace:2', null, 12, 1.3, NOW, true);
    expect(q).not.toContain('dateTime');
    // Everything else must survive, or the fallback board is a different board.
    expect(q).toContain('numTripPatterns:12');
    expect(q).toContain('walkSpeed:1.3');
    expect(q).toContain('toEstimatedCall');
  });
});

describe('trafikkmeldinger — only the stretches the reader named', () => {
  const FROM = 'NSR:StopPlace:1', TO = 'NSR:StopPlace:2';

  // The actual bug: situations were pulled from the origin's next five
  // departures, whatever line or direction they ran. At an interchange that
  // is most of the noise, and none of it is about the chosen journey.
  it('no longer asks the origin for its next five departures', () => {
    const q = tripGQL(FROM, TO, null, 12, 1.3, Date.now());
    expect(q).not.toContain('numberOfDepartures:5');
  });

  it('asks the legs and their journeys for situations', () => {
    const q = tripGQL(FROM, TO, null, 12, 1.3, Date.now());
    const legPart = q.slice(q.indexOf('legs {'));
    expect(legPart).toContain('situations{');
    expect(legPart.match(/situations\{/g).length).toBeGreaterThanOrEqual(2);
  });

  it('asks the destination stop place too, aliased so it does not collide', () => {
    const q = tripGQL(FROM, TO, null, 12, 1.3, Date.now());
    expect(q).toContain('dest: stopPlace(id:"' + TO + '")');
    expect(q).toContain('stopPlace(id:"' + FROM + '")');
  });

  // These field names cannot be checked against the live API from here, so
  // they ride in the same opt-out the retry already drops.
  it('drops them all on the retry, so the board cannot go dark', () => {
    const q = tripGQL(FROM, TO, null, 12, 1.3, Date.now(), true);
    expect(q).not.toContain('dest: stopPlace');
    const legPart = q.slice(q.indexOf('legs {'));
    expect(legPart).not.toContain('situations{');
    // …while everything the board needs survives.
    expect(q).toContain('numTripPatterns:12');
    expect(q).toContain('fromEstimatedCall');
  });

  it('leaves the destination block out when the destination is a coordinate', () => {
    const q = tripGQL(FROM, { lat: 59.9, lon: 10.7 }, null, 12, 1.3, Date.now());
    expect(q).not.toContain('dest: stopPlace');
  });
});
