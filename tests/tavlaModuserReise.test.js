// v1.218.94 «Finner ikke buss til Helsfyr gjennom velg rute»: reisesøket spurte
// alltid om alle transportmidler, så tolv T-banesvar fortrengte bussen.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tripGQL, transportModesGql } from '../src/api/queries.js';

const q = (moduser, coach = false) =>
  tripGQL('NSR:StopPlace:1', 'NSR:StopPlace:2', null, 12, 1.3, Date.now(), false, false, coach,
    false, false, false, false, false, moduser);
const moduser = s => s.match(/transportModes:\[(.*?)\]/)[1].match(/transportMode:(\w+)/g).map(x => x.split(':')[1]);

describe('reisesøket følger tavlas transportmidler', () => {
  it('bare buss gir et søk med bare buss', () => {
    expect(moduser(q(['bus']))).toEqual(['bus']);
  });
  it('uten valg: alle, som før', () => {
    expect(moduser(q(undefined))).toEqual(['metro', 'bus', 'tram', 'rail', 'water']);
    expect(moduser(q([]))).toEqual(['metro', 'bus', 'tram', 'rail', 'water']);
  });
  it('bussekspress følger buss', () => {
    expect(moduser(q(['bus'], true))).toEqual(['bus', 'coach']);
    expect(moduser(q(['metro'], true))).toEqual(['metro']);
    expect(transportModesGql(null, true)).toContain('coach');
  });
  it('ukjente navn slipper ikke gjennom', () => {
    expect(moduser(q(['bus', 'sykkel']))).toEqual(['bus']);
  });
  it('fetchTrip og sidevisningen sender tavlas valg', () => {
    const src = readFileSync('src/api/entur.js', 'utf8');
    expect(src).toContain('modusSøk(tavlaModuser())'); expect((src.match(/withIder, mod\)/g) || []).length).toBe(2); expect(src).toContain('..._tripFlagg(), mod)');
  });
  it('et trykk i filteret spør på nytt', () => {
    const src = readFileSync('src/views/board.js', 'utf8');
    const i = src.indexOf('saveModes(m);');
    expect(src.slice(i, i + 400)).toContain('refreshBoard()');
  });
});

import { modusSøk, bareBane } from '../src/api/entur.js';
describe('både buss og bane (v1.218.95)', () => {
  const svar = (...modi) => ({ data: { trip: { tripPatterns: modi.map(m => ({ legs: [{ mode: 'foot' }, { mode: m }] })) } } });
  it('bane med noe annet gir et tilleggssøk uten bane', () => {
    expect(modusSøk(['metro', 'tram', 'bus', 'rail', 'water'])).toEqual([['metro', 'tram', 'bus', 'rail', 'water'], ['tram', 'bus', 'water']]);
    expect(modusSøk(['bus'])).toEqual([['bus']]);
    expect(modusSøk(['metro'])).toEqual([['metro']]);
  });
  it('tillegget trengs bare når bane fyller hele svaret', () => {
    expect(bareBane(svar('metro', 'metro'))).toBe(true);
    expect(bareBane(svar('metro', 'bus'))).toBe(false);
    expect(bareBane(svar())).toBe(false);
    expect(bareBane({ data: { trip: { tripPatterns: [{ duration: 1 }] } } })).toBe(false);
  });
});
