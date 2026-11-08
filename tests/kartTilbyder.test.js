// Tilbydersymbolikk i kartene.
// Bestilt: «Integrer symbolikk i kartene slik at bruker gjenkjenner tilbyderne.»
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tilbydereFor, lappMedLogo, MAKS_LOGOER } from '../src/ui/tilbyderlogo.js';

describe('tilbydereFor (linjene ved en holdeplass)', () => {
  it('bare Ruter-linjer → Ruter', () => {
    expect(tilbydereFor(['RUT:Line:74', 'RUT:Line:3']).map(t => t.navn)).toEqual(['Ruter']);
  });
  it('blandet: flest linjer først', () => {
    expect(tilbydereFor(['VYG:Line:R10', 'RUT:Line:3', 'RUT:Line:74', 'RUT:Line:5']).map(t => t.navn)).toEqual(['Ruter', 'Vy']);
    expect(tilbydereFor(['RUT:Line:3', 'VYG:Line:R10', 'VYG:Line:L1', 'VYG:Line:R11']).map(t => t.navn)).toEqual(['Vy', 'Ruter']);
  });
  it('Vy-kodeområdene teller som én tilbyder', () => {
    expect(tilbydereFor(['VYG:Line:R10', 'VYB:Line:1']).map(t => t.navn)).toEqual(['Vy']);
  });
  it('ukjent eller ikke hentet ennå: ingen', () => {
    expect(tilbydereFor(undefined)).toEqual([]);
    expect(tilbydereFor(['FLT:Line:FX'])).toEqual([]);
  });
});

describe('lappMedLogo', () => {
  it('logo foran navnet, Enturs SVG', () => {
    const h = lappMedLogo('Mortensrud · 7 min', ['RUT:Line:74']);
    expect(h).toMatch(/^<span class="lapp-logoer">/);
    expect(h).toContain('aria-label="Ruter"');
    expect(h).toContain('#e60000');
    expect(h.endsWith('Mortensrud · 7 min')).toBe(true);
  });
  it('linjene ukjent: lappen som før', () => {
    expect(lappMedLogo('Mortensrud · 7 min', undefined)).toBe('Mortensrud · 7 min');
  });
  it(`høyst ${2} logoer, så «+N»`, () => {
    expect(MAKS_LOGOER).toBe(2);
    const h = lappMedLogo('Oslo S', ['RUT:Line:1', 'RUT:Line:2', 'VYG:Line:R10', 'SJN:Line:1', 'GOA:Line:1']);
    expect((h.match(/class="lm-logo"/g) || []).length).toBe(2);
    expect(h).toContain('<span class="lapp-flere">+2</span>');
  });
});

describe('koblet inn', () => {
  const auto = readFileSync('src/views/auto.js', 'utf8');
  const board = readFileSync('src/views/board.js', 'utf8');
  it('auto-reise: stoppet og de andre holdeplassene', () => {
    expect(auto).toContain('lappMedLogo(sentrert ? gangLapp(_stop) : _stop.name, stoppLinjer(_stop.id))');
    expect(auto).toContain('lappMedLogo(gangLapp(s), stoppLinjer(s.id))');
  });
  it('Tavla: holdeplassene', () => {
    expect(board).toContain("lappMedLogo(name, stoppLinjer(String(cluster[0].id).split('|')[0]))");
  });
  it('kartnålene i plan og underveis har logo igjen; filteret over Tavla-kartet ikke', () => {
    expect(readFileSync('src/views/plan.js', 'utf8')).not.toMatch(/stil: 'font-size:11px;padding:3px 7px', logo: false/);
    expect(readFileSync('src/views/track.js', 'utf8')).not.toMatch(/stil: 'font-size:13px;padding:4px 9px', logo: false/);
    expect(board).toContain('modus: l.mode, logo: false })');
  });
});
