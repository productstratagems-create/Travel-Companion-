// Rapportert (skjermbilde): med en startet reise og en lås «bekreftet av deg» sto «DU ER PÅ EN AV
// DISSE» (2, 3, 4) øverst. «Ikke spør bruker om noe du allerede har svar på.» (v1.218.53)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { trengerSvar, rettLinjeHtml } from '../src/views/auto.js';
import { state } from '../src/state.js';

const k = { nøkkel: 'SJ3', linje: '3' };
const jny = { dest: 'Jernbanetorget', lineCode: '3', legs: [{ journeyId: 'SJ3' }] };

describe('ikke spør om det appen alt vet', () => {
  it('uten lås og uten reise: spør', () => {
    expect(trengerSvar(null, null, null)).toBe(true);
    expect(trengerSvar({ k, kilde: 'gjettet' }, null, null)).toBe(true);
  });
  it('låst av deg: ikke spør', () => {
    expect(trengerSvar({ k, kilde: 'valgt' }, null, null)).toBe(false);
  });
  it('reisen er låsens tur: ikke spør, selv om låsen var gjettet', () => {
    expect(trengerSvar({ k, kilde: 'gjettet' }, jny, 'SJ3')).toBe(false);
  });
  it('en reise på en annen tur gjør ikke spørsmålet unødvendig', () => {
    expect(trengerSvar({ k, kilde: 'gjettet' }, { ...jny, legs: [{ journeyId: 'ANNEN' }] }, 'ANNEN')).toBe(true);
  });
  it('«stemmer» vises ikke for reisens tur; kvitteringen er «din reise»', () => {
    state.jny = jny; state.lockedJourneyId = 'SJ3';
    const h = rettLinjeHtml({ k, kilde: 'gjettet' }, [], false, '');
    expect(h).not.toContain('rett-ja');
    expect(h).toContain('din reise');
    expect(h).toContain('feil linje?');
    state.jny = null; state.lockedJourneyId = null;
  });
  it('koblingen: tilbudet og låsen leser reisen', () => {
    const s = readFileSync('src/views/auto.js', 'utf8');
    expect(s).toMatch(/const html = trengerSvar\(_lås, state\.jny, state\.lockedJourneyId\) \? ombordKortHtml\(dom, nå\) : '';/);
    expect(s).toMatch(/if \(k\) _lås = \{ k, kilde: 'valgt', stilleFra: null \};/);
  });
});
