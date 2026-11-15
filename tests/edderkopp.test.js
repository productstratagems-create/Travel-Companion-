import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { edderkoppBein, EDDERKOPP_STOPP } from '../src/views/auto.js';

const NÅ = Date.parse('2026-11-15T18:16:00+01:00');
const kall = (navn, i) => ({ quay: { stopPlace: { name: navn, id: 'S' + navn, latitude: 59.86 + i * 0.002, longitude: 10.83 } },
  expectedArrivalTime: new Date(NÅ + i * 120000).toISOString() });
const retning = (front, kode, om, n) => {
  const sjc = [kall('Mortensrud', 0)];
  for (let i = 1; i <= n; i++) sjc.push(kall(front + i, i));
  return { frontText: front, nextMs: NÅ + om * 60000, lines: [{ code: kode, colour: 'E60000', id: 'RUT:Line:' + kode, mode: 'metro' }],
    call: { serviceJourney: { line: { id: 'RUT:Line:' + kode, transportMode: 'metro' }, estimatedCalls: sjc } } };
};

describe('edderkoppkartet i auto-reise (v1.218.61)', () => {
  const dirs = [retning('Ellingsrudåsen', '2', 9, 10), retning('Kolsås', '3', 4, 12), retning('Bergkrystallen', '79', 6, 3)];

  it('ett bein per retning, etter neste avgang, uten stoppet du står ved', () => {
    const b = edderkoppBein(dirs, 'Mortensrud', NÅ);
    expect(b.map(x => x.kode)).toEqual(['3', '79', '2']);
    expect(b[0].stopp).toHaveLength(EDDERKOPP_STOPP);
    expect(b[0].stopp.some(s => s.name === 'Mortensrud')).toBe(false);
    expect(b[0].stopp[0].name).toBe('Kolsås1');
  });

  it('hopper over en retning med for få stopp å tegne', () => {
    const b = edderkoppBein([...dirs, retning('Kort', '9', 1, 1)], 'Mortensrud', NÅ);
    expect(b.map(x => x.kode)).not.toContain('9');
  });

  it('den foretrukne retningen (kortet) først', () => {
    expect(edderkoppBein(dirs, 'Mortensrud', NÅ, 'Ellingsrudåsen')[0].kode).toBe('2');
  });

  it('tegnes bare i utgangskartet', () => {
    const s = fs.readFileSync('src/views/auto.js', 'utf8');
    expect(s).toMatch(/const bein = sentrert && _stop \? edderkoppBein\(/);
  });
});
