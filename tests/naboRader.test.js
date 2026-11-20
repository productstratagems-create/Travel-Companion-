// v1.218.183: nabostoppenes avganger som rader i Rute-lista.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { naboKandidater, naboRaderFra, naboTekst } from '../src/naboRader.js';

const S = (id, name, lat) => ({ id: 'NSR:StopPlace:' + id, name, lat, lon: 10.8 });
const STOPP = [S('Mrud', 'Mortensrud', 1), S('Kant', 'Kantarellen', 2), S('Sten', 'Stenbråten', 3), S('Langt', 'Langt unna', 4)];
const gang = s => ({ 1: 12, 2: 13, 3: 10, 4: 40 })[s.lat];

describe('naboKandidater', () => {
  it('nær nok, ikke rutas eget stopp, nærmeste først', () => {
    expect(naboKandidater(STOPP, { id: 'NSR:StopPlace:Mrud', name: 'Mortensrud' }, gang, 12).map(k => k.name))
      .toEqual(['Stenbråten', 'Kantarellen']);
  });
  it('lenger enn egen gang + 5 min: ikke med', () => {
    expect(naboKandidater(STOPP, { id: 'NSR:StopPlace:Mrud' }, gang, 5).map(k => k.name)).toEqual(['Stenbråten']);
  });
});

const rad = (fraId, fraNavn, jid, gåTil = null) => ({ serviceJourney: { id: jid }, _gåTil: gåTil,
  _legs: [{ mode: 'bus', fromPlace: { name: fraNavn, quay: { stopPlace: { id: 'NSR:StopPlace:' + fraId } } } }] });
const KANT = { id: 'NSR:StopPlace:Kant', name: 'Kantarellen', lat: 2, lon: 10.8, gangMin: 13 };

describe('naboRaderFra', () => {
  it('bare reiser som går fra nabostoppet, merket med det', () => {
    const ut = naboRaderFra([rad('Kant', 'Kantarellen', 'a'), rad('Annet', 'Annet', 'b'), rad('Kant', 'Kantarellen', 'c', { navn: 'X' })], KANT, []);
    expect(ut.map(c => c.serviceJourney.id)).toEqual(['a']);
    expect(naboTekst(ut[0])).toBe('fra Kantarellen · 13 min å gå');
  });
  it('en tur du alt ser fra ditt stopp, kommer ikke to ganger', () => {
    expect(naboRaderFra([rad('Kant', 'Kantarellen', 'a')], KANT, ['a'])).toEqual([]);
  });
});

describe('koblingen', () => {
  const b = readFileSync('src/views/board.js', 'utf8');
  it('som rader i lista, med teksten på raden — ikke en boks', () => {
    expect(b).toMatch(/state\.deps = nabo\.length \? egne\.concat\(nabo\) : egne;/);
    expect(b).toMatch(/naboTekst\(c\) \? '<div class="dep-gaa dep-nabo">'/);
  });
  it('rekker regnes med gangen til nabostoppet, i rekkeFor (stripa, raden, detaljene)', () => {
    expect(b).toMatch(/if \(c && c\._fra && Number\.isFinite\(c\._fra\.gangMin\)\) \{\s*const m = minsToLeave\(påstigningTs\(c\), c\._fra\.gangMin, Date\.now\(\)\);/);
  });
});
