// v1.218.105: «At bruker har trykket på et kort i auto-reise eller lagt inn en
// reiserute i Tavla er ikke det samme som at bruker har reist den ruta.»
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { storage } from '../src/storage.js';
import { nullstillVaneTelling, loadSmartHist, registrerReise, tripCount, VANE_TELLING } from '../src/api/smart.js';
import { målSpørsmål } from '../src/intervju.js';

describe('tre ting med tre navn', () => {
  beforeEach(() => { storage.set('t.smartHist', ''); storage.set('t.vaneTelling', VANE_TELLING); });
  it('«på» er startet, ikke reist', () => {
    registrerReise({ nivå: 'startet', fra: 'Mortensrud', til: 'Helsfyr' });
    expect(tripCount('Mortensrud', 'Helsfyr')).toBe(0);
    expect(loadSmartHist()[0].startet).toBe(1);
  });
  it('en bekreftet reise teller', () => {
    registrerReise({ fra: 'Mortensrud', til: 'Helsfyr' });
    expect(tripCount('Mortensrud', 'Helsfyr')).toBe(1);
  });
  it('doBoard og joinJourney teller startet', () => {
    const src = readFileSync('src/journey.js', 'utf8');
    expect((src.match(/registrerReise\(\{ nivå: 'startet'/g) || []).length).toBe(2);
  });
  it('et valg (kort, rute) heter valgt, ikke reist', () => {
    const src = readFileSync('src/views/auto.js', 'utf8');
    expect(src).toMatch(/uses >= 3 \? 'ofte valgt herfra' : 'valgt før'/);
    expect(src).not.toMatch(/'reist dit før'/);
  });
  it('intervjuet spør om startede reiser og sier hvor mange av hvert', () => {
    registrerReise({ nivå: 'startet', fra: 'Mortensrud', til: 'Helsfyr' });
    registrerReise({ nivå: 'startet', fra: 'Mortensrud', til: 'Helsfyr' });
    const q = målSpørsmål(loadSmartHist(), Date.now(), () => 0);
    expect(q[0].grunn).toBe('2 startet');
  });
});

describe('gamle tall var «på»-trykk', () => {
  it('flyttes til startet; ingenting slettes', () => {
    storage.set('t.vaneTelling', '2');
    storage.set('t.smartHist', JSON.stringify([{ key: 'helsfyr|9|wd', fromName: 'Mortensrud', toName: 'Helsfyr', bucket: 9, isWeekend: false, count: 4, lastUsed: Date.now() }]));
    nullstillVaneTelling();
    const r = loadSmartHist()[0];
    expect(r.count).toBe(0);
    expect(r.startet).toBe(4);
    expect(storage.get('t.vaneTelling')).toBe('3');
  });
});
