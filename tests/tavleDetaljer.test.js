// v1.218.181: ett trykk på en tavlerad → avgangsdetaljer, også uten valgt mål.
import { describe, it, expect, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
import { readFileSync } from 'node:fs';
import { kjentMål, stoppValgHtml, stopsAhead } from '../src/ui/stoppVelger.js';
import { tavleDetaljDir } from '../src/views/auto.js';

const T = Date.parse('2026-11-20T20:17:00+01:00'), M = 60_000, iso = m => new Date(T + m * M).toISOString();
const k = (id, navn, m) => ({ quay: { stopPlace: { id: 'NSR:StopPlace:' + id, name: navn, latitude: 59.9, longitude: 10.8 } }, expectedArrivalTime: iso(m), expectedDepartureTime: iso(m) });
// 74: Hauketo (før) → Mortensrud (din) → Bøler → Jernbanetorget
const KALL = { serviceJourney: { estimatedCalls: [k('Hk', 'Hauketo', 14), k('Mrud', 'Mortensrud', 17), k('Bol', 'Bøler', 22), k('Jbt', 'Jernbanetorget', 34)] } };
const MRUD = { id: 'NSR:StopPlace:Mrud', name: 'Mortensrud', lat: 59.85, lon: 10.83 };
const id = f => f;

describe('kjentMål', () => {
  const stops = stopsAhead(KALL, 'Mortensrud', T, 'NSR:StopPlace:Mrud');
  it('et vanlig mål på turen, etter påstigning, velges — mest brukt vinner', () => {
    expect(kjentMål(stops, [{ name: 'Bøler', count: 2 }, { name: 'Jernbanetorget', count: 9 }]).name).toBe('Jernbanetorget');
  });
  it('et vanlig mål FØR påstigning, eller ikke på turen, velges ikke', () => {
    expect(kjentMål(stops, [{ name: 'Hauketo', count: 9 }, { name: 'Majorstuen', count: 5 }])).toBe(null);
  });
  it('uten vanlige mål: null — skjermen spør', () => {
    expect(kjentMål(stops, [])).toBe(null);
  });
});

describe('tavleDetaljDir', () => {
  it('fra radens stopp; med vanlig mål på turen: målet, merket kjent', () => {
    const d = tavleDetaljDir(KALL, MRUD, id, [{ name: 'Jernbanetorget', count: 3 }], T);
    expect(d).toMatchObject({ key: 'auto-tavle', from: 'Mortensrud', stopId: 'NSR:StopPlace:Mrud', to: 'Jernbanetorget', _målKjent: true });
  });
  it('uten: ingen mål — ingen gjetning', () => {
    expect(tavleDetaljDir(KALL, MRUD, id, [], T)).toMatchObject({ to: null, toStopId: null, _målKjent: false });
  });
  it('rad fra nabostopp: nabostoppet er fra', () => {
    const c = { ...KALL, _fra: { id: 'NSR:StopPlace:Hk', name: 'Hauketo', lat: 1, lon: 2 } };
    expect(tavleDetaljDir(c, MRUD, id, [], T)).toMatchObject({ from: 'Hauketo', stopId: 'NSR:StopPlace:Hk' });
  });
});

describe('koblingen', () => {
  const auto = readFileSync('src/views/auto.js', 'utf8'), sel = readFileSync('src/views/selected.js', 'utf8');
  it('før-bildet: raden åpnet stopplista (_open); nå åpner den avgangsdetaljene for kallet', () => {
    expect(auto).toMatch(/c\._dir = tavleDetaljDir\(c, _stop, medKoord, loadFreq\('arr'\), Date\.now\(\)\);\s*window\.tap\(c\);/);
  });
  it('samme stoppvelger begge steder, og valget blir ikke en Rute', () => {
    expect(auto).toMatch(/from '\.\.\/ui\/stoppVelger\.js'/);
    expect(sel).toMatch(/stoppValgHtml\(stops, loadFreq\('arr'\), dir\.toStopId\)/);
    const i = sel.indexOf("document.addEventListener('click'");
    expect(sel.slice(i, i + 1200)).not.toMatch(/setActiveRoute|_useRouteDir|_byttRute/);
  });
  it('tom tur sier det', () => {
    expect(stoppValgHtml([], [], null)).toMatch(/vet ikke hvor den går videre/);
  });
});
