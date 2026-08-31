import { describe, it, expect } from 'vitest';
import { newRecord, earliestOf, stage, lostAt, formatRecord, STAGES } from '../src/api/diagnose.js';

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
