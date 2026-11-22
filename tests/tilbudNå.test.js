// v1.218.240: evaluert «antall linjer ≠ tilbud»; styrer «nærmeste stopp».
import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
import { sammenlignViktighet, modusVekt, infoFraSvar, stoppInfoGql, samletInfo, fetchStoppLinjer, stoppInfoUtdatert, _resetStoppLinjer, STOPP_INFO_MS, nærViktigFørst } from '../src/api/stops.js';
const I = (moduser, avgangerNå, linjer = 1, plattformer = 1) => ({ moduser, avgangerNå, linjer, plattformer });
describe('tilbudet nå', () => {
  it('før-bildet: nattlinje-stopp med flere linjer slo stoppet med avganger nå', () => {
    const natt = I(['bus'], 1, 6, 2), dag = I(['bus'], 24, 3, 2);
    expect(sammenlignViktighet(dag, natt)).toBeLessThan(0);   // dag først
  });
  it('vekt på transportmiddel: én båt pluss buss slår ikke buss med mye tilbud; T-bane slår buss', () => {
    expect(sammenlignViktighet(I(['bus'], 30, 20), I(['water', 'bus'], 2, 2))).toBeLessThan(0);
    expect(sammenlignViktighet(I(['metro', 'bus'], 10), I(['bus'], 40, 20))).toBeLessThan(0);
    expect(modusVekt(['tram', 'bus'])).toBe(3);
  });
  it('leser avgangene neste time når svaret har dem', () => {
    const m = infoFraSvar({ data: { stopPlaces: [{ id: 'X', quays: [{ lines: [{ id: 'L1', transportMode: 'bus' }] }], estimatedCalls: [{}, {}, {}] }] } });
    expect(m.get('X').avgangerNå).toBe(3);
    expect(stoppInfoGql(['X'], true)).toMatch(/estimatedCalls\(timeRange: 3600, numberOfDepartures: 100\)/);
    expect(stoppInfoGql(['X'], false)).not.toMatch(/estimatedCalls/);
  });
  it('styrer valget av stopp innen gangavstand (rankStops leser nærViktigFørst)', () => {
    const info = { A: I(['bus'], 1, 6), B: I(['bus'], 20, 3) };
    const s = [{ id: 'A', distM: 150 }, { id: 'B', distM: 300 }].sort(nærViktigFørst(x => info[x.id]));
    expect(s[0].id).toBe('B');
  });
});
describe('klyngen samlet og utdatert svar', () => {
  beforeEach(() => _resetStoppLinjer());
  const svar = { data: { stopPlaces: [
    { id: 'S1', quays: [{ lines: [{ id: 'L1', transportMode: 'bus' }] }], estimatedCalls: [{}] },
    { id: 'S2', quays: [{ lines: [{ id: 'L2', transportMode: 'tram' }, { id: 'L1', transportMode: 'bus' }] }], estimatedCalls: [{}, {}] },
  ] } };
  const ok = j => vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(j) }));
  it('linjene på 2. medlem teller; union av linjer, sum av avganger', async () => {
    globalThis.fetch = ok(svar);
    await fetchStoppLinjer(['S1', 'S2'], 1000);
    expect(samletInfo(['S1', 'S2'])).toEqual({ moduser: ['bus', 'tram'], linjer: 2, plattformer: 2, avgangerNå: 3 });
  });
  it('utdatert etter 10 min, så spør på nytt', async () => {
    globalThis.fetch = ok(svar);
    await fetchStoppLinjer(['S1'], 1000);
    expect(stoppInfoUtdatert('S1', 1000 + STOPP_INFO_MS - 1)).toBe(false);
    expect(stoppInfoUtdatert('S1', 1000 + STOPP_INFO_MS + 1)).toBe(true);
  });
  it('avvist probe: spør igjen uten avganger', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ errors: [{ message: 'Unknown field estimatedCalls' }] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(svar) });
    globalThis.fetch = f;
    await fetchStoppLinjer(['S1'], 1000);
    expect(f).toHaveBeenCalledTimes(2);
    expect(JSON.parse(f.mock.calls[1][1].body).query).not.toMatch(/estimatedCalls/);
  });
});
import { whereLabel, ikkeNærmest } from '../src/views/auto.js';
describe('overskriften sier ikke «nærmeste» om et stopp valgt for tilbudet', () => {
  it('beste stopp herfra når et annet er nærmere', () => {
    expect(ikkeNærmest({ id: 'B', distM: 300 }, [{ id: 'A', distM: 150 }, { id: 'B', distM: 300 }])).toBe(true);
    expect(ikkeNærmest({ id: 'A', distM: 150 }, [{ id: 'A', distM: 150 }, { id: 'B', distM: 300 }])).toBe(false);
    expect(whereLabel(false, null, 300, true)).toBe('beste stopp herfra');
    expect(whereLabel(false, null, 300, false)).toBe('nærmeste stopp');
    expect(whereLabel(false, null, 20, true)).toBe('du er ved');
  });
});
