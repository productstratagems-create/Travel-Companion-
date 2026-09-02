import { describe, it, expect } from 'vitest';
import { newRecord, earliestOf, stage, lostAt, formatRecord, STAGES, _missingQuay } from '../src/api/diagnose.js';

const iso = (h, m) => new Date(2026, 4, 26, h, m, 0, 0).toISOString();
const dep = (h, m) => ({ expectedDepartureTime: iso(h, m) });
const ms = (h, m) => new Date(2026, 4, 26, h, m, 0, 0).getTime();

describe('earliestOf', () => {
  it('finds the soonest regardless of order', () => {
    expect(earliestOf([dep(16, 21), dep(16, 4), dep(16, 12)])).toBe(ms(16, 4));
  });

  it('ignores entries with no usable time rather than returning NaN', () => {
    expect(earliestOf([{ expectedDepartureTime: 'tull' }, dep(16, 4)])).toBe(ms(16, 4));
    expect(earliestOf([{}])).toBeNull();
    expect(earliestOf([])).toBeNull();
    expect(earliestOf(null)).toBeNull();
  });
});

describe('lostAt', () => {
  // The whole value of the tool: not "how many survived" but "where did the
  // soonest one stop being the soonest".
  it('names the stage where the earliest departure got later', () => {
    const rec = newRecord(ms(16, 0));
    stage(rec, 'svar', [dep(16, 4), dep(16, 12), dep(16, 21)]);
    stage(rec, 'adaptert', [dep(16, 4), dep(16, 12), dep(16, 21)]);
    stage(rec, 'dedup', [dep(16, 12), dep(16, 21)]);   // ← lost here
    stage(rec, 'modus', [dep(16, 12), dep(16, 21)]);
    stage(rec, 'rader', [dep(16, 12), dep(16, 21)]);
    expect(lostAt(rec)).toBe('dedup');
  });

  it('says nothing when the earliest survives to the end', () => {
    const rec = newRecord(ms(16, 0));
    STAGES.forEach(s => stage(rec, s, [dep(16, 4), dep(16, 12)]));
    expect(lostAt(rec)).toBeNull();
  });

  // Losing later departures is normal — filters do that on purpose. Only a
  // change in the EARLIEST is a finding.
  it('does not accuse a stage that merely dropped later departures', () => {
    const rec = newRecord(ms(16, 0));
    stage(rec, 'svar', [dep(16, 4), dep(16, 12), dep(16, 21)]);
    stage(rec, 'modus', [dep(16, 4)]);
    expect(lostAt(rec)).toBeNull();
  });

  it('reports the FIRST stage that lost it, not the last', () => {
    const rec = newRecord(ms(16, 0));
    stage(rec, 'svar', [dep(16, 4)]);
    stage(rec, 'adaptert', [dep(16, 12)]);
    stage(rec, 'dedup', [dep(16, 20)]);
    expect(lostAt(rec)).toBe('adaptert');
  });

  it('survives an empty or half-filled record', () => {
    expect(lostAt(null)).toBeNull();
    expect(lostAt(newRecord(0))).toBeNull();
  });
});

describe('formatRecord', () => {
  const full = () => {
    const rec = newRecord(ms(15, 40));
    rec.askedFor = ms(16, 18);
    rec.askedFuture = true;
    rec.origin = 'NSR:StopPlace:1';
    stage(rec, 'svar', [dep(16, 21), dep(16, 27)]);
    stage(rec, 'rader', [dep(16, 21), dep(16, 27)]);
    rec.stopBoard = ms(16, 4);
    return rec;
  };

  it('flags a future ask, which is the one thing that removes near departures by construction', () => {
    expect(formatRecord(full()).join('\n')).toContain('← FRAMTIDIG');
  });

  it('names the stop board when Entur has an earlier one — the discriminator', () => {
    const txt = formatRecord(full()).join('\n');
    expect(txt).toContain('stopptavle');
    expect(txt).toContain('16:04');
    expect(txt).toContain('Entur har en tidligere');
  });

  it('does not cry wolf when the two agree', () => {
    const rec = full();
    rec.stopBoard = ms(16, 21);
    expect(formatRecord(rec).join('\n')).not.toContain('Entur har en tidligere');
  });

  it('leaves the stop-board line out entirely when it was not asked', () => {
    const rec = full();
    rec.stopBoard = null;
    expect(formatRecord(rec).join('\n')).not.toContain('stopptavle');
  });

  it('tallies the drop reasons rather than listing duplicates', () => {
    const rec = newRecord(ms(16, 0));
    stage(rec, 'adaptert', [dep(16, 4)]);
    rec.dropped = ['kun gange', 'kun gange', 'bytte uten navn'];
    const txt = formatRecord(rec).join('\n');
    expect(txt).toContain('3 forkastet');
    expect(txt).toContain('2× kun gange');
    expect(txt).toContain('bytte uten navn');
  });

  it('renders nothing for nothing', () => {
    expect(formatRecord(null)).toEqual([]);
    expect(formatRecord(newRecord(0))).toEqual([]);
  });
});


// ── Which platforms we board at ────────────────────────────────────────────
//
// Reported: "det ser ut som at du kun viser avganger fra ett av sporene
// (spor 2) på avganger fra Mortensrud på linje 3". Nothing in the app filters
// by platform, so the question can only be settled by putting our own tally
// next to the stop's own — which is what these two pin.

describe('_missingQuay', () => {
  it('spots a platform the stop has and our rows never use', () => {
    expect(_missingQuay({ '2': 8 }, { '1': 6, '2': 8 })).toBe(true);
  });

  it('says nothing when we cover every platform the stop reports', () => {
    expect(_missingQuay({ '1': 3, '2': 8 }, { '1': 6, '2': 8 })).toBe(false);
    expect(_missingQuay({ '2': 8 }, { '2': 14 })).toBe(false);
  });

  // An unknown platform is not a platform we are failing to show — it is a
  // departure the response did not label, and accusing ourselves of dropping
  // it would send the next reader hunting for a bug that is not there.
  it('does not count an unlabelled platform as a missing one', () => {
    expect(_missingQuay({ '2': 8 }, { '2': 8, '?': 3 })).toBe(false);
  });

  it('claims nothing without both tallies', () => {
    expect(_missingQuay(null, { '1': 1 })).toBe(false);
    expect(_missingQuay({ '2': 1 }, null)).toBe(false);
  });
});

describe('formatRecord — platforms', () => {
  const rec = () => {
    const r = newRecord(ms(16, 0));
    stage(r, 'rader', [dep(16, 4)]);
    r.ourQuays = { '2': 8 };
    r.stopBoard = ms(16, 4);
    r.stopBoardN = 14;
    r.stopBoardQuays = { '2': 8, '1': 6 };
    return r;
  };

  it('puts the two tallies where they can be compared, and names the gap', () => {
    const txt = formatRecord(rec()).join('\n');
    expect(txt).toContain('spor       2×8');
    expect(txt).toContain('2×8, 1×6');
    expect(txt).toContain('← spor vi ikke viser');
    expect(txt).toContain('14 avganger');
  });

  it('does not accuse us when the platforms match', () => {
    const r = rec();
    r.ourQuays = { '2': 8, '1': 6 };
    expect(formatRecord(r).join('\n')).not.toContain('spor vi ikke viser');
  });
});
