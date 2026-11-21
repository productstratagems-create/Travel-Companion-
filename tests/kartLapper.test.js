// v1.218.222: «krevende å forstå hva lappene med linje/rutenummer i kartet betyr».
import { describe, it, expect, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
import { readFileSync } from 'node:fs';
import { valgtLappHtml, stoppLinjerLapp, EDD_DEMPET } from '../src/views/auto.js';
const T = Date.parse('2026-11-21T19:20:00+01:00');
const b = (kode, min, front) => ({ kode, ms: T + min * 60000, front, farge: '#e60000', modus: 'bus' });
describe('lappene i Auto-kartet', () => {
  it('den valgte linja sier hva den er: linje, mot hvor, framme når', () => {
    const h = valgtLappHtml(b('74', 14, 'Jernbanetorget'), { name: 'Lofsrud', at: T + 15 * 60000 });
    expect(h).toMatch(/mot Jernbanetorget/);
    expect(h).toMatch(/framme Lofsrud \d\d:35/);
  });
  it('ved stoppet: linjene herfra og den førstes «gå om»', () => {
    expect(stoppLinjerLapp([b('76', 18, 'Helsfyr'), b('74', 14, 'Jernbanetorget')], 12, T)).toMatch(/76 · 74 — 74 gå om 2 min/);
    expect(stoppLinjerLapp([], 12, T)).toBe('');
  });
  it('bare den valgte (først) får lapp; de andre dempes', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect(a).toMatch(/const valgt = først;/);
    expect(a).toMatch(/const lapp = valgt && plass && !ruterModus \? valgtLappHtml\(b, e\) : null;/);
    expect(EDD_DEMPET).toBeLessThan(0.5);
  });
});
