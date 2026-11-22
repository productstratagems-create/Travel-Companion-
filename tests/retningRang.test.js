// v1.218.241 (steg 2): retning i rangeringen, og nabostoppene etter tilbud.
import { describe, it, expect, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
import { retningsViktig, avgangerPerStopp, knutepunkt } from '../src/views/auto.js';
import { nærViktigFørst } from '../src/api/stops.js';
const T = 1_000_000_000_000;
const I = (avgangerNå, linjer) => ({ moduser: ['bus'], avgangerNå, linjer, plattformer: 1 });
describe('retning i rangeringen', () => {
  it('før-bildet: 10 linjer feil vei slo 2 linjer riktig vei; med retning vinner riktig vei', () => {
    const info = { A: I(40, 10), B: I(8, 2) };
    const stopp = [{ id: 'A', distM: 150 }, { id: 'B', distM: 300 }];
    expect([...stopp].sort(nærViktigFørst(s => info[s.id]))[0].id).toBe('A');
    const telling = new Map([['B', 6]]);   // A: ingenting i retningen
    expect([...stopp].sort(nærViktigFørst(retningsViktig(s => info[s.id], telling)))[0].id).toBe('B');
  });
  it('uten retningsvalg: som før', () => {
    const f = s => I(1, 1);
    expect(retningsViktig(f, null)).toBe(f);
  });
  it('teller kall neste time per stopp, nabostoppets id eller ditt', () => {
    const dirs = [{ calls: [{ ms: T + 60000, call: {} }, { ms: T + 120000, call: { _fra: { id: 'N' } } }, { ms: T + 2 * 3600_000, call: {} }, { ms: T - 1, call: {} }] }];
    const m = avgangerPerStopp(dirs, 'EGET', T);
    expect(m.get('EGET')).toBe(1); expect(m.get('N')).toBe(1);
  });
});
describe('nabostoppene etter tilbud', () => {
  it('før-bildet: nærmeste nabo valgt; nå den med mest tilbud (samme transportmiddel)', () => {
    const stopp = { id: 'S', lat: 59.85, lon: 10.83, modes: ['bus'] };
    const nær = { id: 'N1', lat: 59.8505, lon: 10.83, modes: ['bus'] }, travel = { id: 'N2', lat: 59.851, lon: 10.83, modes: ['bus'] };
    const info = { N1: I(2, 1), N2: I(30, 4) };
    expect(knutepunkt(stopp, [nær, travel], 250, 1, s => info[s.id])[1].id).toBe('N2');
    expect(knutepunkt(stopp, [nær, travel], 250, 1, () => undefined)[1].id).toBe('N1');   // uten info: avstand som før
  });
});
import { ruteTelling } from '../src/views/board.js';
describe('Rute: ruta er retningen (v1.218.242)', () => {
  const iso = m => new Date(T + m * 60000).toISOString();
  const reise = (fra, m, rekk) => ({ _legs: [{ mode: 'bus', expectedStartTime: iso(m), fromPlace: { quay: { stopPlace: { id: fra } } } }], _rekkLengerNed: rekk || null });
  it('rutas avganger per påstigning neste time; «rekk den» teller der den rekkes', () => {
    const m = ruteTelling([reise('A', 5), reise('A', 20), reise('B', 10), reise('A', 90), reise('A', 3, { stopp: { id: 'C' }, ms: T + 4 * 60000 })], 'A', T);
    expect(m.get('A')).toBe(2); expect(m.get('B')).toBe(1); expect(m.get('C')).toBe(1);
    expect(ruteTelling([], 'A', T)).toBe(null);
  });
  it('før-bildet: stoppet med flest linjer (ingen på ruta) vant; nå stoppet ruta går fra', () => {
    const info = { A: I(40, 10), B: I(4, 2) };
    const stopp = [{ id: 'A', distM: 150 }, { id: 'B', distM: 300 }];
    const rt = new Map([['B', 3]]);
    expect([...stopp].sort(nærViktigFørst(retningsViktig(s => info[s.id], rt)))[0].id).toBe('B');
  });
});
