/**
 * «Utforsk» means journeys forward in time — so «when» needs a definition.
 *
 * The horizon is the part worth binding: a screen that offers «velg …» with
 * a free date can be asked about next month, and the trip planner is only
 * asked for TRIP_SEARCH_WINDOW minutes. If those two drift, the answer to a
 * question we never asked is an empty list, which reads as «there are no
 * journeys» — the v1.122.0 mistake in a new place.
 */
import { describe, it, expect } from 'vitest';
import {
  TRIP_SCAN_MINS, TRIP_PICK_HORIZON_MINS, TRIP_PICK_HORIZON_DAYS,
  quickTimes, withinHorizon, horizonText,
  localInputValue, parseLocalInput,
} from '../src/api/tripTime.js';
import { TRIP_SEARCH_WINDOW } from '../src/api/queries.js';
import fs from 'node:fs';

const MIN = 60_000;
const MORGEN = new Date(2026, 8, 19, 8, 47).getTime();   // lørdag 08:47
const KVELD = new Date(2026, 8, 19, 23, 30).getTime();

describe('two horizons, because they are two facts', () => {
  // THE BINDING. Move TRIP_SEARCH_WINDOW and the scan must move with it; a
  // literal 1440 here would survive that mutation and test nothing.
  it('the scan is the trip planner\'s own search window', () => {
    expect(TRIP_SCAN_MINS).toBe(TRIP_SEARCH_WINDOW);
  });

  // THE BUG THE BROWSER PROBE CAUGHT. These were one constant, so the
  // reported journey — Monday 07:05, forty-six hours out — was refused by
  // the screen built to find it. searchWindow says how far a search scans
  // FROM its instant; it says nothing about how far ahead that instant may
  // point, and collapsing the two made the feature vacuous.
  it('the pick horizon reaches past a single scan', () => {
    expect(TRIP_PICK_HORIZON_MINS).toBeGreaterThan(TRIP_SCAN_MINS);
    expect(TRIP_PICK_HORIZON_MINS).toBe(TRIP_PICK_HORIZON_DAYS * 24 * 60);
  });

  it('reaches the reported case: a Saturday morning to Monday 07:05', () => {
    const mandag = new Date(2026, 8, 21, 7, 5).getTime();
    expect(withinHorizon(mandag, MORGEN)).toBe(true);
  });

  it('is not written down a second time in the source', () => {
    const src = fs.readFileSync('src/api/tripTime.js', 'utf8');
    expect(src).not.toMatch(/\b1440\b/);
    expect(src).toMatch(/TRIP_SEARCH_WINDOW/);
  });
});

describe('quickTimes', () => {
  it('offers «nå» as the absence of a time, not a timestamp', () => {
    // fetchTrip plans from slightly in the past on purpose; a literal now
    // would drop the departure standing at the platform.
    expect(quickTimes(MORGEN)[0]).toEqual({ key: 'na', label: 'nå', ms: null });
  });

  it('offers this evening while it is still ahead', () => {
    const kveld = quickTimes(MORGEN).find(q => q.key === 'kveld');
    expect(new Date(kveld.ms).getHours()).toBe(18);
    expect(new Date(kveld.ms).getDate()).toBe(19);
  });

  // A choice that means «now, spelled differently» is worse than one fewer
  // choice.
  it('drops «i kveld» once the evening has started', () => {
    expect(quickTimes(KVELD).some(q => q.key === 'kveld')).toBe(false);
  });

  // Computed from the DATE, not from now + n hours — at 23:30 «i morgen
  // tidlig» is still tomorrow morning, and now+7h would be 06:30 today+1
  // only by accident.
  it('crosses midnight correctly', () => {
    const m = quickTimes(KVELD).find(q => q.key === 'morgen');
    const d = new Date(m.ms);
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(7);
  });

  it('never offers a time that has passed', () => {
    for (const q of quickTimes(KVELD)) {
      if (q.ms != null) expect(q.ms).toBeGreaterThan(KVELD);
    }
  });
});

describe('withinHorizon', () => {
  it('accepts «now»', () => {
    expect(withinHorizon(null, MORGEN)).toBe(true);
  });

  // ON THE BOUNDARY, both sides. A mutant turning > into >= must fall.
  it('accepts the last answerable minute and refuses the next', () => {
    expect(withinHorizon(MORGEN + TRIP_PICK_HORIZON_MINS * MIN, MORGEN)).toBe(true);
    expect(withinHorizon(MORGEN + TRIP_PICK_HORIZON_MINS * MIN + MIN, MORGEN)).toBe(false);
  });

  it('refuses the past and refuses nonsense', () => {
    expect(withinHorizon(MORGEN - MIN, MORGEN)).toBe(false);
    expect(withinHorizon(NaN, MORGEN)).toBe(false);
  });
});

describe('horizonText says WHICH no it is', () => {
  it('says nothing when the time is answerable', () => {
    expect(horizonText(null, MORGEN)).toBe(null);
    expect(horizonText(MORGEN + 3 * 60 * MIN, MORGEN)).toBe(null);
  });

  // Three refusals, three sentences. Silence reads as «alt er i orden»,
  // and one sentence for all three is the six-meanings bug again.
  it('tells the three refusals apart', () => {
    const past = horizonText(MORGEN - MIN, MORGEN);
    const far = horizonText(MORGEN + (TRIP_PICK_HORIZON_MINS + 60) * MIN, MORGEN);
    const bad = horizonText(NaN, MORGEN);
    expect([past.kind, far.kind, bad.kind]).toEqual(['fortid', 'utenfor', 'ugyldig']);
    expect(new Set([past.label, far.label, bad.label]).size).toBe(3);
  });

  it('names the horizon in days rather than leaving it implied', () => {
    const far = horizonText(MORGEN + (TRIP_PICK_HORIZON_MINS + 60) * MIN, MORGEN);
    expect(far.label).toContain(String(TRIP_PICK_HORIZON_DAYS));
  });
});

describe('the datetime-local round trip', () => {
  // toISOString would render UTC and a reader in Oslo would see 10:47
  // spelled 08:47 — the fixture-in-UTC mistake, in the widget this time.
  it('renders LOCAL time and reads it back unchanged', () => {
    const v = localInputValue(MORGEN);
    expect(v).toBe('2026-09-19T08:47');
    expect(parseLocalInput(v)).toBe(MORGEN);
  });

  it('refuses what it cannot parse', () => {
    expect(parseLocalInput('')).toBe(null);
    expect(parseLocalInput('i morgen')).toBe(null);
    expect(localInputValue(null)).toBe('');
  });
});
