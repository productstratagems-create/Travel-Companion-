import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import { _rank, vehicleCharge } from '../src/api/scooters.js';

const HERE = { lat: 59.9139, lon: 10.7522 };
const veh = (extra) => ({ lat: HERE.lat, lon: HERE.lon, ...extra });

// Reported: «Batteriprosenten er feil, den viser alltid 100%».
describe('the percentage is only shown when the feed gave one', () => {
  // The reported bug: range / 250 with a 25 km assumed maximum, so anything
  // at or above 25 km clamped to exactly 100 — and most feeds report a
  // full-ish range.
  it('no longer invents a percentage from a range', () => {
    const out = _rank([
      veh({ current_range_meters: 25000 }),
      veh({ current_range_meters: 40000 }),
      veh({ current_range_meters: 90000 }),
    ], HERE.lat, HERE.lon);
    expect(out.map(v => v.pct)).toEqual([null, null, null]);
  });

  it('keeps the range the feed reported, so nothing downstream must guess', () => {
    expect(_rank([veh({ current_range_meters: 40000 })], HERE.lat, HERE.lon)[0].rangeM)
      .toBe(40000);
  });

  it('uses the percentage the feed gave, as GBFS states it', () => {
    const out = _rank([veh({ current_range_meters: 40000, current_fuel_percent: 0.42 })],
      HERE.lat, HERE.lon)[0];
    expect(out.pct).toBe(42);
    expect(out.rangeM).toBe(40000);
  });
});

describe('vehicleCharge', () => {
  it('reads a 0–1 fraction, which is what the spec says', () => {
    expect(vehicleCharge({ current_fuel_percent: 0 }).pct).toBe(0);
    expect(vehicleCharge({ current_fuel_percent: 0.075 }).pct).toBe(8);
    expect(vehicleCharge({ current_fuel_percent: 1 }).pct).toBe(100);
  });

  // Some feeds send 0–100 instead. A value above 1 can only be that, since a
  // fraction cannot exceed 1 — so it is read rather than turned into 6400 %.
  it('survives a feed that sends 0–100 instead', () => {
    expect(vehicleCharge({ current_fuel_percent: 64 }).pct).toBe(64);
    expect(vehicleCharge({ current_fuel_percent: 220 }).pct).toBe(100);
  });

  it('says nothing rather than guessing', () => {
    expect(vehicleCharge({ current_range_meters: 40000 }).pct).toBe(null);
    expect(vehicleCharge({}).pct).toBe(null);
    expect(vehicleCharge(null).pct).toBe(null);
    expect(vehicleCharge({ current_fuel_percent: 'mye' }).pct).toBe(null);
    expect(vehicleCharge({ current_fuel_percent: -1 }).pct).toBe(null);
  });

  it('keeps the range, and refuses a nonsense one', () => {
    expect(vehicleCharge({ current_range_meters: 18432 }).rangeM).toBe(18432);
    expect(vehicleCharge({ current_range_meters: -5 }).rangeM).toBe(null);
    expect(vehicleCharge({ current_range_meters: 'langt' }).rangeM).toBe(null);
  });
});

// The «can it get me there» check ran on a number the app had invented:
// rangeKm came from `battery * 0.25`, and battery was clamped to 100, so it
// was always exactly 25 km and the check effectively never fired.
describe('the range that decides whether a scooter is offered', () => {
  it('is the reported one, not a reconstruction of a clamped percentage', () => {
    const nearlyFlat = _rank([veh({ current_range_meters: 900 })], HERE.lat, HERE.lon)[0];
    const full = _rank([veh({ current_range_meters: 40000 })], HERE.lat, HERE.lon)[0];
    expect(nearlyFlat.rangeM).toBe(900);
    expect(full.rangeM).toBe(40000);
    // Under the old rule both of these were 100 % → 25 km.
    expect(nearlyFlat.rangeM).not.toBe(full.rangeM);
  });

  it('is missing rather than assumed when the feed says nothing', () => {
    expect(_rank([veh({})], HERE.lat, HERE.lon)[0].rangeM).toBe(null);
  });
});
