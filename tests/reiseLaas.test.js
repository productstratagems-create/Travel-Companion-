import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { oppdaterLås, LÅS_STOPP_MS } from '../src/api/ombordLaas.js';

const NÅ = Date.parse('2026-11-17T15:30:00+01:00');
const iso = m => new Date(NÅ + m * 60000).toISOString();
const kall = (navn, m, i) => ({ quay: { stopPlace: { id: 'S' + i, name: navn, latitude: 59.91 - i * 0.01, longitude: 10.75 + i * 0.01 } },
  aimedArrivalTime: iso(m), expectedArrivalTime: iso(m), aimedDepartureTime: iso(m), expectedDepartureTime: iso(m) });
const k = { nøkkel: 'SJ', linje: '3', call: { serviceJourney: { id: 'SJ', estimatedCalls: [kall('Jernbanetorget', -6, 0), kall('Tøyen', -2, 1), kall('Helsfyr', 3, 2), kall('Mortensrud', 19, 3)] } } };

describe('låsen fra en startet reise trenger ikke GPS (v1.218.91)', () => {
  it('slippes ikke fordi du står stille eller posisjonen er gammel', () => {
    const r = oppdaterLås({ k, kilde: 'reise', stilleFra: NÅ - LÅS_STOPP_MS - 60000 }, { nå: NÅ, fartMS: null, spor: [] });
    expect(r.lås && r.lås.kilde).toBe('reise');
  });
  it('slippes ikke fordi et gammelt spor står ved perrongen', () => {
    const spor = [0, 1, 2, 3].map(i => ({ at: NÅ - (3 - i) * 30000, lat: 59.91, lon: 10.75 }));
    const r = oppdaterLås({ k, kilde: 'reise', stilleFra: null }, { nå: NÅ, fartMS: 0, spor, lang: spor });
    expect(r.lås && r.lås.kilde).toBe('reise');
  });
  it('slippes ved endestasjonen, som andre låser', () => {
    const r = oppdaterLås({ k, kilde: 'reise', stilleFra: null }, { nå: NÅ + 30 * 60000, fartMS: null, spor: [] });
    expect(r.lås).toBeNull();
  });
  it('en GPS-lås slippes fortsatt når du står stille', () => {
    const r = oppdaterLås({ k, kilde: 'sikker', stilleFra: NÅ - LÅS_STOPP_MS - 60000 }, { nå: NÅ, fartMS: null, spor: [] });
    expect(r.lås).toBeNull();
  });
  it('auto-reise lager låsen fra reisen, og leser ikke GPS-fiksen for den', () => {
    const s = fs.readFileSync('src/views/auto.js', 'utf8');
    expect(s).toMatch(/if \(kr\) _lås = \{ k: kr, kilde: 'reise', stilleFra: null \};/);
    expect(s).toMatch(/_lås && _lås\.kilde === 'reise' \? null :/);
  });
});
