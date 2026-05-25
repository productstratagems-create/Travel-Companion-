import { describe, it, expect } from 'vitest';
import { tripGQL, boardGQL, trackGQL } from '../src/api/queries.js';

// --- tripGQL ---

describe('tripGQL(fromId, toId, n)', () => {
  const q = tripGQL('NSR:StopPlace:5687', 'NSR:StopPlace:58366', 5);

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
    expect(tripGQL('A', 'B')).toContain('numTripPatterns:12');
  });

  it('includes walkSpeed parameter — defaults to 1.3 m/s', () => {
    expect(tripGQL('A', 'B')).toContain('walkSpeed:1.3');
  });

  it('accepts custom walkSpeed', () => {
    expect(tripGQL('A', 'B', 8, 1.389)).toContain('walkSpeed:1.389');
  });

  // REGRESSION: {transportMode:bus} was accidentally removed, causing zero results
  // for any non-metro destination. This test prevents that regression.
  it('includes metro transport mode', () => {
    expect(q).toContain('{transportMode:metro}');
  });

  it('includes bus transport mode — REGRESSION GUARD', () => {
    expect(q).toContain('{transportMode:bus}');
  });

  it('requests toPlace{name} on legs (needed for transfer station name)', () => {
    expect(q).toContain('toPlace{name}');
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

  it('whitelists metro mode only (departure board stays metro-only)', () => {
    expect(q).toContain('whiteListedModes:[metro]');
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

  it('requests estimatedCalls with stopPlace name', () => {
    expect(q).toContain('estimatedCalls');
    expect(q).toContain('stopPlace{name}');
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
