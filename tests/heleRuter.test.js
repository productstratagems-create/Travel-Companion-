// v1.218.112: Auto-tavle — zoomnivået «hele ruter», endestasjonen navngitt.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { nesteFokus, KART_FOKUS, KART_FOKUS_TAVLE, fokusRamme, endeLapper, endeLappHtml, fokusTekst } from '../src/views/auto.js';
import { clk } from '../src/ui/fmt.js';

const T = Date.parse('2026-11-17T19:30:00+01:00');
const st = (n, la, lo) => ({ name: n, id: 'S:' + n, lat: la, lon: lo });
const bein = (kode, ende, ms, ekstra = []) => ({ kode, farge: '#EC700C', modus: 'metro', ms,
  stopp: [st('A', 59.85, 10.83), st('B', 59.86, 10.82)], rester: [[st('B', 59.86, 10.82), ...ekstra, ende]] });

describe('syklusen', () => {
  it('Auto-tavle har fire steg, auto-reise beholder tre', () => {
    expect(KART_FOKUS_TAVLE).toEqual(['oversikt', 'vei', 'spor', 'ruter']);
    expect(nesteFokus('spor', KART_FOKUS_TAVLE)).toBe('ruter');
    expect(nesteFokus('ruter', KART_FOKUS_TAVLE)).toBe('oversikt');
    expect(nesteFokus('spor', KART_FOKUS)).toBe('oversikt');
    expect(fokusTekst('spor', true)).toBe('⤧ hele ruter');
    expect(fokusTekst('spor', false)).toBe('◱ oversikt');
  });
});

describe('rammen', () => {
  it('rommer endestasjonene, stoppet og deg', () => {
    const r = fokusRamme('ruter', { bein: [bein('3', st('Kolsås', 59.95, 10.55), T)], stopp: st('Mortensrud', 59.849, 10.829), du: { lat: 59.85, lon: 10.82 } });
    expect(r.maksZoom).toBe(14);
    expect(r.pts).toContainEqual([59.95, 10.55]);
    expect(r.pts).toContainEqual([59.849, 10.829]);
  });
});

describe('lappen ved endestasjonen', () => {
  it('endestasjonens navn og første avgang du rekker', () => {
    const [g] = endeLapper([bein('3', st('Kolsås', 59.95, 10.55), T + 17 * 60_000)]);
    expect(g.ende.name).toBe('Kolsås');
    const h = endeLappHtml(g);
    expect(h).toContain('Kolsås');
    expect(h).toContain(clk(T + 17 * 60_000));
  });
  it('to linjer til samme endestasjon: én lapp, tidligste først', () => {
    const g = endeLapper([bein('74', st('Jernbanetorget', 59.91, 10.75), T + 20 * 60_000), bein('3', st('Jernbanetorget', 59.91, 10.75), T + 5 * 60_000)]);
    expect(g.length).toBe(1);
    expect(g[0].linjer.map(l => l.kode)).toEqual(['3', '74']);
  });
  it('tiden på lappen er beinets b.ms — første du rekker (catchable)', () => {
    const src = readFileSync('src/views/auto.js', 'utf8');
    expect(src).toMatch(/g\.linjer\.push\(\{ kode: b\.kode, farge: b\.farge, tekst: b\.tekst, linjeId: b\.linjeId, modus: b\.modus, ms: b\.ms \}\)/);
    expect(src).toMatch(/const ruterModus = _autoTavle && _kartFokus === 'ruter';/);
  });
});

import { edderkoppBein } from '../src/views/auto.js';
describe('første du REKKER, ikke første som går', () => {
  it('med 10 min gange står avgangen om 15 på lappen, ikke den om 3', () => {
    const kall = [['Mortensrud', 59.849, 10.829], ['Bøler', 59.884, 10.845], ['Helsfyr', 59.912, 10.80], ['Tøyen', 59.915, 10.77], ['Jernbanetorget', 59.911, 10.75]];
    const tur = (min, id) => {
      const ms = T + min * 60_000;
      return { ms, call: { expectedDepartureTime: new Date(ms).toISOString(), quay: { publicCode: '2' }, serviceJourney: { id,
        estimatedCalls: kall.map(([n, la, lo], i) => ({ quay: { stopPlace: { id: 'S:' + n, name: n, latitude: la, longitude: lo } },
          expectedArrivalTime: new Date(ms + i * 180_000).toISOString() })) } } };
    };
    const c = [tur(3, 'a'), tur(15, 'b')];
    const d = { frontText: 'Jernbanetorget', lines: [{ code: '3', colour: 'EC700C', mode: 'metro', id: 'L3' }], calls: c, call: c[0].call, nextMs: c[0].ms };
    const b = edderkoppBein([d], 'Mortensrud', T, null, 10);
    const [g] = endeLapper(b);
    expect(g.ende.name).toBe('Jernbanetorget');
    expect(g.linjer[0].ms).toBe(T + 15 * 60_000);
  });
});
describe('sammenslåtte bein (v1.218.112)', () => {
  it('hver retning får sin endestasjon navngitt', () => {
    const b = { kode: '3', farge: '#EC700C', ms: T, stopp: [st('A', 59.85, 10.83)],
      rester: [[st('F', 59.86, 10.82), st('Kolsås', 59.95, 10.55)], [st('F', 59.86, 10.82), st('Avløs', 59.92, 10.60)]] };
    expect(endeLapper([b]).map(g => g.ende.name).sort()).toEqual(['Avløs', 'Kolsås']);
  });
});
