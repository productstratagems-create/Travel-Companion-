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

import { tavleRekk, rekkKall } from '../src/views/auto.js';
describe('rekk den lenger ned i Auto-tavle (v1.218.185)', () => {
  // 74 går fra Mortensrud om 0 min (rekker ikke, 2 min gange), Bøler om 5 (3 min gange).
  const tur = { serviceJourney: { estimatedCalls: [k('Mrud', 'Mortensrud', 0), k('Bol', 'Bøler', 5), k('Jbt', 'Jernbanetorget', 17)] } };
  const gang = ll => 3;
  it('samme regel som Rute, uten mål: et senere stopp du rekker', () => {
    const r = tavleRekk(tur, MRUD, gang, 2, T);
    expect(r).toMatchObject({ stopp: { navn: 'Bøler' }, gangMin: 3 });
  });
  it('kallet slik det ser ut derfra: avgang og påstigning på stoppet lenger ned', () => {
    const r = tavleRekk(tur, MRUD, gang, 2, T);
    const c = rekkKall(tur, r);
    expect(Date.parse(c.expectedDepartureTime)).toBe(T + 5 * M);
    expect(c._fra).toMatchObject({ name: 'Bøler', id: 'NSR:StopPlace:Bol' });
    expect(tur._fra).toBeUndefined();
  });
  it('koblingen: raden flyttes til dem du rekker, med teksten fra Rute', () => {
    const auto = readFileSync('src/views/auto.js', 'utf8'), rad = readFileSync('src/ui/tavleRad.js', 'utf8');
    expect(auto).toMatch(/Object\.assign\(x, \{ rekk: rk, rekker: true, gang: rk\.gangMin, gåOm: gåOm\(rk\.ms, rk\.gangMin, nå\) \}\);/);
    expect(auto).toMatch(/const c = x\.rekk \? rekkKall\(x\.call, x\.rekk\) : x\.call;/);
    expect(rad).toMatch(/esc\(rekkLinje\(x\.rekk, clk, /);
  });
});

import { AT_RETNINGER, AT_RETNING_TEKST, AT_RETNING_KEY } from '../src/views/auto.js';
describe('retningsvalget huskes (v1.218.185)', () => {
  const auto = readFileSync('src/views/auto.js', 'utf8');
  it('samme fire valg som knappene', () => {
    expect([...AT_RETNINGER].sort()).toEqual(Object.keys(AT_RETNING_TEKST).sort());
  });
  it('lagres ved trykk, leses ved start og nytt stopp — ikke nullstilt til «alle»', () => {
    expect(auto).toMatch(/_atRetning = b\.dataset\.retning; _lagreRetning\(_atRetning\);/);
    expect(auto).toMatch(/let _atRetning = lagretRetning\(\);/);
    expect(auto).toMatch(/_atIkkeÅpen = false; _atRetning = lagretRetning\(\); \}/);
    expect(readFileSync('src/storage.js', 'utf8')).toContain("'" + AT_RETNING_KEY + "'");
  });
});

import { retningRekk } from '../src/views/auto.js';
describe('rekk den lenger ned i Auto-reise (v1.218.190)', () => {
  const tur = m => ({ serviceJourney: { estimatedCalls: [k('Mrud', 'Mortensrud', m), k('Bol', 'Bøler', m + 5), k('Jbt', 'Jernbanetorget', m + 17)] } });
  const d = (...ms) => ({ calls: ms.map(m => ({ ms: T + m * M, call: tur(m) })) });
  const gang = () => 3;
  it('første du ikke rekker her, nådd lenger ned', () => {
    const r = retningRekk(d(1, 30), MRUD, gang, 4, T);
    expect(r).toMatchObject({ stopp: { navn: 'Bøler' }, ms: T + 6 * M });
  });
  it('ingenting når du rekker en tidligere herfra', () => {
    expect(retningRekk(d(1, 5), MRUD, gang, 4, T)).toBe(null);
  });
  it('uten gangtid: ingenting', () => {
    expect(retningRekk(d(1, 30), MRUD, gang, null, T)).toBe(null);
  });
  it('raden sier det med samme tekst', () => {
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/'<span class="auto-rekk">' \+ esc\(rekkLinje\(rk, clk, _stop && _stop\.name\)\)/);
  });
});

import { unikeStopp } from '../src/ui/stoppVelger.js';
describe('samme navn én gang (v1.218.191)', () => {
  const st = (id, name, at) => ({ id, name, at });
  const STOPP = [st('A', 'Bøler', 1), st('J1', 'Jernbanetorget', 54), st('J2', 'Jernbanetorget', 55)];
  it('før-bildet: Jernbanetorget to ganger i «ofte brukt»; nå én, den tidligste', () => {
    const html = stoppValgHtml(STOPP, [{ name: 'Jernbanetorget' }], null);
    const [ofte, alle] = html.split('alle stopp');
    expect((ofte.match(/>Jernbanetorget</g) || []).length).toBe(1);
    expect((alle.match(/>Jernbanetorget</g) || []).length).toBe(1);
    expect(unikeStopp(STOPP).map(s => s.id)).toEqual(['A', 'J1']);
  });
});

import { radAnkomst } from '../src/ui/stoppVelger.js';
describe('ankomst på tavleraden (v1.218.193)', () => {
  it('til et vanlig mål på turen', () => {
    expect(radAnkomst(KALL, MRUD, [{ name: 'Jernbanetorget', count: 3 }], T)).toEqual({ navn: 'Jernbanetorget', ms: T + 34 * M });
  });
  it('mål før påstigning eller ikke på turen: ingenting', () => {
    expect(radAnkomst(KALL, MRUD, [{ name: 'Hauketo' }, { name: 'Majorstuen' }], T)).toBe(null);
  });
  it('uten vanlige mål: ingenting — aldri endestasjonen', () => {
    expect(radAnkomst(KALL, MRUD, [], T)).toBe(null);
  });
  it('raden viser det med Rutes ord', () => {
    expect(readFileSync('src/ui/tavleRad.js', 'utf8')).toMatch(/'<span class="at-ank">ank\. ' \+ esc\(x\.ank\.navn\) \+ ' ' \+ esc\(clk\(x\.ank\.ms\)\)/);
  });
});
