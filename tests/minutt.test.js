/**
 * Ett minuttall på skjermen, og én dom om når du skal av.
 *
 * Rapportert fra en ekte tur, med to ting ringet rundt:
 *
 *   0 MIN TIL ANKOMST
 *   08:44 ANKOMMER JERNBANETORGET
 *     GÅ AV NÅ  Jernbanetorget            ← ringet
 *     fra Mortensrud     1 stopp igjen    ← ringet
 *     STÅ AV Jernbanetorget  08:44  om 1 min
 *
 * SAMME ØYEBLIKK ER BÅDE 0 OG 1 MINUTT. Helten regnet med `Math.floor` og
 * stopp-raden med `Math.round`, så 50 sekunder ble «0 MIN» det ene stedet og
 * «om 1 min» det andre — om den SAMME ankomsten.
 *
 * Fem kallesteder, to definisjoner, ingen av dem navngitt. Signaturfeilen i
 * denne kodebasen, og `alight.js` sin egen innledning beskriver den som
 * grunnen til at modulen ble skrevet.
 *
 * TO TALL ER RIKTIG — de svarer på ulike spørsmål. «Hvor lenge til» leses
 * som et tall og skal avrundes. «Bør du reise deg» er en handling, og skal
 * utløses tidlig. Feilen var at ingen av dem hadde et navn, og at begge ble
 * skrevet på skjermen som om de var det samme.
 */
import { describe, it, expect } from 'vitest';
import { visteMinutter, minutterIgjen, erFramme } from '../src/api/alight.js';

const NÅ = Date.parse('2026-10-21T08:43:10Z');
const ANKOMST = Date.parse('2026-10-21T08:44:00Z');   // 50 sekunder igjen

describe('det rapporterte øyeblikket', () => {
  // FØR-BILDET: med 50 sekunder igjen sa helten 0 og raden 1.
  it('gir ett tall til skjermen, ikke to', () => {
    expect(visteMinutter(ANKOMST, NÅ)).toBe(1);
  });

  // Og handlingen utløses likevel — den regner på sekunder, ikke på tallet
  // som vises.
  it('og sier likevel at du skal av', () => {
    expect(erFramme(ANKOMST, NÅ)).toBe(true);
  });
});

describe('visteMinutter — det som står som tekst', () => {
  const om = (sek) => visteMinutter(NÅ + sek * 1000, NÅ);

  it('runder av', () => {
    expect(om(50)).toBe(1);
    expect(om(29)).toBe(0);
    expect(om(31)).toBe(1);
    expect(om(90)).toBe(2);
  });

  it('er null når tiden er ute', () => {
    expect(om(0)).toBe(0);
    expect(om(-120)).toBe(-2);
  });

  it('sier ikke noe når det ikke er noe å si', () => {
    expect(visteMinutter(null, NÅ)).toBe(null);
    expect(visteMinutter(undefined, NÅ)).toBe(null);
  });
});

describe('minutterIgjen — det som er en terskel', () => {
  const om = (sek) => minutterIgjen(NÅ + sek * 1000, NÅ);

  // Runder NED, og det er med vilje: en terskel skal slå inn tidlig.
  it('runder ned', () => {
    expect(om(50)).toBe(0);
    expect(om(119)).toBe(1);
    expect(om(120)).toBe(2);
  });

  it('sier ikke noe når det ikke er noe å si', () => {
    expect(minutterIgjen(null, NÅ)).toBe(null);
  });
});

/**
 * Og terskelen er IKKE flyttet.
 *
 * `alight.js` sier selv at kortets tidspunkt er «behaviour this sandbox
 * cannot validate against a real ride». Det står urørt: i dag utløses det
 * når `floor(...) <= 0`, altså under 60 sekunder igjen.
 */
describe('erFramme — nøyaktig der kortet alltid har kommet', () => {
  const om = (sek) => erFramme(NÅ + sek * 1000, NÅ);

  it('slår inn under ett minutt', () => {
    expect(om(59)).toBe(true);
    expect(om(1)).toBe(true);
    expect(om(0)).toBe(true);
  });

  it('og ikke før', () => {
    expect(om(60)).toBe(false);
    expect(om(61)).toBe(false);
    expect(om(300)).toBe(false);
  });

  // Den regner på sekunder, ikke på det viste tallet. Gjorde den det siste,
  // ville den slått inn ved 30 sekunder i stedet for 60.
  it('regner ikke på minuttene som vises', () => {
    expect(om(45)).toBe(true);          // viste minutter ville vært 1
    expect(visteMinutter(NÅ + 45000, NÅ)).toBe(1);
  });

  it('tåler at tiden mangler', () => {
    expect(erFramme(null, NÅ)).toBe(false);
  });
});
