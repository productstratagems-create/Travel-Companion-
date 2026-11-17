// v1.218.99: én definisjon av «turens vei» for auto-reise, underveis og tavla.
import { describe, it, expect, vi, beforeEach } from 'vitest';
const cache = new Map();
const hent = vi.fn();
vi.mock('../src/api/entur.js', () => ({
  journeyShapeCached: id => cache.get(id),
  fetchJourneyShape: id => hent(id),
}));
const { turForm } = await import('../src/ui/turForm.js');
const BUE = [[59.90, 10.80], [59.90, 10.82], [59.91, 10.82]];
const A = { lat: 59.90, lon: 10.80 }, B = { lat: 59.91, lon: 10.82 };
const flush = () => new Promise(r => setTimeout(r, 0));

describe('turForm', () => {
  beforeEach(() => { cache.clear(); hent.mockReset(); });
  it('kjent form: delen mellom stoppene', () => {
    cache.set('j', BUE);
    expect(turForm('j', A, B, null)).toHaveLength(3);
    expect(hent).not.toHaveBeenCalled();
  });
  it('ukjent form: henter, og tegner på nytt bare ved treff', async () => {
    const på = vi.fn();
    hent.mockResolvedValueOnce(BUE);
    expect(turForm('j', A, B, på)).toBe(null);
    await flush();
    expect(på).toHaveBeenCalledTimes(1);
    hent.mockResolvedValueOnce(null);
    turForm('k', A, B, på);
    await flush();
    expect(på).toHaveBeenCalledTimes(1);
  });
  it('kjent bom: ingen nye spørsmål', () => {
    cache.set('j', null);
    expect(turForm('j', A, B, vi.fn())).toBe(null);
    expect(hent).not.toHaveBeenCalled();
  });
});
