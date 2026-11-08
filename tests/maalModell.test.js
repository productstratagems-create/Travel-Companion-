// Hvor du mest sannsynlig skal: ditt mønster blandet med det vanlige.
import { describe, it, expect } from 'vitest';
import { rangerMål, vanligMønster, passerMønster, BLANDING_K } from '../src/maalModell.js';

const L = (dag, hh, mm = 0) => new Date(2026, 10, dag, hh, mm).getTime();   // 9. nov 2026 er mandag
const MORT = { name: 'Mortensrud', id: 'NSR:StopPlace:58228', lat: 59.8494, lon: 10.8294 };
const JBT = { name: 'Jernbanetorget', lat: 59.9119, lon: 10.7504 };    // sentrum
const SKI = { name: 'Ski stasjon', lat: 59.7194, lon: 10.8352 };       // utkanten
const tur = (til, bucket, helg, count, fra = 'Mortensrud') => ({ toName: til, fromName: fra, bucket, isWeekend: helg, count });

describe('det vanlige mønsteret', () => {
  it('hverdagsmorgen mot sentrum, ettermiddag hjemover, helg svakt mot sentrum', () => {
    expect(vanligMønster(L(9, 7, 30)).mot).toBe('sentrum');
    expect(vanligMønster(L(9, 16)).mot).toBe('ut');
    expect(vanligMønster(L(8, 11)).styrke).toBeLessThan(1);      // søndag
    expect(vanligMønster(L(9, 12)).mot).toBeNull();
  });
  it('mot sentrum fra utkanten passer om morgenen', () => {
    expect(passerMønster(JBT, MORT, vanligMønster(L(9, 7)))).toBe(1);
    expect(passerMønster(SKI, MORT, vanligMønster(L(9, 7)))).toBe(0);
  });
});

describe('rangering', () => {
  it('hverdagsmorgen uten egne turer nå: sentrum først', () => {
    const r = rangerMål([SKI, JBT], { nå: L(9, 7, 30), her: MORT, hist: [] });
    expect(r[0].kort.name).toBe('Jernbanetorget');
    expect(r[0].grunn).toBe('hverdagsmorgen: mot sentrum');
  });
  it('ditt mønster slår det vanlige når du har nok turer', () => {
    const hist = [tur('Ski stasjon', 3, false, 8), tur('Jernbanetorget', 3, false, 1)];
    const r = rangerMål([JBT, SKI], { nå: L(9, 7, 30), her: MORT, hist });
    expect(r[0].kort.name).toBe('Ski stasjon');
    expect(r[0].grunn).toBe('du pleier hit mandager rundt nå');
  });
  it('ettermiddag: lenger fra sentrum først', () => {
    expect(rangerMål([JBT, SKI], { nå: L(9, 16), her: MORT, hist: [] })[0].kort.name).toBe('Ski stasjon');
  });
  it('helg: dine helgeturer, ikke hverdagsturene', () => {
    const hist = [tur('Jernbanetorget', 5, false, 20), tur('Ski stasjon', 5, true, 6)];
    expect(rangerMål([JBT, SKI], { nå: L(8, 11), her: MORT, hist })[0].kort.name).toBe('Ski stasjon');
  });
  it('turer på et annet tidspunkt teller ikke', () => {
    const hist = [tur('Ski stasjon', 10, false, 30)];      // kl. 20–22
    expect(rangerMål([SKI, JBT], { nå: L(9, 7, 30), her: MORT, hist })[0].kort.name).toBe('Jernbanetorget');
  });
  it('vekten følger hvor mange turer du har: få gir det vanlige', () => {
    expect(BLANDING_K).toBe(5);
    const r = rangerMål([JBT, SKI], { nå: L(9, 7, 30), her: MORT, hist: [tur('Ski stasjon', 3, false, 1)] });
    expect(r[0].kort.name).toBe('Jernbanetorget');
  });
});
