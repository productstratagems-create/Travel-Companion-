// Enturs tilbyderlogoer ved linjemerket.
// Bestilt: «Ja, bruk Enturs tilbyderlogoer ved linjemerket.» Logoene er Enturs egne
// (@entur/icons 10.1.1), ikke tegnet her.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { linjemerke } from '../src/ui/linjemerke.js';
import { LOGO, logoFor } from '../src/ui/tilbyderlogo.js';

describe('tilbyderlogo', () => {
  it('Ruter: Enturs RuterNoTextIcon, Ruters røde # beholdt', () => {
    const l = logoFor('RUT:Line:74');
    expect(l.ikon).toBe('RuterNoTextIcon');
    expect(l.svg).toContain('#e60000');
  });
  it('Vy, Skyss, AtB, SJ, Go-Ahead har Enturs logo', () => {
    expect(logoFor('VYG:Line:R10').ikon).toBe('VyIcon');
    expect(logoFor('SKY:Line:1').ikon).toBe('SkyssNoTextIcon');
    expect(logoFor('ATB:Line:3').ikon).toBe('AtBIcon');
    expect(logoFor('SJN:Line:1').ikon).toBe('SJNordIcon');
    expect(logoFor('GOA:Line:1').ikon).toBe('GOAIcon');
  });
  it('ingen logo hos Entur (Flytoget) eller ukjent tilbyder: ingen logo', () => {
    expect(logoFor('FLT:Line:FX')).toBe(null);
    expect(logoFor('XYZ:Line:1')).toBe(null);
    expect(logoFor(undefined)).toBe(null);
  });
  it('hvite logoer arver tekstfargen — ellers usynlige i lys modus', () => {
    expect(logoFor('VYG:Line:R10').svg).not.toMatch(/fill="#fff"/i);
    expect(logoFor('VYG:Line:R10').svg).toContain('currentColor');
  });
  it('klippestiene har egne id-er per logo — Enturs bruker alle «a»', () => {
    const ider = Object.values(LOGO).flatMap(l => [...l.svg.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
    expect(new Set(ider).size).toBe(ider.length);
    Object.values(LOGO).forEach(l => expect(l.svg).not.toContain('url(#a)'));
  });
});

describe('ved linjemerket', () => {
  it('logoen står ved merket, med tilbydernavnet for skjermleser', () => {
    const h = linjemerke({ kode: '74', farge: 'E60000', tekst: 'FFFFFF', linjeId: 'RUT:Line:74', modus: 'bus' });
    expect(h).toMatch(/^<span class="lm-par"><span class="line-badge lm"/);
    expect(h).toContain('<span class="lm-logo" role="img" aria-label="Ruter" title="Ruter"');
  });
  it('uten logo: bare merket, som før', () => {
    expect(linjemerke({ kode: 'FX', linjeId: 'FLT:Line:FX', modus: 'rail' })).toMatch(/^<span class="line-badge lm"/);
  });
  it('kan slås av der det er trangt (kartnåler)', () => {
    expect(linjemerke({ kode: '74', linjeId: 'RUT:Line:74', modus: 'bus', logo: false })).not.toContain('lm-logo');
  });
  it('kartnålene slår den av', () => {
    expect(readFileSync('src/views/plan.js', 'utf8')).toMatch(/stil: 'font-size:11px;padding:3px 7px', logo: false/);
    expect(readFileSync('src/views/track.js', 'utf8')).toMatch(/stil: 'font-size:13px;padding:4px 9px', logo: false/);
  });
});

describe('linjefilteret over Tavla-kartet', () => {
  it('uten logo — med logo brakk det til to rader over kartet (sett i proben)', () => {
    expect(readFileSync('src/views/board.js', 'utf8')).toContain('linjeId: l.id, modus: l.mode, logo: false })');
  });
});
