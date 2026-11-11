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

import { foldetSide } from '../src/maalModell.js';
import { readFileSync } from 'node:fs';
// Rapportert: på Mortensrud en helg kl. 11 gir «fra sentrum» ikke mening.
describe('retningsgruppen som foldes', () => {
  const SØNDAG_11 = L(8, 11), MANDAG_8 = L(9, 8), MANDAG_16 = L(9, 16), MANDAG_12 = L(9, 12);
  it('helg dagtid i utkanten: «fra sentrum» foldes', () => {
    expect(foldetSide(SØNDAG_11, MORT, new Set())).toBe('fra');
  });
  it('hverdagsmorgen: «fra sentrum» foldes, ettermiddag: «mot sentrum»', () => {
    expect(foldetSide(MANDAG_8, MORT, new Set())).toBe('fra');
    expect(foldetSide(MANDAG_16, MORT, new Set())).toBe('mot');
  });
  it('nøytralt midt på dagen: ingenting foldes', () => {
    expect(foldetSide(MANDAG_12, MORT, new Set())).toBeNull();
  });
  it('i sentrum: ingenting foldes', () => {
    expect(foldetSide(SØNDAG_11, JBT, new Set())).toBeNull();
  });
  it('ditt eget mål i den retningen nå: ingenting foldes', () => {
    expect(foldetSide(SØNDAG_11, MORT, new Set(['fra']))).toBeNull();
  });
  it('auto-reise folder gruppen og lukker den', () => {
    const s = readFileSync('src/views/auto.js', 'utf8');
    expect(s).toContain('const foldet = grouped ? foldetSide(now, _stop, egneSider, stedType(_herSom(), _profilNå().p)) : null;');
    expect(s).toContain("}).join('') + (iFold ? '</details>' : '')");
  });
});

// Rapportert (v1.218.42): hverdag 17:34 på Mortensrud, som er hjemme, var «mot sentrum» foldet.
describe('mønsteret folder ikke der det alt er oppfylt', () => {
  const ONSDAG_1734 = new Date('2026-11-11T17:34:00').getTime();
  const ONSDAG_0800 = new Date('2026-11-11T08:00:00').getTime();
  it('før-bildet: uten profil folder ettermiddagen «mot»', () => {
    expect(foldetSide(ONSDAG_1734, MORT, new Set())).toBe('mot');
  });
  it('hjemme om ettermiddagen: ingenting foldes', () => {
    expect(foldetSide(ONSDAG_1734, MORT, new Set(), 'hjem')).toBeNull();
  });
  it('på jobb om ettermiddagen: fortsatt «mot» foldet (du skal hjem)', () => {
    expect(foldetSide(ONSDAG_1734, MORT, new Set(), 'jobb')).toBe('mot');
  });
  it('på jobb om morgenen: ingenting foldes; hjemme om morgenen: «fra» foldet', () => {
    expect(foldetSide(ONSDAG_0800, MORT, new Set(), 'jobb')).toBeNull();
    expect(foldetSide(ONSDAG_0800, MORT, new Set(), 'hjem')).toBe('fra');
  });
});
