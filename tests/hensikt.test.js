import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { hensikt, hensiktLinje, sammeTur } from '../src/hensikt.js';
import { clk } from '../src/ui/fmt.js';

const NÅ = Date.parse('2026-11-17T06:27:00+01:00');
const iso = min => new Date(NÅ + min * 60000).toISOString();
const jny = { dest: 'Jernbanetorget', lineCode: '3', arrival: { time: iso(52), clk: '07:19' },
  legs: [{ lineCode: '3', quay: '1', depTime: { time: iso(26) }, journeyId: 'RUT:ServiceJourney:3-1' }] };
const route = { from: 'Mortensrud', to: 'Jernbanetorget', toStopId: 'NSR:StopPlace:3990' };

describe('hensikten: tavlas valg i auto-reise (v1.218.85)', () => {
  it('valgt reise slår tavlas mål', () => {
    const h = hensikt(jny, route, NÅ);
    expect(h.styrke).toBe('reise');
    expect(h.mål).toBe('Jernbanetorget');
    expect(h.spor).toBe('1');
    expect(h.avgang).toBe(NÅ + 26 * 60000);
  });
  it('uten reise: tavlas mål; uten noe: ingenting', () => {
    expect(hensikt(null, route, NÅ)).toEqual({ styrke: 'rute', mål: 'Jernbanetorget', målId: 'NSR:StopPlace:3990' });
    expect(hensikt(null, { from: 'Mortensrud' }, NÅ)).toBeNull();
  });
  it('en reise som er framme, gjelder ikke lenger', () => {
    expect(hensikt({ ...jny, arrival: { time: iso(-1) } }, route, NÅ).styrke).toBe('rute');
  });
  it('linja sier avgang, spor, mål og når du må gå — samme regel som lista', () => {
    const t = hensiktLinje(hensikt(jny, route, NÅ), NÅ, NÅ + 14 * 60000);
    expect(t).toBe('din reise: 3 ' + clk(NÅ + 26 * 60000) + ' spor 1 → Jernbanetorget ' + clk(NÅ + 52 * 60000) + ' · gå om 14 min');
    expect(hensiktLinje(hensikt(jny, route, NÅ), NÅ, NÅ - 60000)).toMatch(/rekker ikke$/);
    expect(hensiktLinje(hensikt(null, route, NÅ), NÅ, null)).toBe('til Jernbanetorget fra tavla');
  });
  it('samme tur uansett store og små bokstaver i id-en', () => {
    expect(sammeTur('rut:ServiceJourney:3-1', 'RUT:ServiceJourney:3-1')).toBe(true);
    expect(sammeTur(null, 'x')).toBe(false);
  });
  it('rapportert: auto-reise leser hensikten (før: bare om bord)', () => {
    const s = fs.readFileSync('src/views/auto.js', 'utf8');
    expect(s).toMatch(/hensikt\(state\.jny, state\.route/);
  });
});

import { målLapp, erDinAvgang } from '../src/views/auto.js';
describe('mållapp og din avgang (v1.218.86)', () => {
  it('mållappen har ankomsttid', () => {
    expect(målLapp({ name: 'Jernbanetorget', at: NÅ + 52 * 60000 })).toBe('Jernbanetorget · ' + clk(NÅ + 52 * 60000));
    expect(målLapp({ name: 'Jernbanetorget' })).toBe('Jernbanetorget');
  });
  it('bare raden med tavlas valg er din avgang — ikke vanekortets', () => {
    const d = {}, annen = {};
    expect(erDinAvgang(d, { d, hensikt: 'reise' })).toBe(true);
    expect(erDinAvgang(annen, { d, hensikt: 'reise' })).toBe(false);
    expect(erDinAvgang(d, { d })).toBe(false);
  });
});

describe('én ankomst i hodet og på kartet (v1.218.86)', () => {
  it('hodet bruker turens sanntid når den finnes', () => {
    const s = fs.readFileSync('src/views/auto.js', 'utf8');
    expect(s).toMatch(/ank: m && Number\.isFinite\(m\.at\) \? m\.at : null/);
    expect(s).toMatch(/\{ \.\.\.h0, ank: _kortRute\.ank \}/);
  });
});

import { gyldigRamme } from '../src/views/board.js';
describe('tavlekartet zoomer ikke inn i ingenting (v1.218.86)', () => {
  it('ugyldige eller like punkter gir ingen ramme', () => {
    expect(gyldigRamme([[NaN, 10], [59.9, NaN]])).toBeNull();
    expect(gyldigRamme([[59.9, 10.8], [59.9, 10.8]])).toBeNull();
    expect(gyldigRamme(null)).toBeNull();
  });
  it('to ulike gyldige punkter gir en ramme', () => {
    expect(gyldigRamme([[59.9, 10.8], [NaN, 1], [59.91, 10.81]])).toEqual([[59.9, 10.8], [59.91, 10.81]]);
  });
});

import { stoppBakover } from '../src/views/auto.js';
describe('tilbakelagt strekning om bord (v1.218.88)', () => {
  const k = (n, i) => ({ quay: { stopPlace: { name: n, latitude: 59.85 + i * 0.01, longitude: 10.83 } } });
  const call = { serviceJourney: { estimatedCalls: ['Mortensrud', 'Skullerud', 'Bøler', 'Brynseng', 'Helsfyr', 'Jernbanetorget'].map(k) } };
  it('fra påstigningen til der du er nå', () => {
    expect(stoppBakover(call, 'Mortensrud', 'Brynseng').map(s => s.name)).toEqual(['Mortensrud', 'Skullerud', 'Bøler', 'Brynseng']);
  });
  it('ved påstigningen eller ukjent: ingenting', () => {
    expect(stoppBakover(call, 'Mortensrud', 'Mortensrud')).toEqual([]);
    expect(stoppBakover(call, 'Ukjent', 'Brynseng')).toEqual([]);
    expect(stoppBakover(call, 'Brynseng', 'Bøler')).toEqual([]);
  });
});
