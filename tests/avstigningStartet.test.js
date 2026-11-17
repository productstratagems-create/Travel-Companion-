// v1.218.102: en startet reise teller stoppet du faktisk gikk av ved.
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({
  makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(),
  mapHalo: vi.fn(), sideVehicleSvg: () => '', SIDE_VEHICLE_MAX_PX: 30,
}));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import { storage } from '../src/storage.js';
import { state } from '../src/state.js';
import { recordSmartTrip, tripCount, loadSmartHist } from '../src/api/smart.js';
const { clearJny, lærAvStartetReise } = await import('../src/journey.js');

const STOPP = [['Mortensrud', 59.8493, 10.8297], ['Bøler', 59.8842, 10.8454], ['Helsfyr', 59.9128, 10.8008], ['Tøyen', 59.9152, 10.7745], ['Jernbanetorget', 59.9119, 10.7504]];
const T0 = new Date(2026, 10, 10, 18, 40).getTime();   // tirsdag, bøtte 9
const JNY = () => ({ from: 'Mortensrud', dest: 'Jernbanetorget', boardedAt: T0, lineCode: '3',
  legs: [{ lineCode: '3', fromStation: 'Mortensrud', toStation: 'Jernbanetorget',
    stops: STOPP.map(([name, lat, lon], i) => ({ id: 'S' + i, name, lat, lon, arr: null, dep: null })) }] });
// Om bord til Helsfyr, så gange nordover bort fra linja.
const SPOR = [...[0, 1, 2].map(i => ({ lat: STOPP[i][1], lon: STOPP[i][2], acc: 10, at: T0 + i * 300_000 })),
  ...[1, 2, 3].map(j => ({ lat: 59.9128 + 0.004 * j, lon: 10.8008, acc: 10, at: T0 + 900_000 + j * 30_000 }))];

function påbegynt() {
  storage.set('t.smartHist', ''); storage.set('t.vaneTelling', '2');
  vi.setSystemTime(T0);
  recordSmartTrip('Mortensrud', 'Jernbanetorget', null, null, null, null, undefined, 'startet');   // som doBoard (v1.218.105)
}

describe('startet reise, gikk av et annet sted', () => {
  beforeEach(() => { vi.useFakeTimers(); påbegynt(); storage.set('t.avstigningVent', ''); });
  it('spørres om først; «ja» flytter tellingen til stoppet du gikk av ved', async () => {
    const { venterAvstigning, svarAvstigning } = await import('../src/api/avstigningVent.js');
    const { avstigningSpørsmål } = await import('../src/intervju.js');
    state.jny = JNY(); state.posTrailLang = SPOR;
    clearJny();
    // STARTET ER IKKE REIST (v1.218.105): ingen reise før du har svart.
    expect(tripCount('Mortensrud', 'Jernbanetorget')).toBe(0);
    expect(loadSmartHist().find(e => e.toName === 'Jernbanetorget').startet).toBe(1);
    const q = avstigningSpørsmål(venterAvstigning(T0 + 3_600_000));
    expect(q[0].tekst).toBe('Gikk du av på Helsfyr (linje 3) tirsdag kl. 18:56?');
    svarAvstigning(q[0].obs.id, true);
    expect(tripCount('Mortensrud', 'Helsfyr')).toBe(1);
    expect(tripCount('Mortensrud', 'Jernbanetorget')).toBe(0);
    expect(loadSmartHist().find(e => e.toName === 'Jernbanetorget')).toBe(undefined);   // startet trukket fra
    expect(loadSmartHist().find(e => e.toName === 'Helsfyr').bucket).toBe(9);
  });
  it('uten spor etter påstigningen: bare startet, aldri reist', () => {
    expect(lærAvStartetReise(JNY(), SPOR.map(f => ({ ...f, at: T0 - 60_000 })))).toBe(null);
    expect(tripCount('Mortensrud', 'Jernbanetorget')).toBe(0);
  });
  it('av ved planlagt mål: spørres også, og «ja» gjør den til en reise', async () => {
    const { venterAvstigning, svarAvstigning } = await import('../src/api/avstigningVent.js');
    const { avstigningSpørsmål } = await import('../src/intervju.js');
    const fram = [...SPOR.slice(0, 3), ...[3, 4].map(i => ({ lat: STOPP[i][1], lon: STOPP[i][2], acc: 10, at: T0 + 1_200_000 + i * 60_000 }))];
    expect(lærAvStartetReise(JNY(), fram).name).toBe('Jernbanetorget');
    expect(tripCount('Mortensrud', 'Jernbanetorget')).toBe(0);
    const q = avstigningSpørsmål(venterAvstigning(T0 + 3_600_000))[0];
    expect(q.grunn).toBe('du startet reisen hit, og GPS-en tyder på at du kom fram');
    svarAvstigning(q.obs.id, true);
    expect(tripCount('Mortensrud', 'Jernbanetorget')).toBe(1);
    expect(loadSmartHist().find(e => e.toName === 'Jernbanetorget').startet).toBe(0);
  });
});
