// Trappen i fetchTrip dropper feltet Entur faktisk avviste.
//
// Funnet av testrutene 2026-11-03: Entur avviste `affects` med meldingen
// under, og trappen kastet innstilte, bytte og ider, som alle virker, før
// den kom til affects.
import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));
vi.mock('../src/geo.js', () => ({ loadWalkSpeed: () => 'middels' }));
vi.mock('../src/api/adapt.js', () => ({ quayLatLon: () => null }));
const fetchMock = vi.fn();
vi.mock('../src/api/http.js', () => ({ enturFetch: (...a) => fetchMock(...a) }));
const { fetchTrip, avvistFlagg, _resetAffectsProbe, _resetCoachProbe, _resetWindowProbe,
  _resetInnstilteProbe, _resetBytteProbe, _resetIderProbe } = await import('../src/api/entur.js');
import { AFFECTS_GQL } from '../src/api/queries.js';

// Ordrett fra Entur.
const EKTE = "Validation error (UnknownType@[stopPlace/situations/affects]) : Unknown type 'AffectedQuay'";

describe('hvilket felt feilen gjelder', () => {
  it('den ekte affects-feilen gjelder affects, ikke innstilte', () => {
    expect(avvistFlagg([{ message: EKTE }])).toBe('affects');
  });
  it.each([
    ["Unknown argument 'includeRealtimeCancellations'", 'innstilte'],
    ["Field 'interchangeTo' in type 'Leg' is undefined", 'bytte'],
    ["Validation error (FieldUndefined@[trip/tripPatterns/legs/fromPlace/quay])", 'ider'],
    ["Unknown argument 'searchWindow'", 'window'],
    ["Unknown enum value 'coach'", 'coach'],
    ["Unknown argument 'dateTime'", 'lookback'],
  ])('%s → %s', (msg, flagg) => {
    expect(avvistFlagg([{ message: msg }])).toBe(flagg);
  });
  it('en melding som ikke peker på noe, gir null, og trappen bruker fast rekkefølge', () => {
    expect(avvistFlagg([{ message: 'Validation error' }])).toBeNull();
    expect(avvistFlagg(undefined)).toBeNull();
  });
});

describe('trappen med den ekte feilen', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    _resetAffectsProbe(); _resetCoachProbe(); _resetWindowProbe();
    _resetInnstilteProbe(); _resetBytteProbe(); _resetIderProbe();
  });
  it('dropper bare affects og beholder de tre feltene som virker', async () => {
    fetchMock
      .mockReturnValueOnce(Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ errors: [{ message: EKTE }] }) }))
      .mockReturnValue(Promise.resolve({ ok: true, status: 200,
        json: () => Promise.resolve({ data: { trip: { tripPatterns: [] }, stopPlace: { situations: [] } } }) }));
    fetchTrip({ stopId: 'NSR:StopPlace:1', toStopId: 'NSR:StopPlace:2' }, vi.fn(), vi.fn());
    for (let i = 0; i < 8; i++) await new Promise(r => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const andre = JSON.parse(fetchMock.mock.calls[1][1].body).query;
    expect(andre).not.toContain('affects{');
    expect(andre).toContain('includeRealtimeCancellations');
    expect(andre).toContain('interchangeTo');
    expect(andre).toContain('quay{id');
  });
});

describe('fragmentet følger skjemaet', () => {
  it('spør ikke om AffectedQuay, som ikke finnes', () => {
    expect(AFFECTS_GQL).not.toContain('AffectedQuay');
  });
  it('spør om typene Entur faktisk gir (målt: 110 AffectedStopPlaceOnLine av 129)', () => {
    ['AffectedLine', 'AffectedStopPlace{', 'AffectedStopPlaceOnLine', 'AffectedStopPlaceOnServiceJourney', 'AffectedServiceJourney']
      .forEach(t => expect(AFFECTS_GQL).toContain(t));
  });
});
