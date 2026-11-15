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

import { slåSammenBein, lappRetning, lappFronter, LAPP_TEGN } from '../src/views/auto.js';

describe('lappene i edderkoppnettet (v1.218.62)', () => {
  const st = (...ids) => ids.map(id => ({ id, name: id, lat: 1, lon: 1 }));
  const b = (kode, front, ms, stopp) => ({ kode, linjeId: 'L' + kode, front, ms, stopp, dir: { f: front } });

  it('samme linje i samme korridor blir ett bein, med alle retninger og tidligste tid', () => {
    const ut = [b('3', 'Stortinget', 9, st('A', 'B', 'C')), b('3', 'Kolsås', 4, st('A', 'B', 'C', 'D')),
      b('74', 'Jernbanetorget', 6, st('A', 'B')), b('3', 'Avløs', 12, st('A', 'B'))].reduce(slåSammenBein, []);
    expect(ut).toHaveLength(2);
    expect(ut[0].fronter).toEqual(['Stortinget', 'Kolsås', 'Avløs']);
    expect(ut[0].ms).toBe(4);
    expect(ut[0].dir.f).toBe('Kolsås');
    expect(ut[0].stopp).toHaveLength(4);
  });

  it('samme linje i motsatt retning forblir to bein', () => {
    const ut = [b('3', 'Kolsås', 4, st('A', 'B')), b('3', 'Mortensrud', 5, st('X', 'Y'))].reduce(slåSammenBein, []);
    expect(ut).toHaveLength(2);
  });

  it('lappen står utover fra stoppet', () => {
    const o = { x: 100, y: 100 };
    expect(lappRetning(o, { x: 100, y: 20 })).toBe('top');
    expect(lappRetning(o, { x: 100, y: 180 })).toBe('bottom');
    expect(lappRetning(o, { x: 190, y: 110 })).toBe('right');
    expect(lappRetning(o, { x: 10, y: 90 })).toBe('left');
  });

  it('retningsteksten avkortes', () => {
    expect(lappFronter(['Kolsås'])).toBe('Kolsås');
    const t = lappFronter(['Kolsås', 'Stortinget', 'Avløs']);
    expect(t.length).toBeLessThanOrEqual(LAPP_TEGN);
    expect(t.endsWith('…')).toBe(true);
    expect(t).not.toMatch(/·…$/);
  });
});
