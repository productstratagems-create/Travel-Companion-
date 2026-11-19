// v1.218.142: kandidatene følger deg, ikke bare skjermens tavle; og et hentebudsjett.
import { describe, it, expect, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({ makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(), mapHalo: vi.fn(), sideVehicleSvg: () => '', SIDE_VEHICLE_MAX_PX: 30 }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));
import { readFileSync } from 'node:fs';
import { ombordKandidater, kandidatKall, bassengInn, bassengUt, BASSENG_MS, budsjettTillater, HENT_BUDSJETT_PR_MIN } from '../src/views/auto.js';
import { ombord } from '../src/api/ombord.js';

const T0 = Date.UTC(2026, 10, 2, 7, 0, 0), S = 1000, MIN = 60 * S, LAT = 59.9;
const lon = (m) => 10.70 + m / 55_800;
const avgang = (id, linje, startM, fart, skiftMin = 0) => {
  const stopp = [0, 1, 2, 3, 4].map(i => {
    const t = new Date(T0 + (i * 600 / fart) * S + skiftMin * MIN).toISOString();
    return { quay: { latitude: LAT, longitude: lon(startM + i * 600), publicCode: '1', stopPlace: { id: 'S' + i, name: 'Stopp ' + i } },
      aimedArrivalTime: t, expectedArrivalTime: t, aimedDepartureTime: t, expectedDepartureTime: t };
  });
  return { cancellation: false, destinationDisplay: { frontText: 'X' }, expectedDepartureTime: stopp[0].expectedDepartureTime,
    serviceJourney: { id, line: { publicCode: linje, presentation: { colour: 'e60000' } }, estimatedCalls: stopp } };
};
const SPOR = [0, 10, 20, 30].map(t => ({ lat: LAT, lon: lon(10 * t), at: T0 + t * S, acc: 10 }));

describe('kandidatbassenget', () => {
  // FØR-BILDET: du gikk om bord på stopp X; skjermen står ved stopp Y, der
  // bare en annen tur (fire min senere) er på tavla.
  const fraX = [avgang('J37', '37', 0, 10)];
  const fraY = [avgang('J20', '20', 0, 10, 4)];
  it('uten bassenget: turen din er ikke kandidat, dommen vet ikke', () => {
    const d = ombord({ spor: SPOR, fartMS: 10, kandidater: ombordKandidater(fraY, SPOR) });
    expect(d.kind).not.toBe('ombord');
  });
  it('med bassenget: turen fra stoppet du gikk på finnes, og dommen finner den', () => {
    const b = bassengInn(new Map(), fraX, T0 - 2 * MIN);
    const d = ombord({ spor: SPOR, fartMS: 10, kandidater: ombordKandidater(kandidatKall(fraY, b, T0), SPOR) });
    expect(d.kind).toBe('ombord');
    expect(d.kandidater[0].linje).toBe('37');
  });
  it('tavla vinner over bassenget for samme tur, og ingen dobbel', () => {
    const b = bassengInn(new Map(), fraX, T0 - MIN);
    expect(kandidatKall(fraX, b, T0)).toHaveLength(1);
  });
  it('beskjæres etter BASSENG_MS, og når turen er ferdig', () => {
    const lang = [avgang('J37', '37', 0, 10, 20)];   // ferdig ved T0+24 min
    const b = bassengInn(new Map(), lang, T0);
    expect(bassengUt(new Map(b), T0 + BASSENG_MS - 1).size).toBe(1);
    expect(bassengUt(new Map(b), T0 + BASSENG_MS + 1).size).toBe(0);
    const ferdig = bassengInn(new Map(), fraX, T0 + 10 * MIN);   // siste stopp ved T0+4 min
    expect(ferdig.size).toBe(0);
  });
  it('skjermen fyller bassenget fra tavla', () => {
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/_rå = kall;\s*\n\s*bassengInn\(_kandidatBasseng, kall, Date\.now\(\)\);/);
  });
});

describe('hentebudsjettet', () => {
  it('slipper inntil taket per minutt, så venter', () => {
    const logg = [];
    for (let i = 0; i < HENT_BUDSJETT_PR_MIN / 2; i++) expect(budsjettTillater(logg, T0 + i, 2)).toBe(true);
    expect(budsjettTillater(logg, T0 + 10, 2)).toBe(false);
    expect(budsjettTillater(logg, T0 + 61_000, 2)).toBe(true);
  });
});
