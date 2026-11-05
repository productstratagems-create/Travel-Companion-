// fetchArrBoard: en feil er en feil, og per linje slås bare av når feilen gjelder det.
import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));
vi.mock('../src/geo.js', () => ({ loadWalkSpeed: () => 'middels' }));
vi.mock('../src/api/adapt.js', () => ({ quayLatLon: () => null }));
const fetchMock = vi.fn();
vi.mock('../src/api/http.js', () => ({ enturFetch: (...a) => fetchMock(...a) }));
const { fetchArrBoard, _resetPerLineProbe } = await import('../src/api/entur.js');
const svar = (j) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(j) });
const OK = { data: { stopPlace: { name: 'X', estimatedCalls: [] } } };
beforeEach(() => { fetchMock.mockReset(); _resetPerLineProbe(); });

describe('fetchArrBoard', () => {
  it('et tidsavbrudd slår ikke av per linje, og blir en feil, ikke en tom liste', async () => {
    fetchMock.mockReturnValue(svar({ errors: [{ message: 'TIMEOUT! The request is too resource intensive.' }] }));
    await expect(fetchArrBoard('S', 40, { fraMs: Date.now(), perLinje: 2 })).rejects.toThrow(/TIMEOUT/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockReset(); fetchMock.mockReturnValue(svar(OK));
    await fetchArrBoard('S', 40, { fraMs: Date.now(), perLinje: 2 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).query).toContain('PerLineAndDestinationDisplay');
  });
  it('en feil som nevner per linje: spør uten', async () => {
    fetchMock.mockReturnValueOnce(svar({ errors: [{ message: "Unknown argument 'numberOfDeparturesPerLineAndDestinationDisplay'" }] }))
      .mockReturnValue(svar(OK));
    const r = await fetchArrBoard('S', 40, { fraMs: Date.now(), perLinje: 2 });
    expect(r.departures).toEqual([]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).query).not.toContain('PerLine');
  });
});
