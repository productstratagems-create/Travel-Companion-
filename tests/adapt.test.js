import { describe, it, expect, beforeEach } from 'vitest';
import { adaptTripPattern } from '../src/api/adapt.js';
import {
  oneLeMetro,
  twoLegTransfer,
  noFromEstimatedCall,
  noToPlace,
  toPlaceNameUndefined,
  transferWithUndefinedAt,
  allFoot,
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
