import { describe, it, expect, beforeEach } from 'vitest';
import { predictDest, loadSmartHist } from '../src/api/smart.js';

const entry = (toName, bucket, count) => ({
  key: toName + '|' + bucket + '|wd', fromName: 'Mortensrud', toName,
  toStopId: 'NSR:StopPlace:9', bucket, isWeekend: false, count, lastUsed: Date.now(),
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('__activeProfile', 'default');
  localStorage.setItem('default::t.smartHist', JSON.stringify([
    entry('Jernbanetorget', 4, 40),   // 08:00 — the trip out
    entry('Hjemme', 8, 14),           // 16:00 — the trip back
  ]));
});

describe('predictDest(at)', () => {
  // The whole reason the argument exists: a return trip is set in the morning
  // and needs to know what happens in the afternoon, which a hardcoded
  // new Date() could never answer.
  it('answers for the time it is asked about, not for now', () => {
    const morning = new Date(2026, 4, 26, 8, 0).getTime();
    const afternoon = new Date(2026, 4, 26, 16, 0).getTime();
    expect(predictDest(morning).toName).toBe('Jernbanetorget');
    expect(predictDest(afternoon).toName).toBe('Hjemme');
  });

  it('without an argument behaves exactly as it always has', () => {
    const now = Date.now();
    expect(predictDest()).toEqual(predictDest(now));
  });

  it('still falls back to freqArr with no history at all', () => {
    localStorage.setItem('default::t.smartHist', '[]');
    localStorage.setItem('default::t.freqArr', JSON.stringify([{ name: 'Tøyen', stopId: 'NSR:1' }]));
    const p = predictDest(Date.now());
    expect(p.source).toBe('freq');
    expect(p.toName).toBe('Tøyen');
  });

  it('exposes the raw history for callers that score it themselves', () => {
    expect(loadSmartHist()).toHaveLength(2);
  });
});
