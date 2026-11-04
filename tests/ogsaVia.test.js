// «Også via»: to svar fra Entur til ett.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));
const { slåSammenSvar, reiseNøkkel } = await import('../src/api/entur.js');

const etappe = (id, t) => ({ mode: 'metro', serviceJourney: { id }, expectedStartTime: t });
const svar = (...tps) => ({ data: { trip: { tripPatterns: tps }, stopPlace: { situations: [] } } });
const A = { legs: [etappe('sj3', '08:09'), { mode: 'foot' }, etappe('sj2', '08:33')] };
const B = { legs: [etappe('sj3', '08:09'), { mode: 'foot' }, etappe('sj69', '08:39')] };

describe('slåSammenSvar', () => {
  it('merker reisene fra via-svaret med navnet på stoppet', () => {
    const tps = slåSammenSvar([svar(A), svar(B)], ['NSR:StopPlace:58198', null], 'Hellerud').data.trip.tripPatterns;
    expect(tps.map(t => t._via || null)).toEqual(['Hellerud', null]);
  });
  it('teller samme reise én gang, og beholder via-merket', () => {
    const tps = slåSammenSvar([svar(A), svar(A, B)], ['V', null], 'Hellerud').data.trip.tripPatterns;
    expect(tps).toHaveLength(2);
    expect(tps[0]._via).toBe('Hellerud');
  });
  it('bruker svaret som har data når det andre feilet', () => {
    const r = slåSammenSvar([{ errors: [{ message: 'x' }] }, svar(B)], ['V', null], 'Hellerud');
    expect(r.data.trip.tripPatterns).toHaveLength(1);
  });
  it('ett svar gis uendret tilbake', () => {
    const s = svar(A);
    expect(slåSammenSvar([s], [null], null)).toBe(s);
  });
  it('nøkkelen ser bort fra gange og bruker tur og avgang', () => {
    expect(reiseNøkkel(A)).toBe('sj3@08:09>sj2@08:33');
  });
});
