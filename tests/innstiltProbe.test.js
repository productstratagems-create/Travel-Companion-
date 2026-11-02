/**
 * Be Entur om de innstilte avgangene — og tål et nei.
 *
 * Ingen spørring i appen ba om dem. Journey Planner utelater dem trolig
 * da, og et innstilt tog forsvinner bare fra tavla, auto-reise og
 * reiseforslagene. Flaggene (`includeCancelledTrips` på avganger,
 * `includeRealtimeCancellations` på reiseforslag) kan ikke prøves herfra —
 * sandkassen når ikke api.entur.io.
 *
 * Så de er bygget som et trinn i stigen: spør med, og på nei, spør uten og
 * husk det for økten. Disse testene er det eneste som prøver at et nei
 * faktisk gir dagens oppførsel, og ikke en tom skjerm.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));
vi.mock('../src/geo.js', () => ({ loadWalkSpeed: () => 'middels' }));
vi.mock('../src/api/adapt.js', () => ({ quayLatLon: () => null, adaptTripPattern: x => x,
  takeDropReasons: () => [] }));

const fetchMock = vi.fn();
vi.mock('../src/api/http.js', () => ({ enturFetch: (...a) => fetchMock(...a) }));

const { fetchTrip, fetchBoard, fetchBoardPage, fetchStopBoardSummary, fetchNextDeparture,
  _innstilteRefused, _resetInnstilteProbe, _resetAffectsProbe, _resetCoachProbe,
  _resetWindowProbe, _resetPerLineProbe } = await import('../src/api/entur.js');

const DIR = { from: 'Grorud', to: 'Jernbanetorget', stopId: 'NSR:StopPlace:1', toStopId: 'NSR:StopPlace:2' };
const svar = (data) => ({ ok: true, status: 200, json: () => Promise.resolve({ data }) });
const tripOk = () => svar({ trip: { tripPatterns: [{ duration: 1 }] }, stopPlace: { situations: [] } });
const boardOk = () => svar({ stopPlace: { id: 'x', name: 'Grorud', situations: [], estimatedCalls: [] } });
const nei = (hva) => ({ ok: true, status: 200,
  json: () => Promise.resolve({ errors: [{ message: 'Unknown argument \'' + hva + '\'' }] }) });
const q = (i) => JSON.parse(fetchMock.mock.calls[i][1].body).query;
const vent = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };

beforeEach(() => {
  fetchMock.mockReset();
  _resetInnstilteProbe(); _resetAffectsProbe(); _resetCoachProbe(); _resetWindowProbe();
  if (_resetPerLineProbe) _resetPerLineProbe();
});

describe('reiseforslag', () => {
  it('spør om innstilte reiser', async () => {
    fetchMock.mockReturnValue(Promise.resolve(tripOk()));
    fetchTrip(DIR, vi.fn(), vi.fn());
    await vent();
    expect(q(0)).toContain('includeRealtimeCancellations:true');
  });

  /* FØRST AV ALT, og resten blir stående. Et nei som kunne vært til dette
   * flagget skal ikke koste en eneste avgang. */
  it('dropper det først ved et nei, og beholder alt annet', async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve(nei('includeRealtimeCancellations')))
      .mockReturnValue(Promise.resolve(tripOk()));
    const ok = vi.fn();
    fetchTrip(DIR, ok, vi.fn());
    await vent();
    expect(q(1)).not.toContain('includeRealtimeCancellations');
    ['affects{', 'searchWindow:', 'transportMode:coach', 'dateTime:']
      .forEach(f => expect(q(1), f).toContain(f));
    expect(ok).toHaveBeenCalled();
  });

  it('og husker neiet for økten', async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve(nei('x')))
      .mockReturnValue(Promise.resolve(tripOk()));
    fetchTrip(DIR, vi.fn(), vi.fn());
    await vent();
    expect(_innstilteRefused()).toBe(true);
    fetchMock.mockClear();
    fetchTrip(DIR, vi.fn(), vi.fn());
    await vent();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(q(0)).not.toContain('includeRealtimeCancellations');
  });
});

describe('tavla', () => {
  it('spør om innstilte avganger', async () => {
    fetchMock.mockReturnValue(Promise.resolve(boardOk()));
    fetchBoard(DIR, vi.fn(), vi.fn());
    await vent();
    expect(q(0)).toContain('includeCancelledTrips:true');
  });

  it('og et nei gir dagens tavle, ikke en tom', async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve(nei('includeCancelledTrips')))
      .mockReturnValue(Promise.resolve(boardOk()));
    const ok = vi.fn(), feil = vi.fn();
    fetchBoard(DIR, ok, feil);
    await vent();
    expect(q(1)).not.toContain('includeCancelledTrips');
    expect(ok).toHaveBeenCalled();
    expect(feil).not.toHaveBeenCalled();
    expect(_innstilteRefused()).toBe(true);
  });

  /* ÉN DOM FOR ALLE. Et nei på tavla betyr at reiseforslagene heller ikke
   * spør — to probes som hver betalte sitt eget avslag ville vært to
   * forespørsler hvert tjuende sekund resten av dagen. */
  it('og et nei på tavla gjelder reiseforslagene også', async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve(nei('x')))
      .mockReturnValue(Promise.resolve(boardOk()));
    fetchBoard(DIR, vi.fn(), vi.fn());
    await vent();
    fetchMock.mockReset();
    fetchMock.mockReturnValue(Promise.resolve(tripOk()));
    fetchTrip(DIR, vi.fn(), vi.fn());
    await vent();
    expect(q(0)).not.toContain('includeRealtimeCancellations');
  });

  it('og neste side av tavla spør likt', async () => {
    fetchMock.mockReturnValue(Promise.resolve(boardOk()));
    fetchBoardPage(DIR, null, 24, vi.fn(), vi.fn());
    await vent();
    expect(q(0)).toContain('includeCancelledTrips:true');
  });

  it('og neste side tåler et nei også', async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve(nei('x')))
      .mockReturnValue(Promise.resolve(boardOk()));
    const ok = vi.fn();
    fetchBoardPage(DIR, null, 24, ok, vi.fn());
    await vent();
    expect(q(1)).not.toContain('includeCancelledTrips');
    expect(ok).toHaveBeenCalled();
    // Og husker det. Uten dette betalte hver side sitt eget avslag — funnet
    // av en mutant som overlevde første runde.
    expect(_innstilteRefused()).toBe(true);
  });
});

/* ── SAMMENDRAGENE SPØR IKKE, MED VILJE ─────────────────────────────────
 *
 * «Når går noe herfra?» Et innstilt tog er ikke et svar. Med flagget ville
 * det blitt `calls[0]` og `best` — «neste avgang 08:12» for et tog som ikke
 * går. */
describe('sammendragene', () => {
  it('fetchNextDeparture spør ikke om innstilte', async () => {
    fetchMock.mockReturnValue(Promise.resolve(boardOk()));
    await fetchNextDeparture(DIR);
    expect(q(0)).not.toContain('includeCancelledTrips');
  });

  it('og heller ikke fetchStopBoardSummary', async () => {
    fetchMock.mockReturnValue(Promise.resolve(boardOk()));
    await fetchStopBoardSummary('NSR:StopPlace:1');
    expect(q(0)).not.toContain('includeCancelledTrips');
  });
});
