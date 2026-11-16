import { describe, it, expect } from 'vitest';
import { state } from '../src/state.js';
import { rettLinjeHtml, erBekreftet } from '../src/views/auto.js';

const k = { nøkkel: 'SJ3', linje: '3', front: 'Mortensrud' };
const jny = { dest: 'Mortensrud', legs: [{ journeyId: 'SJ3' }] };

describe('riktig eller feil linje, til det er bekreftet (v1.218.70)', () => {
  it('rapportert: reise startet, låsen gjettet — både «riktig» og «feil»', () => {
    state.jny = jny; state.lockedJourneyId = 'SJ3';
    const h = rettLinjeHtml({ k, kilde: 'gjettet' }, [], false, '');
    expect(h).toContain('rett-ja');
    expect(h).toContain('feil linje?');
    state.jny = null; state.lockedJourneyId = null;
  });
  it('bekreftet: en stille kvittering og «endre», ikke spørsmålet igjen', () => {
    const h = rettLinjeHtml({ k, kilde: 'valgt' }, [], false, '');
    expect(h).not.toContain('rett-ja');
    expect(h).toContain('riktig linje og avgang');
    expect(h).toContain('endre');
  });
  it('åpen liste uten andre kandidater: bare «ingen av disse»', () => {
    const h = rettLinjeHtml({ k, kilde: 'gjettet' }, [k], true, '');
    expect(h).not.toContain('rett-valg');
    expect(h).toContain('ingen av disse');
  });
  it('én definisjon av «bekreftet»', () => {
    expect(erBekreftet({ k, kilde: 'valgt' })).toBe(true);
    expect(erBekreftet({ k, kilde: 'gjettet' })).toBe(false);
    expect(erBekreftet(null)).toBe(false);
  });
});
