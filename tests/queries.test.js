import { describe, it, expect } from 'vitest';
import { tripGQL, boardGQL, trackGQL, arrBoardGQL, sitsGQL, LOOKBACK_MINS, BOARD_MODES } from '../src/api/queries.js';

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

  it('requests estimatedCalls with the stop id, name and coordinates', () => {
    expect(q).toContain('estimatedCalls');
    // By field rather than by literal selection string: this used to pin
    // `stopPlace{name latitude longitude}` exactly, which meant adding the id
    // — the field whose absence sent readers on a walk to a coordinate —
    // broke a test that had no opinion about the id at all.
    const sp = q.slice(q.indexOf('stopPlace{'), q.indexOf('stopPlace{') + 60);
    ['id', 'name', 'latitude', 'longitude'].forEach(f => expect(sp).toContain(f));
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

// ── Asking for what the message says ────────────────────────────────────────
describe('sitsGQL', () => {
  it('asks for the text, not just the heading', () => {
    const f = sitsGQL(false);
    expect(f).toContain('summary{language value}');
    expect(f).toContain('description{language value}');
    expect(f).toContain('advice{language value}');
  });

  // The guard, and the reason this is safe to ship without being able to
  // reach the API: both retry paths fall back to a fragment that has only
  // fields already proven in production.
  it('drops the two unproven fields in the basic form', () => {
    const b = sitsGQL(true);
    expect(b).toContain('summary{language value}');
    expect(b).not.toContain('description');
    expect(b).not.toContain('advice');
    expect(b).toContain('severity');
  });
});

describe('the situation text rides on every situation query', () => {
  it('is in the full board and trip queries', () => {
    expect(boardGQL('NSR:StopPlace:1', 10)).toContain('description{language value}');
    expect(tripGQL('A', 'B', null, 12, 1.3)).toContain('description{language value}');
    expect(arrBoardGQL('NSR:StopPlace:1', 8)).toContain('description{language value}');
  });

  it('is absent from every retry form', () => {
    expect(boardGQL('NSR:StopPlace:1', 10, null, true)).not.toContain('description');
    expect(tripGQL('A', 'B', null, 12, 1.3, null, true)).not.toContain('description');
    expect(arrBoardGQL('NSR:StopPlace:1', 8, true)).not.toContain('description');
  });
});


// ── Which modes the stop board is asked for ────────────────────────────────
//
// Reported, twice: departures missing from platform 1 at Mortensrud.
// `numberOfDepartures` caps the WHOLE board, so a mode-blind request at a bus
// hub spends its twenty slots on buses — measured 3 metro against 17 bus,
// which left most rows with nothing to cross-check against. Asking only for
// the modes in play is what makes the twenty slots useful.

describe('boardGQL — whiteListedModes', () => {
  const modesIn = (q) => (q.match(/whiteListedModes:\[([^\]]*)\]/) || [])[1];

  it('asks for every mode when it is not told otherwise', () => {
    expect(modesIn(boardGQL('NSR:1', 20))).toBe(BOARD_MODES.join(','));
    expect(modesIn(boardGQL('NSR:1', 20, null, true, null, []))).toBe(BOARD_MODES.join(','));
  });

  // The fix: twenty metro departures instead of three metro and seventeen bus.
  it('asks for only what it was given', () => {
    expect(modesIn(boardGQL('NSR:1', 20, null, true, null, ['metro']))).toBe('metro');
    expect(modesIn(boardGQL('NSR:1', 20, null, true, null, ['bus', 'rail']))).toBe('bus,rail');
  });

  // These go into the query as bare GraphQL enums, unquoted. Anything that is
  // not one of the four must not reach it.
  it('lets nothing but the four known modes into the query', () => {
    expect(modesIn(boardGQL('NSR:1', 20, null, true, null, ['metro', 'sykkel']))).toBe('metro');
    expect(modesIn(boardGQL('NSR:1', 20, null, true, null, ['bus] evil {'])))
      .toBe(BOARD_MODES.join(','));
    expect(boardGQL('NSR:1', 20, null, true, null, ['bus] evil {'])).not.toContain('evil');
  });
});

// ── The stop ids the onward calls have to carry ────────────────────────────
//
// Reported, with a screenshot: Mortensrud → Skøyenåsen, a real metro stop on
// the same line, and the itinerary ended with a 2-minute walk to a place
// called "destination". That name is what OTP calls a COORDINATE.
//
// The chain: auto-reise builds a route from stopsAhead(), which reads
// `quay.stopPlace.id` — and no query ever asked for it. So the id was always
// null, autoRoute fell back to lat/lon, resolveToPlace planned to a point,
// and OTP dutifully walked the reader from the platform to that point.
//
// tests/auto.test.js fed stopsAhead fixtures WITH ids, so it passed against
// data the app never actually receives. Asserted on the query instead, which
// is the layer that was wrong.
describe('stop ids in the onward calls', () => {
  const calls = (q) => {
    const i = q.indexOf('estimatedCalls{quay{');
    expect(i).toBeGreaterThan(-1);
    return q.slice(i, i + 120);
  };

  it('boardGQL asks for the id of every stop the journey calls at', () => {
    expect(calls(boardGQL('NSR:StopPlace:6270', 10, null, true, null, ['metro'])))
      .toMatch(/stopPlace\{[^}]*\bid\b/);
  });

  it('tripGQL asks for it too', () => {
    expect(calls(tripGQL('NSR:StopPlace:5687', 'NSR:StopPlace:58366', null, 5)))
      .toMatch(/stopPlace\{[^}]*\bid\b/);
  });

  it('trackGQL asks for it too', () => {
    expect(calls(trackGQL('RUT:ServiceJourney:1')))
      .toMatch(/stopPlace\{[^}]*\bid\b/);
  });

  // The name is what the id falls back to, and it has to stay: the corridor
  // dedupe keys on id-or-name, and a stop board with neither would draw every
  // line as one stroke.
  it('still asks for the name and the coordinates', () => {
    const c = calls(boardGQL('NSR:StopPlace:6270', 10, null, true, null, ['metro']));
    expect(c).toMatch(/stopPlace\{[^}]*\bname\b/);
    expect(c).toMatch(/quay\{[^}]*latitude/);
  });
});

// ── The per-line cap is opt-in, and that is a safety property ──────────────
//
// `numberOfDeparturesPerLineAndDestinationDisplay` is the right answer to
// "three per direction" — numberOfDepartures caps the whole stop, so one
// frequent line can eat the budget. But its name cannot be verified from
// here, and only `fetchBoard` inspects `j.errors` and retries.
// `fetchBoardPage` and `fetchStopBoardSummary` do not: a rejected argument
// there is a silently empty board, not a fallback. So it must never appear
// unless a caller asks for it.
describe('boardGQL and the per-line cap', () => {
  const ARG = 'numberOfDeparturesPerLineAndDestinationDisplay';

  it('is absent unless asked for', () => {
    expect(boardGQL('NSR:StopPlace:1', 30)).not.toContain(ARG);
    expect(boardGQL('NSR:StopPlace:1', 30, null, false, null, ['metro'])).not.toContain(ARG);
  });

  it('is there when asked for, beside the overall cap', () => {
    const q = boardGQL('NSR:StopPlace:1', 30, null, false, null, null, 3);
    expect(q).toContain(ARG + ':3');
    // The whole-stop ceiling stays: the per-line cap narrows, it does not
    // replace, and a stop with forty directions still has a bound.
    expect(q).toContain('numberOfDepartures:30');
  });

  // The exact shapes the two unguarded callers send. If either of these ever
  // changes, the argument has leaked into a query that cannot recover from a
  // rejection.
  it('leaves the queries that cannot retry exactly as they were', () => {
    // fetchBoardPage
    expect(boardGQL('NSR:StopPlace:1', 12, 1780000000000, false, 180)).not.toContain(ARG);
    // fetchStopBoardSummary
    expect(boardGQL('NSR:StopPlace:1', 20, null, true, null, ['metro'])).not.toContain(ARG);
  });
});
