// Gangen samlet i nedtellingen på avgangsdetaljer.
//
// Rapportert: «834 m · 13 min å gå» øverst, «45 min» midt på og «gå senest
// 19:50 · 45 min igjen» under — spredt, og med minuttene to ganger.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));
import { _subLine } from '../src/views/selected.js';

const NÅ = new Date(2026, 10, 3, 19, 5).getTime();
const GÅ = new Date(2026, 10, 3, 19, 50).getTime();
const AVG = new Date(2026, 10, 3, 20, 3).getTime();

describe('linja under nedtellingen', () => {
  it('gjentar ikke minuttene i det store tallet', () => {
    expect(_subLine('r-ok', 45, GÅ, AVG, NÅ)).toBe('gå senest 19:50');
  });
  it('sier fortsatt det tallet ikke sier', () => {
    expect(_subLine('missed', -3, GÅ, AVG, NÅ)).toContain('passert for');
  });
});

describe('retning og avstand står i nedtellingen', () => {
  const s = readFileSync('src/views/selected.js', 'utf8');
  const hero = s.slice(s.indexOf("'<div class=\"leaveby-hero'"), s.indexOf("'<div class=\"leaveby-hero'") + 500);
  it('rett under «gå senest»', () => {
    expect(hero).toMatch(/_subLine\([^)]*\) \+ '<\/div>'\s*\+ _retningHtml\(dir\)/);
  });
  it('og ikke øverst når nedtellingen vises', () => {
    expect(s).toMatch(/\+ \(heroVises \? '' : _retningHtml\(dir\)\)/);
    expect(s).toMatch(/const heroVises = !departed && walkActive;/);
  });
});
