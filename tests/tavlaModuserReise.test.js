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
    expect((src.match(/tavlaModuser\(\)\)/g) || []).length).toBeGreaterThanOrEqual(3);
  });
  it('et trykk i filteret spør på nytt', () => {
    const src = readFileSync('src/views/board.js', 'utf8');
    const i = src.indexOf('saveModes(m);');
    expect(src.slice(i, i + 400)).toContain('refreshBoard()');
  });
});
