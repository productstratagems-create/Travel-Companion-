// v1.218.167: gjentakende reiser i reiseplanen.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { nesteGjentak, gjentakTekst, gjentakByday, gjeldende, FORHÅNDSVALG } from '../src/api/gjentak.js';
import { legStatus, savePlan, loadPlanNå, settGjentak, clearPlan } from '../src/api/plan.js';

const kl = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime();   // nov 2026: 20 = fredag, 23 = mandag
const LEG = { id: 'l1', line: '72', depIso: new Date(kl(19, 8, 47)).toISOString(), arrIso: new Date(kl(19, 9, 14)).toISOString(), gjentak: { dager: FORHÅNDSVALG.hverdager } };

describe('neste forekomst', () => {
  it('fredag kveld, hverdager → mandag 08:47', () => {
    expect(nesteGjentak(LEG, kl(20, 21))).toEqual({ dep: kl(23, 8, 47), arr: kl(23, 9, 14) });
  });
  it('i dag før avgang → i dag', () => {
    expect(nesteGjentak(LEG, kl(20, 7)).dep).toBe(kl(20, 8, 47));
  });
  it('under turen → den pågående', () => {
    expect(nesteGjentak(LEG, kl(20, 9)).dep).toBe(kl(20, 8, 47));
  });
  it('helg: lørdag', () => {
    expect(nesteGjentak({ ...LEG, gjentak: { dager: [0, 6] } }, kl(20, 10)).dep).toBe(kl(21, 8, 47));
  });
  it('uten gjentakelse: null', () => {
    expect(nesteGjentak({ ...LEG, gjentak: null }, kl(20, 10))).toBe(null);
  });
});

describe('tekst og kalender', () => {
  it('forhåndsvalgene har navn, ellers ukedagene', () => {
    expect(gjentakTekst([1, 2, 3, 4, 5])).toBe('hverdager');
    expect(gjentakTekst([0, 6])).toBe('helg');
    expect(gjentakTekst([0, 1, 2, 3, 4, 5, 6])).toBe('hver dag');
    expect(gjentakTekst([1, 3, 5])).toBe('man, ons, fre');
  });
  it('BYDAY mandag først', () => { expect(gjentakByday([0, 1, 5])).toBe('MO,FR,SU'); });
  it('kalenderfila får RRULE når etappen gjentas', () => {
    expect(readFileSync('src/api/ics.js', 'utf8')).toMatch(/'RRULE:FREQ=WEEKLY;BYDAY=' \+ gjentakByday\(leg\.gjentak\.dager\)/);
  });
});

describe('status og planen', () => {
  it('en gjentakende etappe er aldri ferdig', () => {
    expect(legStatus(LEG, kl(20, 21))).toBe('done');                 // som enkelt avgang
    expect(legStatus(gjeldende(LEG, kl(20, 21)), kl(20, 21))).toBe('future');
  });
  it('planen leses på neste forekomst, og gjentakelsen kan settes og fjernes', () => {
    savePlan([{ ...LEG, gjentak: undefined }]);
    settGjentak('l1', [1, 2, 3, 4, 5]);
    expect(loadPlanNå(kl(20, 21))[0].depIso).toBe(new Date(kl(23, 8, 47)).toISOString());
    settGjentak('l1', null);
    expect(loadPlanNå(kl(20, 21))[0].gjentak).toBe(undefined);
    clearPlan();
  });
  it('trykk åpner neste forekomst gjennom favorittenes dør', () => {
    expect(readFileSync('src/views/plan.js', 'utf8')).toMatch(/window\._åpneFavAvgang = \{ fav: \{ line: leg\.line, departureHHMM:/);
  });
});

describe('knappene i hjørnet har luft (v1.218.168)', () => {
  it('↻, 🔔 og × med 2,8rem mellom, og innholdet under raden', () => {
    const c = readFileSync('src/style/plan.css', 'utf8');
    expect(c).toMatch(/\.plan-leg-cal \{ top: \.4rem; right: 3\.2rem; \}/);
    expect(c).toMatch(/\.plan-leg-gjenta \{ top: \.3rem; right: 6rem; \}/);
    expect(c).toMatch(/\.plan-leg-card \{ padding-top: 2\.2rem; \}/);
  });
});
