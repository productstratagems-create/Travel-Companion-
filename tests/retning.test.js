/**
 * Hvilken vei, og hvor langt, til stoppet du skal gå på. Issue #397 punkt c.
 *
 * Kartet på avgangsdetaljer er 130 px, og det tallet er en MÅLING: v1.103.1
 * krympet det så «reis» klarerer bunnmenyen. Men 130 px ligger under grensen
 * der `stopsReadable` beholder noen stopp-punkter i det hele tatt, så kartet
 * er én strek og to etiketter. Høyden kan ikke økes uten å kaste målingen.
 *
 * Svaret kartet ikke klarer å gi, gis med ord og en pil i stedet.
 *
 * OG REGELEN LIGGER HER, IKKE I EN NETTLESERPRØVE. Første forsøk prøvde å
 * måle dette i nettleseren, og prøven meldte «vet ikke hvor du er» i ALLE
 * tilfeller — også der posisjonen var sådd — fordi `state.statLL` fylles av
 * tavla, og prøven aldri laster en tavle. Et grønt «ingen pil» så ut som et
 * svar. Instrumentet målte ingenting.
 */
import { describe, it, expect } from 'vitest';
import { retningInfo } from '../src/views/selected.js';

const HER = { lat: 59.9109, lon: 10.7522 };          // Oslo S
const NORD = { lat: 59.9200, lon: 10.7522 };          // rett nord
const OEST = { lat: 59.9109, lon: 10.8200 };          // rett øst
const SOER = { lat: 59.9000, lon: 10.7522 };          // rett sør
const GANGE = { mins: 7, dist: 480, src: 'beregnet' };

describe('retningen', () => {
  // FASIT SOM KAN AVGJØRES: nord er 0 grader, øst 90, sør 180. Uten et
  // tilfelle med kjent svar kan «peker den riktig vei» ikke prøves.
  it('peker rett opp mot et stopp rett nord', () => {
    const r = retningInfo(HER, NORD, GANGE);
    expect(r.kind).toBe('retning');
    expect(Math.round(r.deg)).toBe(0);
  });

  it('peker mot høyre mot et stopp rett øst', () => {
    expect(Math.round(retningInfo(HER, OEST, GANGE).deg)).toBe(90);
  });

  it('peker ned mot et stopp rett sør', () => {
    expect(Math.round(retningInfo(HER, SOER, GANGE).deg)).toBe(180);
  });

  it('bærer med seg avstanden og gangtiden', () => {
    expect(retningInfo(HER, NORD, GANGE)).toMatchObject({ dist: 480, mins: 7 });
  });
});

/**
 * SI HVA DU IKKE VET.
 *
 * En pil som peker nordover fordi den ikke vet bedre er verre enn ingen pil:
 * den ser like sikker ut som en riktig pil.
 */
describe('når den ikke vet', () => {
  it('uten posisjon: ingen pil', () => {
    expect(retningInfo(null, NORD, GANGE).kind).toBe('ukjent');
  });

  it('uten stoppets koordinater: ingen pil', () => {
    expect(retningInfo(HER, null, GANGE).kind).toBe('ukjent');
    expect(retningInfo(HER, { lat: null, lon: null }, GANGE).kind).toBe('ukjent');
    expect(retningInfo(HER, { name: 'Mortensrud' }, GANGE).kind).toBe('ukjent');
  });

  // Faller punktene sammen, finnes ingen retning — og pila ville pekt et
  // tilfeldig sted. Da er «du står ved stoppet» det ærlige svaret.
  it('oppå stoppet: ingen pil, men en annen setning', () => {
    const r = retningInfo(HER, { ...HER }, GANGE);
    expect(r.kind).toBe('ved');
    expect(r.deg).toBeUndefined();
  });

  it('uten gangtid: ingen påstand om avstand', () => {
    expect(retningInfo(HER, NORD, null).kind).toBe('ved');
    expect(retningInfo(HER, NORD, { mins: 7 }).kind).toBe('ved');
  });

  it('og de tre tilstandene er ulike setninger', () => {
    const k = [retningInfo(null, NORD, GANGE), retningInfo(HER, { ...HER }, GANGE),
      retningInfo(HER, NORD, GANGE)].map(r => r.kind);
    expect(new Set(k).size).toBe(3);
  });
});

/**
 * Og at skjermen bruker den ene gangtiden.
 *
 * Kildetest: `_retningHtml` tegnes ikke av noen enhetstest her. Det den
 * binder er at tallet kommer fra `walkInfo()` — som håndterer `state.walkOvr`,
 * den manuelle overstyringen. Første utgave kalte `walkMinsTo` direkte og
 * gikk utenom den, så leseren som hadde satt gangtiden sin selv ville fått
 * to ulike tall på samme skjerm.
 */
describe('gangtiden har én kilde', () => {
  const src = () => require('node:fs')
    .readFileSync('src/views/selected.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('kommer fra walkInfo, ikke fra en ny utregning', () => {
    const s = src();
    const i = s.indexOf('function _retningHtml');
    const kropp = s.slice(i, s.indexOf('\n}', i));
    expect(kropp).toMatch(/walkInfo\(\)/);
    expect(kropp).not.toMatch(/walkMinsTo/);
  });
});
