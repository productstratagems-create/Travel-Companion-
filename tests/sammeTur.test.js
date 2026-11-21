// v1.218.216: Munkerud 18:04 — samme 74 fra nabostoppet 18:10 og Munkerud 18:12.
import { describe, it, expect } from 'vitest';
import { slåSammenKall } from '../src/views/auto.js';
const k = (j, t) => ({ serviceJourney: { id: j }, expectedDepartureTime: '2026-11-21T' + t + ':00+01:00' });
describe('samme tur fra to stopp: stoppet du står ved vinner', () => {
  it('ett kall, fra stoppet ditt — ikke nabostoppets tidligere passering', () => {
    const ut = slåSammenKall([
      { stopp: null, kall: [k('74J', '18:12')] },
      { stopp: { id: 'NSR:Nabo', name: 'Nordstrandveien' }, kall: [k('74J', '18:10')] },
    ]);
    expect(ut).toHaveLength(1);
    expect(ut[0]._fra).toBeUndefined();
    expect(ut[0].expectedDepartureTime).toMatch(/18:12/);
  });
  it('ringlinje: samme tur to ganger ved stoppet ditt står to ganger', () => {
    expect(slåSammenKall([{ stopp: null, kall: [k('R', '18:00'), k('R', '18:40')] }])).toHaveLength(2);
  });
  it('nabostoppets egne turer står fortsatt', () => {
    const ut = slåSammenKall([{ stopp: null, kall: [k('A', '18:12')] }, { stopp: { id: 'N', name: 'N' }, kall: [k('B', '18:10')] }]);
    expect(ut.map(c => c.serviceJourney.id)).toEqual(['B', 'A']);
  });
});
